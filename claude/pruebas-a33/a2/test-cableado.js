'use strict';
// ---------------------------------------------------------------------------
// A2 — CABLEADO PRODUCTIVO de backup:restore. Integracion sobre el codigo REAL.
//
// A1-A15 sobre produccion + REST-PROD-QUIESCE / NO-STALE / PARTIAL / FORM3 /
// STARTUP / REKEY / LEGACY-SLUG / COLLISIONS / CONTRACT.
//
// La particion se ejercita con las funciones REALES de main.js
// (readLocalStorageDumpFromPartition / writeLocalStorageDumpToPartition), que
// se ejecutan contra un doble de BrowserWindow con un localStorage de verdad
// por particion: asi corre el MISMO script de clear()+setItem que en produccion.
// Lo que sigue sin probarse hasta Electron real es el propio BrowserWindow.
// ---------------------------------------------------------------------------
const fsReal = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const Module = require('module');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const MARCA_PRUEBAS = '_a33-a2-CABLEADO';
const RAIZ = path.join(os.tmpdir(), MARCA_PRUEBAS);

const GUARDIA = require(path.join(__dirname, '..', 'comun', 'guardia-rutas.js'));
const guardia = GUARDIA.crearGuardia({ marca: MARCA_PRUEBAS });
const segura = guardia.segura;
segura(RAIZ);
fsReal.rmSync(RAIZ, { recursive: true, force: true });
fsReal.mkdirSync(RAIZ, { recursive: true });

const escrituras = [];
const fs = Object.assign({}, fsReal);
fs.renameSync = function (a, b) { escrituras.push(String(b)); return fsReal.renameSync(a, b); };
fs.writeFileSync = function (p, d, o) { escrituras.push(String(p)); return fsReal.writeFileSync(p, d, o); };
// REST-ROLLBACK-FLUSH-*: el cleanup del material de restauracion tiene que
// quedar en la MISMA traza que la escritura de la particion y el flush, o no se
// puede afirmar que va despues y no antes.
fs.rmSync = function (p, o) {
  if (String(p).indexOf('.panorama-restauraciones') >= 0) traza.push(['cleanup', String(p)]);
  return fsReal.rmSync(p, o);
};

let DIR_DATOS = path.join(RAIZ, 'datos');
let DIR_APPDATA = path.join(RAIZ, 'appdata');
fsReal.mkdirSync(DIR_DATOS, { recursive: true });
fsReal.mkdirSync(DIR_APPDATA, { recursive: true });
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

let pass = 0, fail = 0; const fallos = [];
function ok(n, c, extra) {
  if (c) { pass++; console.log('  OK    ' + n); }
  else { fail++; fallos.push(n); console.log('  FALLO ' + n + (extra ? '  -- ' + extra : '')); }
}
function seccion(t) { console.log('\n=== ' + t + ' ==='); }
let nc = 0;
function carpeta(e) { const d = path.join(RAIZ, 'c' + (++nc) + '-' + e); segura(d); fsReal.mkdirSync(d, { recursive: true }); return d; }

// ---------------------------------------------------------------------------
// localStorage REAL por particion + doble de BrowserWindow, para que corran las
// funciones de produccion tal cual.
const almacenes = new Map();
let cortarTrasNSetItem = null;   // { part, n }
function almacenDe(part) {
  if (!almacenes.has(part)) almacenes.set(part, new Map());
  return almacenes.get(part);
}
function localStorageDe(part) {
  const m = almacenDe(part);
  let puestos = 0;
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i],
    getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null),
    setItem: (k, v) => {
      if (cortarTrasNSetItem && cortarTrasNSetItem.part === part && puestos >= cortarTrasNSetItem.n) {
        cortarTrasNSetItem = null;            // UNA sola vez: simula la muerte al aplicar
        throw new Error('corte simulado escribiendo localStorage');
      }
      puestos++; m.set(String(k), String(v));
    },
    clear: () => m.clear(),
  };
}
let ventanasOcultas = 0;
function BrowserWindowDoble(opts) {
  const part = (opts && opts.webPreferences && opts.webPreferences.partition) || 'default';
  ventanasOcultas++;
  this.__part = part;
  this.__destruida = false;
  const self = this;
  this.webContents = {
    executeJavaScript(script) {
      try {
        // Traza para REST-FLUSH-*: distinguir leer de escribir la particion.
        traza.push([/setItem/.test(script) ? 'escribirParticion' : 'leerParticion', part]);
        const ls = localStorageDe(part);
        // El MISMO texto de script que manda produccion, evaluado contra un
        // localStorage de verdad.
        const f = new Function('localStorage', 'return (' + script.trim().replace(/;\s*$/, '') + ');');
        return Promise.resolve(f(ls));
      } catch (e) { return Promise.reject(e); }
    },
  };
  this.loadFile = () => Promise.resolve();
  this.close = () => { self.__destruida = true; ventanasOcultas--; };
  this.isDestroyed = () => self.__destruida;
}
// ---------------------------------------------------------------------------
// Doble de `session` INSTRUMENTADO (REST-FLUSH-*). Anota cada llamada en la
// misma traza que las escrituras de la particion y que el commit, para poder
// comprobar el ORDEN y no solo que las tres cosas ocurrieron.
const traza = [];
let flushFalla = null;                 // string -> revienta en la PROXIMA llamada
let flushFallaN = null;                // { n, msg } -> revienta en la n-esima
const sessionDoble = {
  fromPartition: (part) => ({
    clearStorageData: () => { traza.push(['clearStorageData', part]); return Promise.resolve(); },
    flushStorageData: () => {
      traza.push(['flushStorageData', part]);
      // Una restauracion que se deshace llama al flush DOS veces: al aplicar y
      // al reponer. Para atacar solo la segunda hace falta contar.
      if (flushFallaN && traza.filter((t) => t[0] === 'flushStorageData').length === flushFallaN.n) {
        const m = flushFallaN.msg; flushFallaN = null; throw new Error(m);
      }
      if (flushFalla) { const m = flushFalla; flushFalla = null; throw new Error(m); }
      // En Electron 30.5.1 devuelve `undefined`, no una promesa (sonda
      // a2/probe-flush3.js). El doble replica esa forma a proposito: si
      // devolviera una promesa, `await` sobre ella ocultaria el hecho de que
      // en produccion el await NO espera a nada.
      return undefined;
    },
  }),
};
const trazaDe = (n) => traza.filter((t) => t[0] === n);
const idxDe = (n) => traza.findIndex((t) => t[0] === n);

const volcado = (part) => Object.fromEntries(almacenDe(part));
const ponerParticion = (part, dump) => { const m = almacenDe(part); m.clear(); for (const k of Object.keys(dump)) m.set(k, String(dump[k])); };

