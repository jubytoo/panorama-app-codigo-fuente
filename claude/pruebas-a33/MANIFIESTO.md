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
| `f2f3/` | **F2 (sin CSP) — CERRADO el 17 sept 2026 (su batería vive en `f2/`). F3 (sin `setWindowOpenHandler`) — CERRADO el 17 sept 2026.** Desde F2, seis anclajes de esta batería que describían «sin CSP» se actualizaron con su nota (`F2-A12`, `F2-B13`, `F2-B14`, `F2/F3-Z2..Z4`); sigue en **63 OK / 0**. Desde la implementación de F3, `test-f2f3.js` (**63 OK / 0**) **EXIGE** la política: helper único, ventana hija denegada siempre, `new URL` como validador (no `startsWith`), rechazo de `openExternal` capturado, rastro sin la URL entera, la política en las 10 ventanas, y la navegación interna legítima (recarga, ancla y `blob:`) preservada; ejecuta además el validador real contra 11 destinos denegados y 2 permitidos. `electron-f2f3.ps1` (**35 OK / 0**) lo exige en la app real con un **espía sobre `shell.openExternal`** —sin abrir Internet— cubriendo `about:blank`, `file://`, `data:`, `javascript:`, esquema inventado, URL malformada, `http`/`https` válidos, el enlace de entregable, `will-navigate`, `location.reload()` y `blob:`. `revertir-f3.js` + `comprobar-reversiones-f3.js` (**5 OK / 0**) y `electron-f3-revertido.ps1` (**4 OK / 0**), que reproduce las tres señales del defecto. *Lo que sigue describe el diagnóstico previo de los dos:* **DIAGNÓSTICO, sin implementar.** Dos hallazgos separados que comparten superficie. `test-f2f3.js` (**45 OK / 0**, descriptiva) recupera los dos hallazgos originales **literalmente** y mide: 0 CSP por `<meta>` **y** 0 por cabecera; de qué depende cada ventana (7 con `<script>` en línea, 9 con estilos en línea, 0 recursos externos, 1 Worker, `blob:` solo para descargar); `eval`/`new Function` **ausentes en el código propio** y presentes solo en mammoth/pdf.js; y la superficie de F3 (0 `window.open` del producto, **un** `target="_blank"`, 0 guardianes, 10 `new BrowserWindow`). `electron-f2f3.ps1` (**23 OK / 0**) lo mide en la app real: prueba una **CSP candidata** contra scripts/estilos en línea, vendor por `file://`, Worker de pdf.js y descargas `blob:`, y contesta la pregunta decisiva —**`unsafe-eval` NO hace falta**: con `new Function` bloqueado, mammoth lee un `.docx` real y pdf.js abre un `.pdf` real construidos por la propia batería—; y reproduce F3 (que venía **[LEÍDO]**): `window.open` abre `BrowserWindow`, es la «ventana negra» (`Electron` / `about:blank`), y la hija **no** hereda puente ni Node |
| `f2/` | **F2 — Content-Security-Policy. CERRADO (17 sept 2026).** Por **cabecera** desde un único punto de `main.js`, con **cuatro perfiles** (`cerrado`, `sinScriptEnLinea`, `interfaz`, `lectorDeActas`). `test-f2.js` (**97 OK / 0**, EXIGENTE): el texto EXACTO de cada perfil; `unsafe-eval` ausente en la política **y** en el código; sin `file:` (redundante con `'self'` en `file://`), sin comodines ni hosts; `data:` solo en `img-src`; `blob:` solo en el `worker-src` de Preparación; el reparto documento→perfil **ejecutado** con la función real (las 10 ventanas, mayúsculas, `%20`, asar, Drive, `..`, UNC, URL rota → `cerrado`); el enganche **ejecutado** con dobles (mapa que lanza → `cerrado`); el inventario de plantillas que sostiene cada perfil; y el arranque del Worker de pdf.js por `blob:`. `electron-f2-lab.ps1` + `real-run/f2-laboratorio.js` (**41 OK / 0**): **el motor**, sin cargar el producto —cabecera con `file://` y asar, `'self'` = `file:`, modo REAL/FAKE del Worker de pdf.js, descargas sin `blob:`, frame/object/form/base, red contra un servidor **local** que cuenta visitas con su control sin CSP, `executeJavaScript` con `default-src 'none'`, control de `unsafe-eval` y **Workers `file:` sin CSP frente a `blob:` que la heredan**—. `electron-f2.ps1` + `real-run/f2-csp.js` (**212 OK / 0**): **la app real**, las 10 ventanas con su política EFECTIVA (leída del evento de violación de Chromium), recursos, exportaciones reales (CSV/Excel/PowerPoint con logo, Directorio, Evaluación, guion), actas `.docx`/`.pdf` por `handleActaFile` con Worker real, corte de red y de incrustados en 8 ventanas con **cero visitas**, restauración, proyecto **creado con el `main.js` pre-F2** (fase A sin CSP → fase B con CSP, también en **solo lectura**) y proyecto nuevo; más el diagnóstico `pptx` (ventana oculta, con y sin F2). `revertir-f2.js` + `comprobar-reversiones-f2.js` (**31 OK / 0**): **diez familias**, cada una tumba exactamente lo que anuncia. `electron-f2-revertido.ps1` (**7 OK / 0**): sin CSP salen fetch e imagen remotos; con `unsafe-eval` vuelve `new Function`; con `worker-src 'none'` el acta se lee pero sin Worker real |
| `p9/` | **P9 — `location.json` presente pero inutilizable. CERRADO (17 sept 2026), ALTO / INTEGRIDAD.** `test-p9-location.js` (**282 OK / 0**) pasó de descriptiva a **EXIGENTE**. Ejecuta las funciones REALES —el lector único `leerConfigUbicacion`, el arranque a nivel de módulo, `decidirCrearSiAusente`, `handleFatalStartupError` (con `original-fs`), `syncDriveSyncGuardWithLocation` y `detenerArranquePorConfigUbicacion`— con un **espía de escrituras**, y cubre P9-1..P9-14: ~80 variantes de bytes; permisos denegados o bloqueos con dobles de `fs`; el rescate sin copias ante una config inválida; la protección intacta; la parada de `whenReady` en primer lugar, con su aviso exacto (solo «Cerrar», sin rutas); lo que **no** es P9 (`[REGISTRA]`: JSON válido con ruta inaccesible, el `.bat` y el instalador); y el `location.json` real de esta máquina en **solo lectura** (`P9-Z3`). `electron-p9.ps1` (**111 OK / 0**, 32 casos) lo exige en la app real: cero ventanas, ninguna BD abierta ni creada, residuo, compartida, `location.json` y registro intactos, protección sin tocar; archivo **bloqueado de verdad** por otro proceso (EBUSY) y carpeta en su lugar (EISDIR). Admite `P9_SOLO`, `P9_MAIN_FUENTE` y `P9_SALIDA_JSON`. `revertir-p9.js` + `comprobar-reversiones-p9.js` (**29 OK / 0**): **siete familias** —A BOM, B inválido = ausente, C sin ruta absoluta, D creación local, E abrir el residuo, F rescate por defecto, G protección sin guarda—, cada una tumba **solo** lo suyo. `electron-p9-revertido.ps1` (**14 OK / 0**): A–E en la app real, con su garantía de sandbox. *Lo que sigue es la descripción del diagnóstico:* `test-p9-location.js` (**137 OK / 0**, DESCRIPTIVA) recupera el hallazgo literal; inventaria lectores (tres en `main.js` y `Restaurar-backup.bat`), escritores (app e instalador) y el borrador; mide `JSON.parse`/`readFileSync` con BOM, UTF-16 y ANSI; **ejecuta** las lecturas reales contra ~33 variantes de bytes y contra errores de lectura (dobles de `fs` acotados); el arranque a nivel de módulo (unidad no montada, acceso denegado, relativa, inexistente, ANSI); la decisión de A3.3 en la carpeta por defecto; el efecto sobre la protección de apagado; y una **copia** del `.bat` en sandbox (sin copias de asar: sale antes de copiar). `electron-p9.ps1` + `real-run/p9-ubicacion.js` (**48 OK / 0**, 26 arranques): qué BD abre la app real en cada caso, con una BD «compartida» y otra «residual» identificables, variantes sin residuo, con registro y con registro corrupto, la protección de apagado activa (marca en el sandbox) y una **copia** del residuo real de P10 (solo se muestra **cuántos** proyectos). El arnés **bloquea y anota** `reg`/`schtasks`/`powershell`/`wscript`/`cscript`/`cmd` y cualquier copia de `original-fs` fuera del sandbox, y compara al final el **valor** de la entrada de HKCU\…\Run |
| `p10/` | **P10 — `%APPDATA%\panorama-app`. DIAGNÓSTICO (17 sept 2026), sin tocar nada.** **No son baterías de regresión**: miden los datos REALES de esta máquina (como `c1/inventario-vivo.js`), así que no llevan el prefijo `test-` ni entran en el recuento. Todo es de **solo lectura**. `inventario-p10.js` (Node del sistema) trae las funciones de escritura de `fs` trucadas para que lancen, abre las dos BD **en memoria** y cubre familias, los 20 archivos más grandes, la BD residual (esquema, Seguridad frente a la viva, pareja de cada proyecto), los backups frente a G: por hash, las particiones, el perfil de Chromium, los `.asar` (versión leída de su cabecera) y el `app.log`. Nunca imprime nombres de proyecto ni valores, y termina con **exit 98** si cambia la huella del árbol, alguna de las dos BD o `location.json`. `electron-p10-localstorage.ps1` copia **solo** las carpetas `Local Storage` (del residuo y de G:) a `%TEMP%\_a33-p10-ls`, las lee con `real-run/p10-localstorage.js` (página en blanco `file://` en cada partición de la copia) y las compara con `comparar-localstorage-p10.js` por hashes: estado, campos, elementos y propiedades. Aborta si Panorama está abierto y compara la huella de los originales antes y después |
| `p22/` | **P22 — la carpeta local como destino, y el rescate PS-1007. DIAGNÓSTICO (17 sept 2026).** `test-p22-reserva.js` (**33 OK / 0**, DESCRIPTIVA, entra en el recuento) ejecuta las funciones reales contra un sandbox: los flujos de PS-1005 (incluido `cancelId: 1`, que hace que cerrar el diálogo equivalga a «datos locales»), PS-1009 y su caída **sin diálogo** cuando la BD compartida no se puede comprobar, el arranque sin `location.json` con y sin señales de ubicación previa, la matriz de `decidirCrearSiAusente` en esos caminos, y —**solo la selección, nunca la copia**— qué `app.asar.bak` elegiría PS-1007, con `.asar` **sintéticos** de versiones conocidas. `electron-p22.ps1` + `real-run/p22-reserva.js` (**14 OK / 0**, 12 arranques) lo mide en la app real con una **copia** de la BD residual de P10: qué BD queda en uso, si **cambia su hash**, qué diálogos salen y cuáles no, y los avisos que se pintan **dentro** del lanzador (`p22-reserva.js` envuelve al arnés de P9 y solo añade esa captura). `rescate-esta-maquina.js` (**no** es batería: solo lectura sobre las rutas reales) dice qué copia restauraría PS-1007 hoy, sin `location.json` y con G: sin montar |
| `p18/` | **P18 — el rescate PS-1007 y la procedencia de las copias de `app.asar`, y `Restaurar-backup.bat`. DIAGNÓSTICO (18 sept 2026), sin tocar nada.** `test-p18-procedencia.js` (**63 OK / 0**, DESCRIPTIVA, entra en el recuento) ejecuta las funciones REALES (`resolveDataDirForStartupRecovery`, `findLatestAsarBackupForRecovery`, `purgeOldAsarBackups`) contra un sandbox con `.asar` **sintéticos** de versiones conocidas —unos cientos de bytes, con su `package.json` dentro— y mide los diez casos A–J del encargo, la discrepancia **nombre vs mtime** entre el rescate y la purga, y qué metadatos existen hoy. Además **ejecuta de verdad** una copia del `.bat` en sandbox (`APPDATA` redirigido) y demuestra que el **mismo** `location.json` en una línea o en varias lleva a **dos instalaciones distintas**. `inventario-p18.js` (**no** es batería: solo lectura sobre esta máquina, con todas las escrituras de `fs` trucadas) lista las copias reales con tamaño, fecha, SHA-256 y **versión leída de la cabecera del asar sin ejecutarlo**, y cuenta cuántas **instalaciones distintas** han escrito en cada `patch-log.txt` |
| `real-run/` | Envoltorios que cargan el `main.js` REAL dentro de Electron. **Ojo con dos homonimias:** `b5.js` y `b4.js` son de los **Bloques 5 y 4 de A3.3**, no de los hallazgos B4/B5 de la auditoría; esos son `b4-reorder.js` y `b5-reentrancia.js`. `c1-particion.js` es de C1; `f1-inyeccion.js` y `f1-limpio.js` son de F1; `p17-assets.js` es de P17; `f2-csp.js` y `f2-laboratorio.js` son de F2 (el laboratorio **no** carga `main.js`); `p9-ubicacion.js` es de P9; `p10-localstorage.js` es de P10 y **no** carga `main.js`. `f2-csp.js` admite `F2_MAIN_FUENTE`, y `p9-ubicacion.js` admite `P9_MAIN_FUENTE` (solo copias de `p9/revertidos/`): los dos compilan otra fuente **como si fuera** el `main.js` del proyecto (sus `require` relativos resuelven igual), sin copiar nada a la raíz |
| `lock-harness/`, `nucleo-a33/`, `probe/`, y los sueltos de la raíz | Material de rondas anteriores (A1, A2 original, B2, `setMeta`, benchmarks). Se conservan como histórico |

