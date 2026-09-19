// ---------------------------------------------------------------------------
// P26 — PURGA P24 DESLIGADA NO BLOQUEANTE, CON RECUPERACIÓN INDEPENDIENTE DE
// LA MARCA. Arnés sobre la app REAL (Electron real, main.js sin modificar), en
// sandbox aislado.
//
// ARN-3 (endurecimiento PERMANENTE del arnés): lo PRIMERO que hace este archivo
// —antes de cargar electron y antes de cargar main.js— es fijar APPDATA,
// LOCALAPPDATA, TEMP y TMP dentro del sandbox, y justo después appData, userData
// y temp de Electron. Ningún efecto lateral (guardián de apagado, `driveSync`,
// diálogos, temporales) puede alcanzar el estado real de la máquina, y nada
// depende ya de que P22 u otra guarda del producto impida una escritura real. El
// arnés además AUTO-COMPRUEBA ese aislamiento y lo vuelca en `resultado.entorno`
// para que el driver lo asevere.
//
// Modos, cada uno su propio proceso Electron (aislamiento real entre pruebas):
//   --modo=ajenas              import fallido -> journal P24 en `purgando`;
//                              operaciones AJENAS (backup, crear con/sin
//                              import, borrar, restaurar); después agota la
//                              marca de 8 acciones (--n= guardados extra).
//   --modo=prep                solo el import fallido (--n= guardados extra
//                              opcionales; --fila=1 reinserta una fila con la
//                              misma partición y comprueba que F-1 bloquea).
//   --modo=dos-fallos          un SEGUNDO import fallido con el primer journal P24
//                              todavía pendiente (F-1 ya no lo bloquea).
//   --modo=negativas           journals fabricados a mano, uno a uno: cuáles
//                              bloquean y cuáles no.
//   --modo=prep-borrar-proyecto  fabrica un `borrar-proyecto` propio en
//                              `purgando` con su material en cuarentena y la
//                              marca SIN su id (la excepción P26 no debe
//                              alcanzarlo).
//   --modo=arranque            arranque real sobre un sandbox con material
//                              pendiente: observadores PASIVOS (sesiones,
//                              ventanas, fs) para ver el ORDEN real.
//
// Cada modo escribe `resultado.json` en su sandbox; el driver (comprobar-p26.js)
// lo interpreta y hace las aserciones.
// ---------------------------------------------------------------------------
'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const arg = (pref) => { const a = process.argv.find((x) => x.startsWith(pref)); return a ? a.slice(pref.length) : null; };
const SB = arg('--sandbox=');
const MODO = arg('--modo=');
const N_EXTRA = Number(arg('--n=') || 0);
const CON_FILA = arg('--fila=') === '1';
// P27: la fila que reaparece puede llevar el MISMO id que la fila fallida
// (`mismo`: una imagen antigua de la BD restaurada) u OTRO (`otro`, por defecto).
const FILA_ID = arg('--fila-id=') === 'mismo' ? 'mismo' : 'otro';
// P27: deja el journal en fase `retirando` (con la marca ya con su id) para
// ejercitar el CASO B histórico SIN la vía especial de P26.
const FASE_RETIRANDO = arg('--fase-retirando=') === '1';
// P27: la consulta a `projects` de la guarda falla durante el arranque.
const BD_FALLA = arg('--bd-falla=') === '1';
// P27 reutiliza este arnés: acepta los sandboxes de las dos baterías.
if (!SB || !/_a33-p2[67]/i.test(SB)) { console.error('sandbox no marcado'); process.exit(2); }
if (!MODO) { console.error('falta --modo='); process.exit(2); }

// ---- ARN-3: lo primero de todo ---------------------------------------------
const UD = path.join(SB, 'userdata');
const APPDATA_SB = path.join(SB, 'appdata');
const LOCAL_SB = path.join(SB, 'localappdata');
const TEMP_SB = path.join(SB, 'temp');
for (const d of [UD, APPDATA_SB, LOCAL_SB, TEMP_SB]) fs.mkdirSync(d, { recursive: true });
process.env.APPDATA = APPDATA_SB;
process.env.LOCALAPPDATA = LOCAL_SB;
process.env.TEMP = TEMP_SB;
process.env.TMP = TEMP_SB;

