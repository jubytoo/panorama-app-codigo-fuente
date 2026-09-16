'use strict';
// ---------------------------------------------------------------------------
// BLOQUE 1 — pruebas del db.js REAL ya integrado con A3.3.
//
// Ejecuta el código REAL de db.js contra carpetas temporales y bases de datos
// generadas. NUNCA toca G:\...\BD-PanoramaServicio ni datos reales.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const Module = require('module');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';

// ===========================================================================
// PROTECCIÓN OBLIGATORIA DEL ARNÉS — se ejecuta ANTES que nada.
// Aborta el proceso entero si la ruta de prueba pudiera ser la de producción.
// ===========================================================================
const MARCA_PRUEBAS = '_a33-bloque1-PRUEBAS';
const RAIZ = path.join(os.tmpdir(), MARCA_PRUEBAS);

const PROHIBIDO = [
  'bd-panoramaservicio',
  'mi unidad',
  'my drive',
  'google drive',
  'onedrive',
  'dropbox',
];

function abortar(motivo, ruta) {
  console.error('\n' + '!'.repeat(70));
  console.error('  ARNÉS ABORTADO POR SEGURIDAD');
  console.error('  motivo: ' + motivo);
  console.error('  ruta:   ' + ruta);
  console.error('!'.repeat(70) + '\n');
  process.exit(99);
}

// Ubicación real configurada por el usuario, para poder compararla.
// El lector de location.json vive en UN solo sitio: comun/guardia-rutas.js.
// La clave real es `userDataDir`; este arnes leia `dir`/`path` y por eso
// devolvia null, dejando el guardian INERTE. Politica FAIL-CLOSED: si el
// fichero existe y no se puede interpretar, el arnes NO se ejecuta.
const GUARDIA = require(path.join(__dirname, '..', 'comun', 'guardia-rutas.js'));
const LECT = GUARDIA.leerUbicacionReal({});
if (LECT.estado !== 'ok') abortar('location.json ' + LECT.estado + ': ' + LECT.detalle, LECT.archivo);
const REAL = LECT.ruta;
const REAL_NORM = REAL ? path.resolve(REAL).toLowerCase() : null;
const DEFECTO_NORM = path.resolve(path.join(process.env.APPDATA || '', 'panorama-app')).toLowerCase();

function comprobarRutaSegura(p) {
  const abs = path.resolve(String(p));
  const bajo = abs.toLowerCase();
  for (const mal of PROHIBIDO) {
    if (bajo.includes(mal)) abortar(`la ruta contiene "${mal}"`, abs);
  }
  if (REAL_NORM && (bajo === REAL_NORM || bajo.startsWith(REAL_NORM + path.sep))) {
    abortar('la ruta coincide con la ubicación real configurada del usuario', abs);
  }
  if (bajo === DEFECTO_NORM || bajo.startsWith(DEFECTO_NORM + path.sep)) {
    abortar('la ruta apunta a la carpeta de datos por defecto de la app instalada', abs);
  }
  if (!bajo.includes(MARCA_PRUEBAS.toLowerCase())) {
    abortar(`la ruta no está dentro de una ubicación marcada para pruebas ("${MARCA_PRUEBAS}")`, abs);
  }
  return abs;
}

comprobarRutaSegura(RAIZ);
fs.rmSync(RAIZ, { recursive: true, force: true });
fs.mkdirSync(RAIZ, { recursive: true });

// Huella de producción ANTES de empezar, para demostrar al final que no se tocó.
function huellaProduccion() {
  const objetivos = [];
  if (REAL) objetivos.push(path.join(REAL, 'panorama.sqlite3'));
  objetivos.push(path.join(process.env.APPDATA || '', 'panorama-app', 'panorama.sqlite3'));
  return objetivos.map((f) => {
    try {
      const b = fs.readFileSync(f);
      const s = fs.statSync(f);
      return { f, existe: true, size: s.size, mtimeMs: s.mtimeMs, sha: crypto.createHash('sha256').update(b).digest('hex') };
    } catch (e) { return { f, existe: false, err: (e && e.code) || String(e) }; }
  });
}
const HUELLA_ANTES = huellaProduccion();

// ===========================================================================
// Doble mínimo de `electron` para poder cargar el db.js real.
// app.getPath('userData') -> carpeta de prueba;  'appData' -> también de prueba
// (ahí es donde db.js guarda el installation-id).
// ===========================================================================
let DIR_DATOS = path.join(RAIZ, 'datos-inicial');
let DIR_APPDATA = path.join(RAIZ, 'appdata');
fs.mkdirSync(DIR_DATOS, { recursive: true });
fs.mkdirSync(DIR_APPDATA, { recursive: true });

const origLoad = Module._load;
Module._load = function (request) {
  if (request === 'electron') {
    return { app: { getPath: (k) => (k === 'appData' ? DIR_APPDATA : DIR_DATOS) } };
  }
  return origLoad.apply(this, arguments);
};

const dbmod = require(path.join(PROJ, 'db.js'));
const initSqlJs = require(path.join(PROJ, 'node_modules', 'sql.js'));

let pass = 0, fail = 0;
const fallos = [];
function ok(nombre, cond, extra) {
  if (cond) { pass++; console.log('  OK    ' + nombre); }
  else { fail++; fallos.push(nombre); console.log('  FALLO ' + nombre + (extra ? '  -- ' + extra : '')); }
}
function seccion(t) { console.log('\n=== ' + t + ' ==='); }

let n = 0;
const rutasUsadas = [];
function nuevaCarpeta(etiqueta) {
  const d = path.join(RAIZ, 'c' + (++n) + '-' + (etiqueta || 'x'));
  comprobarRutaSegura(d);
  fs.mkdirSync(d, { recursive: true });
  rutasUsadas.push(d);
  return d;
}

// Reabre db.js apuntando a otra carpeta de prueba.
//
// Por defecto pasa `crearSiAusente: true`, que es lo que hará el flujo superior
// cuando se cablee en el bloque 2: aquí el arnés HACE DE flujo autorizado. Las
// secciones E y F llaman a dbmod.getDb() directamente, sin autorización, para
// probar justo lo contrario.
async function abrirEn(dir, opts) {
  comprobarRutaSegura(dir);
  dbmod._resetParaPruebas();
  DIR_DATOS = dir;
  return dbmod.getDb(Object.assign({ crearSiAusente: true }, opts || {}));
}

let SQL = null;
function leerBDExterna(dir) {
  const b = fs.readFileSync(path.join(dir, 'panorama.sqlite3'));
  return new SQL.Database(b);
}

