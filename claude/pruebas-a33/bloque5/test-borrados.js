'use strict';
// ---------------------------------------------------------------------------
// BLOQUE 5 — HELPER DE BORRADOS, EN AISLAMIENTO.
//
// B1-B12 · DEL-W-SUBTREE · DEL-W-MULTIRESOURCE · DEL-ROLLBACK-NO-CLOBBER ·
// DEL-X1/X2/X3 · DEL-LEGACY-SLUG · DEL-JOURNAL-SCHEMA · PATH-SCOPE-1..4 ·
// CV-RM-1/2/3 · CV-REPLACE-1/2/3 · F-1 GLOBAL
//
// El codigo del Bloque 4 y las rutinas durables son las REALES de main.js,
// extraidas a un ambito con `app` simulado. NUNCA G:.
// ---------------------------------------------------------------------------
const fsReal = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const Module = require('module');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const MARCA_PRUEBAS = '_a33-bloque5-PRUEBAS';
const RAIZ = path.join(os.tmpdir(), MARCA_PRUEBAS);

// Guardian unico y FAIL-CLOSED + vigilancia de la BD VIVA de G: (exit 98).
const GUARDIA = require(path.join(__dirname, '..', 'comun', 'guardia-rutas.js'));
const guardia = GUARDIA.crearGuardia({ marca: MARCA_PRUEBAS });
const segura = guardia.segura;
segura(RAIZ);
fsReal.rmSync(RAIZ, { recursive: true, force: true });
fsReal.mkdirSync(RAIZ, { recursive: true });

// --- fs instrumentado: registra TODOS los rename ---------------------------
// Sirve para demostrar que NO-CLOBBER no llega a llamar a renameSync, en vez
// de deducirlo del estado final.
const renames = [];
const fs = Object.assign({}, fsReal);
fs.renameSync = function (a, b) { renames.push({ de: String(a), a: String(b) }); return fsReal.renameSync(a, b); };
function renamesDesde(i) { return renames.slice(i); }
// OJO: `escribirJsonDurable` tambien usa rename (tmp -> definitivo). Para
// afirmar "no se repuso nada" hay que mirar los renames CUYO DESTINO es el
// origen, no el recuento total.
function renamesHacia(i, destino) {
  const d = path.resolve(destino).toLowerCase();
  return renamesDesde(i).filter((r) => path.resolve(r.a).toLowerCase() === d);
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

// ---------------------------------------------------------------------------
// main.js REAL extraido
const RUTA_MAIN = process.env.PANORAMA_MAIN || path.join(PROJ, 'main.js');
const SRC = fsReal.readFileSync(RUTA_MAIN, 'utf8');
function extraerDe(src, firma) {
  const i = src.indexOf(firma);
  if (i < 0) throw new Error('NO SE ENCONTRO: ' + firma);
  let j = src.indexOf('{', i), prof = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (prof === 0) return src.slice(i, k + 1); }
  }
  throw new Error('no delimitado: ' + firma);
}
const extraer = (f) => extraerDe(SRC, f);
function lineaConst(n) { const i = SRC.indexOf(n); if (i < 0) throw new Error('falta ' + n); return SRC.slice(i, SRC.indexOf('\n', i) + 1); }

const BLOQUES = [
  'function escribirBufferDurable(ruta, buf)',
  'function escribirJsonDurable(ruta, obj)',
  'function sha256DeArchivo(p)',
  'function slugify(',
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
];
// El helper del Bloque 5 vive en main.js: UNA sola implementacion productiva.
// Aqui se extrae igual que el resto, no se reimplementa.
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

// El cableado YA NO SE SIMULA. `destinoOcupadoPorOtroEquipo()` delega en
// `ocupacionComun()` y `ejecutarAccionDeArchivo()` lleva la puerta F-1 de
// borrados dentro, en el propio main.js. Lo que se prueba aqui es ese codigo.
const CONTADOR = `
// Contador de entradas al cuerpo real, para poder afirmar "no se entro".
let _vecesEntradaReal = 0;
const _accionReal = ejecutarAccionDeArchivo;
ejecutarAccionDeArchivo = function (opts) { _vecesEntradaReal++; return _accionReal(opts); };
`;

function construirMain(est, op) {
  const o = op || {};
  const cuerpo = CONSTS + '\n' +
    'let securityKey = null;\n' +
    'let seguridadRequiereRevalidacion = false;\n' +
    'let seguridadEnEstadoInconsistente = null;\n' +
    B5.PREAMBULO_B5 +
    BLOQUES.map(extraer).join('\n\n') + '\n' + CONTADOR + '\n' +
    'return { ejecutarAccionDeArchivo, resolverAccionPendiente,\n' +
    '         journalsDeAcciones, journalsPropiosPendientes, destinoOcupadoPorOtroEquipo,\n' +
    '         estadoDestinoAccion, accionYaAplicada, leerMarcaAcciones, estadoAccionEnMarca,\n' +
    '         sentenciaMarcaAccion, journalAccionPath, accionesDir, sha256DeArchivo,\n' +
    '         escribirJsonDurable, nuevoActionId, leerJournalAccion, slugify,\n' +
    '         ensureProjectBackupDirSlug,\n' +
    // --- Bloque 5, extraido de main.js ---------------------------------
    '         borradosDir, journalBorradoPath, cuarentenaDe, estaDentroDe, mismaRuta,\n' +
    '         slugDeProyectoPuro, rutaBackupsPura, rutaDashboardPura,\n' +
    '         leerJournalBorrado, journalsDeBorrados, recursosReservados,\n' +
    '         cubreRecurso, conflictoRecurso, ocupacionComun, f1Borrados, f1Global,\n' +
    '         resumirDirectorio, existeRuta, reponerRecurso, reponerTodo, purgarTodo,\n' +
    '         finalizarPurga, vaciarParticionDe, ejecutarBorrado,\n' +
    '         recuperarBorradosPendientes, resolverBorradoPendiente,\n' +
    '         purgarBackupsAntiguos, proyectosEnBorrado, proyectoBloqueadoPorBorrado,\n' +
    '         vecesEntradaReal: () => _vecesEntradaReal,\n' +
    '         setKey: (k) => { securityKey = k; } };';
  const f = new Function('app', 'fs', 'path', 'crypto', 'dbmod', 'securitymod', 'appLog', 'getMeta',
    'session', cuerpo);
  // `dbmod` y `session` se pueden sustituir para inyectar fallos sin tocar el
  // cuerpo de las funciones reales.
  const dbDoble = o.dbmod || dbmod;
  const sesDoble = o.session || { fromPartition: () => ({ clearStorageData: () => Promise.resolve() }) };
  return f(appDoble, fs, path, crypto, dbDoble, securitymod,
    (s) => { (est.log = est.log || []).push(s); },
    (k) => { const r = dbmod.get('SELECT value FROM app_meta WHERE key=?', [k]); return r ? r.value : null; },
    sesDoble);
}

// `dbmod` con `escribirMultiple` sustituido, para los cortes de F3.
function dbmodCon(fnEscribir) {
  return Object.assign(Object.create(Object.getPrototypeOf(dbmod)), dbmod, { escribirMultiple: fnEscribir });
}

// ---------------------------------------------------------------------------
let SQL = null;
let nc = 0;
function carpeta(e) { const d = path.join(RAIZ, 'c' + (++nc) + '-' + e); segura(d); fsReal.mkdirSync(d, { recursive: true }); return d; }

async function montar(dir, writer) {
  segura(dir);
  dbmod._resetParaPruebas();
  DIR_DATOS = dir;
  if (writer) dbmod.setInstallationId(writer);
  await dbmod.getDb({ crearSiAusente: true });
  const pid = dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('Proyecto Uno','c','persist:p1','x','x')");
  fsReal.mkdirSync(path.join(dir, 'backups'), { recursive: true });
  return { pid };
}
function publicarComoOtroEquipo(dir, o) {
  const p = path.join(dir, 'panorama.sqlite3');
  const d = new SQL.Database(fsReal.readFileSync(p));
  const set = (k, v) => d.run('INSERT INTO app_meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [k, String(v)]);
  set('db_commit_id', o.commit); set('db_parent_commit_id', o.parent);
  set('db_commit_history', JSON.stringify(o.historial || [o.commit])); set('db_generation', String(o.gen || 99));
  const b = Buffer.from(d.export()); d.close();
  fsReal.writeFileSync(p, b);
  fsReal.writeFileSync(p + '.gen', JSON.stringify({ v: 2, gen: o.gen || 99, commit_id: o.commit, parent_commit_id: o.parent, writer: 'BBBB'.padEnd(32, '0'), at: new Date().toISOString() }), 'utf8');
}

// El helper del Bloque 5 ES el de main.js: `M` ya lo trae. Sin `extra` esto no
// monta nada, solo devuelve el mismo ambito.
//
// Con `extra` se construye un ambito NUEVO con `dbmod` o `session` sustituidos:
// las funciones siguen siendo las reales de main.js, lo unico que cambia es de
// donde cuelgan sus dependencias. Asi se inyecta un fallo en F3 o en
// clearStorageData sin reescribir ni una linea del codigo bajo prueba.
function montarHelper(M, extra) {
  if (!extra) return M;
  const op = {};
  if (extra.escribirMultiple) op.dbmod = dbmodCon(extra.escribirMultiple);
  if (extra.vaciarParticion) {
    op.session = { fromPartition: (p) => ({ clearStorageData: () => { extra.vaciarParticion(p); return Promise.resolve(); } }) };
  }
  return construirMain({}, op);
}

// utilidades de material real
function arbol(dir, n, etq) {
  fsReal.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < n; i++) fsReal.writeFileSync(path.join(dir, `f${i}.json`), `${etq}-${i}`, 'utf8');
  return dir;
}
function huellaArbol(dir) {
  if (!fsReal.existsSync(dir)) return 'NO-EXISTE';
  const out = [];
  const rec = (d, pre) => {
    for (const e of fsReal.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) rec(f, pre + e.name + '/');
      else out.push(pre + e.name + ':' + crypto.createHash('sha256').update(fsReal.readFileSync(f)).digest('hex').slice(0, 12));
    }
  };
  rec(dir, '');
  return out.join('|');
}
const W_A = 'a'.repeat(32);
const W_B = 'b'.repeat(32);
const commitFalso = () => crypto.randomBytes(16).toString('hex');

