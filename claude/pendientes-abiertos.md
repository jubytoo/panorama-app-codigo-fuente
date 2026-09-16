# Pendientes abiertos

**Creado:** 13 sept 2026 · **Estado revisado:** 15 sept 2026, tras **cerrar el
Bloque 5 de A3.3** con cableado productivo y arranques Electron reales.

Cosas detectadas durante la auditoría y las rondas A1 / A3.1 / setMeta / A2 que
**se han dejado a propósito sin tocar**. Ninguna es un bloqueo; todas están
verificadas como reales.

> **Cómo leer este documento.** El texto original de cada pendiente **no se ha
> modificado**: se le ha añadido una columna **Estado** y, cuando procede, una
> **referencia de cierre o absorción**. Nada se marca cerrado por haberse tocado
> de pasada.
>
> Estados: **PENDIENTE** · **EN CURSO** · **CERRADO** · **ABSORBIDO** (lo
> resuelve otro trabajo, que puede seguir abierto).

## Resumen de estado

| # | Estado | Cierre / absorción |
|---|---|---|
| P1 | **PENDIENTE — aceptado** | Efecto conocido de A2, aceptado por el usuario |
| P2 | **CERRADO** (15 sept 2026) | `RA-8` en Electron real, sobre los Map **reales** de `main.js`: el `closed` tardío de una ventana A sustituida **no** desregistra a B (`map.get(X) === B`), en reunión **y** en candidatos, con control negativo al destruir B. La reversión `I-p2-delete-ciego` deja el mapa **vacío** — el defecto, reproducido. 12 OK / 0 |
| P3 / B2 | **CERRADO** | Ronda B2 (clases de fallo + `procesoComprometido`) |
| P4 | **ABSORBIDO por A3.3** | `db_generation`, `.gen`, cadena de commits. Bloques 1–5 cerrados |
| P5 | **ABSORBIDO por A3.3 / A3.1** | Cerrojo de instancia única (A3.1) + identidad de commit y `exigirCommitBase` (A3.3) |
| P6 | **CERRADO** | Bloque 5 / D1: `deleteProjectById` borra las **cuatro** tablas en un único commit. Verificado en Electron real (E1) |
| P7 | **CERRADO** | Bloque 4: `ejecutarAccionDeArchivo`, journal de acción y marca por escritor |
| P8 | **CERRADO** | Bloque 5 / D1+D2: cuarentena → un commit → purga, con NO-CLOBBER. Verificado en Electron real (E1, E2, E4, E7) |
| P9 | **PENDIENTE** | Corregido **solo en los arneses** (`comun/guardia-rutas.js`, fail-closed). `main.js` sigue tragándose el BOM |
| P10 | **PENDIENTE** | Ver la nota de corrección de evidencia, más abajo |
| P11 | **PENDIENTE** | UX, no urgente |
| E1 | **CERRADO** (15 sept 2026) | Controles de Lista/Resumen **retirados** de la UI (opción A). Ver §«E1 — CERRADO», abajo |
| P12 | **CERRADO** (15 sept 2026) | `rangoTemporalValido()`: sin escala demostrable no se infiere progreso. Batería **73 OK/0**, dashboard real **32 OK/0**, tres reversiones. Ver §P12, abajo |
| D4 | **ABIERTO / DIFERIDO A CIERRE DE RELEASE** | `package.json` 2.0.55 vs código 2.0.56. **Sigue siendo bloqueador de la publicación final, pero no del trabajo técnico intermedio.** Decisión del usuario (15 sept 2026): la numeración, el `package.json` y la publicación pertenecen a la fase final de release, y cambiar ahora una versión que volverá a cambiar al terminar la auditoría no aporta nada |
| B1 | **CERRADO** (15 sept 2026) | Contexto de pasada (4→1 y 2→1 lecturas), lectura pura, rastro sin spam y `computeStaffingRatio` fuera del listado. Batería **77 OK/0**, Electron real **24 OK/0**, cuatro reversiones. Ver §B1, abajo |
| C1 | **ABIERTO**, partido en dos (16 sept 2026) | Diagnóstico: **117** backups sin fila, **39,67 MB** (no ~80), **7 particiones** de proyectos borrados (72 MB), CV no decidibles. **C1-A — CERRADO:** inventario de residuos al arrancar (solo lectura, una línea en `app.log`), CV de «Eliminar evaluación» e «Importar» retirados solo con `aplicado+verificado`, y mensajes que ya no prometen «se resuelve sola». Batería **165 OK/0**, Electron real **31 OK/0**, siete reversiones. **C1-B — ABIERTO / DIFERIDO:** retirada de lo histórico, hasta tener garantías multi-PC/Drive. Ver §C1 |
| P16 | **ABIERTO** *(16 sept 2026)* | **Particiones de Chromium dentro de la carpeta sincronizada.** Las vivas suman ~755 MB, ~721 MB de caché; una sola lleva ~523 MB de Service Worker de un origen https externo. Ubicación, sincronización innecesaria, crecimiento y ciclo de vida. Relacionado con A3.3 Bloque 8 / ciclo de vida de Drive y con P14. **No es C1.** Ver §P16 |
| E2 | **CERRADO** (15 sept 2026) | `vendor/service-status.js` como fuente única. Batería **67 OK/0**, Electron real **42 OK/0**, dos reversiones. Ver §E2, abajo |
| P13 | **ABIERTO / ACEPTADO TEMPORALMENTE — baja-media** *(15 sept 2026)* | **Frescura del origen**: lanzador = snapshot del último backup persistido; dashboard abierto = estado vivo. **Decisión del usuario:** no se cambia la fuente ahora. Ver §P13 |
| B3 | **CERRADO** (15 sept 2026) | Los errores relevantes **ya no dependen exclusivamente de `console`**. Cifrado de backup **fail-closed**, el Directorio avisa cuando no puede guardar, **15** líneas de rastro nuevas en `main.js` (9 con dedupe por sesión) y saneado de rutas. Los 19 `console.warn` siguen ahí: B3 añade al lado, no sustituye. Catch vacíos 26 → 17. Batería **85 OK/0**, Electron real **36 OK/0**, siete reversiones. Ver §B3, abajo |
| P14 | **ABIERTO — media** *(15 sept 2026)* | **El registro persistente depende de Drive.** `app.log` vive en `userData`, que en esta instalación es `G:`. Si lo que falla es justo Drive, el aviso se intenta escribir **allí**. No hay respaldo local. Relacionado con A3.3 Bloque 8 / ciclo de vida de Drive. Ver §P14 |
| B5 | **CERRADO** (16 sept 2026) | **Una línea** en `security-window/renderer.js`: `if (els.btnSubmit.disabled) return;`. Medido antes: 2 Enter = 2 IPC, 5 Enter = 5 IPC, click+Enter = 2. Medido después: **1 IPC** en todos los casos y en los cuatro modos. Las capas inferiores **no se tocan** y siguen custodiadas con IPC directos. Batería **68 OK/0**, Electron real **24 OK/0**, una reversión. Ver §B5 |
| B4 | **CERRADO** (16 sept 2026) | Las **dos mitades del hallazgo original** ya las había absorbido A3.3 (`persist()` → `aplicarYConfirmar()`; `backup:save` → `ejecutarAccionDeArchivo`). El **patrón residual** que quedaba —`projects:reorder` con N commits— **corregido**: una sola mutación anclada. Batería **144 OK/0**, Electron real **17 OK/0**, dos reversiones. Ver §B4 |
| P15 | **ABIERTO — baja** *(15 sept 2026)* | **Las líneas de `app.log` anteriores a B3 sí llevan la ruta completa** dentro del mensaje del error (`EPERM … 'C:\Users\<usuario>\…'`). B3 sanea las suyas con `motivoSinRutas()`; las ~140 anteriores no. Ver §P15 |
| F1 | **CERRADO** *(16 sept 2026)* | **Interpretación de datos como HTML — corregida por contexto.** Ningún dato importado/persistido puede ya convertirse en markup, atributo, cierre de `<script>`, handler inline, selector roto ni URL activa. Batería **139 OK/0** (exigente), Electron real **47 OK/0** (4 arranques), **6 reversiones** por familias (**19 OK/0**). Cinco archivos tocados. Ver §F1. *(Diagnóstico previo, conservado abajo.)* |
| F1 *(diagnóstico)* | — | Interpretación de datos como HTML. **Diagnóstico cerrado; sin implementar.** Patrón **global en el dashboard** (19 campos se interpretan y ejecutan al abrir, sin interacción); vía persistente más grave: **título importado horneado** en `projects/<id>/dashboard.html`, que ejecuta en el **arranque**. Propagación cruzada a Preparación y Directorio. Evaluación y Directorio casi todo escapado (residuos: peso/fecha/id de Evaluación, `data-dedic` del Directorio). **Barreras reales:** `contextIsolation:true` + `sandbox:true` + sin Node en las 4 ventanas → **no es RCE**; pero `psConfirm` sobrescribible, puente con 25 métodos, **sin CSP** (F2) y `window.open` sin handler (F3). Batería `f1/` (**100** descriptiva + **34** Electron real, 3 arranques, con marcadores inocuos). Ver §F1 |

## Aplazadas explícitamente por el usuario

| # | Qué | Dónde | Por qué se aplaza | Estado |
|---|---|---|---|---|
| P1 | **Backup duplicado de `startup` tras restaurar.** La ventana nueva hace `maybeBackup('startup')` a los ~3 s y escribe una instantánea del estado recién restaurado. Es un duplicado de contenido, inocuo. | `plantilla_dashboard.html:5772` | Aceptado como efecto conocido de A2; quitarlo exigiría lógica extra solo para eso | **PENDIENTE — aceptado** |
| P2 | **`'closed'` sin comprobación de identidad** en `meetingPrepWindows` y `candidateEvalWindows` — mismo patrón que se corrigió en `projectWindows` (A2). Latente: esas ventanas no se reabren durante una restauración. | `main.js` (los dos `win.on('closed', () => …Windows.delete(row.id))`) | Fuera del alcance acordado para A2, que era `projectWindows` | **CORREGIDO, pendiente de Electron real.** El cableado de A2 bajo A3.3 lo necesitaba: el quiesce cierra las tres familias, y un `delete(id)` ciego dejaba a la app sin poder encontrar una ventana sustituida. Los dos handlers comprueban identidad. **Deja de ser latente**: ahora esas ventanas SÍ se cierran durante una restauración |
| P2bis | *(nota del 15 sept 2026, tras Electron real)* **P2 NO se marca cerrado.** A2 ya ha pasado por `BrowserWindow` real (RA-1 cierra de verdad las tres familias; RA-2 demuestra con un `beforeunload` real que una ventana que se niega **vuelve al mapa** y bloquea también el segundo intento, que es exactamente el patrón de P2). Lo que **no** se ha ejercitado es el caso concreto de P2: una ventana de reunión o de candidatos **sustituida por otra** cuya `'closed'` tardía llega después. Esa comprobación de identidad sigue sin provocarse en vivo. | | | **SUPERADO el 15 sept 2026 por `RA-8`**, que provoca exactamente ese caso sobre los Map reales. **P2 → CERRADO** |
| P11 | **UX: "Revisa la consola del navegador (F12)"** en la pantalla de error del dashboard. Panorama es una aplicación de escritorio; ese texto no le dice nada a un usuario final y le sugiere una acción que no aplica. Debería remitir a "Ver registro de la aplicación (app.log)" y al código de error. | `dashboard/plantilla_dashboard.html:5533` | Pendiente de UX, no urgente | **PENDIENTE** |

## Trabajo ya diseñado, pendiente de autorización

