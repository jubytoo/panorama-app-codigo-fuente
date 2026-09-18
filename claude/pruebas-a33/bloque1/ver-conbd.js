'use strict';
// ---------------------------------------------------------------------------
// ARN-7 — validación de la adopción/migración de una BD legada (pre-A3.3).
//
// Antes era solo impresión (sin ok()/fallos). Se convierte en aserciones
// reales tras clasificar la duda de `parent_commit_id` (ver
// pendientes-abiertos.md «ARN-7»): el contrato real, leído en db.js (bloque
// ADOPCIÓN/bootstrap, "recibe un commit RAÍZ (padre nulo)"), es que el
// PRIMER commit que recibe una BD adoptada es raíz (parent_commit_id NULL).
// Un commit POSTERIOR en el MISMO arranque (aquí: el VACUUM de mantenimiento,
// que pasa por el mismo camino de escritura que cualquier run() — ver
// vacuum() en db.js) encadena correctamente: su parent_commit_id tiene que
// ser el penúltimo commit REAL de db_commit_history, nunca un valor
// arbitrario. Eso es justo lo que se exige abajo — no basta con "no es null".
// ---------------------------------------------------------------------------
const fs = require('fs'), path = require('path');
const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const initSqlJs = require(path.join(PROJ, 'node_modules', 'sql.js'));
const UD = process.argv[2];

let pass = 0, fail = 0;
function ok(n, c, extra) {
  if (c) { pass++; console.log('  OK    ' + n); }
  else { fail++; console.log('  FALLO ' + n + (extra === undefined ? '' : '  -- ' + extra)); }
}

initSqlJs({ wasmBinary: fs.readFileSync(path.join(PROJ, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')) }).then((SQL) => {
  const d = new SQL.Database(fs.readFileSync(path.join(UD, 'panorama.sqlite3')));
  const meta = (k) => {
    const r = d.exec("SELECT value FROM app_meta WHERE key='" + k + "'");
    return r.length ? r[0].values[0][0] : null;
  };
  const n = d.exec("SELECT COUNT(*) FROM projects WHERE name LIKE 'LEGADO-%'")[0].values[0][0];
  const t = meta('app_theme');
  const c = meta('db_commit_id');
  const gen = meta('db_generation');
  const H = JSON.parse(meta('db_commit_history') || '[]');
  const integridad = d.exec('PRAGMA integrity_check')[0].values[0][0];
  let g = null;
  try { g = JSON.parse(fs.readFileSync(path.join(UD, 'panorama.sqlite3.gen'), 'utf8')); } catch (e) {}

  console.log('--- adopción de la BD legada en la app REAL ---');

  ok('proyectos legados conservados: 3 de 3', n === 3, 'n=' + n);
  ok('app_theme conservado = medianoche', t === 'medianoche', 't=' + t);
  ok('recibió db_commit_id (32 hex)', typeof c === 'string' && /^[0-9a-f]{32}$/i.test(c), 'c=' + c);
  ok('.gen existe y es coherente con la BD (mismo commit_id)', !!g && g.commit_id === c, 'gen=' + (g && g.commit_id) + ' bd=' + c);
  // db_commit_history es MÁS-RECIENTE-PRIMERO: `[cNuevo].concat(hMem)` en
  // aplicarYConfirmar() (db.js:1437). H[0] es el commit actual, no el último.
  ok('db_generation coincide con la longitud del historial (por debajo del tope acotado)',
    Array.isArray(H) && String(H.length) === String(gen), 'gen=' + gen + ' H.length=' + (H && H.length));
  ok('db_commit_history empieza por el commit actual (más-reciente-primero)', Array.isArray(H) && H[0] === c, JSON.stringify(H));

  // El contrato de parent_commit_id depende de CUÁNTOS commits ha habido:
  //   - un solo commit (H.length===1): es el bootstrap -> RAÍZ, parent NULO
  //     (db.js: bloque ADOPCIÓN, "recibe un commit RAÍZ (padre nulo)").
  //   - más de uno (aquí: bootstrap + al menos una escritura de mantenimiento,
  //     p.ej. el VACUUM que pasa por el mismo camino que cualquier run() —
  //     ver vacuum() en db.js): el commit actual (H[0]) tiene que encadenar
  //     con el commit INMEDIATAMENTE ANTERIOR real (H[1]), nunca con un
  //     valor arbitrario ni con null.
  if (!Array.isArray(H) || H.length <= 1) {
    ok('parent_commit_id es RAÍZ (null) — primer y único commit de la adopción',
      !!g && g.parent_commit_id === null, JSON.stringify(g && g.parent_commit_id));
  } else {
    ok('parent_commit_id encadena con el commit REAL inmediatamente anterior del historial (H[1], no un valor arbitrario)',
      !!g && g.parent_commit_id === H[1],
      'parent=' + (g && g.parent_commit_id) + ' historial=' + JSON.stringify(H));
  }

  ok('integrity_check = ok', integridad === 'ok', 'integridad=' + integridad);

  d.close();
  console.log('');
  console.log('bloque1/ver-conbd: ' + pass + ' OK / ' + fail + ' FALLOS');
  if (fail) process.exitCode = 1;
}).catch((e) => { console.error('ver-conbd.js: ' + (e && e.stack || e)); process.exitCode = 2; });
