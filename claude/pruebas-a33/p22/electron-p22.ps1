# ---------------------------------------------------------------------------
# P22 - la carpeta de datos LOCAL no se abre ni se crea sin decirlo.
# EXIGENTE desde la implementacion (17 sept 2026). Era descriptivo (14 OK / 0
# describiendo el defecto); esas aserciones quedan INVERTIDAS.
# Todo en %TEMP%\_a33-p9-p22. La BD "local" de cada caso es una COPIA de la de
# P10 (solo se dice CUANTOS proyectos tiene). Arnes: real-run\p22-reserva.js
# (envuelve p9-ubicacion.js: bloquea reg/schtasks/powershell y copias fuera del
# sandbox; anota los avisos de ventana y contesta segun P22_ELECCION).
# NO toca la BD viva, ni la config real, ni P10.
# Sin caracteres acentuados: PowerShell 5.1 lee este archivo como ANSI.
# OJO: ninguna variable que difiera de otra solo en mayusculas.
# ---------------------------------------------------------------------------
$ErrorActionPreference = 'Continue'
$APPDATA_0 = $env:APPDATA; $LOCALAPPDATA_0 = $env:LOCALAPPDATA
$P    = 'C:\Codigo Fuente PS\panorama-app-codigo-fuente_1'
$wrap = "$P\claude\pruebas-a33\real-run\p22-reserva.js"
$ep   = "$P\node_modules\electron\dist\electron.exe"
$BDVIVA = 'G:\Mi unidad\BD-PanoramaServicio\panorama.sqlite3'
$CFGREAL = Join-Path $env:APPDATA 'panorama-app-config'
$RESIDUO_REAL = Join-Path $env:APPDATA 'panorama-app\panorama.sqlite3'

function HuellaDir($d) { if (-not (Test-Path $d)) { return '(no existe)' }; (Get-ChildItem $d -Force -Recurse -File | ForEach-Object { $_.FullName + '|' + $_.Length + '|' + $_.LastWriteTimeUtc.Ticks }) -join ';' }
$bdAntes = (Get-FileHash $BDVIVA -Algorithm SHA256).Hash
$cfgAntes = HuellaDir $CFGREAL
$resAntes = (Get-FileHash $RESIDUO_REAL -Algorithm SHA256).Hash
$prodFiles = @('main.js','db.js','security.js','preload.js','build\installer.nsh','claude\Restaurar-backup.bat')
$prodAntes = @{}; foreach ($f in $prodFiles) { $prodAntes[$f] = (Get-FileHash (Join-Path $P $f) -Algorithm SHA256).Hash }
function ValorRun() { $v = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name PanoramaDriveSyncGuard -ErrorAction SilentlyContinue; if ($v) { [string]$v.PanoramaDriveSyncGuard } else { '(no existe)' } }
$runValorAntes = ValorRun
Write-Output "BD VIVA antes: $($bdAntes.Substring(0,16))   residuo P10 real: $($resAntes.Substring(0,16))"

$R = Join-Path $env:TEMP '_a33-p9-p22'
if ($R -notlike '*_a33-p9-p22*' -or $R -match ' ') { throw "sandbox inesperado: $R" }
if (Test-Path $R) { Remove-Item -LiteralPath $R -Recurse -Force -ErrorAction SilentlyContinue }
New-Item -ItemType Directory -Force -Path $R | Out-Null
$global:OK = 0; $global:FALLO = 0
function Ok($n, $c, $extra) { if ($c) { $global:OK++; Write-Output "  OK    $n" } else { $global:FALLO++; Write-Output "  FALLO $n  -- $extra" } }

