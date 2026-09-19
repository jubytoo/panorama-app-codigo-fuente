// ---------------------------------------------------------------------------
// P26 — driver de la batería: «una purga P24 ya desligada no bloquea, y su
// recuperación no depende de acciones_<writer>».
//
// Tres niveles, del más barato al más caro:
//   ESTÁTICO   el predicado es ÚNICO: una definición, una llamada desde
//              f1Borrados y otra desde resolverBorradoPendiente, y ninguna de las
//              dos repite el criterio.
//   UNIDAD     el predicado REAL, `f1Borrados` REAL y `resolverBorradoPendiente`
//              REAL (extraídos por firma del main.js que se esté probando) contra
//              dobles de BD y de disco, rama a rama.
//   ELECTRON   la app real (Electron real, main.js sin modificar) en sandbox: un
//              proceso por escenario, y procesos NUEVOS para los arranques.
//
// Exporta `ejecutarBateria(env)` para que `comprobar-reversiones-p26.js` pueda
// correr la MISMA batería contra una copia revertida de main.js (PANORAMA_MAIN).
//
// Nada se ejecuta contra perfiles reales: cada sandbox se marca `_a33-p26-<…>` y
// vive bajo %TEMP%, nunca bajo la carpeta del proyecto ni bajo Drive. ARN-3: el
// arnés Electron fija APPDATA/LOCALAPPDATA/TEMP/appData/userData/temp dentro del
// sandbox antes de cualquier efecto lateral, y esta batería lo COMPRUEBA en cada
// proceso y además comprueba que el estado real del guardián no cambió.
// ---------------------------------------------------------------------------
'use strict';
const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const ELECTRON = path.join(PROJ, 'node_modules', 'electron', 'dist', 'electron.exe');
const SCRIPT = path.join(__dirname, 'test-p26-purga-desligada.js');
const mainPathDe = (env) => (env && env.PANORAMA_MAIN) || path.join(PROJ, 'main.js');

