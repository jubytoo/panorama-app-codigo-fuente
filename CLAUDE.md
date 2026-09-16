# Panorama del Servicio — contexto para Claude Code

Antes de proponer o tocar código, lee:
- `claude/panorama-app-project-context.md` — historial técnico completo,
  versión a versión: qué se probó, qué se descartó y por qué, bugs
  conocidos, decisiones ya tomadas.
- `claude/auditoria-2026-09-12.md` — última auditoría de deuda técnica
  (2.0.40 ya la resolvió entera; si hay una más reciente, léela también).

Si esta carpeta no tiene un subdirectorio `claude/` con esos documentos,
pide una copia actualizada del Project "Panorama de Servicio APP" en
claude.ai antes de asumir que no existen — Claude Code no puede leer ese
Project directamente, solo archivos locales.

## Qué es esto
Electron + SQLite (sql.js), empaquetado con electron-builder/NSIS,
solo Windows. `main.js` es el proceso principal; cada ventana (dashboard,
directorio de talento, preparación de reunión, evaluación de candidatos,
lanzador) es una plantilla HTML con su propio preload
(`contextIsolation:true`/`nodeIntegration:false`). Tema visual global en
`vendor/theme.js` (5 temas, `THEMES`/`applyTheme`), compartido por todas
las ventanas vía `<script>`.

## Ventaja real de trabajar aquí en vez de en el sandbox de Cowork
Todo el desarrollo hasta ahora se hizo en un entorno Linux sin Windows
real: Xvfb+CDP para simular la app en marcha, y Wine SOLO para comprobar
que el `.exe` arranca (Wine da FALSOS POSITIVOS en SmartScreen/Defender
y en el comprobador de instancia en ejecución de NSIS — esas dos cosas
nunca se pudieron confirmar ahí). Aquí sí hay Windows real: instala el
parche o el instalador de verdad, abre la app con doble clic, comprueba
SmartScreen/Defender, cierra y reabre para ver si se comporta como se
espera. Cualquier cosa que confirmes aquí de verdad, anótala en
`claude/panorama-app-project-context.md` como "confirmado en Windows
real" — hay varios puntos marcados como "sin confirmar" en ese
documento y en la auditoría precisamente porque no se pudo antes.

## Checklist de entrega (cada cambio de código)
1. Decide la vía: parche `app.asar` suelto (la normal — se aplica desde
   dentro de la app, Configuración → "Aplicar parche (app.asar)...") o
   instalador NSIS completo (solo si el cambio toca icono, versión de
   Electron o dependencias nativas).
2. Version bump en `package.json`.
3. Rebuild: `npx electron-builder --win dir` (parche) o
   `npm run dist:win` (instalador completo). Nunca `npx electron` a
   secas.
4. Verifica que el fix está REALMENTE en el `asar` compilado:
   `npx asar extract` + grep del patrón esperado — no te fíes solo del
   código fuente.
5. Prueba de verdad en Windows (ver arriba).
6. SHA-256 del archivo entregado.
7. `INSTRUCCIONES.txt` honesto: qué cambió, qué se comprobó DE VERDAD y
   cómo, qué queda sin confirmar todavía.
8. Actualiza `claude/panorama-app-project-context.md` con una sección
   nueva `### <versión>` — con `Edit` local sobre el archivo, nunca
   reescribiendo el documento entero.

## Reglas fijas
- El instalador no lleva firma digital (decisión de coste pendiente del
  usuario) — no intentes "arreglar" el aviso de SmartScreen/editor
  desconocido sin que se pida explícitamente.
- Cualquier `.exe` que se comparta fuera de esta máquina (email, Drive,
  etc.) debe ir SIN ".exe" en el nombre de archivo, o falla la descarga.
- Nunca marques algo como "arreglado" sin haberlo probado de verdad — di
  explícitamente si es una explicación razonada o una comprobación real.
- Español, tono directo y técnico, sin relleno.

## Historial y decisiones ya tomadas
Todo vive en `claude/panorama-app-project-context.md`, versión a
versión — consúltalo antes de reintentar algo que ya se descartó, o de
reconstruir una función que ya existe con otro nombre.
