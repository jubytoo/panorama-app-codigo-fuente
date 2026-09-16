// ---------------------------------------------------------------------------
// BLOQUE 5 — ARRANQUES ELECTRON REALES Y DESTRUCTIVOS, en sandbox artificial.
//
// Envoltorio de AISLAMIENTO: redirige appData/userData a la carpeta de sandbox
// ANTES de cargar main.js, asi que la app real no encuentra el location.json
// del usuario y nunca apunta a G:. LOCALAPPDATA lo redirige quien lanza esto.
//
// BrowserWindow real + preload real + renderers reales. Las inyecciones de
// fallo se hacen sobre el MISMO modulo `db.js` que usa main.js (el cache de
// require lo garantiza), no sobre una copia.
// ---------------------------------------------------------------------------
const { app, BrowserWindow, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const arg = process.argv.find((a) => a.startsWith('--sandbox='));
if (!arg) { console.error('falta --sandbox='); process.exit(2); }
const SB = arg.slice('--sandbox='.length);
const MODO = (process.argv.find((a) => a.startsWith('--modo=')) || '--modo=nada').slice(7);

app.setPath('appData', path.join(SB, 'Roaming'));
app.setPath('userData', path.join(SB, 'Roaming', 'panorama-app'));
const UD = path.join(SB, 'Roaming', 'panorama-app');
const PROJDIR = 'C:/Codigo Fuente PS/panorama-app-codigo-fuente_1';

function tlog(s) { try { fs.appendFileSync(path.join(SB, 'test.log'), `[${new Date().toISOString()}] ${s}\n`); } catch (e) {} }
function ok(n, c, extra) { tlog((c ? 'OK    ' : 'FALLO ') + n + (c ? '' : '  -- ' + (extra === undefined ? '' : extra))); }
function info(s) { tlog('      ' + s); }

// Contador REAL de invocaciones IPC. Se instala ANTES de cargar main.js, asi
// que envuelve todos sus `ipcMain.handle` sin tocar su codigo: permite afirmar
// "no se llamo a candidateEval:removeCv" por conteo directo del canal, no por
// deducirlo de que el archivo siga ahi.
const { ipcMain } = require('electron');
const llamadasIPC = {};
const handleOrig = ipcMain.handle.bind(ipcMain);
ipcMain.handle = function (canal, fn) {
  return handleOrig(canal, function () {
    llamadasIPC[canal] = (llamadasIPC[canal] || 0) + 1;
    return fn.apply(this, arguments);
  });
};

require(PROJDIR + '/main.js');
const dbmod = require(PROJDIR + '/db.js');

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
async function esperarSinVentana(frag, tope = 20000) {
  const t0 = Date.now();
  for (;;) {
    if (ventanasCon(frag).length === 0) return true;
    if (Date.now() - t0 > tope) return false;
    await esperar(300);
  }
}

// --- estado observable -----------------------------------------------------
const nFilas = (t, w, p) => { try { return dbmod.get(`SELECT COUNT(*) n FROM ${t}` + (w ? ' WHERE ' + w : ''), p || []).n; } catch (e) { return -1; } };
const dirBorrados = () => path.join(UD, '.panorama-borrados');
const dirAcciones = () => path.join(UD, '.panorama-acciones');
function residuos() {
  const j = (d) => { try { return fs.readdirSync(d); } catch (e) { return []; } };
  return { borrados: j(dirBorrados()), acciones: j(dirAcciones()) };
}
function huella(dir) {
  if (!fs.existsSync(dir)) return 'NO-EXISTE';
  const out = [];
  const rec = (d, pre) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) rec(f, pre + e.name + '/');
      else out.push(pre + e.name + ':' + crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 10));
    }
  };
  rec(dir, '');
  return out.join('|');
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
// Ventana ESPIA: preload real del proyecto, pero NO registrada en
// projectWindows, asi que el borrado no la cierra. Sirve para comprobar que el
// bloqueo local impide escribir DURANTE el borrado.
function abrirEspia(pid) {
  const w = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(PROJDIR, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
      additionalArguments: [`--panorama-project-id=${pid}`, '--panorama-project-name=espia'],
    },
  });
  return w.loadFile(PROJDIR + '/dashboard/restore-helper.html').then(() => w);
}

// --- inyeccion de fallos sobre el db.js REAL de main.js --------------------
const escribirOriginal = dbmod.escribirMultiple;
let inyeccion = null;   // (sentencias) => 'base-cambiada' | 'post' | null
dbmod.escribirMultiple = function (sentencias, opts) {
  if (Array.isArray(sentencias) && sentencias.some((x) => /^DELETE FROM projects WHERE id=\?/.test(String(x && x.sql)))) {
    commitsDeBorrado.push({ n: sentencias.length, sqls: sentencias.map((x) => String(x.sql)), base: dbmod.getCommitActual() });
  }
  const modo = inyeccion ? inyeccion(sentencias) : null;
  if (modo === 'base-cambiada') {
    const e = new Error('otro equipo guardo mientras tanto (inyectado)');
    e.kind = 'base-cambiada';
    throw e;
  }
  const r = escribirOriginal.apply(dbmod, arguments);
  if (modo === 'post') {
    const e = new Error('no se pudo releer tras confirmar (inyectado)');
    e.aplicado = true; e.kind = 'io-tras-confirmar';
    throw e;
  }
  return r;
};
// Registro de los commits que borran un proyecto: sirve para demostrar que las
// CUATRO tablas van en UNA sola llamada a escribirMultiple, anclada a la base
// que el propio borrado capturo. Comparar con un commit tomado antes no vale:
// entre medias el cierre de ventanas dispara su guardado final (flushOnClose).
const commitsDeBorrado = [];
const esDeleteProyecto = (s) => Array.isArray(s) && s.some((x) => /^DELETE FROM projects WHERE id=\?/.test(String(x && x.sql)));
const esDeletePrep = (s) => Array.isArray(s) && s.some((x) => /^DELETE FROM meeting_preps WHERE id=\?/.test(String(x && x.sql)));
const esPurga = (s) => Array.isArray(s) && s.some((x) => /^DELETE FROM backups WHERE id=\?/.test(String(x && x.sql)));

// --- dialogo nativo del selector de CV, fijado a un fichero del sandbox ----
let cvElegido = null;
const openOriginal = dialog.showOpenDialogSync;
dialog.showOpenDialogSync = function () { return cvElegido ? [cvElegido] : null; };

// --- E7: la app hace FAIL-CLOSED de verdad ---------------------------------
// Con un borrado no demostrable pendiente, main.js muestra PS-2006 con
// `dialog.showMessageBoxSync` y cierra. Ese modal BLOQUEA el proceso principal
// y nadie lo puede descartar en una prueba automatizada. Se registra la llamada
// y se responde al instante; y `app.quit` se anota en vez de ejecutarse, para
// poder observar el estado que dejo la recuperacion antes de que el proceso
// muera. NO se altera la logica de recuperacion: solo el aviso y el cierre.
const dialogos = [];
const msgOriginal = dialog.showMessageBoxSync;
dialog.showMessageBoxSync = function (a, b) {
  const o = (b || a) || {};
  dialogos.push({ title: o.title, message: o.message, detail: String(o.detail || '').slice(0, 400) });
  tlog('      DIALOGO: ' + o.title + ' | ' + String(o.detail || '').slice(0, 160).replace(/\n/g, ' '));
  return 0;
};
let quitPedido = 0;
const quitOriginal = app.quit.bind(app);
if (MODO === 'e7') app.quit = function () { quitPedido++; tlog('      app.quit() solicitado (' + quitPedido + ')'); };

