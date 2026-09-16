# A2 — Restaurar un backup: causa raíz, flujo, carreras y diseño

Diagnóstico y diseño. **No se ha modificado ni una línea de código.**

Hallazgo original (auditoría 2026-09-13, punto A2): *"Restaurar un backup
guarda antes, automáticamente, el estado que se está descartando."* Al
analizarlo a fondo aparecen **cuatro** defectos, no uno.

---

## 1. Flujo actual completo

### 1.1 Puntos de entrada (cuatro)

| # | Origen | Camino | `backupId` |
|---|---|---|---|
| 1 | Botón "Restaurar último backup" de la tarjeta del lanzador | `launcherAPI.restoreBackup(id, null)` → IPC `backup:restore` | `null` (el más reciente) |
| 2 | Ventana "Restaurar un backup concreto…" | `backupPickerAPI.restoreBackup(bk.id)` → mismo IPC | id elegido |
| 3 | Menú nativo `Proyecto → Restaurar último backup…` (línea 3478) | llamada directa | `null` |
| 4 | Menú propio de la ventana de proyecto → `projectMenu:action` (línea 5688) | llamada directa | `null` |

Los cuatro acaban en `restoreProjectBackup(projectId, backupId)` (línea 2382).

### 1.2 Secuencia real

```
2383  lee la fila del proyecto
2385  elige el backup (concreto o el más reciente por created_at)
2391  readBackupPayload() -> lee el archivo, lo descifra si hace falta, JSON.parse
2396  if (projectWindows.has(projectId)) {
2398      w.close()                      <-- NO espera
2399      projectWindows.delete(projectId)
      }
2402  writeLocalStorageDumpToPartition(partition, dump, {clearFirst:true})
2403      .then(() => openProjectWindow(row))
```

Y `writeLocalStorageDumpToPartition` (2344) abre una **ventana oculta sobre la
misma partición**, carga `restore-helper.html` y ejecuta
`localStorage.clear()` seguido de un `setItem` por clave.

### 1.3 Lo que ocurre en paralelo, sin que este código lo sepa

`w.close()` de la línea 2398 dispara `attachFlushOnClose` (2041), que está
enganchado a **todas** las ventanas de proyecto:

```
2044  e.preventDefault()                 <-- la ventana NO se cierra todavía
2066  win.webContents.send('app:flushBeforeClose', ackChannel)
2054  ... con un tope de FLUSH_BEFORE_CLOSE_TIMEOUT_MS = 4000 ms
```

y el dashboard responde (plantilla_dashboard.html:5783):

```js
window.panoramaBridge.onFlushBeforeClose(() => maybeBackup('closing', { force:true }));
```

---

## 2. Causa raíz

**Dos mecanismos correctos por separado que nadie diseñó para convivir.**

`attachFlushOnClose` nació en la v0.1.43 para un problema real: al cerrar una
ventana se perdían los últimos cambios porque el backup final era una promesa
que nadie esperaba. Su premisa es *"si esta ventana se cierra, su estado es
valioso y hay que guardarlo sí o sí"*. Y `force:true` (v0.1.62) refuerza esa
premisa: escribe **sin comparar** con `lastSerialized`, precisamente para no
depender de un estado que pudiera estar desincronizado.

`restoreProjectBackup` cierra la ventana **como medio** para sustituir su
almacenamiento. Desde su punto de vista, el estado de esa ventana es
exactamente lo que el usuario ha pedido tirar.

Nada distingue un cierre de otro: `attachFlushOnClose` no sabe *por qué* se
cierra la ventana. Ese es el fallo de fondo — no hay ningún concepto de
"cerrar para descartar".

---

## 3. Los cuatro defectos

### 3.1 El backup espurio (el hallazgo original)

Al restaurar, el estado que se descarta se escribe como backup nuevo y pasa a
ser **el más reciente**. Consecuencias medibles:

- **Restaurar dos veces seguidas devuelve lo que querías tirar.** Tras la
  primera restauración, "el último backup" es la instantánea pre-restauración.
