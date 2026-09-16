# A3.3 — BLOQUE 5: BORRADOS DESTRUCTIVOS

**rev.4 — CERRADO.** Implementado, cableado a producción y verificado con
arranques Electron reales destructivos en sandbox.
Fecha: 2026-09-15. Base al cerrar: `main.js` 9773 / `db.js` 1753 / `security.js` 100.

> **Estado final.** D1 `deleteProjectById`, D2 `meeting:deletePrep`, D3 purga de
> backups y D4a/D4b ciclo de vida del CV están en producción, junto con el
> dominio de ocupación común (`.panorama-acciones` + `.panorama-borrados`) y la
> puerta F-1 GLOBAL.
>
> Evidencia: **1550 OK / 0** automatizados en diez baterías; **71 OK / 0** en
> Electron real (E1–E7), **17 OK / 0** en los dos casos de CV restantes y
> **12 OK / 0** en `CV-RM-F3-RETURN`, todos con clic real sobre el renderer
> productivo. En todas las rondas la BD viva de `G:` quedó idéntica por SHA-256
> y cero archivos de producción se tocaron durante las pruebas.
>
> **`CV-RM-F3-RETURN`** cierra el punto más fino de §4.9: el `await
> saveState(true)` **original** de la rama `quitar-cv` devuelve
> `{ok:true, aplicado:true, verificado:false, requiereReinicio:true}`. Si
> devolviera `aplicado:false`, la rama restauraría el CV en memoria sobre un
> estado ya confirmado sin él, y memoria y disco divergirían. El valor se
> capturó envolviendo `saveState` en la página —sin tocar la plantilla— y se
> acompaña de conteo directo de canales IPC: `candidateEval:save` = 1,
> `candidateEval:removeCv` = 0.
>
> Punto de restauración: `claude/checkpoint-bloque5-2026-09-15.md`.
> Reconciliación de pendientes: P6 y P8 **CERRADOS**.
>
> **Fuera del bloque, sin cubrir:** Drive con dos PCs reales, A2 bajo A3.3,
> conflicto UI general, cierre/apagado global, empaquetado.

**Qué añade la rev.3** (sobre la rev.2 aprobada en lo sustancial):
§4.10 medición del `rename` en `G:` y el hallazgo de que **Drive no se
comporta como NTFS** al reponer sobre un destino recreado; §4.7.3 la regla
**NO-CLOBBER** que sale de ahí, con su prueba `DEL-ROLLBACK-NO-CLOBBER`;
§4.11 el guardián de rutas fail-closed y la baseline de la BD viva; y la
corrección de B9, que tal como estaba escrito habría pisado el backup ajeno.

Alcance: todo camino que destruya archivo, fila, directorio, partición de
Electron, CV/adjunto o backups antiguos, y donde una mitad pueda completarse
sin la otra.

**Fuera**: A2 restore, modal general de conflictos, cierre/apagado, Drive real,
empaquetado.

---

## §1. INVENTARIO REAL

Localizado por barrido de `DELETE FROM` · `unlinkSync` · `rmSync` ·
`clearStorageData` sobre el `main.js` completo. Se descartan los que no tocan
datos del usuario: temporales del propio protocolo A3.3/Bloque 4, el lock
multi-PC, el parcheo de `app.asar` y los ficheros de configuración local.

| # | Camino | Línea | Destruye | Orden hoy |
|---|---|---|---|---|
| **D1** | `deleteProjectById()` | 4907 | carpeta de backups **entera** (backups + reuniones + evaluaciones + CV), dashboard horneado, partición, 2 conjuntos de filas | **archivos y partición PRIMERO**, filas después |
| **D2** | `meeting:deletePrep` | 8686 | archivo de la preparación + su fila | **archivo primero**, fila después |
| **D3** | purga de backups antiguos | 9255 | filas + archivos de backups viejos | **fila primero**, archivo después, N veces |
| **D4a** | `candidateEval:removeCv` | 9021 | archivo del CV | estado guardado antes (sin esperar), archivo después |
| **D4b** | `candidateEval:pickCv` | 8978 | CV **anterior** de esa evaluación | **borra el viejo ANTES** de copiar el nuevo |
| **D5** | rollback de `projects:create` | 9088 | fila del proyecto recién creado | solo BD |
| **D6** | `purgeOldLocalSafetyBackups` | 1952 | copias de rescate locales > 40 | solo archivos, sin BD |

---

## §2. FICHA POR CAMINO

### D1 — `deleteProjectById()` · el más grave

```
1. cerrar la ventana del proyecto
2. rmSync(backupsDirForProject(row), {recursive})   <- TODO el contenido
3. rmSync(projectDashboardDir(id), {recursive})     <- el HTML horneado
4. ses.clearStorageData()                           <- la particion
5. dbmod.run('DELETE FROM backups WHERE project_id=?')   <- commit A3.3 #1
6. dbmod.run('DELETE FROM projects WHERE id=?')          <- commit A3.3 #2
```