---

## 4. RESULTADO CONOCIDO MÁS RECIENTE

```
REGRESIÓN AUTOMATIZADA COMPLETA:  1745 OK / 0 FALLOS   (16 sept 2026, tras C1-A)
TODOS LOS test-*.js, TRAS F1:     2961 OK / 0 FALLOS   (16 sept 2026, tras F1)
TODOS LOS test-*.js, TRAS P17:    3031 OK / 0 FALLOS   (17 sept 2026, tras P17)
TODOS LOS test-*.js, TRAS F3:     3094 OK / 0 FALLOS   (17 sept 2026, tras F3)
TODOS LOS test-*.js, TRAS F2:     3191 OK / 0 FALLOS   (17 sept 2026, tras F2)
TODOS LOS test-*.js, CON P9:      3328 OK / 0 FALLOS   (17 sept 2026, diagnóstico de P9)
TODOS LOS test-*.js, TRAS P9:     3475 OK / 0 FALLOS   (17 sept 2026, P9 implementado; 3518 con comun/)
TODOS LOS test-*.js, TRAS P22:    3550 OK / 0 FALLOS   (18 sept 2026, P22 implementado; 3593 con comun/)
TODOS LOS test-*.js, CON P18:     3613 OK / 0 FALLOS   (18 sept 2026, diagnóstico de P18; 3656 con comun/)
```

