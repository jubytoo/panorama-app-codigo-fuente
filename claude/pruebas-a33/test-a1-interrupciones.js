// A1 — pruebas de INTERRUPCIÓN (corte de luz / proceso muerto) en cada fase.
// Carga el bloque real de main.js. No toca la carpeta de datos del usuario.
//
// En cada caso se construye a mano el estado EXACTO que dejaría el corte
// (usando los propios helpers reales para no divergir del código), se llama a
// recoverInterruptedRekeyIfAny() y se comprueba la coherencia SIMULTÁNEA de:
//   contenido real de los archivos / columna encrypted / security_salt /
//   security_verifier / security_enabled / clave con la que los LECTORES
//   NORMALES podrán abrirlos.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const securitymod = require(path.join(PROJ, 'security.js'));

let pass = 0, fail = 0;
const fallos = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('    OK   ' + name); }
  else { fail++; fallos.push(name); console.log('    FALLO ' + name + (extra ? ' -- ' + extra : '')); }
}

// --------------------------------------------------- claves y sales reales
const SALT_VIEJA = 'aa'.repeat(16);
const SALT_NUEVA = 'bb'.repeat(16);
const K_VIEJA = securitymod.deriveKey('vieja', SALT_VIEJA);
const K_NUEVA = securitymod.deriveKey('nueva', SALT_NUEVA);
const V_VIEJA = securitymod.verifierFor(K_VIEJA);
const V_NUEVA = securitymod.verifierFor(K_NUEVA);
const CANDIDATAS = [{ pwd: 'vieja', salt: SALT_VIEJA, key: K_VIEJA }, { pwd: 'nueva', salt: SALT_NUEVA, key: K_NUEVA }];

// ------------------------------------------- carga del bloque real de main.js
const src = fs.readFileSync(path.join(PROJ, 'main.js'), 'utf8').split(/\r?\n/);
const ini = src.findIndex((l) => l.startsWith("const REKEY_DIR_NAME = '.panorama-rekey';"));
const finMarca = src.findIndex((l) => l.includes('return { recovered: true, mode: journal.mode, finished };'));
if (ini < 0 || finMarca < 0) { console.log('NO SE PUDO LOCALIZAR EL BLOQUE A1'); process.exit(1); }
const bloque = src.slice(ini, finMarca + 2).join('\n');
console.log('Bloque A1 real extraido de main.js: lineas ' + (ini + 1) + '-' + (finMarca + 2));

function nuevoEntorno(baseDir) {
  const estado = { logs: [], meta: {}, baseDir, tablas: { backups: [], meeting_preps: [], candidate_evals: [] } };
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
        else if (/WHERE project_id=\?$/.test(sql.trim())) { const r = t.find((x) => x.project_id === params[1]); if (r) r.encrypted = params[0]; }
        else t.forEach((r) => { r.encrypted = params[0]; });
      }
      return null;
    },
  };
  const ctx = {
    require, console, Buffer, process, JSON, Date, Math, String, Number, Array, Object, Error,
    fs, path,
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
  vm.runInContext(
    'let securityKey = null;\n' + bloque +
    '\nthis.__api = { rekeyAllUserFiles, recoverInterruptedRekeyIfAny, rekeyStagingDir, rekeyJournalPath, rekeyItemPath, collectRekeyInventory, rekeySetFlagBulk, applyRekeyMeta, removeRekeyStaging, get securityKey(){ return securityKey; } };',
    ctx
  );
  return { ctx, estado, api: ctx.__api };
}

