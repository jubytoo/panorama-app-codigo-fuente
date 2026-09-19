// ---------------------------------------------------------------------------
// P28 — driver de la batería: CONFINAMIENTO DE RUTAS DE PARTICIONES.
//
// Propiedad central: ninguna operación destructiva actúa sobre una partición salvo
// que se demuestre (A) nombre válido según el contrato de su tipo, (B) base obtenida
// de `app.getPath('sessionData')` y (C) ruta HIJO DIRECTO de `<sessionData>/Partitions`
// — nunca `Partitions/` mismo, su padre, una hermana, una ruta absoluta, UNC u otra
// unidad. Un journal manipulado falla CERRADO (no demostrable) y no se «sanea».
//
// Tres niveles:
//   ESTÁTICO  el helper es el único que construye la ruta; el escritor valida antes de
//             escribir; nunca se decodifica un nombre; la BD lo impide con UNIQUE.
//   UNIDAD    el contrato, el confinamiento, el helper, `leerJournalBorrado`,
//             `leerJournalRestauracion` y `vaciarParticionDe` REALES (por firma).
//   ELECTRON  la app real en sandbox: journals manipulados con su id en la marca
//             (CASO B histórico) y carpetas VÍCTIMA cuyo contenido se compara byte a
//             byte antes y después; sessionData separado de userData; ruta legítima
//             inexistente; `projects:delete` sobre filas con nombre hostil.
//
// Reutiliza el arnés de P26 (`p26/test-p26-purga-desligada.js`). ARN-3: el arnés fija
// APPDATA/LOCALAPPDATA/TEMP/appData/userData/sessionData/temp dentro del sandbox antes
// de cargar nada; aquí se asevera en cada proceso y se compara el guardián real.
// ---------------------------------------------------------------------------
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const P26 = require('../p26/comprobar-p26.js');
const { extraerDe, lineaConstDe, sinComentarios, snapshotGuardian, mainPathDe } = P26;

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const W = 'b'.repeat(32);
const hex = (c) => c.repeat(32);
const REAL = 'persist:proj-1789069653603-vtwioc'; // la FORMA real: 13 dígitos + 6 caracteres [a-z0-9]

