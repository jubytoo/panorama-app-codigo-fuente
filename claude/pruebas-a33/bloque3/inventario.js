'use strict';
// Inventario ESTATICO de escrituras de Security/A1 sobre main.js real.
// Solo lee el archivo: no abre la app, no toca datos.
const fs = require('fs');
const MAIN = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1\\main.js';
const L = fs.readFileSync(MAIN, 'utf8').split(/\r?\n/);

const RE = /dbmod\.(run|all|get|vacuum|escribirMultiple)\(|(?:^|[^\w.])setMeta\(|(?:^|[^\w.])deleteMeta\(|renameSync|writeFileSync|rmSync|unlinkSync|securityKey\s*=[^=]|rekeyInProgress\s*=/;

// [nombre, primeraLinea, ultimaLinea]
const F = [
  ['collectRekeyInventory', 3266, 3306],
  ['rekeySetFlagBulk', 3311, 3321],
  ['rekeyRestoreFlagsPerItem', 3327, 3333],
  ['applyRekeyMeta', 3344, 3354],
  ['rekeyAllUserFiles', 3359, 3536],
  ['recoverInterruptedRekeyIfAny', 3547, 3628],
  ['migrateLegacyInlineBackupsToFiles', 3644, 3677],
  ['finishSecurityWindow / rememberPassword / forgetRememberedPassword / tryAutoUnlock / runLoginFlow', 3921, 3975],
  ['ipcMain.handle security-win:submit', 3-3 + 7926, 8001],
  ['setMeta', 1275, 1279],
  ['deleteMeta', 1280, 1284],
];

for (const [nombre, a, b] of F) {
  console.log('');
  console.log('### ' + nombre + '  (lineas ' + a + '-' + b + ')');
  let n = 0;
  for (let i = a; i <= b; i++) {
    const l = L[i - 1];
    if (l === undefined) continue;
    const t = l.trim();
    if (t.startsWith('//') || t.startsWith('*')) continue;   // comentarios fuera
    if (RE.test(l)) { n++; console.log(String(i).padStart(6) + ': ' + t); }
  }
  if (n === 0) console.log('       (ninguna)');
}
