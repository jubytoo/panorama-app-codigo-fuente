# MANIFIESTO — batería de pruebas de A3.3 y A2

**Fecha de la copia:** 15 sept 2026.
**Última actualización:** 15 sept 2026, tras la ronda de la **barrera durable
del `localStorage`** y los **arranques Electron reales de A2**.

> A partir de esa ronda, esta carpeta **deja de ser un espejo del scratchpad** y
> pasa a ser la **versión viva** de la batería: lo nuevo se escribe aquí. Si se
> añaden o cambian archivos, hay que regenerar las sumas con
> `comun/regenerar-sumas.js` y comprobarlas con `comun/verificar-copia.js`.
**Qué es esto:** una **COPIA** (no un traslado) de la batería de pruebas que se
construyó durante las rondas de A3.3 (Bloques 1–5) y A2, preservada aquí para
que no dependa de un scratchpad temporal ligado a una sesión concreta.

---

## 1. NO ES CÓDIGO PRODUCTIVO

Esta carpeta **no forma parte de la aplicación**:

- **No la carga Panorama.** Ningún archivo productivo (`main.js`, `db.js`,
  `security.js`, los preloads) referencia `claude/` en tiempo de ejecución —
  comprobado por búsqueda directa.
- **No entra en el empaquetado.** `package.json → build.files` es una **lista
  blanca**, y `claude/**` no está en ella. Verificado **empíricamente** leyendo
  la cabecera del `app.asar` ya compilado en
  `dist_build\win-unpacked\resources\app.asar`: sus carpetas de primer nivel son
  `assets, backup-picker, dashboard, db.js, directorio, evaluacion-candidatos,
  launcher, main.js, node_modules, package.json, preload*.js,
  preparacion-reunion, security.js, security-window, vendor`. La cabecera **no
  menciona `claude` ni `pruebas-a33`**.
- **No entra en `dist_build`**, que solo recibe la salida del empaquetado.
- **No altera el runtime.**

> **Único punto de contacto conocido entre `claude/` y el empaquetado:**
> `build.extraResources` copia **un archivo suelto**,
> `claude/Restaurar-backup.bat`. Es una entrada explícita a ese archivo, no a la
> carpeta, así que `claude/pruebas-a33/` queda fuera igualmente.
>
> **No se ha hecho ningún cambio de release ni de empaquetado.** La exclusión ya
> era estructural; aquí solo queda documentada y verificada. Si algún día se
> añadiera `claude/**` a `build.files` o a `extraResources`, **habría que
> excluir explícitamente `claude/pruebas-a33/`**.

---

## 2. PROCEDENCIA

Copiado desde el scratchpad temporal de la sesión de trabajo:

```
C:\Users\ADMIN~1.JLO\AppData\Local\Temp\claude\C--Codigo-Fuente-PS\
  e55d4471-ea3f-4279-b758-0366ccb6384c\scratchpad\
```

Esa ruta lleva el **id de sesión**, así que deja de ser accesible desde una
sesión nueva. Por eso existe esta copia.

| | |
|---|---|
| Archivos en el scratchpad | 255 |
| **Archivos copiados aquí (copia inicial)** | **174** |
| Bytes copiados | 3 546 302 |
| Diferencias de hash origen↔destino | **0** |
| Entrypoints localizables | **21 / 21** |

**Tras la ronda de la barrera durable (15 sept 2026):**

| | |
|---|---|
| **Archivos listados en `SHA256SUMS.txt`** | **176** |
| Archivos en la carpeta | 186 |
| La diferencia (10) | `SHA256SUMS.txt` + **9 reversiones generadas** (`a2/revertidos/`, `a2/revertidos-main/`, `bloque5/revertidos/`), que se rehacen solas con los `revertir*.js` y por eso no se listan |
| Faltan / difieren | **0 / 0** |
| Archivos de la batería perdidos respecto al scratchpad | **0** (comprobado uno a uno) |

Añadidos en esa ronda: `a2/probe-flush.js`, `a2/probe-flush2.js`,
`a2/probe-flush3.js`, `a2/revertir-main.js`, `a2/electron-real.ps1`,
`a2/electron-flush-diff.ps1`, `real-run/a2.js`, `comun/regenerar-sumas.js`.
Modificado: `a2/test-cableado.js` (+19 aserciones `REST-FLUSH-1..5`).

**Ronda H-1 (15 sept 2026), archivos modificados — ninguno nuevo:**

| Archivo | Qué cambió |
|---|---|
| `a2/test-cableado.js` | `H1-1..H1-4b` (+33). Las dos aserciones que fijaban el defecto como «lo que hace hoy» quedan **invertidas**. `lsDir()` tolerante: un `readdirSync` sin guardia tumbaba la batería entera con la reversión `F-sin-flush` en vez de dar FALLOS legibles |
| `a2/revertir-main.js` | `J-barrera-se-suelta`, `K-sin-f1-durable` y `L-sin-codigo-ps2006` |
| `a2/electron-real.ps1` | `A2_MAIN`: permite arrancar un modo contra una reversión. Antes los modos pasaban siempre `$null` y **ninguna reversión se podía comprobar en Electron real** |
| `real-run/a2.js` | El `detail` de los diálogos se guarda **entero** (se truncaba a 400 y el código de error va al final: RA-9 fallaba por eso). RA-3 pasa a exigir **dos** flushes, no uno |
| `comun/bloque5-extraccion.js` | `restauracionPendienteDeProyecto`, `f1Restauraciones`, `leerJournalRestauracion`, `journalsDeRestauraciones` y sus constantes: desde H-1 las arrastra `proyectoBloqueadoParaMutar()`, que extraen **todos** los arneses |

### Qué NO se copió, y por qué

