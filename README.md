# Panorama del Servicio — prototipo de app de escritorio

Prototipo funcional (no la skill de Claude, que sigue intacta en tu cuenta) que
demuestra que el dashboard "Panorama del Servicio" puede vivir como una
aplicación de escritorio instalable, con base de datos interna y varios
proyectos dentro de la misma app, en vez de como archivos `.html` sueltos.

## Qué contiene

- `main.js` / `preload.js` / `preload-launcher.js` — la app Electron (proceso
  principal + puentes seguros hacia las ventanas).
- `db.js` — base de datos interna vía `sql.js` (SQLite compilado a
  WebAssembly). Se eligió en vez de un módulo nativo porque no necesita
  compilarse para cada arquitectura/SO destino — funciona igual en desarrollo
  y ya empaquetado.
- `launcher/` — la ventana "un proyecto más" que lista, crea, abre, restaura y
  localiza los backups de cada proyecto.
- `dashboard/plantilla_dashboard.html` — **copia exacta, sin tocar ni una
  línea de su lógica**, de `assets/plantilla_dashboard.html` de la skill
  `dashboard-panorama-servicio`. Solo se cambiaron las dos etiquetas
  `<script src="https://...">` (xlsx.js y pptxgen.js) por copias locales en
  `vendor/`, para que Excel/PowerPoint funcionen sin conexión.
- `vendor/` — `xlsx.full.min.js` y `pptxgen.bundle.js` vendorizados (misma
  librería que ya usaba la skill, solo que ahora vive en el propio paquete en
  vez de bajarse de un CDN).

## Cómo funciona "una app, muchos proyectos"

Cada proyecto que creas desde el launcher recibe:

1. Una fila en la tabla `projects` de `panorama.sqlite3` (nombre, cliente,
   fechas).
2. Su propia **partición de Electron** (almacenamiento completamente aislado
   del resto de proyectos — así, aunque el dashboard internamente use
   `localStorage`, dos proyectos nunca pueden pisarse los datos).
3. La primera vez, se abre la plantilla en blanco y pasas por su propio
   asistente de configuración (el mismo que ya tenía la skill — no se ha
   tocado). En cuanto rellenas nombre + fecha, la app "hornea" automáticamente
   una copia HTML propia de ese proyecto (con su `factory-seed` ya relleno,
   igual que hace la skill al generar un archivo por cliente) en
   `<datos de la app>/projects/<id>/dashboard.html`. Las siguientes veces que
   abras ese proyecto, carga directamente esa copia — no vuelve a pedir el
   asistente.

## Backups

Cada vez que el dashboard guarda algo (detectado por un script propio y
aditivo al final del archivo — no toca ninguna función existente), la app:

- Guarda una copia en la tabla `backups` de la base de datos SQLite.
- Escribe un `.json` con marca de tiempo en `<datos de la
  app>/backups/<id>-<slug>/`.
- Conserva las últimas 15 copias de cada proyecto (purga las más antiguas).

Desde el launcher puedes "Restaurar último backup" (reescribe el
almacenamiento del proyecto con esa copia) o "Ver carpeta de backups" (abre la
carpeta en el explorador de archivos del sistema).

Import/export de JSON, CSV y Excel por bloque (hitos, riesgos, skill matrix,
equipo, cobertura) es la misma funcionalidad que ya traía la plantilla — no se
ha añadido ni quitado nada ahí.

## Menú y navegación (añadido tras la primera prueba)

Cada ventana tiene ahora su propia barra de menú nativa (antes estaba oculta):

- **Launcher** (lista de proyectos): `Archivo` (Nuevo proyecto, Salir),
  `Editar` (deshacer/copiar/pegar estándar), `Configuración` (abrir carpeta de
  datos de la app, Acerca de). También hay un botón **"Salir"** visible junto
  a "+ Nuevo proyecto", para cerrar la app entera sin tener que forzarla.
