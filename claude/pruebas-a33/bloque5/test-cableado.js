'use strict';
// ---------------------------------------------------------------------------
// BLOQUE 5 — CABLEADO PRODUCTIVO D1-D4, integracion sobre los handlers REALES.
//
// D1 deleteProjectById · D2 meeting:deletePrep · D3 purga de backups ·
// D4 CV (las seis CV-RM/CV-REPLACE viven en test-borrados.js, contra el HTML
// productivo). Aqui ademas: contratos, y que ningun consumidor decida por la
// truthiness de un objeto de error.
//
// Todo en sandbox artificial bajo %TEMP%. NUNCA G:.
// ---------------------------------------------------------------------------
const fsReal = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const Module = require('module');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const MARCA_PRUEBAS = '_a33-bloque5-CABLEADO';
const RAIZ = path.join(os.tmpdir(), MARCA_PRUEBAS);

const GUARDIA = require(path.join(__dirname, '..', 'comun', 'guardia-rutas.js'));
const guardia = GUARDIA.crearGuardia({ marca: MARCA_PRUEBAS });
const segura = guardia.segura;
segura(RAIZ);
fsReal.rmSync(RAIZ, { recursive: true, force: true });
fsReal.mkdirSync(RAIZ, { recursive: true });

// fs instrumentado: registra los rename, para poder afirmar que NO-CLOBBER ni
// siquiera intenta reponer.
const renames = [];
const fs = Object.assign({}, fsReal);
fs.renameSync = function (a, b) { renames.push({ de: String(a), a: String(b) }); return fsReal.renameSync(a, b); };
function renamesHacia(i, destino) {
  const d = path.resolve(destino).toLowerCase();
  return renames.slice(i).filter((r) => path.resolve(r.a).toLowerCase() === d);
}

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
function extraerHandler(canal, nombre) {
  const marca = `ipcMain.handle('${canal}'`;
  const i = SRC.indexOf(marca);
  if (i < 0) throw new Error('NO SE ENCONTRO handler ' + canal);
  const flecha = SRC.indexOf('=> {', i);
  const cabecera = SRC.slice(i, flecha);
  const esAsync = /,\s*async\s*\(/.test(cabecera);
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
  // --- D1 ---
  // A2: la firma cambió al añadir el modo "por restauración".
  'async function cerrarVentanasDeProyecto(id, opciones)',
  'async function avisarResultadoBorradoProyecto(winOriginal, r, nombre)',
  'async function deleteProjectById(id)',
];
BLOQUES.push.apply(BLOQUES, B5.BLOQUES_B5);

const HANDLERS = [
  ['meeting:deletePrep', 'borrarPrep'],
  ['backup:save', 'guardarBackup'],
];

const CONSTS = B5.sinRepetir([
  lineaConst('const FSYNC_NO_SOPORTADO_REG'),
  lineaConst("const ACCIONES_DIR_NAME = '.panorama-acciones';"),
  lineaConst('const ACCIONES_JOURNAL_V ='),
  lineaConst('const ACCIONES_MARCA_MAX ='),
  lineaConst('const ACCIONES_TIPOS ='),
  lineaConst('const esHex ='),
  lineaConst('const esEnteroNoNegativo ='),
  lineaConst("const REKEY_DIR_NAME = '.panorama-rekey';"),
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
    // (restoreInProgress lo aporta ahora PREAMBULO_B5: A2 lo convirtio en alias de proyectosEnRestauracion)
    "const REKEY_BUSY_MESSAGE = 'LA SEGURIDAD SE ESTA ACTUALIZANDO';\n" +
    'const projectWindows = new Map();\n' +
    'const meetingPrepWindows = new Map();\n' +
    'const candidateEvalWindows = new Map();\n' +
    B5.PREAMBULO_B5 +
    BLOQUES.map(extraer).join('\n\n') + '\n' +
    HANDLERS.map(([c, n]) => extraerHandler(c, n)).join('\n\n') + '\n' +
    'return { deleteProjectById, cerrarVentanasDeProyecto, avisarResultadoBorradoProyecto,\n' +
    '         borrarPrep, guardarBackup, purgarBackupsAntiguos,\n' +
    '         ejecutarBorrado, recuperarBorradosPendientes, reponerRecurso,\n' +
    '         ocupacionComun, f1Global, f1Borrados, journalsDeBorrados, borradosDir,\n' +
    '         journalBorradoPath, cuarentenaDe, rutaBackupsPura, rutaDashboardPura,\n' +
    '         slugDeProyectoPuro, estaDentroDe, existeRuta,\n' +
    '         ejecutarAccionDeArchivo, accionesDir, journalAccionPath, leerMarcaAcciones,\n' +
    '         sentenciaMarcaAccion, sha256DeArchivo, escribirJsonDurable,\n' +
    '         projectWindows, meetingPrepWindows, candidateEvalWindows, proyectosEnBorrado,\n' +
    '         proyectoBloqueadoPorBorrado,\n' +
    '         setKey: (k) => { securityKey = k; },\n' +
    '         setComprometido: (v) => { procesoComprometido = v; } };';
  const f = new Function('app', 'fs', 'path', 'crypto', 'dbmod', 'securitymod', 'appLog', 'getMeta',
    'session', 'modalAlert', 'backupsDirForProject', 'meetingPrepsDirForProject',
    'candidateEvalFileForProject', 'localSafetyBackupsDirForProject', 'purgeOldLocalSafetyBackups',
    'regenerateProjectDashboardFile', cuerpo);
  const mk = (p) => { fsReal.mkdirSync(p, { recursive: true }); return p; };
  const dbDoble = o.dbmod || dbmod;
  const sesDoble = o.session || { fromPartition: () => ({ clearStorageData: () => Promise.resolve() }) };
  return f(appDoble, fs, path, crypto, dbDoble, securitymod,
    (s) => { (est.log = est.log || []).push(s); },
    (k) => { const r = dbmod.get('SELECT value FROM app_meta WHERE key=?', [k]); return r ? r.value : null; },
    sesDoble,
    (win, msg, opts) => { (est.alerts = est.alerts || []).push({ msg, opts }); return Promise.resolve(); },
    // Las rutas REALES del proyecto, para que los handlers escriban donde toca.
    (row) => mk(path.join(DIR_DATOS, 'backups', row.backup_dir || `${row.id}-${slugifyLocal(row.name)}`)),
    (row) => mk(path.join(DIR_DATOS, 'backups', row.backup_dir || `${row.id}-${slugifyLocal(row.name)}`, 'reuniones')),
    (row) => path.join(mk(path.join(DIR_DATOS, 'backups', row.backup_dir || `${row.id}-${slugifyLocal(row.name)}`, 'evaluacion-candidatos')), 'estado.json'),
    (row) => mk(path.join(DIR_APPDATA, 'rescate', String(row.id))),
    () => {},
    () => { (est.horneados = est.horneados || []).push(1); });
}
// slugify del propio main.js, para que las rutas del arnes coincidan.
const slugifyLocal = new Function('return ' + extraer('function slugify('))();

function dbmodCon(fnEscribir) {
  return Object.assign(Object.create(Object.getPrototypeOf(dbmod)), dbmod, { escribirMultiple: fnEscribir });
}

// ---------------------------------------------------------------------------
let SQL = null;
async function montar(dir, writer) {
  segura(dir);
  dbmod._resetParaPruebas();
  DIR_DATOS = dir;
  if (writer) dbmod.setInstallationId(writer);
  await dbmod.getDb({ crearSiAusente: true });
}
function nuevoProyecto(nombre, particion, slug) {
  const pid = dbmod.run(
    'INSERT INTO projects(name,client,partition_name,created_at,updated_at,backup_dir) VALUES (?,?,?,?,?,?)',
    [nombre, 'c', particion || ('persist:' + nombre), 'x', 'x', slug === undefined ? null : slug]);
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
  fsReal.writeFileSync(p + '.gen', JSON.stringify({ v: 2, gen: o.gen || 99, commit_id: o.commit, parent_commit_id: o.parent, writer: 'BBBB'.padEnd(32, '0'), at: new Date().toISOString() }), 'utf8');
}
function arbol(dir, n, etq) {
  fsReal.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < n; i++) fsReal.writeFileSync(path.join(dir, `f${i}.json`), `${etq}-${i}`, 'utf8');
  return dir;
}
function huella(dir) {
  if (!fsReal.existsSync(dir)) return 'NO-EXISTE';
  const out = [];
  const rec = (d, pre) => {
    for (const e of fsReal.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) rec(f, pre + e.name + '/');
      else out.push(pre + e.name + ':' + crypto.createHash('sha256').update(fsReal.readFileSync(f)).digest('hex').slice(0, 10));
    }
  };
  rec(dir, '');
  return out.join('|');
}
const W_A = 'a'.repeat(32);
const W_B = 'b'.repeat(32);
const commitFalso = () => crypto.randomBytes(16).toString('hex');
const nFilas = (t, w, p) => dbmod.get(`SELECT COUNT(*) n FROM ${t}` + (w ? ' WHERE ' + w : ''), p || []).n;

