// ---------------------------------------------------------------------------
// P27 — driver de la batería: «una partición referenciada por una fila NUNCA se
// destruye durante la recuperación de un rollback P24».
//
// Propiedad central: la comprobación de fila va INMEDIATAMENTE antes del
// `rmSync`, dentro de `vaciarParticionDe`, así que cubre TODOS los caminos que
// llegan a destruir la carpeta (CASO B histórico con el id en la marca, vía
// especial de P26, `ejecutarBorrado` tras su commit).
//
// Tres niveles, como P26:
//   ESTÁTICO  la guarda está donde tiene que estar (solo en la rama de
//             rollback, antes de `rmSync`, sin `await` en medio); ni la
//             recuperación ni `finalizarPurga` emiten SQL; el journal no lleva SQL.
//   UNIDAD    `particionUsadaPorFila`, `vaciarParticionDe`, `finalizarPurga` y
//             `resolverBorradoPendiente` REALES (extraídos por firma) con dobles.
//   ELECTRON  la app real en sandbox, con un CENTINELA dentro de la carpeta
//             (`centinela-viva.txt`): si desaparece, se destruyó una partición viva.
//
// Reutiliza el arnés de P26 (`p26/test-p26-purga-desligada.js`) con opciones
// nuevas (`--fila-id`, `--fase-retirando`, `--bd-falla`, modo `prep-malformado`).
// ARN-3: el arnés fija APPDATA/LOCALAPPDATA/TEMP/appData/userData/temp antes de
// cargar nada; aquí se asevera en cada proceso y se compara el guardián real.
// ---------------------------------------------------------------------------
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const P26 = require('../p26/comprobar-p26.js');
const { extraerDe, lineaConstDe, sinComentarios, snapshotGuardian, construirPredicado, mainPathDe, dormirSync } = P26;

const CENTINELA = 'centinela-viva.txt';
const PART = 'persist:proj-1700000000001-abc001';
const W = 'b'.repeat(32);
const hex = (c) => c.repeat(32);

