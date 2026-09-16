// A1 — caracterización de la SEGUNDA INSTANCIA contra los mismos datos.
// Dos entrelazados distintos. No toca la carpeta de datos del usuario.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const securitymod = require(path.join(PROJ, 'security.js'));

const SALT_VIEJA = 'aa'.repeat(16), SALT_NUEVA = 'bb'.repeat(16);
const K_VIEJA = securitymod.deriveKey('vieja', SALT_VIEJA);
const K_NUEVA = securitymod.deriveKey('nueva', SALT_NUEVA);
const V_VIEJA = securitymod.verifierFor(K_VIEJA), V_NUEVA = securitymod.verifierFor(K_NUEVA);

const src = fs.readFileSync(path.join(PROJ, 'main.js'), 'utf8').split(/\r?\n/);
const ini = src.findIndex((l) => l.startsWith("const REKEY_DIR_NAME = '.panorama-rekey';"));
const fin = src.findIndex((l) => l.includes('return { recovered: true, mode: journal.mode, finished };'));
const bloque = src.slice(ini, fin + 2).join('\n');

function nuevoEntorno(baseDir, tablas, meta) {
  const estado = { logs: [], meta: JSON.parse(JSON.stringify(meta)), baseDir, tablas: JSON.parse(JSON.stringify(tablas)) };
  const dbmod = {
    all(sql) {
      if (/FROM backups/.test(sql)) return estado.tablas.backups.map((r) => ({ rowKey: r.id, file_path: r.file_path, encrypted: r.encrypted, project_id: r.project_id, name: 'p' + r.project_id, backup_dir: 'dir' + r.project_id }));
      if (/FROM meeting_preps/.test(sql)) return estado.tablas.meeting_preps.map((r) => ({ rowKey: r.id, file_path: r.file_path, encrypted: r.encrypted, project_id: r.project_id, name: 'p' + r.project_id, backup_dir: 'dir' + r.project_id }));
      if (/FROM candidate_evals/.test(sql)) return estado.tablas.candidate_evals.map((r) => ({ rowKey: r.project_id, encrypted: r.encrypted, project_id: r.project_id, name: 'p' + r.project_id, backup_dir: 'dir' + r.project_id }));
      return [];
    },
    run(sql, params) { const m = /UPDATE (\w+) SET encrypted=\?/.exec(sql); if (m) estado.tablas[m[1]].forEach((r) => { r.encrypted = params[0]; }); return null; },
  };
  const ctx = {
    require, console, Buffer, process, JSON, Date, Math, String, Number, Array, Object, Error, fs, path,
    app: { getPath: () => estado.baseDir }, dbmod, securitymod,
    appLog: (l) => estado.logs.push(l), errorCodeSuffix: () => '',
    setMeta: (k, v) => { estado.meta[k] = v; }, deleteMeta: (k) => { delete estado.meta[k]; },
    backupsDirForProject: (row) => { const d = path.join(estado.baseDir, 'backups', row.backup_dir); fs.mkdirSync(d, { recursive: true }); return d; },
    meetingPrepsDirForProject: (row) => { const d = path.join(estado.baseDir, 'backups', row.backup_dir, 'reuniones'); fs.mkdirSync(d, { recursive: true }); return d; },
    candidateEvalFileForProject: (row) => { const d = path.join(estado.baseDir, 'backups', row.backup_dir, 'evaluacion-candidatos'); fs.mkdirSync(d, { recursive: true }); return path.join(d, 'estado.json'); },
    securityKey: null,
  };
  vm.createContext(ctx);
  vm.runInContext('let securityKey = null;\n' + bloque + '\nthis.__api = { rekeyAllUserFiles, recoverInterruptedRekeyIfAny, rekeyStagingDir, rekeyJournalPath, rekeyItemPath, collectRekeyInventory, get securityKey(){ return securityKey; } };', ctx);
  return { ctx, estado, api: ctx.__api };
}

