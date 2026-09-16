'use strict';
// ---------------------------------------------------------------------------
// B3 — ERRORES SIN RASTRO: inventario, clasificacion y EXIGENCIA del arreglo.
//
// Nacio como bateria DESCRIPTIVA (fijaba el estado y la clasificacion). Con
// B3 autorizado se convierte en bateria que EXIGE el comportamiento corregido:
// si alguien revierte cualquiera de las tres correcciones, esta bateria falla.
//
//   A — solo diagnostico       : puede quedarse en consola.
//   B — debe persistir en log  : sin molestar al usuario, pero con rastro.
//   C — debe verlo el usuario  : necesita saber o actuar.
//   D — ya cubierto            : tiene UI/log/contrato suficiente.
//
// Criterio heredado de B1, que ya resolvio su parte:
//   fallo silencioso repetible -> UNA linea persistente contextualizada,
//   sin spam y sin payload sensible.
//
// Las tres exigencias nuevas (seccion B3-G):
//   B3-C1  cifrado de backup: FAIL-CLOSED. Si no se puede cifrar, NO se
//          escribe en claro, NO se marca como exito y el usuario lo ve.
//   B3-C2  Directorio de Talento: un guardado que falla se ve en pantalla.
//   B3-C3  historial de preparacion: reclasificado C -> D. Ya avisaba con
//          boton Reintentar ANTES de esta ronda. La bateria lo custodia.
//
// Solo lectura: no toca la BD viva, ni produccion, ni escribe nada.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const A = (f) => fs.readFileSync(path.join(PROJ, f), 'utf8');
// Las cuatro fuentes que B3 toca admiten sustitucion por variable de entorno,
// para poder lanzar la MISMA bateria contra una copia revertida (ver
// revertir-b3.js). Sin esto, una reversion no se podria comprobar.
const leer = (env, rel) => fs.readFileSync(process.env[env] || path.join(PROJ, rel), 'utf8');
const MAIN = leer('PANORAMA_MAIN', 'main.js');
const DB = A('db.js');
const DASH = leer('PANORAMA_DASHBOARD', 'dashboard/plantilla_dashboard.html');
const DIR = leer('PANORAMA_DIRECTORIO', 'directorio/plantilla_directorio.html');
const PREP = leer('PANORAMA_PREP', 'preparacion-reunion/plantilla_preparacion_reunion.html');
const LREN = A('launcher/renderer.js');
for (const v of ['PANORAMA_MAIN', 'PANORAMA_DASHBOARD', 'PANORAMA_DIRECTORIO', 'PANORAMA_PREP']) {
  if (process.env[v]) console.log('  [' + v + '] ' + process.env[v]);
}

let pass = 0, fail = 0; const fallos = [];
function ok(n, c, extra) {
  if (c) { pass++; console.log('  OK    ' + n); }
  else { fail++; fallos.push(n); console.log('  FALLO ' + n + (extra ? '  -- ' + extra : '')); }
}
function seccion(t) { console.log('\n=== ' + t + ' ==='); }
const cuenta = (src, re) => (src.match(re) || []).length;
const sinTildes = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '?');

console.log('B3 — inventario y clasificacion de errores sin rastro');

