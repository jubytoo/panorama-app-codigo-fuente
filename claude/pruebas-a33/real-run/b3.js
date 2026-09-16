// ---------------------------------------------------------------------------
// B3 — DEMOSTRACION EMPIRICA de la premisa: en la app real, un `console.warn`
// del proceso principal NO deja rastro en ningun sitio que el usuario o
// soporte puedan consultar, y un `appLog()` SI.
//
// La diferencia entre "console.warn existe tecnicamente" y "hay una forma
// realista de verlo" no se razona: se mide. Se provoca un console.warn REAL
// por su camino real —una accion de menu desconocida, que es inocua— y se
// comprueba que app.log no lo recoge.
//
// NO ARREGLA NADA. Arnes propio: no toca los de A2, E1, P12, E2 ni B1.
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
const UD = path.join(SB, 'Roaming', 'panorama-app');
const PROJDIR = 'C:/Codigo Fuente PS/panorama-app-codigo-fuente_1';

function tlog(s) { try { fs.appendFileSync(path.join(SB, 'test.log'), `[${new Date().toISOString()}] ${s}\n`); } catch (e) {} }
function ok(n, c, extra) { tlog((c ? 'OK    ' : 'FALLO ') + n + (c ? '' : '  -- ' + (extra === undefined ? '' : extra))); }
function info(s) { tlog('      ' + s); }

// Se intercepta console.warn del MAIN solo para PROBAR que se emitio. El
// producto no hace esto: sin este espia, ese texto no existe en ningun lado.
const warnsDelMain = [];
const warnOriginal = console.warn;
console.warn = function (...a) { warnsDelMain.push(a.map(String).join(' ').slice(0, 200)); return warnOriginal.apply(console, a); };

tlog('ARRANQUE del arnes B3  sandbox=' + SB + '  main=' + (MAIN_ARG || '(real)'));
process.on('exit', (c) => tlog('process exit code=' + c));
process.on('uncaughtException', (e) => tlog('UNCAUGHT: ' + String((e && e.stack) || e)));

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
const leerAppLog = () => { try { return fs.readFileSync(path.join(UD, 'app.log'), 'utf8'); } catch (e) { return ''; } };

// El Directorio de Talento NO carga su plantilla directamente: se hornea en
// projects/<id>/dashboard.html, igual que un proyecto normal (ver
// ensureDirectorioTalentoProject en main.js). Asi que no se puede localizar
// por la URL — se localiza por lo que la pagina DEFINE.
async function esperarVentanaConFuncion(nombre, tope = 30000) {
  const t0 = Date.now();
  for (;;) {
    for (const w of BrowserWindow.getAllWindows()) {
      if (w.isDestroyed()) continue;
      try {
        const tiene = await w.webContents.executeJavaScript(`typeof ${nombre} === 'function'`);
        if (tiene) return w;
      } catch (e) { /* ventana aun sin cargar */ }
    }
    if (Date.now() - t0 > tope) return null;
    await esperar(400);
  }
}

