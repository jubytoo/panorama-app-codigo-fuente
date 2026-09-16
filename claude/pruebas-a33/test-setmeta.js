// Pruebas de la corrección de setMeta.
// Usa el db.js REAL del proyecto (con `electron` sustituido por un doble
// mínimo) y el setMeta REAL extraído de main.js. Trabaja sobre una base de
// datos temporal; no toca los datos del usuario.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const Module = require('module');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const TMP = path.join(os.tmpdir(), 'panorama-setmeta-test');
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

// --- doble de `electron` para poder cargar el db.js real -------------------
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') return { app: { getPath: () => TMP } };
  return origLoad.apply(this, arguments);
};
const dbmod = require(path.join(PROJ, 'db.js'));

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  OK   ' + name); }
  else { fail++; console.log('  FALLO ' + name + (extra ? ' -- ' + extra : '')); }
}

// --- setMeta REAL, extraído de main.js -------------------------------------
const src = fs.readFileSync(path.join(PROJ, 'main.js'), 'utf8');
const mSet = /function setMeta\(key, value\) \{[\s\S]*?\n\}/.exec(src);
const mGet = /function getMeta\(key\) \{[\s\S]*?\n\}/.exec(src);
const mDel = /function deleteMeta\(key\) \{[\s\S]*?\n\}/.exec(src);
if (!mSet || !mGet || !mDel) { console.log('NO SE PUDO EXTRAER setMeta/getMeta/deleteMeta'); process.exit(1); }
console.log('setMeta extraído de main.js:\n' + mSet[0].split('\n').filter((l) => !l.trim().startsWith('//')).join('\n'));
// B2 añadió a setMeta/deleteMeta la guarda `if (procesoComprometido) return;`,
// así que hay que dárselo al ámbito. Se expone también un modo para poder
// comprobar que la guarda hace lo que dice.
const construir = new Function(
  'dbmod', 'estado',
  'let procesoComprometido = false;\n' +
    'Object.defineProperty(estado, "comprometido", { set(v){ procesoComprometido = v; }, get(){ return procesoComprometido; } });\n' +
    mSet[0] + '\n' + mGet[0] + '\n' + mDel[0] + '\nreturn { setMeta, getMeta, deleteMeta };'
);
const estadoB2 = {};
const { setMeta, getMeta, deleteMeta } = construir(dbmod, estadoB2);

// versión ANTIGUA, para comparar el antes/después
function setMetaAntiguo(key, value) {
  dbmod.run('DELETE FROM app_meta WHERE key=?', [key]);
  dbmod.run('INSERT INTO app_meta(key, value) VALUES (?,?)', [key, value]);
}

