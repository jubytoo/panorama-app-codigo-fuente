'use strict';
// Engancha la lista de extraccion del Bloque 5 en los arneses del 3 y el 4.
// Cada sustitucion se verifica: si un ancla no aparece exactamente una vez, se
// aborta sin escribir nada.
const fs = require('fs');
const path = require('path');

const S = path.join(__dirname, '..');
const OBJETIVOS = [
  path.join(S, 'bloque3', 'test-seguridad.js'),
  path.join(S, 'bloque4', 'test-acciones.js'),
  path.join(S, 'bloque4', 'test-consumidores.js'),
];

const REQUIRE_LINEA = "const B5 = require(path.join(__dirname, '..', 'comun', 'bloque5-extraccion.js'));\n";

function unaVez(txt, aguja) {
  const n = txt.split(aguja).length - 1;
  if (n !== 1) throw new Error(`el ancla aparece ${n} veces: ${aguja.slice(0, 60)}`);
}

for (const f of OBJETIVOS) {
  let t = fs.readFileSync(f, 'utf8');
  const antes = t.length;
  if (t.indexOf('bloque5-extraccion') >= 0) { console.log('  YA ENGANCHADO  ' + path.basename(f)); continue; }

  unaVez(t, 'const BLOQUES = [');
  t = t.replace('const BLOQUES = [', REQUIRE_LINEA + 'const BLOQUES = [');

  // Cierre de la lista BLOQUES: el primer "\n];" despues de "const BLOQUES = ["
  const iB = t.indexOf('const BLOQUES = [');
  const fB = t.indexOf('\n];', iB);
  if (fB < 0) throw new Error('no se encontro el cierre de BLOQUES en ' + f);
  t = t.slice(0, fB + 3) +
    '\n// A3.3/BLOQUE 5: ejecutarAccionDeArchivo() y destinoOcupadoPorOtroEquipo()\n' +
    '// dependen ahora del dominio de ocupacion comun y de la puerta F-1, asi que\n' +
    '// el ambito real necesita tambien estas funciones de main.js.\n' +
    'BLOQUES.push.apply(BLOQUES, B5.BLOQUES_B5);\n' +
    t.slice(fB + 3);

  // Consts: se anaden al final del bloque CONSTS
  const iC = t.indexOf('const CONSTS = [');
  if (iC < 0) throw new Error('no se encontro CONSTS en ' + f);
  const cierreC = t.indexOf('].join(', iC);
  if (cierreC < 0) throw new Error('no se encontro el cierre de CONSTS en ' + f);
  t = t.slice(0, cierreC) +
    '].concat(B5.CONSTS_B5.map(lineaConst)).join(' +
    t.slice(cierreC + '].join('.length);

  fs.writeFileSync(f, t, 'utf8');
  console.log(`  ENGANCHADO     ${path.basename(f)}  ${antes} -> ${t.length} bytes`);
}