const electron = require('electron');
const { app, ipcMain, dialog } = electron;
app.setPath('appData', APPDATA_SB);
app.setPath('userData', UD);
app.setPath('temp', TEMP_SB);

const dentro = (p) => { const r = path.relative(path.resolve(SB), path.resolve(String(p))); return !!r && !r.startsWith('..') && !path.isAbsolute(r); };
const entorno = {
  APPDATA: process.env.APPDATA, LOCALAPPDATA: process.env.LOCALAPPDATA, TEMP: process.env.TEMP,
  appData: app.getPath('appData'), userData: app.getPath('userData'), sessionData: app.getPath('sessionData'), temp: app.getPath('temp'),
};
entorno.todoDentroDelSandbox = Object.values(entorno).every((v) => dentro(v));
if (!entorno.todoDentroDelSandbox) { console.error('ARN-3: el entorno NO quedó dentro del sandbox: ' + JSON.stringify(entorno)); process.exit(3); }

// Los diálogos nativos se contestan solos y se REGISTRAN (título).
const dialogosVistos = [];
dialog.showMessageBoxSync = function (a, b) { const o = (b || a) || {}; dialogosVistos.push(String(o.title || o.message || '')); return 0; };
dialog.showOpenDialogSync = function () { return null; };
dialog.showMessageBox = function () { return Promise.resolve({ response: 0 }); };

const log = [];
const tlog = (s) => { const l = '[' + new Date().toISOString() + '] ' + s; log.push(l); try { fs.appendFileSync(path.join(SB, 'vivo.log'), l + '\n'); } catch (e) {} };
let terminado = false;
function salir(extra) {
  if (terminado) return; terminado = true;
  fs.writeFileSync(path.join(SB, 'resultado.json'), JSON.stringify(Object.assign({ modo: MODO, entorno, log }, extra || {}), null, 2));
  app.exit(0);
}
setTimeout(() => salir({ vencidoPorWatchdog: true }), 80000);

const OrigBW = electron.BrowserWindow;
let forzarFalloSeed = false;
const origLoadFile = OrigBW.prototype.loadFile;
OrigBW.prototype.loadFile = function (filePath, opts) {
  if (forzarFalloSeed && /restore-helper\.html$/i.test(String(filePath))) {
    return Promise.reject(new Error('SONDA P26: fallo forzado de restore-helper.html'));
  }
  return origLoadFile.call(this, filePath, opts);
};

const handlers = {};
const origHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = function (canal, fn) { handlers[canal] = fn; return origHandle(canal, fn); };

process.on('unhandledRejection', (e) => tlog('unhandledRejection: ' + String((e && e.message) || e)));
process.on('uncaughtException', (e) => { tlog('uncaughtException: ' + String((e && e.stack) || e)); salir({ crash: true }); });

// ---- Línea de tiempo COMÚN: cada rmSync/unlinkSync/renameSync/writeFileSync
// sobre `Partitions/` o `.panorama-borrados`, cada sesión nueva de Chromium y
// cada ventana nueva. Todos los modos la llevan; solo los observadores PASIVOS
// del arranque real dependen de ella para el orden.
const linea = [];
let seqN = 0;
const marca_ = (tipo, det) => linea.push(Object.assign({ n: ++seqN, tipo }, det));
app.on('session-created', (s) => {
  let p = null;
  try { p = s.getStoragePath(); } catch (e) {}
  marca_('session-created', { storage: p });
});
app.on('browser-window-created', () => marca_('window-created', {}));
const relevante = (p) => typeof p === 'string' && (/[\\/]Partitions[\\/]/.test(p) || /\.panorama-borrados/.test(p));
for (const nombre of ['rmSync', 'unlinkSync', 'renameSync', 'writeFileSync']) {
  const orig = fs[nombre];
  fs[nombre] = function (...a) {
    if (!relevante(a[0]) && !relevante(a[1])) return orig.apply(this, a);
    const destino = (nombre === 'renameSync' && typeof a[1] === 'string') ? a[1] : null;
    try { const r = orig.apply(this, a); marca_('fs', { op: nombre, ruta: String(a[0]), destino, ok: true }); return r; }
    catch (e) { marca_('fs', { op: nombre, ruta: String(a[0]), destino, ok: false, codigo: (e && e.code) || null }); throw e; }
  };
}

