# B2 — Que los fallos lleguen al usuario, por clases (13 sept 2026, v2)

Rediseño tras la objeción del usuario a la primera propuesta. **No se ha
modificado código.**

La v1 trataba todos los fallos igual: notificar una vez, deduplicar, y nunca
cerrar. La objeción era correcta y la acepto: **no es seguro suponer que tras
un `uncaughtException` del proceso principal se puede seguir trabajando.**

---

## 1. Por qué un `uncaughtException` del proceso principal SÍ es potencialmente fatal aquí

No es una precaución genérica; en esta app hay razones concretas:

1. **`db.js` mantiene la base de datos entera en memoria y reescribe el archivo
   completo en cada escritura.** Si la excepción interrumpe una operación
   lógica a medias, la imagen en memoria queda en un estado intermedio — y
   **cada `persist()` posterior lo escribe a disco**. Operaciones lógicas
   multi-sentencia que hoy existen: `backup:save` (INSERT + purga + UPDATE),
   `projects:create` (INSERT + UPDATE), `deleteProjectById` (dos DELETE),
   `projects:reorder` (N UPDATE), `rekeySetFlagBulk` (3 UPDATE).
   *(`setMeta` ya no está en esa lista: se hizo atómico en la ronda anterior.)*
2. **El autoguardado sigue corriendo.** Cada ventana de proyecto abierta llama
   a `backup:save` cada 15 s. Una sesión "que continúa" después de una
   excepción sigue escribiendo indefinidamente desde un proceso cuyo estado ya
   no es de fiar.
3. **Registrar un manejador de `uncaughtException` desactiva el cierre por
   defecto de Node.** O sea: hoy la app ya sobrevive a estas excepciones, en
   silencio. No estamos añadiendo un riesgo — estamos quitando uno que ya
   existe.

**Dato real:** en el `app.log` del usuario, **9.378 líneas desde el 27 de
agosto**, los cuatro manejadores globales han disparado **0 veces**. Así que
esto es una red de seguridad, no un camino frecuente: podemos permitirnos que
sea contundente sin molestar en el día a día.

---

## 2. Qué está realmente en riesgo (base para el reinicio sin pérdida)

| Dato | Dónde vive | ¿Sobrevive a un `app.exit()` inmediato? |
|---|---|---|
| Estado del proyecto (hitos, riesgos, equipo…) | `localStorage` de la partición de cada proyecto, escrito por `saveState()` — **58 puntos de llamada, en cada edición** | **Sí.** Es un proceso distinto (el renderer) y ya está en disco |
| Preparaciones de reunión | Archivo `.json`, escrito de forma síncrona al guardar | **Sí** |
| Evaluación de candidatos | Archivo `estado.json`, síncrono al guardar | **Sí** |
| CVs adjuntos | Copiados al disco al adjuntarlos | **Sí** |
| Archivos de backup ya escritos | Disco | **Sí** |
| Último backup automático | Puede llevar hasta 15 s de retraso | **Se pierde esa frescura** — pero no el dato: el estado real está en `localStorage` |
| `panorama.sqlite3` | Imagen en memoria + archivo | **La versión en disco es la última consistente.** Si no volvemos a escribir, no se corrompe |

**Conclusión que gobierna todo el diseño:** salir inmediatamente **sin escribir
nada más** es la opción más segura y no pierde datos del usuario. Lo único que
se pierde es la actualización de un archivo de *copia*, no del original.

Esto invierte la intuición habitual ("déjame guardar antes de cerrar"): aquí,
intentar guardar es precisamente lo peligroso.

---

## 3. Las cuatro clases

### Clase 1 — `uncaughtException` del proceso principal → **fail-stop**

**Nunca se deduplica, nunca se limita, nunca se ofrece "continuar".**

Secuencia exacta:

1. `procesoComprometido = true` (ver §4) — inmediato, antes de nada más.
2. Guarda de reentrada `yaEnFalloFatal`: si vuelve a dispararse mientras se
   atiende el primero, solo se registra.
