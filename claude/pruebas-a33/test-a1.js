// Prueba estática/funcional de A1.
// Carga el bloque de re-cifrado TAL CUAL está escrito en main.js (no una
// reimplementación) y lo ejecuta contra un directorio temporal con datos
// sintéticos. No toca en ningún momento la carpeta de datos real del usuario.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const securitymod = require(path.join(PROJ, 'security.js'));

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  OK   ' + name); }
  else { fail++; console.log('  FALLO ' + name + (extra ? ' -- ' + extra : '')); }
}

// ---------------------------------------------------------------- security.js
console.log('\n=== 1. security.js (modulo real) ===');
const k1 = securitymod.deriveKey('clave-uno', securitymod.newSaltHex());
const k2 = securitymod.deriveKey('clave-dos', securitymod.newSaltHex());
const texto = JSON.stringify({ hola: 'mundo', acentos: 'áéíóú ñ ü €', n: 42 });
const env = securitymod.encryptString(k1, texto);
check('ida y vuelta con la clave correcta', securitymod.decryptString(k1, env) === texto);
let threw = false;
try { securitymod.decryptString(k2, env); } catch (e) { threw = true; }
check('descifrar con clave equivocada lanza', threw);
check('looksEncrypted(sobre) = true', securitymod.looksEncrypted(env) === true);
check('looksEncrypted(json plano) = false', securitymod.looksEncrypted(texto) === false);
check('looksEncrypted(texto suelto) = false', securitymod.looksEncrypted('no soy json') === false);
check('looksEncrypted(vacio) = false', securitymod.looksEncrypted('') === false);
check('looksEncrypted(no string) = false', securitymod.looksEncrypted(null) === false);
check('looksEncrypted con BOM delante = true', securitymod.looksEncrypted('\uFEFF' + env) === true);
check(
  'looksEncrypted(json que MENCIONA panoramaEncrypted dentro) = false',
  securitymod.looksEncrypted(JSON.stringify({ nota: 'panoramaEncrypted no soy', a: 1 })) === false
);

// ------------------------------------------- carga del bloque real de main.js
const src = fs.readFileSync(path.join(PROJ, 'main.js'), 'utf8').split(/\r?\n/);
const ini = src.findIndex((l) => l.startsWith("const REKEY_DIR_NAME = '.panorama-rekey';"));
const finMarca = src.findIndex((l) => l.includes('return { recovered: true, mode: journal.mode, finished };'));
if (ini < 0 || finMarca < 0) { console.log('NO SE PUDO LOCALIZAR EL BLOQUE A1 EN main.js'); process.exit(1); }
const bloque = src.slice(ini, finMarca + 2).join('\n');
console.log('\nBloque A1 extraido de main.js: lineas ' + (ini + 1) + '-' + (finMarca + 2) + ' (' + (finMarca + 2 - ini) + ' lineas)');

