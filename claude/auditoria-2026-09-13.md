# Auditoría completa — Panorama del Servicio (13 sept 2026)

Estado del árbol auditado: `package.json` en **2.0.55**, con código de **2.0.56**
a medio integrar (ver E1). Auditoría pedida por el usuario: "estructura, diseño,
arquitectura, estabilidad, recursos, todo... que todos los conceptos estén
alineados y estables".

**No se ha tocado ni una línea de código.** Solo diagnóstico.

## Metodología y honestidad sobre qué está comprobado

- **Lectura completa** de `main.js` (6.195 líneas), `db.js`, `security.js`, los
  5 preloads, `launcher/renderer.js`, `vendor/theme.js`, `vendor/modal.js`,
  `vendor/window-chrome.css`, los 4 renderers pequeños, `build/installer.nsh` y
  `claude/gen_snapshot.py`.
- **Barrido dirigido** (grep + lectura de las zonas señaladas) sobre las 4
  plantillas HTML grandes (11.277 líneas entre las cuatro).
- **Medición real sobre los datos del usuario** en
  `G:\Mi unidad\BD-PanoramaServicio\` (solo lectura de tamaños y fechas, no se
  abrió ni un backup).
- **NO se ha ejecutado la app.** Todo lo de abajo es diagnóstico por lectura de
  código o por medición de archivos en disco. Cada hallazgo lleva marcado si es
  **[MEDIDO]** (evidencia en disco) o **[LEÍDO]** (razonamiento sobre el código,
  sin haberlo visto pasar). Ninguno está marcado como "probado en vivo" porque
  ninguno lo está.

---

# ESTADO GLOBAL — reconciliación al 15 sept 2026
#### (revisada el 15 sept tras cerrar el Bloque 5 de A3.3; y de nuevo ese mismo día tras cerrar **A2** y **P2** con la ronda H-1)

**Los hallazgos originales de más abajo NO se han modificado ni se han
borrado.** Esta tabla es una capa de estado añadida encima, para poder saber en
qué punto está cada uno sin perder la traza de cómo se encontró.

Estados: **CERRADO** · **EN CURSO** · **PENDIENTE** · **ABSORBIDO** (lo resuelve
otro trabajo, que puede seguir abierto).

**Regla que se ha seguido: nada se marca CERRADO por haberse tocado de pasada.**
Un hallazgo solo pasa a CERRADO si hay una ronda con su diseño, su
implementación y su batería en verde.

### Hallazgos posteriores a esta auditoría

No llevan letra A–F porque no salieron de aquí. Se listan para no perderlos de
vista; su ficha completa está en `pendientes-abiertos.md`.

| # | Estado | Nota |
|---|---|---|
| **P13** — frescura del origen de datos | **ABIERTO / ACEPTADO TEMPORALMENTE — baja-media** (15 sept 2026) | **El lanzador sirve un snapshot del último backup persistido; el dashboard abierto trabaja sobre el estado vivo.** Descubierto al medir **E2** y dejado fuera de su alcance: no es duplicación de lógica sino de **origen**. **Decisión del usuario (15 sept 2026): no se cambia la fuente ahora** — sería una rearquitectura con riesgos mayores que la ventana temporal observada. Lo medido: la divergencia existe y afecta a **todos** los extras derivados del backup, pero **no es permanente** — `maybeBackup('interval')` converge cada ~15 s, cerrar la ventana fuerza backup y converge, y con el proyecto cerrado el último backup **es** el estado. **B1 no lo ha empeorado** (su caché vive dentro de una sola pasada, probado). Se reconsiderará con arquitectura/frescura posterior si hace falta |
| **P12** — `NaN` por dividir por un rango de fechas vacío | **CERRADO** (15 sept 2026) | Descubierto al arrancar el lanzador real durante la ronda de **E1**, y **ajeno a E1**. `pctOf()` dividía por `(end-start)`: con un proyecto nuevo (`serviceStart/serviceEnd` a `null`) eso era `0/0` → `NaN` en 6 coordenadas del rail, `"NaN%"` en el KPI de progreso, `INVALID DATE` en la cabecera — y el NaN llegaba a `executiveStatus()`, al resumen ejecutivo copiable y **a la exportación a PowerPoint**. Corregido con una sola noción, `rangoTemporalValido()`: sin escala demostrable no se infiere progreso (0 %, días 0/0) y los elementos que afirman una posición en el tiempo **no se dibujan** —el patrón que el rail ya usaba para «FIN ESTIMADO»—. Con rango válido, comportamiento idéntico al anterior. **Un solo archivo**: `dashboard/plantilla_dashboard.html`. Batería **73 OK/0**, dashboard real **32 OK/0**, tres reversiones (17/6/1 fallos). Detalle en `pendientes-abiertos.md` §P12 |

## A — Pérdida de datos

| # | Estado | Dónde se cerró / en qué va |
|---|---|---|
| **A1** | **CERRADO** | Ronda A1: re-cifrado atómico con journal v2, staging, `original_sha256`/`new_sha256` por elemento, recuperación al arrancar y fail-closed (PS-2004). Endurecido después en el Bloque 3 de A3.3 (rollback por hash, defecto real del `swapped.push` detectado por G4) |
| **A2** | **CERRADO** (15 sept 2026, ronda H-1) | **Cierre:** tras el cableado y la barrera durable vinieron dos rondas más. (a) `REST-ROLLBACK-FLUSH`: la **vuelta atrás** también relee la partición y la vuelca a disco **antes** de que se limpie el material —era el hallazgo abierto de §9.6—. (b) **H-1**, un defecto **real** que encontró la batería: con el flush de la reposición fallando, el material se conservaba bien y aun así se aceptaba un `backup:save` nuevo del mismo proyecto. Causas: `armado` tenía la semántica **invertida** respecto a su uso (ponerlo a `true` en los caminos fail-closed *garantizaba* que el `finally` soltara la barrera) y `f1Global()` no miraba `.panorama-restauraciones`. Corregido en dos capas —`mantenerBarrera` + `restauracionesSinResolver` en memoria, y `restauracionPendienteDeProyecto()` durable **por proyecto**, con lo no interpretable bloqueando a todos—, con `H1-1..H1-4b` y **dos reversiones que separan las capas** (`J` → 1 fallo, `K` → 10). Evidencia contra `main.js = DB75E6C2…`: automatizado **1745 OK/0** (doce baterías; `a2/test-cableado.js` 96 → **129**) y **Electron real 66 OK/0**, los nueve modos en una sola tirada, incluidos `RA-7/RA-7b` (corte duro tras la reposición y su cleanup), `RA-8` (P2 real) y `RA-9` (**PS-2006 real** con fail-closed al arrancar: diálogo correcto, código en el `detail`, el lanzador no abre, material intacto). BD viva idéntica por SHA-256 en cada ronda. Detalle en `a2-restore-bajo-a33.md` **§9 y §10**. **Sigue fuera, dicho en voz alta:** cuotas de `localStorage`, corte de corriente real, Drive con dos PCs, y el fallo del flush de la reposición en Electron real (se inyecta en el doble de `session`). — *Historia previa:* la corrección original sigue válida (el estado descartado no se convierte en backup). El 15 sept se **cableó el protocolo completo** bajo A3.3: barrera unificada de proyecto, quiesce de las tres familias, base capturada **después** del quiesce, foto previa durable y cifrada, journal con validación cerrada, commit de confirmación con marca + `exigirCommitBase`, NO-CLOBBER, recuperación al arrancar y precondición del rekey. Integración sobre código productivo **53 OK/0**; helper aislado **66 OK/0**; regresión **1669 OK/0**. Ese mismo 15 sept, ronda posterior: **barrera durable del `localStorage`** (`flushStorageData()` en R4, antes del commit de confirmación) con `REST-FLUSH-1..5` —integración **72 OK/0**, regresión **1688 OK/0**— y **arranques Electron reales de restauración**, `RA-1..RA-6`, **40 OK/0**, que cubren los siete puntos de §8.1. El diferencial de la barrera (matar el proceso con `TerminateProcess` justo tras el commit) da **con barrera 4/4 coherente, sin barrera 0/4**: es el defecto reproducido, no razonado. Detalle en `a2-restore-bajo-a33.md` **§9**. *(Ese «SIGUE NO CERRADO» quedó superado por la ronda H-1, arriba: el diálogo PS-2006 por el camino no demostrable se provocó en `RA-9`.)* |
| **A3** | Se dividió en tres | ver A3.1 / A3.2 / A3.3 |
| **A3.1** | **CERRADO** | Cerrojo de instancia única, verificado en Windows real |
| **A3.2a / A3.2b** | **ABSORBIDO por A3.3** | Registro de instancias y barrera de intención quedan cubiertos por la identidad de commit, `exigirCommitBase` y el `.gen` |
| **A3.3** | **Bloques 1–5 CERRADOS** | 1 (db.js), 2 (wiring), 3 (seguridad/A1), 4 (contratos archivo+BD/IPC) y **5 (borrados destructivos)**. El Bloque 5 se cerró el 15 sept con cableado productivo D1–D4 y arranques **Electron reales destructivos** en sandbox (71 OK/0 en E1–E7, 17 OK/0 en los dos casos de CV restantes), sobre 1550 OK/0 automatizados. Detalle en `pendientes-abiertos.md` §«Bloque 5 — CERRADO». **No cubierto y explícitamente fuera:** Drive con dos PCs reales, conflicto UI general, cierre/apagado global, empaquetado. *(A2 bajo A3.3 ya no está en esta lista: se cerró el 15 sept con la ronda H-1 — ver la fila de A2.)* |

## B — Estabilidad y rendimiento

| # | Estado | Nota |
|---|---|---|
| **B1** | **CERRADO** (15 sept 2026) | Se hizo lo que este hallazgo proponía —memoizar por proyecto durante la vida de una llamada a `listProjectRows()`— y tres cosas más que salieron al medirlo. **Medido antes → después:** lecturas del backup **4 → 1** por proyecto, del `estado.json` de candidatos **2 → 1**, consultas SQL `get` **36 → 6** (3 proyectos), `mkdirSync` **18 → 0**. El contexto **vive y muere dentro de una pasada** —no es una caché general— y por eso **no empeora P13**, probado en las dos direcciones. **`projects:list` pasa a ser lectura pura**: usaba `backupsDirForProject()` → `ensureProjectBackupDirSlug()`, que hacía `UPDATE projects SET backup_dir` + `mkdirSync` (el patrón R1 que A2 sacó del restore); ahora usa las rutas puras, y un proyecto legacy con `backup_dir = NULL` obtiene sus extras **conservando su NULL**. **Fin del silencio:** un backup ilegible no dejaba **ningún** rastro —las `compute*` no lanzan, así que el `try/catch` con `console.warn` nunca se ejecutaba—; ahora escribe **una línea en `app.log` por proyecto + recurso + pasada**, sin payload (esto **no cierra B3**). Y **`computeStaffingRatio` sale del listado**: E1 retiró su única vista consumidora y costaba una lectura completa del backup por refresco — el helper se conserva sin llamadores para la futura opción B de E1. Evidencia: batería **77 OK/0**, Electron real **24 OK/0** (con un backup corrompido a mano, comprobando huella de disco y `app.log` reales) y **cuatro reversiones** (6/11/11/16 fallos). **Un solo archivo:** `main.js`. Detalle en `pendientes-abiertos.md` §B1 |
| **B2** | **CERRADO** | Ronda B2: clases de fallo, `procesoComprometido`, el error llega al usuario y no solo a `app.log` |
| **B3** | **PENDIENTE, parcialmente reducido** | Los caminos que A3.3 ha reescrito sí registran en `app.log` con código PS-xxxx. Las **29 rutas del hallazgo original no se han auditado una por una**, así que no se declara cerrado |
| **B4** | **CERRADO** (16 sept 2026) | En tres partes, y ahora **con batería**: (A) `persist()` absorbido por A3.3; (B) `backup:save` cerrado por el Bloque 4; (C) el patrón residual —`projects:reorder` con N commits— corregido en la ronda B4. `b4/test-b4-persistencia.js` **144 OK/0** + Electron real **17 OK/0**. Ver §B4 |
| **B5** | **CERRADO** (16 sept 2026) | Una línea en `doSubmit()`. Medido: 2 Enter = 2 IPC → **1**; 5 Enter = 5 → **1**; click+Enter = 2 → **1**. Las capas inferiores no se tocan y siguen custodiadas. `b5/test-b5-reentrancia.js` **68 OK/0** + Electron real **24 OK/0**. Ver §B5. (El Enter que ya se había corregido era otro: el de editar el nombre del puesto en Evaluación de Candidatos, Bloque 4) |

## C — Recursos y basura acumulada

| # | Estado | Nota |
|---|---|---|
| **C1** | **ABIERTO — C1-A CERRADO / C1-B DIFERIDO** (16 sept 2026) | El **mecanismo** que generaba huérfanos lo cerró el Bloque 4 (P7). Los ~80 MB **ya acumulados** siguen ahí. El Bloque 5 solo los **cuenta y registra**, por decisión explícita del usuario. **Corrección del 16 sept:** ese recuento **no existía en el código** (`C1-D1..D4`); lo medido son **117 archivos, 39,67 MB**; y el mecanismo cerrado solo lo está en el código **auditado**: la v2.0.55 instalada es anterior a A3.3. **C1-A (cerrado):** el recuento ya existe (solo lectura, una línea), y se cortan las fuentes activas de CV y los mensajes falsos. **C1-B (diferido):** retirada de lo histórico, hasta tener garantías multi-PC/Drive. Ver §C1 |
| **C2** | **PENDIENTE** | ~112 MB de `.asar` dentro de la carpeta sincronizada. Sin tocar |
| **C3** | **PENDIENTE** | 1,4 GB de residuo de compilación. `dist/` está ausente ahora mismo, pero el hallazgo no se ha abordado |
| **C4** | **PENDIENTE** | `C:\Codigo Fuente PS - copia\`. Sin tocar |
| **C5** | **PENDIENTE** | 22 PNG de iconos de parche sin cargar. Sin tocar |

## D — Estructura y proceso

**Todo el bloque D queda PENDIENTE DE RELEASE FINAL.** Nada de esto se ha
abordado, y no debe abordarse mientras A3.3 siga abierto.

| # | Estado | Nota |
|---|---|---|
| **D1** | **PENDIENTE** | Sigue sin control de versiones |
| **D2** | **PENDIENTE** | `gen_snapshot.py` no ejecutable aquí |
| **D3** | **PENDIENTE** | Prueba de humo + desajuste de puerto |
| **D4** | **PENDIENTE** | `package.json` 2.0.55 con código 2.0.56 |

> No confundir estos **D1–D4 de la auditoría** con los **D1–D4 del Bloque 5 de
> A3.3** (`deleteProjectById`, `meeting:deletePrep`, purga de backups, CV). Son
> numeraciones distintas de documentos distintos.

## E — Coherencia de conceptos

| # | Estado | Nota |
|---|---|---|
| **E1** | **CERRADO** (15 sept 2026) — **ya no bloquea la publicación** | Se tomó la segunda de las dos salidas que el propio hallazgo planteaba: **retirar los botones**. Fuera el conmutador `#view-switch` de `launcher/index.html` — el **único** acceso del usuario a esas vistas (no había menú, atajo ni nada en `main.js`). **Lista y Resumen quedan RETIRADAS DE LA UI, no completadas:** el handler `portfolio:summary`, `portfolioSummary()`, `computeStaffingRatio()`, `setView()`, los helpers y el CSS **siguen presentes**; la limpieza del código muerto no forma parte de esta corrección. **No se completaron a propósito**, porque el `timeline` de `portfolio:summary` extrae los días con una regex sobre `serviceEndMessage` —texto producido por `computeServiceEndWarning()`—, y consolidar ese acoplamiento antes de resolver **E2** obligaría a rehacerlo. Evidencia: `e1/test-inventario-e1.js` **47 OK/0**, lanzador **real** `e1/electron-e1.ps1` **21 OK/0** (conmutador ausente del DOM, cero `data-view`, única vista visible la de tarjetas, crear/refrescar/reordenar/abrir siguen yendo, cero errores de renderer en el lanzador), regresión **1745 OK/0** sin cambios y **un solo archivo productivo tocado**, comprobado por hash. Detalle en `pendientes-abiertos.md` §«E1 — CERRADO». **Sigue abierto** lo otro que iba en el mismo párrafo: `package.json` 2.0.55 vs código 2.0.56 (**D4**) |
| **E2** | **CERRADO** (15 sept 2026) | Se hizo lo que este mismo hallazgo proponía: **mover la lógica a `vendor/` como función pura**. `vendor/service-status.js` es ahora la fuente única — `main.js` la carga con `require()`, el dashboard con `<script>`, y `fixVendorScriptPaths()` reescribe la ruta al hornear cada `projects/<id>/dashboard.html` (patrón ya existente para otros 6 archivos). **La divergencia estaba medida, no supuesta:** 4 de 20 casos daban resultados distintos, todos por el fix de v2.0.52 que entró solo en `main.js` — con el mismo proyecto, «Arranca en 3 días» en el lanzador y «Servicio finaliza en 20 días» en su propio panel. Contrato **datos primero, texto después**: `{kind, level, days, message}`, proyectado como `serviceStatusKind`/`serviceStatusDays` —no `serviceEndDays`, que sería falso en `proximo-inicio`— con la semántica del signo escrita en el helper. **Cambio visible e intencional:** gana la lógica de `main.js` y el dashboard pasa a decir también «Arranca en N días»; su presentación no cambia (rojo → rojo, el resto → ámbar). **Se cierra además el acoplamiento**: `portfolio:summary` ya no saca los días con `/(\d+)/` sobre el mensaje. Evidencia: batería **67 OK/0** (26 casos por **tres** caminos exigiendo `A === B === C`, wording literal, y una prueba que cambia el wording y demuestra que el timeline **no** se mueve) y Electron real **42 OK/0** (lanzador y dashboard a la vez, 5 escenarios). Dos reversiones: 28 y 3 fallos. Detalle en `pendientes-abiertos.md` §E2. **Queda aparte, registrado como P13:** el lanzador lee el último **backup** y el dashboard el estado **vivo** — misma lógica, distinta frescura |
| **E3** | **PENDIENTE** | 3 de 7 ventanas |
| **E4** | **PENDIENTE** | `nativeTheme.themeSource = 'dark'` fijo |
| **E5** | **PENDIENTE** | Colores fijos que ignoran el tema |
| **E6** | **CERRADO en la parte de guardado; PENDIENTE en la de exportar** | El Bloque 4 hizo que un guardado fallido de Evaluación de Candidatos sí se vea (banner persistente, sesión detenida). El **fallo al exportar** del hallazgo original no se ha tocado |
| **E7** | **PENDIENTE** | `THEME_KEYS` duplicado |

