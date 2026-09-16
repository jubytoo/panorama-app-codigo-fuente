// ---------------------------------------------------------------------------
// C1 — ¿QUÉ QUEDA DE LA PARTICIÓN DE ELECTRON DE UN PROYECTO BORRADO?
//
// La batería aislada (C1-E7) demuestra que el protocolo de borrado solo MANDA
// vaciar la partición (`clearStorageData`) y que `Partitions/<nombre>` no es
// un recurso del journal. Lo que no puede medir es qué hace Chromium de verdad
// con esa carpeta. Esto lo mide, con la app REAL, en un sandbox artificial.
//
//   --modo=a  crea un proyecto, lo abre (la partición se materializa), guarda,
//             lo borra por el lanzador real y fotografía la carpeta ANTES y
//             DESPUÉS del borrado. Cierra con app.quit(), como el usuario.
//   --modo=b  arranque nuevo SIN abrir esa partición: ¿sigue la carpeta?
//
// C1-A (16 sept 2026) añade, con la misma app real:
//   · en CADA arranque, la línea del inventario de residuos en app.log;
//   --modo=c  "Eliminar evaluación" con CLIC REAL: el CV se retira solo con
//             aplicado+verificado; con verificado:false (forzado en el IPC) se
//             CONSERVA;
//   --modo=d  arranque nuevo: el inventario ve ese CV conservado como
//             "sin referencia" — lo cuenta y no lo toca.
//
// Aislamiento: appData/userData redirigidos ANTES de cargar main.js; el
// envoltorio .ps1 redirige además APPDATA y LOCALAPPDATA del proceso.
// ---------------------------------------------------------------------------
const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const arg = process.argv.find((a) => a.startsWith('--sandbox='));
if (!arg) { console.error('falta --sandbox='); process.exit(2); }
const SB = arg.slice('--sandbox='.length);
if (!/_a33-c1-real/i.test(SB)) { console.error('sandbox no marcado'); process.exit(2); }
const MODO = (process.argv.find((a) => a.startsWith('--modo=')) || '--modo=nada').slice(7);

app.setPath('appData', path.join(SB, 'Roaming'));
app.setPath('userData', path.join(SB, 'Roaming', 'panorama-app'));
const UD = path.join(SB, 'Roaming', 'panorama-app');
const PROJDIR = 'C:/Codigo Fuente PS/panorama-app-codigo-fuente_1';

// ASCII en el log: el .ps1 lo lee con PowerShell 5.1, que no respeta UTF-8 sin BOM.
const ascii = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[·—–]/g, '-').replace(/…/g, '...');
function tlog(s) { try { fs.appendFileSync(path.join(SB, 'test.log'), `[${new Date().toISOString()}] ${ascii(s)}\n`); } catch (e) {} }
function ok(n, c, extra) { tlog((c ? 'OK    ' : 'FALLO ') + n + (c ? '' : '  -- ' + (extra === undefined ? '' : extra))); }
function info(s) { tlog('      ' + s); }

// Diálogos nativos: se registran y se contestan solos (no debería haber).
const dialogos = [];
dialog.showMessageBoxSync = function (a, b) { const o = (b || a) || {}; dialogos.push(o.title); tlog('      DIALOGO: ' + o.title); return 0; };
// Selector de CV fijado a un archivo del sandbox.
let cvElegido = null;
dialog.showOpenDialogSync = function () { return cvElegido ? [cvElegido] : null; };

