// ---------------------------------------------------------------------------
// P12 — CORROBORACION EN ELECTRON REAL del defecto de los NaN.
//
// La bateria aislada (p12/test-p12-nan.js) demuestra la causa raiz ejecutando
// `renderRail()` extraida. Esto lo confirma en la aplicacion de verdad y, sobre
// todo, mide el ALCANCE que la version aislada solo puede razonar: que es lo
// que el USUARIO ve en pantalla con un proyecto recien creado.
//
// NO ARREGLA NADA. Arnes propio: no toca real-run/a2.js ni real-run/e1.js.
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
tlog('ARRANQUE del arnes P12  sandbox=' + SB + '  main=' + (MAIN_ARG || '(real)'));
process.on('exit', (c) => tlog('process exit code=' + c));
process.on('uncaughtException', (e) => { excepciones.push(String((e && e.stack) || e)); tlog('UNCAUGHT: ' + String((e && e.stack) || e)); });

app.on('web-contents-created', (evt, wc) => {
  wc.on('console-message', (e, nivel, mensaje, linea, fuente) => {
    if (nivel >= 2) consola.push({ nivel, mensaje: String(mensaje).slice(0, 200), fuente: String(fuente).slice(-55) });
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

// Lo que el USUARIO ve. No se interpreta nada: se lee el DOM tal cual.
const SONDA = `(function(){
  var g = function(id){ var e=document.getElementById(id); return e ? (e.textContent||'') : '(sin #'+id+')'; };
  var svg = document.getElementById('rail-svg');
  var nan = { total:0, porAtributo:{} };
  if (svg) {
    var els = svg.querySelectorAll('*');
    for (var i=0;i<els.length;i++){
      var at = els[i].attributes;
      for (var j=0;j<at.length;j++){
        if (at[j].value === 'NaN') { nan.total++; nan.porAtributo[at[j].name] = (nan.porAtributo[at[j].name]||0)+1; }
      }
    }
  }
  var html = svg ? svg.innerHTML : '';
  // El marcador de HOY: su linea discontinua ambar de altura completa
  // (y1="-14") no aparece en ningun otro elemento del rail.
  var marcadorHoy = /y1="-14"/.test(html) && /stroke:var\\(--amber\\)/.test(html);
  // Lo que sale de la aplicacion: el resumen ejecutivo copiable se genera con
  // la MISMA cadena de datos que alimenta la exportacion a PowerPoint.
  var resumen = '(no disponible)';
  try { if (typeof buildExecutiveSummaryText === 'function') resumen = buildExecutiveSummaryText(); } catch(e) { resumen = 'ERROR: ' + e.message; }
  var exPct = '(no disponible)';
  try { if (typeof executiveStatus === 'function') exPct = executiveStatus(new Date()).progressPct; } catch(e) { exPct = 'ERROR: ' + e.message; }
  return {
    progresoValue: g('progreso-value'), progresoSub: g('progreso-sub'),
    faseValue: g('fase-value'), faseSub: g('fase-sub'),
    railHint: g('rail-range-hint'),
    tecnicos: g('tecnicos-value'), riesgos: g('riesgos-value'),
    nan: nan, railVacio: !svg || html.length === 0,
    marcadorHoy: marcadorHoy,
    carrilBase: /<line x1="30"[^>]*x2="970"/.test(html),
    finEstimado: html.indexOf('FIN ESTIMADO') >= 0,
    resumenTieneNaN: /NaN|Infinity/.test(String(resumen)),
    resumenProgreso: (String(resumen).match(/Progreso del servicio: [^\\n]*/) || ['(no encontrado)'])[0],
    exPct: exPct,
    serviceStart: (typeof state !== 'undefined') ? state.serviceStart : '(sin state)',
    serviceEnd: (typeof state !== 'undefined') ? state.serviceEnd : '(sin state)'
  };
})()`;

(async () => {
  await app.whenReady();
  await esperar(1200);
  const lanzador = await esperarVentana('launcher/index.html');
  if (!lanzador) { tlog('ERROR: no aparecio el lanzador'); app.exit(3); return; }
  await esperar(1800);
  const jsL = (s) => lanzador.webContents.executeJavaScript(s);

  tlog('--- P12-E: PROYECTO RECIEN CREADO, DASHBOARD REAL ---');
  const row = await jsL(`window.launcherAPI.createProject("Servicio P12","Cliente P12","",null)`);
  await esperar(600);
  await jsL(`window.launcherAPI.openProject(${row.id})`);
  const v = await esperarVentana(`projects/${row.id}/dashboard.html`, 30000);
  if (!v) { tlog('ERROR: no se abrio el dashboard'); app.exit(3); return; }
  await esperar(3000);
  const jsD = (s) => v.webContents.executeJavaScript(s);

  // ---- P12-1 en vivo -----------------------------------------------------
  const s1 = await jsD(SONDA);
  info('SONDA (proyecto nuevo): ' + JSON.stringify(s1));

  ok('P12-E1 el proyecto nace SIN fechas de servicio',
    (s1.serviceStart === null || s1.serviceStart === '' ) && (s1.serviceEnd === null || s1.serviceEnd === ''),
    JSON.stringify({ start: s1.serviceStart, end: s1.serviceEnd }));
  ok('P12-E2 CERO coordenadas invalidas en el rail REAL', s1.nan.total === 0, JSON.stringify(s1.nan));
  ok('P12-E3 el marcador HOY NO se dibuja: no hay escala que lo situe',
    s1.marcadorHoy === false, 'marcador presente');
  ok('P12-E4 ni "FIN ESTIMADO"', s1.finEstimado === false);
  ok('P12-E4b pero el carril base SI: un grafico vacio, no un hueco',
    s1.carrilBase === true, JSON.stringify(s1.railVacio));

  // ---- ALCANCE: lo que el usuario LEE, no solo lo que no se pinta --------
  ok('P12-E5 el KPI "Progreso" ya NO muestra NaN',
    !/NaN/.test(s1.progresoValue), JSON.stringify(s1.progresoValue));
  ok('P12-E5b y muestra 0%, sin inferir progreso de la nada',
    /^0%/.test(s1.progresoValue.trim()), JSON.stringify(s1.progresoValue));
  ok('P12-E6 el recuento de dias es "dia 0 de ~0", no "dia 258 de ~0"',
    /día 0 de ~0/.test(s1.progresoValue) || /dia 0 de ~0/.test(s1.progresoValue),
    JSON.stringify(s1.progresoValue));
  ok('P12-E7 el % de fase sigue sin NaN', !/NaN/.test(s1.faseSub), JSON.stringify(s1.faseSub));
  info('cabecera del rail: ' + JSON.stringify(s1.railHint));
  ok('P12-E8 la cabecera del rail NO dice "INVALID DATE": queda vacia',
    !/INVALID DATE/i.test(s1.railHint) && s1.railHint.trim() === '',
    JSON.stringify(s1.railHint));
  ok('P12-E8b y no se ha inventado ningun texto nuevo para ese hueco',
    !/pendiente|sin fecha|configura/i.test(s1.railHint), JSON.stringify(s1.railHint));
  ok('P12-E9 los KPIs que NO dependen de fechas siguen bien',
    !/NaN/.test(s1.tecnicos) && !/NaN/.test(s1.riesgos),
    JSON.stringify({ tecnicos: s1.tecnicos, riesgos: s1.riesgos }));

  // ---- LO QUE SALE DE LA APLICACION -------------------------------------
  info('executiveStatus().progressPct = ' + JSON.stringify(s1.exPct));
  info('resumen ejecutivo, linea de progreso: ' + JSON.stringify(s1.resumenProgreso));
  ok('P12-E9b executiveStatus() devuelve 0, no NaN: es el dato que va al .pptx',
    s1.exPct === 0, JSON.stringify(s1.exPct));
  ok('P12-E9c el resumen ejecutivo COPIABLE no contiene NaN ni Infinity',
    s1.resumenTieneNaN === false, JSON.stringify(s1.resumenProgreso));
  ok('P12-E9d y su linea de progreso dice 0%',
    /0%/.test(s1.resumenProgreso), JSON.stringify(s1.resumenProgreso));

  // ---- ¿hay MAS efectos? -------------------------------------------------
  const tras = await jsD(`(function(){
    return { listo: document.readyState,
      botones: document.querySelectorAll('button').length,
      // Los renders que van DESPUES de renderRail() en render(): fases, hitos y
      // riesgos. Si el NaN hubiera cortado el flujo, estos contenedores estarian
      // vacios. (Se miran por id, no por clase: este dashboard no usa <section>.)
      hayRail: !!document.getElementById('rail-svg'),
      hayProgreso: !!document.getElementById('progreso-value'),
      conIdRellenos: [].filter.call(document.querySelectorAll('[id]'), function(e){ return e.innerHTML.length > 0; }).length,
      puedeGuardar: (typeof saveState === 'function'),
      render2: (typeof render === 'function') };
  })()`);
  info('estado del dashboard: ' + JSON.stringify(tras));
  ok('P12-E10 el dashboard termina de cargar pese a los NaN', tras.listo === 'complete', String(tras.listo));
  ok('P12-E11 y sigue teniendo su UI: los renders posteriores SI se ejecutaron',
    tras.botones > 5 && tras.hayRail && tras.hayProgreso && tras.conIdRellenos > 10, JSON.stringify(tras));
  ok('P12-E12 saveState/render siguen definidos: no se perdio ningun cableado',
    tras.puedeGuardar === true && tras.render2 === true, JSON.stringify(tras));

  // ---- P12-2 en vivo: poner fechas validas y volver a pintar -------------
  const s2 = await jsD(`(function(){
    state.serviceStart = '2026-01-01';
    state.serviceEnd   = '2026-12-31';
    render();
    return 'ok';
  })()`).then(() => jsD(SONDA));
  info('SONDA (con fechas validas): ' + JSON.stringify({ nan: s2.nan, progreso: s2.progresoValue, hoy: s2.marcadorHoy, hint: s2.railHint }));
  ok('P12-E13 CONTROL con fechas validas: cero coordenadas invalidas',
    s2.nan.total === 0, JSON.stringify(s2.nan));
  ok('P12-E13b y el marcador HOY SI se dibuja: el caso normal no se ha tocado',
    s2.marcadorHoy === true);
  ok('P12-E13c y "FIN ESTIMADO" tambien', s2.finEstimado === true);
  ok('P12-E13d y la cabecera vuelve a mostrar el rango de fechas',
    /\d{4}/.test(s2.railHint) && !/INVALID/i.test(s2.railHint), JSON.stringify(s2.railHint));
  ok('P12-E14 el KPI de progreso muestra un numero real y dias reales',
    !/NaN/.test(s2.progresoValue) && /\d+%/.test(s2.progresoValue) && !/de ~0/.test(s2.progresoValue),
    JSON.stringify(s2.progresoValue));
  ok('P12-E14b y el resumen exportable sigue limpio',
    s2.resumenTieneNaN === false && typeof s2.exPct === 'number' && s2.exPct > 0,
    JSON.stringify({ exPct: s2.exPct, linea: s2.resumenProgreso }));

  // ---- P12-3 en vivo: inicio == fin -------------------------------------
  const s3 = await jsD(`(function(){
    state.serviceStart = '2026-09-15';
    state.serviceEnd   = '2026-09-15';
    render();
    return 'ok';
  })()`).then(() => jsD(SONDA));
  info('SONDA (inicio == fin): ' + JSON.stringify({ nan: s3.nan, progreso: s3.progresoValue, hoy: s3.marcadorHoy }));
  // Este era el caso tramposo: `pctOf` hacia (dateObj-start)/(end-start), y con
  // end===start el denominador es 0 pero el resultado NO siempre era NaN —
  // `n/0` da Infinity, y clamp lo convertia en un 100% perfectamente creible.
  // Como `today` es `new Date()` y lleva la hora del reloj, EN VIVO se veia ese
  // 100% falso y no un NaN. Ahora la guarda va antes de dividir, asi que el
  // resultado ya no depende de la hora a la que se mire.
  ok('P12-E15 inicio == fin: cero coordenadas invalidas', s3.nan.total === 0, JSON.stringify(s3.nan));
  ok('P12-E16 y NUNCA mas el 100% falso: ahora es 0%',
    /^0%/.test(s3.progresoValue.trim()) && !/100%/.test(s3.progresoValue),
    JSON.stringify(s3.progresoValue));
  ok('P12-E16b sin marcador HOY, porque no hay escala sobre la que situarlo',
    s3.marcadorHoy === false);
  ok('P12-E16c y el recuento de dias es 0 de ~0, no "1 de ~0"',
    !/de ~0/.test(s3.progresoValue) || /0 de ~0/.test(s3.progresoValue),
    JSON.stringify(s3.progresoValue));
  ok('P12-E16d el dato exportable tambien es 0', s3.exPct === 0 && s3.resumenTieneNaN === false,
    JSON.stringify({ exPct: s3.exPct }));

  // NO se guarda nada de esto: el estado tocado se deja como estaba para que
  // la prueba no dependa de haber persistido un proyecto raro.
  await jsD(`(function(){ state.serviceStart=null; state.serviceEnd=null; render(); return 'ok'; })()`);

  // Este es el criterio que destapo P12 en el arranque de E1: Chromium emite un
  // error por CADA atributo invalido. Cero errores = cero coordenadas malas en
  // TODOS los estados por los que ha pasado el dashboard en esta prueba.
  const errNaN = consola.filter((c) => /Expected length/.test(c.mensaje));
  info('errores "Expected length" en toda la sesion: ' + errNaN.length);
  for (const e of errNaN.slice(0, 12)) info('   ' + e.mensaje);
  ok('P12-E17 CERO errores de atributo SVG en toda la sesion del dashboard',
    errNaN.length === 0, String(errNaN.length) + ' errores: ' + JSON.stringify(errNaN.slice(0, 4)));
  const otros = consola.filter((c) => !/Expected length|Autofill|GPU|gpu_|Electron Security Warning|devtools/i.test(c.mensaje));
  info('otros errores de consola del dashboard: ' + otros.length);
  if (otros.length) for (const e of otros.slice(0, 6)) info('   ' + e.fuente + '  ' + e.mensaje);
  ok('P12-E17b y tampoco han aparecido errores nuevos de otro tipo',
    otros.length === 0, JSON.stringify(otros.slice(0, 3)));
  ok('P12-E18 ninguna excepcion en el proceso principal',
    excepciones.length === 0, JSON.stringify(excepciones.slice(0, 2)));

  v.destroy();
  await esperar(600);
  tlog('FIN p12');
  app.exit(0);
})().catch((e) => { tlog('EXCEPCION EN EL ARNES: ' + String((e && e.stack) || e)); app.exit(4); });
