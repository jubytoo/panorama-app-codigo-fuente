# A3.3 — Control de concurrencia en `db.js` (14 sept 2026, diseño v4 rev. 7 — NÚCLEO CERRADO)

> **Estado.** El **núcleo aislado está implementado y ejecutándose** (§15,
> **395/395**). `db.js` operativo **sin tocar**. La integración con la
> aplicación **no está autorizada**; §14 recoge las dependencias que hay que
> cerrar antes. §2 es la **especificación única vigente** del flujo de
> escritura.
>
> **Cerrar el núcleo aislado NO cierra A3.3.** La aceptación final exige una
> revisión end-to-end de Panorama completo (guardado, cifrado, A1, A2, borrados,
> B2, IPC, Drive y multi-PC, cierre de ventanas, cierre de la app, apagado,
> arranque, recuperación y el handoff PC A → PC B), con cada escenario marcado
> como diseñado / implementado / unitario-simulado / prueba real / pendiente.
> Ver §15.g.

Revisión del diseño ahora que **sí** vamos a tocar `db.js`. **No se ha
modificado código.**

- **v2**: los ocho requisitos no negociables iniciales.
- **v3**: §2.b (la generación no reentra por `run()`), §2.c (fallo de
  `persist()` con la memoria ya modificada), §5.0 (local / compartida /
  **desconocida**), §7.b (resolver no destruye ninguna versión).
- **v4**: **identidad de commit** (§6, reescrita) — el contador de generación
  por sí solo NO detecta dos escritores que parten de la misma generación;
  §6.2 (intención adelantada de otro PC que nunca termina), §7.c
  (revalidación al resolver), §2.c reforzado (copia inmutable de bytes).
- **v4 rev. 2** — cuatro contradicciones internas señaladas por el usuario:
  - **§6.1.a** el camino rápido dejaba fuera el caso 8 (versión antigua).
    Ahora el atajo exige además que el `.sqlite3` siga siendo el nuestro.
  - **§6.1.b** **precedencia inequívoca** de clasificación: si el disco ha
    divergido, **conflicto antes que autorreparación**.
  - **§7.b** "conservar lo mío" se encadena contra `C_disk`, no contra
    `G_file + 1`; y exige coherencia `.gen`↔BD antes de sobrescribir nada.
  - **§4.b** atomicidad ≠ durabilidad: `fsync` del temporal antes del `rename`,
    con sus límites reales en Windows y en Drive escritos sin adornos.
- **v4 rev. 3** — seis correcciones más, **una de ellas decidida por medición**:
  - **§6.1.a** distinción de tres vías: mismo commit + mismos bytes / mismo
    commit + **bytes distintos** / commits distintos. `F_disk` como primitiva.
  - **§6.1.b** A5 era **inalcanzable** (A4 decía "resto"); la descendencia pasa
    a ser **estricta** para que `H_disk` no la valide trivialmente; y la
    igualdad de bytes se aplica también a B0/B1 y a §7.c.
  - **§6.1.c** la garantía "≤ 45 s y ninguna pérdida silenciosa" **era falsa** y
    se retira. En su lugar, **verificación de bytes en cada escritura
    compartida** — el ensayo §13 dice que cuesta +34 % sobre Drive, no lo que yo
    suponía.
  - **§2.d** punto de confirmación explícito, la bandera `dirty` en vez de una
    igualdad que no demuestra nada, y **los tres fallos separados** (antes del
    `rename` / después / al restaurar), con `aplicado` en el error.
  - **§4.b/§4.c** `escribirAtomico()` con bucle de `writeSync` y **lista cerrada**
    de códigos "no soportado"; `fsync` **solo** del `.sqlite3`; y qué se conserva
    antes de limpiar (un `.gen.abandonado` es un testigo, no una copia).
  - **§6.2 / §7.b** sin abandono automático a las 24 h; la adopción silenciosa
    de una resolución se acota a la descendencia demostrable.
  - **§13** ensayo de coste ejecutado. **§14** dependencias trazadas contra el
    código actual.
- **v4 rev. 4** — **núcleo aislado implementado** (§15, 112/112), más:
  - **§2** pasa a ser la **especificación única vigente** del flujo, alineada
    con el código real. **§3** enseña `bloquearEscrituras()`/`levantarLatch()`
    de verdad, no una asignación. **§2.c** dice explícitamente que **§2.d manda**
    sobre cuándo se restaura y cuándo no.
  - **§4.b** `fsync` vuelve a **los dos archivos**; la optimización se aplaza. Y
    se corrige la afirmación falsa de que "no puede pasar `.gen` durable con BD
    perdida" — sí puede, y ahora está clasificado.
  - **§8.c.1** `F_arranque` no existía: era una tautología. Se elimina y se
    propone una **huella local persistente** como referencia independiente.
  - **§7.c** la revalidación compara **también por hash**, no solo por ids.
  - **§13** separa lo medido de lo estimado; retira "≈5,2 ms" y "≈70 ms" como si
    fueran ciclos medidos, y la muletilla de "cada 15 s".
  - **§14.d** la comprobación previa **no bastaba**: secuencia "apartar →
    confirmar → borrar". **§14.d.1** reconcilia con el inventario: son **cinco**
    sitios, no dos, en **dos categorías distintas**.
  - **§14.b** se retira el "modo operación atómica"; en su lugar, una escritura
    múltiple real. **§14.c** coordinación exacta del latch `'adoptando'`;
    `looksEncrypted()` deja de usarse para corregir flags.
  - **§14.g** `aplicado` se desdobla en `aplicado` + `accionAplicada`, y se
    explica **cómo llega al renderer** (no llega solo por añadirlo al `Error`).

> **Cambio de fondo en v4.** El mecanismo deja de ser "un contador" y pasa a ser
> un **encadenamiento de commits**. La base de datos y el `.gen` solo se
> consideran coherentes si pertenecen **al mismo commit**, no si llevan el mismo
> número. El número de generación se conserva porque es legible y ordena, pero
> **ya no es la señal de la que depende la corrección**.

Ver `claude/a3-3-paso0-inventario.md` para el inventario de las 29 escrituras
y el argumento de por qué el tratamiento se centraliza en `db.js` en vez de en
los sitios de llamada.

---

## 0. Punto de partida real

```js
function persist() {
  if (!db || !dbFilePath) return;
  const data = db.export();
  const tmpPath = `{dbFilePath}.tmp-{process.pid}`;
  fs.writeFileSync(tmpPath, Buffer.from(data));   // ya es atómico: tmp + rename
  fs.renameSync(tmpPath, dbFilePath);
  dirty = false;
}

function run(sql, params = []) {
  db.run(sql, params);                             // <-- toca memoria LO PRIMERO
  const idRow = get('SELECT last_insert_rowid() as id');
  const lastId = idRow ? idRow.id : null;
  markDirtyAndPersist();
  return lastId;
}
```

`dirty` se pone y se quita pero **nadie lo lee**: queda libre para significar
"hay cambios en memoria que no están en disco", que es justo lo que hará falta.

---

## 1. Piezas nuevas y dónde vive cada una

| Pieza | Dónde | Por qué ahí |
|---|---|---|
| `panorama.sqlite3.gen` — testigo `{v, gen, commit_id, parent_commit_id, writer, at}` | **Junto a la base de datos** (carpeta de datos, o sea Drive si es compartida) | Es el token que cruza entre máquinas: tiene que viajar con el `.sqlite3` |
| `app_meta.db_generation`, `app_meta.db_commit_id`, `app_meta.db_parent_commit_id` | Dentro de la propia base de datos | Autoridad de **qué commit ES** esta imagen. El `.gen` y la BD solo son coherentes si el `commit_id` coincide |
| `app_meta.db_commit_history` — los últimos 20 `commit_id`, del más nuevo al más viejo (~700 bytes) | Dentro de la base de datos | Permite demostrar descendencia cuando el otro equipo ha hecho **varios** commits seguidos, no solo uno |
| `installation-id` y `ultima-generacion-vista` | `%APPDATA%\panorama-app-config\` — **local, nunca en Drive** | Identidad de ESTE equipo y marca de agua. Si vivieran en Drive, se sincronizarían y dejarían de identificar nada |
| `S_mio` (mtime+size del `.sqlite3`) y `F_mio` (SHA-256 de `ultimaImagenConfirmada`) | Solo en memoria, se recalculan en cada escritura confirmada | Permiten saber si el `.sqlite3` de disco **sigue siendo el nuestro** aunque el `.gen` no se haya tocado — es lo que hace detectable el caso 8 (§6.1.a) |

`commit_id` = 16 bytes aleatorios en hex (`crypto.randomBytes(16)`), nuevo en
cada escritura. `parent_commit_id` = el `commit_id` sobre el que se construyó.

`F_mio` se calcula **sobre bytes que ya tenemos en la mano** (el mismo `Buffer`
que se acaba de escribir), no releyendo el disco: SHA-256 de 76 KB son ~0,2 ms
frente a los 76 KB que ya se exportan y se escriben. No añade E/S.

El fichero de configuración local ya existe (`userDataConfigPath()` apunta a esa
carpeta), así que no se inventa una ubicación nueva.

---

## 2. Requisito 1 — detectar ANTES de tocar la memoria

> **ESPECIFICACIÓN ÚNICA VIGENTE.** Este pseudocódigo es el que manda. Cualquier
> otro fragmento del documento que lo contradiga está obsoleto. Está
> **implementado y ejecutándose** en `scratchpad/nucleo-a33/nucleo.js` (§15), y
> el código real y este bloque se mantienen alineados.

```
run(sql, params):

  1. GUARDAS
       si escrituraBloqueada -> ErrorDb('bloqueado'). No toca nada.

  2. DETECCIÓN — antes de cualquier db.run local
       decision = clasificar(fotografiar())          (§6.1.a, §6.1.b)
       · LOCAL:                lee .gen + stat; solo lee los bytes si algo cuadra mal
       · COMPARTIDA/DESCONOCIDA: lee .gen + stat + LOS BYTES (F_disk) siempre

  2b. RECARGA SILENCIOSA — solo descendencia estricta (caso 1) y solo con
      dirty === false. Se adopta la imagen del disco y se RECLASIFICA una vez.
      Si tras recargar vuelve a pedir recarga -> se para (latch 'degradado').

  2c. SALIDAS QUE NO ESCRIBEN
       'conflicto' | 'aviso-atrasado'  -> latch 'conflicto'  + ErrorDb('conflicto')
       'espera' | 'degradado'          -> latch 'degradado'  + ErrorDb('conflicto')
       'bd-ilegible'                   -> latch 'bd-ilegible'+ ErrorDb('ilegible')
      EN NINGUNO se ha ejecutado el SQL.

  2d. 'reparar-gen' (caso 2, mi escritura interrumpida) -> se marca
      preservarTestigo. No hay un paso de reparación aparte: la escritura
      nueva se encadena desde C_disk (=== C_mem) y sustituye el testigo.
      Ver §2.e.

  ┌─────────────────────────────────────────────────────────────────────────┐
  │ TRY nº 1 — PRE-CONFIRMACIÓN.  Cubre desde la PRIMERA mutación de        │
  │ memoria hasta el rename, NO solo la persistencia.                       │
  │                                                                          │
  │  3. dirty = true                    <- LA BANDERA, antes de tocar nada  │
  │     db.run(sql, params)             <- primera modificación de memoria  │
  │  4. lastId = last_insert_rowid()                                        │
  │  5. C_nuevo = randomBytes(16).hex                                       │
  │     UPSERT db_commit_id / db_parent_commit_id /                         │
  │            db_commit_history / db_generation      (4 sentencias)        │
  │  5b. si preservarTestigo: copiar .gen -> .gen.interrumpido-<fecha>      │
  │  6. escribir el .gen                (escribirAtomico, §4.b)             │
  │  7. escribir el .sqlite3            (escribirAtomico, §4.b)             │
  │     confirmado = true               <-- PUNTO DE CONFIRMACIÓN           │
  │                                                                          │
  │  CATCH: CUALQUIER excepción de 3, 4, 5, 5b, 6 o 7 -> CASO (a).          │
  │     · el disco activo está intacto (escribirAtomico garantiza que sin   │
  │       rename el archivo final no cambia)                                 │
  │     · restaurarUltimaImagenConfirmada()                                  │
  │     · dirty = false ; ErrorDb('io', aplicado: false)                     │
  │     · si la restauración falla -> CASO (c):                              │
  │           latch 'desincronizada' (IRREVERSIBLE), dirty se queda en true │
  └─────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────────┐
  │ TRY nº 2 — POST-CONFIRMACIÓN.  JAMÁS restaura.                          │
  │                                                                          │
  │  8. ultimaImagenConfirmada = ese mismo Buffer   (§2.c)                  │
  │     P_mem = C_mem ; C_mem = C_nuevo ; H_mem ; G_mem = N+1               │
  │     F_mio = sha256(buffer) ; S_mio = stat(.sqlite3) ; dirty = false     │
  │                                                                          │
  │  CATCH: CASO (b). La operación YA ESTÁ EN DISCO.                        │
  │     · NO se restaura la memoria: restaurar borraría un cambio real       │
  │     · se rehace el bookkeeping releyendo, y la relectura se              │
  │       RECLASIFICA: no se da por nuestra solo porque acabemos de escribir │
  │     · si no se puede -> latch 'desincronizada' +                         │
  │       ErrorDb('io-tras-confirmar', aplicado: true)                       │
  └─────────────────────────────────────────────────────────────────────────┘
```

**Son dos `try` separados a propósito.** El primero empieza en la primera
mutación de memoria —no en la persistencia— porque `db.run`, la lectura de
`last_insert_rowid()` y cualquiera de los cuatro UPSERT internos pueden lanzar,
y en todos esos casos el `rename` todavía no ocurrió: **son caso (a) y hay que
restaurar**. En la rev. 4 el `try` empezaba en la persistencia, y un SQL
inválido podía dejar `dirty === true` sin restaurar, o un fallo en el tercer
UPSERT dejar `app_meta` a medias en memoria. Corregido y probado punto por punto
(§15, sección 9).

### 2.e Escritura múltiple — varias sentencias, UNA persistencia

`escribirMultiple([{sql, params}, …])` aplica todas las sentencias sobre la
**misma imagen** y produce **un solo commit, un solo `.gen` y un solo `rename`**.
`run()` no es más que `escribirMultiple` con una sentencia.

Lo necesitan dos sitios, y en los dos por la misma razón —que una acción no
puede quedar a medias en disco—: los dos `DELETE` de `deleteProjectById`
(§14.d) y la consolidación de sal/verificador/`security_enabled` del rekey
(§14.b). **No es una transacción y no lo llamo así**: no deshace nada. Solo
garantiza que lo que llega a disco llega entero.

Dos detalles que importan:

- **`last_insert_rowid()` se lee en el paso 4**, antes del `UPDATE` de la
  generación. Si se leyera después, un `INSERT` seguido del `UPDATE` seguiría
  devolviendo el id correcto (un UPDATE no lo cambia), pero no quiero que la
  corrección dependa de ese detalle de SQLite.
- **El `.gen` se escribe antes que `persist()`** y después del `db.run` local.
  Antes que `persist()` porque si fuera al revés existiría una ventana en la
  que el `.sqlite3` en disco ya es N+1 y el `.gen` todavía dice N: otro equipo
  leería N, creería que nadie ha escrito, y lo pisaría — exactamente el fallo
  que esto viene a evitar. Después del `db.run` local para no gastar una
  generación en una sentencia que va a lanzar por SQL mal formado.

### 2.b Requisito 4 — la generación NO vuelve a entrar por `run()`

El paso 5 **no** puede llamar al `run()` público: entraría otra vez en las
guardas y la detección, contaría una generación de más y, con `setMeta` (que ya
usa `dbmod.run`), habría recursión indirecta.

Se usa una función interna, de uso exclusivo de `db.js`, que habla directamente
con el manejador de sql.js y **no está instrumentada**:

```js
// db.js — privada, NO se exporta
function ejecutarInterno(sql, params) { db.run(sql, params); }
```

y el paso 5 es:

```js
ejecutarInterno(
  "INSERT INTO app_meta(key, value) VALUES ('db_generation', ?) " +
  "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  [String(siguiente)]
);
```

UPSERT (igual que el `setMeta` ya corregido) para que funcione tanto si la fila
existe como si no, en una sola sentencia.

**Una sola imagen, una sola persistencia.** La sentencia del usuario (paso 3) y
la de la generación (paso 5) se aplican consecutivamente **sobre la misma
imagen en memoria**, y solo después se exporta una vez (paso 7). No hay forma
de que se cuele un `export()` entre medias: `db.js` es síncrono de punta a
punta y no hay ningún `await` dentro de `run()`. Así que por cada llamada
pública a `run()` hay **exactamente**: una generación nueva, una escritura del
`.gen` y una escritura del `.sqlite3`.

Los otros dos sitios que persisten hoy (`getDb()` al final y `vacuum()`) pasan a
llamar a la **misma** función interna `persistirConGeneracion()`, de modo que
solo hay un punto en todo el archivo que escribe el `.gen` y el `.sqlite3`.
`markDirtyAndPersist()` desaparece absorbida ahí.

### 2.c Restauración de la imagen — el MECANISMO

> **Prioridad respecto a §2.d, para que no haya dos especificaciones.**
> §2.c describe **la herramienta** (`ultimaImagenConfirmada` y cómo se restaura).
> **§2.d describe CUÁNDO se usa, y manda.** Concretamente: el `catch` de §2.c
> **solo se ejecuta en el caso (a)** de §2.d — fallo *anterior* al `rename` del
> `.sqlite3`. En el caso (b) —el `rename` ya ocurrió— **el `catch` de §2.c NO
> se ejecuta**, porque restaurar borraría un cambio que está en disco. En el
> caso (c) el propio `catch` es el que falla.
>
> En el código son dos `try` distintos y no uno solo: el de los pasos 6-7
> (restaura) y el del paso 8 (no restaura, rehace). Ver §15.

### 2.c.1 El mecanismo

Hueco real del diseño anterior. Si `persist()` (o la escritura del `.gen`)
falla en los pasos 6-7, la operación **ya está en la imagen en memoria** aunque
el llamante haya recibido un error. Sin tratarlo, la siguiente escritura que sí
persistiera arrastraría a disco una operación que el usuario cree fallida —
por ejemplo, un proyecto "fantasma" cuya creación dio error.

**Solución: guardar siempre la última imagen confirmada y volver a ella.**

`persist()` ya calcula `const data = db.export()` antes de escribir. Basta con
conservar ese buffer cuando el `rename` termina bien:

```js
let ultimaImagenConfirmada = null;  // Buffer de la última imagen que SÍ llegó a disco
```

- Se fija en `getDb()` con la imagen recién cargada (o la recién creada).
- Se actualiza dentro de `persistirConGeneracion()` **solo** tras el `rename`
  correcto.

Y ante cualquier fallo posterior a la modificación de la memoria:

```js
catch (e) {
  restaurarUltimaImagenConfirmada();   // db.close(); db = new SQL.Database(ultimaImagenConfirmada)
  generacionActual = leerGeneracionDe(db);
  throw new ErrorDb('io', …);
}
```

Por qué esta variante y no otras que consideré:

| Alternativa | Por qué no |
|---|---|
| Releer `panorama.sqlite3` del disco | Depende de que el disco/Drive responda — y justo acabamos de fallar escribiendo ahí |
| `db.export()` antes de cada escritura para tener un punto de retorno | Duplica el coste del camino caliente (76 KB extra por escritura) |
| `SAVEPOINT` / `ROLLBACK TO` de SQLite | No cubre el caso: hay que cerrar la transacción **antes** de `export()`, así que para cuando `persist()` falla el savepoint ya se liberó |

Coste de la solución elegida: **un buffer de más en memoria** del tamaño de la
base de datos (76 KB hoy; crece con ella, pero por diseño solo guarda
metadatos). Cero coste en el camino normal.

**Requisito v4.4 — tiene que ser una copia inmutable de bytes, no una
referencia.** `db.export()` de sql.js devuelve un `Uint8Array` que puede ser una
**vista sobre el heap de WebAssembly**: si se guardara esa referencia, sus bytes
podrían cambiar bajo nuestros pies en cuanto sql.js reutilizara esa memoria, y
la "última imagen confirmada" dejaría de serlo sin que nadie se enterara.

Reglas concretas:

- Lo que se guarda es **el mismo `Buffer` que se acaba de escribir en disco**.
  `persist()` ya hace `Buffer.from(data)`, y `Buffer.from(Uint8Array)` **copia**
  — así que ese objeto ya es independiente del heap de WASM. Se guarda ese, no
  el `data` original.
- Se asigna **solo después del `rename` correcto**: si el `rename` falla, el
  buffer anterior sigue siendo el bueno.
- **Nunca se muta ni se entrega hacia fuera.** Al restaurar se pasa una copia
  fresca (`new SQL.Database(Buffer.from(ultimaImagenConfirmada))`), no el propio
  buffer, para que sql.js no pueda tocarlo.
- Comprobación barata tras el `rename`: el tamaño del archivo en disco debe
  coincidir con `ultimaImagenConfirmada.length`. Si no coincide, no se acepta
  como confirmada.
- En la implementación se verificará empíricamente si `export()` devuelve vista
  o copia en esta versión de sql.js, y se copiará defensivamente en cualquier
  caso.

### 2.d Requisito v4.10 — el punto de confirmación, y los tres fallos distintos

**El usuario tiene razón en las dos objeciones.** La rev. 2 decía que la
operación fallida "no existe en ningún sitio", y eso **solo es cierto si el
`rename` no llegó a ocurrir**. Y el paso 0 de §6.1.b se apoyaba en una igualdad
de commits que no puede detectar lo que dice detectar.

**El punto de confirmación (`commit point`) es el `rename` del `.sqlite3`.**
Antes de él, nada ocurrió. Después de él, ocurrió — aunque falle todo lo demás.

**La bandera, no la igualdad.** `C_mem` se actualiza en el paso 8 de `run()`,
así que durante los pasos 3-7 la memoria ya está modificada y `C_mem` todavía
coincide con el commit de `ultimaImagenConfirmada`. La igualdad **no demuestra
ausencia de cambios pendientes**. Se usa una bandera explícita — y ya existe:

> `dirty`, que §0 documenta como "se pone y se quita pero **nadie lo lee**".
> Pasa a significar exactamente lo que su nombre dice: **hay cambios en memoria
> que no están confirmados en disco**. Se pone a `true` en la línea justo antes
> del `db.run` del paso 3, y se pone a `false` **solo** después de un `rename`
> correcto. No se inventa ninguna variable nueva.

**Los tres fallos, uno por uno:**

| # | Fallo | ¿Se sustituyó la BD? | Qué se conserva | Qué recibe el llamante | ¿Reintentar es seguro? |
|---|---|---|---|---|---|
| **a** | Al escribir el temporal, al hacer `fsync`, o el propio `rename` falló | **NO.** El disco está intacto | Disco: la versión anterior. Memoria: se restaura `ultimaImagenConfirmada`. El temporal se conserva y se registra | `ErrorDb('io')` — **la operación no ocurrió** | **Sí.** Es idempotente porque no pasó nada |
| **b** | El `rename` **sí** se completó, y falla el `stat`, el hash o el bookkeeping posterior | **SÍ. La operación está aplicada en disco** | Todo. No se restaura nada: restaurar borraría un cambio real | `ErrorDb('io-tras-confirmar')`, con `aplicado: true` explícito | **NO.** Reintentar un `INSERT` lo duplicaría. Ver abajo |
| **c** | Falla la propia restauración de la imagen (caso a que no se puede deshacer) | NO | Disco: intacto. Memoria: **no fiable** | `ErrorDb('desincronizada')` | No: la app se detiene |

**El caso (b) es el que faltaba y el que puede duplicar datos.** Tratamiento:

1. **No se restaura la memoria.** El cambio es real y está en disco.
2. Se intenta rehacer el bookkeeping releyendo el archivo que acabamos de
   escribir. Si eso funciona, el error se degrada a un aviso en `app.log` y la
   operación se da por buena: `dirty = false`.
3. Si ni releyendo se puede reconstruir el estado →
   `escrituraBloqueada = 'desincronizada'` y fail-stop, **pero con un mensaje
   distinto del caso (c)**: *"el cambio SÍ se guardó; lo que no se ha podido es
   verificarlo. No repitas la operación."*
4. **El contrato con el llamante cambia en este único punto.** `ErrorDb` gana un
   campo `aplicado: boolean`. Los sitios de `main.js` que hoy reintentan
   —`backup:save` reintenta a los 15 s— deben mirar ese campo: con
   `aplicado: true` **no se reintenta**. `backup:save` es idempotente de hecho
   (escribe un backup nuevo cada vez, no actualiza uno), así que el riesgo real
   se concentra en los `INSERT` de `projects:create`, `meeting-prep:save` y
   `candidate-eval:save`. **Esto es una dependencia de integración: hay que
   revisarla antes de implementar, no después.**

**Caso (a), en detalle.** Memoria vuelve a ser exactamente lo último confirmado.
`dirty = false`. La operación **no existe en ningún sitio**, que es lo que el
llamante ya cree. El `.gen` puede haber quedado adelantado con `writer = yo`: es
el caso 2 de §6.1.b (B1) y se repara solo en la comprobación siguiente, sin
conflicto falso — siempre que `F_disk === F_mio` siga cumpliéndose.

**Caso (c).** No se puede seguir garantizando nada:
`escrituraBloqueada = 'desincronizada'`, se avisa con su propio código y se pide
reiniciar. Es el mismo criterio de fail-stop de B2. `dirty` **se queda en
`true`**, y por eso el paso 0 de §6.1.b bloquea cualquier recarga silenciosa
posterior: es exactamente el estado que la prueba 32 comprueba.

---

## 3. Requisito 2 — la guarda completa de `procesoComprometido`

`db.js` no puede importar `main.js` (ciclo). Se invierte la dependencia:

```js
// db.js
let escrituraBloqueada = null;
// null | 'comprometido'   (B2, fail-stop del proceso principal)   IRREVERSIBLE
//      | 'desincronizada' (§2.d, no se pudo restaurar la imagen)  IRREVERSIBLE
//      | 'bd-ilegible'    (§4.b, el .sqlite3 no abre)             IRREVERSIBLE
//      | 'conflicto'      (§7, otro equipo)                       levantable
//      | 'degradado'      (§5.b, no se puede verificar)           levantable