// Prepara un proyecto COMPLETO: carpeta de backups, dashboard horneado,
// 1 backup, 1 prep, 1 evaluacion.
function proyectoCompleto(dir, row) {
  const slug = row.backup_dir || `${row.id}-${slugifyLocal(row.name)}`;
  const dirBk = arbol(path.join(dir, 'backups', slug), 2, 'bk');
  arbol(path.join(dirBk, 'reuniones'), 1, 'prep');
  arbol(path.join(dirBk, 'evaluacion-candidatos'), 1, 'eval');
  const dirDash = arbol(path.join(dir, 'projects', String(row.id)), 2, 'dash');
  dbmod.escribirMultiple([
    { sql: 'INSERT INTO backups(project_id,created_at,payload,size) VALUES (?,?,?,?)', params: [row.id, 'x', '{}', 2] },
    { sql: 'INSERT INTO meeting_preps(project_id,created_at,file_path) VALUES (?,?,?)', params: [row.id, 'x', 'p.json'] },
    { sql: 'INSERT INTO candidate_evals(project_id,updated_at) VALUES (?,?)', params: [row.id, 'x'] },
  ]);
  return { slug, dirBk, dirDash };
}

// ===========================================================================
(async () => {
  SQL = await initSqlJs({ locateFile: (f) => path.join(PROJ, 'node_modules', 'sql.js', 'dist', f) });
  console.log('BLOQUE 5 — CABLEADO PRODUCTIVO D1-D4 (integracion)');
  console.log('  main.js bajo prueba: ' + RUTA_MAIN);

  // =========================================================================
  seccion('D1 — deleteProjectById');
  // =========================================================================
  {
    const dir = carpeta('d1-feliz'); await montar(dir, W_A);
    const est = {}; const M = construirMain(est);
    const row = nuevoProyecto('Servicio Uno', 'persist:p1');
    const { dirBk, dirDash } = proyectoCompleto(dir, row);
    const otro = nuevoProyecto('Servicio Dos', 'persist:p2');
    const { dirBk: dirBk2 } = proyectoCompleto(dir, otro);
    const h2 = huella(dirBk2);

    // ventanas abiertas de las TRES clases
    const cerradas = [];
    // Doble FIEL: 'closed' se emite cuando se llama a close(), no al
    // registrarse el listener. Con la version anterior el resolve llegaba antes
    // que el close() y la ultima ventana se quedaba a medio cerrar — un fallo
    // del arnes que se leia como fallo del quiesce.
    const ventana = (n) => {
      const w = {
        _cb: null, _destruida: false,
        isDestroyed: () => w._destruida,
        once: (ev, cb) => { if (ev === 'closed') w._cb = cb; },
        close: () => { cerradas.push(n); w._destruida = true; if (w._cb) setImmediate(w._cb); },
      };
      return w;
    };
    M.projectWindows.set(row.id, ventana('proyecto'));
    M.meetingPrepWindows.set(row.id, ventana('prep'));
    M.candidateEvalWindows.set(row.id, ventana('eval'));

    const commit0 = dbmod.getCommitActual();
    const r = await M.deleteProjectById(row.id);
    ok('D1) borrado feliz: contrato aplicado:true/verificado:true',
      r.ok === true && r.aplicado === true && r.verificado === true, JSON.stringify(r));
    ok('D1) se cerraron las TRES ventanas del proyecto antes de tocar nada',
      cerradas.length === 3 && M.projectWindows.size === 0 && M.meetingPrepWindows.size === 0 && M.candidateEvalWindows.size === 0,
      JSON.stringify(cerradas));
    ok('D1) las filas de las CUATRO tablas desaparecen',
      nFilas('projects', 'id=?', [row.id]) === 0 && nFilas('backups', 'project_id=?', [row.id]) === 0 &&
      nFilas('meeting_preps', 'project_id=?', [row.id]) === 0 && nFilas('candidate_evals', 'project_id=?', [row.id]) === 0);
    ok('D1) y desaparecen JUNTAS: un solo commit desde la base capturada',
      dbmod.getCommitActual() !== commit0 &&
      JSON.parse(dbmod.get("SELECT value FROM app_meta WHERE key='db_commit_history'").value)[1] === commit0,
      JSON.stringify(JSON.parse(dbmod.get("SELECT value FROM app_meta WHERE key='db_commit_history'").value).slice(0, 2)));
    ok('D1) carpeta de backups y dashboard horneado desaparecen',
      !fsReal.existsSync(dirBk) && !fsReal.existsSync(dirDash));
    ok('D1) la cuarentena se purga y no queda journal',
      !fsReal.existsSync(M.borradosDir()) || fsReal.readdirSync(M.borradosDir()).length === 0);
    ok('D1) el OTRO proyecto no se toca', nFilas('projects', 'id=?', [otro.id]) === 1 && huella(dirBk2) === h2);
    ok('D1) el bloqueo local queda liberado', M.proyectoBloqueadoPorBorrado(row.id) === false);
  }

  {
    const dir = carpeta('d1-particion'); await montar(dir, W_A);
    const est = {}; const vaciadas = [];
    const M = construirMain(est, { session: { fromPartition: (p) => ({ clearStorageData: () => { vaciadas.push(p); return Promise.resolve(); } }) } });
    const row = nuevoProyecto('Con Particion', 'persist:zzz');
    const { dirBk } = proyectoCompleto(dir, row);
    // Se comprueba que la particion NO se vacia antes del commit: si el commit
    // falla, no puede haberse vaciado nada.
    const estF = {};
    const MF = construirMain(estF, {
      dbmod: dbmodCon(() => { const e = new Error('rechazo'); e.kind = 'conflicto'; throw e; }),
      session: { fromPartition: (p) => ({ clearStorageData: () => { vaciadas.push('NO-DEBERIA:' + p); return Promise.resolve(); } }) },
    });
    const rf = await MF.deleteProjectById(row.id);
    ok('D1) si el commit falla, la particion NO se vacia y los archivos vuelven',
      rf.aplicado === false && vaciadas.length === 0 && fsReal.existsSync(dirBk) && nFilas('projects', 'id=?', [row.id]) === 1,
      JSON.stringify({ aplicado: rf.aplicado, vaciadas }));
    const r = await M.deleteProjectById(row.id);
    ok('D1) la particion se vacia SOLO despues de confirmar',
      r.aplicado === true && vaciadas.length === 1 && vaciadas[0] === 'persist:zzz', JSON.stringify(vaciadas));
  }

  {
    const dir = carpeta('d1-base'); await montar(dir, W_A);
    const est = {}; const M = construirMain(est);
    const row = nuevoProyecto('Base Cambiada', 'persist:bc');
    const { dirBk, dirDash } = proyectoCompleto(dir, row);
    const hBk = huella(dirBk), hDash = huella(dirDash);
    publicarComoOtroEquipo(dir, { commit: commitFalso(), parent: dbmod.getCommitActual(), gen: 77 });
    const r = await M.deleteProjectById(row.id);
    ok('D1) base-cambiada -> rollback COMPLETO, reintentable, nada borrado',
      r.aplicado === false && r.reintentable === true &&
      huella(dirBk) === hBk && huella(dirDash) === hDash &&
      nFilas('projects', 'id=?', [row.id]) === 1 && nFilas('backups', 'project_id=?', [row.id]) === 1 &&
      (!fsReal.existsSync(M.borradosDir()) || fsReal.readdirSync(M.borradosDir()).filter((f) => /\.json$/.test(f)).length === 0),
      JSON.stringify({ aplicado: r.aplicado, reintentable: r.reintentable }));
  }

  {
    const dir = carpeta('d1-sinverificar'); await montar(dir, W_A);
    const est = {};
    const M = construirMain(est, {
      dbmod: dbmodCon((s, o) => {
        dbmod.escribirMultiple(s, o);
        const e = new Error('no se pudo releer tras confirmar'); e.aplicado = true; e.kind = 'io-tras-confirmar';
        throw e;
      }),
    });
    const row = nuevoProyecto('Sin Verificar', 'persist:sv');
    const { dirBk } = proyectoCompleto(dir, row);
    const r = await M.deleteProjectById(row.id);
    ok('D1) aplicado:true/verificado:false -> forma 3, NO se repone nada',
      r.ok === true && r.aplicado === true && r.verificado === false && r.requiereReinicio === true &&
      typeof r.aviso === 'string' && nFilas('projects', 'id=?', [row.id]) === 0 && !fsReal.existsSync(dirBk),
      JSON.stringify({ ok: r.ok, aplicado: r.aplicado, verificado: r.verificado }));
    // y los dos menus nativos NO invitan a repetir
    const est2 = { alerts: [] };
    const M2 = construirMain(est2);
    await M2.avisarResultadoBorradoProyecto(null, r, 'Sin Verificar');
    ok('D1) el aviso de forma 3 dice que hay que reiniciar y NO ofrece reintentar',
      est2.alerts.length === 1 && /reiniciar/i.test(est2.alerts[0].opts.title) && /NO repitas/i.test(est2.alerts[0].msg),
      JSON.stringify(est2.alerts[0] || {}));
    const est3 = { alerts: [] };
    const M3 = construirMain(est3);
    await M3.avisarResultadoBorradoProyecto(null, { ok: false, aplicado: false, error: 'lo que sea' }, 'X');
    ok('D1) y un no-aplicado avisa de que NO se ha eliminado',
      est3.alerts.length === 1 && /No se ha eliminado/i.test(est3.alerts[0].opts.title));
  }

  {
    const dir = carpeta('d1-clearfail'); await montar(dir, W_A);
    const est = {};
    const M = construirMain(est, { session: { fromPartition: () => ({ clearStorageData: () => { throw new Error('clearStorageData fallo'); } }) } });
    const row = nuevoProyecto('Clear Falla', 'persist:cf');
    const { dirBk } = proyectoCompleto(dir, row);
    const r = await M.deleteProjectById(row.id);
    ok('D1) clearStorageData falla: los datos SI se eliminaron y queda limpieza pendiente',
      r.aplicado === true && r.verificado === true && r.purga.ok === false && r.purga.particionPendiente === true &&
      nFilas('projects', 'id=?', [row.id]) === 0 && !fsReal.existsSync(dirBk) &&
      fsReal.existsSync(M.journalBorradoPath(r.actionId)),
      JSON.stringify({ purga: r.purga }));
    // y al arrancar se reintenta
    const est2 = {}; let intentos = 0;
    const M2 = construirMain(est2, { session: { fromPartition: () => ({ clearStorageData: () => { intentos++; return Promise.resolve(); } }) } });
    const rec = await M2.recuperarBorradosPendientes();
    ok('D1) al arrancar se reintenta la particion y entonces se cierra',
      rec.ok === true && intentos === 1 && !fsReal.existsSync(M.journalBorradoPath(r.actionId)),
      JSON.stringify({ rec: rec.ok, intentos }));
  }

  {
    const dir = carpeta('d1-legacy'); await montar(dir, W_A);
    const est = {}; const M = construirMain(est);
    const row = nuevoProyecto('Legado SA', 'persist:lg');   // backup_dir NULL
    ok('D1/DEL-LEGACY-SLUG el proyecto tiene backup_dir NULL (control)', row.backup_dir === null);
    const slug = `${row.id}-${slugifyLocal(row.name)}`;
    const dirBk = arbol(path.join(dir, 'backups', slug), 2, 'legacy');
    const commit0 = dbmod.getCommitActual();
    const filaAntes = JSON.stringify(dbmod.get('SELECT * FROM projects WHERE id=?', [row.id]));
    // rechazo en F3, para observar el estado intermedio
    const MF = construirMain({}, { dbmod: dbmodCon(() => { const e = new Error('rechazo'); e.kind = 'conflicto'; throw e; }) });
    const rf = await MF.deleteProjectById(row.id);
    ok('D1/DEL-LEGACY-SLUG preparar el borrado NO hace UPDATE de backup_dir ni mueve el commit',
      rf.aplicado === false && dbmod.getCommitActual() === commit0 &&
      JSON.stringify(dbmod.get('SELECT * FROM projects WHERE id=?', [row.id])) === filaAntes,
      JSON.stringify({ commitIgual: dbmod.getCommitActual() === commit0 }));
    ok('D1/DEL-LEGACY-SLUG si F3 falla, fila y archivos quedan exactamente como antes',
      huella(dirBk) !== 'NO-EXISTE' && nFilas('projects', 'id=?', [row.id]) === 1);
    const r = await M.deleteProjectById(row.id);
    ok('D1/DEL-LEGACY-SLUG con backup_dir NULL el borrado SI encuentra y retira la carpeta',
      r.aplicado === true && !fsReal.existsSync(dirBk) && nFilas('projects', 'id=?', [row.id]) === 0,
      JSON.stringify({ aplicado: r.aplicado, existe: fsReal.existsSync(dirBk) }));
  }

  {
    const dir = carpeta('d1-noclobber'); await montar(dir, W_A);
    const row = nuevoProyecto('No Clobber', 'persist:nc');
    const { dirBk } = proyectoCompleto(dir, row);
    const est = {};
    // El otro equipo recrea la carpeta justo antes de que falle el commit.
    const M = construirMain(est, {
      dbmod: dbmodCon(() => {
        fsReal.mkdirSync(dirBk, { recursive: true });
        fsReal.writeFileSync(path.join(dirBk, 'backup-ajeno.json'), 'DEL OTRO EQUIPO', 'utf8');
        const e = new Error('otro equipo guardo'); e.kind = 'base-cambiada'; throw e;
      }),
    });
    const nR = renames.length;
    const r = await M.deleteProjectById(row.id);
    ok('D1/NO-CLOBBER real: ni se intenta el rename de vuelta',
      renamesHacia(nR, dirBk).length === 0, JSON.stringify(renames.slice(nR)));
    ok('D1/NO-CLOBBER real: el backup ajeno sobrevive byte a byte',
      fsReal.readFileSync(path.join(dirBk, 'backup-ajeno.json'), 'utf8') === 'DEL OTRO EQUIPO');
    ok('D1/NO-CLOBBER real: fail-closed, cuarentena y journal conservados, filas intactas',
      r.aplicado === false && r.bloqueo === 'accion-no-demostrable' &&
      fsReal.existsSync(M.journalBorradoPath(r.actionId)) && nFilas('projects', 'id=?', [row.id]) === 1,
      JSON.stringify({ aplicado: r.aplicado, bloqueo: r.bloqueo }));
  }

  {
    const dir = carpeta('d1-subtree'); await montar(dir, W_A);
    const est = {}; const M = construirMain(est);
    const row = nuevoProyecto('Subtree', 'persist:st');
    const { slug, dirBk, dirDash } = proyectoCompleto(dir, row);
    // Un journal de borrado AJENO reserva los dos subarboles.
    const aid = 'ab'.repeat(16);
    fsReal.mkdirSync(M.borradosDir(), { recursive: true });
    fsReal.writeFileSync(M.journalBorradoPath(aid), JSON.stringify({
      v: 1, action_id: aid, writer: W_B, tipo: 'borrar-proyecto', base_commit_id: commitFalso(),
      fase: 'retirando', startedAt: 'x',
      recursos: [
        { tipo: 'directorio', scope: 'subtree', origen: dirBk, cuarentena: M.cuarentenaDe(aid, 0), n_archivos: 2, bytes_totales: 8 },
        { tipo: 'directorio', scope: 'subtree', origen: dirDash, cuarentena: M.cuarentenaDe(aid, 1), n_archivos: 2, bytes_totales: 8 },
      ],
    }), 'utf8');
    const commit0 = dbmod.getCommitActual();
    const nR = renames.length;
    const rb = await M.guardarBackup(null, { projectId: row.id, payload: JSON.stringify({ projectTitle: 'X' }), reason: 'manual' });
    ok('D1/DEL-W-SUBTREE real: un backup dentro del subarbol reservado se rechaza',
      rb.aplicado === false && rb.bloqueo === 'ocupado-otro-writer' && rb.reintentable === true, JSON.stringify(rb));
    ok('D1/DEL-W-SUBTREE real: no publica, no toca la BD, no deja renames',
      dbmod.getCommitActual() === commit0 && renames.slice(nR).length === 0);
    const rd = await M.deleteProjectById(row.id);
    ok('D1/DEL-W-MULTIRESOURCE real: un borrado propio sobre cualquiera de los dos se rechaza',
      rd.aplicado === false && rd.bloqueo === 'ocupado-otro-writer' &&
      nFilas('projects', 'id=?', [row.id]) === 1, JSON.stringify({ bloqueo: rd.bloqueo }));
    void slug;
  }

  {
    const dir = carpeta('d1-bloqueo'); await montar(dir, W_A);
    const est = {}; const M = construirMain(est);
    const row = nuevoProyecto('Bloqueo', 'persist:bl');
    proyectoCompleto(dir, row);
    M.proyectosEnBorrado.add(row.id);
    const rb = await M.guardarBackup(null, { projectId: row.id, payload: JSON.stringify({ projectTitle: 'X' }), reason: 'manual' });
    const rp = await M.borrarPrep(null, { projectId: row.id, id: 1 });
    const r2 = await M.deleteProjectById(row.id);
    M.proyectosEnBorrado.delete(row.id);
    ok('D1) con el bloqueo local puesto: ni backup, ni borrado de prep, ni un segundo borrado',
      rb.aplicado === false && /elimin/i.test(rb.error) &&
      rp.aplicado === false && /elimin/i.test(rp.error) &&
      r2.aplicado === false && /elimin/i.test(r2.error),
      JSON.stringify({ rb: rb.error, rp: rp.error, r2: r2.error }));
  }

  // =========================================================================
  seccion('D2 — meeting:deletePrep');
  // =========================================================================
  {
    const dir = carpeta('d2-feliz'); await montar(dir, W_A);
    const est = {}; const M = construirMain(est);
    const row = nuevoProyecto('Preps', 'persist:pr');
    const dirPreps = path.join(dir, 'backups', `${row.id}-${slugifyLocal(row.name)}`, 'reuniones');
    fsReal.mkdirSync(dirPreps, { recursive: true });
    fsReal.writeFileSync(path.join(dirPreps, 'p1.json'), '{"v":1}', 'utf8');
    fsReal.writeFileSync(path.join(dirPreps, 'p2.json'), '{"v":2}', 'utf8');
    const id1 = dbmod.run('INSERT INTO meeting_preps(project_id,created_at,file_path) VALUES (?,?,?)', [row.id, 'x', 'p1.json']);
    dbmod.run('INSERT INTO meeting_preps(project_id,created_at,file_path) VALUES (?,?,?)', [row.id, 'x', 'p2.json']);
    const commit0 = dbmod.getCommitActual();
    const r = await M.borrarPrep(null, { projectId: row.id, id: id1 });
    ok('D2) feliz: contrato aplicado/verificado, archivo y fila desaparecen juntos',
      r.ok === true && r.aplicado === true && r.verificado === true &&
      !fsReal.existsSync(path.join(dirPreps, 'p1.json')) && nFilas('meeting_preps', 'id=?', [id1]) === 0 &&
      dbmod.getCommitActual() !== commit0, JSON.stringify(r));
    ok('D2) la OTRA preparacion no se toca',
      fsReal.existsSync(path.join(dirPreps, 'p2.json')) && nFilas('meeting_preps', 'project_id=?', [row.id]) === 1);
    ok('D2) no queda cuarentena ni journal',
      !fsReal.existsSync(M.borradosDir()) || fsReal.readdirSync(M.borradosDir()).length === 0);
  }
  {
    const dir = carpeta('d2-base'); await montar(dir, W_A);
    const est = {}; const M = construirMain(est);
    const row = nuevoProyecto('Preps2', 'persist:pr2');
    const dirPreps = path.join(dir, 'backups', `${row.id}-${slugifyLocal(row.name)}`, 'reuniones');
    fsReal.mkdirSync(dirPreps, { recursive: true });
    fsReal.writeFileSync(path.join(dirPreps, 'p1.json'), '{"v":1}', 'utf8');
    const id1 = dbmod.run('INSERT INTO meeting_preps(project_id,created_at,file_path) VALUES (?,?,?)', [row.id, 'x', 'p1.json']);
    publicarComoOtroEquipo(dir, { commit: commitFalso(), parent: dbmod.getCommitActual(), gen: 55 });
    const r = await M.borrarPrep(null, { projectId: row.id, id: id1 });
    ok('D2) base-cambiada: reintentable, archivo repuesto, fila intacta',
      r.aplicado === false && r.reintentable === true &&
      fsReal.readFileSync(path.join(dirPreps, 'p1.json'), 'utf8') === '{"v":1}' &&
      nFilas('meeting_preps', 'id=?', [id1]) === 1, JSON.stringify(r));
  }
  {
    const dir = carpeta('d2-ausente'); await montar(dir, W_A);
    const est = {}; const M = construirMain(est);
    const row = nuevoProyecto('Preps3', 'persist:pr3');
    const id1 = dbmod.run('INSERT INTO meeting_preps(project_id,created_at,file_path) VALUES (?,?,?)', [row.id, 'x', 'no-esta.json']);
    const r = await M.borrarPrep(null, { projectId: row.id, id: id1 });
    ok('D2) archivo ausente: la fila SI se borra (existe aunque el archivo no)',
      r.aplicado === true && r.verificado === true && nFilas('meeting_preps', 'id=?', [id1]) === 0, JSON.stringify(r));
    const r2 = await M.borrarPrep(null, { projectId: row.id, id: id1 });
    ok('D2) y repetirlo dice que ya no existe, sin tocar nada',
      r2.aplicado === false && r2.reintentable === false && /no encontrada/i.test(r2.error), JSON.stringify(r2));
  }
  {
    const dir = carpeta('d2-reaparecido'); await montar(dir, W_A);
    const row = nuevoProyecto('Preps4', 'persist:pr4');
    const dirPreps = path.join(dir, 'backups', `${row.id}-${slugifyLocal(row.name)}`, 'reuniones');
    fsReal.mkdirSync(dirPreps, { recursive: true });
    const f1 = path.join(dirPreps, 'p1.json');
    fsReal.writeFileSync(f1, '{"v":1}', 'utf8');
    const id1 = dbmod.run('INSERT INTO meeting_preps(project_id,created_at,file_path) VALUES (?,?,?)', [row.id, 'x', 'p1.json']);
    const est = {};
    const M = construirMain(est, {
      dbmod: dbmodCon(() => {
        fsReal.writeFileSync(f1, '{"v":"TERCERO"}', 'utf8');   // reaparece otro contenido
        const e = new Error('rechazo'); e.kind = 'conflicto'; throw e;
      }),
    });
    const nR = renames.length;
    const r = await M.borrarPrep(null, { projectId: row.id, id: id1 });
    ok('D2) recurso reaparecido: NO-CLOBBER, no se pisa, fail-closed',
      r.aplicado === false && r.bloqueo === 'accion-no-demostrable' &&
      fsReal.readFileSync(f1, 'utf8') === '{"v":"TERCERO"}' && renamesHacia(nR, f1).length === 0 &&
      nFilas('meeting_preps', 'id=?', [id1]) === 1, JSON.stringify({ bloqueo: r.bloqueo }));
  }
  {
    const dir = carpeta('d2-forma3'); await montar(dir, W_A);
    const row = nuevoProyecto('Preps5', 'persist:pr5');
    const dirPreps = path.join(dir, 'backups', `${row.id}-${slugifyLocal(row.name)}`, 'reuniones');
    fsReal.mkdirSync(dirPreps, { recursive: true });
    fsReal.writeFileSync(path.join(dirPreps, 'p1.json'), '{"v":1}', 'utf8');
    const id1 = dbmod.run('INSERT INTO meeting_preps(project_id,created_at,file_path) VALUES (?,?,?)', [row.id, 'x', 'p1.json']);
    const est = {};
    const M = construirMain(est, {
      dbmod: dbmodCon((s, o) => {
        dbmod.escribirMultiple(s, o);
        const e = new Error('sin verificar'); e.aplicado = true; e.kind = 'io-tras-confirmar'; throw e;
      }),
    });
    const r = await M.borrarPrep(null, { projectId: row.id, id: id1 });
    ok('D2) forma 3: aplicado sin verificar, requiere reinicio, la fila YA no esta',
      r.ok === true && r.aplicado === true && r.verificado === false && r.requiereReinicio === true &&
      nFilas('meeting_preps', 'id=?', [id1]) === 0, JSON.stringify({ ok: r.ok, aplicado: r.aplicado, verificado: r.verificado }));
  }
  {
    // El renderer REAL: no debe reintentar lo que ya se aplico.
    const HTML_R = fsReal.readFileSync(path.join(PROJ, 'preparacion-reunion', 'plantilla_preparacion_reunion.html'), 'utf8');
    const i = HTML_R.indexOf('async function deleteHistorialItem(id, fromView){');
    const src = HTML_R.slice(i, HTML_R.indexOf('\n}', i) + 2);
    ok('D2/renderer decide por `aplicado`, no por `ok` ni por truthiness',
      /result\.aplicado !== true/.test(src) && !/if\(!result \|\| !result\.ok\)/.test(src), src.slice(0, 200));
    ok('D2/renderer la forma 3 NO invita a repetir y manda reiniciar',
      /verificado === false/.test(src) && /NO repitas/i.test(src) && /reiniciar/i.test(src));
    ok('D2/renderer con no-aplicado la fila NO se quita de la lista',
      /result\.aplicado !== true[\s\S]{0,400}?return;/.test(src));
    const PRE = fsReal.readFileSync(path.join(PROJ, 'preload.js'), 'utf8');
    ok('D2/preload deleteMeetingPrep pasa por invokeAccion', /invokeAccion\('meeting:deletePrep'/.test(PRE));
  }

  // =========================================================================
  seccion('D3 — purga de backups');
  // =========================================================================
  {
    const dir = carpeta('d3-feliz'); await montar(dir, W_A);
    const est = {}; const M = construirMain(est);
    const row = nuevoProyecto('Purga', 'persist:pu');
    const dirBk = path.join(dir, 'backups', `${row.id}-${slugifyLocal(row.name)}`);
    fsReal.mkdirSync(dirBk, { recursive: true });
    for (let i = 0; i < 18; i++) {
      await M.guardarBackup(null, { projectId: row.id, payload: JSON.stringify({ projectTitle: 'T', n: i }), reason: 'auto' });
    }
    ok('D3) purga feliz: se mantiene el limite de BACKUP_KEEP', nFilas('backups') === 15, String(nFilas('backups')));
    const archivos = fsReal.readdirSync(dirBk).filter((f) => /^backup_/.test(f));
    ok('D3) y los archivos purgados tambien desaparecen', archivos.length === 15, String(archivos.length));
    ok('D3) sin residuos de cuarentena', !fsReal.existsSync(M.borradosDir()) || fsReal.readdirSync(M.borradosDir()).length === 0);
  }
  {
    const dir = carpeta('d3-precommit'); await montar(dir, W_A);
    const est = {}; const M = construirMain(est);
    const row = nuevoProyecto('PurgaPre', 'persist:pp');
    const dirBk = path.join(dir, 'backups', `${row.id}-${slugifyLocal(row.name)}`);
    fsReal.mkdirSync(dirBk, { recursive: true });
    for (let i = 0; i < 16; i++) {
      await M.guardarBackup(null, { projectId: row.id, payload: JSON.stringify({ projectTitle: 'T', n: i }), reason: 'auto' });
    }
    const nAntes = nFilas('backups');
    const hAntes = huella(dirBk);
    // Ahora se rompe SOLO el commit de la purga.
    const est2 = {};
    const M2 = construirMain(est2, {
      dbmod: dbmodCon((s, o) => {
        const esPurga = Array.isArray(s) && s.some((x) => /^DELETE FROM backups WHERE id=\?/.test(String(x && x.sql)));
        if (esPurga) { const e = new Error('EIO en la purga'); e.kind = 'io'; throw e; }
        return dbmod.escribirMultiple(s, o);
      }),
    });
    const r = await M2.guardarBackup(null, { projectId: row.id, payload: JSON.stringify({ projectTitle: 'T', n: 99 }), reason: 'manual' });
    ok('D3) fallo PRE-commit de la purga: el backup nuevo SIGUE siendo exito',
      r.ok === true && r.aplicado === true && r.verificado === true, JSON.stringify({ ok: r.ok, aplicado: r.aplicado, verificado: r.verificado }));
    ok('D3) el fallo de purga se informa APARTE, sin contaminar el veredicto',
      r.purga && r.purga.ok === false && r.purga.aplicado === false && r.purga.purgados === 0, JSON.stringify(r.purga));
    ok('D3) rollback de la purga: los archivos que iba a retirar siguen ahi',
      nFilas('backups') === nAntes + 1 && huella(dirBk) !== 'NO-EXISTE' &&
      fsReal.readdirSync(dirBk).filter((f) => /^backup_/.test(f)).length === nAntes + 1,
      JSON.stringify({ filas: nFilas('backups'), antes: nAntes }));
    ok('D3) y app.log distingue el backup (OK) de la purga (fallo)',
      /Backup guardado OK/.test((est2.log || []).join('\n')) && /Purga de backups NO aplicada/.test((est2.log || []).join('\n')));
    void hAntes;
  }
  {
    const dir = carpeta('d3-postcommit'); await montar(dir, W_A);
    const est = {}; const M = construirMain(est);
    const row = nuevoProyecto('PurgaPost', 'persist:po');
    const dirBk = path.join(dir, 'backups', `${row.id}-${slugifyLocal(row.name)}`);
    fsReal.mkdirSync(dirBk, { recursive: true });
    for (let i = 0; i < 16; i++) {
      await M.guardarBackup(null, { projectId: row.id, payload: JSON.stringify({ projectTitle: 'T', n: i }), reason: 'auto' });
    }
    const est2 = {};
    const M2 = construirMain(est2, {
      dbmod: dbmodCon((s, o) => {
        const esPurga = Array.isArray(s) && s.some((x) => /^DELETE FROM backups WHERE id=\?/.test(String(x && x.sql)));
        dbmod.escribirMultiple(s, o);
        if (esPurga) { const e = new Error('sin verificar'); e.aplicado = true; e.kind = 'io-tras-confirmar'; throw e; }
      }),
    });
    const r = await M2.guardarBackup(null, { projectId: row.id, payload: JSON.stringify({ projectTitle: 'T', n: 99 }), reason: 'manual' });
    ok('D3) fallo POST-commit de la purga: NO se deshace; el backup sigue siendo exito',
      r.aplicado === true && r.purga && r.purga.aplicado === true && r.purga.verificado === false &&
      r.purga.requiereReinicio === true, JSON.stringify(r.purga));
    ok('D3) las filas purgadas YA no estan (no se revierten)', nFilas('backups') === 15, String(nFilas('backups')));
  }
  {
    const dir = carpeta('d3-conjunto'); await montar(dir, W_A);
    const est = {}; const M = construirMain(est);
    const row = nuevoProyecto('Conjunto', 'persist:cj');
    const dirBk = path.join(dir, 'backups', `${row.id}-${slugifyLocal(row.name)}`);
    fsReal.mkdirSync(dirBk, { recursive: true });
    for (let i = 0; i < 16; i++) {
      await M.guardarBackup(null, { projectId: row.id, payload: JSON.stringify({ projectTitle: 'T', n: i }), reason: 'auto' });
    }
    // Un backup que NO pertenece al conjunto capturado: se mete a mano DESPUES
    // de la captura, con fecha vieja, y no puede desaparecer.
    const ajeno = path.join(dirBk, 'backup_AJENO.json');
    fsReal.writeFileSync(ajeno, '{"de":"otro equipo"}', 'utf8');
    const est2 = {};
    const M2 = construirMain(est2, {
      dbmod: dbmodCon((s, o) => {
        const esPurga = Array.isArray(s) && s.some((x) => /^DELETE FROM backups WHERE id=\?/.test(String(x && x.sql)));
        if (esPurga) {
          // El otro equipo inserta una fila MAS VIEJA justo antes del commit.
          dbmod.escribirMultiple([{ sql: 'INSERT INTO backups(project_id,created_at,payload,size,file_path) VALUES (?,?,?,?,?)', params: [row.id, '1999-01-01', '{}', 2, 'backup_AJENO.json'] }]);
        }
        return dbmod.escribirMultiple(s, o);
      }),
    });
    const filasAntes = dbmod.all('SELECT id FROM backups').map((x) => x.id);
    const r = await M2.guardarBackup(null, { projectId: row.id, payload: JSON.stringify({ projectTitle: 'T', n: 99 }), reason: 'manual' });
    const quedan = dbmod.all('SELECT id, file_path FROM backups');
    ok('D3) una purga NO se lleva un backup fuera del conjunto capturado',
      fsReal.existsSync(ajeno) && quedan.some((b) => b.file_path === 'backup_AJENO.json'),
      JSON.stringify({ existe: fsReal.existsSync(ajeno), filas: quedan.length }));
    void filasAntes; void r;
  }
  {
    const dir = carpeta('d3-otrowriter'); await montar(dir, W_A);
    const est = {}; const M = construirMain(est);
    const row = nuevoProyecto('OtroWriter', 'persist:ow');
    const dirBk = path.join(dir, 'backups', `${row.id}-${slugifyLocal(row.name)}`);
    fsReal.mkdirSync(dirBk, { recursive: true });
    for (let i = 0; i < 16; i++) {
      await M.guardarBackup(null, { projectId: row.id, payload: JSON.stringify({ projectTitle: 'T', n: i }), reason: 'auto' });
    }
    const nAntes = nFilas('backups');
    const hAntes = fsReal.readdirSync(dirBk).filter((f) => /^backup_/.test(f)).length;
    // La base avanza por debajo entre la captura de la purga y su commit.
    const est2 = {};
    const M2 = construirMain(est2, {
      dbmod: dbmodCon((s, o) => {
        const esPurga = Array.isArray(s) && s.some((x) => /^DELETE FROM backups WHERE id=\?/.test(String(x && x.sql)));
        if (esPurga) { publicarComoOtroEquipo(dir, { commit: commitFalso(), parent: dbmod.getCommitActual(), gen: 88 }); }
        return dbmod.escribirMultiple(s, o);
      }),
    });
    const r = await M2.guardarBackup(null, { projectId: row.id, payload: JSON.stringify({ projectTitle: 'T', n: 99 }), reason: 'manual' });
    ok('D3) base avanzada por otro equipo: la purga se rechaza y el backup sigue siendo exito',
      r.aplicado === true && r.purga.aplicado === false, JSON.stringify(r.purga));
    ok('D3) y nada se purgo: filas y archivos siguen',
      nFilas('backups') === nAntes + 1 &&
      fsReal.readdirSync(dirBk).filter((f) => /^backup_/.test(f)).length === hAntes + 1,
      JSON.stringify({ filas: nFilas('backups'), esperado: nAntes + 1 }));
  }

  // =========================================================================
  seccion('CONTRATOS — nadie decide por truthiness');
  // =========================================================================
  {
    const REND = fsReal.readFileSync(path.join(PROJ, 'launcher', 'renderer.js'), 'utf8');
    const i = REND.indexOf("} else if (act === 'delete') {");
    const bloque = REND.slice(i, REND.indexOf("} else if (act === 'openEval')", i));
    ok('launcher: deleteProject decide por `aplicado`',
      /res\.aplicado !== true/.test(bloque) && !/if \(res\) \{/.test(bloque), bloque.slice(0, 160));
    ok('launcher: ya NO dice "Proyecto eliminado." pase lo que pase',
      bloque.indexOf("setStatus('Proyecto eliminado.')") > bloque.indexOf('res.aplicado !== true'));
    ok('launcher: la forma 3 avisa de reiniciar y NO reintenta',
      /verificado === false/.test(bloque) && /NO repitas/i.test(bloque));
    const PREL = fsReal.readFileSync(path.join(PROJ, 'preload-launcher.js'), 'utf8');
    ok('preload-launcher: deleteProject pasa por invokeAccion y normaliza',
      /invokeAccion\('projects:delete'/.test(PREL) && /typeof r\.aplicado === 'boolean'/.test(PREL));
    // y el borde REAL, ejecutado
    const saca = (firma) => {
      const a = PREL.indexOf(firma);
      let j = PREL.indexOf('{', a), prof = 0;
      for (let k = j; k < PREL.length; k++) {
        if (PREL[k] === '{') prof++;
        else if (PREL[k] === '}') { prof--; if (prof === 0) return PREL.slice(a, k + 1); }
      }
      throw new Error('no delimitado');
    };
    const borde = new Function('ipcRenderer',
      saca('function normalizarContratoAccion(r)') + '\n' + saca('function errorComoNoAplicado(e)') + '\n' +
      saca('function invokeAccion(canal, payload)') + '\nreturn { invokeAccion };')(
      { invoke: (c, p) => Promise.resolve(p) });
    const casos = [null, undefined, 'texto', 42, { ok: true }, { error: 'boom' }, { aplicado: 'si' }];
    const normalizados = await Promise.all(casos.map((c) => borde.invokeAccion('x', c)));
    ok('el borde convierte CUALQUIER respuesta rara en aplicado:false',
      normalizados.every((r) => r && r.aplicado === false), JSON.stringify(normalizados.map((r) => r.aplicado)));
    const bueno = await borde.invokeAccion('x', { ok: true, aplicado: true, verificado: true });
    ok('y deja pasar intacto un contrato valido', bueno.aplicado === true && bueno.verificado === true);
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
    ok('sin residuos .tmp- ni .old- en ninguna carpeta de prueba', restos.length === 0, restos.slice(0, 5).join(', '));
  }

  console.log('\n' + '='.repeat(70));
  console.log(`  BLOQUE 5 — cableado productivo D1-D4: ${pass} OK, ${fail} FALLOS`);
  if (fallos.length) fallos.forEach((f) => console.log('    - ' + f));
  console.log('='.repeat(70));
  try { dbmod._resetParaPruebas(); } catch (e) {}
  fsReal.rmSync(RAIZ, { recursive: true, force: true });
  console.log('  carpeta de prueba borrada: ' + !fsReal.existsSync(RAIZ));
  process.exitCode = fail === 0 ? 0 : 1;
})().catch((e) => { console.error('EXCEPCION:', e); process.exit(2); });
