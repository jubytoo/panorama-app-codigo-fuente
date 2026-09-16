# A2 — RESTAURAR UN BACKUP, BAJO LA ARQUITECTURA A3.3

**rev.2 — CABLEADO PRODUCTIVO HECHO. Pendiente de Electron real.**

> **Estado (15 sept 2026).** El protocolo está en producción: barrera unificada,
> quiesce de las tres familias, base capturada después del quiesce, foto previa
> durable y cifrada, journal con validación cerrada, commit de confirmación con
> marca y `exigirCommitBase`, NO-CLOBBER, recuperación al arrancar, precondición
> del rekey y contrato de tres formas en los dos preloads y los dos renderers.
>
> Evidencia: **53 OK / 0** de integración sobre el código productivo
> (`scratchpad/a2/test-cableado.js`), **66 OK / 0** del helper aislado y
> **1669 OK / 0** de regresión completa. Punto de restauración:
> `claude/checkpoint-bloque5-2026-09-15.md` + los snapshots
> `.ANTES-A2-CABLEADO-2026-09-15` / `.ACTUAL-A2-CABLEADO-2026-09-15`.
>
> **A2 sigue EN CURSO**: falta la validación con `BrowserWindow` real. Lo que
> no se ha probado todavía está en §8.

---

**rev.1 — INVENTARIO + DISEÑO. Nada implementado.**
Fecha: 2026-09-15. Base: `main.js` **10 256** líneas / `db.js` 1753 /
`security.js` 100.

> Nota de medida: las cifras de líneas que di en rondas anteriores (9491, 9773)
> salían de `Measure-Object -Line`, que **descarta las líneas en blanco**. El
> recuento real de `main.js` tras el cableado del Bloque 5 es 10 256. Las
> referencias `archivo:línea` de este documento sí están verificadas una a una
> contra el archivo actual.

Objetivo: comprobar si la restauración corregida en su día (A2, auditoría
2026-09-13) **sigue siendo segura** ahora que existen identidad de commit,
`exigirCommitBase`, journals de archivo (Bloque 4), journals de borrado
(Bloque 5), F-1 GLOBAL, los latches `desincronizada`/`conflicto`/`degradado` y
el quiesce de ventanas de D1.

**Honestidad sobre la evidencia.** Todo lo de este documento es **[LEÍDO]**:
lectura del código actual, con línea. **No se ha ejecutado nada** para esta
fase. Donde digo «puede pasar» es razonamiento sobre el código, no un corte
observado — y lo marco.

**Fuera, por decisión explícita:** Drive con dos PCs reales, conflicto UI
general, cierre/apagado global, empaquetado.

---

## §1. INVENTARIO REAL DEL FLUJO ACTUAL

### 1.1 Puntos de entrada

| # | Camino | Línea | Guardas que aplica |
|---|---|---|---|
| E-a | IPC `backup:restore` (lanzador y ventanita de elegir backup) | `main.js:10105` | **ninguna** |
| E-b | Menú del proyecto → «Restaurar…» | vía `restoreProjectBackup` | las de la propia función |
| E-c | `preload-launcher.restoreBackup(id, backupId)` | `preload-launcher.js:32` | `ipcRenderer.invoke` a secas, **sin** `invokeAccion` |
| E-d | `preload-backup-picker.restoreBackup(backupId)` | `preload-backup-picker.js:19` | ídem |

### 1.2 Orden exacto de `restoreProjectBackup(projectId, backupId)` — `main.js:3094`

```
 0. si restoreInProgress.has(projectId) -> throw            (3095)
 1. SELECT projects  / SELECT backups                       (3098-3103)
 2. readBackupPayload(row, bkRow)                           (3106)
      -> backupsDirForProject(row)                          (2928 -> 1940)
           -> ensureProjectBackupDirSlug(row)               (1931)
                -> si backup_dir es NULL: UPDATE + COMMIT   (1935)
           -> mkdirSync                                     (1943)
      -> si bkRow.encrypted y no hay securityKey -> throw   (2931)
      -> descifra con la clave ACTUAL                       (2936)
 3. restoreInProgress.add(projectId)                        (3108)
 4. cerrar SOLO la ventana de projectWindows, marcada
    __panoramaClosingForRestore, esperando 'closed'         (3112-3140)
      tope RESTORE_CLOSE_TIMEOUT_MS = 8 s -> throw          (3117-3127)
 5. previo = readLocalStorageDumpFromPartition(...)         (3143)   [solo en RAM]
 6. writeLocalStorageDumpToPartition(..., {clearFirst:true})(3148)
      -> ventana oculta + localStorage.clear() + setItem…   (2958-2968)
 7. si falló 6: writeLocalStorage(previo) -> vuelta atrás   (3158)
      si la vuelta atrás TAMBIÉN falla:
        saveRescueDump(row, previo)                         (3164)
          -> backupsDirForProject otra vez (UPDATE/COMMIT)  (3060)
          -> cifra con la clave ACTUAL                      (3062)
        PS-2005, throw                                      (3170)
      si la vuelta atrás fue bien: reabre ventana, PS-2002  (3183-3188)
 8. finally: restoreInProgress.delete(projectId)            (3191)
 9. openProjectWindow(row); return true                     (3194-3195)
```

### 1.3 Qué toca y qué no

- **No escribe en la base de datos… salvo por la puerta de atrás.** El cuerpo del
  restore no hace ningún `INSERT`/`UPDATE`/`DELETE` propio. Pero los pasos 2 y 7
  llaman a `backupsDirForProject()`, que con `backup_dir = NULL` hace
  `UPDATE projects SET backup_dir=?` — **un commit A3.3 completo**, con su
  reescritura del `.sqlite3`. Y el del paso 2 ocurre **antes** de
  `restoreInProgress.add()`.
- **Escribe en la partición Electron** (localStorage del proyecto), que es donde
  vive el estado real del dashboard.
- **Escribe un archivo** solo en el peor camino: `rescate-restauracion-*.json`.

### 1.4 Quién mira `restoreInProgress`

Solo **dos** sitios en todo `main.js`:

| Línea | Quién | Efecto |
|---|---|---|
| `9931` | `backup:save` | rechaza el guardado de ese proyecto |
| `7788` | recuperador de renderers caídos | no ofrece recargar |
| `7699` | aviso de fallo fatal | solo texto informativo |

**No lo miran:** `meeting:savePrep`, `meeting:updatePrep`, **`meeting:deletePrep`**,
`candidateEval:save`, `candidateEval:pickCv`, `candidateEval:removeCv`,
**`projects:delete`**, ni la purga de D3.

