@echo off
setlocal enabledelayedexpansion
echo === Panorama del Servicio - Restaurar copia de seguridad de app.asar ===
echo.

set "DEFAULT_DIR=%APPDATA%\panorama-app"
set "CONFIG_FILE=%APPDATA%\panorama-app-config\location.json"
set "DATA_DIR=%DEFAULT_DIR%"

if exist "%CONFIG_FILE%" (
  set "RAW="
  for /f "tokens=1,* delims=:" %%A in ('findstr "userDataDir" "%CONFIG_FILE%"') do set "RAW=%%B"
  if defined RAW (
    set "RAW=!RAW:"=!"
    set "RAW=!RAW:,=!"
    if "!RAW:~0,1!"==" " set "RAW=!RAW:~1!"
    set "RAW=!RAW:\\=\!"
    if exist "!RAW!" set "DATA_DIR=!RAW!"
  )
)

echo Carpeta de datos: %DATA_DIR%
echo.

set "LATEST="
for /f "delims=" %%F in ('dir /b /o-n "%DATA_DIR%\app.asar.bak-*" 2^>nul') do (
  if not defined LATEST set "LATEST=%%F"
)

if not defined LATEST (
  echo No se ha encontrado ningun archivo "app.asar.bak-*" en esa carpeta.
  echo Si tu carpeta de datos real es otra ^(revisa Configuracion -^> "Ver registro de la
  echo aplicacion..." si la app abre, o busca a mano una carpeta con "panorama.sqlite3"
  echo dentro^), copia el archivo app.asar.bak-... de ahi junto a este .bat y vuelve a
  echo ejecutarlo, o restauralo a mano como se explico antes.
  echo.
  pause
  exit /b 1
)

echo Copia de seguridad mas reciente encontrada: %LATEST%
set "TARGET=%~dp0app.asar"

if exist "%TARGET%" (
  copy /y "%TARGET%" "%~dp0app.asar.broken.bak" >nul
  echo Copia del app.asar actual guardada, por si acaso, como: app.asar.broken.bak
)

copy /y "%DATA_DIR%\%LATEST%" "%TARGET%" >nul
if errorlevel 1 (
  echo.
  echo ERROR: no se pudo copiar el archivo. Prueba a ejecutar este .bat como
  echo administrador ^(clic derecho sobre el -^> "Ejecutar como administrador"^).
) else (
  echo.
  echo HECHO. Se ha restaurado "%LATEST%" sobre app.asar.
  echo Ya puedes abrir "Panorama del Servicio" con normalidad.
)

echo.
pause