- **Erosiona el historial**: ese backup espurio empuja uno bueno fuera del
  límite `BACKUP_KEEP = 15`. Restaurar repetidamente vacía el historial útil.
- **La tarjeta del lanzador miente**: `computeProjectSemaforo`,
  `computeServiceEndWarning` y `computeStaffingRatio` leen "el último backup",
  así que justo después de restaurar muestran los datos descartados.

### 3.2 No se espera al cierre — tres renderers sobre una partición

`w.close()` vuelve de inmediato, pero con el `preventDefault()` la ventana
sigue viva hasta 4 segundos. En ese hueco pueden coexistir sobre la **misma
partición de Electron**:

1. la ventana moribunda (aún ejecutando su guardado final),
2. la ventana oculta del helper (`localStorage.clear()` + escrituras),
3. la ventana nueva que abre `openProjectWindow`.

**Sobre el daño real, siendo justo:** he comprobado que el dashboard no
escribe en `localStorage` durante el descarga — su `beforeunload` solo llama a
`maybeBackup`, que *lee*. Así que no hay corrupción del almacenamiento por
escrituras cruzadas. Lo que sí hay es **no determinismo**: el
`collectLocalStorageDump()` del guardado final puede ejecutarse antes del
`clear()` (caso normal → backup espurio del estado descartado), entre el
`clear()` y las escrituras (→ `hasProjectData` false → se salta) o después
(→ backup duplicado del estado restaurado). **La misma acción del usuario
produce historiales de backup distintos según el reparto de tiempos.**

### 3.3 La ventana vieja des-registra a la nueva ⚠️

Este no estaba en la auditoría y es concreto:

```
2176  win.on('closed', () => projectWindows.delete(row.id));
```

Borra por **id**, sin comprobar que la ventana que se cierra sea la que está
registrada. Secuencia:

| t | Qué pasa |
|---|---|
| t0 | `w.close()` → interceptado, empieza el guardado final (hasta 4 s) |
| t0 | `projectWindows.delete(id)` (línea 2399) |
| t1 (~200-400 ms) | el helper termina; `openProjectWindow` → `projectWindows.set(id, ventanaNueva)` |
| t2 (hasta 4 s) | la vieja termina su guardado y se cierra de verdad → su `'closed'` → `projectWindows.delete(id)` → **borra la entrada de la ventana NUEVA** |

Es probable, no teórico: el helper tarda unos cientos de ms y el guardado
final tiene que escribir un backup (1,4 MB en el proyecto más grande, sobre
Google Drive).

Efectos: pulsar "Abrir" en el lanzador crearía una **segunda ventana** del
mismo proyecto (la comprobación de duplicados de `openProjectWindow:2075`
falla), y `deleteProjectById` no encontraría la ventana para cerrarla antes de
borrar sus archivos.

El mismo patrón está en `meetingPrepWindows` (2236) y `candidateEvalWindows`
(2303), pero esas ventanas no se reabren durante una restauración, así que ahí
es latente.

### 3.4 Sin salida segura si falla

Si `writeLocalStorageDumpToPartition` rechaza, la ventana **ya se ha cerrado** y
nada la reabre: el usuario se queda sin ventana y con un `localStorage`
posiblemente a medias (el `clear()` no es atómico respecto a los `setItem`).
El mensaje de error sí llega (los cuatro llamadores lo muestran), pero el
estado en el que se queda no se explica en ninguna parte.

---

## 4. Diseño mínimo propuesto

Cinco cambios, **todos en `main.js`**, ninguno en renderers, plantillas,
preloads ni contratos IPC.

### 4.1 Marca de "restauración en curso" por proyecto

```js
const restoreInProgress = new Set();   // ids de proyecto
```

Puesta al principio de `restoreProjectBackup` y retirada en un `finally`.

### 4.2 `backup:save` rechaza mientras dura la restauración

