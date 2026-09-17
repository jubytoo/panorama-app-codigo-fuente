'use strict';
// ---------------------------------------------------------------------------
// F2 — CONTENT-SECURITY-POLICY. Batería EXIGENTE (implementado 17 sept 2026).
//
// Custodia la política que main.js entrega por cabecera a las 10 ventanas:
//   F2-P  los cuatro perfiles, con su texto EXACTO, y las reglas de mínimo
//         privilegio que los sostienen (sin unsafe-eval, sin file: redundante,
//         data: solo en img-src, blob: solo en el worker de Preparación…);
//   F2-M  el reparto documento → perfil, EJECUTADO con la función real;
//   F2-H  el enganche por sesión, EJECUTADO con dobles;
//   F2-I  el inventario de las plantillas que justifica cada perfil: si
//         mañana alguien mete un <script> en línea en el lanzador o un fetch
//         en una ventana, esto se pone rojo antes que la app;
//   F2-W  el arranque del Worker de pdf.js por blob: en Preparación.
//
// Lo que aquí no se puede ver (que Chromium APLIQUE todo esto) lo mide
// `real-run/f2-csp.js` en la app real, y el motor en `real-run/f2-laboratorio.js`.
// Variables para las reversiones: PANORAMA_MAIN, PANORAMA_PREPARACION.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const { pathToFileURL, fileURLToPath } = require('url');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const LEE = (rel, env) => fs.readFileSync((env && process.env[env]) || path.join(PROJ, rel), 'utf8');
const MAIN = LEE('main.js', 'PANORAMA_MAIN');
const PREP = LEE('preparacion-reunion/plantilla_preparacion_reunion.html', 'PANORAMA_PREPARACION');
const DOC = (n) => fs.readFileSync(path.join(PROJ, 'claude', n), 'utf8');

let pass = 0, fail = 0; const fallos = [];
function ok(n, c, extra) {
  if (c) { pass++; console.log('  OK    ' + n); }
  else { fail++; fallos.push(n); console.log('  FALLO ' + n + (extra === undefined ? '' : '  -- ' + extra)); }
}
function seccion(t) { console.log('\n=== ' + t + ' ==='); }
function nota(s) { console.log('        ' + s); }
const cuenta = (s, re) => (String(s).match(re) || []).length;
const soloCodigo = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1');

function extraerDe(src, firma) {
  const i = src.indexOf(firma);
  if (i < 0) throw new Error('NO SE ENCONTRO: ' + firma);
  let j = src.indexOf('{', i), prof = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (prof === 0) return src.slice(i, k + 1); }
  }
  throw new Error('no delimitado: ' + firma);
}

// =============================================================================
seccion('F2-P. LOS PERFILES');
// =============================================================================
const iniP = MAIN.indexOf('const CSP_SIN_RED_NI_INCRUSTADOS');
const finP = MAIN.indexOf('function perfilCspDeDocumento');
let PERFILES = {};
try { PERFILES = new Function(MAIN.slice(iniP, finP) + '\nreturn CSP_PERFILES;')(); } catch (e) { nota('no se pudieron cargar los perfiles: ' + e.message); }
const NOMBRES = ['cerrado', 'sinScriptEnLinea', 'interfaz', 'lectorDeActas'];
ok('F2-P1 hay EXACTAMENTE cuatro perfiles, con estos nombres, y la tabla está congelada',
  iniP > 0 && finP > iniP && JSON.stringify(Object.keys(PERFILES)) === JSON.stringify(NOMBRES) && Object.isFrozen(PERFILES),
  JSON.stringify(Object.keys(PERFILES)));

// Texto EXACTO. Cualquier cambio en la política tiene que pasar por aquí.
const ESPERADO = {
  cerrado: "default-src 'none'; form-action 'none'; base-uri 'none'",
  sinScriptEnLinea: "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; worker-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'",
  interfaz: "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; worker-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'",
  lectorDeActas: "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; worker-src blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'",
};
for (const n of NOMBRES) ok(`F2-P2 «${n}» tiene EXACTAMENTE el texto fijado`, PERFILES[n] === ESPERADO[n], PERFILES[n]);

const parsear = (p) => {
  const m = {};
  for (const trozo of String(p || '').split(';')) {
    const t = trozo.trim().split(/\s+/).filter(Boolean);
    if (t.length) m[t[0]] = t.slice(1);
  }
  return m;
};
const P = {}; for (const n of NOMBRES) P[n] = parsear(PERFILES[n]);
const todasLasFuentes = NOMBRES.flatMap((n) => Object.entries(P[n]).map(([d, f]) => f.map((x) => ({ n, d, x }))).flat());