function montarEscenario(baseDir) {
  fs.rmSync(baseDir, { recursive: true, force: true });
  fs.mkdirSync(baseDir, { recursive: true });
  const env = nuevoEntorno(baseDir);
  env.estado.meta = { security_enabled: '1', security_salt: SALT_VIEJA, security_verifier: V_VIEJA };
  const originales = {};
  const escribir = (abs, contenido) => {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, securitymod.encryptString(K_VIEJA, contenido), 'utf8');
    originales[abs] = contenido;
  };
  for (let p = 1; p <= 3; p++) {
    for (let b = 1; b <= 4; b++) {
      const f = `backup_${p}_${b}.json`;
      env.estado.tablas.backups.push({ id: p * 100 + b, project_id: p, file_path: f, encrypted: 1 });
      escribir(path.join(baseDir, 'backups', 'dir' + p, f), JSON.stringify({ proyecto: p, backup: b, datos: 'x'.repeat(400) }));
    }
    const rf = `reunion_${p}.json`;
    env.estado.tablas.meeting_preps.push({ id: p, project_id: p, file_path: rf, encrypted: 1 });
    escribir(path.join(baseDir, 'backups', 'dir' + p, 'reuniones', rf), JSON.stringify({ reunion: p, guion: 'texto' }));
    env.estado.tablas.candidate_evals.push({ project_id: p, encrypted: 1 });
    escribir(path.join(baseDir, 'backups', 'dir' + p, 'evaluacion-candidatos', 'estado.json'), JSON.stringify({ puestos: [{ id: 'x' + p }] }));
  }
  return { env, originales };
}

// Reproduce las fases 1 y 2 usando los helpers REALES, para dejar el disco
// exactamente como lo dejaría el codigo justo antes de la fase 3.
function ejecutarFases1y2(env, modo, newKey, newSalt, newVerifier) {
  const items = env.api.collectRekeyInventory();
  const staging = env.api.rekeyStagingDir();
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  const journal = {
    v: 1, startedAt: new Date().toISOString(), mode: modo, newFlag: newKey ? 1 : 0,
    newSalt, newVerifier, phase: 'swap',
    items: items.map((it) => ({ i: it.i, table: it.table, rowKey: it.rowKey, absPath: it.absPath, hadFlag: it.hadFlag })),
  };
  fs.writeFileSync(env.api.rekeyJournalPath(), JSON.stringify(journal, null, 2), 'utf8');
  items.forEach((it) => {
    const raw = fs.readFileSync(it.absPath, 'utf8');
    const plano = securitymod.looksEncrypted(raw) ? securitymod.decryptString(K_VIEJA, raw) : raw;
    fs.writeFileSync(env.api.rekeyItemPath(it.i, 'new'), newKey ? securitymod.encryptString(newKey, plano) : plano, 'utf8');
  });
  items.forEach((it) => {
    fs.renameSync(it.absPath, env.api.rekeyItemPath(it.i, 'old'));
    fs.renameSync(env.api.rekeyItemPath(it.i, 'new'), it.absPath);
  });
  return items;
}

function filaDe(env, it) {
  if (it.table === 'candidate_evals') return env.estado.tablas.candidate_evals.find((r) => r.project_id === it.rowKey);
  return env.estado.tablas[it.table].find((r) => r.id === it.rowKey);
}

// Réplica EXACTA del criterio de readBackupPayload / meeting:getPrep /
// readCandidateEvalPayloadForProject: manda la COLUMNA, no el archivo.
function lectorNormal(fila, raw, appKey) {
  if (fila.encrypted) {
    if (!appKey) return { error: 'cifrado y la seguridad esta bloqueada' };
    try { return { ok: securitymod.decryptString(appKey, raw) }; } catch (e) { return { error: 'no se pudo descifrar' }; }
  }
  return { ok: raw };
}

