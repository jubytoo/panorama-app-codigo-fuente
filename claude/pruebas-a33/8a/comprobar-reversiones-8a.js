'use strict';
// ---------------------------------------------------------------------------
// Block 8A / P23 — ¿cada reversión tumba EXACTAMENTE lo que anuncia?
// ---------------------------------------------------------------------------
const { execFileSync } = require('child_process');
const path = require('path');
const { FAMILIAS, SALIDA } = require('./revertir-8a.js');

const BAT = path.join(__dirname, 'test-8a-guardian.js');
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

execFileSync(process.execPath, [path.join(__dirname, 'revertir-8a.js')], { stdio: 'inherit' });
console.log('');

const base = correr({});
ok('8A-REV0 sin reversión la batería está VERDE (control)', !base.rojo && /8A: \d+ OK \/ 0 FALLOS/.test(base.salida), caidasDe(base.salida).join(' | '));

for (const fam of FAMILIAS) {
  const r = correr({ PANORAMA_MAIN: path.join(SALIDA, fam.id, 'main.js') });
  const caidas = caidasDe(r.salida);
  console.log(`        ${fam.id}: ${caidas.length} caídas`);
  ok(`8A-REV ${fam.id}: la batería se pone ROJA (${fam.que})`, r.rojo && caidas.length > 0, r.salida.slice(-300));
  const sinCaer = fam.tumba.filter((re) => !caidas.some((c) => re.test(c)));
  ok(`8A-REV ${fam.id}: cae CADA grupo anunciado`, sinCaer.length === 0, 'no caen: ' + sinCaer.map(String).join(' '));
  const ajenas = caidas.filter((c) => !fam.tumba.some((re) => re.test(c)));
  ok(`8A-REV ${fam.id}: NO arrastra ninguna otra`, ajenas.length === 0, JSON.stringify(ajenas.slice(0, 8)));
  ok(`8A-REV ${fam.id}: la batería no revienta (llega a su resumen)`, /8A: \d+ OK \/ \d+ FALLOS/.test(r.salida), r.salida.slice(-300));
}

console.log('\n======================================================================');
console.log(`  8A REVERSIONES: ${pass} OK / ${fail} FALLOS`);
console.log('======================================================================');
if (fail) process.exit(1);