const MOTIVOS_IRREVERSIBLES = new Set(['comprometido', 'desincronizada', 'bd-ilegible']);
const MOTIVOS_LEVANTABLES   = new Set(['conflicto', 'degradado']);

// NO es una asignación. Un motivo fatal ya puesto NUNCA se sustituye — ni por
// uno no fatal ni por otro fatal: el PRIMERO es el que explica la causa raíz.
function bloquearEscrituras(motivo) {
  if (escrituraBloqueada && MOTIVOS_IRREVERSIBLES.has(escrituraBloqueada)) {
    appLog(`se ignora el bloqueo '${motivo}': ya bloqueado por '${escrituraBloqueada}'`);
    return escrituraBloqueada;
  }
  escrituraBloqueada = motivo;
  return escrituraBloqueada;
}

// Único punto que levanta el latch. Rechaza los tres motivos irreversibles,
// venga de donde venga la petición (recuperación de Drive, resolución de
// conflicto, interruptores). Ver §14.a.
function levantarLatch(motivoEsperado) {
  if (!escrituraBloqueada) return { ok: true };
  if (MOTIVOS_IRREVERSIBLES.has(escrituraBloqueada)) {
    return { ok: false, error: `'${escrituraBloqueada}' es irreversible en esta sesión` };
  }
  if (motivoEsperado && escrituraBloqueada !== motivoEsperado) {
    return { ok: false, error: `el bloqueo actual es '${escrituraBloqueada}'` };
  }
  if (!MOTIVOS_LEVANTABLES.has(escrituraBloqueada)) {
    return { ok: false, error: `'${escrituraBloqueada}' no es levantable` };
  }
  escrituraBloqueada = null;
  return { ok: true };
}
```

> **Aquí había una segunda definición**, sobrante de la v2:
> `function bloquearEscrituras(motivo) { escrituraBloqueada = motivo; }`.
> **Eliminada.** Contradecía la de arriba y, copiada literalmente, destruiría el
> fail-stop de B2: permitiría sustituir `'comprometido'` por cualquier otro
> motivo y que `levantarLatch()` lo levantara después. **La única definición
> válida de las dos funciones es la de este bloque**, que es además la que está
> implementada y probada en §15.

`main.js`, dentro de `manejarFalloFatal()` (B2 clase 1), añade una línea:
`dbmod.bloquearEscrituras('comprometido')`.

Con eso el fail-stop de B2 pasa de ~95 % a **100 %**: cualquier `dbmod.run`,
venga de donde venga —incluidos los internos alcanzados desde una lectura, como
`ensureProjectBackupDirSlug`— queda cortado.

**Las 11 guardas de `main.js` se quedan.** No son redundantes en la práctica:
devuelven mensajes útiles por operación (`{ok:false, error:'…'}`) en vez de
lanzar. `db.js` es la red de debajo, no la sustituta.

---

## 4. Requisitos 3 y 4 — el corte entre `.gen` y `.sqlite3`

Este es el punto que hundía el diseño anterior. El usuario lo señaló bien: con
solo un número, un corte de corriente dejaría el `.gen` por delante y Panorama
creería **para siempre** que hay un conflicto con otro PC.

**La solución es que el `.gen` diga QUIÉN lo escribió.**

```json
{ "v": 2, "gen": 128, "commit_id": "9c4e…", "parent_commit_id": "1b70…",
  "writer": "a3f1…", "at": "2026-09-13T18:40:00.000Z" }
```

`writer` es el `installation-id` local (aleatorio, generado una vez, guardado
fuera de Drive). Con eso, "el `.gen` va por delante" deja de ser ambiguo:

| `.gen` vs. imagen en disco | `writer` | Interpretación | Acción |
|---|---|---|---|
| `C_disk = P_file = C_mem` **y además `F_disk === F_mio`** (el `.gen` anuncia el hijo del commit que hay en disco, ese commit es el que teníamos, **y los bytes del disco siguen siendo los nuestros**) | **yo** | **Mi propia escritura interrumpida** | Reparar en silencio. **No es conflicto**. Las cuatro condiciones son obligatorias (regla B1 de §6.1.b): tres de commit **más la de bytes** |
| `P_file = C_disk` | otro | Otro equipo escribió el `.gen` pero su `.sqlite3` aún no ha llegado (latencia de Drive) | Esperar/avisar, no escribir → **§6.2** |
| `C_file = C_disk` | cualquiera | Coherente | Normal |
| `C_file` es un **ancestro** de `C_disk` (está en `H_disk`) | cualquiera | El `.gen` se perdió o se restauró viejo | Reparar: manda la base de datos, se reescribe el `.gen` |
| Ninguna de las anteriores | cualquiera | No se puede probar parentesco | **No se repara sola** → clasificación completa de §6.1 |

**v4:** la fila se elige por **identidad de commit**, no por el número. El
número de generación sigue en el `.gen` porque es legible y ordena, pero un
`.gen` y una base de datos que llevan el mismo número y **distinto
`commit_id`** son incoherentes, no coherentes (caso 0 de §6.1).

**Escritura atómica del `.gen`** (requisito 4): mismo patrón que ya usa
`persist()` — `panorama.sqlite3.gen.tmp-<pid>` y `renameSync` dentro de la
misma carpeta. Ningún lector puede ver un `.gen` a medio escribir; y si aun así
apareciera uno ilegible, **no se interpreta como conflicto** sino como
"corrupto" (§6.1, caso 7). Sobre por qué eso **no** equivale a "es imposible
que un corte de luz deje un `.gen` inservible", ver §4.b.

### 4.b Requisito v4.7 — atomicidad ≠ durabilidad

**El usuario tiene razón y el diseño anterior afirmaba de más.** `tmp + rename`
resuelve la **atomicidad frente a otros lectores**: nadie observa nunca un
archivo a medias, porque el nombre definitivo se le pone a un archivo ya
completo. Eso es cierto y no cambia.

Lo que **no** resuelve es la **durabilidad frente a un corte de alimentación**.
`fs.writeFileSync` devuelve cuando los bytes están en la caché del sistema de
archivos, no en el plato/NAND. NTFS registra en su diario los **metadatos** (el
`rename`), no los **datos**. Así que la secuencia realmente posible es:

```
1. writeFileSync(tmp)   -> bytes en caché, NO en disco
2. renameSync(tmp, db)  -> metadato, SÍ va al diario de NTFS
3. CORTE DE LUZ
4. Al arrancar: existe panorama.sqlite3, con el nombre correcto,
   y su contenido son ceros o los bytes viejos del bloque. Atómico, sí.
   Durable, no.
```

Es exactamente el escenario que el usuario describe y **el diseño v4 no lo
cubría**. Peor: es el único escenario de toda esta sección que **destruye** en
vez de dejar dos versiones, porque los bytes anteriores ya se han liberado.

**Decisión: sí se hace `fsync` del temporal antes del `rename`.**

**Requisito v4.11 — la escritura debe distinguir incompatibilidad de fallo
real.** La versión anterior de esta función tenía los dos defectos que señala el
usuario: ignoraba el retorno de `writeSync` y su `catch` trataba *cualquier*
error de `fsync` como "no soportado", seguido de `rename`. Convertir un `EIO` en
una rebaja de garantía y sustituir después la base de datos activa es
exactamente lo contrario de lo que hay que hacer.

```js
// Códigos que SÍ significan "este sistema de archivos no implementa fsync".
// Lista cerrada y corta a propósito: todo lo demás es un fallo real.
const FSYNC_NO_SOPORTADO = new Set(['EINVAL', 'ENOSYS', 'ENOTSUP', 'EOPNOTSUPP']);

