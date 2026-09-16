'use strict';
// Sustituye el cuerpo de restoreProjectBackup en main.js por el protocolo nuevo.
// Se localiza por firma y se delimita contando llaves: nada de numeros de linea
// a pelo, que se desplazan.
const fs = require('fs');
const path = require('path');

const MAIN = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1\\main.js';
const NUEVO = require(path.join(__dirname, 'nuevo-restore.js'));

let t = fs.readFileSync(MAIN, 'utf8');
const FIRMA = 'async function restoreProjectBackup(projectId, backupId) {';
const veces = t.split(FIRMA).length - 1;
if (veces !== 1) { console.error(`la firma aparece ${veces} veces`); process.exit(2); }

const i = t.indexOf(FIRMA);
let j = t.indexOf('{', i), prof = 0, fin = -1;
for (let k = j; k < t.length; k++) {
  if (t[k] === '{') prof++;
  else if (t[k] === '}') { prof--; if (prof === 0) { fin = k; break; } }
}
if (fin < 0) { console.error('no delimitado'); process.exit(3); }

const viejo = t.slice(i, fin + 1);
if (viejo.indexOf('restoreInProgress.add(projectId)') < 0) {
  console.error('el cuerpo encontrado no es el esperado (ya sustituido?)');
  process.exit(4);
}
t = t.slice(0, i) + NUEVO + t.slice(fin + 1);
fs.writeFileSync(MAIN, t, 'utf8');
console.log(`  restoreProjectBackup sustituido: ${viejo.length} -> ${NUEVO.length} bytes`);
console.log('  main.js: ' + t.length + ' bytes');