// Espía de IPC, instalado ANTES de cargar main.js: cuenta invocaciones reales y
// permite forzar la forma 3 (aplicado:true / verificado:false) en el guardado de
// Candidatos sin tocar el código de main.js.
const { ipcMain } = require('electron');
const llamadasIPC = {};
let forzarNoVerificado = false;
const handleOrig = ipcMain.handle.bind(ipcMain);
ipcMain.handle = function (canal, fn) {
  return handleOrig(canal, async function () {
    llamadasIPC[canal] = (llamadasIPC[canal] || 0) + 1;
    const r = await fn.apply(this, arguments);
    if (canal === 'candidateEval:save' && forzarNoVerificado && r && r.aplicado === true) {
      return Object.assign({}, r, { verificado: false, requiereReinicio: true, aviso: 'forzado por la prueba C1-A' });
    }
    return r;
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
  for (;;) { const w = ventanasCon(frag)[0]; if (w) return w; if (Date.now() - t0 > tope) return null; await esperar(300); }
}

// Foto de una carpeta de partición: subcarpetas de primer nivel con nº de
// archivos y bytes. Sin contenido.
function foto(dir) {
  if (!fs.existsSync(dir)) return null;
  const out = {};
  const rec = (d, top) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      const t = top || e.name;
      if (e.isDirectory()) { out[t] = out[t] || { n: 0, b: 0 }; rec(p, t); }
      else { out[t] = out[t] || { n: 0, b: 0 }; out[t].n++; out[t].b += fs.statSync(p).size; }
    }
  };
  rec(dir, null);
  return out;
}
const total = (f) => (f ? Object.values(f).reduce((a, x) => ({ n: a.n + x.n, b: a.b + x.b }), { n: 0, b: 0 }) : null);
const CACHE = /^(Cache|Code Cache|GPUCache|DawnCache|DawnGraphiteCache|DawnWebGPUCache|Shared Dictionary|Service Worker)$/;
const DATOS = /^(Local Storage|IndexedDB|Session Storage|WebStorage|databases|blob_storage|File System)$/;
const reparto = (f) => {
  if (!f) return null;
  const r = { cache: 0, datos: 0, otros: 0 };
  for (const [k, v] of Object.entries(f)) { if (CACHE.test(k)) r.cache += v.b; else if (DATOS.test(k)) r.datos += v.b; else r.otros += v.b; }
  return r;
};
function dirParticion(nombre) {
  const buscado = String(nombre).replace(/^persist:/, '').toLowerCase();
  const raiz = path.join(UD, 'Partitions');
  const e = fs.existsSync(raiz) ? fs.readdirSync(raiz).find((x) => x.toLowerCase() === buscado) : null;
  return e ? path.join(raiz, e) : path.join(raiz, String(nombre).replace(/^persist:/, ''));
}
function leerLS(part) {
  return new Promise((resolve) => {
    const h = new BrowserWindow({ show: false, webPreferences: { partition: part } });
    h.loadFile(PROJDIR + '/dashboard/restore-helper.html')
      .then(() => h.webContents.executeJavaScript('localStorage.length'))
      .then((n) => { try { h.close(); } catch (e) {} resolve(n); })
      .catch(() => { try { h.close(); } catch (e) {} resolve(null); });
  });
}

// Líneas del inventario de arranque en el app.log REAL del sandbox.
function lineasInventario() {
  try {
    return fs.readFileSync(path.join(UD, 'app.log'), 'utf8').split(/\r?\n/)
      .filter((l) => /Residuos — inventario del arranque/.test(l));
  } catch (e) { return []; }
}
const valor = (l, k) => { const m = new RegExp('\\b' + k + '=(\\d+)').exec(l || ''); return m ? Number(m[1]) : null; };
const CLAVES_INV = ['backupsSinFila', 'filasSinArchivo', 'reunionesSinFila', 'estadosSinFila', 'cvSinReferencia',
  'cvNoDecidibles', 'carpetasSinProyecto', 'particionesSinProyecto', 'copiasEmergenciaSinProyecto', 'filasSinProyecto',
  'temporalesBd', 'temporalesAccion', 'rescates', 'journalsAjenos', 'materialPendiente', 'sondas', 'parchesPendientes', 'noListables'];
function comprobarInventario(nArranque, esperados) {
  const ls = lineasInventario();
  const l = ls[ls.length - 1];
  info('inventario (arranque ' + nArranque + '): ' + (l ? l.replace(/^\[[^\]]+\] /, '') : '(ninguna)'));
  ok(`C1-AR${nArranque}a el arranque ${nArranque} deja SU linea de inventario (total ${nArranque})`, ls.length === nArranque, String(ls.length));
  const malos = CLAVES_INV.filter((k) => valor(l, k) !== (esperados[k] || 0));
  ok(`C1-AR${nArranque}b con los recuentos esperados`, !!l && malos.length === 0,
    malos.map((k) => `${k}=${valor(l, k)} (esperado ${esperados[k] || 0})`).join(', '));
  ok(`C1-AR${nArranque}c sin rutas en la linea`, !!l && !/[A-Za-z]:\\|_a33-c1-real/i.test(l.replace(/^\[[^\]]+\] /, '')));
  const ms = /\((\d+) ms\)$/.exec(l || '');
  info('coste del inventario en este arranque: ' + (ms ? ms[1] + ' ms' : '?'));
}