| Ruta | Motivo |
|---|---|
| `copia-solo-lectura.sqlite3` | **Copia de la base de datos del usuario.** No entra en el repositorio bajo ningún concepto |
| `real-run/sb/` (81 archivos, 10,3 MB) | Sandbox **generado** por un arranque Electron; se recrea solo |
| `sandbox/` | Carpeta de trabajo generada por las baterías |

---

## 3. BATERÍAS INCLUIDAS

| Carpeta | Contenido |
|---|---|
| `comun/` | Guardián de rutas fail-closed (`guardia-rutas.js`), listas de extracción compartidas, baseline de la BD viva, utilidades |
| `bloque1/` | `db.js` íntegro: commits, `.gen`, latches, atomicidad |
| `bloque2/` | Cableado de A3.3 en el arranque de `main.js` |
| `bloque3/` | Seguridad/A1 sobre A3.3, primitivas, integridad de `ERROR_CODES` |
| `bloque4/` | Contratos archivo+BD/IPC: helper, recuperación y los 5 consumidores |
| `bloque5/` | Borrados destructivos: helper aislado, cableado D1–D4, arneses Electron reales (`.ps1`), reversiones |
| `a2/` | Restauración bajo A3.3: helper aislado, cableado productivo, reversiones, benchmark de la foto previa |
| `e1/` | **E1 — retirada de la vista Lista / Resumen del lanzador** (opción A). `test-inventario-e1.js` (estático + `setView()` ejecutada contra un DOM doble) y `electron-e1.ps1` (lanzador real). Nació como inventario del estado roto; desde el 15 sept 2026 demuestra la **retirada** |
| `b3/` | **B3 — los errores relevantes dejan de depender de `console`.** `test-b3-inventario.js` (premisa medida, inventario por archivo, clasificación A/B/C/D, catch vacíos por patrón **y** las exigencias `C1`/`C2`/`C3`/`S`), `electron-b3.ps1` (la app real: `console.warn` que no llega a `app.log`, cifrado fail-closed con carpeta falsa en memoria, Directorio, historial y una línea de B3 llegando de verdad al log), `revertir-b3.js` (7 reversiones) y `comprobar-reversiones-b3.js` (lanza la batería contra cada una y exige que rompa **por lo que anuncia**). B3 **cerrado** |
| `b1/` | **B1 — `projects:list` eficiente, puro y con rastro.** `test-b1-p13.js` (lecturas, pureza, robustez, campos, frescura), `electron-b1.ps1` (lanzador y dashboard reales, con un backup corrompido) y `revertir-b1.js` (4 reversiones). B1 **cerrado**; las secciones `P13-*` describen un pendiente **aceptado temporalmente** |
| `e2/` | **E2 — una sola fuente de verdad** del estado temporal del servicio. `test-e2-divergencia.js` (26 casos por **tres** caminos: helper, `main.js`, dashboard), `electron-e2.ps1` (lanzador y dashboard a la vez) y `revertir-e2.js` (2 reversiones). Nació demostrando la divergencia; desde el 15 sept 2026 **exige identidad** |
| `p12/` | **P12 — «sin rango temporal demostrable no se infiere progreso».** `test-p12-nan.js` (matriz P12-1..P12-5 con `renderRail()` **ejecutada**), `electron-p12.ps1` (dashboard real) y `revertir-dashboard.js` (3 reversiones). Nació describiendo el defecto; desde el 15 sept 2026 **exige la corrección** |
| `b4/` | **B4 — persistencia de la base de datos.** `test-b4-persistencia.js` (**144 OK / 0**) ejecuta el `db.js` REAL contra carpetas de usar y tirar e **inyecta fallos de `fs` acotados al sandbox**: no se puede abrir el temporal, la escritura se corta a mitad, falla el rename de publicación, y la carpeta de datos desaparece de verdad. Las secciones `A-Q` **describen y custodian** lo de A3.3 que no se toca; la sección `R` **EXIGE** que reordenar sea una sola operación, ejecutando el handler **extraído de `main.js`**. `electron-b4.ps1` (**17 OK / 0**) lo comprueba en la app real con proyectos de prueba. `revertir-b4.js` (2 reversiones) + `comprobar-reversiones-b4.js`. **No confundir con `real-run/b4.js`**, que es del **Bloque 4 de A3.3** |
| `b5/` | **B5 — un envío en curso no se repite.** `test-b5-reentrancia.js` (**68 OK / 0**) ejecuta el `security-window/renderer.js` **REAL sobre un DOM doble** y **cuenta los IPC**: exige **1** con doble Enter, cinco Enter, click+Enter y doble click, en los cuatro modos, y que la guarda **no** sea un cerrojo permanente. Las secciones `B/C/D/F/G/H` describen y **custodian** las capas inferiores, que no se tocan. `electron-b5.ps1` (**24 OK / 0**) lo mide en la app real con un **espía sobre `ipcMain.handle`**, haciendo `setup` y `change` de verdad sobre material de prueba, **y conserva la custodia de la defensa inferior enviando dos IPC DIRECTOS** que se saltan el renderer. `revertir-b5.js` + `comprobar-reversiones-b5.js`, que exige reproducir los números originales (2/5/2). **No confundir con `bloque5/` ni con `real-run/b5.js`**, que son el **Bloque 5 de A3.3** (borrados) |
| `c1/` | **C1 — residuos. C1-A cerrado, C1-B diferido.** Desde la ronda C1-A, `test-c1-residuos.js` (**165 OK / 0**) tiene una sección **`C1-A` que EXIGE**: el inventario de arranque deja exactamente una línea con los recuentos esperados, sin rutas (A1); no escribe, no crea, no mueve, no descifra de más, no entra en las cachés de Chromium, con **espías** de `fs`, `dbmod` y `securitymod` (A2); detecta y no elimina el intercalado, el `.tmp-fallido` y la partición huérfana (A3–A5); «Eliminar evaluación» e «Importar» retiran el CV solo con `aplicado+verificado`, sobre las **ramas reales del HTML** (A6–A8); los mensajes ya no prometen «se resuelve sola» (A9). Cinco aserciones descriptivas del diagnóstico (`C1-D3/D4`, `C1-E8b/c`, `C1-E9c`) se **invirtieron**, con nota. `revertir-c1.js` + `comprobar-reversiones-c1.js`: **siete reversiones**, cada una rompe solo lo suyo. `medir-inventario-vivo.js`: el inventario REAL sobre la carpeta de datos, con `fs` y `dbmod` que **lanzan** ante cualquier escritura. `electron-c1.ps1` (**31 OK / 0**, cuatro arranques). *Lo que sigue es la descripción del diagnóstico:* `test-c1-residuos.js` nació como batería **descriptiva** (122 OK / 0: da verde porque describe lo que HAY). Fabrica en sandbox las familias de residuo —backup huérfano anterior e intercalado, fila sin archivo, `.tmp-fallido` íntegro, `.tmp` completo y `.tmp` muerto, tmp de acción sin journal, journal propio/ajeno/ilegible/resuelto, proyecto borrado, CV huérfano, restos de rekey y de restauración, sonda de escritura— con las funciones **reales** de `main.js` y el `db.js` real, e **inyecta fallos de `fs`** acotados al sandbox. `C1-D` demuestra que el «contar y registrar» aprobado **no existe**; `C1-E9c` demuestra el mensaje engañoso del rekey; `C1-R` evalúa como **modelo** el arreglo de la auditoría y enseña por qué es inseguro. `electron-c1.ps1` (**10 OK / 0**, app real + `real-run/c1-particion.js`) mide qué queda de la partición de un proyecto borrado. `inventario-vivo.js` es el inventario de los datos **reales**, de **solo lectura** e imprimiendo solo agregados; comprueba la BD viva, la de P10 y el nº de entradas antes y después (exit 98 si algo cambia). **No confundir los `C1-*` de aquí con el corte `C1` de la matriz del Bloque 4** |
| `f1/` | **F1 — interpretación de datos como HTML. CERRADO (16 sept 2026).** `test-f1-sinks.js` (**139 OK / 0**) pasó de descriptiva a **EXIGENTE**: ejecuta los constructores reales del dashboard **con los helpers reales del propio archivo** y exige que cada campo quede *inerte* (ni etiqueta, ni handler, ni atributo roto) sin dejar de verse; `</textarea>` dentro del valor; logo solo `data:image/*;base64`; y **round-trip exacto del factory-seed** con `</script>`, `$&`, `$'`, `` $` ``, `$1`, `<`, `>`, `&`, comillas, acentos y emoji. Custodia además lo que NO debe tocarse (markup propio, enums, `modal.js`, builders ya escapados). `electron-f1.ps1` (**47 OK / 0**, cuatro arranques) lo exige en la app real: importar con marcadores, reinicio, título horneado y **un proyecto horneado ANTES de F1** (que debe seguir abriendo). `revertir-f1.js` + `comprobar-reversiones-f1.js` (**19 OK / 0**): **seis reversiones por familias** —texto del dashboard, seed inseguro, `onclick` de Preparación, selector de Evaluación, `data-dedic` del Directorio y logo crudo—, cada una rompe **solo lo suyo**. *Lo que sigue es la descripción del diagnóstico previo:* **SOLO DIAGNÓSTICO — no se había tocado producción.** `test-f1-sinks.js` (**100 OK / 0**, **descriptiva**: da verde porque describe los sinks que HAY) inventaria y ejecuta los constructores reales del dashboard, la Preparación, la Evaluación, el Directorio, el lanzador y de `main.js` (horneado del `factory-seed`, `String.replace` con `$`), clasificando cada interpolación por fuente y por si escapa. `electron-f1.ps1` (**34 OK / 0**, app real + `real-run/f1-inyeccion.js`) demuestra con **marcadores inocuos** (una `<b>`, un `data-f1a`, y una `<img>` con `onerror` que solo pone un atributo en `<html>` — **sin red, sin APIs sensibles, sin acciones destructivas**): al abrir un proyecto importado se interpretan 19 campos del dashboard; el id importado rompe atributos; el sink del `<select>` del historial queda **inerte por el parser**, no por escape; la Evaluación deja el texto literal pero **peso y fecha** van crudos; el título importado **horneado** en `dashboard.html` se ejecuta en el **arranque** (persistente); y el nombre de proyecto rompe el `data-dedic` del Directorio. **Barreras medidas:** `contextIsolation:true`, `sandbox:true`, sin Node en el mundo principal de todas las ventanas, `psConfirm` sobrescribible, **sin CSP** (F2), y `window.open` sin `setWindowOpenHandler` (F3) cuya ventana hija **no** hereda el puente. `f1-inyeccion.js` **no** invoca ninguna API del puente desde el contenido inyectado: la exposición **solo se documenta** |
| `p17/` | **P17 — el horneado dejaba assets sin resolver. CERRADO (17 sept 2026).** `fixVendorScriptPaths` encadenaba nueve `String.replace(cadena, cadena)`, con DOS defectos de la misma familia: con patrón de cadena solo se sustituye la **primera** coincidencia (y `src="../assets/icon-256.png"` aparece **dos** veces, en el dashboard **y** en el Directorio: el icono de la barra de título salía roto), y la URL iba como **cadena de reemplazo**, donde `$&`/`` $` ``/`$'` tienen semántica (medido antes del arreglo: con `$'` el horneado pasaba de 373 KB a **189 MB** y dejaba **2210** rutas sin resolver). Corregido con **un solo patrón** para los nueve: regex **global** + **función** de reemplazo. `test-p17-assets.js` (**70 OK / 0**, EXIGENTE) ejecuta la función REAL contra las dos plantillas: cero relativos, los dos iconos resueltos, custodia de los nueve patrones, **equivalencia byte a byte** al deshacer solo los assets, y los cuatro casos `$&`/`$'`/`` $` ``/`$1`. `electron-p17.ps1` (**16 OK / 0**) lo exige en la app real sobre el dashboard **y** el Directorio horneados. `revertir-p17.js` + `comprobar-reversiones-p17.js` (**6 OK / 0**): al volver a `String.replace(cadena, cadena)` reaparecen **los dos** defectos |
| `real-run/` | Envoltorios que cargan el `main.js` REAL dentro de Electron. **Ojo con dos homonimias:** `b5.js` y `b4.js` son de los **Bloques 5 y 4 de A3.3**, no de los hallazgos B4/B5 de la auditoría; esos son `b4-reorder.js` y `b5-reentrancia.js`. `c1-particion.js` es de C1; `f1-inyeccion.js` y `f1-limpio.js` son de F1; `p17-assets.js` es de P17 |
| `lock-harness/`, `nucleo-a33/`, `probe/`, y los sueltos de la raíz | Material de rondas anteriores (A1, A2 original, B2, `setMeta`, benchmarks). Se conservan como histórico |

---

## 4. RESULTADO CONOCIDO MÁS RECIENTE

```
REGRESIÓN AUTOMATIZADA COMPLETA:  1745 OK / 0 FALLOS   (16 sept 2026, tras C1-A)
TODOS LOS test-*.js, TRAS F1:     2961 OK / 0 FALLOS   (16 sept 2026, tras F1)
TODOS LOS test-*.js, TRAS P17:    3031 OK / 0 FALLOS   (17 sept 2026, tras P17)
```

La primera cifra es la del núcleo, como se venía contando. La segunda es la
tirada **completa** de esta ronda —todos los `test-*.js` de `nucleo-a33`,
`bloque1..5`, `a2`, `e1`, `p12`, `e2`, `b1`, `b3`, `b4`, `b5`, `c1` y `f1`
sumados— para dejar constancia de que F1 no rompió nada: núcleo y bloques
**2657**, más **C1 165** y **F1 139**. Aparte: reversiones de F1 **19 OK/0** y
las 7 de C1-A, que siguen rompiendo cada una por lo suyo.

Contra `main.js` = `434BB2946C3D87F1D44E829C09D3C5EE5BE985F8545586B0CB9F7AB34D0C02C5`
(tras P17; antes `0BC92A46…` tras F1, y `F81F0A3D…` tras C1-A) y
`db.js` = `B03C81FF5FC300009DC315E4B20F9BF88DCC6902B18C2EF434B251A022EDD830`
(81 870 B — sin cambios desde B4, que solo le cambió comentarios; sin ellos el
código es idéntico byte a byte al de antes). Aparte, en la misma tirada: E1 47,
P12 73, E2 67, B1 77, B3 85, B4 144, B5 68 y **C1 165**, todas a 0 fallos.

> **F1 sí mueve `main.js`** (`F81F0A3D…` → `0BC92A46…`), y solo en el horneado
> del `factory-seed`: `serializarSeedParaScript` y el replacement **function**.
> Hubo que actualizar, con su nota, `HASHES_TRAS_A2` de
> `e1/test-inventario-e1.js` y la aserción `C1-P3` (que custodiaba que C1 no
> tocara F1 y esperaba verlo «ABIERTO»). Las dos saltaron solas: el anclaje por
> hash y el anclaje por estado hicieron exactamente su trabajo.
>
> **P17 lo vuelve a mover** (`0BC92A46…` → `434BB294…`), y solo en
> `fixVendorScriptPaths`. Saltaron otros dos anclajes, actualizados con su
> nota: `E1-M4` (hash) y `E2-A5`, que custodiaba la **forma antigua** del
> `.replace` de `service-status.js` — su intención (que esa ruta se reescriba al
> hornear) no cambia, solo dónde se comprueba.

> **C1-A tampoco mueve la cifra del núcleo**, y es lo esperado: sus
> aserciones se cuentan en `c1/`. Lo que sí hubo que actualizar **a
> conciencia, con su nota**, es `HASHES_TRAS_A2` de `e1/test-inventario-e1.js`
> (main.js `DB7FF295…` → `F81F0A3D…`). La lista compartida de extracción **no**
> hubo que tocarla: ninguna función que ya extrajeran los demás arneses llama a
> las nuevas. Antes de C1-A: **1745 OK/0** contra `DB7FF295…` (tras B4 y B5).

> **Tampoco se mueve con B4**, por lo mismo: sus 144 aserciones se cuentan
> aparte, en `b4/`. Lo que sí hubo que actualizar **a conciencia, con su nota**
> es la tabla `HASHES_TRAS_A2` de `e1/test-inventario-e1.js` (main.js **y**, por
> primera vez, **db.js**), y el suelo de `B3-S7`: B4 reutiliza
> `motivoSinRutas()` y añade un usuario 16.º que no es de B3. La aserción sigue
> exigiendo que **ninguna de las 15 líneas de B3** vaya en crudo.
>
> **La cifra no se mueve con B3, y eso es lo que se esperaba:** B3 no añade
> aserciones al núcleo, añade comportamiento. Las suyas se cuentan aparte, en
> `b3/`. Lo que sí hubo que tocar es la **lista de extracción compartida**
> (`comun/bloque5-extraccion.js`): `borrarJournalResuelto` y
> `soltarExclusivaConRastro` entran ahora en el ámbito de los bloques 3, 4, 5
> y A2, y sin declararlos las baterías reventaban con
> `"borrarJournalResuelto is not defined"` — **defecto de arnés, no de
> producto**, y el mismo patrón que ya documenta esa lista.
>
> Antes de B3: **1745 OK/0** contra
> `452B411D43897572408B5674400C3A81B96B345ED1807DCFF505F8EE38C6B608`. Antes de
> B1/E2: **1745 OK/0** contra `DB75E6C2…` (554 035 B, 11 103 líneas), cifra que
> a su vez venía de **1688 OK/0** contra `E19EF34F…` + las 33 aserciones de H-1
> en `a2/test-cableado.js` (96 → 129) y las 24 de `REST-ROLLBACK-FLUSH`
> (72 → 96). **Ninguna batería ha perdido aserciones en ninguna ronda.**

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
| `a2/test-cableado.js` | **129 / 0** (53 + 19 `REST-FLUSH` + 24 `REST-ROLLBACK-FLUSH` + 33 `H1-*`) |

Electron real y destructivo (sandbox artificial): **71 / 0** (E1–E7 del
Bloque 5), **17 / 0** (los dos casos de CV) y **12 / 0** (`CV-RM-F3-RETURN`).

**Electron real de A2 (15 sept 2026, ronda H-1): 66 OK / 0 FALLOS**, los **nueve
modos en una sola tirada**, contra `main.js = DB75E6C2…`. BD viva idéntica por
SHA-256 antes y después, carpeta de la BD sin archivos nuevos, archivos
productivos intactos y sandbox borrado.

| Modo | Qué prueba | Resultado |
|---|---|---|
| `ra1` | Restauración real completa | 13 / 0 |
| `ra2` | Ventana que de verdad se niega (`beforeunload`), tope de 8 s | 10 / 0 |
| `ra3` | Fallo pre-commit: vuelta atrás real. **Ahora exige los DOS flushes** —apply y reposición— y que ambos sean de la partición del proyecto | 6 / 0 |
| `ra4` | Forma 3 en Electron real | 3 / 0 |
| `ra5` + `ra5b` | Corte duro tras el commit, y recuperación | 4 / 0 |
| `ra6` | Rekey real con material de restauración pendiente | 5 / 0 |
| `ra7` + `ra7b` | **Corte duro justo tras la reposición y su cleanup**: el PRE sobrevive, no queda material, la app arranca sin nada que recuperar | 4 / 0 |
| `ra8` | **P2 real**: `closed` tardío de A sobre el Map REAL de `main.js`, en reunión y candidatos → `map.get(X) === B`, con control negativo al destruir B | 12 / 0 |
| `ra9prep` + `ra9` | **PS-2006 real**: diálogo correcto, `detail` con el código, el lanzador **no** abre, material intacto, app en camino de cierre | 9 / 0 |

**Reversiones comprobadas en Electron real** (con `A2_MAIN`):

| Reversión | Modo | Efecto |
|---|---|---|
| `I-p2-delete-ciego` | `ra8` | **2 fallos**: con el `delete` ciego el mapa queda **vacío** tras el `closed` tardío de A. Es el defecto P2, reproducido |
| `L-sin-codigo-ps2006` | `ra9` | **1 fallo**, y solo ese: el `detail` pierde el código |

Cifra anterior (misma fecha, ronda previa): **40 OK / 0** en `RA-1..RA-6`, con
`ra3` en 5/0 —la aserción que exigía **un** flush se quedó desfasada cuando la
reposición pasó a volcar también, y no se detectó porque esa ronda no llegó a
rearrancar el arnés.

**Diferencial de la barrera durable** (`a2/electron-flush-diff.ps1`, N=4 por
brazo): **con barrera 4/4 coherente, sin barrera 0/4**.

### Reejecución completa tras B3 (15 sept 2026)

B3 tocó `main.js` en la limpieza de journals resueltos y en el soltado de la
exclusiva —territorio de A2 y del Bloque 5—, así que se reejecutó **todo**,
no solo lo de B3. Todas las cifras coinciden con las registradas:

| Arnés | Resultado |
|---|---|
| `a2/electron-real.ps1` (9 modos) | **66 / 0** |
| `bloque5/electron-real.ps1` | **71 / 0** |
| `bloque5/electron-cv.ps1` | **12 / 0** |
| `e1/electron-e1.ps1` | **21 / 0** |
| `p12/electron-p12.ps1` | **32 / 0** |
| `e2/electron-e2.ps1` | **42 / 0** |
| `b1/electron-b1.ps1` | **24 / 0** |
| `b3/electron-b3.ps1` | **36 / 0** *(era 8 / 0 cuando solo describía)* |
| `b4/electron-b4.ps1` | **17 / 0** *(nuevo en la ronda B4)* |
| `b5/electron-b5.ps1` | **24 / 0** *(nuevo en la ronda B5)* |
| `c1/electron-c1.ps1` | **31 / 0** *(10 / 0 en el diagnóstico; +21 con C1-A: línea de inventario en cuatro arranques reales y «Eliminar evaluación» con clic real)* |
| `f1/electron-f1.ps1` | **47 / 0** *(tras implementar F1; **exige** cero interpretación en 4 arranques reales — importado, reinicio, título horneado y proyecto horneado antes de F1. Antes del arreglo, en diagnóstico: 34 / 0 describiendo el defecto)* |
| `f1/electron-f1-limpio.ps1` | **52 / 0** *(validación con datos ORDINARIOS: las 5 pantallas, caracteres `& " < >`, proyecto pre-F1 y logos, con capturas)* |
| `p17/electron-p17.ps1` | **16 / 0** *(assets del horneado en la app real: dashboard **y** Directorio, cero recursos rotos)* |