// ---- inventario de disco (solo lecturas de fs: no toca Chromium) -------------
function inventario() {
  const partitionsDir = path.join(UD, 'Partitions');
  const carpetas = fs.existsSync(partitionsDir) ? fs.readdirSync(partitionsDir) : [];
  const dirB = path.join(UD, '.panorama-borrados');
  let journals = [];
  try {
    if (fs.existsSync(dirB) && fs.statSync(dirB).isDirectory()) {
      journals = fs.readdirSync(dirB).filter((f) => f.endsWith('.json'))
        .map((f) => { try { return Object.assign({ _archivo: f }, JSON.parse(fs.readFileSync(path.join(dirB, f), 'utf8'))); } catch (e) { return { _archivo: f, _error: String(e) }; } });
    }
  } catch (e) {}
  return { carpetas, journals };
}
const resumenJournal = (j) => ({ tipo: j.tipo, fase: j.fase, particion: j.particion, sinRecursos: j.sinRecursos, recursos: Array.isArray(j.recursos) ? j.recursos.length : null, action_id: j.action_id, _error: j._error });

// ---- Modo `arranque` = ARRANQUE REAL. Solo observadores pasivos: no se crea
// ninguna ventana, no se invoca ningún handler, no se toca ninguna sesión.
let antes = null;
function volcarArranque(porQuit) {
  const { carpetas, journals } = inventario();
  let logRel = [];
  try {
    logRel = fs.readFileSync(path.join(UD, 'app.log')).subarray(antes.logOffset || 0).toString('utf8').split(/\r?\n/)
      .filter((l) => /Borrado|P2[467]|PS-2006|sigue existiendo|no se pudo eliminar|marca de acciones/i.test(l));
  } catch (e) {}
  let filas = null;
  try { filas = require(path.join(PROJ, 'db.js')).all('SELECT id, name, partition_name FROM projects ORDER BY id').map((r) => ({ id: r.id, name: r.name, partition_name: r.partition_name })); } catch (e) {}
  salir({
    porQuit: !!porQuit,
    antes: { carpetas: antes.carpetas, journals: antes.journals.map(resumenJournal) },
    carpetasFinal: carpetas, journalsFinal: journals.map(resumenJournal), filasFinal: filas,
    linea, dialogos: dialogosVistos.slice(), appLogRelevante: logRel,
  });
}
const PROJ = path.resolve(process.env.PANORAMA_PROJ || 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1');
if (MODO === 'arranque') {
  antes = inventario();
  try { antes.logOffset = fs.statSync(path.join(UD, 'app.log')).size; } catch (e) { antes.logOffset = 0; }
  // Si el arranque se cierra a sí mismo (p.ej. PS-2006 por una purga pendiente)
  // el proceso muere sin llegar al sondeo: se vuelca el estado aquí.
  app.on('before-quit', () => volcarArranque(true));
}

require(process.env.PANORAMA_MAIN || path.join(PROJ, 'main.js'));
const dbmod = require(path.join(PROJ, 'db.js'));
// P27: en el arranque, la consulta que hacen el predicado de P26 y la guarda de
// P27 (`SELECT partition_name FROM projects`, texto exacto) LANZA. El resto de la
// BD sigue respondiendo con normalidad, como en un fallo real acotado.
if (MODO === 'arranque' && BD_FALLA) {
  const origAll = dbmod.all;
  dbmod.all = function (sql, params) {
    if (/^\s*SELECT partition_name FROM projects\s*$/i.test(String(sql))) throw new Error('SONDA P27: la consulta a projects falla');
    return origAll.call(this, sql, params);
  };
}

// ---- utilidades de los modos con app en marcha --------------------------------
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const borradosDir = () => path.join(UD, '.panorama-borrados');
const accionesDir = () => path.join(UD, '.panorama-acciones');
const marcaAcciones = () => {
  try {
    const r = dbmod.get('SELECT value FROM app_meta WHERE key=?', ['acciones_' + dbmod.getInstallationId()]);
    return r && r.value ? JSON.parse(r.value) : [];
  } catch (e) { return 'ERROR ' + e.message; }
};
const filasProyectos = () => dbmod.all('SELECT id, name, partition_name FROM projects ORDER BY id').map((r) => ({ id: r.id, name: r.name, partition_name: r.partition_name }));
const corto = (x) => (x && typeof x === 'object') ? { ok: x.ok, aplicado: x.aplicado, bloqueo: x.bloqueo, error: x.error ? String(x.error).slice(0, 110) : undefined } : x;
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const hex = (n) => crypto.randomBytes(n).toString('hex');

let fakeWin = null;
const imp = (t) => JSON.stringify({ state: { projectTitle: t, milestones: [], risks: [], skills: [], team: [], coverage: [], phases: [] }, history: [] });
const crearImp = (t) => handlers['projects:create']({ sender: fakeWin.webContents }, { name: '', client: '', startDate: '', importJson: imp(t) }).then((r) => ({ ok: true, id: r.id }), (e) => ({ ok: false, error: String((e && e.message) || e).slice(0, 90) }));
const crearSin = (n) => handlers['projects:create']({ sender: fakeWin.webContents }, { name: n, client: '', startDate: '' }).then((r) => ({ ok: true, id: r.id }), (e) => ({ ok: false, error: String((e && e.message) || e).slice(0, 90) }));
const guardar = (id) => handlers['backup:save']({ sender: fakeWin.webContents }, { projectId: id, payload: '{}', reason: 'p26' }).catch((e) => ({ excepcion: String((e && e.message) || e) }));
const borrar = (id) => handlers['projects:delete']({ sender: fakeWin.webContents }, id).catch((e) => ({ excepcion: String((e && e.message) || e) }));
const restaurar = (id) => handlers['backup:restore']({ sender: fakeWin.webContents }, { projectId: id, backupId: null }).catch((e) => ({ excepcion: String((e && e.message) || e) }));

// Deja el estado de un import fallido: un proyecto bueno, un journal P24 en
// `purgando` y la carpeta de la partición en disco (EBUSY en esta sesión).
async function prepararImportFallido() {
  forzarFalloSeed = false;
  const bueno = await crearImp('P26 proyecto bueno');
  const previo = await guardar(bueno.id); // un backup real, para poder restaurar después
  // El id que tendrá la fila del import fallido (todavía no existe): el siguiente.
  const idFallido = ((dbmod.get('SELECT COALESCE(MAX(id), 0) AS m FROM projects') || {}).m || 0) + 1;
  forzarFalloSeed = true;
  const malo = await crearImp('P26 proyecto malo');
  forzarFalloSeed = false;
  await dormir(600);
  const js = inventario().journals.filter((j) => j.tipo === 'rollback-creacion-proyecto');
  const jp = js.length === 1 ? js[0] : null;
  const nombre = jp && jp.particion ? String(jp.particion).replace(/^persist:/, '') : null;
  const dirPart = nombre ? path.join(app.getPath('sessionData'), 'Partitions', nombre) : null;
  return { bueno, previo: corto(previo), malo, idFallido, jp, nombre, dirPart, jfile: jp ? path.join(borradosDir(), jp._archivo) : null };
}

// Cada guardado del proyecto bueno empuja UN id a la marca circular de 8. Se
// repite hasta que el id de la acción P24 salga (máx. 12) y se hacen `extra`
// más después, para dejar la marca sin ninguna huella de esa acción.
async function agotarMarca(idBueno, idP24, extra) {
  const pasos = [];
  for (let i = 0; i < 12; i++) {
    const m = marcaAcciones();
    if (Array.isArray(m) && !m.includes(idP24)) break;
    const r = corto(await guardar(idBueno));
    pasos.push({ i: i + 1, aplicado: r && r.aplicado === true, bloqueo: r && r.bloqueo });
  }
  for (let i = 0; i < extra; i++) {
    const r = corto(await guardar(idBueno));
    pasos.push({ i: 'extra' + (i + 1), aplicado: r && r.aplicado === true, bloqueo: r && r.bloqueo });
  }
  return pasos;
}

// ---- journals fabricados (sin tocar producto) ----------------------------------
function journalP24(over) {
  return Object.assign({
    v: 1, action_id: hex(16), writer: dbmod.getInstallationId(), tipo: 'rollback-creacion-proyecto',
    base_commit_id: '0'.repeat(32), fase: 'purgando', startedAt: new Date().toISOString(),
    recursos: [], sinRecursos: true, particion: 'persist:proj-1700000000001-abc001',
  }, over || {});
}
function escribirJournal(j) {
  fs.mkdirSync(borradosDir(), { recursive: true });
  const f = path.join(borradosDir(), j.action_id + '.json');
  fs.writeFileSync(f, JSON.stringify(j), 'utf8');
  return f;
}
function insertarFilaConParticion(particion, id) {
  const now = new Date().toISOString();
  if (id) { dbmod.run('INSERT INTO projects(id, name, client, partition_name, created_at, updated_at) VALUES (?,?,?,?,?,?)', [id, 'P26 fila con la partición', '', particion, now, now]); return id; }
  return dbmod.run('INSERT INTO projects(name, client, partition_name, created_at, updated_at) VALUES (?,?,?,?,?)', ['P26 fila con la partición', '', particion, now, now]);
}

app.whenReady().then(async () => {
  if (MODO === 'arranque') {
    // ARRANQUE REAL: aquí NO se crea ninguna ventana ni se toca ninguna sesión.
    // Se espera a que el propio arranque de main.js consuma el material pendiente
    // (hasta --espera= ms, 12 s por defecto) y se le deja seguir 2,5 s más (login,
    // migración, inventario, lanzador) para ver si algo posterior vuelve a tocar
    // la partición.
    const espera = Number(arg('--espera=') || 12000);
    const t0 = Date.now();
    while (Date.now() - t0 < espera) {
      if (inventario().journals.length === 0) break;
      await dormir(100);
    }
    await dormir(2500);
    return volcarArranque(false);
  }

  await dormir(1500);
  fakeWin = new OrigBW({ show: false, webPreferences: { partition: 'persist:sonda-fake-sender' } });
  await fakeWin.loadURL('data:text/html,ok');

  // =========================================================================
  if (MODO === 'ajenas') {
    const P = await prepararImportFallido();
    if (!P.jp) return salir({ error: 'no se dejó exactamente un journal P24', journals: inventario().journals.map(resumenJournal) });
    const idP24 = P.jp.action_id;
    const hash0 = sha(P.jfile); const mt0 = fs.statSync(P.jfile).mtimeMs;
    const t0 = linea.length;
    const inicial = {
      journal: resumenJournal(P.jp), marcaContieneIdP24: (marcaAcciones() || []).includes(idP24),
      filaConLaParticion: filasProyectos().some((f) => f.partition_name === P.jp.particion),
      carpetaExiste: fs.existsSync(P.dirPart), importMalo: P.malo,
    };
    // ---- operaciones AJENAS, con la marca todavía conteniendo el id de P24 ----
    const A = {};
    A.backupOtro = corto(await guardar(P.bueno.id));
    A.crearSinImport = await crearSin('P26 otro sin import');
    A.crearConImportValido = await crearImp('P26 otro con import');
    A.borrarOtro = A.crearSinImport.ok ? corto(await borrar(A.crearSinImport.id)) : null;
    A.restaurarOtro = corto(await restaurar(P.bueno.id));
    A.backupTrasRestaurar = corto(await guardar(P.bueno.id));
    const marcaAntesDeAgotar = { contieneIdP24: (marcaAcciones() || []).includes(idP24) };
    // ---- agotar la marca de 8 acciones ----------------------------------------
    const pasos = await agotarMarca(P.bueno.id, idP24, 2);
    const marcaFinal = marcaAcciones();
    // ---- lo que NO puede haber cambiado -----------------------------------------
    const evP24 = linea.slice(t0).filter((e) => e.tipo === 'fs' && ((e.ruta || '').toLowerCase().includes(P.nombre.toLowerCase()) || (e.destino || '').toLowerCase().includes(P.nombre.toLowerCase())
      || (e.ruta || '').includes(idP24) || (e.destino || '').includes(idP24)));
    return salir({
      inicial, ajenas: A, marcaAntesDeAgotar, pasosAgotarMarca: pasos,
      marcaFinal: { longitud: Array.isArray(marcaFinal) ? marcaFinal.length : marcaFinal, contieneIdP24: Array.isArray(marcaFinal) ? marcaFinal.includes(idP24) : null },
      journalIntacto: sha(P.jfile) === hash0 && fs.statSync(P.jfile).mtimeMs === mt0,
      carpetaExisteAlFinal: fs.existsSync(P.dirPart),
      eventosSobreLaPendiente: evP24,
      filaConLaParticionAlFinal: filasProyectos().some((f) => f.partition_name === P.jp.particion),
      journalsFinal: inventario().journals.map(resumenJournal), carpetasFinal: inventario().carpetas,
      nombre: P.nombre, idP24,
    });
  }

  // =========================================================================
  if (MODO === 'prep') {
    const P = await prepararImportFallido();
    if (!P.jp) return salir({ error: 'no se dejó exactamente un journal P24', journals: inventario().journals.map(resumenJournal) });
    const idP24 = P.jp.action_id;
    const inicial = {
      journal: resumenJournal(P.jp), marcaContieneIdP24: (marcaAcciones() || []).includes(idP24),
      filaConLaParticion: filasProyectos().some((f) => f.partition_name === P.jp.particion),
      carpetaExiste: fs.existsSync(P.dirPart), importMalo: P.malo,
    };
    let pasos = [];
    if (N_EXTRA > 0) pasos = await agotarMarca(P.bueno.id, idP24, N_EXTRA - 1);
    const out = { inicial, pasosAgotarMarca: pasos, marcaContieneIdP24: (marcaAcciones() || []).includes(idP24), nombre: P.nombre, idP24, particion: P.jp.particion, idFallido: P.idFallido };
    if (FASE_RETIRANDO) {
      // P27: el journal en disco vuelve a `retirando` (con la marca todavía con su
      // id): el predicado de P26 no lo reconoce y la recuperación va por el CASO B
      // histórico. `finalizarPurga` lo reescribe a `purgando` antes de purgar.
      const j = JSON.parse(fs.readFileSync(P.jfile, 'utf8'));
      j.fase = 'retirando';
      fs.writeFileSync(P.jfile, JSON.stringify(j), 'utf8');
      out.faseReescrita = 'retirando';
    }
    if (CON_FILA) {
      // Una fila reaparece con la MISMA partición (da igual por qué). F-1 tiene
      // que volver a bloquear ESTA sesión. `--fila-id=mismo`: con el id de la
      // fila fallida (una imagen antigua de la BD); si no, con otro.
      out.filaIdModo = FILA_ID;
      out.filaInsertada = insertarFilaConParticion(P.jp.particion, FILA_ID === 'mismo' ? P.idFallido : null);
      out.guardadoConFila = corto(await guardar(P.bueno.id));
      out.borrarConFila = corto(await borrar(P.bueno.id));
    }
    out.journalsFinal = inventario().journals.map(resumenJournal);
    out.carpetaExisteAlFinal = fs.existsSync(P.dirPart);
    return salir(out);
  }

  // =========================================================================
  if (MODO === 'dos-fallos') {
    // Un SEGUNDO import fallido mientras el primer journal P24 sigue pendiente.
    // Antes de P26 la segunda limpieza se saltaba (F-1 ocupado por el primero) y
    // la fila se quedaba visible; ahora F-1 está libre y el rollback se hace.
    const P = await prepararImportFallido();
    if (!P.jp) return salir({ error: 'no se dejó exactamente un journal P24', journals: inventario().journals.map(resumenJournal) });
    forzarFalloSeed = true;
    const malo2 = await crearImp('P26 proyecto malo 2');
    forzarFalloSeed = false;
    await dormir(600);
    const js = inventario().journals.filter((j) => j.tipo === 'rollback-creacion-proyecto');
    const guardado = corto(await guardar(P.bueno.id));
    return salir({
      primero: P.malo, segundo: malo2, guardadoTrasElSegundo: guardado,
      journals: js.map(resumenJournal),
      filaConAlgunaParticion: js.some((j) => filasProyectos().some((f) => f.partition_name === j.particion)),
      carpetasExisten: js.map((j) => fs.existsSync(path.join(app.getPath('sessionData'), 'Partitions', String(j.particion).replace(/^persist:/, '')))),
      filasProyectos: filasProyectos().map((f) => f.name),
    });
  }

  // =========================================================================
  if (MODO === 'negativas') {
    const bueno = await crearImp('P26 proyecto bueno');
    const R = { bueno };
    // Cada caso: se monta el material, se INTENTA un guardado (por `f1Borrados`)
    // y, en los que importan, un borrado (por `f1Global`), y se desmonta.
    const caso = async (nombre, montar, opts) => {
      const o = opts || {};
      const m = montar();
      let otro = null;
      if (o.conBorrado) { const c = await crearSin('P26 desechable ' + nombre); otro = c.ok ? c.id : null; }
      // `sinGuardado`: un guardado RESUELVE los journals de acción propios (no
      // solo los mira), así que en N8 consumiría el material antes del borrado.
      const g = o.sinGuardado ? null : corto(await guardar(bueno.id));
      const b = otro ? corto(await borrar(otro)) : null;
      R[nombre] = { guardado: g, borrado: b };
      if (m && m.desmontar) m.desmontar();
      if (otro && !(b && b.aplicado)) { try { dbmod.run('DELETE FROM projects WHERE id=?', [otro]); } catch (e) {} }
    };
    const soloJournal = (j) => { const f = escribirJournal(j); return { desmontar: () => { try { fs.unlinkSync(f); } catch (e) {} } }; };
    const conFila = (j, extraDesmontar) => {
      const f = escribirJournal(j);
      const id = insertarFilaConParticion(j.particion);
      return { desmontar: () => { try { fs.unlinkSync(f); } catch (e) {} try { dbmod.run('DELETE FROM projects WHERE id=?', [id]); } catch (e) {} if (extraDesmontar) extraDesmontar(); } };
    };
    const recursoArchivo = (j) => ({ tipo: 'archivo', scope: 'archivo', origen: path.join(SB, 'nada.txt'), cuarentena: path.join(borradosDir(), j.action_id, 'r0'), sha256: '0'.repeat(64), size: 0 });
    const recursoDir = (j) => ({ tipo: 'directorio', scope: 'subtree', origen: path.join(SB, 'dir-origen'), cuarentena: path.join(borradosDir(), j.action_id, 'r0'), n_archivos: 1, bytes_totales: 1 });

    // CONTROL POSITIVO: el único estado que NO bloquea (guardado Y borrado).
    await caso('CTRL-p24-purgando-sin-fila', () => soloJournal(journalP24()), { conBorrado: true });
    // NEGATIVAS (siguen bloqueando):
    await caso('N1-p24-retirando', () => soloJournal(journalP24({ fase: 'retirando' })), { conBorrado: true });
    await caso('N2-p24-purgando-con-fila', () => conFila(journalP24()), { conBorrado: true });
    await caso('N3-p24-purgando-con-recursos', () => { const j = journalP24(); j.recursos = [recursoArchivo(j)]; return soloJournal(j); });
    await caso('N4-p24-sin-sinRecursos', () => soloJournal(journalP24({ sinRecursos: undefined })));
    await caso('N6-journal-no-demostrable', () => { const f = path.join(borradosDir(), hex(16) + '.json'); fs.mkdirSync(borradosDir(), { recursive: true }); fs.writeFileSync(f, '{"v":1,"action_id":', 'utf8'); return { desmontar: () => { try { fs.unlinkSync(f); } catch (e) {} } }; });
    await caso('N7-borrar-proyecto-pendiente', () => { const j = journalP24({ tipo: 'borrar-proyecto', sinRecursos: undefined }); j.recursos = [recursoDir(j), recursoDir(j)]; j.recursos[1].cuarentena = path.join(borradosDir(), j.action_id, 'r1'); return soloJournal(j); }, { conBorrado: true });
    await caso('N7b-purgar-backups-sinRecursos-con-particion', () => soloJournal(journalP24({ tipo: 'purgar-backups' })));
    await caso('N7c-borrar-prep-sinRecursos-con-particion', () => soloJournal(journalP24({ tipo: 'borrar-prep' })));
    await caso('N9-p24-purgando-particion-sin-forma', () => soloJournal(journalP24({ particion: 'persist:sonda-forma-invalida' })));
    await caso('N9b-p24-purgando-particion-travesia', () => soloJournal(journalP24({ particion: 'persist:..\\..\\x' })));
    await caso('N10-p24-ajeno', () => soloJournal(journalP24({ writer: 'f'.repeat(32) })));
    // N8: una ACCIÓN propia pendiente (journal válido en `.panorama-acciones`)
    // bloquea los BORRADOS (`f1Global`), como siempre.
    await caso('N8-accion-propia-pendiente', () => {
      fs.mkdirSync(accionesDir(), { recursive: true });
      const id = hex(16);
      const f = path.join(accionesDir(), id + '.json');
      fs.writeFileSync(f, JSON.stringify({
        v: 1, action_id: id, writer: dbmod.getInstallationId(), tipo: 'backup', base_commit_id: '0'.repeat(32), cifrado: 0,
        destino: path.join(SB, 'destino-inexistente.json'), modo: 'nuevo', new_sha256: '0'.repeat(64), new_size: 0,
        fase: 'publicando', startedAt: new Date().toISOString(), original_sha256: null, original_size: 0,
      }), 'utf8');
      return { desmontar: () => { try { fs.unlinkSync(f); } catch (e) {} } };
    }, { conBorrado: true, sinGuardado: true });

    // N5: la BD no puede contestar la consulta del predicado -> falla cerrado.
    const origAll = dbmod.all;
    const consultaDelPredicado = (sql) => /partition_name\s+FROM\s+projects\s*$/i.test(String(sql));
    dbmod.all = function (sql, params) { if (consultaDelPredicado(sql)) throw new Error('SONDA P26: la consulta a projects falla'); return origAll.call(this, sql, params); };
    await caso('N5-consulta-falla', () => soloJournal(journalP24()), { conBorrado: true });
    dbmod.all = function (sql, params) { if (consultaDelPredicado(sql)) return { no: 'es una lista' }; return origAll.call(this, sql, params); };
    await caso('N5b-consulta-ambigua', () => soloJournal(journalP24()));
    dbmod.all = origAll;

    R.journalsResiduales = inventario().journals.map(resumenJournal);
    return salir(R);
  }

  // =========================================================================
  if (MODO === 'prep-malformado') {
    // P27: una partición VIVA (fila + carpeta con un centinela) y un journal de
    // rollback MALFORMADO (JSON truncado) que la cita. La recuperación no puede
    // interpretarlo: ni lo resuelve ni toca nada — y desde luego no la carpeta.
    await crearImp('P26 proyecto bueno');
    const particion = 'persist:proj-1700000000003-mal003';
    const carpeta = path.join(app.getPath('sessionData'), 'Partitions', 'proj-1700000000003-mal003');
    fs.mkdirSync(carpeta, { recursive: true });
    fs.writeFileSync(path.join(carpeta, 'centinela-viva.txt'), 'partición viva: no debe desaparecer', 'utf8');
    const filaId = insertarFilaConParticion(particion);
    fs.mkdirSync(borradosDir(), { recursive: true });
    const archivo = hex(16) + '.json';
    fs.writeFileSync(path.join(borradosDir(), archivo),
      '{"v":1,"action_id":"' + archivo.replace(/\.json$/, '') + '","tipo":"rollback-creacion-proyecto","fase":"purgando","particion":"' + particion, 'utf8');
    return salir({ particion, carpeta, filaId, archivo });
  }

  // =========================================================================
  if (MODO === 'prep-borrar-proyecto') {
    // Un borrar-proyecto REAL, propio, ya en `purgando`, con su material
    // apartado en cuarentena y el origen ausente; la marca NO contiene su id.
    const bueno = await crearImp('P26 proyecto bueno');
    const actionId = hex(16);
    const origen = path.join(SB, 'material-borrado');
    const cuarentena = path.join(borradosDir(), actionId, 'r0');
    fs.mkdirSync(cuarentena, { recursive: true });
    const texto = 'material que un borrar-proyecto sin confirmar tiene que devolver';
    fs.writeFileSync(path.join(cuarentena, 'dato.txt'), texto, 'utf8');
    const j = {
      v: 1, action_id: actionId, writer: dbmod.getInstallationId(), tipo: 'borrar-proyecto', base_commit_id: '0'.repeat(32),
      fase: 'purgando', startedAt: new Date().toISOString(),
      recursos: [{ tipo: 'directorio', scope: 'subtree', origen, cuarentena, n_archivos: 1, bytes_totales: Buffer.byteLength(texto) }],
      particion: 'persist:proj-1700000000009-zzz009',
    };
    const f = escribirJournal(j);
    const marca = marcaAcciones();
    const g = corto(await guardar(bueno.id)); // F-1 bloquea: es un borrar-proyecto, no P24
    return salir({
      actionId, origen, cuarentena, journalEscrito: fs.existsSync(f),
      marcaContieneId: Array.isArray(marca) ? marca.includes(actionId) : null,
      guardadoConElPendiente: g,
      filaConLaParticion: filasProyectos().some((r) => r.partition_name === j.particion),
    });
  }

  salir({ error: 'modo desconocido: ' + MODO });
});