app.whenReady().then(async () => {
  if (MODO === 'nada') return;
  try {
    const lanzador = await esperarVentana('launcher/index.html');
    if (!lanzador) { tlog('ERROR: no aparecio el lanzador'); app.exit(3); return; }
    await esperar(1500);
    // El inventario corre ANTES de crear el lanzador: si el lanzador está, la
    // línea ya está escrita.
    const nArranque = { a: 1, b: 2, c: 3, d: 4 }[MODO];
    if (MODO === 'a' || MODO === 'c') comprobarInventario(nArranque, MODO === 'a' ? {} : { particionesSinProyecto: 1 });

    if (MODO === 'a') {
      tlog('--- C1-P: PARTICION DE UN PROYECTO BORRADO (app abierta) ---');
      const row = await lanzador.webContents.executeJavaScript("window.launcherAPI.createProject('Servicio C1','','',null)");
      const PID = row.id;
      const fila = dbmod.get('SELECT * FROM projects WHERE id=?', [PID]);
      await lanzador.webContents.executeJavaScript(`window.launcherAPI.openProject(${PID})`);
      const v = await esperarVentana(`projects/${PID}/dashboard.html`);
      ok('C1-P0 la ventana del proyecto se abre', !!v);
      await esperar(3000);
      const CLAVE = 'panorama_servicio_ib__panorama-servicio-full__proj-' + PID;
      await v.webContents.executeJavaScript(`localStorage.setItem(${JSON.stringify(CLAVE)}, JSON.stringify({projectTitle:'Servicio C1', dato:'x'.repeat(4096)})); 'ok'`);
      const g = await v.webContents.executeJavaScript(
        "(function(){var d={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);d[k]=localStorage.getItem(k);}"
        + "return window.panoramaBridge.saveBackup(JSON.stringify(d),'manual');})()");
      ok('C1-P0 un backup real se guarda', !!g && g.aplicado === true, JSON.stringify(g));
      await esperar(1500);
      const dir = dirParticion(fila.partition_name);
      const antes = foto(dir);
      info('partición ANTES del borrado: ' + JSON.stringify(antes));
      ok('C1-P1 la partición existe en disco con datos de Local Storage',
        !!antes && !!antes['Local Storage'] && antes['Local Storage'].b > 0, JSON.stringify(total(antes)));

      const r = JSON.parse(await lanzador.webContents.executeJavaScript(
        `window.launcherAPI.deleteProject(${PID}).then(r => JSON.stringify(r))`));
      info('borrado: ' + JSON.stringify(r));
      ok('C1-P2 el borrado se aplica y verifica', r.aplicado === true && r.verificado === true, JSON.stringify(r));
      await esperar(2500);
      const despues = foto(dir);
      info('partición DESPUÉS del borrado (app abierta): ' + JSON.stringify(despues));
      info('reparto de bytes antes/después: ' + JSON.stringify({ antes: reparto(antes), despues: reparto(despues) }));
      ok('C1-P3 [DESCRIPTIVO] con la app abierta, la carpeta de la partición SIGUE existiendo', despues !== null);
      ok('C1-P4 no quedan filas ni carpetas del proyecto',
        !dbmod.get('SELECT id FROM projects WHERE id=?', [PID]) &&
        !fs.existsSync(path.join(UD, 'backups', fila.backup_dir)) && !fs.existsSync(path.join(UD, 'projects', String(PID))));
      fs.writeFileSync(path.join(SB, 'c1-esperado.json'), JSON.stringify({
        pid: PID, dir, antes: total(antes), despues: total(despues),
        repAntes: reparto(antes), repDespues: reparto(despues), particion: fila.partition_name,
      }), 'utf8');
      tlog('__MODO_TERMINADO__ a');
      // Cierre como el del usuario, con red de seguridad.
      setTimeout(() => app.exit(0), 10000);
      app.quit();
      return;
    }

    if (MODO === 'b') {
      tlog('--- C1-P: TRAS CERRAR Y VOLVER A ABRIR ---');
      // C1-A: el inventario del arranque VE la partición huérfana, y no la toca.
      comprobarInventario(2, { particionesSinProyecto: 1 });
      const esp = JSON.parse(fs.readFileSync(path.join(SB, 'c1-esperado.json'), 'utf8'));
      const tras = foto(esp.dir);
      info('partición tras reiniciar: ' + JSON.stringify(tras));
      info('reparto de bytes tras reiniciar: ' + JSON.stringify(reparto(tras)));
      ok('C1-P5 [DESCRIPTIVO] tras reiniciar, la carpeta del proyecto borrado SIGUE en Partitions', tras !== null,
        'no existe');
      const t = total(tras);
      info(`resumen: antes ${JSON.stringify(esp.antes)} · tras borrar ${JSON.stringify(esp.despues)} · tras reiniciar ${JSON.stringify(t)}`);
      ok('C1-P6 [DESCRIPTIVO] y conserva bytes en disco (residuo que nadie retirará)', !!t && t.b > 0, JSON.stringify(t));
      const vivas = new Set(dbmod.all('SELECT partition_name FROM projects').map((x) => String(x.partition_name).replace(/^persist:/, '').toLowerCase()));
      const sin = fs.readdirSync(path.join(UD, 'Partitions')).filter((x) => !vivas.has(x.toLowerCase()));
      info('carpetas de Partitions sin proyecto: ' + sin.length);
      ok('C1-P7 el proyecto borrado no reaparece', !dbmod.get('SELECT id FROM projects WHERE id=?', [esp.pid]));
      // Solo AL FINAL se abre la partición para leerla: abrirla la recrearía.
      const n = await leerLS(esp.particion);
      ok('C1-P8 su Local Storage está vacío (clearStorageData sí vació los DATOS)', n === 0, String(n));
      tlog('__MODO_TERMINADO__ b');
      await esperar(800);
      app.exit(0);
    }

    if (MODO === 'c') {
      tlog('--- C1-A: ELIMINAR EVALUACION CON CV, CON CLIC REAL ---');
      const row = await lanzador.webContents.executeJavaScript("window.launcherAPI.createProject('Servicio CV','','',null)");
      const PID = row.id;
      await lanzador.webContents.executeJavaScript(`window.launcherAPI.openCandidateEval(${PID})`);
      const v = await esperarVentana('evaluacion_candidatos');
      ok('C1-AC0 la ventana real de Evaluacion de Candidatos se abre', !!v);
      await esperar(2000);
      const cvs = [];
      for (const [id, n] of [['e1', 'uno'], ['e2', 'dos']]) {
        cvElegido = path.join(SB, `cv-${n}.pdf`);
        fs.writeFileSync(cvElegido, 'CV ' + n, 'utf8');
        const r = await v.webContents.executeJavaScript(`window.panoramaBridge.pickCandidateCv('${id}')`);
        cvs.push(r && r.storedName);
      }
      const estado = {
        puestos: [{ id: 'p1', name: 'Puesto', tasks: [], formacionMinima: '', aniosMinimos: '', sbaReferencia: '' }],
        evaluaciones: ['e1', 'e2'].map((id, i) => ({
          id, candidato: 'Cand ' + i, puestoId: 'p1', tap: '', manager: '', entrevistador: '', telefono: '', fecha: '',
          formacion: '', aniosExperiencia: '', sba: '', cvFileName: 'cv.pdf', cvStoredName: cvs[i], notas: {}, feedbackEdited: null,
        })),
      };
      const g0 = await v.webContents.executeJavaScript('window.panoramaBridge.saveCandidateEvalData(' + JSON.stringify(JSON.stringify(estado)) + ')');
      ok('C1-AC1 estado con dos evaluaciones y dos CV, guardado por el IPC real', !!g0 && g0.aplicado === true && cvs.every(Boolean), JSON.stringify(g0));
      // El renderer tiene que LEER ese estado: se recarga la ventana.
      v.webContents.reload();
      await esperar(3000);
      const fila = dbmod.get('SELECT * FROM projects WHERE id=?', [PID]);
      const dirEval = path.join(UD, 'backups', fila.backup_dir, 'evaluacion-candidatos');
      const enDisco = () => { try { return fs.readdirSync(path.join(dirEval, 'cv')); } catch (e) { return []; } };
      const idsEstado = () => { try { return JSON.parse(fs.readFileSync(path.join(dirEval, 'estado.json'), 'utf8')).evaluaciones.map((x) => x.id); } catch (e) { return null; } };
      ok('C1-AC2 los dos CV estan en disco antes de eliminar', enDisco().includes(cvs[0]) && enDisco().includes(cvs[1]));
      const clic = (id) => v.webContents.executeJavaScript(
        `(function(){ var b = document.querySelector('[data-action="del-eval"][data-id="${id}"]');` +
        ` if (!b) return 'sin-boton'; b.click(); document.getElementById('confirmOk').click(); return 'ok'; })()`);
      const rm0 = llamadasIPC['candidateEval:removeCv'] || 0;
      const sv0 = llamadasIPC['candidateEval:save'] || 0;

      const c1 = await clic('e1');
      await esperar(2500);
      info('clic e1: ' + c1 + ' · IPC save +' + ((llamadasIPC['candidateEval:save'] || 0) - sv0) + ', removeCv +' + ((llamadasIPC['candidateEval:removeCv'] || 0) - rm0));
      ok('C1-AC3 aplicado+verificado: el guardado real llega y el estado ya no tiene e1',
        c1 === 'ok' && (llamadasIPC['candidateEval:save'] || 0) === sv0 + 1 && JSON.stringify(idsEstado()) === JSON.stringify(['e2']),
        JSON.stringify({ c1, ids: idsEstado() }));
      ok('C1-AC4 …y SOLO entonces se retira su CV (una llamada, el de e1)',
        (llamadasIPC['candidateEval:removeCv'] || 0) === rm0 + 1 && !enDisco().includes(cvs[0]) && enDisco().includes(cvs[1]),
        JSON.stringify(enDisco()));

      forzarNoVerificado = true;
      const c2 = await clic('e2');
      await esperar(1500);
      // doSaveNow espera al psAlert de "hay que reiniciar": se cierra como el usuario.
      const cerrado = await v.webContents.executeJavaScript(
        "(function(){ var b = document.querySelector('.ps-modal-btn'); if (!b) return 'sin-modal'; b.click(); return 'cerrado'; })()");
      await esperar(2000);
      forzarNoVerificado = false;
      const banner = await v.webContents.executeJavaScript("!!document.getElementById('avisoSesionDetenida')");
      info('clic e2 (verificado:false forzado): ' + c2 + ' · modal ' + cerrado + ' · banner ' + banner);
      ok('C1-AC5 verificado:false: el estado SÍ se aplicó (sin e2) y la sesión queda detenida',
        c2 === 'ok' && JSON.stringify(idsEstado()) === JSON.stringify([]) && banner === true, JSON.stringify({ ids: idsEstado(), banner }));
      ok('C1-AC6 …y el CV de e2 PERMANECE: ninguna llamada nueva a removeCv',
        (llamadasIPC['candidateEval:removeCv'] || 0) === rm0 + 1 && enDisco().includes(cvs[1]), JSON.stringify(enDisco()));
      fs.writeFileSync(path.join(SB, 'c1a-esperado.json'), JSON.stringify({ pid: PID, conservado: cvs[1] }), 'utf8');
      tlog('__MODO_TERMINADO__ c');
      await esperar(800);
      app.exit(0);
    }

    if (MODO === 'd') {
      tlog('--- C1-A: EL INVENTARIO VE EL CV CONSERVADO Y NO LO TOCA ---');
      const esp = JSON.parse(fs.readFileSync(path.join(SB, 'c1a-esperado.json'), 'utf8'));
      comprobarInventario(4, { particionesSinProyecto: 1, cvSinReferencia: 1 });
      const fila = dbmod.get('SELECT * FROM projects WHERE id=?', [esp.pid]);
      const cvDir = path.join(UD, 'backups', fila.backup_dir, 'evaluacion-candidatos', 'cv');
      ok('C1-AC7 el CV conservado sigue en disco tras el arranque (el inventario no borra)',
        fs.existsSync(path.join(cvDir, esp.conservado)));
      ok('C1-AC8 el inventario del arranque no invoca ningun IPC de borrado',
        !llamadasIPC['candidateEval:removeCv'] && !llamadasIPC['projects:delete'], JSON.stringify(llamadasIPC));
      tlog('__MODO_TERMINADO__ d');
      await esperar(800);
      app.exit(0);
    }
  } catch (e) {
    tlog('EXCEPCION EN EL ARNES: ' + ((e && e.stack) || String(e)));
    app.exit(4);
  }
});