| | |
|---|---|
| **Precondición** | la confirmación del usuario la pide el llamante. `projects:delete` (7947) comprueba `procesoComprometido`; **la función en sí no comprueba nada**: ni `bloqueoDeSeguridad()`, ni `rekeyInProgress`, ni journals de acción pendientes |
| **Qué se borra primero** | **todo lo irrecuperable**, antes de que la base de datos confirme nada |
| **Si A3.3 rechaza el commit** | `conflicto`, `base-cambiada`, `ocupado`, `bloqueado` o `degradado` en el paso 5 → **los archivos, el dashboard y la partición YA NO EXISTEN** y las filas siguen. El proyecto sigue apareciendo en el lanzador apuntando a la nada. **PÉRDIDA TOTAL E IRREVERSIBLE** |
| **`aplicado:true`** | el paso 5 confirma sin poder verificarse → `desincronizada` → el paso 6 lanza `bloqueado` → **fila de `projects` viva, sus `backups` borradas, archivos destruidos** |
| **Si `rmSync`/`clearStorageData` falla** | solo `console.warn`. Se siguen borrando las filas → **directorios huérfanos para siempre**, invisibles para todo |
| **Otro PC entre comprobación y borrado** | el `rmSync` recursivo se lleva por delante un backup que el otro equipo acabe de publicar. Y su fila la borra el paso 5 aunque se creara después. **TOCTOU real**: una precomprobación no lo arregla |
| **Tras reiniciar** | nada lo detecta ni lo repara: no hay journal, no hay marca |
| **Pérdida de datos** | **SÍ**, en varios caminos |

**Defecto adicional, ya existente:** los pasos 5–6 borran `backups` y
`projects`, pero **NO** `meeting_preps` ni `candidate_evals`. Esas filas quedan
huérfanas apuntando a archivos que el paso 2 ya destruyó. Está documentado en
el propio código (comentario de `collectRekeyInventory`, main.js:3465) y sigue
igual.

### D2 — `meeting:deletePrep`

| | |
|---|---|
| **Precondición** | ninguna. **No** comprueba `procesoComprometido`, ni `rekeyInProgress`, ni `bloqueoDeSeguridad()`, ni journals pendientes |
| **Orden** | `unlinkSync(archivo)` → `DELETE FROM meeting_preps` |
| **Si A3.3 rechaza** | el archivo ya no está y **la fila sobrevive** → el historial lista una preparación que no se puede abrir |
| **`aplicado:true`** | el borrado sí se aplicó; la sesión queda `desincronizada` y nadie lo dice |
| **Si `unlink` falla** | se registra con `console.warn` y **se borra la fila igualmente** (decisión deliberada de la versión anterior) → archivo huérfano |
| **Otro PC** | puede estar leyendo/editando esa misma preparación; no hay ninguna protección por destino |
| **Tras reiniciar** | nada lo detecta |
| **Pérdida** | **SÍ** — el contenido de la preparación, si la fila sobrevive y el archivo no |

### D3 — purga de backups antiguos

| | |
|---|---|
| **Precondición** | ninguna propia; corre tras un `backup:save` ya confirmado, en su propio `try/catch` (Bloque 4) |
| **Orden** | por cada fila sobrante: `DELETE FROM backups` (**commit A3.3**) → `unlinkSync(archivo)` |
| **Si A3.3 rechaza** | el `catch` del Bloque 4 lo captura: el backup nuevo **sigue siendo éxito** y se registra `ERROR — mantenimiento de backups falló`. Correcto y ya cerrado |
| **`aplicado:true`** | la fila se borró; el `unlink` posterior puede no llegar a ejecutarse |
| **Si `unlink` falla** | se ignora (`/* ya no estaba */`) → **archivo huérfano permanente**: la purga se guía por las FILAS y ese archivo ya no tiene ninguna |
| **Otro PC** | puede estar restaurando justo ese backup |
| **Tras reiniciar** | los huérfanos no se cuentan ni se limpian |
| **Pérdida** | **NO** de datos vivos; sí crecimiento sin límite de basura en la carpeta compartida |

### D4a — `candidateEval:removeCv`

El renderer (Bloque 4 ya le puso la guarda de entrada) hace:

```
ev.cvFileName = null; ev.cvStoredName = null;
saveState(true);                                  // NO se espera
window.panoramaBridge.removeCandidateCv(storedName);
```

| | |
|---|---|
| **Orden real** | el estado se **lanza** a guardar y el archivo se borra **sin esperar el resultado** |
| **Si el guardado del estado NO se aplica** | el CV se borra igual → **`estado.json` confirmado sigue referenciando un CV que ya no existe**. Es exactamente la incoherencia que cerró el Bloque 4 para la forma 3, por otra puerta: aquí no es la sesión detenida, es el orden |
| **Si `unlink` falla** | `console.warn`, se devuelve `ok:true` → el estado dice "sin CV" y el archivo sigue |
| **Pérdida** | **SÍ** — el CV, con el estado apuntándolo |

### D4b — `candidateEval:pickCv`

| | |
|---|---|
| **Orden** | borra **todos** los CV previos de esa evaluación (`evalId + '__'`) → `copyFileSync` del nuevo |
| **Si la copia falla** | devuelve error, pero **el CV anterior ya se destruyó** y el estado sigue apuntándolo |
| **Pérdida** | **SÍ** |

### D5 — rollback de `projects:create`

Un solo `DELETE FROM projects`. Si A3.3 lo rechaza, queda un proyecto fantasma
con su partición sembrada a medias. Sin pérdida de datos previos. Riesgo bajo.

### D6 — `purgeOldLocalSafetyBackups`

Solo archivos, sin base de datos: no hay dos mitades que descuadrar. Se lista
por completitud. **No entra en el protocolo**; a lo sumo, contarlo.

---

## §3. LOS ESTADOS PROHIBIDOS DE ESTE BLOQUE

1. **Archivo destruido + fila viva** — D1 (todos los caminos de rechazo), D2.
2. **Fila borrada + archivo vivo** — D3, D4a.
3. **Destrucción parcial**: unas filas sí y otras no (D1 con sus 2 commits;
   D3 con sus N).
4. **Destrucción sin posibilidad de demostrar qué había** — D1: hoy no queda
   ni rastro de qué se borró.
5. **Destruir lo que otro equipo acaba de crear** — D1 y D3.

