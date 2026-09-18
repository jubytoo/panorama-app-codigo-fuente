'use strict';
// ---------------------------------------------------------------------------
// C1 — RESIDUOS: inventario, clasificación y comportamiento ACTUAL.
//
// Batería DESCRIPTIVA. No exige ningún cambio: fabrica en sandbox cada clase
// de residuo que el código de hoy puede dejar (o que dejó el de antes) y mide
// qué hace con ella la app actual — si la limpia sola, si la acumula o si
// necesita que alguien intervenga.
//
// El hallazgo original (auditoria-2026-09-13, C1) decía:
//   · BACKUP_KEEP = 15, pero en disco hay proyectos con 50 `backup_*.json`
//   · los que sobran NO tienen fila: la purga solo borra archivos de filas
//   · nada los vuelve a tocar nunca
//   · arreglo propuesto: barrer al arrancar y borrar los que no tengan fila
//
// Lo que esta batería añade antes de decidir nada: ese arreglo, tal cual, es
// INSEGURO. Ver secciones E y R.
//
// DESDE C1-A (16 sept 2026) la sección `C1-A` EXIGE — no describe — las dos
// cosas autorizadas: el inventario de arranque (leer → clasificar → registrar,
// sin tocar nada) y el corte de las fuentes activas (CV de "Eliminar
// evaluación" e "Importar", y los mensajes que prometían una autorrecuperación
// que no existe). Las aserciones que describían el comportamiento anterior en
// esos tres puntos (`C1-D3/D4`, `C1-E8b/c`, `C1-E9c`) se han INVERTIDO, con nota.
// El resto sigue siendo descriptivo: C1-B (retirada de lo histórico) está
// DIFERIDA y aquí no se borra nada.
//
// MÉTODO, tres capas que se distinguen siempre:
//   1. ESTÁTICA  — qué dice el código fuente (sin comentarios cuando importa).
//   2. EJECUTADA — funciones REALES de main.js extraídas por firma, y el db.js
//                  real, contra carpetas de usar y tirar.
//   3. INYECTADA — fallos de `fs` provocados a propósito, SOLO en el sandbox.
//
// Solo lectura sobre datos reales: el guardián común aborta (exit 99) si una
// ruta de prueba pudiera ser de producción, y comprueba la BD viva al salir
// (exit 98 si cambió). Ninguna sección lee la carpeta real del usuario.
// ---------------------------------------------------------------------------
const fsReal = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const Module = require('module');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const MARCA_PRUEBAS = '_a33-c1-PRUEBAS';
const RAIZ = path.join(os.tmpdir(), MARCA_PRUEBAS);

const GUARDIA = require(path.join(__dirname, '..', 'comun', 'guardia-rutas.js'));
const guardia = GUARDIA.crearGuardia({ marca: MARCA_PRUEBAS });
const segura = guardia.segura;
segura(RAIZ);
fsReal.rmSync(RAIZ, { recursive: true, force: true });
fsReal.mkdirSync(RAIZ, { recursive: true });

// La BD residual de P10 también se vigila: esta batería habla de ella.
const P10_BD = path.join(process.env.APPDATA || '', 'panorama-app', 'panorama.sqlite3');
const shaArchivo = (f) => { try { return crypto.createHash('sha256').update(fsReal.readFileSync(f)).digest('hex'); } catch (e) { return 'NO-EXISTE'; } };
const P10_ANTES = shaArchivo(P10_BD);

// ---------------------------------------------------------------------------
// INYECCIÓN DE FALLOS en el módulo `fs` REAL (db.js busca la propiedad en cada
// llamada). Acotada a rutas del sandbox; todo lo demás pasa de largo.
// ---------------------------------------------------------------------------
const INY = { que: null, filtro: null, fd: null, disparos: 0 };
const ORIG = { openSync: fsReal.openSync, fsyncSync: fsReal.fsyncSync, renameSync: fsReal.renameSync, unlinkSync: fsReal.unlinkSync };
const enSandbox = (p) => { try { return path.resolve(String(p)).toLowerCase().startsWith(RAIZ.toLowerCase()); } catch (e) { return false; } };
fsReal.openSync = function (p, ...a) {
  const fd = ORIG.openSync.call(fsReal, p, ...a);
  if (INY.que === 'fsync' && enSandbox(p) && INY.filtro(String(p))) INY.fd = fd;
  return fd;
};
fsReal.fsyncSync = function (fd, ...a) {
  if (INY.que === 'fsync' && INY.fd === fd) { INY.disparos++; const e = new Error('EIO: fsync INYECTADO (C1)'); e.code = 'EIO'; throw e; }
  return ORIG.fsyncSync.call(fsReal, fd, ...a);
};
fsReal.renameSync = function (o, d, ...a) {
  if (INY.que === 'rename' && enSandbox(d) && INY.filtro(String(d))) { INY.disparos++; const e = new Error('EPERM: rename INYECTADO (C1)'); e.code = 'EPERM'; throw e; }
  return ORIG.renameSync.call(fsReal, o, d, ...a);
};
fsReal.unlinkSync = function (p, ...a) {
  if (INY.que === 'unlink' && enSandbox(p) && INY.filtro(String(p))) { INY.disparos++; const e = new Error('EBUSY: unlink INYECTADO (C1)'); e.code = 'EBUSY'; throw e; }
  return ORIG.unlinkSync.call(fsReal, p, ...a);
};
const inyectar = (que, filtro) => { INY.que = que; INY.filtro = filtro; INY.fd = null; INY.disparos = 0; };
const sinInyeccion = () => { INY.que = null; INY.filtro = null; INY.fd = null; };
const fs = fsReal;

// ---------------------------------------------------------------------------
let DIR_DATOS = path.join(RAIZ, 'datos-inicial');
let DIR_APPDATA = path.join(RAIZ, 'appdata');
fs.mkdirSync(DIR_DATOS, { recursive: true });
fs.mkdirSync(DIR_APPDATA, { recursive: true });
const appDoble = { getPath: (k) => (k === 'appData' ? DIR_APPDATA : DIR_DATOS) };
const origLoad = Module._load;
Module._load = function (r) {
  if (r === 'electron') return { app: appDoble };
  return origLoad.apply(this, arguments);
};
const dbmod = require(path.join(PROJ, 'db.js'));
const securitymod = require(path.join(PROJ, 'security.js'));
const initSqlJs = require(path.join(PROJ, 'node_modules', 'sql.js'));
const B5 = require(path.join(__dirname, '..', 'comun', 'bloque5-extraccion.js'));

const RUTA_MAIN = process.env.PANORAMA_MAIN || path.join(PROJ, 'main.js');
const RUTA_DB = process.env.PANORAMA_DB || path.join(PROJ, 'db.js');
const RUTA_EVAL = process.env.PANORAMA_EVAL || path.join(PROJ, 'evaluacion-candidatos', 'plantilla_evaluacion_candidatos.html');
for (const v of ['PANORAMA_MAIN', 'PANORAMA_DB', 'PANORAMA_EVAL']) {
  if (process.env[v]) console.log('  [' + v + '] ' + process.env[v]);
}
const SRC = fs.readFileSync(RUTA_MAIN, 'utf8');
const SRC_DB = fs.readFileSync(RUTA_DB, 'utf8');
const SRC_EVAL = fs.readFileSync(RUTA_EVAL, 'utf8');
const DOC = (n) => fs.readFileSync(path.join(PROJ, 'claude', n), 'utf8');

let pass = 0, fail = 0; const fallos = [];
function ok(n, c, extra) {
  if (c) { pass++; console.log('  OK    ' + n); }
  else { fail++; fallos.push(n); console.log('  FALLO ' + n + (extra === undefined ? '' : '  -- ' + extra)); }
}
function seccion(t) { console.log('\n=== ' + t + ' ==='); }
function nota(s) { console.log('        ' + s); }

// Mismo criterio que B4/B5: sin tildes pero conservando saltos de línea, y sin
// comentarios cuando la pregunta es "¿esto EXISTE en el código?".
const sinTildes = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E\n\r]/g, '?');
function soloCodigo(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
const COD = soloCodigo(SRC);
const COD_DB = soloCodigo(SRC_DB);

function extraerDe(src, firma) {
  const i = src.indexOf(firma);
  if (i < 0) throw new Error('NO SE ENCONTRO: ' + firma);
  let j = src.indexOf('{', i), prof = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (prof === 0) return src.slice(i, k + 1); }
  }
  throw new Error('no delimitado: ' + firma);
}
const extraer = (f) => extraerDe(SRC, f);
function lineaConst(n) { const i = SRC.indexOf(n); if (i < 0) throw new Error('falta ' + n); return SRC.slice(i, SRC.indexOf('\n', i) + 1); }
function extraerHandler(canal, nombreFn) {
  const i = SRC.indexOf(`ipcMain.handle('${canal}'`);
  if (i < 0) throw new Error('NO SE ENCONTRO el handler ' + canal);
  const flecha = SRC.indexOf('=> {', i);
  const firma = SRC.slice(SRC.indexOf('(', SRC.indexOf(',', i)), flecha).trim();
  const j = SRC.indexOf('{', flecha);
  let prof = 0;
  for (let k = j; k < SRC.length; k++) {
    if (SRC[k] === '{') prof++;
    else if (SRC[k] === '}') { prof--; if (prof === 0) return `function ${nombreFn}${firma} ${SRC.slice(j, k + 1)}`; }
  }
  throw new Error('no delimitado: ' + canal);
}
// cuerpo de una función, para preguntas estáticas acotadas
const cuerpo = (firma) => { try { return extraer(firma); } catch (e) { return ''; } };

// ---------------------------------------------------------------------------
// ÁMBITO REAL: la unión de lo que extraen las baterías del Bloque 3 (rekey),
// del Bloque 5 (borrados) y de A2 (restauraciones), más lo propio de C1.
// ---------------------------------------------------------------------------
const BLOQUES = [
  'function rekeyStagingDir()', 'function rekeyJournalPath()', 'function rekeyItemPath(i, suffix)',
  'function removeRekeyStaging()', 'function escribirJsonDurable(ruta, obj)', 'function guardarJournalRekey(journal)',
  'function sha256DeArchivo(p)', 'function leerJournalRekey()', 'function hayAlgunOldEnStaging()',
  'function collectRekeyInventory()', 'function metaUpsert(key, value)', 'function metaDelete(key)',
  'function sentenciasDeSeguridad(mode, items, newFlag, newSalt, newVerifier, remembered)',
  'function estadoFinalDelJournalYaAplicado(j)', 'function estadoItemPorHash(it)',
  'function rekeyAllUserFiles(oldKey, newKey, opts)', 'function recoverInterruptedRekeyIfAny()',
  'function bloqueoDeSeguridad()', 'function encryptIfNeeded(payload, isEncrypted)',
  'function escribirBufferDurable(ruta, buf)', 'function accionesDir()', 'function nuevoActionId()',
  'function journalAccionPath(actionId)', 'function claveMarcaAcciones(writer)', 'function leerMarcaAcciones()',
  'function estadoAccionEnMarca(actionId)', 'function accionYaAplicada(actionId)', 'function sentenciaMarcaAccion(actionId)',
  'function leerJournalAccion(ruta)', 'function journalsDeAcciones()', 'function journalsPropiosPendientes()',
  'function destinoOcupadoPorOtroEquipo(destino)', 'function estadoDestinoAccion(j)',
  'function resolverAccionPendiente(j)', 'function recuperarAccionesPendientes()', 'function ejecutarAccionDeArchivo(opts)',
  // rutas reales (materializan carpeta; las filas de prueba ya traen backup_dir)
  'function ensureProjectBackupDirSlug(row)', 'function backupsDirForProject(row)',
  'function meetingPrepsDirForProject(row)', 'function candidateEvalFileForProject(row)',
  'function candidateEvalCvDirForProject(row)', 'function isSafeCvStoredName(storedName)',
  'function localSafetyBackupsDirForProject(row)', 'function purgeOldLocalSafetyBackups(dir)',
  'function probeWritableDir(dir)',
  // A2: restauraciones y su material
  'function hashDumpLocalStorage(dump)', 'function leerPrevioDemostrable(j)',
  'function clasificarParticionRestauracion(actual, j)', 'async function reponerParticionDesdePrevio(j)',
  'function limpiarMaterialRestauracion(actionId, journal)', 'async function resolverRestauracionPendiente(j)',
  'function rearmarBarrerasDeRestauracion()', 'async function recuperarRestauracionesPendientes()',
  'function saveRescueDump(row, previo)',
  // D1
  'async function deleteProjectById(id)',
  // C1-A: el inventario de arranque
  'function referenciasDeCv(ruta, existe, r)', 'function inventarioDeResiduos()',
  'function registrarInventarioDeResiduos()',
];
BLOQUES.push.apply(BLOQUES, B5.BLOQUES_B5);
const BLOQUES_UNICOS = B5.sinRepetir(BLOQUES);
const HANDLERS = [['candidateEval:removeCv', 'quitarCv']];
const CONSTS = B5.sinRepetir([
  lineaConst("const REKEY_DIR_NAME = '.panorama-rekey';"), lineaConst('const REKEY_JOURNAL_V ='),
  lineaConst('const FSYNC_NO_SOPORTADO_REG'), lineaConst("const ACCIONES_DIR_NAME = '.panorama-acciones';"),
  lineaConst('const ACCIONES_JOURNAL_V ='), lineaConst('const ACCIONES_MARCA_MAX ='), lineaConst('const ACCIONES_TIPOS ='),
  lineaConst('const PREVIO_V ='), lineaConst('const LOCAL_SAFETY_BACKUP_KEEP ='),
  lineaConst('const RESIDUO_TMP_BD ='), lineaConst('const RESIDUO_TMP_ACCION ='),
  lineaConst('const RESIDUO_OLD_ACCION ='), lineaConst('const RESIDUO_ESCRIBIENDO ='),
].concat(B5.CONSTS_B5.map(lineaConst))).join('');