// Comprueba de golpe los 6 puntos que pide el encargo.
function comprobarCoherencia(env, items, originales, esperado) {
  const meta = env.estado.meta;
  const enabled = meta.security_enabled === '1';
  check('  [enabled] security_enabled = ' + (esperado.enabled ? '1' : 'ausente'), enabled === esperado.enabled,
    'enabled=' + enabled);
  check('  [salt/verifier] coherentes entre si', esperado.enabled ? (!!meta.security_salt && !!meta.security_verifier) : (!meta.security_salt && !meta.security_verifier),
    'salt=' + meta.security_salt + ' verif=' + meta.security_verifier);

  // Con que contraseña desbloquea la app (exactamente como tryAutoUnlock / login)
  let appKey = null, pwdOk = null;
  if (enabled) {
    for (const c of CANDIDATAS) {
      const k = securitymod.deriveKey(c.pwd, meta.security_salt);
      if (securitymod.verifierFor(k) === meta.security_verifier) { appKey = k; pwdOk = c.pwd; break; }
    }
    check('  [login] alguna contrasena conocida desbloquea', appKey !== null);
    check('  [login] la contrasena valida es "' + esperado.password + '"', pwdOk === esperado.password, 'desbloquea con: ' + pwdOk);
  } else {
    check('  [login] no se pide contrasena (seguridad desactivada)', esperado.password === null);
  }

  // Columnas + contenido real + lectura por el camino normal, todo a la vez
  let colOk = true, lecturaOk = true, malos = [];
  items.forEach((it) => {
    const fila = filaDe(env, it);
    if (fila.encrypted !== esperado.flag) { colOk = false; }
    if (!fs.existsSync(it.absPath)) { lecturaOk = false; malos.push('FALTA ' + path.basename(it.absPath)); return; }
    const raw = fs.readFileSync(it.absPath, 'utf8');
    const r = lectorNormal(fila, raw, appKey);
    if (r.error) { lecturaOk = false; malos.push(path.basename(it.absPath) + ': ' + r.error); }
    else if (r.ok !== originales[it.absPath]) { lecturaOk = false; malos.push(path.basename(it.absPath) + ': contenido distinto'); }
  });
  check('  [columna] las 3 familias con encrypted=' + esperado.flag, colOk);
  check('  [archivos+lectores] los 18 se abren por el camino NORMAL y coinciden', lecturaOk, malos.slice(0, 4).join(' | '));
  check('  [limpieza] staging retirado', !fs.existsSync(env.api.rekeyStagingDir()));
}

const TMP = path.join(os.tmpdir(), 'panorama-a1-int');

// ===========================================================================
console.log('\n=== 11. Corte durante COLUMNS: solo `backups` actualizada (1 de 3) [disable] ===');
{
  const { env, originales } = montarEscenario(path.join(TMP, 't11'));
  const items = ejecutarFases1y2(env, 'disable', null, null, null);
  env.ctx.dbmod.run("UPDATE backups SET encrypted=? WHERE file_path IS NOT NULL", [0]); // solo la 1a de las 3
  const rec = env.api.recoverInterruptedRekeyIfAny();
  check('  recovered:true', rec && rec.recovered === true, JSON.stringify(rec));
  comprobarCoherencia(env, items, originales, { enabled: false, password: null, flag: 0 });
}

console.log('\n=== 12. Corte durante COLUMNS: `backups` + `meeting_preps` (2 de 3) [disable] ===');
{
  const { env, originales } = montarEscenario(path.join(TMP, 't12'));
  const items = ejecutarFases1y2(env, 'disable', null, null, null);
  env.ctx.dbmod.run("UPDATE backups SET encrypted=? WHERE file_path IS NOT NULL", [0]);
  env.ctx.dbmod.run("UPDATE meeting_preps SET encrypted=? WHERE file_path IS NOT NULL", [0]);
  const rec = env.api.recoverInterruptedRekeyIfAny();
  check('  recovered:true', rec && rec.recovered === true, JSON.stringify(rec));
  comprobarCoherencia(env, items, originales, { enabled: false, password: null, flag: 0 });
}

console.log('\n=== 13. Corte entre COLUMNS (completa) y META [disable] ===');
{
  const { env, originales } = montarEscenario(path.join(TMP, 't13'));
  const items = ejecutarFases1y2(env, 'disable', null, null, null);
  env.api.rekeySetFlagBulk(0);
  const rec = env.api.recoverInterruptedRekeyIfAny();
  check('  recovered:true', rec && rec.recovered === true, JSON.stringify(rec));
  comprobarCoherencia(env, items, originales, { enabled: false, password: null, flag: 0 });
}

console.log('\n=== 14. Corte inmediatamente DESPUES de META, antes de CLEANUP [disable] ===');
{
  const { env, originales } = montarEscenario(path.join(TMP, 't14'));
  const items = ejecutarFases1y2(env, 'disable', null, null, null);
  env.api.rekeySetFlagBulk(0);
  env.api.applyRekeyMeta('disable', null, null);
  const rec = env.api.recoverInterruptedRekeyIfAny();
  check('  recovered:true', rec && rec.recovered === true, JSON.stringify(rec));
  comprobarCoherencia(env, items, originales, { enabled: false, password: null, flag: 0 });
}

