# A3.3 — Paso 0: inventario de escrituras a la base de datos (13 sept 2026)

Diagnóstico previo al contador de generación. **No se ha modificado ni una
línea de código** — ni `db.js`, ni `main.js`, ni ningún otro archivo.

Método: localización literal de las 29 llamadas a `dbmod.run()` en `main.js` y
lectura del código alrededor de cada una para determinar protección real
(un primer intento con recuento léxico de llaves resultó poco fiable y se
descartó a favor de la lectura directa). Rastreo de llamadores hacia arriba
hasta el disparador (acción de usuario o proceso automático) y hacia abajo
hasta dónde acabaría hoy una excepción.

---

## 1. Resumen numérico

| | Nº |
|---|---|
| Llamadas a `dbmod.run()` | **29** |
| Con `try/catch` **en el propio sitio** | 6 |
| Protegidas por el `try` de su **llamador** (familia rekey de A1) | 6 |
| **Sin ninguna protección** | **17** |
| Llamadas de lectura (`dbmod.get`/`dbmod.all`) | 52 (no afectadas: no persisten) |
| Tamaño actual de `panorama.sqlite3` | 76 KB |

Cada `dbmod.run()` provoca un `persist()` completo: `db.export()` + escritura
de 76 KB + `rename`. No hay agrupación ni transacciones.

---

## 2. Inventario

### 2.1 `setMeta` / `deleteMeta` — líneas 757, 758, 761

- **Función:** `setMeta(key,value)` = `DELETE` + `INSERT`; `deleteMeta(key)` = `DELETE`.
- **Qué modifica:** tabla `app_meta`. Claves reales en uso: `app_theme`,
  `bounds_<rol>`, `last_vacuum_at`, `security_salt`, `security_verifier`,
  `security_enabled`, `security_remembered`.
- **Quién las dispara:** cambio de tema (IPC `theme:set` y menú nativo), cierre
  de cualquier ventana (guardar tamaño/posición), `VACUUM` periódico al
  arrancar, y las cuatro operaciones de Seguridad.
- **`try/catch` propio:** NO. Pero casi todos los llamadores sí lo tienen:
  `maybeRunPeriodicVacuum`, `persistWindowBoundsOnClose`, `rememberPassword`,
  `applyRekeyMeta` (dentro del try de A1) y `security-win:submit`. El único
  camino desprotegido es `setGlobalTheme` desde `theme:set`.
- **Hoy, si falla:** en los caminos protegidos, un `console.warn` invisible en
  producción. En `theme:set`, rechaza la promesa del renderer, que la ignora.
- **¿Reintentable?** Sí, es idempotente.
- **Ante conflicto A3.3:** no debe abortar nada — son preferencias. Latch global.
- **⚠️ Escritura encadenada crítica:** `setMeta` son **dos persistencias
  separadas**. Si la primera (`DELETE`) llega a disco y la segunda (`INSERT`)
  no, **la clave desaparece**. Con `security_salt` eso es pérdida irreversible
  de todos los archivos cifrados. Ver §5.1.

### 2.2 `ensureProjectBackupDirSlug` — línea 1340

- **Qué modifica:** `projects.backup_dir`, una sola vez por proyecto.
- **Quién la dispara:** indirectamente casi todo — `backupsDirForProject`,
  `meetingPrepsDirForProject` y `candidateEvalFileForProject`, que a su vez
  usan `backup:save`, el listado del lanzador, el rekey, "Ver carpeta de
  backups", etc.
- **`try/catch`:** NO. Protección heredada según el llamador (varía).
- **Hoy, si falla:** depende del llamador; en `backup:save` la excepción
  ocurriría *dentro* del try de escritura de archivo (línea 6527) y devolvería
  `false`.
- **¿Reintentable?** Sí, totalmente idempotente.
- **Ante conflicto:** latch global; no abortar.

### 2.3 `ensureDirectorioTalentoProject` — líneas 1497, 1501

- **Qué modifica:** `INSERT` de la fila singleton del Directorio de Talento y
  `UPDATE` de su `backup_dir`.
- **Quién la dispara:** abrir el Directorio (botón del lanzador, IPC
  `directorio:open`, `projectMenu:action 'archivo-directorio'`, menú nativo).