En los once: **BD viva idéntica por SHA-256** antes y después, carpeta de la
BD sin archivos nuevos, **archivos productivos intactos** y sandbox borrado.
*(La tabla se reejecutó entera tras B4, tras B5 y **otra vez tras C1-A**
—`main.js` cambió en el arranque y en los mensajes del rekey—, con las mismas
cifras en las tres.)*

`f1/electron-f1.ps1` (**47 / 0**) es aparte, y desde la ronda F1 **exige** el
arreglo en vez de describir el defecto. Mismas garantías del sandbox — BD viva
idéntica por SHA-256, carpeta sin archivos nuevos, **los doce archivos
productivos intactos durante la tirada**, sandbox borrado— comprobadas también
en su ejecución.

> **F1 movió `main.js`** (`F81F0A3D…` → `0BC92A46…`), solo en el horneado del
> `factory-seed`. Eso obligó a actualizar el hash anclado en
> `e1/test-inventario-e1.js` (`E1-M4`), con su nota en la tabla de ese archivo:
> el anclaje por hash hizo justo lo que tenía que hacer, avisar.

> ## ADVERTENCIA
>
> **Estas cifras son EVIDENCIA HISTÓRICA, no una verificación vigente.**
>
> Corresponden al estado de `main.js` y compañía en el momento en que se
> ejecutaron. **No equivalen a una nueva ejecución.** Cualquier sesión que
> quiera atribuirse una verificación tiene que **volver a ejecutar las baterías
> relevantes** contra el código actual y reportar sus propios números.
>
> Las baterías extraen funciones de `main.js` **por firma**: si una firma
> cambia, la batería falla con `NO SE ENCONTRO: …` — a propósito. Eso es una
> señal de que hay que actualizar la lista de extracción, no de que el código
> esté mal.