// F2-2 — la ausencia de unsafe-eval, EXPLÍCITA (petición del usuario).
ok("F2-2 [EXIGE] NINGÚN perfil contiene 'unsafe-eval' (ni 'wasm-unsafe-eval')",
  !todasLasFuentes.some((f) => /unsafe-eval/.test(f.x)), JSON.stringify(todasLasFuentes.filter((f) => /eval/.test(f.x))));
ok("F2-2b [EXIGE] 'unsafe-eval' no aparece en ningún sitio del CÓDIGO de main.js",
  cuenta(soloCodigo(MAIN), /unsafe-eval/g) === 0, String(cuenta(soloCodigo(MAIN), /unsafe-eval/g)));
ok("F2-P3 ni 'unsafe-hashes', ni 'strict-dynamic', ni nonces/hashes, ni report-uri/report-to",
  !todasLasFuentes.some((f) => /unsafe-hashes|strict-dynamic|nonce-|sha(256|384|512)-/.test(f.x))
  && !NOMBRES.some((n) => P[n]['report-uri'] || P[n]['report-to']));
for (const n of NOMBRES) {
  ok(`F2-P4 «${n}»: default-src 'none', form-action 'none' y base-uri 'none'`,
    JSON.stringify(P[n]['default-src']) === '["\'none\'"]' && JSON.stringify(P[n]['form-action']) === '["\'none\'"]'
    && JSON.stringify(P[n]['base-uri']) === '["\'none\'"]', PERFILES[n]);
}
for (const n of ['sinScriptEnLinea', 'interfaz', 'lectorDeActas']) {
  ok(`F2-P5 «${n}»: connect-src, frame-src y object-src 'none', y worker-src EXPLÍCITO (si no, caería en script-src)`,
    ['connect-src', 'frame-src', 'object-src'].every((d) => JSON.stringify(P[n][d]) === '["\'none\'"]') && Array.isArray(P[n]['worker-src']),
    PERFILES[n]);
}
ok('F2-P6 ninguna fuente remota ni comodín: sin *, http:, https:, ws:, wss:, ni hosts',
  !todasLasFuentes.some((f) => /^\*|^(https?|wss?|ftp):|\.[a-z]{2,}(:|\/|$)/i.test(f.x)), JSON.stringify(todasLasFuentes.filter((f) => /\*|:\/\/|https?:|wss?:/.test(f.x))));
ok("F2-P7 `file:` NO se repite: en un documento file:// 'self' ya es exactamente file: (medido, L2e)",
  !todasLasFuentes.some((f) => f.x === 'file:'), JSON.stringify(todasLasFuentes.filter((f) => f.x === 'file:')));
ok('F2-P8 `data:` SOLO en img-src (logos y fantasma de arrastre), nunca en script/style/font/connect/worker',
  todasLasFuentes.filter((f) => f.x === 'data:').every((f) => f.d === 'img-src')
  && todasLasFuentes.some((f) => f.x === 'data:'), JSON.stringify(todasLasFuentes.filter((f) => f.x === 'data:')));
ok('F2-P9 `blob:` SOLO en worker-src de «lectorDeActas» (descargar no lo necesita, medido L4)',
  JSON.stringify(todasLasFuentes.filter((f) => f.x === 'blob:').map((f) => `${f.n}:${f.d}`)) === '["lectorDeActas:worker-src"]',
  JSON.stringify(todasLasFuentes.filter((f) => f.x === 'blob:')));
ok("F2-P10 'unsafe-inline' en script-src SOLO en «interfaz» y «lectorDeActas»",
  JSON.stringify(todasLasFuentes.filter((f) => f.x === "'unsafe-inline'" && f.d === 'script-src').map((f) => f.n)) === '["interfaz","lectorDeActas"]');
ok("F2-P11 'unsafe-inline' fuera de script-src SOLO en style-src",
  todasLasFuentes.filter((f) => f.x === "'unsafe-inline'" && f.d !== 'script-src').every((f) => f.d === 'style-src'));
ok("F2-P12 «sinScriptEnLinea»: script-src es EXACTAMENTE 'self' (lanzador y splash, sin inyección en línea)",
  JSON.stringify(P.sinScriptEnLinea['script-src']) === '["\'self\'"]', JSON.stringify(P.sinScriptEnLinea['script-src']));
