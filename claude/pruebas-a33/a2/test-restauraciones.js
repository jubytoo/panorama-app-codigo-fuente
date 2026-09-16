'use strict';
// ---------------------------------------------------------------------------
// A2 — HELPER Y RECOVERY DE RESTAURACION, EN AISLAMIENTO.
//
// A1-A15 · REST-QUIESCE-BASE · REST-NO-STALE-BACKUP · REST-NO-CLOBBER ·
// REST-W-SUBTREE · REST-X1 · REST-LEGACY-SLUG · REST-REKEY-1..4 ·
// REST-COL-1/2/3 · esquema cerrado del journal · contrato de tres formas.
//
// El Bloque 4 y el Bloque 5 son los REALES de main.js, extraidos. La particion
// se simula con un almacen en disco que se puede romper a mitad: en aislamiento
// no hay BrowserWindow. El camino real de localStorage se ejercita al cablear.
// ---------------------------------------------------------------------------
const fsReal = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const Module = require('module');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const MARCA_PRUEBAS = '_a33-a2-PRUEBAS';
const RAIZ = path.join(os.tmpdir(), MARCA_PRUEBAS);

const GUARDIA = require(path.join(__dirname, '..', 'comun', 'guardia-rutas.js'));
const guardia = GUARDIA.crearGuardia({ marca: MARCA_PRUEBAS });
const segura = guardia.segura;
segura(RAIZ);
fsReal.rmSync(RAIZ, { recursive: true, force: true });
fsReal.mkdirSync(RAIZ, { recursive: true });

// fs instrumentado: para poder afirmar "ni se intento escribir".
const escrituras = [];
const fs = Object.assign({}, fsReal);
fs.renameSync = function (a, b) { escrituras.push({ op: 'rename', a: String(b) }); return fsReal.renameSync(a, b); };
fs.writeFileSync = function (p, d, o) { escrituras.push({ op: 'write', a: String(p) }); return fsReal.writeFileSync(p, d, o); };
function escriturasDesde(i) { return escrituras.slice(i); }

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
const RUTA_HELPER = process.env.PANORAMA_RESTAURACIONES || path.join(__dirname, 'restauraciones.js');
const { crearHelperRestauraciones } = require(RUTA_HELPER);

let pass = 0, fail = 0; const fallos = [];
function ok(n, c, extra) {
  if (c) { pass++; console.log('  OK    ' + n); }
  else { fail++; fallos.push(n); console.log('  FALLO ' + n + (extra ? '  -- ' + extra : '')); }
}
function seccion(t) { console.log('\n=== ' + t + ' ==='); }
let nc = 0;
function carpeta(e) { const d = path.join(RAIZ, 'c' + (++nc) + '-' + e); segura(d); fsReal.mkdirSync(d, { recursive: true }); return d; }

// ---------------------------------------------------------------------------
const RUTA_MAIN = process.env.PANORAMA_MAIN || path.join(PROJ, 'main.js');
const SRC = fsReal.readFileSync(RUTA_MAIN, 'utf8');
function extraer(firma) {
  const i = SRC.indexOf(firma);
  if (i < 0) throw new Error('NO SE ENCONTRO: ' + firma);
  let j = SRC.indexOf('{', i), prof = 0;
  for (let k = j; k < SRC.length; k++) {
    if (SRC[k] === '{') prof++;
    else if (SRC[k] === '}') { prof--; if (prof === 0) return SRC.slice(i, k + 1); }
  }
  throw new Error('no delimitado: ' + firma);
}
function lineaConst(n) { const i = SRC.indexOf(n); if (i < 0) throw new Error('falta ' + n); return SRC.slice(i, SRC.indexOf('\n', i) + 1); }

const BLOQUES = [
  'function escribirBufferDurable(ruta, buf)',
  'function escribirJsonDurable(ruta, obj)',
  'function sha256DeArchivo(p)',
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
  'function ensureProjectBackupDirSlug(row)',
];
BLOQUES.push.apply(BLOQUES, B5.BLOQUES_B5);
const CONSTS = B5.sinRepetir([
  lineaConst('const FSYNC_NO_SOPORTADO_REG'),
  lineaConst("const ACCIONES_DIR_NAME = '.panorama-acciones';"),
  lineaConst('const ACCIONES_JOURNAL_V ='),
  lineaConst('const ACCIONES_MARCA_MAX ='),
  lineaConst('const ACCIONES_TIPOS ='),
  lineaConst('const esHex ='),
  lineaConst('const esEnteroNoNegativo ='),
].concat(B5.CONSTS_B5.map(lineaConst))).join('');

function construirMain(est, op) {
  const o = op || {};
  const cuerpo = CONSTS + '\n' +
    'let securityKey = null;\n' +
    'let seguridadRequiereRevalidacion = false;\n' +
    'let seguridadEnEstadoInconsistente = null;\n' +
    B5.PREAMBULO_B5 +
    BLOQUES.map(extraer).join('\n\n') + '\n' +
    'return { escribirBufferDurable, escribirJsonDurable, sha256DeArchivo,\n' +
    '         sentenciaMarcaAccion, estadoAccionEnMarca, leerMarcaAcciones,\n' +
    '         journalAccionPath, accionesDir, leerJournalAccion, journalsDeAcciones,\n' +
    '         ocupacionComun, f1Global, f1Borrados, estaDentroDe, slugify,\n' +
    '         borradosDir, journalBorradoPath, cuarentenaDe, rutaBackupsPura,\n' +
    '         ensureProjectBackupDirSlug, journalsDeBorrados,\n' +
    '         setKey: (k) => { securityKey = k; }, getKey: () => securityKey };';
  const f = new Function('app', 'fs', 'path', 'crypto', 'dbmod', 'securitymod', 'appLog', 'getMeta', 'session', cuerpo);
  return f(appDoble, fs, path, crypto, o.dbmod || dbmod, securitymod,
    (s) => { (est.log = est.log || []).push(s); },
    (k) => { const r = dbmod.get('SELECT value FROM app_meta WHERE key=?', [k]); return r ? r.value : null; },
    { fromPartition: () => ({ clearStorageData: () => Promise.resolve() }) });
}
function dbmodCon(fnEscribir) {
  return Object.assign(Object.create(Object.getPrototypeOf(dbmod)), dbmod, { escribirMultiple: fnEscribir });
}

// ---------------------------------------------------------------------------
// PARTICION SIMULADA: un JSON por particion. Permite romper la escritura a
// mitad, que es justo lo que hay que poder cortar.
const particiones = path.join(RAIZ, 'particiones');
fsReal.mkdirSync(particiones, { recursive: true });
const rutaPart = (p) => path.join(particiones, String(p).replace(/[^a-z0-9_-]/gi, '_') + '.json');
let cortarEnClave = null;   // { part, tras: N } -> escribe N claves y revienta
function leerParticionSim(p) {
  try { return JSON.parse(fsReal.readFileSync(rutaPart(p), 'utf8')); } catch (e) { return {}; }
}
function escribirParticionSim(p, dump, { clearFirst } = {}) {
  const actual = clearFirst ? {} : leerParticionSim(p);
  const claves = Object.keys(dump);
  let n = 0;
  for (const k of claves) {
    if (cortarEnClave && cortarEnClave.part === p && n >= cortarEnClave.tras) {
      // UNA SOLA VEZ: el corte simula la muerte al APLICAR. Si siguiera activo
      // tambien cortaria la reposicion, y estariamos probando un fallo doble
      // que no es el escenario — eso enmascaraba A5 por completo.
      cortarEnClave = null;
      fsReal.writeFileSync(rutaPart(p), JSON.stringify(actual), 'utf8');
      const e = new Error('corte simulado escribiendo la particion');
      e.corte = true;
      throw e;
    }
    actual[k] = dump[k];
    n++;
  }
  fsReal.writeFileSync(rutaPart(p), JSON.stringify(actual), 'utf8');
  return { ok: true, count: claves.length };
}
function ponerParticion(p, dump) { fsReal.writeFileSync(rutaPart(p), JSON.stringify(dump), 'utf8'); }

