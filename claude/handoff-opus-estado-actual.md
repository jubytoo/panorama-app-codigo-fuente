# HANDOFF — estado técnico de Panorama del Servicio

**Fecha:** 15 sept 2026 — *(tabla §1 revisada el 18 sept 2026 al cerrar **P18 Fase 1**; el resto del documento conserva su fecha)* — **última actualización de fondo: ronda H-1**, que cerró **A2** y
**P2**. **Autor:** la sesión de Opus en curso.
**Propósito:** que una sesión nueva entienda dónde estamos **sin reconstruir la
conversación**. Documentación preventiva: no cambia el trabajo en curso ni
adelanta fases.

> ## AVISO 0 — DÓNDE ESTÁ LA BATERÍA DE PRUEBAS
>
> **Ruta estable (usar esta):**
>
> ```
> C:\Codigo Fuente PS\panorama-app-codigo-fuente_1\claude\pruebas-a33\
> ```
>
> **174 archivos**, 3 546 302 bytes, copiados el 15 sept 2026 con **cero
> diferencias de hash** frente al origen y **21/21 entrypoints** localizables y
> ejecutables desde ahí. Manifiesto completo en
> `claude/pruebas-a33/MANIFIESTO.md`; integridad en
> `claude/pruebas-a33/SHA256SUMS.txt`.
>
> **No es código productivo:** `package.json → build.files` es una lista blanca
> y `claude/**` no está en ella. Verificado leyendo la cabecera del `app.asar`
> compilado: no menciona `claude` ni `pruebas-a33`. Ningún archivo de la app
> referencia `claude/` en tiempo de ejecución.
>
> **Cómo relanzarlas** (detalle en el manifiesto, §5):
>
> ```
> set ELECTRON_RUN_AS_NODE=1
> node_modules\electron\dist\electron.exe claude\pruebas-a33\<bateria>.js
> ```
>
> Los doce entrypoints automatizados son `comun/test-guardia.js`,
> `bloque1/test-db-integrado.js`, `bloque2/test-wiring.js`,
> `bloque3/{test-error-codes,test-primitivas,test-seguridad}.js`,
> `bloque4/{test-acciones,test-consumidores}.js`,
> `bloque5/{test-borrados,test-cableado}.js` y
> `a2/{test-restauraciones,test-cableado}.js`. Los arranques Electron reales
> son `bloque5/electron-real.ps1` y `bloque5/electron-cv.ps1`.
>
> Los arranques Electron reales de A2 son `a2/electron-real.ps1` (`RA-1..RA-9`;
> `$env:A2_MODOS` elige modos, `$env:A2_MAIN` arranca contra una reversión).
>
> **Resultado más reciente: 1745 OK / 0 automatizados + 66 OK / 0 en Electron
> real** (15 sept 2026, ronda H-1).
>
> > **Esa cifra es evidencia histórica, NO una verificación vigente.**
> > Corresponde al estado del código en el momento en que se ejecutó. Una
> > sesión nueva **debe volver a ejecutar las baterías relevantes** contra el
> > código actual antes de atribuirse ninguna verificación, y reportar sus
> > propios números.
>
> **Procedencia histórica** (puede haber desaparecido; ya no hace falta):
>
> ```
> C:\Users\ADMIN~1.JLO\AppData\Local\Temp\claude\C--Codigo-Fuente-PS\
>   e55d4471-ea3f-4279-b758-0366ccb6384c\scratchpad\
> ```
>
> Esa ruta llevaba el id de sesión. **No se copiaron**: una copia de la base de
> datos del usuario (`copia-solo-lectura.sqlite3`) y los sandboxes generados
> (`real-run/sb`, `sandbox/`).

---

## 1. ESTADO GENERAL