function nuevoEntorno(baseDir) {
  const estado = {
    logs: [], meta: {}, securityKey: null, baseDir,
    tablas: { backups: [], meeting_preps: [], candidate_evals: [] },
    fsFalla: null, // {op, path} para inyectar fallos
  };
  const fsWrap = Object.create(fs);
  fsWrap.renameSync = (a, b) => {
    if (estado.fsFalla && estado.fsFalla.op === 'rename' && String(a).includes(estado.fsFalla.path)) {
      throw new Error('FALLO INYECTADO en rename de ' + a);
    }
    return fs.renameSync(a, b);
  };
  fsWrap.writeFileSync = (p, d, e) => {
    if (estado.fsFalla && estado.fsFalla.op === 'write' && String(p).includes(estado.fsFalla.path)) {
      throw new Error('FALLO INYECTADO en write de ' + p);
    }
    return fs.writeFileSync(p, d, e);
  };
  const dbmod = {
    all(sql) {
      if (/FROM backups/.test(sql)) return estado.tablas.backups.map((r) => ({ rowKey: r.id, file_path: r.file_path, encrypted: r.encrypted, project_id: r.project_id, name: 'p' + r.project_id, backup_dir: 'dir' + r.project_id }));
      if (/FROM meeting_preps/.test(sql)) return estado.tablas.meeting_preps.map((r) => ({ rowKey: r.id, file_path: r.file_path, encrypted: r.encrypted, project_id: r.project_id, name: 'p' + r.project_id, backup_dir: 'dir' + r.project_id }));
      if (/FROM candidate_evals/.test(sql)) return estado.tablas.candidate_evals.map((r) => ({ rowKey: r.project_id, encrypted: r.encrypted, project_id: r.project_id, name: 'p' + r.project_id, backup_dir: 'dir' + r.project_id }));
      return [];
    },
    run(sql, params) {
      const m = /UPDATE (\w+) SET encrypted=\?/.exec(sql);
      if (m) {
        const t = estado.tablas[m[1]];
        if (/WHERE id=\?/.test(sql)) { const r = t.find((x) => x.id === params[1]); if (r) r.encrypted = params[0]; }
        else if (/WHERE project_id=\?/.test(sql)) { const r = t.find((x) => x.project_id === params[1]); if (r) r.encrypted = params[0]; }
        else t.forEach((r) => { r.encrypted = params[0]; });
      }
      return null;
    },
  };
  const ctx = {
    require, console, Buffer, process, JSON, Date, Math, String, Number, Array, Object, Error,
    fs: fsWrap, path,
    app: { getPath: () => estado.baseDir },
    dbmod, securitymod,
    appLog: (l) => estado.logs.push(l),
    errorCodeSuffix: () => '',
    setMeta: (k, v) => { estado.meta[k] = v; },
    deleteMeta: (k) => { delete estado.meta[k]; },
    backupsDirForProject: (row) => { const d = path.join(estado.baseDir, 'backups', row.backup_dir); fs.mkdirSync(d, { recursive: true }); return d; },
    meetingPrepsDirForProject: (row) => { const d = path.join(estado.baseDir, 'backups', row.backup_dir, 'reuniones'); fs.mkdirSync(d, { recursive: true }); return d; },
    candidateEvalFileForProject: (row) => { const d = path.join(estado.baseDir, 'backups', row.backup_dir, 'evaluacion-candidatos'); fs.mkdirSync(d, { recursive: true }); return path.join(d, 'estado.json'); },
    securityKey: null,
  };
  vm.createContext(ctx);
  vm.runInContext('let securityKey = null;\n' + bloque + '\nthis.__api = { rekeyAllUserFiles, recoverInterruptedRekeyIfAny, rekeyStagingDir, rekeyItemPath, collectRekeyInventory, get securityKey(){ return securityKey; } };', ctx);
  return { ctx, estado, api: ctx.__api };
}

// Monta un escenario: N backups + 1 reunion + 1 evaluacion, cifrados o no.
function montarEscenario(baseDir, key) {
  fs.rmSync(baseDir, { recursive: true, force: true });
  fs.mkdirSync(baseDir, { recursive: true });
  const env2 = nuevoEntorno(baseDir);
  const originales = {};
  const escribir = (abs, contenido) => {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, key ? securitymod.encryptString(key, contenido) : contenido, 'utf8');
    originales[abs] = contenido;
  };
  for (let p = 1; p <= 3; p++) {
    for (let b = 1; b <= 4; b++) {
      const f = `backup_${p}_${b}.json`;
      env2.estado.tablas.backups.push({ id: p * 100 + b, project_id: p, file_path: f, encrypted: key ? 1 : 0 });
      escribir(path.join(baseDir, 'backups', 'dir' + p, f), JSON.stringify({ proyecto: p, backup: b, datos: 'x'.repeat(500) }));
    }
    const rf = `reunion_${p}.json`;
    env2.estado.tablas.meeting_preps.push({ id: p, project_id: p, file_path: rf, encrypted: key ? 1 : 0 });
    escribir(path.join(baseDir, 'backups', 'dir' + p, 'reuniones', rf), JSON.stringify({ reunion: p }));
    env2.estado.tablas.candidate_evals.push({ project_id: p, encrypted: key ? 1 : 0 });
    escribir(path.join(baseDir, 'backups', 'dir' + p, 'evaluacion-candidatos', 'estado.json'), JSON.stringify({ puestos: [{ id: 'x' + p }] }));
  }
  return { env: env2, originales };
}

