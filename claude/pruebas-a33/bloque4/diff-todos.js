'use strict';
// Diff unificado de TODOS los archivos tocados en el paso 4.
// El "antes" de preload.js y de las plantillas sale de la copia intacta del
// proyecto (C:\Codigo Fuente PS - copia), que no se ha tocado en toda la sesion.
const fs = require('fs');
const path = require('path');

function lcs(a, b) {
  const n = a.length, m = b.length;
  let ini = 0; while (ini < n && ini < m && a[ini] === b[ini]) ini++;
  let fin = 0; while (fin < n - ini && fin < m - ini && a[n - 1 - fin] === b[m - 1 - fin]) fin++;
  const A = a.slice(ini, n - fin), B = b.slice(ini, m - fin);
  const N = A.length, M = B.length;
  const dp = []; for (let i = 0; i <= N; i++) dp.push(new Int32Array(M + 1));
  for (let i = N - 1; i >= 0; i--) for (let j = M - 1; j >= 0; j--)
    dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = [];
  for (let k = 0; k < ini; k++) ops.push([' ', a[k]]);
  let i = 0, j = 0;
  while (i < N && j < M) {
    if (A[i] === B[j]) { ops.push([' ', A[i]]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push(['-', A[i]]); i++; }
    else { ops.push(['+', B[j]]); j++; }
  }
  while (i < N) { ops.push(['-', A[i]]); i++; }
  while (j < M) { ops.push(['+', B[j]]); j++; }
  for (let k = 0; k < fin; k++) ops.push([' ', a[n - fin + k]]);
  return ops;
}
function unified(viejo, nuevo, nombre) {
  const a = fs.readFileSync(viejo, 'utf8').split(/\r?\n/);
  const b = fs.readFileSync(nuevo, 'utf8').split(/\r?\n/);
  const ops = lcs(a, b);
  const C = 3;
  const in_ = ops.map((o) => o[0] !== ' ');
  const cerca = ops.map((_, k) => { for (let d = -C; d <= C; d++) if (in_[k + d]) return true; return false; });
  const out = [`--- ${nombre} (antes)`, `+++ ${nombre} (despues)`];
  let la = 0, lb = 0, k = 0, h = 0, ad = 0, de = 0;
  while (k < ops.length) {
    if (!cerca[k]) { if (ops[k][0] !== '+') la++; if (ops[k][0] !== '-') lb++; k++; continue; }
    const ia = la + 1, ib = lb + 1; const cu = []; let ca = 0, cb = 0;
    while (k < ops.length && cerca[k]) {
      const [s, t] = ops[k]; cu.push(s + t);
      if (s !== '+') { la++; ca++; } if (s !== '-') { lb++; cb++; }
      if (s === '+') ad++; if (s === '-') de++; k++;
    }
    out.push(`@@ -${ia},${ca} +${ib},${cb} @@`); out.push.apply(out, cu); h++;
  }
  return { texto: out.join('\n') + '\n', ad, de, h, na: a.length, nb: b.length };
}

const ACT = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const COPIA = 'C:\\Codigo Fuente PS - copia\\panorama-app-codigo-fuente_1';
const DEST = 'C:\\Users\\ADMIN~1.JLO\\AppData\\Local\\Temp\\claude\\C--Codigo-Fuente-PS\\e55d4471-ea3f-4279-b758-0366ccb6384c\\scratchpad\\bloque4\\';

const PARES = [
  [path.join(ACT, 'claude', 'main.js.ANTES-BLOQUE4-2026-09-14'), path.join(ACT, 'main.js'), 'main.js', 'BLOQUE4'],
  [path.join(COPIA, 'preload.js'), path.join(ACT, 'preload.js'), 'preload.js', 'copia intacta'],
  [path.join(COPIA, 'dashboard', 'plantilla_dashboard.html'), path.join(ACT, 'dashboard', 'plantilla_dashboard.html'), 'plantilla_dashboard.html', 'copia intacta'],
  [path.join(COPIA, 'directorio', 'plantilla_directorio.html'), path.join(ACT, 'directorio', 'plantilla_directorio.html'), 'plantilla_directorio.html', 'copia intacta'],
  [path.join(COPIA, 'preparacion-reunion', 'plantilla_preparacion_reunion.html'), path.join(ACT, 'preparacion-reunion', 'plantilla_preparacion_reunion.html'), 'plantilla_preparacion_reunion.html', 'copia intacta'],
  [path.join(COPIA, 'evaluacion-candidatos', 'plantilla_evaluacion_candidatos.html'), path.join(ACT, 'evaluacion-candidatos', 'plantilla_evaluacion_candidatos.html'), 'plantilla_evaluacion_candidatos.html', 'copia intacta'],
];

const todo = [];
for (const [v, n, nom, base] of PARES) {
  const r = unified(v, n, nom);
  fs.writeFileSync(DEST + nom + '.diff', r.texto, 'utf8');
  console.log(`${nom.padEnd(40)} ${String(r.na).padStart(5)} -> ${String(r.nb).padStart(5)}   +${r.ad} / -${r.de}   ${r.h} hunks   (base: ${base})`);
  todo.push(r.texto);
}
fs.writeFileSync(DEST + 'TODOS.diff', todo.join('\n'), 'utf8');
console.log('\ndiff conjunto: ' + DEST + 'TODOS.diff');
