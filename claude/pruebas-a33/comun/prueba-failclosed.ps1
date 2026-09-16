# Demuestra que un ARNES REAL (bloque5/bench-rename.js) aborta con exit 99
# cuando location.json existe y no se puede interpretar. Se enga~na solo a
# APPDATA; la ubicacion real del usuario no se toca.
# OJO: NO poner $ErrorActionPreference='Stop'. En PowerShell 5.1 el `2>&1` de
# un .exe convierte cada linea de stderr en un ErrorRecord (NativeCommandError)
# y con 'Stop' el script muere en el primer arnes que aborta - que es
# justamente lo que esta prueba quiere observar.
$ErrorActionPreference = 'Continue'
$s  = 'C:\Users\ADMIN~1.JLO\AppData\Local\Temp\claude\C--Codigo-Fuente-PS\e55d4471-ea3f-4279-b758-0366ccb6384c\scratchpad'
$e  = 'C:\Codigo Fuente PS\panorama-app-codigo-fuente_1\node_modules\electron\dist\electron.exe'
$fake = Join-Path $s '_fake-appdata'
$cfg  = Join-Path $fake 'panorama-app-config'
$loc  = Join-Path $cfg 'location.json'
$real = $env:APPDATA

if (Test-Path $fake) { Remove-Item -LiteralPath $fake -Recurse -Force }
New-Item -ItemType Directory -Force -Path $cfg | Out-Null

function Probar([string]$etq, $bytes) {
  if (Test-Path -LiteralPath $loc) { Remove-Item -LiteralPath $loc -Force }
  if ($null -ne $bytes) { [System.IO.File]::WriteAllBytes($loc, $bytes) }
  $env:APPDATA = $fake
  $out = & $e "$s\bloque5\bench-rename.js" --reducido 2>&1 | Out-String
  $code = $LASTEXITCODE
  $env:APPDATA = $real
  $linea = ($out -split "`n" | Where-Object { $_ -match 'ABORTADO' } | Select-Object -First 1)
  if ($null -eq $linea) { $linea = '(no aborto)' }
  Write-Output ("  {0,-26} exit={1,-4} {2}" -f $etq, $code, $linea.Trim())
}

$U = [System.Text.Encoding]::UTF8
Probar 'BOM + JSON valido'      (([byte[]](0xEF,0xBB,0xBF)) + $U.GetBytes('{"userDataDir":"C:/x"}'))
Probar 'JSON truncado'          ($U.GetBytes('{"userDataDir":"C:/x'))
Probar 'sin clave reconocida'   ($U.GetBytes('{"shared":true}'))
Probar 'userDataDir no-cadena'  ($U.GetBytes('{"userDataDir":42}'))
Probar 'JSON que no es objeto'  ($U.GetBytes('["C:/x"]'))
Probar 'ausente'                $null

Remove-Item -LiteralPath $fake -Recurse -Force
Write-Output ''
Write-Output '  --- APPDATA real, --base apuntando a la ubicacion viva ---'
$out = & $e "$s\bloque5\bench-rename.js" --base="G:\Mi unidad\BD-PanoramaServicio" 2>&1 | Out-String
Write-Output ("  exit={0}" -f $LASTEXITCODE)
$out -split "`n" | Where-Object { $_ -match 'ABORTADO|ruta:' } | ForEach-Object { '  ' + $_.Trim() }