// --- lectura independiente del archivo EN DISCO ----------------------------
const initSqlJs = require(path.join(PROJ, 'node_modules', 'sql.js'));
let SQL = null;
async function leerDeDisco(key) {
  if (!SQL) SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(PROJ, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')) });
  const d = new SQL.Database(fs.readFileSync(path.join(TMP, 'panorama.sqlite3')));
  const r = d.exec('SELECT value FROM app_meta WHERE key=' + JSON.stringify(key));
  d.close();
  return r.length && r[0].values.length ? r[0].values[0][0] : null;
}

(async () => {
  await dbmod.getDb();

  console.log('\n=== 1. Crear una clave nueva ===');
  setMeta('clave_nueva', 'valor-1');
  check('getMeta devuelve el valor', getMeta('clave_nueva') === 'valor-1');
  check('está en el archivo de disco', (await leerDeDisco('clave_nueva')) === 'valor-1');

  console.log('\n=== 2. Actualizar una clave existente ===');
  setMeta('clave_nueva', 'valor-2');
  check('getMeta devuelve el valor nuevo', getMeta('clave_nueva') === 'valor-2');
  check('el disco tiene el valor nuevo', (await leerDeDisco('clave_nueva')) === 'valor-2');
  const filas = dbmod.all("SELECT key FROM app_meta WHERE key='clave_nueva'");
  check('sigue habiendo UNA sola fila (no duplica)', filas.length === 1, 'filas=' + filas.length);

  console.log('\n=== 3. Las 10 claves reales de producción ===');
  const reales = {
    app_theme: 'medianoche',
    'bounds_candidate-eval': '{"x":100,"y":100,"width":1100,"height":850}',
    bounds_launcher: '{"x":0,"y":0,"width":960,"height":680}',
    'bounds_meeting-prep': '{"x":10,"y":10,"width":860,"height":900}',
    bounds_project: '{"x":0,"y":0,"width":1400,"height":880}',
    last_vacuum_at: String(Date.now()),
    security_enabled: '1',
    security_remembered: Buffer.from('blob-dpapi-simulado-de-48-bytes-aprox-xxxxxx').toString('base64'),
    security_salt: 'aa'.repeat(16),
    security_verifier: 'bb'.repeat(32),
  };
  Object.keys(reales).forEach((k) => setMeta(k, reales[k]));
  let todas = true;
  for (const k of Object.keys(reales)) {
    if (getMeta(k) !== reales[k]) { todas = false; console.log('    difiere en memoria: ' + k); }
    if ((await leerDeDisco(k)) !== reales[k]) { todas = false; console.log('    difiere en disco: ' + k); }
  }
  check('las 10 claves se escriben y se releen idénticas', todas);
  // sobrescribir todas otra vez (camino UPDATE)
  Object.keys(reales).forEach((k) => setMeta(k, reales[k] + '-v2'));
  let todas2 = true;
  for (const k of Object.keys(reales)) { if ((await leerDeDisco(k)) !== reales[k] + '-v2') todas2 = false; }
  check('sobrescribir las 10 funciona igual', todas2);
  const total = dbmod.all('SELECT key FROM app_meta').length;
  check('no se han duplicado filas (11 claves en total)', total === 11, 'total=' + total);

  console.log('\n=== 4. deleteMeta sigue funcionando ===');
  deleteMeta('clave_nueva');
  check('getMeta devuelve null', getMeta('clave_nueva') === null);
  check('el disco ya no la tiene', (await leerDeDisco('clave_nueva')) === null);

  console.log('\n=== 5. FALLO DE PERSISTENCIA — comparación antes/después ===');
  const realWrite = fs.writeFileSync;
  let fallarEnEscritura = 0; // nº de la escritura que debe fallar (1 = la primera)
  let contador = 0;
  fs.writeFileSync = function (p, ...rest) {
    if (String(p).includes('panorama.sqlite3.tmp-')) {
      contador++;
      if (fallarEnEscritura && contador === fallarEnEscritura) throw new Error('FALLO INYECTADO de persistencia');
    }
    return realWrite.call(fs, p, ...rest);
  };

  // --- patrón ANTIGUO: falla la SEGUNDA persistencia (la del INSERT) -------
  setMeta('sal_de_prueba', 'SAL-ORIGINAL');
  check('preparación: la sal está en disco', (await leerDeDisco('sal_de_prueba')) === 'SAL-ORIGINAL');
  contador = 0; fallarEnEscritura = 2;
  let lanzo = false;
  try { setMetaAntiguo('sal_de_prueba', 'SAL-NUEVA'); } catch (e) { lanzo = true; }
  fallarEnEscritura = 0;
  const trasAntiguo = await leerDeDisco('sal_de_prueba');
  check('[ANTIGUO] la operación lanza', lanzo);
  check('[ANTIGUO] la clave se PIERDE del disco (el bug)', trasAntiguo === null, 'en disco quedó: ' + trasAntiguo);

  // restaurar el estado
  setMeta('sal_de_prueba', 'SAL-ORIGINAL');
  check('estado restaurado para la segunda mitad', (await leerDeDisco('sal_de_prueba')) === 'SAL-ORIGINAL');

  // --- patrón NUEVO: falla su ÚNICA persistencia ---------------------------
  contador = 0; fallarEnEscritura = 1;
  let lanzo2 = false;
  try { setMeta('sal_de_prueba', 'SAL-NUEVA'); } catch (e) { lanzo2 = true; }
  fallarEnEscritura = 0;
  const trasNuevo = await leerDeDisco('sal_de_prueba');
  check('[NUEVO] la operación lanza igual', lanzo2);
  check('[NUEVO] la clave CONSERVA su valor anterior en disco', trasNuevo === 'SAL-ORIGINAL', 'en disco quedó: ' + trasNuevo);
  check('[NUEVO] nunca queda ausente', trasNuevo !== null);

  fs.writeFileSync = realWrite;

  console.log('\n=== 6. Una sola persistencia por setMeta (antes eran dos) ===');
  let escrituras = 0;
  fs.writeFileSync = function (p, ...rest) { if (String(p).includes('panorama.sqlite3.tmp-')) escrituras++; return realWrite.call(fs, p, ...rest); };
  escrituras = 0; setMeta('conteo', 'a');
  const nNuevo = escrituras;
  escrituras = 0; setMetaAntiguo('conteo', 'b');
  const nAntiguo = escrituras;
  fs.writeFileSync = realWrite;
  check('nuevo = 1 escritura completa de la BD', nNuevo === 1, 'fueron ' + nNuevo);
  check('antiguo = 2 escrituras completas de la BD', nAntiguo === 2, 'fueron ' + nAntiguo);

  console.log('\n=== 7. Guarda de B2: con el proceso comprometido no se escribe ===');
  setMeta('guardada_b2', 'valor-original');
  check('preparación', (await leerDeDisco('guardada_b2')) === 'valor-original');
  estadoB2.comprometido = true;
  setMeta('guardada_b2', 'NO-DEBERIA-ESCRIBIRSE');
  deleteMeta('guardada_b2');
  check('setMeta no escribe con el proceso comprometido', (await leerDeDisco('guardada_b2')) === 'valor-original');
  check('deleteMeta tampoco borra', (await leerDeDisco('guardada_b2')) !== null);
  estadoB2.comprometido = false;
  setMeta('guardada_b2', 'de-nuevo-ok');
  check('al levantar la marca, vuelve a escribir', (await leerDeDisco('guardada_b2')) === 'de-nuevo-ok');

  console.log('\n==================================================');
  console.log('  PRUEBAS: ' + pass + ' OK, ' + fail + ' FALLOS');
  console.log('==================================================');
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
  process.exit(fail ? 1 : 0);
})();
