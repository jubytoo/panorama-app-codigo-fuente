// ---------------------------------------------------------------------------
// P24 — driver de la batería real-Electron (test-p24-rollback.js). Lanza cada
// modo en su propio proceso Electron, aislado, y hace las aserciones sobre el
// `resultado.json` que cada uno escribe. Nada se ejecuta contra perfiles
// reales: cada sandbox se marca `_a33-p24-<modo>` y vive bajo %TEMP%, nunca
// bajo la carpeta del proyecto ni bajo Drive.
//
// Exporta `ejecutarBateria(env)` para que `comprobar-reversiones-p24.js`
// pueda correr la MISMA batería contra una copia revertida de main.js
// (PANORAMA_MAIN) y ver qué nombres caen — igual que 8A/8B.
// ---------------------------------------------------------------------------
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const ELECTRON = path.join(PROJ, 'node_modules', 'electron', 'dist', 'electron.exe');
const SCRIPT = path.join(__dirname, 'test-p24-rollback.js');

function sandboxPara(modo) {
  const dir = path.join(os.tmpdir(), `_a33-p24-${modo}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function correr(modo, sandbox, opts) {
  const o = opts || {};
  const r = spawnSync(ELECTRON, [SCRIPT, `--sandbox=${sandbox}`, `--modo=${modo}`], {
    timeout: o.timeoutMs || 35000, windowsHide: true, encoding: 'utf8',
    env: Object.assign({}, process.env, o.env || {}),
  });
  const resultadoPath = path.join(sandbox, 'resultado.json');
  let resultado = null;
  try { resultado = JSON.parse(fs.readFileSync(resultadoPath, 'utf8')); } catch (e) { /* se deja null */ }
  return { resultado, r };
}

function limpiar(dir) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} }

// Extracción por firma (mismo patrón que 8A/P9/P22): comprobación ESTÁTICA de
// que `vaciarParticionDe` de verdad verifica `fs.existsSync` DESPUÉS de
// `fs.rmSync`, en vez de asumir éxito por la sola ausencia de excepción. No es
// sustituible por una prueba de comportamiento real: forzar que `fs.rmSync`
// no lance pero deje la carpeta a medias no se puede fabricar de forma fiable
// contra el sistema de archivos real.
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
function comprobarVerificacionEstatica(env, ok) {
  const mainPath = (env && env.PANORAMA_MAIN) || path.join(PROJ, 'main.js');
  const src = fs.readFileSync(mainPath, 'utf8');
  const cuerpo = extraerDe(src, 'async function vaciarParticionDe(j)');
  const tieneRmSync = /fs\.rmSync\(ruta,/.test(cuerpo);
  const tieneVerificacion = /if \(fs\.existsSync\(ruta\)\)/.test(cuerpo);
  ok('P24-13 vaciarParticionDe llama a fs.rmSync para rollback-creacion-proyecto', tieneRmSync);
  ok('P24-13 vaciarParticionDe verifica fs.existsSync TRAS el rmSync (no asume éxito por ausencia de excepción)', tieneVerificacion);
}

// P24-15 — CONTRATO de `sinRecursos:true`. Se ejecuta el `leerJournalBorrado`
// REAL (extraído por firma del main.js que se esté probando) contra journals
// escritos en disco: la marca solo puede abrir `recursos:[]` en los tipos cuyo
// contrato permite cero recursos, y NUNCA salta ninguna otra exigencia.
function lineaConstDe(src, nombre) {
  const m = src.match(new RegExp('^const ' + nombre + ' = [^\\n]*$', 'm'));
  if (!m) throw new Error('NO SE ENCONTRO const ' + nombre);
  return m[0];
}
function comprobarContratoSinRecursos(env, ok) {
  const mainPath = (env && env.PANORAMA_MAIN) || path.join(PROJ, 'main.js');
  const src = fs.readFileSync(mainPath, 'utf8');
  const raiz = path.join(os.tmpdir(), '_a33-p24-contrato');
  fs.rmSync(raiz, { recursive: true, force: true });
  fs.mkdirSync(raiz, { recursive: true });
  let leer;
  try {
    const fuente = [
      lineaConstDe(src, 'BORRADOS_DIR_NAME'), lineaConstDe(src, 'BORRADOS_JOURNAL_V'),
      lineaConstDe(src, 'BORRADOS_TIPOS'), lineaConstDe(src, 'BORRADOS_TIPOS_SIN_RECURSOS'),
      lineaConstDe(src, 'esHex'), lineaConstDe(src, 'esEnteroNoNegativo'),
      extraerDe(src, 'function borradosDir()'), extraerDe(src, 'function estaDentroDe(hijo, padre)'),
      extraerDe(src, 'function mismaRuta(a, b)'), extraerDe(src, 'function leerJournalBorrado(ruta)'),
    ].join('\n');
    const f = new Function('fs', 'path', 'app', fuente + '\nreturn { leerJournalBorrado, borradosDir };');
    const api = f(fs, path, { getPath: () => raiz });
    leer = api;
  } catch (e) {
    ok('P24-15 se pudo extraer el leerJournalBorrado real (con BORRADOS_TIPOS_SIN_RECURSOS)', false, String(e && e.message || e));
    return;
  }
  const hex = (c) => c.repeat(32);
  let n = 0;
  const clase = (j) => {
    const ruta = path.join(raiz, `j${++n}.json`);
    fs.writeFileSync(ruta, JSON.stringify(j), 'utf8');
    return leer.leerJournalBorrado(ruta).clase;
  };
  const base = (tipo, extra) => Object.assign({
    v: 1, action_id: hex('a'), writer: hex('b'), tipo, base_commit_id: hex('c'),
    fase: 'purgando', startedAt: '2026-09-19T00:00:00.000Z', recursos: [],
  }, extra || {});
  const dirRecurso = () => ({
    tipo: 'directorio', scope: 'subtree', origen: path.join(raiz, 'origen'),
    cuarentena: path.join(leer.borradosDir(), hex('a'), 'r0'), n_archivos: 1, bytes_totales: 1,
  });

  // --- los tres tipos cuyo contrato permite cero recursos --------------------
  ok('P24-15 rollback-creacion-proyecto + recursos:[] + sinRecursos:true ES válido', clase(base('rollback-creacion-proyecto', { sinRecursos: true, particion: 'persist:proj-1' })) === 'valido');
  ok('P24-15 purgar-backups + recursos:[] + sinRecursos:true ES válido', clase(base('purgar-backups', { sinRecursos: true })) === 'valido');
  ok('P24-15 borrar-prep + recursos:[] + sinRecursos:true ES válido', clase(base('borrar-prep', { sinRecursos: true })) === 'valido');
  // --- el que NO lo permite ---------------------------------------------------
  ok('P24-15 borrar-proyecto + recursos:[] + sinRecursos:true NO es válido (su contrato no permite cero recursos)', clase(base('borrar-proyecto', { sinRecursos: true })) !== 'valido');
  // --- la exigencia histórica sigue intacta -----------------------------------
  ok('P24-15 borrar-proyecto + recursos:[] SIN marca sigue siendo no válido (exigencia histórica)', clase(base('borrar-proyecto')) !== 'valido');
  for (const tipo of ['rollback-creacion-proyecto', 'purgar-backups', 'borrar-prep']) {
    ok(`P24-15 ${tipo} + recursos:[] SIN marca sigue siendo no válido (vacío sin declarar = truncado)`, clase(base(tipo)) !== 'valido');
  }
  ok('P24-15 la marca es estricta: sinRecursos:"true" (cadena) no vale', clase(base('rollback-creacion-proyecto', { sinRecursos: 'true' })) !== 'valido');
  ok('P24-15 la marca es estricta: sinRecursos:1 no vale', clase(base('rollback-creacion-proyecto', { sinRecursos: 1 })) !== 'valido');
  // --- un journal malformado no puede usar la marca para saltarse NADA más -----
  ok('P24-15 con la marca, un tipo desconocido sigue siendo no válido', clase(base('otro-tipo', { sinRecursos: true })) !== 'valido');
  ok('P24-15 con la marca, un action_id que no es hex sigue siendo no válido', clase(base('rollback-creacion-proyecto', { sinRecursos: true, action_id: 'no-es-hex' })) !== 'valido');
  ok('P24-15 con la marca, una fase inesperada sigue siendo no válida', clase(base('rollback-creacion-proyecto', { sinRecursos: true, fase: 'otra' })) !== 'valido');
  ok('P24-15 con la marca, una partición declarada pero vacía sigue siendo no válida', clase(base('rollback-creacion-proyecto', { sinRecursos: true, particion: '' })) !== 'valido');
  const sinArray = base('rollback-creacion-proyecto', { sinRecursos: true }); delete sinArray.recursos;
  ok('P24-15 con la marca, sin el campo recursos sigue siendo no válido', clase(sinArray) !== 'valido');
  ok('P24-15 con la marca, recursos que no es un array sigue siendo no válido', clase(base('rollback-creacion-proyecto', { sinRecursos: true, recursos: {} })) !== 'valido');
  // --- la marca no salta la validación de recursos NO vacíos ------------------
  ok('P24-15 con la marca y un recurso inválido, el recurso sigue validándose (no válido)', clase(base('purgar-backups', { sinRecursos: true, recursos: [{ tipo: 'archivo', scope: 'archivo', origen: path.join(raiz, 'x'), cuarentena: path.join(leer.borradosDir(), hex('a'), 'r0') }] })) !== 'valido');
  ok('P24-15 control: borrar-proyecto con un recurso válido y sin marca ES válido', clase(base('borrar-proyecto', { recursos: [dirRecurso()] })) === 'valido');
  limpiar(raiz);
}

function ejecutarBateria(env) {
  let pass = 0, fail = 0; const fallos = [];
  function ok(n, c, extra) {
    if (c) { pass++; console.log('  OK    ' + n); }
    else { fail++; fallos.push(n); console.log('  FALLO ' + n + (extra === undefined ? '' : '  -- ' + extra)); }
  }
  function seccion(t) { console.log('\n=== ' + t + ' ==='); }
  const opts = { env: env || {} };

  seccion('P24-13 (estático). vaciarParticionDe: rmSync + verificación explícita');
  comprobarVerificacionEstatica(env, ok);

  seccion('P24-15. CONTRATO de sinRecursos:true — solo tipos que permiten cero recursos, sin saltarse nada más');
  comprobarContratoSinRecursos(env, ok);

  seccion('P24-1. CREACIÓN NORMAL CON IMPORTACIÓN — coherente, sin rollback');
  {
    const SB = sandboxPara('normal-import');
    const { resultado } = correr('normal-import', SB, opts);
    ok('P24-1 el proceso terminó y escribió resultado', !!resultado, JSON.stringify(resultado));
    if (resultado) {
      ok('P24-1 la creación se aplicó', resultado.creacion && resultado.creacion.ok === true, JSON.stringify(resultado.creacion));
      ok('P24-1 el proyecto aparece en la lista', resultado.lista && resultado.lista.includes('P24 normal con import'));
      ok('P24-1 su partición existe en disco', resultado.carpetas && resultado.carpetas.some((c) => /^proj-/.test(c)));
      ok('P24-1 NINGÚN journal de rollback (no hubo fallo)', resultado.journalsRollback === 0);
    }
    limpiar(SB);
  }

  seccion('P24-2. CREACIÓN NORMAL SIN IMPORTACIÓN — P24 no interviene');
  {
    const SB = sandboxPara('normal-sin-import');
    const { resultado } = correr('normal-sin-import', SB, opts);
    ok('P24-2 el proceso terminó y escribió resultado', !!resultado, JSON.stringify(resultado));
    if (resultado) {
      ok('P24-2 la creación se aplicó (nunca llama a seedNewProjectStorage)', resultado.creacion && resultado.creacion.ok === true, JSON.stringify(resultado.creacion));
      ok('P24-2 sin ningún journal de rollback', resultado.journalsRollback === 0);
    }
    limpiar(SB);
  }

  seccion('P24-3/4/13/14. SEED FALLA — journal + DELETE + purga, ruta por sessionData, cero silencio');
  let sbSeedFalla;
  let prepSeedFalla = null; // resultado de la preparación, para las precondiciones de P24-16
  {
    sbSeedFalla = sandboxPara('seed-falla');
    const { resultado } = correr('seed-falla', sbSeedFalla, opts);
    prepSeedFalla = resultado;
    ok('P24-3 el proceso terminó y escribió resultado', !!resultado, JSON.stringify(resultado));
    if (resultado) {
      ok('P24-3 projects:create rechaza con el error ORIGINAL de seed', !resultado.creacion.ok && /No se pudieron guardar los datos importados/.test(resultado.creacion.error || ''), JSON.stringify(resultado.creacion));
      ok('P24-3 la fila NO aparece en la lista (el DELETE del rollback sí se aplicó)', !resultado.listaTrasElFallo.includes('P24 seed falla'));
      ok('P24-4/13 la partición SIGUE en disco tras el fallo (EBUSY normal en la misma sesión)', !!resultado.huerfanaEnDisco, JSON.stringify(resultado));
      ok('P24-3 hay EXACTAMENTE un journal rollback-creacion-proyecto, con la partición correcta',
        resultado.journalsRollback && resultado.journalsRollback.length === 1 && resultado.journalsRollback[0].particion === 'persist:' + resultado.huerfanaEnDisco,
        JSON.stringify(resultado.journalsRollback));
      ok('P24-14 el journal declara sinRecursos (recursos:[] legítimo, no corrupto)', resultado.journalsRollback && resultado.journalsRollback[0] && resultado.journalsRollback[0].sinRecursos === true);
    }
  }

  seccion('P24-7. F-1 OCUPADO — la fila NO se borra, sin journal de rollback nuevo');
  {
    const SB = sandboxPara('f1-ocupado');
    const { resultado } = correr('f1-ocupado', SB, opts);
    ok('P24-7 el proceso terminó y escribió resultado', !!resultado, JSON.stringify(resultado));
    if (resultado) {
      ok('P24-7 projects:create rechaza con el error ORIGINAL de seed', !resultado.creacion.ok && /No se pudieron guardar los datos importados/.test(resultado.creacion.error || ''));
      ok('P24-7 la fila SIGUE en la lista (F-1 ocupado impidió el rollback)', resultado.filaConservada === true, JSON.stringify(resultado));
      ok('P24-7 NO se creó ningún journal rollback-creacion-proyecto nuevo', resultado.journalsRollback === 0);
    }
    limpiar(SB);
  }

  seccion('P24-8. JOURNAL NO ESCRIBIBLE — la fila NO se borra');
  {
    const SB = sandboxPara('journal-no-escribible');
    const { resultado } = correr('journal-no-escribible', SB, opts);
    ok('P24-8 el proceso terminó y escribió resultado', !!resultado, JSON.stringify(resultado));
    if (resultado) {
      ok('P24-8 projects:create rechaza con el error ORIGINAL de seed', !resultado.creacion.ok);
      ok('P24-8 la fila SIGUE en la lista (journal no escribible impidió el rollback)', resultado.filaConservada === true, JSON.stringify(resultado));
    }
    limpiar(SB);
  }

  seccion('P24-9. OTRO PROYECTO NO SE TOCA');
  {
    const SB = sandboxPara('otro-proyecto-intacto');
    const { resultado } = correr('otro-proyecto-intacto', SB, opts);
    ok('P24-9 el proceso terminó y escribió resultado', !!resultado, JSON.stringify(resultado));
    if (resultado) {
      ok('P24-9 el proyecto bueno se creó con éxito', resultado.bueno && resultado.bueno.ok === true);
      ok('P24-9 el proyecto malo fue rechazado', resultado.malo && resultado.malo.ok === false);
      ok('P24-9 el proyecto bueno SIGUE en la lista, intacto', resultado.buenoSigueEnLista === true);
      ok('P24-9 el proyecto malo NO está en la lista', resultado.maloNoEstaEnLista === true);
      ok('P24-9 exactamente un proyecto en la lista final', resultado.totalEnLista === 1, JSON.stringify(resultado));
    }
    limpiar(SB);
  }

  seccion('P24-12. SIGUIENTE ARRANQUE — resuelve el journal pendiente de P24-3');
  {
    const { resultado } = correr('reintento', sbSeedFalla, opts);
    ok('P24-12 el proceso terminó y escribió resultado', !!resultado, JSON.stringify(resultado));
    if (resultado) {
      ok('P24-12 la carpeta de la partición huérfana ya NO existe', !resultado.carpetasFinal.some((c) => /^proj-/.test(c)), JSON.stringify(resultado.carpetasFinal));
      ok('P24-12 el journal quedó resuelto (ya no hay ninguno pendiente)', resultado.journalsFinal.filter((j) => j.tipo === 'rollback-creacion-proyecto').length === 0, JSON.stringify(resultado.journalsFinal));
    }

    // -----------------------------------------------------------------------
    seccion('P24-16. ARRANQUE REAL — la partición no se toca antes de resolverse, y el journal cae el último');
    // Preparación (proceso anterior YA CERRADO): journal P24 pendiente, fila ya
    // borrada, carpeta física existente. Después, un proceso NUEVO que sigue el
    // startup real de main.js, con observadores pasivos (sin ventanas ni
    // handlers propios): ver test-p24-rollback.js, modo `reintento`.
    // -----------------------------------------------------------------------
    const jPrep = prepSeedFalla && prepSeedFalla.journalsRollback && prepSeedFalla.journalsRollback[0];
    const part = jPrep && jPrep.particion;
    const nombre = part ? String(part).replace(/^persist:/, '') : null;
    ok('P24-16 precondición: el proceso anterior dejó fila borrada, un journal P24 pendiente y la carpeta en disco',
      !!(nombre && prepSeedFalla.listaTrasElFallo && !prepSeedFalla.listaTrasElFallo.includes('P24 seed falla') && prepSeedFalla.huerfanaEnDisco === nombre), JSON.stringify(prepSeedFalla));
    if (resultado && nombre) {
      const L = resultado.linea || [];
      const enPart = (s) => typeof s === 'string' && s.toLowerCase().includes(nombre.toLowerCase());
      const antes = resultado.antes || { carpetas: [], journals: [] };
      ok('P24-16 precondición vista por el propio arranque: la carpeta existe y hay UN journal rollback-creacion-proyecto que la cita',
        antes.carpetas.includes(nombre) && antes.journals.length === 1 && antes.journals[0].tipo === 'rollback-creacion-proyecto' && antes.journals[0].particion === part, JSON.stringify(antes));
      const rm = L.find((e) => e.tipo === 'fs' && e.op === 'rmSync' && /[\\/]Partitions[\\/]/.test(e.ruta) && enPart(e.ruta));
      const unl = L.find((e) => e.tipo === 'fs' && e.op === 'unlinkSync' && /\.panorama-borrados[\\/][0-9a-f]{32}\.json$/i.test(e.ruta));
      const reescr = L.find((e) => e.tipo === 'fs' && e.op === 'renameSync' && /\.panorama-borrados[\\/][0-9a-f]{32}\.json$/i.test(e.destino || ''));
      const sesiones = L.filter((e) => e.tipo === 'session-created');
      ok('P24-16 (1) el arranque real DETECTA y trata el journal (lo relee/reescribe en fase de purga)', !!reescr, JSON.stringify(L));
      ok('P24-16 el observador funciona: vio al menos la sesión por defecto y la splash', sesiones.length >= 1 && L.some((e) => e.tipo === 'window-created'), JSON.stringify(L));
      ok('P24-16 (2) la partición NO fue abierta/materializada por Chromium en este proceso (ninguna sesión creada apunta a su carpeta)',
        !sesiones.some((s) => enPart(s.storage)), JSON.stringify(sesiones));
      ok('P24-16 (3) fs.rmSync sobre la carpeta de la partición se completa sin error', !!rm && rm.ok === true, JSON.stringify(rm || L));
      const existe = fs.existsSync(path.join(sbSeedFalla, 'userdata', 'Partitions', nombre));
      ok('P24-16 (4) fs.existsSync(carpeta de la partición) === false', existe === false && !(resultado.carpetasFinal || []).includes(nombre), JSON.stringify(resultado.carpetasFinal));
      ok('P24-16 (5) el journal se elimina SOLO DESPUÉS del rmSync de la carpeta (unlink posterior)', !!(rm && unl && unl.ok && unl.n > rm.n), JSON.stringify({ rm, unl }));
      ok('P24-16 (6a) no queda journal pendiente ni carpeta (sin particionPendiente)', (resultado.journalsFinal || []).length === 0 && existe === false, JSON.stringify(resultado.journalsFinal));
      ok('P24-16 (6b) el arranque continúa: no se cierra por «borrado sin resolver» (sin PS-2006, sin cierre)',
        resultado.porQuit === false && !(resultado.dialogos || []).some((t) => /borrado anterior/i.test(t)), JSON.stringify({ porQuit: resultado.porQuit, dialogos: resultado.dialogos }));
      ok('P24-16 (6c) el app.log de ESTE arranque no registra ningún fallo de purga',
        !(resultado.appLogRelevante || []).some((l) => /no se pudo eliminar la carpeta|sigue existiendo tras intentar|PS-2006|limpieza pendiente/i.test(l)), JSON.stringify(resultado.appLogRelevante));
      // Orden real: antes de la recuperación solo existe la splash (sesión por defecto);
      // el lanzador y todo lo demás nacen DESPUÉS de resolverse la partición.
      const ventanasAntes = rm ? L.filter((e) => e.tipo === 'window-created' && e.n < rm.n).length : -1;
      const ventanasDespues = rm ? L.filter((e) => e.tipo === 'window-created' && e.n > rm.n).length : -1;
      ok('P24-16 orden real: antes de resolver la partición solo existe una ventana (la splash) y las demás nacen después',
        ventanasAntes === 1 && ventanasDespues >= 1, JSON.stringify({ ventanasAntes, ventanasDespues }));
    }
    limpiar(sbSeedFalla);
  }

  return { pass, fail, fallos };
}

if (require.main === module) {
  const { pass, fail } = ejecutarBateria({});
  console.log('\n======================================================================');
  console.log(`  P24: ${pass} OK / ${fail} FALLOS`);
  console.log('======================================================================');
  if (fail) process.exitCode = 1;
}

module.exports = { ejecutarBateria, comprobarContratoSinRecursos, sandboxPara, correr, ELECTRON, SCRIPT };
