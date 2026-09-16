'use strict';
// ---------------------------------------------------------------------------
// Lanza la batería B5 contra la copia revertida y exige DOS cosas:
//   1) que falle, y por lo anunciado;
//   2) que vuelva a MEDIR los números originales del defecto —2 Enter -> 2 IPC,
//      5 Enter -> 5 IPC, click + Enter -> 2 IPC—, que es lo que demuestra que
//      la prueba depende de verdad de la corrección.
// ---------------------------------------------------------------------------
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'revertidos');
const BAT = path.join(__dirname, 'test-b5-reentrancia.js');

const ESPERADO = [
  { file: 'T-sin-guarda.js', env: 'PANORAMA_SECWIN',
    debeRomper: ['B5-A3', 'B5-A4', 'B5-2', 'B5-3', 'B5-4', 'B5-5b'],
    // Los números exactos del defecto original, tal como los midió el
    // diagnóstico. No basta con que la batería falle.
    huellas: [
      /doble Enter -> IPC emitidos: 2/,
      /cinco Enter -> IPC emitidos: 5/,
      /click \+ Enter -> IPC emitidos: 2/,
    ] },
];

if (!fs.existsSync(DIR)) {
  console.log('No hay revertidos/. Lanza antes: node revertir-b5.js');
  process.exit(1);
}

let malos = 0;
console.log('COMPROBACIÓN DE LAS REVERSIONES DE B5');
for (const r of ESPERADO) {
  const ruta = path.join(DIR, r.file);
  if (!fs.existsSync(ruta)) { malos++; console.log(`  [FALTA] ${r.file}`); continue; }
  const env = Object.assign({}, process.env, { [r.env]: ruta });
  let salida = '', codigo = 0;
  try {
    salida = execFileSync(process.execPath, [BAT], { env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    salida = String(e.stdout || '');
    codigo = e.status === undefined ? 1 : e.status;
  }
  const fallos = salida.split('\n').filter((l) => l.trim().startsWith('FALLO ')).map((l) => l.trim().slice(6));
  const faltan = r.debeRomper.filter((n) => !fallos.some((f) => f.startsWith(n)));
  const sinHuella = (r.huellas || []).filter((h) => !h.test(salida));
  const ok = codigo !== 0 && faltan.length === 0 && sinHuella.length === 0;
  if (!ok) malos++;
  console.log(`\n  ${ok ? '[BIEN]' : '[MAL] '} ${r.file}  (exit ${codigo}, ${fallos.length} fallos)`);
  for (const f of fallos) console.log('           rompe: ' + f.split('  --')[0]);
  if (codigo === 0) console.log('           >>> LA BATERÍA PASA CONTRA EL CÓDIGO REVERTIDO: no demuestra nada');
  if (faltan.length) console.log('           >>> NO rompió lo anunciado: ' + faltan.join(', '));
  if (sinHuella.length) console.log('           >>> no reprodujo: ' + sinHuella.map(String).join(' '));
  // Se imprimen los recuentos medidos: es la reproducción literal del defecto.
  for (const re of [/doble Enter -> IPC emitidos: \d+/, /cinco Enter -> IPC emitidos: \d+/,
    /click \+ Enter -> IPC emitidos: \d+/]) {
    const m = salida.match(re);
    if (m) console.log('           ' + m[0]);
  }
}

console.log('\n' + '='.repeat(70));
console.log(malos === 0
  ? '  La reversión rompe la batería, y reproduce los números del defecto.'
  : `  ${malos} reversión(es) NO se comportan como se anuncia.`);
console.log('='.repeat(70));
process.exit(malos === 0 ? 0 : 1);