---

## 5. CÓMO VOLVER A EJECUTARLAS

### Requisitos

- **Windows**, con el proyecto en `C:\Codigo Fuente PS\panorama-app-codigo-fuente_1`
  (las rutas están fijadas dentro de los arneses).
- **Electron 30.5.1** ya instalado en `node_modules` del proyecto, que trae
  **Node 20.16.0**. No hace falta Node aparte.
- Para las baterías automatizadas, Electron se ejecuta **como Node**:
  `ELECTRON_RUN_AS_NODE=1`.
- Para los arranques Electron reales, **sin** esa variable.

### Baterías automatizadas

```bash
set ELECTRON_RUN_AS_NODE=1
"C:\Codigo Fuente PS\panorama-app-codigo-fuente_1\node_modules\electron\dist\electron.exe" "C:\Codigo Fuente PS\panorama-app-codigo-fuente_1\claude\pruebas-a33\a2\test-cableado.js"
```

Entrypoints, en el orden en que se suelen ejecutar:

```
comun/test-guardia.js
bloque1/test-db-integrado.js
bloque2/test-wiring.js
bloque3/test-error-codes.js
bloque3/test-primitivas.js
bloque3/test-seguridad.js
bloque4/test-acciones.js
bloque4/test-consumidores.js
bloque5/test-borrados.js
bloque5/test-cableado.js
a2/test-restauraciones.js
a2/test-cableado.js
e1/test-inventario-e1.js
p12/test-p12-nan.js
e2/test-e2-divergencia.js
b1/test-b1-p13.js
b3/test-b3-inventario.js
```