// ===========================================================================
async function crearProyectoCompleto(lanzador, nombre) {
  const row = await lanzador.webContents.executeJavaScript(
    `window.launcherAPI.createProject(${JSON.stringify(nombre)},'','',null)`);
  const PID = row.id;
  await lanzador.webContents.executeJavaScript(`window.launcherAPI.openProject(${PID})`);
  const vProj = await esperarVentana(`projects/${PID}/dashboard.html`);
  if (!vProj) throw new Error('no se abrio la ventana del proyecto');
  await esperar(2500);

  // datos en la particion Electron + tres backups reales por el IPC real
  const CLAVE = 'panorama_servicio_ib__panorama-servicio-full__proj-' + PID;
  for (let i = 1; i <= 3; i++) {
    await vProj.webContents.executeJavaScript(
      `localStorage.setItem(${JSON.stringify(CLAVE)}, JSON.stringify({projectTitle:'${nombre}',marca:'V${i}'})); 'ok'`);
    const g = await vProj.webContents.executeJavaScript(
      "(function(){var d={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);d[k]=localStorage.getItem(k);}"
      + "return window.panoramaBridge.saveBackup(JSON.stringify(d),'manual');})()");
    if (!g || g.aplicado !== true) throw new Error('backup ' + i + ' no aplicado: ' + JSON.stringify(g));
    await esperar(600);
  }

  // preparacion de reunion real — por el MENU real del proyecto.
  //
  // OJO: las ventanas de reunion y candidatos cargan EL MISMO archivo para
  // todos los proyectos, asi que identificarlas por URL devolvia la del
  // proyecto ANTERIOR. Se espera una ventana NUEVA, por id de BrowserWindow.
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
    const p = await vPrep.webContents.executeJavaScript(
      "window.panoramaBridge.saveMeetingPrep('2026-10-01','seguimiento',JSON.stringify({prep:'REAL'}))");
    if (!p || p.aplicado !== true) throw new Error('prep no aplicada: ' + JSON.stringify(p));
  }

  // evaluacion de candidatos real + CV real — tambien por el menu real
  const prevEval = idsPrev();
  await vProj.webContents.executeJavaScript(
    "window.panoramaBridge.projectMenuAction('proyecto-eval-candidatos')").catch(() => {});
  const vEval = await esperarNueva(prevEval, 'evaluacion_candidatos');
  if (vEval) {
    await esperar(1500);
    // La forma tiene que ser la REAL: renderAll() hace `puesto.tasks.reduce`,
    // asi que un puesto sin `tasks` revienta el renderer productivo. Se copian
    // los campos con los que la propia plantilla crea puestos y evaluaciones.
    const estadoCv = (cvFileName, cvStoredName) => JSON.stringify({
      puestos: [{ id: 'p1', name: 'Puesto', tasks: [], formacionMinima: '', aniosMinimos: '', sbaReferencia: '' }],
      evaluaciones: [{
        id: 'e1', candidato: 'Ana', puestoId: 'p1', tap: '', manager: '', entrevistador: '',
        telefono: '', fecha: '', formacion: '', aniosExperiencia: '', sba: '',
        cvFileName: cvFileName || null, cvStoredName: cvStoredName || null,
        notas: {}, feedbackEdited: null,
      }],
    });
    const e = await vEval.webContents.executeJavaScript(
      'window.panoramaBridge.saveCandidateEvalData(' + JSON.stringify(estadoCv(null, null)) + ')');
    if (!e || e.aplicado !== true) throw new Error('eval no aplicada: ' + JSON.stringify(e));
    cvElegido = path.join(SB, 'cv-origen.pdf');
    fs.writeFileSync(cvElegido, 'CV REAL DEL CANDIDATO', 'utf8');
    const cv = await vEval.webContents.executeJavaScript("window.panoramaBridge.pickCandidateCv('e1')");
    if (!cv || !cv.ok) throw new Error('cv no adjuntado: ' + JSON.stringify(cv));
    const e2 = await vEval.webContents.executeJavaScript(
      'window.panoramaBridge.saveCandidateEvalData(' + JSON.stringify(estadoCv('cv.pdf', cv.storedName)) + ')');
    if (!e2 || e2.aplicado !== true) throw new Error('eval con CV no aplicada: ' + JSON.stringify(e2));
  }

  const fila = dbmod.get('SELECT * FROM projects WHERE id=?', [PID]);
  const dirBk = path.join(UD, 'backups', fila.backup_dir);
  const dirDash = path.join(UD, 'projects', String(PID));
  return { PID, fila, dirBk, dirDash, vProj, vPrep, vEval, CLAVE };
}

function estadoCompleto(PID, dirBk, dirDash) {
  return {
    projects: nFilas('projects', 'id=?', [PID]),
    backups: nFilas('backups', 'project_id=?', [PID]),
    preps: nFilas('meeting_preps', 'project_id=?', [PID]),
    evals: nFilas('candidate_evals', 'project_id=?', [PID]),
    dirBk: fs.existsSync(dirBk), dirDash: fs.existsSync(dirDash),
    hBk: huella(dirBk), hDash: huella(dirDash),
    commit: dbmod.getCommitActual(),
    residuos: residuos(),
  };
}

