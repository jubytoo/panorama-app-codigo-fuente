// Envoltorio de AISLAMIENTO para probar el Panorama REAL sin tocar los datos
// del usuario: redirige appData/userData a una carpeta temporal ANTES de
// cargar main.js (así no encuentra el location.json real ni apunta a G:\), y
// LOCALAPPDATA lo redirige el proceso que lanza esto.
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const arg = process.argv.find((a) => a.startsWith('--sandbox='));
if (!arg) { console.error('falta --sandbox='); process.exit(2); }
const SB = arg.slice('--sandbox='.length);
const MODO = (process.argv.find((a) => a.startsWith('--modo=')) || '--modo=nada').slice(7);

app.setPath('appData', path.join(SB, 'Roaming'));
app.setPath('userData', path.join(SB, 'Roaming', 'panorama-app'));
const UD = path.join(SB, 'Roaming', 'panorama-app');

function tlog(s) { try { fs.appendFileSync(path.join(SB, 'test.log'), `[${new Date().toISOString()}] ${s}\n`); } catch (e) {} }
function ok(n, c, extra) { tlog((c ? 'OK    ' : 'FALLO ') + n + (c ? '' : '  -- ' + (extra === undefined ? '' : extra))); }

require('C:/Codigo Fuente PS/panorama-app-codigo-fuente_1/main.js');
const dbmod = require('C:/Codigo Fuente PS/panorama-app-codigo-fuente_1/db.js');

// --- traza del ciclo de vida de las ventanas -------------------------------
const traza = [];
app.on('browser-window-created', (e, w) => {
  const id = w.id;
  traza.push({ t: Date.now(), ev: 'creada', id });
  w.on('closed', () => traza.push({ t: Date.now(), ev: 'closed', id }));
});

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
// Se identifican por URL, no por título: las plantillas traen su propio
// <title> y Electron lo adopta en cuanto la página carga, así que el título
// que se le pasa a BrowserWindow deja de estar ahí a los pocos cientos de ms.
const ventanasCon = (fragUrl) =>
  BrowserWindow.getAllWindows().filter((x) => {
    if (x.isDestroyed()) return false;
    try { return x.webContents.getURL().includes(fragUrl); } catch (e) { return false; }
  });
async function esperarVentana(fragUrl, tope = 40000) {
  const t0 = Date.now();
  for (;;) {
    const w = ventanasCon(fragUrl)[0];
    if (w) return w;
    if (Date.now() - t0 > tope) return null;
    await esperar(400);
  }
}

// lee el localStorage de una partición con una ventana oculta propia
function leerParticion(part) {
  return new Promise((resolve, reject) => {
    const h = new BrowserWindow({ show: false, webPreferences: { partition: part } });
    h.loadFile('C:/Codigo Fuente PS/panorama-app-codigo-fuente_1/dashboard/restore-helper.html')
      .then(() => h.webContents.executeJavaScript(
        "(function(){var d={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);d[k]=localStorage.getItem(k);}return d;})()"
      ))
      .then((d) => { h.close(); resolve(d); })
      .catch((e) => { try { h.close(); } catch (x) {} reject(e); });
  });
}

function backupsDe(pid) {
  const row = dbmod.get('SELECT * FROM projects WHERE id=?', [pid]);
  const filas = dbmod.all('SELECT id, created_at, file_path FROM backups WHERE project_id=? ORDER BY created_at', [pid]);
  return filas.map((f) => {
    const p = path.join(UD, 'backups', row.backup_dir, f.file_path);
    let contenido = '';
    try { contenido = fs.readFileSync(p, 'utf8'); } catch (e) { contenido = '<ILEGIBLE>'; }
    return { id: f.id, file: f.file_path, contenido };
  });
}

const CLAVE = (id) => 'panorama_servicio_ib__panorama-servicio-full__proj-' + id;