Una línea, **exactamente el mismo patrón que ya usa `rekeyInProgress`** (A1):

```js
if (restoreInProgress.has(projectId)) return false;
```

Esto es lo que de verdad mata el backup espurio, y lo hace **por todos los
caminos a la vez**: el guardado final (`closing`), el `beforeunload` del
renderer y el intervalo de 15 s. Sin tocar el dashboard.

> Por qué no basta con saltarse el guardado final: aunque `attachFlushOnClose`
> no envíe nada, el `window.addEventListener('beforeunload', …)` de la
> plantilla (línea 5771) sigue llamando a `maybeBackup('beforeunload')` cuando
> la ventana se descarga de verdad. Sin este bloqueo, un cambio hecho en los
> últimos 15 s se guardaría igualmente como backup del estado descartado.

`maybeBackup` ya trata `false` correctamente desde la v0.1.62: lo registra como
`write-failed`, **no** envenena `lastSerialized` y reintenta después.

### 4.3 `attachFlushOnClose` se salta el guardado si se cierra para restaurar

```js
if (win.__panoramaClosingForRestore) return;   // dejar cerrar en el acto
```

No es estrictamente necesario (4.2 ya impide el guardado), pero evita esperar
4 segundos a un guardado que va a ser rechazado. **El comportamiento para
cualquier otro cierre no cambia en absoluto.**

### 4.4 Esperar al `'closed'` de verdad

```js
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('la ventana no se cerró a tiempo')), CIERRE_MAX_MS);
  w.once('closed', () => { clearTimeout(t); resolve(); });
  w.__panoramaClosingForRestore = true;
  w.close();
});
```

Con el guardado saltado esto resuelve en milisegundos. Si se agota el tope se
**aborta la restauración sin tocar la partición** — nunca escribir mientras
pueda haber un renderer vivo encima.

### 4.5 Identidad en el `'closed'`, no solo id

```js
win.on('closed', () => { if (projectWindows.get(row.id) === win) projectWindows.delete(row.id); });
```

Corrige 3.3. Es correcto por sí mismo, al margen de A2, y conviene aplicar lo
mismo en 2236 y 2303.

### 4.6 Salida segura si falla

Envolver el volcado y, si falla, **reabrir la ventana del proyecto** y
propagar el error. Los archivos de backup no se tocan en ningún momento de
este flujo, así que reintentar la misma restauración siempre es posible.

**Opción reforzada (recomendada, ~10 líneas):** que el helper devuelva el
volcado ANTERIOR de `localStorage` antes de hacer `clear()`. Con eso, si las
escrituras fallan a mitad, se puede reponer el estado previo — rollback real
en vez de solo salida segura. Lo dejo a tu criterio: cierra la única ventana de
"estado mezclado" que quedaría, pero es el único punto del diseño que añade
algo más que guardas.

### 4.7 Guarda de concurrencia

`restoreInProgress` sirve además para que dos restauraciones del mismo proyecto
no se solapen (doble clic en el selector, o lanzador y menú a la vez): la
segunda devuelve un error claro. Hoy solo el selector de backups desactiva sus
botones; el lanzador y el menú no se coordinan con él.

---

## 5. Efectos secundarios aceptados

- **Un backup duplicado por restauración.** La ventana nueva hace
  `maybeBackup('startup')` a los 3 s y escribe una instantánea del estado
  restaurado (`lastSerialized` arranca a null). Es un duplicado del contenido
  que se acaba de restaurar: inocuo, y mucho mejor que el espurio de hoy.
- **Durante la restauración, un guardado manual devolvería "no se pudo
  guardar"** si el usuario lo pulsara en esa fracción de segundo. Aceptable:
  la ventana está cerrándose.

---

## 6. Matriz de impacto

