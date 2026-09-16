'use strict';
// ---------------------------------------------------------------------------
// BLOQUE 4 — el helper y la recuperacion, EN AISLAMIENTO.
// Matriz C1-C12 + ACT-MARK-1/2 + ACT-W1/2/3.
// Codigo REAL de main.js extraido a un ambito con `app` simulado. NUNCA G:.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const Module = require('module');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const MARCA_PRUEBAS = '_a33-bloque4-PRUEBAS';
const RAIZ = path.join(os.tmpdir(), MARCA_PRUEBAS);
const PROHIBIDO = ['bd-panoramaservicio', 'mi unidad', 'my drive', 'google drive', 'onedrive', 'dropbox'];
function abortar(m, r) {
  console.error('\n' + '!'.repeat(70) + `\n  ARNES ABORTADO: ${m}\n  ruta: ${r}\n` + '!'.repeat(70));
  process.exit(99);
}
// Lector unico y FAIL-CLOSED (comun/guardia-rutas.js): la clave real es
// `userDataDir`, no `dir`/`path`. Si location.json existe y no se puede
// interpretar, este arnes no se ejecuta.
const GUARDIA = require(path.join(__dirname, '..', 'comun', 'guardia-rutas.js'));
const LECT = GUARDIA.leerUbicacionReal({});
if (LECT.estado !== 'ok') abortar('location.json ' + LECT.estado + ': ' + LECT.detalle, LECT.archivo);
const REAL = LECT.ruta;
const REAL_N = REAL ? path.resolve(REAL).toLowerCase() : null;
const DEF_N = path.resolve(path.join(process.env.APPDATA || '', 'panorama-app')).toLowerCase();
function segura(p) {
  const abs = path.resolve(String(p)); const b = abs.toLowerCase();
  for (const mal of PROHIBIDO) if (b.includes(mal)) abortar(`contiene "${mal}"`, abs);
  if (REAL_N && (b === REAL_N || b.startsWith(REAL_N + path.sep))) abortar('ubicacion real', abs);
  if (b === DEF_N || b.startsWith(DEF_N + path.sep)) abortar('carpeta por defecto', abs);
  if (!b.includes(MARCA_PRUEBAS.toLowerCase())) abortar('fuera de pruebas', abs);
  return abs;
}
segura(RAIZ);
fs.rmSync(RAIZ, { recursive: true, force: true });
fs.mkdirSync(RAIZ, { recursive: true });

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const shaF = (f) => { try { return sha(fs.readFileSync(f)); } catch (e) { return 'NO-EXISTE'; } };
// PRUEBA CANONICA: la BD VIVA es <ubicacion real>/panorama.sqlite3.
// La copia de %APPDATA%\panorama-app es residual y solo dato secundario.
function huellaUna(f) {
  try { return { f, sha: shaF(f), size: fs.statSync(f).size }; } catch (e) { return { f, sha: 'no-existe' }; }
}
function huellaProd() {
  return { viva: huellaUna(path.join(REAL, 'panorama.sqlite3')),
    copiaLocal: huellaUna(path.join(process.env.APPDATA || '', 'panorama-app', 'panorama.sqlite3')) };
}
const PROD_ANTES = huellaProd();

let DIR_DATOS = path.join(RAIZ, 'datos');
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

let pass = 0, fail = 0; const fallos = [];
function ok(n, c, extra) {
  if (c) { pass++; console.log('  OK    ' + n); }
  else { fail++; fallos.push(n); console.log('  FALLO ' + n + (extra ? '  -- ' + extra : '')); }
}
function seccion(t) { console.log('\n=== ' + t + ' ==='); }
let nc = 0;
function carpeta(e) { const d = path.join(RAIZ, 'c' + (++nc) + '-' + e); segura(d); fs.mkdirSync(d, { recursive: true }); return d; }

// ---------------------------------------------------------------------------
// PANORAMA_MAIN permite apuntar a la copia con las correcciones revertidas.
const RUTA_MAIN = process.env.PANORAMA_MAIN || path.join(PROJ, 'main.js');
console.log('  main.js bajo prueba: ' + RUTA_MAIN);
const SRC = fs.readFileSync(RUTA_MAIN, 'utf8');
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

const B5 = require(path.join(__dirname, '..', 'comun', 'bloque5-extraccion.js'));
const BLOQUES = [
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
  'function recuperarAccionesPendientes()',
  'function ejecutarAccionDeArchivo(opts)',
];
// A3.3/BLOQUE 5: ejecutarAccionDeArchivo() y destinoOcupadoPorOtroEquipo()
// dependen ahora del dominio de ocupacion comun y de la puerta F-1, asi que
// el ambito real necesita tambien estas funciones de main.js.
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

function construirMain(est) {
  const cuerpo = CONSTS + '\n' +
    'let securityKey = null;\n' +
    'let seguridadRequiereRevalidacion = false;\n' +
    'let seguridadEnEstadoInconsistente = null;\n' +
    B5.PREAMBULO_B5 +
    BLOQUES.map(extraer).join('\n\n') + '\n' +
    'return { ejecutarAccionDeArchivo, recuperarAccionesPendientes, resolverAccionPendiente,\n' +
    '         journalsDeAcciones, journalsPropiosPendientes, destinoOcupadoPorOtroEquipo,\n' +
    '         estadoDestinoAccion, accionYaAplicada, leerMarcaAcciones, estadoAccionEnMarca,\n' +
    '         sentenciaMarcaAccion, journalAccionPath, accionesDir, sha256DeArchivo,\n' +
    '         escribirJsonDurable, nuevoActionId,\n' +
    '         setKey: (k) => { securityKey = k; }, getKey: () => securityKey,\n' +
    '         inconsistente: () => seguridadEnEstadoInconsistente,\n' +
    '         limpiarInconsistente: () => { seguridadEnEstadoInconsistente = null; } };';
  const f = new Function('app', 'fs', 'path', 'crypto', 'dbmod', 'securitymod', 'appLog', 'getMeta', 'session', cuerpo);
  return f(appDoble, fs, path, crypto, dbmod, securitymod,
    (s) => { (est.log = est.log || []).push(s); },
    (k) => { const r = dbmod.get('SELECT value FROM app_meta WHERE key=?', [k]); return r ? r.value : null; },
    // `session` solo lo usa vaciarParticionDe(); aquí nunca se llega a usar,
    // pero el ámbito tiene que tenerlo declarado.
    { fromPartition: () => ({ clearStorageData: () => Promise.resolve() }) });
}

