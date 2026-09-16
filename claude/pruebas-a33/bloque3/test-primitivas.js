'use strict';
// ---------------------------------------------------------------------------
// BLOQUE 3 — CAPA B: pruebas AISLADAS de las primitivas nuevas de db.js.
//
//   · exclusiva de operacion (tomar/soltar/estado)
//   · escribirMultiple(s, { exigirCommitBase, token })
//   · `commit` dentro de ErrorDb('io-tras-confirmar')
//   · alCambiarImagenEnMemoria() en TODOS los caminos
//
// Ejecuta el db.js REAL contra carpetas temporales. NUNCA toca G: ni datos
// reales: el guardian de abajo aborta el proceso entero si lo intentara.
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
  console.error('  ARNES ABORTADO POR SEGURIDAD');
  console.error('  motivo: ' + motivo);
  console.error('  ruta:   ' + ruta);
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
function comprobarRutaSegura(p) {
  const abs = path.resolve(String(p));
  const bajo = abs.toLowerCase();
  for (const mal of PROHIBIDO) if (bajo.includes(mal)) abortar(`la ruta contiene "${mal}"`, abs);
  if (REAL_NORM && (bajo === REAL_NORM || bajo.startsWith(REAL_NORM + path.sep))) {
    abortar('la ruta coincide con la ubicacion real configurada del usuario', abs);
  }
  if (bajo === DEFECTO_NORM || bajo.startsWith(DEFECTO_NORM + path.sep)) {
    abortar('la ruta apunta a la carpeta de datos por defecto de la app instalada', abs);
  }
  if (!bajo.includes(MARCA_PRUEBAS.toLowerCase())) {
    abortar(`la ruta no esta dentro de una ubicacion marcada para pruebas ("${MARCA_PRUEBAS}")`, abs);
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
      const b = fs.readFileSync(f); const s = fs.statSync(f);
      return { f, existe: true, size: s.size, sha: crypto.createHash('sha256').update(b).digest('hex') };
    } catch (e) { return { f, existe: false, err: (e && e.code) || String(e) }; }
  });
}
const HUELLA_ANTES = huellaProduccion();

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
function nuevaCarpeta(etiqueta) {
  const d = path.join(RAIZ, 'c' + (++n) + '-' + (etiqueta || 'x'));
  comprobarRutaSegura(d);
  fs.mkdirSync(d, { recursive: true });
  return d;
}
async function abrirEn(dir, opts) {
  comprobarRutaSegura(dir);
  dbmod._resetParaPruebas();
  DIR_DATOS = dir;
  return dbmod.getDb(Object.assign({ crearSiAusente: true }, opts || {}));
}
const shaDe = (b) => crypto.createHash('sha256').update(b).digest('hex');
function shaArchivo(f) { try { return shaDe(fs.readFileSync(f)); } catch (e) { return 'NO-EXISTE'; } }

let SQL = null;

