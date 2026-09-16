'use strict';
// ---------------------------------------------------------------------------
// Prueba de integridad de ERROR_CODES (higiene/UX, no reabre el Bloque 2).
//
// Comprueba, sobre el TEXTO REAL de main.js:
//   1. todo codigo usado literalmente en errorCodeSuffix('PS-xxxx') existe
//      como clave en ERROR_CODES;
//   2. todo codigo escrito literalmente en un appLog('ERROR PS-xxxx ...')
//      tambien existe (esos son los que acaban en app.log);
//   3. PS-1016, PS-1017, PS-1018 y PS-1019 existen y tienen titulo y
//      explicacion no vacios;
//   4. no hay claves duplicadas en el objeto;
//   5. toda entrada de ERROR_CODES tiene titulo + explicacion (string).
//
// No abre la app, no toca datos: solo lee el archivo fuente.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const MAIN = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1\\main.js';
const SRC = fs.readFileSync(MAIN, 'utf8');

let okCount = 0;
let failCount = 0;
function ok(nombre, cond, detalle) {
  if (cond) { okCount++; console.log('  OK   ' + nombre); }
  else { failCount++; console.log('  FALLO ' + nombre + (detalle ? '  [' + detalle + ']' : '')); }
}

// --- extraer el bloque const ERROR_CODES = { ... }; --------------------------
const ini = SRC.indexOf('const ERROR_CODES = {');
if (ini < 0) { console.log('NO SE ENCONTRO const ERROR_CODES'); process.exit(1); }
// cierre: la primera linea que es exactamente "};" a nivel 0
let i = SRC.indexOf('{', ini);
let nivel = 0, fin = -1;
for (let p = i; p < SRC.length; p++) {
  const c = SRC[p];
  if (c === '{') nivel++;
  else if (c === '}') { nivel--; if (nivel === 0) { fin = p; break; } }
}
if (fin < 0) { console.log('NO SE PUDO CERRAR EL BLOQUE ERROR_CODES'); process.exit(1); }
const BLOQUE = SRC.slice(ini, fin + 1);

// claves declaradas
const declaradas = [];
const reClave = /^\s{2}'(PS-\d{4})':\s*\{/gm;
let m;
while ((m = reClave.exec(BLOQUE)) !== null) declaradas.push(m[1]);
const setDeclaradas = new Set(declaradas);

console.log('');
console.log('=== INTEGRIDAD DE ERROR_CODES ===============================');
console.log('codigos declarados: ' + declaradas.length + ' -> ' + declaradas.join(', '));
console.log('');

// --- 4. sin duplicados -------------------------------------------------------
ok('no hay claves duplicadas en ERROR_CODES',
  setDeclaradas.size === declaradas.length,
  declaradas.length + ' entradas / ' + setDeclaradas.size + ' claves distintas');

// --- 5. toda entrada tiene titulo + explicacion -------------------------------
{
  let malas = [];
  declaradas.forEach((code) => {
    const desde = BLOQUE.indexOf("  '" + code + "': {");
    const hasta = BLOQUE.indexOf("\n  },", desde);
    const cuerpo = BLOQUE.slice(desde, hasta < 0 ? BLOQUE.length : hasta);
    const tieneTitulo = /titulo:\s*'[^']+'/.test(cuerpo);
    const tieneExpl = /explicacion:\s*\n?\s*'/.test(cuerpo);
    if (!tieneTitulo || !tieneExpl) malas.push(code + (tieneTitulo ? '' : ' sin titulo') + (tieneExpl ? '' : ' sin explicacion'));
  });
  ok('toda entrada tiene titulo y explicacion', malas.length === 0, malas.join('; '));
}