### 1.5 Ventanas

`restoreProjectBackup` cierra **solo** `projectWindows` (3112). Las ventanas de
`meetingPrepWindows` y `candidateEvalWindows` **del mismo proyecto** siguen
abiertas y escribiendo durante todo el restore. El Bloque 5 ya resolvió esto
para el borrado con `cerrarVentanasDeProyecto()` (`main.js:5639`); **el restore
no la usa**.

### 1.6 Flush al cerrar

`attachFlushOnClose` (2612) respeta `__panoramaClosingForRestore` y deja cerrar
en el acto. El propio comentario (2622-2626) ya dice que eso **no basta**: lo
que impide de raíz el backup del estado descartado es la guarda de
`restoreInProgress` en `backup:save`. Eso **sigue siendo cierto y sigue
funcionando**.

### 1.7 Recuperación al arrancar

La secuencia de arranque recupera, por este orden: **rekey** → **acciones**
(Bloque 4) → **borrados** (Bloque 5) → vacuum → login → migraciones → lanzador.

**No hay ninguna recuperación de restore.** `restoreInProgress` es un `Set` en
memoria; tras un corte no queda ni un rastro en disco de que hubiera una
restauración en curso.

---

## §2. HALLAZGOS

Respuesta directa a los doce puntos, con su marca de evidencia.

| # | Hallazgo | Gravedad |
|---|---|---|
| **R1** | **El restore puede empezar con un commit.** `readBackupPayload` → `backupsDirForProject` → `ensureProjectBackupDirSlug`: con `backup_dir = NULL`, `UPDATE` + commit **antes** de tomar `restoreInProgress`. Misma clase que `DEL-LEGACY-SLUG`, que el Bloque 5 ya resolvió con rutas puras. Y se repite en `saveRescueDump`. **[LEÍDO]** | Alta |
| **R2** | **`restoreInProgress` cubre un solo canal.** Durante un restore, reunión, candidatos, CV, borrado de preparación, borrado del proyecto y purga siguen operando sobre el mismo proyecto. **[LEÍDO]** | Alta |
| **R3** | **Quiesce incompleto.** Solo se cierra la ventana del dashboard. Reunión y candidatos siguen vivas. **[LEÍDO]** | Alta |
| **R4** | **`backup:restore` no tiene ninguna guarda.** Ni `procesoComprometido` (B2), ni `rekeyInProgress` (A1), ni `proyectoBloqueadoPorBorrado` (D1). Es el **único** canal mutante que quedó sin ninguna. **[LEÍDO]** | Alta |
| **R5** | **Sin base y sin journal.** No captura `db_commit_id`, no usa `exigirCommitBase`, no escribe journal. Si la BD avanza entre elegir el backup y aplicarlo, nadie se entera. **[LEÍDO]** | Alta |
| **R6** | **Fuera de F-1 y de la exclusiva.** Un journal propio pendiente de Bloque 4 o 5 no impide restaurar, y el restore no toma la exclusiva de operación del Bloque 3. **[LEÍDO]** | Media |
| **R7** | **Corte durante el restore: cero recuperación.** Entre `clear()` y el último `setItem` la partición queda a medias, y el arranque no lo mira. **[LEÍDO]** | **Crítica** |
| **R8** | **Sin contrato de acción.** Devuelve `true` o lanza. El lanzador escribe «Backup restaurado y proyecto reabierto.» sin comprobar nada (`launcher/renderer.js:249-250`), y su preload no pasa por `invokeAccion`. Es la misma clase de defecto que el Bloque 4 cerró en las otras cuatro acciones. **[LEÍDO]** | Alta |
| **R9** | **La foto previa vive solo en RAM** (`previo`, 3143) y el rescate en disco **solo** se escribe si la vuelta atrás también falla (3164). En una muerte del proceso no hay foto de nada. **[LEÍDO]** | **Crítica** |
| **R10** | **Copia de rescate huérfana ante un rekey.** `saveRescueDump` cifra con la clave actual, pero `rescate-restauracion-*.json` **no tiene fila** en ninguna tabla y `collectRekeyInventory` (3497) solo inventaría archivos con fila. Un cambio de contraseña posterior la deja cifrada con una clave que ya no se puede derivar: **ilegible para siempre**. Es exactamente el fallo A1 que se cerró, reaparecido por una puerta lateral. **[LEÍDO]** | **Crítica** |
| **R11** | **Restore y borrado pueden solaparse.** `deleteProjectById` no mira `restoreInProgress`, y el restore no mira `proyectosEnBorrado`. **[LEÍDO]** | Alta |
| **R12** | **El tope de 8 s decide sin saber.** Si la ventana no cierra en 8 s se aborta — correcto —, pero `__panoramaClosingForRestore` se pone a `false` (3120) mientras la ventana **puede seguir cerrándose**: a partir de ahí su cierre sí pide el guardado final, que `backup:save` rechazará por `restoreInProgress`… salvo que el `finally` ya lo haya quitado. Ventana de carrera estrecha. **[LEÍDO, no observado]** | Media |

---

## §3. ESTADOS PROHIBIDOS

1. **Partición a medias sin nadie que lo sepa.** `localStorage` vaciado y
   repoblado solo en parte, sin journal ni marca: el usuario abre el proyecto y
   ve un estado que nunca existió.
2. **El estado descartado convertido en el backup más reciente.** Es el defecto
   original de A2; hoy lo impide `restoreInProgress` en `backup:save`, pero solo
   ahí.
3. **Restaurar sobre un proyecto que se está borrando**, o borrar uno que se está
   restaurando.
4. **Restaurar con un journal propio pendiente** de Bloque 4 o 5: se escribe
   encima de un estado que la recuperación todavía tiene que decidir.
5. **Restaurar mientras se re-cifra** (A1): el backup se descifra con una clave
   que puede dejar de ser la vigente a mitad.
6. **Copia de rescate cifrada fuera del inventario de rekey** (R10).
7. **Un commit disparado por el propio restore** antes de haber tomado ningún
   bloqueo (R1).
8. **Decir «restaurado» sin haberlo comprobado** (R8).
9. **Reunión o candidatos escribiendo durante el restore** (R2, R3).

---

## §4. PROTOCOLO PROPUESTO

Mismo esqueleto que el Bloque 5, porque el problema es el mismo: una operación
con mitad en disco y mitad en otro sitio.

