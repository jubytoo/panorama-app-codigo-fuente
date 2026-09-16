// ---------------------------------------------------------------------------
// E2 — ARRANQUE ELECTRON REAL: el lanzador y el dashboard del MISMO proyecto
// tienen que decir lo mismo.
//
// Antes de E2 no lo decian: con `serviceStart` en el futuro, el lanzador ponia
// "Arranca en 3 dias" y el propio dashboard "Servicio finaliza en 20 dias",
// porque cada uno tenia su copia de la logica y solo una recibio el fix de
// v2.0.52. Aqui se comprueba en la aplicacion de verdad, con las dos ventanas
// abiertas a la vez.
//
// IMPORTANTE sobre el ORIGEN DE DATOS. `main.js` lee el estado del ULTIMO
// BACKUP; el dashboard usa su `state` en memoria. Para que la comparacion sea
// de LOGICA y no de frescura, cada caso guarda un backup despues de fijar las
// fechas — asi los dos observan el mismo estado. Esa diferencia de origen es un
// pendiente aparte (ver "fuente/frescura" en pendientes-abiertos.md) y E2 no la
// resuelve; solo se neutraliza aqui para poder medir lo que E2 SI garantiza.
//
// Arnes propio: no toca real-run/a2.js, e1.js ni p12.js.
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
const consola = [];
tlog('ARRANQUE del arnes E2  sandbox=' + SB + '  main=' + (MAIN_ARG || '(real)'));
process.on('exit', (c) => tlog('process exit code=' + c));
process.on('uncaughtException', (e) => { excepciones.push(String((e && e.stack) || e)); tlog('UNCAUGHT: ' + String((e && e.stack) || e)); });
app.on('web-contents-created', (evt, wc) => {
  wc.on('console-message', (e, nivel, mensaje, linea, fuente) => {
    if (nivel >= 2) consola.push({ nivel, mensaje: String(mensaje).slice(0, 180), fuente: String(fuente).slice(-50) });
  });
});

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

  tlog('--- E2-R: lanzador y dashboard, el mismo proyecto, a la vez ---');

  const CASOS = [
    { id: 'E2-R1', que: 'inicio FUTURO (el caso que divergia)', fechas: { serviceStart: dPlus(3), serviceEnd: dPlus(20) }, esperaKind: 'proximo-inicio', esperaTexto: /^Arranca en 3 días$/ },
    { id: 'E2-R2', que: 'fin proximo normal', fechas: { serviceStart: dPlus(-100), serviceEnd: dPlus(12) }, esperaKind: 'finaliza-pronto', esperaTexto: /^Servicio finaliza en 12 días$/ },
    { id: 'E2-R3', que: 'prorroga estimada proxima', fechas: { serviceStart: dPlus(-100), serviceEnd: dPlus(400), prorrogaEstimada: { fecha: dPlus(9) } }, esperaKind: 'prorroga-pronto', esperaTexto: /quedan 9 días$/ },
    { id: 'E2-R4', que: 'servicio VENCIDO', fechas: { serviceStart: dPlus(-400), serviceEnd: dPlus(-9) }, esperaKind: 'finalizado', esperaTexto: /^Finalizó el / },
    { id: 'E2-R5', que: 'proyecto SIN fechas', fechas: { serviceStart: null, serviceEnd: null }, esperaKind: null, esperaTexto: null },
  ];

  for (const c of CASOS) {
    const row = await jsL(`window.launcherAPI.createProject(${JSON.stringify('E2 ' + c.id)},'Cliente E2','',null)`);
    await esperar(500);
    await jsL(`window.launcherAPI.openProject(${row.id})`);
    const v = await esperarVentana(`projects/${row.id}/dashboard.html`, 30000);
    if (!v) { ok(c.id + ' se abre el dashboard', false, 'no aparecio'); continue; }
    await esperar(2600);
    const jsD = (s) => v.webContents.executeJavaScript(s);

    // Fijar las fechas en el estado vivo, repintar, y GUARDAR BACKUP: main.js
    // lee del backup, asi que sin esto estariamos comparando frescura, no logica.
    const f = c.fechas;
    await jsD(`(function(){
      state.serviceStart = ${JSON.stringify(f.serviceStart || null)};
      state.serviceEnd   = ${JSON.stringify(f.serviceEnd || null)};
      state.prorrogaEstimada = ${JSON.stringify(f.prorrogaEstimada || null)};
      state.enProrroga = false;
      render();
      return 'ok';
    })()`);
    await jsD('typeof saveState === "function" ? saveState() : null');
    await esperar(700);
    const guardado = await jsD(`(function(){var d={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);d[k]=localStorage.getItem(k);}
      return window.panoramaBridge.saveBackup(JSON.stringify(d),'manual');})()`);
    ok(c.id + ' el backup se guarda (los dos miran el mismo estado)',
      guardado && guardado.aplicado === true, JSON.stringify(guardado && guardado.error));
    await esperar(800);

    // Lo que ve el DASHBOARD (su propio aviso, pintado en pantalla).
    const dash = await jsD(`(function(){
      var slot = document.getElementById('service-end-warning-slot');
      var w = (typeof computeServiceEndWarningLocal === 'function')
        ? computeServiceEndWarningLocal(new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()))
        : '(sin funcion)';
      return { texto: slot ? (slot.textContent||'').trim() : '(sin slot)',
        kind: w ? w.kind : null, level: w ? w.level : null, days: w ? w.days : null, message: w ? w.message : null,
        helper: (typeof PanoramaServiceStatus !== 'undefined') };
    })()`);

    // Lo que ve el LANZADOR (el dato real que produce main.js).
    const fila = await jsL(`window.launcherAPI.listProjects().then(function(rs){
      var r = rs.filter(function(x){ return x.id === ${row.id}; })[0] || {};
      return { level: r.serviceEndLevel, message: r.serviceEndMessage, kind: r.serviceStatusKind, days: r.serviceStatusDays };
    })`);

    info(c.id + ' ' + c.que);
    info('   lanzador : ' + JSON.stringify(fila));
    info('   dashboard: ' + JSON.stringify({ kind: dash.kind, level: dash.level, days: dash.days, message: dash.message }));
    info('   en pantalla: ' + JSON.stringify(dash.texto));

    ok(c.id + ' el dashboard carga la fuente unica (PanoramaServiceStatus)', dash.helper === true);
    ok(c.id + ' MISMO kind en lanzador y dashboard: ' + JSON.stringify(fila.kind),
      fila.kind === dash.kind, JSON.stringify({ launcher: fila.kind, dashboard: dash.kind }));
    ok(c.id + ' MISMO level', fila.level === dash.level, JSON.stringify({ launcher: fila.level, dashboard: dash.level }));
    ok(c.id + ' MISMOS days', fila.days === dash.days, JSON.stringify({ launcher: fila.days, dashboard: dash.days }));
    ok(c.id + ' MISMO message', fila.message === dash.message, JSON.stringify({ launcher: fila.message, dashboard: dash.message }));
    ok(c.id + ' y es el esperado (' + (c.esperaKind || 'sin aviso') + ')',
      fila.kind === c.esperaKind && (c.esperaTexto === null ? fila.message === null : c.esperaTexto.test(fila.message || '')),
      JSON.stringify({ kind: fila.kind, message: fila.message }));
    if (c.esperaTexto !== null) {
      ok(c.id + ' el aviso se ve EN PANTALLA en el dashboard, con ese mismo texto',
        dash.texto.indexOf(dash.message) >= 0, JSON.stringify({ pantalla: dash.texto, esperado: dash.message }));
    } else {
      ok(c.id + ' sin fechas no se pinta ningun aviso', dash.texto === '', JSON.stringify(dash.texto));
    }

    v.destroy();
    await esperar(700);
  }

  // Sin errores nuevos de renderer por este cambio.
  const RUIDO = /Autofill|GPU|gpu_|Electron Security Warning|devtools|favicon/i;
  const reales = consola.filter((c) => !RUIDO.test(c.mensaje));
  info('errores de renderer tras filtrar ruido: ' + reales.length);
  for (const e of reales.slice(0, 6)) info('   ' + e.fuente + '  ' + e.mensaje);
  ok('E2-R6 cero errores de renderer', reales.length === 0, JSON.stringify(reales.slice(0, 3)));
  ok('E2-R7 cero excepciones en el proceso principal', excepciones.length === 0, JSON.stringify(excepciones.slice(0, 2)));

  tlog('FIN e2');
  await esperar(500);
  app.exit(0);
})().catch((e) => { tlog('EXCEPCION EN EL ARNES: ' + String((e && e.stack) || e)); app.exit(4); });
