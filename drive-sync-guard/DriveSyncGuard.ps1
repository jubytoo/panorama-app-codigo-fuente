# ============================================================================
# Panorama del Servicio -- DriveSyncGuard.ps1  (v0.1.54)
# ============================================================================
# Que hace: mientras esta activado desde el menu "Configuracion" de la app,
# corre en segundo plano (sin permisos de administrador, arrancado por una
# entrada en HKCU\...\Run al iniciar sesion) e intenta retrasar el apagado
# de Windows mientras Google Drive (GoogleDriveFS.exe) u OneDrive
# (OneDrive.exe) parezcan ocupados sincronizando -- usando la API real de
# Windows para esto (ShutdownBlockReasonCreate/Destroy sobre el mensaje
# WM_QUERYENDSESSION), NO el enfoque del script original del usuario (un
# script de "apagado" de Directiva de Grupo), que corre DESPUES de cerrar la
# sesion -- cuando Drive/OneDrive ya estan cerrados y no hay nada que medir.
#
# HONESTIDAD SOBRE LO QUE ESTO ES: este script se ha escrito y revisado con
# cuidado seguiendo la documentacion oficial de Microsoft del mecanismo de
# bloqueo de apagado, pero el entorno de desarrollo de esta app es Linux
# (sin Windows real) -- NO se ha podido comprobar en un apagado real de
# Windows que la pantalla de "esta app esta impidiendo el apagado" aparezca
# de verdad con el motivo aqui escrito. Pruebalo tu mismo una vez lo
# actives: mira "Ver registro de la proteccion de apagado" en el menu
# Configuracion despues de intentar un apagado con Drive/OneDrive ocupado.
#
# Nunca bloquea para siempre: pasados $MaxBlockSeconds seguidos con
# Drive/OneDrive "ocupados", deja de objetar y permite el apagado.
# ============================================================================
#
# v0.1.58 -- IMPORTANTE, NO REINTRODUCIR ACENTOS NI CARACTERES NO-ASCII EN
# ESTE ARCHIVO. Se confirmo en un PC Windows real que este script llevaba
# TRES versiones (0.1.54/0.1.55/0.1.56/0.1.57) sin funcionar NUNCA: el
# archivo se guardaba en UTF-8 sin BOM, y Windows PowerShell 5.1 (el
# powershell.exe de toda la vida, NO pwsh) lo leia con la pagina de codigos
# ANSI del sistema en vez de UTF-8 al no encontrar BOM -- cualquier tilde
# quedaba mal decodificada (p.ej. "i" con tilde se convertia en dos
# caracteres sueltos) y en al menos un punto del archivo eso rompia la
# sintaxis de PowerShell de verdad, con un error de parseo que impedia
# ejecutar el script ENTERO desde la primera linea (por eso nunca llegaba
# a escribir ni una linea en guard.log, pese a que el flag enabled.flag
# decia que la proteccion estaba "activa"). La forma mas robusta de
# evitarlo para siempre es no usar caracteres fuera de ASCII aqui -- ni en
# comentarios ni en los textos de Write-GuardLog.
# ============================================================================
#
# v0.1.59 -- CARRERA REAL detectada por el usuario, razonando sobre el
# mecanismo (no solo probando): WM_QUERYENDSESSION se contesta UNA SOLA
# VEZ, en el instante exacto en que Windows empieza a apagar -- no es un
# sondeo repetido. Si en ese instante Drive/OneDrive todavia no han
# reaccionado al ultimo guardado de la app (que puede tardar hasta 4s en
# terminar el suyo propio, ver FLUSH_BEFORE_CLOSE_TIMEOUT_MS en main.js,
# mas lo que tarde Drive en darse cuenta del cambio), el sondeo de CPU de
# este script puede no haber detectado nada todavia -- $IsBusy seguiria
# en $false, y este script contestaria "adelante" antes de que hubiera
# nada que objetar. A partir de esta version, la primera vez que llega
# WM_QUERYENDSESSION SIEMPRE se bloquea un margen minimo fijo
# ($MinBlockGraceSeconds), este o no este ya detectada actividad de CPU
# -- igual que ya se hacia al arrancar (esperar un poco por si acaso, no
# solo cuando ya se ha detectado algo). El sondeo periodico decide mas
# adelante cuando soltar el bloqueo de verdad (ver Update-ShutdownGrace).
# De paso se corrige un bug relacionado encontrado al revisar esto: la
# version anterior solo liberaba el bloqueo al llegar a los 10 minutos
# del limite de seguridad, nunca cuando Drive/OneDrive se detectaban
# inactivos de forma normal (~15s) -- es decir, si llegaba a bloquear,
# se quedaba bloqueando muchisimo mas de lo necesario en el caso normal.
# ============================================================================
#
# v0.1.60 -- AUDITORIA pedida por el usuario ("no haya nada redundante y
# sea super eficaz... no haya restos y sea una herramienta profesional y
# segura"). Se anadio heartbeat.txt: un archivo pequeno que este script
# toca en CADA sondeo (cada $PollIntervalMs), pase lo que pase, para que
# la app (main.js) pueda comprobar de verdad si el proceso sigue vivo --
# antes de esta version, la app solo sabia "deberia estar activo" (existe
# enabled.flag) sin ninguna forma de confirmar que el proceso de verdad
# seguia corriendo. Es exactamente el hueco que permitio que el bug de
# codificacion de la 0.1.58 pasara inadvertido durante tres versiones: la
# app se creia protegida sin estarlo. Con este archivo, main.js puede
# relanzar el guard solo si deja de dar senales de vida, sin esperar a que
# el usuario lo note en un apagado real.
# ============================================================================
#
# v0.1.63 -- ver el comentario junto al chequeo de enabled.flag mas abajo.
# Hallazgo real (spawn-diagnostico.log, instrumentacion de la 0.1.61) en dos
# PCs reales: el relanzado automatico del guard hecho por la app termina en
# 315-507ms con codigo 0 y ninguna salida -- demasiado rapido para llegar a
# compilar el C# de este script, asi que solo puede ser el chequeo de
# enabled.flag saliendo de inmediato. Se anade un reintento corto (hasta 5
# veces, 300ms entre cada uno) por si se trata de una demora de visibilidad
# entre procesos del antivirus/EDR ante un archivo recien escrito por un
# ejecutable sin firmar -- no confirmado del todo, pero el cambio es barato
# y deja constancia en el log de si hizo falta el reintento.
# ============================================================================

