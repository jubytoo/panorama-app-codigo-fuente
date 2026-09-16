#!/usr/bin/env python3
import os

ROOT = '/home/claude/panorama-app'
OUT = '/tmp/panorama-app-full-source.md'

FILES = [
    ('README.md', 'markdown'),
    ('backup-picker/index.html', 'html'),
    ('backup-picker/renderer.js', 'javascript'),
    ('build/installer.nsh', 'text'),
    ('build/launcher-stub.nsi', 'text'),
    ('claude/Restaurar-backup.bat', 'batch'),
    ('dashboard/plantilla_dashboard.html', 'html'),
    ('dashboard/restore-helper.html', 'html'),
    ('db.js', 'javascript'),
    ('directorio/plantilla_directorio.html', 'html'),
    ('drive-sync-guard/DriveSyncGuard.ps1', 'powershell'),
    ('drive-sync-guard/LaunchHidden.vbs', 'vbscript'),
    ('evaluacion-candidatos/plantilla_evaluacion_candidatos.html', 'html'),
    ('launcher/index.html', 'html'),
    ('launcher/password-prompt-renderer.js', 'javascript'),
    ('launcher/password-prompt.html', 'html'),
    ('launcher/renderer.js', 'javascript'),
    ('launcher/splash.html', 'html'),
    ('main.js', 'javascript'),
    ('package.json', 'json'),
    ('preload-backup-picker.js', 'javascript'),
    ('preload-launcher.js', 'javascript'),
    ('preload-password-prompt.js', 'javascript'),
    ('preload-security.js', 'javascript'),
    ('preload.js', 'javascript'),
    ('preparacion-reunion/plantilla_preparacion_reunion.html', 'html'),
    ('scripts/cdp_configure_dashboard.js', 'javascript'),
    ('scripts/cdp_dismiss_and_screenshot.js', 'javascript'),
    ('scripts/cdp_eval.js', 'javascript'),
    # v2.0.40: cdp_reload.js y generate_patch_icons.py existían en el repo
    # desde antes pero nunca estuvieron en esta lista -- si algún día se
    # reconstruye el repo desde el snapshot del Project, se habrían perdido
    # sin dejar rastro (auditoría 2026-09-12, sección 5). Sin impacto en la
    # app empaquetada (no se incluyen en build.files de package.json), solo
    # en que el snapshot de este documento quedaba incompleto.
    ('scripts/cdp_reload.js', 'javascript'),
    ('scripts/cdp_test.js', 'javascript'),
    ('scripts/generate_icon.py', 'python'),
    ('scripts/generate_patch_icons.py', 'python'),
    ('scripts/smoke_test.js', 'javascript'),
    ('security-window/index.html', 'html'),
    ('security-window/renderer.js', 'javascript'),
    ('security.js', 'javascript'),
    # v2.0.27: excepción a la exclusión general de vendor/ (comentario más
    # abajo, "librerías de terceros ya minificadas") -- theme.js es código
    # propio de la app (THEMES/applyTheme/initGlobalTheme, el tema visual
    # global), no una librería vendorizada, así que SÍ tiene que estar en el
    # snapshot para que una sesión futura lo vea.
    ('vendor/theme.js', 'javascript'),
    # v2.0.29: misma excepción, mismo motivo -- motion.css es código propio
    # de la app (transiciones/animaciones de la Fase 3), no una librería
    # vendorizada.
    ('vendor/motion.css', 'css'),
    # v2.0.31: misma excepción otra vez -- modal.js es el componente propio
    # de modal HTML (psConfirm/psAlert) que sustituye a los confirm()/alert()
    # nativos en la Fase 5a+5b, no una librería vendorizada.
    ('vendor/modal.js', 'javascript'),
    # v2.0.40: misma excepción otra vez -- window-chrome.css es el CSS propio
    # de barra de título/controles y scrollbar personalizados, unificado aquí
    # tras vivir duplicado carácter por carácter en dashboard/directorio/
    # preparacion-reunion (auditoría 2026-09-12).
    ('vendor/window-chrome.css', 'css'),
]