> **Diagnóstico de P18 (18 sept 2026):** añade `p18/test-p18-procedencia.js`
> (**63 OK / 0**, DESCRIPTIVA) al criterio, igual que se contó `p9/` y `p22/`
> mientras eran diagnóstico → 3550 + 63 = **3613** con `nucleo-a33` en 394
> (**3614** cuando da 395; es **ARN-1**, medido otra vez en esta misma ronda:
> dos tiradas seguidas, una con cada valor). **`main.js` no se ha tocado**:
> sigue en `C4C00809…`. `p18/inventario-p18.js` **no** entra en el recuento —no
> es `test-*.js`—, porque mide los archivos reales de esta máquina.

> **P22 implementado (18 sept 2026)** mueve `main.js` (`2D05E00B…` →
> `C4C00809…`, 639 056 B, +559/−39). **3550 OK / 0 FALLOS** en 27 baterías, con
> `nucleo-a33` en **394** (ARN-1).
>
> **Qué cambia respecto a la tirada de P9:**
>
> - `p22/`: **+74**, ahora exigente (nació descriptiva con 33).
> - `bloque3/test-error-codes.js`: 45 → **47** (dos códigos nuevos con literal).
> - `c1/test-c1-residuos.js` (`C1-P1`): era descriptiva y decía «la app vuelve a
>   la carpeta por defecto si falla la configurada», comprobándolo por el botón
>   `'Abrir con datos locales (temporal)'`. P22 **elimina** ese botón, así que la
>   aserción se reescribió para describir lo que hay ahora. Comprobado en los dos
>   sentidos: con el `main.js` anterior a P22 la nueva aserción **falla**.
> - `p9/` y `bloque2/`: solo declaraciones nuevas en sus ámbitos
>   (`defaultUserDataDir`, `sesionLocalTemporal`, `usuarioAutorizaCrearLocal`,
>   `huboUbicacionPersonalizada`). `p9/` sigue en **282**.
>
> **Cuadre exacto:** 3475 (P9, con `nucleo-a33` en 395) **−1** (esta vez dio 394)
> **+2** (`bloque3`) **+74** (`p22`) = **3550**. `c1` sigue en **165**: cambió
> *cuál* es la aserción, no cuántas.
>
> Los `test-*.js` sueltos de la **raíz** (`test-a1*`, `test-a2`,
> `test-b2`, `test-setmeta`) siguen fuera del criterio —material anterior a A3.3,
> roto desde entonces— y se comprobó que **ninguno de ellos lee `main.js`**, así
> que P22 no puede ser su causa.