---

## §4. PROTOCOLO PROPUESTO: **RETIRAR, CONFIRMAR, PURGAR**

El principio, y es lo contrario de lo que hace hoy el código:

> **No se destruye nada hasta que la base de datos lo ha confirmado.**
> Lo que parece un borrado es, hasta el último momento, una MUDANZA.

Se reutiliza entera la maquinaria del Bloque 4 —journal durable, `action_id`
en la misma mutación, `exigirCommitBase`, reglas por hash, recuperación
A/B/C— cambiando qué se mueve y en qué dirección.

### 4.1 Fases

```
F-2 QUIESCE     cerrar TODAS las ventanas del proyecto y esperar su vaciado
                (dashboard/directorio + meeting + candidate) y bloquear
                nuevas escrituras locales de ese proyecto
F-1 INVARIANTE  no se empieza con un journal propio pendiente sin resolver,
                de guardado (Bloque 4) O de borrado (este bloque)
F0  CAPTURAR    base_commit_id + writer + action_id; bloqueoDeSeguridad()
                inventario COMPLETO, con resolucion de rutas PURA (§4.6)
F1  JOURNAL     durable, con ese inventario y la RESERVA DE SUBARBOL (§4.7)
                ---- a partir de aqui se mueve ----
F2  RETIRAR     rename de cada archivo/carpeta a  <userData>/.panorama-borrados/<action_id>/
                (rename dentro del MISMO volumen: atomico y sin coste de espacio)
F3  CONFIRMAR   UNA escribirMultiple con exigirCommitBase:
                  todos los DELETE de todas las tablas implicadas
                  + la marca de accion
F4  PURGAR      borrar la cuarentena  y  (solo aqui) clearStorageData()
F5  LIMPIAR     borrar el journal
```

**F-2 va ANTES de F0 a propósito.** El cierre de una ventana produce su
guardado final (`attachFlushOnClose`), y ese guardado **cambia el commit**. Si
se capturara `base_commit_id` antes de cerrar, F3 se encontraría con una base
distinta por culpa de la propia operación. Hoy `deleteProjectById()` solo cierra
`projectWindows` (main.js:4919) y deja abiertas `meetingPrepWindows` (1286) y
`candidateEvalWindows` (1287), que pueden guardar durante F0–F2.

La diferencia con el Bloque 4 es de dirección: allí se publicaba un archivo
nuevo y se confirmaba; aquí se aparta lo viejo y se confirma. La cuarentena
hace el papel del `.old`.

### 4.2 Rollback (F3 rechaza PRE-confirmación)

Se devuelve todo desde la cuarentena a su sitio, con las mismas reglas por
hash del Bloque 4:

| Estado del destino | Acción |
|---|---|
| no existe y la cuarentena tiene su copia íntegra | **reponer** |
| existe con los bytes originales | ya estaba: nada |
| existe con un TERCER hash | **no pisar** — alguien lo recreó; conservar la cuarentena y bloquear la sesión |
| ilegible | **no tocar**; conservar; bloquear |

Con eso, un rechazo de A3.3 deja el proyecto **exactamente como estaba**, que
es justo lo que hoy es imposible.

### 4.3 La partición de Electron: la excepción honesta

`session.clearStorageData()` **no es reversible** y Electron no ofrece
"apartar una partición". No se puede meter en la cuarentena.

Decisión propuesta: **la partición se vacía en F4, después de que la base de
datos haya confirmado**, nunca antes. Consecuencias:

- si F4 falla, queda una partición con datos que **ya no referencia nadie**
  (sus filas están borradas): es basura, no pérdida;
- se anota en el journal como `particion_pendiente` y se reintenta al arrancar;
- y es exactamente el modo de fallo seguro de una operación destructiva:
  *"todavía no destruido"* siempre es mejor que *"destruido de más"*.

Hoy es al revés: se vacía **lo primero**, y si luego la base de datos no
confirma, ese contenido no vuelve.

### 4.4 Directorios: rename atómico + resumen, no hash por archivo

Para `backupsDirForProject()` (que puede tener cientos de MB) no se calculan
hashes archivo por archivo: sería caro y no hace falta. Se apoya en que el
**rename de un directorio es atómico**: o está en su sitio, o está en la
cuarentena, nunca en los dos.

El journal guarda `origen`, `cuarentena` y un **resumen**
`{n_archivos, bytes_totales}` tomado antes de mover. La recuperación decide
por existencia de los dos extremos y comprueba el resumen.

**Lo que esto NO demuestra**, y queda dicho: que el contenido del directorio
sea byte a byte el mismo. Si eso se considera necesario, el coste sube de
forma lineal con el tamaño de la carpeta y habría que medirlo primero.

### 4.6 Resolución de rutas PURA — los helpers de hoy no lo son

`backupsDirForProject()` (1931), `meetingPrepsDirForProject()` (1979),
`candidateEvalFileForProject()` (1994) y `candidateEvalCvDirForProject()`
(2008) hacen **dos efectos colaterales** cada uno:

1. llaman a `ensureProjectBackupDirSlug()` (1922), que si `backup_dir` está
   vacío hace **`dbmod.run('UPDATE projects SET backup_dir=?')`** — es decir,
   **un commit A3.3**;
2. `fs.mkdirSync(dir, {recursive:true})` — **recrean el directorio**.

Los dos son incompatibles con este protocolo:

- el commit rompería "un solo commit en F3": habría uno antes, en pleno
  inventario, y `exigirCommitBase` fallaría contra su propia base;
- el `mkdirSync` **recrearía la carpeta que acabamos de mover a la cuarentena**.

