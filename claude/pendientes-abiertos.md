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
| P9 | **CERRADO** *(17 sept 2026)* · **ALTO / INTEGRIDAD** | Un `location.json` **presente pero ilegible o inválido ya nunca equivale a «no hay configuración»**. Un solo lector con estados explícitos (ausente / válido / ilegible / inválido): acepta UTF-8, UTF-8 con **un** BOM y UTF-16 con BOM; rechaza BOM duplicado o fuera de sitio, JSON roto, contrato incumplido y rutas no absolutas. Lo inutilizable **detiene el arranque** con PS-1020 (solo «Cerrar»): no se abre, crea ni registra ninguna BD, la protección de apagado no se toca y el rescate PS-1007 no restaura desde la carpeta por defecto. Solo `main.js`. `p9/` **282 OK/0** (exigente), Electron real **111 OK/0**, 7 reversiones. Ver §P9 — implementación |
| P10 | **DIAGNÓSTICO CERRADO** *(17 sept 2026)* · **LIMPIEZA / ARCHIVO DIFERIDO** · no se autoriza limpieza | 634 archivos, 222 carpetas, **197,68 MB** (confirmado). No se usa como carpeta de datos desde el **28/08 08:09 UTC**. Sus datos de usuario —la BD pre-A3.3 con 9 proyectos, 102 backups cifrados, una preparación y el estado de 8 particiones— tienen equivalente **casi completo** en G:, pero **no idéntico**: 101 backups y la preparación no existen en G:, y los proyectos 2, 3, 4 y 7 ya no están en la BD viva. Unos 104 MB son caché recreable y 81 MB son `.asar` antiguos. Sigue siendo el destino de tres caminos legítimos (sin `location.json`, «datos locales» en PS-1005, «usar la carpeta por defecto» en PS-1009) y del rescate PS-1007. **No se ha borrado ni movido nada.** Ver §P10 — DIAGNÓSTICO |
| P11 | **PENDIENTE** | UX, no urgente |
| E1 | **CERRADO** (15 sept 2026) | Controles de Lista/Resumen **retirados** de la UI (opción A). Ver §«E1 — CERRADO», abajo |
| P12 | **CERRADO** (15 sept 2026) | `rangoTemporalValido()`: sin escala demostrable no se infiere progreso. Batería **73 OK/0**, dashboard real **32 OK/0**, tres reversiones. Ver §P12, abajo |
| D4 | **ABIERTO / DIFERIDO A CIERRE DE RELEASE** | `package.json` 2.0.55 vs código 2.0.56. **Sigue siendo bloqueador de la publicación final, pero no del trabajo técnico intermedio.** Decisión del usuario (15 sept 2026): la numeración, el `package.json` y la publicación pertenecen a la fase final de release, y cambiar ahora una versión que volverá a cambiar al terminar la auditoría no aporta nada. **Antes del release, verificar también P19** (codificación del `location.json` que escribe el instalador) |
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
| F2 | **CERRADO** *(17 sept 2026)* | **CSP efectiva en las 10 ventanas**, por cabecera desde `main.js`, con cuatro perfiles mínimos; sin `unsafe-eval`; red, frames, objects, formularios y `<base>` cortados; lanzador y splash sin `unsafe-inline` en scripts; Worker de pdf.js arrancado por `blob:`. Dos archivos: `main.js` y la plantilla de Preparación. Ver §F2/F3 |
| F3 | **CERRADO** *(17 sept 2026)* | Política única de apertura y navegación en las 10 ventanas. Ver §F2/F3 |
| P18 | **FASE 1 CERRADA** *(18 sept 2026)* · **FASE 2 ABIERTA / D4** · **INTEGRIDAD** | **El rescate automático solo restaura una copia con procedencia demostrada.** Copia **local** (`%LOCALAPPDATA%\panorama-app-recovery\app.asar.pred-<op>`) + registro local (`asar-procedencia.json`) + `operation_id` + `installation_id` de A3.3 + PREPARADA→VERIFICADA con hashes antes/después. Las `app.asar.bak-*` heredadas **no son candidatas nunca**. Si el asar instalado no coincide o no se lee: solo con **confirmación explícita** (Cerrar por defecto, Esc/X = Cerrar). Sin copia verificable: se informa y se cierra, **sin recomendar el `.bat`**. **Límite:** la Fase 1 vive en `main.js`, dentro del asar; con el asar truncado, sin cabecera, sin `main.js` o inexistente **no se ejecuta ni una línea de Panorama** — eso es la **Fase 2 / D4** (rescate externo, `.bat`, instalador). Solo `main.js`. `p18/` **@@P18NODE@@**, reversiones **@@P18REV@@**. Ver §P18 — Fase 1 implementada |
| P18 *(diagnóstico)* | — | **P18 agrupa dos riesgos con la misma raíz: el rescate PS-1007 y la procedencia de las copias, y `Restaurar-backup.bat`.** Nada demuestra de dónde sale una copia de `app.asar`, así que los dos caminos eligen **por fecha de nombre**. Medido: el `patch-log.txt` de la carpeta compartida registra **106 parches de SEIS instalaciones distintas** — una copia ajena ya puede estar ahí. Con Drive sin montar o sin `location.json`, restauraría la **v0.1.28** sobre la 2.0.55. Una copia **truncada** se elegiría y se copiaría encima sin mirarla. Diseño propuesto: manifiesto de procedencia **local** + fail-closed. **No implementado.** Ver §P18 — diagnóstico |
| P18 *(hallazgo original)* | — | **`Restaurar-backup.bat` puede elegir la carpeta por defecto** con ciertos formatos de `location.json` (JSON en una sola línea, UTF-16) y restaurar desde ahí una copia de `app.asar` de otra época. Ver §P18–P21 |
| P19 | **PENDIENTE — verificar antes de release** (D4 / packaging) | **El instalador podría escribir `location.json` en ANSI** (razonado, no medido). Con P9 ya **no** cambia de BD en silencio: PS-1020, falla cerrado. Ver §P18–P21 |
| P20 | **CERRADO dentro de P22** *(18 sept 2026)* | Era: «Abrir con datos locales» en PS-1005 desactivaba la protección de apagado. Ahora una **sesión local temporal** no la toca —ni la marca, ni `HKCU\…\Run`, ni la tarea— y la marca de ubicación propia sobrevive. Volver a la carpeta por defecto **a propósito** sí la sigue sincronizando: es una decisión permanente, no un camino de reserva. Ver §P22 — implementación |
| P22 | **CERRADO** *(17-18 sept 2026)* · era **ALTO / INTEGRIDAD** | **La carpeta de datos local ya no se abre ni se crea sin decirlo.** Una sola puerta antes de tocar nada: la base local se reconoce en **cuatro** estados (ausente / existente / **inválida** / no comprobable), y las dos últimas **cierran** (PS-1023) sin abrir, sustituir ni pisar nada. Con base local existente hay **confirmación informada** (PS-1021, con fecha y tamaño); sin base local y con historia previa, crear una vacía exige pedirlo. **Esc y la X cierran**, nunca eligen lo local. La BD configurada ilegible ya **no** cae sola: pregunta (PS-1022). Marca durable `historial-ubicacion.json` (hash de la ruta, nunca la ruta), que ningún camino de reserva borra y cuyo fallo de escritura **no es silencioso** (PS-1024) ni vuelve a parecer una instalación nueva. Solo `main.js`. `p22/` **74 OK / 0**, Electron real **39 OK / 0** (14 arranques), 7 reversiones **29 OK / 0**. Ver §P22 — implementación |
| P22 *(diagnóstico)* | — | Lo que se midió antes de implementar: cuatro caminos legítimos llegaban a la carpeta local y abrían o creaban sin avisar; uno de ellos **sin ningún diálogo**. Ver §P22 — diagnóstico | **La carpeta de datos local sigue siendo un destino operativo ambiguo.** Cuatro caminos legítimos llevan a ella —PS-1005 «datos locales», PS-1009 «usar la carpeta por defecto», arranque **sin** `location.json`, y la BD compartida ilegible, que cae ahí **sin ningún diálogo**— y en los cuatro la app **abre y modifica** la base de datos local que encuentre, o **crea una nueva**, sin decir de qué base se trata ni desde cuándo. La app **no tiene forma de saber** que el equipo ya tuvo una ubicación propia. Aparte: **PS-1007 elige la copia de `app.asar` por la fecha del nombre**, sin versión ni procedencia (en esta máquina, sin `location.json` o con G: sin montar, restauraría la **v0.1.28** sobre la 2.0.55). Ver §P22 |
| P23 | **ABIERTO — MEDIO** *(18 sept 2026)* · va con **A3.3 Bloque 8 / ciclo de vida de Drive** | **`DriveSyncGuard` acepta referencias persistentes a una instalación incorrecta.** `syncDriveSyncGuardWithLocation()` da la protección por sana cuando `shouldBeOn && isOn` (y el proceso late), pero **no comprueba que `HKCU\…\Run` ni la tarea programada apunten al `resources/drive-sync-guard` de la instalación que se está ejecutando**. Un guardián vivo de otra instalación impide la autorreparación de esas referencias. **Sin pérdida de datos demostrada.** Impacto: tras reiniciar Windows, la protección podría no arrancar si esas referencias apuntan a una ruta eliminada. **Lo descubrió un arnés, pero la condición es del producto.** No se corrige ahora. Ver §P23 |
| P21 | **PENDIENTE — pasada E2E / Preparación** | **Preparación tras F2: cerrar → reabrir → leer otra acta.** Sin cobertura explícita. **F2 no se reabre.** Ver §P18–P21 |
| F1 *(diagnóstico)* | — | Interpretación de datos como HTML. **Diagnóstico cerrado; sin implementar.** Patrón **global en el dashboard** (19 campos se interpretan y ejecutan al abrir, sin interacción); vía persistente más grave: **título importado horneado** en `projects/<id>/dashboard.html`, que ejecuta en el **arranque**. Propagación cruzada a Preparación y Directorio. Evaluación y Directorio casi todo escapado (residuos: peso/fecha/id de Evaluación, `data-dedic` del Directorio). **Barreras reales:** `contextIsolation:true` + `sandbox:true` + sin Node en las 4 ventanas → **no es RCE**; pero `psConfirm` sobrescribible, puente con 25 métodos, **sin CSP** (F2) y `window.open` sin handler (F3). Batería `f1/` (**100** descriptiva + **34** Electron real, 3 arranques, con marcadores inocuos). Ver §F1 |

## Pendientes de ARNÉS (no de producto)

Van aparte a propósito: no describen ningún defecto de Panorama, sino de la
batería de pruebas.

| # | Estado | Qué |
|---|---|---|
| ARN-1 | **PENDIENTE — antes del E2E / release final** *(registrado al cerrar P9, 17 sept 2026)* | **`nucleo-a33/test-nucleo.js` no es determinista: da 394 o 395 aserciones.** La rama «LOCAL, peor caso» (líneas ~561–590) solo se recorre si `fs.utimesSync` devuelve el `mtimeMs` **exactamente** igual (`===`). En NTFS unas veces ocurre y otras no. Si ocurre, se anotan **dos** OK (el atajo no lo detecta + la fila externa se pierde, límite conocido); si no, **uno** (el stat lo detecta). Medido el 17 sept: **7 × 394 y 1 × 395** en 8 tiradas. **No invalida la regresión:** la rama está identificada y las dos variantes pasan. Hay que hacerla determinista (p. ej. forzar o separar el peor caso) antes del E2E o del release final. **No se arregla ahora** |
| ARN-2 | **OBSERVACIÓN NO RESUELTA** *(registrada al cerrar F2)* | La captura `6-directorio-ficha.png` de `f1/electron-f1-limpio.ps1` sale de 0 bytes. Ver §F2/F3 |

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
| P9 | **`location.json` con BOM se ignora en silencio** | Descubierto probando A3.1: si el archivo se guarda con BOM (p. ej. desde el Bloc de notas), `JSON.parse` falla, se traga la excepción y la app cae a la carpeta de datos local sin avisar | **PENDIENTE en producción.** Corregido solo en los arneses: `comun/guardia-rutas.js` es fail-closed y `GUARD-LOC-2` lo cubre. `main.js` sigue igual. **Diagnosticado el 17 sept 2026: riesgo de integridad, no UX — ver §P9** · **CERRADO el 17 sept 2026 (reclasificado ALTO / INTEGRIDAD) — ver §P9 — implementación** |
| P10 | **~85 MB de residuos en `%APPDATA%\panorama-app`** | Carpeta de datos local de antes de mover los datos a Drive (agosto): `app.asar`, `app1.asar`, un `app.asar.bak-*` y una `panorama.sqlite3` del 28/08. No la usa nada | **PENDIENTE.** Confirmado el 15 sept: esa `panorama.sqlite3` es `F71F4140…`, 57 344 B — ver abajo · **Diagnosticado el 17 sept 2026:** mide 197,68 MB, no ~85, y **no** es solo basura — ver §P10 — DIAGNÓSTICO |

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

## P9 — DIAGNÓSTICO (17 sept 2026): un `location.json` ilegible manda a la carpeta por defecto EN SILENCIO

> **Implementado y CERRADO el mismo día** — ver §P9 — IMPLEMENTACIÓN Y CIERRE,
> justo después de este diagnóstico, que se conserva tal cual como historia.

**Solo diagnóstico. Producción sin tocar.** Batería `p9/`:
`test-p9-location.js` **137 OK/0** (descriptiva) + `electron-p9.ps1` **48 OK/0**
en la app real (26 arranques en sandbox). La BD viva, la configuración real,
el residuo de P10 y la entrada de la protección de apagado en el registro de
Windows quedan **idénticos** (comparados antes y después).

### El original, sin reinterpretar

> «`location.json` con BOM se ignora en silencio. Descubierto probando A3.1: si
> el archivo se guarda con BOM (p. ej. desde el Bloc de notas), `JSON.parse`
> falla, se traga la excepción y la app cae a la carpeta de datos local sin
> avisar.» — PENDIENTE en producción; corregido solo en los arneses
> (`comun/guardia-rutas.js`, fail-closed, GUARD-LOC-2).

- **Evidencia original:** observación durante A3.1; no había prueba propia.
- **Severidad:** no se escribió (estaba en «Hallazgos incidentales, sin diseño»).
- **Parte BOM:** el disparador. `readFileSync(…,'utf8')` conserva U+FEFF y
  `JSON.parse` lanza.
- **Parte *fallback*:** el `catch` devuelve `null` y el arranque sigue como si
  no hubiera configuración.

### Dónde vive, quién lo escribe, quién lo lee

| | |
|---|---|
| Ruta | `%APPDATA%\panorama-app-config\location.json` (fuera de la carpeta de datos, a propósito) |
| Formato | `{ "userDataDir": "<ruta>", "shared": true\|false }` |
| Escribe el **instalador** | NSIS `FileWrite`: CRLF, barras `/`, `"shared": true`. En un instalador Unicode, `FileWrite` escribe **ANSI** (documentación de NSIS; **razonado, no medido**: no se empaqueta) |
| Escribe la **app** | `changeUserDataLocation`: `JSON.stringify(…, null, 2)`, UTF-8 **sin** BOM |
| Lo borra | `resetUserDataLocationToDefault` |
| Lo leen | `readConfiguredUserDataTarget` y `readConfiguredUserDataShared` (arranque); `resolveDataDirForStartupRecovery` (rescate PS-1007); `Restaurar-backup.bat` (con `findstr`, otro algoritmo) |
| Codificación esperada | UTF-8 sin BOM. **Nadie** quita el BOM ni reconoce UTF-16 |
| **Esta máquina** (solo lectura) | 78 B, **sin BOM**, CRLF, ASCII, formato del instalador → **hoy se lee bien**. Sin registro de ubicaciones (la versión instalada es anterior a A3.3). La carpeta por defecto guarda el residuo de P10 (`F71F4140…`, del 28/08) y un `app.asar.bak` del **26/08**; G: tiene los del 12/09. La protección de apagado **está activa** (marca, latido reciente, HKCU\…\Run y tarea programada) |

### El algoritmo actual

1. **Al cargar el módulo (antes de `ready`, sin ventana posible).**
   `readConfiguredUserDataTarget()` devuelve `null` tanto si el archivo **no
   existe** como si **no se puede interpretar**, y no deja rastro. Con destino,
   `probeWritableDir` crea la carpeta (`mkdir` recursivo) y prueba a escribir,
   durante 5 s. Si funciona, `setPath('userData')`; si no, se anota
   `customUserDataDirFailure`.
2. **`whenReady`, si hubo fallo:** 20 s más de reintentos y después el diálogo
   **PS-1005** («Reintentar» / «Abrir con datos locales (temporal)»).
3. **`checkCustomLocationDatabaseSanity`**, solo con destino accesible: si no
   hay base de datos, 20 s de espera y después **PS-1009** («Esperar» /
   «Empezar aquí desde cero» / «Usar la carpeta por defecto»).
4. **`syncDriveSyncGuardWithLocation`**: con carpeta compartida la protección
   de apagado se activa; si no, **se desactiva**. `checkMultiPcLock` solo actúa
   con carpeta compartida.
5. **`clasificarPoliticaUbicacion`**: sin destino en uso, la política es
   **`local`**.
6. **`decidirCrearSiAusente`** sobre la carpeta de la sesión, y después
   `getDb`.

### Tabla caso → resultado (medido; A3.3 incluido)

| `location.json` | Lo que hace hoy | Clase |
|---|---|---|
| válido (formato del instalador, de la app, compacto; espacios alrededor) | abre la **compartida**; política compartida | E |
| **no existe** | carpeta por defecto (legítimo: no hay nada configurado) | E |
| **BOM**, BOM + espacios, espacios + BOM, BOM doble, **UTF-16** (LE/BE, con o sin BOM), vacío, `{`, truncado, basura detrás, comentarios, `null`, `{}`, `[]`, cadena, `userDataDir` numérico/array/objeto/vacío/solo espacios, clave equivocada o con otra capitalización, archivo **ilegible** (EACCES/EPERM/EBUSY/EIO) o que es una carpeta | **exactamente lo mismo que «no existe»**, sin diálogo y sin línea de log. Política `local`: sin espera de Drive, sin candado multi-PC y **protección de apagado desactivada**. Después, según la carpeta por defecto: | — |
| ↳ con BD residual y sin registro (**esta máquina**) | **abre la BD residual** — medido con una **copia** del residuo real: 8 proyectos del 28/08, **la modifica al abrirla**, y lo único que se ve es el **inicio de sesión de Seguridad de siempre** | **B** |
| ↳ carpeta por defecto vacía y sin registro (PC con la carpeta compartida y sin residuo) | **crea una BD nueva y vacía** («primera ejecución») y la registra como inicializada | **C** |
| ↳ carpeta por defecto registrada y vacía | **falla cerrado (PS-1016)**, sin crear BD (aunque `db.js` recrea la carpeta vacía) | A |
| ↳ registro de ubicaciones con BOM | no autoriza crear; abre la existente y se cierra con PS-1018 sin modificarla | A |
| ruta **relativa** | crea la carpeta relativa en el directorio de trabajo; `app.setPath` lanza «Path must be absolute» **al cargar el módulo** → **no arranca** (PS-1007) | A |
| ruta absoluta **inexistente** | **crea** la carpeta y pregunta **PS-1009** | D |
| unidad **no montada** (`Q:`) o ruta inaccesible | **PS-1005** tras ~25 s. Con «datos locales» se abre la de por defecto **y se desactiva la protección de apagado** | D |
| ruta en **ANSI** (cp1252, p. ej. «Año») | se decodifica con `U+FFFD`, **crea una carpeta con ese nombre** y pregunta PS-1009 | D |

**Detalles medidos que agravan:**

- **La protección de apagado se desactiva sola.** Con BOM (y también tras
  elegir «datos locales» en PS-1005), la app borra su marca y pide
  `reg delete HKCU\…\Run` y `schtasks /delete` (en el arnés, bloqueados y
  anotados). Solo deja una línea en el log.
