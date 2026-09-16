'use strict';
// ---------------------------------------------------------------------------
// BLOQUE 5 — coste del RETIRAR (rename a cuarentena) y del ROLLBACK (inverso).
//
// La ruta base se pasa por --base=<ruta>. El guardian exige que este dentro de
// una carpeta marcada para pruebas y NUNCA sea produccion ni BD-PanoramaServicio.
//
// Mide coste y comportamiento del sistema de archivos de ESTE PC.
// NO es una prueba de sincronizacion multi-PC.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const argBase = (process.argv.find((a) => a.startsWith('--base=')) || '').slice(7);
const MARCA = '_a33-bloque5-BENCH';
const RAIZ = argBase ? path.join(argBase, MARCA) : path.join(os.tmpdir(), MARCA);

const PROHIBIDO = ['bd-panoramaservicio', 'panorama-app\\', 'panorama-app/'];
function abortar(m, r) {
  console.error('\n' + '!'.repeat(70) + `\n  ARNES ABORTADO: ${m}\n  ruta: ${r}\n` + '!'.repeat(70));
  process.exit(99);
}
// Lector unico y FAIL-CLOSED (comun/guardia-rutas.js): la clave real es
// `userDataDir`. Este arnes acepta --base arbitrario y puede escribir en G:,
// asi que no saber donde vive produccion es motivo para NO ejecutar.
const GUARDIA = require(path.join(__dirname, '..', 'comun', 'guardia-rutas.js'));
const LECT = GUARDIA.leerUbicacionReal({});
if (LECT.estado !== 'ok') abortar('location.json ' + LECT.estado + ': ' + LECT.detalle, LECT.archivo);
const REAL = LECT.ruta;
const DEF_N = path.resolve(path.join(process.env.APPDATA || '', 'panorama-app'));
{
  const abs = path.resolve(RAIZ); const b = abs.toLowerCase();
  for (const mal of PROHIBIDO) if (b.includes(mal)) abortar(`la ruta contiene "${mal}"`, abs);
  if (GUARDIA.dentroDe(abs, REAL)) abortar('cae dentro de la ubicacion real configurada', abs);
  if (GUARDIA.dentroDe(abs, DEF_N)) abortar('apunta a la carpeta de datos por defecto', abs);
  if (!b.includes(MARCA.toLowerCase())) abortar('la ruta no esta marcada para pruebas', abs);
}
// Prueba canonica de produccion intacta: la BD VIVA, no la copia de %APPDATA%.
const BD_VIVA = path.join(REAL, 'panorama.sqlite3');
const shaBdViva = () => { try { return crypto.createHash('sha256').update(fs.readFileSync(BD_VIVA)).digest('hex'); } catch (e) { return 'no-existe'; } };
const BD_ANTES = shaBdViva();
fs.rmSync(RAIZ, { recursive: true, force: true });
fs.mkdirSync(RAIZ, { recursive: true });

const ms = (t0) => Number(process.hrtime.bigint() - t0) / 1e6;
function crearArbol(dir, nArchivos, bytesPorArchivo) {
  fs.mkdirSync(dir, { recursive: true });
  const sub = path.join(dir, 'reuniones'); fs.mkdirSync(sub, { recursive: true });
  const sub2 = path.join(dir, 'evaluacion-candidatos', 'cv'); fs.mkdirSync(sub2, { recursive: true });
  const buf = crypto.randomBytes(Math.min(bytesPorArchivo, 1024 * 1024));
  for (let i = 0; i < nArchivos; i++) {
    const destino = i % 3 === 0 ? sub : (i % 3 === 1 ? sub2 : dir);
    const f = path.join(destino, `f_${i}.bin`);
    if (bytesPorArchivo <= buf.length) fs.writeFileSync(f, buf.slice(0, bytesPorArchivo));
    else {
      const fd = fs.openSync(f, 'w');
      let escrito = 0;
      while (escrito < bytesPorArchivo) {
        const n = Math.min(buf.length, bytesPorArchivo - escrito);
        fs.writeSync(fd, buf, 0, n); escrito += n;
      }
      fs.closeSync(fd);
    }
  }
}
function tamano(dir) {
  let n = 0, b = 0;
  const rec = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const f = path.join(d, e.name);
    if (e.isDirectory()) rec(f); else { n++; b += fs.statSync(f).size; }
  });
  rec(dir); return { n, b };
}

