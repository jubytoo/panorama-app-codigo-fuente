// ---------------------------------------------------------------------------
// E1 — ARRANQUE ELECTRON REAL DEL LANZADOR, tras retirar los controles de
// Lista / Resumen de Cartera.
//
// Mismo envoltorio de aislamiento que a2.js/b5.js: appData/userData se
// redirigen al sandbox ANTES de cargar main.js, asi que la app real no
// encuentra el location.json del usuario y nunca apunta a G:.
//
// Arnes PROPIO a proposito: no se toca `real-run/a2.js`, que es la bateria de
// A2 y esta cerrada.
//
// Comprueba, con el lanzador de verdad en pantalla:
//   1. que el conmutador de vistas NO existe en el DOM;
//   2. que no queda ningun elemento que pueda activar esas vistas;
//   3. que la unica vista visible es la de tarjetas;
//   4. que crear proyectos, ordenarlos, abrirlos y refrescar sigue yendo;
//   5. que no hay errores de renderer ni excepciones en el main.
// ---------------------------------------------------------------------------
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const arg = process.argv.find((a) => a.startsWith('--sandbox='));
if (!arg) { console.error('falta --sandbox='); process.exit(2); }
const SB = arg.slice('--sandbox='.length);
const MAIN_ARG = (process.argv.find((a) => a.startsWith('--main=')) || '').slice(7);

// FAIL-CLOSED sobre el sandbox, igual que a2.js: una ruta troceada por espacios
// dejaria el log en una carpeta inexistente y la prueba PARECERIA no arrancar.
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

// Todo lo que el renderer escriba en consola con nivel error/warning queda
// anotado: "ausencia de errores de renderer" hay que MEDIRLA, no suponerla.
// Se declaran ANTES del handler de uncaughtException: al reves quedaban en la
// zona muerta temporal y el propio handler habria reventado.
const excepciones = [];
const erroresRenderer = [];