| Componente | Dependencia | Riesgo potencial | Cómo se comprueba |
|---|---|---|---|
| `attachFlushOnClose` (2041) | TODAS las ventanas de proyecto y el Directorio | Debilitar el guardado final de la v0.1.43 en cierres normales | La guarda es una marca por ventana que solo pone `restoreProjectBackup`; prueba explícita de cierre normal con cambios sin guardar |
| `backup:save` (6534) | Autoguardado cada 15 s de cada ventana abierta | Rechazar guardados de OTROS proyectos | El `Set` es por `projectId`; probar con dos proyectos abiertos y restaurar uno |
| `maybeBackup` (dashboard) | Renderer, sin tocar | Que `false` rompa algo | Comportamiento ya existente desde v0.1.62; sin cambios de código |
| `restoreProjectBackup` (2382) | 4 puntos de entrada | Cambiar la forma del retorno | Sigue devolviendo una promesa que resuelve a `true` o rechaza |
| `openProjectWindow` (2062) | Apertura normal de proyectos | Que la espera rompa la apertura normal | Solo cambia el `'closed'`; probar abrir/cerrar/reabrir sin restaurar |
| `projectWindows` | Duplicados, borrado de proyecto | Que la comprobación de identidad deje entradas huérfanas | Contar entradas del mapa antes/después de restaurar |
| `writeLocalStorageDumpToPartition` (2344) | Restaurar **y** sembrar proyecto nuevo (`seedNewProjectStorage`) | Romper la creación de proyectos desde un `.json` | Solo se toca a quien la llama, no ella; probar "Nuevo proyecto" con importación |
| `deleteProjectById` (2988) | Mismo patrón `has/get/delete` | Interacción con la marca de restauración | Probar borrar un proyecto justo después de restaurarlo |
| Directorio de Talento | Reutiliza `openProjectWindow` y su menú | Trato distinto sin querer | Mismo camino, sin caso especial; probar restaurar el Directorio |
| Selector "Restaurar un backup concreto…" | IPC compartido | Doble restauración | Guarda de concurrencia 4.7 |
| `backup-picker` / lanzador / menús | Muestran el error | Cambiar el texto o la forma del rechazo | Sin cambios en el contrato |

---

## 7. Plan de pruebas propuesto

Mismo método que A1: bloque real extraído y ejecutado contra directorios
temporales, más una ejecución real aislada.

1. **El defecto original, reproducido y corregido**: contar las filas de
   `backups` antes y después de restaurar. Hoy aparece una nueva; después no
   debe aparecer ninguna hasta el `startup` de la ventana nueva.
2. **Restaurar dos veces seguidas** devuelve el mismo contenido las dos veces
   (hoy la segunda devuelve el estado descartado).
3. **`localStorage` final** coincide exactamente con el volcado del backup.
4. **Registro de ventanas**: tras restaurar, `projectWindows` tiene UNA entrada
   y apunta a la ventana nueva (reproducir antes el fallo 3.3).
5. **Cierre normal sin restaurar**: el guardado final de la v0.1.43 sigue
   ocurriendo (regresión clave).
6. **Dos proyectos abiertos**, restaurar uno: el otro sigue autoguardando.
7. **Fallo inyectado** en el volcado a la partición: la ventana se reabre, el
   error llega al usuario, los archivos de backup intactos.
8. **Tope de cierre agotado**: se aborta sin tocar la partición.
9. **Restauración concurrente** del mismo proyecto: la segunda se rechaza.
10. **"Nuevo proyecto" importando un `.json`** sigue funcionando
    (`seedNewProjectStorage` comparte el helper).
11. **Restaurar el Directorio de Talento.**
12. Suites A1 completas (56 + 98) y la de `setMeta` (19).

---

## 8. Lo que NO se toca

- `maybeBackup`, `onFlushBeforeClose`, el intervalo de 15 s y el `beforeunload`
  del dashboard: sin un solo cambio.
- El comportamiento de cierre de cualquier ventana que no se esté cerrando para
  restaurar.
- Los archivos de backup, las filas de `backups`, el cifrado y `readBackupPayload`.
- Los contratos IPC (`backup:restore`, `backup:list`) y los preloads.
- `db.js`.
