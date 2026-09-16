'use strict';
// `backup:save` paso a ser async (la purga D3 es una operacion completa con su
// commit). El arnes lo llamaba sin await y recibia un Promise, que stringifica
// como {} — un falso negativo. Se anade `await` en cada llamada.
//
// Se comprueba que todas las llamadas quedan dentro de una funcion async: las
// del arnes viven dentro del IIFE async principal.
const fs = require('fs');
const path = require('path');

const F = path.join(__dirname, '..', 'bloque4', 'test-consumidores.js');
let t = fs.readFileSync(F, 'utf8');

const LINEAS = t.split('\n');
let tocadas = 0;
for (let i = 0; i < LINEAS.length; i++) {
  const l = LINEAS[i];
  if (l.indexOf('guardarBackup(') < 0) continue;
  if (/await\s+m\d?\.guardarBackup\(/.test(l)) continue;      // ya tiene await
  if (l.indexOf('=> m.guardarBackup(') >= 0) continue;        // dentro de un then(): ya se resuelve
  const nueva = l.replace(/(^|[^.\w])(m\d?)\.guardarBackup\(/g, '$1await $2.guardarBackup(');
  if (nueva !== l) { LINEAS[i] = nueva; tocadas++; }
}
t = LINEAS.join('\n');
fs.writeFileSync(F, t, 'utf8');
console.log('  llamadas con await anadido: ' + tocadas);

// El bucle de 18 backups seguidos: sin await se encadenaban solos; con await
// hay que asegurarse de que sigue siendo secuencial (lo es: for + await).
const quedan = (t.match(/[^t]\s(m\d?)\.guardarBackup\(/g) || []).filter((s) => s.indexOf('await') < 0);
console.log('  llamadas sin await que quedan: ' + quedan.length);
