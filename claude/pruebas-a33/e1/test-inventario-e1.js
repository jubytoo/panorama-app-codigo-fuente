'use strict';
// ---------------------------------------------------------------------------
// E1 — RETIRADA de la vista Lista / Resumen del lanzador (opción A).
//
// HISTORIA DE ESTA BATERÍA. Nació como INVENTARIO: fijaba por escrito el
// estado roto (26 OK/0) para que el diagnóstico no dependiera de leer el
// código a ojo. El usuario decidió la opción A —retirar los controles, NO
// completar las vistas—, así que ahora demuestra la retirada.
//
// LO QUE E1 CIERRA, Y LO QUE NO:
//   - CIERRA: funcionalidad inacabada EXPUESTA AL USUARIO. Los controles ya no
//     existen en el DOM.
//   - NO CIERRA, a propósito: el código interno parcial sigue presente
//     (handler `portfolio:summary`, `portfolioSummary()` del preload,
//     `computeStaffingRatio()`, `setView()`, los helpers muertos, el CSS y el
//     markup oculto de las dos vistas). La limpieza del código muerto NO forma
//     parte de esta corrección.
//
// Solo lectura: no toca la BD viva, ni produccion, ni escribe nada.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const RENDERER = path.join(PROJ, 'launcher', 'renderer.js');
const INDEX = path.join(PROJ, 'launcher', 'index.html');
const PRELOAD = path.join(PROJ, 'preload-launcher.js');
const MAIN = path.join(PROJ, 'main.js');
const PRE_INDEX = path.join(PROJ, 'claude', 'index.html.ANTES-E1-RETIRADA-2026-09-15');

const SRC_R = fs.readFileSync(RENDERER, 'utf8');
const SRC_H = fs.readFileSync(INDEX, 'utf8');
const SRC_P = fs.readFileSync(PRELOAD, 'utf8');
const SRC_M = fs.readFileSync(MAIN, 'utf8');

// El HTML tal como lo ve el NAVEGADOR: sin comentarios. Es la diferencia entre
// "el markup esta en el archivo" y "el usuario lo ve".
const sinComentarios = (s) => s.replace(/<!--[\s\S]*?-->/g, '');
const VIVO_H = sinComentarios(SRC_H);

let pass = 0, fail = 0; const fallos = [];
function ok(n, c, extra) {
  if (c) { pass++; console.log('  OK    ' + n); }
  else { fail++; fallos.push(n); console.log('  FALLO ' + n + (extra ? '  -- ' + extra : '')); }
}
function seccion(t) { console.log('\n=== ' + t + ' ==='); }
function veces(src, ident) {
  const re = new RegExp('\\b' + ident.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g');
  return (src.match(re) || []).length;
}
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').toUpperCase();

console.log('E1 — RETIRADA DE LOS CONTROLES DE LISTA / RESUMEN (opcion A)');
console.log('index.html: ' + SRC_H.split('\n').length + ' lineas  ·  renderer.js: ' + SRC_R.split('\n').length);

// =========================================================================
seccion('E1-R. LA RETIRADA — el usuario ya no puede entrar en esas vistas');
// =========================================================================
ok('E1-R1 NO queda ningun boton data-view en el HTML que ve el navegador',
  /data-view/.test(VIVO_H) === false,
  'apariciones vivas: ' + (VIVO_H.match(/data-view/g) || []).length);
ok('E1-R2 NO queda el conmutador #view-switch en el HTML vivo',
  /id="view-switch"/.test(VIVO_H) === false);
ok('E1-R3 NO queda ningun texto de los tres botones a la vista',
  !/🗂 Tarjetas/.test(VIVO_H) && !/☰ Lista/.test(VIVO_H) && !/📊 Resumen/.test(VIVO_H));
ok('E1-R4 tampoco hay OTRA via: ni menu, ni atajo, ni boton que llame a setView()',
  veces(SRC_R, 'setView') === 1, 'apariciones de setView: ' + veces(SRC_R, 'setView'));
ok('E1-R5 main.js no ofrece ninguna entrada de menu a esas vistas',
  !/view-switch|data-view|setView/.test(SRC_M));
// El bloque retirado sigue EN EL ARCHIVO, dentro de un comentario, con la
// explicacion de por que no se puede reponer tal cual.
ok('E1-R6 el markup retirado se conserva comentado, para poder reponerlo',
  /E1 — RETIRADO EL 15 sept 2026/.test(SRC_H) && /<div class="view-switch" id="view-switch">/.test(SRC_H));
ok('E1-R7 y el comentario advierte de la dependencia con E2 antes de reactivarlo',
  /acoplamiento con E2/.test(SRC_H) && /serviceEndMessage/.test(SRC_H));
// Un comentario HTML con "--" dentro no cierra donde se cree: el navegador se
// comeria parte del documento. Se comprueba de verdad.
{
  const i = SRC_H.indexOf('<!-- v2.0.56 puso');
  const fin = SRC_H.indexOf('-->', i);
  const interior = SRC_H.slice(i + 4, fin);
  ok('E1-R8 el comentario esta bien formado: cero secuencias "--" dentro',
    i >= 0 && fin > i && (interior.match(/--/g) || []).length === 0,
    'ocurrencias: ' + ((interior.match(/--/g) || []).length));
}

// =========================================================================
seccion('E1-S. LO QUE SIGUE ARRANCANDO IGUAL — cero referencias rotas');
// =========================================================================
// TODO `getElementById('x')` del renderer tiene que encontrar su elemento en el
// HTML VIVO. Es la prueba de que la retirada no ha dejado ningun cabo suelto:
// si se hubieran quitado tambien los contenedores, esto lo cazaria.
{
  const ids = [...new Set([...SRC_R.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]))];
  const ausentes = ids.filter((id) => VIVO_H.indexOf('id="' + id + '"') < 0);
  ok('E1-S1 los ' + ids.length + ' getElementById() del renderer siguen encontrando su elemento',
    ausentes.length === 0, 'ausentes: ' + JSON.stringify(ausentes));
}
ok('E1-S2 el launcher arranca en TARJETAS: #grid es la unica vista sin display:none',
  /id="grid" class="grid"><\/div>/.test(VIVO_H.replace(/\s+/g, ' ').replace(/> </g, '><')) ||
  /<div id="grid" class="grid">/.test(VIVO_H),
  'no se encontro #grid visible');
