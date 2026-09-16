// ---------------------------------------------------------------------------
// B4 — `projects:reorder` en la APLICACIÓN REAL.
//
// Comprueba en vivo, sobre el main.js real dentro de Electron, que reordenar
// proyectos es UNA sola operación: una sola publicación del .sqlite3 para N
// filas, y que un fallo de publicación no deja el orden a medias.
//
// Todo ocurre en un sandbox artificial con proyectos de prueba creados aquí
// mismo. NO se toca la BD viva ni el orden productivo real.
//
// OJO con el nombre: `real-run/b4.js` es del BLOQUE 4 de A3.3, otra cosa.
// ---------------------------------------------------------------------------
const { app, BrowserWindow } = require('electron');
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
// Instrumentación de `fs`, ANTES de cargar main.js: se cuenta cada publicación
// del .sqlite3 y se puede hacer fallar una concreta. Acotado al sandbox.
// ---------------------------------------------------------------------------
const CTL = { contar: false, publicaciones: 0, fallarEn: 0 };
const renameOrig = fs.renameSync;
fs.renameSync = function (o, d, ...a) {
  const s = String(d).toLowerCase();
  if (s.startsWith(SB.toLowerCase()) && s.endsWith('panorama.sqlite3')) {
    if (CTL.contar) CTL.publicaciones++;
    if (CTL.fallarEn && CTL.publicaciones === CTL.fallarEn) {
      const e = new Error('EPERM: publicación INYECTADA por el arnés B4');
      e.code = 'EPERM';
      throw e;
    }
  }
  return renameOrig.call(fs, o, d, ...a);
};

tlog('ARRANQUE del arnés B4-reorder  sandbox=' + SB + '  main=' + (MAIN_ARG || '(real)'));
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

