// ---------------------------------------------------------------------------
// B5 — REENTRANCIA DE LA VENTANA DE SEGURIDAD, EN LA APLICACIÓN REAL.
//
// El renderer real, en su ventana real, recibiendo eventos `keydown` reales, y
// un espía sobre `ipcMain.handle` que cuenta cuántos `security-win:submit`
// llegan de verdad al proceso principal y qué devuelve cada uno.
//
// La reentrancia depende del bucle de eventos, así que no se razona: se cuenta.
//
// Todo ocurre en un sandbox artificial con un proyecto y un backup creados
// aquí mismo. NO se toca la BD viva ni ningún material productivo.
// ---------------------------------------------------------------------------
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const arg = process.argv.find((a) => a.startsWith('--sandbox='));
if (!arg) { console.error('falta --sandbox='); process.exit(2); }
const SB = arg.slice('--sandbox='.length);
const MAIN_ARG = (process.argv.find((a) => a.startsWith('--main=')) || '').slice(7);

if (!fs.existsSync(SB)) { console.error('sandbox inexistente: ' + SB); process.exit(2); }
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

// ---------------------------------------------------------------------------
// ESPÍA sobre ipcMain.handle, instalado ANTES de cargar main.js. Cuenta cada
// entrada real al handler y guarda lo que devuelve. No cambia nada: envuelve.
// ---------------------------------------------------------------------------
const ESPIA = { entradas: [], activo: false };
const handleOrig = ipcMain.handle.bind(ipcMain);
ipcMain.handle = function (canal, fn) {
  if (canal !== 'security-win:submit') return handleOrig(canal, fn);
  return handleOrig(canal, async function (evt, data) {
    const n = ESPIA.entradas.length + 1;
    const t0 = Date.now();
    if (ESPIA.activo) ESPIA.entradas.push({ n, modo: data && data.mode, estado: 'EN CURSO', t0 });
    let res, err = null;
    try { res = await fn(evt, data); } catch (e) { err = String((e && e.message) || e); }
    if (ESPIA.activo) {
      const reg = ESPIA.entradas.find((x) => x.n === n);
      if (reg) {
        reg.estado = 'TERMINADO';
        reg.ms = Date.now() - t0;
        reg.resultado = err ? { lanzo: err } : (res && res.error ? { error: res.error } : { ok: true });
      }
    }
    if (err) throw new Error(err);
    return res;
  });
};

tlog('ARRANQUE del arnés B5-reentrancia  sandbox=' + SB + '  main=' + (MAIN_ARG || '(real)'));
process.on('exit', (c) => tlog('process exit code=' + c));
process.on('uncaughtException', (e) => tlog('UNCAUGHT: ' + String((e && e.stack) || e)));

tlog('cargando main.js...');
require(MAIN_ARG || (PROJDIR + '/main.js'));
tlog('main.js cargado');

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

// Estado de Seguridad leído por fuera de la app, del propio archivo.
let SQL = null;
async function metaSeguridad() {
  const initSqlJs = require(path.join(PROJDIR, 'node_modules', 'sql.js'));
  if (!SQL) SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(PROJDIR, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')) });
  const d = new SQL.Database(fs.readFileSync(path.join(UD, 'panorama.sqlite3')));
  const r = d.exec("SELECT key,value FROM app_meta WHERE key IN ('security_enabled','security_salt','security_verifier')");
  const m = {};
  if (r.length) r[0].values.forEach(([k, v]) => { m[k] = v; });
  const b = d.exec('SELECT COUNT(*) FROM backups');
  m._backups = b.length ? b[0].values[0][0] : 0;
  d.close();
  return m;
}
const listarBackups = () => {
  const dir = path.join(UD, 'backups');
  const out = [];
  const rec = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) rec(p); else out.push(p);
  } };
  try { rec(dir); } catch (e) {}
  return out;
};
// El sobre real de security.js es {"panoramaEncrypted":1,"iv":…,"tag":…,"data":…}.
// Se comprueba ESO, y además que el marcador del texto plano haya desaparecido:
// una heurística de "empieza por {" da falsos negativos, porque el sobre
// cifrado también es JSON. (Medido: la primera versión de esta comprobación
// marcaba como NO cifrado un archivo que sí lo estaba.)
const MARCA_PLANA = 'panorama-servicio-full__';
const pareceCifrado = (f) => {
  try {
    const t = fs.readFileSync(f, 'utf8');
    return t.indexOf('"panoramaEncrypted":1') >= 0 && t.indexOf(MARCA_PLANA) < 0;
  } catch (e) { return null; }
};