app.whenReady().then(async () => {
  if (MODO === 'nada') return;

  const lanzador = await esperarVentana('launcher/index.html');
  if (!lanzador) { tlog('ERROR: no apareció el lanzador'); app.exit(3); return; }
  await esperar(1500);

  // ==================================================================
  if (MODO === 'fase1') {
    tlog('--- FASE 1 ---');
    const row = await lanzador.webContents.executeJavaScript(
      "window.launcherAPI.createProject('Proyecto A2','','',null)"
    );
    const PID = row.id;
    fs.writeFileSync(path.join(SB, 'pid.txt'), String(PID), 'utf8');
    tlog('proyecto creado id=' + PID + ' particion=' + row.partition_name);

    await lanzador.webContents.executeJavaScript('window.launcherAPI.openProject(' + PID + ')');
    const vProj = await esperarVentana('projects/' + PID + '/dashboard.html');
    ok('se abre la ventana del proyecto', !!vProj);
    await esperar(3000);
    const idVieja = vProj.id;

    // estado V1 + backup real por el IPC real
    await vProj.webContents.executeJavaScript(
      "localStorage.setItem(" + JSON.stringify(CLAVE(PID)) + ", JSON.stringify({marca:'ESTADO-V1',hitos:1})); 'ok'"
    );
    const guardado = await vProj.webContents.executeJavaScript(
      "(function(){var d={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);d[k]=localStorage.getItem(k);}return window.panoramaBridge.saveBackup(JSON.stringify(d),'manual');})()"
    );
    // A3.3/Bloque 4: saveBackup devuelve el contrato de accion, no un booleano.
    ok('backup del estado V1 creado por el IPC real',
      !!(guardado && guardado.aplicado === true), 'devolvio ' + JSON.stringify(guardado));
    await esperar(800);

    // estado V2 = el que se va a DESCARTAR
    await vProj.webContents.executeJavaScript(
      "localStorage.setItem(" + JSON.stringify(CLAVE(PID)) + ", JSON.stringify({marca:'ESTADO-V2-DESCARTAR',hitos:2})); 'ok'"
    );
    const antesRest = backupsDe(PID);
    tlog('backups antes de restaurar: ' + antesRest.length);
    ok('ninguno contiene todavia el marcador a descartar', !antesRest.some((b) => b.contenido.includes('ESTADO-V2-DESCARTAR')));

    // ---- RESTAURAR por el IPC real ----
    const tRest = Date.now();
    const res = await lanzador.webContents.executeJavaScript(
      'window.launcherAPI.restoreBackup(' + PID + ', null).then(function(r){return "ok:"+r;}).catch(function(e){return "ERR:"+e.message;})'
    );
    tlog('restoreBackup -> ' + res);
    ok('la restauración termina bien', res === 'ok:true', res);
    await esperar(1200);

    // 1. contenido restaurado
    const cont = await leerParticion(row.partition_name);
    const st = cont[CLAVE(PID)] ? JSON.parse(cont[CLAVE(PID)]) : null;
    ok('el contenido corresponde EXACTAMENTE al backup elegido', st && st.marca === 'ESTADO-V1' && st.hitos === 1, JSON.stringify(st));

    // 2. ningun backup del estado descartado
    const trasRest = backupsDe(PID);
    tlog('backups tras restaurar: ' + trasRest.length);
    ok('NINGÚN backup contiene el estado descartado', !trasRest.some((b) => b.contenido.includes('ESTADO-V2-DESCARTAR')),
      trasRest.map((b) => b.file).join(','));

    // 3. la ventana vieja cerrada antes de abrir la nueva
    const cerrVieja = traza.filter((x) => x.ev === 'closed' && x.id === idVieja)[0];
    const nuevas = traza.filter((x) => x.ev === 'creada' && x.t >= tRest);
    const primeraNueva = nuevas[0];
    ok('la ventana vieja se cerró', !!cerrVieja);
    ok('se cerró ANTES de crearse cualquier ventana nueva', cerrVieja && primeraNueva && cerrVieja.t <= primeraNueva.t,
      'closed=' + (cerrVieja && cerrVieja.t) + ' primeraNueva=' + (primeraNueva && primeraNueva.t));

    // 4. projectWindows apunta bien: reabrir NO debe duplicar ventana
    const antesN = ventanasCon('projects/' + PID + '/dashboard.html').length;
    await lanzador.webContents.executeJavaScript('window.launcherAPI.openProject(' + PID + ')');
    await esperar(1500);
    const despN = ventanasCon('projects/' + PID + '/dashboard.html').length;
    ok('tras restaurar, "Abrir" NO crea una segunda ventana', antesN === 1 && despN === 1, 'antes=' + antesN + ' despues=' + despN);

    // 5. cierre NORMAL sigue haciendo su guardado final
    const vAhora = ventanasCon('projects/' + PID + '/dashboard.html')[0];
    await vAhora.webContents.executeJavaScript(
      "localStorage.setItem(" + JSON.stringify(CLAVE(PID)) + ", JSON.stringify({marca:'ESTADO-V3-CIERRE-NORMAL',hitos:3})); 'ok'"
    );
    const nAntesCierre = backupsDe(PID).length;
    vAhora.close();
    await esperar(6000);
    const trasCierre = backupsDe(PID);
    ok('el cierre normal crea su guardado final', trasCierre.length > nAntesCierre, nAntesCierre + ' -> ' + trasCierre.length);
    ok('ese guardado contiene el estado del cierre normal', trasCierre.some((b) => b.contenido.includes('ESTADO-V3-CIERRE-NORMAL')));

    tlog('--- FIN FASE 1 ---');
    setTimeout(() => app.exit(0), 1000);
    return;
  }

  // ==================================================================
  if (MODO === 'fase2') {
    const PID = parseInt(fs.readFileSync(path.join(SB, 'pid.txt'), 'utf8'), 10);
    const row = dbmod.get('SELECT * FROM projects WHERE id=?', [PID]);
    tlog('--- FASE 2 (tras reiniciar) ---');
    const cont = await leerParticion(row.partition_name);
    const st = cont[CLAVE(PID)] ? JSON.parse(cont[CLAVE(PID)]) : null;
    // en fase 1 se dejó ESTADO-V3 con el cierre normal; lo que importa es que
    // el reinicio conserva lo último que hubo, no que se pierda nada.
    ok('tras reiniciar, el estado del proyecto se conserva', st && st.marca === 'ESTADO-V3-CIERRE-NORMAL', JSON.stringify(st));
    tlog('--- FIN FASE 2 ---');
    setTimeout(() => app.exit(0), 800);
    return;
  }

  // ==================================================================
  // B2 clase 1: fallo fatal real en el proceso principal.
  if (MODO === 'b2fatal') {
    const marcaGen = path.join(SB, 'b2gen.txt');
    const gen = fs.existsSync(marcaGen) ? 2 : 1;
    fs.writeFileSync(marcaGen, String(gen), 'utf8');

    if (gen === 1) {
      tlog('--- B2 FASE 1: preparar y provocar el fallo fatal ---');
      const row = await lanzador.webContents.executeJavaScript("window.launcherAPI.createProject('Proyecto B2','','',null)");
      const PID = row.id;
      fs.writeFileSync(path.join(SB, 'b2pid.txt'), String(PID), 'utf8');
      fs.writeFileSync(path.join(SB, 'b2part.txt'), row.partition_name, 'utf8');
      await lanzador.webContents.executeJavaScript('window.launcherAPI.openProject(' + PID + ')');
      const vProj = await esperarVentana('projects/' + PID + '/dashboard.html');
      await esperar(5000); // deja pasar el backup de startup
      await vProj.webContents.executeJavaScript(
        "localStorage.setItem(" + JSON.stringify(CLAVE(PID)) + ", JSON.stringify({marca:'ANTES-DEL-FALLO',hitos:42})); 'ok'"
      );
      // Un backup explícito para que la carpeta exista y haya línea base.
      await vProj.webContents.executeJavaScript(
        "(function(){var d={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);d[k]=localStorage.getItem(k);}return window.panoramaBridge.saveBackup(JSON.stringify(d),'manual');})()"
      );
      await esperar(1200);
      // Instantánea de los archivos de backup ANTES del fallo. Tras marcar el
      // proceso como comprometido no debería aparecer ninguno más, aunque el
      // autoguardado de 15 s siga intentándolo mientras el diálogo está abierto.
      const dirB = path.join(UD, 'backups', dbmod.get('SELECT * FROM projects WHERE id=?', [PID]).backup_dir);
      let antes = [];
      try { antes = fs.readdirSync(dirB).filter((f) => f.startsWith('backup_')).sort(); } catch (e) { tlog('aviso: no se pudo listar ' + dirB); }
      fs.writeFileSync(path.join(SB, 'b2backups-antes.json'), JSON.stringify(antes), 'utf8');
      tlog('archivos de backup antes del fallo: ' + antes.length);
      tlog('provocando la excepción no capturada...');
      setTimeout(() => { throw new Error('FALLO DE PRUEBA B2 (provocado a propósito)'); }, 400);
      return;
    }

    tlog('--- B2 FASE 2: la app ha vuelto tras el reinicio ---');
    const PID = parseInt(fs.readFileSync(path.join(SB, 'b2pid.txt'), 'utf8'), 10);
    const part = fs.readFileSync(path.join(SB, 'b2part.txt'), 'utf8');
    const cont = await leerParticion(part);
    const st = cont[CLAVE(PID)] ? JSON.parse(cont[CLAVE(PID)]) : null;
    ok('la app ha vuelto a arrancar tras el reinicio controlado', true);
    ok('el estado del proyecto está intacto', st && st.marca === 'ANTES-DEL-FALLO' && st.hitos === 42, JSON.stringify(st));
    const dirB = path.join(UD, 'backups', dbmod.get('SELECT * FROM projects WHERE id=?', [PID]).backup_dir);
    let despues = [];
    try { despues = fs.readdirSync(dirB).filter((f) => f.startsWith('backup_')).sort(); } catch (e) { tlog('aviso: no se pudo listar ' + dirB); }
    const antes = JSON.parse(fs.readFileSync(path.join(SB, 'b2backups-antes.json'), 'utf8'));
    ok('CONGELADO: no apareció ningún backup nuevo tras el fallo',
      JSON.stringify(antes) === JSON.stringify(despues),
      'antes=' + antes.length + ' despues=' + despues.length + ' nuevos=' + despues.filter((f) => !antes.includes(f)).join(','));
    const log = fs.readFileSync(path.join(UD, 'app.log'), 'utf8');
    ok('app.log registra PS-1013 con el detalle', /ERROR PS-1013 .*FALLO FATAL/.test(log) && /FALLO DE PRUEBA B2/.test(log));
    ok('el lock multi-PC no quedó huérfano', !fs.existsSync(path.join(UD, '.panorama-lock.json')));
    tlog('--- FIN B2 FASE 2 ---');
    setTimeout(() => app.exit(0), 800);
    return;
  }

  // ==================================================================
  // B2 clase 3: caída real del renderer de una ventana de proyecto.
  if (MODO === 'b2crash') {
    tlog('--- B2 CLASE 3: caída real de un renderer ---');
    const row = await lanzador.webContents.executeJavaScript("window.launcherAPI.createProject('Proyecto Crash','','',null)");
    const PID = row.id;
    await lanzador.webContents.executeJavaScript('window.launcherAPI.openProject(' + PID + ')');
    const vProj = await esperarVentana('projects/' + PID + '/dashboard.html');
    await esperar(5000);
    await vProj.webContents.executeJavaScript(
      "localStorage.setItem(" + JSON.stringify(CLAVE(PID)) + ", JSON.stringify({marca:'ANTES-DEL-CRASH'})); 'ok'"
    );
    const idAntes = vProj.id;
    tlog('provocando la caída del renderer...');
    vProj.webContents.forcefullyCrashRenderer();
    // El diálogo Recargar/Cerrar es bloqueante; lo contesta el script de fuera.
    await esperar(25000);
    const vivas = ventanasCon('projects/' + PID + '/dashboard.html');
    ok('la app NO se ha cerrado', true);
    ok('la ventana sigue existiendo tras recargar', vivas.length === 1, String(vivas.length));
    ok('es la MISMA ventana (recargada, no una nueva)', vivas.length === 1 && vivas[0].id === idAntes, 'antes=' + idAntes + ' ahora=' + (vivas[0] && vivas[0].id));
    const cont = await leerParticion(row.partition_name);
    const st = cont[CLAVE(PID)] ? JSON.parse(cont[CLAVE(PID)]) : null;
    ok('el estado del proyecto sobrevivió a la caída', st && st.marca === 'ANTES-DEL-CRASH', JSON.stringify(st));
    const log = fs.readFileSync(path.join(UD, 'app.log'), 'utf8');
    ok('app.log registra PS-1015', /PS-1015/.test(log));
    ok('NO registra PS-1013 ni PS-1014 (no es un fallo global)', !/PS-1013|PS-1014/.test(log));
    tlog('--- FIN B2 CLASE 3 ---');
    setTimeout(() => app.exit(0), 800);
    return;
  }

  // ==================================================================
  if (MODO === 'rollback') {
    tlog('--- FASE 3: ROLLBACK REAL (cuota de localStorage excedida) ---');
    const row = await lanzador.webContents.executeJavaScript(
      "window.launcherAPI.createProject('Proyecto Rollback','','',null)"
    );
    const PID = row.id;
    tlog('proyecto creado id=' + PID);
    await lanzador.webContents.executeJavaScript('window.launcherAPI.openProject(' + PID + ')');
    const vProj = await esperarVentana('projects/' + PID + '/dashboard.html');
    await esperar(3000);

    // estado pequeño que DEBE sobrevivir al rollback
    await vProj.webContents.executeJavaScript(
      "localStorage.setItem(" + JSON.stringify(CLAVE(PID)) + ", JSON.stringify({marca:'ESTADO-PREVIO-INTACTO'})); 'ok'"
    );
    // Backup DEGENERADO: su contenido es el literal `null`. Al restaurarlo,
    // JSON.parse lo acepta (dump = null) y el script real de
    // writeLocalStorageDumpToPartition hace localStorage.clear() y JUSTO
    // DESPUÉS revienta en Object.keys(null). Es decir: un fallo auténtico,
    // determinista y en el punto exacto que interesa — después del clear() —
    // provocado por un backup corrupto, que es un caso real.
    const guardado = await vProj.webContents.executeJavaScript(
      "window.panoramaBridge.saveBackup('null','manual')"
    );
    ok('backup degenerado creado',
      !!(guardado && guardado.aplicado === true), 'devolvio ' + JSON.stringify(guardado));
    await esperar(1000);

    // El autoguardado del dashboard puede escribir otro backup justo después,
    // así que se pide explícitamente el id del degenerado (tamaño 4 bytes).
    const malo = dbmod.all('SELECT id, size FROM backups WHERE project_id=? ORDER BY id DESC', [PID]).find((b) => b.size === 4);
    ok('localizado el backup degenerado', !!malo, JSON.stringify(dbmod.all('SELECT id,size FROM backups WHERE project_id=?', [PID])));
    tlog('backup degenerado id=' + (malo && malo.id));

    const previo = await leerParticion(row.partition_name);
    const res = await lanzador.webContents.executeJavaScript(
      'window.launcherAPI.restoreBackup(' + PID + ', ' + (malo ? malo.id : 0) + ').then(function(r){return "ok:"+r;}).catch(function(e){return "ERR:"+e.message;})'
    );
    tlog('restoreBackup(gigante) -> ' + String(res).slice(0, 400));
    ok('la restauración FALLA (cuota excedida)', String(res).startsWith('ERR:'), String(res).slice(0, 200));
    ok('el mensaje dice que se dejó como estaba', /exactamente como estaba/.test(String(res)), String(res).slice(0, 300));
    await esperar(1500);

    const despues = await leerParticion(row.partition_name);
    ok('ROLLBACK REAL: la partición vuelve a su estado anterior',
      JSON.stringify(despues) === JSON.stringify(previo),
      'previo=' + JSON.stringify(previo).slice(0, 160) + ' | despues=' + JSON.stringify(despues).slice(0, 160));
    const st = despues[CLAVE(PID)] ? JSON.parse(despues[CLAVE(PID)]) : null;
    ok('el marcador previo sigue ahí', st && st.marca === 'ESTADO-PREVIO-INTACTO', JSON.stringify(st));
    ok('la ventana del proyecto se ha reabierto', ventanasCon('projects/' + PID + '/dashboard.html').length === 1, String(ventanasCon('projects/' + PID + '/dashboard.html').length));

    tlog('--- FIN FASE 3 ---');
    setTimeout(() => app.exit(0), 1000);
  }
});
