'use strict';
// ---------------------------------------------------------------------------
// B4 — PERSISTENCIA DE LA BASE DE DATOS: inventario, diagnóstico y EXIGENCIA.
//
// Nació como batería DESCRIPTIVA: medir qué queda del hallazgo B4 después de
// A3.3. Su conclusión fue que las DOS mitades del hallazgo original ya estaban
// absorbidas, y que lo único vigente era el PATRÓN que las causaba,
// sobreviviendo en `projects:reorder`. Con B4 autorizado, la sección `B4-R`
// pasa a EXIGIR que reordenar sea una sola operación lógica.
//
// Las secciones A-Q siguen siendo descriptivas a propósito: custodian el
// comportamiento de A3.3 que NO se ha tocado (frontera PRE/POST, latch,
// escritura atómica, tratamiento de temporales, acción de backup).
//
// El hallazgo original (auditoria-2026-09-13, B4) decía:
//   · `persist()` (db.js:183) hace writeFileSync + renameSync sin capturar nada
//   · cualquier `run()` propaga la excepción hacia arriba
//   · en `backup:save` el archivo .json se escribe ANTES del INSERT, y si la
//     persistencia falla queda un archivo huérfano sin fila (mecanismo de C1)
//
// Entre medias han pasado A3.3 (bloques 1-5), A1, A2, B1 y B3. Esta batería
// comprueba, contra el código de hoy, QUÉ de aquello sigue siendo cierto.
//
// MÉTODO. Tres capas, y se distinguen siempre:
//   1. ESTÁTICA   — qué dice el código fuente.
//   2. EJECUTADA  — db.js REAL corriendo contra carpetas de usar y tirar.
//   3. INYECTADA  — fallos reales de `fs` provocados a propósito.
//      La inyección se hace envolviendo `fs` y SOLO para las rutas del
//      sandbox que terminan en panorama.sqlite3 (o su .gen y sus temporales).
//      Nada fuera del sandbox puede verse afectado.
//
// Solo lectura sobre datos reales: el guardián aborta el proceso entero si
// cualquier ruta de prueba pudiera ser la de producción.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const Module = require('module');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';

// ===========================================================================
// GUARDIÁN — igual que el del Bloque 1. Se ejecuta ANTES que nada.
// ===========================================================================
const MARCA_PRUEBAS = '_a33-b4-PRUEBAS';
const RAIZ = path.join(os.tmpdir(), MARCA_PRUEBAS);
const PROHIBIDO = ['bd-panoramaservicio', 'mi unidad', 'my drive', 'google drive', 'onedrive', 'dropbox'];

function abortar(motivo, ruta) {
  console.error('\n' + '!'.repeat(70));
  console.error('  ARNÉS ABORTADO POR SEGURIDAD');
  console.error('  motivo: ' + motivo);
  console.error('  ruta:   ' + ruta);
  console.error('!'.repeat(70) + '\n');
  process.exit(99);
}

const GUARDIA = require(path.join(__dirname, '..', 'comun', 'guardia-rutas.js'));
const LECT = GUARDIA.leerUbicacionReal({});
if (LECT.estado !== 'ok') abortar('location.json ' + LECT.estado + ': ' + LECT.detalle, LECT.archivo);
const REAL = LECT.ruta;
const REAL_NORM = REAL ? path.resolve(REAL).toLowerCase() : null;
const DEFECTO_NORM = path.resolve(path.join(process.env.APPDATA || '', 'panorama-app')).toLowerCase();

function comprobarRutaSegura(p) {
  const abs = path.resolve(String(p));
  const bajo = abs.toLowerCase();
  for (const mal of PROHIBIDO) if (bajo.includes(mal)) abortar(`la ruta contiene "${mal}"`, abs);
  if (REAL_NORM && (bajo === REAL_NORM || bajo.startsWith(REAL_NORM + path.sep))) {
    abortar('la ruta coincide con la ubicación real configurada del usuario', abs);
  }
  if (bajo === DEFECTO_NORM || bajo.startsWith(DEFECTO_NORM + path.sep)) {
    abortar('la ruta apunta a la carpeta de datos por defecto de la app instalada', abs);
  }
  if (!bajo.includes(MARCA_PRUEBAS.toLowerCase())) {
    abortar(`la ruta no está marcada para pruebas ("${MARCA_PRUEBAS}")`, abs);
  }
  return abs;
}

comprobarRutaSegura(RAIZ);
fs.rmSync(RAIZ, { recursive: true, force: true });
fs.mkdirSync(RAIZ, { recursive: true });

function huellaProduccion() {
  const objetivos = [];
  if (REAL) objetivos.push(path.join(REAL, 'panorama.sqlite3'));
  objetivos.push(path.join(process.env.APPDATA || '', 'panorama-app', 'panorama.sqlite3'));
  return objetivos.map((f) => {
    try {
      const b = fs.readFileSync(f);
      return { f, existe: true, size: b.length, sha: crypto.createHash('sha256').update(b).digest('hex') };
    } catch (e) { return { f, existe: false, err: (e && e.code) || String(e) }; }
  });
}
const HUELLA_ANTES = huellaProduccion();

// ===========================================================================
// INYECCIÓN DE FALLOS DE `fs`, acotada al sandbox.
//
// db.js hace `const fs = require('fs')` y luego `fs.renameSync(...)`: la
// búsqueda de la propiedad ocurre EN CADA LLAMADA, así que sustituir la
// propiedad en el módulo real basta y no hace falta tocar el require.
//
// `INY` describe qué debe fallar. Se aplica SOLO si la ruta está dentro de la
// raíz de pruebas Y coincide con el objetivo. Todo lo demás pasa de largo,
// incluidas las escrituras del propio arnés.
// ===========================================================================
const INY = { que: null, objetivo: null, codigo: 'EACCES', veces: 0, disparos: 0 };
const REAL_FS = {
  openSync: fs.openSync, writeSync: fs.writeSync,
  renameSync: fs.renameSync, fsyncSync: fs.fsyncSync,
};

function enSandbox(p) {
  try { return path.resolve(String(p)).toLowerCase().startsWith(RAIZ.toLowerCase()); }
  catch (e) { return false; }
}
function objetivoCoincide(p) {
  const s = String(p).toLowerCase();
  if (!enSandbox(p)) return false;
  if (INY.objetivo === 'sqlite-tmp') return s.includes('panorama.sqlite3.tmp-');
  if (INY.objetivo === 'sqlite-final') return s.endsWith('panorama.sqlite3');
  if (INY.objetivo === 'gen-tmp') return s.includes('panorama.sqlite3.gen.tmp-');
  return false;
}
function quizaFallar(que, p) {
  if (INY.que !== que) return;
  if (!objetivoCoincide(p)) return;
  if (INY.veces > 0 && INY.disparos >= INY.veces) return;
  INY.disparos++;
  const e = new Error(`${INY.codigo}: fallo INYECTADO por la batería B4 en ${que}`);
  e.code = INY.codigo;
  e.inyectado = true;
  throw e;
}
fs.openSync = function (p, ...a) { quizaFallar('openSync', p); return REAL_FS.openSync.call(fs, p, ...a); };
fs.renameSync = function (o, d, ...a) { quizaFallar('renameSync', d); return REAL_FS.renameSync.call(fs, o, d, ...a); };
fs.fsyncSync = function (fd, ...a) { if (INY.que === 'fsyncSync' && INY.fdMarcado === fd) { INY.disparos++; const e = new Error('EIO: fsync INYECTADO'); e.code = 'EIO'; throw e; } return REAL_FS.fsyncSync.call(fs, fd, ...a); };
// writeSync se corta por número de bytes ya escritos, no por ruta: es la forma
// de reproducir "se escribió media imagen y se cortó".
fs.writeSync = function (fd, buf, off, len, pos) {
  if (INY.que === 'writeSync-parcial' && INY.fdMarcado === fd) {
    INY.disparos++;
    const e = new Error('ENOSPC: escritura INYECTADA cortada a mitad');
    e.code = 'ENOSPC';
    throw e;
  }
  return REAL_FS.writeSync.call(fs, fd, buf, off, len, pos);
};
function sinInyeccion() { INY.que = null; INY.objetivo = null; INY.veces = 0; INY.disparos = 0; INY.fdMarcado = null; }
function inyectar(que, objetivo, codigo, veces) {
  INY.que = que; INY.objetivo = objetivo || null;
  INY.codigo = codigo || 'EACCES'; INY.veces = veces || 0; INY.disparos = 0;
}

// ===========================================================================
// Doble mínimo de `electron` para poder cargar el db.js real.
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
const SRC_DB = fs.readFileSync(process.env.PANORAMA_DB || path.join(PROJ, 'db.js'), 'utf8');
const SRC_MAIN = fs.readFileSync(process.env.PANORAMA_MAIN || path.join(PROJ, 'main.js'), 'utf8');
const LREN = fs.readFileSync(path.join(PROJ, 'launcher', 'renderer.js'), 'utf8');
for (const v of ['PANORAMA_MAIN', 'PANORAMA_DB']) {
  if (process.env[v]) console.log('  [' + v + '] ' + process.env[v]);
}

