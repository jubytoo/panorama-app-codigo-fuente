'use strict';
// ---------------------------------------------------------------------------
// P17 — EL ICONO DE LA BARRA DE TÍTULO SE QUEDA SIN RESOLVER EN EL HORNEADO.
//
// Batería EXIGENTE desde el 17 sept 2026: ya no describe el defecto, exige la
// corrección. Si alguien vuelve a `String.replace(cadena, cadena)`, esto se
// pone rojo (lo comprueba `comprobar-reversiones-p17.js`).
//
// El defecto, en una línea: `fixVendorScriptPaths()` (main.js) reescribe las
// rutas relativas de la plantilla a rutas absolutas `file://` usando
// `String.replace(cadena, cadena)`, que **sustituye solo la PRIMERA
// coincidencia**. Ocho de los nueve patrones aparecen una sola vez, así que no
// se nota. El noveno, `src="../assets/icon-256.png"`, aparece **DOS** veces
// —pantalla de carga y barra de título—, y la segunda se queda con la ruta
// relativa: desde `projects/<id>/dashboard.html` no resuelve y el icono sale
// roto. Pasa igual en el Directorio de Talento, que usa la misma función.
//
// Es anterior a F1 y F1 no toca esas líneas (ver pendientes-abiertos.md §P17).
//
// Se ejecuta la función REAL extraída de main.js por firma, con dobles de
// `path`/`pathToFileURL`, contra las DOS plantillas productivas.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const LEE = (rel, env) => fs.readFileSync(process.env[env] || path.join(PROJ, rel), 'utf8');
const MAIN = LEE('main.js', 'PANORAMA_MAIN');
const DASH = LEE('dashboard/plantilla_dashboard.html', 'PANORAMA_DASHBOARD');
const DIRE = LEE('directorio/plantilla_directorio.html', 'PANORAMA_DIRECTORIO');

let pass = 0, fail = 0; const fallos = [];
function ok(n, c, extra) {
  if (c) { pass++; console.log('  OK    ' + n); }
  else { fail++; fallos.push(n); console.log('  FALLO ' + n + (extra === undefined ? '' : '  -- ' + extra)); }
}
function seccion(t) { console.log('\n=== ' + t + ' ==='); }
function nota(s) { console.log('        ' + s); }
const cuenta = (s, sub) => s.split(sub).length - 1;

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

// La función REAL, con dobles: __dirname fijo y un pathToFileURL de mentira que
// produce URLs reconocibles y sin sorpresas de plataforma.
const RAIZ = 'C:/app';
function construir(pathToFileURL) {
  // APP_ICON_PATH es una constante de módulo de main.js (`main.js:1623`), no un
  // parámetro: se reproduce igual que allí para que la función corra tal cual.
  return new Function('__dirname', 'path', 'pathToFileURL', 'APP_ICON_PATH',
    extraerDe(MAIN, 'function fixVendorScriptPaths(html)') + '\nreturn fixVendorScriptPaths;')(
    RAIZ, { join: (...p) => p.join('/') }, pathToFileURL, RAIZ + '/assets/icon-256.png');
}
const urlNormal = (p) => ({ href: 'file:///' + String(p).replace(/^\/+/, '') });
const fix = construir(urlNormal);

// Los nueve patrones que la función reescribe hoy, en su orden real.
const PATRONES = [
  ['service-status', '<script src="../vendor/service-status.js"></script>'],
  ['xlsx', '<script src="../vendor/xlsx.full.min.js"></script>'],
  ['pptx', '<script src="../vendor/pptxgen.bundle.js"></script>'],
  ['icono', 'src="../assets/icon-256.png"'],
  ['fonts', '<link rel="stylesheet" href="../vendor/fonts/fonts.css">'],
  ['theme', '<script src="../vendor/theme.js"></script>'],
  ['motion', '<link rel="stylesheet" href="../vendor/motion.css">'],
  ['modal', '<script src="../vendor/modal.js"></script>'],
  ['window-chrome', '<link rel="stylesheet" href="../vendor/window-chrome.css">'],
];

// =============================================================================
seccion('P17-A. CUÁNTAS VECES APARECE CADA ASSET EN LA PLANTILLA');
// =============================================================================
for (const [plantilla, src] of [['dashboard', DASH], ['directorio', DIRE]]) {
  for (const [nombre, patron] of PATRONES) {
    const n = cuenta(src, patron);
    // Solo el icono aparece más de una vez. Eso es LO QUE HAY.
    const esperado = nombre === 'icono' ? 2 : (n === 0 ? 0 : 1);
    ok(`P17-A ${plantilla}.${nombre}: ${n} ocurrencia(s)`, n === esperado, `real ${n}, esperado ${esperado}`);
  }
}
nota('Ocho de los nueve patrones aparecen 0 o 1 vez: para ellos, sustituir solo la primera da igual.');
nota('El icono aparece DOS veces en las DOS plantillas: pantalla de carga (#boot-loading) y barra de título.');