| Id | Estado | Nota |
|---|---|---|
| **A1** — re-cifrado destruye archivos | **CERRADO** | Journal v2, staging, hashes por elemento, recuperación y fail-closed PS-2004. Endurecido en el Bloque 3 |
| **A2** — restaurar backup | **CERRADO** (15 sept 2026, ronda H-1) | Cableado + barrera durable + flush de la reposición + **H-1** (barrera persistente). 1745 OK/0 automatizados, 66 OK/0 en Electron real (RA-1..RA-9). Ver §4 |
| **A3.1** — instancia única | **CERRADO** | Verificado en Windows real |
| **A3.2a / A3.2b** | **ABSORBIDO por A3.3** | Identidad de commit + `exigirCommitBase` + `.gen` |
| **A3.3** — multi-PC / integridad | **Bloques 1–5 CERRADOS** | Ver §3. Fuera: Drive con dos PCs reales |
| **B1** — `projects:list` lee 4× | **CERRADO** (15 sept 2026) | Contexto de pasada (4→1, 2→1), lectura pura, rastro sin spam, `computeStaffingRatio` fuera. Batería **77 OK/0**, Electron real **24 OK/0**, cuatro reversiones. Ver §16 |
| **B2** — excepción no capturada | **CERRADO** | `procesoComprometido`, el error llega al usuario |
| **B3** — rutas solo en `console.warn` | **CERRADO** (15 sept 2026) | **Los errores relevantes ya no dependen exclusivamente de `console`.** Cifrado de backup **fail-closed**, el Directorio avisa cuando no puede guardar, **15** líneas de rastro nuevas en `main.js` (9 con dedupe por sesión) y saneado de rutas (`motivoSinRutas`). Los 19 `console.warn` **siguen ahí**: B3 añade al lado, no sustituye. Catch vacíos 26 → 17. Batería **85 OK/0**, Electron real **36 OK/0**, siete reversiones. **NO** cierra «el logging sobrevive a una caída de Drive» → **P14**. Ver §17 |
| **P14** — `app.log` vive en Drive | **ABIERTO — media** (15 sept 2026) | Si lo que falla es Drive, el aviso se escribe **allí**. El código ya usa el patrón bueno (`appData`) para los backups de emergencia, pero `appLog` no. Relacionado con A3.3 Bloque 8 / ciclo de vida de Drive |
| **P15** — rutas completas en los mensajes antiguos | **ABIERTO — baja** (15 sept 2026, **ampliado el 16**) | Las ~139 líneas anteriores a B3 concatenan `e.message` en crudo, que en un error de `fs` lleva `C:\Users\<usuario>\…`. **Y no es solo `app.log`: medido en B5, la ruta llega también a la INTERFAZ** (el `Detalle:` de un PS-2003 la muestra al usuario). El saneador existe y está probado, pero **NO** aplicarlo en bloque: los mensajes PS llevan el detalle literal a propósito y hay que decidir antes qué necesitan recovery y soporte |
| **B4** — `persist()` sin try/catch | **CERRADO** (16 sept 2026) | **En tres partes, y ahora con batería.** (A) mitad `db.js`: absorbida por A3.3 — `persist()` no existe. (B) mitad `backup:save`: cerrada por el Bloque 4 — archivo+fila en una acción anclada. (C) patrón residual hallado en el diagnóstico: `projects:reorder` con N commits → **una sola mutación**. Batería **144 OK/0**, Electron real **17 OK/0**, dos reversiones. Ver §18 |
| **B5** — Enter reenvía el formulario de Seguridad | **CERRADO** (16 sept 2026) | Una línea en `doSubmit()`: `if (els.btnSubmit.disabled) return;`. **Medido antes**: 2 Enter = 2 IPC, 5 Enter = 5 IPC, click+Enter = 2. **Medido después**: 1 IPC en todos los casos, en los cuatro modos, y en la ventana real. Las capas inferiores **no se han tocado** y siguen custodiadas con IPC directos. `b5/test-b5-reentrancia.js` **68 OK/0** + `b5/electron-b5.ps1` **24 OK/0** + una reversión. Ver §19. No confundir con el Enter de Candidatos, que sí se corrigió |
| **C1** — residuos acumulados | **ABIERTO**, partido en dos (16 sept 2026) | **C1-A — CERRADO:** inventario de residuos al arrancar (solo lectura, una línea en `app.log`), CV retirados solo con `aplicado+verificado` en «Eliminar evaluación» e «Importar», y mensajes que ya no prometen una autorrecuperación inexistente. Batería **165 OK/0**, Electron real **31 OK/0**, siete reversiones. **C1-B — ABIERTO / DIFERIDO:** retirada de lo histórico (117 backups, 7 particiones…). Multi-PC/Drive todavía no permite demostrar que un archivo sin referencia local no vaya a recibir después su fila desde otro equipo. Ver §20 |
| **P16** — particiones de Chromium en Drive | **ABIERTO** (16 sept 2026) | Las particiones vivas suman ~755 MB en la carpeta sincronizada, **~721 MB de caché** (una sola: ~523 MB de Service Worker de un origen https externo). Ubicación, sincronización innecesaria, crecimiento y ciclo de vida. Va con A3.3 Bloque 8 / ciclo de vida de Drive. **No es C1** y no se ha tocado. Ver `pendientes-abiertos.md` §P16 |
| **C2–C5** | **PENDIENTE** | `.asar` en la carpeta sincronizada, residuo de compilación, copia byte-idéntica, PNG sin usar |
| **D1–D4 (auditoría)** | **PENDIENTE DE RELEASE FINAL** | Sin control de versiones, `gen_snapshot.py`, prueba de humo. **D4** (`package.json` 2.0.55 vs código 2.0.56) queda **ABIERTO / DIFERIDO A CIERRE DE RELEASE** por decisión del usuario (15 sept 2026): sigue siendo bloqueador de la **publicación final**, pero **no del trabajo técnico intermedio**, y no se toca ahora porque volvería a cambiar al terminar la auditoría. **No confundir con los D1–D4 del Bloque 5** |
| **E1** — vista Lista/Resumen a medias | **CERRADO** (15 sept 2026) | **Retirados los controles** (opción A), no completadas las vistas. Ya no bloquea la publicación. `e1/test-inventario-e1.js` **47 OK/0** + lanzador real **21 OK/0**. Ver §13 |
| **P12** — `NaN` por dividir por un rango de fechas vacío | **CERRADO** (15 sept 2026) | `rangoTemporalValido()`: sin escala demostrable no se infiere progreso. Batería **73 OK/0**, dashboard real **32 OK/0**, tres reversiones. Ver §14 |
| **E2** — `computeServiceEndWarning` duplicada | **CERRADO** (15 sept 2026) | `vendor/service-status.js` como fuente única, contrato `{kind, level, days, message}`. Batería **67 OK/0**, Electron real **42 OK/0**, dos reversiones. Ver §15 |
| **P13** — frescura del origen | **ABIERTO / ACEPTADO TEMPORALMENTE — baja-media** | **Lanzador = snapshot del último backup persistido. Dashboard abierto = estado vivo.** Decisión del usuario: no se cambia la fuente ahora. B1 **no** lo empeora. Ver §16.5 |
| **E3–E5, E7** | **PENDIENTE** | Barra de título, tema fijo, colores, `THEME_KEYS` |
| **E6** — fallo al exportar invisible | **CERRADO su mitad de guardado; PENDIENTE la de exportar** | |
| **F1** — 76 `innerHTML` sin escapar | **CERRADO** (16 sept 2026) | **Interpretación de datos como HTML, corregida por contexto** (texto / atributo / `<textarea>` / selector / handler / `<script>` / URL). Los 76 `innerHTML` siguen ahí: se escapó el **dato**, no se reescribió la vista. 5 archivos: dashboard (helpers propios, era la única plantilla sin escape), `main.js` (seed `<`→`<` + replacement **function** contra `$&`/`$'`), Preparación (`onclick`→listener), Evaluación (`CSS.escape` en 9 selectores, peso/fecha), Directorio (`data-dedic`). Batería **139 OK/0** (exigente), Electron real **47 OK/0** (4 arranques), **6 reversiones 19 OK/0**. No se tocó `psConfirm`/puente ni F2/F3. Ver `pendientes-abiertos.md` §F1 |
| **P17** — assets sin resolver al hornear | **CERRADO** (17 sept 2026) | `fixVendorScriptPaths` con regex global + función de reemplazo. Ver `pendientes-abiertos.md` §P17 |
| **F3** — sin `setWindowOpenHandler` | **CERRADO** (17 sept 2026) | Política única de apertura y navegación en las 10 ventanas (hija denegada siempre, `http(s)` validado con `new URL` → `shell.openExternal`, `will-navigate` con recarga y `blob:` preservados). Ver `pendientes-abiertos.md` §F2/F3 |
| **F2** — sin CSP | **CERRADO** (17 sept 2026) | CSP **por cabecera** desde `main.js` (`session-created` → `onHeadersReceived`) con cuatro perfiles mínimos; efectiva en las 10 ventanas; sin `unsafe-eval`; red/frames/objects/formularios/`<base>` cortados; lanzador y splash sin `unsafe-inline` en scripts; Worker de pdf.js arrancado por `blob:` (Preparación). `main.js` → `E7D596A8…`. Batería `f2/` **97 OK/0**, Electron real **212 OK/0**, laboratorio **41 OK/0**, 10 reversiones. Ver `pendientes-abiertos.md` §F2/F3 |
| **F4** | **PENDIENTE** | CV nunca cifrados |
| **P1** | **PENDIENTE — aceptado** | Backup duplicado de `startup` tras restaurar |
| **P2** | **CERRADO** (15 sept 2026) | Identidad en los `'closed'` de meeting y candidatos, **provocada en Electron real**: `RA-8`, `map.get(X) === B` sobre los Map reales, con control negativo y con la reversión `I-p2-delete-ciego` dejando el mapa vacío |
| **P3** | **CERRADO** | = B2 |
| **P4** | **ABSORBIDO por A3.3** | |
| **P5** | **ABSORBIDO por A3.3 / A3.1** | |
| **P6** — filas huérfanas al borrar | **CERRADO** | Bloque 5 / D1: cuatro tablas en un commit |
| **P7** — archivo antes que su fila | **CERRADO** | Bloque 4 |
| **P8** — borrados no atómicos | **CERRADO** | Bloque 5 / D1 y D2 |
| **P9** — `location.json` ilegible (BOM y otros) | **CERRADO** (17 sept 2026) · **ALTO / INTEGRIDAD** | Presente pero inutilizable **nunca** equivale a «sin configuración». Un solo lector (`leerConfigUbicacion`: ausente / válido / ilegible / inválido) que acepta UTF-8, UTF-8 con un BOM y UTF-16 con BOM. Lo inutilizable detiene el arranque con **PS-1020** (solo «Cerrar», cero ventanas): ninguna BD abierta, creada ni registrada, la protección de apagado intacta y sin rescate de `app.asar` desde la carpeta por defecto. Solo `main.js` → `2D05E00B…`. `p9/` **282/0**, Electron real **111/0**, 7 reversiones (5 también en Electron). Pendientes separados: instalador ANSI, `.bat`, «datos locales» en PS-1005. Ver `pendientes-abiertos.md` §P9 — implementación. *(Vigente tras P18 Fase 1: `p9/` **298/0**, P9-14 vuelve a discriminar y P9-F vuelve a detectarse; reversiones 29/0.)* |
| **P10** — `%APPDATA%\panorama-app` | **DIAGNÓSTICO CERRADO** (17 sept 2026) · **LIMPIEZA / ARCHIVO DIFERIDO**, sin autorización (primero **P22**) | **634 archivos, 197,68 MB.** No se usa como carpeta de datos desde el 28/08 08:09 UTC (la sesión del incidente de la v0.1.41). Clases: **A** 105 archivos (~11,3 MB): la BD pre-A3.3 con la **misma sal y verificador** que la viva y una contraseña recordada; 102 backups cifrados, 101 sin copia en G:; una preparación; `app.log` como evidencia. **C** ~81,9 MB: `.asar` 0.1.28, 0.1.29 y 0.1.43, y el `localStorage` en claro de 8 proyectos, casi todo con equivalente en G: (2 y 3 continúan en los vivos 11 y 12; una parte mensual del Directorio no tiene equivalente). **B** ~104,5 MB de caché. Sigue siendo destino de los caminos sin `location.json`, PS-1005 y PS-1009, y del rescate PS-1007 (v0.1.28). Herramientas en `pruebas-a33/p10/`. Ver `pendientes-abiertos.md` §P10 |
| **P22** — la carpeta local como destino ambiguo | **CERRADO** (17-18 sept 2026) · era **ALTO / INTEGRIDAD** | **La carpeta de datos local ya no se abre ni se crea sin decirlo.** Una sola puerta antes de la splash, de la protección, del candado, de A3.3 y de `getDb`. La base local se reconoce en **cuatro** estados: ausente (ENOENT), existente (cabecera SQLite), **inválida** (0 bytes o no-SQLite) y no comprobable; las dos últimas **cierran** con PS-1023 sin tocar el archivo. Con base local existente, **confirmación informada** con su fecha y tamaño (PS-1021); **Esc y la X cierran**, nunca eligen lo local. La BD configurada ilegible ya no cae sola: PS-1022. Marca durable `historial-ubicacion.json` (hash de la ruta), que ningún camino de reserva borra y cuyo fallo avisa (PS-1024) sin volver a parecer instalación nueva. Sesión local temporal que no toca la protección de apagado → **cierra P20**. Solo `main.js` → `C4C00809…`. Ver `pendientes-abiertos.md` §P22 |
| **P22** *(diagnóstico previo)* | — | Cuatro caminos legítimos llegaban a la carpeta local y abrían o creaban sin avisar; uno **sin ningún diálogo**. Ver §P22 — diagnóstico |
| **P18** — el rescate PS-1007 y la procedencia de las copias de `app.asar` | **FASE 1 CERRADA** (18 sept 2026, tras la regresión completa) · **FASE 2 ABIERTA / D4** · P18 completo **NO** cerrado · **INTEGRIDAD** | **Fase 1 (solo `main.js`, `486B803F…`):** el rescate automático solo restaura la predecesora de una operación **VERIFICADA** de este equipo (copia local + registro local + `operation_id` + `installation_id`), con confirmación explícita si el asar instalado no cuadra o no se lee. Las heredadas **nunca** son candidatas. «Aplicar parche» prepara P18 **antes** de la copia heredada y purga solo con el ayudante lanzado. **Ojo con la historia:** `9ada9a9` lo declaró cerrado con la evidencia sin rellenar y un **falso verde** (dos `sha256DeArchivo` de módulo); corregido, y la batería ahora lo detecta (P18-S1/S2, reversión J). Evidencia de cierre: Node **3707/0**, 11 comprobadores de reversiones en verde, barrido Electron oficial **22 arneses** en sus cifras. **Fase 2 / D4:** rescate externo cuando Electron no puede cargar el asar, `.bat`, packaging y la purga heredada solo tras VERIFICADA. Ver `pendientes-abiertos.md` §P18 — Cierre de la Fase 1. *Diagnóstico previo:* agrupa **dos** riesgos con la misma raíz: la selección/restauración automática y `Restaurar-backup.bat`. Nada ata una copia a esta instalación, así que ambos eligen **por fecha de nombre**. **Medido:** el `patch-log.txt` de la carpeta compartida registra **106 parches de SEIS instalaciones distintas**; con Drive sin montar restauraría la **v0.1.28** sobre la 2.0.55; una copia **truncada** se copiaría encima sin comprobarla; rescate y purga usan **criterios distintos** (nombre vs mtime). Diseño propuesto: **manifiesto de procedencia local** (`installation-id` + hash del asar anterior **y** del nuevo, estado `verificada`) y **fail-closed**. Fase 1 solo `main.js`; el `.bat` y la entrada inicial del instalador caen en **D4**. Batería `p18/` **63 OK / 0**. **No implementado.** Ver `pendientes-abiertos.md` §P18 — diagnóstico |
| **P18** — `Restaurar-backup.bat` y la carpeta por defecto | **PENDIENTE — INTEGRIDAD** (registrado al cerrar P9) · **es Fase 2 / D4 de P18** | Con `location.json` en una sola línea o en UTF-16, el rescate **manual** elige la carpeta por defecto, donde hay un `app.asar.bak` del 26/08. No se corrige dentro de P9. Ver `pendientes-abiertos.md` §P18–P21 |
| **P19** — instalador y `location.json` en ANSI | **PENDIENTE — verificar antes de release** (D4 / packaging) | Razonado, no medido. Con P9 ya falla cerrado (PS-1020) en vez de cambiar de BD |
| **P20** — PS-1005 «datos locales» y la protección de apagado | **CERRADO dentro de P22** (18 sept 2026) | Una **sesión local temporal** ya no la toca: ni la marca, ni `HKCU\…\Run`, ni la tarea. Volver a la carpeta por defecto **a propósito** sí la sigue sincronizando — es una decisión permanente, no un camino de reserva |
| **P21** — Preparación: cerrar → reabrir → leer otra acta tras F2 | **PENDIENTE — pasada E2E / Preparación** | F2 no se reabre por esto |
| **ARN-1** — `nucleo-a33` da 394 / 395 | **CERRADO** (saneado 18 sept 2026) | Rama «LOCAL, peor caso» igualada a 2 `ok()` en ambas ramas (antes 2/1); la comparación `===` y el límite conocido no se tocaron. 8/8 tiradas en 395 OK / 0 FALLOS. **No es producto**, no se tocó `nucleo.js` |
| **ARN-2** — `bloque1\arranque-real.ps1`/`arranque-con-bd.ps1` con ruta de scratchpad borrado | **CERRADO** (reparado y ejecutado 18 sept 2026) | Repuntados al patrón oficial (`real-run\main.js` + sandbox `%TEMP%` corto). Aislamiento demostrado antes de ejecutar (`bloque1\sonda-aislamiento.js`, barrera ARN-3). Ambos ejecutados con producción intacta; `arranque-con-bd.ps1` reveló un hallazgo nuevo y separado sobre PS-1021/P22 (ver `pendientes-abiertos.md`) |
| **ARN-3** — cambiar `%APPDATA%` no aísla a Electron | **SALVAGUARDA VIGENTE** (18 sept 2026) | Ningún arnés que arranque el asar **empaquetado** vale como aislado solo por variables; hay que demostrar `getPath('appData'/'userData')` dentro del sandbox antes de escribir. Los arneses oficiales no están afectados (cargan el `main.js` del proyecto y hacen `setPath`) |
| **ARN-4** — `RA-1 «el LevelDB CRECE al llamar al flush»` (A2) | **CERRADO** (saneado 18 sept 2026) | `flushStorageData()` sin callback: sondeo acotado (25 ms / tope 500 ms) en vez de una lectura instantánea, exigiendo igual crecimiento estricto (`>`). 5/5 tiradas de `ra1` en 13 OK / 0 FALLOS; la reversión `F-sin-flush` sigue tumbando las 2 aserciones de flush. **No es producto**, no se tocó `main.js` |
| **ARN-5** — la reversión C de P9 (Node) crea `datos\relativa` en el directorio de trabajo | **CERRADO** (saneado 18 sept 2026) | Sandbox `cwd` añadido a los 4 puntos de `test-p9-location.js` que aún tocaban el cwd real. Control 298/0 y reversiones 29/0 sin cambios; `datos\relativa` no reaparece. Residuo verificado y borrado |
| **ARN-6** — captura `6-directorio-ficha.png` de `f1-limpio` a 0 bytes | **CERRADO — no reproduce** (diagnosticado 18 sept 2026; antes ARN-2) | El `.ps1` no tiene ninguna aserción sobre las capturas (listado informativo). 2/2 tiradas hoy: 212 KB las dos veces, 52 OK / 0 FALLOS, custodia intacta. Retirado del criterio |
| **ARN-7** — `bloque1\ver-conbd.js` con contrato pre-P22 | **CERRADO — categoría A** (clasificado y saneado 18 sept 2026) | Esperaba adopción silenciosa de BD legada; P22 exige PS-1021 antes. Adaptado con `bloque1\arranque-con-bd-wrapper.js` (contesta PS-1021 en sandbox). Duda de `parent_commit_id` no nulo: **clasificada como comportamiento correcto** — es el commit anterior real (`db_commit_history[1]`) tras el VACUUM de mantenimiento del arranque (`db.js` bootstrap sí exige `parent=null`, pero solo para el primer commit). `ver-conbd.js` pasó a exigir esa relación con `ok()`; una mutación de control (parent arbitrario) la hace fallar de verdad. 8/8 OK en 2 tiradas, producción intacta |
| **P23** — la protección de apagado acepta referencias a otra instalación | **CERRADO DEFINITIVO** (Block 8A, 18-19 sept 2026) | `syncDriveSyncGuardWithLocation()` lee y compara Run/tarea (normalizado) contra `driveSyncGuardScriptPath()`/`VbsLauncherPath()` de esta instalación cuando el guardián ya está vivo; si no coinciden repara y lanza esta copia (D2), sin tocar el proceso ya vivo. `enableDriveSyncGuardSilently()` partida en `repararPersistenciaDriveSyncGuard`/`lanzarDriveSyncGuardActual`. **Ajuste final:** la inspección de Run/tarea (no el watchdog ni el heartbeat, que siguen a 45s/inmediatos sin cambios) se cachea con `DRIVE_SYNC_GUARD_PERSISTENCE_RECHECK_MS` = 10 min (timestamp simple, sin timer nuevo); el estado `'ausente'` desapareció (confirmado en vivo que `status===1` no distingue "no existe" de "error de sintaxis" — cualquier fallo de lectura cae en `'no-verificable'`, que repara sin lanzar). **Cierre final (19 sept):** el timeout inicial (5000ms) daba un peor caso acumulado de ~10s (dos `execFileSync` SECUENCIALES); corregido a `DRIVE_SYNC_GUARD_INSPECCION_TIMEOUT_MS = 1500` ⇒ peor caso acumulado **3000ms (3s)**, con margen amplio (~10-20x) sobre lo medido real y sin convertir a async (innecesario: cadencia de 10 min ya limita cuánto se paga ese coste). `8a/` **55/0**, reversiones **8 familias, 33/0** (M1-M4 + R1-R4). Regresión P9 298/0, P22 75/0, 8B 25/0, single-instance 11/0. Riesgo residual explícito y NO resuelto: guardián v0.1.60–v0.1.69 con el bug de `WM_QUERYENDSESSION` |
| **Block 8B** — lock multi-PC | **8B-local CERRADO** / **8B-offline sigue ABIERTO → Block 9** (18 sept 2026) | `checkMultiPcLock()` reconoce ahora un lock fresco de esta misma máquina+usuario como residuo de un cierre no limpio (validado: `machine` solo NO basta, un usuario Windows distinto tiene su propio dominio de `requestSingleInstanceLock`). TTL/heartbeat/formato del JSON sin cambios. `b8b/test-b8b-lock.js` 25/0, reversiones 9/0, sonda de mecanismo 11/0. El caso PC-A offline + PC-B real sigue sin cubrir |
| **P24** — `projects:create` con importación fallida dejaba la partición huérfana | **CERRADO** (19 sept 2026, nace del diagnóstico 8D/P16) | Antes: `DELETE` directo sin journal al fallar `seedNewProjectStorage()`, partición huérfana para siempre (reproducido en Electron real). Ahora: mismo protocolo que cualquier borrado (`ejecutarBorrado`, `tipo:'rollback-creacion-proyecto'`, nunca mezclado con `'borrar-proyecto'`); F-1 ocupado (3 reintentos × 300ms) o journal no escribible ⇒ la fila NO se toca (ella misma es la referencia durable). Ruta física por `app.getPath('sessionData')` a mano — **corregido durante la implementación**: `session.fromPartition(...).getStoragePath()` parecía la vía "correcta" pero, medido dos veces en sandbox, esa sola llamada basta para bloquear el `rmSync` siguiente incluso en un arranque nuevo. Bug lateral corregido de paso: `leerJournalBorrado()` rechazaba `recursos:[]` legítimos (ya existía el mismo riesgo, sin disparar, en `purgar-backups`). **Inspección final (19 sept):** `sinRecursos:true` acotado por contrato (`BORRADOS_TIPOS_SIN_RECURSOS` = purgar-backups, borrar-prep, rollback-creacion-proyecto; `borrar-proyecto` NO) tras detectar que valía para cualquier tipo; convergencia demostrada en el arranque real (proceso nuevo, observadores pasivos: ninguna sesión toca la partición, `rmSync` ok, journal cae después). Hallazgos NO corregidos: en la misma sesión F-1 bloquea `backup:save`/`projects:delete` hasta reiniciar (medido) — **lo resuelve P26**; si la purga falla en el arranque, PS-2006 cierra la app (razonado; **medido después con un EBUSY real en P26-D**). Batería real-Electron 62/0, reversiones 7 familias 22/0. Regresión: Bloques 3/4/5 y A2 verdes, C1 165/0 (una aserción estática actualizada con nota); P9/P22/8A/8B no se repiten (el diff no toca esos dominios). Distinto de C1-B (huérfanos históricos, diferido) y P16 (arquitectura, Block 9) |
| **P25** — `writeLocalStorageDumpToPartition()` no cierra `helperWin` si `loadFile()` rechaza | **ABIERTO — bajo** (19 sept 2026, encontrado al implementar P24) | El `.catch(reject)` final no llama a `helperWin.close()`, a diferencia de las otras dos ramas de esa misma función. Afecta a sus cuatro llamadores (creación con import, restauración de backups), no solo a P24. Deliberadamente sin corregir esta ronda, diff separado |
| **P26** — `rollback-creacion-proyecto` en purga pendiente bloqueaba F-1 global hasta reinicio | **CERRADO** (19 sept 2026, con P27) | Diagnóstico medido: el bloqueo protegía la prueba de recuperación (marca de 8 acciones), no un riesgo transaccional; relajar F-1 solo dejaba un huérfano silencioso con el 8.º guardado. **Implementado E1** (solo `main.js`): predicado único `purgaP24Desligada(j)` (propio, `rollback-creacion-proyecto`, `purgando`, `sinRecursos`, sin recursos, `persist:proj-…`, y la BD demuestra que ninguna fila usa la carpeta; cualquier duda ⇒ `false`), usado por `f1Borrados()` (no lo cuenta como pendiente) y por `resolverBorradoPendiente()` (purga **sin consultar la marca**, ni siquiera ilegible). `borrar-proyecto`/`borrar-prep`/`purgar-backups`/acciones/restauraciones **sin cambios**. Batería `p26/` real-Electron **151 OK/0**, reversiones R1–R9 **28 OK/0**, ARN-3 comprobado en cada proceso. La condición pendiente (fila reaparecida + marca con el id) la cerró P27 (`P26-FR10`). No reabre P24; separado de P25. Ver §P26 |
| **P27** — la recuperación histórica (CASO B) purgaba la carpeta de una partición referenciada por una fila viva | **CERRADO** (19 sept 2026) | Medido antes de tocar nada (centinela): marca con el id + fila reaparecida (mismo id u otro) ⇒ `rmSync` destruía la carpeta viva; consulta a la BD fallando ⇒ purgaba igual. **Guarda** en `vaciarParticionDe` (rama `rollback-creacion-proyecto`), inmediatamente antes del `rmSync`, sin `await`: `referenciada` ⇒ no `rmSync`/`clearStorageData`, `Aviso — P27` y journal **retirado** (política B: la premisa del contrato queda refutada por la BD; sin recursos —`finalizarPurga` vacía la cuarentena antes—, sin SQL, no reinterpretable, mismo desenlace que el CASO A con la marca agotada); `no-demostrable` ⇒ no se destruye y el journal **se conserva** (fail-closed, converge con la BD sana). Helper `particionUsadaPorFila` compartido con el predicado de P26. Otros tipos sin cambios. Batería **84 OK/0**, reversiones R1–R8 **25 OK/0**. Regresión: P26 151/0 + 28/0, P24 62/0 + 22/0, Bloque 5 80/0 + 58/0, C1 165/0. **Observaciones sin corregir:** (1) `borrar-proyecto` llama a `clearStorageData()` sin consultar filas (razonado); (2) **medido:** un journal con `particion:"persist:..\\x"` hace `rmSync` fuera de `Partitions/` (necesita un journal manipulado; la vía especial de P26 sí valida la forma). Ver §P27 en `pendientes-abiertos.md` |
| **P11** — UX «consola F12» | **PENDIENTE** | |

