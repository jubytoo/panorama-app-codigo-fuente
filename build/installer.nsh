; ------------------------------------------------------------------
; Personalización del instalador NSIS (electron-builder).
;
; Por qué existe esto: el .exe "portable" original se rompía si el usuario
; lo movía de carpeta (arrastraba solo el .exe sin la carpeta resources/
; que lo acompaña). La solución es un instalador de Windows normal: se
; ejecuta una vez, copia todo a una carpeta de instalación fija (el usuario
; puede elegir cuál), y deja accesos directos que apuntan ahí — así nunca
; hay nada que "mover" a mano.
;
; Esta personalización añade una página propia al asistente, justo después
; de elegir la carpeta de instalación, con una casilla para crear (o no) un
; acceso directo en el escritorio — tal y como se pidió: "preguntando".
; El acceso directo del menú Inicio se sigue creando siempre automáticamente
; (createStartMenuShortcut en package.json), igual que hace cualquier
; instalador de Windows normal.
; ------------------------------------------------------------------
!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "StrFunc.nsh"

; electron-builder compila este script DOS veces: una para el instalador y
; otra (con BUILD_UNINSTALLER definido) solo para generar el desinstalador.
; El hook customPageAfterChangeDir solo se invoca en la primera pasada (ver
; assistedInstaller.nsh) — si la página y sus funciones se definieran
; incondicionalmente, en la segunda pasada NSIS las ve "no referenciadas" y
; aborta la build (warning tratado como error). Por eso todo esto va dentro
; de este !ifndef: en la pasada del desinstalador simplemente no existe.
!ifndef BUILD_UNINSTALLER
  Var DesktopShortcutCheckbox
  Var DesktopShortcutState

  ; v0.1.55: pedido explícito del usuario — que el instalador pregunte si el
  ; almacenamiento va a ser local o en una carpeta compartida (Google Drive/
  ; OneDrive/etc.), en vez de tener que ir luego a "Configuración → Cambiar
  ; ubicación de los datos..." dentro de la app ya instalada. Si se elige
  ; "en la nube" y una carpeta, se escribe DIRECTAMENTE el mismo archivo de
  ; configuración que la app ya sabe leer sola al arrancar
  ; (userDataConfigPath() en main.js → %APPDATA%\panorama-app-config\
  ; location.json) — cero código nuevo en el lado de la app para leerlo, se
  ; reutiliza tal cual el mecanismo de la 0.1.30.
  ${StrRep} ; declara la macro StrRep de StrFunc.nsh (ver documentación: hay
            ; que "usarla" una vez, sin argumentos, para que genere la
            ; función antes de poder llamarla más abajo con argumentos)

  Var StorageLocalRadio
  Var StorageCloudRadio
  Var StorageCloudPathField
  Var StorageCloudBrowseButton
  Var StorageIsCloud
  Var StorageCloudPathValue

  !macro customPageAfterChangeDir
    Page custom panoramaDesktopShortcutPageShow panoramaDesktopShortcutPageLeave
    Page custom panoramaStorageLocationPageShow panoramaStorageLocationPageLeave
  !macroend

  Function panoramaDesktopShortcutPageShow
    !insertmacro MUI_HEADER_TEXT "Acceso directo" "Elige si quieres un acceso directo en el escritorio."
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ; La etiqueta llevaba solo 24u de alto: con el texto de dos líneas que
    ; lleva, en pantallas con la letra del sistema más grande (DPI >100%,
    ; frecuente en portátiles) esa altura no bastaba y la segunda línea
    ; quedaba cortada. 40u da margen de sobra para dos líneas incluso con
    ; letra grande, y el checkbox baja para no solaparse.
    ${NSD_CreateLabel} 0 0 100% 40u "Panorama del Servicio se va a instalar. ¿Quieres también un acceso directo en el escritorio?"

    ${NSD_CreateCheckbox} 0 46u 100% 12u "Crear acceso directo en el escritorio"
    Pop $DesktopShortcutCheckbox
    ${NSD_Check} $DesktopShortcutCheckbox

    nsDialogs::Show
  FunctionEnd

  Function panoramaDesktopShortcutPageLeave
    ${NSD_GetState} $DesktopShortcutCheckbox $DesktopShortcutState
  FunctionEnd

  ; Activa/desactiva el campo de ruta y el botón "Examinar..." según qué
  ; radio esté marcado — se llama desde los dos ${NSD_OnClick} de abajo.
  Function panoramaStorageLocationRefreshEnabled
    ${NSD_GetState} $StorageCloudRadio $StorageIsCloud
    ${If} $StorageIsCloud == ${BST_CHECKED}
      EnableWindow $StorageCloudPathField 1
      EnableWindow $StorageCloudBrowseButton 1
    ${Else}
      EnableWindow $StorageCloudPathField 0
      EnableWindow $StorageCloudBrowseButton 0
    ${EndIf}
  FunctionEnd

  Function panoramaStorageLocationOnRadioClick
    Call panoramaStorageLocationRefreshEnabled
  FunctionEnd

  Function panoramaStorageLocationOnBrowseClick
    nsDialogs::SelectFolderDialog "Elige la carpeta compartida (Google Drive, OneDrive, u otra)" ""
    Pop $0
    ${If} $0 != error
      ${NSD_SetText} $StorageCloudPathField $0
    ${EndIf}
  FunctionEnd

  Function panoramaStorageLocationPageShow
    !insertmacro MUI_HEADER_TEXT "Dónde guardar los datos" "Elige si los proyectos y backups se guardan en este PC o en una carpeta compartida."
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ${NSD_CreateLabel} 0 0 100% 32u "Puedes cambiar esto más adelante desde Configuración -> Cambiar ubicación de los datos... dentro de la propia app, sin tener que reinstalar nada."

    ${NSD_CreateRadioButton} 0 38u 100% 12u "En este PC (recomendado si solo lo vas a usar desde aquí)"
    Pop $StorageLocalRadio
    ${NSD_Check} $StorageLocalRadio
    ${NSD_OnClick} $StorageLocalRadio panoramaStorageLocationOnRadioClick

    ${NSD_CreateRadioButton} 0 54u 100% 12u "En una carpeta compartida (Google Drive, OneDrive... para usarlo desde varios PCs)"
    Pop $StorageCloudRadio
    ${NSD_OnClick} $StorageCloudRadio panoramaStorageLocationOnRadioClick

    ${NSD_CreateText} 14u 72u 65% 13u ""
    Pop $StorageCloudPathField
    EnableWindow $StorageCloudPathField 0

    ${NSD_CreateBrowseButton} 82% 72u 18% 13u "Examinar..."
    Pop $StorageCloudBrowseButton
    EnableWindow $StorageCloudBrowseButton 0
    ${NSD_OnClick} $StorageCloudBrowseButton panoramaStorageLocationOnBrowseClick

    ${NSD_CreateLabel} 14u 90u 100% 24u "Si esa carpeta vive dentro de Google Drive/OneDrive, elige la carpeta YA sincronizada en este PC (no una ruta de la nube que no exista todavía aquí)."

    nsDialogs::Show
  FunctionEnd

  Function panoramaStorageLocationPageLeave
    ${NSD_GetState} $StorageCloudRadio $StorageIsCloud
    StrCpy $StorageCloudPathValue ""
    ${If} $StorageIsCloud == ${BST_CHECKED}
      ${NSD_GetText} $StorageCloudPathField $StorageCloudPathValue
      ${If} $StorageCloudPathValue == ""
        MessageBox MB_ICONEXCLAMATION|MB_OK "Elige una carpeta (o pulsa 'Examinar...') antes de continuar, o vuelve a marcar 'En este PC'."
        Abort
      ${EndIf}
      ; Se usan etiquetas con nombre (en vez de saltos relativos "+N") a
      ; propósito: un desajuste de "+N" es un error clásico y silencioso en
      ; NSIS (aterriza en la instrucción equivocada sin ningún aviso de
      ; compilación) — ya pasó una vez escribiendo esto mismo, así que se
      ; deja así de explícito para no repetirlo.
      IfFileExists "$StorageCloudPathValue\*.*" panoramaStorageFolderOk 0
        ClearErrors
        CreateDirectory "$StorageCloudPathValue"
        IfErrors panoramaStorageFolderFailed panoramaStorageFolderOk
        panoramaStorageFolderFailed:
          MessageBox MB_ICONEXCLAMATION|MB_OK "No se pudo crear/acceder a esa carpeta — elige otra."
          Abort
      panoramaStorageFolderOk:
      ; JSON no admite "\" suelto dentro de una cadena — en vez de escaparlo
      ; (\\), se cambia por "/": Windows (y Node/Electron) aceptan barras
      ; normales en una ruta exactamente igual que contrabarras, así que el
      ; resultado funciona igual y se evita toda la complicación de escapar
      ; contrabarras a mano en NSIS.
      ${StrRep} $StorageCloudPathValue $StorageCloudPathValue "\" "/"
    ${EndIf}
  FunctionEnd

  !macro customInstall
    ${If} $DesktopShortcutState == ${BST_CHECKED}
      ; El acceso directo del menú Inicio lo crea electron-builder con
      ; addStartMenuLink (installUtil.nsh), y SIEMPRE pasa el icono de forma
      ; explícita (archivo + índice) además de fijar el AUMI (Application
      ; User Model ID) del acceso directo con WinShell::SetLnkAUMI — eso es
      ; lo que hace que Windows asocie bien el icono (y el agrupado en la
      ; barra de tareas) con la app real. Nuestro acceso directo del
      ; escritorio se crea a mano justo aquí (porque createDesktopShortcut
      ; está a false en package.json, para poder preguntar antes) y se
      ; creaba SIN esos dos detalles — solo con la ruta al .exe, dejando que
      ; Windows "adivinara" el icono. Se ha visto reportado como icono en
      ; blanco/genérico tanto en el propio acceso directo como en la app; se
      ; iguala aquí a exactamente lo mismo que hace electron-builder para el
      ; del menú Inicio, para que no haya ninguna diferencia entre los dos.
      CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
      ClearErrors
      WinShell::SetLnkAUMI "$DESKTOP\${PRODUCT_NAME}.lnk" "${APP_ID}"
    ${EndIf}

    ; v0.1.55: si se eligió "en una carpeta compartida" en la página de
    ; almacenamiento, se escribe AQUÍ el mismo archivo que la app ya sabe
    ; leer sola en cada arranque (userDataConfigPath() en main.js,
    ; mecanismo de la 0.1.30 "Cambiar ubicación de los datos...") — así la
    ; primera vez que se abra la app ya usa esa carpeta, sin ningún paso
    ; manual adicional. Si se eligió "en este PC" (el caso normal, y el
    ; que ya existía antes de esta versión), no se toca nada aquí — la app
    ; usa su carpeta de datos local de siempre.
    ${If} $StorageIsCloud == ${BST_CHECKED}
    ${AndIf} $StorageCloudPathValue != ""
      CreateDirectory "$APPDATA\panorama-app-config"
      FileOpen $9 "$APPDATA\panorama-app-config\location.json" w
      ; v0.1.57: "shared": true explícito — esta página solo escribe
      ; location.json cuando se elige la carpeta COMPARTIDA, así que ya se
      ; sabe la respuesta sin tener que preguntarla de nuevo dentro de la
      ; app (compárese con "Cambiar ubicación de los datos..." en
      ; main.js, que si pregunta, porque ahí sí puede ser una carpeta
      ; local cualquiera).
      FileWrite $9 '{$\r$\n  "userDataDir": "$StorageCloudPathValue",$\r$\n  "shared": true$\r$\n}$\r$\n'
      FileClose $9
    ${EndIf}
  !macroend
!else
  ; Pasada del desinstalador: hay que borrar a mano el acceso directo del
  ; escritorio, porque lo creamos nosotros mismos en customInstall (arriba)
  ; en vez de dejar que electron-builder lo gestione (createDesktopShortcut
  ; está a false en package.json, precisamente para poder preguntar nosotros
  ; "¿quieres acceso directo?" en vez de crearlo siempre) — y por eso mismo el
  ; desinstalador estándar no sabe que existe ni intenta quitarlo. $newDesktopLink
  ; y $oldDesktopLink ya vienen calculados (ver !insertmacro setLinkVars, que
  ; se ejecuta justo antes de este hook) con el nombre real usado — cubre
  ; también el caso de que el acceso directo viniera de una versión anterior
  ; con otro nombre.
  !macro customUnInstall
    Delete "$newDesktopLink"
    ${if} $oldDesktopLink != $newDesktopLink
      Delete "$oldDesktopLink"
    ${endIf}
  !macroend
!endif
