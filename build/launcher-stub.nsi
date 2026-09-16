; ------------------------------------------------------------------
; Abrir-Instalador.exe — "lanzador" que se ejecuta ANTES del instalador
; real (PanoramaDelServicio-Instalador-X.X.X.exe).
;
; Por qué existe: el instalador real pesa ~80 MB y no lleva firma digital
; (comprar un certificado de firma de código es una decisión de coste que
; le corresponde al usuario, no algo que se pueda generar aquí) — Windows
; (SmartScreen + Defender) se para a comprobarlo a fondo antes de dejarlo
; arrancar, y ese hueco puede durar bastantes segundos sin que aparezca
; nada en pantalla, dando la sensación de que no ha pasado nada al hacer
; doble clic.
;
; Este lanzador es un ejecutable mucho más pequeño y sencillo (sin los 80 MB
; de la app dentro) que:
;   1. Se muestra en pantalla enseguida, con un mensaje de "preparando..."
;      y una barra indeterminada en movimiento.
;   2. Lanza el instalador real (buscándolo en la misma carpeta, así sirve
;      para cualquier versión sin tener que volver a generarlo cada vez).
;   3. Se cierra solo a los pocos segundos, dejando que el instalador real
;      siga cargando por su cuenta.
;
; IMPORTANTE — qué SÍ y qué NO se puede garantizar desde aquí: al ser un
; archivo bastante más pequeño y simple, Windows debería tardar mucho menos
; en dejarlo arrancar a él que al instalador real de 80 MB — pero esto no
; se ha podido comprobar de forma directa (no hay manera de probar el
; comportamiento real de Windows Defender/SmartScreen fuera de un Windows
; de verdad). Lo que sí está comprobado aquí es que el lanzador encuentra
; el instalador real, lo lanza correctamente y se cierra solo.
; ------------------------------------------------------------------

Unicode true
!include "nsDialogs.nsh"
!include "WinMessages.nsh"
!include "LogicLib.nsh"

!define PBS_MARQUEE 0x08

Name "Panorama del Servicio"
OutFile "..\dist_build\Abrir-Instalador.exe"
Icon "..\assets\icon.ico"
RequestExecutionLevel user
SilentInstall normal
ShowInstDetails nevershow
XPStyle on

Page custom StubPageCreate StubPageLeave

Var Dialog
Var LabelTitle
Var LabelSub
Var ProgressBar
Var InstallerPath
Var TimerTicks

Function .onInit
  ; Busca el instalador real en la misma carpeta que este lanzador —
  ; así este mismo lanzador sirve para cualquier versión futura, sin
  ; tener que volver a compilarlo cada vez que cambia el número de
  ; versión del instalador.
  StrCpy $InstallerPath ""
  FindFirst $0 $1 "$EXEDIR\PanoramaDelServicio-Instalador-*.exe"
  ${DoWhile} $1 != ""
    StrCpy $InstallerPath "$EXEDIR\$1"
    FindNext $0 $1
  ${Loop}
  FindClose $0

  ${If} $InstallerPath == ""
    MessageBox MB_ICONEXCLAMATION|MB_OK "No se ha encontrado el instalador de Panorama del Servicio (PanoramaDelServicio-Instalador-X.X.X.exe) en esta misma carpeta.$\r$\n$\r$\nAsegúrate de que el archivo del instalador está en la misma carpeta que este programa, y vuelve a intentarlo."
    Quit
  ${EndIf}
FunctionEnd

Function StubPageCreate
  nsDialogs::Create 1018
  Pop $Dialog
  ${If} $Dialog == error
    Abort
  ${EndIf}

  ; Oculta "Atrás" y "Siguiente" — esta pantalla no espera ninguna
  ; decisión del usuario, avanza sola. Deja "Cancelar" visible como
  ; salida de emergencia.
  GetDlgItem $0 $HWNDPARENT 1
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${SW_HIDE}

  ${NSD_CreateLabel} 0 20u 100% 20u "Preparando el instalador de Panorama del Servicio…"
  Pop $LabelTitle

  ${NSD_CreateLabel} 0 44u 100% 20u "El instalador es un archivo grande y Windows puede tardar unos segundos en comprobarlo. Esta ventana se cerrará sola."
  Pop $LabelSub

  nsDialogs::CreateControl "msctls_progress32" "${DEFAULT_STYLES}|${WS_VISIBLE}|${PBS_MARQUEE}" "${WS_EX_WINDOWEDGE}|${WS_EX_CLIENTEDGE}" 0 78u 100% 12u ""
  Pop $ProgressBar
  SendMessage $ProgressBar ${PBM_SETMARQUEE} 1 100

  ; Lanza el instalador real ya, en cuanto esta ventana está lista para
  ; mostrarse — no espera a que el usuario haga nada.
  Exec '"$InstallerPath"'

  StrCpy $TimerTicks 0
  ${NSD_CreateTimer} StubTimerTick 500

  nsDialogs::Show
FunctionEnd

Function StubTimerTick
  IntOp $TimerTicks $TimerTicks + 1
  ; 10 ticks x 500 ms = 5 segundos visibles — tiempo de sobra para que se
  ; note que algo ha pasado, sin quedarse una eternidad estorbando encima
  ; del instalador real una vez que este ya ha arrancado.
  ${If} $TimerTicks >= 10
    ${NSD_KillTimer} StubTimerTick
    ; Un Quit normal, llamado desde dentro del callback de un temporizador
    ; de nsDialogs (que se ejecuta desde el propio procedimiento de ventana,
    ; no desde el flujo normal de "el usuario pulsa un botón"), NO cierra el
    ; proceso de verdad — comprobado: se queda la ventana abierta sin más.
    ; En vez de eso, se simula la pulsación del botón "Siguiente" (comando
    ; estándar de Windows, WM_COMMAND con el id del control), dejando que
    ; sea el propio asistente de NSIS quien cierre todo por su camino
    ; normal — al no haber más páginas después de esta, cierra el
    ; asistente entero. Comprobado que esto sí termina el proceso.
    SendMessage $HWNDPARENT ${WM_COMMAND} 1 0
  ${EndIf}
FunctionEnd

Function StubPageLeave
FunctionEnd

Section "Dummy"
  ; Esta sección nunca se ejecuta de verdad — no hay página "InstFiles"
  ; en el flujo, así que el asistente nunca llega a "instalar" nada. Existe
  ; únicamente porque NSIS exige al menos una Section para compilar.
SectionEnd