// Dispara N `keydown` de Enter REALES sobre la ventana de Seguridad, sin
// esperar entre medias: es el gesto de impaciencia que describe el hallazgo.
const RELLENAR_Y_TECLEAR = (campos, veces) => `(() => {
  ${campos}
  const ev = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  for (let i = 0; i < ${veces}; i++) ev();
  return { disabled: document.getElementById('btn-submit').disabled };
})()`;

(async () => {
  await app.whenReady();
  await esperar(1200);
  const lanzador = await esperarVentana('launcher/index.html');
  if (!lanzador) { tlog('ERROR: no apareció el lanzador'); app.exit(3); return; }
  await esperar(1800);
  const jsL = (s) => lanzador.webContents.executeJavaScript(s);

  tlog('--- B5-RE: reentrancia de la ventana de Seguridad, en vivo ---');

  // Material de prueba: un proyecto con un backup, para que el rekey tenga algo
  // que cifrar de verdad.
  const row = await jsL(`window.launcherAPI.createProject("B5 prueba","Cliente B5","",null)`);
  await esperar(600);
  await jsL(`window.launcherAPI.openProject(${row.id})`);
  const vD = await esperarVentana(`projects/${row.id}/dashboard.html`, 30000);
  if (!vD) { tlog('ERROR: no se abrió el dashboard'); app.exit(3); return; }
  await esperar(3500);
  // Se fuerza un backup: abrir el dashboard no lo dispara al instante (el
  // automático va por temporizador), y sin material el rekey no cifra nada.
  const rb = await vD.webContents.executeJavaScript(
    `window.panoramaBridge.saveBackup(JSON.stringify({ "panorama-servicio-full__x": JSON.stringify({ projectTitle: "B5 prueba" }) }), 'prueba-b5')`);
  await esperar(1500);
  const antesMeta = await metaSeguridad();
  info('backup forzado: ' + JSON.stringify(rb && { ok: rb.ok, aplicado: rb.aplicado }));
  info('material antes: backups en BD=' + antesMeta._backups + '  archivos=' + listarBackups().length);
  ok('B5-RE0 hay material de prueba sobre el que cifrar', listarBackups().length >= 1,
    'archivos de backup: ' + listarBackups().length);

  // =========================================================================
  // RE1 — SETUP con DOS Enter seguidos
  // =========================================================================
  ESPIA.entradas.length = 0; ESPIA.activo = true;
  // SIN await: launcherMenuAction devuelve la promesa de openSecurityWindow(),
  // que NO se resuelve hasta que la ventana se cierra. Esperarla aqui colgaba
  // el arnes entero (medido: TIMEOUT a los 300 s).
  jsL(`window.launcherAPI.launcherMenuAction('security-setup')`).catch(() => {});
  const vS = await esperarVentana('security-window/index.html', 30000);
  if (!vS) { tlog('ERROR: no se abrió la ventana de Seguridad'); app.exit(3); return; }
  await esperar(1500);
  const campos = `
    document.getElementById('input-password').value = 'clave-b5-uno';
    document.getElementById('input-confirm').value = 'clave-b5-uno';`;
  const r1 = await vS.webContents.executeJavaScript(RELLENAR_Y_TECLEAR(campos, 2));
  info('tras dos Enter, btn-submit.disabled = ' + r1.disabled);
  await esperar(6000);
  ESPIA.activo = false;

  info('ENTRADAS AL HANDLER: ' + JSON.stringify(ESPIA.entradas.map(
    (e) => ({ n: e.n, modo: e.modo, ms: e.ms, res: e.resultado }))));
  const trasSetup = await metaSeguridad();
  info('security_enabled=' + trasSetup.security_enabled + '  salt=' + String(trasSetup.security_salt).slice(0, 12) + '…');

  ok('B5-RE1a [EXIGENCIA] dos Enter producen UNA sola entrada real al handler',
    ESPIA.entradas.length === 1, 'entradas: ' + ESPIA.entradas.length + ' (2 = el defecto ha vuelto)');
  ok('B5-RE1b y el botón queda deshabilitado tras el primero', r1.disabled === true);
  ok('B5-RE1c esa única entrada activa la seguridad',
    trasSetup.security_enabled === '1' && ESPIA.entradas[0] && ESPIA.entradas[0].resultado.ok === true,
    JSON.stringify({ enabled: trasSetup.security_enabled, res: ESPIA.entradas[0] && ESPIA.entradas[0].resultado }));
  ok('B5-RE1d los backups quedan CIFRADOS de verdad en disco',
    listarBackups().length >= 1 && listarBackups().every((f) => pareceCifrado(f) === true),
    JSON.stringify(listarBackups().map((f) => path.basename(f) + ':' + pareceCifrado(f))));
  ok('B5-RE1e la seguridad queda en un estado completo y coherente',
    trasSetup.security_enabled === '1' && !!trasSetup.security_salt && !!trasSetup.security_verifier,
    JSON.stringify(trasSetup));

  // =========================================================================
  // RE2 — CHANGE con TRES Enter seguidos (el caso que el hallazgo describía)
  // =========================================================================
  await esperar(1200);
  const saltAntes = trasSetup.security_salt;
  const logAntes = leerAppLog();
  ESPIA.entradas.length = 0; ESPIA.activo = true;
  jsL(`window.launcherAPI.launcherMenuAction('security-change')`).catch(() => {});
  const vC = await esperarVentana('security-window/index.html', 30000);
  if (!vC) { tlog('ERROR: no se abrió la ventana de cambio'); app.exit(3); return; }
  await esperar(1500);
  const campos2 = `
    document.getElementById('input-current').value = 'clave-b5-uno';
    document.getElementById('input-password').value = 'clave-b5-dos';
    document.getElementById('input-confirm').value = 'clave-b5-dos';`;
  await vC.webContents.executeJavaScript(RELLENAR_Y_TECLEAR(campos2, 3));
  await esperar(8000);
  ESPIA.activo = false;

  info('ENTRADAS AL HANDLER (change): ' + JSON.stringify(ESPIA.entradas.map(
    (e) => ({ n: e.n, modo: e.modo, ms: e.ms, res: e.resultado }))));
  const trasChange = await metaSeguridad();
  const nuevas = leerAppLog().slice(logAntes.length).split('\n').filter(Boolean);
  for (const l of nuevas.slice(0, 6)) info('app.log: ' + l.slice(0, 150));

  ok('B5-RE2a [EXIGENCIA] tres Enter producen UNA sola entrada real al handler',
    ESPIA.entradas.length === 1, 'entradas: ' + ESPIA.entradas.length + ' (3 = el defecto ha vuelto)');
  ok('B5-RE2b esa única entrada cambia la sal', trasChange.security_salt !== saltAntes,
    JSON.stringify({ antes: String(saltAntes).slice(0, 10), despues: String(trasChange.security_salt).slice(0, 10) }));
  ok('B5-RE2c y NO se genera ningún error "La contraseña actual no es correcta"',
    ESPIA.entradas.every((e) => !/La contraseña actual no es correcta/.test((e.resultado && e.resultado.error) || '')),
    JSON.stringify(ESPIA.entradas.map((e) => e.resultado)));
  ok('B5-RE2d la seguridad queda ACTIVA y coherente',
    trasChange.security_enabled === '1' && !!trasChange.security_salt && !!trasChange.security_verifier,
    JSON.stringify(trasChange));
  ok('B5-RE2e y el número de backups en la BD no ha cambiado',
    trasChange._backups === trasSetup._backups,
    JSON.stringify({ antes: trasSetup._backups, despues: trasChange._backups }));
  ok('B5-RE2f el re-cifrado se registra una vez, no tres',
    nuevas.filter((l) => /re-cifrado completo \(change\)/.test(l)).length === 1,
    JSON.stringify(nuevas.filter((l) => /re-cifrado completo/.test(l))));
  ok('B5-RE2g la ventana se cierra tras el envío correcto',
    ventanasCon('security-window/index.html').length === 0,
    'siguen abiertas: ' + ventanasCon('security-window/index.html').length);

  // =========================================================================
  // RE3 — LA DEFENSA INFERIOR, CUSTODIADA: dos IPC DIRECTOS al main.
  //
  // El renderer ya no los genera, pero la defensa de abajo tiene que seguir
  // ahí. Se saltan `doSubmit()` por completo y se llama dos veces seguidas a
  // `securityWinAPI.submit()`, que es exactamente lo que hacía el defecto.
  // =========================================================================
  await esperar(1200);
  const saltPreDirecto = trasChange.security_salt;
  const backupsPre = listarBackups().map((f) => ({ f: path.basename(f), cif: pareceCifrado(f) }));
  const logPreDirecto = leerAppLog();
  ESPIA.entradas.length = 0; ESPIA.activo = true;
  jsL(`window.launcherAPI.launcherMenuAction('security-change')`).catch(() => {});
  const vX = await esperarVentana('security-window/index.html', 30000);
  if (!vX) { tlog('ERROR: no se abrió la ventana para el envío directo'); app.exit(3); return; }
  await esperar(1500);
  await vX.webContents.executeJavaScript(`(() => {
    const d = { mode: 'change', current: 'clave-b5-dos', password: 'clave-b5-directo',
                confirm: 'clave-b5-directo', remember: false };
    // DOS invocaciones directas, sin pasar por doSubmit(): se salta la guarda
    // a propósito, para comprobar que main aguanta igual.
    window.securityWinAPI.submit(d).catch(() => {});
    window.securityWinAPI.submit(d).catch(() => {});
    return true;
  })()`);
  await esperar(9000);
  ESPIA.activo = false;
  const trasDirecto = await metaSeguridad();
  const backupsPost = listarBackups().map((f) => ({ f: path.basename(f), cif: pareceCifrado(f) }));
  const logDirecto = leerAppLog().slice(logPreDirecto.length).split('\n').filter(Boolean);
  info('ENTRADAS (IPC directos): ' + JSON.stringify(ESPIA.entradas.map(
    (e) => ({ n: e.n, ms: e.ms, res: e.resultado }))));
  for (const l of logDirecto.slice(0, 5)) info('app.log: ' + l.slice(0, 150));

  ok('B5-RE3a saltándose el renderer SÍ llegan dos entradas: la guarda es del renderer',
    ESPIA.entradas.length === 2, 'entradas: ' + ESPIA.entradas.length);
  ok('B5-RE3b [DEFENSA INFERIOR] NO se solapan: main las serializa',
    ESPIA.entradas.length === 2 &&
    ESPIA.entradas[0].t0 + (ESPIA.entradas[0].ms || 0) <= ESPIA.entradas[1].t0 + 5,
    JSON.stringify(ESPIA.entradas.map((e) => ({ t0: e.t0, ms: e.ms }))));
  ok('B5-RE3c la SEGUNDA se rechaza: no hay doble rekey',
    ESPIA.entradas.length === 2 && ESPIA.entradas[1].resultado && !ESPIA.entradas[1].resultado.ok,
    JSON.stringify(ESPIA.entradas[1] && ESPIA.entradas[1].resultado));
  ok('B5-RE3d la sal final es la del PRIMER envío, no una indeterminada',
    trasDirecto.security_salt !== saltPreDirecto &&
    ESPIA.entradas[0] && ESPIA.entradas[0].resultado.ok === true,
    JSON.stringify({ antes: String(saltPreDirecto).slice(0, 10), despues: String(trasDirecto.security_salt).slice(0, 10) }));
  ok('B5-RE3e ningún archivo queda con una clave intermedia: todos cifrados y los mismos',
    backupsPost.length === backupsPre.length && backupsPost.every((b) => b.cif === true),
    JSON.stringify(backupsPost));
  ok('B5-RE3f el re-cifrado se registra UNA vez, no dos',
    logDirecto.filter((l) => /re-cifrado completo \(change\)/.test(l)).length === 1,
    JSON.stringify(logDirecto.filter((l) => /re-cifrado/.test(l))));
  ok('B5-RE3g no queda ninguna carpeta de trabajo del rekey sin resolver',
    !fs.existsSync(path.join(UD, '.panorama-rekey')) ||
    fs.readdirSync(path.join(UD, '.panorama-rekey')).length === 0,
    'restos: ' + JSON.stringify((() => { try { return fs.readdirSync(path.join(UD, '.panorama-rekey')); } catch (e) { return '(no existe)'; } })()));
  {
    const err = (ESPIA.entradas[1] && ESPIA.entradas[1].resultado && ESPIA.entradas[1].resultado.error) || '';
    info('rechazo del 2º directo: ' + JSON.stringify(err.slice(0, 160)));
    ok('B5-RE3h y el rechazo viene de una capa inferior identificable',
      /La contraseña actual no es correcta|operación de Seguridad en curso|PS-200/.test(err),
      JSON.stringify(err.slice(0, 120)));
  }

  // =========================================================================
  // RE4 — la contraseña final es DETERMINISTA y la app sigue usable
  // =========================================================================
  jsL(`window.launcherAPI.launcherMenuAction('security-change')`).catch(() => {});
  const vV = await esperarVentana('security-window/index.html', 30000);
  await esperar(1200);
  // Si la contraseña vigente es la del PRIMER envío directo, este cambio —que
  // la usa como actual— tiene que funcionar. Es la comprobación de que no
  // quedó una contraseña indeterminada.
  const campos3 = `
    document.getElementById('input-current').value = 'clave-b5-directo';
    document.getElementById('input-password').value = 'clave-b5-tres';
    document.getElementById('input-confirm').value = 'clave-b5-tres';`;
  ESPIA.entradas.length = 0; ESPIA.activo = true;
  await vV.webContents.executeJavaScript(RELLENAR_Y_TECLEAR(campos3, 1));
  await esperar(7000);
  ESPIA.activo = false;
  const trasVerif = await metaSeguridad();
  info('verificación: ' + JSON.stringify(ESPIA.entradas.map((e) => e.resultado)));
  ok('B5-RE4 la contraseña vigente es EXACTAMENTE la del primer envío, no una indeterminada',
    ESPIA.entradas.length === 1 && ESPIA.entradas[0].resultado &&
    ESPIA.entradas[0].resultado.ok === true,
    JSON.stringify(ESPIA.entradas.map((e) => e.resultado)));
  ok('B5-RE4b y la sal vuelve a cambiar: el rekey sigue funcionando con normalidad',
    trasVerif.security_salt !== trasDirecto.security_salt);
  ok('B5-RE4c los backups siguen cifrados y son los mismos',
    listarBackups().length === backupsPost.length &&
    listarBackups().every((f) => pareceCifrado(f) === true),
    JSON.stringify(listarBackups().map((f) => path.basename(f))));

  tlog('FIN b5-reentrancia');
  await esperar(400);
  app.exit(0);
})().catch((e) => { tlog('EXCEPCIÓN EN EL ARNÉS: ' + String((e && e.stack) || e)); app.exit(4); });