ok("F2-P13 worker-src: 'none' en «sinScriptEnLinea» e «interfaz»; en «lectorDeActas» SOLO blob: (un Worker file: no hereda la CSP)",
  JSON.stringify(P.sinScriptEnLinea['worker-src']) === '["\'none\'"]' && JSON.stringify(P.interfaz['worker-src']) === '["\'none\'"]'
  && JSON.stringify(P.lectorDeActas['worker-src']) === '["blob:"]');
ok("F2-P14 font-src solo donde se cargan fuentes («interfaz», «lectorDeActas») y es 'self'",
  !P.cerrado['font-src'] && !P.sinScriptEnLinea['font-src']
  && JSON.stringify(P.interfaz['font-src']) === '["\'self\'"]' && JSON.stringify(P.lectorDeActas['font-src']) === '["\'self\'"]');
ok('F2-P15 «cerrado» no concede NADA: solo sus tres directivas',
  Object.keys(P.cerrado).length === 3);
ok('F2-P16 solo directivas conocidas (ninguna sorpresa como sandbox o frame-ancestors)',
  NOMBRES.every((n) => Object.keys(P[n]).every((d) => ['default-src', 'script-src', 'style-src', 'img-src', 'font-src',
    'worker-src', 'connect-src', 'frame-src', 'object-src', 'form-action', 'base-uri'].includes(d))));

// =============================================================================
seccion('F2-M. EL REPARTO DOCUMENTO → PERFIL, EJECUTADO');
// =============================================================================
const FUENTE_MAPA = extraerDe(MAIN, 'function perfilCspDeDocumento(url)');
function mapa(dirApp, userData) {
  return new Function('path', 'fileURLToPath', 'app', '__dirname', FUENTE_MAPA + '\nreturn perfilCspDeDocumento;')(
    path, fileURLToPath, { getPath: (k) => { if (k !== 'userData') throw new Error('getPath(' + k + ')'); return userData; } }, dirApp);
}
const UD = 'C:\\Users\\alguien\\AppData\\Roaming\\panorama-app';
const f = mapa(PROJ, UD);
const U = (...p) => pathToFileURL(path.join(...p)).href;
const CASOS = [
  ['lanzador', U(PROJ, 'launcher', 'index.html'), 'sinScriptEnLinea'],
  ['splash', U(PROJ, 'launcher', 'splash.html'), 'sinScriptEnLinea'],
  ['preparacion', U(PROJ, 'preparacion-reunion', 'plantilla_preparacion_reunion.html'), 'lectorDeActas'],
  ['evaluacion', U(PROJ, 'evaluacion-candidatos', 'plantilla_evaluacion_candidatos.html'), 'interfaz'],
  ['dashboard sin hornear', U(PROJ, 'dashboard', 'plantilla_dashboard.html'), 'interfaz'],
  ['selector-backups', U(PROJ, 'backup-picker', 'index.html'), 'interfaz'],
  ['seguridad', U(PROJ, 'security-window', 'index.html'), 'interfaz'],
  ['contrasena', U(PROJ, 'launcher', 'password-prompt.html'), 'interfaz'],
  ['restore-helper (volcado y particion-auxiliar)', U(PROJ, 'dashboard', 'restore-helper.html'), 'cerrado'],
  ['copia horneada de un proyecto', U(UD, 'projects', '12', 'dashboard.html'), 'interfaz'],
  ['copia horneada del Directorio', U(UD, 'projects', '3', 'dashboard.html'), 'interfaz'],
];
for (const [nombre, url, esperado] of CASOS) ok(`F2-M ${nombre} → «${esperado}»`, f(url) === esperado, `${f(url)} (${url.slice(-50)})`);
// Variantes de la misma ruta: mayúsculas (Windows) y codificación.
ok('F2-M mayúsculas distintas en la ruta → mismo perfil (Windows no distingue)',
  f(U(PROJ.toUpperCase(), 'LAUNCHER', 'INDEX.HTML')) === 'sinScriptEnLinea', f(U(PROJ.toUpperCase(), 'LAUNCHER', 'INDEX.HTML')));
ok('F2-M ruta con espacios codificados (%20) → se reconoce', /%20/.test(U(PROJ, 'launcher', 'index.html')) && f(U(PROJ, 'launcher', 'index.html')) === 'sinScriptEnLinea');
ok('F2-M «..» que vuelve dentro de projects/<id> → sigue siendo una copia horneada',
  f(pathToFileURL(UD).href + '/projects/x/../7/dashboard.html') === 'interfaz');