# ============================================================================
# v0.1.64 -- TRAZA DE ARRANQUE PROPIA, independiente de la captura de salida
# de Node. Lo visto en la 0.1.63 no cuadra con la hipotesis de la demora de
# visibilidad: un intento real de "relanzando", con el reintento nuevo ya
# instalado (confirmado -- FlagCheckAttempts presente en el .ps1 realmente
# en disco, escrito minutos antes), volvio a terminar en apenas ~280ms con
# codigo 0 -- mas rapido de lo que ese mismo reintento puede tardar en
# agotarse (minimo ~1.2-1.5s si el archivo no aparece nunca). Eso descarta
# la hipotesis de la 0.1.63 tal cual, o apunta a que el problema esta en
# otro punto completamente distinto.
#
# Ademas, cayendo en la cuenta ahora: NUNCA se ha confirmado de verdad que
# la redireccion de stdout/stderr del proceso hijo hacia
# spawn-diagnostico.log (anadida en la 0.1.61, via descriptores de archivo
# pasados en un spawn con detached:true + windowsHide:true en Windows)
# funcione de verdad -- todo lo visto ahi hasta ahora lo escribe el propio
# proceso PADRE (Node, tanto la cabecera "intento de lanzar" como el cierre
# "Proceso terminado"), nunca una linea escrita de verdad por ESTE script.
# Si esa redireccion tuviera algun fallo silencioso propio de Windows (hay
# antecedentes conocidos con descriptores de archivo + procesos detached),
# llevariamos un tiempo mirando un diagnostico ciego sin saberlo.
#
# Por eso esta traza la escribe el PROPIO script, paso a paso, directamente
# a un archivo (trace-arranque.log) -- nada que ver con la salida estandar
# ni con lo que Node consiga o no capturar. Es literalmente lo primero que
# se ejecuta, antes incluso de $ErrorActionPreference, para saber con
# certeza hasta donde llega el script a ejecutarse la proxima vez que
# vuelva a fallar.
# ============================================================================
#
# v0.1.70 -- BUG REAL DE FONDO, encontrado en una prueba de apagado real
# hecha por el usuario (no una sospecha): tras arreglar el arranque
# automatico (0.1.66-0.1.69), el usuario probo un apagado real con Drive
# sincronizando. La pantalla de Windows SI mostro "Panorama del Servicio:
# esperando a que termine de sincronizar..." (confirma que el guard SI
# se entera del intento de apagado), y guard.log confirmo que a los 25s
# el guard soltaba el bloqueo correctamente ("se suelta el bloqueo, el
# apagado puede continuar") -- pero el apagado nunca se completaba, ni
# siquiera tras casi 1 minuto de espera del usuario (que acabo
# cancelandolo el).
#
# Causa real (confirmada contra la documentacion oficial de Microsoft,
# learn.microsoft.com/windows/win32/shutdown/wm-queryendsession y
# /shutdown/shutting-down -- no una suposicion): el WndProc de mas abajo
# devolvia SIEMPRE (IntPtr)0 (FALSE) al contestar WM_QUERYENDSESSION, con
# un comentario que decia "pide a Windows que espere". Eso esta AL REVES.
# Microsoft es explicito: FALSE le dice a Windows que la app SE NIEGA al
# apagado (reservado solo para cuando apagar corromperia datos), y NO es
# la forma de simplemente pedir mas tiempo -- para eso existe
# ShutdownBlockReasonCreate/Destroy, y la app debe devolver SIEMPRE TRUE.
# Con FALSE, Windows registraba la unica respuesta a WM_QUERYENDSESSION
# (llega una sola vez por intento) como una negativa real -- soltar el
# ShutdownBlockReasonDestroy despues no revierte esa negativa. Encaja
# exacto con lo visto: el guard "soltaba" el bloqueo en su propio log,
# pero Windows nunca iba a continuar solo, porque ya le habia dicho que
# no la unica vez que pregunto.
#
# Fix: la respuesta a WM_QUERYENDSESSION pasa a ser SIEMPRE TRUE (ver el
# comentario junto a m.Result mas abajo, dentro del WndProc). El resto
# del mecanismo (ShutdownBlockReasonCreate al llegar la pregunta,
# Update-ShutdownGrace decidiendo cuando llamar a
# ShutdownBlockReasonDestroy) no cambia -- solo estaba mal el valor de
# retorno de la pregunta en si.
# ============================================================================
function Write-StartupTrace {
    param([string]$Line)
    try {
        $traceDir = Join-Path $env:LOCALAPPDATA 'PanoramaDriveSyncGuard'
        if (-not (Test-Path $traceDir)) { New-Item -ItemType Directory -Path $traceDir -Force | Out-Null }
        $stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss.fff')
        Add-Content -Path (Join-Path $traceDir 'trace-arranque.log') -Value "[$stamp] [PID=$PID] $Line" -Encoding UTF8 -ErrorAction Stop
    } catch {
        # Ultimo recurso -- si ni siquiera LOCALAPPDATA esta disponible o
        # escribible por lo que sea, se intenta TEMP como respaldo. Nunca
        # debe tumbar el script por esto.
        try {
            $fallbackMsg = "$Line (respaldo -- fallo el destino habitual: $($_.Exception.Message))"
            Add-Content -Path (Join-Path $env:TEMP 'PanoramaDriveSyncGuard-trace-arranque.log') -Value "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff')] [PID=$PID] $fallbackMsg" -Encoding UTF8 -ErrorAction SilentlyContinue
        } catch {
            # Si tampoco esto funciona, no hay nada mas que hacer.
        }
    }
}