- **`try/catch`:** NO.
- **Hoy, si falla:** por IPC, rechaza la promesa del renderer → ignorada. Por
  menú nativo → `uncaughtException`.
- **¿Reintentable?** Sí: la siguiente apertura vuelve a intentarlo.
- **Encadenadas:** sí, INSERT + UPDATE. Fallo parcial deja `backup_dir` NULL,
  que `ensureProjectBackupDirSlug` repara solo. **Auto-sanable.**

### 2.4 `openProjectWindow` — línea 2156

- **Qué modifica:** `projects.updated_at` (marca de actividad).
- **Quién la dispara:** abrir cualquier proyecto o el Directorio.
- **`try/catch`:** NO.
- **Hoy, si falla:** la ventana ya está creada; la excepción se produce
  después. Por IPC (`projects:open`) rechaza la promesa; el lanzador **sí** la
  captura (`catch (err) { setStatus('Error: ...') }`).
- **¿Reintentable?** Sí, idempotente.
- **Ante conflicto:** latch; no impedir abrir el proyecto.

### 2.5 Familia rekey (A1) — líneas 2576, 2580, 2584 y 2593, 2594, 2595

- **Funciones:** `rekeySetFlagBulk` (3 `UPDATE`, uno por familia) y
  `rekeyRestoreFlagsPerItem` (restauración fila a fila).
- **Qué modifica:** columna `encrypted` de `backups`, `meeting_preps` y
  `candidate_evals`.
- **Quién las dispara:** activar/cambiar/desactivar la Seguridad, y la
  recuperación de arranque de un rekey interrumpido.
- **`try/catch`:** no propio, pero **siempre** se invocan dentro del `try` de
  `rekeyAllUserFiles` o del de `recoverInterruptedRekeyIfAny`.
- **Hoy, si falla:** A1 lo trata correctamente — deshace columnas y swap, y
  devuelve `{ok:false}` con mensaje al usuario.
- **¿Reintentable?** Sí; A1 ya prueba interrupciones a mitad (casos 11-13 y 19).
- **Ante conflicto:** **este es el único sitio que debe abortar de verdad.** Un
  conflicto aquí tiene que disparar el rollback de A1.
- **Encadenadas:** las 3 son una sola operación lógica.

### 2.6 `migrateLegacyInlineBackupsToFiles` — línea 2922

- **Qué modifica:** vuelca `backups.payload` a archivo y actualiza
  `file_path`/`encrypted`.
- **Quién la dispara:** arranque, una sola vez, tras el login.
- **`try/catch`:** SÍ, por fila → `console.warn`.
- **Hoy, si falla:** esa fila se salta; se reintenta en el siguiente arranque.
- **¿Reintentable?** Sí, pero **cada intento fallido deja un archivo huérfano**
  (el `writeFileSync` ya ocurrió). Acumulativo.
- **Ante conflicto:** latch; abandonar la migración esta sesión.

### 2.7 `deleteProjectById` — líneas 2993, 2994

- **Qué modifica:** `DELETE FROM backups WHERE project_id` + `DELETE FROM projects`.
- **Quién la dispara:** "Eliminar" en la tarjeta del lanzador, o
  `Proyecto → Eliminar este proyecto...`.
- **`try/catch`:** **NO** — están después de los tres try que cubren el borrado
  de archivos y de la partición.
- **Hoy, si falla:** por IPC (`projects:delete`) el lanzador lo captura y
  muestra "Error: …". Desde el menú del proyecto (`projectMenu:action`), el
  renderer llama sin `await` ni `.catch` → **rechazo silencioso**.
- **¿Reintentable?** Sí, pero **los archivos ya se han borrado antes**. Si
  falla el segundo `DELETE`, queda un proyecto fantasma: fila viva, backups y
  partición ya destruidos. Se abre vacío.
- **Encadenadas:** sí, una sola operación lógica. Y no es sólo la BD: el
  borrado de archivos ocurre **antes**, así que la operación completa no es
  atómica ni hoy.
- **Ante conflicto:** abortar **antes** de tocar archivos sería lo correcto,
  pero eso exige reordenar la función (fuera del alcance de A3.3).

### 2.8 `projects:reorder` — línea 5895