console.log('\n=== 15. Corte inmediatamente DESPUES de META [change] ===');
{
  const { env, originales } = montarEscenario(path.join(TMP, 't15'));
  const items = ejecutarFases1y2(env, 'change', K_NUEVA, SALT_NUEVA, V_NUEVA);
  env.api.applyRekeyMeta('change', SALT_NUEVA, V_NUEVA); // en change no hay COLUMNS
  const rec = env.api.recoverInterruptedRekeyIfAny();
  check('  recovered:true', rec && rec.recovered === true, JSON.stringify(rec));
  comprobarCoherencia(env, items, originales, { enabled: true, password: 'nueva', flag: 1 });
}

console.log('\n=== 16. Corte durante CLEANUP: journal ya borrado, quedan .old [change] ===');
{
  const { env, originales } = montarEscenario(path.join(TMP, 't16'));
  const items = ejecutarFases1y2(env, 'change', K_NUEVA, SALT_NUEVA, V_NUEVA);
  env.api.applyRekeyMeta('change', SALT_NUEVA, V_NUEVA);
  fs.unlinkSync(env.api.rekeyJournalPath()); // rmSync murio justo despues de borrar el journal
  const rec = env.api.recoverInterruptedRekeyIfAny();
  check('  la recuperacion no hace nada (no hay journal)', rec === null, JSON.stringify(rec));
  const meta = env.estado.meta;
  check('  [salt] consolidada', meta.security_salt === SALT_NUEVA);
  check('  [verifier] consolidado', meta.security_verifier === V_NUEVA);
  check('  [enabled] a 1', meta.security_enabled === '1');
  let ok = true;
  items.forEach((it) => { const r = lectorNormal(filaDe(env, it), fs.readFileSync(it.absPath, 'utf8'), K_NUEVA); if (r.error || r.ok !== originales[it.absPath]) ok = false; });
  check('  [archivos+lectores] los 18 se abren con la clave nueva', ok);
  check('  [columna] siguen a 1', items.every((it) => filaDe(env, it).encrypted === 1));
  check('  [limpieza] el staging huerfano (sin journal) se retira', !fs.existsSync(env.api.rekeyStagingDir()));
}

console.log('\n=== 17. Corte durante CLEANUP: journal intacto, .old ya borrados [change] ===');
{
  const { env, originales } = montarEscenario(path.join(TMP, 't17'));
  const items = ejecutarFases1y2(env, 'change', K_NUEVA, SALT_NUEVA, V_NUEVA);
  env.api.applyRekeyMeta('change', SALT_NUEVA, V_NUEVA);
  items.forEach((it) => { const p = env.api.rekeyItemPath(it.i, 'old'); if (fs.existsSync(p)) fs.unlinkSync(p); });
  const rec = env.api.recoverInterruptedRekeyIfAny();
  check('  recovered:false (no quedaba nada que deshacer)', rec && rec.recovered === false, JSON.stringify(rec));
  comprobarCoherencia(env, items, originales, { enabled: true, password: 'nueva', flag: 1 });
}

console.log('\n=== 18. Corte durante un ROLLBACK PARCIAL tras fallo en SWAP [change] ===');
{
  const { env, originales } = montarEscenario(path.join(TMP, 't18'));
  const items = ejecutarFases1y2(env, 'change', K_NUEVA, SALT_NUEVA, V_NUEVA);
  // El rollback iba deshaciendo en orden inverso y murio a mitad: items 12..17
  // ya devueltos a su sitio (clave vieja), items 0..11 todavia con la nueva.
  for (let k = items.length - 1; k >= 12; k--) {
    const it = items[k];
    fs.renameSync(it.absPath, env.api.rekeyItemPath(it.i, 'new'));
    fs.renameSync(env.api.rekeyItemPath(it.i, 'old'), it.absPath);
  }
  const mezcla = items.filter((it) => { try { securitymod.decryptString(K_VIEJA, fs.readFileSync(it.absPath, 'utf8')); return true; } catch (e) { return false; } }).length;
  check('  estado de partida mezclado: ' + mezcla + ' con clave vieja y ' + (items.length - mezcla) + ' con la nueva', mezcla === 6);
  const rec = env.api.recoverInterruptedRekeyIfAny();
  check('  recovered:true', rec && rec.recovered === true, JSON.stringify(rec));
  check('  sin problemas', rec && !rec.problem, rec && rec.problem);
  comprobarCoherencia(env, items, originales, { enabled: true, password: 'nueva', flag: 1 });
}