ok('E1-S3 y las dos vistas retiradas siguen ocultas por su display:none inline',
  /id="view-list"[^>]*style="display:none;"/.test(VIVO_H) &&
  /id="view-summary"[^>]*style="display:none;"/.test(VIVO_H));
ok('E1-S4 setView() ya no encuentra botones, pero NO lanza: forEach sobre vacio',
  /querySelectorAll\('#view-switch button'\)\.forEach/.test(SRC_R));

// Los controles que SI funcionan siguen ahi, con su listener.
const CONTROLES = [
  ['new-project-btn', 'crear proyecto'],
  ['directorio-btn', 'Directorio de Talento'],
  ['quit-btn', 'salir'],
  ['modal-create', 'confirmar creacion'],
  ['modal-cancel', 'cancelar creacion'],
  ['tb-minimize', 'minimizar'], ['tb-maximize', 'maximizar'], ['tb-close', 'cerrar'],
];
for (const [id, que] of CONTROLES) {
  ok('E1-S5 sigue el control "' + que + '" (#' + id + ') con su listener',
    VIVO_H.indexOf('id="' + id + '"') >= 0 &&
    new RegExp("getElementById\\('" + id + "'\\)[\\s\\S]{0,60}addEventListener|" + id).test(SRC_R));
}
// Las acciones de tarjeta (abrir/restaurar/carpeta/eliminar) van por delegacion
// sobre #grid, no por id. Se comprueba el listener y los cuatro data-act.
ok('E1-S6 las acciones de tarjeta siguen cableadas por delegacion sobre #grid',
  /gridEl\.addEventListener\('click'/.test(SRC_R) &&
  /data-act="open"/.test(SRC_R) && /data-act="restore"/.test(SRC_R) &&
  /data-act="folder"/.test(SRC_R) && /data-act="delete"/.test(SRC_R));
ok('E1-S7 el ORDEN por arrastrar-y-soltar sigue cableado (4 listeners de drag)',
  /gridEl\.addEventListener\('dragstart'/.test(SRC_R) && /gridEl\.addEventListener\('dragend'/.test(SRC_R) &&
  /gridEl\.addEventListener\('dragover'/.test(SRC_R) && /gridEl\.addEventListener\('drop'/.test(SRC_R));
ok('E1-S8 refresh() sigue pintando las tarjetas desde projects:list',
  /async function refresh\(\)/.test(SRC_R) && /window\.launcherAPI\.listProjects\(\)/.test(SRC_R));
ok('E1-S9 y sigue reaccionando a projects:changed',
  /onProjectsChanged\(\(\) => refresh\(\)\)/.test(SRC_R));
// NOTA: el lanzador NO tiene busqueda ni filtro de proyectos, ni antes ni
// ahora. No es algo que esta retirada haya quitado: nunca existio.
ok('E1-S10 el lanzador no tenia busqueda/filtro, y sigue sin tenerla (nada que regresar)',
  !/id="[^"]*(search|buscar|filtro)[^"]*"/i.test(VIVO_H));

// =========================================================================
seccion('E1-T. LO QUE SE CONSERVA A PROPOSITO — no es limpieza de codigo muerto');
// =========================================================================
ok('E1-T1 el handler portfolio:summary SIGUE en main.js, intacto',
  SRC_M.indexOf("ipcMain.handle('portfolio:summary'") >= 0);
ok('E1-T2 portfolioSummary() SIGUE expuesto en el preload',
  /portfolioSummary:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('portfolio:summary'\)/.test(SRC_P));
// E1 lo dejó anotado para B1 — y B1 lo resolvió el mismo día: el helper SIGUE
// en main.js (para la futura opción B de E1), pero ya NO se ejecuta desde
// `projects:list`. La asignación `r.staffingActive = staffing` se retiró ahí.
ok('E1-T3 computeStaffingRatio() sigue existiendo, pero B1 lo sacó del listado',
  /function computeStaffingRatio/.test(SRC_M) && !/r\.staffingActive = staffing/.test(SRC_M),
  'la asignación sigue en computeProjectRowExtras');
ok('E1-T4 setView() sigue definida y sigue sin llamarse',
  /function setView\(view\)/.test(SRC_R) && veces(SRC_R, 'setView') === 1);
ok('E1-T5 loadSummary() sigue SIN existir: las vistas siguen incompletas',
  /(function\s+loadSummary\b)|((const|let|var)\s+loadSummary\s*=)/.test(SRC_R) === false);
for (const f of ['staffingPill', 'serviceEndPill', 'timelineBarSVG']) {
  ok('E1-T6 ' + f + '() sigue definida y sin llamar', veces(SRC_R, f) === 1);
}
ok('E1-T7 el CSS de las dos vistas sigue presente',
  /\.list-table-card\{/.test(SRC_H) && /\.summary-kpis\{/.test(SRC_H) && /\.view-switch\{/.test(SRC_H));
ok('E1-T8 el markup interno de las dos vistas sigue presente (oculto)',
  /id="list-tbody"/.test(VIVO_H) && /id="side-panel"/.test(VIVO_H));

// =========================================================================
seccion('E1-M. MINIMALIDAD — que SOLO se ha tocado lo necesario');
// =========================================================================
// Contra el snapshot previo: la unica diferencia del HTML VIVO tiene que ser
// la desaparicion del bloque del conmutador.
if (fs.existsSync(PRE_INDEX)) {
  const PRE = fs.readFileSync(PRE_INDEX, 'utf8');
  const VIVO_PRE = sinComentarios(PRE);
  const lineas = (s) => s.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  const antes = lineas(VIVO_PRE);
  const ahora = lineas(VIVO_H);
  const quitadas = antes.filter((l) => !ahora.includes(l));
  const anadidas = ahora.filter((l) => !antes.includes(l));
  ok('E1-M1 el PRE si tenia el conmutador (el snapshot es el correcto)',
    /id="view-switch"/.test(VIVO_PRE) && (VIVO_PRE.match(/data-view/g) || []).length === 3);
  ok('E1-M2 NO se ha anadido ni una sola linea visible al HTML',
    anadidas.length === 0, JSON.stringify(anadidas.slice(0, 3)));
  // OJO con comparar por CONTENIDO: el `</div>` de cierre del conmutador sigue
  // existiendo en otras 20 lineas del documento, asi que no aparece como
  // "desaparecido". Se comprueban las dos cosas por separado: que las lineas
  // UNICAS que se van son las cuatro del conmutador, y que el documento vivo
  // ha menguado exactamente en las CINCO del bloque (las cuatro + su cierre).
  ok('E1-M3 las unicas lineas que desaparecen son las cuatro del conmutador',
    quitadas.length === 4 &&
    /<div class="view-switch" id="view-switch">/.test(quitadas[0]) &&
    quitadas.slice(1).every((l) => /data-view/.test(l)),
    JSON.stringify(quitadas));
  ok('E1-M3b y el HTML vivo mengua exactamente en las 5 lineas del bloque',
    antes.length - ahora.length === 5,
    JSON.stringify({ antes: antes.length, ahora: ahora.length, delta: antes.length - ahora.length }));
} else {
  ok('E1-M1 falta el snapshot previo ' + path.basename(PRE_INDEX), false);
}

// Ningun OTRO archivo productivo ha cambiado POR E1. Hashes de referencia.
// Si alguno cambia por un trabajo POSTERIOR y legitimo, se actualiza esta tabla
// a conciencia — no se borra. Historial de cada actualizacion:
//
//   main.js  DB75E6C2… (cierre de A2 / ronda H-1)
//         -> 452B411D… (ronda B1, 15 sept 2026): contexto de una pasada de
//            `listProjectRows()` (4→1 lecturas), rutas puras en el listado,
//            `avisarExtraDegradado()` y retirada de `computeStaffingRatio` de
//            `computeProjectRowExtras`. Tampoco toca el lanzador.
//         -> 8954E5ED… (ronda E2, 15 sept 2026): `computeServiceEndWarning`
//            pasa a delegar en vendor/service-status.js, se anade el require,
//            la reescritura de ruta en `fixVendorScriptPaths`, los campos
//            `serviceStatusKind`/`serviceStatusDays` en `computeProjectRowExtras`
//            y se retira la regex del timeline de `portfolio:summary`.
//            NADA de eso toca el lanzador: E1 sigue verde por lo suyo.
//         -> A0CF6246… (ronda B3, 15 sept 2026): los errores relevantes dejan
//            de depender solo de `console`. Se anaden `appLogUnaVezPorSesion`,
//            `motivoSinRutas`, `borrarJournalResuelto` y
//            `soltarExclusivaConRastro`, y 14 `appLog` nuevos junto a sus
//            `console.warn`. Ningun cambio de comportamiento salvo el saneado
//            del motivo del error. Tampoco toca el lanzador.
//         -> DB7FF295… (ronda B4, 16 sept 2026): `projects:reorder` pasa de N
//            commits (uno por fila) a UNA sola mutación anclada a la base, con
//            validación de entrada y una línea en app.log si falla. Tampoco
//            toca el lanzador.
//         -> F81F0A3D… (ronda C1-A, 16 sept 2026): inventario de residuos al
//            arrancar (solo lectura, una línea en app.log) y los mensajes del
//            rekey que prometían "se resuelve sola". Tampoco toca el lanzador.
//         -> 0BC92A46… (ronda F1, 16 sept 2026): el factory-seed horneado deja
//            de poder cerrar su propio <script>. `serializarSeedParaScript`
//            escapa `<` como `<` (escape JSON válido: el valor se recupera
//            EXACTO con JSON.parse) y el reemplazo pasa a ser una FUNCIÓN, para
//            que `$&`/`$'`/`$1` del título no tengan semántica. Son las dos
//            únicas funciones tocadas en main.js. Tampoco toca el lanzador.
//         -> 434BB294… (ronda P17, 17 sept 2026): `fixVendorScriptPaths` deja
//            de encadenar nueve `.replace(cadena, cadena)` y pasa a recorrer
//            una lista con UN patrón: regex GLOBAL (resuelve las DOS
//            ocurrencias de icon-256.png, no solo la primera) y FUNCIÓN de
//            reemplazo (la ruta se inserta literal, sin semántica de `$`).
//            Única función tocada. Tampoco toca el lanzador.
//         -> 16AB5F53… (ronda F3, 17 sept 2026): política de apertura y
//            navegación de ventanas. `aplicarPoliticaDeNavegacion` (+4
//            auxiliares) y su llamada en las 10 BrowserWindow: la ventana hija
//            se deniega siempre y http(s) sale a `shell.openExternal`. SÍ toca
//            el lanzador, pero solo para aplicarle la política.
//         -> E7D596A8… (ronda F2, 17 sept 2026): Content-Security-Policy por
//            cabecera. `CSP_PERFILES`, `perfilCspDeDocumento`,
//            `instalarCspEnSesion` y su registro en `session-created`, más el
//            import de `fileURLToPath`. No toca el código del lanzador: le da
//            su política (sin `unsafe-inline` en scripts) desde fuera.
//         -> 2D05E00B… (ronda P9, 17 sept 2026): un solo lector de
//            `location.json` con estados explícitos (`leerConfigUbicacion`);
//            presente pero inutilizable detiene el arranque (PS-1020) en vez
//            de caer en silencio a la carpeta por defecto; guardas en
//            `decidirCrearSiAusente`, `syncDriveSyncGuardWithLocation` y el
//            rescate PS-1007. No toca el lanzador.
//         -> C4C00809… (ronda P22, 18 sept 2026): la carpeta de datos LOCAL
//            deja de usarse sin decirlo. Reconocimiento de la base local en
//            cuatro estados, puerta `autorizarCarpetaLocal()` antes de nada,
//            confirmación informada (PS-1021/1022/1023), marca durable
//            `historial-ubicacion.json` (PS-1024) y sesión local temporal que
//            no toca la protección de apagado (cierra P20). No toca el lanzador.
//         -> 3A0D7217… (ronda P18 Fase 1, 18 sept 2026): el rescate PS-1007
//            solo restaura una copia con procedencia demostrada (copia LOCAL +
//            registro local + operation_id + installation_id, PREPARADA ->
//            VERIFICADA); las `app.asar.bak-*` heredadas ya no deciden nada;
//            PS-1025/1026/1027. No toca el lanzador.
//
//   db.js    1B16381F… (intacto desde el Bloque 1 hasta B3)
//         -> B03C81FF… (ronda B4, 16 sept 2026): **SOLO COMENTARIOS**. Dos
//            citas a `persist()` que lo describían como si aún existiera pasan
//            a decir que hoy es `aplicarYConfirmar()`. Comprobado por la propia
//            ronda: quitando los comentarios, el código es IDÉNTICO byte a byte.
//            Es la primera vez que db.js sale de la lista de "no modificados".
//
// `dashboard/plantilla_dashboard.html` NO esta en esta tabla a proposito: E1 no
// lo toca ni lo miraba, y lo han modificado P12 y E2 por su cuenta.
const HASHES_TRAS_A2 = {
  'main.js': '3A0D7217A6A7AF056ED7079168E3B974D74858A20F92A3DAAD0BECC75A7AE686',
  'preload.js': 'AA77316F3FDB384D582F8270213A846EE1A1D2E067784EE17DF8D65CC1F6A27B',
  'preload-launcher.js': '01D38C31D5FB9B23E5AD9FC617DEB7E3960E88EBF5A0ACF89C9C8EDDAA21ECFD',
  'preload-backup-picker.js': '19D2D1BAD74F774797E5F129F99FFAF2A19BF77E370BF1727161447B326D3061',
  'launcher\\renderer.js': '9CF8DFD05055A10CB0C7A479CF7608FC3798269755A61F6C4A18135BE52379AB',
  'backup-picker\\renderer.js': '140D6E271DE17798C6CB9B025F21C10112A0085B051A9373627C41653B2E3397',
  'db.js': 'B03C81FF5FC300009DC315E4B20F9BF88DCC6902B18C2EF434B251A022EDD830',
  'security.js': '0BF1CAD061B2D9E71900681E72D00072545282A75E2C9ABE825A96B1DDC5B937',
};
for (const [rel, esperado] of Object.entries(HASHES_TRAS_A2)) {
  const real = sha(path.join(PROJ, rel));
  ok('E1-M4 ' + rel + ' intacto desde el cierre de A2', real === esperado,
    'esperado ' + esperado.slice(0, 16) + ' / real ' + real.slice(0, 16));
}
console.log('  -> A2, A3.3, Security y db.js quedan fuera de esta correccion POR HASH,');
console.log('     no por afirmacion: el unico archivo tocado es launcher/index.html.');

console.log('\n' + '='.repeat(70));
console.log(`  E1 — retirada de Lista/Resumen: ${pass} OK, ${fail} FALLOS`);
if (fallos.length) fallos.forEach((f) => console.log('    - ' + f));
console.log('='.repeat(70));
console.log('  Lista / Portfolio Summary estan RETIRADAS DE LA UI, no completadas.');
console.log('  Reactivarlas exige terminar el lado cliente (opcion B) y resolver');
console.log('  antes el acoplamiento timeline <-> serviceEndMessage (E2).');
process.exitCode = fail === 0 ? 0 : 1;
