'use strict';
// ---------------------------------------------------------------------------
// F1 — ¿cada reversión rompe LO QUE ANUNCIA?
//
// Genera las seis reversiones y lanza la batería F1 contra cada una (vía las
// variables de entorno PANORAMA_*). Se exige que:
//   · la batería FALLE con la reversión puesta (si no, no estaba probando nada);
//   · y que falle por las aserciones de SU familia, no por otras.
//
// No toca producción: la batería lee el archivo revertido de `revertidos/`.
// ---------------------------------------------------------------------------
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BAT = path.join(__dirname, 'test-f1-sinks.js');
const REV = path.join(__dirname, 'revertidos');

// familia -> [variable de entorno, archivo, prefijos de aserción que DEBEN caer]
const ESPERADO = {
  // F1-C es la aserción agregada sobre los mismos campos: cae con ellos, y es
  // de la misma familia (texto del dashboard sin escapar), no un arrastre ajeno.
  'A-texto-dashboard': ['PANORAMA_DASHBOARD', 'plantilla_dashboard.html', ['F1-A', 'F1-B', 'F1-C']],
  'B-seed-inseguro': ['PANORAMA_MAIN', 'main.js', ['F1-H']],
  'C-onclick-preparacion': ['PANORAMA_PREP', 'plantilla_preparacion_reunion.html', ['F1-P1', 'F1-P2', 'F1-P3']],
  'D-selector-evaluacion': ['PANORAMA_EVAL', 'plantilla_evaluacion_candidatos.html', ['F1-E']],
  'E-dedic-directorio': ['PANORAMA_DIRECTORIO', 'plantilla_directorio.html', ['F1-V4']],
  'F-logo-crudo': ['PANORAMA_DASHBOARD', 'plantilla_dashboard.html', ['F1-G']],
};

execFileSync(process.execPath, [path.join(__dirname, 'revertir-f1.js')], { stdio: 'inherit' });
console.log('');

let pass = 0, fail = 0;
function ok(n, c, extra) {
  if (c) { pass++; console.log('  OK    ' + n); }
  else { fail++; console.log('  FALLO ' + n + (extra === undefined ? '' : '  -- ' + extra)); }
}

// Control: sin reversión, la batería tiene que estar VERDE.
let base;
try {
  base = execFileSync(process.execPath, [BAT], { encoding: 'utf8' });
  ok('F1-REV0 sin reversión la batería está verde (control)', /0 FALLOS/.test(base));
} catch (e) {
  ok('F1-REV0 sin reversión la batería está verde (control)', false, 'la batería falla ya sin revertir nada');
}

for (const [familia, [env, archivo, prefijos]] of Object.entries(ESPERADO)) {
  const ruta = path.join(REV, familia, archivo);
  if (!fs.existsSync(ruta)) { ok(`F1-REV ${familia}: existe el archivo revertido`, false, ruta); continue; }
  let salida = '';
  let rompio = false;
  try {
    salida = execFileSync(process.execPath, [BAT], { encoding: 'utf8', env: { ...process.env, [env]: ruta } });
  } catch (e) {
    rompio = true;
    salida = (e.stdout || '') + (e.stderr || '');
  }
  ok(`F1-REV ${familia}: con la reversión puesta, la batería SE PONE ROJA`, rompio, salida.slice(-200));
  const caidas = salida.split('\n').filter((l) => l.startsWith('  FALLO ')).map((l) => l.replace('  FALLO ', '').trim());
  const suyas = caidas.filter((c) => prefijos.some((p) => c.startsWith(p)));
  const ajenas = caidas.filter((c) => !prefijos.some((p) => c.startsWith(p)));
  ok(`F1-REV ${familia}: cae por SUS aserciones (${prefijos.join('/')})`, suyas.length > 0,
    'caídas: ' + JSON.stringify(caidas.slice(0, 4)));
  ok(`F1-REV ${familia}: no arrastra aserciones de otras familias`, ajenas.length === 0,
    'ajenas: ' + JSON.stringify(ajenas.slice(0, 4)));
}

console.log('\n======================================================================');
console.log(`  F1 REVERSIONES: ${pass} OK / ${fail} FALLOS`);
console.log('======================================================================');
if (fail) process.exit(1);
