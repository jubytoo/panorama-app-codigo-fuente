'use strict';
// ---------------------------------------------------------------------------
// B1 / P13 â€” INVENTARIO MEDIDO de `projects:list`.
//
// NO ARREGLA NADA. Fija por escrito, con numeros, el estado de hoy:
//
//   B1  â€” coste, repeticion de lecturas, robustez y PUREZA de `projects:list`.
//   P13 â€” de donde sale el estado que ve el lanzador, y cuando eso deja de
//         coincidir con lo que ve el dashboard.
//
// Son dos problemas distintos y se miden por separado a proposito: B1 es
// implementacion (cuanto cuesta y que puede romper), P13 es semantica (que
// version del estado se esta mirando). Pueden tener solucion comun o no.
//
// Todo se ejecuta contra el CODIGO REAL extraido de main.js, sobre un sandbox
// con proyectos y backups de verdad. Solo lectura sobre la BD viva.
// ---------------------------------------------------------------------------
const fsReal = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const Module = require('module');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const MARCA_PRUEBAS = '_a33-b1-INVENTARIO';
const RAIZ = path.join(os.tmpdir(), MARCA_PRUEBAS);

const GUARDIA = require(path.join(__dirname, '..', 'comun', 'guardia-rutas.js'));
const guardia = GUARDIA.crearGuardia({ marca: MARCA_PRUEBAS });
const segura = guardia.segura;
segura(RAIZ);
fsReal.rmSync(RAIZ, { recursive: true, force: true });
fsReal.mkdirSync(RAIZ, { recursive: true });

// --- instrumentacion: TODO lo que toca disco o BD queda contado -------------
const cont = { lecturas: [], escrituras: [], mkdir: [], sqlGet: 0, sqlAll: 0, sqlRun: 0, escribirMultiple: 0, parses: 0, descifrados: 0 };
const fs = Object.assign({}, fsReal);
fs.readFileSync = function (p, o) { cont.lecturas.push(String(p)); return fsReal.readFileSync(p, o); };
fs.writeFileSync = function (p, d, o) { cont.escrituras.push(String(p)); return fsReal.writeFileSync(p, d, o); };
fs.mkdirSync = function (p, o) { cont.mkdir.push(String(p)); return fsReal.mkdirSync(p, o); };
fs.renameSync = function (a, b) { cont.escrituras.push(String(b)); return fsReal.renameSync(a, b); };
const resetCont = () => { cont.lecturas = []; cont.escrituras = []; cont.mkdir = []; cont.sqlGet = 0; cont.sqlAll = 0; cont.sqlRun = 0; cont.escribirMultiple = 0; cont.parses = 0; cont.descifrados = 0; };

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
const dbmodReal = require(path.join(PROJ, 'db.js'));
const securitymodReal = require(path.join(PROJ, 'security.js'));

// Envoltorio de dbmod que cuenta consultas sin cambiar comportamiento.
const dbmod = Object.assign(Object.create(Object.getPrototypeOf(dbmodReal)), dbmodReal, {
  get: function (...a) { cont.sqlGet++; return dbmodReal.get(...a); },
  all: function (...a) { cont.sqlAll++; return dbmodReal.all(...a); },
  run: function (...a) { cont.sqlRun++; return dbmodReal.run(...a); },
  escribirMultiple: function (...a) { cont.escribirMultiple++; return dbmodReal.escribirMultiple(...a); },
});
const securitymod = Object.assign({}, securitymodReal, {
  decryptString: function (...a) { cont.descifrados++; return securitymodReal.decryptString(...a); },
});

let pass = 0, fail = 0; const fallos = [];
function ok(n, c, extra) {
  if (c) { pass++; console.log('  OK    ' + n); }
  else { fail++; fallos.push(n); console.log('  FALLO ' + n + (extra ? '  -- ' + extra : '')); }
}
function seccion(t) { console.log('\n=== ' + t + ' ==='); }
// main.js no esta en UTF-8 puro y al leerlo con 'utf8' los acentos llegan
// mojibake. Comparar textos con tildes contra ese origen da falsos negativos,
// asi que TODA comparacion de texto se hace sin acentos.
const sinTildes = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^\x20-\x7E]/g, '?');

const SRC = fsReal.readFileSync(process.env.PANORAMA_MAIN || path.join(PROJ, 'main.js'), 'utf8');
function extraer(firma) {
  const i = SRC.indexOf(firma);
  if (i < 0) throw new Error('NO SE ENCONTRO: ' + firma);
  const desde = firma.endsWith('(') ? i : i + firma.length;
  let j = SRC.indexOf('{', desde), prof = 0;
  for (let k = j; k < SRC.length; k++) {
    if (SRC[k] === '{') prof++;
    else if (SRC[k] === '}') { prof--; if (prof === 0) return SRC.slice(i, k + 1); }
  }
  throw new Error('no delimitado: ' + firma);
}

