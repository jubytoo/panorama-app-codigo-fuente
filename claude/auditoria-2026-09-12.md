# Auditoría de deuda técnica — Panorama del Servicio (12 sept 2026, sobre v2.0.39)

Auditoría pedida por el usuario para no acumular inconsistencias/restos sin
que penalice tiempo más adelante. **No se ha tocado ni una línea de código
como parte de esto** — solo diagnóstico. Metodología: barrido con grep de
todo el código propio (excluyendo `vendor/` minificado, `node_modules`,
`dist_build`) más lectura completa, línea a línea, de los 6 archivos más
grandes (`main.js`, y las 5 plantillas HTML) vía subagentes dedicados,
cruzando cada uno contra `vendor/theme.js` y contra sus archivos hermanos.

## 1. Bugs reales de tema (mismo patrón que el ya corregido en 2.0.39)

Al arreglar `--green`/`--red` en 2.0.39 sospechaba que podía no ser el
único caso — se confirmó que no lo es.

**1.1 — `directorio/plantilla_directorio.html`: las 8 variables `--disc-*`
nunca las asigna `applyTheme()`** (alta certeza). Pintan las insignias
DISC (círculo con letra D/I/S/C), el radar chart y el gráfico de
distribución DISC. Se quedan siempre con los valores oscuros de
Medianoche — en los 4 temas claros, esas insignias flotan con fondo casi
negro sobre tarjetas claras.

**1.2 — `preparacion-reunion/plantilla_preparacion_reunion.html`: el
glow de fondo usa hex fijo (`#10202b`/`#1a1409`) en vez de
`var(--bg-glow-1)`/`var(--bg-glow-2)`** (alta certeza). Las variables SÍ
existen y SÍ las asigna `applyTheme()` — de hecho `directorio` las usa
bien en el mismo sitio. Aquí se quedó el valor literal de Medianoche sin
migrar. Efecto: mancha radial oscura en la esquina superior de la
ventana con cualquier tema claro activo, muy visible sobre fondos casi
blancos (Marfil, Nube).

**1.3 — `dashboard/plantilla_dashboard.html`: varios colores semánticos
pintados con hex literal en JS, no con `var(--red/--amber/--green)`**
(alta certeza):
- `renderRisks()`: `const hex = { rojo:'#e2596b', amarillo:'#f0a83c', verde:'#4caf82' }` (línea ~854) — la barra y el contador de riesgos por severidad.
- Punto de estado Activo/Pendiente del equipo (línea ~4445).
Mismo síntoma que el bug de `--green`/`--red` ya corregido, pero aquí ni
siquiera pasa por la variable CSS — está clavado en JS. El `.exec-semaforo`
equivalente (líneas 349-351) sí usa `var(...)` correctamente, así que es
una inconsistencia entre dos piezas de UI que deberían comportarse igual.

**1.4 — `dashboard`: bordes casi negros hardcodeados sobre chips de tema
claro** (alta certeza) — `.btn.danger` (`#4a2229`), `.confirm-bar`
(`#4a2229`), `.risk-detail-card.cont` y los botones de prórroga/restaurar
histórico (`#4a3315`). Con `--red-bg`/`--amber-bg` ahora claros en los 4
temas nuevos, el borde queda como un anillo oscuro alrededor de una caja
casi blanca.

**1.5 — Botón "⏻ Salir" de la cabecera del dashboard con fondo/borde fijos
oscuros** (`#1c1418`/`#3a2530`, línea ~548) — el único botón de la fila
que no se integra con el tema activo en las 4 paletas claras.

**1.6 — Barra de título (`.titlebar`/`.win-controls`) con paleta "Windows
claro" fija, independiente del tema** — en Medianoche (fondo casi negro)
queda una franja gris claro pegada arriba. Además el hover del botón
cerrar usa `#e2596b` literal en vez de `var(--red)`. **Este bloque está
duplicado carácter por carácter en `dashboard` y `directorio`** — incluso
antes de arreglar el color, es candidato a vivir en `vendor/` junto al
resto de estilos compartidos (mismo patrón que ya se hizo con
`THEMES`/`applyTheme`).