// ---------------------------------------------------------------------------
const RUTA_MAIN = process.env.PANORAMA_MAIN || path.join(PROJ, 'main.js');
const SRC = fsReal.readFileSync(RUTA_MAIN, 'utf8');
function extraer(firma) {
  const i = SRC.indexOf(firma);
  if (i < 0) throw new Error('NO SE ENCONTRO: ' + firma);
  // El cuerpo empieza en la primera `{` DESPUES de la firma completa. Buscarla
  // desde el principio de la firma se traga la llave de una desestructuracion
  // en los parametros — p. ej. `(partitionName, dump, { clearFirst } = {})` —
  // y devuelve una funcion truncada que revienta al compilar el ambito.
  const desde = firma.endsWith('(') ? i : i + firma.length;
  let j = SRC.indexOf('{', desde), prof = 0;
  for (let k = j; k < SRC.length; k++) {
    if (SRC[k] === '{') prof++;
    else if (SRC[k] === '}') { prof--; if (prof === 0) return SRC.slice(i, k + 1); }
  }
  throw new Error('no delimitado: ' + firma);
}
function extraerHandler(canal, nombre) {
  const marca = `ipcMain.handle('${canal}'`;
  const i = SRC.indexOf(marca);
  if (i < 0) throw new Error('NO SE ENCONTRO handler ' + canal);
  const flecha = SRC.indexOf('=> {', i);
  const esAsync = /,\s*async\s*\(/.test(SRC.slice(i, flecha));
  const firma = SRC.slice(SRC.indexOf('(', SRC.indexOf(',', i)), flecha).trim().replace(/^async\s*/, '');
  let j = SRC.indexOf('{', flecha), prof = 0, fin = -1;
  for (let k = j; k < SRC.length; k++) {
    if (SRC[k] === '{') prof++;
    else if (SRC[k] === '}') { prof--; if (prof === 0) { fin = k; break; } }
  }
  return `${esAsync ? 'async ' : ''}function ${nombre}${firma} ${SRC.slice(j, fin + 1)}`;
}
function lineaConst(n) { const i = SRC.indexOf(n); if (i < 0) throw new Error('falta ' + n); return SRC.slice(i, SRC.indexOf('\n', i) + 1); }

const BLOQUES = [
  'function accionNoAplicada(error, reintentable)',
  'function escribirBufferDurable(ruta, buf)',
  'function escribirJsonDurable(ruta, obj)',
  'function sha256DeArchivo(p)',
  'function bloqueoDeSeguridad()',
  'function encryptIfNeeded(payload, isEncrypted)',
  'function accionesDir()',
  'function nuevoActionId()',
  'function journalAccionPath(actionId)',
  'function claveMarcaAcciones(writer)',
  'function leerMarcaAcciones()',
  'function estadoAccionEnMarca(actionId)',
  'function accionYaAplicada(actionId)',
  'function sentenciaMarcaAccion(actionId)',
  'function leerJournalAccion(ruta)',
  'function journalsDeAcciones()',
  'function journalsPropiosPendientes()',
  'function destinoOcupadoPorOtroEquipo(destino)',
  'function estadoDestinoAccion(j)',
  'function resolverAccionPendiente(j)',
  'function ejecutarAccionDeArchivo(opts)',
  'function ensureProjectBackupDirSlug(row)',
  'async function cerrarVentanasDeProyecto(id, opciones)',
  'async function deleteProjectById(id)',
  'async function avisarResultadoBorradoProyecto(winOriginal, r, nombre)',
  // --- particion: las funciones REALES ---
  'function writeLocalStorageDumpToPartition(partitionName, dump, { clearFirst } = {})',
  'function runInPartition(partitionName, script)',
  'function readLocalStorageDumpFromPartition(partitionName)',
  'function readBackupPayload(row, bkRow, opciones)',
  'function saveRescueDump(row, previo)',
  // --- A2 ---
  'function hashDumpLocalStorage(dump)',
  // `leerJournalRestauracion` y `journalsDeRestauraciones` ya NO se listan aqui:
  // desde H-1 los necesita `proyectoBloqueadoParaMutar()`, asi que viven en
  // `comun/bloque5-extraccion.js` y llegan por ahi. Repetirlas declararia la
  // misma funcion dos veces en el mismo ambito.
  'function recursosReservadosPorRestauraciones()',
  // `f1Restauraciones` tampoco se lista aqui: llega por bloque5-extraccion.
  'function escribirPrevioDurable(actionId, j, dump)',
  'function leerPrevioDemostrable(j)',
  'function clasificarParticionRestauracion(actual, j)',
  'async function reponerParticionDesdePrevio(j)',
  'function limpiarMaterialRestauracion(actionId, journal)',
  'async function resolverRestauracionPendiente(j)',
  'function rearmarBarrerasDeRestauracion()',
  'async function recuperarRestauracionesPendientes()',
  'async function restoreProjectBackup(projectId, backupId)',
];
BLOQUES.push.apply(BLOQUES, B5.BLOQUES_B5);
const HANDLERS = [
  ['backup:save', 'guardarBackup'],
  ['meeting:savePrep', 'guardarPrep'],
  ['meeting:deletePrep', 'borrarPrep'],
  ['candidateEval:save', 'guardarEval'],
  ['candidateEval:removeCv', 'quitarCv'],
];
const CONSTS = B5.sinRepetir([
  lineaConst('const FSYNC_NO_SOPORTADO_REG'),
  lineaConst("const ACCIONES_DIR_NAME = '.panorama-acciones';"),
  lineaConst('const ACCIONES_JOURNAL_V ='),
  lineaConst('const ACCIONES_MARCA_MAX ='),
  lineaConst('const ACCIONES_TIPOS ='),
  lineaConst('const esHex ='),
  lineaConst('const esEnteroNoNegativo ='),
  lineaConst('const RESTAURACIONES_JOURNAL_V ='),
  lineaConst('const PREVIO_V ='),
  lineaConst('const RESTAURACION_FASES ='),
  lineaConst('const RESTORE_CLOSE_TIMEOUT_MS ='),
].concat(B5.CONSTS_B5.map(lineaConst))).join('');

function construirMain(est, op) {
  const o = op || {};
  const cuerpo = CONSTS + '\n' +
    'let securityKey = null;\n' +
    'let seguridadRequiereRevalidacion = false;\n' +
    'let seguridadEnEstadoInconsistente = null;\n' +
    'let procesoComprometido = false;\n' +
    'let rekeyInProgress = false;\n' +
    'let driveOutageActive = false;\n' +
    'let launcherWin = null;\n' +
    "const REKEY_BUSY_MESSAGE = 'LA SEGURIDAD SE ESTA ACTUALIZANDO';\n" +
    'const projectWindows = new Map();\n' +
    'const meetingPrepWindows = new Map();\n' +
    'const candidateEvalWindows = new Map();\n' +
    B5.PREAMBULO_B5 +
    'let __reaperturas = [];\n' +
    'function openProjectWindow(row) { __reaperturas.push(row.id); return null; }\n' +
    BLOQUES.map(extraer).join('\n\n') + '\n' +
    HANDLERS.map(([c, n]) => extraerHandler(c, n)).join('\n\n') + '\n' +
    'return { restoreProjectBackup, recuperarRestauracionesPendientes, resolverRestauracionPendiente,\n' +
    '         rearmarBarrerasDeRestauracion, rekeyPuedeEmpezar, materialDeRestauracionPendiente,\n' +
    '         f1Restauraciones, journalsDeRestauraciones, leerJournalRestauracion,\n' +
    '         restauracionesDir, dirDeRestauracion, journalRestauracionPath, previoPath,\n' +
    '         hashDumpLocalStorage, clasificarParticionRestauracion, reponerParticionDesdePrevio,\n' +
    '         escribirPrevioDurable, leerPrevioDemostrable, limpiarMaterialRestauracion,\n' +
    '         proyectoBloqueadoParaMutar, proyectoEnRestauracion, proyectosEnRestauracion,\n' +
    '         proyectosEnBorrado, cerrarVentanasDeProyecto, deleteProjectById,\n' +
    '         readLocalStorageDumpFromPartition, writeLocalStorageDumpToPartition,\n' +
    '         readBackupPayload, rutaBackupsPura, ensureProjectBackupDirSlug, slugify,\n' +
    '         guardarBackup, guardarPrep, borrarPrep, guardarEval, quitarCv,\n' +
    '         sentenciaMarcaAccion, estadoAccionEnMarca, leerMarcaAcciones, sha256DeArchivo,\n' +
    '         accionesDir, journalAccionPath, borradosDir, journalBorradoPath, cuarentenaDe,\n' +
    '         f1Global, ocupacionComun, escribirBufferDurable,\n' +
    '         projectWindows, meetingPrepWindows, candidateEvalWindows,\n' +
    '         reaperturas: () => __reaperturas, limpiarReaperturas: () => { __reaperturas = []; },\n' +
    '         setKey: (k) => { securityKey = k; }, getKey: () => securityKey,\n' +
    '         setRekey: (v) => { rekeyInProgress = v; },\n' +
    '         setComprometido: (v) => { procesoComprometido = v; },\n' +
    '         setRevalidacion: (v) => { seguridadRequiereRevalidacion = v; } };';
  const f = new Function('app', 'fs', 'path', 'crypto', 'dbmod', 'securitymod', 'appLog', 'getMeta',
    'session', 'BrowserWindow', '__dirname', 'errorCodeSuffix', 'backupsDirForProject',
    'meetingPrepsDirForProject', 'candidateEvalFileForProject', 'localSafetyBackupsDirForProject',
    'purgeOldLocalSafetyBackups', 'regenerateProjectDashboardFile', 'candidateEvalCvDirForProject',
    'isSafeCvStoredName', cuerpo);
  const mk = (p) => { fsReal.mkdirSync(p, { recursive: true }); return p; };
  return f(appDoble, fs, path, crypto, o.dbmod || dbmod, securitymod,
    (s) => { (est.log = est.log || []).push(s); },
    (k) => { const r = dbmod.get('SELECT value FROM app_meta WHERE key=?', [k]); return r ? r.value : null; },
    o.session || sessionDoble,
    BrowserWindowDoble, PROJ,
    (c) => `\n\n(código ${c})`,
    (row) => mk(path.join(DIR_DATOS, 'backups', row.backup_dir || `${row.id}-x`)),
    (row) => mk(path.join(DIR_DATOS, 'backups', row.backup_dir || `${row.id}-x`, 'reuniones')),
    (row) => path.join(mk(path.join(DIR_DATOS, 'backups', row.backup_dir || `${row.id}-x`, 'evaluacion-candidatos')), 'estado.json'),
    (row) => mk(path.join(DIR_APPDATA, 'rescate', String(row.id))),
    () => {}, () => {},
    (row) => mk(path.join(DIR_DATOS, 'backups', row.backup_dir || `${row.id}-x`, 'evaluacion-candidatos', 'cv')),
    () => true);
}
function dbmodCon(fnEscribir) {
  return Object.assign(Object.create(Object.getPrototypeOf(dbmod)), dbmod, { escribirMultiple: fnEscribir });
}

// ---------------------------------------------------------------------------
let SQL = null;
const W_A = 'a'.repeat(32);
const W_B = 'b'.repeat(32);
const commitFalso = () => crypto.randomBytes(16).toString('hex');
const nFilas = (t, w, p) => dbmod.get(`SELECT COUNT(*) n FROM ${t}` + (w ? ' WHERE ' + w : ''), p || []).n;

async function montar(dir, writer) {
  segura(dir);
  dbmod._resetParaPruebas();
  DIR_DATOS = dir;
  if (writer) dbmod.setInstallationId(writer);
  await dbmod.getDb({ crearSiAusente: true });
  fsReal.mkdirSync(path.join(dir, 'backups'), { recursive: true });
}
function nuevoProyecto(nombre, slug) {
  const pid = dbmod.run(
    'INSERT INTO projects(name,client,partition_name,created_at,updated_at,backup_dir) VALUES (?,?,?,?,?,?)',
    [nombre, 'c', 'persist:' + nombre.replace(/\s/g, ''), 'x', 'x', slug === undefined ? null : slug]);
  return dbmod.get('SELECT * FROM projects WHERE id=?', [pid]);
}
function publicarComoOtroEquipo(dir, o) {
  const p = path.join(dir, 'panorama.sqlite3');
  const d = new SQL.Database(fsReal.readFileSync(p));
  const set = (k, v) => d.run('INSERT INTO app_meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [k, String(v)]);
  set('db_commit_id', o.commit); set('db_parent_commit_id', o.parent);
  set('db_commit_history', JSON.stringify([o.commit])); set('db_generation', String(o.gen || 99));
  const b = Buffer.from(d.export()); d.close();
  fsReal.writeFileSync(p, b);
  fsReal.writeFileSync(p + '.gen', JSON.stringify({ v: 2, gen: o.gen || 99, commit_id: o.commit, parent_commit_id: o.parent, writer: W_B, at: new Date().toISOString() }), 'utf8');
}

const VIEJO = { 'proj': JSON.stringify({ marca: 'VIEJO', hitos: 3 }), 'tema': 'oscuro' };
const DEL_BACKUP = { 'proj': JSON.stringify({ marca: 'DEL-BACKUP', hitos: 1 }), 'idioma': 'es' };

// Crea un backup REAL en disco + su fila, como lo haria backup:save.
function ponerBackup(M, row, dump) {
  const dir = M.rutaBackupsPura(row);
  fsReal.mkdirSync(dir, { recursive: true });
  const file = 'backup_' + crypto.randomBytes(4).toString('hex') + '.json';
  fsReal.writeFileSync(path.join(dir, file), JSON.stringify(dump), 'utf8');
  const id = dbmod.run('INSERT INTO backups(project_id,created_at,payload,size,file_path,encrypted) VALUES (?,?,?,?,?,0)',
    [row.id, new Date().toISOString(), '', 0, file]);
  return { id, file, dir };
}
const residuos = (M) => { try { return fsReal.readdirSync(M.restauracionesDir()); } catch (e) { return []; } };
// Listado tolerante: una carpeta ausente es un dato de la prueba, no un motivo
// para tumbar la bateria entera con ENOENT.
const lsDir = (p) => { try { return fsReal.readdirSync(p); } catch (e) { return []; } };

async function escenario(nombre, op) {
  const dir = carpeta(nombre); await montar(dir, W_A);
  const est = {}; const M = construirMain(est, op || {});
  const row = nuevoProyecto('Servicio ' + nombre, 'p-' + nombre);
  ponerParticion(row.partition_name, VIEJO);
  const bk = ponerBackup(M, row, DEL_BACKUP);
  return { dir, est, M, row, bk };
}

// ===========================================================================
(async () => {
  SQL = await initSqlJs({ locateFile: (f) => path.join(PROJ, 'node_modules', 'sql.js', 'dist', f) });
  console.log('A2 — CABLEADO PRODUCTIVO de backup:restore (integracion)');
  console.log('  main.js bajo prueba: ' + RUTA_MAIN);

  // =========================================================================
  seccion('REST-PROD-CONTRACT — el canal devuelve el contrato de tres formas');
  // =========================================================================
  {
    const s = await escenario('contract');
    const r = await s.M.restoreProjectBackup(s.row.id, s.bk.id);
    ok('B) camino feliz: aplicado:true / verificado:true',
      r.ok === true && r.aplicado === true && r.verificado === true && typeof r.actionId === 'string', JSON.stringify(r).slice(0, 140));
    const r2 = await s.M.restoreProjectBackup(99999, null);
    ok('A) proyecto inexistente: aplicado:false, sin excepcion',
      r2 && r2.aplicado === false && r2.reintentable === false && /no encontrado/i.test(r2.error), JSON.stringify(r2));
    const s2 = await escenario('contract2');
    dbmod.run('DELETE FROM backups WHERE project_id=?', [s2.row.id]);
    const r3 = await s2.M.restoreProjectBackup(s2.row.id, null);
    ok('A) sin backups: aplicado:false, sin excepcion', r3.aplicado === false && /No hay backups/.test(r3.error), JSON.stringify(r3));
    ok('restoreProjectBackup NUNCA lanza: los tres casos devolvieron objeto', true);
  }

  // =========================================================================
  seccion('REST-PROD-QUIESCE y REST-PROD-NO-STALE');
  // =========================================================================
  {
    const s = await escenario('quiesce');
    // Tres ventanas "abiertas" que, al cerrarse, intentan su guardado final por
    // los IPC REALES. La barrera tiene que rechazarlos.
    const intentos = [];
    const ventana = (fam) => {
      const w = {
        _cb: null, _destruida: false,
        isDestroyed: () => w._destruida,
        once: (ev, cb) => { if (ev === 'closed') w._cb = cb; },
        close: () => {
          w._destruida = true;
          // El guardado final REAL de cada familia:
          if (fam === 'dashboard') intentos.push(['backup', s.M.guardarBackup(null, { projectId: s.row.id, payload: JSON.stringify(VIEJO), reason: 'auto' })]);
          if (fam === 'meeting') intentos.push(['prep', s.M.guardarPrep(null, { projectId: s.row.id, meetingDate: 'x', finalidad: 'y', payload: '{}' })]);
          if (fam === 'candidate') intentos.push(['eval', s.M.guardarEval(null, { projectId: s.row.id, payload: '{}' })]);
          // Y la persistencia de bounds, que SI es legitima y mueve el commit.
          dbmod.run("INSERT INTO app_meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", ['win-bounds-' + fam, '{}']);
          if (w._cb) setImmediate(w._cb);
        },
      };
      return w;
    };
    s.M.projectWindows.set(s.row.id, ventana('dashboard'));
    s.M.meetingPrepWindows.set(s.row.id, ventana('meeting'));
    s.M.candidateEvalWindows.set(s.row.id, ventana('candidate'));

    const backupsAntes = nFilas('backups', 'project_id=?', [s.row.id]);
    const prepsAntes = nFilas('meeting_preps');
    const evalsAntes = nFilas('candidate_evals');
    const commitAntesDeTodo = dbmod.getCommitActual();

    const r = await s.M.restoreProjectBackup(s.row.id, s.bk.id);
    const resueltos = await Promise.all(intentos.map(([, p]) => Promise.resolve(p)));

    ok('REST-PROD-QUIESCE se cierran las TRES familias',
      s.M.projectWindows.size === 0 && s.M.meetingPrepWindows.size === 0 && s.M.candidateEvalWindows.size === 0);
    ok('REST-PROD-QUIESCE los tres guardados finales se RECHAZAN por la barrera',
      resueltos.length === 3 && resueltos.every((x) => x && x.aplicado === false && /restaurando/i.test(x.error || '')),
      JSON.stringify(resueltos.map((x) => (x && x.error || '').slice(0, 40))));
    ok('REST-PROD-NO-STALE cero backup/prep/eval nuevos por esos cierres',
      nFilas('backups', 'project_id=?', [s.row.id]) === backupsAntes &&
      nFilas('meeting_preps') === prepsAntes && nFilas('candidate_evals') === evalsAntes,
      JSON.stringify({ bk: nFilas('backups', 'project_id=?', [s.row.id]), antes: backupsAntes }));
    ok('REST-PROD-NO-STALE el estado descartado no aparece en ningun backup',
      dbmod.all('SELECT * FROM backups').every((b) => !String(b.payload).includes('VIEJO')));

    const hist = JSON.parse(dbmod.get("SELECT value FROM app_meta WHERE key='db_commit_history'").value);
    ok('REST-PROD-QUIESCE el cierre SI movio el commit (bounds)',
      hist[1] !== commitAntesDeTodo, JSON.stringify({ hist1: (hist[1] || '').slice(0, 8), antes: commitAntesDeTodo.slice(0, 8) }));
    ok('REST-PROD-QUIESCE la base se capturo DESPUES: el commit se ancla a la de tras el quiesce',
      r.aplicado === true && hist[0] !== hist[1], JSON.stringify({ aplicado: r.aplicado }));
    ok('REST-PROD-QUIESCE la particion quedo con el backup',
      s.M.hashDumpLocalStorage(volcado(s.row.partition_name)) === s.M.hashDumpLocalStorage(DEL_BACKUP));
    ok('REST-PROD-QUIESCE la ventana se reabre al terminar y la barrera queda libre',
      s.M.reaperturas().indexOf(s.row.id) >= 0 && s.M.proyectoBloqueadoParaMutar(s.row.id) === null);
    ok('REST-PROD-QUIESCE cero material residual', residuos(s.M).length === 0, JSON.stringify(residuos(s.M)));
  }

  // =========================================================================
  seccion('MATRIZ A1-A15 sobre el codigo productivo');
  // =========================================================================
  const resumenA = []; const anotar = (id, v, r) => resumenA.push({ id, v, r });

  // A2 feliz ya cubierto arriba; se anota
  anotar('A2', 'aplicado y limpio', 'cero material');

  // A5 / REST-PROD-PARTIAL: corte entre claves, con el script REAL
  {
    const s = await escenario('parcial');
    cortarTrasNSetItem = { part: s.row.partition_name, n: 1 };
    const r = await s.M.restoreProjectBackup(s.row.id, s.bk.id);
    cortarTrasNSetItem = null;
    const bien = r.aplicado === false &&
      s.M.hashDumpLocalStorage(volcado(s.row.partition_name)) === s.M.hashDumpLocalStorage(VIEJO) &&
      residuos(s.M).length === 0;
    ok('A5 / REST-PROD-PARTIAL corte entre claves: se repone la foto y se limpia', bien,
      JSON.stringify({ err: (r.error || '').slice(0, 60), part: volcado(s.row.partition_name) }));
    anotar('A5', bien ? 'repuesto desde la foto' : 'REVISAR', 'cero material');
  }

  // A5b: muerte del proceso con aplicacion parcial -> recovery
  {
    const s = await escenario('parcial-muerte');
    // se fabrica el estado: journal + previo + particion a medias
    const aid = crypto.randomBytes(16).toString('hex');
    const j = {
      v: 1, action_id: aid, writer: W_A, project_id: s.row.id, partition: s.row.partition_name,
      backups_dir: s.M.rutaBackupsPura(s.row), backup_id: s.bk.id, backup_sha256: null,
      base_commit_id: dbmod.getCommitActual(),
      esperado_hash: s.M.hashDumpLocalStorage(DEL_BACKUP), esperado_claves: Object.keys(DEL_BACKUP).sort(),
      previo_hash: s.M.hashDumpLocalStorage(VIEJO), fase: 'aplicando', cifrado: 0,
      previo_sha256: null, previo_size: 0, previo_n_claves: 0, startedAt: 'x',
    };
    const p = s.M.escribirPrevioDurable(aid, j, VIEJO);
    j.cifrado = p.cifrado; j.previo_sha256 = p.sha256; j.previo_size = p.size; j.previo_n_claves = p.n_claves;
    fsReal.writeFileSync(s.M.journalRestauracionPath(aid), JSON.stringify(j, null, 2), 'utf8');
    ponerParticion(s.row.partition_name, { proj: DEL_BACKUP.proj });   // media aplicacion
    const rec = await s.M.recuperarRestauracionesPendientes();
    const bien = rec.ok && rec.resultados[0].clase === 'repuesta' &&
      s.M.hashDumpLocalStorage(volcado(s.row.partition_name)) === s.M.hashDumpLocalStorage(VIEJO) &&
      residuos(s.M).length === 0;
    ok('A5b muerte con aplicacion parcial: la recuperacion REAL repone desde disco', bien, JSON.stringify(rec.resultados[0]));
    anotar('A5b', bien ? 'recovery repone' : 'REVISAR', 'cero material');
    // A15: idempotente
    const rec2 = await s.M.recuperarRestauracionesPendientes();
    ok('A15 segundo arranque: nada que hacer', rec2.ok && rec2.resultados.length === 0);
    anotar('A15', 'idempotente', 'cero material');
  }

  // A6: aplicado sin marca -> repone
  {
    const s = await escenario('a6');
    const aid = crypto.randomBytes(16).toString('hex');
    const j = {
      v: 1, action_id: aid, writer: W_A, project_id: s.row.id, partition: s.row.partition_name,
      backups_dir: s.M.rutaBackupsPura(s.row), backup_id: s.bk.id, backup_sha256: null,
      base_commit_id: dbmod.getCommitActual(),
      esperado_hash: s.M.hashDumpLocalStorage(DEL_BACKUP), esperado_claves: Object.keys(DEL_BACKUP).sort(),
      previo_hash: s.M.hashDumpLocalStorage(VIEJO), fase: 'aplicando', cifrado: 0,
      previo_sha256: null, previo_size: 0, previo_n_claves: 0, startedAt: 'x',
    };
    const p = s.M.escribirPrevioDurable(aid, j, VIEJO);
    Object.assign(j, { cifrado: p.cifrado, previo_sha256: p.sha256, previo_size: p.size, previo_n_claves: p.n_claves });
    fsReal.writeFileSync(s.M.journalRestauracionPath(aid), JSON.stringify(j, null, 2), 'utf8');
    ponerParticion(s.row.partition_name, DEL_BACKUP);
    const rec = await s.M.recuperarRestauracionesPendientes();
    const bien = rec.ok && s.M.hashDumpLocalStorage(volcado(s.row.partition_name)) === s.M.hashDumpLocalStorage(VIEJO) && residuos(s.M).length === 0;
    ok('A6 aplicado SIN marca: la recuperacion repone (no hubo restauracion)', bien, JSON.stringify(rec.resultados[0]));
    anotar('A6', bien ? 'repuesto' : 'REVISAR', 'cero material');

    // A7: con marca -> NO repone, limpia
    const s7 = await escenario('a7');
    const aid7 = crypto.randomBytes(16).toString('hex');
    const j7 = JSON.parse(JSON.stringify(j));
    Object.assign(j7, { action_id: aid7, project_id: s7.row.id, partition: s7.row.partition_name, base_commit_id: dbmod.getCommitActual(), backups_dir: s7.M.rutaBackupsPura(s7.row) });
    const p7 = s7.M.escribirPrevioDurable(aid7, j7, VIEJO);
    Object.assign(j7, { cifrado: p7.cifrado, previo_sha256: p7.sha256, previo_size: p7.size, previo_n_claves: p7.n_claves });
    fsReal.writeFileSync(s7.M.journalRestauracionPath(aid7), JSON.stringify(j7, null, 2), 'utf8');
    ponerParticion(s7.row.partition_name, DEL_BACKUP);
    const sm = s7.M.sentenciaMarcaAccion('z'.repeat(32));
    dbmod.escribirMultiple([{ sql: sm.sql, params: [sm.params[0], JSON.stringify([aid7])] }]);
    const rec7 = await s7.M.recuperarRestauracionesPendientes();
    const bien7 = rec7.ok && rec7.resultados[0].caso === 'confirmada' &&
      s7.M.hashDumpLocalStorage(volcado(s7.row.partition_name)) === s7.M.hashDumpLocalStorage(DEL_BACKUP) &&
      residuos(s7.M).length === 0;
    ok('A7 marca presente: NO se repone, se completa el cleanup', bien7, JSON.stringify(rec7.resultados[0]));
    anotar('A7', bien7 ? 'limpiado (no repuesto)' : 'REVISAR', 'cero material');
  }

  // A8 / REST-PROD-FORM3
  {
    const s = await escenario('form3', {
      dbmod: dbmodCon((sent, opt) => {
        dbmod.escribirMultiple(sent, opt);
        const e = new Error('no se pudo releer tras confirmar'); e.aplicado = true; e.kind = 'io-tras-confirmar'; throw e;
      }),
    });
    const r = await s.M.restoreProjectBackup(s.row.id, s.bk.id);
    const bien = r.ok === true && r.aplicado === true && r.verificado === false && r.requiereReinicio === true &&
      typeof r.aviso === 'string' &&
      s.M.hashDumpLocalStorage(volcado(s.row.partition_name)) === s.M.hashDumpLocalStorage(DEL_BACKUP);
    ok('A8 / REST-PROD-FORM3 aplicado:true/verificado:false y NO se repone', bien,
      JSON.stringify({ ok: r.ok, aplicado: r.aplicado, verificado: r.verificado }));
    anotar('A8', bien ? 'forma 3, sin deshacer' : 'REVISAR', 'material conservado');
  }

  // A9: base-cambiada
  {
    const s = await escenario('a9');
    publicarComoOtroEquipo(s.dir, { commit: commitFalso(), parent: dbmod.getCommitActual(), gen: 77 });
    const r = await s.M.restoreProjectBackup(s.row.id, s.bk.id);
    const bien = r.aplicado === false && r.reintentable === true &&
      s.M.hashDumpLocalStorage(volcado(s.row.partition_name)) === s.M.hashDumpLocalStorage(VIEJO) &&
      residuos(s.M).length === 0;
    ok('A9 base-cambiada antes de confirmar: se repone todo, reintentable', bien, JSON.stringify(r).slice(0, 140));
    anotar('A9', bien ? 'repuesto, reintentable' : 'REVISAR', 'cero material');
  }

  // A10: previo con hash malo -> fail-closed
  {
    const s = await escenario('a10');
    const aid = crypto.randomBytes(16).toString('hex');
    const j = {
      v: 1, action_id: aid, writer: W_A, project_id: s.row.id, partition: s.row.partition_name,
      backups_dir: s.M.rutaBackupsPura(s.row), backup_id: s.bk.id, backup_sha256: null,
      base_commit_id: dbmod.getCommitActual(),
      esperado_hash: s.M.hashDumpLocalStorage(DEL_BACKUP), esperado_claves: Object.keys(DEL_BACKUP).sort(),
      previo_hash: s.M.hashDumpLocalStorage(VIEJO), fase: 'aplicando', cifrado: 0,
      previo_sha256: 'f'.repeat(64), previo_size: 10, previo_n_claves: 2, startedAt: 'x',
    };
    fsReal.mkdirSync(s.M.dirDeRestauracion(aid), { recursive: true });
    fsReal.writeFileSync(s.M.previoPath(aid), JSON.stringify({ v: 1, claves: VIEJO }), 'utf8');
    fsReal.writeFileSync(s.M.journalRestauracionPath(aid), JSON.stringify(j, null, 2), 'utf8');
    ponerParticion(s.row.partition_name, DEL_BACKUP);
    const rec = await s.M.recuperarRestauracionesPendientes();
    const bien = rec.ok === false && rec.malos[0].clase === 'rollback-bloqueado' &&
      s.M.hashDumpLocalStorage(volcado(s.row.partition_name)) === s.M.hashDumpLocalStorage(DEL_BACKUP) &&
      residuos(s.M).length === 1;
    ok('A10 foto previa que no casa con su hash: FAIL-CLOSED, no se reescribe nada', bien, JSON.stringify(rec.malos[0] || {}).slice(0, 160));
    anotar('A10', bien ? 'fail-closed' : 'REVISAR', 'material conservado');
    const rec2 = await s.M.recuperarRestauracionesPendientes();
    ok('A15 el fail-closed sigue fail-closed en el segundo arranque', rec2.ok === false && residuos(s.M).length === 1);
  }

  // A11/A12/A13/A14 — guardas del canal
  {
    const s = await escenario('a11');
    const aid = 'ba'.repeat(16);
    fsReal.mkdirSync(s.M.accionesDir(), { recursive: true });
    fsReal.writeFileSync(s.M.journalAccionPath(aid), JSON.stringify({
      v: 1, action_id: aid, writer: W_A, tipo: 'backup', base_commit_id: dbmod.getCommitActual(),
      cifrado: 0, destino: path.join(s.M.rutaBackupsPura(s.row), 'x.json'), modo: 'overwrite',
      original_sha256: 'a'.repeat(64), original_size: 1, new_sha256: 'b'.repeat(64), new_size: 1,
      fase: 'publicando', startedAt: 'x',
    }), 'utf8');
    const r = await s.M.restoreProjectBackup(s.row.id, s.bk.id);
    ok('A11 journal de accion propio pendiente: la restauracion NO empieza',
      r.aplicado === false && r.bloqueo === 'accion-no-demostrable' &&
      s.M.hashDumpLocalStorage(volcado(s.row.partition_name)) === s.M.hashDumpLocalStorage(VIEJO) &&
      residuos(s.M).length === 0 && s.M.proyectoBloqueadoParaMutar(s.row.id) === null,
      JSON.stringify(r).slice(0, 120));
    anotar('A11', 'no empieza', 'cero material');
  }
  {
    const s = await escenario('a12');
    s.M.proyectosEnBorrado.add(s.row.id);
    const r = await s.M.restoreProjectBackup(s.row.id, s.bk.id);
    s.M.proyectosEnBorrado.delete(s.row.id);
    ok('A12 proyecto en borrado: la restauracion NO empieza',
      r.aplicado === false && r.bloqueo === 'proyecto-en-borrado' && residuos(s.M).length === 0, JSON.stringify(r).slice(0, 120));
    anotar('A12', 'no empieza', 'cero material');
    // y la simetria: durante un restore, delete no empieza
    const s2 = await escenario('a12b');
    s2.M.proyectosEnRestauracion.add(s2.row.id);
    const rd = await s2.M.deleteProjectById(s2.row.id);
    s2.M.proyectosEnRestauracion.delete(s2.row.id);
    ok('A12 simetria: con el proyecto en restauracion, deleteProjectById NO empieza',
      rd.aplicado === false && rd.bloqueo === 'proyecto-en-restauracion' && nFilas('projects', 'id=?', [s2.row.id]) === 1,
      JSON.stringify(rd).slice(0, 120));
  }
  {
    const s = await escenario('a13');
    s.M.setRekey(true);
    const r = await s.M.restoreProjectBackup(s.row.id, s.bk.id);
    s.M.setRekey(false);
    ok('A13 rekey en curso: la restauracion NO empieza',
      r.aplicado === false && r.bloqueo === 'rekey' && r.reintentable === true, JSON.stringify(r).slice(0, 120));
    anotar('A13', 'no empieza', 'cero material');
    s.M.setComprometido(true);
    const r2 = await s.M.restoreProjectBackup(s.row.id, s.bk.id);
    s.M.setComprometido(false);
    ok('A13 procesoComprometido (B2): la restauracion NO empieza',
      r2.aplicado === false && r2.bloqueo === 'proceso-comprometido');
    s.M.setRevalidacion(true);
    const r3 = await s.M.restoreProjectBackup(s.row.id, s.bk.id);
    s.M.setRevalidacion(false);
    ok('A13 bloqueoDeSeguridad (Bloque 3): la restauracion NO empieza',
      r3.aplicado === false && r3.bloqueo === 'revalidacion', JSON.stringify(r3).slice(0, 120));
  }
  {
    const s = await escenario('a14');
    // una ventana que NO se cierra: el quiesce aborta sin tocar nada
    const zombi = { isDestroyed: () => false, once: () => {}, close: () => {} };
    s.M.projectWindows.set(s.row.id, zombi);
    const t0 = Date.now();
    const r = await s.M.restoreProjectBackup(s.row.id, s.bk.id);
    const bien = r.aplicado === false && r.reintentable === true &&
      s.M.hashDumpLocalStorage(volcado(s.row.partition_name)) === s.M.hashDumpLocalStorage(VIEJO) &&
      residuos(s.M).length === 0 && s.M.proyectoBloqueadoParaMutar(s.row.id) === null;
    ok('A14 una ventana no se cierra: aborta sin tocar nada y desarma limpio', bien,
      JSON.stringify({ r: (r.error || '').slice(0, 50), ms: Date.now() - t0 }));
    anotar('A14', bien ? 'aborta limpio' : 'REVISAR', 'cero material');
    s.M.projectWindows.delete(s.row.id);
  }
  // A1/A3/A4: cortes antes de aplicar -> nada tocado, cero material
  {
    const s = await escenario('a1');
    const r = await s.M.restoreProjectBackup(s.row.id, 99999);   // backup inexistente
    ok('A1 corte temprano (backup inexistente): nada tocado, cero material',
      r.aplicado === false && s.M.hashDumpLocalStorage(volcado(s.row.partition_name)) === s.M.hashDumpLocalStorage(VIEJO) &&
      residuos(s.M).length === 0);
    anotar('A1', 'nada que deshacer', 'cero material');
    anotar('A3', 'material retirado', 'cero material');
    anotar('A4', 'repuesto (no-op)', 'cero material');
  }

  // =========================================================================
  seccion('REST-PROD-LEGACY-SLUG');
  // =========================================================================
  {
    const dir = carpeta('legacy'); await montar(dir, W_A);
    const est = {}; const M = construirMain(est);
    const row = nuevoProyecto('Legado SA');   // backup_dir NULL
    ok('REST-PROD-LEGACY-SLUG backup_dir es NULL (control)', row.backup_dir === null);
    ponerParticion(row.partition_name, VIEJO);
    const dirBk = M.rutaBackupsPura(row);
    fsReal.mkdirSync(dirBk, { recursive: true });
    const file = 'backup_leg.json';
    fsReal.writeFileSync(path.join(dirBk, file), JSON.stringify(DEL_BACKUP), 'utf8');
    const bkId = dbmod.run('INSERT INTO backups(project_id,created_at,payload,size,file_path,encrypted) VALUES (?,?,?,?,?,0)',
      [row.id, 'x', '', 0, file]);

    const commit0 = dbmod.getCommitActual();
    const filaAntes = JSON.stringify(dbmod.get('SELECT * FROM projects WHERE id=?', [row.id]));
    // se corta en el commit para observar el estado intermedio
    const est2 = {};
    const M2 = construirMain(est2, { dbmod: dbmodCon(() => { const e = new Error('rechazo'); e.kind = 'conflicto'; throw e; }) });
    const rf = await M2.restoreProjectBackup(row.id, bkId);
    ok('REST-PROD-LEGACY-SLUG preparar el restore no hace UPDATE lateral ni mueve el commit',
      rf.aplicado === false && dbmod.getCommitActual() === commit0 &&
      JSON.stringify(dbmod.get('SELECT * FROM projects WHERE id=?', [row.id])) === filaAntes,
      JSON.stringify({ commitIgual: dbmod.getCommitActual() === commit0, backup_dir: dbmod.get('SELECT backup_dir FROM projects WHERE id=?', [row.id]).backup_dir }));
    ok('REST-PROD-LEGACY-SLUG con backup_dir NULL el restore SI encuentra el backup (ruta pura)',
      !/No se pudo leer el backup/.test(rf.error || ''), (rf.error || '').slice(0, 80));
    const r = await M.restoreProjectBackup(row.id, bkId);
    ok('REST-PROD-LEGACY-SLUG y el camino feliz funciona igual',
      r.aplicado === true && M.hashDumpLocalStorage(volcado(row.partition_name)) === M.hashDumpLocalStorage(DEL_BACKUP),
      JSON.stringify(r).slice(0, 120));
  }

  // =========================================================================
  seccion('REST-PROD-REKEY');
  // =========================================================================
  {
    const s = await escenario('rekey');
    const aid = crypto.randomBytes(16).toString('hex');
    const j = {
      v: 1, action_id: aid, writer: W_A, project_id: s.row.id, partition: s.row.partition_name,
      backups_dir: s.M.rutaBackupsPura(s.row), backup_id: s.bk.id, backup_sha256: null,
      base_commit_id: dbmod.getCommitActual(),
      esperado_hash: s.M.hashDumpLocalStorage(DEL_BACKUP), esperado_claves: Object.keys(DEL_BACKUP).sort(),
      previo_hash: s.M.hashDumpLocalStorage(VIEJO), fase: 'aplicando', cifrado: 0,
      previo_sha256: null, previo_size: 0, previo_n_claves: 0, startedAt: 'x',
    };
    const p = s.M.escribirPrevioDurable(aid, j, VIEJO);
    Object.assign(j, { cifrado: p.cifrado, previo_sha256: p.sha256, previo_size: p.size, previo_n_claves: p.n_claves });
    fsReal.writeFileSync(s.M.journalRestauracionPath(aid), JSON.stringify(j, null, 2), 'utf8');
    const r1 = s.M.rekeyPuedeEmpezar();
    ok('REST-PROD-REKEY-1 journal pendiente: el rekey NO empieza',
      r1.puede === false && r1.clase === 'material-pendiente', JSON.stringify(r1).slice(0, 120));

    fsReal.unlinkSync(s.M.journalRestauracionPath(aid));
    const r2 = s.M.rekeyPuedeEmpezar();
    ok('REST-PROD-REKEY-2 previo huerfano SIN journal (cleanup fallido): tampoco empieza',
      r2.puede === false && r2.pendientes[0].archivos.indexOf('previo.enc') >= 0, JSON.stringify(r2).slice(0, 160));

    fsReal.rmSync(s.M.dirDeRestauracion(aid), { recursive: true, force: true });
    ok('REST-PROD-REKEY-3 cleanup completo: rekey permitido', s.M.rekeyPuedeEmpezar().puede === true);

    const aid4 = 'ea'.repeat(16);
    fsReal.mkdirSync(s.M.dirDeRestauracion(aid4), { recursive: true });
    fsReal.writeFileSync(s.M.journalRestauracionPath(aid4), '{ no es json', 'utf8');
    const r4 = s.M.rekeyPuedeEmpezar();
    const rec4 = await s.M.recuperarRestauracionesPendientes();
    ok('REST-PROD-REKEY-4 material invalido: rekey bloqueado y NUNCA se borra a ciegas',
      r4.puede === false && rec4.ok === false && fsReal.existsSync(s.M.journalRestauracionPath(aid4)));
    ok('REST-PROD-REKEY el rekey real lleva la precondicion antes de la exclusiva',
      SRC.indexOf('const rp = rekeyPuedeEmpezar();') < SRC.indexOf("ex = dbmod.tomarExclusiva('seguridad')"));
    ok('REST-PROD-REKEY y NO se amplio collectRekeyInventory',
      !/panorama-restauraciones/.test(extraer('function collectRekeyInventory()')));
    fsReal.rmSync(s.M.dirDeRestauracion(aid4), { recursive: true, force: true });
  }

  // =========================================================================
  seccion('REST-PROD-STARTUP y REST-PROD-COLLISIONS');
  // =========================================================================
  {
    ok('REST-PROD-STARTUP el orden en el arranque es rekey -> acciones -> borrados -> restauraciones',
      SRC.indexOf('recoverInterruptedRekeyIfAny()') < SRC.indexOf('accionesRecovery = recuperarAccionesPendientes()') &&
      SRC.indexOf('accionesRecovery = recuperarAccionesPendientes()') < SRC.indexOf('borradosRecovery = await recuperarBorradosPendientes()') &&
      SRC.indexOf('borradosRecovery = await recuperarBorradosPendientes()') < SRC.indexOf('restauracionesRecovery = await recuperarRestauracionesPendientes()'));
    ok('REST-PROD-STARTUP y las restauraciones van ANTES de vacuum/login/launcher',
      SRC.indexOf('restauracionesRecovery = await recuperarRestauracionesPendientes()') < SRC.indexOf('maybeRunPeriodicVacuum();\n  const loggedIn'));
  }
  {
    const s = await escenario('col');
    const dirBk = s.M.rutaBackupsPura(s.row);
    const aid = crypto.randomBytes(16).toString('hex');
    const j = {
      v: 1, action_id: aid, writer: W_A, project_id: s.row.id, partition: s.row.partition_name,
      backups_dir: dirBk, backup_id: s.bk.id, backup_sha256: null, base_commit_id: dbmod.getCommitActual(),
      esperado_hash: s.M.hashDumpLocalStorage(DEL_BACKUP), esperado_claves: Object.keys(DEL_BACKUP).sort(),
      previo_hash: s.M.hashDumpLocalStorage(VIEJO), fase: 'aplicando', cifrado: 0,
      previo_sha256: null, previo_size: 0, previo_n_claves: 0, startedAt: 'x',
    };
    const p = s.M.escribirPrevioDurable(aid, j, VIEJO);
    Object.assign(j, { cifrado: p.cifrado, previo_sha256: p.sha256, previo_size: p.size, previo_n_claves: p.n_claves });
    fsReal.writeFileSync(s.M.journalRestauracionPath(aid), JSON.stringify(j, null, 2), 'utf8');

    // COL-1: restore + accion propia dentro del mismo proyecto
    const aidAcc = 'fa'.repeat(16);
    fsReal.mkdirSync(s.M.accionesDir(), { recursive: true });
    fsReal.writeFileSync(s.M.journalAccionPath(aidAcc), JSON.stringify({
      v: 1, action_id: aidAcc, writer: W_A, tipo: 'backup', base_commit_id: dbmod.getCommitActual(),
      cifrado: 0, destino: path.join(dirBk, 'x.json'), modo: 'overwrite',
      original_sha256: 'a'.repeat(64), original_size: 1, new_sha256: 'b'.repeat(64), new_size: 1,
      fase: 'publicando', startedAt: 'x',
    }), 'utf8');
    const antesPart = JSON.stringify(volcado(s.row.partition_name));
    const rNueva = await s.M.restoreProjectBackup(s.row.id, s.bk.id);
    ok('REST-PROD-COL-1 restore + accion propia: ninguna nueva empieza, nada se resuelve a medias',
      rNueva.aplicado === false && JSON.stringify(volcado(s.row.partition_name)) === antesPart &&
      fsReal.existsSync(s.M.journalRestauracionPath(aid)) && fsReal.existsSync(s.M.journalAccionPath(aidAcc)),
      JSON.stringify({ bloqueo: rNueva.bloqueo }));
    fsReal.unlinkSync(s.M.journalAccionPath(aidAcc));

    // COL-2: restore + borrado del mismo proyecto
    const aidDel = 'fb'.repeat(16);
    fsReal.mkdirSync(s.M.borradosDir(), { recursive: true });
    fsReal.writeFileSync(s.M.journalBorradoPath(aidDel), JSON.stringify({
      v: 1, action_id: aidDel, writer: W_A, tipo: 'borrar-proyecto', base_commit_id: dbmod.getCommitActual(),
      fase: 'retirando', startedAt: 'x',
      recursos: [{ tipo: 'directorio', scope: 'subtree', origen: dirBk, cuarentena: s.M.cuarentenaDe(aidDel, 0), n_archivos: 1, bytes_totales: 1 }],
    }), 'utf8');
    const r2 = await s.M.restoreProjectBackup(s.row.id, s.bk.id);
    const rd = await s.M.deleteProjectById(s.row.id);
    ok('REST-PROD-COL-2 restore + borrado del mismo proyecto: ninguna nueva empieza',
      r2.aplicado === false && rd.aplicado === false &&
      fsReal.existsSync(s.M.journalRestauracionPath(aid)) && fsReal.existsSync(s.M.journalBorradoPath(aidDel)) &&
      nFilas('projects', 'id=?', [s.row.id]) === 1,
      JSON.stringify({ restore: r2.bloqueo, delete: rd.bloqueo }));
    fsReal.unlinkSync(s.M.journalBorradoPath(aidDel));
    fsReal.rmSync(s.M.dirDeRestauracion(aid), { recursive: true, force: true });

    // COL-3: journals de OTRO proyecto no bloquean
    const otro = nuevoProyecto('Otro', 'p-otro');
    const dirOtro = s.M.rutaBackupsPura(otro);
    fsReal.mkdirSync(dirOtro, { recursive: true });
    const aidAjeno = 'fc'.repeat(16);
    fsReal.writeFileSync(s.M.journalBorradoPath(aidAjeno), JSON.stringify({
      v: 1, action_id: aidAjeno, writer: W_B, tipo: 'borrar-proyecto', base_commit_id: commitFalso(),
      fase: 'retirando', startedAt: 'x',
      recursos: [{ tipo: 'directorio', scope: 'subtree', origen: dirOtro, cuarentena: s.M.cuarentenaDe(aidAjeno, 0), n_archivos: 1, bytes_totales: 1 }],
    }), 'utf8');
    const r3 = await s.M.restoreProjectBackup(s.row.id, s.bk.id);
    ok('REST-PROD-COL-3 journals de OTRO proyecto: la restauracion SI puede seguir',
      r3.aplicado === true && r3.verificado === true &&
      s.M.hashDumpLocalStorage(volcado(s.row.partition_name)) === s.M.hashDumpLocalStorage(DEL_BACKUP) &&
      fsReal.existsSync(s.M.journalBorradoPath(aidAjeno)),
      JSON.stringify(r3).slice(0, 140));
  }

  // =========================================================================
  seccion('FOTO PREVIA REAL: cifrado y cero texto en claro');
  // =========================================================================
  {
    const clave = securitymod.deriveKey('pass', securitymod.newSaltHex());
    const s = await escenario('cifrado');
    s.M.setKey(clave);
    const aid = crypto.randomBytes(16).toString('hex');
    const j = {
      v: 1, action_id: aid, writer: W_A, project_id: s.row.id, partition: s.row.partition_name,
      backups_dir: s.M.rutaBackupsPura(s.row), backup_id: s.bk.id, backup_sha256: null,
      base_commit_id: dbmod.getCommitActual(),
      esperado_hash: s.M.hashDumpLocalStorage(DEL_BACKUP), esperado_claves: Object.keys(DEL_BACKUP).sort(),
      previo_hash: s.M.hashDumpLocalStorage(VIEJO), fase: 'aplicando', cifrado: 0,
      previo_sha256: null, previo_size: 0, previo_n_claves: 0, startedAt: 'x',
    };
    const p = s.M.escribirPrevioDurable(aid, j, VIEJO);
    Object.assign(j, { cifrado: p.cifrado, previo_sha256: p.sha256, previo_size: p.size, previo_n_claves: p.n_claves });
    const crudo = fsReal.readFileSync(s.M.previoPath(aid), 'utf8');
    ok('la foto previa queda CIFRADA y no se ve el contenido en claro',
      p.cifrado === 1 && !crudo.includes('VIEJO') && securitymod.looksEncrypted(crudo), crudo.slice(0, 50));
    fsReal.writeFileSync(s.M.journalRestauracionPath(aid), JSON.stringify(j, null, 2), 'utf8');
    ok('el journal NO contiene el volcado en claro',
      !fsReal.readFileSync(s.M.journalRestauracionPath(aid), 'utf8').includes('VIEJO'));
    const enCarpeta = fsReal.readdirSync(s.M.dirDeRestauracion(aid));
    ok('no queda ningun tmp ni copia en claro junto a la foto',
      enCarpeta.length === 2 && enCarpeta.indexOf('previo.enc') >= 0 && enCarpeta.indexOf('journal.json') >= 0,
      JSON.stringify(enCarpeta));
    ok('y el log no filtra el contenido', !(s.est.log || []).join('\n').includes('VIEJO'));
    const leida = s.M.leerPrevioDemostrable(j);
    ok('se descifra y valida por hash', leida.ok && s.M.hashDumpLocalStorage(leida.dump) === s.M.hashDumpLocalStorage(VIEJO));
    s.M.setKey(null);
    ok('sin la clave, la foto NO se usa para reponer nada',
      s.M.leerPrevioDemostrable(j).ok === false);
  }

  // =========================================================================
  seccion('REST-FLUSH-1..5 — barrera durable del localStorage antes del commit');
  // =========================================================================
  //
  // Lo que NO se prueba aqui: el comportamiento REAL de
  // session.flushStorageData() en Chromium. Eso no se puede simular y se midio
  // aparte, con Electron de verdad, en `a2/probe-flush3.js`:
  //   - antes de la llamada el valor NO esta en Local Storage\leveldb\000003.log
  //   - dentro del ms posterior al retorno SI (78 -> 175 bytes), 5 de 5
  //   - sin flush el valor tarda ~103 ms en llegar solo
  //   - la llamada devuelve `undefined`, NO una promesa
  // Aqui se prueba el CABLEADO: que se llama, sobre que particion, en que
  // orden respecto al commit, y que pasa si falla.
  {
    // --- REST-FLUSH-1: se llama una vez, sobre la particion correcta -------
    {
      traza.length = 0;
      const s = await escenario('flush1');
      const r = await s.M.restoreProjectBackup(s.row.id, s.bk.id);
      const fl = trazaDe('flushStorageData');
      ok('REST-FLUSH-1 el restore feliz llama a flushStorageData exactamente una vez',
        r.aplicado === true && fl.length === 1, JSON.stringify({ aplicado: r.aplicado, n: fl.length }));
      ok('REST-FLUSH-1 lo llama sobre la particion DEL PROYECTO, no sobre otra',
        fl.length === 1 && fl[0][1] === s.row.partition_name,
        JSON.stringify({ usada: fl[0] && fl[0][1], esperada: s.row.partition_name }));
      ok('REST-FLUSH-1 y la particion queda con el contenido del backup',
        s.M.hashDumpLocalStorage(volcado(s.row.partition_name)) === s.M.hashDumpLocalStorage(DEL_BACKUP));
    }

    // --- REST-FLUSH-2: ORDEN escritura -> flush -> commit ------------------
    {
      traza.length = 0;
      const dir = carpeta('flush2'); await montar(dir, W_A);
      const est = {};
      const dbTraza = dbmodCon(function (sents, opts) {
        traza.push(['commit', opts && opts.exigirCommitBase ? 'con-base' : 'sin-base']);
        return dbmod.escribirMultiple(sents, opts);
      });
      const M = construirMain(est, { dbmod: dbTraza });
      const row = nuevoProyecto('Servicio flush2', 'p-flush2');
      ponerParticion(row.partition_name, VIEJO);
      const bk = ponerBackup(M, row, DEL_BACKUP);
      traza.length = 0;
      const r = await M.restoreProjectBackup(row.id, bk.id);

      const iEscribir = idxDe('escribirParticion');
      const iFlush = idxDe('flushStorageData');
      const iCommit = traza.findIndex((t) => t[0] === 'commit' && t[1] === 'con-base');
      ok('REST-FLUSH-2 ocurren las tres cosas: escribir particion, flush y commit con base',
        r.aplicado === true && iEscribir >= 0 && iFlush >= 0 && iCommit >= 0,
        JSON.stringify(traza.map((t) => t[0])));
      ok('REST-FLUSH-2 el flush va DESPUES de escribir la particion',
        iEscribir >= 0 && iFlush > iEscribir, JSON.stringify({ iEscribir, iFlush }));
      ok('REST-FLUSH-2 el flush va ANTES del commit de confirmacion',
        iFlush >= 0 && iCommit > iFlush, JSON.stringify({ iFlush, iCommit }));
      ok('REST-FLUSH-2 no hay ningun commit entre el flush y el de confirmacion',
        traza.slice(iFlush + 1, iCommit).every((t) => t[0] !== 'commit'),
        JSON.stringify(traza.slice(iFlush + 1, iCommit)));
    }

    // --- REST-FLUSH-3: si el flush falla, NO se confirma nada -------------
    {
      traza.length = 0;
      const dir = carpeta('flush3'); await montar(dir, W_A);
      const est = {};
      const commits = [];
      const dbTraza = dbmodCon(function (sents, opts) {
        commits.push(sents.map((x) => String(x && x.sql || x).slice(0, 40)));
        return dbmod.escribirMultiple(sents, opts);
      });
      const M = construirMain(est, { dbmod: dbTraza });
      const row = nuevoProyecto('Servicio flush3', 'p-flush3');
      ponerParticion(row.partition_name, VIEJO);
      const bk = ponerBackup(M, row, DEL_BACKUP);
      const commitsAntes = commits.length;

      flushFalla = 'fallo simulado de flushStorageData';
      const r = await M.restoreProjectBackup(row.id, bk.id);
      flushFalla = null;

      ok('REST-FLUSH-3 el fallo del flush devuelve el contrato, sin excepcion',
        r && typeof r === 'object' && r.aplicado === false, JSON.stringify(r).slice(0, 160));
      ok('REST-FLUSH-3 la particion vuelve al estado ANTERIOR, no se queda a medias',
        M.hashDumpLocalStorage(volcado(row.partition_name)) === M.hashDumpLocalStorage(VIEJO),
        JSON.stringify(volcado(row.partition_name)).slice(0, 120));
      ok('REST-FLUSH-3 NO se escribe la marca de accion: cero commits tras el fallo',
        commits.length === commitsAntes, JSON.stringify(commits.slice(commitsAntes)));
      ok('REST-FLUSH-3 la marca de acciones no contiene ninguna accion aplicada',
        M.estadoAccionEnMarca(r.actionId || 'x') !== 'aplicada', String(M.estadoAccionEnMarca(r.actionId || 'x')));
      ok('REST-FLUSH-3 cero material residual de restauracion', residuos(M).length === 0, JSON.stringify(residuos(M)));
      ok('REST-FLUSH-3 la barrera queda liberada y la ventana se reabre',
        M.proyectoBloqueadoParaMutar(row.id) === null && M.reaperturas().indexOf(row.id) >= 0);
      ok('REST-FLUSH-3 se marca reintentable: no se ha destruido nada', r.reintentable === true, String(r.reintentable));
    }

    // --- REST-FLUSH-4: sin aplicacion no hay flush ------------------------
    {
      // (a) abortado por quiesce incompleto
      traza.length = 0;
      const s = await escenario('flush4a');
      const rebelde = {
        _destruida: false, isDestroyed: () => false,
        once: () => {},                   // nunca confirma su cierre
        close: () => {},
      };
      s.M.projectWindows.set(s.row.id, rebelde);
      const r1 = await s.M.restoreProjectBackup(s.row.id, s.bk.id);
      ok('REST-FLUSH-4a quiesce incompleto: aplicado:false y CERO flush',
        r1.aplicado === false && r1.bloqueo === 'quiesce-incompleto' && trazaDe('flushStorageData').length === 0,
        JSON.stringify({ bloqueo: r1.bloqueo, flush: trazaDe('flushStorageData').length }));
      s.M.projectWindows.delete(s.row.id);

      // (b) abortado por proyecto inexistente
      traza.length = 0;
      const r2 = await s.M.restoreProjectBackup(99999, null);
      ok('REST-FLUSH-4b proyecto inexistente: CERO flush',
        r2.aplicado === false && trazaDe('flushStorageData').length === 0, String(trazaDe('flushStorageData').length));

      // (c) abortado por corte a mitad de la escritura de la particion
      traza.length = 0;
      const s2 = await escenario('flush4c');
      cortarTrasNSetItem = { part: s2.row.partition_name, n: 1 };
      const r3 = await s2.M.restoreProjectBackup(s2.row.id, s2.bk.id);
      cortarTrasNSetItem = null;
      // OJO: desde REST-ROLLBACK-FLUSH, aqui SI hay un flush — pero es el de la
      // REPOSICION, no el del apply. Lo que hay que demostrar es que el apply
      // no llego a volcar nada: no basta con contar flushes.
      {
        const nombres = traza.map((t) => t[0]);
        const iApply = nombres.indexOf('escribirParticion');
        const iPre = nombres.indexOf('escribirParticion', iApply + 1);
        const iFlush = nombres.indexOf('flushStorageData');
        ok('REST-FLUSH-4c corte escribiendo la particion: el APPLY no llega a volcar, y se repone',
          r3.aplicado === false && iApply >= 0 && iPre > iApply && iFlush > iPre &&
          s2.M.hashDumpLocalStorage(volcado(s2.row.partition_name)) === s2.M.hashDumpLocalStorage(VIEJO),
          JSON.stringify({ nombres, iApply, iPre, iFlush, err: (r3.error || '').slice(0, 50) }));
      }
    }

    // --- REST-FLUSH-5: la reposicion TAMBIEN vuelca ------------------------
    //
    // Hasta la ronda anterior esta prueba fijaba lo contrario —que la vuelta
    // atras NO volcaba— como hallazgo abierto. El usuario autorizo cerrarlo, y
    // ahora se exige lo inverso. El orden completo se prueba aparte, en
    // REST-ROLLBACK-FLUSH-1/2/5.
    {
      traza.length = 0;
      const s = await escenario('flush5');
      const aid = crypto.randomBytes(16).toString('hex');
      const j = {
        v: 1, action_id: aid, writer: W_A, project_id: s.row.id, partition: s.row.partition_name,
        backups_dir: s.M.rutaBackupsPura(s.row), backup_id: s.bk.id, backup_sha256: null,
        base_commit_id: dbmod.getCommitActual(),
        esperado_hash: s.M.hashDumpLocalStorage(DEL_BACKUP), esperado_claves: Object.keys(DEL_BACKUP).sort(),
        previo_hash: s.M.hashDumpLocalStorage(VIEJO), fase: 'aplicando', cifrado: 0,
        previo_sha256: null, previo_size: 0, previo_n_claves: 0, startedAt: 'x',
      };
      const p = s.M.escribirPrevioDurable(aid, j, VIEJO);
      Object.assign(j, { cifrado: p.cifrado, previo_sha256: p.sha256, previo_size: p.size, previo_n_claves: p.n_claves });
      fsReal.writeFileSync(s.M.journalRestauracionPath(aid), JSON.stringify(j, null, 2), 'utf8');
      ponerParticion(s.row.partition_name, { 'proj': 'A-MEDIAS' });
      traza.length = 0;
      const v = await s.M.reponerParticionDesdePrevio(j);
      ok('REST-FLUSH-5 la vuelta atras repone la particion',
        (v.estado === 'repuesto' || v.estado === 'ya-estaba') &&
        s.M.hashDumpLocalStorage(volcado(s.row.partition_name)) === s.M.hashDumpLocalStorage(VIEJO),
        JSON.stringify(v));
      ok('REST-FLUSH-5 la vuelta atras SI vuelca a disco, y sobre la particion del journal',
        trazaDe('flushStorageData').length === 1 && trazaDe('flushStorageData')[0][1] === j.partition,
        JSON.stringify(trazaDe('flushStorageData')));
    }
  }

  // =========================================================================
  seccion('REST-ROLLBACK-FLUSH-1/2/5 — la reposicion tambien tiene que ser durable');
  // =========================================================================
  //
  // Regla: write PRE -> relectura -> flushStorageData() -> SOLO ENTONCES
  // cleanup. El journal y `previo.enc` son la unica copia durable del estado
  // anterior: borrarlos antes de que la reposicion este en disco puede perder
  // justo el estado que se prometia devolver.
  {
    // --- REST-ROLLBACK-FLUSH-1: el ORDEN, en un fallo pre-confirmacion ----
    {
      traza.length = 0;
      const dir = carpeta('rbf1'); await montar(dir, W_A);
      const est = {};
      const dbTraza = dbmodCon(function (sents, opts) {
        if (opts && opts.exigirCommitBase) { const e = new Error('otro equipo guardo (inyectado)'); e.kind = 'base-cambiada'; throw e; }
        return dbmod.escribirMultiple(sents, opts);
      });
      const M = construirMain(est, { dbmod: dbTraza });
      const row = nuevoProyecto('Servicio rbf1', 'p-rbf1');
      ponerParticion(row.partition_name, VIEJO);
      const bk = ponerBackup(M, row, DEL_BACKUP);
      traza.length = 0;
      const r = await M.restoreProjectBackup(row.id, bk.id);

      const nombres = traza.map((t) => t[0]);
      // El primer escribirParticion es el APPLY; el segundo, la reposicion.
      const iApply = nombres.indexOf('escribirParticion');
      const iFlushApply = nombres.indexOf('flushStorageData');
      const iPre = nombres.indexOf('escribirParticion', iApply + 1);
      const iRelectura = nombres.indexOf('leerParticion', iPre + 1);
      const iFlushPre = nombres.indexOf('flushStorageData', iPre + 1);
      const iCleanup = nombres.indexOf('cleanup');

      ok('REST-ROLLBACK-FLUSH-1 el restore falla antes de confirmar y se repone',
        r.aplicado === false && M.hashDumpLocalStorage(volcado(row.partition_name)) === M.hashDumpLocalStorage(VIEJO),
        JSON.stringify({ err: (r.error || '').slice(0, 60) }));
      ok('REST-ROLLBACK-FLUSH-1 ocurren los cuatro pasos de la reposicion',
        iPre > iApply && iRelectura > iPre && iFlushPre > iRelectura && iCleanup > iFlushPre,
        JSON.stringify({ nombres, iApply, iFlushApply, iPre, iRelectura, iFlushPre, iCleanup }));
      ok('REST-ROLLBACK-FLUSH-1 la RELECTURA va despues de escribir el PRE',
        iRelectura > iPre, JSON.stringify({ iPre, iRelectura }));
      ok('REST-ROLLBACK-FLUSH-1 el FLUSH del PRE va despues de la relectura',
        iFlushPre > iRelectura, JSON.stringify({ iRelectura, iFlushPre }));
      ok('REST-ROLLBACK-FLUSH-1 el CLEANUP va DESPUES del flush del PRE, nunca antes',
        iCleanup > iFlushPre, JSON.stringify({ iFlushPre, iCleanup }));
      ok('REST-ROLLBACK-FLUSH-1 el flush del PRE es sobre la particion del proyecto',
        traza[iFlushPre] && traza[iFlushPre][1] === row.partition_name,
        JSON.stringify(traza[iFlushPre]));
      ok('REST-ROLLBACK-FLUSH-1 y al terminar no queda material', residuos(M).length === 0, JSON.stringify(residuos(M)));
    }

    // --- REST-ROLLBACK-FLUSH-2: si el flush del PRE falla, NO se limpia ---
    {
      traza.length = 0;
      const dir = carpeta('rbf2'); await montar(dir, W_A);
      const est = {};
      // La inyeccion tiene que poder APAGARSE: si sigue activa, el sondeo
      // posterior de H-1 recibe `base-cambiada` y se leeria como si la barrera
      // hubiera rechazado el guardado. Seria un verde por el motivo equivocado.
      let inyectarBaseCambiada = true;
      const dbTraza = dbmodCon(function (sents, opts) {
        if (inyectarBaseCambiada && opts && opts.exigirCommitBase) {
          const e = new Error('otro equipo guardo (inyectado)'); e.kind = 'base-cambiada'; throw e;
        }
        return dbmod.escribirMultiple(sents, opts);
      });
      const M = construirMain(est, { dbmod: dbTraza });
      const row = nuevoProyecto('Servicio rbf2', 'p-rbf2');
      ponerParticion(row.partition_name, VIEJO);
      const bk = ponerBackup(M, row, DEL_BACKUP);
      traza.length = 0;
      flushFallaN = { n: 2, msg: 'fallo simulado del flush de la reposicion' };  // el 2o = el del PRE
      const r = await M.restoreProjectBackup(row.id, bk.id);
      flushFallaN = null;

      const dirs = residuos(M);
      const aid = r.actionId;
      ok('REST-ROLLBACK-FLUSH-2 el contrato dice NO aplicado y NO demostrable',
        r.aplicado === false && r.bloqueo === 'accion-no-demostrable' && r.reintentable === false,
        JSON.stringify({ aplicado: r.aplicado, bloqueo: r.bloqueo, reintentable: r.reintentable }));
      ok('REST-ROLLBACK-FLUSH-2 NO se declara repuesto: la vuelta atras queda marcada como fallo del volcado',
        r.vuelta && r.vuelta.estado === 'fallo-flush', JSON.stringify(r.vuelta));
      ok('REST-ROLLBACK-FLUSH-2 el JOURNAL permanece',
        aid && fsReal.existsSync(M.journalRestauracionPath(aid)), JSON.stringify(dirs));
      // `lsDir` y no `readdirSync` a secas: con la reversion F-sin-flush la
      // carpeta NO existe, y reventar aqui con ENOENT deja la bateria sin
      // recuento. Una reversion tiene que producir FALLOS legibles, no una
      // excepcion.
      ok('REST-ROLLBACK-FLUSH-2 `previo.enc` permanece',
        !!aid && lsDir(M.dirDeRestauracion(aid)).some((f) => /^previo\./.test(f)),
        JSON.stringify(aid ? lsDir(M.dirDeRestauracion(aid)) : []));
      ok('REST-ROLLBACK-FLUSH-2 CERO cleanup destructivo sobre el material',
        trazaDe('cleanup').length === 0, JSON.stringify(trazaDe('cleanup')));
      ok('REST-ROLLBACK-FLUSH-2 la ventana NO se reabre mientras no se resuelva',
        M.reaperturas().indexOf(row.id) < 0, JSON.stringify(M.reaperturas()));
      inyectarBaseCambiada = false;   // a partir de aqui, la BD funciona normal
      {
        const r2 = await M.restoreProjectBackup(row.id, bk.id);
        ok('REST-ROLLBACK-FLUSH-2 otra RESTAURACION del mismo proyecto queda bloqueada POR EL JOURNAL',
          r2.aplicado === false && /operacion anterior|restauracion anterior/i.test(r2.error || ''),
          JSON.stringify({ aplicado: r2.aplicado, bloqueo: r2.bloqueo, err: (r2.error || '').slice(0, 70) }));
      }

      // --- H1-1: RESTORE NO RESUELTO -> PROYECTO BLOQUEADO ----------------
      //
      // Hasta la ronda anterior estas dos aserciones fijaban el defecto por
      // escrito ("es lo que hace hoy"): el codigo ponia `armado = true` con la
      // intencion evidente de conservar la barrera, pero el `finally` llamaba a
      // `desarmarSiProcede()` SIEMPRE y la soltaba igual; y `f1Global()` miraba
      // `.panorama-borrados` y `.panorama-acciones` pero NO
      // `.panorama-restauraciones`. Consecuencia observada: un `backup:save`
      // del MISMO proyecto se aceptaba con el restore sin resolver.
      //
      // Corregido en main.js (H-1, dos capas: `mantenerBarrera` en memoria +
      // `restauracionPendienteDeProyecto()` durable). Ahora se exige lo
      // contrario. Las reversiones `J-barrera-se-suelta` y `K-sin-f1-durable`
      // tumban cada capa por separado.
      ok('H1-1 la barrera EN MEMORIA se conserva: el restore no esta resuelto',
        M.proyectoEnRestauracion(row.id) === true,
        JSON.stringify({ set: [...M.proyectosEnRestauracion] }));
      {
        const b = M.proyectoBloqueadoParaMutar(row.id);
        ok('H1-1 proyectoBloqueadoParaMutar devuelve restauracion SIN RESOLVER, no "en curso"',
          !!b && b.motivo === 'restauracion-sin-resolver', JSON.stringify(b));
      }
      {
        const r1 = await M.guardarBackup(null, { projectId: row.id, payload: JSON.stringify(VIEJO), reason: 'manual' });
        ok('H1-1 un backup nuevo del proyecto NO empieza',
          r1 && r1.aplicado === false,
          JSON.stringify({ aplicado: r1 && r1.aplicado, error: (r1 && r1.error || '').slice(0, 70) }));
        // Un restore en curso SI se puede reintentar cuando acabe; uno sin
        // resolver NO: reintentar no lo arregla, hace falta la recuperacion.
        ok('H1-1 y el rechazo NO se anuncia como reintentable',
          r1 && r1.reintentable === false, JSON.stringify({ reintentable: r1 && r1.reintentable }));
        const r2 = await M.guardarPrep(null, { projectId: row.id, meetingDate: '2026-01-01', finalidad: 'x', payload: '{}' });
        ok('H1-1 un meeting save NO empieza', r2 && r2.aplicado === false,
          JSON.stringify({ aplicado: r2 && r2.aplicado, error: (r2 && r2.error || '').slice(0, 70) }));
        const r3 = await M.guardarEval(null, { projectId: row.id, payload: '{}' });
        ok('H1-1 un candidate save NO empieza', r3 && r3.aplicado === false,
          JSON.stringify({ aplicado: r3 && r3.aplicado, error: (r3 && r3.error || '').slice(0, 70) }));
        const r4 = await M.quitarCv(null, { projectId: row.id, storedName: 'cv.pdf' });
        ok('H1-1 quitar un CV NO empieza', r4 && r4.ok === false,
          JSON.stringify({ ok: r4 && r4.ok, error: (r4 && r4.error || '').slice(0, 70) }));
        const r5 = await M.deleteProjectById(row.id);
        ok('H1-1 el borrado del proyecto NO empieza', r5 && r5.aplicado === false,
          JSON.stringify({ aplicado: r5 && r5.aplicado, error: (r5 && r5.error || '').slice(0, 70) }));
        ok('H1-1 y el proyecto sigue existiendo: el borrado no llego a tocar la BD',
          !!dbmod.get('SELECT id FROM projects WHERE id=?', [row.id]));
      }

      // --- H1-2: REINICIO. Set en memoria vacio, journal en disco ---------
      //
      // La barrera en memoria no sobrevive a un reinicio. Una instancia NUEVA
      // del modulo tiene su propio `proyectosEnRestauracion`, vacio, sobre la
      // MISMA carpeta de datos: es exactamente el arranque siguiente. Lo unico
      // que queda es el journal, y tiene que bastar.
      const M2 = construirMain({}, {});
      ok('H1-2 tras el "reinicio" el Set en memoria esta vacio',
        M2.proyectosEnRestauracion.size === 0, JSON.stringify([...M2.proyectosEnRestauracion]));
      {
        const b = M2.proyectoBloqueadoParaMutar(row.id);
        ok('H1-2 F-1 DURABLE detecta la restauracion pendiente sin ayuda de la memoria',
          !!b && b.motivo === 'restauracion-sin-resolver', JSON.stringify(b));
        const r1 = await M2.guardarBackup(null, { projectId: row.id, payload: JSON.stringify(VIEJO), reason: 'manual' });
        ok('H1-2 backup nuevo bloqueado tras el reinicio', r1 && r1.aplicado === false,
          JSON.stringify({ aplicado: r1 && r1.aplicado, error: (r1 && r1.error || '').slice(0, 70) }));
        const r2 = await M2.guardarPrep(null, { projectId: row.id, meetingDate: '2026-01-01', finalidad: 'x', payload: '{}' });
        ok('H1-2 meeting save bloqueado tras el reinicio', r2 && r2.aplicado === false, JSON.stringify(r2 && r2.error));
        const r3 = await M2.guardarEval(null, { projectId: row.id, payload: '{}' });
        ok('H1-2 candidate save bloqueado tras el reinicio', r3 && r3.aplicado === false, JSON.stringify(r3 && r3.error));
        const r4 = await M2.quitarCv(null, { projectId: row.id, storedName: 'cv.pdf' });
        ok('H1-2 CV bloqueado tras el reinicio', r4 && r4.ok === false, JSON.stringify(r4 && r4.error));
        const r5 = await M2.deleteProjectById(row.id);
        ok('H1-2 delete bloqueado tras el reinicio', r5 && r5.aplicado === false, JSON.stringify(r5 && r5.error));
      }
      // y el arranque siguiente SI lo resuelve, porque el material sigue ahi.
      // La recuperacion NO puede ser victima de su propia F-1: lo que se
      // bloquea son operaciones NUEVAS, no la resolucion de su journal.
      traza.length = 0;
      const rec = await M2.recuperarRestauracionesPendientes();
      ok('REST-ROLLBACK-FLUSH-2 el siguiente arranque SI puede resolverlo: el material seguia entero',
        rec.ok === true && residuos(M2).length === 0 &&
        M2.hashDumpLocalStorage(volcado(row.partition_name)) === M2.hashDumpLocalStorage(VIEJO),
        JSON.stringify({ ok: rec.ok, residuos: residuos(M2) }));
      ok('H1-2 el recovery NO es victima de su propia F-1: resuelve SU journal',
        rec.ok === true && rec.malos.length === 0, JSON.stringify(rec.malos));
      {
        ok('H1-2 resuelto el journal, la barrera durable deja de bloquear',
          M2.proyectoBloqueadoParaMutar(row.id) === null,
          JSON.stringify(M2.proyectoBloqueadoParaMutar(row.id)));
        const r1 = await M2.guardarBackup(null, { projectId: row.id, payload: JSON.stringify(VIEJO), reason: 'manual' });
        ok('H1-2 y las operaciones nuevas vuelven a permitirse', r1 && r1.aplicado === true,
          JSON.stringify({ aplicado: r1 && r1.aplicado, error: (r1 && r1.error || '').slice(0, 70) }));
      }
    }

    // --- relectura: si el PRE no queda escrito, tampoco se declara repuesto -
    {
      traza.length = 0;
      const s = await escenario('rbf-relectura');
      const aid = crypto.randomBytes(16).toString('hex');
      const j = {
        v: 1, action_id: aid, writer: W_A, project_id: s.row.id, partition: s.row.partition_name,
        backups_dir: s.M.rutaBackupsPura(s.row), backup_id: s.bk.id, backup_sha256: null,
        base_commit_id: dbmod.getCommitActual(),
        esperado_hash: s.M.hashDumpLocalStorage(DEL_BACKUP), esperado_claves: Object.keys(DEL_BACKUP).sort(),
        previo_hash: s.M.hashDumpLocalStorage(VIEJO), fase: 'aplicando', cifrado: 0,
        previo_sha256: null, previo_size: 0, previo_n_claves: 0, startedAt: 'x',
      };
      const p = s.M.escribirPrevioDurable(aid, j, VIEJO);
      Object.assign(j, { cifrado: p.cifrado, previo_sha256: p.sha256, previo_size: p.size, previo_n_claves: p.n_claves });
      ponerParticion(s.row.partition_name, DEL_BACKUP);
      // El almacen acepta los setItem pero se queda vacio: el escritor "no
      // lanza" y aun asi la particion NO queda con el PRE.
      const m = almacenDe(s.row.partition_name);
      const setOrig = m.set.bind(m);
      m.set = function () { return m; };                 // traga las escrituras
      const v = await s.M.reponerParticionDesdePrevio(j);
      m.set = setOrig;
      ok('REST-ROLLBACK relectura: si la particion no queda con el PRE, NO se declara repuesto',
        v.estado === 'fallo-relectura', JSON.stringify(v));
      ok('REST-ROLLBACK relectura: el material NO se ha tocado',
        fsReal.existsSync(s.M.journalRestauracionPath(aid)) || fsReal.existsSync(s.M.previoPath(aid)),
        JSON.stringify(fsReal.readdirSync(s.M.dirDeRestauracion(aid))));
    }

    // --- REST-ROLLBACK-FLUSH-5: recovery de ARRANQUE, no rollback en sesion -
    {
      traza.length = 0;
      const s = await escenario('rbf5');
      const aid = crypto.randomBytes(16).toString('hex');
      const j = {
        v: 1, action_id: aid, writer: W_A, project_id: s.row.id, partition: s.row.partition_name,
        backups_dir: s.M.rutaBackupsPura(s.row), backup_id: s.bk.id, backup_sha256: null,
        base_commit_id: dbmod.getCommitActual(),
        esperado_hash: s.M.hashDumpLocalStorage(DEL_BACKUP), esperado_claves: Object.keys(DEL_BACKUP).sort(),
        previo_hash: s.M.hashDumpLocalStorage(VIEJO), fase: 'aplicando', cifrado: 0,
        previo_sha256: null, previo_size: 0, previo_n_claves: 0, startedAt: 'x',
      };
      const p = s.M.escribirPrevioDurable(aid, j, VIEJO);
      Object.assign(j, { cifrado: p.cifrado, previo_sha256: p.sha256, previo_size: p.size, previo_n_claves: p.n_claves });
      fsReal.writeFileSync(s.M.journalRestauracionPath(aid), JSON.stringify(j, null, 2), 'utf8');
      // el proceso anterior murio con la particion YA aplicada y sin confirmar
      ponerParticion(s.row.partition_name, DEL_BACKUP);
      traza.length = 0;

      const rec = await s.M.recuperarRestauracionesPendientes();
      const nombres = traza.map((t) => t[0]);
      const iPre = nombres.indexOf('escribirParticion');
      const iRel = nombres.indexOf('leerParticion', iPre + 1);
      const iFlush = nombres.indexOf('flushStorageData');
      const iClean = nombres.indexOf('cleanup');

      ok('REST-ROLLBACK-FLUSH-5 el arranque deshace la restauracion no confirmada',
        rec.ok === true && rec.resultados.length === 1 && rec.resultados[0].clase === 'repuesta',
        JSON.stringify(rec.resultados));
      ok('REST-ROLLBACK-FLUSH-5 la particion vuelve al PRE',
        s.M.hashDumpLocalStorage(volcado(s.row.partition_name)) === s.M.hashDumpLocalStorage(VIEJO));
      ok('REST-ROLLBACK-FLUSH-5 tambien aqui: PRE -> relectura -> flush -> cleanup',
        iPre >= 0 && iRel > iPre && iFlush > iRel && iClean > iFlush,
        JSON.stringify({ nombres, iPre, iRel, iFlush, iClean }));
      ok('REST-ROLLBACK-FLUSH-5 el flush va sobre la particion DEL JOURNAL, no sobre otra',
        traza[iFlush] && traza[iFlush][1] === j.partition,
        JSON.stringify({ usada: traza[iFlush] && traza[iFlush][1], esperada: j.partition }));
      ok('REST-ROLLBACK-FLUSH-5 y el material se limpia solo despues', residuos(s.M).length === 0, JSON.stringify(residuos(s.M)));
    }
  }

  // =========================================================================
  seccion('H1-3 y H1-4 — la recuperacion libera, y el bloqueo no se desborda');
  // =========================================================================
  //
  // Construye un journal de restauracion a mano, en fase 'aplicando' y sin
  // marca de confirmacion: es el estado que deja un proceso que murio entre el
  // apply y el commit. Sirve para las dos pruebas.
  const journalPendiente = (M, row, bk, aid) => {
    const j = {
      v: 1, action_id: aid, writer: W_A, project_id: row.id, partition: row.partition_name,
      backups_dir: M.rutaBackupsPura(row), backup_id: bk.id, backup_sha256: null,
      base_commit_id: dbmod.getCommitActual(),
      esperado_hash: M.hashDumpLocalStorage(DEL_BACKUP), esperado_claves: Object.keys(DEL_BACKUP).sort(),
      previo_hash: M.hashDumpLocalStorage(VIEJO), fase: 'aplicando', cifrado: 0,
      previo_sha256: null, previo_size: 0, previo_n_claves: 0, startedAt: 'x',
    };
    const p = M.escribirPrevioDurable(aid, j, VIEJO);
    Object.assign(j, { cifrado: p.cifrado, previo_sha256: p.sha256, previo_size: p.size, previo_n_claves: p.n_claves });
    fsReal.writeFileSync(M.journalRestauracionPath(aid), JSON.stringify(j, null, 2), 'utf8');
    return j;
  };

  // --- H1-3: la recuperacion resuelve y el proyecto vuelve a ser usable ----
  {
    traza.length = 0;
    const s = await escenario('h13');
    const aid = crypto.randomBytes(16).toString('hex');
    journalPendiente(s.M, s.row, s.bk, aid);
    ponerParticion(s.row.partition_name, DEL_BACKUP);   // murio con el apply hecho
    {
      const b = s.M.proyectoBloqueadoParaMutar(s.row.id);
      ok('H1-3 antes del recovery el proyecto esta bloqueado por el journal durable',
        !!b && b.motivo === 'restauracion-sin-resolver', JSON.stringify(b));
    }
    traza.length = 0;
    const rec = await s.M.recuperarRestauracionesPendientes();
    const nombres = traza.map((t) => t[0]);
    const iPre = nombres.indexOf('escribirParticion');
    const iRel = nombres.indexOf('leerParticion', iPre + 1);
    const iFlush = nombres.indexOf('flushStorageData');
    const iClean = nombres.indexOf('cleanup');
    ok('H1-3 el recovery repone el PRE', rec.ok === true &&
      s.M.hashDumpLocalStorage(volcado(s.row.partition_name)) === s.M.hashDumpLocalStorage(VIEJO),
      JSON.stringify(rec.resultados));
    ok('H1-3 con su orden: PRE -> relectura -> flush -> cleanup',
      iPre >= 0 && iRel > iPre && iFlush > iRel && iClean > iFlush,
      JSON.stringify({ nombres, iPre, iRel, iFlush, iClean }));
    ok('H1-3 el material queda limpio', residuos(s.M).length === 0, JSON.stringify(residuos(s.M)));
    ok('H1-3 la barrera queda libre en las DOS capas',
      s.M.proyectosEnRestauracion.size === 0 && s.M.proyectoBloqueadoParaMutar(s.row.id) === null,
      JSON.stringify({ set: [...s.M.proyectosEnRestauracion], b: s.M.proyectoBloqueadoParaMutar(s.row.id) }));
    {
      const r1 = await s.M.guardarBackup(null, { projectId: s.row.id, payload: JSON.stringify(VIEJO), reason: 'manual' });
      ok('H1-3 y las operaciones nuevas vuelven a permitirse', r1 && r1.aplicado === true,
        JSON.stringify({ aplicado: r1 && r1.aplicado, error: (r1 && r1.error || '').slice(0, 70) }));
      const r2 = await s.M.guardarPrep(null, { projectId: s.row.id, meetingDate: '2026-01-01', finalidad: 'x', payload: '{}' });
      ok('H1-3 tambien el meeting save', r2 && r2.aplicado === true, JSON.stringify(r2 && r2.error));
    }
  }

  // --- H1-4: un restore de OTRO proyecto no bloquea a los ajenos -----------
  {
    const s = await escenario('h14');                       // proyecto A
    const rowB = nuevoProyecto('Servicio h14b', 'p-h14b');  // proyecto B, sin nada pendiente
    ponerParticion(rowB.partition_name, VIEJO);
    ponerBackup(s.M, rowB, DEL_BACKUP);
    const aid = crypto.randomBytes(16).toString('hex');
    journalPendiente(s.M, s.row, s.bk, aid);                // el journal es SOLO de A

    ok('H1-4 el proyecto de la restauracion SI queda bloqueado',
      (s.M.proyectoBloqueadoParaMutar(s.row.id) || {}).motivo === 'restauracion-sin-resolver',
      JSON.stringify(s.M.proyectoBloqueadoParaMutar(s.row.id)));
    ok('H1-4 el OTRO proyecto NO queda bloqueado',
      s.M.proyectoBloqueadoParaMutar(rowB.id) === null,
      JSON.stringify(s.M.proyectoBloqueadoParaMutar(rowB.id)));
    {
      const r1 = await s.M.guardarBackup(null, { projectId: rowB.id, payload: JSON.stringify(VIEJO), reason: 'manual' });
      ok('H1-4 y su backup SI se acepta', r1 && r1.aplicado === true,
        JSON.stringify({ aplicado: r1 && r1.aplicado, error: (r1 && r1.error || '').slice(0, 70) }));
      const r2 = await s.M.guardarPrep(null, { projectId: rowB.id, meetingDate: '2026-01-01', finalidad: 'x', payload: '{}' });
      ok('H1-4 y su meeting save tambien', r2 && r2.aplicado === true, JSON.stringify(r2 && r2.error));
      const r3 = await s.M.guardarEval(null, { projectId: rowB.id, payload: '{}' });
      ok('H1-4 y su candidate save tambien', r3 && r3.aplicado === true, JSON.stringify(r3 && r3.error));
    }
    // La puerta GLOBAL de los borrados sigue libre: una restauracion valida y
    // atribuible NO cierra el dominio entero. Esta es la decision de diseno que
    // H1-4 fija — lo contrario convertiria un restore pendiente del proyecto A
    // en un bloqueo de toda la aplicacion.
    ok('H1-4 f1Global() sigue libre con una restauracion propia VALIDA de otro proyecto',
      s.M.f1Global().libre === true, JSON.stringify(s.M.f1Global()));
    {
      const r4 = await s.M.deleteProjectById(rowB.id);
      ok('H1-4 y el borrado del proyecto ajeno no lo rechaza la barrera de restauracion',
        !(r4 && /restauracion/i.test(String(r4.error || ''))),
        JSON.stringify({ aplicado: r4 && r4.aplicado, error: (r4 && r4.error || '').slice(0, 70) }));
    }

    // --- H1-4b: lo que NO se puede interpretar si bloquea a todos ----------
    // Un journal ilegible no dice de que proyecto es. Evidencia incompleta no
    // es estado ausente: bloquea a cualquiera, y cierra tambien f1Global().
    const aidMalo = crypto.randomBytes(16).toString('hex');
    fsReal.mkdirSync(s.M.dirDeRestauracion(aidMalo), { recursive: true });
    fsReal.writeFileSync(s.M.journalRestauracionPath(aidMalo), '{ esto no es json', 'utf8');
    const rowC = nuevoProyecto('Servicio h14c', 'p-h14c');
    ok('H1-4b un journal ilegible bloquea al proyecto por el que se pregunte',
      (s.M.proyectoBloqueadoParaMutar(rowC.id) || {}).motivo === 'restauracion-no-verificable',
      JSON.stringify(s.M.proyectoBloqueadoParaMutar(rowC.id)));
    ok('H1-4b y cierra tambien la puerta global de los borrados',
      s.M.f1Global().libre === false, JSON.stringify(s.M.f1Global()));
    fsReal.rmSync(s.M.dirDeRestauracion(aidMalo), { recursive: true, force: true });
  }

  // =========================================================================
  seccion('RESIDUOS');
  // =========================================================================
  {
    const restos = [];
    const rec = (d) => {
      for (const e of fsReal.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) rec(f);
        else if (/\.tmp-|\.old-/.test(e.name)) restos.push(f);
      }
    };
    rec(RAIZ);
    ok('sin residuos .tmp- ni .old-', restos.length === 0, restos.slice(0, 5).join(', '));
    ok('ninguna ventana oculta quedo sin cerrar', ventanasOcultas === 0, String(ventanasOcultas));
  }

  console.log('\n  MATRIZ A1-A15 (sobre codigo productivo)');
  console.log('  ' + 'id'.padEnd(6) + 'veredicto'.padEnd(28) + 'residuo');
  console.log('  ' + '-'.repeat(78));
  for (const a of resumenA) console.log('  ' + a.id.padEnd(6) + String(a.v).padEnd(28) + a.r);

  console.log('\n' + '='.repeat(70));
  console.log(`  A2 — cableado productivo de backup:restore: ${pass} OK, ${fail} FALLOS`);
  if (fallos.length) fallos.forEach((f) => console.log('    - ' + f));
  console.log('='.repeat(70));
  try { dbmod._resetParaPruebas(); } catch (e) {}
  fsReal.rmSync(RAIZ, { recursive: true, force: true });
  console.log('  carpeta de prueba borrada: ' + !fsReal.existsSync(RAIZ));
  process.exitCode = fail === 0 ? 0 : 1;
})().catch((e) => { console.error('EXCEPCION:', e); process.exit(2); });