**Para el borrado hace falta una resolución de rutas PURA**: si
`row.backup_dir` existe se usa; si es legado/`null` se deriva
`${row.id}-${slugify(row.name)}` **sin persistirlo y sin crear nada**. Durante
F-2, F0, F1 y F2 **no se ejecuta ni un `dbmod.run()` ni un `mkdirSync()`**.

### 4.7 RESERVA DE SUBÁRBOL — sin ella B9 no se sostiene

Mover `backups/<slug>` a la cuarentena deja **la ruta original libre**. Y
`backupsDirForProject()` hace `mkdirSync(recursive)`: el otro equipo la
**recrea** en su siguiente `backup:save` y publica ahí. Entonces F3 detecta
`base-cambiada` correctamente, pero el rollback ya no puede hacer
`rename(cuarentena → destino)` porque el destino existe — y sustituirlo
destruiría el backup ajeno.

Por eso el journal de un borrado declara una **lista cerrada de recursos**, no
una única pareja `scope`/`destino`. `deleteProjectById` retira **dos**
directorios —la carpeta de backups y el dashboard horneado—, y el dashboard
tiene exactamente el mismo problema: si otro proceso lo recrea, el rollback ya
no puede devolverlo.

```jsonc
"recursos": [
  { "tipo":"directorio", "scope":"subtree",
    "origen":"<userData>/backups/<slug>",
    "cuarentena":"<userData>/.panorama-borrados/<action_id>/r0",
    "n_archivos": 128, "bytes_totales": 40213 },
  { "tipo":"directorio", "scope":"subtree",
    "origen":"<userData>/projects/<id>",
    "cuarentena":"<userData>/.panorama-borrados/<action_id>/r1",
    "n_archivos": 3, "bytes_totales": 90114 }
]
```

La ocupación común comprueba **TODOS** los recursos de todos los journals. Y
mientras alguno exista, cualquier acción cuyo destino caiga dentro de
cualquiera de esos ámbitos se rechaza con `ocupado-otro-writer` **antes** de
crear directorios, escribir el tmp o publicar nada.

**La partición NO es un recurso reversible**: no entra en la lista, y se sigue
vaciando solo en F4 (§4.3).

```
ocupado(destino) = algun recurso r de algun journal cumple
     r.scope === 'archivo'  &&  mismaRuta(destino, r.origen)
  || r.scope === 'subtree'  &&  estaDentroDe(destino, r.origen)
```

### 4.7.1 `estaDentroDe()` con semántica real de Windows

Un `startsWith()` artesanal se equivoca de varias formas a la vez. Se construye
con `path.relative()` y se comprueban los límites:

```
function estaDentroDe(hijo, padre) {
  const rel = path.relative(path.resolve(padre), path.resolve(hijo));
  if (rel === '') return true;                 // es el propio ambito
  if (!rel) return false;
  if (path.isAbsolute(rel)) return false;      // otra unidad o UNC distinta
  if (rel === '..' || rel.startsWith('..' + path.sep)) return false;  // por encima
  return true;
}
```

