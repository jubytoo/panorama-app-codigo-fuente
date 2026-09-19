'use strict';
// ---------------------------------------------------------------------------
// P28 — ¿cada reversión tumba EXACTAMENTE lo que anuncia?
//
//   node comprobar-reversiones-p28.js              comprobación completa
//   node comprobar-reversiones-p28.js --calibrar   solo IMPRIME qué cae en cada familia
//   node comprobar-reversiones-p28.js --solo=R3    una sola familia (prefijo del id)
//
// Las copias revertidas se escriben TEMPORALMENTE en la raíz del proyecto y se
// borran siempre al terminar, con éxito o con fallo.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const { FAMILIAS, rutaRevertida } = require('./revertir-p28.js');
const { ejecutarBateria } = require('./comprobar-p28.js');
const { execFileSync } = require('child_process');

const calibrar = process.argv.includes('--calibrar');
const solo = (process.argv.find((a) => a.startsWith('--solo=')) || '').slice(7);

let pass = 0, fail = 0;
function ok(n, c, extra) {
  if (c) { pass++; console.log('  OK    ' + n); }
  else { fail++; console.log('  FALLO ' + n + (extra === undefined ? '' : '  -- ' + extra)); }
}
function limpiarCopiasRevertidas() {
  for (const fam of FAMILIAS) { try { fs.rmSync(rutaRevertida(fam.id), { force: true }); } catch (e) {} }
}

(async () => {
  try {
    limpiarCopiasRevertidas();
    execFileSync(process.execPath, [path.join(__dirname, 'revertir-p28.js')], { stdio: 'inherit' });
    console.log('');
    if (!calibrar && !solo) {
      console.log('=== CONTROL: batería completa contra main.js sin revertir ===');
      const base = await ejecutarBateria({});
      ok('P28-REV0 sin reversión la batería está VERDE (control)', base.fail === 0, base.fallos.join(' | '));
    }
    for (const fam of FAMILIAS) {
      if (solo && !fam.id.startsWith(solo)) continue;
      console.log(`\n=== ${fam.id} ===`);
      const r = await ejecutarBateria({ PANORAMA_MAIN: rutaRevertida(fam.id) });
      console.log(`        ${fam.id}: ${r.fallos.length} caídas`);
      if (calibrar) {
        console.log(`CALIBRAR ${fam.id}:`);
        for (const c of r.fallos) console.log('   - ' + c);
        continue;
      }
      ok(`P28-REV ${fam.id}: la batería se pone ROJA (${fam.que})`, r.fail > 0, r.fallos.join(' | '));
      const sinCaer = fam.tumba.filter((re) => !r.fallos.some((c) => re.test(c)));
      ok(`P28-REV ${fam.id}: cae CADA grupo anunciado`, sinCaer.length === 0, 'no caen: ' + sinCaer.map(String).join(' '));
      const ajenas = r.fallos.filter((c) => !fam.tumba.some((re) => re.test(c)));
      ok(`P28-REV ${fam.id}: NO arrastra ninguna otra`, ajenas.length === 0, JSON.stringify(ajenas.slice(0, 8)));
    }
  } finally {
    limpiarCopiasRevertidas();
  }
  if (!calibrar) {
    console.log('\n======================================================================');
    console.log(`  P28 REVERSIONES: ${pass} OK / ${fail} FALLOS`);
    console.log('======================================================================');
    if (fail) process.exitCode = 1;
  }
})();