No hace falta decidir nada ahora — es la lista para cuando quieras que lo
arregle, probablemente todo junto en un solo parche de "consistencia de
temas" ya que son cambios de la misma naturaleza.

## 2. CSS/variables muertas (sin impacto visual, solo limpieza)

- `dashboard`: `.reauth-banner`/`.rb-text`/`.rb-actions` — la función que
  los generaba se vació en v0.1.21, el bloque CSS nunca se retiró.
- `dashboard`: `.ap-theme-options`/`.ap-theme-swatch`/`.ap-theme-dot`/
  `.ap-theme-name` — selector de tema por proyecto, obsoleto desde que el
  tema pasó a global en 2.0.27.
- `dashboard`: `.risk-id` — ya no hay ningún elemento con esa clase en la
  plantilla actual de fila de riesgo.
- `dashboard`: clase `btn amber-outline` usada en un botón sin que exista
  la regla `.amber-outline` (el `style=` inline cubre el hueco, pero
  confunde al leer el código).
- `directorio`: `.ap-theme-swatch`/`.ap-theme-dot` — mismo caso que en
  dashboard.
- `evaluacion-candidatos`: variable `--violet` definida y sin usar en
  ningún sitio.

## 3. Duplicación de código (candidatos a unificar en `vendor/` o en una función compartida)

- `main.js`: el bloque de "asignar slug de carpeta de backup si no
  existe" está copiado literalmente en `backupsDirForProject()`,
  `meetingPrepsDirForProject()` y `candidateEvalFileForProject()` —
  candidato claro a una función `ensureProjectBackupDirSlug(row)`.
- `main.js`: el patrón "ventana oculta + `restore-helper.html` + volcar
  `localStorage`" se repite casi entero en `restoreProjectBackup()` y
  `seedNewProjectStorage()` (~25 líneas duplicadas).
- `main.js`, prioridad baja: el bloque "cifrar y escribir archivo"
  (`isEncrypted ? encryptString(...) : payload`) se repite en 4 sitios
  (`backup:save`, `meeting:savePrep`, `meeting:updatePrep`,
  `candidateEval:save`).
- Bloque `.titlebar`/`.win-controls` — ver punto 1.6, duplicado en
  `dashboard`, `directorio` y `preparacion-reunion`.
- Bloque `::-webkit-scrollbar*` (7 líneas) duplicado en las mismas 3
  plantillas.

## 4. Inconsistencias de manejo de errores (impacto bajo, pero reales)

- `main.js`: de 10 llamadas a `shell.openPath()`, solo 1 comprueba el
  string de error que devuelve (nunca rechaza como promesa); las otras 9
  (abrir carpeta de instalación, de backups, `app.log`, etc.) ignoran un
  fallo en silencio.
- `main.js`: `meeting:deletePrep` registra con `console.warn` si falla el
  borrado del archivo asociado; `candidateEval:removeCv`, misma
  operación, lo traga sin ningún log.
- `dashboard`: la ruta de guardado de backup vía File System Access API
  del navegador (`writeBackupToFolder()`, código que NUNCA se ejecuta
  dentro de la app de escritorio real, solo si se abriera el HTML suelto
  en un navegador) traga errores con un `console.warn`, mientras que la
  ruta real de la app sí propaga el fallo a la UI. Impacto práctico nulo
  hoy, pero es la misma operación tratada distinto según el camino.

## 5. Archivos sueltos / residuos de repositorio

- **`glosario_sr_linux.html`** (raíz del repo) — no tiene relación con
  Panorama del Servicio (es un glosario de administración de sistemas
  Linux), no está referenciado desde ningún sitio del código, no forma
  parte de `FILES` del snapshot ni de `build.files` de `package.json`.
  Parece un archivo de otra tarea que quedó suelto en este directorio de
  trabajo. Candidato a borrar si confirmas que no lo necesitas aquí.
- `scripts/cdp_reload.js` y `scripts/generate_patch_icons.py` existen en
  el repo pero NO están en la lista `FILES` de `claude/gen_snapshot.py` —
  si algún día se reconstruye el repo desde el snapshot del Project
  (`reconstruir-repo-desde-snapshot.py`), estos dos scripts de desarrollo
  se perderían. Sin impacto en la app (no se empaquetan), pero vale la
  pena añadirlos a `FILES` para que el snapshot quede completo.