| # | Qué | Documento | Estado |
|---|---|---|---|
| P3 | **B2** — que una excepción no capturada llegue al usuario y no solo a `app.log` | diseño pendiente | **CERRADO** — ronda B2 |
| P4 | **A3.3** — contador de generación en `db.js` para detectar una base de datos pisada por otra instancia/PC | `claude/a3-3-paso0-inventario.md` | **ABSORBIDO por A3.3**, que sigue **EN CURSO** (Bloque 5) |
| P5 | **A3.2a / A3.2b** — registro de instancias y barrera de intención para el caso multi-PC | analizado en la ronda de A3 | **ABSORBIDO por A3.3 / A3.1** |

## Hallazgos incidentales, sin diseño todavía

| # | Qué | Detalle | Estado |
|---|---|---|---|
| P6 | **Filas huérfanas al borrar un proyecto** | `deleteProjectById` borra las filas de `backups` y la de `projects`, pero **no** las de `meeting_preps` ni `candidate_evals` | **CERRADO — Bloque 5 / D1.** Las cuatro tablas van en una sola llamada a `escribirMultiple`, anclada con `exigirCommitBase`. Comprobado en Electron real (E1): una única mutación con los 4 DELETE + la marca |
| P7 | **Archivos escritos antes que su fila** | `backup:save`, `meeting:savePrep` y `migrateLegacyInlineBackupsToFiles` escriben el archivo antes de insertar la fila; si la fila falla, el archivo queda huérfano. Es el mecanismo que produjo los ~80 MB de backups huérfanos medidos en la auditoría (punto C1) | **CERRADO — Bloque 4**. Los huérfanos **históricos** siguen siendo C1 |
| P8 | **Borrados no atómicos disco↔BD** | `deleteProjectById` y `meeting:deletePrep` borran archivos antes de borrar la fila | **CERRADO — Bloque 5 / D1 y D2.** Protocolo RETIRAR → CONFIRMAR → PURGAR: nada se destruye antes del commit, y la purga solo ocurre después. Comprobado en Electron real (E1, E2, E4) y en la recuperación al arrancar (E7) |
| P9 | **`location.json` con BOM se ignora en silencio** | Descubierto probando A3.1: si el archivo se guarda con BOM (p. ej. desde el Bloc de notas), `JSON.parse` falla, se traga la excepción y la app cae a la carpeta de datos local sin avisar | **PENDIENTE en producción.** Corregido solo en los arneses: `comun/guardia-rutas.js` es fail-closed y `GUARD-LOC-2` lo cubre. `main.js` sigue igual |
| P10 | **~85 MB de residuos en `%APPDATA%\panorama-app`** | Carpeta de datos local de antes de mover los datos a Drive (agosto): `app.asar`, `app1.asar`, un `app.asar.bak-*` y una `panorama.sqlite3` del 28/08. No la usa nada | **PENDIENTE.** Confirmado el 15 sept: esa `panorama.sqlite3` es `F71F4140…`, 57 344 B — ver abajo |

## Bloque 5 de A3.3 — CERRADO (15 sept 2026)

Borrados destructivos: `deleteProjectById` (D1), `meeting:deletePrep` (D2),
purga de backups (D3) y ciclo de vida del CV (D4a/D4b), más el dominio de
ocupación común a `.panorama-acciones` y `.panorama-borrados` y la puerta F-1
GLOBAL, todo en producción.

**Evidencia.** Automatizada: **1550 OK / 0 FALLOS** en diez baterías.
Electron real y destructivo, en sandbox artificial: **71 OK / 0** (E1–E7) más
**17 OK / 0** de los dos casos de CV que faltaban, con clic real sobre el
renderer productivo. Arneses en `scratchpad/bloque5/` y `scratchpad/real-run/b5.js`.

Lo más relevante que quedó demostrado en Electron real, no solo razonado:

- **E1** — eliminar un proyecto desde el lanzador real cierra sus tres ventanas,
  bloquea la escritura mientras dura, borra las cuatro tablas en **una sola
  mutación** anclada a la base capturada, y solo después purga la cuarentena y
  vacía la partición. Tras cerrar y reabrir no reaparece.
- **E2** — `base-cambiada` antes del commit: rollback completo, `clearStorageData`
  llamado **cero** veces, todo accesible tras reiniciar. Un conflicto no se
  convierte en pérdida.
- **E3** — primera **forma 3** (`aplicado:true / verificado:false`) forzada dentro
  de un Electron real. Cierra la deuda E2E que venía del Bloque 4.
- **E7** — recuperación al arrancar: restaura lo no confirmado, purga lo
  confirmado y hace **fail-closed con NO-CLOBBER** ante un destino reaparecido,
  conservando lo reaparecido y la cuarentena byte a byte.
- **CV** — quitar y cambiar, en los tres contratos. Con `aplicado:true /
  verificado:false` el archivo **ni se intenta borrar**; con `aplicado:false` se
  retira solo el CV recién copiado y nunca el viejo.
- **CV-RM-F3-RETURN** — el `await saveState(true)` **original** de la rama
  `quitar-cv` devuelve al llamador
  `{ok:true, aplicado:true, verificado:false, requiereReinicio:true}`, no
  `aplicado:false`. Es la distinción que impide que la rama interprete una
  forma 3 como «no aplicado» y restaure el CV en memoria, creando divergencia
  memoria↔disco. Verificado capturando el valor resuelto dentro del flujo real,
  con conteo directo del canal IPC: `candidateEval:save` = 1,
  `candidateEval:removeCv` = 0. Un **segundo** `saveState(true)`, ya con la
  sesión detenida, sí devuelve `aplicado:false / reintentable:false` y no llega
  al proceso principal — son dos cosas distintas y se registran por separado.

Punto de restauración de los seis archivos productivos tocados:
`claude/checkpoint-bloque5-2026-09-15.md`.

**Sigue fuera, por decisión explícita:** A2, conflicto UI general,
cierre/apagado global, Drive con dos PCs reales, empaquetado.

## A2 bajo A3.3 — cableado (15 sept 2026)

Cableado productivo de `backup:restore` completo: barrera unificada por
proyecto (`proyectoBloqueadoParaMutar`), quiesce de las tres familias de
ventanas **antes** de capturar la base, foto previa durable y cifrada
(`.panorama-restauraciones/<action_id>/previo.enc`), journal con validación
cerrada, commit de confirmación con marca y `exigirCommitBase`, NO-CLOBBER,
`recuperarRestauracionesPendientes()` en el arranque —la cuarta, tras rekey,
acciones y borrados—, precondición de material pendiente en el rekey y contrato
de tres formas en los dos preloads y los dos renderers.

**Añadido el 15 sept 2026 (misma fecha, ronda posterior):** **barrera durable
del `localStorage`** — `session.fromPartition(...).flushStorageData()` dentro
del `try` de R4, justo tras aplicar y antes del commit de confirmación. Sin
ella, un corte entre el apply y el commit dejaba **la marca puesta y la
partición sin los datos**, con la foto previa ya limpiada. Detalle completo y
límites en `a2-restore-bajo-a33.md` **§9**.

**Evidencia:** integración sobre código productivo **72 OK/0** (53 anteriores +
19 de `REST-FLUSH-1..5`), helper aislado **66 OK/0**, regresión completa
**1688 OK/0** en doce baterías, y **Electron real 40 OK/0** en seis escenarios
(RA-1..RA-6). El diferencial de la barrera (`a2/electron-flush-diff.ps1`),
matando el proceso con `TerminateProcess` justo tras el commit: **con barrera
4/4 coherente, sin barrera 0/4**.

## A2 bajo A3.3 — **CERRADO** (15 sept 2026, ronda H-1)

Dos rondas posteriores cerraron lo que faltaba.

**Ronda `REST-ROLLBACK-FLUSH` — el hallazgo abierto de §9.6.** El usuario
autorizó implementarlo: `reponerParticionDesdePrevio()` relee la partición y
llama a `flushStorageData()` **antes** de que se limpie nada, y solo entonces
declara `'repuesto'`. El journal y `previo.enc` son la única copia durable del
estado anterior; borrarlos antes de que la reposición esté en disco podía perder
justo lo que se prometía devolver.

**Ronda H-1 — un defecto REAL que encontró la batería.** Con el flush de la
reposición fallando, el material se conservaba correctamente… y aun así **un
`backup:save` del mismo proyecto se aceptaba en esa sesión**. Dos causas:
`armado` tenía la semántica invertida respecto a su uso —`armado = true` en los
caminos fail-closed *garantizaba* que el `finally` soltara la barrera— y
`f1Global()` no miraba `.panorama-restauraciones`. Corregido en dos capas:
`mantenerBarrera` + `restauracionesSinResolver` en memoria, y
`restauracionPendienteDeProyecto()` durable, por proyecto, con lo no
interpretable bloqueando a todos. Detalle en `a2-restore-bajo-a33.md` **§10**.

**Evidencia de cierre, contra `main.js = DB75E6C2…`:**

- automatizado **1745 OK / 0** en doce baterías (`a2/test-cableado.js` 96 → **129**);
- **Electron real 66 OK / 0**, los nueve modos en una sola tirada, con
  `RA-7/RA-7b` (corte duro tras la reposición y su cleanup), `RA-8` (P2 real) y
  `RA-9` (PS-2006 real con fail-closed al arrancar);
- **siete reversiones** que tumban exactamente lo suyo, incluidas dos que
  separan las dos capas de H-1 (`J` → 1 fallo, `K` → 10) y dos comprobadas en
  Electron real (`I` sobre `ra8`, `L` sobre `ra9`);
- BD viva idéntica por SHA-256 antes y después de **cada** ronda, carpeta sin
  archivos nuevos, cero archivos productivos tocados durante las pruebas.

**Lo que sigue fuera, y se dice en voz alta:** las **cuotas de `localStorage`**,
un **corte de corriente real** —`TerminateProcess` no lo es: los bytes escritos
siguen en la caché del SO—, **Drive con dos PCs**, y el fallo del flush de la
reposición **en Electron real** (H1-1 lo inyecta en el doble de `session`; lo
que sí se ejercitó en Electron real es el corte duro posterior, RA-7).

## E1 — CERRADO (15 sept 2026): controles RETIRADOS, vistas NO completadas

**Qué se ha hecho, exactamente:** se ha retirado de `launcher/index.html` el
conmutador `#view-switch` con sus tres botones (`🗂 Tarjetas`, `☰ Lista`,
`📊 Resumen`). Es el **único** acceso que el usuario tenía a esas vistas: no hay
entrada de menú, ni atajo de teclado, ni nada en `main.js` que llame a
`setView()`. Único archivo productivo tocado.

**Qué NO se ha hecho, por decisión explícita del usuario:** terminar las vistas.
**Lista y Resumen de Cartera están retiradas de la UI, no completadas.** Su
código interno parcial **sigue presente y sin tocar**: el handler
`portfolio:summary`, `portfolioSummary()` del preload, `computeStaffingRatio()`,
`setView()`, los helpers `staffingPill`/`serviceEndPill`/`timelineBarSVG`, el
CSS de ambas vistas y su markup oculto (`#view-list`, `#list-tbody`,
`#side-panel`, `#view-summary`). **La limpieza del código muerto no forma parte
de esta corrección.**

**Por qué la opción A y no terminar la integración:** E1 bloqueaba la
publicación porque había controles **visibles que parecían funcionales y no
hacían nada**; no hace falta terminar las vistas para recuperar un estado
publicable y coherente. Además, completarlas ahora consolidaría un acoplamiento
que habrá que deshacer: el `timeline` de `portfolio:summary` saca los días con
una **regex sobre `serviceEndMessage`**, que es texto de UI producido por
`computeServiceEndWarning()` — justo la función que **E2** tiene que unificar.

**Reactivarlas en el futuro exige las dos cosas:** terminar el lado cliente
(listener, `renderList()`, `loadSummary()`, rellenar `allProjects`, y unificar
en un solo sitio la decisión sobre `#empty`, que hoy `refresh()` y `setView()`
se disputan) **y resolver antes ese acoplamiento con E2**. El markup retirado
queda comentado en su sitio, con esa advertencia escrita.