function leerDescifrado(abs, key) {
  const raw = fs.readFileSync(abs, 'utf8');
  return securitymod.looksEncrypted(raw) ? securitymod.decryptString(key, raw) : raw;
}

const TMP = path.join(os.tmpdir(), 'panorama-a1-test');
const K_VIEJA = securitymod.deriveKey('vieja', 'aa'.repeat(16));
const K_NUEVA = securitymod.deriveKey('nueva', 'bb'.repeat(16));

// ---------------------------------------------------------------- caso CHANGE
console.log('\n=== 2. CAMBIO DE CONTRASENA (change) ===');
{
  const { env, originales } = montarEscenario(path.join(TMP, 'change'), K_VIEJA);
  const res = env.api.rekeyAllUserFiles(K_VIEJA, K_NUEVA, { mode: 'change', newSalt: 'SALTNUEVA', newVerifier: 'VERIFNUEVO' });
  check('devuelve ok', res.ok === true, JSON.stringify(res));
  check('migra los 18 archivos (12 backups + 3 reuniones + 3 evaluaciones)', res.migrated === 18, 'migrated=' + res.migrated);
  let todos = true, ningunoVieja = true;
  for (const abs of Object.keys(originales)) {
    if (leerDescifrado(abs, K_NUEVA) !== originales[abs]) todos = false;
    try { securitymod.decryptString(K_VIEJA, fs.readFileSync(abs, 'utf8')); ningunoVieja = false; } catch (e) { /* correcto */ }
  }
  check('TODOS los archivos (las 3 familias) se leen con la clave NUEVA', todos);
  check('ninguno se puede leer ya con la clave vieja', ningunoVieja);
  check('sal y verificador consolidados', env.estado.meta.security_salt === 'SALTNUEVA' && env.estado.meta.security_verifier === 'VERIFNUEVO');
  check('security_enabled sigue a 1', env.estado.meta.security_enabled === '1');
  check('securityKey actualizada a la nueva', env.api.securityKey === K_NUEVA);
  check('columnas encrypted siguen a 1', env.estado.tablas.candidate_evals.every((r) => r.encrypted === 1));
  check('staging borrado al terminar', !fs.existsSync(env.api.rekeyStagingDir()));
}

// --------------------------------------------------------------- caso DISABLE
console.log('\n=== 3. DESACTIVAR CIFRADO (disable) ===');
{
  const { env, originales } = montarEscenario(path.join(TMP, 'disable'), K_VIEJA);
  const res = env.api.rekeyAllUserFiles(K_VIEJA, null, { mode: 'disable', newSalt: null, newVerifier: null });
  check('devuelve ok', res.ok === true, JSON.stringify(res));
  let todos = true, ningunoCifrado = true;
  for (const abs of Object.keys(originales)) {
    if (fs.readFileSync(abs, 'utf8') !== originales[abs]) todos = false;
    if (securitymod.looksEncrypted(fs.readFileSync(abs, 'utf8'))) ningunoCifrado = false;
  }
  check('todos los archivos quedan en claro y coinciden con el original', todos);
  check('ninguno sigue cifrado', ningunoCifrado);
  check('sal/verificador/enabled borrados', !env.estado.meta.security_salt && !env.estado.meta.security_verifier && !env.estado.meta.security_enabled);
  check('securityKey a null', env.api.securityKey === null);
  check('columnas encrypted a 0 en las 3 tablas',
    env.estado.tablas.backups.every((r) => r.encrypted === 0) &&
    env.estado.tablas.meeting_preps.every((r) => r.encrypted === 0) &&
    env.estado.tablas.candidate_evals.every((r) => r.encrypted === 0));
}