> **Diagnóstico de P22 (17 sept 2026):** añadió `p22/test-p22-reserva.js`
> (**33 OK / 0**, descriptiva) al criterio, igual que se contó `p9/` mientras
> era diagnóstico → **3508**. No se relanzó entonces la regresión entera: el
> diagnóstico no tocaba producción. `p10/` **no** entra en el recuento: no son
> `test-*.js`, porque miden los datos reales de esta máquina.

> **P9 implementado** mueve `main.js` (`E7D596A8…` → `2D05E00B…`).
>
> **Cuadre de la cifra.** Respecto a la tabla por archivo de F2 cambian solo
> dos baterías:
>
> - `p9/`: **+282**, ahora exigente (antes 137 descriptivas).
> - `bloque3/test-error-codes.js`: 44 → **45**. Genera una aserción por cada
>   código usado con `errorCodeSuffix`, y ahora está PS-1020.
>
> **`nucleo-a33` no es estable: da 394 o 395 según la tirada**, sin relación
> con P9. Está registrado como pendiente de arnés **ARN-1** en
> `claude/pendientes-abiertos.md`: hay que hacerlo determinista antes del E2E o
> del release final. Medido hoy: en 8 tiradas seguidas, 7 dieron 394 y 1 dio 395. Tiene
> una rama que depende del tiempo: «LOCAL, peor caso (mismo tamaño y mismo
> mtime)» añade una línea cuando se reproduce. Así cuadran las dos cifras:
>
> - La **3191** de F2 cuadra con una tirada en 394. Es razonado, no medido: su
>   tabla por archivo suma 3192 con 395, y la salida de esa tirada no se
>   conserva.
> - La regresión de P9 salió con **395**: 3475 = 3192 + 282 + 1. Con 394
>   serían 3474 = 3191 + 282 + 1.
>
> Se lanza con el `node` del sistema, como siempre. Con el Node de Electron
> (`ELECTRON_RUN_AS_NODE`), `c1/` falla con «Invalid package …asar»: el `fs`
> parcheado de Electron trata como paquete el `.asar` de mentira que fabrica
> esa batería. Es un artefacto del entorno, no de P9.
>
> **Saltaron tres arneses, y ninguno por una regresión de producto:**
>
> - `bloque2/test-wiring.js` **revienta** con
>   `ReferenceError: configUbicacionNoResuelta is not defined`.
>   `decidirCrearSiAusente` consulta esa variable nueva y el ámbito del arnés no
>   la declaraba. Se declara, con su nota. Medido con la versión de HEAD.
> - `bloque3/test-error-codes.js`: el anclaje de orden esperaba PS-2001 justo
>   detrás de PS-1019, y ahora va PS-1020 en medio. Se mantiene la intención:
>   los cuatro de A3.3 salen **seguidos**.
> - `e1/test-inventario-e1.js` (`E1-M4`): el hash de `main.js`.