### 4.1 Fases — CORREGIDO: armar ANTES de cerrar, capturar DESPUÉS

La rev.0 de este documento proponía capturar la base **antes** del quiesce. Eso
está mal por dos motivos a la vez, y los dos ya los habíamos visto:

- **cerrar ventanas puede mover el commit** (lo demostró E1 del Bloque 5: el
  cierre dispara el guardado final por el camino de siempre), así que una base
  capturada antes del quiesce llega inválida a F4;
- y en un restore **no queremos** que ese cierre haga su flush/backup: ese
  estado es justo el que se ha pedido descartar.

Son dos cosas distintas y necesitan dos fases distintas:

```
F-2  ARMAR RESTORE  — antes de tocar NINGUNA ventana
       - registrar el proyecto en la BARRERA DE RESTAURACIÓN (§4.1.1)
       - esa barrera hace, para ESE proyecto:
           · los close hooks NO piden flush y NO crean backup
           · no se acepta ninguna mutación local suya
       - guardas del canal (§4.5). Si alguna cierra: no aplicado, nada tocado.

F-1  QUIESCE
       - cerrarVentanasDeProyecto(id): las TRES familias
       - esperar de verdad 'closed', con tope
       - comprobar que no queda ningún writer local del proyecto
       - si el tope salta: abortar SIN haber tocado nada, y desarmar limpio

F0   CAPTURAR  — solo ahora, con todo quieto
       - base = dbmod.getCommitActual()          <- después del quiesce
       - rutas PURAS (rutaBackupsPura), NUNCA backupsDirForProject
       - fila del backup + sha256 del archivo elegido + su tamaño
       - inventario del estado previo de la partición
       - reserva del subárbol del proyecto en el dominio de ocupación común

F1   FOTO PREVIA DURABLE  (§4.3)  — antes de tocar la partición

F2   JOURNAL durable, validación CERRADA (§4.3.1)

F3   APLICAR: clear() + setItem en la partición

F4   CONFIRMAR: relectura de la partición y comparación por hash con el dump
     esperado. Solo entonces, UN escribirMultiple con la marca de acción y
     exigirCommitBase (§4.4).

F5   PURGAR: borrar previo.enc y el journal, desarmar la barrera, reabrir.
```

Así el quiesce no invalida la base, y el cierre no escribe el estado que se
está descartando.

### 4.1.1 La barrera de restauración

`restoreInProgress` se queda corto: hoy lo miran **dos** sitios (§1.4). La
barrera tiene que cubrir, para ese proyecto:

| Canal | Hoy | Con la barrera |
|---|---|---|
| `backup:save` | ya bloqueado | sigue |
| `meeting:savePrep` / `meeting:updatePrep` | libre | bloqueado |
| `meeting:deletePrep` | libre | bloqueado |
| `candidateEval:save` | libre | bloqueado |
| `candidateEval:pickCv` / `removeCv` | libre | bloqueado |
| `projects:delete` (D1) | libre | bloqueado |
| purga de backups (D3) | libre | bloqueado |
| flush/backup de los close hooks | solo el del dashboard | las tres familias |
| reapertura de ventanas del proyecto | libre | bloqueada |

Es el mismo patrón que `proyectosEnBorrado` de D1, y por simetría D1 debe mirar
también la barrera de restauración: **un proyecto no puede estar a la vez en
borrado y en restauración** (R11).

**Y deja de ser solo de memoria.** El journal de F2 es lo que hace la barrera
durable entre arranques: mientras exista una restauración pendiente de ese
proyecto, la barrera se vuelve a armar al arrancar, antes de nada.

Pruebas obligatorias:

- **REST-QUIESCE-BASE** — dashboard + reunión + candidatos abiertos, datos
  modificados en memoria, se inicia el restore, se cierran las ventanas por el
  restore: **cero** backup/flush/escritura provocados por esos cierres, la base
  se captura DESPUÉS y F4 confirma contra exactamente esa base.
- **REST-NO-STALE-BACKUP** — el estado descartado no reaparece nunca como
  backup nuevo durante el restore.

### 4.2 Qué contiene la foto previa, exactamente

El journal **no puede depender de una variable en RAM** para saber cómo
deshacer. Si el proceso muere justo después del primer `setItem`, el siguiente
arranque tiene que poder decidir **solo con disco + journal + BD**.

Todo el material vive bajo `.panorama-restauraciones/<action_id>/`:

```
.panorama-restauraciones/<action_id>/
    journal.json     metadatos y estado del protocolo
    previo.enc       la foto previa, cifrada si hay clave
    rescate.enc      solo si hubo que renunciar (equivalente al PS-2005 de hoy)
```

`previo.enc` contiene el volcado que permite volver al estado pre-restore:

| Campo | Para qué |
|---|---|
| `v` | versión del formato |
| `project_id`, `partition` | a qué proyecto y partición pertenece — sin esto, una foto suelta no se puede atribuir |
| `action_id`, `writer` | a qué operación y a qué equipo pertenece |
| `base_commit_id` | la base capturada en F0 |
| `tomadaEn` | cuándo |
| `claves` | el volcado completo de `localStorage`, clave → valor, tal cual |
| `n_claves`, `bytes` | tamaño, para detectar un truncamiento |

Y en `journal.json`, además de lo anterior: `previo_sha256` y `previo_size`
(hash y tamaño **del archivo cifrado**, no del claro), `backup_id`,
`backup_sha256`, `esperado_sha256` (hash del dump que se va a aplicar),
`fase` (`aplicando` | `limpiando`), `startedAt`.

**Regla:** una `previo.enc` cuyo `sha256` no case con el journal **no se usa
para reescribir nada**. Se conserva y se va a fail-closed. Reponer una partición
desde una foto que no se puede demostrar es peor que no reponerla.

### 4.2.1 Validación del journal

Cerrada, con el mismo criterio que §4.7.2 del Bloque 5: un JSON parseable pero
incompleto **no es evidencia**. Campos obligatorios, tipos y rangos
comprobados uno a uno; cualquier fallo → la restauración no se resuelve, no se
purga y no se repone.

### 4.3 Recuperación al arrancar

Se añade `recuperarRestauracionesPendientes()` **después** de la de borrados:

- **marca presente** → la restauración se confirmó: purgar `previo.json` y el
  journal. No reponer.
- **marca ausente** → no se confirmó: reponer la partición desde `previo.json`
  tras comprobar su `sha256`, y purgar.