---

## 2. DECISIONES ARQUITECTÓNICAS ASENTADAS

**No reabrir ninguna sin una regresión concreta y demostrada.** Cada una costó
una ronda de diseño, implementación y batería.

1. **Contrato de acción de tres formas.** Todo canal mutante devuelve
   `{ok, aplicado, verificado, reintentable, requiereReinicio, aviso}`.
   Se decide **siempre por `aplicado`**, nunca por truthiness ni por `ok`.
2. **Forma 3** (`aplicado:true / verificado:false`) significa que la operación
   **SÍ ocurrió**: no se deshace, **no se reintenta**, y la sesión pide reinicio.
3. **F-1 GLOBAL.** Un journal propio pendiente ⇒ ninguna operación propia nueva
   empieza. Mira los tres conjuntos: acciones, borrados y restauraciones.
4. **Dominio de ocupación común.** `.panorama-acciones`, `.panorama-borrados` y
   `.panorama-restauraciones` no son tres mundos: una sola pregunta de
   ocupación los mira todos. La relación es **simétrica** (un subárbol también
   colisiona con algo reservado dentro de él).
5. **NO-CLOBBER.** Antes de reponer nada, comprobar **inmediatamente antes** que
   el destino sigue siendo el esperado. Nunca confiar en que el sistema de
   archivos falle.
6. **prepare → publish/apply → confirm.** Nada destructivo antes del journal
   durable; nada irreversible antes del commit de confirmación.
7. **Confirmación = marca de `action_id` + `exigirCommitBase`**, en UNA sola
   `escribirMultiple`, aunque no haya otro DML funcional (caso del restore).
8. **La base se captura DESPUÉS del quiesce.** Cerrar ventanas mueve el commit
   (guardado final, bounds). Una base capturada antes llega inválida.
9. **Journals durables + recuperación al arrancar**, con **validación cerrada**:
   un JSON parseable pero incompleto **no es evidencia**. Evidencia incompleta
   ≠ estado ausente → fail-closed, sin limpiar ni reponer a ciegas.
10. **Rutas puras durante la preparación**: nada de `ensureProjectBackupDirSlug()`,
    `mkdirSync` incidental ni `dbmod.run()` antes de capturar la base.
11. **El rekey no empieza con material de restauración pendiente.** Es una
    **precondición de exclusión**, no una ampliación de `collectRekeyInventory`.
12. **Restore y delete son mutuamente excluyentes por proyecto**, en ambos
    sentidos.
13. **Ninguna operación destructiva sobre la BD viva.** Todo en sandbox; hash
    antes/después.

---

## 3. BLOQUES A3.3 — CERRADOS

| Bloque | Qué resolvió | Pruebas | Incidencias | Estado |
|---|---|---|---|---|
| **1 — `db.js`** | Identidad de commit (`db_commit_id`, padre, historial de 20, `db_generation`), `.gen`, escritura atómica con fsync, latches, `escribirMultiple` | `bloque1/test-db-integrado.js` **394** | — | CERRADO |
| **2 — wiring `main.js`** | Cableado de A3.3 al arranque, política de ubicación, registro de ubicaciones | `bloque2/test-wiring.js` **222** | `main.js` convertido a CRLF por un `WriteAllLines`; revertido | CERRADO |
| **3 — Seguridad / A1** | Exclusiva de operación, `exigirCommitBase`, barrera de cifrado no dependiente de `securityKey`, rollback por hash | `bloque3/test-primitivas.js` **75**, `test-seguridad.js` **223**, `test-error-codes.js` **44** | Defecto real A1: `swapped.push` tras ambos renames dejaba el archivo del usuario ausente si el 2.º fallaba | CERRADO |
| **4 — archivo + BD / IPC** | `ejecutarAccionDeArchivo`, journal de acción, marca por escritor, contrato de tres formas en 4 canales + preload + renderers | `bloque4/test-acciones.js` **243**, `test-consumidores.js` **168** | `task-guide` mal clasificada como solo lectura; Enter del nombre de puesto esquivaba la guarda | CERRADO |
| **5 — borrados destructivos** | D1 `deleteProjectById`, D2 `meeting:deletePrep`, D3 purga, D4a/D4b CV. Cuarentena → un commit → purga. NO-CLOBBER. Ocupación común real | `bloque5/test-borrados.js` **80**, `test-cableado.js` **58**, Electron real **71**, CV **17**, CV-RM-F3-RETURN **12** | Ocupación no simétrica (DEL-X1 pasaba de largo); F-1 ignoraba journal de borrado ilegible; §4.9 necesitaba las DOS mitades (`saveState` propaga **y** `doSaveNow` devuelve) | **CERRADO**, con Electron real |

**Bloque 5 en detalle:** D1–D4 cerrados y verificados con `BrowserWindow` real
(E1–E7 + los dos casos de CV + `CV-RM-F3-RETURN`). **P6 y P8 quedaron cerrados
por este bloque.** Medición clave: en `G:` el `rename` sobre un destino
recreado **no falla, lo reemplaza** — al revés que NTFS. De ahí NO-CLOBBER.

---

## 4. A2 RESTORE — ESTADO EXACTO

### 4.1 Qué se encontró (inventario, `a2-restore-bajo-a33.md` §1–§2)

- **R1** El restore podía empezar con un commit: `readBackupPayload` →
  `backupsDirForProject` → `ensureProjectBackupDirSlug` hace `UPDATE` con
  `backup_dir = NULL`, **antes** de tomar ningún bloqueo.
- **R2** `restoreInProgress` lo miraban **dos** sitios. Reunión, candidatos, CV,
  borrado de prep, borrado de proyecto y purga seguían operando.
- **R3** Quiesce parcial: solo se cerraba la ventana del dashboard.
- **R4** `backup:restore` no tenía **ninguna** guarda.
- **R5** Sin base capturada, sin `exigirCommitBase`, sin journal.
- **R7** *(crítico)* **Corte durante el restore: cero recuperación.**
- **R9** *(crítico)* **La foto previa vivía solo en RAM.**
- **R10** *(crítico)* **La copia de rescate quedaba huérfana ante un rekey**:
  cifrada con la clave vigente pero sin fila, así que `collectRekeyInventory`
  no la ve y un cambio de contraseña la deja ilegible para siempre.
- **R8** Sin contrato: devolvía `true` y el lanzador ponía «Backup restaurado»
  sin mirar nada.

### 4.2 Protocolo actual (implementado)

```
R-2 armar barrera de proyecto   (ANTES de tocar ninguna ventana)
R-1 guardas del canal + F-1 GLOBAL
R0  quiesce de las TRES familias, con marca "por restauración"
R1  capturar: base DESPUÉS del quiesce, rutas puras, backup + hash
R2  previo.enc durable y CIFRADO + relectura + hash
R3  journal durable, validación cerrada
R4  aplicar (clear + setItem)
R5  confirmar: UNA escribirMultiple con marca + exigirCommitBase
R6  cleanup del material
R7  liberar barrera y reabrir
```

Material bajo `.panorama-restauraciones/<action_id>/` → `journal.json`,
`previo.enc`. Clasificación NO-CLOBBER del estado de la partición:
`previo` / `aplicado` / `parcial` (subconjunto exacto de lo aplicado) / `ajeno`
→ solo los tres primeros permiten reponer.

### 4.3 Qué está hecho y verde

- **Helper aislado**: `a2/test-restauraciones.js` → **66 OK / 0**. A1–A15,
  15 journals inválidos fail-closed, REST-NO-CLOBBER sobre la función real,
  REST-QUIESCE-BASE, REST-REKEY-1..4, REST-COL-1/2/3. Cinco reversiones
  (`a2/revertir.js`) demuestran que cada defensa es necesaria.
- **Integración productiva**: `a2/test-cableado.js` → **53 OK / 0**. A1–A15 sobre
  el código real + `REST-PROD-QUIESCE`, `NO-STALE`, `PARTIAL`, `FORM3`,
  `STARTUP`, `REKEY` (1–4), `LEGACY-SLUG`, `COLLISIONS` (1–3), `CONTRACT`.
- **Barrera unificada**: `proyectoBloqueadoParaMutar(projectId)`, una sola
  función, en `backup:save`, las tres de meeting, `candidateEval:save`,
  `pickCv`/`removeCv`, `deleteProjectById` y `openProjectWindow`.
  `restoreInProgress` queda como alias de `proyectosEnRestauracion`.
- **P2 corregido en código**: identidad en los `'closed'` de meeting y candidatos.
- **Rutas puras**: `readBackupPayload(row, bkRow, {puro:true})` y `saveRescueDump`.
- **Startup recovery**: `recuperarRestauracionesPendientes()`, la **cuarta**,
  tras rekey → acciones → borrados, y antes de vacuum/login/launcher.
- **Rekey**: `rekeyPuedeEmpezar()` antes de tomar la exclusiva.
- **localStorage real**: la integración ejecuta
  `readLocalStorageDumpFromPartition` y `writeLocalStorageDumpToPartition`
  reales, con su script de `clear()`+`setItem`, contra un `localStorage` de
  verdad y con corte inyectable entre claves.

### 4.4 Fallo encontrado en la primera pasada del cableado

**A14.** Una ventana que no confirmaba su cierre se borraba del mapa y el
restore **seguía adelante**: habría reescrito el `localStorage` por debajo de
una ventana viva. Era la protección que el A2 original tenía con su `reject` a
los 8 s y que el cableado había perdido al reutilizar el
`cerrarVentanasDeProyecto` tolerante de D1.

**Corrección:** la función devuelve `{cerradas, noConfirmadas}`, el tope
resuelve a `false` (no es una confirmación) y la ventana no confirmada **se
devuelve al mapa** (borrarla es el patrón de P2). El restore aborta con
`quiesce-incompleto`. D1 conserva su comportamiento tolerante, ya probado.

### 4.4bis Ronda `REST-ROLLBACK-FLUSH` (15 sept 2026)

El hallazgo abierto de `a2-restore-bajo-a33.md` §9.6 quedó **implementado**:
`reponerParticionDesdePrevio()` relee la partición y llama a
`flushStorageData()` **antes** de que nadie limpie el material, y solo entonces
declara `'repuesto'`. Orden exigido: **write PRE → relectura → flush → cleanup**.
Pruebas `REST-ROLLBACK-FLUSH-1/2/5` + la de relectura; reversiones
`G-sin-flush-rollback` y `H-sin-relectura`.

### 4.4ter Ronda H-1 — defecto REAL encontrado por la batería (15 sept 2026)

`REST-ROLLBACK-FLUSH-2` observó que, con el flush de la **reposición** fallando,
el material se conservaba correctamente y **aun así se aceptaba un `backup:save`
nuevo del mismo proyecto**. Dos causas independientes:

1. **`armado` tenía la semántica invertida respecto a su uso.** Los caminos
   fail-closed hacían `armado = true` para *conservar* la barrera, pero
   `desarmarSiProcede()` leía `true` como «hay que quitarla» y el `finally` la
   llamaba siempre. Ponerlo a `true` era la **garantía** de que se soltaba.
2. **`f1Global()` no miraba `.panorama-restauraciones`.** Tras un reinicio el Set
   en memoria está vacío y el journal era la única evidencia; nadie la
   consultaba en el camino de las mutaciones.

**Corregido en dos capas**, y probado por separado:

- **memoria**: `barreraPuesta` + `mantenerBarrera` (nombres que dicen lo que
  hacen) y un Set aparte `restauracionesSinResolver`, para que el motivo sea
  `restauracion-sin-resolver` y el rechazo **no** se anuncie reintentable —un
  restore en curso sí se puede reintentar; uno sin resolver, no—;
- **durable**: `restauracionPendienteDeProyecto()`, por proyecto, con la **fase
  del journal** como criterio (`'aplicando'` = no resuelto; `'limpiando'` = ya
  resuelto). Lo que **no se puede interpretar** bloquea a todos y cierra también
  `f1Global()`.

Pruebas `H1-1..H1-4b` (+33) y reversiones `J-barrera-se-suelta` (1 fallo) y
`K-sin-f1-durable` (10 fallos). Detalle en `a2-restore-bajo-a33.md` **§10**.

### 4.5 **A2 — CERRADO (15 sept 2026)**

**Evidencia de cierre, contra `main.js = DB75E6C2…`:** automatizado
**1745 OK / 0** en doce baterías; **Electron real 66 OK / 0** en los nueve modos
`RA-1..RA-9` **en una sola tirada**, incluidos `RA-7/RA-7b` (corte duro tras la
reposición y su cleanup), `RA-8` (P2 real) y `RA-9` (**PS-2006 real**: diálogo
correcto, código en el `detail`, el lanzador no abre, material intacto, app en
camino de cierre); **siete reversiones** que tumban exactamente lo suyo, dos de
ellas comprobadas en Electron real. BD viva idéntica por SHA-256 en cada ronda.

**Lo que sigue fuera, y hay que seguir diciéndolo:** cuotas de `localStorage`,
un corte de corriente real (`TerminateProcess` no lo es), Drive con dos PCs, y
el fallo del flush de la reposición **en Electron real** —H1-1 lo inyecta en el
doble de `session`; lo que sí se ejercitó en vivo es el corte duro posterior.