HEADER = """# Panorama del Servicio — código fuente completo

Todo el código fuente propio del proyecto (excluye node_modules, dist_build,
vendor/ [librerías de terceros ya minificadas], assets binarios e imágenes, y
package-lock.json [ruido de dependencias, sin interés]).

Nota histórica: hasta la 2.0.29 había también un `plantilla_directorio.html`
suelto en la raíz del repo (copia vieja sin usar, residuo de una prueba
anterior — la que realmente carga la app siempre fue
`directorio/plantilla_directorio.html`, referenciada en `main.js`). Nunca
estuvo en este snapshot porque nunca estuvo en la lista FILES de abajo; se
eliminó del repo en la 2.0.30 (Fase 4), así que esta nota ya no aplica a
partir de esa versión.

**Snapshot actualizado a la versión 2.0.41** (ver `claude/panorama-app-project-context.md`
para el historial completo). Incluye ya "Aplicar parche (app.asar)" (0.1.22),
el export CSV/Excel del bloque Equipo en Directorio de Talento (0.1.23),
"Partes mensuales" en Directorio de Talento como vista propia vía menú
(0.1.24/0.1.25), y en el launcher: reordenar tarjetas arrastrando y el
borde de color por urgencia de hitos/riesgos (0.1.26), con 4 correcciones
de usabilidad sobre eso mismo — parpadeo al arrastrar, primera tarjeta
difícil de reemplazar, colores sin refrescar en vivo, contraste
amarillo/naranja (0.1.27), un cuarto escalón de color (amarillo-claro)
con umbrales más ajustados más fecha/hora de cada marca en Partes
mensuales (0.1.28), exportar CSV/Excel de Partes mensuales, exportar
los bloques del dashboard aunque estén vacíos (para usarlos de
plantilla) y recuperar la ventana de un proyecto/Directorio ya abierto
si está minimizada al pulsar "Abrir" (0.1.29), y en Configuración:
"Cambiar ubicación de los datos..." / "Volver a la ubicación de datos
por defecto" — mover toda la carpeta de datos (por ejemplo, a una
carpeta sincronizada por Google Drive/OneDrive para usar la app desde
varios PCs) sin tocar accesos directos ni flags de línea de comandos
(0.1.30). La 0.1.31 desactivó experimentalmente
`app.setAppUserModelId(...)` para arreglar el icono en blanco en la
barra de tareas de una copia PORTABLE (confirmado por el usuario); la
0.1.32 lo reactiva porque a partir de ahí se distribuye un instalador
NSIS de verdad (que registra ese mismo id en sus accesos directos) y
además es el primer instalador NSIS real construido en esta sesión
(no parche de asar, no zip portable), pensado para que la
desinstalación desde "Programas y características" funcione bien. La
0.1.33 recorta el export de Partes mensuales a 4 columnas (Nombre,
Proyecto(s), Estado, Nota (incidencia)) y reconfirma que el export de
los bloques del dashboard (Riesgos, Skill Matrix, etc.) sigue
funcionando vacío como plantilla (ya estaba desde 0.1.29). La 0.1.34
arregla que "Próximo hito" en el Estado Ejecutivo pudiera mostrar un
hito recurrente en vez del siguiente hito real pendiente. La 0.1.35
arregla la causa de fondo por la que ese fix (y en teoría cualquier fix
anterior de dashboard/plantilla_dashboard.html) podía no llegar a un
proyecto ya existente del usuario: cada proyecto tiene su propia copia
horneada del código, que ahora se renueva automáticamente cada vez que
se abre (antes solo se renovaba al crear el proyecto o en un backup
automático, y aun así la ventana ya abierta se quedaba con el código
viejo hasta cerrarla y reabrirla). La 0.1.36 arregla la causa real de
por qué esos dos fixes (y en teoría cualquier parche anterior) nunca
llegaban a la copia real del usuario: "Aplicar parche" ahora comprueba
ANTES de nada si puede escribir en la carpeta de instalación, y si no
puede (típico de una instalación "para todos los usuarios" dentro de
Archivos de programa, que requiere administrador) avisa con un diálogo
claro en el momento en vez de fallar en silencio en un proceso
separado que arrancaba después de cerrar la app — que es justo lo que
le pasó al usuario con los parches 0.1.33/0.1.34/0.1.35, confirmado con
su propio `patch-log.txt` (tres fallos seguidos con `EPERM`). La 0.1.37
arregla un bug real y reproducido en local: proyectos ya existentes se
veían completamente vacíos al abrirlos porque el refresco automático de
la 0.1.35 machacaba en cada apertura la fecha de inicio de servicio (a
`null`, por no tener dónde leer la real), y esa fecha forma parte de la
clave con la que se guardan y buscan los datos de cada proyecto — los
datos nunca se borraron, solo quedaban "perdidos de vista" bajo la
clave antigua correcta. Se corrigió por dos vías: dejar de reconstruir
esa ficha de datos de fábrica desde cero en cada apertura (se conserva
la que ya había), y añadir una búsqueda de recuperación automática en
el dashboard que encuentra y readopta datos huérfanos por este mismo
bug, con solo volver a abrir el proyecto. La 0.1.38 añade la versión
instalada visible junto al título del lanzador (se lee en vivo con
`app.getVersion()`, así que se actualiza sola con cada parche) y deja
documentado, con prueba incluida, que el color dorado de la barra de
menú de arriba (Archivo/Editar/Seguridad/Configuración) lo pone el
tema/color de énfasis de Windows del propio usuario, no la app — el
mismo código de menú se ve blanco con texto negro en el entorno de
pruebas Linux de esta sesión. La 0.1.39 adelanta al arranque (mientras
se ve la pantalla de carga) la primera lectura en memoria de la
plantilla del dashboard, que antes ocurría en el momento de abrir el
primer proyecto o el Directorio de Talento de cada sesión — así esa
pequeña espera queda escondida detrás del arranque en vez de notarse
al entrar al primer proyecto. La 0.1.40 es un cambio de fondo: las
claves de almacenamiento de cada proyecto (localStorage) pasan de
calcularse por título+fecha (mutables — causa real del bug de la
0.1.37) a calcularse por el ID interno del proyecto (estable, igual
que ya hace la tabla `backups`), con migración automática de los datos
existentes a la primera apertura; se añade un aviso visible cuando la
app no encuentra datos donde debería (en vez de un dashboard vacío
indistinguible de un proyecto nuevo), con guardas para que un backup
automático no pueda sobrescribir uno bueno mientras ese aviso esté
activo; un panel de diagnóstico nuevo en Configuración (versión, rutas
de instalación/datos/BD, registro de parches); y un script de prueba
de humo reutilizable (`scripts/smoke_test.js`) para futuras entregas.
Durante las propias pruebas de esta versión se encontró y arregló un
bug real: cerrar un proyecto con el aviso de datos-no-encontrados
activo podía guardar un backup vacío que luego tapaba a los backups
buenos en "Restaurar último backup". La 0.1.41 corrige el texto de
"Acerca de" (ya no dice "Prototipo"); arregla un bug real encontrado
investigando un texto que señaló el usuario — el aviso "Archivo abierto
fuera de Claude.ai: guardando en Chrome..." se pintaba SIEMPRE en todos
los proyectos dentro de la app de escritorio (la variable que lo
controla, heredada de la skill original pensada también para uso
suelto en navegador, queda siempre en modo "fallback" dentro de
Electron); añade códigos de error cortos (PS-xxxx) a los diálogos de
fallo real de la app, con un listado nuevo en Configuración → "Ver
códigos de error..."; y añade un registro general de la aplicación
(`app.log`, Configuración → "Ver registro de la aplicación") con
auto-rotación por tamaño (2 MB) para que nunca crezca sin límite —
separado de `patch-log.txt`, que sigue igual. La 0.1.42 corrige un bug real
de pérdida de datos: si la carpeta de datos personalizada (por ejemplo, una
unidad de Google Drive) no está montada al arrancar, la app ya no cae en
silencio a la carpeta local tras un solo intento — reintenta con espera
(primero unos segundos antes de mostrar nada, luego más con la pantalla de
carga visible) y, si de verdad no puede acceder, para el arranque con un
diálogo que hay que atender (reintentar o seguir con datos locales a
sabiendas), código nuevo PS-1005; además, mientras la app está en marcha con
un proyecto abierto, vigila cada 45s si sigue pudiendo escribir en esa
carpeta — si detecta un corte a media sesión avisa con un banner en el
dashboard (PS-1006) y empieza a guardar copias de seguridad extra en la
carpeta local mientras dure, para no depender de encontrar los datos a mano
como pasó en el caso real que motivó este arreglo. La 0.1.43 corrige otro bug
real de la misma familia: un hito completado hoy podía dejar la tarjeta de su
proyecto en naranja en la pantalla de "Proyectos" incluso después de
reiniciar la app entera, aunque el propio dashboard ya mostrara el estado
correcto. Causa: el color de la tarjeta se calcula desde el último backup
guardado en la base de datos interna, no desde el estado en vivo, y ese
guardado final al cerrar dependía de una llamada a `beforeunload` que lanzaba
una petición asíncrona sin esperar a que terminara — si se cerraba el
proyecto o la app justo después de un cambio (antes del guardado automático
de cada 15s), ese guardado podía quedar en el aire, más fácil aún con
proyectos grandes o con la carpeta de datos en Drive (más lenta que un disco
local). Ahora, al cerrar cualquier ventana de proyecto (o el Directorio de
Talento, que reutiliza el mismo mecanismo), la app retiene el cierre hasta
confirmar que ese guardado final ha terminado de intentarlo, con un máximo de
4 segundos de margen para no bloquear al usuario si algo va mal. La 0.1.44 es
solo un cambio de texto: el panel "Versiones anteriores" del dashboard es un
mecanismo interno (una foto del proyecto una vez al día) totalmente distinto
de la carpeta de backups automáticos en disco, y el usuario confundió una
cosa con la otra al ver pocos archivos ahí frente a muchos en la carpeta. Se
aclaran el título y los textos de ese panel para que quede explícito que son
cosas distintas; no cambia ningún comportamiento ni corrige ningún dato. El
parche `app.asar` de la 0.1.44 se entregó ROTO por un error de empaquetado
(se construyó copiando archivos a mano en vez de con `electron-builder`, y
se quedó fuera `node_modules/sql.js` — la app no llegaba a arrancar,
"Cannot find module 'sql.js'"); además, la prueba bajo Wine antes de
entregarlo verificó por error un app.asar distinto al que se envió, así que
no lo detectó. La 0.1.45 es el mismo código, empaquetado correctamente con
`electron-builder` esta vez, con `sql.js` confirmado dentro del asar y
probado bajo Wine usando el archivo exacto entregado. Aparte, se creó
`claude/Restaurar-backup.bat`, una herramienta suelta (no parte de
`app.asar`, a propósito) que restaura en un clic el backup de `app.asar`
más reciente si un parche futuro vuelve a dejar la app sin arrancar — el
usuario la copió a mano una vez. La 0.1.46 hace que los instaladores
futuros ya la incluyan de fábrica en `resources\`, vía `extraResources` en
`package.json` (fuera del asar, para que sobreviva aunque `app.asar` se
rompa). La 0.1.47 va un paso más allá: `main.js` registra
`process.on('uncaughtException', ...)` antes de los requires de `./db` y
`./security` (los más frágiles del arranque), y si cualquiera de los dos
revienta —por ejemplo, otro parche mal empaquetado como el de la 0.1.44—
hace automáticamente lo mismo que `Restaurar-backup.bat`: busca el último
`app.asar.bak-*` y lo restaura sola, con un diálogo propio en vez del
diálogo genérico de Electron. Se desarma sola en cuanto `app.whenReady()`
resuelve, para no arriesgar un rollback silencioso ya con la app en marcha.
Probado repitiendo el incidente exacto de la 0.1.44 bajo Wine (asar sin
`sql.js`, con backup bueno esperando): detecta, restaura, dialoga, y la
app vuelve a abrir normal después. La 0.1.48 sustituye el botón flotante
rojo "⏻ Salir" (dashboard y Directorio de Talento) por dos botones en la
cabecera: "💾 Guardar" (fuerza un backup ahora mismo, con estado visible —
"Guardando…" → "✓ Guardado" / "— Nada que guardar aún" / "⚠ Revisa el
aviso de datos" / "✗ No se pudo guardar" — sin depender solo del guardado
automático) y "⏻ Salir" (mismo diálogo de confirmación de siempre, cierra
solo esa ventana). Probado con Xvfb+CDP+xdotool en ambas ventanas
(estados del botón Guardar, diálogo de confirmación de Salir con clics
reales de `xdotool` porque `confirm()` bloquea `Runtime.evaluate`), sin
regresión en `scripts/smoke_test.js` (6/6), y con el `.exe` compilado
arrancando bajo Wine con el asar exacto entregado. La 0.1.49 afina ese
mismo botón "⏻ Salir": ahora solo pide confirmación cuando de verdad hay
cambios sin guardar (comparando el estado actual contra el último
guardado, sin tocar disco) — si el proyecto está vacío o ya está todo
guardado, cierra directo sin preguntar nada. El guardado automático al
cerrar (mecanismo de la 0.1.43) sigue funcionando igual en ambos casos.
Probado con Xvfb+CDP+xdotool los tres estados (vacío, con cambios sin
guardar, recién guardado) en dashboard y Directorio de Talento, sin
regresión en `scripts/smoke_test.js` (6/6). La 0.1.50 añade
"Proyecto → Restaurar un backup concreto..." (dashboard y Directorio de
Talento): una ventana nueva lista TODOS los backups guardados de ese
proyecto por fecha (motivo, tamaño, 🔒 si está cifrado) y deja elegir cuál
restaurar, en vez de solo poder restaurar "el último" automáticamente —
pedido por un usuario con la carpeta de datos compartida entre dos PCs por
Google Drive, cuyo "Restaurar último backup..." no encontraba cambios
hechos en el otro PC. No se creó ningún IPC nuevo: reutiliza
`backup:list`/`backup:restore`, que ya existían en main.js (usados hasta
ahora solo por el lanzador, y `listBackups` nunca se llegaba a invocar
desde ningún sitio). Probado creando dos backups distintos a propósito y
restaurando explícitamente el más antiguo de los dos, confirmando que trae
el contenido correcto de ESE backup y no solo el más reciente. La 0.1.51
arregla la CAUSA RAÍZ de que el usuario no encontrara aquellos cambios en
ningún backup del Directorio de Talento: `saveState()` ahí retrasa 350ms
la escritura real a `localStorage` (debounce), y el mecanismo de backup
(al cerrar la ventana, cada 15s, o "Guardar") podía leer justo ANTES de
que ese guardado pendiente terminara — si el usuario marcaba un parte y
cerraba la ventana casi al momento, ese cambio se perdía de verdad, sin
llegar a ningún backup ni siquiera a persistir en el propio PC. Nueva
`flushPendingSave()` fuerza ese guardado pendiente antes de leer
`localStorage`, en `maybeBackup()` y en `hasUnsavedChanges()`. Verificado
con la app en marcha (Xvfb+CDP): reproducida la ventana de carrera real
(el dato falta en `localStorage` justo tras marcar, antes de los 350ms) y
confirmado que, con el arreglo, un backup disparado en ese mismo instante
sí contiene el cambio (comprobado en el `.json` de backup real en disco,
no solo en pantalla). Este debounce es exclusivo del Directorio de
Talento — el dashboard de proyecto normal guarda de forma síncrona, así
que no le afecta este bug. La 0.1.52 encuentra la CAUSA RAÍZ real (el
usuario aclaró que la marca perdida llevaba DÍAS puesta, no segundos —
la 0.1.51 no lo explicaba): el Directorio de Talento nunca tuvo el
mecanismo "aviso de carga fallida" (`dataLoadWarning`) que el dashboard
de proyecto normal SÍ tiene desde la 0.1.40. Al vincular un PC nuevo a
la carpeta compartida por Drive, `panorama.sqlite3` puede sincronizar
bien (confirmado con el usuario: vio el diálogo "ya tiene datos, usar
tal cual" y lo usó, no copió nada encima) mientras la carpeta
`Partitions/<proyecto>/` (donde vive el `localStorage` real de cada
proyecto, aparte del .sqlite3) todavía no ha terminado de sincronizar —
sin ningún aviso, ese arranque se comporta igual que un Directorio
recién estrenado (Equipo se ve bien porque se auto-reconstruye desde los
proyectos reales) y sigue guardando backups automáticos con total
normalidad. Esos backups nuevos, sin marcas, comparten el mismo cupo
`BACKUP_KEEP=15` (main.js, por proyecto, no por PC) que los backups
reales — bastaba con dejar la ventana abierta un rato para que fueran
expulsando, uno a uno, a los backups de verdad. Se porta al Directorio
de Talento el mismo mecanismo ya probado del dashboard: banner de aviso
(mismo código PS-2001), `hasAnyBackup()` al arrancar si no hay datos
locales, y dos candados en `maybeBackup()`/`hasUnsavedChanges()` (uno
por el aviso activo, otro genérico si el dump de localStorage no tiene
ni rastro de los datos propios del proyecto) que impiden guardar
CUALQUIER backup nuevo mientras el aviso esté activo. Verificado en
vivo (Xvfb+CDP): se vació a mano la clave de localStorage del
Directorio con sus backups reales intactos en la base, se recargó la
ventana, se confirmó el aviso activo, y se comprobó leyendo
`panorama.sqlite3` directamente que 18 segundos después (tiempo de
sobra para el backup de arranque y el periódico de 15s) el número de
backups no había cambiado ni un poco. Este arreglo evita que vuelva a
pasar; no recupera lo que ya se perdió en el incidente real del
usuario, cuyos backups con las marcas ya fueron expulsados antes de
esta versión. La 0.1.53 va un escalón más allá, a raíz de una pregunta
del propio usuario ("si no sincronizo todo del drive ni siquiera los
backups me dará como nuevo, ¿no?"): `getDb()` en `db.js` crea una base
de datos VACÍA y la persiste a disco DE INMEDIATO si `panorama.sqlite3`
no existe todavía en la carpeta configurada — sin distinguir "carpeta
por defecto, normal que empiece vacía" de "carpeta personalizada
compartida entre PCs, donde estar vacía es sospechoso". Esto es más
grave que lo de la 0.1.52: afecta a TODA la base de datos (todos los
proyectos, no solo el Directorio de Talento), y no solo no avisa —
escribe activamente un archivo vacío justo donde Drive puede estar
sincronizando el real. Nueva `checkCustomLocationDatabaseSanity()` en
`main.js`, llamada justo antes de `dbmod.getDb()`: si se usa una
carpeta personalizada sin `panorama.sqlite3`, espera ~20s y si sigue
sin aparecer para el arranque con un diálogo (nuevo código PS-1009) con
tres opciones — esperar más, empezar aquí desde cero (a propósito), o
volver a la carpeta por defecto por ahora (reutilizando sin código
nuevo el aviso ya existente de la 0.1.42). Verificado con la app en
marcha (Xvfb+xdotool+CDP), las tres opciones probadas con clics reales:
confirmado que no se crea nada hasta confirmar, que la carpeta
personalizada queda intacta si se elige volver a la por defecto, y que
si el archivo aparece a mitad de una espera la app lo detecta sola sin
volver a preguntar. De paso, se evaluó y se descartó (por un fallo
técnico probable: los scripts de apagado de Windows corren después de
cerrar sesión, cuando Drive ya está muerto) un script PowerShell que el
propio usuario propuso para retrasar el apagado de Windows hasta que
Drive esté inactivo — queda anotado el motivo por si se retoma. La 0.1.54
retoma justo eso, a petición explícita del usuario tras la 0.1.53
("ahora hay que buscar la seguridad de que no se apague el pc hasta que
no se sincronice drive o one"): nuevo `drive-sync-guard/DriveSyncGuard.ps1`
(empaquetado vía `extraResources`, fuera del asar), un proceso de fondo
por-usuario (sin admin, arrancado por `HKCU\...\Run` al iniciar sesión)
que usa la API real de Windows para esto — `ShutdownBlockReasonCreate`/
`ShutdownBlockReasonDestroy` sobre `WM_QUERYENDSESSION`, vía una clase C#
compilada en caliente con `Add-Type` — en vez del enganche de Directiva
de Grupo del script original del usuario (descartado en la 0.1.53 por
correr después de cerrar sesión, cuando Drive ya está muerto). Mismo
heurístico de "delta de CPU" que el script del usuario, generalizado a
`GoogleDriveFS.exe` Y `OneDrive.exe`. Tope de seguridad fijo de 600s:
nunca bloquea el apagado para siempre. Activar/desactivar desde
Configuración (dos entradas nuevas, dos códigos de error PS-1010/PS-1011,
un `openDriveSyncGuardLog` a juego con `openAppLog`). Verificado en vivo
bajo Wine que activar/desactivar hace de verdad lo que dice (archivo de
estado, entrada de Registro, `app.log`) — pero el mecanismo de bloqueo de
apagado EN SÍ no se ha podido probar de extremo a extremo desde este
entorno: Wine no trae PowerShell real, solo un `powershell.exe` de
mentira que no ejecuta nada, así que el script nunca ha llegado a correr
aquí. Queda pendiente que el usuario lo pruebe en un Windows real. La 0.1.55
responde a cinco peticiones en un solo mensaje: (1) esta vez se entrega el
instalador NSIS COMPLETO, no un parche suelto de `app.asar` como las
0.1.51-0.1.54; (2) nueva espera al ARRANCAR (`waitForCloudSyncIdleAtStartup`,
mismo heurístico de "delta de CPU" de la 0.1.54, tope de 20s, con el texto
de estado visible en la pantalla de carga vía `setSplashStatus`) — la otra
mitad de la protección de apagado, para que la base de datos esté completa
también al ABRIR la app, no solo al cerrar Windows; (3) página nueva en el
instalador para elegir si los datos van en este PC o en una carpeta
compartida (Drive/OneDrive), que escribe `location.json` automáticamente en
vez de tener que configurarlo a mano después de instalar — un bug real de
saltos relativos de NSIS mal contados se encontró y arregló probando esta
página con clics reales; (4) `allowElevation: false` para quitar la opción
de instalar "para todos los usuarios" (fuente de problemas reales en la
0.1.36) — cambio verificado correcto leyendo el código fuente de
electron-builder, pero su efecto en pantalla NO se puede demostrar en Wine
porque el usuario "root" de Wine siempre es admin-equivalente; (5) los
parches de `app.asar` ahora pueden nombrarse con el SHA-256 incrustado
(`<hash>-App0155.asar`) y `applyAsarPatch()` comprueba solo, al cargarlos,
si el contenido real coincide con lo que dice el nombre — verificado en
vivo bajo Wine la rama de archivo con hash que NO coincide (bloqueada con
un diálogo de error), la rama de hash que SÍ coincide se revisó por código
pero no se llegó a confirmar por pantalla en esta sesión. La 0.1.56 nace de
un script de PowerShell de otra IA que el usuario pasó como idea: se
rechazan explícitamente dos partes (auto-elevación a administrador, que iría
contra la 0.1.55; y un script de apagado por GPO, el mismo enfoque ya
descartado en la 0.1.53 porque corre después de cerrar sesión, cuando
Drive/OneDrive ya están muertos) y se adopta la idea del lockfile
multi-PC, implementada dentro de `main.js` (no como script envoltorio
aparte) con aviso-y-dejar-elegir en vez de bloqueo duro:
`.panorama-lock.json` dentro de la carpeta de datos compartida, heartbeat
cada 30s, aviso si la señal de otro equipo tiene menos de 2 minutos, con
opción de abrir igualmente — nuevo código PS-1012. De paso, a petición
explícita del usuario, la protección de apagado (0.1.54) deja de ser un
interruptor manual: se activa/desactiva sola según si se usa una carpeta de
datos personalizada (`syncDriveSyncGuardWithLocation`, en cada arranque). Se
confirma además que la espera al arrancar (0.1.55) ya tenía esa misma guarda
desde el principio, sin necesitar ningún cambio. De paso se cierra un hueco
de verificación pendiente de la 0.1.55: la rama "VÁLIDO" del checksum en el
nombre del parche, probada ahora en vivo con el propio parche de esta
entrega. Todo verificado en vivo bajo Wine con clics/estado reales (los 4
casos del lockfile, el menú sin el interruptor manual, la rama VÁLIDO del
checksum) — pendiente de confirmar solo el caso de dos PCs físicos DE
VERDAD a la vez (aquí solo se pudo simular con arranques sucesivos en la
misma máquina).

La 0.1.57 corrige un hueco que señaló el usuario: hasta entonces la app
NUNCA comprobaba de verdad si una carpeta de datos personalizada era
compartida (Drive/OneDrive) o simplemente local — se asumía siempre
compartida, sin preguntar. Ahora `location.json` guarda un campo
`"shared": true|false` explícito; si falta (configuración de antes de la
0.1.57) se trata como compartida por compatibilidad hacia atrás, sin
cambiar el comportamiento existente sin avisar. Desde "Configuración →
Cambiar ubicación de los datos..." aparece una pregunta directa
("¿Esa carpeta la vas a compartir entre varios PCs?"); el instalador
escribe `"shared": true` explícito al elegir la carpeta compartida. La
nueva `isUsingSharedDataLocationNow()` (en vez de la anterior
`isUsingCustomDataLocationNow()`, que solo miraba "¿hay carpeta
personalizada?") pasa a controlar la protección de apagado, la espera al
arrancar y el bloqueo multi-PC — el chequeo de sanidad de la base de datos
en carpeta personalizada sigue sin ese filtro a propósito, porque también
aplica a una carpeta local en otro disco. Además, a petición explícita del
usuario, se quita el mensaje de la pantalla de arranque que iba contando
segundos de espera por sincronización ("Esperando a que termine de
sincronizar Drive/OneDrive... (4s) (5s)...") — se deja fija en "Iniciando..."
con la barra de progreso animada de siempre; el detalle sigue quedando en
`app.log`, solo se dejó de mostrar en pantalla. Instalador completo
reconstruido (cambió `installer.nsh`) y verificado en vivo: el camino "no
compartida" probado en Electron nativo (confirma `shared: false` y que no
se crea lockfile), el camino "compartida" del instalador probado con el
mismo arnés aislado de la 0.1.55/0.1.56, arranque bajo Wine mostrando
"0.1.57".

La 0.1.58 corrige un bug real y confirmado con evidencia de Windows real
(no adivinado): la protección de apagado nunca ha llegado a ejecutarse en
ninguna de sus versiones (0.1.54-0.1.57). Causa: `DriveSyncGuard.ps1` se
guardaba en UTF-8 sin BOM, y Windows PowerShell 5.1 (el `powershell.exe`
de serie) lee un `.ps1` sin BOM con la página de códigos ANSI del
sistema en vez de UTF-8 — cualquier tilde se decodificaba mal, y eso
rompía la sintaxis del script de verdad, con un error de parseo que
impedía ejecutarlo desde la primera línea (por eso `guard.log` nunca se
creaba pese a que la app marcaba la protección como "activa"). Se
confirmó pidiendo al usuario ejecutar el script a mano con
`-ExecutionPolicy Bypass` sin ventana oculta: la cascada de errores de
parseo mostró literalmente el texto mal decodificado
("LÃ­mite de seguridad" en vez de "Límite de seguridad"). Arreglo: se
quitó todo carácter fuera de ASCII del archivo (tildes, la raya "—"),
verificado que el resultado es 100% ASCII y que el recuento de
llaves/paréntesis/comillas es idéntico al original — no se tocó
sintaxis, solo texto. Sin `pwsh` ni red disponibles en este entorno de
desarrollo para reconfirmar con un parser de PowerShell real, la
verificación final queda pendiente de que el usuario repita su misma
prueba manual. Entrega en dos vías: el `.ps1` corregido suelto (para
sustituir a mano, ya que vive fuera de `app.asar` como `extraResources`
y el parche no lo toca) y el instalador completo partido en 5 archivos
(por tamaño, en vez de los 4 habituales).

La 0.1.59 corrige una carrera real que el propio usuario señaló
razonando sobre el mecanismo (no probando): `WM_QUERYENDSESSION` se
contesta una sola vez, en el instante exacto en que Windows empieza a
apagar — si en ese momento Drive/OneDrive todavía no habían reaccionado
al último guardado de la app, el guard podía contestar "adelante" antes
de que hubiera nada que objetar, sin una segunda oportunidad. Se
encontró además, revisando el código, un bug en el sentido contrario:
si el guard llegaba a bloquear, solo soltaba el bloqueo a los 10
minutos, nunca cuando Drive se detectaba inactivo de forma normal. El
arreglo: la primera vez que llega `WM_QUERYENDSESSION` el guard SIEMPRE
bloquea un margen mínimo fijo de 25s, haya o no actividad de CPU
detectada todavía (mismo espíritu que ya tenía el arranque); se sustituyó
`Update-SafetyCap` por `Update-ShutdownGrace`, anclada al instante del
aviso de apagado en vez de a cuánto llevaba Drive "ocupado" en
abstracto. Mismas dos vías de entrega que la 0.1.58 (`.ps1` suelto +
instalador completo en 5 partes), y misma limitación honesta: sin
Windows/PowerShell real aquí, la verificación queda pendiente de que el
usuario repita la prueba de "guardar y apagar seguido".

La 0.1.60 es una auditoría completa del mecanismo de sincronización,
pedida por el usuario ("no haya nada redundante... no haya restos...
profesional y segura en todos sus aspectos"), no un bug reportado.
Cuatro cambios: (1) el guard ahora escribe un `heartbeat.txt` en cada
sondeo (cada 5s) y la app lo usa para relanzarlo solo si deja de dar
señales de vida, cerrando el tipo de hueco que dejó pasar el bug de la
0.1.58 sin detectar durante tres versiones — antes solo se comprobaba
`enabled.flag`, que dice lo que debería pasar, no lo que pasa de
verdad; (2) el sondeo de CPU al arrancar pasa de hasta ~10 procesos
`powershell.exe` (uno por muestra) a uno solo que hace todo el sondeo
internamente y va imprimiendo su progreso, leído en streaming desde
Node; (3) las escrituras de disco durante una sesión ya en marcha
(vigilancia de la carpeta compartida, bloqueo multi-PC) pasan de
síncronas a asíncronas, para que una carpeta colgada no pueda congelar
la ventana entera — la versión síncrona se deja solo en la fase de
arranque, donde bloquear es una decisión ya consciente; (4) se quitan
dos restos sin ningún uso real (`setSplashStatus` en main.js,
`CapExceeded` en el `.ps1`). A diferencia de la 0.1.58/0.1.59, esta vez
el `.ps1` suelto no basta por sí solo — dos de los cuatro cambios viven
en `main.js`, dentro de `app.asar` — hace falta el instalador completo.

Investigando en vivo con el usuario en dos PCs (uno corporativo con
Sophos, otro personal solo con el Defender de serie) se encontró que el
guard, lanzado a mano por el usuario, funciona perfecto en los dos — pero
el mismo lanzamiento hecho por la app (oculto, separado de la consola) no
deja ningún rastro en NINGUNO de los dos, sin error visible por ningún
lado ni en los logs de la app ni en los de Defender/Sophos. Descarta que
sea específico de una política corporativa de un antivirus concreto. La
0.1.61 no arregla esto (no se sabe todavía la causa exacta) — instrumenta
el lanzamiento automático para poder verla: la salida de PowerShell, antes
descartada (`stdio: 'ignore'`), ahora se captura en
`spawn-diagnostico.log`, junto con el código de salida del proceso.

La 0.1.62 sí es un bug real de pérdida de datos, encontrado leyendo el
código a raíz de una prueba muy detallada del usuario (añadir hito,
guardar, esperar un minuto, backup con marca de tiempo nueva pero sin el
hito dentro). Causa: `maybeBackup()` (duplicada en
`dashboard/plantilla_dashboard.html` y
`directorio/plantilla_directorio.html`) actualizaba su "sello" de último
guardado antes de comprobar si el guardado en disco había funcionado de
verdad, y nunca miraba el resultado real de `saveBackup()` — un fallo de
escritura pasajero (p.ej. un hipo de la carpeta compartida de
Drive/OneDrive) se daba por bueno para siempre, y los guardados
automáticos siguientes ya no reintentaban. Fix: comprobar el resultado
real antes de actualizar el sello, más diagnóstico nuevo en `app.log`
(una línea por cada intento de guardado, éxito o no, sin contenido real)
y forzado explícito del guardado al cerrar la ventana. El usuario pidió
expresamente no solo diagnóstico sino solución ("me parece bien que
incluyas diagnostico pero quiero solucion"), y esta versión entrega el
fix de código, no solo instrumentación.

La 0.1.63 retoma el misterio del guard que no deja rastro (0.1.61): el
usuario compartió por fin spawn-diagnostico.log, que muestra el proceso
terminando en 315-507ms con codigo=0 y CERO salida — el único punto del
script capaz de terminar así de rápido es el chequeo de enabled.flag al
arrancar. Hipótesis (no confirmada del todo): demora de visibilidad
entre procesos por el antivirus/EDR ante un archivo recién escrito por
un ejecutable sin firmar. Cambio: el chequeo ahora reintenta hasta 5
veces con 300ms entre cada uno antes de rendirse, y deja constancia en
guard.log si hizo falta el reintento — barato, sin riesgo si la causa
fuera otra. Todo el cambio vive en DriveSyncGuard.ps1 (extraResources,
fuera de app.asar), así que hace falta el instalador completo otra vez.

La 0.1.64 llega porque el usuario probó la 0.1.63 en caliente (mató el
proceso del guard a mano para forzar un relanzamiento real) y el fallo
se reprodujo en ~280ms -- demasiado rapido para que el reintento de la
0.1.63 (minimo 1.2-1.5s si no encuentra el flag) se hubiera agotado.
Contradice la hipotesis anterior. Ademas se cae en la cuenta de que
nunca se confirmo que la captura de stdout/stderr del hijo (0.1.61)
funcionara de verdad -- todo lo visto hasta ahora lo escribe el proceso
padre, nunca una linea real del script. Cambio de estrategia: el propio
DriveSyncGuard.ps1 ahora escribe su propia traza paso a paso
(trace-arranque.log, funcion Write-StartupTrace, 16 puntos desde la
primera linea ejecutable hasta el final), independiente de si Node
consigue capturar su salida. Puramente diagnostico, no un intento de
arreglo -- pendiente de que el usuario repita la prueba y comparta ese
archivo.

La 0.1.65 llega tras pegar el usuario el app.log completo de varios dias
(31/08-02/09): el ciclo "relanzando" fallo sin excepcion en todo ese
tiempo, en las versiones 0.1.60-0.1.64. Se aclara que la linea "activada
sola" en app.log se escribe siempre, fuera del try/catch del spawn() --
no prueba que el proceso se lanzara de verdad. En vez de otra version
especulativa, se aislan variable a variable las tres cosas que usa el
spawn() real y que un lanzamiento manual no usa, reproduciendolas en vivo
desde PowerShell en la propia maquina del usuario: detached:true (via
Start-Process) y windowsHide:true / CreateNoWindow (via
ProcessStartInfo.CreateNoWindow=$true, un flag DISTINTO de -WindowStyle
Hidden aunque el nombre confunda) -- ambas, aisladas, llegan limpias
hasta Application.Run, con trace-arranque.log completo. Queda sin poder
descartar una unica variable: la redireccion de stdout/stderr del hijo
hacia descriptores de archivo reales (fs.openSync, de la 0.1.61) -- y
nunca se vio una linea real del script ahi, solo lo que escribe el
proceso padre. Cambio: se quita esa redireccion, vuelve a stdio:'ignore'
como antes de la 0.1.61. detached y windowsHide se dejan igual (ya
descartados). Solo main.js -- entrega como parche app.asar suelto, no
instalador completo.

Resultado real: la hipotesis de la 0.1.65 tambien fallo -- mismo patron
de siempre (codigo=0 en ~280ms, trace-arranque.log vacio), confirmado
tras matar dos procesos manuales que habian quedado vivos de pruebas
anteriores (mantenian el heartbeat fresco y por eso la app no habia
necesitado relanzar nada).

La 0.1.66 encuentra la causa real, confirmada en vivo, no una hipotesis
mas. Con las tres variables del spawn() ya descartadas, quedaba una
diferencia sin probar: en las pruebas manuales el padre siempre era la
consola del usuario, nunca Electron. Con Process Explorer se descarta un
Job Object restrictivo (Breakaway OK y Silent Breakaway OK activados,
sin limites de recursos) pero se encuentra el dato decisivo en la
pestana Environment: el proceso de Electron tiene PROCESSOR_ARCHITECTURE
AMD64 pero PROCESSOR_IDENTIFIER de un chip ARM real -- la maquina del
usuario es un Surface Pro con Snapdragon/ARM64, y la app (compilada x64
por defecto, sin arquitectura fijada en electron-builder) corre bajo el
emulador de Windows. Confirmado que la consola del usuario es ARM64
nativa. Reproduccion decisiva sin escribir codigo: usando el propio .exe
instalado en modo Node puro (ELECTRON_RUN_AS_NODE=1), el mismo spawn()
exacto falla igual que el guard real -- primera vez que se reproduce el
fallo a voluntad. Y la solucion tambien se prueba en vivo antes de
escribir nada: el mismo lanzamiento hecho por una tarea temporal del
Programador de tareas de Windows llega limpio hasta Application.Run (el
Programador ejecuta desde su propio servicio, nativo ARM64, fuera del
arbol de procesos de Electron). Cambio: enableDriveSyncGuardSilently ya
no usa spawn() directo -- crea/actualiza una tarea programada
(PanoramaDriveSyncGuardLaunch, disparo unico en el pasado para que nunca
se dispare sola) y la dispara con schtasks /run cada vez que hay que
arrancar o relanzar el guard; disableDriveSyncGuardSilently la borra. El
arranque al iniciar sesion (reg.exe, via explorer.exe, que si es nativo)
no cambia. Pendiente: otro spawn('powershell.exe') en main.js (deteccion
de actividad de Drive/OneDrive al arrancar, ~linea 3570) no se toco --
corre en primer plano sin la logica de relanzamiento, no es el origen de
este bug, pero podria sufrir lo mismo en teoria. Solo main.js -- parche
app.asar suelto.

Resultado real: la causa raiz de la 0.1.66 esta confirmada -- por primera
vez en toda la investigacion, un relanzamiento AUTOMATICO real (PID 3300)
llego completo hasta Application.Run con heartbeat.txt avanzando solo.
Pero aparecieron dos efectos secundarios nuevos: el guard se paraba solo
a los ~50s, y el usuario reporto una ventana cmd negra parpadeando cada
ciertos segundos.

La 0.1.67 corrige ambos. El paro a los 50s: confirmado con
Get-ScheduledTask que schtasks /create basico crea la tarea con
DisallowStartIfOnBatteries=True y StopIfGoingOnBatteries=True por
defecto -- el Programador de tareas mataba el proceso al detectar
bateria, justo el escenario en que mas falta hace el guard. Confirmado
via WebFetch sobre ss64.com que no existe parametro de linea de comandos
para esto -- hace falta /create /xml con una definicion XML completa
para desactivar esas condiciones. El parpadeo: ninguna llamada
execFile('reg.exe'/'schtasks.exe', ...) llevaba windowsHide:true de
Node -- sin eso, cada proceso de consola lanzado desde una app sin
consola parpadea brevemente; antes de la 0.1.66 solo pasaba una vez, con
el ciclo de relanzamiento pasa varias veces por minuto. Cambio:
enableDriveSyncGuardSilently ahora escribe task-definition.xml (con
DisallowStartIfOnBatteries=false, StopIfGoingOnBatteries=false,
LogonType=InteractiveToken, ExecutionTimeLimit=PT0S sin limite) y crea
la tarea con /create /xml en vez de los parametros sueltos; nueva
funcion escapeXmlText() para insertar la ruta del script con seguridad.
Las seis llamadas execFile de activar/desactivar el guard llevan ahora
{ windowsHide: true }. No se ha podido probar la sintaxis XML en este
entorno Linux -- depende de que el usuario confirme que schtasks
/create /xml acepta esta definicion. Solo main.js -- parche app.asar
suelto.

El usuario confirmo en vivo que la 0.1.67 arreglo el paro a los 50s
(DisallowStartIfOnBatteries/StopIfGoingOnBatteries en False, PID estable
varios minutos), pero la ventana negra seguia apareciendo. Primera
comprobacion (LastRunTime estatico, app cerrada) hizo descartarla como
causa nuestra -- conclusion prematura. El usuario reporto despues "abri
panorama y salto la ventana de cmd" con Get-ScheduledTaskInfo mostrando
PanoramaDriveSyncGuardLaunch disparandose justo en ese instante -- si era
nuestra tarea.

Causa real 0.1.68: windowsHide:true (0.1.67) solo cubre las llamadas
execFile que la app hace para crear/lanzar/borrar la tarea -- no cubre el
parpadeo que puede darse cuando el propio SERVICIO del Programador de
tareas crea el proceso de la accion (powershell.exe -WindowStyle Hidden
...), un comportamiento distinto y ya documentado de Windows: el
parametro -WindowStyle Hidden lo interpreta powershell.exe una vez
arrancado, pero quien crea el proceso es el servicio del Programador de
tareas, no la app -- windowsHide del execFile no tiene control sobre eso.
Cambio: la tarea ya no ejecuta powershell.exe directamente, ejecuta
wscript.exe, que lanza un script auxiliar nuevo
(drive-sync-guard/LaunchHidden.vbs, nuevo extraResources) via
WScript.Shell.Run(comando, 0, False) -- tecnica estandar de Windows para
lanzar un proceso realmente sin ventana desde una tarea programada. La
logica del guard (DriveSyncGuard.ps1) no cambia. Por tocar extraResources,
instalador completo, no vale el parche suelto. No se ha podido probar en
este entorno si el parpadeo realmente desaparece en la maquina ARM64 del
usuario -- pendiente de su confirmacion en caliente.

El usuario confirmo en vivo: ventana negra arreglada de verdad ("la negra
ya no sale"). Pero al pedirle los mismos chequeos de siempre aparecio un
dato nuevo: heartbeat.txt clavado mientras la tarea ya mostraba un
disparo "exitoso" -- algo se disparaba pero el guard no volvia a dar
señales de vida. guard.log confirmo que el proceso se corto sin salida
limpia ni error capturado (cortado desde fuera). La prueba decisiva: un
disparo manual (schtasks /run) con comprobacion inmediata de procesos --
ningun powershell.exe nuevo llevaba los argumentos esperados, y
trace-arranque.log no gano ninguna linea nueva. Conclusion con evidencia
dura: el mecanismo wscript.exe + LaunchHidden.vbs de la 0.1.68 no estaba
lanzando el guard en absoluto, ni en el relanzamiento automatico ni a
mano.

La 0.1.69 corrige el propio mecanismo. Causa razonada (no reproducible
el parseo exacto de argv de wscript.exe en este entorno Linux): la 0.1.68
pasaba a LaunchHidden.vbs el COMANDO COMPLETO de powershell.exe como un
unico argumento con comillas internas ya escapadas -- dos niveles de
comillas anidadas que debian sobrevivir XML -> argv de wscript.exe ->
WScript.Arguments. (Get-ScheduledTask ...).Actions confirmo que lo
registrado en la tarea era correcto, asi que la corrupcion pasa en el
parseo/interpretacion de wscript.exe, no reproducible aqui. Fix: reducir
al minimo las comillas -- la tarea ahora le pasa a LaunchHidden.vbs SOLO
LA RUTA del script (una unica cadena entre comillas, sin comillas
internas), y es el propio VBScript quien construye la linea de comandos
de powershell.exe con Chr(34). Solo main.js + LaunchHidden.vbs (fuera de
app.asar) -- instalador completo, no vale el parche suelto. No se ha
podido probar en este entorno si esta version simplificada si lanza el
guard -- pendiente de confirmacion en caliente, esta vez con un disparo
manual (schtasks /run) pedido como prueba principal por ser mas rapido y
directo que esperar el ciclo del watchdog.

El usuario confirmo el disparo manual: powershell.exe nuevo con
CommandLine correcto, trace-arranque.log completo, heartbeat.txt fresco.
El mecanismo de lanzamiento de la 0.1.69 SI funciona -- cerrado.

El usuario hizo entonces la prueba real que quedaba pendiente desde hace
varias versiones: apagar con Drive sincronizando. Aparecio la pantalla
"esperando a que termine de sincronizar", guard.log confirmo que a los
25s el guard soltaba el bloqueo correctamente, pero el apagado NUNCA se
completo -- espero casi 1 minuto y tuvo que cancelarlo el mismo.

La 0.1.70 encuentra y arregla un bug real de fondo, confirmado contra la
documentacion OFICIAL de Microsoft (learn.microsoft.com/windows/win32/
shutdown/wm-queryendsession y /shutdown/shutting-down, consultada antes
de tocar nada): el WndProc que contesta a WM_QUERYENDSESSION devolvia
SIEMPRE FALSE ((IntPtr)0), con un comentario que decia "pide a Windows
que espere" -- exactamente al reves de lo documentado. FALSE significa
"esta app SE NIEGA al apagado" (solo para cuando apagar corromperia
datos), no es la forma de pedir mas tiempo; para eso hay que devolver
SIEMPRE TRUE y usar ShutdownBlockReasonCreate/Destroy aparte -- Windows
retoma el apagado solo en cuanto se llama a Destroy, sin repreguntar. Con
FALSE, la unica respuesta a WM_QUERYENDSESSION (llega una sola vez por
intento) quedaba registrada como una negativa definitiva; soltar
ShutdownBlockReasonDestroy despues no la revierte. Encaja exacto con lo
visto: el guard.log decia "se suelta el bloqueo", pero Windows nunca iba
a continuar solo porque ya le habian contestado que no.

Fix: un solo cambio, m.Result = (IntPtr)1 en vez de (IntPtr)0 en el
WndProc de DriveSyncGuard.ps1. El resto del mecanismo (25s de margen,
600s de tope) no cambia. Solo DriveSyncGuard.ps1 (fuera de app.asar) --
instalador completo. No se ha podido probar en este entorno si esto
resuelve el apagado real del usuario -- pendiente de su confirmacion, es
la prueba mas importante de toda la investigacion.

El usuario confirmo antes de probar: .ps1 instalado con el fix (grep OK),
un solo guard vivo, trace y heartbeat sanos. Probo el apagado real: "no
apaga, lo mismo". Pero guard.log mostro un ciclo LIMPIO esta vez (una
sola WM_QUERYENDSESSION, suelta correcta 28s despues) -- el fix de la
0.1.70 en si funciono. Preguntado si en la pantalla de apagado aparecia
otra app ademas de Panorama, el usuario confirmo que si: Outlook -- app
ajena al proyecto, con su propio bloqueo de apagado independiente. El
"no apaga" no era un bug de Panorama, era Outlook reteniendo tambien.

Se dio la investigacion por cerrada, con la salvedad honesta de que
faltaba la prueba "cristalina" (solo Panorama bloqueando, sin ninguna
otra app). El usuario hizo esa prueba y AUN ASI no apagaba (captura:
"Cerrando 1 aplicacion y apagando", solo Panorama en la lista) -- el bug
seguia ahi de verdad, esta vez sin ninguna otra explicacion posible.

La 0.1.71 encuentra la segunda pieza del mismo bug, otra vez confirmada
contra documentacion OFICIAL de Microsoft antes de tocar nada
(learn.microsoft.com/windows/win32/shutdown/wm-endsession): el fix de la
0.1.70 (TRUE a WM_QUERYENDSESSION) era correcto pero incompleto. Segun
esa documentacion, tras soltar el bloqueo Windows envia WM_ENDSESSION, y
la sesion puede terminar en cuanto TODAS las apps devuelvan ese mensaje
-- la app "debe terminar", si no Windows la fuerza. El guard soltaba
ShutdownBlockReasonDestroy correctamente pero seguia vivo indefinidamente
en segundo plano -- lo contrario de lo que este mecanismo espera (esta
pensado para apps que se CIERRAN tras el margen de gracia, no que
sobreviven al apagado).

Fix: en el momento de soltar el bloqueo (las dos ramas de
Update-ShutdownGrace), el guard ahora tambien llama a
[System.Windows.Forms.Application]::Exit() para terminar su proceso, en
vez de seguir corriendo. No se pierde proteccion: si se cancela el
apagado, el watchdog de la app principal (cada 45s) relanza el guard
solo en menos de un minuto -- mismo mecanismo ya probado desde la 0.1.66.
El mismo patron (soltar + Application.Exit()) ya existia en este script
para otro caso (enabled.flag desactivado) desde hace versiones. Solo
DriveSyncGuard.ps1 (fuera de app.asar) -- instalador completo. No se ha
podido probar en este entorno si esto resuelve el apagado real del
usuario -- pendiente de su confirmacion.

CONFIRMADO por el usuario con dos apagados reales independientes (uno con
la app cerrada, otro con la app abierta): el fix de la 0.1.71 funciona de
punta a punta. Se dio por cerrada la investigacion completa del guard
(0.1.60 -> 0.1.71), con auditoria posterior de las funciones relacionadas
que no encontro restos muertos de ninguna de las iteraciones anteriores.

La 0.1.72 anade corrector ortografico con menu de clic derecho (peticion
del usuario): setSpellCheckerLanguages(['es-ES']) por sesion y un handler
context-menu que arma sugerencias, "Agregar al diccionario" y
Cortar/Copiar/Pegar/Seleccionar todo. Probado de verdad: el mecanismo del
menu contextual en si, con un clic derecho real via CDP + captura de
pantalla. NO probado aqui: que aparezcan sugerencias de correccion --
la carpeta de diccionarios de Chromium queda vacia porque este entorno
tiene bloqueado el acceso de red al servidor de Google del que se
descarga el diccionario es-ES la primera vez; limitacion de este entorno
de pruebas, no del codigo, y queda pendiente de que el usuario lo
confirme en su Windows real. Solo main.js -- entregado como parche
app.asar.

La 0.1.73 anade "Evaluacion de Candidatos" integrada en la app (menu
Proyecto -> Evaluacion de Candidatos...), 3a iteracion de la misma
peticion tras rechazarse una plantilla Excel y una app HTML suelta.
Un solo documento vivo por proyecto (puestos + evaluaciones): tabla
candidate_evals (project_id como PRIMARY KEY) solo con metadatos
ligeros, el JSON real vive en un archivo dentro de la carpeta de
backups del proyecto -- mismo principio ya aplicado a los backups
para no penalizar cada guardado de la app con contenido voluminoso
en SQLite. Renderer nuevo evaluacion-candidatos/plantilla_evaluacion_
candidatos.html, adaptado de una app HTML/JS ya probada con Playwright
(sin localStorage, sin datos de ejemplo, guardado vía panoramaBridge
con debounce de 400ms salvo en acciones discretas). Probado de verdad
con Xvfb+CDP+xdotool contra la app real: menu, ventana, +anadir puesto/
tarea/evaluacion, calculo de nota ponderada y veredicto, exportar CSV
via dialogo nativo, borrar puesto con evaluacion asociada, y sobre
todo persistencia real tras cerrar y reabrir proyecto y ventana. NO
probado: guardado con cifrado activado, y el caso limite de cerrar la
ventana dentro del debounce de 400ms tras escribir texto libre.
Entregado como parche app.asar.

La 0.1.74 cambia el peso de las tareas en "Evaluacion de Candidatos" de
porcentaje (0-100, debia sumar 100%) a una escala de importancia 0-5,
igual que en el Excel anterior del usuario. Solo toco el renderer
(evaluacion-candidatos/plantilla_evaluacion_candidatos.html): limites
del input, textos, y la insignia por puesto (ya no exige que sumen
100%, solo avisa si no hay ningun peso asignado). El calculo de nota
ponderada (media sumWN/sumW) no cambio -- ya era agnostico a la escala.
Probado con Playwright: limites 0-5 con clamp, sin rastro de "100%" en
pantalla, calculo peso 5 + nota 4 -> 4.0/5 APTO correcto, 0 errores JS.
Cambio confirmado en el asar compilado. Exe arranca bajo Wine (los
"GPU process exited" del log son ruido de Wine con render por software,
no de la app). No se retesteo persistencia/cifrado/export porque no se
tocaron. Entregado como parche app.asar comprimido en zip porque al
usuario le fallaba la descarga del asar suelto.

La 0.1.75 anade telefono y CV adjunto al candidato en "Evaluacion de
Candidatos". Campo telefono junto a TAP/Manager, y bloque CV con
+Adjuntar/Ver/Cambiar/Quitar. El CV se copia a una carpeta cv/ hermana
del estado.json (nunca al JSON en si, y nunca cifrado aunque la
Seguridad este activa -- limitacion documentada). Tres IPC nuevos en
main.js: candidateEval:pickCv (dialog.showOpenDialogSync + copia,
limite 15MB), candidateEval:openCv (shell.openPath), candidateEval:
removeCv -- los dos ultimos validan el nombre de archivo recibido
contra path traversal. Probado con la app real (Xvfb+CDP+xdotool, no
solo Playwright) porque toca un dialogo nativo real: adjuntar un PDF
de verdad copia el archivo byte a byte (diff), Ver CV lo abre de
verdad con el lector disponible (LibreOffice en este sandbox), Quitar
lo borra de disco, y telefono+CV sobreviven cerrar/reabrir proyecto y
ventana por completo. Cambio confirmado en el asar compilado, exe
arranca bajo Wine. No probado: Windows real, CV con cifrado activado.
Entregado como parche app.asar comprimido en zip.

La 0.1.76 anade "N entrevista(s) pendiente(s)" como texto de color en
las tarjetas del launcher. Se descarto vincular entrevistas con hitos
del dashboard (los hitos viven en localStorage de la ventana del
dashboard, no en un archivo -- sync automatico fragil si esa ventana
esta cerrada). En su lugar: nueva computeCandidatePendingInterviews()
en main.js (reutiliza readCandidateEvalPayloadForProject, extraida de
candidateEval:get) que lee el estado.json de Evaluacion de Candidatos
de cada proyecto -- sin depender de ninguna ventana abierta -- y cuenta
evaluaciones con fecha puesta y no completadas, con los MISMOS
umbrales de dias que ya usa computeProjectSemaforo para hitos (rojo/
naranja/amarillo/amarillo-claro/sin nivel). Anadido a projects:list
como pendingInterviewsCount/Level. launcher/renderer.js pinta la linea
solo si count>0, con clases txt-<nivel> reutilizando las mismas
variables de color que el borde del semaforo de hitos. Sin cambios en
db.js/preload.js ni en el renderer de Evaluacion de Candidatos --
calculo de solo lectura. Probado con la app real (Xvfb+CDP) forzando
datos para cada umbral: rojo (vencida+manana combinadas, excluyendo la
completada), singular sin color (>7 dias), naranja (1 dia) y amarillo
(3 dias) por separado confirmados con captura, y el caso sin pendientes
(linea ausente). Cambio confirmado en el asar, exe arranca bajo Wine.
No probado: seguridad activada y bloqueada, Windows real. Entregado
como parche app.asar comprimido en zip.

La 0.1.77 arregla el color del campo Telefono en Evaluacion de
Candidatos (le faltaba input[type=tel] en el selector CSS que pinta el
fondo/texto ambar de TAP/Manager -- se quedaba blanco por defecto),
anade el campo Entrevistador (entre Manager y Telefono, en la UI y en
el export CSV), y hace clicable el aviso "N entrevista(s)
pendiente(s)" del launcher: abre (o enfoca si ya esta abierta) la
ventana de Evaluacion de Candidatos de ese proyecto directamente en la
pestana Evaluaciones. openCandidateEvalWindow(row, opts) gana
opts.focusEvaluaciones -- si la ventana ya existe le manda el IPC
candidateEval:focusEvaluaciones, si no existe la crea con
--panorama-initial-tab=evaluaciones en los argv (mismo patron que
--panorama-project-id). Nuevo IPC candidateEval:openWindow en main.js,
nuevo openCandidateEval(id) en preload-launcher.js, nuevo
onFocusEvaluaciones/initialTab en preload.js. El listener de clic
delegado de launcher/renderer.js paso de mirar solo button[data-act] a
[data-act] para capturar tambien el nuevo <span data-act="openEval">.
El camino de menu nativo (Proyecto -> Evaluacion de Candidatos...) no
cambia -- sigue sin pasar opts, arranca en Puestos como siempre.
Probado con la app real (Xvfb+CDP) sin inyectar JSON a mano -- puesto y
evaluacion creados desde la propia UI, campos rellenados escribiendo en
los inputs reales: Telefono con el mismo getComputedStyle que TAP,
Entrevistador visible/guardado/en el CSV, persistencia real tras cerrar
y reabrir la ventana, y los dos caminos del clic (ventana cerrada ->
abre ya en Evaluaciones; ventana abierta en otra pestana -> cambia de
pestana sin duplicar ventana) confirmados via el estado del DOM antes y
despues del clic. Cambio confirmado en el asar compilado, exe arranca
bajo Wine sin excepcion propia de la app. No probado: el camino de
menu nativo tras este cambio concreto (no deberia haberse tocado, pero
no se repitio la comprobacion visual), Windows real. Entregado como
parche app.asar comprimido en zip.

La 0.1.78 anade guia libre por TAREA (no por puesto) en Evaluacion de
Candidatos, a peticion del usuario tras planteale 3 opciones en
conversacion (texto por puesto, texto por tarea, adjuntar archivo tipo
CV) sin tocar codigo primero. Cada tarea gana campo guide (string,
vacio en tareas nuevas, tratado como '' si no existe en tareas viejas
-- sin migracion). En Puestos: textarea "Guia de esta tarea" bajo
nombre+peso de cada tarea, mismo patron data-action que task-name/
task-weight. En Evaluaciones: si la tarea tiene guia, se muestra en
cursiva bajo su nombre en la tabla de tareas -- SOLO LECTURA ahi (se
edita solo desde Puestos), pensada para tenerla a la vista al puntuar.
Sin guia no anade nada visual. El click de pestanas gano refresco de
renderEvaluaciones() al entrar en esa pestana (antes solo resultados
se refrescaba asi) para que una guia editada en Puestos no se quede
obsoleta en el DOM. Sin cambios en main.js/preload.js/db.js -- todo
dentro de plantilla_evaluacion_candidatos.html, mismo documento
estado.json de siempre. No anadida al CSV (resumen por candidato, no
por tarea) pero si sale en el JSON (vuelca state completo). Probado
con la app real (Xvfb+CDP) desde la UI real sin inyectar JSON a mano:
guia escrita en una tarea real confirmada en state, mostrada en modo
lectura en Evaluaciones tras asignar el puesto, una segunda tarea sin
guia confirmada sin bloque de mas, y persistencia real tras cerrar y
reabrir la ventana. Cambio confirmado en el asar compilado, exe
arranca bajo Wine sin excepcion propia de la app. No probado:
seguridad activada y bloqueada, Windows real, resto de funciones no
tocadas por este parche. Entregado como parche app.asar comprimido en
zip.

La 0.1.79 anade dos campos por evaluacion, junto a TAP/Manager/
Entrevistador/Telefono: Formacion y "SBA valorado (cambio)" (salario
bruto anual). Texto libre, informativos, NO entran en la ponderacion
ni en la nota final. Reutilizan el mismo data-action="ev-field"
generico que ya manejaba TAP/Manager -- no hizo falta tocar el
listener de input, solo anadir la fila row-flex en la tarjeta y los
dos campos en la forma por defecto de evaluacion nueva. Sin cambios en
main.js/preload.js/db.js. Deliberadamente NO anadidos al CSV de
resultados (resumen pensado para compartir, el dato salarial no
encajaba ahi por defecto). Probado con la app real (Xvfb+CDP) desde la
UI real: orden de etiquetas confirmado, datos rellenados y
confirmados en state, mismo getComputedStyle que TAP, y persistencia
real tras cerrar y reabrir la ventana. Cambio confirmado en el asar
compilado, exe arranca bajo Wine sin excepcion propia de la app. No
probado: seguridad activada y bloqueada, Windows real, resto de
funciones no tocadas (guia por tarea de 0.1.78, hitos/riesgos,
Directorio de Talento). Entregado como parche app.asar comprimido en
zip.

La 0.1.80 responde a que el usuario pego guias reales largas en las
tareas (0.1.78) y en Evaluaciones se veia todo como un parrafo gris
sin jerarquia -- mas el pedido de Formacion minima/Anios requeridos
por puesto con aviso si el candidato no llega. Guia: sigue siendo
texto libre (no se toco lo ya pegado), pero en Evaluaciones ahora va
dentro de un <details><summary>Ver guia</summary> plegado por defecto
(nativo, sin JS de toggle), y el contenido pasa por la nueva
renderGuideRich() que reconoce lineas "- " como <ul><li>, lineas
cortas acabadas en ":" como mini-titular, y el resto como parrafos --
todo con escapeHtml antes de montar las etiquetas. Formacion minima y
Anios minimos nuevos a nivel de PUESTO (puesto.formacionMinima/
aniosMinimos), editables en Puestos con la nueva accion generica
data-action="puesto-field" (mismo patron que ev-field). Anios de
experiencia nuevo por evaluacion; Formacion+Anios de experiencia se
movieron a la primera fila de campos (antes de TAP/Manager/
Entrevistador/Telefono) porque el usuario dijo que siempre son la
primera pregunta de la entrevista. Si el puesto tiene minimos, la
etiqueta muestra "(minimo del puesto: ...)"; si los anios del
candidato quedan por debajo, aviso automatico "Por debajo del minimo".
Decision deliberada: el aviso automatico es SOLO para anios (numero,
sin ambiguedad) -- Formacion es texto libre con matices de equivalencia
reales, solo se muestra el minimo al lado sin que la app decida.
Anadido input[type=number] al selector CSS del fondo ambar de .field
(si no, el campo de anios se habria quedado en blanco -- mismo bug que
el telefono de 0.1.77). Probado con la app real (Xvfb+CDP) desde la UI
real: puesto con minimos reales, tarea con guia real de varias lineas,
evaluacion asignada -- confirmado el HTML generado por renderGuideRich
(parrafo/titular/lista separados de verdad, no solo que no diera
error), el aviso aparece/desaparece cruzando el umbral en ambos
sentidos, mismo getComputedStyle que TAP en el campo de anios, y
persistencia real tras cerrar y reabrir la ventana (puesto+minimos y
evaluacion+anios). Cambio confirmado en el asar compilado, exe arranca
bajo Wine sin excepcion propia de la app. No probado: seguridad
activada y bloqueada, Windows real, resto de funciones no tocadas.
Entregado como parche app.asar comprimido en zip.

La 0.1.81 arregla un bug reportado tras probar 0.1.80 en real: el aviso
"por debajo del minimo" de Anios de experiencia no se actualizaba al
teclear, solo si algo mas de casualidad forzaba un repintado completo
(cambiar de pestana, tocar el peso de una tarea). Causa confirmada
releyendo el archivo: el listener generico ev-field guardaba el valor
pero nunca volvia a comprobar el aviso (ese div se calcula solo dentro
de renderEvaluaciones()). Fix: nueva updateAniosWarning(inputEl, ev)
que actualiza SOLO ese div con DOM directo desde ev-field cuando el
campo es aniosExperiencia -- deliberadamente sin llamar a
renderEvaluaciones() a secas, que reconstruye toda la pestana mientras
el usuario sigue tecleando y le haria perder el foco a media cifra.
Ademas dos pedidos nuevos del mismo mensaje: boton "Desplegar todas las
guias" por tarjeta de evaluacion (data-action="toggle-guides", abre/
cierra de golpe todos los <details> de guia de esa tarjeta, sin
renderEvaluaciones(), solo aparece si el puesto tiene alguna tarea con
guia); y SBA de referencia a nivel de PUESTO (puesto.sbaReferencia,
mismo patron que formacionMinima/aniosMinimos), mostrado como
"(referencia del puesto: ...)" junto a "SBA valorado (cambio)" del
candidato en Evaluaciones, sin aviso automatico (texto libre, mismo
motivo que Formacion). Probado esta vez cargando el HTML real del
parche (mismo texto, sin copia) con Playwright y tecleo real caracter a
caracter (no fill() ni JS a mano) -- el aviso aparece/desaparece en
caliente sin tocar nada mas y el campo conserva el foco; boton
desplegar/plegar confirmado por el atributo open de cada <details>;
etiqueta SBA muestra la referencia; Formacion sigue sin aviso
automatico; sin errores de consola. Cambio confirmado en el asar
compilado, exe arranca bajo Wine sin excepcion propia de la app. No
probado esta vez: persistencia a disco/recarga de ventana de estos
campos concretos (no se toco el mecanismo de guardado), seguridad
activada y bloqueada, Windows real, resto de funciones no tocadas.
Entregado como parche app.asar comprimido en zip.

La 0.1.82 corrige un malentendido de la 0.1.81: el boton "Desplegar
todas las guias" no era lo pedido. El usuario mando 3 capturas
aclarando: las guias por tarea (el <details> "Ver guia" de cada fila)
estan bien, no tocarlas; lo que queria plegado por defecto es la FICHA
de evaluacion entera -- la tabla completa Tarea/Peso/Nota/Comentario --
para que la lista de candidatos evaluados no ocupe tanto, con un boton
que la despliegue mostrando el mismo aspecto de siempre. Cambios:
eliminado del todo el boton/accion toggle-guides de 0.1.81 (no se deja
desactivado). Nueva variable de interfaz let expandedEvalIds = new
Set() (fuera de state, no se persiste a disco -- memoria de la ventana
abierta). La tabla de tareas de cada evaluacion va envuelta en
<div class="eval-tasks-wrap" data-id="..." hidden> (atributo nativo
hidden, sin CSS a medida) precedida de un boton data-action=
"toggle-tasks" con texto "Ver tareas"/"Ocultar tareas" segun
expandedEvalIds.has(ev.id) -- el contenido de dentro (tabla, columnas,
guia por tarea) es exactamente el mismo HTML de siempre, sin tocar su
formato. Handler toggle-tasks alterna wrap.hidden con DOM directo (sin
renderEvaluaciones(), mismo motivo de siempre: no perder foco de otros
campos) y sincroniza expandedEvalIds. Importante: puntuar una nota o
cambiar el puesto asignado siguen forzando un renderEvaluaciones()
completo (ya existente, no tocado) -- sin guardar el estado en
expandedEvalIds la tabla se habria vuelto a plegar sola cada vez que el
usuario puntuaba una tarea, justo mientras la estaba usando; al leer
expandedEvalIds en cada render, el estado desplegado sobrevive a esos
refrescos forzados. Probado con el HTML real del parche cargado en
navegador de pruebas con interaccion real (clics y select_option
reales, no JS a mano): por defecto oculta con boton "Ver tareas"; al
pulsar se despliega con las 4 columnas y filas correctas, boton pasa a
"Ocultar tareas"; se puntuo una nota real (fuerza re-render completo) y
se confirmo que sigue desplegada despues -- el caso que se habria roto
sin el Set, comprobado explicitamente que no ocurre; al pulsar otra vez
vuelve a plegarse. Sin errores de consola. Confirmado en el asar
compilado que toggle-tasks existe y toggle-guides (el boton equivocado
de 0.1.81) ya no. Exe arranca bajo Wine sin excepcion propia de la app.
No probado: no aplica persistencia a disco (cambio puramente de
interfaz), seguridad activada y bloqueada, Windows real, resto de
funciones no tocadas (fix de anios/SBA de 0.1.81, hitos, riesgos,
Directorio de Talento, CV). Entregado como parche app.asar comprimido
en zip.

La 0.1.83 responde a dos pedidos del mismo mensaje: mismo plegado de
0.1.82 pero tambien en Puestos, y un bug real en el borrador de
feedback. Plegado en Puestos: mismo patron, nueva
let expandedPuestoIds = new Set() (fuera de state, no se persiste). La
tabla de tareas de cada puesto (si tiene alguna) va envuelta en
<div class="puesto-tasks-wrap" data-id="..." hidden> con boton
data-action="toggle-puesto-tasks" ("Ver tareas"/"Ocultar tareas").
Diferencia deliberada frente a Evaluaciones: aqui SI se auto-expande al
crear un puesto nuevo y al anadirle una tarea (en Puestos el usuario
esta construyendo activamente, no solo consultando), para ver al
momento lo que se acaba de crear. Comprobado que el estado plegado
sobrevive a un renderPuestos() global disparado por otro puesto
distinto. Fix del feedback: feedbackDraft() usaba rows.find(r => r.nota
=== maxN) -- con empate, .find() solo devuelve la PRIMERA coincidencia,
las demas se ignoraban en silencio (mismo problema simetrico para el
minimo). Fix: filter+sort por peso descendente -- con empate en nota,
elige como principal la de MAYOR PESO (la que mas cuenta en la
ponderacion final) y menciona tambien las demas empatadas en la nota en
vez de descartarlas ("Tambien obtuvo la nota maxima en X e Y"); solo
anade "aunque con menos peso en la ponderacion de este puesto" cuando
eso es cierto para TODAS las que menciona -- si alguna tiene el MISMO
peso que la principal, no se afirma eso. Aplicado igual al area de
mejora (empates en nota minima) por coherencia, aunque el usuario solo
menciono el caso de los puntos fuertes. Nueva joinListEs() para juntar
nombres al estilo espanol (y/e). Probado con el HTML real del parche en
navegador de pruebas con interaccion real: puesto sin tareas -> sin
boton; 1a tarea -> desplegada sola; plegar manual -> se oculta; crear
OTRO puesto con tarea (re-render global) -> el primero sigue plegado;
anadir 2a tarea al plegado -> se despliega; feedback con 4 tareas
(pesos 5/3/5/2, notas 5/5/5/2, dos empatadas en nota Y peso, una
tercera empatada en nota con menor peso) -> elige la de mayor peso como
principal, menciona las otras dos sin decir "menos peso" (porque una
tiene el mismo peso -- se confirmo que decirlo habria sido inexacto), y
el area de mejora sale correcta. Se repitio tambien la prueba de
plegado de Evaluaciones de 0.1.82 sin regresion. Sin errores de
consola. Cambio confirmado en el asar compilado, exe arranca bajo Wine
sin excepcion propia de la app. No probado: persistencia a disco del
plegado de Puestos (no aplica, es interfaz), guardado/recarga del texto
de feedback en esta entrega concreta (mecanismo ya probado, no tocado),
seguridad activada y bloqueada, Windows real, resto de funciones no
tocadas. Entregado como parche app.asar comprimido en zip.

La 0.1.84 corrige un bug de redaccion que el propio usuario destapo al
pegar un resultado real para analizar. El calculo (3.1/5) y la eleccion
por peso del fix de 0.1.83 estaban bien -- verificado recalculando a
mano sus 14 tareas reales, da 3.14. El bug: una tarea se llama "Gestion
de logs, rsyslog, ELK..." (con comas DENTRO del nombre). Al juntarla
con las demas tareas empatadas en nota usando tambien comas como
separador (joinListEs de 0.1.83), el texto salia "tambien obtuvo la
nota maxima en ha servidores, gestion de logs, rsyslog, elk... y
proactividad" -- se lee como 4 tareas sueltas en vez de 3, porque no
hay forma de distinguir la coma que separa la lista de las que forman
parte de un nombre. Fix: joinListEs() entrecomilla cada elemento antes
de juntarlos (la conjuncion y/e se sigue decidiendo sobre el nombre sin
comillas); tambien se entrecomilla, por consistencia, el nombre de la
tarea "principal" (punto mas fuerte/area de mejora elegido por peso).
Probado con el HTML real del parche, reproduciendo exactamente las 14
tareas/pesos/notas reales del usuario via state/feedbackDraft()
directamente (logica pura de texto, no hace falta clicar modales): nota
ponderada da 3.14 -> "3.1/5" igual que vio el usuario; "Gestion de
logs, rsyslog, ELK..." aparece entrecomillada como una sola unidad;
"Adm. Jboss y Tomcat" sigue de principal (peso 5, el mayor entre los 4
empatados a nota 5) y las otras tres se siguen mencionando,
entrecomilladas; "Adm. Nagios" sigue de area de mejora principal y
"Moodle bajo LAMP" se sigue mencionando. Se repitieron las pruebas de
plegado de Puestos/Evaluaciones de 0.1.82/0.1.83 sin regresion. Sin
errores de consola. Cambio confirmado en el asar compilado, exe arranca
bajo Wine sin excepcion propia de la app. No probado: un nombre de
tarea con comillas dobles literales dentro (caso muy raro) no se ha
reforzado explicitamente; guardado/recarga a disco del texto de
feedback en esta entrega concreta (mecanismo ya probado, no tocado);
seguridad activada y bloqueada, Windows real, resto de funciones no
tocadas. Entregado como parche app.asar comprimido en zip.

La 0.1.85 quita la coletilla "aunque con menos peso en la ponderacion
de este puesto" (0.1.83) que el usuario vio repetitiva y poco clara --
no decia CUANTO menos peso tenia cada tarea empatada, y se repetia
igual para todo el grupo. joinListEs() sustituida por
joinTareasConPeso(rows): recibe {name, weight} y formatea cada tarea
como "nombre" (peso N) -- el peso real de cada una, siempre, sin frase
generica. Se elimina el calculo menorPeso (el .every(...) que decidia
si anadir la coletilla) -- ya no hace falta, mostrar el peso real es
siempre exacto, incluso si una tarea empatada en nota tiene TAMBIEN el
mismo peso que la principal (antes ese caso se quedaba sin decir nada
especial). Probado con el HTML real del parche repitiendo el mismo
caso real de 0.1.84 (14 tareas de Daniel Romano Rodriguez) y el caso de
empate en peso ademas de en nota (de 0.1.83): texto ahora "tambien
obtuvo la nota maxima en "ha servidores" (peso 4), "gestion de logs,
rsyslog, elk..." (peso 4) y "proactividad" (peso 3)" -- coletilla vieja
ausente, nota ponderada sigue en 3.1/5. En el caso de empate en peso,
cada tarea muestra su peso real en vez de la vieja frase que ahi se
omitia sin mas. Se repitieron las pruebas de plegado de
Puestos/Evaluaciones de 0.1.82/0.1.83 sin regresion. Sin errores de
consola. Cambio confirmado en el asar compilado, exe arranca bajo Wine
sin excepcion propia de la app. No probado: guardado/recarga a disco
del texto de feedback en esta entrega concreta (mecanismo ya probado,
no tocado), seguridad activada y bloqueada, Windows real, resto de
funciones no tocadas. Entregado como parche app.asar comprimido en zip.

La 0.1.86 anade tres mejoras pedidas juntas (nombre de puesto editable,
buscador, boton Salir), tras aclarar con AskUserQuestion el alcance del
buscador y el destino de Salir. Nombre de puesto: cabecera de la
tarjeta paso de span a input con data-action="puesto-field"
data-field="name" -- reusa el listener generico ya existente, sin JS
nuevo. Buscador (#searchBox, cabecera, visible en las 3 pestanas): un
solo cuadro compartido, cada pestana filtra con su propio contenido de
forma independiente via matchesSearch() + applyPuestosFilter()
(nombre, formacion minima, SBA referencia, nombre/guia de cada tarea)
+ applyEvalFilter() (candidato, puesto, TAP, Manager, Entrevistador,
Formacion, SBA, anios experiencia) + applyResultadosFilter()
(candidato, puesto, TAP, Manager de la tabla -- el resumen de arriba
sigue mostrando totales reales sin filtrar). data-puesto-card/
data-eval-card/data-eval-row anadidos para localizar sin re-renderizar
(mismo patron de actualizacion dirigida del DOM desde 0.1.81). Aviso
"No se encontro nada..." cuando no hay coincidencias en la pestana.
Boton Salir (#btnSalir): window.close(), mismo mecanismo que la X
nativa. Probado con Playwright (interaccion real, clics y escritura,
sin JS inyectado a mano): edicion de nombre de puesto persiste en
state; busqueda "selinux" encuentra solo el puesto con esa palabra en
la guia de una tarea (aunque plegada); "sap" encuentra solo el otro
puesto; texto inexistente muestra el aviso; "daniel" en Evaluaciones
encuentra solo esa evaluacion, y el MISMO texto "daniel" en la pestana
Puestos no deja nada visible y muestra su propio aviso -- confirma
independencia real entre pestanas, no busqueda global. Salir no lanza
excepcion. Se repitieron las pruebas de plegado (0.1.82/0.1.83) y
feedback (0.1.83/0.1.84/0.1.85) sin regresion. Sin errores de consola.
Cambio confirmado en el asar compilado, exe arranca bajo Wine sin
excepcion propia de la app. No probado: cierre real de la ventana
dentro de Electron empaquetado (solo se probo en navegador de
pruebas); guardado/recarga a disco de nombre de puesto editado
cerrando y reabriendo la ventana en esta entrega concreta (mecanismo
ya probado, no tocado); busqueda no normaliza acentos (es texto plano
literal, tal como se pidio); seguridad activada y bloqueada, Windows
real, resto de funciones no tocadas. Entregado como parche app.asar
comprimido en zip.

La 0.1.87 corrige tres quejas sobre la 0.1.86: el buscador no
encontraba nada, la raya bajo el nombre editable se veia fea, y el
boton Salir pedia ser rojo. Se reprodujo el bug del buscador ANTES de
tocar codigo (puesto "Tecnico de Soporte N1", buscar "tecnico" sin
tilde -> 0 resultados confirmado): matchesSearch (0.1.86) comparaba
con toLowerCase() a secas sin quitar acentos, una tilde de diferencia
dejaba la busqueda sin resultados. Fix: normalizeSearchText(s) hace
normalize('NFD') + replace de las marcas diacriticas (rango unicode
U+0300-U+036F) + toLowerCase(), aplicada tanto en matchesSearch como
en el listener de #searchBox -- ahora "tecnico" encuentra "Tecnico"
con tilde y viceversa (sigue siendo texto plano, no sustituye letras
distintas -- una "n" normal no encuentra una "enie"). Nombre de puesto: se quita el
border-bottom dashed permanente, el input queda sin borde en reposo
igual que antes de 0.1.86, se anade un icono de lapiz (span
name-edit-icon) al lado, el fondo claro de resaltado solo aparece en
hover/focus. Boton Salir: pasa de gris translucido a rojo solido
(#DC2626, hover #B91C1C), mismo window.close() de siempre. Probado
con Playwright: bug reproducido y confirmado ANTES del fix; tras el
fix, "tecnico" y "tecnico" con tilde encuentran el mismo puesto;
"jose ramon" sin tildes encuentra "Jose Ramon Nunez"; boton Salir
con getComputedStyle().backgroundColor = rgb(220, 38, 38) confirmado;
input de nombre con borderBottomStyle = "none" confirmado, icono de
lapiz presente, edicion se sigue guardando en state. Se repitieron
todas las pruebas de 0.1.82 a 0.1.86 sin regresion. Sin errores de
consola. Cambio confirmado en el asar compilado (grep de
name-edit-icon, normalizeSearchText, DC2626, y confirmado que ya NO
aparece el border-bottom dashed viejo). Exe arranca bajo Wine con
procesos renderer/utility activos varios segundos, sin excepcion
propia de la app. No probado: cierre real de ventana dentro de
Electron empaquetado (solo navegador de pruebas); normalizacion de
acentos no sustituye letras distintas (una "n" normal no encuentra
una "enie"); guardado/
recarga a disco en esta entrega concreta (mecanismo ya probado, no
tocado); seguridad activada y bloqueada, Windows real, resto de
funciones no tocadas. Entregado como parche app.asar comprimido en
zip.

La 0.1.88 responde a la pregunta del usuario: "cuando busco se debe
marcar lo que ponga linux, no?". La logica ya ocultaba lo que no
coincidia (0.1.87), pero nada marcaba lo que SI coincidia -- con un
solo resultado visible parecia que no pasaba nada (confusion de UX,
no bug de logica). Ademas penalizaba el flujo de edicion del nombre
de puesto: paso de input siempre editable (0.1.86/0.1.87) a
display/edit explicito con Aceptar/Cancelar. Cambios: nueva funcion
highlightMatches(text) que compara sobre texto normalizado (mismo
normalize('NFD') + strip de acentos de matchesSearch) caracter a
caracter, guardando en un array `map` a que indice del texto ORIGINAL
corresponde cada caracter normalizado, para que el fragmento resaltado
conserve mayusculas/tildes reales; envuelve el match en <mark
class="search-hit">. Se aplica al nombre de puesto (ahora un span
en reposo, ver mas abajo) y a las celdas de Candidato/Puesto/TAP/
Manager en Resultados (ya eran texto plano). En Evaluaciones y en
los demas campos de un puesto (Formacion minima, Anios minimos, SBA,
tareas, guias) son inputs/textareas -- no se puede insertar un mark
dentro de un input, asi que ahi la marca es la tarjeta entera: clase
.search-match (contorno azul) en applyPuestosFilter/applyEvalFilter,
y en las filas de Resultados sobre el tr. Nombre de puesto: se
sustituye el input siempre editable por dos modos gestionados con el
nuevo estado de interfaz editingPuestoNameId (mismo patron que
expandedPuestoIds, no se guarda en disco) -- puestoNameWrapHtml(puesto)
devuelve un span.name-display (con highlightMatches) + boton lapiz en
reposo, o un input.name-edit-input con foco automatico + boton
Aceptar (verde) + boton Cancelar (translucido) en edicion.
refreshPuestoNameWrap(puesto) sustituye SOLO el bloque del nombre de
esa tarjeta (actualizacion dirigida del DOM, no renderPuestos()
completo). Aceptar (clic o Intro) guarda y llama saveState(true);
Cancelar (clic o Escape) descarta sin tocar state. Se quita del todo
el CSS/HTML del diseno anterior (.name-input, el lapiz decorativo sin
accion). test85.py y test87.py quedan obsoletos (referencian
input.name-input, ya no existe) -- sus escenarios se retoman en
test88.py/test88b_independencia.py con los selectores nuevos.
Probado con Playwright: nombre en reposo muestra span + lapiz, sin
input visible; pulsar el lapiz muestra input con foco automatico +
Aceptar/Cancelar; escribir y Cancelar NO cambia state.puestos[0].name
(confirmado leyendo el dato); escribir y Aceptar SI lo cambia; Intro
guarda igual que Aceptar, Escape descarta igual que Cancelar; buscar
"linux" con "Adm Linux Sr" y "Consultora SAP MM" resalta "Linux"
dentro del nombre del primero y marca su tarjeta con search-match, el
segundo queda oculto; buscar "linux" en Resultados con "Daniel Romano
Linux" resalta "Linux" en su celda; buscar "daniel" en Evaluaciones
marca la tarjeta con search-match (sin mark, son inputs); repetida la
independencia entre pestanas de 0.1.86 (mismo texto "daniel" en
Puestos no deja nada visible, aviso propio de sin resultados, sin
ningun mark suelto). Se repitieron plegado (0.1.82/0.1.83), feedback
(0.1.83/0.1.84/0.1.85) y color rojo de Salir (0.1.87) sin regresion.
Sin errores de consola. Cambio confirmado en el asar compilado (grep
de name-display, name-edit-icon-btn, btn-name-ok, btn-name-cancel,
highlightMatches, search-hit, search-match; confirmado que ya NO
aparece class="name-input" del diseno anterior). Exe arranca bajo
Wine con renderer/gpu/utility activos, sin excepcion propia de la
app. No probado: resaltado con multiples coincidencias del mismo
termino en el mismo campo, ni con nombres muy largos que se corten
visualmente; guardado/recarga a disco en esta entrega concreta
(mecanismo ya probado, no tocado); seguridad activada y bloqueada,
Windows real, resto de funciones no tocadas. Entregado como parche
app.asar comprimido en zip.

La 0.1.89 corrige lo que el usuario reporto como "no busca bien" tras
mandar capturas de Puestos ("linux", "superior") y Evaluaciones
("Daniel"): la logica de busqueda de 0.1.88 YA era correcta en los
tres casos (resaltado amarillo para "linux", tarjeta marcada por
"superior" al coincidir solo en un input, tarjeta de "Daniel"
marcada) -- el problema real confirmado con las capturas es que el
texto del buscador se quedaba puesto al cambiar de pestana
(0.1.86-0.1.88 nunca lo vaciaban), y como cada pestana busca en
campos distintos, ese texto heredado a menudo no encontraba nada en
la pestana nueva y parecia que el buscador estaba roto. Pidio
explicitamente: vaciar la busqueda al cambiar de pestana, y anadir un
boton "x" para borrarla. Cambios: el listener de clic de nav.tabs
button ahora llama a la nueva funcion clearSearch() en cada cambio de
pestana. Nuevo boton btnClearSearch (oculto por defecto) dentro de un
div.search-wrap que envuelve el searchBox. Nueva funcion
applyAllSearchFilters() centraliza las 3 llamadas a los filtros que
antes se repetian solo en el listener de input, y ademas muestra/
oculta btnClearSearch segun si searchQuery tiene contenido.
clearSearch() vacia el valor del input y searchQuery, llama
applyAllSearchFilters() -- la usan tanto el clic en "x" como el
cambio de pestana. Bug propio detectado y corregido ANTES de
entregar: la primera version de .search-clear-btn fijaba "display:
flex" directamente en la clase, que por ser CSS de autor con la MISMA
especificidad que la regla [hidden]{display:none} del navegador (y el
CSS de autor siempre gana a la hoja de estilos por defecto aunque
empate en especificidad) dejaba el boton "x" visible SIEMPRE,
ignorando el atributo hidden -- lo detecto la propia prueba
automatica (test89.py, primer intento) antes de tocar nada mas.
Arreglado anadiendo .search-clear-btn[hidden] { display: none; } con
mayor especificidad (clase + atributo). test88.py y
test88b_independencia.py quedan obsoletos -- daban por hecho que el
MISMO texto de busqueda se mantenia al cambiar de pestana, que es
justo el comportamiento que este parche cambia a proposito; sus
escenarios se retoman sin cruces de pestana en
test89b_sin_cambiar_pestana.py. Probado con Playwright: boton "x"
oculto al principio (confirmado tras corregir el bug propio), visible
tras escribir, tarjeta marcada; pulsar "x" vacia el input (confirmado
leyendo input_value(), no solo la pantalla), oculta el boton, quita
la marca, devuelve el foco; buscar "daniel" en Puestos (sin match)
muestra el aviso, al cambiar a Evaluaciones el buscador queda vacio
solo (confirmado leyendo input_value() = ""), el boton "x" se oculta,
la evaluacion de Daniel se ve sin filtro, y al volver a Puestos el
aviso ya no esta; repetido sin cambiar de pestana que el resaltado, la
marca de tarjeta y la edicion del nombre de 0.1.88 siguen
funcionando. Se repitieron plegado (0.1.82/0.1.83) y feedback
(0.1.83/0.1.84/0.1.85) sin regresion. Sin errores de consola. Cambio
confirmado en el asar compilado (grep de btnClearSearch,
clearSearch, applyAllSearchFilters, y del selector
.search-clear-btn[hidden]). Exe arranca bajo Wine con renderer/gpu/
utility activos, sin excepcion propia de la app. No probado:
guardado/recarga a disco en esta entrega concreta (mecanismo ya
probado, no tocado); seguridad activada y bloqueada, Windows real,
resto de funciones no tocadas. Si el usuario encuentra un caso
concreto de texto que deberia encontrar algo y no lo encuentra (mas
alla del arrastre entre pestanas ya corregido), queda pendiente de
reproducir con el texto y la pestana exactos, igual que se hizo con
"tecnico"/"Tecnico" en 0.1.87. Entregado como parche app.asar
comprimido en zip.

La 0.1.90 corrige una decision de diseno de la 0.1.88 que al usuario
no le gusto: "no quiero contorno en azul quiero que me busque texto
[...] no que me marque el bloque en azul quiero el texto". El
contorno .search-match (tarjeta/fila entera marcada cuando el termino
solo coincidia dentro de un input) se quita COMPLETO -- clase CSS,
regla de la tabla de Resultados, y las 3 llamadas
classList.toggle('search-match', ...) en applyPuestosFilter,
applyEvalFilter y applyResultadosFilter. No se toca el resaltado de
texto real (highlightMatches/mark.search-hit) que sigue funcionando
igual en el nombre de puesto y en las celdas de Resultados -- eso es
justo "el texto" que el usuario pide. Tampoco se toca el ocultado de
lo que no coincide, ni el vaciado de busqueda al cambiar de pestana,
ni el boton "x" (0.1.89). Probado con Playwright: buscando "linux"
con "Adm Linux Sr", outlineStyle de la tarjeta = "none", sin la clase
search-match, "Linux" resaltado en mark dentro del nombre; buscando
"superior" (coincide solo en un input) la tarjeta se queda visible
sin ningun contorno ni marca extra; en Resultados con "Daniel Romano
Linux" la fila no tiene contorno y su celda sigue resaltando "Linux";
en Evaluaciones confirmado que ninguna tarjeta lleva contorno.
Repetidas las pruebas de plegado (0.1.82/0.1.83), feedback (0.1.83/
0.1.84/0.1.85), edicion del nombre (0.1.88) y vaciado de busqueda +
boton "x" (0.1.89) sin regresion. Sin errores de consola. Cambio
confirmado en el asar compilado -- grep confirma que search-match ya
NO aparece en ningun sitio funcional (solo en comentarios del
historial), y que highlightMatches/mark.search-hit siguen presentes.
Exe arranca bajo Wine con renderer/gpu/utility activos, sin excepcion
propia de la app. test88.py y test89.py/test89b se ejecutaron tal
cual sobre esta version y siguen pasando -- sus impresiones de
search-match ahora dan False donde antes daban True, resultado
correcto tras quitar la funcionalidad, no una regresion. Se anadio
test90.py centrado en confirmar la ausencia real de contorno
(getComputedStyle().outlineStyle) en los escenarios de arriba. No
probado: guardado/recarga a disco en esta entrega concreta (mecanismo
ya probado, no tocado); seguridad activada y bloqueada, Windows real,
resto de funciones no tocadas. Entregado como parche app.asar
comprimido en zip.

La 0.1.91 responde a la escalada del usuario tras la 0.1.90: "no ves
que no busca! puedes probarlo bien antes de darmelo!!! quiero que
busque TODOSSS LOS TEXTOS". Quitar el contorno azul en 0.1.90 dejo un
hueco: si la unica coincidencia estaba dentro de un input (ej.
"Superior" solo en Formacion minima), la tarjeta se quedaba visible sin
ninguna marca -- indistinguible de "no encuentra nada". Sigue vigente
la limitacion real (no se puede insertar mark letra a letra dentro del
value de un input/textarea), pero ahora se resalta el CAMPO CONCRETO
con una clase nueva field-search-hit (mismo amarillo que
mark.search-hit, con !important a proposito en vez de perseguir
especificidad exacta contra las reglas de fondo ambar existentes --
leccion del bug de especificidad de .search-clear-btn[hidden] en
0.1.89). Nuevas funciones fieldMatches()/markFieldMatch() (marcan un
campo sin tocar su value ni el foco) y autoExpandTasksIfMatch()
(despliega sola una seccion de tareas plegada si la coincidencia esta
dentro). applyPuestosFilter ahora tambien marca Formacion minima, Anos
minimos, SBA, y nombre/guia de cada tarea; Anos minimos se anade a la
busqueda (antes no formaba parte). applyEvalFilter marca Candidato,
Formacion, Anos de experiencia, TAP, Manager, Entrevistador, Telefono,
SBA y el comentario de cada tarea; el nombre del candidato en la
CABECERA (span de texto plano, no input) pasa a resaltarse con
highlightMatches() letra a letra igual que ya hacia en Resultados, y lo
mismo el nombre de tarea en la tabla propia de la evaluacion
(envuelto en un span task-name-display para no romper el details de la
guia). Telefono y comentario de tarea se anaden a matchesSearch() --
ninguno de los dos formaba parte de la busqueda antes. No se toca el
contorno de tarjeta/fila entera: sigue sin existir, confirmado que
search-match no reaparece. Al revisar test90.py se confirmo que nunca
rellenaba ningun campo con "Superior" antes de buscarlo -- probaba la
ausencia de contorno con tarjetas vacias, sin datos reales que
coincidieran, y "pasaba" solo porque no tenia ninguna asercion que
fallara. Es exactamente el fallo que senalo el usuario: parecia
probado y no lo estaba. test91.py corrige el habito, no solo el bug:
reproduce el caso exacto reportado (FP Superior en Formacion minima,
buscar "Superior") con aserciones reales que hacen sys.exit(1) si algo
falla, verificando incluso el color de fondo real via
getComputedStyle().backgroundColor. Probado: el campo se marca (y el
que no coincide no se marca), la seccion de tareas plegada se despliega
sola, el contorno sigue sin existir, Evaluaciones marca TAP/comentario/
telefono y expande su propia tabla de tareas, el nombre de candidato en
cabecera resalta mark. Repetida la suite completa (test82-84, test89,
test89b, test90) sin regresion, sin errores de consola. Cambio
confirmado en el asar compilado. Exe arranca bajo Wine sin excepcion
propia de la app. No probado: guardado/recarga a disco en esta entrega
concreta, seguridad activada y bloqueada, Windows real, resto de
funciones no tocadas. Entregado como parche app.asar comprimido en
zip.

La 0.1.92 cambia de tema: no es Evaluacion de Candidatos, es el informe
ejecutivo en PowerPoint que exporta dashboard/plantilla_dashboard.html
(exportExecutivePPTX). El usuario adjunto un .pptx real de 7 diapositivas
señalando que cuando el informe ocupa varias diapositivas no aplica el
mismo tema. Diagnostico extrayendo el .pptx con unzip y convirtiendolo a
PNG por diapositiva (soffice + pdftoppm, no solo leyendo codigo): la
diapositiva 4, continuacion de la tabla "Hitos del servicio" (17 filas,
no caben en una sola pagina), sale con fondo BLANCO sin cabecera ni pie
de pagina, mientras el resto del informe esta en oscuro. Causa raiz: las
4 tablas largas (Hitos, Riesgos, Equipo, Entregables) usan addTable con
autoPage:true -- cuando la tabla no cabe, pptxgenjs crea ELLA SOLA una
diapositiva extra para las filas que sobran, por dentro, sin pasar por
la funcion bgSlide() que pone el fondo oscuro a mano en cada diapositiva
normal -- asi que la extra nunca recibia ese fondo. Confirmado leyendo
el propio vendor/pptxgen.bundle.js (no adivinando): la funcion interna
de autopaginado crea la diapositiva nueva con
r.addSlide({masterName: i.masterSlideName || null}) -- solo hereda un
slide master si la diapositiva de origen de la tabla tiene uno asociado.
Como bgSlide() llamaba a pptx.addSlide() a secas, la extra salia sin
master y sin fondo. Primer intento descartado: pasar background como
opcion de addTable() no funciona (comprobado con una reproduccion
aislada, la diapositiva extra seguia en blanco). Lo que si funciona:
pptx.defineSlideMaster({title:'PANORAMA_DARK', background:{color:
COL.bg}}) una vez por informe, y bgSlide() crea cada diapositiva
asociada a ese master (pptx.addSlide({masterName:'PANORAMA_DARK'}) en
vez de a secas, manteniendo tambien el s.background= manual de siempre)
-- asi la diapositiva extra que genera autoPage hereda el mismo master.
Cambio de una sola pieza reutilizada por las 6 diapositivas de
bgSlide(), no hace falta tocar cada addTable() por separado. Probado:
se aislo el patron exacto de la app (mismo pptxgen.bundle.js, mismas
opciones) en un HTML de prueba con Playwright con una tabla de 30 filas
para forzar el desbordamiento -- sin el arreglo la segunda diapositiva
sale blanca (reproduce el bug), con el arreglo sale con el fondo oscuro
correcto (comprobado exportando ambas a PDF y comparando las imagenes
PNG resultantes). La primera diapositiva (la que no se parte) da el
mismo PNG exacto antes y despues del arreglo, confirmando que no afecta
a las diapositivas que no necesitan autopaginado. Cargado el archivo
real ya parcheado en un navegador de pruebas: exportExecutivePPTX sigue
existiendo como funcion, sin errores de sintaxis ni de ejecucion al
cargar la pagina. Cambio confirmado en el asar compilado (grep de
defineSlideMaster y PANORAMA_DARK). Exe arranca bajo Wine sin excepcion
propia de la app. No probado: generar el informe completo dentro de la
app de escritorio con un proyecto real de 17+ hitos (la reproduccion
aislada usa una tabla de prueba fuera de la app para acotar la pieza
exacta que fallaba); tampoco una tabla partida en 3+ diapositivas
(aunque el arreglo no depende de cuantas extra se generen). Entregado
como parche app.asar comprimido en zip.

La 0.1.93 arregla un bug de directorio/plantilla_directorio.html
reportado con captura: una persona con un contrato que termina (6M) y
otro que arranca justo despues en el mismo cliente (2026, dentro de 15
dias) aparecia como activo en LOS DOS a la vez, y se contaba como
multi-proyecto sin serlo de verdad. Causa raiz: el estado de cada
asignacion que muestra el Directorio es el que sincroniza tal cual del
proyecto de origen, y ese estado en el dashboard solo se actualiza via
checkScheduledExits() cuando alguien abre ese proyecto concreto y la
fecha ya ha llegado -- ademas esa funcion solo maneja la salida
(activo->rotado), no existe ninguna transicion automatica de entrada
(pendiente->activo) en todo el codigo, solo un boton manual. Cambio:
el Directorio ya no confia en el campo estado sincronizado, lo calcula
el solo en cada render a partir de las fechas ya sincronizadas
(fechaIncorporacion, fechaSalida, fechaSalidaPrevista) con dos
funciones nuevas, estadoEfectivoAsignacion(a, hoy) y
personOverallEstado(p) -- pendiente si la incorporacion no ha llegado,
baja si ya paso una fecha de salida (real o prevista), activo en
cualquier otro caso. Todo el cambio vive dentro del Directorio, no se
toco el dashboard ni su toggle manual. De paso arreglado: el contador
multi-proyecto ahora solo cuenta asignaciones ACTIVAS de verdad a la
vez (antes contaba el total historico); los chips de proyecto muestran
pendiente ademas de baja; la ficha de detalle muestra el estado
calculado con el mismo indicador de color del resto de la app y la
fecha de salida prevista cuando aplica; la exportacion de personas usa
el mismo calculo. Probado con Playwright inyectando el caso exacto del
usuario en el archivo real ya parcheado: estadoEfectivoAsignacion da
activo para el 6M y pendiente para el 2026, el contador de
multi-proyecto pasa de 1 a 0 para esta persona, la ficha de detalle y
los chips muestran los estados correctos con la salida prevista,
simulando el reloj un dia despues de la fecha de corte el 6M pasa a
baja y el 2026 a activo automaticamente sin tocar nada (el
comportamiento a la inversa que pidio el usuario). Regresion aparte
confirma que un caso real de multi-proyecto (dos asignaciones activas
a la vez de verdad) se sigue detectando, y que una baja real ya
registrada se sigue mostrando bien. Sin errores de consola. Cambio
confirmado en el asar compilado (grep de estadoEfectivoAsignacion y
personOverallEstado). Exe arranca bajo Wine sin excepcion propia de la
app. No probado: sincronizacion real desde los backups de los
proyectos IMUS dentro de la app de escritorio (la prueba inyecta el
caso directamente en el archivo, sin pasar por el sync real); un caso
con 3+ asignaciones solapadas/consecutivas. No se toco el
comportamiento del dashboard de origen. Entregado como parche app.asar
comprimido en zip.

La 0.1.94 corrige que la 0.1.93 no arreglaba nada de verdad: el usuario
reporto con capturas que seguia igual, activo en las dos asignaciones,
incluso despues de poner el a mano el estado del proyecto 2026 en
pendiente en el dashboard de origen. Causa real confirmada con las
capturas: estadoEfectivoAsignacion de la 0.1.93 calculaba por
fechaIncorporacion (columna Fecha de la pestaña Equipo), que en la
practica no representa el inicio real de un contrato -- en el caso
real valia 16 MAR 2026 en las DOS asignaciones, fecha heredada sin
relacion con el arranque de cada proyecto -- y encima ignoraba el
estado pendiente sincronizado (solo miraba baja). Revisado
dashboard/plantilla_dashboard.html: el alta normal de un perfil crea
siempre con status activo por defecto, solo el flujo de rotacion con
reemplazo EN EL MISMO proyecto pone pendiente si la fecha es futura --
pero el usuario tiene 6M y 2026 como dos proyectos SEPARADOS, ese
mecanismo nunca se activo. Cambio: ahora se sincroniza y se usa la
fecha de Inicio servicio/Fin estimado del PROYECTO entero
(serviceStart/serviceEnd, el mismo dato que ya usa el dashboard para
su % de progreso), no la fecha por persona. main.js anade
proyectoInicio/proyectoFin a cada perfil sincronizado;
upsertAsignacion los guarda igual que las demas fechas;
estadoEfectivoAsignacion se reescribe: baja manda siempre (estado
explicito, fechaSalida/fechaSalidaPrevista de la persona, o
proyectoFin, cualquiera cumplido); si no es baja y hay proyectoInicio
sincronizado, esa fecha manda en los dos sentidos -- pendiente si no ha
llegado, activo en cuanto llega, AUNQUE el boton pendiente se haya
quedado pulsado a mano sin tocar -- solo sin fecha de proyecto
sincronizada cae al respaldo de fiarse del estado tal cual. Anadida una
nota Proyecto arranca/Proyecto finalizado en la ficha cuando el estado
viene de la fecha del proyecto. Importante para el usuario: hace falta
volver a sincronizar tras aplicar el parche porque el dato es nuevo.
Probado con Playwright inyectando el caso real en dos variantes (con y
sin el toggle manual pendiente puesto): las dos dan 6M activo, 2026
pendiente, confirmando que ya no hace falta tocar nada a mano.
Contador de multi-proyecto correcto en ambas. Simulado el reloj pasando
la fecha de corte: 6M pasa a baja por fin de proyecto y 2026 pasa a
activo automaticamente en las dos variantes, incluida la que tenia el
toggle pendiente pulsado a mano -- confirma el "a la inversa sin tocar
nada" que pidio el usuario. Repetida la regresion de la 0.1.93 (multi-
proyecto real, baja real): sigue pasando. Sin errores de consola. Cambio
confirmado en el asar compilado (grep de proyectoInicio en main.js y en
el directorio). Exe arranca bajo Wine sin excepcion propia de la app. No
probado: la sincronizacion real completa dentro de la app de escritorio
con los backups reales del usuario (la prueba inyecta el resultado ya
calculado, no pasa por el IPC real) -- depende de que el usuario
sincronice tras aplicar el parche; tampoco un proyecto sin
serviceStart/serviceEnd configurado con datos reales. No se toco el
dashboard de origen. Entregado como parche app.asar comprimido en zip.

La 0.1.95 hace que la Fecha estimada de un hito RECURRENTE (reunion
periodica, informe mensual) sirva de recordatorio de verdad, pedido
textual del usuario tras enseñar una captura del formulario de un hito
recurrente: "igual que los demas avisos de hitos". Antes,
milestoneStatus() para un recurrente devolvia siempre el mismo
resultado neutro (semaforo cian, texto fijo Recurrente) sin mirar la
fecha -- no avisaba de nada. Ojo respetado: el recuadro Proximo hito del
Estado Ejecutivo excluye recurrentes desde la 0.1.34 por un bug real
reportado entonces, y esa exclusion se mantiene intacta, no se toco.
Cambio: milestoneStatus() para un recurrente ahora usa el mismo calculo
de dias que un hito normal sobre su fecha -- rojo si ya paso sin
actualizar, ambar si es hoy, gris si queda -- devolviendo tambien
recurrente:true y texto propio. Nunca done. Como todo en la app lee de
esta misma funcion, el cambio se propaga solo a tres sitios sin
tocarlos por separado: la fila del hito en la lista, el punto en la via
de despliegue del servicio (antes siempre cian, confirmado con el SVG
real que ahora sale en rojo), y los contadores msRojo/msAmbar que
alimentan el Estado Ejecutivo (antes los recurrentes no contaban para
nada). Se mantiene la bandera/emoji para distinguir que es recurrente.
Corregido de paso un efecto colateral: la frase del Estado Ejecutivo
para avisos ambar decia siempre completado con retraso, falso para uno
previsto para hoy (normal o recurrente) -- separada en dos frases
correctas. Probado con Playwright: 3 recurrentes (vencido/hoy/futuro)
mas un hito normal retrasado calculan y renderizan el color/texto
esperado, confirmado en el HTML real y en el SVG de la via de
despliegue; Estado Ejecutivo sube a rojo con la frase correcta y no
dice completado para el previsto-hoy; el recuadro Proximo hito
confirmado que sigue sin devolver ningun recurrente. Sin errores de
consola. Cambio confirmado en el asar compilado. Exe arranca bajo Wine
limpio. No probado: hitos recurrentes reales del usuario dentro de la
app; el informe PowerPoint tambien lee de milestoneStatus() asi que
heredara el mismo cambio de color (antes los recurrentes quedaban fuera
del grafico de barras del todo) -- consecuencia esperada y razonada,
pero no se genero un PPTX real de prueba con recurrentes esta vez.
Entregado como parche app.asar comprimido en zip.

Entre la 0.1.95 y la 0.1.96 se evaluo y se descarto: el usuario
pregunto si el color de las tarjetas del launcher (computeProjectSemaforo
en main.js, calculo independiente de milestoneStatus()) deberia cambiar
tambien con hitos recurrentes. Se llego a implementar y se estaba
verificando en vivo por Xvfb+CDP cuando el usuario interrumpio pidiendo
lo contrario: que el aviso se quede solo dentro del dashboard del
proyecto, en rojo, sin salir en la tarjeta del launcher. Se revirtio el
cambio en main.js antes de compilar o entregar nada -- nunca llego a un
asar publicado. Decision anotada en el propio codigo para no repetir la
pregunta en el futuro.

La 0.1.96 corrige que la tabla de Entregables del informe ejecutivo
(PowerPoint) no salia ordenada por fecha, reportado con capturas reales
del propio informe generado. Causa: exportExecutivePPTX() construia la
lista de filas recorriendo los HITOS ordenados por su fecha estimada, y
por cada hito iba anadiendo sus entregables -- el orden final dependia
del orden de los hitos, no de la fecha real de cada entregable, asi que
entregables de hitos distintos con fechas intercaladas salian
mezclados. Cambio: una vez construida la lista completa de filas, se
anade un reordenado final por la misma fecha ISO que se muestra en la
columna Fecha de cada una. Probado con Playwright interceptando
slide.addTable() (hubo que envolver PptxGenJS.prototype.addSlide, ya
que addTable no vive en el prototipo de PptxGenJS sino como propiedad
de instancia de cada slide -- un parche directo sobre
PptxGenJS.prototype.addTable no intercepta nada) para leer las filas
exactas antes de escribir el pptx: con 3 hitos de fechas desordenadas
entre si (uno recurrente con dos entregables de periodos distintos),
las 4 filas salen en orden cronologico ascendente exacto. Prueba de
regresion explicita: quitando temporalmente el reordenado, la tabla
vuelve a salir desordenada reproduciendo el bug reportado -- confirma
que el fix es real, no casualidad. Sin errores de consola nuevos.
Cambio confirmado en el asar compilado. Exe arranca bajo Wine limpio.
No probado: un pptx real de un proyecto del usuario abierto en
PowerPoint/Teams. Entregado como parche app.asar comprimido en zip.

La 0.1.97 anade un boton Posponer sobre el aviso de un hito recurrente
(rojo o ambar), pedido tras la 0.1.95 con dos escenarios reales del
usuario: documentos que no se actualizan a diario, donde el aviso N
dias sin actualizar es util pero no quiere que parezca que algo va mal
si ya lo ha visto; y reuniones de seguimiento, que casi nunca llegan a
rojo porque la fecha de la siguiente se estima con antelacion. Se
evaluo primero un modelo distinto (antelacion configurable por hito)
con AskUserQuestion, el usuario respondio otra cosa a las tres
preguntas y aclaro con una captura que queria posponer/silenciar
temporalmente un aviso ya disparado, no una antelacion fija -- se
descarto el primer modelo sin implementar nada de el. Cambio: campo
nuevo avisoPospuestoHasta (fecha ISO, opcional) por hito, que no toca
la Fecha estimada real. milestoneStatus() para un recurrente, si esta
pospuesto y hoy es anterior o igual a esa fecha, devuelve
semaforo:verde, pospuesto:true, con un texto que conserva el dato real
(N dias sin actualizar) y anade proximo aviso en N dias -- si la
posposicion ya vencio, no hace falta limpiar el campo, deja de aplicar
sola. En la fila del hito aparece un boton Posponer que abre, en el
mismo sitio (mismo patron que confirmar borrado/confirmar completado,
no un popover flotante), tres presets 7/14/30 dias mas un campo a mano,
y mientras esta pospuesto el boton cambia a Quitar posp. Nueva funcion
addDaysISO() para sumar dias a una fecha ISO sin pasar por
toISOString() sobre el resultado (que convierte a UTC y puede devolver
el dia equivocado cerca de medianoche). Como todo lee de
milestoneStatus(), el efecto se propaga solo a la via de despliegue y a
los contadores msRojo/msAmbar del Estado Ejecutivo, y el informe
PowerPoint lo hereda automaticamente -- con un matiz avisado al
usuario sin arreglar: en el grafico Hitos por estado del PPTX, un
recurrente pospuesto cae en la misma barra A tiempo que uno completado,
simplificacion que ya existia antes, no nueva de este cambio. Probado
con Playwright: hito recurrente vencido de 92 dias (mismo escenario de
la captura del usuario) -- estado inicial rojo correcto, clic en
Posponer abre la ventanita, clic en 7 dias pasa a verde con el texto
correcto y el boton cambia a Quitar posp., Estado Ejecutivo pasa de 1
hito rojo a 0 mientras esta pospuesto, Quitar posp. vuelve a rojo,
campo personalizado (45 dias) aplica y se verifico contra el dato
guardado que la fecha es exactamente hoy mas 45 dias, forzando que la
posposicion ya haya vencido vuelve sola al calculo normal. Sin errores
de consola nuevos. Cambio confirmado en el asar compilado. Exe arranca
bajo Wine limpio. No probado: un hito recurrente real del usuario
dentro de la app; un pptx real generado con un hito pospuesto para ver
el matiz de la barra A tiempo. Entregado como parche app.asar
comprimido en zip.

La 0.1.98 ajusta el aspecto del boton Posponer de la 0.1.97 -- el
usuario mando capturas mostrando que el emoji del reloj salia mas
grande que los iconos de al lado (lapiz, papelera), y pidio quitar el
texto Posponer. Causa: es un emoji a color, no un glifo de texto, y al
mismo font-size de 13px que comparten todos los iconos de la fila
renderiza visiblemente mas grande. Cambio: el boton (y Quitar posp.)
pasan a mostrar solo el icono, sin texto (el texto sigue en el title
como tooltip), con una clase nueva a 10.5px solo para estos dos
botones. Sin cambios de comportamiento. Probado con Playwright: solo
icono, tooltip completo, font-size 10.5px frente a 13px del lapiz de
referencia, captura de la fila para verificacion visual. Sin errores de
consola nuevos. Cambio confirmado en el asar compilado. Exe arranca
bajo Wine limpio. No probado: en la app real a la resolucion real de
pantalla del usuario. Entregado como parche app.asar comprimido en zip.

La 0.1.99 anade una ventana temporal (Todo / Ultimos 3 meses / Proximos
3 meses / Personalizado) a la Via de despliegue -- el usuario mando una
captura con hitos cercanos entre si saliendo amontonados alrededor de
hoy, y pregunto (evaluativo, no orden directa) si se podria aplicar mas
zoom y una barra para ver vistas anteriores. Causa: renderRail()
reparte siempre el rango completo del servicio en el mismo ancho fijo,
asi que con un servicio largo varios hitos en la misma semana quedan
comprimidos en pocos pixeles. Se propuso, con opciones y trade-offs
antes de tocar codigo (regla del proyecto para peticiones evaluativas):
zoom continuo + scroll (mas fiel a zoom literal, mas riesgo) vs
reutilizar el concepto de periodo que ya existe en el informe ejecutivo
como ventana de fechas visible (menos riesgo, reutiliza patrones ya
probados) -- el usuario eligio la segunda via AskUserQuestion. Cambio:
estado nuevo ui.railWindow (null=todo el servicio, si no
start/end/mode) y ui.railCustomOpen; barra nueva sobre la via con los
presets y flechas anterior/siguiente que desplazan la ventana su propio
ancho en dias; renderRail() gana un 4o parametro isWindowed -- con
ventana activa, los hitos fuera se excluyen (antes pctOf() los
clampeaba al borde y salian amontonados ahi), HOY solo se dibuja si cae
dentro (comparado por dia/medianoche, no por instante exacto, porque el
limite de una ventana es medianoche y today trae la hora real), FIN
ESTIMADO se recalcula contra el fin real del servicio y solo se dibuja
si cae en la ventana visible (antes se forzaba siempre al borde
derecho). En modo Todo (isWindowed:false) el comportamiento es
identico al de siempre, nada de esto se aplica. Efecto colateral
corregido de paso: el filtro de limites de fase tenia una comparacion
que nunca se activaba en la practica (pctOf ya clampea, era codigo
muerto), inofensivo mientras el rango siempre era el servicio completo
pero con ventanas si importa. Probado con Playwright: servicio de un
año con 8 hitos reproduciendo el escenario apretado de la captura --
Todo muestra los 8 + FIN ESTIMADO + HOY igual que antes, Ultimos 3
meses excluye los lejanos y mantiene HOY, Proximos 3 meses incluye el
hito de fin y FIN ESTIMADO, flecha adelante saca HOY de la vista y
atras lo devuelve, Personalizado filtra correctamente, volver a Todo
tras navegar reproduce la vista original completa. Capturas de cada
paso confirmando visualmente que los hitos que salian pegados ahora
quedan repartidos. Sin errores de consola nuevos. Cambio confirmado en
el asar compilado. Exe arranca bajo Wine limpio. No probado: dentro de
la app real con datos reales del usuario; el informe PowerPoint no se
toca, sigue con su propio selector de periodo. Entregado como parche
app.asar comprimido en zip.

La 2.0.0 hace que la ventana temporal de la Via de despliegue (0.1.99)
sobreviva a guardar y reabrir -- el usuario pidio "si doy a guardar
ultimos 3 meses todo o anteriores que guarde esa vista", y ademas pidio
explicitamente numerar esta entrega 2.0 y no 0.1.100. Causa: railWindow
vivia en ui, el objeto de estado de sesion que se reinicializa desde su
literal en cada apertura del dashboard -- solo state se serializa via
saveState()/JSON.stringify(state), asi que la ventana elegida se perdia
siempre al recargar por diseño del propio mecanismo, no por un bug
puntual. Cambio: railWindow se mueve de ui a state (mismo formato,
null=todo el servicio) en render(), shiftRailWindow() y
renderRailWindowControls(); ui.railCustomOpen se queda en ui a
proposito (formulario Desde/Hasta, comodidad de sesion, no debe
reaparecer abierto solo). Los tres sitios que cambian state.railWindow
(preset, flecha, aplicar personalizado) llaman explicitamente a
saveState() antes de render(), igual que el resto de la app tras
cualquier mutacion -- necesario porque el boton manual Guardar llama a
maybeBackup(), que lee lo ya escrito en el almacenamiento
(collectLocalStorageDump()) y no state directamente, asi que sin el
guardado explicito el cambio se quedaria solo en memoria. defaultState()
inicializa railWindow:null y applyStateCompatibilityPatches() lo rellena
si falta, para backups antiguos. Probado con Playwright: reemplazando
document.getElementById('factory-seed') para saltar el asistente
inicial y poder hacer un ciclo real de guardar + page.reload() contra el
mismo almacenamiento que usa la app de escritorio -- elegir Ultimos 3
meses queda escrito de inmediato, desplazar una vez atras con la flecha
(el caso "anteriores" del pedido) guarda el rango ya desplazado y no el
preset recalculado desde hoy, recargar de verdad restaura exactamente
esa ventana desplazada, rango Personalizado persiste tras recargar pero
el formulario Desde/Hasta no reaparece abierto, volver a Todo y recargar
mantiene Todo. Sin errores de consola nuevos. Cambio confirmado en el
asar compilado. Exe arranca bajo Wine limpio. No probado: dentro de la
app real de escritorio con un proyecto real del usuario. El salto de
version a 2.0.0 es instruccion explicita del usuario, no cambio de
arquitectura. Entregado como parche app.asar comprimido en zip.

La 2.0.1 hace que un candidato sin fecha de entrevista cuente tambien
como pendiente en la tarjeta del launcher. El usuario mando capturas
mostrando que metio un candidato nuevo sin fecha y no le aparecia como
pendiente, con su propio diagnostico ("es porque no puse fecha") y la
peticion explicita de que cuente igual. Causa confirmada leyendo el
codigo: en la propia pantalla de Evaluacion de Candidatos el estado
Pendiente nunca dependio de la fecha (evalStatus() solo mira si las
tareas estan puntuadas) y ya funcionaba bien ahi, visible en la propia
captura del usuario. El problema real estaba en
computeCandidatePendingInterviews() en main.js -- la funcion que
alimenta el contador "N entrevista(s) pendiente(s)" de la tarjeta del
launcher -- que tenia if (!ev.fecha) return; como primera linea del
bucle, saltandose enteros a los candidatos sin fecha. Decision de diseno
original de 0.1.76 (documentada en el propio comentario): Pendiente =
tiene fecha Y no esta puntuada del todo -- se quita la primera
condicion. Cambio: se quita ese return temprano: ahora cualquier
evaluacion sin completar suma al contador tenga o no fecha; la fecha,
cuando existe, se sigue usando igual que antes solo para decidir el
color de urgencia (bump()) -- sin fecha, cuenta pero sin nivel de
urgencia asignado (level null si todos los pendientes carecen de
fecha), y el badge del launcher ya tenia previsto ese caso desde 0.1.76
(sin clase de color cae en el tono neutro), asi que no hizo falta tocar
el renderer del launcher, solo main.js. Probado con Playwright
conectado por CDP a la aplicacion Electron real en marcha bajo Xvfb (no
simulado, SQLite real, mismo canal IPC que usa la app): proyecto de
prueba creado desde el launcher, guardado un puesto con una tarea y un
candidato sin fecha y sin puntuar, projects:list devuelve
pendingInterviewsCount:1 y level:null, refrescada la UI real del
launcher y leido el texto real del badge en el DOM: aparece "1
entrevista pendiente". Regresion: fecha pasada anadida al mismo
candidato -- sigue contando y pasa a nivel rojo, el caso con fecha sigue
igual que antes. Regresion: tarea puntuada -- deja de contar (count:0,
level:null). Proyecto de prueba borrado al terminar. Cambio confirmado
en el asar compilado. Exe arranca bajo Wine limpio. No probado: con un
proyecto real del usuario ni con el candidato concreto que menciono
(escenario equivalente, no su dato literal). No se toco nada mas de la
pantalla de Evaluacion de Candidatos ni del launcher. Entregado como
parche app.asar comprimido en zip.

La 2.0.2 anade exportar el informe de un candidato (datos + tareas con
comentarios + borrador de feedback) en Evaluacion de Candidatos. El
usuario pidio directamente, sin ser evaluativo: "necesito que tenga la
opcion de exportar el candidato, tareas con comentarios y borrador
feedback". Cambio: boton nuevo "Exportar informe (.txt)" en la cabecera
de la tarjeta de cada candidato (pestaña Evaluaciones), junto al badge
de estado y Eliminar. Genera un .txt con los datos del candidato
(nombre, puesto, TAP, manager, entrevistador, telefono, fecha,
formacion, anios de experiencia, SBA), el resultado (nota + veredicto si
esta completa, o Pendiente con cuantas notas faltan si no), la lista de
tareas con peso/nota/comentario (o sin puntuar si falta), y el borrador
de feedback tal cual esta en ese momento (editado a mano o el generado
automaticamente, misma fuente que el boton Copiar ya existente). Nueva
funcion buildCandidateReportText(ev) junto a feedbackDraft(), nuevo caso
export-eval en la delegacion de clics de evalList, mismo patron Blob +
a-download que ya usan Exportar resultados CSV y Exportar datos json en
este mismo archivo -- sin anadir ninguna libreria nueva (se descarto PDF
o Word por no haber ya ninguna vendorizada en este modulo y el pedido no
especificaba formato). Probado con Playwright conectado por CDP a la
aplicacion Electron real en marcha: candidato con evaluacion COMPLETA,
se pulso de verdad el boton, se capturo la descarga real y se leyo su
contenido -- confirmado candidato, resultado, cada tarea con su
comentario real, y el borrador de feedback completo. Repetido con un
candidato con evaluacion INCOMPLETA -- Pendiente con el conteo correcto
de notas que faltan, tarea sin nota como sin puntuar, campos vacios como
guion, y el aviso correcto en vez de un feedback inventado. Sin errores
de consola nuevos. Cambio confirmado en el asar compilado. Exe arranca
bajo Wine limpio. No probado: con un candidato real del usuario (datos
de prueba equivalentes). No se toco nada mas de Evaluacion de
Candidatos. Entregado como parche app.asar comprimido en zip.

La 2.0.3 ordena por fecha de entrevista en Evaluaciones, Resultados y el
CSV de Evaluacion de Candidatos. El usuario mando capturas de la pestaña
Resultados con los candidatos fuera de orden respecto a su fecha (orden
de alta, no de fecha) y pidio "aqui que ordene por fecha. en evaluaciones
tambien". Causa: tanto renderEvaluaciones() como renderResultados() (y
la exportacion btnExportCsv, que refleja la tabla de Resultados)
recorrian state.evaluaciones directamente en el orden de alta del array,
sin ordenar nunca por fecha -- mismo tipo de bug ya corregido en 0.1.96
para los entregables del informe ejecutivo del dashboard. Cambio: nueva
funcion sortedEvaluacionesByFecha() que devuelve una copia de
state.evaluaciones ordenada por fecha ascendente (comparacion de cadena
ISO AAAA-MM-DD, ya cronologica), con los candidatos sin fecha todavia al
final (sort estable, conservan su orden de alta entre ellos); se usa en
los tres sitios que muestran/exportan la lista -- el array real
state.evaluaciones no se reordena ni se toca, es solo un cambio de que
se pinta/exporta. Probado con Playwright conectado por CDP a la
aplicacion Electron real en marcha: proyecto de prueba con 4 candidatos
guardados deliberadamente en otro orden que su fecha, reproduciendo el
escenario exacto de la captura del usuario mas un cuarto sin fecha. Se
leyeron los nombres tal cual aparecen en el DOM real de cada pestaña:
Evaluaciones y Resultados quedan en el mismo orden correcto (por fecha,
sin fecha al final). Se descargo de verdad el CSV pulsando el boton real
y se confirmo que las filas vienen en ese mismo orden. Sin errores de
consola nuevos. Cambio confirmado en el asar compilado. Exe arranca bajo
Wine limpio. No probado: con los candidatos reales del usuario (escenario
equivalente, mismos nombres y fechas de su captura). No se toco nada mas
de Evaluacion de Candidatos. Entregado como parche app.asar comprimido en
zip.

La 2.0.4 hace que la Skill Matrix del dashboard admita cualquier numero
de columnas de rol, en vez de las 3 fijas de siempre. El usuario penso
que era un bug (capturas mostrando solo ROL 1/ROL 2/ROL 3 sin poder
añadir mas); investigado y confirmado que era un limite de diseño
heredado, no un bug -- tocaba el modelo de datos de cada skill (3
campos fijos sr/n1/sm), la rejilla CSS, la cabecera/fila/formulario de
edicion, las columnas de CSV/Excel, y el modal de renombrar columnas.
Se le presentaron 3 opciones al usuario via AskUserQuestion y eligio la
completa: soportar N roles de verdad. Cambio: cada skill pasa a guardar
sus niveles en un array `levels` (uno por rol de
state.skillMatrixRoles, cualquier longitud) en vez de sr/n1/sm fijos;
applyStateCompatibilityPatches() migra los datos antiguos sin perder
valores y ajusta la longitud de levels si cambia el numero de roles; el
modal "Editar columnas (roles)" gana botones "+ Añadir columna" y
"Quitar ultima columna" (siempre por el final), trabajando sobre un
borrador aparte que Cancelar descarta sin tocar el estado real;
cabecera/fila/formulario de skill y las columnas de CSV/Excel se
generan en bucle segun el numero de roles actual; el ancho de la
rejilla (antes CSS fijo) se calcula en JS segun cuantos roles haya. La
importacion de CSV/Excel tambien detecta cualquier numero de columnas
de rol (antes exigia exactamente 3), y ya no intenta adivinar con un
recorte de posicion fijo si falla la deteccion por nombre. Probado con
Playwright conectado por CDP a la aplicacion Electron real en marcha:
migracion de un skill con formato antiguo confirmada sin perdida de
datos; añadida una 4a columna desde la interfaz real, con los skills
existentes quedando en nivel 1 ahi sin tocar los demas; alta de un
skill nuevo con el formulario dinamico de 4 niveles; la funcion real de
exportacion CSV genera las 4 columnas correctas; quitar la ultima
columna recorta los niveles de todos los skills conservando los 3
primeros; Cancelar tras "+ Añadir columna" no deja cambios aplicados;
guardado real verificado leyendo el dato tal cual quedo en el
almacenamiento persistente; cierre y reapertura completa de la ventana
del proyecto (no reload(), que se colgo en este entorno) confirma
persistencia real de columnas y niveles. Sin errores de consola nuevos.
Cambio confirmado en el asar compilado. Exe arranca bajo Wine limpio.
No probado: con los datos reales de Skill Matrix del usuario, ni la
importacion end-to-end de un CSV/Excel con un numero de columnas
distinto al actual. El informe ejecutivo PPTX no toca la Skill Matrix
(confirmado en el codigo), no se vio afectado. Entregado como parche
app.asar comprimido en zip.

La 2.0.5 corrige un bug real de la propia 2.0.4: con nombres de rol
largos (Tecnico N1, Coordinador, Jefe de Proyecto...) y varias columnas
a la vez, la cabecera de la Skill Matrix aparecia amontonada, con los
nombres solapandose unos con otros (capturas del usuario, "aparece mu
apelotonado"). Causa: skillMatrixGridCols() dejaba fijo el ancho de
cada columna en 34px (pensado para nombres cortos tipo Rol 1) y
.sm-head-row span no tenia word-break, asi que un nombre largo se
desbordaba sobre la columna vecina en vez de romper de linea. Cambio:
cada columna calcula su propio ancho segun la longitud de su nombre
(minimo 34px como antes, maximo 74px), .sm-head-row span rompe la
palabra si aun asi no cupiera, y #skills-container gana scroll
horizontal propio por si la suma de columnas supera el ancho del
panel. Probado con Playwright conectado por CDP a la app Electron real:
reproducido el escenario exacto de la captura del usuario (5 roles con
nombres reales largos), medidos por codigo los rectangulos reales de
cada etiqueta de la cabecera y confirmado que ya no se solapan (antes
si, con el mismo escenario), mas una captura de pantalla real
confirmando el resultado visual. Sin errores de consola nuevos. Cambio
confirmado en el asar compilado. Exe arranca bajo Wine limpio. No
probado: los nombres de rol reales exactos del usuario, ni el caso
extremo de muchas columnas (7, 8) todas con nombres largos a la vez.
Entregado como parche app.asar comprimido en zip.

La 2.0.6 hace que, en el Directorio de Talento, el filtro "Rol" y el
filtro "Categoria" muestren solo las opciones del proyecto seleccionado
en "Proyecto" -- antes mezclaban roles/categorias de todos los
proyectos aunque ya hubiera uno filtrado (capturas del usuario:
"dentro de directorio de talento. si filtro por proyecto los roles y
los demas filtros que me muestre los de ese proyecto"). Causa: allRoles()
y allCategorias() (directorio/plantilla_directorio.html) recorrian
state.people completo sin mirar ui.filters.proyecto, y cambiar
"Proyecto" solo refiltraba la tabla (renderFilteredViews()) sin
repintar la barra de filtros, asi que aunque se hubieran acotado las
funciones no se habria notado. Cambio: ambas funciones admiten un
parametro opcional `proyecto` (allRoles mira a.proyecto de cada
asignacion; allCategorias solo cuenta personas con alguna asignacion en
ese proyecto); el <select> de Proyecto tiene ahora su propio listener
que repinta la barra entera al cambiar, y limpia Rol/Categoria si el
valor que tenian ya no existe en el proyecto nuevo (evita el desajuste
entre lo que se ve en el desplegable y el filtro real aplicado por
debajo). Sin proyecto seleccionado, se comporta igual que antes. Los
demas filtros (SBA, DISC, Antiguedad, Estado) no dependen de datos por
proyecto y no se tocaron. Probado con Playwright conectado por CDP a la
app Electron real: con 2 proyectos de prueba con roles/categorias
distintos y una persona con asignaciones en ambos, se comprobo que con
Proyecto=Todos el combo de Rol trae los 5 roles, con Proyecto=MICIU
trae solo los 3 de MICIU (leido del DOM real), la Categoria igual, y
que un Rol/Categoria que dejan de aplicar al cambiar de proyecto se
limpian solos -- mas una captura de pantalla real confirmando el
resultado visual y la tabla de Equipo ya filtrada. Sin errores de
consola nuevos. Cambio confirmado en el asar compilado. Exe arranca
bajo Wine limpio. No probado: con los datos reales del Directorio del
usuario, ni con un volumen grande de proyectos con roles/categorias muy
parecidos. Entregado como parche app.asar comprimido en zip.

La 2.0.7 anade, en Fases del servicio, la fecha de inicio de cada fase
junto a la de fin (antes solo se veia "hasta DD MES AAAA"), y en
Riesgos: fecha discreta (9.5px) en cada fila y boton para desplegar
Mitigacion/Contingencia sin depender de la caja destacada de arriba
(capturas del usuario, pedido explicitamente como propuesta a discutir
antes de implementar: "como lo ves? te leo"). Via AskUserQuestion se
pregunto que hacer con la caja destacada del riesgo mas critico ahora
que las filas tambien son desplegables; el usuario respondio mantenerla
pero quitando el ID interno (RSK_xxxxx) que mostraba. Cambios:
renderPhases() deriva el inicio de cada fase del fin de la fase
anterior (o serviceStart para la primera), sin dato nuevo que rellenar
a mano; si no hay serviceStart se mantiene el texto de antes. Cada fila
de riesgo "en seguimiento" ahora muestra fechaDeteccion en el mismo
estilo discreto que ya usaban materializado/cerrado (el dato ya
existia, solo no se pintaba). Cada fila gana boton toggle
(data-toggle-risk-detail) calcado del mecanismo ya existente de Hitos
(ui.expandedMilestones -> aqui ui.expandedRisks, nuevo, en ui y no en
state, no persiste entre sesiones). La caja destacada ya no muestra el
ID del riesgo, solo "En seguimiento"/"MATERIALIZADO"; su logica de
seleccion no cambio. Probado con Playwright conectado por CDP a la app
Electron real: 3 fases encadenando bien "desde X hasta Y" leido del DOM
real; .rh-id sin "RSK_"; cada fila "en seguimiento" con fecha
"detectado..." a 9.5px confirmado por getComputedStyle; boton de
despliegue pulsado de verdad, .ms-detail con Mitigacion/Contingencia
reales de ESE riesgo, ninguna otra fila se despliega a la vez,
colapsa de nuevo al repulsar; saveState() real sin errores; dos
capturas de pantalla reales vistas y confirmadas. Sin errores de
consola nuevos. Cambio confirmado en el asar compilado. Exe arranca
bajo Wine limpio. No probado: con las fases/riesgos reales del usuario,
ni el caso de una fase sin serviceStart en vivo. No se toco ni probo
Hitos, Skill Matrix, Equipo, Cobertura ni el resto de paneles.
Entregado como parche app.asar comprimido en zip.

La 2.0.8 hace mas visuales Mitigacion/Contingencia en el detalle
desplegable de cada riesgo (antes texto plano) y anade Observaciones de
materializacion/cierre con fecha (capturas del usuario, pedido de nuevo
como propuesta a discutir: "que te parece?"). Via AskUserQuestion (dos
preguntas) se pregunto estilo visual y estructura de Observaciones; el
usuario eligio en ambas la opcion recomendada: tarjetas con icono/color,
y dos campos independientes (uno por materializacion, otro por cierre)
en vez de uno generico. Cambios: riskDetailHtml() pasa Mitigacion/
Contingencia a dos tarjetas (icono 🛡️ cian / 🧯 ambar, mismas variables
de color que ya usa el resto de la app). Si el riesgo tiene
fechaMaterializacion y obsMaterializacion con texto aparece una tarjeta
con esa observacion y su fecha en 9.5px; igual para fechaCierre/
obsCierre; sin texto no aparece tarjeta vacia. riskFieldsTemplate()
suma dos textarea (Observaciones de materializacion/cierre)
condicionados con el mismo showMat/showClose que ya gobernaba las
fechas -- no se anade ninguna fecha nueva, las observaciones cuelgan de
las que ya existian. Nuevos campos obsMaterializacion/obsCierre en el
modelo de datos, con migracion para riesgos guardados antes de la
2.0.8. Exportacion/importacion CSV y Excel de Riesgos con las dos
columnas nuevas. Probado con Playwright conectado por CDP a la app
Electron real: 3 riesgos de prueba (en seguimiento, materializado con 1
observacion, cerrado con 2); confirmado por getComputedStyle que las
tarjetas tienen colores de borde distintos; el riesgo en seguimiento no
muestra ninguna tarjeta de observaciones; el materializado muestra
exactamente 1, el cerrado las 2, cada una con fecha y texto correctos;
en edicion los campos son textarea visibles con el valor guardado
cuando aplican, e input hidden cuando no; editado un campo de verdad
desde el formulario y confirmado releyendo state.risks que persiste;
saveState() real sin errores; captura de pantalla real confirmando el
resultado visual. Sin errores de consola nuevos. Cambio confirmado en
el asar compilado. Exe arranca bajo Wine limpio. No probado: con los
riesgos reales del usuario, ni una exportacion/importacion real a un
archivo CSV/Excel con las columnas nuevas. No se toco ni probo Fases,
Hitos, Skill Matrix, Equipo, Cobertura ni el resto de paneles.
Entregado como parche app.asar comprimido en zip.

La 2.0.9 hace fondo completo (no solo borde) en las tarjetas de
Mitigacion/Contingencia y tambien en la fila de cada riesgo segun su
criticidad; anade un desplegable de Estado en el formulario de editar
que revela al momento los campos de fecha/observaciones que
correspondan; y anade Responsable de mitigacion/contingencia, siempre
visible (capturas del usuario, de nuevo pedido como propuesta a
discutir: "se puede mejorar? ... que opinas?"). Dos partes eran
ambiguas y se preguntaron antes de tocar codigo (AskUserQuestion, dos
preguntas): que significaba "la de arriba tambien" (la fila del riesgo,
o la caja destacada del mas critico) y si el responsable debia ser uno
por plan o uno solo; el usuario eligio en ambas la recomendada: la fila
del riesgo, y dos campos de responsable independientes. Cambios:
.risk-detail-card pasa a fondo completo (cyan-bg/amber-bg, mismas
variables que Skill Matrix y botones de prorroga/restaurar). La fila
"en seguimiento" (la mayoria) pasa de fondo transparente a fondo segun
criticidad (sev-rojo/amarillo/verde, mismo riskLevel() que ya usaba la
etiqueta C9/C4/C1); materializado/cerrado mantienen su tratamiento
propio, sin mezclarse. riskFieldsTemplate() suma un select Estado solo
en el formulario de EDITAR (no en Añadir, un riesgo nuevo siempre
arranca en seguimiento); un listener de change muestra/oculta al
momento -- sin re-renderizar el formulario, para no perder lo que se
este escribiendo -- los campos de fecha/observaciones segun el estado
elegido, autocompletando la fecha con hoy si falta; al guardar, si el
estado final no aplica materializado/cerrado se limpian fecha y
observacion (ya no tendria sentido dejarlas fantasma). El pill de la
fila sigue funcionando igual para el cambio rapido. Dos campos nuevos
respMitigacion/respContingencia siempre visibles (a diferencia de
Observaciones, que son retrospectivas, el responsable se planifica de
antemano junto con el plan) en ambos formularios, mostrados en las
tarjetas del detalle si tienen contenido. Migracion para riesgos
guardados antes de la 2.0.9; columnas nuevas en exportacion/importacion
CSV y Excel. Probado con Playwright conectado por CDP a la app
Electron real: 4 riesgos de prueba (alta/media/baja criticidad en
seguimiento, uno materializado); confirmado por getComputedStyle que
cada fila tiene fondo real y distinto segun su criticidad y que la
materializada mantiene su fondo propio sin mezclarse; tarjetas con
fondos reales y distintos entre si; riesgo con responsables los
muestra, uno sin ellos no deja linea vacia; en edicion, cambiado el
Estado a Materializado SIN guardar, los campos aparecen al momento con
fecha autocompletada; guardado y releido state.risks confirmando que
persiste todo (estado, fecha, observacion, ambos responsables) y que
cierre sigue vacio; revertido a En seguimiento y guardado, confirmado
que fecha/observacion de materializacion se limpian; confirmado que
Añadir riesgo no tiene el select de Estado pero si los responsables, y
que un riesgo nuevo los guarda bien; saveState() real sin errores;
captura de pantalla real confirmando el resultado visual. Sin errores
de consola nuevos. Cambio confirmado en el asar compilado. Exe arranca
bajo Wine limpio. No probado: con los riesgos reales del usuario, ni
una exportacion/importacion real a un archivo CSV/Excel con las
columnas de responsable nuevas. No se toco ni probo Fases, Hitos, Skill
Matrix, Equipo, Cobertura ni el resto de paneles.
Entregado como parche app.asar comprimido en zip.

La 2.0.10 son correcciones directas sobre la 2.0.9 tras verla en
marcha (no una pregunta abierta esta vez): sustituir el desplegable
Estado del formulario de editar por un check de materializado y otro
de cierre, revertir el fondo de color por criticidad en las filas "en
seguimiento" (no gusto), y no tocar las tarjetas de Mitigacion/
Contingencia (fondo completo, esas si estan bien). El punto de los
checkboxes tenia una ambiguedad real: "responsable de cada caso" podia
significar mover los ya existentes Responsable de mitigacion/
contingencia a depender de los checkboxes, o anadir dos campos nuevos
ligados al propio evento. Se resolvio con la restriccion "no toques
las tarjetas" (que muestran precisamente esos dos responsables): si
esas no se tocan, el responsable del punto 1 tiene que ser un
concepto nuevo -- implementado con esa lectura, dejada explicita en la
entrega para que el usuario corrija si hace falta. Cambios: el select
de Estado se sustituye por dos checkboxes independientes
(Materializado/Cerrado, estilo calcado de .ent-done-toggle de Hitos).
Al marcar uno aparecen fecha, Observaciones (ya existia) y Responsable
-- nuevo, respMaterializacion/respCierre, distinto de
respMitigacion/respContingencia que no se tocan. Al ser independientes
ahora se puede marcar Cerrado sin Materializado (un riesgo cerrado sin
haber llegado a ocurrir), caso que el modelo de 3 estados no
distinguia bien. r.status se sigue derivando para mantener compatible
el pill de la fila/caja destacada/contadores (cerrado manda si ambos
estan marcados), pero fechaMaterializacion/obsMaterializacion/
respMaterializacion solo se guardan si su checkbox esta marcado -- si
se marca Cerrado sin Materializado, fechaMaterializacion se queda
null, reflejando fielmente que nunca se materializo. En el detalle
desplegable, el responsable de materializacion/cierre aparece junto a
su observacion (se muestra el bloque si hay observacion O responsable,
antes exigia observacion si o si); las tarjetas de Mitigacion/
Contingencia no se tocaron. Revertido el CSS sev-rojo/amarillo/verde y
el rowClass de la 2.0.9 -- la fila "en seguimiento" vuelve a no tener
fondo propio. Migracion para los campos nuevos; columnas nuevas en
exportacion/importacion CSV y Excel. Probado con Playwright conectado
por CDP a la app Electron real: confirmado por getComputedStyle que la
fila ya no tiene fondo de color y que las tarjetas siguen sin cambios;
confirmado que el select de Estado desaparecio y los dos checkboxes
funcionan; marcado solo Cerrado sin Materializado y guardado,
confirmado fechaMaterializacion en null; marcados ambos checkboxes con
los 4 campos de responsable rellenados y guardado, releido
state.risks confirmando que persisten de forma independiente;
confirmado en el detalle que el responsable de materializacion/cierre
aparece junto a su observacion y que las tarjetas no cambiaron;
saveState() real sin errores; dos capturas de pantalla reales
confirmando el resultado visual. Sin errores de consola nuevos. Cambio
confirmado en el asar compilado. Exe arranca bajo Wine limpio. No
probado: con los riesgos reales del usuario, ni una exportacion/
importacion real a CSV/Excel con las columnas nuevas. No se toco ni
probo Fases, Hitos, Skill Matrix, Equipo, Cobertura ni el resto de
paneles. La interpretacion de "responsable de cada caso" como campos
nuevos no se confirmo explicitamente con el usuario antes de
implementar -- se dedujo de la restriccion de no tocar las tarjetas.
Entregado como parche app.asar comprimido en zip.

La 2.0.11 responde a una pregunta abierta sobre "Via de despliegue del
servicio"/"Fases del servicio": que pasa con el estado del Equipo
cuando el servicio termina por fecha, si el launcher avisa de algo, y
como representar una prorroga posible pero aun no confirmada (ejemplo
del usuario: contrato de 36 meses + "supuesta prorroga" de 24 meses no
materializada). Investigacion previa confirmo por lectura de codigo que
t.status (Equipo) es 100% manual salvo la rotacion individual por
scheduledExit de cada persona (ya independiente de serviceEnd, no se
toco), y que el launcher no tenia ninguna referencia a serviceEnd antes
de este parche. Resuelto via AskUserQuestion (3 de 4 preguntas con la
opcion recomendada, la 4a con una propuesta propia del usuario,
implementada tal cual). Cambios: nueva funcion computeServiceEndWarning
en main.js (mismo mecanismo que computeProjectSemaforo, lee el ultimo
backup), llamada desde projects:list como badge INDEPENDIENTE del
semaforo de hitos/riesgos (mezclarlo ahi habria hecho ambiguo un borde
rojo). Umbral fijo de 30 dias: amarillo si faltan <=30 dias, rojo si ya
paso. Se muestra en la tarjeta del launcher (span .service-end-warning,
mismo esquema de color que "N entrevista(s) pendiente(s)" pero sin
cursor:pointer) y en el dashboard (renderServiceEndWarning, funcion
local equivalente ya que no se puede compartir codigo con el proceso
principal). Prorroga ESTIMADA: campo nuevo state.prorrogaEstimada
({fecha} o null). El boton "Marcar prorroga" ahora ofrece dos radio
buttons: "Confirmar prorroga (ya acordada)" (de siempre) y "Estimar
segun contrato (aun sin confirmar)" (nuevo, guarda solo la estimacion
sin tocar serviceEnd). Con una estimacion guardada aparece su propia
franja con "Confirmar esta prorroga" (aplica la fecha de verdad via el
nuevo helper compartido applyProrroga(newEnd)) y "Quitar estimacion"
(descarta sin tocar nada mas). Si la fecha estimada se acerca o pasa
sin confirmarse, dispara el mismo aviso de fin de servicio. En la Via
de despliegue (SVG), si la prorroga estimada cae mas alla del fin real
y estamos en la vista "Todo" (una ventana personalizada no se ensancha
sola), la escala visual (railEnd, NUNCA start/end que alimentan
progreso/fase/KPIs) se amplia para dibujar un tramo discontinuo y
semitransparente "PRORROGA ESTIMADA (sin confirmar)" mas alla de "FIN
ESTIMADO", con trazo distinto para no confundirse con una prorroga
confirmada. FIX de un bug real encontrado por lectura de codigo:
"Desmarcar prorroga" solo apagaba enProrroga sin restaurar serviceEnd
desde prorrogaDesde -- ahora si lo restaura de verdad. Probado con
Playwright/CDP en la app real: aviso ambar/rojo confirmado en
dashboard Y en la tarjeta del launcher (esperando al guardado
automatico real de fondo, no simulado -- hizo falta saveState() +
esperar el setInterval de 15s para que el backup que lee el launcher
se actualizara). Flujo completo de "Estimar segun contrato" confirmado
con el estado real releido (prorrogaEstimada se rellena sin tocar
serviceEnd). Confirmado el texto "PRORROGA ESTIMADA (sin confirmar)"
en el SVG real, con capturas de dos escenarios (estimacion antes del
fin real, y el caso del usuario: fin real proximo + estimacion mas
alla, con la escala ensanchandose y el rango KPI de cabecera sin
cambiar). Confirmado que "Quitar estimacion" no toca serviceEnd y que
"Confirmar esta prorroga" si la aplica de verdad. FIX del bug de
"Desmarcar prorroga" verificado con el estado real (serviceEnd vuelve
a su valor anterior, no solo desaparece la franja). Sin errores de
consola nuevos. Cambio confirmado en el asar compilado. Exe arranca
bajo Wine limpio. No probado: con proyectos reales del usuario, el
umbral de 30 dias no se confirmo explicitamente (es un valor por
defecto propuesto), ni el aspecto de una prorroga estimada dentro de
una ventana personalizada de la Via. No se toco ni probo Riesgos,
Hitos, Skill Matrix, Equipo, Cobertura ni el resto de paneles.
Entregado como parche app.asar comprimido en zip.

La 2.0.12 cambia el color de la barra de titulo nativa de Windows (la
que lleva minimizar/maximizar/cerrar) de gris oscuro a un cian claro
#CDE7ED, muestreado con PIL de una captura de referencia que envio el
usuario, con simbolo/texto en #2B2B2B para mantener contraste. Unica via
en Electron para recolorear esa barra: Window Controls Overlay
(titleBarStyle:'hidden' + titleBarOverlay:{color, symbolColor, height}),
normalmente la pinta el propio Windows (DWM) siguiendo el tema del
sistema. Nuevo objeto compartido LIGHT_TITLEBAR_OPTS en main.js, aplicado
con spread a las 7 BrowserWindow de cara al usuario (launcher, proyecto/
Directorio de Talento, Preparacion de Reunion, Evaluacion de Candidatos,
selector de backup, Seguridad, prompt de contrasena); no aplicado a
splashWin (ya frame:false) ni a las dos ventanas internas show:false
(restoreWin, seedWin). Probado: node --check sin errores; cambio
confirmado en el asar compilado (LIGHT_TITLEBAR_OPTS aparece 8 veces,
version 2.0.12); app arranca sin errores bajo Xvfb/Linux con la nueva
config (puerto de depuracion remota respondio con panorama-app/2.0.12);
captura de pantalla del launcher en marcha sin errores visibles; exe
empaquetado arranca bajo Wine sin errores ni cuelgues nuevos. NO
probado -- importante para este cambio: el aspecto visual final (si el
color coincide con la referencia, contraste del simbolo, alineacion de
los botones nativos) no se puede verificar desde este entorno, porque
Linux/Xvfb no dibuja una barra de titulo nativa de Windows y Wine no
reproduce fielmente el renderizado DWM real; queda pendiente de
confirmacion visual del usuario tras instalar en su Windows real.
Entregado como parche app.asar comprimido en zip.

La 2.0.13 revierte POR COMPLETO el cambio de la 2.0.12. El usuario
probo la 2.0.12 en su Windows 11 real y confirmo dos problemas: el
color seguia gris (no salio como se esperaba) y, mucho mas grave, el
menu de la aplicacion (Archivo/Configuracion, etc.) desaparecio en
todas las ventanas. Diagnostico confirmado con evidencia directa (no
hipotesis): esta app nunca llama a Menu.setApplicationMenu, usa el menu
por defecto de Electron, que cuelga del marco clasico de la ventana;
titleBarStyle:'hidden' (necesario para poder recolorear via
titleBarOverlay) esconde ese marco clasico y con el el menu por
defecto. No es un problema de tono de color ni de version de Windows:
la unica via de Electron para recolorear la barra nativa es
incompatible con conservar el menu nativo tal y como esta montada esta
app. Cambio: se quita LIGHT_TITLEBAR_OPTS y sus 7 usos de las 7
BrowserWindow donde se habian anadido en main.js, dejando solo un
comentario con el historial. La app vuelve exactamente al
comportamiento de la 2.0.11. Probado: node --check sin errores; cambio
confirmado en el asar compilado (no queda codigo funcional de
titleBarStyle/titleBarOverlay, solo comentario; version 2.0.13); exe
empaquetado arranca bajo Wine sin errores nuevos. No probado: que el
menu vuelve a aparecer en Windows 11 real (no se puede verificar un
menu nativo de Windows desde este entorno Linux) -- deberia volver
porque el codigo queda identico al de la 2.0.11, pero la confirmacion
visual real queda pendiente del usuario. Si se retoma el color de la
barra de titulo en el futuro, la unica via que quedaria es mas
invasiva: quitar el marco nativo del todo y construir una barra de
titulo propia dentro de la app, lo que obligaria a reconstruir tambien
el menu como controles propios (arrastre de ventana, doble clic para
maximizar, menu entero a mano) -- anotado como opcion con su coste, no
se reintenta sin que el usuario lo pida explicitamente sabiendolo.
Entregado como parche app.asar comprimido en zip.

La 2.0.14 es una PRUEBA PILOTO: el usuario probo la opcion de Windows de
colorear la barra de titulo con el color de enfasis (sugerida como
alternativa gratis a la 2.0.13), confirmo que funciona pero se apaga al
perder el foco (comportamiento normal de Windows), y pidio evaluar el
costo real de quitar el marco nativo. Tras la explicacion del desglose
completo, propuso probarlo minimamente y aplicarlo a las 7 ventanas si
sale bien, o revertir si no. Cambio: SOLO createLauncherWindow() pasa a
frame:false (las otras 6 ventanas no se tocan, siguen con marco nativo
igual que en 2.0.13). Dentro de launcher/index.html se construye a mano:
barra de titulo propia con el color #CDE7ED pedido desde el principio
(ya no titleBarOverlay, sino contenido normal de la pagina sin
restriccion de Windows), icono, titulo, botones de minimizar/maximizar/
cerrar; debajo, menu Archivo/Editar/Seguridad/Configuracion como
desplegables propios, cada uno en su propio contenedor position:relative
para que se abra bajo SU boton (bug de posicionamiento encontrado y
corregido durante la propia implementacion, antes de entregar). Seguridad
se repuebla segun security:isEnabled (mismo criterio que
securityMenuItems() nativo); Configuracion llama a las MISMAS funciones
que el menu nativo (applyAsarPatch, showDiagnosticsDialog, openPatchLog,
openAppLog, showErrorCodesDialog, showAboutDialog, openInstallFolder,
changeUserDataLocation, resetUserDataLocationToDefault,
openDriveSyncGuardLog) via nuevo IPC launcherMenu:action -- mismo
comportamiento, solo cambia el disparador. Archivo/Editar se resuelven
en el renderer sin IPC (reutilizan botones/funciones ya existentes;
Editar usa document.execCommand). Ctrl+N reimplementado a mano con
keydown (ya no hay Menu nativo del que colgar el acelerador). Arrastre
de ventana (-webkit-app-region:drag con no-drag explicito en botones/
menu/icono) y doble clic para maximizar/restaurar, reimplementados a
mano. Nuevos IPC genericos win:minimize/win:toggleMaximize/win:close/
win:isMaximized via BrowserWindow.fromWebContents, reutilizables si el
piloto se extiende. Probado: node --check sin errores; cambio confirmado
en el asar compilado; con Xvfb+Playwright sobre la app real: barra y
menu aparecen, cada desplegable se abre alineado bajo su boton, Seguridad
muestra las opciones correctas segun estado real, Ctrl+N sigue abriendo
el modal, los botones que ya existian en la pagina siguen funcionando
sin errores nuevos en consola, las llamadas IPC de minimizar/maximizar/
cerrar se ejecutan sin lanzar error. Exe empaquetado arranca bajo Wine
sin errores nuevos. No probado -- mas que de costumbre, porque se
sustituye comportamiento que antes daba Windows gratis: arrastrar la
ventana de verdad con el raton, que el doble clic maximice/restaure de
verdad, que redimensionar desde los bordes siga funcionando sin marco
nativo, el aspecto de esquinas/sombra en Windows 11 sin marco. Ni
siquiera "maximizar" se pudo verificar visualmente en las pruebas de
este entorno -- la Xvfb de aqui no tiene gestor de ventanas activo, asi
que win.maximize() no produce ningun cambio visible aunque la llamada no
de error. Perdida ya aceptada de antemano por el usuario: se pierde el
menu de "ajustar a media pantalla" (snap layouts) de Windows 11 al pasar
el raton por maximizar, porque ya no es el boton nativo. Entregado como
parche app.asar comprimido en zip. Pendiente de confirmacion del usuario
en Windows real antes de decidir si se extiende a las otras 6 ventanas o
se revierte solo el lanzador.

La 2.0.15 ajusta el color de la barra propia del lanzador: el usuario
confirmo que la 2.0.14 funciona bien en su Windows real (arrastre, menu,
botones) y pidio cambiar el cian plano por un degradado gris/azul-lila,
mandando una captura de referencia. Cambio: solo el background de
.titlebar en launcher/index.html, de #CDE7ED plano a
linear-gradient(to right, #dadada 0%, #dadada 20%, #d1dbed 50%, #dadada
80%, #dadada 100%), con los tonos muestreados con PIL en varios puntos
de la captura del usuario (gris #dadada en los bordes, azul-lila palido
#d1dbed en el centro). Nada mas de la 2.0.14 se toca. Probado: colores
muestreados con PIL (no a ojo); verificado visualmente en Xvfb que el
degradado se aplica y se parece a la referencia; cambio confirmado en el
asar compilado; exe empaquetado arranca bajo Wine sin errores nuevos. No
probado: el aspecto exacto en Windows real -- como con cualquier cambio
de color, la comparacion final la hace el usuario en pantalla. Entregado
como parche app.asar comprimido en zip.

La 2.0.16 responde al pedido explicito del usuario tras confirmar el
piloto del lanzador: "quiero todo igual claro" -- extender el mismo
tratamiento (frame:false + barra propia con el degradado de la 2.0.15 +
menu propio donde antes habia menu nativo) a las 6 ventanas que faltaban:
ventana de Proyecto/Dashboard (menu completo Archivo/Editar/Proyecto/
Seguridad, reproduciendo TODO buildProjectMenu() via nuevo IPC
projectMenu:action), Directorio de Talento (mismo patron pero menu
Proyecto recortado sin Prep/Eval, mas el boton suelto "Partes mensuales"
como en el menu nativo), Preparacion de Reunion y Evaluacion de
Candidatos (solo barra, nunca tuvieron menu), selector "Restaurar un
backup concreto" (barra con min/max/cerrar, sin menu), y las ventanas de
Seguridad y de contrasena (barra con SOLO boton cerrar, no son
maximizables). Mecanismo compartido generalizado desde el lanzador: IPC
genericos win:minimize/toggleMaximize/close/isMaximized via
BrowserWindow.fromWebContents, eventos maximize/unmaximize ->
win:maximizedChanged, winControls expuesto en los 4 preload afectados,
execCommand para Editar. fixVendorScriptPaths extendido para arreglar
tambien la ruta del icono de la barra en las plantillas horneadas
(mismo problema ya resuelto antes para vendor/xlsx y vendor/pptxgen).
Probado de verdad con Xvfb+Playwright sobre la app real: las 7 ventanas
abren con su barra (y menu donde toca); menu Proyecto completo y
alineado en la ventana de proyecto; menu Proyecto recortado + boton
Partes mensuales funcional en Directorio; Editar (execCommand) sin
excepciones; Seguridad se rellena dinamicamente segun estado real;
Preparacion de Reunion, Evaluacion de Candidatos y el selector de backup
se abrieron en vivo desde el nuevo menu Proyecto con su barra y titulo
correctos; la ventana de Seguridad se abrio en vivo con SOLO boton
cerrar (confirmado con captura ampliada) y se confirmo que cerrar
funciona de verdad; Ctrl+N/Ctrl+O sin errores; cero errores NUEVOS de
consola -- aparecieron 7 errores pero se investigaron uno a uno y son
ajenos (1 de red cargando Google Fonts sin internet en el sandbox, 6 de
NaN en el grafico SVG por proyectos de prueba sinteticos sin fechas de
servicio configuradas, reproducido en dos proyectos distintos y
confirmado leyendo su backup JSON). asar extract confirma frame:false en
las 7 ventanas nuevas (+1 preexistente: la ventana de splash, sin
relacion, ya lo era desde antes). Exe empaquetado arranca bajo Wine sin
errores nuevos (GPU se cae por swiftshader/ALSA bajo Wine, limitacion
conocida ajena a la app). No probado: arrastre/redimension/maximizado
real y aspecto fino en Windows real (mismo limite de siempre: Xvfb aqui
sin gestor de ventanas); la ventana de contrasena NO se disparo en vivo
esta vez (requiere un flujo de cifrado+importacion no montado en esta
sesion) -- se verifico solo por revision de codigo, siendo
estructuralmente identica a la de Seguridad que si se probo en vivo.
Entregado como parche app.asar comprimido en zip.

La 2.0.17 corrige 4 problemas reportados por el usuario con capturas
reales de Windows 11 tras la 2.0.16: (1) franja oscura sobre la barra de
Preparacion de Reunion -- causa real: el padding superior vivia en
<body> en vez de en un contenedor interno, y la barra nueva es el primer
hijo de body, asi que quedaba empujada hacia abajo dejando ver el fondo
oscuro por encima; fix: mover el padding a .wrap. (2) "No aplica" saltaba
de linea en Partes mensuales de Directorio de Talento -- la celda Estado
no tenia ancho minimo reservado y competia con el input de Nota oculto,
que aun invisible reservaba 120px en todas las filas; fix:
white-space:nowrap + min-width:300px en la celda Estado, y el input de
Nota oculto ya no reserva ancho cuando no aplica. (3) la prorroga prevista
desaparecia en vistas de 3 meses/personalizada de la Via de despliegue --
era intencional desde 2.0.11 pero mal pensado: tentativeEnd solo se
CALCULABA en la vista "Todo"; fix: se calcula siempre que exista, solo se
sigue ensanchando railEnd automaticamente en "Todo", y se anadio un guard
de rango en renderRail() (mismo patron que FIN ESTIMADO/HOY) para que se
dibuje solo si cae dentro de la ventana visible actual. (4) parpadeo en
blanco al abrir ventanas -- al quitar el marco nativo en 2.0.16 las
ventanas se muestran enseguida por defecto de Electron, antes de tener
contenido pintado; fix: generalizado a las 5 ventanas que no lo tenian
(Proyecto/Dashboard, Preparacion de Reunion, Evaluacion de Candidatos,
selector de backup, ventana de contrasena) el mismo patron show:false +
mostrar en 'ready-to-show' + backgroundColor de reserva que YA usaban el
lanzador y la ventana de Seguridad desde 2.0.14, sin montar un popup de
carga aparte. Probado de verdad: la franja oscura y el salto de linea se
verificaron visualmente en Xvfb con capturas y con datos sinteticos en
anchos estrechos; la prorroga prevista se verifico con datos sinteticos
confirmando que el marcador SVG aparece donde antes no aparecia; las 5
ventanas con el nuevo show:false siguen abriendo correctamente sin
errores nuevos de consola. No probado: el parpadeo en blanco en si no se
puede medir desde este sandbox (efecto visual de milisegundos) -- mismo
patron ya confirmado por el usuario en su Windows real para el lanzador,
pendiente de que confirme que tambien funciona en las otras 5. Entregado
como parche app.asar comprimido en zip.

La 2.0.18 corrige 3 problemas reportados con capturas reales tras la
2.0.17, mas 1 mejora pedida explicitamente: (1) en Partes mensuales de
Directorio de Talento, marcar el estado de una fila (Aprobado, Incidencia,
etc.) ya no la hace saltar sola al fondo de la tabla -- causa real: la
tabla se reordenaba automaticamente por un rank fijo
(pendientes/incidencias arriba, aprobados/no aplica abajo) en cada
render, y marcar un estado dispara justo ese render; fix: se quito el
reordenamiento automatico por completo. (2) nuevo, para compensar (1):
las cabeceras Nombre/Proyecto(s)/Estado de esa misma tabla ahora se
pueden pinchar para ordenar, con flecha de sentido -- mismo mecanismo
(ui.sortKey/sortDir + columnas data-sort) que ya usaba la tabla de
Equipo, replicado como ui.partesSortKey/partesSortDir +
PARTES_SORT_COLUMNS. (3) en la Via de despliegue, las etiquetas de fecha
de varios hitos quedaban literalmente superpuestas e ilegibles cuando el
servicio dura años pero los hitos caen muy juntos en el tiempo (semanas)
-- causa real diagnosticada con coordenadas SVG extraidas: sus posiciones
X reales quedan a pocos px de distancia, mucho menos de lo que ocupa cada
etiqueta de texto, y el escalonado en altura (tiers) ya existente no
compensa eso porque solo separa en Y, no en X; fix: nueva funcion
layoutLabelsX() (greedy de dos pasadas) que calcula una posicion de
etiqueta lx separada de la posicion real del hito cx -- el circulo se
queda en cx, el texto se dibuja en lx, la linea de guia va de (cx,Y) a
(lx,ty) y se inclina cuando hace falta separar; el marcador HOY entra en
el mismo calculo porque en el caso real del usuario caia casi encima de
un hito. (4) mejora pedida: el dialogo de "Aplicar parche" (main.js,
applyAsarPatch) ahora muestra un icono propio -- check verde si el hash
del archivo se valida correctamente contra el nombre, triangulo ambar si
no -- en vez del triangulo de aviso generico de Windows que salia incluso
en el caso valido; se paso icon:<ruta-png> a dialog.showMessageBoxSync(),
con dos PNG nuevos en assets/. Probado de verdad: (1) confirmado con 4
filas sinteticas marcadas una a una que el orden no cambia tras marcar
estado; (2) confirmado en vivo que el orden por defecto es alfabetico y
que pinchar "Estado" reordena correctamente; (3) reproducido el caso
denso real del usuario con datos sinteticos y capturas del #rail-svg
antes/despues -- las 5 etiquetas (incluido HOY) pasan de superpuestas a
legibles por separado; verificado tambien que un caso normal (fechas bien
separadas) no sufre cambios no deseados, y que la vista con ventana
(railWindow) sigue funcionando; (4) el mecanismo de icono personalizado
en dialog.showMessageBox() se probo con un script Electron aislado bajo
Xvfb, con captura de pantalla real (X11) de cada icono (verde y ambar)
dentro de un dialogo nativo real -- NO se pudo probar el flujo completo
de applyAsarPatch() de principio a fin (esa funcion solo corre sobre la
version empaquetada, no en modo desarrollo, sin Windows real disponible
para verificar tamaño/escalado exacto del icono en un MessageBox nativo
de Windows). Entregado como parche app.asar comprimido en zip.

La 2.0.19 corrige dos errores propios de la 2.0.18 (senalados con razon
por el usuario) y arregla de verdad un bug que llevaba dos rondas sin
quedar bien resuelto: (1) se revirtieron por completo las lineas
diagonales de separacion de etiquetas anadidas en la 2.0.18
(layoutLabelsX) -- el usuario NO las habia pedido, fueron una
interpretacion erronea de una captura suya; renderRail() vuelve a su
forma de la 2.0.17 (lineas de guia siempre verticales), layoutLabelsX()
eliminada del todo. (2) arreglada de verdad la prorroga estimada
desaparecida en vistas "Proximos 3 meses"/"Personalizado" -- bug real que
el usuario ya habia reportado antes de la 2.0.17 y que esa version no
dejo bien resuelto: el guard exigia que tentativeEnd cayera COMPLETAMENTE
dentro de la ventana visible, pero esa fecha suele estar meses/anos por
delante de una ventana de pocos meses, asi que en uso real casi nunca se
cumplia (aunque si se cumplia en los datos sinteticos usados para
"probar" el fix de 2.0.17, sesgados a proposito); fix real: el guard pasa
a ser tentativeEnd >= start (ya no exige <= end) -- pctOf() ya clampea a
[0,100], asi que si la fecha cae mas alla del borde visible, el marcador
se dibuja "recortado" en ese borde (circulo + etiqueta con flecha "->" +
fecha real sin recortar) en vez de desaparecer. (3) Partes mensuales:
Nombre/Proyecto(s)/Estado quedaban a distinta altura dentro de la misma
fila (efecto "escalera") -- causa real: la celda de Nombre reutilizaba
.name-cell (pensada para la tabla de Equipo, que apila nombre+DNI+chips y
por eso necesita display:flex/column), pero en Partes esa celda solo
tiene el nombre y el flex hacia que su texto quedara pegado arriba
mientras las demas columnas (celdas normales) se centran verticalmente;
fix: `#partes-table .name-cell{ display:table-cell; }`, override
localizado que no toca la tabla de Equipo. Tambien se aclaro al usuario
(sin cambio de codigo) que una captura del "onboarding-gate" que le
llego no es de una version HTML antigua -- es la funcionalidad actual,
disparada por un proyecto de pruebas sintetico reutilizado en esta sesion
cuyo nombre nunca se personalizo de verdad. Probado con datos sinteticos:
(1) capturas del SVG confirmando lineas rectas de nuevo; (2) "Proximos 3
meses" y "Personalizado" (ventana estrecha lejos de ambas fechas)
muestran el marcador recortado en el borde derecho (coordenadas SVG
confirmadas, cx=970 exacto), "Todo" sin cambios; (3) captura confirmando
las 4 columnas alineadas en la misma linea horizontal en filas de
distinta altura (con y sin timestamp bajo los botones de Estado).
Entregado como parche app.asar comprimido en zip.

La 2.0.20 corrige 3 fallos reales que el usuario senalo sobre la 2.0.19,
verificados con evidencia dura ANTES de entregar (pedido explicito:
"analiza todo que ya esta bien !! antes de entregarlo analiza!"): (1) en
la via de despliegue faltaba la linea discontinua ambar ("- - - -") que
conecta FIN ESTIMADO con la prorroga estimada -- la 2.0.19 solo arreglo
que el MARCADOR se viera recortado en el borde, pero la linea que lo
conecta seguia exigiendo que FIN ESTIMADO tambien cayera dentro de la
ventana visible; en el caso real del usuario (viendo "Proximos 3 meses"
con FIN ESTIMADO ya pasado antes del arranque de esa ventana) la linea
desaparecia del todo dejando el marcador flotando solo; fix:
segStartDate = realServiceEnd > start ? realServiceEnd : start, la linea
se recorta al borde izquierdo en vez de omitirse. (2) en Partes mensuales
el campo "Motivo" quedaba mas abajo que los botones de Estado de su
misma fila -- causa real: vertical-align:middle centra cada celda en el
alto TOTAL de la fila, y la celda de Estado (2 lineas: botones + fecha)
es mas alta que una celda de 1 linea como Nota, asi que el centrado la
dejaba por debajo de los botones; fix: `#partes-table td{
vertical-align:top; }`, las 4 columnas se alinean arriba en vez de
centrarse. (3) los iconos del dialogo de "Aplicar parche" (2.0.18) se
veian mal ("espantoso", literal) -- generados a 128px sin supersampling,
bordes con dientes de sierra; regenerados a 8x supersampling (2048px
reducido a 256px con LANCZOS) con sombra y brillo sutil para dar volumen.
Probado con evidencia dura: (1) captura confirmando la linea discontinua
cruzando toda la ventana "Proximos 3 meses" hasta el marcador recortado,
"Todo" sin cambios; (2) getBoundingClientRect() del nombre, primer boton
de Estado y campo de Nota en la misma fila dando el mismo top exacto
(476.5px); (3) capturas X11 reales de ambos iconos dentro de un dialogo
nativo real confirmando bordes limpios, muy por encima de la version
anterior. Entregado como parche app.asar comprimido en zip.

La 2.0.21 corrige 3 fallos reales que el usuario senalo sobre la 2.0.20,
cada uno reproducido en la app REAL (Xvfb+CDP, datos sinteticos) antes de
tocar codigo, no solo razonado: (1) en Partes mensuales el alto de fila
variaba segun hubiera fecha de ultima marca o no -- causa real: el <div>
de fecha/hora solo se renderizaba si existia entry.updatedAt, asi que una
fila "Pendiente" nunca tocada no dibujaba esa linea y quedaba mas baja
(44.5px medidos vs 64.75px de las demas, con 24 filas sinteticas); fix: el
<div> siempre se renderiza (reserva el hueco), se oculta con
visibility:hidden si no hay fecha -- mismo truco que ya usa el campo Nota.
(2) la fila seguia cambiando de posicion al marcar un estado, pese a que
la 2.0.18 ya habia quitado el reordenamiento automatico por rank -- causa
real: si el usuario ordena la tabla por la columna "Estado", CADA render
(incluido el que dispara marcar una fila) recalculaba el sort entero, y
como el campo de orden es el mismo que acaba de cambiar, la fila saltaba
de grupo sola; fix: ui.partesOrder congela el orden de ids mostrado, solo
se recalcula de verdad en 4 puntos que cuentan como "el usuario ordena"
(pinchar cabecera, cambiar de mes, boton "Mes actual", entrar a la vista)
-- marcar una fila ya no es uno de ellos. (3) la via de despliegue
pintaba una linea azul (cyan) llenando TODA la ventana "Ultimos 3 meses"
-- causa real: esa linea de "progreso transcurrido" se calcula con
todayPct = pctOf(today, start, end) usando los limites de la VENTANA
visible, no del servicio real; en "Ultimos 3 meses" el limite derecho de
la ventana ES hoy, asi que todayPct sale 100% y la linea ocupa el ancho
completo; fix: esa linea cyan ahora solo se dibuja en la vista "Todo"
(!isWindowed), se omite en cualquier vista con ventana. Probado con
evidencia dura: (1) getBoundingClientRect().height de 24 filas sinteticas
antes/despues del fix (44.5px -> 64.75px uniforme); (2) array completo de
ids mostrados + getBoundingClientRect().top de una fila antes/despues de
marcarla con la tabla ordenada por Estado, identicos en ambos casos
(antes del fix la fila saltaba de la posicion 7 a la 22); (3) capturas X11
reales (Page.captureScreenshot de CDP se colgo contra esa ventana en
concreto sin causa clara, se uso import -window de ImageMagick en su
lugar) en las 3 vistas de la via de despliegue -- "Ultimos/Proximos 3
meses" sin linea azul, "Todo" sin cambios respecto a como estaba.
Entregado como parche app.asar comprimido en zip.

La 2.0.22 corrige 2 fallos que el usuario senalo sobre la 2.0.21: (1) el
check verde del dialogo "Aplicar parche" seguia viendose mal -- segunda
vez que se reporta (2.0.18 bastos sin supersampling, 2.0.20 regenerados
con 8x supersampling pero seguian mal EN EL DIALOGO real); causa real
distinta a la de 2.0.20: el PNG de origen si era nitido, el problema es
que se pasaba un unico PNG grande de 256x256 como icon y es WINDOWS quien
lo reescala en tiempo real al tamano real del dialogo (ronda 32px
logicos) con un filtro sin calidad; fix: scripts/generate_patch_icons.py
genera 11 tamanos exactos (32 a 256px) reducidos por separado con LANCZOS
desde el master de alta resolucion, guardados en assets/patch-icons/, y
main.js construye un nativeImage con las 11 como representations
(buildPatchIcon(), scaleFactor:size/32) en vez de pasar una ruta -- mismo
mecanismo que un .ico multi-resolucion, Windows elige el tamano exacto
sin reescalar nada el mismo. Probado con matiz honesto: no hay Windows
real disponible en este entorno; verificado con un dialogo GTK real bajo
Linux (mismo dialog.showMessageBox, mismo nativeImage multi-resolucion),
captura X11 ampliada 4x a nivel de pixel confirmando bordes con
anti-aliasing suave, no a bloques -- confirma que el mecanismo funciona,
NO confirma el resultado exacto en el TaskDialog real de Windows con su
DPI, que sigue sin poder probarse aqui. (2) en Partes mensuales el campo
"Motivo, opcional..." empujaba el resto de la fila al marcar Incidencia
-- causa real: el input oculto (ancho casi cero) pasaba a width:100% de
su columna SIN limite maximo al hacerse visible, reclamando todo el
espacio que la tabla pudiera darle; fix: .partes-nota{ max-width:170px }
anadido, ya no reclama espacio de mas. Probado con evidencia dura:
getBoundingClientRect() de las columnas Nombre y Estado de una fila
antes/despues de marcar Incidencia con la ventana en ancho realista (no
maximizada) -- identicos en ambos casos; simulado tambien el CSS anterior
sin max-width con una regla temporal por JS para confirmar que el input
salia mas ancho sin el fix (192px vs 170px). Entregado como parche
app.asar comprimido en zip.

La 2.0.23 corrige que los Riesgos se "desajustaban" al marcar materializado
o cerrado (reportado con captura) -- eran dos causas distintas mezcladas
en la misma imagen, reproducidas primero con los mismos textos de riesgo
del usuario antes de tocar nada: (1) la fila materializado quedaba mas
alta de lo debido -- .risk-row.materialized sumaba su propio padding
vertical (6px arriba/abajo) POR ENCIMA del que ya pone .risk-item (8px
arriba/abajo), 12px de mas que rompian el ritmo vertical de la lista; fix:
margin:-8px -8px; padding:8px 8px (antes margin:0 -8px; padding:6px 8px)
-- el fondo rojo ahora se come el hueco que .risk-item ya reservaba en vez
de sumar uno nuevo, altura identica a una fila normal. (2) la flecha y el
titulo arrancaban en una X distinta segun el estado -- esto explicaba que
"cerrado" (sin fondo de color) tambien se viera desajustado; causa real:
.risk-status-btn sin ancho fijo, "EN SEGUIMIENTO" (14 caracteres) mucho
mas largo que "CERRADO" (7), desplazando todo lo demas de la fila un
numero distinto de px segun el estado; fix: min-width:98px; text-align:
center anadido a .risk-status-btn, los 3 estados reservan el mismo ancho.
Se investigo tambien si cambiar el estado REORDENA la lista (el usuario
dijo "cambian de posicion") -- no, el orden es por criticidad p*i y
status no la toca; lo que parecia "cambio de posicion" era el salto
visual de la causa (1). Probado con evidencia dura: getBoundingClientRect()
de los mismos 4 riesgos de la captura del usuario -- altura de fila
antes/despues del fix de padding, y posicion X de la flecha en las 4
filas (antes: 120/154/160/160px segun estado: despues 162px en las 4,
exacto); confirmado tambien que cambiar el estado no reordena el array
mostrado. Entregado como parche app.asar comprimido en zip.

La 2.0.24 corrige que en Partes mensuales el campo "Motivo, opcional..."
seguia empujando el resto de la fila hacia la izquierda al marcar
Incidencia, pese al max-width:170px de la 2.0.22 -- el usuario dio la
instruccion de arreglo directamente: "deja el espacio del campo
reservado para que no lo empuje mas". Causa real: el estilo inline de
renderPartesTable() colapsaba el input a 1px de ancho (sin padding ni
borde) cuando el estado no era Incidencia, y volvia a su CSS normal
(hasta 170px) cuando si lo era -- el max-width de la 2.0.22 solo limitaba
CUANTO podia crecer, no evitaba el SALTO de 1px a 170px, que era lo que
realmente empujaba el resto de la fila. Fix: el input ahora reserva
SIEMPRE su ancho completo (~170px) y solo alterna visibility:hidden,
igual que ya hace desde la 2.0.21 el div de fecha bajo los botones de
Estado (tsHtml), que tuvo el mismo problema en su momento. Se comprobo
explicitamente que esto no reintroduce el bug antiguo (v2.0.16->v2.0.17)
de "No aplica" saltando a una segunda linea cuando la columna Estado se
queda sin sitio: con la ventana de la app a 900px de ancho y 24 personas
activas, los 4 botones de Estado midieron el mismo top (misma linea) en
todas las filas, incluida una marcada "No aplica", y la altura de fila
se mantuvo uniforme (64.75px) en todas -- el min-width:300px de
.partes-estado-cell (ya anadido en aquel arreglo) sigue siendo proteccion
suficiente. Probado con evidencia dura: getBoundingClientRect() de las
columnas Estado (izq. 274.36px) y Nota (izq. 630.47px) en 6 filas antes y
despues de marcar una de ellas como Incidencia -- identico en ambos
casos, ni un pixel de diferencia; ancho del input de Nota medido en
170px tanto oculto como visible (antes saltaba de 1px a 170px). Capturas
X11 a 900px de ancho confirman visualmente las columnas alineadas con y
sin Incidencia marcada. Entregado como parche app.asar comprimido en zip.

La 2.0.25 corrige que la tarjeta de un proyecto en la pantalla principal
(launcher) no se refrescaba sola tras completar una entrevista pendiente
en la ventana de Evaluacion de Candidatos -- el usuario pregunto si tener
que cerrar la app entera para que desapareciera el badge "N entrevista(s)
pendiente(s)" era el comportamiento esperado. Diagnostico: el conteo se
recalcula en fresco en cada llamada a projects:list (sin cache), pero
candidateEval:save (el guardado de esa ventana, separada del dashboard
del proyecto) nunca avisaba al launcher con el IPC projects:changed que
si usan backup:save y el borrado de proyecto -- el dato en disco/BD
quedaba correcto al guardar, pero el launcher no se enteraba de que debia
volver a pedirlo hasta cerrar/reabrir la app entera. Reproducido en real
ANTES del fix: tras completar una evaluacion pendiente, projects:list ya
devolvia pendingInterviewsCount:0 por IPC, pero el badge en pantalla
seguia mostrando la entrevista vieja sin refrescarse. Fix: candidateEval:
save manda ahora el mismo projects:changed que ya usan los otros dos
puntos, justo tras guardar con exito. Probado tras el arreglo (reinicio
de la app, cambio en el proceso principal): completando la ultima
evaluacion pendiente de otro proyecto de prueba, el badge desaparecio de
la tarjeta sin cerrar ni recargar ninguna ventana. Entregado como parche
app.asar comprimido en zip.

La 2.0.26 es la FASE 1 de 5 de una mejora mas grande: el usuario pregunto
por que la app "es HTML" (analisis largo Electron vs Tauri vs nativo,
sin tocar codigo, concluyendo que el motor no es lo que hace que una app
"se sienta pro" -- eso es diseno/pulido) y luego señalo que la app de un
companero "se ve mas de Windows, menos web". Se audito el codigo a fondo
(subagente de solo lectura sobre main.js y las 9 plantillas) y se
encontraron 9 hallazgos priorizados; el usuario eligio entregarlos en 5
fases por version en vez de todo de golpe. Fase 1 (esta entrega), cuatro
cambios: (1) fuentes Inter/JetBrains Mono auto-hospedadas localmente
(vendor/fonts/fonts.css, via @fontsource de npm ya que fonts.gstatic.com
no era alcanzable desde este entorno) en vez de cargarse en vivo desde
fonts.googleapis.com en cada apertura de dashboard/directorio -- el tell
mas literal de "esto es una web" en una app que se vende como todo en
local; de paso se añadio el <link> que preparacion-reunion nunca tuvo
(Inter estaba declarada en su CSS pero jamas cargaba). Tuvo que
extenderse fixVendorScriptPaths() (el mismo mecanismo que ya arregla las
rutas de xlsx/pptx en la copia horneada de cada proyecto) para que el
nuevo <link> tambien resolviera bien fuera de la carpeta de la app. (2)
scrollbar propia en las 7 ventanas de la app (antes 0 ocurrencias de
::-webkit-scrollbar en cualquiera). (3) minWidth/minHeight en las 4
ventanas redimensionables. (4) persistencia de tamaño/posicion de
ventana entre sesiones (restoreWindowBounds/persistWindowBoundsOnClose,
guardado en app_meta por ROL de ventana no por proyecto, valida que el
rectangulo siga cayendo en algun monitor conectado, no guarda si esta
maximizada/minimizada/fullscreen). Probado con evidencia dura: fuentes
confirmadas como loaded y cero referencias a googleapis/gstatic en las 5
ventanas abiertas durante la prueba; scrollbar confirmado por CSS y
visualmente en una lista real de 24 personas; bounds verificado de
punta a punta a traves de la propia app (redimensionar+mover+cerrar+
reabrir, con los valores exactos confirmados en app_meta). Unico punto
no verificable en este sandbox: el clamping real de minWidth al
arrastrar el borde con el raton, por falta de gestor de ventanas real en
este entorno Linux (misma limitacion ya conocida que Wine/SmartScreen).
Entregado como parche app.asar comprimido en zip. Quedan pendientes las
fases 2 (tema oscuro unificado en Evaluacion de Candidatos), 3
(transiciones/motion), 4 (atajos de teclado + limpieza de un archivo
plantilla_directorio.html huerfano en la raiz del repo) y 5 (los 39
dialogos nativos de Windows -> modales propios, la mas cara).

La 2.0.27 es la FASE 2 de 5: el usuario pidio "la fase 2 me gusta pero
tambien crea el tema para aplicar la evaluacion de candidatos a todos o es
mucho lio?" -- la Fase 2 original era solo tema oscuro unificado en
Evaluacion de Candidatos. Al investigar salio a la luz algo no
documentado hasta entonces: Dashboard/Directorio YA tenian un selector de
tema completo (THEMES/applyTheme, 4 temas: Medianoche/Nube/Cielo/Niebla)
pero era un ajuste POR PROYECTO (state.theme en la particion de storage de
cada proyecto), y las otras 5 ventanas no tenian tema ninguno. Se le
presento esto al usuario con una propuesta ampliada (AskUserQuestion):
tema GLOBAL (un solo ajuste para toda la app) + un 5o tema nuevo basado en
la paleta que ya tenia Evaluacion de Candidatos, aplicado a las 7
ventanas. Confirmo la opcion recomendada. Arquitectura: THEMES/applyTheme
se sacaron a vendor/theme.js (antes duplicados palabra por palabra en
dashboard/directorio) -- mismo patron que vendor/fonts/fonts.css de la
2.0.26, incluida la extension de fixVendorScriptPaths() para que la copia
horneada de cada proyecto resuelva bien la ruta. Evaluacion de Candidatos
usa nombres de variable de color propios (--navy/--bg-page/--text/etc,
distintos de --bg/--cyan/--ink del resto) -- en vez de reescribir su CSS,
cada tema en vendor/theme.js lleva TAMBIEN esos 9 valores propios
(derivados a mano por tema, salvo el 5o "Marfil" que es su paleta original
exacta) y applyTheme() los aplica todos via document.documentElement.style
(mas prioridad que el :root de la hoja de estilos, asi que no hizo falta
tocar ni una regla CSS de esa plantilla). Guardado global: getGlobalTheme/
setGlobalTheme en main.js, tabla app_meta (clave app_theme), IPC theme:get/
theme:set expuestos como window.themeAPI en los 4 preloads que cubren las
7 ventanas; setGlobalTheme difunde el cambio a
BrowserWindow.getAllWindows() (no hizo falta enumerar cada variable de
ventana rastreada). Selector nuevo: boton "Tema visual..." en el menu
Configuracion del launcher (unico sitio, panel HTML propio con 5 muestras
generadas desde THEMES/THEME_ORDER, no en cada proyecto como antes) -- el
panel "Apariencia" de Dashboard/Directorio se quedo solo con el logo
corporativo (eso si sigue siendo por proyecto) y un aviso que remite a
Configuracion. Probado con evidencia dura: las 7 ventanas resuelven los
tokens correctamente al arrancar (incluidas las 2 copias horneadas);
cambio de tema en caliente confirmado con 5 ventanas abiertas a la vez
(Proyectos/Dashboard/Directorio/Preparacion de Reunion/Evaluacion de
Candidatos), las 5 cambiaron de color sin recargar ni cerrar nada, en 2
cambios de tema distintos; Restaurar backup y Seguridad abren ya con el
tema global aplicado; persistencia real confirmada matando el proceso de
Electron entero y relanzandolo (no solo releyendo en el mismo proceso) --
el tema elegido antes de matar el proceso seguia aplicado al reabrir;
capturas X11 reales del panel de temas y de la app en Marfil/Medianoche
sin texto ilegible ni contraste roto; sin errores de JS propios de la app
en ninguna ventana durante las pruebas. Unico punto no verificado a fondo:
la armonia visual fina de Evaluacion de Candidatos bajo los 4 temas que no
son Marfil -- se probo que FUNCIONA (todo se resuelve, nada ilegible) pero
no se revisaron a mano las ~20 combinaciones posibles para pulir remates
esteticos finos. Entregado como parche app.asar comprimido en zip. Quedan
pendientes las fases 3 (transiciones/motion), 4 (atajos de teclado +
limpieza de plantilla_directorio.html huerfano) y 5 (dialogos nativos ->
modales propios).

La 2.0.28 es un arreglo rapido pedido tras probar la 2.0.27: "el tema
visual de evaluacion de candidatos dejale como estaba que queda horroroso
con el oscuro que tengo, me gustaba mucho mas antes". No era pedir tocar
el sistema de temas en si (las otras 6 ventanas siguen igual) -- solo que
Evaluacion de Candidatos deje de cambiar de color segun el ajuste global.
Cambio, solo en plantilla_evaluacion_candidatos.html: se quito el <script
src="../vendor/theme.js"> y la llamada a initGlobalTheme() que se habian
anadido en la 2.0.27 -- no se toco ni una linea de su CSS ni de sus
valores de color propios. Al no cargar vendor/theme.js, esta ventana ya no
tiene forma de recibir ni el tema inicial ni los avisos theme:changed en
caliente -- vuelve a comportarse exactamente como antes de la 2.0.27. La
paleta en si sigue disponible como el tema "Marfil" para las otras 6
ventanas (eso no se toco). Probado con evidencia dura: con el tema global
en Medianoche, Evaluacion de Candidatos sigue mostrando --navy:#1D4ED8/
--bg-page:#F1F5F9 (sus valores originales) mientras la ventana del
proyecto abierta a la vez SI cambio a los colores de Medianoche; cambio de
tema global otra vez con Evaluacion de Candidatos abierta: no reacciono y
no dio error de JS; typeof THEMES ahi da undefined, confirma que ya no
carga vendor/theme.js en absoluto. Entregado como parche app.asar
comprimido en zip.

La 2.0.29 es la FASE 3 de 5 (transiciones y movimiento), elegida junto
con la fase 4 para la misma sesion, dejando la fase 5 (39 dialogos
nativos -> modales) aparte por ser la mas cara. Nuevo archivo compartido
vendor/motion.css cargado por <link> en las 7 ventanas (mismo patron que
vendor/theme.js), fixVendorScriptPaths() en main.js extendido para
resolver su ruta en las copias horneadas por proyecto. Anade: entrada
con fundido+escala al pintarse cada ventana; microinteraccion de hover
en .btn/.card con transicion; fundido de color en el cambio de tema
global (fase 2) para el resto de contenedores; animacion app-tab-in
reutilizable para pestanas/vistas dentro de una ventana (los 3 tabs de
Evaluacion de Candidatos, el toggle Directorio/Partes mensuales),
apoyada en que una animacion CSS no corre en display:none y se reinicia
sola al volver a display:block, sin JS nuevo; clase .motion-flash +
truco de reflow (remove/void offsetWidth/add) para que los avisos
flotantes de Dashboard/Directorio (showIOFeedback) reinicien su
animacion aunque el aviso anterior siguiera visible; bloque
prefers-reduced-motion:reduce con !important que anula toda
animacion/transicion si el sistema operativo lo pide. Evaluacion de
Candidatos mantiene su paleta fija (2.0.28) pero si recibe
vendor/motion.css (el movimiento es independiente del color); su .toast
se retoco para transicion de opacidad+posicion.

Dos bugs reales de cascada CSS encontrados y corregidos con
getComputedStyle (no a ojo): transition es shorthand, dos reglas de
igual especificidad sobre el mismo selector no se combinan, gana entera
la que va despues en la cascada. Paso dentro del propio motion.css (una
lista amplia de selectores al final pisaba la .btn declarada antes) y en
launcher/index.html (su propia regla .card{transition:opacity,
box-shadow} preexistente, en su <style> propio que carga despues del
<link> a motion.css, pisaba el transform del hover). Arreglo en ambos
casos: consolidar todas las propiedades necesarias en una sola
declaracion, en el archivo que gana la cascada. Se repaso a mano (grep)
el resto de transiciones preexistentes en las 7 plantillas para
descartar una tercera colision -- la duda en preparacion-reunion
(.dropzone) se confirmo sin relacion con la lista amplia de
motion.css.

Probado con Xvfb+CDP sobre un proyecto real ya existente (no ventana en
blanco): launcher (.card con transform incluido, .btn con las 7
propiedades, body con animation-name:app-window-in), dashboard
(showIOFeedback invocado de verdad, motion-flash + app-feedback-in
aplicados), directorio (ambas vistas con app-tab-in, showIOFeedback
verificado igual), evaluacion de candidatos (theme.js sigue sin
cargarse, cambio real de pestana confirma el reinicio de animacion via
display:none->block, .toast con la transicion esperada), preparacion de
reunion (motion.css cargado, fundido de entrada; .dropzone no estaba en
el DOM en el estado probado, sin riesgo de regresion porque no comparte
selector). Sin errores de JS en consola en las 5 ventanas. Confirmado en
el app.asar compilado via asar extract + grep. Arranque bajo Wine sin
errores propios de la app. NO probado: aspecto visual en Windows real,
prefers-reduced-motion activado en vivo (sandbox no lo permite
facilmente). Entregado como parche app.asar comprimido en zip.

La 2.0.30 es la FASE 4 de 5 (atajos de teclado + limpieza), la segunda de
las dos fases elegidas para esta sesion junto con la 2.0.29 (queda la
fase 5 -- 39 dialogos nativos a modales -- aparte, para otra sesion, la
mas cara con diferencia). Limpieza: se elimino plantilla_directorio.html
suelto en la raiz (1656 lineas), confirmado de nuevo con grep en todo el
codigo y en package.json/build.files que nada lo referenciaba antes de
borrarlo -- residuo de una prueba anterior, la copia real siempre fue
directorio/plantilla_directorio.html.

Atajos de teclado: hallazgo de partida -- las 7 ventanas son frame:false
(sin marco nativo), asi que los accelerator de un Menu nativo
(Menu.buildFromTemplate/win.setMenu) NO llegan de forma fiable, ver el
comentario ya existente junto al Ctrl+N del launcher ("ya no llega via
acelerador de un Menu nativo -- se reimplementa aqui a mano"). Los
accelerator que quedan en buildLauncherMenu/buildProjectMenu (main.js)
son vestigiales; el mecanismo real es un listener document.keydown en
cada ventana, mismo patron que ya usaba Ctrl+N. Anadido siguiendo ese
mismo patron: Ctrl+W (cerrar ventana) en las 7 ventanas via
window.winControls.close() (misma llamada que ya usaba el boton "X" de
cada barra de titulo propia); Ctrl+S (Guardar backup ahora) en Panorama
del proyecto y Directorio de Talento, reutilizando la accion de menu
proyecto-backup-ahora ya existente sin tocar maybeBackup() ni su
deduplicado; Ctrl+1/Ctrl+2 en Directorio de Talento para cambiar entre
vista Directorio y Partes mensuales (Ctrl+2 reutiliza la accion de menu
partes-mensuales, Ctrl+1 reproduce el boton "Volver al Directorio");
Ctrl+1/2/3 en Evaluacion de Candidatos para cambiar de pestana (esta
ventana nunca tuvo menu ni atajos -- listener nuevo desde cero, dispara
.click() sobre el boton de pestana correspondiente, mismo mecanismo que
ya usaba el propio codigo en otros dos sitios del archivo); Escape cierra
"Restaurar un backup concreto" (backup-picker), que no tenia ningun
atajo antes, mismo criterio que security-window (que ya usaba Escape).
Deliberadamente NO se tocaron Deshacer/Rehacer/Cortar/Copiar/Pegar/
Seleccionar todo -- ya funcionan solos en campos de texto por
comportamiento nativo de Chromium, anadir un atajo explicito a nivel de
document podia interferir sin necesidad.

Probado con Xvfb+CDP, eventos de teclado sinteticos reales despachados
sobre document (no solo revision de codigo): Ctrl+W confirmado en
Preparacion de Reunion y Evaluacion de Candidatos (la ventana desaparecio
de verdad de la lista de destinos CDP) -- NO probado en vivo en el
Lanzador para no cortar la sesion de pruebas (cerrarlo habria cerrado
toda la app al ser la unica ventana abierta en ese momento), mismo codigo
exacto que en las 4 ventanas si probadas. Ctrl+S confirmado leyendo
app.log tras despachar el atajo: aparecen entradas motivo=manual en el
momento exacto de cada pulsacion. Ctrl+1/Ctrl+2 en Directorio confirmado
con el DOM (style.display de las dos vistas) en ambas direcciones.
Ctrl+1/2/3 en Evaluacion de Candidatos confirmado con el DOM
(classList.contains('active')) en las tres direcciones. Escape en
backup-picker confirmado, la ventana se cerro de verdad. Sin errores de
JS en consola durante toda la sesion. Confirmado en el app.asar compilado
via asar extract + grep. Arranque bajo Wine sin errores propios de la
app. NO probado: aspecto/comportamiento en Windows real, Ctrl+W del
Lanzador en vivo (ver arriba). Entregado como parche app.asar comprimido
en zip.

La 2.0.31 es la FASE 5a+5b de 5 (33 de 57 dialogos nativos -> modal
propio), primera mitad de la fase que quedo aparte en la 2.0.30 por ser
la mas cara. Inventario hecho con un subagente de solo lectura: 19
confirm()/alert() de renderer + 37 dialog.* de main.js (6 inconvertibles
antes de que exista ventana, 4 selectores nativos de archivo/carpeta que
Electron obliga a dejar nativos). El usuario eligio explicitamente con
AskUserQuestion: 5a+5b (renderer + los main.js simples) juntas aqui, 5c
(los 17 sitios encadenados de main.js) aparte para otra sesion, y los 10
dialogos previos a que exista ventana con infraestructura de modal se
dejan nativos para siempre ("Dejarlos nativos", tras aclarar que es la
ventana de "splash").

Componente nuevo vendor/modal.js (mismo patron de distribucion que
theme.js/motion.css): window.psConfirm(mensaje,opts)->Promise<boolean> y
window.psAlert(mensaje,opts)->Promise<void>, DOM construido en tiempo de
ejecucion, usa las variables CSS de vendor/theme.js (se adapta solo a los
5 temas), clases propias ps-modal-* para no chocar con el modal-backdrop/
modal-box distinto que ya tenia cada ventana. psConfirm enfoca por
defecto el boton Cancelar (no el de confirmar), danger:true pinta el
boton de confirmar en rojo, Escape/clic-fuera cancelan siempre. Puente
nuevo en main.js -- modalAlert(win,msg,opts)/modalConfirm(win,msg,opts) --
que usa win.webContents.executeJavaScript() para disparar y esperar el
modal de la propia ventana desde el proceso principal, sin montar un
canal IPC nuevo por sitio.

Convertidos: los 19 de renderer (directorio: eliminar persona + cerrar
ventana; launcher: restaurar/eliminar proyecto + salir app; preparacion
de reunion: eliminar preparacion guardada + 2 avisos de error + empezar
de nuevo; dashboard: olvidar contrasena backup admin + borrar datos del
asistente de primer uso + cadena de 6 avisos de importar backup en ese
asistente + salir del proyecto; backup-picker: restaurar backup elegido).
14 de main.js sin ramas complejas: showErrorCodesDialog/showAboutDialog/
showDiagnosticsDialog/openAppLog/openPatchLog/openDriveSyncGuardLog (6,
informativos); Restaurar-ultimo-backup y Eliminar-proyecto por las DOS
vias (menu nativo buildProjectMenu() Y el handler IPC projectMenu:action,
mismo mensaje/logica -- 4 sitios); aviso de error de exportacion fallida
(will-download) y aviso de "usando datos locales temporalmente" tras
fallo de ubicacion personalizada al arrancar (2 mas). NO tocado a
proposito: 17 sitios encadenados de main.js (changeUserDataLocation/
resetUserDataLocationToDefault/applyAsarPatch, requieren reescribir cada
funcion con await en cada paso, aparte para la 5c); 3 dialogos de arranque
fatal (handleFatalStartupError, antes de que exista ventana); 3 dialogos
con solo la ventana splash visible (decision explicita del usuario,
nativos para siempre); 4 selectores nativos de archivo/carpeta (Electron
no permite sustituirlos). Verificado con grep que quedan exactamente 27
dialog.* reales en main.js (3+3+17+4 del inventario).

Probado con Xvfb+CDP, clics reales por la ruta real de la interfaz: los 6
dialogos informativos de main.js via clic real en el menu Configuracion
del launcher (openAppLog solo en su rama "archivo encontrado" -- la rama
convertida "no encontrado" no se disparo en vivo por tener ya un log real
de tanto probar en la sesion, verificada por simetria de codigo con
openPatchLog/openDriveSyncGuardLog que si se probaron en esa rama).
Restaurar-ultimo-backup/Eliminar-proyecto del dashboard via el menu
propio HTML (la ruta real -- clic en "Proyecto" -> boton): texto y
estilo (rojo en Eliminar) correctos, cancelado sin tocar datos; la via
del menu nativo de Electron NO se probo con clic real (mismo motivo que
en la 2.0.30: frame:false, el menu nativo no se muestra de forma fiable),
verificado que el codigo es identico caracter a caracter entre las dos
vias. Borrar-todos-los-datos y las 2 primeras alertas de importacion
(extension invalida, JSON invalido) del asistente del dashboard:
correctas; las 2 ramas restantes de ese asistente (contrasena incorrecta,
forma no reconocida) y su aviso fatal no se dispararon en vivo, mismo
psAlert() ya probado dos veces ahi. Eliminar-persona del directorio:
correcto (rojo), cancelado, confirmado que la persona seguia en la lista
(24 antes y despues). Empezar-nueva-preparacion y Eliminar-preparacion-
guardada (con su aviso de error dinamico real, id inexistente) en
Preparacion de Reunion: ambos correctos. Sin errores de JS en consola en
toda la sesion. Confirmado en el app.asar compilado via asar extract +
grep (vendor/modal.js, modalAlert/modalConfirm, las 5 referencias en
plantillas). Arranque bajo Wine sin errores propios de la app. NO probado
con clic real (razonado por simetria de codigo, misma psConfirm() ya
probada en otros 9 sitios): boton "Salir" con cambios sin guardar en
dashboard/directorio (la comprobacion vive en una funcion interna no
accesible desde fuera); Restaurar-backup-elegido del selector de backups
(mismo problema de cierre interno, y el proyecto de pruebas no tenia
ningun backup real). Entregado como parche app.asar comprimido en zip.

La 2.0.32 responde a feedback tras la 2.0.31: apertura/cierre de ventana
"brusco" (pide que la ventana de proyecto "salga de la tarjeta" al abrir
y algo similar al cerrar), apertura en ventana maximizada, parpadeo al
arrastrar tarjetas del lanzador cuando se pisan dos, y alinear los
botones Guardar/Salir con el estilo "profesional" del lanzador. Causa
raiz encontrada del corte seco: ya existia una animacion CSS
(app-window-in en vendor/motion.css) pero nunca se veia -- Electron crea
la ventana con show:false y esa animacion arrancaba y terminaba entera
durante la fase oculta, antes de win.show(). Componente nuevo
vendor/entrance.js (mismo patron theme.js/motion.css/modal.js): se
engancha a document.visibilitychange (el evento real que marca oculta->
visible en Electron) en vez de una animacion CSS declarativa. Al abrir
desde una tarjeta del lanzador, el <body> nace con transform
translate()/scale() apuntando al rectangulo exacto de esa tarjeta y se
anima a transform:none -- genio "de mentira" con CSS, nunca redimensiona
la ventana real (evitaria reflow visible). Pipeline del origen:
launcher/renderer.js captura getBoundingClientRect() de la tarjeta ->
launcherAPI.openProject(id, cardRect) -> IPC projects:open la convierte a
coordenadas de pantalla con getContentBounds() (try/catch, nunca bloquea
la apertura) -> openProjectWindow(row, originRect) la codifica en
additionalArguments como JSON -> cada preload.js la lee de process.argv
(mismo patron que --panorama-project-id) y la expone como
panoramaBridge.openOriginRect. Cierre: se descarto llamar desde el
preload a una funcion de pagina (contextIsolation aisla los dos
"window", pero el DOM se comparte entre mundos) -- cada preload*.js anade
document.documentElement.classList.add('ps-exit-playing') directamente y
espera ~190ms con su propio setTimeout antes de invocar el cierre real.
Aplicado a closeWindow y winControls.close en las 7 ventanas; quitApp
(salida completa) sin tocar. win.maximize() anadido en openProjectWindow
tras crear el BrowserWindow. Parpadeo de tarjetas: tecnica FLIP en
launcher/renderer.js -- captura rects antes de reordenar el DOM, aplica
el transform inverso sin transicion a las tarjetas desplazadas, lo suelta
un frame despues para que la transicion CSS existente (transform .14s)
las lleve a su sitio nuevo. Unificacion de botones: clase nueva
.btn.header-action (estilo lanzador) SOLO en los botones de cabecera
Guardar/Salir de dashboard y directorio -- el resto de botones (estilo
monoespaciado deliberado) sin tocar. Padding inferior de .card del
lanzador ampliado (Eliminar quedaba muy pegado al borde).

Probado con Xvfb+CDP (con fluxbox como gestor de ventanas minimo para que
win.maximize() funcione en el sandbox -- sin gestor Xvfb ignora la
peticion, no es bug de la app): apertura desde tarjeta con rectangulo de
origen correcto y animacion completa; apertura maximizada confirmada;
cierre del dashboard por el boton "X" de la barra de titulo medido con
precision (polling del listado de targets CDP) en 210ms, coherente con
190ms de animacion + margen -- ni instantaneo ni colgado; boton "Salir"
de cabecera confirmado (mismo closeWindow(), en el proyecto de pruebas
sin cambios sin guardar se salta la confirmacion, comportamiento ya
existente desde 0.1.49); directorio de talento con entrada y cierre
verificados igual (cierre medido en 244ms); preparacion de reunion con
entrada verificada; capturas de pantalla confirman el nuevo estilo de
los botones de cabecera y el espaciado de tarjetas; sin errores nuevos en
app.log durante toda la ronda; confirmado con asar extract + grep que
todos los cambios estan en el app.asar compilado; arranque bajo Wine sin
errores propios de la app (version v2.0.32 correcta en la ventana). NO
probado con clic real (razonado por simetria de codigo, mismo
vendor/entrance.js y closeWithExitAnimation ya probados en dashboard y
directorio): evaluacion de candidatos, selector de backup, ventana de
seguridad, prompt de contrasena; tampoco la rama de psConfirm() del boton
"Salir" con cambios sin guardar de verdad pendientes (mismo motivo que en
2.0.31). Entregado como parche app.asar comprimido en zip.

La 2.0.33 es la FASE 5c, cierra la serie 5a/5b/5c de conversion de
dialogos nativos a modal propio empezada en la 2.0.31: las 3 funciones de
main.js con dialogos ENCADENADOS dejadas aparte en la 2.0.31 por ser las
mas caras -- changeUserDataLocation (Cambiar ubicacion de los datos),
resetUserDataLocationToDefault (Volver a la ubicacion por defecto) y
applyAsarPatch (Aplicar parche, el mismo mecanismo que entrega esta
version). 17 dialogos convertidos (7+3+7), las 3 funciones pasadas a
async, cada showMessageBoxSync/showErrorBox sustituido por await
modalConfirm()/modalAlert() (mismo puente executeJavaScript de la 2.0.31).

Dos decisiones documentadas por cambiar algo del original: (1) el paso
"copiar los datos actuales" de changeUserDataLocation tenia 3 botones a
la vez (Cancelar/No copiar/Copiar todo) en un solo dialogo nativo;
psConfirm solo admite 2 opciones -- descompuesto en DOS preguntas
encadenadas que cubren las mismas 3 salidas (seguir o cancelar todo;
si se sigue, copiar o no). (2) la pregunta "es compartida" tenia
cancelId:1 (Escape = "si, compartida", opcion segura por defecto);
psConfirm siempre trata Escape como cancelar (=no compartida aqui) --
ese caso limite concreto cambia de comportamiento, documentado como
consecuencia conocida del modal propio, no un descuido. Tambien
retirado (codigo muerto): los iconos propios (check verde/triangulo
ambar, PATCH_VALID_ICON_PATH etc., de la 2.0.18/2.0.21) del dialogo de
Aplicar parche -- el modal propio no tiene hueco para icono de imagen,
la señal ✓/✗ sigue en el texto del mensaje. nativeImage se quito del
require de electron al quedar sin uso.

Probado con Xvfb+CDP, selector de carpetas NATIVO real manejado con
xdotool (Ctrl+L para escribir ruta, Enter para confirmar, no atajos que
salten el codigo): changeUserDataLocation completo con carpeta vacia
elegida de verdad -- las 3 preguntas nuevas salieron con texto/botones
correctos, elegido no-copiar + no-compartida, config escrita con
shared:false, la app se reinicio sola con --user-data-dir apuntando a la
carpeta nueva (confirmado en los argv de los procesos hijos), arranco
bien ahi disparando el aviso YA EXISTENTE de "carpeta sin base de datos"
(seguido desde cero, cargo normal). Mismo flujo con carpeta que ya tenia
un panorama.sqlite3 de mentira: salio "la carpeta elegida ya tiene
datos" correcto, cancelado, confirmado que no toco nada.
resetUserDataLocationToDefault: las 2 ramas y ambos botones de la
confirmacion probados -- cancelar no toca nada, confirmar borra la
config Y reinicia la app, confirmado que volvio a la carpeta de datos de
siempre con su sqlite3 original intacto. applyAsarPatch: solo se probo
en vivo la rama "no disponible en desarrollo" (correcta) -- el resto
exige app.isPackaged===true, que en este sandbox no se cumple ni en
Linux dev ni bajo Wine con el win-unpacked compilado (isPackaged lee
false ahi por motivo propio de Wine, mismo tipo de falso negativo ya
documentado para SmartScreen/NSIS bajo Wine, no un bug de la app);
razonado por simetria de codigo, mismo modalConfirm/modalAlert ya
probado de punta a punta en las otras dos funciones. Sin errores nuevos
en app.log durante toda la ronda. Confirmado con asar extract + grep:
las 3 funciones son async, 19 llamadas a modalConfirm/modalAlert
repartidas 8+3+8 (17 dialogos + 2 divisiones), los 4 selectores nativos
de archivo/carpeta siguen sin tocar, solo quedan los 6 dialogos nativos
ya decididos como permanentes. Arranque bajo Wine sin errores propios de
la app, version v2.0.33 correcta en la ventana. Entregado como parche
app.asar comprimido en zip.

La 2.0.34 revierte por completo dos cosas de la 2.0.32 tras feedback del
usuario en Windows real (aqui solo hay Xvfb+CDP+Wine, sin Windows de
verdad): la animacion de entrada/salida de ventana ("milisegundos en
negro y flash, se abre desde abajo, horroroso" al abrir; "eso no es
animacion ni nada" al cerrar) y el movimiento FLIP al arrastrar tarjetas
("funciona peor aun"). vendor/entrance.js se BORRA (no se desactiva); su
script se quita de los 8 templates que lo cargaban; openProjectWindow
pierde el parametro originRect y el IPC projects:open vuelve a su forma
simple sin cardRect; los 5 preload*.js pierden closeWithExitAnimation y
vuelven a invocar cierre directo; launcher/renderer.js pierde la captura
FLIP (firstRects, transform compensado) y el cardRect del boton Abrir,
el reordenamiento vuelve a mover el nodo directamente. Se mantiene sin
tocar lo que el usuario NO reporto como problema: win.maximize() al
abrir, el restyling .btn.header-action, el padding de tarjetas.
Respondida tambien la pregunta "por que quitas los check de aplicar
parche": vendor/modal.js gana una opcion `icon` (glifo/emoji sobre el
titulo) en psConfirm/psAlert, sin volver a generar PNG a mano;
applyAsarPatch la usa (✅ valido, ⚠️ no valido).

Probado con Xvfb+CDP contra la app en marcha (no solo el codigo en
disco): body de una ventana de proyecto recien abierta con opacity:1 y
transform:none desde el primer instante; cierre inmediato (invoke
directo, ~1ms); win.maximize() confirmado con isMaximized(); el
renderer.js que CARGA la ventana del lanzador (via fetch desde dentro de
la propia pagina, no el archivo en disco) confirmado sin firstRects, sin
compensacion de transform, sin cardRect; icono del modal probado en vivo
(psConfirm con icon:'✅', el glifo aparece en el DOM a 30px). Confirmado
con asar extract + grep que vendor/entrance.js no existe en el asar
compilado. Arranque bajo Wine sin errores propios de la app, version
v2.0.34 correcta en la ventana. NO verificable desde aqui: que la
apertura/cierre instantaneos y el arrastre revertido se SIENTAN bien en
un Windows real -- es el comportamiento previo a la 2.0.32, no algo
nuevo, pero el veredicto es del usuario. Respondida tambien la pregunta
de acceso a Windows real: ningun dispositivo estaba vinculado a la
sesion en el momento de responder (comprobado con la herramienta de
estado del dispositivo); se explico como vincularlo desde la app de
escritorio de Claude para trabajar directamente sobre la maquina real
dentro de la misma sesion. Entregado como parche app.asar comprimido en
zip.

La 2.0.35 es la primera version de todo el proyecto probada de verdad
sobre el Windows real del usuario: vinculo su Surface Pro 11 a la sesion
(Cowork -> vincular esta computadora), dio acceso a carpetas concretas y
control de pantalla real. Verificado en vivo que la 2.0.34 abre/cierra
proyectos limpio, sin parpadeo. Un arrastre MANUAL paso a paso (no un
gesto atomico) revelo un bug nuevo nunca visto en Xvfb: al pasar la
tarjeta arrastrada por encima de otra, su texto se veia mezclado e
ilegible con el de la tarjeta de debajo. Causa: sin
dataTransfer.setDragImage() explicito, el navegador genera su propia
miniatura de arrastre capturada a opacidad TOTAL, antes de que la clase
.dragging (opacity:.35) se aplique -- tapaba el texto de debajo. Bug
nativo del navegador desde que existe el arrastre (v0.1.26), no algo
relacionado con el FLIP de la 2.0.32 (ya retirado), simplemente nunca
antes visible sin arrastre real. Arreglo en launcher/renderer.js:
setDragImage a una imagen 1x1 transparente, cero miniatura visible,
mismo patron que Trello/Notion.

Probado de la forma mas fuerte hasta ahora en este proyecto: reproducido
el bug en la 2.0.34 en vivo (capturas reales de Windows). Con el fix
compilado (2.0.35), aplicado el parche usando el propio mecanismo de la
app ("Aplicar parche"), no copiando el asar a mano -- primera vez que esa
ruta de codigo se ejercita con exito en Windows real (antes topaba con
app.isPackaged=false bajo Wine). Hash verificado exacto por la propia
app. El modal con icono de la 2.0.34 confirmado renderizando bien en
Windows real. Repetido el mismo arrastre sobre la 2.0.35 ya aplicada:
tarjeta de debajo legible en todo momento. Re-verificado abrir/cerrar un
proyecto real: sigue abriendo maximizado, cerrando al instante.
device_bash no funciono en esta sesion (error conocido de una
actualizacion de Windows del 8 de septiembre, virtiofs roto) -- no
afecto al trabajo, hecho todo con computer_* y device_stage_files/
device_commit_files/device_list_dir. Entregado como parche app.asar
comprimido en zip; ya aplicado directamente en el Surface Pro 11 del
usuario durante la misma sesion.

La 2.0.36 responde a tres reportes de una sola vez tras usar la 2.0.35 en
Windows real: (1) arrastrar tarjetas -- "si toca la mitad no mueve,
vertical tampoco". Causa en cardToInsertBefore() de launcher/renderer.js:
zona muerta de v0.1.27 del 15% del ANCHO de la tarjeta (~66px con las
tarjetas de 440px del usuario) -- mas de un tercio de la tarjeta sin
decidir nada. Explica los dos sintomas a la vez porque la funcion solo
mira la X respecto al centro de la tarjeta mas cercana (la Y solo elige
"cual es la mas cercana", nunca decide antes/despues) -- un arrastre
vertical mantiene X casi constante, cae siempre dentro de esa franja
muerta horizontal. Arreglo: deadZone pasa de "15% del ancho" a un margen
FIJO de 6px. Verificado con numeros exactos via Xvfb+CDP (antes: no
cambiaba hasta pasar ~66px del centro; despues: cambia ya a los 7px) y
confirmado en vivo en el Surface Pro 11 que el reordenamiento SI se
dispara con movimientos pequenos (antes no pasaba nada) -- aunque mis
propias pruebas de arrastre sintetico dieron resultados a veces confusos
sobre que tarjeta exacta quedaba marcada como "arrastrando" en capturas
intermedias (probable latencia de red entre cada mousemove), asi que no
hubo una demostracion tan limpia paso a paso como la de la 2.0.35; como
efecto colateral, el orden de tarjetas del usuario quedo ligeramente
alterado durante las pruebas (dos proyectos intercambiados, sin perdida
de datos) -- avisado explicitamente en la entrega.
(2) "al abrir proyectos se agranda la informacion" -- intentado capturar
en vivo dos veces, las dos el frame ya estaba asentado (el fenomeno es
mas rapido que el viaje de ida y vuelta de una captura remota), asi que
NO se ha visto reproducirse con evidencia directa. Hipotesis razonada por
codigo: las 9 reglas @font-face en vendor/fonts/fonts.css usaban
font-display:swap (pinta con fuente de reserva y sustituye al cargar la
real -- reflow visible si ocurre despues de win.show() en 'ready-to-show').
Cambiado a font-display:block. Diagnostico razonado, no fix confirmado
viendolo reproducirse y desaparecer.
(3) temas -- "el unico premium es medianoche, los otros un desastre".
Probado en vivo tema por tema: Nube y Cielo sin problemas (lanzador +
proyecto completo). Niebla y Marfil: bug real confirmado -- el aviso
"Servicio finaliza en N dias" de una tarjeta se leia casi ilegible,
amarillo palido sobre fondo claro. Causa: --sem-naranja/--sem-amarillo/
--sem-amarillo-claro vivian hardcodeadas en el :root de launcher/index.html
desde v0.1.26/27/28, FUERA de vendor/theme.js -- applyTheme() nunca las
reasignaba, se quedaban siempre con el tono pensado para el fondo casi
negro de Medianoche (perfecto ahi, ilegible en los 4 temas claros).
Arreglo: las 3 variables pasan a THEMES en vendor/theme.js (una entrada
por tema) y se reasignan en applyTheme(). Medianoche mantiene EXACTAMENTE
los mismos valores de siempre; los 4 temas claros reciben una terna
ambar/naranja oscura con contraste real. Verificado con CDP (el valor
cambia por tema y vuelve exacto en Medianoche) y en vivo en el Surface
Pro 11 (el aviso ya se lee bien bajo Marfil).
Version bump a 2.0.36, rebuild, verificado con asar extract + grep que
los tres fixes estan en el asar compilado, smoke test bajo Wine, entregado
como parche app.asar comprimido en zip con INSTRUCCIONES.txt honesto
(distingue lo verificado de lo razonado en cada uno de los tres puntos),
ya aplicado en el Surface Pro 11 del usuario durante la misma sesion.

La 2.0.37 responde a dos pedidos del mismo mensaje: rediseno "premium" de
los 4 temas claros, y no conformarse con el diagnostico razonado del
"agrandado" -- seguir intentando capturarlo en vivo.
Temas: diagnostico de partida -- los 4 temas claros eran variaciones casi
indistinguibles de un mismo azul-grisaceo desaturado, 2 de ellos (Nube,
Cielo) con tarjetas blancas sobre fondo casi blanco, cero profundidad.
Se aplico a los temas claros el mismo principio de capas que ya usa
Medianoche (fondo oscuro / superficie mas clara): fondo de pagina TINTADO
con el acento propio de cada tema, tarjetas blancas encima. Identidad
nueva por tema -- Nube: azul electrico #2554E8. Cielo: teal #0A7A70
(antes casi el mismo azul palido que Nube). Niebla: indigo/violeta
#5A4FE5 (antes reutilizaba el tono de los otros dos). Marfil: azul marino
#1E3A6E sobre marfil calido #FBF8F0 (antes compartia literalmente la
paleta de Nube). Los --sem-*/--amber (semanticos, no de marca,
introducidos en 2.0.36) se mantienen iguales en los 4 temas claros a
proposito. Medianoche: sin cambios visuales (solo token interno nuevo
cyanInk con su mismo valor de siempre).
Dos bugs encontrados y corregidos con evidencia real durante el diseno:
(1) el --cyan inicial de Cielo y el --amber compartido inicial no
llegaban a contraste AA (4.5:1) en varios pares texto/fondo -- medido con
formula WCAG contra los valores REALMENTE aplicados via CDP, oscurecidos
hasta pasar AA en los 5 temas. (2) tres ventanas (launcher, backup-picker,
security-window) llevaban color de texto de boton FIJO (#06222a) sobre
fondo --cyan, asumiendo que --cyan siempre seria claro -- con los temas
nuevos ese texto casi negro se volvia ilegible sobre acentos medios/
oscuros. Arreglo: token --cyan-ink por tema. password-prompt.html no se
toco (confirmado que no carga theme.js, se pinta siempre igual a
proposito).
Verificado con Xvfb+CDP+capturas X11: las 5 paletas pasan AA en los
pares clave; capturas de la pantalla de Proyectos con los 5 temas
confirman color propio y texto legible en cada uno (con sleep entre
applyTheme y captura -- sin eso, capturar 3 temas seguidos sin pausa
desfasaba cada captura al tema anterior, compositado de Xvfb no llegaba
a tiempo); capturas dentro de un proyecto real (KPIs, estado ejecutivo,
riesgos, skill matrix) con Niebla y Cielo aplicados por la via real de
la app (window.themeAPI.set(), que persiste en app_meta y avisa a las
demas ventanas -- NO applyTheme() directo por consola, que solo cambia
la ventana actual sin persistir, confirmado al ver que un dashboard
recien abierto no heredaba el tema puesto asi en el lanzador). Sin
confirmar: verificacion en vivo en el Surface Pro 11 -- el puente al
dispositivo del usuario no estaba disponible esta sesion.
El "agrandado": mas de 7 capturas encadenadas en 2 rondas, varios
proyectos, disparadas justo tras "Abrir" -- en todas, incluida la
primera de cada rafaga, el frame ya estaba asentado. Conclusion
razonada: la captura remota usada aqui tiene ~1s de latencia minima,
probablemente demasiado lenta para un reflow de pocos cientos de
milisegundos -- limitacion de la herramienta, no evidencia de que el fix
de 2.0.36 funcione o falle para este sintoma. Sigue siendo, para el
"agrandado" en concreto, diagnostico razonado por codigo, nunca
confirmado viendolo pasar. Se pidio al usuario un video/GIF corto grabado
en su propia maquina si le sigue pasando.
Version bump a 2.0.37, rebuild, verificado con asar extract + grep que
las 5 paletas, cyanInk y el fix de contraste estan en el asar compilado,
smoke test bajo Wine (arranca sin excepcion fatal), entregado como
parche app.asar + zip + INSTRUCCIONES.txt honesto (distingue el rediseno
de temas, confirmado visualmente, del "agrandado", sin confirmacion
directa). NO aplicado aun en el Surface Pro 11 -- puente al dispositivo
no disponible esta sesion.

La 2.0.38 encuentra, esta vez con evidencia real (no adivinada), la causa
del "agrandado" al abrir ventanas que en 2.0.36/2.0.37 seguia sin
confirmarse. Causa: openProjectWindow() (compartida por ventanas de
proyecto y Directorio de Talento) construia el BrowserWindow con el
tamano pequeno recordado, llamaba a maximize() y ACTO SEGUIDO a
loadFile() sin esperar la propagacion asincrona del resize del SO -- el
primer layout podia pintarse al tamano pequeno, con un resize tardio
llegando justo despues de show(). El lanzador nunca llamaba a maximize(),
por eso el maximizado por defecto era un pedido nuevo, no el mismo bug.
Verificado con logs temporales [DEBUG38] (bounds en construccion, tras
maximize(), en cada 'resize', en ready-to-show y en show(), con
timestamps): CERO eventos 'resize' entre construccion y carga completa
tras el fix, para ventana de proyecto y para Directorio -- confirmado,
no razonado. Logs retirados del todo antes de compilar (diff contra copia
de respaldo sin diferencias).
Fix: dos funciones nuevas en main.js, workAreaForMaximizedWindow()
(area de trabajo del monitor via screen.getDisplayMatching()/
getPrimaryDisplay()) y normalRectFor() (tamano "normal" al restaurar
manualmente). createLauncherWindow() y openProjectWindow() ahora
construyen el BrowserWindow DIRECTAMENTE a tamano de area de trabajo
completa -- maximize() ya solo sincroniza el estado interno de Electron,
sin resize real pendiente. Efecto colateral cubierto: al crearse ya a
tamano completo, se pierde la referencia implicita de "tamano normal
pre-maximizar" que Windows usaba para restaurar solo -- se anadio un
handler 'unmaximize' en ambas ventanas que aplica el rect de
normalRectFor() (tamano recordado o centrado por defecto).
Limitacion de entorno descubierta esta sesion: Xvfb aqui no tiene gestor
de ventanas -- aunque isMaximized() cambia bien, los eventos nativos
'maximize'/'unmaximize' de Electron no se disparan de forma fiable sin
uno. Se intento verificar el restaurar-a-tamano-recordado via CDP
(toggleMaximize()): isMaximized() paso a false pero ni innerWidth/Height
cambiaron ni el log temporal del handler 'unmaximize' del proceso
principal llego a imprimir nada -- el evento simplemente no se disparo
aqui. Esa parte del fix queda SIN verificar en Xvfb (limitacion del
entorno, no evidencia de fallo) y necesita confirmacion en vivo en el
Surface Pro 11.
Animacion de carga premium (funcionalidad nueva): overlay #boot-loading
pequeno y contenido (icono, barra con barrido animado, "Cargando...") en
dashboard/plantilla_dashboard.html y directorio/plantilla_directorio.html,
visible desde el primer paint, retirado con fundido de 280ms cuando el
contenido real ya renderizo. Deliberadamente limitado a un recuadro
pequeno del DOM (no ventana/body completos) para no repetir el fallo ya
documentado de vendor/entrance.js (animacion de entrada de ventana
completa, anadida en 2.0.32, retirada en 2.0.34 tras verse "un parpadeo
negro y la ventana apareciendo desde abajo" en Windows real -- Xvfb no
detecto ese problema en su momento, paralelismo de cautela con la
limitacion de Xvfb de este mismo parche). Respeta prefers-reduced-motion
via la regla global ya existente en vendor/motion.css. Sin confirmar: el
aspecto visual/timing real del overlay no se ha capturado en ningun
entorno -- solo confirmado por CDP que el elemento se elimina del DOM al
terminar de cargar.
Lanzador maximizado por defecto (funcionalidad nueva): mismo mecanismo
corregido de workAreaForMaximizedWindow() -- confirmado con captura de
pantalla en Xvfb que aparece ya a tamano completo desde el primer
fotograma. La parte de "restaurar manualmente" tiene la misma limitacion
de verificacion que arriba.
Version bump a 2.0.38, rebuild, verificado con asar extract + grep que
workAreaForMaximizedWindow/normalRectFor (10 coincidencias) y el overlay
boot-loading (14/15 coincidencias) estan en el asar compilado, sin
ningun resto de los logs [DEBUG38], smoke test bajo Wine (arranca sin
excepcion fatal), entregado como parche app.asar + zip +
INSTRUCCIONES.txt honesto. NO aplicado aun en el Surface Pro 11 --
puente al dispositivo no disponible al momento de empaquetar esta
entrega.

La 2.0.39 responde a que, con capturas reales del usuario delante (2.0.37
ya aplicado en su Surface Pro 11), los 4 temas claros seguian sin verse
"premium". Causa concreta: cada tema ya tenia su propio color de ACENTO
desde 2.0.37, pero `surface` (el fondo de CADA TARJETA -- .panel, .stat,
tarjetas del lanzador, paneles de Directorio) seguia siendo #FFFFFF puro
en los 4 -- como las tarjetas son ~95% de la superficie visible, el
resultado seguia leyendose "todo blanco" con un acento aislado encima.
Bug real encontrado de paso (no buscado): --green/--red (variables de
TEXTO, distintas de --green-bg/--red-bg) nunca las asignaba applyTheme()
-- se quedaban fijas en el valor de Medianoche (afinado para fondo casi
negro) en los 4 temas claros tambien, dando un verde/rojo lavados sobre
fondo claro.
Diseno: se buscaron referencias de dashboards SaaS premium con tarjetas
de color solido (no blancas) antes de tocar codigo. Patron elegido:
pagina con fondo casi blanco tintado, TARJETA con color solido y claro
del tono del tema, segundo nivel (surface2) mas profundo para KPIs/
inputs, borde con cuerpo real. Paletas generadas programaticamente en
HSL por matiz de cada tema (Nube 221, Cielo 174, Niebla 248, Marfil 42)
e iteradas con script propio de contraste WCAG hasta pasar AA real en
~20 pares por tema: ink/inkSoft/inkFaint contra bg/surface/surface2
(>=4.5:1 / >=3:1 texto tenue), verde/rojo/ambar nuevos contra su chip
(>=4.5:1), texto de boton contra el acento (>=4.5:1), borde de tarjeta
contra la tarjeta bajo el umbral real de WCAG 1.4.11 (>=3:1, componentes
de UI). Ajuste encontrado en el proceso: --cyan sirve de acento (fondo
de boton) Y de color de texto plano sobre la tarjeta en varias plantillas
(p.ej. .ent-tipo-badge) -- con la tarjeta ya mas saturada, el cyan de
Nube/Cielo/Niebla se quedaba corto como texto (~4.0-4.3:1). Se resolvio
oscureciendo un poco el propio cyan de esos 3 temas (Nube L52.7->49.7%,
Cielo L25.9->24.9%, Niebla L60.4->55.4%; Marfil no necesito tocarse, ya
daba 8.81:1) en vez de aclarar la tarjeta -- mantiene identidad, el
acento queda mas rico no diluido, y como boton el contraste con texto
blanco mejora.
Paleta final (bg/surface/surface2/border/cyan): Nube #F0F3FA/#C9D6F2/
#AFC3EE/#346CE5/#184AE5. Cielo #F1F9F8/#CCF0EC/#B2EBE5/#198F83/#0A756C.
Niebla #F2F0F9/#D0CBF1/#B9B1EC/#4F38E0/#4539E2. Marfil #F8F6F1/#EEE4CD/
#E8D9B5/#9C7721/#1E3A6E (sin cambios). --green/--red nuevos compartidos
por los 4 claros: #0F6B31/#B91C1C (>=5.5:1 contra su chip). Medianoche:
green/red anadidos con el MISMO valor ya hardcodeado (#4caf82/#e2596b)
-- cero regresion.
Verificado de verdad: los 20 pares por tema calculados antes de tocar
codigo, RELEIDOS en vivo desde la app corriendo (Xvfb+CDP,
getComputedStyle tras themeAPI.set() + espera de 400ms) para los 5
temas -- coinciden exactamente con lo disenado, Medianoche sale byte a
byte igual que antes. Capturas X11 del lanzador con los 5 temas y de un
proyecto real (KPIs, Estado Ejecutivo) con Niebla/Marfil/Cielo -- cada
tema con su color propio, texto legible, verde/rojo ya no lavados.
Directorio de Talento con Cielo tambien probado, sin regresiones. Smoke
test bajo Wine (arranca con arbol de procesos completo).
Sin confirmar: como se ve en la pantalla real del Surface Pro 11 -- Xvfb
reproduce el motor de render pero no es su maquina; el puente al
dispositivo no estaba disponible al empaquetar esta entrega.
Version bump a 2.0.39, node --check vendor/theme.js, rebuild, verificado
con asar extract + diff contra el codigo fuente que vendor/theme.js
compilado es IDENTICO byte a byte al editado. Entregado como parche
app.asar + zip + INSTRUCCIONES.txt honesto + 3 capturas de muestra.

"""

parts = [HEADER]
for relpath, lang in FILES:
    fullpath = os.path.join(ROOT, relpath)
    with open(fullpath, 'r', encoding='utf-8') as f:
        content = f.read().rstrip('\n')
    parts.append(f"## `{relpath}`\n\n```{lang}\n{content}\n```\n\n")

with open(OUT, 'w', encoding='utf-8') as f:
    f.write(''.join(parts))

print("Escrito:", OUT, "-", os.path.getsize(OUT), "bytes")
