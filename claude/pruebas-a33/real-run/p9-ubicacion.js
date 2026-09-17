// ---------------------------------------------------------------------------
// P9 — ¿QUÉ BASE DE DATOS ABRE LA APP REAL SEGÚN SU location.json?
//
// Nació como DIAGNÓSTICO (17 sept 2026) y lo sigue haciendo igual: arranca el
// main.js REAL con appData/userData redirigidos a un sandbox que el .ps1
// prepara (carpeta «compartida» con su base de datos, carpeta por defecto con
// o sin base de datos residual, y un location.json en la variante del caso),
// y registra:
//   - qué carpeta de datos y qué base de datos queda en uso;
//   - qué proyectos se ven (cada base de datos tiene uno con nombre propio);
//   - qué diálogos salen, con sus botones y su texto (y qué se contesta: ver
//     RESPUESTAS);
//   - cuántas ventanas llegan a CREARSE (splash incluida) y cuáles;
//   - si la app se cierra, y por qué.
// Tras implementar P9, el .ps1 EXIGE el resultado; este arnés solo mide.
//
//   --modo=preparar --nombre=X   crea el proyecto X en la carpeta que toque
//   --modo=caso                  solo arranca y mira
//
// P9_MAIN_FUENTE: compila OTRA fuente como si fuera el main.js del proyecto
// (sus require relativos resuelven igual). Solo se admite una copia de
// `p9/revertidos/`: así se arrancan las reversiones sin tocar la raíz.
//
// SEGURIDAD (defensa en profundidad, además del sandbox):
//   - child_process: se BLOQUEAN reg.exe, schtasks.exe, powershell.exe,
//     wscript/cscript y cmd.exe (la protección de apagado de Drive escribe en
//     HKCU\...\Run y crea tareas; la espera de Drive consulta procesos). Si
//     main.js los pide, lanzan y queda anotado. La app sigue: ese es su camino
//     de error normal.
//   - original-fs/fs: se BLOQUEA cualquier copia cuyo destino esté fuera del
//     sandbox (el rescate PS-1007 copia sobre resources\app.asar).
//   - LOCALAPPDATA, APPDATA y el directorio de trabajo apuntan al sandbox.
// ---------------------------------------------------------------------------
const electron = require('electron');
const { app, dialog } = electron;
const path = require('path');
const fs = require('fs');
const originalFs = require('original-fs');
const cp = require('child_process');

const arg = (n) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : null; };
const SB = arg('sandbox');
if (!SB || !/_a33-p9/i.test(SB)) { console.error('sandbox no marcado'); process.exit(2); }
const MODO = arg('modo') || 'nada';
const NOMBRE = arg('nombre');
const SBr = path.resolve(SB).toLowerCase();
const enSandbox = (p) => { const r = path.relative(SBr, path.resolve(String(p)).toLowerCase()); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };

const ascii = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2014\u2013\u2192]/g, '-').replace(/\uFFFD/g, '?');
function tlog(s) { try { fs.appendFileSync(path.join(SB, 'test.log'), `[${new Date().toISOString()}] ${ascii(s)}\n`); } catch (e) {} }

