'use strict';
const fs = require('fs');
const c = require('crypto');
const F = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1\\claude\\a3-3-diseno.md';
const L = fs.readFileSync(F, 'utf8').split(/\r?\n/);

console.log('cabecera: ' + L[0]);
console.log('\n--- restos obsoletos ---');
const obsoletos = ['F_arranque', 'operacion atomica en curso', 'solo existen dos sitios',
  'cada 15 s por ventana', 'adoptarGeneracionDeDisco()', 'abandono automatico'];
const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
let n = 0;
L.forEach((l, i) => {
  obsoletos.forEach((m) => { if (norm(l).includes(m)) { n++; console.log('  ' + (i + 1) + ': ' + l.trim().slice(0, 110)); } });
});
if (!n) console.log('  (ninguno)');

const ini = L.findIndex((l) => l.startsWith('## 11.'));
const fin = L.findIndex((l) => l.startsWith('## 12.'));
const nums = [];
for (let k = ini; k < fin; k++) { const m = /^(\d+)\. /.exec(L[k]); if (m) nums.push(Number(m[1])); }
console.log('\npruebas 1..' + nums[nums.length - 1] + ', total ' + nums.length +
  ', creciente ' + nums.every((x, i) => i === 0 || x > nums[i - 1]));

console.log('\n--- integridad del codigo de la app (no debe haber cambiado) ---');
['db.js', 'main.js', 'security.js'].forEach((x) => {
  const p = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1\\' + x;
  console.log('  ' + x.padEnd(12) + c.createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase());
});
console.log('\ndoc: ' + L.length + ' lineas, sha256 ' +
  c.createHash('sha256').update(fs.readFileSync(F)).digest('hex').toUpperCase());

const SB = 'C:\\Users\\ADMIN~1.JLO\\AppData\\Local\\Temp\\claude\\C--Codigo-Fuente-PS\\e55d4471-ea3f-4279-b758-0366ccb6384c\\scratchpad\\nucleo-a33\\';
console.log('\n--- nucleo aislado ---');
['nucleo.js', 'test-nucleo.js', 'resultados-nucleo.txt'].forEach((f) => {
  const s = fs.statSync(SB + f);
  console.log('  ' + f.padEnd(24) + String(fs.readFileSync(SB + f, 'utf8').split('\n').length).padStart(5) + ' lineas   ' + s.size + ' bytes');
});
