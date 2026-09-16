'use strict';
// Diff unificado propio (no hay git en esta maquina).
const fs = require('fs');

function lcs(a, b) {
  const n = a.length, m = b.length;
  // Recorte de prefijo/sufijo comun para no montar una matriz gigante.
  let ini = 0;
  while (ini < n && ini < m && a[ini] === b[ini]) ini++;
  let fin = 0;
  while (fin < n - ini && fin < m - ini && a[n - 1 - fin] === b[m - 1 - fin]) fin++;
  const A = a.slice(ini, n - fin), B = b.slice(ini, m - fin);
  const N = A.length, M = B.length;
  const dp = [];
  for (let i = 0; i <= N; i++) dp.push(new Int32Array(M + 1));
  for (let i = N - 1; i >= 0; i--) {
    for (let j = M - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
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

function unified(viejo, nuevo, nombre, ctx) {
  const a = fs.readFileSync(viejo, 'utf8').split(/\r?\n/);
  const b = fs.readFileSync(nuevo, 'utf8').split(/\r?\n/);
  const ops = lcs(a, b);
  const C = ctx === undefined ? 3 : ctx;
  const interesa = ops.map((o) => o[0] !== ' ');
  const cerca = ops.map((_, k) => {
    for (let d = -C; d <= C; d++) if (interesa[k + d]) return true;
    return false;
  });
  const out = [];
  let la = 0, lb = 0, k = 0, hunks = 0, add = 0, del = 0;
  while (k < ops.length) {
    if (!cerca[k]) { if (ops[k][0] !== '+') la++; if (ops[k][0] !== '-') lb++; k++; continue; }
    const ia = la + 1, ib = lb + 1;
    const cuerpo = [];
    let ca = 0, cb = 0;
    while (k < ops.length && cerca[k]) {
      const [s, t] = ops[k];
      cuerpo.push(s + t);
      if (s !== '+') { la++; ca++; }
      if (s !== '-') { lb++; cb++; }
      if (s === '+') add++;
      if (s === '-') del++;
      k++;
    }
    out.push(`@@ -${ia},${ca} +${ib},${cb} @@`);
    out.push.apply(out, cuerpo);
    hunks++;
  }
  const cab = [`--- ${nombre} (antes)`, `+++ ${nombre} (despues)`];
  return { texto: cab.concat(out).join('\n') + '\n', add, del, hunks, antes: a.length, despues: b.length };
}

const pares = [
  ['C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1\\claude\\db.js.ANTES-BLOQUE3-2026-09-14',
   'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1\\db.js', 'db.js'],
  ['C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1\\claude\\main.js.ANTES-BLOQUE3-2026-09-14',
   'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1\\main.js', 'main.js'],
];
const dest = 'C:\\Users\\ADMIN~1.JLO\\AppData\\Local\\Temp\\claude\\C--Codigo-Fuente-PS\\e55d4471-ea3f-4279-b758-0366ccb6384c\\scratchpad\\bloque3\\';
for (const [v, n, nom] of pares) {
  const r = unified(v, n, nom);
  fs.writeFileSync(dest + nom + '.diff', r.texto, 'utf8');
  console.log(`${nom}:  ${r.antes} -> ${r.despues} lineas   +${r.add} / -${r.del}   ${r.hunks} hunks`);
}