$U8 = New-Object System.Text.UTF8Encoding $false
function Instalador($ruta) { "{`r`n  `"userDataDir`": `"$ruta`",`r`n  `"shared`": true`r`n}`r`n" }
function Lanzar($S, $modo, $nombre, $tope, $eleccion) {
  [Environment]::SetEnvironmentVariable('LOCALAPPDATA', "$S\Local", 'Process')
  [Environment]::SetEnvironmentVariable('APPDATA', "$S\Roaming", 'Process')
  [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process')
  [Environment]::SetEnvironmentVariable('P22_ELECCION', $eleccion, 'Process')
  $argv = @("`"$wrap`"", "`"--sandbox=$S`"", "--modo=$modo")
  if ($nombre) { $argv += "`"--nombre=$nombre`"" }
  $proc = Start-Process -FilePath $ep -ArgumentList $argv -WorkingDirectory $S -PassThru -WindowStyle Minimized
  $t0 = Get-Date
  while (-not $proc.HasExited -and ((Get-Date) - $t0).TotalSeconds -lt $tope) { Start-Sleep -Milliseconds 400 }
  $seg = [Math]::Round(((Get-Date) - $t0).TotalSeconds)
  if (-not $proc.HasExited) { $proc.Kill(); Start-Sleep -Milliseconds 800; return "TIMEOUT tras $seg s" }
  return "exit $($proc.ExitCode) en $seg s"
}

# ============================ BASE =============================================
$B = "$R\base"
New-Item -ItemType Directory -Force -Path "$B\Roaming\panorama-app-config","$B\Local","$B\G\Compartida\BD-P22" | Out-Null
[IO.File]::WriteAllText("$B\Roaming\panorama-app-config\location.json", (Instalador ("$B\G\Compartida\BD-P22" -replace '\\','/')), $U8)
Write-Output "preparar compartida: $(Lanzar $B 'preparar' 'PROYECTO EN LA COMPARTIDA' 120 'local')"
Remove-Item "$B\Roaming\panorama-app-config\location.json" -Force
Remove-Item "$B\Roaming\panorama-app-config\ubicaciones-inicializadas.json" -Force -ErrorAction SilentlyContinue
Remove-Item "$B\Roaming\panorama-app-config\historial-ubicacion.json" -Force -ErrorAction SilentlyContinue
Get-ChildItem $B -Recurse -Force -File | Where-Object { $_.Name -like '.panorama-lock*' -or $_.Name -in @('test.log','resultado.json','avisos.json') } | Remove-Item -Force
$okBase = Test-Path "$B\G\Compartida\BD-P22\panorama.sqlite3"
Ok 'P22-X0 base preparada: una BD en la carpeta compartida del sandbox' $okBase ''
if (-not $okBase) { Write-Output 'ABORTADO: sin base'; exit 1 }

# ============================ CASOS ============================================
# base:   residuoreal | limpia | limpiasinmarca | localnormal | cerobytes | nosqlite
# config: no-montada (PS-1005) | inexistente (PS-1009) | bloqueada (PS-1022) | sin-location
$casos = @(
  @{ id='A-esc';          base='residuoreal';    config='no-montada';   eleccion='esc';    tope=150 },
  @{ id='A-local';        base='residuoreal';    config='no-montada';   eleccion='local';  tope=150 },
  @{ id='B-esc';          base='residuoreal';    config='inexistente';  eleccion='esc';    tope=150 },
  @{ id='B-local';        base='residuoreal';    config='inexistente';  eleccion='local';  tope=150 },
  @{ id='B2-esc';         base='residuoreal';    config='bloqueada';    eleccion='esc';    tope=150 },
  @{ id='B2-local';       base='residuoreal';    config='bloqueada';    eleccion='local';  tope=150 },
  @{ id='C-esc';          base='residuoreal';    config='sin-location'; eleccion='esc';    tope=100 },
  @{ id='C-local';        base='residuoreal';    config='sin-location'; eleccion='local';  tope=100 },
  @{ id='C-vacia-esc';    base='limpia';         config='sin-location'; eleccion='esc';    tope=100 },
  @{ id='C-vacia-crear';  base='limpia';         config='sin-location'; eleccion='crear';  tope=100 },
  @{ id='primera-vez';    base='limpiasinmarca'; config='sin-location'; eleccion='esc';    tope=100 },
  @{ id='local-de-siempre'; base='localnormal';  config='sin-location'; eleccion='esc';    tope=100 },
  @{ id='cero-bytes';     base='cerobytes';      config='sin-location'; eleccion='esc';    tope=100 },
  @{ id='no-sqlite';      base='nosqlite';       config='sin-location'; eleccion='esc';    tope=100 }
)
$FILTRO_CHROMIUM = '(^|\\)(Partitions|projects|backups|Cache|Code Cache|GPUCache|DawnCache|DawnGraphiteCache|DawnWebGPUCache|blob_storage|Session Storage|Local Storage|Network|Shared Dictionary|shared_proto_db|VideoDecodeStats|WebStorage|Crashpad|Dictionaries|Service Worker|IndexedDB|databases|leveldb)(\\|$)'
$res = [ordered]@{}
# La marca de ubicacion NO es un archivo congelado: con location.json valido la
# app la REFRESCA en cada arranque (ese es el mecanismo de durabilidad). Lo que
# no puede pasar es que se pierda la constancia ni su 'primera_vez'. Por eso se
# mide el contenido, no solo el hash.
function LeerMarca($p) {
  if (-not (Test-Path $p)) { return $null }
  try { return (Get-Content $p -Raw -Encoding UTF8 | ConvertFrom-Json) } catch { return 'ROTA' }
}
function ClaveMarca($m) { if ($m -and $m -ne 'ROTA' -and $m.personalizada) { return $m.personalizada.clave_sha256 } return $null }
function PrimeraVezMarca($m) { if ($m -and $m -ne 'ROTA' -and $m.personalizada) { return $m.personalizada.primera_vez } return $null }

foreach ($c in $casos) {
  $clave = $c.id
  $S = "$R\c-$($c.id)"
  Copy-Item -LiteralPath $B -Destination $S -Recurse -Force
  $G = "$S\G\Compartida\BD-P22" -replace '\\','/'
  $def = "$S\Roaming\panorama-app"
  $cfg = "$S\Roaming\panorama-app-config"
  $reg = "$cfg\ubicaciones-inicializadas.json"
  $hist = "$cfg\historial-ubicacion.json"
  $flag = "$S\Local\PanoramaDriveSyncGuard\enabled.flag"
  New-Item -ItemType Directory -Force -Path $def | Out-Null
  Get-ChildItem $def -Force -File -Filter 'panorama.sqlite3*' -ErrorAction SilentlyContinue | Remove-Item -Force
  switch ($c.base) {
    'residuoreal'    { Copy-Item -LiteralPath $RESIDUO_REAL -Destination "$def\panorama.sqlite3" }
    'limpia'         { }
    'limpiasinmarca' { }
    'localnormal'    { Copy-Item -LiteralPath $RESIDUO_REAL -Destination "$def\panorama.sqlite3" }
    'cerobytes'      { [IO.File]::WriteAllBytes("$def\panorama.sqlite3", @()) }
    'nosqlite'       { [IO.File]::WriteAllText("$def\panorama.sqlite3", 'esto no es una base de datos: resto de una copia a medias', $U8) }
  }
  # Marca historica + proteccion de apagado: en todos menos en los dos casos que
  # representan un equipo sin historia (primera vez y local de siempre).
  if ($c.base -notin @('limpiasinmarca','localnormal')) {
    [IO.File]::WriteAllText($hist, "{`"v`":1,`"personalizada`":{`"clave_sha256`":`"$('a'*64)`",`"compartida`":true,`"primera_vez`":`"2026-08-01T00:00:00.000Z`",`"ultima_vez`":`"2026-09-01T00:00:00.000Z`"},`"decisiones`":[]}", $U8)
    New-Item -ItemType Directory -Force -Path (Split-Path $flag) | Out-Null
    [IO.File]::WriteAllText($flag, (Get-Date).ToString('o'), $U8)
    [IO.File]::WriteAllText("$S\Local\PanoramaDriveSyncGuard\heartbeat.txt", (Get-Date).ToString('o'), $U8)
  }
  if ($c.base -eq 'localnormal') {
    $k = $def.ToLower() -replace '\\','\\'
    [IO.File]::WriteAllText($reg, "{`"v`":1,`"ubicaciones`":{`"$k`":{`"estado`":`"inicializada`"}}}", $U8)
  }
  switch ($c.config) {
    'no-montada'   { [IO.File]::WriteAllText("$cfg\location.json", (Instalador 'Q:/no-montada/BD'), $U8) }
    'inexistente'  { [IO.File]::WriteAllText("$cfg\location.json", (Instalador ($G + '/no-existe-aun')), $U8) }
    'bloqueada'    { [IO.File]::WriteAllText("$cfg\location.json", (Instalador $G), $U8) }
    'sin-location' { }
  }
  $hBdAntes = if (Test-Path "$def\panorama.sqlite3") { (Get-FileHash "$def\panorama.sqlite3").Hash } else { '(no existe)' }
  $hHistAntes = if (Test-Path $hist) { (Get-FileHash $hist).Hash } else { '(no existe)' }
  $mAntes = LeerMarca $hist
  $hRegAntes = if (Test-Path $reg) { (Get-FileHash $reg).Hash } else { '(no existe)' }
  $hFlagAntes = if (Test-Path $flag) { (Get-FileHash $flag).Hash } else { '(no existe)' }
  $genAntes = Test-Path "$def\panorama.sqlite3.gen"
  $itemsAntes = @(Get-ChildItem $S -Recurse -Force | ForEach-Object { $_.FullName })
  $lineasAntes = @{}
  foreach ($lf in @(Get-ChildItem $S -Recurse -Filter app.log -File | ForEach-Object { $_.FullName })) { $lineasAntes[$lf] = @(Get-Content $lf -Encoding UTF8).Count }
  $bloqueo = $null
  if ($c.config -eq 'bloqueada') { $bloqueo = [IO.File]::Open("$S\G\Compartida\BD-P22\panorama.sqlite3", 'Open', 'Read', 'None') }
  $lanz = Lanzar $S 'caso' $null $c.tope $c.eleccion
  if ($bloqueo) { $bloqueo.Close(); $bloqueo = $null }
  $resJson = $null
  if (Test-Path "$S\resultado.json") { $resJson = Get-Content "$S\resultado.json" -Raw -Encoding UTF8 | ConvertFrom-Json }
  $avisos = @(); if (Test-Path "$S\avisos.json") { $avisos = @(Get-Content "$S\avisos.json" -Encoding UTF8 | Where-Object { $_ } | ForEach-Object { $_ | ConvertFrom-Json }) }
  $hBdDespues = if (Test-Path "$def\panorama.sqlite3") { (Get-FileHash "$def\panorama.sqlite3").Hash } else { '(no existe)' }
  $hHistDespues = if (Test-Path $hist) { (Get-FileHash $hist).Hash } else { '(no existe)' }
  $mDespues = LeerMarca $hist
  $clA = ClaveMarca $mAntes; $clD = ClaveMarca $mDespues
  $pvA = PrimeraVezMarca $mAntes; $pvD = PrimeraVezMarca $mDespues
  $hRegDespues = if (Test-Path $reg) { (Get-FileHash $reg).Hash } else { '(no existe)' }
  $hFlagDespues = if (Test-Path $flag) { (Get-FileHash $flag).Hash } else { '(no existe)' }
  $marca = "\c-$($c.id)\"
  $nuevos = @(Get-ChildItem $S -Recurse -Force | ForEach-Object { $_.FullName } | Where-Object { $itemsAntes -notcontains $_ } | ForEach-Object { $_.Substring($_.IndexOf($marca) + $marca.Length) } | Where-Object { $_ -notmatch '^Local(\\|$)' -and $_ -notmatch $FILTRO_CHROMIUM -and $_ -notin @('test.log','resultado.json','avisos.json') })
  $log = @()
  foreach ($lf in @(Get-ChildItem $S -Recurse -Filter app.log -File | ForEach-Object { $_.FullName })) {
    $todas = @(Get-Content $lf -Encoding UTF8)
    $desde = if ($lineasAntes.ContainsKey($lf)) { $lineasAntes[$lf] } else { 0 }
    if ($todas.Count -gt $desde) { $log += $todas[$desde..($todas.Count - 1)] }
  }
  $nativos = @($avisos | Where-Object { $_.tipo -eq 'nativo' })
  $enVentana = @($avisos | Where-Object { $_.tipo -ne 'nativo' })
  $o = [ordered]@{
    lanz = $lanz
    motivo = if ($resJson) { $resJson.motivo } else { '(sin resultado)' }
    db = if ($resJson -and $resJson.db) { if ($resJson.db -like "$def*") { 'POR DEFECTO' } elseif ($resJson.db -like ("$S\G\Compartida\BD-P22" + '*') -or $resJson.db -like ($G + '*')) { 'COMPARTIDA' } else { 'OTRA' } } else { '(ninguna)' }
    proyectos = if (-not $resJson) { '' } elseif ($resJson.proyectos -is [string]) { $resJson.proyectos } elseif ($resJson.db -like "$def*") { "$(@($resJson.proyectos).Count) proyectos (nombres no se muestran)" } else { ($resJson.proyectos -join ' | ') }
    dialogos = (($nativos | ForEach-Object { "$($_.ps) '$($_.titulo)' botones=[$($_.botones -join '|')] cancel=$($_.cancelId) -> '$($_.elegido)'" }) -join ' || ')
    ndialogos = $nativos.Count
    avisosEnVentana = (($enVentana | ForEach-Object { "$($_.ps) '$($_.titulo)'" }) -join ' || ')
    ventanas = if ($resJson -and $resJson.ventanas) { (@($resJson.ventanas | ForEach-Object { $_.url }) -join ', ') } else { '' }
    bdLocal = if ($hBdAntes -eq '(no existe)' -and $hBdDespues -eq '(no existe)') { 'sigue sin existir' } elseif ($hBdAntes -eq $hBdDespues) { 'INTACTA' } elseif ($hBdAntes -eq '(no existe)') { 'CREADA' } else { 'MODIFICADA' }
    gen = if ((Test-Path "$def\panorama.sqlite3.gen") -eq $genAntes) { 'igual' } else { 'CAMBIA' }
    registro = if ($hRegAntes -eq $hRegDespues) { 'intacto' } else { 'CAMBIADO' }
    historial = if ($hHistAntes -eq $hHistDespues) { 'intacto' } else { 'CAMBIADO' }
    marca = if (-not $clA -and -not $clD) { if ($hHistAntes -eq $hHistDespues) { 'no consta, sin cambios' } else { 'ARCHIVO TOCADO SIN DEJAR CONSTANCIA' } }
            elseif (-not $clA) { 'CREADA' }
            elseif (-not $clD) { 'PERDIDA' }
            elseif ($hHistAntes -eq $hHistDespues) { 'intacta' }
            elseif ($pvD -eq $pvA) { 'sigue constando (refrescada)' }
            else { 'REESCRITA DESDE CERO (primera_vez perdida)' }
    guardia = if ($hFlagAntes -eq '(no existe)') { '(sin marca)' } elseif ($hFlagDespues -eq '(no existe)') { 'marca BORRADA' } elseif ($hFlagDespues -eq $hFlagAntes) { 'marca intacta' } else { 'marca REESCRITA' }
    pedidosAlSistema = if ($resJson) { (($resJson.bloqueados | Where-Object { $_ -match 'reg\.exe|schtasks' }) -join ',') } else { '' }
    autorizacion = (($log | Where-Object { $_ -match 'autorizaci.n de creaci.n' }) -replace '^\[[^\]]+\] A3\.3 . ', '') -join ' / '
    ps = (($log | Select-String -Pattern 'PS-\d{4}' -AllMatches | ForEach-Object { $_.Matches.Value }) | Select-Object -Unique) -join ','
    nuevos = ($nuevos -join ', ')
  }
  $res[$clave] = $o
  Write-Output ""
  Write-Output "===== $clave ($($c.base) / $($c.config) / $($c.eleccion)) ====="
  foreach ($k in $o.Keys) { Write-Output ("  {0,-18} {1}" -f $k, $o[$k]) }
}

