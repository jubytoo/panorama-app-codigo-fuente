# Arranques REALES de Panorama con el Bloque 3, en sandbox aislado.
# Sin caracteres acentuados: PowerShell 5.1 lee este archivo como ANSI.
$ErrorActionPreference = 'Stop'
$sb   = "C:\Users\ADMIN~1.JLO\AppData\Local\Temp\claude\C--Codigo-Fuente-PS\e55d4471-ea3f-4279-b758-0366ccb6384c\scratchpad"
$wrap = "$sb\real-run"
$B3   = "$sb\bloque3"
$ep   = 'C:\Codigo Fuente PS\panorama-app-codigo-fuente_1\node_modules\electron\dist\electron.exe'

$prodDb = Join-Path $env:APPDATA 'panorama-app\panorama.sqlite3'
$antes = (Get-FileHash $prodDb -Algorithm SHA256).Hash

$S = "$B3\sandbox"
Remove-Item $S -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path "$S\Roaming" | Out-Null
New-Item -ItemType Directory -Force -Path "$S\Local" | Out-Null
$UD = "$S\Roaming\panorama-app"
$STG = "$UD\.panorama-rekey"

# Solo se termina el ARBOL del proceso que lanza esta prueba. Antes esto era
# `Get-Process electron | Where Path -eq $ep | Stop-Process`, que se habria
# llevado por delante cualquier otra sesion abierta con el mismo ejecutable.
$script:lineasLog = 0
function Arrancar($segundos) {
  if ($S -notlike '*bloque3\sandbox*') { throw "sandbox inesperado: $S" }
  # Marca del tramo de registro de ESTE arranque: todo lo que venga despues.
  $logPath = Join-Path $UD 'app.log'
  $script:lineasLog = if (Test-Path $logPath) { @(Get-Content $logPath -Encoding UTF8).Count } else { 0 }

  [Environment]::SetEnvironmentVariable('LOCALAPPDATA', "$S\Local", 'Process')
  [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process')
  $p = Start-Process -FilePath $ep -ArgumentList "`"$wrap`"","--sandbox=$S","--modo=nada" -PassThru -WindowStyle Minimized
  $mio = $p.Id
  Start-Sleep -Seconds $segundos
  if (-not $p.HasExited) {
    # /T cierra el arbol (los procesos hijos de Electron), /F sin preguntar.
    & taskkill.exe /PID $mio /T /F 2>&1 | Out-Null
  }
  Start-Sleep -Seconds 2
  # Red de seguridad, tambien acotada al arbol de ESE pid.
  try { if (Get-Process -Id $mio -ErrorAction SilentlyContinue) { & taskkill.exe /PID $mio /T /F 2>&1 | Out-Null } } catch {}
}

# Devuelve SOLO el tramo de registro producido por el ultimo arranque.
function TramoLog() {
  $logPath = Join-Path $UD 'app.log'
  if (-not (Test-Path $logPath)) { return @() }
  $todo = @(Get-Content $logPath -Encoding UTF8)
  if ($todo.Count -le $script:lineasLog) { return @() }
  return $todo[$script:lineasLog..($todo.Count - 1)]
}

function LogA33($titulo) {
  Write-Output ""
  Write-Output "--- $titulo (SOLO el tramo de este arranque) ---"
  $tramo = TramoLog
  if ($tramo.Count -eq 0) { Write-Output "    (ninguna linea nueva)"; return }
  $tramo | Where-Object { $_ -match 'A3\.3|ERROR|Seguridad' } | ForEach-Object { "    $_" }
}

# Busca un patron SOLO dentro del tramo del ultimo arranque.
function TramoTiene($patron) {
  $tramo = TramoLog
  return [bool](@($tramo | Where-Object { $_ -match $patron }).Count -gt 0)
}

function FotoStaging() {
  if (-not (Test-Path $STG)) { return "(no existe)" }
  (Get-ChildItem $STG -Force | Sort-Object Name | ForEach-Object {
    "$($_.Name)=$((Get-FileHash $_.FullName -Algorithm SHA256).Hash.Substring(0,16))"
  }) -join ' | '
}

# ==========================================================================
Write-Output "=== 1) ARRANQUE NORMAL (crea la base de datos) ==="
Arrancar 26
$hayDb = Test-Path (Join-Path $UD 'panorama.sqlite3')
Write-Output "  base de datos creada: $hayDb"
$shaDb1 = if ($hayDb) { (Get-FileHash (Join-Path $UD 'panorama.sqlite3') -Algorithm SHA256).Hash } else { 'NO' }
LogA33 "app.log tras el arranque normal"

# ==========================================================================
Write-Output ""
Write-Output "=== 2) JOURNAL CORRUPTO CON .old (debe fallar en cerrado) ==="
New-Item -ItemType Directory -Force -Path $STG | Out-Null
Set-Content -Path "$STG\0.old" -Value 'ORIGINAL UNICO IRREMPLAZABLE' -Encoding UTF8 -NoNewline
Set-Content -Path "$STG\0.new" -Value 'PREPARADO' -Encoding UTF8 -NoNewline
Set-Content -Path "$STG\journal.json" -Value '{ esto no es json' -Encoding UTF8 -NoNewline
$fotoAntes = FotoStaging
Write-Output "  staging antes: $fotoAntes"
Arrancar 22
$fotoDespues = FotoStaging
Write-Output "  staging despues: $fotoDespues"
Write-Output "  STAGING INTACTO: $($fotoAntes -eq $fotoDespues)"
$shaDb2 = (Get-FileHash (Join-Path $UD 'panorama.sqlite3') -Algorithm SHA256).Hash
Write-Output "  BASE DE DATOS INTACTA: $($shaDb1 -eq $shaDb2)"
Write-Output "  ESTE arranque registro PS-2004: $(TramoTiene 'PS-2004')"
Write-Output "  ...por journal ilegible:      $(TramoTiene 'no se puede leer')"
Write-Output "  ...y NO llego al login:       $(-not (TramoTiene 'Arranque completado|launcher'))"
LogA33 "app.log tras el journal corrupto"

# ==========================================================================
Write-Output ""
Write-Output "=== 3) JOURNAL DE OTRO EQUIPO EN FASE cleanup ==="
$j = @{
  v = 2; startedAt = '2026-09-14T00:00:00Z'; writer = 'OTRO-EQUIPO-0000000000000000'
  mode = 'change'; newFlag = 1; newSalt = ('bb' * 16); newVerifier = ('cc' * 32)
  remembered_final = 'ausente'; base_commit_id = ('dd' * 16); phase = 'cleanup'
  consolidated_commit_id = ('ee' * 16); items = @()
} | ConvertTo-Json -Depth 5
# SIN BOM: con BOM el JSON no parsea y entraria por el camino "ilegible",
# que es otro caso distinto (ya probado arriba).
[System.IO.File]::WriteAllText("$STG\journal.json", $j, (New-Object System.Text.UTF8Encoding $false))
$fotoAntes = FotoStaging
Write-Output "  staging antes: $fotoAntes"
Arrancar 22
$fotoDespues = FotoStaging
Write-Output "  staging despues: $fotoDespues"
Write-Output "  STAGING INTACTO (ni siquiera se limpia un cleanup ajeno): $($fotoAntes -eq $fotoDespues)"
$shaDb3 = (Get-FileHash (Join-Path $UD 'panorama.sqlite3') -Algorithm SHA256).Hash
Write-Output "  BASE DE DATOS INTACTA: $($shaDb1 -eq $shaDb3)"
Write-Output "  ESTE arranque dice que lo inicio OTRO equipo: $(TramoTiene 'OTRO equipo')"
Write-Output "  ...y NO lo trata como journal ilegible:      $(-not (TramoTiene 'no se puede leer'))"
LogA33 "app.log tras el journal ajeno"

# ==========================================================================
Write-Output ""
Write-Output "=== 4) SIN STAGING: la app vuelve a arrancar con normalidad ==="
Remove-Item $STG -Recurse -Force
Arrancar 26
$shaDb4 = (Get-FileHash (Join-Path $UD 'panorama.sqlite3') -Algorithm SHA256).Hash
Write-Output "  la base de datos sigue ahi: $(Test-Path (Join-Path $UD 'panorama.sqlite3'))"
Write-Output "  y es la MISMA de siempre (ningun arranque la reescribio): $($shaDb4 -eq $shaDb1)"
# Sobre SU PROPIO tramo, no sobre el registro entero ni sobre una hora fija.
Write-Output "  ESTE arranque NO registro ningun PS-2004: $(-not (TramoTiene 'PS-2004'))"
Write-Output "  ...ni nada pendiente de Seguridad:        $(-not (TramoTiene 'Seguridad'))"
LogA33 "app.log del arranque limpio"

# ==========================================================================
$despues = (Get-FileHash $prodDb -Algorithm SHA256).Hash
Write-Output ""
Write-Output "PRODUCCION INTACTA: $($antes -eq $despues)   ($antes)"
Remove-Item $S -Recurse -Force -ErrorAction SilentlyContinue
Write-Output "sandbox borrado: $(-not (Test-Path $S))"
