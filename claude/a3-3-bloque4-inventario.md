# A3.3 — BLOQUE 4: contratos de acción ARCHIVO + BASE DE DATOS / IPC

**rev.2 — INVENTARIO APROBADO + PROTOCOLO REDISEÑADO. Nada implementado.**
Fecha: 2026-09-14. Base: `main.js` 8767 / `db.js` 1753 / `security.js` 100.

Alcance: `backup:save`, `meeting:savePrep`, `meeting:updatePrep`,
`candidateEval:save` y `migrateLegacyInlineBackupsToFiles()`.

**Fuera, y no cubierto por nada de aquí**: A2 restore, borrados destructivos
(**incluida la purga de `backup:save`**, ver §8), resolución/modal de
conflictos, cierre/apagado, Drive real.

> **EVIDENCIA INVALIDADA (2026-09-15).** Las afirmaciones «PRODUCCIÓN NO
> TOCADA / producción intacta» de las suites de este bloque compararon
> `%APPDATA%\panorama-app\panorama.sqlite3` (`F71F4140…`, 57 344 B), que es
> una **copia local residual**, no la BD viva (`G:\Mi unidad\
> BD-PanoramaServicio\panorama.sqlite3`). Motivo: el guardián leía la clave
> equivocada de `location.json`. Es **pérdida de evidencia, no evidencia de
> corrupción**. Detalle completo y corrección en `a3-3-bloque3-diseno.md`
> §13.3 y `a3-3-bloque5-borrados.md` §4.11. Las suites ya re-ejecutadas con el
> guardián corregido comprueban la BD viva por hash.

## §0. QUÉ CAMBIA EN LA rev.2

El §1–§3 (inventario) queda **aprobado y sin cambios**; se conserva íntegro.

El §4.2 de la rev.1 estaba **mal**. Proponía `tmp → confirmar BD → rename`, y
eso no cierra la ventana: la mueve al otro lado. Con la fila ya confirmada, un
corte antes del `rename` deja **BD nueva + archivo ausente (o viejo)** — que es
exactamente el estado prohibido nº 3 del §3. Se sustituye entero por el
protocolo del §5.

Decisión mantenida: **el archivo se publica ANTES de confirmar la fila.** En
una carpeta compartida es preferible que otro equipo vea un archivo todavía
no referenciado a que vea una fila válida apuntando a un archivo que aún no ha
sincronizado. Pero ya no puede ser el `write` + `run` de hoy: tiene que ser una
mini-transacción recuperable.

---

## §1. EL PATRÓN COMÚN *(aprobado, sin cambios)*

```
1. guardas          (procesoComprometido / rekeyInProgress / restoreInProgress)
2. leer la fila del proyecto
3. isEncrypted = !!securityKey          <-- SE DECIDE AQUÍ
4. fileContent = encryptIfNeeded(payload, isEncrypted)
5. fs.writeFileSync(archivo, fileContent)   <-- EL ARCHIVO YA ESTÁ EN DISCO
6. dbmod.run(...)                        <-- commit A3.3: puede fallar o ADOPTAR
7. return
```

`escribirMultiple()` puede **recargar la base de datos desde disco en
silencio** cuando el disco es descendiente lineal (`db.js:854`). La fila puede
aterrizar en una base de datos **distinta** de la que decidió el paso 3.

El callback del Bloque 3 protege **la operación siguiente**, no ésta: cuando
salta, el archivo ya está escrito con la clave anterior y `aplicarYConfirmar()`
sigue adelante con el `isEncrypted` de antes.

| | |
|---|---|
| archivo | cifrado con la clave **A** |
| fila | `encrypted = 1`, sobre la base de datos de **B** |
| sal/verificador | los de **B** |
| consecuencia | ese archivo **no lo puede abrir nadie** |

---

## §2. INVENTARIO *(aprobado, sin cambios)*