Write-StartupTrace 'Script iniciado -- primera linea ejecutable.'

$ErrorActionPreference = 'Stop'

$DataDir = Join-Path $env:LOCALAPPDATA 'PanoramaDriveSyncGuard'
$FlagPath = Join-Path $DataDir 'enabled.flag'
$LogPath = Join-Path $DataDir 'guard.log'
$HeartbeatPath = Join-Path $DataDir 'heartbeat.txt'
Write-StartupTrace "Rutas calculadas -- DataDir=$DataDir"

$MaxLogLines = 5000
$KeepLogLines = 2000

$PollIntervalMs = 5000          # cada cuanto se mira si Drive/OneDrive estan ocupados
$FlagCheckEveryNPolls = 6       # cada 6 sondeos (~30s) se comprueba si se desactivo desde la app
$IdlePollsToClear = 3           # sondeos seguidos sin actividad de CPU antes de dejar de considerar "ocupado" (~15s)
$BusyThresholdMs = 100          # mismo umbral que usaba el script original del usuario
$MaxBlockSeconds = 600          # tope de seguridad -- nunca retiene el apagado mas de esto
$MinBlockGraceSeconds = 25      # v0.1.59: margen minimo SIEMPRE al recibir WM_QUERYENDSESSION,
                                 # aunque no se haya detectado actividad de CPU todavia -- para
                                 # cubrir el hueco entre "la app termina su guardado" y "Drive
                                 # reacciona al cambio y empieza a subirlo".