**Evidencia.** `e1/test-inventario-e1.js` → **47 OK / 0** (incluye `setView()`
ejecutada contra un DOM doble, y comprobación por hash de que **ningún otro**
archivo productivo ha cambiado desde el cierre de A2). Lanzador **real**,
`e1/electron-e1.ps1` → **21 OK / 0**: el conmutador no existe en el DOM, cero
elementos con `data-view`, la única vista visible es la de tarjetas, y crear
tres proyectos, refrescar, reordenar con `projects:reorder` y abrir un proyecto
siguen funcionando, con **cero errores de renderer en el lanzador**. Regresión
completa **1745 OK / 0**, sin cambios. BD viva idéntica por SHA-256.

**Anotado, no arreglado:** `computeStaffingRatio()` queda para **B1** (es una de
las cuatro lecturas del estado del proyecto por `projects:list`, y **la única
cuyo resultado no consume nadie**). El acoplamiento timeline ↔
`serviceEndMessage` queda para **E2** / la futura conexión de Portfolio Summary.

## E2 — CERRADO (15 sept 2026): una sola fuente de verdad

**El problema no era deuda técnica, era divergencia observable.** Había dos
implementaciones —`computeServiceEndWarning()` en `main.js` y
`computeServiceEndWarningLocal()` en el dashboard— y el fix de v2.0.52
(`serviceStart` futuro tiene prioridad) entró solo en la primera. Con el **mismo
proyecto** delante:

```
lanzador:  «Arranca en 3 días»
dashboard: «Servicio finaliza en 20 días»
```

**La corrección.** `vendor/service-status.js`, JS puro (ni DOM ni Electron), que
`main.js` carga con `require()` y el dashboard con `<script>`. La ruta relativa
la reescribe `fixVendorScriptPaths()` al hornear `projects/<id>/dashboard.html`,
igual que ya hacía con xlsx, pptxgen, theme.js, fonts.css, motion.css y
window-chrome.css: **patrón existente, cero infraestructura nueva.** Las dos
funciones pasan a ser envoltorios de una línea.

**Contrato: datos primero, texto después.**

```
serviceStatus(state, today) → null | { kind, level, days, message }
```

`days` son los días **con signo** desde hoy hasta la fecha que da nombre al
`kind`. Positivo = futuro, 0 = hoy, **negativo = ya pasó**:

| `kind` | `days` cuenta hasta | signo |
|---|---|---|
| `proximo-inicio` | `serviceStart` | > 0 |
| `finaliza-pronto` | `serviceEnd` | 0 … 30 |
| `finalizado` | `serviceEnd` | < 0 |
| `prorroga-pronto` | `prorrogaEstimada.fecha` | 0 … 30 |
| `prorroga-vencida` | `prorrogaEstimada.fecha` | < 0 |

Se proyecta en `projects:list` como **`serviceStatusKind` / `serviceStatusDays`**
—y **no** como `serviceEndDays`, que sería falso justo en `proximo-inicio`,
donde el número cuenta hasta el **inicio**—. La semántica está escrita en el
propio helper, no implícita.

**Cambio visible e intencional:** al unificar gana `main.js`, que tiene el fix.
El dashboard pasa a mostrar también **«Arranca en N días»** cuando el servicio
no ha empezado, y deja de mostrar el aviso de fin en ese caso.

**Sin UX nueva:** `renderServiceEndWarning()` mantiene su presentación de
siempre —rojo → rojo, cualquier otro aviso → ámbar con ⏳—, así que
`proximo-inicio` se pinta en ámbar. Homogeneizar los iconos con el lanzador
(🚀 / `pill-info`) queda para otro día, si alguna vez se quiere.

**Se cierra también el acoplamiento.** `portfolio:summary` sacaba los días con
`/(\d+)/` **sobre el mensaje**. Funcionaba por coincidencia: lo único que lo
salvaba era que el nivel `rojo` no entraba en el `if`, porque «Finalizó el
09/12/2026» habría dado «09» leído como 9 días. Ahora consume
`serviceStatusDays`. El **criterio** de qué entra se deja idéntico (por nivel,
que incluye la prórroga próxima): lo único que cambia es de dónde sale el
número.

**Evidencia.** `e2/test-e2-divergencia.js` → **67 OK / 0**: 26 casos ejecutados
por los **tres** caminos —helper directo, envoltorio de `main.js`, envoltorio
del dashboard— exigiendo `A === B === C` en `kind`, `level`, `days` y `message`;
wording comprobado **literal**, no por patrón. `e2/electron-e2.ps1` →
**42 OK / 0**: lanzador y dashboard del mismo proyecto, cinco escenarios, con un
backup guardado en cada uno para que ambos miren el mismo estado.

La prueba que más importa: **cambiar el wording en una copia del helper no mueve
el timeline** (`1,1,0,0,1,0` antes y después), y la contraprueba muestra que el
parser antiguo habría sacado «99» en vez de 7. Texto y lógica, desacoplados de
verdad.

**Dos reversiones** (`e2/revertir-e2.js`): `P-dashboard-local` —el dashboard
vuelve a su copia divergente— **28 fallos**; `Q-regex-portfolio` —vuelve la
regex— **3 fallos**, exactamente los del desacoplamiento.

**Archivos:** nuevo `vendor/service-status.js`; modificados `main.js` y
`dashboard/plantilla_dashboard.html`. Nada más.

## C1 — ABIERTO (16 sept 2026): C1-A CERRADO, C1-B DIFERIDO

**Conclusión del diagnóstico, aceptada por el usuario:** NO es seguro aplicar
la regla «archivo sin fila ⇒ basura». Los 5 backups intercalados lo
demuestran: sin fila puede significar **estado perdido después por
sobrescritura entre equipos**. Por eso C1 se parte en dos, y no se mezclan.

### C1-A — CERRADO (16 sept 2026): cortar fuentes activas + observabilidad

1. **El recuento aprobado y nunca hecho, hecho.** `inventarioDeResiduos()` corre
   al arrancar, tras las cuatro recuperaciones y la migración y antes del
   lanzador: **leer → clasificar → una línea en `app.log`**, sin rutas ni
   nombres. No borra, no mueve, no aparta, no crea carpetas, no escribe en la
   BD (rutas puras). Usa nombres, listados y referencias de la BD; de
   `Partitions` solo el primer nivel; no hace `stat` por archivo, ni hashes,
   ni descifra backups. El único contenido que abre es `estado.json`, y solo en
   los proyectos con algún CV en disco (lo descifra solo si la sesión tiene la
   clave validada; si no, cuenta esos CV como «no decidibles»). Nunca lanza.
2. **Medido sobre producción, en solo lectura** (con `fs` y `dbmod` que lanzan
   ante cualquier escritura):
   `backupsSinFila=117 [anteriores=112 intercalados=5 posteriores=0 sinPosicion=0]`,
   `cvNoDecidibles=5`, `carpetasSinProyecto=2`, `particionesSinProyecto=7`,
   `filasSinProyecto=1`, `sondas=1`, resto 0 — **coincide con el diagnóstico**.
   Coste: **23–55 ms** sobre G: (48 listados + 1 lectura); **3–6 ms** en
   sandbox local.
3. **Defecto hallado al medir y corregido en esta misma ronda.** La primera
   versión solo reconocía el sello de los nombres actuales
   (`backup_<sello>_<hex>.json`); los huérfanos reales tienen el formato
   antiguo, sin sufijo, y salían todos como `sinPosicion=117`. Corregido;
   regresión `C1-A1f` y reversión `X-sello-estricto`.
4. **CV.** «Eliminar evaluación» e «Importar» retiran el archivo con el mismo
   contrato que «Quitar CV»: **solo** con `aplicado:true` **y**
   `verificado:true`, y solo si ya nada lo referencia. No aplicado o no
   demostrable → vuelve el estado anterior y el CV sigue. `verificado:false` →
   el CV **se conserva** (y el inventario lo contará).
5. **Mensajes.** El rekey (carpeta de trabajo) y su precondición (material de
   restauración) ya no prometen «se resuelve sola»: sin registro, dicen que el
   arranque **se detendrá** (PS-2004 / PS-2006) y que no se borre sin revisar;
   con registro, que **se intentará** y que, si no se demuestra, se detendrá. El
   aviso de arranque PS-2004 tiene rama propia para la carpeta sin registro.
   **No se ha relajado ningún fail-closed** ni automatizado ninguna
   recuperación. Los diálogos PS-2006 de acciones y borrados no se tocan: hablan
   de journals que sí existen y su promesa es condicional.

**Archivos:** `main.js` (`DB7FF295…` → `F81F0A3D3DF0AA1F…`) y
`evaluacion-candidatos/plantilla_evaluacion_candidatos.html`
(`F9DF00AE…` → `FFCEAD9810070A0B…`). Snapshots `*.ANTES-C1A-2026-09-16`.
`db.js` **no** se toca.

**Evidencia.** `c1/test-c1-residuos.js` **165 OK / 0** (sección `C1-A`: A1–A9
con las funciones reales, espías de `fs`/`dbmod`/`securitymod` y las ramas
reales del HTML). `c1/electron-c1.ps1` **31 OK / 0** (cuatro arranques reales:
la línea en cada uno; «Eliminar evaluación» con clic real, y con
`verificado:false` forzado en el IPC). **Siete reversiones**, cada una rompe
solo lo suyo:

| Reversión | Qué deshace | Rompe |
|---|---|---|
| `U-sin-llamada` | el arranque no llama al inventario | `C1-D4`, `C1-A1d` |
| `U2-sin-log` | el inventario no deja su línea | `C1-A1a/b/c` |
| `X-sello-estricto` | no reconoce el nombre antiguo | `C1-A1b`, `C1-A1f` |
| `V1-cv-del-eval` | retira el CV antes de saber si se guardó | `C1-A6a/b/d/e/f/h`, `C1-A8a` (y no toca A7) |
| `V2-cv-importar` | ídem en Importar | `C1-A7a/b/c/d`, `C1-A8b` (y no toca A6) |
| `W1-mensaje-rekey` | vuelve «al arrancar se resuelve sola» | `C1-E9c`, `C1-A9a/c/h` |
| `W2-mensaje-restaur` | vuelve «para que se resuelva sola» | `C1-A9e/f/h` |

### C1-B — ABIERTO / DIFERIDO: retirada de residuos históricos

**No autorizado todavía.** Motivo explícito: con varios equipos y Drive, hoy no
se puede demostrar con suficiente fuerza que un archivo sin referencia local
no vaya a recibir **después** su fila desde otro equipo (el otro publica el
archivo en F3 y confirma la fila en F4), ni que un listado de Drive esté
completo. Regla vigente mientras tanto:

- **A** → conservar. **B** → tampoco se borra, salvo necesidad demostrada de un
  flujo actual. **C** → detectar y registrar, **no** eliminar. **D** → no tocar.
- Los **112** anteriores: clase C aceptada, pero la antigüedad **no basta**
  para decidir solos (pueden contener datos perdidos en incidentes). Los **5**
  intercalados: **D, no tocar**. El backup **en claro**: prioritario por
  privacidad, pero **sin borrado automático**; queda documentado, sin
  imprimir su ruta, sin copiarlo y sin modificarlo.
- **Particiones sin proyecto: NO retirarlas al arrancar** (corrige la
  propuesta del diagnóstico). Solo detectar y contar.
- Fuera de cualquier limpieza automática, siempre: `.tmp-fallido-*`,
  `.tmp-huerfano-*` que abra como SQLite, `.gen` apartados, journals,
  cuarentenas, `.panorama-rekey`, `.panorama-restauraciones`, `rescate-*` y
  temporales de acción no decidibles.
- Cuando se aborde: una acción **explícita y reversible**, reutilizando la
  cuarentena y la confirmación del Bloque 5.