| Acción | Línea | Archivo | ¿reversible? | `dbmod.run` protegido | Daño si falla la BD |
|---|---|---|---|---|---|
| `backup:save` | 8441 | nuevo | sí | **NO** (8501) | huérfano + promesa rechazada + purga a medias |
| `meeting:savePrep` | 7882 | nuevo | sí | sí (7905) | huérfano |
| `meeting:updatePrep` | 7917 | **sobrescribe** | **no** | sí (7938) | archivo nuevo, metadatos viejos |
| `candidateEval:save` | 8212 | **sobrescribe** | **no** | sí (8234) | archivo nuevo sin fila, o con fila vieja |
| `migrateLegacy…` | 4104 | nuevo | sí | solo avisa | un huérfano **por arranque** |

Detalles conservados de la rev.1: `backup:save` son hasta **3 commits A3.3 cada
15 s** (insert + purga + `UPDATE projects`); su promesa IPC **rechaza** en vez
de devolver `false`, así que no pasa por la rama `write-failed` que el código
cree cubrir; y `candidateEval:save` en su primer guardado puede dejar **archivo
sin ninguna fila**.

---

## §3. LOS CUATRO ESTADOS PROHIBIDOS *(aprobado)*

1. Archivo cifrado con una clave que la BD adoptada no puede derivar.
2. **Archivo sin fila** (huérfano).
3. **Fila sin archivo** — hoy no se da, y cualquier diseño que invierta el
   orden lo introduce. *(La rev.1 lo introducía.)*
4. Fila y archivo que se contradicen en `encrypted`.

---

## §4. LA PRUEBA ACCIÓN ↔ COMMIT

Es el punto que decide si el protocolo funciona. Propiedad obligatoria:

> tras un corte **inmediatamente después del commit de BD y antes de tocar el
> journal**, la recuperación tiene que poder demostrar que ESA acción ya se
> aplicó, y NO deshacer el archivo.

"El commit actual ya no es `base`" **no vale**: cualquier escritura de otro
equipo lo cambia sin que la nuestra se haya aplicado.

### 4.1 Las tres opciones, y por qué dos no bastan

**(a) `db_commit_history` / commit-id reservado.** Reservar `C` antes de
confirmar e imponérselo a `escribirMultiple()`; la prueba sería `C ∈ historial`.
Falla por **recencia**: el historial guarda los últimos 20 commits
(`HISTORIAL_MAX`, `db.js:54`). Si otro equipo escribe 20 veces mientras el
nuestro está apagado, `C` se cae del historial y la recuperación concluiría
"no se aplicó" sobre una fila que **sí** está. Además acopla el generador de
commits de A3.3 a la capa de acciones.

**(b) Un `action_id` en una lista global.** Mismo problema: las acciones de
cualquier equipo desalojan las nuestras.

**(c) Lista de acciones POR WRITER — recomendada.** En la MISMA mutación se
escribe:

```
app_meta['acciones_<installation-id>'] = JSON([action_id, …últimas 8 de ESTE equipo])
```

La prueba de "aplicada" es `action_id ∈ esa lista`. No tiene el problema de
recencia:

- solo **nuestras propias** acciones posteriores desalojan una nuestra;
- si hay un journal pendiente, es que el proceso murió durante esa acción, y la
  recuperación corre **al arrancar, antes de cualquier acción nueva** (§7 del
  Bloque 3: antes de login, launcher, migraciones y vacuum);
- las escrituras de otro equipo **conservan** nuestra clave: leen la BD
  entera, la mutan y la reescriben — nuestra lista viaja dentro.

Coste: una sentencia más en la misma mutación. Cero cambios en `db.js`.

**Es una decisión de diseño, no de comodidad**: (a) y (c) cuestan lo mismo de
implementar; (c) es la única cuya prueba no caduca.

### 4.2 INVARIANTE: un journal propio pendiente impide acciones propias nuevas

La lista corta solo es segura si **nuestra propia acción no puede ser expulsada
antes de recuperarse**. Sin esta invariante hay una secuencia real:

1. la acción A confirma la BD;
2. falla el borrado del journal (EIO, antivirus, carpeta compartida);
3. la sesión continúa;
4. el mismo equipo confirma 8 acciones más;
5. A sale de `acciones_<writer>`;
6. reinicio; el journal de A sigue ahí;
7. la recuperación busca A, no encuentra la marca;
8. concluye **falsamente** "A no se aplicó" y deshace el archivo de una acción
   que **sí** estaba confirmada.

No se puede depender de "normalmente el journal se borra enseguida". Es un
invariante de código, comprobado al principio de **cada** acción:

```
ejecutarAccionDeArchivo():
  F-1  ¿hay algún journal PROPIO pendiente en .panorama-acciones/?
         NO  -> seguir
         SÍ  -> intentar resolverlo AHORA (§7, el mismo camino del arranque)
                 resuelto con certeza (CASO A o B) -> seguir
                 no resoluble (CASO C)             -> NO INICIAR la acción
                                                      { ok:false, aplicado:false,
                                                        reintentable:false,
                                                        error:'accion-no-demostrable' }
  F0   … (el resto del protocolo)
```

Con eso, **"journal propio pendiente" implica "cero acciones propias
posteriores"**, y una lista de 8 es holgada: la nuestra no puede salir de ella
antes de haberse recuperado.

Nótese que F-1 también hace innecesario acumular journals propios: como mucho
hay uno.

**Pruebas obligatorias**

- **ACT-MARK-1** — A confirma · se inyecta fallo al borrar el journal · se
  intentan **20 acciones nuevas del mismo writer** · ninguna llega a confirmar
  hasta resolver A · se reinicia · A sigue reconocida como **aplicada** · cero
  rollback de A.
- **ACT-MARK-2** — journal propio pendiente **sin** marca en la BD · tampoco se
  permiten acciones nuevas hasta que la recuperación haga rollback (CASO A) o
  falle en cerrado (CASO C).

### 4.3 Lo que sigue sin demostrar

La lista por writer prueba **que la mutación se aplicó**. No prueba que se
aplicara *sobre la base que esperábamos* — eso lo garantiza `exigirCommitBase`
en el momento de confirmar, y queda registrado en el journal. Son dos
propiedades distintas y hacen falta las dos.

---

## §5. `ejecutarAccionDeArchivo()` — LA MINI-TRANSACCIÓN

### 5.1 Fases

```
F0  CAPTURAR   base_commit_id + cifrado + writer + action_id, JUNTOS
               bloqueoDeSeguridad()  -> si bloquea, no se prepara nada
F1  PREPARAR   escribir <destino>.tmp-<writer>-<action_id>  (durable)
               new_sha256 de los bytes RELEÍDOS del tmp
               si sobrescribe: original_sha256 del destino actual
F2  JOURNAL    <userData>/.panorama-acciones/<action_id>.json  (durable)
               ---- a partir de aquí se puede tocar el destino ----
F3  PUBLICAR   NUEVO:       rename(tmp -> destino)
               OVERWRITE:   rename(destino -> <destino>.old-<action_id>)
                            rename(tmp   -> destino)
               cada rename precedido de su comprobación por hash (§5.3)
F4  CONFIRMAR  escribirMultiple(sentencias + marca de acción,
                                { exigirCommitBase: base_commit_id })
F5  LIMPIAR    borrar el .old  y  borrar el journal
```

**No hay fase "hecho" en el journal.** Sería un `fsync` más y no haría falta:
el corte entre F4 y F5 es exactamente lo que resuelve la marca de acción del
§4. Escribirla sería añadir coste para cubrir algo ya cubierto.

`escribirJsonDurable()` (Bloque 3, `main.js:3329`) se reutiliza tal cual:
tmp + `writeSync` con progreso + `fsync` + rename + relectura.

### 5.2 El journal de acción

