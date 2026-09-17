'use strict';
// ---------------------------------------------------------------------------
// F2 (sin CSP) y F3 (sin setWindowOpenHandler) — DIAGNÓSTICO.
//
// Batería DESCRIPTIVA: da verde porque describe lo que HAY. No exige ninguna
// corrección — F2 y F3 están diagnosticados, sin implementar.
//
// Se mantienen como DOS hallazgos separados aunque compartan superficie (el
// renderer): la conclusión de cada uno va aparte.
//
// F2 original (auditoria-2026-09-13):
//   «F2. Ninguna ventana declara Content-Security-Policy — [MEDIDO].
//    0 de 10 archivos HTML tienen <meta http-equiv="Content-Security-Policy">.
//    Una CSP no bloquearía el XSS de F1 (las plantillas dependen de scripts y
//    estilos en línea, harían falta 'unsafe-inline'), pero sí cortaría la
//    exfiltración: connect-src 'none'; img-src 'self' data:; form-action 'none'
//    convierte un XSS en un defacement local en vez de en una fuga.
//    Coste: una línea por plantilla.»
//
// F3 original (auditoria-2026-09-13):
//   «F3. Sin setWindowOpenHandler ni guardia de will-navigate — [LEÍDO].
//    Ninguna ventana intercepta window.open ni navegaciones. Combinado con F1,
//    un <a href="https://…" target="_blank"> inyectado abriría una
//    BrowserWindow de Electron con contenido remoto. Es defensa en profundidad
//    estándar: denegar setWindowOpenHandler y mandar los enlaces externos a
//    shell.openExternal.»
//
// Nota de evidencia: F2 venía [MEDIDO]; F3 venía [LEÍDO] — es decir, F3 nunca
// se había reproducido. Esta ronda lo reproduce en Electron real (ver
// `real-run/f2f3-superficie.js`).
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const LEE = (rel, env) => fs.readFileSync(process.env[env] || path.join(PROJ, rel), 'utf8');
const MAIN = LEE('main.js', 'PANORAMA_MAIN');
const DOC = (n) => fs.readFileSync(path.join(PROJ, 'claude', n), 'utf8');

const VENTANAS = [
  ['lanzador', 'launcher/index.html'],
  ['dashboard', 'dashboard/plantilla_dashboard.html'],
  ['directorio', 'directorio/plantilla_directorio.html'],
  ['evaluacion', 'evaluacion-candidatos/plantilla_evaluacion_candidatos.html'],
  ['preparacion', 'preparacion-reunion/plantilla_preparacion_reunion.html'],
  ['seguridad', 'security-window/index.html'],
  ['selector-backups', 'backup-picker/index.html'],
  ['contrasena', 'launcher/password-prompt.html'],
  ['splash', 'launcher/splash.html'],
  ['ayudante-restaurar', 'dashboard/restore-helper.html'],
];

let pass = 0, fail = 0; const fallos = [];
function ok(n, c, extra) {
  if (c) { pass++; console.log('  OK    ' + n); }
  else { fail++; fallos.push(n); console.log('  FALLO ' + n + (extra === undefined ? '' : '  -- ' + extra)); }
}
function seccion(t) { console.log('\n=== ' + t + ' ==='); }
function nota(s) { console.log('        ' + s); }
const cuenta = (s, re) => (String(s).match(re) || []).length;
const soloCodigo = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// =============================================================================
seccion('F2-O. EL HALLAZGO ORIGINAL, CONTRA EL CÓDIGO DE HOY');
// =============================================================================
const AUD = DOC('auditoria-2026-09-13.md');
ok('F2-O1 el hallazgo original sigue en la auditoría, tal cual',
  /## F2\. Ninguna ventana declara Content-Security-Policy — \[MEDIDO\]/.test(AUD)
  && /0 de 10 archivos HTML tienen/.test(AUD));