- **Ventana de un proyecto**: `Archivo` (Nuevo proyecto, **Elegir
  proyecto...** para volver al launcher, Cerrar ventana, Salir de la
  aplicación), `Editar`, y `Proyecto` (Guardar backup ahora, Ver carpeta de
  backups, Restaurar último backup...).

También se desactivó el diálogo nativo "¿Vincular carpeta de backup?" que
mostraba el propio dashboard al configurar un proyecto — es el mecanismo
original de la plantilla (File System Access API del navegador) y quedaba
redundante con el backup automático de la app. Se sigue mostrando con
normalidad si abres `dashboard/plantilla_dashboard.html` suelto, fuera de esta
app (por ejemplo en un navegador).

## Seguridad: cifrado de backups y login (añadido tras la segunda prueba)

Menú **Seguridad**, presente tanto en el launcher como en cada ventana de
proyecto:

- **Activar cifrado de backups...** (cuando está desactivada): pide una
  contraseña nueva. A partir de ese momento, todos los backups de TODOS los
  proyectos se guardan cifrados en disco (AES-256-GCM, clave derivada de la
  contraseña vía scrypt — ver `security.js`). Los backups ya existentes se
  vuelven a escribir cifrados en el momento de activar.
- **Cambiar contraseña...** / **Desactivar cifrado de backups...** (cuando ya
  está activada): piden la contraseña actual; al cambiarla, todos los backups
  se vuelven a cifrar con la clave nueva, y al desactivarla se descifran y
  quedan en claro de nuevo. Un solo backup dañado o ilegible no bloquea la
  operación sobre el resto.
- Si se marca "Recordar en este equipo" (solo si el sistema operativo soporta
  `safeStorage` — en Windows, respaldado por DPAPI), la contraseña se guarda
  cifrada por el propio sistema operativo y la app se desbloquea sola la
  siguiente vez que arranque, sin volver a pedirla.
- **Al arrancar la app**, si la seguridad está activada y no hay contraseña
  recordada (o no se pudo desbloquear con ella), aparece una ventana de login
  antes que el launcher — cancelarla cierra la aplicación entera, para que no
  quede accesible sin contraseña.
- Ni la contraseña ni la clave derivada se guardan nunca en la base de
  datos — solo una sal aleatoria y un verificador (HMAC) que permite
  comprobar si una contraseña tecleada es la correcta sin poder reconstruirla
  a partir de lo guardado.

## Eliminar un proyecto

Desde el launcher (botón "Eliminar" en cada tarjeta) o desde el menú
`Proyecto > Eliminar este proyecto...` de la propia ventana del proyecto,
ambos con confirmación explícita. Borra sus filas de la base de datos, su
carpeta de backups en disco, la copia HTML horneada, y el almacenamiento
(partición de Electron) del proyecto. No se puede deshacer.

Detalle técnico (relevante solo si se toca el código): cuando se elimina
desde el propio menú de la ventana del proyecto, cerrar esa ventana de forma
síncrona en mitad del evento del menú nativo llegó a colgar el proceso
(SIGSEGV) en Linux/GTK durante las pruebas — el cierre se difiere un tick con
`setImmediate` en `deleteProjectById` (ver comentario en `main.js`) para
evitarlo.

## Que la base de datos no se sature con el tiempo

`panorama.sqlite3` solo guarda metadatos (proyectos, referencias a backups) —
el contenido real de cada backup vive en su propio archivo `.json` en disco,
nunca dentro de la base de datos. Los backups creados por versiones antiguas
de la app (que sí guardaban el JSON completo dentro de la base de datos) se
migran automáticamente a archivo la primera vez que se abre la app con esta
versión (`migrateLegacyInlineBackupsToFiles` en `main.js`), y la base de
datos se compacta (`VACUUM`) justo después. Resultado: por muchos proyectos o
backups que se acumulen con los años, `panorama.sqlite3` se mantiene del
tamaño de unos pocos metadatos, nunca del tamaño de los backups en sí.

## Cómo probarla en tu máquina
