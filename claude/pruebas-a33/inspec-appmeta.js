// Inspección del esquema REAL de app_meta sobre una COPIA de la base de datos
// del usuario. Solo lectura; el original no se abre en ningún momento.
'use strict';
const fs = require('fs');
const path = require('path');
const initSqlJs = require('C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1\\node_modules\\sql.js');

const COPIA = process.argv[2];

(async () => {
  const wasm = require.resolve('C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1\\node_modules\\sql.js\\dist\\sql-wasm.wasm');
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(wasm) });
  const db = new SQL.Database(fs.readFileSync(COPIA));

  const q = (sql) => { const r = db.exec(sql); return r.length ? r[0] : { columns: [], values: [] }; };
  const show = (t, sql) => {
    const r = q(sql);
    console.log('\n=== ' + t + ' ===');
    if (!r.values.length) { console.log('(sin filas)'); return; }
    console.log(r.columns.join(' | '));
    r.values.forEach((v) => console.log(v.map((x) => (x === null ? 'NULL' : String(x))).join(' | ')));
  };

  console.log('SQLite version: ' + q('SELECT sqlite_version()').values[0][0]);
  console.log('foreign_keys  : ' + q('PRAGMA foreign_keys').values[0][0] + '   (0 = desactivadas)');
  console.log('recursive_triggers: ' + q('PRAGMA recursive_triggers').values[0][0]);

  show('DDL completo de la base de datos', "SELECT type, name, sql FROM sqlite_master ORDER BY type, name");
  show('TRIGGERS (cualquiera)', "SELECT name, tbl_name, sql FROM sqlite_master WHERE type='trigger'");
  show('columnas de app_meta', "SELECT cid, name, type, [notnull], dflt_value, pk FROM pragma_table_info('app_meta')");
  show('indices de app_meta', "SELECT name, [unique], origin, partial FROM pragma_index_list('app_meta')");
  show('claves foraneas de app_meta', "SELECT * FROM pragma_foreign_key_list('app_meta')");
  show('¿es tabla WITHOUT ROWID?', "SELECT name, sql FROM sqlite_master WHERE type='table' AND name='app_meta'");

  const keys = q("SELECT key, length(value) AS bytes FROM app_meta ORDER BY key");
  console.log('\n=== claves REALES presentes en app_meta (' + keys.values.length + ') ===');
  keys.values.forEach((v) => console.log('  ' + String(v[0]).padEnd(28) + ' valor de ' + v[1] + ' bytes'));

  db.close();
})();
