'use strict';
// ---------------------------------------------------------------------------
// BLOQUE 4 / PASO 4 — INTEGRACION de los CINCO consumidores reales + IPC.
// Se ejecutan los CUERPOS REALES de los handlers de main.js, no un doble.
// NUNCA G: ni datos reales.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const Module = require('module');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const MARCA_PRUEBAS = '_a33-bloque4-CONSUMIDORES';
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
const leer = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch (e) { return '<NO EXISTE>'; } };
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
function extraerHandler(canal, nombre) {
  const marca = `ipcMain.handle('${canal}'`;
  const i = SRC.indexOf(marca);
  if (i < 0) throw new Error('NO SE ENCONTRO handler ' + canal);
  const flecha = SRC.indexOf('=> {', i);
  const cabecera = SRC.slice(i, flecha);
  // Bloque 5: `backup:save` pasó a ser `async` (la purga D3 es una operación
  // completa con su commit). Si el arnés lo copiara como función normal, el
  // `await` de dentro sería un SyntaxError — y perderíamos la prueba, no el
  // fallo.
  const esAsync = /,\s*async\s*\(/.test(cabecera);
  const firma = SRC.slice(SRC.indexOf('(', SRC.indexOf(',', i)), flecha).trim().replace(/^async\s*/, '');
  let j = SRC.indexOf('{', flecha), prof = 0, fin = -1;
  for (let k = j; k < SRC.length; k++) {
    if (SRC[k] === '{') prof++;
    else if (SRC[k] === '}') { prof--; if (prof === 0) { fin = k; break; } }
  }
  return `${esAsync ? 'async ' : ''}function ${nombre}${firma} ${SRC.slice(j, fin + 1)}`;
}
function lineaConst(n) { const i = SRC.indexOf(n); if (i < 0) throw new Error('falta ' + n); return SRC.slice(i, SRC.indexOf('\n', i) + 1); }

const B5 = require(path.join(__dirname, '..', 'comun', 'bloque5-extraccion.js'));
const BLOQUES = [
  'function accionNoAplicada(error, reintentable)',
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
  'function migrateLegacyInlineBackupsToFiles()',
  // Cadena REAL del rekey, para poder comprobar la PRECEDENCIA con las dos
  // recuperaciones de verdad, no con un doble.
  'function rekeyStagingDir()',
  'function rekeyJournalPath()',
  'function rekeyItemPath(i, suffix)',
  'function removeRekeyStaging()',
  'function guardarJournalRekey(journal)',
  'function leerJournalRekey()',
  'function hayAlgunOldEnStaging()',
  'function collectRekeyInventory()',
  'function metaUpsert(key, value)',
  'function metaDelete(key)',
  'function sentenciasDeSeguridad(mode, items, newFlag, newSalt, newVerifier, remembered)',
  'function estadoFinalDelJournalYaAplicado(j)',
  'function estadoItemPorHash(it)',
  'function recoverInterruptedRekeyIfAny()',
];
// A3.3/BLOQUE 5: ejecutarAccionDeArchivo() y destinoOcupadoPorOtroEquipo()
// dependen ahora del dominio de ocupacion comun y de la puerta F-1, asi que
// el ambito real necesita tambien estas funciones de main.js.
BLOQUES.push.apply(BLOQUES, B5.BLOQUES_B5);

const HANDLERS = [
  ['backup:save', 'guardarBackup'],
  ['meeting:savePrep', 'guardarPrep'],
  ['meeting:updatePrep', 'actualizarPrep'],
  ['candidateEval:save', 'guardarEval'],
];
const CONSTS = B5.sinRepetir([
  lineaConst('const FSYNC_NO_SOPORTADO_REG'),
  lineaConst("const ACCIONES_DIR_NAME = '.panorama-acciones';"),
  lineaConst('const ACCIONES_JOURNAL_V ='),
  lineaConst('const ACCIONES_MARCA_MAX ='),
  lineaConst('const ACCIONES_TIPOS ='),
  lineaConst('const esHex ='),
  lineaConst('const esEnteroNoNegativo ='),
  lineaConst('const BACKUP_KEEP ='),
  lineaConst("const REKEY_DIR_NAME = '.panorama-rekey';"),
  lineaConst('const REKEY_JOURNAL_V ='),
].concat(B5.CONSTS_B5.map(lineaConst))).join('');

function construirMain(est) {
  const e = est || {};
  const cuerpo = CONSTS + '\n' +
    'let securityKey = null;\n' +
    'let seguridadRequiereRevalidacion = false;\n' +
    'let seguridadEnEstadoInconsistente = null;\n' +
    'let procesoComprometido = false;\n' +
    'let rekeyInProgress = false;\n' +
    'let driveOutageActive = false;\n' +
    'let launcherWin = null;\n' +
    // (restoreInProgress lo aporta ahora PREAMBULO_B5: A2 lo convirtio en alias de proyectosEnRestauracion)
    "const REKEY_BUSY_MESSAGE = 'LA SEGURIDAD SE ESTA ACTUALIZANDO';\n" +
    B5.PREAMBULO_B5 +
    BLOQUES.map(extraer).join('\n\n') + '\n' +
    HANDLERS.map(([c, n]) => extraerHandler(c, n)).join('\n\n') + '\n' +
    'return { guardarBackup, guardarPrep, actualizarPrep, guardarEval,\n' +
    '         migrateLegacyInlineBackupsToFiles, ejecutarAccionDeArchivo,\n' +
    '         recuperarAccionesPendientes, recoverInterruptedRekeyIfAny,\n' +
    '         journalsDeAcciones, journalAccionPath,\n' +
    '         accionesDir, escribirJsonDurable, nuevoActionId, accionYaAplicada,\n' +
    '         sentenciaMarcaAccion, leerMarcaAcciones,\n' +
    '         setKey: (k) => { securityKey = k; }, getKey: () => securityKey,\n' +
    '         setDrive: (v) => { driveOutageActive = v; },\n' +
    '         setRekey: (v) => { rekeyInProgress = v; },\n' +
    '         setComprometido: (v) => { procesoComprometido = v; },\n' +
    '         setRevalidacion: (v) => { seguridadRequiereRevalidacion = v; },\n' +
    '         inconsistente: () => seguridadEnEstadoInconsistente };';
  const f = new Function('app', 'fs', 'path', 'crypto', 'dbmod', 'securitymod', 'appLog', 'getMeta',
    'backupsDirForProject', 'meetingPrepsDirForProject', 'candidateEvalFileForProject',
    'localSafetyBackupsDirForProject', 'purgeOldLocalSafetyBackups', 'regenerateProjectDashboardFile',
    'session',
    cuerpo);
  const mk = (p) => { fs.mkdirSync(p, { recursive: true }); return p; };
  return f(appDoble, fs, path, crypto, dbmod, securitymod,
    (s) => { (e.log = e.log || []).push(s); },
    (k) => { const r = dbmod.get('SELECT value FROM app_meta WHERE key=?', [k]); return r ? r.value : null; },
    (row) => mk(path.join(DIR_DATOS, 'backups', String(row.id))),
    (row) => mk(path.join(DIR_DATOS, 'preps', String(row.id))),
    (row) => path.join(mk(path.join(DIR_DATOS, 'evals', String(row.id))), 'estado.json'),
    (row) => mk(path.join(DIR_DATOS, 'rescate', String(row.id))),
    () => {},
    () => { (e.horneados = e.horneados || []).push(1); },
    // `session`: la purga D3 puede vaciar particiones; aqui nunca hay una
    // declarada, pero el ambito la necesita.
    { fromPartition: () => ({ clearStorageData: () => Promise.resolve() }) });
}

// --- doble del borde IPC: la misma normalizacion que preload.js -----------
// El borde REAL: se extraen las tres funciones de preload.js y se ejecutan.
// No es una reproduccion: es el mismo codigo.
const BORDE = (() => {
  const src = fs.readFileSync(path.join(PROJ, 'preload.js'), 'utf8');
  const saca = (firma) => {
    const i = src.indexOf(firma);
    if (i < 0) throw new Error('no se encontro ' + firma + ' en preload.js');
    let j = src.indexOf('{', i), prof = 0;
    for (let k = j; k < src.length; k++) {
      if (src[k] === '{') prof++;
      else if (src[k] === '}') { prof--; if (prof === 0) return src.slice(i, k + 1); }
    }
    throw new Error('no delimitado: ' + firma);
  };
  const cuerpo = [
    saca('function normalizarContratoAccion(r)'),
    saca('function errorComoNoAplicado(e)'),
    saca('function invokeAccion(canal, payload)'),
  ].join('\n') + '\nreturn { invokeAccion, normalizarContratoAccion, errorComoNoAplicado };';
  return { texto: cuerpo, api: new Function('ipcRenderer', cuerpo) };
})();
// `invokeAccion` real, con un ipcRenderer de prueba que devuelve lo que se le diga.
function bordeIPC(promesa) {
  const api = BORDE.api({ invoke: () => promesa });
  return api.invokeAccion('canal', {});
}

let SQL = null;
async function montar(dir, writer) {
  segura(dir);
  dbmod._resetParaPruebas();
  DIR_DATOS = dir;
  if (writer) dbmod.setInstallationId(writer);
  await dbmod.getDb({ crearSiAusente: true });
  const pid = dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at,backup_dir) VALUES ('P','c','persist:p','x','x','p1')");
  return { pid };
}
function publicarComoOtroEquipo(dir, o) {
  const p = path.join(dir, 'panorama.sqlite3');
  const d = new SQL.Database(fs.readFileSync(p));
  const set = (k, v) => d.run('INSERT INTO app_meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [k, String(v)]);
  set('db_commit_id', o.commit); set('db_parent_commit_id', o.parent);
  set('db_commit_history', JSON.stringify(o.historial || [o.commit])); set('db_generation', String(o.gen || 99));
  const b = Buffer.from(d.export()); d.close();
  fs.writeFileSync(p, b);
  fs.writeFileSync(p + '.gen', JSON.stringify({ v: 2, gen: o.gen || 99, commit_id: o.commit, parent_commit_id: o.parent, writer: 'b'.repeat(32), at: new Date().toISOString() }), 'utf8');
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
const VOLCADO = (marca) => JSON.stringify({
  'panorama_servicio_ib__panorama-servicio-full__proj-1': JSON.stringify({ projectTitle: 'Servicio X', marca, hitos: 3 }),
});
const PREP = JSON.stringify({ tipo: 'prep', marca: 'PREPARACION' });
const EVAL_ = JSON.stringify({ tipo: 'eval', marca: 'EVALUACION' });

(async () => {
  SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(PROJ, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')) });
  console.log('RUTAS DE PRUEBA');
  console.log('  raiz:                ' + RAIZ);
  console.log('  ubicacion real det.: ' + (REAL || '(no configurada)'));
  ok('los 5 consumidores REALES se extraen de main.js sin reescribirse',
    HANDLERS.every(([c]) => { try { return extraerHandler(c, 'x').length > 50; } catch (e) { return false; } })
    && extraer('function migrateLegacyInlineBackupsToFiles()').length > 50);
  ok('el borde REAL de preload.js se extrae y ejecuta',
    /typeof r\.aplicado === 'boolean'/.test(BORDE.texto) && /invokeAccion/.test(BORDE.texto));

  // =========================================================================
  seccion('I1. CAMINO FELIZ DE LOS CUATRO');
  // =========================================================================
  {
    const dir = carpeta('I1'); const { pid } = await montar(dir);
    const m = construirMain({});

    const rb = await m.guardarBackup(null, { projectId: pid, payload: VOLCADO('V1'), reason: 'manual' });
    ok('I1) backup:save devuelve el contrato completo',
      rb.ok === true && rb.aplicado === true && rb.verificado === true, JSON.stringify(rb));
    const fila = dbmod.get('SELECT file_path FROM backups WHERE project_id=?', [pid]);
    ok('   la fila existe y su archivo tambien', !!fila && fs.existsSync(path.join(dir, 'backups', String(pid), fila.file_path)));
    ok('   el contenido es el volcado', leer(path.join(dir, 'backups', String(pid), fila.file_path)) === VOLCADO('V1'));
    ok('   el nombre del archivo lleva nonce (destino unico)', /^backup_.+_[0-9a-f]{8}\.json$/.test(fila.file_path), fila.file_path);

    const rp = m.guardarPrep(null, { projectId: pid, meetingDate: '2026-03-03', finalidad: 'f', payload: PREP });
    ok('I1) meeting:savePrep', rp.ok === true && rp.aplicado === true && rp.verificado === true && typeof rp.id === 'number',
      JSON.stringify(rp));
    const fp = dbmod.get('SELECT id, file_path FROM meeting_preps WHERE project_id=?', [pid]);
    ok('   devuelve el id correcto de la fila', rp.id === fp.id, rp.id + ' vs ' + fp.id);
    ok('   y el archivo tiene el contenido', leer(path.join(dir, 'preps', String(pid), fp.file_path)) === PREP);

    const ru = m.actualizarPrep(null, { projectId: pid, id: fp.id, meetingDate: '2026-04-04', finalidad: 'g', payload: PREP + ' V2' });
    ok('I1) meeting:updatePrep', ru.ok === true && ru.aplicado === true && ru.id === fp.id, JSON.stringify(ru));
    ok('   sobrescribe el MISMO archivo', leer(path.join(dir, 'preps', String(pid), fp.file_path)) === PREP + ' V2');
    ok('   y la fila refleja la fecha nueva',
      dbmod.get('SELECT meeting_date FROM meeting_preps WHERE id=?', [fp.id]).meeting_date === '2026-04-04');

    const re = m.guardarEval(null, { projectId: pid, payload: EVAL_ });
    ok('I1) candidateEval:save', re.ok === true && re.aplicado === true && typeof re.updatedAt === 'string', JSON.stringify(re));
    ok('   con su archivo', leer(path.join(dir, 'evals', String(pid), 'estado.json')) === EVAL_);
    ok('   y su fila', dbmod.all('SELECT * FROM candidate_evals').length === 1);

    ok('I1) no queda ningun journal', m.journalsDeAcciones().entradas.length === 0);
    ok('   ni ningun .tmp/.old suelto', (() => {
      const f = foto(dir); return !Object.keys(f).some((k) => /\.(tmp|old)-/.test(k));
    })(), Object.keys(foto(dir)).filter((k) => /\.(tmp|old)-/.test(k)).join(','));
  }

  // =========================================================================
  seccion('I2. backup:save — UN SOLO COMMIT, PURGA APARTE');
  // =========================================================================
  {
    const dir = carpeta('I2'); const { pid } = await montar(dir);
    const m = construirMain({});
    const commits = [];
    dbmod.alCambiarImagenEnMemoria((ev) => commits.push(ev.motivo));
    const r = await m.guardarBackup(null, { projectId: pid, payload: VOLCADO('V1'), reason: 'manual' });
    dbmod.alCambiarImagenEnMemoria(null);
    ok('I2) el guardado principal es UN SOLO commit A3.3',
      commits.filter((c) => c === 'commit-propio').length === 1, JSON.stringify(commits));
    ok('   con el INSERT del backup', dbmod.all('SELECT * FROM backups').length === 1);
    ok('   el UPDATE de projects.updated_at', dbmod.get('SELECT updated_at FROM projects WHERE id=?', [pid]).updated_at !== 'x');
    ok('   el UPDATE de projects.name (el volcado traia titulo)',
      dbmod.get('SELECT name FROM projects WHERE id=?', [pid]).name === 'Servicio X');
    ok('   y la marca de la accion', m.accionYaAplicada(r.actionId));
    // Y todo eso, en la MISMA imagen del disco
    ok('   las cuatro cosas estan en el MISMO archivo de disco', (() => {
      const d = new SQL.Database(fs.readFileSync(path.join(dir, 'panorama.sqlite3')));
      const n = d.exec('SELECT COUNT(*) FROM backups')[0].values[0][0];
      const nom = d.exec('SELECT name FROM projects')[0].values[0][0];
      const mk = d.exec("SELECT value FROM app_meta WHERE key LIKE 'acciones_%'");
      d.close();
      return n === 1 && nom === 'Servicio X' && mk.length === 1 && String(mk[0].values[0][0]).includes(r.actionId);
    })());

    // --- la purga va APARTE y su fallo no cambia el resultado -------------
    const dirB = path.join(dir, 'backups', String(pid));
    for (let i = 0; i < 18; i++) await m.guardarBackup(null, { projectId: pid, payload: VOLCADO('V' + i), reason: 'auto' });
    ok('I2) la purga mantiene el limite de BACKUP_KEEP',
      dbmod.all('SELECT * FROM backups').length === 15, String(dbmod.all('SELECT * FROM backups').length));

    const est = {};
    const m2 = construirMain(est);
    const oU = fs.unlinkSync;
    // Bloque 5 (D3): la purga ya NO usa `dbmod.run` — hace UN solo
    // `escribirMultiple` con todos sus DELETE. Romper `run` dejó de inyectar
    // nada, y esta prueba pasaba sin ejercitar el fallo. Se inyecta donde la
    // purga escribe de verdad, y SOLO cuando la sentencia es suya: el commit
    // del propio backup tiene que seguir funcionando.
    const dbRunOrig = dbmod.run;
    const dbEmOrig = dbmod.escribirMultiple;
    dbmod.escribirMultiple = function (sentencias) {
      const esPurga = Array.isArray(sentencias) &&
        sentencias.some((s) => /^DELETE FROM backups WHERE id=\?/.test(String(s && s.sql)));
      if (esPurga) { const e = new Error('EIO simulado en la purga'); e.kind = 'io'; throw e; }
      return dbEmOrig.apply(dbmod, arguments);
    };
    dbmod.run = function (sql) {
      if (/^DELETE FROM backups/.test(String(sql))) throw new Error('EIO simulado en la purga');
      return dbRunOrig.apply(dbmod, arguments);
    };
    const rp = await m2.guardarBackup(null, { projectId: pid, payload: VOLCADO('CON-PURGA-ROTA'), reason: 'manual' });
    dbmod.run = dbRunOrig;
    dbmod.escribirMultiple = dbEmOrig;
    void oU;
    ok('I2) un fallo de la PURGA no convierte el backup en fallido',
      rp.ok === true && rp.aplicado === true && rp.verificado === true, JSON.stringify(rp));
    ok('   el backup nuevo SI esta guardado',
      !!dbmod.get("SELECT 1 AS x FROM backups WHERE file_path=? ", [path.basename(Object.keys(foto(dirB)).filter((f) => /^backup_/.test(f)).sort().pop() || '')])
      || dbmod.all('SELECT * FROM backups').length >= 15);
    const logs = (est.log || []).join('\n');
    // Bloque 5 (D3): la purga pasó a ser una operación completa con su propio
    // contrato, y su línea de registro cambió de "mantenimiento de backups
    // falló" a "Purga de backups NO aplicada". Lo comprobado es lo mismo: que
    // app.log distingue el backup (OK) del mantenimiento (falló).
    ok('   app.log distingue "backup guardado OK" de "purga fallida"',
      /Backup guardado OK/.test(logs) &&
      (/Purga de backups NO aplicada/i.test(logs) || /mantenimiento de backups fall/i.test(logs)),
      logs.slice(-300));
  }

  // =========================================================================
  seccion('I3. base X -> Y ANTES DEL COMMIT');
  // =========================================================================
  {
    const dir = carpeta('I3'); const { pid } = await montar(dir);
    dbmod.setPoliticaUbicacion('compartida');
    const m = construirMain({});
    m.guardarEval(null, { projectId: pid, payload: EVAL_ });          // version previa
    const destino = path.join(dir, 'evals', String(pid), 'estado.json');
    const X = dbmod.getCommitActual();
    let hecho = false;
    const oR = fs.renameSync;
    fs.renameSync = function () {
      const r = oR.apply(fs, arguments);
      if (!hecho && String(arguments[1] || '') === destino) {
        hecho = true;
        publicarComoOtroEquipo(dir, { commit: 'y'.repeat(32), parent: X, historial: ['y'.repeat(32), X], gen: 50 });
      }
      return r;
    };
    const r = m.guardarEval(null, { projectId: pid, payload: EVAL_ + ' V2' });
    fs.renameSync = oR;
    ok('I3) otro equipo avanzo la BD antes de confirmar', hecho);
    ok('   NO aplicado y reintentable', r.ok === false && r.aplicado === false && r.reintentable === true, JSON.stringify(r));
    ok('   el archivo vuelve a la version anterior', leer(destino) === EVAL_);
    ok('   no queda journal', m.journalsDeAcciones().entradas.length === 0);
    ok('   no hay .old ni .tmp', !Object.keys(foto(dir)).some((k) => /\.(tmp|old)-/.test(k)));
  }

  // =========================================================================
  seccion('I4. FALLO PRE-CONFIRMACION y APLICADO SIN VERIFICAR');
  // =========================================================================
  {
    const dir = carpeta('I4'); const { pid } = await montar(dir);
    const m = construirMain({});
    const dbPath = path.join(dir, 'panorama.sqlite3');
    const oR = fs.renameSync;
    fs.renameSync = function () {
      if (String(arguments[1] || '') === dbPath) { const e = new Error('EIO simulado'); e.code = 'EIO'; throw e; }
      return oR.apply(fs, arguments);
    };
    const r = await m.guardarBackup(null, { projectId: pid, payload: VOLCADO('V1'), reason: 'manual' });
    fs.renameSync = oR;
    ok('I4-PRE) NO aplicado', r.ok === false && r.aplicado === false, JSON.stringify(r).slice(0, 160));
    ok('   cero filas', dbmod.all('SELECT * FROM backups').length === 0);
    ok('   cero archivos de backup',
      !Object.keys(foto(path.join(dir, 'backups'))).some((f) => /backup_.*\.json$/.test(f)),
      Object.keys(foto(path.join(dir, 'backups'))).join(','));
    ok('   cero journal', m.journalsDeAcciones().entradas.length === 0);
  }
  {
    const dir = carpeta('I4b'); const { pid } = await montar(dir);
    const m = construirMain({});
    const dbPath = path.join(dir, 'panorama.sqlite3');
    const oR = fs.renameSync, oS = fs.statSync, oRd = fs.readFileSync;
    let roto = false;
    fs.renameSync = function () { const r = oR.apply(fs, arguments); if (String(arguments[1] || '') === dbPath) roto = true; return r; };
    fs.statSync = function (p) { if (roto && String(p) === dbPath) { const e = new Error('EIO'); e.code = 'EIO'; throw e; } return oS.apply(fs, arguments); };
    fs.readFileSync = function (p) { if (roto && String(p) === dbPath) { const e = new Error('EIO'); e.code = 'EIO'; throw e; } return oRd.apply(fs, arguments); };
    const r = await m.guardarBackup(null, { projectId: pid, payload: VOLCADO('V1'), reason: 'manual' });
    fs.renameSync = oR; fs.statSync = oS; fs.readFileSync = oRd;
    ok('I4-POST) forma 3: aplicado sin verificar',
      r.ok === true && r.aplicado === true && r.verificado === false && r.requiereReinicio === true, JSON.stringify(r).slice(0, 200));
    ok('   con aviso para el usuario', typeof r.aviso === 'string' && r.aviso.length > 40);
    ok('   el archivo SI esta publicado',
      Object.keys(foto(path.join(dir, 'backups'))).some((f) => /backup_.*\.json$/.test(f)),
      Object.keys(foto(path.join(dir, 'backups'))).join(','));
    ok('   y la fila esta en el archivo de disco', (() => {
      const d = new SQL.Database(fs.readFileSync(dbPath));
      const n = d.exec('SELECT COUNT(*) FROM backups')[0].values[0][0]; d.close(); return n === 1;
    })());
  }

  // =========================================================================
  seccion('I5. PRIMER candidateEval Y OVERWRITE POSTERIOR');
  // =========================================================================
  {
    const dir = carpeta('I5'); const { pid } = await montar(dir);
    const m = construirMain({});
    const destino = path.join(dir, 'evals', String(pid), 'estado.json');
    ok('I5) [estado] el estado.json no existe todavia', !fs.existsSync(destino));
    const r1 = m.guardarEval(null, { projectId: pid, payload: EVAL_ });
    ok('   el PRIMER guardado funciona (el helper deriva modo nuevo)',
      r1.ok === true && r1.aplicado === true, JSON.stringify(r1).slice(0, 140));
    ok('   con su archivo y su fila', leer(destino) === EVAL_ && dbmod.all('SELECT * FROM candidate_evals').length === 1);
    const r2 = m.guardarEval(null, { projectId: pid, payload: EVAL_ + ' V2' });
    ok('   el SEGUNDO ya es un reemplazo', r2.ok === true && leer(destino) === EVAL_ + ' V2');
    ok('   sin dejar residuos', !Object.keys(foto(dir)).some((k) => /\.(tmp|old)-/.test(k)),
      Object.keys(foto(dir)).filter((k) => /\.(tmp|old)-/.test(k)).join(','));
    ok('   y una sola fila', dbmod.all('SELECT * FROM candidate_evals').length === 1);
  }

  // =========================================================================
  seccion('I6. DESTINO OCUPADO POR OTRO WRITER / JOURNAL PROPIO PENDIENTE');
  // =========================================================================
  {
    const dir = carpeta('I6'); const { pid } = await montar(dir, 'a'.repeat(32));
    const m = construirMain({});
    m.guardarEval(null, { projectId: pid, payload: EVAL_ });
    const destino = path.join(dir, 'evals', String(pid), 'estado.json');
    // journal AJENO sobre ese mismo destino
    const aid = m.nuevoActionId();
    fs.mkdirSync(m.accionesDir(), { recursive: true });
    m.escribirJsonDurable(m.journalAccionPath(aid), {
      v: 1, action_id: aid, writer: 'b'.repeat(32), tipo: 'candidate-eval',
      base_commit_id: dbmod.getCommitActual(), cifrado: 0, destino, modo: 'overwrite',
      original_sha256: sha(Buffer.from(EVAL_, 'utf8')), original_size: EVAL_.length,
      new_sha256: sha(Buffer.from('X', 'utf8')), new_size: 1,
      fase: 'publicando', startedAt: new Date().toISOString(),
    });
    const antes = foto(dir);
    const r = m.guardarEval(null, { projectId: pid, payload: EVAL_ + ' DE-B' });
    ok('I6) candidateEval sobre un destino ocupado por otro equipo -> NO aplicado',
      r.ok === false && r.aplicado === false && r.reintentable === true, JSON.stringify(r).slice(0, 160));
    ok('   nada cambia en la carpeta', igual(antes, foto(dir)));
    ok('   el archivo sigue siendo el anterior', leer(destino) === EVAL_);
    // pero un backup nuevo (otro destino) SI puede
    const rb = await m.guardarBackup(null, { projectId: pid, payload: VOLCADO('V1'), reason: 'manual' });
    ok('   y un backup de otro destino SI se guarda', rb.ok === true && rb.aplicado === true, JSON.stringify(rb).slice(0, 140));
    fs.unlinkSync(m.journalAccionPath(aid));

    // journal PROPIO pendiente e irresoluble -> nada nuevo empieza
    const aid2 = m.nuevoActionId();
    m.escribirJsonDurable(m.journalAccionPath(aid2), {
      v: 1, action_id: aid2, writer: 'a'.repeat(32), tipo: 'candidate-eval',
      base_commit_id: dbmod.getCommitActual(), cifrado: 0, destino, modo: 'overwrite',
      original_sha256: sha(Buffer.from('OTRA COSA', 'utf8')), original_size: 9,
      new_sha256: sha(Buffer.from('TAMPOCO', 'utf8')), new_size: 7,
      fase: 'publicando', startedAt: new Date().toISOString(),
    });
    const antes2 = foto(dir);
    const r2 = m.guardarPrep(null, { projectId: pid, meetingDate: 'x', finalidad: 'x', payload: PREP });
    ok('I6) con un journal PROPIO irresoluble, ninguna accion nueva empieza',
      r2.ok === false && r2.aplicado === false && r2.reintentable === false, JSON.stringify(r2).slice(0, 160));
    ok('   y no se escribio nada', igual(antes2, foto(dir)));
  }

  // =========================================================================
  seccion('I7. CIFRADO ACTIVO Y BARRERA DE SEGURIDAD');
  // =========================================================================
  {
    const dir = carpeta('I7'); const { pid } = await montar(dir);
    const m = construirMain({});
    const key = securitymod.deriveKey('clave', 'aa'.repeat(16));
    m.setKey(key);
    const r = await m.guardarBackup(null, { projectId: pid, payload: VOLCADO('CIFRADO'), reason: 'manual' });
    ok('I7) con Seguridad activa, el backup se guarda', r.ok === true && r.aplicado === true);
    const fila = dbmod.get('SELECT file_path, encrypted FROM backups WHERE project_id=?', [pid]);
    ok('   la fila dice encrypted=1', fila.encrypted === 1);
    const raw = leer(path.join(dir, 'backups', String(pid), fila.file_path));
    ok('   el archivo NO esta en claro', raw.indexOf('CIFRADO') < 0);
    ok('   DESCIFRADO REAL con la clave correcta', (() => {
      try { return securitymod.decryptString(key, raw) === VOLCADO('CIFRADO'); } catch (e) { return false; }
    })());

    // barrera: clave invalidada
    m.setRevalidacion(true);
    const antes = foto(dir);
    const r2 = await m.guardarBackup(null, { projectId: pid, payload: VOLCADO('NO-DEBE-ESCRIBIRSE'), reason: 'manual' });
    const r3 = m.guardarEval(null, { projectId: pid, payload: EVAL_ });
    ok('I7) con la barrera activa, backup:save NO guarda', r2.ok === false && r2.aplicado === false, JSON.stringify(r2).slice(0, 140));
    ok('   ni candidateEval:save', r3.ok === false && r3.aplicado === false, JSON.stringify(r3).slice(0, 140));
    ok('   y no se escribio NADA', igual(antes, foto(dir)));
    let claro = false;
    Object.keys(foto(dir)).forEach(() => {});
    const rec = (d) => { try { fs.readdirSync(d, { withFileTypes: true }).forEach((en) => {
      const f = path.join(d, en.name);
      if (en.isDirectory()) rec(f); else if (leer(f).includes('NO-DEBE-ESCRIBIRSE')) claro = true;
    }); } catch (e) {} };
    rec(dir);
    ok('   el contenido NO quedo en claro en ninguna parte', claro === false);
    m.setRevalidacion(false);
  }

  // =========================================================================
  seccion('I8. GUARDAS HISTORICAS (B2 / A1 / A2) CON EL CONTRATO NUEVO');
  // =========================================================================
  {
    const dir = carpeta('I8'); const { pid } = await montar(dir);
    const m = construirMain({});
    m.setComprometido(true);
    const r1 = await m.guardarBackup(null, { projectId: pid, payload: VOLCADO('X'), reason: 'auto' });
    m.setComprometido(false);
    ok('I8) procesoComprometido -> forma 1, no un booleano',
      r1 && typeof r1 === 'object' && r1.ok === false && r1.aplicado === false && r1.reintentable === false,
      JSON.stringify(r1));
    m.setRekey(true);
    const r2 = await m.guardarBackup(null, { projectId: pid, payload: VOLCADO('X'), reason: 'auto' });
    m.setRekey(false);
    ok('   rekeyInProgress -> forma 1 reintentable', r2.ok === false && r2.aplicado === false && r2.reintentable === true,
      JSON.stringify(r2));
    ok('   con el mensaje de "se esta actualizando"', /ACTUALIZANDO/i.test(String(r2.error)), String(r2.error));
    const r3 = await m.guardarBackup(null, { projectId: 9999, payload: VOLCADO('X'), reason: 'auto' });
    ok('   proyecto inexistente -> forma 1 no reintentable', r3.ok === false && r3.reintentable === false, JSON.stringify(r3));
    ok('   ninguna de las tres escribio nada', dbmod.all('SELECT * FROM backups').length === 0);
  }

  // =========================================================================
  seccion('I9. COPIA DE RESCATE (driveOutageActive) INDEPENDIENTE');
  // =========================================================================
  {
    const dir = carpeta('I9'); const { pid } = await montar(dir);
    const est = {};
    const m = construirMain(est);
    m.setDrive(true);
    const r = await m.guardarBackup(null, { projectId: pid, payload: VOLCADO('RESCATE'), reason: 'manual' });
    ok('I9) con corte de Drive el backup se guarda igual', r.ok === true && r.aplicado === true, JSON.stringify(r).slice(0, 140));
    ok('   y ademas queda la copia de rescate',
      Object.keys(foto(path.join(dir, 'rescate'))).length === 1, JSON.stringify(Object.keys(foto(path.join(dir, 'rescate')))));

    // el fallo de la copia de rescate NO falsea el guardado principal
    const est2 = {};
    const m2 = construirMain(est2);
    m2.setDrive(true);
    const oW = fs.writeFileSync;
    fs.writeFileSync = function (p) {
      if (String(p).includes(path.join('rescate', String(pid)))) { const e = new Error('EIO'); e.code = 'EIO'; throw e; }
      return oW.apply(fs, arguments);
    };
    const r2 = await m2.guardarBackup(null, { projectId: pid, payload: VOLCADO('RESCATE-ROTO'), reason: 'manual' });
    fs.writeFileSync = oW;
    ok('I9) si falla la copia de rescate, el backup principal SIGUE siendo exito',
      r2.ok === true && r2.aplicado === true && r2.verificado === true, JSON.stringify(r2).slice(0, 140));
    ok('   y app.log lo registra aparte',
      (est2.log || []).some((l) => /copia de rescate local NO se pudo/.test(l)), (est2.log || []).join(' | ').slice(-160));
    ok('   el backup principal SI esta en disco',
      dbmod.all('SELECT * FROM backups').length === 2, String(dbmod.all('SELECT * FROM backups').length));
  }

  // =========================================================================
  seccion('I10. migrateLegacyInlineBackupsToFiles');
  // =========================================================================
  {
    const dir = carpeta('I10'); const { pid } = await montar(dir);
    const est = {};
    const m = construirMain(est);
    for (let i = 0; i < 4; i++) {
      dbmod.run('INSERT INTO backups(project_id,created_at,reason,payload,size,file_path,encrypted) VALUES (?,?,?,?,?,?,?)',
        [pid, '2026-01-0' + i, 'legado', 'PAYLOAD-LEGADO-' + i, 20, '', 0]);
    }
    m.migrateLegacyInlineBackupsToFiles();
    const filas = dbmod.all('SELECT id, payload, file_path FROM backups ORDER BY id');
    ok('I10) las 4 filas legadas se migran', filas.every((f) => f.payload === '' && f.file_path), JSON.stringify(filas.map((f) => f.file_path)));
    ok('   cada una con su archivo y su contenido', filas.every((f, i) =>
      leer(path.join(dir, 'backups', String(pid), f.file_path)) === 'PAYLOAD-LEGADO-' + i));
    ok('   sin dejar journals', m.journalsDeAcciones().entradas.length === 0);

    // --- una fila no demostrable DETIENE la migracion ---------------------
    const dir2 = carpeta('I10b'); const r2 = await montar(dir2);
    const est2 = {};
    const m2 = construirMain(est2);
    for (let i = 0; i < 4; i++) {
      dbmod.run('INSERT INTO backups(project_id,created_at,reason,payload,size,file_path,encrypted) VALUES (?,?,?,?,?,?,?)',
        [r2.pid, '2026-01-0' + i, 'legado', 'LEGADO-' + i, 10, '', 0]);
    }
    // journal propio irresoluble: la PRIMERA fila ya no puede empezar
    const aid = m2.nuevoActionId();
    fs.mkdirSync(m2.accionesDir(), { recursive: true });
    m2.escribirJsonDurable(m2.journalAccionPath(aid), {
      v: 1, action_id: aid, writer: dbmod.getInstallationId(), tipo: 'backup',
      base_commit_id: dbmod.getCommitActual(), cifrado: 0,
      destino: path.join(dir2, 'backups', String(r2.pid), 'fantasma.json'), modo: 'overwrite',
      original_sha256: sha(Buffer.from('NO EXISTE', 'utf8')), original_size: 9,
      new_sha256: sha(Buffer.from('TAMPOCO', 'utf8')), new_size: 7,
      fase: 'publicando', startedAt: new Date().toISOString(),
    });
    m2.migrateLegacyInlineBackupsToFiles();
    const sinMigrar = dbmod.all("SELECT id FROM backups WHERE payload!='' ").length;
    ok('I10b) con una accion no demostrable, la migracion se DETIENE',
      sinMigrar === 4, `filas sin migrar: ${sinMigrar}`);
    ok('   y lo deja dicho en app.log',
      (est2.log || []).some((l) => /migraci.n de backups antiguos DETENIDA/i.test(l)), (est2.log || []).join(' | ').slice(-200));
  }

  // =========================================================================
  seccion('I11. EL CONTRATO QUE RECIBE EL RENDERER (lastSerialized)');
  // =========================================================================
  {
    const dir = carpeta('I11'); const { pid } = await montar(dir);
    const m = construirMain({});
    // Reproduce maybeBackup() de plantilla_dashboard.html sobre el contrato real.
    let lastSerialized = '';
    let backupsDetenidos = false;
    let avisos = 0;
    async function maybeBackup(payload) {
      if (backupsDetenidos) return { ok: false, skipped: true, why: 'requiere-reinicio' };
      const serialized = payload;
      if (serialized === lastSerialized) return { ok: true, skipped: true, why: 'unchanged' };
      const res = await bordeIPC(Promise.resolve().then(() => m.guardarBackup(null, { projectId: pid, payload: serialized, reason: 'auto' })));
      if (!res || res.aplicado !== true) return { ok: false, why: 'write-failed', error: res && res.error };
      lastSerialized = serialized;
      if (res.verificado === false) { backupsDetenidos = true; avisos++; return { ok: true, aplicado: true, requiereReinicio: true }; }
      return { ok: true, aplicado: true, verificado: true };
    }

    const a = await maybeBackup(VOLCADO('A'));
    ok('I11) exito -> lastSerialized avanza', a.ok === true && lastSerialized === VOLCADO('A'), JSON.stringify(a));

    // fallo: lastSerialized NO debe avanzar
    const dbPath = path.join(dir, 'panorama.sqlite3');
    const oR = fs.renameSync;
    fs.renameSync = function () {
      if (String(arguments[1] || '') === dbPath) { const e = new Error('EIO'); e.code = 'EIO'; throw e; }
      return oR.apply(fs, arguments);
    };
    const b = await maybeBackup(VOLCADO('B'));
    fs.renameSync = oR;
    ok('I11) aplicado:false -> write-failed', b.ok === false && b.why === 'write-failed', JSON.stringify(b));
    ok('   y lastSerialized NO avanza (se reintentara)', lastSerialized === VOLCADO('A'), lastSerialized.slice(0, 40));

    // reintento: ahora si
    const c = await maybeBackup(VOLCADO('B'));
    ok('I11) el reintento guarda y lastSerialized avanza', c.ok === true && lastSerialized === VOLCADO('B'));

    // aplicado sin verificar -> NO se repite
    const oS = fs.statSync, oRd = fs.readFileSync;
    let roto = false;
    fs.renameSync = function () { const r = oR.apply(fs, arguments); if (String(arguments[1] || '') === dbPath) roto = true; return r; };
    fs.statSync = function (p) { if (roto && String(p) === dbPath) { const e = new Error('EIO'); e.code = 'EIO'; throw e; } return oS.apply(fs, arguments); };
    fs.readFileSync = function (p) { if (roto && String(p) === dbPath) { const e = new Error('EIO'); e.code = 'EIO'; throw e; } return oRd.apply(fs, arguments); };
    const d = await maybeBackup(VOLCADO('C'));
    fs.renameSync = oR; fs.statSync = oS; fs.readFileSync = oRd;
    ok('I11) aplicado:true/verificado:false -> requiereReinicio', d.ok === true && d.requiereReinicio === true, JSON.stringify(d));
    ok('   lastSerialized SI avanza (el contenido se aplico)', lastSerialized === VOLCADO('C'));
    ok('   se avisa al usuario una vez', avisos === 1);
    const n = dbmod.all('SELECT * FROM backups').length;
    const e2 = await maybeBackup(VOLCADO('D'));
    ok('I11) NO se reintenta un aplicado:true', e2.skipped === true && e2.why === 'requiere-reinicio', JSON.stringify(e2));
    ok('   y no aparece ningun backup nuevo', dbmod.all('SELECT * FROM backups').length === n);

    // promesa rechazada -> nunca se interpreta como exito
    const rechazo = await bordeIPC(Promise.reject(new Error('IPC caido')));
    ok('I11) una promesa rechazada llega como forma 1', rechazo.ok === false && rechazo.aplicado === false, JSON.stringify(rechazo));
    const booleano = await bordeIPC(Promise.resolve(true));
    ok('   y un booleano viejo TAMPOCO se interpreta como exito',
      booleano.ok === false && booleano.aplicado === false, JSON.stringify(booleano));
  }

  // =========================================================================
  seccion('ORD-ACT. PRECEDENCIA: REKEY FAIL-CLOSED ANTES QUE ACCIONES');
  // =========================================================================
  {
    // Se comprueba sobre el TEXTO del arranque real de main.js: el orden es
    // una propiedad del codigo, no de un doble.
    const iRek = SRC.indexOf('rekeyRecovery = recoverInterruptedRekeyIfAny()');
    const iRekCierra = SRC.indexOf('if (rekeyRecovery && rekeyRecovery.fallaCerrado)');
    const iAcc = SRC.indexOf('accionesRecovery = recuperarAccionesPendientes()');
    const iAccCierra = SRC.indexOf('if (accionesRecovery && accionesRecovery.fallosCerrados.length)');
    const iVac = SRC.indexOf('maybeRunPeriodicVacuum();', iAccCierra);
    const iLogin = SRC.indexOf('const loggedIn = await runLoginFlow();');
    const iMig = SRC.indexOf('migrateLegacyInlineBackupsToFiles();', iLogin);
    const iLan = SRC.indexOf('createLauncherWindow();', iLogin);
    ok('ORD-ACT-0) el fail-closed del REKEY va ANTES de recuperar acciones',
      iRek > 0 && iRekCierra > iRek && iAcc > iRekCierra, `${iRek} / ${iRekCierra} / ${iAcc}`);
    ok('   y su bloque cierra la app con un return', (() => {
      const b = SRC.slice(iRekCierra, iAcc);
      return /closeSplashWindow\(\(\) => app\.quit\(\)\)/.test(b) && /return;/.test(b);
    })());
    ok('   el fail-closed de ACCIONES va despues, y antes de vacuum/login/migraciones',
      iAccCierra > iAcc && iAccCierra < iVac && iVac < iLogin && iLogin < iMig && iLan > iLogin,
      `${iAccCierra} < ${iVac} < ${iLogin} < ${iMig}`);
    ok('   y tambien cierra con return', (() => {
      const b = SRC.slice(iAccCierra, iVac);
      return /closeSplashWindow\(\(\) => app\.quit\(\)\)/.test(b) && /return;/.test(b) && /PS-2006/.test(b);
    })());
  }

  // ORD-ACT-1 y ORD-ACT-2: comportamiento, no solo orden en el texto.
  // Se reproduce el arranque REAL con las dos recuperaciones reales.
  {
    const recovRekey = extraer('function recoverInterruptedRekeyIfAny()');
    void recovRekey;
    for (const [etq, comoRomper] of [
      ['ORD-ACT-1 (journal de rekey AJENO)', (m, dir) => {
        const stg = path.join(dir, '.panorama-rekey');
        fs.mkdirSync(stg, { recursive: true });
        fs.writeFileSync(path.join(stg, '0.old'), 'ORIGINAL DE OTRO EQUIPO', 'utf8');
        fs.writeFileSync(path.join(stg, 'journal.json'), JSON.stringify({
          v: 2, writer: 'b'.repeat(32), mode: 'change', newFlag: 1,
          newSalt: 'aa'.repeat(16), newVerifier: 'cc'.repeat(32), remembered_final: 'ausente',
          base_commit_id: dbmod.getCommitActual(), phase: 'swap', consolidated_commit_id: null, items: [],
        }), 'utf8');
        void m;
      }],
      ['ORD-ACT-2 (journal de rekey CORRUPTO)', (m, dir) => {
        const stg = path.join(dir, '.panorama-rekey');
        fs.mkdirSync(stg, { recursive: true });
        fs.writeFileSync(path.join(stg, '0.old'), 'ORIGINAL IRREMPLAZABLE', 'utf8');
        fs.writeFileSync(path.join(stg, 'journal.json'), '{ no es json', 'utf8');
        void m;
      }],
    ]) {
      const dir = carpeta('ORDACT'); const { pid } = await montar(dir);
      const m = construirMain({});
      // Una accion propia pendiente que SI seria recuperable (CASO A).
      const destino = path.join(dir, 'backups', String(pid), 'ordact.json');
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      const aid = m.nuevoActionId();
      const tmp = `${destino}.tmp-${dbmod.getInstallationId()}-${aid}`;
      fs.writeFileSync(tmp, 'PREPARADO', 'utf8');
      fs.mkdirSync(m.accionesDir(), { recursive: true });
      m.escribirJsonDurable(m.journalAccionPath(aid), {
        v: 1, action_id: aid, writer: dbmod.getInstallationId(), tipo: 'backup',
        base_commit_id: dbmod.getCommitActual(), cifrado: 0, destino, modo: 'nuevo',
        original_sha256: null, original_size: 0,
        new_sha256: sha(Buffer.from('PREPARADO', 'utf8')), new_size: 9,
        fase: 'publicando', startedAt: new Date().toISOString(),
      });
      comoRomper(m, dir);

      const antes = foto(dir);
      // El arranque REAL, en el MISMO orden que main.js: si el rekey queda
      // fail-closed, la recuperacion de acciones NO llega a llamarse.
      const rekey = m.recoverInterruptedRekeyIfAny() || {};
      let seLlamoAcciones = false;
      if (!rekey.fallaCerrado) { seLlamoAcciones = true; m.recuperarAccionesPendientes(); }

      ok(`${etq}: el rekey queda fail-closed`, rekey.fallaCerrado === true, JSON.stringify(rekey).slice(0, 140));
      ok('   NO se ejecuta la recuperacion de acciones', seLlamoAcciones === false);
      ok('   el journal de la accion sigue intacto', fs.existsSync(m.journalAccionPath(aid)));
      ok('   su tmp sigue intacto', leer(tmp) === 'PREPARADO');
      ok('   CERO renames/borrados: la carpeta queda byte a byte igual', igual(antes, foto(dir)));
    }
  }

  // =========================================================================
  seccion('IPC-MC. CONTRATO DE LAS CUATRO ACCIONES (meeting / candidate)');
  // =========================================================================
  {
    const dir = carpeta('IPCMC'); const { pid } = await montar(dir);
    const m = construirMain({});
    const casos = [
      ['meeting:savePrep', () => m.guardarPrep(null, { projectId: pid, meetingDate: 'x', finalidad: 'x', payload: PREP })],
      ['candidateEval:save', () => m.guardarEval(null, { projectId: pid, payload: EVAL_ })],
    ];
    // primero una prep valida para poder probar updatePrep
    const base = m.guardarPrep(null, { projectId: pid, meetingDate: 'x', finalidad: 'x', payload: PREP });
    casos.push(['meeting:updatePrep', () => m.actualizarPrep(null, { projectId: pid, id: base.id, meetingDate: 'y', finalidad: 'y', payload: PREP })]);

    for (const [nombre, ejecutar] of casos) {
      m.setComprometido(true);
      const r1 = ejecutar();
      m.setComprometido(false);
      ok(`IPC-MC ${nombre}: procesoComprometido -> aplicado:false`,
        r1.ok === false && r1.aplicado === false && r1.reintentable === false, JSON.stringify(r1));

      m.setRekey(true);
      const r2 = ejecutar();
      m.setRekey(false);
      ok(`   ${nombre}: rekeyInProgress -> aplicado:false reintentable`,
        r2.ok === false && r2.aplicado === false && r2.reintentable === true, JSON.stringify(r2));
    }
    // proyecto inexistente
    const r3 = m.guardarPrep(null, { projectId: 9999, meetingDate: 'x', finalidad: 'x', payload: PREP });
    ok('IPC-MC meeting:savePrep: proyecto inexistente -> aplicado:false',
      r3.ok === false && r3.aplicado === false && r3.reintentable === false, JSON.stringify(r3));
    const r4 = m.guardarEval(null, { projectId: 9999, payload: EVAL_ });
    ok('IPC-MC candidateEval:save: proyecto inexistente -> aplicado:false',
      r4.ok === false && r4.aplicado === false && r4.reintentable === false, JSON.stringify(r4));
    const r5 = m.actualizarPrep(null, { projectId: pid, id: 99999, meetingDate: 'x', finalidad: 'x', payload: PREP });
    ok('IPC-MC meeting:updatePrep: preparacion inexistente -> aplicado:false',
      r5.ok === false && r5.aplicado === false && r5.reintentable === false, JSON.stringify(r5));

    // el borde de preload normaliza tambien estos tres canales
    ok('IPC-MC preload usa invokeAccion en los CUATRO canales', (() => {
      const src = fs.readFileSync(path.join(PROJ, 'preload.js'), 'utf8');
      return /invokeAccion\('backup:save'/.test(src) && /invokeAccion\('meeting:savePrep'/.test(src)
        && /invokeAccion\('meeting:updatePrep'/.test(src) && /invokeAccion\('candidateEval:save'/.test(src);
    })());
    ok('   y NO en los IPC de lectura/borrado', (() => {
      const src = fs.readFileSync(path.join(PROJ, 'preload.js'), 'utf8');
      return /ipcRenderer\.invoke\('meeting:listPreps'/.test(src) && /ipcRenderer\.invoke\('candidateEval:get'/.test(src)
        && !/invokeAccion\('meeting:listPreps'/.test(src);
    })());
    const rechazo = await bordeIPC(Promise.reject(new Error('IPC caido')));
    ok('IPC-MC una promesa rechazada llega como forma 1', rechazo.ok === false && rechazo.aplicado === false);
  }

  // =========================================================================
  seccion('REND. LOS RENDERERS REALES DE REUNION Y CANDIDATOS');
  // =========================================================================
  {
    // Se extraen las funciones REALES de las dos plantillas y se ejecutan
    // contra el contrato real, no una reproduccion escrita a mano.
    function extraerDe(archivo, firma) {
      const t = fs.readFileSync(path.join(PROJ, archivo), 'utf8');
      const i = t.indexOf(firma);
      if (i < 0) throw new Error('NO SE ENCONTRO ' + firma + ' en ' + archivo);
      let j = t.indexOf('{', i), prof = 0;
      for (let k = j; k < t.length; k++) {
        if (t[k] === '{') prof++;
        else if (t[k] === '}') { prof--; if (prof === 0) return t.slice(i, k + 1); }
      }
      throw new Error('no delimitado');
    }
    const HTML_R = 'preparacion-reunion\\plantilla_preparacion_reunion.html';
    const HTML_C = 'evaluacion-candidatos\\plantilla_evaluacion_candidatos.html';

    // --- Preparacion de reunion -----------------------------------------
    {
      const cuerpo = extraerDe(HTML_R, 'async function autoSaveHistory(){');
      const respuestas = [];
      const avisos = [];
      const est = { state: { saveHistoryStatus: null, loadedPrepId: null, todayDate: 'd', finalidad: 'f' } };
      const f = new Function('window', 'state', 'buildMeetingPrepPayload', 'render', 'console', 'psAlert',
        'let guardadosDetenidos = false;\nlet avisoReinicioMostrado = false;\n' + cuerpo +
        '\nreturn { autoSaveHistory, detenidos: () => guardadosDetenidos };');
      const api = f(
        { panoramaBridge: {
          saveMeetingPrep: () => Promise.resolve(respuestas.shift()),
          updateMeetingPrep: () => Promise.resolve(respuestas.shift()),
        } },
        est.state, () => 'PAYLOAD', () => {}, { warn: () => {} },
        (msg) => { avisos.push(msg); return Promise.resolve(); });

      respuestas.push({ ok: true, aplicado: true, verificado: true, id: 7 });
      await api.autoSaveHistory();
      ok('REND-R1) aplicado:true/verificado:true -> estado ok', est.state.saveHistoryStatus === 'ok');
      ok('   guarda el id devuelto', est.state.loadedPrepId === 7);

      est.state.loadedPrepId = null;
      respuestas.push({ ok: false, aplicado: false, reintentable: true, error: 'fallo' });
      await api.autoSaveHistory();
      ok('REND-R2) aplicado:false -> estado error', est.state.saveHistoryStatus === 'error');
      ok('   NO guarda ningun id', est.state.loadedPrepId === null);
      ok('   y NO se detiene la ventana (es reintentable)', api.detenidos() === false);

      respuestas.push({ ok: true, aplicado: true, verificado: false, requiereReinicio: true, aviso: 'HAY QUE REINICIAR', id: 9 });
      await api.autoSaveHistory();
      ok('REND-R3) aplicado:true/verificado:false -> estado propio, no "ok" ni "error"',
        est.state.saveHistoryStatus === 'requiere-reinicio', String(est.state.saveHistoryStatus));
      ok('   se muestra el aviso', avisos.length === 1 && /REINICIAR/.test(avisos[0]), JSON.stringify(avisos));
      ok('   la ventana deja de guardar', api.detenidos() === true);
      const antes = respuestas.length;
      await api.autoSaveHistory();
      ok('   y un guardado posterior NO llama al IPC (no se repite)', respuestas.length === antes);
      ok('   ni se muestra el aviso dos veces', avisos.length === 1);
    }

    // --- Evaluacion de candidatos ---------------------------------------
    {
      const cuerpo = extraerDe(HTML_C, 'async function doSaveNow() {');
      const respuestas = [];
      const toasts = [], errores = [], avisos = [];
      const bannersFijos = [];
      // Bloque 5 (§4.9): doSaveNow() devuelve ahora el contrato en TODAS sus
      // ramas, y para eso usa dos constantes declaradas en el propio HTML. Se
      // extraen del HTML real, no se redeclaran aqui.
      // OJO: HTML_C es una RUTA, no el contenido — `extraerDe` es quien lee.
      const txtCv = fs.readFileSync(path.join(PROJ, HTML_C), 'utf8');
      const constsCv = ['CONTRATO_SESION_DETENIDA', 'CONTRATO_RESPUESTA_VACIA'].map((n) => {
        const i = txtCv.indexOf('const ' + n + ' = Object.freeze({');
        if (i < 0) throw new Error('NO SE ENCONTRO la constante ' + n + ' en ' + HTML_C);
        const fin = txtCv.indexOf('});', i);
        if (fin < 0) throw new Error('constante ' + n + ' sin cierre');
        return txtCv.slice(i, fin + 3) + '\n';
      }).join('');
      const f = new Function('window', 'showToast', 'showError', 'psAlert', 'clearTimeout', 'state',
        'mostrarAvisoPersistente', 'AVISO_SESION_DETENIDA',
        'let saveTimer = null;\nlet guardadosDetenidos = false;\nlet avisoReinicioMostrado = false;\n' +
        constsCv + cuerpo +
        '\nreturn { doSaveNow, detenidos: () => guardadosDetenidos };');
      const api = f(
        { panoramaBridge: { saveCandidateEvalData: () => Promise.resolve(respuestas.shift()) } },
        (t) => toasts.push(t), (e) => errores.push(e),
        (msg) => { avisos.push(msg); return Promise.resolve(); },
        () => {}, {},
        (t) => bannersFijos.push(t), 'AVISO PERSISTENTE DE SESION DETENIDA');
      api.banners = bannersFijos;

      respuestas.push({ ok: true, aplicado: true, verificado: true });
      await api.doSaveNow();
      ok('REND-C1) aplicado:true/verificado:true -> "Guardado"', toasts.length === 1 && errores.length === 0,
        JSON.stringify({ toasts, errores }));

      respuestas.push({ ok: false, aplicado: false, reintentable: true, error: 'fallo de disco' });
      await api.doSaveNow();
      ok('REND-C2) aplicado:false -> error y NO "Guardado"',
        toasts.length === 1 && errores.length === 1 && /fallo de disco/.test(errores[0]), JSON.stringify(errores));
      ok('   la ventana sigue viva (reintentable)', api.detenidos() === false);

      respuestas.push({ ok: true, aplicado: true, verificado: false, requiereReinicio: true, aviso: 'HAY QUE REINICIAR' });
      await api.doSaveNow();
      ok('REND-C3) aplicado:true/verificado:false -> NO muestra "Guardado"', toasts.length === 1, String(toasts.length));
      ok('   muestra un banner PERSISTENTE, no un toast',
        bannersFijos.length === 1 && /SESION DETENIDA/.test(bannersFijos[0]), JSON.stringify(bannersFijos));
      ok('   y NO añade otro error temporal', errores.length === 1, JSON.stringify(errores));
      ok('   la ventana deja de guardar', api.detenidos() === true);
      const antes = respuestas.length;
      await api.doSaveNow();
      ok('   y un guardado posterior NO llama al IPC', respuestas.length === antes);
    }
  }

  // =========================================================================
  seccion('STOP. ESTADO DE UI Y CONGELACION TRAS LA FORMA 3');
  // =========================================================================
  {
    function texto(archivo) { return fs.readFileSync(path.join(PROJ, archivo), 'utf8'); }
    function extraerDe(archivo, firma) {
      const t = texto(archivo);
      const i = t.indexOf(firma);
      if (i < 0) throw new Error('NO SE ENCONTRO ' + firma + ' en ' + archivo);
      let j = t.indexOf('{', i), prof = 0;
      for (let k = j; k < t.length; k++) {
        if (t[k] === '{') prof++;
        else if (t[k] === '}') { prof--; if (prof === 0) return t.slice(i, k + 1); }
      }
      throw new Error('no delimitado');
    }
    const HTML_R = 'preparacion-reunion\\plantilla_preparacion_reunion.html';
    const HTML_C = 'evaluacion-candidatos\\plantilla_evaluacion_candidatos.html';

    // --- REND-R4 / R-STOP-1: el estado visual de reunion ------------------
    {
      const cuerpo = extraerDe(HTML_R, 'function saveStatusHtml(){');
      const f = new Function('state', cuerpo + '\nreturn saveStatusHtml;');
      const html3 = f({ saveHistoryStatus: 'requiere-reinicio', loadedPrepId: 5 })();
      const htmlErr = f({ saveHistoryStatus: 'error', loadedPrepId: null })();
      const htmlOk = f({ saveHistoryStatus: 'ok', loadedPrepId: null })();
      ok('REND-R4) forma 3 -> el mensaje dice que SI se guardo',
        /S[ÍI] se guard/.test(html3), html3.slice(0, 120));
      ok('   y que hay que reiniciar', /vuelve a abrirlo|reinici/i.test(html3), html3.slice(0, 160));
      ok('   NO existe btn-retry-save en ese estado', html3.indexOf('btn-retry-save') < 0, html3.slice(0, 160));
      ok('   el estado "error" normal SI sigue ofreciendo Reintentar', htmlErr.indexOf('btn-retry-save') > 0);
      ok('   y el estado "ok" sigue igual', /Guardado en el historial/.test(htmlOk));

      // el camino que llega a ese estado
      const auto = extraerDe(HTML_R, 'async function autoSaveHistory(){');
      ok('REND-R4) autoSaveHistory pone "requiere-reinicio", no "error"',
        /verificado === false/.test(auto) && /saveHistoryStatus = 'requiere-reinicio'/.test(auto));
      ok('   y con la sesion detenida tampoco vuelve a "error"',
        /if\(guardadosDetenidos\)\{ state\.saveHistoryStatus = 'requiere-reinicio'/.test(auto));
      // R-STOP-1: "Nueva preparacion" no abre una sesion que no podra guardar
      const src = texto(HTML_R);
      const iRestart = src.indexOf("const restart = document.getElementById('btn-restart');");
      const bloque = src.slice(iRestart, iRestart + 900);
      ok('R-STOP-1) "Nueva preparacion" queda bloqueada con la sesion detenida',
        /if\(guardadosDetenidos\)\{/.test(bloque) && /return;/.test(bloque), bloque.slice(0, 120));
      ok('   y lo explica antes de no hacer nada', /vuelve a abrirlo/.test(bloque));
    }

    // --- C-STOP-1: el aviso NO es un toast temporal -----------------------
    {
      const src = texto(HTML_C);
      ok('C-STOP-1) el aviso de reinicio NO usa el toast de 4,5 s', (() => {
        const i = src.indexOf('if (res.verificado === false)');
        // Solo el bloque de la forma 3, hasta SU return. Bloque 5 (§4.9) lo
        // cambió de `return;` a `return res;` — buscar el literal viejo hacía
        // que el corte se fuera cientos de líneas más abajo y el bloque
        // "contuviera" toasts de otras ramas.
        const m = /\n\s*return(\s+[^;]*)?;/.exec(src.slice(i));
        if (!m) return false;
        const bloque = src.slice(i, i + m.index + m[0].length);
        return /mostrarAvisoPersistente\(/.test(bloque) && !/showError\(/.test(bloque) && !/showToast\(/.test(bloque);
      })(), src.slice(src.indexOf('if (res.verificado === false)'), src.indexOf('if (res.verificado === false)') + 400));
      const av = extraerDe(HTML_C, 'function mostrarAvisoPersistente(texto)');
      ok('   y el banner NO lleva ningun temporizador', !/setTimeout/.test(av), av.slice(0, 120));
      ok('   es fijo en pantalla', /position:fixed/.test(av));
      // se ejecuta de verdad contra un DOM minimo
      const elementos = {};
      const docDoble = {
        getElementById: (id) => elementos[id] || null,
        createElement: () => { const e = { style: { cssText: '' }, setAttribute: () => {} }; return e; },
        body: { appendChild: (e) => { elementos.avisoSesionDetenida = e; }, style: {} },
      };
      const g = new Function('document', 'AVISO_SESION_DETENIDA', av + '\nreturn mostrarAvisoPersistente;');
      const fn = g(docDoble, 'AVISO POR DEFECTO');
      fn('EL AVISO');
      ok('C-STOP-1) al ejecutarlo de verdad crea el banner y pone el texto',
        !!elementos.avisoSesionDetenida && elementos.avisoSesionDetenida.textContent === 'EL AVISO');
      fn('SEGUNDA VEZ');
      ok('   y al repetir NO duplica el banner, solo actualiza el texto',
        elementos.avisoSesionDetenida.textContent === 'SEGUNDA VEZ');
    }

    // --- C-STOP-2 / C-CV-1 / C-CV-2: congelacion de mutaciones ------------
    {
      const src = texto(HTML_C);
      const mut = extraerDe(HTML_C, 'function mutacionesPermitidas()');
      const acc = extraerDe(HTML_C, 'function accionPermitida(action)');
      const listaSoloLectura = src.slice(src.indexOf('const ACCIONES_SOLO_LECTURA'), src.indexOf(']);', src.indexOf('const ACCIONES_SOLO_LECTURA')) + 3);
      const f = new Function('guardadosDetenidos', 'mostrarAvisoPersistente',
        listaSoloLectura + '\n' + mut + '\n' + acc + '\nreturn { mutacionesPermitidas, accionPermitida };');
      let avisos = 0;
      const apiOn = f(true, () => { avisos++; });
      const apiOff = f(false, () => { avisos++; });

      ok('C-STOP-2) con la sesion detenida, mutacionesPermitidas() es false', apiOn.mutacionesPermitidas() === false);
      ok('   y muestra el aviso persistente', avisos === 1);
      ok('   sin la sesion detenida, true y sin aviso', apiOff.mutacionesPermitidas() === true && avisos === 1);

      // `task-guide` va aqui: es el <textarea> editable de la guia de una
      // tarea. Estaba en la lista de solo lectura y esa clasificacion era
      // justo el bypass — la aseveracion anterior daba por buena la version
      // defectuosa.
      const mutantes = ['add-task', 'del-task', 'del-puesto', 'edit-puesto-name', 'save-puesto-name',
        'task-name', 'task-weight', 'task-guide', 'puesto-field', 'del-eval', 'reset-feedback',
        'adjuntar-cv', 'cambiar-cv', 'quitar-cv', 'ev-puesto', 'ev-nota', 'ev-field',
        'ev-comentario', 'ev-feedback'];
      const lectura = ['toggle-puesto-tasks', 'toggle-tasks', 'export-eval', 'copy-feedback', 'ver-cv'];
      ok('C-STOP-2) TODAS las acciones mutantes quedan impedidas',
        mutantes.every((a) => apiOn.accionPermitida(a) === false),
        mutantes.filter((a) => apiOn.accionPermitida(a) !== false).join(','));
      ok('   y las de solo lectura siguen permitidas',
        lectura.every((a) => apiOn.accionPermitida(a) === true),
        lectura.filter((a) => apiOn.accionPermitida(a) !== true).join(','));

      // C-CV-1 / C-CV-2: la guarda va ANTES del IPC
      const iAdj = src.indexOf("action === 'adjuntar-cv'");
      const bloqueAdj = src.slice(iAdj, src.indexOf("action === 'ver-cv'", iAdj));
      ok('C-CV-1) adjuntar/cambiar CV: la guarda va ANTES de pickCandidateCv',
        bloqueAdj.indexOf('mutacionesPermitidas()') > 0 &&
        bloqueAdj.indexOf('mutacionesPermitidas()') < bloqueAdj.indexOf('pickCandidateCv'),
        `guarda=${bloqueAdj.indexOf('mutacionesPermitidas()')} ipc=${bloqueAdj.indexOf('pickCandidateCv')}`);

      const iQui = src.indexOf("action === 'quitar-cv'");
      const bloqueQui = src.slice(iQui, src.indexOf("action === 'toggle-tasks'", iQui));
      // Se busca la LLAMADA real, no la palabra suelta: mi propio comentario
      // menciona removeCandidateCv() y falsearia la comparacion de posiciones.
      const iGuarda = bloqueQui.indexOf('if (!mutacionesPermitidas()) return;');
      const iConfirm = bloqueQui.indexOf('askConfirm(');
      const iRemove = bloqueQui.indexOf('window.panoramaBridge.removeCandidateCv(');
      ok('C-CV-2) quitar CV: la guarda va ANTES de askConfirm y de removeCandidateCv',
        iGuarda >= 0 && iGuarda < iConfirm && iGuarda < iRemove,
        `guarda=${iGuarda} confirm=${iConfirm} rm=${iRemove}`);
      ok('   (es el caso que dejaria estado.json apuntando a un CV ya borrado)',
        iRemove > 0 && /saveState\(true\)/.test(bloqueQui));

      // y los manejadores delegados llevan la guarda
      ok('C-STOP-2) los 5 manejadores delegados llevan la guarda',
        (src.match(/if \(!accionPermitida\(action\)\) return;/g) || []).length === 5,
        String((src.match(/if \(!accionPermitida\(action\)\) return;/g) || []).length));
      ok('   y los 4 puntos de entrada directos tambien',
        (src.match(/if \(!mutacionesPermitidas\(\)\)/g) || []).length >= 6,
        String((src.match(/if \(!mutacionesPermitidas\(\)\)/g) || []).length));
    }
  }

  // =========================================================================
  seccion('C-STOP-GUIDE / C-STOP-NAME-ENTER. LOS DOS BYPASS');
  // =========================================================================
  {
    const HTML_C = 'evaluacion-candidatos\\plantilla_evaluacion_candidatos.html';
    const src = fs.readFileSync(path.join(PROJ, HTML_C), 'utf8');

    // Monta un DOM minimo con delegacion real de eventos: los manejadores que
    // se extraen son los del archivo, y los eventos se disparan de verdad.
    function montarDom() {
      const listeners = {};
      const nodo = {
        addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
        dispatch: (ev, e) => { (listeners[ev] || []).forEach((fn) => fn(e)); },
      };
      return { nodo, listeners };
    }

    // --- C-STOP-GUIDE: el textarea de la guia de una tarea ----------------
    for (const detenida of [true, false]) {
      const { nodo } = montarDom();
      const estado = { puestos: [{ id: 'p1', tasks: [{ id: 't1', name: 'T', weight: 3, guide: 'ANTES' }] }] };
      let guardados = 0; const banners = [];
      const i = src.indexOf("document.getElementById('puestosList').addEventListener('input', e => {");
      const fin = src.indexOf('\n});', i) + 4;
      const cuerpo = src.slice(i, fin);
      const listaSL = src.slice(src.indexOf('const ACCIONES_SOLO_LECTURA'), src.indexOf(']);', src.indexOf('const ACCIONES_SOLO_LECTURA')) + 3);
      const acc = (() => { const j = src.indexOf('function accionPermitida(action)'); let k = src.indexOf('{', j), p = 0;
        for (let q = k; q < src.length; q++) { if (src[q] === '{') p++; else if (src[q] === '}') { p--; if (p === 0) return src.slice(j, q + 1); } } })();
      const mut = (() => { const j = src.indexOf('function mutacionesPermitidas()'); let k = src.indexOf('{', j), p = 0;
        for (let q = k; q < src.length; q++) { if (src[q] === '{') p++; else if (src[q] === '}') { p--; if (p === 0) return src.slice(j, q + 1); } } })();

      new Function('document', 'state', 'puestoById', 'saveState', 'renderPuestos', 'renderEvaluaciones',
        'guardadosDetenidos', 'mostrarAvisoPersistente',
        listaSL + '\n' + mut + '\n' + acc + '\n' + cuerpo)(
        { getElementById: () => nodo }, estado,
        (id) => estado.puestos.find((p) => p.id === id),
        () => { guardados++; }, () => {}, () => {},
        detenida, (t) => banners.push(t || 'AVISO'));

      nodo.dispatch('input', { target: { value: 'DESPUES', dataset: { action: 'task-guide', puesto: 'p1', task: 't1' } } });

      if (detenida) {
        ok('C-STOP-GUIDE) con la sesion detenida, la guia NO cambia',
          estado.puestos[0].tasks[0].guide === 'ANTES', estado.puestos[0].tasks[0].guide);
        ok('   cero llamadas de guardado', guardados === 0, String(guardados));
        ok('   y se muestra el aviso persistente', banners.length === 1, JSON.stringify(banners));
      } else {
        ok('C-STOP-GUIDE) [control] sin sesion detenida, la guia SI cambia',
          estado.puestos[0].tasks[0].guide === 'DESPUES', estado.puestos[0].tasks[0].guide);
        ok('   y se guarda', guardados === 1, String(guardados));
      }
    }

    // --- C-STOP-NAME-ENTER: Enter al editar el nombre del puesto ---------
    for (const detenida of [true, false]) {
      const { nodo } = montarDom();
      const estado = { puestos: [{ id: 'p1', name: 'ANTES', tasks: [] }] };
      let guardados = 0; const banners = [];
      const i = src.indexOf("document.getElementById('puestosList').addEventListener('keydown', e => {");
      const fin = src.indexOf('\n});', i) + 4;
      const cuerpo = src.slice(i, fin);
      const mut = (() => { const j = src.indexOf('function mutacionesPermitidas()'); let k = src.indexOf('{', j), p = 0;
        for (let q = k; q < src.length; q++) { if (src[q] === '{') p++; else if (src[q] === '}') { p--; if (p === 0) return src.slice(j, q + 1); } } })();

      new Function('document', 'puestoById', 'saveState', 'refreshPuestoNameWrap', 'applyPuestosFilter',
        'guardadosDetenidos', 'mostrarAvisoPersistente',
        'let editingPuestoNameId = "p1";\n' + mut + '\n' + cuerpo)(
        { getElementById: () => nodo },
        (id) => estado.puestos.find((p) => p.id === id),
        () => { guardados++; }, () => {}, () => {},
        detenida, (t) => banners.push(t || 'AVISO'));

      let prevenido = false;
      nodo.dispatch('keydown', {
        key: 'Enter', preventDefault: () => { prevenido = true; },
        target: { classList: { contains: (c) => c === 'name-edit-input' }, value: 'DESPUES', dataset: { puesto: 'p1' } },
      });

      if (detenida) {
        ok('C-STOP-NAME-ENTER) con la sesion detenida, el nombre NO cambia',
          estado.puestos[0].name === 'ANTES', estado.puestos[0].name);
        ok('   cero llamadas de guardado', guardados === 0, String(guardados));
        ok('   se muestra el aviso persistente', banners.length === 1, JSON.stringify(banners));
        ok('   y se sigue evitando el salto de linea', prevenido === true);
      } else {
        ok('C-STOP-NAME-ENTER) [control] sin sesion detenida, Enter SI guarda',
          estado.puestos[0].name === 'DESPUES' && guardados === 1,
          `${estado.puestos[0].name} / ${guardados}`);
      }
    }

    // --- Escape sigue permitido (solo cancela interfaz) -------------------
    {
      const { nodo } = montarDom();
      const estado = { puestos: [{ id: 'p1', name: 'ANTES', tasks: [] }] };
      let guardados = 0; const banners = [];
      const i = src.indexOf("document.getElementById('puestosList').addEventListener('keydown', e => {");
      const cuerpo = src.slice(i, src.indexOf('\n});', i) + 4);
      const mut = (() => { const j = src.indexOf('function mutacionesPermitidas()'); let k = src.indexOf('{', j), p = 0;
        for (let q = k; q < src.length; q++) { if (src[q] === '{') p++; else if (src[q] === '}') { p--; if (p === 0) return src.slice(j, q + 1); } } })();
      new Function('document', 'puestoById', 'saveState', 'refreshPuestoNameWrap', 'applyPuestosFilter',
        'guardadosDetenidos', 'mostrarAvisoPersistente',
        'let editingPuestoNameId = "p1";\n' + mut + '\n' + cuerpo)(
        { getElementById: () => nodo },
        (id) => estado.puestos.find((p) => p.id === id),
        () => { guardados++; }, () => {}, () => {},
        true, (t) => banners.push(t || 'AVISO'));
      nodo.dispatch('keydown', {
        key: 'Escape', preventDefault: () => {},
        target: { classList: { contains: (c) => c === 'name-edit-input' }, value: 'DESPUES', dataset: { puesto: 'p1' } },
      });
      ok('C-STOP-NAME-ESC) Escape sigue permitido y no guarda nada',
        guardados === 0 && estado.puestos[0].name === 'ANTES');
    }

    // --- y `task-guide` ya no esta en la lista blanca --------------------
    {
      const lista = src.slice(src.indexOf('const ACCIONES_SOLO_LECTURA'), src.indexOf(']);', src.indexOf('const ACCIONES_SOLO_LECTURA')) + 3);
      ok('C-STOP-GUIDE) task-guide YA NO figura como solo lectura',
        lista.indexOf("'task-guide'") < 0, lista.replace(/\s+/g, ' '));
    }
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
  console.log(`  BLOQUE 4 / PASO 4 — consumidores + IPC: ${pass} OK, ${fail} FALLOS`);
  console.log('='.repeat(66));
  if (fail) { console.log('  fallos:'); fallos.forEach((f) => console.log('   - ' + f)); }
  try { dbmod._resetParaPruebas(); } catch (e) {}
  try { fs.rmSync(RAIZ, { recursive: true, force: true }); } catch (e) {}
  console.log('  carpetas de prueba borradas: ' + !fs.existsSync(RAIZ));
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('EXCEPCION NO CAPTURADA:', e); process.exit(2); });