> `b3/test-b3-inventario.js` (**85 OK / 0**) y `b3/electron-b3.ps1`
> (**36 OK / 0**) nacieron **describiendo** un defecto abierto y desde el 15
> sept 2026 **exigen la corrección**. Conservan las secciones `B3-A..F` —la
> premisa medida, el inventario, la clasificación A/B/C/D y lo que **no** se
> toca— y añaden `B3-C1` (cifrado fail-closed), `B3-C2` (Directorio),
> `B3-C3` (historial, reclasificado C→D) y `B3-S` (ningún mensaje filtra
> secretos ni rutas, con el saneador **extraído y ejecutado** contra el
> mensaje real de Windows). Siete reversiones en `b3/revertir-b3.js`,
> comprobadas una a una por `b3/comprobar-reversiones-b3.js`.

> `b1/test-b1-p13.js` (**77 OK / 0**) y `b1/electron-b1.ps1` (**24 OK / 0**) se
> cuentan aparte. **Tienen dos mitades con lecturas distintas:** las `B1-*`
> **exigen** la corrección (1 lectura por proyecto, cero `mkdir`, cero `UPDATE`,
> una línea de rastro); las `P13-*` **describen** un pendiente aceptado
> temporalmente —el lanzador sirve del último backup— y dan verde porque eso
> sigue siendo así **a propósito**. Si algún día se cambia la fuente, `P13-2`
> debe fallar.

