'use strict';
// Ensayo AISLADO de coste y compatibilidad para A3.3 §4.b / §6.1.a.
//
// NO toca el codigo de la app, NO toca BD-PanoramaServicio, NO toca ningun
// dato real. Escribe exclusivamente en carpetas de prueba creadas y borradas
// por este script.
//
// Se ejecuta con el Node incluido en Electron 30.5.1 (node 20.16.0, arm64),
// que es el runtime real de la aplicacion.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const SALIDA = process.argv[2];
const linea = [];
function log(s) { linea.push(s); }

// --- guarda de seguridad: nunca escribir dentro de datos reales ------------
const PROHIBIDO = ['bd-panoramaservicio', 'panorama.sqlite3'];
function comprobarRutaSegura(p) {
  const bajo = String(p).toLowerCase();
  for (const mal of PROHIBIDO) {
    if (bajo.includes(mal)) throw new Error('RUTA PROHIBIDA: ' + p);
  }
}

// --- estadistica ------------------------------------------------------------
function pct(arr, p) {
  const a = arr.slice().sort((x, y) => x - y);
  const i = Math.min(a.length - 1, Math.max(0, Math.ceil((p / 100) * a.length) - 1));
  return a[i];
}
function resumen(nombre, ms) {
  const media = ms.reduce((a, b) => a + b, 0) / ms.length;
  return {
    nombre,
    n: ms.length,
    media: +media.toFixed(4),
    p50: +pct(ms, 50).toFixed(4),
    p95: +pct(ms, 95).toFixed(4),
    p99: +pct(ms, 99).toFixed(4),
    max: +Math.max.apply(null, ms).toFixed(4),
  };
}
function tabla(filas) {
  const cab = ['operacion', 'n', 'media', 'p50', 'p95', 'p99', 'max'];
  const anchos = cab.map((c, i) => Math.max(c.length, ...filas.map((f) => String(Object.values(f)[i]).length)));
  const fmt = (vals) => vals.map((v, i) => String(v).padEnd(anchos[i])).join('  ');
  log('  ' + fmt(cab));
  log('  ' + anchos.map((a) => '-'.repeat(a)).join('  '));
  filas.forEach((f) => log('  ' + fmt(Object.values(f))));
}

// --- las dos variantes de escritura que compara el diseno -------------------
// SIN fsync: exactamente lo que hace persist() hoy.
function escribirSinFsync(rutaFinal, buf) {
  const tmp = rutaFinal + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, rutaFinal);
}

// CON fsync: la propuesta de §4.b, con el bucle de writeSync del punto 3.
let fsyncFallos = 0;
let fsyncPrimerError = null;
function escribirConFsync(rutaFinal, buf) {
  const tmp = rutaFinal + '.tmp-' + process.pid;
  const fd = fs.openSync(tmp, 'w');
  try {
    let escritos = 0;
    while (escritos < buf.length) {
      const n = fs.writeSync(fd, buf, escritos, buf.length - escritos, escritos);
      if (!(n > 0)) throw new Error('writeSync sin progreso en offset ' + escritos);
      escritos += n;
    }
    if (escritos !== buf.length) throw new Error('escritura incompleta: ' + escritos + '/' + buf.length);
    try {
      fs.fsyncSync(fd);
    } catch (e) {
      fsyncFallos++;
      if (!fsyncPrimerError) fsyncPrimerError = (e && e.code) + ' / ' + (e && e.message);
      throw e; // en el ensayo se propaga para poder contarlo; en la app se clasificaria
    }
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, rutaFinal);
}