### 4.5bis Lo que decía esta sección antes del cierre

**Estado al 15 sept 2026, ronda posterior al cableado — HECHO, pendiente de que
el usuario lo revise:**

> **Barrera durable de `localStorage`: `session.flushStorageData()` dentro del
> `try` de R4, tras aplicar y antes del commit de confirmación.** IMPLEMENTADA.
>
> `REST-FLUSH-1..5`: **19 aserciones, todas verdes** dentro de
> `a2/test-cableado.js` (que pasa de 53 a **72 OK/0**). La reversión
> `a2/revertir-main.js → F-sin-flush` tumba **9** de ellas y deja el resto
> intacto, así que no pasan por casualidad.
>
> `flushStorageData()` medido en Electron real: devuelve **`undefined`, no una
> promesa**; cuesta ~0,04 ms; pone el dato en `…\leveldb\000003.log` antes de
> retornar (5/5), frente a los **~103 ms** que tarda en llegar solo.
>
> **Diferencial que justifica el cambio** (`a2/electron-flush-diff.ps1`): matar
> el proceso con `TerminateProcess` justo tras el commit → **con barrera 4/4
> coherente; sin barrera 0/4** (la marca dice «aplicado» y la partición conserva
> el estado anterior, con la foto previa ya limpiada). Detalle en
> `a2-restore-bajo-a33.md` **§9**.

**Pruebas Electron reales de A2: HECHAS.** `real-run/a2.js` +
`a2/electron-real.ps1`, seis modos, **40 OK / 0 FALLOS**. Los siete puntos de
`a2-restore-bajo-a33.md` §8.1 quedan cubiertos (tabla en §9.5).

**Lo que sigue fuera, y hay que seguir diciéndolo:** el diálogo PS-2006 por el
camino *no demostrable* con la app cerrándose de verdad, las cuotas de
`localStorage`, un corte de corriente real, y Drive con dos PCs. Más el
hallazgo abierto de §9.6 (`reponerParticionDesdePrevio` sin flush, a propósito).

---

## 13. E1 — CERRADO RETIRANDO LOS CONTROLES (15 sept 2026)

### 13.1 Qué se hizo, y qué NO

**Hecho:** fuera el conmutador `#view-switch` y sus tres botones de
`launcher/index.html`. Era el **único** acceso del usuario a esas vistas —no hay
menú, ni atajo, ni nada en `main.js` que llame a `setView()`—, así que basta con
eso. **Un solo archivo productivo tocado.**

**NO hecho, por decisión explícita del usuario:** terminar las vistas.
**Lista y Portfolio Summary están RETIRADAS DE LA UI, no completadas.** Sigue
presente y sin tocar todo su código interno parcial: el handler
`portfolio:summary`, `portfolioSummary()` del preload, `computeStaffingRatio()`,
`setView()`, `staffingPill`/`serviceEndPill`/`timelineBarSVG`, el CSS de las dos
vistas y su markup oculto. **La limpieza del código muerto no es parte de esta
corrección.**

**Reactivarlas exige dos cosas, y en este orden:** resolver el acoplamiento con
**E2** —el `timeline` de `portfolio:summary` saca los días con una regex sobre
`serviceEndMessage`, que es texto de UI de `computeServiceEndWarning()`— y
después terminar el lado cliente (listener, `renderList()`, `loadSummary()`,
rellenar `allProjects`, y unificar quién manda sobre `#empty`, que hoy se
disputan `refresh()` y `setView()`). El markup retirado queda comentado en su
sitio con esa advertencia escrita.

### 13.2 Evidencia

- `e1/test-inventario-e1.js` → **47 OK / 0**. Estática + `setView()` **ejecutada**
  contra un DOM doble + comprobación **por hash** de que ningún otro archivo
  productivo cambió desde el cierre de A2.
- `e1/electron-e1.ps1` (lanzador **real**) → **21 OK / 0**: conmutador ausente
  del DOM, cero elementos `data-view`, única vista visible la de tarjetas, y
  crear tres proyectos, refrescar, reordenar por `projects:reorder` y abrir un
  proyecto siguen funcionando. **Cero errores de renderer en el lanzador.**
- Regresión completa **1745 OK / 0**, idéntica a la de antes de tocar nada.
- BD viva idéntica por SHA-256; archivos productivos intactos durante las pruebas.

### 13.3 Hallazgo incidental: P12

El arranque real destapó 6 errores de renderer en el dashboard de un proyecto
recién creado. **No lo causa E1 ni ninguna ronda.** Diagnosticado a fondo
después: ver **§14**.

---

## 20. C1 — RESIDUOS: C1-A CERRADO, C1-B ABIERTO / DIFERIDO (16 sept 2026)

Dos rondas el mismo día: diagnóstico (cero cambios) y, con su resultado
aceptado, **C1-A** (cortar fuentes activas + observabilidad). La limpieza de lo
histórico, **C1-B**, NO se ha empezado. Detalle y clasificación A/B/C/D en
`pendientes-abiertos.md` §C1.

### 20.0 C1-A — CERRADO

- **Inventario de residuos al arrancar** (`inventarioDeResiduos` /
  `registrarInventarioDeResiduos`, tras la migración y antes del lanzador):
  **leer → clasificar → una línea en `app.log`**. No borra, no mueve, no crea
  carpetas, no escribe en la BD. Solo nombres, listados y consultas; de
  `Partitions` solo el primer nivel; el único contenido que abre es
  `estado.json`, y solo donde hay CV. **Medido sobre producción en solo
  lectura:** `backupsSinFila=117 [anteriores=112 intercalados=5]`,
  `cvNoDecidibles=5`, `carpetasSinProyecto=2`, `particionesSinProyecto=7`,
  `filasSinProyecto=1`, `sondas=1`, en **23–55 ms** sobre G:
  (48 listados y 1 lectura por arranque).
- **Defecto encontrado AL MEDIR EN VIVO y corregido en la misma ronda:** el
  inventario no situaba los nombres antiguos (`backup_<sello>Z.json`, sin
  sufijo): daba `sinPosicion=117`. Regresión `C1-A1f` + reversión
  `X-sello-estricto`.
- **CV:** «Eliminar evaluación» e «Importar» retiran el archivo **solo** con
  `aplicado:true + verificado:true`; no aplicado → vuelve el estado anterior;
  `verificado:false` → el CV se conserva. Mismo contrato que «Quitar CV».
- **Mensajes:** el rekey y la precondición de restauración ya no prometen «se
  resuelve sola»; el aviso de arranque PS-2004 tiene rama propia para la
  carpeta **sin registro**. El fail-closed **no** se ha relajado.
- **No se ha tocado:** `db.js`, ningún residuo real, P10, P14, P15, P16, F1,
  D4. Los diálogos PS-2006 de acciones y borrados siguen como estaban: hablan
  de journals que **sí** existen y su promesa es condicional.

### 20.0bis C1-B — ABIERTO / DIFERIDO

Retirar los 117 backups, las 7 particiones y el resto de clases C **no está
autorizado**. Motivo: con varios equipos y Drive, todavía no se puede
demostrar que un archivo sin referencia local no vaya a recibir después su
fila desde otro equipo (el otro publica el archivo en F3 y confirma la fila en
F4). Los 5 intercalados son la prueba de que «sin fila» puede ser «dato
perdido». Si algún día se hace: acción **explícita y reversible**, con la
cuarentena del Bloque 5; nunca al arrancar.

### 20.1 Lo que conviene saber antes de tocar nada

- **Los datos reales los escribe la v2.0.55 instalada, anterior a A3.3.** La BD
  viva no tiene `db_commit_id`, no hay `.gen` ni `.panorama-*`. Lo que A3.3
  cerró sigue vivo **en producción** hasta la publicación.
- **117 backups sin fila, 39,67 MB** — no ~80. 112 son restos de purga; **5
  son intercalados** (filas perdidas entre equipos, 1 sept, v0.1.62). Uno está
  **en claro**.
- **Particiones de proyectos borrados:** 7 en vivo (72 MB). Medido en Electron
  real con el código auditado: la carpeta **sobrevive** al borrado y al
  reinicio (~1,9 MB por proyecto). Mecanismo activo.
- **CV:** «Eliminar evaluación» e «Importar» dejaban el archivo (**cortado en
  C1-A**). Los 5 reales no se pueden clasificar sin la clave.
- **Los huérfanos escapan del rekey** (en claro tras activar, ilegibles tras
  cambiar la contraseña).
- **Restos de corte que impiden arrancar:** `.panorama-rekey` o
  `.panorama-restauraciones/<id>` sin journal, **aunque estén vacías**.
- **P10 NO es C1:** es la carpeta de datos por defecto y de reserva (PS-1005).
  197,68 MB, con su propia BD y sus propios backups con fila.
- **442 `desktop.ini`** creados hoy a las 06:15 UTC por algo ajeno a la app.
- **523 MB de Service Worker** de un origen https en una partición **viva**:
  hallazgo aparte → **P16**.

### 20.2 Dos defectos demostrados en el diagnóstico — CORREGIDOS en C1-A

1. **Documental:** el «contar y registrar al arrancar» de los Bloques 4 y 5 **no
   se había implementado** (`C1-D1..D4`). Ya existe.
2. **Mensaje:** con `.panorama-rekey` sin journal, el cambio de contraseña decía
   «al arrancar se resuelve sola» y el arranque **se cierra** (`C1-E9a..d`). Ya
   no lo promete (`C1-A9`).

### 20.3 Lo que NO hay que hacer

El arreglo de la auditoría («borrar los `backup_*` sin fila») **es inseguro**:
borra intercalados, no ve CV ni particiones, y en carpeta compartida la fila
puede llegar después que el archivo (`C1-R1..R6`).

### 20.4 Evidencia

- `c1/test-c1-residuos.js` **165 OK / 0** (era 122 en el diagnóstico: +43 de
  `C1-A`, y cinco aserciones descriptivas **invertidas** con nota).
- `c1/electron-c1.ps1` **31 OK / 0** (app real, cuatro arranques: partición,
  línea de inventario en cada arranque, «Eliminar evaluación» con clic real y
  con `verificado:false` forzado en el IPC).
- **Siete reversiones** (`c1/revertir-c1.js` + `c1/comprobar-reversiones-c1.js`):
  sin llamada, sin log, sello estricto, CV antes de verificar (×2), mensaje falso
  (×2). Todas rompen **solo** lo que deshacen.
- `c1/medir-inventario-vivo.js`: el inventario real sobre G: con `fs` y `dbmod`
  que **lanzan** ante cualquier escritura. `c1/inventario-vivo.js`: el del
  diagnóstico.
- Regresión: núcleo **1745/0**, E1 47, P12 73, E2 67, B1 77, B3 85, B4 144,
  B5 68. **Electron real, los once arneses reejecutados:** A2 66, Bloque5 71,
  CV 12, E1 21, P12 32, E2 42, B1 24, B3 36, B4 17, B5 24, **C1 31** — todos a
  0 fallos. BD viva `D5C3FF53…` idéntica en todas las ejecuciones.

## 19. B5 — CERRADO: UN ENVÍO EN CURSO NO SE REPITE (16 sept 2026)

### 19.1 El defecto, medido antes y después

`doSubmit()` ponía `btnSubmit.disabled = true`, pero **solo lo respetaba el
botón**: un botón deshabilitado no dispara `click`, mientras que el listener
global `keydown → Enter` llamaba a `doSubmit()` directamente, sin pasar por él.

**La corrección es una línea, exactamente la que proponía la auditoría:**
`if (els.btnSubmit.disabled) return;` al principio de `doSubmit()`.

Medido ejecutando el renderer productivo sobre un DOM doble y **contando IPC**:

| gesto | antes | ahora |
|---|---|---|
| un Enter | 1 | **1** |
| dos Enter | **2** | **1** |
| cinco Enter | **5** (sin tope) | **1** |
| click + Enter | **2** | **1** |
| doble click | 1 | **1** — nunca estuvo roto |
| formulario inválido | 0 | **0**, y el botón no se queda bloqueado |

Y en los **cuatro modos** (`login`, `setup`, `change`, `disable`): tres Enter,
una sola solicitud.

**No es un cerrojo permanente** (`B5-7`): cuando el intento termina con error, la
rama de error rehabilita el botón y un envío posterior vuelve a ejecutarse.

### 19.2 Pero las capas inferiores lo contienen

**El camino entero es SÍNCRONO:** `rekeyAllUserFiles` son 384 líneas con **0
`await`**, sin `setTimeout` ni promesas; `deriveKey` usa `scryptSync`; y el
handler, aunque esté declarado `async`, tampoco tiene ningún `await`. El
proceso principal **bloquea su bucle de eventos**, así que un segundo
`security-win:submit` no puede empezar hasta que el primero ha terminado.

**Confirmado en la app real** con un espía sobre `ipcMain.handle`: los envíos
llegan de verdad (2 y 3), y **ninguno se solapa** — se serializan.

Por debajo hay además cuatro guardas que no dependen de eso: `rekeyInProgress`,
la exclusiva de operación de `db.js`, `bloqueoDeSeguridad()` y
`rekeyPuedeEmpezar()`; más el journal v2 y la consolidación anclada de A1.

### 19.3 La defensa inferior sigue custodiada, con IPC DIRECTOS

Que el renderer ya no genere envíos duplicados no puede hacer que se deje de
comprobar lo de abajo. El arnés real **se salta `doSubmit()` a propósito** y
llama dos veces seguidas a `securityWinAPI.submit()`. Medido:

- llegan **dos** entradas al handler → confirma que la guarda es del renderer
- **no se solapan**: main las serializa
- la segunda se **rechaza**; no hay doble rekey
- la contraseña final es la del **primer** envío, no una indeterminada
- ningún archivo queda con clave intermedia: todos cifrados, los mismos
- el re-cifrado se registra **una** vez, y no queda carpeta de trabajo sin resolver

### 19.4 Lo que NO se ha tocado

Ni `main.js`, ni `db.js`, ni `index.html`. Ni spinner, ni cambio de texto, ni
bloqueo de campos, ni el comportamiento de Cancelar/Escape — que sigue
disponible durante la operación. Es peculiar, pero **no forma parte del defecto
demostrado**, y ninguna prueba enseña corrupción por ello.

Que no haya indicador de progreso sigue siendo una mejora de UX **posible y no
hecha**: B5 consistía en impedir el reenvío, y eso está.

### 19.5 Evidencia

`b5/test-b5-reentrancia.js` **68 OK/0**, `b5/electron-b5.ps1` **24 OK/0**.
**Una reversión** (`T-sin-guarda`) que quita exclusivamente la línea nueva y
hace que la batería vuelva a medir los números originales: **2 Enter → 2 IPC,
5 Enter → 5 IPC, click + Enter → 2 IPC**.

**Un solo archivo productivo:** `security-window/renderer.js`
(`190191B2…` → `4549911C8D814DAD…`, 6220 B).

### 19.6 Ampliación de P15 salida de aquí