```jsonc
{
  "v": 1,
  "action_id": "<32 hex = 16 bytes aleatorios, igual que los commit-id de A3.3>",
  "writer": "<installation-id>",
  "tipo": "backup" | "meeting-nuevo" | "meeting-editar" | "candidate-eval" | "migracion-legado",
  "base_commit_id": "<commit A3.3 sobre el que se decidió TODO>",
  "cifrado": 0 | 1,
  "destino": "<ruta absoluta>",
  "modo": "nuevo" | "overwrite",
  "original_sha256": "<hex>" | null,   // solo overwrite
  "original_size": 0,
  "new_sha256": "<hex>",
  "new_size": 0,
  "fase": "publicando",
  "startedAt": "<ISO>"
}
```

Vive en `<userData>/.panorama-acciones/`, **un archivo por acción en vuelo**,
nombrado por `action_id` (que lleva dentro el writer) para que dos equipos no
colisionen.

### 5.3 Reglas por hash — igual que en el Bloque 3

`O` = `original_sha256`, `N` = `new_sha256`, `T` = un tercer hash.

**F3 PUBLICAR**

| modo | comprobación previa | acción |
|---|---|---|
| nuevo | el destino **no existe** | `rename(tmp → destino)` |
| nuevo | el destino existe | **abortar**: el nombre lleva nonce, no debería existir |
| overwrite | `H(destino) === O` | apartar a `.old-<id>` y publicar |
| overwrite | `H(destino) === N` | ya publicado → saltar (idempotencia) |
| overwrite | `H(destino) === T` | **abortar sin tocar**: lo escribió otro |
| overwrite | destino ilegible | **abortar sin tocar** |

**Rollback (F4 rechaza PRE-confirmación)**

| modo | estado del destino | acción |
|---|---|---|
| nuevo | `H === N` | borrar el destino |
| nuevo | `H === T` o ilegible | **no tocar**; conservar journal; bloquear sesión |
| nuevo | ausente | nada |
| overwrite | `H === N` y `.old === O` | `destino → tmp`, `.old → destino` |
| overwrite | `H === N` y `.old ≠ O` | **no restaurar**; conservar todo; bloquear sesión |
| overwrite | `H === T` o ilegible | **no tocar**; conservar todo; bloquear sesión |
| overwrite | ausente y `.old === O` | `.old → destino` |

"Bloquear sesión" = tercer motivo de `bloqueoDeSeguridad()` (Bloque 3 §10.3):
`accion-no-demostrable`. Corta los cuatro guardados y cualquier rekey, con el
mismo mensaje de "cierra la app y revisa el registro".

### 5.4 `aplicado: true`

Si F4 lanza `io-tras-confirmar`: la fila **sí** está y `db.js` queda en
`desincronizada`.

- **NO** se deshace el archivo. Está publicado y la fila lo referencia.
- Se intenta borrar el `.old` y el journal; si no se puede, se dejan (la
  recuperación del siguiente arranque los resolverá por la marca de acción).
- El IPC devuelve la forma 3 del §6 (`requiereReinicio: true`).
- La sesión **no continúa normalmente**: con `desincronizada` no puede escribir
  nada más, así que seguir abierta solo produce errores. Se propone cerrar,
  igual que en el Bloque 3.

---

## §6. CONTRATO IPC

Tres formas, una semántica común para las cuatro acciones interactivas:

```
1) NO APLICADO
   { ok:false, aplicado:false, reintentable:true|false, error:'…' }

2) APLICADO Y VERIFICADO
   { ok:true,  aplicado:true,  verificado:true, … }

3) APLICADO PERO LA SESIÓN NO PUEDE SEGUIR
   { ok:true,  aplicado:true,  verificado:false, requiereReinicio:true, aviso:'…' }
```

`reintentable` es `true` para `base-cambiada`, conflicto, `ocupado` y EIO
transitorio; `false` para `bloqueado`, `bd-ilegible` y
`accion-no-demostrable`.