**Producción instalada vs código auditado.** La v2.0.55 instalada todavía
puede generar algunas familias históricas de residuos; el código auditado ya
cerró varias de esas fuentes. En esta ronda **no** se ha intentado arreglar la
instalación: eso refuerza que D4 / versión / release siguen siendo necesarios
al final.

---

*Diagnóstico (se conserva tal como se entregó):*

**No se ha borrado nada ni se ha tocado producción.** Todo lo medido sobre los
datos reales es de **solo lectura** (`stat`, BD leída a memoria, cabeceras),
con la BD viva y la de P10 hasheadas antes y después: **idénticas**
(`D5C3FF53…`, 77 824 B; 30 entradas de primer nivel).

### Lo primero: quién escribe hoy los datos reales

**La v2.0.55 instalada (12 sept), anterior a A3.3**: la BD viva no tiene
`db_commit_id`, no hay `.gen` ni ninguna carpeta `.panorama-*`, y el último
arranque de `app.log` es `v2.0.55`. Por tanto:

- **en producción, hoy**, los mecanismos que A3.3 cerró (archivo antes que
  fila, purga con `unlink` ignorado, sobrescritura entre equipos) **siguen
  vivos** hasta que se publique la versión auditada;
- **con el código auditado**, esos no; pero quedan otros (abajo).

### El hallazgo original, medido

| | auditoría | hoy |
|---|---|---|
| backups sin fila | «~80 MB» | **117 archivos, 39,67 MB** |
| de ellos, anteriores a la fila más vieja de su proyecto (restos de purga) | — | **112** |
| **intercalados** entre filas (otro origen) | — | **5** |
| cifrados / **en claro** | — | 116 / **1** |
| filas sin archivo · duplicados exactos · proyectos por encima de 15 | — | 0 · 0 · 0 |

La cifra de ~80 MB **no se reproduce**: el total de *todos* los backups es
102 MB; los huérfanos son 39,67. Los 5 intercalados (1 sept, 15:25) los guardó
una instancia **v0.1.62** y sus filas desaparecieron después: **sobrescritura
de la BD entre equipos, anterior a A3.3**, no la purga. No se pueden meter en la
misma regla que los otros 112.

### Lo que el diagnóstico encontró y la auditoría no contaba

- **Particiones de proyectos borrados.** 17 carpetas en `Partitions`, **7 sin
  proyecto** (71,96 MB, de ellos 70,89 MB caché). **Medido en Electron real con
  el código auditado:** tras borrar un proyecto, `clearStorageData()` vacía sus
  datos (Local Storage = 0 claves) pero **la carpeta sobrevive** al borrado y al
  reinicio (51 archivos, 1,87 MB). **El mecanismo sigue activo.**
- **CV huérfanos por mecanismos vivos:** «Eliminar evaluación» e «Importar»
  quitan la referencia **sin retirar el archivo**. Los 5 CV reales son **no
  decidibles** sin la clave: `estado.json` va cifrado. Y los CV **nunca** se
  cifran.
- **Los huérfanos escapan del rekey.** Demostrado: al **activar** la Seguridad,
  un huérfano **se queda en claro**; al **cambiar** la contraseña, un huérfano
  cifrado (y un `rescate-restauracion-*`) **ya no se abre** con la nueva.
- **Restos de corte que impiden arrancar.** Una `.panorama-rekey` o una
  `.panorama-restauraciones/<id>` **sin journal, incluso vacías**, cierran la app
  al arrancar (PS-2004 / PS-2006). La segunda, además, bloquea en caliente
  **todos** los guardados. Es fail-closed a propósito, pero sin salida
  automática.
- **Tmp de acción sin journal** (corte entre F1 y F2): nadie lo mira nunca. Para
  Evaluación de Candidatos —que **no** usa localStorage— puede ser lo único que
  quede de los últimos cambios.

### Dos defectos demostrados (NO corregidos)

1. **Documental.** Bloque 4 §9 y Bloque 5 (d) aprobaron «al arrancar se
   recorre, se **cuenta y se registra** en `app.log`», y la auditoría lo da por
   hecho. **En el código no existe**: ningún `readdirSync` recorre las carpetas
   de backups y ninguna línea de log habla de huérfanos (`C1-D1..D4`).
2. **Mensaje engañoso.** Con una `.panorama-rekey` sin journal, cambiar la
   contraseña responde «cierra esta app y vuelve a abrirla: **al arrancar se
   resuelve sola**». El arranque, con esa misma carpeta, **se cierra**
   (`C1-E9a..d`). Lo mismo, en menor grado, dice `rekeyPuedeEmpezar` de una
   restauración sin journal.

### Clasificación

**A** conservar · **B** eliminable, demostrado · **C** eliminable con condición · **D** no tocar

| Residuo | Vivo | Lo crea | ¿Se limpia solo? | Clase |
|---|---|---|---|---|
| backup sin fila, anterior a toda fila | 112 · 39 MB | purga vieja (v2.0.x) | **no, se acumula** | **C** — antigüedad demostrada + sin journal + decisión del usuario. Puede contener datos perdidos en incidentes (0.1.52) |
| …de ellos, el **en claro** | 1 | ídem, antes de activar la Seguridad | no | **C, prioritario** (dato personal en claro en Drive) |
| backup sin fila **intercalado** | 5 | fila perdida entre equipos (v0.1.62) | no | **D** |
| fila sin archivo | 0 | borrado a mano | **sí**, al salir del cupo | A (nada que hacer) |
| `.sqlite3.tmp-fallido-` | 0 | fsync/escritura fallida | no | **A** — puede ser la única copia íntegra de un cambio no confirmado |
| `.sqlite3.tmp-huerfano-` | 0 | rename perdido / corte | no | **C** — solo si se lee bien y **no abre** como SQLite |
| `.gen.*` apartados | 0 | bootstrap / creación fallida | no | **A** |
| tmp de acción sin journal | 0 | corte F1→F2 | no | **D** |
| journal propio pendiente / resuelto | 0 | protocolo | **sí** (CASO A/B) | A (no tocar a mano) |
| journal ajeno / ilegible | 0 | otro equipo / Drive | no | **D** (el ilegible bloquea todo) |
| `.panorama-borrados/<id>` | 0 | protocolo | **sí** | A |
| `.panorama-restauraciones/<id>` sin journal | 0 | corte R2→R3 | no, **bloquea el arranque** | **D** (en Drive, «vacía» no demuestra nada) |
| `.panorama-rekey` sin journal | 0 | corte / limpieza a medias | no, **bloquea el arranque** | **D** |
| `.escribiendo-*` | 0 | corte en escritura durable | no | sigue a su carpeta; suelto: D |
| `rescate-restauracion-*` | 0 | A2, restauración irreparable | no | **A** |
| CV no referenciado | 5 no decidibles | del-eval, importar, removeCv fallido, `verificado:false` | no | **C** con la clave de la sesión; sin ella **D** |
| `Partitions/<p>` sin proyecto | 7 · 72 MB | borrado de proyecto (**activo**) | no | **C** — sin fila + sin journal que la cite + antigüedad |
| `backups/<slug>` y `projects/<id>` vacías de proyecto borrado | 2 (solo `desktop.ini`) | borrado antiguo | no | B, sin valor práctico (0 B) |
| fila `meeting_preps` sin proyecto | 1 | borrado antiguo (P6) | no | C — requiere commit; inocua |
| `.panorama-write-check-<pid>` | 1 · 0 B · 28 ago | sonda cortada | no | C — pid distinto y antigüedad (ya estaba en **C2**) |
| copias de emergencia locales | carpeta inexistente | corte de Drive | poda a 40 | A; la de un proyecto borrado queda (C) |
| `app.asar`/`app1.asar` sueltos, `app.asar.bak-*` | 2 + 2 · 110 MB | parches | poda a 2 al parchear | **C2**, no C1 |
| `desktop.ini` | **442**, creados hoy 06:15 UTC | **ajeno a la app** | — | **D** |
| caché raíz de Chromium | 54 · 7 MB | Electron | Electron | fuera de C1 |

### Relación con P10: **no son el mismo hallazgo**

P10 (`%APPDATA%\panorama-app`) es la **carpeta de datos por defecto**: la app
vuelve a ella si la configurada falla (**PS-1005**, y su `app.log` lo registra
el 12 sept). Mide **197,68 MB**, no ~85: 81 MB de `.asar`, **96 MB de
particiones**, 102 backups (11 MB) y su propia BD (`F71F4140…`, sin A3.3). Sus
102 backups **tienen fila en SU base de datos** y solo uno coincide con G:. Es
otro mundo, con otro propósito. **No se fusiona con C1.**

### Hallazgo aparte → P16

Una **partición viva** guarda **523 MB** de `Service Worker/CacheStorage` de un
**origen https externo**: lo más grande de toda la carpeta sincronizada. No es
residuo de C1 (el proyecto existe) ni se ha tocado. Registrado como **P16**.

### Propuesta mínima (NO implementada)

1. **Hacer lo aprobado y nunca hecho:** recuento por clase al arrancar, una
   línea agregada en `app.log`, sin rutas. Cero borrados.
2. **Cortar en origen lo que sigue produciéndose:** «Eliminar evaluación» e
   «Importar» retiran el CV **solo** con `aplicado:true / verificado:true`
   (misma regla que «Quitar CV»); corregir los dos mensajes «se resuelve sola».
3. **Retirar con el protocolo que YA existe** (cuarentena → commit con marca →
   purga, NO-CLOBBER, dominio de ocupación), **a petición explícita del
   usuario**, solo las clases C con su condición demostrada. Nada automático.
4. `Partitions/<p>` sin proyecto: el mismo protocolo, al arrancar y antes de
   que se cree ninguna sesión, con antigüedad mínima. *(**Rechazado** por el
   usuario el 16 sept: retirar al arrancar es demasiado agresivo antes de
   cerrar multi-PC/Drive. Solo se detecta y se cuenta — ver C1-B.)*
   *(Los puntos 1 y 2 se hicieron en **C1-A**; el 3 queda en **C1-B**.)*

### Nunca debe borrarse automáticamente

La BD y su `.gen`; `.tmp-fallido-`; un `.tmp-huerfano-` que abra; los `.gen`
apartados; **cualquier** journal (propio, ajeno o ilegible); cuarentenas;
material de restauración o de rekey, con o sin journal; `rescate-restauracion-*`;
los backups **intercalados**; todo lo que dependa de una clave que la sesión no
tiene; las particiones **vivas**; los `app.asar.bak-*`; lo que no tenga un
patrón propio de la app (`desktop.ini`); **P10 entera**. Y ninguna regla del
tipo «sin fila ⇒ basura» en una carpeta compartida: la fila del otro equipo
puede llegar **después** que su archivo.

**Riesgos de limpiar:** listados incompletos de Drive (la espera al arrancar es
una heurística de CPU ociosa), fila que llega más tarde desde otro equipo,
clave distinta, carpetas en uso por Chromium, y destruir la única evidencia de
incidentes pasados. **Riesgo de NO limpiar:** datos personales en claro (un
backup, los CV) en la carpeta sincronizada, y 110 MB de particiones y huérfanos
que Drive resincroniza.

**Archivos que tocaría una implementación:** `main.js` (recuento, retirada,
partición, mensajes) y `evaluacion-candidatos/plantilla_evaluacion_candidatos.html`
(del-eval, importar). **`db.js` no.**

**Evidencia.** `c1/test-c1-residuos.js` **122 OK / 0** (descriptiva: fabrica en
sandbox las 10 familias y mide lo que hace el código de hoy, incluida la regla
de la auditoría evaluada como modelo, `C1-R1..R6`), `c1/electron-c1.ps1`
**10 OK / 0** (partición de un proyecto borrado, app real) y
`c1/inventario-vivo.js` (el inventario de arriba, reproducible y de solo
lectura). Productivos sin cambios.

## B5 — CERRADO (16 sept 2026): un envío en curso no se repite

**Una línea, la que proponía la auditoría**, al principio de `doSubmit()`:

```js
if (els.btnSubmit.disabled) return;
```

`disabled` ya marcaba «hay un envío en vuelo», pero **solo lo respetaba el
botón**: un botón deshabilitado no dispara `click`, mientras que el listener
global de `keydown` llamaba a `doSubmit()` sin pasar por él.

**Contado sobre el renderer real, no razonado:**

| gesto | antes | ahora |
|---|---|---|
| un Enter | 1 | **1** |
| dos Enter | **2** | **1** |
| cinco Enter | **5** | **1** |
| click + Enter | **2** | **1** |
| doble click | 1 | **1** (nunca estuvo roto) |
| formulario inválido | 0 | **0** |

En los **cuatro modos** (`login`, `setup`, `change`, `disable`), y también en la
**ventana real** dentro de Electron. **No es un cerrojo permanente:** cuando el
intento termina con error, el botón se rehabilita y un envío posterior funciona.

### La defensa inferior sigue custodiada

El arnés real **se salta `doSubmit()` a propósito** y llama dos veces seguidas a
`securityWinAPI.submit()`. Medido: llegan dos entradas, **no se solapan**, la
segunda se rechaza, la contraseña final es la del primero, ningún archivo queda
con clave intermedia, el re-cifrado se registra una vez y no queda carpeta de
trabajo sin resolver. **A1 no se reabre**: es A1 quien lo contiene.

### Lo que NO se ha tocado

Ni `main.js`, ni `db.js`, ni `index.html`. Ni spinner, ni cambio de texto, ni
bloqueo de campos. **Cancelar/Escape siguen igual**: que estén disponibles
mientras main trabaja es peculiar, pero no forma parte del defecto demostrado y
ninguna prueba enseña corrupción por ello. Que no haya indicador de progreso
sigue siendo una mejora de UX posible y **no hecha**.

### Dos cosas que el diagnóstico corrigió del enunciado original

1. **En `setup` el segundo envío NO «se salta» los archivos**, como suponía la
   auditoría: los **detecta** («está cifrado pero no hay clave anterior con la
   que descifrarlo»), aborta todo-o-nada y lo deshace, con **PS-2003**. Esa
   mitad estaba superada por A1/Bloque 3.
2. **El mensaje confuso de `change` no llegaba a verse**: la ventana ya se había
   cerrado con el primer envío, así que la respuesta iba a una ventana
   destruida. El impacto era **menor** de lo que decía la auditoría, no mayor.

**Archivos:** `security-window/renderer.js`
(`190191B237A347B8…` → `4549911C8D814DAD…`, 6 220 B). Snapshot previo en
`claude/renderer.js.ANTES-B5-2026-09-16`.

**Evidencia.** `b5/test-b5-reentrancia.js` **68 OK / 0** y `b5/electron-b5.ps1`
**24 OK / 0**. **Una reversión** (`T-sin-guarda`), comprobada por
`b5/comprobar-reversiones-b5.js`, que además de romper la batería **reproduce
los números originales**: 2 Enter → 2 IPC, 5 Enter → 5 IPC, click + Enter → 2.

**Salió de aquí:** la ampliación de **P15** — la ruta completa también llega a
la **interfaz**, no solo a `app.log`.

## B4 — CERRADO (16 sept 2026): la persistencia, y el último patrón de aplicación parcial

**El cierre elimina la contradicción que había entre documentos.** La auditoría
decía «CERRADO en su mitad de `db.js`; PENDIENTE en la de `backup:save`»; el
handoff decía que las dos estaban cerradas. **Ninguna de las dos afirmaciones
tenía batería.** Ahora sí, y se cierra en tres partes explícitas:

| | Estado | Por qué |
|---|---|---|
| **A.** mitad `db.js` / `persist()` | **CERRADA por A3.3** | `persist()` y `markDirtyAndPersist()` no existen: los absorbió `aplicarYConfirmar()`, con frontera PRE/POST-confirmación y latch. Un solo punto escribe el `.sqlite3` |
| **B.** mitad `backup:save` | **CERRADA por el Bloque 4** | archivo + `INSERT` + `updated_at` + marca en **una** mutación anclada a `exigirCommitBase`, con journal durable y vuelta atrás por hash. El archivo huérfano del hallazgo ya no se produce por esta vía |
| **C.** patrón residual, hallado en el diagnóstico | **CERRADO en esta ronda** | `projects:reorder` hacía N commits; ahora es **una** operación |

### Lo que el diagnóstico midió, y lo que se ha corregido

El hallazgo apuntaba a `persist()`, pero lo que lo causaba era **N escrituras
sueltas donde debería haber UNA**. El Bloque 5 ya lo eliminó para los borrados
(D3). `projects:reorder` se había quedado con la forma vieja: un
`dbmod.run()` por fila dentro de un `forEach`.

**Reproducido cortando la publicación a mitad**, el archivo quedaba con
`sort_order = [null, null, null, null, 0]`: la primera vuelta confirmada, el
commit avanzado, el resto sin aplicar y nadie reponiéndolo.

**Ahora:** las N sentencias van en **una** `escribirMultiple` anclada al commit
sobre el que se calculó el orden. O se aplica todo, o no se aplica nada.
Medido en vivo: **un reordenado de 5 proyectos produce UNA publicación del
`.sqlite3`**, no cinco (`B4-R3f`, y `B4-RE1b` en Electron real).

**Sin journal, a propósito:** un journal existe para emparejar **archivos** con
filas. Aquí no hay ningún archivo — sería inventar un mecanismo nuevo para nada.

**Validación de entrada antes de construir nada:** un id no entero se convertía
en `NaN`, el `WHERE id=NaN` no casaba con ninguna fila y ese proyecto se quedaba
sin orden mientras los demás sí se movían. Ahora se rechaza. También los
repetidos, y la lista vacía sale antes de provocar un commit que no cambia nada.

**Observabilidad (continuidad de B3):** un fallo de persistencia que no fuera de
backup no dejaba **ninguna** línea — el registro de `db.js` no sale de la
memoria. El reordenado, que B4 ha demostrado que falla de forma observable, deja
ahora una línea: operación, número de proyectos, clase del error y motivo
saneado. **Sin la lista de proyectos y sin rutas.** Sin dedupe: es un gesto
manual, no puede hacer spam.

**El error se PROPAGA, no se devuelve como `{ok:false}`.** El renderer engancha
su aviso al `catch` de la promesa (ver el `dragend` de `launcher/renderer.js`) y
no mira el valor devuelto: devolver un objeto habría hecho que el fallo pasara
desapercibido.

### Lo que NO se ha tocado, por decisión explícita

`escribirAtomico`, la frontera PRE/POST, el latch, la recuperación de memoria,
el tratamiento de temporales y la acción de backup. La batería demuestra que se
comportan correctamente en los cuatro escenarios de fallo, y las secciones
`B4-A..Q` quedan como **custodia** de ese comportamiento.

**Asimetrías conocidas, documentadas y NO corregidas** (ninguna produce pérdida
ni inconsistencia demostrada):

| Caso | Qué pasa | Por qué no se toca |
|---|---|---|
| `updated_at` al abrir un proyecto | la ventana ya está abierta y registrada cuando se hace el `UPDATE`; si lanza, el usuario ve la ventana **y** un error | sin pérdida de datos |
| `backup_dir` en dos commits | si el 2º falla la fila queda con `backup_dir` nulo | **se autorrepara** (`ensureProjectBackupDirSlug`) |
| `projects:create` hornea el HTML después de la fila | el proyecto existe aunque el horneado falle | **se autorrepara**: si falta la copia se sirve la plantilla |
| rollback `DELETE FROM projects` | si el propio DELETE lanza, su error sustituye al del sembrado | real en diagnóstico, pero **sin escenario que demuestre daño adicional** |
| validación de entrada de `reorder` devuelve `{ok:false}` | el renderer solo mira el `catch`, así que un rechazo **de validación** pasa desapercibido | anterior a B4 y ajeno a la persistencia. **NO afecta al camino de fallo**: un fallo de commit **propaga la excepción** y el renderer sí lo ve (`B4-R2a`, `B4-RE2a`) |

**Limitación anotada, no resuelta:** no se hace `fsync` del **directorio** tras
el rename. En Windows/Node no hay una garantía portable equivalente. No se
intenta ninguna solución experimental.

**Residuos `.tmp-*` / `.tmp-fallido-*`:** **no** se limpian automáticamente, y
es correcto — la batería demuestra que tras una publicación fallida pueden
contener la única imagen nueva completa. Su acumulación pertenece a **C1**.

**Archivos:** `main.js` (el handler) y `db.js` **solo comentarios** — dos citas
a `persist()` que lo describían como si aún existiera. Comprobado: quitando los
comentarios, el código de `db.js` es **idéntico byte a byte**.

**Evidencia.** `b4/test-b4-persistencia.js` **144 OK / 0** y
`b4/electron-b4.ps1` **17 OK / 0**. **Dos reversiones** (`b4/revertir-b4.js`,
comprobadas por `b4/comprobar-reversiones-b4.js`):

| Reversión | Qué deshace | Rompe |
|---|---|---|
| `R-reorder-en-bucle` | vuelve el `forEach` con un commit por fila | 18 aserciones, y **reproduce el defecto medido**: `orden PARCIAL en disco: [null,null,null,null,0]` con **2 publicaciones** |
| `S-reorder-mudo` | quita el `appLog()` del fallo | `B4-R0d`, `R2f`, `R2g`, `R2h`, `R3e`, `O6` |

## B3 — CERRADO (15 sept 2026): los errores relevantes dejan de depender de `console`

**El alcance del cierre, dicho con precisión.** B3 cierra como *«los errores
relevantes ya no dependen exclusivamente de `console`»*. **NO** cierra como
«el logging sobrevive a una caída total de Drive» — eso es **P14**, abierto.

**La premisa, medida y no razonada.** La app empaquetada nunca abre DevTools,
no hay atajo ni entrada de menú que las abra, y ninguna ventana las tiene
abiertas. En el arnés real se provoca un `console.warn` por su camino real y
se comprueba que `app.log` **no crece ni un byte** (`B3-R2..R4`), mientras el
arranque de esa misma sesión sí ha escrito 7 líneas con `appLog()`
(`B3-R5`). O sea: `console.warn` es un **no-op** en producción.

**Lo que cambió en `main.js`, contado contra el snapshot previo** (no
afirmado: `claude/main.js.ANTES-B3-2026-09-15` vs actual):

| | antes | ahora |
|---|---|---|
| Sentencias de rastro (`appLog` / `appLogUnaVezPorSesion`) | 139 | **154** (+15) |
| …de ellas, con dedupe por sesión | 0 | **9** |
| `console.warn(` | 19 | **19** — B3 añade **al lado**, no sustituye |
| `catch {}` vacíos | 26 | **17** (−9: 7 journals + 2 exclusivas) |
| Usos de `motivoSinRutas()` | 0 | **15** (+ su definición) |

**Lo que se ha corregido, por clase.**

| Clase | Qué se hace | Casos |
|---|---|---|
| **C** — lo tiene que ver el usuario | UI existente (`psAlert` + el propio `#save-note`), sin canal nuevo | cifrado de backup, escritura del backup en carpeta, guardado del Directorio |
| **B** — basta rastro persistente | `appLog()`, una línea contextualizada, con dedupe por sesión donde el camino se repite | 8 casos en `main.js` |
| **A** — puede quedarse en consola | no se toca | 3 casos |
| **D** — ya cubierto antes | no se toca | 5 casos |