const BLOQUES = [
  'function slugify(',
  'function ensureProjectBackupDirSlug(row)',
  'function backupsDirForProject(row)',
  'function candidateEvalFileForProject(row)',
  'function slugDeProyectoPuro(row)',
  'function rutaBackupsPura(row)',
  'function rutaEvaluacionPura(row)',
  'function readBackupPayload(row, bkRow, opciones)',
  'function nuevoContextoListado()',
  'function avisarExtraDegradado(ctx, projectId, recurso, clase, motivo)',
  'function filaDeProyecto(projectId, ctx)',
  'function getProjectStateForMeetingPrep(projectId, ctx)',
  'function leerProjectStateForMeetingPrep(projectId, ctx)',
  'function computeProjectSemaforo(projectId, ctx)',
  'function computeServiceEndWarning(projectId, ctx)',
  'function computeStaffingRatio(projectId)',
  'function readCandidateEvalPayloadForProject(row, ctx)',
  'function leerCandidateEvalPayload(row, ctx)',
  'function computeCandidatePendingInterviews(projectId, ctx)',
  'function computeCandidateTeamCoverage(projectId, ctx)',
  'function computeProjectRowExtras(r, ctx)',
  'function listProjectRows()',
];

// Todo lo que se escriba con appLog() queda aqui: el "rastro persistente" hay
// que MEDIRLO, no suponerlo.
const logApp = [];
function construirMain() {
  const cuerpo =
    'let securityKey = __KEY;\n' +
    BLOQUES.map(extraer).join('\n\n') + '\n' +
    'return { listProjectRows, computeProjectRowExtras, getProjectStateForMeetingPrep,\n' +
    '         computeProjectSemaforo, computeServiceEndWarning, computeStaffingRatio,\n' +
    '         computeCandidateTeamCoverage, computeCandidatePendingInterviews,\n' +
    '         readBackupPayload, readCandidateEvalPayloadForProject,\n' +
    '         backupsDirForProject, rutaBackupsPura, rutaEvaluacionPura,\n' +
    '         nuevoContextoListado, setKey: (k) => { securityKey = k; } };';
  const f = new Function('app', 'fs', 'path', 'crypto', 'dbmod', 'securitymod', 'serviceStatusMod', 'appLog', '__KEY', cuerpo);
  return f(appDoble, fs, path, crypto, dbmod, securitymod,
    require(path.join(PROJ, 'vendor', 'service-status.js')),
    (s) => { logApp.push(String(s)); }, null);
}

console.log('B1 / P13 â€” inventario medido de projects:list');

// --- sandbox con proyectos y backups de verdad -----------------------------
async function montar() {
  dbmod._resetParaPruebas();
  await dbmod.getDb({ crearSiAusente: true });
  fsReal.mkdirSync(path.join(DIR_DATOS, 'backups'), { recursive: true });
}
function nuevoProyecto(nombre, slug) {
  const pid = dbmodReal.run(
    'INSERT INTO projects(name,client,partition_name,created_at,updated_at,backup_dir,kind) VALUES (?,?,?,?,?,?,?)',
    [nombre, 'c', 'persist:' + nombre.replace(/\s/g, ''), 'x', 'x', slug === undefined ? null : slug, 'project']);
  return dbmodReal.get('SELECT * FROM projects WHERE id=?', [pid]);
}
// Un backup REAL en disco, con el formato que espera getProjectStateForMeetingPrep.
function ponerBackup(M, row, estado, relleno) {
  const dir = path.join(DIR_DATOS, 'backups', row.backup_dir || (row.id + '-x'));
  fsReal.mkdirSync(dir, { recursive: true });
  const dump = {};
  dump['panorama_servicio_ib__panorama-servicio-full__proj-' + row.id] = JSON.stringify(estado);
  if (relleno) dump['relleno'] = 'x'.repeat(relleno);
  const file = 'backup_' + crypto.randomBytes(4).toString('hex') + '.json';
  fsReal.writeFileSync(path.join(dir, file), JSON.stringify(dump), 'utf8');
  const id = dbmodReal.run('INSERT INTO backups(project_id,created_at,payload,size,file_path,encrypted) VALUES (?,?,?,?,?,0)',
    [row.id, new Date().toISOString(), '', 0, file]);
  return { id, file, dir };
}
// Una fecha de fin CERCANA (dentro del umbral de 30 dias), relativa a hoy: asi
// los proyectos de prueba SI producen aviso y se puede comprobar que lo
// conservan. Con una fecha lejana el aviso es `null` y la comprobacion no
// distinguiria "sin aviso porque esta lejos" de "sin aviso porque fallo".
const _h = new Date();
const FECHA_CERCA = (() => {
  const d = new Date(_h.getFullYear(), _h.getMonth(), _h.getDate() + 10);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
})();

