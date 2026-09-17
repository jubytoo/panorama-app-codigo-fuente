'use strict';
// ---------------------------------------------------------------------------
// F2 — ¿cada reversión tumba EXACTAMENTE lo que anuncia?
//
// Para cada familia de `revertir-f2.js` se lanza `test-f2.js` contra la copia
// revertida y se exige: (1) que la batería se ponga ROJA, (2) que caiga cada
// aserción anunciada, y (3) que NO caiga ninguna otra. Antes, el control:
// sin reversión la batería está verde.
// ---------------------------------------------------------------------------
const { execFileSync } = require('child_process');
const path = require('path');
const { FAMILIAS, SALIDA } = require('./revertir-f2.js');

const BAT = path.join(__dirname, 'test-f2.js');
let pass = 0, fail = 0;
function ok(n, c, extra) {
  if (c) { pass++; console.log('  OK    ' + n); }
  else { fail++; console.log('  FALLO ' + n + (extra === undefined ? '' : '  -- ' + extra)); }
}
function correr(env) {
  try {
    return { rojo: false, salida: execFileSync(process.execPath, [BAT], { encoding: 'utf8', env: { ...process.env, ...env } }) };
  } catch (e) {
    return { rojo: true, salida: (e.stdout || '') + (e.stderr || '') };
  }
}
const caidasDe = (s) => s.split(/\r?\n/).filter((l) => l.startsWith('  FALLO ')).map((l) => l.replace('  FALLO ', '').replace(/  -- .*$/, '').trim());

execFileSync(process.execPath, [path.join(__dirname, 'revertir-f2.js')], { stdio: 'inherit' });
console.log('');

const base = correr({});
ok('F2-REV0 sin reversión la batería está VERDE (control)', !base.rojo && /0 FALLOS/.test(base.salida), caidasDe(base.salida).join(' | '));

for (const fam of FAMILIAS) {
  const env = fam.archivo === 'main.js'
    ? { PANORAMA_MAIN: path.join(SALIDA, fam.id, 'main.js') }
    : { PANORAMA_PREPARACION: path.join(SALIDA, fam.id, 'plantilla_preparacion_reunion.html') };
  const r = correr(env);
  const caidas = caidasDe(r.salida);
  console.log(`        ${fam.id}: ${caidas.length} caídas`);
  ok(`F2-REV ${fam.id}: la batería se pone ROJA (${fam.que})`, r.rojo, r.salida.slice(-200));
  const sinCaer = fam.tumba.filter((re) => !caidas.some((c) => re.test(c)));
  ok(`F2-REV ${fam.id}: cae CADA aserción anunciada`, sinCaer.length === 0, 'no caen: ' + sinCaer.map(String).join(' '));
  const ajenas = caidas.filter((c) => !fam.tumba.some((re) => re.test(c)));
  ok(`F2-REV ${fam.id}: NO arrastra ninguna otra`, ajenas.length === 0, JSON.stringify(ajenas.slice(0, 6)));
}

console.log('\n======================================================================');
console.log(`  F2 REVERSIONES: ${pass} OK / ${fail} FALLOS`);
console.log('======================================================================');
if (fail) process.exit(1);