// --- una ubicacion, una medicion completa -----------------------------------
function medir(etiqueta, dir, N, tamanos) {
  comprobarRutaSegura(dir);
  log('');
  log('='.repeat(78));
  log('UBICACION: ' + etiqueta);
  log('  ruta: ' + dir);
  log('  iteraciones: ' + N);
  log('='.repeat(78));

  fs.mkdirSync(dir, { recursive: true });

  // --- compatibilidad de fsync en esta ubicacion ---------------------------
  const sonda = path.join(dir, 'sonda-fsync.bin');
  let fsyncSoportado = null;
  let fsyncError = null;
  try {
    const fd = fs.openSync(sonda, 'w');
    try { fs.writeSync(fd, Buffer.alloc(4096, 7)); fs.fsyncSync(fd); fsyncSoportado = true; }
    finally { fs.closeSync(fd); }
  } catch (e) { fsyncSoportado = false; fsyncError = (e && e.code) + ' / ' + (e && e.message); }
  try { fs.unlinkSync(sonda); } catch (e) {}
  log('');
  log('COMPATIBILIDAD fsync: ' + (fsyncSoportado ? 'SI, soportado' : 'NO -> ' + fsyncError));

  // --- se puede sincronizar el directorio? (el hueco de Windows) -----------
  let dirSync = null;
  try {
    const fdd = fs.openSync(dir, 'r');
    try { fs.fsyncSync(fdd); dirSync = 'SI'; } finally { fs.closeSync(fdd); }
  } catch (e) { dirSync = 'NO -> ' + (e && e.code); }
  log('SINCRONIZAR EL DIRECTORIO: ' + dirSync);

  const filas = [];

  for (const tam of tamanos) {
    const dbPath = path.join(dir, 'bench-' + tam + '.sqlite3');
    const genPath = dbPath + '.gen';
    comprobarRutaSegura(dbPath);
    const buf = crypto.randomBytes(tam);
    const gen = Buffer.from(JSON.stringify({
      v: 2, gen: 128,
      commit_id: crypto.randomBytes(16).toString('hex'),
      parent_commit_id: crypto.randomBytes(16).toString('hex'),
      writer: crypto.randomBytes(16).toString('hex'),
      at: new Date().toISOString(),
    }), 'utf8');
    const kb = Math.round(tam / 1024);

    // preparar los archivos para que existan
    escribirSinFsync(dbPath, buf);
    escribirSinFsync(genPath, gen);

    const t = {};
    const nuevo = (k) => { t[k] = []; return t[k]; };
    const mStat = nuevo('stat'), mLeerGen = nuevo('leerGen');
    const mGenSin = nuevo('genSin'), mGenCon = nuevo('genCon');
    const mDbSin = nuevo('dbSin'), mDbCon = nuevo('dbCon');
    const mHashMem = nuevo('hashMem'), mLeerHash = nuevo('leerHash');
    const mCicloSin = nuevo('cicloSin'), mCicloCon = nuevo('cicloCon');

    const ahora = () => process.hrtime.bigint();
    const delta = (a) => Number(process.hrtime.bigint() - a) / 1e6;

    for (let i = 0; i < N; i++) {
      let a;

      // 1. stat del .sqlite3  (el coste que anade el camino rapido de §6.1.a)
      a = ahora(); fs.statSync(dbPath); mStat.push(delta(a));

      // 2. leer el .gen  (ya estaba en el diseno)
      a = ahora(); fs.readFileSync(genPath); mLeerGen.push(delta(a));

      // 3. sha256 en memoria del buffer que ya tenemos  (F_mio)
      a = ahora(); crypto.createHash('sha256').update(buf).digest('hex'); mHashMem.push(delta(a));

      // 4. leer el .sqlite3 entero + sha256  (la comprobacion periodica)
      a = ahora();
      crypto.createHash('sha256').update(fs.readFileSync(dbPath)).digest('hex');
      mLeerHash.push(delta(a));

      // 5. escrituras sueltas
      a = ahora(); escribirSinFsync(genPath, gen); mGenSin.push(delta(a));
      a = ahora(); escribirSinFsync(dbPath, buf); mDbSin.push(delta(a));
      if (fsyncSoportado) {
        a = ahora(); escribirConFsync(genPath, gen); mGenCon.push(delta(a));
        a = ahora(); escribirConFsync(dbPath, buf); mDbCon.push(delta(a));
      }

      // 6. CICLO COMPLETO tal y como quedaria run() en el diseno
      a = ahora();
      fs.statSync(dbPath); fs.readFileSync(genPath);
      escribirSinFsync(genPath, gen); escribirSinFsync(dbPath, buf);
      crypto.createHash('sha256').update(buf).digest('hex');
      fs.statSync(dbPath);
      mCicloSin.push(delta(a));

      if (fsyncSoportado) {
        a = ahora();
        fs.statSync(dbPath); fs.readFileSync(genPath);
        escribirConFsync(genPath, gen); escribirConFsync(dbPath, buf);
        crypto.createHash('sha256').update(buf).digest('hex');
        fs.statSync(dbPath);
        mCicloCon.push(delta(a));
      }
    }

    log('');
    log('--- tamano de base de datos: ' + kb + ' KB ---');
    const f = [];
    f.push(resumen('stat del .sqlite3', mStat));
    f.push(resumen('leer .gen (~250 B)', mLeerGen));
    f.push(resumen('sha256 en memoria (' + kb + ' KB)', mHashMem));
    f.push(resumen('leer .sqlite3 + sha256', mLeerHash));
    f.push(resumen('escribir .gen SIN fsync', mGenSin));
    if (fsyncSoportado) f.push(resumen('escribir .gen CON fsync', mGenCon));
    f.push(resumen('escribir BD SIN fsync', mDbSin));
    if (fsyncSoportado) f.push(resumen('escribir BD CON fsync', mDbCon));
    f.push(resumen('CICLO run() SIN fsync', mCicloSin));
    if (fsyncSoportado) f.push(resumen('CICLO run() CON fsync', mCicloCon));
    tabla(f.map((r) => ({ operacion: r.nombre, n: r.n, media: r.media, p50: r.p50, p95: r.p95, p99: r.p99, max: r.max })));

    if (fsyncSoportado) {
      const sobrecosteMedia = (resumen('', mCicloCon).media - resumen('', mCicloSin).media);
      const sobrecosteP95 = (resumen('', mCicloCon).p95 - resumen('', mCicloSin).p95);
      log('  >> SOBRECOSTE del fsync por escritura: ' + sobrecosteMedia.toFixed(3) +
          ' ms de media, ' + sobrecosteP95.toFixed(3) + ' ms en p95');
    }
    filas.push({ etiqueta, kb, fsyncSoportado });

    try { fs.unlinkSync(dbPath); } catch (e) {}
    try { fs.unlinkSync(genPath); } catch (e) {}
  }

  return { etiqueta, fsyncSoportado, dirSync };
}