// El orden TAL COMO ESTÁ EN EL ARCHIVO, leído por fuera de la app.
let SQL = null;
function ordenEnDisco() {
  const initSqlJs = require(path.join(PROJDIR, 'node_modules', 'sql.js'));
  return (async () => {
    if (!SQL) SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(PROJDIR, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')) });
    const d = new SQL.Database(fs.readFileSync(path.join(UD, 'panorama.sqlite3')));
    const r = d.exec("SELECT id, sort_order FROM projects WHERE kind='project' ORDER BY id");
    const v = r.length ? r[0].values.map((x) => [x[0], x[1]]) : [];
    d.close();
    return v;
  })();
}

(async () => {
  await app.whenReady();
  await esperar(1200);
  const lanzador = await esperarVentana('launcher/index.html');
  if (!lanzador) { tlog('ERROR: no apareció el lanzador'); app.exit(3); return; }
  await esperar(1800);
  const jsL = (s) => lanzador.webContents.executeJavaScript(s);

  tlog('--- B4-RE: projects:reorder en la app real ---');

  // Tres proyectos de PRUEBA, creados aquí. No se toca ninguno real.
  const ids = [];
  for (let i = 1; i <= 3; i++) {
    const row = await jsL(`window.launcherAPI.createProject("B4 prueba ${i}","Cliente B4","",null)`);
    ids.push(row.id);
    await esperar(400);
  }
  info('proyectos de prueba creados: ' + JSON.stringify(ids));
  ok('B4-RE0 se han creado 3 proyectos de prueba en el sandbox', ids.length === 3 && ids.every((x) => x > 0),
    JSON.stringify(ids));

  // ---- RE1: reordenado normal, contando publicaciones -------------------
  const alReves = ids.slice().reverse();
  CTL.contar = true; CTL.publicaciones = 0; CTL.fallarEn = 0;
  const res1 = await jsL(`window.launcherAPI.reorderProjects(${JSON.stringify(alReves)})`);
  await esperar(800);
  CTL.contar = false;
  const orden1 = await ordenEnDisco();
  info('resultado: ' + JSON.stringify(res1) + '   publicaciones: ' + CTL.publicaciones);
  info('orden en el archivo: ' + JSON.stringify(orden1));

  ok('B4-RE1a el reordenado se aplica', res1 && res1.ok === true, JSON.stringify(res1));
  ok('B4-RE1b UNA sola publicación del .sqlite3 para los 3 proyectos, no tres',
    CTL.publicaciones === 1, 'publicaciones: ' + CTL.publicaciones);
  ok('B4-RE1c y el orden queda ENTERO en el archivo',
    orden1.length === 3 && orden1.every(([, so]) => so !== null) &&
    JSON.stringify(orden1.map(([id]) => id)) === JSON.stringify(ids.slice().sort((a, b) => a - b)),
    JSON.stringify(orden1));
  {
    // El orden que ve el lanzador tiene que ser el pedido.
    const lista = await jsL('window.launcherAPI.listProjects()');
    const idsListados = lista.filter((p) => ids.includes(p.id)).map((p) => p.id);
    info('orden que devuelve projects:list: ' + JSON.stringify(idsListados));
    ok('B4-RE1d y `projects:list` devuelve exactamente ese orden',
      JSON.stringify(idsListados) === JSON.stringify(alReves), JSON.stringify(idsListados));
  }

  // ---- RE2: fallo de publicación EN VIVO --------------------------------
  const ordenAntes = await ordenEnDisco();
  const logAntes = leerAppLog();
  CTL.contar = true; CTL.publicaciones = 0; CTL.fallarEn = 1;   // falla la única que hay
  let fallo = null;
  try {
    await jsL(`window.launcherAPI.reorderProjects(${JSON.stringify(ids)})`);
  } catch (e) { fallo = String((e && e.message) || e); }
  CTL.contar = false; CTL.fallarEn = 0;
  await esperar(600);
  const ordenDespues = await ordenEnDisco();
  const logDespues = leerAppLog();
  const nuevas = logDespues.slice(logAntes.length).split('\n').filter(Boolean);
  info('rechazo recibido por el renderer: ' + (fallo ? fallo.slice(0, 120) : '(NINGUNO)'));
  info('orden antes:   ' + JSON.stringify(ordenAntes));
  info('orden después: ' + JSON.stringify(ordenDespues));
  for (const l of nuevas.slice(0, 3)) info('app.log: ' + l.slice(0, 150));

  ok('B4-RE2a el renderer recibe un RECHAZO: no puede creer que fue bien', !!fallo, '(no rechazó)');
  ok('B4-RE2b el orden del archivo es EXACTAMENTE el de antes',
    JSON.stringify(ordenDespues) === JSON.stringify(ordenAntes),
    JSON.stringify({ antes: ordenAntes, despues: ordenDespues }));
  ok('B4-RE2c ninguna fila se queda sin orden mientras las otras sí',
    ordenDespues.every(([, so]) => so !== null), 'orden PARCIAL: ' + JSON.stringify(ordenDespues));
  ok('B4-RE2d queda rastro en app.log', nuevas.some((l) => l.includes('Reordenado de proyectos')),
    JSON.stringify(nuevas.slice(0, 2)));
  ok('B4-RE2e la línea dice cuántos proyectos y la clase del error, sin la lista',
    nuevas.some((l) => /Reordenado de proyectos/.test(l) && /3 proyectos/.test(l) && /clase /.test(l) &&
      !l.includes(JSON.stringify(ids))),
    JSON.stringify(nuevas.filter((l) => l.includes('Reordenado')).slice(0, 1)));
  ok('B4-RE2f y NO lleva rutas completas',
    nuevas.filter((l) => l.includes('Reordenado')).every((l) => l.indexOf(UD) < 0 && l.indexOf('C:\\') < 0),
    JSON.stringify(nuevas.filter((l) => l.includes('Reordenado')).slice(0, 1)));

  // ---- RE3: la operación siguiente --------------------------------------
  CTL.contar = true; CTL.publicaciones = 0;
  const res3 = await jsL(`window.launcherAPI.reorderProjects(${JSON.stringify(ids)})`);
  await esperar(800);
  CTL.contar = false;
  const orden3 = await ordenEnDisco();
  ok('B4-RE3a tras el fallo, un reordenado válido SÍ se aplica', res3 && res3.ok === true, JSON.stringify(res3));
  ok('B4-RE3b entero, y otra vez con una sola publicación',
    CTL.publicaciones === 1 && orden3.every(([, so]) => so !== null),
    JSON.stringify({ publicaciones: CTL.publicaciones, orden: orden3 }));
  {
    const lista = await jsL('window.launcherAPI.listProjects()');
    const idsListados = lista.filter((p) => ids.includes(p.id)).map((p) => p.id);
    ok('B4-RE3c y el lanzador ve el orden nuevo', JSON.stringify(idsListados) === JSON.stringify(ids),
      JSON.stringify(idsListados));
  }

  // ---- RE4: validación de entrada, en vivo -------------------------------
  const ordenPrevio = await ordenEnDisco();
  const rMal = await jsL('window.launcherAPI.reorderProjects(["no-es-un-id", 2])');
  const rDup = await jsL(`window.launcherAPI.reorderProjects([${ids[0]}, ${ids[0]}])`);
  await esperar(400);
  const ordenTrasMal = await ordenEnDisco();
  info('validación: ' + JSON.stringify({ rMal, rDup }));
  ok('B4-RE4a un id inválido se rechaza', rMal && rMal.ok === false, JSON.stringify(rMal));
  ok('B4-RE4b un id repetido se rechaza', rDup && rDup.ok === false, JSON.stringify(rDup));
  ok('B4-RE4c y no han movido nada en el archivo',
    JSON.stringify(ordenTrasMal) === JSON.stringify(ordenPrevio),
    JSON.stringify({ antes: ordenPrevio, despues: ordenTrasMal }));

  tlog('FIN b4-reorder');
  await esperar(400);
  app.exit(0);
})().catch((e) => { tlog('EXCEPCIÓN EN EL ARNÉS: ' + String((e && e.stack) || e)); app.exit(4); });