function escribirAtomico(rutaFinal, buffer, { exigirDurabilidad }) {
  const tmp = `${rutaFinal}.tmp-${process.pid}`;
  const fd = fs.openSync(tmp, 'w');
  let completo = false;
  try {
    // 1. BUCLE DE ESCRITURA con control de progreso.
    let escritos = 0;
    while (escritos < buffer.length) {
      const n = fs.writeSync(fd, buffer, escritos, buffer.length - escritos, escritos);
      if (!(n > 0)) {
        throw new ErrorDb('io', `writeSync sin progreso en el byte ${escritos}`);
      }
      escritos += n;
    }
    if (escritos !== buffer.length) {
      throw new ErrorDb('io', `escritura incompleta: ${escritos}/${buffer.length}`);
    }

    // 2. fsync, distinguiendo incompatibilidad de fallo real.
    if (exigirDurabilidad && !fsyncDesactivado()) {
      try {
        fs.fsyncSync(fd);                       // Windows: FlushFileBuffers()
      } catch (e) {
        if (FSYNC_NO_SOPORTADO.has(e && e.code)) {
          marcarFsyncNoSoportado(rutaFinal, e); // se registra UNA vez por ubicación
        } else {
          // EIO, ENOSPC, EROFS, EBADF... es un fallo de verdad.
          throw new ErrorDb('io', `fsync falló (${e.code}): ${e.message}`);
        }
      }
    }
    completo = true;
  } finally {
    fs.closeSync(fd);
    // 3. EL TEMPORAL NO SUSTITUYE NADA SI ALGO FALLÓ.
    if (!completo) {
      conservarTemporalFallido(tmp);  // se renombra a .tmp-fallido-<fecha>
                                      // y se registra. NO se borra a ciegas.
    }
  }
  fs.renameSync(tmp, rutaFinal);      // solo se llega aquí si completo === true
}
```

Los tres puntos que pedía el usuario, explícitos:

- **Todos los bytes antes del `rename`**: bucle con comprobación de progreso, y
  `throw` si `writeSync` devuelve `0` o si el total no cuadra. En el ensayo
  (§13, 1.200 escrituras) `writeSync` escribió siempre el buffer completo en la
  primera llamada, tanto en local como en `G:` — pero el bucle se queda, porque
  una sola llamada corta bastaría para corromper el archivo.
- **Qué permite concluir "no soportado"**: solo `EINVAL`, `ENOSYS`, `ENOTSUP`,
  `EOPNOTSUPP`. **Medido: en este equipo no ocurre ninguno.** `fsync` del
  archivo funciona tanto en el disco local como en `G:`, 0 fallos en 1.200
  llamadas. La rama de incompatibilidad es defensiva, no observada.
- **Escritura incompleta o `fsync` con fallo real → el temporal NO sustituye la
  BD activa.** El `rename` está fuera del `try`, después de `completo = true`.
  Es el caso (a) de §2.d: el disco queda intacto.

**Dónde se exige durabilidad: EN LOS DOS ARCHIVOS. La optimización queda
aplazada.**

En la rev. 3 propuse quitar el `fsync` del `.gen` porque la medición decía que
costaba tanto como el de la base de datos entera (5,94 ms frente a 4,20 ms en
local: el coste es el vaciado de caché del dispositivo, no los bytes). **Retiro
esa optimización de este primer núcleo**, por dos motivos, y el segundo es mío:

1. **Petición explícita**: no merece la pena ahorrar milisegundos a costa de una
   garantía cuya recuperación todavía no está demostrada.
2. **Mi justificación estaba mal escrita.** Dije que "no puede pasar `.gen`
   durable con BD perdida". **Es falso**, y hay que corregirlo: el `.gen` se
   escribe *antes* que la base de datos, así que un corte entre el paso 6 y el
   paso 7 deja exactamente eso — el testigo publicado y la escritura de la BD
   sin completar. Con `fsync` en el `.gen` ese estado es *más* probable, no
   menos. Lo que lo hace tolerable no es que no ocurra, sino que está
   clasificado (caso 2, `.gen` adelantado con nuestro `writer`) y es reparable
   **si la base de datos anterior sigue íntegra**, que es lo que garantiza el
   `fsync` del `.sqlite3`.

| Archivo | ¿`fsync` en este núcleo? | Por qué |
|---|---|---|
| `panorama.sqlite3` | **Sí** | Es el único cuya pérdida **destruye**: sus bytes anteriores ya se liberaron en el `rename` |
| `panorama.sqlite3.gen` | **Sí (por ahora)** | Su pérdida es reparable, pero la recuperación de todos los estados combinados no está demostrada. Se revisará cuando lo esté |

**Estados con la BD nueva válida y el `.gen` atrasado, ausente o corrupto** —
que es lo que hay que tener resuelto antes de plantearse quitar ese `fsync`:

| Estado del `.gen` | Cómo se distingue de una intención pendiente ajena | Salida |
|---|---|---|
| **Atrasado** (`C_file` es un ancestro de `C_disk`, o sea `C_file ∈ H_disk`) | Una intención pendiente ajena va **por delante** (`P_file === C_disk`), no por detrás. Son direcciones opuestas y la comprobación es exacta | Manda la base de datos: se reescribe el `.gen` desde ella |
| **Ausente** | No hay writer ni parentesco que interpretar | LOCAL: se reescribe desde la BD. COMPARTIDA: modo degradado hasta poder escribirlo (§5.b) — no se supone nada |
| **Corrupto** (no parsea, `v` desconocida, faltan campos) | Ídem: no hay nada que interpretar. **Nunca** se lee como conflicto | Igual que ausente, y el `.gen` ilegible se conserva como `.gen.corrupto-<fecha>` |
| **Del futuro** (`P_file` no encaja con nada nuestro ni con `H_disk`) | No se puede demostrar parentesco en ninguna dirección | Caso 0 → §6.2 conservador, **se pregunta** |

La distinción clave, y por eso es fiable: **"atrasado" y "adelantado" no son
ambiguos con identidad de commit.** Un `.gen` atrasado tiene su commit *dentro*
del historial del disco; una intención ajena en vuelo tiene al disco *como
padre*. Nunca las dos cosas a la vez.

**Lo que sigue SIN estar garantizado, dicho sin adornos:**

| Hueco | Por qué | Consecuencia real |
|---|---|---|
| **No se sincroniza el directorio** | En POSIX se haría `fsync` del descriptor del directorio para que la entrada del `rename` sea durable. En Windows no se puede desde Node. **Medido (§13): `fs.openSync(carpeta,'r')` + `fsyncSync` devuelve `EPERM`, en local y en `G:`.** Y `renameSync` usa `MoveFileExW` **sin** `MOVEFILE_WRITE_THROUGH`, inalcanzable desde Node sin código nativo | Se puede perder **el `rename`**, no los datos. Al arrancar quedan el `.sqlite3` viejo (íntegro) y un `.tmp-<pid>` huérfano. Es un estado **recuperable y no destructivo**: se clasifica por §6.1.b y **el huérfano se conserva** (ver más abajo) |
| **`fsync` sobre la unidad de Drive** | `G:` es un sistema de archivos en **modo usuario** (Drive File Stream). `FlushFileBuffers` va a su proceso, que decide qué hace | **Medido: `fsync` en `G:` cuesta 0,8 ms de media sobre un ciclo que ya tarda 52 ms — es decir, prácticamente nada.** Eso es tan sospechoso como tranquilizador: un vaciado que no cuesta nada probablemente no está vaciando gran cosa. **No demuestro durabilidad en Drive y no la afirmo** |
| **`fsync` no fuerza la subida a Drive** | Son cosas distintas. Que los bytes estén en el disco local no significa que estén en la nube | Ya estaba asumido en todo el diseño |
| **Cachés de disco que mienten** | Un SSD con caché volátil sin respaldo puede confirmar el `FlushFileBuffers` antes de tiempo | Fuera del alcance de cualquier programa de usuario |

**Recuperación al arrancar si aun así el `.sqlite3` llega corrupto**, que es la
prueba que exige el requisito:

1. `getDb()` intenta `new SQL.Database(bytes)`. Si lanza → corrupto.
2. Si abre, se ejecuta **`PRAGMA integrity_check`** (sobre 76 KB es ~1 ms) y se
   comprueba que existe la fila `db_commit_id`. Un archivo de ceros abre a veces
   como base de datos vacía: **una base de datos sin `db_commit_id` teniendo un
   `.gen` que sí lo tiene se trata como corrupta**, no como "instalación nueva".
   Este punto es importante: sin él, un truncado a cero se confundiría con un
   primer arranque y el mecanismo crearía una generación nueva sobre la nada.
3. Si está corrupto: **no se escribe nada, no se crea una base de datos vacía**.
   `escrituraBloqueada = 'bd-ilegible'`, la app no abre proyectos y se muestra
   un diálogo con las rutas de lo que sí existe. **La decisión es del usuario;
   el programa no elige por él.**
4. Se registra en `app.log` con código propio.

### 4.c Requisito v4.12 — qué se conserva antes de cualquier limpieza

**El usuario tiene razón: un `.gen.abandonado` es un testigo de ~250 bytes, no
una copia de la base de datos.** El diálogo del paso 3 lo listaba junto a
archivos que sí son bases de datos completas, y eso induce a error. Además hay
un problema **en el código actual**, no en el diseño:

> **`db.js:34-41` borra incondicionalmente todos los `panorama.sqlite3.tmp-*`
> al arrancar.** El comentario (v2.0.42) razona que "no corrompe nada porque el
> `.sqlite3` real nunca se tocó". Eso es cierto **hoy**, pero deja de serlo con
> §4.b: en la ventana "se perdió el `rename`", ese `.tmp` puede ser **la única
> copia de la escritura que falta**, y en la ventana "se perdió el contenido"
> puede ser lo único legible que quede. **A3.3 tiene que cambiar esa limpieza**,
> y es una dependencia de implementación, no un detalle.

Clasificación explícita de todo lo que puede quedar en la carpeta:

| Archivo | ¿Es una BD completa? | Cuándo se puede borrar |
|---|---|---|
| `panorama.sqlite3.conflicto-<equipo>-<fecha>` | **Sí** | Nunca automáticamente. Solo el usuario |
| `panorama.sqlite3.conflicto-otro-<writer>-<fecha>` | **Sí** | Nunca automáticamente |
| `panorama.sqlite3.tmp-<pid>` huérfano | **Puede serlo** — es una imagen completa si el `writeSync` terminó | **Solo tras comprobar que abre, pasa `integrity_check` y su `db_commit_id` ya está en `H_disk`.** Si no se puede comprobar, se renombra a `.tmp-huerfano-<fecha>` y se conserva |
| `panorama.sqlite3.tmp-fallido-<fecha>` | Probablemente **no** (escritura truncada) | Nunca automáticamente; se registra su tamaño para que se vea que está incompleto |
| `panorama.sqlite3.gen.abandonado-<fecha>` | **NO. Es un testigo de ~250 bytes** | Se puede podar por antigüedad. **No se ofrece nunca como opción de recuperación de datos** |
| `panorama.sqlite3.gen.interrumpido-<fecha>` | **NO. Testigo** | Ídem |

El diálogo del paso 3 y el de conflicto **separan las dos listas**: primero
"copias completas que puedes recuperar", después "testigos, solo para
diagnóstico". No mezclarlas era el error.

### 4.d Coste real, medido

Ya no hace falta suponerlo. Ensayo aislado del **14 sept 2026**, Node 20.16.0 /
Electron 30.5.1 arm64, Snapdragon X 10-core, en carpetas exclusivas de prueba
(§13). **Mi estimación previa de "0,1–1 ms" era falsa por un orden de magnitud
en local**:

**MEDIDO** — ciclo sintético completo (`stat` + leer `.gen` + escribir `.gen` +
escribir la BD + `sha256` + `stat`), 76 KB:

| Ciclo sintético | Media | p95 | p99 |
|---|---|---|---|
| Disco local, sin `fsync` | 1,65 ms | 2,58 | 3,42 |
| Disco local, `fsync` en los dos archivos | 11,09 ms | 17,44 | 22,20 |
| `G:` (Drive), sin `fsync` | 52,29 ms | 98,73 | 124,07 |
| `G:` (Drive), `fsync` en los dos | 53,08 ms | 103,05 | 110,51 |

**Dos advertencias sobre esta tabla, porque se prestaba a confusión:**

- **El ciclo "sin `fsync`" NO es el tiempo del `db.js` actual.** Incluye la
  escritura del `.gen` y el `stat`, que hoy no existen. El `db.js` de hoy hace
  solo `export` + `writeFileSync` + `rename`, que en la misma medición es la
  fila "escribir BD sin `fsync`": **0,73 ms en local, 25,49 ms en Drive**. La
  comparación honesta de "hoy vs. A3.3" es contra esa fila, no contra el ciclo.
- **Las cifras de ≈5,2 ms (`fsync` solo en la BD) y ≈70 ms (Drive con
  verificación) de la rev. 3 eran ARITMÉTICA, no medición.** Salían de sumar y
  restar filas. No se midieron como ciclos y no vuelven a presentarse como
  tales. Además la primera ya no aplica: en este núcleo hay `fsync` en los dos
  archivos (§4.b).

Lectura de los números:

- **En local el `fsync` no es gratis**: multiplica por ~6,7 el ciclo si se
  aplica a los dos archivos, y por ~3,2 aplicándolo solo a la base de datos. En
  términos absolutos siguen siendo **5 ms cada 15 s**: aceptable.
- **En Drive el `fsync` es prácticamente gratis** (+0,8 ms de media sobre 52 ms)
  porque ahí lo caro es el propio sistema de archivos en modo usuario. Ya está
  dicho arriba por qué eso no es tranquilizador.
- **El coste es por llamada, no por bytes.** El `fsync` del `.gen` (250 B) costó
  5,94 ms de media en local; el del `.sqlite3` (76 KB), 4,20 ms. Es el vaciado
  de caché del dispositivo. Por eso quitar el del `.gen` ahorra la mitad.
- **Crecimiento con el tamaño**: a 1 MB el ciclo con `fsync` sube a 22,9 ms de
  media. La base de datos son 76 KB hoy y solo guarda metadatos, pero conviene
  tenerlo anotado.
- **Un caso que sí conviene vigilar**: `projects:reorder` hace N escrituras
  seguidas. Con 20 proyectos serían ~100 ms en local y ~1 s en Drive **ya hoy,
  sin `fsync`** (52 ms × 20). El `fsync` añade ~70 ms al total local. No es
  A3.3 quien crea ese problema, pero A3.3 lo empeora un poco y queda anotado.

**Conclusión: el `fsync` se queda activado por defecto.** El interruptor local
`%APPDATA%\panorama-app-config\sin-fsync` sigue existiendo como salida
explícita. Si se activa —o si `fsync` no está soportado en esa ubicación— se
registra en `app.log` en cada arranque y la garantía queda rebajada **por
escrito** a: *"un corte de alimentación puede dejar la base de datos ilegible;
se detecta al arrancar y se pide al usuario que elija una copia, pero la
versión anterior no se recupera sola."*

**Lo que el ensayo NO demuestra, y hay que repetirlo:** mide **coste y
compatibilidad**. **No demuestra durabilidad ante un corte eléctrico.** Eso no
es comprobable por software desde el propio proceso.

**Ventanas de corte, una por una:**

| Corte en | Estado en disco | Al arrancar |
|---|---|---|
| Antes del paso 6 | `.gen` = commit X, DB = commit X | Coherente. Nada que hacer |
| Entre 6 y 7 | `.gen` = commit Y (padre X, writer=yo), DB = commit X | Caso "mi escritura interrumpida" → reparar. **Sin conflicto falso** |
| Durante 7 | Igual (el `tmp`+`rename` garantiza que el `.sqlite3` es X o Y, nunca a medias) | Igual |
| Entre 7 y 8 | `.gen` = Y, DB = Y, memoria cree X | En la misma sesión: la siguiente escritura ve `.gen` = Y con writer=yo y la BD también Y → "ya aplicado", adopta y sigue |
| **Corte con pérdida de datos no sincronizados** (§4.b, solo sin `fsync`) | `.gen` = Y, el `.sqlite3` tiene el nombre bueno y el contenido roto | **No es reparable en silencio.** `integrity_check` falla o falta `db_commit_id` → `escrituraBloqueada='bd-ilegible'` y diálogo con las rutas de lo que sí existe |
| **Corte con pérdida del `rename`** (§4.b, hueco que queda incluso con `fsync`) | `.gen` = Y, DB = X, y sobrevive un `.tmp-<pid>` | Caso 2 (mi escritura interrumpida) → reparación silenciosa. El `.tmp` huérfano se conserva y se registra, no se borra a ciegas |

---


### 4.e Requisito v4.15 — el contrato de "ausente"

> **"El archivo está ausente" es un HECHO OBSERVADO.**
> **"Crear una base de datos nueva" es una DECISIÓN DE INICIALIZACIÓN.**
> **No son sinónimos, y solo la segunda autoriza a escribir.**

Esto no es una sutileza terminológica: en Drive, un `ENOENT` observable puede ser
perfectamente transitorio —montaje aún no completo, sincronización en curso, la
ruta todavía no disponible— y la reacción "no hay nada, creo una base de datos
nueva" **sustituiría una base de datos valiosa que solo estaba invisible un
momento**. Es el escenario más destructivo de todo A3.3, y el más fácil de
provocar sin querer.

**NO autorizan a crear, por sí solos:**

| Señal | Por qué no basta |
|---|---|
| `fs.existsSync(ruta) === false` | Devuelve `false` ante **cualquier** error, no solo ante la ausencia. Un fallo transitorio de Drive es indistinguible de "no existe". **No se usa** |
| Un `ENOENT` aislado de `readFileSync` | En Drive puede ser transitorio. Es un hecho observado, no una conclusión |
| Que no haya `.gen` | Por sí solo no dice nada sobre si hubo una base de datos |
| Que la carpeta parezca vacía | Fail-closed: si no se puede ni listar, no se da por vacía |

**Lo único que autoriza es una bandera explícita del flujo que sabe que está
inicializando una ubicación nueva:**

```
abrir({ crearSiAusente: true })
```

Y aun con la bandera puesta, **se comprueba además que la carpeta no tiene
restos** (`panorama.sqlite3` ni nada que empiece por `panorama.sqlite3.`:
`.gen`, `.tmp-`, `.conflicto-`, `.abandonado-`…). Si los hay, no se crea nada.
Esa segunda comprobación no se puede saltar desde fuera.

**Comportamiento con `estado === 'ausente'` y sin la bandera**, en una ubicación
ya configurada:

- **No** se crea ninguna base de datos.
- **No** se escribe el `.gen`.
- Se devuelve `ErrorDb('io', { noVerificable: true, estadoDisco: 'ausente' })`,
  con `podriaSerPrimeraVez` como **pista informativa**, nunca como permiso.
- En **COMPARTIDA / DESCONOCIDA**: latch `'degradado'` — fail-closed hasta
  aclararlo. En **LOCAL** no se latchea: no hay otro PC posible (A3.1) y es un
  error reintentable.

Probado en §15, sección 14, incluida la recuperación: cuando el acceso vuelve,
se abre **la base de datos original**, con su commit y su generación, **sin
ninguna generación espuria** por medio.

Esto es especialmente importante para el arranque y el apagado que se probarán
end-to-end, y para el handoff PC A → PC B: el equipo B puede arrancar mientras
Drive todavía no le ha entregado el archivo, y **eso no puede acabar en una base
de datos nueva y vacía**.

---

## 5. Requisito 5 — política de fallo del propio mecanismo, por escenario

Retiro el "fallar en abierto" universal de la v1. El usuario tiene razón: en
una carpeta compartida, seguir escribiendo sin poder verificar recrea el riesgo.

### 5.0 Requisito 3 — qué cuenta como "carpeta local"

`isUsingSharedDataLocationNow()` **no basta**: devuelve falso tanto para la
carpeta por defecto de Windows como para una carpeta personalizada cuya
respuesta "¿es compartida?" fue *no*, y también para configuraciones antiguas.
Tratar todo eso como "local segura" es justo lo que el requisito prohíbe.

Clasificación en **tres** estados, evaluada una vez al arrancar (cuando ya se
sabe qué carpeta se usa de verdad) y pasada a `db.js` con
`dbmod.setPoliticaUbicacion('local' | 'compartida' | 'desconocida')`:

```
1. No existe location.json
   -> LOCAL. Es la carpeta por usuario de Windows: estructuralmente local.

2. location.json con shared === true
   -> COMPARTIDA.

3. La RUTA presenta indicios de sincronización o de red      <-- manda sobre el flag
   -> COMPARTIDA, aunque el archivo diga shared:false.

4. location.json con shared === false y sin indicios en la ruta
   -> LOCAL. Es una respuesta explícita del usuario y la ruta la corrobora.

5. location.json sin el campo shared (config anterior a la 0.1.57),
   ilegible, o con un valor que no es booleano
   -> DESCONOCIDA.
```

**Indicios de la regla 3** (corroboración objetiva, no confianza ciega en el
flag):

- La ruta contiene un tramo `Google Drive`, `Mi unidad`, `My Drive`, `OneDrive`,
  `Dropbox` o `iCloudDrive`.
- Es una ruta UNC (`\\servidor\recurso`).
- La unidad no es de tipo fijo (`DriveType` de red o extraíble).

Esto cubre el caso real de esta instalación (`G:\Mi unidad\BD-PanoramaServicio`)
incluso si alguien respondiera "no es compartida" por error, y cubre también el
caso de que el usuario mueva más tarde la carpeta dentro de Drive sin volver a
responder la pregunta.

**DESCONOCIDA usa la política de COMPARTIDA** (§5.b), no la de local. Es la
respuesta conservadora que pide el requisito: ante la duda, no fallar en
abierto. Se registra en `app.log` la clasificación elegida y por qué, para que
sea auditable.

### 5.a Carpeta LOCAL

**Fallar en abierto.** No hay otro PC posible, y el caso de dos instancias en el
mismo equipo ya lo cierra A3.1 con el cerrojo de instancia única. Si el `.gen`
no se puede leer o escribir: se registra **una vez** y se sigue trabajando con
normalidad. Riesgo residual ≈ 0.

### 5.b Carpeta COMPARTIDA y el `.gen` no responde

**Fallar en cerrado, pero con margen y sin romper nada.**

1. Reintentar la lectura durante un margen corto (propongo 3 intentos en ~5 s).
2. Si sigue sin poder leerse → **modo degradado**: `escrituraBloqueada =
   'degradado'`. Las escrituras se rechazan con un mensaje claro ("no se puede
   comprobar que otro equipo no esté escribiendo sobre los mismos datos");
   **la app sigue perfectamente usable para leer**.
3. Un reintento en segundo plano (reutilizando el intervalo de 45 s que ya tiene
   `startUserDataWatchdog`) **levanta el bloqueo solo** en cuanto el `.gen`
   vuelva a leerse y sea coherente.
4. Los renderers no necesitan cambios: los cuatro puntos de guardado ya saben
   tratar un rechazo (`backup:save` devuelve `false` y reintenta a los 15 s).

Es un compromiso consciente: prefiero que el usuario no pueda guardar durante
unos segundos a que dos PCs se pisen la base de datos en silencio.

### 5.c Corte temporal de Drive (ya detectado por la app)

Cuando `driveOutageActive` está activo, el `.gen` es ilegible **porque la
carpeta entera no responde** — y en ese estado las escrituras a esa carpeta
fallarían de todas formas. Entonces:

- **No** se clasifica como conflicto ni como degradado "nuevo": se trata como
  parte del corte que la app ya conoce y ya comunica con su banner, y ya escribe
  su copia de emergencia local.
- Al recuperarse el acceso, se relee el `.gen` y **ahí sí** puede aparecer un
  conflicto real (otro PC escribió durante el corte) → se trata como §7.

---

## 6. Requisito 6 — cómo se distingue cada situación

Datos disponibles en cada comprobación:

- `C_mem` / `P_mem` — commit y padre de la imagen que creemos tener.
- `G_mem` — su número de generación (informativo, ya no decide nada).
- `C_disk` / `H_disk` — commit e historial (20 ids) de la imagen que hay en disco.
- `C_file` / `P_file` / `W_file` / `G_file` — del `.gen`.
- `W_yo` — nuestro `installation-id` local.
- `MW` — marca de agua local (`ultima-generacion-vista`), nunca en Drive.
- `S_mio` — mtime+size del `.sqlite3` justo después de nuestra última escritura.
- `F_mio` — SHA-256 de `ultimaImagenConfirmada` (los bytes que de verdad
  escribimos). Se calcula sin releer el disco.

### 6.0 Requisito v4.1 — por qué el número de generación NO basta

Escenario que rompía el diseño v3:

```
PC A y PC B abren la app. Ambos leen commit X, generación N.
PC A escribe:  gen=N+1, commit=Ya, parent=X
PC B escribe:  gen=N+1, commit=Yb, parent=X      <-- mismo número, otra rama
Drive sincroniza: gana uno de los dos ficheros (o aparecen copias en conflicto).
```

Con la regla v3 (`G_file === G_mem` → coherente), el PC A leería después
`.gen = {gen:N+1, …}`, vería el **mismo número que él escribió** y concluiría
que nadie ha tocado nada — **pisando los datos de B en silencio**. Es
exactamente el fallo que todo esto viene a evitar.

**La regla de coherencia pasa a ser por `commit_id`, no por número:**

> La base de datos y el `.gen` son coherentes ⟺ `commit_id` del `.gen` ===
> `commit_id` de la imagen. Y nadie ha escrito desde nosotros ⟺ `commit_id` del
> `.gen` === el `commit_id` que escribimos/cargamos nosotros.

Y `parent_commit_id` es lo que permite decir **qué relación** hay entre dos
commits distintos: descendencia (legítimo) o bifurcación (conflicto).

### 6.1 Clasificación

Nomenclatura: `C_mem`/`P_mem` = commit y padre de lo que creemos tener;
`C_file`/`P_file`/`W_file` = del `.gen`; `C_disk`/`H_disk` = commit e historial
de la imagen que hay en disco; `W_yo` = nuestro `installation-id`.

### 6.1.a Requisito v4.5 — el camino rápido tenía un agujero: el caso 8

**Contradicción real del v4, señalada por el usuario.** El atajo decía
"`C_file === C_mem` → nadie ha escrito → seguir, sin leer el `.sqlite3`", y el
caso 8 (**otro PC con una versión anterior de Panorama, que reescribe la base
de datos y no toca el `.gen`**) se reconoce precisamente por `C_file === C_mem`
con el `.sqlite3` cambiado. Tal como estaba escrito, el atajo salía antes y el
caso 8 **no se detectaba nunca**.

**Corrección, en dos niveles.** Primero, la identidad de los **bytes** es una
pregunta distinta de la identidad del **commit**, y el diseño las mezclaba.

> **Primitiva nueva `F_disk`.** SHA-256 de los bytes que hay ahora mismo en
> `panorama.sqlite3`. Comparado con `F_mio` (§1) responde a una pregunta que
> `commit_id` **no** puede responder: *¿son estos los bytes que yo dejé?*

Con eso, los tres casos que hay que separar antes de cualquier otra cosa:

| Situación | Cómo se reconoce | Respuesta |
|---|---|---|
| **Mismo commit, mismos bytes** (aunque el `mtime` haya cambiado) | `C_file === C_disk === C_mem` **y** `F_disk === F_mio` | **No pasa nada.** Se refresca `S_mio` con el `stat` nuevo y se sigue. Un `mtime` distinto por sí solo **nunca** es conflicto |
| **Mismo commit, bytes distintos** | `C_file === C_disk === C_mem` **y** `F_disk ≠ F_mio` | **CASO 8.** Alguien escribió sin actualizar los identificadores. **Nunca** se acepta como descendencia legítima |
| **Commits distintos** | `C_disk ≠ C_mem` | Clasificación por parentesco (§6.1.b, rama A) |

**Y la política del atajo, que ahora depende de la ubicación** (§5.0):

```
comprobacionPrevia():
  1. leer .gen                            (~250 bytes)
  2. st = fs.statSync(panorama.sqlite3)   (metadato, sin leer contenido)

  --- CARPETA LOCAL -------------------------------------------------------
  3L. SI  C_file === C_mem
      Y   st.mtimeMs === S_mio.mtimeMs  Y  st.size === S_mio.size
      ENTONCES -> seguir. Fin.
      SI NO -> leer el .sqlite3 entero, calcular F_disk y clasificar.
      (No hay otro PC posible: A3.1 cierra la segunda instancia. El stat
       aquí solo cubre manipulación externa del archivo.)

  --- CARPETA COMPARTIDA o DESCONOCIDA ------------------------------------
  3C. SIEMPRE leer el .sqlite3 entero y calcular F_disk.
      No hay atajo. Ver §6.1.c: está medido y no es caro.
```

Un `stat` distinto **nunca concluye "conflicto" por sí solo**: obliga a leer.

**Qué señal es y qué NO es.** `mtime + size` es un **filtro barato, no una
prueba**, y sus límites son estos:

- **El tamaño puede no cambiar.** El `.sqlite3` es un múltiplo del tamaño de
  página (4096 B). Modificar un valor dentro de una página existente produce un
  archivo **exactamente igual de grande**. El tamaño solo delata cambios que
  añaden o quitan páginas.
- **El `mtime` es la señal fuerte, pero no es infalible.** Un `rename` sobre la
  misma carpeta deja `LastWriteTime` = el del temporal, o sea "ahora": en NTFS
  cambia en la práctica siempre. Pero (a) en `G:` el `mtime` lo sirve el driver
  de Drive en modo usuario y puede venir del servidor, retrasado o normalizado;
  (b) los relojes de dos PCs no están sincronizados al milisegundo; (c) dos
  escrituras dentro de la misma granularidad efectiva colisionarían.
- Por tanto: **no prometo detección absoluta del caso 8 con `stat`.** Prometo
  que el atajo ya no lo ignora por construcción, y que cualquier `stat` distinto
  fuerza la lectura y la clasificación completa.

### 6.1.b Requisito v4.6 — precedencia inequívoca

**Regla que manda sobre todas las demás:**

> **Si el disco ha divergido de lo que teníamos, conflicto ANTES que
> autorreparación.** Reconocer nuestro propio `writer` en el `.gen` **no** es
> licencia para reparar nada.

El escenario que rompía la regla anterior es el que describe el usuario:
nuestra intención `Y` quedó adelantada en el `.gen`, y mientras tanto otro
equipo consiguió escribir una base de datos `Z` distinta. Con la condición vieja
(`W_file === W_yo && P_file === C_mem`) habríamos "reparado en silencio"…
**encima de `Z`**.

La evaluación es **ordenada y la primera coincidencia gana**:

```
clasificar():        // ya tenemos .gen, stat, el .sqlite3 leído y F_disk

  PASO 0 — ¿HAY CAMBIOS EN MEMORIA SIN CONFIRMAR?
     Se consulta la BANDERA `dirty` (§2.d), NO una igualdad de commits.
     Motivo: C_mem se actualiza en el paso 8 de run(), así que entre los
     pasos 3 y 7 la memoria YA está modificada y C_mem TODAVÍA vale lo
     mismo que el commit de ultimaImagenConfirmada. La igualdad no
     demuestra nada; la bandera sí.
     Si dirty === true -> NUNCA recarga silenciosa. Todo va a modal (§7).

  PASO 1 — ¿el .gen y la BD de disco son el MISMO commit?

    ── RAMA A: C_file === C_disk  (el disco es un estado asentado) ────────────

       A1. ¿C_disk === C_mem?  (mismo commit: hay que mirar los BYTES)
             A1a. F_disk === F_mio ....... SIN CAMBIOS.
                                           Un mtime distinto NO es conflicto.
                                           Se refresca S_mio y se sigue.
             A1b. F_disk ≠ F_mio ......... CASO 8  versión antigua / escritura
                                           externa que no tocó los ids.
                                           -> CONFLICTO (§7)
             En AMBOS casos se sale aquí: con C_disk === C_mem no se evalúa
             ninguna regla de parentesco. <-- esto cierra el agujero de que
             C_mem ∈ H_disk se cumpla trivialmente por incluirse a sí mismo.

       -- de aquí en adelante, C_disk ≠ C_mem garantizado --

       A2. C_mem ∈ H_disk .................. CASO 1  DESCENDENCIA ESTRICTA
                                             -> recarga silenciosa (si paso 0 ok)
       A3. C_disk ∈ H_mem .................. CASO 4  vamos por delante del disco
                                             -> aviso, no se sobrescribe
       A4. P_disk === P_mem ................ CASO 3  BIFURCACIÓN CONCURRENTE
                                             -> CONFLICTO (§7)
       A5. resto ........................... CASO 5  divergencia no demostrable
                                             -> CONFLICTO (§7)
             A5 es la ÚLTIMA regla y la única que dice "resto".
             (En la rev. 2 A4 decía "resto" y A5 venía detrás: A5 era
              inalcanzable. Corregido.)

    ── RAMA B: C_file ≠ C_disk  (alguien tiene una escritura a medias) ────────
       B0. ¿SIGUE EL DISCO DONDE LO DEJAMOS?
           Son DOS preguntas, no una:  C_disk === C_mem  Y  F_disk === F_mio
           NO (cualquiera de las dos) ->
                 el disco ha divergido. **NO se autorrepara, pase lo que pase
                 y diga lo que diga W_file.** Se reclasifica el DISCO contra
                 nosotros con las reglas A1..A5, y el .gen adelantado se anota
                 como intención pendiente (§6.2). Si sale A2 y el paso 0 es
                 correcto, recarga silenciosa; si sale A1b/A3/A4/A5, CONFLICTO.
                 <-- ESTE es el caso que el usuario señala.
           SÍ -> seguir en B1/B2.
       B1. W_file === W_yo  Y  P_file === C_disk === C_mem  Y  F_disk === F_mio
                                             CASO 2  mi escritura interrumpida
                                             -> reparación silenciosa
                                             (las tres igualdades de commit MÁS
                                              la de bytes)
       B2. W_file ≠ W_yo  Y  P_file === C_disk
                                             intención de otro equipo en vuelo
                                             -> §6.2 (solo lectura y espera)
       B3. resto (el .gen no encadena ni con el disco ni con nosotros)
                                             CASO 0  incoherencia
                                             -> §6.2 en modo conservador,
                                                nunca reparación silenciosa
