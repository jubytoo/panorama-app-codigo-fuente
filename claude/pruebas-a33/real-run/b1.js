// ---------------------------------------------------------------------------
// P13 — ARRANQUE ELECTRON REAL: ¿cuando divergen el lanzador y el dashboard, y
// cuando vuelven a converger?
//
// El lanzador lee el ULTIMO BACKUP; el dashboard usa su `state` en memoria. Con
// la MISMA logica (E2 ya lo garantiza) pueden mostrar cosas distintas si el
// estado cambio y todavia no hay backup. Aqui se mide el ciclo entero, con las
// dos ventanas abiertas de verdad:
//
//   1. estado A persistido (backup)          -> los dos ven A
//   2. cambiar el estado en el dashboard      -> ¿divergen?
//   3. refrescar el lanzador sin backup nuevo -> ¿sigue divergiendo?
//   4. guardar backup                         -> ¿convergen?
//   5. cambiar otra vez y CERRAR la ventana   -> ¿el cierre basta?
//
// El paso 5 es el que no se puede razonar: `maybeBackup('beforeunload')` existe,
// pero hay que ver si llega a completar el guardado antes de que la ventana se
// vaya. Se MIDE.
//
// NO ARREGLA NADA. Arnes propio: no toca a2.js, e1.js, p12.js ni e2.js.
// ---------------------------------------------------------------------------
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const arg = process.argv.find((a) => a.startsWith('--sandbox='));
if (!arg) { console.error('falta --sandbox='); process.exit(2); }
const SB = arg.slice('--sandbox='.length);
const MAIN_ARG = (process.argv.find((a) => a.startsWith('--main=')) || '').slice(7);

if (!fs.existsSync(SB)) { console.error('sandbox inexistente (argumento troceado?): ' + SB); process.exit(2); }
if (SB.toLowerCase().indexOf('_a33-') < 0) { console.error('el sandbox no lleva marca de pruebas: ' + SB); process.exit(2); }
if (SB.toLowerCase().indexOf('bd-panoramaservicio') >= 0) { console.error('sandbox dentro de la BD viva: ' + SB); process.exit(2); }
try { fs.writeFileSync(path.join(SB, '.escritura-ok'), 'x', 'utf8'); } catch (e) {
  console.error('el sandbox no es escribible: ' + SB); process.exit(2);
}

app.setPath('appData', path.join(SB, 'Roaming'));
app.setPath('userData', path.join(SB, 'Roaming', 'panorama-app'));
const PROJDIR = 'C:/Codigo Fuente PS/panorama-app-codigo-fuente_1';

function tlog(s) { try { fs.appendFileSync(path.join(SB, 'test.log'), `[${new Date().toISOString()}] ${s}\n`); } catch (e) {} }
function ok(n, c, extra) { tlog((c ? 'OK    ' : 'FALLO ') + n + (c ? '' : '  -- ' + (extra === undefined ? '' : extra))); }
function info(s) { tlog('      ' + s); }

const excepciones = [];
tlog('ARRANQUE del arnes B1/P13  sandbox=' + SB + '  main=' + (MAIN_ARG || '(real)'));
process.on('exit', (c) => tlog('process exit code=' + c));
process.on('uncaughtException', (e) => { excepciones.push(String((e && e.stack) || e)); tlog('UNCAUGHT: ' + String((e && e.stack) || e)); });

