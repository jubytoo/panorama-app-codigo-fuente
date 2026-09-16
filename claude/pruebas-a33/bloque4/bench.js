'use strict';
// ---------------------------------------------------------------------------
// BLOQUE 4 — BENCHMARK ACOTADO del coste de la mini-transaccion.
//
// Mide CADA FASE POR SEPARADO sobre `backup:save`, que es la accion que corre
// cada 15 s. Carpeta artificial exclusiva de pruebas. NUNCA G: ni datos reales.
//
// Lo que mide: coste y compatibilidad. NO demuestra durabilidad ante un corte
// electrico: que fsync devuelva no prueba que el dato este fisicamente en el
// plato ni, en Drive, que se haya subido.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const Module = require('module');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const MARCA_PRUEBAS = '_a33-bloque4-BENCH';
const RAIZ = path.join(os.tmpdir(), MARCA_PRUEBAS);
const PROHIBIDO = ['bd-panoramaservicio', 'mi unidad', 'my drive', 'google drive', 'onedrive', 'dropbox'];

function abortar(m, r) {
  console.error('\n' + '!'.repeat(70) + `\n  ARNES ABORTADO: ${m}\n  ruta: ${r}\n` + '!'.repeat(70));
  process.exit(99);
}
// Lector unico y FAIL-CLOSED (comun/guardia-rutas.js): la clave real es
// `userDataDir`, no `dir`/`path`. Si location.json existe y no se puede
// interpretar, este arnes no se ejecuta.
const GUARDIA = require(path.join(__dirname, '..', 'comun', 'guardia-rutas.js'));
const LECT = GUARDIA.leerUbicacionReal({});
if (LECT.estado !== 'ok') abortar('location.json ' + LECT.estado + ': ' + LECT.detalle, LECT.archivo);
const REAL = LECT.ruta;
const REAL_N = REAL ? path.resolve(REAL).toLowerCase() : null;
const DEF_N = path.resolve(path.join(process.env.APPDATA || '', 'panorama-app')).toLowerCase();
function segura(p) {
  const abs = path.resolve(String(p)); const b = abs.toLowerCase();
  for (const mal of PROHIBIDO) if (b.includes(mal)) abortar(`contiene "${mal}"`, abs);
  if (REAL_N && (b === REAL_N || b.startsWith(REAL_N + path.sep))) abortar('ubicacion real del usuario', abs);
  if (b === DEF_N || b.startsWith(DEF_N + path.sep)) abortar('carpeta por defecto', abs);
  if (!b.includes(MARCA_PRUEBAS.toLowerCase())) abortar('fuera de la carpeta de pruebas', abs);
  return abs;
}
segura(RAIZ);
fs.rmSync(RAIZ, { recursive: true, force: true });
fs.mkdirSync(RAIZ, { recursive: true });

const shaDe = (b) => crypto.createHash('sha256').update(b).digest('hex');
// La BD VIVA es <ubicacion real>/panorama.sqlite3, no la copia de %APPDATA%.
const shaBdViva = () => {
  try { return shaDe(fs.readFileSync(path.join(REAL, 'panorama.sqlite3'))); }
  catch (e) { return 'no-existe'; }
};
const prodAntes = shaBdViva();

let DIR_DATOS = path.join(RAIZ, 'datos');
let DIR_APPDATA = path.join(RAIZ, 'appdata');
fs.mkdirSync(DIR_DATOS, { recursive: true });
fs.mkdirSync(DIR_APPDATA, { recursive: true });
const origLoad = Module._load;
Module._load = function (r) {
  if (r === 'electron') return { app: { getPath: (k) => (k === 'appData' ? DIR_APPDATA : DIR_DATOS) } };
  return origLoad.apply(this, arguments);
};
const dbmod = require(path.join(PROJ, 'db.js'));