- **marca no demostrable**, o `previo.json` que no casa con su hash → **fail-closed**
  con PS-2006, conservando todo. No se reescribe una partición con una foto que
  no se puede demostrar.

### 4.4 El commit de confirmación

El restore cambia la **partición**, no filas SQL. Aun así necesita una prueba
durable de que se confirmó, y esa prueba es la misma que usan los Bloques 4 y 5:

**UN `escribirMultiple` con la marca `acciones_<writer>` y `exigirCommitBase`,
aunque no lleve ningún otro DML funcional.** Ese commit *es* el punto de
confirmación A3.3 del restore.

- **antes** de esa marca → la recuperación repone `previo`;
- **después** → no se vuelve atrás nunca; se completa y se limpia.

Misma semántica que B5/B6 del Bloque 5, y por tanto la forma 3
(`aplicado:true / verificado:false`) significa aquí exactamente lo mismo: la
restauración **sí** está aplicada, no se deshace, y la sesión se cierra.

### 4.5 Guardas del canal `backup:restore`

Deja de ser el único mutante sin ninguna. Antes de empezar, y en este orden:

1. `procesoComprometido` (B2)
2. `bloqueoDeSeguridad()` (Bloque 3: `rollback-incompleto` / `revalidacion`)
3. `rekeyInProgress` **o** journal de rekey presente (A1)
4. **F-1 GLOBAL**: ningún journal propio pendiente de acciones **ni** de borrados
5. ninguna restauración propia pendiente
6. el proyecto no está en `proyectosEnBorrado`
7. la base es legible y no está en `desincronizada` / `bd-ilegible`

Contrato: las tres formas comunes, y `invokeAccion` en **los dos** preloads que
hoy llaman en crudo (`preload-launcher.js:32`, `preload-backup-picker.js:19`).
El lanzador decide por `aplicado`, nunca por truthiness — hoy escribe «Backup
restaurado y proyecto reabierto.» sin mirar nada (`launcher/renderer.js:250`).

### 4.6 Rutas puras (R1)

Durante la preparación de un restore, ni `readBackupPayload` ni `saveRescueDump`
pueden llamar a helpers que hagan `ensureProjectBackupDirSlug()`, `mkdirSync()`
incidental o cualquier `dbmod.run()`. Se resuelven con `rutaBackupsPura(row)`,
igual que D1.

Prueba: **REST-LEGACY-SLUG** — con `backup_dir = NULL`, preparar el restore no
cambia el commit, no hace ningún `UPDATE` lateral y no crea ninguna carpeta.

### 4.7 Rescate, material cifrado y rekey (R10) — opción (c), ampliada

Aprobada la **(c)**: material cifrado, borrado siempre al terminar, y el rekey
no empieza mientras exista material de restauración pendiente.

Pero «restauración pendiente» **no puede significar solo «hay un journal
activo»**. Falta este camino:

```
restore termina bien -> BD y partición correctas -> falla el cleanup ->
el journal se retira o se marca terminado -> queda previo.enc o rescate.enc
cifrado con la clave A -> el usuario cambia la contraseña ->
ese archivo queda ILEGIBLE PARA SIEMPRE
```

Por eso la precondición se formula sobre **el material**, no sobre el journal:

> **El rekey NO empieza si `.panorama-restauraciones/` contiene una
> restauración que no esté COMPLETAMENTE limpiada** — es decir, si queda
> cualquier `<action_id>/` con algo dentro, journal o no.

Primero se resuelve el recovery, o se completa un cleanup demostrable; después
el rekey. Esto **no amplía el inventario de A1**: solo le añade una
precondición de exclusión, igual que F-1 GLOBAL.

Pruebas:

| Id | Escenario | Esperado |
|---|---|---|
| **REST-REKEY-1** | journal de restore pendiente | el rekey **no empieza** |
| **REST-REKEY-2** | restore aplicado, cleanup pendiente (queda `previo.enc` sin journal) | el rekey **tampoco empieza** |
| **REST-REKEY-3** | cleanup completo, carpeta vacía o ausente | rekey permitido |
| **REST-REKEY-4** | material de restore inválido o ilegible | **fail-closed**; nunca asumir que es basura y borrarlo |

---

## §5. MATRIZ DE CORTES PROPUESTA

`P` = partición · `J` = journal · `F` = foto previa en disco

| # | Corte | P | F | J | Marca | Resultado esperado | Pérdida |
|---|---|---|---|---|---|---|---|
| **A1** | tras F0, antes del quiesce | intacta | — | — | — | nada que deshacer | no |
| **A2** | tras el quiesce, antes de la foto | intacta | — | — | — | reabrir ventana; nada tocado | no |
| **A3** | tras la foto, antes del journal | intacta | sí | — | — | foto huérfana: se purga al arrancar | no |
| **A4** | tras el journal, antes del `clear()` | intacta | sí | sí | no | reponer (no-op) y purgar | no |
| **A5** | **en mitad del `clear()`+`setItem`** | **a medias** | sí | sí | no | reponer desde la foto y purgar | no |
| **A6** | tras aplicar, antes de confirmar | nueva | sí | sí | no | **reponer**: sin marca no hay restauración | no |
| **A7** | commit confirmado, corte antes de purgar | nueva | sí | sí | **sí** | NO reponer; purgar | no |
| **A8** | `aplicado:true / verificado:false` | nueva | sí | sí | sí | forma 3; no deshacer; reiniciar | no |
| **A9** | `base-cambiada` en F5 | nueva | sí | sí | no | reponer todo; IPC reintentable | no |
| **A10** | `previo.json` no casa con su hash | ? | corrupta | sí | no | **fail-closed**: no se reescribe nada | no |
| **A11** | journal propio pendiente de Bloque 4/5 | intacta | — | — | — | la restauración **no empieza** | no |
| **A12** | el proyecto está en `proyectosEnBorrado` | intacta | — | — | — | no empieza | no |
| **A13** | `rekeyInProgress` activo | intacta | — | — | — | no empieza (A1) | no |
| **A14** | la ventana no cierra en 8 s | intacta | — | — | — | aborta antes de tocar nada; el bloqueo se libera limpio | no |
| **A15** | segundo arranque tras cada caso | — | — | — | — | idempotente; A10 sigue fail-closed | no |

Y las pruebas cruzadas, todas obligatorias:

| Id | Escenario | Esperado |
|---|---|---|
| **REST-QUIESCE-BASE** | tres ventanas abiertas con datos en memoria; el restore las cierra | cero backup/flush/escritura por esos cierres; base capturada DESPUÉS; F4 confirma contra esa base |
| **REST-NO-STALE-BACKUP** | el estado descartado durante el restore | no reaparece nunca como backup nuevo |
| **REST-W-SUBTREE** | otro equipo reserva la carpeta del proyecto mientras se restaura | el restore no empieza (`ocupado-otro-writer`) |
| **REST-X1** | journal de acción ajeno sobre `estado.json` del proyecto | el restore no empieza |
| **REST-NO-CLOBBER** | la partición reaparece poblada entre la foto y la reposición | no se pisa; fail-closed; foto y journal conservados |
| **REST-LEGACY-SLUG** | `backup_dir = NULL` | preparar no cambia el commit, sin `UPDATE` ni `mkdir` laterales |
| **REST-REKEY-1..4** | §4.7 | según la tabla de allí |
| **REST-COL-1/2/3** | colisiones de recovery | §5.1 |

### 5.1 Colisiones entre recoveries — regla y orden

Orden en el arranque: **rekey → acciones → borrados → restauraciones** → vacuum
→ login → migraciones → lanzador. Las restauraciones van las últimas porque
reponer una partición necesita que el estado de los archivos ya esté decidido
por las tres anteriores.

**Regla general:** un mismo recurso o proyecto solo puede tener **UN** protocolo
mutante pendiente. Dos recoveries no pueden gobernar el mismo recurso.

| Id | Colisión | Qué debe pasar |
|---|---|---|
| **REST-COL-1** | journal de **restore** sobre el proyecto X + journal de **acción** (Bloque 4) cuyo destino cae dentro de X | Estado prohibido: no debió poder crearse, porque F-1 GLOBAL y la reserva de subárbol lo impiden. Si aparece igualmente → **fail-closed**, PS-2006, sin resolver ninguno de los dos. No se elige un ganador |
| **REST-COL-2** | journal de **restore** de X + journal de **borrado** (D1) de X | Igual: prohibido por construcción (la barrera de restauración y `proyectosEnBorrado` se excluyen). Si aparece → **fail-closed** |
| **REST-COL-3** | journal de restore de X + journals de **otro** proyecto Y | **No es colisión.** Cada recovery resuelve lo suyo; ninguno bloquea al otro. Es el caso normal y debe seguir funcionando |

Lo importante de REST-COL-1 y 2: son estados que el protocolo **impide crear**.
La prueba no es que se resuelvan bien, sino que **si alguien los fabrica a mano,
nadie los resuelve a medias**.

---

## §6. QUÉ DEL A2 ANTIGUO SIGUE VÁLIDO Y QUÉ QUEDA OBSOLETO

### Sigue válido, y no hay que tocarlo

| Pieza | Por qué |
|---|---|
| Leer y **validar el backup antes de cerrar nada** (3104-3106) | Sigue siendo el orden correcto: un backup corrupto o cifrado sin clave no llega a tocar la ventana |
| `__panoramaClosingForRestore` + `attachFlushOnClose` (2631) | Evita esperar 4 s por un guardado que se va a rechazar |
| La guarda de `restoreInProgress` en `backup:save` (9931) | Es lo que impide de raíz que el estado descartado se convierta en el backup más reciente. **El defecto original de A2 sigue cerrado** |
| Esperar de verdad al `'closed'`, con tope (3116-3134) | Correcto; el tope evita quedarse colgado |
| No reintentar cuando la vuelta atrás falla (3162-3179) | Correcto: fail-closed con PS-2005 |
| Comprobación de identidad en el `'closed'` de `openProjectWindow` (2780) | Sigue siendo necesaria |

### Queda obsoleto o insuficiente bajo A3.3

| Pieza | Qué la deja corta |
|---|---|
| **La foto previa en RAM** (3143) | Bloque 5 demostró que una operación en dos mitades necesita su rastro en disco. → F2 |
| **`restoreInProgress` como único bloqueo** | Hoy hay tres familias de ventanas, dos tipos de journal y un bloqueo por proyecto. → F-1 GLOBAL + `proyectosEnBorrado` |
| **Cerrar solo `projectWindows`** | D1 ya cierra las tres. → `cerrarVentanasDeProyecto()` |
| **`backupsDirForProject` en el camino de preparación** | El Bloque 5 lo prohibió con rutas puras. → `rutaBackupsPura` |
| **Devolver `true`** | El Bloque 4 impuso el contrato de tres formas. → `invokeAccion` en los dos preloads |
| **Sin `exigirCommitBase`** | Todo lo demás ancla su mutación. → F5 |
| **Sin recuperación al arrancar** | Rekey, acciones y borrados ya la tienen. → `recuperarRestauracionesPendientes()` |
| **`saveRescueDump` cifrando fuera del inventario de rekey** | Reabre por un lateral el fallo A1. → §4.4 |
| **`backup:restore` sin guardas B2/A1/D1** | Es el único canal mutante sin ninguna |

---

## §7. MEDICIÓN — ¿cuánto cuesta la foto previa?

### 7.1 Lo primero: cuánto ocupa de verdad

Medido **sobre los datos reales del usuario, solo leyendo tamaños**, nada más.