> 3328 = 3191 + las **137** de `p9/` (descriptiva; se cuenta igual que se contó
> `f2f3/` cuando era diagnóstico). Ninguna otra batería ha cambiado: P9 no
> toca producción.
>
> **BD viva:** durante la ronda de P9 su huella pasó de `D5C3FF53…` a
> `C26323D1…` por una **sesión real del usuario**, entre dos tiradas del arnés.
> Todas las tiradas dieron idéntica frente a su propio inicio. La línea base
> está actualizada, con su motivo, en `comun/baseline-bd-viva.json`.

> **Criterio del recuento** (el mismo desde F1): las 18 carpetas `nucleo-a33`,
> `bloque1..5`, `a2`, `e1`, `p12`, `e2`, `b1`, `b3`, `b4`, `b5`, `c1`, `f1`,
> `p17`, `f2f3` —más `f2` desde esta ronda—, sumando el **resumen final** de cada
> `test-*.js`. `comun/test-guardia.js` (**43 / 0**) va aparte. 3191 = 3094 + las
> **97** de `f2/`: ninguna otra batería ha ganado ni perdido aserciones.

La primera cifra es la del núcleo, como se venía contando. La segunda es la
tirada **completa** de esta ronda —todos los `test-*.js` de `nucleo-a33`,
`bloque1..5`, `a2`, `e1`, `p12`, `e2`, `b1`, `b3`, `b4`, `b5`, `c1` y `f1`
sumados— para dejar constancia de que F1 no rompió nada: núcleo y bloques
**2657**, más **C1 165** y **F1 139**. Aparte: reversiones de F1 **19 OK/0** y
las 7 de C1-A, que siguen rompiendo cada una por lo suyo.