// =========================================================================
seccion('B3-A. ¿ES ALCANZABLE LA CONSOLA EN PRODUCCION? — la premisa de B3');
// =========================================================================
// Si el usuario pudiera abrir DevTools, `console.warn` seria un canal pobre
// pero existente. Se comprueba que NO lo es.
ok('B3-A1 el codigo productivo NUNCA abre DevTools por su cuenta',
  !/openDevTools\(/.test(MAIN) && !/openDevTools\(/.test(DASH) && !/openDevTools\(/.test(LREN),
  'hay algun openDevTools');
ok('B3-A2 no hay atajo de teclado ni entrada de menu para abrirlas',
  !/toggleDevTools/.test(MAIN) && !/'F12'/.test(MAIN),
  'hay una via de usuario para DevTools');
ok('B3-A3 en cambio SI hay una via para ver app.log (openAppLog)',
  /function openAppLog/.test(MAIN) || /openAppLog\(/.test(MAIN));
ok('B3-A4 y varios mensajes al usuario REMITEN a app.log',
  cuenta(MAIN, /app\.log/g) >= 4, 'menciones: ' + cuenta(MAIN, /app\.log/g));
console.log('        -> CONCLUSION: `console.warn` es un NO-OP en produccion, en main y en');
console.log('           renderer. `app.log` es el unico canal persistente alcanzable.');

// =========================================================================
seccion('B3-B. EL MECANISMO appLog() — que es y que limites tiene');
// =========================================================================
ok('B3-B1 escribe en userData/app.log', /path\.join\(app\.getPath\('userData'\), 'app\.log'\)/.test(MAIN));
ok('B3-B2 rota por TAMAÑO a un solo historico (app.log.1)',
  /APP_LOG_MAX_BYTES = 2 \* 1024 \* 1024/.test(MAIN) && /appLogRotatedPath/.test(MAIN));
ok('B3-B3 es SINCRONO (appendFileSync)', /fs\.appendFileSync\(logPath/.test(MAIN));
ok('B3-B4 NUNCA propaga su propio fallo: no puede tumbar la accion que registra',
  /function appLog\(line\) \{\s*try \{/.test(MAIN) && /si ni el log se puede escribir/.test(sinTildes(MAIN)));
ok('B3-B5 ya se usa para los codigos PS-xxxx (errorCodeSuffix registra en app.log)',
  /appLog\(`ERROR \$\{code\}/.test(MAIN));
console.log('  appLog() en main.js: ' + cuenta(MAIN, /appLog\(/g) + ' llamadas');
// LIMITE REAL, y es del propio diseño: el log vive en `userData`, que en esta
// instalacion es G: (Drive). El codigo YA tiene el patron correcto para eso en
// otro sitio — los backups de emergencia usan `appData`, la ruta local, "para
// que siga funcionando aunque sea justo esa carpeta la que ha dejado de
// responder" — pero appLog no lo usa.
ok('B3-B6 [LIMITE] app.log vive en userData: si es Drive quien falla, el aviso se escribe ALLI',
  /appLogFilePath\(\) \{\s*return path\.join\(app\.getPath\('userData'\), 'app\.log'\);/.test(MAIN));
ok('B3-B7 y el codigo ya conoce el patron alternativo (appData) para ese caso',
  /localSafetyBackupsDirForProject/.test(MAIN) &&
  /SIEMPRE la ruta local real de Windows/.test(sinTildes(MAIN)));

// =========================================================================
seccion('B3-C. INVENTARIO: cuanto queda solo en consola, por archivo');
// =========================================================================
const INV = [
  ['main.js', MAIN], ['db.js', DB], ['dashboard', DASH],
  ['directorio', DIR], ['preparacion-reunion', PREP], ['launcher/renderer.js', LREN],
];
console.log('\n  archivo                 console.warn  console.error   appLog   catch(e){} vacio');
console.log('  ' + '-'.repeat(78));
const inv = {};
for (const [n, src] of INV) {
  const w = cuenta(src, /console\.warn\(/g);
  const e = cuenta(src, /console\.error\(/g);
  const a = cuenta(src, /appLog\(/g);
  const c = cuenta(src, /catch\s*\([^)]*\)\s*\{\s*\}/g);
  inv[n] = { w, e, a, c };
  console.log('  ' + n.padEnd(24) + String(w).padEnd(14) + String(e).padEnd(16) + String(a).padEnd(9) + String(c));
}
// El hallazgo original conto 29 warn / 44 appLog en main.js.
ok('B3-INV1 main.js ha MEJORADO desde la auditoria: menos warn y muchos mas appLog',
  inv['main.js'].w < 29 && inv['main.js'].a > 44,
  JSON.stringify(inv['main.js']));
console.log('        auditoria 2026-09-13: 29 console.warn / 44 appLog');
console.log('        hoy:                  ' + inv['main.js'].w + ' console.warn / ' + inv['main.js'].a + ' appLog');
ok('B3-INV2 B3 ha subido el numero de appLog en main.js por encima de 60',
  inv['main.js'].a >= 60, 'appLog=' + inv['main.js'].a);
// LO QUE EL HALLAZGO ORIGINAL NO CONTO: los renderers, que no tienen appLog.
// Y SIGUEN sin tenerlo, por decision explicita: NO se abre un canal `app:log`
// generico para renderers. Lo relevante en renderer se resuelve por UI.
const warnRenderers = inv['dashboard'].w + inv['directorio'].w + inv['preparacion-reunion'].w;
ok('B3-INV3 los RENDERERS siguen sin appLog: NO se ha abierto un IPC de log generico',
  inv['dashboard'].a === 0 && inv['directorio'].a === 0 && inv['preparacion-reunion'].a === 0,
  'alguien ha metido appLog en un renderer');
ok('B3-INV4 y tampoco existe un canal `app:log` en preload ni en main',
  !/'app:log'/.test(MAIN) && !/"app:log"/.test(MAIN) && !/app:log/.test(A('preload.js')),
  'aparece un canal app:log');
console.log('        renderers: ' + warnRenderers + ' console.warn + ' +
  (inv['dashboard'].e + inv['directorio'].e) + ' console.error (siguen siendo NO-OP);');
console.log('        los tres casos que importaban se resuelven ahora por UI, no por log.');

// =========================================================================
seccion('B3-D. CLASIFICACION de los casos representativos');
// =========================================================================
// Cada caso se comprueba EN EL CODIGO, no de memoria.
const CASOS = [
  // --- C: el usuario necesita saberlo -> AHORA TIENE UI ------------------
  { cls: 'C', id: 'cifrado-backup-carpeta', archivo: 'dashboard',
    que: 'el cifrado del backup de carpeta falla',
    prueba: () => /No se pudo crear la copia de seguridad cifrada\. No se ha guardado una copia sin cifrar\./.test(DASH) &&
      /avisarCopiaCarpeta\('cifrado'/.test(DASH),
    porque: 'FAIL-CLOSED: no se escribe en claro y el usuario lo ve' },
  { cls: 'C', id: 'escritura-backup-carpeta', archivo: 'dashboard',
    que: 'no se pudo escribir la copia en la carpeta vinculada',
    prueba: () => /avisarCopiaCarpeta\('escritura'/.test(DASH) &&
      /No se pudo escribir la copia de seguridad en la carpeta vinculada/.test(DASH),
    porque: 'sin aviso, el panel conserva la fecha de la ultima copia buena' },
  { cls: 'C', id: 'guardado-directorio', archivo: 'directorio',
    que: 'fallo al GUARDAR el Directorio de Talento',
    prueba: () => /function marcarGuardadoFallido/.test(DIR) &&
      /Los cambios NO se han guardado/.test(DIR) &&
      /NO GUARDADO . ver aviso/.test(sinTildes(DIR)),
    porque: 'un guardado que no ocurre y nadie avisa es perdida de trabajo' },
  // --- B: rastro persistente -> AHORA EN app.log ------------------------
  { cls: 'B', id: 'copia-html-proyecto', archivo: 'main.js',
    que: 'no se pudo refrescar/actualizar la copia HTML del proyecto',
    prueba: () => /no se pudo refrescar su copia HTML al abrirlo/.test(MAIN) &&
      /appLogUnaVezPorSesion\('html-proyecto-'/.test(MAIN),
    porque: 'el segundo corre en cada backup:save -> con dedupe por sesion' },
  { cls: 'B', id: 'contrasena-recordada', archivo: 'main.js',
    que: 'safeStorage no pudo recordar/preparar la contrasena',
    prueba: () => /appLog\('Seguridad . no se pudo recordar la contrase/.test(sinTildes(MAIN)) &&
      /appLog\('Seguridad . no se pudo preparar la contrase/.test(sinTildes(MAIN)),
    porque: 'ocurre solo al activarlo: appLog directo, sin dedupe' },
  { cls: 'B', id: 'vacuum-migracion', archivo: 'main.js',
    que: 'no se pudo compactar la BD tras la migracion',
    prueba: () => /appLog\('Migraci.n de backups antiguos . no se pudo compactar/.test(sinTildes(MAIN)),
    porque: 'pasa una sola vez; conviene poder auditar la migracion' },
  { cls: 'B', id: 'borrar-cv', archivo: 'main.js',
    que: 'no se pudo borrar el archivo del CV: queda huerfano',
    prueba: () => /no se pudo borrar el archivo del CV; queda hu.rfano en disco/.test(sinTildes(MAIN)),
    porque: 'es la familia de C1 (basura acumulada) y no dejaba rastro' },
  { cls: 'B', id: 'dialogo-guardado', archivo: 'main.js',
    que: 'no se pudo mostrar el dialogo de guardado: la descarga se cancela',
    prueba: () => /appLog\('Exportaci.n . no se pudo mostrar el di.logo de guardado/.test(sinTildes(MAIN)),
    porque: 'no se convierte en dialogo: fallaria el mismo sistema que ha fallado' },
  { cls: 'B', id: 'abrir-en-explorador', archivo: 'main.js',
    que: 'shell.openPath fallo al abrir una carpeta',
    prueba: () => /appLog\(`No se pudo abrir en el explorador/.test(MAIN),
    porque: 'el usuario ve que no se abre; soporte necesita saber por que' },
  { cls: 'B', id: 'extras-excepcion', archivo: 'main.js',
    que: 'excepcion INESPERADA calculando los extras del listado',
    prueba: () => /appLogUnaVezPorSesion\('extras-sem-'/.test(MAIN) &&
      /appLogUnaVezPorSesion\('extras-fin-'/.test(MAIN),
    porque: 'no deberian saltar nunca; si saltan es un bug y hace falta el rastro' },
  // No basta con que EXISTAN las dos funciones: se exige que dejen rastro.
  // Vaciarles el catch las dejaria con el mismo nombre y el mismo silencio.
  { cls: 'B', id: 'cleanup-journal', archivo: 'main.js',
    que: 'no se pudo borrar un journal ya resuelto / soltar la exclusiva',
    prueba: () => /appLogUnaVezPorSesion\('journal-huerfano-' \+ ruta,/.test(MAIN) &&
      /appLogUnaVezPorSesion\('exclusiva-' \+ que,/.test(MAIN),
    porque: 'best-effort sigue siendo best-effort, pero explica un bloqueo posterior' },
  // --- A: puede quedarse en consola --------------------------------------
  { cls: 'A', id: 'bounds-ventana', archivo: 'main.js',
    que: 'no se pudo guardar el tamano/posicion de la ventana',
    prueba: () => /No se pudo guardar el tama/.test(sinTildes(MAIN)),
    porque: 'no afecta a datos ni a comportamiento; se recalcula solo' },
  { cls: 'A', id: 'accion-desconocida', archivo: 'main.js',
    que: 'accion de menu desconocida',
    prueba: () => /acci.n desconocida/.test(sinTildes(MAIN)),
    porque: 'solo puede pasar por un bug de programacion: es diagnostico' },
  { cls: 'A', id: 'modal-fallback', archivo: 'main.js',
    que: 'no se pudo mostrar el modal propio (cae al dialogo nativo)',
    prueba: () => /\[modalAlert\] no se pudo mostrar el modal:/.test(MAIN),
    porque: 'el usuario VE el aviso igual, por el otro canal' },
  // --- D: ya cubierto ANTES de esta ronda --------------------------------
  { cls: 'D', id: 'historial-reunion', archivo: 'preparacion-reunion',
    que: 'no se pudo guardar la preparacion en el historial',
    prueba: () => /No se pudo guardar autom.ticamente/.test(sinTildes(PREP)) &&
      /id="btn-retry-save"/.test(PREP),
    porque: 'YA pintaba un aviso con boton Reintentar: era D, no C. No se toca' },
  { cls: 'D', id: 'backup-emergencia', archivo: 'main.js',
    que: 'no se pudo escribir la copia de rescate local',
    prueba: () => /appLog\('Backup . la copia de rescate local NO se pudo escribir/.test(sinTildes(MAIN)),
    porque: 'YA tenia appLog justo al lado del warn. No se toca' },
  { cls: 'D', id: 'extras-del-listado', archivo: 'main.js',
    que: 'backup/evaluacion ilegible al construir el listado',
    prueba: () => /function avisarExtraDegradado/.test(MAIN) &&
      /Listado de proyectos . proyecto \$\{projectId\}/.test(sinTildes(MAIN)),
    porque: 'B1 lo resolvio: una linea por proyecto+recurso+pasada' },
  { cls: 'D', id: 'codigos-PS', archivo: 'main.js',
    que: 'fallos de restore, rekey, borrado y recuperacion',
    prueba: () => /errorCodeSuffix\('PS-200/.test(MAIN) && /appLog\('ERROR PS-/.test(MAIN),
    porque: 'codigo PS-xxxx, entrada en app.log Y dialogo al usuario' },
  { cls: 'D', id: 'contrato-tres-formas', archivo: 'main.js + renderers',
    que: 'cualquier canal mutante que no aplica',
    prueba: () => /accionNoAplicada/.test(MAIN) && /res\.aplicado !== true/.test(LREN),
    porque: 'el renderer decide por `aplicado` y avisa, sin depender de ningun log' },
];

const porClase = { A: 0, B: 0, C: 0, D: 0 };
console.log('\n  cls  caso                        archivo                que');
console.log('  ' + '-'.repeat(104));
for (const c of CASOS) {
  porClase[c.cls]++;
  console.log('  ' + c.cls.padEnd(5) + c.id.padEnd(28) + c.archivo.padEnd(22) + c.que.slice(0, 48));
  ok('B3-D [' + c.cls + '] ' + c.id + ': el caso existe en el codigo', c.prueba(),
    'no se encontro el patron en ' + c.archivo);
}
console.log('\n  reparto: A=' + porClase.A + '  B=' + porClase.B + '  C=' + porClase.C + '  D=' + porClase.D);
ok('B3-D0 hay casos en las cuatro clases', Object.values(porClase).every((n) => n > 0), JSON.stringify(porClase));

// =========================================================================
seccion('B3-E. CATCH VACIOS: agrupados por patron, no uno a uno');
// =========================================================================
// La inmensa mayoria son limpieza best-effort DESPUES de que el estado
// principal ya este decidido. No son defectos: son el patron correcto y se
// quedan EXACTAMENTE como estaban (decision explicita de esta ronda).
const patrones = [
  ['borrar un temporal (SE QUEDA)', /try \{ fs\.unlinkSync\(tmp\); \} catch \([^)]*\) \{\}/g, MAIN, 'A'],
  ['cerrar un descriptor / la BD (SE QUEDA)', /try \{ (?:if \(db\) )?db?\.close\(\); \} catch \([^)]*\) \{\}/g, DB, 'A'],
  ['stat de bookkeeping (SE QUEDA)', /try \{ const s = fs\.statSync\(dbFilePath\);/g, DB, 'A'],
  ['limpiar material de restauracion (SE QUEDA)', /try \{ fs\.rmSync\(dirDeRestauracion\(actionId\)/g, MAIN, 'A'],
];
console.log('\n  patron                                       veces  clase');
console.log('  ' + '-'.repeat(62));
let total = 0;
for (const [n, re, src, cls] of patrones) {
  const v = cuenta(src, re);
  total += v;
  console.log('  ' + n.padEnd(45) + String(v).padEnd(7) + cls);
}
ok('B3-E1 los catch vacios INOCUOS siguen ahi: B3 no los ha tocado',
  total >= 8, 'cubiertos: ' + total);
// Los DOS que si merecian decision ya NO son catch vacios.
ok('B3-E2 ya NO queda ningun `soltarExclusiva` con catch vacio',
  cuenta(MAIN, /try \{ dbmod\.soltarExclusiva\([^)]*\); \} catch \([^)]*\) \{\}/g) === 0,
  'sigue habiendo alguno mudo');
ok('B3-E3 ya NO queda ningun borrado de journal resuelto con catch vacio',
  cuenta(MAIN, /try \{ fs\.unlinkSync\(journal(?:Borrado|Accion)Path\([^)]*\)\); \} catch \([^)]*\) \{\}/g) === 0,
  'sigue habiendo alguno mudo');
ok('B3-E4 el borrado de journal pasa por un solo sitio con rastro',
  cuenta(MAIN, /borrarJournalResuelto\(/g) >= 6, // 1 definicion + >= 5 usos
  'usos: ' + cuenta(MAIN, /borrarJournalResuelto\(/g));
ok('B3-E5 y la limpieza SIGUE siendo best-effort: no se ha vuelto fatal',
  /function borrarJournalResuelto\(ruta, que\) \{[\s\S]{0,400}?catch \(e\) \{\s*appLogUnaVezPorSesion/.test(MAIN) &&
  !/function borrarJournalResuelto[\s\S]{0,600}?\bthrow\b/.test(MAIN),
  'la limpieza ha pasado a propagar el fallo: eso cambia el protocolo');
ok('B3-E6 el rastro es UNA vez por sesion y por causa, no spam',
  /function appLogUnaVezPorSesion/.test(MAIN) && /avisosYaRegistrados\.has\(clave\)/.test(MAIN));
console.log('        -> esos dos NO pierden datos (el protocolo es idempotente y');
console.log('           fail-closed), pero producian un bloqueo posterior SIN explicacion.');
console.log('           Ahora dejan UNA linea en app.log y el protocolo no cambia.');

// =========================================================================
seccion('B3-F. LO QUE **NO** ES B3 — para no ensanchar el alcance');
// =========================================================================
ok('B3-F1 vendor/ son librerias de terceros (pdf.js, mammoth): fuera',
  fs.existsSync(path.join(PROJ, 'vendor', 'pdf.min.js')));
ok('B3-F2 scripts/ son herramientas de desarrollo, no van en el empaquetado',
  !/scripts/.test(JSON.parse(A('package.json')).build.files.join('|')));
ok('B3-F3 B4 (persist sin try/catch) es OTRO hallazgo: no se toca aqui',
  /## B4\./.test(A('claude/auditoria-2026-09-13.md')));
ok('B3-F4 y B1 ya cerro su parte: no se vuelve a tocar el listado',
  /function avisarExtraDegradado/.test(MAIN));

// =========================================================================
seccion('B3-C1. CIFRADO DE BACKUP — FAIL-CLOSED (exigencia, no descripcion)');
// =========================================================================
// El defecto: si `encryptBackupPayload` fallaba, se guardaba `rawPayload` EN
// CLARO y el unico rastro era un console.warn invisible. Se exige lo contrario.
const bloqueCifrado = (() => {
  const i = DASH.indexOf('if(state.backupEncryptionEnabled && backupEncryptionPassword){');
  const j = DASH.indexOf('const fileHandle = await backupDirHandle.getFileHandle', i);
  return i >= 0 && j > i ? DASH.slice(i, j) : '';
})();
ok('B3-C1a existe el bloque de cifrado dentro de writeBackupToFolder', bloqueCifrado.length > 0,
  'no se localizo el bloque: la funcion ha cambiado de forma');
ok('B3-C1b si el cifrado falla se SALE de la funcion (return), no se sigue escribiendo',
  /catch\(e\)\{[\s\S]*?\breturn;\s*\}/.test(bloqueCifrado),
  'el catch del cifrado no corta el flujo');
ok('B3-C1c NO queda ningun fallback que reasigne el payload en claro',
  !/payload\s*=\s*rawPayload/.test(bloqueCifrado.replace(/^\s*let payload.*$/m, '')) &&
  !/se guarda sin cifrar/.test(DASH),
  'ha vuelto el fallback a claro');
ok('B3-C1d el archivo ni se crea: getFileHandle(create:true) queda DESPUES del return',
  DASH.indexOf('getFileHandle(backupFileName(nowDate), { create:true })') >
  DASH.indexOf("avisarCopiaCarpeta('cifrado'"),
  'el archivo se crea antes de decidir si hay cifrado');
ok('B3-C1e el usuario lo VE, y con el texto acordado',
  /No se pudo crear la copia de seguridad cifrada\. No se ha guardado una copia sin cifrar\./.test(DASH),
  'falta el mensaje literal acordado');
ok('B3-C1f el mensaje dice que los datos siguen intactos y que se puede reintentar',
  /Tus datos siguen intactos\. Puedes volver a intentarlo/.test(DASH));
ok('B3-C1g la operacion NO se marca como exito: no se toca backupFolderInfo en el camino de fallo',
  !/ui\.backupFolderInfo\s*=/.test(bloqueCifrado), 'el camino de fallo actualiza el panel');
ok('B3-C1h el aviso automatico no hace spam: dedupe por motivo, salvo si el usuario lo pidio',
  /if\(!force && avisoCopiaCarpetaMostrado === motivo\) return;/.test(DASH));
ok('B3-C1i las 3 llamadas manuales pasan force=true y la automatica force=false',
  cuenta(DASH, /writeBackupToFolder\(true\)/g) >= 3 && /writeBackupToFolder\(false\)/.test(DASH),
  'manuales: ' + cuenta(DASH, /writeBackupToFolder\(true\)/g));
ok('B3-C1j el fallo de ESCRITURA (no de cifrado) tambien avisa',
  /avisarCopiaCarpeta\('escritura'/.test(DASH));

// =========================================================================
seccion('B3-C2. DIRECTORIO DE TALENTO — un guardado que falla se VE');
// =========================================================================
ok('B3-C2a existe un unico punto que marca el guardado como fallido',
  /function marcarGuardadoFallido\(e\)\{/.test(DIR));
ok('B3-C2b pinta el estado en la propia pantalla (#save-note)',
  /NO GUARDADO . ver aviso/.test(sinTildes(DIR)));
ok('B3-C2c y lanza un aviso explicito una vez por sesion',
  /Los cambios NO se han guardado/.test(DIR) &&
  /if\(avisoGuardadoMostrado\) return;/.test(DIR));
ok('B3-C2d el aviso dice que lo escrito sigue en pantalla (no se pierde el trabajo)',
  /Lo que has escrito sigue en pantalla/.test(DIR));
ok('B3-C2e el camino del DEBOUNCE (saveState, 350ms) usa marcarGuardadoFallido',
  /}, 350\);/.test(DIR) &&
  /async function saveState\(\)\{[\s\S]{0,1500}?marcarGuardadoFallido\(e\);[\s\S]{0,120}?\}, 350\);/.test(DIR),
  'saveState ya no avisa');
ok('B3-C2f el camino del CIERRE (flushPendingSave) tambien: es el ultimo guardado posible',
  /function flushPendingSave\(\)\{[\s\S]*?marcarGuardadoFallido\(e\);/.test(DIR),
  'flushPendingSave vuelve a fallar en silencio');
ok('B3-C2g ya NO queda ningun `console.warn` de guardado SIN marcar el fallo',
  !/catch\(e\)\{\s*console\.warn\('Error al guardar', e\);\s*\}/.test(DIR) &&
  !/console\.warn\('Error al forzar guardado pendiente', e\)/.test(DIR),
  'ha vuelto el warn mudo');
ok('B3-C2h el aviso NO se rompe si psAlert falla (flushPendingSave es sincrono)',
  /try\{\s*psAlert\([\s\S]{0,400}?\}catch\(e2\)\{/.test(DIR));
// DEFECTO ENCONTRADO AL IMPLEMENTAR B3, no en el inventario previo:
// `storageSet` se traga la excepcion y devuelve `false`. Cablear el aviso al
// `catch` no bastaba: por un fallo REAL de escritura el catch no se disparaba
// y la pantalla ponia "Guardado hh:mm:ss". Se exige decidir POR EL VALOR.
ok('B3-C2i storageSet NO lanza: devuelve false cuando la escritura falla',
  /async function storageSet\(key, value\)\{[\s\S]{0,400}?catch\(e\)\{ return false; \}/.test(DIR),
  'storageSet ha cambiado de contrato: revisar quien decide con el');
ok('B3-C2j y saveState decide POR EL VALOR DEVUELTO, no solo por excepcion',
  /const guardado = await storageSet\(STORAGE_KEY, raw\);\s*if\(guardado === false\) marcarGuardadoFallido\(/.test(DIR),
  'saveState vuelve a ignorar el valor: dira "Guardado" sin haber guardado');
ok('B3-C2k el caso contrario ya estaba bien en el dashboard: alli SI se miraba',
  /const ok = await storageSet\(STORAGE_KEY, JSON\.stringify\(state\)\);\s*if\(ok\)\{/.test(DASH) &&
  /No se pudo guardar\. Usa "Exportar copia"/.test(DASH),
  'el dashboard tambien ha dejado de mirarlo');

// =========================================================================
seccion('B3-C3. HISTORIAL DE PREPARACION — reclasificado C -> D');
// =========================================================================
// AUTORIZADO como caso C, pero al ir a tocarlo se comprobo que YA avisaba.
// No se ha modificado el archivo. La bateria custodia ese aviso para que no
// desaparezca, y deja constancia de la reclasificacion.
ok('B3-C3a el estado de error se pinta en pantalla, no en consola',
  /No se pudo guardar autom.ticamente/.test(sinTildes(PREP)));
ok('B3-C3b y ofrece reintentar a mano',
  /id="btn-retry-save"/.test(PREP) && /btn-retry-save/.test(PREP));
// Los dos caminos de fallo NO se escriben igual: el de `aplicado:false` es un
// ternario y el de excepcion una asignacion directa. Se exigen los dos, cada
// uno con su forma real, no un recuento ciego.
ok('B3-C3c camino 1 — la accion no se aplica (contrato de tres formas): status = error',
  /const aplicado = !!\(result && result\.aplicado === true\);\s*state\.saveHistoryStatus = aplicado \? 'ok' : 'error';/.test(PREP),
  'el camino de `aplicado:false` ya no marca error');
ok('B3-C3c2 camino 2 — excepcion en el canal: status = error',
  /\}catch\(e\)\{\s*state\.saveHistoryStatus = 'error';/.test(PREP),
  'el camino de excepcion ya no marca error');
ok('B3-C3d el cuarto estado del contrato (aplicado sin verificar) NO ofrece reintentar',
  /'requiere-reinicio'/.test(PREP) &&
  /El cambio S. se guard., pero esta sesi.n no puede continuar/.test(sinTildes(PREP)));
ok('B3-C3e B3 NO ha modificado este archivo: el aviso es anterior a esta ronda',
  !/B3 \(15 sept 2026\)/.test(PREP), 'se ha tocado preparacion-reunion en B3');
console.log('        -> RECLASIFICADO C -> D. La autorizacion asumia que fallaba en');
console.log('           silencio; el codigo demuestra que no. Se deja como esta.');

// =========================================================================
seccion('B3-S. NINGUN MENSAJE NUEVO FILTRA SECRETOS NI RUTAS');
// =========================================================================
const NUEVOS = [
  ['dashboard', DASH], ['directorio', DIR], ['main.js', MAIN],
];
ok('B3-S1 ningun aviso de B3 interpola una contrasena',
  !NUEVOS.some(([, s]) => /(?:psAlert|appLog)\([^;]{0,400}\$\{[^}]*(?:password|Password|contrase)/.test(s)),
  'un mensaje incluye la contrasena');
ok('B3-S2 ningun aviso de B3 interpola el payload o el blob',
  !NUEVOS.some(([, s]) => /(?:psAlert|appLog)\([^;]{0,400}\$\{[^}]*(?:payload|rawPayload|blob|Blob)/.test(s)),
  'un mensaje incluye el payload');
// El `console.warn` de al lado si lleva la ruta entera, y se queda: es un
// NO-OP en produccion y solo sirve en desarrollo. Lo que se EXIGE es que la
// linea PERSISTENTE —la que queda escrita en app.log— no la lleve.
ok('B3-S3 el rastro persistente de openPathLogged registra solo el NOMBRE',
  /appLog\(`No se pudo abrir en el explorador "\$\{path\.basename\(String\(targetPath\)\)\}"/.test(MAIN),
  'se registra la ruta entera en app.log');
ok('B3-S4 el rastro de journal registra solo el basename del fichero',
  /path\.basename\(String\(ruta\)\)/.test(MAIN), 'se registra la ruta entera del journal');
ok('B3-S5 los avisos de cifrado no nombran la carpeta de destino',
  !/avisarCopiaCarpeta\('cifrado'[\s\S]{0,600}?backupDirHandle\.name/.test(DASH));

// LO ENCONTRO EL ARNES DE ELECTRON REAL, no la revision del codigo: poner
// `path.basename()` en la parte que escribimos nosotros no sirve de nada si
// justo despues se concatena `e.message`, porque el mensaje de una excepcion
// de `fs` YA lleva dentro la ruta completa con el usuario de Windows.
ok('B3-S6 existe un saneador unico para el motivo del error',
  /function motivoSinRutas\(e\) \{/.test(MAIN), 'no hay saneador');
{
  // Se recorre CADA sentencia appLog de main.js y se mira SOLO las que dicen
  // algo que escribio B3. Las anteriores (codigos PS-xxxx sobre todo) llevan
  // el mensaje literal a proposito y quedan fuera de alcance: se cuentan
  // aparte para que el numero este a la vista, no para exigir nada.
  const FRASES_B3 = [
    'no se pudo abrir en el explorador',
    'no se pudo refrescar su copia HTML al abrirlo',
    'no se pudo actualizar su copia HTML tras guardar',
    'no se pudo compactar la base de datos',
    'no se pudo recordar la contrase',
    'no se pudo preparar la contrase',
    'no se pudo mostrar el dialogo de guardado',   // NO el de fallo fatal, que es anterior
    'no se pudo borrar el archivo del CV',
    'no se pudo leer su t',
    'no se pudo borrar el registro de',
    'no se pudo soltar la exclusiva de',
    'excepcion inesperada calculando',   // sinTildes() ya ha quitado la tilde
  ];
  const plano = sinTildes(MAIN);
  const sentencias = [];
  const re = /appLog(?:UnaVezPorSesion)?\(/g;
  let m;
  while ((m = re.exec(plano))) {
    // Se corta en el primer `);` que cierre: basta para ver como termina la
    // concatenacion, que es lo unico que se esta juzgando.
    const fin = plano.indexOf(');', m.index);
    sentencias.push(plano.slice(m.index, fin < 0 ? m.index + 500 : fin + 2));
  }
  // Sin distinguir mayusculas: unas lineas empiezan la frase y otras la
  // llevan detras de un prefijo ("Proyecto 3 - no se pudo...").
  const deB3 = sentencias.filter((s) => FRASES_B3.some((f) => s.toLowerCase().indexOf(f.toLowerCase()) >= 0));
  const crudas = deB3.filter((s) => !/motivoSinRutas\(/.test(s));
  const ajenasEnCrudo = sentencias.length - deB3.length;
  console.log('  sentencias appLog en main.js: ' + sentencias.length +
    '   de B3: ' + deB3.length + '   anteriores (fuera de alcance): ' + ajenasEnCrudo);
  // B3 anadio 15 lineas y las 15 pasan por el saneador. El recuento total de
  // usos del saneador puede ser MAYOR, y eso es correcto: las rondas
  // siguientes lo reutilizan. B4 (16 sept 2026) anadio el 16o, el fallo de
  // `projects:reorder`, que NO es de B3 y por eso no esta en FRASES_B3.
  //
  // Lo que esta bateria exige sigue siendo exacto: que NINGUNA de las SUYAS
  // vaya en crudo, y que sigan siendo 15.
  const usos = cuenta(MAIN, /motivoSinRutas\(/g) - 1;   // menos la definicion
  ok('B3-S7 las ' + deB3.length + ' lineas de B3 pasan TODAS por el saneador',
    crudas.length === 0 && deB3.length === 15 && usos >= deB3.length,
    'en crudo: ' + JSON.stringify(crudas.map((s) => s.slice(0, 90))) +
    '  detectadas: ' + deB3.length + '  usos del saneador: ' + usos);
  console.log('  usos del saneador en main.js: ' + usos +
    '   (15 de B3 + ' + (usos - 15) + ' de rondas posteriores)');
}
// Y la prueba que de verdad importa: que el saneador FUNCIONE. Se extrae de
// main.js y se ejecuta contra el mensaje EXACTO que devolvio Windows en el
// arnes real (B3-RC4d), no contra uno inventado.
{
  const i = MAIN.indexOf('function motivoSinRutas(e) {');
  let cuerpo = '';
  if (i >= 0) {
    let prof = 0;
    for (let k = MAIN.indexOf('{', i); k < MAIN.length; k++) {
      if (MAIN[k] === '{') prof++;
      else if (MAIN[k] === '}') { prof--; if (prof === 0) { cuerpo = MAIN.slice(i, k + 1); break; } }
    }
  }
  let fn = null;
  try { fn = new Function('path', cuerpo + '; return motivoSinRutas;')(path); } catch (e) { /* queda null */ }
  ok('B3-S8 el saneador se puede extraer y ejecutar', typeof fn === 'function', 'no se pudo extraer');
  if (typeof fn === 'function') {
    const real = new Error("EPERM: operation not permitted, open 'C:\\Users\\ADMIN~1.JLO\\AppData\\Local\\Temp\\_a33-b3-real\\Roaming\\panorama-app\\projects\\1\\dashboard.html'");
    const out = fn(real);
    ok('B3-S8a con el mensaje REAL de Windows, la ruta desaparece',
      out.indexOf('C:\\') < 0 && out.indexOf('ADMIN~1.JLO') < 0 && out.indexOf('AppData') < 0, out);
    ok('B3-S8b pero se conserva el codigo del error: sigue siendo diagnosticable',
      out.indexOf('EPERM') === 0, out);
    ok('B3-S8c y el nombre del archivo, que es lo unico que situa el problema',
      out.indexOf('dashboard.html') >= 0, out);
    const limpio = fn(new Error('la base de datos esta bloqueada por otra operacion'));
    ok('B3-S8d un mensaje SIN rutas no se toca',
      limpio === 'la base de datos esta bloqueada por otra operacion', limpio);
    ok('B3-S8e y tampoco se rompe con un error que no es un Error',
      fn('fallo suelto') === 'fallo suelto' && fn(null) === '' && fn(undefined) === '',
      JSON.stringify([fn('fallo suelto'), fn(null), fn(undefined)]));
  }
}

console.log('\n' + '='.repeat(70));
console.log(`  B3 — inventario, clasificacion y EXIGENCIA: ${pass} OK, ${fail} FALLOS`);
if (fallos.length) fallos.forEach((f) => console.log('    - ' + f));
console.log('='.repeat(70));
console.log('  Secciones A-F: describen el estado y custodian lo que NO se toca.');
console.log('  Secciones C1/C2/C3/S: EXIGEN el arreglo de B3. Si se revierte, fallan.');
process.exitCode = fail === 0 ? 0 : 1;