**El cifrado es FAIL-CLOSED.** Era el peor de los tres: si `encryptBackupPayload`
fallaba, se escribía `rawPayload` **en claro** y el único rastro era un
`console.warn` invisible. El usuario había activado el cifrado y escrito una
contraseña, así que creía que sus copias estaban cifradas. Ahora, si el
cifrado se pidió y falla: **no se crea el archivo** (el `getFileHandle(…,
{create:true})` ni se ejecuta), **no se marca como éxito**, los datos de
origen quedan intactos y el usuario lee *«No se pudo crear la copia de
seguridad cifrada. No se ha guardado una copia sin cifrar.»* Comprobado en el
dashboard real con una carpeta falsa en memoria que registra si llega a
crearse algún archivo: `B3-RC1a..k`, incluido el **contraste** de que con el
cifrado funcionando la copia sí se escribe y lo escrito es el cifrado.

### Dos defectos NUEVOS encontrados durante la implementación

**1. `storageSet` del Directorio no lanza: devuelve `false`.** Cablear el
aviso al `catch` no bastaba — por un fallo **real** de escritura el `catch`
no se disparaba y la pantalla ponía «Guardado hh:mm:ss» para un guardado que
no había ocurrido. Era **peor** que el `console.warn` mudo: mentía. Ahora
`saveState()` decide **por el valor devuelto**. Reversión `W2-ignora-el-valor`.
*(El dashboard ya lo hacía bien: `const ok = await storageSet(…); if(ok){…}`.)*

**2. El mensaje de la excepción trae la ruta completa.** Lo encontró el arnés
de Electron real, no la revisión del código: poner `path.basename()` en la
parte que escribimos nosotros no sirve de nada si justo después se concatena
`e.message`, porque un error de `fs` ya lleva dentro
`'C:\Users\<usuario>\…'`. Las **15** líneas nuevas pasan ahora por
`motivoSinRutas()`, que conserva el código del error y el nombre del archivo
y tira la ruta. Probado con el mensaje **exacto** que devolvió Windows
(`B3-S8a..e`) y en vivo (`B3-RC4d`). Las líneas anteriores **no** se tocan:
es **P15**.

### Dos reclasificaciones, contra lo que decía la autorización

| Caso | Autorizado como | Es | Por qué |
|---|---|---|---|
| `historial-reunion` | **C** (fallo mudo) | **D** | La ventana **ya** pintaba `⚠ No se pudo guardar automáticamente [Reintentar]` en los dos caminos de fallo. `preparacion-reunion/plantilla_preparacion_reunion.html` **no se ha modificado** |
| `backup-emergencia` | **B** (sin rastro) | **D** | Ya tenía un `appLog` en la línea de al lado. Era el **único** de los 19 `console.warn` que lo tenía |

**Lo que NO se ha hecho, por decisión explícita.** No hay canal `app:log`
genérico para renderers (comprobado: `B3-INV3`, `B3-INV4`). Los catch vacíos
inocuos —borrar un temporal, cerrar un descriptor, `statSync` de
contabilidad, limpiar material ya decidido— siguen exactamente igual
(`B3-E1`). `app.log` no se ha movido de sitio: eso es **P14**.

**Archivos:** modificados `main.js`, `dashboard/plantilla_dashboard.html` y
`directorio/plantilla_directorio.html`. `preparacion-reunion/…` se
fotografió y **no** se tocó. Instantáneas previas en
`claude/*.ANTES-B3-2026-09-15`.

**Evidencia.** `b3/test-b3-inventario.js` **85 OK / 0** y `b3/electron-b3.ps1`
**36 OK / 0** (`R1..R7` la premisa, `RC1` el cifrado, `RC2` el Directorio,
`RC3` el historial, `RC4` una línea de B3 llegando de verdad a `app.log`).
**Siete reversiones** (`b3/revertir-b3.js`, comprobadas por
`b3/comprobar-reversiones-b3.js`): cada una rompe la batería y **solo por lo
que anuncia**.

| Reversión | Qué deshace | Rompe |
|---|---|---|
| `V-cifrado-en-claro` | vuelve el fallback silencioso a texto plano | `B3-C1b/c/e/f`, `B3-D [C] cifrado` |
| `W-directorio-mudo` | el Directorio vuelve a `console.warn` | `B3-C2b/c/d/h`, `B3-D [C] directorio` |
| `W2-ignora-el-valor` | `saveState` ignora el `false` de `storageSet` | `B3-C2j` |
| `X-historial-mudo` | el historial deja de pintar el aviso | `B3-C3a/b/d`, `B3-D [D] historial` |
| `Y-limpieza-muda` | los dos catch de limpieza vuelven a estar vacíos | `B3-E2/E5/S4`, `B3-D [B] cleanup` |
| `Y2-rutas-en-el-log` | el motivo vuelve en crudo, con la ruta | `B3-S8a` |
| `Z-openpath-consola` | `openPathLogged` vuelve a depender de `console` | `B3-S3`, `B3-D [B] explorador` |

## P14 — ABIERTO (15 sept 2026): el registro persistente depende de Drive

`appLog()` escribe en `path.join(app.getPath('userData'), 'app.log')`. En esta
instalación `userData` es `G:` (Drive). Si lo que ha fallado es justo esa
carpeta, el aviso se intenta escribir **allí** — y `appLog()` no propaga su
propio fallo, así que el aviso desaparece sin dejar nada.

El código **ya conoce el patrón correcto** y lo usa en otro sitio: los backups
de emergencia anclan en `app.getPath('appData')`, la ruta local real de
Windows, *«para que siga funcionando aunque sea justo esa carpeta la que ha
dejado de responder»* (`localSafetyBackupsDirForProject`). `appLog` no lo hace.

**Decisión del usuario (15 sept 2026):** no se mueve `app.log` en B3. Queda
como pendiente propio, relacionado con **A3.3 Bloque 8 / ciclo de vida de
Drive**, donde vive el resto del problema. Medido en `B3-B6` y `B3-B7`.

## P15 — ABIERTO (15 sept 2026): los mensajes antiguos llevan rutas completas

Las **15** líneas que añade B3 pasan por `motivoSinRutas()`. Las ~139
anteriores concatenan `String((e && e.message) || e)` tal cual, así que un
`EPERM`/`ENOENT` mete la ruta completa, con el nombre de usuario de Windows.

**Ampliación (16 sept 2026, medida durante el diagnóstico de B5): no es solo
`app.log`. La ruta llega también a la INTERFAZ.** El segundo `setup` de un
envío duplicado devuelve, y la ventana muestra:

```
No se ha cambiado nada: la operación se deshizo por completo …
Detalle: "C:\Users\<usuario>\AppData\…\backups\1-…\backup_….json" está cifrado
pero no hay clave anterior con la que descifrarlo.   (código PS-2003)
```

Comprobado en Electron real durante el diagnóstico de B5. Los mensajes de los
códigos PS-xxxx llevan el `Detalle:` literal **a propósito** —es lo que permite
diagnosticar—, así que el alcance real de P15 es mayor de lo que se registró el
15 de septiembre: **decidir qué detalle necesitan recovery y soporte antes de
sanear nada**. Aplicar `motivoSinRutas()` en bloque sería justamente lo que no
hay que hacer sin ese estudio.

No es urgente —es la carpeta de datos de la propia app, no documentos del
usuario— y cambiarlas todas de golpe tocaría los mensajes de los códigos
PS-xxxx, que llevan el detalle literal **a propósito**. Por eso B3 no lo hace:
sería otra decisión, no esta. El saneador ya existe y está probado
(`B3-S8a..e`), así que aplicarlo es mecánico cuando se autorice.

## P16 — ABIERTO (16 sept 2026): particiones de Chromium dentro de la carpeta sincronizada

**Sale del diagnóstico de C1, y no es C1**: no son residuos, son las
particiones de proyectos **vivos**.

Con la carpeta de datos en Drive, `app.setPath('userData', …)` lleva allí
**todo** el perfil de Chromium, incluidas las particiones de cada proyecto.
Medido en solo lectura (16 sept 2026):

| | |
|---|---|
| particiones vivas | 10 carpetas, **~755 MB** |
| de ello, caché regenerable | **~721 MB** (Cache, Code Cache, GPUCache, Dawn*, Service Worker) |
| una sola partición | **~523 MB** de `Service Worker/CacheStorage` de **un origen https externo** |
| datos reales (Local Storage, IndexedDB…) | ~33 MB |

Lo que hay que decidir, **no ahora**:

- **ubicación**: si las cachés deben vivir en Drive o en local (el mismo
  razonamiento que ya aplica `driveSyncGuardDataDir()` y que P14 plantea para
  `app.log`);
- **sincronización innecesaria**: Drive resube cachés que se regeneran solas;
- **crecimiento**: nada acota el tamaño de una partición;
- **ciclo de vida**: qué pasa con la partición al borrar un proyecto (hoy
  queda la carpeta — medido en C1, `C1-P5/P6`), y qué hacen dos equipos con el
  mismo perfil de Chromium.

Relacionado con **A3.3 Bloque 8 / ciclo de vida de Drive** y con **P14**. Ojo:
las particiones guardan también los **datos vivos** del proyecto (su
localStorage), así que no son «caché» en bloque. **No se ha borrado ni movido
nada.**

## B1 — CERRADO (15 sept 2026): el listado deja de repetirse, de escribir y de callarse

**Cuatro objetivos, medidos antes y después.**

| | antes | ahora |
|---|---|---|
| Lecturas del backup | **4 por proyecto** | **1** |
| Lecturas del `estado.json` de CV | **2 por proyecto** | **1** |
| Consultas SQL `get` (3 proyectos) | **36** | **6** |
| `mkdirSync` por pasada | **18** | **0** |
| `UPDATE projects` con `backup_dir = NULL` | **1** | **0** |
| Rastro de un backup ilegible | **ninguno** | **una línea en `app.log`** |
| `computeStaffingRatio` en el listado | sí | **no** |

**1. Contexto de pasada, no caché general.** `nuevoContextoListado()` crea tres
`Map` y un `Set`; nace en `listProjectRows()`, se pasa hacia abajo y **muere al
volver**. No hay ninguna referencia fuera de esa función. Esa es la propiedad
que impide que la optimización toque **P13**: una pasada ve un snapshot
coherente, la siguiente vuelve a leer disco. Está probado en las dos
direcciones — `B1-A8` (dentro de una pasada ningún archivo se lee dos veces) y
`B1-A7` (entre pasadas, el backup nuevo se ve).

`ctx` es **opcional** en todos los helpers: sin él se comportan exactamente como
siempre, así que `meeting:getProjectData` y Preparación de Reunión **no cambian**.

**2. Lectura pura.** El listado usa `readBackupPayload(…, {puro:true})` y
`rutaEvaluacionPura()`. Antes, `backupsDirForProject()` → `ensureProjectBackupDirSlug()`
hacía `UPDATE projects SET backup_dir` + `mkdirSync` — una **escritura lateral
en un canal de lectura**, el mismo patrón que A2 sacó del restore (R1).
`backupsDirForProject()` **no se ha tocado**: los otros llamadores siguen igual.
Un proyecto legacy con `backup_dir = NULL` obtiene sus extras por la ruta
derivada y **conserva su NULL** tras listarlo.

**3. Rastro sin spam.** `avisarExtraDegradado()` escribe **una línea por
proyecto + recurso + pasada** en `app.log`, con id, recurso y clase de fallo, y
sin volcar payload. Antes no quedaba **nada**: las `compute*` no lanzan, así que
el `try/catch` con `console.warn` no llegaba a ejecutarse nunca y una tarjeta con
el backup corrupto era indistinguible de una sana. **Esto no cierra B3**: es el
mínimo para que B1 no degrade en silencio absoluto. Sin diálogos, sin banners,
sin tocar la UI del lanzador.

**4. `computeStaffingRatio` fuera.** La creó 2.0.56 para la vista de Lista, y
**E1 retiró esa vista**. No la consumía nadie y costaba una lectura completa del
backup por proyecto y refresco. **El helper sigue existiendo**, intacto y sin
llamadores, para el día en que se termine la opción B de E1 — reincorporarlo
será una decisión consciente. `staffingActive`/`staffingTotal` salen de la
respuesta. `serviceStatusKind` **se conserva**: forma parte del contrato
estructurado que creó E2.

