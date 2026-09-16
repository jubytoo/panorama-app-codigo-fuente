'use strict';
// ---------------------------------------------------------------------------
// C1-A — COSTE DEL INVENTARIO SOBRE LOS DATOS REALES, EN SOLO LECTURA.
//
// Ejecuta el `inventarioDeResiduos()` REAL de main.js (extraído por firma)
// contra la carpeta de datos configurada, con TRES barreras:
//   · `fs` envuelto: cualquier llamada que escriba, cree, mueva o borre LANZA
//     antes de ejecutarse;
//   · `dbmod` de solo lectura: la BD viva se lee a un Buffer y se abre EN
//     MEMORIA; solo existen `all` y `get`;
//   · sin clave de Seguridad: no se descifra nada.
// Hash de la BD viva y nº de entradas de primer nivel, antes y después.
// Imprime solo la línea agregada y el coste. Uso: node medir-inventario-vivo.js [repeticiones]
// ---------------------------------------------------------------------------
const fsReal = require('fs');
const path = require('path');
const crypto = require('crypto');
const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const initSqlJs = require(path.join(PROJ, 'node_modules', 'sql.js'));
const securitymod = require(path.join(PROJ, 'security.js'));
const GUARDIA = require(path.join(__dirname, '..', 'comun', 'guardia-rutas.js'));
const B5 = require(path.join(__dirname, '..', 'comun', 'bloque5-extraccion.js'));

const LECT = GUARDIA.leerUbicacionReal({});
if (LECT.estado !== 'ok') { console.error('location.json ' + LECT.estado); process.exit(99); }
const UD = LECT.ruta;
const BD = path.join(UD, 'panorama.sqlite3');
const sha = () => crypto.createHash('sha256').update(fsReal.readFileSync(BD)).digest('hex').toUpperCase();
const REPS = Math.max(1, Number(process.argv[2]) || 3);

const SRC = fsReal.readFileSync(process.env.PANORAMA_MAIN || path.join(PROJ, 'main.js'), 'utf8');
function extraer(firma) {
  const i = SRC.indexOf(firma);
  if (i < 0) throw new Error('NO SE ENCONTRO: ' + firma);
  let j = SRC.indexOf('{', i), prof = 0;
  for (let k = j; k < SRC.length; k++) {
    if (SRC[k] === '{') prof++;
    else if (SRC[k] === '}') { prof--; if (prof === 0) return SRC.slice(i, k + 1); }
  }
  throw new Error('no delimitado: ' + firma);
}
const linea = (n) => { const i = SRC.indexOf(n); if (i < 0) throw new Error('falta ' + n); return SRC.slice(i, SRC.indexOf('\n', i) + 1); };

const PROHIBIDAS = new Set(['writeFileSync', 'writeFile', 'appendFileSync', 'appendFile', 'mkdirSync', 'mkdir',
  'renameSync', 'rename', 'unlinkSync', 'unlink', 'rmSync', 'rm', 'rmdirSync', 'copyFileSync', 'cpSync', 'openSync',
  'writeSync', 'utimesSync', 'truncateSync', 'symlinkSync', 'linkSync', 'chmodSync', 'promises']);
const llamadas = {};
const fsLectura = new Proxy(fsReal, {
  get(t, k) {
    if (PROHIBIDAS.has(String(k))) throw new Error('BARRERA: el inventario ha intentado usar fs.' + String(k));
    const v = t[k];
    if (typeof v !== 'function') return v;
    return function (...a) { llamadas[k] = (llamadas[k] || 0) + 1; return v.apply(t, a); };
  },
});

(async () => {
  const h0 = sha();
  const top0 = fsReal.readdirSync(UD).length;
  const SQL = await initSqlJs({ wasmBinary: fsReal.readFileSync(path.join(PROJ, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')) });
  const mem = new SQL.Database(new Uint8Array(fsReal.readFileSync(BD)));
  const q = (sql, p) => { const st = mem.prepare(sql); st.bind(p || []); const r = []; while (st.step()) r.push(st.getAsObject()); st.free(); return r; };
  const dbLectura = new Proxy({ all: (s, p) => q(s, p), get: (s, p) => q(s, p)[0] }, {
    get(t, k) {
      if (k in t) return t[k];
      throw new Error('BARRERA: el inventario ha intentado usar dbmod.' + String(k));
    },
  });
  const app = { getPath: (k) => (k === 'appData' ? process.env.APPDATA : UD) };
  const BLOQUES = ['function slugify(', 'function slugDeProyectoPuro(row)', 'function accionesDir()', 'function borradosDir()',
    'function restauracionesDir()', 'function rekeyStagingDir()', 'function bloqueoDeSeguridad()', 'function motivoSinRutas(e)',
    'function referenciasDeCv(ruta, existe, r)', 'function inventarioDeResiduos()', 'function registrarInventarioDeResiduos()'];
  const CONSTS = B5.sinRepetir([
    "const ACCIONES_DIR_NAME = '.panorama-acciones';", "const BORRADOS_DIR_NAME = '.panorama-borrados';",
    "const RESTAURACIONES_DIR_NAME = '.panorama-restauraciones';", "const REKEY_DIR_NAME = '.panorama-rekey';",
    'const RESIDUO_TMP_BD =', 'const RESIDUO_TMP_ACCION =', 'const RESIDUO_OLD_ACCION =', 'const RESIDUO_ESCRIBIENDO =',
  ].map(linea)).join('');
  const cuerpo = CONSTS + 'let securityKey = null;\nlet seguridadRequiereRevalidacion = false;\nlet seguridadEnEstadoInconsistente = null;\n' +
    BLOQUES.map(extraer).join('\n\n') + '\nreturn { registrarInventarioDeResiduos };';
  const lineas = [];
  const M = new Function('app', 'fs', 'path', 'dbmod', 'securitymod', 'appLog', cuerpo)(
    app, fsLectura, path, dbLectura, securitymod, (s) => lineas.push(String(s)));

  console.log('C1-A — inventario REAL sobre la carpeta de datos configurada (solo lectura)');
  console.log('  BD viva ANTES: ' + h0 + ' · entradas de primer nivel: ' + top0);
  const tiempos = [];
  for (let i = 0; i < REPS; i++) {
    const t0 = process.hrtime.bigint();
    const r = M.registrarInventarioDeResiduos();
    tiempos.push(Number(process.hrtime.bigint() - t0) / 1e6);
    if (!r) { console.log('  el inventario devolvió null: ' + lineas[lineas.length - 1]); process.exitCode = 1; break; }
  }
  console.log('  línea (última):');
  console.log('    ' + lineas[lineas.length - 1]);
  console.log('  líneas escritas: ' + lineas.length + ' (una por ejecución)');
  console.log('  tiempos por ejecución: ' + tiempos.map((t) => t.toFixed(1) + ' ms').join(' · '));
  console.log('  llamadas a fs (acumuladas en ' + REPS + '): ' + JSON.stringify(llamadas));
  mem.close();
  const h1 = sha();
  const top1 = fsReal.readdirSync(UD).length;
  console.log('  BD viva DESPUÉS: ' + h1 + (h1 === h0 ? '  IDÉNTICA' : '  *** CAMBIÓ ***') +
    ' · entradas de primer nivel: ' + top1 + (top1 === top0 ? ' (sin cambios)' : ' *** CAMBIÓ ***'));
  if (h1 !== h0 || top1 !== top0) process.exitCode = 98;
})().catch((e) => { console.error('FALLO:', e.message); process.exitCode = 1; });