// ----------------------------------------------------------------- caso SETUP
console.log('\n=== 4. ACTIVAR CIFRADO (setup) ===');
{
  const { env, originales } = montarEscenario(path.join(TMP, 'setup'), null);
  const res = env.api.rekeyAllUserFiles(null, K_NUEVA, { mode: 'setup', newSalt: 'S1', newVerifier: 'V1' });
  check('devuelve ok', res.ok === true, JSON.stringify(res));
  let todos = true;
  for (const abs of Object.keys(originales)) {
    if (!securitymod.looksEncrypted(fs.readFileSync(abs, 'utf8'))) todos = false;
    else if (securitymod.decryptString(K_NUEVA, fs.readFileSync(abs, 'utf8')) !== originales[abs]) todos = false;
  }
  check('las 3 familias quedan cifradas y descifran al original', todos);
  check('columnas encrypted a 1 en las 3 tablas',
    env.estado.tablas.backups.every((r) => r.encrypted === 1) &&
    env.estado.tablas.meeting_preps.every((r) => r.encrypted === 1) &&
    env.estado.tablas.candidate_evals.every((r) => r.encrypted === 1));
}

// ------------------------------------------------- fallo en PREPARE (fase 1)
console.log('\n=== 5. FALLO EN FASE 1 (PREPARE): debe quedar TODO intacto ===');
{
  const { env, originales } = montarEscenario(path.join(TMP, 'fallo-prepare'), K_VIEJA);
  // Un archivo cifrado con OTRA clave: no se puede descifrar con la vieja.
  const victima = path.join(env.estado.baseDir, 'backups', 'dir2', 'backup_2_3.json');
  fs.writeFileSync(victima, securitymod.encryptString(K_NUEVA, 'contenido ajeno'), 'utf8');
  const antes = {}; Object.keys(originales).forEach((a) => { antes[a] = fs.readFileSync(a, 'utf8'); });
  const metaAntes = JSON.stringify(env.estado.meta);
  const res = env.api.rekeyAllUserFiles(K_VIEJA, K_NUEVA, { mode: 'change', newSalt: 'X', newVerifier: 'Y' });
  check('devuelve ok:false', res.ok === false);
  check('el mensaje dice que no se ha cambiado nada', /No se ha cambiado nada/.test(res.error || ''), res.error);
  let intactos = true;
  Object.keys(antes).forEach((a) => { if (fs.readFileSync(a, 'utf8') !== antes[a]) intactos = false; });
  check('los 18 archivos siguen byte a byte como estaban', intactos);
  check('meta sin tocar', JSON.stringify(env.estado.meta) === metaAntes);
  check('securityKey sin tocar (null)', env.api.securityKey === null);
  check('columnas encrypted sin tocar (1)', env.estado.tablas.backups.every((r) => r.encrypted === 1));
  check('staging retirado', !fs.existsSync(env.api.rekeyStagingDir()));
}