// --- bloqueos ------------------------------------------------------------------
const bloqueados = [];
const PROHIBIDOS = /^(reg|schtasks|powershell|pwsh|wscript|cscript|cmd)(\.exe)?$/i;
for (const k of ['spawn', 'execFile', 'exec', 'spawnSync', 'execFileSync', 'execSync']) {
  const orig = cp[k];
  cp[k] = function (cmd, ...resto) {
    const base = path.basename(String(cmd).split(' ')[0]);
    if (PROHIBIDOS.test(base)) {
      const detalle = (Array.isArray(resto[0]) ? resto[0].slice(0, 3).join(' ') : '');
      bloqueados.push(`${k}:${base}${detalle ? ' ' + detalle : ''}`);
      // execFile/exec: se simula el FALLO del comando por su callback (lo que
      // haría el producto si reg.exe fallara), sin lanzar: así el arranque
      // sigue su camino normal. El resto lanza (spawn ya lo tiene previsto).
      if (k === 'execFile' || k === 'exec') {
        const cb = resto.find((x) => typeof x === 'function');
        setImmediate(() => { if (cb) cb(new Error(`BLOQUEADO POR EL ARNES P9: ${base}`)); });
        return { pid: 0, killed: false, kill() {}, on() { return this; }, once() { return this; }, unref() {} };
      }
      throw new Error(`BLOQUEADO POR EL ARNES P9: ${base}`);
    }
    return orig.call(this, cmd, ...resto);
  };
}
const copiasBloqueadas = [];
for (const m of [originalFs, fs]) {
  for (const k of ['copyFileSync', 'renameSync']) {
    const orig = m[k];
    m[k] = function (a, b, ...r) {
      if (!enSandbox(b)) { copiasBloqueadas.push(`${k} ${path.basename(String(a))} -> ${String(b)}`); throw new Error(`BLOQUEADO POR EL ARNES P9: ${k} fuera del sandbox`); }
      return orig.call(this, a, b, ...r);
    };
  }
}

// --- respuestas a los diálogos ------------------------------------------------
// Lo que contestaría un usuario razonable para que el arranque NO se quede en
// bucle; se deja anotado en cada caso.
const dialogos = [];
const RESPUESTAS = [
  [/No se puede acceder a la carpeta de datos/i, 1, 'Abrir con datos locales (temporal)'],   // PS-1005
  // PS-1009: al PREPARAR la carpeta compartida (vacía a propósito) hay que
  // empezar allí; en los casos, se elige no hacerlo.
  MODO === 'preparar'
    ? [/No se encuentra la base de datos en esta carpeta/i, 1, 'Si, empezar aqui desde cero']
    : [/No se encuentra la base de datos en esta carpeta/i, 2, 'Usar la carpeta por defecto por ahora'],
  [/Parece abierta en otro equipo/i, 1, 'Abrir igualmente'],                                  // PS-1012
];
dialog.showMessageBoxSync = function (a, b) {
  const o = (b || a) || {};
  const r = RESPUESTAS.find(([re]) => re.test(String(o.title)));
  const eleccion = r ? r[1] : 0;
  const codigo = (/PS-\d{4}/.exec(String(o.detail || '')) || [''])[0];
  dialogos.push({ titulo: o.title, codigo, respuesta: r ? r[2] : (o.buttons || [])[0], botones: o.buttons || [], mensaje: o.message || '', detalle: o.detail || '' });
  tlog(`DIALOGO ${codigo} «${o.title}» -> ${r ? r[2] : (o.buttons || [])[0]}`);
  return eleccion;
};
dialog.showErrorBox = function (t, c) {
  const codigo = (/PS-\d{4}/.exec(String(c || '')) || [''])[0];
  dialogos.push({ titulo: t, codigo, errorBox: true });
  tlog(`ERRORBOX ${codigo} «${t}»`);
};
dialog.showOpenDialogSync = function () { return null; };