El diagnóstico midió que el `Detalle:` de un PS-2003 **muestra la ruta completa
al usuario**, no solo a `app.log`. P15 queda ampliado con eso y con la
advertencia de que aplicar `motivoSinRutas()` en bloque a los PS sería
precisamente lo que no hay que hacer sin decidir antes qué detalle necesitan
recovery y soporte.

---

## 18. B4 — CERRADO: LA PERSISTENCIA, Y EL ÚLTIMO PATRÓN DE APLICACIÓN PARCIAL

### 18.1 El cierre elimina una contradicción entre documentos

La auditoría decía «CERRADO en su mitad de `db.js`; PENDIENTE en la de
`backup:save`». Este handoff decía que las dos estaban cerradas. **Ninguna de
las dos afirmaciones tenía batería.** Ahora sí, y se cierra en tres partes:

| | Estado | Por qué |
|---|---|---|
| **A.** `db.js` / `persist()` | **CERRADA por A3.3** | `persist()` y `markDirtyAndPersist()` no existen; los absorbió `aplicarYConfirmar()` |
| **B.** `backup:save` | **CERRADA por el Bloque 4** | archivo + fila en **una** acción anclada, con journal y vuelta atrás por hash |
| **C.** patrón residual | **CERRADO aquí** | `projects:reorder` con N commits → una sola mutación |

### 18.2 Lo que el diagnóstico demostró de A3.3 (y que NO se ha tocado)

Inyectando fallos reales de `fs` acotados al sandbox, más un caso no inyectado
(borrar la carpeta de datos con la app abierta):

| Escenario | `aplicado` | memoria vs disco | `.sqlite3` |
|---|---|---|---|
| no se puede abrir el temporal | `false` | **iguales** | íntegro, commit anterior |
| escritura cortada a mitad | `false` | **iguales** | íntegro; lo truncado queda en `.tmp-fallido-` |
| falla el rename (publicación) | `false` | **iguales** | íntegro; el `.gen` adelantado se clasifica `reparar-gen` |
| la carpeta desaparece | `false`, `noVerificable` | **iguales** | corta antes de mutar |

**La memoria no queda por delante del disco.** El único camino que lo
permitiría —que falle también la restauración— levanta el latch
`desincronizada`, que es **irreversible**: la sesión queda bloqueada en cerrado,
no funcionando a medias.

### 18.3 El único defecto vigente, y su corrección

`projects:reorder` hacía un `dbmod.run()` por fila. Cortando la publicación a
mitad, el archivo quedaba con `sort_order = [null,null,null,null,0]`.

Ahora: **una** `escribirMultiple` anclada al commit sobre el que se calculó el
orden. Medido en vivo: **un reordenado de 5 proyectos = UNA publicación**, no
cinco. Sin journal (no hay archivos que emparejar). Con validación de entrada
—un id no entero se volvía `NaN` y ese proyecto se quedaba sin orden mientras
los demás sí se movían—. Y con **una** línea en `app.log` si falla: operación,
cuántos proyectos, clase del error y motivo saneado; sin la lista y sin rutas.

El error **se propaga**: el renderer engancha su aviso al `catch` y no mira el
valor devuelto.

### 18.4 Lo que queda documentado y NO se toca

`updated_at` al abrir, `backup_dir` en dos commits, `projects:create`
horneando el HTML después de la fila (**se autorrepara**), el rollback
`DELETE FROM projects` que puede enmascarar el error original (sin escenario
que demuestre daño adicional), y la **validación de entrada** de `reorder`
devolviendo `{ok:false}` que el renderer no mira.

> Ojo con esa última: se refiere SOLO a los rechazos de validación (id
> inválido, repetido, lista vacía), que son anteriores a B4. **El camino de
> fallo de `projects:reorder` propaga la excepción** y el renderer sí lo ve —
> demostrado en `B4-R2a` y, en la app real, en `B4-RE2a`.

Detalle en `pendientes-abiertos.md` §B4.

**Limitación anotada:** no hay `fsync` del directorio tras el rename; en
Windows/Node no existe una garantía portable equivalente. No se intenta nada
experimental. **Residuos `.tmp`:** no se limpian a propósito — pueden ser la
única imagen nueva completa tras una publicación fallida. Eso es **C1**.

### 18.5 Evidencia

`b4/test-b4-persistencia.js` **144 OK / 0**; `b4/electron-b4.ps1` **17 OK / 0**
(proyectos de prueba creados por el propio arnés; el orden productivo real no se
toca). Dos reversiones: `R-reorder-en-bucle` reproduce el defecto medido
—`[null,null,null,null,0]` con **2 publicaciones**— y `S-reorder-mudo` deja el
fallo sin rastro.

Reejecutado todo: núcleo **1745 OK / 0**, E1 47, P12 73, E2 67, B1 77, B3 85,
B4 144; Electron real A2 66/0, Bloque 5 71/0, CV 12/0, E1 21/0, P12 32/0,
E2 42/0, B1 24/0, B3 36/0, B4 17/0. BD viva idéntica en todos.

**Archivos:** `main.js` y `db.js` **solo comentarios** (comprobado: sin los
comentarios, el código de `db.js` es idéntico byte a byte).

---

## 17. B3 — CERRADO: LOS ERRORES RELEVANTES DEJAN DE DEPENDER DE `console`

### 17.1 El alcance del cierre, dicho con precisión

B3 cierra como **«los errores relevantes ya no dependen exclusivamente de
`console`»**. No cierra como «el logging sobrevive a una caída total de
Drive»: eso es **P14** (§17.5), y sigue abierto. La distinción la fijó el
usuario antes de autorizar, y se respeta literalmente.

### 17.2 La premisa, medida

No se razona que `console.warn` sea invisible en producción: se mide.

| | Evidencia |
|---|---|
| La app nunca abre DevTools por su cuenta | `B3-A1` — cero `openDevTools(` en `main.js`, dashboard y lanzador |
| No hay atajo ni menú que las abra | `B3-A2` — ni `toggleDevTools` ni `'F12'` |
| Ninguna ventana las tiene abiertas en vivo | `B3-R6`, en Electron real |
| Un `console.warn` real **no** llega a `app.log` | `B3-R2..R4` — se provoca por su camino real y `app.log` **no crece ni un byte** |
| …mientras `appLog()` sí deja rastro | `B3-R5` — el arranque de esa misma sesión escribió 7 líneas |

### 17.3 Qué se ha corregido, y con qué canal

**Ningún canal nuevo.** Decisión del usuario: nada de un `app:log` genérico
para renderers. Lo que el usuario debe ver usa la UI que ya existe
(`psAlert`, el propio `#save-note`); lo que solo necesita rastro va a
`appLog()`. Comprobado que **no** se ha abierto ese canal: `B3-INV3`, `B3-INV4`.

- **Cifrado de backup → FAIL-CLOSED.** Era el peor de todos: si
  `encryptBackupPayload` fallaba se escribía el JSON **en claro** y el único
  rastro era un `console.warn` invisible; el usuario había activado el cifrado
  y creía que sus copias lo estaban. Ahora no se crea el archivo, no se marca
  como éxito, la fuente queda intacta y el usuario lee el texto acordado.
  Probado en el dashboard real con una carpeta falsa en memoria que registra
  si `getFileHandle` llega a llamarse: **no se llama** (`B3-RC1a`), y con el
  **contraste** de que con el cifrado funcionando sí se escribe y lo escrito
  es el cifrado (`B3-RC1i/j`).
- **Directorio de Talento.** Un guardado que falla pinta `NO GUARDADO — ver
  aviso` y lanza un aviso **una vez por sesión** (el guardado es un debounce
  por tecla: avisar en cada intento sería inusable). Cubre los **dos** caminos,
  incluido el síncrono del cierre de ventana, que es el último guardado
  posible (`B3-RC2a..h`).
- **8 casos de clase B en `main.js`** → una línea contextualizada en
  `app.log`, con dedupe por sesión donde el camino se repite (la copia HTML
  corre en cada `backup:save`, ~15 s por proyecto abierto).
- **Los dos `catch {}` de limpieza** —borrar un journal ya resuelto, soltar la
  exclusiva— dejan de ser mudos **sin cambiar el protocolo**: siguen sin
  lanzar, siguen siendo best-effort. Solo explican un bloqueo posterior que
  antes aparecía sin ninguna pista (`B3-E2..E6`).
- **Lo que NO se ha tocado**, por decisión explícita: los catch vacíos
  inocuos (temporal, descriptor, `statSync` de contabilidad, material ya
  decidido) siguen exactamente igual — `B3-E1` lo custodia.

### 17.4 Dos defectos NUEVOS encontrados durante la implementación

Los dos se pararon, se corrigieron y tienen prueba **y** reversión. Ninguno
estaba en el diagnóstico.

1. **`storageSet` del Directorio no lanza: devuelve `false`.** Cablear el
   aviso al `catch` no bastaba: por un fallo **real** de escritura el `catch`
   no se disparaba y la pantalla ponía «Guardado hh:mm:ss». Era **peor** que
   el warn mudo — mentía. `saveState()` decide ahora por el valor devuelto.
   *(El dashboard ya lo hacía bien; era el Directorio el raro.)*
2. **El mensaje de la excepción trae la ruta completa.** Lo encontró el
   **arnés de Electron real**, no la revisión del código: `path.basename()` en
   la parte que escribimos nosotros no sirve de nada si justo después se
   concatena `e.message`, porque un error de `fs` ya lleva dentro
   `'C:\Users\<usuario>\…'`. Las **15** líneas nuevas pasan por
   `motivoSinRutas()` — comprobado contando, no afirmado: `B3-S7` exige que el
   número de sentencias de B3 **coincida** con el de usos del saneador.
   Las anteriores no se tocan: **P15** (§17.6).

### 17.4bis Dos reclasificaciones, contra lo que decía la autorización

| Caso | Autorizado como | Es | Por qué |
|---|---|---|---|
| `historial-reunion` | **C** | **D** | La ventana **ya** pintaba `⚠ No se pudo guardar automáticamente [Reintentar]` en los dos caminos de fallo. El archivo **no se ha modificado**; la batería solo custodia ese aviso |
| `backup-emergencia` | **B** | **D** | Ya tenía `appLog` en la línea de al lado — el **único** de los 19 `console.warn` que lo tenía |

Se dicen porque la autorización asumía lo contrario. El criterio: no se toca
un archivo para cumplir una clasificación que el propio código desmiente.

### 17.5 P14 — ABIERTO: el registro persistente depende de Drive

`appLog()` escribe en `userData/app.log`, y `userData` es `G:` en esta
instalación. Si lo que ha fallado es justo Drive, el aviso se intenta escribir
**allí**, y `appLog()` no propaga su propio fallo: desaparece sin dejar nada.
El código **ya conoce el patrón bueno** —los backups de emergencia anclan en
`appData`, la ruta local real— pero `appLog` no lo usa. Medido en `B3-B6` y
`B3-B7`. Va con **A3.3 Bloque 8 / ciclo de vida de Drive**.

### 17.6 P15 — ABIERTO: rutas completas en las líneas antiguas del log

Las ~140 líneas de `appLog` anteriores a B3 concatenan
`String((e && e.message) || e)` tal cual. No es urgente —es la carpeta de
datos de la app, no documentos del usuario— y cambiarlas de golpe tocaría los
mensajes de los códigos PS-xxxx, que llevan el detalle literal **a propósito**.
El saneador ya existe y está probado (`B3-S8a..e`): aplicarlo es mecánico.

### 17.7 Evidencia

`b3/test-b3-inventario.js` **85 OK / 0**; `b3/electron-b3.ps1` **36 OK / 0**.
**Siete reversiones** (`b3/revertir-b3.js`), y `b3/comprobar-reversiones-b3.js`
lanza la batería contra cada una y exige que rompa **y que rompa por lo que
anuncia** — no vale con que rompa.

Reejecutado **todo** el árbol, porque B3 tocó la limpieza de journals, que es
territorio de A2 y del Bloque 5: núcleo **1745 OK / 0**, E1 47, P12 73, E2 67,
B1 77, B3 85; Electron real A2 66/0, Bloque 5 71/0, CV 12/0, E1 21/0, P12 32/0,
E2 42/0, B1 24/0, B3 36/0. BD viva idéntica por SHA-256 en todos.

**Archivos productivos:** `main.js`, `dashboard/plantilla_dashboard.html`,
`directorio/plantilla_directorio.html`. `preparacion-reunion/…` se fotografió
y **no** se tocó.

---

## 16. B1 — CERRADO: EL LISTADO DEJA DE REPETIRSE, DE ESCRIBIR Y DE CALLARSE

### 16.1 Medido antes → después

| | antes | ahora |
|---|---|---|
| Lecturas del backup | **4 por proyecto** | **1** |
| Lecturas del `estado.json` de CV | **2 por proyecto** | **1** |
| Consultas SQL `get` (3 proyectos) | **36** | **6** |
| `mkdirSync` por pasada | **18** | **0** |
| `UPDATE projects` con `backup_dir = NULL` | **1** | **0** |
| Rastro de un backup ilegible | **ninguno** | **1 línea en `app.log`** |

### 16.2 Contexto de pasada, NO caché general

`nuevoContextoListado()` nace en `listProjectRows()`, se pasa hacia abajo y
**muere al volver**. Ninguna referencia fuera. Esa es la propiedad que impide
que toque P13, y está probada en las dos direcciones: dentro de una pasada
ningún archivo se lee dos veces; entre pasadas, el backup nuevo se ve.

`ctx` es **opcional** en todos los helpers: sin él se comportan como siempre, así
que `meeting:getProjectData` y Preparación de Reunión **no cambian**.

### 16.3 Lectura pura

El listado usa `readBackupPayload(…, {puro:true})` y `rutaEvaluacionPura()`.
Antes, `backupsDirForProject()` → `ensureProjectBackupDirSlug()` hacía
`UPDATE projects SET backup_dir` + `mkdirSync`: **escritura lateral en un canal
de lectura**, el mismo patrón R1 que A2 sacó del restore.
`backupsDirForProject()` **no se ha tocado**. Un proyecto legacy con
`backup_dir = NULL` obtiene sus extras y **conserva su NULL**.

### 16.4 Fin del silencio (sin invadir B3)

`avisarExtraDegradado()`: **una línea por proyecto + recurso + pasada** en
`app.log`, con id, recurso y clase, sin payload. Antes no quedaba **nada** — las
`compute*` no lanzan, así que el `try/catch` con `console.warn` nunca se
ejecutaba. Sin diálogos, sin banners, sin tocar la UI. **No cierra B3.**

Y `computeStaffingRatio` sale del listado: E1 retiró su única vista consumidora.
**El helper se conserva**, sin llamadores, para la futura opción B de E1.
`serviceStatusKind` **se mantiene**: es parte del contrato de E2.

### 16.5 P13 — ABIERTO / ACEPTADO TEMPORALMENTE

> **Lanzador = snapshot del último backup persistido.**
> **Dashboard abierto = estado vivo.**

**Decisión del usuario: no se cambia la fuente ahora.** La divergencia existe y
afecta a todos los extras, pero **no es permanente**: converge cada ~15 s con
`maybeBackup('interval')`, al cerrar la ventana (medido: backups 4→5) y con el
proyecto cerrado el último backup **es** el estado. Severidad **baja-media**.
**B1 no lo empeora**: `P13-R1..R14` siguen verdes tras la corrección.