const TMP = path.join(os.tmpdir(), 'panorama-a1-2i');

function montar(baseDir) {
  fs.rmSync(baseDir, { recursive: true, force: true });
  fs.mkdirSync(baseDir, { recursive: true });
  const tablas = { backups: [], meeting_preps: [], candidate_evals: [] };
  const originales = {};
  for (let p = 1; p <= 2; p++) {
    for (let b = 1; b <= 3; b++) {
      const f = `backup_${p}_${b}.json`;
      tablas.backups.push({ id: p * 100 + b, project_id: p, file_path: f, encrypted: 1 });
      const abs = path.join(baseDir, 'backups', 'dir' + p, f);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      const c = JSON.stringify({ p, b, datos: 'y'.repeat(300) });
      fs.writeFileSync(abs, securitymod.encryptString(K_VIEJA, c), 'utf8'); originales[abs] = c;
    }
    tablas.candidate_evals.push({ project_id: p, encrypted: 1 });
    const abs = path.join(baseDir, 'backups', 'dir' + p, 'evaluacion-candidatos', 'estado.json');
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const c = JSON.stringify({ puestos: [{ id: 'z' + p }] });
    fs.writeFileSync(abs, securitymod.encryptString(K_VIEJA, c), 'utf8'); originales[abs] = c;
  }
  const meta = { security_enabled: '1', security_salt: SALT_VIEJA, security_verifier: V_VIEJA };
  return { tablas, meta, originales };
}

function conQueClaveSeLeen(originales) {
  let vieja = 0, nueva = 0, ninguna = 0;
  Object.keys(originales).forEach((a) => {
    if (!fs.existsSync(a)) { ninguna++; return; }
    const raw = fs.readFileSync(a, 'utf8');
    try { if (securitymod.decryptString(K_VIEJA, raw) === originales[a]) { vieja++; return; } } catch (e) {}
    try { if (securitymod.decryptString(K_NUEVA, raw) === originales[a]) { nueva++; return; } } catch (e) {}
    ninguna++;
  });
  return { vieja, nueva, ninguna, total: Object.keys(originales).length };
}

// ---------------------------------------------------------------------------
console.log('=== ENTRELAZADO 1: B lanza su rekey mientras A esta en PREPARE ===');
{
  const baseDir = path.join(TMP, 'e1');
  const { tablas, meta, originales } = montar(baseDir);
  const A = nuevoEntorno(baseDir, tablas, meta);
  const B = nuevoEntorno(baseDir, tablas, meta);

  // A: fase 1 en curso (journal + .new escritos, ningun original tocado).
  const items = A.api.collectRekeyInventory();
  const st = A.api.rekeyStagingDir();
  fs.mkdirSync(st, { recursive: true });
  fs.writeFileSync(A.api.rekeyJournalPath(), JSON.stringify({ v: 1, mode: 'change', newFlag: 1, newSalt: SALT_NUEVA, newVerifier: V_NUEVA, phase: 'prepare', items: items.map((it) => ({ i: it.i, table: it.table, rowKey: it.rowKey, absPath: it.absPath, hadFlag: it.hadFlag })) }, null, 2), 'utf8');
  items.forEach((it) => fs.writeFileSync(A.api.rekeyItemPath(it.i, 'new'), securitymod.encryptString(K_NUEVA, securitymod.decryptString(K_VIEJA, fs.readFileSync(it.absPath, 'utf8'))), 'utf8'));
  console.log('  A tiene ' + fs.readdirSync(st).length + ' archivos en su staging');

  const resB = B.api.rekeyAllUserFiles(K_VIEJA, K_NUEVA, { mode: 'change', newSalt: SALT_NUEVA, newVerifier: V_NUEVA });
  console.log('  B.rekey -> ok=' + resB.ok);
  console.log('  staging de A tras el paso de B: ' + (fs.existsSync(st) ? fs.readdirSync(st).length + ' archivos' : 'BORRADO'));
  const c = conQueClaveSeLeen(originales);
  console.log('  archivos: ' + c.vieja + ' con clave vieja, ' + c.nueva + ' con clave nueva, ' + c.ninguna + ' ilegibles (de ' + c.total + ')');
  console.log('  meta de B: salt=' + (B.estado.meta.security_salt === SALT_NUEVA ? 'NUEVA' : 'vieja'));
  console.log('  meta de A (su copia en memoria, obsoleta): salt=' + (A.estado.meta.security_salt === SALT_VIEJA ? 'VIEJA' : 'nueva'));
  console.log('  -> A sigue creyendo que la clave buena es la vieja; sus lectores fallaran hasta reiniciar.');
}