Un backup es literalmente `JSON.stringify(localStorage entero)` — es decir,
**exactamente la misma cosa** que la foto previa. Los 262 backups en
`G:\Mi unidad\BD-PanoramaServicio\backups\`:

| | tamaño |
|---|---|
| mínimo | 0,7 KB |
| **mediana** | **291 KB** |
| media | 388 KB |
| **máximo** | **1,53 MB** |
| total de los 262 | 99,4 MB |

Y la carpeta `Local Storage` de cada partición, que es lo que se serializa:
entre 1 KB y **1,73 MB**, siendo 1,73 MB el mayor de los 17 proyectos.

**Conclusión: la foto previa es de menos de 2 MB, no de decenas ni de
cientos.** El `Partitions/` de 849 MB que se ve a primera vista es
abrumadoramente caché de Chromium —un solo proyecto tiene 673 MB de caché
frente a 1,7 MB de `Local Storage`— y el restore **no lo toca**.

### 7.2 Coste de lo que F2 añade al camino crítico

`escribirBufferDurable` y `sha256DeArchivo` son los **reales de `main.js`**,
extraídos; el cifrado es el `security.js` real.

| Caso | cifrado | serializar | cifrar | escribir (con fsync) | releer+hash | **TOTAL** |
|---|---|---|---|---|---|---|
| **DISCO LOCAL** | | | | | | |
| ~300 KB (mediana real) | 402 KB | 1,0 ms | 2,4 ms | 5,3 ms | 8,7 ms | **17,4 ms** |
| ~1,5 MB (máximo real) | 2 060 KB | 4,2 ms | 11,0 ms | 14,6 ms | 18,4 ms | **48,2 ms** |
| ~5 MB (margen) | 6 830 KB | 21,6 ms | 72,6 ms | 68,0 ms | 17,1 ms | 179,2 ms |
| ~16 MB (sonda) | 21 853 KB | 68,2 ms | 254,0 ms | 169,6 ms | 57,6 ms | 549,4 ms |
| **`G:` (el filesystem real)** | | | | | | |
| ~300 KB (mediana real) | 402 KB | 1,0 ms | 2,6 ms | 21,2 ms | 24,2 ms | **49,0 ms** |
| ~1,5 MB (máximo real) | 2 060 KB | 3,7 ms | 14,9 ms | 32,3 ms | 29,8 ms | **80,6 ms** |

El descifrado (15,6 ms / 75,4 ms en `G:`) **solo se paga en la recuperación**,
no en el camino feliz.

### 7.3 Veredicto

**No hay sorpresa de tamaño ni de coste.** En el sistema de archivos real, F2
añade **49 ms** al caso mediano y **81 ms** al peor caso real. Para comparar:
el restore de hoy ya espera el cierre de una ventana (hasta 8 s de tope) y abre
dos `BrowserWindow` ocultas. 49–81 ms no se notan dentro de eso.

La sonda de 16 MB —diez veces el máximo real— cuesta 549 ms en local: aunque el
formato creciera un orden de magnitud, seguiría siendo tolerable. No hay ningún
acantilado cerca.

**Límite, sin rebajarlo:** esto mide el sistema de archivos de **este PC**, con
`G:` montado por Drive. No demuestra nada sobre propagación a la nube ni sobre
dos equipos. Y el coste de escribir en `localStorage` no se ha medido porque
**no es coste nuevo**: ya se paga hoy.

---

## §8. LO QUE ESTE DOCUMENTO **NO** DICE

- **No se ha ejecutado nada.** Ningún hallazgo de §2 se ha reproducido en vivo;
  todos son lectura de código con línea. R12 en particular es una carrera
  razonada, no observada.
- No dice nada sobre **Drive con dos PCs reales**: todo lo de aquí es
  comportamiento de un solo equipo.
- No propone tocar **A1** (salvo la opción (a) de §4.4, que precisamente por eso
  no es la recomendada) ni el **conflicto UI general**, ni el **cierre/apagado
  global**, ni el **empaquetado**.
- El coste de F2 **sí** está medido (§7), pero sobre el filesystem de este PC.
  No dice nada de propagación de Drive ni de dos equipos.
- **`previo.enc` se escribe donde vive `userData`**, o sea en `G:` en esta
  instalación. Eso significa que una restauración deja durante unos segundos un
  archivo con el contenido del proyecto en la carpeta sincronizada. Es el mismo
  sitio donde ya viven los backups, así que no es información nueva expuesta —
  pero conviene decirlo en voz alta antes de implementarlo, no después.
- **No he verificado en vivo ninguna de las colisiones de §5.1.** Están
  razonadas sobre el código; la prueba llega con el helper.

### 8.1 Lo que sigue sin probarse tras el cableado (rev.2)

La integración ejecuta las funciones REALES de `main.js`, incluidas
`readLocalStorageDumpFromPartition` y `writeLocalStorageDumpToPartition` con su
script de `clear()` + `setItem` tal cual, evaluado contra un `localStorage` de
verdad. Lo que **no** cubre, y solo cierra un arranque Electron real:

1. **El `BrowserWindow` oculto** en sí: `loadFile`, el ciclo de vida de la
   ventana auxiliar y el `executeJavaScript` real de Electron.
2. **El `localStorage` de Chromium**: cuotas, persistencia en LevelDB y qué pasa
   si el `clear()` no llega a disco antes de un corte del proceso.
3. **El cierre real de las tres ventanas**, con sus `beforeunload` y sus
   renderers de verdad. La integración usa dobles con la misma semántica de
   `once('closed')` + `close()`.
4. **El tope de 8 s del quiesce con una ventana que de verdad se niega**: se
   probó con un doble que nunca emite `'closed'`.
5. **El diálogo PS-2006** de la recuperación al arrancar, y que la app cierre.
6. **La reapertura** al terminar (`openProjectWindow` está sustituida por un
   contador en el arnés).
7. **El rekey real** con material pendiente: se comprueba `rekeyPuedeEmpezar()`
   y su posición antes de la exclusiva, no un re-cifrado completo.

---

## §9. BARRERA DURABLE DEL `localStorage` (rev.3 — 15 sept 2026)

### 9.1 El hueco

`writeLocalStorageDumpToPartition` hace `clear()` + `setItem()` dentro de una
ventana oculta y la cierra. Eso deja el dato en la capa de Chromium, **no en
disco**. Entre ese momento y el commit de confirmación de R5 —la marca que dice
«esto ya está aplicado, no se vuelve atrás nunca»— había una ventana en la que
un corte del proceso dejaba **la marca puesta y la partición sin los datos**, y
además con la foto previa ya borrada por el cleanup: el usuario cree que ha
restaurado, no ha restaurado, y ya no hay vuelta atrás.

### 9.2 Qué se ha implementado

Una sola línea, dentro del `try` de R4, inmediatamente después de aplicar:

```js
await session.fromPartition(row.partition_name).flushStorageData();
```

Va **dentro** del `try` de R4 a propósito: si fallara, el tratamiento correcto
es el de un fallo al aplicar —reponer desde la foto previa y devolver
`aplicado:false`—, que ya estaba probado. No añade ninguna rama nueva.

### 9.3 Qué hace de verdad `flushStorageData()` — medido, no leído

Sonda `a2/probe-flush3.js`, Electron 30.5.1 / Chromium 124, partición
`persist:`, 5 repeticiones, ventana de observación de 0,56–1,06 ms:

| | |
|---|---|
| Existe en la sesión | sí, aridad 0 |
| Qué devuelve | **`undefined`, NO una promesa** |
| Coste de la llamada | 0,032–0,066 ms |
| Antes de llamarla, el valor en `Local Storage\leveldb\000003.log` | **no está** (5/5) |
| Después, dentro del ms siguiente | **sí** (5/5), 78 → 175 bytes |
| Sin llamarla, ¿llega solo? | sí, en **~103 ms** (sonda v2, brazo de control) |
| Sobre partición vacía / llamada repetida | no lanza |

El `await` no espera a nada hoy —se `await`ea un `undefined`—; está puesto para
que siga siendo correcto si una versión futura la hiciera asíncrona.

> **Límite, sin rebajarlo:** esto demuestra que el dato llega al **fichero** del
> LevelDB. **No** demuestra que el sistema operativo lo haya bajado al medio
> físico. No es un `fsync` y no se comporta como tal ante un corte de corriente.

### 9.4 La prueba que justifica el cambio (diferencial)

`a2/electron-flush-diff.ps1` ejecuta el **mismo** escenario RA-5 —matar el
proceso con `TerminateProcess` justo **después** del commit de confirmación y
**antes** del cleanup— en dos brazos, y reinicia la app para ver qué quedó:

| Brazo | En el instante del corte | Tras reiniciar |
|---|---|---|
| **Con barrera** (`main.js` productivo) | el dato del backup **ya está** en `000003.log` (4/4) | **4/4 coherente**: la partición tiene el backup |
| **Sin barrera** (copia revertida) | el dato **no está** (4/4) | **0/4**: la marca dice «aplicado» y la partición conserva el estado ANTERIOR |

Es el defecto exacto que la barrera cierra, **reproducido**, no razonado.

Dos correcciones de método que hicieron falta para llegar a esto, y que conviene
no repetir:

- **`process.exit()` no vale como corte.** Es una salida ordenada y Chromium
  todavía vuelca su almacenamiento al cerrar: con `process.exit()` el brazo
  *sin* barrera salía coherente **por el camino equivocado** (4/4). Hay que
  terminar el proceso con `TerminateProcess` (`SIGKILL` en Windows).
- **Sin el brazo de control no se puede afirmar nada.** Una primera sonda
  «antes 0 ficheros / después 1» parecía concluyente y no lo era: el dato llega
  solo en ~103 ms, así que sin medir el brazo sin flush no se distingue «la
  barrera lo escribió» de «se escribió por su cuenta mientras mirábamos».

### 9.5 Estado de §8.1 tras los arranques Electron reales

Arnés `real-run/a2.js` + `a2/electron-real.ps1`, sandbox artificial, seis modos:
**40 OK / 0 FALLOS**.

| §8.1 | Qué era | Estado | Dónde |
|---|---|---|---|
| 1 | El `BrowserWindow` oculto de verdad | **cubierto** | RA-1 |
| 2 | `localStorage` de Chromium: LevelDB y corte del proceso | **cubierto** | RA-1, RA-5, diferencial §9.4 |
| 3 | Cierre real de las tres ventanas | **cubierto** | RA-1 |
| 4 | Tope de 8 s con una ventana que de verdad se niega | **cubierto** | RA-2 (`beforeunload` real, 8 072 ms) |
| 5 | Recuperación al arrancar | **cubierto en su camino real** | RA-5b |
| 6 | Reapertura | **cubierto** | RA-1 (ventana nueva por identidad) |
| 7 | Rekey real con material pendiente | **cubierto** | RA-6 (`security-win:submit` real) |

**Lo que sigue SIN cubrir, dicho en voz alta:**

- **El diálogo PS-2006 con la app cerrándose de verdad.** RA-5b recorre el
  camino demostrable (restauración confirmada → limpieza), donde no hay diálogo.
  El camino *no demostrable* —el que sí abre PS-2006 y llama a `app.quit()`— no
  se ha provocado en A2; en el Bloque 5 sí (E7), con `app.quit` anotado en vez
  de ejecutado.
- **Cuotas de `localStorage`.** No se ha probado un volcado que las agote.
- **Un corte de corriente real.** `TerminateProcess` mata el proceso sin
  manejadores, pero los bytes ya escritos siguen en la caché del sistema
  operativo y el SO los baja igual. Esto prueba «el proceso muere sin poder
  limpiar», no «se va la luz».
- **Drive con dos PCs.** Fuera de alcance, como siempre.

### 9.6 Hallazgo abierto (NO implementado)

`reponerParticionDesdePrevio()` —la vuelta atrás y la recuperación al
arrancar— **no** llama a `flushStorageData()`. Queda fuera del cambio
autorizado, así que no se ha tocado. La prueba `REST-FLUSH-5` fija ese hecho por
escrito para que no se confunda con un olvido: si algún día se añade, la prueba
salta y obliga a revisarlo.

Razonamiento (no verificado): el riesgo ahí es menor, porque tras reponer **no**
se escribe ninguna marca que diga «aplicado» —la ausencia de marca es
justamente lo que hace que la recuperación vuelva a reponer en el siguiente
arranque—, así que un corte no consolida un estado falso. Pero es razonamiento
leyendo el código, no medición. **Decisión del usuario.**

> **CERRADO el 15 sept 2026 (rev.4).** El usuario autorizó implementarlo.
> `reponerParticionDesdePrevio()` ahora relee la partición y llama a
> `flushStorageData()` **antes** de que nadie limpie el material, y solo
> entonces devuelve `'repuesto'`. Pruebas: `REST-ROLLBACK-FLUSH-1/2/5` y la de
> relectura; reversiones `G-sin-flush-rollback` y `H-sin-relectura`.

---

## §10. H-1 — BARRERA PERSISTENTE DE RESTAURACIÓN (rev.5 — 15 sept 2026)

### 10.1 El defecto, y cómo se encontró

`REST-ROLLBACK-FLUSH-2` —fallo del `flushStorageData()` de la **reposición**—
dejaba el sistema en el estado correcto en disco: journal conservado,
`previo.enc` conservado, cero cleanup, ventana sin reabrir, contrato
`aplicado:false / accion-no-demostrable`. Y aun así **la batería observó que un
`backup:save` del mismo proyecto se aceptaba en esa misma sesión**.

Dos causas independientes, las dos reales y leídas en el código:

1. **La semántica de `armado` estaba invertida respecto a su uso.** Los tres
   caminos fail-closed hacían `armado = true` justo antes de devolver, con la
   intención evidente de conservar la barrera. Pero `desarmarSiProcede()` leía
   `armado === true` como «la barrera sigue puesta, hay que quitarla», y el
   `finally` la llamaba **siempre**. Poner `armado = true` era, literalmente, la
   garantía de que la barrera se soltaba.
2. **`f1Global()` no miraba `.panorama-restauraciones`.** Miraba acciones y
   borrados. Tras un reinicio, el Set en memoria está vacío y el journal era la
   única evidencia que quedaba: nadie la consultaba en el camino de las
   mutaciones.

Propiedad que faltaba, y que ahora se exige:

> **RESTORE NO RESUELTO → el proyecto sigue bloqueado para mutaciones nuevas
> hasta que la recuperación lo resuelva o se reinicie.**

### 10.2 Capa A — barrera en memoria

`armado` se parte en dos variables con nombres que dicen lo que hacen:

```js
let barreraPuesta = true;     // ¿la puse yo y sigue puesta?
let mantenerBarrera = false;  // ¿tiene que SOBREVIVIR a esta llamada?