3. `appLog` con el stack completo y el código nuevo **PS-1013**.
4. `releaseMultiPcLockIfOwned()` — ver §5, es la única escritura que se permite.
5. Diálogo **nativo y bloqueante** (`dialog.showMessageBoxSync`: funciona sin
   ninguna ventana y sin depender de `vendor/modal.js`), con dos botones:
   - **"Reiniciar Panorama"** (por defecto)
   - **"Cerrar"**

   Sin tercera opción. El texto dice qué ha pasado, que **los datos de los
   proyectos están a salvo** (§2), que como mucho se pierde el último backup
   automático, y el código PS-1013 para poder contarlo.
6. Reiniciar → `app.relaunch(); app.exit(1)`. Cerrar → `app.exit(1)`.

Se registra **dentro de `app.whenReady()`**, justo después de
`startupRecoveryArmed = false`, para no solaparse con
`handleFatalStartupError`, que cubre la ventana de arranque y ya está bien
resuelto. Ese no se toca.

### Clase 2 — `unhandledRejection` → **nunca silencioso, restauración recomendada**

Un rechazo no implica que las invariantes síncronas del proceso estén rotas: la
pila que falló ya estaba aislada en una continuación. Es estrictamente menos
grave que la clase 1, pero no es inocuo.

**Antes de tratarlo genéricamente, hay que reducir de dónde puede venir.** Hoy,
la cadena entera de `app.whenReady().then(async () => {…})` no tiene `.catch()`:
un fallo de arranque posterior a la inicialización llega aquí como un rechazo
anónimo. Igual el `.then()` del vigilante de carpeta de datos. Propuesta:

- **Envolver esos dos** para que tengan su propio tratamiento con contexto
  ("fallo durante el arranque", "fallo del vigilante de la carpeta de datos")
  en lugar de llegar sin origen.

Lo que aun así llegue al manejador global es, por definición, de origen
desconocido:

- Siempre `appLog` con stack (**PS-1014**).
- Diálogo nativo con **tres** botones: **"Reiniciar Panorama"** (por defecto),
  **"Cerrar"**, **"Seguir por ahora"**.
- Si elige seguir: se marca la sesión como degradada y **los siguientes
  rechazos con la misma huella solo se registran** (aquí sí aplica dedupe), pero
  una huella *nueva* vuelve a preguntar.

> **Punto de juicio que dejo explícito:** ofrecer "Seguir por ahora" es una
> decisión discutible. La defiendo porque un rechazo no rompe invariantes
> síncronas y porque cerrar la app por, digamos, un `shell.openPath` que
> rechazó sería desproporcionado. Si prefieres que la clase 2 se comporte igual
> que la 1 (sin opción de continuar), es un cambio de una línea.

### Clase 3 — `render-process-gone` / `child-process-gone` → **recuperación local**

El proceso principal está intacto. El fallo está acotado a una ventana o a un
proceso auxiliar.

**`child-process-gone`** (GPU, utility, …): Chromium los relanza solo.
- Se registra siempre.
- **No se molesta al usuario** salvo que el mismo tipo caiga 3 veces en la
  sesión; entonces un aviso único sugiriendo reiniciar.

**`render-process-gone`** (una ventana ha muerto — `crashed`, `oom`,
`abnormal-exit`):
- Se identifica la ventana con `BrowserWindow.fromWebContents`.
- **Su estado está en `localStorage`, ya durable** (§2), así que recargar la
  recupera hasta la última edición. La recuperación es segura.
- Se registra (**PS-1015**) y se ofrece en un diálogo acotado a esa ventana:
  **"Recargar"** (por defecto) / **"Cerrar la ventana"**.
- `oom` merece texto propio: sugerir cerrar otras ventanas de proyecto.
- **Tope:** si la misma ventana cae 3 veces en la sesión, se deja de ofrecer
  recargar y se recomienda reiniciar la app — un bucle de recarga sería peor
  que el fallo.
- Cuidado con `attachFlushOnClose`: si la ventana muere mientras se esperaba su
  guardado final, el tope de 4 s ya la cierra. La recuperación debe comprobar
  `win.isDestroyed()` antes de recargar.

**No se cierra la app en ningún caso de la clase 3.**

### Clase 4 — `launcherMenu:action` / `projectMenu:action` → **error de operación**