function sandboxPara(nombre) {
  const dir = path.join(os.tmpdir(), `_a33-p28-${nombre}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function limpiar(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }

// Manifiesto byte a byte de un árbol: ruta relativa -> sha256 (archivos) o 'dir'.
function manifiesto(raiz) {
  const m = {};
  const rec = (d) => {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { m[path.relative(raiz, p) + '\\'] = 'dir'; rec(p); }
      else { try { m[path.relative(raiz, p)] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); } catch (x) { m[path.relative(raiz, p)] = 'ilegible'; } }
    }
  };
  if (fs.existsSync(raiz)) { m['.\\'] = 'dir'; rec(raiz); }
  return m;
}
function plantar(dir) {
  fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'dato.txt'), 'dato importante de ' + path.basename(dir));
  fs.writeFileSync(path.join(dir, 'sub', 'otro.txt'), 'otro dato de ' + path.basename(dir));
}

// ---- extracción por firma ---------------------------------------------------------
function fuenteContrato(src) {
  return [
    lineaConstDe(src, 'PARTICION_PROYECTO_PERSISTENTE_RE'), lineaConstDe(src, 'PARTICION_NOMBRE_SEGURO_RE'),
    extraerDe(src, 'function motivoParticionNoValida(tipo, particion)'),
    extraerDe(src, 'function esHijoDirectoDe(padre, hijo)'),
    extraerDe(src, 'function rutaParticionSeguraParaBorrado(particion)'),
  ].join('\n');
}
const appCon = (sessionData, userData) => ({ getPath: (k) => (k === 'sessionData' ? sessionData : (k === 'userData' ? (userData || sessionData) : 'C:\\otro')) });

// Los nombres hostiles que cubre el contrato (todos con `persist:`, salvo los que prueban justo eso).
const HOSTILES = [
  'persist:', 'persist:.', 'persist:..', 'persist:..\\victima', 'persist:../victima', 'persist:..\\..\\victima', 'persist:../../victima',
  'persist:..\\Partitions-evil', 'persist:a\\..\\victima', 'persist:a/../victima', 'persist:.\\victima', 'persist:..\\/victima',
  'persist:C:\\Windows\\Temp\\x', 'persist:C:x', 'persist:\\Windows', 'persist:/Windows', 'persist:D:\\x',
  'persist:\\\\srv\\share\\x', 'persist://srv/share/x', 'persist:\\\\?\\C:\\x', 'persist:\\\\.\\pipe\\x',
  'persist:%2e%2e%5cvictima', 'persist:%2e%2e/victima', 'persist:..%2fvictima',
  'persist:a b', 'persist:a.b', 'persist:a:b', 'persist:a*b', 'persist:a\u0000b', 'persist:a\nb',
  'persist:ａｂｃ', 'persist:．．\\victima', 'persist:\u202e', 'persist:' + 'a'.repeat(101),
  'PERSIST:abc', ' persist:abc', 'persist :abc', 'abc', '', 'persist',
];

// ---- ESTÁTICO -----------------------------------------------------------------------
function comprobarEstatico(env, ok) {
  const src = fs.readFileSync(mainPathDe(env), 'utf8');
  let vac; let helper; let ejec; let leerB; let leerR;
  try {
    vac = sinComentarios(extraerDe(src, 'async function vaciarParticionDe(j)'));
    helper = sinComentarios(extraerDe(src, 'function rutaParticionSeguraParaBorrado(particion)'));
    ejec = sinComentarios(extraerDe(src, 'async function ejecutarBorrado(opts)'));
    leerB = sinComentarios(extraerDe(src, 'function leerJournalBorrado(ruta)'));
    leerR = sinComentarios(extraerDe(src, 'function leerJournalRestauracion(ruta)'));
  } catch (e) { ok('P28-ST0 se pudieron extraer las funciones', false, String(e && e.message || e)); return; }
  const codigoLineas = src.split('\n').filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).map((l) => l.replace(/\s\/\/.*$/, ''));
  const codigo = codigoLineas.join('\n');

  ok('P28-ST1 el helper se define UNA vez y vaciarParticionDe (rollback) lo llama UNA vez', (src.match(/function rutaParticionSeguraParaBorrado\(/g) || []).length === 1 && (vac.match(/rutaParticionSeguraParaBorrado\(/g) || []).length === 1);
  ok('P28-ST2 vaciarParticionDe NO construye ninguna ruta a mano (ni path.join, ni «Partitions») y toma la ruta del helper (`const ruta = seg.ruta`)',
    !/path\.join\(/.test(vac) && !/Partitions/.test(vac) && /const ruta = seg\.ruta;/.test(vac), vac.slice(0, 300));
  const lineasP = codigoLineas.filter((l) => /'Partitions'/.test(l));
  ok('P28-ST3 la ruta física de una partición se construye en UN solo sitio (el helper); el otro uso de `Partitions/` es el inventario, que solo LISTA',
    lineasP.length === 2 && lineasP.some((l) => /path\.join\(sesion, 'Partitions'\)/.test(l)) && lineasP.some((l) => /listar\(/.test(l)), JSON.stringify(lineasP.map((l) => l.trim().slice(0, 90))));
  ok('P28-ST4 la base sale de app.getPath(\'sessionData\') y NO de userData', /app\.getPath\('sessionData'\)/.test(helper) && !/userData/.test(helper) && !/getPath\('userData'\)/.test(helper));
  ok('P28-ST5 el confinamiento NO usa startsWith a pelo sobre la ruta y la base (usa path.relative; startsWith solo para «..»)',
    !/\.startsWith\((base|padre|p\b)/.test(helper + extraerDe(src, 'function esHijoDirectoDe(padre, hijo)')) && /path\.relative\(/.test(extraerDe(src, 'function esHijoDirectoDe(padre, hijo)')));
  ok('P28-ST6 la tabla tipo -> contrato es UNA (motivoParticionNoValida): la llaman el lector de journals y el escritor, una vez cada uno',
    (leerB.match(/motivoParticionNoValida\(/g) || []).length === 1 && (ejec.match(/motivoParticionNoValida\(/g) || []).length === 1);
  const iPre = ejec.indexOf('motivoParticionNoValida('); const iJournal = ejec.indexOf('escribirJsonDurable(journalBorradoPath(actionId)');
  ok('P28-ST7 el escritor valida el nombre ANTES de escribir el journal (no hay journal que el lector rechazaría)', iPre >= 0 && iJournal > iPre, JSON.stringify({ iPre, iJournal }));
  ok('P28-ST8 el nombre NUNCA se decodifica ni se «sanea»: main.js no contiene decodeURI*/unescape/normalize sobre nombres (solo el propio comentario del contrato)',
    !/decodeURI|unescape\(|decodeURIComponent/.test(codigo) && !/\.normalize\(/.test(helper) && !/\.replace\(/.test(helper));
  ok('P28-ST9 el journal de restauración exige el nombre seguro para `partition`', /PARTICION_NOMBRE_SEGURO_RE\.test\(j\.partition\)/.test(leerR));
  ok('P28-ST10 vaciarParticionDe exige el nombre seguro ANTES de session.fromPartition (rama de los demás tipos)',
    vac.indexOf('PARTICION_NOMBRE_SEGURO_RE') > 0 && vac.indexOf('PARTICION_NOMBRE_SEGURO_RE') < vac.indexOf('session.fromPartition('));
  // Inventario: TODOS los sitios donde el producto pide a Electron una partición por nombre.
  const fp = codigoLineas.filter((l) => /\.fromPartition\(/.test(l)).map((l) => l.trim());
  ok('P28-ST11 inventario de session.fromPartition(): exactamente 3 sitios — el clearStorageData del borrado (protegido por el contrato) y los dos flushStorageData de la restauración; ninguno nuevo',
    fp.length === 3 && fp.filter((l) => /clearStorageData/.test(l)).length === 1 && fp.filter((l) => /flushStorageData/.test(l)).length === 2, JSON.stringify(fp));
}

// ---- UNIDAD: contrato del nombre -------------------------------------------------------
function comprobarContrato(env, ok) {
  const src = fs.readFileSync(mainPathDe(env), 'utf8');
  let C;
  try { C = new Function('app', 'path', fuenteContrato(src) + '\nreturn { motivoParticionNoValida, esHijoDirectoDe, rutaParticionSeguraParaBorrado };')(appCon('C:\\ud'), path); } catch (e) { ok('P28-C0 se pudo extraer el contrato REAL', false, String(e && e.message || e)); return; }
  const m = C.motivoParticionNoValida;
  const valido = (tipo, n) => m(tipo, n) === null;
  const suf = (d, s) => `persist:proj-${d}-${s}`;
  ok('P28-C1a proyecto: la FORMA REAL (13 dígitos + 6 caracteres) es válida', valido('rollback-creacion-proyecto', REAL));
  ok('P28-C1b proyecto: el rango del generador — 12, 13 y 14 dígitos; sufijo de 1 a 6 caracteres — es válido',
    [suf('123456789012', 'a'), suf('1789069653603', 'abcdef'), suf('12345678901234', 'a1b2c3'), suf('1789069653603', 'a')].every((n) => valido('rollback-creacion-proyecto', n)));
  ok('P28-C1c proyecto: fuera de rango es inválido — 11 y 15 dígitos, sufijo de 0 o 7, mayúsculas, guion bajo, otro prefijo',
    [suf('12345678901', 'abc'), suf('123456789012345', 'abc'), suf('1789069653603', ''), suf('1789069653603', 'abcdefg'), suf('1789069653603', 'ABCDEF'), suf('1789069653603', 'ab_cd'), 'persist:project-1789069653603-abcdef', 'persist:proj-x-abcdef'].every((n) => !valido('rollback-creacion-proyecto', n)));
  ok('P28-C2 proyecto: `persist:directorio-talento` y los nombres cortos (`persist:p1`) NO tienen permiso de borrado físico', ['persist:directorio-talento', 'persist:p1', 'persist:proj-1'].every((n) => !valido('rollback-creacion-proyecto', n)));
  ok('P28-C3 proyecto: TODOS los nombres hostiles se rechazan (traversal con \\ y /, absolutos, UNC, %2e, NUL, saltos de línea, Unicode, vacío, sin prefijo…)',
    HOSTILES.every((n) => !valido('rollback-creacion-proyecto', n)), JSON.stringify(HOSTILES.filter((n) => valido('rollback-creacion-proyecto', n))));
  ok('P28-C4 no cadenas (undefined, null, número, objeto, array) se rechazan sin lanzar', [undefined, null, 7, {}, [], true].every((n) => !valido('rollback-creacion-proyecto', n)));
  ok('P28-C5a borrar-proyecto: acepta la forma real, el Directorio de Talento y los nombres de una sola pieza que usan los fixtures',
    [REAL, 'persist:directorio-talento', 'persist:p1', 'persist:zzz', 'persist:P', 'persist:NC', 'persist:LegadoSA', 'persist:a_b-c', 'persist:' + 'a'.repeat(100)].every((n) => valido('borrar-proyecto', n)));
  ok('P28-C5b borrar-proyecto: TODOS los nombres hostiles se rechazan (incluidos `.`, `..`, vacío, espacios, puntos, más de 100 caracteres)',
    HOSTILES.every((n) => !valido('borrar-proyecto', n)), JSON.stringify(HOSTILES.filter((n) => valido('borrar-proyecto', n))));
  ok('P28-C6 borrar-prep y purgar-backups NO tienen partición: ningún nombre, ni siquiera uno legítimo, es válido en su journal',
    ['borrar-prep', 'purgar-backups'].every((t) => [REAL, 'persist:directorio-talento', 'persist:p1'].every((n) => !valido(t, n))));
  ok('P28-C7 un tipo desconocido no tiene contrato de partición', !valido('otro-tipo', REAL) && !valido(undefined, REAL));
  ok('P28-C8 el motivo es legible cuando el nombre no vale', typeof m('rollback-creacion-proyecto', 'persist:..\\x') === 'string' && m('rollback-creacion-proyecto', 'persist:..\\x').length > 10);
}

// ---- UNIDAD: confinamiento -------------------------------------------------------------
function comprobarConfinamiento(env, ok) {
  const src = fs.readFileSync(mainPathDe(env), 'utf8');
  let f;
  try { f = new Function('path', extraerDe(src, 'function esHijoDirectoDe(padre, hijo)') + '\nreturn esHijoDirectoDe;')(path); } catch (e) { ok('P28-K0 se pudo extraer esHijoDirectoDe REAL', false, String(e && e.message || e)); return; }
  const B = 'C:\\x\\Partitions';
  ok('P28-K1 un hijo directo está DENTRO', f(B, 'C:\\x\\Partitions\\proj-1') === true);
  ok('P28-K2 el MISMO directorio no cuenta (Partitions/ no es una partición), con o sin separador final', f(B, 'C:\\x\\Partitions') === false && f(B, 'C:\\x\\Partitions\\') === false && f(B + '\\', B) === false);
  ok('P28-K3 el prefijo que solo PARECE igual queda fuera: `Partitions-evil` y su contenido', f(B, 'C:\\x\\Partitions-evil') === false && f(B, 'C:\\x\\Partitions-evil\\proj-1') === false && f(B, 'C:\\x\\Partitions2\\a') === false);
  ok('P28-K4 el padre, una hermana y un nieto quedan fuera', f(B, 'C:\\x') === false && f(B, 'C:\\x\\victima') === false && f(B, 'C:\\x\\Partitions\\a\\b') === false);
  ok('P28-K5 una travesía que resuelve fuera queda fuera (`Partitions\\..\\victima`, `..\\..`)', f(B, 'C:\\x\\Partitions\\..\\victima') === false && f(B, 'C:\\x\\Partitions\\..\\..') === false);
  ok('P28-K6 es de WINDOWS: sin distinguir mayúsculas y con cualquier separador', f(B, 'C:\\X\\PARTITIONS\\PROJ-1') === true && f(B, 'c:/x/partitions/proj-1') === true && f('C:/x/Partitions', 'C:\\x\\Partitions\\proj-1') === true);
  ok('P28-K7 otra unidad y UNC quedan fuera', f(B, 'D:\\x\\Partitions\\proj-1') === false && f(B, '\\\\srv\\share\\Partitions\\proj-1') === false && f('\\\\srv\\share\\Partitions', 'C:\\x\\Partitions\\proj-1') === false);
  ok('P28-K8 una ruta que se normaliza DENTRO sigue valiendo (`Partitions\\a\\..\\proj-1`)', f(B, 'C:\\x\\Partitions\\a\\..\\proj-1') === true);
  ok('P28-K9 entradas que no son rutas no lanzan y no valen', [undefined, null, 5, {}].every((v) => f(B, v) === false && f(v, B) === false));
}

// ---- UNIDAD: el helper de ruta ----------------------------------------------------------
function comprobarHelper(env, ok) {
  const src = fs.readFileSync(mainPathDe(env), 'utf8');
  const crear = (app) => new Function('app', 'path', fuenteContrato(src) + '\nreturn rutaParticionSeguraParaBorrado;')(app, path);
  let ruta;
  try { ruta = crear(appCon('C:\\Users\\x\\ud')); } catch (e) { ok('P28-H0 se pudo extraer el helper REAL', false, String(e && e.message || e)); return; }
  const r = ruta(REAL);
  ok('P28-H1 (1) partición normal válida → ruta `<sessionData>\\Partitions\\<nombre>` (nombre tal cual)', r.ok === true && r.ruta === 'C:\\Users\\x\\ud\\Partitions\\proj-1789069653603-vtwioc' && r.nombre === 'proj-1789069653603-vtwioc', JSON.stringify(r));
  const no = (n) => ruta(n).ok === false;
  ok('P28-H2 (2) `persist:..\\victima` rechazado', no('persist:..\\victima'));
  ok('P28-H3 (3) `persist:../victima` rechazado', no('persist:../victima'));
  ok('P28-H4 (4) absolutas de Windows rechazadas (`C:\\…`, `C:x`, `\\Windows`, `/Windows`, otra unidad)', ['persist:C:\\Windows\\Temp\\x', 'persist:C:x', 'persist:\\Windows', 'persist:/Windows', 'persist:D:\\x'].every(no));
  ok('P28-H5 (5) UNC rechazadas (`\\\\srv\\share`, `//srv/share`, `\\\\?\\`, `\\\\.\\pipe`)', ['persist:\\\\srv\\share\\x', 'persist://srv/share/x', 'persist:\\\\?\\C:\\x', 'persist:\\\\.\\pipe\\x'].every(no));
  ok('P28-H6 (6) nombre vacío rechazado (`persist:`, cadena vacía, undefined, null, número)', no('persist:') && no('') && [undefined, null, 5].every((v) => ruta(v).ok === false));
  ok('P28-H7 (7) `persist:directorio-talento` en el flujo de rollback: rechazado (no adquiere permiso de borrado físico)', no('persist:directorio-talento'));
  ok('P28-H8 (9) sessionData SEPARADO de userData: la ruta sale de sessionData, no de userData',
    (() => { const x = crear(appCon('C:\\sess', 'C:\\ud'))(REAL); return x.ok === true && /^C:\\sess\\Partitions\\/i.test(x.ruta) && !/^C:\\ud/i.test(x.ruta); })());
  ok('P28-H9 sessionData que no es una ruta absoluta (relativa, vacía, no cadena, lanza) → no hay ruta (fail-closed)',
    ['relativa\\x', '', undefined, 5].every((s) => crear(appCon(s))(REAL).ok === false) && crear({ getPath: () => { throw new Error('sin sessionData'); } })(REAL).ok === false);
  ok('P28-H10 sessionData con separador final o barras normales: misma ruta canónica', crear(appCon('C:\\Users\\x\\ud\\'))(REAL).ruta === 'C:\\Users\\x\\ud\\Partitions\\proj-1789069653603-vtwioc' && crear(appCon('C:/Users/x/ud'))(REAL).ruta === 'C:\\Users\\x\\ud\\Partitions\\proj-1789069653603-vtwioc');
  ok('P28-H11 TODOS los nombres hostiles → `{ok:false}` con motivo, y NUNCA una ruta', HOSTILES.every((n) => { const x = ruta(n); return x.ok === false && typeof x.motivo === 'string' && x.ruta === undefined; }));
  ok('P28-H12 el helper es puro: no toca el disco (no existe la carpeta ni se crea)', !fs.existsSync('C:\\Users\\x\\ud\\Partitions'));
}

// ---- UNIDAD: los lectores de journals REALES ---------------------------------------------
function comprobarJournals(env, ok) {
  const src = fs.readFileSync(mainPathDe(env), 'utf8');
  const raiz = path.join(os.tmpdir(), '_a33-p28-journals');
  fs.rmSync(raiz, { recursive: true, force: true }); fs.mkdirSync(raiz, { recursive: true });
  let B; let R;
  try {
    const fuenteB = [
      lineaConstDe(src, 'BORRADOS_DIR_NAME'), lineaConstDe(src, 'BORRADOS_JOURNAL_V'), lineaConstDe(src, 'BORRADOS_TIPOS'), lineaConstDe(src, 'BORRADOS_TIPOS_SIN_RECURSOS'),
      lineaConstDe(src, 'esHex'), lineaConstDe(src, 'esEnteroNoNegativo'), fuenteContrato(src),
      extraerDe(src, 'function borradosDir()'), extraerDe(src, 'function estaDentroDe(hijo, padre)'), extraerDe(src, 'function mismaRuta(a, b)'),
      extraerDe(src, 'function leerJournalBorrado(ruta)'),
    ].join('\n');
    B = new Function('fs', 'path', 'app', fuenteB + '\nreturn { leerJournalBorrado, borradosDir };')(fs, path, { getPath: () => raiz });
    const fuenteR = [
      lineaConstDe(src, 'esHex'), lineaConstDe(src, 'esEnteroNoNegativo'), lineaConstDe(src, 'RESTAURACIONES_JOURNAL_V'), lineaConstDe(src, 'RESTAURACION_FASES'),
      lineaConstDe(src, 'PARTICION_NOMBRE_SEGURO_RE'), extraerDe(src, 'function leerJournalRestauracion(ruta)'),
    ].join('\n');
    R = new Function('fs', 'path', fuenteR + '\nreturn { leerJournalRestauracion };')(fs, path);
  } catch (e) { ok('P28-J0 se pudieron extraer los lectores REALES', false, String(e && e.message || e)); return; }
  let n = 0;
  const escribir = (j) => { const ruta = path.join(raiz, `j${++n}.json`); fs.writeFileSync(ruta, typeof j === 'string' ? j : JSON.stringify(j), 'utf8'); return ruta; };
  const dirRecurso = (act) => ({ tipo: 'directorio', scope: 'subtree', origen: path.join(raiz, 'origen'), cuarentena: path.join(B.borradosDir(), act, 'r0'), n_archivos: 1, bytes_totales: 1 });
  const jb = (tipo, extra) => Object.assign({ v: 1, action_id: hex('a'), writer: hex('b'), tipo, base_commit_id: hex('c'), fase: 'purgando', startedAt: '2026-09-19T00:00:00.000Z', recursos: [] }, extra || {});
  const clase = (j) => B.leerJournalBorrado(escribir(j));
  const rollback = (part) => jb('rollback-creacion-proyecto', { sinRecursos: true, particion: part });
  const borrarProy = (part) => jb('borrar-proyecto', { recursos: [dirRecurso(hex('a'))], particion: part });

  ok('P28-J1 rollback con la forma real → válido', clase(rollback(REAL)).clase === 'valido');
  ok('P28-J2 (11) rollback con TODOS los nombres hostiles → incompleto (no demostrable) y el motivo lo dice',
    // (`''` no llega al contrato: la exigencia histórica «declarada pero vacía» la corta antes.)
    HOSTILES.every((p) => { const c = clase(rollback(p)); return c.clase === 'incompleto' && (p === '' ? /vacía/ : /fuera de contrato/).test(c.motivo); }), JSON.stringify(HOSTILES.filter((p) => clase(rollback(p)).clase === 'valido')));
  ok('P28-J3 (11) journal malformado (JSON truncado) o no objeto → ilegible/desconocido: fail-closed', clase('{"v":1,"action_id":').clase === 'ilegible' && clase('[]').clase === 'desconocido' && clase('"persist:.."').clase === 'desconocido');
  ok('P28-J4 rollback con `persist:directorio-talento` → incompleto', clase(rollback('persist:directorio-talento')).clase === 'incompleto');
  ok('P28-J5 borrar-proyecto: forma real, Directorio de Talento y nombre corto → válidos; sin partición (`null`, ausente) → válido (como siempre)',
    [REAL, 'persist:directorio-talento', 'persist:p1'].every((p) => clase(borrarProy(p)).clase === 'valido') && clase(borrarProy(null)).clase === 'valido' && clase(jb('borrar-proyecto', { recursos: [dirRecurso(hex('a'))] })).clase === 'valido');
  ok('P28-J6 borrar-proyecto con TODOS los nombres hostiles → incompleto', HOSTILES.filter((p) => p !== '').every((p) => clase(borrarProy(p)).clase === 'incompleto'), JSON.stringify(HOSTILES.filter((p) => p !== '' && clase(borrarProy(p)).clase === 'valido')));
  ok('P28-J7 (borrar-prep / purgar-backups) con partición declarada — aunque el nombre sea legítimo — → incompleto; sin partición → válido (sin cambios)',
    ['borrar-prep', 'purgar-backups'].every((t) => clase(jb(t, { sinRecursos: true, particion: REAL })).clase === 'incompleto' && clase(jb(t, { sinRecursos: true })).clase === 'valido' && clase(jb(t, { sinRecursos: true, particion: null })).clase === 'valido'));
  ok('P28-J8 la exigencia histórica sigue: `particion: ""` sigue siendo «declarada pero vacía»', clase(rollback('')).clase === 'incompleto' && /vacía/.test(clase(rollback('')).motivo));

  const rest = (part) => ({ v: 1, action_id: hex('a'), writer: hex('b'), project_id: 1, partition: part, base_commit_id: hex('c'), fase: 'aplicando', cifrado: 0, startedAt: 'x', backup_id: null, backup_sha256: null, esperado_hash: 'a'.repeat(64), previo_hash: 'b'.repeat(64), previo_sha256: 'c'.repeat(64), previo_size: 1, previo_n_claves: 1 });
  const claseR = (j) => R.leerJournalRestauracion(escribir(j)).clase;
  ok('P28-J9 journal de RESTAURACIÓN: nombres legítimos (forma real, Directorio, `persist:P`) → válido', [REAL, 'persist:directorio-talento', 'persist:P', 'persist:NC'].every((p) => claseR(rest(p)) === 'valido'));
  ok('P28-J10 journal de RESTAURACIÓN: TODOS los nombres hostiles → incompleto (la reposición hace localStorage.clear() sobre esa partición)', HOSTILES.filter((p) => p !== '').every((p) => claseR(rest(p)) === 'incompleto'), JSON.stringify(HOSTILES.filter((p) => p !== '' && claseR(rest(p)) === 'valido')));
  limpiar(raiz);
}

// ---- UNIDAD: vaciarParticionDe REAL -----------------------------------------------------
function comprobarVaciar(env, ok) {
  const src = fs.readFileSync(mainPathDe(env), 'utf8');
  let crear;
  try {
    const fuente = [
      lineaConstDe(src, 'carpetaDeParticion'), extraerDe(src, 'function particionUsadaPorFila(particion)'), fuenteContrato(src),
      extraerDe(src, 'async function vaciarParticionDe(j)'),
    ].join('\n');
    crear = (o) => {
      const traza = []; const log = []; const estado = { existe: o.carpetaExiste !== false };
      const fsD = {
        existsSync: (p) => { traza.push('existsSync:' + p); return estado.existe; },
        rmSync: (p) => { traza.push('rmSync:' + p); if (o.rmLanza) throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' }); estado.existe = false; },
      };
      const sessionD = { fromPartition: (n) => { traza.push('session:' + n); return { clearStorageData: async () => { traza.push('clearStorageData:' + n); } }; } };
      const dbD = { getInstallationId: () => W, all: () => { traza.push('dbAll'); return o.filas || []; } };
      const f = new Function('dbmod', 'fs', 'path', 'app', 'session', 'appLog', fuente + '\nreturn vaciarParticionDe;')(dbD, fsD, path, appCon(o.sessionData || 'C:\\sess', o.userData || 'C:\\ud'), sessionD, (l) => log.push(l));
      return { f, traza, log };
    };
  } catch (e) { ok('P28-V0 se pudo extraer vaciarParticionDe REAL', false, String(e && e.message || e)); return Promise.resolve(); }
  const corre = async (j, o) => { const c = crear(o || {}); const r = await c.f(j); return { r, traza: c.traza, log: c.log }; };
  const rb = (part, extra) => Object.assign({ action_id: 'a'.repeat(32), tipo: 'rollback-creacion-proyecto', particion: part }, extra || {});
  return (async () => {
    const V1 = await corre(rb(REAL), {});
    ok('P28-V1 partición legítima con la carpeta presente: rmSync sobre `<sessionData>\\Partitions\\<nombre>` exactamente', V1.r.ok === true && V1.traza.includes('rmSync:C:\\sess\\Partitions\\proj-1789069653603-vtwioc'), JSON.stringify(V1));
    ok('P28-V2 sessionData ≠ userData: se destruye bajo sessionData y NO bajo userData', V1.traza.every((t) => !/C:\\ud/i.test(t)));
    let ninguna = true; let sinLog = true; const raros = [];
    for (const n of HOSTILES.filter((x) => x !== '')) {
      const V = await corre(rb(n), {});
      const intacta = V.r.ok === false && V.r.particionInvalida === true && V.traza.length === 0;
      if (!intacta) { ninguna = false; raros.push(n); }
      if (!V.log.some((l) => /PS-2006/.test(l) && /NO válida/.test(l))) sinLog = false;
    }
    ok('P28-V3 (2-6, 11) rollback con TODOS los nombres hostiles: {ok:false, particionInvalida} sin tocar NADA (ni existsSync, ni la BD, ni rmSync, ni sesión)', ninguna, JSON.stringify(raros.slice(0, 6)));
    ok('P28-V4 y cada rechazo deja un log explícito (PS-2006, «NO válida», la partición declarada)', sinLog);
    const V5 = await corre(rb(REAL), { carpetaExiste: false });
    ok('P28-V5 (10) ruta legítima INEXISTENTE: idempotente — ok, sin consultar la BD ni destruir nada', V5.r.ok === true && V5.traza.length === 1 && /^existsSync:/.test(V5.traza[0]), JSON.stringify(V5));
    const V6 = await corre(rb(REAL), { rmLanza: true });
    ok('P28-V6 legítima con EBUSY: sigue siendo ok:false + particionPendiente (comportamiento P24 intacto)', V6.r.ok === false && V6.r.particionPendiente === true && !V6.r.particionInvalida, JSON.stringify(V6.r));
    const V7 = await corre(rb(REAL), { filas: [{ partition_name: REAL }] });
    ok('P28-V7 la guarda de P27 sigue delante: con una fila usando la partición no se destruye (particionOmitida)', V7.r.ok === true && V7.r.particionOmitida === 'referenciada' && !V7.traza.some((t) => /^rmSync/.test(t)), JSON.stringify(V7));
    // ---- rama de los demás tipos: el nombre lo resuelve Electron, y solo se le pide con un nombre seguro ----
    let bien = true; const malos = [];
    for (const n of [REAL, 'persist:directorio-talento', 'persist:p1', 'persist:LegadoSA']) {
      const V = await corre(rb(n, { tipo: 'borrar-proyecto' }), {});
      if (!(V.r.ok === true && V.traza.join() === `session:${n},clearStorageData:${n}`)) { bien = false; malos.push(n); }
    }
    ok('P28-V8 borrar-proyecto con nombres legítimos: clearStorageData como siempre (sin consultar la BD ni tocar el disco)', bien, JSON.stringify(malos));
    let cerrado = true; const abiertos = [];
    for (const n of HOSTILES.filter((x) => x !== '')) {
      const V = await corre(rb(n, { tipo: 'borrar-proyecto' }), {});
      if (!(V.r.ok === false && V.r.particionInvalida === true && V.traza.length === 0)) { cerrado = false; abiertos.push(n); }
    }
    ok('P28-V9 borrar-proyecto con TODOS los nombres hostiles: no se pide NINGUNA sesión a Electron (ni fromPartition ni clearStorageData)', cerrado, JSON.stringify(abiertos.slice(0, 6)));
    const V10 = await corre(rb(undefined, { tipo: 'purgar-backups' }), {});
    ok('P28-V10 sin particion (purgar-backups/borrar-prep en producto): ok sin tocar nada', V10.r.ok === true && V10.traza.length === 0);
  })();
}

// ---- BD: UNIQUE (¿pueden dos filas compartir partition_name?) -----------------------------
async function comprobarUnique(env, ok) {
  const dbSrc = fs.readFileSync(path.join(PROJ, 'db.js'), 'utf8');
  const ddl = (dbSrc.match(/CREATE TABLE IF NOT EXISTS projects\([\s\S]*?\);/) || [null])[0];
  ok('P28-DB1 el esquema de db.js declara `partition_name TEXT NOT NULL UNIQUE`', !!ddl && /partition_name TEXT NOT NULL UNIQUE/.test(ddl), String(ddl).slice(0, 200));
  if (!ddl) return;
  const initSqlJs = require(path.join(PROJ, 'node_modules', 'sql.js'));
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(ddl);
  const ins = (n) => db.run("INSERT INTO projects(name, client, partition_name, created_at, updated_at) VALUES ('p','c',?, 'x','x')", [n]);
  ins('persist:proj-1789069653603-vtwioc');
  let dup = null;
  try { ins('persist:proj-1789069653603-vtwioc'); } catch (e) { dup = String(e && e.message || e); }
  ok('P28-DB2 dos filas VIVAS no pueden compartir partition_name: la BD rechaza el duplicado (UNIQUE)', !!dup && /UNIQUE/i.test(dup), String(dup));
  db.run("DELETE FROM projects WHERE partition_name='persist:proj-1789069653603-vtwioc'");
  let vuelve = true;
  try { ins('persist:proj-1789069653603-vtwioc'); } catch (e) { vuelve = false; }
  ok('P28-DB3 LÍMITE conocido: UNIQUE no impide que el nombre de una fila YA BORRADA reaparezca (imagen antigua de la BD) — el riesgo residual es de reaparición, no de coexistencia', vuelve === true);
  db.close();
}

// ---- ELECTRON ----------------------------------------------------------------------------
async function ejecutarBateria(env) {
  let pass = 0, fail = 0; const fallos = [];
  function ok(n, c, extra) {
    if (c) { pass++; console.log('  OK    ' + n); }
    else { fail++; fallos.push(n); console.log('  FALLO ' + n + (extra === undefined ? '' : '  -- ' + extra)); }
  }
  function seccion(t) { console.log('\n=== ' + t + ' ==='); }
  const opts = { env: env || {} };
  const procesos = [];
  const guardianAntes = snapshotGuardian();
  const lanzar = (modo, sb, extra) => { const { resultado } = P26.correr(modo, sb, extra, opts); procesos.push({ modo, sb, entorno: resultado && resultado.entorno }); return resultado; };

  seccion('P28-ST. ESTÁTICO — un solo punto construye la ruta; el escritor valida antes; nunca se decodifica');
  comprobarEstatico(env, ok);
  seccion('P28-C. UNIDAD — el contrato del nombre (proyecto / nombre seguro / ninguno)');
  comprobarContrato(env, ok);
  seccion('P28-K. UNIDAD — confinamiento estricto de Windows');
  comprobarConfinamiento(env, ok);
  seccion('P28-H. UNIDAD — rutaParticionSeguraParaBorrado REAL');
  comprobarHelper(env, ok);
  seccion('P28-J. UNIDAD — leerJournalBorrado y leerJournalRestauracion REALES');
  comprobarJournals(env, ok);
  seccion('P28-V. UNIDAD — vaciarParticionDe REAL: ninguna rama destruye con un nombre fuera de contrato');
  await comprobarVaciar(env, ok);
  seccion('P28-DB. BD — UNIQUE de partition_name');
  await comprobarUnique(env, ok);

  // -------------------------------------------------------------------------
  seccion('P28-EH. ELECTRON — journals MANIPULADOS con su id en la marca (CASO B histórico): las carpetas víctima no cambian ni un byte');
  {
    const sb = sandboxPara('hostiles');
    const ud = path.join(sb, 'userdata');
    const ABS = path.join(sb, 'victima-abs');
    const CASOS = [
      { id: 'H1', particion: 'persist:..\\victima-h1', victima: path.join(ud, 'victima-h1') },
      { id: 'H2', particion: 'persist:../victima-h2', victima: path.join(ud, 'victima-h2') },
      { id: 'H3', particion: 'persist:..\\Partitions-evil', victima: path.join(ud, 'Partitions-evil') },
      { id: 'H4', particion: 'persist:.', victima: path.join(ud, 'Partitions', 'proj-1700000000099-vivo01') },
      { id: 'H5', particion: 'persist:', victima: path.join(ud, 'Partitions', 'proj-1700000000098-vivo02') },
      // (`persist:..` —userData entero— va en su PROPIO arranque, P28-EU: sin validación borra el directorio
      // en el que corre la propia app y el desenlace de un arranque compartido dejaría de ser determinista.)
      { id: 'H7', particion: 'persist:%2e%2e%5cvictima-h7', victima: path.join(ud, 'victima-h7') },
      { id: 'H8', particion: 'persist:proj-1700000000097-abc097\\..\\..\\victima-h8', victima: path.join(ud, 'victima-h8') },
      { id: 'H9', particion: 'persist:directorio-talento', victima: path.join(ud, 'Partitions', 'directorio-talento') },
      { id: 'H10', particion: 'persist:' + ABS, victima: ABS },
      { id: 'H11', particion: 'persist:\\\\localhost\\c$\\victima-unc', victima: null },
      { id: 'H12', particion: 'persist:proj-1700000000096-abc096', tipo: 'purgar-backups', victima: path.join(ud, 'Partitions', 'proj-1700000000096-abc096') },
    ];
    fs.writeFileSync(path.join(sb, 'hostil.json'), JSON.stringify({ lista: CASOS.map((c) => ({ particion: c.particion, tipo: c.tipo || 'rollback-creacion-proyecto' })) }));
    const P = lanzar('prep-hostil', sb, []);
    ok('P28-EH1 preparación: 11 journals manipulados (rollback y un purgar-backups con partición), todos con su id en la marca', !!P && P.n === 11 && P.marcaContieneTodos === true, JSON.stringify(P && { n: P.n, m: P.marcaContieneTodos }));
    if (P) {
      const victimas = CASOS.map((c) => c.victima).filter(Boolean);
      for (const v of victimas) plantar(v);
      const antes = victimas.map((v) => manifiesto(v));
      const A = lanzar('arranque', sb, ['--espera=6000']);
      ok('P28-EH2 el arranque terminó y escribió resultado', !!A);
      if (A) {
        const despues = victimas.map((v) => manifiesto(v));
        const cambiadas = victimas.filter((v, i) => JSON.stringify(antes[i]) !== JSON.stringify(despues[i])).map((v) => path.relative(sb, v));
        ok('P28-EH3 (12) NINGUNA carpeta víctima cambia byte a byte (hermanas, prefijo `Partitions-evil`, particiones vivas dentro de Partitions/, `userData` y la absoluta)', cambiadas.length === 0, JSON.stringify(cambiadas));
        const rm = ((A.rmSyncFuera || []).concat((A.linea || []).filter((e) => e.tipo === 'fs' && e.op === 'rmSync').map((e) => e.ruta)))
          .filter((r) => victimas.some((v) => String(r).toLowerCase().startsWith(v.toLowerCase())));
        ok('P28-EH4 nadie hizo rmSync sobre ninguna víctima', rm.length === 0, JSON.stringify(rm.map((r) => String(r).replace(sb, '<SB>'))));
        ok('P28-EH5 los 11 journals SIGUEN ahí: ninguno se purgó ni se retiró «como resuelto»', (A.journalsFinal || []).length === 11, String((A.journalsFinal || []).length));
        ok('P28-EH6 el arranque se cierra a propósito con «borrado anterior sin resolver» (fail-closed, no se «sanea» ninguno)', A.porQuit === true && (A.dialogos || []).some((t) => /borrado anterior/i.test(t)), JSON.stringify({ q: A.porQuit, d: A.dialogos }));
        const log = A.appLogRelevante || [];
        const explicitos = log.filter((l) => /journal de borrado no demostrable/.test(l) && /fuera de contrato/.test(l));
        ok('P28-EH7 log EXPLÍCITO: una línea por journal («no demostrable … partición … fuera de contrato»)', explicitos.length === 11, String(explicitos.length));
        ok('P28-EH8 ningún journal manipulado se trató como purga normal (ni «sin consultar la marca», ni Aviso P27, ni «no llegó a confirmarse»)', !log.some((l) => /sin consultar la marca de acciones|Aviso — P27|no llegó a confirmarse/.test(l)));
        const sesiones = (A.linea || []).filter((e) => e.tipo === 'session-created');
        ok('P28-EH9 Electron no abrió ninguna sesión sobre un nombre manipulado ni sobre la partición del purgar-backups', !sesiones.some((s) => /victima|Partitions-evil|vivo0|abc09|decoy/i.test(String(s.storage))), JSON.stringify(sesiones.map((s) => s.storage)));
      }
    }
    limpiar(sb);
  }

  // -------------------------------------------------------------------------
  seccion('P28-EU. ELECTRON — `persist:..` (userData ENTERO): el journal falla cerrado y `backups/` no se toca');
  {
    const sb = sandboxPara('userdata-entero');
    const ud = path.join(sb, 'userdata');
    fs.writeFileSync(path.join(sb, 'hostil.json'), JSON.stringify({ particion: 'persist:..', tipo: 'rollback-creacion-proyecto' }));
    const P = lanzar('prep-hostil', sb, []);
    ok('P28-EU1 preparación: UN journal con `persist:..` y su id en la marca', !!P && P.n === 1 && P.marcaContieneTodos === true);
    if (P) {
      // La víctima es `backups/` (a `userData` lo ordena por delante de los archivos que Chromium tiene abiertos): con el
      // defecto medido, `rmSync(userData)` se lo lleva —junto con `.panorama-borrados`— antes de chocar con uno bloqueado.
      const victima = path.join(ud, 'backups');
      plantar(victima);
      const antes = manifiesto(victima);
      const A = lanzar('arranque', sb, ['--espera=6000']);
      ok('P28-EU2 el arranque terminó y escribió resultado', !!A);
      if (A) {
        ok('P28-EU3 `backups/` queda INTACTA byte a byte', JSON.stringify(manifiesto(victima)) === JSON.stringify(antes));
        ok('P28-EU4 nadie hizo rmSync sobre `userData` entera', !(A.rmSyncFuera || []).some((r) => path.resolve(String(r)).toLowerCase() === path.resolve(ud).toLowerCase()), JSON.stringify((A.rmSyncFuera || []).map((r) => String(r).replace(sb, '<SB>'))));
        ok('P28-EU5 el journal SIGUE ahí (ni se purgó ni se llevó consigo el directorio de journals)', (A.journalsFinal || []).length === 1 && fs.existsSync(path.join(ud, '.panorama-borrados')), JSON.stringify(A.journalsFinal));
        ok('P28-EU6 fail-closed con log explícito: «no demostrable … fuera de contrato» y cierre por «borrado anterior sin resolver»',
          A.porQuit === true && (A.dialogos || []).some((t) => /borrado anterior/i.test(t)) && (A.appLogRelevante || []).some((l) => /journal de borrado no demostrable/.test(l) && /fuera de contrato/.test(l)), JSON.stringify({ q: A.porQuit, d: A.dialogos }));
      }
    }
    limpiar(sb);
  }

  // -------------------------------------------------------------------------
  seccion('P28-EB. ELECTRON — projects:delete sobre filas con partition_name hostil: el borrado ni empieza');
  {
    const sb = sandboxPara('borrar-invalida');
    const NOMBRES = ['persist:../victima-b1', 'persist:..', 'persist:.', 'persist:', 'persist:a b', 'persist:..\\x', 'persist:C:\\x'];
    fs.writeFileSync(path.join(sb, 'hostil.json'), JSON.stringify({ particiones: NOMBRES.concat(['persist:directorio-talento']) }));
    const R = lanzar('borrar-particion-invalida', sb, []);
    ok('P28-EB1 el proceso terminó y escribió resultado', !!R && !R.error, JSON.stringify(R && R.error));
    if (R && R.casos) {
      const hostiles = R.casos.filter((c) => NOMBRES.includes(c.particion));
      ok('P28-EB2 (7) cada fila hostil: `aplicado:false`, bloqueo «particion-invalida», la fila SIGUE y no se escribió ningún journal',
        hostiles.length === NOMBRES.length && hostiles.every((c) => c.resultado && c.resultado.aplicado === false && c.resultado.bloqueo === 'particion-invalida' && c.filaSigue === true && c.journals.length === 0), JSON.stringify(hostiles.map((c) => [c.particion, c.resultado && c.resultado.bloqueo, c.filaSigue, c.journals.length])));
      ok('P28-EB3 y a Electron no se le pidió NINGUNA sesión para esos nombres (no se creó ningún contexto fuera de contrato)', hostiles.every((c) => c.sesionesNuevas.length === 0), JSON.stringify(hostiles.map((c) => c.sesionesNuevas)));
      const dir = R.casos.find((c) => c.particion === 'persist:directorio-talento');
      ok('P28-EB4 el Directorio de Talento SIGUE pudiendo borrarse (su nombre cumple el contrato de nombre seguro)', !!dir && dir.resultado && dir.resultado.aplicado === true && dir.filaSigue === false, JSON.stringify(dir && dir.resultado));
      ok('P28-EB5 CONTROL: un proyecto normal (partición generada por projects:create) se borra como siempre', R.control && R.control.resultado && R.control.resultado.aplicado === true, JSON.stringify(R.control));
      ok('P28-EB6 el rechazo deja un log explícito por cada fila', (R.appLog || []).some((l) => /borrado \(borrar-proyecto\) NO iniciado: partición/.test(l)) , JSON.stringify(R.appLog));
    }
    limpiar(sb);
  }

  // -------------------------------------------------------------------------
  seccion('P28-ES. ELECTRON — sessionData SEPARADO de userData: se retira bajo sessionData, nunca bajo userData');
  {
    const sb = sandboxPara('sessiondata');
    const P = lanzar('prep', sb, ['--n=0', '--session-data=1']);
    ok('P28-ES1 (9) preparación con sessionData aparte: journal P24 pendiente y la carpeta de la partición en `<sessionData>/Partitions`', !!P && !P.error && !!P.nombre && P.inicial && P.inicial.carpetaExiste === true, JSON.stringify(P && P.inicial));
    if (P && !P.error) {
      const real = path.join(sb, 'sessiondata', 'Partitions', P.nombre);
      const señuelo = path.join(sb, 'userdata', 'Partitions', P.nombre);
      fs.mkdirSync(señuelo, { recursive: true });
      fs.writeFileSync(path.join(señuelo, 'centinela-userdata.txt'), 'una carpeta con el MISMO nombre bajo userData: no es la partición');
      fs.writeFileSync(path.join(real, 'centinela-sessiondata.txt'), 'la partición de verdad');
      const antesSenuelo = manifiesto(señuelo);
      const A = lanzar('arranque', sb, ['--session-data=1']);
      ok('P28-ES2 el arranque terminó y escribió resultado', !!A);
      if (A) {
        ok('P28-ES3 la carpeta bajo sessionData DESAPARECE (rmSync ok, verificada en disco)', !fs.existsSync(real), JSON.stringify(A.carpetasFinal));
        ok('P28-ES4 la carpeta homónima bajo userData queda INTACTA byte a byte (no se confunde userData con sessionData)', JSON.stringify(manifiesto(señuelo)) === JSON.stringify(antesSenuelo));
        ok('P28-ES5 el journal cae después y el arranque continúa sin PS-2006', (A.journalsFinal || []).length === 0 && A.porQuit === false && !(A.appLogRelevante || []).some((l) => /PS-2006/.test(l)), JSON.stringify({ j: A.journalsFinal, q: A.porQuit }));
      }
    }
    limpiar(sb);
  }

  // -------------------------------------------------------------------------
  seccion('P28-EI. ELECTRON — ruta LEGÍTIMA inexistente: comportamiento idempotente esperado');
  {
    const sb = sandboxPara('inexistente');
    fs.writeFileSync(path.join(sb, 'hostil.json'), JSON.stringify({ particion: 'persist:proj-1700000000095-abc095' }));
    const P = lanzar('prep-hostil', sb, []);
    const A = P ? lanzar('arranque', sb, []) : null;
    ok('P28-EI1 (10) journal legítimo cuya carpeta ya no existe: se da por resuelto (journal retirado), sin PS-2006 y sin cierre',
      !!A && (A.journalsFinal || []).length === 0 && A.porQuit === false && !(A.appLogRelevante || []).some((l) => /PS-2006/.test(l)), JSON.stringify(A && { j: A.journalsFinal, q: A.porQuit }));
    limpiar(sb);
  }

  seccion('P28-E. ARN-3 / CUSTODIA — el entorno quedó dentro del sandbox en CADA proceso y el estado real no cambió');
  {
    const dentro = (sb, p) => { const r = path.relative(path.resolve(sb), path.resolve(String(p || ''))); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
    const malos = procesos.filter((p) => !(p.entorno && p.entorno.todoDentroDelSandbox === true
      && ['APPDATA', 'LOCALAPPDATA', 'TEMP', 'appData', 'userData', 'sessionData', 'temp'].every((k) => dentro(p.sb, p.entorno[k]))));
    ok(`P28-E1 APPDATA, LOCALAPPDATA, TEMP, appData, userData, sessionData y temp cayeron DENTRO del sandbox en los ${procesos.length} procesos Electron`, procesos.length > 0 && malos.length === 0, JSON.stringify(malos.map((p) => p.modo)));
    const despues = snapshotGuardian();
    ok('P28-E2 custodia: el directorio REAL de DriveSyncGuard no cambió (se excluyen guard.log y heartbeat.txt, que escribe el guardián real en vivo)',
      JSON.stringify(guardianAntes.archivos) === JSON.stringify(despues.archivos) && guardianAntes.existe === despues.existe, JSON.stringify({ antes: guardianAntes.archivos, despues: despues.archivos }));
  }
  return { pass, fail, fallos };
}

if (require.main === module) {
  ejecutarBateria({}).then(({ pass, fail }) => {
    console.log('\n======================================================================');
    console.log(`  P28: ${pass} OK / ${fail} FALLOS`);
    console.log('======================================================================');
    if (fail) process.exitCode = 1;
  });
}

module.exports = { ejecutarBateria };