(async () => {
  await app.whenReady();
  await esperar(1200);
  const lanzador = await esperarVentana('launcher/index.html');
  if (!lanzador) { tlog('ERROR: no aparecio el lanzador'); app.exit(3); return; }
  await esperar(1800);
  const jsL = (s) => lanzador.webContents.executeJavaScript(s);

  tlog('--- B3-R: el console.warn del main, en la app real ---');

  // El app.log ya existe: la app registra su arranque.
  const logInicial = leerAppLog();
  ok('B3-R1 app.log existe y la app ya ha escrito en el', logInicial.length > 0,
    'bytes: ' + logInicial.length);
  info('primeras lineas de app.log: ' + JSON.stringify(logInicial.split('\n').slice(0, 2)));

  // Se provoca un console.warn REAL por su camino real: una accion de menu
  // desconocida. Es inocua — el handler solo avisa y no hace nada.
  warnsDelMain.length = 0;
  const antes = leerAppLog();
  const MARCA = 'accion-inventada-b3-' + Date.now();
  await jsL(`window.launcherAPI.launcherMenuAction(${JSON.stringify(MARCA)})`);
  await esperar(1200);
  const despues = leerAppLog();

  info('console.warn capturados en el main: ' + warnsDelMain.length);
  for (const w of warnsDelMain.slice(0, 3)) info('   ' + w);

  ok('B3-R2 el console.warn SI se emite de verdad (hay codigo detras)',
    warnsDelMain.some((w) => w.indexOf(MARCA) >= 0),
    JSON.stringify(warnsDelMain.slice(0, 2)));
  ok('B3-R3 pero NO aparece en app.log: el rastro persistente no lo recoge',
    despues.indexOf(MARCA) < 0, 'la marca aparecio en app.log');
  ok('B3-R4 app.log ni siquiera ha crecido por ese aviso',
    despues.length === antes.length,
    JSON.stringify({ antes: antes.length, despues: despues.length }));

  // EL CONTRASTE, sin tener que provocar nada: el propio arranque ya escribio
  // varias lineas con appLog(). O sea, en la MISMA sesion y el MISMO archivo
  // conviven los dos canales — y solo uno deja rastro.
  {
    const log = leerAppLog();
    const lineas = log.split('\n').filter(Boolean);
    info('lineas de appLog() escritas por el arranque: ' + lineas.length);
    for (const l of lineas.slice(0, 3)) info('   ' + l.slice(0, 110));
    ok('B3-R5 CONTRASTE: appLog() SI deja rastro — el arranque escribio ' + lineas.length + ' lineas',
      lineas.length >= 3, 'lineas: ' + lineas.length);
    ok('B3-R5b y NINGUNA de ellas viene de un console.warn',
      warnsDelMain.every((w) => log.indexOf(w.slice(0, 40)) < 0),
      'algun console.warn acabo en app.log');
  }

  // Ninguna ventana tiene DevTools abiertas: nadie veria esa consola.
  const conDevTools = BrowserWindow.getAllWindows().filter((w) => {
    try { return w.webContents.isDevToolsOpened(); } catch (e) { return false; }
  });
  ok('B3-R6 ninguna ventana abre DevTools: la consola del renderer tampoco es visible',
    conDevTools.length === 0, 'ventanas con DevTools: ' + conDevTools.length);

  // Y el rastro que B1 ya dejo: sigue ahi, como referencia de lo que B3 deberia
  // parecerse.
  {
    const log = leerAppLog();
    info('lineas totales en app.log: ' + log.split('\n').filter(Boolean).length);
    ok('B3-R7 app.log es el canal alcanzable: tiene contenido util de esta sesion',
      log.split('\n').filter(Boolean).length >= 1);
  }

  // =======================================================================
  // A PARTIR DE AQUI: ya no se describe el problema, se COMPRUEBA EL ARREGLO
  // en la aplicacion real. Todo ocurre dentro del sandbox; no se toca ni la
  // BD viva ni ninguna carpeta del usuario.
  // =======================================================================
  tlog('--- B3-RC1: CIFRADO DE BACKUP, FAIL-CLOSED, EN EL DASHBOARD REAL ---');
  const row = await jsL(`window.launcherAPI.createProject("Servicio B3","Cliente B3","",null)`);
  await esperar(600);
  await jsL(`window.launcherAPI.openProject(${row.id})`);
  const vD = await esperarVentana(`projects/${row.id}/dashboard.html`, 30000);
  if (!vD) { tlog('ERROR: no se abrio el dashboard'); app.exit(3); return; }
  await esperar(3000);
  const jsD = (s) => vD.webContents.executeJavaScript(s);

  // Carpeta de backups FALSA, en memoria: registra si se llega a crear el
  // archivo y que se escribe dentro. Asi se puede afirmar "no se escribio
  // nada" sin depender de mirar el disco.
  const PREPARAR_CARPETA = `(() => {
    const reg = { getFileHandle: 0, nombre: null, escrito: null, alerts: [] };
    window.__b3 = reg;
    backupDirHandle = {
      queryPermission: async () => 'granted',
      getFileHandle: async (name) => { reg.getFileHandle++; reg.nombre = name;
        return { createWritable: async () => ({ write: async (p) => { reg.escrito = String(p); }, close: async () => {} }) }; },
      removeEntry: async () => {},
      entries: function () { return (async function* () {})(); },
    };
    state.backupEncryptionEnabled = true;
    backupEncryptionPassword = 'CONTRASENA-SECRETA-B3';
    window.psAlert = async (msg, opts) => { reg.alerts.push({ msg: String(msg), title: (opts && opts.title) || '' }); };
    return true;
  })()`;
  await jsD(PREPARAR_CARPETA);

  const r1 = await jsD(`(async () => {
    window.encryptBackupPayload = async () => { throw new Error('fallo de cifrado simulado'); };
    const antes = ui.backupFolderInfo ? JSON.parse(JSON.stringify(ui.backupFolderInfo)) : null;
    const estadoAntes = JSON.stringify(state).length;
    await writeBackupToFolder(true);
    return { antes, despues: ui.backupFolderInfo ? JSON.parse(JSON.stringify(ui.backupFolderInfo)) : null,
             estadoAntes, estadoDespues: JSON.stringify(state).length,
             creado: window.__b3.getFileHandle, escrito: window.__b3.escrito,
             alerts: window.__b3.alerts.slice() };
  })()`);
  info('RC1: ' + JSON.stringify(r1).slice(0, 600));

  ok('B3-RC1a el archivo NO llega a crearse: getFileHandle no se llama ni una vez',
    r1.creado === 0, 'se creo ' + r1.creado + ' vez/veces');
  ok('B3-RC1b y por tanto NO se escribe nada, ni cifrado ni en claro',
    r1.escrito === null, 'se escribio: ' + String(r1.escrito).slice(0, 80));
  ok('B3-RC1c el usuario VE un aviso', r1.alerts.length === 1, 'avisos: ' + r1.alerts.length);
  ok('B3-RC1d con el texto acordado, palabra por palabra',
    r1.alerts.length === 1 &&
    r1.alerts[0].msg.indexOf('No se pudo crear la copia de seguridad cifrada. No se ha guardado una copia sin cifrar.') === 0,
    JSON.stringify(r1.alerts[0] && r1.alerts[0].msg));
  ok('B3-RC1e la operacion NO se marca como exito: el panel no cambia de fecha',
    JSON.stringify(r1.antes) === JSON.stringify(r1.despues),
    JSON.stringify({ antes: r1.antes, despues: r1.despues }));
  ok('B3-RC1f los datos de origen quedan intactos',
    r1.estadoAntes === r1.estadoDespues,
    JSON.stringify({ antes: r1.estadoAntes, despues: r1.estadoDespues }));
  ok('B3-RC1g el aviso NO contiene la contrasena',
    r1.alerts.every((a) => a.msg.indexOf('CONTRASENA-SECRETA-B3') < 0 && a.title.indexOf('CONTRASENA') < 0),
    'la contrasena aparece en el aviso');
  ok('B3-RC1h ni el payload del proyecto',
    r1.alerts.every((a) => a.msg.indexOf('projectTitle') < 0 && a.msg.indexOf('Cliente B3') < 0),
    'el payload aparece en el aviso');

  // CONTRASTE: con el cifrado funcionando, la copia SI se escribe. Si no, la
  // prueba de arriba podria estar pasando porque la funcion no hace nada.
  const r2 = await jsD(`(async () => {
    window.__b3.alerts.length = 0;
    window.encryptBackupPayload = async (json, pwd, iso) => JSON.stringify({ encrypted:true, exportedAt: iso, marca:'CIFRADO-OK' });
    await writeBackupToFolder(true);
    return { creado: window.__b3.getFileHandle, escrito: window.__b3.escrito,
             despues: ui.backupFolderInfo ? JSON.parse(JSON.stringify(ui.backupFolderInfo)) : null,
             alerts: window.__b3.alerts.slice() };
  })()`);
  info('RC1 contraste: ' + JSON.stringify(r2).slice(0, 400));
  ok('B3-RC1i CONTRASTE: si el cifrado funciona, la copia SI se escribe',
    r2.creado === 1 && typeof r2.escrito === 'string', JSON.stringify({ creado: r2.creado }));
  ok('B3-RC1j y lo escrito es el CIFRADO, no el JSON en claro',
    typeof r2.escrito === 'string' && r2.escrito.indexOf('CIFRADO-OK') >= 0 &&
    r2.escrito.indexOf('"projectTitle"') < 0,
    String(r2.escrito).slice(0, 120));
  ok('B3-RC1k y entonces SI se marca como hecho, sin ningun aviso',
    r2.alerts.length === 0 && r2.despues !== null, JSON.stringify(r2.despues));

  tlog('--- B3-RC2: EL DIRECTORIO DE TALENTO AVISA CUANDO NO PUEDE GUARDAR ---');
  await jsL(`window.launcherAPI.openDirectorio()`);
  const vT = await esperarVentanaConFuncion('marcarGuardadoFallido', 30000);
  if (!vT) { tlog('ERROR: no se abrio el Directorio de Talento'); app.exit(3); return; }
  info('ventana del Directorio: ' + vT.webContents.getURL().slice(-48));
  await esperar(2000);
  const jsT = (s) => vT.webContents.executeJavaScript(s);

  // CASO 1 — el fallo REAL: storageSet no lanza, devuelve false. Es el que el
  // codigo anterior no detectaba de ninguna manera.
  const t1 = await jsT(`(async () => {
    const reg = { alerts: [] };
    window.__b3 = reg;
    window.psAlert = async (msg, opts) => { reg.alerts.push({ msg: String(msg), title: (opts && opts.title) || '' }); };
    window.storageSet = async () => false;
    avisoGuardadoMostrado = false;
    const antes = (document.getElementById('save-note') || {}).textContent;
    await saveState();
    await new Promise((r) => setTimeout(r, 900));
    return { antes, despues: (document.getElementById('save-note') || {}).textContent, alerts: reg.alerts };
  })()`);
  info('RC2 caso false: ' + JSON.stringify(t1).slice(0, 400));
  ok('B3-RC2a storageSet devuelve false y la pantalla NO dice "Guardado"',
    !/^Guardado/.test(String(t1.despues || '')), JSON.stringify(t1.despues));
  ok('B3-RC2b dice explicitamente que NO se ha guardado',
    /NO GUARDADO/.test(String(t1.despues || '')), JSON.stringify(t1.despues));
  ok('B3-RC2c y el usuario recibe un aviso', t1.alerts.length === 1, 'avisos: ' + t1.alerts.length);
  ok('B3-RC2d que dice que lo escrito sigue en pantalla',
    t1.alerts.length === 1 && t1.alerts[0].msg.indexOf('Lo que has escrito sigue en pantalla') >= 0,
    JSON.stringify(t1.alerts[0] && t1.alerts[0].msg));

  // CASO 2 — el camino del CIERRE de la ventana (flushPendingSave), sincrono.
  const t2 = await jsT(`(() => {
    const reg = { alerts: [] };
    window.__b3 = reg;
    window.psAlert = async (msg, opts) => { reg.alerts.push({ msg: String(msg), title: (opts && opts.title) || '' }); };
    window.storageSet = async () => true;
    const original = localStorage.setItem.bind(localStorage);
    localStorage.setItem = () => { throw new Error('cuota simulada'); };
    avisoGuardadoMostrado = false;
    try {
      saveState();          // arma el debounce de 350ms
      flushPendingSave();    // ...y el cierre lo fuerza YA, de forma sincrona
    } finally { localStorage.setItem = original; }
    return { nota: (document.getElementById('save-note') || {}).textContent, alerts: reg.alerts };
  })()`);
  info('RC2 caso cierre: ' + JSON.stringify(t2).slice(0, 400));
  ok('B3-RC2e el ultimo guardado posible tampoco falla en silencio',
    /NO GUARDADO/.test(String(t2.nota || '')), JSON.stringify(t2.nota));
  ok('B3-RC2f y tambien avisa', t2.alerts.length === 1, 'avisos: ' + t2.alerts.length);

  // CASO 3 — el aviso no hace spam: el segundo fallo ya no abre otro modal.
  const t3 = await jsT(`(async () => {
    window.__b3.alerts.length = 0;
    window.storageSet = async () => false;
    await saveState();
    await new Promise((r) => setTimeout(r, 900));
    await saveState();
    await new Promise((r) => setTimeout(r, 900));
    return { alerts: window.__b3.alerts.length, nota: (document.getElementById('save-note') || {}).textContent };
  })()`);
  ok('B3-RC2g dos fallos mas NO abren dos modales mas (una vez por sesion)',
    t3.alerts === 0, 'avisos extra: ' + t3.alerts);
  ok('B3-RC2h pero la pantalla SIGUE diciendo que no se ha guardado',
    /NO GUARDADO/.test(String(t3.nota || '')), JSON.stringify(t3.nota));

  tlog('--- B3-RC3: EL HISTORIAL DE PREPARACION YA AVISABA (C -> D) ---');
  await jsD(`window.panoramaBridge.projectMenuAction('proyecto-prep-reunion')`);
  const vP = await esperarVentana('plantilla_preparacion_reunion.html', 30000);
  if (!vP) { tlog('ERROR: no se abrio la Preparacion de Reunion'); app.exit(3); return; }
  await esperar(2500);
  const jsP = (s) => vP.webContents.executeJavaScript(s);
  const p1 = await jsP(`(() => {
    // El puente esta congelado por contextBridge, asi que el fallo no se puede
    // inyectar desde fuera: se pone el ESTADO que produce un fallo real y se
    // comprueba QUE PINTA la ventana. Es lo que ve el usuario.
    const previo = state.saveHistoryStatus;
    state.saveHistoryStatus = 'error';
    const html = saveStatusHtml();
    state.saveHistoryStatus = 'requiere-reinicio';
    const html4 = saveStatusHtml();
    state.saveHistoryStatus = previo;
    return { html, html4, puenteEscribible: (() => {
      try { window.panoramaBridge.saveMeetingPrep = null; return window.panoramaBridge.saveMeetingPrep === null; }
      catch (e) { return false; }
    })() };
  })()`);
  info('RC3: ' + JSON.stringify(p1).slice(0, 500));
  ok('B3-RC3a con el estado de fallo, la ventana PINTA un aviso visible',
    /No se pudo guardar autom/.test(p1.html), JSON.stringify(p1.html));
  ok('B3-RC3b con boton para reintentar a mano',
    /id="btn-retry-save"/.test(p1.html), JSON.stringify(p1.html));
  ok('B3-RC3c y el cuarto estado del contrato NO ofrece reintentar (ya se aplico)',
    !/btn-retry-save/.test(p1.html4) && /reinicio|Cierra Panorama/i.test(p1.html4),
    JSON.stringify(p1.html4));
  info('el puente de la ventana ' + (p1.puenteEscribible ? 'ES escribible' : 'esta congelado: el fallo no se puede inyectar desde el renderer'));

  tlog('--- B3-RC4: UNA LINEA NUEVA DE B3 LLEGA DE VERDAD A app.log ---');
  // Se provoca un fallo REAL e inocuo: la copia HTML del proyecto se marca
  // como solo lectura, asi que al reabrirlo no se puede refrescar. El proyecto
  // se abre igual (era y sigue siendo best-effort) pero ahora deja rastro.
  // La ventana del proyecto sigue abierta desde RC1, y 'projects:open' sobre
  // una ventana ya abierta solo la enfoca: no rehornea nada. Hay que cerrarla
  // para que la reapertura pase de verdad por ensureProjectDashboardFileFresh.
  try { vD.close(); } catch (e) {}
  for (let i = 0; i < 25 && ventanasCon(`projects/${row.id}/dashboard.html`).length; i++) await esperar(400);
  if (ventanasCon(`projects/${row.id}/dashboard.html`).length) { try { vD.destroy(); } catch (e) {} await esperar(600); }
  ok('B3-RC4a0 la ventana del proyecto se ha cerrado antes de reabrirlo',
    ventanasCon(`projects/${row.id}/dashboard.html`).length === 0, 'sigue abierta');

  const copiaHtml = path.join(UD, 'projects', String(row.id), 'dashboard.html');
  let preparado = false;
  try {
    fs.chmodSync(copiaHtml, 0o444);
    // Se comprueba que la marca SIRVE: si escribir siguiera funcionando, la
    // prueba de abajo estaria midiendo otra cosa.
    try { fs.appendFileSync(copiaHtml, ''); fs.writeFileSync(copiaHtml, fs.readFileSync(copiaHtml)); }
    catch (e2) { preparado = true; }
  } catch (e) { info('no se pudo marcar solo-lectura: ' + e.message); }
  ok('B3-RC4a preparado: la copia HTML del proyecto ya NO se puede reescribir', preparado,
    'el archivo sigue siendo escribible: la prueba no mediria nada');
  const logAntes = leerAppLog();
  warnsDelMain.length = 0;
  await jsL(`window.launcherAPI.openProject(${row.id})`);
  await esperarVentana(`projects/${row.id}/dashboard.html`, 30000);
  await esperar(2500);
  const logDespues = leerAppLog();
  try { fs.chmodSync(copiaHtml, 0o666); } catch (e) {}
  const nuevas = logDespues.slice(logAntes.length).split('\n').filter(Boolean);
  for (const l of nuevas.slice(0, 5)) info('nueva linea: ' + l.slice(0, 160));
  ok('B3-RC4b app.log ha CRECIDO por este fallo (antes no dejaba rastro)',
    logDespues.length > logAntes.length,
    JSON.stringify({ antes: logAntes.length, despues: logDespues.length }));
  ok('B3-RC4c la linea nueva identifica el proyecto y lo que no se pudo hacer',
    nuevas.some((l) => l.indexOf('Proyecto ' + row.id) >= 0 && l.indexOf('copia HTML') >= 0),
    JSON.stringify(nuevas.slice(0, 3)));
  ok('B3-RC4d y NO lleva rutas completas ni secretos',
    nuevas.every((l) => l.indexOf(UD) < 0 && l.indexOf('C:\\\\') < 0 && l.indexOf('CONTRASENA') < 0),
    JSON.stringify(nuevas.slice(0, 3)));
  ok('B3-RC4e el proyecto SE ABRE igual: la limpieza sigue siendo best-effort',
    ventanasCon(`projects/${row.id}/dashboard.html`).length >= 1,
    'la ventana del proyecto desaparecio');

  tlog('FIN b3');
  await esperar(400);
  app.exit(0);
})().catch((e) => { tlog('EXCEPCION EN EL ARNES: ' + String((e && e.stack) || e)); app.exit(4); });