Con `path.relative()` quedan resueltos de una vez: `path.resolve`, la
normalización de `.` y `..`, los separadores `/` y `\`, el separador final, y
la coherencia de unidad/UNC (rutas en volúmenes distintos devuelven una ruta
absoluta, que se rechaza). En Windows la comparación es **insensible a
mayúsculas**, y `path.relative` ya lo es en esa plataforma.

Y el caso que motivó todo: `relative('…/proyecto-1', '…/proyecto-10')` devuelve
`..\proyecto-10`, que empieza por `..` → **no está dentro**.

Pruebas: **PATH-SCOPE-1** (`C:\Datos\Proyecto` contiene
`c:\datos\proyecto\a.json`), **PATH-SCOPE-2** (proyecto-1 no contiene
proyecto-10), **PATH-SCOPE-3** (`Proyecto\sub\..\otro` se resuelve bien),
**PATH-SCOPE-4** (una ruta hermana no entra por prefijo textual).

### 4.7.2 Esquema del journal de borrado — VALIDACIÓN CERRADA

Mismo criterio que el Bloque 4 §ACT-JOURNAL-SCHEMA: **un JSON parseable pero
incompleto no es evidencia**. Aquí importa más todavía, porque un journal a
medias no puede convertirse en permiso para borrar una carpeta de cuarentena.

| Campo | Regla |
|---|---|
| `v` | exacta |
| `action_id` | 32 hex |
| `writer` | installation-id válido (32 hex) |
| `tipo` | enum: `borrar-proyecto` · `borrar-prep` · `purgar-backups` |
| `base_commit_id` | 32 hex |
| `fase` | enum: `retirando` · `purgando` |
| `startedAt` | string no vacío |
| `recursos` | array **no vacío** |
| `particion` | solo si el tipo la lleva: identificador explícito, y su estado post-commit representable — **nunca inventado durante la recuperación** |

Y por cada recurso:

| Campo | Regla |
|---|---|
| `tipo` | `archivo` \| `directorio` |
| `scope` | `archivo` \| `subtree` |
| `origen` | ruta **absoluta** |
| `cuarentena` | ruta **absoluta**, y **bajo `.panorama-borrados/<action_id>`** |
| — | `origen !== cuarentena`, siempre |
| si `archivo` | `sha256` (64 hex) + `size` entero ≥ 0 |
| si `directorio` | `n_archivos` y `bytes_totales`, enteros ≥ 0 |

**Política, idéntica a la del Bloque 4:**

- journal **propio** identificable pero inválido → **no mover, no reponer, no
  purgar**; conservar journal y material; fail-closed; y ninguna acción propia
  nueva empieza;
- journal **ajeno** inválido → conservar; y si no se puede demostrar qué
  recurso gobierna, ninguna operación que pudiera colisionar lo destruye ni lo
  ignora.

Prueba: **DEL-JOURNAL-SCHEMA**, con campos ausentes y malformados y **material
real en la cuarentena**, comprobando que nada se mueve, se repone ni se borra.

### 4.7.3 NO-CLOBBER — el rollback NUNCA confía en que el `rename` falle

Medido en §4.10: en `G:` —el sistema de archivos que la app usa de verdad—
`rename(cuarentena → destino)` **no falla** cuando el destino ha sido recreado;
lo **reemplaza**, y el contenido recreado desaparece sin dejar rastro. En NTFS
local el mismo `rename` da `EPERM`. Por tanto **la defensa no puede ser el
comportamiento del sistema de archivos**.

**Regla absoluta.** Antes de cualquier `rename(cuarentena → origen)`:

```
if (existe(origen)) {
  // da igual POR QUE exista
  -> NO ejecutar el rename
  -> conservar origen, cuarentena y journal, los tres intactos
  -> clasificar fail-closed / recurso ocupado
}
```

La comprobación va **inmediatamente antes** del `rename`, por recurso, en el
momento de reponer — no en una precomprobación al principio de la operación,
que dejaría TOCTOU.

La reserva de subárbol (§4.7) debe impedir que esto llegue a pasar en operación
normal. Esta es una **segunda barrera para la recuperación**, y hace falta
porque §4.7 no cubre:

- sincronización tardía de Drive;
- otro cliente que todavía no ha visto el journal;
- contenido que **reaparece** porque Drive lo restaura.

Queda explícito: **no** se asume que `DEL-W-SUBTREE` gane siempre la carrera.

Prueba obligatoria: **DEL-ROLLBACK-NO-CLOBBER** — retirar un directorio a
cuarentena, recrear el origen con `backup-ajeno.json`, intentar el rollback, y
comprobar que **no se llama** a `rename(cuarentena, origen)`, que
`backup-ajeno.json` sigue byte a byte igual, que la cuarentena sigue byte a
byte igual, que el journal sigue presente, que el recurso queda fail-closed y
que no se destruye nada.

### 4.8 DOMINIO DE OCUPACIÓN COMÚN A LOS BLOQUES 4 Y 5

`.panorama-acciones` y `.panorama-borrados` **no pueden ser dos mundos**. La
comprobación de ocupación y el invariante F-1 miran **los dos conjuntos**:

| Quién pregunta | Qué tiene que ver |
|---|---|
| `backup:save`, `meeting:*`, `candidateEval:save` | journals de guardado **y** de borrado, por recurso exacto **y** por subárbol |
| cualquier borrado | journals de borrado **y** de guardado sobre el recurso que va a retirar |

Y la lista `acciones_<writer>` sigue siendo **una sola y global**: un journal
propio pendiente —de guardado **o** de borrado— implica **cero acciones propias
posteriores**. Si fueran dos listas o dos invariantes, una marca ya aplicada
podría volver a ser expulsada de la lista de 8, que es justo lo que el §4.2 del
Bloque 4 cerró.

Clasificación mínima que devuelve la comprobación: *recurso exacto* /
*subárbol* / *propio* / *ajeno* / *inválido-no-demostrable*.

### 4.5 Los seis caminos bajo el protocolo

| | Qué cambia |
|---|---|
| **D1** | las 4 destrucciones pasan a cuarentena; **un solo commit** con los `DELETE` de `backups`, `meeting_preps`, `candidate_evals` **y** `projects` (hoy faltan dos); partición al final |
| **D2** | archivo a cuarentena → `DELETE` → purgar. Y deja de borrar la fila cuando el archivo falla: se decide por hash |
| **D3** | **se invierte el orden**: archivos a cuarentena → **un solo commit** con todos los `DELETE` → purgar. Sigue siendo mantenimiento aparte y su fallo sigue sin afectar al backup nuevo |
| **D4a** | ver §4.9 — **no** necesita journal destructivo |
| **D4b** | ver §4.9 — **no** necesita journal destructivo |
| **D5** | ya es un solo commit; basta con la marca de acción |
| **D6** | fuera del protocolo; se cuenta |

### 4.9 CV — sin journal destructivo, solo ORDEN y `await` de verdad

D4a y D4b **no borran ninguna fila**: solo cambian el `estado.json`. Meterlos
en el protocolo de cuarentena sería usar un martillo donde basta con ordenar
los pasos. La regla es una sola:

> **El archivo sobrante es basura. El archivo borrado demasiado pronto es
> pérdida.** Ante la duda, sobra.

**D4a — quitar CV**

```
1. conservar el storedName antiguo
2. cambiar el estado en memoria a "sin CV"
3. await REAL de candidateEval:save
4. segun el contrato:
     aplicado:false              -> restaurar el estado en memoria; NO tocar el CV
     aplicado:true/verificado:false -> el estado confirmado ya dice "sin CV";
                                    NO borrar el CV (queda huerfano recuperable);
                                    detener la sesion / reiniciar
     aplicado:true/verificado:true  -> AHORA si se retira el CV
```

**D4b — cambiar CV**

```
1. copiar el CV NUEVO primero, con nombre realmente unico
   (nonce aleatorio, no solo Date.now: dos cambios en el mismo ms colisionan)
2. conservar el viejo
3. apuntar el estado al nuevo
4. await REAL de candidateEval:save
5. aplicado:false              -> el estado vuelve al viejo; el viejo intacto;
                                  el nuevo se retira como huerfano propio demostrable
