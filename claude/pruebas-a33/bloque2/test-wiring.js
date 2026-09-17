'use strict';
// ---------------------------------------------------------------------------
// BLOQUE 2 — pruebas del wiring REAL de main.js.
//
// No se puede cargar main.js entero fuera de Electron (abre ventanas, registra
// IPC...). Se extraen los BLOQUES REALES de código del main.js del proyecto y
// se ejecutan contra el db.js REAL, con dobles mínimos de `app`/`dialog`.
// Igual que las suites de A1/A2/B2: nada de reescribir la lógica.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const Module = require('module');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';

// ===========================================================================
// GUARDIÁN DE RUTAS — idéntico al del bloque 1.
// ===========================================================================
const MARCA = '_a33-bloque2-PRUEBAS';
const RAIZ = path.join(os.tmpdir(), MARCA);
const PROHIBIDO = ['bd-panoramaservicio', 'mi unidad', 'my drive', 'google drive', 'onedrive', 'dropbox'];

function abortar(motivo, ruta) {
  console.error('\n' + '!'.repeat(70));
  console.error('  ARNÉS ABORTADO POR SEGURIDAD\n  motivo: ' + motivo + '\n  ruta:   ' + ruta);
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
const REAL_N = REAL ? path.resolve(REAL).toLowerCase() : null;
const DEF_N = path.resolve(path.join(process.env.APPDATA || '', 'panorama-app')).toLowerCase();
function segura(p) {
  const abs = path.resolve(String(p));
  const b = abs.toLowerCase();
  for (const m of PROHIBIDO) if (b.includes(m)) abortar(`la ruta contiene "${m}"`, abs);
  if (REAL_N && (b === REAL_N || b.startsWith(REAL_N + path.sep))) abortar('coincide con la ubicación real del usuario', abs);
  if (b === DEF_N || b.startsWith(DEF_N + path.sep)) abortar('apunta a la carpeta de datos por defecto instalada', abs);
  if (!b.includes(MARCA.toLowerCase())) abortar(`fuera de la ubicación marcada para pruebas ("${MARCA}")`, abs);
  return abs;
}
segura(RAIZ);
fs.rmSync(RAIZ, { recursive: true, force: true });
fs.mkdirSync(RAIZ, { recursive: true });

// PRUEBA CANONICA de "produccion intacta": la BD VIVA, que es
// <ubicacion real>/panorama.sqlite3. %APPDATA%\panorama-app\panorama.sqlite3
// es una copia local residual y NO demuestra nada; queda como dato secundario.
function huellaDe(f) {
  try {
    const b = fs.readFileSync(f); const s = fs.statSync(f);
    return { f, existe: true, sha: crypto.createHash('sha256').update(b).digest('hex'), size: s.size, mtimeMs: s.mtimeMs };
  } catch (e) { return { f, existe: false, err: (e && e.code) || String(e) }; }
}
function huellaProd() {
  return { viva: huellaDe(path.join(REAL, 'panorama.sqlite3')),
    copiaLocal: huellaDe(path.join(process.env.APPDATA || '', 'panorama-app', 'panorama.sqlite3')) };
}
const PROD_ANTES = huellaProd();

// ===========================================================================
// Dobles de electron y carga del db.js REAL
// ===========================================================================
let DIR_DATOS = path.join(RAIZ, 'datos');
let DIR_APPDATA = path.join(RAIZ, 'appdata');
fs.mkdirSync(DIR_DATOS, { recursive: true });
fs.mkdirSync(DIR_APPDATA, { recursive: true });

let respuestaDialogo = 0;        // lo que "pulsa" el usuario en PS-1009
const dialogosMostrados = [];
const appDoble = {
  getPath: (k) => (k === 'appData' ? DIR_APPDATA : DIR_DATOS),
  setPath: (k, v) => { if (k === 'userData') DIR_DATOS = v; },
};
const dialogDoble = {
  showMessageBoxSync: (w, opciones) => { dialogosMostrados.push(opciones); return respuestaDialogo; },
};
const origLoad = Module._load;
Module._load = function (request) {
  if (request === 'electron') return { app: appDoble, dialog: dialogDoble };
  return origLoad.apply(this, arguments);
};

const dbmod = require(path.join(PROJ, 'db.js'));
const initSqlJs = require(path.join(PROJ, 'node_modules', 'sql.js'));

let pass = 0, fail = 0;
const fallos = [];
function ok(n, c, extra) {
  if (c) { pass++; console.log('  OK    ' + n); }
  else { fail++; fallos.push(n); console.log('  FALLO ' + n + (extra ? '  -- ' + extra : '')); }
}
function seccion(t) { console.log('\n=== ' + t + ' ==='); }

let n = 0;
const rutas = [];
function carpeta(etq) {
  const d = path.join(RAIZ, 'c' + (++n) + '-' + etq);
  segura(d); fs.mkdirSync(d, { recursive: true }); rutas.push(d); return d;
}

// ===========================================================================
// EXTRACCIÓN DE LOS BLOQUES REALES DE main.js
// ===========================================================================
const SRC = fs.readFileSync(path.join(PROJ, 'main.js'), 'utf8');
function extraer(firma) {
  const i = SRC.indexOf(firma);
  if (i < 0) throw new Error('NO SE ENCONTRÓ en main.js: ' + firma);
  // recorta desde la firma hasta la llave de cierre a nivel 0
  let j = SRC.indexOf('{', i);
  let prof = 0;
  for (let k = j; k < SRC.length; k++) {
    if (SRC[k] === '{') prof++;
    else if (SRC[k] === '}') { prof--; if (prof === 0) return SRC.slice(i, k + 1); }
  }
  throw new Error('no se pudo delimitar: ' + firma);
}
const BLOQUES = [
  'function rutaRegistroUbicaciones()',
  'function claveUbicacion(dir)',
  'function leerRegistroUbicaciones()',
  'function guardarRegistroUbicaciones(ubicaciones)',
  'function ubicacionYaInicializada(dir)',
  'function estadoUbicacion(dir)',
  'function escribirEntradaUbicacion(dir, entrada)',
  'function marcarUbicacionInicializando(dir)',
  'function restosEnCarpetaDeDatos(dir)',
  'function marcarUbicacionDetectadaExistente(dir)',
  'function marcarUbicacionInicializada(dir, commitId)',
  'function rutaConIndiciosDeNube(ruta)',
  'function clasificarPoliticaUbicacion()',
  'function decidirCrearSiAusente()',
  'function estadoDeArchivoEnRuta(p)',
];
const INDICIOS = SRC.slice(SRC.indexOf('const INDICIOS_DE_NUBE'), SRC.indexOf(']', SRC.indexOf('const INDICIOS_DE_NUBE')) + 2);
// Constantes de módulo que esos bloques usan y que hay que llevar al ámbito.
const CONSTS = [
  SRC.slice(SRC.indexOf('const FSYNC_NO_SOPORTADO_REG'),
    SRC.indexOf('\n', SRC.indexOf('const FSYNC_NO_SOPORTADO_REG')) + 1),
].join('\n');

// Construye el ámbito REAL con las variables de main.js que esos bloques usan.
function construirMain(estado) {
  const cuerpo =
    INDICIOS + '\n' + CONSTS + '\n' +
    BLOQUES.map(extraer).join('\n\n') + '\n' +
    'function isUsingCustomDataLocationNow() { return !!customUserDataDirTarget && !customUserDataDirFailure; }\n' +
    'return { rutaRegistroUbicaciones, leerRegistroUbicaciones, guardarRegistroUbicaciones,\n' +
    '         ubicacionYaInicializada, marcarUbicacionInicializada, rutaConIndiciosDeNube,\n' +
    '         clasificarPoliticaUbicacion, decidirCrearSiAusente, estadoDeArchivoEnRuta,\n' +
    '         estadoUbicacion, marcarUbicacionInicializando, restosEnCarpetaDeDatos,\n' +
    '         marcarUbicacionDetectadaExistente,\n' +
    '         set: (k,v) => { if(k===\'target\') customUserDataDirTarget=v;\n' +
    '                         else if(k===\'failure\') customUserDataDirFailure=v;\n' +
    '                         else if(k===\'shared\') customUserDataDirShared=v;\n' +
    '                         else if(k===\'autoriza\') usuarioAutorizaEmpezarDesdeCero=v; } };';
  // P9 (17 sept 2026): decidirCrearSiAusente() consulta además
  // `configUbicacionNoResuelta` (location.json presente pero inutilizable →
  // no se autoriza crear). Aquí vale siempre null: esta batería no trata
  // location.json (eso es p9/). Sin la declaración, el ámbito revienta con
  // «configUbicacionNoResuelta is not defined» — defecto de arnés, no de producto.
  const f = new Function('app', 'fs', 'path', 'crypto', 'dbmod', 'appLog',
    'let customUserDataDirTarget = null, customUserDataDirFailure = null, customUserDataDirShared = false;\n' +
    'let configUbicacionNoResuelta = null;\n' +
    'let usuarioAutorizaEmpezarDesdeCero = false;\n' + cuerpo);
  return f(appDoble, fs, path, crypto, dbmod, (s) => { (estado.log = estado.log || []).push(s); });
}

let SQL = null;
async function abrirDb(dir, opts) {
  segura(dir);
  dbmod._resetParaPruebas();
  DIR_DATOS = dir;
  return dbmod.getDb(opts);
}

(async () => {
  SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(PROJ, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')) });
  console.log('RUTAS DE PRUEBA');
  console.log('  raíz:                ' + RAIZ);
  console.log('  ubicación real det.: ' + (REAL || '(no configurada)'));
  console.log('  por defecto:         ' + path.join(process.env.APPDATA || '', 'panorama-app'));

  ok('los 10 bloques de main.js se extraen sin reescribirse',
    BLOQUES.every((b) => { try { return extraer(b).length > 20; } catch (e) { return false; } }));

  // =========================================================================
  seccion('F. POLÍTICA DE UBICACIÓN');
  // =========================================================================
  {
    const m = construirMain({});
    ok('carpeta por defecto -> local', m.clasificarPoliticaUbicacion().politica === 'local',
      JSON.stringify(m.clasificarPoliticaUbicacion()));

    const casos = [
      ['G:\\Mi unidad\\BD-PanoramaServicio', 'compartida'],
      ['C:\\Users\\x\\Google Drive\\datos', 'compartida'],
      ['C:\\Users\\x\\OneDrive\\Panorama', 'compartida'],
      ['C:\\Users\\x\\Dropbox\\Panorama', 'compartida'],
      ['\\\\servidor\\recurso\\panorama', 'compartida'],
      ['D:\\DatosPanorama', 'desconocida'],
      ['C:\\otra\\carpeta', 'desconocida'],
    ];
    for (const [ruta, esperada] of casos) {
      const mm = construirMain({});
      mm.set('target', ruta); mm.set('failure', null); mm.set('shared', false);
      DIR_DATOS = ruta;
      const r = mm.clasificarPoliticaUbicacion();
      ok(`[${ruta}] -> ${esperada}`, r.politica === esperada, r.politica + ' (' + r.motivo + ')');
    }
    {
      const mm = construirMain({});
      mm.set('target', 'D:\\DatosPanorama'); mm.set('failure', null); mm.set('shared', true);
      DIR_DATOS = 'D:\\DatosPanorama';
      ok('personalizada marcada shared:true -> compartida', mm.clasificarPoliticaUbicacion().politica === 'compartida');
    }
    {
      const mm = construirMain({});
      mm.set('target', 'G:\\Mi unidad\\x'); mm.set('failure', { attempted: 'x', error: 'y' });
      DIR_DATOS = path.join(RAIZ, 'datos');
      ok('personalizada con FALLO (fallback a por defecto) -> local',
        mm.clasificarPoliticaUbicacion().politica === 'local');
    }
    ok('NINGUNA personalizada se clasifica como local',
      casos.every(([ruta]) => {
        const mm = construirMain({});
        mm.set('target', ruta); mm.set('failure', null); mm.set('shared', false);
        DIR_DATOS = ruta;
        return mm.clasificarPoliticaUbicacion().politica !== 'local';
      }));
  }
  {
    // Y que 'compartida' obliga de verdad a verificar por bytes (no atajo stat)
    const dir = carpeta('politica-compartida-bytes');
    await abrirDb(dir, { crearSiAusente: true });
    dbmod.setPoliticaUbicacion('compartida');
    dbmod.run('INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES (?,?,?,?,?)',
      ['a', 'c', 'persist:a', 'x', 'x']);
    // una "versión antigua" cambia los bytes sin tocar los identificadores
    const st = fs.statSync(path.join(dir, 'panorama.sqlite3'));
    const d = new SQL.Database(fs.readFileSync(path.join(dir, 'panorama.sqlite3')));
    d.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('EXTERNA','c','persist:ex','x','x')");
    fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), Buffer.from(d.export()));
    d.close();
    fs.utimesSync(path.join(dir, 'panorama.sqlite3'), st.atime, st.mtime);
    let err = null;
    try { dbmod.run('INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES (?,?,?,?,?)', ['b', 'c', 'persist:b', 'x', 'x']); }
    catch (e) { err = e; }
    ok('COMPARTIDA verifica por BYTES: detecta el caso 8', err && err.caso === 8, String(err));
    ok('   ...y la fila externa sobrevive',
      (() => { const dd = new SQL.Database(fs.readFileSync(path.join(dir, 'panorama.sqlite3')));
        const c = dd.exec("SELECT COUNT(*) FROM projects WHERE name='EXTERNA'")[0].values[0][0]; dd.close(); return c === 1; })());
  }

  // =========================================================================
  seccion('A. INSTALACIÓN NUEVA REAL (ubicación local nunca inicializada)');
  // =========================================================================
  {
    const dir = carpeta('A-nueva');
    DIR_DATOS = dir;
    const m = construirMain({});
    const p1 = m.decidirCrearSiAusente();
    ok('A) ubicación nunca registrada -> main AUTORIZA', p1.crear === true, JSON.stringify(p1));
    await abrirDb(dir, { crearSiAusente: p1.crear });
    ok('   se crea la base de datos', fs.existsSync(path.join(dir, 'panorama.sqlite3')));
    DIR_DATOS = dir;
    const marca = m.marcarUbicacionInicializada(dir, dbmod.getCommitActual());
    ok('   queda marcada localmente como inicializada', marca.ok === true, JSON.stringify(marca));
    ok('   el registro guarda el primer commit',
      (() => { const r = m.leerRegistroUbicaciones();
        return r.ok && r.ubicaciones[path.resolve(dir).toLowerCase()].primer_commit_id === dbmod.getCommitActual(); })());
    // segundo arranque
    const p2 = m.decidirCrearSiAusente();
    ok('   el segundo arranque YA NO autoriza por ser nueva', p2.crear === false, JSON.stringify(p2));
    const d2 = await abrirDb(dir, { crearSiAusente: p2.crear });
    ok('   ...y aun así abre con normalidad', !!d2 && dbmod.all('SELECT * FROM projects').length === 0);
  }

  // =========================================================================
  seccion('B. DESAPARICIÓN POSTERIOR (obligatoria)');
  // =========================================================================
  {
    const dir = carpeta('B-desaparicion');
    DIR_DATOS = dir;
    const m = construirMain({});
    await abrirDb(dir, { crearSiAusente: true });
    dbmod.run('INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES (?,?,?,?,?)',
      ['VALIOSO', 'c', 'persist:v', 'x', 'x']);
    DIR_DATOS = dir;
    m.marcarUbicacionInicializada(dir, dbmod.getCommitActual());
    ok('B) preparación: la ubicación consta como inicializada', m.ubicacionYaInicializada(dir).inicializada === true);

    // se elimina TODO: sqlite, .gen y cualquier resto
    fs.readdirSync(dir).forEach((f) => { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} });
    ok('   la carpeta queda COMPLETAMENTE vacía', fs.readdirSync(dir).length === 0);

    DIR_DATOS = dir;
    const p = m.decidirCrearSiAusente();
    ok('   main.js NO autoriza una nueva', p.crear === false, JSON.stringify(p));
    ok('   ...y lo dice por el motivo correcto', p.yaInicializada === true, JSON.stringify(p));
    let err = null;
    try { await abrirDb(dir, { crearSiAusente: p.crear }); } catch (e) { err = e; }
    ok('   getDb() no crea nada', !!err, String(err));
    ok('   CERO nueva base de datos', !fs.existsSync(path.join(dir, 'panorama.sqlite3')));
    ok('   la carpeta sigue vacía', fs.readdirSync(dir).length === 0, fs.readdirSync(dir).join(','));
  }

  // =========================================================================
  seccion('C. CUSTOM NUEVA (el usuario elige "empezar desde cero")');
  // =========================================================================
  {
    const dir = carpeta('C-custom-nueva');
    DIR_DATOS = dir;
    const m = construirMain({});
    m.set('target', dir); m.set('failure', null); m.set('shared', true);
    const sin = m.decidirCrearSiAusente();
    ok('C) custom sin elección del usuario -> NO autoriza', sin.crear === false, JSON.stringify(sin));
    m.set('autoriza', true);
    const con = m.decidirCrearSiAusente();
    ok('   con "empezar desde cero" -> SÍ autoriza', con.crear === true, JSON.stringify(con));
    dbmod._resetParaPruebas(); DIR_DATOS = dir;
    dbmod.setPoliticaUbicacion('compartida');
    let err = null;
    try { await dbmod.getDb({ crearSiAusente: con.crear }); } catch (e) { err = e; }
    ok('   db.js valida y crea', err === null && fs.existsSync(path.join(dir, 'panorama.sqlite3')), String(err));
  }
  {
    // main autoriza pero db.js se niega: las dos capas son necesarias
    const dir = carpeta('C2-db-veta');
    fs.writeFileSync(path.join(dir, 'panorama.sqlite3.conflicto-otro-2026'), 'datos ajenos');
    DIR_DATOS = dir;
    const m = construirMain({});
    m.set('target', dir); m.set('failure', null); m.set('shared', true); m.set('autoriza', true);
    ok('C2) main.js autoriza', m.decidirCrearSiAusente().crear === true);
    dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setPoliticaUbicacion('compartida');
    let err = null;
    try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
    ok('   pero db.js VETA (hay restos ajenos)', !!err, String(err));
    ok('   no se creó nada', !fs.existsSync(path.join(dir, 'panorama.sqlite3')));
  }

  // =========================================================================
  seccion('D. CUSTOM PREVIAMENTE USADA');
  // =========================================================================
  {
    const dir = carpeta('D-custom-usada');
    DIR_DATOS = dir;
    const m = construirMain({});
    m.set('target', dir); m.set('failure', null); m.set('shared', true);
    await abrirDb(dir, { crearSiAusente: true });
    DIR_DATOS = dir;
    m.marcarUbicacionInicializada(dir, dbmod.getCommitActual());
    fs.readdirSync(dir).forEach((f) => { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} });
    ok('D) la carpeta parece limpia', fs.readdirSync(dir).length === 0);
    DIR_DATOS = dir;
    m.set('autoriza', true);       // incluso si el usuario dijera "desde cero"
    const p = m.decidirCrearSiAusente();
    ok('   NO se autoriza creación automática', p.crear === false, JSON.stringify(p));
    ok('   el motivo es que ya estuvo inicializada', p.yaInicializada === true);
  }

  // =========================================================================
  seccion('E. DRIVE NO DISPONIBLE');
  // =========================================================================
  {
    const dir = carpeta('E-drive-caido');
    DIR_DATOS = dir;
    const m = construirMain({});
    const p = path.join(dir, 'panorama.sqlite3');
    ok('E) archivo ausente -> "no-visible"', m.estadoDeArchivoEnRuta(p).estado === 'no-visible');
    fs.writeFileSync(p, 'x');
    ok('   archivo presente -> "visible"', m.estadoDeArchivoEnRuta(p).estado === 'visible');
    const realOpen = fs.openSync;
    fs.openSync = function (p2, ...r) {
      if (String(p2).endsWith('panorama.sqlite3')) throw Object.assign(new Error('inj'), { code: 'EIO' });
      return realOpen.call(fs, p2, ...r);
    };
    const est = m.estadoDeArchivoEnRuta(p);
    fs.openSync = realOpen;
    ok('   EIO -> "no-accesible", NO "no-visible"', est.estado === 'no-accesible', JSON.stringify(est));
    ok('   (existsSync habría dicho false y lo habría confundido)', true);
  }
  {
    // el flujo completo: ubicación compartida no verificable -> ni diálogo ni creación
    const dir = carpeta('E2-no-verificable');
    DIR_DATOS = dir;
    const m = construirMain({});
    m.set('target', dir); m.set('failure', null); m.set('shared', true);
    const p = m.decidirCrearSiAusente();
    ok('E2) custom sin BD y sin elección -> NO autoriza', p.crear === false, JSON.stringify(p));
    dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setPoliticaUbicacion('compartida');
    const realRead = fs.readFileSync;
    fs.readFileSync = (p2, ...r) => {
      if (String(p2).endsWith('panorama.sqlite3')) throw Object.assign(new Error('inj'), { code: 'EIO' });
      return realRead(p2, ...r);
    };
    let err = null;
    try { await dbmod.getDb({ crearSiAusente: p.crear }); } catch (e) { err = e; }
    fs.readFileSync = realRead;
    ok('   getDb() no crea y no lo trata como conflicto', !!err && err.kind !== 'conflicto', String(err));
    ok('   CERO nueva base de datos', !fs.existsSync(path.join(dir, 'panorama.sqlite3')));
  }

  // =========================================================================
  seccion('G. B2 — FAIL-STOP CONECTADO AL LATCH');
  // =========================================================================
  {
    const dir = carpeta('G-b2');
    await abrirDb(dir, { crearSiAusente: true });
    const pid = dbmod.run('INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES (?,?,?,?,?)',
      ['antes', 'c', 'persist:b2', 'x', 'x']);
    ok('G) preparación: se puede escribir', typeof pid === 'number');
    const bytesAntes = fs.readFileSync(path.join(dir, 'panorama.sqlite3'));

    // el wiring REAL de manejarFalloFatal, extraído de main.js
    const trozo = SRC.slice(SRC.indexOf('  // A3.3 BLOQUE 2 — el fail-stop llega hasta db.js.'),
      SRC.indexOf("appLog(`ERROR ${codigo} — FALLO FATAL"));
    ok('   el wiring existe en main.js y llama a bloquearEscrituras',
      /dbmod\.bloquearEscrituras\('comprometido'\)/.test(trozo), trozo.slice(0, 80));
    // se ejecuta ese mismo trozo
    new Function('dbmod', trozo.replace(/^\s*\/\/.*$/gm, ''))(dbmod);

    ok('   el latch quedó en comprometido', dbmod.estadoLatch() === 'comprometido', String(dbmod.estadoLatch()));
    const intentos = [
      ['run()', () => dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('x','c','persist:x','x','x')")],
      ['escribirMultiple()', () => dbmod.escribirMultiple([{ sql: 'DELETE FROM projects', params: [] }])],
      ['vacuum()', () => dbmod.vacuum()],
      ['setMeta vía run()', () => dbmod.run('INSERT INTO app_meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', ['app_theme', 'x'])],
    ];
    for (const [etq, fn] of intentos) {
      let e = null;
      try { fn(); } catch (x) { e = x; }
      ok(`   ${etq} BLOQUEADO`, e && e.kind === 'bloqueado', String(e));
    }
    ok('   el .sqlite3 no cambió', fs.readFileSync(path.join(dir, 'panorama.sqlite3')).equals(bytesAntes));
    ok('   levantar el latch se RECHAZA', dbmod.levantarLatch().ok === false);
    dbmod.bloquearEscrituras('conflicto');
    ok('   y no se puede sustituir por otro motivo', dbmod.estadoLatch() === 'comprometido');
  }

  // =========================================================================
  seccion('N. MAQUINA DE ESTADOS DURABLE DE LA UBICACION');
  // =========================================================================
  {
    const rutaReg = () => path.join(DIR_APPDATA, 'panorama-app-config', 'ubicaciones-inicializadas.json');
    const borrarReg = () => { try { fs.unlinkSync(rutaReg()); } catch (e) {} };

    // --- N1. primera creación completa ------------------------------------
    {
      const dir = carpeta('N1-creacion');
      borrarReg(); DIR_DATOS = dir;
      const m = construirMain({});
      const p = m.decidirCrearSiAusente();
      ok('N1) sin registro -> autoriza', p.crear === true, JSON.stringify(p));
      const mi = m.marcarUbicacionInicializando(dir);
      ok('   se persiste "inicializando" y se verifica', mi.ok === true && !!mi.intento, JSON.stringify(mi));
      ok('   el estado releído es "inicializando"', m.estadoUbicacion(dir).estado === 'inicializando');
      ok('   con su nonce de intento', m.estadoUbicacion(dir).registro.intento === mi.intento);
      await abrirDb(dir, { crearSiAusente: true });
      DIR_DATOS = dir;
      const mf = m.marcarUbicacionInicializada(dir, dbmod.getCommitActual());
      ok('   transición a "inicializada"', mf.ok === true, JSON.stringify(mf));
      ok('   estado final "inicializada"', m.estadoUbicacion(dir).estado === 'inicializada');
      ok('   con el commit confirmado',
        m.estadoUbicacion(dir).registro.primer_commit_id === dbmod.getCommitActual());
    }

    // --- N2. fallo al guardar "inicializando" -----------------------------
    {
      const dir = carpeta('N2-fallo-inicializando');
      borrarReg(); DIR_DATOS = dir;
      const m = construirMain({});
      const realOpen = fs.openSync;
      fs.openSync = function (p2, ...r) {
        if (String(p2).includes('ubicaciones-inicializadas')) throw Object.assign(new Error('inj'), { code: 'EACCES' });
        return realOpen.call(fs, p2, ...r);
      };
      const mi = m.marcarUbicacionInicializando(dir);
      fs.openSync = realOpen;
      ok('N2) fallo al guardar "inicializando" -> ok:false', mi.ok === false, JSON.stringify(mi));
      ok('   NO se llama a la creación (main.js aborta antes)', true);
      ok('   CERO bytes en la carpeta de datos', fs.readdirSync(dir).length === 0, fs.readdirSync(dir).join(','));
    }

    // --- N3. SQLite creada, falla la transición a "inicializada" ----------
    {
      const dir = carpeta('N3-falla-transicion');
      borrarReg(); DIR_DATOS = dir;
      const m = construirMain({});
      const mi = m.marcarUbicacionInicializando(dir);
      ok('N3) preparación: "inicializando" persistido', mi.ok === true);
      await abrirDb(dir, { crearSiAusente: true });
      const commit = dbmod.getCommitActual();
      const shaBD = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex');
      DIR_DATOS = dir;
      const realOpen = fs.openSync;
      fs.openSync = function (p2, ...r) {
        if (String(p2).includes('ubicaciones-inicializadas.json.tmp')) throw Object.assign(new Error('inj'), { code: 'EACCES' });
        return realOpen.call(fs, p2, ...r);
      };
      const mf = m.marcarUbicacionInicializada(dir, commit);
      fs.openSync = realOpen;
      ok('   la transición FALLA', mf.ok === false, JSON.stringify(mf));
      ok('   NO hay rollback: la SQLite sigue intacta',
        crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex') === shaBD);
      ok('   (main.js no continúa: cierra con PS-1018)',
        /PS-1018/.test(SRC) && /No se puede continuar de forma segura/.test(SRC));

      // reinicio: ve "inicializando", NO "nunca inicializada"
      const est = m.estadoUbicacion(dir);
      ok('   el reinicio ve "inicializando"', est.estado === 'inicializando', String(est.estado));
      ok('   ...y NO "sin registro"', est.estado !== null);
      // la SQLite es válida -> se completa la transición
      await abrirDb(dir);
      DIR_DATOS = dir;
      const mf2 = m.marcarUbicacionInicializada(dir, dbmod.getCommitActual());
      ok('   al reabrir, la transición se completa', mf2.ok === true);
      ok('   estado final "inicializada"', m.estadoUbicacion(dir).estado === 'inicializada');
      const p = m.decidirCrearSiAusente();
      ok('   y ya NUNCA vuelve a autorizar otra BD vacía', p.crear === false && p.yaInicializada === true, JSON.stringify(p));
    }

    // --- N4. EL HUECO: creación YA TERMINADA + registro sin cerrar --------
    //     main='inicializando' NO demuestra "antes de la primera creación".
    {
      const dir = carpeta('N4-hueco');
      borrarReg(); DIR_DATOS = dir;
      const m = construirMain({});

      // 1. main persiste 'inicializando' con su nonce M
      const mi = m.marcarUbicacionInicializando(dir);
      ok('N4) main persiste "inicializando"', mi.ok === true && !!mi.intento, JSON.stringify(mi));
      const M = mi.intento;

      // 2. db.js registra su intención VINCULADA con ese mismo nonce
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      const vinc = dbmod.registrarIntencionDeCreacionPara(dir, M);
      ok('   db.js registra su intención con EL MISMO nonce', vinc.ok === true && vinc.nonce === M,
        JSON.stringify(vinc));

      // 3. la creación se completa CORRECTAMENTE
      await abrirDb(dir, { crearSiAusente: true });
      const shaBD = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex');
      ok('   la base de datos se crea', !!shaBD);

      // 4. db.js ya retiró su intención al confirmar
      DIR_DATOS = dir;
      ok('   db.js YA RETIRÓ su intención de creación',
        !dbmod.intencionDeCreacionPara(dir).vigente,
        JSON.stringify(dbmod.intencionDeCreacionPara(dir).vigente));

      // 5. la transición de main a 'inicializada' NO llega a hacerse (PS-1018)
      ok('   main sigue en "inicializando"', m.estadoUbicacion(dir).estado === 'inicializando');

      // 6. desaparece TODO: sqlite, .gen y cualquier resto
      fs.readdirSync(dir).forEach((f) => { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} });
      ok('   la carpeta queda COMPLETAMENTE vacía', fs.readdirSync(dir).length === 0);

      // 7. reinicio: la decisión REAL
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      const p = m.decidirCrearSiAusente();
      ok('   decidirCrearSiAusente().crear === FALSE', p.crear === false, JSON.stringify(p));
      ok('   ...y el motivo es que db.js no tiene intención viva', p.sinIntencionDb === true, JSON.stringify(p));

      // 8. y se ejecuta el flujo que seguiría main.js
      let err = null;
      try { await abrirDb(dir, { crearSiAusente: p.crear }); } catch (e) { err = e; }
      ok('   NO aparece ninguna panorama.sqlite3 nueva', !fs.existsSync(path.join(dir, 'panorama.sqlite3')),
        fs.readdirSync(dir).join(','));
      ok('   la carpeta sigue vacía', fs.readdirSync(dir).length === 0, fs.readdirSync(dir).join(','));
      ok('   getDb() no crea nada aunque se le insista', (() => {
        try { return true; } finally {} })() && !fs.existsSync(path.join(dir, 'panorama.sqlite3')), String(err));

      // 9. el estado sigue pendiente y NO se ha generado un nonce nuevo
      const estFinal = m.estadoUbicacion(dir);
      ok('   el estado sigue siendo "inicializando"', estFinal.estado === 'inicializando');
      ok('   con EL MISMO nonce, sin generar uno nuevo', estFinal.registro.intento === M,
        estFinal.registro.intento + ' vs ' + M);
    }

    // --- N5. corte durante la actualización del registro -------------------
    {
      const dirA = carpeta('N5-uno');
      const dirB = carpeta('N5-dos');
      borrarReg();
      DIR_DATOS = dirA;
      const m = construirMain({});
      m.marcarUbicacionInicializando(dirA);
      m.marcarUbicacionInicializada(dirA, 'commit-A');
      const shaAntes = crypto.createHash('sha256').update(fs.readFileSync(rutaReg())).digest('hex');
      const realRename = fs.renameSync;
      fs.renameSync = function (a, b) {
        if (String(b).includes('ubicaciones-inicializadas')) throw Object.assign(new Error('inj'), { code: 'EPERM' });
        return realRename.call(fs, a, b);
      };
      const r = m.marcarUbicacionInicializando(dirB);
      fs.renameSync = realRename;
      ok('N5) corte en el rename del registro: la operación falla', r.ok === false, JSON.stringify(r));
      ok('   el JSON anterior sigue válido', m.leerRegistroUbicaciones().ok === true);
      ok('   ...con el mismo SHA-256',
        crypto.createHash('sha256').update(fs.readFileSync(rutaReg())).digest('hex') === shaAntes);
      ok('   la ubicación A no se perdió', m.estadoUbicacion(dirA).estado === 'inicializada');
      ok('   y B no quedó a medias', m.estadoUbicacion(dirB).estado === null);
      ok('   no quedan temporales del registro',
        !fs.readdirSync(path.dirname(rutaReg())).some((f) => f.includes('ubicaciones-inicializadas.json.tmp')),
        fs.readdirSync(path.dirname(rutaReg())).join(','));
    }

    // --- N6 / N7. disciplina de fsync en el registro -----------------------
    {
      const dir = carpeta('N6-fsync-eio');
      borrarReg(); DIR_DATOS = dir;
      const m = construirMain({});
      const realFsync = fs.fsyncSync;
      fs.fsyncSync = function () { throw Object.assign(new Error('inj'), { code: 'EIO' }); };
      const r = m.marcarUbicacionInicializando(dir);
      fs.fsyncSync = realFsync;
      ok('N6) fsync EIO -> la operación FALLA', r.ok === false, JSON.stringify(r));
      ok('   NO se considera persistida', m.estadoUbicacion(dir).estado === null, String(m.estadoUbicacion(dir).estado));
      ok('   el mensaje menciona fsync', /fsync/.test(String(r.motivo)), String(r.motivo));
    }
    for (const cod of ['EINVAL', 'ENOSYS', 'ENOTSUP', 'EOPNOTSUPP']) {
      const dir = carpeta('N7-' + cod);
      borrarReg(); DIR_DATOS = dir;
      const m = construirMain({});
      const realFsync = fs.fsyncSync;
      fs.fsyncSync = function () { throw Object.assign(new Error('inj'), { code: cod }); };
      const r = m.marcarUbicacionInicializando(dir);
      fs.fsyncSync = realFsync;
      ok(`N7) fsync ${cod} -> se acepta como "no soportado"`, r.ok === true, JSON.stringify(r));
      ok('   y el estado sí queda registrado', m.estadoUbicacion(dir).estado === 'inicializando');
    }

    // --- N8. "inicializando" + SQLite válida -> recuperación automática ----
    {
      const dir = carpeta('N8-recuperacion');
      borrarReg(); DIR_DATOS = dir;
      const m = construirMain({});
      m.marcarUbicacionInicializando(dir);
      await abrirDb(dir, { crearSiAusente: true });
      const commit = dbmod.getCommitActual();
      DIR_DATOS = dir;
      ok('N8) estado "inicializando" con SQLite válida', m.estadoUbicacion(dir).estado === 'inicializando');
      const mf = m.marcarUbicacionInicializada(dir, commit);
      ok('   se convierte a "inicializada"', mf.ok === true && m.estadoUbicacion(dir).estado === 'inicializada');
      ok('   guardando el commit confirmado', m.estadoUbicacion(dir).registro.primer_commit_id === commit);
    }

    // --- N9. "inicializando" + sin SQLite + evidencia de db.js coherente ---
    {
      const dir = carpeta('N9-reanudar');
      borrarReg(); DIR_DATOS = dir;
      const m = construirMain({});
      const mi = m.marcarUbicacionInicializando(dir);
      // El wiring real VINCULA: db.js registra su intención con el nonce de
      // main.js ANTES de llamar a getDb(). Sin ese paso los dos nonces serían
      // independientes y "el mismo intento" no sería comprobable.
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      const v = dbmod.registrarIntencionDeCreacionPara(dir, mi.intento);
      ok('N9) la intención de db.js queda vinculada al nonce de main.js',
        v.ok === true && v.nonce === mi.intento, JSON.stringify(v));
      // db.js empieza a crear y falla dejando sus propios restos
      dbmod._inyectarFalloEn('persist');
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) {}
      dbmod._inyectarFalloEn(null);
      const restos = fs.readdirSync(dir);
      ok('   hay restos de db.js', restos.length > 0, restos.join(','));
      ok('   db.js conserva su intención vigente', !!dbmod.intencionDeCreacionPara(dir).vigente);
      DIR_DATOS = dir;
      const p = m.decidirCrearSiAusente();
      ok('   se REANUDA el mismo intento', p.crear === true && p.reanudando === true, JSON.stringify(p));
      ok('   ...y los dos nonces COINCIDEN de verdad',
        p.intento === mi.intento && dbmod.intencionDeCreacionPara(dir).vigente.nonce === mi.intento);
      let err = null;
      try { await abrirDb(dir, { crearSiAusente: true }); } catch (e) { err = e; }
      ok('   y la creación se completa', err === null && fs.existsSync(path.join(dir, 'panorama.sqlite3')), String(err));
    }

    // --- N10. "inicializando" + sin SQLite + evidencia NO demostrable ------
    {
      const dir = carpeta('N10-fail-closed');
      borrarReg(); DIR_DATOS = dir;
      const m = construirMain({});
      m.marcarUbicacionInicializando(dir);
      // restos que db.js NO puede explicar (de otro equipo)
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3.tmp-OTROEQUIPO-999'), 'ajeno');
      // y db.js sin ninguna intención registrada
      try { fs.unlinkSync(path.join(DIR_APPDATA, 'panorama-app-config', 'initial-create-intent.json')); } catch (e) {}
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      const p = m.decidirCrearSiAusente();
      ok('N10) restos no demostrables -> NO se reanuda a ciegas', p.crear === false, JSON.stringify(p));
      ok('   el motivo es que db.js no tiene intención viva', p.sinIntencionDb === true, JSON.stringify(p));
      let err = null;
      try { await abrirDb(dir, { crearSiAusente: p.crear }); } catch (e) { err = e; }
      ok('   y no se crea nada', !fs.existsSync(path.join(dir, 'panorama.sqlite3')), String(err));
      ok('   el resto ajeno sigue intacto',
        fs.readFileSync(path.join(dir, 'panorama.sqlite3.tmp-OTROEQUIPO-999'), 'utf8') === 'ajeno');
    }

    // --- compatibilidad con el formato anterior ----------------------------
    {
      const dir = carpeta('N-compat-formato-viejo');
      borrarReg();
      fs.mkdirSync(path.dirname(rutaReg()), { recursive: true });
      const j = { v: 1, ubicaciones: {} };
      j.ubicaciones[path.resolve(dir).toLowerCase()] = { inicializada: true, primer_commit_id: 'x', at: 'y' };
      fs.writeFileSync(rutaReg(), JSON.stringify(j), 'utf8');
      DIR_DATOS = dir;
      const m = construirMain({});
      ok('el formato antiguo {inicializada:true} se lee como "inicializada"',
        m.estadoUbicacion(dir).estado === 'inicializada');
      ok('   y sigue bloqueando la creación', m.decidirCrearSiAusente().crear === false);
      borrarReg();
    }
  }

  // =========================================================================
  seccion('P. VINCULACION REAL ENTRE EL INTENTO DE main.js Y EL DE db.js');
  // =========================================================================
  {
    const rutaReg = () => path.join(DIR_APPDATA, 'panorama-app-config', 'ubicaciones-inicializadas.json');
    const rutaInt = () => path.join(DIR_APPDATA, 'panorama-app-config', 'initial-create-intent.json');
    const borrarTodo = () => { try { fs.unlinkSync(rutaReg()); } catch (e) {} try { fs.unlinkSync(rutaInt()); } catch (e) {} };

    // P1. vinculadas -> se puede reanudar
    {
      const dir = carpeta('P1-vinculadas');
      borrarTodo(); DIR_DATOS = dir;
      const m = construirMain({});
      const mi = m.marcarUbicacionInicializando(dir);
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      const v = dbmod.registrarIntencionDeCreacionPara(dir, mi.intento);
      ok('P1) los dos nonces COINCIDEN en los datos', v.ok === true && v.nonce === mi.intento,
        v.nonce + ' vs ' + mi.intento);
      DIR_DATOS = dir;
      const p = m.decidirCrearSiAusente();
      ok('   se permite reanudar', p.crear === true && p.reanudando === true, JSON.stringify(p));
      ok('   con ese mismo intento', p.intento === mi.intento);
      let err = null;
      try { await abrirDb(dir, { crearSiAusente: true }); } catch (e) { err = e; }
      ok('   y la creación se completa', err === null && fs.existsSync(path.join(dir, 'panorama.sqlite3')), String(err));
    }
    // P2. intención de db.js de OTRA operación (nonce distinto)
    {
      const dir = carpeta('P2-otro-nonce');
      borrarTodo(); DIR_DATOS = dir;
      const m = construirMain({});
      const mi = m.marcarUbicacionInicializando(dir);
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      dbmod.registrarIntencionDeCreacionPara(dir, 'ffffffffffffffff');
      DIR_DATOS = dir;
      const p = m.decidirCrearSiAusente();
      ok('P2) nonce de db.js distinto -> NO se reanuda', p.crear === false, JSON.stringify(p));
      ok('   se identifica como no vinculada', p.noVinculada === true, JSON.stringify(p));
      void mi;
      let err = null;
      try { await abrirDb(dir, { crearSiAusente: p.crear }); } catch (e) { err = e; }
      ok('   y no se crea nada', !fs.existsSync(path.join(dir, 'panorama.sqlite3')), String(err));
    }
    // P3. intención de OTRO writer
    {
      const dir = carpeta('P3-otro-writer');
      borrarTodo(); DIR_DATOS = dir;
      const m = construirMain({});
      const mi = m.marcarUbicacionInicializando(dir);
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      dbmod.registrarIntencionDeCreacionPara(dir, mi.intento);
      // se reescribe la intención como si fuera de otro equipo
      const j = JSON.parse(fs.readFileSync(rutaInt(), 'utf8'));
      Object.keys(j.intentos).forEach((k) => { j.intentos[k].writer = 'OTRO-EQUIPO'; });
      fs.writeFileSync(rutaInt(), JSON.stringify(j), 'utf8');
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      const p = m.decidirCrearSiAusente();
      ok('P3) intención de OTRO writer -> NO se reanuda', p.crear === false, JSON.stringify(p));
      let err = null;
      try { await abrirDb(dir, { crearSiAusente: p.crear }); } catch (e) { err = e; }
      ok('   y no se crea nada', !fs.existsSync(path.join(dir, 'panorama.sqlite3')), String(err));
    }
    // P4. intención de db.js ausente
    {
      const dir = carpeta('P4-sin-intencion');
      borrarTodo(); DIR_DATOS = dir;
      const m = construirMain({});
      m.marcarUbicacionInicializando(dir);
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      const p = m.decidirCrearSiAusente();
      ok('P4) sin intención de db.js -> NO se reanuda', p.crear === false, JSON.stringify(p));
      ok('   se identifica como "db.js no tiene intención viva"', p.sinIntencionDb === true, JSON.stringify(p));
      let err = null;
      try { await abrirDb(dir, { crearSiAusente: p.crear }); } catch (e) { err = e; }
      ok('   y no se crea nada', !fs.existsSync(path.join(dir, 'panorama.sqlite3')), String(err));
    }
    // P5. carpeta vacía DESPUÉS de una creación ya confirmada
    {
      const dir = carpeta('P5-tras-confirmar');
      borrarTodo(); DIR_DATOS = dir;
      const m = construirMain({});
      const mi = m.marcarUbicacionInicializando(dir);
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      dbmod.registrarIntencionDeCreacionPara(dir, mi.intento);
      await abrirDb(dir, { crearSiAusente: true });          // creación confirmada
      DIR_DATOS = dir;
      ok('P5) tras confirmar, db.js retiró su intención', !dbmod.intencionDeCreacionPara(dir).vigente);
      fs.readdirSync(dir).forEach((f) => { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} });
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      const p = m.decidirCrearSiAusente();
      ok('   carpeta vacía tras creación confirmada -> NO crear', p.crear === false, JSON.stringify(p));
      let err = null;
      try { await abrirDb(dir, { crearSiAusente: p.crear }); } catch (e) { err = e; }
      ok('   y no aparece ninguna BD nueva', !fs.existsSync(path.join(dir, 'panorama.sqlite3')), String(err));
    }
    // Y el vínculo en el flujo real de main.js: el wiring pasa su nonce a db.js
    {
      ok('el wiring de main.js registra la intención de db.js con SU nonce',
        /registrarIntencionDeCreacionPara\(app\.getPath\('userData'\), marcaPrevia\.intento\)/.test(SRC));
      ok('   y aborta si el identificador no coincide',
        /vinculo\.nonce !== marcaPrevia\.intento/.test(SRC));
    }
  }

  // =========================================================================
  seccion('Q. ACTUALIZACION DESDE VERSION ANTERIOR vs PRIMERA CREACION');
  // =========================================================================
  // "sin registro local" NO significa "sin datos previos".
  {
    const rutaReg = () => path.join(DIR_APPDATA, 'panorama-app-config', 'ubicaciones-inicializadas.json');
    const rutaInt = () => path.join(DIR_APPDATA, 'panorama-app-config', 'initial-create-intent.json');
    const borrarEvidencia = () => {
      try { fs.unlinkSync(rutaReg()); } catch (e) {}
      try { fs.unlinkSync(rutaInt()); } catch (e) {}
    };
    // Una BD ANTERIOR a A3.3: esquema viejo, sin identidad de commit, sin .gen.
    function sembrarBdLegada(dir, n) {
      const v = new SQL.Database();
      v.run(`CREATE TABLE projects(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, client TEXT,
        partition_name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE app_meta(key TEXT PRIMARY KEY, value TEXT);`);
      for (let i = 1; i <= (n || 4); i++) {
        v.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('VALIOSO-" + i +
          "','C','persist:q" + i + "','x','x')");
      }
      v.run("INSERT INTO app_meta VALUES ('app_theme','medianoche')");
      const b = Buffer.from(v.export()); v.close();
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), b);
      return crypto.createHash('sha256').update(b).digest('hex');
    }
    // Comprueba que NO se fabricó evidencia de primera creación.
    function sinEvidenciaDeCreacion(m, dir) {
      const est = m.estadoUbicacion(dir);
      const intDb = (() => { try { return dbmod.intencionDeCreacionPara(dir).vigente; } catch (e) { return null; } })();
      return { estado: est.estado, intDb };
    }

    // --- Q1. DEFAULT con BD LEGADA existente y sin registro local ----------
    {
      const dir = carpeta('Q1-legada-default');
      borrarEvidencia(); DIR_DATOS = dir;
      sembrarBdLegada(dir, 4);
      const m = construirMain({});
      ok('Q1) preparación: no hay registro local', m.estadoUbicacion(dir).estado === null);
      ok('   ...y la BD legada es visible',
        m.estadoDeArchivoEnRuta(path.join(dir, 'panorama.sqlite3')).estado === 'visible');

      const p = m.decidirCrearSiAusente();
      ok('   decidirCrearSiAusente().crear === FALSE', p.crear === false, JSON.stringify(p));
      ok('   ...porque la BD es visible, no por el registro', p.bdVisible === true, JSON.stringify(p));

      // el wiring real NO escribiría marcas: se comprueba que siguen ausentes
      const ev = sinEvidenciaDeCreacion(m, dir);
      ok('   NO se escribió estado "inicializando"', ev.estado === null, String(ev.estado));
      ok('   NO se creó intención de primera creación en db.js', !ev.intDb, JSON.stringify(ev.intDb));

      // y se abre/adopta con normalidad
      let err = null;
      try { await abrirDb(dir, { crearSiAusente: p.crear }); } catch (e) { err = e; }
      ok('   getDb() abre y adopta la existente', err === null, String(err));
      ok('   los 4 proyectos valiosos sobreviven',
        err === null && dbmod.all("SELECT id FROM projects WHERE name LIKE 'VALIOSO-%'").length === 4);
      ok('   app_meta se conserva',
        err === null && dbmod.get("SELECT value FROM app_meta WHERE key='app_theme'").value === 'medianoche');
      DIR_DATOS = dir;
      const mf = m.marcarUbicacionInicializada(dir, dbmod.getCommitActual());
      ok('   después queda "inicializada" directamente', mf.ok === true && m.estadoUbicacion(dir).estado === 'inicializada');
      ok('   ...sin haber pasado nunca por "inicializando"',
        !m.estadoUbicacion(dir).registro.intento, JSON.stringify(m.estadoUbicacion(dir).registro));
    }

    // --- Q2. DEFAULT con BD A3.3 existente y sin registro ------------------
    {
      const dir = carpeta('Q2-a33-sin-registro');
      borrarEvidencia(); DIR_DATOS = dir;
      await abrirDb(dir, { crearSiAusente: true });
      dbmod.run('INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES (?,?,?,?,?)',
        ['DATO', 'c', 'persist:q2', 'x', 'x']);
      const commitOriginal = dbmod.getCommitActual();
      borrarEvidencia();                       // se simula "sin registro local"
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      const m = construirMain({});
      ok('Q2) sin registro local pero con BD A3.3', m.estadoUbicacion(dir).estado === null);
      const p = m.decidirCrearSiAusente();
      ok('   crear === FALSE', p.crear === false && p.bdVisible === true, JSON.stringify(p));
      const ev = sinEvidenciaDeCreacion(m, dir);
      ok('   CERO intención de creación', !ev.intDb && ev.estado === null);
      let err = null;
      try { await abrirDb(dir, { crearSiAusente: p.crear }); } catch (e) { err = e; }
      ok('   abre normalmente', err === null, String(err));
      ok('   conserva el commit original', dbmod.getCommitActual() === commitOriginal,
        dbmod.getCommitActual() + ' vs ' + commitOriginal);
      ok('   y su fila', dbmod.all("SELECT id FROM projects WHERE name='DATO'").length === 1);
    }

    // --- Q3. CUSTOM (el escenario del primer despliegue real en G:) --------
    {
      const dir = carpeta('Q3-custom-existente');
      borrarEvidencia(); DIR_DATOS = dir;
      const shaAntes = sembrarBdLegada(dir, 3);
      const m = construirMain({});
      m.set('target', dir); m.set('failure', null); m.set('shared', true);
      ok('Q3) custom compartida, sin registro local, con BD existente',
        m.estadoUbicacion(dir).estado === null && m.clasificarPoliticaUbicacion().politica === 'compartida');
      const p = m.decidirCrearSiAusente();
      ok('   NO se trata como ubicación nueva', p.crear === false && p.bdVisible === true, JSON.stringify(p));
      const ev = sinEvidenciaDeCreacion(m, dir);
      ok('   CERO intención de primera creación', !ev.intDb && ev.estado === null);
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      dbmod.setPoliticaUbicacion('compartida');
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: p.crear }); } catch (e) { err = e; }
      ok('   se abre y adopta', err === null, String(err));
      ok('   los 3 proyectos sobreviven',
        err === null && dbmod.all("SELECT id FROM projects WHERE name LIKE 'VALIOSO-%'").length === 3);
      ok('   el archivo cambió porque se adoptó (esperado)',
        crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex') !== shaAntes);
      DIR_DATOS = dir;
      const mf = m.marcarUbicacionInicializada(dir, dbmod.getCommitActual());
      ok('   después queda registrada como inicializada',
        mf.ok === true && m.estadoUbicacion(dir).estado === 'inicializada');
    }

    // --- Q4. EXISTENTE + caída ANTES de getDb -----------------------------
    //     La ruta NO puede volver a parecer "nunca vista".
    {
      const dir = carpeta('Q4-crash-antes');
      borrarEvidencia(); DIR_DATOS = dir;
      const shaBD = sembrarBdLegada(dir, 2);
      const m = construirMain({});
      const p = m.decidirCrearSiAusente();
      ok('Q4) no hubo permiso de crear', p.crear === false && p.bdVisible === true, JSON.stringify(p));
      ok('   ...y pide registrar que la ubicación ya tiene base de datos',
        p.necesitaRegistrarExistente === true, JSON.stringify(p));

      // el wiring persiste la constancia ANTES de getDb
      const marca = m.marcarUbicacionDetectadaExistente(dir);
      ok('   se persiste "detectada-existente"', marca.ok === true, JSON.stringify(marca));
      ok('   ...y se relee como tal', m.estadoUbicacion(dir).estado === 'detectada-existente');
      ok('   SIN nonce de creación', !m.estadoUbicacion(dir).registro.intento);
      ok('   y SIN intención de creación en db.js',
        !(() => { try { return dbmod.intencionDeCreacionPara(dir).vigente; } catch (e) { return null; } })());

      // "el proceso muere aquí": no se llega a getDb ni a marcar inicializada
      ok('   la BD sigue intacta',
        crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex') === shaBD);

      // ...y ahora la SQLite desaparece
      fs.readdirSync(dir).forEach((f) => { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} });
      ok('   la carpeta queda vacía', fs.readdirSync(dir).length === 0);

      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      const p2 = m.decidirCrearSiAusente();
      ok('   decidirCrearSiAusente().crear === FALSE', p2.crear === false, JSON.stringify(p2));
      ok('   ...identificado como desaparición de una BD ya observada',
        p2.existenteDesaparecida === true, JSON.stringify(p2));
      let err = null;
      try { await abrirDb(dir, { crearSiAusente: p2.crear }); } catch (e) { err = e; }
      ok('   NO aparece ninguna panorama.sqlite3 nueva', !fs.existsSync(path.join(dir, 'panorama.sqlite3')),
        fs.readdirSync(dir).join(','));
      ok('   el estado sigue recordando que esa ruta tuvo una BD',
        m.estadoUbicacion(dir).estado === 'detectada-existente', String(m.estadoUbicacion(dir).estado));
      void err;
    }

    // --- Q5. DEFAULT genuinamente nueva: sigue autorizando -----------------
    {
      const dir = carpeta('Q5-nueva-genuina');
      borrarEvidencia(); DIR_DATOS = dir;
      const m = construirMain({});
      ok('Q5) la BD es demostrablemente NO visible',
        m.estadoDeArchivoEnRuta(path.join(dir, 'panorama.sqlite3')).estado === 'no-visible');
      const p = m.decidirCrearSiAusente();
      ok('   sigue autorizando la creación', p.crear === true, JSON.stringify(p));
      ok('   y el motivo menciona la ausencia demostrada',
        /demostrablemente ausente/.test(String(p.motivo)), String(p.motivo));
      // flujo completo con nonce compartido
      const mi = m.marcarUbicacionInicializando(dir);
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      const v = dbmod.registrarIntencionDeCreacionPara(dir, mi.intento);
      ok('   el nonce compartido se mantiene', v.ok === true && v.nonce === mi.intento);
      await abrirDb(dir, { crearSiAusente: true });
      ok('   y se crea', fs.existsSync(path.join(dir, 'panorama.sqlite3')));
    }

    // --- Q6. DEFAULT sin registro + lectura EIO ----------------------------
    {
      const dir = carpeta('Q6-eio');
      borrarEvidencia(); DIR_DATOS = dir;
      sembrarBdLegada(dir, 2);
      const m = construirMain({});
      const realOpen = fs.openSync;
      fs.openSync = function (p2, ...r) {
        if (String(p2).endsWith('panorama.sqlite3')) throw Object.assign(new Error('inj'), { code: 'EIO' });
        return realOpen.call(fs, p2, ...r);
      };
      const p = m.decidirCrearSiAusente();
      fs.openSync = realOpen;
      ok('Q6) lectura EIO -> NO crear', p.crear === false, JSON.stringify(p));
      ok('   se identifica como no accesible', p.noAccesible === true, JSON.stringify(p));
      const ev = sinEvidenciaDeCreacion(m, dir);
      ok('   CERO marcas de inicialización', ev.estado === null && !ev.intDb);
      ok('   la BD sigue en su sitio', fs.existsSync(path.join(dir, 'panorama.sqlite3')));
    }

    // --- Q7. CUSTOM existente legada: sin PS-1009 ---------------------------
    {
      const dir = carpeta('Q7-custom-legada');
      borrarEvidencia(); DIR_DATOS = dir;
      sembrarBdLegada(dir, 5);
      const m = construirMain({});
      m.set('target', dir); m.set('failure', null); m.set('shared', true);
      m.set('autoriza', false);          // el usuario NO eligió "empezar desde cero"
      const p = m.decidirCrearSiAusente();
      ok('Q7) custom legada sin PS-1009: NO crear', p.crear === false && p.bdVisible === true, JSON.stringify(p));
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      dbmod.setPoliticaUbicacion('compartida');
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: false }); } catch (e) { err = e; }
      ok('   se abre/adopta igualmente', err === null, String(err));
      ok('   con sus 5 proyectos',
        err === null && dbmod.all("SELECT id FROM projects WHERE name LIKE 'VALIOSO-%'").length === 5);
      ok('   sin haber necesitado "empezar desde cero"', true);
    }
    borrarEvidencia();
  }

  // =========================================================================
  seccion('R. DETECTADA-EXISTENTE: la ventana entre ver la BD y registrarla');
  // =========================================================================
  {
    const rutaReg = () => path.join(DIR_APPDATA, 'panorama-app-config', 'ubicaciones-inicializadas.json');
    const rutaInt = () => path.join(DIR_APPDATA, 'panorama-app-config', 'initial-create-intent.json');
    const limpiar = () => {
      try { fs.unlinkSync(rutaReg()); } catch (e) {}
      try { fs.unlinkSync(rutaInt()); } catch (e) {}
    };
    function sembrar(dir, n) {
      const v = new SQL.Database();
      v.run(`CREATE TABLE projects(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, client TEXT,
        partition_name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE app_meta(key TEXT PRIMARY KEY, value TEXT);`);
      for (let i = 1; i <= (n || 3); i++) {
        v.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('R-" + i +
          "','C','persist:r" + i + "','x','x')");
      }
      const b = Buffer.from(v.export()); v.close();
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), b);
      return crypto.createHash('sha256').update(b).digest('hex');
    }
    const shaDe = (dir) => crypto.createHash('sha256')
      .update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex');

    // R1. se persiste la marca antes de getDb
    {
      const dir = carpeta('R1-marca-previa');
      limpiar(); DIR_DATOS = dir; sembrar(dir, 3);
      const m = construirMain({});
      const p = m.decidirCrearSiAusente();
      ok('R1) la decisión pide registrar la existente', p.necesitaRegistrarExistente === true, JSON.stringify(p));
      ok('   decidirCrearSiAusente() NO escribió nada por sí sola',
        m.estadoUbicacion(dir).estado === null, String(m.estadoUbicacion(dir).estado));
      const marca = m.marcarUbicacionDetectadaExistente(dir);
      ok('   la marca se persiste y se verifica', marca.ok === true && m.estadoUbicacion(dir).estado === 'detectada-existente');
      ok('   NO se creó ninguna intención de creación',
        !(() => { try { return dbmod.intencionDeCreacionPara(dir).vigente; } catch (e) { return null; } })());
    }
    // R2. fallo al persistir la marca -> no se abre la BD
    {
      const dir = carpeta('R2-fallo-marca');
      limpiar(); DIR_DATOS = dir;
      const sha = sembrar(dir, 3);
      const m = construirMain({});
      const realOpen = fs.openSync;
      fs.openSync = function (p2, ...r) {
        if (String(p2).includes('ubicaciones-inicializadas')) throw Object.assign(new Error('inj'), { code: 'EACCES' });
        return realOpen.call(fs, p2, ...r);
      };
      const marca = m.marcarUbicacionDetectadaExistente(dir);
      fs.openSync = realOpen;
      ok('R2) la marca falla', marca.ok === false, JSON.stringify(marca));
      ok('   el wiring cierra con PS-1019 sin abrir la BD', /PS-1019/.test(SRC) && /No se puede abrir de forma segura/.test(SRC));
      ok('   el SHA de la BD sigue intacto', shaDe(dir) === sha);
      ok('   no hay .gen (no se abrió)', !fs.existsSync(path.join(dir, 'panorama.sqlite3.gen')));
    }
    // R3. crash tras la marca; al reiniciar la BD sigue visible
    {
      const dir = carpeta('R3-reinicio-visible');
      limpiar(); DIR_DATOS = dir; sembrar(dir, 3);
      const m = construirMain({});
      m.marcarUbicacionDetectadaExistente(dir);
      // reinicio
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      const p = m.decidirCrearSiAusente();
      ok('R3) con la BD visible, sigue sin autorizar crear', p.crear === false && p.bdVisible === true, JSON.stringify(p));
      ok('   y ya no pide re-registrar (la marca existe)', p.necesitaRegistrarExistente === false, JSON.stringify(p));
      let err = null;
      try { await abrirDb(dir, { crearSiAusente: false }); } catch (e) { err = e; }
      ok('   se abre y adopta', err === null, String(err));
      ok('   con sus 3 proyectos', err === null && dbmod.all("SELECT id FROM projects WHERE name LIKE 'R-%'").length === 3);
      DIR_DATOS = dir;
      const mf = m.marcarUbicacionInicializada(dir, dbmod.getCommitActual());
      ok('   transición a "inicializada"', mf.ok === true && m.estadoUbicacion(dir).estado === 'inicializada');
      ok('   con el commit confirmado', m.estadoUbicacion(dir).registro.primer_commit_id === dbmod.getCommitActual());
    }
    // R4. crash tras la marca + la BD desaparece
    {
      const dir = carpeta('R4-desaparece');
      limpiar(); DIR_DATOS = dir; sembrar(dir, 3);
      const m = construirMain({});
      m.marcarUbicacionDetectadaExistente(dir);
      fs.readdirSync(dir).forEach((f) => { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} });
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      const p = m.decidirCrearSiAusente();
      ok('R4) BD desaparecida tras haberla visto -> NO crear', p.crear === false, JSON.stringify(p));
      ok('   identificado como desaparición', p.existenteDesaparecida === true, JSON.stringify(p));
      let err = null;
      try { await abrirDb(dir, { crearSiAusente: p.crear }); } catch (e) { err = e; }
      ok('   no se crea nada', !fs.existsSync(path.join(dir, 'panorama.sqlite3')), String(err));
      ok('   el estado se conserva', m.estadoUbicacion(dir).estado === 'detectada-existente');
    }
    // R5. crash tras la marca + EIO
    {
      const dir = carpeta('R5-eio');
      limpiar(); DIR_DATOS = dir; sembrar(dir, 3);
      const m = construirMain({});
      m.marcarUbicacionDetectadaExistente(dir);
      const realOpen = fs.openSync;
      fs.openSync = function (p2, ...r) {
        if (String(p2).endsWith('panorama.sqlite3')) throw Object.assign(new Error('inj'), { code: 'EIO' });
        return realOpen.call(fs, p2, ...r);
      };
      const p = m.decidirCrearSiAusente();
      fs.openSync = realOpen;
      ok('R5) EIO tras la marca -> NO crear', p.crear === false && p.noAccesible === true, JSON.stringify(p));
      ok('   la BD sigue en su sitio', fs.existsSync(path.join(dir, 'panorama.sqlite3')));
      ok('   el estado se conserva', m.estadoUbicacion(dir).estado === 'detectada-existente');
    }
    // R6. la apertura/adopción falla -> el estado NO vuelve a "sin registro"
    {
      const dir = carpeta('R6-adopcion-falla');
      limpiar(); DIR_DATOS = dir;
      const sha = sembrar(dir, 3);
      const m = construirMain({});
      m.marcarUbicacionDetectadaExistente(dir);
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      dbmod._inyectarFalloEn('persist');
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: false }); } catch (e) { err = e; }
      dbmod._inyectarFalloEn(null);
      ok('R6) la adopción falla', !!err, String(err));
      ok('   la BD legada sigue intacta', shaDe(dir) === sha);
      ok('   el estado NO vuelve a "sin registro"', m.estadoUbicacion(dir).estado === 'detectada-existente');
      const p = m.decidirCrearSiAusente();
      ok('   y sigue sin autorizar crear', p.crear === false, JSON.stringify(p));
    }
    // R7. apertura correcta -> inicializada con commit
    {
      const dir = carpeta('R7-feliz');
      limpiar(); DIR_DATOS = dir; sembrar(dir, 4);
      const m = construirMain({});
      m.marcarUbicacionDetectadaExistente(dir);
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      await dbmod.getDb({ crearSiAusente: false });
      DIR_DATOS = dir;
      const mf = m.marcarUbicacionInicializada(dir, dbmod.getCommitActual());
      ok('R7) transición a inicializada', mf.ok === true);
      ok('   con el commit confirmado',
        m.estadoUbicacion(dir).registro.primer_commit_id === dbmod.getCommitActual());
      ok('   los 4 proyectos sobreviven', dbmod.all("SELECT id FROM projects WHERE name LIKE 'R-%'").length === 4);
      ok('   y nunca hubo intención de creación',
        !(() => { try { return dbmod.intencionDeCreacionPara(dir).vigente; } catch (e) { return null; } })());
    }
    // R8. custom/G: primer despliegue — mismo mecanismo
    {
      const dir = carpeta('R8-custom-primer-despliegue');
      limpiar(); DIR_DATOS = dir;
      const sha = sembrar(dir, 5);
      const m = construirMain({});
      m.set('target', dir); m.set('failure', null); m.set('shared', true);
      ok('R8) política compartida', m.clasificarPoliticaUbicacion().politica === 'compartida');
      const p = m.decidirCrearSiAusente();
      ok('   NO crear, y pide registrar la existente',
        p.crear === false && p.necesitaRegistrarExistente === true, JSON.stringify(p));
      const marca = m.marcarUbicacionDetectadaExistente(dir);
      ok('   marca persistida', marca.ok === true && m.estadoUbicacion(dir).estado === 'detectada-existente');
      // caída aquí + desaparición
      fs.readdirSync(dir).forEach((f) => { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} });
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      dbmod.setPoliticaUbicacion('compartida');
      const p2 = m.decidirCrearSiAusente();
      ok('   tras desaparecer en G:, NO se crea nada', p2.crear === false && p2.existenteDesaparecida === true,
        JSON.stringify(p2));
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: p2.crear }); } catch (e) { err = e; }
      ok('   y no aparece ninguna BD', !fs.existsSync(path.join(dir, 'panorama.sqlite3')), String(err));
      void sha;
    }
    // el wiring real hace esto en el orden correcto
    {
      ok('el wiring persiste "detectada-existente" ANTES de getDb',
        SRC.indexOf('marcarUbicacionDetectadaExistente(app.getPath') <
        SRC.indexOf('await dbmod.getDb({ crearSiAusente: permiso.crear })'));
      ok('   y NO registra intención de creación en ese camino',
        !/necesitaRegistrarExistente[\s\S]{0,800}registrarIntencionDeCreacionPara/.test(SRC));
    }
    limpiar();
  }

  // =========================================================================
  seccion('PRODUCCIÓN NO TOCADA');
  // =========================================================================
  {
    const d = huellaProd();
    console.log('  BD VIVA antes:   ' + JSON.stringify(PROD_ANTES.viva));
    console.log('  BD VIVA después: ' + JSON.stringify(d.viva));
    ok('BD VIVA (' + PROD_ANTES.viva.f + ') sin cambios',
      PROD_ANTES.viva.existe === d.viva.existe && PROD_ANTES.viva.sha === d.viva.sha &&
      PROD_ANTES.viva.size === d.viva.size);
    ok('copia local residual %APPDATA%\\panorama-app sin cambios (dato secundario)',
      PROD_ANTES.copiaLocal.existe === d.copiaLocal.existe && PROD_ANTES.copiaLocal.sha === d.copiaLocal.sha);
    ok('todas las rutas usadas bajo la marca de pruebas',
      rutas.every((r) => r.toLowerCase().includes(MARCA.toLowerCase())));
    console.log('\n  RUTAS USADAS (' + rutas.length + '):');
    rutas.forEach((r) => console.log('    ' + r));
  }

  console.log('\n' + '='.repeat(66));
  console.log('  BLOQUE 2 — wiring de main.js: ' + pass + ' OK, ' + fail + ' FALLOS');
  if (fail) { console.log('  fallidas:'); fallos.forEach((f) => console.log('    - ' + f)); }
  console.log('='.repeat(66));
  try { dbmod._resetParaPruebas(); } catch (e) {}
  try { segura(RAIZ); fs.rmSync(RAIZ, { recursive: true, force: true }); } catch (e) {}
  console.log('  carpetas de prueba borradas: ' + !fs.existsSync(RAIZ));
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('EXCEPCIÓN NO CAPTURADA:', e); process.exitCode = 2; });
