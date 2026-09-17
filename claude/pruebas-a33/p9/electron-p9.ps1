# ---------------------------------------------------------------------------
# P9 - que base de datos abre la app REAL segun su location.json.
# EXIGENTE desde la implementacion (17 sept 2026). Naci como diagnostico
# (48 OK / 0 describiendo el defecto); las aserciones [DESCRIBE] de entonces
# quedan INVERTIDAS, y lo que no es P9 (JSON valido + ruta inaccesible) se
# REGISTRA sin exigir cambios.
# Todo dentro de %TEMP%\_a33-p9-real. Arnes: real-run\p9-ubicacion.js
# (bloquea reg/schtasks/powershell y copias fuera del sandbox). NO toca la BD
# viva, ni la config real, ni P10.
#
# Variables:
#   P9_SOLO         casos 'base/id' separados por comas: solo esos, SIN aserciones
#   P9_MAIN_FUENTE  arranca los casos con una reversion (p9\revertidos\X\main.js);
#                   la preparacion de la base usa SIEMPRE el main.js real
#   P9_SALIDA_JSON  escribe ahi el resultado de cada caso (lo usa el .ps1 de reversiones)
#
# Sin caracteres acentuados: PowerShell 5.1 lee este archivo como ANSI.
# OJO: NO poner $ErrorActionPreference='Stop'. Usar $proc, nunca $p.
# OJO: ninguna variable que difiera de otra solo en mayusculas ($r/$R pisaron
# la raiz del sandbox en la primera pasada del diagnostico).
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Continue'
# Lanzar() cambia APPDATA/LOCALAPPDATA del PROCESO: se restauran al final, para
# que un barrido que ejecute varios arneses seguidos no herede el sandbox.
$APPDATA_0 = $env:APPDATA; $LOCALAPPDATA_0 = $env:LOCALAPPDATA
$P    = 'C:\Codigo Fuente PS\panorama-app-codigo-fuente_1'
$wrap = "$P\claude\pruebas-a33\real-run\p9-ubicacion.js"
$ep   = "$P\node_modules\electron\dist\electron.exe"
$BDVIVA = 'G:\Mi unidad\BD-PanoramaServicio\panorama.sqlite3'
$CFGREAL = Join-Path $env:APPDATA 'panorama-app-config'
$RESIDUO_REAL = Join-Path $env:APPDATA 'panorama-app\panorama.sqlite3'
$FUENTE = $env:P9_MAIN_FUENTE
$SOLO = @(); if ($env:P9_SOLO) { $SOLO = @($env:P9_SOLO -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }
$SALIDA_JSON = $env:P9_SALIDA_JSON

function HuellaDir($d) { if (-not (Test-Path $d)) { return '(no existe)' }; (Get-ChildItem $d -Force -Recurse -File | ForEach-Object { $_.FullName + '|' + $_.Length + '|' + $_.LastWriteTimeUtc.Ticks }) -join ';' }
$bdAntes = (Get-FileHash $BDVIVA -Algorithm SHA256).Hash
$cfgAntes = HuellaDir $CFGREAL
$resAntes = (Get-FileHash $RESIDUO_REAL -Algorithm SHA256).Hash
$prodFiles = @('main.js','db.js','security.js','preload.js','build\installer.nsh','claude\Restaurar-backup.bat')
$prodAntes = @{}; foreach ($f in $prodFiles) { $prodAntes[$f] = (Get-FileHash (Join-Path $P $f) -Algorithm SHA256).Hash }
function ValorRun() { $v = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name PanoramaDriveSyncGuard -ErrorAction SilentlyContinue; if ($v) { [string]$v.PanoramaDriveSyncGuard } else { '(no existe)' } }
$runValorAntes = ValorRun
$runAntes = if ($runValorAntes -ne '(no existe)') { 'EXISTE (de la app instalada)' } else { 'no existe' }
Write-Output "BD VIVA antes: $($bdAntes.Substring(0,16))   residuo P10 real: $($resAntes.Substring(0,16))   HKCU Run PanoramaDriveSyncGuard antes: $runAntes"
if ($FUENTE) { Write-Output "main.js de los CASOS: REVERSION $(Split-Path (Split-Path $FUENTE) -Leaf)" }

$R = Join-Path $env:TEMP '_a33-p9-real'
if ($R -notlike '*_a33-p9*' -or $R -match ' ' -or $R -like '*BD-PanoramaServicio*') { throw "sandbox inesperado: $R" }
if (Test-Path $R) { Remove-Item -LiteralPath $R -Recurse -Force -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Force -Path $R | Out-Null
$global:OK = 0; $global:FALLO = 0
function Ok($n, $c, $extra) { if ($c) { $global:OK++; Write-Output "  OK    $n" } else { $global:FALLO++; Write-Output "  FALLO $n  -- $extra" } }

$U8 = New-Object System.Text.UTF8Encoding $false
function Instalador($ruta) { "{`r`n  `"userDataDir`": `"$ruta`",`r`n  `"shared`": true`r`n}`r`n" }
function Lanzar($S, $modo, $nombre, $tope, $fuenteMain) {
  [Environment]::SetEnvironmentVariable('LOCALAPPDATA', "$S\Local", 'Process')
  [Environment]::SetEnvironmentVariable('APPDATA', "$S\Roaming", 'Process')
  [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process')
  [Environment]::SetEnvironmentVariable('P9_MAIN_FUENTE', $fuenteMain, 'Process')
  $argv = @("`"$wrap`"", "`"--sandbox=$S`"", "--modo=$modo")
  if ($nombre) { $argv += "`"--nombre=$nombre`"" }
  $proc = Start-Process -FilePath $ep -ArgumentList $argv -WorkingDirectory $S -PassThru -WindowStyle Minimized
  $t0 = Get-Date
  while (-not $proc.HasExited -and ((Get-Date) - $t0).TotalSeconds -lt $tope) { Start-Sleep -Milliseconds 400 }
  $seg = [Math]::Round(((Get-Date) - $t0).TotalSeconds)
  [Environment]::SetEnvironmentVariable('P9_MAIN_FUENTE', $FUENTE, 'Process')
  if (-not $proc.HasExited) { $proc.Kill(); Start-Sleep -Milliseconds 800; return "TIMEOUT tras $seg s" }
  return "exit $($proc.ExitCode) en $seg s"
}

# ============================ BASE (siempre con el main.js REAL) ==============
$B = "$R\base"
New-Item -ItemType Directory -Force -Path "$B\Roaming\panorama-app-config","$B\Local","$B\G\Compartida\BD-P9" | Out-Null
[IO.File]::WriteAllText("$B\Roaming\panorama-app-config\location.json", (Instalador ("$B\G\Compartida\BD-P9" -replace '\\','/')), $U8)
Write-Output "preparar compartida: $(Lanzar $B 'preparar' 'PROYECTO EN LA COMPARTIDA' 120 $null)"
Remove-Item "$B\Roaming\panorama-app-config\location.json" -Force
Write-Output "preparar residuo:    $(Lanzar $B 'preparar' 'PROYECTO RESIDUAL' 120 $null)"
Get-Content "$B\test.log" | Where-Object { $_ -match 'RESULTADO|proyecto creado' } | ForEach-Object { '    ' + ($_ -replace '^\[[^\]]+\] ', '').Substring(0, [Math]::Min(230, ($_ -replace '^\[[^\]]+\] ', '').Length)) }
# Como esta maquina HOY: sin registro de ubicaciones (la version instalada es anterior a A3.3).
Remove-Item "$B\Roaming\panorama-app-config\ubicaciones-inicializadas.json" -Force -ErrorAction SilentlyContinue
Get-ChildItem $B -Recurse -Force -File | Where-Object { $_.Name -like '.panorama-lock*' -or $_.Name -in @('test.log','resultado.json') } | Remove-Item -Force
$okBase = (Test-Path "$B\G\Compartida\BD-P9\panorama.sqlite3") -and (Test-Path "$B\Roaming\panorama-app\panorama.sqlite3")
if (-not $SOLO.Count) { Ok 'P9-X0 base preparada: una BD en la compartida y otra (residuo) en la carpeta por defecto' $okBase '' }
if (-not $okBase) { Write-Output 'ABORTADO: sin base'; exit 1 }

# ============================ CASOS ============================================
$BOM = [byte[]](0xEF,0xBB,0xBF)
$BE = New-Object System.Text.UnicodeEncoding $true, $true
$bInst   = { param($g) $U8.GetBytes((Instalador $g)) }
$bBom    = { param($g) $BOM + $U8.GetBytes((Instalador $g)) }
$bBom2   = { param($g) $BOM + $BOM + $U8.GetBytes((Instalador $g)) }
$bTrunc  = { param($g) $U8.GetBytes('{"userDataDir":"' + $g) }
$casos = @(
  @{ id='valido';            base='residuo';     tope=90;  bytes=$bInst },
  @{ id='bom';               base='residuo';     tope=90;  bytes=$bBom },
  @{ id='utf16le';           base='residuo';     tope=90;  bytes={ param($g) [Text.Encoding]::Unicode.GetPreamble() + [Text.Encoding]::Unicode.GetBytes((Instalador $g)) } },
  @{ id='utf16be';           base='residuo';     tope=90;  bytes={ param($g) $BE.GetPreamble() + $BE.GetBytes((Instalador $g)) } },
  @{ id='bom-doble';         base='residuo';     tope=60;  bytes=$bBom2 },
  @{ id='truncado';          base='residuo';     tope=60;  bytes=$bTrunc },
  @{ id='null';              base='residuo';     tope=60;  bytes={ param($g) $U8.GetBytes('null') } },
  @{ id='objeto-vacio';      base='residuo';     tope=60;  bytes={ param($g) $U8.GetBytes('{}') } },
  @{ id='array';             base='residuo';     tope=60;  bytes={ param($g) $U8.GetBytes('[]') } },
  @{ id='tipo-numerico';     base='residuo';     tope=60;  bytes={ param($g) $U8.GetBytes('{"userDataDir":42,"shared":true}') } },
  @{ id='ruta-vacia';        base='residuo';     tope=60;  bytes={ param($g) $U8.GetBytes('{"userDataDir":"","shared":true}') } },
  @{ id='relativa';          base='residuo';     tope=60;  bytes={ param($g) $U8.GetBytes('{"userDataDir":"datos/relativa","shared":true}') } },
  @{ id='ansi-cp1252';       base='residuo';     tope=60;  bytes={ param($g) [Text.Encoding]::GetEncoding(1252).GetBytes((Instalador ($g + '/A' + [char]0xF1 + 'o'))) } },
  @{ id='ilegible-carpeta';  base='residuo';     tope=60;  bytes=$null; especial='carpeta' },
  @{ id='ilegible-bloqueado'; base='residuo';    tope=60;  bytes=$bInst; especial='bloqueo' },
  @{ id='sin-archivo';       base='residuo';     tope=90;  bytes=$null },
  @{ id='inexistente';       base='residuo';     tope=120; bytes={ param($g) $U8.GetBytes((Instalador ($g + '/no-existe-aun'))) } },
  @{ id='no-montada';        base='residuo';     tope=150; bytes={ param($g) $U8.GetBytes((Instalador 'Q:/no-montada/BD')) } },
  @{ id='inaccesible';       base='residuo';     tope=150; bytes={ param($g) $U8.GetBytes((Instalador (($g -replace 'BD-P9$','') + 'soy-un-archivo.txt/BD'))) } },
  @{ id='sin-archivo';       base='limpia';      tope=90;  bytes=$null },
  @{ id='bom-doble';         base='limpia';      tope=60;  bytes=$bBom2 },
  @{ id='relativa';          base='limpia';      tope=60;  bytes={ param($g) $U8.GetBytes('{"userDataDir":"datos/relativa","shared":true}') } },
  @{ id='valido';            base='limpia';      tope=90;  bytes=$bInst },
  @{ id='bom-doble';         base='registrada';  tope=60;  bytes=$bBom2 },
  @{ id='valido';            base='guard';       tope=90;  bytes=$bInst },
  @{ id='bom';               base='guard';       tope=90;  bytes=$bBom },
  @{ id='bom-doble';         base='guard';       tope=60;  bytes=$bBom2 },
  @{ id='no-montada';        base='guard';       tope=150; bytes={ param($g) $U8.GetBytes((Instalador 'Q:/no-montada/BD')) } },
  # Esta maquina: la carpeta por defecto con una COPIA del residuo real de P10
  # (copiar es leer; la copia vive en el sandbox y se borra). Solo se muestra
  # CUANTOS proyectos hay, nunca sus nombres.
  @{ id='valido';            base='residuoreal'; tope=90;  bytes=$bInst },
  @{ id='bom';               base='residuoreal'; tope=90;  bytes=$bBom },
  @{ id='bom-doble';         base='residuoreal'; tope=90;  bytes=$bBom2 },
  @{ id='truncado';          base='residuoreal'; tope=90;  bytes=$bTrunc }
)
if ($SOLO.Count) { $casos = @($casos | Where-Object { $SOLO -contains "$($_.base)/$($_.id)" }) }
$FILTRO_CHROMIUM = '(^|\\)(Partitions|projects|backups|Cache|Code Cache|GPUCache|DawnCache|DawnGraphiteCache|DawnWebGPUCache|blob_storage|Session Storage|Local Storage|Network|Shared Dictionary|shared_proto_db|VideoDecodeStats|WebStorage|Crashpad|Dictionaries|Service Worker|IndexedDB|databases|leveldb)(\\|$)'
$res = [ordered]@{}
foreach ($c in $casos) {
  $clave = "$($c.base)/$($c.id)"
  $S = "$R\c-$($c.base)-$($c.id)"
  Copy-Item -LiteralPath $B -Destination $S -Recurse -Force
  $G = "$S\G\Compartida\BD-P9" -replace '\\','/'
  $def = "$S\Roaming\panorama-app"
  if ($c.base -in @('limpia','registrada')) { Remove-Item -LiteralPath $def -Recurse -Force }
  $reg = "$S\Roaming\panorama-app-config\ubicaciones-inicializadas.json"
  if ($c.base -eq 'registrada') {
    # Misma forma que claveUbicacion() (path.resolve NO expande nombres 8.3; GetFullPath si lo haria).
    $k = $def.ToLower() -replace '\\','\\'
    [IO.File]::WriteAllText($reg, "{`"v`":1,`"ubicaciones`":{`"$k`":{`"estado`":`"inicializada`"}}}", $U8)
  }
  $flag = "$S\Local\PanoramaDriveSyncGuard\enabled.flag"
  if ($c.base -eq 'guard') {
    New-Item -ItemType Directory -Force -Path (Split-Path $flag) | Out-Null
    [IO.File]::WriteAllText($flag, (Get-Date).ToString('o'), $U8)
  }
  if ($c.base -eq 'residuoreal') {
    Get-ChildItem $def -Force -File -Filter 'panorama.sqlite3*' | Remove-Item -Force
    Copy-Item -LiteralPath $RESIDUO_REAL -Destination "$def\panorama.sqlite3"
  }
  if ($c.id -eq 'inaccesible') { [IO.File]::WriteAllText("$S\G\Compartida\soy-un-archivo.txt", 'x', $U8) }
  $loc = "$S\Roaming\panorama-app-config\location.json"
  if ($c.bytes) { [IO.File]::WriteAllBytes($loc, [byte[]](& $c.bytes $G)) }
  if ($c.especial -eq 'carpeta') { New-Item -ItemType Directory -Force -Path $loc | Out-Null }
  $hLocAntes = if (Test-Path $loc -PathType Leaf) { (Get-FileHash $loc).Hash } elseif (Test-Path $loc) { '(carpeta)' } else { '(no existe)' }
  $hRegAntes = if (Test-Path $reg) { (Get-FileHash $reg).Hash } else { '(no existe)' }
  $hResAntes = if (Test-Path "$def\panorama.sqlite3") { (Get-FileHash "$def\panorama.sqlite3").Hash } else { '(no existe)' }
  $hGAntes = (Get-FileHash "$S\G\Compartida\BD-P9\panorama.sqlite3").Hash
  $hFlagAntes = if (Test-Path $flag) { (Get-FileHash $flag).Hash } else { '(no existe)' }
  $itemsAntes = @(Get-ChildItem $S -Recurse -Force | ForEach-Object { $_.FullName })
  # Solo cuentan las lineas NUEVAS de cada app.log (la base trae las de su preparacion).
  $lineasAntes = @{}
  foreach ($lf in @(Get-ChildItem $S -Recurse -Filter app.log -File | ForEach-Object { $_.FullName })) { $lineasAntes[$lf] = @(Get-Content $lf -Encoding UTF8).Count }
  if ($c.base -eq 'guard') { [IO.File]::WriteAllText("$S\Local\PanoramaDriveSyncGuard\heartbeat.txt", (Get-Date).ToString('o'), $U8) }
  $bloqueo = $null
  if ($c.especial -eq 'bloqueo') { $bloqueo = [IO.File]::Open($loc, 'Open', 'Read', 'None') }
  $lanz = Lanzar $S 'caso' $null $c.tope $FUENTE
  if ($bloqueo) { $bloqueo.Close(); $bloqueo = $null }
  $resJson = $null
  if (Test-Path "$S\resultado.json") { $resJson = Get-Content "$S\resultado.json" -Raw -Encoding UTF8 | ConvertFrom-Json }
  $hLocDespues = if (Test-Path $loc -PathType Leaf) { (Get-FileHash $loc).Hash } elseif (Test-Path $loc) { '(carpeta)' } else { '(no existe)' }
  $hRegDespues = if (Test-Path $reg) { (Get-FileHash $reg).Hash } else { '(no existe)' }
  $hResDespues = if (Test-Path "$def\panorama.sqlite3") { (Get-FileHash "$def\panorama.sqlite3").Hash } else { '(no existe)' }
  $hGDespues = (Get-FileHash "$S\G\Compartida\BD-P9\panorama.sqlite3").Hash
  $hFlagDespues = if (Test-Path $flag) { (Get-FileHash $flag).Hash } else { '(no existe)' }
  $marca = "\c-$($c.base)-$($c.id)\"
  $nuevos = @(Get-ChildItem $S -Recurse -Force | ForEach-Object { $_.FullName } | Where-Object { $itemsAntes -notcontains $_ } | ForEach-Object { $_.Substring($_.IndexOf($marca) + $marca.Length) })
  $nuevosUtiles = @($nuevos | Where-Object { $_ -notmatch '^Local(\\|$)' -and $_ -notmatch $FILTRO_CHROMIUM -and $_ -notin @('test.log','resultado.json') })
  $sqliteDef = @(if (Test-Path $def) { Get-ChildItem $def -Force -File | Where-Object { $_.Name -like 'panorama.sqlite3*' -or $_.Name -like '.panorama-*' } | ForEach-Object { $_.Name } })
  $log = @()
  foreach ($lf in @(Get-ChildItem $S -Recurse -Filter app.log -File | ForEach-Object { $_.FullName })) {
    $todas = @(Get-Content $lf -Encoding UTF8)
    $desde = if ($lineasAntes.ContainsKey($lf)) { $lineasAntes[$lf] } else { 0 }
    if ($todas.Count -gt $desde) { $log += $todas[$desde..($todas.Count - 1)] }
  }
  $dlg = @(); if ($resJson) { $dlg = @($resJson.dialogos) }
  $d1020 = @($dlg | Where-Object { $_.codigo -eq 'PS-1020' })
  $vent = @(); if ($resJson -and $resJson.ventanas) { $vent = @($resJson.ventanas | ForEach-Object { $_.url }) }
  $sinRuta = { param($t) ($t -notmatch [regex]::Escape($S)) -and ($t -notmatch [regex]::Escape($R)) -and ($t -notmatch '(?i)Users\\|Temp\\|_a33-p9') }
  $o = [ordered]@{
    lanz = $lanz
    motivo = if ($resJson) { $resJson.motivo } else { '(sin resultado)' }
    db = if ($resJson -and $resJson.db) { if ($resJson.db -like "$def*") { 'POR DEFECTO' } elseif ($resJson.db -like ("$S\G\Compartida\BD-P9" + '*') -or $resJson.db -like ($G + '*')) { 'COMPARTIDA' } else { "OTRA: $($resJson.db.Substring([Math]::Min($S.Length, $resJson.db.Length)))" } } else { '(ninguna)' }
    proyectos = if (-not $resJson) { '' } elseif ($c.base -eq 'residuoreal' -and $resJson.db -like "$def*" -and -not ($resJson.proyectos -is [string])) { "($(@($resJson.proyectos).Count) proyectos del residuo real; nombres no se muestran)" } else { if ($resJson.proyectos -is [string]) { $resJson.proyectos } else { ($resJson.proyectos -join ' | ') } }
    dialogos = (($dlg | ForEach-Object { "$($_.codigo) $($_.titulo)" }) -join ' || ')
    ndialogos = $dlg.Count
    botones1020 = if ($d1020.Count) { ($d1020[0].botones -join '|') } else { '' }
    mensaje1020 = if ($d1020.Count) { [string]$d1020[0].mensaje } else { '' }
    detalle1020SinRuta = if ($d1020.Count) { [bool](& $sinRuta ([string]$d1020[0].detalle)) } else { $false }
    ventanas = "$($vent.Count): $($vent -join ', ')"
    nventanas = $vent.Count
    bloqueados = if ($resJson) { ($resJson.bloqueados -join ',') } else { '' }
    copiasBloqueadas = if ($resJson) { ($resJson.copiasBloqueadas -join ',') } else { '' }
    residuo = if ($hResAntes -eq '(no existe)' -and $hResDespues -eq '(no existe)') { 'sigue sin existir' } elseif ($hResAntes -eq $hResDespues) { 'intacto' } elseif ($hResAntes -eq '(no existe)') { 'CREADO' } else { 'MODIFICADO' }
    compartida = if ($hGAntes -eq $hGDespues) { 'intacta' } else { 'MODIFICADA' }
    location = if ($hLocAntes -eq $hLocDespues) { 'intacto' } else { 'CAMBIADO' }
    registro = if ($hRegAntes -eq $hRegDespues) { "intacto ($(if ($hRegAntes -eq '(no existe)') { 'no existe' } else { 'existe' }))" } else { 'CAMBIADO' }
    bdEnDefecto = ($sqliteDef -join ',')
    nuevos = ($nuevosUtiles -join ', ')
    politica = (($log | Where-Object { $_ -match 'pol.tica de ubicaci.n' }) -replace '^\[[^\]]+\] ', '') -join ' / '
    autorizacion = (($log | Where-Object { $_ -match 'autorizaci.n de creaci.n' }) -replace '^\[[^\]]+\] ', '') -join ' / '
    ps = (($log | Select-String -Pattern 'PS-\d{4}' -AllMatches | ForEach-Object { $_.Matches.Value }) | Select-Object -Unique) -join ','
    log1020 = (($log | Where-Object { $_ -match 'ERROR PS-1020 . location\.json' }) -replace '^\[[^\]]+\] ', '') -join ' / '
    logSinRuta = [bool](& $sinRuta ($log -join "`n"))
    guardia = if ($c.base -eq 'guard') { "marca $(if ($hFlagDespues -eq '(no existe)') { 'BORRADA' } elseif ($hFlagDespues -eq $hFlagAntes) { 'SIGUE' } else { 'REESCRITA' }); " + ((($log | Where-Object { $_ -match 'rotecci.n de apagado' }) -replace '^\[[^\]]+\] ', '') -join ' / ') } else { '' }
  }
  $res[$clave] = $o
  Write-Output ""
  Write-Output "===== $clave ====="
  foreach ($k in $o.Keys) { if ($k -notin @('mensaje1020')) { Write-Output ("  {0,-19} {1}" -f $k, $o[$k]) } }
}
if ($SALIDA_JSON) { [IO.File]::WriteAllText($SALIDA_JSON, ($res | ConvertTo-Json -Depth 4), $U8) }

if (-not $SOLO.Count) {
Write-Output ""
Write-Output "==================== P9 EXIGIDO EN LA APP REAL ===================="
$MSG1020 = '^La configuraci.n de ubicaci.n de datos no puede leerse\. Panorama no cambiar. autom.ticamente a otra base de datos\.$'
function Cerrado($clave, $etq) {
  $x = $res[$clave]
  Ok "$etq ${clave}: aviso UNICO PS-1020 con un solo boton 'Cerrar' y el mensaje pedido" ($x.ndialogos -eq 1 -and $x.dialogos -match '^PS-1020 ' -and $x.botones1020 -eq 'Cerrar' -and $x.mensaje1020 -match $MSG1020) ($x | ConvertTo-Json -Compress)
  Ok "$etq ${clave}: NO se crea NINGUNA ventana (ni splash, ni lanzador, ni proyecto) y no se abre ninguna BD" ($x.nventanas -eq 0 -and $x.proyectos -match '^ERR' -and $x.motivo -eq 'app.quit()') ($x.ventanas + ' | ' + $x.proyectos + ' | ' + $x.motivo)
  Ok "$etq ${clave}: la BD de la carpeta por defecto, la compartida, location.json y el registro de ubicaciones quedan intactos" ($x.residuo -in @('intacto','sigue sin existir') -and $x.compartida -eq 'intacta' -and $x.location -eq 'intacto' -and $x.registro -like 'intacto*') "$($x.residuo) | $($x.compartida) | $($x.location) | $($x.registro)"
  Ok "$etq ${clave}: ni politica, ni autorizacion, ni otro codigo PS que PS-1020 en el registro; y sin rutas en el aviso ni en el registro" (-not $x.politica -and -not $x.autorizacion -and $x.ps -eq 'PS-1020' -and $x.log1020 -and $x.detalle1020SinRuta -and $x.logSinRuta) "$($x.ps) | $($x.log1020) | sinRuta=$($x.detalle1020SinRuta)/$($x.logSinRuta)"
  Ok "$etq ${clave}: no se pide nada al sistema (reg/schtasks/powershell) ni se copia nada fuera del sandbox" (-not $x.bloqueados -and -not $x.copiasBloqueadas) "$($x.bloqueados) | $($x.copiasBloqueadas)"
}
$v = $res['residuo/valido']
Ok 'P9-1 residuo/valido: abre la COMPARTIDA, sin dialogos, residuo intacto, politica compartida' ($v.db -eq 'COMPARTIDA' -and $v.proyectos -eq 'PROYECTO EN LA COMPARTIDA' -and $v.ndialogos -eq 0 -and $v.residuo -eq 'intacto' -and $v.politica -match 'compartida') ($v | ConvertTo-Json -Compress)
foreach ($id in @('bom','utf16le','utf16be')) {
  $x = $res["residuo/$id"]
  $etq = if ($id -eq 'bom') { 'P9-2 [A]' } else { 'P9-3' }
  Ok "$etq residuo/${id}: abre EXACTAMENTE la misma compartida que el archivo sin BOM, sin dialogos, residuo intacto" ($x.db -eq 'COMPARTIDA' -and $x.proyectos -eq 'PROYECTO EN LA COMPARTIDA' -and $x.ndialogos -eq 0 -and $x.residuo -eq 'intacto' -and $x.politica -eq $v.politica) ($x | ConvertTo-Json -Compress)
}
foreach ($pareja in @(@('bom-doble','P9-4 [B]'), @('truncado','P9-5 [B]'), @('null','P9-6 [B]'), @('objeto-vacio','P9-6 [B]'), @('array','P9-6 [B]'), @('tipo-numerico','P9-6 [B]'), @('ruta-vacia','P9-7 [B]'), @('relativa','P9-8 [B]'), @('ansi-cp1252','P9-9 [B]'), @('ilegible-carpeta','P9-9 [B]'), @('ilegible-bloqueado','P9-9 [B]'))) {
  Cerrado "residuo/$($pareja[0])" $pareja[1]
}
foreach ($id in @('relativa')) {
  foreach ($bs in @('residuo','limpia')) {
    $x = $res["$bs/$id"]
    Ok "P9-8 [E] $bs/${id}: NINGUNA carpeta nueva (ni 'datos\relativa' en el directorio de trabajo)" (-not $x.nuevos -or ($x.nuevos -notmatch '(^|, )datos')) $x.nuevos
  }
}
$an = $res['residuo/ansi-cp1252']
Ok 'P9-9 residuo/ansi-cp1252: NO se crea la carpeta con el nombre mal decodificado (antes si)' ($an.nuevos -notmatch 'BD-P9\\A') $an.nuevos
$xs = $res['residuo/sin-archivo']
Ok 'P9-10 residuo/sin-archivo: abre la de por defecto (legitimo: no hay nada configurado) - sin cambios' ($xs.db -eq 'POR DEFECTO' -and $xs.proyectos -eq 'PROYECTO RESIDUAL' -and $xs.ndialogos -eq 0) ($xs | ConvertTo-Json -Compress)
$ls = $res['limpia/sin-archivo']
Ok 'P9-10 limpia/sin-archivo: primera ejecucion legitima, crea la BD en la carpeta por defecto - sin cambios' ($ls.db -eq 'POR DEFECTO' -and $ls.residuo -eq 'CREADO' -and $ls.autorizacion -match 'S.* \(carpeta por defecto sin registro' -and $ls.ndialogos -eq 0) ($ls | ConvertTo-Json -Compress)
foreach ($id in @('bom-doble','truncado')) {
  $x = $res["residuoreal/$id"]
  Cerrado "residuoreal/$id" 'P9-11 [C]'
  Ok "P9-11 [C] residuoreal/${id} (ESTA MAQUINA): la COPIA del residuo real de P10 tiene el MISMO hash antes y despues" ($x.residuo -eq 'intacto') $x.residuo
}
Cerrado 'limpia/bom-doble' 'P9-12 [D]'
$lb = $res['limpia/bom-doble']
Ok 'P9-12 [D] limpia/bom-doble: sigue SIN base de datos en la carpeta por defecto y sin registro de ubicaciones' ($lb.residuo -eq 'sigue sin existir' -and -not $lb.bdEnDefecto -and $lb.registro -eq 'intacto (no existe)') "$($lb.residuo) | $($lb.bdEnDefecto) | $($lb.registro)"
Write-Output "  (limpia/bom-doble: elementos nuevos fuera de las caches de Chromium: $(if ($lb.nuevos) { $lb.nuevos } else { 'ninguno' }))"
Cerrado 'limpia/relativa' 'P9-12'
Cerrado 'registrada/bom-doble' 'P9-12'
Ok 'P9-12 registrada/bom-doble: se detiene ANTES de A3.3 (PS-1020, no PS-1016) y sin recrear nada en la carpeta por defecto' ($res['registrada/bom-doble'].ps -eq 'PS-1020' -and -not $res['registrada/bom-doble'].bdEnDefecto) ($res['registrada/bom-doble'] | ConvertTo-Json -Compress)
$lv = $res['limpia/valido']
Ok 'P9-1 limpia/valido: abre la compartida y no crea nada en la de por defecto (control)' ($lv.db -eq 'COMPARTIDA' -and $lv.residuo -eq 'sigue sin existir') ($lv | ConvertTo-Json -Compress)
Cerrado 'guard/bom-doble' 'P9-13'
$gd = $res['guard/bom-doble']
Ok 'P9-13 guard/bom-doble: la proteccion de apagado NO se toca (marca intacta, ni reg ni schtasks pedidos)' ($gd.guardia -match '^marca SIGUE' -and $gd.bloqueados -notmatch 'reg\.exe|schtasks') "$($gd.guardia) | $($gd.bloqueados)"
$gv = $res['guard/valido']
Ok 'P9-13 guard/valido: la proteccion sigue activa y no se pide nada al sistema (control)' ($gv.db -eq 'COMPARTIDA' -and $gv.guardia -match '^marca SIGUE' -and $gv.bloqueados -notmatch 'reg\.exe|schtasks') ($gv | ConvertTo-Json -Compress)
$gb = $res['guard/bom']
Ok 'P9-13 guard/bom: con BOM (ya valido) abre la compartida y la proteccion SIGUE activa (antes: se desactivaba)' ($gb.db -eq 'COMPARTIDA' -and $gb.guardia -match '^marca SIGUE' -and $gb.bloqueados -notmatch 'reg\.exe|schtasks' -and $gb.ndialogos -eq 0) ($gb | ConvertTo-Json -Compress)
$gm = $res['guard/no-montada']
Ok 'P9-V [REGISTRA] guard/no-montada (JSON valido, unidad no montada): tras PS-1005 y datos locales la proteccion se sigue desactivando - previo a P9, fuera de alcance' ($gm.dialogos -match 'PS-1005' -and $gm.guardia -match '^marca BORRADA' -and $gm.bloqueados -match 'reg\.exe delete') ($gm | ConvertTo-Json -Compress)
$ine = $res['residuo/inexistente']
Ok 'P9-V [REGISTRA] residuo/inexistente (JSON valido): crea la carpeta y pregunta PS-1009 - sin cambios' ($ine.nuevos -match 'no-existe-aun' -and $ine.dialogos -match 'PS-1009' -and $ine.db -eq 'POR DEFECTO') ($ine | ConvertTo-Json -Compress)
foreach ($id in @('no-montada','inaccesible')) {
  $x = $res["residuo/$id"]
  Ok "P9-V [REGISTRA] residuo/${id} (JSON valido): aviso PS-1005 tras ~25 s; con 'datos locales' abre la de por defecto - sin cambios" ($x.dialogos -match 'PS-1005' -and $x.db -eq 'POR DEFECTO') ($x | ConvertTo-Json -Compress)
}
$rv = $res['residuoreal/valido']
Ok 'P9-11 residuoreal/valido: abre la compartida y la COPIA del residuo real queda intacta (control)' ($rv.db -eq 'COMPARTIDA' -and $rv.residuo -eq 'intacto') ($rv | ConvertTo-Json -Compress)
$rb = $res['residuoreal/bom']
Ok 'P9-11 residuoreal/bom (ESTA MAQUINA, el caso que antes abria el residuo): abre la COMPARTIDA y la copia del residuo queda intacta' ($rb.db -eq 'COMPARTIDA' -and $rb.proyectos -eq 'PROYECTO EN LA COMPARTIDA' -and $rb.residuo -eq 'intacto' -and $rb.ndialogos -eq 0) ($rb | ConvertTo-Json -Compress)
$cb = ($res.Values | ForEach-Object { $_.copiasBloqueadas } | Where-Object { $_ }) -join ','
Ok 'P9-X ningun caso intenta copiar nada fuera del sandbox' (-not $cb) $cb
$to = @($res.Keys | Where-Object { $res[$_].lanz -like 'TIMEOUT*' })
Ok 'P9-X ningun caso se queda colgado' ($to.Count -eq 0) ($to -join ',')
$bl = ($res.Values | ForEach-Object { $_.bloqueados } | Where-Object { $_ }) -join ','
Write-Output "  procesos bloqueados por el arnes (todos los casos): $bl"
}

Write-Output ""
Write-Output "======================================================================"
Write-Output "  P9 ELECTRON REAL: $global:OK OK / $global:FALLO FALLOS$(if ($SOLO.Count) { '  (modo P9_SOLO: sin aserciones)' })"
Write-Output "======================================================================"
if (Test-Path $R) { Remove-Item -LiteralPath $R -Recurse -Force -ErrorAction SilentlyContinue }
[Environment]::SetEnvironmentVariable('P9_MAIN_FUENTE', $FUENTE, 'Process')
[Environment]::SetEnvironmentVariable('APPDATA', $APPDATA_0, 'Process')
[Environment]::SetEnvironmentVariable('LOCALAPPDATA', $LOCALAPPDATA_0, 'Process')
$bdDespues = (Get-FileHash $BDVIVA -Algorithm SHA256).Hash
Write-Output "BD VIVA IDENTICA: $($bdAntes -eq $bdDespues)"
Write-Output "Config real (panorama-app-config) INTACTA: $($cfgAntes -eq (HuellaDir $CFGREAL))"
Write-Output "Residuo P10 real INTACTO: $($resAntes -eq (Get-FileHash $RESIDUO_REAL -Algorithm SHA256).Hash)"
$prodOk = $true; foreach ($f in $prodFiles) { if ((Get-FileHash (Join-Path $P $f) -Algorithm SHA256).Hash -ne $prodAntes[$f]) { $prodOk = $false; Write-Output "  CAMBIO EN PRODUCCION: $f" } }
Write-Output "Archivos productivos intactos: $prodOk"
Write-Output "Entrada PanoramaDriveSyncGuard en HKCU Run SIN CAMBIOS (mismo valor antes y despues): $($runValorAntes -eq (ValorRun))"
Write-Output "sandbox borrado: $(-not (Test-Path $R))"
if ($global:FALLO -gt 0) { exit 1 }
