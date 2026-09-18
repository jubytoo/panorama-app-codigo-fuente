'use strict';
// ---------------------------------------------------------------------------
// P18 — INVENTARIO DE COPIAS DE `app.asar` EN ESTA MÁQUINA. SOLO LECTURA.
//
// Recorre las carpetas que el CÓDIGO usa de verdad (no rutas adivinadas):
//   · la carpeta de datos CONFIGURADA (location.json), donde «Aplicar parche»
//     deja `app.asar.bak-<fecha>` y `patch-log.txt`;
//   · la carpeta de datos POR DEFECTO (%APPDATA%\panorama-app, el residuo P10),
//     que es a donde cae el rescate cuando no hay configuración utilizable;
//   · la carpeta de la INSTALACIÓN (`process.resourcesPath` en la app real),
//     donde vive el `app.asar` de verdad y donde el rescate deja
//     `app.asar.broken-<fecha>` y el `.bat` deja `app.asar.broken.bak`.
//
// De cada copia: tamaño, fecha, SHA-256, versión interna (leída de la CABECERA
// del asar, sin ejecutarla ni extraerla) y qué se puede demostrar sobre su
// procedencia. NO restaura, NO copia, NO borra: todas las funciones de
// escritura de `fs` están trucadas para lanzar.
//
// No es una batería de regresión: depende de los datos de ESTA máquina.
// Uso: node claude/pruebas-a33/p18/inventario-p18.js
// ---------------------------------------------------------------------------
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

for (const k of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'renameSync', 'unlinkSync',
  'rmSync', 'rmdirSync', 'copyFileSync', 'cpSync', 'truncateSync', 'utimesSync', 'openSync']) {
  const orig = fs[k];
  fs[k] = (...a) => {
    if (k === 'openSync' && (a[1] === undefined || a[1] === 'r')) return orig.apply(fs, a);
    throw new Error('P18: escritura PROHIBIDA (' + k + ')');
  };
}

const APPDATA = process.env.APPDATA;
const DEFECTO = path.join(APPDATA, 'panorama-app');
const CFGDIR = path.join(APPDATA, 'panorama-app-config');
const INSTALL = path.join(process.env.LOCALAPPDATA, 'Programs', 'Panorama del Servicio', 'resources');

// --- lectura de la cabecera de un asar (formato pickle + JSON) --------------
// Un .asar empieza por: 4B tamaño de pickle | 4B tamaño | 4B tamaño | 4B long
// del JSON de cabecera. El JSON lista cada archivo con su offset y tamaño. Se
// lee SOLO `package.json`. No se extrae nada al disco ni se ejecuta código.
function leerAsar(ruta) {
  let fd;
  try {
    fd = fs.openSync(ruta, 'r');
    const h = Buffer.alloc(16);
    fs.readSync(fd, h, 0, 16, 0);
    const S = h.readUInt32LE(4), L = h.readUInt32LE(12);
    if (!S || !L || L > 64 * 1024 * 1024) return { ok: false, motivo: 'cabecera fuera de rango' };
    const hb = Buffer.alloc(L);
    fs.readSync(fd, hb, 0, L, 16);
    const cab = JSON.parse(hb.toString('utf8'));
    const pj = cab.files && cab.files['package.json'];
    if (!pj) return { ok: false, motivo: 'sin package.json en la cabecera' };
    const pb = Buffer.alloc(pj.size);
    fs.readSync(fd, pb, 0, pj.size, 8 + S + Number(pj.offset));
    const j = JSON.parse(pb.toString('utf8'));
    return { ok: true, version: j.version, nombre: j.name, nFiles: Object.keys(cab.files).length };
  } catch (e) {
    return { ok: false, motivo: String((e && e.message) || e).slice(0, 60) };
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch (e) { /* da igual */ }
  }
}

const sha = (p) => {
  try { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase(); }
  catch (e) { return null; }
};
const cmpVer = (a, b) => {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0);
  return 0;
};
const iso = (d) => new Date(d).toISOString().slice(0, 16).replace('T', ' ');

// --- dónde mira el código ---------------------------------------------------
let cfgDir = null, cfgCompartida = null, cfgEstado = 'ausente';
try {
  const j = JSON.parse(fs.readFileSync(path.join(CFGDIR, 'location.json'), 'utf8'));
  cfgDir = j.userDataDir; cfgCompartida = j.shared; cfgEstado = 'valido';
} catch (e) { cfgEstado = fs.existsSync(path.join(CFGDIR, 'location.json')) ? 'ilegible/invalido' : 'ausente'; }

const ZONAS = [
  { rol: 'carpeta de datos CONFIGURADA', dir: cfgDir, compartida: cfgCompartida },
  { rol: 'carpeta de datos POR DEFECTO (residuo P10)', dir: DEFECTO, compartida: false },
  { rol: 'carpeta de la INSTALACIÓN (resources)', dir: INSTALL, compartida: false },
].filter((z) => z.dir);

const INSTALADO = path.join(INSTALL, 'app.asar');
const vInst = leerAsar(INSTALADO);
const hInst = sha(INSTALADO);

