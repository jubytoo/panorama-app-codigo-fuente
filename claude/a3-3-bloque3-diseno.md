# A3.3 — BLOQUE 3: Security/A1 y su coherencia con el motor A3.3

**rev.4 — IMPLEMENTADO, PROBADO Y CERRADO FUNCIONALMENTE.**
Fecha: 2026-09-14. Base: `main.js` 8005 / `db.js` 1609 / `security.js` 100 (antes).
Única revisión vigente: esta. Incluye las correcciones §-0.5 de la revisión
independiente.

## §-1. QUÉ CAMBIÓ AL IMPLEMENTAR (rev.3)

El diseño rev.2 quedó aprobado y se implementó tal cual, con **§6.6 aceptado**
y las tres precisiones del usuario. Tres cosas se corrigieron *porque las
pruebas las encontraron*, no porque estuvieran previstas:

1. **La vuelta atrás se saltaba un archivo.** `swapped.push(it)` iba DESPUÉS
   de los dos renames. Si fallaba el **segundo** rename, ese item no constaba
   como intercambiado: la vuelta atrás lo ignoraba, el original se quedaba en
   `<i>.old` y el archivo del usuario simplemente **no existía**. Detectado
   por G4 ("fallo después del primer swap"). Corregido: se apunta **antes** de
   mover, y la vuelta atrás se decide por hash (§7.2), incluido el caso
   "no está y hay `.old`".
   *Nota: el defecto ya existía en A1 antes de este bloque.*

2. **Dos caminos del callback NO disparan, y es correcto.** La tabla §10.1 de
   la rev.2 decía que `restaurarUltimaImagenConfirmada()` (db.js:828) y la
   reversión de bootstrap (db.js:1284) avisarían. Medido: en los dos el commit
   en memoria **no cambia** (`cMem` solo avanza tras confirmar; una BD legada
   no tiene commit), así que no avisan — que es exactamente el contrato
   "avisa cuando cambia el commit". Las pruebas CB-5 y CB-6 lo **exigen**.

3. **Coste de los hashes: medido, ya no razonado.** Ver §7.4.

## §-0.5. CORRECCIONES DE LA REVISIÓN INDEPENDIENTE (rev.4)

Tres recorridos reproducidos por la revisión, los tres reales. Las 34
aserciones que los cubren **fallan** contra `main.js.PRE-CORRECCIONES` y pasan
contra el código actual.

**A. La barrera de cifrado permitía escribir en claro (§10.3).**
`encryptIfNeeded` comprobaba `isEncrypted && seguridadRequiereRevalidacion`,
pero los cuatro consumidores calculan `isEncrypted = !!securityKey` y
`revalidarSeguridadTrasAdopcion()` pone `securityKey = null`. Resultado:
`isEncrypted === false`, la guarda no saltaba, y el contenido del usuario se
escribía **en claro** en la carpeta compartida. Además `if (!securityKey)
return` dejaba sin tratar la transición "sesión sin Seguridad → BD adoptada
con Seguridad activa". Corregido con `bloqueoDeSeguridad()`, que **no depende
de que exista clave** y cubre también `migrateLegacyInlineBackupsToFiles()` y
el arranque de un nuevo rekey.

**B. Un corte entre los dos renames del primer item borraba el original.**
En la recuperación, `swap-a-medias` contaba como "pendiente" y entraba en la
rama "no se tocó ningún original" → `removeRekeyStaging()` se llevaba el
`.old` (única copia) y el `.new`, dejando el archivo del usuario ausente.
Reproducido con archivos reales: los tres archivos quedaban ilegibles.
Corregido: solo `preparado` cuenta como "nada movido".

**C. La vuelta atrás no aplicaba las reglas por hash que prometía el diseño.**
El `.old` se comprobaba con `existsSync` en vez de contra `original_sha256`, y
`!h.existe` englobaba el resultado **ilegible** de `sha256DeArchivo()`, que no
demuestra ausencia: un destino que no se podía leer se sobrescribía con el
`.old`. Corregido a la tabla del §7.2. Y la pregunta asociada —qué impedía
seguir guardando tras una vuelta atrás incompleta— tenía una respuesta
incómoda: **nada**. Ahora la sesión queda marcada
(`seguridadEnEstadoInconsistente`) y la misma barrera del punto A corta los
cuatro guardados, la migración y cualquier nuevo cambio de Seguridad.

Todo lo demás de la rev.2 se mantiene palabra por palabra.

---

## §10.3. LA BARRERA DE SEGURIDAD DE LA SESIÓN

`bloqueoDeSeguridad()` devuelve un motivo o `null`. **No depende de que exista
una clave**: ese fue el defecto.

| Motivo | Cuándo | Qué corta |
|---|---|---|
| `revalidacion` | la BD adoptada pertenece a otra contraseña, **o** tiene la Seguridad activa y esta sesión no ha validado ninguna clave | `encryptIfNeeded()` (los 4 guardados), `migrateLegacyInlineBackupsToFiles()`, empezar un rekey |
| `rollback-incompleto` | una vuelta atrás no pudo demostrar el estado de algún archivo | lo mismo |

Se levanta al validar una clave contra ESA base de datos (login o
auto-desbloqueo, los dos con descifrado AES-GCM real) o al completar un cambio
de Seguridad. `rollback-incompleto` **no** se levanta en la sesión: el mensaje
pide cerrar la app y revisar el registro.

Escribir en claro cuando la BD exige cifrado es tan grave como cifrar con la
clave equivocada — más, porque deja contenido del usuario legible en una
carpeta sincronizada. Por eso la comprobación es previa a decidir si se cifra.

## §0. Qué cambia en la rev.2

Tres defectos reales de la rev.1, más las precisiones asociadas:

| # | Defecto de la rev.1 | Dónde se corrige |
|---|---|---|
| 1 | La recuperación recalculaba `commitBase` **después** de los renames → declaraba aceptable la versión Y de otro PC y consolidaba encima. Reabría P5. | §6 (journal v2, `base_commit_id`) + §8 (clasificación A/B/C) |
| 2 | La exclusiva solo protege **este** proceso. Los archivos de G: los puede cambiar el otro PC durante PREPARE/SWAP, y el rollback/recovery decidían por **existencia**, no por identidad de los bytes. | §6 (hashes por item) + §7 (reglas de swap/rollback/recovery) |
| 3 | Un journal corrupto o de versión desconocida provocaba `removeRekeyStaging()` — borrando los `.old`, que pueden ser la única copia intacta. | §9 |
| 4 | (precisión) `exigirCommitBase` tenía que impedir también la recarga silenciosa JIT. | §4 |
| 5 | (precisión) `aplicado:true` no podía colapsar en un `ok` indistinguible. | §3.3 |
| 6 | (precisión) el callback de adopción debía cubrir **todos** los caminos. | §10 |
| 7 | §6.bis decidido por ti: **fail-closed**, sin modo degradado. | §11 |