## F — Seguridad

**Todo el bloque F queda PENDIENTE según la auditoría original.**

| # | Estado | Nota |
|---|---|---|
| **F1** | **CERRADO** *(16 sept 2026)* | Corregido **por contexto** (texto/atributo/selector/handler/script/URL), sin reemplazo masivo: los 76 `innerHTML` siguen ahí, se escapó el dato. Batería **139 OK/0**, Electron real **47 OK/0**, 6 reversiones **19 OK/0**. Ver `pendientes-abiertos.md` §F1. *(Diagnóstico previo)* 76 `innerHTML` sin escapar en el dashboard (batería `f1/`: 100 descriptiva + 34 Electron real; producción intacta). Confirmado en la app real: 19 campos del dashboard se interpretan al abrir; **título importado horneado** ejecuta en el arranque (persistente); Preparación y Directorio reciben la propagación; Evaluación/Directorio casi todo escapado. **`contextIsolation`+`sandbox`+sin Node → no es RCE**; residuos: `psConfirm` sobrescribible, sin CSP (F2), `window.open` sin handler (F3). Ver §F1 y `pendientes-abiertos.md` §F1 |
| **F2** | **PENDIENTE** | Ninguna ventana declara CSP |
| **F3** | **PENDIENTE** | Sin `setWindowOpenHandler` ni guardia de `will-navigate` |
| **F4** | **PENDIENTE** | Los CV siguen sin cifrarse. El Bloque 5 ordena su **ciclo de vida** (D4a/D4b), que es otra cosa |
| **F5** | — | Lo que ya estaba bien; no es un pendiente |