```

Cuatro consecuencias que conviene dejar escritas:

- **`W_file === W_yo` deja de ser una condición suficiente para nada.** Solo se
  usa dentro de B1, y siempre acompañada de `C_disk === C_mem` y `F_disk === F_mio`.
- **La descendencia (A2) es estricta.** Se evalúa solo cuando ya se sabe que
  `C_disk ≠ C_mem`, precisamente porque `H_disk` contiene su propio commit y si
  no se excluyera antes, "mismo commit con bytes distintos" pasaría por
  descendencia legítima. Esa era la trampa que señala el usuario.
- **La igualdad de bytes se aplica también a la autorreparación (B0/B1) y a la
  revalidación del modal (§7.c).** Los identificadores pueden mentir si alguien
  escribe sin actualizarlos; los bytes no.
- **La recarga silenciosa exige el paso 0.** Si tenemos cambios en memoria que
  nunca llegaron a disco, recargar sin decir nada los borraría.
- **Ninguna rama repara escribiendo sobre una base de datos que no reconoce.**
  Las únicas escrituras "de reparación" que existen reescriben el **`.gen`** para
  que refleje lo que ya hay en la base de datos; nunca al revés.

La tabla siguiente es la referencia de los nueve casos; el orden en que se
evalúan es el del bloque de arriba, no el de la tabla.

**Solo si el atajo de §6.1.a falla** se paga la lectura del `.sqlite3` de disco
(76 KB) y se clasifica:

| # | Situación | Cómo se reconoce | Respuesta |
|---|---|---|---|
| 0 | **`.gen` y BD de commits distintos** | `C_file ≠ C_disk` | Escritura de alguien interrumpida → §6.2 si el writer es otro; reparación si somos nosotros |
| 1 | **Descendencia lineal legítima** | `C_mem ∈ H_disk` (su imagen desciende de la nuestra) | **No es conflicto.** Su imagen ya contiene lo nuestro: se recarga en silencio y se registra |
| 2 | **Nuestra propia escritura interrumpida** | `W_file === W_yo` **y** `P_file === C_mem` | Reparación silenciosa (adoptar o reescribir el `.gen` según dónde esté la BD) |
| 3 | **BIFURCACIÓN CONCURRENTE** ← el caso nuevo | `P_file === P_mem` **y** `C_file ≠ C_mem` — dos hermanos del mismo padre. Cubre el N+1/N+1 aunque los números coincidan | **Conflicto real** → §7, con texto propio: "otro equipo partió del mismo punto que tú" |
| 4 | **Estamos por delante del disco** | `C_disk ∈ H_nuestro` | La imagen de disco es más antigua (copia restaurada, o Drive entregó una vieja). Aviso, no se sobrescribe sin preguntar |
| 5 | **Divergencia no demostrable** | Ninguna de las anteriores: no se puede probar parentesco en ningún sentido | **Conflicto real** → §7, conservador |
| 6 | **Restauración de una copia antigua** | Al cargar: `G_db < MW` (marca de agua local) | **No** es conflicto: aviso propio, y si se acepta seguir, `MW` se realinea |
| 7 | **`.gen` corrupto** | No existe, vacío, no parsea, `v` desconocida o faltan campos | **Nunca** se interpreta como conflicto. Política §5 según ubicación; se reescribe desde la BD en cuanto se pueda |
| 8 | **Versión antigua de Panorama** | `C_file === C_mem` (nadie tocó el testigo) **pero** el `.sqlite3` tiene mtime+size distintos de `S_mio` | Conflicto real → §7, texto propio: "otro equipo con una versión anterior" |

El **historial de 20 commits** existe para el caso 1: sin él, solo podríamos
comprobar un salto (`P_file === C_mem`) y un equipo que hubiera hecho tres
escrituras seguidas caería en el caso 5 y molestaría al usuario sin motivo.

**Límite honesto:** si el otro equipo hace **más de 20** commits mientras
nosotros no escribimos, se pierde la prueba de descendencia y cae al caso 5
(conflicto conservador). Es un falso positivo posible; su coste es un diálogo
de más, nunca pérdida de datos, y el usuario puede elegir "usar disco" con
seguridad.

### 6.1.c Requisito v4.9 — el watchdog NO demostraba nada. Retirado.

**La secuencia del usuario destruye la garantía anterior, y hay que decirlo sin
rodeos.** La v4 rev. 2 afirmaba "exposición acotada a ≤ 45 s y ninguna pérdida
silenciosa". Esta secuencia la desmiente:

```
t0  Una versión antigua modifica la BD. No toca el .gen ni db_commit_id.
    Conserva tamaño, y el mtime no se distingue.
t1  ANTES del siguiente watchdog, nuestra app hace una escritura.
    El atajo la permite (C_file === C_mem, stat igual) y el rename
    SUSTITUYE el archivo por nuestra imagen en memoria.
t2  El watchdog lee... nuestra propia imagen recién escrita.
    Su hash coincide con F_mio. Todo "correcto".
```

**¿Con qué evidencia se detectaría el cambio externo? Con ninguna. ¿Dónde
quedaría preservado? En ningún sitio.** Los bytes del otro equipo se han
liberado en el `rename` del paso t1 y no existe copia. El watchdog solo detecta
cambios que **siguen** en disco cuando llega; una escritura nuestra por medio
los borra y además borra la evidencia. La afirmación era falsa y la retiro.

**Dos salidas posibles, y la medición decide.** Verificar los bytes antes de
cada escritura compartida cierra el agujero por completo. La pregunta era si
costaba demasiado, y ya no hay que suponerlo — **está medido** (ensayo del
14 sept 2026, Node 20.16.0 / Electron 30.5.1 arm64, ver §13):

| Operación, 76 KB | Disco local | `G:` (Drive) |
|---|---|---|
| Leer `.sqlite3` + `sha256` (**la verificación**) | 4,5 ms · p95 7,1 | **17,7 ms · p95 26,6** |
| Ciclo de escritura completo actual | 1,7 ms · p95 2,6 | **52,3 ms · p95 98,7** |
| Sobrecoste relativo de verificar | +265 % | **+34 %** |

En Drive, verificar los bytes cuesta **un tercio más sobre una operación que ya
tarda 52 ms**. Eso no es caro. En disco local sí sería desproporcionado — y
además allí no hace falta, porque A3.1 cierra la segunda instancia.

*(La frase "como mucho cada 15 s por ventana" que había aquí era falsa: solo
vale para `backup:save`. Hay guardados al cerrar, acciones manuales y acciones
con varias sentencias donde el coste se multiplica y llega de golpe. Ver §13.c.)*

**Decisión, corregida por la medición:**

> En carpeta **COMPARTIDA o DESCONOCIDA** se leen y se verifican los bytes
> **antes de cada escritura**. No hay atajo. En carpeta **LOCAL** se mantiene el
> atajo con `stat`.

Y se **elimina** del diseño la comprobación periódica del watchdog: no aportaba
la garantía que decía aportar, y con verificación por escritura sobra.

**Lo que esto NO es, para que quede escrito:**

- **No es exclusión mutua entre PCs.** Verificar antes de escribir **detecta**,
  no **impide**. Dos equipos pueden seguir escribiendo a la vez; lo que se gana
  es que el segundo se dé cuenta y conserve las dos versiones en vez de pisar.
- **Queda una ventana residual real**: entre nuestra verificación y nuestro
  `rename` pasan unos milisegundos (52 ms de media en Drive, p95 99 ms). Una
  escritura ajena que caiga justo ahí no se detecta y se pierde. Es una ventana
  de ~50-100 ms cada 15 s, frente a la ventana **permanente** de antes. No es
  cero y no lo voy a llamar cero.
- **Sigue sin cubrir la latencia de Drive**: los bytes verificados son los que
  Drive nos ha entregado, no necesariamente los últimos que existen en la nube.

**Dónde se verifica, versión final:**

| Momento | Local | Compartida / desconocida |
|---|---|---|
| Cada escritura | `.gen` + `stat` | `.gen` + **lectura completa + `F_disk`** |
| `getDb()` (arranque) | Lectura completa + `sha256` + `integrity_check` | Ídem |
| Antes de un rekey (A1) o una restauración (A2) | Lectura completa + `sha256` | Ídem |
| Periódico (watchdog) | — | **— (retirado)** |

`F_mio` se sigue calculando sobre el `Buffer` que ya tenemos (§1): 0,05 ms para
76 KB, medido. El lado nuestro de la comparación nunca cuesta E/S.

**Qué es y qué no es `mtime + size`** (sigue en uso solo en carpeta local):

- **El tamaño puede no cambiar.** El `.sqlite3` es múltiplo de la página
  (4096 B); modificar un valor dentro de una página existente da un archivo
  exactamente igual de grande.
- **El `mtime` es la señal fuerte pero no infalible**: en `G:` lo sirve el
  driver de Drive en modo usuario, los relojes de dos PCs no coinciden al ms, y
  puede forzarse con `fs.utimesSync`.
- Por eso **ya no se usa como única defensa en carpeta compartida**, que era el
  único sitio donde importaba.

### 6.2 Requisito v4.2 — intención adelantada de otro PC que nunca termina

Estado: el `.gen` dice `{commit:Y, writer:B}` pero la BD en disco sigue en el
commit anterior. O bien B murió entre el `.gen` y su `persist()`, o bien Drive
ha entregado su `.gen` y todavía no su `.sqlite3`. **No podemos quedarnos
bloqueados para siempre.**

Procedimiento, en escalera y sin destruir nada:

1. **Esperar y volver a mirar.** Lo más probable es latencia de Drive.
   Ventana acotada: 3 comprobaciones en ~90 s, reaprovechando el intervalo de
   45 s que ya tiene `startUserDataWatchdog` en vez de crear otro temporizador.
   Mientras dura: **modo solo lectura**, con un mensaje que dice qué equipo
   está escribiendo y que se está esperando a que termine de sincronizar.
2. **Mirar si ese equipo da señales de vida.** El `.panorama-lock.json` ya
   lleva latidos cada 30 s. Si hay un latido fresco de `B`, sigue vivo → seguir
   esperando y decirlo. Si está caducado o no existe, probablemente se fue.
   *(Es un indicio, no una prueba: ese archivo es de una sola ranura y puede
   no corresponder a B. Se usa como pista, y así se comunica.)*
3. **Pasada la ventana, si la BD sigue sin llegar: SIEMPRE se pregunta.**

   **Requisito v4.13 — corrección.** La rev. 2 decía que un `.gen` de más de
   24 h permitía "dar por demostrado" el abandono. **El usuario tiene razón: el
   tiempo no demuestra nada.** Un `.gen` viejo es igual de compatible con:
   - una sincronización de Drive pendiente desde hace días (portátil apagado,
     cuota llena, conflicto de Drive sin resolver),
   - un desfase de reloj entre equipos —y `at` lo escribe el **otro** PC, con
     **su** reloj, que puede ir adelantado o atrasado horas—,
   - un abandono real.

   No dispongo de ninguna evidencia adicional que las separe. El latido de
   `.panorama-lock.json` es una pista de una sola ranura, ya documentada como
   no concluyente. Así que:

   > **No hay abandono automático. Nunca.** El plazo de 24 h se conserva, pero
   > **solo cambia el texto de la pregunta**, no la decisión: por debajo se
   > dice *"empezó hace X minutos"*, por encima *"lleva más de un día sin
   > terminar, lo que sugiere que ese equipo ya no va a completarlo — pero no
   > se puede demostrar"*. En los dos casos decide el usuario.

   Texto: *"El equipo B empezó a escribir hace X y no ha terminado. Puedes
   esperar más, o continuar dando su cambio por abandonado — no se borra
   nada."*
4. **Al abandonar** (automático o confirmado): se copia el `.gen` actual a
   `panorama.sqlite3.gen.abandonado-<fecha>`, se registra en `app.log`, y
   nuestra siguiente escritura toma como padre **el commit que de verdad hay en
   disco**, anotando en el `.gen` un campo `abandoned: ["Y"]` que documenta la
   intención sobre la que se pasó.
5. **Si la escritura de B aparece después** vía Drive, se verá como un commit
   `Y` cuyo padre es un ancestro nuestro → caso 3 o 5 → flujo normal de
   conflicto, **con las dos versiones conservadas**. Nada se pierde.

**Límite honesto (§6.1):** los casos **4, 6 y 8** pueden ser indistinguibles
**al arrancar**, porque `S_mio` es una marca de la sesión en curso y al arrancar
todavía no existe: en los tres, la base de datos en disco es "más vieja de lo
que este equipo recordaba". Durante una sesión ya en marcha sí se distinguen.
Al arrancar, el mensaje será el mismo para los tres, y es el correcto para
todos: *"la base de datos es más antigua de lo que este equipo recordaba"*, con
las mismas salidas conservadoras. No voy a fingir una precisión que no tengo.

Lo que **no** depende de `S_mio` y por tanto **sí** se distingue siempre, tanto
al arrancar como en marcha, es la bifurcación concurrente (caso 3): se prueba
solo con `commit_id` y `parent_commit_id`, que viven en el `.gen` y en la propia
base de datos.

Además, en carpeta compartida se comprueba de paso si Drive ha dejado **copias
en conflicto** (`panorama.sqlite3 (1)`, `…gen (1)`): si las hay, se avisa,
porque son datos reales que quedarían invisibles.

---

## 7. Requisito 7 — qué se hace ante un conflicto real

**No se sobrescribe ninguno de los dos lados. Nunca. Ni automáticamente ni tras
un tiempo de espera.**

Al clasificar un conflicto real, `db.js`:

1. **No ejecuta el SQL** que lo destapó (requisito 1) y **no escribe nada** en
   `panorama.sqlite3` ni en `.gen`.
2. Vuelca nuestra imagen en memoria a
   `panorama.sqlite3.conflicto-<equipo>-<fecha>` — se intenta primero en la
   carpeta de datos; si falla (puede ser justo la que da problemas), en la
   carpeta de configuración **local**. La ruta final se registra en `app.log`.
3. `escrituraBloqueada = 'conflicto'` (latch). Todas las escrituras posteriores
   se rechazan con el mismo error tipado; la app **sigue usable para leer**.
4. Llama **una sola vez** al callback inyectado, con
   `{ tipo, C_mem, C_file, C_disk, P_file, P_mem, W_file, G_mem, G_file,
   rutaConflicto }` — los números de generación viajan solo para poder
   enseñárselos al usuario.

`main.js` (el callback) muestra un modal **que no decide nada solo**:

- **"Usar lo que hay en disco"** → `dbmod.recargarDesdeDisco()`: descarta la
  imagen en memoria, relee `panorama.sqlite3`, realinea `C_mem`/`P_mem`/`H_mem`/
  `G_mem`/`MW`/`S_mio`/`F_mio`, levanta el latch y avisa al lanzador
  (`projects:changed`) para que refresque. Los cambios de metadatos de esta
  sesión quedan en el archivo `.conflicto-…`.
- **"Conservar lo mío"** → `dbmod.resolverConservandoLoMio()`: escribe nuestro
  contenido **encadenado sobre el commit que hay en disco** (§7.b) y levanta el
  latch. Es la salida para "sé que el otro equipo se equivoca".
- **"Decidir luego"** → se queda en modo solo lectura hasta reiniciar.

> El nombre `adoptarGeneracionDeDisco()` de la v3 **desaparece**. Era lenguaje
> de contador y describía mal lo que hace la función: no se adopta un número, se
> encadena un commit.

### 7.b Requisito 2 — resolver un conflicto no destruye ninguna de las dos versiones

La regla es simétrica: **elija lo que elija el usuario, las dos versiones
quedan en disco.**

| Resolución | Nuestra versión | La versión del disco |
|---|---|---|
| **Usar lo que hay en disco** | Ya guardada en `panorama.sqlite3.conflicto-<equipo>-<fecha>` al detectar (§7, paso 2) | Se conserva: pasa a ser la activa |
| **Conservar lo mío** | Pasa a ser la activa | **Se copia a `panorama.sqlite3.conflicto-otro-<writer>-<fecha>` ANTES de sobrescribir** |

**Requisito v4.8 — "conservar lo mío" se encadena contra la BD, no contra el
`.gen`.** La v3 decía "toma `G_file` como base, escribe como `G_file + 1`". Con
identidad de commit eso está mal por dos motivos: el `.gen` **no es la
autoridad** (puede estar adelantado, atrasado o ser de otra rama), y un número
no sirve como padre.

`resolverConservandoLoMio()` hace, en este orden:

```
1. REVALIDAR (§7.c): releer .gen y panorama.sqlite3 EN ESTE INSTANTE.
   -> C_file, P_file, W_file, C_disk, H_disk, G_disk actuales.

2. EXIGIR COHERENCIA .gen <-> BD:  C_file === C_disk ?
   NO -> NO SE SOBRESCRIBE NADA. La incoherencia se resuelve PRIMERO:
         - si es una intención en vuelo de otro equipo -> §6.2 (esperar/preguntar)
         - si es nuestra propia escritura interrumpida -> §6.1.b B1 (reparar)
         y después se vuelve a ofrecer la resolución.
         Sobrescribir con un .gen y una BD que no son el mismo commit sería
         encadenar sobre un padre que no existe.
   SÍ -> seguir.

3. PRESERVAR la versión del disco (antes de tocar nada):
      copiar panorama.sqlite3 -> panorama.sqlite3.conflicto-otro-<writer>-<fecha>
      verificar que la copia existe y tiene el MISMO TAMAÑO y el MISMO SHA-256
      que el original.
      Si falla -> NO se sobrescribe nada. Error claro. Fin.

4. CONSTRUIR EL COMMIT DE RESOLUCIÓN, encadenado sobre el disco:
      C_nuevo  = randomBytes(16).hex
      P_nuevo  = C_disk            <-- el commit que acabamos de preservar,
                                       NO C_mem y NO "G_file + 1"
      H_nuevo  = [C_nuevo, C_disk, ...H_disk]   (se sigue la rama del disco)
      gen      = max(G_disk, G_mem) + 1         (solo contador informativo)
      resuelve = { descartado: C_mem, preservado_en: <ruta del paso 3> }
   El CONTENIDO es el nuestro; el LINAJE es el suyo. Es deliberadamente un
   commit de fusión "gana lo mío", no una rama nueva.

5. ESCRIBIR: primero el .gen (fsync + rename), luego el .sqlite3
   (fsync + rename), igual que cualquier otra escritura (§4.b).

6. Rehacer el bookkeeping (C_mem, P_mem, H_mem, G_mem, S_mio, F_mio,
   ultimaImagenConfirmada) y levantar el latch.
