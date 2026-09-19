// ---------------------------------------------------------------------------
// P24 — ROLLBACK DE PARTICIÓN EN CREACIÓN FALLIDA. Batería sobre la app REAL
// (Electron real, main.js sin modificar), en sandbox aislado.
//
// Por qué Electron real y no extracción por firma (como 8A/P9/P22): P24
// depende de comportamiento genuino de Chromium (materialización de una
// partición al construir una BrowserWindow, EBUSY de un rmSync en la misma
// sesión, y su ausencia en un proceso nuevo) que ningún doble puede simular
// de forma fiel — ya se demostró en la ronda de validación que corregir esto
// exigió reproducirlo de verdad, dos veces, antes de dar con el mecanismo que
// funciona.
//
// Modos, cada uno su propio proceso Electron (aislamiento real entre pruebas):
//   --modo=normal-import       creación con importación válida, sin fallos.
//   --modo=normal-sin-import   creación sin importación: P24 no debe intervenir.
//   --modo=seed-falla          fuerza el fallo de seedNewProjectStorage.
//   --modo=f1-ocupado          fabrica un journal PROPIO pendiente de otro
//                              tipo antes de forzar el fallo de seed.
//   --modo=journal-no-escribible  bloquea `.panorama-borrados` con un archivo
//                              regular en su lugar, antes de forzar el fallo.
//   --modo=otro-proyecto-intacto  crea un proyecto real primero, luego fuerza
//                              el fallo de un segundo; comprueba que el
//                              primero no se toca.
//   --modo=reintento           arranque normal sobre un sandbox que ya trae
//                              un journal 'rollback-creacion-proyecto'
//                              pendiente (dejado por --modo=seed-falla).
//
// Cada modo escribe `resultado.json` en su sandbox; el driver
// (comprobar-p24.js) los interpreta y hace las aserciones ok()/FALLO.
// ---------------------------------------------------------------------------
'use strict';
const electron = require('electron');
const { app, ipcMain, dialog } = electron;
const path = require('path');
const fs = require('fs');

// Los diálogos nativos se contestan solos y se REGISTRAN (título): en el modo
// `reintento` importa saber si el arranque llegó a mostrar «Un borrado
// anterior quedó sin resolver» (PS-2006), que es lo que hace un purga pendiente.
const dialogosVistos = [];
dialog.showMessageBoxSync = function (a, b) { const o = (b || a) || {}; dialogosVistos.push(String(o.title || o.message || '')); return 0; };
dialog.showOpenDialogSync = function () { return null; };
dialog.showMessageBox = function () { return Promise.resolve({ response: 0 }); };

const arg = (pref) => { const a = process.argv.find((x) => x.startsWith(pref)); return a ? a.slice(pref.length) : null; };
const SB = arg('--sandbox=');
const MODO = arg('--modo=');
if (!SB || !/_a33-p24/i.test(SB)) { console.error('sandbox no marcado'); process.exit(2); }
if (!MODO) { console.error('falta --modo='); process.exit(2); }

const UD = path.join(SB, 'userdata');
fs.mkdirSync(UD, { recursive: true });
app.setPath('appData', path.join(SB, 'appdata'));
app.setPath('userData', UD);
// Custodia: `driveSyncGuardDataDir()` lee process.env.LOCALAPPDATA. Sin esto el
// arranque de main.js en sandbox miraría la protección de apagado REAL de la
// máquina (enabled.flag/Run/tarea). Se redirige a una carpeta del sandbox.
process.env.LOCALAPPDATA = path.join(SB, 'localappdata');
process.env.APPDATA = path.join(SB, 'appdata');
fs.mkdirSync(process.env.LOCALAPPDATA, { recursive: true });

const log = [];
const tlog = (s) => { const l = '[' + new Date().toISOString() + '] ' + s; log.push(l); try { fs.appendFileSync(path.join(SB, 'vivo.log'), l + '\n'); } catch (e) {} };
let terminado = false;
function salir(extra) {
  if (terminado) return; terminado = true;
  fs.writeFileSync(path.join(SB, 'resultado.json'), JSON.stringify(Object.assign({ modo: MODO, log }, extra || {}), null, 2));
  app.exit(0);
}
setTimeout(() => salir({ vencidoPorWatchdog: true }), 28000);

const OrigBW = electron.BrowserWindow;
let forzarFalloSeed = false;
const origLoadFile = OrigBW.prototype.loadFile;
OrigBW.prototype.loadFile = function (filePath, opts) {
  if (forzarFalloSeed && /restore-helper\.html$/i.test(String(filePath))) {
    return Promise.reject(new Error('SONDA P24: fallo forzado de restore-helper.html'));
  }
  return origLoadFile.call(this, filePath, opts);
};

const handlers = {};
const origHandle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = function (canal, fn) { handlers[canal] = fn; return origHandle(canal, fn); };

process.on('unhandledRejection', (e) => tlog('unhandledRejection: ' + String((e && e.message) || e)));
process.on('uncaughtException', (e) => { tlog('uncaughtException: ' + String((e && e.stack) || e)); salir({ crash: true }); });

