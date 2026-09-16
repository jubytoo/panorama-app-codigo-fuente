'use strict';
const fs = require('fs');
const c = require('crypto');
const F = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1\\claude\\a3-3-diseno.md';
let t = fs.readFileSync(F, 'utf8');

t = t.split('**335/335**').join('**336/336**');
t = t.split('NÚCLEO A3.3 — 335 OK, 0 FALLOS').join('NÚCLEO A3.3 — 336 OK, 0 FALLOS');
t = t.split('→ 254 (rev. 5) → **335**').join('→ 254 (rev. 5) → **336**');

const nota = [
  '',
  '> **Nota sobre el contador:** la suite emite **335 o 336** asertos según si en',
  '> esa ejecución el sistema de archivos permite reproducir el peor caso de',
  '> precisión de la marca de tiempo (§15.b, hallazgo 2). Es una rama condicional',
  '> deliberada de la prueba del límite en carpeta local, no una prueba inestable:',
  '> en las dos ramas la prueba afirma y comprueba lo que corresponde.',
  '',
].join('\n');

if (!t.includes('Nota sobre el contador')) {
  t = t.replace('Progresión: 112 (rev. 4', nota + '\nProgresión: 112 (rev. 4');
}

fs.writeFileSync(F, t, 'utf8');
console.log('lineas: ' + t.split(/\r?\n/).length);
console.log('sha256 doc: ' + c.createHash('sha256').update(fs.readFileSync(F)).digest('hex').toUpperCase());
const SB = 'C:\\Users\\ADMIN~1.JLO\\AppData\\Local\\Temp\\claude\\C--Codigo-Fuente-PS\\e55d4471-ea3f-4279-b758-0366ccb6384c\\scratchpad\\nucleo-a33\\';
['nucleo.js', 'test-nucleo.js', 'resultados-nucleo.txt'].forEach((f) => {
  console.log('  ' + f.padEnd(24) + String(fs.readFileSync(SB + f, 'utf8').split('\n').length).padStart(5) + ' lineas');
});