## 6. Lo que se revisó y está limpio (para que conste)

- Sin `console.log`/`console.debug` de depuración olvidados, sin
  `TODO`/`FIXME`/`HACK` reales, sin restos de logs `[DEBUGxx]` de
  entregas anteriores.
- Sin `eval()` en ningún archivo propio.
- Las 8 `BrowserWindow` de `main.js` usan `contextIsolation:true` /
  `nodeIntegration:false` de forma consistente.
- Sin contraseñas/API keys/secretos hardcodeados.
- Sin inyección de comandos posible: todos los `execFile`/`spawn` pasan
  argumentos como array, nunca `shell:true` ni `exec()`. Los nombres de
  archivo derivados de datos del usuario pasan por `slugify()` o por
  `isSafeCvStoredName()` (rechaza `/`, `\`, `..`) antes de tocar disco.
- Los 41 `ipcMain.handle` de `main.js` tienen consumidor real en algún
  preload, y toda llamada `ipcRenderer.invoke/on` de los 5 preloads tiene
  su handler correspondiente — ningún canal IPC huérfano en ninguna
  dirección.
- No se encontró código muerto real en `main.js` (se comprobó que las
  ~130 funciones top-level tienen al menos una llamada real).
- Dependencias de `package.json` mínimas y todas usadas (`sql.js` en
  `db.js`; `electron`/`electron-builder` como devDependencies).
- `evaluacion-candidatos` NO tiene el bug de variables de tema porque, por
  decisión tuya ya documentada (v2.0.28), esa ventana dejó de cargar
  `theme.js` del todo — su paleta fija es intencional, no un olvido, y es
  internamente consistente.

## 7. Puntos históricos que siguen "sin confirmar" (no auditados a fondo, solo localizados)

No se ha releído el histórico completo de versiones (sería releer más de
12.000 líneas de `panorama-app-project-context.md` por un beneficio bajo
— la mayoría de items antiguos casi seguro quedaron superados por
reescrituras posteriores). Sí se localizaron, por grep, los que siguen
abiertos de las versiones MÁS RECIENTES, que son los que de verdad tienen
probabilidad de seguir vigentes:

- **2.0.38**: si al restaurar manualmente una ventana (dejar de estar
  maximizada) vuelve a un tamaño razonable — no se pudo probar en Xvfb
  (sin gestor de ventanas) y sigue sin confirmación en Windows real.
- **2.0.38**: aspecto visual/timing real de la animación de carga
  ("Cargando…") — nunca se ha visto renderizada, ni en Xvfb ni en
  Windows.
- **2.0.39**: cómo se ven los 4 temas rediseñados en la pantalla real del
  Surface Pro 11 — acabas de recibir el parche, todavía sin tu
  confirmación.
- Un ítem mucho más antiguo (época ~0.1.6x) sigue técnicamente sin
  cerrar en el documento: una tarjeta del launcher tardando "unos
  segundos" en reflejar su color correcto tras encender el PC —
  explicación razonada (posible margen de sincronización de Google
  Drive) pero nunca confirmada ni vuelta a reportar desde entonces. Lo
  menciono por completitud; si no se ha vuelto a ver en meses, probablemente
  ya no aplica (mucho ha cambiado desde esa versión) y no le dedicaría
  tiempo salvo que te vuelva a pasar.

## Recomendación

Nada de esto es urgente ni bloqueante — la app funciona. Si quieres que
actúe sobre algo, lo más rentable por impacto/esfuerzo sería, en este
orden: (1) el punto 1 completo (bugs de tema, ya que son todos de la
misma naturaleza y probablemente se resuelven juntos en un solo parche),
(2) borrar `glosario_sr_linux.html` si confirmas que no hace falta aquí,
(3) el resto (duplicación, CSS muerto, manejo de errores) son mejoras de
mantenibilidad sin urgencia — las dejaría para cuando toque tocar esas
zonas del código por otro motivo, no como parche dedicado.