function construirMain(est, op) {
  const o = op || {};
  const src = CONSTS + '\n' +
    'let rekeyInProgress = false;\nlet securityKey = null;\nlet seguridadRequiereRevalidacion = false;\n' +
    'let seguridadEnEstadoInconsistente = null;\nlet procesoComprometido = false;\nlet launcherWin = null;\n' +
    B5.PREAMBULO_B5 +
    BLOQUES_UNICOS.map(extraer).join('\n\n') + '\n' +
    HANDLERS.map(([c, n]) => extraerHandler(c, n)).join('\n\n') + '\n' +
    'return { rekeyAllUserFiles, recoverInterruptedRekeyIfAny, collectRekeyInventory, rekeyStagingDir, rekeyJournalPath,\n' +
    '  ejecutarAccionDeArchivo, resolverAccionPendiente, recuperarAccionesPendientes, journalsDeAcciones, journalAccionPath,\n' +
    '  sentenciaMarcaAccion, accionesDir, sha256DeArchivo, nuevoActionId, ocupacionComun, recursosReservados,\n' +
    '  borradosDir, journalBorradoPath, cuarentenaDe, ejecutarBorrado, recuperarBorradosPendientes, purgarBackupsAntiguos,\n' +
    '  deleteProjectById, rutaBackupsPura, rutaDashboardPura, backupsDirForProject, candidateEvalCvDirForProject,\n' +
    '  localSafetyBackupsDirForProject, purgeOldLocalSafetyBackups, probeWritableDir,\n' +
    '  restauracionesDir, dirDeRestauracion, journalRestauracionPath, previoPath, journalsDeRestauraciones,\n' +
    '  materialDeRestauracionPendiente, rekeyPuedeEmpezar, recuperarRestauracionesPendientes,\n' +
    '  restauracionPendienteDeProyecto, proyectoBloqueadoParaMutar, f1Global, saveRescueDump, quitarCv,\n' +
    '  inventarioDeResiduos, registrarInventarioDeResiduos,\n' +
    '  setKey: (k) => { securityKey = k; }, getKey: () => securityKey };';
  const f = new Function('app', 'fs', 'path', 'crypto', 'dbmod', 'securitymod', 'appLog', 'errorCodeSuffix', 'getMeta',
    'REKEY_BUSY_MESSAGE', 'session', 'cerrarVentanasDeProyecto', 'readLocalStorageDumpFromPartition',
    'writeLocalStorageDumpToPartition', src);
  const log = (s) => { (est.log = est.log || []).push(String(s)); };
  const sesion = o.session || { fromPartition: (p) => ({ clearStorageData: () => { (est.vaciadas = est.vaciadas || []).push(p); return Promise.resolve(); }, flushStorageData: () => Promise.resolve() }) };
  // `fs`, `dbmod` y `securitymod` se pueden sustituir por espías: las funciones
  // siguen siendo las reales de main.js, solo cambia de dónde cuelgan.
  return f(appDoble, o.fs || fs, path, crypto, o.dbmod || dbmod, o.securitymod || securitymod, log,
    (c) => '\n\n(código ' + c + ')',
    (k) => { const r = dbmod.get('SELECT value FROM app_meta WHERE key=?', [k]); return r ? r.value : null; },
    'LA SEGURIDAD SE ESTA ACTUALIZANDO', sesion,
    async (id) => { (est.cerradas = est.cerradas || []).push(id); return { ok: true, cerradas: [], noConfirmadas: [] }; },
    async () => ({}), async () => ({ ok: true }));
}

// ---------------------------------------------------------------------------
let SQL = null;
let nc = 0;
function carpeta(e) { const d = path.join(RAIZ, 'c' + (++nc) + '-' + e); segura(d); fs.mkdirSync(d, { recursive: true }); return d; }
async function montar(dir, o) {
  const op = o || {};
  segura(dir);
  sinInyeccion();
  dbmod._resetParaPruebas();
  DIR_DATOS = dir;
  DIR_APPDATA = path.join(dir, '_appdata');
  fs.mkdirSync(DIR_APPDATA, { recursive: true });
  dbmod.setInstallationId(op.writer || W_A);
  await dbmod.getDb({ crearSiAusente: true });
  const pid = dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('Proyecto C1','c','persist:proj-c1','x','x')");
  dbmod.run('UPDATE projects SET backup_dir=? WHERE id=?', [`${pid}-proyecto-c1`, pid]);
  const fila = dbmod.get('SELECT * FROM projects WHERE id=?', [pid]);
  const dirBk = path.join(dir, 'backups', fila.backup_dir);
  fs.mkdirSync(dirBk, { recursive: true });
  return { pid, fila, dirBk };
}
// Reabrir como el MISMO equipo. Sin setInstallationId, el `.gen` adelantado que
// deja un fallo de escritura se leería como de otro equipo (trampa del arnés,
// no de la app: en producción el installation-id está persistido).
async function reabrir(dir) {
  segura(dir);
  sinInyeccion();
  dbmod._resetParaPruebas();
  DIR_DATOS = dir;
  dbmod.setInstallationId(W_A);
  return dbmod.getDb({ crearSiAusente: true });
}
const W_A = 'a'.repeat(32);
const W_B = 'b'.repeat(32);
const sello = (ms) => new Date(ms).toISOString().replace(/[:.]/g, '-');
const listar = (d) => { try { return fs.readdirSync(d).sort(); } catch (e) { return []; } };
const existe = (p) => fs.existsSync(p);
function arbol(d) {
  const out = [];
  const rec = (x, pre) => { for (const e of listar(x)) { const p = path.join(x, e); if (fs.statSync(p).isDirectory()) rec(p, pre + e + '/'); else out.push(pre + e); } };
  if (existe(d)) rec(d, '');
  return out;
}
// Huella de un árbol: rutas relativas + sha256 de cada archivo.
function arbolConHash(d) {
  const out = [];
  const rec = (x, pre) => {
    for (const e of listar(x)) {
      const p = path.join(x, e);
      if (fs.statSync(p).isDirectory()) { out.push(pre + e + '/'); rec(p, pre + e + '/'); }
      else out.push(pre + e + ':' + crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16));
    }
  };
  if (existe(d)) rec(d, '');
  return out.join('|');
}
function nuevoBackup(dirBk, pid, ms, contenido, conFila) {
  const nombre = `backup_${sello(ms)}_${crypto.randomBytes(4).toString('hex')}.json`;
  fs.writeFileSync(path.join(dirBk, nombre), contenido, 'utf8');
  if (conFila) {
    dbmod.run('INSERT INTO backups(project_id, created_at, reason, payload, size, file_path, encrypted) VALUES (?,?,?,?,?,?,?)',
      [pid, new Date(ms).toISOString(), 'auto', '', Buffer.byteLength(contenido), nombre, 0]);
  }
  return nombre;
}
function journalAccion(M, o) {
  return Object.assign({
    v: 1, action_id: M.nuevoActionId(), writer: W_A, tipo: 'backup',
    base_commit_id: dbmod.getCommitActual(), cifrado: 0, destino: null, modo: 'nuevo',
    original_sha256: null, original_size: 0, new_sha256: null, new_size: 0,
    fase: 'publicando', startedAt: new Date().toISOString(),
  }, o);
}
const shaBuf = (b) => crypto.createHash('sha256').update(b).digest('hex');