**El renderer no reintenta nunca un `aplicado:true`.**

### 6.1 Riesgo concreto del cambio en `backup:save`

Hoy devuelve un booleano y el renderer hace:

```js
const wroteOk = await window.panoramaBridge.saveBackup(...);
if (!wroteOk) { … write-failed … }       // plantilla_dashboard.html:5718
```

Con un objeto, `!obj` es **siempre false**: el renderer daría por bueno
cualquier resultado, incluido un fallo. **`preload.js`,
`dashboard/plantilla_dashboard.html` y `directorio/plantilla_directorio.html`
tienen que cambiar en el MISMO paso**, o el contrato se rompe en silencio y
justo en la dirección peligrosa (volvería el bug de `lastSerialized` de la
v0.1.62). Lo marco aquí para que no se implemente por partes.

---

## §7. RECUPERACIÓN AL ARRANCAR

Corre **junto a la del rekey** (Bloque 3 §11.1), antes de vacuum, login,
launcher y migraciones.

Para cada journal en `.panorama-acciones/`:

```
¿journal.writer === installation-id actual?
   NO  -> NO TOCAR NADA. Se registra en app.log y se sigue.        (§7.1)
   SÍ  -> ¿action_id ∈ app_meta['acciones_<writer>'] ?
            SÍ -> CASO B  (la mutación SÍ se aplicó) — ver §7.2
            NO -> ¿el destino demuestra que se publicó? (§5.3)
                    publicado y demostrable -> CASO A: rollback por hash
                    no publicado            -> CASO A: borrar tmp y journal
                    tercer hash / ilegible  -> CASO C: fail-closed
```

### 7.2 CASO B — la marca NO autoriza a borrar el `.old` a ciegas

"Marca presente → borrar `.old`" sería volver a decidir por un solo indicio.
El CASO B exige **las tres cosas**:

1. `action_id ∈ app_meta['acciones_<writer>']`;
2. el journal propio es **válido** (`v`, `writer`, `destino`, hashes);
3. el destino final **se corresponde**:
   - `H(destino) === new_sha256`, **o**
   - hay evidencia explícita de que una acción **posterior y confirmada**
     lo sustituyó (su `action_id` también está en la marca, y su journal —si
     queda— lo declara sobre ese mismo destino).

| Resultado | Qué se hace |
|---|---|
| las tres | acción aplicada y coherente → **cleanup**: borrar `.old` y journal |
| 1 y 2 sí, 3 no (tercer hash sin evidencia de sustitución) | **NO** rollback —sabemos que A sí se aplicó— pero **tampoco** se destruye el `.old`. Se conserva todo y se clasifica `accion-aplicada-destino-cambiado` para revisión: fail-closed **de ese recurso**, no de la app |
| ilegible | igual que el anterior |

Con la regla del §7.1 (mismo destino ⇒ `ocupado-otro-writer`), este caso debe
ser extraordinario: nadie debería haber podido publicar sobre ese destino
mientras nuestro journal seguía vivo.

### 7.1 Journal de OTRO writer — por DESTINO, no por existencia

En el Bloque 3, un journal de rekey ajeno provoca **fail-closed**: gobierna la
Seguridad entera. Aquí esa política dejaría la app inservible — con la carpeta
compartida y un autoguardado cada 15 s, el otro equipo tendrá casi siempre un
journal en vuelo.

Pero "ignorar siempre" es demasiado permisivo para las acciones **overwrite**.
Secuencia real:

1. PC A hace `candidateEval` sobre `estado.json`: mueve `O` a `.old-A`,
   publica `N_A`, y cae **antes** de confirmar la BD;
2. la BD sigue en X, el archivo compartido ya es `N_A`, el journal de A vive;
3. PC B arranca, ve el journal de A y lo ignora;
4. B inicia otro `candidateEval` sobre **el mismo** `estado.json`, toma `N_A`
   por su original, publica `N_B` y confirma;