Write-Output ""
Write-Output "==================== P22 EXIGIDO EN LA APP REAL ===================="
function Cerrado($clave, $etq, $codigo) {
  $x = $res[$clave]
  Ok "$etq ${clave}: sale $codigo y la app se CIERRA sin abrir ninguna base de datos" ($x.dialogos -match $codigo -and $x.db -ne 'POR DEFECTO' -and $x.proyectos -match '^ERR' -and $x.motivo -match 'app\.quit') ($x | ConvertTo-Json -Compress)
  Ok "$etq ${clave}: la base de datos local queda INTACTA, sin .gen y sin tocar el registro de A3.3" ($x.bdLocal -in @('INTACTA','sigue sin existir') -and $x.gen -eq 'igual' -and $x.registro -eq 'intacto') "$($x.bdLocal) | $($x.gen) | $($x.registro)"
  # La marca puede refrescarse (con location.json valido se registra la ubicacion
  # configurada), pero NUNCA puede perderse ni perder su 'primera_vez': si se
  # perdiera, el arranque siguiente creeria que es una instalacion nueva.
  Ok "$etq ${clave}: la marca historica NO se pierde y la proteccion de apagado sigue como estaba" ($x.marca -in @('intacta','sigue constando (refrescada)','no consta, sin cambios') -and $x.guardia -in @('marca intacta','(sin marca)') -and -not $x.pedidosAlSistema) "$($x.marca) | $($x.guardia) | $($x.pedidosAlSistema)"
}
# --- Esc y X: nunca significan 'usar local' ------------------------------------
Cerrado 'A-esc' 'P22-1' 'PS-1005'
$a = $res['A-esc']
Ok 'P22-1b PS-1005 ofrece Reintentar, el boton explicito de datos locales y Cerrar, y Esc/X es Cerrar' ($a.dialogos -match 'botones=\[Reintentar\|Usar estos datos locales\|Cerrar\] cancel=2' -and $a.dialogos -match "-> 'Cerrar'") $a.dialogos
Cerrado 'B-esc' 'P22-4' 'PS-1009'
Ok 'P22-4b PS-1009 gana el boton Cerrar y Esc/X lo elige' ($res['B-esc'].dialogos -match 'Cerrar\] cancel=3') $res['B-esc'].dialogos
Cerrado 'B2-esc' 'P22-5' 'PS-1022'
Ok 'P22-5b la BD compartida ilegible YA NO cae sola en la local: hay dialogo ANTES y cero aperturas locales' ($res['B2-esc'].ndialogos -ge 1 -and $res['B2-esc'].db -ne 'POR DEFECTO' -and $res['B2-esc'].bdLocal -eq 'INTACTA') ($res['B2-esc'] | ConvertTo-Json -Compress)
Cerrado 'C-esc' 'P22-6' 'PS-1021'
Cerrado 'C-vacia-esc' 'P22-7' 'PS-1021'
Ok 'P22-7b sin BD local y con marca historica: el boton es 'Crear una base de datos local vacia' y al cerrar NO se crea nada' ($res['C-vacia-esc'].dialogos -match 'Crear una base de datos local vacia|Crear una base de datos local vac' -and $res['C-vacia-esc'].bdLocal -eq 'sigue sin existir') $res['C-vacia-esc'].dialogos
Cerrado 'cero-bytes' 'P22-13' 'PS-1023'
Cerrado 'no-sqlite' 'P22-14' 'PS-1023'
Ok 'P22-13b/14b un archivo presente pero invalido NO se trata como ausencia: no se crea otra encima ni se trunca' ($res['cero-bytes'].bdLocal -eq 'INTACTA' -and $res['no-sqlite'].bdLocal -eq 'INTACTA' -and $res['cero-bytes'].autorizacion -eq '' -and $res['no-sqlite'].autorizacion -eq '') ("cero=" + $res['cero-bytes'].bdLocal + " nosqlite=" + $res['no-sqlite'].bdLocal)
# --- aceptacion explicita ------------------------------------------------------
$al = $res['A-local']
Ok 'P22-3 PS-1005 + aceptacion explicita: solo entonces se abre la BD local (y la Seguridad de siempre viene DESPUES)' ($al.db -eq 'POR DEFECTO' -and $al.proyectos -match 'proyectos' -and $al.dialogos -match "-> 'Usar estos datos locales'") ($al | ConvertTo-Json -Compress)
Ok 'P22-10 sesion local temporal: la proteccion de apagado sigue intacta y no se pide nada al sistema' ($al.guardia -eq 'marca intacta' -and -not $al.pedidosAlSistema) "$($al.guardia) | $($al.pedidosAlSistema)"
Ok 'P22-11 ...y la marca historica sobrevive a esa sesion (sigue constando, con su primera_vez)' ($al.marca -in @('intacta','sigue constando (refrescada)')) $al.marca
$bl = $res['B-local']
Ok 'P22-4c PS-1009 + 'usar los datos locales' pasa por la confirmacion PS-1021 antes de abrir' ($bl.ndialogos -eq 2 -and $bl.dialogos -match 'PS-1009' -and $bl.dialogos -match 'PS-1021' -and $bl.db -eq 'POR DEFECTO') ($bl | ConvertTo-Json -Compress)
$b2l = $res['B2-local']
Ok 'P22-5c ...y con la BD compartida ilegible, solo tras elegirlo se usa la local' ($b2l.dialogos -match 'PS-1022' -and $b2l.db -eq 'POR DEFECTO') ($b2l | ConvertTo-Json -Compress)
$cl = $res['C-local']
Ok 'P22-6b sin location.json: se abre la BD local solo tras aceptarlo, y la proteccion sigue intacta' ($cl.dialogos -match 'PS-1021' -and $cl.db -eq 'POR DEFECTO' -and $cl.guardia -eq 'marca intacta' -and $cl.historial -eq 'intacto') ($cl | ConvertTo-Json -Compress)
$cc = $res['C-vacia-crear']
Ok 'P22-7c con la autorizacion expresa SI se crea la base local vacia' ($cc.bdLocal -eq 'CREADA' -and $cc.autorizacion -match 'autoriz. expresamente') ($cc | ConvertTo-Json -Compress)
Ok 'P22-11b sin location.json la marca NO se toca: solo una ubicacion propia CONFIGURADA se registra' (($res['C-esc'].historial -eq 'intacto') -and ($res['C-local'].historial -eq 'intacto') -and ($res['C-vacia-esc'].historial -eq 'intacto')) ("C-esc=" + $res['C-esc'].historial + " C-local=" + $res['C-local'].historial + " C-vacia-esc=" + $res['C-vacia-esc'].historial)
Ok 'P22-11c ...y con location.json valido SI se registra, conservando la primera_vez anterior' (($res['A-esc'].marca -eq 'sigue constando (refrescada)') -and ($res['B-esc'].marca -eq 'sigue constando (refrescada)') -and ($res['B2-esc'].marca -eq 'sigue constando (refrescada)')) ("A-esc=" + $res['A-esc'].marca + " B-esc=" + $res['B-esc'].marca + " B2-esc=" + $res['B2-esc'].marca)
# --- lo que NO debe cambiar ----------------------------------------------------
$pv = $res['primera-vez']
Ok 'P22-8 primera instalacion de verdad (sin BD local, sin marca, sin senales): arranca SIN preguntar y crea su base' ($pv.ndialogos -eq 0 -and $pv.bdLocal -eq 'CREADA' -and $pv.autorizacion -match 'primera ejecuci') ($pv | ConvertTo-Json -Compress)
$ls = $res['local-de-siempre']
Ok 'P22-8b equipo LOCAL de toda la vida (su carpeta ya consta en A3.3): tampoco se le pregunta, abre su base' ($ls.ndialogos -eq 0 -and $ls.db -eq 'POR DEFECTO' -and $ls.proyectos -match 'proyectos') ($ls | ConvertTo-Json -Compress)
$to = @($res.Keys | Where-Object { $res[$_].lanz -like 'TIMEOUT*' })
Ok 'P22-X ningun caso se queda colgado' ($to.Count -eq 0) ($to -join ',')