Contra `main.js` = `3A0D7217A6A7AF056ED7079168E3B974D74858A20F92A3DAAD0BECC75A7AE686`
(667 265 B, tras P18 Fase 1; antes `C4C00809…` tras P22, 639 056 B; `2D05E00B…` tras P9, 610 975 B; `E7D596A8…` tras F2, 601 293 B;
`16AB5F53…` tras F3, `434BB294…` tras P17,
`0BC92A46…` tras F1, `F81F0A3D…` tras C1-A),
`preparacion-reunion/plantilla_preparacion_reunion.html` =
`69F66B8C7D0572F8E1B16E1CCDD3EEDA3580363CB4C86A91771A81AE56502BD3` (80 881 B,
tras F2; antes `F3F9130B…`) y
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
>
> **F3 lo mueve una vez más** (`434BB294…` → `16AB5F53…`): la política de
> apertura y navegación. Aquí **sí hubo una regresión de verdad, no solo
> anclajes**: A2 se fue a **54 fallos** con `aplicarPoliticaDeNavegacion is not
> defined`, porque sus arneses extraen `writeLocalStorageDumpToPartition` y
> `runInPartition`, que ahora llaman al helper. Es exactamente el aviso que da
> la cabecera de `comun/bloque5-extraccion.js`: **si la lista se queda corta, el
> arnés revienta a propósito**. Se añadieron las cinco funciones de F3 a esa
> lista compartida. Aparte, `E1-M4`, `F1-Z1` y `F2/F3-Z2` se actualizaron con su
> nota.
>
> **F2 lo mueve de nuevo** (`16AB5F53…` → `E7D596A8…`): la CSP por cabecera
> (`CSP_PERFILES`, `perfilCspDeDocumento`, `instalarCspEnSesion` y su registro
> en `session-created`). Toca además **una** plantilla, la de Preparación
> (arranque del Worker de pdf.js por `blob:`). Esta vez **no hubo regresión de
> producto** en ninguna batería Node: ninguna función que extraigan los arneses
> llama a las nuevas, así que la lista compartida **no** hubo que tocarla.
> Saltaron solo anclajes de **estado** y de **hash**, que se actualizaron con su
> nota: `E1-M4` (hash de `main.js`), `F1-Z1` (esperaba F2 «ABIERTO») y, en
> `f2f3/test-f2f3.js`, `F2-A12` (esperaba **cero** cabeceras), `F2-B13` (el
> Worker de Preparación se cuenta ahora 2 veces: `workerSrc` y `new Worker`),
> `F2-B14` (nota) y `F2/F3-Z2..Z4`.
>
> **Nota de procedimiento, sin relación con F2:** `c1/comprobar-reversiones-c1.js`
> **no regenera** sus copias revertidas, y las que había eran del 16 sept 14:01
> —anteriores a F1, P17, F3 y F2—. Contra el `main.js` actual, cinco de las
> siete fallaban con `NO SE ENCONTRO: function urlExternaPermitida(url)` (una
> función de F3 que desde esa ronda está en la lista de extracción). No es una
> regresión: con `node c1/revertir-c1.js` primero, **las siete vuelven a romper
> exactamente por lo que deshacen**. Hay que lanzar siempre las dos, en ese
> orden.

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
| `f2f3/electron-f2f3.ps1` | **36 / 0** *(35 tras F3 + `F2-CSP0` desde F2. **Exige** 0 ventanas nuevas y `shell.openExternal` espiado, sin abrir Internet. Antes del arreglo, en diagnóstico: 23 / 0)* |
| `f2f3/electron-f3-revertido.ps1` | **4 / 0** *(sin política, el defecto REAPARECE: `about:blank`, `file://` y `<a target="_blank">`)* |
| `f2/electron-f2-lab.ps1` | **41 / 0** *(el motor, sin cargar el producto; servidor solo en 127.0.0.1)* |
| `f2/electron-f2.ps1` | **212 / 0** *(las 10 ventanas: completo 167, proyecto pre-F2 39, diagnóstico `pptx` 3 + 3)* |
| `f2/electron-f2-revertido.ps1` | **7 / 0** *(sin CSP, con `unsafe-eval` y con `worker-src 'none'`: la batería ve cada defecto)* |
| `p9/electron-p9.ps1` | **111 / 0** *(EXIGENTE tras implementar P9; 32 casos. En el diagnóstico, 48 / 0 describiendo el defecto. Además de la BD viva y los productivos, comprueba intactos la configuración real, el residuo de P10 y el **valor** de HKCU\…\Run)* |
| `p9/electron-p9-revertido.ps1` | **14 OK / 0** *(reversiones A–E de P9 en la app real: cada defecto REAPARECE —el BOM cae; el residuo se abre y su hash cambia; se crea una BD nueva; la protección se desactiva; vuelve `datos\relativa`—)* |
| `p22/electron-p22.ps1` | **39 OK / 0** *(EXIGENTE; 14 arranques reales sobre una **copia** del residuo de P10, con `real-run/p22-reserva.js`. Mide, por caso: qué BD abre, el hash de la BD local antes/después, el testigo `.gen`, el registro de A3.3, la **marca** de ubicación por contenido, la marca de la protección de apagado, los `reg`/`schtasks` bloqueados, y cada diálogo con sus **botones, `cancelId` y elegido**. Esc/X se responden de verdad. Comprueba intactos, además de la BD viva y los productivos, la configuración real, el residuo de P10 y el **valor** de HKCU\…\Run)* |