Arranques Electron reales de las rondas nuevas:

```
e1/electron-e1.ps1    lanzador sin los controles de Lista/Resumen   (E1_MAIN)
p12/electron-p12.ps1  dashboard de un proyecto recien creado        (P12_MAIN)
e2/electron-e2.ps1    lanzador y dashboard a la vez, mismo proyecto (E2_MAIN)
b1/electron-b1.ps1    ciclo de frescura lanzador <-> dashboard      (B1_MAIN)
b3/electron-b3.ps1    console.warn vs app.log + cifrado, Directorio,
                      historial y una linea de B3 llegando a app.log
```

Reversiones de las rondas nuevas:

```
p12/revertir-dashboard.js  -> p12/revertidos/*.html   (17 / 6 / 1 fallos)
e2/revertir-e2.js          -> e2/revertidos/*         (28 / 3 fallos)
b1/revertir-b1.js          -> b1/revertidos/*.js      (6 / 11 / 11 / 16 fallos)
```

> `e2/test-e2-divergencia.js` (**67 OK / 0**) y `e2/electron-e2.ps1`
> (**42 OK / 0**) se cuentan aparte: son la batería de **E2**, ya cerrada.
> Exigen `A === B === C` —helper, envoltorio de `main.js`, envoltorio del
> dashboard— para los mismos 26 casos, y que el wording sea literal. Admiten
> `PANORAMA_MAIN`, `PANORAMA_DASHBOARD` y `PANORAMA_SERVICE_STATUS`.
>
> **Aviso para quien toque `main.js` en el futuro:** `e1/test-inventario-e1.js`
> lleva una tabla de hashes (`HASHES_TRAS_A2`) que comprueba qué archivos NO ha
> tocado E1. Un cambio legítimo posterior la hace fallar — **se actualiza a
> conciencia, con su nota de por qué, nunca se borra**. Ya pasó con E2.

