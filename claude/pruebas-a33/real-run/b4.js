// Envoltorio de AISLAMIENTO para el BLOQUE 4 con Electron REAL.
// Redirige appData/userData a una carpeta temporal ANTES de cargar main.js.
// NUNCA toca G: ni la BD de produccion.
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const arg = process.argv.find((a) => a.startsWith('--sandbox='));
if (!arg) { console.error('falta --sandbox='); process.exit(2); }
const SB = arg.slice('--sandbox='.length);
const MODO = (process.argv.find((a) => a.startsWith('--modo=')) || '--modo=nada').slice(7);
if (!/bloque4[\\/]sandbox/.test(SB)) { console.error('sandbox inesperado: ' + SB); process.exit(3); }

app.setPath('appData', path.join(SB, 'Roaming'));
app.setPath('userData', path.join(SB, 'Roaming', 'panorama-app'));
const UD = path.join(SB, 'Roaming', 'panorama-app');

function tlog(s) { try { fs.appendFileSync(path.join(SB, 'test.log'), `[${new Date().toISOString()}] ${s}\n`); } catch (e) {} }
function ok(n, c, extra) { tlog((c ? 'OK    ' : 'FALLO ') + n + (c ? '' : '  -- ' + (extra === undefined ? '' : extra))); }
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const shaF = (f) => { try { return sha(fs.readFileSync(f)); } catch (e) { return 'NO-EXISTE'; } };

require('C:/Codigo Fuente PS/panorama-app-codigo-fuente_1/main.js');
const dbmod = require('C:/Codigo Fuente PS/panorama-app-codigo-fuente_1/db.js');

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
    await esperar(400);
  }
}