> **Tras P22 se reejecutó la tabla ENTERA**: P22 toca el arranque **antes** que
> P9 (la puerta va delante de la splash, de la protección, del candado, de A3.3 y
> de `getDb`). Los **19** arneses ajenos a P9 dieron **exactamente las mismas
> cifras**, sin un solo ajuste. Los dos de P9 sí cambiaron, y **ninguno por una
> regresión de producto**:
>
> - `p9/electron-p9.ps1`: tres aserciones. Dos exigían `ndialogos = 0` sin
>   `location.json` —abrir o crear en la carpeta local **sin preguntar**, que es
>   lo que P22 elimina—. Y hay una causa que hubo que **medir**, no suponer: la
>   base de ese arnés se prepara arrancando la app con una ubicación configurada,
>   así que desde P22 **todos** sus casos heredan `historial-ubicacion.json` y
>   ninguno es ya «una máquina sin historia». Se añadió el campo `marcaBase` para
>   dejarlo demostrado. La tercera era un `[REGISTRA]` del defecto **P20**; ahora
>   exige lo contrario.
> - `p9/electron-p9-revertido.ps1`: dos aserciones. Con la reversión **B** de P9,
>   su defecto **sí reaparece** (no hay PS-1020), pero **P22 frena el daño**: no
>   se crea una base nueva en silencio y la protección no se desactiva. **Defensa
>   en profundidad**, y ahora se exige.
>
> En ambos cambió **qué** se exige, no **cuántas** aserciones: tras reescribir
> las cinco, `electron-p9.ps1` vuelve a dar **111 / 0** y
> `electron-p9-revertido.ps1` **14 / 0**, las cifras de siempre.
>
> `bloque1\arranque-real.ps1` y `bloque1\arranque-con-bd.ps1` **no** están en
> esta tabla y **hoy no se pueden ejecutar**: tienen escrita a fuego la ruta del
> *scratchpad* de una sesión de 2026 ya borrada, donde vivían sus ayudantes
> (`semilla-legada.js`, `ver-conbd.js`, el envoltorio `real-run`). Es anterior a
> P22 y no depende de él. Queda anotado como pendiente de arnés.

> **Tras P9 se reejecutó la tabla ENTERA** (P9 toca el arranque más temprano).
> Los **19** arneses dieron **exactamente las mismas cifras** que tras F2, sin
> ningún ajuste; A2 **66 / 0**. Cada uno se lanzó en su **propio proceso**
> PowerShell, porque algunos cambian `APPDATA` del proceso. BD viva idéntica en
> todos (`C26323D1…`).
>
> **Tras F2 se reejecutó la tabla ENTERA** (F2 cambia el comportamiento de
> todas las ventanas). Mismas cifras en todos salvo tres arneses, y **ninguno
> por una regresión de producto**:
>
> - `f2f3/electron-f2f3.ps1` dio **30 / 5** en su modo `csp`: su página de
>   laboratorio es un `file://` ajeno al producto y **recibe la política
>   cerrada** —el cierre por defecto de F2 funcionando—. Se deja constancia con
>   `F2-CSP0` y la candidata se sigue midiendo **aislada** (partición propia sin
>   el oyente de `main.js`), que es lo que ese modo siempre midió → **36 / 0**.
> - `f1/electron-f1.ps1` (**45 / 2**, `F1-RA10/RA11`) y
>   `f1/electron-f1-limpio.ps1` (**51 / 1**, `F1-N3`) seguían DESCRIBIENDO la
>   exposición **anterior a F3** («`window.open` crea una BrowserWindow»). Es
>   efecto de **F3**, no de F2: `f2f3` exige lo contrario (`F3-1`) y la CSP no
>   gobierna `window.open`. **La ronda F3 no reejecutó estos dos arneses** y no
>   se vio entonces. Invertidas con su nota → **47 / 0** y **52 / 0**.
>
> **ARNÉS / CAPTURA — OBSERVACIÓN NO RESUELTA** (así registrada al cerrar F2): en `electron-f1-limpio.ps1` la captura
> `6-directorio-ficha.png` sale de 0 bytes (el arnés no lo comprueba; no se ha
> averiguado si ya pasaba antes de F2). La batería F2 mide el Directorio
> directamente —recursos, logo, cero violaciones— y está en verde.

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

F2 (17 sept 2026):

```
f2/electron-f2-lab.ps1        el motor: laboratorio de CSP sin cargar el producto
f2/electron-f2.ps1            las 10 ventanas + proyecto pre-F2 + diagnostico pptx
f2/electron-f2-revertido.ps1  reversiones A, B y F de revertir-f2.js en la app real
node f2/comprobar-reversiones-f2.js   (genera f2/revertidos/ y comprueba las 10)
```

> **Dos trampas que salieron en F2.** (1) Un arnés que abre y **destruye** su
> única ventana necesita `app.on('window-all-closed', () => {})`: sin él Electron
> cierra la app y la carga siguiente se aborta con `ERR_FAILED (-2)`, sin
> `did-fail-load`. (2) Los arneses arrancan Electron **minimizado**, y con la
> ventana oculta **pptxgen no termina** (ni con ni sin F2; `--modo=pptx` lo
> reproduce): antes de exportar a PowerPoint hay que mostrar la ventana. Y una
> tercera, menor: `executeJavaScript` **no resuelve** si la ventana se cierra
> por su propio botón mientras tanto; `f2-csp.js` le pone tope.