> `p12/test-p12-nan.js` (**73 OK / 0**) y `p12/electron-p12.ps1` (**32 OK / 0**)
> se cuentan aparte: son la batería de **P12**, ya cerrada. Desde el 15 sept
> 2026 **exigen la corrección**, no la describen.
>
> `e1/test-inventario-e1.js` (**47 OK / 0**) no entra en el recuento de la
> regresión de A3.3/A2: es la batería de **E1**, y se cuenta aparte. Demuestra
> la **retirada** de los controles de Lista/Resumen, no su terminación: sus
> secciones `E1-T*` fijan a propósito que el código interno parcial **sigue
> ahí** (`portfolio:summary`, `portfolioSummary()`, `computeStaffingRatio()`,
> `setView()`, los helpers y el CSS). Si algún día se completa la opción B,
> `E1-R*` y `E1-T5` saltarán — es la señal de que toca reescribirla.

Cada una imprime `N OK, M FALLOS` y devuelve `exit 0` solo si `M = 0`.

### Comprobación de sintaxis de los archivos productivos

```
bloque5/sintaxis.js
```

### Reversiones (demuestran que cada defensa es necesaria)

```
bloque5/revertir.js        -> genera bloque5/revertidos/*.js
a2/revertir.js             -> genera a2/revertidos/*.js
a2/revertir-main.js        -> genera a2/revertidos-main/*.js   (main.js productivo)
p12/revertir-dashboard.js  -> genera p12/revertidos/*.html     (dashboard productivo)
```

Las de P12, con `PANORAMA_DASHBOARD` apuntando a la copia revertida, tumban
exactamente lo suyo: `M-sin-guarda-rango` **17 fallos** (vuelve el NaN y el 100 %
falso), `N-hoy-sin-rango` **6** (reaparece el marcador de HOY sin escala) y
`O-dias-sueltos` **1** (los días dejan de depender del rango).

Luego se relanza la batería con `PANORAMA_BORRADOS` o
`PANORAMA_RESTAURACIONES` apuntando a la copia revertida, y **debe fallar**
exactamente lo que esa reversión rompe.

### Arranques Electron reales (destructivos, en sandbox)

```
bloque5/electron-real.ps1     E1-E7 (del Bloque 5; no confundir con el hallazgo E1)
bloque5/electron-cv.ps1       casos de CV
a2/electron-real.ps1          RA-1..RA-9 (restauracion, P2 y PS-2006)
a2/electron-flush-diff.ps1    diferencial de la barrera durable
e1/electron-e1.ps1            lanzador real sin los controles de Lista/Resumen
p12/electron-p12.ps1          dashboard real de un proyecto recien creado (NaN)
```

`e1/electron-e1.ps1` usa `real-run/e1.js` —arnés propio, no toca el de A2— y
admite `E1_MAIN` igual que `A2_MAIN`. Resultado: **21 OK / 0**.

> **Trampa que costó un susto:** PowerShell **no distingue mayúsculas en los
> nombres de variable**. Un `$p = Start-Process …` en el ámbito raíz **pisa
> `$P`**, la ruta del proyecto, y el guardián de salida declara «CAMBIO EN
> PRODUCCION» en los nueve archivos — un falso positivo alarmante. En
> `a2/electron-real.ps1` no pasa porque allí el `Start-Process` vive dentro de
> una función y su `$p` es local. Los arneses nuevos usan `$proc`.

Son PowerShell y deben mantenerse en **ASCII puro** (PowerShell 5.1 los lee como
ANSI). Usan `real-run/b5.js` y `real-run/a2.js`, que cargan el `main.js` REAL
redirigiendo `appData`/`userData` a un sandbox antes de requerirlo.

`a2/electron-real.ps1` admite `A2_MODOS` para elegir modos
(`$env:A2_MODOS='ra1,ra2'`), y `a2/electron-flush-diff.ps1` admite `DIFF_N`
para el número de repeticiones por brazo.

> **Trampa que costó una hora:** `Start-Process -ArgumentList` **trocea por
> espacios**. Un sandbox bajo `C:\Codigo Fuente PS\…` llegaba partido y el arnés
> escribía su log en `C:\Codigo\test.log`; como `tlog()` se traga el error, la
> prueba *parecía no arrancar*. Los sandboxes de arranque real van en `%TEMP%`
> (ruta 8.3, sin espacios) y los argumentos entre comillas. `real-run/a2.js`
> ahora hace **fail-closed** si el sandbox no existe o no es escribible.

### Sondas de `flushStorageData` (Electron real, no automatizadas)