### 16.6 Evidencia

`b1/test-b1-p13.js` **77 OK/0** y `b1/electron-b1.ps1` **24 OK/0** — arranque
real con varios proyectos, uno con el backup corrompido a mano, comprobando la
huella de la carpeta de datos, el tamaño de la BD y el `app.log` reales. Cuatro
reversiones: `R-sin-memo` **6**, `S-sin-ruta-pura` **11**, `T-sin-log` **11**,
`U-con-staffing` **16** fallos.

---

## 15. E2 — CERRADO: UNA SOLA FUENTE DE VERDAD (15 sept 2026)

### 15.1 Qué había y qué hay

Dos implementaciones de la misma lógica —`computeServiceEndWarning()` en
`main.js` y `computeServiceEndWarningLocal()` en el dashboard— **ya divergidas**:
el fix de v2.0.52 (`serviceStart` futuro manda) entró solo en la primera. Con el
**mismo proyecto**: lanzador «Arranca en 3 días», dashboard «Servicio finaliza
en 20 días». Medido, no supuesto: **4 de 20 casos**.

Ahora hay **una**: `vendor/service-status.js`, JS puro. `main.js` la carga con
`require()`, el dashboard con `<script>`, y `fixVendorScriptPaths()` reescribe
la ruta al hornear `projects/<id>/dashboard.html` — **el patrón que ya existía**
para otros seis archivos. Las dos funciones son envoltorios de una línea.

### 15.2 El contrato: datos primero, texto después

```
serviceStatus(state, today) → null | { kind, level, days, message }
```

`days` = días **con signo** desde hoy hasta la fecha que da nombre al `kind`
(positivo futuro, 0 hoy, **negativo ya pasó**): `proximo-inicio` → hasta
`serviceStart`; `finaliza-pronto`/`finalizado` → hasta `serviceEnd`;
`prorroga-pronto`/`prorroga-vencida` → hasta la fecha de la prórroga. Se
proyecta como **`serviceStatusKind` / `serviceStatusDays`** — y **no**
`serviceEndDays`, que sería falso en `proximo-inicio`. La semántica está escrita
en el helper, no implícita.

**Cambio visible e intencional:** gana `main.js`. El dashboard pasa a decir
también «Arranca en N días». Su presentación no cambia: rojo → rojo, el resto →
ámbar con ⏳, así que `proximo-inicio` se pinta en ámbar. Homogeneizar iconos con
el lanzador queda para otro día.

### 15.3 El acoplamiento, cerrado

`portfolio:summary` sacaba los días con `/(\d+)/` **sobre el mensaje**. Lo único
que lo salvaba era que el nivel `rojo` no entraba: «Finalizó el 09/12/2026»
habría dado «09» leído como 9 días. Ahora usa `serviceStatusDays`. El
**criterio** de qué entra queda idéntico (por nivel, que incluye la prórroga).

**Evidencia:** `e2/test-e2-divergencia.js` **67 OK/0** — 26 casos por los **tres**
caminos exigiendo `A === B === C`, wording literal — y `e2/electron-e2.ps1`
**42 OK/0** — lanzador y dashboard a la vez, cinco escenarios, con backup en
cada uno. La prueba clave: **cambiar el wording no mueve el timeline**
(`1,1,0,0,1,0` antes y después), y la contraprueba muestra que el parser antiguo
habría sacado «99» en vez de 7. Reversiones: `P-dashboard-local` **28 fallos**,
`Q-regex-portfolio` **3**.

### 15.4 P13 — lo que E2 NO resuelve, y hay que decirlo

`main.js` lee el estado del **último backup**; el dashboard, el **estado vivo**.

> **E2 garantiza: MISMA ENTRADA → MISMO RESULTADO.**
> **E2 NO garantiza** que lanzador y dashboard lean *la misma versión temporal*
> del estado.

Por eso el arnés guarda un backup en cada escenario: para medir lógica, no
frescura. Registrado como **P13**, abierto, y a decidir junto con **B1**, que es
donde vive esa lectura. **E2 no se convierte en una rearquitectura de
`projects:list`.**

---

## 14. P12 — CERRADO: SIN RANGO DEMOSTRABLE NO SE INFIERE PROGRESO

### 14.0 La corrección

Una sola noción, `rangoTemporalValido(start, end)` —`start` válida, `end`
válida, `end > start`—, y todo lo que dependía de la escala temporal cuelga de
ella:

| | sin rango válido | con rango válido |
|---|---|---|
| `pctOf()` | **0** (guarda **antes** de dividir) | idéntico a antes |
| progreso / días | `0%`, `día 0 de ~0` | idéntico a antes |
| marcador **HOY** | **no se dibuja** | se dibuja |
| «FIN ESTIMADO» y prórroga estimada | **no se dibujan** | se dibujan |
| cabecera del rail | **vacía** | `01 ENE 2026 → 31 DIC 2026` |
| carril base gris | **sí** (gráfico vacío, no un hueco) | sí |

**Tres decisiones que importan más que el código:**

1. **Los días NO se sanean por separado.** Un `Number.isFinite()` suelto quita
   el `NaN` y deja la mentira: con `serviceStart === serviceEnd`, `totalDays`
   sale 0 y `daysElapsed` 258 —los dos finitos— y el texto diría **«día 258 de
   ~0»**. Van atados a la misma condición que el porcentaje.
2. **La guarda va ANTES de dividir.** Con denominador 0 la división no siempre
   da `NaN`: `n/0` es `Infinity` y `clamp` lo convertía en un **100 % creíble y
   falso**. Como `today` lleva la hora del reloj, ese era el caso que se veía
   en vivo — y por eso la batería aislada (medianoche) y el arranque real
   contaban números distintos.
3. **El marcador HOY no se coloca en `x(0)`.** 0 es un valor de cálculo, no una
   posición: pintarlo afirmaría que hoy es el comienzo de un servicio sin
   fechas. Patrón conservador que el rail ya tenía para «FIN ESTIMADO».

**Sin UX nueva:** la cabecera sin rango queda **vacía**. `fmt()` no se toca
(47 consumidores). **Un solo archivo:** `dashboard/plantilla_dashboard.html`.

**Evidencia:** `p12/test-p12-nan.js` **73 OK/0**, `p12/electron-p12.ps1`
**32 OK/0** (incluye `executiveStatus().progressPct === 0`, el resumen ejecutivo
copiable sin `NaN` y **cero errores de atributo SVG en toda la sesión**),
regresión completa sin cambios, tres reversiones que tumban 17/6/1.

**Queda anotado, sin tocar:** un proyecto **sin** fechas pero **con** hitos los
dibujaría todos en el origen del carril. Ya no hay `NaN` —que era el defecto—,
pero se amontonan. Exige decidir UX; esta ronda era robustez numérica.

### 14.1 Causa raíz — una sola (diagnóstico original, se conserva)

```js
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function pctOf(dateObj, start, end){ return clamp((dateObj-start)/(end-start),0,1)*100; }
```

Un proyecto nuevo nace con `serviceStart: null, serviceEnd: null`, y `render()`
hace `new Date(state.serviceStart+'T00:00:00')`: `null + 'T00:00:00'` es la
**cadena** `"nullT00:00:00"` → **Invalid Date**. El denominador sale `NaN`, y
**`clamp` no sanea NaN** — `Math.min`/`Math.max` lo propagan.

**Dos manifestaciones del mismo denominador cero**, según el numerador:

| | resultado | efecto |
|---|---|---|
| `0/0` | `NaN` | coordenada rota, `"NaN%"` |
| `n/0` | `Infinity` → `clamp` → **100** | un **100 % falso**: «día 1 de ~0» |

El segundo es el que se ve **en vivo** con `serviceStart === serviceEnd`, porque
`today` es `new Date()` y lleva la hora del reloj. Por eso la batería aislada
(medianoche exacta) cuenta **9** NaN y el arranque real cuenta **3**: son el
mismo defecto mirado a horas distintas.

### 14.2 Alcance — no es solo un gráfico que no se pinta

- 6 coordenadas NaN en la vía de despliegue (1 `x1`, 2 `x2`, 2 `cx`, 1 `x`);
- el KPI **«Progreso» muestra `NaN% · día NaN de ~NaN`**;
- la cabecera del rail muestra **`INVALID DATE → INVALID DATE`**;
- `executiveStatus()` calcula **otro** `progressPct` con el mismo `pctOf`, y ese
  llega al panel «Estado Ejecutivo», al **resumen ejecutivo copiable** y a la
  **exportación a PowerPoint**: el `NaN%` **sale de la aplicación**.

**Lo que NO pasa:** ninguna excepción, el dashboard carga entero, los renders
posteriores se ejecutan, `saveState`/`render` siguen definidos y **no se corrompe
ningún dato guardado** — `serviceStart`/`serviceEnd` se persisten como `null`,
que es lo correcto.

**Ventana de exposición:** el asistente obligatorio (`resolveProjectIdentity`)
solo se dispara si el proyecto conserva el **nombre de fábrica**. Uno creado
desde el lanzador ya trae su nombre real, así que **no pasa por el asistente** y
se abre sin fechas. Es el camino más común que hay.

### 14.3 Evidencia del diagnóstico (antes de corregir)

Con el código roto, `p12/test-p12-nan.js` daba **43 OK / 0** y
`p12/electron-p12.ps1` **20 OK / 0**: describían el defecto. Desde el 15 sept
2026 esas mismas baterías **exigen la corrección** y dan 73 y 32.

---

## 5. SIGUIENTE PASO EXACTO

**A2, P2, E1, P12, E2, B1, B3, B4, B5 y C1-A están CERRADOS. C1-B (retirada de
residuos históricos) queda ABIERTO / DIFERIDO (§20). P16 nace de C1 y queda
ABIERTO. Se paró ahí, a propósito.**
**P13 queda ABIERTO / ACEPTADO TEMPORALMENTE** (§16.5): decisión del usuario.
**P14 y P15 nacen de B3 y quedan ABIERTOS** (§17.5 y §17.6).

La sesión nueva empieza leyendo **este handoff** y los documentos canónicos
(§10). **No rediseñar desde cero.** Lo siguiente lo decide el usuario: no hay
ningún trabajo de A2 en vuelo.

**SIGUIENTE PRUEBA (verificar que el árbol sigue verde antes de tocar nada):**

```
a2/test-cableado.js        -> debe dar 129 OK / 0 FALLOS
e1/test-inventario-e1.js   -> debe dar  47 OK / 0 FALLOS
p12/test-p12-nan.js        -> debe dar  73 OK / 0 FALLOS
e2/test-e2-divergencia.js  -> debe dar  67 OK / 0 FALLOS
b1/test-b1-p13.js          -> debe dar  77 OK / 0 FALLOS
b3/test-b3-inventario.js   -> debe dar  85 OK / 0 FALLOS
b4/test-b4-persistencia.js -> debe dar 144 OK / 0 FALLOS
b5/test-b5-reentrancia.js  -> debe dar  68 OK / 0 FALLOS
c1/test-c1-residuos.js     -> debe dar 165 OK / 0 FALLOS   (C1-A exige; el resto describe)
```

> **Si tocas `main.js`, varias baterías te lo dirán — y está bien que lo hagan.**
> `e1/test-inventario-e1.js` lleva una tabla de hashes (`HASHES_TRAS_A2`), y
> `e2/`, `b1/` y **todas las del núcleo** extraen funciones **por firma**. Un
> cambio legítimo las hace fallar: se actualizan **a conciencia, con su nota**,
> nunca se borran. Ya pasó tres veces (E2, B1 y B3) y las tres quedaron
> anotadas.
>
> **Trampa nueva de B3 (la más cara de las tres).** Si añades a `main.js` un
> helper **y lo llamas desde una función que las baterías ya extraen**, el
> arnés revienta con `"X is not defined"` — no con un FALLO, con una excepción
> que se lleva por delante el resto de la batería. Le pasó a los bloques 3, 4,
> 5 y A2 a la vez. **La lista compartida es
> `comun/bloque5-extraccion.js`**: añade ahí la firma del helper (y en
> `PREAMBULO_B5` cualquier variable de módulo que use, porque esas no se
> pueden «extraer»). Es **defecto de arnés, no de producto**; distínguelo
> siempre.

**SIGUIENTE COMANDO:**

```
set ELECTRON_RUN_AS_NODE=1
node_modules\electron\dist\electron.exe claude\pruebas-a33\a2\test-cableado.js
```

> **Trampa de esta máquina:** invocar `electron.exe` con el operador `&` de
> PowerShell puede devolver **cero salida y cero código de salida**, como si no
> hubiera arrancado. Con `Start-Process … -Wait -PassThru -RedirectStandardOutput`
> funciona siempre. Si una batería «no dice nada», es esto, no un fallo.

**SIGUIENTE ARCHIVO A REVISAR:** ninguno de A2 ni de E1. Los candidatos del
árbol, por orden de lo que ya está diagnosticado:

- **D4** — `package.json` 2.0.55 vs código 2.0.56. Es lo que queda del párrafo
  de E1 y es de una línea, pero **decide la versión de la próxima entrega**.
- **C1-B** — retirada de residuos históricos: **DIFERIDA** hasta tener
  garantías multi-PC/Drive (§20). No empezar sin autorización expresa.
- **P16** — particiones de Chromium dentro de la carpeta sincronizada. Va con
  P14 y con A3.3 Bloque 8 / ciclo de vida de Drive.
- **F1** — **CERRADO el 16 sept 2026.** Corregido por contexto en 5 archivos;
  los 76 `innerHTML` siguen ahí (se escapó el dato). Batería exigente 139 OK/0,
  Electron real 47 OK/0, 6 reversiones 19 OK/0. `main.js` pasa a
  `0BC92A46…` (solo el horneado del seed). Ver `pendientes-abiertos.md` §F1.
  **F2 (CSP) y F3 (`window.open`) siguen abiertos**, fuera de F1, igual que
  `psConfirm`/puente (defensa en profundidad, sin autorizar).
- **P14** — `app.log` en Drive (§17.5). Va con A3.3 Bloque 8 / ciclo de vida
  de Drive; no tiene sentido abordarlo suelto.
- **P15** — rutas completas en las líneas antiguas de `app.log` (§17.6). El
  saneador ya existe y está probado; es mecánico, pero toca los mensajes de
  los códigos PS-xxxx y por eso necesita autorización propia.
- *(C1: ver arriba. B3 ya le había añadido visibilidad — el borrado fallido de
  un CV deja línea en `app.log` —, y la batería de C1 lo custodia, `C1-E8i`.)*
- **P13** — §16.5, aceptado temporalmente; solo se reabre con arquitectura de
  frescura.

*(E2 ya está cerrada — §15. Con ella, la **precondición** que E1 tenía para
reactivar Portfolio Summary algún día queda resuelta: el acoplamiento del
timeline con el texto ya no existe.)*

**NO saltar a:** Drive con dos PCs, conflicto UI general, cierre/apagado
global, empaquetado.

