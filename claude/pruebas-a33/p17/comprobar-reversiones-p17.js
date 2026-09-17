'use strict';
// ---------------------------------------------------------------------------
// P17 — ¿la reversión reproduce LOS DOS defectos?
//
// Genera la reversión y lanza la batería P17 contra ella (PANORAMA_MAIN). Se
// exige que la batería se ponga ROJA y, además, que caigan aserciones de LAS
// DOS familias:
//   · el segundo icono con ruta relativa (P17-C / P17-D);
//   · al menos un caso `$` corrupto (P17-G).
// ---------------------------------------------------------------------------
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BAT = path.join(__dirname, 'test-p17-assets.js');
const REV = path.join(__dirname, 'revertidos', 'A-replace-cadena', 'main.js');

let pass = 0, fail = 0;
function ok(n, c, extra) {
  if (c) { pass++; console.log('  OK    ' + n); }
  else { fail++; console.log('  FALLO ' + n + (extra === undefined ? '' : '  -- ' + extra)); }
}

execFileSync(process.execPath, [path.join(__dirname, 'revertir-p17.js')], { stdio: 'inherit' });
console.log('');

// Control: sin reversión, verde.
try {
  const base = execFileSync(process.execPath, [BAT], { encoding: 'utf8' });
  ok('P17-REV0 sin reversión la batería está verde (control)', /0 FALLOS/.test(base));
} catch (e) {
  ok('P17-REV0 sin reversión la batería está verde (control)', false, 'falla ya sin revertir');
}

ok('P17-REV1 existe el main.js revertido', fs.existsSync(REV), REV);

let salida = '', rompio = false;
try {
  salida = execFileSync(process.execPath, [BAT], { encoding: 'utf8', env: { ...process.env, PANORAMA_MAIN: REV } });
} catch (e) {
  rompio = true;
  salida = (e.stdout || '') + (e.stderr || '');
}
ok('P17-REV2 con la reversión puesta, la batería SE PONE ROJA', rompio, salida.slice(-160));

const caidas = salida.split('\n').filter((l) => l.startsWith('  FALLO ')).map((l) => l.replace('  FALLO ', '').trim());
console.log('        caídas: ' + JSON.stringify(caidas.slice(0, 8)));

// Defecto 1: vuelve a quedar una ruta relativa de icono sin resolver.
const defectoIcono = caidas.some((c) => /^P17-(C|D)\b/.test(c));
ok('P17-REV3 reproduce el DEFECTO 1: vuelve a quedar el segundo icono con ruta relativa',
  defectoIcono, JSON.stringify(caidas.filter((c) => /^P17-(C|D)/.test(c)).slice(0, 4)));

// Defecto 2: al menos un caso `$` vuelve a corromper el horneado.
const defectoDolar = caidas.some((c) => /^P17-G /.test(c));
ok('P17-REV4 reproduce el DEFECTO 2: al menos un caso `$` vuelve a corromper el horneado',
  defectoDolar, JSON.stringify(caidas.filter((c) => /^P17-G /.test(c)).slice(0, 6)));

// Y la forma de la función vuelve a ser la vieja.
const defectoForma = caidas.some((c) => /^P17-B[1-4]/.test(c));
ok('P17-REV5 …y la custodia de la forma (regex global + función) también cae',
  defectoForma, JSON.stringify(caidas.filter((c) => /^P17-B/.test(c))));

console.log('\n======================================================================');
console.log(`  P17 REVERSIÓN: ${pass} OK / ${fail} FALLOS`);
console.log('======================================================================');
if (fail) process.exit(1);