// --- fabricar un journal PROPIO pendiente de otro tipo, ANTES de que main.js
// arranque, para el modo f1-ocupado. Usa el mismo installation-id real que
// dbmod calculará (basado en machine+user, estable) -- se calcula tras cargar
// main.js (ver más abajo) porque dbmod solo existe una vez cargado.
function fabricarJournalAjenoPendiente(writer) {
  const dir = path.join(UD, '.panorama-borrados');
  fs.mkdirSync(dir, { recursive: true });
  const actionId = require('crypto').randomBytes(16).toString('hex');
  const journal = {
    v: 1, action_id: actionId, writer, tipo: 'borrar-prep',
    base_commit_id: '0'.repeat(32), fase: 'retirando', startedAt: new Date().toISOString(),
    recursos: [{ tipo: 'archivo', scope: 'archivo', origen: path.join(SB, 'nada.txt'), cuarentena: path.join(dir, actionId, 'r0'), sha256: '0'.repeat(64), size: 0 }],
  };
  fs.writeFileSync(path.join(dir, actionId + '.json'), JSON.stringify(journal), 'utf8');
  return actionId;
}

// --- bloquear `.panorama-borrados` con un ARCHIVO regular en su lugar, para
// que mkdirSync falle dentro de ejecutarBorrado (journal no escribible). ---
function bloquearCarpetaBorrados() {
  const dir = path.join(UD, '.panorama-borrados');
  fs.mkdirSync(UD, { recursive: true });
  fs.writeFileSync(dir, 'bloqueo a propósito, no es un directorio', 'utf8');
}

// ---- Modo `reintento` = ARRANQUE REAL. Solo observadores PASIVOS, instalados
// antes de cargar main.js: no se crea ninguna ventana, no se invoca ningún
// handler, no se toca ninguna sesión. Se registra, en UNA secuencia común, cada
// sesión nueva de Chromium (con su carpeta), cada ventana nueva y cada
// rmSync/unlinkSync/renameSync sobre `Partitions/` o `.panorama-borrados`.
const linea = [];
let seqN = 0;
const marca = (tipo, det) => linea.push(Object.assign({ n: ++seqN, tipo }, det));
let antes = null;
function volcarReintento(porQuit) {
  const { carpetas, journals } = inventario();
  let logRel = [];
  try {
    // Solo lo que escribió ESTE arranque (app.log acumula el del proceso anterior).
    logRel = fs.readFileSync(path.join(UD, 'app.log')).subarray(antes.logOffset || 0).toString('utf8').split(/\r?\n/)
      .filter((l) => /Borrado|P24|PS-2006|sigue existiendo|no se pudo eliminar/i.test(l));
  } catch (e) {}
  salir({
    porQuit: !!porQuit,
    antes: { carpetas: antes.carpetas, journals: antes.journals.map((j) => ({ tipo: j.tipo, particion: j.particion, fase: j.fase, sinRecursos: j.sinRecursos })) },
    carpetasFinal: carpetas,
    journalsFinal: journals.map((j) => ({ tipo: j.tipo, particion: j.particion })),
    linea, dialogos: dialogosVistos.slice(), appLogRelevante: logRel,
  });
}
if (MODO === 'reintento') {
  antes = inventario(); // solo lecturas de fs: no toca Chromium
  try { antes.logOffset = fs.statSync(path.join(UD, 'app.log')).size; } catch (e) { antes.logOffset = 0; }
  app.on('session-created', (s) => {
    let p = null;
    try { p = s.getStoragePath(); } catch (e) {}
    marca('session-created', { storage: p });
  });
  app.on('browser-window-created', () => marca('window-created', {}));
  const relevante = (p) => typeof p === 'string' && (/[\\/]Partitions[\\/]/.test(p) || /\.panorama-borrados/.test(p));
  for (const nombre of ['rmSync', 'unlinkSync', 'renameSync']) {
    const orig = fs[nombre];
    fs[nombre] = function (...a) {
      if (!relevante(a[0]) && !relevante(a[1])) return orig.apply(this, a);
      const destino = typeof a[1] === 'string' ? a[1] : null;
      try { const r = orig.apply(this, a); marca('fs', { op: nombre, ruta: String(a[0]), destino, ok: true }); return r; }
      catch (e) { marca('fs', { op: nombre, ruta: String(a[0]), destino, ok: false, codigo: (e && e.code) || null }); throw e; }
    };
  }
  // Si el arranque se cierra a sí mismo (p.ej. PS-2006 por una purga pendiente)
  // el proceso muere sin llegar al sondeo: se vuelca el estado aquí.
  app.on('before-quit', () => volcarReintento(true));
}

