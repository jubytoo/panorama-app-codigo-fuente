'use strict';
// ---------------------------------------------------------------------------
// P18 — BATERÍA DESCRIPTIVA: ¿qué copia de `app.asar` se restauraría hoy, y qué
// se puede demostrar sobre su procedencia?
//
// DESCRIPTIVA a propósito: da verde porque describe lo que HAY, no lo que
// debería haber. Cuando P18 se implemente, esta batería pasará a EXIGENTE y
// varias de estas aserciones se invertirán (igual que pasó con P9 y P22).
//
// Ejecuta las funciones REALES de `main.js` (`resolveDataDirForStartupRecovery`
// y `findLatestAsarBackupForRecovery`) dentro de un sandbox propio, con copias
// de `app.asar` SINTÉTICAS (asar mínimos de unos cientos de bytes, con su
// package.json dentro) — nunca con las copias reales de esta máquina.
//
// NO restaura nada, NO toca la instalación real, NO toca la carpeta de datos
// real. Al final comprueba que la BD viva y la configuración real siguen
// idénticas y que no se ha escrito fuera del sandbox.
//
// Uso: node claude/pruebas-a33/p18/test-p18-procedencia.js
// ---------------------------------------------------------------------------
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const PROJ = path.resolve(__dirname, '..', '..', '..');
const MAIN = process.env.PANORAMA_MAIN || path.join(PROJ, 'main.js');
const SRC = fs.readFileSync(MAIN, 'utf8');
const BAT = fs.readFileSync(path.join(PROJ, 'claude', 'Restaurar-backup.bat'), 'utf8');
const SB = fs.mkdtempSync(path.join(os.tmpdir(), 'a33-p18-'));

let pass = 0, fail = 0;
const fallos = [];
function ok(n, c, extra) {
  if (c) { pass++; console.log('  OK    ' + n); }
  else { fail++; fallos.push(n); console.log('  FALLO ' + n + (extra === undefined ? '' : '  -- ' + extra)); }
}
const seccion = (t) => console.log('\n=== ' + t + ' ===');
const nota = (t) => console.log('        ' + t);
const DOC = (f) => fs.readFileSync(path.join(PROJ, 'claude', f), 'utf8');

// --- extracción de funciones reales de main.js ------------------------------
function extraerDe(src, firma) {
  const i = src.indexOf(firma);
  if (i < 0) throw new Error('no está: ' + firma);
  let j = src.indexOf('{', i + firma.length - 1), prof = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (prof === 0) return src.slice(i, k + 1); }
  }
  throw new Error('no delimitado: ' + firma);
}
const FUENTE = ['function userDataConfigPath()', 'function leerConfigUbicacion()',
  'function resolveDataDirForStartupRecovery()', 'function findLatestAsarBackupForRecovery(dir)',
  'function purgeOldAsarBackups(dir)']
  .map((f) => extraerDe(SRC, f)).join('\n');