```

**Por qué el paso 4 importa más de lo que parece:** si el commit de resolución
se encadenara sobre `C_mem` (nuestra rama), un **tercer** equipo que leyera
después vería dos ramas hermanas otra vez y volvería a clasificar bifurcación —
el conflicto se propagaría en vez de cerrarse. Encadenándolo sobre `C_disk`, un
tercer equipo **que estuviera en la rama del disco** lo clasifica como caso 1 y
lo adopta en silencio. **Resolver un conflicto no debe crear uno nuevo para
quien no tenía ninguno.**

**Requisito v4.14 — pero solo para quien pueda demostrar la descendencia.** La
rev. 2 decía "cualquier otro equipo lo adopta en silencio", y eso era demasiado.
Depende **de dónde parta ese tercer equipo**:

| El tercer equipo está en… | Clasificación de nuestra resolución | Correcto |
|---|---|---|
| `C_disk`, o cualquier ancestro suyo dentro de sus 20 commits | **Caso 1**, descendencia estricta → adopción silenciosa | Sí: su trabajo está contenido en lo que adopta |
| Nuestra rama descartada (`C_mem` o descendiente) | **Caso 5** → conflicto | Sí: su rama **no** está contenida en la resolución |
| Una tercera rama con trabajo propio divergente | **Caso 3 o 5** → conflicto | Sí. **Un equipo con trabajo divergente conserva el tratamiento de conflicto** |
| Más de 20 commits por detrás | **Caso 5** → conflicto conservador | Sí, aunque sea falso positivo (límite conocido de §6.1) |

La adopción silenciosa queda acotada, entonces, **a la descendencia que
realmente se puede demostrar con el historial**, ni un caso más. Es lo mismo que
ya exige A2 en §6.1.b, aplicado aquí: no hay una regla especial para las
resoluciones.

**Si el paso 2 o el 3 fallan, NO se sobrescribe nada** y se devuelve un error
claro: preferimos dejar el conflicto sin resolver a destruir el único ejemplar
de la versión del otro equipo. El usuario puede reintentar o elegir la otra
opción.

Los dos archivos de conflicto son bases de datos SQLite completas y válidas:
se pueden abrir con cualquier visor, o renombrar a `panorama.sqlite3` para
recuperarlas enteras. Se registra en `app.log` la ruta de ambos.

**`generation` queda reducido a contador informativo** en todo §7: se sigue
escribiendo, se sigue enseñando en el modal porque es lo único legible para una
persona, y **no participa en ninguna decisión**. Todas las comparaciones de esta
sección son de `commit_id` / `parent_commit_id` / historial.

### 7.c Requisito v4.3 — revalidar en el momento de resolver

El usuario puede tardar minutos en decidir, y en ese rato **otro equipo puede
haber escrito otra vez**. Resolver con la fotografía tomada al detectar el
conflicto sería pisar a un tercero.

Por eso, tanto `recargarDesdeDisco()` como `resolverConservandoLoMio()`
empiezan **releyendo `.gen` y `panorama.sqlite3` en ese mismo instante**:

```
resolver(opcion):
  1. releer .gen y la BD de disco  -> estado ACTUAL
     y CALCULAR F_disk = sha256(bytes)          <-- por bytes, no solo por ids

  2. ¿coincide con la fotografía tomada al detectar el conflicto?
     Son TRES comparaciones, no dos:
         C_file_ahora === C_file_foto
       Y C_disk_ahora === C_disk_foto
       Y F_disk_ahora === F_disk_foto           <-- ESTA es la que faltaba
     Sin la tercera, alguien que reescriba los bytes MANTENIENDO los
     commit_id (el caso 8) pasaría la revalidación sin que nos enteremos.

       NO -> - conservar también esta nueva versión:
               panorama.sqlite3.conflicto-otro-<writer>-<fecha>
             - volver a clasificar (§6.1.b) con los datos nuevos
             - NO aplicar la opción elegida
             - reabrir el modal explicando que el estado cambió mientras decidía

       SÍ -> 3. ¿son C_file y C_disk el MISMO commit?
                  NO -> incoherencia: no se aplica nada, se resuelve primero
                        (§7.b paso 2)
                  SÍ -> aplicar la opción elegida
```

La fotografía que se toma al detectar el conflicto (§7, paso 4) incluye por
tanto `F_disk`, no solo los identificadores. Prueba 37.

Los pasos 1-3 van dentro del **mismo tramo síncrono** que la escritura: `db.js`
no tiene ningún `await` en ese camino, así que entre la revalidación y el
`rename` no puede colarse nada de nuestro propio proceso. Contra otro PC no hay
atomicidad posible (Drive no la ofrece), pero la ventana pasa de "minutos
mientras el usuario piensa" a "los milisegundos de la escritura".

**Qué se pierde realmente, dicho claro:** la base de datos solo guarda
metadatos —lista de proyectos, índice de backups, orden de las tarjetas, tema y
la meta de Seguridad—. El contenido de los proyectos vive en `localStorage` y en
archivos por proyecto, y **no participa en este conflicto**. Eso acota mucho el
daño de cualquiera de las dos opciones.

---

## 8. Requisito 8 — los tres flujos completos

### 8.a Escritura normal (caso mayoritario)

```
main.js: dbmod.run('UPDATE projects SET sort_order=? WHERE id=?', [0, 5])
  db.js
   1. escrituraBloqueada === null                                    OK
   2. DETECCIÓN — depende de la ubicación (§6.1.a). Lee siempre el .gen:
         -> {gen:128, commit_id:"X", parent:"W", writer:"a3f1"}
      CARPETA LOCAL:
         stat(.sqlite3) === S_mio  Y  C_file === C_mem ("X")
         -> nadie ha escrito. NO se lee el .sqlite3.        (atajo)
      CARPETA COMPARTIDA o DESCONOCIDA:
         se lee el .sqlite3 ENTERO y se calcula F_disk.     (sin atajo)
         C_file === C_disk === C_mem  Y  F_disk === F_mio
         -> nadie ha escrito.
      En ambos casos, si algo no cuadra -> clasificar (§6.1.b).
   3. dirty = true ; db.run(UPDATE …)         <- primera vez que se toca memoria
   4. lastId = last_insert_rowid()
   5. Y = randomBytes(16).hex   (commit nuevo)
      ejecutarInterno(UPSERT app_meta: db_generation=129, db_commit_id=Y,
                              db_parent_commit_id=X,
                              db_commit_history = [Y,X,…] (20 últimos))
   6. EL TESTIGO  —  escribirAtomico(.gen)          [§4.b, política vigente]
        6.1  crear  .gen.tmp-<writer>-<nonce>
        6.2  ESCRITURA COMPLETA (bucle de writeSync con control de progreso)
        6.3  fsync                                   <-- SÍ, también el .gen
        6.4  rename  ->  panorama.sqlite3.gen

   7. LA BASE DE DATOS  —  escribirAtomico(.sqlite3)
        7.1  crear  .sqlite3.tmp-<writer>-<nonce>
        7.2  ESCRITURA COMPLETA (mismo bucle)
        7.3  fsync
        7.4  rename  ->  panorama.sqlite3
             <<<< ESTE SEGUNDO RENAME ES EL PUNTO DE CONFIRMACIÓN >>>>

   8. SOLO tras el segundo rename:
      ultimaImagenConfirmada = ese mismo Buffer ; dirty = false
      C_mem=Y ; P_mem=X ; G_mem=129 ; S_mio = stat ; F_mio = sha256(buffer)
      ultima-generacion-vista=129 (local)
      (si algo de este paso 8 falla, es el caso (b) de §2.d: la operación
       YA está aplicada y NO se restaura la memoria)
  -> devuelve lastId
```

> **`fsync` en LOS DOS archivos.** Es la política vigente de §4.b y es lo que
> hace el núcleo (§15). Aquí quedaba escrito *"el `.gen` SIN fsync: su pérdida
> es reparable"*, que era de la rev. 3 y contradecía tanto a §4.b como al
> código. **Corregido.** La optimización de quitar el `fsync` del `.gen` está
> **aplazada** hasta que la recuperación de todos los estados combinados esté
> demostrada; no se aplica en este núcleo y no debe copiarse de aquí.

**Nombres temporales.** `.tmp-<writer>-<nonce>`, **no** `.tmp-<pid>`. El PID no
distingue dos PCs distintos sobre la misma carpeta de Drive, y al arrancar
algunos `.tmp` supervivientes se tratan como posibles imágenes de recuperación
(§4.c): un equipo no puede poder truncar el temporal de otro por coincidencia de
nombre. Siguen empezando por `.tmp-`, así que la limpieza por prefijo de
`db.js:34-41` sigue valiendo. Probado en §15, sección 12.

**Coste.** Separando lo medido de lo derivado, como en §13:

| | **MEDIDO** — ciclo sintético con `fsync` en ambos | Media | p95 |
|---|---|---|---|
| Disco local | sí | 11,09 ms | 17,44 |
| `G:` (Drive) | sí | 53,08 ms | 103,06 |

| | **MEDIDO** — solo la escritura de la BD, que es lo que hace hoy `db.js` | Media | p95 |
|---|---|---|---|
| Disco local, sin `fsync` (hoy) | sí | 0,73 ms | 1,18 |
| `G:` (Drive), sin `fsync` (hoy) | sí | 25,49 ms | 54,50 |

**DERIVADO, no medido como ciclo:** el coste añadido total de A3.3 sale de sumar
la verificación de bytes en carpeta compartida (**medida**: 17,73 ms de media en
Drive, 4,51 en local) al ciclo con `fsync`. No se ha cronometrado un ciclo
completo de A3.3 tal cual, porque A3.3 no está integrado. **No presento ninguna
cifra de "coste total con A3.3" como medida.**

En Drive lo caro no es el `fsync` (+0,79 ms sobre el ciclo, medido) sino la
verificación de bytes de §6.1.c, que es lo que compra la detección del caso 8.
En local no se verifica y lo caro es el `fsync`. **No todas las escrituras son
periódicas**: las hay al cerrar, manuales, y acciones de varias sentencias donde
el coste se multiplica por el número de sentencias y llega de una vez (§13.c).

### 8.b Escritura con bifurcación concurrente (el caso que v3 no veía)

Los dos equipos parten del commit `X`, generación 128, y los dos escriben 129.

```
  1. escrituraBloqueada === null                                     OK
  2. lee .gen -> {gen:129, commit_id:"Yb", parent_commit_id:"X", writer:"9c02"}
     C_file ("Yb") ≠ C_mem ("Ya")  ->  AQUÍ se lee el .sqlite3 de disco (76 KB)
     C_disk = "Yb" (coherente con el .gen)
     C_mem ("Ya") NO está en H_disk        -> no es descendencia (caso 1 fuera)
     W_file ≠ W_yo                          -> no es mi escritura (caso 2 fuera)
     P_file ("X") === P_mem ("X")           -> CASO 3: BIFURCACIÓN CONCURRENTE
     ** el número de generación coincidía; lo que lo delata es el commit **
     -> NO se ejecuta el UPDATE. La memoria queda intacta.
     -> vuelca nuestra imagen a panorama.sqlite3.conflicto-SURFACE-2026-….sqlite3
     -> escrituraBloqueada = 'conflicto'
     -> appLog(PS-30xx) + onConflicto({...})
     -> lanza ErrorDb('conflicto')
  main.js: el callback abre el modal de tres salidas (§7), con el texto propio
           del caso 3: "otro equipo partió del mismo punto que tú".
           Al resolver se revalida (§7.c) antes de aplicar nada.
           El llamante original recibe el error tipado y lo trata como error de
           operación (B2 clase 4) — no como fallo global.
```

### 8.c Recuperación tras corte de luz

```
Arranque -> getDb()
  a. carga panorama.sqlite3 (tmp+rename garantiza que está entero)
  b. C_disk = app_meta.db_commit_id           -> "X" (gen 128)
  c. lee .gen                    -> {gen:129, commit_id:"Y", parent:"X",
                                     writer:"a3f1"}
  d. W_file === W_yo  y  P_file === C_disk
     => "mi propia escritura interrumpida"    (caso 2)  -- CON RESERVAS, ver abajo
  e. reparación: se reescribe el .gen con lo que de verdad hay en la BD
     ({gen:128, commit_id:"X", parent:…, writer:yo}), se copia el .gen previo
     a .gen.interrumpido-<fecha> y se registra en app.log (sin molestar al
     usuario). C_mem = "X".
  f. la app arranca con normalidad