const FSYNC_NO_SOPORTADO = new Set(['EINVAL', 'ENOSYS', 'ENOTSUP', 'EOPNOTSUPP']);
// La MISMA disciplina que escribirJsonDurable()/escribirAtomico().
function escribirDurable(ruta, buf) {
  const tmp = `${ruta}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const fd = fs.openSync(tmp, 'w');
  try {
    let n = 0;
    while (n < buf.length) {
      const w = fs.writeSync(fd, buf, n, buf.length - n, n);
      if (!(w > 0)) throw new Error('writeSync sin progreso');
      n += w;
    }
    try { fs.fsyncSync(fd); }
    catch (e) { if (!FSYNC_NO_SOPORTADO.has(e && e.code)) throw e; }
  } finally { fs.closeSync(fd); }
  fs.renameSync(tmp, ruta);
}
function escribirSinFsync(ruta, buf) {
  fs.writeFileSync(ruta, buf);            // lo que hace HOY backup:save
}

function medir(n, fn) {
  // una pasada de calentamiento fuera de la cuenta
  fn(0);
  const t0 = process.hrtime.bigint();
  for (let i = 1; i <= n; i++) fn(i);
  return Number(process.hrtime.bigint() - t0) / 1e6 / n;
}

(async () => {
  console.log('BENCHMARK BLOQUE 4 — coste por fase de la mini-transaccion');
  console.log('  carpeta:            ' + RAIZ);
  console.log('  ubicacion real det.: ' + (REAL || '(no configurada)'));
  console.log('  node:               ' + process.versions.node + '  (electron ' + (process.versions.electron || '?') + ')');
  console.log('');

  DIR_DATOS = path.join(RAIZ, 'datos');
  await dbmod.getDb({ crearSiAusente: true });
  const pid = dbmod.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('P','c','persist:p','x','x')");
  const dirB = path.join(DIR_DATOS, 'backups'); fs.mkdirSync(dirB, { recursive: true });
  const dirJ = path.join(DIR_DATOS, '.panorama-acciones'); fs.mkdirSync(dirJ, { recursive: true });

  const N = 30;
  // Tamanos representativos de un volcado de localStorage de un proyecto.
  const TAMANOS = [64 * 1024, 512 * 1024, 2 * 1024 * 1024];

  console.log(`  N=${N} por medida; una pasada de calentamiento descartada`);
  console.log('');
  console.log('  FASE                                     64 KB      512 KB       2 MB');
  console.log('  ' + '-'.repeat(72));

  const filas = {};
  const anota = (etq, t, ms) => { (filas[etq] = filas[etq] || {})[t] = ms; };

  for (const t of TAMANOS) {
    const payload = Buffer.from(crypto.randomBytes(t).toString('base64').slice(0, t));

    // --- HOY: writeFileSync a pelo -------------------------------------
    anota('HOY  writeFileSync del archivo', t, medir(N, (i) => {
      escribirSinFsync(path.join(dirB, `hoy_${t}_${i}.json`), payload);
    }));

    // --- F1: tmp durable (write + fsync + rename) ----------------------
    anota('F1   tmp durable (fsync + rename)', t, medir(N, (i) => {
      escribirDurable(path.join(dirB, `tmp_${t}_${i}.json`), payload);
    }));

    // --- F2: journal durable (JSON pequeno) ----------------------------
    const journal = Buffer.from(JSON.stringify({
      v: 1, action_id: crypto.randomBytes(16).toString('hex'), writer: 'w'.repeat(32),
      tipo: 'backup', base_commit_id: 'b'.repeat(32), cifrado: 1,
      destino: path.join(dirB, 'backup_x.json'), modo: 'nuevo',
      original_sha256: null, original_size: 0, new_sha256: 'n'.repeat(64), new_size: t,
      fase: 'publicando', startedAt: new Date().toISOString(),
    }, null, 2), 'utf8');
    anota('F2   journal durable (~500 B)', t, medir(N, (i) => {
      escribirDurable(path.join(dirJ, `j_${t}_${i}.json`), journal);
    }));

    // --- F1b: sha256 de los bytes releidos del tmp ---------------------
    const unTmp = path.join(dirB, `tmp_${t}_1.json`);
    anota('F1b  releer el tmp + sha256', t, medir(N, () => {
      shaDe(fs.readFileSync(unTmp));
    }));

    // --- F3: rename ----------------------------------------------------
    anota('F3   rename (publicar)', t, medir(N, (i) => {
      const a = path.join(dirB, `mv_${t}_${i}_a.json`);
      const b = path.join(dirB, `mv_${t}_${i}_b.json`);
      fs.writeFileSync(a, payload);
      fs.renameSync(a, b);
    }));

    // --- F5: borrar ----------------------------------------------------
    anota('F5   borrar journal + .old', t, medir(N, (i) => {
      const a = path.join(dirJ, `del_${t}_${i}.json`);
      fs.writeFileSync(a, journal);
      fs.unlinkSync(a);
    }));
  }

  // --- F4: commit A3.3 — NO depende del tamano del payload -------------
  // Es una reescritura integra del .sqlite3, que aqui es pequeno.
  const msCommit = medir(N, (i) => {
    dbmod.run('INSERT INTO backups(project_id,created_at,reason,payload,size,file_path,encrypted) VALUES (?,?,?,?,?,?,?)',
      [pid, new Date().toISOString(), 'bench', '', 100, 'f' + i + '.json', 1]);
  });
  const tamDb = fs.statSync(path.join(DIR_DATOS, 'panorama.sqlite3')).size;

  const orden = ['HOY  writeFileSync del archivo', 'F1   tmp durable (fsync + rename)',
    'F1b  releer el tmp + sha256', 'F2   journal durable (~500 B)',
    'F3   rename (publicar)', 'F5   borrar journal + .old'];
  for (const etq of orden) {
    const f = filas[etq];
    console.log('  ' + etq.padEnd(38) +
      TAMANOS.map((t) => (f[t].toFixed(3) + ' ms').padStart(11)).join(''));
  }
  console.log('  ' + '-'.repeat(72));
  console.log(`  F4   commit A3.3 (.sqlite3 de ${Math.round(tamDb / 1024)} KB): ${msCommit.toFixed(3)} ms  (no depende del payload)`);
  console.log('');

  // --- TOTALES ---------------------------------------------------------
  console.log('  COSTE POR GUARDADO DE backup:save');
  console.log('  ' + '-'.repeat(72));
  for (const t of TAMANOS) {
    const hoy = filas['HOY  writeFileSync del archivo'][t] + msCommit;
    const nuevo = filas['F1   tmp durable (fsync + rename)'][t]
      + filas['F1b  releer el tmp + sha256'][t]
      + filas['F2   journal durable (~500 B)'][t]
      + filas['F3   rename (publicar)'][t]
      + msCommit
      + filas['F5   borrar journal + .old'][t];
    console.log(`  ${String(t / 1024).padStart(5)} KB   hoy ${hoy.toFixed(2)} ms   ->   protocolo ${nuevo.toFixed(2)} ms` +
      `   (+${(nuevo - hoy).toFixed(2)} ms, x${(nuevo / hoy).toFixed(1)})`);
  }
  console.log('');
  console.log('  Referencia: el autoguardado corre cada 15.000 ms.');
  for (const t of TAMANOS) {
    const nuevo = filas['F1   tmp durable (fsync + rename)'][t]
      + filas['F1b  releer el tmp + sha256'][t]
      + filas['F2   journal durable (~500 B)'][t]
      + filas['F3   rename (publicar)'][t] + msCommit
      + filas['F5   borrar journal + .old'][t];
    console.log(`  ${String(t / 1024).padStart(5)} KB   ocupa el ${((nuevo / 15000) * 100).toFixed(3)} % de cada ciclo`);
  }

  console.log('');
  console.log('  LIMITE DE ESTA MEDIDA: es coste y compatibilidad sobre un disco local.');
  console.log('  NO demuestra durabilidad ante un corte electrico, ni dice nada del');
  console.log('  comportamiento real sobre una carpeta sincronizada por Drive.');

  const prodDespues = shaBdViva();
  console.log('');
  console.log('  BD VIVA intacta: ' + (prodAntes === prodDespues) +
    '  (' + prodAntes.slice(0, 16).toUpperCase() + '...  ' + path.join(REAL, 'panorama.sqlite3') + ')');
  try { dbmod._resetParaPruebas(); } catch (e) {}
  fs.rmSync(RAIZ, { recursive: true, force: true });
  console.log('  carpeta de prueba borrada: ' + !fs.existsSync(RAIZ));
})().catch((e) => { console.error('EXCEPCION:', e); process.exit(2); });