## Corrección de evidencia que afecta a cómo se leen las pruebas

La medición de esta auditoría sobre `G:\Mi unidad\BD-PanoramaServicio\` era
correcta. Lo que estaba mal era **el guardián de los arneses posteriores**:
leían `location.json` buscando `dir`/`path` cuando la clave real es
`userDataDir`, así que la comprobación «no ejecutes dentro de la ubicación real»
quedó inerte, y lo que las suites llamaban «producción intacta» era
`%APPDATA%\panorama-app\panorama.sqlite3` (`F71F4140…`, 57 344 B) — la **base
local residual de C2/P10**, no la viva.

Es **pérdida de evidencia, no evidencia de corrupción**. Desde el 15 sept la
prueba canónica es el SHA-256 de la BD viva
(`52394C7A0CB83D8B…`, 77 824 B), comprobado antes y después de cada batería, con
aborto en exit 98 si cambia. Ver `a3-3-bloque5-borrados.md` §4.11.

---

# A. Pérdida de datos (crítico)

## A1. Cambiar la contraseña o desactivar la Seguridad deja ilegibles PARA SIEMPRE todas las Preparaciones de Reunión y Evaluaciones de Candidatos — [LEÍDO, alta certeza]

Es el hallazgo más grave de la auditoría.

`reencryptAllBackups()` (`main.js:2379`) recorre **solo la tabla `backups`**:

```sql
FROM backups b JOIN projects p ON p.id = b.project_id
WHERE b.file_path IS NOT NULL AND b.file_path != ''
```

Pero hay **otras dos familias de archivos cifradas con esa misma clave**:

| Qué | Dónde se cifra | Tabla con `encrypted` |
|---|---|---|
| Preparaciones de reunión | `meeting:savePrep` (`main.js:5385`), `meeting:updatePrep` (`main.js:5417`) | `meeting_preps` |
| Evaluación de candidatos | `candidateEval:save` (`main.js:5708`) | `candidate_evals` |

Las tres usan `encryptIfNeeded(payload, !!securityKey)` (`main.js:161`), o sea
la clave global. Pero en `security-win:submit` (`main.js:6113`):

- **`mode === 'change'`** (`main.js:6148`): `reencryptAllBackups(oldKey, newKey)`
  → recifra los backups, pone `securityKey = newKey` y **guarda una sal nueva**.
  Los archivos de `meeting_preps`/`candidate_evals` siguen cifrados con la clave
  vieja y con su fila diciendo `encrypted=1`. A partir de ahí,
  `meeting:getPrep` (`main.js:5463`) y `readCandidateEvalPayloadForProject`
  (`main.js:5530`) hacen `decryptString(securityKey /* = nueva */, raw)` → el
  tag GCM no valida → *"No se pudo descifrar el archivo"*. **Para siempre**: la
  sal vieja se sobrescribió, así que ni volviendo a teclear la contraseña
  anterior se puede regenerar la clave.

- **`mode === 'disable'`** (`main.js:6168`): descifra los backups,
  `securityKey = null`, borra `security_salt`/`security_verifier`/
  `security_enabled`. Las filas de `meeting_preps`/`candidate_evals` siguen con
  `encrypted=1` → el código entra en la rama *"está cifrada y la seguridad está
  bloqueada, desbloquéala"*... pero ya **no hay Seguridad que desbloquear**.
  Volver a activarla con `setup` genera una sal nueva y aleatoria
  (`newSaltHex()`, `security.js:29`), luego tampoco reconstruye la clave.

Impacto real: todo el historial de Preparación de Reunión y todos los puestos +
entrevistas + notas de Evaluación de Candidatos de **todos** los proyectos, con
la única recuperación posible siendo un backup manual externo de esos `.json`
tomado antes del cambio de contraseña.

Agrava el problema que la propia ventana de Seguridad promete lo contrario:
`security-window/renderer.js` dice literalmente *"Todos los backups existentes
se vuelven a cifrar con la contraseña nueva"* y *"Los backups existentes se
descifran y se guardan en claro de nuevo"* — cierto para `backups`, falso para
las otras dos familias.

**Arreglo:** generalizar `reencryptAllBackups` a un `reencryptAllUserFiles` que
recorra las tres tablas (`backups`, `meeting_preps`, `candidate_evals`),
actualizando su columna `encrypted` en cada una. La estructura ya es idéntica en
las tres (archivo en disco + fila con `encrypted`), así que es un bucle más, no
un rediseño.

**Mitigación inmediata mientras no se arregle:** no usar "Cambiar contraseña…"
ni "Desactivar cifrado de backups…" sin copiar antes a mano las carpetas
`reuniones/` y `evaluacion-candidatos/` de cada proyecto.

## A2. Restaurar un backup guarda antes, automáticamente, el estado que se está descartando — [LEÍDO, alta certeza]

Secuencia en `restoreProjectBackup()` (`main.js:2280`):

1. Lee el backup elegido (`bkRow`).
2. `w.close()` sobre la ventana del proyecto.
3. Pero `attachFlushOnClose()` (`main.js:1939`) intercepta ese cierre con
   `e.preventDefault()` y manda `app:flushBeforeClose` al renderer.
4. El dashboard responde con `maybeBackup('closing', { force:true })`
   (`plantilla_dashboard.html:5783`) — **`force:true` salta la comprobación de
   "no ha cambiado nada", así que escribe un backup nuevo sí o sí**, con el
   estado PRE-restauración.
5. `writeLocalStorageDumpToPartition()` restaura el backup elegido.

Resultado: al terminar la restauración, **el backup más reciente del proyecto es
el estado que el usuario acababa de descartar**. Si se vuelve a pulsar
"Restaurar último backup", se recupera justo lo que se quería tirar, no la copia
buena. Y ese backup espurio empuja hacia fuera uno bueno por el límite
`BACKUP_KEEP = 15` (`main.js:650`).

Efecto secundario del mismo punto: entre los pasos 3 y 5 hay una **carrera sobre
`localStorage`** — la ventana vieja sigue viva (hasta 4 s,
`FLUSH_BEFORE_CLOSE_TIMEOUT_MS`) mientras la ventana oculta hace
`localStorage.clear()` + reescritura sobre la MISMA partición, y
`openProjectWindow(row)` (`main.js:2301`) crea ya la ventana nueva sin esperar
al `closed` de la vieja. No he encontrado ninguna escritura a `localStorage` en
el `beforeunload` del dashboard (solo lecturas), así que el daño probable se
limita a un backup espurio y a un `maybeBackup` leyendo un estado a medio
sustituir — pero la ventana temporal existe y no está sincronizada.

**Arreglo:** marcar la ventana como "cerrando por restauración" antes de
`w.close()` para que `attachFlushOnClose` no pida el flush (o para que
`maybeBackup` lo omita), y esperar el evento `closed` antes de tocar la
partición.

## A3. No hay bloqueo de instancia única: dos copias en el MISMO PC se pisan la base de datos entera — [LEÍDO, alta certeza]

No existe ninguna llamada a `app.requestSingleInstanceLock()` en `main.js`
(comprobado por grep: 0 coincidencias de `requestSingleInstanceLock`,
`second-instance`).

La app tiene un mecanismo elaborado para el caso multi-PC (`checkMultiPcLock`,
`.panorama-lock.json`, heartbeat cada 30 s, `main.js:4705-4812`) y **ninguno**
para el caso mucho más probable de hacer doble clic dos veces en el mismo
acceso directo. Con `sql.js`, cada proceso mantiene **la base de datos entera en
memoria** y la reescribe **completa** en cada `run()` (`db.js:183 persist()`, un
`db.export()` a un `.tmp-<pid>` y `renameSync`). Dos instancias:

- Cargan la misma `panorama.sqlite3` al arrancar.
- Cada `INSERT`/`UPDATE` de cualquiera reescribe el archivo completo desde SU
  copia en memoria.
- La segunda en escribir **borra todo lo que hizo la primera** (proyectos
  creados, filas de backups, `sort_order`, `app_meta` incluido el tema y la
  configuración de Seguridad).

El nombre del temporal lleva el PID (`db.js:186`), así que ni siquiera chocan al
escribir: cada uno hace su rename atómico limpio encima del otro. Silencioso,
sin ningún aviso.

**Arreglo:** `app.requestSingleInstanceLock()` al principio de `main.js`; si no
se obtiene, enfocar la ventana existente (`second-instance`) y `app.quit()`.
Son ~10 líneas y es el patrón estándar de Electron.

---

# B. Estabilidad y rendimiento

## B1. El listado de proyectos lee y parsea el último backup de cada proyecto CUATRO veces, síncronamente, en el proceso principal — [MEDIDO + LEÍDO]

`computeProjectRowExtras()` (`main.js:5183`) llama, por cada proyecto, a:

| Función | Llama a | Lee |
|---|---|---|
| `computeProjectSemaforo` (`:1611`) | `getProjectStateForMeetingPrep` | último backup |
| `computeServiceEndWarning` (`:1655`) | `getProjectStateForMeetingPrep` | último backup **otra vez** |
| `computeStaffingRatio` (`:5169`) | `getProjectStateForMeetingPrep` | último backup **otra vez** |
| `computeCandidateTeamCoverage` (`:5637`) | `getProjectStateForMeetingPrep` + `readCandidateEvalPayloadForProject` | último backup **otra vez** + estado.json |
| `computeCandidatePendingInterviews` (`:5564`) | `readCandidateEvalPayloadForProject` | estado.json **otra vez** |

`getProjectStateForMeetingPrep` (`main.js:1529`) hace en cada llamada: 2
consultas SQL + `fs.readFileSync` completo + `JSON.parse(dump)` +
`JSON.parse(dump[fullKey])`. Todo **síncrono**, en el proceso principal, sin
ninguna caché.

**Números reales de esta instalación [MEDIDO]:**

| Proyecto | Último backup |
|---|---|
| 5-mineco-tesoro | 1.399,8 KB |
| 12-imus-instituto-de-las-mujeres | 678,9 KB |
| 11-soporte-n1 | 678,8 KB |
| 15-imus-instituto-de-las-mujeres | 533,7 KB |
| 14-mefpd | 359,1 KB |
| 9-miciu | 266,3 KB |
| resto (5 proyectos) | ~85 KB |
| **Suma** | **~4,0 MB** |

Con 4 lecturas por proyecto: **~16 MB de `readFileSync` + ~32 `JSON.parse`
bloqueantes por cada `projects:list`**. Y con la carpeta de datos en `G:\`
(Google Drive), no son lecturas de disco local.

Peor: **`projects:list` no se llama solo al abrir el lanzador**. `backup:save`
manda `projects:changed` al lanzador (`main.js:6026`), y el dashboard hace
`setInterval(()=>maybeBackup('interval'), 15000)`
(`plantilla_dashboard.html:5770`). Con el lanzador abierto y dos proyectos
abiertos, eso es un ciclo completo de ~16 MB **cada ~7 segundos**. Si la
Seguridad está activada, súmale descifrar AES-GCM de esos 16 MB en cada pasada.

Durante esa pasada el proceso principal está bloqueado: ninguna otra ventana
puede completar un IPC (guardar, abrir un CV, cambiar de tema...).

**Arreglo (barato y grande):** memoizar `getProjectStateForMeetingPrep` y
`readCandidateEvalPayloadForProject` por `projectId` durante la vida de una
llamada a `listProjectRows()`. Pasa de 4 lecturas a 1 por proyecto sin cambiar
ni un criterio de negocio (~15 líneas). Segundo paso opcional: cachear por
`mtime` del archivo de backup para que refrescos consecutivos sin cambios no
lean nada.

## B2. Tras el arranque, cualquier excepción no capturada del proceso principal se traga y la app sigue viva en estado indefinido — [LEÍDO, alta certeza]

`main.js:4326`:

```js
process.on('uncaughtException', (err) => {
  appLog(`EXCEPCIÓN NO CAPTURADA (proceso principal): ${(err && err.stack) || err}`);
});
```

Registrar un manejador de `uncaughtException` **desactiva el comportamiento por
defecto** (crash con diálogo). El resultado es que un fallo grave a media sesión
—por ejemplo `persist()` lanzando porque Drive se cayó, ver B4— deja la app
abierta, aparentemente funcional, con la base de datos en memoria divergiendo de
la de disco, y la única señal es una línea en `app.log` que nadie mira.

Esto es distinto del manejador de arranque (`handleFatalStartupError`,
`main.js:80`), que sí está bien pensado y se desarma solo en `whenReady`.

**Arreglo:** mantener el `appLog`, pero además mostrar un `dialog.showErrorBox`
con un código PS nuevo y decidir explícitamente si se continúa o se cierra. Como
mínimo, que el usuario se entere.

## B3. 29 rutas de error en `main.js` solo escriben en `console.warn`, invisible en la app empaquetada — [MEDIDO] → **CERRADO (15 sept 2026)**

> **CERRADO**, con el alcance dicho con precisión: *«los errores relevantes ya
> no dependen exclusivamente de `console`»*. **No** cierra «el logging
> sobrevive a una caída total de Drive» — eso nace de aquí como **P14**.
>
> **El hallazgo se quedó corto en dos sentidos, y conviene dejarlo escrito.**
>
> 1. **Contó solo `main.js`.** Los renderers acumulan 14 `console.warn` + 5
>    `console.error` más, y **no tienen `appLog` en absoluto** — ni lo tienen
>    ahora, por decisión explícita del usuario: nada de un canal `app:log`
>    genérico. Los tres casos que de verdad importaban ahí se resuelven por
>    **UI**, no por log.
> 2. **«Es mecánico» era falso.** Convertir cada `console.warn` en `appLog`
>    habría (a) llenado el log de repeticiones —la copia HTML corre en cada
>    `backup:save`, ~15 s por proyecto abierto—, (b) dejado intacto el peor
>    caso de todos, que **no** era un warn sino un **fallback silencioso a
>    texto plano** cuando falla el cifrado del backup, y (c) metido la **ruta
>    completa con el nombre de usuario de Windows** en cada línea, porque el
>    mensaje de una excepción de `fs` ya la lleva dentro.
>
> Lo que se hizo: clasificar los 19 `console.warn` restantes en A/B/C/D, dar
> **UI** a los C, **`appLog` con dedupe por sesión** a los B, dejar los A y
> comprobar que los D ya estaban cubiertos. Dos casos resultaron estar mal
> clasificados en la propia autorización (`historial-reunion` C→D,
> `backup-emergencia` B→D) y **no se tocaron**: el código desmentía la
> clasificación.
>
> Dos defectos nuevos salieron durante la implementación: el `storageSet` del
> Directorio que devuelve `false` sin lanzar (la pantalla decía «Guardado» sin
> haber guardado) y las rutas en el mensaje del error. Los dos corregidos, con
> prueba y reversión.
>
> **Evidencia:** `b3/test-b3-inventario.js` **85 OK/0**, `b3/electron-b3.ps1`
> **36 OK/0**, siete reversiones comprobadas una a una. Detalle en
> `claude/pendientes-abiertos.md` §B3 y `handoff-opus-estado-actual.md` §17.
>
> **Nace de aquí:** **P14** (`app.log` vive en Drive) y **P15** (las líneas
> anteriores a B3 siguen llevando rutas completas).

### Hallazgo original (se conserva)

Conteo: 29 `console.warn` frente a 44 `appLog(` en `main.js`. En una app
empaquetada sin consola (`stdio: 'ignore'`, sin devtools), `console.warn` no va
a ningún sitio. Incluye rutas relevantes: fallo al escribir un backup en disco
(`main.js:5966`), fallo al borrar la carpeta de backups o la partición al
eliminar un proyecto (`main.js:2498/2503/2509`), fallo al refrescar la copia
HTML del proyecto (`main.js:1896`), `openPathLogged` (`main.js:176`).

Es una inconsistencia de diseño: hay **dos canales de log** y uno es un no-op en
producción. El punto 4 de la auditoría anterior se resolvió convirtiendo
silencios en `console.warn` — que es mejor que nada, pero sigue sin dejar
rastro.

**Arreglo:** que `console.warn` en `main.js` pase por `appLog` (o sustituirlo
directamente). Es mecánico.

## B4. `db.js persist()` no tiene try/catch, y `backup:save` inserta en la BD fuera de protección — [LEÍDO] → **CERRADO (16 sept 2026)**

> **CERRADO en tres partes, y con batería. Esto sustituye al «CERRADO en su
> mitad de `db.js`; PENDIENTE en la de `backup:save`» del resumen de arriba,
> que contradecía al handoff.** Ninguna de las dos afirmaciones estaba medida.
>
> **A. La mitad `db.js`: la absorbió A3.3.** `persist()` y
> `markDirtyAndPersist()` **no existen**. Hoy hay un único punto que escribe el
> `.sqlite3`, dentro de `aplicarYConfirmar()`, con frontera PRE/POST-confirmación
> (`aplicado: false` / `aplicado: true`), latch, y restauración de la memoria
> desde una imagen confirmada inmutable. `run()` y `vacuum()` pasan por ahí.
>
> **B. La mitad `backup:save`: la cerró el Bloque 4.** El archivo, el `INSERT`,
> el `updated_at` y la marca van en **una** mutación anclada a
> `exigirCommitBase`, precedida de un journal durable con los hashes del
> original y del nuevo. Un fallo PRE-confirmación **repone el archivo por
> hash**: el archivo huérfano del hallazgo ya no se produce por esta vía.
>
> **C. Lo que el diagnóstico SÍ encontró vigente, y se ha corregido aquí.** El
> hallazgo apuntaba a `persist()`, pero lo que lo causaba era **N escrituras
> sueltas donde debería haber UNA**. El Bloque 5 ya lo eliminó para los borrados
> (D3); `projects:reorder` se había quedado con la forma vieja. Reproducido
> cortando la publicación a mitad, el archivo quedaba con
> `sort_order = [null,null,null,null,0]`. Ahora es **una** mutación anclada:
> medido en vivo, un reordenado de 5 proyectos produce **una** publicación del
> `.sqlite3`, no cinco.
>
> **Lo que el diagnóstico demostró que YA estaba bien, y no se ha tocado:**
> escritura atómica, frontera PRE/POST, latch, recuperación de memoria,
> tratamiento de temporales y la acción de backup. En los cuatro escenarios de
> fallo inyectados el `.sqlite3` pasa `integrity_check` y memoria y disco acaban
> iguales.
>
> **Evidencia:** `b4/test-b4-persistencia.js` **144 OK/0**, `b4/electron-b4.ps1`
> **17 OK/0**, dos reversiones. Detalle en `claude/pendientes-abiertos.md` §B4 y
> `handoff-opus-estado-actual.md` §18.
>
> **NO absorbe:** los residuos `.tmp` acumulados (**C1**), el `app.log` en Drive
> (**P14**), el saneado de los PS históricos (**P15**), ni las asimetrías
> menores de `projects:create` / `updated_at` / rollback `DELETE`, que quedan
> documentadas como conocidas.

### Hallazgo original (se conserva)

`persist()` (`db.js:183`) hace `writeFileSync` + `renameSync` sin capturar nada.
Cualquier `run()` (`db.js:220`) propaga la excepción hacia arriba.

En `backup:save` (`main.js:5928`), la escritura del archivo `.json` **sí** está
en try/catch (`:5962`), pero el `INSERT` posterior (`:5970`) no. Si `persist()`
falla ahí —el escenario exacto que la propia app vigila con
`startUserDataWatchdog` y `driveOutageActive`— pasa esto:

- El archivo de backup **ya está escrito** en disco.
- La fila no se inserta, el handler IPC rechaza.
- El renderer recibe un rechazo: `await window.panoramaBridge.saveBackup(...)`
  (`plantilla_dashboard.html:5718`) lanza → cae al `catch` de `maybeBackup`
  (`:5726`) → devuelve `{ok:false}`. Correcto para el usuario.
- Pero queda un **archivo huérfano** sin fila, y la purga (`main.js:5979`) nunca
  se ejecuta. Ver C1: esto es exactamente el mecanismo que genera la basura
  medida.

**Arreglo:** try/catch en `persist()` que devuelva un error manejable, y
envolver el bloque `INSERT` + purga de `backup:save` de forma que un fallo de BD
borre el archivo recién escrito antes de devolver `false`.

## B5. La ventana de Seguridad permite reenviar el formulario con Enter mientras el envío está en curso — [LEÍDO, impacto bajo] → **CERRADO (16 sept 2026)**

> **CERRADO con el arreglo exacto que proponía este apartado**, una línea al
> principio de `doSubmit()`. Pero el diagnóstico corrigió **dos cosas** del
> enunciado, y conviene que quede escrito:
>
> **1. El defecto era real y seguía literal, y ahora está medido, no supuesto.**
> Ejecutando el renderer productivo sobre un DOM doble y contando los IPC que
> llegan a salir: un Enter = 1, **dos Enter = 2**, **cinco Enter = 5**,
> **click + Enter = 2**; doble click = 1, porque un botón deshabilitado no
> dispara `click`. Ésa es exactamente la asimetría: `disabled` protege el botón,
> y el listener de teclado no pasa por el botón. Tras la corrección: **1 IPC en
> todos los casos**, en los cuatro modos y en la ventana real.
>
> **2. El daño temido ya no ocurría.** El apartado decía que en `setup` la
> segunda pasada «se salta» los archivos y que en `change` el usuario ve un
> mensaje confuso. Medido hoy:
> - en `setup` **no se salta nada**: el rekey detecta que el archivo ya está
>   cifrado sin clave anterior, **aborta todo-o-nada** y lo deshace, con
>   **PS-2003**. Superado por A1 / Bloque 3;
> - en `change` el mensaje confuso **se genera pero no se ve**, porque
>   `finishSecurityWindow()` ya había cerrado la ventana con el primer envío.
>
> Y no había concurrencia posible: `rekeyAllUserFiles` son 384 líneas con **0
> `await`**, `deriveKey` usa `scryptSync` y el handler tampoco cede, así que el
> proceso principal **serializa** los envíos. Por debajo, además,
> `rekeyInProgress`, la exclusiva de `db.js`, `bloqueoDeSeguridad()`,
> `rekeyPuedeEmpezar()` y el journal v2 del rekey. **Severidad real: BAJA** —
> trabajo inútil y errores que se tiran, no pérdida.
>
> **Lo que NO se hizo:** ni spinner, ni cambio de texto, ni bloqueo de campos, ni
> tocar Cancelar/Escape. B5 consistía en impedir el reenvío. La falta de
> indicador de progreso —que es lo que empuja al usuario a volver a pulsar—
> queda como mejora de UX posible y no hecha.
>
> **Evidencia:** `b5/test-b5-reentrancia.js` **68 OK/0**, `b5/electron-b5.ps1`
> **24 OK/0**, una reversión que reproduce los números originales. Un solo
> archivo productivo: `security-window/renderer.js`. Detalle en
> `claude/pendientes-abiertos.md` §B5 y `handoff-opus-estado-actual.md` §19.
>
> **Salió de aquí:** la ampliación de **P15** — el `Detalle:` de un PS-2003
> muestra la ruta completa **al usuario**, no solo en `app.log`.

### Hallazgo original (se conserva)

`security-window/renderer.js`: `doSubmit()` pone `els.btnSubmit.disabled = true`
pero el listener global `keydown → Enter` llama a `doSubmit()` sin comprobar ese
flag. Con `scrypt` (N=16384) más `reencryptAllBackups` sobre 46 MB de backups,
la operación tarda; pulsar Enter varias veces encola varias invocaciones de
`security-win:submit`. En `setup` la segunda pasada no rompe nada (los archivos
ya están cifrados y `oldKey` es `null`, así que se saltan), pero en `change` la
segunda pasada compara contra la sal **ya sustituida** y devuelve "La contraseña
actual no es correcta" sobre una operación que en realidad fue bien — confuso.

**Arreglo:** `if (els.btnSubmit.disabled) return;` al principio de `doSubmit()`.

---

# C. Recursos y basura acumulada

Todo esto vive en la carpeta de datos **sincronizada por Google Drive**, así que
no es solo espacio en disco: es tráfico de sincronización y tiempo de arranque
(la propia app espera a que Drive esté ocioso antes de abrir la BD, ver
`waitForCloudSyncIdleAtStartup`, `main.js:4563`).

## C1. ~80 MB de backups huérfanos que nada volverá a borrar — [MEDIDO] → **ABIERTO: C1-A CERRADO, C1-B DIFERIDO (16 sept 2026)**

> **C1-A — CERRADO.** Inventario de residuos al arrancar (leer → clasificar →
> una línea en `app.log`, sin borrar ni mover nada; medido sobre producción en
> solo lectura: `backupsSinFila=117 [anteriores=112 intercalados=5]`, 23–55 ms).
> «Eliminar evaluación» e «Importar» retiran el CV solo con `aplicado:true +
> verificado:true`. Los mensajes del rekey ya no prometen «se resuelve sola».
> `c1/test-c1-residuos.js` **165 OK/0**, `c1/electron-c1.ps1` **31 OK/0**,
> siete reversiones.
>
> **C1-B — ABIERTO / DIFERIDO.** La retirada de los residuos históricos no está
> autorizada: con multi-PC/Drive no se puede demostrar todavía que un archivo
> sin referencia local no vaya a recibir después su fila desde otro equipo.
> Detalle en `claude/pendientes-abiertos.md` §C1.
>
> **Diagnóstico (se conserva).** Lo esencial del hallazgo se confirma:
> los huérfanos existen, nadie los recoge y la purga solo mira filas. Pero el
> diagnóstico **corrige** tres cosas y **desaconseja** el arreglo propuesto:
>
> - **La cifra:** son **117 archivos, 39,67 MB** (112 anteriores a la fila más
>   vieja de su proyecto y **5 intercalados**, cuyas filas se perdieron por
>   sobrescritura entre equipos el 1 sept). El total de *todos* los backups es
>   102 MB.
> - **El «solo contar y registrar»** que se aprobó en los Bloques 4 y 5 **no
>   existe en el código**.
> - **Hay más residuos que los backups:** particiones de Electron de proyectos
>   borrados (7, 72 MB; el mecanismo **sigue activo**, medido en Electron real),
>   CV que dejan de estar referenciados al eliminar una evaluación o importar, y
>   restos de corte que impiden arrancar.
>
> **El arreglo de abajo —«borrar los que no tengan fila»— es inseguro:**
> borraría los intercalados, no ve los CV ni las particiones, y en una carpeta
> compartida la fila del otro equipo puede llegar **después** que su archivo.
> Además, los huérfanos **escapan del rekey**: activar la Seguridad los deja en
> claro y cambiar la contraseña los vuelve ilegibles.
>
> Clasificación A/B/C/D, propuesta mínima y lista de lo que nunca debe borrarse:
> `claude/pendientes-abiertos.md` §C1. Evidencia: `c1/test-c1-residuos.js`
> **122 OK/0**, `c1/electron-c1.ps1` **10 OK/0**, `c1/inventario-vivo.js`.

### Hallazgo original (se conserva)

`BACKUP_KEEP = 15` (`main.js:650`), pero en disco:

| Proyecto | Archivos `backup_*.json` | Total |
|---|---|---|
| 5-mineco-tesoro | **50** | 46,1 MB |
| 11-soporte-n1 | **50** | 20,5 MB |
| 9-miciu | 34 | 3,4 MB |
| 1-directorio-talento | 26 | 1,0 MB |
| 12-imus | 23 | 13,5 MB |
| 8-tpfe / 6-injuve / 14-mefpd / 15-imus | 17-18 c/u | 14,9 MB |
| 16-corpme | 10 | 0,1 MB |

En `5-mineco-tesoro`, los 15 más recientes van del 12/09 hacia atrás hasta el
07/09; **los 35 restantes (29/08 – 01/09) no tienen fila en la BD**: la purga de
`backup:save` (`main.js:5979`) solo hace `unlinkSync` de los archivos
referenciados por las filas que borra. Un archivo cuya fila ya desapareció
—residuo de la época en que había "dos purgas independientes... que podían
desincronizarse" (comentario en `main.js:5975`)— nunca lo toca nadie.

**Arreglo:** una limpieza de huérfanos al arrancar: listar `backup_*.json` de
cada carpeta, cruzar contra `SELECT file_path FROM backups WHERE project_id=?`,
borrar los que no aparezcan. ~20 líneas, junto a
`migrateLegacyInlineBackupsToFiles` que ya hace un barrido similar.

## C2. ~112 MB de archivos `.asar` dentro de la carpeta de datos sincronizada — [MEDIDO]

En `G:\Mi unidad\BD-PanoramaServicio\`:

| Archivo | Tamaño | ¿Esperado? |
|---|---|---|
| `app.asar.bak-2026-09-12T20-11-51-116Z` | 28,0 MB | Sí (`ASAR_PATCH_BACKUP_KEEP = 2`) |
| `app.asar.bak-2026-09-12T21-29-05-730Z` | 28,0 MB | Sí |
| `app.asar` | 27,3 MB | **No.** Ningún mecanismo del código escribe un `app.asar` con ese nombre ahí |
| `app1.asar` | 27,1 MB | **No.** Idem |

Los dos `.bak` son correctos por diseño, pero **conservar 56 MB de copias de
seguridad de `app.asar` dentro de una carpeta de Google Drive es una decisión
cuestionable**: son binarios que no cambian con los datos, se resincronizan
enteros con cada parche, y el `Restaurar-backup.bat` que los usa corre en local.
Deberían vivir en `%LOCALAPPDATA%`, igual que ya hace `driveSyncGuardDataDir()`
(`main.js:3511`) con ese razonamiento explícito.

`app.asar` y `app1.asar` sueltos parecen residuos manuales de una sesión
anterior. Se pueden borrar (no los `.bak-*`).

También hay un `.panorama-write-check-4780` sin borrar: la sonda de
`probeWritableDir` (`main.js:563`) que no llegó a hacer `unlinkSync`. Inofensivo,
pero conviene barrer los `.panorama-write-check-*` viejos al arrancar, igual que
ya se hace con los `.sqlite3.tmp-*` (`db.js:34`).

## C3. 1,4 GB de residuo de compilación en el árbol de trabajo — [MEDIDO]

| Qué | Tamaño |
|---|---|
| 7 archivos `.asar` sueltos en la raíz del proyecto (App0242…App0248) | 195,5 MB |
| `dist_build/` (7 carpetas `patch_*`, `win-unpacked`, `win-arm64-unpacked`, un instalador 2.0.54 de 80 MB) | 847,0 MB |
| `node_modules/` | 357,5 MB |

Nada de esto se empaqueta (`build.files` en `package.json` es una lista blanca),
así que no afecta al producto. Pero los 7 `.asar` en la **raíz del proyecto**,
junto a `main.js`, son confusos: parecen fuentes y son artefactos de parches ya
aplicados hace días.

## C4. `C:\Codigo Fuente PS - copia\` es byte-idéntica al original — [MEDIDO]

Comparados los 100 archivos de código (excluyendo `node_modules`, `dist_build`
y `.asar`) con SHA-256: **0 archivos distintos, 0 archivos solo en uno de los
dos**. Es una copia completa sin ninguna marca de cuál es la autoritativa.

Con dos árboles idénticos y sin control de versiones (ver D1), el riesgo real es
editar el equivocado durante media sesión.

## C5. 22 PNG de iconos de parche empaquetados sin que nadie los cargue — [MEDIDO + LEÍDO]

`assets/patch-icons/` (20 archivos) + `patch-valid-check.png` +
`patch-invalid-warning.png`, ~200 KB. El propio `main.js:880-889` documenta que
quedaron sin uso en la 2.0.32, al pasar ese diálogo al modal propio. Como
`build.files` incluye `assets/**/*`, **sí se empaquetan** en cada `.asar` y en
cada parche.

---

# D. Estructura y proceso

## D1. No hay control de versiones, y el mecanismo que lo sustituye está 14 versiones desfasado — [MEDIDO]

- `git` no está en el PATH de esta máquina (comprobado).
- El sustituto documentado es el snapshot
  `claude/panorama-app-full-source.md` (1,4 MB) + `reconstruir-repo-desde-snapshot.py`.
- Ese snapshot dice en su cabecera **"Snapshot actualizado a la versión 2.0.41"**,
  y su contenido lo confirma: la versión más alta que menciona es 2.0.41, y
  **0 coincidencias** de `portfolio:summary` o `computeStaffingRatio` (código de
  2.0.56 que ya está en `main.js`).

Es decir: **el trabajo de las versiones 2.0.42 a 2.0.56 existe únicamente en el
disco de esta máquina** (y en su copia byte-idéntica de C4). Sin historial, sin
diff entre versiones, sin forma de saber qué cambió en la 2.0.51 más allá de lo
que cuente `panorama-app-project-context.md` en prosa.

Para una app que el propio usuario quiere "superestable", este es el riesgo
estructural de mayor impacto de todo el informe: no hay red de seguridad para el
código en sí, solo para los datos.

`claude/panorama-app-project-context.md` **sí** está al día (última entrada:
`### 2.0.55`), lo cual es de agradecer, pero es narrativa, no código.

## D2. `gen_snapshot.py` no se puede ejecutar en esta máquina — [LEÍDO]

```python
ROOT = '/home/claude/panorama-app'
OUT  = '/tmp/panorama-app-full-source.md'
```

Rutas Linux del sandbox antiguo, en duro. La lista `FILES` (44 entradas) sí está
completa y correcta —los dos huecos que señaló la auditoría anterior
(`cdp_reload.js`, `generate_patch_icons.py`) se corrigieron en la 2.0.40—, pero
el script no corre aquí sin editarlo. Esa es, casi seguro, la razón por la que
el snapshot lleva 14 versiones sin regenerarse.

## D3. La prueba de humo no se puede ejecutar aquí, y además tiene un desajuste de puerto — [LEÍDO]

`scripts/smoke_test.js` se presenta como *"pensada para correr ANTES de cada
entrega"*. Dos problemas:

1. Sus instrucciones son de Linux (`rm -rf /tmp/panorama_smoke`, *"Requiere
   Xvfb + DISPLAY activo"*).
2. **Desajuste real de puerto:** la línea 12 documenta arrancar con
   `--remote-debugging-port=9222`, pero la línea 20 define
   `const CDP_BASE = 'http://localhost:9223'`. Siguiendo las instrucciones tal
   cual, el script no conecta con nada.

Consecuencia: hoy **no existe ninguna comprobación automática de regresión
ejecutable en la única máquina donde se compila la app**. Todo el control de
calidad es manual.

## D4. `package.json` dice 2.0.55 y el código lleva 2.0.56 a medias — [MEDIDO]

7 marcadores `v2.0.56` en el código frente a `"version": "2.0.55"` en
`package.json`. Ver E1 para el detalle de lo que está a medio integrar. El árbol
**no está en un estado publicable**: compilar un parche ahora entregaría la UI
de 2.0.56 con funcionalidad muerta y con el número de versión anterior.

---

# E. Coherencia de conceptos

## E1. La vista Lista / Resumen de Cartera del lanzador está a medio integrar: los botones existen y no hacen nada — [LEÍDO, alta certeza]

`launcher/index.html:459-463` pinta ya los tres botones (`🗂 Tarjetas`,
`☰ Lista`, `📊 Resumen`), los contenedores `#view-list` (con su `<table>` y su
`#list-tbody`) y `#view-summary`. `preload-launcher.js:29` expone
`portfolioSummary()`. `main.js:5287` implementa el handler `portfolio:summary`.

Pero en `launcher/renderer.js` **falta la mitad del lado cliente**:

| Símbolo | Estado |
|---|---|
| `loadSummary()` | **No existe.** Se invoca en `setView()` (`renderer.js:127`) → `ReferenceError` si se llegara a ejecutar |
| `setView()` (`:117`) | Definida, **nunca llamada**. No hay ningún listener sobre `#view-switch` |
| `allProjects` (`:110`) | Declarada, **nunca asignada**. `refresh()` (`:165`) no la rellena |
| `selectedListId` (`:111`) | Declarada, nunca usada |
| `staffingPill()` (`:83`), `serviceEndPill()` (`:95`), `timelineBarSVG()` (`:139`) | Definidas, **nunca llamadas** |
| `#list-tbody` | Nunca se rellena |

O sea: el usuario ve tres pestañas, pulsa "Lista" o "Resumen" y **no pasa
absolutamente nada** (ni siquiera un error visible, porque el handler no llega a
existir). Y hay ~90 líneas de código muerto en `renderer.js`.

Es lo primero que hay que cerrar antes de tocar nada más: o se termina la
integración, o se retiran los tres botones hasta que esté.

## E2. La lógica de fin de servicio está duplicada entre `main.js` y el dashboard, y YA ha divergido — [LEÍDO, alta certeza]

La duplicación está documentada a propósito (`plantilla_dashboard.html:5152`:
*"no se puede compartir código literal entre el proceso principal y esta
plantilla, así que se duplica a propósito con el mismo criterio"*). El problema
es que el criterio **ya no es el mismo**:

| | `main.js:1655` `computeServiceEndWarning` | `dashboard:5156` `computeServiceEndWarningLocal` |
|---|---|---|
| `serviceEnd` vencido → "Finalizó el dd/mm/aaaa" | Sí (2.0.53) | Sí (2.0.53) |
| `serviceEnd` ≤30 días → "Servicio finaliza en N días" | Sí | Sí |
| Prórroga estimada sin confirmar | Sí | Sí |
| **`serviceStart` futuro → "Arranca en N días"** | **Sí (2.0.52)** | **NO** |
| **Suprime el resto de avisos si aún no ha arrancado** | **Sí (`return` temprano)** | **NO** |

Para un servicio que todavía no ha empezado, la tarjeta del lanzador dice
"🚀 Arranca en N días" y el panel "Estado Ejecutivo" del propio proyecto no dice
nada (o, si el contrato es corto y `serviceEnd` cae dentro de 30 días, dice
"Servicio finaliza en N días" — el mensaje contradictorio que la 2.0.52 arregló
en el lanzador y no aquí).

Es exactamente el fallo que se anticipó en la 2.0.53/2.0.54 al descubrir la
duplicación, y sigue abierto.

**Arreglo estructural:** mover esta lógica a `vendor/` como función pura
(`serviceStatus(state, today)`), cargada por el dashboard como script y por
`main.js` con un `require()` del mismo archivo. Es JS puro sin `document`, así
que sí se puede compartir — el motivo que se dio para duplicarla (que
`vendor/theme.js` usa `document`) no aplica a esta función.

## E3. La unificación de barra de título y scrollbar cubre 3 de 7 ventanas — [MEDIDO]

`vendor/window-chrome.css` se creó en 2.0.40 para eliminar la duplicación
señalada en la auditoría anterior (punto 1.6 y 3), y en 2.0.47 se le hizo seguir
el tema activo. Estado real hoy:

| Ventana | CSS propio duplicado | Carga `window-chrome.css` | Veredicto |
|---|---|---|---|
| dashboard | 0 | Sí | Correcto |
| directorio | 0 | Sí | Correcto |
| preparacion-reunion | 0 | Sí | Correcto |
| **launcher** | **7 reglas** | Sí | Duplicado: carga la hoja Y la redefine |
| **evaluacion-candidatos** | **5 reglas** | Sí | Duplicado: igual |
| **security-window** | **7 reglas** | **No** | Sin unificar |
| **backup-picker** | **7 reglas** | **No** | Sin unificar |
| password-prompt | 2 reglas | No | Sin unificar |

Y en las dos que no la cargan, el CSS propio **sigue siendo la paleta "Windows
claro" fija que la 2.0.47 vino a eliminar**:

`security-window/index.html:33-43` y `backup-picker/index.html:35-47`:
```css
background:linear-gradient(to right, #dadada 0%, ..., #d1dbed 50%, ..., #dadada 100%);
color:#2b2b2b;
.win-controls button:hover{ background:#e2596b; color:#fff; }   /* rojo de Medianoche fijo */
```

Con el tema Medianoche activo, esas dos ventanas siguen teniendo la franja gris
clara pegada arriba sobre una ventana oscura. Es el mismo bug que se dio por
cerrado.

## E4. `nativeTheme.themeSource = 'dark'` está fijo, con 4 temas claros disponibles — [LEÍDO]

`main.js:857`, con un comentario que ya no encaja con el estado del proyecto:
*"El dashboard es un tema oscuro de punta a punta"*. Desde 2.0.27/2.0.37 hay 5
temas, 4 de ellos claros. Consecuencias:

- Los diálogos **nativos** que quedan (`dialog.showMessageBoxSync` de
  `resolveUserDataDirFailureInteractively`, `checkCustomLocationDatabaseSanity`,
  `checkMultiPcLock`; y los `showOpenDialogSync`/`showSaveDialogSync` de
  exportar, aplicar parche y elegir CV) se pintan **siempre oscuros**, aunque el
  usuario tenga Marfil o Nube.
- `prefers-color-scheme: dark` es **siempre verdadero** en todos los renderers.
  Y hay CSS que depende de ello: `directorio/plantilla_directorio.html:212-216`
  define el desplegable del combo bajo `@media (prefers-color-scheme: dark)` →
  **el desplegable de búsqueda del Directorio es siempre oscuro (`#171f2a`,
  texto `#eef2f6`), en los 5 temas**, incluso sobre una interfaz clara. Ese
  componente es el único de la app que se rige por el color-scheme del sistema
  en vez de por el sistema de temas propio.

**Arreglo:** `nativeTheme.themeSource = THEMES[tema].dark ? 'dark' : 'light'`
sincronizado con `setGlobalTheme`, y migrar el `@media` del combo del Directorio
a variables de tema (`--surface-2`, `--ink`, `--border`).

## E5. Colores fijos que ignoran el tema — [MEDIDO]

Barrido de hex fuera de los bloques `:root` (los de `@media print` se excluyen,
son correctos):

| Archivo:línea | Regla | Problema |
|---|---|---|
| `vendor/modal.js:116` | `.ps-modal-btn.ps-danger{ ... border-color:#4a2229 }` | **El componente compartido.** Existe `--red-border` desde 2.0.40 y no se usa. Anillo casi negro alrededor del botón rojo en los 4 temas claros |
| `dashboard:194` | `.risk-status-btn.materializado{ background:var(--red); color:#1a0507 }` | Texto casi negro sobre `--red`, que en temas claros ya es oscuro (`#B91C1C`) → ilegible |
| `security-window:66` | `.btn.danger{ background:var(--red); color:#2a0a0e }` | Mismo caso |
| `eval-candidatos:177,254,312` | `:hover{ background:var(--red\|--green); color:#fff }` | Caso inverso: blanco sobre `--red` de Medianoche (`#e2596b`, claro) → poco contraste |
| `preparacion-reunion:157` | `.cand-item{ background:var(--amber-bg); border:1px solid #4a3c1a }` | Borde ámbar oscuro fijo. `--amber-border` existe |
| `launcher/index.html:74` | `.btn.danger{ border-color:#4a2530 }` | Idem, `--red-border` existe |
| `backup-picker:75` | `border:1px solid #4a2229` | Idem |
| `directorio:351` | `.modal-alert.ok{ ... border-color:#1e4a34 }` | Verde oscuro fijo |
| `directorio:200-208` | `.combo-dropdown{ background:#ffffff; border:#c8c8c8 } .combo-option{ color:#1f1f1f }` | Ver E4: además de fijos, están tapados por el `@media` que siempre gana |
| `launcher/splash.html` | Paleta Medianoche completa en duro | Aceptable (no tiene preload ni `themeAPI`), pero significa que con tema claro el arranque parpadea oscuro |

El patrón de fondo es el mismo que ya se corrigió tres veces (2.0.37 `--cyan-ink`,
2.0.39 `--green`/`--red`, 2.0.44 `--navy-ink`/`--teal-ink`/`--red-tx-ink`):
**falta una variable de "tinta" por tema para el texto sobre fondos sólidos
rojos y verdes**. Añadir `--red-ink` y `--green-ink` a los 5 temas cierra de una
vez las 4 primeras filas de la tabla.

## E6. Un fallo al exportar desde Evaluación de Candidatos nunca se muestra al usuario — [LEÍDO, alta certeza]

`will-download` (`main.js:4224`) avisa de un fallo de guardado con
`modalAlert(win, ...)` + `errorCodeSuffix('PS-4001')`. Y `modalAlert`
(`main.js:400`) ejecuta `window.psAlert(...)` en la ventana destino vía
`executeJavaScript`, con un `.catch` que solo hace `console.warn`.

`evaluacion-candidatos/plantilla_evaluacion_candidatos.html` **no carga
`vendor/modal.js`** (comprobado: 0 referencias), pero **sí dispara 3 descargas
reales** (`:1746` `.txt`, `:1859` `.json`, `:1906` `.csv` — todas con
`URL.createObjectURL` + `<a download>`).

Por tanto: si una de esas tres exportaciones falla al escribirse (permisos,
antivirus, carpeta bloqueada), `psAlert` no existe → `executeJavaScript` rechaza
→ `console.warn` invisible → **el usuario cree que exportó y no hay archivo**.
El código PS-4001 existe precisamente para este caso y nunca puede llegar a
verse desde esa ventana.

**Arreglo:** añadir `<script src="../vendor/modal.js"></script>` a esa plantilla
(no se hornea, así que no hace falta tocar `fixVendorScriptPaths`). Alternativa
más robusta: que `modalAlert` caiga a `dialog.showErrorBox` si
`executeJavaScript` rechaza, en vez de tragárselo.

## E7. `THEME_KEYS` duplicado entre `main.js` y `vendor/theme.js` — [LEÍDO, impacto bajo]

`main.js:722` mantiene su propia lista de claves y etiquetas porque el proceso
principal no puede cargar `theme.js` (usa `document`). Está documentado. Pero
`setGlobalTheme` **rechaza** cualquier clave que no esté en su copia
(`main.js:729`), así que añadir un 6º tema solo en `theme.js` haría que el
selector lo pinte y que aplicarlo falle en silencio.

Se resuelve extrayendo `THEME_KEYS`/`THEME_LABELS` a un `vendor/theme-keys.js`
sin dependencias de DOM, cargable por los dos lados.

---

# F. Seguridad

## F1. El dashboard inyecta datos del usuario en `innerHTML` sin escapar, y es la única plantilla sin función de escape — [MEDIDO]

> **CERRADO (16 sept 2026).** Reparado por contexto: `escapeHtml`/`escapeAttr`
> propias en el dashboard, `<textarea>` y atributos con id escapados, `<select>`
> del historial por DOM, logo validado, seed horneado con `<`→`<` y
> reemplazo por función, `onclick` de Preparación sustituido por listener,
> selectores de Evaluación con `CSS.escape` y `data-dedic` del Directorio
> escapado. **Los 76 `innerHTML` siguen ahí**: se escapó el dato, no se
> reescribió la vista. Batería exigente **139 OK/0**, Electron real **47 OK/0**,
> seis reversiones **19 OK/0**. Detalle completo en `pendientes-abiertos.md`
> §F1. F2 y F3 **siguen abiertos**, fuera de F1.
>
> **Diagnóstico previo (16 sept 2026) — reproducido en Electron real.** Reproducido con marcadores **inocuos** en la app real (batería
> `claude/pruebas-a33/f1/`, 34 OK/0 en 3 arranques; producción intacta): al abrir
> un proyecto importado se interpretan y ejecutan **19 campos** del dashboard sin
> tocar nada; la vía persistente más grave es el **título importado horneado** en
> `projects/<id>/dashboard.html` (un `</script>` en el nombre cierra el
> `factory-seed` y su `<img>` ejecuta **en el arranque**); la Preparación y el
> Directorio reciben la propagación entre ventanas. **Severidad acotada por las
> barreras:** `contextIsolation:true` **+ `sandbox:true`** + sin Node en las 4
> ventanas → **no es RCE**. El detalle, las fuentes C/D/E/F, la reparación por
> patrón y los `innerHTML` que **no** hay que tocar están en
> `pendientes-abiertos.md` §F1. **Sigue ABIERTO** (pendiente de autorizar la
> implementación).

| Plantilla | Asignaciones a `innerHTML` | Función de escape |
|---|---|---|
| `dashboard/plantilla_dashboard.html` | **76** | **ninguna** |
| `directorio/plantilla_directorio.html` | 23 | `escapeHtml` (`:763`), 37 usos |
| `evaluacion-candidatos/...html` | 16 | `escapeHtml`/`escapeAttr` (`:1459`), 20 usos |
| `preparacion-reunion/...html` | 5 | `esc` (`:386`), 30 usos |

En el dashboard el escapado es **ad hoc, parcial e inconsistente**:

```js
// dashboard:3765  — solo escapa '<', no '>' ni comillas
${m.descripcion ? `<div class="ms-desc">${m.descripcion.replace(/</g,'&lt;')}</div>` : ''}

// dashboard:3872  — solo escapa comillas dobles (atributo)
value="${m.label.replace(/"/g,'&quot;')}"

// dashboard:3725, 4089, 4357, 4485-4486, 4856, 4870, 4885, 5094  — sin escapar
<span class="ms-label">${m.label}...</span>
<span class="risk-title" title="${r.id}">${r.title}</span>
<div class="sm-name">${s.name}...</div>
<td>${t.role}...</td>
<div class="cov-title">${c.roleSnapshot} — ${c.motivo}</div>
<span class="ms-label">${p.name}</span>
```

Un hito, riesgo, rol o skill llamado `<img src=x onerror=…>` ejecuta script en el
renderer del dashboard.

**Sobre el impacto real, siendo justo:** `contextIsolation:true` está bien puesto
en las 8 ventanas, así que **no hay acceso a Node** desde ahí. Pero
`window.panoramaBridge` se expone en el mundo principal (`preload.js:22`), y ese
puente incluye `saveBackup`, `getCandidateEvalData`, `openCandidateCv`,
`pickCandidateCv` y `projectMenuAction` (que llega hasta
`'proyecto-eliminar'`). Y no hay CSP (F2) que impida sacar los datos a la red.

En el uso normal esto es *self-XSS*: el usuario escribe sus propios datos. Deja
de serlo en cuanto entra contenido ajeno, y hay tres vías reales que ya existen:

- Importación de CSV/Excel por bloque (hitos, riesgos, skill matrix, equipo,
  cobertura) — la propia plantilla la ofrece.
- Crear un proyecto desde un `.json` de terceros ("Nuevo proyecto → cargar copia
  de seguridad"), `parseAndDecryptImportedProjectJson` (`main.js:988`), que valida
  la *forma* pero no el *contenido* de los strings.
- El Directorio de Talento consolida el Equipo de **todos** los proyectos
  (`collectTeamProfilesFromProjects`, `main.js:1452`) — un dato inyectado en un
  proyecto se propaga a otra ventana.

**Arreglo:** una `escapeHtml` en el dashboard y aplicarla en las ~20
interpolaciones de datos de usuario. Es tedioso pero mecánico, y alinea el
dashboard con las otras tres plantillas, que ya lo hacen bien.

## F2. Ninguna ventana declara Content-Security-Policy — [MEDIDO]

0 de 10 archivos HTML tienen `<meta http-equiv="Content-Security-Policy">`.

Una CSP no bloquearía el XSS de F1 (las plantillas dependen de scripts y estilos
en línea, harían falta `'unsafe-inline'`), pero **sí cortaría la exfiltración**:
`connect-src 'none'; img-src 'self' data:; form-action 'none'` convierte un XSS
en un defacement local en vez de en una fuga. Coste: una línea por plantilla.

## F3. Sin `setWindowOpenHandler` ni guardia de `will-navigate` — [LEÍDO]

Ninguna ventana intercepta `window.open` ni navegaciones. Combinado con F1, un
`<a href="https://…" target="_blank">` inyectado abriría una BrowserWindow de
Electron con contenido remoto. Es defensa en profundidad estándar: denegar
`setWindowOpenHandler` y mandar los enlaces externos a `shell.openExternal`.

## F4. Los CV nunca se cifran, aunque la Seguridad esté activa — [LEÍDO]

Ya documentado con honestidad en `main.js:1337-1343` como limitación conocida.
Lo repito aquí solo para que conste en el inventario: con la Seguridad activada,
los `.json` de proyecto/reunión/evaluación van cifrados y los PDF/Word de
candidatos en `cv/` van en claro. Si esa carpeta está en Google Drive, son datos
personales de candidatos sin cifrar en la nube.

## F5. Lo que está bien en seguridad (para que conste)

- `contextIsolation:true` / `nodeIntegration:false` en las 8 `BrowserWindow`
  explícitas; la ventana oculta de `writeLocalStorageDumpToPartition`
  (`main.js:2244`) no los declara pero hereda los valores por defecto seguros de
  Electron 30 (incluido `sandbox:true`).
- Sin `eval()`, sin `shell:true`, sin `exec()`. Todos los `execFile`/`spawn`
  pasan argumentos como array.
- `isSafeCvStoredName` (`main.js:1357`) rechaza `/`, `\` y `..` antes de tocar
  disco; `slugify` acota los nombres derivados de datos del usuario.
- Criptografía correcta: scrypt N=16384 con sal aleatoria por instalación,
  AES-256-GCM con IV por archivo, verificador HMAC en vez de guardar la
  contraseña, `safeStorage`/DPAPI para "recordar en este equipo". La contraseña
  nunca sale del proceso principal.
- Ningún secreto en duro.
- El flujo de "Aplicar parche" está bien diseñado: copia previa, SHA-256
  verificado contra el nombre, backup antes de sustituir, ayudante con tope de 2
  minutos, y recuperación automática al arrancar si el parche rompe el
  `require` (`handleFatalStartupError`, `main.js:80`).

---

# G. Lo demás que está bien (para no dar una impresión falsa)

- **La calidad del comentario en el código es excepcional.** Casi cada decisión
  no obvia explica el bug real que la motivó, qué se descartó y por qué. Es lo
  que ha hecho posible auditar 20.000 líneas sin ejecutar la app.
- La arquitectura de fondo es sólida: un proceso principal como única puerta a
  disco y BD, una partición de Electron por proyecto (aislamiento real de
  `localStorage`), contenido pesado en archivos y solo metadatos en SQLite.
- La decisión de `sql.js` sobre un módulo nativo sigue siendo correcta para este
  caso (cero recompilaciones por arquitectura, relevante en un ARM64).
- El manejo del caso "carpeta de datos en Drive" es notablemente maduro:
  reintentos en dos tramos, sonda de escritura real (no `existsSync`), versión
  asíncrona para no congelar la app en marcha, vigilancia en sesión, copia de
  emergencia local durante un corte, escritura atómica del `.sqlite3`, limpieza
  de `.tmp` huérfanos.
- Los 44 `ipcMain.handle` tienen consumidor real y ningún canal IPC queda
  huérfano en ninguna dirección (verificado cruzando los 5 preloads).
- Los puntos 1.1-1.6, 2, 3, 4 y 5 de la auditoría del 2026-09-12 están
  **resueltos de verdad** (comprobado uno a uno). `glosario_sr_linux.html` ya no
  existe; la lista `FILES` del snapshot está completa; `--disc-*`,
  `--red-border`, `--amber-border`, `--green`, `--red` ya los asigna
  `applyTheme()`. Lo de E3/E5 no es reincidencia: son los sitios que aquella
  auditoría no llegó a enumerar.

---

# Recomendación: en qué orden

**Bloque 1 — parar la hemorragia (haría esto antes que nada):**

1. **A1** (recifrar reuniones y evaluaciones). Es pérdida de datos silenciosa y
   permanente, disparada por un botón que promete lo contrario.
2. **A3** (instancia única). ~10 líneas, elimina un modo de fallo catastrófico.
3. **A2** (no crear un backup del estado que se descarta al restaurar).
4. **E1** (terminar o retirar la vista Lista/Resumen) + subir `package.json` a
   2.0.56. Sin esto no hay nada publicable.

**Bloque 2 — que sea rápida y no se llene de basura:**

5. **B1** (memoizar las lecturas de `projects:list`): de ~16 MB a ~4 MB por
   refresco, con 15 líneas.
6. **C1** (barrer backups huérfanos al arrancar) y **C2** (mover los
   `app.asar.bak-*` fuera de la carpeta sincronizada; borrar `app.asar` y
   `app1.asar` sueltos).
   *(16 sept 2026: el diagnóstico de C1 desaconseja el barrido ciego al
   arrancar — ver §C1.)*
7. **B3 + B2** (que los errores dejen rastro visible).

**Bloque 3 — coherencia visual, todo de la misma naturaleza, cabe en un parche:**

8. **E5** (añadir `--red-ink`/`--green-ink` y sustituir los 9 hex fijos),
   **E3** (unificar las 4 ventanas que faltan en `window-chrome.css`),
   **E4** (`themeSource` según el tema + combo del Directorio),
   **E6** (cargar `modal.js` en Evaluación de Candidatos).
9. **E2** (extraer `serviceStatus()` a `vendor/` y que la usen los dos lados).

**Bloque 4 — que esto no vuelva a pasar:**

10. **D1**: instalar `git` y poner el proyecto bajo control de versiones. Es la
    recomendación de mayor impacto del informe. Hoy 14 versiones de trabajo
    dependen de un solo disco.
11. **D2** (rutas de `gen_snapshot.py` relativas al script) y **D3** (arreglar el
    puerto del smoke test y portarlo a Windows). Sin una prueba de humo
    ejecutable, "superestable" depende de que no se escape nada leyendo.
12. **F1 + F2** (escape en el dashboard + CSP), **F3**.
13. **C3/C4/C5** (limpieza del árbol de trabajo, decidir cuál de las dos copias
    es la buena y borrar la otra, quitar `patch-icons` de `build.files`).

Nada de esto es urgente en el sentido de "la app no funciona" — funciona. Pero
A1 y A3 pueden destruir datos sin avisar, y son los dos que no dejaría abiertos.
