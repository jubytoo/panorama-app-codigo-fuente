'use strict';
// ---------------------------------------------------------------------------
// F3 — ¿la reversión reproduce el defecto?
//
// Genera la reversión (política vacía) y lanza la batería F2/F3 contra ella
// (PANORAMA_MAIN). Se exige que se ponga ROJA y que caigan las aserciones de
// la política — no otras.
//
// La parte de Electron (que `about:blank` y `file://` vuelven a crear
// BrowserWindow, y que un <a target="_blank"> vuelve a abrir dentro de la app)
// se comprueba con `electron-f2f3.ps1` apuntando a este mismo main.js
// revertido, vía la variable F2F3_MAIN.
// ---------------------------------------------------------------------------
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BAT = path.join(__dirname, 'test-f2f3.js');
const REV = path.join(__dirname, 'revertidos', 'A-sin-politica', 'main.js');

let pass = 0, fail = 0;
function ok(n, c, extra) {
  if (c) { pass++; console.log('  OK    ' + n); }
  else { fail++; console.log('  FALLO ' + n + (extra === undefined ? '' : '  -- ' + extra)); }
}

execFileSync(process.execPath, [path.join(__dirname, 'revertir-f3.js')], { stdio: 'inherit' });
console.log('');

try {
  const base = execFileSync(process.execPath, [BAT], { encoding: 'utf8' });
  ok('F3-REV0 sin reversión la batería está verde (control)', /0 FALLOS/.test(base));
} catch (e) {
  ok('F3-REV0 sin reversión la batería está verde (control)', false, 'falla ya sin revertir nada');
}
ok('F3-REV1 existe el main.js revertido', fs.existsSync(REV), REV);

let salida = '', rompio = false;
try {
  salida = execFileSync(process.execPath, [BAT], { encoding: 'utf8', env: { ...process.env, PANORAMA_MAIN: REV } });
} catch (e) {
  rompio = true;
  salida = (e.stdout || '') + (e.stderr || '');
}
ok('F3-REV2 con la reversión puesta, la batería SE PONE ROJA', rompio, salida.slice(-160));

const caidas = salida.split('\n').filter((l) => l.startsWith('  FALLO ')).map((l) => l.replace('  FALLO ', '').trim());
console.log('        caídas: ' + JSON.stringify(caidas.slice(0, 8)));
ok('F3-REV3 cae la custodia de la política (F3-B)', caidas.some((c) => /^F3-B/.test(c)),
  JSON.stringify(caidas.filter((c) => /^F3-B/.test(c)).slice(0, 4)));
ok('F3-REV4 no arrastra las aserciones de F2 (siguen siendo hallazgos separados)',
  !caidas.some((c) => /^F2-[ABCO]/.test(c)), JSON.stringify(caidas.filter((c) => /^F2-/.test(c))));

console.log('\n======================================================================');
console.log(`  F3 REVERSIÓN: ${pass} OK / ${fail} FALLOS`);
console.log('======================================================================');
if (fail) process.exit(1);