// ---------------------------------------------------- fallo en SWAP (fase 2)
console.log('\n=== 6. FALLO EN FASE 2 (SWAP): debe deshacerse por completo ===');
{
  const { env, originales } = montarEscenario(path.join(TMP, 'fallo-swap'), K_VIEJA);
  const antes = {}; Object.keys(originales).forEach((a) => { antes[a] = fs.readFileSync(a, 'utf8'); });
  const metaAntes = JSON.stringify(env.estado.meta);
  env.estado.fsFalla = { op: 'rename', path: 'backup_3_2.json' }; // falla ya empezado el intercambio
  const res = env.api.rekeyAllUserFiles(K_VIEJA, K_NUEVA, { mode: 'change', newSalt: 'X', newVerifier: 'Y' });
  env.estado.fsFalla = null;
  check('devuelve ok:false', res.ok === false);
  check('el mensaje dice que no se ha cambiado nada', /No se ha cambiado nada/.test(res.error || ''), res.error);
  let intactos = true, cuales = [];
  Object.keys(antes).forEach((a) => { if (!fs.existsSync(a) || fs.readFileSync(a, 'utf8') !== antes[a]) { intactos = false; cuales.push(path.basename(a)); } });
  check('los 18 archivos vuelven byte a byte a su estado original', intactos, cuales.join(','));
  check('todos siguen descifrando con la clave VIEJA', Object.keys(antes).every((a) => { try { return securitymod.decryptString(K_VIEJA, fs.readFileSync(a, 'utf8')) === originales[a]; } catch (e) { return false; } }));
  check('meta sin tocar', JSON.stringify(env.estado.meta) === metaAntes);
  check('securityKey sin tocar', env.api.securityKey === null);
  check('staging retirado', !fs.existsSync(env.api.rekeyStagingDir()));
}

// ------------------------------------------- corte de luz a mitad del SWAP
console.log('\n=== 7. CORTE DE LUZ a mitad de la fase 2: recuperacion al arrancar ===');
{
  const baseDir = path.join(TMP, 'corte');
  const { env, originales } = montarEscenario(baseDir, K_VIEJA);
  // Se construye a mano el estado exacto que dejaria un corte: journal en
  // fase 'swap', unos items ya intercambiados, uno a medias (original ya
  // apartado pero el .new sin mover) y el resto sin tocar.
  const items = env.api.collectRekeyInventory();
  const staging = env.api.rekeyStagingDir();
  fs.mkdirSync(staging, { recursive: true });
  const journal = { v: 1, startedAt: new Date().toISOString(), mode: 'change', newFlag: 1, newSalt: 'SALT_CORTE', newVerifier: 'VERIF_CORTE', phase: 'swap',
    items: items.map((it) => ({ i: it.i, table: it.table, rowKey: it.rowKey, absPath: it.absPath, hadFlag: it.hadFlag })) };
  fs.writeFileSync(path.join(staging, 'journal.json'), JSON.stringify(journal, null, 2), 'utf8');
  items.forEach((it) => {
    const plano = securitymod.decryptString(K_VIEJA, fs.readFileSync(it.absPath, 'utf8'));
    fs.writeFileSync(env.api.rekeyItemPath(it.i, 'new'), securitymod.encryptString(K_NUEVA, plano), 'utf8');
  });
  // items 0..4 completamente intercambiados
  for (let i = 0; i <= 4; i++) {
    fs.renameSync(items[i].absPath, env.api.rekeyItemPath(i, 'old'));
    fs.renameSync(env.api.rekeyItemPath(i, 'new'), items[i].absPath);
  }
  // item 5: original ya apartado, .new todavia sin mover (el corte justo ahi)
  fs.renameSync(items[5].absPath, env.api.rekeyItemPath(5, 'old'));
  check('estado de corte montado: item 5 sin destino', !fs.existsSync(items[5].absPath));

  const rec = env.api.recoverInterruptedRekeyIfAny();
  check('la recuperacion informa de que recupero', rec && rec.recovered === true, JSON.stringify(rec));
  check('sin problemas durante la recuperacion', rec && !rec.problem, rec && rec.problem);
  let todos = true, cuales = [];
  items.forEach((it) => {
    if (!fs.existsSync(it.absPath)) { todos = false; cuales.push('FALTA ' + path.basename(it.absPath)); return; }
    try { if (securitymod.decryptString(K_NUEVA, fs.readFileSync(it.absPath, 'utf8')) !== originales[it.absPath]) { todos = false; cuales.push('CONTENIDO ' + path.basename(it.absPath)); } }
    catch (e) { todos = false; cuales.push('NO DESCIFRA ' + path.basename(it.absPath)); }
  });
  check('los 18 archivos quedan con la clave NUEVA y su contenido intacto', todos, cuales.join(','));
  check('sal/verificador del journal consolidados', env.estado.meta.security_salt === 'SALT_CORTE' && env.estado.meta.security_verifier === 'VERIF_CORTE');
  check('staging retirado tras recuperar', !fs.existsSync(staging));
}