```

Y si el corte hubiera sido **antes** de tocar el `.gen`, `C_file === C_disk` y
no hay nada que reparar.

Si en el paso (d) fuera `C_file === C_disk === "Y"` (la BD sí llegó, el corte
fue entre el paso 7 y el 8), tampoco hay nada que reparar: se adopta `Y`.

### 8.c.1 `F_arranque` no existía. Corrección.

**El usuario tiene razón y la rev. 3 hacía trampa aquí.** El paso (d) invocaba
un `F_arranque` que, si se calcula del mismo archivo que se está comprobando,
compara el archivo consigo mismo: `F_disk === F_arranque` es una tautología y
**no demuestra nada**. Ese símbolo se elimina del documento.

El fondo del problema es real: **al arrancar no tenemos referencia
independiente.** `F_mio` es una variable de sesión y la sesión acaba de empezar.
Y como bien dices, que la base de datos abra, pase `integrity_check` y lleve
`db_commit_id = X` **tampoco distingue** una imagen legítima de una versión
antigua que conservó ese identificador — que es exactamente el caso 8.

**¿Hay alguna referencia independiente ya disponible?** He mirado las que
existen y ninguna sirve:

| Candidata | Por qué no sirve |
|---|---|
| `ultima-generacion-vista` (config local) | Es un **número**, no una huella. Un caso 8 no lo cambia |
| El propio `.gen` | Vive junto a la base de datos y una versión antigua tampoco lo toca |
| `.panorama-lock.json` | De una sola ranura, ya documentado como pista y no prueba |
| `S_mio` | Es de sesión: al arrancar no existe |

**Salida conservadora, que es lo que queda:**

1. **Se añade una huella local persistente.** Junto a `installation-id`, en
   `%APPDATA%\panorama-app-config\` (nunca en Drive), se guarda tras cada
   escritura confirmada `{ commit_id, sha256, size }` de lo que dejamos. Es una
   línea de ~120 bytes en un archivo local y **no cuesta E/S extra en Drive**.
   Al arrancar, esa huella **sí** es una referencia independiente: si la base de
   datos dice `X` y nuestra huella dice `X` con otro `sha256`, es caso 8 y se
   detecta *aunque acabemos de arrancar*.
2. **Cuando la huella no existe o no corresponde a este archivo** (primer
   arranque tras instalar, tras cambiar de carpeta de datos, tras restaurar):
   no se puede demostrar nada. Entonces **no se repara en silencio**: se adopta
   lo que hay en disco, se registra en `app.log`, y en carpeta COMPARTIDA se
   avisa una vez de que no se ha podido verificar el arranque. **Nunca se
   sobrescribe** basándose en un `.gen` que no se puede corroborar.
3. **Y se reconoce el límite:** con la huella local perdida o borrada, un caso 8
   ocurrido mientras la aplicación estaba cerrada **no se detecta**. La huella
   es local a propósito (si viajara por Drive dejaría de ser independiente), y
   eso significa que un equipo nuevo empieza sin ella.

Esta huella **no está implementada en el núcleo aislado de §15**: es un cambio
de diseño posterior al ensayo y lo dejo propuesto, no hecho.

---

## 9. Matriz de impacto

| Componente | Riesgo | Cómo se comprueba |
|---|---|---|
| `db.js run()` | **Todas** las escrituras pasan por aquí. Un fallo rompe la app entera | Suite dedicada + interruptor de desactivación (§10) + las cuatro suites existentes |
| `db.js persist()` | Se le añade la escritura del `.gen` | Probar corte en cada una de las cuatro ventanas de §4 |
| `db.js getDb()` | Hace un `persist()` al final; debe inicializar la generación sin dar conflicto | Arranque limpio, arranque con `.gen` ausente, con `.gen` corrupto |
| `vacuum()` | Llama a `persist()` directamente | Debe pasar por la misma numeración |
| `backup:save` | Ruta más caliente (cada 15 s por ventana) | Medir el coste añadido; verificar que un rechazo devuelve `false` |
| A1 `rekeyAllUserFiles` fases 3-4 | Un conflicto a mitad debe abortar y deshacer | Provocar conflicto durante el rekey → debe disparar el rollback de A1 |
| A2 `restoreProjectBackup` | Escribe poco en BD, pero escribe | Provocar conflicto durante una restauración |
| B2 `manejarFalloFatal` | Le añadimos `bloquearEscrituras('comprometido')` | Verificar que tras el fail-stop **ninguna** escritura pasa, ni las internas |
| `setMeta` (ya atómico) | Una sola sentencia → una sola generación | Sin cambios esperados |
| `projects:reorder` | N escrituras seguidas = N generaciones | Correcto pero ruidoso; se acepta |
| Modo degradado (§5.b) | Que bloquee de más y el usuario no pueda trabajar | Margen de reintento + recuperación automática; probar corte y vuelta |
| Versiones mezcladas | Otro PC con 2.0.55 escribe sin tocar `.gen` | Caso 8 de §6.1; simular escribiendo el `.sqlite3` por fuera |
| `ultimaImagenConfirmada` | Un buffer que cambie bajo nuestros pies invalidaría la restauración de §2.c | Prueba 26: forzar reutilización del heap de sql.js y comparar byte a byte |
| Resolución de conflicto | Que el estado cambie mientras el usuario decide | Prueba 25: revalidación de §7.c |
| **Camino rápido (§6.1.a)** | Es el atajo del 99,9 % de las escrituras: si deja fuera un caso, ese caso no existe | Pruebas 27-29. La 28(c) fija por escrito el hueco que **sí** queda |
| **`stat` por escritura** | Un `stat` lento en `G:` penalizaría cada escritura | Prueba 29, medido en local y en Drive |
| **Precedencia (§6.1.b)** | Una autorreparación mal disparada escribiría sobre datos ajenos | Pruebas 30-32, incluida la variante que el usuario describe |
| **`fsync` (§4.b)** | Coste en la ruta caliente; y en `G:` puede no significar nada | Pruebas 36-37 (que se llama y que su fallo no rompe) y **40 (coste medido)** |
| **Durabilidad tras corte de luz** | Es el único escenario que destruye en vez de conservar dos versiones | Pruebas 38-39. Un `.sqlite3` de ceros **no** puede pasar por instalación nueva |
| `getDb()` con BD ilegible | Crear una base de datos vacía encima sería la peor reacción posible | Prueba 38: no se escribe nada, latch `'bd-ilegible'` y diálogo con rutas |
| Renderers / preloads | — | **No se tocan** |

---

## 10. Que el mecanismo no pueda bloquear ni corromper la app

- **Interruptor de desactivación** en la carpeta de configuración **local**
  (`%APPDATA%\panorama-app-config\sin-control-de-generacion`). Local a
  propósito: tiene que funcionar precisamente cuando la carpeta compartida es
  el problema. Con él presente, `run()` se comporta exactamente como hoy.
- **Segundo interruptor, independiente del anterior**:
  `%APPDATA%\panorama-app-config\sin-fsync` (§4.b), **desactivado por defecto**.
  Separado a propósito: si el `fsync` resultara caro en Drive, quiero poder
  quitarlo **sin** apagar también la detección de conflictos. Su presencia se
  registra en `app.log` en cada arranque, con la garantía rebajada por escrito.
- **La comprobación es solo de escritura.** `get`/`all` no la tocan, así que no
  puede impedir arrancar ni leer. La única excepción deliberada es
  `'bd-ilegible'` (§4.b): ahí el problema no es el mecanismo, es que la base de
  datos no existe como tal, y arrancar "normalmente" sería peor.
- **Su modo de fallo es dejar de escribir**, nunca escribir mal.
- **Errores tipados** (`ErrorDb` con `kind: 'io' | 'conflicto' | 'testigo' |
  'bloqueado' | 'ilegible'`), para que B2 pueda tratarlos por clases y no
  confunda un conflicto con un error de programación.
- Todo el código nuevo del `.gen` va envuelto en `try/catch`: un fallo del
  mecanismo se degrada según §5, nunca lanza hacia arriba sin clasificar.

---

## 11. Plan de pruebas

Mismo método: bloque real extraído y ejecutado contra directorios temporales,
más ejecución real aislada.

**Numeración y flujo normal**
1. Generación monótona en 100 escrituras; `.gen` y `app_meta` siempre de acuerdo.
2. `.gen` escrito de forma atómica (nunca se observa un `.gen` a medias).
3. `getDb()` inicializa la generación en una base de datos sin `db_generation`.

**Las cuatro ventanas de corte "limpias" de §4** — para cada una: reparación
silenciosa, **cero conflictos falsos**, y la base de datos entera y legible.
Las dos ventanas de corte **sucias** que añade §4.b (pérdida de datos no
sincronizados y pérdida del `rename`) son las pruebas 38 y 39.

4. Corte antes del paso 6.
5. Corte entre el 6 y el 7.
6. Corte durante el 7.
7. Corte entre el 7 y el 8.

8. **Los nueve casos de §6.1** — una prueba por caso (0 a 8), comprobando que
   cada uno recibe su clasificación y su mensaje, y que los casos **1, 2, 6 y 7
   NO** se tratan como conflicto.

**Fallo de `persist()` con la memoria ya modificada (§2.c)** — pedidas expresamente
9. **`persist()` falla después de que el SQL modificó la memoria**: el llamante
   recibe error; la imagen en memoria vuelve **exactamente** a la última
   confirmada; una escritura POSTERIOR que sí funcione **no arrastra** la
   operación fallida a disco (se comprueba consultando la fila que la operación
   habría creado: no debe existir ni en memoria ni en disco).
10. **`persist()` falla después de escribir el `.gen`**: además de lo anterior,
    el `.gen` queda en N+1 con `writer = yo` y la comprobación siguiente lo
    clasifica como "mi escritura interrumpida" y lo repara **sin conflicto
    falso**; la app sigue escribiendo con normalidad después.
11. Fallo del `rename` del `.sqlite3` (no solo del `writeFileSync`): mismo
    resultado.
12. Si la restauración de la imagen fallara → `escrituraBloqueada =
    'desincronizada'` y ninguna escritura posterior pasa.

**Conflicto real**
13. Dos "instalaciones" con ids distintos sobre la misma carpeta: la segunda
    detecta, **no ejecuta el SQL**, vuelca el archivo de conflicto y latchea.
14. **Resolver con "usar disco"**: la imagen activa pasa a ser la del disco, el
    latch se levanta, el lanzador se refresca, y **nuestra versión sigue
    existiendo** en `.conflicto-<equipo>-…` y abre como base de datos válida.
15. **Resolver con "conservar lo mío"**: se escribe nuestro contenido con
    `parent_commit_id === C_disk` (§7.b paso 4) **y la versión del otro equipo
    queda en `.conflicto-otro-<writer>-…`**. Se comprueba que los **dos**
    archivos existen, tienen contenido distinto entre sí y ambos abren con
    sql.js. El encadenado en sí lo verifica la prueba 33.
16. **Si la copia de resguardo del paso previo falla, NO se sobrescribe nada** y
    el conflicto sigue sin resolver.

**Políticas de §5**
17. Carpeta local con `.gen` ilegible → sigue escribiendo (fallar en abierto).
18. Carpeta compartida con `.gen` ilegible → modo degradado, la app sigue
    usable para leer, y se recupera sola al volver el `.gen`.
19. **Ubicación no reconocida / estado desconocido**: `location.json` sin campo
    `shared`, con `shared` no booleano, o ilegible → se clasifica
    **DESCONOCIDA** y recibe la política de COMPARTIDA (fail-closed), **no** la
    de local. Se comprueba también que una ruta con indicios de nube
    (`Mi unidad`, `OneDrive`, UNC, unidad de red) se clasifica COMPARTIDA
    **aunque** `location.json` diga `shared:false`.
20. Corte de Drive simulado → no se clasifica como conflicto; al volver, si otro
    escribió, sí.

**Concurrencia e identidad de commit (v4)** — pedidas expresamente
21. **DOS PCs PARTIENDO DE N QUE PRODUCEN DOS N+1 DISTINTOS.** Dos
    "instalaciones" con `installation-id` distintos leen el mismo commit X /
    generación N y ambas escriben generación N+1 con `commit_id` distinto.
    Se comprueba que la segunda en volver a escribir **detecta la bifurcación
    pese a que el número de generación coincide** (caso 3 de §6.1: mismo
    `parent_commit_id`, `commit_id` distinto), **no ejecuta el SQL**, y ambas
    versiones quedan en disco.
22. `.gen` y BD con `commit_id` distintos → se clasifica como incoherencia
    (caso 0), nunca como "coherente por llevar el mismo número".
23. **Descendencia lineal**: el otro equipo hace 1 y luego 5 commits seguidos
    sobre el nuestro → se adopta **en silencio**, sin diálogo (caso 1, usando el
    historial). Con más de 20 commits, cae a conflicto conservador y se
    comprueba que el mensaje lo explica.
24. **Intención abandonada (§6.2)**: `.gen` de otro writer adelantado con la BD
    sin llegar → modo solo lectura y espera acotada. Se comprueba que **SIEMPRE
    se pregunta** y que **nunca hay abandono automático**, ni siquiera con un
    `.gen` de hace una semana: con más de 24 h solo cambia el texto. Variantes
    con `at` en el futuro (reloj del otro PC adelantado) y con `at` de hace
    días: en las dos, se pregunta. El `.gen` original queda copiado como
    `.abandonado-…` y **nada se borra**. Si la escritura del otro llega después,
    se trata como conflicto normal.
25. **Revalidación al resolver (§7.c)**: se detecta un conflicto, y **antes de
    que el usuario elija** otro equipo escribe otra vez. Al elegir cualquiera de
    las dos opciones, la resolución **no se aplica**, se conserva también la
    tercera versión y se vuelve a clasificar.
26. **Copia inmutable (§2.c)**: tras un `persist()` correcto, se fuerza a sql.js
    a reutilizar su heap y se comprueba que `ultimaImagenConfirmada` **no ha
    cambiado ni un byte**; y que restaurar desde ella produce una base de datos
    idéntica a la que hay en disco (comparación byte a byte).

**Camino rápido, precedencia, encadenado y durabilidad (v4 rev. 3)** — pedidas
expresamente

27. **El camino rápido NO se salta el caso 8 (§6.1.a).** Una "versión antigua"
    (se simula escribiendo el `.sqlite3` por fuera, sin tocar el `.gen` ni
    `db_commit_id`) deja `C_file === C_disk === C_mem`. Se comprueba que en
    carpeta COMPARTIDA la escritura siguiente lee los bytes, ve `F_disk ≠ F_mio`
    y clasifica **caso 8** (regla A1b), **no** descendencia. Con la regla v4
    rev. 2 esta prueba **falla**: es la prueba de regresión del agujero.
28. **`C_mem ∈ H_disk` no puede cumplirse trivialmente.** Mismo commit y bytes
    distintos: se comprueba que la clasificación sale por A1b (caso 8) y **nunca
    llega a A2**, porque `H_disk` contiene su propio commit y sin la salida
    previa de A1 daría "descendencia legítima". Complementaria: mismo commit y
    **mismos bytes** con `mtime` cambiado a mano (`fs.utimesSync`) → **no es
    conflicto**, se refresca `S_mio` y se sigue.
29. **A5 es alcanzable.** Se construye un estado que no cumple A1, A2, A3 ni A4
    y se comprueba que cae en A5 (caso 5) y no en ninguna regla anterior. En la
    rev. 2, con A4 = "resto", este estado salía por A4: prueba de regresión del
    orden de evaluación.
30. **LA SECUENCIA DEL USUARIO (§6.1.c), que la rev. 2 no detectaba.**
    (a) una versión antigua modifica la BD conservando tamaño y `mtime`;
    (b) **nuestra app hace una escritura ANTES de cualquier comprobación
    periódica**; (c) se comprueba qué pasa. Con la política LOCAL (atajo por
    `stat`) el cambio externo **se pierde y no queda evidencia** — y la prueba
    lo afirma explícitamente, porque es el límite conocido. Con la política
    COMPARTIDA (verificación de bytes) el cambio **se detecta antes de escribir**
    y las dos versiones quedan en disco. Esta prueba es la que justifica que en
    carpeta compartida no haya atajo.
31. **Precedencia: el disco divergido gana a la autorreparación (§6.1.b).**
    Nuestra intención `Y` queda adelantada en el `.gen` (`W_file === W_yo`,
    `P_file === C_mem`) y **mientras tanto otro equipo escribe `Z`**. Se
    comprueba que **NO hay reparación silenciosa** y que no se escribe nada
    encima de `Z`. Tres variantes: `Z` descendiente de lo nuestro (→ recarga
    silenciosa legítima, si `dirty` es falso), `Z` divergente (→ conflicto), y
    `Z` con el mismo `commit_id` que esperábamos pero otros bytes (→ conflicto
    por A1b, no reparación).
32. **Las CUATRO condiciones de la reparación silenciosa (B1)**: se rompe cada
    una por separado —`W_file`, `P_file`, `C_disk === C_mem`, y
    `F_disk === F_mio`— y en las cuatro el resultado es "no reparar".
33. **Paso 0 con la bandera `dirty`, no con una igualdad (§2.d).** Dos partes:
    (a) **La igualdad no basta**: se detiene la ejecución entre el paso 3 y el 7
    de `run()`; ahí la memoria ya está modificada y `C_mem` **todavía coincide**
    con el commit de `ultimaImagenConfirmada`. Se comprueba que una regla basada
    en esa igualdad concluiría "no hay cambios pendientes" —que es falso— y que
    `dirty === true` sí lo detecta.
    (b) **Efecto**: con `dirty === true` y una descendencia lineal legítima
    entrante, **no** hay recarga silenciosa; se abre el modal.
34. **Los tres fallos de §2.d, separados.**
    (a) fallo **antes** del `rename` → disco intacto, memoria restaurada,
    `dirty === false`, `ErrorDb('io')` con `aplicado: false`, y **reintentar no
    duplica**;
    (b) `rename` **completado** y fallo en el `stat`/hash/bookkeeping → **la
    memoria NO se restaura**, la operación está en disco, el llamante recibe
    `aplicado: true`, y se comprueba que **un reintento del mismo `INSERT`
    duplicaría la fila** — por eso el contrato lo prohíbe;
    (c) fallo **al restaurar** la memoria → `escrituraBloqueada =
    'desincronizada'`, `dirty` sigue en `true`, ninguna escritura posterior pasa.
35. **"Conservar lo mío" encadena sobre `C_disk` (§7.b).** Se comprueba que
    `parent_commit_id` del commit nuevo **es exactamente `C_disk`** y que su
    historial contiene `H_disk`. Y después, con una **tercera** instalación, los
    tres casos de la tabla de §7.b: partiendo de `C_disk` → caso 1, adopción
    silenciosa; partiendo de la rama descartada → **conflicto**; con trabajo
    propio divergente → **conflicto**. La adopción silenciosa **no** se
    generaliza a cualquier tercer equipo.
36. **"Conservar lo mío" con `.gen` y BD incoherentes**: en el momento de
    resolver, `C_file ≠ C_disk`. Se comprueba que **no se sobrescribe nada**,
    que se resuelve primero la incoherencia y que después la resolución sí se
    puede aplicar.
37. **Revalidación por bytes, no solo por ids (§7.c)**: entre detectar y
    resolver, otro equipo escribe bytes distintos **manteniendo los mismos
    `commit_id`**. Se comprueba que la revalidación lo detecta por `F_disk` y
    no aplica la resolución.
38. **Preservación verificada por hash**: la copia del paso 3 de §7.b se compara
    por `sha256`, no solo por tamaño. Se inyecta una copia truncada y se
    comprueba que la resolución se aborta.

**Escritura atómica y durabilidad (§4.b, §4.c)**

39. **Bucle de `writeSync` con escritura parcial**: se instrumenta `writeSync`
    para que devuelva la mitad de los bytes, y luego para que devuelva `0`. En
    el primer caso el bucle completa la escritura; en el segundo lanza, **no se
    hace `rename`**, la BD activa no cambia y el temporal se conserva como
    `.tmp-fallido-<fecha>`.
40. **`fsync` con fallo REAL vs. no soportado.**
    (a) `EIO` / `ENOSPC` / `EROFS` → **es un fallo**: se lanza, **no hay
    `rename`**, la BD activa no se toca, y NO se marca ninguna garantía como
    rebajada;
    (b) `EINVAL` / `ENOSYS` / `ENOTSUP` / `EOPNOTSUPP` → se considera no
    soportado: la escritura **se completa**, se registra **una sola vez** por
    ubicación y la rebaja queda anotada en `app.log`.
    La diferencia entre (a) y (b) es el punto que la rev. 2 no hacía.
41. **`fsync` solo donde toca**: se instrumenta `fs.fsyncSync` y se comprueba
    que se llama para el `.sqlite3` y **no** para el `.gen`, y siempre **antes**
    del `renameSync` correspondiente.
42. **Corte de corriente con pérdida de datos no sincronizados**: el `rename`
    ocurrió pero el contenido es basura (ceros, truncado, bytes aleatorios). Al
    arrancar: `integrity_check` falla o falta `db_commit_id` →
    `escrituraBloqueada = 'bd-ilegible'`, **no** se crea una base de datos
    vacía, **no** se escribe nada. Se comprueba explícitamente que **un
    `.sqlite3` de ceros no se confunde con una instalación nueva**.
43. **Corte con pérdida del `rename`** (el hueco que queda incluso con `fsync`):
    sobrevive el `.sqlite3` viejo íntegro y un `.tmp-<pid>` huérfano → caso 2,
    reparación silenciosa.
44. **CONSERVACIÓN ANTES DE LIMPIAR (§4.c).** Prueba de regresión sobre
    `db.js:34-41`, que **hoy borra todos los `.tmp-*` al arrancar**: se
    comprueba que un `.tmp-<pid>` que abre, pasa `integrity_check` y cuyo
    `db_commit_id` **no** está en `H_disk` **NO se borra**, sino que se renombra
    a `.tmp-huerfano-<fecha>`. Y que el diálogo de recuperación presenta en
    listas separadas las **copias completas** y los **testigos**
    (`.gen.abandonado-…`, `.gen.interrumpido-…`), que no son bases de datos.
45. **Coste, ya medido** — ver §13. Se repite dentro de la suite como regresión,
    con umbral: si el ciclo local con `fsync` supera 15 ms de p95 o el de Drive
    supera 150 ms, la prueba avisa.

**Integración con A1, A2, B2 y los flujos existentes** (dependencias de §14)

46. Fail-stop de B2 → **ninguna** escritura pasa, incluidas las internas y
    **`vacuum()`**, que hoy no tiene guarda en `main.js:844`.
47. **Ningún camino levanta el latch `'comprometido'`**: se intenta levantarlo
    desde la recuperación de Drive, desde la resolución de conflicto y desde los
    dos interruptores. En los tres, sigue bloqueado.
48. **Recuperación de rekey de A1 con escrituras bloqueadas**: se provoca un
    conflicto y se arranca con un journal de rekey pendiente (`main.js:5963`,
    antes del login). Se comprueba el orden acordado en §14 y que **la sal y el
    verificador nunca quedan a medias**.
49. Conflicto durante una restauración de A2.
50. **Coherencia de Seguridad al adoptar otra BD**: tras `recargarDesdeDisco()`
    con una BD cuya `security_salt`/`security_verifier` son distintas, se
    comprueba que `securityKey` se revalida y que, si no encaja, se fuerza el
    login en vez de seguir con una clave que ya no deriva nada.
51. **P8 — borrado de archivos antes del `DELETE` (`main.js:3253-3269`)**: se
    provoca un conflicto que rechaza el `dbmod.run` del paso 3268 y se comprueba
    el comportamiento acordado en §14 (no debe quedar un proyecto con las filas
    intactas y los archivos borrados).
52. **Imposible preservar nuestra imagen**: falla la escritura del
    `.conflicto-…` tanto en la carpeta de datos como en la local. Se comprueba
    que **"usar disco" queda deshabilitado** y que la única salida es "decidir
    luego".
53. Interruptor de desactivación → comportamiento idéntico al actual.
54. Re-ejecución de las cinco suites (56 · 98 · 23 · 64 · 84).
55. Ejecución real aislada: arranque, crear/abrir/editar, y un conflicto
    provocado escribiendo el `.gen` por fuera con otro `writer`.


---

## 12. Lo que este diseño NO resuelve

Por honestidad, porque no ha cambiado desde el paso 0:

- **No impide** escrituras concurrentes entre PCs. Drive propaga con latencia y
  no arbitra nada. Esto **detecta** el conflicto en cuanto el `.gen` llega, y
  hace que el caso no detectado deje de ser silencioso.
- La ventana de latencia de Drive sigue existiendo: dos equipos que escriban
  casi a la vez pueden pasar los dos la comprobación.
- No cubre dos cuentas de Windows distintas en el mismo PC sobre la misma
  carpeta (eso es multi-PC a efectos prácticos, y aquí sí lo detectaría, que es
  el objetivo).

Y lo que añade la rev. 2, para que no quede escondido dentro de las secciones:

- **En carpeta LOCAL, el caso 8 puede pasar desapercibido.** Allí se mantiene el
  atajo por `stat`, y una reescritura externa del mismo tamaño con el `mtime`
  intacto no se detecta; si además escribimos nosotros antes de nada, esos bytes
  se pierden sin dejar evidencia (§6.1.c). Se acepta porque en carpeta local no
  hay otro PC posible y A3.1 cierra la segunda instancia — pero **no es cero**.
  Prueba 30 lo demuestra en vez de suponerlo.
- **En carpeta COMPARTIDA queda una ventana** entre nuestra verificación de
  bytes y nuestro `rename`. Una escritura ajena que caiga justo ahí no se
  detecta. Antes la ventana era permanente; ahora es del orden de la duración
  de una escritura. **Los "50-100 ms" son una referencia tomada de la media y
  el p95 de un ensayo de 200 iteraciones en un momento concreto, NO una cota
  garantizada**: el p99 ya fue de 124 ms, el máximo observado de 143 ms, y con
  Drive sincronizando o el disco ocupado puede ser mucho peor. No hay cota
  superior demostrable en un sistema de archivos en modo usuario.
- **Verificar antes de escribir detecta, no impide.** Esto no es exclusión mutua
  entre PCs y no lo será nunca con Drive de por medio.
- **La descendencia lineal solo se puede probar hasta 20 commits** (§6.1). Más
  allá, falso positivo conservador: un diálogo de más, nunca pérdida.
- **`fsync` no garantiza que el `rename` sea durable** (§4.b): en Windows no se
  puede sincronizar el directorio desde Node. El modo de fallo resultante es
  benigno (sobrevive la versión anterior), pero es un hueco real.
- **En `G:` la durabilidad es la que dé Drive**, no la que dé NTFS. No la puedo
  demostrar desde la aplicación y no la afirmo.
- **El coste del `fsync` ya está medido** (§13) y es asumible, pero **la
  durabilidad sigue sin demostrarse**: medir cuánto tarda `FlushFileBuffers` no
  dice nada sobre si los bytes llegaron al medio físico. Eso solo lo probaría un
  corte de corriente real, y no es algo que se pueda comprobar por software.
- **Hay cuatro cambios fuera de `db.js` sin los que A3.3 no se puede integrar**
  (§14.f). Uno de ellos, el borrado de proyecto (§14.d), haría que A3.3 dejara
  la aplicación **peor** que hoy si se implementara sin tocarlo.


---

## 13. Ensayo aislado de coste y compatibilidad (EJECUTADO)

**Único trabajo autorizado y ejecutado en esta ronda.** No se modificó código de
la aplicación, no se tocó `BD-PanoramaServicio` ni ningún dato real.

- **Runtime**: el Node incluido en nuestro Electron — `node 20.16.0`,
  Electron 30.5.1, `arm64`, invocado con `ELECTRON_RUN_AS_NODE=1`.
- **Equipo**: Snapdragon X 10-core X1P64100 @ 3,40 GHz, Windows 11 Pro 26200.
- **Carpetas exclusivas de prueba**, creadas y borradas por el propio script:
  `%TEMP%\_bench-a33-local` y `G:\Mi unidad\_bench-a33-tmp`. Borrado verificado
  al terminar (`existe todavía: false` en las dos).
- **Guarda de seguridad en el script**: cualquier ruta que contenga
  `bd-panoramaservicio` o `panorama.sqlite3` aborta la ejecución.
- **N**: 1.000 iteraciones en local (76 KB, 256 KB y 1 MB); **200** en Drive
  (76 KB). En Drive se redujo a propósito: 1.000 reescrituras generarían
  cientos de revisiones en el historial de versiones de la cuenta del usuario.
- Script: `scratchpad/bench-fsync.js`. Salida completa: `scratchpad/bench.txt`.

### 13.a Compatibilidad

| | Disco local | `G:` (Drive) |
|---|---|---|
| `fsync` del archivo (`FlushFileBuffers`) | **SOPORTADO** | **SOPORTADO** |
| Fallos en 1.200 llamadas | **0** | **0** |
| `fsync` del **directorio** | **NO — `EPERM`** | **NO — `EPERM`** |
| `writeSync` con escritura parcial | no observado | no observado |

Esto **confirma medido** lo que §4.b afirmaba por razonamiento: el `fsync` del
archivo se puede hacer y el del directorio no. La rama "fsync no soportado" del
código es defensiva y no se ha observado en este equipo.

### 13.b Coste — 76 KB, milisegundos

| Operación | Local media | Local p95 | Drive media | Drive p95 |
|---|---|---|---|---|
| `stat` del `.sqlite3` | 0,082 | 0,144 | 0,484 | 1,006 |
| Leer el `.gen` (~250 B) | 0,157 | 0,218 | 3,784 | 7,507 |
| `sha256` en memoria (`F_mio`) | 0,052 | 0,082 | 0,164 | 0,214 |
| **Leer el `.sqlite3` + `sha256` (`F_disk`)** | **4,509** | **7,088** | **17,732** | **26,591** |
| Escribir el `.gen` sin `fsync` | 0,799 | 1,251 | 23,064 | 52,775 |
| Escribir el `.gen` con `fsync` | 5,937 | 11,176 | 24,042 | 50,658 |
| Escribir la BD sin `fsync` | 0,734 | 1,183 | 25,494 | 54,501 |
| Escribir la BD con `fsync` | 4,204 | 9,258 | 26,230 | 54,048 |
| **Ciclo `run()` sin `fsync`** | **1,653** | **2,579** | **52,289** | **98,730** |
| **Ciclo `run()` con `fsync` en ambos** | **11,087** | **17,443** | **53,077** | **103,055** |

Crecimiento con el tamaño, en local: ciclo con `fsync` = 11,1 ms a 76 KB,
16,1 ms a 256 KB, 22,9 ms a 1 MB.

### 13.c Qué decidió cada número

1. **El `stat` es barato incluso en Drive** (0,48 ms frente a los 3,78 ms que ya
   cuesta leer el `.gen` allí). El atajo de §6.1.a en carpeta local se queda.
2. **Verificar los bytes cuesta +34 % en Drive** (17,7 ms sobre 52,3), no el
   coste prohibitivo que supuse. **Por eso §6.1.c pasa a verificar bytes en cada
   escritura compartida** y se retira la comprobación periódica del watchdog,
   que no daba la garantía que decía dar. Esta es la corrección que más cambia
   el diseño, y la ha decidido la medición, no una opinión.
3. **El coste del `fsync` es por llamada, no por bytes**: 5,94 ms para 250 bytes
   y 4,20 ms para 76 KB, en local. **Por eso se hace `fsync` solo del
   `.sqlite3`**, cuya pérdida destruye, y no del `.gen`, cuya pérdida es
   reparable. El sobrecoste local baja de 9,4 ms a ~3,5 ms.
4. **Mi estimación previa de "0,1–1 ms" en local era falsa** por un orden de
   magnitud: el `fsync` multiplica el ciclo por 6,7 si se aplica a los dos
   archivos. Sigue siendo asumible en términos absolutos (≈5 ms cada 15 s), pero
   la afirmación estaba mal y queda corregida.
5. **En Drive el `fsync` es casi gratis** (+0,8 ms sobre 52,3). **Lo único que
   eso demuestra es que la llamada vuelve rápido. No dice absolutamente nada
   sobre qué vacía internamente** el proceso de Drive, ni sobre si algo llegó al
   disco. Es un dato de coste, no de garantía, y ni siquiera es una pista fiable
   en un sentido ni en el otro.
6. **`projects:reorder` ya es lento hoy**: N escrituras seguidas. A3.3 lo
   empeora en local y poco en Drive. No lo crea, pero queda anotado.

**Y una corrección sobre "cada 15 s".** He repetido esa frase como si acotara
todas las escrituras, y no es cierto: `backup:save` es periódico, pero **hay
escrituras que no lo son** — el guardado final al cerrar una ventana, las
acciones manuales del usuario, y sobre todo las **acciones con varias
sentencias** (`projects:reorder` hace N escrituras seguidas;
`deleteProjectById` hace dos). En esos casos el coste se multiplica por el
número de sentencias y ocurre de golpe, no repartido. La conclusión sobre el
coste no cambia, pero la justificación "es cada 15 s" era floja y la retiro.

### 13.d Lo que este ensayo NO demuestra

- **No demuestra durabilidad ante un corte de alimentación.** Mide coste y
  compatibilidad. Que `FlushFileBuffers` devuelva éxito no prueba que los bytes
  estén en el medio físico, ni en NTFS con una caché de disco que mienta, ni
  desde luego en `G:`.
- **No mide contención real entre dos PCs**: es un solo proceso.
- Los buffers son bytes aleatorios de 76 KB, no bases de datos SQLite reales.
  Para coste de E/S y de hash es equivalente; para `integrity_check` no, y ese
  camino se prueba aparte (prueba 42).

---

## 14. Dependencias de integración — trazado contra el código actual

Respuesta a los cinco puntos, con función y línea. Se marca qué está
**verificado leyendo el código** y qué es **razonamiento** sobre él. Nada de
esto está probado en ejecución todavía.

### 14.a ¿Puede algo levantar o saltarse el bloqueo `'comprometido'` de B2?

**Verificado leyendo el código.** Hoy `procesoComprometido` vive solo en
`main.js` (declarado en `main.js:5149`, puesto en `main.js:5165`) con 11 guardas
repartidas. Dos agujeros concretos:

- **`vacuum()` no tiene guarda.** `maybeRunPeriodicVacuum()` llama a
  `dbmod.vacuum()` en **`main.js:844`** sin comprobar nada, y `vacuum()`
  (`db.js:239-243`) hace `db.run('VACUUM')` + `persist()` directo, sin pasar por
  `run()`. `setMeta` sí tiene guarda (`main.js:816`), pero se ejecuta **después**
  del `vacuum()`.
- **Escrituras internas alcanzadas desde una lectura**, que es lo que el
  comentario de `main.js:5147` ya reconoce como "cobertura ~95 %".

**Cómo queda cubierto:** el latch pasa a `db.js` (§3), y **`vacuum()` y
`persistirConGeneracion()` consultan el mismo latch que `run()`**. Con eso no
hay ningún camino de escritura que no pase por él.

**Y sobre levantarlo — regla explícita que añado al diseño:**

> `escrituraBloqueada = 'comprometido'` es **irreversible dentro del proceso**.
> Las funciones que levantan el latch (`recargarDesdeDisco`,
> `resolverConservandoLoMio`, la recuperación de Drive de §5.c y los dos
> interruptores) solo pueden levantar los motivos `'conflicto'` y
> `'degradado'`. Si el motivo es `'comprometido'`, `'desincronizada'` o
> `'bd-ilegible'`, **devuelven error y no lo tocan**. No es una lista de
> comprobaciones repartidas: es una única función `levantarLatch(motivo)` que
> rechaza esos tres motivos. Prueba 47.

### 14.b Conflicto durante la recuperación de rekey de A1

**Verificado.** `recoverInterruptedRekeyIfAny()` se llama en **`main.js:5963`**,
después de abrir la base de datos y **antes** de `runLoginFlow()` (5967),
precisamente porque la sal y el verificador contra los que se validará la
contraseña pueden depender de esa consolidación. Y `applyRekeyMeta()` escribe
`security_salt`, `security_verifier` y `security_enabled` con `setMeta`, o sea
`dbmod.run`.

**El problema es real:** si A3.3 rechaza esa escritura por conflicto, quedan
archivos ya cifrados con la clave nueva y una sal antigua en la base de datos.
**El usuario no podría entrar.** Es el peor resultado posible de A3.3.

**Retiro el "modo operación atómica" de la rev. 3.** Tienes razón: dejar de
comprobar el `.gen` entre varias escrituras **no las hace atómicas**. Lo único
que hace es que, si una falla a mitad, nadie se entere. Era una etiqueta
tranquilizadora sobre un problema sin resolver.

**Qué escrituras abarcaba realmente.** `applyRekeyMeta()` hace hasta **tres**
`setMeta` (`security_salt`, `security_verifier`, `security_enabled`) o hasta
tres `deleteMeta` en el modo `disable`. Con el `run()` actual eso son **tres
persistencias completas y tres generaciones**, no una. Un fallo en la segunda
deja la sal nueva con el verificador viejo: **imposible entrar**.

**Propuesta correcta: hacerlas de verdad una sola escritura.**

```
consolidarMetaRekey(sal, verificador, habilitado):
   1. comprobación de conflicto UNA vez (§6.1)
   2. dirty = true
   3. las TRES sentencias sobre la MISMA imagen en memoria, con
      ejecutarInterno() -- sin persistir entre ellas
   4. un solo commit nuevo, un solo .gen, un solo persist()
   -> una generación, una persistencia, un punto de confirmación
