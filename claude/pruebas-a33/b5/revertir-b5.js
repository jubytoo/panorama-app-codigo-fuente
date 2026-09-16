'use strict';
// ---------------------------------------------------------------------------
// Reversión de B5, sobre el renderer PRODUCTIVO de la ventana de Seguridad.
//
//   T-sin-guarda : quita EXCLUSIVAMENTE la línea nueva de doSubmit().
//
// La batería debe volver a medir el defecto original, con sus mismos números:
//   2 Enter -> 2 IPC · 5 Enter -> 5 IPC · click + Enter -> 2 IPC
//
// No toca producción: lee el renderer real y escribe una copia.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const ORIG = process.env.PANORAMA_SECWIN_ORIG || path.join(PROJ, 'security-window', 'renderer.js');
const SRC = fs.readFileSync(ORIG, 'utf8');

function reemplazarEntre(src, desde, hasta, nuevo) {
  if (src.split(desde).length - 1 !== 1) throw new Error('ancla inicial no única: ' + desde.slice(0, 60));
  if (src.split(hasta).length - 1 !== 1) throw new Error('ancla final no única: ' + hasta.slice(0, 60));
  const i = src.indexOf(desde);
  const j = src.indexOf(hasta, i);
  if (j < i) throw new Error('las anclas están en orden inverso');
  return src.slice(0, i) + nuevo + src.slice(j);
}

const REVERSIONES = [
  {
    id: 'T-sin-guarda',
    desc: 'se quita la guarda de doSubmit(): vuelve el reenvío con Enter',
    espera: 'B5-A3, B5-A4, B5-A4b, B5-2, B5-3, B5-4 y los cuatro B5-5b',
    // Se corta desde la apertura de doSubmit hasta `const data = collect();`,
    // que es exactamente lo que añadió B5 (la guarda y su comentario).
    aplicar: (s) => reemplazarEntre(s,
      'async function doSubmit() {',
      '  const data = collect();',
      'async function doSubmit() {\n'),
  },
];

const dirOut = path.join(__dirname, 'revertidos');
fs.rmSync(dirOut, { recursive: true, force: true });
fs.mkdirSync(dirOut, { recursive: true });

console.log('REVERSIONES DE B5');
console.log('  origen: ' + ORIG);
let malos = 0;
for (const r of REVERSIONES) {
  let out;
  try { out = r.aplicar(SRC); } catch (e) {
    malos++; console.log(`  [NO SE PUDO] ${r.id}: ${e.message}`); continue;
  }
  if (out === SRC) { malos++; console.log(`  [NO SE PUDO] ${r.id}: la sustitución no cambió nada`); continue; }
  if (/btnSubmit\.disabled\) return;/.test(out)) {
    malos++; console.log(`  [NO SE PUDO] ${r.id}: la guarda sigue ahí tras revertir`); continue;
  }
  const destino = path.join(dirOut, r.id + '.js');
  fs.writeFileSync(destino, out, 'utf8');
  console.log(`  [LISTA] ${r.id}`);
  console.log(`          ${r.desc}`);
  console.log(`          debería romper: ${r.espera}`);
  console.log(`          lanzar con: $env:PANORAMA_SECWIN="${destino}"`);
}
process.exit(malos === 0 ? 0 : 1);