const desarmarSiProcede = () => {
  if (mantenerBarrera) { restauracionesSinResolver.add(pid); return; }
  if (barreraPuesta) { proyectosEnRestauracion.delete(pid); barreraPuesta = false; }
};
```

`mantenerBarrera = true` en **cuatro** sitios: los tres caminos en que la vuelta
atrás no se puede demostrar (fallo del apply, fallo del commit, excepción
inesperada) y **la forma 3**, donde el material se conserva a propósito y la
sesión pide reinicio.

Además hay un segundo Set, `restauracionesSinResolver`, subconjunto del primero.
No es adorno: los canales deducen `reintentable` de
`motivo === 'proyecto-en-restauracion'`. Un restore **en curso** sí se puede
reintentar cuando acabe; uno **sin resolver** no —reintentar no lo arregla—, y
decirle al usuario «se está restaurando ahora mismo» cuando la operación ya
terminó es falso por los dos lados. Con el Set aparte, el motivo pasa a ser
`restauracion-sin-resolver` y el rechazo deja de anunciarse como reintentable.

### 10.3 Capa B — F-1 durable, por proyecto

`proyectoBloqueadoParaMutar()` deja de mirar solo la memoria y pregunta por el
journal, que es lo único que sobrevive a un reinicio:

```
restauracionPendienteDeProyecto(projectId)
  fase 'aplicando' -> NO RESUELTO  -> bloquea ESE proyecto
  fase 'limpiando' -> YA RESUELTO  -> no bloquea