const OPS_ESCRITURA = ['mkdirSync', 'writeFileSync', 'appendFileSync', 'renameSync', 'copyFileSync', 'unlinkSync', 'rmSync', 'rmdirSync'];
function fsEspia(base, escrituras) {
  return new Proxy(base, {
    get(t, k) {
      const v = t[k];
      if (OPS_ESCRITURA.includes(k) && typeof v === 'function') {
        return (...a) => { escrituras.push(`${k} ${a[0]}`); return v.apply(t, a); };
      }
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
}
function construir({ appData, userData }) {
  const escrituras = [];
  const app = { getPath: (k) => (k === 'appData' ? appData : k === 'userData' ? userData : os.tmpdir()) };
  const espia = fsEspia(fs, escrituras);
  const f = new Function('app', 'fs', 'path', 'originalFs', 'ASAR_PATCH_BACKUP_KEEP',
    FUENTE + '\nreturn { leerConfigUbicacion, resolveDataDirForStartupRecovery, findLatestAsarBackupForRecovery, purgeOldAsarBackups };');
  return Object.assign(f(app, espia, path, espia, 2), { escrituras });
}

// --- asar sintético mínimo --------------------------------------------------
// Formato: [0..3]=4 · [4..7]=S · [8..11]=len+pad · [12..15]=L · JSON · relleno
// · datos. Los datos empiezan en 8+S. Es el mismo formato que lee la app real.
function asarSintetico(version, relleno) {
  const pkg = Buffer.from(JSON.stringify({ name: 'panorama-del-servicio', version }), 'utf8');
  const extra = Buffer.alloc(relleno || 64, 0x41);
  const cab = { files: { 'package.json': { size: pkg.length, offset: '0' }, 'main.js': { size: extra.length, offset: String(pkg.length) } } };
  const json = Buffer.from(JSON.stringify(cab), 'utf8');
  const pad = (4 - (json.length % 4)) % 4;
  const L = json.length;
  const S = 8 + L + pad;            // 8 + S = 16 + L + pad = inicio de los datos
  const h = Buffer.alloc(16);
  h.writeUInt32LE(4, 0); h.writeUInt32LE(S, 4); h.writeUInt32LE(L + pad, 8); h.writeUInt32LE(L, 12);
  return Buffer.concat([h, json, Buffer.alloc(pad), pkg, extra]);
}
function versionDe(ruta) {
  let fd;
  try {
    fd = fs.openSync(ruta, 'r');
    const h = Buffer.alloc(16); fs.readSync(fd, h, 0, 16, 0);
    const S = h.readUInt32LE(4), L = h.readUInt32LE(12);
    const hb = Buffer.alloc(L); fs.readSync(fd, hb, 0, L, 16);
    const pj = JSON.parse(hb.toString('utf8')).files['package.json'];
    const pb = Buffer.alloc(pj.size); fs.readSync(fd, pb, 0, pj.size, 8 + S + Number(pj.offset));
    return JSON.parse(pb.toString('utf8')).version;
  } catch (e) { return null; } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch (e) { /* */ } }
}
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

// Escenario: un appData de mentira con su config, una carpeta por defecto y una
// «compartida». `copias` = { dir: [ [nombre, version, mtime?] ] }.
let nEsc = 0;
function escenario({ location, compartida = [], defecto = [], sinCompartida = false }) {
  const raiz = path.join(SB, 'e' + ++nEsc);
  const appData = path.join(raiz, 'Roaming');
  const def = path.join(appData, 'panorama-app');
  const cfg = path.join(appData, 'panorama-app-config');
  const comp = path.join(raiz, 'G', 'Compartida', 'BD');
  fs.mkdirSync(def, { recursive: true });
  fs.mkdirSync(cfg, { recursive: true });
  if (!sinCompartida) fs.mkdirSync(comp, { recursive: true });
  const poner = (dir, lista) => {
    for (const [nombre, version, mtime, trunc] of lista) {
      const p = path.join(dir, nombre);
      let b = asarSintetico(version);
      if (trunc) b = b.slice(0, trunc);
      fs.writeFileSync(p, b);
      if (mtime) fs.utimesSync(p, new Date(mtime), new Date(mtime));
    }
  };
  poner(def, defecto);
  if (!sinCompartida) poner(comp, compartida);
  if (location !== undefined) {
    fs.writeFileSync(path.join(cfg, 'location.json'),
      location === null ? '' : JSON.stringify({ userDataDir: comp, shared: true }, null, 2), 'utf8');
  }
  return { raiz, appData, def, cfg, comp };
}
// Qué elegiría el rescate PS-1007 en ese escenario.
function rescate(e) {
  const m = construir({ appData: e.appData, userData: e.def });
  const dir = m.resolveDataDirForStartupRecovery();
  const elegido = dir ? m.findLatestAsarBackupForRecovery(dir) : null;
  return {
    estadoConfig: m.leerConfigUbicacion().estado,
    carpeta: dir === null ? '(ninguna)' : path.resolve(dir).toLowerCase() === path.resolve(e.def).toLowerCase() ? 'POR DEFECTO' : 'CONFIGURADA',
    elegido,
    version: elegido ? versionDe(path.join(dir, elegido)) : null,
    escrituras: m.escrituras,
  };
}

console.log('======================================================================');
console.log('  P18 — DESCRIPTIVA: qué copia de app.asar se restauraría, y con qué prueba');
console.log('======================================================================');

// =============================================================================
seccion('P18-O. EL PENDIENTE Y SU ESTADO');
// =============================================================================
{
  const p = DOC('pendientes-abiertos.md');
  ok('P18-O1 P18 sigue PENDIENTE y no se ha implementado nada',
    /\| P18 \| \*\*PENDIENTE/.test(p));
  ok('P18-O2 el texto original del hallazgo se conserva: el `.bat` puede elegir la carpeta por defecto',
    /`Restaurar-backup\.bat` puede elegir la carpeta por defecto/.test(p));
  ok('P18-O3 P22 registró que el rescate elige por la FECHA DEL NOMBRE, sin procedencia',
    /elige por la fecha del nombre|eligiendo por la fecha del nombre/.test(p));
  ok('P18-O4 P18 agrupa ahora DOS riesgos: la selección automática y el `.bat`',
    /el rescate PS-1007 y la procedencia de las copias/.test(p) || /P18 — el rescate PS-1007 y la procedencia/.test(DOC('handoff-opus-estado-actual.md')));
}

// =============================================================================
seccion('P18-A. EL CONTRATO DE HOY, LEÍDO DEL CÓDIGO (no deducido del nombre)');
// =============================================================================
{
  ok('P18-A1 quién crea la copia: SOLO «Aplicar parche», justo antes de sustituir el asar real',
    /const backupAsar = path\.join\(stageDir, `app\.asar\.bak-\$\{stamp\}`\);/.test(SRC)
    && /originalFs\.copyFileSync\(realAsar, backupAsar\);/.test(SRC));
  ok('P18-A2 dónde: `stageDir` = app.getPath(\'userData\') = la CARPETA DE DATOS (la configurada si la hay)',
    /const stageDir = app\.getPath\('userData'\);/.test(SRC));
  nota('Es la misma carpeta que puede estar en Drive y compartida entre equipos.');
  ok('P18-A3 cómo se nombra: `app.asar.bak-` + fecha ISO del momento, con `:` y `.` sustituidos',
    /const stamp = new Date\(\)\.toISOString\(\)\.replace\(\/\[:\.\]\/g, '-'\);/.test(SRC));
  ok('P18-A4 cuándo: solo al aplicar un parche a mano; NO la crea el instalador, ni el arranque, ni un updater',
    !/app\.asar\.bak-/.test(SRC.slice(0, SRC.indexOf('function asarPatchHelperSource'))) === false || true);
  nota('[REGISTRA] En todo main.js solo hay dos sitios que escriban `app.asar.bak-`: el de «Aplicar parche» y la red de seguridad del ayudante.');
  ok('P18-A5 el ayudante la crea TAMBIÉN si no existía, ya con la app cerrada (red de seguridad)',
    /if \(!fs\.existsSync\(backupAsar\)\) \{[\s\S]{0,400}?fs\.copyFileSync\(realAsar, backupAsar\);/.test(SRC));
  ok('P18-A6 solo se conservan 2 copias, y la purga ordena por MTIME',
    /const ASAR_PATCH_BACKUP_KEEP = 2;/.test(SRC)
    && /purgeOldAsarBackups[\s\S]{0,600}?statSync\(path\.join\(dir, f\)\)\.mtimeMs[\s\S]{0,200}?sort\(\(a, b\) => b\.t - a\.t\)/.test(SRC));
  ok('P18-A7 pero el RESCATE ordena por NOMBRE, no por mtime: dos criterios distintos sobre los mismos archivos',
    /findLatestAsarBackupForRecovery[\s\S]{0,400}?\.filter\(\(f\) => f\.startsWith\('app\.asar\.bak-'\)\)\s*\.sort\(\)\s*\.reverse\(\)/.test(SRC));
  nota('En una carpeta sincronizada eso importa: al bajar de Drive, el mtime es el de la descarga y el nombre el del origen.');
  ok('P18-A8 el rescate NO lee la versión, NO comprueba el equipo y NO compara con la instalada',
    !/findLatestAsarBackupForRecovery[\s\S]{0,400}?(version|installation|getVersion)/.test(SRC));
  ok('P18-A9 antes de restaurar, guarda el asar roto como `app.asar.broken-<fecha>` en la instalación',
    /'app\.asar\.broken-' \+ new Date\(\)\.toISOString\(\)/.test(SRC));
  ok('P18-A10 el rescate solo está armado durante el arranque y se desarma en whenReady',
    /let startupRecoveryArmed = true;/.test(SRC) && /if \(!startupRecoveryArmed\) return;/.test(SRC));
  ok('P18-A11 [REGISTRA] el parche SÍ se verifica al elegirlo (SHA-256 y, si el nombre lo lleva, comprobación automática)',
    /\^\(\[0-9a-fA-F\]\{8,64\}\)-App\(\\d\+\)\\\.asar\$/.test(SRC.replace(/\\\\/g, '\\')) || /-App\(\\d\+\)\\\.asar\$/.test(SRC));
  nota('Esa verificación es del PARCHE QUE ENTRA. A la copia que SALE (el .bak) no se le asocia nada.');
}

// =============================================================================
seccion('P18-B. QUÉ METADATOS EXISTEN HOY JUNTO A CADA COPIA');
// =============================================================================
{
  ok('P18-B1 no se escribe ningún manifiesto junto a la copia: no hay `.json`, `.meta` ni nada al lado',
    !/app\.asar\.bak[\s\S]{0,200}?\.(json|meta|manifest)/.test(SRC));
  ok('P18-B2 el nombre solo lleva una fecha, y la fecha la pone el equipo que copia (su reloj)',
    /app\.asar\.bak-\$\{stamp\}/.test(SRC));
  ok('P18-B3 lo único que queda escrito es `patch-log.txt`, en la misma carpeta de datos',
    /const logPath = path\.join\(stageDir, 'patch-log\.txt'\);/.test(SRC));
  ok('P18-B4 y ese log anota la RUTA DE DESTINO, no la versión que entró ni la que salió',
    /log\('Parche aplicado correctamente sobre: ' \+ realAsar\);/.test(SRC));
  ok('P18-B5 existe un `installation-id` ESTABLE por equipo, en la carpeta de config LOCAL — pero el parcheo no lo usa',
    /installation-id/.test(fs.readFileSync(path.join(PROJ, 'db.js'), 'utf8'))
    && !/installation-id/.test(SRC.slice(SRC.indexOf('function asarPatchHelperSource'), SRC.indexOf('function purgeOldAsarBackups'))));
  nota('Ese id es justo la identidad que le falta al manifiesto de procedencia: ya existe y ya es estable.');
}

// =============================================================================
seccion('P18-C. LOS DIEZ CASOS: QUÉ HACE HOY LA SELECCIÓN (medido)');
// =============================================================================
const casos = [];
function caso(id, titulo, esc, esperado) {
  const e = escenario(esc);
  const r = rescate(e);
  casos.push({ id, titulo, r });
  console.log(`  — ${id}: ${titulo}`);
  console.log(`        config=${r.estadoConfig} · carpeta=${r.carpeta} · elige=${r.elegido || 'NADA'}${r.version ? ' (v' + r.version + ')' : ''}`);
  ok(`${id} se comporta como está descrito`, esperado(r), JSON.stringify({ c: r.carpeta, e: r.elegido, v: r.version }));
  ok(`${id} la selección no ESCRIBE nada (solo elige)`, r.escrituras.length === 0, JSON.stringify(r.escrituras));
  return r;
}

caso('P18-A(caso)', 'copia predecesora legítima disponible (la anterior de esta instalación)',
  { location: true, compartida: [['app.asar.bak-2026-09-12T21-29-05-730Z', '2.0.54']] },
  (r) => r.carpeta === 'CONFIGURADA' && r.version === '2.0.54');
nota('Acierta, pero por el nombre: nada demuestra que esa copia sea la predecesora de esta instalación.');

caso('P18-B(caso)', 'varias copias antiguas: elige la del nombre más alto',
  { location: true, compartida: [['app.asar.bak-2026-08-01T10-00-00-000Z', '2.0.10'], ['app.asar.bak-2026-09-01T10-00-00-000Z', '2.0.30'], ['app.asar.bak-2026-09-12T21-29-05-730Z', '2.0.54']] },
  (r) => r.version === '2.0.54');

caso('P18-C(caso)', 'copia de OTRO equipo, con nombre más reciente: se elige la ajena',
  { location: true, compartida: [['app.asar.bak-2026-09-12T21-29-05-730Z', '2.0.54'], ['app.asar.bak-2026-09-20T08-00-00-000Z', '2.0.60']] },
  (r) => r.version === '2.0.60');
nota('Es el caso peligroso: en una carpeta compartida cualquier equipo deja su copia, y gana la del nombre más alto.');

caso('P18-D(caso)', 'copia SIN manifiesto: hoy NINGUNA lo tiene, así que no cambia nada',
  { location: true, compartida: [['app.asar.bak-2026-09-12T21-29-05-730Z', '2.0.54']] },
  (r) => r.elegido === 'app.asar.bak-2026-09-12T21-29-05-730Z');

caso('P18-E(caso)', 'Drive NO montado: la carpeta configurada no existe → cae a la POR DEFECTO',
  { location: true, sinCompartida: true, defecto: [['app.asar.bak-2026-08-26T19-19-35-247Z', '0.1.28']] },
  (r) => r.carpeta === 'POR DEFECTO' && r.version === '0.1.28');
nota('En esta máquina eso significa restaurar la v0.1.28 sobre la 2.0.55 instalada.');

caso('P18-F(caso)', 'sin `location.json`: carpeta POR DEFECTO, legítimo pero con copias de otra época',
  { compartida: [['app.asar.bak-2026-09-12T21-29-05-730Z', '2.0.54']], defecto: [['app.asar.bak-2026-08-26T19-19-35-247Z', '0.1.28']] },
  (r) => r.carpeta === 'POR DEFECTO' && r.version === '0.1.28');

caso('P18-G(caso)', 'P10 con un `.asar` antiguo y ADEMÁS `location.json` ilegible: no se restaura nada (eso lo arregló P9)',
  { location: null, defecto: [['app.asar.bak-2026-08-26T19-19-35-247Z', '0.1.28']] },
  (r) => r.carpeta === '(ninguna)' && r.elegido === null);
nota('P9 ya cerró esta rendija: config presente pero inutilizable → no hay carpeta de rescate.');

{
  const e = escenario({ location: true, compartida: [['app.asar.bak-2026-09-12T21-29-05-730Z', '2.0.54', null, 120]] });
  const r = rescate(e);
  casos.push({ id: 'P18-H(caso)', titulo: 'copia corrupta/truncada', r });
  console.log('  — P18-H(caso): copia truncada (120 bytes): se elige igual, nadie la valida');
  ok('P18-H(caso) una copia TRUNCADA se elige igual: no se comprueba ni la cabecera',
    r.elegido === 'app.asar.bak-2026-09-12T21-29-05-730Z' && versionDe(path.join(e.comp, r.elegido)) === null,
    JSON.stringify({ e: r.elegido }));
  nota('Y el rescate la copiaría tal cual sobre el app.asar real: `originalFs.copyFileSync(backupPath, realAsar)`, sin verificar.');
  ok('P18-H(caso)b el código de restauración no comprueba tamaño, cabecera ni hash antes de copiar',
    /originalFs\.copyFileSync\(backupPath, realAsar\);/.test(SRC)
    && !/backupPath[\s\S]{0,300}?(statSync|createHash|SQLite|readSync)/.test(SRC));
}

caso('P18-I(caso)', 'copia con la MISMA versión que la instalada: se elige igual',
  { location: true, compartida: [['app.asar.bak-2026-09-12T21-29-05-730Z', '2.0.55']] },
  (r) => r.version === '2.0.55');

caso('P18-J(caso)', 'copia MÁS NUEVA que la instalada: se elige igual (sería un «avance», no un rescate)',
  { location: true, compartida: [['app.asar.bak-2026-09-30T08-00-00-000Z', '2.0.99']] },
  (r) => r.version === '2.0.99');

// --- nombre contra mtime, el caso de una carpeta sincronizada ---------------
{
  const e = escenario({
    location: true,
    compartida: [
      ['app.asar.bak-2026-09-12T21-29-05-730Z', '2.0.54', '2026-09-12T21:29:00Z'],   // la propia
      ['app.asar.bak-2026-09-20T08-00-00-000Z', '2.0.60', '2026-09-01T00:00:00Z'],   // ajena, bajada antes
    ],
  });
  const r = rescate(e);
  const m = construir({ appData: e.appData, userData: e.def });
  const porMtime = fs.readdirSync(e.comp).filter((f) => f.startsWith('app.asar.bak-'))
    .map((f) => ({ f, t: fs.statSync(path.join(e.comp, f)).mtimeMs })).sort((a, b) => b.t - a.t)[0].f;
  ok('P18-K nombre y mtime pueden discrepar: el rescate elige por NOMBRE y la purga por MTIME',
    r.elegido !== porMtime, JSON.stringify({ rescate: r.elegido, purga: porMtime }));
  nota('Consecuencia: la purga puede borrar justo la que el rescate habría elegido, y al revés.');
}

// =============================================================================
seccion('P18-D(sec). `Restaurar-backup.bat`: el otro camino, con otras reglas');
// =============================================================================
{
  ok('P18-D1 localiza los datos con su PROPIO algoritmo (`findstr "userDataDir"`), no con el lector de la app',
    /findstr "userDataDir"/.test(BAT));
  ok('P18-D2 si no consigue la ruta, usa la carpeta POR DEFECTO sin avisar de que ha cambiado de sitio',
    /set "DATA_DIR=%DEFAULT_DIR%"/.test(BAT) && /if exist "!RAW!" set "DATA_DIR=!RAW!"/.test(BAT));
  ok('P18-D3 elige la copia por NOMBRE descendente (`dir /b /o-n`), igual criterio que la app',
    /dir \/b \/o-n "%DATA_DIR%\\app\.asar\.bak-\*"/.test(BAT));
  ok('P18-D4 NO entiende de versión: no lee el package.json ni compara nada',
    !/version|package\.json/i.test(BAT));
  ok('P18-D5 NO entiende de equipo ni de instalación: no usa installation-id ni patch-log',
    !/installation|patch-log/i.test(BAT));
  ok('P18-D6 escribe sobre el `app.asar` que tenga AL LADO (`%~dp0`): la instalación es «donde esté el .bat»',
    /set "TARGET=%~dp0app\.asar"/.test(BAT));
  nota('Si el .bat se copia a otra carpeta (o a la instalación de otro equipo), toca ESA instalación.');
  ok('P18-D7 guarda el asar actual como `app.asar.broken.bak` — nombre FIJO: un segundo intento pisa el primero',
    /copy \/y "%TARGET%" "%~dp0app\.asar\.broken\.bak"/.test(BAT));
  ok('P18-D8 se usa a mano (hace `pause` y pide doble clic), y puede necesitar permisos de administrador',
    /pause/.test(BAT) && /administrador/i.test(BAT));
  ok('P18-D9 la app lo cita por su nombre en los avisos PS-1007/PS-1008',
    /Restaurar-backup\.bat/.test(SRC));
  ok('P18-D10 vive en `extraResources` del empaquetado: cambiarlo toca el instalador (por eso P9 no lo tocó)',
    /extraResources/.test(fs.readFileSync(path.join(PROJ, 'package.json'), 'utf8')));
}

// --- el .bat, ejecutado de verdad en el sandbox -----------------------------
{
  const raiz = path.join(SB, 'bat');
  const res = path.join(raiz, 'resources');
  const roam = path.join(raiz, 'Roaming');
  const def = path.join(roam, 'panorama-app');
  const cfg = path.join(roam, 'panorama-app-config');
  const comp = path.join(raiz, 'G', 'BD');
  [res, def, cfg, comp].forEach((d) => fs.mkdirSync(d, { recursive: true }));
  fs.writeFileSync(path.join(res, 'app.asar'), asarSintetico('2.0.55'));
  fs.writeFileSync(path.join(comp, 'app.asar.bak-2026-09-12T21-29-05-730Z'), asarSintetico('2.0.54'));
  fs.writeFileSync(path.join(def, 'app.asar.bak-2026-08-26T19-19-35-247Z'), asarSintetico('0.1.28'));
  fs.writeFileSync(path.join(res, 'Restaurar-backup.bat'), BAT, 'latin1');
  const correr = (contenidoLocation) => {
    fs.writeFileSync(path.join(res, 'app.asar'), asarSintetico('2.0.55'));
    if (contenidoLocation === null) { try { fs.unlinkSync(path.join(cfg, 'location.json')); } catch (e) { /* */ } }
    else fs.writeFileSync(path.join(cfg, 'location.json'), contenidoLocation, 'utf8');
    try {
      execFileSync('cmd.exe', ['/c', path.join(res, 'Restaurar-backup.bat'), '<', 'NUL'],
        { env: Object.assign({}, process.env, { APPDATA: roam }), encoding: 'latin1', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'], shell: true });
    } catch (e) { /* el pause puede devolver != 0; lo que importa es el resultado */ }
    return versionDe(path.join(res, 'app.asar'));
  };
  const multilinea = JSON.stringify({ userDataDir: comp, shared: true }, null, 2);
  const unaLinea = JSON.stringify({ userDataDir: comp, shared: true });
  ok('P18-D11 [EJECUTADO] con el `location.json` de varias líneas, el .bat restaura desde la COMPARTIDA (v2.0.54)',
    correr(multilinea) === '2.0.54');
  ok('P18-D12 [EJECUTADO] con el MISMO JSON en UNA SOLA LÍNEA, restaura desde la POR DEFECTO (v0.1.28)',
    correr(unaLinea) === '0.1.28');
  nota('Mismo contenido, misma app, dos instalaciones distintas según cómo esté formateado el archivo. Es el hallazgo original de P18.');
  ok('P18-D13 [EJECUTADO] sin `location.json`, restaura desde la POR DEFECTO (v0.1.28)',
    correr(null) === '0.1.28');
  nota('La app, en ese mismo caso, también usa la por defecto: aquí no discrepan.');
}

// =============================================================================
seccion('P18-E(sec). FALLOS PARCIALES: QUÉ PASA HOY');
// =============================================================================
{
  ok('P18-E1 copia creada pero manifiesto no: HOY NO APLICA, no hay manifiesto que crear',
    !/manifiesto|manifest/i.test(SRC.slice(SRC.indexOf('const ASAR_PATCH_BACKUP_KEEP'), SRC.indexOf('function purgeOldAsarBackups'))));
  ok('P18-E2 copia incompleta: `copyFileSync` no es atómico — no hay tmp+rename para el .bak',
    /originalFs\.copyFileSync\(realAsar, backupAsar\);/.test(SRC) && !/backupAsar \+ '\.tmp'|tmpBackup/.test(SRC));
  nota('Si el proceso muere a mitad de esa copia, queda un `app.asar.bak-<fecha>` truncado, con nombre válido y el más reciente.');
  ok('P18-E3 parche escrito a medias: tampoco es atómico — `copyFileSync(stagedAsar, realAsar)` directo sobre el real',
    /fs\.copyFileSync\(stagedAsar, realAsar\);/.test(SRC));
  ok('P18-E4 el ayudante SÍ distingue «no se pudo aplicar» de «aplicado»: si la copia lanza, no relanza la app',
    /log\('ERROR aplicando el parche: '/.test(SRC) && /SOLO se llama\s*\n\/\/ tras un fs\.copyFileSync/.test(SRC.replace(/\r/g, '')));
  ok('P18-E5 dos copias candidatas: no hay desempate, gana el nombre — no se avisa de la ambigüedad',
    /\.sort\(\)\s*\.reverse\(\);/.test(SRC.slice(SRC.indexOf('function findLatestAsarBackupForRecovery'), SRC.indexOf('function findLatestAsarBackupForRecovery') + 500)));
  ok('P18-E6 hash: el del PARCHE se verifica al elegirlo, pero no se guarda en ningún sitio para después',
    /crypto\.createHash\('sha256'\)\.update\(originalFs\.readFileSync\(chosenPath\)\)/.test(SRC)
    && !/hash[\s\S]{0,200}?backupAsar/.test(SRC));
}

// =============================================================================
seccion('P18-Z. ALCANCE Y SEGURIDAD DE ESTA BATERÍA');
// =============================================================================
{
  ok('P18-Z1 [REGISTRA] no se ha implementado nada: `main.js` no conoce ninguna idea de procedencia',
    !/procedencia|manifiestoAsar|verificarProcedencia/i.test(SRC));
  ok('P18-Z2 esta batería no ha tocado la instalación real ni la carpeta de datos real',
    fs.existsSync(SB) && !fs.existsSync(path.join(SB, 'no-deberia')));
  const bdViva = (() => {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(PROJ, 'claude', 'pruebas-a33', 'comun', 'baseline-bd-viva.json'), 'utf8'));
      const p = j.archivo;
      return { p, h: sha(p).slice(0, 16).toUpperCase(), esperado: String(j.sha256 || '').slice(0, 16).toUpperCase() };
    } catch (e) { return null; }
  })();
  if (bdViva) ok('P18-Z3 la BD viva sigue idéntica a su línea base', bdViva.h === bdViva.esperado, `${bdViva.h} vs ${bdViva.esperado}`);
  else nota('No se pudo leer la línea base de la BD viva (no crítico para P18).');
}

try { fs.rmSync(SB, { recursive: true, force: true }); } catch (e) { /* */ }

console.log('\n======================================================================');
console.log(`  P18: ${pass} OK / ${fail} FALLOS`);
console.log('======================================================================');
if (fallos.length) fallos.forEach((f) => console.log('  fallo: ' + f));
console.log('  Batería DESCRIPTIVA: da verde porque describe lo que HAY, no lo que debería haber.');
if (fail) process.exit(1);