app.whenReady().then(async () => {
  if (MODO === 'nada') { tlog('--- arranque sin escenario ---'); return; }

  const lanzador = await esperarVentana('launcher/index.html');
  ok('el LAUNCHER real abre', !!lanzador);
  if (!lanzador) { setTimeout(() => app.exit(3), 500); return; }
  await esperar(1500);

  // ==================================================================
  if (MODO === 'guardados') {
    tlog('--- GUARDADOS REALES CON VENTANAS DE VERDAD ---');
    const row = await lanzador.webContents.executeJavaScript(
      "window.launcherAPI.createProject('Proyecto B4','','',null)");
    const PID = row.id;
    fs.writeFileSync(path.join(SB, 'pid.txt'), String(PID), 'utf8');
    tlog('proyecto creado id=' + PID);

    // ---------- 1. DASHBOARD real ----------
    await lanzador.webContents.executeJavaScript('window.launcherAPI.openProject(' + PID + ')');
    const vProj = await esperarVentana('projects/' + PID + '/dashboard.html');
    ok('la ventana del DASHBOARD real abre', !!vProj);
    await esperar(3000);
    const CLAVE = 'panorama_servicio_ib__panorama-servicio-full__proj-' + PID;
    await vProj.webContents.executeJavaScript(
      'localStorage.setItem(' + JSON.stringify(CLAVE) + ", JSON.stringify({projectTitle:'Servicio B4', marca:'DASH-V1', hitos:2})); 'ok'");
    const rDash = await vProj.webContents.executeJavaScript(
      "(function(){var d={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);d[k]=localStorage.getItem(k);}" +
      "return window.panoramaBridge.saveBackup(JSON.stringify(d),'manual');})()");
    ok('DASHBOARD: el preload real devuelve el CONTRATO DE ACCION',
      !!(rDash && typeof rDash === 'object' && rDash.aplicado === true && rDash.verificado === true),
      JSON.stringify(rDash));
    ok('   con su action_id', !!(rDash && /^[0-9a-f]{32}$/.test(String(rDash.actionId))), rDash && rDash.actionId);
    await esperar(800);
    const filaB = dbmod.get('SELECT file_path, encrypted FROM backups WHERE project_id=? ORDER BY id DESC LIMIT 1', [PID]);
    ok('   la fila existe en la BD real', !!filaB, JSON.stringify(filaB));
    const proj = dbmod.get('SELECT * FROM projects WHERE id=?', [PID]);
    const fBackup = path.join(UD, 'backups', proj.backup_dir, filaB.file_path);
    ok('   y su archivo en disco', fs.existsSync(fBackup), fBackup);
    ok('   el nombre lleva nonce', /^backup_.+_[0-9a-f]{8}\.json$/.test(filaB.file_path), filaB.file_path);
    ok('   el titulo del proyecto se actualizo EN EL MISMO commit',
      dbmod.get('SELECT name FROM projects WHERE id=?', [PID]).name === 'Servicio B4');
    // marca de accion
    const marca = dbmod.get("SELECT value FROM app_meta WHERE key LIKE 'acciones_%'");
    ok('   la marca de accion esta en app_meta', !!marca && String(marca.value).includes(rDash.actionId),
      marca && String(marca.value).slice(0, 80));
    ok('   NO queda ningun journal de accion',
      !fs.existsSync(path.join(UD, '.panorama-acciones')) || fs.readdirSync(path.join(UD, '.panorama-acciones')).length === 0,
      fs.existsSync(path.join(UD, '.panorama-acciones')) ? fs.readdirSync(path.join(UD, '.panorama-acciones')).join(',') : '(no existe)');
    ok('   ni .tmp/.old sueltos',
      fs.readdirSync(path.dirname(fBackup)).every((f) => !/\.(tmp|old)-/.test(f)),
      fs.readdirSync(path.dirname(fBackup)).join(','));

    // ---------- 2. DIRECTORIO real ----------
    // preload-launcher.js expone openDirectorio() -> IPC 'directorio:open'.
    // OJO: el Directorio se abre con openProjectWindow(), asi que su URL es
    // `projects/<id>/dashboard.html` como cualquier proyecto, no lleva la
    // palabra "directorio".
    await lanzador.webContents.executeJavaScript('window.launcherAPI.openDirectorio()').catch((e) => tlog('openDirectorio: ' + e));
    await esperar(2500);
    // DIRECTORIO_KIND en main.js es 'directorio_talento' (guion bajo).
    const filaDir = dbmod.get("SELECT * FROM projects WHERE kind='directorio_talento'");
    tlog('proyecto del Directorio: ' + JSON.stringify(filaDir && filaDir.id));
    const vDir = filaDir ? await esperarVentana('projects/' + filaDir.id + '/', 20000) : null;
    ok('la ventana del DIRECTORIO real abre', !!vDir);
    if (vDir) {
      await esperar(2500);
      await esperar(2500);
      await vDir.webContents.executeJavaScript(
        "localStorage.setItem('panorama_servicio_ib__dt-directorio-talento-state-v1', JSON.stringify({marca:'DIR-V1'})); 'ok'");
      const rDir = await vDir.webContents.executeJavaScript(
        "(function(){var d={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);d[k]=localStorage.getItem(k);}" +
        "return window.panoramaBridge.saveBackup(JSON.stringify(d),'manual');})()");
      ok('DIRECTORIO: el preload real devuelve el CONTRATO DE ACCION',
        !!(rDir && typeof rDir === 'object' && rDir.aplicado === true && rDir.verificado === true), JSON.stringify(rDir));
      const filaD = dbmod.get('SELECT file_path FROM backups WHERE project_id=? ORDER BY id DESC LIMIT 1', [filaDir.id]);
      ok('   con su fila y su archivo',
        !!filaD && fs.existsSync(path.join(UD, 'backups', filaDir.backup_dir, filaD.file_path)),
        JSON.stringify(filaD));
    } else {
      tlog('AVISO: no se pudo abrir el Directorio de Talento en este arranque; se omite esa comprobacion.');
    }

    // ---------- 3. PREPARACION DE REUNION real ----------
    const rPrep = await vProj.webContents.executeJavaScript(
      "window.panoramaBridge.saveMeetingPrep('2026-05-05','prueba B4', JSON.stringify({tipo:'prep',marca:'PREP-V1'}))");
    ok('REUNION: saveMeetingPrep devuelve el contrato',
      !!(rPrep && rPrep.aplicado === true && rPrep.verificado === true && typeof rPrep.id === 'number'), JSON.stringify(rPrep));
    const filaP = dbmod.get('SELECT id, file_path FROM meeting_preps WHERE project_id=?', [PID]);
    ok('   con su fila y su id', !!filaP && filaP.id === rPrep.id, JSON.stringify(filaP));
    const fPrep = path.join(UD, 'backups', proj.backup_dir, 'reuniones', filaP.file_path);
    ok('   y su archivo', fs.existsSync(fPrep), fPrep);
    const rUpd = await vProj.webContents.executeJavaScript(
      "window.panoramaBridge.updateMeetingPrep(" + filaP.id + ",'2026-06-06','editada', JSON.stringify({tipo:'prep',marca:'PREP-V2'}))");
    ok('REUNION: updateMeetingPrep devuelve el contrato', !!(rUpd && rUpd.aplicado === true), JSON.stringify(rUpd));
    ok('   y sobrescribe EL MISMO archivo', /PREP-V2/.test(fs.readFileSync(fPrep, 'utf8')));
    ok('   sin dejar .old', fs.readdirSync(path.dirname(fPrep)).every((f) => !/\.old-/.test(f)),
      fs.readdirSync(path.dirname(fPrep)).join(','));

    // ---------- 4. EVALUACION DE CANDIDATOS real ----------
    const rEv1 = await vProj.webContents.executeJavaScript(
      "window.panoramaBridge.saveCandidateEvalData(JSON.stringify({puestos:[],evaluaciones:[],marca:'EVAL-V1'}))");
    ok('CANDIDATOS: el PRIMER guardado (archivo inexistente) funciona',
      !!(rEv1 && rEv1.aplicado === true && rEv1.verificado === true), JSON.stringify(rEv1));
    const fEval = path.join(UD, 'backups', proj.backup_dir, 'evaluacion-candidatos', 'estado.json');
    ok('   con su archivo', fs.existsSync(fEval), fEval);
    ok('   y su fila', dbmod.all('SELECT * FROM candidate_evals WHERE project_id=?', [PID]).length === 1);
    const rEv2 = await vProj.webContents.executeJavaScript(
      "window.panoramaBridge.saveCandidateEvalData(JSON.stringify({puestos:[],evaluaciones:[],marca:'EVAL-V2'}))");
    ok('CANDIDATOS: el SEGUNDO es un reemplazo real', !!(rEv2 && rEv2.aplicado === true) && /EVAL-V2/.test(fs.readFileSync(fEval, 'utf8')),
      JSON.stringify(rEv2));
    ok('   sin residuos', fs.readdirSync(path.dirname(fEval)).every((f) => !/\.(tmp|old)-/.test(f)),
      fs.readdirSync(path.dirname(fEval)).join(','));

    fs.writeFileSync(path.join(SB, 'huellas.json'), JSON.stringify({
      backup: shaF(fBackup), prep: shaF(fPrep), eval: shaF(fEval),
      backupFile: filaB.file_path, prepId: filaP.id, part: proj.partition_name, backupDir: proj.backup_dir,
      // el commit REAL y el writer REAL, leidos de la BD abierta por la app
      commit: dbmod.getCommitActual(), writer: dbmod.getInstallationId(),
    }), 'utf8');
    tlog('--- FIN GUARDADOS ---');
    setTimeout(() => app.exit(0), 1200);
    return;
  }

  // ==================================================================
  if (MODO === 'reabrir') {
    tlog('--- REAPERTURA: los datos siguen ahi ---');
    const PID = parseInt(fs.readFileSync(path.join(SB, 'pid.txt'), 'utf8'), 10);
    const h = JSON.parse(fs.readFileSync(path.join(SB, 'huellas.json'), 'utf8'));
    const proj = dbmod.get('SELECT * FROM projects WHERE id=?', [PID]);
    ok('el proyecto sigue en la BD', !!proj && proj.name === 'Servicio B4', JSON.stringify(proj && proj.name));
    const fBackup = path.join(UD, 'backups', proj.backup_dir, h.backupFile);
    ok('el backup sigue byte a byte igual', shaF(fBackup) === h.backup, shaF(fBackup));
    const filaP = dbmod.get('SELECT file_path FROM meeting_preps WHERE project_id=?', [PID]);
    ok('la preparacion de reunion sigue igual',
      shaF(path.join(UD, 'backups', proj.backup_dir, 'reuniones', filaP.file_path)) === h.prep);
    ok('la evaluacion de candidatos sigue igual',
      shaF(path.join(UD, 'backups', proj.backup_dir, 'evaluacion-candidatos', 'estado.json')) === h.eval);
    ok('no quedan journals de accion',
      !fs.existsSync(path.join(UD, '.panorama-acciones')) || fs.readdirSync(path.join(UD, '.panorama-acciones')).length === 0);
    tlog('--- FIN REAPERTURA ---');
    setTimeout(() => app.exit(0), 800);
    return;
  }

  // ==================================================================
  // El journal plantado ANTES de arrancar debia resolverse en el arranque.
  if (MODO === 'recovery-ok') {
    tlog('--- RECOVERY DE ACCION AL ARRANCAR ---');
    const PID = parseInt(fs.readFileSync(path.join(SB, 'pid.txt'), 'utf8'), 10);
    const proj = dbmod.get('SELECT * FROM projects WHERE id=?', [PID]);
    const destino = path.join(UD, 'backups', proj.backup_dir, 'evaluacion-candidatos', 'estado.json');
    const esperado = fs.readFileSync(path.join(SB, 'esperado.txt'), 'utf8');
    ok('la app ARRANCO (el journal era resoluble)', true);
    ok('el archivo volvio a su contenido ORIGINAL', fs.readFileSync(destino, 'utf8') === esperado,
      fs.readFileSync(destino, 'utf8').slice(0, 60));
    ok('el journal se retiro',
      !fs.existsSync(path.join(UD, '.panorama-acciones')) || fs.readdirSync(path.join(UD, '.panorama-acciones')).length === 0,
      fs.existsSync(path.join(UD, '.panorama-acciones')) ? fs.readdirSync(path.join(UD, '.panorama-acciones')).join(',') : '(no existe)');
    ok('y no quedan .tmp/.old', fs.readdirSync(path.dirname(destino)).every((f) => !/\.(tmp|old)-/.test(f)),
      fs.readdirSync(path.dirname(destino)).join(','));
    tlog('--- FIN RECOVERY ---');
    setTimeout(() => app.exit(0), 800);
  }
});