// --- estado final ----------------------------------------------------------------
let dbmod = null;
let escrito = false;
// Toda ventana que llegue a CREARSE (la splash también), con la última URL que cargó.
const ventanas = [];
app.on('browser-window-created', (e, w) => {
  const v = { url: '(sin cargar)' };
  ventanas.push(v);
  const anotar = () => { try { v.url = decodeURIComponent(w.webContents.getURL()).replace(/^.*[\\/]([^\\/]+[\\/][^\\/]+)$/, '$1'); } catch (e2) {} };
  w.webContents.on('did-start-navigation', anotar);
  w.webContents.on('did-finish-load', anotar);
});
function volcar(motivo) {
  if (escrito) return;
  escrito = true;
  const r = { motivo, userData: null, db: null, proyectos: null, dialogos, bloqueados, copiasBloqueadas, ventanas };
  try { r.userData = app.getPath('userData'); } catch (e) { r.userData = 'ERR ' + e.message; }
  try { r.db = dbmod ? dbmod.getDbPath() : null; } catch (e) { r.db = 'ERR ' + e.message; }
  try { r.proyectos = dbmod ? dbmod.all("SELECT name FROM projects WHERE kind IS NULL OR kind='project' ORDER BY id").map((x) => x.name) : null; } catch (e) { r.proyectos = 'ERR ' + e.message; }
  try { fs.writeFileSync(path.join(SB, 'resultado.json'), JSON.stringify(r, null, 2), 'utf8'); } catch (e) {}
  tlog('RESULTADO ' + JSON.stringify(r));
}
const exitOriginal = app.exit.bind(app);
app.exit = function (code) { volcar(`app.exit(${code})`); exitOriginal(code); };
const quitOriginal = app.quit.bind(app);
app.quit = function () { volcar('app.quit()'); quitOriginal(); };
app.on('will-quit', () => volcar('will-quit'));
process.on('exit', () => volcar('process.exit'));

tlog(`--- P9 ${MODO}${NOMBRE ? ' ' + NOMBRE : ''} --- cwd=${process.cwd()}`);
app.setPath('appData', path.join(SB, 'Roaming'));
app.setPath('userData', path.join(SB, 'Roaming', 'panorama-app'));

// Sin try/catch A PROPÓSITO: si main.js lanza al cargar (ruta relativa), la
// excepción tiene que llegar a SU manejador de arranque, como en la app real.
const PROJDIR = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const fuenteAlt = process.env.P9_MAIN_FUENTE;
if (!fuenteAlt) {
  require(path.join(PROJDIR, 'main.js'));
} else {
  const permitida = path.resolve(PROJDIR, 'claude', 'pruebas-a33', 'p9', 'revertidos').toLowerCase() + path.sep;
  if (!path.resolve(fuenteAlt).toLowerCase().startsWith(permitida)) { console.error('P9_MAIN_FUENTE fuera de p9/revertidos'); process.exit(2); }
  tlog('main.js ALTERNATIVO: ' + path.basename(path.dirname(fuenteAlt)));
  const Module = require('module');
  const destino = path.join(PROJDIR, 'main.js');
  const m = new Module(destino, module);
  m.filename = destino;
  m.paths = Module._nodeModulePaths(PROJDIR);
  require.cache[destino] = m;
  m._compile(fs.readFileSync(fuenteAlt, 'utf8').replace(/^\uFEFF/, ''), destino);
  m.loaded = true;
}
dbmod = require(path.join(PROJDIR, 'db.js'));

const { BrowserWindow } = electron;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const t0 = Date.now();
  let lanzador = null;
  while (Date.now() - t0 < 60000) {
    lanzador = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && /launcher[\\/]index\.html/.test(decodeURIComponent(w.webContents.getURL())));
    if (lanzador) break;
    await esperar(300);
  }
  if (!lanzador) {
    // Qué se quedó abierto en su lugar (sin interactuar con nada).
    const abiertas = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()).map((w) => {
      let u = ''; try { u = decodeURIComponent(w.webContents.getURL()).replace(/^.*[\\/]([^\\/]+[\\/][^\\/]+)$/, '$1'); } catch (e) {}
      return `${u} «${w.getTitle()}»`;
    });
    volcar('sin lanzador tras 60 s; ventanas abiertas: ' + JSON.stringify(abiertas));
    exitOriginal(0);
    return;
  }
  await esperar(1500);
  if (MODO === 'preparar' && NOMBRE) {
    const row = await lanzador.webContents.executeJavaScript(`window.launcherAPI.createProject(${JSON.stringify(NOMBRE)},'','2026-01-01',null)`).catch((e) => ({ error: e.message }));
    tlog('proyecto creado: ' + JSON.stringify(row));
    await esperar(1500);
  }
  volcar('lanzador abierto');
  await esperar(300);
  exitOriginal(0);
});