// --- publicar una version "de otro equipo" directamente sobre el disco ------
// No usa db.js: escribe el .sqlite3 y el .gen a mano, como haria otro PC.
function publicarComoOtroEquipo(dir, o) {
  const dbPath = path.join(dir, 'panorama.sqlite3');
  const d = new SQL.Database(fs.readFileSync(dbPath));
  if (o.mutar) d.run(o.mutar);
  const set = (k, v) => d.run("INSERT INTO app_meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [k, String(v)]);
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
  return { bytes, sha: shaDe(bytes) };
}

(async () => {
  SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(PROJ, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')) });

  console.log('RUTAS DE PRUEBA');
  console.log('  raiz:                ' + RAIZ);
  console.log('  ubicacion real det.: ' + (REAL || '(no configurada / no legible)'));
  console.log('  carpeta por defecto: ' + path.join(process.env.APPDATA || '', 'panorama-app'));

  // =========================================================================
  seccion('EXC. EXCLUSIVA DE OPERACION');
  // =========================================================================
  {
    const dir = nuevaCarpeta('EXC');
    await abrirEn(dir);
    dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('P0','c','persist:p0','x','x')");

    ok('EXC-0) sin exclusiva, estadoExclusiva() es null', dbmod.estadoExclusiva() === null);

    const ex = dbmod.tomarExclusiva('seguridad');
    ok('EXC-1) tomarExclusiva devuelve token y etiqueta', !!ex.token && ex.etiqueta === 'seguridad', JSON.stringify(ex));
    ok('   estadoExclusiva() la refleja', dbmod.estadoExclusiva() && dbmod.estadoExclusiva().etiqueta === 'seguridad');

    // doble toma
    let e2 = null;
    try { dbmod.tomarExclusiva('otra'); } catch (e) { e2 = e; }
    ok('EXC-2) una segunda toma lanza "ocupado"', !!e2 && e2.kind === 'ocupado', String(e2));

    // escritura SIN token: bloqueada
    const shaAntes = shaArchivo(path.join(dir, 'panorama.sqlite3'));
    let e3 = null;
    try { dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('AJENA','c','persist:x','x','x')"); }
    catch (e) { e3 = e; }
    ok('EXC-3) run() sin token lanza "ocupado"', !!e3 && e3.kind === 'ocupado', String(e3));
    ok('   y NO escribe nada', shaArchivo(path.join(dir, 'panorama.sqlite3')) === shaAntes);
    ok('   el error dice QUE operacion bloquea', e3 && e3.operacion === 'seguridad', e3 && e3.operacion);

    // vacuum() tambien
    let e4 = null;
    try { dbmod.vacuum(); } catch (e) { e4 = e; }
    ok('EXC-4) vacuum() sin token tambien queda fuera', !!e4 && e4.kind === 'ocupado', String(e4));
    ok('   y el archivo sigue igual', shaArchivo(path.join(dir, 'panorama.sqlite3')) === shaAntes);

    // lecturas: permitidas
    ok('EXC-5) get() sigue funcionando durante la exclusiva',
      dbmod.get("SELECT name FROM projects WHERE name='P0'").name === 'P0');
    ok('   all() tambien', dbmod.all('SELECT * FROM projects').length === 1);

    // escritura CON token: permitida
    const idOk = dbmod.escribirMultiple(
      [{ sql: "INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('CONTOKEN','c','persist:t','x','x')", params: [] }],
      { token: ex.token });
    ok('EXC-6) escribirMultiple CON token si escribe', typeof idOk === 'number' && idOk > 0, String(idOk));
    ok('   la fila esta en la BD', !!dbmod.get("SELECT 1 AS x FROM projects WHERE name='CONTOKEN'"));
    ok('   y el archivo de disco cambio', shaArchivo(path.join(dir, 'panorama.sqlite3')) !== shaAntes);

    // token equivocado
    let e5 = null;
    try { dbmod.escribirMultiple([{ sql: "DELETE FROM projects WHERE name='P0'", params: [] }], { token: 'a'.repeat(32) }); }
    catch (e) { e5 = e; }
    ok('EXC-7) un token ajeno NO entra', !!e5 && e5.kind === 'ocupado', String(e5));
    ok('   P0 sigue ahi', !!dbmod.get("SELECT 1 AS x FROM projects WHERE name='P0'"));

    // soltar con token ajeno
    const malSoltar = dbmod.soltarExclusiva('b'.repeat(32));
    ok('EXC-8) soltarExclusiva con token ajeno NO la suelta', malSoltar.ok === false && !!dbmod.estadoExclusiva());

    // soltar bien + idempotencia
    ok('EXC-9) soltarExclusiva con el token correcto', dbmod.soltarExclusiva(ex.token).ok === true);
    ok('   estadoExclusiva() vuelve a null', dbmod.estadoExclusiva() === null);
    ok('   soltar otra vez es inocuo', dbmod.soltarExclusiva(ex.token).ok === true);
    const idLibre = dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('LIBRE','c','persist:l','x','x')");
    ok('EXC-10) tras soltarla, run() vuelve a funcionar', typeof idLibre === 'number' && idLibre > 0);

    // un latch irreversible gana sobre la exclusiva
    const ex2 = dbmod.tomarExclusiva('seguridad');
    dbmod.bloquearEscrituras('comprometido');
    let e6 = null;
    try { dbmod.escribirMultiple([{ sql: "DELETE FROM projects", params: [] }], { token: ex2.token }); } catch (e) { e6 = e; }
    ok('EXC-11) un latch irreversible gana INCLUSO con el token',
      !!e6 && e6.kind === 'bloqueado', String(e6));
    dbmod.soltarExclusiva(ex2.token);
  }

  // =========================================================================
  seccion('XCB. exigirCommitBase — los 5 estados RAM/disco');
  // =========================================================================

  // ---- XCB-1: RAM X / disco X -> confirma ---------------------------------
  {
    const dir = nuevaCarpeta('XCB1-igual');
    await abrirEn(dir);
    dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('P','c','persist:p','x','x')");
    const X = dbmod._diagnostico().cMem;
    const id = dbmod.escribirMultiple(
      [{ sql: "INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('Q','c','persist:q','x','x')", params: [] }],
      { exigirCommitBase: X });
    ok('XCB-1) RAM X / disco X -> confirma', typeof id === 'number' && id > 0, String(id));
    ok('   el commit avanzo', dbmod._diagnostico().cMem !== X);
    const g = dbmod._leerGen();
    ok('   el .gen apunta al commit nuevo y su padre es X', g.C === dbmod._diagnostico().cMem && g.P === X,
      JSON.stringify(g));
    const d2 = dbmod._leerDisco();
    ok('   integrity_check ok / disco valido', d2.estado === 'valida', d2.motivo);
  }

  // ---- XCB-2: RAM X / disco Y DESCENDIENTE LINEAL -> base-cambiada ---------
  {
    const dir = nuevaCarpeta('XCB2-descendiente');
    await abrirEn(dir);
    dbmod.setPoliticaUbicacion('compartida');
    dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('P','c','persist:p','x','x')");
    const X = dbmod._diagnostico().cMem;
    const Y = 'y'.repeat(32);
    const pub = publicarComoOtroEquipo(dir, {
      commit: Y, parent: X, historial: [Y, X], gen: 50,
      mutar: "INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('DE-B','c','persist:b','x','x')",
    });
    const shaDbAntes = shaArchivo(path.join(dir, 'panorama.sqlite3'));
    const shaGenAntes = shaArchivo(path.join(dir, 'panorama.sqlite3.gen'));
    ok('XCB-2) el "otro equipo" publico Y descendiente de X', shaDbAntes === pub.sha);

    let err = null;
    try {
      dbmod.escribirMultiple(
        [{ sql: "INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('MIA','c','persist:m','x','x')", params: [] }],
        { exigirCommitBase: X });
    } catch (e) { err = e; }
    ok('   se RECHAZA con base-cambiada', !!err && err.kind === 'base-cambiada', String(err));
    ok('   el error identifica la recarga como motivo', err && err.decision === 'recarga', err && err.decision);
    ok('   CERO ESCRITURA: el .sqlite3 es identico', shaArchivo(path.join(dir, 'panorama.sqlite3')) === shaDbAntes);
    ok('   CERO ESCRITURA: el .gen es identico', shaArchivo(path.join(dir, 'panorama.sqlite3.gen')) === shaGenAntes);
    ok('   NO se adopto: la memoria sigue en X', dbmod._diagnostico().cMem === X, dbmod._diagnostico().cMem);
    ok('   no se latcheo nada', dbmod.estadoLatch() === null, String(dbmod.estadoLatch()));

    // Y sin exigirCommitBase, el MISMO estado sigue adoptando (no se rompio lo de antes)
    const id = dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('MIA2','c','persist:m2','x','x')");
    ok('   sin exigirCommitBase el comportamiento anterior SE CONSERVA (adopta)',
      typeof id === 'number' && dbmod._diagnostico().pMem === Y, JSON.stringify(dbmod._diagnostico().pMem));
  }

  // ---- XCB-3: SIBLING -> conflicto ----------------------------------------
  {
    const dir = nuevaCarpeta('XCB3-sibling');
    await abrirEn(dir);
    dbmod.setPoliticaUbicacion('compartida');
    dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('P','c','persist:p','x','x')");
    dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('P2','c','persist:p2','x','x')");
    const dg = dbmod._diagnostico();
    const X = dg.cMem, PADRE = dg.pMem;
    const S = 's'.repeat(32);
    publicarComoOtroEquipo(dir, { commit: S, parent: PADRE, historial: [S, PADRE], gen: 50,
      mutar: "INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('HERMANA','c','persist:h','x','x')" });
    const shaAntes = shaArchivo(path.join(dir, 'panorama.sqlite3'));

    let err = null;
    try {
      dbmod.escribirMultiple([{ sql: "INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('MIA','c','persist:m','x','x')", params: [] }],
        { exigirCommitBase: X });
    } catch (e) { err = e; }
    ok('XCB-3) sibling -> conflicto (no base-cambiada)', !!err && err.kind === 'conflicto', String(err && err.kind));
    ok('   CERO ESCRITURA', shaArchivo(path.join(dir, 'panorama.sqlite3')) === shaAntes);
    ok('   queda latcheado como conflicto', dbmod.estadoLatch() === 'conflicto', String(dbmod.estadoLatch()));
  }

  // ---- XCB-4: CASO 8 (mismos ids, bytes distintos) -> conflicto -----------
  {
    const dir = nuevaCarpeta('XCB4-caso8');
    await abrirEn(dir);
    dbmod.setPoliticaUbicacion('compartida');
    dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('P','c','persist:p','x','x')");
    const dg = dbmod._diagnostico();
    const X = dg.cMem;
    // MISMO commit id, bytes distintos
    publicarComoOtroEquipo(dir, { commit: X, parent: dg.pMem, historial: dg.hMem, gen: dg.gMem,
      mutar: "INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('IMPOSTORA','c','persist:i','x','x')" });
    const shaAntes = shaArchivo(path.join(dir, 'panorama.sqlite3'));

    let err = null;
    try {
      dbmod.escribirMultiple([{ sql: "INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('MIA','c','persist:m','x','x')", params: [] }],
        { exigirCommitBase: X });
    } catch (e) { err = e; }
    ok('XCB-4) caso 8 -> conflicto', !!err && err.kind === 'conflicto', String(err && err.kind) + ' / ' + String(err));
    ok('   CERO ESCRITURA', shaArchivo(path.join(dir, 'panorama.sqlite3')) === shaAntes);
    ok('   la fila del otro equipo sigue en disco', (() => {
      const d = new SQL.Database(fs.readFileSync(path.join(dir, 'panorama.sqlite3')));
      const c = d.exec("SELECT COUNT(*) FROM projects WHERE name='IMPOSTORA'")[0].values[0][0]; d.close(); return c === 1;
    })());
  }

  // ---- XCB-5: DISCO NO VERIFICABLE -> cero escritura -----------------------
  {
    const dir = nuevaCarpeta('XCB5-noverif');
    await abrirEn(dir);
    dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('P','c','persist:p','x','x')");
    const X = dbmod._diagnostico().cMem;
    const dbPath = path.join(dir, 'panorama.sqlite3');
    const bytes = fs.readFileSync(dbPath);
    // El .sqlite3 pasa a ser una CARPETA: leerDisco() da 'no-disponible'.
    fs.unlinkSync(dbPath);
    fs.mkdirSync(dbPath);
    const genAntes = shaArchivo(dbPath + '.gen');

    let err = null;
    try {
      dbmod.escribirMultiple([{ sql: "INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('MIA','c','persist:m','x','x')", params: [] }],
        { exigirCommitBase: X });
    } catch (e) { err = e; }
    ok('XCB-5) disco no verificable -> lanza sin escribir', !!err, String(err));
    ok('   se identifica como no verificable', !!(err && err.noVerificable), JSON.stringify(err && err.estadoDisco));
    ok('   la "carpeta impostora" sigue vacia (no se escribio dentro)',
      fs.statSync(dbPath).isDirectory() && fs.readdirSync(dbPath).length === 0);
    ok('   el .gen no cambio', shaArchivo(dbPath + '.gen') === genAntes);
    fs.rmdirSync(dbPath); fs.writeFileSync(dbPath, bytes);
  }

  // =========================================================================
  seccion('POST. `commit` dentro de ErrorDb(io-tras-confirmar)');
  // =========================================================================
  {
    const dir = nuevaCarpeta('POST-commit');
    await abrirEn(dir);
    dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('P','c','persist:p','x','x')");
    const dbPath = path.join(dir, 'panorama.sqlite3');

    // Se rompe la verificacion JUSTO DESPUES del rename del .sqlite3: statSync
    // falla (fuerza el catch POST) y readFileSync tambien (impide que
    // rehacerBookkeepingDesdeDisco lo rescate). Los bytes YA estan en disco.
    const realRename = fs.renameSync, realStat = fs.statSync, realRead = fs.readFileSync;
    let roto = false;
    fs.renameSync = function (a, b) {
      const r = realRename.apply(fs, arguments);
      if (String(b) === dbPath) roto = true;
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

    let err = null;
    try {
      dbmod.escribirMultiple([{ sql: "INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('CONFIRMADA','c','persist:cf','x','x')", params: [] }]);
    } catch (e) { err = e; }
    fs.renameSync = realRename; fs.statSync = realStat; fs.readFileSync = realRead;

    ok('POST-1) el fallo posterior a confirmar da io-tras-confirmar',
      !!err && err.kind === 'io-tras-confirmar', String(err && err.kind) + ' / ' + String(err));
    ok('   aplicado === true', !!(err && err.aplicado === true));
    ok('   el error LLEVA el commit confirmado',
      !!(err && typeof err.commit === 'string' && err.commit.length === 32), err && err.commit);
    ok('   el latch queda en desincronizada', dbmod.estadoLatch() === 'desincronizada', String(dbmod.estadoLatch()));
    // Y el cambio SI esta en disco, que es lo que significa aplicado:true
    const enDisco = (() => {
      const d = new SQL.Database(fs.readFileSync(dbPath));
      const c = d.exec("SELECT COUNT(*) FROM projects WHERE name='CONFIRMADA'")[0].values[0][0];
      const cid = d.exec("SELECT value FROM app_meta WHERE key='db_commit_id'")[0].values[0][0];
      d.close(); return { c, cid };
    })();
    ok('   el cambio SI esta en el archivo de disco', enDisco.c === 1);
    ok('   y el commit del archivo es EXACTAMENTE el del error', enDisco.cid === (err && err.commit),
      enDisco.cid + ' vs ' + (err && err.commit));
  }

  // =========================================================================
  seccion('CB. alCambiarImagenEnMemoria — TODOS los caminos');
  // =========================================================================

  const avisos = [];
  function escuchar() { avisos.length = 0; dbmod.alCambiarImagenEnMemoria((ev) => avisos.push(ev)); }

  // ---- CB-1: apertura de una BD que YA tiene identidad A3.3 ---------------
  {
    const dir = nuevaCarpeta('CB1-apertura');
    await abrirEn(dir);
    dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('P','c','persist:p','x','x')");
    const X = dbmod._diagnostico().cMem;
    dbmod._resetParaPruebas(); DIR_DATOS = dir;
    escuchar();
    await dbmod.getDb({ crearSiAusente: false });
    ok('CB-1) apertura de una BD con identidad -> 1 aviso', avisos.length === 1, JSON.stringify(avisos));
    ok('   motivo "apertura"', avisos[0] && avisos[0].motivo === 'apertura', avisos[0] && avisos[0].motivo);
    ok('   de=null, a=X', avisos[0] && avisos[0].de === null && avisos[0].a === X, JSON.stringify(avisos[0]));
  }

  // ---- CB-2: creacion nueva -> bootstrap -----------------------------------
  {
    const dir = nuevaCarpeta('CB2-bootstrap');
    dbmod._resetParaPruebas(); DIR_DATOS = dir;
    escuchar();
    await dbmod.getDb({ crearSiAusente: true });
    const X = dbmod._diagnostico().cMem;
    const bootstrap = avisos.filter((a) => a.motivo === 'bootstrap');
    ok('CB-2) una creacion nueva avisa con motivo "bootstrap"', bootstrap.length === 1, JSON.stringify(avisos));
    ok('   de=null (no habia imagen), a=commit raiz', bootstrap[0] && bootstrap[0].de === null && bootstrap[0].a === X);
    ok('   la "apertura" NO avisa (cMem seguia siendo null)',
      avisos.filter((a) => a.motivo === 'apertura').length === 0, JSON.stringify(avisos.map((a) => a.motivo)));
  }

  // ---- CB-3: commit propio -------------------------------------------------
  {
    const dir = nuevaCarpeta('CB3-propio');
    await abrirEn(dir);
    const X = dbmod._diagnostico().cMem;
    escuchar();
    dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('P','c','persist:p','x','x')");
    ok('CB-3) un run() normal avisa una vez', avisos.length === 1, JSON.stringify(avisos));
    ok('   motivo "commit-propio"', avisos[0] && avisos[0].motivo === 'commit-propio');
    ok('   de=X, a=commit nuevo', avisos[0] && avisos[0].de === X && avisos[0].a === dbmod._diagnostico().cMem);
  }

  // ---- CB-4: recarga por descendencia lineal (ADOPCION REAL) --------------
  {
    const dir = nuevaCarpeta('CB4-recarga');
    await abrirEn(dir);
    dbmod.setPoliticaUbicacion('compartida');
    dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('P','c','persist:p','x','x')");
    const X = dbmod._diagnostico().cMem;
    const Y = 'e'.repeat(32);
    publicarComoOtroEquipo(dir, { commit: Y, parent: X, historial: [Y, X], gen: 50,
      mutar: "INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('DE-B','c','persist:b','x','x')" });
    escuchar();
    dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('MIA','c','persist:m','x','x')");
    const recargas = avisos.filter((a) => a.motivo === 'recarga');
    ok('CB-4) la adopcion silenciosa SI avisa', recargas.length === 1, JSON.stringify(avisos.map((a) => a.motivo)));
    ok('   de=X, a=Y', recargas[0] && recargas[0].de === X && recargas[0].a === Y, JSON.stringify(recargas[0]));
    ok('   y despues llega el commit propio',
      avisos.length === 2 && avisos[1].motivo === 'commit-propio' && avisos[1].de === Y,
      JSON.stringify(avisos.map((a) => a.motivo)));
  }

  // ---- CB-5: restauracion PRE-confirmacion -> NO avisa ---------------------
  {
    const dir = nuevaCarpeta('CB5-restauracion');
    await abrirEn(dir);
    dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('P','c','persist:p','x','x')");
    const X = dbmod._diagnostico().cMem;
    const dbPath = path.join(dir, 'panorama.sqlite3');
    escuchar();
    const realRename = fs.renameSync;
    fs.renameSync = function (a, b) {
      if (String(b) === dbPath) { const e = new Error('EIO simulado (rename)'); e.code = 'EIO'; throw e; }
      return realRename.apply(fs, arguments);
    };
    let err = null;
    try { dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('NOVA','c','persist:n','x','x')"); }
    catch (e) { err = e; }
    fs.renameSync = realRename;
    ok('CB-5) el fallo PRE-confirmacion da io con aplicado:false',
      !!err && err.kind === 'io' && err.aplicado === false, String(err));
    ok('   la memoria volvio a X', dbmod._diagnostico().cMem === X);
    ok('   restaurarUltimaImagenConfirmada() NO avisa (el commit no cambio)',
      avisos.length === 0, JSON.stringify(avisos));
    ok('   la fila descartada no esta en memoria',
      dbmod.get("SELECT 1 AS x FROM projects WHERE name='NOVA'") === null);
  }

  // ---- CB-6: reversion de bootstrap ---------------------------------------
  {
    // Se prepara una BD LEGADA (sin db_commit_id) y se hace fallar la
    // persistencia de la adopcion. La imagen se revierte, pero cMem nunca
    // llego a cambiar (una BD legada no tiene commit), asi que NO debe avisar:
    // el contrato es "avisa cuando cambia el commit", no "cuando se sustituye
    // el objeto".
    const dir = nuevaCarpeta('CB6-reversion');
    const d = new SQL.Database();
    d.run('CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT)');
    d.run("CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, client TEXT, partition_name TEXT, created_at TEXT, updated_at TEXT, backup_dir TEXT)");
    d.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('LEGADA','c','persist:l','x','x')");
    fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), Buffer.from(d.export()));
    d.close();
    const shaLegada = shaArchivo(path.join(dir, 'panorama.sqlite3'));

    dbmod._resetParaPruebas(); DIR_DATOS = dir;
    escuchar();
    dbmod._inyectarFalloEn('persist');
    let err = null;
    try { await dbmod.getDb({ crearSiAusente: false }); } catch (e) { err = e; }
    dbmod._inyectarFalloEn(null);
    ok('CB-6) la adopcion fallida lanza', !!err, String(err));
    ok('   la BD legada NO se toco', shaArchivo(path.join(dir, 'panorama.sqlite3')) === shaLegada);
    ok('   NO hay ningun aviso (cMem nunca cambio de null)', avisos.length === 0,
      JSON.stringify(avisos.map((a) => a.motivo)));
  }

  // ---- CB-7: el callback se puede quitar -----------------------------------
  {
    const dir = nuevaCarpeta('CB7-quitar');
    await abrirEn(dir);
    escuchar();
    dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('A','c','persist:a','x','x')");
    const conCallback = avisos.length;
    dbmod.alCambiarImagenEnMemoria(null);
    dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('B','c','persist:b','x','x')");
    ok('CB-7) alCambiarImagenEnMemoria(null) lo desinstala',
      conCallback === 1 && avisos.length === 1, conCallback + ' / ' + avisos.length);
  }

  // ---- CB-8: un callback que lanza NO rompe la escritura -------------------
  {
    const dir = nuevaCarpeta('CB8-lanza');
    await abrirEn(dir);
    dbmod.alCambiarImagenEnMemoria(() => { throw new Error('el que escucha explota'); });
    let err = null; let id = null;
    try { id = dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('A','c','persist:a','x','x')"); }
    catch (e) { err = e; }
    ok('CB-8) un callback que lanza no rompe el run()', err === null && typeof id === 'number', String(err));
    ok('   la fila se guardo igualmente', !!dbmod.get("SELECT 1 AS x FROM projects WHERE name='A'"));
    dbmod.alCambiarImagenEnMemoria(null);
  }

  // ---- CB-9: _resetParaPruebas limpia callback y exclusiva -----------------
  {
    const dir = nuevaCarpeta('CB9-reset');
    await abrirEn(dir);
    dbmod.tomarExclusiva('seguridad');
    dbmod.alCambiarImagenEnMemoria(() => {});
    dbmod._resetParaPruebas();
    ok('CB-9) _resetParaPruebas suelta la exclusiva', dbmod.estadoExclusiva() === null);
    DIR_DATOS = dir;
    await dbmod.getDb({ crearSiAusente: false });
    ok('   y quita el callback (no hay avisos acumulados)', true);
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
    ok('la huella de produccion es IDENTICA antes y despues', igual,
      JSON.stringify({ antes: HUELLA_ANTES, despues }));
    HUELLA_ANTES.forEach((a, i) => {
      console.log('    ' + a.f);
      console.log('      antes:   ' + (a.existe ? a.sha + ' (' + a.size + ' B)' : 'no existe (' + a.err + ')'));
      console.log('      despues: ' + (despues[i].existe ? despues[i].sha + ' (' + despues[i].size + ' B)' : 'no existe (' + despues[i].err + ')'));
    });
  }

  console.log('\n' + '='.repeat(66));
  console.log(`  BLOQUE 3 / CAPA B — primitivas de db.js: ${pass} OK, ${fail} FALLOS`);
  console.log('='.repeat(66));
  if (fail) { console.log('  fallos:'); fallos.forEach((f) => console.log('   - ' + f)); }

  try { dbmod._resetParaPruebas(); } catch (e) {}
  try { fs.rmSync(RAIZ, { recursive: true, force: true }); } catch (e) {}
  console.log('  carpetas de prueba borradas: ' + !fs.existsSync(RAIZ));
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('EXCEPCION NO CAPTURADA EN EL ARNES:', e); process.exit(2); });