- **Qué modifica:** `projects.sort_order`, un `UPDATE` por proyecto (11 hoy →
  11 persistencias de 76 KB = ~840 KB por arrastre).
- **Quién la dispara:** soltar una tarjeta tras arrastrarla.
- **`try/catch`:** NO (dentro de un `forEach`).
- **Hoy, si falla:** rechaza la promesa; el lanzador **sí** lo captura
  (`setStatus('No se pudo guardar el nuevo orden: ...')`).
- **¿Reintentable?** Sí, idempotente.
- **Encadenadas:** sí, las N son una sola operación lógica. Fallo parcial =
  orden mezclado; se corrige al recargar o al volver a arrastrar. **Cosmético.**

### 2.9 `meeting:deletePrep` — línea 6048

- **Qué modifica:** `DELETE FROM meeting_preps`.
- **Quién la dispara:** borrar una preparación desde su historial.
- **`try/catch`:** NO (el try cubre sólo el `unlinkSync` anterior).
- **Hoy, si falla:** rechaza la promesa del renderer.
- **¿Reintentable?** Sí, pero **el archivo ya se ha borrado**: quedaría una
  fila apuntando a un `.json` inexistente. `meeting:getPrep` daría "No se pudo
  leer el archivo guardado".
- **Encadenadas:** archivo + fila, mismo patrón que 2.7.

### 2.10 `projects:create` — líneas 6422, 6429, 6441

- **Qué modifica:** `INSERT` del proyecto, `UPDATE` de su `backup_dir`, y un
  `DELETE` de compensación si falla la siembra de datos importados.
- **Quién la dispara:** "+ Nuevo proyecto".
- **`try/catch`:** NO en 6422/6429. La 6441 está *dentro* de un `catch` pero no
  protegida ella misma.
- **Hoy, si falla:** el handler es `async`; el lanzador **sí** lo captura y lo
  muestra en el modal ("Error: …"), dejándolo abierto. **Es el mejor camino de
  error de toda la app.**
- **¿Reintentable?** El INSERT **no**: reintentar crearía un proyecto
  duplicado. El UPDATE sí.
- **Encadenadas:** sí. Fallo tras el INSERT deja `backup_dir` NULL →
  auto-sanable. Fallo del `DELETE` de compensación (6441) deja un proyecto
  fantasma sin datos.

### 2.11 `backup:save` — líneas 6534, 6549, 6559, 6573

Es la ruta **más caliente** de la app: cada ventana de proyecto abierta la
dispara cada 15 s si hay cambios, más al cerrar.

| Línea | Qué hace | `try`? |
|---|---|---|
| 6534 | `INSERT` de la fila del backup | **NO** |
| 6549 | `DELETE` de las filas que pasan de `BACKUP_KEEP` (dentro de `forEach`) | **NO** |
| 6559 | `UPDATE projects SET updated_at` | **NO** |
| 6573 | `UPDATE projects SET name` (si el título cambió) | SÍ, pero dentro del `try` del `JSON.parse` cuyo `catch` dice *"No se pudo actualizar la copia HTML del proyecto"* — **etiquetaría mal** un error de BD |

- **Hoy, si falla:** rechaza la promesa de `saveBackup`; `maybeBackup` en el
  dashboard **sí** lo captura y devuelve `{ok:false}`, sin envenenar
  `lastSerialized`, y reintenta a los 15 s. **Este camino está bien resuelto.**
- **¿Reintentable?** Sí. Pero **el archivo `.json` ya se ha escrito antes**: si
  falla el INSERT, queda huérfano. Con reintentos cada 15 s, se acumulan.
- **Encadenadas:** INSERT + purga + `updated_at` son una operación lógica.
  Degradaciones parciales son benignas salvo el huérfano.

---

## 3. Dónde acaba hoy una excepción

Tres destinos posibles, y ninguno llega al usuario de forma fiable:

| Camino | Qué pasa | ¿Llega al `uncaughtException` global? |
|---|---|---|
| Dentro de `ipcMain.handle` | Electron convierte el throw en rechazo de la promesa del renderer | **No** |
| Click de menú **nativo** síncrono | Propaga por el despacho de Electron | **Sí** |
| Click de menú nativo `async` | Rechazo no manejado | Va al handler `unhandledRejection` |