console.log('\n=== 19. Corte durante un ROLLBACK PARCIAL tras fallo en COLUMNS [disable] ===');
{
  const { env, originales } = montarEscenario(path.join(TMP, 't19'));
  const items = ejecutarFases1y2(env, 'disable', null, null, null);
  env.api.rekeySetFlagBulk(0);                       // COLUMNS aplicada
  // Fallo en COLUMNS -> rollback: restaura flags fila a fila, murio a mitad
  items.slice(0, 9).forEach((it) => { filaDe(env, it).encrypted = it.hadFlag; });
  // y luego el rollback de SWAP tambien murio a mitad
  for (let k = items.length - 1; k >= 14; k--) {
    const it = items[k];
    fs.renameSync(it.absPath, env.api.rekeyItemPath(it.i, 'new'));
    fs.renameSync(env.api.rekeyItemPath(it.i, 'old'), it.absPath);
  }
  const rec = env.api.recoverInterruptedRekeyIfAny();
  check('  recovered:true', rec && rec.recovered === true, JSON.stringify(rec));
  check('  sin problemas', rec && !rec.problem, rec && rec.problem);
  comprobarCoherencia(env, items, originales, { enabled: false, password: null, flag: 0 });
}

console.log('\n=== 20. Corte durante la fase 1 con META ya vieja intacta [change] ===');
{
  const { env, originales } = montarEscenario(path.join(TMP, 't20'));
  const items = env.api.collectRekeyInventory();
  const staging = env.api.rekeyStagingDir();
  fs.mkdirSync(staging, { recursive: true });
  fs.writeFileSync(env.api.rekeyJournalPath(), JSON.stringify({ v: 1, mode: 'change', newFlag: 1, newSalt: SALT_NUEVA, newVerifier: V_NUEVA, phase: 'prepare', items: items.map((it) => ({ i: it.i, table: it.table, rowKey: it.rowKey, absPath: it.absPath, hadFlag: it.hadFlag })) }, null, 2), 'utf8');
  items.slice(0, 7).forEach((it) => {
    const plano = securitymod.decryptString(K_VIEJA, fs.readFileSync(it.absPath, 'utf8'));
    fs.writeFileSync(env.api.rekeyItemPath(it.i, 'new'), securitymod.encryptString(K_NUEVA, plano), 'utf8');
  });
  const rec = env.api.recoverInterruptedRekeyIfAny();
  check('  recovered:false', rec && rec.recovered === false, JSON.stringify(rec));
  comprobarCoherencia(env, items, originales, { enabled: true, password: 'vieja', flag: 1 });
}