**Evidencia.** `b1/test-b1-p13.js` **77 OK / 0** y `b1/electron-b1.ps1`
**24 OK / 0** — en el arranque real: varios proyectos, uno con el backup
corrompido a mano, comprobando que el lanzador sigue funcionando, que los demás
conservan sus extras, que **la huella de la carpeta de datos no cambia**, que la
BD no crece y que la línea aparece en el **`app.log` de verdad**.

**Cuatro reversiones** (`b1/revertir-b1.js`): `R-sin-memo` **6 fallos**,
`S-sin-ruta-pura` **11**, `T-sin-log` **11**, `U-con-staffing` **16**.

**Un solo archivo productivo:** `main.js`.

## P13 — ABIERTO / ACEPTADO TEMPORALMENTE (15 sept 2026)

**Severidad: baja-media. Decisión del usuario: no se cambia la fuente ahora.**
Cambiarla sería una rearquitectura con riesgos mucho mayores que la ventana
temporal observada.

> **El lanzador sirve un SNAPSHOT del último backup persistido.**
> **El dashboard abierto trabaja sobre el estado VIVO.**

**Por qué se acepta, con lo medido delante:** la divergencia existe y afecta a
**todos** los extras derivados del backup —no solo al aviso de servicio—, pero
**no es permanente**: `maybeBackup('interval')` converge cada ~15 s si hubo
cambios, cerrar la ventana fuerza un backup y converge (medido: los backups
suben de 4 a 5 y el lanzador se actualiza), y con el proyecto cerrado el último
backup **es** el estado disponible.

**B1 no lo ha empeorado**, y está probado: su caché vive dentro de una sola
pasada. `P13-R1..R14` siguen verdes después de la corrección.

Se reconsiderará junto con arquitectura/frescura posterior si hace falta.

### Diagnóstico original (se conserva)

Descubierto al medir E2, y **deliberadamente fuera de su alcance**: no es
duplicación de lógica, es de dónde lee cada uno.

- `main.js` → `computeServiceEndWarning()` → `getProjectStateForMeetingPrep()` →
  **el último backup** del proyecto.
- El dashboard → `state` **en memoria**, el estado vivo.

Consecuencia: **con la misma función**, si el usuario cambia las fechas y aún no
se ha guardado un backup, el lanzador sigue mostrando el mensaje calculado sobre
las fechas viejas. Por eso el arnés de E2 guarda un backup en cada escenario
antes de comparar: para medir la lógica y no la frescura.

Dicho en los términos exactos que el usuario pidió dejar escritos:

> **E2 garantiza: MISMA ENTRADA → MISMO RESULTADO.**
> **E2 NO garantiza todavía** que el lanzador y el dashboard estén leyendo *la
> misma versión temporal* del estado.

Relación con **B1**: `projects:list` ya lee el estado del proyecto cuatro veces
por proyecto, y ahí es donde vive esta lectura. Si B1 se aborda, este pendiente
debería decidirse en la misma ronda. **No se convierte E2 en una
rearquitectura de `projects:list`.**

## P12 — CERRADO (15 sept 2026): sin rango demostrable no se infiere progreso

**La regla, en una sola noción.** Se añade `rangoTemporalValido(start, end)` —
`start` válida, `end` válida, `end > start` — y **todo** lo que dependía de la
escala temporal cuelga de ella:

| | sin rango válido | con rango válido |
|---|---|---|
| `pctOf()` | **0** (guarda **antes** de dividir) | idéntico a antes |
| progreso / días | `0%`, `día 0 de ~0` | idéntico a antes |
| marcador **HOY** | **no se dibuja** | se dibuja |
| «FIN ESTIMADO» y tramo de prórroga | **no se dibujan** | se dibujan |
| cabecera del rail | **vacía** | `01 ENE 2026 → 31 DIC 2026` |
| carril base gris | **sí se dibuja** (gráfico vacío, no un hueco) | sí |

**Tres decisiones que valen más que el código:**

1. **Los días NO se sanean por separado.** Un `Number.isFinite()` suelto habría
   quitado el `NaN` dejando la mentira: con `serviceStart === serviceEnd`,
   `totalDays` sale 0 y `daysElapsed` 258 —los dos finitos— y el texto diría
   **«día 258 de ~0»**. Van atados a la misma condición que el porcentaje.
2. **La guarda va ANTES de dividir, no después.** Con denominador 0 la división
   no siempre da `NaN`: `n/0` es `Infinity`, y `clamp` lo convertía en un
   **100 % perfectamente creíble y perfectamente falso**. Como `today` lleva la
   hora del reloj, ese era justo el caso que se veía en vivo.
3. **El marcador HOY no se coloca en `x(0)`.** 0 es un valor de cálculo, no una
   posición real: pintarlo afirmaría que hoy es el comienzo de un servicio que
   ni siquiera tiene fechas. Se usa el patrón conservador que el rail ya tenía
   para «FIN ESTIMADO»: **guarda → no dibujar**.

**No se ha inventado UX nueva.** La cabecera sin rango se deja **vacía**: ni
«Fechas pendientes» ni nada. `fmt()` **no se toca** (47 consumidores).

**Un solo archivo productivo:** `dashboard/plantilla_dashboard.html`
(`F1AC8F6DFA9A6ED7…` → `AB543AE8433A0205…`, 364 771 → 368 560 B). Snapshot previo
en `claude/plantilla_dashboard.html.ANTES-P12-2026-09-15`.

**Evidencia.** `p12/test-p12-nan.js` **73 OK / 0** (matriz P12-1, 2, 3, 3b, 3c,
3d, 4 y 5, con `renderRail()` ejecutada) y `p12/electron-p12.ps1` **32 OK / 0**
en el dashboard real: proyecto nuevo → `0% · día 0 de ~0`, cabecera vacía, sin
marcador, **`executiveStatus().progressPct = 0`**, resumen ejecutivo
«Progreso del servicio: 0%» y **cero errores de atributo SVG en toda la sesión**;
control con fechas válidas → `71% · día 258 de ~364`, marcador y «FIN ESTIMADO»
como siempre. Regresión completa sin cambios y BD viva idéntica.

**Tres reversiones** (`p12/revertir-dashboard.js`): `M-sin-guarda-rango` → **17
fallos**, `N-hoy-sin-rango` → **6**, `O-dias-sueltos` → **1**. Cada una tumba lo
suyo y solo lo suyo.

**Queda anotado, sin tocar:** un proyecto **sin** fechas de servicio pero **con**
hitos dibujaría todos sus hitos en el origen del carril. Ya no produce `NaN`
—que era el defecto—, pero se amontonan. No entra en P12: es un caso que exige
decidir UX, y esta ronda era robustez numérica.

### Diagnóstico original (se conserva)

Hallazgo incidental del arranque real de E1, ajeno a E1 y no provocado por
ninguna ronda: `dashboard/plantilla_dashboard.html` estaba en
`F1AC8F6DFA9A6ED7…`, el hash que el handoff registraba como «no modificado en
ninguna ronda».

**Causa raíz, una sola:**

```js
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function pctOf(dateObj, start, end){ return clamp((dateObj-start)/(end-start),0,1)*100; }
```

Un proyecto nuevo nace con `serviceStart: null, serviceEnd: null`, y `render()`
hace `new Date(state.serviceStart+'T00:00:00')` → la cadena `"nullT00:00:00"` →
**Invalid Date**. El denominador `(end-start)` es `NaN`, `clamp` **no** sanea
NaN (`Math.min/Math.max` lo propagan) y el resultado contamina cuanto lo use.

**Dos manifestaciones del mismo denominador cero**, según el numerador:

| | resultado | efecto |
|---|---|---|
| `0/0` (sin fechas, o `today` exactamente igual a `start`) | `NaN` | coordenada rota, `"NaN%"` |
| `n/0` (fechas iguales pero `today` con hora) | `Infinity` → `clamp` → **100** | un **100 % falso**: «día 1 de ~0» |

**Alcance — no es solo un gráfico que no se pinta:**

- 6 coordenadas NaN en la vía de despliegue (1 `x1`, 2 `x2`, 2 `cx`, 1 `x`);
- el KPI **«Progreso» muestra literalmente `NaN% · día NaN de ~NaN`**;
- la cabecera del rail muestra **`INVALID DATE → INVALID DATE`**;
- `executiveStatus()` calcula **otro** `progressPct` con el mismo `pctOf`, y ese
  llega al panel «Estado Ejecutivo», al **resumen ejecutivo copiable** y a la
  **exportación a PowerPoint** — o sea, el `NaN%` **sale de la aplicación**.

**Lo que NO pasa:** no hay excepción, el dashboard carga entero
(`readyState==='complete'`, 77 botones, 67 contenedores rellenos), los renders
posteriores se ejecutan, `saveState`/`render` siguen definidos y no se corrompe
ningún dato guardado.

**Ventana de exposición:** el asistente obligatorio solo se dispara si el
proyecto conserva el **nombre de fábrica**. Un proyecto creado desde el lanzador
ya trae su nombre real, así que **no pasa por el asistente** y se abre sin
fechas: el `NaN%` se ve en el camino más común de todos, hasta que el usuario
rellene «Ajustes del servicio».

**Evidencia:** `p12/test-p12-nan.js` **43 OK / 0** (matriz P12-1..P12-5 con
`renderRail()` ejecutada contra un DOM doble) y `p12/electron-p12.ps1`
**20 OK / 0** (dashboard real). Las dos **describen el defecto**: dan verde
porque sigue ahí.

## Corrección de evidencia (15 sept 2026)

Durante la preparación del Bloque 5 se descubrió que **los arneses de los
bloques 1–4 identificaban mal la ubicación real de los datos**: leían
`location.json` buscando `dir`/`path`, y la clave real es `userDataDir`. El
guardián «no ejecutes dentro de la ubicación real del usuario» estuvo **inerte**
toda esa etapa; protegieron la cadena literal `bd-panoramaservicio` y la marca
obligatoria `_a33-…-PRUEBAS`.

De ahí se deriva algo que afecta a cómo se leen las pruebas ya ejecutadas:

- La referencia `F71F4140…`, 57 344 B, que las suites llamaban **«producción
  intacta»**, es la **base de datos local residual de P10**, no la base viva.
- La **BD viva** configurada es
  `G:\Mi unidad\BD-PanoramaServicio\panorama.sqlite3` —
  `52394C7A0CB83D8B170F514C10522BF74FCA01D6D3F54160544B7D1375A01F16`, 77 824 B.
- Por tanto **las rondas anteriores no demostraron por hash que la BD viva
  quedara intacta**. Es **pérdida de evidencia, no evidencia de corrupción**: no
  hay ningún indicio de que se modificara.
- Desde la corrección, las nueve baterías hashean la BD viva antes y después y
  abortan con **exit 98** si cambia. Detalle en `a3-3-bloque5-borrados.md` §4.11
  y la nota de evidencia invalidada en `a3-3-bloque3-diseno.md` §13.3.

## Del informe de auditoría, sin abordar

Ver `claude/auditoria-2026-09-13.md`, que ahora lleva su propia tabla de estado
global. Lo más relevante que **sigue abierto**:

- **E1** — → **CERRADO el 15 sept 2026 retirando los botones**, que era una de
  las dos salidas que el propio hallazgo planteaba. Ver §«E1 — CERRADO» arriba.
  **Deja de bloquear la publicación.** Lo que **sigue abierto** de ese párrafo es
  la otra mitad: `package.json` en **2.0.55** con código **2.0.56** dentro (D4 de
  la auditoría). Eso no lo toca esta corrección.
- **B1** — `projects:list` lee el último backup 4 veces por proyecto (~16 MB
  síncronos por refresco con los datos reales). → **ABIERTO.**