$WatchedProcessNames = @('GoogleDriveFS', 'OneDrive')

function Write-GuardLog {
    param([string]$Line)
    try {
        if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Path $DataDir -Force | Out-Null }
        $stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
        Add-Content -Path $LogPath -Value "[$stamp] $Line" -Encoding UTF8
        # Rotacion simple por numero de lineas -- evita que el log crezca sin limite
        # en un PC que se queda encendido semanas seguidas.
        $existing = Get-Content -Path $LogPath -ErrorAction SilentlyContinue
        if ($existing -and $existing.Count -gt $MaxLogLines) {
            $tail = $existing | Select-Object -Last $KeepLogLines
            Set-Content -Path $LogPath -Value $tail -Encoding UTF8
        }
    } catch {
        # Si ni el log se puede escribir, no hay nada mas que hacer -- nunca debe
        # tumbar el resto del script.
    }
}

# v0.1.60: se toca en cada sondeo, pase lo que pase (haya o no algo que
# registrar en guard.log) -- es la senal de vida que main.js usa para saber
# si el proceso sigue corriendo de verdad, sin depender de que haya habido
# algun cambio de estado que registrar.
function Write-Heartbeat {
    try {
        if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Path $DataDir -Force | Out-Null }
        Set-Content -Path $HeartbeatPath -Value (Get-Date).ToString('o') -Encoding UTF8
    } catch {
        # Igual que Write-GuardLog: si esto falla, no hay nada mas que hacer aqui.
    }
}

# Si la app ya desactivo la proteccion antes de que esta copia llegara a
# arrancar (por ejemplo, activar y desactivar muy seguido), no hace nada.
#
# v0.1.63 -- hallazgo real via spawn-diagnostico.log (instrumentacion de la
# 0.1.61): en dos PCs reales (uno con Sophos Intercept X, otro solo con el
# Defender de serie) el relanzado automatico del guard, hecho por la propia
# app, termina con codigo de salida 0 y CERO salida de consola en 315-507ms
# -- demasiado rapido para llegar siquiera a compilar el C# de mas abajo
# (Add-Type). El unico sitio de todo el script que puede terminar asi de
# rapido y limpio es este chequeo. main.js escribe enabled.flag de forma
# sincrona justo antes de lanzar este script, asi que en teoria ya deberia
# estar ahi -- la hipotesis mas plausible (no confirmada del todo todavia,
# pendiente de contrastar con el guard.log de ese mismo instante) es una
# demora de visibilidad entre procesos: el antivirus/EDR de turno reteniendo
# un poco la visibilidad de un archivo recien escrito por un ejecutable sin
# firmar, antes de dejar que OTRO proceso (este script) lo vea. Reintentar
# unas cuantas veces con una pausa corta es barato, no hace dano si la causa
# fuera otra, y deja constancia en el log de si de verdad hizo falta el
# reintento -- confirmando o descartando esta hipotesis la proxima vez que
# se mire.
Write-StartupTrace "Empezando chequeo de enabled.flag -- FlagPath=$FlagPath"
$FlagCheckAttempts = 5
$FlagCheckDelayMs = 300
$flagAttempt = 0
$flagFound = $false
while ($flagAttempt -lt $FlagCheckAttempts) {
    $flagAttempt++
    if (Test-Path $FlagPath) { $flagFound = $true; break }
    Start-Sleep -Milliseconds $FlagCheckDelayMs
}
Write-StartupTrace "Chequeo de enabled.flag terminado -- encontrado=$flagFound intentos=$flagAttempt"
if (-not $flagFound) {
    $waitedSeconds = [math]::Round(($FlagCheckAttempts * $FlagCheckDelayMs) / 1000, 1)
    Write-GuardLog "Arranque sin enabled.flag tras $FlagCheckAttempts intentos (~${waitedSeconds}s) -- la proteccion no esta activada, saliendo sin hacer nada."
    Write-StartupTrace 'Saliendo (codigo 0) por falta de enabled.flag tras agotar los reintentos.'
    exit 0
}
if ($flagAttempt -gt 1) {
    Write-GuardLog "enabled.flag encontrado en el intento $flagAttempt (no estaba visible de inmediato al arrancar) -- confirma demora de visibilidad entre procesos, no ausencia real del flag."
}