ok('F2-O2 F3 venía marcado \[LEÍDO\] (nunca se había reproducido)',
  /## F3\. Sin `setWindowOpenHandler` ni guardia de `will-navigate` — \[LEÍDO\]/.test(AUD));

// =============================================================================
seccion('F2-A. ¿HAY CSP? — POR META Y POR CABECERA');
// =============================================================================
let conCsp = 0;
for (const [nombre, rel] of VENTANAS) {
  const html = LEE(rel);
  const tiene = /http-equiv="Content-Security-Policy"/i.test(html);
  if (tiene) conCsp++;
  ok(`F2-A ${nombre}: sin <meta> CSP`, !tiene);
}
ok('F2-A11 son las 10 ventanas, ninguna con CSP (igual que el hallazgo original)',
  conCsp === 0 && VENTANAS.length === 10, `con CSP: ${conCsp} de ${VENTANAS.length}`);
// La otra vía posible: cabecera desde el proceso principal.
ok('F2-A12 tampoco se pone CSP por cabecera (sin webRequest/onHeadersReceived)',
  cuenta(MAIN, /onHeadersReceived/g) === 0 && cuenta(MAIN, /webRequest/g) === 0
  && cuenta(MAIN, /Content-Security/g) === 0);
nota('Comprobado por las DOS vías: ni <meta> en las plantillas ni cabecera en main.js.');

// =============================================================================
seccion('F2-B. DE QUÉ DEPENDE HOY CADA VENTANA (lo que condicionaría la CSP)');
// =============================================================================
const dep = {};
for (const [nombre, rel] of VENTANAS) {
  const html = LEE(rel);
  dep[nombre] = {
    scriptsInline: cuenta(html, /<script(?![^>]*\ssrc=)[^>]*>/g),
    scriptsSrc: cuenta(html, /<script[^>]*\ssrc=/g),
    styleTag: cuenta(html, /<style/g),
    styleAttr: cuenta(html, /\sstyle="/g),
    externos: cuenta(html, /(?:src|href)="https?:\/\//g),
    blob: cuenta(html, /URL\.createObjectURL/g),
    worker: cuenta(html, /new Worker|workerSrc/g),
  };
}
console.log('        ' + JSON.stringify(dep, null, 0).slice(0, 400));
for (const [nombre] of VENTANAS) {
  ok(`F2-B ${nombre}: cero recursos externos http(s)`, dep[nombre].externos === 0, String(dep[nombre].externos));
}
const conInline = VENTANAS.filter(([n]) => dep[n].scriptsInline > 0).map(([n]) => n);
ok('F2-B11 7 de las 10 ventanas tienen <script> EN LÍNEA (por eso haría falta unsafe-inline)',
  conInline.length === 7, `${conInline.length}: ${JSON.stringify(conInline)}`);
const conStyle = VENTANAS.filter(([n]) => dep[n].styleTag > 0 || dep[n].styleAttr > 0).map(([n]) => n);
ok('F2-B12 9 de las 10 tienen estilos en línea (<style> o style="")',
  conStyle.length === 9, `${conStyle.length}: ${JSON.stringify(conStyle)}`);
ok('F2-B13 el único Worker del producto es el de pdf.js, en Preparación',
  dep.preparacion.worker === 1 && VENTANAS.filter(([n]) => dep[n].worker > 0).length === 1);
ok('F2-B14 `blob:` solo se usa para DESCARGAR (createObjectURL + <a download>), en 4 ventanas',
  VENTANAS.filter(([n]) => dep[n].blob > 0).length === 4);

// =============================================================================
seccion('F2-C. eval / new Function: EN EL PRODUCTO NO; EN VENDOR SÍ');
// =============================================================================
const PRODUCTIVOS = ['main.js', 'db.js', 'security.js', 'preload.js', 'preload-launcher.js',
  'launcher/renderer.js', 'security-window/renderer.js', 'backup-picker/renderer.js'].concat(VENTANAS.map(([, r]) => r));
let evalProducto = 0;
for (const rel of PRODUCTIVOS) {
  const t = soloCodigo(LEE(rel));
  evalProducto += cuenta(t, /(?<![\w.])eval\s*\(/g) + cuenta(t, /new Function\s*\(/g);
}
ok('F2-C1 el código PROPIO no usa eval ni new Function (coincide con F5 de la auditoría)',
  evalProducto === 0, String(evalProducto));
const VENDOR = ['vendor/mammoth.browser.min.js', 'vendor/pdf.min.js', 'vendor/pdf.worker.min.js',
  'vendor/xlsx.full.min.js', 'vendor/pptxgen.bundle.js', 'vendor/theme.js', 'vendor/modal.js',
  'vendor/service-status.js'];
const vendorEval = {};
for (const rel of VENDOR) {
  const t = LEE(rel);
  vendorEval[path.basename(rel)] = cuenta(t, /(?<![\w.])eval\s*\(/g) + cuenta(t, /new Function\s*\(/g);
}
console.log('        vendor: ' + JSON.stringify(vendorEval));
ok('F2-C2 mammoth y pdf.js SÍ contienen new Function/eval (son los de la importación de actas)',
  vendorEval['mammoth.browser.min.js'] > 0 && vendorEval['pdf.min.js'] > 0 && vendorEval['pdf.worker.min.js'] > 0);
ok('F2-C3 xlsx, pptx y los vendor propios NO los contienen',
  vendorEval['xlsx.full.min.js'] === 0 && vendorEval['pptxgen.bundle.js'] === 0
  && vendorEval['theme.js'] === 0 && vendorEval['modal.js'] === 0 && vendorEval['service-status.js'] === 0);
nota('Que la cadena APAREZCA no prueba que se EJECUTE: el arnés de Electron lo mide en marcha.');

// =============================================================================
seccion('F3-A. LA SUPERFICIE REAL DE APERTURA DE VENTANAS');
// =============================================================================
const TODOS = PRODUCTIVOS.concat(['launcher/renderer.js']);
let ventanaAbierta = 0;
for (const rel of TODOS) ventanaAbierta += cuenta(soloCodigo(LEE(rel)), /window\.open\s*\(/g);
ok('F3-A1 el producto NUNCA llama a window.open: la superficie de popups es toda no intencionada',
  ventanaAbierta === 0, String(ventanaAbierta));
let blanks = [];
for (const [nombre, rel] of VENTANAS) {
  const n = cuenta(LEE(rel), /target="_blank"/g);
  if (n) blanks.push([nombre, n]);
}
ok('F3-A2 solo hay UN target="_blank": el enlace de un entregable, en el dashboard',
  blanks.length === 1 && blanks[0][0] === 'dashboard' && blanks[0][1] === 1, JSON.stringify(blanks));
const DASH = LEE('dashboard/plantilla_dashboard.html', 'PANORAMA_DASHBOARD');
ok('F3-A3 ese enlace exige http(s) y lleva rel="noopener" (y desde F1, escapeAttr)',
  /\/\^https\?:\\\/\\\/\/i\.test\(e\.ruta\)/.test(DASH)
  && /target="_blank" rel="noopener"/.test(DASH)
  && /href="\$\{escapeAttr\(e\.ruta\)\}"/.test(DASH));
nota('Es dato del usuario: la RUTA de un entregable. No es constante, pero sí está acotada a http(s).');
ok('F3-A4 no se usa shell.openExternal en ningún sitio', cuenta(soloCodigo(MAIN), /shell\.openExternal/g) === 0);
// Ojo al contar: hay 4 menciones de `shell.openPath` en main.js — 1 en un
// comentario, 1 dentro del texto de un console.warn, y 2 LLAMADAS reales.
ok('F3-A5 lo que sí se usa es shell.openPath, para abrir carpetas/archivos LOCALES (2 llamadas)',
  cuenta(soloCodigo(MAIN), /shell\.openPath\(/g) === 2, String(cuenta(soloCodigo(MAIN), /shell\.openPath\(/g)));

// =============================================================================
seccion('F3-B. NINGÚN GUARDIÁN DE APERTURA NI DE NAVEGACIÓN');
// =============================================================================
for (const [que, re] of [['setWindowOpenHandler', /setWindowOpenHandler/g], ['will-navigate', /will-navigate/g],
  ['will-redirect', /will-redirect/g], ['will-attach-webview', /will-attach-webview/g],
  ["'new-window' (legado)", /'new-window'/g]]) {
  ok(`F3-B ${que}: no existe en main.js`, cuenta(MAIN, re) === 0, String(cuenta(MAIN, re)));
}
ok('F3-B6 y hay 10 `new BrowserWindow` productivas, ninguna con guardián',
  cuenta(MAIN, /new BrowserWindow/g) === 10, String(cuenta(MAIN, /new BrowserWindow/g)));

// =============================================================================
seccion('F2/F3-Z. ALCANCE Y ESTADO');
// =============================================================================
ok('F2/F3-Z1 F1 está CERRADO (esta ronda no lo reabre)', /\| \*\*F1\*\* \| \*\*CERRADO\*\*/.test(AUD));
ok('F2/F3-Z2 F2 y F3 siguen PENDIENTES en la tabla de la auditoría',
  /\| \*\*F2\*\* \| \*\*PENDIENTE\*\*/.test(AUD) && /\| \*\*F3\*\* \| \*\*PENDIENTE\*\*/.test(AUD));
ok('F2/F3-Z3 esta ronda no toca producción: main.js no declara CSP ni handlers',
  cuenta(MAIN, /setWindowOpenHandler|Content-Security/g) === 0);

console.log('\n======================================================================');
console.log(`  F2/F3: ${pass} OK / ${fail} FALLOS`);
console.log('======================================================================');
if (fail) { console.log('  Fallos:'); fallos.forEach((f) => console.log('   · ' + f)); process.exit(1); }
console.log('  Batería DESCRIPTIVA: da verde porque describe lo que HAY.');
console.log('  F2 y F3 están DIAGNOSTICADOS, no implementados.');