// --- 1. errorCodeSuffix('PS-xxxx') -------------------------------------------
const usadosSuffix = new Set();
const reSuffix = /errorCodeSuffix\(\s*'(PS-\d{4})'\s*\)/g;
while ((m = reSuffix.exec(SRC)) !== null) usadosSuffix.add(m[1]);
const listaSuffix = Array.from(usadosSuffix).sort();
console.log('codigos usados en errorCodeSuffix(): ' + listaSuffix.length + ' -> ' + listaSuffix.join(', '));
console.log('');
{
  const faltan = listaSuffix.filter((c) => !setDeclaradas.has(c));
  ok('TODOS los codigos de errorCodeSuffix() existen en ERROR_CODES',
    faltan.length === 0, 'faltan: ' + faltan.join(', '));
  // y uno a uno, para que el fallo diga CUAL
  listaSuffix.forEach((c) => {
    ok('   errorCodeSuffix(\'' + c + '\') tiene entrada', setDeclaradas.has(c));
  });
}

// --- 2. appLog('ERROR PS-xxxx') ----------------------------------------------
const usadosLog = new Set();
const reLog = /ERROR (PS-\d{4})/g;
while ((m = reLog.exec(SRC)) !== null) usadosLog.add(m[1]);
{
  const lista = Array.from(usadosLog).sort();
  const faltan = lista.filter((c) => !setDeclaradas.has(c));
  ok('TODOS los codigos escritos como "ERROR PS-xxxx" existen en ERROR_CODES',
    faltan.length === 0, 'faltan: ' + faltan.join(', '));
}

// --- 3. los cuatro del wiring A3.3 -------------------------------------------
console.log('');
['PS-1016', 'PS-1017', 'PS-1018', 'PS-1019'].forEach((c) => {
  ok(c + ' existe en ERROR_CODES', setDeclaradas.has(c));
  const desde = BLOQUE.indexOf("  '" + c + "': {");
  const hasta = BLOQUE.indexOf("\n  },", desde);
  const cuerpo = desde >= 0 ? BLOQUE.slice(desde, hasta < 0 ? BLOQUE.length : hasta) : '';
  const mt = cuerpo.match(/titulo:\s*'([^']+)'/);
  ok('   ' + c + ' tiene titulo no vacio', !!(mt && mt[1].trim().length > 10), mt ? mt[1] : '(sin titulo)');
  const cuantosTrozos = (cuerpo.match(/'/g) || []).length;
  ok('   ' + c + ' tiene explicacion', /explicacion:/.test(cuerpo) && cuantosTrozos > 4);
  ok('   ' + c + ' se USA de verdad en el wiring', usadosSuffix.has(c));
});

// --- el listado de "Ver codigos de error" los incluira ------------------------
console.log('');
{
  // showErrorCodesDialog() recorre Object.keys(ERROR_CODES).sort()
  ok('showErrorCodesDialog() sigue listando TODO ERROR_CODES',
    /Object\.keys\(ERROR_CODES\)\s*\n?\s*\.sort\(\)/.test(SRC));
  const orden = declaradas.slice().sort();
  ok('los cuatro nuevos saldran entre PS-1015 y PS-2001',
    orden.indexOf('PS-1016') === orden.indexOf('PS-1015') + 1 &&
    orden.indexOf('PS-1019') + 1 === orden.indexOf('PS-2001'),
    orden.join(','));
}

// --- el codigo del dashboard (otra fuente de verdad) -------------------------
{
  const HTML = path.join(path.dirname(MAIN), 'dashboard', 'plantilla_dashboard.html');
  if (fs.existsSync(HTML)) {
    const h = fs.readFileSync(HTML, 'utf8');
    const usados = new Set();
    let mm; const re = /(PS-\d{4})/g;
    while ((mm = re.exec(h)) !== null) usados.add(mm[1]);
    const faltan = Array.from(usados).filter((c) => !setDeclaradas.has(c));
    ok('los codigos PS del dashboard tambien existen en ERROR_CODES',
      faltan.length === 0, 'faltan: ' + faltan.join(', '));
  }
}

console.log('');
console.log('=============================================================');
console.log('ERROR_CODES: ' + okCount + ' OK, ' + failCount + ' FALLOS');
console.log('=============================================================');
process.exit(failCount === 0 ? 0 : 1);