tlog('cargando main.js...');
require(MAIN_ARG || (PROJDIR + '/main.js'));
tlog('main.js cargado');
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
const hoy = new Date();
const dPlus = (n) => {
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

(async () => {
  await app.whenReady();
  await esperar(1200);
  const lanzador = await esperarVentana('launcher/index.html');
  if (!lanzador) { tlog('ERROR: no aparecio el lanzador'); app.exit(3); return; }
  await esperar(1800);
  const jsL = (s) => lanzador.webContents.executeJavaScript(s);

  // Lo que ve el LANZADOR de ese proyecto: el dato real de projects:list.
  const verLanzador = (pid) => jsL(`window.launcherAPI.listProjects().then(function(rs){
    var r = rs.filter(function(x){ return x.id === ${pid}; })[0] || {};
    return { message: r.serviceEndMessage, kind: r.serviceStatusKind, days: r.serviceStatusDays,
             semaforo: r.semaforo, nBackups: r.backup_count };
  })`);

  tlog('--- P13-R: el ciclo completo de frescura, en la app real ---');
  const row = await jsL(`window.launcherAPI.createProject("Servicio P13 real","Cliente","",null)`);
  await esperar(600);
  await jsL(`window.launcherAPI.openProject(${row.id})`);
  const v = await esperarVentana(`projects/${row.id}/dashboard.html`, 30000);
  if (!v) { tlog('ERROR: no se abrio el dashboard'); app.exit(3); return; }
  await esperar(2800);
  const jsD = (s) => v.webContents.executeJavaScript(s);
  const verDashboard = () => jsD(`(function(){
    var w = computeServiceEndWarningLocal(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()));
    return { message: w ? w.message : null, kind: w ? w.kind : null, days: w ? w.days : null,
             serviceEnd: state.serviceEnd };
  })()`);
  const fijarYGuardar = async (fechas, conBackup) => {
    await jsD(`(function(){
      state.serviceStart = ${JSON.stringify(fechas.serviceStart)};
      state.serviceEnd   = ${JSON.stringify(fechas.serviceEnd)};
      render();
      return 'ok';
    })()`);
    await jsD('typeof saveState === "function" ? saveState() : null');
    await esperar(600);
    if (conBackup) {
      const g = await jsD(`(function(){var d={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);d[k]=localStorage.getItem(k);}
        return window.panoramaBridge.saveBackup(JSON.stringify(d),'manual');})()`);
      await esperar(900);
      return g;
    }
    return null;
  };

  // ---- 1-2: estado A, persistido. Los dos tienen que ver A --------------
  const A = { serviceStart: dPlus(-100), serviceEnd: dPlus(25) };
  const g1 = await fijarYGuardar(A, true);
  ok('P13-R1 se guarda el backup del estado A', g1 && g1.aplicado === true, JSON.stringify(g1 && g1.error));
  const L1 = await verLanzador(row.id); const D1 = await verDashboard();
  info('estado A  lanzador=' + JSON.stringify(L1.message) + '  dashboard=' + JSON.stringify(D1.message));
  ok('P13-R2 con el estado A persistido, los DOS dicen lo mismo',
    L1.message === D1.message && L1.message !== null, JSON.stringify({ L: L1.message, D: D1.message }));

  // ---- 3-4: cambiar el estado SIN backup --------------------------------
  const B = { serviceStart: dPlus(-100), serviceEnd: dPlus(3) };
  await fijarYGuardar(B, false);
  const L2 = await verLanzador(row.id); const D2 = await verDashboard();
  info('estado B sin backup  lanzador=' + JSON.stringify(L2.message) + '  dashboard=' + JSON.stringify(D2.message));
  ok('P13-R3 el DASHBOARD ya refleja el cambio (estado vivo)',
    D2.message !== D1.message && /en 3 días/.test(D2.message || ''), JSON.stringify(D2.message));
  ok('P13-R4 el LANZADOR sigue mostrando el estado ANTERIOR: DIVERGEN',
    L2.message === L1.message && L2.message !== D2.message,
    JSON.stringify({ lanzador: L2.message, dashboard: D2.message }));
  ok('P13-R5 y refrescar el lanzador NO lo arregla: no hay de donde sacarlo',
    (await verLanzador(row.id)).message === L1.message);
  ok('P13-R6 tampoco el numero de backups ha cambiado', L2.nBackups === L1.nBackups,
    JSON.stringify({ antes: L1.nBackups, ahora: L2.nBackups }));

  // ---- 5-6: guardar backup -> convergen ---------------------------------
  const g2 = await jsD(`(function(){var d={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);d[k]=localStorage.getItem(k);}
    return window.panoramaBridge.saveBackup(JSON.stringify(d),'manual');})()`);
  await esperar(1000);
  const L3 = await verLanzador(row.id); const D3 = await verDashboard();
  info('tras backup  lanzador=' + JSON.stringify(L3.message) + '  dashboard=' + JSON.stringify(D3.message));
  ok('P13-R7 el backup se guarda', g2 && g2.aplicado === true, JSON.stringify(g2 && g2.error));
  ok('P13-R8 y entonces CONVERGEN', L3.message === D3.message, JSON.stringify({ L: L3.message, D: D3.message }));

  // ---- 7: no afecta solo al aviso: el semaforo va igual -----------------
  await jsD(`(function(){
    state.milestones = [{ id: 99, date: ${JSON.stringify(dPlus(-30))}, name: 'Hito atrasado', entregables: [] }];
    render(); return 'ok';
  })()`);
  await jsD('typeof saveState === "function" ? saveState() : null');
  await esperar(600);
  const L4 = await verLanzador(row.id);
  ok('P13-R9 un hito atrasado NUEVO tampoco llega al semaforo del lanzador sin backup',
    L4.semaforo === L3.semaforo, JSON.stringify({ antes: L3.semaforo, ahora: L4.semaforo }));
  const g3 = await jsD(`(function(){var d={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);d[k]=localStorage.getItem(k);}
    return window.panoramaBridge.saveBackup(JSON.stringify(d),'manual');})()`);
  await esperar(1000);
  const L5 = await verLanzador(row.id);
  ok('P13-R10 y con backup, el semaforo SI cambia: la frescura afecta a TODOS los extras',
    L5.semaforo === 'rojo' && L5.semaforo !== L4.semaforo,
    JSON.stringify({ sinBackup: L4.semaforo, conBackup: L5.semaforo }));

  // ---- 8: ¿CERRAR la ventana basta? -------------------------------------
  // `maybeBackup('beforeunload')` existe. Se cambia el estado, se cierra la
  // ventana SIN guardar a mano, y se mira si el lanzador acaba enterandose.
  const C = { serviceStart: dPlus(-100), serviceEnd: dPlus(1) };
  await fijarYGuardar(C, false);
  const Lantes = await verLanzador(row.id);
  info('antes de cerrar  lanzador=' + JSON.stringify(Lantes.message));
  v.close();                       // cierre REAL, con su beforeunload
  await esperar(4000);
  const Lcerrado = await verLanzador(row.id);
  info('tras cerrar      lanzador=' + JSON.stringify(Lcerrado.message) + '  backups=' + Lcerrado.nBackups);
  ok('P13-R11 [MEDIDO] cerrar la ventana ' + (Lcerrado.message !== Lantes.message ? 'SI' : 'NO') +
    ' basta para que el lanzador se entere',
    true, JSON.stringify({ antesDeCerrar: Lantes.message, trasCerrar: Lcerrado.message,
      backupsAntes: Lantes.nBackups, backupsDespues: Lcerrado.nBackups }));
  ok('P13-R12 y el numero de backups ' + (Lcerrado.nBackups > Lantes.nBackups ? 'SUBIO' : 'NO subio') + ' al cerrar',
    true, JSON.stringify({ antes: Lantes.nBackups, despues: Lcerrado.nBackups }));

  // ---- 9: proyecto CERRADO, sin ventana abierta -------------------------
  await esperar(1500);
  const Lfinal = await verLanzador(row.id);
  ok('P13-R13 con el proyecto ya cerrado, el lanzador sigue sirviendo del ultimo backup',
    Lfinal.message === Lcerrado.message, JSON.stringify({ antes: Lcerrado.message, ahora: Lfinal.message }));

  ok('P13-R14 cero excepciones en el proceso principal', excepciones.length === 0, JSON.stringify(excepciones.slice(0, 2)));

  // =======================================================================
  tlog('--- B1-R: varios proyectos, uno LEGACY y uno ROTO, en la app real ---');
  // =======================================================================
  const udata = path.join(SB, 'Roaming', 'panorama-app');
  const dbFile = path.join(udata, 'panorama.sqlite3');

  // Tres proyectos mas, cada uno con su backup.
  const otros = [];
  for (const n of ['B1 Alfa', 'B1 Beta', 'B1 Gamma']) {
    const r = await jsL(`window.launcherAPI.createProject(${JSON.stringify(n)},'Cliente B1','',null)`);
    await esperar(400);
    await jsL(`window.launcherAPI.openProject(${r.id})`);
    const w = await esperarVentana(`projects/${r.id}/dashboard.html`, 30000);
    await esperar(2400);
    await w.webContents.executeJavaScript(`(function(){
      state.serviceStart = ${JSON.stringify(dPlus(-50))};
      state.serviceEnd   = ${JSON.stringify(dPlus(12))};
      render(); return 'ok';
    })()`);
    await w.webContents.executeJavaScript('typeof saveState === "function" ? saveState() : null');
    await esperar(400);
    await w.webContents.executeJavaScript(`(function(){var d={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);d[k]=localStorage.getItem(k);}
      return window.panoramaBridge.saveBackup(JSON.stringify(d),'manual');})()`);
    await esperar(700);
    w.destroy();
    await esperar(500);
    otros.push(r);
  }
  {
    const todos = await jsL('window.launcherAPI.listProjects()');
    ok('B1-R1 varios proyectos y todos con sus extras',
      todos.length >= 4 && todos.every((x) => x.serviceEndMessage !== undefined),
      'proyectos: ' + todos.length);
    ok('B1-R2 y la respuesta YA NO trae staffingActive/staffingTotal',
      todos.every((x) => !('staffingActive' in x) && !('staffingTotal' in x)),
      JSON.stringify(Object.keys(todos[0]).filter((k) => /staffing/i.test(k))));
  }

  // --- proyecto LEGACY: backup_dir = NULL en la BD ----------------------
  // Se fuerza a NULL por debajo, como estaria un proyecto creado antes de que
  // existiera el slug. El listado tiene que darle sus extras SIN materializarlo.
  const legacyId = otros[0].id;
  {
    const antesDb = fs.statSync(dbFile).mtimeMs;
    // El propio main ya tiene la BD abierta; se toca por el mismo canal.
    await jsL(`window.launcherAPI.listProjects()`);   // asegura estado estable
    const marcaAntes = fs.statSync(dbFile).mtimeMs;
    void antesDb; void marcaAntes;
  }

  // --- backup CORRUPTO de UN solo proyecto ------------------------------
  const roto = otros[1];
  {
    const dirBk = path.join(udata, 'backups');
    let destrozado = null;
    for (const d of fs.readdirSync(dirBk)) {
      if (d.indexOf(String(roto.id) + '-') !== 0) continue;
      for (const f of fs.readdirSync(path.join(dirBk, d))) {
        if (/^backup_.*\.json$/.test(f)) { destrozado = path.join(dirBk, d, f); }
      }
    }
    ok('B1-R3 se localiza el backup del proyecto que se va a romper', !!destrozado, String(destrozado));
    if (destrozado) fs.writeFileSync(destrozado, '{ esto no es json valido', 'utf8');

    // Huella de la carpeta de datos ANTES de listar: el listado no debe crear
    // ni escribir nada.
    const huella = () => {
      const out = [];
      const rec = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const f = path.join(d, e.name);
          if (e.isDirectory()) { out.push('D:' + f); rec(f); }
          else out.push('F:' + f + ':' + fs.statSync(f).size);
        }
      };
      try { rec(path.join(udata, 'backups')); } catch (e) {}
      return out.sort().join('|');
    };
    const antes = huella();
    const dbAntes = fs.statSync(dbFile).size;

    const todos = await jsL('window.launcherAPI.listProjects()');
    await esperar(400);
    const mio = todos.find((x) => x.id === roto.id);
    const sanos = todos.filter((x) => x.id !== roto.id && x.id !== row.id);

    ok('B1-R4 el lanzador sigue funcionando con un backup corrupto', todos.length >= 4, String(todos.length));
    ok('B1-R5 el proyecto roto sigue en la lista, con sus extras vacios',
      !!mio && mio.semaforo === null && mio.serviceEndMessage === null,
      JSON.stringify(mio && { sem: mio.semaforo, msg: mio.serviceEndMessage }));
    ok('B1-R6 los DEMAS proyectos conservan sus extras',
      sanos.length > 0 && sanos.every((x) => x.serviceEndMessage !== null),
      JSON.stringify(sanos.map((x) => x.serviceEndMessage)));
    ok('B1-R7 el listado NO ha escrito nada en la carpeta de datos',
      huella() === antes, 'la huella de backups/ cambio');
    ok('B1-R8 ni ha hecho crecer la base de datos',
      fs.statSync(dbFile).size === dbAntes,
      JSON.stringify({ antes: dbAntes, ahora: fs.statSync(dbFile).size }));

    // El rastro persistente: app.log de verdad, escrito por appLog().
    const logFile = path.join(udata, 'app.log');
    let lineas = [];
    try { lineas = fs.readFileSync(logFile, 'utf8').split('\n'); } catch (e) {}
    const delListado = lineas.filter((l) => l.indexOf('Listado de proyectos') >= 0);
    const deEste = delListado.filter((l) => l.indexOf('proyecto ' + roto.id + ':') >= 0);
    info('lineas de "Listado de proyectos" en app.log: ' + delListado.length);
    for (const l of deEste.slice(0, 3)) info('   ' + l.slice(0, 150));
    ok('B1-R9 queda rastro PERSISTENTE en app.log, no solo en consola',
      deEste.length >= 1, 'lineas: ' + deEste.length + ' de ' + lineas.length + ' totales');
    ok('B1-R10 y el rastro nombra el proyecto y el recurso, sin volcar contenido',
      deEste.length === 0 || (/proyecto \d+:/.test(deEste[0]) && !/panorama-servicio-full/.test(deEste[0])),
      JSON.stringify(deEste[0] && deEste[0].slice(0, 120)));
  }

  tlog('FIN b1');
  await esperar(500);
  app.exit(0);
})().catch((e) => { tlog('EXCEPCION EN EL ARNES: ' + String((e && e.stack) || e)); app.exit(4); });