require(process.env.PANORAMA_MAIN || 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1\\main.js');

async function crearConImport(fakeWin, titulo) {
  const importJson = JSON.stringify({
    state: { projectTitle: titulo, milestones: [], risks: [], skills: [], team: [], coverage: [], phases: [] },
    history: [],
  });
  try {
    const r = await handlers['projects:create']({ sender: fakeWin.webContents }, { name: '', client: '', startDate: '', importJson });
    return { ok: true, row: r };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

function inventario() {
  const partitionsDir = path.join(UD, 'Partitions');
  const carpetas = fs.existsSync(partitionsDir) ? fs.readdirSync(partitionsDir) : [];
  const borradosDir = path.join(UD, '.panorama-borrados');
  let journals = [];
  try {
    if (fs.existsSync(borradosDir) && fs.statSync(borradosDir).isDirectory()) {
      journals = fs.readdirSync(borradosDir).filter((f) => f.endsWith('.json'))
        .map((f) => { try { return JSON.parse(fs.readFileSync(path.join(borradosDir, f), 'utf8')); } catch (e) { return { _error: String(e) }; } });
    }
  } catch (e) {}
  return { carpetas, journals };
}

app.whenReady().then(async () => {
  if (MODO === 'reintento') {
    // ARRANQUE REAL: aquí NO se crea ninguna ventana ni se toca ninguna sesión.
    // Se espera a que el propio arranque de main.js consuma el journal (hasta
    // 20 s) y se le deja seguir 2,5 s más (login, migración, inventario,
    // lanzador) para ver si algo posterior vuelve a tocar la partición.
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      const { journals } = inventario();
      if (!journals.some((j) => j.tipo === 'rollback-creacion-proyecto')) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    await new Promise((r) => setTimeout(r, 2500));
    return volcarReintento(false);
  }

  await new Promise((r) => setTimeout(r, 1500));
  const fakeWin = new OrigBW({ show: false, webPreferences: { partition: 'persist:sonda-fake-sender' } });
  await fakeWin.loadURL('data:text/html,ok');

  if (MODO === 'normal-import') {
    forzarFalloSeed = false;
    const r = await crearConImport(fakeWin, 'P24 normal con import');
    const lista = await handlers['projects:list']();
    const { carpetas, journals } = inventario();
    return salir({ creacion: r, lista: lista.map((p) => p.name), carpetas, journalsRollback: journals.filter((j) => j.tipo === 'rollback-creacion-proyecto').length });
  }

  if (MODO === 'normal-sin-import') {
    const r = await handlers['projects:create']({ sender: fakeWin.webContents }, { name: 'P24 sin import', client: '', startDate: '' }).then((row) => ({ ok: true, row })).catch((e) => ({ ok: false, error: String(e.message || e) }));
    const { carpetas, journals } = inventario();
    return salir({ creacion: r, carpetas, journalsRollback: journals.filter((j) => j.tipo === 'rollback-creacion-proyecto').length });
  }

  if (MODO === 'seed-falla') {
    forzarFalloSeed = true;
    const r = await crearConImport(fakeWin, 'P24 seed falla');
    await new Promise((res) => setTimeout(res, 800));
    const lista = await handlers['projects:list']();
    const { carpetas, journals } = inventario();
    return salir({
      creacion: r,
      listaTrasElFallo: lista.map((p) => p.name),
      huerfanaEnDisco: carpetas.find((c) => /^proj-/.test(c)) || null,
      journalsRollback: journals.filter((j) => j.tipo === 'rollback-creacion-proyecto').map((j) => ({ particion: j.particion, fase: j.fase, sinRecursos: j.sinRecursos })),
    });
  }

  if (MODO === 'f1-ocupado') {
    const dbModule = require('C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1\\db.js');
    fabricarJournalAjenoPendiente(dbModule.getInstallationId());
    forzarFalloSeed = true;
    const r = await crearConImport(fakeWin, 'P24 f1 ocupado');
    await new Promise((res) => setTimeout(res, 1200)); // cubre los 600ms de reintento acotado
    const lista = await handlers['projects:list']();
    const { carpetas, journals } = inventario();
    return salir({
      creacion: r,
      filaConservada: lista.some((p) => p.name === 'P24 f1 ocupado'),
      huerfanaEnDisco: carpetas.find((c) => /^proj-/.test(c)) || null,
      journalsRollback: journals.filter((j) => j.tipo === 'rollback-creacion-proyecto').length,
    });
  }

  if (MODO === 'journal-no-escribible') {
    bloquearCarpetaBorrados();
    forzarFalloSeed = true;
    const r = await crearConImport(fakeWin, 'P24 journal no escribible');
    await new Promise((res) => setTimeout(res, 300));
    const lista = await handlers['projects:list']();
    return salir({
      creacion: r,
      filaConservada: lista.some((p) => p.name === 'P24 journal no escribible'),
    });
  }

  if (MODO === 'otro-proyecto-intacto') {
    forzarFalloSeed = false;
    const bueno = await crearConImport(fakeWin, 'P24 proyecto bueno');
    forzarFalloSeed = true;
    const malo = await crearConImport(fakeWin, 'P24 proyecto malo');
    await new Promise((res) => setTimeout(res, 800));
    const lista = await handlers['projects:list']();
    return salir({
      bueno, malo,
      buenoSigueEnLista: lista.some((p) => p.name === 'P24 proyecto bueno'),
      maloNoEstaEnLista: !lista.some((p) => p.name === 'P24 proyecto malo'),
      totalEnLista: lista.length,
    });
  }

  salir({ error: 'modo desconocido: ' + MODO });
});
