// ---------------------------------------------------------------------------
// A2 — ARRANQUES ELECTRON REALES de RESTAURACION, en sandbox artificial.
//
// Mismo envoltorio de aislamiento que b5.js: appData/userData se redirigen a la
// carpeta de sandbox ANTES de cargar main.js, asi que la app real no encuentra
// el location.json del usuario y nunca apunta a G:.
//
// Cubre lo que a2-restore-bajo-a33.md §8.1 dejaba fuera del arnes integrado:
//   1. el BrowserWindow oculto de verdad (loadFile + executeJavaScript reales)
//   2. el localStorage de Chromium: LevelDB en disco y corte del proceso
//   3. el cierre real de las tres ventanas, con sus renderers
//   4. el tope de 8 s con una ventana que de verdad se niega (beforeunload)
//   5. la recuperacion al arrancar
//   6. la reapertura real
//   7. el rekey real con material pendiente
// ---------------------------------------------------------------------------
const { app, BrowserWindow, dialog, session, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const arg = process.argv.find((a) => a.startsWith('--sandbox='));
if (!arg) { console.error('falta --sandbox='); process.exit(2); }
const SB = arg.slice('--sandbox='.length);
const MODO = (process.argv.find((a) => a.startsWith('--modo=')) || '--modo=nada').slice(7);
const MAIN_ARG = (process.argv.find((a) => a.startsWith('--main=')) || '').slice(7);

// FAIL-CLOSED sobre el propio sandbox. Si llega troceado por espacios (paso con
// una ruta bajo "C:\Codigo Fuente PS\"), el arnes escribiria su log en una
// carpeta inexistente y, como tlog() traga el error, la prueba parecia no
// arrancar nunca. Mejor morir aqui y decirlo.
if (!fs.existsSync(SB)) { console.error('sandbox inexistente (argumento troceado?): ' + SB); process.exit(2); }
if (SB.toLowerCase().indexOf('_a33-') < 0) { console.error('el sandbox no lleva marca de pruebas: ' + SB); process.exit(2); }
if (SB.toLowerCase().indexOf('bd-panoramaservicio') >= 0) { console.error('sandbox dentro de la BD viva: ' + SB); process.exit(2); }
try { fs.writeFileSync(path.join(SB, '.escritura-ok'), 'x', 'utf8'); } catch (e) {
  console.error('el sandbox no es escribible: ' + SB); process.exit(2);
}

app.setPath('appData', path.join(SB, 'Roaming'));
app.setPath('userData', path.join(SB, 'Roaming', 'panorama-app'));
const UD = path.join(SB, 'Roaming', 'panorama-app');
const PROJDIR = 'C:/Codigo Fuente PS/panorama-app-codigo-fuente_1';

function tlog(s) { try { fs.appendFileSync(path.join(SB, 'test.log'), `[${new Date().toISOString()}] ${s}\n`); } catch (e) {} }
tlog('ARRANQUE del arnes  modo=' + MODO + '  sandbox=' + SB + '  main=' + (MAIN_ARG || '(real)'));
process.on('exit', (c) => tlog('process exit code=' + c));
process.on('uncaughtException', (e) => tlog('UNCAUGHT: ' + String((e && e.stack) || e)));
function ok(n, c, extra) { tlog((c ? 'OK    ' : 'FALLO ') + n + (c ? '' : '  -- ' + (extra === undefined ? '' : extra))); }
function info(s) { tlog('      ' + s); }

// Se guardan los handlers reales al registrarse, para poder invocarlos desde el
// proceso principal sin fabricar una ventana con su preload (lo usa RA-6 con
// `security-win:submit`). No cambia su comportamiento: solo los referencia.
const handlers = {};
const llamadasIPC = {};
const handleOrig = ipcMain.handle.bind(ipcMain);
ipcMain.handle = function (canal, fn) {
  handlers[canal] = fn;
  return handleOrig(canal, function () {
    llamadasIPC[canal] = (llamadasIPC[canal] || 0) + 1;
    return fn.apply(this, arguments);
  });
};

// --- instrumentacion de session.flushStorageData ---------------------------
// Se envuelve ANTES de cargar main.js. NO cambia lo que hace: llama al real y
// anota el estado del LevelDB en disco justo antes y justo despues, que es la
// unica forma de afirmar algo sobre la barrera durable dentro del flujo real.
//
// ARN-4: flushStorageData() no tiene callback ni promesa -- el volcado real
// a los archivos de LevelDB lo hace el hilo de I/O de Chromium de forma
// asincrona respecto al retorno de esta llamada. Un unico stat "justo
// despues" es una carrera de verdad (incidente registrado: 65/1, y 5/5 al
// repetir de inmediato), no temporizacion del arnes. Por eso el "despues" se
// toma con un sondeo acotado en vez de una sola lectura instantanea: se seguy
// exigiendo crecimiento fisico ESTRICTO (>), solo se le da a Chromium el
// margen real que necesita antes de darlo por no ocurrido. El tope (500 ms)
// se apoya en la unica medicion ya hecha en este proyecto sobre esta misma
// escritura perezosa (electron-flush-diff.ps1: ~103 ms sin la barrera), con
// margen amplio; no es un numero arbitrario ni una tolerancia de mtime.
function sleepSyncMs(ms) {
  const sab = new SharedArrayBuffer(4);
  Atomics.wait(new Int32Array(sab), 0, 0, ms);
}
const SONDEO_PASO_MS = 25;
const SONDEO_TOPE_MS = 500;
const flushes = [];
let matarTrasConfirmar = false;
// Datos que RA-5 necesita tener a mano en el instante del corte duro.
const vigilancia = { part: null, marca: null, marcaPrevia: null, tAplicado: null };
const fromPartOrig = session.fromPartition.bind(session);
session.fromPartition = function (p) {
  const s = fromPartOrig(p);
  if (typeof s.flushStorageData === 'function' && !s.__envuelto) {
    const orig = s.flushStorageData.bind(s);
    s.flushStorageData = function () {
      const antes = huellaLevelDb(p);
      const r = orig();
      const creceFrenteA = (foto) => Object.keys(foto).some((k) => (foto[k] || 0) > (antes[k] || 0));
      let desp = huellaLevelDb(p);
      let esperado = 0;
      while (!creceFrenteA(desp) && esperado < SONDEO_TOPE_MS) {
        sleepSyncMs(SONDEO_PASO_MS);
        esperado += SONDEO_PASO_MS;
        desp = huellaLevelDb(p);
      }
      flushes.push({ part: p, antes, desp, devuelve: r === undefined ? 'undefined' : typeof r, esperoMs: esperado });
      tlog('      FLUSH ' + p + '  antes=' + JSON.stringify(antes) + '  despues=' + JSON.stringify(desp) + '  espero=' + esperado + 'ms');
      return r;
    };
    try { Object.defineProperty(s, '__envuelto', { value: true }); } catch (e) {}
  }
  return s;
};

// --- espia de Maps, para P2-MEETING / P2-CANDIDATE -------------------------
// `meetingPrepWindows` y `candidateEvalWindows` son `const` de ambito de modulo
// en main.js: no se exportan y no hay forma de leerlas desde fuera. Para poder
// comprobar la IDENTIDAD de verdad —`mapa.get(X) === B`, que es lo que pide el
// criterio— se sustituye `global.Map` por una subclase que anota cada instancia
// creada MIENTRAS se carga main.js, y se restaura inmediatamente despues.
//
// No cambia el comportamiento: es una subclase de Map. Solo da una referencia
// al objeto real. Luego se identifica cual es cual por su contenido, no por el
// orden de creacion.
const mapasCreados = [];
const MapOriginal = global.Map;
class MapEspia extends MapOriginal {
  constructor(...a) { super(...a); mapasCreados.push(this); }
}
global.Map = MapEspia;
tlog('cargando main.js...');
require(MAIN_ARG || (PROJDIR + '/main.js'));
global.Map = MapOriginal;
tlog('main.js cargado  (mapas capturados: ' + mapasCreados.length + ')');

// Devuelve el mapa de ventanas que, para el proyecto `pid`, guarda una ventana
// cuya URL contiene `frag`. Identificacion por contenido: nada de suponer el
// orden en que main.js declara sus mapas.
function mapaDeVentanas(pid, frag) {
  const encontrados = mapasCreados.filter((m) => {
    let w = null;
    try { w = m.get(pid); } catch (e) { return false; }
    if (!w || typeof w !== 'object' || !w.webContents) return false;
    try { return String(w.webContents.getURL()).includes(frag); } catch (e) { return false; }
  });
  return encontrados.length === 1 ? encontrados[0] : null;
}
const dbmod = require(PROJDIR + '/db.js');
app.whenReady().then(() => tlog('app READY'));

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const ventanasCon = (frag) => BrowserWindow.getAllWindows().filter((x) => {
  if (x.isDestroyed()) return false;
  try { return x.webContents.getURL().includes(frag); } catch (e) { return false; }
});
async function esperarVentana(frag, tope = 40000) {
  const t0 = Date.now();
  for (;;) {
    const w = ventanasCon(frag)[0];
    if (w) return w;
    if (Date.now() - t0 > tope) return null;
    await esperar(300);
  }
}

// --- estado observable -----------------------------------------------------
const nFilas = (t, w, p) => { try { return dbmod.get(`SELECT COUNT(*) n FROM ${t}` + (w ? ' WHERE ' + w : ''), p || []).n; } catch (e) { return -1; } };
const dirRestauraciones = () => path.join(UD, '.panorama-restauraciones');
const dirAcciones = () => path.join(UD, '.panorama-acciones');
function residuos() {
  const j = (d) => { try { return fs.readdirSync(d); } catch (e) { return []; } };
  return { restauraciones: j(dirRestauraciones()), acciones: j(dirAcciones()) };
}

// --- el LevelDB de la particion, en disco ----------------------------------
function dirLevelDb(part) {
  const slug = String(part || '').replace(/^persist:/, '');
  return path.join(UD, 'Partitions', slug, 'Local Storage', 'leveldb');
}
function huellaLevelDb(part) {
  const d = dirLevelDb(part);
  const o = {};
  let ents = [];
  try { ents = fs.readdirSync(d); } catch (e) { return o; }
  for (const n of ents) { try { o[n] = fs.statSync(path.join(d, n)).size; } catch (e) {} }
  return o;
}
// Busca una marca literal en los bytes crudos del LevelDB. Chromium guarda los
// valores en UTF-16LE, asi que hay que probar las dos codificaciones.
function marcaEnDisco(part, marca) {
  const d = dirLevelDb(part);
  let ents = [];
  try { ents = fs.readdirSync(d); } catch (e) { return { existe: false, hits: [] }; }
  const hits = [];
  for (const n of ents) {
    try {
      const b = fs.readFileSync(path.join(d, n));
      if (b.includes(Buffer.from(marca, 'utf8')) || b.includes(Buffer.from(marca, 'utf16le'))) hits.push(n);
    } catch (e) {}
  }
  return { existe: true, hits };
}

function leerParticion(part) {
  return new Promise((resolve) => {
    const h = new BrowserWindow({ show: false, webPreferences: { partition: part } });
    h.loadFile(PROJDIR + '/dashboard/restore-helper.html')
      .then(() => h.webContents.executeJavaScript(
        "(function(){var d={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);d[k]=localStorage.getItem(k);}return d;})()"))
      .then((d) => { try { h.close(); } catch (e) {} resolve(d); })
      .catch(() => { try { h.close(); } catch (e) {} resolve(null); });
  });
}

// --- inyeccion de fallos sobre el db.js REAL de main.js --------------------
const escribirOriginal = dbmod.escribirMultiple;
let inyeccion = null;            // (sentencias, opts) => 'base-cambiada' | 'post' | null
let restoreEnVuelo = false;
const esMarcaSola = (s, o) => Array.isArray(s) && s.length === 1 &&
  /INSERT INTO app_meta/.test(String(s[0] && s[0].sql)) &&
  /^acciones_/.test(String((s[0] && s[0].params && s[0].params[0]) || '')) &&
  !!(o && o.exigirCommitBase);
dbmod.escribirMultiple = function (sentencias, opts) {
  const modo = inyeccion ? inyeccion(sentencias, opts) : null;
  if (modo === 'base-cambiada') {
    const e = new Error('otro equipo guardo mientras tanto (inyectado)');
    e.kind = 'base-cambiada';
    throw e;
  }
  const r = escribirOriginal.apply(dbmod, arguments);
  // CORTE DURO justo DESPUES de confirmar y ANTES del cleanup de R6: es el
  // instante exacto que la barrera durable existe para cubrir.
  if (matarTrasConfirmar && restoreEnVuelo && esMarcaSola(sentencias, opts)) {
    // Se fotografia el LevelDB EN EL INSTANTE del corte. Sin esto, un brazo
    // "sin flush" que sale coherente no dice si es porque la barrera no hacia
    // falta o porque la escritura perezosa llego antes por su cuenta.
    let foto = null;
    try {
      foto = {
        msDesdeAplicar: vigilancia.tAplicado ? Date.now() - vigilancia.tAplicado : null,
        huella: vigilancia.part ? huellaLevelDb(vigilancia.part) : null,
        marcaDelBackupEnDisco: vigilancia.part && vigilancia.marca
          ? marcaEnDisco(vigilancia.part, vigilancia.marca).hits : null,
        marcaPreviaEnDisco: vigilancia.part && vigilancia.marcaPrevia
          ? marcaEnDisco(vigilancia.part, vigilancia.marcaPrevia).hits : null,
        huboFlush: flushes.length,
      };
    } catch (e) { foto = { error: String((e && e.message) || e) }; }
    tlog('      CORTE DURO tras el commit de confirmacion  ' + JSON.stringify(foto));
    try { fs.writeFileSync(path.join(SB, 'corte.txt'), JSON.stringify(foto), 'utf8'); } catch (e) {}
    // `process.exit()` NO sirve para esto: es una salida ordenada y Chromium
    // todavia vuelca su almacenamiento al cerrar, asi que el brazo "sin
    // barrera" salia coherente por el camino equivocado. TerminateProcess
    // (SIGKILL en Windows) no ejecuta NINGUN manejador de cierre.
    //
    // LIMITE: sigue sin ser un corte de corriente. Los bytes ya escritos viven
    // en la cache del sistema operativo y el SO los bajara a disco igualmente.
    // Esto prueba "el proceso muere sin poder limpiar", no "se va la luz".
    try { process.kill(process.pid, 'SIGKILL'); } catch (e) { process.exit(9); }
    return r;
  }
  if (modo === 'post') {
    const e = new Error('no se pudo releer tras confirmar (inyectado)');
    e.aplicado = true; e.kind = 'io-tras-confirmar';
    throw e;
  }
  return r;
};

// --- dialogos: se anotan y se responden al instante ------------------------
const dialogos = [];
dialog.showMessageBoxSync = function (a, b) {
  const o = (b || a) || {};
  // El detalle se guarda ENTERO. Truncarlo aqui a 400 caracteres tumbaba
  // RA-9: `errorCodeSuffix()` pone el "(codigo PS-xxxx)" al FINAL del texto, y
  // el detalle de la restauracion sin resolver pasa de 400. La prueba decia
  // "falta el codigo" cuando lo que faltaba era el final de la cadena. El
  // truncado se hace solo al IMPRIMIR.
  dialogos.push({ title: o.title, message: o.message, detail: String(o.detail || '') });
  tlog('      DIALOGO: ' + o.title + ' | ' + String(o.detail || '').slice(0, 200).replace(/\n/g, ' '));
  return 0;
};
let quitPedido = 0;
const quitOriginal = app.quit.bind(app);
app.quit = function () { quitPedido++; tlog('      app.quit() solicitado (' + quitPedido + ')'); };
void quitOriginal;

// ===========================================================================
// Proyecto real con TRES backups distinguibles y las tres familias de ventanas.
async function crearProyectoConBackups(lanzador, nombre) {
  const row = await lanzador.webContents.executeJavaScript(
    `window.launcherAPI.createProject(${JSON.stringify(nombre)},'','',null)`);
  const PID = row.id;
  await lanzador.webContents.executeJavaScript(`window.launcherAPI.openProject(${PID})`);
  const vProj = await esperarVentana(`projects/${PID}/dashboard.html`);
  if (!vProj) throw new Error('no se abrio la ventana del proyecto');
  await esperar(2500);

  const CLAVE = 'panorama_servicio_ib__panorama-servicio-full__proj-' + PID;
  const marcas = [];
  for (let i = 1; i <= 3; i++) {
    const marca = 'MARCA-V' + i + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    marcas.push(marca);
    await vProj.webContents.executeJavaScript(
      `localStorage.setItem(${JSON.stringify(CLAVE)}, JSON.stringify({projectTitle:'${nombre}',marca:${JSON.stringify(marca)}})); 'ok'`);
    const g = await vProj.webContents.executeJavaScript(
      "(function(){var d={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);d[k]=localStorage.getItem(k);}"
      + "return window.panoramaBridge.saveBackup(JSON.stringify(d),'manual');})()");
    if (!g || g.aplicado !== true) throw new Error('backup ' + i + ' no aplicado: ' + JSON.stringify(g));
    await esperar(600);
  }

  // Las otras dos familias, por el menu real, para que el quiesce tenga que
  // cerrar las TRES.
  const idsPrev = () => new Set(BrowserWindow.getAllWindows().map((w) => w.id));
  const esperarNueva = async (previos, frag, tope = 20000) => {
    const t0 = Date.now();
    for (;;) {
      const w = ventanasCon(frag).find((x) => !previos.has(x.id));
      if (w) return w;
      if (Date.now() - t0 > tope) return null;
      await esperar(300);
    }
  };
  const prevPrep = idsPrev();
  await vProj.webContents.executeJavaScript(
    "window.panoramaBridge.projectMenuAction('proyecto-prep-reunion')").catch(() => {});
  const vPrep = await esperarNueva(prevPrep, 'preparacion_reunion');
  if (vPrep) {
    await esperar(1500);
    await vPrep.webContents.executeJavaScript(
      "window.panoramaBridge.saveMeetingPrep('2026-10-01','seguimiento',JSON.stringify({prep:'REAL'}))");
  }
  const prevEval = idsPrev();
  await vProj.webContents.executeJavaScript(
    "window.panoramaBridge.projectMenuAction('proyecto-eval-candidatos')").catch(() => {});
  const vEval = await esperarNueva(prevEval, 'evaluacion_candidatos');
  if (vEval) await esperar(1500);

  // El estado ACTUAL, que es lo que la restauracion va a descartar.
  const marcaActual = 'MARCA-ACTUAL-' + crypto.randomBytes(4).toString('hex').toUpperCase();
  await vProj.webContents.executeJavaScript(
    `localStorage.setItem(${JSON.stringify(CLAVE)}, JSON.stringify({projectTitle:'${nombre}',marca:${JSON.stringify(marcaActual)}})); 'ok'`);

  const fila = dbmod.get('SELECT * FROM projects WHERE id=?', [PID]);
  const backups = dbmod.all('SELECT * FROM backups WHERE project_id=? ORDER BY created_at ASC', [PID]);
  return { PID, fila, vProj, vPrep, vEval, CLAVE, marcas, marcaActual, backups };
}

const marcaDe = (dump, clave) => { try { return JSON.parse(dump[clave]).marca; } catch (e) { return null; } };

// ===========================================================================
app.whenReady().then(async () => {
  if (MODO === 'nada') return;
  try {
    // RA-9 no espera al lanzador A PROPOSITO: con material no demostrable la
    // app hace fail-closed y no llega a abrirlo. Esperarlo seria esperar a que
    // ocurra justo lo que la prueba dice que NO debe ocurrir.
    const sinLanzador = (MODO === 'ra5b' || MODO === 'ra9');
    let lanzador = null;
    if (!sinLanzador) {
      lanzador = await esperarVentana('launcher/index.html');
      if (!lanzador) { tlog('ERROR: no aparecio el lanzador'); app.exit(3); return; }
      await esperar(1500);
    } else {
      await esperar(9000);   // tiempo para que corra toda la recuperacion
    }

    // =====================================================================
    if (MODO === 'ra1') {
      tlog('--- RA-1: RESTAURACION REAL, CAMINO FELIZ ---');
      const C = await crearProyectoConBackups(lanzador, 'Servicio RA1');
      const bkElegido = C.backups[0];          // el MAS ANTIGUO: V1
      const marcaEsperada = C.marcas[0];
      info('PID=' + C.PID + ' particion=' + C.fila.partition_name);
      info('backup elegido=' + bkElegido.id + ' marca esperada=' + marcaEsperada + ' marca actual=' + C.marcaActual);

      const backupsAntes = nFilas('backups', 'project_id=?', [C.PID]);
      const partPre = await leerParticion(C.fila.partition_name);
      ok('RA-1/PRE la particion REAL tiene el estado actual, no el del backup',
        marcaDe(partPre, C.CLAVE) === C.marcaActual, JSON.stringify(marcaDe(partPre, C.CLAVE)));
      ok('RA-1/PRE las tres familias de ventanas estan abiertas',
        !!C.vProj && !C.vProj.isDestroyed() && !!C.vPrep && !C.vPrep.isDestroyed() && !!C.vEval && !C.vEval.isDestroyed(),
        JSON.stringify({ proj: !!C.vProj, prep: !!C.vPrep, ev: !!C.vEval }));

      flushes.length = 0;
      const idsAntes = new Set(BrowserWindow.getAllWindows().map((w) => w.id));
      const r = JSON.parse(await lanzador.webContents.executeJavaScript(
        `window.launcherAPI.restoreBackup(${C.PID}, ${bkElegido.id}).then(r => JSON.stringify(r))`));
      info('resultado: ' + JSON.stringify(r));

      ok('RA-1 contrato: aplicado:true / verificado:true',
        r.ok === true && r.aplicado === true && r.verificado === true && typeof r.actionId === 'string', JSON.stringify(r));

      // §8.1/3 — las tres ventanas REALES se cerraron, por identidad
      ok('RA-1 §8.1/3 las tres ventanas reales del proyecto quedan cerradas',
        C.vProj.isDestroyed() && (!C.vPrep || C.vPrep.isDestroyed()) && (!C.vEval || C.vEval.isDestroyed()),
        JSON.stringify({ proj: C.vProj.isDestroyed(), prep: C.vPrep && C.vPrep.isDestroyed(), ev: C.vEval && C.vEval.isDestroyed() }));

      // §8.1/1 y /2 — la particion de Chromium quedo con el backup
      const partPost = await leerParticion(C.fila.partition_name);
      ok('RA-1 §8.1/1 la particion REAL de Chromium queda con el contenido del backup',
        marcaDe(partPost, C.CLAVE) === marcaEsperada,
        JSON.stringify({ leida: marcaDe(partPost, C.CLAVE), esperada: marcaEsperada }));

      // §8.1/2 — la BARRERA DURABLE, medida dentro del flujo real
      ok('RA-1 §8.1/2 el restore llamo a flushStorageData una vez, sobre la particion del proyecto',
        flushes.length === 1 && flushes[0].part === C.fila.partition_name,
        JSON.stringify(flushes.map((f) => f.part)));
      const crecio = flushes.length === 1 &&
        Object.keys(flushes[0].desp).some((k) => (flushes[0].desp[k] || 0) > (flushes[0].antes[k] || 0));
      ok('RA-1 §8.1/2 el LevelDB de la particion CRECE al llamar al flush',
        crecio, JSON.stringify(flushes[0] || null));
      const enDisco = marcaEnDisco(C.fila.partition_name, marcaEsperada);
      ok('RA-1 §8.1/2 y la marca del backup esta en el LevelDB EN DISCO al confirmarse',
        enDisco.existe && enDisco.hits.length > 0, JSON.stringify(enDisco));

      // §8.1/6 — reapertura real
      let vNueva = null;
      for (let i = 0; i < 40 && !vNueva; i++) {
        vNueva = ventanasCon(`projects/${C.PID}/dashboard.html`).find((w) => !idsAntes.has(w.id)) || null;
        if (!vNueva) await esperar(300);
      }
      ok('RA-1 §8.1/6 la ventana del proyecto se REABRE de verdad (ventana nueva)', !!vNueva,
        JSON.stringify(ventanasCon(`projects/${C.PID}/dashboard.html`).map((w) => w.id)));

      // NO-STALE real y limpieza
      ok('RA-1 el cierre por restauracion NO crea backups nuevos',
        nFilas('backups', 'project_id=?', [C.PID]) === backupsAntes,
        JSON.stringify({ antes: backupsAntes, ahora: nFilas('backups', 'project_id=?', [C.PID]) }));
      ok('RA-1 ningun backup contiene el estado descartado',
        dbmod.all('SELECT * FROM backups WHERE project_id=?', [C.PID]).every((b) => !String(b.payload).includes(C.marcaActual)));
      ok('RA-1 cero material residual de restauracion',
        residuos().restauraciones.length === 0, JSON.stringify(residuos()));
      // La barrera se comprueba EJERCITANDOLA, no declarandola: se guarda de
      // verdad desde la ventana reabierta.
      let guardado = null;
      if (vNueva) {
        await esperar(2000);
        guardado = await vNueva.webContents.executeJavaScript(
          "(function(){var d={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);d[k]=localStorage.getItem(k);}"
          + "return window.panoramaBridge.saveBackup(JSON.stringify(d),'manual');})()").catch((e) => ({ error: String(e) }));
      }
      ok('RA-1 la barrera queda libre: un backup REAL desde la ventana reabierta se aplica',
        !!(guardado && guardado.aplicado === true), JSON.stringify(guardado));
      fs.writeFileSync(path.join(SB, 'ra1.json'), JSON.stringify({ pid: C.PID, part: C.fila.partition_name, marca: marcaEsperada }), 'utf8');
      tlog('FIN ra1');
    }

    // =====================================================================
    if (MODO === 'ra2') {
      tlog('--- RA-2: VENTANA QUE DE VERDAD SE NIEGA A CERRARSE (§8.1/4) ---');
      const C = await crearProyectoConBackups(lanzador, 'Servicio RA2');
      const bk = C.backups[0];
      // beforeunload REAL en el renderer del dashboard: Electron cancela el
      // close y `once('closed')` no llega nunca.
      await C.vProj.webContents.executeJavaScript(
        "window.onbeforeunload = function(){ return 'no me cierro'; }; 'ok'");
      const partPre = await leerParticion(C.fila.partition_name);
      flushes.length = 0;
      const t0 = Date.now();
      const r = JSON.parse(await lanzador.webContents.executeJavaScript(
        `window.launcherAPI.restoreBackup(${C.PID}, ${bk.id}).then(r => JSON.stringify(r))`));
      const ms = Date.now() - t0;
      info('resultado: ' + JSON.stringify(r) + '  en ' + ms + ' ms');
      ok('RA-2 §8.1/4 con una ventana que se niega, el restore NO se aplica',
        r.aplicado === false && r.bloqueo === 'quiesce-incompleto', JSON.stringify(r));
      ok('RA-2 §8.1/4 y espera al tope de 8 s antes de rendirse', ms >= 7500, String(ms));
      ok('RA-2 la ventana rebelde SIGUE viva', !C.vProj.isDestroyed());
      const partPost = await leerParticion(C.fila.partition_name);
      ok('RA-2 la particion NO se toco: sigue el estado actual',
        marcaDe(partPost, C.CLAVE) === C.marcaActual && JSON.stringify(partPost) === JSON.stringify(partPre),
        JSON.stringify({ leida: marcaDe(partPost, C.CLAVE), esperada: C.marcaActual }));
      ok('RA-2 NO se llamo a flushStorageData: no hubo aplicacion', flushes.length === 0, String(flushes.length));
      ok('RA-2 cero material residual', residuos().restauraciones.length === 0, JSON.stringify(residuos()));
      ok('RA-2 es reintentable y lo dice', r.reintentable === true, String(r.reintentable));

      // --- el patron de P2, comprobado por su efecto observable -----------
      // La ventana no confirmada se DEVUELVE al mapa. Si se hubiera borrado
      // (que es el defecto P2), un segundo intento no la veria, daria el
      // quiesce por completo y reescribiria el localStorage POR DEBAJO de una
      // ventana viva. Asi que el segundo intento tiene que fallar igual.
      flushes.length = 0;
      const r2 = JSON.parse(await lanzador.webContents.executeJavaScript(
        `window.launcherAPI.restoreBackup(${C.PID}, ${bk.id}).then(r => JSON.stringify(r))`));
      info('segundo intento: ' + JSON.stringify(r2));
      ok('RA-2 (P2) el segundo intento TAMBIEN se bloquea: la ventana sigue registrada',
        r2.aplicado === false && r2.bloqueo === 'quiesce-incompleto', JSON.stringify(r2));
      ok('RA-2 (P2) y sigue sin tocarse la particion en el segundo intento',
        flushes.length === 0 && marcaDe(await leerParticion(C.fila.partition_name), C.CLAVE) === C.marcaActual,
        JSON.stringify({ flush: flushes.length }));

      // se desarma y se comprueba que entonces SI se puede restaurar
      await C.vProj.webContents.executeJavaScript("window.onbeforeunload = null; 'ok'");
      const r3 = JSON.parse(await lanzador.webContents.executeJavaScript(
        `window.launcherAPI.restoreBackup(${C.PID}, ${bk.id}).then(r => JSON.stringify(r))`));
      info('tercer intento, ya sin beforeunload: ' + JSON.stringify(r3));
      ok('RA-2 retirada la traba, la MISMA ventana se cierra y el restore se aplica',
        r3.aplicado === true && r3.verificado === true && C.vProj.isDestroyed(),
        JSON.stringify({ r3: { aplicado: r3.aplicado, verificado: r3.verificado }, destruida: C.vProj.isDestroyed() }));
      tlog('FIN ra2');
    }

    // =====================================================================
    if (MODO === 'ra3') {
      tlog('--- RA-3: FALLO PRE-COMMIT, VUELTA ATRAS REAL ---');
      const C = await crearProyectoConBackups(lanzador, 'Servicio RA3');
      const bk = C.backups[0];
      const partPre = await leerParticion(C.fila.partition_name);
      flushes.length = 0;
      restoreEnVuelo = true;
      inyeccion = (s, o) => (esMarcaSola(s, o) ? 'base-cambiada' : null);
      const r = JSON.parse(await lanzador.webContents.executeJavaScript(
        `window.launcherAPI.restoreBackup(${C.PID}, ${bk.id}).then(r => JSON.stringify(r))`));
      inyeccion = null; restoreEnVuelo = false;
      info('resultado: ' + JSON.stringify(r));
      ok('RA-3 el restore NO se aplica y es reintentable',
        r.aplicado === false && r.reintentable === true, JSON.stringify(r));
      const partPost = await leerParticion(C.fila.partition_name);
      ok('RA-3 la particion REAL vuelve al estado anterior, no se queda con el backup',
        marcaDe(partPost, C.CLAVE) === C.marcaActual && JSON.stringify(partPost) === JSON.stringify(partPre),
        JSON.stringify({ leida: marcaDe(partPost, C.CLAVE), esperada: C.marcaActual }));
      // DOS flushes, no uno. El primero es el del APPLY (la aplicacion ocurrio
      // antes del fallo); el segundo es el de la REPOSICION, que desde la ronda
      // de REST-ROLLBACK-FLUSH tambien vuelca a disco antes de que se limpie el
      // material. Esta asercion exigia 1 y se quedo desfasada en esa ronda: el
      // test automatizado se actualizo y este arnes no, porque no se volvio a
      // arrancar. No es un defecto del producto — las otras dos aserciones de
      // RA-3 demuestran que la vuelta atras dejo la particion en el PRE y sin
      // material residual.
      ok('RA-3 hay DOS flushes: el del apply y el de la reposicion',
        flushes.length === 2, JSON.stringify(flushes.map((f) => f.part)));
      ok('RA-3 los dos son sobre la particion del proyecto',
        flushes.length === 2 && flushes.every((f) => f.part === C.fila.partition_name),
        JSON.stringify({ esperada: C.fila.partition_name, vistas: flushes.map((f) => f.part) }));
      ok('RA-3 cero material residual tras la vuelta atras',
        residuos().restauraciones.length === 0, JSON.stringify(residuos()));
      const vNueva = await esperarVentana(`projects/${C.PID}/dashboard.html`, 12000);
      ok('RA-3 la ventana del proyecto se reabre tras el fallo', !!vNueva);
      tlog('FIN ra3');
    }

    // =====================================================================
    if (MODO === 'ra4') {
      tlog('--- RA-4: FORMA 3 EN ELECTRON REAL ---');
      const C = await crearProyectoConBackups(lanzador, 'Servicio RA4');
      const bk = C.backups[0];
      const marcaEsperada = C.marcas[0];
      restoreEnVuelo = true;
      let veces = 0;
      inyeccion = (s, o) => { if (esMarcaSola(s, o)) { veces++; return 'post'; } return null; };
      const r = JSON.parse(await lanzador.webContents.executeJavaScript(
        `window.launcherAPI.restoreBackup(${C.PID}, ${bk.id}).then(r => JSON.stringify(r))`));
      inyeccion = null; restoreEnVuelo = false;
      info('resultado: ' + JSON.stringify(r));
      ok('RA-4 forma 3 real: aplicado:true / verificado:false / requiereReinicio',
        r.ok === true && r.aplicado === true && r.verificado === false && r.requiereReinicio === true && typeof r.aviso === 'string',
        JSON.stringify(r));
      ok('RA-4 la confirmacion se intento UNA sola vez', veces === 1, String(veces));
      const partPost = await leerParticion(C.fila.partition_name);
      ok('RA-4 NO hay vuelta atras: la particion se queda con el backup',
        marcaDe(partPost, C.CLAVE) === marcaEsperada,
        JSON.stringify({ leida: marcaDe(partPost, C.CLAVE), esperada: marcaEsperada }));
      fs.writeFileSync(path.join(SB, 'ra4.json'), JSON.stringify({ pid: C.PID, part: C.fila.partition_name, marca: marcaEsperada }), 'utf8');
      tlog('FIN ra4');
    }

    // =====================================================================
    if (MODO === 'ra5') {
      tlog('--- RA-5: CORTE DURO JUSTO TRAS EL COMMIT DE CONFIRMACION ---');
      const C = await crearProyectoConBackups(lanzador, 'Servicio RA5');
      const bk = C.backups[0];
      const marcaEsperada = C.marcas[0];
      fs.writeFileSync(path.join(SB, 'ra5.json'), JSON.stringify({
        pid: C.PID, part: C.fila.partition_name, clave: C.CLAVE,
        marca: marcaEsperada, marcaActual: C.marcaActual, conFlush: !MAIN_ARG,
      }), 'utf8');
      vigilancia.part = C.fila.partition_name;
      vigilancia.marca = marcaEsperada;
      vigilancia.marcaPrevia = C.marcaActual;
      // Cronometro del reloj que de verdad importa: la escritura perezosa de
      // Chromium empieza a contar en el `setItem`, no en el commit. Se parchea
      // el prototipo de webContents (comun a todas las ventanas, incluida la
      // oculta del restore) para anotar cuando TERMINA de aplicarse el volcado.
      // Funciona igual con y sin barrera, que es lo que permite comparar.
      try {
        const proto = Object.getPrototypeOf(C.vProj.webContents);
        const orig = proto.executeJavaScript;
        proto.executeJavaScript = function (script) {
          const esVolcado = typeof script === 'string' && /localStorage\.clear\(\)/.test(script) && /setItem/.test(script);
          const p = orig.apply(this, arguments);
          if (esVolcado) return Promise.resolve(p).then((r) => { vigilancia.tAplicado = Date.now(); return r; });
          return p;
        };
      } catch (e) { info('no se pudo cronometrar el volcado: ' + String((e && e.message) || e)); }

      info('se va a cortar el proceso justo despues del commit de confirmacion');
      restoreEnVuelo = true;
      matarTrasConfirmar = true;
      lanzador.webContents.executeJavaScript(
        `window.launcherAPI.restoreBackup(${C.PID}, ${bk.id}).then(r => JSON.stringify(r))`).catch(() => {});
      await esperar(60000);        // no deberia llegar: el corte mata el proceso
      tlog('FALLO RA-5: el corte no llego a ejecutarse');
      app.exit(4);
      return;
    }

    if (MODO === 'ra5b') {
      tlog('--- RA-5b: TRAS EL CORTE, AL VOLVER A ARRANCAR ---');
      const esp = JSON.parse(fs.readFileSync(path.join(SB, 'ra5.json'), 'utf8'));
      const corto = fs.existsSync(path.join(SB, 'corte.txt'));
      let foto = null;
      try { foto = JSON.parse(fs.readFileSync(path.join(SB, 'corte.txt'), 'utf8')); } catch (e) {}
      ok('RA-5 el corte se produjo de verdad tras el commit', corto, String(corto));
      info('foto del LevelDB EN EL INSTANTE del corte: ' + JSON.stringify(foto));
      const part = await leerParticion(esp.part);
      const marca = marcaDe(part || {}, esp.clave);
      info('marca leida tras reiniciar: ' + marca + '  (esperada del backup: ' + esp.marca + ')');
      info('dialogos: ' + JSON.stringify(dialogos.map((d) => d.title)));
      info('app.quit solicitado: ' + quitPedido);
      // La marca de confirmacion SI se escribio, asi que la recuperacion NO
      // debe deshacer nada: solo terminar la limpieza.
      ok('RA-5b §8.1/5 la recuperacion NO deshace una restauracion confirmada: queda el BACKUP',
        marca === esp.marca, JSON.stringify({ leida: marca, esperadaBackup: esp.marca, esperadaPrevia: esp.marcaActual }));
      ok('RA-5b §8.1/5 la limpieza del material se termina al arrancar',
        residuos().restauraciones.length === 0, JSON.stringify(residuos()));
      ok('RA-5b la app NO hace fail-closed: el caso es demostrable', quitPedido === 0, String(quitPedido));
      fs.writeFileSync(path.join(SB, 'ra5b-resultado.json'), JSON.stringify({
        conFlush: esp.conFlush, marcaLeida: marca, marcaBackup: esp.marca, marcaPrevia: esp.marcaActual,
        acierta: marca === esp.marca, corte: foto,
      }), 'utf8');
      tlog('FIN ra5b');
    }

    // =====================================================================
    if (MODO === 'ra6') {
      tlog('--- RA-6: REKEY REAL CON MATERIAL DE RESTAURACION PENDIENTE (§8.1/7) ---');
      const C = await crearProyectoConBackups(lanzador, 'Servicio RA6');
      // Material pendiente FABRICADO (una carpeta con algo dentro basta: el
      // criterio aprobado es "cualquier cosa bajo .panorama-restauraciones/").
      const aid = crypto.randomBytes(16).toString('hex');
      const d = path.join(dirRestauraciones(), aid);
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'previo.enc'), 'material pendiente de una restauracion', 'utf8');
      info('material plantado en ' + d);

      if (typeof handlers['security-win:submit'] !== 'function') {
        ok('RA-6 el handler real security-win:submit esta disponible', false, 'no se capturo');
      } else {
        const activar = () => handlers['security-win:submit'](null, {
          mode: 'setup', password: 'ClaveDePrueba123', confirm: 'ClaveDePrueba123', remember: false,
        });
        const r = await activar();
        info('resultado del rekey: ' + JSON.stringify(r));
        ok('RA-6 §8.1/7 el modo se reconoce: la prueba llega de verdad al rekey',
          !/no reconocido/i.test(String((r && r.error) || '')), JSON.stringify(r));
        // `security-win:submit` devuelve `{error}` a la ventana (es lo que ella
        // pinta); el `ok:false` vive una capa mas adentro, en rekeyAllUserFiles.
        // Lo que se exige aqui es lo observable por el usuario: que NO se haya
        // completado y que el motivo sea la restauracion pendiente.
        ok('RA-6 §8.1/7 el rekey REAL se niega a empezar con material pendiente',
          !!(r && r.ok !== true && /restauraci/i.test(String(r.error || '')) && /PS-2006/.test(String(r.error || ''))),
          JSON.stringify(r));
        ok('RA-6 §8.1/7 y la seguridad NO queda activada',
          !dbmod.get("SELECT value FROM app_meta WHERE key='security_enabled'") ||
          String((dbmod.get("SELECT value FROM app_meta WHERE key='security_enabled'") || {}).value) !== '1',
          JSON.stringify(dbmod.get("SELECT value FROM app_meta WHERE key='security_enabled'")));
        ok('RA-6 §8.1/7 el material pendiente sigue intacto y sin re-cifrar',
          fs.existsSync(path.join(d, 'previo.enc')) &&
          fs.readFileSync(path.join(d, 'previo.enc'), 'utf8') === 'material pendiente de una restauracion');
        // y al retirarlo, el rekey ya puede empezar
        fs.rmSync(d, { recursive: true, force: true });
        const r2 = await activar();
        info('resultado tras retirar el material: ' + JSON.stringify(r2));
        // Que "no diga restauracion" no basta: un error distinto tambien lo
        // cumpliria. Tiene que haber activado la seguridad DE VERDAD.
        const habilitada = () => {
          const v = dbmod.get("SELECT value FROM app_meta WHERE key='security_enabled'");
          return !!(v && String(v.value) === '1');
        };
        ok('RA-6 §8.1/7 retirado el material, el rekey SI se completa (la unica traba era esa)',
          !(r2 && r2.ok === false && /restauraci/i.test(String(r2.error || ''))) && habilitada(),
          JSON.stringify({ r2, enabled: habilitada() }));
      }
      void C;
      tlog('FIN ra6');
    }

    // =====================================================================
    if (MODO === 'ra7') {
      tlog('--- RA-7 / REST-ROLLBACK-FLUSH-3: corte duro JUSTO TRAS el cleanup de la reposicion ---');
      const C = await crearProyectoConBackups(lanzador, 'Servicio RA7');
      const bk = C.backups[0];
      fs.writeFileSync(path.join(SB, 'ra7.json'), JSON.stringify({
        pid: C.PID, part: C.fila.partition_name, clave: C.CLAVE,
        marcaBackup: C.marcas[0], marcaPre: C.marcaActual, conFlush: !MAIN_ARG,
      }), 'utf8');
      vigilancia.part = C.fila.partition_name;
      vigilancia.marca = C.marcas[0];
      vigilancia.marcaPrevia = C.marcaActual;

      // Cronometro del volcado del PRE (la SEGUNDA escritura de la particion).
      let nVolcados = 0;
      try {
        const proto = Object.getPrototypeOf(C.vProj.webContents);
        const orig = proto.executeJavaScript;
        proto.executeJavaScript = function (script) {
          const esVolcado = typeof script === 'string' && /localStorage\.clear\(\)/.test(script) && /setItem/.test(script);
          const p = orig.apply(this, arguments);
          if (esVolcado) return Promise.resolve(p).then((r) => { nVolcados++; vigilancia.tAplicado = Date.now(); return r; });
          return p;
        };
      } catch (e) { info('no se pudo cronometrar: ' + String((e && e.message) || e)); }

      // El corte va justo DESPUES de que se retire el material: es el instante
      // en que `previo.enc` deja de existir y la unica copia del PRE es la
      // particion. Si la reposicion no fuera durable, ahi se pierde.
      const rmOrig = fs.rmSync;
      fs.rmSync = function (p, o) {
        const esMaterial = String(p).indexOf('.panorama-restauraciones') >= 0;
        const r = rmOrig.apply(fs, arguments);
        if (esMaterial) {
          let foto = null;
          try {
            foto = {
              msDesdeVolcadoPre: vigilancia.tAplicado ? Date.now() - vigilancia.tAplicado : null,
              volcados: nVolcados,
              huboFlush: flushes.length,
              preEnDisco: marcaEnDisco(vigilancia.part, vigilancia.marcaPrevia).hits,
              backupEnDisco: marcaEnDisco(vigilancia.part, vigilancia.marca).hits,
            };
          } catch (e) { foto = { error: String((e && e.message) || e) }; }
          tlog('      CORTE DURO tras el cleanup de la reposicion  ' + JSON.stringify(foto));
          try { fs.writeFileSync(path.join(SB, 'corte.txt'), JSON.stringify(foto), 'utf8'); } catch (e) {}
          try { process.kill(process.pid, 'SIGKILL'); } catch (e) { process.exit(9); }
        }
        return r;
      };

      restoreEnVuelo = true;
      inyeccion = (s, o) => (esMarcaSola(s, o) ? 'base-cambiada' : null);
      lanzador.webContents.executeJavaScript(
        `window.launcherAPI.restoreBackup(${C.PID}, ${bk.id}).then(r => JSON.stringify(r))`).catch(() => {});
      await esperar(60000);
      tlog('FALLO RA-7: el corte no llego a ejecutarse');
      app.exit(4);
      return;
    }

    if (MODO === 'ra7b') {
      tlog('--- RA-7b: tras el corte de la reposicion, al volver a arrancar ---');
      const esp = JSON.parse(fs.readFileSync(path.join(SB, 'ra7.json'), 'utf8'));
      let foto = null;
      try { foto = JSON.parse(fs.readFileSync(path.join(SB, 'corte.txt'), 'utf8')); } catch (e) {}
      ok('RA-7 el corte se produjo tras retirar el material', !!foto, String(!!foto));
      info('foto en el instante del corte: ' + JSON.stringify(foto));
      const part = await leerParticion(esp.part);
      const marca = marcaDe(part || {}, esp.clave);
      info('marca leida tras reiniciar: ' + marca + '  (PRE esperado: ' + esp.marcaPre + ')');
      ok('RA-7 / REST-ROLLBACK-FLUSH-3 el PRE sobrevive al corte: la particion tiene el estado anterior',
        marca === esp.marcaPre,
        JSON.stringify({ leida: marca, esperadaPre: esp.marcaPre, esperadaBackup: esp.marcaBackup }));
      ok('RA-7 no queda material de restauracion (ya se habia limpiado antes del corte)',
        residuos().restauraciones.length === 0, JSON.stringify(residuos()));
      ok('RA-7 la app arranca con normalidad: no hay nada que recuperar', quitPedido === 0, String(quitPedido));
      fs.writeFileSync(path.join(SB, 'ra7b-resultado.json'), JSON.stringify({
        conFlush: esp.conFlush, marcaLeida: marca, marcaPre: esp.marcaPre, marcaBackup: esp.marcaBackup,
        acierta: marca === esp.marcaPre, corte: foto,
      }), 'utf8');
      tlog('FIN ra7b');
    }

    // =====================================================================
    if (MODO === 'ra8') {
      tlog('--- RA-8 / P2-MEETING y P2-CANDIDATE: identidad REAL en los mapas ---');
      const C = await crearProyectoConBackups(lanzador, 'Servicio RA8');
      const X = C.PID;

      const casos = [
        { id: 'P2-MEETING',   frag: 'preparacion_reunion',   accion: 'proyecto-prep-reunion',   win: C.vPrep },
        { id: 'P2-CANDIDATE', frag: 'evaluacion_candidatos', accion: 'proyecto-eval-candidatos', win: C.vEval },
      ];

      for (const caso of casos) {
        const A = caso.win;
        if (!A || A.isDestroyed()) { ok(caso.id + ' hay ventana A abierta', false, 'no se abrio'); continue; }
        const mapa = mapaDeVentanas(X, caso.frag);
        ok(caso.id + ' se localiza el mapa REAL de main.js y contiene la ventana A',
          !!mapa && mapa.get(X) === A, String(!!mapa));
        if (!mapa) continue;

        // Estado que produce la sustitucion en la vida real: A ya esta muerta
        // pero su `closed` todavia no se ha procesado. Se reproduce haciendo
        // que A se declare destruida SOLO durante la llamada que crea B.
        Object.defineProperty(A, 'isDestroyed', { value: () => true, configurable: true });
        const idsPrev = new Set(BrowserWindow.getAllWindows().map((w) => w.id));
        await C.vProj.webContents.executeJavaScript(
          `window.panoramaBridge.projectMenuAction('${caso.accion}')`).catch(() => {});
        let B = null;
        for (let i = 0; i < 40 && !B; i++) {
          B = ventanasCon(caso.frag).find((w) => !idsPrev.has(w.id)) || null;
          if (!B) await esperar(300);
        }
        delete A.isDestroyed;                       // A vuelve a decir la verdad

        ok(caso.id + ' se crea una ventana B NUEVA para el mismo proyecto',
          !!B && B !== A, JSON.stringify({ hayB: !!B, distinta: B !== A }));
        ok(caso.id + ' y el mapa pasa a apuntar a B',
          !!B && mapa.get(X) === B, String(mapa.get(X) === B));
        if (!B) continue;

        // Ahora SI se destruye A de verdad: su `closed` llega TARDE.
        A.destroy();
        for (let i = 0; i < 40 && !A.isDestroyed(); i++) await esperar(100);
        await esperar(1200);                        // margen para el `closed`

        // EL CRITERIO, comprobado sobre el mapa real:
        ok(caso.id + ' el `closed` TARDIO de A NO desregistra a B: mapa.get(X) === B',
          mapa.get(X) === B,
          JSON.stringify({ tieneX: mapa.has(X), esB: mapa.get(X) === B, esA: mapa.get(X) === A, vacio: mapa.get(X) === undefined }));
        ok(caso.id + ' B sigue viva', !B.isDestroyed());

        // Control negativo: si se destruye B (que SI es la registrada), el
        // handler tiene que borrarla. Sin esto, "no borro nada" podria
        // significar simplemente que el handler no corre.
        B.destroy();
        for (let i = 0; i < 40 && mapa.has(X); i++) await esperar(100);
        ok(caso.id + ' control: al destruirse B, que SI es la registrada, el mapa se vacia',
          mapa.get(X) === undefined, JSON.stringify({ tieneX: mapa.has(X) }));
      }
      tlog('FIN ra8');
    }

    // =====================================================================
    if (MODO === 'ra9prep') {
      tlog('--- RA-9 (preparacion): se crea un proyecto y se sale ---');
      const C = await crearProyectoConBackups(lanzador, 'Servicio RA9');
      fs.writeFileSync(path.join(SB, 'ra9.json'), JSON.stringify({ pid: C.PID, part: C.fila.partition_name }), 'utf8');
      ok('RA-9/prep el proyecto queda creado', !!C.PID, String(C.PID));
      tlog('FIN ra9prep');
    }

    if (MODO === 'ra9') {
      tlog('--- RA-9: PS-2006 REAL en A2 (fail-closed al arrancar) ---');
      // Este modo NO espera al lanzador: con material no demostrable la app
      // hace fail-closed y no llega a abrirlo. Ese es justamente el criterio.
      const material = fs.existsSync(dirRestauraciones()) ? fs.readdirSync(dirRestauraciones()) : [];
      const contenidoAntes = {};
      for (const d of material) {
        try { contenidoAntes[d] = fs.readdirSync(path.join(dirRestauraciones(), d)).sort(); } catch (e) {}
      }
      info('material presente al arrancar: ' + JSON.stringify(contenidoAntes));
      // Se guarda entero y se imprime recortado: lo que se comprueba abajo es
      // el detalle COMPLETO, incluido su final, que es donde va el codigo.
      info('dialogos: ' + JSON.stringify(dialogos).slice(0, 700));
      info('final del detalle: ' + JSON.stringify(String((dialogos[0] || {}).detail || '').slice(-80)));

      const d = dialogos.find((x) => /restauraci/i.test(String(x.title || '')));
      ok('RA-9 aparece el dialogo de restauracion sin resolver',
        !!d, JSON.stringify(dialogos.map((x) => x.title)));
      ok('RA-9 el TITULO es el correcto',
        !!d && /qued[oó] sin resolver/i.test(String(d.title)), d && d.title);
      ok('RA-9 el DETALLE lleva el codigo PS-2006',
        !!d && /PS-2006/.test(String(d.detail || '')), d && String(d.detail || '').slice(0, 200));
      ok('RA-9 el DETALLE nombra la clase del problema y la carpeta de trabajo',
        !!d && /journal-no-demostrable|accion-no-demostrable|material-sin-journal|no-verificable/.test(String(d.detail || '')) &&
        String(d.detail || '').indexOf('.panorama-restauraciones') >= 0,
        d && String(d.detail || '').slice(0, 260));
      ok('RA-9 el DETALLE dice explicitamente que NO se ha tocado nada',
        !!d && /NO se ha restaurado ni deshecho nada/i.test(String(d.detail || '')));
      ok('RA-9 la app entra en camino de cierre (app.quit solicitado)',
        quitPedido > 0, String(quitPedido));
      ok('RA-9 el LANZADOR no llega a abrirse',
        ventanasCon('launcher/index.html').length === 0,
        JSON.stringify(BrowserWindow.getAllWindows().map((w) => { try { return w.webContents.getURL().slice(-40); } catch (e) { return '?'; } })));

      const despues = {};
      for (const dd of (fs.existsSync(dirRestauraciones()) ? fs.readdirSync(dirRestauraciones()) : [])) {
        try { despues[dd] = fs.readdirSync(path.join(dirRestauraciones(), dd)).sort(); } catch (e) {}
      }
      ok('RA-9 el material queda INTACTO: ninguna recuperacion destructiva',
        JSON.stringify(despues) === JSON.stringify(contenidoAntes) && Object.keys(despues).length > 0,
        JSON.stringify({ antes: contenidoAntes, despues }));
      tlog('FIN ra9');
    }

    tlog('=== FIN DEL MODO ' + MODO + ' ===');
    await esperar(800);
    app.exit(0);
  } catch (e) {
    tlog('EXCEPCION: ' + String((e && e.stack) || e));
    app.exit(5);
  }
});