- **Los dos lectores divergen.** El arranque recorta espacios y exige una
  cadena; el rescate PS-1007 no hace ninguna de las dos cosas. Con BOM, el
  rescate buscaría las copias de `app.asar` en la carpeta **por defecto**; en
  esta máquina, esa copia es del **26/08** (en G: son del 12/09).
  **Combinado con un fallo fatal de arranque** —razonado, no provocado— se
  restauraría una versión de hace semanas.
- **`Restaurar-backup.bat`** tolera el BOM en el formato de varias líneas, pero
  con JSON compacto o UTF-16 elige la carpeta por defecto (medido, sin copiar
  nada).
- **Observación sin hallazgo:** `claveUbicacion` no normaliza nombres cortos
  8.3 (`ADMIN~1.JLO` y `admin.jlopezr` dan claves distintas). Lo destapó el
  arnés; en la app ambos lados usan la misma forma.

### ¿Puede abrir o crear otra BD en silencio? **Sí → RIESGO DE INTEGRIDAD**

No es un problema de UX. En esta máquina se abriría **en silencio** la base de
datos de agosto: el usuario vería la ventana de contraseña de siempre, después
proyectos antiguos, y trabajaría sobre ellos, con el candado multi-PC y la
protección de apagado desactivados. Es el mismo modo de fallo que el incidente
real de la v0.1.42, que ya costó recuperar datos a mano. En otro PC, la app
empezaría con una BD vacía y la registraría como inicializada. El disparador es
**externo a la app**, porque ella nunca escribe BOM: el Bloc de notas con
«UTF-8 con BOM» o «Unicode», `Set-Content`/`Out-File` de PowerShell 5.1, una
herramienta de sincronización o una edición a mano. **Probabilidad baja,
impacto alto y fallo silencioso.**

### Propuesta mínima de reparación (NO implementada)

1. **Un único lector cerrado** en `main.js` —el mismo modelo que
   `guardia-rutas.js`— usado por las tres lecturas. Devuelve
   `ausente | ok | ilegible | invalida`:
   - **tolera** un BOM UTF-8 y el UTF-16 **con** BOM (se decodifican sin
     ambigüedad y se leen con normalidad);
   - UTF-8 inválido (el ANSI del instalador), JSON roto, objeto que no es
     objeto, `userDataDir` que no es una cadena no vacía, o ruta **no
     absoluta** → `ilegible`/`invalida`;
   - `shared` solo cuenta si es booleano (como hoy).
2. **`ilegible`/`invalida` NUNCA degrada en silencio.** En `whenReady`, antes
   de tocar ninguna base de datos, un diálogo **bloqueante** con código nuevo
   (motivo **sin rutas** en `app.log`). Opciones: «Cerrar» (por defecto) y
   «Abrir con datos locales (temporal)», que es la misma salida explícita que
   ya ofrece PS-1005. **Sin reintentos**: un archivo mal escrito no se arregla
   esperando.
3. Mientras la configuración sea ilegible, **ninguna creación autorizada**
   (`decidirCrearSiAusente` → no) y **no se sincroniza** la protección de
   apagado (no se cambia el sistema a partir de una configuración que no se
   entiende).
4. **Rescate PS-1007:** con la configuración ilegible **no restaura
   automáticamente** desde la carpeta por defecto; remite a
   `Restaurar-backup.bat`.
5. **Fuera del mínimo**, cada uno para su propio bloque:
   - `installer.nsh`: escribir UTF-8 o UTF-16 con BOM (es **packaging**);
   - `Restaurar-backup.bat`: su analizador de líneas (va en `extraResources`);
   - que «datos locales» en PS-1005 **también** desactive la protección de
     apagado. Es comportamiento previo a P9 y hay que decidirlo aparte.

**Archivos que tocaría:** **solo `main.js`**: el lector, el diálogo en
`whenReady`, la guarda de creación, la de la protección de apagado, el rescate
y la entrada nueva en `ERROR_CODES`. Ni `db.js`, ni preloads, ni plantillas.

**Riesgo de regresión: bajo-medio.**

- Los formatos válidos de hoy tienen que seguir entrando igual; están cubiertos
  (instalador, app, compacto, espacios).
- Los archivos con BOM, que hoy fallan en silencio, **empezarían a funcionar**
  (abrirían la compartida).
- Los ilegibles pasarían a ver un diálogo, que es lo que se busca.
- Un instalador con ruta no ASCII daría un error visible en vez de una carpeta
  mal nombrada.
- Varios arneses extraen `readConfiguredUserDataTarget` y compañía, así que
  habría que ampliar la lista de extracción compartida.
- La decisión se toma a nivel de módulo pero el aviso llega en `whenReady`, el
  mismo patrón que ya usa `customUserDataDirFailure`.

**Pruebas necesarias:** convertir `p9/` en **exigente**: cada variante
clasificada, BOM y UTF-16 con BOM leídos bien, y ningún caso ilegible que llegue
a `getDb` sin decisión explícita. En Electron real:

- BOM → abre la compartida;
- truncado, `null` o tipo erróneo → diálogo, **ninguna BD abierta ni creada** y
  la protección de apagado **intacta**;
- relativa → diálogo en vez de PS-1007;
- la copia del residuo real **sin modificar**.

Reversiones por familia (quitar la tolerancia al BOM, volver al `null`
silencioso, sincronizar la protección igualmente, rescate a ciegas).

**No se ha tocado:** P10 (el residuo real solo se ha **leído y copiado** al
sandbox, y su hash sigue igual), P14/P15/P16, C1-B, Drive/multi-PC, bloques 7–9,
D4 y packaging.

**Nota de evidencia (BD viva):** durante la ronda la huella de la BD viva pasó
de `D5C3FF53…` a `C26323D1…`. La causa es una **sesión real del usuario**:

- el `app.log` de G: registra actividad entre las 11:02 y las 11:04 UTC de los
  proyectos 14 y 15, con un «manual-button» y los cierres «closing» y
  «beforeunload»;
- el `.sqlite3` se escribió a las 13:04:57 (hora local).

Ese momento cae **entre** dos tiradas del arnés P9: la anterior terminó hacia
las 12:33 con la BD idéntica y la siguiente empezó a las 14:22. Cada tirada
compara su propio antes y después, y todas dieron idéntica. La línea base se ha
actualizado en `comun/baseline-bd-viva.json`, con el motivo y la anterior
conservada.

## P9 — IMPLEMENTACIÓN Y CIERRE (17 sept 2026)

**CERRADO. Reclasificado ALTO / INTEGRIDAD.** El defecto real no era «`JSON.parse`
no tolera el BOM», sino esta cadena: `location.json` presente pero ilegible →
tratado igual que ausente → carpeta por defecto en silencio → abre (y modifica)
una BD residual antigua, o crea una vacía. **Esa cadena ya no existe:** un
archivo presente pero inutilizable **nunca** equivale a «no hay configuración».

**Único archivo productivo tocado: `main.js`** (`E7D596A8…` →
**`2D05E00B53B8C45E6823E8629579D303FB69E2B0A24E53DCBE7700897E5F30F9`**,
610 975 B; +205 / −26 líneas). Instantánea previa:
`claude/main.js.ANTES-P9-2026-09-17`. `db.js`, `security.js`, los preloads, el
instalador y `Restaurar-backup.bat` siguen idénticos.

### Qué cambia