5. cuando A vuelve, su destino ya no es `N_A` sino un tercer hash: su journal
   queda **indemostrable**.

No se ha perdido un dato confirmado, pero se ha destruido la recuperación
automática de A y se han mezclado dos mini-transacciones sobre el mismo
recurso.

**Regla en vigor:**

| Situación | Qué se hace |
|---|---|
| journal ajeno de **otro destino** | ignorar, contar, registrar. **No** bloquea Panorama |
| journal ajeno que declara **EL MISMO `destino`** | **no tocar ese destino**; rechazar **solo esa acción** como `ocupado-otro-writer`; el resto de Panorama sigue funcionando |
| journal ajeno **corrupto** (no se puede saber qué destino gobierna) | conservar y registrar; **no** cerrar la app; pero una acción cuyo destino pudiera colisionar **no** borra ni modifica ese journal, y se rechaza igual |

La comprobación va **antes de PREPARAR/PUBLICAR** (fase F-1, junto al
invariante del §4.2). Y no basta con mirar el nombre del archivo: hay que
**leerlo y validar** `v`, `writer`, `destino` y `action_id`.

Afecta sobre todo a `meeting:updatePrep` y `candidateEval:save`; los archivos
nuevos llevan nonce en el nombre y normalmente no colisionan.

**Pruebas obligatorias**

- **ACT-W1** — A tiene journal pendiente sobre el `estado.json` de un proyecto;
  B intenta guardar sobre ese mismo destino ⇒ B **no** escribe archivo, **no**
  escribe BD, el journal y el material de A quedan **byte a byte intactos**, el
  resultado es reintentable/`ocupado`, y **B puede seguir trabajando en otro
  proyecto**.
- **ACT-W2** — A tiene journal sobre el proyecto 1; B guarda el candidate eval
  del proyecto 2 ⇒ **permitido**.
- **ACT-W3** — journal ajeno de backup con destino único distinto ⇒ **no**
  bloquea un backup nuevo de B.

---

## §8. LA PURGA DE `backup:save` — SUBACCIÓN INDEPENDIENTE, PENDIENTE

Se separan dos conceptos que hoy están pegados:

1. **guardar el backup nuevo** — entra en la mini-transacción, junto con las
   actualizaciones **no destructivas** que le pertenecen (`UPDATE projects SET
   updated_at`, y el `UPDATE projects SET name` cuando el título cambió);
2. **mantenimiento/purga de backups antiguos** (`DELETE FROM backups` + borrar
   sus archivos) — **NO entra**. Queda pendiente para el bloque de borrados
   destructivos.

Mientras siga ejecutándose después del guardado, su fallo **no** puede
convertir un backup ya confirmado en "guardado fallido":

- va en su **propio `try/catch`**, independiente;
- su fallo **no altera** el resultado del IPC del backup ya confirmado;
- `app.log` distingue las dos cosas de forma inequívoca:
  `Backup guardado OK (action <id>)` y, aparte,
  `ERROR — mantenimiento de backups falló: <detalle>`.

**`backup:save` NO queda declarado libre de riesgos destructivos** hasta que
esa purga se revise en su bloque.

---

## §9. HUÉRFANOS EXISTENTES — SOLO CONTAR

Aprobado: **nada de limpieza automática en el Bloque 4.** Al arrancar se
recorre, se cuenta y se registra en `app.log`:

- archivos `backup_*.json` sin fila en `backups`, por proyecto y tamaño total;
- `reunion_*.json` sin fila en `meeting_preps`;
- `estado.json` de proyectos sin fila en `candidate_evals`;
- `.tmp-*` y `.old-*` de acciones, con su writer.

Sin heurística de borrado, sin diálogos. Solo el dato.

---

## §10. MATRIZ MÍNIMA DE CORTES

`D` = destino · `✓` = intacto/correcto · `—` = no existe