function sandboxPara(nombre) {
  const dir = path.join(os.tmpdir(), `_a33-p27-${nombre}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function limpiar(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }

// ---- ESTÁTICO -----------------------------------------------------------------
function comprobarEstatico(env, ok) {
  const src = fs.readFileSync(mainPathDe(env), 'utf8');
  let cuerpo;
  try { cuerpo = sinComentarios(extraerDe(src, 'async function vaciarParticionDe(j)')); } catch (e) { ok('P27-ST0 se pudo extraer vaciarParticionDe', false, String(e && e.message || e)); return; }
  const n = (cuerpo.match(/particionUsadaPorFila\(/g) || []).length;
  const iGuarda = cuerpo.indexOf('particionUsadaPorFila(');
  const iRollback = cuerpo.indexOf("j.tipo === 'rollback-creacion-proyecto'");
  const iRm = cuerpo.indexOf('fs.rmSync(');
  const iSesion = cuerpo.indexOf('session.fromPartition(');
  ok('P27-ST1 vaciarParticionDe llama a la guarda exactamente UNA vez', n === 1, String(n));
  ok('P27-ST2 la guarda está DENTRO de la rama rollback-creacion-proyecto y ANTES de fs.rmSync', n === 1 && iRollback >= 0 && iRollback < iGuarda && iGuarda < iRm, JSON.stringify({ iRollback, iGuarda, iRm }));
  ok('P27-ST3 la guarda NO alcanza al camino de los demás tipos (queda antes de session.fromPartition/clearStorageData)', n === 1 && iGuarda < iSesion, JSON.stringify({ iGuarda, iSesion }));
  const entre = n === 1 && iRm > iGuarda ? cuerpo.slice(iGuarda, iRm) : '';
  ok('P27-ST4 INMEDIATAMENTE antes: ningún `await` entre la consulta de la guarda y el rmSync', n === 1 && iRm > iGuarda && !/\bawait\b/.test(entre), entre.slice(0, 200));
  // El SQL de la comprobación existe UNA sola vez (un helper, sin copias que puedan diferir).
  ok('P27-ST5 la consulta `SELECT partition_name FROM projects` existe UNA sola vez en main.js (helper compartido con el predicado de P26)', (src.match(/SELECT partition_name FROM projects/g) || []).length === 1);
  const llamadasPredicado = (sinComentarios(extraerDe(src, 'function purgaP24Desligada(j)')).match(/particionUsadaPorFila\(/g) || []).length;
  ok('P27-ST6 el predicado de P26 usa el MISMO helper (una llamada)', llamadasPredicado === 1, String(llamadasPredicado));

  // «Cubre TODOS los caminos»: la destrucción de particiones tiene UN solo punto. Si
  // apareciera otro `clearStorageData()` o otra ruta bajo `Partitions/` con rm, la
  // guarda ya no sería suficiente y esto lo delata.
  // Sobre el archivo ENTERO: solo se quitan las líneas de comentario y los `// …` finales
  // (no `/* */`, cuyo patrón puede aparecer dentro de cadenas de un archivo de este tamaño).
  const codigo = src.split('\n').filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).map((l) => l.replace(/\s\/\/.*$/, '')).join('\n');
  const clears = (codigo.match(/\.clearStorageData\(/g) || []).length;
  let dentroClear = false;
  try { dentroClear = /\.clearStorageData\(/.test(cuerpo); } catch (e) { /* se reporta abajo */ }
  ok('P27-ST10 el ÚNICO clearStorageData() de main.js está dentro de vaciarParticionDe (no hay otra destrucción de sesión que la guarda no cubra)', clears === 1 && dentroClear, String(clears));
  const lineasParticiones = codigo.split('\n').filter((l) => /'Partitions'/.test(l));
  // (Desde P28 la ruta física la construye ÚNICAMENTE `rutaParticionSeguraParaBorrado`; antes lo hacía
  // `vaciarParticionDe` a mano. El otro uso es el inventario de residuos, que solo LISTA.)
  ok('P27-ST11 solo hay DOS usos de la carpeta `Partitions/`: la ruta confinada de rutaParticionSeguraParaBorrado y el inventario de residuos, que solo LISTA',
    lineasParticiones.length === 2 && lineasParticiones.some((l) => /path\.join\(sesion, 'Partitions'\)/.test(l)) && lineasParticiones.some((l) => /listar\(/.test(l)), JSON.stringify(lineasParticiones.map((l) => l.trim().slice(0, 100))));

  // «No hay riesgo de repetir DELETE»: ninguna función de la recuperación emite SQL de escritura.
  const firmas = ['async function resolverBorradoPendiente(j)', 'async function finalizarPurga(j)', 'async function vaciarParticionDe(j)',
    'function purgarTodo(j)', 'function reponerTodo(j)', 'function reponerRecurso(r)', 'function particionUsadaPorFila(particion)', 'function purgaP24Desligada(j)'];
  const culpables = [];
  for (const f of firmas) {
    let c;
    try { c = sinComentarios(extraerDe(src, f)); } catch (e) { culpables.push(f + ' (no extraída)'); continue; }
    if (/\.run\(|escribirMultiple|\b(DELETE|INSERT|UPDATE)\b/.test(c)) culpables.push(f);
  }
  ok('P27-ST7 la recuperación NO emite SQL de escritura (ni DELETE/INSERT/UPDATE, ni dbmod.run/escribirMultiple): no puede repetir el DELETE', culpables.length === 0, JSON.stringify(culpables));

  // El journal no guarda SQL: su literal y las propiedades que se le añaden.
  let literal = ''; let props = [];
  try {
    const eb = extraerDe(src, 'async function ejecutarBorrado(opts)');
    const m = eb.match(/const journal = \{([\s\S]*?)\n  \};/);
    literal = m ? m[1] : '';
    props = [...eb.matchAll(/\bjournal\.(\w+)\s*=/g)].map((x) => x[1]);
  } catch (e) { /* se reporta abajo */ }
  ok('P27-ST8 el literal del journal existe y no lleva SQL ni sentencias', literal.length > 0 && !/sql|sentencia/i.test(literal), literal.slice(0, 200));
  ok('P27-ST9 lo único que se añade al journal después es sinRecursos y particion (ningún SQL)', props.length > 0 && props.every((p) => p === 'sinRecursos' || p === 'particion'), JSON.stringify(props));
}

// ---- UNIDAD: el helper REAL -------------------------------------------------------
function dbTraza(filas, traza, opts) {
  const o = opts || {};
  return {
    getInstallationId: () => W,
    all: (sql) => { if (traza) traza.push('dbAll'); if (o.lanza) throw new Error('la consulta falla'); return typeof filas === 'function' ? filas(sql) : filas; },
  };
}
function comprobarHelper(env, ok) {
  const src = fs.readFileSync(mainPathDe(env), 'utf8');
  let uso;
  try {
    const fuente = [lineaConstDe(src, 'carpetaDeParticion'), extraerDe(src, 'function particionUsadaPorFila(particion)')].join('\n');
    uso = (filas, opts) => new Function('dbmod', fuente + '\nreturn particionUsadaPorFila;')(dbTraza(filas, null, opts))(PART);
  } catch (e) { ok('P27-H0 se pudo extraer particionUsadaPorFila REAL', false, String(e && e.message || e)); return; }
  const otras = [{ id: 1, partition_name: 'persist:proj-1700000000002-zzz002' }, { id: 2, partition_name: 'persist:directorio-talento' }];
  ok('P27-H1a LIBRE: sin filas', uso([]).estado === 'libre');
  ok('P27-H1b LIBRE: solo filas de otras particiones (incluida una que solo comparte prefijo)', uso(otras.concat([{ id: 9, partition_name: PART + 'x' }])).estado === 'libre');
  ok('P27-H2a REFERENCIADA: una fila usa exactamente esa partición', uso([{ id: 5, partition_name: PART }]).estado === 'referenciada');
  ok('P27-H2b REFERENCIADA: aunque cambie el caso', uso([{ id: 5, partition_name: PART.toUpperCase() }]).estado === 'referenciada');
  ok('P27-H2c REFERENCIADA: escrita sin el prefijo persist:', uso([{ id: 5, partition_name: PART.replace(/^persist:/, '') }]).estado === 'referenciada');
  ok('P27-H2d REFERENCIADA: la fila lleva OTRO id (la comparación es por partition_name, no por id)', uso([{ id: 999, partition_name: PART }]).estado === 'referenciada');
  ok('P27-H2e REFERENCIADA: entre otras filas, al principio o al final', uso(otras.concat([{ id: 7, partition_name: PART }])).estado === 'referenciada' && uso([{ id: 7, partition_name: PART }].concat(otras)).estado === 'referenciada');
  ok('P27-H3a NO DEMOSTRABLE: la consulta LANZA (no se interpreta como «sin fila»)', uso([], { lanza: true }).estado === 'no-demostrable');
  ok('P27-H3b NO DEMOSTRABLE: la consulta no devuelve una lista', [undefined, null, {}, 'x', 5].every((v) => uso(() => v).estado === 'no-demostrable'));
  ok('P27-H3c NO DEMOSTRABLE: una fila ilegible (null, sin partition_name, número) y ninguna coincide', [null, undefined, 3].every((v) => uso(otras.concat([{ id: 8, partition_name: v }])).estado === 'no-demostrable'));
  ok('P27-H3d una COINCIDENCIA manda sobre una fila ilegible, en cualquier orden', uso([{ partition_name: null }, { partition_name: PART }]).estado === 'referenciada' && uso([{ partition_name: PART }, { partition_name: null }]).estado === 'referenciada');
  ok('P27-H4 devuelve un motivo legible cuando NO es libre', ['referenciada', 'no-demostrable'].every((e) => { const r = e === 'referenciada' ? uso([{ partition_name: PART }]) : uso([], { lanza: true }); return typeof r.motivo === 'string' && r.motivo.length > 0; }));
}

// ---- UNIDAD: vaciarParticionDe REAL (la guarda) ------------------------------------
function comprobarGuarda(env, ok) {
  const src = fs.readFileSync(mainPathDe(env), 'utf8');
  let crear;
  try {
    const fuente = [
      lineaConstDe(src, 'carpetaDeParticion'), extraerDe(src, 'function particionUsadaPorFila(particion)'),
      // P28: la rama de rollback obtiene la ruta de `rutaParticionSeguraParaBorrado` y la de los demás
      // tipos exige el nombre seguro antes de pedirle nada a Electron.
      lineaConstDe(src, 'PARTICION_PROYECTO_PERSISTENTE_RE'), lineaConstDe(src, 'PARTICION_NOMBRE_SEGURO_RE'),
      extraerDe(src, 'function esHijoDirectoDe(padre, hijo)'), extraerDe(src, 'function rutaParticionSeguraParaBorrado(particion)'),
      extraerDe(src, 'async function vaciarParticionDe(j)'),
    ].join('\n');
    crear = (o) => {
      const traza = []; const log = []; const estado = { existe: o.carpetaExiste !== false };
      const fsD = {
        existsSync: () => { traza.push('existsSync'); return estado.existe; },
        rmSync: () => { traza.push('rmSync'); if (o.rmLanza) throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' }); estado.existe = false; },
      };
      const sessionD = { fromPartition: () => { traza.push('session'); return { clearStorageData: async () => { traza.push('clearStorageData'); if (o.clearLanza) throw new Error('clear falla'); } }; } };
      const f = new Function('dbmod', 'fs', 'path', 'app', 'session', 'appLog', fuente + '\nreturn vaciarParticionDe;')(
        dbTraza(o.filas === undefined ? [] : o.filas, traza, { lanza: !!o.bdLanza }), fsD, path, { getPath: () => 'C:\\ud' }, sessionD, (l) => log.push(l));
      return { f, traza, log };
    };
  } catch (e) { ok('P27-G0 se pudo extraer vaciarParticionDe REAL', false, String(e && e.message || e)); return Promise.resolve(); }
  const corre = async (j, o) => { const c = crear(o || {}); const r = await c.f(j); return { r, traza: c.traza, log: c.log }; };
  const rb = (extra) => Object.assign({ action_id: 'a'.repeat(32), tipo: 'rollback-creacion-proyecto', particion: PART }, extra || {});
  const usan = (id) => [{ id: id || 5, partition_name: PART }];
  return (async () => {
    const G1 = await corre(rb(), {});
    ok('P27-G1a sin fila: se destruye (rmSync) como siempre y devuelve ok', G1.r.ok === true && !G1.r.particionOmitida && G1.traza.includes('rmSync'), JSON.stringify(G1));
    const iC = G1.traza.indexOf('dbAll'); const iR = G1.traza.indexOf('rmSync');
    ok('P27-G1b la consulta va INMEDIATAMENTE antes del rmSync (existsSync, dbAll, rmSync, existsSync: nada en medio)', G1.traza.join() === 'existsSync,dbAll,rmSync,existsSync' && iC + 1 === iR, G1.traza.join());
    for (const [etq, filas] of [['exacta', usan()], ['con otro id', usan(999)], ['en mayúsculas', [{ id: 5, partition_name: PART.toUpperCase() }]], ['sin persist:', [{ id: 5, partition_name: PART.replace(/^persist:/, '') }]]]) {
      const G2 = await corre(rb(), { filas });
      ok(`P27-G2 fila que usa la partición (${etq}): NO rmSync, NO clearStorageData, NO sesión; ok con particionOmitida:'referenciada' y Aviso P27`,
        G2.r.ok === true && G2.r.particionOmitida === 'referenciada' && G2.traza.join() === 'existsSync,dbAll' && G2.log.some((l) => /Aviso — P27/.test(l)), JSON.stringify(G2));
    }
    const G3 = await corre(rb(), { bdLanza: true });
    ok('P27-G3a la consulta LANZA: NO se destruye nada y queda pendiente (ok:false, particionPendiente) — fail-closed', G3.r.ok === false && G3.r.particionPendiente === true && !G3.traza.includes('rmSync') && !G3.traza.includes('clearStorageData'), JSON.stringify(G3));
    const G3b = await corre(rb(), { filas: () => ({ no: 'es una lista' }) });
    ok('P27-G3b la consulta devuelve algo que no es una lista: NO se destruye, queda pendiente', G3b.r.ok === false && G3b.r.particionPendiente === true && !G3b.traza.includes('rmSync'), JSON.stringify(G3b));
    const G3c = await corre(rb(), { filas: [{ id: 1, partition_name: null }] });
    ok('P27-G3c una fila ilegible sin coincidencia: NO se destruye, queda pendiente', G3c.r.ok === false && G3c.r.particionPendiente === true && !G3c.traza.includes('rmSync'), JSON.stringify(G3c));
    ok('P27-G3d el log del fail-closed dice que NO se retira y por qué', G3.log.some((l) => /NO se retira/.test(l) && /no se pudo comprobar/.test(l)), JSON.stringify(G3.log));
    const G4 = await corre(rb(), { carpetaExiste: false, filas: usan() });
    ok('P27-G4 la carpeta no existe: nada que destruir, ok, y ni se consulta la BD', G4.r.ok === true && G4.traza.join() === 'existsSync', JSON.stringify(G4));
    const G5 = await corre(rb({ particion: undefined }), {});
    ok('P27-G5 sin particion: ok sin tocar nada', G5.r.ok === true && G5.traza.length === 0, JSON.stringify(G5));
    const G6 = await corre(rb(), { rmLanza: true });
    ok('P27-G6 sin fila pero con EBUSY: sigue siendo ok:false, particionPendiente (comportamiento P24 intacto)', G6.r.ok === false && G6.r.particionPendiente === true && G6.traza.includes('rmSync'), JSON.stringify(G6));

    // ---- los demás tipos NO cambian --------------------------------------------------
    const B1 = await corre(rb({ tipo: 'borrar-proyecto' }), { filas: usan() });
    ok('P27-G7a borrar-proyecto: sigue vaciando la sesión (clearStorageData) y NO consulta la BD ni hace rmSync — aunque el doble diga que una fila usa la partición (comportamiento histórico, sin cambios)',
      B1.r.ok === true && B1.traza.join() === 'session,clearStorageData' && !B1.r.particionOmitida, JSON.stringify(B1));
    const B2 = await corre(rb({ tipo: 'borrar-proyecto' }), { filas: [] });
    ok('P27-G7b borrar-proyecto sin fila: igual (session, clearStorageData), sin consultar la BD', B2.r.ok === true && B2.traza.join() === 'session,clearStorageData', JSON.stringify(B2));
    const B3 = await corre(rb({ tipo: 'borrar-proyecto' }), { clearLanza: true });
    ok('P27-G7c borrar-proyecto con clearStorageData que falla: ok:false, particionPendiente (sin cambios)', B3.r.ok === false && B3.r.particionPendiente === true, JSON.stringify(B3));
    for (const tipo of ['purgar-backups', 'borrar-prep']) {
      const T = await corre(rb({ tipo, particion: undefined }), { filas: usan() });
      ok(`P27-G8 ${tipo} (sin particion, como en producto): ok sin tocar nada`, T.r.ok === true && T.traza.length === 0, JSON.stringify(T));
      const T2 = await corre(rb({ tipo }), { filas: usan() });
      ok(`P27-G8b ${tipo} con particion declarada: camino histórico (clearStorageData), sin consultar la BD`, T2.r.ok === true && T2.traza.join() === 'session,clearStorageData', JSON.stringify(T2));
    }
  })();
}

// ---- UNIDAD: la política del journal (finalizarPurga) y la clase del CASO B ------------
async function comprobarPolitica(env, ok) {
  const src = fs.readFileSync(mainPathDe(env), 'utf8');
  let crearFin;
  try {
    const fuente = extraerDe(src, 'async function finalizarPurga(j)') + '\nreturn finalizarPurga;';
    crearFin = (o) => {
      const traza = [];
      const f = new Function('escribirJsonDurable', 'journalBorradoPath', 'purgarTodo', 'vaciarParticionDe', 'borrarJournalResuelto', fuente)(
        () => { traza.push('escribirJournal'); return { ok: true }; }, (id) => 'C:\\x\\' + id + '.json',
        () => { traza.push('purgarTodo'); return o.purgarTodo || { ok: true }; }, async () => { traza.push('vaciarParticionDe'); return o.vaciar; },
        () => { traza.push('borrarJournal'); });
      return { f, traza };
    };
  } catch (e) { ok('P27-F0 se pudo extraer finalizarPurga REAL', false, String(e && e.message || e)); return; }
  const j = { action_id: 'a'.repeat(32), tipo: 'rollback-creacion-proyecto', particion: PART, recursos: [] };
  const corre = async (o) => { const c = crearFin(o); const r = await c.f(j); return { r, traza: c.traza }; };
  const O = await corre({ vaciar: { ok: true, particionOmitida: 'referenciada' } });
  ok('P27-F1a partición referenciada: el journal se RETIRA (política B) y el resultado dice particionOmitida', O.r.ok === true && O.r.particionOmitida === 'referenciada' && O.traza.filter((t) => t === 'borrarJournal').length === 1, JSON.stringify(O));
  ok('P27-F1b orden: la cuarentena (purgarTodo) se vacía ANTES de decidir y el journal se retira DESPUÉS de la partición: nada reversible queda',
    O.traza.join() === 'escribirJournal,purgarTodo,vaciarParticionDe,borrarJournal', O.traza.join());
  const P = await corre({ vaciar: { ok: false, particionPendiente: true, motivo: 'no demostrable' } });
  ok('P27-F2 consulta no demostrable / EBUSY: el journal se CONSERVA y se devuelve ok:false, particionPendiente', P.r.ok === false && P.r.particionPendiente === true && !P.traza.includes('borrarJournal'), JSON.stringify(P));
  const N = await corre({ vaciar: { ok: true } });
  ok('P27-F3 purga normal: se retira el journal y el resultado es EXACTAMENTE {ok:true} (sin particionOmitida)', N.r.ok === true && JSON.stringify(N.r) === '{"ok":true}' && N.traza.filter((t) => t === 'borrarJournal').length === 1, JSON.stringify(N));
  const Q = await corre({ purgarTodo: { ok: false, motivo: 'cuarentena' }, vaciar: { ok: true } });
  ok('P27-F4 si la cuarentena no se puede vaciar no se llega a la partición ni se retira el journal', Q.r.ok === false && !Q.traza.includes('vaciarParticionDe') && !Q.traza.includes('borrarJournal'), JSON.stringify(Q));

  // CASO B histórico: la clase del resultado refleja lo que pasó.
  let crearRes;
  try {
    const P26x = construirPredicado(src);
    const fuente = P26x.fuente + '\n' + extraerDe(src, 'async function resolverBorradoPendiente(j)') + '\nreturn resolverBorradoPendiente;';
    crearRes = (o) => new Function('dbmod', 'estadoAccionEnMarca', 'finalizarPurga', 'vaciarParticionDe', 'reponerTodo', 'borrarJournalResuelto', 'journalBorradoPath', 'appLog', 'fs', 'path', 'borradosDir', fuente)(
      dbTraza(o.filas, null), () => ({ estado: o.marca }), async () => o.purga, async () => ({ ok: true }), () => ({ ok: true, detalle: [], malos: [] }), () => {}, () => 'C:\\x\\a.json', () => {}, { rmSync: () => {} }, path, () => 'C:\\x');
  } catch (e) { ok('P27-F5 se pudo extraer resolverBorradoPendiente REAL', false, String(e && e.message || e)); return; }
  const jb = Object.assign({ v: 1, writer: W, base_commit_id: hex('c'), fase: 'purgando', startedAt: '2026-09-19T00:00:00.000Z', sinRecursos: true }, j);
  const r1 = await crearRes({ filas: [{ partition_name: PART }], marca: 'aplicada', purga: { ok: true, particionOmitida: 'referenciada' } })(jb);
  ok('P27-F5a CASO B histórico (marca con el id) con la partición referenciada: ok, clase «sin-efecto» (no «purgado»)', r1.ok === true && r1.caso === 'B' && r1.clase === 'sin-efecto', JSON.stringify(r1));
  const r2 = await crearRes({ filas: [{ partition_name: PART }], marca: 'aplicada', purga: { ok: true } })(jb);
  ok('P27-F5b CASO B histórico purgado de verdad: clase «purgado» (sin cambios)', r2.ok === true && r2.caso === 'B' && r2.clase === 'purgado', JSON.stringify(r2));
  const r3 = await crearRes({ filas: [{ partition_name: PART }], marca: 'aplicada', purga: { ok: false, particionPendiente: true, motivo: 'x' } })(jb);
  ok('P27-F5c CASO B con la purga pendiente: ok:false, purga-incompleta (sin cambios)', r3.ok === false && r3.clase === 'purga-incompleta' && r3.particionPendiente === true, JSON.stringify(r3));
}

// ---- ELECTRON ---------------------------------------------------------------------------
async function ejecutarBateria(env) {
  let pass = 0, fail = 0; const fallos = [];
  function ok(n, c, extra) {
    if (c) { pass++; console.log('  OK    ' + n); }
    else { fail++; fallos.push(n); console.log('  FALLO ' + n + (extra === undefined ? '' : '  -- ' + extra)); }
  }
  const info = (m) => console.log('  INFO  ' + m);
  function seccion(t) { console.log('\n=== ' + t + ' ==='); }
  const opts = { env: env || {} };
  const procesos = [];
  const guardianAntes = snapshotGuardian();
  const lanzar = (modo, sb, extra) => { const { resultado } = P26.correr(modo, sb, extra, opts); procesos.push({ modo, sb, entorno: resultado && resultado.entorno }); return resultado; };

  seccion('P27-ST. ESTÁTICO — la guarda está donde tiene que estar y la recuperación no emite SQL');
  comprobarEstatico(env, ok);
  seccion('P27-H. UNIDAD — particionUsadaPorFila REAL');
  comprobarHelper(env, ok);
  seccion('P27-G. UNIDAD — vaciarParticionDe REAL: la guarda y los tipos que no cambian');
  await comprobarGuarda(env, ok);
  seccion('P27-F. UNIDAD — política del journal (finalizarPurga) y clase del CASO B');
  await comprobarPolitica(env, ok);

  // Un escenario Electron: preparación (proceso 1) -> centinela en la carpeta -> arranque real (proceso 2).
  function escenario(nombre, prepModo, prepArgs, arrArgs) {
    const sb = sandboxPara(nombre);
    const P = lanzar(prepModo, sb, prepArgs);
    if (!P || P.error) return { sb, P, A: null };
    const nom = P.nombre || path.basename(P.carpeta || '');
    const carpeta = P.carpeta || path.join(sb, 'userdata', 'Partitions', nom);
    if (prepModo !== 'prep-malformado') fs.writeFileSync(path.join(carpeta, CENTINELA), 'partición viva: no debe desaparecer', 'utf8');
    const antes = { carpeta: fs.existsSync(carpeta), centinela: fs.existsSync(path.join(carpeta, CENTINELA)) };
    const A = lanzar('arranque', sb, arrArgs || []);
    return { sb, P, A, nom, carpeta, antes };
  }
  const viva = (E) => fs.existsSync(E.carpeta) && fs.existsSync(path.join(E.carpeta, CENTINELA));
  const rmSobre = (E) => ((E.A && E.A.linea) || []).find((e) => e.tipo === 'fs' && e.op === 'rmSync' && /[\\/]Partitions[\\/]/.test(e.ruta) && String(e.ruta).toLowerCase().includes(String(E.nom).toLowerCase()));
  const logA = (E) => ((E.A && E.A.appLogRelevante) || []).join('\n');
  const soloJournal = (E) => (E.A && E.A.journalsFinal) || [];
  const arranqueSano = (E) => !!E.A && E.A.porQuit === false && !(E.A.dialogos || []).some((t) => /borrado anterior/i.test(t)) && !/PS-2006/.test(logA(E));

  // El estado final que la marca NO puede cambiar (fila viva + carpeta intacta + journal retirado).
  const finalConservador = (E) => viva(E) && !rmSobre(E) && soloJournal(E).length === 0 && arranqueSano(E);
  const finales = {};

  // ---- C1. Fila reaparece con el MISMO id + action_id TODAVÍA en la marca (el hallazgo de P27) ----
  seccion('P27-C1. FILA REAPARECIDA (mismo id) + action_id EN LA MARCA — el caso que destruía la partición viva');
  {
    const E = escenario('c1', 'prep', ['--n=0', '--fila=1', '--fila-id=mismo'], []);
    ok('P27-C1a el escenario terminó', !!E.A);
    if (E.A) {
      const P = E.P;
      ok('P27-C1b precondición: la marca CONTIENE el id de la acción P24, la fila reaparecida lleva el MISMO id que la fallida, y la carpeta + centinela existen',
        P.marcaContieneIdP24 === true && P.filaInsertada === P.idFallido && E.antes.carpeta && E.antes.centinela, JSON.stringify({ marca: P.marcaContieneIdP24, fila: P.filaInsertada, fallida: P.idFallido, antes: E.antes }));
      ok('P27-C1c precondición vista por el arranque: UN journal rollback-creacion-proyecto en purgando cita la carpeta', (E.A.antes.journals || []).length === 1 && E.A.antes.journals[0].tipo === 'rollback-creacion-proyecto' && E.A.antes.journals[0].fase === 'purgando');
      ok('P27-C1d la carpeta y el CENTINELA siguen intactos (la partición viva NO se destruyó)', viva(E), JSON.stringify({ carpeta: fs.existsSync(E.carpeta), centinela: fs.existsSync(path.join(E.carpeta, CENTINELA)) }));
      ok('P27-C1e nadie hizo rmSync sobre la carpeta (ni clearStorageData: no se abrió ninguna sesión de esa partición)', !rmSobre(E) && !((E.A.linea || []).some((e) => e.tipo === 'session-created' && String(e.storage).toLowerCase().includes(E.nom.toLowerCase()))), JSON.stringify(rmSobre(E)));
      ok('P27-C1f el journal se retiró (política B: la premisa del rollback ya no es cierta) y el arranque continuó sin PS-2006 ni cierre', soloJournal(E).length === 0 && arranqueSano(E), JSON.stringify({ j: soloJournal(E), q: E.A.porQuit, d: E.A.dialogos }));
      ok('P27-C1g el arranque dejó el Aviso P27 y NO usó ni la vía especial de P26 ni el CASO A', /Aviso — P27: la carpeta de la partición/.test(logA(E)) && !/sin consultar la marca de acciones/.test(logA(E)) && !/no llegó a confirmarse/.test(logA(E)), logA(E).slice(0, 300));
      ok('P27-C1h la fila SIGUE en la BD (no se repitió ningún DELETE)', (E.A.filasFinal || []).some((f) => f.partition_name === P.particion && f.id === P.idFallido), JSON.stringify(E.A.filasFinal));
      finales.c1 = finalConservador(E);
      // Estabilidad: nada re-interpreta el journal retirado.
      const A2 = lanzar('arranque', E.sb, []);
      ok('P27-C1i un SEGUNDO arranque: ningún journal, carpeta y centinela intactos, sin logs de borrado — nada se reinterpreta', !!A2 && (A2.journalsFinal || []).length === 0 && viva(E) && !(A2.appLogRelevante || []).some((l) => /Borrado|P27/.test(l)) && A2.porQuit === false, JSON.stringify({ j: A2 && A2.journalsFinal, log: A2 && A2.appLogRelevante }));
    }
    limpiar(E.sb);
  }

  // ---- C2. Fila reaparece + action_id YA FUERA de la marca --------------------------------------------
  seccion('P27-C2. FILA REAPARECIDA + action_id FUERA DE LA MARCA — el desenlace no depende de la marca');
  {
    const E = escenario('c2', 'prep', ['--n=10', '--fila=1'], []);
    ok('P27-C2a el escenario terminó', !!E.A);
    if (E.A) {
      ok('P27-C2b precondición: la marca está AGOTADA (sin el id) y hay una fila con esa partición', E.P.marcaContieneIdP24 === false && typeof E.P.filaInsertada === 'number', JSON.stringify({ marca: E.P.marcaContieneIdP24, fila: E.P.filaInsertada }));
      ok('P27-C2c carpeta y CENTINELA intactos, sin rmSync', viva(E) && !rmSobre(E));
      ok('P27-C2d journal retirado y arranque sano (CASO A histórico: «no llegó a confirmarse»)', soloJournal(E).length === 0 && arranqueSano(E) && /no llegó a confirmarse/.test(logA(E)), logA(E).slice(0, 300));
      ok('P27-C2e la fila sigue en la BD', (E.A.filasFinal || []).some((f) => f.partition_name === E.P.particion));
      finales.c2 = finalConservador(E);
    }
    limpiar(E.sb);
  }
  ok('P27-C2f el estado final es el MISMO con la marca intacta (C1) y con la marca agotada (C2): journal retirado, carpeta y centinela vivos, fila en la BD', finales.c1 === true && finales.c2 === true, JSON.stringify(finales));

  // ---- C3. La consulta a la BD falla durante la recuperación --------------------------------------------
  seccion('P27-C3. LA CONSULTA A LA BD FALLA — fail-closed: no se destruye y no se pierde la deuda');
  {
    const E = escenario('c3', 'prep', ['--n=0'], ['--bd-falla=1']);
    ok('P27-C3a el escenario terminó', !!E.A);
    if (E.A) {
      ok('P27-C3b precondición: marca con el id, SIN fila, carpeta y centinela existen', E.P.marcaContieneIdP24 === true && E.P.filaInsertada === undefined && E.antes.carpeta && E.antes.centinela);
      ok('P27-C3c carpeta y CENTINELA intactos, sin rmSync (fail-closed: sin poder demostrar que está desligada no se destruye)', viva(E) && !rmSobre(E), JSON.stringify(rmSobre(E)));
      ok('P27-C3d el journal SOBREVIVE (la deuda no se pierde) y el arranque se cierra a propósito con «borrado anterior sin resolver»', soloJournal(E).length === 1 && soloJournal(E)[0].tipo === 'rollback-creacion-proyecto' && E.A.porQuit === true && (E.A.dialogos || []).some((t) => /borrado anterior/i.test(t)), JSON.stringify({ j: soloJournal(E), q: E.A.porQuit, d: E.A.dialogos }));
      ok('P27-C3e el log dice que NO se retira y por qué', /NO se retira: no se pudo comprobar si alguna fila de projects la usa/.test(logA(E)), logA(E).slice(0, 300));
      // Con la BD sana el siguiente arranque converge: no se perdió nada.
      const A2 = lanzar('arranque', E.sb, []);
      const rm2 = ((A2 && A2.linea) || []).find((e) => e.tipo === 'fs' && e.op === 'rmSync' && /[\\/]Partitions[\\/]/.test(e.ruta) && e.ruta.toLowerCase().includes(E.nom.toLowerCase()));
      const unl2 = ((A2 && A2.linea) || []).find((e) => e.tipo === 'fs' && e.op === 'unlinkSync' && /\.panorama-borrados[\\/][0-9a-f]{32}\.json$/i.test(e.ruta));
      ok('P27-C3f con la BD sana, el arranque siguiente CONVERGE: rmSync ok, la carpeta desaparece y el journal cae después', !!A2 && !!rm2 && rm2.ok === true && !fs.existsSync(E.carpeta) && (A2.journalsFinal || []).length === 0 && !!unl2 && unl2.n > rm2.n && A2.porQuit === false, JSON.stringify({ rm2, unl2 }));
    }
    limpiar(E.sb);
  }

  // ---- C4. La fila NO existe: el comportamiento P26/P24 no cambia -----------------------------------------
  seccion('P27-C4. FILA INEXISTENTE — la guarda no sobre-bloquea: P26 (vía especial) y el CASO B histórico siguen purgando');
  {
    const E = escenario('c4a', 'prep', ['--n=0'], []);
    ok('P27-C4a vía especial de P26 (marca intacta, sin fila): la carpeta y el centinela DESAPARECEN, rmSync ok, journal retirado después',
      !!E.A && !fs.existsSync(E.carpeta) && !!rmSobre(E) && rmSobre(E).ok === true && soloJournal(E).length === 0 && /sin consultar la marca de acciones/.test(logA(E)) && arranqueSano(E), JSON.stringify({ rm: rmSobre(E), j: soloJournal(E) }));
    limpiar(E.sb);
    const F = escenario('c4b', 'prep', ['--n=0', '--fase-retirando=1'], []);
    const L = (F.A && F.A.linea) || [];
    const unl = L.find((e) => e.tipo === 'fs' && e.op === 'unlinkSync' && /\.panorama-borrados[\\/][0-9a-f]{32}\.json$/i.test(e.ruta));
    ok('P27-C4b CASO B histórico (journal en retirando + marca con el id, sin la vía de P26): sin fila la guarda deja purgar — carpeta y centinela desaparecen, rmSync ok y el journal cae DESPUÉS',
      !!F.A && (F.A.antes.journals || [])[0] && F.A.antes.journals[0].fase === 'retirando' && !fs.existsSync(F.carpeta) && !!rmSobre(F) && rmSobre(F).ok === true && !!unl && unl.n > rmSobre(F).n
      && !/sin consultar la marca de acciones/.test(logA(F)) && !/Aviso — P27/.test(logA(F)) && arranqueSano(F), JSON.stringify({ antes: F.A && F.A.antes, log: logA(F).slice(0, 300) }));
    limpiar(F.sb);
  }

  // ---- C5. Misma partition_name, OTRO id ------------------------------------------------------------------
  seccion('P27-C5. LA FILA REAPARECE CON OTRO ID pero la misma partition_name');
  {
    const E = escenario('c5', 'prep', ['--n=0', '--fila=1', '--fila-id=otro'], []);
    ok('P27-C5a el escenario terminó', !!E.A);
    if (E.A) {
      ok('P27-C5b precondición: el id de la fila reaparecida es DISTINTO del de la fila fallida', typeof E.P.filaInsertada === 'number' && E.P.filaInsertada !== E.P.idFallido, JSON.stringify({ fila: E.P.filaInsertada, fallida: E.P.idFallido }));
      ok('P27-C5c carpeta y CENTINELA intactos, sin rmSync', viva(E) && !rmSobre(E));
      ok('P27-C5d journal retirado, arranque sano, Aviso P27, y la fila (con su otro id) sigue', soloJournal(E).length === 0 && arranqueSano(E) && /Aviso — P27/.test(logA(E)) && (E.A.filasFinal || []).some((f) => f.partition_name === E.P.particion && f.id === E.P.filaInsertada), JSON.stringify(E.A.filasFinal));
    }
    limpiar(E.sb);
  }

  // ---- C6. Journal malformado ------------------------------------------------------------------------------
  seccion('P27-C6. JOURNAL MALFORMADO citando una partición viva — la recuperación no lo interpreta y no toca nada');
  {
    const E = escenario('c6', 'prep-malformado', [], []);
    ok('P27-C6a el escenario terminó', !!E.A && !!E.P);
    if (E.A) {
      const nom = path.basename(E.carpeta);
      E.nom = nom;
      ok('P27-C6b carpeta y CENTINELA intactos, sin rmSync', fs.existsSync(E.carpeta) && fs.existsSync(path.join(E.carpeta, CENTINELA)) && !rmSobre(E));
      ok('P27-C6c el journal malformado se CONSERVA y el arranque se cierra con «borrado anterior sin resolver» (PS-2006, sin cambios)', soloJournal(E).length === 1 && E.A.porQuit === true && (E.A.dialogos || []).some((t) => /borrado anterior/i.test(t)) && /journal de borrado no demostrable/.test(logA(E)), JSON.stringify({ j: soloJournal(E), q: E.A.porQuit, log: logA(E).slice(0, 200) }));
      ok('P27-C6d ni la guarda ni la vía especial llegaron a actuar (sin Aviso P27, sin «sin consultar la marca»)', !/Aviso — P27/.test(logA(E)) && !/sin consultar la marca de acciones/.test(logA(E)));
    }
    limpiar(E.sb);
  }

  seccion('P27-E. ARN-3 / CUSTODIA — el entorno quedó dentro del sandbox en CADA proceso y el estado real no cambió');
  {
    const dentro = (sb, p) => { const r = path.relative(path.resolve(sb), path.resolve(String(p || ''))); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
    const malos = procesos.filter((p) => !(p.entorno && p.entorno.todoDentroDelSandbox === true
      && ['APPDATA', 'LOCALAPPDATA', 'TEMP', 'appData', 'userData', 'sessionData', 'temp'].every((k) => dentro(p.sb, p.entorno[k]))));
    ok(`P27-E1 APPDATA, LOCALAPPDATA, TEMP, appData, userData, sessionData y temp cayeron DENTRO del sandbox en los ${procesos.length} procesos Electron`, procesos.length > 0 && malos.length === 0, JSON.stringify(malos.map((p) => p.modo)));
    const despues = snapshotGuardian();
    ok('P27-E2 custodia: el directorio REAL de DriveSyncGuard no cambió (se excluyen guard.log y heartbeat.txt, que escribe el guardián real en vivo)',
      JSON.stringify(guardianAntes.archivos) === JSON.stringify(despues.archivos) && guardianAntes.existe === despues.existe, JSON.stringify({ antes: guardianAntes.archivos, despues: despues.archivos }));
  }
  void info; void dormirSync;
  return { pass, fail, fallos };
}

if (require.main === module) {
  ejecutarBateria({}).then(({ pass, fail }) => {
    console.log('\n======================================================================');
    console.log(`  P27: ${pass} OK / ${fail} FALLOS`);
    console.log('======================================================================');
    if (fail) process.exitCode = 1;
  });
}

module.exports = { ejecutarBateria };
