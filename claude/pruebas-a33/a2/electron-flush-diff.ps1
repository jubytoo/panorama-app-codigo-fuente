# ---------------------------------------------------------------------------
# DIFERENCIAL DE LA BARRERA DURABLE.
#
# Misma prueba RA-5 (corte duro del proceso justo DESPUES del commit de
# confirmacion) en dos brazos:
#   CON FLUSH  -> main.js productivo
#   SIN FLUSH  -> copia con la llamada quitada (a2/revertir-main.js)
#
# La pregunta: al volver a arrancar, la particion contiene el estado del BACKUP
# (que la marca ya da por aplicado) o se quedo sin el?
#
# Se repite N veces porque es una CARRERA, no un determinismo: sin la barrera,
# la escritura perezosa de Chromium (~103 ms medidos) compite con el commit
# (~27 ms). Se reportan los conteos, no un veredicto de una sola muestra.
#
# Sin caracteres acentuados: PowerShell 5.1 lee este archivo como ANSI.
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Continue'
$P    = 'C:\Codigo Fuente PS\panorama-app-codigo-fuente_1'
$B    = "$P\claude\pruebas-a33"
$wrap = "$B\real-run\a2.js"
$ep   = "$P\node_modules\electron\dist\electron.exe"
$BDVIVA = 'G:\Mi unidad\BD-PanoramaServicio\panorama.sqlite3'
$N = if ($env:DIFF_N) { [int]$env:DIFF_N } else { 5 }

$bdAntes   = (Get-FileHash $BDVIVA -Algorithm SHA256).Hash
$mainAntes = (Get-FileHash "$P\main.js" -Algorithm SHA256).Hash
Write-Output "main.js productivo: $($mainAntes.Substring(0,16))"
Write-Output "repeticiones por brazo: $N"
Write-Output ""

# --- copia revertida, colocada en la RAIZ del proyecto ---------------------
# Tiene que vivir ahi porque main.js resuelve sus rutas con __dirname. Se borra
# al terminar y se comprueba que el main.js real no se ha tocado.
$env:ELECTRON_RUN_AS_NODE = 1
& $ep "$B\a2\revertir-main.js" | Out-Null
$revertido = "$B\a2\revertidos-main\F-sin-flush.js"
if (-not (Test-Path $revertido)) { throw "no se genero la copia revertida" }
$copiaTmp = "$P\main.__PRUEBA-SIN-FLUSH.js"
if (Test-Path $copiaTmp) { throw "ya existe $copiaTmp; se aborta para no pisar nada" }
Copy-Item $revertido $copiaTmp
Write-Output "copia revertida colocada en: $copiaTmp"
Write-Output ""

$S = Join-Path $env:TEMP '_a33-a2-diff'
if ($S -match ' ') { throw "el sandbox no puede tener espacios: $S" }

