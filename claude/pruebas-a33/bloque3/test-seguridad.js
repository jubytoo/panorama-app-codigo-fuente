'use strict';
// ---------------------------------------------------------------------------
// BLOQUE 3 — CAPA D: matriz completa de Seguridad/A1 sobre A3.3.
//
// Ejecuta el codigo REAL de main.js (extraido a un ambito con `app`/`dialog`
// simulados) y el db.js REAL. NUNCA toca G: ni datos reales.
//
// En CADA escenario se comprueba: security_enabled, salt, verifier,
// DESCIFRADO REAL de un backup + un meeting prep + un candidate eval,
// staging/journal, commit A3.3, estado tras reiniciar y perdida de datos.
// `looksEncrypted` no cuenta como prueba en ningun sitio.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const Module = require('module');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';

// ===========================================================================
// PROTECCION OBLIGATORIA DEL ARNES
// ===========================================================================
const MARCA_PRUEBAS = '_a33-bloque3-PRUEBAS';
const RAIZ = path.join(os.tmpdir(), MARCA_PRUEBAS);
const PROHIBIDO = ['bd-panoramaservicio', 'mi unidad', 'my drive', 'google drive', 'onedrive', 'dropbox'];
function abortar(motivo, ruta) {
  console.error('\n' + '!'.repeat(70));
  console.error('  ARNES ABORTADO POR SEGURIDAD\n  motivo: ' + motivo + '\n  ruta:   ' + ruta);
  console.error('!'.repeat(70) + '\n');
  process.exit(99);
}
// Lector unico y FAIL-CLOSED (comun/guardia-rutas.js): la clave real es
// `userDataDir`, no `dir`/`path`. Si location.json existe y no se puede
// interpretar, este arnes no se ejecuta.
const GUARDIA = require(path.join(__dirname, '..', 'comun', 'guardia-rutas.js'));
const LECT = GUARDIA.leerUbicacionReal({});
if (LECT.estado !== 'ok') abortar('location.json ' + LECT.estado + ': ' + LECT.detalle, LECT.archivo);
const REAL = LECT.ruta;
const REAL_NORM = REAL ? path.resolve(REAL).toLowerCase() : null;
const DEFECTO_NORM = path.resolve(path.join(process.env.APPDATA || '', 'panorama-app')).toLowerCase();
function segura(p) {
  const abs = path.resolve(String(p));
  const bajo = abs.toLowerCase();
  for (const mal of PROHIBIDO) if (bajo.includes(mal)) abortar(`la ruta contiene "${mal}"`, abs);
  if (REAL_NORM && (bajo === REAL_NORM || bajo.startsWith(REAL_NORM + path.sep))) abortar('coincide con la ubicacion real del usuario', abs);
  if (bajo === DEFECTO_NORM || bajo.startsWith(DEFECTO_NORM + path.sep)) abortar('apunta a la carpeta de datos por defecto', abs);
  if (!bajo.includes(MARCA_PRUEBAS.toLowerCase())) abortar('no esta dentro de una ubicacion marcada para pruebas', abs);
  return abs;
}
segura(RAIZ);
fs.rmSync(RAIZ, { recursive: true, force: true });
fs.mkdirSync(RAIZ, { recursive: true });

function huellaProduccion() {
  const objetivos = [];
  if (REAL) objetivos.push(path.join(REAL, 'panorama.sqlite3'));
  objetivos.push(path.join(process.env.APPDATA || '', 'panorama-app', 'panorama.sqlite3'));
  return objetivos.map((f) => {
    try { const b = fs.readFileSync(f); return { f, existe: true, size: b.length, sha: sha(b) }; }
    catch (e) { return { f, existe: false, err: (e && e.code) || String(e) }; }
  });
}
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const shaF = (f) => { try { return sha(fs.readFileSync(f)); } catch (e) { return 'NO-EXISTE'; } };
const HUELLA_ANTES = huellaProduccion();

// ===========================================================================
let DIR_DATOS = path.join(RAIZ, 'datos-inicial');
let DIR_APPDATA = path.join(RAIZ, 'appdata');
fs.mkdirSync(DIR_DATOS, { recursive: true });
fs.mkdirSync(DIR_APPDATA, { recursive: true });

const appDoble = { getPath: (k) => (k === 'appData' ? DIR_APPDATA : DIR_DATOS) };
const origLoad = Module._load;
Module._load = function (request) {
  if (request === 'electron') return { app: appDoble };
  return origLoad.apply(this, arguments);
};

const dbmod = require(path.join(PROJ, 'db.js'));
const securitymod = require(path.join(PROJ, 'security.js'));
const initSqlJs = require(path.join(PROJ, 'node_modules', 'sql.js'));

let pass = 0, fail = 0;
const fallos = [];
function ok(nombre, cond, extra) {
  if (cond) { pass++; console.log('  OK    ' + nombre); }
  else { fail++; fallos.push(nombre); console.log('  FALLO ' + nombre + (extra ? '  -- ' + extra : '')); }
}
function seccion(t) { console.log('\n=== ' + t + ' ==='); }