// ---------------------------------------------------------------------------
let SQL = null;
async function montar(dir, writer) {
  segura(dir);
  dbmod._resetParaPruebas();
  DIR_DATOS = dir;
  if (writer) dbmod.setInstallationId(writer);
  await dbmod.getDb({ crearSiAusente: true });
  const pid = dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('P','c','persist:p','x','x')");
  const dirB = path.join(dir, 'backups'); fs.mkdirSync(dirB, { recursive: true });
  return { pid, dirB };
}
function publicarComoOtroEquipo(dir, o) {
  const p = path.join(dir, 'panorama.sqlite3');
  const d = new SQL.Database(fs.readFileSync(p));
  const set = (k, v) => d.run('INSERT INTO app_meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [k, String(v)]);
  set('db_commit_id', o.commit); set('db_parent_commit_id', o.parent);
  set('db_commit_history', JSON.stringify(o.historial || [o.commit])); set('db_generation', String(o.gen || 99));
  const b = Buffer.from(d.export()); d.close();
  fs.writeFileSync(p, b);
  fs.writeFileSync(p + '.gen', JSON.stringify({ v: 2, gen: o.gen || 99, commit_id: o.commit, parent_commit_id: o.parent, writer: 'BBBB'.padEnd(32, '0'), at: new Date().toISOString() }), 'utf8');
}
function foto(dir) {
  const out = {};
  const rec = (d, pre) => {
    let e = []; try { e = fs.readdirSync(d, { withFileTypes: true }); } catch (er) { return; }
    for (const x of e) { const f = path.join(d, x.name); if (x.isDirectory()) rec(f, pre + x.name + '/'); else out[pre + x.name] = shaF(f); }
  };
  rec(dir, ''); return out;
}
function igual(a, b) {
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  return ka.join('|') === kb.join('|') && ka.every((k) => a[k] === b[k]);
}
// Lectura defensiva: contra el codigo PRE-CORRECCIONES el archivo del usuario
// puede no existir, y eso tiene que salir como FALLO, no como excepcion.
const leer = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return '<NO EXISTE>'; } };
const TXT = 'CONTENIDO DEL USUARIO QUE NO SE PUEDE PERDER';
const TXT2 = 'SEGUNDA VERSION DEL CONTENIDO';

// Una accion de prueba con la forma real: archivo + fila en `backups`.
function accionBackup(m, dirB, pid, texto, nombre) {
  const destino = path.join(dirB, nombre || ('backup_' + crypto.randomBytes(4).toString('hex') + '.json'));
  return {
    destino,
    ejecutar: () => m.ejecutarAccionDeArchivo({
      tipo: 'backup', destino, contenidoPlano: texto, modo: 'nuevo',
      sentencias: ({ cifrado }) => ([{
        sql: 'INSERT INTO backups(project_id,created_at,reason,payload,size,file_path,encrypted) VALUES (?,?,?,?,?,?,?)',
        params: [pid, new Date().toISOString(), 'test', '', texto.length, path.basename(destino), cifrado ? 1 : 0],
      }]),
    }),
  };
}
function accionOverwrite(m, destino, pid, texto) {
  return m.ejecutarAccionDeArchivo({
    tipo: 'candidate-eval', destino, contenidoPlano: texto, modo: 'overwrite',
    sentencias: ({ cifrado }) => ([{
      sql: 'INSERT INTO candidate_evals(project_id,updated_at,encrypted) VALUES (?,?,?) ON CONFLICT(project_id) DO UPDATE SET updated_at=excluded.updated_at, encrypted=excluded.encrypted',
      params: [pid, new Date().toISOString(), cifrado ? 1 : 0],
    }]),
  });
}
// Construye a mano el estado de disco de una fase concreta.
function fabricarEstado(m, o) {
  const actionId = o.actionId || m.nuevoActionId();
  const writer = o.writer || dbmod.getInstallationId();
  const tmp = `${o.destino}.tmp-${writer}-${actionId}`;
  const old = `${o.destino}.old-${actionId}`;
  const bufN = Buffer.from(o.nuevo, 'utf8');
  const j = {
    v: 1, action_id: actionId, writer, tipo: o.tipo || 'backup',
    base_commit_id: o.base || dbmod.getCommitActual(), cifrado: 0,
    destino: o.destino, modo: o.modo || 'nuevo',
    original_sha256: o.original ? sha(Buffer.from(o.original, 'utf8')) : null,
    original_size: o.original ? o.original.length : 0,
    new_sha256: sha(bufN), new_size: bufN.length,
    fase: 'publicando', startedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(o.destino), { recursive: true });
  if (o.original !== undefined && o.original !== null) fs.writeFileSync(o.destino, o.original, 'utf8');
  if (o.hasta === 'tmp' || o.hasta === 'journal') fs.writeFileSync(tmp, bufN);
  if (o.hasta === 'old') { fs.writeFileSync(tmp, bufN); fs.renameSync(o.destino, old); }
  if (o.hasta === 'publicado') {
    if (o.modo === 'overwrite') fs.renameSync(o.destino, old);
    fs.writeFileSync(o.destino, bufN);
  }
  if (o.hasta !== 'tmp') m.escribirJsonDurable(m.journalAccionPath(actionId), j);
  return { actionId, j, tmp, old };
}

