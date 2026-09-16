// Arnés aislado para A3.1. Replica EXACTAMENTE el patrón que se ha metido en
// main.js de Panorama (requestSingleInstanceLock antes de nada + app.exit(0)
// si no se obtiene) y los tres flujos de relanzamiento de la app real.
// No abre ninguna ventana y usa su propio --user-data-dir temporal: no toca
// nada de Panorama ni de los datos del usuario.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function argVal(flag) {
  const a = process.argv.find((x) => x.startsWith(flag + '='));
  return a ? a.slice(flag.length + 1) : null;
}
const RUN = argVal('--run-dir');
const MODE = argVal('--mode') || 'hold';
const UDD = argVal('--user-data-dir');
const MAIN_DIR = __dirname;

function log(s) {
  try { fs.appendFileSync(path.join(RUN, 'log.txt'), `[${new Date().toISOString()}] pid=${process.pid} mode=${MODE} ${s}\n`); } catch (e) {}
}

// ===== MISMO PATRÓN QUE PANORAMA main.js (A3.1) =============================
const got = app.requestSingleInstanceLock();
log('requestSingleInstanceLock -> ' + got);
if (!got) {
  log('SEGUNDA INSTANCIA: app.exit(0) sin tocar datos');
  app.exit(0);
}
app.on('second-instance', () => log('EVENTO second-instance RECIBIDO'));
// ===========================================================================

const HELPER_SRC = `
const fs = require('fs');
const { spawn } = require('child_process');
const [, , pidStr, runDir, exePath, mainDir, udd] = process.argv;
const pid = parseInt(pidStr, 10);
function log(s){ try{ fs.appendFileSync(runDir + '\\\\log.txt', '[' + new Date().toISOString() + '] HELPER ' + s + '\\n'); }catch(e){} }
function alive(p){ try{ process.kill(p, 0); return true; }catch(e){ return false; } }
const started = Date.now();
function tick(){
  if(!alive(pid)){
    log('pid ' + pid + ' ya muerto -> relanzando INMEDIATAMENTE (peor caso para el cerrojo)');
    const env = Object.assign({}, process.env);
    delete env.ELECTRON_RUN_AS_NODE;
    const c = spawn(exePath, [mainDir, '--run-dir=' + runDir, '--mode=helper2', '--user-data-dir=' + udd], { detached: true, stdio: 'ignore', env });
    c.unref();
    return;
  }
  if(Date.now() - started > 30000){ log('timeout esperando al pid'); return; }
  setTimeout(tick, 100);
}
log('esperando a que muera el pid ' + pid + ' (sondeo cada 100ms, mas agresivo que los 500ms reales)');
tick();
`;

app.whenReady().then(() => {
  log('whenReady OK (esta instancia tiene el cerrojo)');

  if (MODE === 'relaunch') {
    const genFile = path.join(RUN, 'gen.txt');
    let gen = 0;
    try { gen = parseInt(fs.readFileSync(genFile, 'utf8'), 10) || 0; } catch (e) {}
    if (gen === 0) {
      fs.writeFileSync(genFile, '1', 'utf8');
      log('generacion 0 -> app.relaunch() + app.exit(0)  [patron de changeUserDataLocation / resetUserDataLocationToDefault]');
      app.relaunch();
      app.exit(0);
      return;
    }
    log('generacion 1 -> LA APP HA VUELTO A ARRANCAR TRAS relaunch() Y HA OBTENIDO EL CERROJO');
    setTimeout(() => app.exit(0), 200);
    return;
  }

  if (MODE === 'helper') {
    const helper = path.join(RUN, 'helper.js');
    fs.writeFileSync(helper, HELPER_SRC, 'utf8');
    const env = Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' });
    const child = spawn(process.execPath, [helper, String(process.pid), RUN, process.execPath, MAIN_DIR, UDD], { detached: true, stdio: 'ignore', env });
    child.unref();
    log('ayudante de parche lanzado; esta instancia sale en 300ms  [patron de relaunchApp() del helper]');
    setTimeout(() => app.exit(0), 300);
    return;
  }

  if (MODE === 'helper2') {
    log('RELANZADA POR EL AYUDANTE Y HA OBTENIDO EL CERROJO');
    setTimeout(() => app.exit(0), 200);
    return;
  }

  log('manteniendo el cerrojo 7s');
  setTimeout(() => { log('saliendo'); app.exit(0); }, 7000);
});