**Método de trabajo que el usuario exige** (y que conviene mantener):
punto de restauración **antes** de tocar nada; un hallazgo cada vez —diseño,
matriz de impacto, autorización explícita, implementación, plan de pruebas,
**PARAR**—; nunca modificar los datos reales; y distinguir siempre lo
**verificado con evidencia** de lo **razonado leyendo el código**.

---

## 6. BD VIVA / ENTORNO

**BD viva:** `G:\Mi unidad\BD-PanoramaServicio\panorama.sqlite3`
(la ubicación sale de `%APPDATA%\panorama-app-config\location.json`, clave
**`userDataDir`**).

| | valor |
|---|---|
| **Hash actual (baseline vigente)** | `C7F6FC2F640ECE8CFC231B29AAEAF64A18CFEB67E00E61776FF66BE804D9C27E` |
| bytes | 77 824 |
| `LastWriteTime` | 2026-09-18 12:23:59 |
| baseline capturada | 2026-09-18 14:23 |
| **Hash anterior** | `C26323D15535949653AC035E13EBBBD084997CCC2AE54AE2119685B8A885AAB0` (capturado 2026-09-17 14:32). Cambió por **sesiones reales del usuario** con la v2.0.55 instalada el 18 sept, 10:41–10:45 y 12:22–12:24 hora local, con backups «manual-button», entre tiradas y sin ninguna batería en marcha. Antes de eso, y **todavía con `C26323D1…`**, su `LastWriteTime` había pasado a 2026-09-18 02:02:01 por los arranques reales ligados al incidente ARN-3; en ese episodio solo cambió el `mtime`. **`C26323D1…` y `C7F6FC2F…` no tienen el mismo contenido.** Lo que se demuestra desde el reanclaje, hecho antes de la regresión final, es que ninguna prueba alteró la BD a partir de `C7F6FC2F…`. Ver `comun/baseline-bd-viva.json` |
| **Hash anterior aún** | `D5C3FF53D09925B6C8258F5EFFF84DA44F949EBCE609A1276887BD30D21F46C8` (capturado 2026-09-15 13:24; cambió por una **sesión real** el 17 sept, 13:02–13:04, entre dos tiradas del arnés P9) · antes `52394C7A…` (2026-09-15 00:00) |

**Por qué el cambio se atribuye a una sesión real del usuario, no a las
pruebas:** el `.sqlite3` y `app.log` llevan la **misma marca de tiempo**
(11:26:45), y `Session Storage` / `GPUCache` se actualizaron a las 12:39 — una
app viva. Las baterías corrieron a partir de las 13:24 y **dentro de la ronda
el hash quedó idéntico antes y después**. Ninguna batería referencia esa
carpeta: todas usan sandbox bajo `%TEMP%` con guardián fail-closed.

Baseline en `scratchpad/comun/baseline-bd-viva.json`, con el hash anterior y el
motivo registrados.

