'use strict';
const fs = require('fs');
const path = require('path');
const c = require('crypto');

const SBOX = path.join(__dirname, 'sandbox-arranque');
try { fs.rmSync(SBOX, { recursive: true, force: true }); } catch (e) {}
console.log('sandbox de arranque borrado: ' + !fs.existsSync(SBOX));

const P = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1\\';
console.log('\n--- HASHES DEL CODIGO FUENTE ---');
[
  ['db.js (MODIFICADO)', 'db.js'],
  ['db.js copia previa', 'claude\\db.js.ANTES-BLOQUE1-2026-09-14'],
  ['main.js (SIN TOCAR)', 'main.js'],
  ['security.js (SIN TOCAR)', 'security.js'],
].forEach(([n, f]) => {
  const b = fs.readFileSync(P + f);
  console.log('  ' + n.padEnd(26) + c.createHash('sha256').update(b).digest('hex').toUpperCase() +
    '  ' + b.toString('utf8').split(/\r?\n/).length + ' lineas');
});

console.log('\n--- PRODUCCION (no tocada) ---');
const prod = path.join(process.env.APPDATA || '', 'panorama-app', 'panorama.sqlite3');
try {
  const b = fs.readFileSync(prod);
  console.log('  %APPDATA%\\panorama-app\\panorama.sqlite3');
  console.log('     ' + c.createHash('sha256').update(b).digest('hex').toUpperCase() + '  (' + b.length + ' B)');
} catch (e) { console.log('  APPDATA: ' + e.code); }
const g = 'G:' + path.sep + 'Mi unidad' + path.sep + 'BD-PanoramaServicio';
try {
  console.log('  ' + g + ': ' + fs.readdirSync(g).length + ' entradas — ninguna prueba la referencia');
} catch (e) { console.log('  G: ' + e.code); }
