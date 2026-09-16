'use strict';
// ---------------------------------------------------------------------------
// Lanza la bateria B3 contra cada copia revertida y comprueba que falla, y que
// falla POR LO QUE DEBE. Si una reversion pasara en verde, la prueba
// correspondiente no estaria demostrando nada.
//
// Exige dos cosas de cada reversion:
//   1) que la bateria falle (exit != 0);
//   2) que entre los fallos esten TODAS las pruebas anunciadas en revertir-b3.js.
// ---------------------------------------------------------------------------
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'revertidos');
const BAT = path.join(__dirname, 'test-b3-inventario.js');

const ESPERADO = [
  { file: 'V-cifrado-en-claro.html', env: 'PANORAMA_DASHBOARD',
    debeRomper: ['B3-C1b', 'B3-C1c', 'B3-C1e', 'B3-C1f', 'B3-D [C] cifrado-backup-carpeta'] },
  { file: 'W-directorio-mudo.html', env: 'PANORAMA_DIRECTORIO',
    debeRomper: ['B3-C2b', 'B3-C2c', 'B3-C2d', 'B3-C2h', 'B3-D [C] guardado-directorio'] },
  { file: 'W2-ignora-el-valor.html', env: 'PANORAMA_DIRECTORIO',
    debeRomper: ['B3-C2j'] },
  { file: 'X-historial-mudo.html', env: 'PANORAMA_PREP',
    debeRomper: ['B3-C3a', 'B3-C3b', 'B3-C3d', 'B3-D [D] historial-reunion'] },
  { file: 'Y-limpieza-muda.js', env: 'PANORAMA_MAIN',
    debeRomper: ['B3-E2', 'B3-E5', 'B3-S4', 'B3-D [B] cleanup-journal'] },
  { file: 'Y2-rutas-en-el-log.js', env: 'PANORAMA_MAIN',
    debeRomper: ['B3-S8a'] },
  { file: 'Z-openpath-consola.js', env: 'PANORAMA_MAIN',
    debeRomper: ['B3-S3', 'B3-D [B] abrir-en-explorador'] },
];

if (!fs.existsSync(DIR)) {
  console.log('No hay revertidos/. Lanza antes: node revertir-b3.js');
  process.exit(1);
}

let malos = 0;
console.log('COMPROBACION DE LAS REVERSIONES DE B3');
for (const r of ESPERADO) {
  const ruta = path.join(DIR, r.file);
  if (!fs.existsSync(ruta)) { malos++; console.log(`  [FALTA] ${r.file}`); continue; }
  const env = Object.assign({}, process.env, { [r.env]: ruta });
  let salida = '', codigo = 0;
  try {
    salida = execFileSync(process.execPath, [BAT], { env, encoding: 'utf8' });
  } catch (e) {
    salida = String(e.stdout || '');
    codigo = e.status === undefined ? 1 : e.status;
  }
  const fallos = salida.split('\n').filter((l) => l.trim().startsWith('FALLO ')).map((l) => l.trim().slice(6));
  const faltan = r.debeRomper.filter((n) => !fallos.some((f) => f.startsWith(n)));
  const ok = codigo !== 0 && faltan.length === 0;
  if (!ok) malos++;
  console.log(`\n  ${ok ? '[BIEN]' : '[MAL] '} ${r.file}  (exit ${codigo}, ${fallos.length} fallos)`);
  for (const f of fallos) console.log('           rompe: ' + f.split('  --')[0]);
  if (codigo === 0) console.log('           >>> LA BATERIA PASA CONTRA EL CODIGO REVERTIDO: no demuestra nada');
  if (faltan.length) console.log('           >>> NO rompio lo anunciado: ' + faltan.join(', '));
}

console.log('\n' + '='.repeat(70));
console.log(malos === 0
  ? `  Las ${ESPERADO.length} reversiones rompen la bateria, y por lo que deben.`
  : `  ${malos} reversion(es) NO se comportan como se anuncia.`);
console.log('='.repeat(70));
process.exit(malos === 0 ? 0 : 1);