// ===========================================================================
console.log('\n=== 21. SEGUNDA INSTANCIA contra los mismos datos durante el rekey ===');
{
  const baseDir = path.join(TMP, 't21');
  const { env: A, originales } = montarEscenario(baseDir);
  // Instancia B: proceso distinto, MISMA carpeta de datos. rekeyInProgress de
  // A no existe para B.
  const B = nuevoEntorno(baseDir);
  B.estado.meta = JSON.parse(JSON.stringify(A.estado.meta));
  B.estado.tablas = JSON.parse(JSON.stringify(A.estado.tablas));

  // A empieza su rekey y se queda a medias (fases 1 y 2 hechas).
  const items = ejecutarFases1y2(A, 'change', K_NUEVA, SALT_NUEVA, V_NUEVA);
  check('  A tiene su staging con los originales apartados', fs.existsSync(A.api.rekeyStagingDir()) && fs.existsSync(A.api.rekeyItemPath(0, 'old')));

  // B, sin enterarse de nada, lanza SU PROPIO cambio de contrasena.
  const resB = B.api.rekeyAllUserFiles(K_VIEJA, K_NUEVA, { mode: 'change', newSalt: SALT_NUEVA, newVerifier: V_NUEVA });

  check('  [!] el staging de A (con sus originales) sobrevive al rekey de B', fs.existsSync(A.api.rekeyItemPath(0, 'old')),
    'B ha borrado la carpeta .panorama-rekey de A, incluidos los .old');
  check('  [!] B no arranca su rekey mientras A tiene uno en curso', resB.ok === false,
    'B devolvio ok=' + resB.ok + ' -- ha migrado sobre una migracion a medias');
  check('  [!] el journal de A sigue intacto', fs.existsSync(A.api.rekeyJournalPath()));
  check('  [!] B avisa de que hay otra operacion en curso', /otro cambio de Seguridad en curso/.test(resB.error || ''), resB.error);
  check('  [!] B no ha tocado la meta', B.estado.meta.security_salt === SALT_VIEJA);
  // A todavia puede deshacer su operacion: sus .old estan donde los dejo.
  let rollbackPosible = true;
  try { items.forEach((it) => { fs.renameSync(it.absPath, A.api.rekeyItemPath(it.i, 'new')); fs.renameSync(A.api.rekeyItemPath(it.i, 'old'), it.absPath); }); }
  catch (e) { rollbackPosible = false; }
  check('  [!] A conserva la capacidad de deshacer su cambio', rollbackPosible);
  check('  [!] tras deshacer, los 18 vuelven a leerse con la clave VIEJA',
    items.every((it) => { try { return securitymod.decryptString(K_VIEJA, fs.readFileSync(it.absPath, 'utf8')) === originales[it.absPath]; } catch (e) { return false; } }));
}

console.log('\n=== 22. Staging huerfano SIN journal: se retira al arrancar y no bloquea ===');
{
  const { env, originales } = montarEscenario(path.join(TMP, 't22'));
  const st = env.api.rekeyStagingDir();
  fs.mkdirSync(st, { recursive: true });
  fs.writeFileSync(path.join(st, '3.old'), 'resto de una limpieza a medias', 'utf8');
  fs.writeFileSync(path.join(st, '7.old'), 'otro resto', 'utf8');
  // Antes de recuperar, un rekey debe NEGARSE (carpeta sucia).
  const bloqueado = env.api.rekeyAllUserFiles(K_VIEJA, K_NUEVA, { mode: 'change', newSalt: SALT_NUEVA, newVerifier: V_NUEVA });
  check('  con restos presentes, el rekey se niega a empezar', bloqueado.ok === false, JSON.stringify(bloqueado));
  check('  el mensaje no dice "en curso" (no hay journal)', /sin recoger/.test(bloqueado.error || ''), bloqueado.error);
  check('  los restos NO se han borrado por el intento', fs.existsSync(path.join(st, '3.old')));
  // La recuperacion del arranque si los retira.
  const rec = env.api.recoverInterruptedRekeyIfAny();
  check('  la recuperacion devuelve null (nada que recuperar)', rec === null, JSON.stringify(rec));
  check('  y retira el staging huerfano', !fs.existsSync(st));
  // Y ahora el rekey ya funciona con normalidad.
  const res = env.api.rekeyAllUserFiles(K_VIEJA, K_NUEVA, { mode: 'change', newSalt: SALT_NUEVA, newVerifier: V_NUEVA });
  check('  tras limpiar, el rekey se completa', res.ok === true, JSON.stringify(res));
  const items2 = env.api.collectRekeyInventory();
  comprobarCoherencia(env, items2, originales, { enabled: true, password: 'nueva', flag: 1 });
}

// ------------------------------------------------------------------ resumen
console.log('\n==================================================');
console.log('  PRUEBAS: ' + pass + ' OK, ' + fail + ' FALLOS');
if (fallos.length) { console.log('  Fallos:'); fallos.forEach((f) => console.log('    - ' + f.trim())); }
console.log('==================================================');
try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
process.exit(0);