| Pieza | Antes | Ahora |
|---|---|---|
| Lectura | Tres lecturas (`readConfiguredUserDataTarget`, `readConfiguredUserDataShared` y la del rescate) que devolvían lo mismo ante cualquier error que sin archivo | **Un solo lector, `leerConfigUbicacion()`**, con cuatro estados: `ausente` (**solo** ENOENT), `valido`, `ilegible` e `invalido`. El motivo nunca lleva rutas |
| Codificación | `readFileSync(…, 'utf8')`: el BOM se quedaba y rompía `JSON.parse` | Lee **bytes**. Admite UTF-8 sin BOM, UTF-8 con **un** BOM (se quita **solo ese**) y UTF-16 LE/BE **con** BOM. `TextDecoder` con `fatal` e `ignoreBOM`. **No se adivina nada** por el contenido |
| Contrato | Ruta de tipo cadena, recortada; `shared` booleano o, si no, `true` | Objeto JSON; `userDataDir` **propio**, cadena no vacía, **sin espacios alrededor**, sin caracteres de control, U+FEFF, U+FFFD, `< > " \| ? *` ni `:` fuera de la unidad, y **absoluta** (`X:\`, `X:/` o UNC). `shared`, si está, **booleano**; si falta, `true` (archivos anteriores a la 0.1.57) |
| Arranque a nivel de módulo | Ilegible = sin configuración | Presente pero inutilizable → `configUbicacionNoResuelta`. **Sin `mkdir`, sin `setPath`, sin esperas** |
| `whenReady` | Seguía como si nada | **Lo primero**: `detenerArranquePorConfigUbicacion()` → aviso **PS-1020** con **un solo botón, «Cerrar»**, y `app.quit()`. Va antes de la splash, las esperas de Drive, la protección de apagado, el candado multi-PC, la decisión y el registro de A3.3, `getDb` y el lanzador |
| Segunda capa | — | `decidirCrearSiAusente` nunca autoriza crear sin ubicación resuelta; `syncDriveSyncGuardWithLocation` deja la protección **exactamente como está** |
| Rescate PS-1007 | Config dañada → buscaba copias de `app.asar` en la carpeta por defecto | Config inutilizable → **no restaura nada** y lo dice |
| `ERROR_CODES` | — | **PS-1020** «No se puede leer la configuración de ubicación de datos» |

### Decisiones tomadas

- **«Abrir con datos locales (temporal)» queda ELIMINADA.** No se pueden
  demostrar las diez propiedades exigidas:
  - la única BD local de esta máquina es justo el **residuo histórico** (P10),
    el caso en que no debe ofrecerse;
  - distinguir una BD local «reconocible» de un residuo exigiría una heurística
    nueva;
  - abrirla sin registrarla contradice A3.3, que deja constancia
    (`detectada-existente`) **antes** de abrir.

  Por la regla del propio encargo, **solo «Cerrar»**.
- **Espacios alrededor de la ruta:** antes se recortaban; ahora el archivo es
  **inválido**, porque el contrato es exacto y no se eliminan caracteres. El
  `location.json` real de esta máquina no los tiene: sigue siendo **válido**
  (comprobado en solo lectura, `P9-Z3`).
- **`shared` que no es booleano** (p. ej. `"false"` como cadena): antes contaba
  como compartida; ahora el archivo es inválido.
- **El mensaje** es exactamente el pedido, con el motivo, la forma
  `%APPDATA%\panorama-app-config\location.json` (nunca la ruta real) y un «No lo
  borres»: sin el archivo, la app usaría la carpeta por defecto.
- **Nada persiste la decisión:** `location.json` no se toca y el siguiente
  arranque lo vuelve a leer.
- **Rastro:** el `app.log` de la carpeta por defecto recibe dos líneas
  `ERROR PS-1020`, sin rutas. Es un registro de texto, no una BD ni el registro
  de ubicaciones. En una carpeta por defecto que no existía, Chromium crea
  `panorama-app\` con `Local State` (el cerrojo de instancia única ya vivía ahí
  antes de P9); ningún `panorama.sqlite3*` ni `.panorama-*`.

### Caso → resultado, medido en la app real

| `location.json` | Ahora | Antes |
|---|---|---|
| válido (instalador, app, compacto, UNC…) | abre la compartida | igual |
| **UTF-8 + BOM** | abre **la misma** compartida, sin avisos | abría el residuo o creaba una BD, en silencio |
| **UTF-16 LE / BE + BOM** | abre **la misma** compartida | igual que con BOM |
| BOM doble o fuera de sitio, `{`, truncado, `null`, `{}`, `[]`, tipo erróneo, ruta vacía o de espacios, **relativa**, **ANSI**, UTF-16 sin BOM, carpeta en lugar de archivo (EISDIR), archivo **bloqueado** por otro proceso (EBUSY) | **PS-1020 y cierre**, con **cero ventanas**. No se abre ni se crea ninguna BD. Quedan intactos el residuo, la compartida, `location.json` y el registro de ubicaciones. La protección de apagado no se toca. No se pide nada al sistema | vuelta silenciosa a la carpeta por defecto; la relativa, `mkdir` en el directorio de trabajo + PS-1007; la ANSI, carpeta mal nombrada + PS-1009 |
| **no existe** | carpeta por defecto (primera ejecución legítima) | igual |
| válido + ruta **inexistente** | la crea y pregunta PS-1009 | igual (no es P9) |
| válido + unidad **no montada**, ruta **inaccesible** o acceso **denegado** | PS-1005 | igual (no es P9) |

Permisos denegados sobre el propio `location.json` (EACCES/EPERM/EIO) se
prueban con dobles de `fs` en la batería Node; en la app real, con el archivo
**bloqueado de verdad** por otro proceso (EBUSY) y con una carpeta en su lugar
(EISDIR). **No se ha cambiado ninguna ACL.**

### Evidencia

- `p9/test-p9-location.js` — **282 OK / 0**, EXIGENTE (nació descriptiva con
  137).
- `p9/electron-p9.ps1` — **111 OK / 0**: 32 arranques y 2 de preparación. BD
  viva, configuración real, residuo de P10, archivos productivos y valor de
  HKCU\…\Run **idénticos**.
- `p9/comprobar-reversiones-p9.js` — **29 OK / 0**: siete familias, las
  cinco pedidas (A–E) más F (rescate) y G (guarda de la protección). Cada una
  tumba **solo** lo que anuncia.
- `p9/electron-p9-revertido.ps1` — **14 OK / 0**: A–E en la app real.
  - A: el BOM vuelve a caer.
  - B: el residuo se abre y **cambia su hash**; se crea una BD nueva y la
    protección se desactiva.
  - C: vuelve `datos\relativa`.
  - D: aparece una BD nueva.
  - E: el hash del residuo cambia.
- Regresión completa — **3475 OK / 0 (3518 con `comun/`), con A2, los bloques 1–5 de A3.3, C1, F1, F2, F3, P17 y el núcleo en verde**.
  Cuadre y peculiaridades de la cifra (`nucleo-a33` da 394 o 395 según la
  tirada) en `pruebas-a33/MANIFIESTO.md` §4.
- Las demás reversiones siguen rompiendo lo suyo: F1 **19/0**, F2 **31/0**, F3
  **5/0**, P17 **6/0**, C1 **7 de 7** (con sus copias regeneradas), B3 **7**,
  B4 **2** y B5 **1**.
- Regresión Electron: los **19** arneses de la tabla, en verde y con las mismas cifras que antes de P9 (A2 **66**, bloque 5 de A3.3 **71** + CV **12**, F1 **47** + **52**, F2 **212** + laboratorio **41** + reversiones **7**, F3 **36** + **4**, P17 **16**, C1 **31**, E1 **21**, P12 **32**, E2 **42**, B1 **24**, B3 **36**, B4 **17**, B5 **24**), con la BD viva idéntica en cada uno.

### Arneses ajustados (defecto de arnés, no de producto)

- `bloque2/test-wiring.js`: declara `configUbicacionNoResuelta`. La versión
  anterior **revienta** contra el `main.js` nuevo con `ReferenceError`
  (medido).
- `bloque3/test-error-codes.js`: el anclaje de orden. PS-1020 va detrás de
  PS-1019; la intención sigue siendo que los cuatro de A3.3 salgan seguidos.
- `e1/test-inventario-e1.js` (`E1-M4`): el hash de `main.js`.
- `real-run/p9-ubicacion.js`: admite `P9_MAIN_FUENTE` y anota las ventanas
  creadas y el texto y los botones de cada diálogo.
- `electron-p9.ps1`: restaura `APPDATA` y `LOCALAPPDATA` al terminar.

### Pendientes SEPARADOS (no se tocan en P9)

- **P19 — Instalador** (`installer.nsh`): `FileWrite` escribe ANSI (razonado,
  no medido). Una ruta con tildes **ya no abre otra BD**: se detiene con
  PS-1020. Arreglarlo es packaging.
- **P18 — `Restaurar-backup.bat`**: con JSON compacto o UTF-16 elige la
  carpeta por defecto. Solo afecta al rescate **manual**.
- **P20 — PS-1005 «datos locales»** sigue desactivando la protección de
  apagado. Es comportamiento anterior a P9, medido en `guard/no-montada`.
- **P21 — Preparación: cierre/reapertura tras F2 + lectura posterior de un
  acta.** Va en una pasada E2E/Preparación. **F2 no se reabre.**
- **ARN-1 — `nucleo-a33`** da 394 o 395 según la tirada. Es de arnés, no de
  producto: ver «Pendientes de ARNÉS».

### Aceptación (17 sept 2026)

**El usuario acepta la implementación y la evidencia: P9 → CERRADO.** También
acepta la eliminación de «Datos locales (temporal)»: es preferible fallar
cerrado a ofrecer una BD local histórica o ambigua. El tamaño del cambio
(+205 / −26 en `main.js`) se da por bueno: es un único archivo productivo y
toda la lógica pertenece a la resolución temprana de la ubicación.
**No se refactoriza más P9 y no se reabre salvo regresión demostrada.**

## P18–P21 — REGISTRADOS al cerrar P9 (17 sept 2026)

Cuatro pendientes que P9 destapó o dejó fuera **a propósito**. **Ninguno se ha
corregido.** Cada uno va a su bloque.

### P18 — `Restaurar-backup.bat` puede elegir la carpeta por defecto — PENDIENTE, INTEGRIDAD

- **Qué:** el rescate **manual** lee `location.json` con su propio algoritmo
  (`findstr "userDataDir"` sobre la línea) y, si no encuentra la ruta, usa
  `%APPDATA%\panorama-app`.
- **Medido** (copia del `.bat` en sandbox, sin copias de `app.asar` que
  restaurar; `p9/test-p9-location.js`, sección `P9-R`):

  | Formato de `location.json` | Carpeta que elige el `.bat` |
  |---|---|
  | formato del instalador, con o sin BOM | la compartida |
  | formato de la app (varias líneas) | la compartida *(medido en la batería de diagnóstico de P9, con el mismo `.bat`)* |
  | JSON en **una sola línea** | la **por defecto** |
  | **UTF-16** con BOM | la **por defecto** |
  | sin archivo | la por defecto (legítimo) |

- **Riesgo:** en esta máquina, la carpeta por defecto guarda un
  `app.asar.bak` del **26/08**; los de G: son del 12/09. Con uno de esos
  formatos, el rescate manual ofrecería la copia antigua. Hoy la app **sí** lee
  UTF-16, así que la app y el `.bat` pueden discrepar sobre cuál es la carpeta.
- **Por qué no se tocó en P9:** el `.bat` va en `extraResources`, y cambiarlo
  toca el empaquetado.

### P19 — el instalador podría escribir `location.json` en ANSI — PENDIENTE, verificar antes de release (D4 / packaging)

- **Qué:** `build/installer.nsh` escribe el archivo con `FileWrite`, que según
  la documentación de NSIS escribe **ANSI** incluso en un instalador Unicode.
  **Razonado, no medido:** en toda la auditoría no se ha empaquetado nada.
- **Efecto hoy, con P9:** una ruta con ñ o tildes queda en cp1252. El lector la
  declara **ilegible** y el arranque se detiene con **PS-1020**. Medido con
  bytes cp1252, en Node y en la app real. **Ya no cambia de BD en silencio.**
- **Antes del release:** construir el instalador, elegir una carpeta
  compartida con ñ o tildes y comprobar los **bytes** del `location.json`
  escrito. Si sale ANSI, escribir UTF-8 (o UTF-16 con BOM) desde NSIS. Va con
  **D4 / packaging**.

### P20 — «Abrir con datos locales» (PS-1005) desactiva la protección de apagado — PENDIENTE, con el ciclo de vida de Drive

- **Qué:** con JSON válido pero la unidad **no montada** o la carpeta
  inaccesible, tras PS-1005 y «Abrir con datos locales (temporal)», la sesión
  pasa a ser «local». `syncDriveSyncGuardWithLocation` borra entonces la marca
  y pide `reg delete` y `schtasks /delete`.
- **Medido:** caso `guard/no-montada` de `p9/electron-p9.ps1`, con los procesos
  bloqueados por el arnés. Es **anterior a P9**; P9 no lo cambia.
- **Duda de diseño:** una indisponibilidad **temporal** de Drive no debería
  desmontar la protección de un equipo que sigue usando la carpeta compartida.
  Se revisa con el ciclo de vida de Drive (A3.3 Bloque 8, P14, P16).

### P21 — Preparación tras F2: cerrar → reabrir → leer otra acta — PENDIENTE, pasada E2E / Preparación

- **Qué falta:** una prueba que cierre la ventana de Preparación, la vuelva a
  abrir y lea **otra** acta real, con el Worker de pdf.js arrancado por
  `blob:` (F2).
- **Qué hay:** `f2/electron-f2.ps1` cubre el Worker real, el PDF real, la
  vuelta sin Worker y la restauración (que cierra la ventana). **No** reabre
  para leer otra acta.
- **Alcance:** se añade en la pasada E2E / Preparación que corresponda. **F2 no
  se reabre** por esto, y no se mezcla con P9.

## P10 — DIAGNÓSTICO (17 sept 2026): `%APPDATA%\panorama-app` — inventario, clasificación y riesgo

> **Estado (aceptado por el usuario el 17 sept 2026):** **P10-DIAGNÓSTICO →
> CERRADO.** **P10-LIMPIEZA / ARCHIVO → DIFERIDO**, y **no se autoriza
> limpieza**: la carpeta guarda datos históricos únicos y además sigue siendo
> alcanzable por caminos legítimos de la aplicación. No se borra, mueve ni
> archiva nada —tampoco las cachés de clase B— hasta resolver **P22**.

**Solo diagnóstico. No se ha borrado, movido ni modificado nada.** Todo se hizo
en solo lectura: las BD se leyeron a memoria y el `localStorage`, desde
**copias** en un sandbox. El árbol de P10, la BD residual, la BD viva, las
particiones de G: y `location.json` quedaron **idénticos** antes y después, en
cada tirada.

Herramientas (en `pruebas-a33/p10/`):

- `inventario-p10.js`: metadatos, BD en memoria, cabeceras, hashes y versiones
  de los `.asar`. Las funciones de escritura de `fs` están trucadas y lanzan.
- `electron-p10-localstorage.ps1` + `real-run/p10-localstorage.js` +
  `comparar-localstorage-p10.js`: el `localStorage` de cada partición, leído
  con Electron desde copias y comparado **por hashes y estructura, sin ver
  ningún valor**.

Horas en **UTC** (local = UTC+2).

### P10 original

> «~85 MB de residuos en `%APPDATA%\panorama-app`. Carpeta de datos local de
> antes de mover los datos a Drive (agosto)… No la usa nada.» — PENDIENTE; la
> BD es `F71F4140…`, 57 344 B.

C1 ya había corregido la cifra a **197,68 MB**. **Se confirma hoy: 634
archivos, 222 carpetas, 207 284 784 B.** El último cambio es del 12/09 19:57
(caché de Chromium).

### Qué pasó, reconstruido con las fechas

| Cuándo (UTC) | Hecho | Fuente |
|---|---|---|
| 25/08 12:04 | Se crea la BD en P10 (primera instalación) | fecha de creación del archivo |
| 26/08 15:48 – 27/08 06:26 | 8 parches aplicados (0.1.28 → …); los `.asar` quedan en P10 | `patch-log.txt` |
| 26/08, después de las 16:59 | Nace la carpeta de G: **a partir de P10**: mismos ids, mismas particiones, **misma sal y verificador**. El backup más antiguo de G: (26/08 16:59:25) es **idéntico** a uno de P10. G: ya está en uso hacia las 19:58 | BD, hashes, fechas de G: |
| 26/08 hasta las 19:20 | P10 tiene escrituras posteriores (proyectos 2, 4, 7 y 9). **No se sabe** si fueron antes o después de la copia | backups y particiones |
| **28/08 06:13–08:09** | **Sesión en P10 con v0.1.41**: es el incidente que motivó la v0.1.42, cuando la app cayó en silencio a la carpeta local. Se trabajan los proyectos 1, 2, 3, 5 y 6 | `app.log` de P10, backups y particiones |
| 28/08 08:40 y 13:33 | Se crean en G: los proyectos **11** y **12**, cuyo contenido es la continuación de los residuales **2** y **3** (ver abajo) | BD viva y comparación de estado |
| después | Desaparecen de la BD viva los ids 2, 3, 4, 7, 10 y 13; sus particiones de G: quedan **vacías** (se vaciaron al borrar). Se crean el 14 (01/09) y el 16 (10/09) con los nombres del 4 y del 7 | `sqlite_sequence` = 16, particiones de G: (**razonado**: el `app.log` vivo no registra borrados con esas versiones) |
| 02/09 ×2 y 12/09 ×2 | Arranques con **PS-1005** que **se recuperaron a G:** (tras esperar o con «Reintentar»). La BD de P10 **no** se abrió; solo el perfil de Chromium de la sesión por defecto quedó en P10 | `app.log` de P10 y de G: |
| desde 28/08 08:09 | **Nada** vuelve a escribir la BD, los backups ni las particiones de P10 | fechas de modificación |

### Inventario por familias

| Familia | Archivos | Tamaño | Fechas | Qué es | Clase |
|---|---|---|---|---|---|
| **BD local residual** | 1 | 57 KB | 25/08 → 28/08 | Ver abajo | **A — PRESERVAR** |
| **Backups de proyecto** | 102 | 11,19 MB | 25/08 → 28/08 | **Todos cifrados.** 101 no existen en G: (1 idéntico). Versiones del 25 al 28/08 que G: ya no guarda (guarda 15 por proyecto, desde septiembre). Para los proyectos 2, 3, 4 y 7 son los **únicos** backups que existen | **A — PRESERVAR** |
| **Preparación de reunión** | 1 | 0,03 MB | 26/08 | Cifrada, del proyecto 2. Sin copia idéntica en G: | **A — PRESERVAR** |
| **`app.log`** | 1 | 786 B | 28/08 → 12/09 | 11 líneas, **sin rutas** (P15 no aplica). Es la **única constancia** del arranque del incidente del 28/08 y de los cuatro PS-1005 (P14: el registro quedó partido en dos carpetas) | **A — PRESERVAR** (evidencia) |
| **Particiones — Local Storage** | 68 | 0,81 MB | 25/08 → 28/08 | Estado **en claro** de 8 proyectos y su historial de cambios. Casi todo tiene equivalente en G: (tabla más abajo) | **C — HISTÓRICO / REVISAR** (con un punto **D**) |
| **Instalación / parches** | 5 | 81,09 MB | 26/08 → 28/08 | `app.asar` v0.1.29 y `app.asar.bak-…` v0.1.28, que **no están en ningún otro sitio**; `app1.asar` v0.1.43, idéntico al de G:; `apply-patch-helper.js` y `patch-log.txt` (8 líneas con rutas de instalaciones antiguas). Sin datos de usuario | **C — HISTÓRICO / REVISAR** |
| Particiones — cachés | 270 | 95,06 MB | 25/08 → 28/08 | Cache, GPUCache, Dawn… | **B — PROBABLEMENTE LIMPIABLE** |
| Particiones — cookies, Session Storage, perfil | 135 | 0,51 MB | 25/08 → 28/08 | Network (cookies, trust tokens), sessionStorage, Preferences, SharedStorage | **B** |
| Dashboards horneados (`projects/<id>`) | 9 | 2,23 MB | 26/08 → 28/08 | Se regeneran al abrir. Cinco apuntan a la instalación actual y **cuatro a una instalación antigua** en Drive («Otros ordenadores») | **B** |
| Chromium raíz — cachés | 23 | 6,67 MB | 25/08 → 12/09 | GPUCache, Dawn…, Code Cache, Shared Dictionary | **B** |
| Chromium raíz — Local/Session Storage, Network, perfil | 19 | ~0,05 MB | 25/08 → 12/09 | El `localStorage` raíz tiene **0 claves**. Lo tocaron las sesiones PS-1005 del 12/09 | **B** |
| **D — desconocido** | 0 | — | — | Todo archivo tiene familia | — |

Totales por clase: **A** 105 archivos, ~11,3 MB · **C** 73 archivos, ~81,9
MB · **B** 456 archivos, ~104,5 MB.

**Los 20 más grandes:**

- los tres `.asar` (27 MB cada uno);
- 17 archivos `data_3` de caché (4 MB cada uno): uno de la raíz y 16 de las
  particiones.

### La BD residual

- **Archivo:** `panorama.sqlite3`, 57 344 B, SHA-256
  `F71F4140E7FD68504CBF65C1D930BC4A244554D7BFB013A70557A30CCF74F501`.
- **Fechas:** creada el 25/08 12:04 y modificada por última vez el 28/08 08:09.
- **Integridad:** `ok`.
- **Tablas:** `app_meta` (4), `projects` (9), `backups` (102) y
  `meeting_preps` (1); `candidate_evals` **no existe**.
  `sqlite_sequence`: proyectos 9, backups 222, preparaciones 4.
- **Anterior a A3.3:** sin `db_commit_id`, generación ni `installation_id`.
- **Seguridad:** activa, con la **misma sal y el mismo verificador que la BD
  viva**. Los backups del residuo se cifraron con la **misma contraseña** que
  los de G:.
- **`security_remembered` presente** (48 caracteres, no se imprime): una
  contraseña recordada que la BD viva **ya no tiene**. Es un **artefacto de
  credencial** que se queda en P10.

| Residual | Pareja en la BD viva | Estado en su partición, frente a G: | Backups | Tipo de dato |
|---|---|---|---|---|
| 1 (Directorio) | **1** (partición, nombre y fecha) | 35 elementos: 2 idénticos, **32 personas = la misma entrada modificada después** (la viva tiene 46), **1 parte mensual SIN equivalente** | 15 (26–28/08), no están en G: | **C** + **D** (esa parte mensual) |
| 2 | **Ninguna** en la BD. Por contenido: **viva 11** (creada el 28/08 a las 08:40) | 43 elementos: 17 idénticos, **26 modificados, 0 sin equivalente**; 6 de 313 valores no aparecen en G:; título y fin de servicio distintos | 15, **únicos** | **D — parcialmente solapado** |
| 3 | **Ninguna.** Por contenido: **viva 12** (28/08 13:33) | 64 elementos: 18 idénticos, **46 modificados, 0 sin equivalente**; 4 de 452 valores no aparecen en G: | 15, **únicos** | **D** |
| 4 | **Ninguna.** Mismo nombre: **viva 14** (01/09) | **32 de 32 idénticos en G:** (en la 14 o en la partición huérfana del antiguo 13) | 15, **únicos** | **B** en el estado; **C** en los backups |
| 5 | **5** (partición; renombrado) | 81 idénticos y 1 modificado. La viva conserva la clave antigua **idéntica** | 15 | **B** (estado) / **C** |
| 6 | **6** | Todos idénticos; 1 entrada de historial modificada | 8 | **C** |
| 7 | **Ninguna.** Mismo nombre: **viva 16** (10/09) | 9 de 9 idénticos; **solo la fecha de fin** no aparece en G: | 11, **únicos** | **C** |
| 8 | **8** | Estado **IDÉNTICO** en G: | 6 (1 idéntico en G:) | **B** |
| 9 | **9** | Partición **vacía** | 2 | **C** (backups) |

Cómo se mide lo de «modificado»: por cada elemento (un hito, un riesgo, una
persona…) se guarda el hash de cada una de sus propiedades. Un elemento sin
copia idéntica se empareja con la entrada viva que comparte más propiedades. Con
al menos la mitad iguales cuenta como **la misma entrada, modificada**; sin
ninguna en común, como **sin equivalente**.

### ¿Hay datos únicos?

- **A — únicos:** los **101 backups** y la **preparación**, como *versiones
  históricas* del 25 al 28/08. No se comparan por contenido (están cifrados),
  pero ninguno tiene copia en G:. También la **parte mensual del Directorio**
  sin equivalente y el **`app.log`**, como evidencia.
- **B — duplicados:** el estado de los proyectos 4, 5 y 8.
- **C — desfasados:** el estado de 1, 6 y 7. Su contenido sigue en G:, en
  versión posterior.
- **D — parcialmente solapados:** 2 y 3, **continuados en otro proyecto**
  (11 y 12). Casi todo está en G:, modificado; quedan unos pocos valores
  antiguos sin copia.
- **Dependencia con C1-B:** la única copia idéntica del estado del proyecto 4
  puede ser la **partición huérfana** de G: del antiguo 13, que es territorio
  de C1-B. Si C1-B la retirara, P10 pasaría a tener la única copia.
- **Exportaciones:** en P10 no hay ninguna. La app no guarda dónde exporta, así
  que compararlas exigiría recorrer carpetas del usuario, y **no se ha hecho**.

**Conclusión:** la carpeta **no es basura**. La información de usuario está casi
toda en G:, pero la versión exacta del 28/08 y todo el historial de 25–28/08
**solo** está aquí. Encaja con el propio código («los datos se recuperaron a
mano comparando ambas copias»): si esa recuperación dejó algo fuera, está aquí.

### Tras P9, ¿sigue siendo peligrosa?

- **Por `location.json` inválido, NO.** Medido en P9 con una **copia de esta
  misma BD** (casos `residuoreal/*`): PS-1020, y el hash no cambia.
- **Sigue siendo el destino de caminos legítimos**, y en todos se abriría esta BD
  anterior a A3.3. A3.3 la registraría y al abrirla la **modificaría**, como ya
  midió P9. La contraseña actual **sirve**, así que el usuario vería los
  proyectos de agosto sin ningún aviso especial. Los caminos son:
  1. sin `location.json`: «Volver a la carpeta por defecto» o el archivo
     borrado;
  2. «Abrir con datos locales» en **PS-1005** (P20);
  3. «Usar la carpeta de datos por defecto» en **PS-1009**.
- **Rescate PS-1007 sin `location.json`:** restauraría el `app.asar.bak-…`
  **v0.1.28** sobre la 2.0.55 instalada. Es razonado, no provocado; va con P18.
- **Sesiones PS-1005 que se recuperan:** el perfil de Chromium de la sesión por
  defecto se queda en P10 aunque la BD esté en G:. Medido el 12/09; hoy ese
  `localStorage` está vacío. Va con P20 y el ciclo de vida de Drive.

### Qué NO debe tocarse

La BD residual, los 102 backups, la preparación, el `app.log` y el
`Local Storage` de las particiones. **Tampoco los `.asar` antiguos** mientras
PS-1007 pueda buscarlos. Y **nada** de P10 mientras siga siendo el destino de
los caminos anteriores: borrar la BD convertiría la carpeta en «primera
ejecución» (crearía una vacía), y dejarla la mantiene abrible.

**Datos sensibles** en P10:

- el estado de 8 proyectos **en claro**;
- el artefacto de contraseña recordada;
- cookies de particiones.

Cualquier archivado debe tratarlos como tales: ni a Drive ni compartidos.

### Propuesta de siguiente paso (NO implementada)

1. **Primero, el comportamiento, antes que los archivos (producto; cuando se
   autorice).** Que la carpeta por defecto **no se pueda usar en silencio**
   como carpeta de datos en un equipo que ya tuvo una ubicación personalizada:
   pedir una confirmación explícita, con la fecha de la BD encontrada, antes de
   abrirla desde los caminos 1–3. Además, que el rescate PS-1007 no tome
   copias de `app.asar` **más antiguas que la versión instalada**. Toca P18 y
   P20, y se decide con el ciclo de vida de Drive.
2. **Después, una decisión del usuario sobre los datos**, sin borrar nada:
   - confirmar que los proyectos 2, 3, 4 y 7 se retiraron a propósito y que
     11, 12, 14 y 16 contienen lo que necesita;
   - revisar él mismo la parte mensual del Directorio sin equivalente
     (solo él puede juzgar el contenido).
3. **Solo entonces, archivar**, no borrar:
   - una copia fechada, de solo lectura, **fuera de Drive**, de las familias
     A y C;
   - con manifiesto de hashes y verificación antes y después;
   - con el mismo protocolo NO-CLOBBER y de cuarentena que ya existe.
4. **Las cachés (B, ~104,5 MB)** son recreables, pero quitarlas no reduce
   ningún riesgo. Van al final, con la app cerrada y **sin mezclarlas con
   P16**.

**No se ha tocado:** P16, C1-B, P14/P15, Drive/multi-PC, packaging, ni ningún
archivo de P10 ni de G:.

## P22 — DIAGNÓSTICO (17 sept 2026): la carpeta local como destino, y el rescate PS-1007

**Solo diagnóstico. Producción sin tocar.** Sale de P10: antes de decidir nada
sobre esa carpeta hay que impedir que siga siendo un **destino operativo
ambiguo**. Cubre cuatro caminos, ninguno de ellos un defecto de lectura de
`location.json` (eso fue P9, cerrado):

| | Camino |
|---|---|
| **A** | PS-1005 → «Abrir con datos locales (temporal)» |
| **B** | PS-1009 → «Usar la carpeta de datos por defecto por ahora», y la BD compartida **ilegible**, que cae ahí **sin diálogo** |
| **C** | Arranque **sin** `location.json` en un equipo que YA tuvo ubicación propia |
| **D** | PS-1007: qué copia de `app.asar` elige el rescate |

Baterías: `p22/test-p22-reserva.js` **33 OK / 0** (descriptiva: ejecuta las
funciones reales contra un sandbox; en D **solo la selección**, nunca la
copia), `p22/electron-p22.ps1` **14 OK / 0** (12 arranques reales, con
una **copia** de la BD residual de P10) y `p22/rescate-esta-maquina.js` (solo
lectura, sobre las rutas reales). BD viva, configuración real, residuo de P10,
archivos productivos y entrada de HKCU\…\Run **idénticos** antes y después.

### A — PS-1005 → «Abrir con datos locales (temporal)»

1. Antes de `ready`, la carpeta configurada no responde durante 5 s →
   `customUserDataDirFailure`.
2. En `whenReady`, 20 s más de reintentos y el diálogo **PS-1005**
   («Reintentar» / «Abrir con datos locales (temporal)»).
3. **Cerrar el diálogo con Esc o con la X equivale a «datos locales»**
   (`cancelId: 1`).
4. El diálogo **no dice nada de la carpeta local**: ni si tiene base de datos,
   ni de cuándo es, ni cuántos proyectos.
5. A partir de ahí el arranque sigue con la carpeta por defecto: se
   **desactiva** la protección de apagado, no hay candado multi-PC, la política
   pasa a `local`, decide A3.3 y se abre `getDb`.
6. El único aviso posterior, «Usando datos locales temporalmente», se pinta
   **dentro del lanzador**, con la base de datos ya abierta.

| Carpeta local | Medido en la app real |
|---|---|
| Con la **copia de la BD residual de P10** | La abre y **la modifica**; con la Seguridad activa, lo siguiente que ve el usuario es **la contraseña de siempre**: el lanzador (y su aviso) todavía no ha aparecido |
| **Vacía** | **Crea una base de datos nueva** («primera ejecución») y la registra; después, el aviso en el lanzador |
| Vacía pero **registrada** en A3.3 | Falla cerrado (**PS-1016**) |
| Con la protección de apagado activa | La **desactiva** (esto es **P20**) |

### B — PS-1009, y la BD compartida ilegible

- **PS-1009** («Esperar más» / «Sí, empezar aquí desde cero» / «Usar la carpeta
  de datos por defecto por ahora») sale cuando la carpeta configurada está
  accesible pero **no tiene** `panorama.sqlite3`. La tercera opción cambia a la
  carpeta por defecto **sin mirar qué hay dentro**. Medido: con la copia del
  residuo, la abre y **la modifica**; con la carpeta vacía, **crea una nueva**.
- **Sin diálogo:** si el `panorama.sqlite3` de la carpeta configurada existe
  pero **no se puede comprobar** (EACCES, EPERM, EBUSY, EIO…) durante 20 s, la
  app se pasa a la carpeta por defecto **en silencio**. Medido con el archivo
  **bloqueado de verdad** por otro proceso (EBUSY): abre la BD local, **la
  modifica**, no sale **ningún** diálogo y lo siguiente es la contraseña. Solo
  queda una línea en el `app.log` de la carpeta local.

### C — Sin `location.json`

- `ausente` significa exactamente «nunca se configuró nada»: no se mira ninguna
  otra señal.
- Medido: con la copia del residuo, **la abre y la modifica sin ningún aviso**;
  con la carpeta vacía, **crea una base de datos nueva**. Da igual que el
  registro de A3.3 recuerde una ubicación compartida. Y si la protección de
  apagado estaba activa, **se desactiva sin avisar**.
- **Primera ejecución real y regreso histórico son indistinguibles**: los dos
  terminan en «carpeta por defecto sin registro local y con la base de datos
  demostrablemente ausente (primera ejecución)», sin un solo aviso.
- Lo ÚNICO que hoy lo frena es que la **propia carpeta por defecto** conste como
  inicializada en el registro de A3.3: entonces no crea (PS-1016).
- Cómo puede desaparecer `location.json`: «Volver a la carpeta de datos por
  defecto» (que confirma con un «NO borra ningún dato» **sin decir qué hay en la
  carpeta por defecto**), un borrado a mano, o un perfil restaurado a medias. El
  desinstalador **no** lo borra.

### Qué señales persistentes hay hoy para saber que el equipo tuvo ubicación propia

| Señal | Sirve | Problema |
|---|---|---|
| `location.json` | Es la única que se usa | Justo la que falta en el caso C |
| Carpeta `%APPDATA%\panorama-app-config` | Débil | Con A3.3 existe en **todos** los equipos (registro e `installation-id`) |
| Registro de A3.3 con claves de **otras** rutas | Fuerte | Solo en equipos que ya hayan corrido una versión con A3.3 y ubicación propia. **Esta máquina no lo tiene**: la instalada es anterior |
| Protección de apagado (marca, HKCU\…\Run, tarea) | Fuerte para «compartida» | **Se borra sola** en estos mismos caminos: la señal se destruye al usarla |
| `app.log` de la carpeta por defecto con PS-1005 | Indicio | Texto libre, y queda repartido entre dos carpetas (**P14**) |
| Metadatos de la BD local | Para la **edad**, no para el origen | `mtime`; `MAX(projects.updated_at)`, `MAX(backups.created_at)`, nº de proyectos; con A3.3, `db_commit_id`, `db_generation` y `db_commit_history` (qué instalaciones la escribieron). **Su ausencia** ya dice «anterior a A3.3» |

**Conclusión: hoy no hay ninguna señal fiable**, y la más fuerte se
autodestruye.

### D — PS-1007: qué copia de `app.asar` restauraría

- Las copias `app.asar.bak-<fecha>` las crea **«Aplicar parche»** en la
  **carpeta de datos** (si es compartida, ahí quedan **las de todos los
  equipos**), sin anotar versión, equipo ni instalación. Se conservan **2**.
- El rescate elige **la más reciente por el nombre**, dentro de la carpeta
  configurada si existe y, si no, la de por defecto. **No lee la versión ni
  comprueba de qué instalación viene**, y restaura sin comparar con la
  instalada.

Medido con copias sintéticas (solo la selección):

| Situación | Elegiría |
|---|---|
| Sin `location.json`, con la copia de agosto en la carpeta por defecto | **v0.1.28** |
| `location.json` válido, con las copias recientes en la compartida | v2.0.54 (la anterior de esta instalación) |
| La copia más reciente la dejó **otro equipo** con una versión posterior | **v2.0.60**, más nueva que la instalada |
| Nombre más reciente pero versión **más antigua** (otro equipo desactualizado) | **v2.0.30** |
| `location.json` válido pero la carpeta configurada no existe | **v0.1.28** |

**En esta máquina** (solo lectura, `rescate-esta-maquina.js`; instalada
**v2.0.55**):

- hoy, con G: montada → `app.asar.bak-2026-09-12T21-29…` = **v2.0.54**, que es
  la anterior de esta instalación (el `patch-log.txt` de G: registra 106
  parches, 96 sobre la instalación actual, el último a las 21:29 del 12/09);
- **sin `location.json`** → `app.asar.bak-2026-08-26T19-19…` = **v0.1.28**;
- **con G: sin montar** → la misma **v0.1.28**. Este es el caso realista: basta
  un arranque con Drive aún sin montar y un parche que falle.

**Ojo con el enunciado «no restaurar una versión inferior a la instalada»:**
volver a la **anterior** es justo lo que un rescate legítimo hace tras un parche
roto. El problema no es que sea inferior, sino que **nada demuestra que esa
copia sea la predecesora de ESTA instalación**.

## P22 — DISEÑO FINAL (17 sept 2026) · ACEPTADO, **sin implementar**

**Regla primera, que NO depende de ninguna marca:** si la carpeta por defecto
tiene un `panorama.sqlite3` **reconocible**, ningún camino de reserva la abre
sin **confirmación explícita**. La marca persistente es una defensa **añadida**,
porque un equipo antiguo puede llegar a la versión nueva sin `location.json`,
sin marca y con BD local.

### 1. Reconocer la BD local sin abrirla

- `estadoDeArchivoEnRuta()` (ya existe) distingue **`visible`** / **`no-visible`**
  (ENOENT demostrado) / **`no-accesible`**.
- **Reconocible** = visible, tamaño > 0 y los 16 primeros bytes son
  `SQLite format 3\0` (lectura compartida de 16 bytes; **comprobado** el 17 sept
  sobre la residual y la viva).
- Datos para el diálogo, **sin abrir la base**: fecha de última modificación,
  tamaño y si existe el testigo `panorama.sqlite3.gen` de A3.3 *(hoy no existe
  en ninguna de las dos: las escribió una versión anterior)*. **Nada de `sql.js`
  en `main.js`**, así que **no** se muestra el número de proyectos.
- **`no-accesible` → fail-closed:** ni abrir ni crear. Aviso **PS-1023** y
  cierre.

### 2. Marca durable «este equipo usó una ubicación propia»

- Archivo **`historial-ubicacion.json`** en `%APPDATA%\panorama-app-config`,
  junto a `location.json`, el registro de A3.3 y el `installation-id`. Escritura
  atómica y verificada (tmp + fsync + rename + relectura), como el registro.
- Contenido: `{ v, personalizada: { clave_sha256, compartida, primera_vez,
  ultima_vez }, decisiones: [ { que: 'volver-a-por-defecto', at } ] }` — el
  **hash** de la ruta, nunca la ruta.
- Se escribe cuando la app **usa con éxito** una ubicación configurada (tras
  `setPath`) y al guardar una nueva en «Cambiar ubicación…».
- **No la borra nadie:** ni PS-1005, ni PS-1009, ni un fallo de Drive, ni una
  sesión local temporal. «Volver a la carpeta por defecto» **añade** la decisión
  con su fecha.
- **Equipos que ya existen** (se evalúa al arrancar, sin escribir hasta
  detectar): `location.json` válido · o una clave del registro de A3.3 que **no**
  es la carpeta por defecto · o la marca de la protección de apagado
  (`enabled.flag`). *(En esta máquina, hoy: `location.json` válido y
  `enabled.flag` presente.)*
- **Hueco que queda, y por eso no basta:** equipo sin `location.json`, sin
  registro de A3.3 y sin marca de protección. Ahí manda la regla 1.

### 3. Una sola puerta antes de tocar nada local

`autorizarCarpetaLocal(motivo)` en `main.js`, **antes** de la splash, de la
protección de apagado, del candado multi-PC, de la decisión de A3.3, del
registro y de `getDb`:

| Situación | Qué hace |
|---|---|
| BD local **reconocible** | Diálogo informado **PS-1021**: `Cerrar` y `Usar estos datos locales` |
| **Sin** BD local y **con** marca o señal | PS-1021 en su variante «no hay datos locales»: `Cerrar` y `Crear una base de datos local vacía` |
| **Sin** BD local y **sin** marca ni señales | Primera ejecución legítima: **sin diálogo**, como hoy |
| BD local **no-accesible** | **PS-1023**, fail-closed |

El resultado queda en `sesionLocalTemporal`, solo en memoria.

### 4. Los tres caminos

- **A — PS-1005.** El estado de la BD local se calcula **antes** de mostrar el
  diálogo y su información va dentro. Botones: `Reintentar` (predeterminado) ·
  `Usar estos datos locales` **o** `Crear una base de datos local vacía` ·
  `Cerrar` (`cancelId`). Elegir la opción local **es** la aceptación explícita.
- **B — PS-1009.** Igual: `Esperar más (reintentar)` (predeterminado) · `Sí,
  empezar aquí desde cero` (sigue siendo sobre la carpeta **configurada**) ·
  `Usar estos datos locales` / `Crear…` · `Cerrar`.
- **B-bis — BD configurada existente pero ilegible.** **Desaparece el cambio
  silencioso**: **PS-1022** con `Reintentar` · `Usar estos datos locales` /
  `Crear…` · `Cerrar`. **No se abre nada** antes de la decisión.
- **C — sin `location.json`.** La puerta se ejecuta lo primero en `whenReady`,
  justo después de la parada de P9.

### 5. Punto exacto en el que puede abrirse la BD

`dbmod.getDb(...)` —y antes `marcarUbicacionDetectadaExistente()` o
`marcarUbicacionInicializando()`— solo se alcanzan si: **(a)** la sesión usa la
carpeta **configurada**; **(b)** la puerta devolvió **aceptación explícita en
este arranque**; o **(c)** es una primera ejecución legítima. Ningún camino de
reserva llega a `getDb` sin pasar por la puerta.

### 6. Esc / X

En PS-1005, PS-1009, PS-1021, PS-1022 y PS-1023, `cancelId` es **`Cerrar`**:
cierra sin abrir ni crear. **Nunca** equivale a «datos locales». En PS-1005 y
PS-1009 el **predeterminado** sigue siendo `Reintentar`/`Esperar más`, que
tampoco tocan nada; en PS-1021 y PS-1023, que no tienen reintento, el
predeterminado es `Cerrar`. *(Si se prefiere `Cerrar` también como
predeterminado en los dos primeros, es un cambio de una línea.)*

### 7. P20 dentro de P22

Con `sesionLocalTemporal`, `syncDriveSyncGuardWithLocation()` **no hace nada**
—misma guarda que P9 ya aplica con la configuración ilegible—, ni al arrancar ni
en el vigilante de 45 s: no se borra `enabled.flag`, no se piden `reg delete` ni
`schtasks /delete`, y la marca persistente no se toca. **P20 se cierra dentro de
P22** si las pruebas demuestran: valor de HKCU\…\Run igual antes y después,
`enabled.flag` igual, y ninguna señal de ubicación compartida borrada.
«Volver a la carpeta por defecto», que es una decisión explícita y no un camino
de reserva, **sí** sigue desactivando la protección.

### 8. Cero escrituras antes de aceptar

Antes de la aceptación no hay `.gen`, ni registro de A3.3, ni commits, ni
migraciones, ni backups, ni escrituras de Seguridad, ni `getDb`. **Límite
honesto:** Chromium ya ha creado sus archivos de perfil (`Local State`, cerrojo
de instancia única…) en esa carpeta **antes** de que `main.js` pueda decidir
nada. Por eso lo que se mide es el **hash de `panorama.sqlite3`**, la ausencia de
`.gen` y que el registro de ubicaciones no gane entradas — no «la carpeta
intacta». La puerta va **antes de la splash** para no añadir más.

### 9. Rescate de `app.asar`: fuera de P22

No se toca la selección. El riesgo queda **abierto y documentado** aquí y en
**P18**: la copia se elige por la fecha del nombre, sin procedencia, en una
carpeta que puede ser compartida. Su diseño (manifiesto con instalación,
versiones, hashes y relación predecesora; copias en carpeta local; misma regla
para `Restaurar-backup.bat`) va con **P18 / PS-1007**.

### 10. Archivos

**`main.js`, solo.** No se tocan `db.js`, `Restaurar-backup.bat`, el instalador,
los preloads, P10 ni Drive/multi-PC. Tres códigos nuevos: **PS-1021**,
**PS-1022**, **PS-1023** (habrá que actualizar, con su nota, el anclaje de orden
de `bloque3/test-error-codes.js`, como ya pasó con PS-1020). Si apareciera la
necesidad de otro archivo productivo: **PARAR y justificar**.

### 11. Pruebas

`p22/` pasa a **EXIGENTE**:

| # | Qué exige | Dónde se mide |
|---|---|---|
| P22-1 | PS-1005 + **Esc** → cierra y **no** abre la BD local | Node (contrato del diálogo) + Electron |
| P22-2 | PS-1005 + **X** → igual | Electron |
| P22-3 | PS-1005 + aceptación explícita + BD local → **solo entonces** abre | Electron |
| P22-4 | PS-1009 + BD local → confirmación **antes** de abrir | Electron |
| P22-5 | BD compartida ilegible → **cero** fallback silencioso | Electron (bloqueo real, EBUSY) |
| P22-6 | Sin `location.json` + BD local → confirmación | Electron |
| P22-7 | Sin `location.json` + carpeta vacía + marca → **no** crea | Electron + Node |
| P22-8 | Primera instalación real (sin BD, sin marca, sin señales) → inicializa como hoy | Electron + Node |
| P22-9 | Cancelar cualquier confirmación → **hash de la BD local idéntico**, sin `.gen` ni entradas nuevas en el registro | Electron |
| P22-10 | Sesión local temporal → protección de apagado **intacta** (HKCU\…\Run y marca) | Electron |
| P22-11 | La marca histórica **sobrevive** a la sesión local temporal | Electron |
| P22-12 | Sin BD local: **nunca** se inventa una confirmación de una BD que no existe | Node + Electron |

**Reversiones separadas**, cada una rompe solo su garantía: **A** Esc vuelve a
elegir local · **B** la BD ilegible vuelve al fallback silencioso · **C** la BD
local existente vuelve a abrirse sin confirmar · **D** la marca deja de impedir
la creación · **E** la sesión temporal vuelve a desactivar la protección.

Y regresión completa **con A2 y A3.3 en verde**, porque se toca el arranque más
temprano.

### 12. Relación con otros pendientes

**P20** se cierra dentro de P22 (punto 7). **P18** se queda con el rescate y la
procedencia de las copias (punto 9), junto con el `.bat`. **P19** se comprueba
antes del release. **P14** explica por qué el rastro de estas sesiones queda
repartido entre dos carpetas. **P10** no se toca hasta cerrar esto.

## P22 — IMPLEMENTACIÓN Y CIERRE (17-18 sept 2026)

**CERRADO.** La carpeta de datos local dejó de ser un destino operativo ambiguo:
ya no se abre ni se crea nada en ella sin que el usuario lo elija, y un archivo
que está pero no sirve **cierra** en vez de tratarse como ausencia.

**Único archivo productivo tocado: `main.js`** (`2D05E00B…` →
**`C4C00809F45C565F4DA9ABFAD3B36117FD2A5CA2C809ACBD20F8E5080DA30A8E`**; +559 / −39 líneas). Instantánea previa:
`claude/main.js.ANTES-P22-2026-09-17`. `db.js`, `security.js`, los preloads, el
instalador y `Restaurar-backup.bat` siguen idénticos.

### Qué cambia

| Pieza | Antes | Ahora |
|---|---|---|
| Reconocer la BD local | `fs.existsSync` / visible-o-no | **Cuatro estados**: `ausente` (ENOENT demostrado), `existente` (cabecera `SQLite format 3`), **`invalida`** (0 bytes, cabecera que no es de SQLite, o no es un archivo) y `no-comprobable`. Solo `stat` y **16 bytes**: la base nunca se abre |
| Archivo presente pero inservible | Contaba como «no hay base de datos» → se creaba otra encima | **PS-1023 y cierre**: no se abre, no se sustituye, no se vacía y no se crea otra |
| PS-1005 «datos locales» | Botón sin información, y **Esc/X lo elegían** (`cancelId: 1`) | Diálogo con **fecha y tamaño** de la base local; botones `Reintentar` · `Usar estos datos locales` / `Crear una base de datos local vacía` · **`Cerrar`**, que es lo que hacen Esc y la X |
| PS-1009 «usar la carpeta por defecto» | Cambiaba de carpeta sin mirar qué había | Pasa por la **confirmación informada** (PS-1021) y gana `Cerrar` |
| BD configurada **ilegible** | **Fallback local SILENCIOSO** | **PS-1022**: se para y pregunta. **Cero aperturas locales** antes de la decisión |
| Arranque sin `location.json` | Abría o creaba en silencio | Puerta `autorizarCarpetaLocal()` **antes de la splash**, de la protección, del candado, de A3.3 y de `getDb` |
| «Este equipo tuvo ubicación propia» | No existía | **`historial-ubicacion.json`** en `%APPDATA%\panorama-app-config`: hash de la ruta (**nunca la ruta**), si era compartida y las fechas. Escritura atómica y **verificada releyendo** |
| Si esa marca no se puede escribir | — | **No es silencioso**: `ERROR PS-1024`, aviso en el lanzador, sesión marcada como degradada, y la ausencia de marca **deja de contar** como «instalación nueva» |
| Crear BD local | «Carpeta por defecto vacía» ⇒ primera ejecución | Con marca (o señal equivalente), **no se crea** sin autorización expresa. Sin marca ni señales, la primera ejecución sigue igual |
| Protección de apagado | La sesión de reserva la desactivaba (**P20**) | **Sesión local temporal: no se toca**. Volver a la carpeta por defecto *a propósito* sí la sincroniza |
| «Volver a la carpeta por defecto» | Borraba `location.json` sin dejar rastro | **Anota la decisión** con su fecha y conserva la marca |
| `ERROR_CODES` | — | **PS-1021**, **PS-1022**, **PS-1023**, **PS-1024** |

### Decisiones tomadas

- **La regla no depende de la marca.** Si hay una base local reconocible y se
  llega por un camino de reserva, se pregunta **siempre**, haya marca o no.
- **Al equipo puramente local no se le pregunta en cada arranque.** Se le
  reconoce porque **su propia carpeta ya consta** en el registro de A3.3. Un
  equipo que viene de una versión anterior (registro vacío) recibe la pregunta
  **una vez** y queda registrado. *(Es la única desviación de la lectura literal
  del encargo, y se toma para no convertir el arranque normal en un
  interrogatorio.)*
- **Señales equivalentes a la marca**, para equipos que ya existen: una clave de
  **otra** ruta en el registro de A3.3, o la marca de la protección de apagado.
  Y ante la duda —marca ilegible, o esta sesión no pudo escribirla— se responde
  **que sí hubo ubicación propia**: no poder demostrarlo nunca vale como prueba
  de lo contrario.
- **La marca guarda un hash**, no la ruta.
- **Límite documentado:** Chromium ya ha creado sus archivos de perfil en esa
  carpeta antes de que `main.js` pueda decidir. Lo que se garantiza y se mide es
  la **base de datos**: hash idéntico, sin `.gen`, sin entradas nuevas en el
  registro de A3.3 y sin ninguna escritura.
- **El rescate de `app.asar` no se toca:** sigue eligiendo por la fecha del
  nombre, sin procedencia. Es **P18**, y su riesgo sigue abierto.

### Evidencia

- `p22/test-p22-reserva.js` — **74 OK / 0 FALLOS**, EXIGENTE (nació descriptiva con 33).
- `p22/electron-p22.ps1` + `real-run/p22-reserva.js` — **39 OK / 0 FALLOS**, 14
  arranques reales de Electron con una **copia** de la BD residual de P10.
- `p22/comprobar-reversiones-p22.js` — **29 OK / 0 FALLOS**: siete familias (A–E
  las pedidas, más F «un archivo inválido vuelve a contar como ausente» y G «el
  fallo de la marca vuelve a ser silencioso»). Cada una pone la batería roja,
  tumba **cada** grupo que anuncia y **ninguno** más.
- Barrido Electron completo — la **tabla entera** del MANIFIESTO, 21 arneses,
  cada uno en su propio proceso: `a2` **66**, `bloque5` **71** + CV **12**,
  `e1` **21**, `p12` **32**, `e2` **42**, `b1` **24**, `b3` **36**, `b4` **17**,
  `b5` **24**, `c1` **31**, `f1` **47** + limpio **52**, `p17` **16**,
  `f2f3` **36** + reversión de F3 **4**, `f2-lab` **41**, `f2` **212** +
  reversiones **7**, `p9` **111** y sus reversiones **14**. Todos a
  **0 fallos**, con la BD viva idéntica en cada uno. Y `p22` **39**.
- Regresión Node completa — **3550 OK / 0 FALLOS** (27 baterías, con el node del
  sistema; `comun/` aparte, **43 OK / 0**). `p22/` aporta 74 y `nucleo-a33` salió
  en su valor bajo (394: es **ARN-1**, no una regresión). **Cuadra exacto** con
  el cierre de P9: 3475 − 1 (`nucleo-a33` 395 → 394) + 2 (`bloque3`, dos códigos
  nuevos) + 74 (`p22`) = **3550**. `c1` sigue en 165: cambió *cuál* es la
  aserción, no cuántas.
  Los sueltos de la raíz (`test-a1*`, `test-a2`, `test-b2`,
  `test-setmeta`) siguen fuera del criterio —material anterior a A3.3, roto desde
  entonces— y se comprobó que **ninguno lee `main.js`**, así que P22 no los toca.
- BD viva, configuración real, residuo de P10, archivos productivos y valor de
  `HKCU\…\Run`: **idénticos** antes y después en cada tirada.

### Los 16 casos del encargo

| # | Qué exige | Resultado |
|---|---|---|
| P22-1 / P22-2 | PS-1005 + Esc / X → cierra, no abre la BD local | ✓ |
| P22-3 | PS-1005 + aceptación explícita + BD local → solo entonces abre | ✓ |
| P22-4 | PS-1009 + BD local → confirmación antes de abrir | ✓ |
| P22-5 | BD compartida ilegible → cero fallback silencioso | ✓ |
| P22-6 | Sin `location.json` + BD local → confirmación | ✓ |
| P22-7 | Sin `location.json` + carpeta vacía + marca → no crea | ✓ |
| P22-8 | Primera instalación real → inicializa como siempre | ✓ |
| P22-9 | Cancelar → hash de la BD local idéntico, sin `.gen` ni registro nuevo | ✓ |
| P22-10 | Sesión local temporal → protección intacta | ✓ |
| P22-11 | La marca sobrevive a esa sesión | ✓ |
| P22-12 | Sin BD local nunca se inventa una confirmación sobre una base que no existe | ✓ |
| P22-13 | `panorama.sqlite3` de 0 bytes → cierra, sin reemplazo | ✓ |
| P22-14 | Contenido que no es SQLite → cierra, bytes idénticos | ✓ |
| P22-15 | Falla la lectura de la cabecera → cierra | ✓ |
| P22-16 | Falla escribir la marca → no queda estado falso de primera instalación, y no es silencioso | ✓ |

### Arneses ajustados (defecto de arnés, no de producto)

- `bloque2/test-wiring.js` y `p9/test-p9-location.js`: `decidirCrearSiAusente`
  consulta ahora `usuarioAutorizaCrearLocal` y `huboUbicacionPersonalizada()`.
  En `bloque2` se declaran en su forma neutra; en `p9` se traen las funciones
  **reales**.
- `p9/test-p9-location.js`, además: su ámbito necesitaba `defaultUserDataDir`
  (lo usa `huboUbicacionPersonalizada`) y `sesionLocalTemporal` (lo consulta
  ahora la protección de apagado). Sigue en **282 OK / 0**, la misma cifra con
  la que se cerró P9.
- `e1/test-inventario-e1.js` (`E1-M4`): el hash de `main.js`.
- `bloque3/test-error-codes.js`: sube de 45 a 47 aserciones solo, al aparecer
  dos códigos nuevos usados con literal.
- `c1/test-c1-residuos.js` (`C1-P1`): era **descriptiva** y decía «la app vuelve
  a la carpeta por defecto si falla la configurada», comprobándolo por el botón
  `'Abrir con datos locales (temporal)'` de PS-1005. Ese botón **ya no existe**:
  es justo lo que P22 elimina. Reescrita para describir lo que hay ahora —la
  carpeta por defecto sigue siendo la de P10, pero ya no se llega a ella sola—.
  Verificado en los dos sentidos: con el `main.js` **anterior** a P22 la nueva
  aserción **falla**, con el actual pasa. 165 OK / 0.
- `p22/test-p22-reserva.js`: dos arreglos propios. (1) Leía
  `o.buttons[o.cancelId]` sin protección, así que una reversión que **quita** el
  diálogo hacía **reventar** la batería en vez de ponerla roja — y una batería
  que revienta no dice qué grupos caen. (2) Las listas `tumba` de las familias
  **A** y **C** anunciaban grupos que no caen (PS-1023 tiene un solo botón, así
  que el escape sigue cayendo en «Cerrar») y omitían los que sí (C arrastra
  P22-10 en cascada: sin puerta, la sesión nunca se marca temporal y vuelve a
  desactivarse la protección de apagado). Corregidas contra lo medido.
- `p9/electron-p9.ps1` (3 aserciones). Dos exigían `ndialogos = 0` en los casos
  **sin `location.json`**: la app abría o creaba en la carpeta local **sin
  preguntar**. Es justo lo que P22 elimina. Además —y esto había que
  demostrarlo, no suponerlo— **la base de ese arnés se prepara arrancando la app
  con una ubicación configurada**, así que desde P22 *todos* sus casos heredan
  `historial-ubicacion.json`: ninguno es ya «una máquina sin historia», y con
  marca lo correcto es preguntar. Se añadió el campo medido `marcaBase` para que
  conste. La tercera era un `[REGISTRA]` del defecto **P20** (tras PS-1005 +
  datos locales, la protección se borraba con `reg.exe delete`): ahora se exige
  lo **contrario**, `marca SIGUE` y cero peticiones al sistema.
- `p9/electron-p9-revertido.ps1` (2 aserciones) — **el hallazgo más interesante
  de la ronda**: con la reversión **B** de P9 aplicada (config inválida vuelve a
  contar como ausente), su defecto **sí reaparece** —no hay PS-1020—, pero **P22
  frena el daño**: ya no se crea una base nueva en silencio (PS-1021 y
  autorización expresa) y la protección de apagado **no** se desactiva. Es
  defensa en profundidad, y ahora las aserciones lo **exigen** en vez de exigir
  el daño.
- `p22/electron-p22.ps1`: exigía la marca de ubicación **byte a byte idéntica**
  tras cada arranque. Es incorrecto: con `location.json` válido la app la
  **refresca** en cada arranque —ese es el mecanismo de durabilidad— conservando
  `primera_vez`. Ahora se mide el **contenido**: la marca puede refrescarse, pero
  no puede perderse ni perder su `primera_vez` (si se perdiera, el arranque
  siguiente creería que es una instalación nueva). Y se añaden **P22-11b**
  (sin `location.json` la marca **no se toca**) y **P22-11c** (con
  `location.json` válido **sí** se registra, conservando la `primera_vez`
  anterior). El producto no cambió por esto.

### Lo que sigue abierto

**P18** (rescate PS-1007 y `Restaurar-backup.bat`: procedencia de las copias),
**P19** (instalador en ANSI, antes del release), **P21** (Preparación E2E),
**P10** (limpieza/archivo, aún diferida), **ARN-1** (`nucleo-a33` determinista),
**ARN-3** —ver abajo— y **ARN-2**: `bloque1\arranque-real.ps1` y `bloque1\arranque-con-bd.ps1`
llevan escrita a fuego la ruta del *scratchpad* de una sesión ya borrada, donde
vivían sus ayudantes (`semilla-legada.js`, `ver-conbd.js`, el envoltorio
`real-run`). **Hoy no se pueden ejecutar.** Es anterior a P22 y no están en la
tabla de arneses del MANIFIESTO; hay que rehacerlos o retirarlos antes del E2E.

## P18 — DIAGNÓSTICO (18 sept 2026): el rescate PS-1007 y la procedencia de las copias de `app.asar`

**Solo diagnóstico. No se ha implementado nada, no se ha restaurado nada y no se
ha tocado la instalación real.** P18 agrupa ahora **dos riesgos con la misma
raíz**: (1) la **selección y restauración automática** de `app.asar` en PS-1007
y (2) **`Restaurar-backup.bat`**. La raíz común: *nada demuestra de dónde sale
una copia*, así que ambos caminos eligen **por fecha de nombre**.

Evidencia: `p18/test-p18-procedencia.js` (**62 OK / 0**, DESCRIPTIVA, incluye
tres ejecuciones reales del `.bat` en sandbox) y `p18/inventario-p18.js` (solo
lectura sobre esta máquina).

### 1. El flujo de hoy, leído del código

| | |
|---|---|
| **Quién crea la copia** | **Solo** «Aplicar parche (app.asar)…». No el instalador, no el arranque, no un updater |
| **Cuándo** | Justo antes de sustituir el asar real, con la app aún abierta. Y **otra vez** en el ayudante como red de seguridad, si al cerrarse la app la copia no estaba |
| **Dónde** | `stageDir = app.getPath('userData')` → **la carpeta de DATOS**. Si es compartida, la copia acaba donde la ven **todos los equipos** |
| **Cómo se llama** | `app.asar.bak-` + `new Date().toISOString()` con `:` y `.` → guiones. La fecha la pone **el reloj del equipo que copia** |
| **Cuántas se guardan** | **2** (`ASAR_PATCH_BACKUP_KEEP`), purgando por **mtime** |
| **Cómo elige el rescate** | `findLatestAsarBackupForRecovery()`: `readdirSync` → filtra `app.asar.bak-` → `.sort().reverse()` → **la primera**. Por **nombre** |
| **Dónde busca** | `resolveDataDirForStartupRecovery()`: la configurada si `location.json` es válido **y la carpeta existe**; si no, la **por defecto**. Config presente pero ilegible → **no restaura nada** (eso ya lo cerró **P9**) |
| **Qué comprueba antes de copiar** | **Nada**: ni tamaño, ni cabecera, ni hash, ni versión, ni equipo. `originalFs.copyFileSync(backupPath, realAsar)` |
| **Qué guarda antes** | El asar roto, como `app.asar.broken-<fecha>`, en la instalación |
| **Cuándo está armado** | Solo durante el arranque; se desarma en `whenReady` |

**Dos criterios distintos sobre los mismos archivos:** el rescate ordena por
**nombre** y la purga por **mtime**. En una carpeta sincronizada eso se separa:
al bajar de Drive, el `mtime` es el de la descarga y el nombre el del origen. La
purga puede borrar justo la que el rescate habría elegido, y al revés (medido,
`P18-K`).

**Lo que sí se verifica hoy** es el **parche que entra**: SHA-256 mostrado y,
si el nombre sigue `<hash>-AppXXXX.asar`, comprobación automática. A la copia
que **sale** no se le asocia nada. Ese hash **no se guarda en ningún sitio**.

### 2. Inventario real de esta máquina (solo lectura)

Instalada: **v2.0.55**, SHA `D35A19A1…`.

| Dónde | Archivo | Versión | Tamaño | Fecha |
|---|---|---|---|---|
| Datos **CONFIGURADA** (compartida) | `app.asar` *(suelto, no es copia de seguridad)* | **v2.0.11** | 28,7 MB | 10/09 19:29 |
| Datos **CONFIGURADA** | `app.asar.bak-2026-09-12T20-11-51…` | **v2.0.53** | 29,3 MB | 12/09 20:06 |
| Datos **CONFIGURADA** | `app.asar.bak-2026-09-12T21-29-05…` | **v2.0.54** | 29,3 MB | 12/09 20:48 |
| Datos **POR DEFECTO** (residuo P10) | `app.asar` *(suelto)* | **v0.1.29** | 28,3 MB | 26/08 19:19 |
| Datos **POR DEFECTO** | `app.asar.bak-2026-08-26T19-19-35…` | **v0.1.28** | 28,3 MB | 26/08 18:06 |
| **Instalación** (`resources`) | `app.asar` | **v2.0.55** | 29,3 MB | 12/09 21:27 |

Dos cosas que no se esperaban:

- Hay **`app.asar` sueltos** (sin `.bak-`) en las **dos** carpetas de datos, 57 MB
  entre los dos. Hoy **no** los elige nadie —el filtro exige el prefijo
  `app.asar.bak-`—, pero demuestran que la carpeta de datos se ha usado como
  vertedero de asar.
- **`patch-log.txt` de la carpeta compartida: 106 parches aplicados desde
  SEIS instalaciones distintas.** 94 sobre la instalación local de este usuario,
  **7 sobre una instalación que vive DENTRO de Drive** («Otros ordenadores») y 5
  repartidos entre otras cuatro. En la carpeta por defecto, otro `patch-log.txt`
  con 8, de **dos** instalaciones. Y **5 veces** la copia de seguridad no existía
  y la hizo el ayudante.

**Eso responde la pregunta directamente: sí, hoy una copia puede vivir en una
carpeta compartida y ser vista por otro equipo — y en esta máquina ya ha
pasado.** No es un riesgo teórico.

### 3. Por qué la selección de hoy no es segura

De cada copia se puede saber **su versión** (leyendo la cabecera del asar, sin
ejecutarla) y **su fecha de nombre**. No se puede demostrar **ninguna** de las
cosas que importan:

| Lo que habría que demostrar | ¿Se puede hoy? |
|---|---|
| La creó **esta** instalación | **No** |
| La creó **este** equipo | **No** |
| Sustituyó al `app.asar` que está instalado **ahora** | **No** |
| No viene de otra máquina | **No** |
| No es «simplemente la más reciente» | **No: es exactamente eso** |

El `installation-id` —identidad **estable por equipo**, en la carpeta de
configuración **local**, nunca en la de datos— **ya existe** (`db.js`), pero el
parcheo **no lo usa**. Es justo la pieza que falta.

**Sobre el enunciado «no restaurar una versión inferior»:** volver a la
**anterior** es justo lo que un rescate legítimo hace. El problema no es que sea
inferior, sino que **nada ata esa copia a esta instalación**.

### 4. Definición técnica de «predecesora automática»

Una copia es **predecesora restaurable automáticamente** solo si **todas** estas
condiciones se cumplen a la vez, y cada una se puede **comprobar en el momento**:

1. Existe una **entrada de manifiesto local** que la nombra.
2. `installation_id` de la entrada **==** el `installation-id` estable de este
   equipo (leído de la carpeta de configuración local, no de la de datos).
3. `sha256_nuevo` de la entrada **==** SHA-256 del `app.asar` **instalado ahora
   mismo**. *Esto es lo que ata la copia a ESTA instalación*: la entrada solo
   vale mientras el asar que instaló siga siendo el vigente.
4. `sha256_anterior` de la entrada **==** SHA-256 del archivo candidato,
   recalculado en ese instante.
5. `estado == 'verificada'` — escrito **después** de releer ambos archivos.
6. **Exactamente una** candidata cumple 1–5.

Si falla cualquiera: **no hay restauración automática**. No se elige «la mejor».

El punto 3 tiene un efecto deseable: **solo se puede retroceder un paso**, que
es justo lo que un rescate necesita. En cuanto se aplica otro parche, la entrada
vieja deja de valer sola.

**Hoy no existen metadatos suficientes para demostrar nada de esto. Con lo que
hay escrito en disco, la regla no se puede evaluar: habría que crearla primero.**
Y mientras no se aplique un parche con la versión nueva, **ninguna** copia
existente tendrá manifiesto — la restauración automática quedaría **apagada** de
hecho. Es una consecuencia del diseño, no un efecto secundario: hay que decidirlo
a propósito.

### 5. Manifiesto mínimo (propuesta, sin formato cerrado)

**Dónde vive:** `%APPDATA%\panorama-app-config\asar-procedencia.json`, la carpeta
**local** donde ya están `installation-id`, `location.json`, el registro de A3.3
y el `historial-ubicacion.json` de P22. **Nunca en la carpeta de datos**: si
viajara por Drive dejaría de identificar nada — el mismo argumento que ya usa
`db.js` para el `installation-id`.

**Qué guarda cada entrada** (sin rutas absolutas; el archivo se localiza por
nombre dentro de la carpeta de copias, y se ata por **hash**):

- `installation_id` — identidad estable de este equipo;
- `version_anterior` y `sha256_anterior` — lo que se guardó;
- `version_nueva` y `sha256_nuevo` — lo que lo sustituyó;
- `nombre_copia` — el nombre del `.bak`, sin ruta;
- `clave_carpeta_sha256` — hash de la carpeta donde quedó, **no la ruta**
  (mismo criterio que P22);
- `creada_at`, `verificada_at`;
- `estado`: `preparada` → `verificada`.

**Cuándo se escribe, y por qué en dos tiempos:**

1. **La app**, antes de cerrarse: hace la copia, calcula `sha256_anterior`
   releyéndola, y escribe la entrada con `estado: 'preparada'`.
2. **El ayudante**, ya con la app cerrada: copia el parche sobre el asar real,
   **relee el asar real** y comprueba que su SHA-256 es el del parche; solo
   entonces actualiza la entrada a `estado: 'verificada'` con `sha256_nuevo`.

**Fallo parcial → fail-closed, sin excepción:**

| Qué se rompe | Qué queda | Qué pasa con el rescate automático |
|---|---|---|
| Copia hecha, manifiesto no | `.bak` sin entrada | **No** es candidata |
| Manifiesto hecho, copia incompleta | `estado: 'preparada'` | **No**: falta `verificada` |
| Parche escrito a medias | `sha256_nuevo` no cuadra con el asar real | **No** |
| Manifiesto truncado / JSON roto | Lectura falla | **No**, y se avisa |
| Dos candidatas cumplen | Ambigüedad | **No** (la regla exige exactamente una) |
| `%APPDATA%` no accesible | No hay manifiesto | **No** |

**Atomicidad:** temporal + escritura + `fsync` + `rename` + **relectura**, el
mismo patrón que ya usan `escribirAtomico()` de `db.js` y
`guardarHistorialUbicacion()` de P22. No inventar otro.

**Cómo impide usar una copia ajena:** el manifiesto es **local y no viaja**. Una
copia dejada por otro equipo en la carpeta compartida no tiene entrada aquí, así
que **nunca** es candidata — por muy reciente que sea su nombre.

### 6. Los diez casos: hoy y con la regla

| | Caso | Hoy (medido) | Con la regla de procedencia |
|---|---|---|---|
| **A** | Predecesora legítima disponible | La elige — **por el nombre**, sin prueba | **Restaura**, con las 6 condiciones comprobadas |
| **B** | Varias copias antiguas | La del nombre más alto | Solo la que cuadre con el asar instalado; si ninguna, **nada** |
| **C** | Copia de **otro equipo**, más reciente | **La elige** (v2.0.60 sobre la 2.0.55) | **No**: sin entrada local no es candidata |
| **D** | Copia **sin manifiesto** | Hoy ninguna lo tiene | **No** automática; queda el camino manual |
| **E** | **Drive no montado** | Cae a la por defecto → **v0.1.28** sobre la 2.0.55 | **No**: esa carpeta no es la de la entrada, y el hash no cuadra |
| **F** | Sin `location.json` | Carpeta por defecto → **v0.1.28** | **No**, por lo mismo |
| **G** | P10 con `.asar` antiguo (+ config ilegible) | **Nada** — ya lo cerró **P9** | Igual: nada |
| **H** | Copia **truncada** | **La elige y la copia encima sin mirarla** | **No**: el hash no cuadra |
| **I** | Copia con la **misma** versión | La elige | **No** salvo que sea la predecesora demostrada |
| **J** | Copia **más nueva** que la instalada | La elige — eso es un **avance**, no un rescate | **No**: sería instalar algo no verificado |

Principio: **auto-restaurar solo si la procedencia es inequívoca y verificable.
Si no, no elegir «la mejor» por fecha: fail-closed y recuperación manual
explícita.** P18 **no** se convierte en un gestor de versiones.

### 7. `Restaurar-backup.bat`, bajo la misma regla conceptual

| | |
|---|---|
| **Cómo localiza los datos** | `findstr "userDataDir"` sobre `location.json`; si falla, `%APPDATA%\panorama-app`. **Otro algoritmo que el de la app** |
| **Cómo elige** | `dir /b /o-n` → por **nombre**, igual criterio que la app |
| **¿Entiende de versión?** | **No** |
| **¿Entiende de equipo o instalación?** | **No** |
| **¿Sobre qué instala?** | Sobre el `app.asar` que tenga **al lado** (`%~dp0`): la instalación es «donde esté el .bat». Si se copia a otra carpeta, toca **esa** |
| **Copia de seguridad previa** | `app.asar.broken.bak`, **nombre fijo**: un segundo intento pisa el primero |
| **Uso** | A mano, con `pause`; puede pedir administrador |
| **Dónde vive** | `extraResources` → cambiarlo **toca el empaquetado** |

**Medido ejecutándolo de verdad en sandbox** (`P18-D11/D12/D13`): con el mismo
contenido de `location.json` en **varias líneas** restaura de la compartida
(v2.0.54); en **una sola línea**, de la por defecto (**v0.1.28**). Mismo archivo,
misma app, dos instalaciones distintas **según el formato**.

Bajo la misma regla: el `.bat` debería **leer el manifiesto local** y restaurar
solo la entrada `verificada` cuyos hashes cuadren (`certutil -hashfile … SHA256`
está en Windows y basta), y **no elegir nada** si no cuadra. Como vive en
`extraResources`, eso **no se puede entregar por parche**: va con el instalador.

### 8. Qué tocaría cada parte

| Parte | Qué | ¿Entregable por parche? |
|---|---|---|
| **`main.js`** | Escribir el manifiesto al parchear; el ayudante lo verifica y lo cierra; sustituir `findLatestAsarBackupForRecovery()` por una selección con procedencia; nuevos textos PS-1007 (fail-closed) y un código nuevo para «hay copia pero no se puede demostrar su origen» | **Sí** |
| **`Restaurar-backup.bat`** | Leer el manifiesto, verificar hashes, no elegir por fecha | **No** — `extraResources`, va con el instalador |
| **Instalador / packaging (D4)** | Escribir la **entrada inicial** de la instalación (versión y hash instalados, sin predecesora), para que un equipo recién instalado sepa que legítimamente no hay nada a lo que volver. Y entregar el `.bat` nuevo | **No** — es **D4**, y por tanto **parte de P18 debe cerrarse allí**, no aquí |

**P19 no se toca aquí** (sigue siendo packaging/instalador), pero queda dicho:
si el manifiesto inicial lo debe escribir el instalador, esa pieza cae en el
mismo bloque D4 que P19.

### 9. Riesgos de regresión

1. **La restauración automática queda apagada hasta que se aplique un parche con
   la versión nueva.** Ninguna copia existente tiene manifiesto. Es correcto —y
   es lo que se pide—, pero hay que decidirlo a propósito y decirlo en el aviso.
2. **El fallo al escribir el manifiesto no debe bloquear el parcheo.** Solo debe
   apagar el rescate automático de esa copia, y decirlo.
3. **Sesgo a no restaurar**: un equipo con una copia buena pero con el manifiesto
   perdido se queda sin rescate automático. El camino manual tiene que quedar
   claro en el aviso, y el `.bat` seguir existiendo mientras tanto.
4. **Interacción con P10:** las copias de la carpeta residual dejan de ser
   candidatas automáticas. Eso **no** las borra: P10 sigue diferido.
5. **Interacción con P22:** el manifiesto vive en la misma carpeta local que
   `historial-ubicacion.json`. Si esa carpeta no es accesible, **fail-closed**,
   igual que PS-1024.
6. **Coste en disco** si además se decide mover las copias a una carpeta local
   (unos 58 MB con `KEEP = 2`). Esa decisión es **separable** y no hace falta
   para que la regla funcione.

### 10. Fases propuestas

- **Fase 1 — solo `main.js`** *(entregable por parche)*: escribir y verificar el
  manifiesto; selección con procedencia; fail-closed con aviso claro y camino
  manual. El `.bat` se queda como está, y el aviso deja de darlo por bueno sin
  matices.
- **Fase 2 — D4 / packaging**: `.bat` nuevo que lee el manifiesto; entrada
  inicial escrita por el instalador. Va con P19 y con el release.
- **Fase 3 — separable, opcional**: mover las copias a una carpeta **local**
  (`%LOCALAPPDATA%`), fuera de Drive y fuera de la vista de otros equipos. Ataca
  la raíz —una copia ajena deja de estar siquiera presente— pero toca P10 y el
  espacio en disco, así que no se mete en la Fase 1.

### 11. Lo que NO se ha hecho en este diagnóstico

No se ha implementado nada, no se ha restaurado ninguna copia, no se ha borrado
ni movido ningún `app.asar`, no se ha tocado la instalación real ni la carpeta de
datos real, no se ha entrado en P19, ni en la limpieza de P10, ni en
Drive/multi-PC.

## P18 — FASE 1 IMPLEMENTADA (18 sept 2026) · **FASE 1 CERRADA**, **FASE 2 ABIERTA / D4**

**El rescate automático de `app.asar` solo restaura una copia cuya procedencia
se demuestra en el momento.** Único archivo productivo tocado: **`main.js`**
(`C4C00809…` → **`@@HASH18@@`**). Instantánea previa:
`claude/main.js.ANTES-P18-2026-09-18`. `db.js`, `security.js`, los preloads,
el instalador y `Restaurar-backup.bat` siguen idénticos.

### Alcance real, dicho primero

La Fase 1 vive en `main.js`, **dentro** de `app.asar`. Solo existe si Electron
consigue **montar** el asar y **cargar** `main.js`. Medido el 18 sept 2026 con
el build empaquetado: con el asar **truncado**, con la **cabecera rota**, **sin
`main.js`** dentro o **sin archivo**, **no se ejecuta ni una línea de
Panorama**. La Fase 1 protege, por tanto, **un fallo de arranque con el asar
todavía cargable** —el típico parche que se aplica bien pero cuyo código revienta
al arrancar—. **No es una recuperación completa de `app.asar`.** La corrupción
que impide cargarlo es **Fase 2 / D4**: un mecanismo externo (`.bat`
verificado, ayudante/lanzador externo o instalador).

### Qué cambia

| Pieza | Antes | Ahora |
|---|---|---|
| Qué restaura el rescate | El `app.asar.bak-*` de **nombre más alto** de la carpeta de datos | Solo la predecesora de una operación **VERIFICADA**, de **este** equipo, con su copia **local** intacta, y **única** |
| Dónde está la copia que se usa | Carpeta de **datos** (compartida por Drive) | **`%LOCALAPPDATA%\panorama-app-recovery\app.asar.pred-<operation_id>`** — ni Drive ni un perfil móvil la sincronizan; la retención heredada no la ve |
| Registro de procedencia | No existía | **`%APPDATA%\panorama-app-config\asar-procedencia.json`**, escritura atómica verificada, **sin rutas** |
| Identidad | No se usaba | El **`installation-id` de A3.3**, leído (nunca creado) por un lector autocontenido que rechaza los ids de sesión |
| Al aplicar un parche | Copia heredada y ayudante | Además: copia **local** releída y verificada, entrada **PREPARADA**; si **cualquier** paso falla, **no se aplica el parche** |
| El ayudante | Copiaba y relanzaba | **Relee** el asar instalado y la copia: **VERIFICADA** solo si ambos hashes cuadran; si no, **FALLIDA** (copia conservada) y **no reabre la app** |
| Asar instalado que no coincide o no se lee | — | **No se restaura sola**: pregunta, «El archivo actual no coincide con la instalación verificada.», **Cerrar** por defecto, **Esc/X = Cerrar** |
| Sin copia verificable | Restauraba cualquier `.bak` | Informa (**PS-1025**) y cierra; registro ilegible → **PS-1026**. **No recomienda el `.bat`** |
| Retención | 2 `.bak` por mtime | La heredada **no cambia**. La local: solo la predecesora del asar instalado; la anterior se retira **después** de verificar la nueva |
| `ERROR_CODES` | — | **PS-1025**, **PS-1026**, **PS-1027**; PS-1007 y PS-1008 reescritos |

### Decisiones y límites que conviene no olvidar

- **Hasta el primer parche aplicado con esta versión no hay recuperación
  automática verificable.** Las copias existentes (v2.0.53, v2.0.54, v0.1.28 y
  las demás) **no se heredan**: no hay forma de demostrar de dónde salen. **No
  se ha fabricado procedencia retroactiva.** Siguen en disco, sin tocar.
- **VERIFICADA prueba que el archivo instalado es exactamente el esperado. NO
  prueba que la app vaya a arrancar.** Son cosas distintas y el registro del
  ayudante lo dice así.
- **Aplicar un parche exige un `installation-id` persistido.** Con un id de
  sesión o ausente, el parche no se aplica (no se podría dejar una operación
  demostrable).
- **Reaplicar exactamente lo instalado** no crea ninguna relación de rescate: se
  avisa de que ya está instalado.
- **Las FALLIDAS conservan su copia** hasta la siguiente operación verificada;
  durante una racha de fallos, `%LOCALAPPDATA%` puede acumular copias de ~29 MB.
- **Tras una FALLIDA**, la predecesora verificada anterior sigue ahí, pero ya
  no corresponde al asar instalado: solo se ofrece **con confirmación** (y
  entonces es la versión de **dos** parches atrás, que el aviso nombra).
- **La confirmación antes de `ready`** usa `dialog.showMessageBoxSync`. Que
  funcione en ese momento es **razonado, no medido** en Electron real; si no se
  puede mostrar, **no se restaura** (preguntar es la condición).
- **La restauración** sigue siendo `copyFileSync` sobre el asar real —lo que ya
  estaba probado con la app en marcha— y se **relee** el resultado.
- **Tras una actualización con el instalador NSIS**, la entrada vieja deja de
  corresponder y el rescate vuelve a pedir confirmación o a apagarse hasta el
  siguiente parche verificado.

### Evidencia

- `p18/test-p18-procedencia.js` — **@@P18NODE@@**, EXIGENTE (nació descriptiva
  con 63). Funciones REALES extraídas, sandbox **explícito** y asar sintéticos;
  el **ayudante real** (generado con la plantilla de `main.js`) se ejecuta con el
  node del sistema: solo usa las rutas que recibe, así que su aislamiento es
  **por construcción**, no por variables (ARN-3). Cualquier escritura fuera del
  sandbox **lanza**.
- `p18/comprobar-reversiones-p18.js` — **@@P18REV@@**: nueve familias, cada una
  tumba exactamente lo que anuncia.
- **No se arrancó ningún `app.asar` empaquetado** en esta ronda (ARN-3).

### Arneses ajustados en la ronda

@@ARNESES18@@

## P10 — LÍNEA BASE DE TAMAÑO REANCLADA (18 sept 2026)

El árbol de `%APPDATA%\panorama-app` pasa de **207 284 784 B** a
**207 286 828 B**, con **los mismos 634 archivos**. Causa **identificada y
documentada**: el experimento accidental de **ARN-3** añadió a su `app.log` la
traza del PS-1007 que se disparó en el caso A. **No es basura nueva ni un
archivo nuevo.**

La **BD residual sigue en `F71F4140E7FD68504CBF65C1D930BC4A244554D7BFB013A70557A30CCF74F501`**
y los datos de usuario están intactos. **P10 no se modifica ni se limpia**: su
limpieza/archivo sigue **DIFERIDA** y sin autorización.

## ARN-3 — SALVAGUARDA DE ARNESES (18 sept 2026): cambiar `%APPDATA%` NO aísla a Electron

**Causa.** Se dio por hecho que redirigir `%APPDATA%` y `%LOCALAPPDATA%` del
proceso aislaba `app.getPath('appData')` en un Electron real. **No lo hace**: se
resuelve por la API de carpetas conocidas de Windows, no por la variable. Un
arnés que arrancó el `main.js` **empaquetado** con esa suposición acabó
ejecutando una sesión normal contra la carpeta de datos **real**.

**Regla, a partir de ahora.** Ningún arnés que ejecute el `main.js` empaquetado
real puede considerarse aislado solo por esas variables. **Antes de permitir
ninguna escritura**, el arnés debe **demostrar** qué devuelven de verdad
`app.getPath('appData')` y `app.getPath('userData')` en ese arranque, y abortar
si no caen dentro de su sandbox.

**Por qué los arneses actuales no están afectados:** no arrancan el asar
empaquetado; cargan el `main.js` del proyecto desde un envoltorio
(`real-run/*.js`) al que se le pasa la ruta del sandbox **explícitamente**, y
hacen `setPath` ellos mismos.

**Hasta rediseñar ese aislamiento, no se ejecutan más experimentos de
corrupción de `app.asar`.**

## P23 — ABIERTO (18 sept 2026): la protección de apagado acepta referencias persistentes a otra instalación

**MEDIO. No corregido. Va con A3.3 Bloque 8 / ciclo de vida de Drive** (se
revisará junto a **P14**, **P16**, heartbeat y arranque/cierre/suspensión).

**Qué.** `syncDriveSyncGuardWithLocation()` decide sobre **estado**, no sobre
**ruta**:

```
shouldBeOn = isUsingSharedDataLocationNow()
isOn       = isDriveSyncGuardEnabled()        // existe enabled.flag
shouldBeOn && isOn && vivo  ->  no hace nada
```

Nunca compara el valor registrado en `HKCU\…\Run` ni los argumentos de la tarea
`PanoramaDriveSyncGuardLaunch` con el `resources/drive-sync-guard` de la
instalación **que se está ejecutando**. Por tanto, si esas dos referencias
quedan apuntando a **otra** instalación y su guardián sigue latiendo, un
arranque normal de la instalación correcta **no las repara**.

**Cómo se vio (medido el 18 sept 2026).** Con `Run` y la tarea apuntando a una
instalación ajena y su guardián vivo, un arranque completo de la instalación
real (v2.0.55, cierre normal, `exit 0`) dejó ambas referencias **sin tocar**; el
`app.log` de ese arranque solo registró la línea de arranque y la espera de
Drive. La protección **funcionaba** en ese momento —había un proceso vivo—, pero
las referencias de arranque automático seguían mal.

**Impacto.** Sin pérdida de datos demostrada. El riesgo es de **continuidad**:
tras reiniciar Windows, la protección podría no arrancar si `Run`/tarea apuntan
a una ruta que ya no existe. Y el síntoma es silencioso: no hay aviso.

**Origen.** Lo destapó un arnés de P18 con un aislamiento defectuoso (ver
**ARN-3**), pero **la condición es del producto**: no se atribuye a P18. Que un
arnés lo provocara es lo que lo hizo visible, no su causa.

**Qué habría que mirar al corregirlo** (no ahora): comparar la ruta registrada
con `process.resourcesPath` en cada sincronización, y reescribir si difieren;
decidir qué hacer cuando hay un guardián vivo de otra instalación (¿convivencia,
relevo, aviso?); y si la comprobación debe correr también en el *watchdog*
periódico, no solo al arrancar.

## P18 — DISEÑO FINAL (18 sept 2026) · PROPUESTO, **sin implementar**

Recoge los dos ajustes estructurales pedidos al aceptar el diagnóstico: **la
copia predecesora también es LOCAL**, y **toda la operación se ata con un
`operation_id`**. Fase 1 toca **solo `main.js`**.

### 0. Una corrección al diagnóstico

En el diagnóstico propuse que el **instalador escribiera una entrada inicial**.
**Era innecesario y se retira.** En una instalación limpia **no hay
predecesora**: el manifiesto debe *reflejar la ausencia*, no fabricar una. La
primera relación legítima nace cuando una actualización sustituye un `app.asar`
que ya existía. Eso **reduce** lo que queda para D4: allí solo queda el `.bat`.

### 1. Dónde vive cada cosa

| Qué | Dónde | Por qué |
|---|---|---|
| **Manifiesto** `asar-procedencia.json` | `%APPDATA%\panorama-app-config\` | La carpeta de identidad que ya existe: `installation-id`, `location.json`, registro de A3.3, `historial-ubicacion.json` (P22). Son unos pocos KB |
| **Copia predecesora** | **`%LOCALAPPDATA%\panorama-app-recovery\`** | Es **local de verdad**: `%LOCALAPPDATA%` no se sincroniza con Drive **ni viaja en un perfil móvil**. Ya hay precedente en la arquitectura: la protección de apagado usa `%LOCALAPPDATA%\PanoramaDriveSyncGuard` con ese mismo `process.env.LOCALAPPDATA` |
| Nombre de la copia | `app.asar.pred-<operation_id>` | **No** empieza por `app.asar.bak-`, así que ni el recorrido antiguo ni `purgeOldAsarBackups()` la ven nunca. Cero interacción con la retención compartida |

**No** va dentro de P10 (`%APPDATA%\panorama-app`), ni en la carpeta de datos,
ni en la instalación.

**Por qué el manifiesto en Roaming y la copia en Local, y no los dos juntos:**
si `%APPDATA%` llegara a sincronizarse (perfil móvil de dominio), viajarían el
manifiesto **y** el `installation-id` — y la comprobación de identidad pasaría.
Lo que **no** viaja nunca es la carpeta `%LOCALAPPDATA%`, así que en ese
escenario la copia **no está** y la regla falla **cerrada** sola. La separación
no es un descuido: es la que cierra ese caso.

### 2. Identidad: la que ya existe, sin crear una segunda

`installation-id` de **A3.3** (`db.js`): 16 bytes aleatorios en hex, en
`%APPDATA%\panorama-app-config\installation-id`, **estable entre arranques**,
**local al equipo**, **nunca en la carpeta de datos** —«si viajara por Drive
dejaría de identificar nada», dice ya ese código— y distinto en cada una de las
seis instalaciones observadas. **Es exactamente la identidad pedida. No se crea
otra.**

Con un matiz que importa: el rescate corre **cuando `require('./db')` puede ser
justo lo que ha fallado**. Así que Fase 1 añade un lector **autocontenido** en
`main.js` —misma disciplina que `leerConfigUbicacion()` en P9— que:

- **solo lee, nunca crea** (crear el id es y sigue siendo de `db.js`);
- devuelve estados explícitos: `ausente` · `valido` · `ilegible` · `de-sesion`;
- **rechaza** un id de sesión (`sesion-…`): `db.js` ya documenta que no vale como
  prueba, y aquí tampoco;
- cualquier estado que no sea `valido` → **fail-closed**.

Y la batería exige que **la ruta del lector de rescate sea idéntica a la de
`db.js`**, para que no se repita lo de P9 (tres lectores con tres semánticas).

### 3. Esquema del manifiesto

```jsonc
{
  "v": 1,
  "installation_id": "<hex32>",        // el de este equipo, para detectar un manifiesto ajeno
  "operaciones": [{
    "operation_id": "<hex16>",         // ata TODA la operación, de principio a fin
    "installation_id": "<hex32>",
    "estado": "preparada" | "verificada" | "fallida",
    "sha256_anterior": "<hex64>",      // hash del app.asar instalado ANTES (= el de la copia local)
    "version_anterior": "2.0.54" | null,   // leída de la cabecera del asar; null si no se pudo
    "nombre_copia": "app.asar.pred-<operation_id>",
    "sha256_copia_local": "<hex64>",   // RELEÍDO del archivo copiado, no el de origen
    "sha256_nuevo_esperado": "<hex64>",// el del parche elegido: ya se calcula hoy y se tiraba
    "version_nueva_esperada": "2.0.55" | null,
    "sha256_nuevo_real": "<hex64>" | null,  // releído del app.asar REAL tras sustituirlo
    "creada_at": "<ISO>",
    "verificada_at": "<ISO>" | null,
    "motivo_fallo": "<texto corto>" | null
  }]
}
```

Sin rutas absolutas. La copia se localiza por **nombre** dentro de la carpeta de
recuperación, y se ata por **hash**.

### 4. PREPARADA → VERIFICADA

**La app**, antes de cerrarse (todo esto ya ocurre hoy salvo lo marcado ⟵):

1. genera `operation_id`;
2. calcula el SHA-256 del parche elegido — **ya se hace hoy**, solo que se tiraba;
3. copia `app.asar` real → `recovery\app.asar.pred-<operation_id>` ⟵ **nuevo**;
4. **relee la copia** y calcula su hash ⟵ **nuevo** (releer, no fiarse del origen);
5. lee la versión de las cabeceras de ambos asar, sin ejecutarlos ⟵ **nuevo**;
6. escribe la entrada `preparada` de forma **atómica y verificada** ⟵ **nuevo**;
7. sigue haciendo **también** la copia heredada `app.asar.bak-…` en la carpeta de
   datos, igual que hoy: es el único camino manual que existe hasta D4;
8. lanza el ayudante, pasándole el `operation_id` y la ruta del manifiesto.

**El ayudante**, ya con la app cerrada:

9. copia el parche sobre el `app.asar` real (igual que hoy);
10. **relee el `app.asar` real** y calcula su hash ⟵ **nuevo**;
11. **relee la copia local** y recalcula su hash ⟵ **nuevo**;
12. si `hash(real) == sha256_nuevo_esperado` **y**
    `hash(copia) == sha256_anterior` → escribe `estado: "verificada"`,
    `sha256_nuevo_real`, `verificada_at`. Si no → `estado: "fallida"` con el
    motivo. **Nunca deja la entrada a medias.**
13. solo **después** de una verificación buena, retira la operación anterior y su
    copia (ver §6). Relanza la app como hoy.

**Atomicidad**: temporal + escritura + `fsync` + `rename` + **relectura**, el
mismo primitivo que ya usan `escribirAtomico()` (`db.js`) y
`guardarHistorialUbicacion()` (P22). No se inventa otro.

### 5. Cada fallo parcial, resuelto

| | Situación | Qué queda en disco | Decisión |
|---|---|---|---|
| **A** | Copia local hecha, manifiesto **no** escrito | Un `app.asar.pred-…` huérfano | **No auto-restaurar.** Sin entrada no hay candidata. El huérfano se recoge en la siguiente verificación buena, nunca durante un rescate |
| **B** | Manifiesto `preparada`, parche **nunca aplicado** | Entrada `preparada` + copia | **No auto-restaurar.** `preparada` ≠ predecesora confirmada. Además su `sha256_nuevo_real` es `null`, así que ni siquiera puede cuadrar con el instalado |
| **C** | Parche aplicado pero **no se pudo verificar** | Entrada `fallida` (o `preparada` si murió antes de escribir) | **Fail-closed.** Recuperación segura: **PS-1025**, la app **cierra**, y el registro anota `operation_id` y el motivo. La copia local **no se borra**: queda para una restauración manual asistida en Fase 2 |
| **D** | Copia **truncada** | Entrada correcta, archivo corto | El hash recalculado no cuadra → **no candidata** |
| **E** | Manifiesto **truncado** / JSON roto | No se puede leer | **PS-1026**, fail-closed. Se distingue a propósito de «no hay nada»: no es lo mismo para soporte |
| **F** | **Dos** operaciones candidatas | Dos entradas | **Nunca «la más reciente».** Fail-closed. *Pero por construcción no debería pasar*: solo puede cuadrar la entrada cuyo `sha256_nuevo_real` sea el del asar instalado, y la retención deja una sola. Si sobreviven dos, es que una limpieza falló: justo cuando fallar cerrado es lo correcto |
| **G** | Parche nuevo tras otro correcto | Entrada nueva `preparada`, la vieja aún `verificada` | La nueva **sustituye** a la vieja solo **después** de verificarse. **No se borra primero y se crea después** |

Regla auxiliar que evita una ambigüedad tonta: se **descarta** toda entrada con
`sha256_anterior == sha256_nuevo_real` (reaplicar el mismo parche). Restaurarla
no cambiaría nada y solo sirve para crear empates.

### 6. Retención local, con ciclo propio

La copia de recuperación **no entra** en «conservar 2 por mtime»: ni está en esa
carpeta, ni lleva ese prefijo, ni la ve `purgeOldAsarBackups()`.

- Se mantiene **la predecesora VERIFICADA del `app.asar` instalado ahora**.
- Durante una actualización conviven **dos** como mucho (la vigente y la
  `preparada`): pico ≈ **58 MB** en `%LOCALAPPDATA%`.
- Al verificarse la nueva: se retira la anterior — **en ese orden**.
- Copias sin entrada (huérfanas) se recogen en la siguiente verificación buena.
- **Nunca se borra nada durante el arranque ni durante un rescate.**

### 7. Contrato de PS-1007 (nuevo)

Entrada: fallo no capturado durante el arranque, con el rescate armado.

1. Lee el `installation-id` (solo lectura). No `valido` → **PS-1025**.
2. Lee el manifiesto. Ilegible/roto → **PS-1026**.
3. Filtra: `estado == 'verificada'` · `installation_id` == el local ·
   `sha256_anterior != sha256_nuevo_real`.
4. Calcula el SHA-256 del `app.asar` **instalado ahora** y se queda con las
   entradas cuyo `sha256_nuevo_real` coincida.
5. **Exactamente una** → sigue. Cero o varias → **PS-1025** (el motivo, al log).
6. La copia debe **existir** y su hash recalculado coincidir con
   `sha256_copia_local`. Si no → **PS-1025**.
7. Solo entonces: guarda el roto como `app.asar.broken-<fecha>` (igual que hoy) y
   restaura. El aviso **nombra la versión y la fecha** de lo que ha restaurado.

**Coste medido** (hoy, sobre el asar real de 29 325 777 B): **93 ms** por
SHA-256 completo en Node. El rescate hace dos → ~0,2 s. Leer solo la cabecera
para la versión: **0 ms**. No es un problema.

**Se elimina del camino automático** «buscar cualquier `app.asar.bak-*` y tomar
el primero». `findLatestAsarBackupForRecovery()` y
`resolveDataDirForStartupRecovery()` **no se borran**: se **degradan a
informativas** —anotan en el registro si existen copias heredadas, para
soporte— y dejan de decidir nada. Así las garantías que **P9** mide sobre
`resolveDataDirForStartupRecovery()` siguen siendo medibles y no se rompe su
batería.

**Una decisión que dejo abierta a propósito.** El punto 4 ata la entrada al asar
instalado. Si el `app.asar` se corrompe **físicamente**, su hash no cuadrará con
nada y el rescate se negará — justo cuando más falta hace. Dos opciones:

- **(a) Estricta** *(la que recomiendo por defecto, y la que dice tu contrato)*:
  si el hash no cuadra, fail-closed siempre.
- **(b) Estricta + ofrecimiento**: si el asar instalado **no se puede leer**
  (ENOENT/EIO/truncado — no «lee bien pero no cuadra»), se **ofrece** la
  restauración con **confirmación explícita**, nombrando versión y fecha. Nunca
  automática. «Lee bien pero no cuadra» significa que otro proceso cambió la
  instalación: ahí la entrada está caduca y se rechaza sin matices.

No la resuelvo yo: cambia el contrato que has fijado.

### 8. El período sin copia verificable

Tras Fase 1, y **hasta** que una actualización cree copia local + manifiesto +
relación anterior→nueva + hashes:

- la restauración automática está **DESACTIVADA**;
- las copias actuales (v2.0.53, v2.0.54, v0.1.28 y las compartidas) **no se
  tocan, no se borran y no se mueven**, conservan su valor histórico/manual, y
  **nunca** son candidatas automáticas. Su limpieza es de P10/C1/Drive;
- **no se inventa procedencia histórica**;
- el aviso **no recomienda el `.bat` actual** —P18 ya demostró que tampoco tiene
  procedencia—: dice que no hay copia automática verificable, que la app se
  cierra, y remite a **reinstalación/parche soportado**. El registro sí anota que
  existen copias heredadas, para soporte. *No se cambia una recuperación
  automática insegura por otra acción insegura.*

Este período **vuelve** cada vez que el instalador NSIS actualice la
instalación: la entrada anterior deja de cuadrar y el rescate vuelve a estar
apagado hasta el siguiente parche verificado. Es correcto, y es otra razón para
que D4 lo mire.

### 9. Qué toca Fase 1

**Productivo: `main.js` y nada más.**

| Bloque | Qué |
|---|---|
| Rescate temprano (≈ líneas 88–231) | Lector autocontenido del `installation-id`; lector del manifiesto; nueva selección con procedencia; PS-1007 reescrito; PS-1025/PS-1026 |
| `ERROR_CODES` | **PS-1025** (no hay predecesora verificable) y **PS-1026** (manifiesto ilegible). El último dado de alta hoy es PS-1024 |
| «Aplicar parche» (≈ 9186–9330) | `operation_id`, copia local, relectura y hashes, versiones de cabecera, entrada `preparada`. Se conserva la copia heredada |
| `asarPatchHelperSource()` (≈ 8362–8469) | Releer el asar real y la copia, verificar, cerrar la entrada, retirar la anterior |
| Manifiesto | Lectura/escritura atómica y verificada, con el patrón que ya existe |

**No se toca:** `db.js` (el `installation-id` se lee, no se crea),
`Restaurar-backup.bat`, el instalador, los preloads, `security.js`, P10,
`purgeOldAsarBackups()` ni la retención heredada.

### 10. Lo que queda necesariamente para D4

1. **`Restaurar-backup.bat`**: que lea el mismo manifiesto, verifique hashes
   (`certutil -hashfile … SHA256` basta en Windows) y **no elija por
   fecha/nombre**. Vive en `extraResources` → **no se puede entregar por
   parche**. Hasta entonces **no cuenta como mecanismo verificado**.
2. **Opcional, no necesario para Fase 1**: que el instalador NSIS registre su
   propia operación cuando **actualiza** una instalación existente (ahí sí hay
   una relación anterior→nueva real), para que el rescate siga vivo tras una
   actualización por instalador.
3. **No** hace falta entrada inicial en una instalación limpia (§0).

### 11. Pruebas exigidas (cuando se implemente)

`p18/` pasa a **EXIGENTE** con los catorce casos del encargo:

| # | Qué exige |
|---|---|
| P18-1 | Copia local + manifiesto correcto → **candidata válida** |
| P18-2 | Copia en la carpeta **compartida**, aunque su versión sea la correcta → **no** candidata |
| P18-3 | Copia con **otro `installation_id`** → **no** candidata |
| P18-4 | `sha256_anterior` incorrecto → **no** candidata |
| P18-5 | `sha256_nuevo_real` que no coincide con el instalado → **no** candidata |
| P18-6 | `preparada` sin confirmar → **no** auto-restauración |
| P18-7 | `verificada` → **sí** candidata |
| P18-8 | Dos candidatas → **fail-closed**, y no gana la más reciente |
| P18-9 | Copia truncada → **fail-closed** |
| P18-10 | Manifiesto truncado → **fail-closed** (PS-1026, distinguible) |
| P18-11 | Sin manifiesto → **no** se usan los `.bak` históricos |
| P18-12 | **Drive ausente** → la predecesora local **sigue disponible** |
| P18-13 | P10 con la v0.1.28 → **nunca** candidata automática |
| P18-14 | Compartida con una copia **más nueva** → **nunca** candidata automática |

Más: que el aviso **no** nombre el `.bat`; que nada se escriba durante un rescate
fallido; que las copias heredadas queden **intactas** (hash idéntico); que la
ruta del lector del `installation-id` sea **la misma** que la de `db.js`; y
**reversiones** separadas —volver a elegir por nombre · aceptar `preparada` ·
saltarse la identidad · saltarse el hash— cada una tumbando solo lo suyo.
Electron real con `.asar` sintéticos, nunca con la instalación de verdad.

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

### Nota práctica — la ventana vacía titulada «Electron»

Medida y explicada: es la hija de `window.open('about:blank')` que abría el
**arnés** de F1 (modo `a`) para comprobar si heredaba el puente. Pertenece a
**F3** (`window.open` sin `setWindowOpenHandler`), no a F1. En uso normal no
aparece: comprobado con las cuatro ventanas productivas abiertas, cero ventanas
genéricas.

> El usuario cree haberla visto alguna vez **al entrar en Evaluación de
> Candidatos**. No se abre bloque por eso mientras solo ocurra con arneses
> Electron en ejecución. **Si vuelve a salir en USO MANUAL NORMAL, sin ninguna
> prueba activa:** anotar la acción exacta que la abre, y capturar
> `webContents.id`, la URL y la ventana padre (`BrowserWindow.getParentWindow()`
> / `webContents.hostWebContents`) **antes** de dar por hecho que es F3. Solo
> entonces se diagnostica. No se toca producto por esta observación.

---

## §F2 / F3 — La superficie del renderer. DIAGNÓSTICO (17 sept 2026), sin implementar

Se estudian juntos porque comparten superficie, pero **siguen siendo dos
hallazgos separados**, con conclusiones distintas. Batería `f2f3/`:
`test-f2f3.js` **45 OK/0** (descriptiva) + `electron-f2f3.ps1` **23 OK/0** en la
app real. **Producción sin tocar.**

### F2 — sin CSP

**Original (auditoría, [MEDIDO]):** «0 de 10 archivos HTML tienen
`<meta http-equiv="Content-Security-Policy">`. Una CSP no bloquearía el XSS de
F1 […] pero sí cortaría la exfiltración […]. Coste: una línea por plantilla.»

**Estado hoy:** confirmado **por las dos vías** — 0 `<meta>` en las 10 ventanas
y **0** cabeceras (`main.js` no usa `webRequest`/`onHeadersReceived`).

**De qué depende el producto** (lo que condiciona la CSP):

| Dependencia | Medido | Clase |
|---|---|---|
| `<script>` en línea | 7 de 10 ventanas | **A — necesario hoy** |
| Estilos en línea (`<style>` + `style="`) | 9 de 10 (193 atributos solo en el dashboard) | **A** |
| Recursos externos http(s) | **0** en las 10 | — |
| `eval`/`new Function` en código propio | **0** | — |
| `eval`/`new Function` en vendor | mammoth 7, pdf.js 3, pdf.worker 2 | **C — legado, NO ejecutado** |
| Worker | 1 (pdf.js, en Preparación) | **A** |
| `blob:` | 4 ventanas, **solo para descargar** | **A** |
| `fetch`/XHR en renderers | **0** (las actas se leen con `file.arrayBuffer()`) | — |

**Resultado decisivo, medido en Electron real:** con `new Function`
**demostradamente bloqueado** (EvalError, control de que la CSP actúa), mammoth
leyó un `.docx` real y pdf.js abrió un `.pdf` real **y arrancó su Worker**. Es
decir: **`unsafe-eval` NO hace falta**; esas apariciones en los bundles
minificados son rutas muertas.

**CSP mínima compatible, probada** (no implementada):

```
default-src 'none'; script-src 'self' 'unsafe-inline' file:;
style-src 'self' 'unsafe-inline' file:; img-src 'self' data: file:;
font-src 'self' file:; connect-src 'none'; form-action 'none';
frame-src 'none'; object-src 'none'; worker-src 'self' file:; base-uri 'none'
```

`'unsafe-inline'` es **inevitable hoy** y hay que decirlo claro: con él, la CSP
**no impide la ejecución** de un script inyectado. ¿Qué aporta entonces, ya
cerrado F1? **Corta la salida**: con `connect-src 'none'` el `fetch` externo
queda bloqueado y con `img-src` acotado una imagen remota tampoco carga —las dos
cosas, comprobadas—. Convierte una hipotética reaparición de un sink en
*defacement local* en vez de en fuga de datos. `base-uri 'none'` y
`form-action 'none'` cierran dos vías clásicas más.

**Archivos que tocaría:** las 10 plantillas HTML (una línea cada una) **o**
`main.js` en un solo punto si se prefiere por cabecera. **Riesgo de regresión:**
bajo pero real — cualquier recurso que hoy no esté en el inventario dejaría de
cargar en silencio; por eso la batería mide antes de proponer.

> **Corregido al implementar (17 sept 2026), sin borrar lo de arriba:** `file:`
> era redundante con `'self'`; `worker-src 'self' file:` habría dejado Workers
> **sin CSP**; y «arrancó su Worker» se había medido solo con `paginas === 1`
> (era cierto, pero no estaba demostrado). Ver «F2 — IMPLEMENTADO Y CERRADO».

### F3 — sin `setWindowOpenHandler`

**Original (auditoría, [LEÍDO]):** «Ninguna ventana intercepta `window.open` ni
navegaciones. Combinado con F1, un `<a href="https://…" target="_blank">`
inyectado abriría una BrowserWindow de Electron con contenido remoto.»

Venía **[LEÍDO]** — nunca se había reproducido. **Ahora sí, en Electron real.**

**Superficie real, medida:**
- El producto **nunca** llama a `window.open` (0 ocurrencias): toda la
  superficie de popups es **no intencionada**.
- Hay **un** `target="_blank"`: el enlace de la *ruta* de un entregable, acotado
  a `http(s)` y con `rel="noopener"` (y escapado desde F1). Es dato del usuario.
- **0** `setWindowOpenHandler`, `will-navigate`, `will-redirect`,
  `will-attach-webview` y `new-window`, con **10** `new BrowserWindow`.
- No se usa `shell.openExternal` en ningún sitio; sí `shell.openPath` (2
  llamadas) para abrir carpetas/archivos **locales**.

**Reproducido:** `window.open('about:blank')` crea una `BrowserWindow` real —
**esa es la «ventana negra»**: título `Electron`, url `about:blank`, sin
contenido. Un `window.open` a un `file://` local también abre ventana, y un clic
en `<a target="_blank">` abre el destino **dentro de la app**, no en el
navegador del usuario.

**Barreras que ya existen** (medidas en las hijas): heredan
`contextIsolation:true` y `sandbox:true`, **no** reciben `panoramaBridge`
(0 métodos) y **no** tienen Node (`require`/`process` ausentes). Con
`rel="noopener"` la hija pierde el `opener`; sin él, el padre conserva la
referencia y puede escribirle (mismo origen).

**Severidad real:** **no es escalada de privilegios** — la hija es, como mucho,
una pestaña de navegador sin barra de direcciones. El riesgo es otro: contenido
remoto **dentro del marco de la aplicación**, sin URL visible (superficie de
engaño), y un enlace legítimo que se abre donde no debe. Es más **corrección de
comportamiento** que agujero.

### F3 — IMPLEMENTADO Y CERRADO (17 sept 2026)

Corregido en **`main.js` y solo en `main.js`**. Un helper único,
`aplicarPoliticaDeNavegacion(wc, etiqueta)`, aplicado a las **10** ventanas:

- **`setWindowOpenHandler` → `{ action: 'deny' }` SIEMPRE.** El producto no usa
  popups propios, así que no hay excepciones.
- **`http(s)` → `shell.openExternal`.** La URL se valida con **`new URL`** (nada
  de `startsWith` ni regex laxa); si el parseo falla, se deniega y no se intenta
  «arreglarla». El rechazo de `openExternal` se captura siempre —nada sin
  manejar— y el rastro **no imprime la URL entera**: solo esquema y host.
- **`will-navigate`**: se bloquea lo inesperado, **preservando lo que el
  producto sí usa**. Se comprobó ANTES de poner la guardia: lo único que navega
  de verdad es `location.reload()` del dashboard, y las exportaciones, que van
  por `blob:`. Ambas siguen funcionando.

**Resultados:** `f2f3/test-f2f3.js` **63 OK/0** (exigente) · `electron-f2f3.ps1`
**35 OK/0** en la app real, con **espía sobre `shell.openExternal`** (no se abre
Internet) · reversión `revertir-f3.js` + `comprobar-reversiones-f3.js` **5 OK/0**
y `electron-f3-revertido.ps1` **4 OK/0**, que reproduce las tres señales del
defecto al quitar la política.

Cubierto en Electron real: `about:blank`, `file://`, `data:`, `javascript:`,
esquema inventado y URL malformada → **0 ventanas y 0 salidas al navegador**;
`http`/`https` válidos → **BrowserWindow denegada y `openExternal` exactamente
una vez**; el enlace de un entregable → sale al navegador; navegación externa →
bloqueada dentro de Electron; `location.reload()` y `blob:` → intactos.
**Ya no aparece ninguna ventana titulada «Electron».**

**Regresión encontrada y corregida durante la ronda:** los arneses de A2, Bloque
5 y C1 extraen `writeLocalStorageDumpToPartition`/`runInPartition` de `main.js`,
que ahora llaman al helper. A2 se puso en **54 fallos** con
`aplicarPoliticaDeNavegacion is not defined` — exactamente lo que anuncia la
cabecera de `comun/bloque5-extraccion.js`. Se añadieron las cinco funciones a esa
lista compartida y el helper tolera un `webContents` sin esas APIs (un doble de
pruebas); en producción siempre las trae.

`main.js`: `434BB294…` → `16AB5F53…`. Anclajes actualizados con su nota: `E1-M4`
(hash), `F1-Z1` y `F2/F3-Z2` (esperaban ver F3 «PENDIENTE»).

### Conclusión separada

**F2 y F3 no se funden.** F2 es **mitigación de daños** (no evita la ejecución,
corta la salida) y toca 10 archivos; F3 es **corrección de comportamiento** con
un beneficio inmediato y visible para el usuario (los enlaces externos se abren
en su navegador) y toca **uno**.

**Decisión del usuario (17 sept 2026): F3 primero — implementado y cerrado.
F2 queda ABIERTO / DIAGNOSTICADO / SIGUIENTE**, con su CSP candidata ya probada
contra mammoth y pdf.js reales, para su propia ronda de implementación y
regresión. *(Superado el mismo día: F2 se implementó en su ronda — abajo.)*

### F2 — IMPLEMENTADO Y CERRADO (17 sept 2026)

Condición del usuario: **la CSP mínima compatible con cada ventana**, sin copiar
la candidata a ciegas. Antes de fijarla se midió el motor —el Chromium de
Electron 30.5.1— con un laboratorio que **no carga el producto**
(`real-run/f2-laboratorio.js`, **41 OK / 0**) y solo después se tocó código.

#### Lo que el laboratorio corrigió del diagnóstico

- **`'self'` en un documento `file://` es EXACTAMENTE `file:`** — cualquier
  archivo local, en cualquier carpeta, sin poder acotar por ruta— en `script`,
  `style`, `img`, `font` y `worker` (L2). La candidata repetía `file:` junto a
  `'self'`: **redundante**, se quita. No hay ninguna directiva que «exija
  `file:`» además de `'self'`; la tabla real es qué ventanas necesitan archivos
  locales en cada directiva:

  | Directiva | `'self'` lo necesitan | Por qué |
  |---|---|---|
  | `script-src` | las 9 con scripts (todas menos `restore-helper`) | `theme.js`, `modal.js`, `renderer.js`, xlsx, pptx, `service-status.js`, pdf.js/mammoth |
  | `style-src` | las 8 con interfaz (la splash no enlaza hojas; se le concede igual, sin efecto) | `motion.css`, `window-chrome.css`, `fonts.css` |
  | `img-src` | las que pintan el icono | `assets/icon-*.png` |
  | `font-src` | dashboard, Directorio, Evaluación y Preparación | las `woff2` de `vendor/fonts/` |
  | `worker-src` | **ninguna** | ver el punto de los Workers |

- **El Worker de pdf.js SÍ arranca de verdad** — el diagnóstico lo afirmó
  mirando solo `paginas === 1`, que también se cumple con el *fake worker* en el
  hilo principal. Medido ahora: pdf.js 3.11.174 crea el Worker **directamente
  desde `file:`** (Chromium da a los `file://` el origen `"file://"`, no
  `"null"`), en modo **REAL** hoy y bajo la candidata (L3). Mi hipótesis previa
  —que lo envolvía en un `blob:`— quedó **refutada** y se deja constancia en la
  batería.
- **Un Worker creado desde `file:` NO recibe la CSP de la ventana, ni por
  `<meta>` ni por cabecera** (L9c, L9d): hace `new Function` y sale a la red. Un
  Worker creado desde `blob:` **sí la hereda**, también cuando solo hace
  `importScripts` de un `file:` (L9f). Con la candidata (`worker-src 'self'`),
  cualquier JS local se podía ejecutar como Worker **sin `connect-src`**: un
  hueco estructural justo en la propiedad que F2 tenía que garantizar.
- Sin `worker-src` explícito, los Workers caen en la cadena de reserva
  (`script-src`) y **se permiten** (L3e): hay que denegarlos donde no se usan.
- **`blob:` no hace falta para exportar**: un `<a download>` sobre `blob:`
  descarga completo y sin violación con una CSP que no lo nombra (L4). Leer un
  `blob:` con `fetch` sí cae en `connect-src` (el producto no lo hace).
- `executeJavaScript` —con el que `main.js` habla con las ventanas ocultas y con
  `psAlert`/`psConfirm`— **funciona con `default-src 'none'`**; lo que ese código
  intentara evaluar sigue bloqueado (L7).
- **La cabecera SÍ llega a los `file://`** (L1) —mi hipótesis previa era la
  contraria—, también **dentro de un asar** (L10, la app empaquetada), y
  `session-created` se emite para la sesión por defecto y para cada partición.

#### Arquitectura: cabecera desde `main.js`, no `<meta>`

Decidida por comportamiento medido, no por estética: llega a `file://` y a asar;
**un solo enganche** cubre las 10 ventanas y todas las particiones; un proyecto
horneado antes de F2 recibe la misma política **aunque su copia no se pueda
regenerar** (medido con el archivo en solo lectura); y un documento `file://`
que no esté en la tabla recibe la política **cerrada**. El `<meta>` no habría
cubierto los Workers mejor (tampoco llega a los `file:`) y habría dependido del
rehorneado.

#### La política (cuatro perfiles)

| Perfil | Ventanas | Qué concede |
|---|---|---|
| `cerrado` | volcado-localstorage y particion-auxiliar (`restore-helper.html`) **y cualquier documento no previsto** | nada: `default-src 'none'; form-action 'none'; base-uri 'none'` |
| `sinScriptEnLinea` | lanzador, splash | `script-src 'self'` **sin** `unsafe-inline` (no tienen ni un script ni un manejador en línea); estilos propios y en línea; `img-src 'self' data:` (fantasma de arrastre) |
| `interfaz` | proyecto (dashboard y Directorio horneados), Evaluación, selector de backups, Seguridad, contraseña | `script-src` y `style-src` `'self' 'unsafe-inline'`; `img-src 'self' data:` (logos); `font-src 'self'` |
| `lectorDeActas` | Preparación | lo de `interfaz` y `worker-src blob:` |

Comunes a los tres con interfaz: `default-src 'none'`, `connect-src 'none'`,
`frame-src 'none'`, `object-src 'none'`, `worker-src` explícito,
`form-action 'none'`, `base-uri 'none'`. **`unsafe-eval` en ninguno.**

Sobreconcesiones aceptadas, por no ser relevantes: `data:` y `font-src 'self'`
en Evaluación, selector, Seguridad y contraseña (no las usan; una imagen `data:`
no ejecuta ni saca nada, y las fuentes son locales), y `script-src 'self'` en la
splash, que no tiene scripts ni datos. Un quinto perfil por cada una añadiría
mantenimiento sin reducir ninguna capacidad que importe.

**Lo que esta CSP NO hace:** donde queda `'unsafe-inline'` en `script-src`
(8 de las 10), **un `<script>` en línea inyectado sigue ejecutándose** —la
batería lo comprueba a propósito en el dashboard (`F2-3d`)—. Quitarlo exige
rehacer las plantillas; no es F2. Su valor real: **corta la salida** (fetch,
XHR, WebSocket, imágenes/hojas/scripts/fuentes remotos), **impide frames,
objects y envíos de formulario**, **fija la base de las URL**, **deja sin
`eval`** y **limita los Workers**. En el lanzador y la splash sí corta además
la inyección en línea (`F2-3c`). **Límites conocidos que la CSP no gobierna:**
la navegación (la resuelve F3, que manda los `http(s)` al navegador del sistema
—un canal visible para el usuario—) y la precarga DNS.

> **F2 NO sustituye a F1** (criterio del usuario al cerrar, 17 sept 2026). F1
> —el escape por contexto de cada sink demostrado— **sigue siendo la defensa
> primaria**. F2 es defensa en profundidad: corta la red, elimina `eval`,
> bloquea frames/objects/forms, restringe recursos y restringe Workers.

#### Cambios de producto: dos archivos

- **`main.js`** (`16AB5F53…` → `E7D596A8…`, 601 293 B; +139/−1):
  `CSP_PERFILES`, `perfilCspDeDocumento(url)`, `instalarCspEnSesion(ses)` y
  `app.on('session-created', instalarCspEnSesion)`; import de `fileURLToPath`.
- **`preparacion-reunion/plantilla_preparacion_reunion.html`**
  (`F3F9130B…` → `69F66B8C…`, 80 881 B; +37): `arrancarWorkerPdf()` crea el Worker desde un
  `blob:` que solo hace `importScripts` del vendor, **espera su `ready`** y se lo
  da a pdf.js por `workerPort`; si el Worker no llega (error o 10 s) se descarta
  y pdf.js sigue por su camino de siempre, así que **el acta se lee igualmente**
  (demostrado con `worker-src 'none'`). **Justificación del archivo adicional:**
  sin este arranque, `worker-src blob:` deja a pdf.js en el hilo principal, y
  `worker-src 'self'` deja un Worker sin CSP. Es el mismo mecanismo que pdf.js
  usa por sí mismo en orígenes cruzados (`createCDNWrapper`).

No se han tocado `db.js`, `security.js`, los preloads ni el resto de plantillas.
**Ninguna plantilla lleva `<meta>` CSP** (una sola fuente, custodiado).

#### Resultados

| | |
|---|---|
| `f2/test-f2.js` | **EXIGENTE**: los cuatro perfiles con su texto exacto; `unsafe-eval` ausente (política y código); sin `file:`, sin comodines ni hosts; `data:` solo en `img-src`; `blob:` solo en el Worker de Preparación; el reparto documento→perfil **ejecutado** (10 ventanas, mayúsculas, `%20`, asar, Drive, `..`, UNC, URL rota → cerrado); el enganche ejecutado con dobles (mapa que lanza → cerrado); y el inventario que sostiene cada perfil |
| `f2/electron-f2-lab.ps1` | **41 / 0** — el motor |
| `f2/electron-f2.ps1` | **212 / 0** — la app real |
| `f2/comprobar-reversiones-f2.js` | **10 familias**, cada una tumba exactamente lo que anuncia |
| `f2/electron-f2-revertido.ps1` | **7 / 0** — sin CSP vuelven a salir fetch e imagen remotos; con `unsafe-eval`, `new Function` vuelve a ejecutarse; con `worker-src 'none'` el acta se lee pero sin Worker real (control de compatibilidad) |

**En la app real, ventana por ventana (F2-1…F2-15):** las 10 con su política
**efectiva** leída del evento de violación de Chromium (`disposition:
enforce`), y la cabecera en **todos** los documentos servidos; `new Function`
bloqueado en las 10 y Electron sin su aviso de CSP insegura; scripts, hojas,
imágenes (icono y logos `data:`) y fuentes Inter/JetBrains cargando; **cero
violaciones fuera del sondeo**; mammoth y pdf.js leyendo un `.docx` y un `.pdf`
reales **por `handleActaFile`**, con el Worker **real** arrancado desde `blob:`,
reutilizado en la segunda acta y sin *fake worker*; exportaciones reales
—CSV, Excel y **PowerPoint con logo** del dashboard, Excel y JSON del
Directorio, JSON de Evaluación y guion de Preparación— escritas en disco;
`location.reload()` y un documento `blob:` (que **hereda** la CSP); fetch
http/https, XHR, WebSocket, imagen/hoja/script/fuente remotos, iframe, object y
formulario **bloqueados con cero visitas** al servidor local en 8 ventanas;
restauración real (sus dos ventanas ocultas con CSP); **proyecto creado con el
`main.js` anterior a F2** —sin CSP en su fase A— abierto con F2, también con su
copia **en solo lectura** (no se rehornea, el fallo queda en `app.log`, y aun
así tiene CSP); proyecto nuevo con y sin importación. F3 intacto.

**Diagnóstico aparte, sin relación con F2:** con la ventana **oculta** (los
arneses arrancan Electron minimizado) pptxgen no termina ni una presentación
mínima; con la ventana visible, sí. **Igual con el `main.js` anterior a F2**, y
el `.pptx` generado mide lo mismo con y sin F2 (191 781 bytes). Es un artefacto
del arnés (`--modo=pptx`); en uso normal la ventana está a la vista. No se ha
comprobado qué ocurre si el usuario minimiza **durante** la generación.

**Regresión de arneses previa, y su tratamiento:** ver MANIFIESTO (§4).

**Cierre (17 sept 2026): F2 → CERRADO**, con los cuatro perfiles aceptados
(la desviación sobre «2–3» se acepta por `sinScriptEnLinea`) y el cambio de
Preparación aceptado como parte de F2. **No ampliar más esa zona.** Pruebas a
mantener allí: Worker real, PDF real y *fallback* sin Worker —cubiertas—, y
**cierre/reapertura de la ventana**, que **no** está cubierta de forma
explícita (la restauración cierra Preparación, pero ningún arnés la reabre y
vuelve a leer un acta): pendiente de añadir cuando se autorice.

**ARNÉS / CAPTURA — OBSERVACIÓN NO RESUELTA:** en
`f1/electron-f1-limpio.ps1`, `6-directorio-ficha.png` sale de **0 bytes**. No
reabre F2: el Directorio se probó directamente en Electron bajo la CSP, carga y
funciona, y no hay evidencia de fallo productivo. Si reaparece fuera de ese
arnés, o se demuestra que una ventana productiva no pinta, se diagnostica
aparte. No se toca producto por esto.

---

### P17 — icono roto en la barra de título del dashboard horneado — **CERRADO** *(17 sept 2026)*

**No es de F1 y no se ha tocado.** `dashboard/plantilla_dashboard.html` tiene
**dos** `<img src="../assets/icon-256.png">` (`:453`, pantalla de carga; `:458`,
barra de título) y `fixVendorScriptPaths` (`main.js:2575`) los reescribe con
`String.replace` de patrón **cadena**, que sustituye **solo la primera**. La
segunda conserva la ruta relativa, que desde `projects/<id>/` no resuelve: el
iconito de la barra de título sale roto en **todo** dashboard horneado.
Medido: 3 ocurrencias en la plantilla, **idénticas antes y después de F1**, y la
única imagen rota de la página en los tres casos de logo. Es la misma familia de
defecto que F1 corrigió en el seed (`String.replace` mal usado), pero en otra
función y fuera del alcance autorizado.

**DIAGNOSTICADO el 17 sept 2026 (sin implementar).** Batería `p17/` — **61 OK/0**,
descriptiva, ejecutando `fixVendorScriptPaths` REAL contra las dos plantillas:

- **Afecta a las dos plantillas horneadas**, no solo al dashboard: el Directorio
  de Talento usa la misma función y también tiene 2 iconos.
- **Solo afecta al icono.** De los 9 patrones que reescribe la función, 8
  aparecen 0 o 1 vez (para ellos, sustituir solo la primera da igual); el icono
  aparece **2**. Tras hornear queda **exactamente 1** ruta relativa por
  plantilla, y ningún otro asset sin resolver. No hay assets fuera de la lista.
- **Corrección mínima**: las tres candidatas (`replaceAll`, regex global, o
  `split/join`) dejan 0 restos, resuelven los 2 iconos y **no tocan ninguna otra
  parte del archivo**. Los 8 assets restantes y el `factory-seed` quedan igual.
- **Hallazgo añadido, misma familia y misma función:** los 9 reemplazos pasan la
  URL como **cadena**, donde `$&`, `` $` `` y `$'` tienen semántica. Medido con
  una ruta de instalación que los contenga: con `$&` quedan **10** assets sin
  resolver en vez de 1; con `$'` el archivo horneado pasa de 373 KB a **189 MB**
  y quedan **2210** sin resolver. Es **latente** (la ruta actual no tiene `$`),
  pero se cierra gratis usando una **función** de reemplazo, que además resuelve
  lo anterior. Recomendación: regex global + función de reemplazo en los 9.

### P17 — CERRADO (17 sept 2026)

Corregido en **`main.js` y solo en `main.js`** (las plantillas no se tocan: la
causa está en la función común). Los nueve reemplazos pasan a **un solo patrón
compartido**: expresión regular **global** + **función** de reemplazo.

```js
const sustituirTodo = (texto, busca, pone) =>
  texto.replace(new RegExp(busca.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), () => pone);
const ASSETS = [ …los nueve… ];
let salida = html;
for (const [busca, pone] of ASSETS) salida = sustituirTodo(salida, busca, pone);
```

Cierra **los dos** defectos de la misma familia de una vez: el global resuelve
**todas** las ocurrencias (los dos `icon-256.png`), y la función hace que la
ruta se inserte **literal**, sin semántica de `$`.

**Resultados:** batería `p17/test-p17-assets.js` **70 OK/0** (ahora EXIGENTE),
`p17/electron-p17.ps1` **16 OK/0** en la app real (dashboard horneado **y**
Directorio horneado: cero imágenes rotas, cero hojas sin cargar, cero rutas
relativas, vendor cargado), reversión `p17/revertir-p17.js` +
`comprobar-reversiones-p17.js` **6 OK/0** — al volver a `String.replace(cadena,
cadena)` reaparecen **los dos** defectos.

Probado con rutas de instalación que contienen `$&`, `$'`, `` $` `` y `$1`: HTML
de tamaño razonable, cero duplicación, cero coincidencias inesperadas, ruta
literal y todos los assets resueltos. Y se conserva la prueba de **equivalencia
byte a byte**: deshaciendo solo las nueve sustituciones se recupera la plantilla
original, así que no hay cambios laterales en seed, markup, estilos ni scripts.

`main.js`: `0BC92A46…` → `434BB294…`. Dos anclajes saltaron y se actualizaron
con su nota: `E1-M4` (hash) y `E2-A5` (custodiaba la forma antigua del
`.replace`; su intención no cambia).
