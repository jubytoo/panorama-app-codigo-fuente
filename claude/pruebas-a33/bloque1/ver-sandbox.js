'use strict';
const fs = require('fs');
const path = require('path');
const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const initSqlJs = require(path.join(PROJ, 'node_modules', 'sql.js'));
const SBOX = path.join(__dirname, 'sandbox-arranque');
const UD = path.join(SBOX, 'Roaming', 'panorama-app');
const CFG = path.join(SBOX, 'Roaming', 'panorama-app-config');

initSqlJs({ wasmBinary: fs.readFileSync(path.join(PROJ, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')) }).then((SQL) => {
  const g = JSON.parse(fs.readFileSync(path.join(UD, 'panorama.sqlite3.gen'), 'utf8'));
  console.log('--- panorama.sqlite3.gen ---');
  Object.keys(g).forEach((k) => console.log('  ' + k.padEnd(20) + String(g[k]).slice(0, 70)));

  const d = new SQL.Database(fs.readFileSync(path.join(UD, 'panorama.sqlite3')));
  console.log('\n--- app_meta de la BD del sandbox ---');
  d.exec('SELECT key,value FROM app_meta ORDER BY key')[0].values
    .forEach(([k, v]) => console.log('  ' + String(k).padEnd(24) + String(v).slice(0, 66)));

  const c = d.exec("SELECT value FROM app_meta WHERE key='db_commit_id'")[0].values[0][0];
  console.log('\n--- coherencia ---');
  console.log('  .gen commit_id == BD commit_id : ' + (g.commit_id === c));
  console.log('  integrity_check                : ' + d.exec('PRAGMA integrity_check')[0].values[0][0]);
  console.log('  tablas                         : ' +
    d.exec("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")[0].values.map((r) => r[0]).join(', '));
  console.log('  temporales huérfanos           : ' + fs.readdirSync(UD).filter((f) => f.includes('.tmp-')).length);
  d.close();

  console.log('\n--- carpeta de configuración LOCAL (el installation-id NO va en la carpeta de datos) ---');
  try {
    fs.readdirSync(CFG).forEach((f) => console.log('  ' + f + '  (' + fs.statSync(path.join(CFG, f)).size + ' B)'));
    console.log('  installation-id = ' + fs.readFileSync(path.join(CFG, 'installation-id'), 'utf8').slice(0, 40));
    console.log('  ¿coincide con el writer del .gen? ' +
      (fs.readFileSync(path.join(CFG, 'installation-id'), 'utf8').trim() === g.writer));
  } catch (e) { console.log('  (no hay carpeta de configuración: ' + e.code + ')'); }
});