> **Trampa que costó un susto:** PowerShell **no distingue mayúsculas en los
> nombres de variable**. Un `$p = Start-Process …` en el ámbito raíz **pisa
> `$P`**, la ruta del proyecto, y el guardián de salida declara «CAMBIO EN
> PRODUCCION» en los nueve archivos — un falso positivo alarmante. En
> `a2/electron-real.ps1` no pasa porque allí el `Start-Process` vive dentro de
> una función y su `$p` es local. Los arneses nuevos usan `$proc`.
>
> **Volvió a pasar en P9** con otra pareja: `$r` (el resultado de un caso)
> **pisó `$R`** (la raíz del sandbox). Todos los casos siguientes arrancaron
> con un sandbox inválido y, al final, **el sandbox no se borró** (se borró a
> mano). También `$b`/`$B` y `$s`/`$S`. Regla: **ninguna variable que
> difiera de otra solo en mayúsculas**.

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
| `PANORAMA_PREPARACION` | Ídem para la plantilla de Preparación en `f2/test-f2.js` |
| `P9_MAIN_FUENTE` | Arranques Electron de P9 (`real-run/p9-ubicacion.js`), con el mismo mecanismo que `F2_MAIN_FUENTE`; solo admite copias de `p9/revertidos/`. En `electron-p9.ps1` afecta a los **casos**, nunca a la preparación de la base |
| `P9_SOLO`, `P9_SALIDA_JSON` | `electron-p9.ps1`: arrancar solo algunos casos (`base/id`, separados por comas) **sin aserciones**, y volcar el resultado de cada caso a un JSON. Los usa `electron-p9-revertido.ps1` |
| `P22_ELECCION` | Arranques Electron de P22 (`real-run/p22-reserva.js`): qué se responde a los diálogos NATIVOS del arranque —`esc` (equivale a Esc/X: elige `cancelId`), `cerrar`, `local`, `crear`—. **Solo actúa en `--modo=caso`**: la preparación de la base usa el envoltorio de P9 sin tocar, porque si no respondía «usar datos locales» a su PS-1009 y la base no se creaba |
| `F2_MAIN_FUENTE` | Arranques Electron de F2: `real-run/f2-csp.js` **compila** esa fuente como si fuera `main.js` del proyecto (`Module._compile` con `filename` = el `main.js` real), así que sus `require` relativos resuelven y **no se copia nada a la raíz**. Se usa para el `main.js` pre-F2 (`claude/main.js.ANTES-F2-2026-09-17`) y para las reversiones |

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

`SHA256SUMS.txt` (en esta misma carpeta) lista el **SHA-256 de los 260
archivos** de la batería, con ruta relativa. Se regenera con
`comun/regenerar-sumas.js` y se comprueba con `comun/verificar-copia.js`
(recorrido independiente, exit 0 solo si no falta ni difiere nada y **no hay
ningún `.sqlite3` dentro del repositorio**).

Última verificación (18 sept 2026, tras el DIAGNÓSTICO de P18): **260
listados, 0 faltan, 0 difieren, 0 `.sqlite3`**. P18 añade
`p18/test-p18-procedencia.js` y `p18/inventario-p18.js`.
*(Tras implementar P22: 258 y 4 636 450 bytes.)* La
implementación de P22 añade `p22/revertir-p22.js` y
`p22/comprobar-reversiones-p22.js` (`p22/revertidos/` no se lista).
*(Tras el diagnóstico de P22: 256.)* El diagnóstico de P22 había añadido
`p22/test-p22-reserva.js`, `p22/electron-p22.ps1`,
`p22/rescate-esta-maquina.js` y `real-run/p22-reserva.js`.
*(Tras el diagnóstico de P10: 252.)* P10 añade `p10/inventario-p10.js`,
`p10/comparar-localstorage-p10.js`, `p10/electron-p10-localstorage.ps1` y
`real-run/p10-localstorage.js`. *(Tras implementar P9: 248.)* P9 añade
`p9/revertir-p9.js`, `p9/comprobar-reversiones-p9.js` y
`p9/electron-p9-revertido.ps1`; `p9/revertidos/` no se lista. *(Tras el
diagnóstico de P9: 245 y 4 447 760. Tras F2: 242 y
4 378 427; el diagnóstico de P9 añadió `p9/test-p9-location.js`,
`p9/electron-p9.ps1` y `real-run/p9-ubicacion.js`.)* Las carpetas
`*/revertidos/` no se listan: las regeneran los `revertir-*.js`. *(Tras F3:
234 archivos, 4 210 383 bytes; F2 añade 8: `f2/` —6— y `real-run/f2-csp.js`,
`real-run/f2-laboratorio.js`.)*

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
