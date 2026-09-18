'use strict';
// ---------------------------------------------------------------------------
// Block 8B — REVERSIONES. Cada familia deshace UNA decisión del saneamiento
// del lock residual local y anuncia qué aserciones de test-b8b-lock.js tiene
// que tumbar (y solo esas). Escribe las copias en `b8b/revertidos/<familia>/
// main.js`. NO toca producción.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const SALIDA = path.join(__dirname, 'revertidos');
const MAIN = fs.readFileSync(path.join(PROJ, 'main.js'), 'utf8');

function cambiar(src, busca, pone, veces) {
  const n = src.split(busca).length - 1;
  if (n === 0) throw new Error('NO SE ENCONTRO: ' + busca.slice(0, 80));
  if (veces !== undefined && n !== veces) throw new Error(`se esperaban ${veces} apariciones y hay ${n}: ${busca.slice(0, 60)}`);
  return src.split(busca).join(pone);
}

const FAMILIAS = [
  {
    id: 'M-solo-machine',
    que: 'esResiduoLocalPropio() vuelve a ignorar `user`, solo compara `machine`',
    tumba: [/^B8B-3 /],
    hacer: () => cambiar(MAIN,
      '  return existing.machine === actual.machine && existing.user === actual.user;\n',
      '  return existing.machine === actual.machine; // REVERSIÓN Block8B-M: user ignorado a propósito\n', 1),
  },
  {
    id: 'N-sin-autorrecuperacion',
    que: 'checkMultiPcLock() deja de reconocer el residuo local: vuelve a preguntar siempre que el lock esté fresco',
    tumba: [/^B8B-2 /, /^B8B-10 /],
    hacer: () => cambiar(
      cambiar(MAIN,
        '      if (esResiduoLocalPropio(existing)) {\n' +
        '        // Block 8B: mismo equipo Y mismo usuario -> residuo local de un\n' +
        '        // cierre no limpio anterior, no "otro equipo". Se retoma sin\n' +
        '        // preguntar ni mostrar PS-1012 (ver esResiduoLocalPropio más arriba).\n' +
        '        appLog(`Bloqueo multi-PC reconocido como residuo local (mismo equipo/usuario, hace ${ageSeconds}s) — se retoma sin preguntar.`);\n' +
        '      } else {\n' +
        '        const choice = dialog.showMessageBoxSync(undefined, {\n',
        '        // REVERSIÓN Block8B-N: sin reconocimiento de residuo local\n' +
        '        const choice = dialog.showMessageBoxSync(undefined, {\n', 1),
      '        appLog(`El usuario decidió abrir igualmente pese al bloqueo activo de ${existing.machine}/${existing.user} (hace ${ageSeconds}s).`);\n' +
      '      }\n' +
      '    }\n' +
      '  }\n' +
      '\n' +
      '  await writeMultiPcLockNow();',
      '        appLog(`El usuario decidió abrir igualmente pese al bloqueo activo de ${existing.machine}/${existing.user} (hace ${ageSeconds}s).`);\n' +
      '    }\n' +
      '  }\n' +
      '\n' +
      '  await writeMultiPcLockNow();', 1),
  },
];

if (require.main === module) {
  fs.rmSync(SALIDA, { recursive: true, force: true });
  console.log('REVERSIONES BLOCK 8B');
  console.log('  origen: ' + path.join(PROJ, 'main.js'));
  for (const fam of FAMILIAS) {
    const src = fam.hacer();
    if (src === MAIN) throw new Error('la reversión no cambia nada: ' + fam.id);
    const dir = path.join(SALIDA, fam.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'main.js'), src, 'utf8');
    console.log(`  [LISTA] ${fam.id}`);
    console.log(`          ${fam.que}`);
    console.log(`          debería romper: ${fam.tumba.map(String).join(' ')}`);
    console.log(`          copia: ${path.join(dir, 'main.js')}`);
  }
}

module.exports = { FAMILIAS, SALIDA };