function sandboxPara(nombre) {
  const dir = path.join(os.tmpdir(), `_a33-p26-${nombre}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function limpiar(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }
const dormirSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function correr(modo, sandbox, extraArgs, opts) {
  const o = opts || {};
  try { fs.rmSync(path.join(sandbox, 'resultado.json'), { force: true }); } catch (e) {}
  const r = spawnSync(ELECTRON, [SCRIPT, `--sandbox=${sandbox}`, `--modo=${modo}`].concat(extraArgs || []), {
    timeout: o.timeoutMs || 90000, windowsHide: true, encoding: 'utf8',
    env: Object.assign({}, process.env, o.env || {}),
  });
  let resultado = null;
  try { resultado = JSON.parse(fs.readFileSync(path.join(sandbox, 'resultado.json'), 'utf8')); } catch (e) { /* se deja null */ }
  return { resultado, r };
}

// ---- extracción por firma (mismo patrón que 8A/P9/P22/P24) --------------------
function extraerDe(src, firma) {
  const i = src.indexOf(firma);
  if (i < 0) throw new Error('NO SE ENCONTRO: ' + firma);
  let j = src.indexOf('{', i + firma.length - 1), prof = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (prof === 0) return src.slice(i, k + 1); }
  }
  throw new Error('no delimitado: ' + firma);
}
function lineaConstDe(src, nombre) {
  const m = src.match(new RegExp('^const ' + nombre + ' = [^\\n]*$', 'm'));
  if (!m) throw new Error('NO SE ENCONTRO const ' + nombre);
  return m[0];
}
// Quita comentarios (// y /* */) para que un CRITERIO citado en un comentario no
// cuente como criterio repetido en el código.
function sinComentarios(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');
}

const W = 'b'.repeat(32);            // el installation-id de los dobles
const ID = 'a'.repeat(32);           // un action_id cualquiera
const PART = 'persist:proj-1700000000001-abc001';
const hex = (c) => c.repeat(32);
function journalBase(over) {
  return Object.assign({
    v: 1, action_id: ID, writer: W, tipo: 'rollback-creacion-proyecto', base_commit_id: hex('c'),
    fase: 'purgando', startedAt: '2026-09-19T00:00:00.000Z', recursos: [], sinRecursos: true, particion: PART,
  }, over || {});
}

// ---- ESTÁTICO: el predicado es único ---------------------------------------------
function comprobarUnico(env, ok) {
  const src = fs.readFileSync(mainPathDe(env), 'utf8');
  const cuenta = (re) => (src.match(re) || []).length;
  ok('P26-ST1 el predicado se define UNA sola vez (function purgaP24Desligada)', cuenta(/function purgaP24Desligada\(/g) === 1);
  let cuerpoF1 = ''; let cuerpoRes = '';
  try { cuerpoF1 = sinComentarios(extraerDe(src, 'function f1Borrados()')); cuerpoRes = sinComentarios(extraerDe(src, 'async function resolverBorradoPendiente(j)')); } catch (e) {
    ok('P26-ST0 se pudieron extraer f1Borrados y resolverBorradoPendiente', false, String(e && e.message || e)); return;
  }
  const llamadas = (c) => (c.match(/purgaP24Desligada\(/g) || []).length;
  ok('P26-ST2 f1Borrados llama al predicado exactamente UNA vez', llamadas(cuerpoF1) === 1, String(llamadas(cuerpoF1)));
  ok('P26-ST3 resolverBorradoPendiente llama al predicado exactamente UNA vez', llamadas(cuerpoRes) === 1, String(llamadas(cuerpoRes)));
  const repite = (c) => /rollback-creacion-proyecto|sinRecursos|'purgando'|partition_name|PARTICION_PROYECTO/.test(c);
  ok('P26-ST4 f1Borrados NO repite el criterio (ni tipo, ni fase, ni sinRecursos, ni la consulta a projects)', !repite(cuerpoF1));
  ok('P26-ST5 resolverBorradoPendiente NO repite el criterio (ni tipo, ni fase, ni sinRecursos, ni la consulta a projects)', !repite(cuerpoRes));
}

// ---- UNIDAD: el predicado REAL ---------------------------------------------------
function construirPredicado(src) {
  const fuente = [
    lineaConstDe(src, 'esHex'), lineaConstDe(src, 'BORRADOS_TIPOS_SIN_RECURSOS'),
    lineaConstDe(src, 'PARTICION_PROYECTO_PERSISTENTE_RE'), lineaConstDe(src, 'carpetaDeParticion'),
    // P27: la comprobación de filas vive en un helper compartido con la guarda.
    extraerDe(src, 'function particionUsadaPorFila(particion)'),
    extraerDe(src, 'function purgaP24Desligada(j)'),
  ].join('\n');
  return { fuente, crear: (dbmod) => new Function('dbmod', fuente + '\nreturn purgaP24Desligada;')(dbmod) };
}
// Un doble de `dbmod` con contador de consultas.
function dbDoble(filas, opts) {
  const o = opts || {};
  const d = { consultas: 0 };
  d.getInstallationId = () => { if (o.instalacionLanza) throw new Error('sin identidad'); return o.writer || W; };
  d.all = (sql) => { d.consultas++; if (o.lanza) throw new Error('la consulta falla'); return typeof filas === 'function' ? filas(sql) : filas; };
  return d;
}

function comprobarPredicado(env, ok) {
  const src = fs.readFileSync(mainPathDe(env), 'utf8');
  let P;
  try { P = construirPredicado(src); } catch (e) { ok('P26-U0 se pudo extraer el predicado REAL', false, String(e && e.message || e)); return; }
  const cumple = (j, filas, opts) => P.crear(dbDoble(filas === undefined ? [] : filas, opts))(j).cumple === true;
  const otras = [{ partition_name: 'persist:proj-1700000000002-zzz002' }, { partition_name: 'persist:directorio-talento' }];

  ok('P26-U1 CUMPLE con el estado exacto: propio, rollback-creacion-proyecto, purgando, sinRecursos, sin recursos, forma válida y ninguna fila', cumple(journalBase()));
  ok('P26-U2 CUMPLE aunque haya OTRAS filas con otras particiones', cumple(journalBase(), otras));
  ok('P26-U2b CUMPLE si otra fila solo comparte prefijo (carpeta distinta, no es la misma partición)', cumple(journalBase(), [{ partition_name: PART + 'x' }]));

  ok('P26-U3a NO cumple: journal de otro writer', !cumple(journalBase({ writer: hex('d') })));
  ok('P26-U3b NO cumple: writer sin formato de installation-id', !cumple(journalBase({ writer: 'no-es-hex' }), [], { writer: 'no-es-hex' }));
  ok('P26-U3c NO cumple: sin identidad de instalación (getInstallationId lanza)', !cumple(journalBase(), [], { instalacionLanza: true }));

  ok('P26-U4a NO cumple: tipo borrar-proyecto (aunque traiga sinRecursos, sin recursos y partición sin fila)', !cumple(journalBase({ tipo: 'borrar-proyecto' })));
  ok('P26-U4b NO cumple: tipo borrar-prep', !cumple(journalBase({ tipo: 'borrar-prep' })));
  ok('P26-U4c NO cumple: tipo purgar-backups', !cumple(journalBase({ tipo: 'purgar-backups' })));
  ok('P26-U4d NO cumple: tipo desconocido / ausente', !cumple(journalBase({ tipo: 'otro' })) && !cumple(journalBase({ tipo: undefined })));

  ok('P26-U5a NO cumple: fase retirando (el commit todavía no está demostrado)', !cumple(journalBase({ fase: 'retirando' })));
  ok('P26-U5b NO cumple: fase ausente o desconocida', !cumple(journalBase({ fase: undefined })) && !cumple(journalBase({ fase: 'otra' })));

  ok('P26-U6 NO cumple: sinRecursos ausente, false, "true" o 1', [undefined, false, 'true', 1].every((v) => !cumple(journalBase({ sinRecursos: v }))));
  ok('P26-U7a NO cumple: recursos no vacío', !cumple(journalBase({ recursos: [{ tipo: 'archivo' }] })));
  ok('P26-U7b NO cumple: recursos ausente, null u objeto', [undefined, null, {}, 'x'].every((v) => !cumple(journalBase({ recursos: v }))));

  ok('P26-U8a NO cumple: particion ausente, vacía o que no es una cadena', [undefined, null, '', 7].every((v) => !cumple(journalBase({ particion: v }))));
  ok('P26-U8b NO cumple: particion que no es de un proyecto persistente (directorio-talento, sin persist:, sin números, mayúsculas)',
    ['persist:directorio-talento', 'proj-1700000000001-abc001', 'persist:proj-abc-def', 'persist:proj-1700000000001-ABC001', 'persist:sonda-forma-invalida'].every((v) => !cumple(journalBase({ particion: v }))));
  ok('P26-U8c NO cumple: particion con travesía o separadores (nada que salga de Partitions/)',
    ['persist:proj-1700000000001-abc001/..', 'persist:proj-1700000000001-abc001\\..\\x', 'persist:..\\..\\x', 'persist:proj-1700000000001-abc/001'].every((v) => !cumple(journalBase({ particion: v }))));

  ok('P26-U9a NO cumple: una fila usa EXACTAMENTE esa partición', !cumple(journalBase(), [{ partition_name: PART }]));
  ok('P26-U9b NO cumple: una fila usa esa partición aunque cambie el caso', !cumple(journalBase(), [{ partition_name: PART.toUpperCase() }]));
  ok('P26-U9c NO cumple: una fila usa esa carpeta escrita sin el prefijo persist:', !cumple(journalBase(), [{ partition_name: PART.replace(/^persist:/, '') }]));
  ok('P26-U9d NO cumple: la fila aparece entre otras', !cumple(journalBase(), otras.concat([{ partition_name: PART }])));

  ok('P26-U10 NO cumple: una fila cuya partition_name no se puede leer (null, ausente, número) — ambiguo', [null, undefined, 3].every((v) => !cumple(journalBase(), [{ partition_name: v }])));
  ok('P26-U11 NO cumple: la consulta a projects LANZA (fail-closed, no se interpreta como «sin fila»)', !cumple(journalBase(), [], { lanza: true }));
  ok('P26-U12 NO cumple: la consulta devuelve algo que no es una lista', [undefined, null, {}, 'x', 5].every((v) => !cumple(journalBase(), () => v)));
  ok('P26-U13 NO cumple: journal nulo, array o cadena (malformado, sin excepción)', [null, undefined, [], 'x', 7].every((v) => !cumple(v)));
  {
    const d = dbDoble([]);
    const f = P.crear(d);
    f(journalBase({ tipo: 'borrar-proyecto' })); f(journalBase({ fase: 'retirando' })); f(journalBase({ writer: hex('d') })); f(journalBase({ recursos: [1] }));
    ok('P26-U14 no consulta la BD para journals que ya fallan una condición barata (camino caliente de F-1)', d.consultas === 0, String(d.consultas));
    f(journalBase());
    ok('P26-U14b consulta la BD una vez cuando todo lo demás cumple', d.consultas === 1, String(d.consultas));
  }
  ok('P26-U15 devuelve un motivo legible cuando NO cumple (solo diagnóstico)', (() => { const r = P.crear(dbDoble([{ partition_name: PART }]))(journalBase()); return r.cumple === false && typeof r.motivo === 'string' && r.motivo.length > 0; })());
  return P;
}

// ---- UNIDAD: f1Borrados REAL ---------------------------------------------------
function comprobarF1(env, ok) {
  const src = fs.readFileSync(mainPathDe(env), 'utf8');
  let P; let crearF1;
  try {
    P = construirPredicado(src);
    const fuente = P.fuente + '\n' + extraerDe(src, 'function f1Borrados()') + '\nreturn f1Borrados;';
    crearF1 = (dbmod, entradas, lanzaCarpeta) => new Function('dbmod', 'journalsDeBorrados', 'BORRADOS_DIR_NAME', fuente)(
      dbmod, () => (lanzaCarpeta ? { ok: false, motivo: 'EIO' } : { ok: true, entradas }), '.panorama-borrados');
  } catch (e) { ok('P26-F0 se pudo extraer f1Borrados REAL', false, String(e && e.message || e)); return; }
  const entrada = (j, ruta) => ({ clase: 'valido', ruta: ruta || 'C:\\x\\' + (j.action_id || ID) + '.json', j });
  const f1 = (entradas, filas, opts) => crearF1(dbDoble(filas === undefined ? [] : filas, opts), entradas)();

  ok('P26-F1a un P24 propio purgando, sin recursos y sin fila NO cuenta como pendiente: F-1 libre', f1([entrada(journalBase())]).libre === true);
  const conFila = f1([entrada(journalBase())], [{ partition_name: PART }]);
  ok('P26-F1b el mismo P24 con una FILA usando la partición SÍ bloquea (clase pendiente)', conFila.libre === false && conFila.clase === 'pendiente');
  ok('P26-F1c un P24 en fase retirando SÍ bloquea', f1([entrada(journalBase({ fase: 'retirando' }))]).libre === false);
  ok('P26-F1d un borrar-proyecto en purgando (con recursos y partición sin fila) SÍ bloquea',
    f1([entrada(journalBase({ tipo: 'borrar-proyecto', sinRecursos: undefined, recursos: [{ tipo: 'directorio' }] }))]).libre === false);
  ok('P26-F1e un borrar-proyecto con recursos:[] y sinRecursos (si llegara a leerse como válido) NO gana la excepción',
    f1([entrada(journalBase({ tipo: 'borrar-proyecto' }))]).libre === false);
  ok('P26-F1f purgar-backups y borrar-prep con sinRecursos, sin recursos y partición sin fila SIGUEN bloqueando',
    f1([entrada(journalBase({ tipo: 'purgar-backups' }))]).libre === false && f1([entrada(journalBase({ tipo: 'borrar-prep' }))]).libre === false);
  ok('P26-F1g un journal AJENO sigue ignorándose (sin cambios)', f1([entrada(journalBase({ writer: hex('d') }))]).libre === true);
  const inval = f1([{ clase: 'incompleto', ruta: 'C:\\x\\a.json', motivo: 'truncado', writerDeclarado: W }]);
  ok('P26-F1h un journal no interpretable sigue siendo no-demostrable (sin cambios)', inval.libre === false && inval.clase === 'no-demostrable');
  const mezcla = f1([entrada(journalBase()), entrada(journalBase({ action_id: hex('e'), tipo: 'borrar-proyecto', sinRecursos: undefined, recursos: [{ tipo: 'directorio' }] }))]);
  ok('P26-F1i con un P24 desligado y un borrar-proyecto pendiente, bloquea SOLO por el borrar-proyecto', mezcla.libre === false && mezcla.pendientes && mezcla.pendientes.length === 1 && mezcla.pendientes[0].actionId === hex('e'), JSON.stringify(mezcla));
  ok('P26-F1j si la BD no puede contestar, el P24 SÍ bloquea (fail-closed)', f1([entrada(journalBase())], [], { lanza: true }).libre === false);
  ok('P26-F1k si no se puede leer la carpeta de borrados sigue siendo no-verificable (sin cambios)', (() => { const r = crearF1(dbDoble([]), [], true)(); return r.libre === false && r.clase === 'no-verificable'; })());
}

// ---- UNIDAD: resolverBorradoPendiente REAL ---------------------------------------
async function comprobarRecuperacion(env, ok) {
  const src = fs.readFileSync(mainPathDe(env), 'utf8');
  let crear;
  try {
    const P = construirPredicado(src);
    const fuente = P.fuente + '\n' + extraerDe(src, 'async function resolverBorradoPendiente(j)') + '\nreturn resolverBorradoPendiente;';
    // `traza` deja el ORDEN de las llamadas: es lo que demuestra que la vía
    // especial no consulta la marca y que el journal no se retira por su cuenta.
    crear = (o) => {
      const traza = [];
      const dbmod = dbDoble(o.filas === undefined ? [] : o.filas, { lanza: !!o.bdLanza });
      const f = new Function('dbmod', 'estadoAccionEnMarca', 'finalizarPurga', 'vaciarParticionDe', 'reponerTodo', 'borrarJournalResuelto', 'journalBorradoPath', 'appLog', 'fs', 'path', 'borradosDir', fuente)(
        dbmod,
        () => { traza.push('marca'); return o.marca || { estado: 'no-aplicada' }; },
        async () => { traza.push('finalizarPurga'); return o.purga || { ok: true }; },
        async () => { traza.push('vaciarParticionDe'); return o.purga || { ok: true }; },
        () => { traza.push('reponerTodo'); return { ok: true, detalle: [], malos: [] }; },
        () => { traza.push('borrarJournalResuelto'); },
        (id) => 'C:\\x\\' + id + '.json', () => {}, { rmSync: () => {} }, path, () => 'C:\\x');
      return { f, traza };
    };
  } catch (e) { ok('P26-RC0 se pudo extraer resolverBorradoPendiente REAL', false, String(e && e.message || e)); return; }
  const corre = async (j, o) => { const { f, traza } = crear(o || {}); const r = await f(j); return { r, traza }; };
  const histA = 'marca,reponerTodo,borrarJournalResuelto';   // CASO A histórico: repone y retira el journal
  const recBorrarProyecto = { tipo: 'directorio', origen: 'C:\\x', cuarentena: 'C:\\y' };
  const borrarProyecto = (extra) => journalBase(Object.assign({ tipo: 'borrar-proyecto', sinRecursos: undefined, recursos: [recBorrarProyecto] }, extra || {}));

  const A = await corre(journalBase(), { marca: { estado: 'no-aplicada' } });
  ok('P26-RC1a P24 desligado con la marca SIN su id (ya expulsado): se purga y NO se consulta la marca', A.r.ok === true && A.r.caso === 'B' && A.r.clase === 'purgado' && A.traza.join() === 'finalizarPurga', JSON.stringify({ r: A.r, traza: A.traza }));
  ok('P26-RC1b el resultado declara qué prueba usó (prueba: particion-desligada)', A.r.prueba === 'particion-desligada');
  const B = await corre(journalBase(), { marca: { estado: 'no-demostrable', motivo: 'ilegible' } });
  ok('P26-RC1c P24 desligado con la marca ILEGIBLE: se purga igual (no depende de la marca)', B.r.ok === true && B.r.clase === 'purgado' && B.traza.join() === 'finalizarPurga', JSON.stringify({ r: B.r, traza: B.traza }));
  const C = await corre(journalBase(), { marca: { estado: 'aplicada' } });
  ok('P26-RC1d P24 desligado con la marca CONTENIENDO su id: mismo resultado y tampoco se consulta', C.r.ok === true && C.r.clase === 'purgado' && C.traza.join() === 'finalizarPurga', JSON.stringify({ r: C.r, traza: C.traza }));
  const D = await corre(journalBase(), { purga: { ok: false, motivo: 'EBUSY', particionPendiente: true } });
  ok('P26-RC2a si la carpeta no se puede retirar: ok:false, purga-incompleta, particionPendiente', D.r.ok === false && D.r.clase === 'purga-incompleta' && D.r.particionPendiente === true, JSON.stringify(D.r));
  ok('P26-RC2b y el journal NO se retira por su cuenta (solo finalizarPurga lo hace, DESPUÉS de verificar la carpeta)', !D.traza.includes('borrarJournalResuelto') && D.traza.join() === 'finalizarPurga', JSON.stringify(D.traza));
  const E = await corre(journalBase(), { filas: [{ partition_name: PART }], marca: { estado: 'no-aplicada' } });
  ok('P26-RC3a con una FILA usando la partición la excepción NO se aplica: se consulta la marca y sigue el camino histórico (CASO A)', E.traza.join() === histA && E.r.caso === 'A', JSON.stringify({ r: E.r, traza: E.traza }));
  ok('P26-RC3b ... y no se purga por la vía especial (ni finalizarPurga ni vaciarParticionDe)', !E.traza.includes('finalizarPurga') && !E.traza.includes('vaciarParticionDe'), JSON.stringify(E.traza));
  const F = await corre(journalBase({ fase: 'retirando' }), { marca: { estado: 'no-aplicada' } });
  ok('P26-RC4 un P24 en fase retirando sigue el camino histórico (marca, CASO A) y no se purga', F.traza.join() === histA, JSON.stringify(F.traza));
  const G = await corre(borrarProyecto(), { marca: { estado: 'no-aplicada' } });
  ok('P26-RC5a un borrar-proyecto cuyo id ha salido de la marca NO gana ninguna excepción: CASO A (se repone), sin purgar', G.traza.join() === histA && G.r.caso === 'A', JSON.stringify({ r: G.r, traza: G.traza }));
  const H = await corre(borrarProyecto(), { marca: { estado: 'aplicada' } });
  ok('P26-RC5b un borrar-proyecto con su id en la marca sigue el CASO B histórico (sin cambios)', H.r.caso === 'B' && H.traza.join() === 'marca,finalizarPurga', JSON.stringify({ r: H.r, traza: H.traza }));
  const I = await corre(journalBase({ tipo: 'purgar-backups' }), { marca: { estado: 'no-aplicada' } });
  ok('P26-RC6a purgar-backups con sinRecursos y partición sin fila NO gana la excepción (CASO A histórico)', I.traza.join() === histA, JSON.stringify(I.traza));
  const J = await corre(journalBase({ tipo: 'borrar-prep' }), { marca: { estado: 'no-aplicada' } });
  ok('P26-RC6b borrar-prep con sinRecursos y partición sin fila NO gana la excepción (CASO A histórico)', J.traza.join() === histA, JSON.stringify(J.traza));
  const K = await corre(borrarProyecto(), { marca: { estado: 'no-demostrable', motivo: 'ilegible' } });
  ok('P26-RC7 con la marca ilegible, un journal que no es el estado exacto sigue dando accion-no-demostrable (sin cambios)', K.r.ok === false && K.r.clase === 'accion-no-demostrable', JSON.stringify(K.r));
  const L = await corre(journalBase({ recursos: [recBorrarProyecto] }), { marca: { estado: 'no-aplicada' } });
  ok('P26-RC8 un P24 en purgando CON recursos no es el estado exacto: CASO A histórico, no se purga', L.traza.join() === histA, JSON.stringify(L.traza));
  const M = await corre(journalBase(), { bdLanza: true, marca: { estado: 'no-aplicada' } });
  ok('P26-RC9 si la BD no puede contestar durante la recuperación, la excepción NO se aplica (no se purga por la vía especial)', !M.traza.includes('finalizarPurga') && M.traza[0] === 'marca', JSON.stringify(M.traza));
}

// ---- helpers de aserción sobre un arranque real -------------------------------------
const esBloqueoF1 = (x) => !!x && x.aplicado === false && x.bloqueo === 'accion-no-demostrable';
function snapshotGuardian() {
  const dir = path.join(process.env.LOCALAPPDATA || '', 'PanoramaDriveSyncGuard');
  const out = { dir, existe: fs.existsSync(dir), archivos: {} };
  try {
    for (const n of fs.readdirSync(dir)) {
      if (n === 'guard.log' || n === 'heartbeat.txt') continue; // los escribe el guardián REAL en vivo
      const st = fs.statSync(path.join(dir, n));
      out.archivos[n] = { size: st.size, mtimeMs: st.mtimeMs };
    }
  } catch (e) { out.error = String((e && e.code) || e); }
  return out;
}

// El arranque que DEBE converger: carpeta fuera, journal fuera y después, por la
// vía especial, sin PS-2006 y sin que Chromium haya abierto la partición.
function aseverarConvergencia(pref, R, nombre, sbDir, ok, opts) {
  const o = opts || {};
  const L = R.linea || [];
  const enPart = (s) => typeof s === 'string' && s.toLowerCase().includes(nombre.toLowerCase());
  const antes = R.antes || { carpetas: [], journals: [] };
  const rm = L.find((e) => e.tipo === 'fs' && e.op === 'rmSync' && /[\\/]Partitions[\\/]/.test(e.ruta) && enPart(e.ruta));
  const unl = L.find((e) => e.tipo === 'fs' && e.op === 'unlinkSync' && /\.panorama-borrados[\\/][0-9a-f]{32}\.json$/i.test(e.ruta));
  const sesiones = L.filter((e) => e.tipo === 'session-created');
  const log = (R.appLogRelevante || []).join('\n');
  ok(`${pref}a precondición vista por el propio arranque: la carpeta existe y UN journal P24 en purgando la cita`,
    antes.carpetas.includes(nombre) && antes.journals.length === 1 && antes.journals[0].tipo === 'rollback-creacion-proyecto' && antes.journals[0].fase === 'purgando', JSON.stringify(antes));
  ok(`${pref}b el arranque usó la prueba especial (la BD) y NO consultó la marca: lo dice su app.log`,
    /sin consultar la marca de acciones/.test(log) && !/no llegó a confirmarse/.test(log), log.slice(0, 400));
  ok(`${pref}c la partición NO fue abierta/materializada por Chromium en este proceso`, !sesiones.some((s) => enPart(s.storage)), JSON.stringify(sesiones));
  ok(`${pref}d fs.rmSync sobre la carpeta de la partición se completa sin error`, !!rm && rm.ok === true, JSON.stringify(rm || L.slice(0, 8)));
  const existe = fs.existsSync(path.join(sbDir, 'userdata', 'Partitions', nombre));
  ok(`${pref}e fs.existsSync(carpeta de la partición) === false (desaparición REAL, verificada en disco)`, existe === false && !(R.carpetasFinal || []).includes(nombre), JSON.stringify(R.carpetasFinal));
  ok(`${pref}f el journal se elimina SOLO DESPUÉS del rmSync, y no antes (ningún unlink del journal previo)`, !!(rm && unl && unl.ok && unl.n > rm.n)
    && !L.some((e) => e.tipo === 'fs' && e.op === 'unlinkSync' && /\.panorama-borrados[\\/][0-9a-f]{32}\.json$/i.test(e.ruta) && rm && e.n < rm.n), JSON.stringify({ rm, unl }));
  ok(`${pref}g no queda journal pendiente`, (R.journalsFinal || []).length === 0, JSON.stringify(R.journalsFinal));
  ok(`${pref}h el arranque continúa: sin «borrado sin resolver», sin PS-2006 y sin cierre`,
    R.porQuit === false && !(R.dialogos || []).some((t) => /borrado anterior/i.test(t)) && !/PS-2006|no se pudo eliminar la carpeta|sigue existiendo tras intentar|limpieza pendiente/i.test(log), JSON.stringify({ porQuit: R.porQuit, dialogos: R.dialogos }));
  if (o.orden !== false) {
    const antesV = rm ? L.filter((e) => e.tipo === 'window-created' && e.n < rm.n).length : -1;
    const despuesV = rm ? L.filter((e) => e.tipo === 'window-created' && e.n > rm.n).length : -1;
    ok(`${pref}i orden real: antes de resolver la partición solo existe la splash y el resto de ventanas nacen después`, antesV === 1 && despuesV >= 1, JSON.stringify({ antesV, despuesV }));
  }
}

async function ejecutarBateria(env) {
  let pass = 0, fail = 0; const fallos = [];
  function ok(n, c, extra) {
    if (c) { pass++; console.log('  OK    ' + n); }
    else { fail++; fallos.push(n); console.log('  FALLO ' + n + (extra === undefined ? '' : '  -- ' + extra)); }
  }
  const info = (m) => console.log('  INFO  ' + m);
  function seccion(t) { console.log('\n=== ' + t + ' ==='); }
  const opts = { env: env || {} };
  const procesos = [];      // ARN-3: (modo, sandbox, resultado) de cada proceso Electron
  const guardianAntes = snapshotGuardian();
  const registrar = (modo, sb, resultado) => { procesos.push({ modo, sb, entorno: resultado && resultado.entorno }); return resultado; };
  const lanzar = (modo, sb, extra) => { const { resultado } = correr(modo, sb, extra, opts); return registrar(modo, sb, resultado); };

  seccion('P26-ST. ESTÁTICO — el predicado es único y ninguna de las dos puertas repite el criterio');
  comprobarUnico(env, ok);

  seccion('P26-U. UNIDAD — el predicado REAL, rama a rama');
  comprobarPredicado(env, ok);

  seccion('P26-F. UNIDAD — f1Borrados REAL');
  comprobarF1(env, ok);

  seccion('P26-RC. UNIDAD — resolverBorradoPendiente REAL');
  await comprobarRecuperacion(env, ok);

  // -------------------------------------------------------------------------
  seccion('P26-A/M. AJENAS Y MARCA AGOTADA — operaciones ajenas con un P24 purgando pendiente; después, agotar la marca de 8 acciones');
  const sbA = sandboxPara('ajenas');
  {
    const R = lanzar('ajenas', sbA, []);
    ok('P26-A0 el proceso terminó y escribió resultado', !!R, R ? '' : 'sin resultado');
    if (R && !R.error) {
      const ini = R.inicial || {};
      ok('P26-A1 estado exacto tras el import fallido: rollback-creacion-proyecto, fase purgando, sinRecursos, 0 recursos, partición persist:proj-…',
        !!ini.journal && ini.journal.tipo === 'rollback-creacion-proyecto' && ini.journal.fase === 'purgando' && ini.journal.sinRecursos === true && ini.journal.recursos === 0 && /^persist:proj-/.test(ini.journal.particion || ''), JSON.stringify(ini.journal));
      ok('P26-A1b el import falló con el error ORIGINAL de seed y la fila ya no existe (commit aplicado); la carpeta sigue en disco (EBUSY)',
        ini.importMalo && ini.importMalo.ok === false && /No se pudieron guardar los datos importados/.test(ini.importMalo.error || '') && ini.filaConLaParticion === false && ini.carpetaExiste === true, JSON.stringify(ini));
      ok('P26-A1c la marca contenía el id de la acción P24 al empezar (el caso «sano» de siempre)', ini.marcaContieneIdP24 === true);
      const A = R.ajenas || {};
      ok('P26-A2 backup:save de OTRO proyecto se aplica con el P24 pendiente', A.backupOtro && A.backupOtro.aplicado === true, JSON.stringify(A.backupOtro));
      ok('P26-A3 projects:create SIN import funciona', A.crearSinImport && A.crearSinImport.ok === true, JSON.stringify(A.crearSinImport));
      ok('P26-A4 projects:create CON import correcto funciona', A.crearConImportValido && A.crearConImportValido.ok === true, JSON.stringify(A.crearConImportValido));
      ok('P26-A5 projects:delete de OTRO proyecto se aplica', A.borrarOtro && A.borrarOtro.aplicado === true, JSON.stringify(A.borrarOtro));
      ok('P26-A6 la restauración de OTRO proyecto (backup:restore) se aplica', A.restaurarOtro && A.restaurarOtro.aplicado === true, JSON.stringify(A.restaurarOtro));
      ok('P26-A7 un backup posterior a la restauración se aplica', A.backupTrasRestaurar && A.backupTrasRestaurar.aplicado === true, JSON.stringify(A.backupTrasRestaurar));
      ok('P26-M1 la marca de 8 acciones quedó AGOTADA: ya no contiene el id de la acción P24, y todos los guardados que la agotaron se aplicaron',
        R.marcaFinal && R.marcaFinal.contieneIdP24 === false && R.marcaFinal.longitud === 8 && (R.pasosAgotarMarca || []).length >= 3 && (R.pasosAgotarMarca || []).every((p) => p.aplicado === true), JSON.stringify({ marca: R.marcaFinal, pasos: R.pasosAgotarMarca }));
      ok('P26-M2 el journal P24 quedó BYTE A BYTE intacto (mismo hash y mismo mtime) tras todas las operaciones ajenas', R.journalIntacto === true);
      ok('P26-M3 la carpeta de la partición pendiente sigue en disco', R.carpetaExisteAlFinal === true);
      ok('P26-M4 ninguna operación ajena hizo rmSync/unlink/rename/escritura sobre el journal P24 ni sobre su partición', Array.isArray(R.eventosSobreLaPendiente) && R.eventosSobreLaPendiente.length === 0, JSON.stringify(R.eventosSobreLaPendiente));
      ok('P26-M5 ninguna fila de projects usa la partición pendiente', R.filaConLaParticionAlFinal === false);
      ok('P26-M6 lo único pendiente en .panorama-borrados es el journal P24 (las ajenas dejaron todo resuelto)',
        Array.isArray(R.journalsFinal) && R.journalsFinal.length === 1 && R.journalsFinal[0].tipo === 'rollback-creacion-proyecto', JSON.stringify(R.journalsFinal));

      // ---- proceso NUEVO: el arranque real converge aunque la marca ya no tenga el id ----
      seccion('P26-M7. SIGUIENTE ARRANQUE con la marca AGOTADA — retira la carpeta y solo entonces el journal');
      const RA = lanzar('arranque', sbA, []);
      ok('P26-M7 el arranque terminó y escribió resultado', !!RA);
      if (RA) {
        aseverarConvergencia('P26-M8', RA, R.nombre, sbA, ok);
        const filas = RA.filasFinal || [];
        ok('P26-M9 los proyectos que se crearon durante la deuda siguen ahí, con su partición intacta',
          filas.some((f) => f.name === 'P26 proyecto bueno') && filas.some((f) => f.name === 'P26 otro con import')
          && filas.every((f) => (RA.carpetasFinal || []).includes(String(f.partition_name).replace(/^persist:/, ''))), JSON.stringify({ filas, carpetas: RA.carpetasFinal }));
      }
    }
  }
  limpiar(sbA);

  // -------------------------------------------------------------------------
  seccion('P26-FR. FILA REAPARECIDA — el predicado es FALSE, F-1 bloquea y la vía especial no borra');
  {
    const sb = sandboxPara('fila-agotada');
    const R = lanzar('prep', sb, ['--n=10', '--fila=1']);
    ok('P26-FR0 el proceso terminó y escribió resultado', !!R);
    if (R && !R.error) {
      ok('P26-FR1 precondición: la marca está agotada (sin el id de la acción P24) y una fila usa ahora la partición',
        R.marcaContieneIdP24 === false && typeof R.filaInsertada === 'number', JSON.stringify({ marca: R.marcaContieneIdP24, fila: R.filaInsertada }));
      ok('P26-FR2 con la fila presente F-1 BLOQUEA el guardado (accion-no-demostrable)', esBloqueoF1(R.guardadoConFila), JSON.stringify(R.guardadoConFila));
      ok('P26-FR3 con la fila presente F-1 BLOQUEA también el borrado', esBloqueoF1(R.borrarConFila), JSON.stringify(R.borrarConFila));
      ok('P26-FR4 el journal P24 sigue pendiente en esa sesión', (R.journalsFinal || []).length === 1 && R.carpetaExisteAlFinal === true);
      const RA = lanzar('arranque', sb, []);
      ok('P26-FR5 el arranque terminó y escribió resultado', !!RA);
      if (RA) {
        const nombre = R.nombre;
        const L = RA.linea || [];
        const rm = L.find((e) => e.tipo === 'fs' && e.op === 'rmSync' && /[\\/]Partitions[\\/]/.test(e.ruta) && e.ruta.toLowerCase().includes(nombre.toLowerCase()));
        ok('P26-FR6 la carpeta de una partición usada por una fila viva SIGUE en disco (marca agotada)', fs.existsSync(path.join(sb, 'userdata', 'Partitions', nombre)) && (RA.carpetasFinal || []).includes(nombre), JSON.stringify(RA.carpetasFinal));
        ok('P26-FR7 nadie hizo rmSync sobre esa carpeta', !rm, JSON.stringify(rm));
        ok('P26-FR8 la vía especial NO se usó (no consta «sin consultar la marca de acciones»)', !/sin consultar la marca de acciones/.test((RA.appLogRelevante || []).join('\n')), (RA.appLogRelevante || []).join('\n').slice(0, 300));
        ok('P26-FR9 la fila sigue en la base de datos', (RA.filasFinal || []).some((f) => f.partition_name === R.particion), JSON.stringify(RA.filasFinal));
      }
    }
    limpiar(sb);
  }
  {
    // La misma fila reaparecida pero con la marca INTACTA (CASO B histórico). Hasta
    // P27 este caso destruía la carpeta de una partición viva (medido); desde P27
    // la guarda de `vaciarParticionDe` la protege, y aquí se exige.
    const sb = sandboxPara('fila-intacta');
    const R = lanzar('prep', sb, ['--n=0', '--fila=1']);
    ok('P26-FR10a precondición: la marca CONTIENE el id de la acción P24 y una fila usa la partición', !!R && !R.error && R.marcaContieneIdP24 === true && typeof R.filaInsertada === 'number', JSON.stringify(R && { m: R.marcaContieneIdP24, f: R.filaInsertada }));
    if (R && !R.error) {
      const RA = lanzar('arranque', sb, []);
      ok('P26-FR10b el arranque terminó y escribió resultado', !!RA);
      if (RA) {
        const L = RA.linea || [];
        const rm = L.find((e) => e.tipo === 'fs' && e.op === 'rmSync' && /[\\/]Partitions[\\/]/.test(e.ruta) && e.ruta.toLowerCase().includes(R.nombre.toLowerCase()));
        ok('P26-FR10 con la fila viva y la marca INTACTA (CASO B histórico) la carpeta también se CONSERVA y nadie hace rmSync sobre ella (lo garantiza la guarda de P27)',
          fs.existsSync(path.join(sb, 'userdata', 'Partitions', R.nombre)) && (RA.carpetasFinal || []).includes(R.nombre) && !rm, JSON.stringify({ carpetas: RA.carpetasFinal, rm }));
      }
    }
    limpiar(sb);
  }

  // -------------------------------------------------------------------------
  seccion('P26-DF. DOS IMPORTS FALLIDOS — el segundo rollback ya no se salta por F-1 ocupado por el primero');
  {
    const sb = sandboxPara('dos-fallos');
    const R = lanzar('dos-fallos', sb, []);
    ok('P26-DF0 el proceso terminó y escribió resultado', !!R && !R.error, JSON.stringify(R && R.error));
    if (R && !R.error) {
      const original = (x) => x && x.ok === false && /No se pudieron guardar los datos importados/.test(x.error || '');
      ok('P26-DF1 los dos imports fallidos se rechazan con el error ORIGINAL de seed', original(R.primero) && original(R.segundo), JSON.stringify({ p: R.primero, s: R.segundo }));
      const js = R.journals || [];
      ok('P26-DF2 hay DOS journals P24 en purgando, sin recursos, con particiones DISTINTAS',
        js.length === 2 && js.every((j) => j.fase === 'purgando' && j.sinRecursos === true && j.recursos === 0) && js[0].particion !== js[1].particion, JSON.stringify(js));
      ok('P26-DF3 el segundo rollback SÍ se hizo (ninguna fila usa ninguna de las dos particiones; solo queda el proyecto bueno) y las dos carpetas siguen en disco (EBUSY)',
        R.filaConAlgunaParticion === false && (R.carpetasExisten || []).every(Boolean) && JSON.stringify(R.filasProyectos) === JSON.stringify(['P26 proyecto bueno']), JSON.stringify(R));
      ok('P26-DF4 un backup posterior se aplica con los dos journals pendientes', R.guardadoTrasElSegundo && R.guardadoTrasElSegundo.aplicado === true, JSON.stringify(R.guardadoTrasElSegundo));
      const RA = lanzar('arranque', sb, []);
      ok('P26-DF5 el arranque siguiente terminó y escribió resultado', !!RA);
      if (RA) {
        const L = RA.linea || [];
        const partes = js.map((j) => String(j.particion).replace(/^persist:/, ''));
        ok('P26-DF6 las DOS carpetas desaparecieron de verdad (disco y carpetasFinal)', partes.every((n) => !fs.existsSync(path.join(sb, 'userdata', 'Partitions', n)) && !(RA.carpetasFinal || []).includes(n)), JSON.stringify(RA.carpetasFinal));
        const ordenOk = partes.every((n) => {
          const rm = L.find((e) => e.tipo === 'fs' && e.op === 'rmSync' && /[\\/]Partitions[\\/]/.test(e.ruta) && e.ruta.toLowerCase().includes(n.toLowerCase()));
          return !!rm && rm.ok === true;
        });
        ok('P26-DF7 cada partición se retiró con un rmSync completado', ordenOk, JSON.stringify(L.filter((e) => e.tipo === 'fs' && e.op === 'rmSync')));
        ok('P26-DF8 no queda ningún journal y el arranque continuó sin PS-2006 ni cierre', (RA.journalsFinal || []).length === 0 && RA.porQuit === false && !(RA.dialogos || []).length, JSON.stringify({ j: RA.journalsFinal, q: RA.porQuit, d: RA.dialogos }));
      }
    }
    limpiar(sb);
  }

  // -------------------------------------------------------------------------
  seccion('P26-N. NEGATIVAS — lo que sigue bloqueando (y el único estado que no)');
  {
    const sb = sandboxPara('negativas');
    const R = lanzar('negativas', sb, []);
    ok('P26-N0 el proceso terminó y escribió resultado', !!R);
    if (R && !R.error) {
      const c = R['CTRL-p24-purgando-sin-fila'] || {};
      ok('P26-N-CTRL control positivo: P24 purgando, sin recursos, sin fila → el guardado Y el borrado se aplican', c.guardado && c.guardado.aplicado === true && c.borrado && c.borrado.aplicado === true, JSON.stringify(c));
      const bloquea = (id, etq, conBorrado) => {
        const x = R[id] || {};
        ok(`P26-N-${etq} SIGUE bloqueando el guardado` + (conBorrado ? ' y el borrado' : ''), esBloqueoF1(x.guardado) && (!conBorrado || esBloqueoF1(x.borrado)), JSON.stringify(x));
      };
      bloquea('N1-p24-retirando', 'N1 P24 en fase retirando', true);
      bloquea('N2-p24-purgando-con-fila', 'N2 P24 purgando con una fila usando la partición', true);
      bloquea('N3-p24-purgando-con-recursos', 'N3 P24 purgando con recursos no vacíos', false);
      bloquea('N4-p24-sin-sinRecursos', 'N4 P24 sin sinRecursos:true', false);
      bloquea('N5-consulta-falla', 'N5 la consulta a la BD falla', true);
      bloquea('N5b-consulta-ambigua', 'N5b la consulta a la BD devuelve algo que no es una lista', false);
      bloquea('N6-journal-no-demostrable', 'N6 journal no demostrable (truncado)', false);
      bloquea('N7-borrar-proyecto-pendiente', 'N7 borrar-proyecto pendiente (con su partición y sin fila)', true);
      bloquea('N7b-purgar-backups-sinRecursos-con-particion', 'N7b purgar-backups con sinRecursos y partición sin fila', false);
      bloquea('N7c-borrar-prep-sinRecursos-con-particion', 'N7c borrar-prep con sinRecursos y partición sin fila', false);
      bloquea('N9-p24-purgando-particion-sin-forma', 'N9 P24 purgando con una partición que no es de proyecto persistente', false);
      bloquea('N9b-p24-purgando-particion-travesia', 'N9b P24 purgando con una partición con travesía', false);
      const n8 = R['N8-accion-propia-pendiente'] || {};
      ok('P26-N-N8 una ACCIÓN propia pendiente SIGUE bloqueando los borrados (f1Global, sin cambios)', esBloqueoF1(n8.borrado), JSON.stringify(n8));
      const n10 = R['N10-p24-ajeno'] || {};
      ok('P26-N-N10 un journal P24 de OTRO writer sigue ignorándose como siempre (sin cambios)', n10.guardado && n10.guardado.aplicado === true, JSON.stringify(n10));
      ok('P26-N-LIMPIO no queda ningún journal fabricado al terminar', (R.journalsResiduales || []).length === 0, JSON.stringify(R.journalsResiduales));
    }
    limpiar(sb);
  }

  // -------------------------------------------------------------------------
  seccion('P26-B. UN borrar-proyecto CUYO ID NO ESTÁ EN LA MARCA no gana ninguna excepción');
  {
    const sb = sandboxPara('borrar-proyecto');
    const R = lanzar('prep-borrar-proyecto', sb, []);
    ok('P26-B0 el proceso terminó y escribió resultado', !!R);
    if (R && !R.error) {
      ok('P26-B1 precondición: journal borrar-proyecto en purgando, con su material en cuarentena; la marca NO contiene su id; F-1 bloquea el guardado',
        R.journalEscrito === true && R.marcaContieneId === false && esBloqueoF1(R.guardadoConElPendiente) && R.filaConLaParticion === false, JSON.stringify(R));
      const RA = lanzar('arranque', sb, []);
      ok('P26-B2 el arranque terminó y escribió resultado', !!RA);
      if (RA) {
        const log = (RA.appLogRelevante || []).join('\n');
        ok('P26-B3 el arranque lo trata por el camino HISTÓRICO: «no llegó a confirmarse: deshecho» y NO usa la vía especial',
          /no llegó a confirmarse: deshecho/.test(log) && !/sin consultar la marca de acciones/.test(log), log.slice(0, 300));
        const dato = path.join(R.origen, 'dato.txt');
        ok('P26-B4 el material DEVUELTO a su sitio (no se purgó): el origen existe con su contenido y la cuarentena ya no', fs.existsSync(dato) && !fs.existsSync(R.cuarentena), JSON.stringify({ dato: fs.existsSync(dato), cuarentena: fs.existsSync(R.cuarentena) }));
        ok('P26-B5 el journal se retiró y el arranque continuó sin PS-2006', (RA.journalsFinal || []).length === 0 && RA.porQuit === false && !(RA.dialogos || []).length, JSON.stringify({ j: RA.journalsFinal, q: RA.porQuit, d: RA.dialogos }));
      }
    }
    limpiar(sb);
  }

  // -------------------------------------------------------------------------
  seccion('P26-D. DURABILIDAD — si la carpeta NO se puede retirar, el journal SOBREVIVE; cuando se puede, cae el último');
  {
    const sb = sandboxPara('durabilidad');
    const R = lanzar('prep', sb, ['--n=0']);
    ok('P26-D0 el proceso de preparación terminó y escribió resultado', !!R && !R.error);
    if (R && !R.error) {
      const carpeta = path.join(sb, 'userdata', 'Partitions', R.nombre);
      ok('P26-D0b precondición: journal P24 pendiente y carpeta en disco', (R.journalsFinal || []).length === 1 && fs.existsSync(carpeta));
      // Un proceso ajeno tiene la carpeta como directorio de trabajo: Windows no deja retirarla.
      const sujeto = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { cwd: carpeta, windowsHide: true, stdio: 'ignore' });
      dormirSync(900);
      let A1 = null;
      try { A1 = lanzar('arranque', sb, []); } finally { try { sujeto.kill(); } catch (e) {} }
      ok('P26-D1 el arranque con la carpeta BLOQUEADA terminó y escribió resultado', !!A1);
      if (A1) {
        const L = A1.linea || [];
        const rmFalla = L.find((e) => e.tipo === 'fs' && e.op === 'rmSync' && /[\\/]Partitions[\\/]/.test(e.ruta) && e.ok === false);
        ok('P26-D2 la vía especial intentó retirar la carpeta y NO pudo (rmSync falló con un error real de Windows)', /sin consultar la marca de acciones/.test((A1.appLogRelevante || []).join('\n')) && !!rmFalla, JSON.stringify({ rmFalla, log: A1.appLogRelevante }));
        ok('P26-D3 el journal SOBREVIVE (nada lo retiró antes de verificar la desaparición física)', (A1.journalsFinal || []).length === 1 && A1.journalsFinal[0].tipo === 'rollback-creacion-proyecto', JSON.stringify(A1.journalsFinal));
        ok('P26-D4 ningún unlink del journal durante el intento fallido', !L.some((e) => e.tipo === 'fs' && e.op === 'unlinkSync' && /\.panorama-borrados[\\/][0-9a-f]{32}\.json$/i.test(e.ruta)), JSON.stringify(L.filter((e) => e.tipo === 'fs')));
        ok('P26-D5 la carpeta sigue existiendo y el arranque se cierra a propósito con «borrado anterior sin resolver» (comportamiento documentado de una purga pendiente)',
          fs.existsSync(carpeta) && A1.porQuit === true && (A1.dialogos || []).some((t) => /borrado anterior/i.test(t)), JSON.stringify({ porQuit: A1.porQuit, dialogos: A1.dialogos }));
      }
      dormirSync(900);
      const A2 = lanzar('arranque', sb, []);
      ok('P26-D6 el arranque siguiente (carpeta libre) terminó y escribió resultado', !!A2);
      if (A2) aseverarConvergencia('P26-D7', A2, R.nombre, sb, ok, { orden: false });
    }
    limpiar(sb);
  }

  // -------------------------------------------------------------------------
  seccion('P26-E. ARN-3 / CUSTODIA — el entorno quedó dentro del sandbox en CADA proceso y el estado real no cambió');
  {
    const dentro = (sb, p) => { const r = path.relative(path.resolve(sb), path.resolve(String(p || ''))); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
    const malos = procesos.filter((p) => !(p.entorno && p.entorno.todoDentroDelSandbox === true
      && ['APPDATA', 'LOCALAPPDATA', 'TEMP', 'appData', 'userData', 'sessionData', 'temp'].every((k) => dentro(p.sb, p.entorno[k]))));
    ok(`P26-E1 APPDATA, LOCALAPPDATA, TEMP, appData, userData, sessionData y temp cayeron DENTRO del sandbox en los ${procesos.length} procesos Electron`, procesos.length > 0 && malos.length === 0, JSON.stringify(malos.map((p) => p.modo)));
    const despues = snapshotGuardian();
    ok('P26-E2 custodia: el directorio REAL de DriveSyncGuard no cambió (mismos archivos, mismos tamaños y mtimes; se excluyen guard.log y heartbeat.txt, que escribe el guardián real en vivo)',
      JSON.stringify(guardianAntes.archivos) === JSON.stringify(despues.archivos) && guardianAntes.existe === despues.existe, JSON.stringify({ antes: guardianAntes.archivos, despues: despues.archivos }));
  }

  return { pass, fail, fallos };
}

if (require.main === module) {
  ejecutarBateria({}).then(({ pass, fail }) => {
    console.log('\n======================================================================');
    console.log(`  P26: ${pass} OK / ${fail} FALLOS`);
    console.log('======================================================================');
    if (fail) process.exitCode = 1;
  });
}

// P27 reutiliza estas piezas (extracción por firma, arnés Electron, guardián real).
module.exports = {
  ejecutarBateria, sandboxPara, correr, ELECTRON, SCRIPT,
  extraerDe, lineaConstDe, sinComentarios, snapshotGuardian, construirPredicado, mainPathDe, dormirSync,
};