Rev.1 §1 (inventario) y §2 (los seis estados prohibidos) quedan **aprobados
y sin cambios**; se conservan aquí resumidos como referencia.

Alcance autorizado y exclusiones: sin cambios respecto a la rev.1.
Este bloque **no reescribe A1**: conserva su diseño (journal, 5 fases, los
`.old` nunca se borran) y cambia cómo aterriza en la base de datos y cómo
decide qué archivo puede tocar.

---

## §1. A — INVENTARIO (aprobado, resumen)

`dbmod.run()` = `escribirMultiple([una])` = **1 commit A3.3** = 1
reescritura íntegra del `.sqlite3` = 1 punto donde se puede fallar o
adoptar otra versión.

| Función | Línea | `run()` | Momento vs. rename |
|---|---|---|---|
| `collectRekeyInventory` | 3266 | 0 (3 `SELECT`) | antes de todo |
| `rekeySetFlagBulk` | 3311 | **3** | después del último rename |
| `rekeyRestoreFlagsPerItem` | 3327 | **N** (una por archivo) | error, tras los rename |
| `applyRekeyMeta` | 3344 | **3** | fase 4 |
| `recoverInterruptedRekeyIfAny` | 3547 | **hasta 6** | tras terminar los rename |
| `rememberPassword` / `forget…` | 3933/3942 | **1** | tras devolver `ok` |

Totales: setup **7** · change **4** · disable **7** · recuperación **hasta 6**
· vuelta atrás **N**.

`rekeyInProgress` no bloquea `app_theme` (1332), `bounds_*` (1447 — cerrar
cualquier ventana), `last_vacuum_at` (1306), `migrateLegacyInlineBackupsToFiles`
(3658) ni `projects:delete` (7901).

`security.js` no escribe en la base de datos: **cero cambios**.

---

## §2. LOS SEIS ESTADOS PROHIBIDOS (aprobado, resumen)

Los seis son alcanzables hoy. El crítico:

**P2 — archivos con clave VIEJA + salt/verifier NUEVOS → pérdida
permanente.** `applyRekeyMeta('change')` escribe `security_salt` (commit
#1) → `security_verifier` (commit #2) → `security_enabled` (commit #3). Si
el #1 tiene éxito y el #2 falla, el `catch` de 3488 deshace los rename
(archivos a la clave vieja) y **no restaura `app_meta`**. Queda `salt`
nueva + `verifier` viejo: ninguna contraseña valida, y `salt_VIEJA` ya no
existe en ningún sitio — el journal solo guarda `newSalt`/`newVerifier`.

Los demás: **P1** (recuperación termina archivos y no consolida), **P3**
(los 3 `rekeySetFlagBulk` son commits separados), **P4/P5** (recarga
silenciosa por descendencia lineal, `db.js:1462`), **P6**
(`recargarDesdeDisco` no avisa y `securityKey` nunca se revalida), **P7**
(`setMeta` hace `if (procesoComprometido) return;` **sin lanzar**, así que
las fases 3 y 4 pueden ser no-ops silenciosos con `ok:true`).

---

## §3. B — UN CAMBIO DE SEGURIDAD = UNA ACCIÓN LÓGICA

### 3.1 La mutación única

Fases 3 y 4 dejan de ser pasos separados y pasan a ser **una sola**
`dbmod.escribirMultiple()`:

```
function sentenciasDeSeguridad(mode, items, newFlag, newSalt, newVerifier, remembered) {
  const s = [];
  if (items.some((it) => it.hadFlag !== newFlag)) {
    s.push(upd('backups',        newFlag));   // MISMO WHERE que el inventario
    s.push(upd('meeting_preps',  newFlag));
    s.push(upd('candidate_evals',newFlag));
  }
  if (mode === 'disable') {
    s.push(borrarMeta('security_enabled'));
    s.push(borrarMeta('security_salt'));
    s.push(borrarMeta('security_verifier'));
    s.push(borrarMeta('security_remembered'));
  } else {
    s.push(ponerMeta('security_salt',     newSalt));
    s.push(ponerMeta('security_verifier', newVerifier));
    s.push(ponerMeta('security_enabled',  '1'));
    s.push(remembered.guardar ? ponerMeta('security_remembered', remembered.valor)
                              : borrarMeta('security_remembered'));
  }
  return s;
}
```

Propiedades **por construcción**, no por orden de escritura:

- una sola imagen, un solo rename (`db.js:1339-1362`). No existe ningún
  instante con salt nueva y verifier viejo → **P2 cerrado**;
- fallo PRE-confirmación → A3.3 restaura la memoria y el `.sqlite3` del
  disco **no se tocó**: queda TODO el estado anterior;
- `rekeySetFlagBulk`, `rekeyRestoreFlagsPerItem`, `applyRekeyMeta` y
  `columnsApplied` se **retiran**. La vuelta atrás de N commits desaparece
  → **P3 cerrado**;
- `security_remembered` entra en la misma acción → deja de poder apuntar a
  una contraseña que ya no vale.

`setMeta`/`deleteMeta` siguen existiendo para el resto de la app (tema,
bounds, vacuum). La Seguridad deja de usarlos, y su camino comprueba
`procesoComprometido` **lanzando** en vez de enmudecer → **P7 cerrado**.

### 3.2 `remembered` en la operación en vivo vs. en la recuperación

En vivo tenemos la contraseña en la mano: `remembered.valor` es el mismo
blob de `safeStorage` que hoy va a `app_meta`.

En una **recuperación** no la tenemos. Decisión: la consolidación de
recuperación **siempre borra** `security_remembered`. No se guarda ningún
secreto en el journal.

Para que la prueba del §8-B siga siendo decidible, el journal guarda
**solo si el estado final lleva o no lleva** ese valor:
`remembered_final: 'presente' | 'ausente'` — nunca el valor. Y una
recuperación que vaya a consolidar reescribe antes, de forma durable,
`remembered_final = 'ausente'`, para no invalidar su propia prueba en un
segundo corte.

### 3.3 `aplicado: true` — resultado explícito, no un `ok` indistinguible

`escribirMultiple()` puede lanzar
`ErrorDb('io-tras-confirmar', …, { aplicado:true })`: **el cambio sí se
guardó** y db.js ha puesto el latch `desincronizada`.

Hoy el `catch` de `rekeyAllUserFiles` deshace los rename en ese caso →
P2 exacto. Regla nueva:

```
catch (e) {
  if (e && e.aplicado === true) {
    // La BD YA tiene el estado final. Los archivos también. NO se deshace nada.
    securityKey = newKey;
    marcarJournalCleanup(e.commit);          // durable; NO se borra el staging
    return { ok:true, aplicado:true, limpiezaPendiente:true,
             aviso:'El cambio de Seguridad SÍ se ha guardado, pero no se ha podido ' +
                   'verificar. Cierra la aplicación y vuelve a abrirla; NO repitas la ' +
                   'operación. Tus archivos originales siguen en .panorama-rekey.' };
  }
  … vuelta atrás normal (§7) …
}
```

Requisito nuevo sobre `db.js`: `ErrorDb('io-tras-confirmar')` debe llevar
`commit` (el `o._cNuevo` que ya se confirmó) para poder escribir
`consolidated_commit_id`.

El caller (`security-win:submit`) muestra `aviso` con PS-2004 en vez de
cerrar la ventana como si todo hubiera ido bien.

Al siguiente arranque, la recuperación entra por §8-B: reconoce que la BD
ya tiene el estado final, verifica los hashes nuevos, limpia el staging y
**no vuelve a tocar metadatos**.

---

## §4. C — `exigirCommitBase` (revisado)

### 4.1 Contrato

```
escribirMultiple(sentencias, { exigirCommitBase: X, token })
```

Orden exacto de comprobaciones, antes de tocar nada:

1. `escrituraBloqueada` → `ErrorDb('bloqueado')` *(sin cambios)*
2. exclusiva tomada y `token` no coincide → `ErrorDb('ocupado')` *(§5)*
3. **`X && cMem !== X` → `ErrorDb('base-cambiada', {base:X, actual:cMem})`.
   Cero escritura.**
4. `posible = comprobarEscrituraPosible()`
5. **`X && posible.decision.tipo === 'recarga'` → `ErrorDb('base-cambiada')`.
   NO recargar, NO reintentar.** (Hoy la línea 1464 recarga en silencio.)
6. resto de negativas sin cambios: `conflicto`, `degradado`,
   `bd-ilegible`, `no-verificable`
7. **`X && cMem !== X` otra vez** (aserción de invariante: ningún camino
   del paso 4 debe haber movido `cMem`)
8. `aplicarYConfirmar(…)`

La regla en una frase: **con `exigirCommitBase`, "el disco avanzó" nunca
es motivo para reintentar; es motivo para rechazar.**

### 4.2 Decisión ante `base-cambiada` en la operación EN VIVO

**Abortar y deshacer (§7), no reaplicar.** Razones:

- el inventario se calculó sobre X; en Y puede haber filas nuevas cuyo
  archivo **no está en nuestro staging** → el `UPDATE` masivo las marcaría
  como cifradas sin estarlo (P3 por la puerta de atrás);
- deshacer es seguro: los `.old` están intactos y la BD **no se tocó** (el
  rechazo es previo a cualquier mutación);
- reaplicar sobre Y exigiría recolectar de nuevo, re-cifrar lo que falte y
  revalidar: es otra operación, no un reintento. Se le pide al usuario que
  reintente, que es exactamente eso.

Mensaje: "otro equipo guardó cambios mientras se re-cifraba; no se ha
modificado nada, vuelve a intentarlo" + PS-2003.

### 4.3 Pruebas obligatorias (5 estados RAM/disco reales)

| Estado | Esperado | Comprobación |
|---|---|---|
| RAM X / disco X | **confirma** | 1 commit, `.gen` coherente, `integrity_check ok` |
| RAM X / disco Y **descendiente lineal** | **`base-cambiada`** | sha256 del `.sqlite3` y del `.gen` **idénticos** antes y después |
| RAM X / disco **sibling** (mismo padre, commit distinto) | `conflicto` | latch `conflicto`, cero escritura |
| **caso 8**: mismos ids, bytes distintos | `conflicto` | latch `conflicto`, cero escritura |
| disco **no verificable** | `io`/`no-verificable` | cero escritura |

---

## §5. D — EXCLUSIVA DE OPERACIÓN (local, y lo que NO cubre)

| | |
|---|---|
| Qué es | token en memoria de `db.js`: `let exclusiva = null` |
| Se toma | `dbmod.tomarExclusiva('seguridad')` → `{token}`; `ErrorDb('ocupado')` si ya hay una |
| Se suelta | `dbmod.soltarExclusiva(token)` — idempotente |
| PERMITE | `escribirMultiple(s, {token})` con el token correcto, y **todas** las lecturas |
| BLOQUEA | cualquier `run()`/`escribirMultiple()`/`vacuum()` sin token → `ErrorDb('ocupado')`: `app_theme`, `bounds_*`, `last_vacuum_at`, los 4 guardados, `projects:delete`, `migrateLegacyInlineBackupsToFiles` |
| Se activa | en `rekeyAllUserFiles()` donde hoy está `rekeyInProgress = true` (3368), y en `recoverInterruptedRekeyIfAny()` antes de tocar ningún archivo |
| Se levanta | en el `finally` que ya existe (3533), siempre |
| Si falla | se suelta igual. **No deja estado persistente**; lo que sobrevive es el journal |
| vs. latches | ortogonal y subordinada. Un latch irreversible gana siempre |
| Qué NO es | no es un latch, no sale en `estadoLatch()`, no se levanta con `levantarLatch()` |

`rekeyInProgress` y sus 4 guardas se conservan: dan el mensaje amable y
temprano. La exclusiva es la red por debajo.

### 5.1 Lo que la exclusiva NO cubre (y por eso existen §6 y §7)

La exclusiva es **de este proceso**. Con la carpeta de datos en G:, durante
los minutos de PREPARE/SWAP el otro PC puede actualizar una preparación de
reunión, un `estado.json` de evaluación, o cualquier archivo cuya ruta ya
está en nuestro inventario. La base de datos la protege A3.3; **el archivo
no lo protege nadie**. Esa es exactamente la superficie que cierran los
hashes por item.

---

## §6. JOURNAL v2

### 6.1 Formato

```jsonc
{
  "v": 2,
  "startedAt": "2026-09-14T…",
  "writer": "<installation-id de quien inició>",
  "mode": "setup" | "change" | "disable",
  "newFlag": 0 | 1,
  "newSalt": "<hex>" | null,
  "newVerifier": "<hex>" | null,
  "remembered_final": "presente" | "ausente",   // NUNCA el valor
  "base_commit_id": "<commit A3.3>",            // <<< NUEVO
  "phase": "prepare" | "swap" | "cleanup",
  "consolidated_commit_id": null | "<commit A3.3>",
  "items": [
    { "i": 0, "table": "backups", "rowKey": 17,
      "absPath": "…/backup_…json",
      "hadFlag": 1,
      "original_sha256": "…", "original_size": 12345,   // <<< NUEVO
      "new_sha256":      "…", "new_size":      12401,   // <<< NUEVO
      "missing": false }
  ]
}
```

### 6.2 `base_commit_id` — cuándo y cómo

- Se captura **inmediatamente después de `collectRekeyInventory()`** y
  **antes de PREPARE**: antes del primer `.new`, muchísimo antes del primer
  swap. Es `dbmod.getCommitActual()`.
- Queda escrito en el journal **de forma durable antes de que cambie ni un
  archivo**.
- En la operación en vivo, la consolidación exige `journal.base_commit_id`.
- **En una recuperación NO se inventa una base nueva.** La referencia sigue
  siendo la que inició aquella operación. Esto es lo que cierra el agujero
  de la rev.1: ya no se puede declarar Y aceptable simplemente porque es lo
  que hay ahora.

### 6.3 Hashes por item — cuándo y de qué bytes

- `original_sha256` / `original_size`: de los bytes **realmente leídos** en
  PREPARE (el `raw` de la línea 3435). Coste cero: ya está en memoria.
- `new_sha256` / `new_size`: de los bytes **realmente releídos del disco**
  (el `readBack` de la línea 3453, que ya existe para la comprobación de
  ida y vuelta). Coste cero, y cumple "los hashes deben corresponder a los
  bytes realmente preparados".
- El journal se reescribe **completo y durable** al pasar a `phase:'swap'`
  (hoy ya se reescribe en 3463): esa escritura es la que deja los hashes en
  disco **antes del primer swap**.

### 6.4 Durabilidad del journal

Hoy es `fs.writeFileSync()` a pelo: un corte puede dejarlo truncado o
perdido. Pasa a escribirse con la misma disciplina que
`guardarRegistroUbicaciones()` del Bloque 2: **tmp + bucle de `writeSync`
con comprobación de progreso + `fsync` + `rename` + relectura de
verificación**, con la lista cerrada de códigos "fsync no soportado"
(`EINVAL/ENOSYS/ENOTSUP/EOPNOTSUPP`). Helper compartido
`escribirJsonDurable(ruta, obj)`.

Si el journal no se puede dejar durable, la operación **no empieza**: se
retira el staging (todavía no se ha tocado ningún original) y se devuelve
error. Fail-closed antes de crear riesgo.

### 6.5 Fases y el marcador de cleanup

```
prepare  ──▶  swap  ──▶  [mutación única confirmada]  ──▶  cleanup  ──▶  (staging retirado)
```

`phase: 'cleanup'` + `consolidated_commit_id` se escribe **después** de que
la mutación única confirme y **antes** de `removeRekeyStaging()`.

Consecuencia directa (§9): "staging **con** journal en fase `cleanup`" es
residuo demostrable de una operación ya confirmada. "Staging **sin**
journal" deja de poder deducirse como cleanup — porque con v2 el journal
está ahí hasta el final.

### 6.6 Journal de OTRO writer — **APROBADO Y EN VIGOR**

Con la carpeta de datos compartida, el staging `<userData>/.panorama-rekey`
es **el mismo para los dos PCs**. Hoy `recoverInterruptedRekeyIfAny()` no
mira de quién es el journal: PC A terminaría el rekey de PC B, incluso con
PC B ejecutándolo **ahora mismo**.

`rekeyAllUserFiles()` sí aborta si ve un staging (3394), pero la
recuperación del arranque no.

Regla en vigor: si `journal.writer !== installation-id actual` → **no se
recupera**. Cero renames, cero borrados, cero consolidación, journal y
staging intactos, PS-2004, no login, no launcher, cerrar la app.

**Ni siquiera un `phase:'cleanup'` ajeno se limpia**: el equipo originario
podría seguir vivo, o reanudarse, trabajando sobre ese mismo staging
compartido. No hay transferencia automática de propiedad del journal en
este bloque.

Texto mostrado: *"Este cambio de Seguridad fue iniciado por otro equipo.
Cierra Panorama del Servicio en todos los equipos y vuelve a abrirlo primero
en el equipo que inició el cambio. Si ese equipo ya no existe, conserva la
carpeta .panorama-rekey para recuperación manual."*

Probado en **RKEY-W1** (las tres fases) y en el arranque real nº 3.

---

## §7. REGLAS DE SWAP / ROLLBACK / RECOVERY POR HASH

Principio: **"el archivo existe" deja de ser prueba de nada.** Antes de
mover un `absPath` existente se calcula su hash y solo se toca si coincide
con lo que el journal espera.

Notación: `O` = `original_sha256`, `N` = `new_sha256`, `T` = cualquier
tercer hash, `—` = ausente.

### 7.1 SWAP (fase 2, en vivo)

Para cada item, antes de `rename(absPath → .old)`:

| H(absPath) | Acción |
|---|---|
| `O` | intercambiar (camino normal) |
| `N` | ya intercambiado → saltar (idempotencia) |
| `—` | registrado `missing:true` → saltar; **si no lo estaba → abortar** |
| `T` | **modificación externa → abortar la operación entera**. Este item NO se toca. Se entra en ROLLBACK de lo ya intercambiado |

### 7.2 ROLLBACK (camino de error)

Para cada item ya intercambiado, en orden inverso:

| H(absPath) | Acción |
|---|---|
| `N` | es lo que pusimos nosotros → `absPath → .new`, `.old → absPath` |
| `—` | el archivo desapareció → restaurar `.old → absPath`. *(Decisión explícita: volver al estado previo a NUESTRO cambio; un borrado remoto no es dato que destruyamos al restaurar.)* |
| `T` | **otro PC lo reescribió después de nuestro swap → NO pisarlo.** Se deja `absPath` tal cual, el `.old` se conserva en el staging, el item se marca `noDevuelto` |
| `O` | ya estaba deshecho → nada |

Si hay algún `noDevuelto`, se termina por el camino ya existente de
"la vuelta atrás no se pudo completar": **no se borra el staging**,
PS-2004, y el mensaje nombra la carpeta.

### 7.3 RECOVERY (arranque) — tabla completa por item

| H(absPath) | `.old` | `.new` | Interpretación | Acción (solo en caso A del §8) |
|---|---|---|---|---|
| `O` | `—` | `N` | sin intercambiar | intercambiar |
| `—` | `O` | `N` | corte entre los dos renames | `.new → absPath` |
| `N` | `O` | `—` | ya intercambiado | nada |
| `N` | `O` | `N` | swap hecho, `.new` sin retirar | nada (lo limpia el cleanup) |
| `—` | `—` | `—` | item `missing:true` | nada |
| `T` | cualquiera | cualquiera | **modificación externa** | **fail-closed total** |
| presente | — | — | registrado `missing:true` pero ahora existe | **fail-closed total** |
| cualquiera | hash ≠ `O` | — | staging manipulado/truncado | **fail-closed total** |
| cualquiera | — | hash ≠ `N` | staging manipulado/truncado | **fail-closed total** |
| `—` | `—` | `N` | original ausente sin `missing:true` | **fail-closed total** |

"Fail-closed total" = **ningún rename**, ninguna consolidación, ningún
borrado; se conservan `absPath`, `.old`, `.new` y el journal byte a byte;
PS-2004; cerrar la app (§11).

Es deliberadamente total, no por item: si un solo archivo no es
demostrable, la operación completa deja de serlo.

### 7.4 Coste — MEDIDO

Los dos hashes de PREPARE son gratis (bytes ya en memoria). Lo nuevo es
**una lectura extra de cada `absPath` antes de moverlo** en SWAP, ROLLBACK
y RECOVERY.

Medido en carpeta artificial de prueba (Electron 30.5.1 / Node 20.16.0,
N=40 por tamaño, sección C de la suite):

Cifras de la ejecución FINAL guardada en `scratchpad/bloque3/resultados-capaD.txt`
(la del `main.js` corregido; la ejecución contra `main.js.PRE-CORRECCIONES` es
otra y sus tiempos no se mezclan aquí):

| Tamaño | Leer + SHA-256 | Solo leer | Sobrecoste del hash |
|---|---|---|---|
| 64 KB | 0,472 ms | 0,169 ms | 0,30 ms |
| 512 KB | 1,258 ms | 0,551 ms | 0,71 ms |
| 2 MB | 4,515 ms | 1,710 ms | 2,81 ms |

Con 200 backups de 512 KB, el sobrecoste total del SWAP son **~0,25 s**
frente a una operación que ya descifra y re-cifra esos mismos 200 archivos.
Es irrelevante comparado con lo que compra, así que no se optimiza.

Los tiempos varían entre ejecuciones; lo que se mantiene es el orden de
magnitud (décimas de milisegundo por archivo).

---

## §8. RECUPERACIÓN CUANDO `commit actual !== base_commit_id`

No se consolida sin clasificar. Tres casos, y solo tres.

### Caso A — `actual === journal.base_commit_id`

La operación puede continuar, **sujeta a las comprobaciones por hash del
§7.3**. Si el §7.3 dice fail-closed, manda el §7.3.

Secuencia: tomar exclusiva → verificar hashes de todos los items →
terminar los renames pendientes → `escribirMultiple(sentencias, {token,
exigirCommitBase: journal.base_commit_id})` → `phase:'cleanup'` →
retirar staging.

### Caso B — `actual !== base` Y la BD contiene **exactamente** el estado final del journal

Es un corte POST-confirmación. Hay que **demostrarlo**, punto por punto:

| Prueba | setup / change | disable |
|---|---|---|
| `security_enabled` | `=== '1'` | **ausente** |
| `security_salt` | `=== journal.newSalt` | **ausente** |
| `security_verifier` | `=== journal.newVerifier` | **ausente** |
| `security_remembered` | presente ⟺ `remembered_final === 'presente'` | **ausente** |
| `encrypted` de **todas** las filas de `journal.items` | `=== journal.newFlag` | `=== journal.newFlag` |
| archivos | **todo** item no-`missing` tiene `H(absPath) === new_sha256` | ídem |

Si **todo** se cumple: **NO se vuelve a consolidar.** Se escribe
`phase:'cleanup'` (si no estaba) y se retira el staging. Fin.

Si falla **cualquier** punto → **Caso C**. En particular: que la BD actual
sea descendiente de `base_commit_id` **no forma parte de la prueba**. La
prueba es el contenido, no el linaje — exactamente como pediste.

### Caso C — `actual !== base` y el estado final NO queda demostrado

**Fail-closed.** Ningún rename nuevo. Ninguna consolidación. Ningún
borrado. PS-2004 + cerrar (§11).

Caso típico y correcto: PC B cambió **su** contraseña después, así que
`security_salt !== journal.newSalt`. La salida es manual y el diálogo
nombra la carpeta. Es el precio de no destruir nada, y lo prefiero a una
consolidación "inteligente".

### Prueba obligatoria

**RKEY-MP1** — X → `journal(base=X)` → crash → otro PC publica Y →
recuperación en A ⇒ **cero escritura de metadatos del journal sobre Y**.
Se comprueba: `security_salt`/`security_verifier`/`security_enabled`
idénticos a los de Y byte a byte, sha256 del `.sqlite3` sin cambiar, `.gen`
sin cambiar, staging intacto, la app cierra con PS-2004.

---

## §9. JOURNAL CORRUPTO, DESCONOCIDO, v1 O AUSENTE

Se retira el axioma "no hay journal, por tanto era cleanup".

| Estado encontrado | Hoy | **Nueva política** |
|---|---|---|
| v2 válido | — | §7 + §8 |
| v2 en `phase:'cleanup'` con estado final demostrado (§8-B) | — | **limpiar staging**; no tocar metadatos |
| **Journal ilegible / JSON roto** | `removeRekeyStaging()` (3566-3568) | **NO BORRAR NADA.** PS-2004 + cerrar |
| **Versión desconocida / formato no reconocido** | `removeRekeyStaging()` (3571-3574) | **NO BORRAR NADA.** PS-2004 + cerrar |
| **Staging SIN journal** | `removeRekeyStaging()` (3550-3563) | **NO BORRAR NADA.** PS-2004 + cerrar. Con v2 el journal vive hasta el final: su ausencia ya no demuestra cleanup |
| **v1 sin ningún `.old`** | retira el staging | **se puede retirar**: sin `.old` no se tocó ningún original, y el journal es legible y válido *en su versión*. Se registra en `app.log` |
| **v1 con al menos un `.old`** | consolida a ciegas | **NO BORRAR NADA, NO renombrar nada.** PS-2004 + cerrar |

**Nunca se convierte un v1 en v2 inventando datos.** Un v1 no tiene
`base_commit_id` ni hashes, y ninguno de los dos se puede reconstruir a
posteriori: los bytes originales ya no están donde estaban.

Pruebas obligatorias:

- **RKEY-J1** — corte tras el primer swap + journal corrupto ⇒ `.old`,
  `.new` y el original superviviente **byte a byte idénticos** antes y
  después del arranque.
- **RKEY-J2** — journal de versión desconocida + `.old` presente ⇒ **cero
  borrados** (recuento de archivos y sha256 de cada uno, antes y después).
- **RKEY-J3** — staging demostrablemente de cleanup POST-confirmación
  (`phase:'cleanup'`, §8-B completo) ⇒ **sí se limpia**, y los metadatos
  de Seguridad no cambian.

---

## §10. F — CLAVE EN MEMORIA / ADOPCIÓN DE BD

### 10.1 El callback, en TODOS los caminos

Contrato: **se dispara exactamente cuando cambia el commit de la imagen en
memoria**, sea cual sea el camino.

```
dbmod.alCambiarImagenEnMemoria(fn)   // fn({ de, a, motivo })
```

Caminos reales de `db.js` que sustituyen la imagen, uno por uno:

Tabla **corregida con lo medido** (líneas del `db.js` implementado):

| Línea | Camino | ¿cambia `cMem`? | `motivo` | ¿dispara? | Prueba |
|---|---|---|---|---|---|
| 562 | `leerDisco()` — abre una copia **temporal** para inspeccionar; no es `db` | no | — | **no** | — |
| 828 | `restaurarUltimaImagenConfirmada()` — vuelta atrás PRE-confirmación | **no** — `cMem` solo avanza tras confirmar | `'restauracion'` | **NO** | CB-5 |
| 854 | `recargarDesdeDisco()` — **adopción real de otra versión** | sí | `'recarga'` | **sí** | CB-4 |
| 1009/1011 | `getDb()` — carga inicial | sí, si la BD trae identidad | `'apertura'` | sí | CB-1 |
| 1191 | bootstrap: commit raíz de una BD nueva o legada | sí | `'bootstrap'` | sí | CB-2 |
| 1284 | reversión de un bootstrap fallido | **no** — una BD legada no tiene commit, así que `cMem` era y sigue siendo `null` | `'reversion-bootstrap'` | **NO** | CB-6 |
| 1384 | `aplicarYConfirmar()` POST-confirmación | sí | `'commit-propio'` | sí | CB-3 |
| 1418 | `rehacerBookkeepingDesdeDisco()` (ids y bytes verificados antes) | sí | `'commit-propio'` | sí | — |
| 1604 | `_resetParaPruebas()` | sí | — | solo pruebas | CB-9 |

Las dos filas **NO** son la corrección del §-1.2: el contrato es "avisa
cuando cambia el commit", no "cuando se sustituye el objeto de sql.js", y las
pruebas CB-5 y CB-6 exigen que **no** avisen.

`main.js` revalida en todos los motivos **excepto** `'commit-propio'`.

### 10.2 Revalidación en `main.js`

```
function revalidarSeguridadTrasAdopcion() {
  const habilitada = getMeta('security_enabled') === '1';
  const verifier   = getMeta('security_verifier');
  if (!habilitada) { securityKey = null; return; }      // sin escribir nada
  if (!securityKey) return;
  // verifierFor(key) es HMAC de la CLAVE: no depende de la sal, así que la
  // clave en memoria se valida contra el verificador de ESTA BD.
  if (securitymod.verifierFor(securityKey) !== verifier) {
    securityKey = null;
    seguridadRequiereRevalidacion = true;               // bloquea cifrar y descifrar
  }
}
```

- **No reutilizar ciegamente `securityKey`** → se compara contra el
  verificador de la BD adoptada.
- **Validez por descifrado real** → además, en el **login**, tras derivar
  la clave y validar el verificador, se descifra de verdad un archivo con
  `encrypted=1` si existe (`decryptString`, AES-GCM autenticado: una clave
  equivocada falla, no devuelve basura). `looksEncrypted` no cuenta como
  prueba en ningún sitio.
- **Nada cifrado se abre sin validar** → con `securityKey === null` los
  lectores ya lanzan (1603, 1611, 2853, 7246, 7313); se añade la guarda de
  `seguridadRequiereRevalidacion` a `encryptIfNeeded` (222).
- **Contraseña recordada que ya no vale** → `tryAutoUnlock()` (3949) ya
  devuelve `false` sin escribir. Se cierra además el hueco de
  `forgetRememberedPassword()` (7938/7958/7977): pasa a formar parte de la
  mutación única en los modos que consolidan, y en `login` solo borra si de
  verdad había algo recordado.

No se crea UI de conflicto multi-PC: el efecto visible es que se vuelve a
pedir la contraseña.

---

## §11. §6.bis — FAIL-CLOSED (decisión tomada)

Si la recuperación tocó/terminó archivos pero **no puede demostrar y
confirmar** la BD correspondiente — es decir, §7.3 fail-closed, §8-C, o
cualquiera de los fail-closed del §9:

- **no** `runLoginFlow()`
- **no** launcher
- **no** `migrateLegacyInlineBackupsToFiles()`
- **no** `maybeRunPeriodicVacuum()`
- **no** ninguna escritura auxiliar (tema, bounds, `last_vacuum_at`)
- PS-2004 con el texto explícito y la ruta de `.panorama-rekey`
- **cerrar la app**
- staging y journal **intactos**
- se reintenta en el siguiente arranque

Sin modo degradado ni solo-lectura en este bloque.

### 11.1 Corrección de orden en el arranque

Hoy el orden es (main.js 6647-6666):

```
maybeRunPeriodicVacuum();            // 6647  <-- ESCRIBE, y va ANTES
recoverInterruptedRekeyIfAny();      // 6655
runLoginFlow();                      // 6659
migrateLegacyInlineBackupsToFiles(); // 6666  <-- ESCRIBE
```

`maybeRunPeriodicVacuum()` es una escritura (`VACUUM` + `last_vacuum_at`) y
corre **antes** de la recuperación del rekey. Con la regla de arriba tiene
que moverse. Orden nuevo:

```
recoverInterruptedRekeyIfAny();      // primero de todo
   └─ fail-closed -> PS-2004 + app.quit(), sin tocar nada más
maybeRunPeriodicVacuum();            // solo si la recuperación quedó limpia
runLoginFlow();
migrateLegacyInlineBackupsToFiles();
```

---

## §12. MATRIZ REVISADA DE ESTADOS

### 12.1 Los siete estados prohibidos → dónde quedan cerrados

| | Estado prohibido | Hoy | Cerrado por |
|---|---|---|---|
| P1 | archivos clave NUEVA + salt/verifier VIEJOS | alcanzable | §3.1 mutación única · §8-A/B/C · §11 fail-closed |
| P2 | archivos clave VIEJA + salt/verifier NUEVOS | **alcanzable, pérdida permanente** | §3.1 (no existe el instante intermedio) · §3.3 (`aplicado:true` no deshace) |
| P3 | parte de los tipos re-cifrados y otros no | alcanzable | §3.1 (flags y meta en el mismo commit) · §4.2 (no reaplicar sobre Y) |
| P4 | actualización remota pisada | alcanzable | §4.1 pasos 3/5/7 |
| P5 | recuperación consolidando sobre una BD que cambió | alcanzable | §6.2 `base_commit_id` en el journal · §8 A/B/C |
| P6 | `securityKey` incompatible con la BD adoptada | alcanzable | §10.1 callback en todos los caminos · §10.2 |
| P7 | `setMeta` enmudece con `procesoComprometido` | alcanzable | §3.1 (el camino de Seguridad lanza) |
| **P8** | **archivo de otro PC pisado por swap/rollback/recovery** | **alcanzable** (nuevo, tu punto 2) | §6.3 hashes · §7.1/7.2/7.3 |
| **P9** | **`.old` borrado por un journal corrupto** | **alcanzable** (nuevo, tu punto 3) | §9 |

### 12.2 Estado de UN item, por hashes (resumen operativo)

| `absPath` | `.old` | `.new` | Nombre | SWAP | ROLLBACK | RECOVERY |
|---|---|---|---|---|---|---|
| `O` | `—` | `N` | preparado | intercambiar | nada | intercambiar |
| `—` | `O` | `N` | swap a medias | n/a | `.old → absPath` | `.new → absPath` |
| `N` | `O` | `—` | intercambiado | saltar | `.old → absPath` | nada |
| `N` | `O` | `N` | intercambiado, `.new` sin retirar | saltar | `.old → absPath` | nada |
| `—` | `—` | `—` | `missing:true` | saltar | saltar | saltar |
| `T` | * | * | **ajeno** | abortar, no tocar | **no pisar**, `noDevuelto` | **fail-closed total** |
| * | ≠`O` | * | **staging manipulado** | abortar | abortar | **fail-closed total** |
| * | * | ≠`N` | **staging manipulado** | abortar | abortar | **fail-closed total** |

### 12.3 Recuperación, por relación con la base

| `actual` vs `base_commit_id` | Estado final del journal en la BD | Decisión |
|---|---|---|
| `===` | — | **A**: continuar, sujeto a §7.3 |
| `!==` | demostrado completo (§8-B) | **B**: NO consolidar; cleanup |
| `!==` | no demostrado | **C**: fail-closed |

### 12.4 Journal

| Journal | Staging | Decisión |
|---|---|---|
| v2 válido, `phase` prepare/swap | con/sin `.old` | §8 A/B/C |
| v2 `phase:'cleanup'` + §8-B completo | cualquiera | limpiar staging, no tocar metadatos |
| v2 `phase:'cleanup'` sin §8-B | cualquiera | **fail-closed** |
| ilegible | cualquiera | **fail-closed, cero borrados** |
| versión desconocida | cualquiera | **fail-closed, cero borrados** |
| ausente | cualquiera | **fail-closed, cero borrados** |
| v1 | **sin ningún `.old`** | retirar staging (no se tocó ningún original) |
| v1 | **con algún `.old`** | **fail-closed, cero borrados** |
| v2 de **otro writer** | cualquiera | **fail-closed** (§6.6, en vigor; ni un `cleanup` ajeno se limpia) |

### 12.5 Resultado de una operación en vivo

| Resultado | `ok` | `aplicado` | Archivos | BD | Staging |
|---|---|---|---|---|---|
| éxito | `true` | — | nuevos | estado nuevo | retirado |
| `base-cambiada` antes de confirmar | `false` | `false` | devueltos | **intacta** | retirado |
| fallo PRE-confirmación | `false` | `false` | devueltos | **intacta** | retirado |
| rollback incompleto (`noDevuelto` o error de rename) | `false` | `false` | parcial | **intacta** | **conservado** |
| hash ajeno detectado en SWAP | `false` | `false` | devueltos | **intacta** | retirado |
| `io-tras-confirmar` | `true` | `true` | nuevos | **estado nuevo** | **conservado**, `phase:'cleanup'` |

---

## §13. G — MATRIZ DE FALLOS INYECTADOS

En **cada** escenario se comprueban las 10 cosas de la rev.1:
`security_enabled` · `security_salt` · `security_verifier` · **descifrado
REAL de un backup** · **de un meeting prep** · **de un candidate eval** ·
staging/journal · commit A3.3 · estado tras reiniciar · **pérdida de
datos: NO**.

"Descifrado real" = derivar la clave de la contraseña que *debe* valer en
ese estado, llamar a `decryptString()` y comparar con el texto original
conocido. `looksEncrypted` no cuenta.

### 13.1 Los 12 obligatorios (rev.1, se mantienen)

| # | Escenario | Inyección |
|---|---|---|
| 1 | fallo preparando el primer archivo | `writeFileSync` del `.new` i=0 |
| 2 | fallo preparando un archivo intermedio | `.new` i=k |
| 3 | fallo justo antes del primer swap | tras escribir `phase:'swap'` |
| 4 | fallo después del primer swap | tras el rename i=0 |
| 5 | fallo tras el último swap, antes de consolidar | antes de `escribirMultiple` |
| 6 | fallo **durante** la mutación única | `_inyectarFalloEn()`, PRE y POST confirmación |
| 7 | fallo tras confirmar, antes de limpiar staging | tras `escribirMultiple` |
| 8 | kill/reinicio en **cada** estado anterior | proceso nuevo sobre la misma carpeta |
| 9 | otra versión legítima X→Y antes de consolidar | segundo escritor A3.3 |
| 10 | sibling/conflicto | `.gen` de otro writer |
| 11 | disco no verificable | `_inyectarFalloEn('leerDisco')` |
| 12 | contraseña recordada que ya no corresponde | adopción + `verifierFor` distinto |

### 13.2 Nuevos de la rev.2

| Id | Escenario | Asserción central |
|---|---|---|
| **RKEY-MP1** | X → `journal(base=X)` → crash → otro PC publica Y → recuperación en A | **cero escritura** de metadatos del journal sobre Y; sha256 del `.sqlite3` y del `.gen` sin cambiar; PS-2004; app cerrada |
| **RKEY-MP2** | A prepara `candidate eval` V1; B publica V2 **antes** del swap | A detecta hash distinto y **no pisa V2**; V2 intacto byte a byte |
| **RKEY-MP3** | A ya hizo swap; B publica V3; A entra en rollback por `base-cambiada` | el rollback **no** sustituye V3 por `.old`; V3 intacto; `.old` conservado; `noDevuelto` registrado |
| **RKEY-MP4** | crash; otro PC modifica un archivo; recovery ve un tercer hash | **ningún rename destructivo**; `absPath`, `.old`, `.new` y journal intactos byte a byte |
| **RKEY-J1** | corte tras el primer swap + journal corrupto | `.old`, `.new` y original superviviente byte a byte idénticos |
| **RKEY-J2** | journal de versión desconocida + `.old` | **cero borrados** (recuento + sha256 de cada archivo) |
| **RKEY-J3** | staging de cleanup POST-confirmación (`phase:'cleanup'` + §8-B) | **sí** se limpia; metadatos de Seguridad sin cambiar |
| **RKEY-V1A** | journal v1 sin ningún `.old` | staging retirado, nada más tocado |
| **RKEY-V1B** | journal v1 con al menos un `.old` | **cero borrados, cero renames**, PS-2004, app cerrada |
| **RKEY-B** | crash POST-confirmación de la mutación única | §8-B demostrado → cleanup, metadatos **no** reescritos |
| **RKEY-BC** | crash POST-confirmación y luego B cambia su contraseña | §8-B falla → **caso C** fail-closed, nada tocado |
| **CB-1..9** | los 9 caminos de la tabla §10.1 | el callback se dispara **exactamente** donde dice la tabla, con `de`/`a` correctos, y **no** en 759 |
| **XCB-1..5** | los 5 estados RAM/disco del §4.3 | según la tabla |
| **EXC-1** | tema/bounds/vacuum durante la exclusiva | `ErrorDb('ocupado')`, cero commits, el rekey no se altera |
| **ORD-1** | fail-closed en la recuperación | `maybeRunPeriodicVacuum`, `runLoginFlow`, `migrateLegacy…` y el launcher **no** se ejecutan |

### 13.3 Arnés

Se reutiliza el del Bloque 2 (`construirMain()` extrae las funciones
reales de `main.js` a un ámbito con `app`/`dialog` simulados) más los
ganchos `_inyectarFalloEn(punto)` / `_inyectarGancho(fn)` de `db.js`,
inertes en producción. Para MP2/MP3/MP4 hace falta un segundo escritor
A3.3 real sobre la misma carpeta de prueba, igual que en el núcleo aislado.

**Protección obligatoria del arnés**, idéntica a los bloques 1 y 2: abortar
si la ruta de prueba coincide con la ubicación real configurada, contiene
`BD-PanoramaServicio`, apunta a la BD real, o no está dentro de
`%TEMP%\_a33-bloque3-PRUEBAS`.

> **EVIDENCIA INVALIDADA (corregido el 2026-09-15).** El guardián «coincide
> con la ubicación real configurada» **estuvo inerte** en todos los arneses de
> los bloques 1–4: leían `location.json` buscando `dir`/`path`, y la clave
> real es `userDataDir`, así que devolvían `null` y no comparaban nada. Lo que
> sí protegió fue la redundancia: la cadena literal `bd-panoramaservicio` y la
> marca obligatoria `_a33-…-PRUEBAS`. Corregido con un lector único y
> **fail-closed** (`scratchpad/comun/guardia-rutas.js`, pruebas
> **GUARD-LOC-1..5**): si `location.json` existe y no se puede interpretar, el
> arnés no se ejecuta (exit 99).
>
> Consecuencia sobre la evidencia ya publicada: donde estos documentos y las
> salidas de las suites dicen «producción intacta / no tocada» comparando
> `%APPDATA%\panorama-app\panorama.sqlite3` (`F71F4140…`, 57 344 B), lo que
> se comprobó fue **una copia local residual, no la BD viva configurada**, que
> es `G:\Mi unidad\BD-PanoramaServicio\panorama.sqlite3`. **Esto es pérdida de
> evidencia, no evidencia de corrupción**: no hay ningún indicio de que las
> pruebas anteriores modificaran la BD real, simplemente no se demostró por
> hash que quedara intacta. Desde ahora la prueba canónica es el SHA-256 de la
> BD viva; la copia local queda como dato secundario.

---

## §14. H — REGRESIÓN

- Bloque 1 (`db.js` integrado): **393**
- Bloque 2 (wiring de `main.js`): **221**
- Integridad de `ERROR_CODES`: **43** *(ya hecha)*
- A1 y B2 existentes: sus casos se reconstruyen dentro de la suite del
  Bloque 3 (A1 no tenía suite automatizada propia)

---

## §15. ARCHIVOS QUE SE TOCARÍAN

| Archivo | Cambio | Naturaleza |
|---|---|---|
| `db.js` | `exigirCommitBase` (§4); exclusiva (§5); `alCambiarImagenEnMemoria()` (§10.1); `commit` en `ErrorDb('io-tras-confirmar')` (§3.3) | **aditivo**; sin cambios de forma en la API existente |
| `main.js` | journal v2 (§6); hashes y reglas §7; clasificación §8; política §9; mutación única §3; `aplicado:true` §3.3; revalidación §10.2; orden de arranque §11.1; retirar `rekeySetFlagBulk`/`rekeyRestoreFlagsPerItem`/`applyRekeyMeta`/`columnsApplied` | sustitución acotada dentro de A1; el diseño de A1 (journal, 5 fases, `.old` intocables) **no cambia** |
| `security.js` | **ninguno** | sigue en 0 modificaciones |

---

## §16. LO QUE ESTE BLOQUE **NO** DEMUESTRA

- Los cortes de corriente se siguen simulando manipulando archivos y
  rompiendo `fs`; nada aquí demuestra durabilidad real ante un corte
  eléctrico.
- El multi-PC se simula con dos escritores A3.3 sobre una carpeta local de
  prueba. Que `fsync` devuelva no demuestra que Drive haya subido nada:
  siguen siendo tres estados distintos (Panorama escribió / el sistema de
  archivos aceptó / Drive sincronizó), y 1 y 2 no prueban 3.
- La atomicidad completa de las acciones **archivo + base de datos**
  (`backup:save`, `meeting:savePrep`/`updatePrep`, `candidateEval:save`) sigue
  **fuera**: un handler puede cifrar y escribir su archivo y descubrir
  después, al confirmar, que el disco avanzó. Lo que este bloque sí garantiza
  es que tras una adopción efectiva —o tras una vuelta atrás incompleta— la
  sesión **deja de escribir** antes de la siguiente operación (§10.3).
  Dependencia explícita para el bloque de contratos de acción/IPC.
- Siguen abiertos y **no cubiertos por estas pruebas**: A2 restore, borrados
  destructivos, la resolución de conflictos multi-PC y el análisis conjunto
  de cierre, apagado, arranque y Drive real.

---

## §17. PROCEDENCIA DE CADA CIFRA

| Cifra | De dónde sale |
|---|---|
| coste de los hashes (§7.4) | sección **C** de `scratchpad/bloque3/test-seguridad.js`, N=40 por tamaño, ejecución del 2026-09-14 guardada en `resultados-capaD.txt`. Los tiempos varían entre ejecuciones: la tabla del §7.4 es la de **esa** ejecución, no un promedio |
| 393 / 221 | `scratchpad/bloque1/test-db-integrado.js` y `scratchpad/bloque2/test-wiring.js` |
| 43 | `scratchpad/bloque3/test-error-codes.js` |
| 75 | `scratchpad/bloque3/test-primitivas.js` (capa B) |
| 223 | `scratchpad/bloque3/test-seguridad.js` (capa D) |
| 34 fallos previos | la MISMA suite contra `main.js.PRE-CORRECCIONES`, generado por `scratchpad/bloque3/revertir.js`, que revierte exactamente las cinco sustituciones de esta ronda |
| arranques reales | `scratchpad/bloque3/arranques-reales.ps1`, cada uno verificado sobre **su propio tramo** de `app.log` |