console.log('======================================================================');
console.log('  P18 — INVENTARIO DE COPIAS DE app.asar (SOLO LECTURA)');
console.log('======================================================================');
console.log(`  location.json: ${cfgEstado}${cfgCompartida === true ? ' · marcada como COMPARTIDA' : cfgCompartida === false ? ' · no compartida' : ''}`);
console.log(`  Instalado ahora: v${vInst.ok ? vInst.version : '¿?'}  SHA ${hInst ? hInst.slice(0, 16) : '¿?'}  (${vInst.ok ? vInst.nFiles + ' archivos dentro' : vInst.motivo})`);

const todas = [];
for (const z of ZONAS) {
  let entradas;
  try {
    entradas = fs.readdirSync(z.dir).filter((f) => /^app\.asar(\.bak-|\.broken)/.test(f) || f === 'app.asar' || /^patch-pending-.*\.asar$/.test(f));
  } catch (e) {
    console.log(`\n  ${z.rol}: NO ACCESIBLE (${String((e && e.code) || e)})`);
    continue;
  }
  console.log(`\n  ${z.rol}${z.compartida ? '  [COMPARTIDA: aquí pueden dejar copias OTROS equipos]' : ''}`);
  if (!entradas.length) { console.log('    (ninguna copia)'); continue; }
  for (const f of entradas.sort()) {
    const p = path.join(z.dir, f);
    let st;
    try { st = fs.statSync(p); } catch (e) { console.log(`    ${f}  (no se puede leer)`); continue; }
    if (!st.isFile()) continue;
    const v = leerAsar(p);
    const h = sha(p);
    const rel = v.ok && vInst.ok ? cmpVer(v.version, vInst.version) : null;
    todas.push({ zona: z.rol, compartida: !!z.compartida, f, size: st.size, mtime: st.mtimeMs, v, h, rel });
    console.log(`    ${f}`);
    console.log(`        ${String(st.size).padStart(9)} B · ${iso(st.mtimeMs)} · SHA ${h ? h.slice(0, 16) : '¿?'}`);
    console.log(`        version: ${v.ok ? 'v' + v.version : 'NO LEGIBLE (' + v.motivo + ')'}` +
      (rel === null ? '' : rel < 0 ? '  → ANTERIOR a la instalada' : rel > 0 ? '  → POSTERIOR a la instalada' : '  → IGUAL a la instalada') +
      (h && hInst && h === hInst ? '  · MISMO CONTENIDO que el instalado' : ''));
  }
}

// --- qué se puede demostrar hoy sobre la procedencia ------------------------
console.log('\n----------------------------------------------------------------------');
console.log('  PROCEDENCIA: QUÉ SE PUEDE DEMOSTRAR HOY DE CADA COPIA');
console.log('----------------------------------------------------------------------');
for (const c of todas.filter((c) => /\.bak-/.test(c.f))) {
  const pruebas = [];
  pruebas.push('nombre con fecha: SÍ (pero el nombre lo pone quien copia, no prueba nada)');
  pruebas.push(`versión interna: ${c.v.ok ? 'SÍ, v' + c.v.version : 'NO'}`);
  pruebas.push('creada por ESTA instalación: NO DEMOSTRABLE');
  pruebas.push('equipo de origen: NO DEMOSTRABLE');
  pruebas.push('a qué app.asar sustituyó: NO DEMOSTRABLE');
  console.log(`  ${c.f}${c.compartida ? '  [en carpeta compartida]' : ''}`);
  pruebas.forEach((p) => console.log('      · ' + p));
}

// --- patch-log.txt: la ÚNICA pista de procedencia que existe hoy ------------
console.log('\n----------------------------------------------------------------------');
console.log('  patch-log.txt — la única pista de procedencia que hay hoy');
console.log('----------------------------------------------------------------------');
for (const z of ZONAS.filter((z) => z.rol !== 'carpeta de la INSTALACIÓN (resources)')) {
  const lp = path.join(z.dir, 'patch-log.txt');
  let txt;
  try { txt = fs.readFileSync(lp, 'utf8'); } catch (e) { console.log(`  ${z.rol}: sin patch-log.txt`); continue; }
  const aplicados = txt.split(/\r?\n/).filter((l) => /Parche aplicado correctamente sobre:/.test(l));
  // Se clasifica por la FORMA de la ruta de destino, sin imprimir la ruta.
  const clase = (l) => {
    const s = l.toLowerCase();
    if (s.includes('\\appdata\\local\\programs\\')) return 'instalación local de este usuario';
    if (s.includes('otros ordenadores') || s.includes('other computers')) return 'instalación DENTRO de Drive (otro equipo)';
    return 'otra instalación';
  };
  const agg = aplicados.reduce((m, l) => ((m[clase(l)] = (m[clase(l)] || 0) + 1), m), {});
  console.log(`  ${z.rol}: ${aplicados.length} parches aplicados registrados`);
  Object.entries(agg).forEach(([k, n]) => console.log(`      · ${n} → ${k}`));
  const ultima = aplicados[aplicados.length - 1] || '';
  const m = ultima.match(/^\[([^\]]+)\]/);
  if (m) console.log(`      · último: ${m[1].slice(0, 16).replace('T', ' ')}`);
  console.log('      · NO dice qué versión se aplicó, ni cuál se sustituyó, ni qué equipo lo hizo.');
}

console.log('\n  Nada se ha copiado, restaurado ni escrito.');