```
a2/probe-flush.js    forma de la API y primer vistazo al LevelDB
a2/probe-flush2.js   BRAZO DE CONTROL: cuanto tarda el dato en llegar SIN flush
a2/probe-flush3.js   medicion estrecha (readdir+stat), 5 repeticiones
```

Se lanzan con Electron **sin** `ELECTRON_RUN_AS_NODE` y dejan su salida en
`%TEMP%\_a33-flush-probe*-salida.txt` (la consola de un Electron GUI no llega a
PowerShell). Necesitan `app.on('window-all-closed', () => {})`: sin eso Electron
mata el proceso en cuanto se cierra la ventana oculta, **con exit 0**, y la
sonda parece haber terminado bien sin haber hecho nada.

### Variables de entorno útiles

| Variable | Para qué |
|---|---|
| `PANORAMA_MAIN` | Apuntar a una copia de `main.js` con una corrección revertida (baterías **automatizadas**: extraen por texto, no hacen `require`) |
| `A2_MAIN` | Lo mismo para los **arranques Electron reales** de `a2/electron-real.ps1`. El arnés hace `require()` de verdad, así que el script copia la reversión a la raíz del proyecto como `__main-revertido-PRUEBAS.js` —para que `require('./db')` y `__dirname` resuelvan— y la borra al terminar. No modifica ningún archivo productivo: el propio script lo comprueba por hash |
| `PANORAMA_RESTAURACIONES` | Ídem para el helper aislado de restauración |
| `PANORAMA_BORRADOS` | Ídem para el helper aislado de borrados (ya obsoleto: el helper vive en `main.js`) |
| `PANORAMA_DASHBOARD` | Ídem para `plantilla_dashboard.html` en la batería de P12 |

---

## 6. SEGURIDAD: QUÉ NO SE TOCA NUNCA

### Base de datos VIVA — **JAMÁS**

```
G:\Mi unidad\BD-PanoramaServicio\panorama.sqlite3
```

La ubicación sale de `%APPDATA%\panorama-app-config\location.json`, clave
**`userDataDir`**. Toda la carpeta `G:\Mi unidad\BD-PanoramaServicio\` es de
**solo lectura y hash** para las pruebas. Ninguna batería escribe ahí.

`comun/guardia-rutas.js` lo impone: es el **lector único y fail-closed** de
`location.json` (si el archivo existe y no se puede interpretar → **exit 99**),
y además hashea la BD viva al empezar y al terminar, terminando con **exit 98**
si ha cambiado durante una batería.

Baseline en `comun/baseline-bd-viva.json`, con el hash anterior y el motivo del
último cambio.

### Sandboxes permitidos

| Ruta | Uso |
|---|---|
| `%TEMP%\_a33-*` | Todas las baterías automatizadas. Cada una crea y borra la suya |
| `claude/pruebas-a33/bloque5/sandbox-real`, `sandbox-cv` | Arranques Electron reales; se borran al terminar |
| `G:\Mi unidad\_Panorama-A33-Pruebas\` | **Solo benchmarks.** Carpeta de pruebas acordada en `G:`, separada de la viva. La subcarpeta de trabajo se borra al acabar |

Los guardianes exigen además que toda ruta de trabajo contenga una **marca de
pruebas** (`_a33-…`) y abortan si contiene `bd-panoramaservicio`.

---

## 7. INTEGRIDAD DE ESTA COPIA

`SHA256SUMS.txt` (en esta misma carpeta) lista el **SHA-256 de los 226
archivos** de la batería, con ruta relativa. Se regenera con
`comun/regenerar-sumas.js` y se comprueba con `comun/verificar-copia.js`
(recorrido independiente, exit 0 solo si no falta ni difiere nada y **no hay
ningún `.sqlite3` dentro del repositorio**).

Última verificación (17 sept 2026, tras implementar P17): **226 listados,
0 faltan, 0 difieren, 0 `.sqlite3`**, 4 127 475 bytes. Las carpetas
`*/revertidos/` no se listan: las regeneran los `revertir-*.js`.

> **Ojo:** este `MANIFIESTO.md` **sí** entra en `SHA256SUMS.txt`, aunque el
> párrafo del verificador lo nombre entre los «no listados». Editarlo obliga a
> regenerar las sumas: si no, `verificar-copia.js` sale con **exit 1** y
> `DIFIERE: MANIFIESTO.md`.

También se puede comprobar a mano:

```powershell
Get-Content SHA256SUMS.txt | ForEach-Object {
  $h,$r = $_ -split '  ',2
  $a = (Get-FileHash ($r -replace '/','\') -Algorithm SHA256).Hash.ToLower()
  if ($a -ne $h) { "DIFIERE: $r" }
}
```

---

## 8. DÓNDE ESTÁ EL ESTADO DEL PROYECTO

Este manifiesto describe **la batería**, no el estado del trabajo. Para eso:

- `claude/handoff-opus-estado-actual.md` — estado técnico completo
- `claude/pendientes-abiertos.md`
- `claude/auditoria-2026-09-13.md` — sección **ESTADO GLOBAL**
- `claude/a3-3-bloque5-borrados.md`, `claude/a2-restore-bajo-a33.md`
- `claude/checkpoint-bloque5-2026-09-15.md`

**Estados, al 15 sept 2026 (tras la ronda H-1):** **A2 CERRADO** y **P2
CERRADO**, con la evidencia de arriba —1745 OK/0 automatizados, 66 OK/0 en
Electron real y siete reversiones que tumban exactamente lo suyo—. Los Bloques
1–5 de A3.3 siguen cerrados. **No se marca cerrada ninguna auditoría nueva**: B,
C, D, E y F siguen como estaban, y **E1 sigue bloqueando la publicación**.