// ===========================================================================
app.whenReady().then(async () => {
  if (MODO === 'nada') return;
  try {
    // E7 es el unico modo que NO espera al lanzador: con un borrado no
    // demostrable pendiente la app hace fail-closed y no llega a abrirlo.
    let lanzador = null;
    if (MODO !== 'e7') {
      lanzador = await esperarVentana('launcher/index.html');
      if (!lanzador) { tlog('ERROR: no aparecio el lanzador'); app.exit(3); return; }
      await esperar(1500);
    } else {
      await esperar(9000);   // tiempo para que corra toda la recuperacion
    }

    // =====================================================================
    if (MODO === 'e1') {
      tlog('--- E1: ELIMINAR PROYECTO REAL ---');
      const C = await crearProyectoCompleto(lanzador, 'Servicio E1');
      // El TESTIGO se crea SIN abrir ventanas: con ellas abiertas su
      // autoguardado cada ~15 s cambiaria su carpeta por su cuenta y
      // "no se ha tocado" dejaria de significar nada.
      const otroRow = await lanzador.webContents.executeJavaScript(
        "window.launcherAPI.createProject('Servicio Testigo','','',null)");
      const otroFila = dbmod.get('SELECT * FROM projects WHERE id=?', [otroRow.id]);
      const otro = {
        PID: otroRow.id, fila: otroFila,
        dirBk: path.join(UD, 'backups', otroFila.backup_dir || `${otroRow.id}-testigo`),
        dirDash: path.join(UD, 'projects', String(otroRow.id)),
      };
      fs.mkdirSync(otro.dirBk, { recursive: true });
      fs.writeFileSync(path.join(otro.dirBk, 'testigo.json'), 'NO TOCAR', 'utf8');
      fs.writeFileSync(path.join(SB, 'pid.txt'), String(C.PID), 'utf8');
      fs.writeFileSync(path.join(SB, 'pid-testigo.txt'), String(otro.PID), 'utf8');

      const PRE = estadoCompleto(C.PID, C.dirBk, C.dirDash);
      const preTestigo = estadoCompleto(otro.PID, otro.dirBk, otro.dirDash);
      info('PRE ' + JSON.stringify({ p: PRE.projects, b: PRE.backups, pr: PRE.preps, ev: PRE.evals, dirBk: PRE.dirBk, dirDash: PRE.dirDash }));
      ok('E1/PRE el proyecto tiene las cuatro familias de filas y sus carpetas',
        PRE.projects === 1 && PRE.backups >= 3 && PRE.preps >= 1 && PRE.evals === 1 && PRE.dirBk && PRE.dirDash,
        JSON.stringify({ p: PRE.projects, b: PRE.backups, pr: PRE.preps, ev: PRE.evals }));
      const partPre = await leerParticion(C.fila.partition_name);
      ok('E1/PRE la particion Electron tiene datos', !!(partPre && partPre[C.CLAVE]), JSON.stringify(Object.keys(partPre || {})));
      const cvs = (() => { try { return fs.readdirSync(path.join(C.dirBk, 'evaluacion-candidatos', 'cv')); } catch (e) { return []; } })();
      ok('E1/PRE el CV esta en disco', cvs.length >= 1, JSON.stringify(cvs));
      ok('E1/PRE las tres familias de ventanas del proyecto estan abiertas',
        !!C.vProj && !C.vProj.isDestroyed() && !!C.vPrep && !C.vPrep.isDestroyed() && !!C.vEval && !C.vEval.isDestroyed(),
        JSON.stringify({ proj: !!C.vProj, prep: !!C.vPrep, eval: !!C.vEval }));

      // --- ESPIA: intenta escribir DURANTE el borrado ---------------------
      const espia = await abrirEspia(C.PID);
      commitsDeBorrado.length = 0;

      // Se lanza el borrado por el LAUNCHER REAL y, sin esperarlo, se intenta
      // escribir: el bloqueo local se pone antes del primer await.
      const pBorrado = lanzador.webContents.executeJavaScript(
        `window.launcherAPI.deleteProject(${C.PID}).then(r => JSON.stringify(r))`);
      const intento = await espia.webContents.executeJavaScript(
        "window.panoramaBridge.saveBackup(JSON.stringify({x:1}),'manual').then(r=>JSON.stringify(r))");
      const r = JSON.parse(await pBorrado);
      info('resultado del borrado: ' + JSON.stringify(r));
      info('intento de escritura durante el borrado: ' + intento);
      const iObj = JSON.parse(intento);
      ok('E1/2 durante el borrado NO se puede escribir en ese proyecto',
        iObj.aplicado === false && /elimin/i.test(iObj.error || ''), intento);
      try { espia.close(); } catch (e) {}

      ok('E1) el borrado devuelve aplicado:true / verificado:true',
        r.aplicado === true && r.verificado === true, JSON.stringify(r));

      // Se comprueban LAS VENTANAS CONCRETAS de este proyecto, por identidad.
      for (let i = 0; i < 40 && !(C.vProj.isDestroyed() && C.vPrep.isDestroyed() && C.vEval.isDestroyed()); i++) await esperar(300);
      ok('E1/1 las tres familias de ventanas quedan cerradas',
        C.vProj.isDestroyed() && C.vPrep.isDestroyed() && C.vEval.isDestroyed(),
        JSON.stringify({ proj: C.vProj.isDestroyed(), prep: C.vPrep.isDestroyed(), eval: C.vEval.isDestroyed() }));

      const POST = estadoCompleto(C.PID, C.dirBk, C.dirDash);
      ok('E1/3 las cuatro tablas desaparecen',
        POST.projects === 0 && POST.backups === 0 && POST.preps === 0 && POST.evals === 0,
        JSON.stringify({ p: POST.projects, b: POST.backups, pr: POST.preps, ev: POST.evals }));
      // UN commit: una sola llamada a escribirMultiple, con los CUATRO DELETE
      // y la marca dentro, anclada a la base que capturo el propio borrado.
      // Comparar con un commit tomado antes de llamar no serviria: el cierre de
      // las ventanas dispara su guardado final por el camino de siempre.
      const cm = commitsDeBorrado;
      const hist = JSON.parse(dbmod.get("SELECT value FROM app_meta WHERE key='db_commit_history'").value);
      ok('E1/3 y desaparecen JUNTAS: UNA sola mutacion con los 4 DELETE + la marca',
        cm.length === 1 && cm[0].n === 5 &&
        cm[0].sqls.filter((s) => /^DELETE FROM (backups|meeting_preps|candidate_evals|projects)/.test(s)).length === 4 &&
        cm[0].sqls.some((s) => /INSERT INTO app_meta/.test(s)) &&
        hist[1] === cm[0].base,
        JSON.stringify({ llamadas: cm.length, n: cm[0] && cm[0].n, anclada: cm[0] && hist[1] === cm[0].base }));
      ok('E1/4 la carpeta de backups desaparece', !POST.dirBk);
      ok('E1/5 el dashboard horneado desaparece', !POST.dirDash);
      const partPost = await leerParticion(C.fila.partition_name);
      ok('E1/6 la particion queda vacia', !partPost || Object.keys(partPost).length === 0, JSON.stringify(partPost));
      ok('E1/7 cero cuarentena y cero journal residual',
        POST.residuos.borrados.length === 0 && POST.residuos.acciones.length === 0, JSON.stringify(POST.residuos));
      const lista = await lanzador.webContents.executeJavaScript('window.launcherAPI.listProjects()');
      ok('E1/8 el launcher ya no muestra el proyecto, y si el testigo',
        !lista.some((x) => x.id === C.PID) && lista.some((x) => x.id === otro.PID),
        JSON.stringify({ ids: lista.map((x) => x.id), borrado: C.PID, testigo: otro.PID }));
      const postTestigo = estadoCompleto(otro.PID, otro.dirBk, otro.dirDash);
      ok('E1) el proyecto TESTIGO no se ha tocado',
        postTestigo.projects === 1 && postTestigo.hBk === preTestigo.hBk && postTestigo.hDash === preTestigo.hDash);
      fs.writeFileSync(path.join(SB, 'e1-esperado.json'), JSON.stringify({ pid: C.PID, testigo: otro.PID, hBkTestigo: preTestigo.hBk }), 'utf8');
      tlog('FIN e1');
    }

    // =====================================================================
    if (MODO === 'e1b') {
      tlog('--- E1/9-11: TRAS CERRAR Y REABRIR ---');
      const esp = JSON.parse(fs.readFileSync(path.join(SB, 'e1-esperado.json'), 'utf8'));
      const lista = await lanzador.webContents.executeJavaScript('window.launcherAPI.listProjects()');
      ok('E1/11 el proyecto NO reaparece tras cerrar y reabrir',
        !lista.some((x) => x.id === esp.pid), JSON.stringify(lista.map((x) => x.id)));
      ok('E1/11 el testigo sigue ahi y con sus archivos intactos',
        lista.some((x) => x.id === esp.testigo) &&
        huella(path.join(UD, 'backups', dbmod.get('SELECT backup_dir FROM projects WHERE id=?', [esp.testigo]).backup_dir)) === esp.hBkTestigo);
      ok('E1/11 sin residuos tras el reinicio',
        residuos().borrados.length === 0 && residuos().acciones.length === 0, JSON.stringify(residuos()));
      tlog('FIN e1b');
    }

    // =====================================================================
    if (MODO === 'e2') {
      tlog('--- E2: D1 CON FALLO PRE-COMMIT ---');
      const C = await crearProyectoCompleto(lanzador, 'Servicio E2');
      fs.writeFileSync(path.join(SB, 'pid.txt'), String(C.PID), 'utf8');
      const PRE = estadoCompleto(C.PID, C.dirBk, C.dirDash);
      const partPre = await leerParticion(C.fila.partition_name);
      let vaciadas = 0;
      const fromPartOrig = session.fromPartition.bind(session);
      session.fromPartition = function (p) {
        const s = fromPartOrig(p);
        const cl = s.clearStorageData.bind(s);
        s.clearStorageData = function () { vaciadas++; return cl.apply(s, arguments); };
        return s;
      };
      inyeccion = (s) => (esDeleteProyecto(s) ? 'base-cambiada' : null);
      const r = JSON.parse(await lanzador.webContents.executeJavaScript(
        `window.launcherAPI.deleteProject(${C.PID}).then(r => JSON.stringify(r))`));
      inyeccion = null;
      session.fromPartition = fromPartOrig;
      info('resultado: ' + JSON.stringify(r));
      const POST = estadoCompleto(C.PID, C.dirBk, C.dirDash);
      ok('E2) el borrado NO se aplica y es reintentable',
        r.aplicado === false && r.reintentable === true, JSON.stringify(r));
      ok('E2) el proyecto sigue existiendo y las cuatro tablas estan intactas',
        POST.projects === PRE.projects && POST.backups === PRE.backups &&
        POST.preps === PRE.preps && POST.evals === PRE.evals,
        JSON.stringify({ PRE: [PRE.projects, PRE.backups, PRE.preps, PRE.evals], POST: [POST.projects, POST.backups, POST.preps, POST.evals] }));
      ok('E2) backups, reunion, evaluacion y CV intactos byte a byte', POST.hBk === PRE.hBk, 'huella distinta');
      ok('E2) el dashboard horneado intacto', POST.hDash === PRE.hDash);
      ok('E2) la particion NO se vacio', vaciadas === 0 && JSON.stringify(await leerParticion(C.fila.partition_name)) === JSON.stringify(partPre),
        'clearStorageData llamado ' + vaciadas + ' veces');
      ok('E2) el rollback termina: cero cuarentena y cero journal',
        POST.residuos.borrados.length === 0, JSON.stringify(POST.residuos));
      fs.writeFileSync(path.join(SB, 'e2-esperado.json'), JSON.stringify({ pid: C.PID, hBk: PRE.hBk, hDash: PRE.hDash, filas: [PRE.projects, PRE.backups, PRE.preps, PRE.evals] }), 'utf8');
      tlog('FIN e2');
    }

    if (MODO === 'e2b') {
      const esp = JSON.parse(fs.readFileSync(path.join(SB, 'e2-esperado.json'), 'utf8'));
      const fila = dbmod.get('SELECT * FROM projects WHERE id=?', [esp.pid]);
      const dirBk = fila ? path.join(UD, 'backups', fila.backup_dir) : '';
      ok('E2) tras reiniciar, todo sigue accesible',
        !!fila && huella(dirBk) === esp.hBk &&
        huella(path.join(UD, 'projects', String(esp.pid))) === esp.hDash &&
        nFilas('backups', 'project_id=?', [esp.pid]) === esp.filas[1] &&
        nFilas('meeting_preps', 'project_id=?', [esp.pid]) === esp.filas[2] &&
        nFilas('candidate_evals', 'project_id=?', [esp.pid]) === esp.filas[3],
        JSON.stringify({ fila: !!fila, bk: huella(dirBk) === esp.hBk }));
      // y se puede volver a abrir de verdad
      await lanzador.webContents.executeJavaScript(`window.launcherAPI.openProject(${esp.pid})`);
      ok('E2) el proyecto se vuelve a abrir sin problemas', !!(await esperarVentana(`projects/${esp.pid}/dashboard.html`)));
      tlog('FIN e2b');
    }

    // =====================================================================
    if (MODO === 'e3') {
      tlog('--- E3: D1 APLICADO / NO VERIFICADO (forma 3 en Electron real) ---');
      const C = await crearProyectoCompleto(lanzador, 'Servicio E3');
      fs.writeFileSync(path.join(SB, 'pid.txt'), String(C.PID), 'utf8');
      let vecesDelete = 0;
      inyeccion = (s) => { if (esDeleteProyecto(s)) { vecesDelete++; return 'post'; } return null; };
      const r = JSON.parse(await lanzador.webContents.executeJavaScript(
        `window.launcherAPI.deleteProject(${C.PID}).then(r => JSON.stringify(r))`));
      inyeccion = null;
      info('resultado: ' + JSON.stringify(r));
      ok('E3) forma 3 dentro de un Electron real: aplicado:true / verificado:false / requiereReinicio',
        r.ok === true && r.aplicado === true && r.verificado === false && r.requiereReinicio === true && typeof r.aviso === 'string',
        JSON.stringify(r));
      ok('E3) el proyecto esta eliminado segun la BD confirmada',
        nFilas('projects', 'id=?', [C.PID]) === 0 && nFilas('backups', 'project_id=?', [C.PID]) === 0 &&
        nFilas('meeting_preps', 'project_id=?', [C.PID]) === 0 && nFilas('candidate_evals', 'project_id=?', [C.PID]) === 0);
      ok('E3) NO hubo rollback: la carpeta y el dashboard no vuelven',
        !fs.existsSync(C.dirBk) && !fs.existsSync(C.dirDash));
      ok('E3) el delete se ejecuto UNA sola vez', vecesDelete === 1, String(vecesDelete));
      // el renderer real del launcher NO lo trata como reintentable
      const estado = await lanzador.webContents.executeJavaScript(
        "(function(){var e=document.getElementById('status'); return e? e.textContent : '(sin status)';})()").catch(() => '(no leible)');
      info('status del launcher: ' + estado);
      fs.writeFileSync(path.join(SB, 'e3-esperado.json'), JSON.stringify({ pid: C.PID, actionId: r.actionId }), 'utf8');
      tlog('FIN e3');
    }

    if (MODO === 'e3b') {
      const esp = JSON.parse(fs.readFileSync(path.join(SB, 'e3-esperado.json'), 'utf8'));
      const lista = await lanzador.webContents.executeJavaScript('window.launcherAPI.listProjects()');
      ok('E3) tras reiniciar el proyecto NO reaparece', !lista.some((x) => x.id === esp.pid), JSON.stringify(lista.map((x) => x.id)));
      ok('E3) y no quedan residuos del borrado',
        residuos().borrados.length === 0, JSON.stringify(residuos()));
      tlog('FIN e3b');
    }

    // =====================================================================
    if (MODO === 'e4') {
      tlog('--- E4: MEETING DELETE REAL ---');
      const C = await crearProyectoCompleto(lanzador, 'Servicio E4');
      fs.writeFileSync(path.join(SB, 'pid.txt'), String(C.PID), 'utf8');
      const vPrep = ventanasCon('preparacion_reunion')[0];
      if (!vPrep) { ok('E4) hay ventana de preparacion', false, 'no se abrio'); }
      else {
        // segunda preparacion, para poder comprobar que solo desaparece una
        await vPrep.webContents.executeJavaScript(
          "window.panoramaBridge.saveMeetingPrep('2026-11-01','otra',JSON.stringify({prep:'SEGUNDA'}))");
        await esperar(600);
        const preps = dbmod.all('SELECT * FROM meeting_preps WHERE project_id=? ORDER BY id', [C.PID]);
        ok('E4/PRE hay dos preparaciones reales con su archivo', preps.length === 2 &&
          preps.every((p) => fs.existsSync(path.join(C.dirBk, 'reuniones', p.file_path))), JSON.stringify(preps.map((p) => p.file_path)));
        const p1 = preps[0];
        const f1 = path.join(C.dirBk, 'reuniones', p1.file_path);

        // --- camino feliz, por la interfaz real -------------------------
        const r = JSON.parse(await vPrep.webContents.executeJavaScript(
          `window.panoramaBridge.deleteMeetingPrep(${p1.id}).then(r=>JSON.stringify(r))`));
        ok('E4) borrado feliz: aplicado:true / verificado:true', r.aplicado === true && r.verificado === true, JSON.stringify(r));
        ok('E4) la fila desaparece', nFilas('meeting_preps', 'id=?', [p1.id]) === 0);
        ok('E4) el archivo desaparece', !fs.existsSync(f1));
        ok('E4) la otra preparacion sigue', nFilas('meeting_preps', 'project_id=?', [C.PID]) === 1);
        const hist = await vPrep.webContents.executeJavaScript('window.panoramaBridge.listMeetingPreps()');
        ok('E4) el historial real se actualiza', !!(hist && hist.ok && Array.isArray(hist.preps) && hist.preps.length === 1),
          JSON.stringify(hist && hist.preps ? hist.preps.length : hist));
        ok('E4) sin cuarentena ni journal residual', residuos().borrados.length === 0, JSON.stringify(residuos()));

        // --- fallo PRE-confirmacion -------------------------------------
        const p2 = dbmod.all('SELECT * FROM meeting_preps WHERE project_id=?', [C.PID])[0];
        const f2 = path.join(C.dirBk, 'reuniones', p2.file_path);
        const h2 = fs.readFileSync(f2, 'utf8');
        inyeccion = (s) => (esDeletePrep(s) ? 'base-cambiada' : null);
        const r2 = JSON.parse(await vPrep.webContents.executeJavaScript(
          `window.panoramaBridge.deleteMeetingPrep(${p2.id}).then(r=>JSON.stringify(r))`));
        inyeccion = null;
        ok('E4) fallo PRE-confirmacion: no aplicado y reintentable', r2.aplicado === false && r2.reintentable === true, JSON.stringify(r2));
        ok('E4) el archivo vuelve byte a byte', fs.existsSync(f2) && fs.readFileSync(f2, 'utf8') === h2);
        ok('E4) la fila sigue', nFilas('meeting_preps', 'id=?', [p2.id]) === 1);
        const leida = await vPrep.webContents.executeJavaScript(`window.panoramaBridge.getMeetingPrep(${p2.id})`);
        ok('E4) la preparacion se puede abrir de verdad tras el fallo', !!(leida && leida.ok), JSON.stringify(leida && leida.ok));
        fs.writeFileSync(path.join(SB, 'e4-esperado.json'), JSON.stringify({ pid: C.PID, prepId: p2.id, sha: crypto.createHash('sha256').update(h2).digest('hex') }), 'utf8');

        // --- forma 3 ----------------------------------------------------
        await vPrep.webContents.executeJavaScript(
          "window.panoramaBridge.saveMeetingPrep('2026-12-01','tercera',JSON.stringify({prep:'TERCERA'}))");
        await esperar(600);
        const p3 = dbmod.all('SELECT * FROM meeting_preps WHERE project_id=? ORDER BY id DESC', [C.PID])[0];
        let veces = 0;
        inyeccion = (s) => { if (esDeletePrep(s)) { veces++; return 'post'; } return null; };
        const r3 = JSON.parse(await vPrep.webContents.executeJavaScript(
          `window.panoramaBridge.deleteMeetingPrep(${p3.id}).then(r=>JSON.stringify(r))`));
        inyeccion = null;
        ok('E4) forma 3: aplicado sin verificar y requiere reinicio',
          r3.ok === true && r3.aplicado === true && r3.verificado === false && r3.requiereReinicio === true, JSON.stringify(r3));
        ok('E4) forma 3: la fila YA no esta y NO se reintenta',
          nFilas('meeting_preps', 'id=?', [p3.id]) === 0 && veces === 1, String(veces));
      }
      tlog('FIN e4');
    }

    if (MODO === 'e4b') {
      const esp = JSON.parse(fs.readFileSync(path.join(SB, 'e4-esperado.json'), 'utf8'));
      const fila = dbmod.get('SELECT * FROM meeting_preps WHERE id=?', [esp.prepId]);
      const proj = dbmod.get('SELECT * FROM projects WHERE id=?', [esp.pid]);
      const f = fila && proj ? path.join(UD, 'backups', proj.backup_dir, 'reuniones', fila.file_path) : '';
      ok('E4) tras reiniciar, la preparacion del fallo PRE sigue accesible byte a byte',
        !!fila && fs.existsSync(f) && crypto.createHash('sha256').update(fs.readFileSync(f, 'utf8')).digest('hex') === esp.sha,
        JSON.stringify({ fila: !!fila, existe: fs.existsSync(f) }));
      ok('E4) la borrada en el camino feliz NO vuelve', nFilas('meeting_preps', 'project_id=?', [esp.pid]) === 1,
        String(nFilas('meeting_preps', 'project_id=?', [esp.pid])));
      tlog('FIN e4b');
    }

    // =====================================================================
    if (MODO === 'e5') {
      tlog('--- E5: PURGA REAL ---');
      const C = await crearProyectoCompleto(lanzador, 'Servicio E5');
      const vProj = ventanasCon(`projects/${C.PID}/dashboard.html`)[0];
      const guardar = async (marca) => {
        await vProj.webContents.executeJavaScript(
          `localStorage.setItem(${JSON.stringify(C.CLAVE)}, JSON.stringify({projectTitle:'Servicio E5',marca:${JSON.stringify(marca)}})); 'ok'`);
        return vProj.webContents.executeJavaScript(
          "(function(){var d={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);d[k]=localStorage.getItem(k);}"
          + "return window.panoramaBridge.saveBackup(JSON.stringify(d),'manual');})()");
      };
      for (let i = 4; i <= 17; i++) { await guardar('V' + i); await esperar(250); }
      const antes = dbmod.all('SELECT id, file_path, created_at FROM backups WHERE project_id=? ORDER BY created_at DESC', [C.PID]);
      ok('E5/PRE hay mas backups que BACKUP_KEEP antes de la ultima purga', antes.length === 15, String(antes.length));

      // un archivo que NO pertenece a ningun conjunto capturado
      const ajeno = path.join(C.dirBk, 'zz-no-es-un-backup.json');
      fs.writeFileSync(ajeno, 'NO TOCAR', 'utf8');

      const mantener = antes.slice(0, 14).map((b) => b.file_path);
      const r = await guardar('V-NUEVO');
      await esperar(500);
      ok('E5) el backup NUEVO queda confirmado', !!r && r.aplicado === true && r.verificado === true, JSON.stringify(r));
      const tras = dbmod.all('SELECT id, file_path FROM backups WHERE project_id=? ORDER BY created_at DESC', [C.PID]);
      ok('E5) se mantiene el limite y los mas recientes permanecen',
        tras.length === 15 && mantener.every((f) => tras.some((b) => b.file_path === f)),
        JSON.stringify({ n: tras.length }));
      ok('E5) cada fila que queda tiene su archivo en disco',
        tras.every((b) => !b.file_path || fs.existsSync(path.join(C.dirBk, b.file_path))));
      ok('E5) ningun archivo fuera del conjunto capturado desaparece',
        fs.existsSync(ajeno) && fs.readFileSync(ajeno, 'utf8') === 'NO TOCAR');
      ok('E5) camino feliz: cero journal y cero cuarentena residual',
        residuos().borrados.length === 0, JSON.stringify(residuos()));

      // --- purga rota ---------------------------------------------------
      const nAntes = nFilas('backups', 'project_id=?', [C.PID]);
      const archAntes = fs.readdirSync(C.dirBk).filter((f) => /^backup_/.test(f)).length;
      inyeccion = (s) => (esPurga(s) ? 'base-cambiada' : null);
      const r2 = await guardar('V-CON-PURGA-ROTA');
      inyeccion = null;
      await esperar(500);
      ok('E5) con la purga rota, el backup nuevo SIGUE siendo exito',
        !!r2 && r2.ok === true && r2.aplicado === true && r2.verificado === true, JSON.stringify(r2));
      ok('E5) la UI NO recibe que el backup fallo: el fallo va en `purga`, aparte',
        r2.purga && r2.purga.ok === false && r2.purga.aplicado === false, JSON.stringify(r2.purga));
      ok('E5) y nada se purgo: filas y archivos siguen',
        nFilas('backups', 'project_id=?', [C.PID]) === nAntes + 1 &&
        fs.readdirSync(C.dirBk).filter((f) => /^backup_/.test(f)).length === archAntes + 1,
        JSON.stringify({ filas: nFilas('backups', 'project_id=?', [C.PID]), esperado: nAntes + 1 }));
      const log = (() => { try { return fs.readFileSync(path.join(UD, 'app.log'), 'utf8'); } catch (e) { return ''; } })();
      ok('E5) el mantenimiento queda registrado APARTE en app.log',
        /Backup guardado OK/.test(log) && /Purga de backups NO aplicada/.test(log));
      tlog('FIN e5');
    }

    // =====================================================================
    if (MODO === 'e6') {
      tlog('--- E6: CV REAL ---');
      const C = await crearProyectoCompleto(lanzador, 'Servicio E6');
      const vEval = ventanasCon('evaluacion_candidatos')[0];
      if (!vEval) { ok('E6) hay ventana de candidatos', false, 'no se abrio'); }
      else {
        const dirCv = path.join(C.dirBk, 'evaluacion-candidatos', 'cv');
        const estadoJson = path.join(C.dirBk, 'evaluacion-candidatos', 'estado.json');
        const leerEstado = () => { try { return JSON.parse(fs.readFileSync(estadoJson, 'utf8')); } catch (e) { return null; } };
        const cvsEnDisco = () => { try { return fs.readdirSync(dirCv); } catch (e) { return []; } };

        // El renderer cargo su `state` al abrirse, ANTES de que el arnes
        // guardara la evaluacion por IPC: hay que recargarlo del disco antes
        // de tocarlo, o `state.evaluaciones` esta vacio.
        await vEval.webContents.executeJavaScript('loadState().then(() => "ok")');

        // --- QUITAR, camino feliz, por la interfaz real -----------------
        const antesCv = cvsEnDisco();
        ok('E6/PRE hay un CV real en disco y referenciado en el estado',
          antesCv.length === 1 && (leerEstado() || {}).evaluaciones[0].cvStoredName === antesCv[0], JSON.stringify(antesCv));
        const r = await vEval.webContents.executeJavaScript(`(async () => {
          const ev = state.evaluaciones.find(x => x.id === 'e1');
          const stored = ev.cvStoredName;
          ev.cvFileName = null; ev.cvStoredName = null;
          const g = await saveState(true);
          if (!g || g.aplicado !== true) return JSON.stringify({ fase: 'no-aplicado', g });
          if (g.verificado === false) return JSON.stringify({ fase: 'forma3', g });
          await window.panoramaBridge.removeCandidateCv(stored);
          return JSON.stringify({ fase: 'feliz', g });
        })()`);
        const rj = JSON.parse(r);
        ok('E6/quitar feliz: el estado se guarda PRIMERO y solo despues desaparece el CV',
          rj.fase === 'feliz' && (leerEstado() || {}).evaluaciones[0].cvStoredName === null && cvsEnDisco().length === 0,
          JSON.stringify({ fase: rj.fase, cvs: cvsEnDisco() }));
        const releido = await vEval.webContents.executeJavaScript('window.panoramaBridge.getCandidateEvalData()');
        ok('E6/quitar feliz: al releer del disco, la evaluacion queda SIN CV',
          releido.ok && releido.payload.evaluaciones[0].cvStoredName === null, JSON.stringify(releido.payload && releido.payload.evaluaciones));

        // --- QUITAR con NO APLICADO --------------------------------------
        cvElegido = path.join(SB, 'cv-2.pdf'); fs.writeFileSync(cvElegido, 'CV SEGUNDO', 'utf8');
        const cv2 = await vEval.webContents.executeJavaScript("window.panoramaBridge.pickCandidateCv('e1')");
        await vEval.webContents.executeJavaScript(`(async () => {
          const ev = state.evaluaciones.find(x => x.id === 'e1');
          ev.cvFileName = 'cv2.pdf'; ev.cvStoredName = ${JSON.stringify(cv2.storedName)};
          return JSON.stringify(await saveState(true));
        })()`);
        const cvsAntes = cvsEnDisco();
        inyeccion = () => 'base-cambiada';
        const rna = JSON.parse(await vEval.webContents.executeJavaScript(`(async () => {
          const ev = state.evaluaciones.find(x => x.id === 'e1');
          const antes = { f: ev.cvFileName, s: ev.cvStoredName };
          ev.cvFileName = null; ev.cvStoredName = null;
          const g = await saveState(true);
          if (!g || g.aplicado !== true) { ev.cvFileName = antes.f; ev.cvStoredName = antes.s; return JSON.stringify({ fase:'no-aplicado', ref: ev.cvStoredName }); }
          return JSON.stringify({ fase: 'otra', g });
        })()`));
        inyeccion = null;
        ok('E6/quitar no aplicado: el estado vuelve a referenciar el CV viejo y el CV fisico sigue',
          rna.fase === 'no-aplicado' && rna.ref === cv2.storedName && JSON.stringify(cvsEnDisco()) === JSON.stringify(cvsAntes),
          JSON.stringify({ rna, cvs: cvsEnDisco() }));

        // --- CAMBIAR: feliz (nuevo con nonce, viejo se retira despues) ---
        cvElegido = path.join(SB, 'cv-3.pdf'); fs.writeFileSync(cvElegido, 'CV TERCERO', 'utf8');
        const viejo = cv2.storedName;
        const rc = JSON.parse(await vEval.webContents.executeJavaScript(`(async () => {
          const ev = state.evaluaciones.find(x => x.id === 'e1');
          const res = await window.panoramaBridge.pickCandidateCv('e1');
          if (!res || !res.ok) return JSON.stringify({ fase:'pick-fallo', res });
          const viejoStored = ev.cvStoredName;
          ev.cvFileName = res.fileName; ev.cvStoredName = res.storedName;
          const g = await saveState(true);
          if (!g || g.aplicado !== true) return JSON.stringify({ fase:'no-aplicado', nuevo: res.storedName });
          if (g.verificado === false) return JSON.stringify({ fase:'forma3', nuevo: res.storedName, viejo: viejoStored });
          await window.panoramaBridge.removeCandidateCv(viejoStored);
          return JSON.stringify({ fase:'feliz', nuevo: res.storedName, viejo: viejoStored });
        })()`));
        ok('E6/cambiar feliz: el nuevo se copia primero con nonce y el viejo desaparece DESPUES',
          rc.fase === 'feliz' && rc.nuevo !== rc.viejo && /__\d+_[0-9a-f]{16}\./.test(rc.nuevo) &&
          cvsEnDisco().length === 1 && cvsEnDisco()[0] === rc.nuevo,
          JSON.stringify({ rc, cvs: cvsEnDisco() }));
        void viejo;

        // --- CAMBIAR con FORMA 3: quedan los DOS -------------------------
        cvElegido = path.join(SB, 'cv-4.pdf'); fs.writeFileSync(cvElegido, 'CV CUARTO', 'utf8');
        inyeccion = () => 'post';
        const rf3 = JSON.parse(await vEval.webContents.executeJavaScript(`(async () => {
          const ev = state.evaluaciones.find(x => x.id === 'e1');
          const res = await window.panoramaBridge.pickCandidateCv('e1');
          const viejoStored = ev.cvStoredName;
          ev.cvFileName = res.fileName; ev.cvStoredName = res.storedName;
          const g = await saveState(true);
          if (g && g.aplicado === true && g.verificado === false) return JSON.stringify({ fase:'forma3', nuevo: res.storedName, viejo: viejoStored });
          return JSON.stringify({ fase:'otra', g, nuevo: res.storedName, viejo: viejoStored });
        })()`));
        inyeccion = null;
        const banner = await vEval.webContents.executeJavaScript(
          "(function(){var e=document.getElementById('avisoSesionDetenida'); return e ? e.textContent : null;})()");
        const permitidas = await vEval.webContents.executeJavaScript('mutacionesPermitidas()');
        ok('E6/cambiar forma 3: quedan LOS DOS CV en disco, nada se destruye',
          rf3.fase === 'forma3' && cvsEnDisco().length === 2 &&
          cvsEnDisco().indexOf(rf3.nuevo) >= 0 && cvsEnDisco().indexOf(rf3.viejo) >= 0,
          JSON.stringify({ rf3, cvs: cvsEnDisco() }));
        ok('E6/forma 3: banner persistente visible y sesion detenida',
          typeof banner === 'string' && banner.length > 0 && permitidas === false,
          JSON.stringify({ banner: (banner || '').slice(0, 60), permitidas }));
        const trasDetener = await vEval.webContents.executeJavaScript('saveState(true).then(r => JSON.stringify(r))');
        ok('E6/forma 3: con la sesion detenida saveState devuelve contrato aplicado:false, no undefined',
          JSON.parse(trasDetener).aplicado === false, trasDetener);
      }
      tlog('FIN e6');
    }

    // =====================================================================
    if (MODO === 'e6b') {
      tlog('--- E6b: CV, los dos casos que faltaban, CON CLIC REAL ---');
      const C = await crearProyectoCompleto(lanzador, 'Servicio E6B');
      const vEval = C.vEval;
      if (!vEval) { ok('E6b) hay ventana de candidatos', false, 'no se abrio'); }
      else {
        const dirCv = path.join(C.dirBk, 'evaluacion-candidatos', 'cv');
        const estadoJson = path.join(C.dirBk, 'evaluacion-candidatos', 'estado.json');
        const leerEstado = () => { try { return JSON.parse(fs.readFileSync(estadoJson, 'utf8')); } catch (e) { return null; } };
        const cvs = () => { try { return fs.readdirSync(dirCv); } catch (e) { return []; } };
        const shaDe = (f) => { try { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); } catch (e) { return 'NO-EXISTE'; } };

        // Espia de borrados de CV EN EL PROCESO PRINCIPAL: registra cualquier
        // intento de unlink dentro de la carpeta cv/. No cambia el
        // comportamiento; solo permite afirmar "ni siquiera se intento".
        const intentos = [];
        const unlinkOrig = fs.unlinkSync;
        fs.unlinkSync = function (p) {
          const s = String(p);
          if (s.toLowerCase().indexOf(path.sep + 'cv' + path.sep) >= 0) intentos.push(path.basename(s));
          return unlinkOrig.apply(fs, arguments);
        };
        // shell.openPath se instrumenta para poder comprobar que el CV viejo
        // "abre" por el camino real sin lanzar un visor de PDF de verdad.
        const shellMod = require('electron').shell;
        const abiertos = [];
        const openPathOrig = shellMod.openPath;
        shellMod.openPath = function (p) { abiertos.push(String(p)); return Promise.resolve(''); };

        // Solo se inyecta en el commit de candidate_evals: el resto de la app
        // (autoguardados, backups) tiene que seguir funcionando.
        const esGuardadoEval = (s) => Array.isArray(s) && s.some((x) => /INSERT INTO candidate_evals/.test(String(x && x.sql)));
        let vecesGuardadoEval = 0;
        const contarGuardados = (s) => { if (esGuardadoEval(s)) vecesGuardadoEval++; return null; };

        // El renderer cargo su state al abrirse; hay que traerlo del disco y
        // PINTAR, porque a partir de aqui se pulsan botones de verdad.
        await vEval.webContents.executeJavaScript('loadState().then(() => { renderAll(); return "ok"; })');
        const hayBotones = await vEval.webContents.executeJavaScript(
          "!!document.querySelector('[data-action=\"quitar-cv\"][data-id=\"e1\"]') && !!document.querySelector('[data-action=\"cambiar-cv\"][data-id=\"e1\"]')");
        ok('E6b/PRE el renderer productivo ha pintado los botones reales de CV', hayBotones === true, String(hayBotones));

        // =================================================================
        // CV-ELECTRON-REPLACE-NOAPLICADO  (va primero: deja la sesion viva)
        // =================================================================
        const viejoNombre = cvs()[0];
        const viejoRuta = path.join(dirCv, viejoNombre);
        const viejoSha = shaDe(viejoRuta);
        ok('E6b/REPLACE PRE hay exactamente un CV y el estado lo referencia',
          cvs().length === 1 && (leerEstado() || {}).evaluaciones[0].cvStoredName === viejoNombre,
          JSON.stringify({ cvs: cvs(), ref: (leerEstado() || {}).evaluaciones[0].cvStoredName }));

        cvElegido = path.join(SB, 'cv-nuevo-noaplicado.pdf');
        fs.writeFileSync(cvElegido, 'CV NUEVO QUE NO SE LLEGA A CONFIRMAR', 'utf8');
        intentos.length = 0; vecesGuardadoEval = 0;
        inyeccion = (s) => { contarGuardados(s); return esGuardadoEval(s) ? 'base-cambiada' : null; };
        const clic1 = await vEval.webContents.executeJavaScript(`(function(){
          const b = document.querySelector('[data-action="cambiar-cv"][data-id="e1"]');
          if (!b) return 'NO-BOTON';
          b.click();
          return 'clic';
        })()`);
        await esperar(4000);
        inyeccion = null;
        info('REPLACE-NOAPLICADO clic=' + clic1 + ' intentos=' + JSON.stringify(intentos) + ' guardados=' + vecesGuardadoEval);

        const refTrasReplace = await vEval.webContents.executeJavaScript(
          "JSON.stringify((state.evaluaciones.find(x=>x.id==='e1')||{}))");
        const evRef = JSON.parse(refTrasReplace);
        ok('CV-ELECTRON-REPLACE-NOAPLICADO el CV viejo sigue byte a byte intacto',
          fs.existsSync(viejoRuta) && shaDe(viejoRuta) === viejoSha, JSON.stringify({ existe: fs.existsSync(viejoRuta) }));
        ok('CV-ELECTRON-REPLACE-NOAPLICADO el state vuelve a apuntar al CV viejo',
          evRef.cvStoredName === viejoNombre, refTrasReplace);
        ok('CV-ELECTRON-REPLACE-NOAPLICADO solo se retira el CV nuevo, y solo ese',
          intentos.length === 1 && intentos[0] !== viejoNombre && cvs().length === 1 && cvs()[0] === viejoNombre,
          JSON.stringify({ intentos, cvs: cvs() }));
        const releido1 = await vEval.webContents.executeJavaScript('window.panoramaBridge.getCandidateEvalData()');
        ok('CV-ELECTRON-REPLACE-NOAPLICADO al releer DEL DISCO sigue referenciado el CV viejo',
          releido1.ok && releido1.payload.evaluaciones[0].cvStoredName === viejoNombre,
          JSON.stringify(releido1.payload && releido1.payload.evaluaciones[0]));
        ok('CV-ELECTRON-REPLACE-NOAPLICADO cero perdida: el estado en disco no cambio',
          (leerEstado() || {}).evaluaciones[0].cvStoredName === viejoNombre);

        // =================================================================
        // CV-ELECTRON-RM-FORMA3
        // =================================================================
        intentos.length = 0; vecesGuardadoEval = 0;
        inyeccion = (s) => { contarGuardados(s); return esGuardadoEval(s) ? 'post' : null; };
        const clic2 = await vEval.webContents.executeJavaScript(`(function(){
          const b = document.querySelector('[data-action="quitar-cv"][data-id="e1"]');
          if (!b) return 'NO-BOTON';
          b.click();
          const okb = document.getElementById('confirmOk');
          if (!okb) return 'NO-CONFIRM';
          okb.click();
          return 'clic+confirmar';
        })()`);
        await esperar(4000);
        inyeccion = null;
        info('RM-FORMA3 clic=' + clic2 + ' intentos=' + JSON.stringify(intentos) + ' guardados=' + vecesGuardadoEval);

        const banner = await vEval.webContents.executeJavaScript(
          "(function(){var e=document.getElementById('avisoSesionDetenida'); return e ? e.textContent : null;})()");
        const permitidas = await vEval.webContents.executeJavaScript('mutacionesPermitidas()');
        const contrato = await vEval.webContents.executeJavaScript('saveState(true).then(r => JSON.stringify(r))');

        ok('CV-ELECTRON-RM-FORMA3 el estado confirmado queda SIN CV',
          (leerEstado() || {}).evaluaciones[0].cvStoredName === null,
          JSON.stringify((leerEstado() || {}).evaluaciones[0]));
        ok('CV-ELECTRON-RM-FORMA3 el CV fisico viejo SE CONSERVA byte a byte',
          fs.existsSync(viejoRuta) && shaDe(viejoRuta) === viejoSha && cvs().length === 1,
          JSON.stringify({ cvs: cvs() }));
        ok('CV-ELECTRON-RM-FORMA3 ni siquiera se INTENTA borrarlo',
          intentos.length === 0, JSON.stringify(intentos));
        ok('CV-ELECTRON-RM-FORMA3 banner persistente y mutaciones detenidas',
          typeof banner === 'string' && banner.length > 0 && permitidas === false,
          JSON.stringify({ banner: (banner || '').slice(0, 50), permitidas }));
        // OJO CON LA ETIQUETA: esto es un SEGUNDO saveState(true), lanzado por
        // el arnes DESPUES de que la forma 3 detuviera la sesion. Lo que
        // devuelve el saveState ORIGINAL de la rama quitar-cv se comprueba
        // aparte, en el modo e6d (CV-RM-F3-RETURN), y es
        // aplicado:true/verificado:false/requiereReinicio:true.
        ok('CV-ELECTRON-RM-FORMA3 un SEGUNDO saveState(true), ya detenida la sesion, devuelve aplicado:false',
          JSON.parse(contrato).aplicado === false && JSON.parse(contrato).reintentable === false, contrato);
        ok('CV-ELECTRON-RM-FORMA3 ningun segundo guardado ni reintento',
          vecesGuardadoEval === 1, String(vecesGuardadoEval));

        fs.unlinkSync = unlinkOrig;
        shellMod.openPath = openPathOrig;
        fs.writeFileSync(path.join(SB, 'e6b-esperado.json'), JSON.stringify({
          pid: C.PID, dirCv, estadoJson, viejoNombre, viejoSha,
        }), 'utf8');
        void abiertos;
      }
      tlog('FIN e6b');
    }

    if (MODO === 'e6c') {
      const esp = JSON.parse(fs.readFileSync(path.join(SB, 'e6b-esperado.json'), 'utf8'));
      const leerEstado = () => { try { return JSON.parse(fs.readFileSync(esp.estadoJson, 'utf8')); } catch (e) { return null; } };
      const shaDe = (f) => { try { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); } catch (e) { return 'NO-EXISTE'; } };
      const viejoRuta = path.join(esp.dirCv, esp.viejoNombre);
      ok('CV-ELECTRON-RM-FORMA3 tras cerrar y reabrir: el estado sigue SIN CV',
        (leerEstado() || {}).evaluaciones[0].cvStoredName === null,
        JSON.stringify((leerEstado() || {}).evaluaciones[0]));
      ok('CV-ELECTRON-RM-FORMA3 tras reabrir: el archivo antiguo queda huerfano pero EXISTE, byte a byte',
        fs.existsSync(viejoRuta) && shaDe(viejoRuta) === esp.viejoSha);
      ok('CV-ELECTRON-RM-FORMA3 cero perdida: ningun otro archivo desaparecio',
        fs.readdirSync(esp.dirCv).length === 1);
      // Y el CV viejo "abre" por el camino real (sin lanzar visor: se
      // instrumenta shell.openPath para no abrir nada en la maquina).
      const shellMod = require('electron').shell;
      const openPathOrig = shellMod.openPath;
      const abiertos = [];
      shellMod.openPath = function (p) { abiertos.push(String(p)); return Promise.resolve(''); };
      await lanzador.webContents.executeJavaScript(`window.launcherAPI.openProject(${esp.pid})`);
      const vProj = await esperarVentana(`projects/${esp.pid}/dashboard.html`);
      let res = null;
      if (vProj) {
        await esperar(2000);
        const prev = new Set(BrowserWindow.getAllWindows().map((w) => w.id));
        await vProj.webContents.executeJavaScript("window.panoramaBridge.projectMenuAction('proyecto-eval-candidatos')");
        const t0 = Date.now(); let vE = null;
        while (!vE && Date.now() - t0 < 20000) { vE = ventanasCon('evaluacion_candidatos').find((x) => !prev.has(x.id)); if (!vE) await esperar(300); }
        if (vE) { await esperar(1500); res = await vE.webContents.executeJavaScript(`window.panoramaBridge.openCandidateCv(${JSON.stringify(esp.viejoNombre)})`); }
      }
      shellMod.openPath = openPathOrig;
      ok('CV-ELECTRON-REPLACE-NOAPLICADO tras reiniciar, el CV viejo abre correctamente',
        !!(res && res.ok) && abiertos.length === 1 && abiertos[0] === viejoRuta,
        JSON.stringify({ res, abiertos }));
      tlog('FIN e6c');
    }

    // =====================================================================
    if (MODO === 'e6d') {
      tlog('--- CV-RM-F3-RETURN: que devuelve el saveState(true) ORIGINAL ---');
      const C = await crearProyectoCompleto(lanzador, 'Servicio E6D');
      const vEval = C.vEval;
      if (!vEval) { ok('E6d) hay ventana de candidatos', false, 'no se abrio'); }
      else {
        const dirCv = path.join(C.dirBk, 'evaluacion-candidatos', 'cv');
        const estadoJson = path.join(C.dirBk, 'evaluacion-candidatos', 'estado.json');
        const leerEstado = () => { try { return JSON.parse(fs.readFileSync(estadoJson, 'utf8')); } catch (e) { return null; } };
        const cvs = () => { try { return fs.readdirSync(dirCv); } catch (e) { return []; } };
        const shaDe = (f) => { try { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); } catch (e) { return 'NO-EXISTE'; } };

        const intentos = [];
        const unlinkOrig = fs.unlinkSync;
        fs.unlinkSync = function (p) {
          const s = String(p);
          if (s.toLowerCase().indexOf(path.sep + 'cv' + path.sep) >= 0) intentos.push(path.basename(s));
          return unlinkOrig.apply(fs, arguments);
        };

        await vEval.webContents.executeJavaScript('loadState().then(() => { renderAll(); return "ok"; })');

        // Se envuelve `saveState` en la PAGINA para capturar lo que resuelve
        // CADA llamada, sin tocar el codigo: la rama real de quitar-cv hace
        // `const g = await saveState(true)` y `g` no sale de ahi.
        // `saveState` es una funcion global de un script clasico, asi que
        // reasignar window.saveState cambia a quien llama la rama.
        const envuelto = await vEval.webContents.executeJavaScript(`(function(){
          window.__cap = [];
          const orig = window.saveState;
          if (typeof orig !== 'function') return 'NO-SAVESTATE';
          window.saveState = function () {
            const p = orig.apply(null, arguments);
            Promise.resolve(p).then(function (r) { window.__cap.push(r === undefined ? '__UNDEFINED__' : r); },
                                    function (e) { window.__cap.push({ __rechazo: String(e) }); });
            return p;
          };
          return 'envuelto';
        })()`);
        ok('CV-RM-F3-RETURN el arnes puede observar lo que devuelve saveState sin modificar la plantilla',
          envuelto === 'envuelto', String(envuelto));

        const viejoNombre = cvs()[0];
        const viejoRuta = path.join(dirCv, viejoNombre);
        const viejoSha = shaDe(viejoRuta);
        const removeAntes = llamadasIPC['candidateEval:removeCv'] || 0;
        const saveAntes = llamadasIPC['candidateEval:save'] || 0;
        intentos.length = 0;
        await vEval.webContents.executeJavaScript('window.__cap = []; "ok"');

        const esGuardadoEval = (s) => Array.isArray(s) && s.some((x) => /INSERT INTO candidate_evals/.test(String(x && x.sql)));
        inyeccion = (s) => (esGuardadoEval(s) ? 'post' : null);
        const clic = await vEval.webContents.executeJavaScript(`(function(){
          const b = document.querySelector('[data-action="quitar-cv"][data-id="e1"]');
          if (!b) return 'NO-BOTON';
          b.click();
          const okb = document.getElementById('confirmOk');
          if (!okb) return 'NO-CONFIRM';
          okb.click();
          return 'clic+confirmar';
        })()`);
        await esperar(4000);
        inyeccion = null;

        const capturasTxt = await vEval.webContents.executeJavaScript('JSON.stringify(window.__cap)');
        const capturas = JSON.parse(capturasTxt);
        const evMem = JSON.parse(await vEval.webContents.executeJavaScript(
          "JSON.stringify(state.evaluaciones.find(x=>x.id==='e1') || {})"));
        info('clic=' + clic + ' capturas=' + capturasTxt);
        info('IPC candidateEval:save=' + ((llamadasIPC['candidateEval:save'] || 0) - saveAntes) +
          ' removeCv=' + ((llamadasIPC['candidateEval:removeCv'] || 0) - removeAntes));

        // --- 1 y 2: lo que devuelve el saveState(true) ORIGINAL ------------
        const g = capturas[0];
        ok('CV-RM-F3-RETURN el flujo real hizo EXACTAMENTE un saveState(true)',
          capturas.length === 1, capturasTxt);
        ok('CV-RM-F3-RETURN (1) el saveState(true) ORIGINAL de quitar-cv NO devuelve undefined',
          g !== '__UNDEFINED__' && g && typeof g === 'object', JSON.stringify(g));
        ok('CV-RM-F3-RETURN (2) devuelve aplicado:true / verificado:false / requiereReinicio:true',
          !!g && g.aplicado === true && g.verificado === false && g.requiereReinicio === true,
          JSON.stringify(g));

        // --- 3: la rama NO restaura las referencias del CV -----------------
        ok('CV-RM-F3-RETURN (3) la rama NO restaura ev.cvFileName ni ev.cvStoredName en memoria',
          evMem.cvFileName === null && evMem.cvStoredName === null, JSON.stringify(evMem));
        ok('CV-RM-F3-RETURN (3) memoria y disco coinciden: los dos sin CV',
          (leerEstado() || {}).evaluaciones[0].cvStoredName === null && evMem.cvStoredName === null);

        // --- 4: no se llama a removeCandidateCv ---------------------------
        ok('CV-RM-F3-RETURN (4) el canal candidateEval:removeCv NO se invoca ni una vez',
          ((llamadasIPC['candidateEval:removeCv'] || 0) - removeAntes) === 0,
          String((llamadasIPC['candidateEval:removeCv'] || 0) - removeAntes));
        ok('CV-RM-F3-RETURN (4) y el CV fisico sigue byte a byte, sin intentos de borrado',
          fs.existsSync(viejoRuta) && shaDe(viejoRuta) === viejoSha && intentos.length === 0 && cvs().length === 1,
          JSON.stringify({ intentos, cvs: cvs() }));
        ok('CV-RM-F3-RETURN un solo guardado: la accion no se repite',
          ((llamadasIPC['candidateEval:save'] || 0) - saveAntes) === 1,
          String((llamadasIPC['candidateEval:save'] || 0) - saveAntes));

        // --- 5: el SEGUNDO saveState(true), separado y etiquetado ---------
        const segundo = JSON.parse(await vEval.webContents.executeJavaScript(
          'saveState(true).then(r => JSON.stringify(r === undefined ? "__UNDEFINED__" : r))'));
        ok('CV-RM-F3-RETURN (5) SEGUNDO saveState(true), ya con la sesion detenida: aplicado:false / reintentable:false',
          segundo && segundo !== '__UNDEFINED__' && segundo.aplicado === false && segundo.reintentable === false,
          JSON.stringify(segundo));
        ok('CV-RM-F3-RETURN (5) y ese segundo NO llega al proceso principal: cero guardados nuevos',
          ((llamadasIPC['candidateEval:save'] || 0) - saveAntes) === 1,
          String((llamadasIPC['candidateEval:save'] || 0) - saveAntes));
        const permitidas = await vEval.webContents.executeJavaScript('mutacionesPermitidas()');
        ok('CV-RM-F3-RETURN la sesion queda detenida tras la forma 3', permitidas === false, String(permitidas));

        fs.unlinkSync = unlinkOrig;
      }
      tlog('FIN e6d');
    }

    // =====================================================================
    if (MODO === 'e7') {
      tlog('--- E7: RECOVERY AL ARRANCAR (estados plantados antes de lanzar) ---');
      const esp = JSON.parse(fs.readFileSync(path.join(SB, 'e7-esperado.json'), 'utf8'));
      // A: no confirmado y totalmente retirado -> restaurar
      ok('E7/A delete no confirmado: se RESTAURA el origen',
        fs.existsSync(esp.A.origen) && huella(esp.A.origen) === esp.A.huella &&
        !fs.existsSync(path.join(dirBorrados(), esp.A.aid)) && !fs.existsSync(path.join(dirBorrados(), esp.A.aid + '.json')),
        JSON.stringify({ existe: fs.existsSync(esp.A.origen), igual: huella(esp.A.origen) === esp.A.huella }));
      // B: confirmado sin cleanup -> NO restaurar, completar cleanup
      ok('E7/B delete confirmado sin cleanup: NO se restaura y se completa la purga',
        !fs.existsSync(esp.B.origen) &&
        !fs.existsSync(path.join(dirBorrados(), esp.B.aid)) && !fs.existsSync(path.join(dirBorrados(), esp.B.aid + '.json')),
        JSON.stringify({ origen: fs.existsSync(esp.B.origen) }));
      // C: destino reaparecido + cuarentena presente -> NO-CLOBBER
      ok('E7/C destino reaparecido: NO-CLOBBER, el reaparecido sigue byte a byte',
        fs.existsSync(esp.C.origen) && huella(esp.C.origen) === esp.C.huellaReaparecido,
        JSON.stringify({ actual: huella(esp.C.origen).slice(0, 60) }));
      ok('E7/C la cuarentena se conserva byte a byte',
        fs.existsSync(esp.C.cuarentena) && huella(esp.C.cuarentena) === esp.C.huellaCuarentena);
      ok('E7/C el journal se conserva', fs.existsSync(path.join(dirBorrados(), esp.C.aid + '.json')));
      // El comportamiento correcto ante C es FAIL-CLOSED: avisar con PS-2006 y
      // cerrar, sin abrir el lanzador ni seguir escribiendo.
      const d2006 = dialogos.filter((x) => /PS-2006/.test(x.detail || '') || /borrado anterior/i.test(x.title || ''));
      ok('E7/C la app avisa con PS-2006 y NO sigue adelante',
        d2006.length === 1 && quitPedido >= 1 && ventanasCon('launcher/index.html').length === 0,
        JSON.stringify({ dialogos: dialogos.map((x) => x.title), quit: quitPedido, launcher: ventanasCon('launcher/index.html').length }));
      tlog('FIN e7');
    }

    tlog('__MODO_TERMINADO__ ' + MODO);
    await esperar(800);
    app.exit(0);
  } catch (e) {
    tlog('EXCEPCION EN EL ARNES: ' + ((e && e.stack) || String(e)));
    app.exit(4);
  }
});

void openOriginal; void msgOriginal; void quitOriginal; void esperarSinVentana;
