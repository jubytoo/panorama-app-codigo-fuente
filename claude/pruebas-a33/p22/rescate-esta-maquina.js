'use strict';
// ---------------------------------------------------------------------------
// P22-D — ¿QUÉ app.asar RESTAURARÍA PS-1007 EN ESTA MÁQUINA? SOLO LECTURA.
//
// Ejecuta la SELECCIÓN real de main.js (resolveDataDirForStartupRecovery +
// findLatestAsarBackupForRecovery) con un `app` doble que apunta a las rutas
// reales, y lee la versión de cada copia desde su cabecera. NO ejecuta el
// rescate: nada se copia. Las funciones de escritura de `fs` están trucadas.
// No es una batería de regresión (depende de los datos de esta máquina).
// Uso: node p22/rescate-esta-maquina.js
// ---------------------------------------------------------------------------
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
for (const k of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'renameSync', 'unlinkSync', 'rmSync', 'rmdirSync', 'copyFileSync', 'cpSync', 'truncateSync', 'utimesSync']) {
  fs[k] = () => { throw new Error('P22: escritura PROHIBIDA (' + k + ')'); };
}
const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const MAIN = fs.readFileSync(path.join(PROJ, 'main.js'), 'utf8');
function extraerDe(src, firma) {
  const i = src.indexOf(firma);
  let j = src.indexOf('{', i + firma.length - 1), prof = 0;
  for (let k = j; k < src.length; k++) { if (src[k] === '{') prof++; else if (src[k] === '}') { prof--; if (prof === 0) return src.slice(i, k + 1); } }
  throw new Error('no delimitado: ' + firma);
}
const FUENTE = ['function userDataConfigPath()', 'function leerConfigUbicacion()', 'function resolveDataDirForStartupRecovery()', 'function findLatestAsarBackupForRecovery(dir)']
  .map((f) => extraerDe(MAIN, f)).join('\n');
const APPDATA = process.env.APPDATA;
const DEFECTO = path.join(APPDATA, 'panorama-app');
const INSTALADO = path.join(process.env.LOCALAPPDATA, 'Programs', 'Panorama del Servicio', 'resources', 'app.asar');
// Para «sin location.json» se usa un appData que NO existe: no se crea nada.
function seleccion(appData) {
  const app = { getPath: (k) => (k === 'appData' ? appData : k === 'userData' ? DEFECTO : os.tmpdir()) };
  const f = new Function('app', 'fs', 'path', 'originalFs', FUENTE + '\nreturn { resolveDataDirForStartupRecovery, findLatestAsarBackupForRecovery, leerConfigUbicacion };');
  const m = f(app, fs, path, fs);
  const dir = m.resolveDataDirForStartupRecovery();
  return { estado: m.leerConfigUbicacion().estado, dir, elegido: dir ? m.findLatestAsarBackupForRecovery(dir) : null };
}
function version(ruta) {
  try {
    const fd = fs.openSync(ruta, 'r');
    try {
      const h = Buffer.alloc(16); fs.readSync(fd, h, 0, 16, 0);
      const S = h.readUInt32LE(4), L = h.readUInt32LE(12);
      const hb = Buffer.alloc(L); fs.readSync(fd, hb, 0, L, 16);
      const pj = JSON.parse(hb.toString('utf8')).files['package.json'];
      const pb = Buffer.alloc(pj.size); fs.readSync(fd, pb, 0, pj.size, 8 + S + Number(pj.offset));
      return JSON.parse(pb.toString('utf8')).version;
    } finally { fs.closeSync(fd); }
  } catch (e) { return '¿?'; }
}
const cmp = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };
const donde = (d) => (d == null ? '(ninguna)' : path.resolve(d).toLowerCase() === path.resolve(DEFECTO).toLowerCase() ? 'carpeta por defecto (P10)' : 'carpeta configurada (G:)');
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase();

const vInst = version(INSTALADO);
console.log(`Instalada: v${vInst}`);
const real = seleccion(APPDATA);
const cfgDir = (() => { try { return JSON.parse(fs.readFileSync(path.join(APPDATA, 'panorama-app-config', 'location.json'), 'utf8')).userDataDir; } catch (e) { return null; } })();
for (const d of [cfgDir, DEFECTO].filter(Boolean)) {
  const baks = (() => { try { return fs.readdirSync(d).filter((f) => f.startsWith('app.asar.bak-')).sort(); } catch (e) { return []; } })();
  console.log(`  copias en ${donde(d)}: ${baks.map((b) => `${b.slice(13, 29)}… v${version(path.join(d, b))}`).join(' · ') || 'ninguna'}`);
}
const informe = (titulo, s) => {
  const v = s.elegido ? version(path.join(s.dir, s.elegido)) : null;
  const rel = v ? cmp(v, vInst) : null;
  console.log(`\n${titulo}\n  location.json: ${s.estado} · carpeta de rescate: ${donde(s.dir)} · elegiría: ${s.elegido ? s.elegido.slice(0, 29) + '… v' + v : 'NADA'}` +
    (v ? ` → ${rel < 0 ? 'ANTERIOR' : rel > 0 ? 'POSTERIOR' : 'IGUAL'} a la instalada (v${vInst})` : ''));
};
informe('1) HOY (location.json válido y G: montada):', real);
informe('2) SIN location.json:', seleccion(path.join(os.tmpdir(), '_a33-p22-no-existe-' + process.pid)));
// 3) location.json válido pero G: no montada: resolveDataDir usa la por defecto si la configurada no existe.
{
  const s = { estado: 'valido (G: no montada, razonado con la misma función)', dir: DEFECTO };
  const f = new Function('app', 'fs', 'path', 'originalFs', FUENTE + '\nreturn { findLatestAsarBackupForRecovery };');
  s.elegido = f({ getPath: () => DEFECTO }, fs, path, fs).findLatestAsarBackupForRecovery(DEFECTO);
  informe('3) location.json válido pero G: SIN MONTAR (la carpeta configurada «no existe»):', s);
}
// ¿De qué instalación salieron las copias de G:? El patch-log de esa carpeta dice sobre qué app.asar se aplicó cada parche.
if (cfgDir && fs.existsSync(path.join(cfgDir, 'patch-log.txt'))) {
  const lineas = fs.readFileSync(path.join(cfgDir, 'patch-log.txt'), 'utf8').split(/\r?\n/).filter((l) => /Parche aplicado correctamente sobre:/.test(l));
  const tipo = (l) => { const s = l.toLowerCase(); return s.includes('\\appdata\\local\\programs\\') ? 'instalación actual (%LOCALAPPDATA%\\Programs)' : s.includes('otros ordenadores') ? 'instalación en Drive «Otros ordenadores»' : 'otra instalación'; };
  const agg = lineas.reduce((m, l) => ((m[tipo(l)] = (m[tipo(l)] || 0) + 1), m), {});
  console.log(`\npatch-log.txt de la carpeta configurada: ${lineas.length} parches aplicados · destino: ${JSON.stringify(agg)} · último ${((lineas[lineas.length - 1] || '').slice(1, 20))}`);
}
console.log(`\ninstalado SHA ${sha(INSTALADO).slice(0, 16)} · nada se ha copiado ni escrito.`);