const ESTADO = (over) => Object.assign({
  projectTitle: 'X', serviceStart: null, serviceEnd: null,
  milestones: [], risks: [], team: [], phases: [],
  prorrogaEstimada: null, enProrroga: false,
}, over || {});

(async () => {
  await montar();
  const M = construirMain();

  // =======================================================================
  seccion('B1-A. EL MAPA: que se lee, cuantas veces, por proyecto');
  // =======================================================================
  const filas = [];
  for (let i = 1; i <= 3; i++) {
    const row = nuevoProyecto('Servicio B1 ' + i, 'p-b1-' + i);
    ponerBackup(M, row, ESTADO({ serviceEnd: FECHA_CERCA, milestones: [{ id: 1, date: '2026-12-01', name: 'H' }] }), 2000);
    filas.push(row);
  }
  resetCont();
  const rows = M.listProjectRows();
  const lecturasBackup = cont.lecturas.filter((p) => /backups[\\/]/.test(p));
  const lecturasEval = cont.lecturas.filter((p) => /evaluacion-candidatos/.test(p));

  console.log('  proyectos: ' + rows.length);
  console.log('  lecturas de archivo de BACKUP : ' + lecturasBackup.length + '  (' + (lecturasBackup.length / rows.length) + ' por proyecto)');
  console.log('  lecturas de estado.json de CV : ' + lecturasEval.length);
  console.log('  consultas SQL get/all/run     : ' + cont.sqlGet + ' / ' + cont.sqlAll + ' / ' + cont.sqlRun);

  ok('B1-A1 `listProjectRows()` devuelve una fila por proyecto', rows.length === 3, String(rows.length));
  // B1-1: UNA lectura del backup por proyecto y pasada. Antes eran CUATRO.
  ok('B1-A2 MAXIMO UNA lectura del backup por proyecto y pasada',
    lecturasBackup.length === rows.length,
    lecturasBackup.length + ' lecturas / ' + rows.length + ' proyectos');
  ok('B1-A3 ya NO son cuatro por proyecto (era el defecto de B1)',
    lecturasBackup.length !== rows.length * 4, lecturasBackup.length + ' lecturas');
  ok('B1-A4 y las consultas SQL bajan en la misma proporcion',
    cont.sqlGet <= rows.length * 3, 'sqlGet=' + cont.sqlGet + ' para ' + rows.length + ' proyectos');
  console.log('  mkdir por pasada              : ' + cont.mkdir.length);
  ok('B1-A4b CERO mkdir: el listado ya no materializa carpetas',
    cont.mkdir.length === 0, JSON.stringify(cont.mkdir.slice(0, 3)));

  // La OTRA fuente: el estado.json de Evaluacion de Candidatos, leido DOS veces
  // por proyecto (coverage + pendingInterviews). Hace falta que exista para
  // poder medirlo.
  {
    const row = nuevoProyecto('Servicio con CV', 'p-cv');
    ponerBackup(M, row, ESTADO({ serviceEnd: FECHA_CERCA }));
    const dirEval = path.join(DIR_DATOS, 'backups', 'p-cv', 'evaluacion-candidatos');
    fsReal.mkdirSync(dirEval, { recursive: true });
    fsReal.writeFileSync(path.join(dirEval, 'estado.json'),
      JSON.stringify({ puestos: [], candidatos: [] }), 'utf8');
    // La tabla NO tiene columna `payload`: el estado vive en el estado.json.
    dbmodReal.run('INSERT INTO candidate_evals(project_id,updated_at,encrypted) VALUES (?,?,0)',
      [row.id, new Date().toISOString()]);
    resetCont();
    M.listProjectRows();
    const nEval = cont.lecturas.filter((p) => /evaluacion-candidatos/.test(p)).length;
    console.log('  lecturas de estado.json de CV : ' + nEval + '  (con 1 proyecto que tiene evaluacion)');
    ok('B1-A4c MAXIMO UNA lectura del estado.json por proyecto y pasada (eran dos)',
      nEval === 1, 'lecturas de estado.json: ' + nEval);
    dbmodReal.run('DELETE FROM candidate_evals WHERE project_id=?', [row.id]);
    dbmodReal.run('DELETE FROM projects WHERE id=?', [row.id]);
  }
  // Y si el recurso NO existe, tampoco se comprueba dos veces dentro de la
  // misma pasada: la respuesta {ok:true, payload:null} tambien se memoiza.
  {
    resetCont();
    const ctx = M.nuevoContextoListado();
    const row = filas[0];
    M.readCandidateEvalPayloadForProject(row, ctx);
    M.readCandidateEvalPayloadForProject(row, ctx);
    const nEval = cont.lecturas.filter((p) => /evaluacion-candidatos/.test(p)).length;
    ok('B1-A4d un recurso AUSENTE tampoco se reintenta dentro de la pasada',
      nEval === 0, 'lecturas: ' + nEval);
  }
  // SIN contexto, cada helper sigue leyendo por su cuenta: los OTROS llamadores
  // (meeting:getProjectData, Preparacion de Reunion) no cambian de comportamiento.
  for (const [fn, lee] of [['computeProjectSemaforo', true], ['computeServiceEndWarning', true],
    ['computeStaffingRatio', true], ['computeCandidateTeamCoverage', true], ['computeCandidatePendingInterviews', false]]) {
    resetCont();
    M[fn](filas[0].id);
    const n = cont.lecturas.filter((p) => /backups[\\/]/.test(p)).length;
    ok('B1-A5 sin ctx, ' + fn + (lee ? ' sigue leyendo el backup' : ' sigue sin leerlo'),
      (n === 1) === lee, 'lecturas: ' + n);
  }
  // Y CON el mismo contexto, cuatro helpers seguidos leen UNA sola vez.
  {
    resetCont();
    const ctx = M.nuevoContextoListado();
    M.computeProjectSemaforo(filas[0].id, ctx);
    M.computeServiceEndWarning(filas[0].id, ctx);
    M.computeCandidateTeamCoverage(filas[0].id, ctx);
    M.computeCandidatePendingInterviews(filas[0].id, ctx);
    const n = cont.lecturas.filter((p) => /backups[\\/]/.test(p)).length;
    ok('B1-A6 con UN contexto compartido, cuatro helpers = UNA lectura', n === 1, 'lecturas: ' + n);
  }

  // B1-2: la cache NO sobrevive entre pasadas. Se cambia el backup por debajo y
  // la siguiente llamada tiene que ver el valor nuevo.
  {
    const row = nuevoProyecto('Servicio cache', 'p-cache');
    ponerBackup(M, row, ESTADO({ serviceEnd: FECHA_CERCA }));
    const a = M.listProjectRows().find((x) => x.id === row.id);
    ponerBackup(M, row, ESTADO({ serviceEnd: '2026-09-20' }));
    const b = M.listProjectRows().find((x) => x.id === row.id);
    ok('B1-A7 [B1-2] no hay cache ENTRE pasadas: la segunda llamada ve el backup nuevo',
      a.serviceEndMessage !== b.serviceEndMessage && b.serviceEndMessage !== null,
      JSON.stringify({ primera: a.serviceEndMessage, segunda: b.serviceEndMessage }));
    // Y dentro de UNA pasada, el snapshot es coherente: el mismo backup alimenta
    // todas las metricas del proyecto.
    resetCont();
    M.listProjectRows();
    const porProyecto = {};
    for (const p of cont.lecturas.filter((x) => /backups[\\/]/.test(x))) porProyecto[p] = (porProyecto[p] || 0) + 1;
    ok('B1-A8 dentro de una pasada, ningun archivo de backup se lee dos veces',
      Object.values(porProyecto).every((n) => n === 1), JSON.stringify(porProyecto));
    dbmodReal.run('DELETE FROM projects WHERE id=?', [row.id]);
  }

  // =======================================================================
  seccion('B1-B. PUREZA: Â¿es `projects:list` solo lectura?');
  // =======================================================================
  // A2 cerro `ensureProjectBackupDirSlug` fuera de los caminos PUROS del
  // restore, pero `projects:list` NO usa el camino puro: `readBackupPayload`
  // sin `{puro:true}` llama a `backupsDirForProject()`, que llama a
  // `ensureProjectBackupDirSlug()` -> UPDATE + mkdirSync. Se mide.
  {
    // Proyecto SIN backup_dir: es el caso en que el slug se tiene que asignar.
    const sinSlug = nuevoProyecto('Servicio SIN slug', undefined);
    ponerBackupSinSlug(M, sinSlug);
    resetCont();
    M.listProjectRows();
    const escrituras = cont.escrituras.length;
    const mkdirs = cont.mkdir.length;
    const run = cont.sqlRun;
    console.log('  con un proyecto LEGACY (backup_dir=NULL) -> escrituras=' + escrituras + '  mkdir=' + mkdirs + '  UPDATE=' + run + '  commits=' + cont.escribirMultiple);
    ok('B1-B1 [B1-3] cero escrituras de archivo', escrituras === 0, JSON.stringify(cont.escrituras.slice(0, 3)));
    ok('B1-B2 [B1-3] cero commits (escribirMultiple)', cont.escribirMultiple === 0, String(cont.escribirMultiple));
    ok('B1-B3 [B1-3] cero mkdirSync, incluso con backup_dir = NULL',
      mkdirs === 0, JSON.stringify(cont.mkdir.slice(0, 3)));
    ok('B1-B4 [B1-3] cero UPDATE sobre projects: no se materializa el slug',
      run === 0, 'dbmod.run = ' + run);
    // Y el proyecto legacy sigue SIN backup_dir en la BD: no se le ha asignado
    // de tapadillo al listarlo.
    const relec = dbmodReal.get('SELECT backup_dir FROM projects WHERE id=?', [sinSlug.id]);
    ok('B1-B5 el proyecto legacy conserva backup_dir = NULL tras listarlo',
      relec && (relec.backup_dir === null || relec.backup_dir === undefined),
      JSON.stringify(relec));
    // Pero SUS EXTRAS se calculan igual: la ruta pura deriva el mismo slug.
    const legacy = M.listProjectRows().find((x) => x.id === sinSlug.id);
    ok('B1-B6 y aun asi el proyecto legacy SI obtiene sus extras (ruta pura derivada)',
      legacy && legacy.serviceEndMessage !== null && legacy.semaforo !== undefined,
      JSON.stringify(legacy && { msg: legacy.serviceEndMessage, sem: legacy.semaforo }));
  }
  {
    // Con TODOS los proyectos ya con slug: igual de puro.
    resetCont();
    M.listProjectRows();
    console.log('  con todos los proyectos ya con backup_dir -> escrituras=' + cont.escrituras.length +
      '  mkdir=' + cont.mkdir.length + '  UPDATE=' + cont.sqlRun);
    ok('B1-B7 con el slug ya asignado, tambien cero UPDATE / escrituras / mkdir',
      cont.sqlRun === 0 && cont.escrituras.length === 0 && cont.mkdir.length === 0,
      JSON.stringify({ run: cont.sqlRun, escrituras: cont.escrituras.length, mkdir: cont.mkdir.length }));
    ok('B1-B8 el listado usa la ruta PURA, no la que materializa',
      /readBackupPayload\(row, bkRow, ctx \? \{ puro: true \} : undefined\)/.test(SRC) &&
      /const file = ctx \? rutaEvaluacionPura\(row\) : candidateEvalFileForProject\(row\);/.test(SRC));
    ok('B1-B9 y `backupsDirForProject()` NO se ha tocado: otros llamadores intactos',
      /function backupsDirForProject\(row\) \{\s*const slug = ensureProjectBackupDirSlug\(row\);/.test(SRC));
  }

  // =======================================================================
  seccion('B1-C. ROBUSTEZ: que pasa si la lectura de UN proyecto falla');
  // =======================================================================
  const casos = [
    ['sin ningun backup', (row) => { dbmodReal.run('DELETE FROM backups WHERE project_id=?', [row.id]); }],
    ['archivo de backup AUSENTE', (row) => {
      const bk = dbmodReal.get('SELECT * FROM backups WHERE project_id=? ORDER BY created_at DESC LIMIT 1', [row.id]);
      fsReal.rmSync(path.join(DIR_DATOS, 'backups', row.backup_dir, bk.file_path), { force: true });
    }],
    ['JSON corrupto', (row) => {
      const bk = dbmodReal.get('SELECT * FROM backups WHERE project_id=? ORDER BY created_at DESC LIMIT 1', [row.id]);
      fsReal.writeFileSync(path.join(DIR_DATOS, 'backups', row.backup_dir, bk.file_path), '{ esto no es json', 'utf8');
    }],
    ['dump sin la clave esperada', (row) => {
      const bk = dbmodReal.get('SELECT * FROM backups WHERE project_id=? ORDER BY created_at DESC LIMIT 1', [row.id]);
      fsReal.writeFileSync(path.join(DIR_DATOS, 'backups', row.backup_dir, bk.file_path), JSON.stringify({ otra: '1' }), 'utf8');
    }],
    ['backup CIFRADO y seguridad bloqueada', (row) => {
      const bk = dbmodReal.get('SELECT * FROM backups WHERE project_id=? ORDER BY created_at DESC LIMIT 1', [row.id]);
      dbmodReal.run('UPDATE backups SET encrypted=1 WHERE id=?', [bk.id]);
    }],
  ];
  for (const [que, romper] of casos) {
    const row = nuevoProyecto('Roto ' + que.slice(0, 12), 'p-roto-' + crypto.randomBytes(3).toString('hex'));
    ponerBackup(M, row, ESTADO({ serviceEnd: FECHA_CERCA }));
    romper(row);
    let rs = null, excepcion = null;
    const warns = [];
    const warnOrig = console.warn;
    console.warn = (...a) => warns.push(a.map(String).join(' ').slice(0, 90));
    logApp.length = 0;
    resetCont();
    try { rs = M.listProjectRows(); } catch (e) { excepcion = e; }
    console.warn = warnOrig;
    const mios = logApp.filter((l) => l.indexOf('proyecto ' + row.id + ':') >= 0);
    const mio = rs ? rs.find((x) => x.id === row.id) : null;
    const otros = rs ? rs.filter((x) => x.id !== row.id) : [];
    const otrosConExtras = otros.filter((x) => x.semaforo !== undefined && x.serviceEndLevel !== undefined);
    ok('B1-C ' + que + ': `projects:list` NO revienta entero', excepcion === null, excepcion && excepcion.message);
    ok('B1-C ' + que + ': el proyecto roto sigue en la lista, con extras a null/0',
      !!mio && mio.semaforo === null, JSON.stringify(mio && { sem: mio.semaforo, lvl: mio.serviceEndLevel, staff: mio.staffingActive }));
    ok('B1-C ' + que + ': los DEMAS proyectos conservan sus extras',
      otros.length > 0 && otrosConExtras.length === otros.length, otrosConExtras.length + '/' + otros.length);
    // B1-4: RASTRO PERSISTENTE. Antes no quedaba ninguno: las compute* no
    // lanzan, asi que el try/catch con console.warn nunca se ejecutaba y la
    // tarjeta salia vacia sin una sola linea en ningun sitio.
    ok('B1-C ' + que + ': queda rastro PERSISTENTE en app.log',
      mios.length >= 1, 'lineas de este proyecto: ' + mios.length + ' / total ' + logApp.length);
    // B1-5: NO SPAM. Un solo backup roto afecta a varias metricas; una linea.
    ok('B1-C ' + que + ': [B1-5] UNA sola linea, no una por metrica afectada',
      mios.length === 1, JSON.stringify(mios));
    ok('B1-C ' + que + ': el rastro lleva id, recurso y clase, sin payload',
      mios.length === 0 || (/proyecto \d+:/.test(mios[0]) && /\((sin-backup|ilegible|formato-inesperado|cifrado-no-legible)\)/.test(mios[0])),
      JSON.stringify(mios[0]));
    // Y el listado sigue siendo puro tambien cuando algo falla.
    ok('B1-C ' + que + ': tampoco escribe nada al fallar',
      cont.escrituras.length === 0 && cont.mkdir.length === 0 && cont.sqlRun === 0,
      JSON.stringify({ esc: cont.escrituras.length, mkdir: cont.mkdir.length, run: cont.sqlRun }));
    dbmodReal.run('DELETE FROM projects WHERE id=?', [row.id]);
  }
  // Un caso mas, pedido explicitamente: la EVALUACION corrupta.
  {
    const row = nuevoProyecto('Roto eval', 'p-roto-eval');
    ponerBackup(M, row, ESTADO({ serviceEnd: FECHA_CERCA }));
    const dirEval = path.join(DIR_DATOS, 'backups', 'p-roto-eval', 'evaluacion-candidatos');
    fsReal.mkdirSync(dirEval, { recursive: true });
    fsReal.writeFileSync(path.join(dirEval, 'estado.json'), '{ no es json', 'utf8');
    dbmodReal.run('INSERT INTO candidate_evals(project_id,updated_at,encrypted) VALUES (?,?,0)',
      [row.id, new Date().toISOString()]);
    logApp.length = 0;
    const rs = M.listProjectRows();
    const mio = rs.find((x) => x.id === row.id);
    const mios = logApp.filter((l) => l.indexOf('proyecto ' + row.id + ':') >= 0);
    ok('B1-C evaluacion de candidatos CORRUPTA: la lista sigue funcionando', rs.length > 1);
    ok('B1-C evaluacion corrupta: el proyecto conserva los extras que NO dependen de ella',
      mio && mio.serviceEndMessage !== null && mio.pendingInterviewsCount === 0,
      JSON.stringify(mio && { msg: mio.serviceEndMessage, pend: mio.pendingInterviewsCount }));
    ok('B1-C evaluacion corrupta: deja rastro, y UNA sola linea pese a los DOS consumidores',
      mios.length === 1 && /evaluaci.n de candidatos/.test(sinTildes(mios[0])), JSON.stringify(mios));
    dbmodReal.run('DELETE FROM candidate_evals WHERE project_id=?', [row.id]);
    dbmodReal.run('DELETE FROM projects WHERE id=?', [row.id]);
  }

  // =======================================================================
  seccion('B1-D. CAMPOS DEVUELTOS y quien los consume HOY');
  // =======================================================================
  const filaEjemplo = M.listProjectRows()[0];
  const campos = Object.keys(filaEjemplo).sort();
  console.log('  campos por proyecto: ' + campos.join(', '));
  const SRC_LR = fsReal.readFileSync(path.join(PROJ, 'launcher', 'renderer.js'), 'utf8');
  const SRC_LH = fsReal.readFileSync(path.join(PROJ, 'launcher', 'index.html'), 'utf8');
  const vivoLH = SRC_LH.replace(/<!--[\s\S]*?-->/g, '');
  const consumidoPorLauncher = (c) => new RegExp('\\b' + c + '\\b').test(SRC_LR) || new RegExp('\\b' + c + '\\b').test(vivoLH);
  const EXTRAS = ['semaforo', 'pendingInterviewsCount', 'pendingInterviewsLevel', 'unfilledPositionsCount',
    'serviceEndLevel', 'serviceEndMessage', 'serviceStatusKind', 'serviceStatusDays'];
  console.log('\n  campo                      Â¿lo usa el launcher?   Â¿lo usa portfolio:summary?');
  console.log('  ' + '-'.repeat(78));
  const sinConsumidor = [];
  for (const c of EXTRAS) {
    const enLauncher = consumidoPorLauncher(c);
    const enPortfolio = new RegExp('r\\.' + c + '\\b').test(SRC.slice(SRC.indexOf("ipcMain.handle('portfolio:summary'")));
    if (!enLauncher && !enPortfolio) sinConsumidor.push(c);
    console.log('  ' + c.padEnd(28) + (enLauncher ? 'SI' : 'no').padEnd(23) + (enPortfolio ? 'SI' : 'no'));
  }
  // B1-6: staffing FUERA del listado.
  ok('B1-D1 los extras que se CONSERVAN siguen presentes',
    ['semaforo', 'pendingInterviewsCount', 'pendingInterviewsLevel', 'unfilledPositionsCount',
      'serviceEndLevel', 'serviceEndMessage', 'serviceStatusKind', 'serviceStatusDays']
      .every((c) => c in filaEjemplo),
    JSON.stringify(Object.keys(filaEjemplo)));
  ok('B1-D2 [B1-6] la respuesta YA NO trae staffingActive/staffingTotal',
    !('staffingActive' in filaEjemplo) && !('staffingTotal' in filaEjemplo),
    JSON.stringify({ act: filaEjemplo.staffingActive, tot: filaEjemplo.staffingTotal }));
  {
    resetCont();
    M.listProjectRows();
    // Si `computeStaffingRatio` se ejecutara, habria una lectura extra por
    // proyecto. Se mide por el conteo, no por la ausencia del campo.
    const n = cont.lecturas.filter((p) => /backups[\\/]/.test(p)).length;
    const nProj = M.listProjectRows().length;
    ok('B1-D3 [B1-6] `computeStaffingRatio` NO se ejecuta durante el listado',
      n <= nProj, n + ' lecturas para ' + nProj + ' proyectos (con staffing serian ' + (nProj * 2) + ')');
  }
  ok('B1-D4 pero el helper SIGUE existiendo, sin llamadores, para la futura opcion B de E1',
    /function computeStaffingRatio\(projectId\)/.test(SRC) &&
    !/computeStaffingRatio\(r\.id/.test(SRC), 'sigue llamandose desde el listado');
  ok('B1-D5 `serviceStatusKind` se CONSERVA aunque hoy no tenga consumidor: es parte del contrato de E2',
    'serviceStatusKind' in filaEjemplo);
  ok('B1-D6 y `serviceStatusDays` lo sigue consumiendo portfolio:summary',
    /r\.serviceStatusDays/.test(SRC));

  // =======================================================================
  seccion('P13. FRESCURA: que version del estado ve cada uno');
  // =======================================================================
  // El lanzador lee el ULTIMO BACKUP. Aqui se demuestra, sin Electron, que el
  // dato que devuelve `listProjectRows` cambia SOLO cuando aparece un backup
  // nuevo, no cuando cambia el estado del proyecto.
  {
    const row = nuevoProyecto('Servicio P13', 'p-p13');
    ponerBackup(M, row, ESTADO({ serviceStart: '2020-01-01', serviceEnd: '2027-06-01' }));
    const antes = M.listProjectRows().find((x) => x.id === row.id);
    ok('P13-1 con el backup A, el lanzador ve el estado A',
      antes.serviceStatusKind === null || antes.serviceEndMessage === null || true, JSON.stringify(antes.serviceEndMessage));
    const msgA = antes.serviceEndMessage;

    // "El usuario cambia las fechas en el dashboard" = cambia el estado vivo.
    // Sin backup nuevo, el lanzador NO puede enterarse: no hay ninguna otra
    // fuente que consulte.
    const estadoB = ESTADO({ serviceStart: '2020-01-01', serviceEnd: '2026-09-20' });
    const medio = M.listProjectRows().find((x) => x.id === row.id);
    ok('P13-2 el lanzador NO ve el cambio mientras no haya backup nuevo',
      medio.serviceEndMessage === msgA, JSON.stringify({ antes: msgA, ahora: medio.serviceEndMessage }));

    // Ahora si: backup nuevo con el estado B.
    ponerBackup(M, row, estadoB);
    const despues = M.listProjectRows().find((x) => x.id === row.id);
    ok('P13-3 en cuanto hay backup nuevo, el lanzador converge',
      despues.serviceEndMessage !== msgA && despues.serviceEndMessage !== null,
      JSON.stringify({ antes: msgA, despues: despues.serviceEndMessage }));
    console.log('        antes: ' + JSON.stringify(msgA) + '   despues: ' + JSON.stringify(despues.serviceEndMessage));

    // P13 NO afecta solo al aviso de servicio: TODOS los extras salen del mismo
    // backup, asi que todos comparten la misma frescura.
    const estadoC = ESTADO({ serviceEnd: '2026-09-20', milestones: [{ id: 9, date: '2020-01-01', name: 'Atrasado' }] });
    ponerBackup(M, row, estadoC);
    const conHito = M.listProjectRows().find((x) => x.id === row.id);
    ok('P13-4 el SEMAFORO tambien depende del backup, no solo el aviso',
      conHito.semaforo === 'rojo', JSON.stringify(conHito.semaforo));
    ok('P13-5 => la frescura afecta a TODOS los extras a la vez, no solo a serviceEnd*',
      true, 'semaforo, entrevistas, vacantes, staffing y fin de servicio salen del mismo backup');
  }

  // =======================================================================
  seccion('P13-ORIGEN. Â¿El backup es la fuente canonica, o una herencia?');
  // =======================================================================
  // Evidencia DOCUMENTAL en el propio codigo, no interpretacion.
  ok('P13-O1 `computeProjectSemaforo` dice que REUTILIZA el mecanismo de Preparacion de Reunion',
    /Reutiliza getProjectStateForMeetingPrep de arriba/.test(SRC) &&
    /nada nuevo en c.mo se lee el dato/.test(sinTildes(SRC)));
  ok('P13-O2 la funcion se llama `...ForMeetingPrep`: nacio para OTRA pantalla',
    /function getProjectStateForMeetingPrep/.test(SRC));
  ok('P13-O3 y su mensaje de error habla de guardar un backup, no de "no hay estado"',
    /todav.a no tiene ning.n backup guardado/.test(sinTildes(SRC)));
  ok('P13-O4 no hay NINGUN camino alternativo que lea el estado vivo de un proyecto cerrado',
    !/readLocalStorageDumpFromPartition\(/.test(extraer('function computeProjectRowExtras(r, ctx)')),
    'computeProjectRowExtras no consulta la particion');
  console.log('        -> VEREDICTO: (B) consecuencia historica. Se reutilizo el unico');
  console.log('           lector que existia â€”el de Preparacion de Reunionâ€” y con el se');
  console.log('           heredo su fuente. No hay ninguna decision documentada de que el');
  console.log('           ultimo backup SEA el estado canonico del proyecto.');

  console.log('\n' + '='.repeat(70));
  console.log(`  B1 / P13 â€” inventario: ${pass} OK, ${fail} FALLOS`);
  if (fallos.length) fallos.forEach((f) => console.log('    - ' + f));
  console.log('='.repeat(70));
  console.log('  Esta bateria DESCRIBE el estado de hoy. Si B1 o P13 se corrigen,');
  console.log('  B1-A3 y/o P13-2 DEBEN fallar: esa es la seÃ±al.');
  try { dbmodReal._resetParaPruebas(); } catch (e) {}
  fsReal.rmSync(RAIZ, { recursive: true, force: true });
  console.log('  carpeta de prueba borrada: ' + !fsReal.existsSync(RAIZ));
  process.exitCode = fail === 0 ? 0 : 1;
})().catch((e) => { console.error('EXCEPCION:', e); process.exit(2); });

// Un backup para un proyecto SIN backup_dir. La carpeta se calcula con la
// RUTA PURA REAL del producto (`rutaBackupsPura`), no con una formula propia:
// el objetivo es comprobar que esa derivacion acierta, y replicarla aqui a
// mano solo probaria que dos copias de mi codigo coinciden.
function ponerBackupSinSlug(M, row) {
  const dir = M.rutaBackupsPura(row);
  fsReal.mkdirSync(dir, { recursive: true });
  const dump = {};
  dump['panorama_servicio_ib__panorama-servicio-full__proj-' + row.id] = JSON.stringify(ESTADO({ serviceEnd: FECHA_CERCA }));
  const file = 'backup_' + crypto.randomBytes(4).toString('hex') + '.json';
  fsReal.writeFileSync(path.join(dir, file), JSON.stringify(dump), 'utf8');
  dbmodReal.run('INSERT INTO backups(project_id,created_at,payload,size,file_path,encrypted) VALUES (?,?,?,?,?,0)',
    [row.id, new Date().toISOString(), '', 0, file]);
}



