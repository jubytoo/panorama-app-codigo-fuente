'use strict';
// Envuelve la lista CONSTS de cada arnes con B5.sinRepetir(), para que una
// constante declarada dos veces no rompa el ambito.
const fs = require('fs');
const path = require('path');
const S = path.join(__dirname, '..');
const OBJETIVOS = [
  path.join(S, 'bloque3', 'test-seguridad.js'),
  path.join(S, 'bloque4', 'test-acciones.js'),
  path.join(S, 'bloque4', 'test-consumidores.js'),
];
const VIEJO_A = 'const CONSTS = [';
const VIEJO_B = '].concat(B5.CONSTS_B5.map(lineaConst)).join(';
const NUEVO_A = 'const CONSTS = B5.sinRepetir([';
const NUEVO_B = '].concat(B5.CONSTS_B5.map(lineaConst))).join(';

for (const f of OBJETIVOS) {
  let t = fs.readFileSync(f, 'utf8');
  if (t.indexOf(NUEVO_A) >= 0) { console.log('  YA HECHO  ' + path.basename(f)); continue; }
  for (const [viejo, n] of [[VIEJO_A, 1], [VIEJO_B, 1]]) {
    const veces = t.split(viejo).length - 1;
    if (veces !== n) throw new Error(`${path.basename(f)}: "${viejo}" aparece ${veces} veces`);
  }
  t = t.replace(VIEJO_A, NUEVO_A).replace(VIEJO_B, NUEVO_B);
  fs.writeFileSync(f, t, 'utf8');
  console.log('  HECHO     ' + path.basename(f));
}