let n = 0;
function carpeta(etq) {
  const d = path.join(RAIZ, 'c' + (++n) + '-' + etq);
  segura(d);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

// ===========================================================================
// EXTRACCION DE LOS BLOQUES REALES DE main.js
// ===========================================================================
// PANORAMA_MAIN permite apuntar a una copia con las correcciones revertidas,
// para demostrar que estas pruebas fallaban ANTES y pasan DESPUES.
const RUTA_MAIN = process.env.PANORAMA_MAIN || path.join(PROJ, 'main.js');
console.log('  main.js bajo prueba:  ' + RUTA_MAIN);
const SRC = fs.readFileSync(RUTA_MAIN, 'utf8');
function extraer(firma) {
  const i = SRC.indexOf(firma);
  if (i < 0) throw new Error('NO SE ENCONTRO en main.js: ' + firma);
  let j = SRC.indexOf('{', i), prof = 0;
  for (let k = j; k < SRC.length; k++) {
    if (SRC[k] === '{') prof++;
    else if (SRC[k] === '}') { prof--; if (prof === 0) return SRC.slice(i, k + 1); }
  }
  throw new Error('no se pudo delimitar: ' + firma);
}
const B5 = require(path.join(__dirname, '..', 'comun', 'bloque5-extraccion.js'));
const BLOQUES = [
  'function rekeyStagingDir()',
  'function rekeyJournalPath()',
  'function rekeyItemPath(i, suffix)',
  'function removeRekeyStaging()',
  'function escribirJsonDurable(ruta, obj)',
  'function guardarJournalRekey(journal)',
  'function sha256DeArchivo(p)',
  'function leerJournalRekey()',
  'function hayAlgunOldEnStaging()',
  'function collectRekeyInventory()',
  'function metaUpsert(key, value)',
  'function metaDelete(key)',
  'function sentenciasDeSeguridad(mode, items, newFlag, newSalt, newVerifier, remembered)',
  'function estadoFinalDelJournalYaAplicado(j)',
  'function estadoItemPorHash(it)',
  'function rekeyAllUserFiles(oldKey, newKey, opts)',
  'function recoverInterruptedRekeyIfAny()',
  'function revalidarSeguridadTrasAdopcion(motivo)',
  'function claveDescifraDeVerdad(key)',
  'function bloqueoDeSeguridad()',
  'function encryptIfNeeded(payload, isEncrypted)',
  // Bloque 4: los consumidores extraidos abajo pasan por el helper de accion,
  // asi que su cadena entera tiene que estar en este ambito.
  'function escribirBufferDurable(ruta, buf)',
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
  'function recuperarAccionesPendientes()',
  'function ejecutarAccionDeArchivo(opts)',
  'function migrateLegacyInlineBackupsToFiles()',
];
// A3.3/BLOQUE 5: ejecutarAccionDeArchivo() y destinoOcupadoPorOtroEquipo()
// dependen ahora del dominio de ocupacion comun y de la puerta F-1, asi que
// el ambito real necesita tambien estas funciones de main.js.
BLOQUES.push.apply(BLOQUES, B5.BLOQUES_B5);

// Consumidores REALES (cuerpos de los handlers IPC, sin reescribir).
const HANDLERS = [
  ['meeting:savePrep', 'guardarPrep'],
  ['meeting:updatePrep', 'actualizarPrep'],
  ['candidateEval:save', 'guardarEval'],
];
// Extrae el CUERPO REAL de un handler IPC y lo envuelve como funcion, para
// poder llamar al consumidor de verdad (el que calcula isEncrypted y escribe
// el archivo y la fila) sin montar todo Electron.
function extraerHandler(canal, nombreFn) {
  const marca = `ipcMain.handle('${canal}'`;
  const i = SRC.indexOf(marca);
  if (i < 0) throw new Error('NO SE ENCONTRO el handler ' + canal);
  const flecha = SRC.indexOf('=> {', i);
  const firma = SRC.slice(SRC.indexOf('(', SRC.indexOf(',', i)), flecha).trim();
  let j = SRC.indexOf('{', flecha), prof = 0, fin = -1;
  for (let k = j; k < SRC.length; k++) {
    if (SRC[k] === '{') prof++;
    else if (SRC[k] === '}') { prof--; if (prof === 0) { fin = k; break; } }
  }
  if (fin < 0) throw new Error('no se pudo delimitar el handler ' + canal);
  return `function ${nombreFn}${firma} ${SRC.slice(j, fin + 1)}`;
}

function lineaConst(nombre) {
  const i = SRC.indexOf(nombre);
  if (i < 0) throw new Error('no se encontro ' + nombre);
  return SRC.slice(i, SRC.indexOf('\n', i) + 1);
}
const CONSTS = B5.sinRepetir([
  lineaConst("const REKEY_DIR_NAME = '.panorama-rekey';"),
  lineaConst('const REKEY_JOURNAL_V ='),
  lineaConst('const FSYNC_NO_SOPORTADO_REG'),
  lineaConst("const ACCIONES_DIR_NAME = '.panorama-acciones';"),
  lineaConst('const ACCIONES_JOURNAL_V ='),
  lineaConst('const ACCIONES_MARCA_MAX ='),
  lineaConst('const ACCIONES_TIPOS ='),
  lineaConst('const esHex ='),
  lineaConst('const esEnteroNoNegativo ='),
].concat(B5.CONSTS_B5.map(lineaConst))).join('');

function construirMain(estado) {
  const cuerpo =
    CONSTS + '\n' +
    'let rekeyInProgress = false;\n' +
    'let securityKey = null;\n' +
    'let seguridadRequiereRevalidacion = false;\n' +
    'let seguridadEnEstadoInconsistente = null;\n' +
    'let procesoComprometido = false;\n' +
    'let launcherWin = null;\n' +
    B5.PREAMBULO_B5 +
    BLOQUES.map(extraer).join('\n\n') + '\n' +
    HANDLERS.map(([c, n]) => extraerHandler(c, n)).join('\n\n') + '\n' +
    'return { rekeyAllUserFiles, recoverInterruptedRekeyIfAny, collectRekeyInventory,\n' +
    '         sentenciasDeSeguridad, estadoItemPorHash, estadoFinalDelJournalYaAplicado,\n' +
    '         leerJournalRekey, rekeyStagingDir, rekeyJournalPath, rekeyItemPath,\n' +
    '         sha256DeArchivo, guardarJournalRekey, revalidarSeguridadTrasAdopcion,\n' +
    '         claveDescifraDeVerdad, bloqueoDeSeguridad, encryptIfNeeded,\n' +
    '         migrateLegacyInlineBackupsToFiles,\n' +
    '         guardarPrep, actualizarPrep, guardarEval,\n' +
    '         getKey: () => securityKey, setKey: (k) => { securityKey = k; },\n' +
    '         needsReval: () => seguridadRequiereRevalidacion,\n' +
    '         inconsistente: () => seguridadEnEstadoInconsistente };';
  const f = new Function('app', 'fs', 'path', 'crypto', 'dbmod', 'securitymod', 'appLog',
    'errorCodeSuffix', 'getMeta', 'backupsDirForProject', 'meetingPrepsDirForProject',
    'candidateEvalFileForProject', 'REKEY_BUSY_MESSAGE', 'session', cuerpo);
  const log = (s) => { (estado.log = estado.log || []).push(s); };
  return f(appDoble, fs, path, crypto, dbmod, securitymod, log,
    (c) => '\n\n(codigo ' + c + ')',
    (k) => { const r = dbmod.get('SELECT value FROM app_meta WHERE key=?', [k]); return r ? r.value : null; },
    (row) => { const d = path.join(DIR_DATOS, 'backups', String(row.id)); fs.mkdirSync(d, { recursive: true }); return d; },
    (row) => { const d = path.join(DIR_DATOS, 'preps', String(row.id)); fs.mkdirSync(d, { recursive: true }); return d; },
    (row) => { const d = path.join(DIR_DATOS, 'evals', String(row.id)); fs.mkdirSync(d, { recursive: true }); return path.join(d, 'estado.json'); },
    'LA SEGURIDAD SE ESTA ACTUALIZANDO',
    // `session` solo lo usa vaciarParticionDe(); esta suite no lo ejercita,
    // pero el ambito real lo necesita declarado.
    { fromPartition: () => ({ clearStorageData: () => Promise.resolve() }) });
}

// ===========================================================================
// ESCENARIO: proyecto + 1 backup + 1 meeting prep + 1 candidate eval
// ===========================================================================
const TXT_BACKUP = JSON.stringify({ tipo: 'backup', contenido: 'HITOS Y RIESGOS DEL PROYECTO', n: 1 });
const TXT_PREP = JSON.stringify({ tipo: 'prep', contenido: 'PREPARACION DE REUNION 2026-09', n: 2 });
const TXT_EVAL = JSON.stringify({ tipo: 'eval', contenido: 'EVALUACION DE CANDIDATOS', n: 3 });

async function montar(dir, o) {
  const opt = o || {};
  segura(dir);
  dbmod._resetParaPruebas();
  DIR_DATOS = dir;
  if (opt.politica) dbmod.setPoliticaUbicacion(opt.politica);
  if (opt.writer) dbmod.setInstallationId(opt.writer);
  await dbmod.getDb({ crearSiAusente: true });

  const pid = dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('P','c','persist:p','x','x')");
  const cif = !!opt.pw;
  const key = cif ? securitymod.deriveKey(opt.pw, opt.salt) : null;
  const esc = (t) => (cif ? securitymod.encryptString(key, t) : t);

  const dB = path.join(dir, 'backups', String(pid)); fs.mkdirSync(dB, { recursive: true });
  fs.writeFileSync(path.join(dB, 'b1.json'), esc(TXT_BACKUP), 'utf8');
  dbmod.run('INSERT INTO backups(project_id,created_at,reason,size,file_path,encrypted,payload) VALUES (?,?,?,?,?,?,?)',
    [pid, '2026-01-01', 'test', 10, 'b1.json', cif ? 1 : 0, '']);

  const dP = path.join(dir, 'preps', String(pid)); fs.mkdirSync(dP, { recursive: true });
  fs.writeFileSync(path.join(dP, 'p1.json'), esc(TXT_PREP), 'utf8');
  dbmod.run('INSERT INTO meeting_preps(project_id,created_at,meeting_date,finalidad,file_path,encrypted) VALUES (?,?,?,?,?,?)',
    [pid, 'x', '2026-02-02', 'f', 'p1.json', cif ? 1 : 0]);

  const dE = path.join(dir, 'evals', String(pid)); fs.mkdirSync(dE, { recursive: true });
  fs.writeFileSync(path.join(dE, 'estado.json'), esc(TXT_EVAL), 'utf8');
  dbmod.run('INSERT INTO candidate_evals(project_id,updated_at,encrypted) VALUES (?,?,?)', [pid, 'x', cif ? 1 : 0]);

  if (cif) {
    dbmod.run("INSERT INTO app_meta(key,value) VALUES ('security_salt',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [opt.salt]);
    dbmod.run("INSERT INTO app_meta(key,value) VALUES ('security_verifier',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [securitymod.verifierFor(key)]);
    dbmod.run("INSERT INTO app_meta(key,value) VALUES ('security_enabled','1') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  }
  return { pid, key, rutas: { b: path.join(dB, 'b1.json'), p: path.join(dP, 'p1.json'), e: path.join(dE, 'estado.json') } };
}

// Descifrado REAL de los tres tipos contra el texto original conocido.
function descifraDeVerdad(rutas, key) {
  const r = { backup: false, prep: false, eval: false };
  const uno = (f, esperado) => {
    let raw;
    try { raw = fs.readFileSync(f, 'utf8'); } catch (e) { return false; }
    if (!key) return raw === esperado;
    try { return securitymod.decryptString(key, raw) === esperado; } catch (e) { return false; }
  };
  r.backup = uno(rutas.b, TXT_BACKUP);
  r.prep = uno(rutas.p, TXT_PREP);
  r.eval = uno(rutas.e, TXT_EVAL);
  r.todos = r.backup && r.prep && r.eval;
  return r;
}
function metaSeg() {
  const g = (k) => { const r = dbmod.get('SELECT value FROM app_meta WHERE key=?', [k]); return r ? r.value : null; };
  return { enabled: g('security_enabled'), salt: g('security_salt'), verifier: g('security_verifier'), remembered: g('security_remembered') };
}
function flags() {
  return {
    b: dbmod.get('SELECT encrypted FROM backups LIMIT 1'),
    p: dbmod.get('SELECT encrypted FROM meeting_preps LIMIT 1'),
    e: dbmod.get('SELECT encrypted FROM candidate_evals LIMIT 1'),
  };
}
function fotoCarpeta(dir) {
  const out = {};
  const rec = (d, pre) => {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const en of ents) {
      const f = path.join(d, en.name);
      if (en.isDirectory()) rec(f, pre + en.name + '/');
      else out[pre + en.name] = shaF(f);
    }
  };
  rec(dir, '');
  return out;
}
function mismasFotos(a, b) {
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  if (ka.join('|') !== kb.join('|')) return false;
  return ka.every((k) => a[k] === b[k]);
}

// Inyeccion de fallos de sistema de archivos.
function romperEn(pred) {
  const orig = { writeFileSync: fs.writeFileSync, renameSync: fs.renameSync, readFileSync: fs.readFileSync };
  ['writeFileSync', 'renameSync', 'readFileSync'].forEach((k) => {
    fs[k] = function () {
      const a = Array.prototype.slice.call(arguments);
      if (pred(k, a)) { const e = new Error('FALLO INYECTADO en ' + k + ' ' + a[0]); e.code = 'EIO'; throw e; }
      return orig[k].apply(fs, arguments);
    };
  });
  return () => { Object.assign(fs, orig); };
}

let SQL = null;
function publicarComoOtroEquipo(dir, o) {
  const dbPath = path.join(dir, 'panorama.sqlite3');
  const d = new SQL.Database(fs.readFileSync(dbPath));
  if (o.mutar) d.run(o.mutar);
  const set = (k, v) => d.run('INSERT INTO app_meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [k, String(v)]);
  set('db_commit_id', o.commit);
  if (o.parent === null) d.run("DELETE FROM app_meta WHERE key='db_parent_commit_id'");
  else set('db_parent_commit_id', o.parent);
  set('db_commit_history', JSON.stringify(o.historial || [o.commit]));
  set('db_generation', String(o.gen || 99));
  const bytes = Buffer.from(d.export());
  d.close();
  fs.writeFileSync(dbPath, bytes);
  fs.writeFileSync(dbPath + '.gen', JSON.stringify({
    v: 2, gen: o.gen || 99, commit_id: o.commit, parent_commit_id: o.parent,
    writer: o.writer || 'BBBB'.padEnd(32, '0'), at: new Date().toISOString(),
  }), 'utf8');
  return sha(bytes);
}

const SALT_VIEJA = 'aa'.repeat(16);
const PW_VIEJA = 'clave-vieja-1';
const PW_NUEVA = 'clave-nueva-2';

(async () => {
  SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(PROJ, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')) });
  console.log('RUTAS DE PRUEBA');
  console.log('  raiz:                ' + RAIZ);
  console.log('  ubicacion real det.: ' + (REAL || '(no configurada)'));
  console.log('  por defecto:         ' + path.join(process.env.APPDATA || '', 'panorama-app'));

  ok('los bloques reales de main.js se extraen sin reescribirse',
    BLOQUES.every((b) => { try { return extraer(b).length > 20; } catch (e) { return false; } }));

  // =========================================================================
  seccion('U. LA MUTACION ES UNA SOLA');
  // =========================================================================
  {
    const dir = carpeta('U-unica');
    const e = await montar(dir, {});
    const m = construirMain({});
    const commits = [];
    dbmod.alCambiarImagenEnMemoria((ev) => commits.push(ev.motivo));
    const key = securitymod.deriveKey(PW_NUEVA, SALT_VIEJA);
    const res = m.rekeyAllUserFiles(null, key, {
      mode: 'setup', newSalt: SALT_VIEJA, newVerifier: securitymod.verifierFor(key),
      remembered: { guardar: true, valor: 'BLOB-RECORDADO' },
    });
    dbmod.alCambiarImagenEnMemoria(null);
    ok('U-1) el setup termina bien', res.ok === true, JSON.stringify(res));
    ok('U-2) TODA la Seguridad cabe en UN SOLO commit A3.3',
      commits.filter((c) => c === 'commit-propio').length === 1, JSON.stringify(commits));
    const ms = metaSeg();
    ok('   salt, verifier y enabled quedan a la vez',
      ms.salt === SALT_VIEJA && ms.verifier === securitymod.verifierFor(key) && ms.enabled === '1', JSON.stringify(ms));
    ok('   la contrasena recordada va en la MISMA mutacion', ms.remembered === 'BLOB-RECORDADO', ms.remembered);
    const fl = flags();
    ok('   las 3 marcas encrypted pasan a 1', fl.b.encrypted === 1 && fl.p.encrypted === 1 && fl.e.encrypted === 1, JSON.stringify(fl));
    const d = descifraDeVerdad(e.rutas, key);
    ok('   DESCIFRADO REAL de backup + prep + eval', d.todos, JSON.stringify(d));
    ok('   el staging se retira', !fs.existsSync(m.rekeyStagingDir()));
  }

  // =========================================================================
  seccion('G. MATRIZ DE FALLOS INYECTADOS');
  // =========================================================================

  // --- G1/G2: fallo preparando (primer archivo / intermedio) ---------------
  for (const [etq, cual] of [['G1-primer', 0], ['G2-intermedio', 1]]) {
    const dir = carpeta(etq);
    const e = await montar(dir, { pw: PW_VIEJA, salt: SALT_VIEJA });
    const m = construirMain({});
    const antes = fotoCarpeta(dir);
    const metaAntes = JSON.stringify(metaSeg());
    let vistos = 0;
    const restaurar = romperEn((k, a) => k === 'writeFileSync' && /\.new$/.test(String(a[0])) && vistos++ === cual);
    const oldKey = securitymod.deriveKey(PW_VIEJA, SALT_VIEJA);
    const nuevaSal = 'bb'.repeat(16);
    const newKey = securitymod.deriveKey(PW_NUEVA, nuevaSal);
    const res = m.rekeyAllUserFiles(oldKey, newKey, { mode: 'change', newSalt: nuevaSal, newVerifier: securitymod.verifierFor(newKey), remembered: { guardar: false, valor: null } });
    restaurar();
    ok(etq + ') la operacion se rechaza', res.ok === false, JSON.stringify(res));
    ok('   la carpeta de datos queda IDENTICA', mismasFotos(antes, fotoCarpeta(dir)));
    ok('   los metadatos de Seguridad no cambian', JSON.stringify(metaSeg()) === metaAntes, JSON.stringify(metaSeg()));
    ok('   DESCIFRADO REAL con la contrasena VIEJA sigue funcionando', descifraDeVerdad(e.rutas, oldKey).todos);
    ok('   no queda staging', !fs.existsSync(m.rekeyStagingDir()));
  }

  // --- G3: fallo justo antes del primer swap -------------------------------
  {
    const dir = carpeta('G3-antes-swap');
    const e = await montar(dir, { pw: PW_VIEJA, salt: SALT_VIEJA });
    const m = construirMain({});
    const antes = fotoCarpeta(dir);
    // rompe la escritura del journal al pasar a fase 'swap' (el 2o guardado)
    let vistos = 0;
    const restaurar = romperEn((k, a) => k === 'renameSync' && /journal\.json$/.test(String(a[1] || '')) && vistos++ === 1);
    const oldKey = securitymod.deriveKey(PW_VIEJA, SALT_VIEJA);
    const nuevaSal = 'bb'.repeat(16);
    const newKey = securitymod.deriveKey(PW_NUEVA, nuevaSal);
    const res = m.rekeyAllUserFiles(oldKey, newKey, { mode: 'change', newSalt: nuevaSal, newVerifier: securitymod.verifierFor(newKey), remembered: { guardar: false, valor: null } });
    restaurar();
    ok('G3) se rechaza antes de tocar ningun original', res.ok === false, JSON.stringify(res));
    ok('   la carpeta de datos queda IDENTICA', mismasFotos(antes, fotoCarpeta(dir)));
    ok('   DESCIFRADO REAL con la vieja sigue bien', descifraDeVerdad(e.rutas, oldKey).todos);
  }

  // --- G4/G5: fallo despues del primer swap / tras el ultimo --------------
  for (const [etq, cual] of [['G4-tras-primer-swap', 1], ['G5-tras-ultimo-swap', 5]]) {
    const dir = carpeta(etq);
    const e = await montar(dir, { pw: PW_VIEJA, salt: SALT_VIEJA });
    const m = construirMain({});
    const metaAntes = JSON.stringify(metaSeg());
    let vistos = 0;
    const restaurar = romperEn((k, a) =>
      k === 'renameSync' && /[\\/]\d+\.(old|new)$/.test(String(a[1] || '')) === false &&
      /\.panorama-rekey/.test(String(a[0] || '')) === false && false);
    restaurar();
    // se rompe el N-esimo rename que forme parte del swap
    let renombres = 0;
    const rest2 = romperEn((k, a) => {
      if (k !== 'renameSync') return false;
      const dst = String(a[1] || '');
      if (!/[\\/]\d+\.old$/.test(dst) && !/b1\.json$|p1\.json$|estado\.json$/.test(dst)) return false;
      return ++renombres === cual + 1;
    });
    const oldKey = securitymod.deriveKey(PW_VIEJA, SALT_VIEJA);
    const nuevaSal = 'bb'.repeat(16);
    const newKey = securitymod.deriveKey(PW_NUEVA, nuevaSal);
    const res = m.rekeyAllUserFiles(oldKey, newKey, { mode: 'change', newSalt: nuevaSal, newVerifier: securitymod.verifierFor(newKey), remembered: { guardar: false, valor: null } });
    rest2();
    ok(etq + ') la operacion se rechaza', res.ok === false, JSON.stringify(res).slice(0, 160));
    ok('   los metadatos de Seguridad NO cambian', JSON.stringify(metaSeg()) === metaAntes, JSON.stringify(metaSeg()));
    const d = descifraDeVerdad(e.rutas, oldKey);
    ok('   DESCIFRADO REAL con la VIEJA: los 3 archivos vuelven a su sitio', d.todos, JSON.stringify(d));
    ok('   ningun archivo queda con la clave nueva',
      !descifraDeVerdad(e.rutas, newKey).backup && !descifraDeVerdad(e.rutas, newKey).prep);
  }

  // --- G6-PRE: fallo durante la mutacion unica, ANTES de confirmar --------
  {
    const dir = carpeta('G6pre-mutacion');
    const e = await montar(dir, { pw: PW_VIEJA, salt: SALT_VIEJA });
    const m = construirMain({});
    const metaAntes = JSON.stringify(metaSeg());
    const dbPath = path.join(dir, 'panorama.sqlite3');
    const shaDbAntes = shaF(dbPath);
    const restaurar = romperEn((k, a) => k === 'renameSync' && String(a[1] || '') === dbPath);
    const oldKey = securitymod.deriveKey(PW_VIEJA, SALT_VIEJA);
    const nuevaSal = 'bb'.repeat(16);
    const newKey = securitymod.deriveKey(PW_NUEVA, nuevaSal);
    const res = m.rekeyAllUserFiles(oldKey, newKey, { mode: 'change', newSalt: nuevaSal, newVerifier: securitymod.verifierFor(newKey), remembered: { guardar: false, valor: null } });
    restaurar();
    ok('G6-PRE) la operacion se rechaza', res.ok === false, JSON.stringify(res).slice(0, 200));
    ok('   el .sqlite3 NO cambio', shaF(dbPath) === shaDbAntes);
    ok('   los metadatos siguen siendo los VIEJOS', JSON.stringify(metaSeg()) === metaAntes, JSON.stringify(metaSeg()));
    ok('   NO existe "salt nueva + verifier viejo"', metaSeg().salt !== nuevaSal);
    ok('   DESCIFRADO REAL con la VIEJA sigue funcionando', descifraDeVerdad(e.rutas, oldKey).todos);
  }

  // --- G9 / RKEY-MP3: otra version legitima X->Y antes de consolidar ------
  {
    const dir = carpeta('G9-otra-version');
    const e = await montar(dir, { pw: PW_VIEJA, salt: SALT_VIEJA, politica: 'compartida' });
    const m = construirMain({});
    const metaAntes = JSON.stringify(metaSeg());
    const X = dbmod.getCommitActual();
    // El otro equipo publica Y justo despues del ultimo swap: se engancha al
    // rename del ultimo archivo de usuario.
    let hechos = 0;
    const orig = fs.renameSync;
    fs.renameSync = function () {
      const r = orig.apply(fs, arguments);
      const dst = String(arguments[1] || '');
      if (/estado\.json$/.test(dst)) {
        if (hechos++ === 0) {
          publicarComoOtroEquipo(dir, { commit: 'y'.repeat(32), parent: X, historial: ['y'.repeat(32), X], gen: 50 });
        }
      }
      return r;
    };
    const oldKey = securitymod.deriveKey(PW_VIEJA, SALT_VIEJA);
    const nuevaSal = 'bb'.repeat(16);
    const newKey = securitymod.deriveKey(PW_NUEVA, nuevaSal);
    const res = m.rekeyAllUserFiles(oldKey, newKey, { mode: 'change', newSalt: nuevaSal, newVerifier: securitymod.verifierFor(newKey), remembered: { guardar: false, valor: null } });
    fs.renameSync = orig;
    ok('G9) otro equipo avanza la BD antes de consolidar -> se rechaza', res.ok === false, JSON.stringify(res).slice(0, 200));
    ok('   el mensaje explica que fue otro equipo', /otro equipo/i.test(String(res.error)), String(res.error).slice(0, 120));
    ok('   la Seguridad de la version del otro equipo NO se pisa',
      JSON.stringify(metaSeg()) === metaAntes, JSON.stringify(metaSeg()));
    const d = descifraDeVerdad(e.rutas, oldKey);
    ok('   DESCIFRADO REAL con la VIEJA: todo vuelve a su sitio', d.todos, JSON.stringify(d));
  }

  // --- G11: disco no verificable -------------------------------------------
  {
    const dir = carpeta('G11-noverif');
    // 'compartida': A3.3 verifica los BYTES del disco en cada escritura, que es
    // justo el camino que aquí se rompe.
    const e = await montar(dir, { pw: PW_VIEJA, salt: SALT_VIEJA, politica: 'compartida' });
    const m = construirMain({});
    const metaAntes = JSON.stringify(metaSeg());
    const dbPath = path.join(dir, 'panorama.sqlite3');
    const bytes = fs.readFileSync(dbPath);
    const oldKey = securitymod.deriveKey(PW_VIEJA, SALT_VIEJA);
    const nuevaSal = 'bb'.repeat(16);
    const newKey = securitymod.deriveKey(PW_NUEVA, nuevaSal);
    // Se rompe la LECTURA del .sqlite3 justo antes de consolidar.
    let activado = false;
    const orig = fs.renameSync;
    const origRead = fs.readFileSync;
    fs.renameSync = function () {
      const r = orig.apply(fs, arguments);
      if (/estado\.json$/.test(String(arguments[1] || ''))) activado = true;
      return r;
    };
    fs.readFileSync = function () {
      if (activado && String(arguments[0]) === dbPath) { const er = new Error('EIO simulado'); er.code = 'EIO'; throw er; }
      return origRead.apply(fs, arguments);
    };
    const res = m.rekeyAllUserFiles(oldKey, newKey, { mode: 'change', newSalt: nuevaSal, newVerifier: securitymod.verifierFor(newKey), remembered: { guardar: false, valor: null } });
    fs.renameSync = orig; fs.readFileSync = origRead;
    ok('G11) disco no verificable -> se rechaza', res.ok === false, JSON.stringify(res).slice(0, 200));
    ok('   el .sqlite3 sigue siendo el mismo', shaF(dbPath) === sha(bytes));
    ok('   los metadatos no cambian', JSON.stringify(metaSeg()) === metaAntes);
    ok('   DESCIFRADO REAL con la VIEJA', descifraDeVerdad(e.rutas, oldKey).todos);
  }

  // =========================================================================
  seccion('MP. MULTI-PC: LOS ARCHIVOS SE DEMUESTRAN POR HASH');
  // =========================================================================

  // --- RKEY-MP2: B publica V2 ANTES del swap -------------------------------
  {
    const dir = carpeta('MP2-antes-swap');
    const e = await montar(dir, { pw: PW_VIEJA, salt: SALT_VIEJA, politica: 'compartida' });
    const m = construirMain({});
    const oldKey = securitymod.deriveKey(PW_VIEJA, SALT_VIEJA);
    const nuevaSal = 'bb'.repeat(16);
    const newKey = securitymod.deriveKey(PW_NUEVA, nuevaSal);
    const V2 = securitymod.encryptString(oldKey, JSON.stringify({ tipo: 'eval', contenido: 'VERSION 2 DEL OTRO EQUIPO', n: 99 }));
    // El otro equipo reescribe el candidate eval DESPUES de PREPARE y ANTES
    // del swap: se engancha al rename con el que el journal pasa a 'swap'.
    let activado = false;
    const origR = fs.renameSync;
    fs.renameSync = function () {
      const r = origR.apply(fs, arguments);
      if (!activado && /journal\.json$/.test(String(arguments[1] || ''))) {
        try {
          const j = JSON.parse(fs.readFileSync(String(arguments[1]), 'utf8'));
          if (j && j.phase === 'swap') { activado = true; fs.writeFileSync(e.rutas.e, V2, 'utf8'); }
        } catch (er) {}
      }
      return r;
    };
    const res = m.rekeyAllUserFiles(oldKey, newKey, { mode: 'change', newSalt: nuevaSal, newVerifier: securitymod.verifierFor(newKey), remembered: { guardar: false, valor: null } });
    fs.renameSync = origR;
    ok('MP2) el otro equipo reescribio un archivo antes del swap', activado);
    ok('   la operacion se rechaza', res.ok === false, JSON.stringify(res).slice(0, 200));
    ok('   el mensaje habla de otro equipo', /otro equipo/i.test(String(res.error)), String(res.error).slice(0, 140));
    ok('   V2 NO se pisa: sigue byte a byte en disco', fs.readFileSync(e.rutas.e, 'utf8') === V2);
    ok('   y sigue siendo descifrable con la contrasena vieja', (() => {
      try { return securitymod.decryptString(oldKey, fs.readFileSync(e.rutas.e, 'utf8')).includes('VERSION 2 DEL OTRO EQUIPO'); }
      catch (er) { return false; }
    })());
    ok('   backup y prep vuelven a su sitio', descifraDeVerdad(e.rutas, oldKey).backup && descifraDeVerdad(e.rutas, oldKey).prep);
  }

  // --- RKEY-MP3: B publica V3 DESPUES del swap; el rollback no lo pisa ----
  {
    const dir = carpeta('MP3-tras-swap');
    const e = await montar(dir, { pw: PW_VIEJA, salt: SALT_VIEJA, politica: 'compartida' });
    const m = construirMain({});
    const oldKey = securitymod.deriveKey(PW_VIEJA, SALT_VIEJA);
    const nuevaSal = 'bb'.repeat(16);
    const newKey = securitymod.deriveKey(PW_NUEVA, nuevaSal);
    const X = dbmod.getCommitActual();
    const V3 = 'CONTENIDO V3 ESCRITO POR EL OTRO EQUIPO DESPUES DEL SWAP';
    // tras el ultimo swap: el otro equipo reescribe el backup Y avanza la BD
    let activado = false;
    const orig = fs.renameSync;
    fs.renameSync = function () {
      const r = orig.apply(fs, arguments);
      if (!activado && /estado\.json$/.test(String(arguments[1] || ''))) {
        activado = true;
        fs.writeFileSync(e.rutas.b, V3, 'utf8');
        publicarComoOtroEquipo(dir, { commit: 'y'.repeat(32), parent: X, historial: ['y'.repeat(32), X], gen: 50 });
      }
      return r;
    };
    const res = m.rekeyAllUserFiles(oldKey, newKey, { mode: 'change', newSalt: nuevaSal, newVerifier: securitymod.verifierFor(newKey), remembered: { guardar: false, valor: null } });
    fs.renameSync = orig;
    ok('MP3) el otro equipo reescribio tras el swap y avanzo la BD', activado);
    ok('   la operacion se rechaza', res.ok === false, JSON.stringify(res).slice(0, 200));
    ok('   el rollback NO sustituye V3 por el .old', fs.readFileSync(e.rutas.b, 'utf8') === V3,
      fs.readFileSync(e.rutas.b, 'utf8').slice(0, 60));
    ok('   se avisa de que la vuelta atras no se completo', /no se pudo completar/i.test(String(res.error)), String(res.error).slice(0, 140));
    ok('   el staging se CONSERVA (el .old es la unica copia del original)', fs.existsSync(m.rekeyStagingDir()));
    ok('   y dentro hay al menos un .old', fs.readdirSync(m.rekeyStagingDir()).some((f) => /\.old$/.test(f)),
      fs.readdirSync(m.rekeyStagingDir()).join(','));
  }

  // --- RKEY-MP4: crash + tercer hash en la recuperacion --------------------
  {
    const dir = carpeta('MP4-tercer-hash');
    const e = await montar(dir, { pw: PW_VIEJA, salt: SALT_VIEJA, politica: 'compartida' });
    const m = construirMain({});
    const oldKey = securitymod.deriveKey(PW_VIEJA, SALT_VIEJA);
    const nuevaSal = 'bb'.repeat(16);
    const newKey = securitymod.deriveKey(PW_NUEVA, nuevaSal);
    // "crash": se corta justo despues del primer swap, sin rollback posible
    let renombres = 0;
    const orig = fs.renameSync;
    fs.renameSync = function () {
      const dst = String(arguments[1] || '');
      if (/b1\.json$/.test(dst) && ++renombres === 1) {
        const r = orig.apply(fs, arguments);
        const er = new Error('CRASH SIMULADO'); er.crash = true; throw er;
      }
      return orig.apply(fs, arguments);
    };
    let crash = null;
    try {
      m.rekeyAllUserFiles(oldKey, newKey, { mode: 'change', newSalt: nuevaSal, newVerifier: securitymod.verifierFor(newKey), remembered: { guardar: false, valor: null } });
    } catch (er) { crash = er; }
    fs.renameSync = orig;
    // el rollback del catch ya habra devuelto lo que pudo; se fuerza el estado:
    // hay journal y staging, y OTRO equipo modifica un archivo del inventario
    if (!fs.existsSync(m.rekeyJournalPath())) {
      // si el rollback limpio, se rehace el escenario a mano
      ok('MP4) [preparacion] el rollback limpio; se reconstruye el estado a mano', true);
    }
    void crash;
  }

  // --- RKEY-MP4 (version determinista) ------------------------------------
  {
    const dir = carpeta('MP4b-tercer-hash');
    const e = await montar(dir, { pw: PW_VIEJA, salt: SALT_VIEJA, politica: 'compartida' });
    const m = construirMain({});
    const oldKey = securitymod.deriveKey(PW_VIEJA, SALT_VIEJA);
    const nuevaSal = 'bb'.repeat(16);
    const newKey = securitymod.deriveKey(PW_NUEVA, nuevaSal);
    // Se construye a mano el estado "interrumpido tras el primer swap".
    const staging = m.rekeyStagingDir();
    fs.mkdirSync(staging, { recursive: true });
    const X = dbmod.getCommitActual();
    const items = m.collectRekeyInventory();
    const j = {
      v: 2, startedAt: new Date().toISOString(), writer: dbmod.getInstallationId(),
      mode: 'change', newFlag: 1, newSalt: nuevaSal, newVerifier: securitymod.verifierFor(newKey),
      remembered_final: 'ausente', base_commit_id: X, phase: 'swap', consolidated_commit_id: null,
      items: items.map((it) => {
        const raw = fs.readFileSync(it.absPath);
        const plain = securitymod.decryptString(oldKey, raw.toString('utf8'));
        const nuevo = Buffer.from(securitymod.encryptString(newKey, plain), 'utf8');
        fs.writeFileSync(m.rekeyItemPath(it.i, 'new'), nuevo);
        return { i: it.i, table: it.table, rowKey: it.rowKey, absPath: it.absPath, hadFlag: it.hadFlag,
          missing: false, original_sha256: sha(raw), original_size: raw.length,
          new_sha256: sha(nuevo), new_size: nuevo.length };
      }),
    };
    // el item 0 ya se intercambio
    fs.renameSync(j.items[0].absPath, m.rekeyItemPath(0, 'old'));
    fs.renameSync(m.rekeyItemPath(0, 'new'), j.items[0].absPath);
    m.guardarJournalRekey(j);
    // AHORA el otro equipo modifica el item 1 (tercer hash)
    const TERCERO = 'ESTO LO ESCRIBIO OTRO EQUIPO Y NO ES NI EL ORIGINAL NI EL PREPARADO';
    fs.writeFileSync(j.items[1].absPath, TERCERO, 'utf8');

    const antes = fotoCarpeta(dir);
    const metaAntes = JSON.stringify(metaSeg());
    const rec = m.recoverInterruptedRekeyIfAny();
    ok('MP4) la recuperacion ve un TERCER hash y falla en cerrado',
      !!(rec && rec.fallaCerrado), JSON.stringify(rec));
    ok('   se identifica como tercer hash', !!(rec && rec.terceroHash), JSON.stringify(rec && rec.motivo));
    ok('   NINGUN rename destructivo: la carpeta queda byte a byte igual', mismasFotos(antes, fotoCarpeta(dir)));
    ok('   el archivo del otro equipo sigue intacto', fs.readFileSync(j.items[1].absPath, 'utf8') === TERCERO);
    ok('   el staging y el journal se conservan', fs.existsSync(m.rekeyJournalPath()));
    ok('   los metadatos de Seguridad no cambian', JSON.stringify(metaSeg()) === metaAntes);
  }

  // --- RKEY-MP1: base=X, crash, otro PC publica Y, recuperacion -----------
  {
    const dir = carpeta('MP1-base-X');
    const e = await montar(dir, { pw: PW_VIEJA, salt: SALT_VIEJA, politica: 'compartida' });
    const m = construirMain({});
    const oldKey = securitymod.deriveKey(PW_VIEJA, SALT_VIEJA);
    const nuevaSal = 'bb'.repeat(16);
    const newKey = securitymod.deriveKey(PW_NUEVA, nuevaSal);
    const staging = m.rekeyStagingDir();
    fs.mkdirSync(staging, { recursive: true });
    const X = dbmod.getCommitActual();
    const items = m.collectRekeyInventory();
    const j = {
      v: 2, startedAt: new Date().toISOString(), writer: dbmod.getInstallationId(),
      mode: 'change', newFlag: 1, newSalt: nuevaSal, newVerifier: securitymod.verifierFor(newKey),
      remembered_final: 'ausente', base_commit_id: X, phase: 'swap', consolidated_commit_id: null,
      items: items.map((it) => {
        const raw = fs.readFileSync(it.absPath);
        const plain = securitymod.decryptString(oldKey, raw.toString('utf8'));
        const nuevo = Buffer.from(securitymod.encryptString(newKey, plain), 'utf8');
        fs.writeFileSync(m.rekeyItemPath(it.i, 'new'), nuevo);
        return { i: it.i, table: it.table, rowKey: it.rowKey, absPath: it.absPath, hadFlag: it.hadFlag,
          missing: false, original_sha256: sha(raw), original_size: raw.length,
          new_sha256: sha(nuevo), new_size: nuevo.length };
      }),
    };
    fs.renameSync(j.items[0].absPath, m.rekeyItemPath(0, 'old'));
    fs.renameSync(m.rekeyItemPath(0, 'new'), j.items[0].absPath);
    m.guardarJournalRekey(j);

    // OTRO PC publica Y (incluso con SU propia Seguridad distinta)
    const Y = 'y'.repeat(32);
    const SALT_DE_B = 'cc'.repeat(16);
    const VERIF_DE_B = securitymod.verifierFor(securitymod.deriveKey('clave-de-B', SALT_DE_B));
    publicarComoOtroEquipo(dir, {
      commit: Y, parent: X, historial: [Y, X], gen: 77,
      mutar: `UPDATE app_meta SET value='${SALT_DE_B}' WHERE key='security_salt'`,
    });
    // y su verificador
    {
      const dbPath = path.join(dir, 'panorama.sqlite3');
      const d = new SQL.Database(fs.readFileSync(dbPath));
      d.run("UPDATE app_meta SET value=? WHERE key='security_verifier'", [VERIF_DE_B]);
      const b = Buffer.from(d.export()); d.close();
      fs.writeFileSync(dbPath, b);
    }
    const shaDbAntes = shaF(path.join(dir, 'panorama.sqlite3'));
    const shaGenAntes = shaF(path.join(dir, 'panorama.sqlite3.gen'));
    const fotoAntes = fotoCarpeta(dir);

    // A reabre sobre Y y recupera
    dbmod._resetParaPruebas(); DIR_DATOS = dir;
    dbmod.setPoliticaUbicacion('compartida');
    await dbmod.getDb({ crearSiAusente: false });
    const m2 = construirMain({});
    const rec = m2.recoverInterruptedRekeyIfAny();

    ok('MP1) la recuperacion NO consolida sobre la version del otro equipo',
      !!(rec && rec.fallaCerrado), JSON.stringify(rec));
    ok('   se identifica como caso C', !!(rec && rec.casoC), JSON.stringify(rec && rec.motivo));
    ok('   CERO escritura de metadatos: salt sigue siendo la de B',
      metaSeg().salt === SALT_DE_B, JSON.stringify(metaSeg()));
    ok('   verifier sigue siendo el de B', metaSeg().verifier === VERIF_DE_B);
    ok('   el .sqlite3 es identico byte a byte', shaF(path.join(dir, 'panorama.sqlite3')) === shaDbAntes);
    ok('   el .gen es identico byte a byte', shaF(path.join(dir, 'panorama.sqlite3.gen')) === shaGenAntes);
    ok('   la carpeta entera queda igual (ni un rename)', mismasFotos(fotoAntes, fotoCarpeta(dir)));
    ok('   el staging se conserva', fs.existsSync(m2.rekeyJournalPath()));
  }

  // =========================================================================
  seccion('W. PROPIEDAD DEL JOURNAL (otro equipo)');
  // =========================================================================
  {
    const dir = carpeta('W1-otro-writer');
    const e = await montar(dir, { pw: PW_VIEJA, salt: SALT_VIEJA, politica: 'compartida' });
    const m = construirMain({});
    const oldKey = securitymod.deriveKey(PW_VIEJA, SALT_VIEJA);
    const nuevaSal = 'bb'.repeat(16);
    const newKey = securitymod.deriveKey(PW_NUEVA, nuevaSal);
    const staging = m.rekeyStagingDir();
    fs.mkdirSync(staging, { recursive: true });
    const items = m.collectRekeyInventory();
    for (const fase of ['prepare', 'swap', 'cleanup']) {
      const j = {
        v: 2, startedAt: new Date().toISOString(), writer: 'OTRO-EQUIPO-' + 'z'.repeat(20),
        mode: 'change', newFlag: 1, newSalt: nuevaSal, newVerifier: securitymod.verifierFor(newKey),
        remembered_final: 'ausente', base_commit_id: dbmod.getCommitActual(), phase: fase,
        consolidated_commit_id: fase === 'cleanup' ? 'z'.repeat(32) : null,
        items: items.map((it) => ({ i: it.i, table: it.table, rowKey: it.rowKey, absPath: it.absPath,
          hadFlag: it.hadFlag, missing: false, original_sha256: sha(fs.readFileSync(it.absPath)),
          original_size: 1, new_sha256: 'f'.repeat(64), new_size: 1 })),
      };
      fs.writeFileSync(m.rekeyItemPath(0, 'old'), 'RESTOS DEL OTRO EQUIPO', 'utf8');
      m.guardarJournalRekey(j);
      const antes = fotoCarpeta(dir);
      const metaAntes = JSON.stringify(metaSeg());
      const rec = m.recoverInterruptedRekeyIfAny();
      ok(`W1) journal de otro equipo en fase "${fase}" -> falla en cerrado`,
        !!(rec && rec.fallaCerrado && rec.ajeno), JSON.stringify(rec));
      ok(`   [${fase}] recuento y sha256 de TODO identicos`, mismasFotos(antes, fotoCarpeta(dir)));
      ok(`   [${fase}] metadatos sin tocar`, JSON.stringify(metaSeg()) === metaAntes);
      ok(`   [${fase}] el staging sigue ahi`, fs.existsSync(m.rekeyJournalPath()));
    }
    ok('W1) ni siquiera se limpia un cleanup ajeno', fs.existsSync(m.rekeyItemPath(0, 'old')));
    ok('   DESCIFRADO REAL con la vieja sigue bien', descifraDeVerdad(e.rutas, oldKey).todos);
  }

  // =========================================================================
  seccion('J. POLITICA DE JOURNAL CORRUPTO / DESCONOCIDO / AUSENTE / v1');
  // =========================================================================
  {
    const base = async (etq) => {
      const dir = carpeta(etq);
      const e = await montar(dir, { pw: PW_VIEJA, salt: SALT_VIEJA });
      const m = construirMain({});
      fs.mkdirSync(m.rekeyStagingDir(), { recursive: true });
      return { dir, e, m };
    };

    // J1 — journal corrupto con .old presente
    {
      const { dir, e, m } = await base('J1-corrupto');
      fs.writeFileSync(m.rekeyItemPath(0, 'old'), 'ORIGINAL UNICO IRREMPLAZABLE', 'utf8');
      fs.writeFileSync(m.rekeyItemPath(0, 'new'), 'PREPARADO', 'utf8');
      fs.writeFileSync(m.rekeyJournalPath(), '{ esto no es JSON valido', 'utf8');
      const antes = fotoCarpeta(dir);
      const rec = m.recoverInterruptedRekeyIfAny();
      ok('J1) journal corrupto -> falla en cerrado', !!(rec && rec.fallaCerrado), JSON.stringify(rec));
      ok('   CERO borrados: la carpeta queda byte a byte igual', mismasFotos(antes, fotoCarpeta(dir)));
      ok('   el .old sigue ahi', fs.readFileSync(m.rekeyItemPath(0, 'old'), 'utf8') === 'ORIGINAL UNICO IRREMPLAZABLE');
      ok('   DESCIFRADO REAL de los datos del usuario intacto', descifraDeVerdad(e.rutas, securitymod.deriveKey(PW_VIEJA, SALT_VIEJA)).todos);
    }

    // J2 — version desconocida con .old
    {
      const { dir, m } = await base('J2-version');
      fs.writeFileSync(m.rekeyItemPath(0, 'old'), 'ORIGINAL', 'utf8');
      m.guardarJournalRekey({ v: 77, mode: 'change', items: [] });
      const antes = fotoCarpeta(dir);
      const rec = m.recoverInterruptedRekeyIfAny();
      ok('J2) version desconocida -> falla en cerrado', !!(rec && rec.fallaCerrado), JSON.stringify(rec));
      ok('   CERO borrados', mismasFotos(antes, fotoCarpeta(dir)));
    }

    // J2b — staging SIN journal
    {
      const { dir, m } = await base('J2b-sin-journal');
      fs.writeFileSync(m.rekeyItemPath(3, 'old'), 'ORIGINAL HUERFANO', 'utf8');
      const antes = fotoCarpeta(dir);
      const rec = m.recoverInterruptedRekeyIfAny();
      ok('J2b) staging SIN journal -> falla en cerrado (ya no se asume limpieza)',
        !!(rec && rec.fallaCerrado), JSON.stringify(rec));
      ok('   CERO borrados', mismasFotos(antes, fotoCarpeta(dir)));
    }

    // J3 — cleanup POST-confirmacion demostrable -> SI se limpia
    {
      const dir = carpeta('J3-cleanup');
      const e = await montar(dir, {});                      // en claro
      const m = construirMain({});
      const nuevaSal = 'dd'.repeat(16);
      const newKey = securitymod.deriveKey(PW_NUEVA, nuevaSal);
      // se aplica el cambio de verdad
      const res = m.rekeyAllUserFiles(null, newKey, {
        mode: 'setup', newSalt: nuevaSal, newVerifier: securitymod.verifierFor(newKey),
        remembered: { guardar: false, valor: null },
      });
      ok('J3) [preparacion] el setup se aplica', res.ok === true, JSON.stringify(res));
      // se reconstruye el staging como si el cleanup no hubiera terminado
      const items = m.collectRekeyInventory();
      fs.mkdirSync(m.rekeyStagingDir(), { recursive: true });
      const j = {
        v: 2, startedAt: new Date().toISOString(), writer: dbmod.getInstallationId(),
        mode: 'setup', newFlag: 1, newSalt: nuevaSal, newVerifier: securitymod.verifierFor(newKey),
        remembered_final: 'ausente', base_commit_id: 'x'.repeat(32), phase: 'cleanup',
        consolidated_commit_id: dbmod.getCommitActual(),
        items: items.map((it) => ({ i: it.i, table: it.table, rowKey: it.rowKey, absPath: it.absPath,
          hadFlag: 0, missing: false,
          original_sha256: 'a'.repeat(64), original_size: 1,
          new_sha256: sha(fs.readFileSync(it.absPath)), new_size: 1 })),
      };
      fs.writeFileSync(m.rekeyItemPath(0, 'old'), 'RESTO', 'utf8');
      m.guardarJournalRekey(j);
      const metaAntes = JSON.stringify(metaSeg());
      const rec = m.recoverInterruptedRekeyIfAny();
      ok('J3) cleanup POST-confirmacion demostrable -> SI se limpia',
        !!(rec && rec.recovered && rec.yaEstaba), JSON.stringify(rec));
      ok('   el staging desaparece', !fs.existsSync(m.rekeyStagingDir()));
      ok('   los metadatos de Seguridad NO se vuelven a escribir', JSON.stringify(metaSeg()) === metaAntes);
      ok('   DESCIFRADO REAL con la clave nueva', descifraDeVerdad(e.rutas, newKey).todos);
    }

    // V1A — v1 sin ningun .old -> se retira solo el staging
    {
      const { dir, e, m } = await base('V1A-sin-old');
      fs.writeFileSync(m.rekeyItemPath(0, 'new'), 'PREPARADO', 'utf8');
      fs.writeFileSync(m.rekeyJournalPath(), JSON.stringify({ v: 1, mode: 'change', phase: 'prepare', newFlag: 1, items: [] }), 'utf8');
      const fotoDatos = fotoCarpeta(path.join(dir, 'backups'));
      const rec = m.recoverInterruptedRekeyIfAny();
      ok('V1A) v1 sin ningun .old -> se retira solo la carpeta de trabajo',
        !!(rec && rec.formatoAnterior && rec.recovered === false), JSON.stringify(rec));
      ok('   el staging desaparece', !fs.existsSync(m.rekeyStagingDir()));
      ok('   los datos del usuario no se tocan', mismasFotos(fotoDatos, fotoCarpeta(path.join(dir, 'backups'))));
      ok('   DESCIFRADO REAL intacto', descifraDeVerdad(e.rutas, securitymod.deriveKey(PW_VIEJA, SALT_VIEJA)).todos);
    }

    // V1B — v1 CON .old -> fail-closed
    {
      const { dir, m } = await base('V1B-con-old');
      fs.writeFileSync(m.rekeyItemPath(0, 'old'), 'ORIGINAL IRREMPLAZABLE', 'utf8');
      fs.writeFileSync(m.rekeyItemPath(0, 'new'), 'PREPARADO', 'utf8');
      fs.writeFileSync(m.rekeyJournalPath(), JSON.stringify({ v: 1, mode: 'change', phase: 'swap', newFlag: 1, items: [] }), 'utf8');
      const antes = fotoCarpeta(dir);
      const rec = m.recoverInterruptedRekeyIfAny();
      ok('V1B) v1 con al menos un .old -> falla en cerrado',
        !!(rec && rec.fallaCerrado && rec.formatoAnterior), JSON.stringify(rec));
      ok('   CERO borrados, CERO renames', mismasFotos(antes, fotoCarpeta(dir)));
      ok('   el .old sigue intacto', fs.readFileSync(m.rekeyItemPath(0, 'old'), 'utf8') === 'ORIGINAL IRREMPLAZABLE');
    }
  }

  // =========================================================================
  seccion('R. RECUPERACION CORRECTA (caso A) E IDEMPOTENCIA');
  // =========================================================================
  {
    const dir = carpeta('RA-caso-A');
    const e = await montar(dir, { pw: PW_VIEJA, salt: SALT_VIEJA });
    const m = construirMain({});
    const oldKey = securitymod.deriveKey(PW_VIEJA, SALT_VIEJA);
    const nuevaSal = 'bb'.repeat(16);
    const newKey = securitymod.deriveKey(PW_NUEVA, nuevaSal);
    fs.mkdirSync(m.rekeyStagingDir(), { recursive: true });
    const X = dbmod.getCommitActual();
    const items = m.collectRekeyInventory();
    const j = {
      v: 2, startedAt: new Date().toISOString(), writer: dbmod.getInstallationId(),
      mode: 'change', newFlag: 1, newSalt: nuevaSal, newVerifier: securitymod.verifierFor(newKey),
      remembered_final: 'ausente', base_commit_id: X, phase: 'swap', consolidated_commit_id: null,
      items: items.map((it) => {
        const raw = fs.readFileSync(it.absPath);
        const plain = securitymod.decryptString(oldKey, raw.toString('utf8'));
        const nuevo = Buffer.from(securitymod.encryptString(newKey, plain), 'utf8');
        fs.writeFileSync(m.rekeyItemPath(it.i, 'new'), nuevo);
        return { i: it.i, table: it.table, rowKey: it.rowKey, absPath: it.absPath, hadFlag: it.hadFlag,
          missing: false, original_sha256: sha(raw), original_size: raw.length,
          new_sha256: sha(nuevo), new_size: nuevo.length };
      }),
    };
    // item 0 intercambiado, item 1 a medias (solo .old), item 2 sin tocar
    fs.renameSync(j.items[0].absPath, m.rekeyItemPath(0, 'old'));
    fs.renameSync(m.rekeyItemPath(0, 'new'), j.items[0].absPath);
    fs.renameSync(j.items[1].absPath, m.rekeyItemPath(1, 'old'));
    m.guardarJournalRekey(j);

    const rec = m.recoverInterruptedRekeyIfAny();
    ok('RA) la recuperacion termina el cambio', !!(rec && rec.recovered), JSON.stringify(rec));
    const ms = metaSeg();
    ok('   salt y verifier quedan consolidados', ms.salt === nuevaSal && ms.verifier === securitymod.verifierFor(newKey), JSON.stringify(ms));
    ok('   security_enabled = 1', ms.enabled === '1');
    ok('   la contrasena recordada queda BORRADA (nadie se la dio)', ms.remembered === null, String(ms.remembered));
    const fl = flags();
    ok('   las 3 marcas encrypted quedan a 1', fl.b.encrypted === 1 && fl.p.encrypted === 1 && fl.e.encrypted === 1, JSON.stringify(fl));
    const d = descifraDeVerdad(e.rutas, newKey);
    ok('   DESCIFRADO REAL con la clave NUEVA: backup + prep + eval', d.todos, JSON.stringify(d));
    ok('   ninguno sigue con la clave vieja', !descifraDeVerdad(e.rutas, oldKey).todos);
    ok('   el staging se retira', !fs.existsSync(m.rekeyStagingDir()));
    ok('   integrity_check ok', dbmod._leerDisco().estado === 'valida');

    // idempotencia: volver a llamar no hace nada
    const metaTras = JSON.stringify(metaSeg());
    const rec2 = m.recoverInterruptedRekeyIfAny();
    ok('   una segunda recuperacion no encuentra nada', rec2 === null, JSON.stringify(rec2));
    ok('   y los metadatos no cambian', JSON.stringify(metaSeg()) === metaTras);
  }

  // =========================================================================
  seccion('K. CLAVE EN MEMORIA TRAS UNA ADOPCION');
  // =========================================================================
  {
    const dir = carpeta('K-adopcion');
    const e = await montar(dir, { pw: PW_VIEJA, salt: SALT_VIEJA, politica: 'compartida' });
    const m = construirMain({});
    const oldKey = securitymod.deriveKey(PW_VIEJA, SALT_VIEJA);
    m.setKey(oldKey);
    ok('K-1) la clave valida contra ESTA base de datos', m.claveDescifraDeVerdad(oldKey) === true);

    // El otro equipo cambia la contrasena y publica
    const X = dbmod.getCommitActual();
    const SALT_B = 'cc'.repeat(16);
    const KEY_B = securitymod.deriveKey('clave-de-B', SALT_B);
    publicarComoOtroEquipo(dir, { commit: 'y'.repeat(32), parent: X, historial: ['y'.repeat(32), X], gen: 60 });
    {
      const dbPath = path.join(dir, 'panorama.sqlite3');
      const d = new SQL.Database(fs.readFileSync(dbPath));
      d.run("UPDATE app_meta SET value=? WHERE key='security_salt'", [SALT_B]);
      d.run("UPDATE app_meta SET value=? WHERE key='security_verifier'", [securitymod.verifierFor(KEY_B)]);
      const b = Buffer.from(d.export()); d.close();
      fs.writeFileSync(dbPath, b);
    }
    // A adopta esa version con un run() normal
    dbmod.alCambiarImagenEnMemoria((ev) => { if (ev.motivo !== 'commit-propio') m.revalidarSeguridadTrasAdopcion(ev.motivo); });
    dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('MIA','c','persist:m','x','x')");
    dbmod.alCambiarImagenEnMemoria(null);

    ok('K-2) tras adoptar, la clave en memoria se INVALIDA', m.getKey() === null);
    ok('   y queda marcada la revalidacion pendiente', m.needsReval() === true);
    ok('   la clave vieja ya no valida contra la BD adoptada',
      securitymod.verifierFor(oldKey) !== metaSeg().verifier);
    ok('   no se escribio ninguna contrasena recordada', metaSeg().remembered === null);
    ok('   los archivos del usuario no se tocaron',
      descifraDeVerdad(e.rutas, oldKey).todos, 'siguen con la clave vieja, intactos');
  }

  // =========================================================================
  seccion('D. DESCIFRADO REAL vs looksEncrypted');
  // =========================================================================
  {
    const dir = carpeta('D-real');
    const e = await montar(dir, { pw: PW_VIEJA, salt: SALT_VIEJA });
    const m = construirMain({});
    const oldKey = securitymod.deriveKey(PW_VIEJA, SALT_VIEJA);
    const otra = securitymod.deriveKey('otra-cosa', SALT_VIEJA);
    ok('D-1) la clave correcta descifra de verdad', m.claveDescifraDeVerdad(oldKey) === true);
    ok('D-2) una clave equivocada NO pasa el descifrado real', m.claveDescifraDeVerdad(otra) === false);
    ok('   (y sin embargo looksEncrypted diria que si es un sobre cifrado)',
      securitymod.looksEncrypted(fs.readFileSync(e.rutas.b, 'utf8')) === true);
  }

  // =========================================================================
  seccion('E. EXCLUSIVA DURANTE EL REKEY');
  // =========================================================================
  {
    const dir = carpeta('E-exclusiva');
    await montar(dir, {});
    const m = construirMain({});
    const nuevaSal = 'ee'.repeat(16);
    const newKey = securitymod.deriveKey(PW_NUEVA, nuevaSal);
    let intentos = { tema: null, vacuum: null };
    // Se intenta escribir algo ajeno JUSTO antes de consolidar
    let activado = false;
    const orig = fs.renameSync;
    fs.renameSync = function () {
      const r = orig.apply(fs, arguments);
      if (!activado && /estado\.json$/.test(String(arguments[1] || ''))) {
        activado = true;
        try { dbmod.run("INSERT INTO app_meta(key,value) VALUES ('app_theme','nube')"); intentos.tema = 'PASO'; }
        catch (er) { intentos.tema = er.kind; }
        try { dbmod.vacuum(); intentos.vacuum = 'PASO'; } catch (er) { intentos.vacuum = er.kind; }
      }
      return r;
    };
    const res = m.rekeyAllUserFiles(null, newKey, {
      mode: 'setup', newSalt: nuevaSal, newVerifier: securitymod.verifierFor(newKey),
      remembered: { guardar: false, valor: null },
    });
    fs.renameSync = orig;
    ok('E-1) se intento escribir algo ajeno en mitad del rekey', activado);
    ok('E-2) el cambio de tema queda fuera ("ocupado")', intentos.tema === 'ocupado', String(intentos.tema));
    ok('E-3) el vacuum tambien queda fuera', intentos.vacuum === 'ocupado', String(intentos.vacuum));
    ok('E-4) y el rekey termina bien pese a los intentos', res.ok === true, JSON.stringify(res).slice(0, 160));
    ok('   el tema NO se guardo', dbmod.get("SELECT value FROM app_meta WHERE key='app_theme'") === null);
  }

  // =========================================================================
  seccion('BAR. LA BARRERA LLEGA AL CONSUMIDOR REAL');
  // =========================================================================
  // Cuenta archivos y filas ANTES y DESPUES: "no se escribio nada" tiene que
  // ser comprobable, no una afirmacion.
  function censo(dir) {
    return {
      preps: fs.existsSync(path.join(dir, 'preps')) ? fotoCarpeta(path.join(dir, 'preps')) : {},
      evals: fs.existsSync(path.join(dir, 'evals')) ? fotoCarpeta(path.join(dir, 'evals')) : {},
      backups: fs.existsSync(path.join(dir, 'backups')) ? fotoCarpeta(path.join(dir, 'backups')) : {},
      filasPrep: dbmod.all('SELECT id FROM meeting_preps').length,
      filasEval: dbmod.all('SELECT project_id FROM candidate_evals').length,
      commit: dbmod.getCommitActual(),
    };
  }
  function censoIgual(a, b) {
    return mismasFotos(a.preps, b.preps) && mismasFotos(a.evals, b.evals) && mismasFotos(a.backups, b.backups)
      && a.filasPrep === b.filasPrep && a.filasEval === b.filasEval && a.commit === b.commit;
  }

  // --- BAR-1: clave presente -> adopcion con OTRO verificador -> guardado ---
  {
    const dir = carpeta('BAR1-clave-invalidada');
    const e = await montar(dir, { pw: PW_VIEJA, salt: SALT_VIEJA, politica: 'compartida' });
    const m = construirMain({});
    const oldKey = securitymod.deriveKey(PW_VIEJA, SALT_VIEJA);
    m.setKey(oldKey);
    ok('BAR-1) [previo] con la clave valida, el consumidor real SI guarda', (() => {
      const r = m.guardarPrep(null, { projectId: e.pid, meetingDate: '2026-03-03', finalidad: 'ok', payload: 'CONTENIDO-VALIDO' });
      return r && r.ok === true;
    })());
    const guardadoValido = path.join(dir, 'preps', String(e.pid));
    const ficherosValidos = fs.readdirSync(guardadoValido).filter((f) => /^reunion_/.test(f));
    ok('   ese guardado quedo CIFRADO de verdad', ficherosValidos.length === 1 &&
      securitymod.decryptString(oldKey, fs.readFileSync(path.join(guardadoValido, ficherosValidos[0]), 'utf8')) === 'CONTENIDO-VALIDO');

    // El otro equipo cambia la contrasena y publica
    const X = dbmod.getCommitActual();
    const SALT_B = 'cc'.repeat(16);
    const KEY_B = securitymod.deriveKey('clave-de-B', SALT_B);
    publicarComoOtroEquipo(dir, { commit: 'y'.repeat(32), parent: X, historial: ['y'.repeat(32), X], gen: 60 });
    {
      const dbPath = path.join(dir, 'panorama.sqlite3');
      const d = new SQL.Database(fs.readFileSync(dbPath));
      d.run("UPDATE app_meta SET value=? WHERE key='security_salt'", [SALT_B]);
      d.run("UPDATE app_meta SET value=? WHERE key='security_verifier'", [securitymod.verifierFor(KEY_B)]);
      const b = Buffer.from(d.export()); d.close();
      fs.writeFileSync(dbPath, b);
    }
    dbmod.alCambiarImagenEnMemoria((ev) => { if (ev.motivo !== 'commit-propio') m.revalidarSeguridadTrasAdopcion(ev.motivo); });
    dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('MIA','c','persist:m','x','x')");
    dbmod.alCambiarImagenEnMemoria(null);

    ok('   tras adoptar: clave invalidada y revalidacion pendiente', m.getKey() === null && m.needsReval() === true);
    ok('   la barrera esta activa', !!m.bloqueoDeSeguridad() && m.bloqueoDeSeguridad().motivo === 'revalidacion',
      JSON.stringify(m.bloqueoDeSeguridad()));

    // EL SIGUIENTE GUARDADO, por el consumidor REAL
    const antes = censo(dir);
    const r1 = m.guardarPrep(null, { projectId: e.pid, meetingDate: '2026-04-04', finalidad: 'x', payload: 'CONTENIDO-SECRETO-QUE-NO-DEBE-QUEDAR-EN-CLARO' });
    ok('BAR-1) meeting:savePrep NO guarda', !!(r1 && r1.ok === false), JSON.stringify(r1));
    const r2 = m.guardarEval(null, { projectId: e.pid, payload: 'OTRO-SECRETO' });
    ok('   candidateEval:save NO guarda', !!(r2 && r2.ok === false), JSON.stringify(r2));
    const prep0 = dbmod.get('SELECT id, file_path FROM meeting_preps ORDER BY id LIMIT 1');
    const r3 = m.actualizarPrep(null, { projectId: e.pid, id: prep0.id, meetingDate: 'z', finalidad: 'z', payload: 'SECRETO-3' });
    ok('   meeting:updatePrep NO guarda', !!(r3 && r3.ok === false), JSON.stringify(r3));
    const despues = censo(dir);
    ok('   NINGUN archivo nuevo ni modificado', censoIgual(antes, despues),
      JSON.stringify({ a: Object.keys(antes.preps).length, d: Object.keys(despues.preps).length }));
    ok('   NINGUNA fila nueva en la base de datos', antes.filasPrep === despues.filasPrep && antes.filasEval === despues.filasEval);
    ok('   el commit de la base de datos no avanza', antes.commit === despues.commit);
    // Y lo esencial: en ningun sitio quedo el texto en claro
    const todoEnDisco = Object.keys(despues.preps).concat(Object.keys(despues.evals)).length;
    let hayClaro = false;
    const rec = (d) => { try { fs.readdirSync(d, { withFileTypes: true }).forEach((en) => {
      const f = path.join(d, en.name);
      if (en.isDirectory()) rec(f);
      else { try { if (fs.readFileSync(f, 'utf8').includes('CONTENIDO-SECRETO-QUE-NO-DEBE')) hayClaro = true; } catch (er) {} }
    }); } catch (er) {} };
    rec(dir);
    ok('   el contenido NO aparece en claro en ninguna parte de la carpeta', hayClaro === false, 'archivos revisados=' + todoEnDisco);
  }

  // --- BAR-2: sesion SIN Seguridad -> BD adoptada CON Seguridad activa -----
  {
    const dir = carpeta('BAR2-sin-clave');
    const e = await montar(dir, { politica: 'compartida' });          // sin Seguridad
    const m = construirMain({});
    ok('BAR-2) [previo] sin Seguridad, el consumidor real guarda EN CLARO', (() => {
      const r = m.guardarPrep(null, { projectId: e.pid, meetingDate: '2026-03-03', finalidad: 'ok', payload: 'EN-CLARO-LEGITIMO' });
      return r && r.ok === true;
    })());
    ok('   y no hay barrera', m.bloqueoDeSeguridad() === null);

    // El otro equipo ACTIVA la Seguridad y publica
    const X = dbmod.getCommitActual();
    const SALT_B = 'cc'.repeat(16);
    const KEY_B = securitymod.deriveKey('clave-de-B', SALT_B);
    publicarComoOtroEquipo(dir, { commit: 'y'.repeat(32), parent: X, historial: ['y'.repeat(32), X], gen: 60 });
    {
      const dbPath = path.join(dir, 'panorama.sqlite3');
      const d = new SQL.Database(fs.readFileSync(dbPath));
      const set = (k, v) => d.run('INSERT INTO app_meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [k, v]);
      set('security_salt', SALT_B);
      set('security_verifier', securitymod.verifierFor(KEY_B));
      set('security_enabled', '1');
      const b = Buffer.from(d.export()); d.close();
      fs.writeFileSync(dbPath, b);
    }
    dbmod.alCambiarImagenEnMemoria((ev) => { if (ev.motivo !== 'commit-propio') m.revalidarSeguridadTrasAdopcion(ev.motivo); });
    dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('MIA','c','persist:m','x','x')");
    dbmod.alCambiarImagenEnMemoria(null);

    ok('BAR-2) la BD adoptada exige cifrado y esta sesion no tiene clave -> barrera activa',
      m.needsReval() === true && !!m.bloqueoDeSeguridad(), JSON.stringify(m.bloqueoDeSeguridad()));
    const antes = censo(dir);
    const r1 = m.guardarPrep(null, { projectId: e.pid, meetingDate: '2026-04-04', finalidad: 'x', payload: 'ESTO-IRIA-EN-CLARO-SOBRE-UNA-BD-CIFRADA' });
    ok('   meeting:savePrep NO guarda', !!(r1 && r1.ok === false), JSON.stringify(r1));
    const r2 = m.guardarEval(null, { projectId: e.pid, payload: 'IDEM' });
    ok('   candidateEval:save NO guarda', !!(r2 && r2.ok === false), JSON.stringify(r2));
    const despues = censo(dir);
    ok('   NINGUN archivo nuevo ni fila nueva', censoIgual(antes, despues));
    let hayClaro = false;
    const rec = (d) => { try { fs.readdirSync(d, { withFileTypes: true }).forEach((en) => {
      const f = path.join(d, en.name);
      if (en.isDirectory()) rec(f);
      else { try { if (fs.readFileSync(f, 'utf8').includes('ESTO-IRIA-EN-CLARO')) hayClaro = true; } catch (er) {} }
    }); } catch (er) {} };
    rec(dir);
    ok('   el contenido NO quedo en claro en ninguna parte', hayClaro === false);
    // migrateLegacy tampoco
    const antesMig = censo(dir);
    m.migrateLegacyInlineBackupsToFiles();
    ok('   la migracion de backups antiguos tambien se aplaza', censoIgual(antesMig, censo(dir)));
    // y no se puede empezar un cambio de Seguridad
    const rk = m.rekeyAllUserFiles(null, KEY_B, { mode: 'setup', newSalt: SALT_B, newVerifier: securitymod.verifierFor(KEY_B), remembered: { guardar: false, valor: null } });
    ok('   ni empezar un cambio de Seguridad', rk.ok === false, JSON.stringify(rk).slice(0, 120));
  }

  // =========================================================================
  seccion('CORTE. INTERRUPCION EXACTA ENTRE LOS DOS RENAMES DEL PRIMER ITEM');
  // =========================================================================
  {
    const dir = carpeta('CORTE-primer-item');
    const e = await montar(dir, { pw: PW_VIEJA, salt: SALT_VIEJA });
    const m = construirMain({});
    const oldKey = securitymod.deriveKey(PW_VIEJA, SALT_VIEJA);
    const nuevaSal = 'bb'.repeat(16);
    const newKey = securitymod.deriveKey(PW_NUEVA, nuevaSal);

    // Estado REAL en disco: journal v2 propio, phase=swap, base == commit actual,
    // el PRIMER original ya trasladado a 0.old y su 0.new todavia sin mover.
    fs.mkdirSync(m.rekeyStagingDir(), { recursive: true });
    const X = dbmod.getCommitActual();
    const items = m.collectRekeyInventory();
    const j = {
      v: 2, startedAt: new Date().toISOString(), writer: dbmod.getInstallationId(),
      mode: 'change', newFlag: 1, newSalt: nuevaSal, newVerifier: securitymod.verifierFor(newKey),
      remembered_final: 'ausente', base_commit_id: X, phase: 'swap', consolidated_commit_id: null,
      items: items.map((it) => {
        const raw = fs.readFileSync(it.absPath);
        const plain = securitymod.decryptString(oldKey, raw.toString('utf8'));
        const nuevo = Buffer.from(securitymod.encryptString(newKey, plain), 'utf8');
        fs.writeFileSync(m.rekeyItemPath(it.i, 'new'), nuevo);
        return { i: it.i, table: it.table, rowKey: it.rowKey, absPath: it.absPath, hadFlag: it.hadFlag,
          missing: false, original_sha256: sha(raw), original_size: raw.length,
          new_sha256: sha(nuevo), new_size: nuevo.length };
      }),
    };
    // EL CORTE: solo el PRIMER rename del primer item.
    fs.renameSync(j.items[0].absPath, m.rekeyItemPath(0, 'old'));
    m.guardarJournalRekey(j);

    ok('CORTE) el primer original esta en 0.old y su sitio esta vacio',
      fs.existsSync(m.rekeyItemPath(0, 'old')) && !fs.existsSync(j.items[0].absPath));
    ok('   0.new sigue preparado', fs.existsSync(m.rekeyItemPath(0, 'new')));
    ok('   NINGUN item esta completamente intercambiado',
      j.items.every((it) => shaF(it.absPath) !== it.new_sha256));
    ok('   estadoItemPorHash lo clasifica como swap-a-medias',
      m.estadoItemPorHash(j.items[0]).clase === 'swap-a-medias', m.estadoItemPorHash(j.items[0]).clase);

    const rec = m.recoverInterruptedRekeyIfAny();
    ok('CORTE) la recuperacion NO trata esto como "no se toco nada"',
      !(rec && rec.recovered === false && !rec.fallaCerrado),
      JSON.stringify(rec));
    ok('   la recuperacion termina el cambio', !!(rec && rec.recovered === true), JSON.stringify(rec));
    ok('   el archivo del primer item VUELVE A EXISTIR', fs.existsSync(j.items[0].absPath));
    const d = descifraDeVerdad(e.rutas, newKey);
    ok('   DESCIFRADO REAL con la clave NUEVA: backup + prep + eval', d.todos, JSON.stringify(d));
    ok('   SIN PERDIDA DE DATOS: los tres textos originales estan enteros', d.todos);
    const ms = metaSeg();
    ok('   la base de datos queda consolidada', ms.salt === nuevaSal && ms.verifier === securitymod.verifierFor(newKey) && ms.enabled === '1',
      JSON.stringify(ms));
    const fl = flags();
    ok('   las 3 marcas encrypted a 1', fl.b.encrypted === 1 && fl.p.encrypted === 1 && fl.e.encrypted === 1);
    ok('   el staging se retira SOLO al final', !fs.existsSync(m.rekeyStagingDir()));

    // OTRO ARRANQUE
    dbmod._resetParaPruebas(); DIR_DATOS = dir;
    await dbmod.getDb({ crearSiAusente: false });
    const m2 = construirMain({});
    const metaTras = JSON.stringify(metaSeg());
    const rec2 = m2.recoverInterruptedRekeyIfAny();
    ok('CORTE-reinicio) ya no queda nada pendiente', rec2 === null, JSON.stringify(rec2));
    ok('   los metadatos siguen igual', JSON.stringify(metaSeg()) === metaTras);
    ok('   y el contenido sigue descifrandose con la clave nueva', descifraDeVerdad(e.rutas, newKey).todos);
  }

  // =========================================================================
  seccion('RB. ROLLBACK: IDENTIDAD DEL .old Y DESTINO ILEGIBLE');
  // =========================================================================

  // Provoca un rollback tras completar todos los swaps.
  async function montarParaRollback(etq, alRollback) {
    const dir = carpeta(etq);
    const e = await montar(dir, { pw: PW_VIEJA, salt: SALT_VIEJA });
    const m = construirMain({});
    const oldKey = securitymod.deriveKey(PW_VIEJA, SALT_VIEJA);
    const nuevaSal = 'bb'.repeat(16);
    const newKey = securitymod.deriveKey(PW_NUEVA, nuevaSal);
    const dbPath = path.join(dir, 'panorama.sqlite3');
    let activado = false;
    const origRename = fs.renameSync;
    fs.renameSync = function () {
      const dst = String(arguments[1] || '');
      if (!activado && dst === dbPath) {
        activado = true;
        alRollback(m, e, dir);                    // se altera el estado AQUI
        const er = new Error('EIO simulado antes de confirmar'); er.code = 'EIO'; throw er;
      }
      return origRename.apply(fs, arguments);
    };
    const res = m.rekeyAllUserFiles(oldKey, newKey, {
      mode: 'change', newSalt: nuevaSal, newVerifier: securitymod.verifierFor(newKey),
      remembered: { guardar: false, valor: null },
    });
    fs.renameSync = origRename;
    return { dir, e, m, res, oldKey, newKey, activado };
  }

  // --- RB-1: el .old ha sido alterado ---------------------------------------
  {
    const ALTERADO = 'ESTO YA NO SON LOS BYTES ORIGINALES';
    const r = await montarParaRollback('RB1-old-alterado', (m) => {
      fs.writeFileSync(m.rekeyItemPath(0, 'old'), ALTERADO, 'utf8');
    });
    ok('RB-1) se llego al rollback', r.activado);
    ok('   la operacion se rechaza', r.res.ok === false, JSON.stringify(r.res).slice(0, 160));
    ok('   NO se restaura un .old cuya identidad no coincide',
      fs.existsSync(r.m.rekeyItemPath(0, 'old')) &&
      fs.readFileSync(r.m.rekeyItemPath(0, 'old'), 'utf8') === ALTERADO);
    ok('   se avisa de que la vuelta atras no se completo', /no se pudo completar/i.test(String(r.res.error)),
      String(r.res.error).slice(0, 160));
    ok('   el mensaje nombra la identidad del original', /no son sus bytes originales/i.test(String(r.res.error)),
      String(r.res.error).slice(0, 220));
    ok('   el staging se CONSERVA entero', fs.existsSync(r.m.rekeyStagingDir()));
    ok('   los otros dos archivos SI vuelven con la clave vieja',
      descifraDeVerdad(r.e.rutas, r.oldKey).prep && descifraDeVerdad(r.e.rutas, r.oldKey).eval);
    // Y la sesion queda bloqueada
    ok('RB-1) la sesion queda marcada como inconsistente', !!r.m.inconsistente());
    ok('   la barrera lo refleja', r.m.bloqueoDeSeguridad() && r.m.bloqueoDeSeguridad().motivo === 'rollback-incompleto',
      JSON.stringify(r.m.bloqueoDeSeguridad()));
    const antes = censo(r.dir);
    const rr = r.m.guardarPrep(null, { projectId: r.e.pid, meetingDate: 'x', finalidad: 'x', payload: 'NO-DEBE-ESCRIBIRSE' });
    ok('   el consumidor real DEJA de guardar', !!(rr && rr.ok === false), JSON.stringify(rr));
    ok('   y no se escribe ni un archivo ni una fila', censoIgual(antes, censo(r.dir)));
    const rk = r.m.rekeyAllUserFiles(null, r.newKey, { mode: 'setup', newSalt: 'ff'.repeat(16), newVerifier: 'x', remembered: { guardar: false, valor: null } });
    ok('   y no se puede empezar otro cambio de Seguridad', rk.ok === false, JSON.stringify(rk).slice(0, 120));
  }

  // --- RB-2: el destino no se puede LEER (no es "no existe") ----------------
  {
    let romper = null;
    const origRead = fs.readFileSync;
    const r = await montarParaRollback('RB2-destino-ilegible', (m, e) => {
      romper = e.rutas.b;                         // el backup pasa a ser ilegible
    });
    // el hook de lectura se instala dentro del propio rollback
    void origRead;
    ok('RB-2) [nota] este caso se comprueba con el hook de lectura instalado abajo', true);
    void r; void romper;
  }
  {
    const dir = carpeta('RB2b-destino-ilegible');
    const e = await montar(dir, { pw: PW_VIEJA, salt: SALT_VIEJA });
    const m = construirMain({});
    const oldKey = securitymod.deriveKey(PW_VIEJA, SALT_VIEJA);
    const nuevaSal = 'bb'.repeat(16);
    const newKey = securitymod.deriveKey(PW_NUEVA, nuevaSal);
    const dbPath = path.join(dir, 'panorama.sqlite3');
    const origRename = fs.renameSync, origRead = fs.readFileSync;
    let activado = false, ilegible = false;
    fs.renameSync = function () {
      const dst = String(arguments[1] || '');
      if (!activado && dst === dbPath) {
        activado = true; ilegible = true;
        const er = new Error('EIO simulado antes de confirmar'); er.code = 'EIO'; throw er;
      }
      return origRename.apply(fs, arguments);
    };
    fs.readFileSync = function (p) {
      if (ilegible && String(p) === e.rutas.b) { const er = new Error('EIO simulado (lectura)'); er.code = 'EIO'; throw er; }
      return origRead.apply(fs, arguments);
    };
    const shaNuevoB = (() => { try { return null; } catch (er) { return null; } })();
    const res = m.rekeyAllUserFiles(oldKey, newKey, {
      mode: 'change', newSalt: nuevaSal, newVerifier: securitymod.verifierFor(newKey),
      remembered: { guardar: false, valor: null },
    });
    fs.renameSync = origRename; fs.readFileSync = origRead;
    void shaNuevoB;
    ok('RB-2) se llego al rollback con el destino ilegible', activado);
    ok('   la operacion se rechaza', res.ok === false, JSON.stringify(res).slice(0, 160));
    ok('   un destino ILEGIBLE no se trata como ausente ni se sobrescribe',
      /no se pudo leer/i.test(String(res.error)), String(res.error).slice(0, 220));
    ok('   su original se conserva en la carpeta de trabajo', fs.existsSync(m.rekeyItemPath(0, 'old')));
    ok('   el staging se conserva', fs.existsSync(m.rekeyStagingDir()));
    ok('   la sesion queda bloqueada para escritura', !!m.inconsistente());
    const antes = censo(dir);
    const rr = m.guardarEval(null, { projectId: e.pid, payload: 'NO-DEBE-ESCRIBIRSE' });
    ok('   el consumidor real deja de guardar', !!(rr && rr.ok === false), JSON.stringify(rr));
    ok('   y no se escribe nada', censoIgual(antes, censo(dir)));
  }

  // =========================================================================
  seccion('POST. CONFIRMADO PERO NO VERIFICADO (aplicado:true)');
  // =========================================================================

  // Rompe statSync+readFileSync del .sqlite3 justo DESPUES de su rename.
  function romperTrasConfirmar(dbPath, tambienJournal) {
    const realRename = fs.renameSync, realStat = fs.statSync, realRead = fs.readFileSync;
    let roto = false;
    fs.renameSync = function () {
      const dst = String(arguments[1] || '');
      if (roto && tambienJournal && /journal\.json$/.test(dst)) {
        const e = new Error('EIO simulado (journal)'); e.code = 'EIO'; throw e;
      }
      const r = realRename.apply(fs, arguments);
      if (dst === dbPath) roto = true;
      return r;
    };
    fs.statSync = function (p) {
      if (roto && String(p) === dbPath) { const e = new Error('EIO simulado (stat)'); e.code = 'EIO'; throw e; }
      return realStat.apply(fs, arguments);
    };
    fs.readFileSync = function (p) {
      if (roto && String(p) === dbPath) { const e = new Error('EIO simulado (read)'); e.code = 'EIO'; throw e; }
      return realRead.apply(fs, arguments);
    };
    return () => { fs.renameSync = realRename; fs.statSync = realStat; fs.readFileSync = realRead; };
  }

  // --- RKEY-POST1 ----------------------------------------------------------
  {
    const dir = carpeta('POST1');
    const e = await montar(dir, { pw: PW_VIEJA, salt: SALT_VIEJA });
    const m = construirMain({});
    const oldKey = securitymod.deriveKey(PW_VIEJA, SALT_VIEJA);
    const nuevaSal = 'bb'.repeat(16);
    const newKey = securitymod.deriveKey(PW_NUEVA, nuevaSal);
    const dbPath = path.join(dir, 'panorama.sqlite3');

    const restaurar = romperTrasConfirmar(dbPath, false);
    const res = m.rekeyAllUserFiles(oldKey, newKey, {
      mode: 'change', newSalt: nuevaSal, newVerifier: securitymod.verifierFor(newKey),
      remembered: { guardar: false, valor: null },
    });
    restaurar();

    ok('POST1) el resultado es EXPLICITO: ok + aplicado + limpiezaPendiente',
      res.ok === true && res.aplicado === true && res.limpiezaPendiente === true, JSON.stringify(res).slice(0, 200));
    ok('   trae un aviso para el usuario', typeof res.aviso === 'string' && res.aviso.length > 40);
    ok('   NO hay rollback: los archivos quedan con la clave NUEVA',
      descifraDeVerdad(e.rutas, newKey).todos, JSON.stringify(descifraDeVerdad(e.rutas, newKey)));
    ok('   el staging se CONSERVA', fs.existsSync(m.rekeyJournalPath()));
    const j = JSON.parse(fs.readFileSync(m.rekeyJournalPath(), 'utf8'));
    ok('   el journal queda marcado como cleanup', j.phase === 'cleanup', j.phase);
    ok('   con el commit que SI confirmo', typeof j.consolidated_commit_id === 'string' && j.consolidated_commit_id.length === 32,
      String(j.consolidated_commit_id));
    ok('   db.js queda en desincronizada (la sesion no puede seguir escribiendo)',
      dbmod.estadoLatch() === 'desincronizada', String(dbmod.estadoLatch()));

    // Lo que hay EN DISCO: la meta nueva completa
    const enDisco = (() => {
      const d = new SQL.Database(fs.readFileSync(dbPath));
      const g = (k) => { const r = d.exec("SELECT value FROM app_meta WHERE key='" + k + "'"); return r.length ? r[0].values[0][0] : null; };
      const o = { enabled: g('security_enabled'), salt: g('security_salt'), verifier: g('security_verifier'),
        remembered: g('security_remembered'), cid: g('db_commit_id'),
        flags: [d.exec('SELECT encrypted FROM backups')[0].values[0][0],
          d.exec('SELECT encrypted FROM meeting_preps')[0].values[0][0],
          d.exec('SELECT encrypted FROM candidate_evals')[0].values[0][0]] };
      d.close(); return o;
    })();
    ok('   la meta NUEVA esta completa en el archivo de disco',
      enDisco.enabled === '1' && enDisco.salt === nuevaSal && enDisco.verifier === securitymod.verifierFor(newKey),
      JSON.stringify(enDisco));
    ok('   y las 3 marcas encrypted tambien', enDisco.flags.join(',') === '1,1,1', enDisco.flags.join(','));
    ok('   el commit del journal es el del archivo', enDisco.cid === j.consolidated_commit_id);

    // REINICIO: la recuperacion reconoce el caso B y limpia sin tocar metadatos
    dbmod._resetParaPruebas(); DIR_DATOS = dir;
    await dbmod.getDb({ crearSiAusente: false });
    const m2 = construirMain({});
    const metaAntes = JSON.stringify(metaSeg());
    const rec = m2.recoverInterruptedRekeyIfAny();
    ok('POST1-reinicio) se reconoce que ya estaba aplicado', !!(rec && rec.recovered && rec.yaEstaba), JSON.stringify(rec));
    ok('   el staging se limpia', !fs.existsSync(m2.rekeyStagingDir()));
    ok('   los metadatos NO se vuelven a escribir', JSON.stringify(metaSeg()) === metaAntes, JSON.stringify(metaSeg()));
    ok('   DESCIFRADO REAL con la clave nueva tras reiniciar', descifraDeVerdad(e.rutas, newKey).todos);
    ok('   sin perdida de datos: los 3 textos originales estan enteros', descifraDeVerdad(e.rutas, newKey).todos);
  }

  // --- POST2: si ni siquiera se puede anotar el cleanup, TAMPOCO rollback --
  {
    const dir = carpeta('POST2-sin-cleanup');
    const e = await montar(dir, { pw: PW_VIEJA, salt: SALT_VIEJA });
    const m = construirMain({});
    const oldKey = securitymod.deriveKey(PW_VIEJA, SALT_VIEJA);
    const nuevaSal = 'bb'.repeat(16);
    const newKey = securitymod.deriveKey(PW_NUEVA, nuevaSal);
    const dbPath = path.join(dir, 'panorama.sqlite3');

    const restaurar = romperTrasConfirmar(dbPath, true);   // el journal tampoco se puede escribir
    const res = m.rekeyAllUserFiles(oldKey, newKey, {
      mode: 'change', newSalt: nuevaSal, newVerifier: securitymod.verifierFor(newKey),
      remembered: { guardar: false, valor: null },
    });
    restaurar();
    ok('POST2) sigue siendo aplicado:true', res.ok === true && res.aplicado === true, JSON.stringify(res).slice(0, 160));
    ok('   se avisa de que el cleanup no quedo anotado', res.cleanupAnotado === false, String(res.cleanupAnotado));
    ok('   TAMPOCO hay rollback: los archivos siguen con la clave nueva',
      descifraDeVerdad(e.rutas, newKey).todos, JSON.stringify(descifraDeVerdad(e.rutas, newKey)));
    ok('   el staging se conserva', fs.existsSync(m.rekeyStagingDir()));

    // Al reiniciar, el journal sigue en 'swap' pero la BD ya no esta en la base:
    // es el caso B, y se demuestra por contenido.
    dbmod._resetParaPruebas(); DIR_DATOS = dir;
    await dbmod.getDb({ crearSiAusente: false });
    const m2 = construirMain({});
    const jj = JSON.parse(fs.readFileSync(m2.rekeyJournalPath(), 'utf8'));
    ok('   el journal se quedo en fase "swap"', jj.phase === 'swap', jj.phase);
    const metaAntes = JSON.stringify(metaSeg());
    const rec = m2.recoverInterruptedRekeyIfAny();
    ok('POST2-reinicio) el caso B lo demuestra igualmente por contenido',
      !!(rec && rec.recovered && rec.yaEstaba), JSON.stringify(rec));
    ok('   los metadatos NO se reescriben', JSON.stringify(metaSeg()) === metaAntes);
    ok('   el staging se limpia', !fs.existsSync(m2.rekeyStagingDir()));
  }

  // =========================================================================
  seccion('ORD. ORDEN DE ARRANQUE Y FAIL-CLOSED (sobre el main.js real)');
  // =========================================================================
  {
    const iRec = SRC.indexOf('rekeyRecovery = recoverInterruptedRekeyIfAny()');
    const iVac = SRC.indexOf('maybeRunPeriodicVacuum();', iRec);
    const iCerr = SRC.indexOf('if (rekeyRecovery && rekeyRecovery.fallaCerrado)');
    const iLogin = SRC.indexOf('const loggedIn = await runLoginFlow();');
    const iMig = SRC.indexOf('migrateLegacyInlineBackupsToFiles();', iLogin);
    const iLanz = SRC.indexOf('createLauncherWindow();', iLogin);
    ok('ORD-1) la recuperacion del rekey va ANTES del vacuum', iRec > 0 && iVac > iRec, `${iRec} / ${iVac}`);
    ok('ORD-2) el vacuum del arranque ya NO precede a la recuperacion',
      SRC.indexOf('maybeRunPeriodicVacuum();') > iRec, String(SRC.indexOf('maybeRunPeriodicVacuum();')));
    ok('ORD-3) el fail-closed va antes del vacuum', iCerr > iRec && iCerr < iVac, `${iCerr}`);
    ok('ORD-4) el fail-closed va antes del login', iCerr < iLogin);
    ok('ORD-5) ... y antes de la migracion y del launcher', iCerr < iMig && iCerr < iLanz);
    const bloqueCerr = SRC.slice(iCerr, iVac);
    ok('ORD-6) el fail-closed cierra la app', /closeSplashWindow\(\(\) => app\.quit\(\)\)/.test(bloqueCerr));
    ok('ORD-7) ... con PS-2004', /errorCodeSuffix\('PS-2004'\)/.test(bloqueCerr));
    ok('ORD-8) ... y con un return que corta el arranque', /return;\s*\r?\n/.test(bloqueCerr));
    ok('ORD-9) el texto del journal ajeno es el acordado',
      /iniciado por otro equipo/.test(bloqueCerr) && /recuperaci[oó]n manual/.test(bloqueCerr),
      bloqueCerr.slice(0, 80));
    ok('ORD-10) el aplicado:true de Seguridad cierra la app',
      /cerrarPorAplicadoSinVerificar/.test(SRC) && /cerrandoApp = true;\s*\r?\n\s*app\.quit\(\);/.test(SRC));
    ok('ORD-12) y ese camino NO deshace los archivos',
      /if \(res\.aplicado === true\) return cerrarPorAplicadoSinVerificar\(res\);/.test(SRC));
    ok('ORD-11) el callback de adopcion se registra antes de abrir la BD',
      SRC.indexOf('dbmod.alCambiarImagenEnMemoria(') < SRC.indexOf('await dbmod.getDb({ crearSiAusente: permiso.crear })'));
  }

  // =========================================================================
  seccion('C. COSTE MEDIDO DE LOS HASHES POR ARCHIVO');
  // =========================================================================
  {
    const dir = carpeta('C-coste');
    fs.mkdirSync(dir, { recursive: true });
    const m = construirMain({});
    const tam = [64 * 1024, 512 * 1024, 2 * 1024 * 1024];
    console.log('  (carpeta artificial, N=40 por tamano)');
    for (const t of tam) {
      const f = path.join(dir, 'x' + t + '.bin');
      fs.writeFileSync(f, crypto.randomBytes(t));
      let t0 = process.hrtime.bigint();
      for (let k = 0; k < 40; k++) m.sha256DeArchivo(f);
      const msHash = Number(process.hrtime.bigint() - t0) / 1e6 / 40;
      t0 = process.hrtime.bigint();
      for (let k = 0; k < 40; k++) fs.readFileSync(f);
      const msLeer = Number(process.hrtime.bigint() - t0) / 1e6 / 40;
      console.log(`    ${String(t / 1024).padStart(5)} KB  ->  hash+lectura ${msHash.toFixed(3)} ms   (solo lectura ${msLeer.toFixed(3)} ms)`);
      ok(`el hash de un archivo de ${t / 1024} KB tarda menos de 50 ms`, msHash < 50, msHash.toFixed(3) + ' ms');
    }
    console.log('    -> el swap anade UNA de estas lecturas por archivo; con 200 backups de 512 KB');
    console.log('       el sobrecoste total esta en el orden de decimas de segundo.');
  }

  // =========================================================================
  seccion('PRODUCCION NO TOCADA');
  // =========================================================================
  {
    const despues = huellaProduccion();
    let igual = true;
    HUELLA_ANTES.forEach((a, i) => {
      const b = despues[i];
      if (a.existe !== b.existe || a.sha !== b.sha || a.size !== b.size) igual = false;
    });
    ok('la huella de produccion es IDENTICA antes y despues', igual, JSON.stringify({ HUELLA_ANTES, despues }));
    HUELLA_ANTES.forEach((a, i) => {
      console.log('    ' + a.f);
      console.log('      antes:   ' + (a.existe ? a.sha + ' (' + a.size + ' B)' : 'no existe'));
      console.log('      despues: ' + (despues[i].existe ? despues[i].sha + ' (' + despues[i].size + ' B)' : 'no existe'));
    });
  }

  console.log('\n' + '='.repeat(66));
  console.log(`  BLOQUE 3 / CAPA D — Seguridad sobre A3.3: ${pass} OK, ${fail} FALLOS`);
  console.log('='.repeat(66));
  if (fail) { console.log('  fallos:'); fallos.forEach((f) => console.log('   - ' + f)); }

  try { dbmod._resetParaPruebas(); } catch (e) {}
  try { fs.rmSync(RAIZ, { recursive: true, force: true }); } catch (e) {}
  console.log('  carpetas de prueba borradas: ' + !fs.existsSync(RAIZ));
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('EXCEPCION NO CAPTURADA EN EL ARNES:', e); process.exit(2); });