const REDUCIDO = process.argv.includes('--reducido');
const CASOS = REDUCIDO
  ? [
    ['200 ficheros pequenos (8 KB)', 200, 8 * 1024],
    ['~100 MB (100 x 1 MB)', 100, 1024 * 1024],
  ]
  : [
    ['1 archivo de 512 KB', 1, 512 * 1024],
    ['200 ficheros pequenos (8 KB)', 200, 8 * 1024],
    ['~100 MB (100 x 1 MB)', 100, 1024 * 1024],
    ['~500 MB (100 x 5 MB)', 100, 5 * 1024 * 1024],
  ];

console.log('BENCHMARK BLOQUE 5 — retirar a cuarentena y reponer');
console.log('  base:                ' + RAIZ);
console.log('  ubicacion real:      ' + REAL + '   [clave: ' + LECT.clave + ']');
console.log('  BD viva:             ' + BD_ANTES.slice(0, 16).toUpperCase());
console.log('  node:                ' + process.versions.node);
console.log('');
console.log('  CASO                              ARCHIVOS      BYTES     CREAR   RETIRAR   REPONER');
console.log('  ' + '-'.repeat(88));

for (const [etq, n, bytes] of CASOS) {
  const origen = path.join(RAIZ, 'backups', 'proyecto-' + etq.replace(/[^a-z0-9]/gi, ''));
  const cuarentena = path.join(RAIZ, '.panorama-borrados', 'accion-' + etq.replace(/[^a-z0-9]/gi, ''));
  fs.mkdirSync(path.dirname(cuarentena), { recursive: true });

  let t0 = process.hrtime.bigint();
  crearArbol(origen, n, bytes);
  const msCrear = ms(t0);
  const t = tamano(origen);

  // RETIRAR: el rename de la carpeta entera
  t0 = process.hrtime.bigint();
  fs.renameSync(origen, cuarentena);
  const msRetirar = ms(t0);
  const seMovio = !fs.existsSync(origen) && fs.existsSync(cuarentena);

  // REPONER: el rename inverso del rollback
  t0 = process.hrtime.bigint();
  fs.renameSync(cuarentena, origen);
  const msReponer = ms(t0);
  const volvio = fs.existsSync(origen) && !fs.existsSync(cuarentena);

  console.log('  ' + etq.padEnd(33) +
    String(t.n).padStart(8) +
    (Math.round(t.b / 1024 / 1024) + ' MB').padStart(11) +
    (msCrear.toFixed(0) + ' ms').padStart(10) +
    (msRetirar.toFixed(3) + ' ms').padStart(10) +
    (msReponer.toFixed(3) + ' ms').padStart(10) +
    (seMovio && volvio ? '' : '   <-- REVISAR'));

  fs.rmSync(origen, { recursive: true, force: true });
}

// El caso que hace fracasar el rollback ingenuo: el destino recreado.
console.log('');
console.log('  COMPROBACION: el destino recreado por otro equipo');
{
  const origen = path.join(RAIZ, 'backups', 'recreado');
  const cuarentena = path.join(RAIZ, '.panorama-borrados', 'accion-recreado');
  crearArbol(origen, 3, 1024);
  fs.renameSync(origen, cuarentena);
  fs.mkdirSync(origen, { recursive: true });                  // lo que hace backupsDirForProject()
  fs.writeFileSync(path.join(origen, 'backup_de_otro.json'), 'DEL OTRO EQUIPO', 'utf8');
  let err = null;
  try { fs.renameSync(cuarentena, origen); } catch (e) { err = e; }
  console.log('    rename(cuarentena -> destino) con el destino recreado: ' +
    (err ? 'FALLA (' + err.code + ')' : 'NO falla  <-- habria pisado el backup ajeno'));
  console.log('    el backup del otro equipo sigue: ' +
    fs.existsSync(path.join(origen, 'backup_de_otro.json')));
  console.log('    -> por eso hace falta la RESERVA DE SUBARBOL (diseño §4.7)');
  fs.rmSync(origen, { recursive: true, force: true });
  fs.rmSync(cuarentena, { recursive: true, force: true });
}

console.log('');
console.log('  LIMITE: mide el sistema de archivos de ESTE PC. No demuestra nada');
console.log('  sobre la sincronizacion de Drive entre equipos.');
fs.rmSync(RAIZ, { recursive: true, force: true });
console.log('  carpeta de prueba borrada: ' + !fs.existsSync(RAIZ));
const BD_DESPUES = shaBdViva();
console.log('  BD VIVA intacta: ' + (BD_ANTES === BD_DESPUES) + '   (' + BD_VIVA + ')');
if (BD_ANTES !== BD_DESPUES) {
  console.error('\n' + '!'.repeat(70) + '\n  LA BD VIVA HA CAMBIADO DURANTE EL BENCHMARK. PARAR E INVESTIGAR.\n' + '!'.repeat(70));
  process.exit(98);
}
