'use strict';
// ¿lastInsertRowId() se comportaba así ANTES de A3.3? Se carga la COPIA PREVIA
// de db.js (claude/db.js.ANTES-BLOQUE1-2026-09-14) y se mide lo mismo.
const fs = require('fs');
const path = require('path');
const os = require('os');
const Module = require('module');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const RAIZ = path.join(os.tmpdir(), '_a33-bloque1-PRUEBAS-lastid');
fs.rmSync(RAIZ, { recursive: true, force: true });
fs.mkdirSync(RAIZ, { recursive: true });
if (!RAIZ.includes('_a33-bloque1-PRUEBAS')) { console.error('ruta insegura'); process.exit(99); }

// La copia previa tiene extensión rara; se copia a un .js temporal para poder requerirla.
// Se copia DENTRO del proyecto para que require.resolve('sql.js/...') funcione.
// El script que lo lanza lo borra después.
const copiaPrevia = path.join(PROJ, 'claude', 'db.js.ANTES-BLOQUE1-2026-09-14');
const comoJs = path.join(PROJ, 'db-ANTIGUO-TEMP.js');
fs.copyFileSync(copiaPrevia, comoJs);

const DIR = path.join(RAIZ, 'datos');
fs.mkdirSync(DIR, { recursive: true });
const origLoad = Module._load;
Module._load = function (request) {
  if (request === 'electron') return { app: { getPath: () => DIR } };
  if (request === 'sql.js') return origLoad.call(this, path.join(PROJ, 'node_modules', 'sql.js'));
  return origLoad.apply(this, arguments);
};

(async () => {
  const viejo = require(comoJs);
  await viejo.getDb();
  const id = viejo.run(
    'INSERT INTO projects(name, client, partition_name, created_at, updated_at) VALUES (?,?,?,?,?)',
    ['P', 'C', 'persist:p', 'x', 'x']);
  const lir = viejo.lastInsertRowId();
  console.log('=== db.js ORIGINAL (copia previa) ===');
  console.log('  run() devolvió:            ' + id);
  console.log('  lastInsertRowId() devuelve: ' + lir);
  console.log('  ¿coinciden?                 ' + (id === lir));
  console.log('');
  console.log('CONCLUSIÓN: ' + (id === lir
    ? 'coincidían ANTES -> mi cambio SERÍA una regresión'
    : 'NO coincidían ANTES tampoco -> es comportamiento preexistente, no una regresión de A3.3'));
  fs.rmSync(RAIZ, { recursive: true, force: true });
  try { fs.unlinkSync(comoJs); } catch (e) {}
  console.log('módulo temporal retirado del proyecto: ' + !fs.existsSync(comoJs));
})();
