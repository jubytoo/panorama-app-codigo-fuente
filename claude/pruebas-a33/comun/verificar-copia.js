'use strict';
// Verificacion INDEPENDIENTE de esta copia: recorre SHA256SUMS.txt y comprueba
// cada archivo. No depende del script que hizo la copia.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE = path.join(__dirname, '..');
const sumas = path.join(BASE, 'SHA256SUMS.txt');
const lineas = fs.readFileSync(sumas, 'utf8').split('\n').filter((l) => l.trim());

let mal = 0; let faltan = 0;
for (const l of lineas) {
  const i = l.indexOf('  ');
  const esperado = l.slice(0, i);
  const rel = l.slice(i + 2);
  const abs = path.join(BASE, rel.split('/').join(path.sep));
  if (!fs.existsSync(abs)) { faltan++; console.log('  FALTA:   ' + rel); continue; }
  const real = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
  if (real !== esperado) { mal++; console.log('  DIFIERE: ' + rel); }
}

// Y que no se haya colado ningun dato del usuario.
const prohibidos = [];
(function rec(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = path.join(d, e.name);
    if (e.isDirectory()) { rec(f); continue; }
    if (/\.sqlite3(\.gen)?$/i.test(e.name)) prohibidos.push(path.relative(BASE, f));
  }
})(BASE);

const total = (function contar(d) {
  let n = 0;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.isDirectory()) n += contar(path.join(d, e.name)); else n++;
  }
  return n;
})(BASE);

console.log('  archivos listados en SHA256SUMS: ' + lineas.length);
console.log('  archivos en la carpeta:          ' + total + '  (incluye SHA256SUMS.txt, MANIFIESTO.md y este verificador)');
console.log('  faltan:      ' + faltan);
console.log('  difieren:    ' + mal);
console.log('  .sqlite3 dentro del repositorio: ' + prohibidos.length + (prohibidos.length ? '  <-- ' + prohibidos.join(', ') : '  (ninguno, correcto)'));
process.exit(mal === 0 && faltan === 0 && prohibidos.length === 0 ? 0 : 1);
