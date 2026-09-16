'use strict';
// ---------------------------------------------------------------------------
// Lanza la batería B4 contra cada copia revertida y comprueba que falla, y que
// falla POR LO QUE DEBE. Una defensa cuya reversión sigue dando verde no está
// demostrando nada.
//
// Además, para `R-reorder-en-bucle` se exige algo más fuerte que "falla":
// que reproduzca EXACTAMENTE el defecto medido en el diagnóstico —un orden
// aplicado A MEDIAS en el archivo—, que es lo que el usuario pidió.
// ---------------------------------------------------------------------------
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'revertidos');
const BAT = path.join(__dirname, 'test-b4-persistencia.js');

const ESPERADO = [
  { file: 'R-reorder-en-bucle.js',
    debeRomper: ['B4-R0a', 'B4-R0b', 'B4-R1c', 'B4-R3f', 'B4-R3g', 'B4-R3h', 'B4-R3i', 'B4-R6c'],
    // La huella del defecto ORIGINAL, tal cual se midió en el diagnóstico: un
    // orden aplicado a medias en el archivo. No basta con que la batería falle;
    // tiene que fallar ENSEÑANDO el vector parcial.
    huella: /FALLO B4-R3i[^\n]*orden PARCIAL en disco: \[/ },
  { file: 'S-reorder-mudo.js',
    debeRomper: ['B4-R0d', 'B4-R2f', 'B4-R3e', 'B4-O6'] },
];

if (!fs.existsSync(DIR)) {
  console.log('No hay revertidos/. Lanza antes: node revertir-b4.js');
  process.exit(1);
}

let malos = 0;
console.log('COMPROBACIÓN DE LAS REVERSIONES DE B4');
for (const r of ESPERADO) {
  const ruta = path.join(DIR, r.file);
  if (!fs.existsSync(ruta)) { malos++; console.log(`  [FALTA] ${r.file}`); continue; }
  const env = Object.assign({}, process.env, { PANORAMA_MAIN: ruta });
  let salida = '', codigo = 0;
  try {
    salida = execFileSync(process.execPath, [BAT], { env, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    salida = String(e.stdout || '');
    codigo = e.status === undefined ? 1 : e.status;
  }
  const fallos = salida.split('\n').filter((l) => l.trim().startsWith('FALLO ')).map((l) => l.trim().slice(6));
  const faltan = r.debeRomper.filter((n) => !fallos.some((f) => f.startsWith(n)));
  const conHuella = r.huella ? r.huella.test(salida) : true;
  const ok = codigo !== 0 && faltan.length === 0 && conHuella;
  if (!ok) malos++;
  console.log(`\n  ${ok ? '[BIEN]' : '[MAL] '} ${r.file}  (exit ${codigo}, ${fallos.length} fallos)`);
  for (const f of fallos) console.log('           rompe: ' + f.split('  --')[0]);
  if (codigo === 0) console.log('           >>> LA BATERÍA PASA CONTRA EL CÓDIGO REVERTIDO: no demuestra nada');
  if (faltan.length) console.log('           >>> NO rompió lo anunciado: ' + faltan.join(', '));
  if (!conHuella) console.log('           >>> no aparece la huella del defecto original');
  // Para la reversión del bucle, se imprime el orden parcial que quedó: es la
  // reproducción literal del defecto que midió el diagnóstico.
  for (const re of [/FALLO B4-R3i[^\n]*/, /FALLO B4-R3h[^\n]*/, /R3bis publicaciones[^\n]*/]) {
    const m = salida.match(re);
    if (m) console.log('           ' + m[0].trim().slice(0, 190));
  }
}

console.log('\n' + '='.repeat(70));
console.log(malos === 0
  ? `  Las ${ESPERADO.length} reversiones rompen la batería, y por lo que deben.`
  : `  ${malos} reversión(es) NO se comportan como se anuncia.`);
console.log('='.repeat(70));
process.exit(malos === 0 ? 0 : 1);