// =============================================================================
seccion('P17-B. CÓMO ACTÚA HOY fixVendorScriptPaths()');
// =============================================================================
const CUERPO = extraerDe(MAIN, 'function fixVendorScriptPaths(html)');
ok('P17-B1 [EXIGE] los nueve assets se sustituyen con UN SOLO patrón compartido',
  /const ASSETS = \[/.test(CUERPO) && /for \(const \[busca, pone\] of ASSETS\)/.test(CUERPO));
ok('P17-B2 [EXIGE] el reemplazo es GLOBAL (expresión regular construida con la bandera g)',
  /new RegExp\([\s\S]*,\s*'g'\)/.test(CUERPO) && /\.replace\(new RegExp\(/.test(CUERPO));
ok('P17-B3 [EXIGE] el reemplazo se pasa como FUNCIÓN (así `$&`/`$\'` no tienen semántica)',
  /\)\s*,\s*\(\)\s*=>\s*pone\s*\)/.test(CUERPO));
ok('P17-B4 [EXIGE] ya no queda ningún .replace(cadena, cadena) en la función',
  cuenta(CUERPO, ".replace('") === 0, String(cuenta(CUERPO, ".replace('")));
ok('P17-B5 [CUSTODIA] siguen estando los NUEVE patrones, ni uno menos',
  PATRONES.every(([, p]) => CUERPO.includes(p)),
  JSON.stringify(PATRONES.filter(([, p]) => !CUERPO.includes(p)).map(([n]) => n)));

// =============================================================================
seccion('P17-C. EL HORNEADO REAL: CERO RUTAS RELATIVAS SIN RESOLVER');
// =============================================================================
for (const [plantilla, src] of [['dashboard', DASH], ['directorio', DIRE]]) {
  const horneado = fix(src);
  const restos = cuenta(horneado, 'src="../assets/icon-256.png"');
  ok(`P17-C ${plantilla} [EXIGE]: tras hornear NO queda ningún icono con ruta relativa`, restos === 0, String(restos));
  ok(`P17-C ${plantilla} [EXIGE]: se resuelven LAS DOS ocurrencias del icono`,
    cuenta(horneado, 'src="file:///C:/app/assets/icon-256.png"') === 2,
    String(cuenta(horneado, 'src="file:///C:/app/assets/icon-256.png"')));
  // El resto de assets: CERO restos relativos (custodia de los otros ocho).
  const otros = PATRONES.filter(([n]) => n !== 'icono')
    .map(([n, p]) => [n, cuenta(horneado, p)]).filter(([, c]) => c > 0);
  ok(`P17-C ${plantilla}: NINGÚN otro asset queda sin resolver`, otros.length === 0, JSON.stringify(otros));
}

// =============================================================================
seccion('P17-D. NO HAY MÁS ASSETS RELATIVOS FUERA DE LA LISTA');
// =============================================================================
for (const [plantilla, src] of [['dashboard', DASH], ['directorio', DIRE]]) {
  const horneado = fix(src);
  // Se ignoran las menciones dentro de comentarios HTML (documentación).
  const sinComentarios = horneado.replace(/<!--[\s\S]*?-->/g, ' ');
  const sueltos = (sinComentarios.match(/(?:src|href)="\.\.\/(?:vendor|assets)\/[^"]+"/g) || []);
  ok(`P17-D ${plantilla} [EXIGE]: no sobrevive NINGUNA ruta relativa al horneado`, sueltos.length === 0,
    JSON.stringify(sueltos.slice(0, 6)));
}

// =============================================================================
seccion('P17-E. EQUIVALENCIA BYTE A BYTE: SOLO CAMBIAN LOS ASSETS');
// =============================================================================
// Se deshacen las nueve sustituciones sobre el horneado y tiene que quedar la
// plantilla ORIGINAL, byte a byte. Eso demuestra que la función no ha tocado
// nada más: ni el seed, ni el markup, ni los estilos, ni los scripts.
const ICONO = 'src="../assets/icon-256.png"';
const ABS = 'src="file:///C:/app/assets/icon-256.png"';
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function deshacer(horneado, src) {
  let t = horneado;
  for (const [, patron] of PATRONES) {
    if (!src.includes(patron)) continue;
    // Se reconstruye el reemplazo que aplicó la función y se invierte.
    const abs = patron === ICONO ? ABS
      : patron.replace('../vendor/', 'file:///C:/app/vendor/').replace('../assets/', 'file:///C:/app/assets/');
    t = t.replace(new RegExp(escRe(abs), 'g'), () => patron);
  }
  return t;
}
for (const [plantilla, src] of [['dashboard', DASH], ['directorio', DIRE]]) {
  const horneado = fix(src);
  const revertido = deshacer(horneado, src);
  ok(`P17-E ${plantilla}: deshaciendo solo los assets se recupera la plantilla ORIGINAL byte a byte`,
    revertido === src, `longitudes ${revertido.length} vs ${src.length}`);
  ok(`P17-E ${plantilla}: el horneado no crece de forma anómala`,
    horneado.length < src.length + 3000 && horneado.length > src.length,
    `plantilla ${src.length} -> horneado ${horneado.length}`);
}

// =============================================================================
seccion('P17-F. CUSTODIA: LOS NUEVE ASSETS, Y NADA MÁS');
// =============================================================================
for (const [plantilla, src] of [['dashboard', DASH], ['directorio', DIRE]]) {
  const horneado = fix(src);
  for (const [nombre, patron] of PATRONES) {
    if (cuenta(src, patron) === 0) continue;
    const abs = patron === ICONO ? ABS
      : patron.replace('../vendor/', 'file:///C:/app/vendor/').replace('../assets/', 'file:///C:/app/assets/');
    ok(`P17-F ${plantilla}.${nombre}: resuelto (0 relativos, ${cuenta(src, patron)} absoluto/s)`,
      cuenta(horneado, patron) === 0 && cuenta(horneado, abs) === cuenta(src, patron),
      `relativos ${cuenta(horneado, patron)}, absolutos ${cuenta(horneado, abs)}`);
  }
  // El bloque del factory-seed no lo toca esta función en ningún caso.
  const seed = /<script type="application\/json" id="factory-seed">([\s\S]*?)<\/script>/;
  ok(`P17-F ${plantilla}: el factory-seed queda intacto (esta función no lo toca)`,
    !seed.test(src) || (seed.exec(src) || [])[1] === (seed.exec(horneado) || [])[1]);
  // Ni el markup, ni los estilos, ni el resto de scripts.
  ok(`P17-F ${plantilla}: mismo número de <script>, <style> y <link> que la plantilla`,
    cuenta(horneado, '<script') === cuenta(src, '<script')
    && cuenta(horneado, '<style') === cuenta(src, '<style')
    && cuenta(horneado, '<link') === cuenta(src, '<link'),
    JSON.stringify({ script: [cuenta(src, '<script'), cuenta(horneado, '<script')],
      style: [cuenta(src, '<style'), cuenta(horneado, '<style')],
      link: [cuenta(src, '<link'), cuenta(horneado, '<link')] }));
}

// =============================================================================
seccion('P17-G. RUTAS DE INSTALACION CON $: LA RUTA SE INSERTA LITERAL');
// =============================================================================
// Antes de P17 la URL se pasaba como CADENA de reemplazo, donde `$&`, "$`" y
// `$' tienen semantica. Con la FUNCION de reemplazo ya no la tienen. Se exige,
// para las cuatro secuencias: HTML de tamano razonable, cero duplicacion, cero
// coincidencias inesperadas, ruta LITERAL y todos los assets resueltos.
const relativos = (h) => (h.match(/(?:src|href)="\.\.\/(?:vendor|assets)\/[^"]+"/g) || []).length;
const horneaCon = (base) => construir((p) => ({ href: base + String(p).split('/').pop() }))(DASH);

const RAROS = [
  ['normal', 'file:///C:/app/vendor/'],
  ['$&', 'file:///C:/a$&b/'],
  ["$'", "file:///C:/a$'b/"],
  ['$`', 'file:///C:/a$`b/'],
  ['$1', 'file:///C:/a$1b/'],
];
for (const [nombre, base] of RAROS) {
  const html = horneaCon(base);
  ok(`P17-G ${nombre}: el HTML horneado mantiene un tamano razonable (no duplica la plantilla)`,
    html.length < DASH.length + 3000, `plantilla ${DASH.length} -> horneado ${html.length}`);
  ok(`P17-G ${nombre}: cero rutas relativas sin resolver`, relativos(html) === 0, String(relativos(html)));
  ok(`P17-G ${nombre}: la ruta se inserta LITERAL (theme.js y los DOS iconos con la base tal cual)`,
    html.includes(`<script src="${base}theme.js"></script>`)
    && cuenta(html, `src="${base}icon-256.png"`) === 2,
    `theme ${html.includes(`<script src="${base}theme.js"></script>`)}, iconos ${cuenta(html, `src="${base}icon-256.png"`)}`);
}
nota('Antes de P17, la secuencia dolar-comilla en la ruta inflaba el dashboard horneado de 373 KB a 189 MB, con 2210 rutas sin resolver.');


console.log('\n======================================================================');
console.log(`  P17: ${pass} OK / ${fail} FALLOS`);
console.log('======================================================================');
if (fail) { console.log('  Fallos:'); fallos.forEach((f) => console.log('   · ' + f)); process.exit(1); }
console.log('  Batería EXIGENTE: si alguien vuelve a String.replace(cadena, cadena), esto se pone rojo.');