// --- ejecucion ---------------------------------------------------------------
log('ENSAYO AISLADO A3.3 — coste y compatibilidad de fsync / stat / hash');
log('fecha: ' + new Date().toISOString());
log('runtime: node ' + process.versions.node + ' (Electron ' + process.versions.electron +
    ') ' + process.arch + ' — el mismo que usa la aplicacion');
log('equipo: ' + os.cpus()[0].model + ' x' + os.cpus().length);
log('');
log('ADVERTENCIA: este ensayo mide COSTE y COMPATIBILIDAD.');
log('NO demuestra durabilidad ante un corte de alimentacion. Eso no es');
log('comprobable por software desde el propio proceso.');

const resultados = [];
const dirLocal = path.join(process.env.TEMP || os.tmpdir(), '_bench-a33-local');
resultados.push(medir('DISCO LOCAL (NVMe, %TEMP%)', dirLocal, 1000, [76 * 1024, 256 * 1024, 1024 * 1024]));

const dirDrive = 'G:' + path.sep + 'Mi unidad' + path.sep + '_bench-a33-tmp';
let hayDrive = false;
try { hayDrive = fs.existsSync('G:' + path.sep + 'Mi unidad'); } catch (e) {}
if (hayDrive) {
  // N reducido a proposito en Drive: 1000 reescrituras de 76 KB generarian
  // cientos de revisiones en el historial de versiones de la cuenta del
  // usuario. 200 basta para p95 y para la compatibilidad.
  resultados.push(medir('GOOGLE DRIVE (G:, sistema de archivos en modo usuario)', dirDrive, 200, [76 * 1024]));
} else {
  log('');
  log('G: no disponible: no se mide Drive.');
}

log('');
log('='.repeat(78));
log('RESUMEN DE COMPATIBILIDAD');
log('='.repeat(78));
resultados.forEach((r) => {
  log('  ' + r.etiqueta);
  log('     fsync del archivo:     ' + (r.fsyncSoportado ? 'SOPORTADO' : 'NO SOPORTADO'));
  log('     fsync del directorio:  ' + r.dirSync);
});
log('');
log('  fallos de fsync durante la medicion: ' + fsyncFallos +
    (fsyncPrimerError ? ('  (primero: ' + fsyncPrimerError + ')') : ''));

// --- limpieza ---------------------------------------------------------------
log('');
log('LIMPIEZA');
[dirLocal, hayDrive ? dirDrive : null].filter(Boolean).forEach((d) => {
  try {
    comprobarRutaSegura(d);
    fs.rmSync(d, { recursive: true, force: true });
    log('  borrado: ' + d + '  -> existe todavia: ' + fs.existsSync(d));
  } catch (e) { log('  NO se pudo borrar ' + d + ': ' + e.message); }
});

fs.writeFileSync(SALIDA, linea.join('\n'), 'utf8');