// ---------------------------------------------------------------------------
let SQL = null;
const W_A = 'a'.repeat(32);
const W_B = 'b'.repeat(32);
const commitFalso = () => crypto.randomBytes(16).toString('hex');

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

const ESTADO_VIEJO = { 'proj-1': JSON.stringify({ marca: 'VIEJO', hitos: 3 }), 'tema': 'oscuro' };
const ESTADO_BACKUP = { 'proj-1': JSON.stringify({ marca: 'DEL-BACKUP', hitos: 1 }), 'idioma': 'es' };

// Monta helper + main con las funciones REALES.
function montarHelper(est, op) {
  const o = op || {};
  const M = construirMain(est, o.mainOp || {});
  const H = crearHelperRestauraciones(Object.assign({
    fs, path, crypto,
    userDataDir: () => DIR_DATOS,
    getInstallationId: () => dbmod.getInstallationId(),
    getCommitActual: () => dbmod.getCommitActual(),
    escribirMultiple: (s, opt) => (o.escribirMultiple ? o.escribirMultiple(s, opt) : dbmod.escribirMultiple(s, opt)),
    escribirBufferDurable: M.escribirBufferDurable,
    sha256DeArchivo: M.sha256DeArchivo,
    sentenciaMarcaAccion: M.sentenciaMarcaAccion,
    estadoAccionEnMarca: M.estadoAccionEnMarca,
    securitymod,
    getSecurityKey: o.getSecurityKey || (() => null),
    slugify: M.slugify,
    ocupacionComun: M.ocupacionComun,
    f1Global: M.f1Global,
    estaDentroDe: M.estaDentroDe,
    leerParticion: (p) => Promise.resolve(leerParticionSim(p)),
    escribirParticion: (p, d, opt) => Promise.resolve(escribirParticionSim(p, d, opt)),
    cerrarVentanasDeProyecto: o.cerrarVentanas || (() => Promise.resolve()),
    hayWriterLocalDelProyecto: o.hayWriter || (() => false),
    appLog: (s) => { (est.log = est.log || []).push(s); },
  }, o.deps || {}));
  return { M, H };
}
function opcionesRestore(row, extra) {
  return Object.assign({
    row,
    backupId: 7,
    leerBackup: () => ESTADO_BACKUP,
  }, extra || {});
}
// Planta un journal + previo a mano, como los habria dejado un corte.
function plantarRestauracion(H, M, j, previoDump, opciones) {
  const o = opciones || {};
  fsReal.mkdirSync(H.dirDeAccion(j.action_id), { recursive: true });
  if (previoDump !== null) {
    const plano = JSON.stringify({
      v: 1, project_id: j.project_id, partition: j.partition, action_id: j.action_id,
      writer: j.writer, base_commit_id: j.base_commit_id, tomadaEn: 'x',
      claves: previoDump, n_claves: Object.keys(previoDump).length, bytes: 0,
    });
    fsReal.writeFileSync(H.previoPath(j.action_id), plano, 'utf8');
    const h = M.sha256DeArchivo(H.previoPath(j.action_id));
    j.previo_sha256 = o.shaMalo ? 'f'.repeat(64) : h.sha;
    j.previo_size = h.size;
    j.previo_n_claves = Object.keys(previoDump).length;
    j.previo_hash = H.hashDump(previoDump);
  }
  fsReal.writeFileSync(H.journalPath(j.action_id), o.textoCrudo || JSON.stringify(j, null, 2), 'utf8');
  return j;
}
function journalBase(H, extra) {
  return Object.assign({
    v: 1, action_id: crypto.randomBytes(16).toString('hex'), writer: W_A,
    project_id: 1, partition: 'persist:P', backups_dir: path.join(DIR_DATOS, 'backups', 'p'),
    backup_id: 7, backup_sha256: null,
    base_commit_id: dbmod.getCommitActual(),
    esperado_hash: H.hashDump(ESTADO_BACKUP), esperado_claves: Object.keys(ESTADO_BACKUP).sort(),
    previo_hash: H.hashDump(ESTADO_VIEJO),
    fase: 'aplicando', cifrado: 0,
    previo_sha256: 'a'.repeat(64), previo_size: 0, previo_n_claves: 0,
    startedAt: '2026-09-15T00:00:00Z',
  }, extra || {});
}
function ponerMarca(M, ids) {
  const s = M.sentenciaMarcaAccion('x'.repeat(32));
  dbmod.escribirMultiple([{ sql: s.sql, params: [s.params[0], JSON.stringify(ids)] }]);
}
const residuos = (H) => { try { return fsReal.readdirSync(H.restauracionesDir()); } catch (e) { return []; } };