Y en el lado del renderer, el matiz decisivo: **las 10 invocaciones de
`launcherMenuAction` / `projectMenuAction` se hacen sin `await` y sin
`.catch()`** (`renderer.js:709`, `plantilla_dashboard.html:5968`,
`plantilla_directorio.html:3295` y los atajos de teclado). Un rechazo ahí es un
*unhandled rejection* en el renderer: **completamente silencioso**, sin
devtools en producción.

Sólo tres caminos muestran hoy el error al usuario: crear proyecto (modal),
reordenar tarjetas (pie de página) y las acciones de la tarjeta del lanzador
(`setStatus`). Y uno lo trata bien por dentro sin enseñarlo: `backup:save`.

Los dos manejadores globales (`uncaughtException` y `unhandledRejection`) sólo
escriben en `app.log`. Como registrar un manejador de `uncaughtException`
desactiva el cierre por defecto de Node, la app **sigue viva en estado
indefinido** (hallazgo B2 de la auditoría).

**Conclusión operativa: si A3.3 se limita a lanzar excepciones, el conflicto no
llegará al usuario en la mayoría de los caminos.**

---

## 4. Las cuatro clases de error

A3.3 no debe fundirlas. Propuesta de clasificación y política:

| Clase | Ejemplos | Política |
|---|---|---|
| **1. E/S normal** | `ENOSPC`, `EACCES`, `EBUSY`, carpeta de Drive sin conexión | **Comportamiento idéntico al de hoy**: lanzar. Cero cambios para los 29 sitios |
| **2. Conflicto real** | El testigo en disco no es el que escribimos | **Nunca lanza.** Latch de sesión + callback al usuario (§5) |
| **3. Fallo del satélite** | Ausente, vacío, corrupto, bloqueado, ilegible | **Fallar en abierto**: registrar una vez, desactivar la comprobación en esta sesión, seguir escribiendo |
| **4. Error de programación** | SQL mal formado, bug en `db.js` | Lanzar, con código propio en `app.log`. Es el único caso en que queremos ruido |

Implementación: un error tipado (`kind: 'io' | 'conflict' | 'guard' | 'bug'`),
no un `Error` genérico.

---

## 5. Arquitectura mínima propuesta

### La pregunta central: ¿hay que tocar las 29 llamadas?

**No, y además no se debe.** El argumento:

> Un conflicto de generación **no es una condición por operación**, es una
> condición **de sesión**: "la base de datos que hay debajo ya no es la que
> cargamos". Una vez cierta, sigue siéndolo. Ninguna escritura individual puede
> resolverla: reintentar es inútil (el conflicto persiste) y abortar una
> escritura mientras las otras 28 siguen adelante es incoherente.

Por tanto la decisión no pertenece a los sitios de llamada, sino a la sesión.

### Forma propuesta

**`db.js` detecta, clasifica y latchea. No lanza en caso de conflicto.**

Al detectar clase 2, `persist()`:

1. **No escribe nada en disco.** Nada se pisa, en ninguna dirección.
2. Mantiene la imagen en memoria **intacta** — la sesión no pierde nada y la
   app sigue funcionando con normalidad.
3. Marca `conflictLatched = true` y `dirty = true`.
4. Vuelca **una sola vez** nuestra imagen a `panorama.sqlite3.conflicto-<equipo>-<fecha>`.
5. Invoca **una sola vez** el callback `onConflict(info)` inyectado por `main.js`.
6. Devuelve normalmente al llamador.

A partir de ahí, todas las escrituras siguen aplicándose en memoria y ninguna
toca el disco, hasta que el usuario decida.

**`main.js` decide, en un solo sitio.** El callback muestra un modal
bloqueante que explica qué equipo escribió y ofrece dos salidas:

- *Quedarme con lo del disco*: recargar la base de datos; los cambios de esta
  sesión quedan en el archivo `.conflicto-…` (nada se pierde).
- *Quedarme con lo mío*: adoptar la generación de disco y sobrescribir.

### Puntos de contacto reales: 29 → 3