// journal de borrado plantado a mano (simula el estado tras un corte)
function plantarJournalBorrado(H, j) {
  fsReal.mkdirSync(H.borradosDir(), { recursive: true });
  fsReal.writeFileSync(H.journalBorradoPath(j.action_id), JSON.stringify(j, null, 2), 'utf8');
}
function ponerMarca(M, actionIds) {
  const s = M.sentenciaMarcaAccion('x'.repeat(32));
  dbmod.escribirMultiple([{ sql: s.sql, params: [s.params[0], JSON.stringify(actionIds)] }]);
}

// ===========================================================================
(async () => {
  SQL = await initSqlJs({ locateFile: (f) => path.join(PROJ, 'node_modules', 'sql.js', 'dist', f) });
  console.log('BLOQUE 5 — helper de borrados AISLADO (no cableado a D1-D4)');
  console.log('  main.js bajo prueba: ' + RUTA_MAIN);

  // =========================================================================
  seccion('PATH-SCOPE — contencion con semantica real de Windows');
  // =========================================================================
  {
    const est = {}; const M = construirMain(est); const H = montarHelper(M);
    ok('PATH-SCOPE-1 hermana con prefijo comun NO esta dentro',
      H.estaDentroDe('C:\\d\\backups\\p1\\x', 'C:\\d\\backups\\p1') === true &&
      H.estaDentroDe('C:\\d\\backups\\p10\\x', 'C:\\d\\backups\\p1') === false);
    ok('PATH-SCOPE-2 separadores mezclados y mayusculas',
      H.estaDentroDe('c:/D/Backups/P1/y', 'C:\\d\\backups\\p1') === true);
    ok('PATH-SCOPE-3 travesia con .. sale del ambito',
      H.estaDentroDe('C:\\d\\backups\\p1\\..\\..\\otro', 'C:\\d\\backups\\p1') === false);
    ok('PATH-SCOPE-4 otra unidad y el padre no estan dentro',
      H.estaDentroDe('D:\\d\\backups\\p1\\x', 'C:\\d\\backups\\p1') === false &&
      H.estaDentroDe('C:\\d\\backups', 'C:\\d\\backups\\p1') === false &&
      H.estaDentroDe('C:\\d\\backups\\p1', 'C:\\d\\backups\\p1') === true);
  }

  // =========================================================================
  seccion('DEL-JOURNAL-SCHEMA — un journal a medias NO autoriza nada');
  // =========================================================================
  {
    const dir = carpeta('journal-schema');
    await montar(dir, W_A);
    const est = {}; const M = construirMain(est); const H = montarHelper(M);
    const base = dbmod.getCommitActual();

    // MATERIAL REAL en cuarentena y en el origen.
    const aid = 'c'.repeat(32);
    const origen = path.join(dir, 'backups', 'proyecto-x');
    const cuar = H.cuarentenaDe(aid, 0);
    arbol(cuar, 3, 'material-en-cuarentena');
    const huellaCuar = huellaArbol(cuar);

    const bueno = {
      v: 1, action_id: aid, writer: W_A, tipo: 'borrar-proyecto', base_commit_id: base,
      fase: 'retirando', startedAt: '2026-09-15T00:00:00Z',
      recursos: [{ tipo: 'directorio', scope: 'subtree', origen, cuarentena: cuar, n_archivos: 3, bytes_totales: 60 }],
    };
    ok('journal COMPLETO se acepta (control)', (() => {
      plantarJournalBorrado(H, bueno);
      const r = H.leerJournalBorrado(H.journalBorradoPath(aid));
      fsReal.unlinkSync(H.journalBorradoPath(aid));
      return r.clase === 'valido';
    })());

    const casos = [
      ['truncado', (txt) => txt.slice(0, Math.floor(txt.length / 2))],
      ['parseable pero incompleto (sin recursos)', null, (j) => { delete j.recursos; }],
      ['action_id invalido', null, (j) => { j.action_id = 'ZZ'; }],
      ['recurso sin origen', null, (j) => { delete j.recursos[0].origen; }],
      ['cuarentena fuera de .panorama-borrados/<action_id>', null, (j) => { j.recursos[0].cuarentena = path.join(dir, 'backups'); }],
      ['scope invalido', null, (j) => { j.recursos[0].scope = 'todo'; }],
      ['resumen de directorio invalido', null, (j) => { j.recursos[0].n_archivos = -1; }],
    ];
    for (const [etq, mutarTexto, mutarObj] of casos) {
      const j = JSON.parse(JSON.stringify(bueno));
      if (mutarObj) mutarObj(j);
      let txt = JSON.stringify(j, null, 2);
      if (mutarTexto) txt = mutarTexto(txt);
      fsReal.mkdirSync(H.borradosDir(), { recursive: true });
      fsReal.writeFileSync(H.journalBorradoPath(aid), txt, 'utf8');

      const antesCuar = huellaArbol(cuar);
      const antesCommit = dbmod.getCommitActual();
      const nR = renames.length;
      const lect = H.leerJournalBorrado(H.journalBorradoPath(aid));
      const rec = await H.recuperarBorradosPendientes();
      const f1 = H.f1Global();

      const noValido = lect.clase !== 'valido';
      const bloqueado = rec.ok === false && rec.malos.length === 1 && rec.malos[0].clase === 'journal-no-demostrable';
      const intacto = huellaArbol(cuar) === antesCuar && fsReal.existsSync(H.journalBorradoPath(aid));
      const sinRenames = renamesDesde(nR).length === 0;
      const sinCommit = dbmod.getCommitActual() === antesCommit;
      const f1Cerrada = f1.libre === false;
      ok('DEL-JOURNAL-SCHEMA ' + etq + ': ni purga ni rollback destructivo',
        noValido && bloqueado && intacto && sinRenames && sinCommit && f1Cerrada,
        JSON.stringify({ clase: lect.clase, rec: rec.malos && rec.malos[0] && rec.malos[0].clase, intacto, sinRenames, sinCommit, f1: f1.clase }));
      fsReal.unlinkSync(H.journalBorradoPath(aid));
    }
    ok('DEL-JOURNAL-SCHEMA el material de cuarentena sigue byte a byte', huellaArbol(cuar) === huellaCuar);
  }

  // =========================================================================
  seccion('DEL-ROLLBACK-NO-CLOBBER — la funcion REAL de reposicion');
  // =========================================================================
  {
    const dir = carpeta('no-clobber');
    await montar(dir, W_A);
    const est = {}; const M = construirMain(est); const H = montarHelper(M);
    const base = dbmod.getCommitActual();
    const aid = 'd'.repeat(32);
    const origen = path.join(dir, 'backups', 'proyecto-nc');
    const cuar = H.cuarentenaDe(aid, 0);

    // 1) retirar de verdad
    arbol(origen, 3, 'mio');
    const j = {
      v: 1, action_id: aid, writer: W_A, tipo: 'borrar-proyecto', base_commit_id: base,
      fase: 'retirando', startedAt: '2026-09-15T00:00:00Z',
      recursos: [{ tipo: 'directorio', scope: 'subtree', origen, cuarentena: cuar, n_archivos: 3, bytes_totales: 30 }],
    };
    plantarJournalBorrado(H, j);
    fsReal.mkdirSync(path.dirname(cuar), { recursive: true });
    fs.renameSync(origen, cuar);
    const huellaCuar = huellaArbol(cuar);

    // 2) el otro equipo recrea el origen
    fsReal.mkdirSync(origen, { recursive: true });
    fsReal.writeFileSync(path.join(origen, 'backup-ajeno.json'), 'DEL OTRO EQUIPO', 'utf8');
    const huellaOrigen = huellaArbol(origen);
    const commitAntes = dbmod.getCommitActual();

    // 3) rollback POR LA FUNCION REAL del helper
    const nR = renames.length;
    const r = H.reponerRecurso(j.recursos[0]);
    const hechos = renamesDesde(nR);

    ok('DEL-ROLLBACK-NO-CLOBBER no se invoca rename(cuarentena -> origen)',
      hechos.length === 0, JSON.stringify(hechos));
    ok('DEL-ROLLBACK-NO-CLOBBER resultado fail-closed (destino-ocupado)',
      r.estado === 'destino-ocupado', JSON.stringify(r));
    ok('DEL-ROLLBACK-NO-CLOBBER el origen recreado sigue byte a byte',
      huellaArbol(origen) === huellaOrigen && fsReal.readFileSync(path.join(origen, 'backup-ajeno.json'), 'utf8') === 'DEL OTRO EQUIPO');
    ok('DEL-ROLLBACK-NO-CLOBBER la cuarentena sigue byte a byte', huellaArbol(cuar) === huellaCuar);
    ok('DEL-ROLLBACK-NO-CLOBBER el journal sigue presente', fsReal.existsSync(H.journalBorradoPath(aid)));

    // 4) y por la via de RECUPERACION, que es la que corre al arrancar
    const rec = await H.recuperarBorradosPendientes();
    ok('DEL-ROLLBACK-NO-CLOBBER la recuperacion queda fail-closed',
      rec.ok === false && rec.malos[0].clase === 'rollback-bloqueado', JSON.stringify(rec.malos[0] || {}));
    ok('DEL-ROLLBACK-NO-CLOBBER cero escrituras en BD despues',
      dbmod.getCommitActual() === commitAntes);
    ok('DEL-ROLLBACK-NO-CLOBBER nada se destruyo tras la recuperacion',
      huellaArbol(origen) === huellaOrigen && huellaArbol(cuar) === huellaCuar && fsReal.existsSync(H.journalBorradoPath(aid)));

    // 5) y en cuanto el origen desaparece, la MISMA funcion sí repone
    fsReal.rmSync(origen, { recursive: true, force: true });
    const nR2 = renames.length;
    const r2 = H.reponerRecurso(j.recursos[0]);
    ok('NO-CLOBBER no bloquea el caso legitimo: con el origen libre SI repone',
      r2.estado === 'repuesto' && renamesDesde(nR2).length === 1 && huellaArbol(origen) === huellaCuar,
      JSON.stringify(r2));
  }

  // =========================================================================
  seccion('B1-B12 — matriz de cortes');
  // =========================================================================
  const resumenB = [];
  function anotarB(id, veredicto, residuo) { resumenB.push({ id, veredicto, residuo }); }

  // --- B1: tras el journal, antes de mover ---------------------------------
  {
    const dir = carpeta('b1'); await montar(dir, W_A);
    const est = {}; const M = construirMain(est); const H = montarHelper(M);
    const aid = '01'.repeat(16);
    const origen = arbol(path.join(dir, 'backups', 'p'), 2, 'b1');
    const h0 = huellaArbol(origen);
    plantarJournalBorrado(H, {
      v: 1, action_id: aid, writer: W_A, tipo: 'borrar-proyecto', base_commit_id: dbmod.getCommitActual(),
      fase: 'retirando', startedAt: 'x', recursos: [{ tipo: 'directorio', scope: 'subtree', origen, cuarentena: H.cuarentenaDe(aid, 0), n_archivos: 2, bytes_totales: 8 }],
    });
    const c0 = dbmod.getCommitActual();
    const rec = await H.recuperarBorradosPendientes();
    const bien = rec.ok && rec.resultados[0].caso === 'A' && huellaArbol(origen) === h0 &&
      !fsReal.existsSync(H.journalBorradoPath(aid)) && dbmod.getCommitActual() === c0;
    ok('B1 corte tras el journal: destino intacto, journal retirado, BD intacta', bien, JSON.stringify(rec.resultados[0]));
    anotarB('B1', bien ? 'rollback trivial' : 'REVISAR', 'journal borrado; cero cuarentena');
  }

  // --- B2: mudanza a medias ------------------------------------------------
  {
    const dir = carpeta('b2'); await montar(dir, W_A);
    const est = {}; const M = construirMain(est); const H = montarHelper(M);
    const aid = '02'.repeat(16);
    const o1 = arbol(path.join(dir, 'backups', 'p'), 2, 'b2a');
    const o2 = path.join(dir, 'projects', 'p1');
    arbol(o2, 1, 'b2b');
    const h1 = huellaArbol(o1), h2 = huellaArbol(o2);
    const c1 = H.cuarentenaDe(aid, 0), c2 = H.cuarentenaDe(aid, 1);
    const j = {
      v: 1, action_id: aid, writer: W_A, tipo: 'borrar-proyecto', base_commit_id: dbmod.getCommitActual(),
      fase: 'retirando', startedAt: 'x',
      recursos: [
        { tipo: 'directorio', scope: 'subtree', origen: o1, cuarentena: c1, n_archivos: 2, bytes_totales: 8 },
        { tipo: 'directorio', scope: 'subtree', origen: o2, cuarentena: c2, n_archivos: 1, bytes_totales: 4 },
      ],
    };
    plantarJournalBorrado(H, j);
    fsReal.mkdirSync(path.dirname(c1), { recursive: true });
    fs.renameSync(o1, c1);                       // solo el primero se movio
    const c0 = dbmod.getCommitActual();
    const rec = await H.recuperarBorradosPendientes();
    const bien = rec.ok && huellaArbol(o1) === h1 && huellaArbol(o2) === h2 &&
      !fsReal.existsSync(H.journalBorradoPath(aid)) && !fsReal.existsSync(path.join(H.borradosDir(), aid)) &&
      dbmod.getCommitActual() === c0;
    ok('B2 mudanza a medias: se reponen los movidos y los no movidos siguen', bien, JSON.stringify(rec.resultados[0]));
    anotarB('B2', bien ? 'repuesto lo movido' : 'REVISAR', 'cuarentena y journal borrados');
  }

  // --- B3: todo movido, antes del commit -----------------------------------
  {
    const dir = carpeta('b3'); await montar(dir, W_A);
    const est = {}; const M = construirMain(est); const H = montarHelper(M);
    const aid = '03'.repeat(16);
    const o1 = arbol(path.join(dir, 'backups', 'p'), 3, 'b3a');
    const o2 = arbol(path.join(dir, 'projects', 'p1'), 2, 'b3b');
    const h1 = huellaArbol(o1), h2 = huellaArbol(o2);
    const c1 = H.cuarentenaDe(aid, 0), c2 = H.cuarentenaDe(aid, 1);
    plantarJournalBorrado(H, {
      v: 1, action_id: aid, writer: W_A, tipo: 'borrar-proyecto', base_commit_id: dbmod.getCommitActual(),
      fase: 'retirando', startedAt: 'x',
      recursos: [
        { tipo: 'directorio', scope: 'subtree', origen: o1, cuarentena: c1, n_archivos: 3, bytes_totales: 12 },
        { tipo: 'directorio', scope: 'subtree', origen: o2, cuarentena: c2, n_archivos: 2, bytes_totales: 8 },
      ],
    });
    fsReal.mkdirSync(path.join(H.borradosDir(), aid), { recursive: true });
    fs.renameSync(o1, c1); fs.renameSync(o2, c2);
    const c0 = dbmod.getCommitActual();
    const rec = await H.recuperarBorradosPendientes();
    const bien = rec.ok && huellaArbol(o1) === h1 && huellaArbol(o2) === h2 && dbmod.getCommitActual() === c0;
    ok('B3 todo movido sin commit: se repone todo', bien, JSON.stringify(rec.resultados[0]));
    anotarB('B3', bien ? 'repuesto todo' : 'REVISAR', 'cuarentena y journal borrados');
  }

  // --- B4: A3.3 rechaza (base-cambiada) — EJECUCION REAL --------------------
  {
    const dir = carpeta('b4'); const m = await montar(dir, W_A);
    const est = {}; const M = construirMain(est); const H = montarHelper(M);
    const o1 = arbol(path.join(dir, 'backups', 'p'), 3, 'b4');
    const h1 = huellaArbol(o1);
    // otro equipo avanza el commit por debajo
    publicarComoOtroEquipo(dir, { commit: commitFalso(), parent: dbmod.getCommitActual(), gen: 77 });
    const nR = renames.length;
    const r = await H.ejecutarBorrado({
      tipo: 'borrar-proyecto',
      recursos: [{ tipo: 'directorio', scope: 'subtree', origen: o1 }],
      sentencias: () => [{ sql: 'DELETE FROM projects WHERE id=?', params: [m.pid] }],
    });
    const filas = dbmod.get('SELECT COUNT(*) n FROM projects');
    const bien = r.aplicado === false && r.reintentable === true && huellaArbol(o1) === h1 &&
      filas.n === 1 && fsReal.readdirSync(H.borradosDir()).filter((f) => /\.json$/.test(f)).length === 0;
    ok('B4 A3.3 rechaza: se repone todo, la fila sigue, IPC reintentable', bien,
      JSON.stringify({ r: { aplicado: r.aplicado, reintentable: r.reintentable }, filas: filas.n, renames: renamesDesde(nR).length }));
    anotarB('B4', bien ? 'repuesto, reintentable' : 'REVISAR', 'cero journals, cero cuarentena');
  }

  // --- B5: commit confirmado + corte antes de purgar ------------------------
  {
    const dir = carpeta('b5'); await montar(dir, W_A);
    const est = {}; const M = construirMain(est); const H = montarHelper(M);
    const aid = '05'.repeat(16);
    const o1 = arbol(path.join(dir, 'backups', 'p'), 3, 'b5');
    const c1 = H.cuarentenaDe(aid, 0);
    plantarJournalBorrado(H, {
      v: 1, action_id: aid, writer: W_A, tipo: 'borrar-proyecto', base_commit_id: dbmod.getCommitActual(),
      fase: 'retirando', startedAt: 'x',
      recursos: [{ tipo: 'directorio', scope: 'subtree', origen: o1, cuarentena: c1, n_archivos: 3, bytes_totales: 12 }],
    });
    fsReal.mkdirSync(path.join(H.borradosDir(), aid), { recursive: true });
    fs.renameSync(o1, c1);
    ponerMarca(M, [aid]);                      // la marca demuestra que SI se aplico
    const nR = renames.length;
    const rec = await H.recuperarBorradosPendientes();
    const bien = rec.ok && rec.resultados[0].caso === 'B' && !fsReal.existsSync(o1) &&
      !fsReal.existsSync(c1) && !fsReal.existsSync(H.journalBorradoPath(aid)) && renamesHacia(nR, o1).length === 0;
    ok('B5 marca presente: NO se repone, se purga la cuarentena', bien, JSON.stringify(rec.resultados[0]));
    anotarB('B5', bien ? 'purgado (no repuesto)' : 'REVISAR', 'cero cuarentena, cero journal');
  }

  // --- B6: aplicado:true / verificado:false --------------------------------
  {
    const dir = carpeta('b6'); const m = await montar(dir, W_A);
    const est = {}; const M = construirMain(est);
    // El commit REAL se aplica y despues se simula el fallo POST-confirmacion,
    // que es exactamente lo que db.js senala con ErrorDb('io-tras-confirmar').
    const H = montarHelper(M, {
      escribirMultiple: (s, o) => {
        dbmod.escribirMultiple(s, o);
        const e = new Error('no se pudo releer tras confirmar (simulado)');
        e.aplicado = true; e.kind = 'io-tras-confirmar';
        throw e;
      },
    });
    const o1 = arbol(path.join(dir, 'backups', 'p'), 3, 'b6');
    const r = await H.ejecutarBorrado({
      tipo: 'borrar-proyecto',
      recursos: [{ tipo: 'directorio', scope: 'subtree', origen: o1 }],
      sentencias: () => [{ sql: 'DELETE FROM projects WHERE id=?', params: [m.pid] }],
    });
    const filas = dbmod.get('SELECT COUNT(*) n FROM projects');
    const bien = r.ok === true && r.aplicado === true && r.verificado === false && r.requiereReinicio === true &&
      typeof r.aviso === 'string' && filas.n === 0 && !fsReal.existsSync(o1);
    ok('B6 aplicado:true/verificado:false: forma 3, no se repone, reiniciar', bien,
      JSON.stringify({ ok: r.ok, aplicado: r.aplicado, verificado: r.verificado, req: r.requiereReinicio, filas: filas.n }));
    anotarB('B6', bien ? 'forma 3, sin deshacer' : 'REVISAR', 'cuarentena y journal conservados hasta el reinicio');
  }

  // --- B7: reponiendo aparece un TERCER contenido ---------------------------
  {
    const dir = carpeta('b7'); await montar(dir, W_A);
    const est = {}; const M = construirMain(est); const H = montarHelper(M);
    const aid = '07'.repeat(16);
    const o1 = arbol(path.join(dir, 'backups', 'p'), 2, 'b7');
    const c1 = H.cuarentenaDe(aid, 0);
    plantarJournalBorrado(H, {
      v: 1, action_id: aid, writer: W_A, tipo: 'borrar-proyecto', base_commit_id: dbmod.getCommitActual(),
      fase: 'retirando', startedAt: 'x',
      recursos: [{ tipo: 'directorio', scope: 'subtree', origen: o1, cuarentena: c1, n_archivos: 2, bytes_totales: 8 }],
    });
    fsReal.mkdirSync(path.join(H.borradosDir(), aid), { recursive: true });
    fs.renameSync(o1, c1);
    const hCuar = huellaArbol(c1);
    arbol(o1, 1, 'TERCERO');                  // algo distinto reaparece
    const hTercero = huellaArbol(o1);
    const nR = renames.length;
    const rec = await H.recuperarBorradosPendientes();
    const bien = rec.ok === false && rec.malos[0].clase === 'rollback-bloqueado' &&
      huellaArbol(o1) === hTercero && huellaArbol(c1) === hCuar &&
      fsReal.existsSync(H.journalBorradoPath(aid)) && renamesDesde(nR).length === 0;
    ok('B7 tercer contenido: no se pisa, se conserva todo, sesion bloqueada', bien, JSON.stringify(rec.malos[0] || {}));
    anotarB('B7', bien ? 'fail-closed' : 'REVISAR', 'origen + cuarentena + journal, los tres conservados');
  }

  // --- B8: la particion falla en F4 ----------------------------------------
  {
    const dir = carpeta('b8'); const m = await montar(dir, W_A);
    const est = {}; const M = construirMain(est);
    let intentos = 0;
    const H = montarHelper(M, {
      vaciarParticion: () => { intentos++; if (intentos === 1) throw new Error('clearStorageData fallo (simulado)'); },
    });
    const o1 = arbol(path.join(dir, 'backups', 'p'), 2, 'b8');
    const r = await H.ejecutarBorrado({
      tipo: 'borrar-proyecto', particion: 'persist:p1',
      recursos: [{ tipo: 'directorio', scope: 'subtree', origen: o1 }],
      sentencias: () => [{ sql: 'DELETE FROM projects WHERE id=?', params: [m.pid] }],
    });
    const journalSigue = fsReal.existsSync(H.journalBorradoPath(r.actionId));
    const rec = await H.recuperarBorradosPendientes();     // segundo arranque
    const bien = r.aplicado === true && r.verificado === true && r.purga.ok === false &&
      r.purga.particionPendiente === true && journalSigue && !fsReal.existsSync(o1) &&
      intentos === 2 && rec.ok === true && !fsReal.existsSync(H.journalBorradoPath(r.actionId));
    ok('B8 particion huerfana: se reintenta al arrancar y entonces cierra', bien,
      JSON.stringify({ purga: r.purga, intentos, rec: rec.ok }));
    anotarB('B8', bien ? 'particion reintentada' : 'REVISAR', 'journal conservado hasta vaciar la particion');
  }

  // --- B9: otro equipo publica un backup entre F2 y F3 ----------------------
  {
    const dir = carpeta('b9'); const m = await montar(dir, W_A);
    const est = {}; const M = construirMain(est);
    const o1 = arbol(path.join(dir, 'backups', 'p'), 2, 'b9');
    const nRb9 = renames.length;
    let H = null;
    H = montarHelper(M, {
      escribirMultiple: (s, o) => {
        // Justo antes de confirmar: el otro equipo avanza la BD Y recrea la
        // carpeta que acabamos de retirar.
        fsReal.mkdirSync(o1, { recursive: true });
        fsReal.writeFileSync(path.join(o1, 'backup-de-otro.json'), 'DEL OTRO EQUIPO', 'utf8');
        const e = new Error('otro equipo guardo mientras tanto');
        e.kind = 'base-cambiada';
        throw e;
      },
    });
    const r = await H.ejecutarBorrado({
      tipo: 'borrar-proyecto',
      recursos: [{ tipo: 'directorio', scope: 'subtree', origen: o1 }],
      sentencias: () => [{ sql: 'DELETE FROM projects WHERE id=?', params: [m.pid] }],
    });
    const ajenoVive = fsReal.existsSync(path.join(o1, 'backup-de-otro.json')) &&
      fsReal.readFileSync(path.join(o1, 'backup-de-otro.json'), 'utf8') === 'DEL OTRO EQUIPO';
    const journalSigue = fsReal.existsSync(H.journalBorradoPath(r.actionId));
    const cuarSigue = fsReal.existsSync(H.cuarentenaDe(r.actionId, 0));
    const filas = dbmod.get('SELECT COUNT(*) n FROM projects');
    // Se comprueba el MECANISMO, no el resultado: en NTFS local el rename
    // sobre un directorio existente da EPERM y el dato se salvaria igual. En
    // G: NO falla y lo reemplazaria (§4.10). Por eso lo que se exige aqui es
    // que el rename ni siquiera se intente.
    const intentosDeReponer = renamesHacia(nRb9, o1);
    const bien = r.aplicado === false && r.bloqueo === 'accion-no-demostrable' &&
      ajenoVive && journalSigue && cuarSigue && filas.n === 1 && intentosDeReponer.length === 0;
    ok('B9 destino recreado por otro equipo: NO-CLOBBER, ni se intenta el rename, el backup ajeno sobrevive', bien,
      JSON.stringify({ aplicado: r.aplicado, bloqueo: r.bloqueo, ajenoVive, journalSigue, cuarSigue, filas: filas.n, intentos: intentosDeReponer.length }));
    anotarB('B9', bien ? 'fail-closed, ajeno intacto' : 'REVISAR', 'cuarentena + journal conservados');
  }

  // --- B10: journal de otro writer sobre el mismo destino -------------------
  {
    const dir = carpeta('b10'); const m = await montar(dir, W_A);
    const est = {}; const M = construirMain(est); const H = montarHelper(M);
    const o1 = arbol(path.join(dir, 'backups', 'p'), 2, 'b10');
    const o2 = arbol(path.join(dir, 'backups', 'otro-proyecto'), 1, 'b10b');
    const aidAjeno = 'ab'.repeat(16);
    plantarJournalBorrado(H, {
      v: 1, action_id: aidAjeno, writer: W_B, tipo: 'borrar-proyecto', base_commit_id: commitFalso(),
      fase: 'retirando', startedAt: 'x',
      recursos: [{ tipo: 'directorio', scope: 'subtree', origen: o1, cuarentena: H.cuarentenaDe(aidAjeno, 0), n_archivos: 2, bytes_totales: 8 }],
    });
    const h1 = huellaArbol(o1);
    const r1 = await H.ejecutarBorrado({ tipo: 'borrar-proyecto', recursos: [{ tipo: 'directorio', scope: 'subtree', origen: o1 }], sentencias: () => [] });
    const r2 = await H.ejecutarBorrado({ tipo: 'borrar-proyecto', recursos: [{ tipo: 'directorio', scope: 'subtree', origen: o2 }], sentencias: () => [] });
    const bien = r1.aplicado === false && r1.bloqueo === 'ocupado-otro-writer' && r1.reintentable === true &&
      huellaArbol(o1) === h1 && r2.aplicado === true;
    ok('B10 journal ajeno: se rechaza SOLO esa accion, la otra sigue permitida', bien,
      JSON.stringify({ r1: r1.bloqueo, r2: r2.aplicado }));
    anotarB('B10', bien ? 'rechazo acotado' : 'REVISAR', 'journal ajeno intacto');
  }

  // --- B11: journal propio incompleto --------------------------------------
  {
    const dir = carpeta('b11'); await montar(dir, W_A);
    const est = {}; const M = construirMain(est); const H = montarHelper(M);
    const aid = '11'.repeat(16);
    const o1 = arbol(path.join(dir, 'backups', 'p'), 2, 'b11');
    const h1 = huellaArbol(o1);
    fsReal.mkdirSync(H.borradosDir(), { recursive: true });
    fsReal.writeFileSync(H.journalBorradoPath(aid), JSON.stringify({
      v: 1, action_id: aid, writer: W_A, tipo: 'borrar-proyecto', base_commit_id: dbmod.getCommitActual(),
      fase: 'retirando', startedAt: 'x', recursos: [{ tipo: 'directorio', scope: 'subtree', origen: o1 }],
    }), 'utf8');
    const nR = renames.length;
    const rec = await H.recuperarBorradosPendientes();
    const r = await H.ejecutarBorrado({ tipo: 'borrar-proyecto', recursos: [{ tipo: 'directorio', scope: 'subtree', origen: o1 }], sentencias: () => [] });
    const bien = rec.ok === false && rec.malos[0].clase === 'journal-no-demostrable' &&
      r.aplicado === false && r.bloqueo === 'accion-no-demostrable' && r.reintentable === false &&
      huellaArbol(o1) === h1 && fsReal.existsSync(H.journalBorradoPath(aid)) && renamesDesde(nR).length === 0;
    ok('B11 journal propio incompleto: ni reponer ni purgar; nada nuevo empieza', bien,
      JSON.stringify({ rec: rec.malos[0] && rec.malos[0].clase, bloqueo: r.bloqueo }));
    anotarB('B11', bien ? 'fail-closed' : 'REVISAR', 'journal conservado; origen intacto');
  }

  // --- B12: segundo arranque tras cada caso --------------------------------
  {
    const dir = carpeta('b12'); await montar(dir, W_A);
    const est = {}; const M = construirMain(est); const H = montarHelper(M);
    // b12a: caso A idempotente
    const aidA = '12'.repeat(16);
    const oA = arbol(path.join(dir, 'backups', 'pa'), 2, 'b12a');
    const cA = H.cuarentenaDe(aidA, 0);
    plantarJournalBorrado(H, {
      v: 1, action_id: aidA, writer: W_A, tipo: 'borrar-proyecto', base_commit_id: dbmod.getCommitActual(),
      fase: 'retirando', startedAt: 'x', recursos: [{ tipo: 'directorio', scope: 'subtree', origen: oA, cuarentena: cA, n_archivos: 2, bytes_totales: 8 }],
    });
    fsReal.mkdirSync(path.join(H.borradosDir(), aidA), { recursive: true });
    fs.renameSync(oA, cA);
    const hA = huellaArbol(cA);
    const r1 = await H.recuperarBorradosPendientes();
    const tras1 = huellaArbol(oA);
    const r2 = await H.recuperarBorradosPendientes();
    ok('B12 caso A: el segundo arranque no cambia nada', r1.ok && r2.ok && tras1 === hA && huellaArbol(oA) === hA);

    // b12b: B7 sigue fail-closed en el segundo arranque
    const aidB = '13'.repeat(16);
    const oB = arbol(path.join(dir, 'backups', 'pb'), 2, 'b12b');
    const cB = H.cuarentenaDe(aidB, 0);
    plantarJournalBorrado(H, {
      v: 1, action_id: aidB, writer: W_A, tipo: 'borrar-proyecto', base_commit_id: dbmod.getCommitActual(),
      fase: 'retirando', startedAt: 'x', recursos: [{ tipo: 'directorio', scope: 'subtree', origen: oB, cuarentena: cB, n_archivos: 2, bytes_totales: 8 }],
    });
    fsReal.mkdirSync(path.join(H.borradosDir(), aidB), { recursive: true });
    fs.renameSync(oB, cB);
    arbol(oB, 1, 'TERCERO');
    const hOB = huellaArbol(oB), hCB = huellaArbol(cB);
    const s1 = await H.recuperarBorradosPendientes();
    const s2 = await H.recuperarBorradosPendientes();
    const bienB = s1.ok === false && s2.ok === false && huellaArbol(oB) === hOB && huellaArbol(cB) === hCB;
    ok('B12 caso B7: sigue fail-closed en el segundo arranque, sin destruir nada', bienB);

    // b12c: B11 sigue fail-closed
    const aidC = '14'.repeat(16);
    fsReal.writeFileSync(H.journalBorradoPath(aidC), '{"v":1,"action_id":"' + aidC + '","writer":"' + W_A + '"}', 'utf8');
    const t1 = await H.recuperarBorradosPendientes();
    const t2 = await H.recuperarBorradosPendientes();
    const bienC = t1.ok === false && t2.ok === false && fsReal.existsSync(H.journalBorradoPath(aidC));
    ok('B12 caso B11: journal incompleto sigue intacto tras dos arranques', bienC);
    anotarB('B12', (r1.ok && r2.ok && bienB && bienC) ? 'idempotente' : 'REVISAR', 'los fail-closed no degradan');
  }

  // =========================================================================
  seccion('DEL-W-SUBTREE / DEL-W-MULTIRESOURCE — dominio de ocupacion COMUN');
  // =========================================================================
  {
    const dir = carpeta('w-subtree'); const m = await montar(dir, W_A);
    // Se monta el ambito real con el CABLEADO (1): el Bloque 4 pregunta al
    // dominio comun. El cuerpo de ejecutarAccionDeArchivo no se toca.
    let H = null;
    const est = {};
    const M = construirMain(est);
    H = montarHelper(M);
    ok('el cableado sustituyo el dominio de ocupacion del Bloque 4',
      M.destinoOcupadoPorOtroEquipo !== undefined && typeof M.destinoOcupadoPorOtroEquipo === 'function' &&
      M.destinoOcupadoPorOtroEquipo(path.join(dir, 'nada')).ocupado === false);

    // A (otro equipo) retira backups/<slug> del proyecto 1
    const slug = 'p1-proyecto-uno';
    const dirBk = path.join(dir, 'backups', slug);
    arbol(dirBk, 2, 'de-A');
    const aidA = 'aa'.repeat(16);
    plantarJournalBorrado(H, {
      v: 1, action_id: aidA, writer: W_B, tipo: 'borrar-proyecto', base_commit_id: commitFalso(),
      fase: 'retirando', startedAt: 'x',
      recursos: [{ tipo: 'directorio', scope: 'subtree', origen: dirBk, cuarentena: H.cuarentenaDe(aidA, 0), n_archivos: 2, bytes_totales: 8 }],
    });
    fsReal.mkdirSync(path.join(H.borradosDir(), aidA), { recursive: true });
    fs.renameSync(dirBk, H.cuarentenaDe(aidA, 0));
    const hCuar = huellaArbol(H.cuarentenaDe(aidA, 0));

    // B (nosotros) intenta un backup DEL MISMO proyecto, con la funcion REAL
    const commit0 = dbmod.getCommitActual();
    const destino = path.join(dirBk, 'backup_2026.json');
    const nR = renames.length;
    const r = M.ejecutarAccionDeArchivo({
      tipo: 'backup', destino, contenidoPlano: '{"x":1}',
      sentencias: () => [{ sql: 'INSERT INTO backups(project_id,created_at,payload,size) VALUES (?,?,?,?)', params: [m.pid, 'x', '{}', 2] }],
    });
    const nFilas = dbmod.get('SELECT COUNT(*) n FROM backups').n;
    ok('DEL-W-SUBTREE B no publica: rechazo ocupado-otro-writer',
      r.aplicado === false && r.bloqueo === 'ocupado-otro-writer' && r.reintentable === true, JSON.stringify(r));
    ok('DEL-W-SUBTREE B NO recrea la carpeta retirada', !fsReal.existsSync(dirBk));
    ok('DEL-W-SUBTREE B no toca la BD', dbmod.getCommitActual() === commit0 && nFilas === 0);
    ok('DEL-W-SUBTREE cuarentena y journal de A intactos',
      huellaArbol(H.cuarentenaDe(aidA, 0)) === hCuar && fsReal.existsSync(H.journalBorradoPath(aidA)));
    ok('DEL-W-SUBTREE B no dejo ningun rename ni tmp',
      renamesDesde(nR).length === 0 && fsReal.readdirSync(path.join(dir, 'backups')).every((f) => !/\.tmp-/.test(f)));

    // ... pero SI puede guardar en OTRO proyecto
    const pid2 = dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('Dos','c','persist:p2','x','x')");
    const dirBk2 = path.join(dir, 'backups', 'p2-dos');
    fsReal.mkdirSync(dirBk2, { recursive: true });
    const r2 = M.ejecutarAccionDeArchivo({
      tipo: 'backup', destino: path.join(dirBk2, 'b.json'), contenidoPlano: '{"y":2}',
      sentencias: () => [{ sql: 'INSERT INTO backups(project_id,created_at,payload,size) VALUES (?,?,?,?)', params: [pid2, 'x', '{}', 2] }],
    });
    ok('DEL-W-SUBTREE B SI puede guardar en otro proyecto', r2.aplicado === true, JSON.stringify(r2));

    // A puede hacer rollback con un rename limpio
    const nR3 = renames.length;
    const rep = H.reponerRecurso({ origen: dirBk, cuarentena: H.cuarentenaDe(aidA, 0) });
    ok('DEL-W-SUBTREE A puede reponer con un rename limpio',
      rep.estado === 'repuesto' && renamesDesde(nR3).length === 1 && huellaArbol(dirBk) === hCuar);
  }

  {
    const dir = carpeta('w-multi'); const m = await montar(dir, W_A);
    let H = null; const est = {};
    const M = construirMain(est);
    H = montarHelper(M);
    // UN journal ajeno con DOS recursos: backups y el dashboard horneado.
    const dirBk = arbol(path.join(dir, 'backups', 'p1-proyecto-uno'), 2, 'multi-a');
    const dirDash = arbol(path.join(dir, 'projects', 'p1'), 2, 'multi-b');
    const aid = 'ac'.repeat(16);
    plantarJournalBorrado(H, {
      v: 1, action_id: aid, writer: W_B, tipo: 'borrar-proyecto', base_commit_id: commitFalso(),
      fase: 'retirando', startedAt: 'x',
      recursos: [
        { tipo: 'directorio', scope: 'subtree', origen: dirBk, cuarentena: H.cuarentenaDe(aid, 0), n_archivos: 2, bytes_totales: 8 },
        { tipo: 'directorio', scope: 'subtree', origen: dirDash, cuarentena: H.cuarentenaDe(aid, 1), n_archivos: 2, bytes_totales: 8 },
      ],
    });
    const res = H.recursosReservados();
    ok('DEL-W-MULTIRESOURCE el dominio comun ve los DOS recursos del mismo journal',
      res.ok && res.recursos.length === 2 && res.recursos.every((r) => r.fuente === 'borrado' && r.scope === 'subtree'),
      JSON.stringify(res.recursos && res.recursos.map((r) => r.origen)));

    const commit0 = dbmod.getCommitActual();
    const rBk = M.ejecutarAccionDeArchivo({ tipo: 'backup', destino: path.join(dirBk, 'x.json'), contenidoPlano: '{}', sentencias: () => [] });
    const rDash = M.ejecutarAccionDeArchivo({ tipo: 'backup', destino: path.join(dirDash, 'sub', 'y.json'), contenidoPlano: '{}', sentencias: () => [] });
    ok('DEL-W-MULTIRESOURCE recurso 1 (backups) bloqueado',
      rBk.aplicado === false && rBk.bloqueo === 'ocupado-otro-writer', JSON.stringify(rBk));
    ok('DEL-W-MULTIRESOURCE recurso 2 (dashboard horneado) bloqueado, incluso en un subnivel',
      rDash.aplicado === false && rDash.bloqueo === 'ocupado-otro-writer', JSON.stringify(rDash));
    ok('DEL-W-MULTIRESOURCE la BD no se movio', dbmod.getCommitActual() === commit0);

    // y un borrado NUESTRO que toca cualquiera de los dos tambien se rechaza
    const rb1 = await H.ejecutarBorrado({ tipo: 'borrar-proyecto', recursos: [{ tipo: 'directorio', scope: 'subtree', origen: dirBk }], sentencias: () => [] });
    const rb2 = await H.ejecutarBorrado({ tipo: 'borrar-proyecto', recursos: [{ tipo: 'directorio', scope: 'subtree', origen: dirDash }], sentencias: () => [] });
    ok('DEL-W-MULTIRESOURCE un borrado propio sobre cualquiera de los dos se rechaza',
      rb1.bloqueo === 'ocupado-otro-writer' && rb2.bloqueo === 'ocupado-otro-writer');

    // la particion NO es un recurso reservable
    ok('DEL-W-MULTIRESOURCE la particion no entra como recurso reversible',
      res.recursos.every((r) => r.origen !== 'persist:p1'));
  }

  // =========================================================================
  seccion('DEL-X1/X2/X3 — cruce entre .panorama-acciones y .panorama-borrados');
  // =========================================================================
  {
    const dir = carpeta('del-x'); const m = await montar(dir, W_A);
    let H = null; const est = {};
    const M = construirMain(est);
    H = montarHelper(M);
    const dirBk = arbol(path.join(dir, 'backups', 'p1-proyecto-uno'), 2, 'x');
    const estado = path.join(dirBk, 'evaluacion-candidatos', 'estado.json');
    fsReal.mkdirSync(path.dirname(estado), { recursive: true });
    fsReal.writeFileSync(estado, '{"puestos":[]}', 'utf8');

    // X1: journal de BLOQUE 4 (ajeno) sobre estado.json -> un borrado del
    // proyecto NO empieza.
    const aidAcc = 'ad'.repeat(16);
    fsReal.mkdirSync(M.accionesDir(), { recursive: true });
    fsReal.writeFileSync(M.journalAccionPath(aidAcc), JSON.stringify({
      v: 1, action_id: aidAcc, writer: W_B, tipo: 'candidate-eval', base_commit_id: commitFalso(),
      cifrado: 0, destino: estado, modo: 'overwrite',
      original_sha256: 'a'.repeat(64), original_size: 10, new_sha256: 'b'.repeat(64), new_size: 10,
      fase: 'publicando', startedAt: 'x',
    }), 'utf8');
    const h = huellaArbol(dirBk);
    const rX1 = await H.ejecutarBorrado({ tipo: 'borrar-proyecto', recursos: [{ tipo: 'directorio', scope: 'subtree', origen: dirBk }], sentencias: () => [] });
    ok('DEL-X1 journal de accion ajeno sobre estado.json: el borrado NO empieza',
      rX1.aplicado === false && rX1.bloqueo === 'ocupado-otro-writer' && huellaArbol(dirBk) === h, JSON.stringify(rX1));

    // X2: journal de BORRADO sobre la prep -> un meeting:* sobre ese archivo
    // no empieza.
    fsReal.unlinkSync(M.journalAccionPath(aidAcc));
    const prep = path.join(dirBk, 'reuniones', 'prep-7.json');
    fsReal.mkdirSync(path.dirname(prep), { recursive: true });
    fsReal.writeFileSync(prep, '{"v":1}', 'utf8');
    const aidDel = 'ae'.repeat(16);
    plantarJournalBorrado(H, {
      v: 1, action_id: aidDel, writer: W_B, tipo: 'borrar-prep', base_commit_id: commitFalso(),
      fase: 'retirando', startedAt: 'x',
      recursos: [{ tipo: 'archivo', scope: 'archivo', origen: prep, cuarentena: H.cuarentenaDe(aidDel, 0), sha256: 'c'.repeat(64), size: 7 }],
    });
    const commit0 = dbmod.getCommitActual();
    const rX2 = M.ejecutarAccionDeArchivo({ tipo: 'meeting-editar', destino: prep, contenidoPlano: '{"v":2}', sentencias: () => [] });
    ok('DEL-X2 journal de borrado sobre la prep: meeting:* NO empieza',
      rX2.aplicado === false && rX2.bloqueo === 'ocupado-otro-writer' &&
      fsReal.readFileSync(prep, 'utf8') === '{"v":1}' && dbmod.getCommitActual() === commit0, JSON.stringify(rX2));

    // X3: un borrado del proyecto A no bloquea un backup del proyecto B
    const pid2 = dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('Dos','c','persist:p2','x','x')");
    const dirBk2 = path.join(dir, 'backups', 'p2-dos');
    fsReal.mkdirSync(dirBk2, { recursive: true });
    const aidDel2 = 'af'.repeat(16);
    plantarJournalBorrado(H, {
      v: 1, action_id: aidDel2, writer: W_B, tipo: 'borrar-proyecto', base_commit_id: commitFalso(),
      fase: 'retirando', startedAt: 'x',
      recursos: [{ tipo: 'directorio', scope: 'subtree', origen: dirBk, cuarentena: H.cuarentenaDe(aidDel2, 0), n_archivos: 1, bytes_totales: 7 }],
    });
    fsReal.unlinkSync(H.journalBorradoPath(aidDel));
    const rX3 = M.ejecutarAccionDeArchivo({
      tipo: 'backup', destino: path.join(dirBk2, 'b.json'), contenidoPlano: '{"z":3}',
      sentencias: () => [{ sql: 'INSERT INTO backups(project_id,created_at,payload,size) VALUES (?,?,?,?)', params: [pid2, 'x', '{}', 2] }],
    });
    ok('DEL-X3 un borrado del proyecto A SI permite un backup del proyecto B',
      rX3.aplicado === true && rX3.verificado === true, JSON.stringify(rX3));
  }

  // =========================================================================
  seccion('DEL-LEGACY-SLUG — backup_dir NULL sin efectos colaterales');
  // =========================================================================
  {
    const dir = carpeta('legacy'); await montar(dir, W_A);
    const est = {}; const M = construirMain(est); const H = montarHelper(M);
    const pid = dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at,backup_dir) VALUES ('Legado SA','c','persist:pl','x','x',NULL)");
    const row = dbmod.get('SELECT * FROM projects WHERE id=?', [pid]);
    ok('DEL-LEGACY-SLUG el proyecto tiene backup_dir NULL (control)', row.backup_dir === null || row.backup_dir === undefined);

    const commit0 = dbmod.getCommitActual();
    const slugPuro = H.slugDeProyectoPuro(row);
    const rutaPura = H.rutaBackupsPura(row);
    const rowTras = dbmod.get('SELECT * FROM projects WHERE id=?', [pid]);
    ok('DEL-LEGACY-SLUG la ruta pura NO cambia el commit',
      dbmod.getCommitActual() === commit0, commit0 + ' -> ' + dbmod.getCommitActual());
    ok('DEL-LEGACY-SLUG la ruta pura NO hace UPDATE implicito de backup_dir',
      rowTras.backup_dir === null || rowTras.backup_dir === undefined, JSON.stringify(rowTras.backup_dir));
    ok('DEL-LEGACY-SLUG la ruta pura NO crea la carpeta', !fsReal.existsSync(rutaPura));
    ok('DEL-LEGACY-SLUG el slug derivado coincide con el de produccion',
      slugPuro === `${row.id}-${M.slugify(row.name)}`, slugPuro);

    // contraste: la funcion de produccion SI tiene los dos efectos
    const commit1 = dbmod.getCommitActual();
    const slugProd = M.ensureProjectBackupDirSlug(row);
    const rowProd = dbmod.get('SELECT * FROM projects WHERE id=?', [pid]);
    ok('DEL-LEGACY-SLUG contraste: ensureProjectBackupDirSlug SI hace UPDATE y SI mueve el commit',
      slugProd === slugPuro && rowProd.backup_dir === slugPuro && dbmod.getCommitActual() !== commit1);

    // y si F3 falla, la fila y los archivos quedan como antes
    const dirBk = arbol(rutaPura, 2, 'legacy');
    const h = huellaArbol(dirBk);
    const commit2 = dbmod.getCommitActual();
    const H2 = montarHelper(M, {
      escribirMultiple: () => { const e = new Error('rechazo simulado'); e.kind = 'conflicto'; throw e; },
    });
    const r = await H2.ejecutarBorrado({
      tipo: 'borrar-proyecto', recursos: [{ tipo: 'directorio', scope: 'subtree', origen: dirBk }],
      sentencias: () => [{ sql: 'DELETE FROM projects WHERE id=?', params: [pid] }],
    });
    const rowFin = dbmod.get('SELECT * FROM projects WHERE id=?', [pid]);
    ok('DEL-LEGACY-SLUG si F3 falla, fila y archivos quedan exactamente como antes',
      r.aplicado === false && !!rowFin && huellaArbol(dirBk) === h && dbmod.getCommitActual() === commit2,
      JSON.stringify({ aplicado: r.aplicado, fila: !!rowFin }));
  }

  // =========================================================================
  seccion('F-1 GLOBAL — los dos sentidos');
  // =========================================================================
  {
    // (1) journal propio de GUARDADO pendiente -> un BORRADO nuevo no empieza
    const dir = carpeta('f1-a'); const m = await montar(dir, W_A);
    let H = null; const est = {};
    const M = construirMain(est);
    H = montarHelper(M);
    const dirBk = arbol(path.join(dir, 'backups', 'p1-proyecto-uno'), 2, 'f1a');
    const destino = path.join(dirBk, 'pendiente.json');
    fsReal.writeFileSync(destino, 'contenido', 'utf8');
    const h = huellaArbol(dirBk);   // DESPUES de escribir pendiente.json, que cae dentro
    const aidAcc = 'ba'.repeat(16);
    fsReal.mkdirSync(M.accionesDir(), { recursive: true });
    fsReal.writeFileSync(M.journalAccionPath(aidAcc), JSON.stringify({
      v: 1, action_id: aidAcc, writer: W_A, tipo: 'backup', base_commit_id: dbmod.getCommitActual(),
      cifrado: 0, destino, modo: 'overwrite',
      original_sha256: 'a'.repeat(64), original_size: 9, new_sha256: 'b'.repeat(64), new_size: 9,
      fase: 'publicando', startedAt: 'x',
    }), 'utf8');

    const marcaAntes = M.leerMarcaAcciones();
    const commit0 = dbmod.getCommitActual();
    const nR = renames.length;
    const journalsAntes = fsReal.readdirSync(H.borradosDir ? (fsReal.existsSync(H.borradosDir()) ? H.borradosDir() : dir) : dir);
    const r = await H.ejecutarBorrado({
      tipo: 'borrar-proyecto', recursos: [{ tipo: 'directorio', scope: 'subtree', origen: dirBk }],
      sentencias: () => [{ sql: 'DELETE FROM projects WHERE id=?', params: [m.pid] }],
    });
    const filas = dbmod.get('SELECT COUNT(*) n FROM projects').n;
    const journalsBorrado = fsReal.existsSync(H.borradosDir()) ? fsReal.readdirSync(H.borradosDir()).filter((f) => /\.json$/.test(f)) : [];
    const bien1 = r.aplicado === false && r.bloqueo === 'accion-no-demostrable' &&
      journalsBorrado.length === 0 && renamesDesde(nR).length === 0 && filas === 1 &&
      dbmod.getCommitActual() === commit0 &&
      JSON.stringify(M.leerMarcaAcciones()) === JSON.stringify(marcaAntes) &&
      huellaArbol(dirBk) === h;
    ok('F-1 GLOBAL (1) guardado pendiente -> el borrado no empieza: 0 action_id, 0 publicacion, 0 DELETE, marca quieta',
      bien1, JSON.stringify({ bloqueo: r.bloqueo, journals: journalsBorrado.length, renames: renamesDesde(nR).length, filas }));

    // (2) journal propio de BORRADO pendiente -> un GUARDADO nuevo no empieza
    const dir2 = carpeta('f1-b'); const m2 = await montar(dir2, W_A);
    let H2 = null; const est2 = {};
    const M2 = construirMain(est2);
    H2 = montarHelper(M2);
    const dirBk2 = arbol(path.join(dir2, 'backups', 'p1-proyecto-uno'), 2, 'f1b');
    const aidDel = 'bb'.repeat(16);
    plantarJournalBorrado(H2, {
      v: 1, action_id: aidDel, writer: W_A, tipo: 'borrar-proyecto', base_commit_id: dbmod.getCommitActual(),
      fase: 'retirando', startedAt: 'x',
      recursos: [{ tipo: 'directorio', scope: 'subtree', origen: path.join(dir2, 'backups', 'otro'), cuarentena: H2.cuarentenaDe(aidDel, 0), n_archivos: 1, bytes_totales: 4 }],
    });
    const marca2Antes = M2.leerMarcaAcciones();
    const commit2 = dbmod.getCommitActual();
    const entradas0 = M2.vecesEntradaReal();
    const nR2 = renames.length;
    const rg = M2.ejecutarAccionDeArchivo({
      tipo: 'backup', destino: path.join(dirBk2, 'nuevo.json'), contenidoPlano: '{"a":1}',
      sentencias: () => [{ sql: 'INSERT INTO backups(project_id,created_at,payload,size) VALUES (?,?,?,?)', params: [m2.pid, 'x', '{}', 2] }],
    });
    const accJournals = fsReal.existsSync(M2.accionesDir()) ? fsReal.readdirSync(M2.accionesDir()) : [];
    const bien2 = rg.aplicado === false && rg.bloqueo === 'accion-no-demostrable' &&
      // La puerta F-1 de borrados vive DENTRO de ejecutarAccionDeArchivo (ya no
      // es un envoltorio del arnes), asi que entrar y salir por la guarda es lo
      // correcto. Lo que se exige es que no haga NADA — eso son las lineas de
      // abajo: cero journal de accion, cero rename, cero archivo publicado,
      // cero INSERT, commit quieto y marca quieta.
      M2.vecesEntradaReal() === entradas0 + 1 &&
      accJournals.length === 0 && renamesDesde(nR2).length === 0 &&
      !fsReal.existsSync(path.join(dirBk2, 'nuevo.json')) &&
      dbmod.get('SELECT COUNT(*) n FROM backups').n === 0 &&
      dbmod.getCommitActual() === commit2 &&
      JSON.stringify(M2.leerMarcaAcciones()) === JSON.stringify(marca2Antes);
    ok('F-1 GLOBAL (2) borrado pendiente -> el guardado no empieza: 0 action_id, 0 publicacion, 0 INSERT, marca quieta',
      bien2, JSON.stringify({ bloqueo: rg.bloqueo, entradas: M2.vecesEntradaReal() - entradas0, journals: accJournals.length }));

    // y en cuanto el pendiente se resuelve, el guardado vuelve a funcionar
    fsReal.unlinkSync(H2.journalBorradoPath(aidDel));
    const rg2 = M2.ejecutarAccionDeArchivo({
      tipo: 'backup', destino: path.join(dirBk2, 'nuevo.json'), contenidoPlano: '{"a":1}',
      sentencias: () => [{ sql: 'INSERT INTO backups(project_id,created_at,payload,size) VALUES (?,?,?,?)', params: [m2.pid, 'x', '{}', 2] }],
    });
    ok('F-1 GLOBAL resuelto el pendiente, el guardado vuelve a funcionar',
      rg2.aplicado === true && rg2.verificado === true, JSON.stringify(rg2));
  }

  // =========================================================================
  seccion('CV — D4a/D4b sobre el HTML PRODUCTIVO (sin parches)');
  // =========================================================================
  {
    const HTML = fsReal.readFileSync(path.join(PROJ, 'evaluacion-candidatos', 'plantilla_evaluacion_candidatos.html'), 'utf8');
    const srcSave = extraerDe(HTML, 'function saveState(immediate)');
    const srcDo = extraerDe(HTML, 'async function doSaveNow()');

    // 1) §4.9 esta EN PRODUCCION, y en sus DOS mitades.
    ok('CV produccion: saveState(true) propaga el resultado',
      /if \(immediate\) return doSaveNow\(\);/.test(srcSave) && !/if \(immediate\) \{ doSaveNow\(\); return; \}/.test(srcSave));
    ok('CV produccion: saveState con la sesion detenida devuelve contrato, no undefined',
      /if \(guardadosDetenidos\) return Promise\.resolve\(CONTRATO_SESION_DETENIDA\);/.test(srcSave));
    ok('CV produccion: doSaveNow devuelve el contrato en TODAS sus ramas',
      /if \(guardadosDetenidos\) return CONTRATO_SESION_DETENIDA;/.test(srcDo) &&
      /return res \|\| CONTRATO_RESPUESTA_VACIA;/.test(srcDo) &&
      (srcDo.split('return res;').length - 1) === 2 &&
      /catch \(e\) \{[\s\S]*return \{ ok: false, aplicado: false, reintentable: true/.test(srcDo),
      JSON.stringify({ returnRes: srcDo.split('return res;').length - 1 }));
    ok('CV produccion: main.js ya NO borra el CV viejo al elegir uno nuevo',
      !/\.filter\(\(f\) => f\.startsWith\(evalId \+ '__'\)\)/.test(fsReal.readFileSync(path.join(PROJ, 'main.js'), 'utf8')));
    ok('CV produccion: el nombre del CV nuevo lleva nonce ademas del reloj',
      /storedName = `\$\{evalId\}__\$\{Date\.now\(\)\}_\$\{crypto\.randomBytes\(8\)\.toString\('hex'\)\}\$\{ext\}`/
        .test(fsReal.readFileSync(path.join(PROJ, 'main.js'), 'utf8')));

    // 2) se monta el codigo REAL: constantes + saveState + doSaveNow del HTML.
    const constsCv = ['CONTRATO_SESION_DETENIDA', 'CONTRATO_RESPUESTA_VACIA'].map((n) => {
      const a = HTML.indexOf('const ' + n + ' = Object.freeze({');
      if (a < 0) throw new Error('NO SE ENCONTRO la constante ' + n);
      return HTML.slice(a, HTML.indexOf('});', a) + 3) + '\n';
    }).join('');

    // 3) y los DOS manejadores REALES de CV, recortados del propio HTML.
    function ramaDeHtml(desde, hasta) {
      const a = HTML.indexOf(desde);
      if (a < 0) throw new Error('NO SE ENCONTRO la rama: ' + desde);
      const b = HTML.indexOf(hasta, a);
      if (b < 0) throw new Error('NO SE ENCONTRO el final de la rama: ' + hasta);
      return HTML.slice(a + desde.length, b);
    }
    const RAMA_QUITAR = ramaDeHtml("} else if (action === 'quitar-cv') {", "\n  } else if (action === 'toggle-tasks')");
    const RAMA_ADJUNTAR = ramaDeHtml("} else if (action === 'adjuntar-cv' || action === 'cambiar-cv') {", "\n  } else if (action === 'ver-cv')");
    ok('CV las dos ramas reales se recortan del HTML productivo',
      RAMA_QUITAR.indexOf('removeCandidateCv') > 0 && RAMA_ADJUNTAR.indexOf('pickCandidateCv') > 0,
      JSON.stringify({ quitar: RAMA_QUITAR.length, adjuntar: RAMA_ADJUNTAR.length }));

    // Deja que se asienten las promesas: todo el flujo es microtareas.
    async function asentar() {
      for (let k = 0; k < 20; k++) await Promise.resolve();
      await new Promise((r) => setImmediate(r));
      for (let k = 0; k < 20; k++) await Promise.resolve();
    }

    function montarCv(respuesta, opciones) {
      const o = opciones || {};
      const est = { toasts: [], errores: [], avisosPersistentes: [], alerts: [], quitados: [], confirmado: null };
      const cuerpo = constsCv + '\n' +
        'let saveTimer = null; let guardadosDetenidos = false; let avisoReinicioMostrado = false;\n' +
        "const AVISO_SESION_DETENIDA = 'sesion detenida';\n" +
        srcSave + '\n' + srcDo + '\n' +
        'function mutacionesPermitidas() { return !guardadosDetenidos; }\n' +
        'async function quitarCvReal(t) {' + RAMA_QUITAR + '}\n' +
        'async function adjuntarCvReal(t) {' + RAMA_ADJUNTAR + '}\n' +
        'return { saveState, doSaveNow, mutacionesPermitidas, quitarCvReal, adjuntarCvReal,\n' +
        '         detenidos: () => guardadosDetenidos };';
      const f = new Function('window', 'showToast', 'showError', 'mostrarAvisoPersistente', 'psAlert',
        'clearTimeout', 'setTimeout', 'state', 'askConfirm', 'renderEvaluaciones', 'showModalCv', cuerpo);
      const api = f(
        {
          panoramaBridge: {
            saveCandidateEvalData: () => Promise.resolve(respuesta()),
            removeCandidateCv: (s) => { est.quitados.push(s); if (o.alQuitar) o.alQuitar(s); return Promise.resolve({ ok: true }); },
            pickCandidateCv: () => Promise.resolve(o.pick ? o.pick() : { ok: false, canceled: true }),
          },
        },
        (m) => est.toasts.push(m), (m) => est.errores.push(m),
        (m) => est.avisosPersistentes.push(m), (m) => { est.alerts.push(m); return Promise.resolve(); },
        () => {}, () => null, o.state || { puestos: [], evaluaciones: [] },
        // askConfirm(titulo, mensaje, cb): se captura la promesa del callback
        // para poder esperarla; el codigo real no la devuelve.
        (tit, msg, cb) => { est.confirmado = cb(); },
        () => { est.renders = (est.renders || 0) + 1; }, () => {});
      return { api, est };
    }

    // --- CV-RM-1/2/3: quitar CV, con la rama REAL --------------------------
    async function correrQuitar(respuesta, cvPath, ev) {
      const st = { puestos: [], evaluaciones: [ev] };
      const { api, est } = montarCv(respuesta, {
        state: st,
        alQuitar: () => { try { fsReal.unlinkSync(cvPath); } catch (e) {} },
      });
      await api.quitarCvReal({ dataset: { id: ev.id } });
      if (est.confirmado) await est.confirmado;
      await asentar();
      return { api, est };
    }
    {
      const d = carpeta('cv-rm1'); const cv = path.join(d, 'e1__1.pdf'); fsReal.writeFileSync(cv, 'CV', 'utf8');
      const ev = { id: 'e1', cvFileName: 'cv.pdf', cvStoredName: 'e1__1.pdf' };
      const { est } = await correrQuitar(() => ({ ok: false, aplicado: false, reintentable: true, error: 'no se pudo' }), cv, ev);
      ok('CV-RM-1 aplicado:false -> el estado vuelve a referenciar el CV y el archivo sigue',
        ev.cvStoredName === 'e1__1.pdf' && ev.cvFileName === 'cv.pdf' && fsReal.existsSync(cv) && est.quitados.length === 0,
        JSON.stringify({ ev, quitados: est.quitados }));
    }
    {
      const d = carpeta('cv-rm2'); const cv = path.join(d, 'e1__1.pdf'); fsReal.writeFileSync(cv, 'CV', 'utf8');
      const ev = { id: 'e1', cvFileName: 'cv.pdf', cvStoredName: 'e1__1.pdf' };
      const { api, est } = await correrQuitar(() => ({ ok: true, aplicado: true, verificado: false, requiereReinicio: true, aviso: 'reinicia' }), cv, ev);
      ok('CV-RM-2 aplicado:true/verificado:false -> estado sin CV, el CV FISICO se conserva, sesion detenida',
        ev.cvStoredName === null && fsReal.existsSync(cv) && est.quitados.length === 0 &&
        api.detenidos() === true && est.avisosPersistentes.length === 1 && api.mutacionesPermitidas() === false,
        JSON.stringify({ ev, existe: fsReal.existsSync(cv), quitados: est.quitados, detenidos: api.detenidos() }));
    }
    {
      const d = carpeta('cv-rm3'); const cv = path.join(d, 'e1__1.pdf'); fsReal.writeFileSync(cv, 'CV', 'utf8');
      const ev = { id: 'e1', cvFileName: 'cv.pdf', cvStoredName: 'e1__1.pdf' };
      const { est } = await correrQuitar(() => ({ ok: true, aplicado: true, verificado: true }), cv, ev);
      ok('CV-RM-3 aplicado:true/verificado:true -> solo entonces desaparece el CV',
        ev.cvStoredName === null && !fsReal.existsSync(cv) && est.quitados.length === 1 && est.quitados[0] === 'e1__1.pdf',
        JSON.stringify({ ev, quitados: est.quitados, existe: fsReal.existsSync(cv) }));
    }

    // --- CV-REPLACE-1/2/3: cambiar CV, con la rama REAL --------------------
    async function correrCambiar(respuesta, viejo, nuevo, ev) {
      const st = { puestos: [], evaluaciones: [ev] };
      const mapa = { [path.basename(viejo)]: viejo, [path.basename(nuevo)]: nuevo };
      const { api, est } = montarCv(respuesta, {
        state: st,
        pick: () => ({ ok: true, fileName: 'nuevo.pdf', storedName: path.basename(nuevo) }),
        alQuitar: (s) => { try { fsReal.unlinkSync(mapa[s]); } catch (e) {} },
      });
      await api.adjuntarCvReal({ dataset: { id: ev.id } });
      await asentar();
      return { api, est };
    }
    {
      const d = carpeta('cv-rep1');
      const v = path.join(d, 'e1__1.pdf'); fsReal.writeFileSync(v, 'VIEJO', 'utf8');
      const n = path.join(d, 'e1__2.pdf'); fsReal.writeFileSync(n, 'NUEVO', 'utf8');
      const ev = { id: 'e1', cvFileName: 'v.pdf', cvStoredName: 'e1__1.pdf' };
      const { est } = await correrCambiar(() => ({ ok: false, aplicado: false, reintentable: true, error: 'x' }), v, n, ev);
      ok('CV-REPLACE-1 aplicado:false -> vuelve al CV viejo, el viejo intacto, el nuevo se retira',
        ev.cvStoredName === 'e1__1.pdf' && fsReal.existsSync(v) && !fsReal.existsSync(n) &&
        est.quitados.length === 1 && est.quitados[0] === 'e1__2.pdf',
        JSON.stringify({ ev, quitados: est.quitados, viejo: fsReal.existsSync(v), nuevo: fsReal.existsSync(n) }));
    }
    {
      const d = carpeta('cv-rep2');
      const v = path.join(d, 'e1__1.pdf'); fsReal.writeFileSync(v, 'VIEJO', 'utf8');
      const n = path.join(d, 'e1__2.pdf'); fsReal.writeFileSync(n, 'NUEVO', 'utf8');
      const ev = { id: 'e1', cvFileName: 'v.pdf', cvStoredName: 'e1__1.pdf' };
      const { api, est } = await correrCambiar(() => ({ ok: true, aplicado: true, verificado: false, requiereReinicio: true, aviso: 'reinicia' }), v, n, ev);
      ok('CV-REPLACE-2 aplicado:true/verificado:false -> quedan LOS DOS, nada se destruye, reiniciar',
        fsReal.existsSync(v) && fsReal.existsSync(n) && est.quitados.length === 0 &&
        api.detenidos() === true && est.avisosPersistentes.length === 1 && ev.cvStoredName === 'e1__2.pdf',
        JSON.stringify({ quitados: est.quitados, v: fsReal.existsSync(v), n: fsReal.existsSync(n), det: api.detenidos() }));
    }
    {
      const d = carpeta('cv-rep3');
      const v = path.join(d, 'e1__1.pdf'); fsReal.writeFileSync(v, 'VIEJO', 'utf8');
      const n = path.join(d, 'e1__2.pdf'); fsReal.writeFileSync(n, 'NUEVO', 'utf8');
      const ev = { id: 'e1', cvFileName: 'v.pdf', cvStoredName: 'e1__1.pdf' };
      const { est } = await correrCambiar(() => ({ ok: true, aplicado: true, verificado: true }), v, n, ev);
      ok('CV-REPLACE-3 aplicado:true/verificado:true -> ahora si se retira el viejo',
        !fsReal.existsSync(v) && fsReal.existsSync(n) && ev.cvStoredName === 'e1__2.pdf' &&
        est.quitados.length === 1 && est.quitados[0] === 'e1__1.pdf',
        JSON.stringify({ ev, quitados: est.quitados }));
    }

    // --- la propagacion en si ---------------------------------------------
    {
      const { api } = montarCv(() => ({ ok: true, aplicado: true, verificado: true }));
      const p = api.saveState(true);
      ok('CV saveState(true) devuelve una promesa (propaga el contrato)', p && typeof p.then === 'function');
      const r = await p;
      ok('CV saveState(true) resuelve al CONTRATO real de doSaveNow(), no a undefined',
        !!r && r.aplicado === true && r.verificado === true, JSON.stringify(r));
      const { api: api2 } = montarCv(() => ({ ok: true, aplicado: true, verificado: false, requiereReinicio: true, aviso: 'x' }));
      await api2.saveState(true);
      const r2 = await api2.saveState(true);
      ok('CV con la sesion detenida saveState(true) sigue devolviendo contrato (aplicado:false)',
        !!r2 && r2.aplicado === false && r2.reintentable === false, JSON.stringify(r2));
    }
  }

  // =========================================================================
  seccion('RESIDUOS Y PRODUCCION');
  // =========================================================================
  {
    const restos = [];
    const rec = (d, pre) => {
      for (const e of fsReal.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) { if (/panorama-(borrados|acciones)$/.test(e.name)) restos.push(pre + e.name); rec(f, pre + e.name + '/'); }
        else if (/\.tmp-|\.old-/.test(e.name)) restos.push(pre + e.name);
      }
    };
    rec(RAIZ, '');
    console.log('    carpetas de protocolo que quedan: ' + (restos.length ? restos.length : 0));
    ok('sin residuos .tmp- ni .old- en ninguna carpeta de prueba',
      restos.filter((r) => /\.tmp-|\.old-/.test(r)).length === 0,
      restos.filter((r) => /\.tmp-|\.old-/.test(r)).join(', '));
    ok('todas las rutas usadas bajo la marca de pruebas', RAIZ.includes(MARCA_PRUEBAS));
  }

  console.log('\n  MATRIZ B1-B12');
  console.log('  ' + 'id'.padEnd(6) + 'veredicto'.padEnd(28) + 'residuo');
  console.log('  ' + '-'.repeat(84));
  for (const b of resumenB) console.log('  ' + b.id.padEnd(6) + String(b.veredicto).padEnd(28) + b.residuo);

  console.log('\n' + '='.repeat(70));
  console.log(`  BLOQUE 5 — helper de borrados aislado: ${pass} OK, ${fail} FALLOS`);
  if (fallos.length) fallos.forEach((f) => console.log('    - ' + f));
  console.log('='.repeat(70));

  try { dbmod._resetParaPruebas(); } catch (e) {}
  fsReal.rmSync(RAIZ, { recursive: true, force: true });
  console.log('  carpeta de prueba borrada: ' + !fsReal.existsSync(RAIZ));
  process.exitCode = fail === 0 ? 0 : 1;
})().catch((e) => { console.error('EXCEPCION:', e); process.exit(2); });