Write-Output ""
Write-Output "======================================================================"
Write-Output "  P22 ELECTRON REAL: $global:OK OK / $global:FALLO FALLOS"
Write-Output "======================================================================"
if (Test-Path $R) { Remove-Item -LiteralPath $R -Recurse -Force -ErrorAction SilentlyContinue }
[Environment]::SetEnvironmentVariable('APPDATA', $APPDATA_0, 'Process')
[Environment]::SetEnvironmentVariable('LOCALAPPDATA', $LOCALAPPDATA_0, 'Process')
[Environment]::SetEnvironmentVariable('P22_ELECCION', $null, 'Process')
$bdDespues = (Get-FileHash $BDVIVA -Algorithm SHA256).Hash
Write-Output "BD VIVA IDENTICA: $($bdAntes -eq $bdDespues)"
Write-Output "Config real (panorama-app-config) INTACTA: $($cfgAntes -eq (HuellaDir $CFGREAL))"
Write-Output "Residuo P10 real INTACTO: $($resAntes -eq (Get-FileHash $RESIDUO_REAL -Algorithm SHA256).Hash)"
$prodOk = $true; foreach ($f in $prodFiles) { if ((Get-FileHash (Join-Path $P $f) -Algorithm SHA256).Hash -ne $prodAntes[$f]) { $prodOk = $false; Write-Output "  CAMBIO EN PRODUCCION: $f" } }
Write-Output "Archivos productivos intactos: $prodOk"
Write-Output "Entrada PanoramaDriveSyncGuard en HKCU Run SIN CAMBIOS (mismo valor antes y despues): $($runValorAntes -eq (ValorRun))"
Write-Output "sandbox borrado: $(-not (Test-Path $R))"
if ($global:FALLO -gt 0) { exit 1 }
