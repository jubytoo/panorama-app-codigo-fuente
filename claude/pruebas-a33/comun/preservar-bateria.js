'use strict';
// Copia (NO traslada) la bateria de pruebas del scratchpad temporal de esta
// sesion a una ubicacion estable y NO productiva dentro del repositorio.
//
// Exclusiones, y el motivo de cada una:
//   - real-run/sb/**      sandbox GENERADO por un arranque Electron (10,3 MB)
//   - *.sqlite3 / .gen    copias de la BASE DE DATOS DEL USUARIO: no entran
//                         en el repositorio bajo ningun concepto
//   - sandbox*/           carpetas de trabajo generadas por las baterias
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ORIGEN = path.join(__dirname, '..');
const DESTINO = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1\\claude\\pruebas-a33';

function excluido(rel, esDir, nombre) {
  if (esDir && /^sandbox/i.test(nombre)) return 'carpeta de trabajo generada';
  if (esDir && rel.replace(/\\/g, '/') === 'real-run/sb') return 'sandbox generado por un arranque Electron';
  if (/\.sqlite3(\.gen)?$/i.test(nombre)) return 'copia de la base de datos del usuario';
  return null;
}

const copiados = [];
const saltados = [];
function recorrer(dirRel) {
  const abs = dirRel ? path.join(ORIGEN, dirRel) : ORIGEN;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = dirRel ? path.join(dirRel, e.name) : e.name;
    const motivo = excluido(rel, e.isDirectory(), e.name);
    if (motivo) { saltados.push({ rel, motivo, dir: e.isDirectory() }); continue; }
    if (e.isDirectory()) { recorrer(rel); continue; }
    const src = path.join(ORIGEN, rel);
    const dst = path.join(DESTINO, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    copiados.push(rel);
  }
}

fs.rmSync(DESTINO, { recursive: true, force: true });
fs.mkdirSync(DESTINO, { recursive: true });
recorrer('');

// --- verificacion: numero de archivos y hash a hash -----------------------
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
let diferentes = 0;
const lineas = [];
for (const rel of copiados.sort()) {
  const a = sha(path.join(ORIGEN, rel));
  const b = sha(path.join(DESTINO, rel));
  if (a !== b) { diferentes++; console.log('  DIFIERE: ' + rel); }
  lineas.push(`${b}  ${rel.replace(/\\/g, '/')}`);
}
fs.writeFileSync(path.join(DESTINO, 'SHA256SUMS.txt'), lineas.join('\n') + '\n', 'utf8');

const nDestino = (function contar(d) {
  let n = 0;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.isDirectory()) n += contar(path.join(d, e.name));
    else n++;
  }
  return n;
})(DESTINO) - 1;   // menos el propio SHA256SUMS.txt

const bytes = copiados.reduce((s, r) => s + fs.statSync(path.join(DESTINO, r)).size, 0);

console.log('  origen:   ' + ORIGEN);
console.log('  destino:  ' + DESTINO);
console.log('');
console.log('  archivos copiados:   ' + copiados.length);
console.log('  archivos en destino: ' + nDestino + (nDestino === copiados.length ? '  (coincide)' : '  <-- NO COINCIDE'));
console.log('  hashes distintos:    ' + diferentes + (diferentes === 0 ? '  (cero diferencias)' : '  <-- REVISAR'));
console.log('  bytes:               ' + bytes.toLocaleString('es-ES'));
console.log('');
console.log('  saltados a proposito: ' + saltados.length);
for (const s of saltados) console.log(`    ${s.dir ? 'DIR ' : 'FILE'} ${s.rel}  — ${s.motivo}`);

// Los entrypoints tienen que poder localizarse desde la ruta estable.
const ENTRYPOINTS = [
  'comun/test-guardia.js', 'bloque1/test-db-integrado.js', 'bloque2/test-wiring.js',
  'bloque3/test-error-codes.js', 'bloque3/test-primitivas.js', 'bloque3/test-seguridad.js',
  'bloque4/test-acciones.js', 'bloque4/test-consumidores.js',
  'bloque5/test-borrados.js', 'bloque5/test-cableado.js',
  'a2/test-restauraciones.js', 'a2/test-cableado.js',
  'real-run/b5.js', 'bloque5/electron-real.ps1', 'bloque5/electron-cv.ps1',
  'comun/guardia-rutas.js', 'comun/bloque5-extraccion.js', 'comun/baseline-bd-viva.json',
  'bloque5/revertir.js', 'a2/revertir.js', 'bloque5/sintaxis.js',
];
console.log('');
let faltan = 0;
for (const ep of ENTRYPOINTS) {
  const existe = fs.existsSync(path.join(DESTINO, ep.replace(/\//g, path.sep)));
  if (!existe) { faltan++; console.log('  FALTA ENTRYPOINT: ' + ep); }
}
console.log(`  entrypoints localizables: ${ENTRYPOINTS.length - faltan}/${ENTRYPOINTS.length}`);

process.exit(diferentes === 0 && faltan === 0 && nDestino === copiados.length ? 0 : 1);