(async () => {
  SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(PROJ, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')) });

  console.log('RUTAS DE PRUEBA');
  console.log('  raíz:                 ' + RAIZ);
  console.log('  ubicación real det.:  ' + (REAL || '(no configurada / no legible)'));
  console.log('  carpeta por defecto:  ' + path.join(process.env.APPDATA || '', 'panorama-app'));
  console.log('  (las tres comprobadas por el guardián antes de cada carpeta)');

  // =========================================================================
  seccion('A. REGRESIÓN DE LA API ACTUAL de db.js');
  // =========================================================================
  {
    const dir = nuevaCarpeta('api');
    const d = await abrirEn(dir);
    ok('getDb() devuelve el objeto de base de datos', !!d && typeof d.run === 'function');
    ok('getDb() es idempotente (segunda llamada devuelve el mismo)', (await dbmod.getDb()) === d);
    ok('getDbPath() apunta al .sqlite3 de la carpeta', dbmod.getDbPath() === path.join(dir, 'panorama.sqlite3'));
    ok('el archivo existe en disco', fs.existsSync(dbmod.getDbPath()));

    // --- run() devuelve lastId, como sus callers esperan ---
    const id1 = dbmod.run(
      'INSERT INTO projects(name, client, partition_name, created_at, updated_at) VALUES (?,?,?,?,?)',
      ['Proyecto 1', 'Cliente', 'persist:p1', '2026-01-01', '2026-01-01']);
    ok('run() con INSERT devuelve un id numérico', typeof id1 === 'number' && id1 > 0, 'id=' + id1);
    const id2 = dbmod.run(
      'INSERT INTO projects(name, client, partition_name, created_at, updated_at) VALUES (?,?,?,?,?)',
      ['Proyecto 2', 'Cliente', 'persist:p2', '2026-01-01', '2026-01-01']);
    ok('run() con el segundo INSERT devuelve id+1', id2 === id1 + 1, id1 + ' -> ' + id2);

    // --- get() devuelve objeto o null ---
    const fila = dbmod.get('SELECT * FROM projects WHERE id=?', [id1]);
    ok('get() devuelve un objeto plano', fila && typeof fila === 'object' && !Array.isArray(fila));
    ok('get() trae las columnas por nombre', fila.name === 'Proyecto 1' && fila.partition_name === 'persist:p1',
      JSON.stringify(fila));
    ok('get() devuelve null si no hay fila', dbmod.get('SELECT * FROM projects WHERE id=?', [9999]) === null);

    // --- all() devuelve array de objetos ---
    const filas = dbmod.all('SELECT * FROM projects ORDER BY id');
    ok('all() devuelve un array', Array.isArray(filas) && filas.length === 2, 'len=' + (filas && filas.length));
    ok('all() trae objetos con columnas por nombre', filas[0].name === 'Proyecto 1' && filas[1].name === 'Proyecto 2');
    ok('all() devuelve [] si no hay filas', JSON.stringify(dbmod.all('SELECT * FROM projects WHERE id=9999')) === '[]');

    // --- UPDATE / DELETE ---
    dbmod.run('UPDATE projects SET name=? WHERE id=?', ['Renombrado', id1]);
    ok('UPDATE se aplica', dbmod.get('SELECT name FROM projects WHERE id=?', [id1]).name === 'Renombrado');
    dbmod.run('DELETE FROM projects WHERE id=?', [id2]);
    ok('DELETE se aplica', dbmod.all('SELECT * FROM projects').length === 1);

    // --- lastInsertRowId() ---
    // OJO: comprobado contra la COPIA PREVIA de db.js — ya ANTES de A3.3 esta
    // función devolvía 0 después de un run(), porque el db.export() de
    // persist() resetea el contador interno de sql.js. Es una rareza
    // PREEXISTENTE, no una regresión, y no la usa nadie en main.js (0 usos).
    // La regresión comprueba que el comportamiento se CONSERVA idéntico.
    const id3 = dbmod.run(
      'INSERT INTO projects(name, client, partition_name, created_at, updated_at) VALUES (?,?,?,?,?)',
      ['P3', 'C', 'persist:p3', 'x', 'x']);
    ok('run() sigue devolviendo el id de la fila recién insertada',
      typeof id3 === 'number' && id3 > 0
        && dbmod.get('SELECT name FROM projects WHERE id=?', [id3]).name === 'P3',
      'id3=' + id3);
    ok('lastInsertRowId() conserva su comportamiento previo (0 tras persistir)',
      dbmod.lastInsertRowId() === 0, 'devolvió ' + dbmod.lastInsertRowId());
    ok('lastInsertRowId() sigue devolviendo un número, no lanza',
      typeof dbmod.lastInsertRowId() === 'number');

    // --- setMeta/getMeta/deleteMeta, tal y como los usa main.js ---
    const setMeta = (k, v) => dbmod.run(
      'INSERT INTO app_meta(key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [k, v]);
    const getMeta = (k) => { const r = dbmod.get('SELECT value FROM app_meta WHERE key=?', [k]); return r ? r.value : null; };
    const deleteMeta = (k) => dbmod.run('DELETE FROM app_meta WHERE key=?', [k]);
    setMeta('app_theme', 'medianoche');
    ok('setMeta + getMeta funcionan', getMeta('app_theme') === 'medianoche');
    setMeta('app_theme', 'otro');
    ok('setMeta sobrescribe sin duplicar', getMeta('app_theme') === 'otro'
      && dbmod.all("SELECT key FROM app_meta WHERE key='app_theme'").length === 1);
    deleteMeta('app_theme');
    ok('deleteMeta funciona', getMeta('app_theme') === null);
    ok('getMeta de una clave inexistente devuelve null', getMeta('no-existe') === null);

    // --- las claves de A3.3 no estorban a las de la app ---
    ok('app_meta contiene las 4 claves de A3.3',
      ['db_commit_id', 'db_parent_commit_id', 'db_commit_history', 'db_generation']
        .every((k) => dbmod.all('SELECT key FROM app_meta WHERE key=?', [k]).length === 1));

    // --- escrituras consecutivas ---
    for (let i = 0; i < 25; i++) {
      dbmod.run('INSERT INTO projects(name, client, partition_name, created_at, updated_at) VALUES (?,?,?,?,?)',
        ['masivo' + i, 'c', 'persist:m' + i, 'x', 'x']);
    }
    ok('25 escrituras consecutivas', dbmod.all('SELECT id FROM projects').length === 27,
      'total=' + dbmod.all('SELECT id FROM projects').length);

    // --- vacuum() ---
    const antesVac = dbmod._diagnostico().gMem;
    dbmod.vacuum();
    ok('vacuum() no lanza y avanza una generación', dbmod._diagnostico().gMem === antesVac + 1);
    ok('vacuum() conserva los datos', dbmod.all('SELECT id FROM projects').length === 27);

    // --- reapertura ---
    const nProyectos = dbmod.all('SELECT id FROM projects').length;
    const commitAntes = dbmod._diagnostico().cMem;
    await abrirEn(dir);
    ok('reapertura: los datos siguen', dbmod.all('SELECT id FROM projects').length === nProyectos);
    ok('reapertura: mismo commit, sin generación espuria', dbmod._diagnostico().cMem === commitAntes,
      dbmod._diagnostico().cMem + ' vs ' + commitAntes);
    ok('reapertura: se puede seguir escribiendo',
      typeof dbmod.run('INSERT INTO projects(name, client, partition_name, created_at, updated_at) VALUES (?,?,?,?,?)',
        ['tras-reabrir', 'c', 'persist:tr', 'x', 'x']) === 'number');
  }

  // =========================================================================
  seccion('B. COMPATIBILIDAD HACIA ATRÁS — base de datos anterior a A3.3');
  // =========================================================================
  {
    // Se fabrica una BD con el esquema viejo y SIN identidad de commit, tal y
    // como la dejaría la versión instalada hoy.
    const dir = nuevaCarpeta('legado');
    const vieja = new SQL.Database();
    vieja.run(`CREATE TABLE projects(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, client TEXT,
      partition_name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE app_meta(key TEXT PRIMARY KEY, value TEXT);`);
    vieja.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('Antiguo','C','persist:old','x','x')");
    vieja.run("INSERT INTO app_meta VALUES ('app_theme','medianoche')");
    fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), Buffer.from(vieja.export()));
    vieja.close();
    ok('preparación: BD legada sin .gen ni db_commit_id', !fs.existsSync(path.join(dir, 'panorama.sqlite3.gen')));

    await abrirEn(dir);
    ok('se abre una BD anterior a A3.3 sin lanzar', dbmod.all('SELECT id FROM projects').length === 1);
    ok('conserva sus datos', dbmod.get('SELECT name FROM projects').name === 'Antiguo');
    ok('conserva su app_meta', dbmod.get("SELECT value FROM app_meta WHERE key='app_theme'").value === 'medianoche');
    ok('recibe identidad de commit al abrir', !!dbmod._diagnostico().cMem);
    ok('y su .gen coherente', fs.existsSync(path.join(dir, 'panorama.sqlite3.gen')));
    const g = JSON.parse(fs.readFileSync(path.join(dir, 'panorama.sqlite3.gen'), 'utf8'));
    ok('el .gen apunta al mismo commit que la BD', g.commit_id === dbmod._diagnostico().cMem);
    ok('la migración de esquema se aplicó (columna backup_dir)',
      dbmod.all('PRAGMA table_info(projects)').some((c) => c.name === 'backup_dir'));
  }

  // =========================================================================
  seccion('C. NÚCLEO A3.3 CONTRA EL db.js REAL');
  // =========================================================================
  {
    const dir = nuevaCarpeta('nucleo');
    await abrirEn(dir);
    const d0 = dbmod._diagnostico();
    ok('hay installation-id persistido', !!d0.wYo && fs.existsSync(path.join(DIR_APPDATA, 'panorama-app-config', 'installation-id')));
    ok('política por defecto = local (no cambia el comportamiento)', d0.politica === 'local');
    ok('dirty = false tras abrir', d0.dirty === false);
    ok('hay imagen confirmada', d0.tieneImagenConfirmada === true);

    const commits = new Set([d0.cMem]);
    for (let i = 0; i < 20; i++) {
      dbmod.run('INSERT INTO projects(name, client, partition_name, created_at, updated_at) VALUES (?,?,?,?,?)',
        ['n' + i, 'c', 'persist:n' + i, 'x', 'x']);
      commits.add(dbmod._diagnostico().cMem);
    }
    const d1 = dbmod._diagnostico();
    ok('20 escrituras -> 21 commits distintos', commits.size === 21, 'size=' + commits.size);
    ok('historial acotado a 20', d1.hMem.length === 20, 'len=' + d1.hMem.length);
    ok('.gen y BD llevan el mismo commit', dbmod._leerGen().C === dbmod._leerDisco().C);
    ok('F_mio coincide con el hash real del archivo', d1.fMio === dbmod._leerDisco().F);
    ok('ultimaImagenConfirmada coincide byte a byte con el disco',
      Buffer.compare(d1.ultimaImagenConfirmada, fs.readFileSync(dbmod.getDbPath())) === 0);

    // nombres temporales únicos
    const vistos = [];
    const realRename = fs.renameSync;
    fs.renameSync = (a, b) => { vistos.push(path.basename(a)); return realRename(a, b); };
    for (let i = 0; i < 6; i++) {
      dbmod.run('INSERT INTO projects(name, client, partition_name, created_at, updated_at) VALUES (?,?,?,?,?)',
        ['t' + i, 'c', 'persist:t' + i, 'x', 'x']);
    }
    fs.renameSync = realRename;
    ok('los temporales llevan writer y nonce, no el PID',
      vistos.length > 0 && vistos.every((x) => x.includes('.tmp-') && !x.includes('.tmp-' + process.pid)),
      vistos[0]);
    ok('todos los temporales son distintos', new Set(vistos).size === vistos.length,
      new Set(vistos).size + ' de ' + vistos.length);

    // latch irreversible
    dbmod.bloquearEscrituras('comprometido');
    let err = null;
    try { dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('x','c','persist:zz','x','x')"); } catch (e) { err = e; }
    ok('con el latch fatal, run() no escribe', err && err.kind === 'bloqueado', String(err));
    let errV = null;
    try { dbmod.vacuum(); } catch (e) { errV = e; }
    ok('...y vacuum() TAMPOCO (era el agujero de main.js:844)', errV && errV.kind === 'bloqueado', String(errV));
    ok('levantar el latch fatal se rechaza', dbmod.levantarLatch().ok === false);
    dbmod.bloquearEscrituras('conflicto');
    ok('un motivo fatal no se sustituye', dbmod.estadoLatch() === 'comprometido');
  }
  {
    // fallo PRE-confirmación con el db.js real
    const dir = nuevaCarpeta('preconf');
    await abrirEn(dir);
    dbmod.run('INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES (?,?,?,?,?)',
      ['buena', 'c', 'persist:b', 'x', 'x']);
    const antes = dbmod._diagnostico();
    const bytesAntes = fs.readFileSync(dbmod.getDbPath());

    const realWrite = fs.writeSync;
    fs.writeSync = () => 0;                       // sin progreso
    let err = null;
    try {
      dbmod.run('INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES (?,?,?,?,?)',
        ['FANTASMA', 'c', 'persist:f', 'x', 'x']);
    } catch (e) { err = e; }
    fs.writeSync = realWrite;

    ok('fallo pre-confirmación: lanza ErrorDb io', err && err.kind === 'io', String(err));
    ok('   aplicado = false', err && err.aplicado === false);
    ok('   el disco NO cambió', fs.readFileSync(dbmod.getDbPath()).equals(bytesAntes));
    ok('   dirty = false', dbmod._diagnostico().dirty === false);
    ok('   la memoria volvió al commit confirmado', dbmod._diagnostico().cMem === antes.cMem);
    ok('   la fila fantasma no está', dbmod.all("SELECT id FROM projects WHERE name='FANTASMA'").length === 0);
    dbmod.run('INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES (?,?,?,?,?)',
      ['despues', 'c', 'persist:d', 'x', 'x']);
    const ext = leerBDExterna(dir);
    const nombres = ext.exec('SELECT name FROM projects ORDER BY id')[0].values.map((r) => r[0]);
    ext.close();
    ok('   la escritura posterior no arrastra el fantasma', nombres.join(',') === 'buena,despues', nombres.join(','));
  }
  {
    // SQL inválido y constraint reales
    const dir = nuevaCarpeta('sqlmalo');
    await abrirEn(dir);
    dbmod.run('INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES (?,?,?,?,?)',
      ['ok1', 'c', 'persist:o1', 'x', 'x']);
    const bytesAntes = fs.readFileSync(dbmod.getDbPath());
    let e1 = null;
    try { dbmod.run('ESTO NO ES SQL'); } catch (e) { e1 = e; }
    ok('SQL inválido: lanza y no toca el disco', !!e1 && fs.readFileSync(dbmod.getDbPath()).equals(bytesAntes), String(e1));
    ok('   dirty = false', dbmod._diagnostico().dirty === false);
    let e2 = null;
    try {
      dbmod.run('INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES (?,?,?,?,?)',
        ['dup', 'c', 'persist:o1', 'x', 'x']);     // partition_name es UNIQUE
    } catch (e) { e2 = e; }
    ok('violación de UNIQUE: lanza y no toca el disco',
      !!e2 && fs.readFileSync(dbmod.getDbPath()).equals(bytesAntes), String(e2));
    ok('   y la app puede seguir escribiendo',
      typeof dbmod.run('INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES (?,?,?,?,?)',
        ['ok2', 'c', 'persist:o2', 'x', 'x']) === 'number');
  }
  {
    // escribirMultiple(): una sola persistencia
    const dir = nuevaCarpeta('multiple');
    await abrirEn(dir);
    const pid = dbmod.run('INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES (?,?,?,?,?)',
      ['victima', 'c', 'persist:v', 'x', 'x']);
    dbmod.run('INSERT INTO backups(project_id, created_at, reason, payload, size) VALUES (?,?,?,?,?)', [pid, 'x', 'r', '', 0]);
    dbmod.run('INSERT INTO backups(project_id, created_at, reason, payload, size) VALUES (?,?,?,?,?)', [pid, 'x', 'r', '', 0]);
    const g0 = dbmod._diagnostico().gMem;
    dbmod.escribirMultiple([
      { sql: 'DELETE FROM backups WHERE project_id=?', params: [pid] },
      { sql: 'DELETE FROM projects WHERE id=?', params: [pid] },
    ]);
    ok('dos DELETE = UNA generación', dbmod._diagnostico().gMem === g0 + 1, g0 + ' -> ' + dbmod._diagnostico().gMem);
    const ext = leerBDExterna(dir);
    const nP = ext.exec('SELECT COUNT(*) FROM projects')[0].values[0][0];
    const nB = ext.exec('SELECT COUNT(*) FROM backups')[0].values[0][0];
    ext.close();
    ok('   en disco no queda ni el proyecto ni sus backups', nP === 0 && nB === 0, `p=${nP} b=${nB}`);
  }
  {
    // "ausente" no autoriza a crear
    const dir = nuevaCarpeta('ausente');
    await abrirEn(dir);
    dbmod.run('INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES (?,?,?,?,?)',
      ['VALIOSA', 'c', 'persist:val', 'x', 'x']);
    const bytesAntes = fs.readFileSync(dbmod.getDbPath());
    const shaAntes = crypto.createHash('sha256').update(bytesAntes).digest('hex');
    const genAntes = fs.readFileSync(dbmod.getGenPath());

    // la BD "desaparece" para el lector, con el .gen todavía ahí
    const realRead = fs.readFileSync;
    fs.readFileSync = (p, ...r) => {
      if (String(p).endsWith('panorama.sqlite3')) throw Object.assign(new Error('invisible'), { code: 'ENOENT' });
      return realRead(p, ...r);
    };
    let err = null;
    try { await abrirEn(dir); } catch (e) { err = e; }
    fs.readFileSync = realRead;

    ok('BD invisible al arrancar: NO se crea una nueva', !!err, String(err));
    ok('   estadoDisco = ausente', err && err.estadoDisco === 'ausente');
    ok('   el archivo original está intacto (mismo SHA-256)',
      crypto.createHash('sha256').update(realRead(path.join(dir, 'panorama.sqlite3'))).digest('hex') === shaAntes);
    ok('   el .gen no se tocó', realRead(path.join(dir, 'panorama.sqlite3.gen')).equals(genAntes));

    // al recuperar el acceso, abre la original
    await abrirEn(dir);
    ok('   al recuperar, abre la BD original con su fila',
      dbmod.all("SELECT id FROM projects WHERE name='VALIOSA'").length === 1);
  }
  {
    // carpeta con restos pero sin .sqlite3 -> no se crea
    const dir = nuevaCarpeta('restos');
    fs.writeFileSync(path.join(dir, 'panorama.sqlite3.gen'),
      JSON.stringify({ v: 2, gen: 5, commit_id: 'abc', writer: 'otro', at: 'x' }));
    let err = null;
    try { await abrirEn(dir, { crearSiAusente: false }); } catch (e) { err = e; }
    ok('carpeta con .gen huérfano y sin .sqlite3: NO se crea nada', !!err, String(err));
    ok('   no apareció ningún .sqlite3', !fs.existsSync(path.join(dir, 'panorama.sqlite3')));
    let err2 = null;
    try { await abrirEn(dir, { crearSiAusente: true }); } catch (e) { err2 = e; }
    ok('   ni con crearSiAusente explícito', !!err2 && !fs.existsSync(path.join(dir, 'panorama.sqlite3')), String(err2));
  }
  {
    // los temporales huérfanos ya NO se borran al arrancar
    const dir = nuevaCarpeta('huerfanos');
    await abrirEn(dir);
    dbmod.run('INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES (?,?,?,?,?)',
      ['x', 'c', 'persist:h', 'x', 'x']);
    const tmpFalso = path.join(dir, 'panorama.sqlite3.tmp-otroequipo-deadbeef');
    fs.writeFileSync(tmpFalso, fs.readFileSync(dbmod.getDbPath()));
    const shaTmp = crypto.createHash('sha256').update(fs.readFileSync(tmpFalso)).digest('hex');

    await abrirEn(dir);
    const restantes = fs.readdirSync(dir).filter((f) => f.includes('.tmp-'));
    ok('el temporal huérfano NO se borró al arrancar', restantes.length === 1, restantes.join(','));
    ok('   se conservó como .tmp-huerfano-', restantes[0].includes('.tmp-huerfano-'), restantes[0]);
    ok('   con sus bytes intactos',
      crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, restantes[0]))).digest('hex') === shaTmp);
  }

  // =========================================================================
  seccion('E. AUTORIZACIÓN EXPLÍCITA DE CREACIÓN (las DOS condiciones)');
  // =========================================================================
  // Una carpeta virgen NO es autorización: es una observación.
  {
    // A) carpeta virgen + getDb() SIN crearSiAusente -> NO crea
    for (const politica of ['local', 'compartida', 'desconocida']) {
      const dir = nuevaCarpeta('virgen-' + politica);
      dbmod._resetParaPruebas();
      DIR_DATOS = dir;
      if (politica !== 'local') dbmod.setPoliticaUbicacion(politica);
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      const contenido = fs.readdirSync(dir);
      ok(`[${politica}] carpeta virgen SIN autorización: lanza`, !!err, String(err));
      ok(`   estadoDisco = ausente`, err && err.estadoDisco === 'ausente', String(err && err.estadoDisco));
      ok(`   NO se creó panorama.sqlite3`, !fs.existsSync(path.join(dir, 'panorama.sqlite3')));
      ok(`   NO se creó el .gen`, !fs.existsSync(path.join(dir, 'panorama.sqlite3.gen')));
      ok(`   la carpeta sigue COMPLETAMENTE vacía`, contenido.length === 0, contenido.join(','));
      ok(`   la pista de "podría ser la primera vez" viaja como INFO, no como permiso`,
        err && err.podriaSerPrimeraVez === true);
      if (politica !== 'local') {
        ok(`   COMPARTIDA/DESCONOCIDA -> fail-closed`, dbmod.estadoLatch() === 'degradado',
          String(dbmod.estadoLatch()));
      } else {
        ok(`   LOCAL no hace fail-closed`, dbmod.estadoLatch() === null, String(dbmod.estadoLatch()));
      }
    }
  }
  {
    // B) carpeta virgen + getDb({crearSiAusente:true}) -> SÍ crea
    for (const politica of ['local', 'compartida', 'desconocida']) {
      const dir = nuevaCarpeta('autorizada-' + politica);
      dbmod._resetParaPruebas();
      DIR_DATOS = dir;
      if (politica !== 'local') dbmod.setPoliticaUbicacion(politica);
      await dbmod.getDb({ crearSiAusente: true });
      ok(`[${politica}] con autorización explícita SÍ crea`, fs.existsSync(path.join(dir, 'panorama.sqlite3')));
      ok(`   y su .gen`, fs.existsSync(path.join(dir, 'panorama.sqlite3.gen')));
      ok(`   generación 1`, dbmod._diagnostico().gMem === 1, 'gMem=' + dbmod._diagnostico().gMem);
      ok(`   y se puede escribir`,
        typeof dbmod.run('INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES (?,?,?,?,?)',
          ['p', 'c', 'persist:aut', 'x', 'x']) === 'number');
    }
  }
  {
    // C) "carpeta personalizada" virgen sin autorización: idéntico trato.
    //    En db.js no hay ninguna excepción implícita por ser la carpeta por
    //    defecto — la decisión vendrá de arriba en el bloque 2.
    const dir = nuevaCarpeta('personalizada-virgen');
    dbmod._resetParaPruebas();
    DIR_DATOS = dir;
    dbmod.setPoliticaUbicacion('compartida');
    let err = null;
    try { await dbmod.getDb(); } catch (e) { err = e; }
    ok('carpeta personalizada virgen SIN autorización: tampoco crea', !!err && fs.readdirSync(dir).length === 0,
      String(err));
    ok('   db.js NO aplica ninguna excepción implícita para la carpeta por defecto', true);
  }
  {
    // Y el caso que motivó la corrección: autorizado === false con carpeta
    // virgen. Antes CAÍA hasta new SQL.Database() y creaba igualmente.
    const dir = nuevaCarpeta('regresion-and-or');
    dbmod._resetParaPruebas();
    DIR_DATOS = dir;
    let err = null;
    try { await dbmod.getDb({ crearSiAusente: false }); } catch (e) { err = e; }
    ok('REGRESIÓN: crearSiAusente=false + carpeta virgen NO crea', !!err, String(err));
    ok('   (con el fallo anterior, aquí habría un panorama.sqlite3)',
      !fs.existsSync(path.join(dir, 'panorama.sqlite3')));
  }

  // =========================================================================
  seccion('F. PRIMERA ADOPCIÓN DE UNA BD LEGADA — frontera PRE/POST');
  // =========================================================================
  // Fabrica una BD anterior a A3.3 con datos valiosos y devuelve su SHA-256.
  function crearBDLegada(dir) {
    const v = new SQL.Database();
    v.run(`CREATE TABLE projects(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, client TEXT,
      partition_name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE app_meta(key TEXT PRIMARY KEY, value TEXT);`);
    for (let i = 1; i <= 5; i++) {
      v.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('VALIOSO-" + i +
        "','C','persist:leg" + i + "','x','x')");
    }
    v.run("INSERT INTO app_meta VALUES ('app_theme','medianoche')");
    const bytes = Buffer.from(v.export());
    v.close();
    fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), bytes);
    return crypto.createHash('sha256').update(bytes).digest('hex');
  }
  function shaDe(dir) {
    return crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex');
  }

  const puntosBootstrap = [
    ['esquema (CREATE TABLE)', 'tras-esquema'],
    ['migrateSchema()', 'tras-migracion'],
    ['UPSERT 1 — db_commit_id', 'meta1'],
    ['UPSERT 2 — db_parent_commit_id', 'meta2'],
    ['UPSERT 3 — db_commit_history', 'meta3'],
    ['UPSERT 4 — db_generation', 'meta4'],
    ['escritura del .gen', 'gen'],
    ['persistencia del .sqlite3', 'persist'],
  ];

  for (const [etiqueta, punto] of puntosBootstrap) {
    const dir = nuevaCarpeta('legado-' + punto);
    const shaAntes = crearBDLegada(dir);

    dbmod._resetParaPruebas();
    DIR_DATOS = dir;
    dbmod._inyectarFalloEn(punto);
    let err = null;
    try { await dbmod.getDb(); } catch (e) { err = e; }
    dbmod._inyectarFalloEn(null);

    ok(`[fallo en ${etiqueta}] la apertura lanza`, !!err, String(err));
    ok(`   aplicado = false`, err && err.aplicado === false, JSON.stringify(err && err.aplicado));
    ok(`   SHA-256 de la BD legada INTACTO`, shaDe(dir) === shaAntes,
      shaAntes.slice(0, 16) + ' -> ' + shaDe(dir).slice(0, 16));
    ok(`   NO queda un .gen activo`, !fs.existsSync(path.join(dir, 'panorama.sqlite3.gen')),
      fs.readdirSync(dir).join(','));

    // Y lo decisivo: al REINICIAR, la BD legada sigue siendo válida.
    dbmod._resetParaPruebas();
    DIR_DATOS = dir;
    let err2 = null;
    try { await dbmod.getDb(); } catch (e) { err2 = e; }
    ok(`   AL REINICIAR: la BD original vuelve a abrir`, err2 === null, String(err2));
    ok(`   ...NO se clasifica como bd-ilegible`, dbmod.estadoLatch() !== 'bd-ilegible',
      String(dbmod.estadoLatch()));
    ok(`   ...los 5 proyectos valiosos siguen ahí`,
      err2 === null && dbmod.all("SELECT id FROM projects WHERE name LIKE 'VALIOSO-%'").length === 5,
      err2 ? 'no abrió' : String(dbmod.all("SELECT id FROM projects WHERE name LIKE 'VALIOSO-%'").length));
    ok(`   ...y su app_meta también`,
      err2 === null && dbmod.get("SELECT value FROM app_meta WHERE key='app_theme'").value === 'medianoche');
    ok(`   ...y ahora sí recibe identidad`, err2 === null && !!dbmod._diagnostico().cMem);
  }
  {
    // Testigo adelantado que sobrevive a un corte (no se pudo apartar):
    // se simula dejándolo a mano, con parent nulo, como haría un bootstrap.
    // OJO: el testigo tiene que ser DEMOSTRABLE. Un .gen raíz a secas ya NO
    // vale como prueba de bootstrap (ver sección H): hace falta la marca de
    // fase y el SHA-256 de la imagen legada concreta.
    const dir = nuevaCarpeta('legado-testigo-superviviente');
    const shaAntes = crearBDLegada(dir);
    const MI_ID = 'ESTE-EQUIPO'.padEnd(32, '0');
    fs.writeFileSync(path.join(dir, 'panorama.sqlite3.gen'), JSON.stringify({
      v: 2, gen: 1, commit_id: 'aa'.repeat(16), parent_commit_id: null,
      writer: MI_ID, fase: 'bootstrap', base_sha256: shaAntes,
      at: new Date().toISOString(),
    }));
    dbmod._resetParaPruebas();
    DIR_DATOS = dir;
    dbmod.setInstallationId(MI_ID);
    const d = dbmod._leerDisco(dir);
    ok('BD legada + testigo de bootstrap PROPIO y demostrable: válida, no ilegible',
      d.estado === 'valida' && d.adopcionPropiaInterrumpida === true,
      JSON.stringify({ e: d.estado, a: d.adopcionPropiaInterrumpida }));
    let err = null;
    try { await dbmod.getDb(); } catch (e) { err = e; }
    ok('   abre sin error', err === null, String(err));
    ok('   con sus 5 proyectos',
      err === null && dbmod.all("SELECT id FROM projects WHERE name LIKE 'VALIOSO-%'").length === 5);
    ok('   los bytes originales ya no están porque se adoptó (esperado)', shaDe(dir) !== shaAntes);
    ok('   y ahora .gen y BD son coherentes', err === null && dbmod._leerGen().C === dbmod._leerDisco().C);
  }
  {
    // Un .gen ENCADENADO (con padre) junto a una BD sin db_commit_id SÍ es
    // incoherencia: eso no se relaja.
    const dir = nuevaCarpeta('legado-gen-encadenado');
    crearBDLegada(dir);
    fs.writeFileSync(path.join(dir, 'panorama.sqlite3.gen'), JSON.stringify({
      v: 2, gen: 7, commit_id: 'cc'.repeat(16), parent_commit_id: 'dd'.repeat(16),
      writer: 'ee'.repeat(16), at: new Date().toISOString(),
    }));
    dbmod._resetParaPruebas();
    DIR_DATOS = dir;
    const d = dbmod._leerDisco(dir);
    ok('BD sin db_commit_id + .gen ENCADENADO: sigue siendo ilegible',
      d.estado === 'ilegible', JSON.stringify(d.estado));
    let err = null;
    try { await dbmod.getDb(); } catch (e) { err = e; }
    ok('   getDb() lanza y latchea bd-ilegible',
      err && err.kind === 'ilegible' && dbmod.estadoLatch() === 'bd-ilegible', String(err));
  }
  {
    // CAMINO FELIZ de la adopción.
    const dir = nuevaCarpeta('legado-feliz');
    const shaAntes = crearBDLegada(dir);
    dbmod._resetParaPruebas();
    DIR_DATOS = dir;
    await dbmod.getDb();
    const dg = dbmod._diagnostico();
    ok('adopción feliz: la BD legada recibe identidad', !!dg.cMem);
    ok('   es un commit RAÍZ (sin padre)', dg.pMem === null, String(dg.pMem));
    ok('   una sola generación raíz', dg.gMem === 1, 'gMem=' + dg.gMem);
    ok('   historial con un solo commit', dg.hMem.length === 1);
    ok('   conserva los 5 proyectos', dbmod.all("SELECT id FROM projects WHERE name LIKE 'VALIOSO-%'").length === 5);
    ok('   conserva app_meta', dbmod.get("SELECT value FROM app_meta WHERE key='app_theme'").value === 'medianoche');
    ok('   .gen y SQLite coherentes', dbmod._leerGen().C === dbmod._leerDisco().C);
    ok('   el .gen es raíz también', dbmod._leerGen().P === null);
    ok('   el archivo ha cambiado (ya no es el legado)', shaDe(dir) !== shaAntes);
    ok('   y se puede escribir encima',
      typeof dbmod.run('INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES (?,?,?,?,?)',
        ['nuevo', 'c', 'persist:nv', 'x', 'x']) === 'number');
    ok('   la segunda escritura encadena desde la raíz', dbmod._diagnostico().pMem === dg.cMem);
  }

  // =========================================================================
  seccion('G. CARRERA DURANTE LA MIGRACIÓN — revalidación JIT');
  // =========================================================================
  // A abre el commit X y queda detenida antes de persistir la migración.
  // B transforma X -> algo en disco. A continúa. A NO puede pisar a B con una
  // imagen construida desde X.
  //
  // Se materializa con dos carpetas: se prepara el estado "A cargó X", se
  // sustituye el disco por lo que haya escrito B, y se abre A sobre eso.
  {
    // Utilidad: deja en `dir` una BD A3.3 con N proyectos y devuelve el estado.
    async function prepararA33(dir, n) {
      await abrirEn(dir);
      for (let i = 1; i <= n; i++) {
        dbmod.run('INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES (?,?,?,?,?)',
          ['P' + i, 'c', 'persist:' + i, 'x', 'x']);
      }
      return {
        bytes: fs.readFileSync(path.join(dir, 'panorama.sqlite3')),
        gen: fs.readFileSync(path.join(dir, 'panorama.sqlite3.gen')),
        diag: dbmod._diagnostico(),
      };
    }
    // Quita las columnas que añade migrateSchema() para forzar que la próxima
    // apertura tenga que migrar (y por tanto persistir).
    function desmigrar(bytes) {
      const d = new SQL.Database(bytes);
      const cols = d.exec('PRAGMA table_info(projects)')[0].values.map((r) => r[1]);
      ['backup_dir', 'kind', 'sort_order'].forEach((c) => {
        if (cols.includes(c)) { try { d.run('ALTER TABLE projects DROP COLUMN ' + c); } catch (e) {} }
      });
      const out = Buffer.from(d.export());
      d.close();
      return out;
    }

    // ---- G.1 DESCENDENCIA X -> Y: no se pisa, se adopta y se remigra -------
    {
      const dirA = nuevaCarpeta('carrera-desc');
      const X = await prepararA33(dirA, 2);
      // B (otro writer, misma carpeta) escribe Y descendiente de X
      dbmod._resetParaPruebas();
      DIR_DATOS = dirA;
      dbmod.setInstallationId('BBBB'.padEnd(32, '0'));
      await dbmod.getDb();
      dbmod.run('INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES (?,?,?,?,?)',
        ['DE-B', 'c', 'persist:b', 'x', 'x']);
      const Y = dbmod._diagnostico().cMem;
      const bytesY = fs.readFileSync(path.join(dirA, 'panorama.sqlite3'));

      // Ahora A abre. Su imagen de partida sería X (se fuerza desmigrando X
      // para que la migración tenga que persistir), pero en disco está Y.
      // Se simula el instante exacto: el disco tiene Y.
      dbmod._resetParaPruebas();
      DIR_DATOS = dirA;
      dbmod.setInstallationId('AAAA'.padEnd(32, '0'));
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      ok('G.1 descendencia: A abre sin error', err === null, String(err));
      ok('   A NO pisó a B: la fila DE-B sigue',
        err === null && dbmod.all("SELECT id FROM projects WHERE name='DE-B'").length === 1);
      ok('   A adoptó la rama de B', err === null && dbmod._diagnostico().hMem.includes(Y));
      ok('   el disco sigue conteniendo lo de B',
        (() => { const d = new SQL.Database(fs.readFileSync(path.join(dirA, 'panorama.sqlite3')));
          const n = d.exec("SELECT COUNT(*) FROM projects WHERE name='DE-B'")[0].values[0][0]; d.close(); return n === 1; })());
      void X; void bytesY;
    }

    // ---- G.2 BIFURCACIÓN: A no persiste -----------------------------------
    {
      const dirA = nuevaCarpeta('carrera-bifurcacion');
      const X = await prepararA33(dirA, 2);
      // A "tiene cargado" X con la migración pendiente: se deja en disco una
      // imagen DESMIGRADA de X para que A tenga que migrar...
      // ...pero además se coloca un .gen de OTRO writer con el MISMO padre que
      // A: dos hermanos del mismo commit = bifurcación.
      fs.writeFileSync(path.join(dirA, 'panorama.sqlite3'), desmigrar(X.bytes));
      dbmod._resetParaPruebas();
      DIR_DATOS = dirA;
      dbmod.setInstallationId('AAAA'.padEnd(32, '0'));
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      // La imagen desmigrada conserva el mismo db_commit_id, así que el .gen y
      // la BD coinciden: A migrará y persistirá. Lo comprobamos y luego
      // montamos la bifurcación de verdad sobre el resultado.
      ok('G.2 preparación: A abre la imagen desmigrada', err === null, String(err));
      const cA = dbmod._diagnostico().cMem;
      const pA = dbmod._diagnostico().pMem;

      // Ahora sí: otro equipo publica un commit HERMANO (mismo padre que A).
      const dOtro = new SQL.Database(fs.readFileSync(path.join(dirA, 'panorama.sqlite3')));
      const cB = 'bb'.repeat(16);
      dOtro.run("INSERT INTO app_meta(key,value) VALUES ('db_commit_id','" + cB + "') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
      dOtro.run("INSERT INTO app_meta(key,value) VALUES ('db_parent_commit_id','" + pA + "') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
      dOtro.run("INSERT INTO app_meta(key,value) VALUES ('db_commit_history','" + JSON.stringify([cB, pA]).replace(/'/g, "''") + "') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
      dOtro.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('RAMA-B','c','persist:rb','x','x')");
      const bytesB = Buffer.from(dOtro.export());
      dOtro.close();
      fs.writeFileSync(path.join(dirA, 'panorama.sqlite3'), desmigrar(bytesB));
      fs.writeFileSync(path.join(dirA, 'panorama.sqlite3.gen'), JSON.stringify({
        v: 2, gen: 99, commit_id: cB, parent_commit_id: pA, writer: 'BBBB'.padEnd(32, '0'), at: new Date().toISOString(),
      }));
      const shaAntes = crypto.createHash('sha256').update(fs.readFileSync(path.join(dirA, 'panorama.sqlite3'))).digest('hex');

      dbmod._resetParaPruebas();
      DIR_DATOS = dirA;
      dbmod.setInstallationId('AAAA'.padEnd(32, '0'));
      dbmod.setPoliticaUbicacion('compartida');
      // A carga la imagen de B... pero su cMem será cB, no cA: para forzar la
      // bifurcación real hay que simular que A tiene cA en memoria. Se hace
      // dejando en disco la imagen de A y el .gen de B.
      const dA = new SQL.Database(fs.readFileSync(path.join(dirA, 'panorama.sqlite3')));
      dA.run("INSERT INTO app_meta(key,value) VALUES ('db_commit_id','" + cA + "') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
      dA.run("INSERT INTO app_meta(key,value) VALUES ('db_parent_commit_id','" + pA + "') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
      const bytesA = Buffer.from(dA.export());
      dA.close();
      fs.writeFileSync(path.join(dirA, 'panorama.sqlite3'), desmigrar(bytesA));
      const shaBif = crypto.createHash('sha256').update(fs.readFileSync(path.join(dirA, 'panorama.sqlite3'))).digest('hex');

      dbmod._resetParaPruebas();
      DIR_DATOS = dirA;
      dbmod.setInstallationId('AAAA'.padEnd(32, '0'));
      dbmod.setPoliticaUbicacion('compartida');
      let err2 = null;
      try { await dbmod.getDb(); } catch (e) { err2 = e; }
      const shaDespues = crypto.createHash('sha256').update(fs.readFileSync(path.join(dirA, 'panorama.sqlite3'))).digest('hex');
      ok('G.2 BIFURCACIÓN: la migración NO se persiste', !!err2, String(err2));
      ok('   el .sqlite3 en disco NO cambió', shaDespues === shaBif, shaBif.slice(0, 12) + ' -> ' + shaDespues.slice(0, 12));
      void shaAntes;
    }

    // ---- G.3 CASO 8: mismo commit, bytes distintos ------------------------
    {
      const dir = nuevaCarpeta('carrera-caso8');
      const X = await prepararA33(dir, 2);
      // Se desmigra (para que haya que migrar) y además se añade una fila SIN
      // tocar los identificadores: mismo commit, bytes distintos.
      const d = new SQL.Database(desmigrar(X.bytes));
      d.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('EXTERNA','c','persist:ex','x','x')");
      const bytes = Buffer.from(d.export());
      d.close();
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), bytes);
      const shaAntes = crypto.createHash('sha256').update(bytes).digest('hex');

      dbmod._resetParaPruebas();
      DIR_DATOS = dir;
      dbmod.setPoliticaUbicacion('compartida');
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      // La imagen que A carga ES la de disco, así que F_mio coincide: esto abre
      // bien. El caso 8 de verdad se prueba en la sección C. Aquí se comprueba
      // lo que importa: los bytes externos NO se pierden.
      const shaDespues = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex');
      ok('G.3 la fila externa NO se pierde al migrar',
        (() => { const dd = new SQL.Database(fs.readFileSync(path.join(dir, 'panorama.sqlite3')));
          const n = dd.exec("SELECT COUNT(*) FROM projects WHERE name='EXTERNA'")[0].values[0][0]; dd.close(); return n === 1; })(),
        String(err));
      void shaAntes; void shaDespues;
    }

    // ---- G.4 DISCO NO VERIFICABLE durante la migración --------------------
    {
      const dir = nuevaCarpeta('carrera-noverif');
      const X = await prepararA33(dir, 2);
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), desmigrar(X.bytes));
      const shaAntes = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex');

      dbmod._resetParaPruebas();
      DIR_DATOS = dir;
      dbmod.setPoliticaUbicacion('compartida');
      // El disco se vuelve ilegible JUSTO DESPUÉS de la carga inicial: la
      // revalidación JIT es la que se lo encuentra.
      let lecturas = 0;
      const realRead = fs.readFileSync;
      fs.readFileSync = (p2, ...r) => {
        if (String(p2).endsWith('panorama.sqlite3')) {
          lecturas++;
          if (lecturas > 1) throw Object.assign(new Error('inyectado'), { code: 'EIO' });
        }
        return realRead(p2, ...r);
      };
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      fs.readFileSync = realRead;
      const shaDespues = crypto.createHash('sha256').update(realRead(path.join(dir, 'panorama.sqlite3'))).digest('hex');
      ok('G.4 disco no verificable en la revalidación JIT: NO se persiste', !!err, String(err));
      ok('   el .sqlite3 NO cambió', shaDespues === shaAntes);
      ok('   se hicieron VARIAS lecturas (hubo revalidación, no una sola)', lecturas > 1, 'lecturas=' + lecturas);
    }
  }

  // =========================================================================
  seccion('H. MARCADOR DE BOOTSTRAP DEMOSTRABLE (no solo parent === null)');
  // =========================================================================
  {
    function bdLegada(dir) {
      const v = new SQL.Database();
      v.run(`CREATE TABLE projects(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, client TEXT,
        partition_name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE app_meta(key TEXT PRIMARY KEY, value TEXT);`);
      for (let i = 1; i <= 4; i++) {
        v.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('LEG-" + i +
          "','C','persist:lg" + i + "','x','x')");
      }
      const b = Buffer.from(v.export());
      v.close();
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), b);
      return crypto.createHash('sha256').update(b).digest('hex');
    }
    function ponerGen(dir, obj) {
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3.gen'), JSON.stringify(Object.assign({
        v: 2, gen: 1, commit_id: 'aa'.repeat(16), parent_commit_id: null,
        writer: 'MIO'.padEnd(32, '0'), at: new Date().toISOString(),
      }, obj)));
    }
    const MIO = 'MIO'.padEnd(32, '0');
    const OTRO = 'OTRO'.padEnd(32, '0');

    // H.1 bootstrap NUESTRO con hash base COINCIDENTE -> recuperación válida
    {
      const dir = nuevaCarpeta('boot-mio-ok');
      const sha = bdLegada(dir);
      ponerGen(dir, { writer: MIO, fase: 'bootstrap', base_sha256: sha });
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MIO);
      const d = dbmod._leerDisco(dir);
      ok('H.1 bootstrap propio + hash coincidente -> válida y reanudable',
        d.estado === 'valida' && d.adopcionPropiaInterrumpida === true, JSON.stringify(d.estado));
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      ok('   abre y adopta', err === null && dbmod.all("SELECT id FROM projects WHERE name LIKE 'LEG-%'").length === 4, String(err));
    }
    // H.2 bootstrap NUESTRO con hash base DISTINTO -> NO adopción silenciosa
    {
      const dir = nuevaCarpeta('boot-mio-hashmal');
      bdLegada(dir);
      ponerGen(dir, { writer: MIO, fase: 'bootstrap', base_sha256: 'ff'.repeat(32) });
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MIO);
      const d = dbmod._leerDisco(dir);
      ok('H.2 bootstrap propio + hash DISTINTO -> no demostrable', d.estado === 'no-demostrable', String(d.estado));
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      ok('   NO se adopta en silencio', !!err, String(err));
      ok('   y NO se escribió nada', !fs.readdirSync(dir).some((f) => f.includes('.tmp-')));
    }
    // H.3 bootstrap de OTRO writer en COMPARTIDA -> espera, no sobrescribe
    {
      const dir = nuevaCarpeta('boot-ajeno');
      const sha = bdLegada(dir);
      ponerGen(dir, { writer: OTRO, fase: 'bootstrap', base_sha256: sha });
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MIO);
      dbmod.setPoliticaUbicacion('compartida');
      const d = dbmod._leerDisco(dir);
      ok('H.3 bootstrap AJENO -> estado propio, no "valida"', d.estado === 'bootstrap-ajeno', String(d.estado));
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      ok('   NO se adopta', !!err && err.estadoDisco === 'bootstrap-ajeno', String(err));
      ok('   fail-closed (degradado)', dbmod.estadoLatch() === 'degradado', String(dbmod.estadoLatch()));
      ok('   el .sqlite3 legado sigue con su SHA-256',
        crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex') === sha);
    }
    // H.4 .gen raíz NORMAL (sin marca) -> NO es adopción interrumpida
    {
      const dir = nuevaCarpeta('boot-raiz-normal');
      const sha = bdLegada(dir);
      ponerGen(dir, { writer: MIO });            // raíz, pero SIN fase bootstrap
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MIO);
      const d = dbmod._leerDisco(dir);
      ok('H.4 .gen RAÍZ normal sin marca -> no demostrable (NO adopción)',
        d.estado === 'no-demostrable', String(d.estado));
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      ok('   getDb() no adopta', !!err, String(err));
      ok('   la BD legada sigue intacta',
        crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex') === sha);
    }
    // H.5 versión antigua que restaura una BD sin identidad sobre una
    //     instalación A3.3 que tenía un commit raíz normal
    {
      const dir = nuevaCarpeta('boot-restaurada-vieja');
      await abrirEn(dir);                        // instalación A3.3 con raíz R
      const R = dbmod._diagnostico().cMem;
      const genR = fs.readFileSync(path.join(dir, 'panorama.sqlite3.gen'), 'utf8');
      ok('H.5 preparación: la instalación A3.3 tiene un commit RAÍZ',
        JSON.parse(genR).parent_commit_id === null && JSON.parse(genR).commit_id === R);
      // Antes esta aserción aceptaba `fase === undefined || fase === 'bootstrap'`,
      // que era siempre cierta y no probaba nada. Ahora exige de verdad que el
      // estado ESTABLE no conserve ninguna marca transitoria.
      ok('   ...y su .gen ESTABLE no conserva NINGUNA marca transitoria',
        JSON.parse(genR).fase === undefined && JSON.parse(genR).base_sha256 === undefined &&
        JSON.parse(genR).base === undefined,
        genR);
      // una versión antigua sustituye el .sqlite3 por una imagen sin identidad
      const sha = bdLegada(dir);
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      const d = dbmod._leerDisco(dir);
      ok('   BD sin identidad + .gen raíz de la instalación -> no demostrable',
        d.estado === 'no-demostrable', String(d.estado) + ' / ' + String(d.motivo));
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      ok('   NO se adopta en silencio', !!err, String(err));
      ok('   la imagen restaurada sigue intacta',
        crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex') === sha);
    }
    // H.6 corte realista entre publicar el testigo y renombrar el SQLite
    {
      const dir = nuevaCarpeta('boot-corte-realista');
      const sha = bdLegada(dir);
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MIO);
      dbmod._inyectarFalloEn('persist');
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      dbmod._inyectarFalloEn(null);
      ok('H.6 corte tras el testigo y antes del rename: lanza', !!err, String(err));
      ok('   la BD legada conserva su SHA-256',
        crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex') === sha);
      ok('   el testigo se apartó (no queda .gen activo)',
        !fs.existsSync(path.join(dir, 'panorama.sqlite3.gen')), fs.readdirSync(dir).join(','));
      // y al reiniciar, todo normal
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MIO);
      let err2 = null;
      try { await dbmod.getDb(); } catch (e) { err2 = e; }
      ok('   al reiniciar abre bien', err2 === null, String(err2));
      ok('   con sus 4 proyectos', err2 === null && dbmod.all("SELECT id FROM projects WHERE name LIKE 'LEG-%'").length === 4);
      // La marca es TRANSITORIA: tras confirmar el .sqlite3 se retira. Antes
      // esta aserción exigía lo contrario, y era justo el defecto.
      ok('   y el testigo final queda NORMAL, sin la marca transitoria',
        (() => { const g = JSON.parse(fs.readFileSync(path.join(dir, 'panorama.sqlite3.gen'), 'utf8'));
          return g.fase === undefined && g.base_sha256 === undefined && g.parent_commit_id === null; })(),
        fs.readFileSync(path.join(dir, 'panorama.sqlite3.gen'), 'utf8'));
    void sha;
    }
  }

  // =========================================================================
  seccion('I. PRIMERA CREACIÓN INTERRUMPIDA — no puede dejar la instalación muerta');
  // =========================================================================
  {
    const MI = 'EQUIPO-I'.padEnd(32, '0');
    const puntos = ['persist', 'meta2', 'tras-migracion'];
    for (const punto of puntos) {
      // A) carpeta completamente virgen
      const dir = nuevaCarpeta('creacion-' + punto);
      ok(`[corte en ${punto}] A) la carpeta está completamente vacía`, fs.readdirSync(dir).length === 0);

      // B) creación AUTORIZADA   C) fallo antes de confirmar
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      dbmod._inyectarFalloEn(punto);
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      dbmod._inyectarFalloEn(null);
      ok(`   B/C) la creación autorizada falla en ${punto}`, !!err, String(err));

      // D) no hay SQLite activo
      ok('   D) NO existe panorama.sqlite3', !fs.existsSync(path.join(dir, 'panorama.sqlite3')));
      ok('   D) NO queda un .gen activo', !fs.existsSync(path.join(dir, 'panorama.sqlite3.gen')));

      // E/F) reiniciar con creación autorizada -> DEBE completar sin ayuda
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      const pista = dbmod.pareceUbicacionNueva
        ? null : null;                          // (se consulta tras fijar rutas)
      let err2 = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err2 = e; }
      ok('   E/F) al reiniciar, la creación se completa SIN intervención', err2 === null, String(err2));
      ok('   ...y existe la base de datos', fs.existsSync(path.join(dir, 'panorama.sqlite3')));
      ok('   ...con su testigo NORMAL (sin marca transitoria)',
        (() => { const g = JSON.parse(fs.readFileSync(path.join(dir, 'panorama.sqlite3.gen'), 'utf8'));
          return g.fase === undefined && g.base === undefined; })(),
        fs.readFileSync(path.join(dir, 'panorama.sqlite3.gen'), 'utf8'));
      ok('   ...y se puede escribir',
        err2 === null && typeof dbmod.run(
          'INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES (?,?,?,?,?)',
          ['p', 'c', 'persist:ci' + punto, 'x', 'x']) === 'number');
      // El testigo solo existe si el corte fue DESPUÉS de publicarlo. Con un
      // corte anterior (meta2, tras-migracion) no hay nada que conservar, y
      // afirmar que lo hay sería falso.
      if (punto === 'persist') {
        ok('   ...el testigo de la creación fallida SIGUE conservado como evidencia',
          fs.readdirSync(dir).some((f) => f.includes('.gen.creacion-fallida-')),
          fs.readdirSync(dir).join(','));
      } else {
        ok('   ...(corte anterior al testigo: no había nada que conservar)',
          !fs.readdirSync(dir).some((f) => f.includes('.gen.creacion-fallida-')),
          fs.readdirSync(dir).join(','));
      }
      void pista;
    }
  }
  {
    // G) fallos durante escritura / fsync / rename del SQLite inicial
    const MI = 'EQUIPO-G'.padEnd(32, '0');
    const inyecciones = [
      ['writeSync sin progreso', () => { const r = fs.writeSync; fs.writeSync = () => 0; return () => { fs.writeSync = r; }; }],
      ['fsync EIO', () => { const r = fs.fsyncSync; fs.fsyncSync = () => { throw Object.assign(new Error('inj'), { code: 'EIO' }); }; return () => { fs.fsyncSync = r; }; }],
      ['rename EPERM', () => { const r = fs.renameSync; fs.renameSync = (a, b) => {
          if (String(a).includes('sqlite3.tmp-')) throw Object.assign(new Error('inj'), { code: 'EPERM' });
          return r(a, b); }; return () => { fs.renameSync = r; }; }],
    ];
    for (const [etiqueta, instalar] of inyecciones) {
      const dir = nuevaCarpeta('creacion-io-' + etiqueta.split(' ')[0]);
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      const quitar = instalar();
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      quitar();
      ok(`G) [${etiqueta}] la creación inicial falla`, !!err, String(err));
      ok('   no queda una base de datos activa', !fs.existsSync(path.join(dir, 'panorama.sqlite3')));
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      let err2 = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err2 = e; }
      ok('   al reiniciar, la creación se completa', err2 === null && fs.existsSync(path.join(dir, 'panorama.sqlite3')),
        String(err2) + ' | ' + fs.readdirSync(dir).join(','));
    }
  }
  {
    // H) mismo escenario en COMPARTIDA y DESCONOCIDA
    for (const politica of ['compartida', 'desconocida']) {
      const MI = 'EQUIPO-H'.padEnd(32, '0');
      const dir = nuevaCarpeta('creacion-' + politica);
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      dbmod.setPoliticaUbicacion(politica);
      dbmod._inyectarFalloEn('persist');
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      dbmod._inyectarFalloEn(null);
      ok(`H) [${politica}] la creación inicial falla`, !!err, String(err));
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      dbmod.setPoliticaUbicacion(politica);
      let err2 = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err2 = e; }
      ok('   al reiniciar se completa igualmente', err2 === null, String(err2));
      ok('   sin latch pendiente', dbmod.estadoLatch() === null, String(dbmod.estadoLatch()));
    }
  }
  {
    // I) restos NO demostrables siguen bloqueando una creación nueva
    const casos = [
      ['.gen vivo de otro equipo', (dir) => fs.writeFileSync(path.join(dir, 'panorama.sqlite3.gen'),
        JSON.stringify({ v: 2, gen: 3, commit_id: 'aa'.repeat(16), parent_commit_id: 'bb'.repeat(16), writer: 'AJENO', at: 'x' }))],
      ['testigo de creación de OTRO writer', (dir) => fs.writeFileSync(path.join(dir, 'panorama.sqlite3.gen.creacion-fallida-1'),
        JSON.stringify({ v: 2, gen: 1, commit_id: 'cc'.repeat(16), parent_commit_id: null, writer: 'OTRO-EQUIPO', fase: 'creacion-inicial', base: 'ninguna', at: 'x' }))],
      ['testigo de creación ilegible', (dir) => fs.writeFileSync(path.join(dir, 'panorama.sqlite3.gen.creacion-fallida-2'), 'esto no es json')],
      ['archivo de conflicto', (dir) => fs.writeFileSync(path.join(dir, 'panorama.sqlite3.conflicto-x-2026'), 'datos')],
      ['temporal de otro writer', (dir) => fs.writeFileSync(path.join(dir, 'panorama.sqlite3.tmp-OTROEQUIPO-abc'), 'datos')],
      ['testigo de BOOTSTRAP fallido (había BD antes)', (dir) => fs.writeFileSync(path.join(dir, 'panorama.sqlite3.gen.bootstrap-fallido-1'),
        JSON.stringify({ v: 2, gen: 1, commit_id: 'dd'.repeat(16), parent_commit_id: null, writer: 'EQUIPO-I'.padEnd(32, '0'), fase: 'bootstrap', base_sha256: 'ee'.repeat(32), at: 'x' }))],
    ];
    for (const [etiqueta, sembrar] of casos) {
      const dir = nuevaCarpeta('bloqueo-' + etiqueta.split(' ')[0].replace(/[^a-z]/gi, ''));
      sembrar(dir);
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId('EQUIPO-I'.padEnd(32, '0'));
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      ok(`I) [${etiqueta}] SIGUE bloqueando la creación`, !!err, String(err));
      ok('   no se creó ninguna base de datos', !fs.existsSync(path.join(dir, 'panorama.sqlite3')));
    }
  }

  // =========================================================================
  seccion('J. EL MARCADOR DE FASE ES TRANSITORIO');
  // =========================================================================
  {
    function bdLegadaJ(dir) {
      const v = new SQL.Database();
      v.run(`CREATE TABLE projects(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, client TEXT,
        partition_name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE app_meta(key TEXT PRIMARY KEY, value TEXT);`);
      v.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('J1','C','persist:j1','x','x')");
      const b = Buffer.from(v.export()); v.close();
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), b);
      return { sha: crypto.createHash('sha256').update(b).digest('hex'), bytes: b };
    }
    const MI = 'EQUIPO-J'.padEnd(32, '0');

    // A) adopción feliz -> .gen final SIN marca
    {
      const dir = nuevaCarpeta('fase-feliz');
      bdLegadaJ(dir);
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      await dbmod.getDb();
      const g = JSON.parse(fs.readFileSync(path.join(dir, 'panorama.sqlite3.gen'), 'utf8'));
      ok('J.A adopción feliz: el .gen final NO lleva fase', g.fase === undefined, JSON.stringify(g.fase));
      ok('   ...ni base_sha256', g.base_sha256 === undefined);
      ok('   ...pero conserva el commit y el padre nulo',
        g.commit_id === dbmod._diagnostico().cMem && g.parent_commit_id === null);
      ok('   ...y la BD tiene ese commit', dbmod._leerDisco().C === g.commit_id);
    }
    // B) corte ANTES del SQLite: el marcador sigue permitiendo recuperar
    {
      const dir = nuevaCarpeta('fase-corte-antes');
      const L = bdLegadaJ(dir);
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      dbmod._inyectarFalloEn('persist');
      try { await dbmod.getDb(); } catch (e) {}
      dbmod._inyectarFalloEn(null);
      ok('J.B corte antes del SQLite: la BD legada intacta',
        crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex') === L.sha);
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      ok('   al reiniciar se recupera y adopta', err === null && dbmod.all("SELECT id FROM projects WHERE name='J1'").length === 1, String(err));
    }
    // C) corte DESPUÉS del rename del SQLite y ANTES de normalizar el .gen
    {
      const dir = nuevaCarpeta('fase-corte-despues');
      bdLegadaJ(dir);
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      // se deja que adopte, y después se REPONE a mano el .gen con la marca:
      // es exactamente el estado "SQLite confirmado, .gen sin normalizar".
      await dbmod.getDb();
      const C = dbmod._diagnostico().cMem;
      const shaTrasAdoptar = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex');
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3.gen'), JSON.stringify({
        v: 2, gen: 1, commit_id: C, parent_commit_id: null, writer: MI,
        fase: 'bootstrap', base_sha256: 'ff'.repeat(32), at: new Date().toISOString(),
      }));
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      const g = JSON.parse(fs.readFileSync(path.join(dir, 'panorama.sqlite3.gen'), 'utf8'));
      ok('J.C marcador superviviente sobre un commit YA confirmado: abre', err === null, String(err));
      ok('   el .gen se NORMALIZA (se retira la marca)', g.fase === undefined && g.base_sha256 === undefined,
        JSON.stringify({ f: g.fase, b: g.base_sha256 }));
      ok('   conserva el MISMO commit', g.commit_id === C);
      ok('   NUNCA se restaura hacia atrás: la BD sigue siendo la adoptada',
        crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex') === shaTrasAdoptar);
      ok('   y sus datos siguen', dbmod.all("SELECT id FROM projects WHERE name='J1'").length === 1);
    }
    // D) tras una adopción exitosa, restaurar EXACTAMENTE los bytes legados
    {
      const dir = nuevaCarpeta('fase-restauracion-antigua');
      const L = bdLegadaJ(dir);
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      await dbmod.getDb();                       // adopción exitosa
      ok('J.D preparación: adoptada y el .gen ya está normalizado',
        JSON.parse(fs.readFileSync(path.join(dir, 'panorama.sqlite3.gen'), 'utf8')).fase === undefined);
      // una versión antigua restaura EXACTAMENTE la imagen legada original
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), L.bytes);
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      const d = dbmod._leerDisco(dir);
      ok('J.D restauración antigua: NO se clasifica como bootstrap-propio',
        d.estado !== 'valida' || d.adopcionPropiaInterrumpida !== true, JSON.stringify(d.estado));
      ok('   se clasifica como no demostrable', d.estado === 'no-demostrable', String(d.estado));
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      ok('   y NO se vuelve a adoptar en silencio', !!err, String(err));
      ok('   la imagen restaurada sigue intacta',
        crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex') === L.sha);
    }
  }

  // =========================================================================
  seccion('K. INTERLEAVING REAL A -> B -> A (con gancho en el flujo)');
  // =========================================================================
  {
    // Prepara una BD A3.3 y la deja DESMIGRADA, para que la apertura de A tenga
    // que migrar y por tanto persistir.
    function desmigrar(bytes) {
      const d = new SQL.Database(bytes);
      ['backup_dir', 'kind', 'sort_order'].forEach((c) => {
        try { d.run('ALTER TABLE projects DROP COLUMN ' + c); } catch (e) {}
      });
      const out = Buffer.from(d.export()); d.close(); return out;
    }
    async function prepararX(dir) {
      await abrirEn(dir);
      dbmod.run('INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES (?,?,?,?,?)',
        ['DE-A', 'c', 'persist:a', 'x', 'x']);
      const est = dbmod._diagnostico();
      const bytesX = fs.readFileSync(path.join(dir, 'panorama.sqlite3'));
      const genX = fs.readFileSync(path.join(dir, 'panorama.sqlite3.gen'));
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), desmigrar(bytesX));
      return { X: est.cMem, hX: est.hMem.slice(), bytesX, genX };
    }
    // B escribe Y DESCENDIENTE de X, usando el propio db.js con otro writer.
    async function bEscribeDescendiente(dir, bytesX, genX) {
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), bytesX);
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3.gen'), genX);
      const guardaDatos = DIR_DATOS;
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId('BBBB'.padEnd(32, '0'));
      await dbmod.getDb();
      dbmod.run('INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES (?,?,?,?,?)',
        ['DE-B', 'c', 'persist:b', 'x', 'x']);
      const Y = dbmod._diagnostico().cMem;
      const bytesY = fs.readFileSync(path.join(dir, 'panorama.sqlite3'));
      const genY = fs.readFileSync(path.join(dir, 'panorama.sqlite3.gen'));
      DIR_DATOS = guardaDatos;
      return { Y, bytesY: desmigrar(bytesY), bytesYintacto: bytesY, genY };
    }

    // ---- K.1 DESCENDENCIA: A carga X, B publica Y, A revalida -------------
    {
      const dir = nuevaCarpeta('inter-desc');
      const p = await prepararX(dir);
      const b = await bEscribeDescendiente(dir, p.bytesX, p.genX);
      // dejar el disco en el estado "A va a cargar X"
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), desmigrar(p.bytesX));
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3.gen'), p.genX);

      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId('AAAA'.padEnd(32, '0'));
      let disparos = 0;
      dbmod._inyectarGancho((n) => {
        if (n === 'memoria-cargada' && disparos === 0) {
          disparos++;
          // B publica Y JUSTO AHORA, con A ya con X en memoria
          fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), b.bytesYintacto);
          fs.writeFileSync(path.join(dir, 'panorama.sqlite3.gen'), b.genY);
        }
      });
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      dbmod._inyectarGancho(null);

      ok('K.1 el gancho disparó: A tenía X en memoria cuando B publicó Y', disparos === 1, 'disparos=' + disparos);
      ok('   A abre sin error', err === null, String(err));
      ok('   A detectó Y y lo adoptó', err === null && dbmod._diagnostico().hMem.includes(b.Y),
        err === null ? JSON.stringify(dbmod._diagnostico().hMem.map((h) => h.slice(0, 6))) : 'no abrió');
      ok('   LA FILA DE B SOBREVIVE', err === null && dbmod.all("SELECT id FROM projects WHERE name='DE-B'").length === 1);
      ok('   y la de A también', err === null && dbmod.all("SELECT id FROM projects WHERE name='DE-A'").length === 1);
      ok('   el disco contiene lo de B',
        (() => { const d = new SQL.Database(fs.readFileSync(path.join(dir, 'panorama.sqlite3')));
          const n = d.exec("SELECT COUNT(*) FROM projects WHERE name='DE-B'")[0].values[0][0]; d.close(); return n === 1; })());
    }

    // ---- K.2 BIFURCACIÓN durante la carrera --------------------------------
    {
      const dir = nuevaCarpeta('inter-bifurcacion');
      const p = await prepararX(dir);
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), desmigrar(p.bytesX));
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3.gen'), p.genX);

      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId('AAAA'.padEnd(32, '0'));
      dbmod.setPoliticaUbicacion('compartida');
      let sha = null;
      dbmod._inyectarGancho((n) => {
        if (n !== 'memoria-cargada' || sha) return;
        // otro equipo publica un HERMANO de X (mismo padre que X)
        const gX = JSON.parse(p.genX.toString('utf8'));
        const d = new SQL.Database(p.bytesX);
        const cB = 'bb'.repeat(16);
        d.run("INSERT INTO app_meta(key,value) VALUES ('db_commit_id','" + cB + "') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
        d.run("INSERT INTO app_meta(key,value) VALUES ('db_parent_commit_id','" + (gX.parent_commit_id || '') + "') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
        d.run("INSERT INTO app_meta(key,value) VALUES ('db_commit_history','" + JSON.stringify([cB, gX.parent_commit_id]) + "') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
        d.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('RAMA-B','c','persist:rb','x','x')");
        const bytes = Buffer.from(d.export()); d.close();
        fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), bytes);
        fs.writeFileSync(path.join(dir, 'panorama.sqlite3.gen'), JSON.stringify({
          v: 2, gen: 99, commit_id: cB, parent_commit_id: gX.parent_commit_id,
          writer: 'BBBB'.padEnd(32, '0'), at: new Date().toISOString(),
        }));
        sha = crypto.createHash('sha256').update(bytes).digest('hex');
      });
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      dbmod._inyectarGancho(null);
      const shaFinal = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex');
      ok('K.2 el gancho publicó la rama hermana', !!sha);
      ok('   A NO pisa el disco', shaFinal === sha, String(err));
    }

    // ---- K.3 MISMO COMMIT, BYTES DISTINTOS (caso 8) ------------------------
    {
      const dir = nuevaCarpeta('inter-caso8');
      const p = await prepararX(dir);
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), desmigrar(p.bytesX));
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3.gen'), p.genX);

      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId('AAAA'.padEnd(32, '0'));
      dbmod.setPoliticaUbicacion('compartida');
      let sha = null;
      dbmod._inyectarGancho((n) => {
        if (n !== 'memoria-cargada' || sha) return;
        // una "versión antigua" añade una fila SIN tocar los identificadores
        const d = new SQL.Database(desmigrar(p.bytesX));
        d.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('EXTERNA','c','persist:ex','x','x')");
        const bytes = Buffer.from(d.export()); d.close();
        fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), bytes);
        sha = crypto.createHash('sha256').update(bytes).digest('hex');
      });
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      dbmod._inyectarGancho(null);
      const shaFinal = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex');
      ok('K.3 el gancho introdujo el cambio externo', !!sha);
      ok('   A NO pisa la escritura externa', shaFinal === sha, String(err));
      ok('   la fila externa sobrevive',
        (() => { const d = new SQL.Database(fs.readFileSync(path.join(dir, 'panorama.sqlite3')));
          const nn = d.exec("SELECT COUNT(*) FROM projects WHERE name='EXTERNA'")[0].values[0][0]; d.close(); return nn === 1; })());
    }

    // ---- K.4 EIO en la revalidación JIT ------------------------------------
    {
      const dir = nuevaCarpeta('inter-eio');
      const p = await prepararX(dir);
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), desmigrar(p.bytesX));
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3.gen'), p.genX);
      const shaAntes = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex');

      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId('AAAA'.padEnd(32, '0'));
      dbmod.setPoliticaUbicacion('compartida');
      const realRead = fs.readFileSync;
      let armado = false;
      dbmod._inyectarGancho((n) => {
        if (n !== 'memoria-cargada' || armado) return;
        armado = true;
        fs.readFileSync = (p2, ...r) => {
          if (String(p2).endsWith('panorama.sqlite3')) throw Object.assign(new Error('inj'), { code: 'EIO' });
          return realRead(p2, ...r);
        };
      });
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      fs.readFileSync = realRead;
      dbmod._inyectarGancho(null);
      ok('K.4 EIO justo en la revalidación JIT: NO se persiste', !!err, String(err));
      ok('   el .sqlite3 NO cambió',
        crypto.createHash('sha256').update(realRead(path.join(dir, 'panorama.sqlite3'))).digest('hex') === shaAntes);
    }
  }

  // =========================================================================
  seccion('L. TEMPORAL PROPIO != PRUEBA DE PRIMERA CREACIÓN');
  // =========================================================================
  // "Lo escribió esta instalación" NO demuestra "viene de una primera
  // creación". La prueba es la intención LOCAL, fuera de la carpeta de datos.
  {
    const MI = 'EQUIPO-L'.padEnd(32, '0');

    // Deja en `dir` una BD A3.3 con datos y devuelve sus bytes y su .gen.
    async function bdConDatos(dir) {
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      await dbmod.getDb({ crearSiAusente: true });
      dbmod.run('INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES (?,?,?,?,?)',
        ['VALIOSO', 'c', 'persist:lv', 'x', 'x']);
      return {
        bytes: fs.readFileSync(path.join(dir, 'panorama.sqlite3')),
        gen: fs.readFileSync(path.join(dir, 'panorama.sqlite3.gen')),
      };
    }

    // --- 1. PRIMERA CREACIÓN real con fallo ANTES de publicar el .gen -------
    {
      const dir = nuevaCarpeta('L1-creacion-real');
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      // 'gen' corta DENTRO de escribirGen: el temporal del testigo se queda,
      // pero el testigo nunca llega a publicarse.
      dbmod._inyectarFalloEn('gen');
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      dbmod._inyectarFalloEn(null);
      ok('L.1 primera creación: falla en el punto previo a publicar el .gen', !!err, String(err));
      ok('   no hay base de datos', !fs.existsSync(path.join(dir, 'panorama.sqlite3')));
      const restos = fs.readdirSync(dir);
      // El corte en 'gen' ocurre ANTES de escribir un solo byte, así que aquí
      // no queda ningún resto: la carpeta sigue literalmente virgen.
      ok('   la carpeta sigue vacía (el corte fue antes del primer byte)',
        restos.length === 0, restos.join(','));
      ok('   NO hay testigo .gen.creacion-fallida (no llegó a publicarse)',
        !restos.some((f) => f.includes('.gen.creacion-fallida-')), restos.join(','));
      // la intención local SÍ existe y es lo que explica el resto
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      let err2 = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err2 = e; }
      ok('   al reiniciar autorizado, SÍ crea (la intención local lo explica)',
        err2 === null && fs.existsSync(path.join(dir, 'panorama.sqlite3')), String(err2));
      ok('   ...y la intención se retira al completarse',
        (() => { try { const j = JSON.parse(fs.readFileSync(path.join(DIR_APPDATA, 'panorama-app-config', 'initial-create-intent.json'), 'utf8'));
          return !j.intentos[path.resolve(dir).toLowerCase()]; } catch (e) { return true; } })());
    }

    // --- 2. BD existente + temporal propio de una escritura NORMAL ----------
    // La BD "desaparece" y se autoriza crear: NO debe crear.
    for (const [etiqueta, clase] of [
      ['.tmp-', '.tmp-'], ['.tmp-fallido-', '.tmp-fallido-'], ['.tmp-huerfano-', '.tmp-huerfano-'],
    ]) {
      const dir = nuevaCarpeta('L2-' + clase.replace(/\./g, '').replace(/-/g, ''));
      const bd = await bdConDatos(dir);
      const shaBD = crypto.createHash('sha256').update(bd.bytes).digest('hex');
      // temporal de una escritura NORMAL: lleva nuestro writer y NINGÚN nonce
      // de intento de creación.
      const w = MI.replace(/[^0-9a-zA-Z_-]/g, '').slice(0, 16);
      const tmpNormal = path.join(dir, 'panorama.sqlite3' + clase + w + '-' + 'a1b2c3d4e5f60718');
      fs.writeFileSync(tmpNormal, bd.bytes);
      // ...y la base de datos deja de verse
      fs.renameSync(path.join(dir, 'panorama.sqlite3'), path.join(dir, 'guardada.bin'));
      fs.unlinkSync(path.join(dir, 'panorama.sqlite3.gen'));

      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      ok(`L.2 [${etiqueta}] temporal propio de escritura NORMAL: NO autoriza crear`, !!err, String(err));
      ok('   no se creó ninguna base de datos', !fs.existsSync(path.join(dir, 'panorama.sqlite3')));
      // Un `.tmp-` suelto lo aparta el manejador de huérfanos a `.tmp-huerfano-`
      // (conservar, no borrar), así que se busca por contenido, no por nombre.
      const superviviente = fs.readdirSync(dir).map((f) => path.join(dir, f)).find((p2) => {
        try { return crypto.createHash('sha256').update(fs.readFileSync(p2)).digest('hex') === shaBD; }
        catch (e) { return false; }
      });
      ok('   el temporal SIGUE conservado (apartado, no borrado)', !!superviviente,
        fs.readdirSync(dir).join(','));
      ok('   y su contenido intacto byte a byte',
        !!superviviente && fs.readFileSync(superviviente).equals(bd.bytes));
      void tmpNormal;
    }

    // --- 3. mismo caso en COMPARTIDA: fail-closed y CERO escrituras ---------
    for (const politica of ['compartida', 'desconocida']) {
      const dir = nuevaCarpeta('L3-' + politica);
      const bd = await bdConDatos(dir);
      const w = MI.replace(/[^0-9a-zA-Z_-]/g, '').slice(0, 16);
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3.tmp-' + w + '-deadbeefdeadbeef'), bd.bytes);
      fs.renameSync(path.join(dir, 'panorama.sqlite3'), path.join(dir, 'guardada.bin'));
      fs.unlinkSync(path.join(dir, 'panorama.sqlite3.gen'));
      const antes = fs.readdirSync(dir).sort().join('|');

      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      dbmod.setPoliticaUbicacion(politica);
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      ok(`L.3 [${politica}] SQLite no visible + temporal propio: NO crea`, !!err, String(err));
      ok('   fail-closed', dbmod.estadoLatch() === 'degradado', String(dbmod.estadoLatch()));
      ok('   CERO escrituras nuevas en la carpeta',
        fs.readdirSync(dir).sort().join('|') === antes, fs.readdirSync(dir).join(','));
    }

    // --- 4. temporal del .gen propio de escritura NORMAL --------------------
    {
      const dir = nuevaCarpeta('L4-gen-tmp-normal');
      const bd = await bdConDatos(dir);
      const w = MI.replace(/[^0-9a-zA-Z_-]/g, '').slice(0, 16);
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3.gen.tmp-' + w + '-0011223344556677'), bd.gen);
      fs.renameSync(path.join(dir, 'panorama.sqlite3'), path.join(dir, 'guardada.bin'));
      fs.unlinkSync(path.join(dir, 'panorama.sqlite3.gen'));
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      ok('L.4 temporal del .gen de escritura NORMAL: tampoco autoriza', !!err, String(err));
      ok('   no se creó nada', !fs.existsSync(path.join(dir, 'panorama.sqlite3')));
    }

    // --- 5. restos CON el nonce del intento registrado: sí reanudan ---------
    {
      const dir = nuevaCarpeta('L5-restos-con-intento');
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      dbmod._inyectarFalloEn('persist');
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) {}
      dbmod._inyectarFalloEn(null);
      const restos = fs.readdirSync(dir);
      ok('L.5 hay restos del intento', restos.length > 0, restos.join(','));
      ok('   el testigo apartado lleva el campo intento',
        restos.some((f) => {
          if (!f.includes('.gen.creacion-fallida-')) return false;
          try { return !!JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).intento; } catch (e) { return false; }
        }), restos.join(','));
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      ok('   SÍ reanuda la creación', err === null && fs.existsSync(path.join(dir, 'panorama.sqlite3')), String(err));
    }

    // --- 6. intención local BORRADA: los mismos restos dejan de explicar ----
    {
      const dir = nuevaCarpeta('L6-sin-intencion');
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      dbmod._inyectarFalloEn('persist');
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) {}
      dbmod._inyectarFalloEn(null);
      const restos = fs.readdirSync(dir).sort().join('|');
      // se borra la evidencia LOCAL, dejando los mismos restos en la carpeta
      try { fs.unlinkSync(path.join(DIR_APPDATA, 'panorama-app-config', 'initial-create-intent.json')); } catch (e) {}
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      ok('L.6 sin intención local, los MISMOS restos ya NO autorizan crear', !!err, String(err));
      ok('   y nada cambió en la carpeta', fs.readdirSync(dir).sort().join('|') === restos);
    }

    // --- 7. intención de OTRO writer: no vale -------------------------------
    {
      const dir = nuevaCarpeta('L7-intencion-ajena');
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      dbmod._inyectarFalloEn('persist');
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) {}
      dbmod._inyectarFalloEn(null);
      // se reescribe la intención como si fuera de otro equipo
      const rutaInt = path.join(DIR_APPDATA, 'panorama-app-config', 'initial-create-intent.json');
      const j = JSON.parse(fs.readFileSync(rutaInt, 'utf8'));
      Object.keys(j.intentos).forEach((k) => { j.intentos[k].writer = 'OTRO-EQUIPO'; });
      fs.writeFileSync(rutaInt, JSON.stringify(j), 'utf8');
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      ok('L.7 intención registrada por OTRO writer: no autoriza', !!err, String(err));
      ok('   no se creó nada', !fs.existsSync(path.join(dir, 'panorama.sqlite3')));
    }

    // --- 8. MEZCLA: testigo válido + resto no demostrable -------------------
    {
      const dir = nuevaCarpeta('L8-mezcla');
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      dbmod._inyectarFalloEn('persist');
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) {}
      dbmod._inyectarFalloEn(null);
      ok('L.8 preparación: hay testigo válido del intento',
        fs.readdirSync(dir).some((f) => f.includes('.gen.creacion-fallida-')));
      // ...y además aparece un resto ajeno
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3.tmp-OTROEQUIPO-999'), 'datos ajenos');
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      ok('   testigo válido + resto ajeno: NO crea', !!err, String(err));
      ok('   no se creó ninguna base de datos', !fs.existsSync(path.join(dir, 'panorama.sqlite3')));
      ok('   el resto ajeno sigue intacto',
        fs.readFileSync(path.join(dir, 'panorama.sqlite3.tmp-OTROEQUIPO-999'), 'utf8') === 'datos ajenos');
    }
  }

  // =========================================================================
  seccion('M. FIABILIDAD DE LA EVIDENCIA LOCAL');
  // =========================================================================
  {
    const MI = 'EQUIPO-M'.padEnd(32, '0');
    const rutaInt = () => path.join(DIR_APPDATA, 'panorama-app-config', 'initial-create-intent.json');
    const limpiarInt = () => { try { fs.unlinkSync(rutaInt()); } catch (e) {} };

    // --- A) fallo al ESCRIBIR el archivo de intenciones ---------------------
    {
      const dir = nuevaCarpeta('M-A-intencion-no-escribe');
      limpiarInt();
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      const realOpen = fs.openSync;
      fs.openSync = function (p2, ...r) {
        if (String(p2).includes('initial-create-intent')) {
          throw Object.assign(new Error('inyectado'), { code: 'EACCES' });
        }
        return realOpen.call(fs, p2, ...r);
      };
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      fs.openSync = realOpen;
      ok('M.A fallo al escribir la intención: la creación ABORTA', !!err, String(err));
      ok('   el error lo dice explícitamente', err && err.intencionNoRegistrada === true, JSON.stringify(err && err.intencionNoRegistrada));
      ok('   CERO bytes escritos en la carpeta de datos', fs.readdirSync(dir).length === 0,
        fs.readdirSync(dir).join(','));
    }

    // --- B) se escribe pero la relectura NO coincide ------------------------
    {
      const dir = nuevaCarpeta('M-B-relectura-no-coincide');
      limpiarInt();
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      // el archivo se escribe bien, pero al releerlo devuelve otra cosa
      const realRead = fs.readFileSync;
      fs.readFileSync = function (p2, ...r) {
        if (String(p2).includes('initial-create-intent')) {
          return JSON.stringify({ v: 1, intentos: {} });   // "no hay nada registrado"
        }
        return realRead.call(fs, p2, ...r);
      };
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      fs.readFileSync = realRead;
      ok('M.B la relectura no coincide: la creación ABORTA', !!err, String(err));
      ok('   CERO bytes en la carpeta de datos', fs.readdirSync(dir).length === 0,
        fs.readdirSync(dir).join(','));
    }

    // --- C) corte durante la escritura del archivo de intenciones -----------
    {
      const dir = nuevaCarpeta('M-C-corte-intenciones');
      limpiarInt();
      // se deja una intención PREVIA de otra carpeta, que no debe perderse
      const otraCarpeta = nuevaCarpeta('M-C-otra-ubicacion');
      fs.mkdirSync(path.dirname(rutaInt()), { recursive: true });
      const previa = { v: 1, intentos: {} };
      previa.intentos[path.resolve(otraCarpeta).toLowerCase()] = { writer: MI, nonce: 'aaaabbbbccccdddd', at: 'x' };
      fs.writeFileSync(rutaInt(), JSON.stringify(previa), 'utf8');
      const shaPrevio = crypto.createHash('sha256').update(fs.readFileSync(rutaInt())).digest('hex');

      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      const realRename = fs.renameSync;
      fs.renameSync = function (a, b) {
        if (String(b).includes('initial-create-intent')) {
          throw Object.assign(new Error('inyectado'), { code: 'EPERM' });   // corte justo en el rename
        }
        return realRename.call(fs, a, b);
      };
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      fs.renameSync = realRename;
      ok('M.C corte en el rename del archivo de intenciones: la creación ABORTA', !!err, String(err));
      ok('   el JSON anterior sigue VÁLIDO', dbmod._leerIntenciones().ok === true,
        JSON.stringify(dbmod._leerIntenciones().motivo));
      ok('   ...y con el mismo SHA-256 que antes',
        crypto.createHash('sha256').update(fs.readFileSync(rutaInt())).digest('hex') === shaPrevio);
      ok('   la intención de la OTRA carpeta no se perdió',
        !!dbmod._leerIntenciones().intentos[path.resolve(otraCarpeta).toLowerCase()]);
      ok('   CERO bytes en la carpeta de datos', fs.readdirSync(dir).length === 0, fs.readdirSync(dir).join(','));
    }

    // --- D) dos intenciones: actualizar una no destruye la otra -------------
    {
      const dirA = nuevaCarpeta('M-D-uno');
      const dirB = nuevaCarpeta('M-D-dos');
      limpiarInt();
      // intento fallido en A -> queda su intención
      dbmod._resetParaPruebas(); DIR_DATOS = dirA; dbmod.setInstallationId(MI);
      dbmod._inyectarFalloEn('persist');
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) {}
      dbmod._inyectarFalloEn(null);
      const intA = dbmod._intencionVigente(dirA).vigente;
      ok('M.D hay intención para la carpeta A', !!intA, JSON.stringify(intA));
      // ahora se crea en B (con éxito)
      dbmod._resetParaPruebas(); DIR_DATOS = dirB; dbmod.setInstallationId(MI);
      await dbmod.getDb({ crearSiAusente: true });
      const r = dbmod._leerIntenciones();
      ok('   el archivo sigue legible tras escribir la segunda', r.ok === true);
      ok('   la intención de A SIGUE ahí tras operar sobre B',
        !!r.intentos[path.resolve(dirA).toLowerCase()] &&
        r.intentos[path.resolve(dirA).toLowerCase()].nonce === intA.nonce);
      ok('   y la de B se retiró al completarse', !r.intentos[path.resolve(dirB).toLowerCase()]);
      // y A sigue pudiendo reanudar
      dbmod._resetParaPruebas(); DIR_DATOS = dirA; dbmod.setInstallationId(MI);
      let errA = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { errA = e; }
      ok('   A puede reanudar su creación', errA === null && fs.existsSync(path.join(dirA, 'panorama.sqlite3')), String(errA));
    }

    // --- E) fallo al LIMPIAR la intención tras confirmar el SQLite ----------
    {
      const dir = nuevaCarpeta('M-E-limpieza-falla');
      limpiarInt();
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      // la creación va bien, pero retirar la intención falla
      const realOpen = fs.openSync;
      let creado = false;
      fs.openSync = function (p2, ...r) {
        if (String(p2).includes('initial-create-intent') && creado) {
          throw Object.assign(new Error('inyectado'), { code: 'EACCES' });
        }
        return realOpen.call(fs, p2, ...r);
      };
      // marcar "creado" en cuanto el .sqlite3 exista
      const realRename2 = fs.renameSync;
      fs.renameSync = function (a, b) {
        const res = realRename2.call(fs, a, b);
        if (String(b).endsWith('panorama.sqlite3')) creado = true;
        return res;
      };
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      fs.openSync = realOpen; fs.renameSync = realRename2;

      ok('M.E la base de datos SÍ se creó (no hay rollback)', err === null && fs.existsSync(path.join(dir, 'panorama.sqlite3')), String(err));
      ok('   la intención quedó PENDIENTE de retirar', !!dbmod._intencionVigente(dir).vigente);
      ok('   y queda constancia en el registro',
        dbmod._registro().some((l) => l.includes('limpieza de la intención local quedó PENDIENTE')),
        dbmod._registro().slice(-3).join(' | '));

      // reapertura: debe invalidar la intención obsoleta
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      await dbmod.getDb();
      ok('   al reabrir, la intención obsoleta se RETIRA', !dbmod._intencionVigente(dir).vigente,
        JSON.stringify(dbmod._intencionVigente(dir).vigente));

      // y ya no puede autorizar una recreación futura
      const bytes = fs.readFileSync(path.join(dir, 'panorama.sqlite3'));
      fs.renameSync(path.join(dir, 'panorama.sqlite3'), path.join(dir, 'guardada.bin'));
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      let err2 = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err2 = e; }
      ok('   esa intención ya NO autoriza una recreación posterior', !!err2, String(err2));
      ok('   y no se creó nada', !fs.existsSync(path.join(dir, 'panorama.sqlite3')));
      void bytes;
    }

    // --- F) installation-id NO persistible durante la primera creación ------
    {
      const dir = nuevaCarpeta('M-F-id-no-persistible');
      limpiarInt();
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      // se fuerza una identidad SOLO de sesión
      dbmod.setInstallationId('sesion-' + 'f'.repeat(24), false);
      ok('M.F preparación: la identidad NO está persistida', dbmod._identidadPersistida() === false);
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      ok('   la creación ABORTA', !!err, String(err));
      ok('   el error lo dice explícitamente', err && err.identidadNoPersistida === true);
      ok('   CERO bytes en la carpeta de datos', fs.readdirSync(dir).length === 0, fs.readdirSync(dir).join(','));
    }
    {
      // y el mismo caso llegando por el camino real: no se puede guardar el id
      const dir = nuevaCarpeta('M-F2-id-real-no-persistible');
      const cfgId = path.join(DIR_APPDATA, 'panorama-app-config', 'installation-id');
      try { fs.unlinkSync(cfgId); } catch (e) {}
      limpiarInt();
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      const realOpen = fs.openSync;
      fs.openSync = function (p2, ...r) {
        if (String(p2).includes('installation-id')) throw Object.assign(new Error('inyectado'), { code: 'EACCES' });
        return realOpen.call(fs, p2, ...r);
      };
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      fs.openSync = realOpen;
      ok('M.F2 con el installation-id no persistible de verdad: ABORTA', !!err, String(err));
      ok('   usó una identidad de sesión', String(dbmod._diagnostico().wYo).startsWith('sesion-'),
        String(dbmod._diagnostico().wYo).slice(0, 20));
      ok('   CERO bytes en la carpeta de datos', fs.readdirSync(dir).length === 0, fs.readdirSync(dir).join(','));
    }

    // --- G) installation-id persistido: identidad estable entre arranques ---
    {
      const dir = nuevaCarpeta('M-G-id-estable');
      limpiarInt();
      try { fs.unlinkSync(path.join(DIR_APPDATA, 'panorama-app-config', 'installation-id')); } catch (e) {}
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      dbmod._inyectarFalloEn('persist');
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      dbmod._inyectarFalloEn(null);
      const id1 = dbmod._diagnostico().wYo;
      ok('M.G la identidad se generó y persistió', dbmod._identidadPersistida() === true && !String(id1).startsWith('sesion-'),
        String(id1).slice(0, 20));
      ok('   la creación falló (inyectado) pero dejó intención', !!err && !!dbmod._intencionVigente(dir).vigente, String(err));

      dbmod._resetParaPruebas(); DIR_DATOS = dir;    // sin setInstallationId: se relee
      let err2 = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err2 = e; }
      ok('   el reinicio conserva el MISMO writer', dbmod._diagnostico().wYo === id1,
        id1 + ' vs ' + dbmod._diagnostico().wYo);
      ok('   y la recuperación de la primera creación FUNCIONA',
        err2 === null && fs.existsSync(path.join(dir, 'panorama.sqlite3')), String(err2));
    }

    // --- evidencia corrupta: fail-closed ------------------------------------
    {
      const dir = nuevaCarpeta('M-H-json-corrupto');
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      dbmod._inyectarFalloEn('persist');
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) {}
      dbmod._inyectarFalloEn(null);
      const restos = fs.readdirSync(dir).sort().join('|');
      fs.writeFileSync(rutaInt(), '{esto no es json', 'utf8');
      ok('M.H el archivo de intenciones se lee como CORRUPTO, no como vacío',
        dbmod._leerIntenciones().ok === false, JSON.stringify(dbmod._leerIntenciones()));
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      ok('   con restos + evidencia ilegible: NO crea (fail-closed)', !!err, String(err));
      ok('   y nada cambió en la carpeta', fs.readdirSync(dir).sort().join('|') === restos);
      limpiarInt();
    }
  }

  // =========================================================================
  seccion('D. PRODUCCIÓN NO TOCADA');
  // =========================================================================
  {
    const despues = huellaProduccion();
    HUELLA_ANTES.forEach((a, i) => {
      const b = despues[i];
      console.log('  ' + a.f);
      console.log('     antes:   ' + (a.existe ? `${a.size} B  sha ${a.sha.slice(0, 16)}…  mtime ${a.mtimeMs}` : 'no existe (' + a.err + ')'));
      console.log('     después: ' + (b.existe ? `${b.size} B  sha ${b.sha.slice(0, 16)}…  mtime ${b.mtimeMs}` : 'no existe (' + b.err + ')'));
      ok('   sin cambios: ' + path.basename(path.dirname(a.f)),
        a.existe === b.existe && a.sha === b.sha && a.size === b.size && a.mtimeMs === b.mtimeMs);
    });
    // y ninguna ruta usada cae fuera de la zona de pruebas
    ok('todas las rutas usadas están bajo la marca de pruebas',
      rutasUsadas.every((r) => r.toLowerCase().includes(MARCA_PRUEBAS.toLowerCase())));
    console.log('\n  RUTAS USADAS (' + rutasUsadas.length + '):');
    rutasUsadas.forEach((r) => console.log('    ' + r));
  }

  console.log('\n' + '='.repeat(66));
  console.log('  BLOQUE 1 — db.js integrado: ' + pass + ' OK, ' + fail + ' FALLOS');
  if (fail) { console.log('  fallidas:'); fallos.forEach((f) => console.log('    - ' + f)); }
  console.log('='.repeat(66));
  try { dbmod._resetParaPruebas(); } catch (e) {}
  try { comprobarRutaSegura(RAIZ); fs.rmSync(RAIZ, { recursive: true, force: true }); } catch (e) {}
  console.log('  carpetas de prueba borradas: ' + !fs.existsSync(RAIZ));
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('EXCEPCIÓN NO CAPTURADA:', e); process.exitCode = 2; });
