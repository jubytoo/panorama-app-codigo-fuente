'use strict';
// SOLO LECTURA. Determina si el db.js integrado pudo haber tocado G:.
const fs = require('fs');
const path = require('path');
const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const initSqlJs = require(path.join(PROJ, 'node_modules', 'sql.js'));
const G = 'G:' + path.sep + 'Mi unidad' + path.sep + 'BD-PanoramaServicio';

console.log('--- PRUEBA 1: ¿existe el testigo .gen que A3.3 escribe SIEMPRE? ---');
['panorama.sqlite3.gen'].forEach((f) => {
  console.log('  ' + f + ': ' + (fs.existsSync(path.join(G, f)) ? 'EXISTE' : 'NO EXISTE'));
});
const tmps = fs.readdirSync(G).filter((f) => f.includes('.tmp-') || f.includes('.gen'));
console.log('  temporales / testigos A3.3 presentes: ' + (tmps.length ? tmps.join(', ') : 'NINGUNO'));

console.log('\n--- PRUEBA 2: ¿tiene la BD identidad de commit A3.3? ---');
initSqlJs({ wasmBinary: fs.readFileSync(path.join(PROJ, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')) }).then((SQL) => {
  const d = new SQL.Database(fs.readFileSync(path.join(G, 'panorama.sqlite3')));
  const r = d.exec("SELECT key FROM app_meta WHERE key LIKE 'db_commit%' OR key='db_generation'");
  const claves = r.length ? r[0].values.map((x) => x[0]) : [];
  console.log('  claves de identidad A3.3 en app_meta: ' + (claves.length ? claves.join(', ') : 'NINGUNA'));
  console.log('  claves totales: ' + d.exec('SELECT key FROM app_meta ORDER BY key')[0].values.map((x) => x[0]).join(', '));
  d.close();

  console.log('\n--- PRUEBA 3: ¿qué dice el app.log del usuario a esa hora? ---');
  const log = fs.readFileSync(path.join(G, 'app.log'), 'utf8').split(/\r?\n/);
  const ultimas = log.filter((l) => l.trim()).slice(-12);
  ultimas.forEach((l) => console.log('  ' + l.slice(0, 150)));

  console.log('\n--- CONCLUSIÓN ---');
  const sinGen = !fs.existsSync(path.join(G, 'panorama.sqlite3.gen'));
  const sinIdentidad = claves.length === 0;
  console.log('  El db.js integrado escribe SIEMPRE el .gen ANTES del .sqlite3,');
  console.log('  y añade db_commit_id a app_meta en la primera persistencia.');
  console.log('  .gen ausente:            ' + sinGen);
  console.log('  sin identidad de commit: ' + sinIdentidad);
  console.log('  => el db.js integrado NO ha escrito nunca en esta carpeta: ' + (sinGen && sinIdentidad));
});