// La app empaquetada: __dirname es el asar, y userData puede estar en Drive.
const fAsar = mapa('C:\\Program Files\\Panorama del Servicio\\resources\\app.asar', 'G:\\Mi unidad\\Panorama Datos');
ok('F2-M app EMPAQUETADA: los documentos dentro de app.asar se reconocen',
  fAsar(U('C:\\Program Files\\Panorama del Servicio\\resources\\app.asar', 'launcher', 'index.html')) === 'sinScriptEnLinea'
  && fAsar(U('C:\\Program Files\\Panorama del Servicio\\resources\\app.asar', 'preparacion-reunion', 'plantilla_preparacion_reunion.html')) === 'lectorDeActas');
ok('F2-M datos en Drive (G:\\Mi unidad\\…): las copias horneadas se reconocen',
  fAsar(U('G:\\Mi unidad\\Panorama Datos', 'projects', '41', 'dashboard.html')) === 'interfaz');
// Lo que NO está en la tabla queda CERRADO.
const CERRADOS = [
  ['un id no numérico', U(UD, 'projects', 'abc', 'dashboard.html')],
  ['otro archivo en la carpeta del proyecto', U(UD, 'projects', '12', 'otro.html')],
  ['una subcarpeta del proyecto', U(UD, 'projects', '12', 'sub', 'dashboard.html')],
  ['un dashboard.html fuera de projects/', U(UD, 'dashboard.html')],
  ['una copia de seguridad del archivo', U(UD, 'projects', '12', 'dashboard.html.bak')],
  ['un «..» que SALE de projects/', pathToFileURL(UD).href + '/projects/12/../../otra/dashboard.html'],
  ['un launcher/index.html de OTRA carpeta', U('C:\\otra', 'launcher', 'index.html')],
  ['un archivo del vendor', U(PROJ, 'vendor', 'theme.js')],
  ['una página cualquiera del disco', U('C:\\Users\\alguien\\Desktop', 'pagina.html')],
  ['una ruta UNC', 'file://servidor/compartida/launcher/index.html'],
  ['una URL que no es file:', 'http://ejemplo.test/launcher/index.html'],
  ['una URL malformada', 'file://%zz'],
  ['vacío', ''],
];
for (const [nombre, url] of CERRADOS) {
  let r; try { r = f(url); } catch (e) { r = 'LANZA ' + e.message; }
  ok(`F2-M ${nombre} → «cerrado»`, r === 'cerrado', String(r));
}
// Cada documento que main.js carga está en la tabla con su caso EXPLÍCITO.
const cargas = [...MAIN.matchAll(/\.loadFile\(path\.join\(__dirname, ((?:'[^']+'(?:, )?)+)\)\)/g)].map((m) => m[1].replace(/'/g, '').split(', ').join('/'));
nota('loadFile con ruta fija: ' + JSON.stringify(cargas));
ok('F2-M9 son 9 cargas con ruta fija (la décima, el proyecto, se resuelve en resolveDashboardFileForProject)',
  cargas.length === 9 && /win\.loadFile\(resolveDashboardFileForProject\(row\)\)/.test(MAIN), String(cargas.length));
ok('F2-M10 cada una tiene su `case` explícito en perfilCspDeDocumento, y existe en disco',
  cargas.every((c) => FUENTE_MAPA.includes(`case deLaApp(${c.split('/').map((x) => `'${x}'`).join(', ')}):`) && fs.existsSync(path.join(PROJ, c))),
  JSON.stringify(cargas.filter((c) => !FUENTE_MAPA.includes(`case deLaApp(${c.split('/').map((x) => `'${x}'`).join(', ')}):`))));
ok('F2-M11 el fallback sin hornear (dashboard/plantilla_dashboard.html) también está en la tabla',
  /return path\.join\(__dirname, 'dashboard', 'plantilla_dashboard\.html'\);/.test(MAIN)
  && FUENTE_MAPA.includes("case deLaApp('dashboard', 'plantilla_dashboard.html'):"));
ok('F2-M12 la regla de las copias horneadas coincide con projectDashboardFile (projects/<id>/dashboard.html)',
  /path\.join\(app\.getPath\('userData'\), 'projects', String\(projectId\)\)/.test(MAIN)
  && /path\.join\(projectDashboardDir\(projectId\), 'dashboard\.html'\)/.test(MAIN));

// =============================================================================
seccion('F2-H. EL ENGANCHE POR SESIÓN, EJECUTADO');
// =============================================================================
const FUENTE_ENGANCHE = extraerDe(MAIN, 'function instalarCspEnSesion(ses)');
function enganche(mapaFn) {
  return new Function('CSP_PERFILES', 'perfilCspDeDocumento', FUENTE_ENGANCHE + '\nreturn instalarCspEnSesion;')(PERFILES, mapaFn);
}
function sesionDoble() {
  const s = { oyentes: [], webRequest: { onHeadersReceived(fn) { s.oyentes.push(fn); } } };
  return s;
}
function responder(oyente, detalles) {
  const llamadas = [];
  oyente(detalles, (r) => llamadas.push(r));
  return llamadas;
}
{
  const s = sesionDoble();
  enganche(f)(s);
  ok('F2-H1 instala UN oyente onHeadersReceived en la sesión', s.oyentes.length === 1);
  const o = s.oyentes[0];
  const r1 = responder(o, { url: U(PROJ, 'launcher', 'index.html'), responseHeaders: { 'X-Otra': ['1'] } });
  ok('F2-H2 documento file:// → responde UNA vez con la cabecera del perfil, sin perder las demás',
    r1.length === 1 && JSON.stringify(r1[0].responseHeaders['Content-Security-Policy']) === JSON.stringify([ESPERADO.sinScriptEnLinea])
    && JSON.stringify(r1[0].responseHeaders['X-Otra']) === '["1"]', JSON.stringify(r1));
  const r1b = responder(o, { url: U(PROJ, 'launcher', 'index.html') });
  ok('F2-H2b sin cabeceras previas también funciona', r1b.length === 1 && r1b[0].responseHeaders['Content-Security-Policy'][0] === ESPERADO.sinScriptEnLinea);
  const r2 = responder(o, { url: 'https://ejemplo.test/x', responseHeaders: { a: ['b'] } });
  ok('F2-H3 una respuesta que NO es file: no se toca (responder({}))', r2.length === 1 && JSON.stringify(r2[0]) === '{}', JSON.stringify(r2));
  for (const d of [{}, { url: '' }, { url: null }, undefined]) {
    let r; try { r = responder(o, d); } catch (e) { r = 'LANZA ' + e.message; }
    ok(`F2-H4 detalles raros ${JSON.stringify(d)} → responde {} sin lanzar`, Array.isArray(r) && r.length === 1 && JSON.stringify(r[0]) === '{}', JSON.stringify(r));
  }
  const r5 = responder(o, { url: U(PROJ, 'vendor', 'pdf.worker.min.js'), responseHeaders: {} });
  ok('F2-H5 un subrecurso file: recibe el perfil cerrado (a un subrecurso no le hace nada; a un Worker file: tampoco, medido)',
    r5.length === 1 && r5[0].responseHeaders['Content-Security-Policy'][0] === ESPERADO.cerrado);
}
{
  const s = sesionDoble();
  enganche(() => { throw new Error('mapa roto'); })(s);
  const r = responder(s.oyentes[0], { url: U(PROJ, 'launcher', 'index.html'), responseHeaders: {} });
  ok('F2-H6 si el mapa LANZA, la respuesta sale igualmente y con el perfil CERRADO', r.length === 1 && r[0].responseHeaders['Content-Security-Policy'][0] === ESPERADO.cerrado, JSON.stringify(r));
}
{
  const s = sesionDoble();
  enganche(() => 'perfilQueNoExiste')(s);
  const r = responder(s.oyentes[0], { url: U(PROJ, 'launcher', 'index.html'), responseHeaders: {} });
  ok('F2-H7 un nombre de perfil desconocido → CERRADO', r.length === 1 && r[0].responseHeaders['Content-Security-Policy'][0] === ESPERADO.cerrado);
}
{
  const inst = enganche(f);
  let lanzo = null;
  try { inst(null); inst(undefined); inst({}); inst({ webRequest: {} }); } catch (e) { lanzo = e.message; }
  ok('F2-H8 una sesión sin webRequest (o nula) no hace lanzar nada', lanzo === null, String(lanzo));
}
const lineasRegistro = MAIN.split(/\r?\n/).filter((l) => /session-created/.test(l) && /instalarCspEnSesion/.test(l));
ok("F2-H9 [EXIGE] se registra con `app.on('session-created', instalarCspEnSesion)`, UNA vez y a nivel de módulo",
  lineasRegistro.length === 1 && lineasRegistro[0] === "app.on('session-created', instalarCspEnSesion);", JSON.stringify(lineasRegistro));
// Se busca la LLAMADA real (la primera mención de app.whenReady() es un comentario).
const posRegistro = MAIN.indexOf("\napp.on('session-created', instalarCspEnSesion);");
ok('F2-H10 el registro está a nivel de módulo y ANTES de la función del lanzador y del arranque (app.whenReady().then)',
  posRegistro > 0 && posRegistro < MAIN.indexOf('function createLauncherWindow()')
  && posRegistro < MAIN.indexOf('\napp.whenReady().then('), `${posRegistro} / ${MAIN.indexOf('\napp.whenReady().then(')}`);
ok('F2-H11 nadie más instala onHeadersReceived (una sesión solo admite UN oyente: otro reemplazaría la CSP)',
  cuenta(soloCodigo(MAIN), /onHeadersReceived\(/g) === 1 && cuenta(soloCodigo(MAIN), /onBeforeRequest|onBeforeSendHeaders|protocol\.(handle|intercept|register)/g) === 0,
  String(cuenta(soloCodigo(MAIN), /onHeadersReceived\(/g)));

// =============================================================================
seccion('F2-I. EL INVENTARIO QUE SOSTIENE CADA PERFIL');
// =============================================================================
const VENTANAS = [
  ['lanzador', 'launcher/index.html', 'sinScriptEnLinea'],
  ['splash', 'launcher/splash.html', 'sinScriptEnLinea'],
  ['dashboard', 'dashboard/plantilla_dashboard.html', 'interfaz'],
  ['directorio', 'directorio/plantilla_directorio.html', 'interfaz'],
  ['evaluacion', 'evaluacion-candidatos/plantilla_evaluacion_candidatos.html', 'interfaz'],
  ['selector-backups', 'backup-picker/index.html', 'interfaz'],
  ['seguridad', 'security-window/index.html', 'interfaz'],
  ['contrasena', 'launcher/password-prompt.html', 'interfaz'],
  ['preparacion', 'preparacion-reunion/plantilla_preparacion_reunion.html', 'lectorDeActas'],
  ['ayudante-restaurar', 'dashboard/restore-helper.html', 'cerrado'],
];
const JS_DE = {
  lanzador: ['launcher/renderer.js', 'vendor/theme.js', 'vendor/modal.js'],
  splash: [],
};
const html = (rel) => (rel === 'preparacion-reunion/plantilla_preparacion_reunion.html' ? PREP : LEE(rel));
ok('F2-I0 no hay ningún <meta http-equiv> CSP: la política tiene UNA sola fuente (la cabecera)',
  VENTANAS.every(([, rel]) => !/http-equiv=["']?Content-Security-Policy/i.test(html(rel))));
for (const n of ['lanzador', 'splash']) {
  const h = html(VENTANAS.find((v) => v[0] === n)[1]);
  const js = JS_DE[n].map((r) => LEE(r)).join('\n');
  ok(`F2-I1 ${n}: CERO <script> en línea, CERO manejadores on*= y CERO javascript: (por eso no recibe unsafe-inline)`,
    cuenta(h, /<script(?![^>]*\ssrc=)[^>]*>/g) === 0 && cuenta(h, /\son[a-z]+\s*=\s*["']/gi) === 0
    && cuenta(h + js, /javascript:/gi) === 0 && cuenta(js, /\son[a-z]+=\\?["']|setAttribute\(\s*['"]on/gi) === 0,
    JSON.stringify({ inline: cuenta(h, /<script(?![^>]*\ssrc=)[^>]*>/g), on: cuenta(h, /\son[a-z]+\s*=\s*["']/gi) }));
}
ok('F2-I2 ayudante-restaurar: ni un script, ni un estilo, ni una imagen (por eso «cerrado»)',
  !/<script|<style|<img|<link/i.test(html('dashboard/restore-helper.html')));
const RENDERERS = ['launcher/renderer.js', 'launcher/password-prompt-renderer.js', 'backup-picker/renderer.js', 'security-window/renderer.js',
  'vendor/theme.js', 'vendor/modal.js', 'vendor/service-status.js'];
const todoPropio = VENTANAS.map(([, rel]) => soloCodigo(html(rel))).concat(RENDERERS.map((r) => soloCodigo(LEE(r)))).join('\n');
ok("F2-I3 connect-src 'none' se sostiene: ni fetch, ni XMLHttpRequest, ni WebSocket, ni EventSource, ni sendBeacon en el código de las ventanas",
  cuenta(todoPropio, /\bfetch\s*\(|XMLHttpRequest|new WebSocket|new EventSource|sendBeacon/g) === 0,
  String(cuenta(todoPropio, /\bfetch\s*\(|XMLHttpRequest|new WebSocket|new EventSource|sendBeacon/g)));
ok("F2-I4 frame/object/form/base 'none' se sostienen: ni <iframe>, ni <object>/<embed>, ni <form>, ni <base>",
  VENTANAS.every(([, rel]) => !/<iframe|<object|<embed|<form[\s>]|<base[\s>]/i.test(html(rel)))
  && cuenta(todoPropio, /createElement\(\s*['"](iframe|object|embed|form|base)['"]/g) === 0);
ok('F2-I5 ninguna plantilla referencia recursos http(s) (ni script, ni hoja, ni imagen, ni fuente)',
  VENTANAS.every(([, rel]) => cuenta(html(rel), /(?:src|href)\s*=\s*["']https?:\/\//g) === 0 && cuenta(html(rel), /url\(\s*['"]?https?:/g) === 0));
const conFuentes = VENTANAS.filter(([, rel]) => /fonts\.css/.test(html(rel).replace(/<!--[\s\S]*?-->/g, ''))).map(([n]) => n).sort();
ok('F2-I6 fonts.css solo lo enlazan ventanas cuyo perfil tiene font-src (dashboard, directorio, evaluación, preparación)',
  JSON.stringify(conFuentes) === JSON.stringify(['dashboard', 'directorio', 'evaluacion', 'preparacion'])
  && conFuentes.every((n) => P[VENTANAS.find((v) => v[0] === n)[2]]['font-src']), JSON.stringify(conFuentes));
ok('F2-I7 las hojas del vendor no cargan nada remoto (url() solo a las woff2 locales)',
  ['vendor/fonts/fonts.css', 'vendor/motion.css', 'vendor/window-chrome.css'].every((r) => cuenta(LEE(r), /url\(\s*['"]?(https?:|\/\/|data:)/g) === 0 && cuenta(LEE(r), /@import/g) === 0));
ok('F2-I8 las imágenes data: del producto están en ventanas cuyo perfil tiene img-src data: (logos del dashboard/directorio, fantasma del lanzador)',
  /data:image\/gif;base64/.test(LEE('launcher/renderer.js')) && /F1_LOGO_MIME = \/\^data:image/.test(LEE('dashboard/plantilla_dashboard.html'))
  && /F1_LOGO_MIME = \/\^data:image/.test(LEE('directorio/plantilla_directorio.html'))
  && ['sinScriptEnLinea', 'interfaz'].every((n) => P[n]['img-src'].includes('data:')));
const conWorker = VENTANAS.filter(([, rel]) => /new Worker\s*\(/.test(soloCodigo(html(rel)))).map(([n]) => n);
ok('F2-I9 SOLO Preparación crea un Worker (y es la única con worker-src distinto de none)',
  JSON.stringify(conWorker) === '["preparacion"]' && cuenta(todoPropio, /new Worker\s*\(/g) === 1, JSON.stringify(conWorker));
ok('F2-I10 las exportaciones siguen siendo createObjectURL + <a download> (no necesitan blob: en la CSP, medido L4)',
  ['dashboard/plantilla_dashboard.html', 'directorio/plantilla_directorio.html', 'evaluacion-candidatos/plantilla_evaluacion_candidatos.html']
    .every((r) => /URL\.createObjectURL\(/.test(LEE(r)) && /\.download\s*=/.test(LEE(r))));
ok('F2-I11 el código propio sigue sin eval ni new Function (por eso no hace falta unsafe-eval)',
  cuenta(todoPropio, /(?<![\w.])eval\s*\(|new Function\s*\(/g) === 0 && cuenta(soloCodigo(MAIN).replace(/new Function\('return 1'\)/g, ''), /(?<![\w.])eval\s*\(/g) === 0);

// =============================================================================
seccion('F2-W. EL WORKER DE pdf.js, ARRANCADO POR blob:');
// =============================================================================
const FN_ARRANQUE = (() => { try { return extraerDe(PREP, 'function arrancarWorkerPdf()'); } catch (e) { return ''; } })();
const FN_PDF = (() => { try { return extraerDe(PREP, 'async function extractPdf(file)'); } catch (e) { return ''; } })();
ok('F2-W1 [EXIGE] existe arrancarWorkerPdf y extractPdf lo usa ANTES de leer el PDF',
  !!FN_ARRANQUE && /const w = await arrancarWorkerPdf\(\);/.test(FN_PDF)
  && /if\(w\) window\.pdfjsLib\.GlobalWorkerOptions\.workerPort = w;/.test(FN_PDF)
  && FN_PDF.indexOf('arrancarWorkerPdf') < FN_PDF.indexOf('getDocument'), FN_PDF.slice(0, 200));
ok('F2-W2 [EXIGE] el Worker se crea desde un blob: que solo hace importScripts del vendor',
  /new Worker\(URL\.createObjectURL\(envoltorio\)\)/.test(FN_ARRANQUE)
  && /new Blob\(\[`importScripts\(\$\{JSON\.stringify\(src\)\}\);`\]/.test(FN_ARRANQUE)
  && /new URL\('\.\.\/vendor\/pdf\.worker\.min\.js', location\.href\)\.href/.test(FN_ARRANQUE));
ok('F2-W3 [EXIGE] espera el «ready» del Worker y, si no llega (error o 10 s), lo descarta y pdf.js sigue por su camino',
  /ev\.data && ev\.data\.action === 'ready'/.test(FN_ARRANQUE) && /addEventListener\('error', alFallar\)/.test(FN_ARRANQUE)
  && /setTimeout\(\(\) => fin\(false\), 10000\)/.test(FN_ARRANQUE) && /w\.terminate\(\)/.test(FN_ARRANQUE)
  && /catch\(e\)\{ resolve\(null\); return; \}/.test(FN_ARRANQUE));
ok('F2-W4 se arranca UNA sola vez por ventana (promesa memorizada)',
  /let _pdfWorkerListo = null;/.test(PREP) && /if\(_pdfWorkerListo\) return _pdfWorkerListo;/.test(FN_ARRANQUE));
ok('F2-W5 el workerSrc de siempre se mantiene (camino de reserva)', /GlobalWorkerOptions\.workerSrc = '\.\.\/vendor\/pdf\.worker\.min\.js';/.test(FN_PDF));
ok('F2-W6 el resto de extractPdf no cambia: lee todas las páginas con getTextContent',
  /for\(let i=1;i<=pdf\.numPages;i\+\+\)\{/.test(FN_PDF) && /await page\.getTextContent\(\);/.test(FN_PDF));
ok('F2-W7 el vendor que se arranca es el que hay (pdf.worker 3.11.174 emite «ready» al cargarse)',
  /static initializeFromPort\(e\)\{const t=new h\.MessageHandler\("worker","main",e\);WorkerMessageHandler\.setup\(t,e\);t\.send\("ready",null\)\}/.test(LEE('vendor/pdf.worker.min.js'))
  && /c=t\.port\?PDFWorker\.fromPort\(t\):new PDFWorker\(t\)/.test(LEE('vendor/pdf.min.js')));

// =============================================================================
seccion('F2-Z. ALCANCE Y ESTADO');
// =============================================================================
const AUD = DOC('auditoria-2026-09-13.md');
ok('F2-Z1 F2 CERRADO en la auditoría; F1 y F3 siguen CERRADOS',
  /\| \*\*F2\*\* \| \*\*CERRADO\*\*/.test(AUD) && /\| \*\*F1\*\* \| \*\*CERRADO\*\*/.test(AUD) && /\| \*\*F3\*\* \| \*\*CERRADO\*\*/.test(AUD));
ok('F2-Z2 F3 intacto: la política de navegación sigue en las 10 ventanas',
  cuenta(MAIN, /aplicarPoliticaDeNavegacion\([^,]+, '[a-z-]+'\)/g) === 10 && cuenta(MAIN, /new BrowserWindow/g) === 10);
ok('F2-Z3 el documento de pendientes recoge la implementación de F2',
  /### F2 — IMPLEMENTADO Y CERRADO \(17 sept 2026\)/.test(DOC('pendientes-abiertos.md')));

console.log('\n======================================================================');
console.log(`  F2: ${pass} OK / ${fail} FALLOS`);
console.log('======================================================================');
if (fail) { console.log('  Fallos:'); fallos.forEach((x) => console.log('   · ' + x)); process.exit(1); }