// ------------------------- corte durante la fase 1 (nada que deshacer)
console.log('\n=== 8. CORTE durante la fase 1: no se habia tocado nada ===');
{
  const baseDir = path.join(TMP, 'corte-prepare');
  const { env, originales } = montarEscenario(baseDir, K_VIEJA);
  const items = env.api.collectRekeyInventory();
  const staging = env.api.rekeyStagingDir();
  fs.mkdirSync(staging, { recursive: true });
  fs.writeFileSync(path.join(staging, 'journal.json'), JSON.stringify({ v: 1, mode: 'change', newFlag: 1, newSalt: 'NO', newVerifier: 'NO', phase: 'prepare',
    items: items.map((it) => ({ i: it.i, table: it.table, rowKey: it.rowKey, absPath: it.absPath, hadFlag: it.hadFlag })) }, null, 2), 'utf8');
  fs.writeFileSync(env.api.rekeyItemPath(0, 'new'), 'a medias', 'utf8');
  const rec = env.api.recoverInterruptedRekeyIfAny();
  check('informa recovered:false (no habia nada que deshacer)', rec && rec.recovered === false, JSON.stringify(rec));
  check('meta NO se consolida', !env.estado.meta.security_salt);
  check('los archivos siguen con la clave vieja', Object.keys(originales).every((a) => { try { return securitymod.decryptString(K_VIEJA, fs.readFileSync(a, 'utf8')) === originales[a]; } catch (e) { return false; } }));
  check('staging retirado', !fs.existsSync(staging));
}

// ----------------------- incoherencia fila/archivo heredada de otra version
console.log('\n=== 9. Fila que dice cifrada sobre archivo EN CLARO (incoherencia heredada) ===');
{
  const { env, originales } = montarEscenario(path.join(TMP, 'incoherente'), K_VIEJA);
  const raro = path.join(env.estado.baseDir, 'backups', 'dir1', 'backup_1_2.json');
  fs.writeFileSync(raro, originales[raro], 'utf8'); // en claro, pero la fila dice encrypted=1
  const res = env.api.rekeyAllUserFiles(K_VIEJA, K_NUEVA, { mode: 'change', newSalt: 'S', newVerifier: 'V' });
  check('no aborta por la incoherencia', res.ok === true, JSON.stringify(res));
  check('el archivo incoherente acaba cifrado con la clave nueva y con su contenido', securitymod.decryptString(K_NUEVA, fs.readFileSync(raro, 'utf8')) === originales[raro]);
}

// ------------------------------------------- fila sin archivo en disco
console.log('\n=== 10. Fila cuyo archivo ya no existe: se tolera, no aborta ===');
{
  const { env, originales } = montarEscenario(path.join(TMP, 'ausente'), K_VIEJA);
  const borrado = path.join(env.estado.baseDir, 'backups', 'dir2', 'backup_2_1.json');
  fs.unlinkSync(borrado); delete originales[borrado];
  const res = env.api.rekeyAllUserFiles(K_VIEJA, K_NUEVA, { mode: 'change', newSalt: 'S', newVerifier: 'V' });
  check('devuelve ok', res.ok === true, JSON.stringify(res));
  check('cuenta 17 migrados y 1 ausente', res.migrated === 17 && res.missing === 1, 'migrated=' + res.migrated + ' missing=' + res.missing);
  check('el resto se lee con la clave nueva', Object.keys(originales).every((a) => securitymod.decryptString(K_NUEVA, fs.readFileSync(a, 'utf8')) === originales[a]));
}

// ------------------------------------------------------------------ resumen
console.log('\n==================================================');
console.log('  PRUEBAS: ' + pass + ' OK, ' + fail + ' FALLOS');
console.log('==================================================');
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
process.exit(fail ? 1 : 0);