| Cambio | Dónde | Tamaño |
|---|---|---|
| `dbmod.setConflictHandler(fn)` | `main.js`, una vez al arrancar | 1 línea |
| El handler del conflicto (modal + resolución) | `main.js`, función nueva | ~30 líneas |
| Comprobar `dbmod.hasConflict()` tras las fases 3-4 del rekey | `rekeyAllUserFiles` | 2 líneas |

**Cero cambios en los 29 sitios de llamada.** El rekey es la única excepción
porque es el único que necesita *abortar y deshacer*, no sólo enterarse.

### Que el mecanismo no pueda bloquear ni corromper nada

- **Fallar en abierto** ante cualquier error del satélite (clase 3).
- **Interruptor de desactivación** en la carpeta de configuración **local**
  (`%APPDATA%\panorama-app-config\`), nunca en la carpeta de Drive — tiene que
  funcionar precisamente cuando esa carpeta es el problema.
- La comprobación es **sólo de escritura**: no puede bloquear el arranque.
- Su modo de fallo es **dejar de escribir**, nunca escribir mal.
- Todo confinado en `db.js` + un callback; `db.js` sigue sin saber de interfaz.

---

## 6. Hallazgos independientes del inventario

Tres cosas que aparecieron al revisar y que **no** son parte de A3.3:

**6.1 `setMeta` no es atómico y debería serlo.** Es `DELETE` + `INSERT` = dos
persistencias. Un fallo entre ambas **borra la clave**. Con `security_salt` eso
es pérdida irreversible de todo lo cifrado. Un `INSERT OR REPLACE INTO
app_meta(key,value) VALUES (?,?)` lo convierte en una sola escritura atómica.
Es un cambio de una línea que **conviene hacer antes que A3.3**, porque A3.3
añade una razón legítima más para que la segunda escritura no ocurra.

**6.2 Archivos huérfanos por escritura-antes-de-fila.** `backup:save`,
`meeting:savePrep` y `migrateLegacyInlineBackupsToFiles` escriben el archivo
**antes** de insertar su fila. Si la fila falla, el archivo queda sin
referencia y nada lo recoge. Es el mismo mecanismo que ya produjo los ~80 MB de
backups huérfanos medidos en la auditoría (punto C1).

**6.3 Borrados no atómicos entre disco y BD.** `deleteProjectById` y
`meeting:deletePrep` borran archivos **antes** de borrar la fila. Un fallo
intermedio deja fila viva sin datos.

Los tres son preexistentes. A3.3 no los crea, pero sí aumenta la probabilidad
de que se disparen.

---

## 7. Plan de pruebas propuesto para A3.3

Mismo método que A1: extraer el bloque real y ejecutarlo contra directorios
temporales, más una ejecución real en el sandbox aislado.

- Monotonía del contador y atomicidad del satélite.
- Dos escritores partiendo de la misma generación: el segundo debe detectarlo.
- Las dos ventanas de corte (satélite antes/después de la base de datos).
- Clase 3 en todas sus formas: satélite ausente, vacío, corrupto, bloqueado, de
  versión futura → **en todas, la app debe seguir escribiendo**.
- Clase 1 sin cambios de comportamiento respecto a hoy.
- Compatibilidad: base de datos sin `db_generation`; simulación de un PC con
  una versión antigua que escribe sin tocar el satélite.
- Detección de copias en conflicto de Drive (`panorama.sqlite3 (1)`).
- Interruptor de desactivación.
- Resolución del conflicto en ambas direcciones, verificando que **nunca** se
  pierde ninguno de los dos lados.
- Conflicto durante las fases 3-4 del rekey → debe disparar el rollback de A1.
- Rendimiento: 1.000 escrituras con y sin el mecanismo, en disco local y en la
  carpeta de Drive.
- Re-ejecución completa de las suites A1 (56 + 98).

---

## 8. Recomendación de orden

1. **6.1** (`setMeta` atómico) — una línea, cierra una vía de pérdida
   irreversible, independiente de todo lo demás.
2. **B2** (que una excepción no capturada llegue al usuario en vez de sólo a
   `app.log`) — sin esto, A3.3 rinde menos de lo que parece.
3. **A3.3** con la arquitectura de §5.
4. **6.2 / 6.3** (huérfanos y borrados no atómicos) — mantenimiento, sin prisa.
