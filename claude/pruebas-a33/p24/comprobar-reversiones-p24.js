'use strict';
// ---------------------------------------------------------------------------
// P24 — ¿cada reversión tumba EXACTAMENTE lo que anuncia?
//
// Las copias revertidas se escriben TEMPORALMENTE en la raíz del proyecto
// (ver revertir-p24.js: `require('./db')`/rutas de `__dirname` solo
// resuelven ahí) y se borran siempre al terminar, con éxito o con fallo.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const { FAMILIAS, rutaRevertida } = require('./revertir-p24.js');
const { ejecutarBateria } = require('./comprobar-p24.js');
const { execFileSync } = require('child_process');

let pass = 0, fail = 0;
function ok(n, c, extra) {
  if (c) { pass++; console.log('  OK    ' + n); }
  else { fail++; console.log('  FALLO ' + n + (extra === undefined ? '' : '  -- ' + extra)); }
}

function limpiarCopiasRevertidas() {
  for (const fam of FAMILIAS) {
    try { fs.rmSync(rutaRevertida(fam.id), { force: true }); } catch (e) {}
  }
}

try {
  limpiarCopiasRevertidas(); // por si quedó algo de una corrida interrumpida
  execFileSync(process.execPath, [path.join(__dirname, 'revertir-p24.js')], { stdio: 'inherit' });
  console.log('');

  console.log('=== CONTROL: bateria completa contra main.js sin revertir ===');
  const base = ejecutarBateria({});
  ok('P24-REV0 sin reversión la batería está VERDE (control)', base.fail === 0, base.fallos.join(' | '));

  for (const fam of FAMILIAS) {
    console.log(`\n=== ${fam.id} ===`);
    const r = ejecutarBateria({ PANORAMA_MAIN: rutaRevertida(fam.id) });
    console.log(`        ${fam.id}: ${r.fallos.length} caídas`);
    ok(`P24-REV ${fam.id}: la batería se pone ROJA (${fam.que})`, r.fail > 0, r.fallos.join(' | '));
    const sinCaer = fam.tumba.filter((re) => !r.fallos.some((c) => re.test(c)));
    ok(`P24-REV ${fam.id}: cae CADA grupo anunciado`, sinCaer.length === 0, 'no caen: ' + sinCaer.map(String).join(' '));
    const ajenas = r.fallos.filter((c) => !fam.tumba.some((re) => re.test(c)));
    ok(`P24-REV ${fam.id}: NO arrastra ninguna otra`, ajenas.length === 0, JSON.stringify(ajenas.slice(0, 8)));
  }
} finally {
  limpiarCopiasRevertidas();
}

console.log('\n======================================================================');
console.log(`  P24 REVERSIONES: ${pass} OK / ${fail} FALLOS`);
console.log('======================================================================');
if (fail) process.exitCode = 1;
