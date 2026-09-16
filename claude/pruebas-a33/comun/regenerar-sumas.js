'use strict';
// Regenera SHA256SUMS.txt de esta carpeta. Se usa cuando la bateria crece o
// cambia: la copia deja de ser un espejo del scratchpad y pasa a ser la
// version viva, asi que las sumas tienen que rehacerse contra ella misma.
//
// Excluye lo generado (revertidos*, sandbox*) y cualquier .sqlite3, que no
// entra en el repositorio bajo ningun concepto.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE = path.join(__dirname, '..');
const PROPIOS = new Set(['SHA256SUMS.txt']);

function excluido(rel, esDir, nombre) {
  if (esDir && /^sandbox/i.test(nombre)) return true;
  if (esDir && /^revertidos/i.test(nombre)) return true;   // se regeneran solos
  if (/\.sqlite3(\.gen)?$/i.test(nombre)) return true;
  return false;
}

const archivos = [];
(function rec(dirRel) {
  const abs = dirRel ? path.join(BASE, dirRel) : BASE;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = dirRel ? path.join(dirRel, e.name) : e.name;
    if (excluido(rel, e.isDirectory(), e.name)) continue;
    if (e.isDirectory()) { rec(rel); continue; }
    if (PROPIOS.has(rel)) continue;
    archivos.push(rel);
  }
})('');

archivos.sort();
const lineas = archivos.map((rel) => {
  const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(BASE, rel))).digest('hex');
  return `${h}  ${rel.replace(/\\/g, '/')}`;
});
fs.writeFileSync(path.join(BASE, 'SHA256SUMS.txt'), lineas.join('\n') + '\n', 'utf8');

const bytes = archivos.reduce((s, r) => s + fs.statSync(path.join(BASE, r)).size, 0);
console.log('  archivos listados: ' + archivos.length);
console.log('  bytes:             ' + bytes.toLocaleString('es-ES'));
console.log('  SHA256SUMS.txt regenerado');