tlog('ARRANQUE del arnes E1  sandbox=' + SB + '  main=' + (MAIN_ARG || '(real)'));
process.on('exit', (c) => tlog('process exit code=' + c));
process.on('uncaughtException', (e) => { excepciones.push(String((e && e.stack) || e)); tlog('UNCAUGHT: ' + String((e && e.stack) || e)); });
app.on('web-contents-created', (evt, wc) => {
  wc.on('console-message', (e, nivel, mensaje, linea, fuente) => {
    if (nivel >= 2) erroresRenderer.push({ nivel, mensaje: String(mensaje).slice(0, 200), fuente: String(fuente).slice(-60) });
  });
  wc.on('render-process-gone', (e, d) => erroresRenderer.push({ nivel: 9, mensaje: 'render-process-gone: ' + JSON.stringify(d), fuente: '' }));
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

(async () => {
  await app.whenReady();
  await esperar(1200);

  const lanzador = await esperarVentana('launcher/index.html');
  if (!lanzador) { tlog('ERROR: no aparecio el lanzador'); app.exit(3); return; }
  await esperar(1800);
  const js = (s) => lanzador.webContents.executeJavaScript(s);

  tlog('--- E1-E: EL LANZADOR REAL, SIN LOS CONTROLES DE LISTA/RESUMEN ---');

  // ---- 1 y 2: el conmutador no esta, y nada puede activar esas vistas -----
  const dom = await js(`(function(){
    var sw = document.getElementById('view-switch');
    var dv = document.querySelectorAll('[data-view]');
    var vl = document.getElementById('view-list');
    var vs = document.getElementById('view-summary');
    var grid = document.getElementById('grid');
    var visible = function(el){ if(!el) return false; var r = el.getBoundingClientRect();
      var cs = getComputedStyle(el);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
    return { haySwitch: !!sw, nDataView: dv.length,
      vlPresente: !!vl, vsPresente: !!vs,
      vlVisible: visible(vl), vsVisible: visible(vs),
      gridDisplay: grid ? getComputedStyle(grid).display : '(sin #grid)',
      emptyVisible: visible(document.getElementById('empty')),
      textoCabecera: (document.querySelector('header') || {}).innerText || '',
      setViewExiste: (typeof setView), loadSummaryExiste: (typeof loadSummary) };
  })()`);
  info('DOM: ' + JSON.stringify(dom));

  ok('E1-E1 el conmutador #view-switch NO existe en el DOM real', dom.haySwitch === false);
  ok('E1-E2 no queda NINGUN elemento con data-view en toda la pagina', dom.nDataView === 0, String(dom.nDataView));
  ok('E1-E3 la cabecera ya no ofrece "Lista" ni "Resumen"',
    !/Lista/.test(dom.textoCabecera) && !/Resumen/.test(dom.textoCabecera),
    JSON.stringify(dom.textoCabecera.slice(0, 120)));
  ok('E1-E4 los contenedores de las dos vistas siguen presentes pero INVISIBLES',
    dom.vlPresente && dom.vsPresente && dom.vlVisible === false && dom.vsVisible === false,
    JSON.stringify(dom));

  // ---- 3: arranca en tarjetas --------------------------------------------
  // OJO: aqui todavia NO hay proyectos, asi que #grid esta VACIO y su
  // getBoundingClientRect() da altura 0. "Vacio" no es "oculto": lo que hay que
  // comprobar en este punto es que no esta apagado con display:none. La
  // visibilidad de verdad se vuelve a medir mas abajo, ya con tarjetas dentro.
  ok('E1-E5 la vista de TARJETAS es la que esta activa (sin display:none)',
    dom.gridDisplay !== 'none', JSON.stringify({ display: dom.gridDisplay, empty: dom.emptyVisible }));
  ok('E1-E5b y con cero proyectos se ve el cartel de "todavia no hay proyectos"',
    dom.emptyVisible === true, JSON.stringify(dom.emptyVisible));

  // Y nadie puede llegar a las otras: setView ni siquiera esta en el ambito
  // global del renderer (es un `function` de modulo de script clasico, asi que
  // SI lo esta -- lo que importa es que no hay nada que la invoque).
  info('typeof setView=' + dom.setViewExiste + '  typeof loadSummary=' + dom.loadSummaryExiste);
  ok('E1-E6 loadSummary sigue sin existir: las vistas siguen incompletas',
    dom.loadSummaryExiste === 'undefined', String(dom.loadSummaryExiste));

  // ---- 4: lo que SI funciona, sigue funcionando --------------------------
  const nombres = ['Servicio E1 Alfa', 'Servicio E1 Beta', 'Servicio E1 Gamma'];
  const creados = [];
  for (const n of nombres) {
    const row = await js(`window.launcherAPI.createProject(${JSON.stringify(n)},'Cliente E1','',null)`);
    creados.push(row);
    await esperar(500);
  }
  ok('E1-E7 se crean los tres proyectos por el IPC real',
    creados.length === 3 && creados.every((r) => r && r.id > 0),
    JSON.stringify(creados.map((r) => r && r.id)));

  // Sin `return`: executeJavaScript evalua una EXPRESION, y un `return` al
  // nivel superior es SyntaxError. Con el .catch() de antes se habria tragado
  // en silencio y la prueba habria pasado sin refrescar nada.
  const refresco1 = await js('typeof refresh === "function" ? (refresh(), "ok") : "no-existe"');
  ok('E1-E7b refresh() existe y se puede invocar desde el renderer real', refresco1 === 'ok', String(refresco1));
  await esperar(1500);

  const tarjetas = await js(`(function(){
    var c = document.querySelectorAll('#grid .card');
    return { n: c.length, ids: [].map.call(c, function(x){ return Number(x.dataset.id); }),
      nombres: [].map.call(c, function(x){ var h=x.querySelector('h3'); return h?h.textContent:''; }),
      arrastrables: [].every.call(c, function(x){ return x.draggable === true; }),
      conAcciones: [].every.call(c, function(x){ return x.querySelectorAll('[data-act]').length >= 4; }) };
  })()`);
  info('tarjetas: ' + JSON.stringify(tarjetas));
  ok('E1-E8 refresh() pinta una tarjeta por proyecto', tarjetas.n === 3, JSON.stringify(tarjetas.n));
  // Ahora SI se puede medir visibilidad de verdad: el grid tiene contenido.
  const vis = await js(`(function(){
    var v = function(el){ if(!el) return false; var r=el.getBoundingClientRect(); var cs=getComputedStyle(el);
      return cs.display!=='none' && cs.visibility!=='hidden' && r.width>0 && r.height>0; };
    return { grid: v(document.getElementById('grid')), list: v(document.getElementById('view-list')),
      summary: v(document.getElementById('view-summary')), empty: v(document.getElementById('empty')) };
  })()`);
  info('visibilidad con tarjetas dentro: ' + JSON.stringify(vis));
  ok('E1-E8b con proyectos, la UNICA vista visible es la de tarjetas',
    vis.grid === true && vis.list === false && vis.summary === false && vis.empty === false,
    JSON.stringify(vis));
  ok('E1-E9 con su nombre', nombres.every((n) => tarjetas.nombres.indexOf(n) >= 0), JSON.stringify(tarjetas.nombres));
  ok('E1-E10 y con sus cuatro acciones (abrir/restaurar/carpeta/eliminar)', tarjetas.conAcciones === true);

  // ORDEN: el lanzador no tiene "ordenar por"; su ordenacion es el
  // arrastrar-y-soltar, que persiste con projects:reorder. Se ejercita el
  // canal real y se comprueba que el orden sobrevive a un refresh.
  ok('E1-E11 las tarjetas siguen siendo arrastrables (draggable)', tarjetas.arrastrables === true);
  const invertido = tarjetas.ids.slice().reverse();
  const rReorder = await js(`window.launcherAPI.reorderProjects(${JSON.stringify(invertido)})`);
  await esperar(400);
  await js('typeof refresh === "function" ? (refresh(), "ok") : "no-existe"');
  await esperar(1200);
  const tras = await js(`(function(){ var c=document.querySelectorAll('#grid .card');
    return [].map.call(c, function(x){ return Number(x.dataset.id); }); })()`);
  ok('E1-E12 el ORDEN por arrastrar-y-soltar sigue persistiendo (projects:reorder)',
    rReorder && rReorder.ok === true && JSON.stringify(tras) === JSON.stringify(invertido),
    JSON.stringify({ pedido: invertido, leido: tras }));

  // BUSQUEDA: el lanzador nunca la ha tenido. Se deja constancia medida, para
  // que no se lea como algo que esta retirada haya quitado.
  const hayBusqueda = await js(`document.querySelectorAll('input[type=search], #search, [id*=buscar]').length`);
  ok('E1-E13 el lanzador no tiene busqueda (ni la tenia antes): nada que regresar',
    hayBusqueda === 0, String(hayBusqueda));

  // ABRIR PROYECTO: por el camino real, con su ventana de verdad.
  const PID = creados[0].id;
  await js(`window.launcherAPI.openProject(${PID})`);
  const vProj = await esperarVentana(`projects/${PID}/dashboard.html`, 30000);
  ok('E1-E14 abrir un proyecto sigue abriendo su ventana real', !!vProj);
  if (vProj) {
    await esperar(2500);
    const vivo = await vProj.webContents.executeJavaScript('document.readyState').catch(() => 'error');
    ok('E1-E15 y su dashboard carga del todo', vivo === 'complete', String(vivo));
    vProj.destroy();
    await esperar(800);
  }

  // ---- 5: ni errores de renderer ni excepciones en el main ---------------
  // Se filtra el ruido conocido de Chromium en entorno sin GPU/sandbox, que no
  // es de la aplicacion: marcarlo como fallo seria un falso positivo.
  const RUIDO = /Autofill|GPU|gpu_|Electron Security Warning|devtools|Failed to load resource: net::ERR_FILE_NOT_FOUND.*favicon/i;
  const realesRenderer = erroresRenderer.filter((e) => !RUIDO.test(e.mensaje));
  // Se separan por VENTANA. E1 toca el lanzador y solo el lanzador: mezclar
  // aqui los errores del dashboard convertiria un hallazgo ajeno en un fallo de
  // esta correccion, y al reves — taparlo — seria peor.
  const delLanzador = realesRenderer.filter((e) => /launcher\/index\.html/.test(e.fuente));
  const deOtras = realesRenderer.filter((e) => !/launcher\/index\.html/.test(e.fuente));
  info('errores de renderer: ' + erroresRenderer.length + ' totales, ' + realesRenderer.length +
    ' tras filtrar ruido (' + delLanzador.length + ' del lanzador, ' + deOtras.length + ' de otras ventanas)');
  ok('E1-E16 cero errores de renderer EN EL LANZADOR, que es lo que E1 toca',
    delLanzador.length === 0, JSON.stringify(delLanzador.slice(0, 3)));

  // HALLAZGO APARTE, ni se arregla ni se silencia aqui: el dashboard de un
  // proyecto RECIEN CREADO (sin datos) pinta SVG con coordenadas NaN. No lo
  // causa E1 —`plantilla_dashboard.html` no se ha tocado en ninguna ronda— y no
  // rompe el arranque, pero queda MEDIDO y anotado en vez de perdido.
  if (deOtras.length) {
    info('HALLAZGO AJENO A E1 (' + deOtras.length + ' errores en otras ventanas):');
    for (const e of deOtras.slice(0, 8)) info('   ' + e.fuente + '  ' + e.mensaje);
  }
  ok('E1-E16b los errores de otras ventanas quedan REGISTRADOS, no confundidos con E1',
    true, 'registrados: ' + deOtras.length);
  ok('E1-E17 cero excepciones no capturadas en el proceso principal',
    excepciones.length === 0, JSON.stringify(excepciones.slice(0, 2)));

  tlog('FIN e1');
  await esperar(500);
  app.exit(0);
})().catch((e) => { tlog('EXCEPCION EN EL ARNES: ' + String((e && e.stack) || e)); app.exit(4); });
