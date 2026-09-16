'use strict';
const fs = require('fs');
const path = require('path');
const A = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1\\claude\\main.js.ANTES-BLOQUE2-2026-09-14';
const B = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1\\main.js';
const OUT = path.join(__dirname, 'main.js.diff');
const CTX = 4;

const a = fs.readFileSync(A, 'utf8').split(/\r?\n/);
const b = fs.readFileSync(B, 'utf8').split(/\r?\n/);
let ini = 0;
while (ini < a.length && ini < b.length && a[ini] === b[ini]) ini++;
let finA = a.length, finB = b.length;
while (finA > ini && finB > ini && a[finA - 1] === b[finB - 1]) { finA--; finB--; }
const ma = a.slice(ini, finA), mb = b.slice(ini, finB);

const L = [];
for (let i = 0; i <= ma.length; i++) L.push(new Uint32Array(mb.length + 1));
for (let i = ma.length - 1; i >= 0; i--) {
  for (let j = mb.length - 1; j >= 0; j--) {
    L[i][j] = ma[i] === mb[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  }
}
const ops = [];
for (let k = 0; k < ini; k++) ops.push([' ', a[k], k + 1, k + 1]);
let i = 0, j = 0;
while (i < ma.length && j < mb.length) {
  if (ma[i] === mb[j]) { ops.push([' ', ma[i], ini + i + 1, ini + j + 1]); i++; j++; }
  else if (L[i + 1][j] >= L[i][j + 1]) { ops.push(['-', ma[i], ini + i + 1, null]); i++; }
  else { ops.push(['+', mb[j], null, ini + j + 1]); j++; }
}
while (i < ma.length) { ops.push(['-', ma[i], ini + i + 1, null]); i++; }
while (j < mb.length) { ops.push(['+', mb[j], null, ini + j + 1]); j++; }
for (let k = finA; k < a.length; k++) ops.push([' ', a[k], k + 1, finB + (k - finA) + 1]);

const cambios = ops.map((o, idx) => (o[0] !== ' ' ? idx : -1)).filter((x) => x >= 0);
const salida = ['--- main.js (ANTES del bloque 2)', '+++ main.js (DESPUES del bloque 2)'];
let n = 0;
while (n < cambios.length) {
  let desde = Math.max(0, cambios[n] - CTX);
  let hasta = cambios[n];
  let m = n;
  while (m + 1 < cambios.length && cambios[m + 1] - hasta <= CTX * 2) { m++; hasta = cambios[m]; }
  hasta = Math.min(ops.length - 1, hasta + CTX);
  const trozo = ops.slice(desde, hasta + 1);
  const pA = (trozo.find((o) => o[0] !== '+') || [])[2] || 0;
  const pB = (trozo.find((o) => o[0] !== '-') || [])[3] || 0;
  salida.push(`@@ -${pA},${trozo.filter((o) => o[0] !== '+').length} +${pB},${trozo.filter((o) => o[0] !== '-').length} @@`);
  trozo.forEach((o) => salida.push(o[0] + o[1]));
  n = m + 1;
}
fs.writeFileSync(OUT, salida.join('\n'), 'utf8');
console.log('diff de main.js -> ' + OUT);
console.log('  lineas antes:   ' + a.length);
console.log('  lineas despues: ' + b.length);
console.log('  anadidas:  +' + ops.filter((o) => o[0] === '+').length);
console.log('  quitadas:  -' + ops.filter((o) => o[0] === '-').length);
console.log('  hunks:     ' + salida.filter((l) => l.startsWith('@@')).length);
console.log('');
salida.filter((l) => l.startsWith('@@')).forEach((l) => console.log('  ' + l));
