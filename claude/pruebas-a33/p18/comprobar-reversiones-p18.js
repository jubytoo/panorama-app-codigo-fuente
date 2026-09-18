'use strict';
// ---------------------------------------------------------------------------
// P18 — ¿cada reversión tumba EXACTAMENTE lo que anuncia?
//
// Para cada familia de `revertir-p18.js` se lanza `test-p18-procedencia.js` contra
// la copia revertida (PANORAMA_MAIN) y se exige: (1) que la batería se ponga
// ROJA, (2) que caiga cada grupo anunciado, y (3) que NO caiga ninguna otra.
// Antes, el control: sin reversión la batería está verde.
// Regenera SIEMPRE las copias antes (lección de C1: copias viejas mienten).
// ---------------------------------------------------------------------------
const { execFileSync } = require('child_process');
const path = require('path');
const { FAMILIAS, SALIDA } = require('./revertir-p18.js');

const BAT = path.join(__dirname, 'test-p18-procedencia.js');
let pass = 0, fail = 0;
function ok(n, c, extra) {
  if (c) { pass++; console.log('  OK    ' + n); }
  else { fail++; console.log('  FALLO ' + n + (extra === undefined ? '' : '  -- ' + extra)); }
}
function correr(env) {
  try {
    return { rojo: false, salida: execFileSync(process.execPath, [BAT], { encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 }) };
  } catch (e) {
    return { rojo: true, salida: (e.stdout || '') + (e.stderr || '') };
  }
}
const caidasDe = (s) => s.split(/\r?\n/).filter((l) => l.startsWith('  FALLO ')).map((l) => l.replace('  FALLO ', '').replace(/  -- .*$/, '').trim());

execFileSync(process.execPath, [path.join(__dirname, 'revertir-p18.js')], { stdio: 'inherit' });
console.log('');

const base = correr({});
ok('P18-REV0 sin reversión la batería está VERDE (control)', !base.rojo && /P18: \d+ OK \/ 0 FALLOS/.test(base.salida), caidasDe(base.salida).join(' | '));

for (const fam of FAMILIAS) {
  const r = correr({ PANORAMA_MAIN: path.join(SALIDA, fam.id, 'main.js') });
  const caidas = caidasDe(r.salida);
  console.log(`        ${fam.id}: ${caidas.length} caídas`);
  ok(`P18-REV ${fam.id}: la batería se pone ROJA (${fam.que})`, r.rojo && caidas.length > 0, r.salida.slice(-300));
  const sinCaer = fam.tumba.filter((re) => !caidas.some((c) => re.test(c)));
  ok(`P18-REV ${fam.id}: cae CADA grupo anunciado`, sinCaer.length === 0, 'no caen: ' + sinCaer.map(String).join(' '));
  const ajenas = caidas.filter((c) => !fam.tumba.some((re) => re.test(c)));
  ok(`P18-REV ${fam.id}: NO arrastra ninguna otra`, ajenas.length === 0, JSON.stringify(ajenas.slice(0, 8)));
  ok(`P18-REV ${fam.id}: la batería no revienta (llega a su resumen)`, /P18: \d+ OK \/ \d+ FALLOS/.test(r.salida), r.salida.slice(-300));
}

console.log('\n======================================================================');
console.log(`  P18 REVERSIONES: ${pass} OK / ${fail} FALLOS`);
console.log('======================================================================');
if (fail) process.exit(1);