Son fallos de una acción concreta que el usuario acaba de pedir. No deben
convertirse en fallos globales.

- `try/catch` **dentro de cada uno de los dos handlers**.
- Se muestra con `modalAlert` sobre la ventana que lo pidió — verificado en la
  ronda de A3.1 que los únicos renderers que disparan estos canales (lanzador,
  dashboard, directorio) cargan los tres `vendor/modal.js`.
- Se registra en `app.log` con el nombre de la acción que falló.
- **No** escala a clase 1 ni 2. Aquí sí aplica dedupe por acción.
- **Sin cambios en los renderers**: hoy los llaman sin `await` ni `.catch()`, y
  capturando en el proceso principal se tapa ese agujero sin tocarlos.

---

## 4. El congelado de escrituras

`procesoComprometido = true` debe impedir escrituras nuevas.

**La forma correcta y completa** es una línea en `db.js run()` que rechace
cualquier escritura con la bandera puesta: cubre el 100 % de los caminos.
`db.js` está reservado para A3.3, así que lo propongo **para cuando toquemos
db.js**, no ahora.

**Mientras tanto**, guardas en `main.js` con el mismo idioma que ya usan
`rekeyInProgress` y `restoreInProgress`:

| Punto | Respuesta con la bandera puesta |
|---|---|
| `backup:save` | `false` (el dashboard ya sabe tratarlo) |
| `meeting:savePrep` / `meeting:updatePrep` / `candidateEval:save` | `{ok:false, error}` |
| `projects:create` / `projects:delete` / `projects:reorder` | lanza con mensaje claro |
| `theme:set` | `{ok:false}` |
| `setMeta` / `deleteMeta` | retorno temprano (cubre `maybeRunPeriodicVacuum` y demás) |
| `persistWindowBoundsOnClose` | se salta |

**Honestidad sobre la cobertura:** esto es ~95 %, no 100 %. Queda fuera algún
`dbmod.run` interno (p. ej. `ensureProjectBackupDirSlug`) al que se llega desde
una lectura. La línea en `db.js` lo cerraría del todo.

Un matiz sobre el diálogo bloqueante: `showMessageBoxSync` ocupa el hilo de JS,
así que mientras está abierto no se atienden IPC — eso **reduce mucho** la
ventana, pero Chromium corre un bucle anidado y no lo considero una garantía.
La bandera es el mecanismo; el diálogo solo ayuda.

---

## 5. El reinicio controlado, sin pérdida de datos

Qué se hace y por qué:

1. **No se intenta ningún volcado final.** Por §2 no hace falta (los datos ya
   están en `localStorage` y en archivos) y por §1 sería justo lo peligroso.
2. **Se usa `app.exit(1)`, no `app.quit()`.** `exit()` no emite `before-quit`
   ni los `close` de las ventanas, así que **no** se dispara
   `attachFlushOnClose`: ninguna escritura desde un proceso comprometido.
3. **Pero eso se salta `releaseMultiPcLockIfOwned()`**, que hoy cuelga de
   `before-quit`. Sin liberarlo, `.panorama-lock.json` queda con un latido
   reciente y **el propio reinicio se encontraría el aviso "parece abierta en
   otro equipo"**. Por eso se libera explícitamente en el paso 4 de la clase 1.
   Es una escritura pequeña, acotada y que no depende de ninguna invariante en
   memoria.
4. **Si había un re-cifrado (A1) a medias**, su journal se queda en disco y la
   recuperación de arranque lo resuelve sola. Nada que hacer.
5. **Si había una restauración (A2) a medias**, el proceso muere con la
   partición posiblemente a medio escribir. Los backups siguen intactos:
   restaurar otra vez es seguro. El mensaje debería mencionarlo si
   `restoreInProgress` no está vacío — dato que sí tenemos.
6. `app.relaunch()` antes de `app.exit(1)`: probado en A3.1 (T2) que el proceso
   nuevo obtiene el cerrojo de instancia única sin problema (160 ms).

**Lo que sí puede perderse, dicho claro:** hasta ~15 s de frescura del último
archivo de backup, y cualquier escritura de metadatos que no hubiera llegado a
disco. Nunca el estado de trabajo del usuario.

---