```

El criterio es el **journal mismo**, no la marca en la base de datos:
`limpiarMaterialRestauracion()` escribe `fase:'limpiando'` únicamente **después**
de confirmar (R6) o **después** de una reposición demostrada. Lo que queda
entonces es material por borrar, que le importa a `rekeyPuedeEmpezar()`, no a
las mutaciones. Eso evita además meter una consulta a la BD en un camino que
hoy no espera que lance.

**Alcance, y por qué no es global.** Un journal válido y atribuible bloquea
**solo a su proyecto**. Lo que **no se puede interpretar** —directorio ilegible,
journal corrupto, carpeta con material y sin journal— bloquea **siempre**, sea
cual sea el proyecto por el que se pregunte, y cierra también `f1Global()`: si
no se puede leer, no se sabe de quién es, y evidencia incompleta no es estado
ausente. Esa es la única parte que alcanza a proyectos ajenos.

Cerrar `f1Global()` entera con cualquier restauración pendiente habría
convertido un restore a medias del proyecto 7 en un bloqueo de toda la
aplicación. Es exactamente lo que **H1-4** existe para impedir.

**La recuperación no se auto-bloquea.** `recuperarRestauracionesPendientes()` y
lo que cuelga de ella —reponer la partición, limpiar el material— trabajan
directamente y no pasan por esta puerta. Lo que se bloquea son operaciones
**nuevas**.

### 10.4 Pruebas

En `a2/test-cableado.js`, que pasa de **96** a **129 OK / 0 FALLOS**:

| Prueba | Qué fija |
|---|---|
| **H1-1** | Fallo del flush de la reposición: journal y `previo.enc` permanecen, la barrera en memoria **se conserva**, `proyectoBloqueadoParaMutar()` devuelve `restauracion-sin-resolver`, el rechazo **no** se anuncia reintentable, y no empiezan backup, meeting save, candidate save, CV ni borrado del proyecto —comprobando además que el proyecto sigue en la BD |
| **H1-2** | **Reinicio**: una instancia nueva del módulo, con el Set vacío, sobre la misma carpeta. El journal basta: las cinco operaciones siguen bloqueadas. Y la recuperación resuelve **su** journal sin ser víctima de su propia F-1 |
| **H1-3** | La recuperación repone el PRE con su orden (PRE → relectura → flush → cleanup), limpia el material, libera **las dos capas** y las operaciones nuevas vuelven a permitirse |
| **H1-4** | Un journal del proyecto A **no** bloquea al proyecto B: su backup, su meeting y su candidate se aceptan, `f1Global()` sigue libre y su borrado no lo rechaza la barrera de restauración |
| **H1-4b** | Un journal **ilegible** sí bloquea a cualquiera y cierra también `f1Global()` |

**Reversiones, una por capa** (`a2/revertir-main.js`):

| Reversión | Qué quita | Efecto medido |
|---|---|---|
| `J-barrera-se-suelta` | el `finally` vuelve a desarmar siempre | **1 fallo**: H1-1, barrera en memoria |
| `K-sin-f1-durable` | la barrera deja de preguntar por el journal | **10 fallos**: H1-2 entero, H1-3 (bloqueo previo), H1-4 y H1-4b |

Que cada una tumbe cosas distintas es el resultado que se buscaba: son dos
defensas, no una repetida. Con `J` el usuario sigue protegido por el journal; con
`K`, por la memoria dentro de la misma sesión. Hacen falta las dos porque
cubren ventanas distintas —la sesión en curso y el arranque siguiente.

### 10.5 Qué NO cubre

- No se ha provocado el fallo del flush de la reposición **en Electron real**:
  H1-1 lo inyecta en el doble de `session`. Lo que sí se ha ejercitado en
  Electron real es el corte duro tras la reposición y su cleanup (**RA-7/RA-7b**).
- El criterio de «resuelto» es la **fase del journal**. Si algún día algo
  escribiera `fase:'limpiando'` sin haber confirmado ni repuesto, la barrera se
  abriría antes de tiempo. Hoy el único escritor de esa marca es
  `limpiarMaterialRestauracion()`, y solo se le llama en los tres sitios
  descritos.
- Sigue fuera lo de siempre: cuotas de `localStorage`, corte de corriente real
  y Drive con dos PCs.