function Correr([string]$modo, [int]$segundos, [string]$mainAlt) {
  [Environment]::SetEnvironmentVariable('LOCALAPPDATA', "$S\Local", 'Process')
  [Environment]::SetEnvironmentVariable('APPDATA', "$S\Roaming", 'Process')
  [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process')
  $argv = @("`"$wrap`"", "`"--sandbox=$S`"", "`"--modo=$modo`"")
  if ($mainAlt) { $argv += "`"--main=$mainAlt`"" }
  $p = Start-Process -FilePath $ep -ArgumentList $argv -PassThru -WindowStyle Minimized
  $t0 = Get-Date
  while (-not $p.HasExited -and ((Get-Date) - $t0).TotalSeconds -lt $segundos) { Start-Sleep -Milliseconds 400 }
  if (-not $p.HasExited) { $p.Kill(); Start-Sleep -Milliseconds 800; return 'TIMEOUT' }
  return $p.ExitCode
}

function UnaRonda([string]$mainAlt) {
  if (Test-Path $S) { Remove-Item -LiteralPath $S -Recurse -Force -ErrorAction SilentlyContinue }
  New-Item -ItemType Directory -Force -Path "$S\Roaming","$S\Local" | Out-Null
  $c1 = Correr 'ra5'  180 $mainAlt
  $c2 = Correr 'ra5b' 180 $mainAlt
  $res = "$S\ra5b-resultado.json"
  if (-not (Test-Path $res)) { return [pscustomobject]@{ ok=$false; motivo="sin resultado (exits $c1/$c2)"; acierta=$null } }
  $j = Get-Content $res -Raw | ConvertFrom-Json
  $ms = $null; $enDisco = $null; $nFlush = $null
  if ($j.corte) { $ms = $j.corte.msDesdeAplicar; $enDisco = ($j.corte.marcaDelBackupEnDisco -join ','); $nFlush = $j.corte.huboFlush }
  return [pscustomobject]@{ ok=$true; motivo=''; acierta=$j.acierta; leida=$j.marcaLeida; backup=$j.marcaBackup; previa=$j.marcaPrevia; ms=$ms; enDisco=$enDisco; nFlush=$nFlush }
}

$resultados = @{}
foreach ($brazo in @('CON-FLUSH','SIN-FLUSH')) {
  $mainAlt = if ($brazo -eq 'SIN-FLUSH') { $copiaTmp } else { $null }
  Write-Output "==================== BRAZO $brazo ===================="
  $aciertos = 0; $fallos = 0; $rotas = 0
  for ($i = 1; $i -le $N; $i++) {
    $r = UnaRonda $mainAlt
    if (-not $r.ok) { $rotas++; Write-Output ("  {0}/{1}  RONDA NO VALIDA: {2}" -f $i,$N,$r.motivo); continue }
    if ($r.acierta) { $aciertos++ } else { $fallos++ }
    $veredicto = if ($r.acierta) { 'coherente con la marca' } else { 'INCOHERENTE: la marca dice aplicado y la particion no lo tiene' }
    $disco = if ($r.enDisco) { "SI ($($r.enDisco))" } else { 'NO' }
    Write-Output ("  {0}/{1}  tras el reinicio: {2}" -f $i, $N, $veredicto)
    Write-Output ("        en el instante del corte: {0} ms desde el volcado | dato del backup ya en LevelDB: {1} | flushes: {2}" -f `
      $(if ($null -ne $r.ms) { $r.ms } else { '?' }), $disco, $(if ($null -ne $r.nFlush) { $r.nFlush } else { '?' }))
    if (-not $r.acierta) { Write-Output ("        leida: {0}  esperada: {1}" -f $r.leida, $r.backup) }
  }
  $resultados[$brazo] = [pscustomobject]@{ aciertos=$aciertos; fallos=$fallos; rotas=$rotas }
  Write-Output "  -> coherentes: $aciertos / incoherentes: $fallos / rondas no validas: $rotas"
  Write-Output ""
}

Write-Output "======================================================================"
Write-Output "  DIFERENCIAL DE LA BARRERA DURABLE  (N=$N por brazo)"
foreach ($k in @('CON-FLUSH','SIN-FLUSH')) {
  $r = $resultados[$k]
  Write-Output ("  {0,-10}  coherentes {1}/{2}   incoherentes {3}   no validas {4}" -f $k, $r.aciertos, $N, $r.fallos, $r.rotas)
}
Write-Output "======================================================================"

# --- limpieza y guardianes -------------------------------------------------
if (Test-Path $S) { Remove-Item -LiteralPath $S -Recurse -Force -ErrorAction SilentlyContinue }
Remove-Item $copiaTmp -Force -ErrorAction SilentlyContinue
$mainDespues = (Get-FileHash "$P\main.js" -Algorithm SHA256).Hash
$bdDespues   = (Get-FileHash $BDVIVA -Algorithm SHA256).Hash
Write-Output ""
Write-Output "copia temporal borrada de la raiz: $(-not (Test-Path $copiaTmp))"
Write-Output "main.js productivo intacto: $($mainAntes -eq $mainDespues)"
Write-Output "BD VIVA identica: $($bdAntes -eq $bdDespues)"
Write-Output "sandbox borrado: $(-not (Test-Path $S))"