**Carpeta segura de pruebas:** `G:\Mi unidad\_Panorama-A33-Pruebas\`
(solo benchmarks; se borra la subcarpeta al terminar).

**Regla:** ninguna prueba destructiva sobre la carpeta viva. Solo lectura y
hash.

**Guardián:** `scratchpad/comun/guardia-rutas.js` — lector único y
**fail-closed** de `location.json`; si existe y no se puede interpretar,
**exit 99**. Vigila además la BD viva y termina con **exit 98** si cambia
durante una batería.

---

## 7. CHECKPOINTS / HASHES DE PRODUCCIÓN

Snapshots en `claude/`, con sufijos `.ANTES-…` y `.ACTUAL-…`.
Documento: `claude/checkpoint-bloque5-2026-09-15.md`.

### Cadena de los archivos tocados

> **Rondas del 16–17 sept 2026 posteriores a C1-A, en orden** (detalle en
> `pruebas-a33/MANIFIESTO.md` §4): `main.js` `F81F0A3D…` → F1 `0BC92A46…` →
> P17 `434BB294…` → F3 `16AB5F53…` → F2 `E7D596A8…` → **P9
> `2D05E00B53B8C45E6823E8629579D303FB69E2B0A24E53DCBE7700897E5F30F9`** (610 975
> B). **P9 solo toca `main.js`**; instantánea previa en
> `claude/main.js.ANTES-P9-2026-09-17`.
>
> **Ronda C1-A (16 sept 2026): DOS archivos productivos
> modificados** — `main.js` (`DB7FF295…` → **`F81F0A3D3DF0AA1F…`**, 587 045 B,
> 11 637 líneas) y `evaluacion-candidatos/plantilla_evaluacion_candidatos.html`
> (`F9DF00AE…` → **`FFCEAD9810070A0B…`**, 117 361 B). Snapshots previos en
> `claude/main.js.ANTES-C1A-2026-09-16` y
> `claude/plantilla_evaluacion_candidatos.html.ANTES-C1A-2026-09-16`.
> `db.js` **no** se toca.
>
> **Ronda B5 (16 sept 2026, anterior): UN solo archivo productivo modificado** —
> `security-window/renderer.js`
> (`190191B237A347B8…` → **`4549911C8D814DAD…`**, 6 220 B). Snapshot previo en
> `claude/renderer.js.ANTES-B5-2026-09-16`. Es **una línea** de guarda en
> `doSubmit()`: ni `main.js`, ni `db.js`, ni `index.html`.
>
> **Ronda B4 (16 sept 2026, anterior): DOS archivos productivos modificados** —
> `main.js` (`A0CF6246…` → **`DB7FF295E26279DD…`**, 573 142 B) y `db.js`
> (`1B16381F…` → **`B03C81FF5FC30000…`**, 81 870 B). Snapshots previos en
> `claude/main.js.ANTES-B4-2026-09-16` y `claude/db.js.ANTES-B4-2026-09-16`.
>
> **`db.js` cambia SOLO en comentarios** — dos citas a `persist()` que lo
> describían como si aún existiera. Comprobado programáticamente: quitando los
> comentarios, el código es **idéntico byte a byte**. Es la primera vez que
> `db.js` sale de la lista de «no modificados en ninguna ronda».
>
> **Ronda B3 (15 sept 2026, anterior): TRES archivos productivos
> modificados** — `main.js` (`452B411D…` → **`A0CF6246B3BD1CC6…`**, 569 540 B),
> `dashboard/plantilla_dashboard.html` (`6C54916F…` → **`204D6BC4E054172F…`**,
> 370 905 B) y `directorio/plantilla_directorio.html`
> (`B56C2134…` → **`685F448C82C934E1…`**, 192 131 B). Snapshots previos en
> `claude/main.js.ANTES-B3-2026-09-15`,
> `claude/plantilla_dashboard.html.ANTES-B3-2026-09-15` y
> `claude/plantilla_directorio.html.ANTES-B3-2026-09-15`.
>
> **`preparacion-reunion/plantilla_preparacion_reunion.html` se fotografió y
> NO se tocó** (`710E051F1B91B81B…`, sin cambios): el caso estaba autorizado
> como C y resultó ser D, porque la ventana ya avisaba. El snapshot
> `claude/plantilla_preparacion_reunion.html.ANTES-B3-2026-09-15` se conserva
> aunque no haya diferencia, para que conste que se miró.
>
> **Ronda B1 (15 sept 2026, anterior): el ÚNICO archivo productivo modificado
> es `main.js`** (`8954E5ED…` → **`452B411D43897572…`**). Snapshot previo en
> `claude/main.js.ANTES-B1-2026-09-15`.
>
> **Ronda E2 (15 sept 2026, anterior): UN archivo NUEVO,
> `vendor/service-status.js` (`373DD746…`), y dos modificados —`main.js`
> (`DB75E6C2…` → **`8954E5ED9D097212…`**) y `dashboard/plantilla_dashboard.html`
> (`AB543AE8…` → **`6C54916F3E3FB0ED…`**)—.** Snapshots previos en
> `claude/main.js.ANTES-E2-2026-09-15` y
> `claude/plantilla_dashboard.html.ANTES-E2-2026-09-15`.
>
> **Ronda P12 (15 sept 2026, anterior): el ÚNICO archivo productivo modificado
> es `dashboard/plantilla_dashboard.html`.** Snapshot previo en
> `claude/plantilla_dashboard.html.ANTES-P12-2026-09-15`
> (`F1AC8F6DFA9A6ED73C6D928CC2178E5C52E6491A7DF8B794DF7B6BFA6678DB6C`, 364 771 B).
> Actual: `AB543AE8433A020507BA09CA77893F9D478D778075E84261703AB0A264DB0F69`,
> 368 560 B. **Ese archivo deja de estar en la lista de «no modificados».**
>
> **Ronda E1 (15 sept 2026, anterior): el ÚNICO archivo productivo modificado
> es `launcher/index.html`.** Snapshot previo en
> `claude/index.html.ANTES-E1-RETIRADA-2026-09-15`
> (`63087DF7D92778B21982394C57E4361DD85FCBED83F483D9B16B9160FAB3745B`, 33 063 B).
> Actual: `C2A508CF8DD8A42002A0A9371C36701EF15133895E157F1E471630CECF76C999`.
> La batería `e1/` lo comprueba por hash: los otros ocho siguen intactos.
>
> **Ronda H-1 (15 sept 2026): el ÚNICO archivo productivo modificado es
> `main.js`.** Snapshot previo en `claude/main.js.ANTES-H1-BARRERA-2026-09-15`
> (`CC9E62FF589C029FFC571ACB4B11C9B7E2D592559AC665CC32EDD8D58E4164D5`,
> 546 361 B). Actual: `DB75E6C29CEFF0097F3D16FAEA572E0908F5E71258064970A5E1B38C2CE94B57`,
> 554 035 B, **11 103 líneas**. Los otros siete no se han tocado.

| Archivo | PRE Bloque 5 | PRE A2 (= ACTUAL Bloque 5) | **ACTUAL** |
|---|---|---|---|
| `main.js` | `7EE92902AF16DC37` | `71A118B4E42ADAEA` | **`F81F0A3D3DF0AA1F`** (C1-A) |
| `preload.js` | `91F3E63CF6092C3F` | — | **`AA77316F3FDB384D`** |
| `preload-launcher.js` | `B08AA3EAE6D167B4` | `21CA840597B81E17` | **`01D38C31D5FB9B23`** |
| `launcher\renderer.js` | `8D59E82D8454165E` | `BE0125470DE837A1` | **`9CF8DFD05055A10C`** |
| `preload-backup-picker.js` | — | `FBABB937DDD24BD1` | **`19D2D1BAD74F7747`** |
| `backup-picker\renderer.js` | — | `6B311815D0BC8B4B` | **`140D6E271DE17798`** |
| `launcher\index.html` | — | `63087DF7D92778B2` | **`C2A508CF8DD8A420`** (E1) |
| `plantilla_preparacion_reunion.html` | `67F5AE56B23443AA` | — | **`710E051F1B91B81B`** |
| `plantilla_evaluacion_candidatos.html` | `1410C130199F9753` | — | **`FFCEAD9810070A0B`** (C1-A) |

### NO modificados en ninguna ronda

| Archivo | Hash |
|---|---|
| ~~`db.js`~~ | **Ya NO: B4 le cambió DOS COMENTARIOS.** PRE `1B16381FDE768493…` -> ACTUAL **`B03C81FF5FC30000…`**. Código ejecutable idéntico |
| `security.js` | `0BF1CAD061B2D9E71900681E72D00072545282A75E2C9ABE825A96B1DDC5B937` |
| ~~`dashboard\plantilla_dashboard.html`~~ | **Ya NO: lo modificaron P12, E2 y B3.** PRE `F1AC8F6DFA9A6ED7…` → ACTUAL **`204D6BC4E054172F…`** |
| ~~`directorio\plantilla_directorio.html`~~ | **Ya NO: lo modificó B3.** PRE `B56C213428C60C05…` → ACTUAL **`685F448C82C934E1…`** |

> Con B3 esta tabla se queda **solo con `db.js` y `security.js`**. Es la
> primera ronda que toca el Directorio de Talento: hasta ahora ninguna lo
> había necesitado.

Hashes completos actuales, **todos los productivos** (medidos tras C1-A,
16 sept 2026):

```
main.js                    F81F0A3D3DF0AA1F9E2B8F5024A69F4AAC3C86DB201EE2F3E27DC4C7DD32A952
preload.js                 AA77316F3FDB384D582F8270213A846EE1A1D2E067784EE17DF8D65CC1F6A27B
preload-launcher.js        01D38C31D5FB9B23E5AD9FC617DEB7E3960E88EBF5A0ACF89C9C8EDDAA21ECFD
preload-backup-picker.js   19D2D1BAD74F774797E5F129F99FFAF2A19BF77E370BF1727161447B326D3061
launcher\renderer.js       9CF8DFD05055A10CB0C7A479CF7608FC3798269755A61F6C4A18135BE52379AB
launcher\index.html        C2A508CF8DD8A42002A0A9371C36701EF15133895E157F1E471630CECF76C999
backup-picker\renderer.js  140D6E271DE17798C6CB9B025F21C10112A0085B051A9373627C41653B2E3397
dashboard .html            204D6BC4E054172F5CC2A4999B1285AC9D3E68B2CD62C3D005E807F5250A9946
directorio .html           685F448C82C934E13E903963569C0ED7D32D761A817C76BC3F7A7404A6D11135
prep. de reunión .html     710E051F1B91B81BD6E84EF2F41979BAEA24040DB87BA9A26F470A5F5BA56A27
eval. de candidatos .html  FFCEAD9810070A0BC3E61D9E90063161E72E55451D21F877AE4C71B13859B388
vendor\service-status.js   373DD7467F3BF5FFAB8C28A5646E71E070C4BD99AADAC3E29593C06C7DB15995
db.js                      B03C81FF5FC300009DC315E4B20F9BF88DCC6902B18C2EF434B251A022EDD830
security.js                0BF1CAD061B2D9E71900681E72D00072545282A75E2C9ABE825A96B1DDC5B937
security-window\renderer.js 4549911C8D814DADC252CB238C793BBF02BC2FE19FEC1CDD047990287CA7B350
```

`main.js` tiene **11 637 líneas** (recuento real con `(Get-Content …).Count`;
`Measure-Object -Line` **descarta las líneas en blanco** y da una cifra
menor — no usarla). Eran 11 103 antes de B3, 11 339 tras B3 y 11 401 tras B4.

**Regla vigente:** ningún archivo productivo se modifica sin entrar antes en el
checkpoint.

---

## 8. PRUEBAS YA HECHAS

### Automatizadas (última ejecución completa: **1745 OK / 0 FALLOS**, 15 sept 2026, ronda H-1, contra `main.js = DB75E6C2…`)

| Batería | Resultado |
|---|---|
| `comun/test-guardia.js` | 43 / 0 |
| `bloque1/test-db-integrado.js` | 394 / 0 |
| `bloque2/test-wiring.js` | 222 / 0 |
| `bloque3/test-error-codes.js` | 44 / 0 |
| `bloque3/test-primitivas.js` | 75 / 0 |
| `bloque3/test-seguridad.js` | 223 / 0 |
| `bloque4/test-acciones.js` | 243 / 0 |
| `bloque4/test-consumidores.js` | 168 / 0 |
| `bloque5/test-borrados.js` | 80 / 0 |
| `bloque5/test-cableado.js` | 58 / 0 |
| `a2/test-restauraciones.js` | 66 / 0 |
| `a2/test-cableado.js` | **129 / 0** |

**Electron real de A2, misma ronda: 66 OK / 0 FALLOS** (`RA-1..RA-9`, una sola
tirada). BD viva idéntica por SHA-256, carpeta sin archivos nuevos, archivos
productivos intactos, sandbox borrado.

**E1, ronda posterior — se cuenta APARTE, no entra en los 1745:**
`e1/test-inventario-e1.js` **47 / 0** y lanzador real `e1/electron-e1.ps1`
**21 / 0**. La regresión de las doce baterías se volvió a pasar tras la retirada
y dio **los mismos 1745 OK / 0**.

### Tabla histórica anterior (**1669 OK / 0**, ronda previa)

| Batería | Resultado | Qué demuestra |
|---|---|---|
| `comun/test-guardia.js` | **43 / 0** | GUARD-LOC-1..5: el lector de `location.json` es fail-closed; los casos que abortan se comprueban en proceso hijo por código de salida real |
| `bloque1/test-db-integrado.js` | **394 / 0** | `db.js` íntegro: commits, `.gen`, latches, atomicidad |
| `bloque2/test-wiring.js` | **222 / 0** | Cableado de A3.3 en el arranque |
| `bloque3/test-error-codes.js` | **44 / 0** | Integridad de `ERROR_CODES` |
| `bloque3/test-primitivas.js` | **75 / 0** | Exclusiva, `exigirCommitBase`, `alCambiarImagenEnMemoria` |
| `bloque3/test-seguridad.js` | **223 / 0** | Seguridad/A1 sobre A3.3, rollback por hash |
| `bloque4/test-acciones.js` | **243 / 0** | Helper de acción y recuperación, C1–C12, marca por escritor |
| `bloque4/test-consumidores.js` | **168 / 0** | Los 5 consumidores reales + borde IPC + renderers |
| `bloque5/test-borrados.js` | **80 / 0** | B1–B12, NO-CLOBBER, journal cerrado, CV sobre el HTML productivo |
| `bloque5/test-cableado.js` | **58 / 0** | D1–D4 productivos, contratos, sin truthiness |
| `a2/test-restauraciones.js` | **66 / 0** | Helper y recovery de restauración, A1–A15 |
| `a2/test-cableado.js` | **53 / 0** | `backup:restore` productivo, REST-PROD-* |

### Electron real y destructivo (sandbox artificial)

| Ronda | Resultado | Qué demuestra |
|---|---|---|
| Bloque 5, E1–E7 | **71 / 0** | Eliminar proyecto desde el lanzador real; rollback ante `base-cambiada`; **primera forma 3 forzada dentro de Electron real**; borrado de preparación; purga; recovery al arrancar con NO-CLOBBER y fail-closed |
| Bloque 5, CV (2 casos) | **17 / 0** | `CV-ELECTRON-REPLACE-NOAPLICADO` y `CV-ELECTRON-RM-FORMA3`, con clic real sobre el renderer productivo |
| `CV-RM-F3-RETURN` | **12 / 0** | El `saveState(true)` **original** devuelve `{aplicado:true, verificado:false, requiereReinicio:true}`; `candidateEval:removeCv` = 0 invocaciones |

En todas: BD viva idéntica por SHA-256, cero archivos de producción tocados
durante las pruebas, sandbox eliminado, cero procesos Electron vivos.

### Reversiones (prueba de que las defensas son necesarias)

`bloque5/revertir.js` (3) y `a2/revertir.js` (5): cada reversión rompe
exactamente las pruebas que debía romper. Una prueba que también pasa contra el
código anterior no demuestra nada.

---

## 9. HALLAZGOS Y TRAMPAS CONOCIDAS

1. **`F71F4140…` NO era la BD viva.** Era
   `%APPDATA%\panorama-app\panorama.sqlite3`, una **copia local residual**
   (es parte de P10). Durante los Bloques 1–4 las suites la hasheaban creyendo
   que era producción. **Pérdida de evidencia, no evidencia de corrupción.**
2. **`G:` no se comporta como NTFS.** `rename(cuarentena → destino)` con el
   destino recreado **no falla, lo reemplaza**; en NTFS da `EPERM`. Por eso
   NO-CLOBBER es obligatorio y no se puede confiar en el filesystem.
3. **`ensureProjectBackupDirSlug()` no puede aparecer en caminos puros**: hace
   `UPDATE projects` (y por tanto un commit) y un `mkdirSync`.
4. **Cerrar una ventana puede mover el commit** (guardado final, bounds). De ahí
   que la base se capture después del quiesce.
5. **Reunión y candidatos cargan el mismo archivo para todos los proyectos**: no
   se pueden identificar por URL. Hay que usar el id de `BrowserWindow`.
6. **Una ventana no confirmada NO puede borrarse del mapa durante un restore.**
   Se devuelve al mapa y se aborta.
7. **`saveState(true)` debe propagar el contrato real**, y `doSaveNow()` debe
   devolverlo en **todas** sus ramas. Con solo la primera mitad, resolvía a
   `undefined` y producía un **falso verde**.
8. **Material de restauración cifrado sin limpiar bloquea el rekey.** Cuenta
   también una carpeta con `previo.enc` **sin** journal (cleanup fallido).
9. **`clear()` + `setItem()` NO es una barrera de persistencia.** Medido: el
   dato tarda **~103 ms** en llegar solo al LevelDB. `flushStorageData()` lo
   pone allí antes de retornar (coste ~0,04 ms) y **devuelve `undefined`, no
   una promesa**. Ya está integrado (R4) y probado — ver `a2-…§9`.
9bis. **`process.exit()` NO sirve para simular un corte.** Es una salida
   ordenada y Chromium todavía vuelca su almacenamiento al cerrar: un brazo
   «sin barrera» sale verde **por el camino equivocado**. Hay que usar
   `TerminateProcess` (`process.kill(pid,'SIGKILL')` en Windows). Y **sin brazo
   de control no se puede afirmar nada**: «antes 0 ficheros, después 1» no
   distingue la barrera de la escritura perezosa.
9ter. **`Start-Process -ArgumentList` trocea por espacios.** Un sandbox bajo
   `C:\Codigo Fuente PS\…` llegaba partido y el arnés escribía su log en
   `C:\Codigo\test.log`; como `tlog()` se traga el error, la prueba **parecía no
   arrancar**. Sandboxes en `%TEMP%` (ruta 8.3, sin espacios) y argumentos entre
   comillas. El arnés ahora hace fail-closed si el sandbox no existe.
10. **PowerShell 5.1**: lee los `.ps1` como ANSI — cualquier carácter no ASCII
    puede romper el **parseo**. `2>&1` sobre un `.exe` convierte stderr en
    `ErrorRecord` y con `$ErrorActionPreference='Stop'` mata el script.
    `.Split(string)` trocea por caracteres, no por la cadena.
11. **`Measure-Object -Line` descarta las líneas en blanco.**
12. El extractor de funciones de los arneses debe buscar el cuerpo **después**
    de la firma completa: con `(partitionName, dump, { clearFirst } = {})` la
    primera `{` es la desestructuración y devuelve una función truncada.
13. **El operador `&` de PowerShell puede ejecutar `electron.exe` y devolver
    cero salida y cero código de salida**, como si no hubiera arrancado. Con
    `Start-Process … -Wait -PassThru -RedirectStandardOutput` funciona siempre.
    Una batería que «no dice nada» es esto, no un fallo de la batería.
14. **Un arnés que trunca lo que captura puede inventarse un defecto.**
    `real-run/a2.js` guardaba el `detail` de los diálogos recortado a 400
    caracteres, y `errorCodeSuffix()` pone el `(código PS-xxxx)` **al final**:
    `RA-9` decía «falta el código» cuando lo que faltaba era el final de la
    cadena. Se guarda entero y se recorta **solo al imprimir**.
15. **Una corrección en una función compartida amplía la lista de extracción de
    TODOS los arneses, no solo del suyo.** H-1 metió una llamada al journal de
    restauración dentro de `proyectoBloqueadoParaMutar()` y de `f1Global()`, y
    reventaron bloque4, bloque5 y el helper de A2 con
    `X is not defined` — a propósito, que es el mecanismo previsto. El aviso
    real es otro: en `bloque4`, la purga **se traga** ese `ReferenceError`, así
    que no salió como excepción sino como **un `FALLO` de conteo** (`I2`, «la
    purga mantiene el límite») que parecía un defecto del producto. Un fallo de
    conteo en una operación tolerante a errores merece mirarse dos veces.
16. **Cambiar el protocolo obliga a rearrancar también el Electron real.** La
    ronda anterior añadió el flush a la reposición, actualizó el test
    automatizado y **no** volvió a arrancar el arnés: `RA-3` seguía exigiendo
    **un** flush cuando ya había **dos**. Quedó latente hasta esta ronda.
17. **PowerShell NO distingue mayúsculas en los nombres de variable.** Un
    `$p = Start-Process …` en el ámbito raíz **pisa `$P`**, la ruta del
    proyecto. En el arnés de E1 eso hizo que el guardián de salida declarara
    «CAMBIO EN PRODUCCION» en los **nueve** archivos: un falso positivo
    alarmante y completamente falso. Los `Start-Process` del ámbito raíz usan
    `$proc`. (En `a2/electron-real.ps1` no pasaba porque allí vive dentro de una
    función.)
18. **Un contenedor vacío no está oculto, está vacío.** Comprobar visibilidad
    con `getBoundingClientRect()` daba `#grid` «invisible» solo porque aún no
    había tarjetas dentro. Para «¿está activa esta vista?» hay que mirar
    `display`; el tamaño solo se puede medir con contenido.
19. **Al medir «cero errores de renderer», separar POR VENTANA.** El arranque de
    E1 recogió 6 errores del **dashboard** que no tenían nada que ver con el
    lanzador. Mezclarlos habría hecho fallar E1 por un defecto ajeno; filtrarlos
    sin más los habría perdido. Se registraron aparte y se convirtieron en P12.
20. **`clamp()` no sanea `NaN`, y una división por cero no siempre da `NaN`.**
    `Math.min`/`Math.max` propagan `NaN`; y `n/0` es `Infinity`, que un clamp a
    `[0,1]` convierte en un **100 % perfectamente creíble**. Cualquier guarda
    contra rangos vacíos tiene que ir **antes** de dividir, no después.
21. **Sanear cada síntoma por separado quita el `NaN` y deja la mentira.**
    `Number.isFinite()` sobre `daysElapsed` y `totalDays` habría producido «día
    258 de ~0»: dos números finitos y una frase falsa. Lo que hay que modelar es
    la **precondición** (¿existe la escala?), no cada resultado.
22. **Una hora distinta en el reloj cambia el número de síntomas.** La batería
    aislada de P12 usaba medianoche exacta y veía 9 coordenadas malas; el
    arranque real, con la hora del sistema, veía 3. Mismo defecto. Cuando una
    prueba aislada y una real no cuadran, mirar primero si el numerador depende
    de `new Date()`.

---

## 10. DOCUMENTOS CANÓNICOS

| Documento | Para qué |
|---|---|
| `claude/pendientes-abiertos.md` | Estado de P1–P11 y de los abiertos de auditoría |
| `claude/auditoria-2026-09-13.md` | Auditoría A–F + sección **ESTADO GLOBAL** con el estado reconciliado |
| `claude/a3-3-paso0-inventario.md`, `a3-3-diseno.md` | Diseño base de A3.3 |
| `claude/a3-3-bloque3-diseno.md` | Bloque 3 + nota de evidencia invalidada (§13.3) |
| `claude/a3-3-bloque4-inventario.md` | Bloque 4 |
| `claude/a3-3-bloque5-borrados.md` | Bloque 5, rev.4 cerrada. Medición de `G:` (§4.10), NO-CLOBBER (§4.7.3), guardián y baseline (§4.11) |
| `claude/a2-restore-bajo-a33.md` | A2 bajo A3.3, rev.2. **§8.1 = lo que falta por probar** |
| `claude/checkpoint-bloque5-2026-09-15.md` | Puntos de restauración verificados |
| `scratchpad/comun/baseline-bd-viva.json` | Baseline de la BD viva con su procedencia |
| `CLAUDE.md` | Reglas fijas del proyecto (entrega, parche `app.asar`, español, sin firma digital) |

**Si hay contradicción, prevalece:** el **estado documentado más reciente**
acompañado de **la evidencia de test correspondiente**. Un documento sin
batería que lo respalde no gana a un resultado de batería.

---

## 11. LO QUE UNA SESIÓN NUEVA **NO** DEBE ASUMIR

- **A2 y P2 SÍ están cerrados** (15 sept 2026, ronda H-1), con la evidencia de
  §4.5 y §8. Lo que **no** se puede dar por probado de A2 sigue siendo: cuotas
  de `localStorage`, corte de corriente real, Drive con dos PCs, y el fallo del
  flush de la **reposición** en Electron real.
- **NO** asumir que las baterías que cuentan llamadas siguen vigentes tras un
  cambio de protocolo. Dos aserciones se quedaron desfasadas exactamente así
  cuando la reposición pasó a volcar a disco (`RA-3` esperaba **un** flush y hay
  **dos**), y no se vio hasta que se rearrancó el arnés. **Una ronda que cambia
  el protocolo tiene que rearrancar también el Electron real, no solo lo
  automatizado.**
- **`flushStorageData()` SÍ está integrado y probado** (R4 de
  `restoreProjectBackup`). Lo que **NO** está probado es que resista un **corte
  de corriente**: pone el dato en el *fichero* del LevelDB, no en el medio
  físico. No es un `fsync`.
- **NO** asumir que la BD viva sigue teniendo un hash anterior: **verificarlo**
  antes de usarlo como baseline. Cambia cuando el usuario usa la app.
- **NO** asumir que `F71F4140…` es producción. **No lo es.**
- **E1 está CERRADO, pero NO asumir que Lista/Resumen funcionan.** Se
  **retiraron de la UI**; siguen incompletas por dentro. Ver §13.
- **NO** asumir que el árbol ya es publicable por haberse cerrado E1: queda
  **D4** (`package.json` 2.0.55 vs código 2.0.56) del mismo párrafo.
- **NO** asumir que la auditoría A–F está terminada. La mayoría de B, C, D, E y F
  sigue pendiente.
- **NO** asumir que ya se puede **empaquetar o publicar**.
- **NO** asumir que las baterías siguen existiendo en disco (ver **AVISO 0**).

---

## 12. REGLA DE ACTUALIZACIÓN

Cada cierre relevante actualiza, en el mismo turno:

1. `claude/pendientes-abiertos.md`;
2. la sección **ESTADO GLOBAL** de `claude/auditoria-2026-09-13.md`;
3. **este handoff**, si la sesión sigue activa.

**No se borra histórico**: solo se actualiza el estado y se añade la referencia
de cierre. Lo invalidado se marca como invalidado, con su motivo, en vez de
desaparecer.
