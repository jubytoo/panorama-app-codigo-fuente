'use strict';
const fs = require('fs');
const path = require('path');
const g = 'G:' + path.sep + 'Mi unidad' + path.sep + 'BD-PanoramaServicio';
const ahora = Date.now();
let filas = [];
try {
  filas = fs.readdirSync(g).map((f) => {
    try {
      const s = fs.statSync(path.join(g, f));
      return { f, dir: s.isDirectory(), size: s.size, mtime: s.mtime, edadH: (ahora - s.mtimeMs) / 3600000 };
    } catch (e) { return { f, err: e.code }; }
  });
} catch (e) { console.log('no se pudo listar: ' + e.code); process.exit(0); }

console.log('entradas: ' + filas.length);
console.log('');
console.log('--- modificadas en las ULTIMAS 24 HORAS ---');
const recientes = filas.filter((x) => x.edadH !== undefined && x.edadH < 24).sort((a, b) => a.edadH - b.edadH);
if (!recientes.length) console.log('  NINGUNA');
recientes.forEach((x) => console.log('  ' + x.f.padEnd(34) + x.mtime.toISOString() + '   hace ' + x.edadH.toFixed(1) + ' h'));
console.log('');
console.log('--- listado completo ---');
filas.sort((a, b) => String(a.f).localeCompare(String(b.f)))
  .forEach((x) => console.log('  ' + (x.dir ? '[dir] ' : '      ') + String(x.f).padEnd(34) +
    (x.size !== undefined ? String(x.size).padStart(9) + ' B  ' : '') +
    (x.mtime ? x.mtime.toISOString() : x.err)));
