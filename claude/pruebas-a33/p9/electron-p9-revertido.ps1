# ---------------------------------------------------------------------------
# P9 - REVERSIONES EN LA APP REAL. Para cada familia A..E de revertir-p9.js se
# arrancan SOLO los casos que la delatan (electron-p9.ps1 con P9_SOLO y
# P9_MAIN_FUENTE, en un proceso PowerShell hijo) y se exige que el defecto
# REAPAREZCA exactamente como se anuncia:
#   A  archivo con BOM -> cae (PS-1020) en vez de abrir la compartida
#   B  JSON invalido -> vuelve la carpeta local en silencio: residuo abierto y
#      MODIFICADO, BD nueva en una carpeta limpia, proteccion desactivada
#   C  ruta relativa -> vuelve el mkdir relativo (y el rescate: PS-1025 desde P18)
#   D  BD nueva en una carpeta limpia; el residuo sigue protegido
#   E  residuo abierto y modificado (hash cambia); la carpeta limpia sigue sin BD
# Regenera las copias con revertir-p9.js. Sin caracteres acentuados (ANSI).
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Continue'
$P = 'C:\Codigo Fuente PS\panorama-app-codigo-fuente_1'
$DIR = "$P\claude\pruebas-a33\p9"
$ep = "$P\node_modules\electron\dist\electron.exe"
$global:OK = 0; $global:FALLO = 0
function Ok($n, $c, $extra) { if ($c) { $global:OK++; Write-Output "  OK    $n" } else { $global:FALLO++; Write-Output "  FALLO $n  -- $extra" } }

$env:ELECTRON_RUN_AS_NODE = '1'
& $ep "$DIR\revertir-p9.js"
Remove-Item Env:ELECTRON_RUN_AS_NODE

# OJO: una funcion cuyo resultado se ASIGNA se traga su Write-Output (primera
# pasada: las garantias y sus OK no salian en pantalla). Por eso el resultado
# vuelve en $script:ultimo y la funcion se llama sin asignar.
$script:ultimo = $null
function Revertida($id, $casos) {
  $json = Join-Path $env:TEMP "_a33-p9-rev-$id.json"
  if (Test-Path $json) { Remove-Item $json -Force }
  $env:P9_MAIN_FUENTE = "$DIR\revertidos\$id\main.js"
  $env:P9_SOLO = ($casos -join ',')
  $env:P9_SALIDA_JSON = $json
  $salida = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$DIR\electron-p9.ps1" 2>&1 | Out-String
  Remove-Item Env:P9_MAIN_FUENTE, Env:P9_SOLO, Env:P9_SALIDA_JSON -ErrorAction SilentlyContinue
  $garantias = ($salida -split "`r?`n" | Where-Object { $_ -cmatch '^(BD VIVA IDENTICA|Config real|Residuo P10 real|Archivos productivos intactos|Entrada PanoramaDriveSyncGuard|sandbox borrado)' }) -join ' | '
  Write-Output ""
  Write-Output "===== REVERSION $id ($($casos -join ', ')) ====="
  Write-Output "  $garantias"
  $r = $null
  if (Test-Path $json) { $r = Get-Content $json -Raw -Encoding UTF8 | ConvertFrom-Json; Remove-Item $json -Force }
  if ($r) { foreach ($cs in $casos) { $x = $r.$cs; Write-Output ("  {0,-24} db={1} | residuo={2} | dialogos={3} | ventanas={4} | nuevos={5} | {6}" -f $cs, $x.db, $x.residuo, $x.dialogos, $x.nventanas, $x.nuevos, $x.guardia) } }
  Ok "P9-EREV $id : garantias del sandbox (BD viva, config real, residuo P10, productivos, HKCU Run, sandbox borrado)" (($garantias -split 'True').Count -eq 7 -and $garantias -notmatch 'False') $garantias
  $script:ultimo = $r
}

Revertida 'A-bom-no-se-quita' @('residuo/bom'); $a = $script:ultimo
$x = $a.'residuo/bom'
Ok 'P9-EREV A: un location.json con BOM vuelve a no leerse -> se detiene (PS-1020) sin abrir ninguna BD' ($x.dialogos -match '^PS-1020' -and $x.nventanas -eq 0 -and $x.db -ne 'COMPARTIDA') ($x | ConvertTo-Json -Compress)

