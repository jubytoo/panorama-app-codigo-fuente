// Prueba de humo reutilizable — pensada para correr ANTES de cada entrega,
// no solo cuando se sospecha un bug concreto. Cubre los flujos que ya han
// dado problemas reales en esta sesión (persistencia de datos entre
// aperturas, Directorio de Talento, aviso de carga fallida) para que una
// regresión como la de la 0.1.35/0.1.37 se detecte sola la próxima vez, en
// vez de depender de que el usuario la encuentre en producción.
//
// USO:
//   1) Arranca la app apuntando a un userData DE PRUEBAS, nunca al real:
//        rm -rf /tmp/panorama_smoke && mkdir -p /tmp/panorama_smoke
//        npx electron . --user-data-dir=/tmp/panorama_smoke \
//            --remote-debugging-port=9222 --no-sandbox &
//   2) node scripts/smoke_test.js
//
// Requiere Xvfb + DISPLAY activo (o cualquier entorno donde Electron pueda
// abrir ventanas). No toca la carpeta de datos real del usuario si se le
// pasa un --user-data-dir de pruebas como arriba — este script en sí no
// arranca la app, solo la pilota vía CDP contra lo que ya esté corriendo.

const CDP_BASE = 'http://localhost:9223';

async function listTargets() {
  const res = await fetch(`${CDP_BASE}/json`);
  return res.json();
}

async function cdpEval(needle, expr, { retries = 10, delayMs = 500 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    const targets = await listTargets();
    const target = targets.find((t) => (t.title || '').includes(needle) || (t.url || '').includes(needle));
    if (!target) {
      lastErr = new Error(`No se encontró ventana con: ${needle}`);
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    let msgId = 1;
    const pending = new Map();
    const send = (method, params = {}) => {
      const id = msgId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    };
    try {
      await new Promise((resolve, reject) => {
        ws.addEventListener('open', resolve);
        ws.addEventListener('error', reject);
      });
      ws.addEventListener('message', (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id && pending.has(msg.id)) {
          const { resolve, reject } = pending.get(msg.id);
          pending.delete(msg.id);
          if (msg.error) reject(new Error(JSON.stringify(msg.error)));
          else resolve(msg.result);
        }
      });
      const result = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      ws.close();
      if (result.exceptionDetails) {
        throw new Error('Excepción en página: ' + JSON.stringify(result.exceptionDetails));
      }
      return result.result ? result.result.value : undefined;
    } catch (e) {
      lastErr = e;
      try { ws.close(); } catch (_) {}
    }
  }
  throw lastErr;
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓ PASS' : '✗ FAIL'} — ${name}${detail ? ' — ' + detail : ''}`);
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  console.log('=== Prueba de humo — Panorama del Servicio ===\n');

  // Espera a que el lanzador esté disponible.
  await cdpEval('Proyectos', "(function(){ return true; })()", { retries: 20, delayMs: 500 });

  // --- CHECK 1: crear proyecto, guardar un hito, cerrar, reabrir, comprobar persistencia ---
  const proj = JSON.parse(await cdpEval(
    'Proyectos',
    "(function(){ return window.launcherAPI.createProject('SMOKE TEST', 'Cliente Smoke', '2026-01-01', null).then(r=>JSON.stringify(r)); })()"
  ));
  await cdpEval('Proyectos', `(function(){ return window.launcherAPI.openProject(${proj.id}).then(r=>JSON.stringify(r)); })()`);
  await sleep(1500);
  const needle = `projects/${proj.id}/dashboard`;

  await cdpEval(needle, `(function(){
    state.milestones.push({id:'smoke1', name:'Hito de humo', date:'2026-06-01', actualDate:null, descripcion:'', recurrente:false, entregables:[]});
    return saveState();
  })()`);
  const versionBeforeClose = await cdpEval(needle, "(function(){ return STORAGE_KEY; })()");
  await cdpEval(needle, "window.close()").catch(() => {});
  await sleep(800);
  await cdpEval('Proyectos', `(function(){ return window.launcherAPI.openProject(${proj.id}).then(r=>JSON.stringify(r)); })()`);
  await sleep(1500);
  const reopened = JSON.parse(await cdpEval(needle, "(function(){ return JSON.stringify({key: STORAGE_KEY, milestones: state.milestones.length, warning: dataLoadWarning}); })()"));
  record(
    'Proyecto nuevo: el hito persiste tras cerrar y reabrir',
    reopened.milestones === 1 && reopened.key === versionBeforeClose,
    JSON.stringify(reopened)
  );
  record('Proyecto con datos reales: NO se dispara el aviso de carga fallida', reopened.warning === false, JSON.stringify(reopened));
  record('La clave de almacenamiento es por id de proyecto (esquema 0.1.40+)', reopened.key === `panorama-servicio-full__proj-${proj.id}`, reopened.key);

  // --- CHECK 2: proyecto genuinamente nuevo y vacío no debe disparar el aviso ---
  const proj2 = JSON.parse(await cdpEval(
    'Proyectos',
    "(function(){ return window.launcherAPI.createProject('SMOKE TEST VACIO', '', '', null).then(r=>JSON.stringify(r)); })()"
  ));
  await cdpEval('Proyectos', `(function(){ return window.launcherAPI.openProject(${proj2.id}).then(r=>JSON.stringify(r)); })()`);
  await sleep(1500);
  const needle2 = `projects/${proj2.id}/dashboard`;
  const fresh = JSON.parse(await cdpEval(needle2, "(function(){ return JSON.stringify({warning: dataLoadWarning}); })()"));
  record('Proyecto nuevo y vacío: NO dispara falsamente el aviso de carga fallida', fresh.warning === false, JSON.stringify(fresh));
  await cdpEval(needle2, "window.close()").catch(() => {});

  // --- CHECK 3: Directorio de Talento abre sin errores ---
  await cdpEval('Proyectos', "(function(){ return window.launcherAPI.openDirectorio().then(r=>JSON.stringify(r)); })()");
  await sleep(1500);
  const dirTargets = await listTargets();
  const dirOk = dirTargets.some((t) => (t.title || '').includes('Directorio de Talento'));
  record('Directorio de Talento abre correctamente', dirOk);

  // --- CHECK 4: la versión visible en el lanzador coincide con package.json ---
  const pkgVersion = require('../package.json').version;
  const launcherVersion = await cdpEval('Proyectos', "(function(){ return document.getElementById('version-badge').textContent; })()");
  record('La versión del badge del lanzador coincide con package.json', launcherVersion === `v${pkgVersion}`, `${launcherVersion} vs v${pkgVersion}`);

  console.log('\n=== Resumen ===');
  const failed = results.filter((r) => !r.ok);
  console.log(`${results.length - failed.length}/${results.length} comprobaciones OK`);
  if (failed.length) {
    console.log('\nFallos:');
    failed.forEach((f) => console.log(` - ${f.name}${f.detail ? ' (' + f.detail + ')' : ''}`));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error('Error ejecutando la prueba de humo:', e);
  process.exitCode = 1;
});
