'use strict';
const fs = require('fs');
const crypto = require('crypto');

const F = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1\\claude\\a3-3-diseno.md';
const txt = fs.readFileSync(F, 'utf8');
const lines = txt.split(/\r?\n/);

console.log('--- lenguaje v3 que deberia haber desaparecido ---');
const obsoletos = ['adoptarGeneracionDeDisco', 'como base, escribe', 'imposible por construcci', 'las cinco situaciones'];
let sucios = 0;
lines.forEach((l, i) => {
  obsoletos.forEach((o) => { if (l.includes(o)) { sucios++; console.log('  ' + (i + 1) + ': ' + l.trim()); } });
});
if (!sucios) console.log('  (ninguna) OK');

console.log('\n--- numeracion del plan de pruebas ---');
const ini = lines.findIndex((l) => l.startsWith('## 11.'));
const fin = lines.findIndex((l) => l.startsWith('## 12.'));
const nums = [];
for (let k = ini; k < fin; k++) {
  const m = /^(\d+)\. /.exec(lines[k]);
  if (m) nums.push(Number(m[1]));
}
console.log('  encontrados: ' + nums.join(','));
// 4..8 estan dentro de bloques con encabezado propio salvo el 8, que si esta suelto
const faltan = [];
for (let n = 1; n <= 47; n++) if (!nums.includes(n)) faltan.push(n);
console.log('  faltan: ' + (faltan.length ? faltan.join(',') : '(ninguno)'));
const rep = nums.filter((n, i) => nums.indexOf(n) !== i);
console.log('  repetidos: ' + (rep.length ? rep.join(',') : '(ninguno)'));
const ordenado = nums.every((n, i) => i === 0 || n > nums[i - 1]);
console.log('  estrictamente creciente: ' + ordenado);

console.log('\n--- secciones ---');
lines.forEach((l, i) => { if (/^#{2,3} /.test(l)) console.log('  ' + (i + 1) + ': ' + l); });

console.log('\n--- integridad del codigo fuente (no debe haber cambiado) ---');
['db.js', 'main.js', 'security.js'].forEach((x) => {
  const p = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1\\' + x;
  const h = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase();
  console.log('  ' + x.padEnd(12) + h);
});

console.log('\n--- documento ---');
console.log('  lineas: ' + lines.length);
console.log('  sha256: ' + crypto.createHash('sha256').update(fs.readFileSync(F)).digest('hex').toUpperCase());