(async () => {
  SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(PROJ, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')) });
  console.log('RUTAS DE PRUEBA');
  console.log('  raiz:                ' + RAIZ);
  console.log('  ubicacion real det.: ' + (REAL || '(no configurada)'));
  ok('los bloques reales de main.js se extraen sin reescribirse',
    BLOQUES.every((b) => { try { return extraer(b).length > 20; } catch (e) { return false; } }));

  // =========================================================================
  seccion('OK. CAMINO FELIZ');
  // =========================================================================
  {
    const dir = carpeta('OK');
    const { pid, dirB } = await montar(dir);
    const m = construirMain({});
    const a = accionBackup(m, dirB, pid, TXT);
    const r = a.ejecutar();
    ok('OK-1) devuelve aplicado y verificado', r.ok === true && r.aplicado === true && r.verificado === true, JSON.stringify(r));
    ok('   el archivo esta publicado con su contenido', fs.readFileSync(a.destino, 'utf8') === TXT);
    ok('   la fila existe y apunta a ese archivo',
      !!dbmod.get('SELECT 1 AS x FROM backups WHERE file_path=?', [path.basename(a.destino)]));
    ok('   la marca lleva el action_id', m.accionYaAplicada(r.actionId));
    ok('   no queda journal', m.journalsDeAcciones().entradas.length === 0);
    ok('   no queda tmp ni old', fs.readdirSync(dirB).filter((f) => /\.(tmp|old)-/.test(f)).length === 0,
      fs.readdirSync(dirB).join(','));
    ok('OK-2) la marca y la fila salen del MISMO commit', (() => {
      const d = new SQL.Database(fs.readFileSync(path.join(dir, 'panorama.sqlite3')));
      const n = d.exec("SELECT COUNT(*) FROM backups WHERE file_path='" + path.basename(a.destino) + "'")[0].values[0][0];
      const mk = d.exec("SELECT value FROM app_meta WHERE key LIKE 'acciones_%'");
      d.close();
      return n === 1 && mk.length === 1 && String(mk[0].values[0][0]).includes(r.actionId);
    })());
  }

  // =========================================================================
  seccion('C1-C4, C7. CORTES RESUELTOS AL ARRANCAR');
  // =========================================================================

  // --- C1: corte tras el tmp, antes del journal ---------------------------
  {
    const dir = carpeta('C1'); const { dirB } = await montar(dir);
    const m = construirMain({});
    const destino = path.join(dirB, 'backup_c1.json');
    const st = fabricarEstado(m, { destino, nuevo: TXT, hasta: 'tmp', modo: 'nuevo' });
    const antes = foto(dirB);
    const r = m.recuperarAccionesPendientes();
    ok('C1) sin journal, la recuperacion no encuentra nada que resolver',
      r.resueltas.length === 0 && r.fallosCerrados.length === 0, JSON.stringify(r));
    ok('   el tmp se CONSERVA (solo se cuenta, no se borra)', fs.existsSync(st.tmp));
    ok('   el destino sigue sin existir', !fs.existsSync(destino));
    ok('   nada cambio en la carpeta', igual(antes, foto(dirB)));
  }

  // --- C2: journal escrito, nada publicado --------------------------------
  {
    const dir = carpeta('C2'); const { dirB } = await montar(dir);
    const m = construirMain({});
    const destino = path.join(dirB, 'backup_c2.json');
    const st = fabricarEstado(m, { destino, nuevo: TXT, hasta: 'journal', modo: 'nuevo' });
    const r = m.recuperarAccionesPendientes();
    ok('C2) CASO A: se deshace', r.resueltas.length === 1 && r.resueltas[0].caso === 'A', JSON.stringify(r));
    ok('   el destino sigue sin existir', !fs.existsSync(destino));
    ok('   el tmp se retira', !fs.existsSync(st.tmp));
    ok('   el journal se retira', !fs.existsSync(m.journalAccionPath(st.actionId)));
  }

  // --- C3: overwrite, original ya en .old ---------------------------------
  {
    const dir = carpeta('C3'); const { dirB } = await montar(dir);
    const m = construirMain({});
    const destino = path.join(dirB, 'estado.json');
    const st = fabricarEstado(m, { destino, original: TXT, nuevo: TXT2, hasta: 'old', modo: 'overwrite' });
    ok('C3) [estado] el destino no esta y el original esta en .old',
      !fs.existsSync(destino) && fs.readFileSync(st.old, 'utf8') === TXT);
    const r = m.recuperarAccionesPendientes();
    ok('   CASO A: se repone el original', r.resueltas.length === 1 && r.resueltas[0].caso === 'A', JSON.stringify(r));
    ok('   el destino vuelve a existir CON EL CONTENIDO ORIGINAL', fs.readFileSync(destino, 'utf8') === TXT);
    ok('   no queda .old ni .tmp', !fs.existsSync(st.old) && !fs.existsSync(st.tmp));
    ok('   PERDIDA DE DATOS: no', fs.readFileSync(destino, 'utf8') === TXT);
  }

  // --- C4: publicado, sin BD ----------------------------------------------
  for (const modo of ['nuevo', 'overwrite']) {
    const dir = carpeta('C4-' + modo); const { dirB } = await montar(dir);
    const m = construirMain({});
    const destino = path.join(dirB, 'c4.json');
    const st = fabricarEstado(m, {
      destino, nuevo: TXT2, hasta: 'publicado', modo,
      original: modo === 'overwrite' ? TXT : undefined,
    });
    ok(`C4-${modo}) [estado] el destino ya es la version nueva`, fs.readFileSync(destino, 'utf8') === TXT2);
    ok('   la marca NO contiene la accion', !m.accionYaAplicada(st.actionId));
    const r = m.recuperarAccionesPendientes();
    ok('   CASO A: se deshace', r.resueltas.length === 1 && r.resueltas[0].caso === 'A', JSON.stringify(r));
    if (modo === 'nuevo') ok('   el archivo nuevo se retira', !fs.existsSync(destino));
    else ok('   el destino vuelve al ORIGINAL', fs.readFileSync(destino, 'utf8') === TXT);
    ok('   el journal se retira', !fs.existsSync(m.journalAccionPath(st.actionId)));
  }

  // --- C7: commit confirmado + corte antes del cleanup --------------------
  {
    const dir = carpeta('C7'); const { pid, dirB } = await montar(dir);
    const m = construirMain({});
    const destino = path.join(dirB, 'c7.json');
    const st = fabricarEstado(m, { destino, original: TXT, nuevo: TXT2, hasta: 'publicado', modo: 'overwrite' });
    // la mutacion SI se aplico: fila + marca, en un solo commit
    dbmod.escribirMultiple([
      { sql: 'INSERT INTO backups(project_id,created_at,reason,payload,size,file_path,encrypted) VALUES (?,?,?,?,?,?,?)', params: [pid, 'x', 'c7', '', 1, 'c7.json', 0] },
      m.sentenciaMarcaAccion(st.actionId),
    ]);
    ok('C7) [estado] la marca esta en la BD', m.accionYaAplicada(st.actionId));
    ok('   y el journal sigue vivo', fs.existsSync(m.journalAccionPath(st.actionId)));
    const r = m.recuperarAccionesPendientes();
    ok('   CASO B: NO se deshace nada', r.resueltas.length === 1 && r.resueltas[0].caso === 'B', JSON.stringify(r));
    ok('   el destino CONSERVA la version nueva', fs.readFileSync(destino, 'utf8') === TXT2);
    ok('   el .old se limpia', !fs.existsSync(st.old));
    ok('   el journal se limpia', !fs.existsSync(m.journalAccionPath(st.actionId)));
    ok('   la fila sigue ahi', !!dbmod.get("SELECT 1 AS x FROM backups WHERE file_path='c7.json'"));
    // C12
    const r2 = m.recuperarAccionesPendientes();
    ok('C12) un segundo arranque no encuentra nada', r2.resueltas.length === 0 && r2.fallosCerrados.length === 0);
    ok('   y el contenido sigue intacto', fs.readFileSync(destino, 'utf8') === TXT2);
  }

  // =========================================================================
  seccion('C5, C6, C8. FALLOS EN VIVO');
  // =========================================================================

  // --- C5: base X -> disco Y antes de confirmar ---------------------------
  {
    const dir = carpeta('C5'); const { pid, dirB } = await montar(dir);
    dbmod.setPoliticaUbicacion('compartida');
    const m = construirMain({});
    const destino = path.join(dirB, 'estado.json');
    fs.writeFileSync(destino, TXT, 'utf8');
    const X = dbmod.getCommitActual();
    // el otro equipo publica Y justo tras publicar nuestro archivo
    let hecho = false;
    const orig = fs.renameSync;
    fs.renameSync = function () {
      const r = orig.apply(fs, arguments);
      if (!hecho && String(arguments[1] || '') === destino) {
        hecho = true;
        publicarComoOtroEquipo(dir, { commit: 'y'.repeat(32), parent: X, historial: ['y'.repeat(32), X], gen: 50 });
      }
      return r;
    };
    const r = accionOverwrite(m, destino, pid, TXT2);
    fs.renameSync = orig;
    ok('C5) el otro equipo avanzo la BD antes de confirmar', hecho);
    ok('   NO aplicado y reintentable', r.ok === false && r.aplicado === false && r.reintentable === true, JSON.stringify(r));
    ok('   el mensaje explica que fue otro equipo', /otro equipo/i.test(String(r.error)), String(r.error).slice(0, 100));
    ok('   el destino VUELVE al contenido original', fs.readFileSync(destino, 'utf8') === TXT);
    ok('   no queda journal', m.journalsDeAcciones().entradas.length === 0);
    ok('   no queda .old ni .tmp', fs.readdirSync(dirB).filter((f) => /\.(tmp|old)-/.test(f)).length === 0,
      fs.readdirSync(dirB).join(','));
    ok('   no se escribio ninguna fila', dbmod.all('SELECT * FROM candidate_evals').length === 0);
  }

  // --- C6: fallo PRE-confirmacion (EIO) -----------------------------------
  {
    const dir = carpeta('C6'); const { pid, dirB } = await montar(dir);
    const m = construirMain({});
    const destino = path.join(dirB, 'estado.json');
    fs.writeFileSync(destino, TXT, 'utf8');
    const dbPath = path.join(dir, 'panorama.sqlite3');
    const orig = fs.renameSync;
    fs.renameSync = function () {
      if (String(arguments[1] || '') === dbPath) { const e = new Error('EIO simulado'); e.code = 'EIO'; throw e; }
      return orig.apply(fs, arguments);
    };
    const r = accionOverwrite(m, destino, pid, TXT2);
    fs.renameSync = orig;
    ok('C6) NO aplicado', r.ok === false && r.aplicado === false, JSON.stringify(r).slice(0, 160));
    ok('   el destino vuelve al original', fs.readFileSync(destino, 'utf8') === TXT);
    ok('   no queda journal', m.journalsDeAcciones().entradas.length === 0);
    ok('   ninguna fila', dbmod.all('SELECT * FROM candidate_evals').length === 0);
  }

  // --- C8: aplicado:true ---------------------------------------------------
  {
    const dir = carpeta('C8'); const { pid, dirB } = await montar(dir);
    const m = construirMain({});
    const destino = path.join(dirB, 'estado.json');
    fs.writeFileSync(destino, TXT, 'utf8');
    const dbPath = path.join(dir, 'panorama.sqlite3');
    const oR = fs.renameSync, oS = fs.statSync, oRd = fs.readFileSync;
    let roto = false;
    fs.renameSync = function () { const r = oR.apply(fs, arguments); if (String(arguments[1] || '') === dbPath) roto = true; return r; };
    fs.statSync = function (p) { if (roto && String(p) === dbPath) { const e = new Error('EIO'); e.code = 'EIO'; throw e; } return oS.apply(fs, arguments); };
    fs.readFileSync = function (p) { if (roto && String(p) === dbPath) { const e = new Error('EIO'); e.code = 'EIO'; throw e; } return oRd.apply(fs, arguments); };
    const r = accionOverwrite(m, destino, pid, TXT2);
    fs.renameSync = oR; fs.statSync = oS; fs.readFileSync = oRd;
    ok('C8) forma 3: aplicado sin verificar', r.ok === true && r.aplicado === true && r.verificado === false && r.requiereReinicio === true, JSON.stringify(r).slice(0, 200));
    ok('   trae aviso', typeof r.aviso === 'string' && r.aviso.length > 40);
    ok('   NO hay rollback: el destino es la version NUEVA', fs.readFileSync(destino, 'utf8') === TXT2);
    ok('   la fila SI esta en el archivo de disco', (() => {
      const d = new SQL.Database(fs.readFileSync(dbPath));
      const n = d.exec('SELECT COUNT(*) FROM candidate_evals')[0].values[0][0]; d.close(); return n === 1;
    })());
    ok('   db.js queda desincronizada', dbmod.estadoLatch() === 'desincronizada');
  }

  // =========================================================================
  seccion('C9, C10. ROLLBACK CON TERCER HASH / ILEGIBLE');
  // =========================================================================
  {
    const dir = carpeta('C9'); const { dirB } = await montar(dir);
    const m = construirMain({});
    const destino = path.join(dirB, 'c9.json');
    const st = fabricarEstado(m, { destino, original: TXT, nuevo: TXT2, hasta: 'publicado', modo: 'overwrite' });
    fs.writeFileSync(destino, 'UN TERCER CONTENIDO ESCRITO DESDE FUERA', 'utf8');
    const antes = foto(dirB);
    const r = m.recuperarAccionesPendientes();
    ok('C9) tercer hash -> CASO C fail-closed', r.fallosCerrados.length === 1 && (r.fallosCerrados[0]||{}).caso === 'C', JSON.stringify(r));
    ok('   se clasifica como no demostrable', (r.fallosCerrados[0]||{}).clasificacion === 'accion-no-demostrable', String((r.fallosCerrados[0]||{}).clasificacion));
    ok('   NADA se toca: carpeta byte a byte igual', igual(antes, foto(dirB)));
    ok('   el .old se conserva', fs.readFileSync(st.old, 'utf8') === TXT);
    ok('   el journal se conserva', fs.existsSync(m.journalAccionPath(st.actionId)));
    const r2 = m.recuperarAccionesPendientes();
    ok('C12) sigue fail-closed en el segundo arranque', r2.fallosCerrados.length === 1);
    ok('   y sigue sin tocarse nada', igual(antes, foto(dirB)));
  }
  {
    const dir = carpeta('C10'); const { dirB } = await montar(dir);
    const m = construirMain({});
    const destino = path.join(dirB, 'c10.json');
    const st = fabricarEstado(m, { destino, original: TXT, nuevo: TXT2, hasta: 'publicado', modo: 'overwrite' });
    const antes = foto(dirB);
    const oRd = fs.readFileSync;
    fs.readFileSync = function (p) { if (String(p) === destino) { const e = new Error('EIO'); e.code = 'EIO'; throw e; } return oRd.apply(fs, arguments); };
    const r = m.recuperarAccionesPendientes();
    fs.readFileSync = oRd;
    ok('C10) destino ilegible -> CASO C', r.fallosCerrados.length === 1 && (r.fallosCerrados[0]||{}).caso === 'C', JSON.stringify(r));
    ok('   NO se trata como ausente ni se sobrescribe', igual(antes, foto(dirB)));
    ok('   el .old se conserva', fs.readFileSync(st.old, 'utf8') === TXT);
  }

  // --- CASO B con destino cambiado (la marca NO autoriza a ciegas) --------
  {
    const dir = carpeta('CB-cambiado'); const { pid, dirB } = await montar(dir);
    const m = construirMain({});
    const destino = path.join(dirB, 'cb.json');
    const st = fabricarEstado(m, { destino, original: TXT, nuevo: TXT2, hasta: 'publicado', modo: 'overwrite' });
    dbmod.escribirMultiple([m.sentenciaMarcaAccion(st.actionId)]);
    fs.writeFileSync(destino, 'TERCER CONTENIDO', 'utf8');
    const antes = foto(dirB);
    const r = m.recuperarAccionesPendientes();
    ok('CB) marca presente + destino cambiado -> NO se borra el .old', r.fallosCerrados.length === 1, JSON.stringify(r));
    ok('   se clasifica accion-aplicada-destino-cambiado',
      (r.fallosCerrados[0]||{}).clasificacion === 'accion-aplicada-destino-cambiado', String((r.fallosCerrados[0]||{}).clasificacion));
    ok('   y NO se deshace (sabemos que si se aplico)', fs.readFileSync(destino, 'utf8') === 'TERCER CONTENIDO');
    ok('   se conserva TODO el material', igual(antes, foto(dirB)));
    void pid;
  }

  // =========================================================================
  seccion('ACT-MARK. UN JOURNAL PROPIO PENDIENTE BLOQUEA ACCIONES NUEVAS');
  // =========================================================================
  {
    const dir = carpeta('ACTMARK1'); const { pid, dirB } = await montar(dir);
    const m = construirMain({});
    const a = accionBackup(m, dirB, pid, TXT, 'backup_am1.json');
    // se inyecta fallo al BORRAR el journal (F5)
    const oU = fs.unlinkSync;
    let jp = null;
    fs.unlinkSync = function (p) {
      if (/\.panorama-acciones/.test(String(p))) { jp = String(p); const e = new Error('EIO'); e.code = 'EIO'; throw e; }
      return oU.apply(fs, arguments);
    };
    const r = a.ejecutar();
    fs.unlinkSync = oU;
    ok('ACT-MARK-1) la accion A confirma', r.ok === true && r.aplicado === true, JSON.stringify(r).slice(0, 140));
    ok('   pero su journal NO se pudo borrar', !!jp && fs.existsSync(m.journalAccionPath(r.actionId)));
    ok('   la marca contiene A', m.accionYaAplicada(r.actionId));

    // 20 acciones nuevas del MISMO writer: ninguna puede confirmar hasta resolver A.
    // (A es resoluble -> la primera la resuelve y sigue; lo que se comprueba es
    //  que NUNCA se confirma una nueva con el journal de A sin resolver.)
    const marcaAntes = (m.leerMarcaAcciones().lista || []).slice();
    let confirmadasConJournalVivo = 0;
    for (let i = 0; i < 20; i++) {
      const vivo = fs.existsSync(m.journalAccionPath(r.actionId));
      const b = accionBackup(m, dirB, pid, TXT + i, 'backup_am1_' + i + '.json');
      const rb = b.ejecutar();
      if (vivo && rb.aplicado === true && fs.existsSync(m.journalAccionPath(r.actionId))) confirmadasConJournalVivo++;
    }
    ok('   NINGUNA accion nueva confirma dejando vivo el journal de A', confirmadasConJournalVivo === 0,
      String(confirmadasConJournalVivo));
    ok('   A se resolvio como CASO B (aplicada) y su journal ya no esta',
      !fs.existsSync(m.journalAccionPath(r.actionId)));
    ok('   A NO se deshizo: su archivo sigue publicado', fs.readFileSync(a.destino, 'utf8') === TXT);
    ok('   y su fila sigue en la BD', !!dbmod.get("SELECT 1 AS x FROM backups WHERE file_path='backup_am1.json'"));
    void marcaAntes;

    // reinicio
    dbmod._resetParaPruebas(); DIR_DATOS = dir;
    await dbmod.getDb({ crearSiAusente: false });
    const m2 = construirMain({});
    const rr = m2.recuperarAccionesPendientes();
    ok('   tras reiniciar no queda nada pendiente de A', rr.fallosCerrados.length === 0);
    ok('   el archivo de A sigue intacto', fs.readFileSync(a.destino, 'utf8') === TXT);
  }

  // --- ACT-MARK-2: journal pendiente SIN marca ----------------------------
  {
    const dir = carpeta('ACTMARK2'); const { pid, dirB } = await montar(dir);
    const m = construirMain({});
    const destino = path.join(dirB, 'am2.json');
    // journal pendiente, publicado, SIN marca, y con el destino alterado ->
    // no resoluble: ninguna accion nueva puede empezar.
    const st = fabricarEstado(m, { destino, original: TXT, nuevo: TXT2, hasta: 'publicado', modo: 'overwrite' });
    fs.writeFileSync(destino, 'TERCERO', 'utf8');
    ok('ACT-MARK-2) [estado] hay journal propio pendiente y sin marca',
      m.journalsPropiosPendientes().entradas.length === 1 && !m.accionYaAplicada(st.actionId));
    const antes = foto(dirB);
    const b = accionBackup(m, dirB, pid, TXT, 'am2_nueva.json');
    const rb = b.ejecutar();
    ok('   una accion nueva NO se inicia', rb.ok === false && rb.aplicado === false, JSON.stringify(rb).slice(0, 160));
    ok('   se identifica como no demostrable', rb.bloqueo === 'accion-no-demostrable', String(rb.bloqueo));
    ok('   no es reintentable', rb.reintentable === false);
    ok('   no se escribio NADA', igual(antes, foto(dirB)));
    ok('   ni una fila nueva', dbmod.all("SELECT * FROM backups WHERE file_path='am2_nueva.json'").length === 0);
  }

  // =========================================================================
  seccion('ACT-W. JOURNAL AJENO: SOLO BLOQUEA EL MISMO DESTINO');
  // =========================================================================
  {
    const dir = carpeta('ACTW'); const { pid, dirB } = await montar(dir, 'AAAA'.padEnd(32, '0'));
    const m = construirMain({});
    const dest1 = path.join(dirB, 'p1', 'estado.json');
    const dest2 = path.join(dirB, 'p2', 'estado.json');
    fs.mkdirSync(path.dirname(dest1), { recursive: true });
    fs.mkdirSync(path.dirname(dest2), { recursive: true });
    fs.writeFileSync(dest1, TXT, 'utf8');
    fs.writeFileSync(dest2, TXT, 'utf8');
    // A (otro equipo) deja un journal pendiente sobre dest1
    const st = fabricarEstado(m, {
      destino: dest1, original: TXT, nuevo: TXT2, hasta: 'publicado', modo: 'overwrite',
      writer: 'b'.repeat(32),          // otro installation-id, con formato real
    });
    const antes = foto(dirB);
    const antesJournal = shaF(m.journalAccionPath(st.actionId));

    // ACT-W1: B intenta guardar sobre EL MISMO destino
    const r1 = accionOverwrite(m, dest1, pid, 'DE-B');
    ok('ACT-W1) B NO guarda sobre el destino ocupado por otro equipo',
      r1.ok === false && r1.aplicado === false, JSON.stringify(r1).slice(0, 160));
    ok('   se identifica como ocupado-otro-writer', r1.bloqueo === 'ocupado-otro-writer', String(r1.bloqueo));
    ok('   es reintentable', r1.reintentable === true);
    ok('   NO escribe archivo: la carpeta queda igual', igual(antes, foto(dirB)));
    ok('   el journal ajeno queda byte a byte intacto', shaF(m.journalAccionPath(st.actionId)) === antesJournal);
    ok('   no escribe ninguna fila', dbmod.all('SELECT * FROM candidate_evals').length === 0);

    // ACT-W2: B guarda sobre OTRO destino -> permitido
    const r2 = accionOverwrite(m, dest2, pid, 'DE-B-EN-P2');
    ok('ACT-W2) B SI puede guardar en otro proyecto', r2.ok === true && r2.aplicado === true, JSON.stringify(r2).slice(0, 160));
    ok('   con su contenido', fs.readFileSync(dest2, 'utf8') === 'DE-B-EN-P2');
    ok('   y el journal ajeno sigue intacto', shaF(m.journalAccionPath(st.actionId)) === antesJournal);

    // ACT-W3: backup nuevo con nombre unico -> no bloquea
    const a3 = accionBackup(m, dirB, pid, TXT, 'backup_w3.json');
    const r3 = a3.ejecutar();
    ok('ACT-W3) un backup nuevo con destino distinto no queda bloqueado',
      r3.ok === true && r3.aplicado === true, JSON.stringify(r3).slice(0, 140));

    // y la recuperacion NO toca el journal ajeno
    const rec = m.recuperarAccionesPendientes();
    ok('   la recuperacion IGNORA el journal ajeno (no lo resuelve ni lo borra)',
      rec.ajenos === 1 && rec.fallosCerrados.length === 0, JSON.stringify(rec));
    ok('   y sigue intacto', shaF(m.journalAccionPath(st.actionId)) === antesJournal);
  }

  // --- journal ajeno CORRUPTO ---------------------------------------------
  {
    const dir = carpeta('ACTW-corrupto'); const { pid, dirB } = await montar(dir);
    const m = construirMain({});
    fs.mkdirSync(m.accionesDir(), { recursive: true });
    const jp = path.join(m.accionesDir(), 'roto.json');
    fs.writeFileSync(jp, '{ esto no es json', 'utf8');
    const shaJ = shaF(jp);
    const destino = path.join(dirB, 'estado.json');
    fs.writeFileSync(destino, TXT, 'utf8');
    const r = accionOverwrite(m, destino, pid, TXT2);
    ok('W-corrupto) con un journal ajeno ilegible no se toca nada que pudiera colisionar',
      r.ok === false && r.bloqueo === 'ocupado-otro-writer', JSON.stringify(r).slice(0, 160));
    ok('   es reintentable (no cierra la app)', r.reintentable === true);
    ok('   el journal corrupto NO se borra', shaF(jp) === shaJ);
    ok('   el destino no cambia', fs.readFileSync(destino, 'utf8') === TXT);
    const rec = m.recuperarAccionesPendientes();
    ok('   la recuperacion lo conserva sin tocarlo', rec.ilegiblesAjenos === 1 && shaF(jp) === shaJ, JSON.stringify(rec));
  }

  // =========================================================================
  seccion('ACT-JOURNAL-SCHEMA. EVIDENCIA INCOMPLETA != ESTADO AUSENTE');
  // =========================================================================
  {
    const dir = carpeta('SCHEMA'); const { pid, dirB } = await montar(dir);
    const m = construirMain({});
    const yo = dbmod.getInstallationId();
    const destino = path.join(dirB, 'schema.json');

    // journal COMPLETO de referencia (modo overwrite, con material en disco)
    const base = () => ({
      v: 1, action_id: m.nuevoActionId(), writer: yo, tipo: 'candidate-eval',
      base_commit_id: dbmod.getCommitActual(), cifrado: 0,
      destino, modo: 'overwrite',
      original_sha256: sha(Buffer.from(TXT, 'utf8')), original_size: TXT.length,
      new_sha256: sha(Buffer.from(TXT2, 'utf8')), new_size: TXT2.length,
      fase: 'publicando', startedAt: new Date().toISOString(),
    });

    // Referencia: el journal completo SI se acepta.
    {
      const j = base();
      fs.mkdirSync(m.accionesDir(), { recursive: true });
      m.escribirJsonDurable(m.journalAccionPath(j.action_id), j);
      const leido = m.journalsDeAcciones().entradas[0];
      ok('SCHEMA-0) un journal COMPLETO se acepta como valido', leido.clase === 'valido',
        JSON.stringify(leido.motivo));
      fs.unlinkSync(m.journalAccionPath(j.action_id));
    }

    const variantes = [
      ['1 falta new_sha256', (j) => { delete j.new_sha256; }],
      ['2 new_sha256 no es SHA-256', (j) => { j.new_sha256 = 'no-es-un-hash'; }],
      ['3 falta modo', (j) => { delete j.modo; }],
      ['4 overwrite sin original_sha256', (j) => { j.modo = 'overwrite'; j.original_sha256 = null; j.original_size = 0; }],
      ['5 nuevo con original_sha256', (j) => { j.modo = 'nuevo'; }],
      ['6 base_commit_id corrupto', (j) => { j.base_commit_id = 'xx'; }],
      ['7 action_id mal formado', (j) => { j.action_id = 'corto'; }],
      ['8 falta new_size', (j) => { delete j.new_size; }],
      ['9 tipo desconocido', (j) => { j.tipo = 'inventado'; }],
      ['10 fase inesperada', (j) => { j.fase = 'hecho'; }],
      ['11 cifrado no booleano', (j) => { j.cifrado = 'si'; }],
      ['12 destino relativo', (j) => { j.destino = 'relativo.json'; }],
    ];

    for (const [etq, romper] of variantes) {
      // material REAL en disco: destino publicado (N) y el original en .old
      fs.rmSync(m.accionesDir(), { recursive: true, force: true });
      fs.readdirSync(dirB).forEach((f) => { try { fs.unlinkSync(path.join(dirB, f)); } catch (e) {} });
      const j = base();
      romper(j);
      const idFichero = (typeof j.action_id === 'string' && j.action_id) ? j.action_id : 'sinid';
      const old = `${destino}.old-${idFichero}`;
      fs.writeFileSync(destino, TXT2, 'utf8');          // ya publicado
      fs.writeFileSync(old, TXT, 'utf8');               // el original, unica copia
      fs.mkdirSync(m.accionesDir(), { recursive: true });
      const rutaJ = path.join(m.accionesDir(), idFichero + '.json');
      m.escribirJsonDurable(rutaJ, j);

      const antes = foto(dirB);
      const shaJ = shaF(rutaJ);
      const leido = m.journalsDeAcciones().entradas[0];
      ok(`SCHEMA-${etq}: NO se acepta como evidencia valida`,
        leido && leido.clase !== 'valido', leido && (leido.clase + ' / ' + String(leido.motivo).slice(0, 70)));

      const rec = m.recuperarAccionesPendientes();
      ok('   la recuperacion NO hace rollback', rec.resueltas.length === 0, JSON.stringify(rec.resueltas));
      ok('   NO destruye ni un byte', igual(antes, foto(dirB)), Object.keys(antes).join(',') + ' -> ' + Object.keys(foto(dirB)).join(','));
      ok('   el .old (unica copia del original) sigue ahi', leer(old) === TXT);
      ok('   el journal NO se borra', shaF(rutaJ) === shaJ);

      // y ninguna accion propia nueva puede empezar (si es identificable como nuestra)
      const identificable = /^[0-9a-f]{32}$/i.test(String(j.writer));
      const b = accionBackup(m, dirB, pid, TXT, 'schema_nueva.json');
      const rb = b.ejecutar();
      ok('   ninguna accion propia nueva comienza', rb.ok === false, JSON.stringify(rb).slice(0, 140));
      ok('   y no escribio nada', !fs.existsSync(path.join(dirB, 'schema_nueva.json')));
      void identificable;
    }
    fs.rmSync(m.accionesDir(), { recursive: true, force: true });
  }

  // =========================================================================
  seccion('ACT-F3. FALLO VIVO ENTRE LOS DOS RENAMES DE F3');
  // =========================================================================

  // --- ACT-F3-1: el segundo rename falla; la vuelta atrás SI es posible ----
  {
    const dir = carpeta('F3-1'); const { pid, dirB } = await montar(dir);
    const m = construirMain({});
    const destino = path.join(dirB, 'estado.json');
    fs.writeFileSync(destino, TXT, 'utf8');
    // EIO solo en el SEGUNDO rename (el que publica sobre el destino)
    const oR = fs.renameSync;
    let apartado = false, publicacionFallada = false, repuesto = false;
    fs.renameSync = function () {
      const dst = String(arguments[1] || '');
      if (dst === destino) {
        if (!publicacionFallada) {
          // el PRIMER intento de publicar sobre el destino falla
          publicacionFallada = true;
          const e = new Error('EIO simulado'); e.code = 'EIO'; throw e;
        }
        repuesto = true;           // el rollback repone el original
      }
      const r = oR.apply(fs, arguments);
      if (/\.old-/.test(dst)) apartado = true;
      return r;
    };
    const r = accionOverwrite(m, destino, pid, TXT2);
    fs.renameSync = oR;
    ok('ACT-F3-1) el primer rename aparto el original y el segundo fallo',
      apartado === true && publicacionFallada === true, `apartado=${apartado} fallo=${publicacionFallada}`);
    ok('   y la vuelta atras repuso el original con otro rename', repuesto === true);
    ok('   devuelve NO aplicado', r.ok === false && r.aplicado === false, JSON.stringify(r).slice(0, 160));
    ok('   el destino vuelve EXACTAMENTE al original', leer(destino) === TXT);
    ok('   no queda .old ni .tmp', fs.readdirSync(dirB).filter((f) => /\.(old|tmp)-/.test(f)).length === 0,
      fs.readdirSync(dirB).join(','));
    ok('   no queda journal', m.journalsDeAcciones().entradas.length === 0);
    ok('   ninguna fila', dbmod.all('SELECT * FROM candidate_evals').length === 0);
    ok('   PERDIDA DE DATOS: no', leer(destino) === TXT);
  }

  // --- ACT-F3-2: el segundo rename falla Y la vuelta atrás tambien --------
  {
    const dir = carpeta('F3-2'); const { pid, dirB } = await montar(dir);
    const m = construirMain({});
    const destino = path.join(dirB, 'estado.json');
    fs.writeFileSync(destino, TXT, 'utf8');
    // TODO rename hacia el destino falla: ni publicar ni reponer
    const oR = fs.renameSync;
    fs.renameSync = function () {
      if (String(arguments[1] || '') === destino) { const e = new Error('EIO simulado'); e.code = 'EIO'; throw e; }
      return oR.apply(fs, arguments);
    };
    const r = accionOverwrite(m, destino, pid, TXT2);
    const jsDespues = m.journalsDeAcciones();
    fs.renameSync = oR;
    ok('ACT-F3-2) devuelve NO aplicado y NO reintentable', r.ok === false && r.reintentable === false, JSON.stringify(r).slice(0, 180));
    ok('   se identifica como no demostrable', r.bloqueo === 'accion-no-demostrable', String(r.bloqueo));
    ok('   CERO destruccion: el journal se conserva', jsDespues.entradas.length === 1, JSON.stringify(jsDespues.entradas.length));
    ok('   el .old con el original se conserva', (() => {
      const olds = fs.readdirSync(dirB).filter((f) => /\.old-/.test(f));
      return olds.length === 1 && fs.readFileSync(path.join(dirB, olds[0]), 'utf8') === TXT;
    })(), fs.readdirSync(dirB).join(','));
    ok('   la sesion queda bloqueada', !!m.inconsistente());
    ok('   ninguna fila', dbmod.all('SELECT * FROM candidate_evals').length === 0);
    // siguiente arranque: con los renames ya posibles, se resuelve
    const m2 = construirMain({});
    const rec = m2.recuperarAccionesPendientes();
    ok('   el siguiente arranque lo resuelve', rec.resueltas.length === 1 && (rec.resueltas[0]||{}).caso === 'A', JSON.stringify(rec));
    ok('   y el destino vuelve al ORIGINAL', leer(destino) === TXT);
  }

  // =========================================================================
  seccion('ACT-MARK-CORRUPT. MARCA ILEGIBLE != NINGUNA ACCION APLICADA');
  // =========================================================================
  {
    const dir = carpeta('MARKCORRUPT'); const { pid, dirB } = await montar(dir);
    const m = construirMain({});
    const a = accionBackup(m, dirB, pid, TXT, 'backup_mc.json');
    const oU = fs.unlinkSync;
    fs.unlinkSync = function (p) {
      if (/\.panorama-acciones/.test(String(p))) { const e = new Error('EIO'); e.code = 'EIO'; throw e; }
      return oU.apply(fs, arguments);
    };
    const r = a.ejecutar();
    fs.unlinkSync = oU;
    ok('ACT-MARK-CORRUPT) A confirma y deja su journal', r.aplicado === true && fs.existsSync(m.journalAccionPath(r.actionId)));

    // se corrompe la marca
    const w = dbmod.getInstallationId();
    dbmod.run("INSERT INTO app_meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      ['acciones_' + w, '{esto no es una lista']);
    ok('   la marca queda corrupta', m.leerMarcaAcciones().ok === false && m.leerMarcaAcciones().noDemostrable === true,
      JSON.stringify(m.leerMarcaAcciones()));
    ok('   estadoAccionEnMarca dice "no-demostrable", NO "no-aplicada"',
      m.estadoAccionEnMarca(r.actionId).estado === 'no-demostrable', m.estadoAccionEnMarca(r.actionId).estado);

    // reinicio
    dbmod._resetParaPruebas(); DIR_DATOS = dir;
    await dbmod.getDb({ crearSiAusente: false });
    const m2 = construirMain({});
    const antes = foto(dirB);
    const rec = m2.recuperarAccionesPendientes();
    ok('   la recuperacion NO deshace A', rec.fallosCerrados.length === 1 && rec.resueltas.length === 0, JSON.stringify(rec));
    ok('   se clasifica accion-no-demostrable', (rec.fallosCerrados[0]||{}).clasificacion === 'accion-no-demostrable',
      String((rec.fallosCerrados[0]||{}).clasificacion));
    ok('   el archivo de A sigue intacto', leer(a.destino) === TXT);
    ok('   su fila sigue en la BD', !!dbmod.get("SELECT 1 AS x FROM backups WHERE file_path='backup_mc.json'"));
    ok('   material y journal conservados byte a byte', igual(antes, foto(dirB)));
    ok('   el journal sigue ahi', fs.existsSync(m2.journalAccionPath(r.actionId)));
    // y ninguna accion nueva puede empezar
    const b = accionBackup(m2, dirB, pid, TXT, 'mc_nueva.json');
    const rb = b.ejecutar();
    ok('   ninguna accion propia nueva puede empezar', rb.ok === false && rb.bloqueo === 'accion-no-demostrable',
      JSON.stringify(rb).slice(0, 160));
    ok('   y no escribio nada', !fs.existsSync(path.join(dirB, 'mc_nueva.json')));
  }

  // =========================================================================
  seccion('ACT-DIR-EIO. NO PODER LEER LA CARPETA != NO HAY JOURNALS');
  // =========================================================================
  {
    const dir = carpeta('DIREIO'); const { pid, dirB } = await montar(dir);
    const m = construirMain({});
    const destino = path.join(dirB, 'dir.json');
    const st = fabricarEstado(m, { destino, nuevo: TXT, hasta: 'journal', modo: 'nuevo' });
    ok('ACT-DIR-EIO) [estado] hay un journal propio pendiente', m.journalsPropiosPendientes().entradas.length === 1);

    const antes = foto(dirB);
    const commitAntes = dbmod.getCommitActual();
    const oRd = fs.readdirSync;
    fs.readdirSync = function (p) {
      if (String(p).includes('.panorama-acciones')) { const e = new Error('EIO simulado'); e.code = 'EIO'; throw e; }
      return oRd.apply(fs, arguments);
    };
    const listado = m.journalsDeAcciones();
    const b = accionBackup(m, dirB, pid, TXT, 'direio_nueva.json');
    const rb = b.ejecutar();
    const rec = m.recuperarAccionesPendientes();
    fs.readdirSync = oRd;

    ok('   journalsDeAcciones() NO devuelve lista vacia', listado.ok === false && listado.noVerificable === true,
      JSON.stringify(listado).slice(0, 120));
    ok('   una accion nueva NO se inicia', rb.ok === false && rb.aplicado === false, JSON.stringify(rb).slice(0, 160));
    ok('   se identifica como no verificable', rb.bloqueo === 'accion-no-verificable', String(rb.bloqueo));
    ok('   CERO commits: el commit de la BD no avanza', dbmod.getCommitActual() === commitAntes);
    ok('   ningun archivo cambia', igual(antes, foto(dirB)));
    ok('   la recuperacion tampoco inventa ausencia', rec.noVerificable === true && rec.fallosCerrados.length === 1,
      JSON.stringify(rec).slice(0, 160));

    // al recuperar el acceso, el journal original se resuelve normalmente
    const rec2 = m.recuperarAccionesPendientes();
    ok('   recuperado el acceso, el journal original se resuelve', rec2.resueltas.length === 1 && (rec2.resueltas[0]||{}).caso === 'A',
      JSON.stringify(rec2));
    ok('   y su tmp y journal se retiran', !fs.existsSync(st.tmp) && !fs.existsSync(m.journalAccionPath(st.actionId)));
  }

  // =========================================================================
  seccion('ACT-B-OLD. CASO B CON .old ALTERADO');
  // =========================================================================
  {
    const dir = carpeta('BOLD'); const { pid, dirB } = await montar(dir);
    const m = construirMain({});
    const destino = path.join(dirB, 'bold.json');
    const st = fabricarEstado(m, { destino, original: TXT, nuevo: TXT2, hasta: 'publicado', modo: 'overwrite' });
    dbmod.escribirMultiple([m.sentenciaMarcaAccion(st.actionId)]);
    fs.writeFileSync(st.old, 'EL .old YA NO SON LOS BYTES ORIGINALES', 'utf8');
    const antes = foto(dirB);
    ok('ACT-B-OLD) [estado] marca presente y destino = N',
      m.accionYaAplicada(st.actionId) && leer(destino) === TXT2);
    const rec = m.recuperarAccionesPendientes();
    ok('   NO se declara limpiado', rec.resueltas.length === 0 && rec.fallosCerrados.length === 1, JSON.stringify(rec));
    ok('   se clasifica residuo-no-demostrable', (rec.fallosCerrados[0]||{}).clasificacion === 'residuo-no-demostrable',
      String((rec.fallosCerrados[0]||{}).clasificacion));
    ok('   el .old NO se borra', fs.existsSync(st.old));
    ok('   el journal NO se borra', fs.existsSync(m.journalAccionPath(st.actionId)));
    ok('   NO hay rollback: el destino sigue siendo N', leer(destino) === TXT2);
    ok('   nada cambia en la carpeta', igual(antes, foto(dirB)));
    void pid;
  }

  // =========================================================================
  seccion('ACT-NEW-EVAL. PRIMER GUARDADO SIN DESTINO PREVIO');
  // =========================================================================
  {
    const dir = carpeta('NEWEVAL'); const { pid, dirB } = await montar(dir);
    const m = construirMain({});
    const destino = path.join(dirB, 'evals', 'estado.json');
    ok('ACT-NEW-EVAL) [estado] el destino NO existe', !fs.existsSync(destino));
    const dbPath = path.join(dir, 'panorama.sqlite3');
    const oR = fs.renameSync;
    fs.renameSync = function () {
      if (String(arguments[1] || '') === dbPath) { const e = new Error('EIO simulado'); e.code = 'EIO'; throw e; }
      return oR.apply(fs, arguments);
    };
    // el caller pide 'overwrite' aunque no haya nada: el helper deriva el modo
    const r = accionOverwrite(m, destino, pid, TXT);
    fs.renameSync = oR;
    ok('   NO aplicado', r.ok === false && r.aplicado === false, JSON.stringify(r).slice(0, 160));
    ok('   el archivo nuevo se retira', !fs.existsSync(destino));
    ok('   cero fila', dbmod.all('SELECT * FROM candidate_evals').length === 0);
    ok('   cero journal', m.journalsDeAcciones().entradas.length === 0);
    ok('   cero .old y cero .tmp', (() => {
      const d = path.dirname(destino);
      return !fs.existsSync(d) || fs.readdirSync(d).length === 0;
    })());
    // segundo intento: ahora si
    const r2 = accionOverwrite(m, destino, pid, TXT);
    ok('   el segundo intento guarda normalmente', r2.ok === true && r2.aplicado === true, JSON.stringify(r2).slice(0, 160));
    ok('   con su contenido', leer(destino) === TXT);
    ok('   y su fila', dbmod.all('SELECT * FROM candidate_evals').length === 1);
    // y un tercer guardado ya es overwrite de verdad
    const r3 = accionOverwrite(m, destino, pid, TXT2);
    ok('   el tercero ya es un reemplazo real', r3.ok === true && leer(destino) === TXT2);
    ok('   sin dejar residuos', fs.readdirSync(path.dirname(destino)).filter((f) => /\.(old|tmp)-/.test(f)).length === 0,
      fs.readdirSync(path.dirname(destino)).join(','));
  }

  // =========================================================================
  seccion('PRODUCCION NO TOCADA');
  // =========================================================================
  {
    const d = huellaProd();
    ok('la BD VIVA es IDENTICA', PROD_ANTES.viva.sha === d.viva.sha && PROD_ANTES.viva.size === d.viva.size,
      JSON.stringify({ antes: PROD_ANTES.viva, despues: d.viva }));
    ok('la copia local residual es IDENTICA (dato secundario)',
      PROD_ANTES.copiaLocal.sha === d.copiaLocal.sha);
    console.log('    BD viva:  ' + PROD_ANTES.viva.f);
    console.log('    antes:    ' + PROD_ANTES.viva.sha);
    console.log('    despues:  ' + d.viva.sha);
  }

  console.log('\n' + '='.repeat(66));
  console.log(`  BLOQUE 4 — helper y recuperacion aislados: ${pass} OK, ${fail} FALLOS`);
  console.log('='.repeat(66));
  if (fail) { console.log('  fallos:'); fallos.forEach((f) => console.log('   - ' + f)); }
  try { dbmod._resetParaPruebas(); } catch (e) {}
  try { fs.rmSync(RAIZ, { recursive: true, force: true }); } catch (e) {}
  console.log('  carpetas de prueba borradas: ' + !fs.existsSync(RAIZ));
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('EXCEPCION NO CAPTURADA:', e); process.exit(2); });