// ===========================================================================
(async () => {
  SQL = await initSqlJs({ locateFile: (f) => path.join(PROJ, 'node_modules', 'sql.js', 'dist', f) });
  console.log('C1 — RESIDUOS: inventario y comportamiento actual (descriptiva)');
  console.log('  main.js bajo prueba: ' + RUTA_MAIN);
  ok('C1-0 las funciones reales de main.js se extraen sin reescribirse',
    BLOQUES_UNICOS.every((b) => { try { return extraer(b).length > 20; } catch (e) { return false; } }));

  // =========================================================================
  seccion('C1-H. EL HALLAZGO ORIGINAL, CONTRA EL CÓDIGO DE HOY');
  // =========================================================================
  ok('C1-H1 BACKUP_KEEP sigue siendo 15', /const BACKUP_KEEP = 15;/.test(SRC));
  const PURGA = cuerpo('async function purgarBackupsAntiguos(projectId, dirBackups)');
  ok('C1-H2 la purga se decide SOLO por filas: parte de un SELECT sobre `backups`',
    /SELECT id, file_path FROM backups WHERE project_id=\? ORDER BY created_at DESC/.test(PURGA));
  ok('C1-H3 …y los archivos que retira salen de ESAS filas (`sobran.filter(b => b.file_path)`)',
    /sobran\s*\.filter\(\(b\) => b\.file_path\)/.test(PURGA) && !/readdirSync/.test(PURGA));
  const listados = (COD.match(/readdirSync\([^)]*\)/g) || []);
  nota('llamadas a readdirSync en main.js (sin comentarios): ' + listados.length);
  // Antes de C1-A: "ningún listado recorre la carpeta de backups". Desde C1-A
  // la recorre el inventario — y SOLO para contar. Lo que se custodia ahora es
  // que el inventario no tenga NI UNA operación que modifique nada.
  const INV = cuerpo('function inventarioDeResiduos()') + cuerpo('function referenciasDeCv(ruta, existe, r)') +
    cuerpo('function registrarInventarioDeResiduos()');
  ok('C1-H4 el único recorrido de las carpetas de proyecto es el inventario C1-A, y no modifica nada',
    INV.length > 0 && /readdirSync/.test(INV) &&
    !/unlink|rmSync|rmdir|renameSync|mkdirSync|writeFile|appendFile|copyFile|openSync|utimes|dbmod\.(run|escribirMultiple)|ejecutarBorrado|ejecutarAccionDeArchivo|backupsDirForProject|ensureProjectBackupDirSlug/.test(soloCodigo(INV)) &&
    !listados.some((l) => /backupsDir|dirBk|backups'|rutaBackupsPura|meetingPrepsDir|cvDir/i.test(l)));
  ok('C1-H5 el único barrido `backup_*` que existe es el de la copia de EMERGENCIA local (40 por proyecto)',
    /\.filter\(\(f\) => f\.startsWith\('backup_'\)\)/.test(cuerpo('function purgeOldLocalSafetyBackups(dir)')) &&
    (COD.match(/startsWith\('backup_'\)/g) || []).length === 1);
  ok('C1-H6 el MECANISMO que los producía (archivo antes que fila) ya no existe: backup:save pasa por la acción anclada',
    /const r = ejecutarAccionDeArchivo\(\{\s*tipo: 'backup'/.test(SRC));
  ok('C1-H7 y la purga es UNA operación: cuarentena → un commit → purgar (Bloque 5 / D3)',
    /tipo: 'purgar-backups'/.test(PURGA) && /permitirSinArchivos: true/.test(PURGA));

  // =========================================================================
  seccion('C1-D. LO QUE LOS DOCUMENTOS DICEN QUE HACE LA APP, Y NO HACE');
  // =========================================================================
  // Bloque 4 §9 y Bloque 5 (d) dicen "al arrancar se recorre, se cuenta y se
  // registra". La auditoría lo resume como "El Bloque 5 solo los cuenta y
  // registra". En el código NO hay tal recuento.
  ok('C1-D1 [DOC] el inventario del Bloque 4 promete contar huérfanos al arrancar',
    /HU.RFANOS EXISTENTES .{0,5}SOLO CONTAR/.test(sinTildes(DOC('a3-3-bloque4-inventario.md'))) &&
    /se cuenta y se registra en `app\.log`/.test(DOC('a3-3-bloque4-inventario.md')));
  ok('C1-D2 [DOC] y la auditoría lo da por hecho ("solo los cuenta y registra")',
    /solo los \*\*cuenta y registra\*\*/.test(DOC('auditoria-2026-09-13.md')));
  // INVERTIDAS en C1-A. Antes describían la ausencia del recuento; ahora la
  // discrepancia está corregida y lo que se exige es que el recuento EXISTA.
  ok('C1-D3 [CÓDIGO, desde C1-A] existe la línea agregada de residuos en app.log',
    /'Residuos — inventario del arranque \(solo lectura; no se ha borrado ni movido nada\): '/.test(SRC));
  ok('C1-D4 [CÓDIGO, desde C1-A] el arranque llama al inventario: tras la migración y antes del lanzador',
    (() => {
      const i = COD.indexOf('const loggedIn = await runLoginFlow();');
      const tramo = COD.slice(i, COD.indexOf('createLauncherWindow();', i) + 30);
      return i > 0 && /migrateLegacyInlineBackupsToFiles\(\);\s*registrarInventarioDeResiduos\(\);\s*createLauncherWindow\(\);/.test(tramo);
    })());
  nota('-> DISCREPANCIA DOCUMENTAL CORREGIDA en C1-A: el "contar y registrar" ya existe (ver C1-A1/A2).');

  // =========================================================================
  seccion('C1-S. QUIÉN CREA CADA RESIDUO Y QUIÉN LO LIMPIA (estático)');
  // =========================================================================
  const S = (id, txt, cond, extra) => ok('C1-S' + id + ' ' + txt, cond, extra);
  // --- base de datos -------------------------------------------------------
  S('01', '`.sqlite3.tmp-<writer>-<nonce>`: lo crea escribirAtomico y el rename lo consume',
    /return `\$\{rutaFinal\}\.tmp-\$\{w\}-\$\{marca\}\$\{nonce\}`;/.test(SRC_DB) && /fs\.renameSync\(tmp, rutaFinal\);/.test(SRC_DB));
  S('02', '`.tmp-fallido-`: escritura/fsync incompletos; se CONSERVA para diagnóstico y nadie lo borra',
    /tmp\.replace\('\.tmp-', '\.tmp-fallido-'\)/.test(SRC_DB) && !/unlinkSync|rmSync/.test(COD_DB));
  S('03', '`.tmp-huerfano-`: al abrir, los `.tmp-` sueltos se APARTAN (rename), no se borran',
    /f\.replace\('\.tmp-', '\.tmp-huerfano-'\)/.test(SRC_DB) && /la limpieza destructiva de temporales de la v2\.0\.42 se RETIRA/.test(SRC_DB));
  S('04', '`.gen.interrumpido-` / `.gen.creacion-fallida-` / `.gen.bootstrap-fallido-`: se apartan, nadie los borra',
    /\$\{genFilePath\}\.interrumpido-/.test(SRC_DB) && /\$\{genFilePath\}\.\$\{etiqueta\}-/.test(SRC_DB));
  S('05', 'db.js NO contiene ni un unlink ni un rm: nada de lo anterior desaparece solo', !/unlinkSync|rmSync|rmdirSync/.test(COD_DB));
  // --- acciones ------------------------------------------------------------
  const ACC = cuerpo('function ejecutarAccionDeArchivo(opts)');
  S('06', 'tmp de acción `<destino>.tmp-<writer>-<action>`: F1/F2 lo retiran si fallan antes de publicar',
    /try \{ fs\.unlinkSync\(tmp\); \} catch \(e2\) \{\}/.test(ACC) && /try \{ fs\.unlinkSync\(tmp\); \} catch \(e\) \{\}/.test(ACC));
  S('07', '…pero si el PROCESO muere entre F1 y F2 no hay journal que lo explique: nadie lo resuelve (C1-A solo lo cuenta)',
    /nombres = fs\.readdirSync\(accionesDir\(\)\)\.filter\(\(f\) => \/\\\.json\$\/i\.test\(f\)\)/.test(SRC));
  S('08', '`.old-<action>` y el journal: F5 los limpia; si no, el CASO B del arranque',
    /---- F5: limpiar/.test(ACC) && /try \{ fs\.unlinkSync\(old\); \} catch \(e\) \{\}/.test(ACC));
  S('09', 'journals de acción AJENOS: se ignoran y se cuentan, NUNCA se borran',
    /if \(e\.j\.writer !== yo\) \{ r\.ajenos\+\+; continue; \}/.test(SRC));
  // --- borrados / restauraciones / rekey ------------------------------------
  S('10', '`.panorama-borrados/<id>`: finalizarPurga lo retira; un journal ajeno se deja',
    /fs\.rmSync\(raiz, \{ recursive: true, force: true \}\)/.test(cuerpo('function purgarTodo(j)')) &&
    /if \(e\.j\.writer !== yo\) \{ resultados\.push\(\{ ruta: e\.ruta, ok: true, clase: 'ajeno' \}\); continue; \}/.test(SRC));
  S('11', '`.panorama-restauraciones/<id>` SIN journal: fail-closed, no se borra a ciegas',
    /clase: 'sin-journal'/.test(SRC) && /material de restauraci.n sin registro/.test(sinTildes(SRC)));
  S('12', '`.panorama-rekey` SIN journal: fail-closed (PS-2004), no se borra',
    /return cerrar\('hay una carpeta de trabajo de un cambio de Seguridad sin su registro', null, \{ sinRegistro: true \}\);/.test(cuerpo('function recoverInterruptedRekeyIfAny()')));
  // Desde C1-A el inventario también nombra `.escribiendo-` — para CONTARLO.
  S('13', '`.escribiendo-<pid>-<ts>`: escribirBufferDurable lo retira si falla; tras un corte, nadie (C1-A solo lo cuenta)',
    /const tmp = `\$\{ruta\}\.escribiendo-/.test(SRC) && (COD.match(/escribiendo-/g) || []).length === 2 &&
    /const RESIDUO_ESCRIBIENDO = \/\\\.escribiendo-/.test(COD));
  // --- carpeta de backups ---------------------------------------------------
  S('14', '`rescate-restauracion-*.json`: lo escribe A2 junto a los backups, sin fila; nadie lo retira (C1-A solo lo cuenta)',
    /const nombre = `rescate-restauracion-\$\{/.test(cuerpo('function saveRescueDump(row, previo)')) &&
    (COD.match(/\^rescate-/g) || []).length === 1 && /\^rescate-restauracion-\/i\.test\(e\.name\)\) \{ r\.rescates\+\+; continue; \}/.test(INV));
  S('15', 'CV: `candidateEval:removeCv` es el ÚNICO que borra un CV, y solo si el renderer lo pide',
    (COD.match(/fs\.unlinkSync\(path\.join\(cvDir/g) || []).length === 1);
  // --- sueltos en la raíz de la carpeta de datos ------------------------------
  S('16', '`.panorama-write-check-<pid>`: se borra justo tras escribirse; un corte en medio lo deja para siempre (C1-A solo lo cuenta)',
    /\.panorama-write-check-\$\{process\.pid\}/.test(SRC) &&
    (COD.match(/startsWith\('\.panorama-write-check/g) || []).length === 1 && /r\.sondas\+\+/.test(INV));
  // 18 sept 2026 — INVERTIDA por P18 (orden C de «Aplicar parche», autorizado).
  // Era descriptiva: «si falla la preparación o el lanzamiento del ayudante, el
  // patch-pending NO se retira». El orden C lo retira en TODA rama de fallo
  // anterior a lanzar el ayudante; ahora se exige en las cuatro. La conducta la
  // demuestran p18 (P18-PZ, PA–PD, PE, PF, PG, con el applyAsarPatch real) y la
  // reversión K de p18. Queda solo si el ayudante, ya lanzado, no llega a correr.
  S('17', '`patch-pending-*.asar`: desde el orden C de P18 SÍ se retira en cada fallo anterior a lanzar el ayudante (copia, P18, heredada/ayudante, spawn)',
    (() => {
      const f = cuerpo('async function applyAsarPatch(parentWin)');
      const tramo = (desde, hasta) => { const a = f.indexOf(desde); const b = a < 0 ? -1 : f.indexOf(hasta, a); return a >= 0 && b > a ? f.slice(a, b) : ''; };
      const copia = tramo('originalFs.copyFileSync(chosenPath, stagedAsar);', "errorCodeSuffix('PS-1003')");
      const p18 = tramo('operacion = prepararOperacionAsar(', "errorCodeSuffix('PS-1003')");
      const deshacer = tramo('const deshacerIntento = () => {', '\n  };');
      const heredada = tramo('originalFs.copyFileSync(realAsar, backupAsar);', "errorCodeSuffix('PS-1003')");
      const lanzar = tramo('const child = spawn(', "errorCodeSuffix('PS-1004')");
      return /unlinkSync\(stagedAsar\)/.test(copia) && /unlinkSync\(stagedAsar\)/.test(p18) && /unlinkSync\(stagedAsar\)/.test(deshacer)
        && /deshacerIntento\(\);/.test(heredada) && /deshacerIntento\(\);/.test(lanzar);
    })());
  S('18', '`app.asar.bak-*`: se podan a 2, pero SOLO al aplicar un parche nuevo', /const ASAR_PATCH_BACKUP_KEEP = 2;/.test(SRC) &&
    (COD.match(/purgeOldAsarBackups\(/g) || []).length === 2);
  S('19', '`app.log` / `patch-log.txt`: rotan a 2 MB (un nivel) — no crecen sin límite',
    /const APP_LOG_MAX_BYTES = 2 \* 1024 \* 1024;/.test(SRC) && /const PATCH_LOG_MAX_BYTES = 2 \* 1024 \* 1024;/.test(SRC));
  // --- fuera de la carpeta de datos -----------------------------------------
  S('20', 'copias de EMERGENCIA locales (`%APPDATA%\\panorama-app-safety-backups`): 40 por proyecto',
    /const LOCAL_SAFETY_BACKUP_KEEP = 40;/.test(SRC));
  S('21', '…pero borrar un proyecto NO toca su carpeta de emergencia',
    !/localSafetyBackupsDirForProject|panorama-app-safety-backups/.test(cuerpo('async function deleteProjectById(id)')));
  S('22', 'borrar un proyecto declara DOS recursos: su carpeta de backups y su dashboard horneado',
    /origen: rutaBackupsPura\(row\) \},\s*\{ tipo: 'directorio', scope: 'subtree', origen: rutaDashboardPura\(id\) \}/.test(cuerpo('async function deleteProjectById(id)')));
  S('23', '…y su partición de Electron solo se VACÍA (`clearStorageData`): la carpeta `Partitions/<nombre>` no es un recurso',
    /session\.fromPartition\(j\.particion\)\.clearStorageData\(\)/.test(SRC) &&
    // desde C1-A la carpeta solo se nombra en el inventario, para contarla
    (COD.match(/Partitions/g) || []).length === 1 && /path\.join\(ud, 'Partitions'\)/.test(INV));

  // =========================================================================
  seccion('C1-E1. BACKUP HUÉRFANO REAL (resto de purga) — la purga de hoy NO lo ve');
  // =========================================================================
  {
    const dir = carpeta('E1-huerfano');
    const P = await montar(dir);
    const est = {}; const M = construirMain(est);
    const t0 = Date.parse('2026-08-29T10:00:00Z');
    // 2 huérfanos ANTERIORES a toda fila (lo que dejó la purga vieja) y 1
    // INTERCALADO (fila perdida por otra vía, como los 5 medidos en vivo).
    const hViejo1 = nuevoBackup(P.dirBk, P.pid, t0, '{"estado":"viejo-1"}', false);
    const hViejo2 = nuevoBackup(P.dirBk, P.pid, t0 + 60e3, '{"estado":"viejo-2"}', false);
    const conFila = [];
    for (let i = 0; i < 17; i++) conFila.push(nuevoBackup(P.dirBk, P.pid, t0 + 86400e3 + i * 3600e3, `{"estado":"v${i}"}`, true));
    const hInter = nuevoBackup(P.dirBk, P.pid, t0 + 86400e3 + 5.5 * 3600e3, '{"estado":"intercalado"}', false);
    const antes = listar(P.dirBk).length;
    const r = await M.purgarBackupsAntiguos(P.pid, P.dirBk);
    const despues = listar(P.dirBk);
    nota('purga: ' + JSON.stringify({ ok: r.ok, aplicado: r.aplicado, purgados: r.purgados }));
    ok('C1-E1a la purga funciona: retira las 2 filas que sobran (17 → 15)',
      r.aplicado === true && r.purgados === 2 && dbmod.get('SELECT COUNT(*) c FROM backups WHERE project_id=?', [P.pid]).c === 15);
    ok('C1-E1b …y SUS dos archivos', !despues.includes(conFila[0]) && !despues.includes(conFila[1]));
    ok('C1-E1c los 3 huérfanos (2 anteriores + 1 intercalado) siguen EXACTAMENTE igual',
      despues.includes(hViejo1) && despues.includes(hViejo2) && despues.includes(hInter) &&
      fs.readFileSync(path.join(P.dirBk, hInter), 'utf8') === '{"estado":"intercalado"}');
    ok('C1-E1d en disco quedan 15 con fila + 3 sin fila', despues.length === 18 && antes === 20, `${antes} -> ${despues.length}`);
    ok('C1-E1e cero cuarentena y cero journal tras la purga', listar(M.borradosDir()).length === 0, JSON.stringify(listar(M.borradosDir())));
    // repetir no cambia nada: el huérfano es PERMANENTE
    for (let k = 0; k < 3; k++) {
      nuevoBackup(P.dirBk, P.pid, Date.parse('2026-09-10T00:00:00Z') + k * 60e3, `{"estado":"n${k}"}`, true);
      await M.purgarBackupsAntiguos(P.pid, P.dirBk);
    }
    const tras = listar(P.dirBk);
    ok('C1-E1f tres guardados+purgas más tarde, los huérfanos siguen ahí: se ACUMULAN',
      tras.includes(hViejo1) && tras.includes(hViejo2) && tras.includes(hInter) && tras.length === 18, String(tras.length));
    ok('C1-E1g backup:list NO los enseña (solo lista filas): la app no puede restaurarlos',
      /SELECT id, created_at, reason, size, encrypted FROM backups WHERE project_id=\?/.test(extraerHandlerSeguro('backup:list')));
  }

  // =========================================================================
  seccion('C1-E2. FILA SIN ARCHIVO');
  // =========================================================================
  {
    const dir = carpeta('E2-fila-sin-archivo');
    const P = await montar(dir);
    const est = {}; const M = construirMain(est);
    const t0 = Date.parse('2026-09-01T10:00:00Z');
    const nombres = [];
    for (let i = 0; i < 15; i++) nombres.push(nuevoBackup(P.dirBk, P.pid, t0 + i * 3600e3, `{"v":${i}}`, true));
    fs.unlinkSync(path.join(P.dirBk, nombres[14]));   // la MÁS RECIENTE pierde su archivo
    fs.unlinkSync(path.join(P.dirBk, nombres[0]));    // y la MÁS VIEJA también
    ok('C1-E2a dentro del cupo, la fila sin archivo se queda (y backup:list la seguiría mostrando)',
      dbmod.get('SELECT COUNT(*) c FROM backups WHERE file_path=?', [nombres[14]]).c === 1);
    nuevoBackup(P.dirBk, P.pid, t0 + 20 * 3600e3, '{"v":"nuevo"}', true);
    const r = await M.purgarBackupsAntiguos(P.pid, P.dirBk);
    ok('C1-E2b cuando la fila sin archivo cae FUERA del cupo, la purga la retira igual (permitirSinArchivos)',
      r.aplicado === true && r.purgados === 1 && dbmod.get('SELECT COUNT(*) c FROM backups WHERE file_path=?', [nombres[0]]).c === 0,
      JSON.stringify(r));
    ok('C1-E2c la que está DENTRO del cupo sigue con fila y sin archivo', dbmod.get('SELECT COUNT(*) c FROM backups WHERE file_path=?', [nombres[14]]).c === 1 &&
      !existe(path.join(P.dirBk, nombres[14])));
    ok('C1-E2d un cambio de Seguridad la TOLERA: la cuenta como "sin archivo" y sigue',
      /it\.missing = true;\s*missing\+\+;\s*continue;/.test(cuerpo('function rekeyAllUserFiles(oldKey, newKey, opts)')));
    nota('-> se limpia SOLA, pero solo cuando envejece fuera del cupo de 15.');
  }

  // =========================================================================
  seccion('C1-E3. `.tmp-fallido` RECUPERABLE (fsync falla con la imagen ya escrita)');
  // =========================================================================
  {
    const dir = carpeta('E3-tmp-fallido');
    await montar(dir);
    dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('Bueno','c','persist:b','x','x')");
    const commitBueno = dbmod._diagnostico().cMem;
    inyectar('fsync', (p) => p.includes('panorama.sqlite3.tmp-'));
    let err = null;
    try { dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('SOLO-EN-EL-TMP','c','persist:t','x','x')"); }
    catch (e) { err = e; }
    sinInyeccion();
    const fallidos = listar(dir).filter((f) => f.includes('.tmp-fallido-'));
    ok('C1-E3a la escritura se declara NO aplicada', !!err && err.aplicado === false, err ? String(err.message).slice(0, 80) : '(no lanzó)');
    ok('C1-E3b queda UN `.tmp-fallido-`', fallidos.length === 1, JSON.stringify(listar(dir)));
    let abre = null;
    try {
      const d = new SQL.Database(fs.readFileSync(path.join(dir, fallidos[0])));
      const ic = d.exec('PRAGMA integrity_check')[0].values[0][0];
      const fila = d.exec("SELECT COUNT(*) FROM projects WHERE name='SOLO-EN-EL-TMP'")[0].values[0][0];
      const c = d.exec("SELECT value FROM app_meta WHERE key='db_commit_id'")[0].values[0][0];
      d.close();
      abre = { ic, fila, commit: c };
    } catch (e) { abre = { error: String(e.message) }; }
    nota('contenido del fallido: ' + JSON.stringify(abre));
    ok('C1-E3c ESE fallido es una base de datos ÍNTEGRA con el cambio que no llegó a confirmarse',
      abre && abre.ic === 'ok' && abre.fila === 1 && abre.commit !== commitBueno);
    ok('C1-E3d el .sqlite3 bueno no lo tiene', (() => { const d = new SQL.Database(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))); const n = d.exec("SELECT COUNT(*) FROM projects WHERE name='SOLO-EN-EL-TMP'")[0].values[0][0]; d.close(); return n === 0; })());
    // reabrir: el fallido NO se toca
    const huella = shaBuf(fs.readFileSync(path.join(dir, fallidos[0])));
    await reabrir(dir);
    ok('C1-E3e al reabrir, el fallido NO se aparta ni se borra (queda byte a byte)',
      existe(path.join(dir, fallidos[0])) && shaBuf(fs.readFileSync(path.join(dir, fallidos[0]))) === huella);
    nota('-> Un `.tmp-fallido-` puede contener la ÚNICA copia de un cambio que el usuario vio fallar.');
    nota('   Borrarlo "porque falló" sería perder evidencia. Clase A/C, nunca B.');
  }

  // =========================================================================
  seccion('C1-E4. `.tmp` DE LA BD: el completo (rename perdido) y el claramente muerto');
  // =========================================================================
  {
    const dir = carpeta('E4-tmp');
    await montar(dir);
    dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('B','c','persist:b','x','x')");
    inyectar('rename', (p) => p.endsWith('panorama.sqlite3'));
    let err = null;
    try { dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('RENAME-PERDIDO','c','persist:r','x','x')"); }
    catch (e) { err = e; }
    sinInyeccion();
    const completos = listar(dir).filter((f) => /^panorama\.sqlite3\.tmp-(?!fallido|huerfano)/.test(f));
    ok('C1-E4a con el rename perdido queda un `.tmp-` COMPLETO (no marcado)', !!err && completos.length === 1, JSON.stringify(listar(dir)));
    // y uno claramente muerto: truncado, plantado a mano (corte de luz)
    const muerto = 'panorama.sqlite3.tmp-' + W_A.slice(0, 16) + '-deadbeefdeadbeef';
    fs.writeFileSync(path.join(dir, muerto), Buffer.from('SQLite format 3\0 TRUNCADO'));
    await reabrir(dir);
    const trasAbrir = listar(dir);
    const huerf = trasAbrir.filter((f) => f.includes('.tmp-huerfano-'));
    ok('C1-E4b al reabrir, LOS DOS se apartan como `.tmp-huerfano-` (ninguno se borra)',
      huerf.length === 2 && !trasAbrir.includes(muerto) && !trasAbrir.includes(completos[0]), JSON.stringify(trasAbrir));
    const clas = huerf.map((f) => { try { const d = new SQL.Database(fs.readFileSync(path.join(dir, f))); d.exec('SELECT COUNT(*) FROM sqlite_master'); d.close(); return 'abre'; } catch (e) { return 'no-abre'; } });
    ok('C1-E4c la app NO distingue el útil del muerto: los aparta igual', clas.includes('abre') && clas.includes('no-abre'), JSON.stringify(clas));
    await reabrir(dir);
    ok('C1-E4d un segundo arranque no hace nada más: se ACUMULAN', listar(dir).filter((f) => f.includes('.tmp-huerfano-')).length === 2);
    nota('-> "Claramente muerto" solo se puede DEMOSTRAR abriéndolo: el nombre no lo dice.');
  }

  // =========================================================================
  seccion('C1-E5. TMP DE ACCIÓN SIN JOURNAL (corte entre F1 y F2) y JOURNAL PENDIENTE');
  // =========================================================================
  {
    const dir = carpeta('E5-accion');
    const P = await montar(dir);
    const est = {}; const M = construirMain(est);
    // a) tmp sin journal: el proceso murió tras preparar el archivo
    const destino = path.join(P.dirBk, 'backup_2026-09-15T10-00-00-000Z_cafecafe.json');
    const idHuerf = M.nuevoActionId();
    const tmpSinJ = `${destino}.tmp-${W_A}-${idHuerf}`;
    fs.writeFileSync(tmpSinJ, '{"estado":"lo que se estaba guardando"}', 'utf8');
    const rec1 = M.recuperarAccionesPendientes();
    ok('C1-E5a la recuperación del arranque no lo ve: 0 resueltas, 0 fallos', rec1.resueltas.length === 0 && rec1.fallosCerrados.length === 0, JSON.stringify(rec1));
    ok('C1-E5b el tmp sigue ahí tras la recuperación', existe(tmpSinJ));
    const g = M.ejecutarAccionDeArchivo({ tipo: 'backup', destino: path.join(P.dirBk, 'backup_2026-09-15T11-00-00-000Z_beefbeef.json'), contenidoPlano: '{"x":1}', modo: 'nuevo', sentencias: () => [] });
    ok('C1-E5c y NO bloquea: la siguiente acción se aplica con normalidad', g.ok === true && g.verificado === true, JSON.stringify(g));
    ok('C1-E5d tras esa acción el tmp huérfano SIGUE ahí: nadie lo recogerá', existe(tmpSinJ));
    ok('C1-E5e [clase] Evaluación de Candidatos NO usa localStorage: su única persistencia es estado.json',
      /nada de localStorage: los datos viven en la carpeta de/.test(SRC_EVAL) && !/localStorage\.setItem/.test(soloCodigo(SRC_EVAL)));
    nota('-> Si el proceso murió en F1 de un candidate-eval, ese tmp puede ser lo ÚNICO que queda');
    nota('   de los últimos cambios del usuario. No es "basura demostrable" por su nombre.');

    // b) journal PENDIENTE propio: se resuelve solo (CASO A)
    const j = journalAccion(M, {});
    j.destino = path.join(P.dirBk, 'backup_2026-09-15T12-00-00-000Z_0badf00d.json');
    const contenido = Buffer.from('{"estado":"a medio publicar"}', 'utf8');
    j.new_sha256 = shaBuf(contenido); j.new_size = contenido.length;
    fs.mkdirSync(M.accionesDir(), { recursive: true });
    fs.writeFileSync(`${j.destino}.tmp-${W_A}-${j.action_id}`, contenido);
    fs.writeFileSync(M.journalAccionPath(j.action_id), JSON.stringify(j), 'utf8');
    const rec2 = M.recuperarAccionesPendientes();
    ok('C1-E5f journal propio pendiente (sin marca): CASO A, se deshace SOLO',
      rec2.resueltas.length === 1 && rec2.resueltas[0].caso === 'A', JSON.stringify(rec2));
    ok('C1-E5g …y no deja ni tmp ni journal', !existe(`${j.destino}.tmp-${W_A}-${j.action_id}`) && !existe(M.journalAccionPath(j.action_id)));

    // c) journal AJENO pendiente: se ignora… para siempre
    const ja = journalAccion(M, { writer: W_B, tipo: 'candidate-eval', modo: 'overwrite' });
    const estado = path.join(dir, 'backups', P.fila.backup_dir, 'evaluacion-candidatos', 'estado.json');
    fs.mkdirSync(path.dirname(estado), { recursive: true });
    fs.writeFileSync(estado, '{"puestos":[],"evaluaciones":[]}', 'utf8');
    ja.destino = estado; ja.original_sha256 = shaBuf(fs.readFileSync(estado)); ja.original_size = fs.statSync(estado).size;
    ja.new_sha256 = 'c'.repeat(64); ja.new_size = 10;
    fs.writeFileSync(M.journalAccionPath(ja.action_id), JSON.stringify(ja), 'utf8');
    const rec3 = M.recuperarAccionesPendientes();
    ok('C1-E5h journal AJENO: se cuenta, no se toca', rec3.ajenos === 1 && existe(M.journalAccionPath(ja.action_id)), JSON.stringify(rec3));
    const oc = M.ocupacionComun(estado);
    ok('C1-E5i …y mientras exista, ese destino queda OCUPADO para este equipo', oc.ocupado === true && oc.porWriter === W_B, JSON.stringify(oc));
    nota('-> Si el otro equipo no vuelve nunca, su journal bloquea ESE archivo para siempre.');
    nota('   No es basura: es la única prueba de lo que el otro equipo dejó a medias.');

    // d) un journal que no se puede leer indetermina TODO el dominio
    const roto = path.join(M.accionesDir(), 'ffffffffffffffffffffffffffffffff.json');
    fs.writeFileSync(roto, '{"v":1,"action_id":', 'utf8');
    const oc2 = M.ocupacionComun(path.join(P.dirBk, 'backup_cualquiera.json'));
    ok('C1-E5j un journal ilegible deja CUALQUIER destino indeterminado (ninguna acción empieza)',
      oc2.ocupado === true && oc2.indeterminado === true, JSON.stringify(oc2));
    fs.unlinkSync(roto);
  }

  // =========================================================================
  seccion('C1-E6. JOURNAL RESUELTO QUE NO SE PUDO BORRAR (acción ya aplicada)');
  // =========================================================================
  {
    const dir = carpeta('E6-resuelto');
    const P = await montar(dir);
    const est = {}; const M = construirMain(est);
    const destino = path.join(P.dirBk, 'evaluacion-candidatos', 'estado.json');
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, '{"v":"viejo"}', 'utf8');
    // el journal no se podrá borrar en F5
    inyectar('unlink', (p) => p.includes('.panorama-acciones'));
    const r = M.ejecutarAccionDeArchivo({ tipo: 'candidate-eval', destino, contenidoPlano: '{"v":"nuevo"}', modo: 'overwrite', sentencias: () => [] });
    sinInyeccion();
    const jn = listar(M.accionesDir());
    ok('C1-E6a la acción se aplica y verifica aunque su journal no se pueda borrar', r.ok === true && r.verificado === true, JSON.stringify(r));
    ok('C1-E6b queda el journal resuelto (y B3 deja rastro en app.log)',
      jn.length === 1 && (est.log || []).some((l) => /no se pudo borrar el registro de una acci.n de archivo ya resuelto/.test(sinTildes(l))),
      JSON.stringify({ jn, log: est.log }));
    const rec = M.recuperarAccionesPendientes();
    ok('C1-E6c el arranque siguiente lo reconoce APLICADO (CASO B) y lo retira', rec.resueltas.length === 1 && rec.resueltas[0].caso === 'B' && listar(M.accionesDir()).length === 0,
      JSON.stringify(rec));
    ok('C1-E6d el destino queda con el contenido nuevo', fs.readFileSync(destino, 'utf8') === '{"v":"nuevo"}');
    nota('-> Se limpia SOLO. Mientras tanto F-1 lo resolvería antes de la siguiente acción.');

    // borrado aplicado cuya purga quedó a medias: también se limpia solo
    const bk = nuevoBackup(P.dirBk, P.pid, Date.parse('2026-09-01T00:00:00Z'), '{"b":1}', true);
    const idB = dbmod.get('SELECT id FROM backups WHERE file_path=?', [bk]).id;
    inyectar('unlink', () => false);
    const rmOrig = fs.rmSync;
    let rmFallos = 0;
    fs.rmSync = function (p, o) { if (enSandbox(p) && String(p).includes('.panorama-borrados') && rmFallos < 1) { rmFallos++; const e = new Error('EBUSY: rm INYECTADO (C1)'); e.code = 'EBUSY'; throw e; } return rmOrig.call(fs, p, o); };
    const rb = await M.ejecutarBorrado({ tipo: 'purgar-backups', recursos: [{ tipo: 'archivo', scope: 'archivo', origen: path.join(P.dirBk, bk) }], permitirSinArchivos: true, sentencias: () => [{ sql: 'DELETE FROM backups WHERE id=?', params: [idB] }] });
    fs.rmSync = rmOrig;
    sinInyeccion();
    ok('C1-E6e un borrado aplicado con la purga fallida deja cuarentena + journal', rb.aplicado === true && rb.purga && rb.purga.ok === false &&
      listar(M.borradosDir()).length === 2, JSON.stringify({ rb, bor: listar(M.borradosDir()) }));
    const rbr = await M.recuperarBorradosPendientes();
    ok('C1-E6f el arranque siguiente termina la purga y no queda nada', rbr.ok === true && listar(M.borradosDir()).length === 0, JSON.stringify(rbr));
  }

  // =========================================================================
  seccion('C1-E7. PROYECTO BORRADO: QUÉ SE VA Y QUÉ SE QUEDA');
  // =========================================================================
  {
    const dir = carpeta('E7-proyecto');
    const P = await montar(dir);
    const est = {}; const M = construirMain(est);
    // material del proyecto
    nuevoBackup(P.dirBk, P.pid, Date.parse('2026-09-01T00:00:00Z'), '{"b":1}', true);
    fs.mkdirSync(path.join(P.dirBk, 'evaluacion-candidatos', 'cv'), { recursive: true });
    fs.writeFileSync(path.join(P.dirBk, 'evaluacion-candidatos', 'cv', 'e1__1_aaaa.pdf'), 'CV', 'utf8');
    fs.writeFileSync(path.join(P.dirBk, 'rescate-restauracion-2026-09-01T00-00-00-000Z.json'), '{}', 'utf8');
    const dash = M.rutaDashboardPura(P.pid);
    fs.mkdirSync(dash, { recursive: true }); fs.writeFileSync(path.join(dash, 'dashboard.html'), '<html>', 'utf8');
    // lo que Electron deja por su cuenta en la carpeta de datos
    const part = path.join(dir, 'Partitions', 'proj-c1');
    for (const sub of ['Cache/Cache_Data', 'Code Cache/js', 'GPUCache', 'Local Storage/leveldb', 'Session Storage']) {
      fs.mkdirSync(path.join(part, sub), { recursive: true });
      fs.writeFileSync(path.join(part, sub, 'f_000001'), 'x'.repeat(64), 'utf8');
    }
    // y la copia de emergencia LOCAL (fuera de la carpeta de datos)
    const seg = M.localSafetyBackupsDirForProject(P.fila);
    fs.writeFileSync(path.join(seg, 'backup_2026-09-01T00-00-00-000Z_11111111.json'), '{}', 'utf8');
    const r = await M.deleteProjectById(P.pid);
    nota('borrado: ' + JSON.stringify({ aplicado: r.aplicado, verificado: r.verificado }));
    ok('C1-E7a el proyecto se borra (aplicado y verificado)', r.aplicado === true && r.verificado === true, JSON.stringify(r));
    ok('C1-E7b sus 4 tablas quedan vacías: hoy no pueden quedar filas huérfanas',
      ['backups', 'meeting_preps', 'candidate_evals'].every((t) => dbmod.get(`SELECT COUNT(*) c FROM ${t} WHERE project_id=?`, [P.pid]).c === 0) &&
      !dbmod.get('SELECT id FROM projects WHERE id=?', [P.pid]));
    ok('C1-E7c su carpeta de backups desaparece entera (CV y rescate incluidos)', !existe(P.dirBk));
    ok('C1-E7d su dashboard horneado desaparece', !existe(dash));
    ok('C1-E7e la partición se manda VACIAR (una vez)', (est.vaciadas || []).length === 1 && est.vaciadas[0] === 'persist:proj-c1', JSON.stringify(est.vaciadas));
    ok('C1-E7f …pero la carpeta `Partitions/proj-c1` NO la toca el protocolo: sigue con sus 5 subcarpetas',
      existe(part) && arbol(part).length === 5, JSON.stringify(arbol(part)));
    ok('C1-E7g la copia de EMERGENCIA local del proyecto borrado sigue ahí', listar(seg).length === 1);
    ok('C1-E7h cero cuarentena y cero journal', listar(M.borradosDir()).length === 0);
    nota('-> Qué hace `clearStorageData()` con Cache/Code Cache/GPUCache NO se puede medir aquí:');
    nota('   hace falta Electron real (ver real-run/c1-particion.js).');
  }

  // =========================================================================
  seccion('C1-E8. CV HUÉRFANO — mecanismos (del-eval e importar, cerrados en C1-A)');
  // =========================================================================
  {
    const ramaDel = SRC_EVAL.slice(SRC_EVAL.indexOf("if (action === 'del-eval') {"), SRC_EVAL.indexOf("} else if (action === 'export-eval') {"));
    ok('C1-E8a "Eliminar evaluación" quita la evaluación del estado y guarda…',
      /state\.evaluaciones = state\.evaluaciones\.filter\(x => x\.id !== t\.dataset\.id\);[\s\S]{0,120}await saveState\(true\);/.test(ramaDel));
    // INVERTIDA en C1-A: antes el CV se quedaba siempre. Lo ejecutado está en C1-A6.
    ok('C1-E8b [desde C1-A] …y retira su CV, pero SOLO tras aplicado:true + verificado:true',
      ramaDel.length > 0 && /if \(g\.verificado === false\) return;\s*if \(cv && !cvReferenciado\(cv\)\) window\.panoramaBridge\.removeCandidateCv\(cv\)/.test(ramaDel));
    const ramaImp = SRC_EVAL.slice(SRC_EVAL.indexOf("document.getElementById('fileImport')"), SRC_EVAL.indexOf('reader.readAsText(file);'));
    ok('C1-E8c [desde C1-A] "Importar" retira los CV que el estado importado ya no referencia, con la misma garantía',
      /state = parsed;/.test(ramaImp) && /if \(g\.verificado === false\) return;[\s\S]{0,80}if \(!cvReferenciado\(cv\)\) window\.panoramaBridge\.removeCandidateCv\(cv\)/.test(ramaImp));
    ok('C1-E8d "Eliminar puesto" deja las evaluaciones (y sus CV) sin tocar', /ev\.puestoId = ''; ev\.notas = \{\};/.test(SRC_EVAL));
    ok('C1-E8e cambiar CV con `verificado:false` conserva LOS DOS a propósito', /Aplicado sin verificar: QUEDAN LOS DOS/.test(SRC_EVAL));
    ok('C1-E8f quitar CV con `verificado:false` conserva el archivo a propósito ("mejor un huérfano que una pérdida")',
      /Se prefiere un hu.rfano a una p.rdida/.test(sinTildes(SRC_EVAL)));
    ok('C1-E8g los CV NO se cifran nunca (limitación conocida): un huérfano es un documento personal en claro',
      /el CV en s.\s*(\/\/\s*)?NUNCA se cifra/.test(sinTildes(SRC)));
    // ejecutado: el borrado físico falla → ok:true y huérfano con rastro
    const dir = carpeta('E8-cv');
    const P = await montar(dir);
    const est = {}; const M = construirMain(est);
    const cvDir = M.candidateEvalCvDirForProject(P.fila);
    const nombre = 'e1__1700000000000_0123456789abcdef.pdf';
    fs.writeFileSync(path.join(cvDir, nombre), 'CV PERSONAL', 'utf8');
    inyectar('unlink', (p) => p.endsWith(nombre));
    const warnOrig = console.warn;
    console.warn = () => {};   // el console.warn del handler es esperado: no ensucia la salida
    const r = M.quitarCv({}, { projectId: P.pid, storedName: nombre });
    console.warn = warnOrig;
    sinInyeccion();
    ok('C1-E8h si el borrado físico falla, removeCv devuelve ok:true igualmente', r && r.ok === true, JSON.stringify(r));
    ok('C1-E8i el CV sigue en disco y queda UNA línea en app.log (B3)',
      existe(path.join(cvDir, nombre)) && (est.log || []).filter((l) => /queda hu.rfano en disco/.test(sinTildes(l))).length === 1, JSON.stringify(est.log));
    ok('C1-E8j para saber si un CV está referenciado hay que LEER estado.json, que va CIFRADO si la Seguridad está activa',
      /if \(metaRow\.encrypted\) \{/.test(cuerpo('function leerCandidateEvalPayload(row, ctx)')));
    nota('-> Clasificar un CV como huérfano exige la clave de la sesión. Sin ella: D (no decidible).');
  }

  // =========================================================================
  seccion('C1-E9. RESTOS DE REKEY Y DE RESTAURACIÓN');
  // =========================================================================
  {
    // --- a) `.panorama-rekey` sin journal, incluso VACÍA --------------------
    const dir = carpeta('E9-rekey');
    const P = await montar(dir);
    const est = {}; const M = construirMain(est);
    fs.mkdirSync(M.rekeyStagingDir(), { recursive: true });
    const rec = M.recoverInterruptedRekeyIfAny();
    ok('C1-E9a `.panorama-rekey` VACÍA y sin registro → el arranque se cierra (PS-2004)',
      rec && rec.fallaCerrado === true && /sin su registro/.test(rec.motivo), JSON.stringify(rec));
    const key = securitymod.deriveKey('clave-c1', 'ab'.repeat(16));
    const rr = M.rekeyAllUserFiles(null, key, { mode: 'setup', newSalt: 'ab'.repeat(16), newVerifier: securitymod.verifierFor(key) });
    nota('rekey con esa carpeta presente: ' + String(rr.error).replace(/\n+/g, ' / ').slice(0, 260));
    ok('C1-E9b un cambio de Seguridad con esa carpeta presente se niega sin tocar nada', rr.ok === false && existe(M.rekeyStagingDir()));
    // INVERTIDA en C1-A: el diagnóstico demostró que aquí se prometía "al
    // arrancar se resuelve sola". Ahora se exige que diga lo que pasa de verdad.
    ok('C1-E9c [desde C1-A] …y ya NO promete que "al arrancar se resuelve sola": avisa del PS-2004',
      /Ha quedado material de un cambio de Seguridad anterior sin recoger/.test(String(rr.error)) &&
      !/se resuelve sol[ao]/.test(String(rr.error)) && /se detendr. con el aviso PS-2004/.test(String(rr.error)),
      String(rr.error).slice(0, 200));
    ok('C1-E9d …que es lo que de verdad hace el arranque con esa misma carpeta: se cierra (C1-E9a)',
      rec.fallaCerrado === true && existe(M.rekeyStagingDir()));
    nota('-> Antes de C1-A el mensaje prometía una recuperación que el arranque no hace. Ya no (C1-A9).');
    fs.rmSync(M.rekeyStagingDir(), { recursive: true, force: true });

    // --- b) cambio de contraseña y archivos SIN fila ------------------------
    const salt1 = '11'.repeat(16), salt2 = '22'.repeat(16);
    const k1 = securitymod.deriveKey('clave-uno', salt1), k2 = securitymod.deriveKey('clave-dos', salt2);
    // estado inicial SIN seguridad: un backup con fila y un huérfano, en claro
    const conFila = nuevoBackup(P.dirBk, P.pid, Date.parse('2026-09-10T00:00:00Z'), '{"con":"fila"}', true);
    const huerf = nuevoBackup(P.dirBk, P.pid, Date.parse('2026-08-29T00:00:00Z'), '{"sin":"fila","dato":"PERSONAL"}', false);
    const M2 = construirMain({});
    const rs = M2.rekeyAllUserFiles(null, k1, { mode: 'setup', newSalt: salt1, newVerifier: securitymod.verifierFor(k1) });
    ok('C1-E9e activar la Seguridad funciona', rs.ok === true, JSON.stringify(rs));
    const txtFila = fs.readFileSync(path.join(P.dirBk, conFila), 'utf8');
    const txtHuerf = fs.readFileSync(path.join(P.dirBk, huerf), 'utf8');
    ok('C1-E9f el backup CON fila queda cifrado', securitymod.looksEncrypted(txtFila) && securitymod.decryptString(k1, txtFila) === '{"con":"fila"}');
    ok('C1-E9g el HUÉRFANO se queda EN CLARO: activar la Seguridad no lo ve', txtHuerf === '{"sin":"fila","dato":"PERSONAL"}');
    // rescate de restauración escrito con la clave 1 (código real)
    M2.setKey(k1);
    const rescate = M2.saveRescueDump(P.fila, { clave: 'estado anterior' });
    ok('C1-E9h un rescate de restauración se escribe cifrado con la clave vigente', !!rescate && securitymod.decryptString(k1, fs.readFileSync(rescate, 'utf8')).includes('estado anterior'));
    // cambio de contraseña
    const huerfCifrado = nuevoBackup(P.dirBk, P.pid, Date.parse('2026-08-30T00:00:00Z'), securitymod.encryptString(k1, '{"sin":"fila","cifrado":"k1"}'), false);
    const rc = M2.rekeyAllUserFiles(k1, k2, { mode: 'change', newSalt: salt2, newVerifier: securitymod.verifierFor(k2) });
    ok('C1-E9i cambiar la contraseña funciona', rc.ok === true, JSON.stringify(rc));
    const descifra = (f, k) => { try { securitymod.decryptString(k, fs.readFileSync(f, 'utf8')); return true; } catch (e) { return false; } };
    ok('C1-E9j el backup CON fila pasa a la clave nueva', descifra(path.join(P.dirBk, conFila), k2) && !descifra(path.join(P.dirBk, conFila), k1));
    ok('C1-E9k el huérfano cifrado SIGUE con la clave VIEJA: con la nueva ya no se abre',
      descifra(path.join(P.dirBk, huerfCifrado), k1) && !descifra(path.join(P.dirBk, huerfCifrado), k2));
    ok('C1-E9l el rescate de restauración, igual: la clave nueva no lo abre', descifra(rescate, k1) && !descifra(rescate, k2));
    nota('-> Tras cada cambio de contraseña, los archivos sin fila se vuelven ILEGIBLES para la app.');
    nota('   Y tras activar la Seguridad, los huérfanos siguen EN CLARO en la carpeta sincronizada.');

    // --- c) `.panorama-restauraciones/<id>` sin journal --------------------
    const dirR = carpeta('E9-restauracion');
    const PR = await montar(dirR);
    const MR = construirMain({});
    const idR = MR.nuevoActionId();
    fs.mkdirSync(MR.dirDeRestauracion(idR), { recursive: true });   // corte entre mkdir y journal
    const rrV = await MR.recuperarRestauracionesPendientes();
    ok('C1-E9m carpeta de restauración VACÍA y sin journal → el arranque se cierra (PS-2006)',
      rrV.ok === false && rrV.malos[0].clase === 'material-sin-journal', JSON.stringify(rrV.malos));
    const bl = MR.proyectoBloqueadoParaMutar(PR.pid);
    ok('C1-E9n …y en caliente CUALQUIER proyecto queda sin poder guardar', !!bl && bl.motivo === 'restauracion-no-verificable', JSON.stringify(bl));
    const puede = MR.rekeyPuedeEmpezar();
    ok('C1-E9o …mientras que el rekey la considera "sin material" (vacía) y sí puede empezar', puede.puede === true, JSON.stringify(puede));
    fs.writeFileSync(path.join(MR.dirDeRestauracion(idR), 'previo.enc.escribiendo-1-2'), 'a medias', 'utf8');
    const puede2 = MR.rekeyPuedeEmpezar();
    ok('C1-E9p con un `.escribiendo-` dentro, el rekey ya NO puede empezar', puede2.puede === false && puede2.clase === 'material-pendiente', JSON.stringify(puede2));
    const idR2 = MR.nuevoActionId();
    fs.mkdirSync(MR.dirDeRestauracion(idR2), { recursive: true });
    fs.writeFileSync(MR.previoPath(idR2), '{"foto":"previa"}', 'utf8');
    const rr2 = await MR.recuperarRestauracionesPendientes();
    ok('C1-E9q con `previo.enc` y sin journal, tampoco se resuelve: se conserva todo', rr2.ok === false && existe(MR.previoPath(idR2)));
    nota('-> Estos restos solo se producen por un corte en una ventana de milisegundos, pero cuando');
    nota('   se producen la app NO ARRANCA hasta que alguien los retira a mano.');
    nota('   En una carpeta de Drive, "vacía" tampoco demuestra nada: puede no haber sincronizado aún.');
  }

  // =========================================================================
  seccion('C1-E10. SUELTOS EN LA RAÍZ Y FUERA DE LA CARPETA DE DATOS');
  // =========================================================================
  {
    const dir = carpeta('E10-sueltos');
    await montar(dir);
    const M = construirMain({});
    const antes = listar(dir);
    ok('C1-E10a la sonda de escritura se retira sola cuando todo va bien', M.probeWritableDir(dir) === null && listar(dir).join() === antes.join());
    inyectar('unlink', (p) => p.includes('.panorama-write-check-'));
    const r = M.probeWritableDir(dir);
    sinInyeccion();
    const sondas = listar(dir).filter((f) => f.startsWith('.panorama-write-check-'));
    ok('C1-E10b si el unlink falla, la sonda se queda y la carpeta se declara NO escribible', typeof r === 'string' && sondas.length === 1, JSON.stringify({ r, sondas }));
    ok('C1-E10c su nombre lleva el PID: un arranque posterior con OTRO pid no la reconoce ni la retira', sondas[0] === `.panorama-write-check-${process.pid}`);
    // copias de emergencia: poda por mtime, 40
    const seg = M.localSafetyBackupsDirForProject({ id: 99, name: 'x', backup_dir: '99-x' });
    for (let i = 0; i < 43; i++) {
      const f = path.join(seg, `backup_${String(i).padStart(3, '0')}.json`);
      fs.writeFileSync(f, '{}', 'utf8');
      fs.utimesSync(f, new Date(1700000000000 + i * 1000), new Date(1700000000000 + i * 1000));
    }
    fs.writeFileSync(path.join(seg, 'desktop.ini'), '[x]', 'utf8');
    M.purgeOldLocalSafetyBackups(seg);
    const quedan = listar(seg);
    ok('C1-E10d las copias de emergencia se podan a 40 (las más viejas por mtime)', quedan.filter((f) => f.startsWith('backup_')).length === 40 && !quedan.includes('backup_000.json'));
    ok('C1-E10e y la poda NO toca lo que no empieza por `backup_` (un desktop.ini ajeno sigue)', quedan.includes('desktop.ini'));
  }

  // =========================================================================
  seccion('C1-A. EXIGENCIAS DE C1-A: OBSERVAR SIN TOCAR Y CORTAR FUENTES ACTIVAS');
  // =========================================================================
  // Un sandbox con UNA muestra de cada familia, montado a mano, y el
  // inventario REAL de main.js corriendo sobre él con espías de fs, dbmod y
  // securitymod.
  {
    const dir = carpeta('A-inventario');
    const P = await montar(dir);
    const H = 3600e3;
    const t0 = Date.parse('2026-09-01T10:00:00Z');
    const escribir = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); return p; };
    // --- P1: backups con y sin fila ---------------------------------------
    nuevoBackup(P.dirBk, P.pid, t0 + 1 * H, '{"f":1}', true);
    const f2 = nuevoBackup(P.dirBk, P.pid, t0 + 3 * H, '{"f":2}', true);
    nuevoBackup(P.dirBk, P.pid, t0 + 5 * H, '{"f":3}', true);
    dbmod.run('INSERT INTO backups(project_id, created_at, reason, payload, size, file_path, encrypted) VALUES (?,?,?,?,?,?,?)',
      [P.pid, new Date(t0 + 4 * H).toISOString(), 'auto', '', 1, `backup_${sello(t0 + 4 * H)}_deadbeef.json`, 0]);
    // Formato de nombre ANTIGUO (v2.0.55 y anteriores): sin sufijo aleatorio.
    // Es el de los 117 huérfanos reales; la medición en vivo destapó que el
    // inventario no lo situaba (sinPosicion=117). Regresión de C1-A1f.
    const hAntiguo = escribir(path.join(P.dirBk, `backup_${sello(t0 - 2 * H)}.json`), '{"h":"anterior-1, formato antiguo"}');
    nuevoBackup(P.dirBk, P.pid, t0 - 1 * H, '{"h":"anterior-2"}', false);
    const hInter = path.join(P.dirBk, nuevoBackup(P.dirBk, P.pid, t0 + 2 * H, '{"h":"INTERCALADO"}', false));
    nuevoBackup(P.dirBk, P.pid, t0 + 9 * H, '{"h":"posterior"}', false);
    escribir(path.join(P.dirBk, 'backup_legacy_7_1700000000000_cccccccc.json'), '{"h":"legado"}');
    escribir(path.join(P.dirBk, `${f2}.tmp-${W_A}-${'1'.repeat(32)}`), 'tmp de accion');
    escribir(path.join(P.dirBk, `backup_x.json.old-${'2'.repeat(32)}`), 'old de accion');
    escribir(path.join(P.dirBk, 'rescate-restauracion-2026-09-01T00-00-00-000Z.json'), '{"rescate":1}');
    escribir(path.join(P.dirBk, 'desktop.ini'), '[ajeno]');
    // --- P1: reuniones, evaluación y CV -----------------------------------
    escribir(path.join(P.dirBk, 'reuniones', 'reunion_A.json'), '{}');
    dbmod.run('INSERT INTO meeting_preps(project_id,created_at,meeting_date,finalidad,file_path,encrypted) VALUES (?,?,?,?,?,?)', [P.pid, 'x', 'd', 'f', 'reunion_A.json', 0]);
    escribir(path.join(P.dirBk, 'reuniones', 'reunion_B.json'), '{}');
    escribir(path.join(P.dirBk, 'evaluacion-candidatos', 'estado.json'),
      JSON.stringify({ puestos: [], evaluaciones: [{ id: 'e1', cvStoredName: 'e1__1_aaaa.pdf' }] }));
    dbmod.run('INSERT INTO candidate_evals(project_id, updated_at, encrypted) VALUES (?,?,?)', [P.pid, 'x', 0]);
    escribir(path.join(P.dirBk, 'evaluacion-candidatos', 'cv', 'e1__1_aaaa.pdf'), 'CV REFERENCIADO');
    escribir(path.join(P.dirBk, 'evaluacion-candidatos', 'cv', 'e2__2_bbbb.pdf'), 'CV SIN REFERENCIA');
    escribir(path.join(P.dirBk, 'evaluacion-candidatos', 'cv', 'desktop.ini'), '[ajeno]');
    // --- P2: CV sin estado.json (no decidible) -----------------------------
    const nuevoProyecto = (etq) => {
      const id = dbmod.run('INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES (?,?,?,?,?)', [etq, 'c', `persist:proj-${etq}`, 'x', 'x']);
      dbmod.run('UPDATE projects SET backup_dir=? WHERE id=?', [`${id}-${etq}`, id]);
      return { id, base: path.join(dir, 'backups', `${id}-${etq}`) };
    };
    const P2 = nuevoProyecto('dos');
    escribir(path.join(P2.base, 'evaluacion-candidatos', 'cv', 'e9__9_cccc.pdf'), 'CV SIN ESTADO');
    // --- P3: estado.json CIFRADO con CV -------------------------------------
    const P3 = nuevoProyecto('tres');
    const KEY = securitymod.deriveKey('clave-c1a', 'cd'.repeat(16));
    escribir(path.join(P3.base, 'evaluacion-candidatos', 'estado.json'),
      securitymod.encryptString(KEY, JSON.stringify({ puestos: [], evaluaciones: [{ id: 'e3', cvStoredName: 'e3__3_dddd.pdf' }] })));
    dbmod.run('INSERT INTO candidate_evals(project_id, updated_at, encrypted) VALUES (?,?,?)', [P3.id, 'x', 1]);
    escribir(path.join(P3.base, 'evaluacion-candidatos', 'cv', 'e3__3_dddd.pdf'), 'CV REF CIFRADO');
    escribir(path.join(P3.base, 'evaluacion-candidatos', 'cv', 'e4__4_eeee.pdf'), 'CV NO REF CIFRADO');
    // --- P4: estado.json sin fila, sin CV (no se abre) ----------------------
    const P4 = nuevoProyecto('cuatro');
    escribir(path.join(P4.base, 'evaluacion-candidatos', 'estado.json'), 'NO DEBERIA LEERSE');
    // --- restos de proyectos que ya no existen -----------------------------
    escribir(path.join(dir, 'backups', '999-fantasma', `backup_${sello(t0)}_99999999.json`), '{}');
    escribir(path.join(dir, 'projects', '999', 'dashboard.html'), '<html>');
    dbmod.run('INSERT INTO meeting_preps(project_id,created_at,meeting_date,finalidad,file_path,encrypted) VALUES (?,?,?,?,?,?)', [999, 'x', 'd', 'f', 'reunion_Z.json', 0]);
    escribir(path.join(DIR_APPDATA, 'panorama-app-safety-backups', '999-fantasma', 'backup_1.json'), '{}');
    escribir(path.join(DIR_APPDATA, 'panorama-app-safety-backups', P.fila.backup_dir, 'backup_1.json'), '{}');
    // --- particiones: dos vivas y una sin proyecto, con caché PROFUNDA -------
    escribir(path.join(dir, 'Partitions', 'proj-c1', 'Local Storage', 'leveldb', 'x.log'), 'vivo');
    escribir(path.join(dir, 'Partitions', 'proj-dos', 'Local Storage', 'leveldb', 'x.log'), 'vivo');
    const muerta = path.join(dir, 'Partitions', 'proj-muerta');
    for (let i = 0; i < 30; i++) escribir(path.join(muerta, 'Cache', 'Cache_Data', `f_${i}`), 'c'.repeat(32));
    escribir(path.join(muerta, 'Code Cache', 'js', 'index'), 'x');
    // --- raíz: temporales de la BD (uno RECUPERABLE), sonda, parche ---------
    const fallido = escribir(path.join(dir, `panorama.sqlite3.tmp-fallido-${W_A.slice(0, 16)}-abcd-1`), fs.readFileSync(path.join(dir, 'panorama.sqlite3')));
    escribir(path.join(dir, `panorama.sqlite3.tmp-huerfano-${W_A.slice(0, 16)}-efgh-2`), 'truncado');
    escribir(path.join(dir, 'panorama.sqlite3.gen.interrumpido-3'), '{}');
    escribir(path.join(dir, '.panorama-write-check-4780'), '1');
    escribir(path.join(dir, 'patch-pending-2026-09-01.asar'), 'x');
    escribir(path.join(dir, 'desktop.ini'), '[ajeno]');
    // --- material de otros equipos (lo propio ya estaría resuelto) ----------
    const M0 = construirMain({});
    escribir(path.join(M0.accionesDir(), 'e'.repeat(32) + '.json'), '{"ajeno":1}');
    fs.mkdirSync(path.join(M0.borradosDir(), 'f'.repeat(32)), { recursive: true });
    fs.mkdirSync(path.join(M0.restauracionesDir(), 'a'.repeat(32)), { recursive: true });

    const ESPERADA =
      'Residuos — inventario del arranque (solo lectura; no se ha borrado ni movido nada): ' +
      'backupsSinFila=5 [anteriores=2 intercalados=1 posteriores=1 sinPosicion=1], filasSinArchivo=1, ' +
      'reunionesSinFila=1, estadosSinFila=1, cvSinReferencia=1, cvNoDecidibles=3, carpetasSinProyecto=2, ' +
      'particionesSinProyecto=1, copiasEmergenciaSinProyecto=1, filasSinProyecto=1, temporalesBd=3, ' +
      'temporalesAccion=2, rescates=1, journalsAjenos=1, materialPendiente=2, sondas=1, parchesPendientes=1, ' +
      'noListables=0 (N ms)';

    // --- espías ---------------------------------------------------------------
    const PROHIBIDAS = new Set(['writeFileSync', 'writeFile', 'appendFileSync', 'appendFile', 'mkdirSync', 'mkdir',
      'renameSync', 'rename', 'unlinkSync', 'unlink', 'rmSync', 'rm', 'rmdirSync', 'copyFileSync', 'cpSync', 'openSync',
      'writeSync', 'utimesSync', 'truncateSync', 'symlinkSync', 'linkSync', 'chmodSync']);
    const llamadas = [];
    const fsEspia = new Proxy(fs, {
      get(t, k) {
        const v = t[k];
        if (typeof v !== 'function') return v;
        return function (...a) { llamadas.push({ k: String(k), p: String(a[0]) }); return v.apply(t, a); };
      },
    });
    const escriturasBd = [];
    const dbEspia = Object.assign({}, dbmod, {
      run: (...a) => { escriturasBd.push('run'); return dbmod.run(...a); },
      escribirMultiple: (...a) => { escriturasBd.push('escribirMultiple'); return dbmod.escribirMultiple(...a); },
      tomarExclusiva: (...a) => { escriturasBd.push('tomarExclusiva'); return dbmod.tomarExclusiva(...a); },
    });
    const cifrado = { des: 0, cif: 0 };
    const secEspia = Object.assign({}, securitymod, {
      decryptString: (k, t) => { cifrado.des++; return securitymod.decryptString(k, t); },
      encryptString: (k, t) => { cifrado.cif++; return securitymod.encryptString(k, t); },
    });
    const correr = (conClave) => {
      llamadas.length = 0; escriturasBd.length = 0; cifrado.des = 0; cifrado.cif = 0;
      const est = {};
      const MI = construirMain(est, { fs: fsEspia, dbmod: dbEspia, securitymod: secEspia });
      if (conClave) MI.setKey(KEY);
      const r = MI.registrarInventarioDeResiduos();
      return { r, lineas: (est.log || []).filter((l) => /^Residuos/.test(l)), log: est.log || [] };
    };
    const huellaAntes = arbolConHash(dir) + '#' + arbolConHash(DIR_APPDATA);
    const commitAntes = dbmod.getCommitActual();

    // ---- A1: el rastro exacto ------------------------------------------------
    const s1 = correr(false);
    nota('línea: ' + (s1.lineas[0] || '(ninguna)'));
    ok('C1-A1a el inventario deja EXACTAMENTE UNA línea en app.log', s1.lineas.length === 1 && s1.log.length === 1, JSON.stringify(s1.log));
    ok('C1-A1b …con los recuentos esperados, familia por familia',
      s1.lineas.length === 1 && s1.lineas[0].replace(/\(\d+ ms\)$/, '(N ms)') === ESPERADA,
      '\n          esperada: ' + ESPERADA + '\n          obtenida: ' + s1.lineas[0]);
    ok('C1-A1c la línea no lleva rutas ni nombres de proyecto',
      s1.lineas.length === 1 && !/[\\/]|\b(dos|tres|cuatro|fantasma)\b|Proyecto C1|proyecto-c1|sqlite3|\.json|\.pdf/i.test(s1.lineas[0]));
    ok('C1-A1f un huérfano con el nombre ANTIGUO (sin sufijo) se sitúa por su sello, no cae en sinPosicion',
      s1.r.anteriores === 2 && s1.r.sinPosicion === 1 && existe(hAntiguo),
      JSON.stringify({ anteriores: s1.r.anteriores, sinPosicion: s1.r.sinPosicion }));
    ok('C1-A1d el arranque lo llama UNA sola vez (definición + una llamada)',
      (COD.match(/registrarInventarioDeResiduos\(\)/g) || []).length === 2);
    {
      const est = {};
      const MX = construirMain(est, { dbmod: Object.assign({}, dbmod, { all: () => { throw new Error("EIO: 'G:\\datos\\x' no disponible"); } }) });
      let lanzo = false, r = 'x';
      try { r = MX.registrarInventarioDeResiduos(); } catch (e) { lanzo = true; }
      ok('C1-A1e si el inventario falla, NO lanza: una línea de aviso, sin rutas, y la app sigue',
        !lanzo && r === null && (est.log || []).length === 1 && /no se pudo completar; no se ha tocado nada/.test(est.log[0]) && !/G:/.test(est.log[0]),
        JSON.stringify(est.log));
    }

    // ---- A2: no escribe, no crea, no mueve, no descifra de más --------------
    const prohibidas = llamadas.filter((c) => PROHIBIDAS.has(c.k));
    const porTipo = llamadas.reduce((m, c) => ((m[c.k] = (m[c.k] || 0) + 1), m), {});
    nota('llamadas a fs del inventario: ' + JSON.stringify(porTipo));
    ok('C1-A2a CERO llamadas de fs que escriban, creen, muevan o borren', prohibidas.length === 0, JSON.stringify(prohibidas));
    ok('C1-A2b CERO escrituras en la BD (ni run, ni escribirMultiple, ni exclusiva) y el commit no se mueve',
      escriturasBd.length === 0 && dbmod.getCommitActual() === commitAntes, JSON.stringify(escriturasBd));
    const leidos = llamadas.filter((c) => /^readFile/.test(c.k));
    ok('C1-A2c el ÚNICO contenido que abre es estado.json, y solo donde hay CV (P1 y P3; P4 no)',
      leidos.length === 2 && leidos.every((c) => c.p.endsWith('estado.json')) && !leidos.some((c) => c.p.includes('cuatro')),
      JSON.stringify(leidos.map((c) => path.relative(dir, c.p))));
    ok('C1-A2d NO lee ni un backup, ni un CV, ni un journal', !llamadas.some((c) => /^readFile|^open/.test(c.k) && /backup_|\.pdf$|panorama-acciones/.test(c.p)));
    ok('C1-A2e NO entra en las cachés de Chromium: de Partitions solo lista el primer nivel',
      llamadas.filter((c) => c.p.includes(path.sep + 'Partitions')).every((c) => path.basename(c.p) === 'Partitions'),
      JSON.stringify(llamadas.filter((c) => c.p.includes('Partitions')).map((c) => c.k + ':' + path.relative(dir, c.p))));
    ok('C1-A2f NO hace stat archivo por archivo (solo nombres)', !llamadas.some((c) => /^(stat|lstat)Sync$/.test(c.k)), JSON.stringify(porTipo));
    ok('C1-A2g sin clave: CERO descifrados y CERO cifrados', cifrado.des === 0 && cifrado.cif === 0, JSON.stringify(cifrado));
    ok('C1-A2h el árbol del sandbox y la carpeta de emergencia quedan byte a byte iguales',
      arbolConHash(dir) + '#' + arbolConHash(DIR_APPDATA) === huellaAntes);
    const s2 = correr(true);
    ok('C1-A2i con la clave de la sesión: UN descifrado (el estado.json de P3), ninguno de backups',
      cifrado.des === 1 && cifrado.cif === 0 && s2.r.estadosDescifrados === 1, JSON.stringify({ cifrado, r: s2.r && s2.r.estadosDescifrados }));
    ok('C1-A2j …y con ella el CV de P3 deja de ser "no decidible": 2 sin referencia, 1 no decidible',
      s2.r.cvSinReferencia === 2 && s2.r.cvNoDecidibles === 1, JSON.stringify({ sin: s2.r.cvSinReferencia, nd: s2.r.cvNoDecidibles }));
    ok('C1-A2k tampoco con clave cambia nada en disco', arbolConHash(dir) + '#' + arbolConHash(DIR_APPDATA) === huellaAntes);

    // ---- A3/A4/A5: detectado → NO eliminado ----------------------------------
    ok('C1-A3 backup INTERCALADO: detectado (intercalados=1) y NO eliminado',
      s1.r.intercalados === 1 && fs.readFileSync(hInter, 'utf8') === '{"h":"INTERCALADO"}');
    ok('C1-A4 `.tmp-fallido` recuperable: detectado (temporalesBd) y NO eliminado, sigue abriendo',
      s1.r.temporalesBd === 3 && existe(fallido) &&
      (() => { try { const d = new SQL.Database(fs.readFileSync(fallido)); d.exec('SELECT COUNT(*) FROM projects'); d.close(); return true; } catch (e) { return false; } })());
    ok('C1-A5 partición sin proyecto: detectada y NO eliminada (sus 31 archivos siguen)',
      s1.r.particionesSinProyecto === 1 && arbol(muerta).length === 31);
  }

  // ---- A6/A7/A8: el CV, sobre las ramas REALES del HTML --------------------
  {
    const HTML = SRC_EVAL;
    const srcSave = extraerDe(HTML, 'function saveState(immediate)');
    const srcDo = extraerDe(HTML, 'async function doSaveNow()');
    const srcRef = extraerDe(HTML, 'function cvReferenciado(storedName)');
    const constsCv = ['CONTRATO_SESION_DETENIDA', 'CONTRATO_RESPUESTA_VACIA'].map((n) => {
      const a = HTML.indexOf('const ' + n + ' = Object.freeze({');
      if (a < 0) throw new Error('NO SE ENCONTRO la constante ' + n);
      return HTML.slice(a, HTML.indexOf('});', a) + 3) + '\n';
    }).join('');
    const rama = (desde, hasta) => {
      const a = HTML.indexOf(desde); const b = HTML.indexOf(hasta, a);
      if (a < 0 || b < 0) throw new Error('NO SE ENCONTRO la rama ' + desde);
      return HTML.slice(a + desde.length, b);
    };
    const RAMA_DEL = rama("  if (action === 'del-eval') {", "\n  } else if (action === 'export-eval') {");
    const INI_IMP = "askConfirm('Importar datos', 'Esto reemplaza todos los datos actuales de este proyecto por los del archivo. ¿Continuar?', ";
    const CB_IMP = rama(INI_IMP, '\n    } catch (err) {').trim().replace(/\);\s*$/, '');

    async function asentar() {
      for (let k = 0; k < 20; k++) await Promise.resolve();
      await new Promise((r) => setImmediate(r));
      for (let k = 0; k < 20; k++) await Promise.resolve();
    }
    function montarEval(respuestas, estado0) {
      const est = { quitados: [], eventos: [], errores: [], avisos: [], confirmado: null, guardados: [] };
      const src = constsCv +
        'let saveTimer = null; let guardadosDetenidos = false; let avisoReinicioMostrado = false;\n' +
        "const AVISO_SESION_DETENIDA = 'sesion detenida';\n" +
        'let state = ESTADO_INICIAL;\n' +
        srcSave + '\n' + srcDo + '\n' + srcRef + '\n' +
        'async function eliminarEvalReal(t) {' + RAMA_DEL + '}\n' +
        'async function importarReal(parsed) { return (' + CB_IMP + ')(); }\n' +
        'return { eliminarEvalReal, importarReal, getState: () => state, detenidos: () => guardadosDetenidos };';
      const f = new Function('window', 'showToast', 'showError', 'mostrarAvisoPersistente', 'psAlert', 'clearTimeout',
        'setTimeout', 'ESTADO_INICIAL', 'askConfirm', 'renderEvaluaciones', 'renderResultados', 'renderAll', src);
      let n = 0;
      const api = f({
        panoramaBridge: {
          saveCandidateEvalData: (json) => {
            est.eventos.push('save'); est.guardados.push(JSON.parse(json));
            const r = respuestas[Math.min(n++, respuestas.length - 1)];
            return typeof r === 'function' ? r() : Promise.resolve(r);
          },
          removeCandidateCv: (s) => { est.eventos.push('remove:' + s); est.quitados.push(s); return Promise.resolve({ ok: true }); },
        },
      }, () => {}, (m) => est.errores.push(m), (m) => est.avisos.push(m), () => Promise.resolve(),
      () => {}, () => null, estado0,
      (tit, msg, cb) => { est.confirmado = cb(); }, () => {}, () => {}, () => {});
      return { api, est };
    }
    const OK_V = { ok: true, aplicado: true, verificado: true };
    const OK_NV = { ok: true, aplicado: true, verificado: false, requiereReinicio: true, aviso: 'reinicia' };
    const NO = { ok: false, aplicado: false, reintentable: true, error: 'no se pudo' };
    const evs = () => [
      { id: 'e1', candidato: 'A', cvFileName: 'a.pdf', cvStoredName: 'e1__1_aaaa.pdf' },
      { id: 'e2', candidato: 'B', cvFileName: 'b.pdf', cvStoredName: 'e2__2_bbbb.pdf' },
      { id: 'e3', candidato: 'C', cvFileName: null, cvStoredName: null },
    ];
    async function eliminar(resp, idEv, estado) {
      const st = estado || { puestos: [], evaluaciones: evs() };
      const m = montarEval([resp], st);
      await m.api.eliminarEvalReal({ dataset: { id: idEv } });
      if (m.est.confirmado) await m.est.confirmado;
      await asentar();
      return m;
    }

    // A6 — Eliminar evaluación
    {
      const m = await eliminar(OK_V, 'e1');
      ok('C1-A6a aplicado+verificado: se retira el CV de la evaluación eliminada, y solo ese',
        m.est.quitados.length === 1 && m.est.quitados[0] === 'e1__1_aaaa.pdf' && !m.api.getState().evaluaciones.some((x) => x.id === 'e1'),
        JSON.stringify(m.est.quitados));
      ok('C1-A6b …y DESPUÉS de que el guardado conteste (nunca antes)',
        JSON.stringify(m.est.eventos) === JSON.stringify(['save', 'remove:e1__1_aaaa.pdf']), JSON.stringify(m.est.eventos));
      ok('C1-A6c el guardado que se confirma ya NO contiene esa evaluación',
        m.est.guardados.length === 1 && !m.est.guardados[0].evaluaciones.some((x) => x.id === 'e1'));
    }
    {
      const m = await eliminar(NO, 'e1');
      const st = m.api.getState();
      ok('C1-A6d NO aplicado: el CV no se toca y la evaluación VUELVE, en su sitio',
        m.est.quitados.length === 0 && st.evaluaciones.map((x) => x.id).join() === 'e1,e2,e3', JSON.stringify({ q: m.est.quitados, ids: st.evaluaciones.map((x) => x.id) }));
    }
    {
      const m = await eliminar(undefined, 'e1');
      ok('C1-A6e respuesta vacía (no demostrable): el CV no se toca y la evaluación vuelve',
        m.est.quitados.length === 0 && m.api.getState().evaluaciones.some((x) => x.id === 'e1'));
    }
    {
      const m = await eliminar(() => Promise.reject(new Error('IPC caído')), 'e1');
      ok('C1-A6f el guardado LANZA: el CV no se toca y la evaluación vuelve',
        m.est.quitados.length === 0 && m.api.getState().evaluaciones.some((x) => x.id === 'e1'));
    }
    {
      const m = await eliminar(OK_V, 'e3');
      ok('C1-A6g una evaluación SIN CV se elimina sin llamar a removeCv', m.est.quitados.length === 0 && m.est.eventos.join() === 'save');
    }
    {
      const st = { puestos: [], evaluaciones: evs().concat([{ id: 'e4', candidato: 'D', cvFileName: 'a.pdf', cvStoredName: 'e1__1_aaaa.pdf' }]) };
      const m = await eliminar(OK_V, 'e1', st);
      ok('C1-A6h si OTRA evaluación sigue apuntando al mismo CV, no se retira', m.est.quitados.length === 0);
    }
    // A7 — Importar
    async function importar(resp, parsed, previo) {
      const m = montarEval([resp], previo || { puestos: [], evaluaciones: evs() });
      const antes = m.api.getState();
      await m.api.importarReal(parsed);
      await asentar();
      return { m, antes };
    }
    const importado = () => ({ puestos: [], evaluaciones: [{ id: 'e9', candidato: 'Z', cvFileName: 'b.pdf', cvStoredName: 'e2__2_bbbb.pdf' }] });
    {
      const { m } = await importar(OK_V, importado());
      ok('C1-A7a aplicado+verificado: se retiran SOLO los CV que el estado importado ya no referencia',
        JSON.stringify(m.est.quitados) === JSON.stringify(['e1__1_aaaa.pdf']), JSON.stringify(m.est.quitados));
      ok('C1-A7b …después del guardado, y con el estado importado en memoria',
        m.est.eventos[0] === 'save' && m.api.getState().evaluaciones[0].id === 'e9' && typeof m.api.getState().threshold === 'number');
    }
    {
      const { m, antes } = await importar(NO, importado());
      ok('C1-A7c NO aplicado: ningún CV se toca y vuelve el estado ANTERIOR',
        m.est.quitados.length === 0 && m.api.getState() === antes, JSON.stringify(m.est.quitados));
    }
    {
      const { m, antes } = await importar(undefined, importado());
      ok('C1-A7d respuesta vacía (no demostrable): ningún CV se toca y vuelve el estado anterior',
        m.est.quitados.length === 0 && m.api.getState() === antes);
    }
    {
      const { m } = await importar(OK_V, { puestos: [], evaluaciones: evs() });
      ok('C1-A7e reimportar el MISMO estado no retira nada', m.est.quitados.length === 0);
    }
    // A8 — verificado:false
    {
      const m = await eliminar(OK_NV, 'e1');
      ok('C1-A8a eliminar con verificado:false: el CV PERMANECE (y la sesión queda detenida)',
        m.est.quitados.length === 0 && m.api.detenidos() === true && !m.api.getState().evaluaciones.some((x) => x.id === 'e1'));
      const { m: m2 } = await importar(OK_NV, importado());
      ok('C1-A8b importar con verificado:false: TODOS los CV permanecen', m2.est.quitados.length === 0 && m2.api.detenidos() === true);
    }
  }

  // ---- A9: los mensajes ya no prometen una recuperación que no existe -------
  {
    const dir = carpeta('A9-mensajes');
    await montar(dir);
    const M = construirMain({});
    const key = securitymod.deriveKey('clave-a9', 'ef'.repeat(16));
    const opts = { mode: 'setup', newSalt: 'ef'.repeat(16), newVerifier: securitymod.verifierFor(key) };
    const PROMESA = /se resuelve sol[ao]|se resuelva sol[ao]|se arregla sol[ao]/i;

    fs.mkdirSync(M.rekeyStagingDir(), { recursive: true });
    const a = M.rekeyAllUserFiles(null, key, opts);
    ok('C1-A9a rekey con carpeta de trabajo SIN registro: no promete nada y avisa de PS-2004 y de no borrarla',
      a.ok === false && !PROMESA.test(a.error) && /no se puede resolver sola/.test(a.error) &&
      /se detendr. con el aviso PS-2004/.test(a.error) && /No la borres sin revisarla/.test(a.error), String(a.error));
    const rec = M.recoverInterruptedRekeyIfAny();
    ok('C1-A9b el arranque sigue siendo FAIL-CLOSED con esa carpeta (sinRegistro) y NO la toca',
      rec && rec.fallaCerrado === true && rec.sinRegistro === true && existe(M.rekeyStagingDir()), JSON.stringify(rec));
    fs.writeFileSync(M.rekeyJournalPath(), '{"v":2}', 'utf8');
    const b = M.rekeyAllUserFiles(null, key, opts);
    ok('C1-A9c CON registro: dice que se INTENTARÁ, y que si no se demuestra se detendrá (PS-2004)',
      b.ok === false && !PROMESA.test(b.error) && /se intentar. terminar o deshacer/.test(b.error) && /PS-2004/.test(b.error), String(b.error));
    fs.rmSync(M.rekeyStagingDir(), { recursive: true, force: true });

    const tramoArr = (() => {
      const i = COD.indexOf('if (rekeyRecovery && rekeyRecovery.fallaCerrado) {');
      return COD.slice(i, COD.indexOf('dialog.showMessageBoxSync', i));
    })();
    const ramaSinReg = tramoArr.slice(tramoArr.indexOf(': rekeyRecovery.sinRegistro'), tramoArr.indexOf("\n      : 'No se ha modificado ni borrado nada: tus archivos"));
    ok('C1-A9d el aviso de ARRANQUE tiene su rama sin registro, y esa rama no promete autorrecuperación',
      ramaSinReg.length > 40 && !PROMESA.test(ramaSinReg) && /dar. este mismo aviso/.test(ramaSinReg), ramaSinReg.slice(0, 120));

    const idR = M.nuevoActionId();
    fs.mkdirSync(M.dirDeRestauracion(idR), { recursive: true });
    fs.writeFileSync(M.previoPath(idR), '{"foto":1}', 'utf8');
    const c = M.rekeyAllUserFiles(null, key, opts);
    ok('C1-A9e rekey con material de restauración SIN registro: no promete nada y avisa de PS-2006',
      c.ok === false && !PROMESA.test(c.error) && /SIN su registro/.test(c.error) && /PS-2006/.test(c.error), String(c.error));
    fs.writeFileSync(M.journalRestauracionPath(idR), '{"v":1}', 'utf8');
    const d = M.rekeyAllUserFiles(null, key, opts);
    ok('C1-A9f CON registro: "se intentará terminar", y si no se demuestra, PS-2006',
      d.ok === false && !PROMESA.test(d.error) && /se intentar. terminar con su registro/.test(d.error) && /PS-2006/.test(d.error), String(d.error));
    const rr = await M.recuperarRestauracionesPendientes();
    ok('C1-A9g el fail-closed del arranque NO se ha relajado (material conservado)',
      rr.ok === false && existe(M.previoPath(idR)));
    ok('C1-A9h ningún mensaje de main.js vuelve a prometer "se resuelve sola"', !/se resuelve sola|se resuelva sola/.test(COD));
  }

  // =========================================================================
  seccion('C1-R. LO QUE PASARÍA CON EL ARREGLO PROPUESTO EN LA AUDITORÍA');
  // =========================================================================
  // "listar backup_*.json de cada carpeta, cruzar contra las filas, borrar los
  //  que no aparezcan". Se evalúa como MODELO, sin tocar producción: cada
  //  aserción dice qué destruiría o qué no vería esa regla.
  {
    const regla = (nombre, filas) => /^backup_.*\.json$/i.test(nombre) && !filas.has(nombre.toLowerCase());
    const filas = new Set(['backup_2026-09-12t00-00-00-000z_aaaaaaaa.json']);
    ok('C1-R1 borraría un huérfano INTERCALADO (fila perdida por sobrescritura entre equipos, no por la purga)',
      regla('backup_2026-09-01T15-25-17-900Z_bbbbbbbb.json', filas));
    ok('C1-R2 borraría un `backup_legacy_*` recién migrado si su fila no llegó a confirmarse',
      regla('backup_legacy_7_1700000000000_cccccccc.json', filas));
    ok('C1-R3 NO vería un tmp de acción `backup_….json.tmp-<w>-<id>` (no termina en .json)',
      !regla('backup_x.json.tmp-' + W_A + '-' + W_B, filas));
    ok('C1-R4 NO vería los CV, las reuniones sin fila, los rescates ni el material de .panorama-*',
      !regla('e1__1_aaaa.pdf', filas) && !regla('reunion_x.json', filas) && !regla('rescate-restauracion-x.json', filas));
    ok('C1-R5 con dos equipos, un backup RECIÉN publicado por el otro aún no tiene fila en NUESTRA imagen',
      /Otro equipo est. guardando ahora mismo sobre este mismo archivo/.test(sinTildes(SRC)) && regla('backup_2026-09-16T10-00-00-000Z_dddddddd.json', filas));
    nota('-> La regla "sin fila ⇒ basura" es falsa en una carpeta compartida: la fila puede venir DESPUÉS');
    nota('   (el otro equipo publica el archivo en F3 y confirma la fila en F4).');
    ok('C1-R6 al arrancar, la espera a Drive es una heurística de CPU ociosa, no "todo descargado"',
      /waitForCloudSyncIdleAtStartup/.test(SRC) && /Drive\/OneDrive sin actividad de CPU reciente tras/.test(SRC));
    nota('   "Drive ocioso" no demuestra "carpeta completa": un listado puede estar incompleto.');
  }

  // =========================================================================
  seccion('C1-P. FUERA DE ALCANCE — para no ensanchar C1');
  // =========================================================================
  // 18 sept 2026 — actualizada por P22. Antes decía «la app vuelve a ella si
  // falla la configurada» y lo comprobaba por el botón 'Abrir con datos locales
  // (temporal)' de PS-1005. Ese botón YA NO EXISTE: P22 lo sustituyó por una
  // puerta que pregunta y en la que Esc/X cierra. La carpeta por defecto sigue
  // siendo la de P10 (eso es lo que C1 custodia: que no se ensancha aquí), pero
  // ya no se llega a ella sola.
  ok('C1-P1 P10 sigue siendo la carpeta de datos POR DEFECTO, pero desde P22 ya NO se cae en ella sola: se pregunta (PS-1005/PS-1021) y Esc/X cierra',
    /const defaultUserDataDir = app\.getPath\('userData'\);/.test(SRC)
    && !/'Abrir con datos locales \(temporal\)'/.test(SRC)
    && /function preguntarPorLaCarpetaLocal\(/.test(SRC) && /PS-1021/.test(SRC));
  ok('C1-P2 C2 (.asar en la carpeta sincronizada) es otro hallazgo y sigue abierto',
    /\| \*\*C2\*\* \| \*\*PENDIENTE\*\*/.test(DOC('auditoria-2026-09-13.md')));
  // 16 sept 2026: F1 se implementó en su propia ronda (autorizada aparte), así
  // que ya no está «ABIERTO». Lo que esta aserción custodia sigue siendo lo
  // mismo — que C1 no lo tocó —, solo cambia el estado esperado de F1.
  ok('C1-P3 P14/P15 y D4 no se tocan aquí; F1 se cerró en su propia ronda',
    /\| P14 \| \*\*ABIERTO/.test(DOC('pendientes-abiertos.md')) && /\| F1 \| \*\*CERRADO/.test(DOC('pendientes-abiertos.md')));

  // =========================================================================
  seccion('C1-Z. GUARDIÁN');
  // =========================================================================
  ok('C1-Z1 la BD residual de P10 no se ha tocado', shaArchivo(P10_BD) === P10_ANTES, P10_ANTES.slice(0, 16));
  ok('C1-Z2 ninguna ruta de esta batería salió del sandbox', true);

  console.log('\n' + '='.repeat(70));
  console.log(`  C1: ${pass} OK / ${fail} FALLOS`);
  if (fallos.length) console.log('  fallos: ' + fallos.join(' | '));
  console.log('='.repeat(70));
  console.log('  Batería DESCRIPTIVA: da verde porque describe lo que HAY, no lo que debería haber.');
  process.exitCode = fail === 0 ? 0 : 1;
})().catch((e) => { console.error('FALLO INESPERADO:', e); process.exitCode = 2; });

function extraerHandlerSeguro(canal) { try { return extraerHandler(canal, 'h'); } catch (e) { return ''; } }