console.log('\n=== ENTRELAZADO 2: B lanza su rekey mientras A ya ha hecho el SWAP ===');
{
  const baseDir = path.join(TMP, 'e2');
  const { tablas, meta, originales } = montar(baseDir);
  const A = nuevoEntorno(baseDir, tablas, meta);
  const B = nuevoEntorno(baseDir, tablas, meta);

  const items = A.api.collectRekeyInventory();
  const st = A.api.rekeyStagingDir();
  fs.mkdirSync(st, { recursive: true });
  fs.writeFileSync(A.api.rekeyJournalPath(), JSON.stringify({ v: 1, mode: 'change', newFlag: 1, newSalt: SALT_NUEVA, newVerifier: V_NUEVA, phase: 'swap', items: items.map((it) => ({ i: it.i, table: it.table, rowKey: it.rowKey, absPath: it.absPath, hadFlag: it.hadFlag })) }, null, 2), 'utf8');
  items.forEach((it) => fs.writeFileSync(A.api.rekeyItemPath(it.i, 'new'), securitymod.encryptString(K_NUEVA, securitymod.decryptString(K_VIEJA, fs.readFileSync(it.absPath, 'utf8'))), 'utf8'));
  items.forEach((it) => { fs.renameSync(it.absPath, A.api.rekeyItemPath(it.i, 'old')); fs.renameSync(A.api.rekeyItemPath(it.i, 'new'), it.absPath); });
  console.log('  A ha intercambiado los ' + items.length + ' archivos; sus originales estan en los .old');

  const resB = B.api.rekeyAllUserFiles(K_VIEJA, K_NUEVA, { mode: 'change', newSalt: SALT_NUEVA, newVerifier: V_NUEVA });
  console.log('  B.rekey -> ok=' + resB.ok);
  console.log('  staging de A tras el paso de B: ' + (fs.existsSync(st) ? fs.readdirSync(st).length + ' archivos' : 'BORRADO (con los .old dentro)'));
  console.log('  journal de A: ' + (fs.existsSync(A.api.rekeyJournalPath()) ? 'sigue' : 'BORRADO -> ninguna recuperacion futura es posible'));

  // A intenta ahora hacer su rollback (p.ej. porque falla su fase 3)
  let rollbackPosible = true;
  try { fs.renameSync(A.api.rekeyItemPath(items[0].i, 'old'), items[0].absPath); } catch (e) { rollbackPosible = false; }
  console.log('  A puede deshacer su cambio: ' + (rollbackPosible ? 'si' : 'NO -- sus originales ya no existen'));
  const c = conQueClaveSeLeen(originales);
  console.log('  archivos: ' + c.vieja + ' con clave vieja, ' + c.nueva + ' con clave nueva, ' + c.ninguna + ' ilegibles (de ' + c.total + ')');
  console.log('  meta EN DISCO la escribiria quien persista el ultimo: A tiene la sal VIEJA en memoria.');
  console.log('  -> si A escribe su imagen de BD despues, la sal nueva desaparece y los ' + c.nueva + ' archivos');
  console.log('     quedan cifrados con una clave que ya no se puede derivar: PERDIDA PERMANENTE.');
}

try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) {}