- **C1** — ~80 MB de backups huérfanos en la carpeta de Drive. → **ABIERTO.** El
  *mecanismo* que los generaba lo cerró el Bloque 4 (P7); los archivos ya
  acumulados siguen ahí. El Bloque 5 solo los **cuenta y registra**, no los
  borra.
  **Corrección (16 sept 2026):** ese recuento **no llegó a implementarse** — no
  existía en el código. Y la cifra medida es **39,67 MB** (117 archivos). Ver §C1.
  **C1-A (16 sept 2026):** el recuento ya existe y las fuentes activas están
  cortadas → **C1-A CERRADO**. La retirada de lo histórico, **C1-B, DIFERIDA**.
- **E2** — `computeServiceEndWarning` duplicada y ya divergida entre `main.js` y
  el dashboard. → **ABIERTO.**
- **F1** — 76 `innerHTML` sin función de escape en el dashboard. → **ABIERTO —
  DIAGNOSTICADO (16 sept 2026), sin implementar.** Ver §F1 más abajo.

---

## §F1 — Interpretación de datos como HTML (frontend). DIAGNÓSTICO, sin implementar

Ronda de **solo diagnóstico** (16 sept 2026). No se ha tocado ni una línea de
producción: `main.js`, `dashboard/`, `directorio/`, `preparacion-reunion/` y
`evaluacion-candidatos/` intactos por SHA-256 antes y después. Batería en
`claude/pruebas-a33/f1/` (`test-f1-sinks.js` **100 OK/0** descriptiva +
`electron-f1.ps1` **34 OK/0** en la app real, 3 arranques, con marcadores
**inocuos**: una `<b>`, un `data-f1a` y una `<img>` con `onerror` que solo pone
un atributo en `<html>` — sin red, sin APIs sensibles, sin acciones
destructivas). El informe completo se entregó en el chat de esta ronda.

**Qué es F1, medido:** el dashboard construye su HTML con plantillas y mete los
datos del usuario **sin escapar** en ~20 interpolaciones. Las otras tres
plantillas (Directorio, Evaluación, Preparación) **sí** tienen función de escape
y la usan bien en el texto; les quedan residuos en atributos.

**Severidad real (sin exagerar):** **NO es RCE.** Las 4 ventanas medidas tienen
`contextIsolation:true` **y `sandbox:true`** y no exponen Node al mundo principal
(`require`/`process` = `undefined`, confirmado también en el mundo aislado). Un
`onerror` inyectado ejecuta JS del renderer, no del sistema. Lo que sí hay
alrededor: `window.psConfirm` es **sobrescribible** (y `main.js` confía en su
respuesta para eliminar/restaurar), el puente `panoramaBridge` expone 25 métodos
(entre ellos `saveBackup`, `projectMenuAction` que llega a `proyecto-eliminar`,
los de CV), **no hay CSP** (F2) y **no hay `setWindowOpenHandler`** (F3) —
`window.open` abre una `BrowserWindow`, aunque la hija **no** hereda el puente.
La batería **no** invocó ninguna de esas APIs desde el contenido inyectado: la
exposición **solo se documenta**.

**Fuentes que llegan de verdad a los sinks (C/D/E/F):** importación de proyecto
desde `.json` de terceros (`projects:create` valida forma, no contenido);
importación por bloque de CSV/Excel; **backups** de otros equipos; y el
**Directorio**, que consolida el Equipo de todos los proyectos (propagación entre
ventanas). En uso normal es *self-XSS*; deja de serlo con contenido ajeno.

**Vías reproducidas en Electron real (todas con marcador inocuo):**
- **Dashboard, al ABRIR sin tocar nada:** 19 campos se interpretan y ejecutan
  (hito/riesgo títulos, mitigación/contingencia, skills, roles de columna,
  alias/rol de equipo, cobertura, fase, **logo** que rompe `src`). Los **id**
  importados rompen atributos. Una `<textarea>` (obs. de materialización) saca el
  marcador al abrir el formulario de edición. → **persistente por carga**.
- **Título horneado (lo más grave):** el `projectTitle` importado se hornea en
  `projects/<id>/dashboard.html` dentro del `<script id="factory-seed">`; un
  `</script>` en el nombre **cierra el script** y su `<img>` queda como hermano
  del seed → **se ejecuta en el arranque, antes de cualquier `render()` y del
  asistente de onboarding**, y persiste en el archivo (reaparece al reabrir).
- **Preparación de Reunión:** interpreta y ejecuta los textos del **backup**
  (títulos de hito/riesgo, rol) en sus "candidatos"; un id con comillas rompe el
  `onclick` inline de "Mencionar / Ya lo saben / Omitir".
- **Evaluación de Candidatos:** el texto libre queda **literal** (usa
  `escapeHtml`/`escapeAttr`), pero **peso y fecha** van crudos a `<td>`/`value=`
  y se interpretan; un id de tarea con comillas además **rompe el `querySelector`**
  de `applyEvalFilter` (efecto incidental: la pantalla deja de pintar bien).
- **Directorio:** el nombre de proyecto rompe el atributo `data-dedic`; el resto
  (nombre/rol con `escapeHtml`) queda literal.

**Sink que NO es defecto pese a ir crudo:** la etiqueta de versión del historial
va a `select.innerHTML`; Chromium **descarta ahí las etiquetas ajenas** (contexto
de parseo `in select`), así que queda como texto. **Seguro hoy por el parser, no
por escape** — si esa etiqueta se pintara en otro sitio, ejecutaría.

**Reparación mínima propuesta (NO implementada, por patrón):**
1. **Texto** → `escapeHtml` (la app **no necesita** admitir HTML de usuario: no
   admitirlo). Portar al dashboard la misma `escapeHtml` que ya usan las otras
   tres plantillas y aplicarla en las ~20 interpolaciones de datos + en los
   valores de atributo (incluidas `value="…"` y `data-*`).
2. **Título horneado** → al hornear el seed, escapar `<`/`>` como `<`/`>`
   dentro del JSON (o insertar por `textContent` del nodo, no por `String.replace`
   con `$`, que además interpreta `$&`/`$'`). Es el sink de `main.js`
   (`writeFactorySeedIntoTemplate`).
3. **`onclick` inline de Preparación** → construir los botones con `data-*` +
   listener, no interpolando el id en el `onclick`.
4. **`psConfirm`/borrado** → no hacer depender una acción destructiva de una
   función del mundo principal sobrescribible (endurecimiento aparte de F1).

**Riesgos de regresión a vigilar:** el markup **legítimo** que debe seguir
interpretándose (banderas `<span class="flag">…`, badges, SVG del rail con
números ya controlados, `modal.js` que ya usa `textContent`, los builders ya
escapados de Directorio/Evaluación/Launcher). Un reemplazo ciego de `innerHTML`
por `textContent` **rompería** esas estructuras — de ahí que la propuesta sea por
patrón, no masiva.

**Qué `innerHTML` NO tocar:** los literales estáticos, los que solo interpolan
constantes/enum o números ya validados (KPIs, SVG del rail), `vendor/modal.js`
(usa `textContent`), y los builders de Directorio/Evaluación/Preparación/Launcher
que ya escapan.

---

### F1 — IMPLEMENTADO Y CERRADO (16 sept 2026)

Reparación **por contexto**, no un reemplazo masivo: los 76 `innerHTML` del
dashboard siguen ahí (se escapó el **dato**, no se reescribió la vista).

| Archivo | Qué se hizo |
|---|---|
| `dashboard/plantilla_dashboard.html` | `escapeHtml` (texto/RCDATA) y `escapeAttr` (atributo) propias — era la única plantilla sin escape. ~19 sinks de texto, 6 `<textarea>`, 40 atributos con id, y los 42 escapes ad hoc (`&quot;`/`&lt;`) normalizados. El `<select>` del historial pasa a construirse por DOM. El logo se valida y se asigna por `img.src` |
| `main.js` | `serializarSeedParaScript`: `<` → `<` (escape JSON válido, round-trip exacto) y el reemplazo pasa a **función** para quitarle semántica a `$&`/`$'`/`` $` ``/`$1`. Únicas dos funciones tocadas |
| `preparacion-reunion/…` | Fuera el `onclick` con el id: `data-seg-id` + listener delegado. El markup propio del guion se conserva y el **dato** dentro va con `esc()`. `desescapar()` para que el `.txt` no salga con entidades |
| `evaluacion-candidatos/…` | Peso y fecha escapados; 46 atributos con id; los 9 selectores construidos con `CSS.escape` |
| `directorio/…` | `data-dedic` escapado (su lector ya leía por `dataset`, round-trip exacto) y el logo validado |

**Dos sinks aparecieron durante la implementación**, no en el diagnóstico: el
`<option>` de la lista de perfiles de cobertura y `${top.title}` del panel de
riesgo destacado. Los encontró la propia batería al volverse exigente.

**Qué NO se tocó:** `psConfirm`, `projectMenuAction`, el puente y los borrados
(defensa en profundidad, otro hallazgo); F2 (CSP) y F3 (`window.open`), que
siguen abiertos con su numeración; `preload*`, `security*` y `db.js`.

**Pruebas:** `f1/test-f1-sinks.js` **139 OK/0** (exigente: si alguien quita un
escape, se pone roja), `f1/electron-f1.ps1` **47 OK/0** en la app real (importar
con marcadores, reinicio, título horneado y proyecto horneado ANTES de F1),
`f1/revertir-f1.js` + `comprobar-reversiones-f1.js` **19 OK/0** (seis
reversiones, cada una rompe solo lo suyo).

**Efecto conocido, heredado (no causado por F1):** un proyecto cuyo archivo ya
estaba horneado roto *antes* de F1 tiene el seed ilegible; al reabrirlo se
rehornea con los valores de fábrica. No se pierde nada del usuario — sus datos
viven en `localStorage`/backups, no en el seed — y desde F1 no vuelve a pasar.
Medido en el modo `d` del arnés.

**Pendiente separado, menor:** `guionAsText` (`preparacion:1091`) borra con
`replace(/<[^>]+>/g,'')` cualquier tramo entre `<` y `>` del texto ordinario al
exportar el guion. F1 solo le añadió el `desescapar()` imprescindible. Queda
anotado como defecto funcional menor, sin corregir.

### Validación limpia (17 sept 2026) — 52 OK / 0

Ronda añadida a petición del usuario: **datos ORDINARIOS**, sin ningún marcador.
`f1/electron-f1-limpio.ps1` + `real-run/f1-limpio.js`, con capturas de las cinco
pantallas. Textos de prueba con caracteres legítimos: `I+D & Calidad`,
`Cliente "Norte"`, `Nivel < 3`, `A > B`, `José Álvarez`, `Diseño & Operaciones`.
Resultado: todo se ve **exactamente como se escribió**, sin una sola entidad
(`&amp;`, `&lt;`…) a la vista, sin markup, con el markup legítimo intacto y los
controles respondiendo. **No hay doble escape.** El guion exportado a `.txt`
sale con el texto exacto. Logos: el válido se ve, el inexistente no pinta nada,
el inválido se ignora sin dejar `<img>` roto.

### P17 — icono roto en la barra de título del dashboard horneado *(incidental, ANTERIOR a F1)*

**No es de F1 y no se ha tocado.** `dashboard/plantilla_dashboard.html` tiene
**dos** `<img src="../assets/icon-256.png">` (`:453`, pantalla de carga; `:458`,
barra de título) y `fixVendorScriptPaths` (`main.js:2575`) los reescribe con
`String.replace` de patrón **cadena**, que sustituye **solo la primera**. La
segunda conserva la ruta relativa, que desde `projects/<id>/` no resuelve: el
iconito de la barra de título sale roto en **todo** dashboard horneado.
Medido: 3 ocurrencias en la plantilla, **idénticas antes y después de F1**, y la
única imagen rota de la página en los tres casos de logo. Es la misma familia de
defecto que F1 corrigió en el seed (`String.replace` mal usado), pero en otra
función y fuera del alcance autorizado. **Pendiente, sin corregir.**