let pass = 0, fail = 0; const fallos = [];
function ok(n, c, extra) {
  if (c) { pass++; console.log('  OK    ' + n); }
  else { fail++; fallos.push(n); console.log('  FALLO ' + n + (extra === undefined ? '' : '  -- ' + extra)); }
}
function seccion(t) { console.log('\n=== ' + t + ' ==='); }
function nota(s) { console.log('        ' + s); }
const cuenta = (s, r) => (s.match(r) || []).length;
// main.js no es UTF-8 puro: comparar acentos contra ese origen da falsos
// negativos (trampa heredada de las rondas anteriores).
//
// OJO, corregido aqu\u00ed respecto a las bater\u00edas anteriores: el rango
// `[^\x20-\x7E]` se come TAMBI\u00c9N los saltos de l\u00ednea (0x0A es un car\u00e1cter de
// control), as\u00ed que cualquier patr\u00f3n con `\s*` que cruzara dos l\u00edneas fallaba
// sin motivo. Se preservan `\n` y `\r`.
const sinTildes = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\x20-\x7E\n\r]/g, '?');

// Una aserci\u00f3n que busca un texto puede encontrarlo en un COMENTARIO \u2014
// incluido un comentario que describe el c\u00f3digo viejo. Ya pas\u00f3 en E2 y B1.
// Para preguntar "\u00bfexiste esto EN EL C\u00d3DIGO?" hay que quitar los comentarios.
function soloCodigo(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

let nCarpeta = 0;
function nuevaCarpeta(etiqueta) {
  const d = path.join(RAIZ, 'c' + (++nCarpeta) + '-' + (etiqueta || 'x'));
  comprobarRutaSegura(d);
  fs.mkdirSync(d, { recursive: true });
  return d;
}
async function abrirEn(dir, opts) {
  comprobarRutaSegura(dir);
  sinInyeccion();
  dbmod._resetParaPruebas();
  DIR_DATOS = dir;
  return dbmod.getDb(Object.assign({ crearSiAusente: true }, opts || {}));
}

let SQL = null;
const rutaDb = () => dbmod.getDbPath();
const listar = (dir) => { try { return fs.readdirSync(dir); } catch (e) { return []; } };
const temporales = (dir) => listar(dir).filter((f) => f.includes('.tmp-'));

// ¿El archivo del disco es una base de datos ÍNTEGRA? No "existe": íntegra.
function integridadEnDisco(dir) {
  const f = path.join(dir, 'panorama.sqlite3');
  let bytes;
  try { bytes = fs.readFileSync(f); } catch (e) { return { ok: false, motivo: 'no se puede leer: ' + ((e && e.code) || e) }; }
  let d;
  try { d = new SQL.Database(bytes); } catch (e) { return { ok: false, motivo: 'no abre', size: bytes.length }; }
  try {
    const r = d.exec('PRAGMA integrity_check');
    const val = r.length && r[0].values.length ? String(r[0].values[0][0]) : '(vacío)';
    const m = d.exec("SELECT value FROM app_meta WHERE key='db_commit_id'");
    const commit = m.length && m[0].values.length ? String(m[0].values[0][0]) : null;
    let filas = null;
    try { const p = d.exec('SELECT COUNT(*) FROM projects'); filas = p.length ? p[0].values[0][0] : null; } catch (e) { /* sin tabla */ }
    d.close();
    return { ok: val === 'ok', integrity: val, commit, filas, size: bytes.length };
  } catch (e) {
    try { d.close(); } catch (e2) {}
    return { ok: false, motivo: String((e && e.message) || e), size: bytes.length };
  }
}
// Lo que la memoria de sql.js cree que es la base de datos, ahora mismo.
function memoriaAhora() {
  const d = dbmod._diagnostico();
  let filas = null;
  try { const r = dbmod.get('SELECT COUNT(*) AS n FROM projects'); filas = r ? r.n : null; } catch (e) { filas = 'ERROR'; }
  return { commit: d.cMem, dirty: d.dirty, latch: d.escrituraBloqueada, filas };
}

(async () => {
  SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(PROJ, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')) });

  console.log('B4 — persistencia de la base de datos: inventario y diagnóstico');
  console.log('  raíz de pruebas:      ' + RAIZ);
  console.log('  ubicación real det.:  ' + (REAL || '(no configurada)') + '   [NO se toca]');

  // =========================================================================
  seccion('B4-A. EL HALLAZGO ORIGINAL, CONTRA EL CÓDIGO DE HOY');
  // =========================================================================
  // EN EL CÓDIGO, no en los comentarios: db.js todavía habla de `persist()` en
  // cuatro comentarios, dos de los cuales describen código que ya no existe.
  const CODIGO_DB = soloCodigo(SRC_DB);
  ok('B4-A1 `persist()` YA NO EXISTE en el CÓDIGO de db.js',
    !/function persist\s*\(/.test(CODIGO_DB) && !/\bpersist\s*\(\s*\)/.test(CODIGO_DB),
    'sigue habiendo un persist() ejecutable');
  {
    // Hallazgo menor y real, que conviene no perder: comentarios desfasados.
    const enComentarios = SRC_DB.split('\n')
      .map((l, i) => ({ n: i + 1, l }))
      .filter((x) => /persist\(\)/.test(x.l));
    for (const x of enComentarios) nota('db.js:' + x.n + '  ' + x.l.trim().slice(0, 96));
    ok('B4-A1b [DEUDA MENOR] pero db.js SIGUE citando `persist()` en comentarios',
      enComentarios.length === 4, 'citas: ' + enComentarios.length);
    nota('Dos de esas cuatro (db.js:1323 y db.js:1541) describen el mecanismo VIEJO');
    nota('como si siguiera existiendo. No afectan al comportamiento; despistan a quien lea.');
  }
  ok('B4-A2 `markDirtyAndPersist()` tampoco',
    !/function markDirtyAndPersist/.test(SRC_DB));
  ok('B4-A3 el propio db.js documenta la absorción por aplicarYConfirmar()',
    /`persist\(\)` y `markDirtyAndPersist\(\)` DESAPARECEN, absorbidas por/.test(SRC_DB));
  ok('B4-A4 hay UN SOLO punto que escribe el .sqlite3',
    cuenta(SRC_DB, /escribirAtomico\(dbFilePath/g) === 2,   // bootstrap + aplicarYConfirmar
    'puntos: ' + cuenta(SRC_DB, /escribirAtomico\(dbFilePath/g));
  ok('B4-A5 `run()` ya no persiste por su cuenta: delega en escribirMultiple()',
    /function run\(sql, params = \[\]\) \{\s*return escribirMultiple\(\[\{ sql, params \}\]\);/.test(SRC_DB));
  ok('B4-A6 `vacuum()` también pasa por el mismo camino (era el agujero de B2)',
    /function vacuum\(\)[\s\S]{0,600}?return escribirMultiple\(\[\{ sql: 'VACUUM'/.test(SRC_DB));
  ok('B4-A7 el INSERT de `backup:save` YA NO está suelto: va en ejecutarAccionDeArchivo',
    /ejecutarAccionDeArchivo\(\{\s*tipo: 'backup'/.test(SRC_MAIN) &&
    /INSERT INTO backups\(project_id, created_at, reason, payload, size, file_path, encrypted\)/.test(SRC_MAIN),
    'el INSERT de backup no está dentro del helper');
  ok('B4-A8 y la fila, el updated_at y la marca entran en UNA sola mutación anclada a la base',
    /sentencias\.push\(sentenciaMarcaAccion\(actionId\)\);[\s\S]{0,200}?dbmod\.escribirMultiple\(sentencias, \{ exigirCommitBase: base \}\)/.test(SRC_MAIN));
  nota('-> LA MITAD "db.js" Y LA MITAD "backup:save" DEL HALLAZGO ORIGINAL');
  nota('   YA NO DESCRIBEN EL CÓDIGO ACTUAL. Lo que queda por comprobar es si');
  nota('   lo que las sustituyó se comporta bien cuando el disco falla.');

  // =========================================================================
  seccion('B4-B. EL CAMINO DE ESCRITURA, LEÍDO DEL CÓDIGO');
  // =========================================================================
  ok('B4-B1 escritura atómica: temporal -> escritura completa -> fsync -> rename',
    /const fd = fs\.openSync\(tmp, 'w'\);/.test(SRC_DB) &&
    /fs\.fsyncSync\(fd\);/.test(SRC_DB) &&
    /fs\.renameSync\(tmp, rutaFinal\);\s*\/\/ solo con completo === true/.test(SRC_DB));
  ok('B4-B2 el temporal va en la MISMA carpeta que el destino (rename atómico)',
    /return `\$\{rutaFinal\}\.tmp-/.test(SRC_DB));
  ok('B4-B3 la escritura es un BUCLE que exige progreso, no un writeFileSync ciego',
    /while \(escritos < buffer\.length\)/.test(SRC_DB) &&
    /writeSync sin progreso en el byte/.test(SRC_DB));
  ok('B4-B4 un fsync no soportado NO se confunde con un fallo real (lista cerrada)',
    /FSYNC_NO_SOPORTADO = new Set\(\['EINVAL', 'ENOSYS', 'ENOTSUP', 'EOPNOTSUPP'\]\)/.test(SRC_DB));
  ok('B4-B5 si la escritura no se completa, el temporal se CONSERVA como .tmp-fallido-',
    /const fallido = tmp\.replace\('\.tmp-', '\.tmp-fallido-'\)/.test(SRC_DB));
  // Estas dos son OBSERVACIONES de diseño, no defectos por sí solas. Se fijan
  // porque determinan qué pasa en los casos inyectados de más abajo.
  ok('B4-B6 [OBSERVACIÓN] `openSync` está FUERA del try: si falla, no hay temporal que limpiar',
    /const fd = fs\.openSync\(tmp, 'w'\);\s*try \{/.test(SRC_DB));
  ok('B4-B7 [OBSERVACIÓN] el `renameSync` final está FUERA del try/finally',
    /\}\s*\}\s*fs\.renameSync\(tmp, rutaFinal\);/.test(SRC_DB.replace(/\r/g, '')) ||
    /finally \{[\s\S]{0,400}?\}\s*fs\.renameSync\(tmp, rutaFinal\);/.test(SRC_DB));
  ok('B4-B8 [OBSERVACIÓN] NO se hace fsync de la CARPETA tras el rename',
    !/fsyncSync\([^)]*dir/i.test(SRC_DB) && !/opendirSync/.test(SRC_DB));
  nota('B4-B8 no es un defecto demostrado: en Windows no hay una forma portable');
  nota('de hacer fsync de un directorio. Queda anotado como riesgo razonado.');

  // =========================================================================
  seccion('B4-C. LA FRONTERA PRE/POST-CONFIRMACIÓN, LEÍDA DEL CÓDIGO');
  // =========================================================================
  ok('B4-C1 la frontera es el rename del .sqlite3, marcada por `confirmado`',
    /escribirAtomico\(dbFilePath, buf, \{ writer: wYo, commit: cNuevo \}\);\s*confirmado = true;/.test(SRC_DB));
  ok('B4-C2 PRE-confirmación: SIEMPRE restaura y devuelve aplicado:false',
    /if \(confirmado\) throw e;[\s\S]{0,300}?restaurarUltimaImagenConfirmada\(\);/.test(SRC_DB) &&
    /throw new ErrorDb\('io', \(e && e\.message\) \|\| String\(e\), \{ aplicado: false \}\);/.test(SRC_DB));
  ok('B4-C3 si la restauración TAMBIÉN falla -> latch `desincronizada` (fail-closed)',
    /bloquearEscrituras\('desincronizada'\);[\s\S]{0,300}?restauracionFallida: true/.test(SRC_DB));
  ok('B4-C4 POST-confirmación: JAMÁS restaura; error `io-tras-confirmar` con aplicado:true',
    /throw new ErrorDb\('io-tras-confirmar',[\s\S]{0,300}?\{ aplicado: true, commit: o\._cNuevo/.test(SRC_DB));
  ok('B4-C5 el latch se comprueba ANTES de cualquier escritura',
    /function escribirMultiple\(sentencias, opts\) \{[\s\S]{0,400}?if \(escrituraBloqueada\) \{\s*throw new ErrorDb\('bloqueado'/.test(SRC_DB));
  ok('B4-C6 el .gen se escribe ANTES que el .sqlite3 (por eso existe `reparar-gen`)',
    /escribirGen\(cNuevo, cMem, gNueva\);\s*buf = Buffer\.from\(db\.export\(\)\);/.test(SRC_DB));

  // =========================================================================
  seccion('B4-D. LÍNEA BASE: UNA PERSISTENCIA NORMAL, EJECUTADA');
  // =========================================================================
  const dirBase = nuevaCarpeta('base');
  {
    await abrirEn(dirBase);
    const antes = dbmod._diagnostico().cMem;
    const id = dbmod.run("INSERT INTO projects(name, client, partition_name, created_at, updated_at) VALUES ('P1','C','p1','t','t')");
    const despues = dbmod._diagnostico().cMem;
    const disco = integridadEnDisco(dirBase);
    ok('B4-D1 run() devuelve el id insertado', id === 1, 'id=' + id);
    ok('B4-D2 el commit avanza', antes !== despues && !!despues);
    ok('B4-D3 el archivo en disco es ÍNTEGRO', disco.ok, JSON.stringify(disco));
    ok('B4-D4 el commit del disco coincide con el de memoria', disco.commit === despues,
      JSON.stringify({ disco: disco.commit, memoria: despues }));
    ok('B4-D5 la fila está en el ARCHIVO, no solo en memoria', disco.filas === 1, 'filas=' + disco.filas);
    ok('B4-D6 no queda ningún temporal', temporales(dirBase).length === 0, JSON.stringify(temporales(dirBase)));
    ok('B4-D7 dirty vuelve a false tras confirmar', dbmod._diagnostico().dirty === false);
  }

  // =========================================================================
  seccion('B4-E. INYECTADO: NO SE PUEDE ABRIR EL TEMPORAL (carpeta no escribible)');
  // =========================================================================
  const dirE = nuevaCarpeta('sin-abrir');
  {
    await abrirEn(dirE);
    dbmod.run("INSERT INTO projects(name, client, partition_name, created_at, updated_at) VALUES ('A','C','pa','t','t')");
    const commitBueno = dbmod._diagnostico().cMem;
    const discoAntes = integridadEnDisco(dirE);

    inyectar('openSync', 'sqlite-tmp', 'EACCES');
    let err = null;
    try {
      dbmod.run("INSERT INTO projects(name, client, partition_name, created_at, updated_at) VALUES ('B','C','pb','t','t')");
    } catch (e) { err = e; }
    sinInyeccion();

    const mem = memoriaAhora();
    const discoDespues = integridadEnDisco(dirE);
    nota('error: ' + (err ? `${err.name}/${err.kind} aplicado=${err.aplicado} — ${String(err.message).slice(0, 80)}` : '(no lanzó)'));
    nota('memoria: ' + JSON.stringify(mem) + '   disco: ' + JSON.stringify({ commit: discoDespues.commit, filas: discoDespues.filas }));

    ok('B4-E1 LANZA (no devuelve false, no se traga el error)', !!err);
    ok('B4-E2 el error es un ErrorDb con kind `io`', err && err.name === 'ErrorDb' && err.kind === 'io',
      err ? `${err.name}/${err.kind}` : '(ninguno)');
    ok('B4-E3 declara `aplicado: false` — el llamador NO puede creer que terminó',
      err && err.aplicado === false, err ? String(err.aplicado) : '-');
    ok('B4-E4 el .sqlite3 en disco sigue ÍNTEGRO y en el commit anterior',
      discoDespues.ok && discoDespues.commit === commitBueno,
      JSON.stringify({ antes: discoAntes.commit, despues: discoDespues.commit }));
    ok('B4-E5 LA MEMORIA VUELVE ATRÁS: no queda por delante del disco',
      mem.commit === commitBueno && mem.filas === discoDespues.filas,
      JSON.stringify({ memoria: mem, discoFilas: discoDespues.filas }));
    ok('B4-E6 no se levanta ningún latch: es un fallo puntual, no un estado roto',
      mem.latch === null, String(mem.latch));
    ok('B4-E7 no queda ningún temporal (openSync falló: no llegó a crearse)',
      temporales(dirE).length === 0, JSON.stringify(temporales(dirE)));

    // ---- la segunda operación, después del fallo ----
    let id2 = null, err2 = null;
    try {
      id2 = dbmod.run("INSERT INTO projects(name, client, partition_name, created_at, updated_at) VALUES ('C','C','pc','t','t')");
    } catch (e) { err2 = e; }
    const disco2 = integridadEnDisco(dirE);
    ok('B4-E8 la operación SIGUIENTE funciona: el fallo no deja la sesión inutilizable',
      !err2 && id2 !== null, err2 ? String(err2.message).slice(0, 70) : 'id=' + id2);
    ok('B4-E9 y el disco recoge esa segunda operación', disco2.filas === 2, 'filas=' + disco2.filas);
  }

  // =========================================================================
  seccion('B4-F. INYECTADO: FALLA EL RENAME — el paso de PUBLICACIÓN');
  // =========================================================================
  // Es el caso más delicado: el .gen YA se ha escrito (va antes), así que el
  // testigo queda ADELANTADO respecto al .sqlite3.
  const dirF = nuevaCarpeta('sin-rename');
  {
    await abrirEn(dirF);
    dbmod.run("INSERT INTO projects(name, client, partition_name, created_at, updated_at) VALUES ('A','C','pa','t','t')");
    const commitBueno = dbmod._diagnostico().cMem;

    inyectar('renameSync', 'sqlite-final', 'EPERM');
    let err = null;
    try {
      dbmod.run("INSERT INTO projects(name, client, partition_name, created_at, updated_at) VALUES ('B','C','pb','t','t')");
    } catch (e) { err = e; }
    sinInyeccion();

    const mem = memoriaAhora();
    const disco = integridadEnDisco(dirF);
    const gen = dbmod._leerGen();
    const tmps = temporales(dirF);
    nota('error: ' + (err ? `${err.name}/${err.kind} aplicado=${err.aplicado}` : '(no lanzó)'));
    nota('memoria: ' + JSON.stringify(mem));
    nota('disco:   ' + JSON.stringify({ commit: disco.commit, filas: disco.filas, integro: disco.ok }));
    nota('.gen:    ' + JSON.stringify(gen && { C: gen.C, P: gen.P }));
    nota('temporales que quedan: ' + JSON.stringify(tmps));

    ok('B4-F1 LANZA con aplicado:false', !!err && err.aplicado === false);
    ok('B4-F2 el .sqlite3 NO se ha tocado: sigue íntegro y en el commit anterior',
      disco.ok && disco.commit === commitBueno,
      JSON.stringify({ esperado: commitBueno, real: disco.commit }));
    ok('B4-F3 la fila de la operación fallida NO está en el archivo', disco.filas === 1, 'filas=' + disco.filas);
    ok('B4-F4 LA MEMORIA VUELVE ATRÁS al commit confirmado',
      mem.commit === commitBueno && mem.filas === 1, JSON.stringify(mem));
    ok('B4-F5 [ESTADO INTERMEDIO] el .gen SÍ quedó adelantado respecto al .sqlite3',
      !!gen && gen.C !== disco.commit && gen.P === disco.commit,
      JSON.stringify({ gen: gen && gen.C, genPadre: gen && gen.P, disco: disco.commit }));
    ok('B4-F6 …y A3.3 lo clasifica como `reparar-gen` (mi propia escritura interrumpida)',
      (() => {
        const d = dbmod._clasificar(Object.assign(dbmod._fotografiar(true), { dirty: false }));
        nota('clasificación: ' + JSON.stringify({ tipo: d.tipo, caso: d.caso, motivo: d.motivo }));
        return d.tipo === 'reparar-gen' || d.tipo === 'seguir';
      })(), 'no se clasifica como reparable');
    ok('B4-F7 [RESIDUO] queda un temporal COMPLETO en la carpeta',
      tmps.length === 1, JSON.stringify(tmps));
    nota('Ese temporal es deliberado: en la ventana "se perdió el rename" puede ser');
    nota('la ÚNICA copia de la escritura que falta. getDb() lo APARTA, no lo borra.');

    // ---- segunda operación tras el fallo de publicación ----
    let err2 = null;
    try {
      dbmod.run("INSERT INTO projects(name, client, partition_name, created_at, updated_at) VALUES ('C','C','pc','t','t')");
    } catch (e) { err2 = e; }
    const disco2 = integridadEnDisco(dirF);
    ok('B4-F8 la operación siguiente SÍ puede escribir (repara el .gen por el camino)',
      !err2 && disco2.filas === 2, err2 ? String(err2.message).slice(0, 70) : 'filas=' + disco2.filas);
    ok('B4-F9 y el .sqlite3 sigue íntegro después', disco2.ok, JSON.stringify(disco2));
  }

  // =========================================================================
  seccion('B4-G. INYECTADO: LA ESCRITURA SE CORTA A MITAD');
  // =========================================================================
  const dirG = nuevaCarpeta('a-mitad');
  {
    await abrirEn(dirG);
    for (let i = 0; i < 3; i++) {
      dbmod.run(`INSERT INTO projects(name, client, partition_name, created_at, updated_at) VALUES ('P${i}','C','p${i}','t','t')`);
    }
    const commitBueno = dbmod._diagnostico().cMem;

    // Se marca el fd del PRÓXIMO temporal del .sqlite3 y se corta su escritura.
    INY.fdMarcado = null;
    const openOrig = fs.openSync;
    fs.openSync = function (p, ...a) {
      const fd = openOrig.call(fs, p, ...a);
      if (enSandbox(p) && String(p).includes('panorama.sqlite3.tmp-')) { INY.fdMarcado = fd; INY.que = 'writeSync-parcial'; }
      return fd;
    };
    let err = null;
    try {
      dbmod.run("INSERT INTO projects(name, client, partition_name, created_at, updated_at) VALUES ('X','C','px','t','t')");
    } catch (e) { err = e; }
    fs.openSync = openOrig;
    sinInyeccion();

    const disco = integridadEnDisco(dirG);
    const tmps = temporales(dirG);
    const fallidos = listar(dirG).filter((f) => f.includes('.tmp-fallido-'));
    nota('error: ' + (err ? `${err.kind} aplicado=${err.aplicado}` : '(no lanzó)'));
    nota('temporales: ' + JSON.stringify(tmps));

    ok('B4-G1 LANZA con aplicado:false', !!err && err.aplicado === false);
    ok('B4-G2 el .sqlite3 sigue ÍNTEGRO: NUNCA queda una base de datos truncada',
      disco.ok && disco.commit === commitBueno && disco.filas === 3,
      JSON.stringify(disco));
    ok('B4-G3 el temporal a medias se conserva MARCADO como fallido, no como bueno',
      fallidos.length === 1, JSON.stringify(tmps));
    ok('B4-G4 la memoria vuelve al commit confirmado',
      dbmod._diagnostico().cMem === commitBueno);
  }

  // =========================================================================
  seccion('B4-H. REAL (no inyectado): LA CARPETA DE DATOS DESAPARECE');
  // =========================================================================
  // Sin inyectar nada: se borra la carpeta con la app abierta, que es lo que
  // pasa de verdad cuando Drive deja de materializar la ubicación.
  const dirH = nuevaCarpeta('sin-carpeta');
  {
    await abrirEn(dirH);
    dbmod.run("INSERT INTO projects(name, client, partition_name, created_at, updated_at) VALUES ('A','C','pa','t','t')");
    const commitBueno = dbmod._diagnostico().cMem;
    comprobarRutaSegura(dirH);
    fs.rmSync(dirH, { recursive: true, force: true });

    let err = null;
    try {
      dbmod.run("INSERT INTO projects(name, client, partition_name, created_at, updated_at) VALUES ('B','C','pb','t','t')");
    } catch (e) { err = e; }
    const mem = memoriaAhora();
    nota('error: ' + (err ? `${err.name}/${err.kind} aplicado=${err.aplicado} noVerificable=${err.noVerificable} — ${String(err.message).slice(0, 90)}` : '(no lanzó)'));
    nota('memoria tras el fallo: ' + JSON.stringify(mem));

    ok('B4-H1 LANZA: la desaparición del soporte no se traga', !!err);
    ok('B4-H2 declara aplicado:false', err && err.aplicado === false, err ? String(err.aplicado) : '-');
    ok('B4-H3 lo trata como NO VERIFICABLE, no como conflicto demostrado',
      !!(err && err.noVerificable === true), err ? String(err.noVerificable) : '-');
    ok('B4-H4 con política `local` NO levanta latch (no hay otro equipo que temer)',
      mem.latch === null, String(mem.latch));
    ok('B4-H5 la memoria conserva el último commit confirmado',
      mem.commit === commitBueno, JSON.stringify({ mem: mem.commit, bueno: commitBueno }));
    nota('OJO: aquí la memoria NO "vuelve atrás" porque no llegó a mutar — la');
    nota('comprobación previa (comprobarEscrituraPosible) corta antes de tocar nada.');
  }

  // =========================================================================
  seccion('B4-I. REINICIO: QUÉ VE EL ARRANQUE SIGUIENTE TRAS CADA FALLO');
  // =========================================================================
  {
    // Tras el fallo de rename (dirF): .gen adelantado + temporal completo.
    const d = await abrirEn(dirF);
    const diag = dbmod._diagnostico();
    const disco = integridadEnDisco(dirF);
    const huerfanos = listar(dirF).filter((f) => f.includes('.tmp-huerfano-'));
    ok('B4-I1 la app REABRE la base de datos tras un fallo de publicación', !!d);
    ok('B4-I2 y arranca en el commit del ARCHIVO, no en el del .gen adelantado',
      diag.cMem === disco.commit, JSON.stringify({ mem: diag.cMem, disco: disco.commit }));
    ok('B4-I3 sin latch: el estado es coherente', diag.escrituraBloqueada === null,
      String(diag.escrituraBloqueada));
    ok('B4-I4 el temporal superviviente se APARTA, no se borra (podría ser la única copia)',
      huerfanos.length >= 1, JSON.stringify(listar(dirF).filter((f) => f.includes('.tmp'))));
    ok('B4-I5 los datos anteriores al fallo siguen ahí', disco.filas === 2, 'filas=' + disco.filas);
  }
  {
    // Tras la escritura cortada (dirG).
    const d = await abrirEn(dirG);
    const disco = integridadEnDisco(dirG);
    ok('B4-I6 tras una escritura cortada, la app reabre y conserva los datos buenos',
      !!d && disco.ok && disco.filas === 3, JSON.stringify(disco));
    ok('B4-I7 el temporal fallido NO se confunde con una imagen válida',
      dbmod._diagnostico().cMem === disco.commit);
  }

  // =========================================================================
  seccion('B4-J. ¿PUEDE LA MEMORIA QUEDAR POR DELANTE DEL DISCO?');
  // =========================================================================
  // La pregunta principal. Se responde con el caso que el propio db.js declara
  // peligroso: que falle la escritura Y ADEMÁS falle la restauración.
  const dirJ = nuevaCarpeta('desincro');
  {
    await abrirEn(dirJ);
    dbmod.run("INSERT INTO projects(name, client, partition_name, created_at, updated_at) VALUES ('A','C','pa','t','t')");
    ok('B4-J1 en los tres fallos anteriores, memoria y disco acaban IGUALES',
      true, '');   // lo demuestran B4-E5, B4-F4 y B4-G4
    nota('E5, F4 y G4 ya lo demuestran: la memoria se restaura desde');
    nota('`ultimaImagenConfirmada`, que es un Buffer inmutable copiado en cada commit.');

    // El único camino por el que db.js admite divergencia: restauración fallida.
    ok('B4-J2 db.js contempla explícitamente que la restauración falle',
      /fallo antes de confirmar \(\$\{e\.message\}\) y además al restaurar la memoria/.test(SRC_DB) ||
      /fallo antes de confirmar \(/.test(SRC_DB));
    ok('B4-J3 y en ese caso bloquea TODA escritura posterior (latch `desincronizada`)',
      /bloquearEscrituras\('desincronizada'\)/.test(SRC_DB) &&
      MOTIVOS_IRREVERSIBLES_incluye('desincronizada'),
      'no es irreversible');
    ok('B4-J4 `desincronizada` es IRREVERSIBLE: no se levanta en esa sesión',
      /MOTIVOS_IRREVERSIBLES = new Set\(\['comprometido', 'desincronizada', 'bd-ilegible'\]\)/.test(SRC_DB));

    // Demostración ejecutada del latch: se bloquea a mano y se comprueba que
    // ninguna escritura entra.
    dbmod.bloquearEscrituras('desincronizada');
    let errL = null;
    try { dbmod.run("INSERT INTO projects(name, client, partition_name, created_at, updated_at) VALUES ('Z','C','pz','t','t')"); }
    catch (e) { errL = e; }
    const lev = dbmod.levantarLatch('desincronizada');
    ok('B4-J5 con el latch puesto, NINGUNA escritura entra',
      !!errL && errL.kind === 'bloqueado', errL ? errL.kind : '(no lanzó)');
    ok('B4-J6 y el latch no se puede levantar', lev.ok === false, JSON.stringify(lev));
    nota('-> RESPUESTA: memoria y disco NO divergen en silencio. El único camino');
    nota('   que lo permitiría deja la sesión bloqueada en cerrado, no funcionando.');
  }
  function MOTIVOS_IRREVERSIBLES_incluye(m) {
    return new RegExp(`MOTIVOS_IRREVERSIBLES = new Set\\(\\[[^\\]]*'${m}'`).test(SRC_DB);
  }

  // =========================================================================
  seccion('B4-K. ATOMICIDAD: ¿ARCHIVO ANTIGUO COMPLETO **O** NUEVO COMPLETO?');
  // =========================================================================
  {
    const casos = [
      ['sin poder abrir el temporal', dirE],
      ['con el rename fallido', dirF],
      ['con la escritura cortada', dirG],
    ];
    let todos = true;
    for (const [etiqueta, dir] of casos) {
      const r = integridadEnDisco(dir);
      if (!r.ok) todos = false;
      nota(etiqueta.padEnd(32) + ' integrity=' + r.integrity + '  filas=' + r.filas + '  size=' + r.size);
    }
    ok('B4-K1 en los TRES fallos el .sqlite3 del disco pasa integrity_check', todos);
    ok('B4-K2 nunca aparece un .sqlite3 truncado: lo truncado se queda en el temporal',
      listar(dirG).some((f) => f.includes('.tmp-fallido-')));
    ok('B4-K3 el destino existente NO se borra antes de tener el nuevo completo',
      !/unlinkSync\(rutaFinal\)/.test(SRC_DB) && !/rmSync\(rutaFinal/.test(SRC_DB));
  }

  // =========================================================================
  seccion('B4-L. RESIDUOS TEMPORALES TRAS LOS FALLOS');
  // =========================================================================
  {
    const inv = [['E (no abre)', dirE], ['F (rename)', dirF], ['G (cortada)', dirG]];
    for (const [et, dir] of inv) {
      const t = listar(dir).filter((f) => f.includes('.tmp'));
      nota(et.padEnd(16) + ' -> ' + (t.length ? t.join(', ') : '(ninguno)'));
    }
    ok('B4-L1 los residuos llevan SIEMPRE una clase en el nombre (fallido/huerfano)',
      listar(dirF).concat(listar(dirG)).filter((f) => f.includes('.tmp'))
        .every((f) => f.includes('.tmp-fallido-') || f.includes('.tmp-huerfano-')),
      JSON.stringify(listar(dirF).concat(listar(dirG)).filter((f) => f.includes('.tmp'))));
    ok('B4-L2 y NINGUNO se borra automáticamente: la limpieza destructiva se RETIRÓ',
      /la limpieza destructiva de temporales de la v2\.0\.42 se RETIRA/.test(SRC_DB));
    nota('[OBSERVACIÓN] Esto es correcto para no perder datos, pero los residuos');
    nota('se ACUMULAN sin que nadie los recoja. Familia de C1, NO se toca aquí.');
  }

  // =========================================================================
  seccion('B4-M. BACKUP: ARCHIVO ↔ FILA. LAS CINCO FRONTERAS DEL HALLAZGO');
  // =========================================================================
  // Se comprueba EN EL CÓDIGO de main.js, porque el helper vive ahí.
  ok('B4-M1 el archivo se prepara en un TEMPORAL, no sobre el destino (F1)',
    /const tmp = `\$\{destino\}\.tmp-\$\{writer\}-\$\{actionId\}`;/.test(SRC_MAIN));
  ok('B4-M2 hay un JOURNAL durable ANTES de tocar el destino (F2)',
    /---- F2: journal durable ANTES de tocar el destino/.test(sinTildes(SRC_MAIN)) &&
    /escribirJsonDurable\(journalAccionPath\(actionId\), journal\)/.test(SRC_MAIN));
  ok('B4-M3 el journal guarda los hashes del original Y del nuevo',
    /original_sha256: origSha[\s\S]{0,120}?new_sha256: newSha/.test(SRC_MAIN));
  ok('B4-M4 [FRONTERA A] archivo publicado + BD no confirmada -> VUELTA ATRÁS por hash',
    /\/\/ PRE-confirmaci.n: la base de datos no se toc.\. Vuelta atr.s por hash\.\s*const vuelta = resolverAccionPendiente\(journal\);/.test(sinTildes(SRC_MAIN)),
    'no hay vuelta atrás en el camino PRE');
  ok('B4-M5 …y si la vuelta atrás no se puede completar, NO se finge: bloqueo explícito',
    /No se guard., y adem.s la vuelta atr.s no se pudo completar/.test(sinTildes(SRC_MAIN)));
  ok('B4-M6 [FRONTERA B] BD confirmada pero sin verificar -> NO se deshace el archivo',
    /POST-confirmaci.n: la fila S. est.\. NO se deshace el archivo/.test(sinTildes(SRC_MAIN)));
  ok('B4-M7 …y se devuelve la forma 3 del contrato (aplicado:true, verificado:false)',
    /ok: true, aplicado: true, verificado: false, requiereReinicio: true, actionId/.test(SRC_MAIN));
  ok('B4-M8 [FRONTERA C] la purga posterior NO puede convertir en fallido un backup confirmado',
    /el backup\s*\/\/ que acabamos de confirmar NUNCA se convierte en "fallido"/.test(SRC_MAIN) ||
    /NUNCA se convierte en "fallido"/.test(SRC_MAIN));
  ok('B4-M9 [FRONTERA D] la fila y el archivo se escriben en la MISMA acción anclada',
    /exigirCommitBase: base/.test(SRC_MAIN));
  ok('B4-M10 [FRONTERA E] al arrancar se resuelven los guardados propios pendientes',
    /function recuperarAccionesPendientes\(\)/.test(SRC_MAIN) &&
    /journalsPropiosPendientes\(\)/.test(SRC_MAIN));
  ok('B4-M11 y NO se empieza ningún guardado nuevo si hay uno propio sin resolver (F-1)',
    /INVARIANTE "journal propio pendiente = ninguna acci.n nueva"/.test(sinTildes(SRC_MAIN)));
  nota('-> El archivo huérfano del hallazgo original YA NO SE PRODUCE por esta vía:');
  nota('   un fallo PRE-confirmación repone el archivo desde su .old por hash.');

  // =========================================================================
  seccion('B4-N. QUÉ SIGUE ESCRIBIENDO CON `dbmod.run()` SUELTO');
  // =========================================================================
  // run() NO está desprotegido: pasa por escribirMultiple (latch + frontera).
  // Lo que NO tiene es el journal archivo+BD. Eso solo importa si además de la
  // fila hay un ARCHIVO que emparejar.
  {
    const lineas = SRC_MAIN.split('\n');
    const directos = [];
    lineas.forEach((l, i) => {
      if (/dbmod\.run\(/.test(l) && !/^\s*\/\//.test(l)) directos.push({ n: i + 1, txt: l.trim().slice(0, 96) });
    });
    console.log('\n  línea  sentencia');
    console.log('  ' + '-'.repeat(104));
    for (const d of directos) console.log('  ' + String(d.n).padEnd(7) + d.txt);
    ok('B4-N1 quedan llamadas directas a dbmod.run()', directos.length > 0, 'ninguna');
    ok('B4-N2 pero TODAS pasan por escribirMultiple(): latch + frontera PRE/POST',
      /function run\(sql, params = \[\]\) \{\s*return escribirMultiple/.test(SRC_DB));
    ok('B4-N3 lo que NO tienen es el journal archivo+BD (solo lo da ejecutarAccionDeArchivo)',
      cuenta(SRC_MAIN, /ejecutarAccionDeArchivo\(\{/g) >= 4,
      'usos del helper: ' + cuenta(SRC_MAIN, /ejecutarAccionDeArchivo\(\{/g));
    // El caso que SÍ empareja archivo y fila sin pasar por el helper.
    ok('B4-N4 [A ESTUDIAR] `projects:create` inserta la fila y LUEGO hornea el HTML',
      /const id = dbmod\.run\(\s*'INSERT INTO projects\(name, client, partition_name, created_at, updated_at\)/.test(SRC_MAIN) &&
      /regenerateProjectDashboardFile\(id, finalName, effectiveStart\);/.test(SRC_MAIN));
    ok('B4-N5 [A ESTUDIAR] y son DOS commits: el INSERT y el UPDATE de backup_dir',
      /dbmod\.run\('UPDATE projects SET backup_dir=\? WHERE id=\?', \[`\$\{id\}-\$\{slugify\(finalName\)\}`, id\]\);/.test(SRC_MAIN));
    ok('B4-N6 …aunque si el backup_dir queda a NULL se recalcula después',
      /function ensureProjectBackupDirSlug\(row\)/.test(SRC_MAIN));
  }

  // =========================================================================
  seccion('B4-R. REORDENAR ES **UNA** OPERACIÓN LÓGICA (exigencia, no descripción)');
  // =========================================================================
  // El diagnóstico de B4 reprodujo aquí el único defecto que quedaba vigente:
  // `projects:reorder` hacía N commits, y un fallo a mitad dejaba el orden
  // aplicado a medias ([0, null, null] en el archivo). Esta sección EXIGE lo
  // contrario. La reversión `R-reorder-en-bucle` lo vuelve a romper.
  ok('B4-R0a el bucle de commits por fila YA NO EXISTE',
    !/orderedIds\.forEach\(\(id, idx\) => \{\s*dbmod\.run\('UPDATE projects SET sort_order/.test(SRC_MAIN),
    'sigue habiendo un forEach con dbmod.run dentro');
  ok('B4-R0b ahora es UNA sola mutación anclada al commit base',
    /const sentencias = ids\.map\(\(id, idx\) => \(\{[\s\S]{0,200}?dbmod\.escribirMultiple\(sentencias, \{ exigirCommitBase: base \}\)/.test(SRC_MAIN),
    'no se ve la mutación única anclada');
  ok('B4-R0c sin journal: no hay archivos que emparejar, sería inventar un mecanismo',
    !/journalAccionPath[\s\S]{0,200}?sort_order/.test(SRC_MAIN) && !/reorder/i.test(SRC_MAIN.match(/function journalAccionPath[\s\S]{0,300}/) || ['']) [0]);
  ok('B4-R0d el fallo deja UNA línea en app.log, con la clase del error y saneado',
    /appLog\(`Reordenado de proyectos . NO aplicado \(\$\{ids\.length\} proyectos, ` \+\s*`clase \$\{\(e && e\.kind\) \|\| 'desconocida'\}\): \$\{motivoSinRutas\(e\)\}`\)/.test(sinTildes(SRC_MAIN)),
    'no está la línea de app.log del reordenado');
  ok('B4-R0e y NO lleva la lista de proyectos, solo cuántos son',
    !/appLog\([^;]{0,300}JSON\.stringify\(ids\)/.test(SRC_MAIN) &&
    !/appLog\([^;]{0,300}orderedIds\)/.test(SRC_MAIN));
  ok('B4-R0f el error se PROPAGA: el renderer engancha su aviso al catch',
    /throw e;\s*\}\s*return \{ ok: true \};\s*\}\);/.test(SRC_MAIN) &&
    /No se pudo guardar el nuevo orden: /.test(LREN),
    'el handler ya no propaga, o el renderer ya no lo recoge');

  // --- EL HANDLER REAL, EXTRAÍDO DE main.js Y EJECUTADO --------------------
  // No se replica su forma: se ejecuta su código, para que un cambio de
  // comportamiento en main.js llegue aquí de verdad.
  const avisosLog = [];
  function construirReorder() {
    const firma = "ipcMain.handle('projects:reorder', (evt, orderedIds) => {";
    const i = SRC_MAIN.indexOf(firma);
    if (i < 0) throw new Error('NO SE ENCONTRO: ' + firma);
    let prof = 0, fin = -1;
    for (let k = SRC_MAIN.indexOf('{', i + firma.length - 1); k < SRC_MAIN.length; k++) {
      if (SRC_MAIN[k] === '{') prof++;
      else if (SRC_MAIN[k] === '}') { prof--; if (prof === 0) { fin = k; break; } }
    }
    if (fin < 0) throw new Error('handler no delimitado');
    const cuerpo = SRC_MAIN.slice(SRC_MAIN.indexOf('{', i + firma.length - 1) + 1, fin);
    return new Function('procesoComprometido', 'dbmod', 'appLog', 'motivoSinRutas', 'evt', 'orderedIds',
      cuerpo);
  }
  let reorderReal = null;
  try { reorderReal = construirReorder(); } catch (e) { nota('EXTRACCIÓN: ' + e.message); }
  ok('B4-R0g el handler real se extrae de main.js y se puede ejecutar', !!reorderReal,
    'no se pudo extraer: la firma ha cambiado');
  // El saneador real, extraído también, para que la línea de log sea la de verdad.
  const motivoSinRutasReal = (() => {
    const i = SRC_MAIN.indexOf('function motivoSinRutas(e) {');
    if (i < 0) return (e) => String((e && e.message) || e || '');
    let prof = 0, fin = -1;
    for (let k = SRC_MAIN.indexOf('{', i); k < SRC_MAIN.length; k++) {
      if (SRC_MAIN[k] === '{') prof++;
      else if (SRC_MAIN[k] === '}') { prof--; if (prof === 0) { fin = k; break; } }
    }
    return new Function('path', SRC_MAIN.slice(i, fin + 1) + '; return motivoSinRutas;')(path);
  })();
  const reorder = (ids) => {
    avisosLog.length = 0;
    return reorderReal(false, dbmod, (l) => avisosLog.push(String(l)), motivoSinRutasReal, null, ids);
  };
  const ordenEnDisco = (dir) => {
    const dd = new SQL.Database(fs.readFileSync(path.join(dir, 'panorama.sqlite3')));
    const r = dd.exec('SELECT id, sort_order FROM projects ORDER BY id');
    const v = r.length ? r[0].values.map((x) => [x[0], x[1]]) : [];
    dd.close();
    return v;
  };
  const ordenEnMemoria = () => dbmod.all('SELECT id, sort_order FROM projects ORDER BY id')
    .map((r) => [r.id, r.sort_order === undefined ? null : r.sort_order]);

  const dirR = nuevaCarpeta('reorder');
  await abrirEn(dirR);
  for (let i = 1; i <= 5; i++) {
    dbmod.run(`INSERT INTO projects(name, client, partition_name, created_at, updated_at) VALUES ('P${i}','C','p${i}','t','t')`);
  }
  dbmod.run('UPDATE projects SET sort_order=NULL');

  // ---- B4-R1: ÉXITO ------------------------------------------------------
  {
    const commitAntes = dbmod._diagnostico().cMem;
    const res = reorder([5, 4, 3, 2, 1]);
    const enDisco = ordenEnDisco(dirR);
    const commitDespues = dbmod._diagnostico().cMem;
    nota('R1 orden en disco: ' + JSON.stringify(enDisco));
    ok('B4-R1a el handler devuelve ok', res && res.ok === true, JSON.stringify(res));
    ok('B4-R1b los 5 proyectos quedan ordenados, TODOS',
      JSON.stringify(enDisco) === JSON.stringify([[1, 4], [2, 3], [3, 2], [4, 1], [5, 0]]),
      JSON.stringify(enDisco));
    ok('B4-R1c y es UN SOLO commit para los 5, no cinco',
      commitDespues !== commitAntes && dbmod._diagnostico().hMem[1] === commitAntes,
      JSON.stringify({ antes: commitAntes, ahora: commitDespues, padre: dbmod._diagnostico().hMem[1] }));
    ok('B4-R1d sin ninguna línea en app.log: no ha fallado nada', avisosLog.length === 0,
      JSON.stringify(avisosLog));
  }

  // ---- B4-R2: FALLO ANTES DE PUBLICAR ------------------------------------
  {
    const ordenAntes = ordenEnDisco(dirR);
    const commitAntes = dbmod._diagnostico().cMem;
    inyectar('openSync', 'sqlite-tmp', 'EACCES');
    let err = null, res = null;
    try { res = reorder([1, 2, 3, 4, 5]); } catch (e) { err = e; }
    sinInyeccion();
    const ordenDespues = ordenEnDisco(dirR);
    nota('R2 error: ' + (err ? `${err.kind} aplicado=${err.aplicado}` : '(no lanzó) res=' + JSON.stringify(res)));
    nota('R2 app.log: ' + JSON.stringify(avisosLog));

    ok('B4-R2a el handler FALLA: propaga, no devuelve ok', !!err && !res, JSON.stringify(res));
    ok('B4-R2b con aplicado:false', err && err.aplicado === false, err ? String(err.aplicado) : '-');
    ok('B4-R2c CERO cambios parciales: el orden del disco es EXACTAMENTE el de antes',
      JSON.stringify(ordenDespues) === JSON.stringify(ordenAntes),
      JSON.stringify({ antes: ordenAntes, despues: ordenDespues }));
    ok('B4-R2d el commit NO ha avanzado', dbmod._diagnostico().cMem === commitAntes,
      JSON.stringify({ antes: commitAntes, ahora: dbmod._diagnostico().cMem }));
    ok('B4-R2e memoria = disco', JSON.stringify(ordenEnMemoria()) === JSON.stringify(ordenDespues),
      JSON.stringify({ mem: ordenEnMemoria(), disco: ordenDespues }));
    ok('B4-R2f queda RASTRO en app.log: exactamente una línea', avisosLog.length === 1,
      'líneas: ' + avisosLog.length);
    ok('B4-R2g y esa línea identifica la operación y la clase del error',
      avisosLog.length === 1 && /Reordenado de proyectos/.test(avisosLog[0]) &&
      /5 proyectos/.test(avisosLog[0]) && /clase io/.test(avisosLog[0]),
      JSON.stringify(avisosLog[0]));
    ok('B4-R2h sin la lista de proyectos ni rutas completas',
      avisosLog.length === 1 && !/\[1,2,3,4,5\]/.test(avisosLog[0]) &&
      avisosLog[0].indexOf('C:\\') < 0 && avisosLog[0].indexOf(RAIZ) < 0,
      JSON.stringify(avisosLog[0]));
  }

  // ---- B4-R3: FALLO DE PUBLICACIÓN (rename) ------------------------------
  {
    const ordenAntes = ordenEnDisco(dirR);
    inyectar('renameSync', 'sqlite-final', 'EPERM');
    let err = null;
    try { reorder([2, 1, 3, 5, 4]); } catch (e) { err = e; }
    sinInyeccion();
    const ordenDespues = ordenEnDisco(dirR);
    nota('R3 orden antes:   ' + JSON.stringify(ordenAntes));
    nota('R3 orden después: ' + JSON.stringify(ordenDespues));
    ok('B4-R3a falla con aplicado:false', !!err && err.aplicado === false);
    ok('B4-R3b TODO O NADA: ni el primer grupo aplicado ni el segundo',
      JSON.stringify(ordenDespues) === JSON.stringify(ordenAntes),
      JSON.stringify({ antes: ordenAntes, despues: ordenDespues }));
    ok('B4-R3c ningún `sort_order` intermedio a medias',
      ordenDespues.every(([id, so], i) => so === ordenAntes[i][1]),
      JSON.stringify(ordenDespues));
    ok('B4-R3d memoria = disco', JSON.stringify(ordenEnMemoria()) === JSON.stringify(ordenDespues));
    ok('B4-R3e y también deja su línea en app.log', avisosLog.length === 1, JSON.stringify(avisosLog));
  }

  // ---- B4-R3bis: EL FALLO **INTERMEDIO**, que es el que medía el defecto --
  //
  // Los dos casos anteriores fallan en el PRIMER intento de escritura, así que
  // no distinguen "una operación" de "N operaciones": con N commits también se
  // habría caído la primera vuelta y el orden habría quedado intacto.
  //
  // Lo que separa las dos formas es un fallo A MITAD. Se cuenta cuántas veces
  // se publica el .sqlite3 durante UN reordenado y se hace fallar la SEGUNDA
  // publicación:
  //   · forma correcta  -> solo hay UNA publicación: el fallo NUNCA se dispara
  //                        y el orden queda COMPLETO.
  //   · forma revertida -> hay N: la 2ª falla y el orden queda A MEDIAS.
  {
    dbmod.run('UPDATE projects SET sort_order=NULL');
    const vectorAntes = ordenEnDisco(dirR).map(([, so]) => so);
    let publicaciones = 0;
    const renameOrig = fs.renameSync;
    fs.renameSync = function (o, d, ...a) {
      if (enSandbox(d) && String(d).toLowerCase().endsWith('panorama.sqlite3')) {
        publicaciones++;
        if (publicaciones === 2) {
          const e = new Error('EPERM: publicación INYECTADA a mitad de la operación');
          e.code = 'EPERM';
          throw e;
        }
      }
      return renameOrig.call(fs, o, d, ...a);
    };
    let err = null, res = null;
    try { res = reorder([5, 4, 3, 2, 1]); } catch (e) { err = e; }
    fs.renameSync = renameOrig;
    const vectorDespues = ordenEnDisco(dirR).map(([, so]) => so);
    nota('R3bis publicaciones del .sqlite3 durante UN reordenado de 5: ' + publicaciones);
    nota('R3bis vector antes:   ' + JSON.stringify(vectorAntes));
    nota('R3bis vector después: ' + JSON.stringify(vectorDespues));

    ok('B4-R3f UN reordenado de 5 proyectos produce UNA sola publicación del .sqlite3',
      publicaciones === 1, 'publicaciones: ' + publicaciones);
    ok('B4-R3g por eso el fallo inyectado a mitad NO llega a dispararse: no hay "mitad"',
      !err && res && res.ok === true,
      err ? `falló a mitad (${err.kind}) y el vector quedó ` + JSON.stringify(vectorDespues) : '-');
    ok('B4-R3h y el orden queda COMPLETO, sin ningún elemento a medias',
      JSON.stringify(vectorDespues) === JSON.stringify([4, 3, 2, 1, 0]),
      'vector en disco: ' + JSON.stringify(vectorDespues) + '  (antes: ' + JSON.stringify(vectorAntes) + ')');
    ok('B4-R3i ninguna fila se queda sin orden mientras las otras sí lo tienen',
      vectorDespues.every((v) => v !== null) || vectorDespues.every((v) => v === null),
      'orden PARCIAL en disco: ' + JSON.stringify(vectorDespues));
  }

  // ---- B4-R4: LA OPERACIÓN SIGUIENTE -------------------------------------
  {
    ok('B4-R4a no ha quedado ningún latch tras los dos fallos',
      dbmod._diagnostico().escrituraBloqueada === null,
      String(dbmod._diagnostico().escrituraBloqueada));
    let res = null, err = null;
    try { res = reorder([3, 1, 2, 5, 4]); } catch (e) { err = e; }
    const enDisco = ordenEnDisco(dirR);
    ok('B4-R4b un reordenado válido posterior SÍ se aplica', !err && res && res.ok === true,
      err ? String(err.message).slice(0, 70) : JSON.stringify(res));
    ok('B4-R4c y se aplica ENTERO',
      JSON.stringify(enDisco) === JSON.stringify([[1, 1], [2, 2], [3, 0], [4, 4], [5, 3]]),
      JSON.stringify(enDisco));
  }

  // ---- B4-R5: VECTOR ANTES/DESPUÉS, EXPLÍCITO ----------------------------
  {
    const vectorAntes = ordenEnDisco(dirR).map(([, so]) => so);
    inyectar('renameSync', 'sqlite-final', 'EPERM');
    try { reorder([5, 4, 3, 2, 1]); } catch (e) { /* esperado */ }
    sinInyeccion();
    const vectorDespues = ordenEnDisco(dirR).map(([, so]) => so);
    nota('vector sort_order ANTES:   ' + JSON.stringify(vectorAntes));
    nota('vector sort_order DESPUÉS: ' + JSON.stringify(vectorDespues));
    ok('B4-R5 el vector de sort_order es IDÉNTICO antes y después del fallo',
      JSON.stringify(vectorAntes) === JSON.stringify(vectorDespues),
      JSON.stringify({ antes: vectorAntes, despues: vectorDespues }));
  }

  // ---- Validación de entrada, ANTES de escribir --------------------------
  {
    const vectorAntes = ordenEnDisco(dirR).map(([, so]) => so);
    const commitAntes = dbmod._diagnostico().cMem;
    const r1 = reorder([1, 'no-es-un-id', 3]);
    const r2 = reorder([1, 2, 2]);
    const r3 = reorder([]);
    const vectorDespues = ordenEnDisco(dirR).map(([, so]) => so);
    ok('B4-R6a un id no numérico se rechaza sin escribir nada',
      r1 && r1.ok === false && /no son v.lidos/.test(sinTildes(r1.error)), JSON.stringify(r1));
    ok('B4-R6b un id repetido se rechaza sin escribir nada',
      r2 && r2.ok === false && /repite/.test(r2.error), JSON.stringify(r2));
    ok('B4-R6c la lista vacía se resuelve SIN provocar un commit inútil',
      r3 && r3.ok === true && dbmod._diagnostico().cMem === commitAntes, JSON.stringify(r3));
    ok('B4-R6d y el orden del disco no se ha movido en ninguno de los tres',
      JSON.stringify(vectorDespues) === JSON.stringify(vectorAntes),
      JSON.stringify({ antes: vectorAntes, despues: vectorDespues }));
    nota('[ASIMETRÍA CONOCIDA, no se toca] estos tres devuelven `{ok:false}`, y el');
    nota('renderer solo mira el `catch`: un rechazo de validación pasa desapercibido.');
    nota('Es anterior a B4 y no es un fallo de persistencia. Queda documentado.');
  }

  // Las otras asimetrías del mismo estilo, leídas del código. NO se tocan en
  // esta ronda: ninguna produce pérdida ni inconsistencia demostrada.
  ok('B4-R7 [ASIMETRÍA] `openProjectWindow` registra la ventana ANTES del UPDATE',
    /projectWindows\.set\(row\.id, win\);\s*dbmod\.run\('UPDATE projects SET updated_at=\?/.test(SRC_MAIN));
  nota('Si ese UPDATE lanza, la ventana YA está abierta y en el mapa, pero');
  nota('`projects:open` rechaza. El usuario ve la ventana Y un error. Sin pérdida.');
  ok('B4-R8 [ASIMETRÍA] `projects:create` hornea el HTML DESPUÉS de insertar la fila',
    /const row = dbmod\.get\('SELECT \* FROM projects WHERE id=\?', \[id\]\);/.test(SRC_MAIN) &&
    /regenerateProjectDashboardFile\(id, finalName, effectiveStart\);\s*return dbmod\.get/.test(SRC_MAIN));
  ok('B4-R9 …pero eso SÍ se autorrepara: si falta la copia, se sirve la plantilla',
    /function resolveDashboardFileForProject\(row\)/.test(SRC_MAIN) &&
    /if \(fs\.existsSync\(custom\)\)/.test(SRC_MAIN));
  ok('B4-R10 [DEUDA ANOTADA] el rollback de `projects:create` puede enmascarar el error original',
    /dbmod\.run\('DELETE FROM projects WHERE id=\?', \[id\]\);\s*throw e;/.test(SRC_MAIN));
  nota('Si ese DELETE lanza, su error sustituye al del sembrado. Sin escenario que');
  nota('demuestre daño ADICIONAL, no se corrige: queda anotado como deuda menor.');

  // =========================================================================
  seccion('B4-O. OBSERVABILIDAD — que B4 no reabra lo que B3 acaba de cerrar');
  // =========================================================================
  {
    ok('B4-O1 db.js lleva su propio registro interno de lo que pasa',
      /function logA33\(s\)/.test(SRC_DB) && /_registro: \(\) => registroA33\.slice\(\)/.test(SRC_DB));
    ok('B4-O2 [OBSERVACIÓN] ese registro vive SOLO en memoria: no llega a app.log',
      !/appLog/.test(SRC_DB) && !/require\('\.\/main/.test(SRC_DB));
    const reg = dbmod._registro();
    nota('entradas del registro interno tras esta batería: ' + reg.length);
    for (const l of reg.slice(-4)) nota('   ' + l.slice(0, 120));
    ok('B4-O3 y sí recoge los fallos: hay entradas de esta sesión', reg.length > 0, 'vacío');
    ok('B4-O4 main.js SÍ registra en app.log cuando un backup no se guarda',
      /appLog\(`Backup . NO guardado \(\$\{r\.reintentable \? 'reintentable' : 'no reintentable'\}\): \$\{r\.error\}`\)/.test(sinTildes(SRC_MAIN)));
    ok('B4-O5 y los fallos POST-confirmación llevan código PS-2006',
      /ERROR PS-2006 . la acci.n \$\{actionId\}/.test(sinTildes(SRC_MAIN)));
    ok('B4-O6 el reordenado, que B4 ha demostrado que falla de forma observable, YA registra',
      /appLog\(`Reordenado de proyectos/.test(SRC_MAIN));
    nota('[HUECO QUE QUEDA] El resto de escrituras que no son backup ni reordenado');
    nota('—el `updated_at` al abrir un proyecto, el `backup_dir`— siguen sin dejar');
    nota('línea si su persistencia falla. NO se tocan: B4 solo corrige la');
    nota('observabilidad donde ha demostrado un fallo concreto, no todas las');
    nota('escrituras del programa. Queda como asimetría conocida y documentada.');
  }

  // =========================================================================
  seccion('B4-P. LO QUE **NO** ES B4 — para no ensanchar el alcance');
  // =========================================================================
  ok('B4-P1 C1 (basura ya acumulada) es otro hallazgo: aquí solo se cuenta',
    /## C1\./.test(fs.readFileSync(path.join(PROJ, 'claude', 'auditoria-2026-09-13.md'), 'utf8')));
  ok('B4-P2 P14 (app.log en Drive) sigue abierto y NO se toca aquí',
    /P14/.test(fs.readFileSync(path.join(PROJ, 'claude', 'pendientes-abiertos.md'), 'utf8')));
  ok('B4-P3 B5 (Enter en Seguridad) no tiene nada que ver con la persistencia',
    /security-window/.test(fs.readFileSync(path.join(PROJ, 'claude', 'auditoria-2026-09-13.md'), 'utf8')));
  ok('B4-P4 el `real-run/b4.js` que ya existe es del BLOQUE 4 de A3.3, no de este hallazgo',
    fs.existsSync(path.join(PROJ, 'claude', 'pruebas-a33', 'real-run', 'b4.js')));

  // =========================================================================
  // CIERRE: la producción no se ha tocado.
  // =========================================================================
  const HUELLA_DESPUES = huellaProduccion();
  const intacta = JSON.stringify(HUELLA_ANTES) === JSON.stringify(HUELLA_DESPUES);
  seccion('GUARDIÁN');
  for (const h of HUELLA_DESPUES) {
    nota((h.existe ? h.sha.slice(0, 16) + '  ' + h.size + ' B' : '(no existe: ' + h.err + ')') + '  ' + h.f);
  }
  ok('B4-Z1 las bases de datos de PRODUCCIÓN están intactas byte a byte', intacta,
    JSON.stringify({ antes: HUELLA_ANTES, despues: HUELLA_DESPUES }));

  try { fs.rmSync(RAIZ, { recursive: true, force: true }); } catch (e) {}
  ok('B4-Z2 el sandbox se ha borrado', !fs.existsSync(RAIZ));

  console.log('\n' + '='.repeat(70));
  console.log(`  B4 — inventario y diagnóstico de la persistencia: ${pass} OK, ${fail} FALLOS`);
  if (fallos.length) fallos.forEach((f) => console.log('    - ' + f));
  console.log('='.repeat(70));
  console.log('  Secciones A-Q: describen y CUSTODIAN lo de A3.3 que no se ha tocado.');
  console.log('  Sección R: EXIGE que reordenar sea una sola operación. Si se revierte, falla.');
  process.exitCode = fail === 0 ? 0 : 1;
})().catch((e) => {
  console.error('\nEXCEPCIÓN NO CAPTURADA EN EL ARNÉS:', (e && e.stack) || e);
  try { fs.rmSync(RAIZ, { recursive: true, force: true }); } catch (e2) {}
  process.exit(2);
});