| # | Corte | D final | `.old` | `.tmp` | journal | BD | commit | IPC | Siguiente arranque | Pérdida |
|---|---|---|---|---|---|---|---|---|---|---|
| **C1** | tras el tmp, antes del journal | ✓ sin tocar | — | queda | — | sin fila | sin avanzar | (no llega) | tmp sin journal: se cuenta y se registra (§9) | **no** |
| **C2** | tras el journal, antes de publicar | ✓ sin tocar | — | queda | `publicando` | sin fila | sin avanzar | (no llega) | marca ausente → CASO A → borrar tmp y journal | **no** |
| **C3** | tras mover el original a `.old` (overwrite) | — | `= O` | queda | `publicando` | sin fila | sin avanzar | (no llega) | marca ausente → CASO A → `.old → D`, borrar tmp | **no** |
| **C4** | publicado, antes de la BD | `= N` | `= O` / — | — | `publicando` | sin fila | sin avanzar | (no llega) | marca ausente → CASO A → rollback por hash | **no** (lo no confirmado nunca se dio por guardado) |
| **C5** | base X, disco Y antes de confirmar | vuelve a `O` / se borra | retirado | retirado | borrado | sin fila | sin avanzar | 1) `reintentable:true` | nada pendiente | **no** |
| **C6** | fallo PRE-confirmación (EIO) | vuelve a `O` / se borra | retirado | retirado | borrado | sin fila | sin avanzar | 1) `reintentable:true` | nada pendiente | **no** |
| **C7** | **commit confirmado + corte antes del cleanup** | `= N` | `= O` | — | `publicando` | **con fila** | avanzado | (no llega) | **marca presente → CASO B → NO rollback**, borrar `.old` y journal | **no** |
| **C8** | `aplicado:true` | `= N` | se intenta borrar | — | se intenta borrar | **con fila** | avanzado | 3) `requiereReinicio` | marca presente → CASO B → cleanup | **no** |
| **C9** | rollback y el destino tiene un tercer hash | **se deja tal cual** | conservado | conservado | conservado | sin fila | sin avanzar | 1) `reintentable:false` | CASO C fail-closed, nada tocado | **no** |
| **C10** | rollback y el destino es ilegible | **se deja tal cual** | conservado | conservado | conservado | sin fila | sin avanzar | 1) `reintentable:false` | CASO C fail-closed | **no** |
| **C11** | otro writer encuentra el journal | intacto | intacto | intacto | intacto | — | — | — | **se ignora, se cuenta, se registra** (§7.1) | **no** |
| **C12** | segundo arranque tras cada caso | — | — | — | — | — | — | — | C1–C8 ya resueltos → no queda journal → no-op. C9/C10 siguen fail-closed hasta que intervenga el usuario | **no** |

En **todas**: `security_enabled` / `salt` / `verifier` sin tocar (este bloque no
los escribe), y descifrado real del archivo publicado con la clave vigente.

---

## §11. DECISIONES TOMADAS

**a) Coste — MEDIDO.** `scratchpad/bloque4/bench.js`, N=30 por medida con una
pasada de calentamiento descartada, Electron 30.5.1 / Node 20.16.0, carpeta
artificial local.

| Fase | 64 KB | 512 KB | 2 MB |
|---|---|---|---|
| HOY `writeFileSync` a pelo | 0,826 ms | 0,523 ms | 2,543 ms |
| F1 tmp durable (`fsync` + rename) | 4,308 ms | 5,923 ms | 10,964 ms |
| F1b releer el tmp + sha256 | 0,120 ms | 0,481 ms | 2,503 ms |
| F2 journal durable (~500 B) | 3,387 ms | 3,453 ms | 4,499 ms |
| F3 rename (publicar) | 1,476 ms | 0,976 ms | 2,204 ms |
| F5 borrar journal + `.old` | 0,472 ms | 0,275 ms | 0,336 ms |
| **F4 commit A3.3** (`.sqlite3` de 44 KB) | **27,535 ms** | — | — |