6. aplicado:true/verificado:true  -> ahora si se retira el viejo
7. aplicado:true/verificado:false -> NO destruir el viejo; quedan los dos; reiniciar
```

**Obstáculo concreto que hay que resolver primero:** hoy
`saveState(immediate)` **no devuelve nada** (`plantilla_evaluacion_candidatos.html`,
`function saveState(immediate)`), así que no hay sobre qué hacer `await`. Hay
que convertir la vía inmediata en `if (immediate) return doSaveNow();` y que
`doSaveNow()` devuelva el contrato real. **No vale simular un `await` sobre
algo que devuelve `undefined`.**

Esto toca `plantilla_evaluacion_candidatos.html`, y entra en este bloque: es
integridad de datos, no un retoque de interfaz.

### 4.10 MEDICIÓN — coste del rename y comportamiento del destino recreado

Medido con `scratchpad/bloque5/bench-rename.js` (Node 20.16.0 de Electron).
Dos sistemas de archivos: el disco local de este PC y `G:`, que es el que la
app **usa de verdad** (`location.json` → `userDataDir` =
`G:/Mi unidad/BD-PanoramaServicio`).

| caso | RETIRAR local | REPONER local | RETIRAR en `G:` | REPONER en `G:` |
|---|---|---|---|---|
| 1 archivo 512 KB | 0,769 ms | 0,785 ms | — | — |
| 200 ficheros × 8 KB | 0,688 ms | 0,551 ms | **5,873 ms** | **5,812 ms** |
| ~100 MB (100 × 1 MB) | 0,755 ms | 8,037 ms † | **3,160 ms** | **4,095 ms** |
| ~500 MB (100 × 5 MB) | 1,579 ms | 1,351 ms | — | — |

† outlier de una sola muestra; con N=1 no se puede afirmar que sea ruido.

El coste no depende del tamaño: es un `rename` de directorio. En `G:` es entre
4 y 8 veces más caro que en local, pero sigue en milisegundos de un dígito —
irrelevante frente a los ~27,5 ms de un commit A3.3.

**Hallazgo que cambia la justificación de §4.7.** `rename(cuarentena → destino)`
con el destino ya recreado por otro equipo **no se comporta igual en los dos
sistemas de archivos**:

| | disco local | `G:` (el real) |
|---|---|---|
| `rename` sobre destino recreado | **falla** con `EPERM` | **NO falla** |
| el backup del otro equipo | **sobrevive** | **destruido** |

En local el rollback ingenuo se vuelve *imposible*; en `G:` se vuelve
*destructivo y silencioso*. La reserva de subárbol de §4.7 no es una
precaución de más: en el sistema de archivos que la app usa de verdad es lo
único que impide que un rollback borre el backup de otro equipo sin dejar
rastro. **Corrige lo que reporté antes** a partir del benchmark local, que
decía que el rollback «se vuelve imposible en lugar de destructivo».

**Límite de esta medición, sin rebajarlo:** responde solo a «¿cómo se comporta
el `rename` local a través del sistema de archivos montado por Google Drive en
este PC?». **No** demuestra propagación a la nube, **ni** orden entre equipos,
**ni** atomicidad remota, **ni** que B vea el journal antes que el `rename`,
**ni** el comportamiento simultáneo de dos máquinas. Eso es E2E Drive.

### 4.11 GUARDIÁN DE RUTAS Y BASELINE DE LA BD VIVA

**El fallo.** `location.json` es
`{"userDataDir":"G:/Mi unidad/BD-PanoramaServicio","shared":true}`. Los siete
arneses de los bloques 1–4 leían `j.dir || j.path`, así que su función
«ubicación real» devolvía `null` y el guardián *«no ejecutes dentro de la
ubicación real del usuario»* **nunca comparó nada**. Protegieron las otras dos
reglas: la cadena literal `bd-panoramaservicio` y la marca obligatoria
`_a33-…-PRUEBAS`.

**La corrección.** Un único lector, `scratchpad/comun/guardia-rutas.js`,
usado por los ocho arneses. Reconoce `userDataDir || dir || path`, y la
política es **FAIL-CLOSED**: si `location.json` **existe** y no se puede leer,
no parsea, no tiene clave reconocida o la ruta es inválida → **exit 99**.
Nunca degrada a `null`. El BOM **no se retira a propósito**: `main.js` hace
`readFileSync(...,'utf8')` + `JSON.parse`, que revienta con BOM; si la app no
sabría interpretarlo, el guardián tampoco debe fingir que sí. Única excepción:
un arnés encerrado en un tmp que él mismo genera puede admitir que
`location.json` **no exista**, y solo si declara `raizPermitida` (allowlist
positiva). La comparación de contención usa `path.relative()`, no
`startsWith()` (§4.7.1).

Pruebas: **GUARD-LOC-1..5** (`scratchpad/comun/test-guardia.js`, 43/0). Los
casos que abortan se ejecutan **en proceso hijo** y se comprueba el código de
salida real, no una simulación. Además se verificó en un arnés real
(`bench-rename.js`) que los seis estados —BOM, JSON truncado, sin clave,
`userDataDir` no-cadena, JSON que no es objeto, y ausente— dan **exit 99**.

**Baseline de la BD viva.** La prueba canónica de «producción intacta» pasa a
ser el SHA-256 de `G:\Mi unidad\BD-PanoramaServicio\panorama.sqlite3`, antes y
después de cada batería que pueda tocar filesystem o BD:

```
sha256: 52394C7A0CB83D8B170F514C10522BF74FCA01D6D3F54160544B7D1375A01F16
bytes:  77824
capturado: 2026-09-15T00:00:17+02:00
```

Guardado en `scratchpad/comun/baseline-bd-viva.json`. `crearGuardia()` instala
además un hook de salida que recomprueba la huella y termina con **exit 98** si
ha cambiado, para que ningún arnés pueda olvidarse de comprobarlo. El recuento
de entradas de la carpeta compartida queda como **dato secundario**: no
demuestra integridad. El `mtime` tampoco se compara: en `G:` Drive lo toca sin
cambiar el contenido.

`%APPDATA%\panorama-app\panorama.sqlite3` (`F71F4140…`, 57 344 B) queda
etiquetada como **copia local residual**, no producción viva. Ver la nota de
evidencia invalidada en `a3-3-bloque3-diseno.md` §13.3.

### 4.12 LO QUE CORRIGIÓ LA IMPLEMENTACIÓN DEL HELPER

Tres cosas que el diseño daba por buenas y la batería tumbó. Las tres están
corregidas en `scratchpad/bloque5/borrados.js` y cada una tiene su reversión en
`scratchpad/bloque5/revertir.js`, comprobada: sin la corrección, su prueba
falla.

**1. La ocupación tenía que ser SIMÉTRICA.** La fórmula de §4.7
(`ocupado(destino) = …r.origen contiene a destino`) responde a la pregunta de
una **acción**, que apunta a un archivo concreto. Un **borrado** pregunta por un
subárbol entero, y ahí el conflicto va también al revés: un journal ajeno que
gobierna `backups/<slug>/evaluacion-candidatos/estado.json` tiene que impedir
borrar `backups/<slug>`. Con la fórmula original **DEL-X1 pasaba de largo** y el
borrado se llevaba por delante el archivo que otro equipo estaba publicando.
Ahora `ocupacionComun(ruta, {scope})` añade, cuando el ámbito es `subtree`,
`estaDentroDe(r.origen, ámbito)`. Sin `scope` se comporta exactamente como
`destinoOcupadoPorOtroEquipo()`, así que el Bloque 4 no cambia.

**2. F-1 GLOBAL ignoraba un journal de borrado ilegible.** Se copió la regla del
Bloque 4 —bloquear solo con `clase === 'incompleto'` y `writer` identificable—,
pero en un journal **truncado el `writer` no se puede leer**, así que no se puede
descartar que sea nuestro. Ahora **cualquier** entrada no válida de
`.panorama-borrados` bloquea. Evidencia incompleta no es estado ausente.

**3. §4.9 necesita las DOS mitades.** Con solo `if (immediate) return
doSaveNow();`, `await saveState(true)` resolvía a **`undefined`**, porque
`doSaveNow()` es `async` y no devuelve nada en ninguna rama. El llamador leía
`undefined` como «no aplicado» y **CV-RM-1 pasaba por el motivo equivocado**:
un falso verde. `doSaveNow()` tiene que devolver el contrato en las cuatro
salidas (sesión detenida, no aplicado, `verificado:false`, y el camino bueno) y
un contrato `aplicado:false` desde el `catch`. Son **6 sustituciones**, no una,
y la batería exige que las 6 se apliquen exactamente una vez sobre el texto real
del HTML.

**Límite de la matriz B1–B12, dicho sin rebajarlo:** corre sobre NTFS local. En
B9, con NO-CLOBBER revertido a propósito, el dato **se salvaba igualmente**
porque el `rename` sobre un directorio existente da `EPERM` en NTFS — en `G:` no
(§4.10). Por eso B7 y B9 comprueban el **mecanismo** («no se llega a invocar
`rename`», con `fs` instrumentado) y no el resultado: el resultado en esta
máquina es el accidente del sistema de archivos, no la garantía.

---

## §5. MATRIZ DE FALLOS PROPUESTA

`B` = cuarentena · `D` = destino original

| # | Corte | D | B | journal | BD | Resultado esperado | Pérdida |
|---|---|---|---|---|---|---|---|
| **B1** | tras el journal, antes de mover | intacto | — | sí | intacta | rollback trivial: borrar journal | no |
| **B2** | mudanza a medias (unos movidos, otros no) | parcial | parcial | sí | intacta | reponer los movidos | no |
| **B3** | todo movido, antes del commit | — | todo | sí | intacta | reponer todo | no |
| **B4** | A3.3 rechaza (`base-cambiada`/conflicto) | — | todo | sí | intacta | reponer todo; IPC reintentable | no |
| **B5** | commit confirmado + corte antes de purgar | — | todo | sí | **borrada** | marca presente → **NO reponer**; purgar cuarentena | no |
| **B6** | `aplicado:true` | — | todo | sí | **borrada** | no reponer; forma 3; cerrar | no |
| **B7** | reponiendo aparece un TERCER hash | mixto | conservada | sí | intacta | **no pisar**, conservar todo, bloquear sesión | no |
| **B8** | `clearStorageData` falla en F4 | — | purgada | `particion_pendiente` | borrada | partición huérfana; se reintenta al arrancar | no |
| **B9** | otro equipo publica un backup entre F2 y F3 | — | todo | sí | **avanzada** | `base-cambiada` → reponer TODO **si el destino sigue libre**; si el otro equipo ya recreó el directorio, NO-CLOBBER (§4.7.3): no se repone, fail-closed, y el backup ajeno sobrevive | no |
| **B10** | journal de otro writer sobre el mismo destino | — | — | ajeno | — | rechazar solo esa acción (`ocupado-otro-writer`) | no |
| **B11** | journal propio incompleto | — | — | inválido | — | ni reponer ni purgar; fail-closed; nada nuevo empieza | no |
| **B12** | segundo arranque tras cada caso | — | — | — | — | idempotente; B7/B11 siguen fail-closed | no |

Y las pruebas que salen de los ajustes de esta revisión:

| Id | Escenario | Esperado |
|---|---|---|
| **DEL-W-SUBTREE** | A mueve `backups/<slug>` a cuarentena; B intenta un backup **del mismo proyecto** | B **no recrea la carpeta**, no publica archivo, no toca la BD; A puede hacer rollback con un rename limpio; cuarentena y journal de A intactos; **B sí puede guardar en otro proyecto** |
| **DEL-ROLLBACK-NO-CLOBBER** (§4.7.3) | retirar a cuarentena; recrear el origen con `backup-ajeno.json`; intentar el rollback | **no se llama** a `rename(cuarentena, origen)`; `backup-ajeno.json` byte a byte igual; cuarentena byte a byte igual; journal presente; recurso fail-closed; cero destrucción. **Más importante que suponer que DEL-W-SUBTREE gane siempre la carrera** |
| **DEL-X1** | journal de Bloque 4 sobre `estado.json` | un `deleteProject` de ese proyecto **no empieza** |
| **DEL-X2** | journal de `deletePrep` | un `meeting:*` sobre ese archivo **no empieza** |
| **DEL-X3** | journal de `deleteProject` del proyecto A | un backup del proyecto B **sí se permite** |
| **DEL-LEGACY-SLUG** | `projects.backup_dir = NULL` | preparar el borrado **no cambia el commit** ni hace ningún `UPDATE` implícito; si F3 falla, fila y archivos quedan exactamente como antes |
| **CV-RM-1** | `removeCv` con `aplicado:false` | el estado en memoria vuelve a referenciar el CV; **el archivo sigue existiendo** |
| **CV-RM-2** | `aplicado:true / verificado:false` | estado persistido sin CV; **el CV físico SE CONSERVA**; sesión detenida |
| **CV-RM-3** | `aplicado:true / verificado:true` | solo entonces desaparece el CV |
| **CV-REPLACE-1** | `pickCv` con `aplicado:false` | el estado vuelve al CV viejo; **el viejo intacto**; el nuevo se retira |
| **CV-REPLACE-2** | `aplicado:true / verificado:false` | **quedan los dos**; nada se destruye; reiniciar |
| **CV-REPLACE-3** | `aplicado:true / verificado:true` | ahora sí se retira el viejo |

En todas: recuento y sha256 de la carpeta del proyecto, filas de las cuatro
tablas, commit A3.3, contrato IPC y estado tras reiniciar.

---

## §6. DECISIONES TOMADAS

**a) Cuarentena: se PURGA en F4.** No se convierte "Eliminar proyecto" en una
papelera de N días: eso metería retención, sincronización y UX dentro de un
bloque de integridad, y es una feature de producto distinta.

**b) Benchmark ANTES de implementar — LOCAL HECHO.**
`scratchpad/bloque5/bench-rename.js`, disco local, Node 20.16.0:

| Caso | Archivos | Bytes | RETIRAR | REPONER |
|---|---|---|---|---|
| 1 archivo de 512 KB | 1 | 1 MB | 0,769 ms | 0,785 ms |
| 200 ficheros pequeños (8 KB) | 200 | 2 MB | 0,688 ms | 0,551 ms |
| ~100 MB (100 × 1 MB) | 100 | 100 MB | 0,755 ms | 8,037 ms |
| ~500 MB (100 × 5 MB) | 100 | 500 MB | 1,579 ms | 1,351 ms |

**El rename de un directorio no depende de su tamaño**: es una operación de
metadatos. 500 MB cuestan 1,6 ms, lo mismo que un archivo suelto.

El 8,0 ms del caso de 100 MB es un **outlier de una sola muestra**. Con N=1 no
hay evidencia para decir por qué ocurrió; lo único que se puede afirmar es que
el caso mayor (500 MB) tardó 1,4 ms, así que **no responde a un efecto de
tamaño**. Si hiciera falta explicarlo habría que repetir la medida con varias
muestras.

**Y el hallazgo que importa**, medido: con el destino **recreado** por el otro
equipo, `rename(cuarentena → destino)` **falla con EPERM** y el backup ajeno
sobrevive. Windows/NTFS no lo pisa en silencio. Es decir: el peligro del §4.7
no es que el rollback destruya el backajeno, sino que **el rollback se vuelve
imposible** y la operación queda atascada con la carpeta en cuarentena. La
reserva de subárbol sigue siendo necesaria, por esa razón y no por la otra.

*Límite*: mide el sistema de archivos de **este PC**. No demuestra nada sobre
la sincronización de Drive entre equipos.

**Pendiente**: la medida sobre una carpeta de pruebas en G:. Ver §7.

**c) D4a/D4b entran en este bloque**, renderer incluido: es integridad de
datos, no un retoque estético.

**d) Huérfanos históricos: solo contar y registrar.** Si algún proyecto se
borró con el código actual, sus filas de `meeting_preps`/`candidate_evals`
siguen ahí (§2, D1). Ningún borrado automático.

**e) Partición de Electron: `clearStorageData()` en F4**, después de que el
commit haya confirmado. Si falla, queda basura local no referenciada, nunca
pérdida. El journal solo se retira cuando el post-commit ha terminado o queda
demostrablemente resuelto.

---

## §7. LO QUE ESTE DOCUMENTO **NO** DICE

- Todo el §2 es **lectura de código**. Ninguno de los seis caminos se ha
  ejecutado todavía contra un fallo inyectado.
- El coste del §6.b está **sin medir**.
- La atomicidad del rename de directorios se da por buena en NTFS dentro del
  mismo volumen; **sobre una carpeta sincronizada por Drive no está
  comprobado**.
- Sigue fuera: A2 restore, modal de conflictos, cierre/apagado, Drive real,
  empaquetado.