```

Es el mismo mecanismo del paso 5 de `run()` (§2), que ya aplica varias
sentencias a una sola imagen antes de exportar. No hace falta inventar un modo:
hace falta **una función de escritura múltiple** que `db.js` ya puede ofrecer.

**Flujo de recuperación al arrancar:**

```
1. abrir la BD. Si es ilegible -> latch 'bd-ilegible', parar. NO se toca el rekey.
2. ¿hay journal de rekey pendiente?
     NO -> arranque normal.
     SÍ -> 3.
3. comprobar conflicto (solo detección, sin escribir).
     CONFLICTO -> NO se ofrece el modal de tres salidas. Se para:
         "Hay un cambio de contraseña a medias en este equipo y otro equipo ha
          modificado los datos. Resuelve el conflicto antes de terminar el
          cambio de contraseña."
         La app queda en SOLO LECTURA. El journal SE CONSERVA, intacto.
         Los .old y .new del staging SE CONSERVAN. No se borra nada.
     SIN CONFLICTO -> 4.
4. terminar los renames de archivos (fase de A1, no toca la BD).
5. consolidarMetaRekey(...)  -> UNA escritura.
     Si falla: el journal SE CONSERVA y el staging TAMBIÉN. Se avisa. Al
     siguiente arranque se reintenta desde el paso 3. Es idempotente porque
     el journal guarda la sal y el verificador de destino.
6. solo tras el paso 5 confirmado: limpiar el staging (fase 5 de A1).
```

**Rekey en sesión (no recuperación):** igual, salvo que el paso 3 sí puede
ofrecer el modal, porque hay un usuario delante. Y una regla que faltaba:

> **El rollback de A1 NUNCA sobrescribe una rama ajena.** Si al deshacer un
> rekey la comprobación detecta un conflicto, el rollback **se detiene** y deja
> el staging y el journal intactos, en vez de escribir encima. Deshacer con
> datos de otro equipo por medio sería tan destructivo como completar.

Y el bloqueo fatal: **ninguno de estos pasos usa un camino que salte
`escrituraBloqueada`**. Todos pasan por `run()`/`escribirMultiple()`, y
`levantarLatch()` rechaza los tres motivos irreversibles (§3). Con
`'comprometido'` puesto, la recuperación de rekey **no se ejecuta**: se aplaza
al siguiente arranque, con el journal intacto.

**Nada de esto está implementado.** Queda propuesto, y necesita tu visto bueno.

### 14.c Coherencia de la Seguridad al adoptar otra base de datos

**Verificado, y es la dependencia más delicada.** El reparto actual:

| Dato | Dónde vive |
|---|---|
| `security_salt`, `security_verifier`, `security_enabled` | **En la base de datos** (`app_meta`) |
| Columnas `encrypted` de `backups`, `meeting_preps`, `candidate_evals` | **En la base de datos** |
| Los archivos cifrados de verdad | **En disco**, fuera de la base de datos |
| `securityKey` (clave derivada) | **En memoria** (`main.js:781`, asignada en 3018, 3499, 7244) |

Adoptar la base de datos de otro equipo **sustituye la sal, el verificador y
todos los flags `encrypted`, y no toca ni un archivo**. Refrescar el lanzador no
demuestra nada de esto: el usuario tiene razón.

**Lo que hay que hacer al final de `recargarDesdeDisco()`, propuesto:**

1. **Revalidar `securityKey`** contra la sal y el verificador nuevos:
   `securitymod.verifierFor(securityKey) === getMeta('security_verifier')`. Es
   una comparación en memoria, sin coste.
2. **Si no encaja** → `securityKey = null` y se fuerza el flujo de login con la
   nueva sal, avisando de que la configuración de Seguridad viene del otro
   equipo. **Nunca se sigue con una clave que ya no deriva nada**: con ella se
   escribirían archivos ilegibles.
3. **Si `security_enabled` cambia de estado** (activa ↔ inactiva) se avisa
   siempre, aunque la clave encajara.
4. **`looksEncrypted()` NO demuestra que el archivo se descifre con la clave
   nueva, y retiro la propuesta de la rev. 3.** Tienes razón: reconoce el
   *formato* (prefijo, JSON con los campos del sobre), no la *clave*. Corregir
   un flag basándose en él sería corregir por suposición, que es justo lo que no
   se debe hacer. **Regla nueva:**

   > Si el flag `encrypted` de una fila y el formato del archivo no
   > corresponden, **no se corrige el flag y no se sobrescribe el contenido**.
   > Se intenta descifrar y, si falla, la lectura devuelve un error claro
   > —*"este archivo no se puede leer con la contraseña actual; puede pertenecer
   > a otra configuración de Seguridad"*— con la ruta concreta. El archivo se
   > queda **exactamente como está**. Un flag que no cuadra es un síntoma para
   > el usuario, no algo que arreglar solos.

**Cuándo se bloquean los guardados: la coordinación exacta.** La pregunta de
"¿qué impide guardar con `securityKey = null` mientras `security_enabled` sigue
activo?" tiene hoy una respuesta incómoda: **nada**. `encryptIfNeeded()`
(`main.js:222`) cifra si `!!securityKey`, así que con la clave a `null`
escribiría **en claro** un archivo que debería ir cifrado. Secuencia obligada:

```
recargarDesdeDisco()  /  recarga silenciosa por descendencia:
   1. bloquearEscrituras('adoptando')        <-- ANTES de cambiar nada
   2. sustituir la imagen en memoria
   3. revalidar securityKey contra la sal/verificador NUEVOS
        encaja  -> 4
        no encaja o security_enabled cambió -> securityKey = null
                                               y SIGUE BLOQUEADO
   4. si sigue bloqueado: pedir la contraseña (flujo de login)
        acierta -> securityKey = la nueva ; levantarLatch('adoptando')
        cancela -> el latch NO se levanta: la app queda en SOLO LECTURA
   5. solo con el latch levantado se vuelve a permitir guardar
```

El motivo `'adoptando'` es levantable (como `'conflicto'`), pero **solo por el
paso 4**. Mientras esté puesto, **ninguna** escritura pasa — ni la que ya
estuviera en marcha, porque la comprobación va antes del SQL (§2).

**Y sí: la recarga silenciosa puede ocurrir dentro de un guardado que ya preparó
el archivo con la clave anterior.** El orden real de `backup:save` es *escribir
el archivo cifrado* → *insertar la fila*. Si la recarga se dispara en la
detección del `run()` de la fila, el `.json` ya está escrito con la clave vieja
y la fila se insertaría con un `encrypted` que se refiere a otra configuración.
**Regla:**

> Si al preparar una escritura de archivo había Seguridad activa, y **antes** de
> insertar su fila se produce una recarga que cambia la sal o el verificador, la
> operación **se aborta**: no se inserta la fila y el archivo recién escrito se
> conserva como huérfano registrado en `app.log`. **No se inserta una fila que
> describa mal su archivo.** El usuario reintenta ya con la configuración nueva.

Esto exige que la recarga silenciosa sea **visible para el llamante**, no
transparente: `run()` devuelve o lanza indicando "hubo recarga", y los cuatro
sitios que escriben archivo-antes-de-fila lo miran. Es un cambio pequeño pero
**no es cero**, y va en la lista de §14.f.

**Recomendación:** dado lo que hay en juego, propongo que **con la Seguridad
activada, "usar disco" exija siempre reintroducir la contraseña**, encaje o no
el verificador. Es una fricción pequeña en una operación rarísima, y elimina
toda esta coordinación del camino de "usar disco" (queda solo en la recarga
silenciosa, que es la que no puede pedir nada al usuario).

### 14.d P8 — archivos borrados antes del `DELETE` en la base de datos

**Verificado, y el riesgo es real.** `deleteProjectById()`
(**`main.js:3227-3271`**) hace, en este orden:

```
3253  fs.rmSync(backupsDirForProject(row), …)      <- borra la carpeta de backups
3258  fs.rmSync(projectDashboardDir(id), …)        <- borra el dashboard horneado
3264  await ses.clearStorageData()                 <- vacía la partición
3268  dbmod.run('DELETE FROM backups WHERE project_id=?')   <- PRIMERA escritura
3269  dbmod.run('DELETE FROM projects WHERE id=?')
```

**Sí: con A3.3, el rechazo por conflicto puede llegar en 3268, con los archivos
ya borrados.** Resultado: un proyecto que sigue apareciendo en el lanzador, con
sus filas intactas y todo su contenido borrado. Es **peor** que el estado actual
(donde el borrado siempre se completa), así que A3.3 no puede integrarse sin
tocar esto.

Mismo patrón, menos grave, en `migrateLegacyInlineBackupsToFiles()`: escribe el
archivo en **`main.js:3196`** y actualiza la fila en **3197**. Un rechazo ahí
deja un archivo suelto, que es aditivo y no destruye nada.

**La comprobación previa NO basta, y tienes razón.** Entre
`comprobarEscrituraPosible()` y el `DELETE` del 3268 hay: cerrar la ventana
(que es un `await` sobre el evento `closed`), tres borrados de disco y un
`await ses.clearStorageData()`. Eso puede durar **segundos**, no milisegundos. Si
el conflicto aparece durante esa espera, el rechazo llega con los archivos ya
borrados y estamos exactamente donde no queríamos. Justificarlo como "muy
improbable" no vale, y lo retiro.

**Secuencia acotada propuesta — conservar hasta confirmar, sin refactor general:**

**Y los dos `DELETE` tienen que ser UNA sola persistencia.** Con `run()` serían
dos commits, y entonces sigue existiendo un estado parcial: archivos apartados →
`DELETE FROM backups` confirmado → conflicto → `DELETE FROM projects` rechazado
→ la base de datos ha perdido las filas de backups y el proyecto sigue
existiendo. Es exactamente el mismo defecto una capa más abajo.

```
deleteProjectById(id):
  1. comprobarEscrituraPosible()            -> si no, abortar sin tocar nada
  2. cerrar la ventana (como hoy)
  3. APARTAR, NO BORRAR. Un solo rename por elemento, dentro de la MISMA
     carpeta de datos (así el rename es atómico y no copia bytes):
         <backups>          -> .papelera-<id>-<fecha>/backups
         <dashboard>        -> .papelera-<id>-<fecha>/dashboard
     La partición de Electron NO se toca todavía.

  4. dbmod.escribirMultiple([                        <-- UNA SOLA MUTACIÓN
       "DELETE FROM backups WHERE project_id=?",
       "DELETE FROM projects WHERE id=?",
     ])
     Las dos sentencias sobre la MISMA imagen en memoria, un commit, un .gen,
     UN SOLO rename del .sqlite3.        <-- PUNTO DE CONFIRMACIÓN, único

  5. SOLO si el paso 4 confirmó:
         ses.clearStorageData()
         borrar .papelera-<id>-<fecha>
     A partir de aquí, un fallo deja BASURA RECUPERABLE (una partición
     huérfana, una papelera sin borrar), nunca datos vivos destruidos.

  6. Si el paso 4 falla ANTES del rename (conflicto, io, lo que sea):
         la memoria ya está restaurada por el propio núcleo (§2.d caso a)
         DESHACER el paso 3 con los renames inversos
         devolver el error. EL PROYECTO QUEDA COMPLETO: filas Y archivos.

  7. Si además fallara el paso 6 (deshacer), no se insiste: se deja la
     papelera, se registra su ruta en app.log y se avisa al usuario con la
     ruta concreta. Nada se ha destruido.
