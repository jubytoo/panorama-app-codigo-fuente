# Checkpoint — cableado productivo del Bloque 5 (A3.3)

**Fecha:** 2026-09-15. Generado por `scratchpad/comun/checkpoint.js`.

Cierre documental de un fallo de proceso: `preload-launcher.js` y
`launcher/renderer.js` se modificaron **sin haber creado antes** su punto de
restauración. Los otros cuatro sí lo tenían. Aquí quedan los seis, con el
estado previo y el actual localizables por hash, para poder volver exactamente
al estado anterior si un arranque revela una regresión. **No se ha deshecho
nada.**

Los snapshots viven en `claude/`, con sufijo `.ANTES-BLOQUE5-CABLEADO-2026-09-15`
y `.ACTUAL-BLOQUE5-CABLEADO-2026-09-15`.

| Archivo | SHA-256 PRE-BLOQUE5 | SHA-256 ACTUAL | Origen del PRE |
|---|---|---|---|
| `main.js` | `7EE92902AF16DC371E2DA996BEDA5C8E9FA2E59948E057DA759CD8EC9BEE0BDD` | `71A118B4E42ADAEA917F63E6B56C2F1C6C82CF419BD050C786E9A0A97B9C0033` | snapshot previo (creado antes de editar) — `main.js.ANTES-BLOQUE5-CABLEADO-2026-09-15` |
| `preload.js` | `91F3E63CF6092C3FF70E33D2A7502CB75CC993A3D818E3C917BCCBE4D52E12BE` | `AA77316F3FDB384D582F8270213A846EE1A1D2E067784EE17DF8D65CC1F6A27B` | snapshot previo (creado antes de editar) — `preload.js.ANTES-BLOQUE5-CABLEADO-2026-09-15` |
| `preload-launcher.js` | `B08AA3EAE6D167B4CE340D455342204AB0010B7D1DF6E18318662A7B62F9772A` | `21CA840597B81E175DD2C83693900B1AC11E66876C121A9CD1091935609BC18F` | PRE reconstruido desde C:\Codigo Fuente PS - copia — `preload-launcher.js.ANTES-BLOQUE5-CABLEADO-2026-09-15` |
| `launcher\renderer.js` | `8D59E82D8454165E236D78E93D29CD4CA32B082AA80A8A90320FBC393FDDDEEA` | `BE0125470DE837A10D360EC819B6A759D8515394CA493D02E80A4E0736E71755` | PRE reconstruido desde C:\Codigo Fuente PS - copia — `renderer.js.ANTES-BLOQUE5-CABLEADO-2026-09-15` |
| `preparacion-reunion\plantilla_preparacion_reunion.html` | `67F5AE56B23443AAFC649769950C690DD29778C6B43F64F93A8FEA32628F5BC5` | `710E051F1B91B81BD6E84EF2F41979BAEA24040DB87BA9A26F470A5F5BA56A27` | snapshot previo (creado antes de editar) — `plantilla_preparacion_reunion.html.ANTES-BLOQUE5-CABLEADO-2026-09-15` |
| `evaluacion-candidatos\plantilla_evaluacion_candidatos.html` | `1410C130199F97535DD3BC310F696F67F0A3F35FAEC371C17C2F86CF67EE0B9A` | `F9DF00AE30F393753D446DD17816885AF6D507A0B505805E1A1661BFE881C205` | snapshot previo (creado antes de editar) — `plantilla_evaluacion_candidatos.html.ANTES-BLOQUE5-CABLEADO-2026-09-15` |

## Comprobación de que cada PRE es realmente anterior al Bloque 5

Por cada archivo se verifica una marca textual inequívoca del cableado: tiene
que estar **ausente** en el PRE y **presente** en el actual.

| Archivo | Marca comprobada | En el PRE | En el actual |
|---|---|---|---|
| `main.js` | `BORRADOS_DIR_NAME` | ausente ✔ | presente ✔ |
| `preload.js` | `invokeAccion('meeting:deletePrep'` | ausente ✔ | presente ✔ |
| `preload-launcher.js` | `invokeAccion('projects:delete'` | ausente ✔ | presente ✔ |
| `renderer.js` | `res.aplicado !== true` | ausente ✔ | presente ✔ |
| `plantilla_preparacion_reunion.html` | `result.aplicado !== true` | ausente ✔ | presente ✔ |
| `plantilla_evaluacion_candidatos.html` | `CONTRATO_SESION_DETENIDA` | ausente ✔ | presente ✔ |

## Los dos PRE reconstruidos

`preload-launcher.js` y `launcher/renderer.js` **no tenían snapshot previo**.
Su PRE se reconstruyó desde `C:\Codigo Fuente PS - copia\`, que la auditoría
C4 documenta como byte-idéntica al original y que no ha recibido ninguno de
los cambios de A3.3. Se ha verificado en el momento de generar este
checkpoint que esa copia sigue presente, que su hash coincide con el snapshot
guardado y que no contiene ninguna modificación del Bloque 5.

- `preload-launcher.js`: · copia origen: presente, hash coincide, sin cambios del Bloque 5: true
- `launcher\renderer.js`: · copia origen: presente, hash coincide, sin cambios del Bloque 5: true

## Regla a partir de aquí

**Ningún archivo productivo nuevo se modifica sin entrar antes en este
checkpoint.**

---

## Añadido el 15 sept 2026 — barrera durable del `localStorage` (A2)

Un solo archivo productivo tocado en esa ronda.

| Archivo | PRE (antes de editar) | POST (ahora) | Snapshot |
|---|---|---|---|
| `main.js` | `90A977DA565B7DC6C22229E1A046C569C924C956138505A5AD93219F19E3E4E5` | `E19EF34FF55D3505E4544F4249A8BFEC2D208BD90CF701BB8D129E03F1A1E950` | `main.js.ANTES-A2-FLUSH-2026-09-15` (PRE) y `main.js.ACTUAL-A2-FLUSH-2026-09-15` (POST) |

**El PRE se creó ANTES de tocar nada**, y coincide byte a byte con el POST del
cableado de A2 (`main.js.ACTUAL-A2-CABLEADO-2026-09-15`), así que la cadena de
puntos de restauración no tiene huecos.

Sin cambios en esta ronda, verificado por hash al terminar:

| Archivo | SHA-256 (abreviado) |
|---|---|
| `db.js` | `1B16381FDE768493…` |
| `security.js` | `0BF1CAD061B2D9E7…` |
| `preload.js` | `AA77316F3FDB384D…` |
| `preload-launcher.js` | `01D38C31D5FB9B23…` |
| `preload-backup-picker.js` | `19D2D1BAD74F7747…` |
| `launcher\renderer.js` | `9CF8DFD05055A10C…` |
| `backup-picker\renderer.js` | `140D6E271DE17798…` |

Los arranques Electron reales de A2 comprobaron además, al terminar, que los
**ocho** archivos productivos seguían intactos y que la BD viva de `G:` no había
cambiado (`D5C3FF53D09925B6…`, idéntica antes y después en todas las tandas).

**Durante el diferencial de la barrera** se colocó temporalmente una copia
revertida de `main.js` en la raíz del proyecto —`main.__PRUEBA-SIN-FLUSH.js`,
necesaria porque `main.js` resuelve sus rutas con `__dirname`— y se borró al
terminar. El script aborta si ese archivo ya existe, y comprueba al final que se
ha borrado y que `main.js` no se ha tocado. Ambas comprobaciones salieron bien.