// ===========================================================================
(async () => {
  SQL = await initSqlJs({ locateFile: (f) => path.join(PROJ, 'node_modules', 'sql.js', 'dist', f) });
  console.log('A2 — helper y recovery de restauracion, AISLADOS');
  console.log('  main.js bajo prueba:  ' + RUTA_MAIN);
  console.log('  helper bajo prueba:   ' + RUTA_HELPER);

  // =========================================================================
  seccion('ESQUEMA CERRADO DEL JOURNAL');
  // =========================================================================
  {
    const dir = carpeta('schema'); await montar(dir, W_A);
    const est = {}; const { M, H } = montarHelper(est);
    const aid = 'c'.repeat(32);

    const bueno = journalBase(H, { action_id: aid });
    plantarRestauracion(H, M, bueno, ESTADO_VIEJO);
    ok('journal COMPLETO se acepta (control)',
      H.leerJournalRestauracion(H.journalPath(aid)).clase === 'valido',
      JSON.stringify(H.leerJournalRestauracion(H.journalPath(aid)).motivo || ''));
    const hPrevio = fsReal.readFileSync(H.previoPath(aid), 'utf8');

    const casos = [
      ['version distinta', (j) => { j.v = 2; }],
      ['action_id invalido', (j) => { j.action_id = 'ZZ'; }],
      ['writer invalido', (j) => { j.writer = '123'; }],
      ['project_id no entero', (j) => { j.project_id = 'uno'; }],
      ['partition vacia', (j) => { j.partition = ''; }],
      ['base_commit_id invalido', (j) => { j.base_commit_id = 'nope'; }],
      ['fase desconocida', (j) => { j.fase = 'lo-que-sea'; }],
      ['cifrado fuera de 0/1', (j) => { j.cifrado = 2; }],
      ['backup_id no entero ni null', (j) => { j.backup_id = 'siete'; }],
      ['esperado_hash invalido', (j) => { j.esperado_hash = 'x'; }],
      ['previo_hash invalido', (j) => { j.previo_hash = 'x'; }],
      ['previo_sha256 invalido', (j) => { j.previo_sha256 = 'x'; }],
      ['previo_size negativo', (j) => { j.previo_size = -1; }],
      ['startedAt vacio', (j) => { j.startedAt = ''; }],
      ['truncado', null, (t) => t.slice(0, Math.floor(t.length / 2))],
    ];
    let todosMal = true; let intactos = true;
    for (const [etq, mut, mutTexto] of casos) {
      const j = JSON.parse(JSON.stringify(bueno));
      if (mut) mut(j);
      let txt = JSON.stringify(j, null, 2);
      if (mutTexto) txt = mutTexto(txt);
      fsReal.writeFileSync(H.journalPath(aid), txt, 'utf8');
      const lect = H.leerJournalRestauracion(H.journalPath(aid));
      const nE = escrituras.length;
      const rec = await H.recuperarRestauracionesPendientes();
      const f1 = H.f1ConRestore();
      const bien = lect.clase !== 'valido' &&
        rec.ok === false && rec.malos.length === 1 && rec.malos[0].clase === 'journal-no-demostrable' &&
        f1.libre === false &&
        fsReal.existsSync(H.previoPath(aid)) && fsReal.readFileSync(H.previoPath(aid), 'utf8') === hPrevio &&
        escriturasDesde(nE).filter((x) => /particiones/.test(x.a)).length === 0;
      if (!bien) { todosMal = false; console.log('      (falla el caso: ' + etq + ' -> ' + lect.clase + ')'); }
      if (!fsReal.existsSync(H.previoPath(aid))) intactos = false;
    }
    ok('los 15 journals invalidos: ni aplicar, ni rollback, ni limpiar; fail-closed', todosMal);
    ok('y el material se conserva intacto en todos ellos', intactos);
    fsReal.rmSync(H.dirDeAccion(aid), { recursive: true, force: true });
  }

  // =========================================================================
  seccion('REST-NO-CLOBBER — la funcion REAL de reposicion');
  // =========================================================================
  {
    const dir = carpeta('no-clobber'); await montar(dir, W_A);
    const est = {}; const { M, H } = montarHelper(est);
    const j = journalBase(H, { partition: 'persist:NC' });
    plantarRestauracion(H, M, j, ESTADO_VIEJO);

    // Un TERCER estado: una clave que el journal no explica.
    ponerParticion('persist:NC', Object.assign({}, ESTADO_BACKUP, { 'de-otro': 'CONTENIDO AJENO' }));
    const antes = JSON.stringify(leerParticionSim('persist:NC'));
    const nE = escrituras.length;
    const r = await H.reponerParticion(j);
    ok('REST-NO-CLOBBER la funcion real clasifica el tercer estado como ajeno',
      r.estado === 'destino-ocupado' && r.clase === 'ajeno', JSON.stringify(r));
    ok('REST-NO-CLOBBER no se escribe en la particion',
      escriturasDesde(nE).filter((x) => /particiones/.test(x.a)).length === 0);
    ok('REST-NO-CLOBBER la particion sigue byte a byte', JSON.stringify(leerParticionSim('persist:NC')) === antes);

    const rec = await H.recuperarRestauracionesPendientes();
    ok('REST-NO-CLOBBER la recuperacion REAL queda fail-closed',
      rec.ok === false && rec.malos[0].clase === 'rollback-bloqueado', JSON.stringify(rec.malos[0] || {}));
    ok('REST-NO-CLOBBER journal y foto previa conservados',
      fsReal.existsSync(H.journalPath(j.action_id)) && fsReal.existsSync(H.previoPath(j.action_id)));

    // y con el estado esperado (el nuestro), SI repone
    ponerParticion('persist:NC', ESTADO_BACKUP);
    const r2 = await H.reponerParticion(j);
    ok('NO-CLOBBER no bloquea el caso legitimo: con el estado aplicado SI repone',
      r2.estado === 'repuesto' && H.hashDump(leerParticionSim('persist:NC')) === H.hashDump(ESTADO_VIEJO),
      JSON.stringify(r2));
  }

  // =========================================================================
  seccion('MATRIZ A1-A15');
  // =========================================================================
  const resumenA = [];
  const anotar = (id, v, res) => resumenA.push({ id, v, res });

  async function escenario(nombre, op) {
    const dir = carpeta(nombre); await montar(dir, W_A);
    const est = {}; const m = montarHelper(est, op || {});
    const row = nuevoProyecto('Servicio ' + nombre, 'p-' + nombre);
    ponerParticion(row.partition_name, ESTADO_VIEJO);
    return Object.assign({ dir, est, row }, m);
  }

  // --- A1: corte tras F0, antes del quiesce -------------------------------
  {
    const s = await escenario('a1');
    s.H._inyectarFalloEn('tras-quiesce');
    const r = await s.H.ejecutarRestauracion(opcionesRestore(s.row));
    const bien = r.aplicado === false &&
      s.H.hashDump(leerParticionSim(s.row.partition_name)) === s.H.hashDump(ESTADO_VIEJO) &&
      residuos(s.H).length === 0 && s.H.barrera.bloquea(s.row.id) === false;
    ok('A1 corte antes de capturar: nada tocado, barrera liberada', bien, JSON.stringify(r).slice(0, 120));
    anotar('A1', bien ? 'nada que deshacer' : 'REVISAR', 'cero material');
  }

  // --- A3: corte tras la foto, antes del journal --------------------------
  {
    const s = await escenario('a3');
    s.H._inyectarFalloEn('tras-previo');
    const r = await s.H.ejecutarRestauracion(opcionesRestore(s.row));
    const bien = r.aplicado === false &&
      s.H.hashDump(leerParticionSim(s.row.partition_name)) === s.H.hashDump(ESTADO_VIEJO) &&
      residuos(s.H).length === 0;
    ok('A3 corte tras la foto: se retira el material, particion intacta', bien, JSON.stringify(r).slice(0, 120));
    anotar('A3', bien ? 'material retirado' : 'REVISAR', 'cero material');
  }

  // --- A4: corte tras el journal, antes de aplicar ------------------------
  {
    const s = await escenario('a4');
    s.H._inyectarFalloEn('antes-de-aplicar');
    const r = await s.H.ejecutarRestauracion(opcionesRestore(s.row));
    const bien = r.aplicado === false &&
      s.H.hashDump(leerParticionSim(s.row.partition_name)) === s.H.hashDump(ESTADO_VIEJO) &&
      residuos(s.H).length === 0;
    ok('A4 corte tras el journal: se repone (no-op) y se purga', bien, JSON.stringify(r).slice(0, 120));
    anotar('A4', bien ? 'repuesto (no-op)' : 'REVISAR', 'cero material');
  }

  // --- A5: corte EN MITAD de la aplicacion --------------------------------
  {
    const s = await escenario('a5');
    cortarEnClave = { part: s.row.partition_name, tras: 1 };
    const r = await s.H.ejecutarRestauracion(opcionesRestore(s.row));
    cortarEnClave = null;
    const bien = r.aplicado === false &&
      s.H.hashDump(leerParticionSim(s.row.partition_name)) === s.H.hashDump(ESTADO_VIEJO) &&
      residuos(s.H).length === 0;
    ok('A5 aplicacion PARCIAL: se detecta y se repone la foto', bien,
      JSON.stringify({ r: r.error && r.error.slice(0, 60), part: leerParticionSim(s.row.partition_name) }));
    anotar('A5', bien ? 'repuesto desde la foto' : 'REVISAR', 'cero material');
  }

  // --- A5b: corte parcial + MUERTE del proceso (recovery) -----------------
  {
    const s = await escenario('a5b');
    const j = journalBase(s.H, { project_id: s.row.id, partition: s.row.partition_name });
    plantarRestauracion(s.H, s.M, j, ESTADO_VIEJO);
    // la particion quedo con SOLO una de las claves del backup
    ponerParticion(s.row.partition_name, { 'proj-1': ESTADO_BACKUP['proj-1'] });
    const rec = await s.H.recuperarRestauracionesPendientes();
    const bien = rec.ok && rec.resultados[0].caso === 'no-confirmada' && rec.resultados[0].clase === 'repuesta' &&
      s.H.hashDump(leerParticionSim(s.row.partition_name)) === s.H.hashDump(ESTADO_VIEJO) &&
      residuos(s.H).length === 0;
    ok('A5b muerte del proceso con aplicacion parcial: recovery repone desde disco', bien, JSON.stringify(rec.resultados[0]));
    anotar('A5b', bien ? 'recovery repone' : 'REVISAR', 'cero material');
  }

  // --- A6: aplicado, sin confirmar (corte antes del commit) ---------------
  {
    const s = await escenario('a6');
    const j = journalBase(s.H, { project_id: s.row.id, partition: s.row.partition_name });
    plantarRestauracion(s.H, s.M, j, ESTADO_VIEJO);
    ponerParticion(s.row.partition_name, ESTADO_BACKUP);
    const rec = await s.H.recuperarRestauracionesPendientes();
    const bien = rec.ok && rec.resultados[0].clase === 'repuesta' &&
      s.H.hashDump(leerParticionSim(s.row.partition_name)) === s.H.hashDump(ESTADO_VIEJO) &&
      residuos(s.H).length === 0;
    ok('A6 aplicado sin marca: la recuperacion REPONE (no hubo restauracion)', bien, JSON.stringify(rec.resultados[0]));
    anotar('A6', bien ? 'repuesto' : 'REVISAR', 'cero material');
  }

  // --- A7: commit confirmado, corte antes del cleanup ---------------------
  {
    const s = await escenario('a7');
    const j = journalBase(s.H, { project_id: s.row.id, partition: s.row.partition_name });
    plantarRestauracion(s.H, s.M, j, ESTADO_VIEJO);
    ponerParticion(s.row.partition_name, ESTADO_BACKUP);
    ponerMarca(s.M, [j.action_id]);
    const nE = escrituras.length;
    const rec = await s.H.recuperarRestauracionesPendientes();
    const bien = rec.ok && rec.resultados[0].caso === 'confirmada' &&
      s.H.hashDump(leerParticionSim(s.row.partition_name)) === s.H.hashDump(ESTADO_BACKUP) &&
      residuos(s.H).length === 0 &&
      escriturasDesde(nE).filter((x) => /particiones/.test(x.a)).length === 0;
    ok('A7 marca presente: NO se repone, se completa el cleanup', bien, JSON.stringify(rec.resultados[0]));
    anotar('A7', bien ? 'limpiado (no repuesto)' : 'REVISAR', 'cero material');
  }

  // --- A8: forma 3 --------------------------------------------------------
  {
    const s = await escenario('a8', {
      escribirMultiple: (sent, opt) => {
        dbmod.escribirMultiple(sent, opt);
        const e = new Error('no se pudo releer tras confirmar'); e.aplicado = true; e.kind = 'io-tras-confirmar';
        throw e;
      },
    });
    const r = await s.H.ejecutarRestauracion(opcionesRestore(s.row));
    const bien = r.ok === true && r.aplicado === true && r.verificado === false && r.requiereReinicio === true &&
      typeof r.aviso === 'string' &&
      s.H.hashDump(leerParticionSim(s.row.partition_name)) === s.H.hashDump(ESTADO_BACKUP);
    ok('A8 aplicado:true/verificado:false: forma 3 y NO se repone', bien,
      JSON.stringify({ ok: r.ok, aplicado: r.aplicado, verificado: r.verificado }));
    anotar('A8', bien ? 'forma 3, sin deshacer' : 'REVISAR', 'material conservado hasta el reinicio');
  }

  // --- A9: base-cambiada en el commit -------------------------------------
  {
    const s = await escenario('a9');
    publicarComoOtroEquipo(s.dir, { commit: commitFalso(), parent: dbmod.getCommitActual(), gen: 77 });
    const r = await s.H.ejecutarRestauracion(opcionesRestore(s.row));
    const bien = r.aplicado === false && r.reintentable === true &&
      s.H.hashDump(leerParticionSim(s.row.partition_name)) === s.H.hashDump(ESTADO_VIEJO) &&
      residuos(s.H).length === 0;
    ok('A9 base-cambiada: se repone todo, IPC reintentable', bien, JSON.stringify(r).slice(0, 140));
    anotar('A9', bien ? 'repuesto, reintentable' : 'REVISAR', 'cero material');
  }

  // --- A10: previo con hash incorrecto ------------------------------------
  {
    const s = await escenario('a10');
    const j = journalBase(s.H, { project_id: s.row.id, partition: s.row.partition_name });
    plantarRestauracion(s.H, s.M, j, ESTADO_VIEJO, { shaMalo: true });
    ponerParticion(s.row.partition_name, ESTADO_BACKUP);
    const antes = JSON.stringify(leerParticionSim(s.row.partition_name));
    const nE = escrituras.length;
    const rec = await s.H.recuperarRestauracionesPendientes();
    const bien = rec.ok === false && rec.malos[0].clase === 'rollback-bloqueado' &&
      rec.malos[0].vuelta.estado === 'previo-no-demostrable' &&
      JSON.stringify(leerParticionSim(s.row.partition_name)) === antes &&
      escriturasDesde(nE).filter((x) => /particiones/.test(x.a)).length === 0 &&
      residuos(s.H).length === 1;
    ok('A10 foto previa que no casa con su hash: FAIL-CLOSED, no se reescribe nada', bien,
      JSON.stringify(rec.malos[0] || {}).slice(0, 160));
    anotar('A10', bien ? 'fail-closed' : 'REVISAR', 'material conservado');
  }

  // --- A11/A12/A13: guardas -----------------------------------------------
  {
    const s = await escenario('a11');
    // journal de ACCION propio pendiente
    const aid = 'ba'.repeat(16);
    fsReal.mkdirSync(s.M.accionesDir(), { recursive: true });
    fsReal.writeFileSync(s.M.journalAccionPath(aid), JSON.stringify({
      v: 1, action_id: aid, writer: W_A, tipo: 'backup', base_commit_id: dbmod.getCommitActual(),
      cifrado: 0, destino: path.join(DIR_DATOS, 'backups', 'p-a11', 'x.json'), modo: 'overwrite',
      original_sha256: 'a'.repeat(64), original_size: 1, new_sha256: 'b'.repeat(64), new_size: 1,
      fase: 'publicando', startedAt: 'x',
    }), 'utf8');
    const r = await s.H.ejecutarRestauracion(opcionesRestore(s.row));
    const bien = r.aplicado === false && r.bloqueo === 'accion-no-demostrable' &&
      s.H.hashDump(leerParticionSim(s.row.partition_name)) === s.H.hashDump(ESTADO_VIEJO) &&
      residuos(s.H).length === 0 && s.H.barrera.bloquea(s.row.id) === false;
    ok('A11 journal de accion propio pendiente: la restauracion NO empieza', bien, JSON.stringify(r).slice(0, 120));
    anotar('A11', bien ? 'no empieza' : 'REVISAR', 'cero material');
  }
  {
    const s = await escenario('a12');
    const r0 = await s.H.ejecutarRestauracion(opcionesRestore(s.row, {
      guardas: [() => ({ motivo: 'proyecto-en-borrado', mensaje: 'Este proyecto se esta eliminando.' })],
    }));
    ok('A12 proyecto en borrado: la restauracion NO empieza',
      r0.aplicado === false && r0.bloqueo === 'proyecto-en-borrado' && residuos(s.H).length === 0, JSON.stringify(r0).slice(0, 120));
    anotar('A12', 'no empieza', 'cero material');
  }
  {
    const s = await escenario('a13');
    const r0 = await s.H.ejecutarRestauracion(opcionesRestore(s.row, {
      guardas: [() => ({ motivo: 'rekey', mensaje: 'LA SEGURIDAD SE ESTA ACTUALIZANDO', reintentable: true })],
    }));
    ok('A13 rekey en curso: la restauracion NO empieza',
      r0.aplicado === false && r0.bloqueo === 'rekey' && r0.reintentable === true && residuos(s.H).length === 0);
    anotar('A13', 'no empieza', 'cero material');
  }

  // --- A14: la ventana no cierra ------------------------------------------
  {
    const s = await escenario('a14', { hayWriter: () => true });
    const r = await s.H.ejecutarRestauracion(opcionesRestore(s.row));
    const bien = r.aplicado === false && r.reintentable === true &&
      s.H.hashDump(leerParticionSim(s.row.partition_name)) === s.H.hashDump(ESTADO_VIEJO) &&
      residuos(s.H).length === 0 && s.H.barrera.bloquea(s.row.id) === false;
    ok('A14 queda un writer local: aborta sin tocar nada y desarma limpio', bien, JSON.stringify(r).slice(0, 120));
    anotar('A14', bien ? 'aborta limpio' : 'REVISAR', 'cero material');
  }

  // --- A2 (feliz) y A15 (idempotencia) ------------------------------------
  {
    const s = await escenario('a2feliz');
    const commit0 = dbmod.getCommitActual();
    const r = await s.H.ejecutarRestauracion(opcionesRestore(s.row));
    const hist = JSON.parse(dbmod.get("SELECT value FROM app_meta WHERE key='db_commit_history'").value);
    const bien = r.ok === true && r.aplicado === true && r.verificado === true &&
      s.H.hashDump(leerParticionSim(s.row.partition_name)) === s.H.hashDump(ESTADO_BACKUP) &&
      residuos(s.H).length === 0 && hist[1] === commit0 &&
      JSON.parse(s.M.leerMarcaAcciones().lista ? JSON.stringify(s.M.leerMarcaAcciones().lista) : '[]').indexOf(r.actionId) === 0;
    ok('A2 camino feliz: aplicado/verificado, marca puesta, commit anclado a la base, cero material', bien,
      JSON.stringify({ r: { ok: r.ok, aplicado: r.aplicado, verificado: r.verificado }, anclado: hist[1] === commit0 }));
    anotar('A2', bien ? 'aplicado y limpio' : 'REVISAR', 'cero material');

    const rec1 = await s.H.recuperarRestauracionesPendientes();
    const rec2 = await s.H.recuperarRestauracionesPendientes();
    ok('A15 segundo (y tercer) arranque tras el camino feliz: nada que hacer',
      rec1.ok && rec2.ok && rec1.resultados.length === 0 && rec2.resultados.length === 0);
  }
  {
    // A15 sobre un fail-closed: no degrada
    const s = await escenario('a15');
    const j = journalBase(s.H, { project_id: s.row.id, partition: s.row.partition_name });
    plantarRestauracion(s.H, s.M, j, ESTADO_VIEJO, { shaMalo: true });
    ponerParticion(s.row.partition_name, ESTADO_BACKUP);
    const antes = JSON.stringify(leerParticionSim(s.row.partition_name));
    const r1 = await s.H.recuperarRestauracionesPendientes();
    const r2 = await s.H.recuperarRestauracionesPendientes();
    const bien = r1.ok === false && r2.ok === false &&
      JSON.stringify(leerParticionSim(s.row.partition_name)) === antes && residuos(s.H).length === 1;
    ok('A15 un fail-closed sigue fail-closed tras dos arranques, sin destruir nada', bien);
    anotar('A15', bien ? 'idempotente' : 'REVISAR', 'material conservado');
  }

  // =========================================================================
  seccion('REST-QUIESCE-BASE y REST-NO-STALE-BACKUP');
  // =========================================================================
  {
    const dir = carpeta('quiesce'); await montar(dir, W_A);
    const est = {};
    // Ventanas "abiertas" con cambios en memoria. El cierre por restauracion
    // NO puede provocar ni un flush ni un backup ni un save de meeting/candidate.
    const efectos = [];
    const cerradas = [];
    let commitAlCerrar = null;
    const m = montarHelper(est, {
      cerrarVentanas: async (id) => {
        // Simula el cierre REAL de las tres familias con la marca de
        // restauracion: los hooks consultan la barrera y no escriben.
        for (const fam of ['dashboard', 'meeting', 'candidate']) {
          cerradas.push(fam);
          const puedeEscribir = !m.H.barrera.bloquea(id);
          if (puedeEscribir) {
            efectos.push(fam + ':flush');
            dbmod.run("INSERT INTO backups(project_id,created_at,payload,size) VALUES (?,?,?,?)", [id, 'x', '{}', 2]);
          }
        }
        // El cierre mueve el commit AUNQUE la barrera impida el flush: main.js
        // persiste los bounds de cada ventana al cerrarla (persistWindowBoundsOnClose),
        // y eso es una escritura legitima. Sin esto, capturar la base antes o
        // despues del quiesce daria lo mismo y la prueba no demostraria nada.
        dbmod.run("INSERT INTO app_meta(key,value) VALUES ('win-bounds-proyecto','{}') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
        commitAlCerrar = dbmod.getCommitActual();
      },
    });
    const row = nuevoProyecto('Quiesce', 'p-quiesce');
    ponerParticion(row.partition_name, ESTADO_VIEJO);
    const backupsAntes = dbmod.get('SELECT COUNT(*) n FROM backups').n;
    const commitAntesDeTodo = dbmod.getCommitActual();

    const r = await m.H.ejecutarRestauracion(opcionesRestore(row));
    const hist = JSON.parse(dbmod.get("SELECT value FROM app_meta WHERE key='db_commit_history'").value);

    ok('REST-QUIESCE-BASE se cierran las TRES familias', cerradas.length === 3, JSON.stringify(cerradas));
    ok('REST-QUIESCE-BASE cero flush, cero backup, cero save por esos cierres',
      efectos.length === 0 && dbmod.get('SELECT COUNT(*) n FROM backups').n === backupsAntes,
      JSON.stringify({ efectos, backups: dbmod.get('SELECT COUNT(*) n FROM backups').n }));
    ok('REST-QUIESCE-BASE el cierre SI mueve el commit (si no, la prueba no probaria nada)',
      commitAlCerrar !== commitAntesDeTodo, JSON.stringify({ antes: commitAntesDeTodo.slice(0, 8), tras: (commitAlCerrar || '').slice(0, 8) }));
    ok('REST-QUIESCE-BASE la base se captura DESPUES del quiesce y el commit se ancla a ella',
      r.aplicado === true && hist[1] === commitAlCerrar,
      JSON.stringify({ aplicado: r.aplicado, anclado: hist[1] === commitAlCerrar, hist1: (hist[1] || '').slice(0, 8), alCerrar: (commitAlCerrar || '').slice(0, 8) }));
    ok('REST-NO-STALE-BACKUP el estado descartado no reaparece como backup nuevo',
      dbmod.all('SELECT * FROM backups').every((b) => !String(b.payload).includes('VIEJO')),
      String(dbmod.get('SELECT COUNT(*) n FROM backups').n));

    // Y el contraste: si la barrera NO estuviera, el cierre SI escribiria.
    const efectos2 = [];
    m.H.barrera.desarmar(row.id);
    const puede = !m.H.barrera.bloquea(row.id);
    if (puede) efectos2.push('escribiria');
    ok('REST-QUIESCE-BASE contraste: sin la barrera el cierre SI escribiria',
      efectos2.length === 1, JSON.stringify(efectos2));
  }

  // =========================================================================
  seccion('F-1 / OCUPACION COMUN — los dos sentidos');
  // =========================================================================
  {
    const dir = carpeta('f1'); await montar(dir, W_A);
    const est = {}; const { M, H } = montarHelper(est);
    const row = nuevoProyecto('F1', 'p-f1');
    ponerParticion(row.partition_name, ESTADO_VIEJO);
    const dirBk = path.join(DIR_DATOS, 'backups', 'p-f1');
    fsReal.mkdirSync(dirBk, { recursive: true });

    // (1) borrado propio pendiente -> la restauracion no empieza
    const aidDel = 'ca'.repeat(16);
    fsReal.mkdirSync(M.borradosDir(), { recursive: true });
    fsReal.writeFileSync(M.journalBorradoPath(aidDel), JSON.stringify({
      v: 1, action_id: aidDel, writer: W_A, tipo: 'borrar-proyecto', base_commit_id: dbmod.getCommitActual(),
      fase: 'retirando', startedAt: 'x',
      recursos: [{ tipo: 'directorio', scope: 'subtree', origen: dirBk, cuarentena: M.cuarentenaDe(aidDel, 0), n_archivos: 1, bytes_totales: 1 }],
    }), 'utf8');
    const r1 = await H.ejecutarRestauracion(opcionesRestore(row));
    ok('F-1 (1) borrado propio pendiente -> la restauracion NO empieza',
      r1.aplicado === false && r1.bloqueo === 'accion-no-demostrable' && residuos(H).length === 0, JSON.stringify(r1).slice(0, 120));
    fsReal.unlinkSync(M.journalBorradoPath(aidDel));

    // (2) restauracion propia pendiente -> el dominio comun la ve
    const j = journalBase(H, { project_id: row.id, partition: row.partition_name, backups_dir: dirBk, writer: W_B });
    plantarRestauracion(H, M, j, ESTADO_VIEJO);
    const oc = H.ocupacionComunConRestore(path.join(dirBk, 'backup_x.json'), { scope: 'archivo' });
    ok('F-1 (2) una restauracion AJENA ocupa el subarbol del proyecto',
      oc.ocupado === true && oc.fuente === 'restauracion', JSON.stringify(oc));
    const ocOtro = H.ocupacionComunConRestore(path.join(DIR_DATOS, 'backups', 'p-otro', 'x.json'), { scope: 'archivo' });
    ok('F-1 (2) otro proyecto independiente NO queda ocupado', ocOtro.ocupado === false, JSON.stringify(ocOtro));

    // y una restauracion PROPIA pendiente bloquea F-1
    const j2 = journalBase(H, { project_id: row.id, partition: row.partition_name, backups_dir: dirBk, writer: W_A });
    plantarRestauracion(H, M, j2, ESTADO_VIEJO);
    const f1 = H.f1ConRestore();
    ok('F-1 (2) una restauracion PROPIA pendiente cierra F-1 GLOBAL',
      f1.libre === false && f1.clase === 'pendiente', JSON.stringify(f1).slice(0, 140));
    fsReal.rmSync(H.dirDeAccion(j.action_id), { recursive: true, force: true });
    fsReal.rmSync(H.dirDeAccion(j2.action_id), { recursive: true, force: true });
  }

  // --- REST-W-SUBTREE y REST-X1 -------------------------------------------
  {
    const dir = carpeta('w-subtree'); await montar(dir, W_A);
    const est = {}; const { M, H } = montarHelper(est);
    const row = nuevoProyecto('Subtree', 'p-sub');
    ponerParticion(row.partition_name, ESTADO_VIEJO);
    const dirBk = path.join(DIR_DATOS, 'backups', 'p-sub');
    fsReal.mkdirSync(dirBk, { recursive: true });

    // Un borrado AJENO reserva el subarbol del proyecto
    const aid = 'da'.repeat(16);
    fsReal.mkdirSync(M.borradosDir(), { recursive: true });
    fsReal.writeFileSync(M.journalBorradoPath(aid), JSON.stringify({
      v: 1, action_id: aid, writer: W_B, tipo: 'borrar-proyecto', base_commit_id: commitFalso(),
      fase: 'retirando', startedAt: 'x',
      recursos: [{ tipo: 'directorio', scope: 'subtree', origen: dirBk, cuarentena: M.cuarentenaDe(aid, 0), n_archivos: 1, bytes_totales: 1 }],
    }), 'utf8');
    const r = await H.ejecutarRestauracion(opcionesRestore(row));
    ok('REST-W-SUBTREE otro equipo reserva el subarbol: la restauracion se rechaza',
      r.aplicado === false && r.bloqueo === 'ocupado-otro-writer' &&
      H.hashDump(leerParticionSim(row.partition_name)) === H.hashDump(ESTADO_VIEJO), JSON.stringify(r).slice(0, 120));
    fsReal.unlinkSync(M.journalBorradoPath(aid));

    // REST-X1: journal de ACCION ajeno sobre un archivo del proyecto
    const aidAcc = 'db'.repeat(16);
    fsReal.mkdirSync(M.accionesDir(), { recursive: true });
    fsReal.writeFileSync(M.journalAccionPath(aidAcc), JSON.stringify({
      v: 1, action_id: aidAcc, writer: W_B, tipo: 'candidate-eval', base_commit_id: commitFalso(),
      cifrado: 0, destino: path.join(dirBk, 'evaluacion-candidatos', 'estado.json'), modo: 'overwrite',
      original_sha256: 'a'.repeat(64), original_size: 1, new_sha256: 'b'.repeat(64), new_size: 1,
      fase: 'publicando', startedAt: 'x',
    }), 'utf8');
    const rX = await H.ejecutarRestauracion(opcionesRestore(row));
    ok('REST-X1 journal de accion ajeno dentro del proyecto: la restauracion no empieza',
      rX.aplicado === false && rX.bloqueo === 'ocupado-otro-writer', JSON.stringify(rX).slice(0, 120));
  }

  // =========================================================================
  seccion('REST-REKEY-1..4 — material residual bloquea el rekey');
  // =========================================================================
  {
    const dir = carpeta('rekey'); await montar(dir, W_A);
    const est = {}; const { M, H } = montarHelper(est);
    const row = nuevoProyecto('Rekey', 'p-rekey');

    // 1: journal pendiente
    const j = journalBase(H, { project_id: row.id, partition: row.partition_name });
    plantarRestauracion(H, M, j, ESTADO_VIEJO);
    const r1 = H.rekeyPuedeEmpezar();
    ok('REST-REKEY-1 journal de restauracion pendiente: el rekey NO empieza',
      r1.puede === false && r1.clase === 'material-pendiente', JSON.stringify(r1).slice(0, 140));

    // 2: restauracion aplicada, cleanup pendiente -> queda previo.enc SIN journal
    fsReal.unlinkSync(H.journalPath(j.action_id));
    const r2 = H.rekeyPuedeEmpezar();
    ok('REST-REKEY-2 material residual SIN journal (cleanup fallido): el rekey tampoco empieza',
      r2.puede === false && r2.clase === 'material-pendiente' &&
      r2.pendientes[0].archivos.indexOf('previo.enc') >= 0, JSON.stringify(r2).slice(0, 180));

    // 3: cleanup completo
    fsReal.rmSync(H.dirDeAccion(j.action_id), { recursive: true, force: true });
    const r3 = H.rekeyPuedeEmpezar();
    ok('REST-REKEY-3 cleanup completo: rekey permitido', r3.puede === true, JSON.stringify(r3));

    // 4: material invalido/ilegible -> fail-closed, jamas borrarlo
    const aid4 = 'ea'.repeat(16);
    fsReal.mkdirSync(H.dirDeAccion(aid4), { recursive: true });
    fsReal.writeFileSync(H.journalPath(aid4), '{ esto no es json', 'utf8');
    fsReal.writeFileSync(H.previoPath(aid4), 'BASURA CIFRADA', 'utf8');
    const r4 = H.rekeyPuedeEmpezar();
    const rec4 = await H.recuperarRestauracionesPendientes();
    ok('REST-REKEY-4 material invalido: rekey bloqueado y NUNCA se borra a ciegas',
      r4.puede === false && rec4.ok === false &&
      fsReal.existsSync(H.journalPath(aid4)) && fsReal.existsSync(H.previoPath(aid4)),
      JSON.stringify({ rekey: r4.clase, rec: rec4.malos[0] && rec4.malos[0].clase }));
    ok('REST-REKEY no amplia collectRekeyInventory: es una PRECONDICION, no inventario',
      !/panorama-restauraciones/.test(extraer('function collectRekeyInventory()')));
    fsReal.rmSync(H.dirDeAccion(aid4), { recursive: true, force: true });
  }

  // =========================================================================
  seccion('REST-LEGACY-SLUG — backup_dir NULL sin efectos colaterales');
  // =========================================================================
  {
    const dir = carpeta('legacy'); await montar(dir, W_A);
    const est = {}; const { M, H } = montarHelper(est);
    const row = nuevoProyecto('Legado SA');   // backup_dir NULL
    ok('REST-LEGACY-SLUG el proyecto tiene backup_dir NULL (control)', row.backup_dir === null);
    ponerParticion(row.partition_name, ESTADO_VIEJO);

    const commit0 = dbmod.getCommitActual();
    const filaAntes = JSON.stringify(dbmod.get('SELECT * FROM projects WHERE id=?', [row.id]));
    const rutaPura = H.rutaBackupsPura(row);
    const nE = escrituras.length;
    const slug = H.slugDeProyectoPuro(row);
    const rowTras = dbmod.get('SELECT * FROM projects WHERE id=?', [row.id]);
    ok('REST-LEGACY-SLUG resolver la ruta NO cambia el commit',
      dbmod.getCommitActual() === commit0);
    ok('REST-LEGACY-SLUG NO hace UPDATE lateral de backup_dir',
      JSON.stringify(rowTras) === filaAntes && rowTras.backup_dir === null);
    ok('REST-LEGACY-SLUG NO crea la carpeta (cero mkdir incidental)',
      !fsReal.existsSync(rutaPura) && escriturasDesde(nE).length === 0, rutaPura);
    ok('REST-LEGACY-SLUG el slug derivado coincide con el de produccion',
      slug === `${row.id}-${M.slugify(row.name)}`, slug);
    // contraste: la funcion de produccion SI tiene los dos efectos
    const c1 = dbmod.getCommitActual();
    const slugProd = M.ensureProjectBackupDirSlug(row);
    ok('REST-LEGACY-SLUG contraste: ensureProjectBackupDirSlug SI hace UPDATE y SI mueve el commit',
      slugProd === slug && dbmod.getCommitActual() !== c1 &&
      dbmod.get('SELECT backup_dir FROM projects WHERE id=?', [row.id]).backup_dir === slug);
  }

  // =========================================================================
  seccion('REST-COL-1/2/3 — colisiones de recovery');
  // =========================================================================
  {
    const dir = carpeta('col'); await montar(dir, W_A);
    const est = {}; const { M, H } = montarHelper(est);
    const row = nuevoProyecto('Colision', 'p-col');
    ponerParticion(row.partition_name, ESTADO_VIEJO);
    const dirBk = path.join(DIR_DATOS, 'backups', 'p-col');
    fsReal.mkdirSync(dirBk, { recursive: true });

    // COL-1: restore de X + accion PROPIA cuyo destino cae dentro de X
    const j = journalBase(H, { project_id: row.id, partition: row.partition_name, backups_dir: dirBk });
    plantarRestauracion(H, M, j, ESTADO_VIEJO);
    const aidAcc = 'fa'.repeat(16);
    fsReal.mkdirSync(M.accionesDir(), { recursive: true });
    fsReal.writeFileSync(M.journalAccionPath(aidAcc), JSON.stringify({
      v: 1, action_id: aidAcc, writer: W_A, tipo: 'backup', base_commit_id: dbmod.getCommitActual(),
      cifrado: 0, destino: path.join(dirBk, 'x.json'), modo: 'overwrite',
      original_sha256: 'a'.repeat(64), original_size: 1, new_sha256: 'b'.repeat(64), new_size: 1,
      fase: 'publicando', startedAt: 'x',
    }), 'utf8');
    const antesPart = JSON.stringify(leerParticionSim(row.partition_name));
    const f1 = H.f1ConRestore();
    const nuevo = await H.ejecutarRestauracion(opcionesRestore(row));
    ok('REST-COL-1 restore + accion propia sobre el mismo proyecto: ninguna nueva empieza',
      f1.libre === false && nuevo.aplicado === false && nuevo.bloqueo === 'accion-no-demostrable' &&
      JSON.stringify(leerParticionSim(row.partition_name)) === antesPart,
      JSON.stringify({ f1: f1.clase, bloqueo: nuevo.bloqueo }));
    ok('REST-COL-1 y los dos journals se conservan, ninguno se resuelve a medias',
      fsReal.existsSync(H.journalPath(j.action_id)) && fsReal.existsSync(M.journalAccionPath(aidAcc)));
    fsReal.unlinkSync(M.journalAccionPath(aidAcc));

    // COL-2: restore de X + borrado de X
    const aidDel = 'fb'.repeat(16);
    fsReal.mkdirSync(M.borradosDir(), { recursive: true });
    fsReal.writeFileSync(M.journalBorradoPath(aidDel), JSON.stringify({
      v: 1, action_id: aidDel, writer: W_A, tipo: 'borrar-proyecto', base_commit_id: dbmod.getCommitActual(),
      fase: 'retirando', startedAt: 'x',
      recursos: [{ tipo: 'directorio', scope: 'subtree', origen: dirBk, cuarentena: M.cuarentenaDe(aidDel, 0), n_archivos: 1, bytes_totales: 1 }],
    }), 'utf8');
    const f1b = H.f1ConRestore();
    const r2 = await H.ejecutarRestauracion(opcionesRestore(row));
    ok('REST-COL-2 restore + borrado del mismo proyecto: ninguna nueva empieza',
      f1b.libre === false && r2.aplicado === false &&
      fsReal.existsSync(H.journalPath(j.action_id)) && fsReal.existsSync(M.journalBorradoPath(aidDel)),
      JSON.stringify({ f1: f1b.clase, bloqueo: r2.bloqueo }));
    fsReal.unlinkSync(M.journalBorradoPath(aidDel));
    fsReal.rmSync(H.dirDeAccion(j.action_id), { recursive: true, force: true });

    // COL-3: restore de X + journals de OTRO proyecto -> no es colision
    const otro = nuevoProyecto('Otro', 'p-otro');
    ponerParticion(otro.partition_name, ESTADO_VIEJO);
    const dirOtro = path.join(DIR_DATOS, 'backups', 'p-otro');
    fsReal.mkdirSync(dirOtro, { recursive: true });
    const aidAjeno = 'fc'.repeat(16);
    fsReal.writeFileSync(M.journalBorradoPath(aidAjeno), JSON.stringify({
      v: 1, action_id: aidAjeno, writer: W_B, tipo: 'borrar-proyecto', base_commit_id: commitFalso(),
      fase: 'retirando', startedAt: 'x',
      recursos: [{ tipo: 'directorio', scope: 'subtree', origen: dirOtro, cuarentena: M.cuarentenaDe(aidAjeno, 0), n_archivos: 1, bytes_totales: 1 }],
    }), 'utf8');
    const r3 = await H.ejecutarRestauracion(opcionesRestore(row));
    ok('REST-COL-3 journals de OTRO proyecto: la restauracion SI puede seguir',
      r3.ok === true && r3.aplicado === true && r3.verificado === true &&
      H.hashDump(leerParticionSim(row.partition_name)) === H.hashDump(ESTADO_BACKUP),
      JSON.stringify(r3).slice(0, 140));
    ok('REST-COL-3 y el journal ajeno del otro proyecto sigue intacto',
      fsReal.existsSync(M.journalBorradoPath(aidAjeno)));
  }

  // =========================================================================
  seccion('CLEANUP FALLIDO y BARRERA REARMABLE');
  // =========================================================================
  {
    const s = await escenario('cleanup');
    s.H._inyectarFalloEn('en-cleanup');
    const r = await s.H.ejecutarRestauracion(opcionesRestore(s.row));
    ok('cleanup fallido: la restauracion SIGUE siendo exito y la limpieza queda pendiente',
      r.ok === true && r.aplicado === true && r.verificado === true && r.limpieza.ok === false &&
      residuos(s.H).length === 1, JSON.stringify(r.limpieza));
    ok('cleanup fallido: el rekey queda bloqueado por el material residual',
      s.H.rekeyPuedeEmpezar().puede === false);
    const rec = await s.H.recuperarRestauracionesPendientes();
    ok('cleanup fallido: al arrancar se completa y entonces el rekey se permite',
      rec.ok === true && residuos(s.H).length === 0 && s.H.rekeyPuedeEmpezar().puede === true,
      JSON.stringify(rec.resultados[0] || {}));
  }
  {
    const s = await escenario('rearme');
    const j = journalBase(s.H, { project_id: s.row.id, partition: s.row.partition_name });
    plantarRestauracion(s.H, s.M, j, ESTADO_VIEJO);
    ok('la barrera NO esta armada antes de arrancar', s.H.barrera.bloquea(s.row.id) === false);
    const re = s.H.barrera.rearmarDesdeDisco();
    ok('la barrera se REARMA desde el journal al arrancar',
      re.ok && s.H.barrera.bloquea(s.row.id) === true, JSON.stringify(re));
    const rec = await s.H.recuperarRestauracionesPendientes();
    ok('y se desarma cuando la restauracion queda resuelta',
      rec.ok && s.H.barrera.bloquea(s.row.id) === false);
  }

  // =========================================================================
  seccion('CIFRADO DE LA FOTO PREVIA');
  // =========================================================================
  {
    const clave = securitymod.deriveKey('pass', securitymod.newSaltHex());
    const s = await escenario('cifrado', { getSecurityKey: () => clave });
    const r = await s.H.ejecutarRestauracion(opcionesRestore(s.row, { }));
    ok('con la Seguridad activa la restauracion funciona igual',
      r.aplicado === true && s.H.hashDump(leerParticionSim(s.row.partition_name)) === s.H.hashDump(ESTADO_BACKUP));
    // y la foto previa va cifrada: se comprueba plantando una y leyendola
    const s2 = await escenario('cifrado2', { getSecurityKey: () => clave });
    s2.H._inyectarFalloEn('tras-journal');
    await s2.H.ejecutarRestauracion(opcionesRestore(s2.row));
    // ese camino borra el material; se planta uno a mano con cifrado real
    const j = journalBase(s2.H, { project_id: s2.row.id, partition: s2.row.partition_name, cifrado: 1 });
    fsReal.mkdirSync(s2.H.dirDeAccion(j.action_id), { recursive: true });
    const p = s2.H.escribirPrevio(j.action_id, j, ESTADO_VIEJO);
    j.cifrado = p.cifrado; j.previo_sha256 = p.sha256; j.previo_size = p.size; j.previo_n_claves = p.n_claves;
    fsReal.writeFileSync(s2.H.journalPath(j.action_id), JSON.stringify(j, null, 2), 'utf8');
    const crudo = fsReal.readFileSync(s2.H.previoPath(j.action_id), 'utf8');
    ok('la foto previa queda CIFRADA en disco (no se ve el contenido en claro)',
      p.cifrado === 1 && !crudo.includes('VIEJO') && securitymod.looksEncrypted(crudo), crudo.slice(0, 60));
    const leida = s2.H.leerPrevio(j);
    ok('y se puede descifrar y validar por hash', leida.ok && s2.H.hashDump(leida.dump) === s2.H.hashDump(ESTADO_VIEJO),
      JSON.stringify(leida.motivo || ''));
    // Sin clave, NO se usa. OJO: hay que montar el helper sobre el MISMO
    // sandbox (DIR_DATOS no puede cambiar), o el archivo "no esta" y la prueba
    // pasaria por el motivo equivocado.
    const sinClave = montarHelper({}, { getSecurityKey: () => null });
    const leidaSinClave = sinClave.H.leerPrevio(j);
    ok('sin la clave, la foto previa NO se usa para reponer nada',
      leidaSinClave.ok === false && /cifrada/.test(leidaSinClave.motivo), JSON.stringify(leidaSinClave));
  }

  // =========================================================================
  seccion('RESIDUOS Y PRODUCCION');
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
    ok('sin residuos .tmp- ni .old- en ninguna carpeta de prueba', restos.length === 0, restos.slice(0, 5).join(', '));
    ok('todas las rutas usadas bajo la marca de pruebas', RAIZ.includes(MARCA_PRUEBAS));
  }

  console.log('\n  MATRIZ A1-A15');
  console.log('  ' + 'id'.padEnd(6) + 'veredicto'.padEnd(30) + 'residuo');
  console.log('  ' + '-'.repeat(80));
  for (const a of resumenA) console.log('  ' + a.id.padEnd(6) + String(a.v).padEnd(30) + a.res);

  console.log('\n' + '='.repeat(70));
  console.log(`  A2 — helper y recovery de restauracion aislados: ${pass} OK, ${fail} FALLOS`);
  if (fallos.length) fallos.forEach((f) => console.log('    - ' + f));
  console.log('='.repeat(70));
  try { dbmod._resetParaPruebas(); } catch (e) {}
  fsReal.rmSync(RAIZ, { recursive: true, force: true });
  console.log('  carpeta de prueba borrada: ' + !fsReal.existsSync(RAIZ));
  process.exitCode = fail === 0 ? 0 : 1;
})().catch((e) => { console.error('EXCEPCION:', e); process.exit(2); });