```

Lo que compra: **entre el paso 3 y el paso 4 no se ha destruido nada**, solo
movido dentro de la misma carpeta; y el paso 4 **no puede quedar a medias**,
porque es una sola persistencia. El punto de no retorno es único y está en el
`rename` del `.sqlite3`. El `clearStorageData()` —el único paso realmente
irreversible, y además el más lento— se mueve **después** de la confirmación.

`escribirMultiple()` **está implementado y probado en el núcleo aislado**
(§15, sección 11 de la suite): dos `DELETE` producen una sola generación, y un
fallo anterior al `rename` deja el proyecto completo, filas y backups. La suite
incluye además el **contraste**: con dos `run()` separados sí queda el estado
parcial (`projects=1, backups=0`), que es lo que justifica el mecanismo.

**Integración en `main.js`: NO autorizada.** Aquí solo está el diseño y el
mecanismo probado en aislamiento.

`meeting:deletePrep`, al ser una fila y un archivo, sigue el patrón simple:
apartar → `DELETE` → borrar la papelera. No necesita escritura múltiple.

Coste: dos `rename` de más en el camino bueno (metadato, no bytes) y dos en el
malo. Para una operación manual es irrelevante.

**La prueba 51 debe provocar el conflicto DESPUÉS de la comprobación inicial**,
durante la espera del paso 2/3 — no antes de empezar. Probarlo solo antes no
cubre nada.

### 14.d.1 Reconciliación con el inventario del paso 0

**Me equivoqué al decir "solo existen dos sitios".** El inventario
(`a3-3-paso0-inventario.md` §6.2 y §6.3) lista cinco, y yo mezclé dos categorías
que no son la misma cosa. Corregido, con la distinción que pides:

**A. CONTENIDO DESTRUIDO — borran en disco antes de tocar la fila.** Un rechazo
deja datos irrecuperables y filas que apuntan a la nada:

| Sitio | Líneas | Qué se pierde |
|---|---|---|
| `deleteProjectById` | `main.js:3253-3269` | Toda la carpeta de backups, el dashboard horneado y el `localStorage` del proyecto. **El peor caso de todos** |
| `meeting:deletePrep` | `main.js:6586` → `6592` | El `.json` de una preparación de reunión. Queda la fila apuntando a un archivo que ya no existe |

**B. ARCHIVO HUÉRFANO RECUPERABLE — escriben en disco antes de insertar la
fila.** Un rechazo deja un archivo de más, sin fila. **Nada se destruye**; el
contenido anterior sigue intacto y el huérfano es basura, no pérdida:

| Sitio | Líneas | Qué queda |
|---|---|---|
| `backup:save` | `main.js:7030…` | Un `.json` de backup sin fila. Se acumula con los reintentos de 15 s |
| `meeting:savePrep` | `main.js:6471…` | Un `.json` de preparación sin fila |
| `migrateLegacyInlineBackupsToFiles` | `main.js:3196` → `3197` | Un `backup_legacy_*.json` sin actualizar su fila |

**C. YA CORRECTO** — y conviene decirlo porque es el patrón bueno: la poda de
backups (`main.js:7105` borra la fila, `7108` borra el archivo) hace las cosas
en el orden seguro. Un rechazo deja el archivo, no lo pierde.

**Alcance que propongo, en consecuencia:** la secuencia acotada de arriba se
aplica **solo al grupo A**, que es donde hay destrucción. El grupo B se queda
como está: A3.3 hace sus huérfanos algo más probables, pero no cambia la
naturaleza del problema, que ya estaba en el inventario como mantenimiento
(punto 4 de su recomendación de orden) y **no es una regresión de A3.3**.
`meeting:deletePrep` es mucho más simple que `deleteProjectById` — un solo
archivo — así que ahí basta con renombrar a `.papelera-<fecha>` antes del
`DELETE` y borrar después.

### 14.e Si no se puede preservar nuestra imagen en ningún sitio

**Regla que faltaba y que añado:**

> Si el volcado de nuestra imagen falla **tanto en la carpeta de datos como en
> la de configuración local** (§7, paso 2), **"usar lo que hay en disco" queda
> deshabilitado en el modal**, no solo desaconsejado. Descartar la única copia
> de nuestra versión sin haber podido guardarla en ningún sitio es
> destrucción de datos, y ninguna elección del usuario debería poder provocarla
> por descuido.
>
> Quedan disponibles: **"conservar lo mío"** (que sí preserva la del disco,
> §7.b) y **"decidir luego"** (solo lectura). Y el modal dice por qué la tercera
> opción está gris, con la ruta y el error concretos.

Prueba 52.

### 14.f Resumen: qué hay que tocar fuera de `db.js`

Alcance mínimo para integrar A3.3 con seguridad, **nada más**:

| Archivo / punto | Cambio | Por qué es imprescindible |
|---|---|---|
| `db.js:34-41` | La limpieza de `.tmp-*` deja de ser incondicional (§4.c) | Hoy puede borrar la única copia superviviente |
| `main.js:844` (`vacuum`) | *(ninguno)* | Lo cubre el latch en `db.js` |
| `main.js:3227` `deleteProjectById` | Secuencia "apartar → confirmar → borrar" (§14.d) | **Grupo A**: sin esto A3.3 deja la app peor que hoy |
| `main.js:6579` `meeting:deletePrep` | Igual, versión simple (un solo archivo) | **Grupo A** |
| `main.js:5963` recuperación de rekey | Orden de §14.b + `escribirMultiple()` para la meta | Evita quedarse sin poder entrar |
| `applyRekeyMeta` | 3 `setMeta` → **una** escritura múltiple | §14.b: hoy son 3 persistencias y 3 generaciones |
| `recargarDesdeDisco` (nueva) | Latch `'adoptando'` + revalidar `securityKey` | §14.c |
| Los 4 sitios de "archivo antes de fila" | Detectar que hubo recarga y abortar | §14.c, no insertar una fila que describe mal su archivo |
| Sitios que reintentan tras un `ErrorDb` | Mirar `aplicado` / `accionAplicada` | §2.d caso (b) y §14.g |

**Grupo B del inventario** (`backup:save`, `meeting:savePrep`, la migración):
**sin cambios**. Solo generan huérfanos, que ya estaban en el inventario como
mantenimiento y no son una regresión de A3.3.

Renderers, preloads y plantillas: **sin cambios**. Contratos IPC: ver §14.g —
hay uno que sí hay que tocar, mínimamente.

### 14.g `aplicado` para la ACCIÓN completa, y cómo llega al consumidor

**Dos cosas mal en la rev. 3, las dos que señalas.**

**(1) `aplicado` describía una persistencia, no una acción.** El ejemplo es
exacto: `projects:create` hace un `INSERT` que confirma y después un `UPDATE`
que falla antes de su `rename`. Ese segundo error sale con `aplicado: false`
—correcto para *esa* sentencia— y el proyecto **ya existe**. Reintentar la
acción completa crearía un segundo proyecto.

Hacen falta **dos campos, no uno**:

| Campo | Significado | Quién lo pone |
|---|---|---|
| `aplicado` | ¿esta sentencia llegó a disco? | `db.js`, según el punto de confirmación |
| `accionAplicada` | ¿alguna sentencia **anterior de esta misma acción** llegó a disco? | El envoltorio de acción |

Y para eso `db.js` ofrece un ámbito explícito, porque solo el llamante sabe
dónde empieza y acaba una acción:

```
dbmod.accion('projects:create', () => {
    const id = dbmod.run('INSERT ...');
    dbmod.run('UPDATE ...');
    return id;
});
```

`accion()` cuenta las escrituras confirmadas dentro de ella. Si algo lanza y el
contador es > 0, marca `accionAplicada = true` en el error. **No es una
transacción y no lo llamo así**: no deshace nada. Solo permite decir la verdad
sobre si la acción quedó a medias, que es lo que hace falta para no duplicar.

**(2) Añadir una propiedad a `ErrorDb` NO la transporta por IPC.** Tienes razón
y era un descuido: `ipcMain.handle` serializa el rechazo con el algoritmo de
clonado estructurado, que para un `Error` conserva `message`, `name` y `stack`
—**las propiedades propias añadidas no llegan al renderer**. Un `throw` desde el
handler llega al renderer como un `Error` con el mensaje envuelto y nada más.

**Se resuelve en `main.js`, sin tocar el contrato de los IPC que ya devuelven
objeto.** Es la mayoría: `meeting:savePrep`, `projects:delete` y compañía ya
devuelven `{ok:false, error:'…'}`. Basta con añadir un campo:

```js
catch (e) {
  return { ok: false, error: mensajeDe(e),
           puedeReintentarse: !(e.aplicado || e.accionAplicada) };
}
```

`puedeReintentarse` es **aditivo**: un renderer que no lo mire se comporta como
hoy.

**La excepción es `backup:save`**, que hoy devuelve un **booleano** pelado
(`main.js:7033` devuelve `false`) y el renderer reintenta a los 15 s. Ahí no
cabe un campo. **Cambio mínimo propuesto: que devuelva `{ok, puedeReintentarse}`
en vez de un booleano**, y que el renderer lo lea con un valor por defecto
compatible (`typeof r === 'boolean' ? r : r.ok`). Es el único contrato IPC que
cambia, y es el que más falta hace, porque es el único con **reintento
automático**.

**Y una corrección sobre `backup:save`:** dije que era idempotente "porque
escribe un backup nuevo cada vez". **Eso no es idempotencia, es lo contrario.**
Cada reintento **añade una fila** y empuja la poda de `BACKUP_KEEP`
(`main.js:7099-7114`), de modo que unos cuantos reintentos pueden expulsar
backups buenos. Retiro esa afirmación.

Pruebas necesarias, y ninguna existe todavía: **una del recorrido real
main→renderer** (que `puedeReintentarse` llega de verdad al renderer, no solo
que `main.js` lo pone) y **otra de fallo en la segunda sentencia tras confirmar
la primera**, comprobando que la acción no se repite.



---

## 15. Núcleo aislado — IMPLEMENTADO Y EJECUTADO

Segundo y último trabajo autorizado de esta ronda. **No es `db.js`, no se
conecta con la aplicación y no sustituye nada.** Vive en
`scratchpad/nucleo-a33/` y trabaja solo sobre carpetas temporales.

- `nucleo.js` — el núcleo (~470 líneas).
- `test-nucleo.js` — la suite (~430 líneas).
- `resultados-nucleo.txt` — la salida completa de la ejecución.
- Runtime: el Node de nuestro Electron (`node 20.16.0`, Electron 30.5.1, arm64).
- Imágenes **SQLite reales**, con el `sql.js` del propio proyecto.

### 15.a Qué implementa

| Componente autorizado | Dónde | Estado |
|---|---|---|
| Clasificación de estados | `clasificar()`, función **pura** | Completo: A1a/A1b, A2..A5, B0..B3, caso 7 |
| Escritura del temporal, sincronización y confirmación | `escribirAtomico()` | Completo, con bucle de `writeSync` y lista cerrada de códigos |
| Restauración de memoria ante fallo anterior al `rename` | `run()` caso (a) | Completo, con el caso (c) encadenado |
| Bloqueo irreversible por fallo fatal | `bloquearEscrituras()` / `levantarLatch()` | Completo |
| *(no autorizado)* modos de rekey, adopción de Seguridad, borrados | — | **No implementados a propósito** |

`fsync` en **los dos** archivos, como se pidió (§4.b).

### 15.b Resultado

```
NÚCLEO A3.3 — 112 OK, 0 FALLOS
```

Con dos hallazgos que salieron de ejecutar, no de razonar:

**1. Al núcleo le faltaba el camino de la recarga silenciosa.** El primer pase
dio 3 fallos. Uno era real: la clasificación devolvía `recarga` (caso 1,
descendencia estricta) y `run()` no tenía rama para eso, así que lo trataba como
motivo de bloqueo. Resultado: **un conflicto falso ante una descendencia
perfectamente legítima**. El diseño describía la recarga en §7 como una
resolución de conflicto y nunca dijo que hiciera falta también en el camino
normal de `run()`. Corregido en el núcleo (paso 2b de §2) y en este documento.

**2. Dos de mis pruebas estaban mal planteadas** y por eso fallaban:

- La de "bifurcación" no producía una bifurcación: el segundo equipo nunca había
  escrito, así que era **descendencia lineal**, y lo correcto era exactamente lo
  que hacía el núcleo. Reescrita para que los dos equipos escriban desde el
  mismo padre; ahora sí produce dos commits hermanos y sí se detecta el caso 3.
- La del límite de la carpeta local intentaba forzar el peor caso con
  `fs.utimesSync`, y **no se puede**: NTFS guarda 100 ns y `utimesSync` recibe
  milisegundos, así que el `mtime` restaurado difiere en la última cifra
  (`…834.837` frente a `…834.8374`) y el `stat` acaba detectando el cambio por
  accidente. El límite se demuestra ahora de forma determinista sobre la función
  pura, sin depender del sistema de archivos.

### 15.c Lo que queda DEMOSTRADO por ejecución

- **A5 es alcanzable** con el orden corregido (era el bug de la rev. 2).
- **`C_mem ∈ H_disk` no se cumple trivialmente**: con el mismo commit y bytes
  distintos sale caso 8, no descendencia.
- **Un `mtime` distinto con los mismos bytes no es conflicto.**
- **Las cuatro condiciones de B1**: rota cualquiera de ellas, no se repara.
- **B0**: con el disco divergido no hay reparación silenciosa, aunque el `.gen`
  lleve nuestro `writer`.
- **Bifurcación N+1/N+1 con archivos reales**: se detecta antes de escribir, el
  disco no se pisa y la fila del segundo equipo no llega a disco.
- **Caso 8 con archivos reales**: una "versión antigua" que reescribe la base de
  datos sin tocar `db_commit_id`, y con el `mtime` devuelto a su valor, **se
  detecta en carpeta compartida** y su fila sobrevive.
- **`writeSync` parcial** se completa; **`writeSync` que devuelve 0** lanza, no
  hay `rename`, el archivo original queda intacto y el temporal se conserva
  como `.tmp-fallido-<fecha>`.
- **`fsync` con `EIO`** es un fallo: lanza y no hay `rename`. **`fsync` con
  `EINVAL`** es incompatibilidad: la escritura se completa y se marca la
  garantía como rebajada.
- **`fsync` ocurre siempre antes del `rename`.**
- **Caso (a)**: el disco no cambia, la memoria vuelve al commit confirmado,
  `dirty` a `false`, la fila fantasma no existe, y **una escritura posterior no
  la arrastra a disco**.
- **Caso (b)**: el bookkeeping se rehace releyendo; y si el disco fue pisado
  entre nuestro `rename` y la relectura, **se reclasifica en vez de adoptar** y
  el error sale con `aplicado: true`.
- **Caso (c)**: latch `'desincronizada'`, `dirty` sigue en `true`, irreversible,
  y ninguna escritura posterior pasa.
- **El latch fatal es irreversible**: no se levanta, y no se sustituye ni por un
  motivo no fatal ni por otro fatal.
- **BD ilegible** (ceros, truncada, basura, y una válida sin `db_commit_id`):
  `abrir()` lanza, latch `'bd-ilegible'`, **no se crea una base de datos vacía**
  y ninguna escritura pasa.
- **`ultimaImagenConfirmada`** coincide byte a byte con el disco y no la muta
  sql.js al seguir trabajando.
- Historial acotado a 20, generación monótona, 31 commits distintos en 30
  escrituras.

### 15.d Lo que este núcleo NO demuestra

- **No prueba nada sobre la aplicación real.** No está conectado.
- **No prueba durabilidad ante cortes de corriente**: los cortes se simulan
  manipulando archivos, no cortando la luz.
- **No cubre** rekey, Seguridad, borrados, resolución de conflicto con interfaz,
  ni el recorrido IPC main→renderer (§14.g).
- La recarga silenciosa implementada es **solo** la de descendencia estricta con
  `dirty === false`. La de §7 (resolución de conflicto) no está.
- **La huella local de §8.c.1 no está implementada**: es posterior al ensayo.

### 15.e Revisión de la rev. 4: seis defectos corregidos (rev. 5)

Todos encontrados leyendo el código del núcleo y sus pruebas, no ejecutándolo.
Dos de ellos eran **pruebas que no probaban nada**.

**1. La frontera del rollback empezaba demasiado tarde.** El `try` que restaura
empezaba en la persistencia, así que quedaban fuera `db.run` del usuario,
`last_insert_rowid()` y los cuatro UPSERT internos. Un SQL inválido podía dejar
`dirty === true` sin restaurar; un fallo en el tercer UPSERT podía dejar
`app_meta` parcialmente modificado en memoria. **Corregido**: la máquina de
estados de §2 con dos `try` explícitos, y la frontera marcada por `confirmado`.
Probado en los **ocho** puntos de fallo posibles (`sql`, `lastid`, `meta1`..`meta4`,
`gen`, `persist`) más SQL inválido real y violación de constraint real, y en
todos: disco intacto, memoria restaurada, `app_meta` intacto, `dirty === false`,
`aplicado === false`, sin latch, y **la escritura siguiente no arrastra nada
parcial** (la generación avanza exactamente 1 desde la última buena).

**2. La prueba de inmutabilidad era una tautología.** Comparaba
`Buffer.compare(antes, antes)`, que siempre da 0. **No demostraba nada y no debía
contar como evidencia.** Corregida: ahora se conserva **la referencia** al Buffer
que el núcleo guarda y **una copia snapshot** independiente, se fuerza actividad
para que sql.js crezca y reutilice su heap, y se compara referencia contra
snapshot. Además se comprueba que la imagen confirmada nueva es otro objeto con
otros bytes y que la antigua conserva los suyos.

**3. La prueba de "no se creó una base vacía encima" también era tautológica.**
Comparaba `statSync(p).size === statSync(p).size`. Corregida: se guardan bytes,
tamaño y SHA-256 **antes** de `abrir()`, y después se comprueba que el archivo
corrupto sigue existiendo con **el mismo SHA-256 y los mismos bytes exactos**,
que el `.gen` tampoco se tocó y que no aparecieron temporales. La propiedad que
importa no es que `abrir()` lance, sino que el mecanismo **no destruya un archivo
que puede tener valor forense o ser recuperable**. Comprobado para ceros,
truncado y basura.

**4. `reparar-gen` significaba una cosa en `clasificar()` y otra en `run()`.**
Se elige **la opción B, declarada explícitamente**: la escritura nueva sustituye
al testigo interrumpido, porque su commit se encadena desde `C_disk` (=== `C_mem`,
garantizado por las cuatro condiciones de B1). No hay un paso de reparación
aparte porque sería escribir el `.gen` dos veces para el mismo resultado.
**Pero el testigo adelantado se preserva** como `.gen.interrumpido-<fecha>` antes
de sustituirlo. Probado con el escenario exacto (`.gen` = Y padre X writer=yo,
BD = X, memoria = X, y después una escritura Z):

| Pregunta | Respuesta comprobada |
|---|---|
| `parent_commit_id` de Z | **X**, no Y |
| Qué ocurre con Y | Nunca existió como estado de la base de datos; no entra en el historial |
| Qué testigo queda | `.gen.interrumpido-<fecha>` con Y, su padre X y su writer |
| ¿Rama falsa? | No: `.gen` y BD quedan en Z, y Y no aparece en `H_disk` |
| ¿Se pierde algo? | No: la fila anterior sigue, y la de la escritura interrumpida nunca llegó a existir |

**5. El documento tenía dos definiciones de `bloquearEscrituras()`.** La segunda
—`{ escrituraBloqueada = motivo; }`— destruiría el fail-stop de B2 si alguien la
copiara. **Eliminada** (§3).

**6. Los dos `DELETE` de `deleteProjectById` eran dos commits.** Con eso seguía
existiendo un estado parcial: archivos apartados, `DELETE FROM backups`
confirmado, conflicto, `DELETE FROM projects` rechazado. **Corregido en el
diseño** (§14.d) y **el mecanismo está implementado y probado**:
`escribirMultiple()` aplica varias sentencias sobre la misma imagen con un solo
commit y un solo `rename`. La suite comprueba las dos caras: dos `DELETE` = una
generación y borrado completo; y con un fallo anterior al `rename`, **el proyecto
queda completo, filas y backups**. Incluye el **contraste** con dos `run()`
separados, que sí deja `projects=1, backups=0` en disco.

### 15.f Resultado tras las correcciones

```
NÚCLEO A3.3 — 254 OK, 0 FALLOS      (antes: 112, de las cuales 2 no valían)
```

Lo nuevo respecto a la rev. 4: 8 puntos de fallo pre-confirmación × 10
comprobaciones cada uno, SQL inválido y constraint reales, caso (c) desde un
fallo intermedio, `reparar-gen` completo, escritura múltiple y su contraste, y
las dos pruebas tautológicas rehechas.

### 15.g Lo que sigue SIN estar demostrado

Sin cambios respecto a la rev. 4, y conviene repetirlo:

- **Nada de esto toca la aplicación.** `db.js`, `main.js` y `security.js` están
  intactos.
- **Los cortes de corriente se simulan manipulando archivos**, no cortando la
  luz. Un apagado real no está demostrado ni es demostrable así.
- **La condición multi-PC se simula** con dos instancias del núcleo sobre la
  misma carpeta local. No es Drive, ni son dos máquinas.
- **Que `fsync` devuelva no demuestra que Drive haya subido nada.** Son tres
  estados distintos: (1) Panorama terminó de escribir, (2) el sistema de
  archivos aceptó, (3) Drive terminó de sincronizar. **1 y 2 no demuestran 3.**
- Siguen sin implementar, por acuerdo: `consolidarMetaRekey`, latch
  `'adoptando'`, revalidación de `securityKey`, `accionAplicada`, huella local
  persistente, y toda la integración de §14.
- **Cerrar el núcleo aislado no cierra A3.3.** Falta la revisión end-to-end de
  Panorama completo, con la matriz de escenarios por estados
  (BD / archivos / memoria / cifrado / IPC / Drive / tras reiniciar / datos
  perdidos sí-no) y el escenario de handoff PC A → PC B en sus seis variantes
  de sincronización. Cada escenario deberá quedar marcado como diseñado,
  implementado, unitario-simulado, prueba real o pendiente.

### 15.h Cierre del núcleo (rev. 6): los tres últimos ajustes

**1. Nombres temporales globalmente únicos.** `escribirAtomico()` usaba
`.tmp-${process.pid}`. Suficiente para A3.1 (dos instancias del mismo equipo),
**insuficiente para A3.3**, que existe justamente para equipos distintos: dos PCs
pueden tener el mismo PID sobre el mismo espacio de nombres sincronizado. Y
como al arrancar algunos `.tmp` supervivientes se tratan como posibles imágenes
de recuperación (§4.c), un equipo no debe poder abrir ni truncar el temporal de
otro writer por coincidencia de nombre.

Ahora: `.tmp-<writer>-<nonce>`, con el `installation-id` recortado y 8 bytes
aleatorios (más el prefijo del commit cuando existe). Los `.tmp-fallido-`
heredan la misma unicidad. Siguen empezando por `.tmp-`, así que la limpieza por
prefijo de `db.js:34-41` sigue funcionando.

Probado (§15, sección 12): dos núcleos con `installationId` distintos **en el
mismo proceso** —o sea, con el mismo `process.pid`— sobre la misma carpeta:
ningún nombre coincide, todos son distintos entre sí, el nombre no contiene el
PID y sí el writer. Y 50 escrituras del **mismo** writer producen 50 nombres
distintos.

**2. "No he podido leer" NO es "he demostrado un conflicto".** Era un defecto
real: `leerDisco()` devolvía `null` ante cualquier fallo de `readFileSync`,
`clasificar()` devolvía `'leer-disco'`, y `escribirMultiple()` acababa tratando
todo lo que no fuera espera/degradado como `latch 'conflicto'` +
`ErrorDb('conflicto')`. Un EIO transitorio de Drive se convertía en una
bifurcación inventada.

`leerDisco()` devuelve ahora **cuatro estados explícitos**:

| Estado | Cuándo | Política |
|---|---|---|
| `valida` | Se leyó y es una imagen coherente | Clasificación normal |
| `ausente` | `ENOENT` | **No verificable.** Nunca conflicto |
| `no-disponible` | Existe pero no se pudo leer (`EIO`, `EBUSY`, `EACCES`, `EPERM`, corte de Drive) | **No verificable.** Nunca conflicto |
| `ilegible` | Se leyó, pero no abre / falla `integrity_check` / no tiene `db_commit_id` | Latch `'bd-ilegible'` (daño demostrado) |

Y el mapeo, que es donde estaba el error:

- **COMPARTIDA o DESCONOCIDA** → `ErrorDb('io', { noVerificable: true })` y latch
  **`'degradado'`**, que es levantable solo en cuanto el disco vuelva a leerse.
  **Nunca `'conflicto'`, nunca un `caso`.**
- **LOCAL** → `ErrorDb('io', { noVerificable: true })` **sin latch**: no hay otro
  PC posible (A3.1), así que es un error de E/S transitorio y reintentable. Y
  tampoco se inventa parentesco.
- **Al arrancar**, `no-disponible` **no** latchea `'bd-ilegible'` y **no** crea
  una base de datos vacía encima: el archivo puede estar perfectamente bien y lo
  que ha fallado es leerlo.

Probado (§15, sección 13) con `EIO`, `EBUSY` y `EACCES` × las dos políticas, más
`ENOENT`, los cuatro estados por separado, y el arranque: en todos, **el SQL del
usuario no se ejecuta, la memoria no se toca, el disco no se toca, no se
etiqueta como conflicto ni se inventa un caso**, y al recuperar el acceso el
latch se levanta y la escritura siguiente clasifica bien, sin conflicto falso.

Esto es además lo que hará falta para integrar `driveOutageActive` (§5.c) sin
que un corte de Drive se convierta en una avalancha de conflictos falsos.

**3. §8.a contradecía la política de `fsync` vigente.** Decía "el `.gen` SIN
fsync", que era de la rev. 3. Corregido: la secuencia de §8.a es ahora
literalmente temporal → escritura completa → `fsync` → `rename` para el `.gen`,
y lo mismo para el `.sqlite3`, con el **segundo `rename` como punto de
confirmación**. Y las cifras separan lo **medido** de lo **derivado**: no
presento ningún "coste total con A3.3" como medida, porque A3.3 no está
integrado y ese ciclo no se ha cronometrado.

### 15.i Resultado de cierre

```
NÚCLEO A3.3 — 395 OK, 0 FALLOS
```


> **Nota sobre el contador:** la suite emite **394 o 395** asertos según si en
> esa ejecución el sistema de archivos permite reproducir el peor caso de
> precisión de la marca de tiempo (§15.b, hallazgo 2). Es una rama condicional
> deliberada de la prueba del límite en carpeta local, no una prueba inestable:
> en las dos ramas la prueba afirma y comprueba lo que corresponde.

Progresión: 112 (rev. 4, con 2 pruebas que no valían) → 254 (rev. 5) → 336 (rev. 6) → **395**
(rev. 6).

**Sigue sin estar demostrado**, sin cambios respecto a §15.g: nada toca la
aplicación; los cortes de corriente se simulan manipulando archivos; el multi-PC
se simula con dos núcleos sobre una carpeta local, no son dos máquinas ni es
Drive; y que `fsync` devuelva no demuestra que Drive haya subido nada — (1)
Panorama terminó de escribir, (2) el sistema de archivos aceptó y (3) Drive
terminó de sincronizar son tres estados distintos, y **1 y 2 no demuestran 3**.

**Cerrar el núcleo no cierra A3.3.** Falta la matriz end-to-end acordada.
