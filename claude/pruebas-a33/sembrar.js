const fs=require('fs');const p='C:/Users/ADMIN~1.JLO/AppData/Local/Temp/claude/C--Codigo-Fuente-PS/e55d4471-ea3f-4279-b758-0366ccb6384c/scratchpad/real-run/sb/Roaming/panorama-app/panorama.sqlite3';
const init=require('C:/Codigo Fuente PS/panorama-app-codigo-fuente_1/node_modules/sql.js');
(async()=>{
 const SQL=await init({wasmBinary:fs.readFileSync('C:/Codigo Fuente PS/panorama-app-codigo-fuente_1/node_modules/sql.js/dist/sql-wasm.wasm')});
 const db=new SQL.Database(fs.readFileSync(p));
 db.run("INSERT INTO app_meta(key,value) VALUES ('app_theme','marfil') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
 db.run("INSERT INTO app_meta(key,value) VALUES ('bounds_launcher','{\"x\":40,\"y\":40,\"width\":1000,\"height\":700}') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
 db.run("INSERT INTO app_meta(key,value) VALUES ('sonda_inocua','valor-previo') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
 fs.writeFileSync(p,Buffer.from(db.export()));
 const r=db.exec('SELECT key,value FROM app_meta ORDER BY key');
 console.log('app_meta sembrada:'); r[0].values.forEach(v=>console.log('  '+v[0]+' = '+v[1]));
 db.close();
})();