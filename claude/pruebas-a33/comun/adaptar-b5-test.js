'use strict';
// Adapta test-borrados.js al helper YA CABLEADO en main.js:
//  - el cableado de ocupacion/F-1 ya no se inyecta (es real): se quitan esos
//    argumentos de construirMain();
//  - ejecutarBorrado / recuperarBorradosPendientes / finalizarPurga son async.
const fs = require('fs');
const path = require('path');
const F = path.join(__dirname, '..', 'bloque5', 'test-borrados.js');
let t = fs.readFileSync(F, 'utf8');
const antes = t.length;

// 1) construirMain(est, { ocupacion: ..., puertaF1: ... }) -> construirMain(est)
let n1 = 0;
t = t.replace(/construirMain\((\w+),\s*\{[^}]*ocupacion:[^}]*\}\)/g, (m, v) => { n1++; return `construirMain(${v})`; });

// 2) await en las funciones que pasaron a async
const ASYNC = ['ejecutarBorrado', 'recuperarBorradosPendientes', 'resolverBorradoPendiente', 'finalizarPurga', 'purgarBackupsAntiguos'];
let n2 = 0;
for (const fn of ASYNC) {
  const re = new RegExp('(^|[^.\\w])(H2?|M2?)\\.' + fn + '\\(', 'g');
  t = t.replace(re, (m, pre, obj, off) => {
    // no duplicar si ya viene precedido de await
    const antesTxt = t.slice(Math.max(0, off - 12), off + pre.length);
    if (/await\s*$/.test(antesTxt)) return m;
    n2++;
    return `${pre}await ${obj}.${fn}(`;
  });
}

fs.writeFileSync(F, t, 'utf8');
console.log(`  construirMain sin inyecciones: ${n1}`);
console.log(`  llamadas con await anadido:    ${n2}`);
console.log(`  ${antes} -> ${t.length} bytes`);
const sobran = (t.match(/[^t]\s(H2?|M2?)\.(ejecutarBorrado|recuperarBorradosPendientes|finalizarPurga)\(/g) || [])
  .filter((s) => s.indexOf('await') < 0);
console.log('  llamadas async sin await que quedan: ' + sobran.length);