**El hallazgo que importa: el commit A3.3 domina todo lo demás.** 27,5 ms
frente a 9–18 ms de todo el trabajo de archivos junto.

| Payload | Hoy | Protocolo | Delta |
|---|---|---|---|
| 64 KB | 28,36 ms | 37,30 ms | +8,94 ms (×1,3) |
| 512 KB | 28,06 ms | 38,64 ms | +10,58 ms (×1,4) |
| 2 MB | 30,08 ms | 48,04 ms | +17,96 ms (×1,6) |

Sobre un ciclo de autoguardado de 15.000 ms, el guardado completo ocupa entre
el **0,25 % y el 0,32 %**.

**Y para `backup:save` en concreto el protocolo sale más barato que hoy**, no
más caro: hoy son **3 commits** (INSERT + purga + `UPDATE projects`) ≈ 83 ms; el
protocolo junta el INSERT y el `UPDATE projects` en **uno solo** y deja la purga
aparte (§8), así que son 2 commits + trabajo de archivos ≈ 66 ms. El `fsync`
que se añade cuesta menos que el commit que se ahorra.

**No se quita ningún `fsync` por rendimiento.** No hace falta: el margen es
enorme. Si algún día 15 s resultara demasiado frecuente, el intervalo se
estudia aparte.

*Límite de esta medida*: es coste y compatibilidad sobre **disco local**. No
demuestra durabilidad ante un corte eléctrico ni dice nada del comportamiento
real sobre una carpeta sincronizada por Drive.

**b) Los `.tmp-*` de C1 — SOLO CONTAR.** No se borran automáticamente en este
bloque. Son probablemente seguros, pero mezclar una política de limpieza nueva
con el protocolo que se está intentando demostrar no aporta nada. Más adelante
podrá aprobarse la regla "tmp propio + formato válido + sin journal + sin marca
aplicada ⇒ basura demostrable".

**c) `migrateLegacyInlineBackupsToFiles()` — ENTRA.** Es la misma clase de
operación archivo+BD y además corre al arrancar. **Una mini-transacción por
fila.** No necesita contrato IPC público, pero sí usa el mismo resultado
interno (aplicado / no aplicado-reintentable / aplicado-no verificado / no
demostrable). Y si una fila queda en estado **no demostrable**, la migración
**se detiene**: no se sigue con las siguientes como si nada.

---

## §11.bis. BLOQUE 4 — CERRADO

Cerrado con 167/167 de integración, 1365/0 en total, y arranques Electron
reales: launcher, Dashboard, Directorio, `meeting:savePrep`/`updatePrep`,
`candidateEval:save` (primer guardado y reemplazo), cierre y reapertura con los
archivos byte a byte iguales, recuperación de un journal de acción durante el
arranque real, y **PS-2006 impidiendo de verdad que se abra el lanzador** con
el journal, el destino y la base de datos intactos.

**Cobertura pendiente de E2E** (no es deuda de este bloque): la forma 3
(`aplicado:true / verificado:false`) **no se forzó dentro de una BrowserWindow
real** — haría falta inyección física de fallos dentro del proceso Electron.
Su lógica sí está probada ejecutando los handlers y los renderers reales.
Encaja en la batería posterior de fault-injection / cierre / E2E.

---

## §12. LO QUE ESTE DOCUMENTO **NO** DEMUESTRA

- Todo el §2 sigue siendo **lectura de código**. Ninguna de las cinco acciones
  se ha ejecutado todavía contra un fallo inyectado.
- El coste del §11.a está **sin medir**.
- No cubre A2 restore, la purga (§8), borrados destructivos, resolución de
  conflictos, cierre, apagado ni Drive real.
- El protocolo no convierte SQLite + sistema de archivos en una transacción
  atómica real —eso no existe aquí— sino que convierte cada ventana de corte en
  un estado **demostrable** y decidible al arrancar. La prueba del §4 es la
  pieza de la que depende todo lo demás.
