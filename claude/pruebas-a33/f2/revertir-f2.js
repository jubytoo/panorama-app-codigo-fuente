'use strict';
// ---------------------------------------------------------------------------
// F2 — REVERSIONES. Cada familia deshace UNA decisión de F2 y anuncia qué
// aserciones de `test-f2.js` tiene que tumbar (y solo esas). Las de main.js
// A, B y F se arrancan además en Electron (`electron-f2-revertido.ps1`).
//
// Escribe las copias en `f2/revertidos/`. NO toca producción.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const SALIDA = path.join(__dirname, 'revertidos');
const MAIN = fs.readFileSync(path.join(PROJ, 'main.js'), 'utf8');
const PREP = fs.readFileSync(path.join(PROJ, 'preparacion-reunion', 'plantilla_preparacion_reunion.html'), 'utf8');

// Sustituye TODAS las apariciones de una cadena (y exige que haya alguna).
function cambiar(src, busca, pone, veces) {
  const n = src.split(busca).length - 1;
  if (n === 0) throw new Error('NO SE ENCONTRO: ' + busca.slice(0, 80));
  if (veces !== undefined && n !== veces) throw new Error(`se esperaban ${veces} apariciones y hay ${n}: ${busca.slice(0, 60)}`);
  return src.split(busca).join(pone);
}

const FAMILIAS = [
  {
    id: 'A-sin-csp', archivo: 'main.js',
    que: 'se quita el enganche de la CSP: ninguna ventana la recibe',
    tumba: [/^F2-H9 /, /^F2-H10 /],
    hacer: () => cambiar(MAIN, "\napp.on('session-created', instalarCspEnSesion);\n", '\n// REVERSIÓN F2-A: sin enganche de CSP.\n', 1),
  },
  {
    id: 'B-unsafe-eval', archivo: 'main.js',
    que: "se añade 'unsafe-eval' a todos los script-src",
    tumba: [/^F2-2 /, /^F2-2b /, /^F2-P2 «(sinScriptEnLinea|interfaz|lectorDeActas)»/, /^F2-P12 /, /^F2-H2 /, /^F2-H2b /],
    hacer: () => cambiar(cambiar(MAIN, `"script-src 'self' 'unsafe-inline'",`, `"script-src 'self' 'unsafe-inline' 'unsafe-eval'",`, 2),
      `"script-src 'self'",`, `"script-src 'self' 'unsafe-eval'",`, 1),
  },
  {
    id: 'C-red-abierta', archivo: 'main.js',
    que: 'connect-src deja de ser none (comodín)',
    tumba: [/^F2-P2 «(sinScriptEnLinea|interfaz|lectorDeActas)»/, /^F2-P5 /, /^F2-P6 /, /^F2-H2 /, /^F2-H2b /],
    hacer: () => cambiar(MAIN, `"connect-src 'none'",`, `'connect-src *',`, 1),
  },
  {
    id: 'D-lanzador-con-inline', archivo: 'main.js',
    que: "el lanzador y la splash vuelven a recibir 'unsafe-inline' en script-src",
    tumba: [/^F2-P2 «sinScriptEnLinea»/, /^F2-P10 /, /^F2-P12 /, /^F2-H2 /, /^F2-H2b /],
    hacer: () => cambiar(MAIN, `"script-src 'self'",`, `"script-src 'self' 'unsafe-inline'",`, 1),
  },
  {
    id: 'E-worker-desde-file', archivo: 'main.js',
    que: "Preparación con worker-src 'self' (Workers file:, que NO heredan la CSP)",
    tumba: [/^F2-P2 «lectorDeActas»/, /^F2-P9 /, /^F2-P13 /],
    hacer: () => cambiar(MAIN, `'worker-src blob:',`, `"worker-src 'self'",`, 1),
  },
  {
    id: 'F-worker-none', archivo: 'main.js',
    que: "Preparación con worker-src 'none' (control de compatibilidad: pdf.js cae al fake worker)",
    tumba: [/^F2-P2 «lectorDeActas»/, /^F2-P9 /, /^F2-P13 /],
    hacer: () => cambiar(MAIN, `'worker-src blob:',`, `"worker-src 'none'",`, 1),
  },
  {
    id: 'G-mapa-abierto', archivo: 'main.js',
    que: 'un documento que no está en la tabla recibe «interfaz» en vez de «cerrado»',
    tumba: [/^F2-M .* → «cerrado»$/, /^F2-H5 /],
    hacer: () => cambiar(MAIN,
      "  if (/^\\d+[\\\\/]dashboard\\.html$/.test(path.relative(proyectos, ruta))) return 'interfaz';\n  return 'cerrado';",
      "  if (/^\\d+[\\\\/]dashboard\\.html$/.test(path.relative(proyectos, ruta))) return 'interfaz';\n  return 'interfaz'; // REVERSIÓN F2-G",
      1),
  },
  {
    id: 'H-sin-arranque-blob', archivo: 'preparacion',
    que: 'extractPdf deja de arrancar el Worker por blob:',
    tumba: [/^F2-W1 /],
    hacer: () => cambiar(PREP,
      "  if(!window.pdfjsLib.GlobalWorkerOptions.workerPort){\n    const w = await arrancarWorkerPdf();\n    if(w) window.pdfjsLib.GlobalWorkerOptions.workerPort = w;\n  }\n",
      '  // REVERSIÓN F2-H: sin arranque por blob:\n', 1),
  },
  {
    id: 'I-meta-ademas', archivo: 'preparacion',
    que: 'una plantilla declara TAMBIÉN su propia CSP en <meta> (dos fuentes)',
    tumba: [/^F2-I0 /],
    hacer: () => cambiar(PREP, '<meta charset="UTF-8">', `<meta charset="UTF-8">\n<meta http-equiv="Content-Security-Policy" content="default-src 'self'">`, 1),
  },
  {
    id: 'J-fetch-en-ventana', archivo: 'preparacion',
    que: 'una ventana empieza a usar fetch (connect-src none ya no se sostendría)',
    tumba: [/^F2-I3 /],
    hacer: () => cambiar(PREP, 'async function extractDocx(file){', "async function extractDocx(file){\n  await fetch('../vendor/mammoth.browser.min.js'); // REVERSIÓN F2-J", 1),
  },
];

if (require.main === module) {
  fs.mkdirSync(SALIDA, { recursive: true });
  for (const fam of FAMILIAS) {
    const texto = fam.hacer();
    const nombre = fam.archivo === 'main.js' ? 'main.js' : 'plantilla_preparacion_reunion.html';
    const dir = path.join(SALIDA, fam.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, nombre), texto, 'utf8');
    console.log(`  ${fam.id.padEnd(24)} -> revertidos/${fam.id}/${nombre}   (${fam.que})`);
  }
  console.log(`\n  ${FAMILIAS.length} reversiones generadas. Producción NO se ha tocado.`);
}
module.exports = { FAMILIAS, SALIDA };
