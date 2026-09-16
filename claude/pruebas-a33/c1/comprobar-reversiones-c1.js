'use strict';
// ---------------------------------------------------------------------------
// Lanza la batería de C1 contra cada copia revertida y exige que FALLE, y que
// falle por lo que la reversión deshace. Una prueba que también pasa contra el
// código revertido no demuestra nada.
// ---------------------------------------------------------------------------
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'revertidos');
const BAT = path.join(__dirname, 'test-c1-residuos.js');

const ESPERADO = [
  { file: 'U-sin-llamada.js', env: 'PANORAMA_MAIN', debeRomper: ['C1-D4', 'C1-A1d'] },
  { file: 'U2-sin-log.js', env: 'PANORAMA_MAIN', debeRomper: ['C1-A1a', 'C1-A1b', 'C1-A1c'] },
  { file: 'X-sello-estricto.js', env: 'PANORAMA_MAIN', debeRomper: ['C1-A1b', 'C1-A1f'] },
  { file: 'V1-cv-del-eval.html', env: 'PANORAMA_EVAL',
    debeRomper: ['C1-A6a', 'C1-A6b', 'C1-A6d', 'C1-A6e', 'C1-A6f', 'C1-A8a'],
    // del-eval no debe arrastrar a Importar: lo de A7 tiene que seguir en verde
    noDebeRomper: ['C1-A7', 'C1-A8b'] },
  { file: 'V2-cv-importar.html', env: 'PANORAMA_EVAL',
    debeRomper: ['C1-A7a', 'C1-A7c', 'C1-A7d', 'C1-A8b'],
    noDebeRomper: ['C1-A6', 'C1-A8a'] },
  { file: 'W1-mensaje-rekey.js', env: 'PANORAMA_MAIN', debeRomper: ['C1-E9c', 'C1-A9a', 'C1-A9c', 'C1-A9h'] },
  { file: 'W2-mensaje-restaur.js', env: 'PANORAMA_MAIN', debeRomper: ['C1-A9e', 'C1-A9f', 'C1-A9h'] },
];

if (!fs.existsSync(DIR)) { console.log('No hay revertidos/. Lanza antes: node revertir-c1.js'); process.exit(1); }

let malos = 0;
console.log('COMPROBACIÓN DE LAS REVERSIONES DE C1-A');
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
  const faltan = r.debeRomper.filter((n) => !fallos.some((f) => f.startsWith(n + ' ')));
  const colaterales = (r.noDebeRomper || []).filter((n) => fallos.some((f) => f.startsWith(n)));
  const excepcion = /FALLO INESPERADO/.test(salida);
  const ok = codigo === 1 && !excepcion && faltan.length === 0 && colaterales.length === 0;
  if (!ok) malos++;
  console.log(`\n  ${ok ? '[BIEN]' : '[MAL] '} ${r.file}  (exit ${codigo}, ${fallos.length} fallos)`);
  for (const f of fallos) console.log('           rompe: ' + f.split('  --')[0]);
  if (codigo === 0) console.log('           >>> LA BATERÍA PASA CONTRA EL CÓDIGO REVERTIDO: no demuestra nada');
  if (excepcion) console.log('           >>> la batería REVENTÓ en vez de fallar (defecto de arnés)');
  if (faltan.length) console.log('           >>> NO rompió lo anunciado: ' + faltan.join(', '));
  if (colaterales.length) console.log('           >>> rompió lo que NO debía: ' + colaterales.join(', '));
}

console.log('\n' + '='.repeat(70));
console.log(malos === 0
  ? `  Las ${ESPERADO.length} reversiones rompen la batería, y exactamente por lo que deshacen.`
  : `  ${malos} reversión(es) NO se comportan como se anuncia.`);
console.log('='.repeat(70));
process.exit(malos === 0 ? 0 : 1);