## 6. Dedupe y topes: dónde sí y dónde no

| Clase | ¿Dedupe? | ¿Tope de avisos? |
|---|---|---|
| 1 `uncaughtException` | **No** | **No** (solo guarda de reentrada) |
| 2 `unhandledRejection` | Sí, **solo tras el primer aviso atendido** y por huella | Sí |
| 3 procesos caídos | Sí | Sí (3 por ventana / por tipo) |
| 4 acciones de menú | Sí, por acción | Sí |

Huella = mensaje + primer marco de pila.

---

## 7. Matriz de impacto

| Componente | Riesgo | Comprobación |
|---|---|---|
| `handleFatalStartupError` | Que el nuevo manejador se solape con el de arranque | Registrar el de clase 1 **dentro** de `whenReady`, tras `startupRecoveryArmed = false` |
| Los 4 puntos de guardado | Que la bandera bloquee en operación normal | La bandera solo se pone en clase 1; prueba de sesión normal completa |
| `attachFlushOnClose` | Que `app.exit()` deje ventanas sin guardar | Es deliberado y §2 lo justifica; probar que el estado sigue en `localStorage` tras el reinicio |
| `releaseMultiPcLockIfOwned` | Que el reinicio herede un aviso falso de multi-PC | Probar reinicio controlado con carpeta marcada como compartida |
| A3.1 (instancia única) | Que el relanzamiento no obtenga el cerrojo | Ya probado en T2; repetir con `exit(1)` |
| A1 / A2 en curso | Que un fallo fatal a mitad rompa sus garantías | Provocar clase 1 durante un rekey y durante una restauración |
| `modalAlert` en clase 4 | Ventana sin `modal.js` | Verificado: solo lanzador/dashboard/directorio disparan esos canales |
| Renderers | — | **No se tocan** |
| `db.js` | — | **No se toca** (la guarda completa se difiere a A3.3) |

---

## 8. Plan de pruebas

Todas en el sandbox aislado, con el método de A3.1/A2.

1. **Clase 1**: provocar una excepción real no capturada en el proceso
   principal → aparece el diálogo, se registra PS-1013, se libera el lock
   multi-PC, y al elegir "Reiniciar" la app vuelve y **el estado del proyecto
   sigue completo**.
2. Clase 1 **durante una restauración (A2)** → el mensaje lo menciona; tras
   reiniciar, restaurar de nuevo funciona.
3. Clase 1 **durante un re-cifrado (A1)** → tras reiniciar, la recuperación de
   arranque cierra el rekey.
4. **Congelado de escrituras**: con la bandera puesta, `backup:save` devuelve
   `false` y no aparece ningún archivo nuevo.
5. **Clase 2**: rechazo no manejado → diálogo de 3 botones; "Seguir por ahora"
   deja la app usable y el segundo rechazo con la misma huella no vuelve a
   preguntar; uno con huella distinta sí.
6. **Clase 3**: matar el renderer de una ventana de proyecto
   (`webContents.forcefullyCrashRenderer()`) → se ofrece recargar, al recargar
   el estado vuelve completo desde `localStorage`, y la app **no** se cierra.
   Tercera caída seguida → deja de ofrecer recargar.
7. **Clase 4**: forzar un fallo dentro de `projectMenu:action` → el usuario ve
   un error de operación, la app sigue, y **no** se dispara ningún manejador
   global.
8. **Regresión**: sesión normal completa (crear, abrir, editar, backup,
   restaurar, cerrar) sin que aparezca ningún diálogo nuevo.
9. Suites A1 (56 + 98), `setMeta` (19) y A2 (64).

---

## 9. Decisiones que dejo abiertas

1. **¿"Seguir por ahora" en la clase 2?** Lo recomiendo, pero es discutible
   (§3, clase 2).
2. **¿La guarda completa en `db.js` ahora o con A3.3?** Propongo con A3.3, para
   no abrir ese archivo dos veces.
3. **¿Reinicio automático sin preguntar en la clase 1?** Lo he descartado: el
   usuario podría estar a mitad de algo y merece saber qué pasó antes de que la
   ventana desaparezca. Pero si prefieres reinicio automático con un aviso
   posterior, es un cambio pequeño.
