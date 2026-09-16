
const fs = require('fs');
const { spawn } = require('child_process');
const [, , pidStr, runDir, exePath, mainDir, udd] = process.argv;
const pid = parseInt(pidStr, 10);
function log(s){ try{ fs.appendFileSync(runDir + '\\log.txt', '[' + new Date().toISOString() + '] HELPER ' + s + '\n'); }catch(e){} }
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
