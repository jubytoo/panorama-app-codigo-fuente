'use strict';
const fs=require('fs'),path=require('path');
const PROJ='C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const initSqlJs=require(path.join(PROJ,'node_modules','sql.js'));
const UD=process.argv[2];
initSqlJs({wasmBinary:fs.readFileSync(path.join(PROJ,'node_modules','sql.js','dist','sql-wasm.wasm'))}).then(SQL=>{
  const v=new SQL.Database();
  v.run("CREATE TABLE projects(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, client TEXT, partition_name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL); CREATE TABLE app_meta(key TEXT PRIMARY KEY, value TEXT);");
  for(let i=1;i<=3;i++) v.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('LEGADO-"+i+"','C','persist:l"+i+"','x','x')");
  v.run("INSERT INTO app_meta VALUES ('app_theme','medianoche')");
  const b=Buffer.from(v.export()); v.close();
  fs.writeFileSync(path.join(UD,'panorama.sqlite3'),b);
  console.log('  BD legada sembrada: '+b.length+' B, 3 proyectos, sin .gen');
});