Write-GuardLog '======================================================================'
Write-GuardLog 'Arranque de DriveSyncGuard.'
Write-Heartbeat
Write-StartupTrace 'enabled.flag confirmado -- Write-GuardLog/Write-Heartbeat iniciales OK, entrando al bloque try principal.'

try {
    Write-StartupTrace 'A punto de compilar Add-Type (System.Windows.Forms / System.Drawing).'
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    Write-StartupTrace 'Add-Type de los ensamblados base OK.'

    # ------------------------------------------------------------------
    # Formulario oculto que recibe mensajes de Windows. Necesita ser una
    # ventana real (con HWND) porque WM_QUERYENDSESSION y
    # ShutdownBlockReasonCreate/Destroy solo funcionan sobre un HWND -- no
    # hay forma de interceptar el apagado sin uno. Se mantiene invisible
    # (ShowInTaskbar=false, Opacity=0, SetVisibleCore forzado a false) para
    # no molestar al usuario con una ventana en pantalla.
    # ------------------------------------------------------------------
    $csharpSource = @'
using System;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace PanoramaDriveSyncGuard
{
    public class GuardForm : Form
    {
        private const int WM_QUERYENDSESSION = 0x11;

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern bool ShutdownBlockReasonCreate(IntPtr hWnd, string pwszReason);

        [DllImport("user32.dll")]
        private static extern bool ShutdownBlockReasonDestroy(IntPtr hWnd);

        // Estado que actualiza el bucle de sondeo (PowerShell) desde fuera.
        public bool IsBusy = false;
        // v0.1.59: true desde que llega la primera WM_QUERYENDSESSION de este
        // intento de apagado, hasta que el sondeo periodico decide soltar el
        // bloqueo (ver Update-ShutdownGrace). Mientras sea true, cualquier
        // WM_QUERYENDSESSION adicional que llegue se contesta tambien
        // bloqueando, sin volver a decidir nada aqui.
        public bool ShutdownPending = false;
        public DateTime QueryEndSessionReceivedAt = DateTime.MinValue;
        public string ReasonText = "Panorama del Servicio: esperando a que termine de sincronizar Google Drive / OneDrive...";

        // Delegado simple en vez de un evento .NET normal -- asignar un
        // scriptblock de PowerShell directamente a un campo Action<string>
        // es el patron mas fiable para que PowerShell pueda "escuchar" logs
        // generados dentro del codigo C# embebido.
        public Action<string> LogAction;

        public GuardForm()
        {
            this.ShowInTaskbar = false;
            this.WindowState = FormWindowState.Minimized;
            this.FormBorderStyle = FormBorderStyle.FixedToolWindow;
            this.Opacity = 0;
            this.Width = 0;
            this.Height = 0;
        }

        protected override void SetVisibleCore(bool value)
        {
            // Nunca se muestra de verdad en pantalla -- pero el handle de
            // ventana (HWND) si se crea igualmente via CreateControl(),
            // llamado explicitamente antes de Application.Run.
            base.SetVisibleCore(false);
        }

        private void Log(string line)
        {
            if (LogAction != null) LogAction(line);
        }

        protected override void WndProc(ref Message m)
        {
            if (m.Msg == WM_QUERYENDSESSION)
            {
                // v0.1.59: WM_QUERYENDSESSION solo llega UNA VEZ por intento
                // de apagado -- no es un sondeo repetido. Si en este instante
                // exacto Drive/OneDrive todavia no han reaccionado al ultimo
                // guardado de la app (puede tardar unos segundos en darse
                // cuenta del cambio), IsBusy podria seguir en false sin que
                // eso signifique que no hay nada pendiente. Por eso, la
                // primera vez que llega esta pregunta, SIEMPRE se bloquea un
                // margen minimo ($MinBlockGraceSeconds), este o no ya
                // detectada actividad -- el sondeo periodico (Update-
                // ShutdownGrace, en el script PowerShell) decide mas adelante
                // cuando soltar el bloqueo de verdad.
                if (!ShutdownPending)
                {
                    ShutdownPending = true;
                    QueryEndSessionReceivedAt = DateTime.Now;
                    ShutdownBlockReasonCreate(this.Handle, ReasonText);
                    Log("WM_QUERYENDSESSION recibido -- bloqueando apagado (margen minimo de seguridad, haya o no actividad de CPU detectada todavia).");
                }
                else
                {
                    // Ya se estaba reteniendo este mismo intento de apagado --
                    // se mantiene la misma respuesta hasta que el sondeo
                    // periodico decida soltarlo.
                    ShutdownBlockReasonCreate(this.Handle, ReasonText);
                }
                // v0.1.70 -- BUG REAL encontrado en una prueba de apagado real
                // del usuario: esto devolvia (IntPtr)0 (FALSE) SIEMPRE, con el
                // comentario "pide a Windows que espere". Segun la
                // documentacion oficial de Microsoft (WM_QUERYENDSESSION y
                // ShutdownBlockReasonCreate, learn.microsoft.com/.../wm-
                // queryendsession y /shutdown/shutting-down), esto esta AL
                // REVES: FALSE le dice a Windows "esta app SE NIEGA al
                // apagado" -- reservado solo para casos donde apagar
                // corromperia datos -- y NO es lo que hay que devolver para
                // simplemente pedir mas tiempo. El patron correcto es
                // devolver SIEMPRE TRUE (indicando que la app SI accede a
                // terminar) y usar ShutdownBlockReasonCreate/Destroy aparte
                // para que Windows muestre la pantalla de "esperando a esta
                // app" y decida cuando continuar de verdad -- Windows solo
                // retoma el apagado el solo, sin volver a preguntar, cuando
                // se llama a ShutdownBlockReasonDestroy; no hace falta ademas
                // cerrar la ventana ni salir del proceso.
                //
                // Con el FALSE de antes, Windows registraba el "no" de este
                // WM_QUERYENDSESSION (que solo llega UNA VEZ por intento) como
                // una objecion real -- soltar el ShutdownBlockReasonDestroy
                // despues no lo revierte. Esto explica exactamente lo que
                // reporto el usuario en una prueba real: el guard.log mostraba
                // "se suelta el bloqueo, el apagado puede continuar" a los 25s
                // como estaba previsto, pero el apagado nunca se completaba --
                // Windows nunca iba a continuar solo porque ya habia contestado
                // que no la unica vez que se le pregunto.
                m.Result = (IntPtr)1; // TRUE: la app SI accede a terminar; ShutdownBlockReasonCreate/Destroy es quien decide cuando de verdad
                return;
            }
            base.WndProc(ref m);
        }

        public void ReleaseBlockReason()
        {
            try { ShutdownBlockReasonDestroy(this.Handle); } catch { }
        }
    }
}
'@

    Write-StartupTrace 'A punto de compilar el Add-Type del formulario (csc.exe -- puede tardar varios segundos).'
    Add-Type -TypeDefinition $csharpSource -ReferencedAssemblies System.Windows.Forms, System.Drawing
    Write-StartupTrace 'Add-Type del formulario OK.'

    $form = New-Object PanoramaDriveSyncGuard.GuardForm
    $form.LogAction = { param($line) Write-GuardLog $line }
    $form.CreateControl()  # fuerza la creacion del HWND aunque nunca se vea en pantalla
    $null = $form.Handle   # acceder a Handle tambien fuerza la creacion si CreateControl no bastara -- doble seguro
    Write-StartupTrace "Formulario creado -- HWND=$($form.Handle)."

    # ------------------------------------------------------------------
    # Sondeo de actividad: mismo heuristico de "delta de CPU" que el script
    # original del usuario, generalizado a los dos procesos (Drive Y
    # OneDrive, no solo uno) y con un margen de "inactivo" de 3 sondeos
    # seguidos (~15s) para no parpadear entre ocupado/libre en cada muestra.
    # ------------------------------------------------------------------
    $script:LastCpuTimes = @{}
    $script:IdlePollCount = 0
    $script:PollCounter = 0

    function Update-SyncBusyState {
        $anyBusy = $false
        $anyProcessSeen = $false
        foreach ($name in $WatchedProcessNames) {
            $procs = Get-Process -Name $name -ErrorAction SilentlyContinue
            if (-not $procs) { continue }
            $anyProcessSeen = $true
            $totalCpu = New-TimeSpan
            foreach ($p in $procs) {
                try { $totalCpu = $totalCpu.Add($p.TotalProcessorTime) } catch { }
            }
            if ($script:LastCpuTimes.ContainsKey($name)) {
                $delta = $totalCpu - $script:LastCpuTimes[$name]
                if ($delta.TotalMilliseconds -gt $BusyThresholdMs) {
                    $anyBusy = $true
                }
            }
            $script:LastCpuTimes[$name] = $totalCpu
        }

        if (-not $anyProcessSeen) {
            # Ni Drive ni OneDrive estan corriendo -- no hay nada que esperar.
            if ($form.IsBusy) { Write-GuardLog 'Ni GoogleDriveFS ni OneDrive estan en ejecucion -- dejando de considerar "ocupado".' }
            $form.IsBusy = $false
            $script:IdlePollCount = 0
            return
        }

        if ($anyBusy) {
            $script:IdlePollCount = 0
            if (-not $form.IsBusy) { Write-GuardLog 'Actividad de CPU detectada en Drive/OneDrive -- marcando como "ocupado".' }
            $form.IsBusy = $true
        } else {
            $script:IdlePollCount++
            if ($script:IdlePollCount -ge $IdlePollsToClear -and $form.IsBusy) {
                $idleSeconds = $IdlePollsToClear * ($PollIntervalMs / 1000)
                Write-GuardLog "Sin actividad de CPU en Drive/OneDrive durante ${idleSeconds}s -- marcando como `"inactivo`"."
                $form.IsBusy = $false
            }
        }
    }

    # v0.1.59: sustituye a la antigua Update-SafetyCap. Aquella limitaba
    # cuanto tiempo se podia estar "marcando ocupado" en general; esta
    # decide cuando soltar de verdad un apagado YA retenido, anclada al
    # instante en que llego la WM_QUERYENDSESSION (no a cuanto lleva Drive
    # "ocupado" en abstracto) -- que es lo que de verdad le importa al
    # usuario: cuanto tiempo se le esta reteniendo el apagado.
    #
    # v0.1.71 -- BUG REAL encontrado en una prueba de apagado real limpia
    # del usuario (solo esta app en la pantalla de "cerrando aplicacion",
    # nada de Outlook ni otra cosa de por medio): con el fix de la 0.1.70
    # (responder TRUE a WM_QUERYENDSESSION en vez de FALSE, confirmado
    # contra la documentacion oficial de Microsoft), guard.log mostraba el
    # ciclo completo y correcto -- bloqueo, margen de 25s, suelta -- pero
    # el apagado seguia sin completarse solo.
    #
    # Causa real, esta vez confirmada contra la pagina oficial de
    # WM_ENDSESSION (learn.microsoft.com/windows/win32/shutdown/wm-
    # endsession): tras responder TRUE y soltar el motivo de bloqueo,
    # Windows envia WM_ENDSESSION -- y la documentacion es explicita en
    # que la sesion puede terminar en cuanto TODAS las apps devuelvan ese
    # mensaje, y que la app "debe terminar" (si no lo hace por su cuenta,
    # Windows la fuerza). O sea: soltar ShutdownBlockReasonDestroy() no
    # basta por si solo -- todo el mecanismo esta pensado para apps que
    # se APAGAN despues del margen de gracia, no para apps que se quedan
    # vivas indefinidamente de vuelta a vigilar en segundo plano (que es
    # justo lo que este guard hacia hasta ahora: soltaba el motivo y
    # seguia corriendo su bucle de mensajes como si nada).
    #
    # Fix: en cuanto se decide soltar el bloqueo (las dos ramas de abajo),
    # el guard ahora tambien termina su propio proceso de verdad
    # (Application.Exit(), ver mas abajo) en vez de quedarse vivo. No se
    # pierde proteccion por esto: si el usuario cancela el apagado y sigue
    # trabajando, el watchdog de la app principal (cada 45s, ver
    # syncDriveSyncGuardWithLocation en main.js) detecta el heartbeat
    # parado y relanza un guard nuevo solo, en menos de un minuto -- igual
    # que ya hace tras cualquier otra muerte del proceso.
    function Update-ShutdownGrace {
        if (-not $form.ShutdownPending) { return }

        $elapsed = (Get-Date) - $form.QueryEndSessionReceivedAt

        if ($elapsed.TotalSeconds -ge $MaxBlockSeconds) {
            Write-GuardLog "Limite de seguridad (${MaxBlockSeconds}s) alcanzado con el apagado retenido -- se suelta el bloqueo y el guard se cierra para dejar continuar el apagado."
            $form.ReleaseBlockReason()
            $form.ShutdownPending = $false
            [System.Windows.Forms.Application]::Exit()
            return
        }

        if ($elapsed.TotalSeconds -ge $MinBlockGraceSeconds -and -not $form.IsBusy) {
            Write-GuardLog "Margen minimo (${MinBlockGraceSeconds}s) cumplido y Drive/OneDrive inactivos -- se suelta el bloqueo y el guard se cierra para dejar continuar el apagado."
            $form.ReleaseBlockReason()
            $form.ShutdownPending = $false
            [System.Windows.Forms.Application]::Exit()
            return
        }
    }

    $timer = New-Object System.Windows.Forms.Timer
    $timer.Interval = $PollIntervalMs
    $timer.Add_Tick({
        $script:PollCounter++
        try {
            Update-SyncBusyState
            Update-ShutdownGrace
        } catch {
            Write-GuardLog "Error en el sondeo: $($_.Exception.Message)"
        }
        Write-Heartbeat

        if ($script:PollCounter % $FlagCheckEveryNPolls -eq 0) {
            if (-not (Test-Path $FlagPath)) {
                Write-GuardLog 'enabled.flag ya no existe -- la proteccion se desactivo desde la app. Saliendo.'
                $form.ReleaseBlockReason()
                [System.Windows.Forms.Application]::Exit()
            }
        }
    })
    $timer.Start()

    Write-GuardLog "En marcha -- vigilando: $($WatchedProcessNames -join ', '). Margen minimo al apagar: ${MinBlockGraceSeconds}s. Limite de bloqueo: ${MaxBlockSeconds}s. Sondeo cada $($PollIntervalMs/1000)s."
    Write-StartupTrace 'Timer arrancado, a punto de entrar a Application.Run (bucle de mensajes) -- si esto es lo ultimo que aparece, el guard SI llego a arrancar del todo.'

    [System.Windows.Forms.Application]::Run($form)

    Write-GuardLog 'Saliendo (bucle de mensajes terminado).'
    Write-StartupTrace 'Application.Run termino y volvio (salida normal, no por excepcion).'
} catch {
    Write-GuardLog "Error fatal -- el proceso se cierra: $($_.Exception.Message)"
    Write-StartupTrace "EXCEPCION en el bloque try principal: $($_.Exception.GetType().FullName) -- $($_.Exception.Message)"
}
Write-StartupTrace 'Fin del script (ultima linea ejecutada).'