Revertida 'B-invalido-como-ausente' @('residuoreal/bom-doble', 'limpia/bom-doble', 'guard/bom-doble'); $b = $script:ultimo
$x = $b.'residuoreal/bom-doble'
Ok 'P9-EREV B: config invalida -> abre la COPIA del residuo real SIN aviso y la MODIFICA (hash cambia)' ($x.db -eq 'POR DEFECTO' -and $x.residuo -eq 'MODIFICADO' -and $x.dialogos -notmatch 'PS-1020') ($x | ConvertTo-Json -Compress)
# 18 sept 2026 - ACTUALIZADAS POR P22. Con P9 revertido, su defecto SI reaparece
# (la config invalida vuelve a tratarse como ausente: no hay PS-1020), pero P22
# es una SEGUNDA CAPA y frena el dano: ya no se crea en silencio ni se desactiva
# la proteccion. Es defensa en profundidad, y ahora se exige.
$x = $b.'limpia/bom-doble'
Ok 'P9-EREV B: config invalida + carpeta local limpia -> el defecto de P9 reaparece (sin PS-1020) pero P22 no deja crear en silencio: PS-1021 y autorizacion expresa' ($x.residuo -eq 'CREADO' -and $x.dialogos -notmatch 'PS-1020' -and $x.ndialogos -eq 1 -and $x.ps -match 'PS-1021' -and $x.autorizacion -match 'autoriz. expresamente') ($x | ConvertTo-Json -Compress)
$x = $b.'guard/bom-doble'
Ok 'P9-EREV B: config invalida -> la proteccion de apagado YA NO se desactiva: la sesion local temporal de P22 la respeta aunque P9 este revertido (P20)' ($x.guardia -match '^marca SIGUE' -and $x.bloqueados -notmatch 'reg\.exe delete|schtasks') ($x | ConvertTo-Json -Compress)

Revertida 'C-sin-ruta-absoluta' @('residuo/relativa'); $c = $script:ultimo
$x = $c.'residuo/relativa'
# 18 sept 2026 (P18 Fase 1): el rescate de arranque sin copia de procedencia
# verificable avisa con PS-1025 (PS-1007 queda para cuando restaura). Se sigue
# exigiendo lo mismo: el mkdir relativo vuelve y el arranque acaba en el rescate.
Ok 'P9-EREV C: ruta relativa -> vuelve a crearse datos\relativa en el directorio de trabajo, y la app no arranca (rescate sin copia verificable, PS-1025)' ($x.nuevos -match '(^|, )datos\\relativa' -and $x.dialogos -match 'PS-1025') ($x | ConvertTo-Json -Compress)

Revertida 'D-crea-local' @('limpia/bom-doble', 'residuoreal/bom-doble'); $d = $script:ultimo
$x = $d.'limpia/bom-doble'
Ok 'P9-EREV D: config invalida + carpeta local limpia -> la bateria DETECTA una BD NUEVA' ($x.residuo -eq 'CREADO' -and $x.bdEnDefecto -match 'panorama\.sqlite3') ($x | ConvertTo-Json -Compress)
$x = $d.'residuoreal/bom-doble'
Ok 'P9-EREV D: ...y solo eso: con residuo la parada sigue actuando (PS-1020, copia intacta)' ($x.dialogos -match '^PS-1020' -and $x.residuo -eq 'intacto') ($x | ConvertTo-Json -Compress)

Revertida 'E-abre-residuo' @('residuoreal/bom-doble', 'limpia/bom-doble'); $e = $script:ultimo
$x = $e.'residuoreal/bom-doble'
Ok 'P9-EREV E: config invalida -> abre la COPIA del residuo real y su hash CAMBIA' ($x.db -eq 'POR DEFECTO' -and $x.residuo -eq 'MODIFICADO') ($x | ConvertTo-Json -Compress)
$x = $e.'limpia/bom-doble'
Ok 'P9-EREV E: ...y solo eso: la carpeta limpia sigue sin BD (PS-1020)' ($x.dialogos -match '^PS-1020' -and $x.residuo -eq 'sigue sin existir') ($x | ConvertTo-Json -Compress)

Write-Output ""
Write-Output "======================================================================"
Write-Output "  P9 REVERSIONES EN ELECTRON REAL: $global:OK OK / $global:FALLO FALLOS"
Write-Output "======================================================================"
if ($global:FALLO -gt 0) { exit 1 }
