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
// Antes de F3 no se usaba en ningún sitio: los enlaces se abrían DENTRO de la
// app. Desde F3 se usa exactamente en un punto, el de la política.
ok('F3-A4 [EXIGE] shell.openExternal se usa en UN solo punto: el de la política',
  cuenta(soloCodigo(MAIN), /shell\.openExternal\(/g) === 1
  && /function abrirEnNavegador\(u, origen\)/.test(MAIN), String(cuenta(soloCodigo(MAIN), /shell\.openExternal\(/g)));
// Ojo al contar: hay 4 menciones de `shell.openPath` en main.js — 1 en un
// comentario, 1 dentro del texto de un console.warn, y 2 LLAMADAS reales.
ok('F3-A5 lo que sí se usa es shell.openPath, para abrir carpetas/archivos LOCALES (2 llamadas)',
  cuenta(soloCodigo(MAIN), /shell\.openPath\(/g) === 2, String(cuenta(soloCodigo(MAIN), /shell\.openPath\(/g)));

// =============================================================================
seccion('F3-B. LA POLÍTICA DE APERTURA Y NAVEGACIÓN (implementada el 17 sept 2026)');
// =============================================================================
// Un solo helper: `setWindowOpenHandler` aparece 2 veces —la guarda que
// comprueba que el webContents trae la API, y la llamada real— y `will-navigate`
// una sola. Lo que se custodia es que NO haya lógica repetida por ventana.
ok('F3-B1 [EXIGE] existe UN helper común, no lógica repetida en diez sitios',
  /function aplicarPoliticaDeNavegacion\(wc, etiqueta\)/.test(MAIN)
  && cuenta(MAIN, /wc\.setWindowOpenHandler\(/g) === 1 && cuenta(MAIN, /'will-navigate'/g) === 1);
ok('F3-B2 [EXIGE] la ventana hija se DENIEGA siempre (el producto no usa popups propios)',
  /return \{ action: 'deny' \};/.test(MAIN));
ok('F3-B3 [EXIGE] la URL se valida con `new URL`, no con startsWith ni regex laxa',
  /function urlExternaPermitida\(url\)/.test(MAIN) && /new URL\(String\(url\)\)/.test(MAIN)
  && /u\.protocol === 'http:' \|\| u\.protocol === 'https:'/.test(MAIN)
  && !/startsWith\('http/.test(MAIN));
ok('F3-B4 [EXIGE] si el parseo falla se devuelve null: no se intenta "arreglar" la URL',
  /catch \(e\) \{\s*return null;\s*\}/.test(MAIN));
ok('F3-B5 [EXIGE] shell.openExternal se envuelve y su rechazo se captura (nada sin manejar)',
  /Promise\.resolve\(shell\.openExternal\(u\.href\)\)\.catch/.test(MAIN));
ok('F3-B6 [EXIGE] el rastro no imprime la URL entera: solo esquema y host',
  /function urlParaRastro\(u\)/.test(MAIN) && /u\.protocol \+ '\/\/' \+ \(u\.host/.test(MAIN)
  && !/openExternal[\s\S]{0,200}appLog\([^)]*u\.href/.test(MAIN));
ok('F3-B7 [EXIGE] la política se aplica a las 10 BrowserWindow productivas',
  cuenta(MAIN, /aplicarPoliticaDeNavegacion\([^,]+, '[a-z-]+'\)/g) === 10,
  String(cuenta(MAIN, /aplicarPoliticaDeNavegacion\([^,]+, '[a-z-]+'\)/g)));
ok('F3-B8 [CUSTODIA] sigue sin usarse `will-attach-webview` ni el `new-window` legado',
  cuenta(MAIN, /will-attach-webview/g) === 0 && cuenta(MAIN, /'new-window'/g) === 0);
// La guardia de navegación NO puede romper lo que el producto sí usa. Se
// comprobó antes de ponerla: solo `location.reload()` y las descargas `blob:`.
ok('F3-B9 [EXIGE] la navegación interna legítima se preserva (recarga, ancla y blob:)',
  /function navegacionInternaLegitima\(destino, actual\)/.test(MAIN)
  && /if \(destino === actual\) return true;/.test(MAIN)
  && /d\.protocol === 'blob:'/.test(MAIN)
  && /d\.pathname === a\.pathname/.test(MAIN));
ok('F3-B10 [CUSTODIA] siguen siendo 10 `new BrowserWindow`',
  cuenta(MAIN, /new BrowserWindow/g) === 10, String(cuenta(MAIN, /new BrowserWindow/g)));

// La política, EJECUTADA: se extrae el validador real y se prueban los esquemas.
const POL = new Function('return (' + (MAIN.match(/function urlExternaPermitida\(url\) \{[\s\S]*?\n\}/) || [''])[0] + ')')();
const DENEGADOS = ['about:blank', 'file:///C:/x.html', 'data:text/html,<b>x', 'javascript:alert(1)',
  'chrome://settings', 'inventado://x', 'ftp://host/f', '', 'no-es-una-url', 'http://', '//sin-esquema/x'];
for (const u of DENEGADOS) ok(`F3-B ${JSON.stringify(u).slice(0, 34)} NO se considera externo permitido`, POL(u) === null, String(POL(u)));
for (const u of ['http://ejemplo.test/x', 'https://ejemplo.test/x?q=1#a']) {
  ok(`F3-B ${u} SÍ se acepta como externo`, POL(u) !== null && /^https?:$/.test(POL(u).protocol));
}

// =============================================================================
seccion('F2/F3-Z. ALCANCE Y ESTADO');
// =============================================================================
ok('F2/F3-Z1 F1 está CERRADO (esta ronda no lo reabre)', /\| \*\*F1\*\* \| \*\*CERRADO\*\*/.test(AUD));
// Tras esta ronda los dos pasan de «PENDIENTE» a «ABIERTO — DIAGNOSTICADO»:
// siguen SIN implementar, que es lo que custodia esta aserción.
ok('F2/F3-Z2 F3 CERRADO y F2 ABIERTO (diagnosticado, es la siguiente ronda)',
  /\| \*\*F2\*\* \| \*\*ABIERTO — DIAGNOSTICADO\*\*/.test(AUD)
  && /\| \*\*F3\*\* \| \*\*CERRADO\*\*/.test(AUD));
ok('F2/F3-Z3 F2 NO se ha implementado: main.js sigue sin declarar CSP',
  cuenta(MAIN, /Content-Security/g) === 0);
ok('F2/F3-Z4 …y las 10 ventanas siguen sin <meta> CSP (F2 intacto)', conCsp === 0);

console.log('\n======================================================================');
console.log(`  F2/F3: ${pass} OK / ${fail} FALLOS`);
console.log('======================================================================');
if (fail) { console.log('  Fallos:'); fallos.forEach((f) => console.log('   · ' + f)); process.exit(1); }
console.log('  Batería DESCRIPTIVA: da verde porque describe lo que HAY.');
console.log('  F2 y F3 están DIAGNOSTICADOS, no implementados.');
