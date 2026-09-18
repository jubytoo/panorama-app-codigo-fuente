'use strict';
// ---------------------------------------------------------------------------
// P22 — LA CARPETA DE DATOS LOCAL NO SE USA SIN DECIRLO. Batería EXIGENTE
// (17 sept 2026, tras implementar).
//
// Nació DESCRIPTIVA (33 OK / 0, el mismo día) y daba verde porque describía el
// defecto: cuatro caminos legítimos abrían —o creaban— una base de datos local
// sin preguntar, y uno de ellos sin ningún diálogo. Esas aserciones quedan
// INVERTIDAS. Lo que sigue igual a propósito se marca [REGISTRA].
//
// Ejecuta las funciones REALES de main.js (extraídas por firma) contra un
// sandbox, con dobles de `dialog` y un espía de escrituras de `fs`:
//   A. reconocimiento de la base de datos local en CUATRO estados
//   B. marca durable «este equipo usó una ubicación propia», y su degradación
//   C. la puerta `autorizarCarpetaLocal()` y el contrato de los diálogos
//   D. la decisión de A3.3 y la protección de apagado (P20)
// Los casos P22-1..P22-16 del encargo llevan su número delante.
// El rescate de app.asar (PS-1007) NO se toca: es P18.
// Variables: PANORAMA_MAIN (main.js alternativo: reversiones).
// ---------------------------------------------------------------------------
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { crearGuardia } = require('../comun/guardia-rutas');
const ofs = (() => { try { return require('original-fs'); } catch (e) { return fs; } })();

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const MAIN = fs.readFileSync(process.env.PANORAMA_MAIN || path.join(PROJ, 'main.js'), 'utf8');
const DOC = (n) => fs.readFileSync(path.join(PROJ, 'claude', n), 'utf8');
const guardia = crearGuardia({ marca: '_a33-p22' });
const SB = guardia.segura(path.join(os.tmpdir(), '_a33-p22-node'));
ofs.rmSync(SB, { recursive: true, force: true });
fs.mkdirSync(SB, { recursive: true });
process.on('exit', () => { try { ofs.rmSync(SB, { recursive: true, force: true }); } catch (e) {} });

let pass = 0, fail = 0; const fallos = [];
function ok(n, c, extra) {
  if (c) { pass++; console.log('  OK    ' + n); }
  else { fail++; fallos.push(n); console.log('  FALLO ' + n + (extra === undefined ? '' : '  -- ' + extra)); }
}
const seccion = (t) => console.log('\n=== ' + t + ' ===');
const nota = (s) => console.log('        ' + s);
const soloCodigo = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
function extraerDe(src, firma) {
  const i = src.indexOf(firma);
  if (i < 0) throw new Error('NO SE ENCONTRO: ' + firma);
  let j = src.indexOf('{', i + firma.length - 1), prof = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (prof === 0) return src.slice(i, k + 1); }
  }
  throw new Error('no delimitado: ' + firma);
}
const cuerpo = (f) => { try { return extraerDe(MAIN, f); } catch (e) { return ''; } };
const C = soloCodigo(MAIN);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const shaF = (p) => { try { return sha(fs.readFileSync(p)); } catch (e) { return 'NO-EXISTE'; } };

// =============================================================================
seccion('P22-O. ESTADO');
// =============================================================================
const PEND = DOC('pendientes-abiertos.md');
ok('P22-O1 el diagnóstico y el diseño se conservan, y hay sección de implementación',
  /## P22 — DIAGNÓSTICO \(17 sept 2026\)/.test(PEND) && /## P22 — DISEÑO FINAL \(17 sept 2026\)/.test(PEND)
  && /## P22 — IMPLEMENTACIÓN Y CIERRE \(17-18 sept 2026\)/.test(PEND));
ok('P22-O2 resumen: P22 CERRADO y P20 cerrado dentro de P22',
  /\| P22 \| \*\*CERRADO\*\* \*\(17-18 sept 2026\)\*/.test(PEND) && /\| P20 \| \*\*CERRADO dentro de P22\*\*/.test(PEND));

// =============================================================================
seccion('P22-A. LA BASE DE DATOS LOCAL, EN CUATRO ESTADOS');
// =============================================================================
const AMBITO = [
  'let customUserDataDirFailure = null;', 'let customUserDataDirTarget = null;', 'let customUserDataDirShared = true;',
  'let configUbicacionNoResuelta = null;', 'let usuarioAutorizaEmpezarDesdeCero = false;',
  'let usuarioAutorizaCrearLocal = false;', 'let sesionLocalTemporal = false;', 'let historialUbicacionDegradado = null;',
  MAIN.slice(MAIN.indexOf('const INDICIOS_DE_NUBE = ['), MAIN.indexOf('];', MAIN.indexOf('const INDICIOS_DE_NUBE = [')) + 2),
  MAIN.match(/^const CABECERA_SQLITE = [^\n]*$/m)[0],
  MAIN.match(/^const FSYNC_NO_SOPORTADO_REG = [^\n]*$/m)[0],
  ...['function userDataConfigPath()', 'function leerConfigUbicacion()', 'function probeWritableDir(dir)',
    'function applyCustomUserDataDirIfConfigured()', 'function isUsingCustomDataLocationNow()', 'function isUsingSharedDataLocationNow()',
    'function rutaRegistroUbicaciones()', 'function claveUbicacion(dir)', 'function leerRegistroUbicaciones()',
    'function guardarRegistroUbicaciones(ubicaciones)', 'function estadoUbicacion(dir)', 'function rutaConIndiciosDeNube(ruta)',
    'function clasificarPoliticaUbicacion()', 'function decidirCrearSiAusente()', 'function estadoDeArchivoEnRuta(p)',
    'function restosEnCarpetaDeDatos(dir)', 'function rutaHistorialUbicacion()', 'function claveHashUbicacion(dir)',
    'function leerHistorialUbicacion()', 'function guardarHistorialUbicacion(j)', 'function registrarUbicacionPersonalizada(dir, compartida)',
    'function registrarDecisionUbicacion(que)', 'function huboUbicacionPersonalizada()', 'function estadoBaseDeDatosLocal(dir)',
    'function descripcionBaseDeDatosLocal(bd)', 'function carpetaLocalNecesitaConfirmacion(motivo, hist)',
    'function avisoBaseLocalInutilizable(bd)', 'function preguntarPorLaCarpetaLocal({ codigo, titulo, mensaje, cuerpo, etiquetaReintento })',
    'function autorizarCarpetaLocal(motivo)', 'function syncDriveSyncGuardWithLocation()'].map((f) => extraerDe(MAIN, f)),
].join('\n');

const ESCRITURAS = ['writeFileSync', 'appendFileSync', 'mkdirSync', 'renameSync', 'unlinkSync', 'rmSync', 'rmdirSync', 'copyFileSync', 'openSync'];
function fsEspia(base, reg, fallos) {
  return new Proxy(base, {
    get(t, k) {
      const v = t[k];
      if (typeof v !== 'function') return v;
      if (fallos && fallos[k]) return (...a) => { if (fallos[k](a[0])) { const e = new Error(`${k} simulado`); e.code = fallos.codigo || 'EACCES'; throw e; } return v.apply(t, a); };
      if (ESCRITURAS.includes(k)) {
        return (...a) => {
          if (!(k === 'openSync' && (a[1] === undefined || a[1] === 'r'))) reg.push(`${k} ${path.basename(String(a[0]))}`);
          return v.apply(t, a);
        };
      }
      return v.bind(t);
    },
  });
}

function construir({ appData, userData, defecto, fsImpl, guardActiva }) {
  const t = { userData, setPath: [], logs: [], dialogos: [], escrituras: [], guard: [], quit: 0 };
  const app = {
    getPath(k) { if (k === 'appData') return appData; if (k === 'userData') return t.userData; if (k === 'temp') return os.tmpdir(); throw new Error('getPath ' + k); },
    setPath(k, v) { t.setPath.push([k, v]); t.userData = v; },
    quit() { t.quit++; },
  };
  const dialog = { showMessageBoxSync(a, b) { const o = (b || a) || {}; t.dialogos.push(o); return typeof t.respuesta === 'function' ? t.respuesta(o) : (t.respuesta === undefined ? (o.cancelId || 0) : t.respuesta); } };
  const fsUsado = fsEspia(fsImpl || fs, t.escrituras);
  const f = new Function('app', 'fs', 'path', 'crypto', 'dbmod', 'appLog', 'dialog', 'process', 'errorCodeSuffix',
    'defaultUserDataDir', 'isDriveSyncGuardEnabled', 'isDriveSyncGuardActuallyAlive', 'enableDriveSyncGuardSilently',
    'disableDriveSyncGuardSilently', 'refreshAllMenus', 'sleepSyncMs', 'Date',
    AMBITO + '\nreturn { estadoBaseDeDatosLocal, descripcionBaseDeDatosLocal, leerHistorialUbicacion, guardarHistorialUbicacion,'
    + ' registrarUbicacionPersonalizada, registrarDecisionUbicacion, huboUbicacionPersonalizada, autorizarCarpetaLocal,'
    + ' preguntarPorLaCarpetaLocal, decidirCrearSiAusente, applyCustomUserDataDirIfConfigured, syncDriveSyncGuardWithLocation,'
    + ' estado: () => ({ temporal: sesionLocalTemporal, crearLocal: usuarioAutorizaCrearLocal, degradado: historialUbicacionDegradado }),'
    + ' set: (k, v) => { if (k === "target") customUserDataDirTarget = v; else if (k === "shared") customUserDataDirShared = v;'
    + ' else if (k === "failure") customUserDataDirFailure = v; else if (k === "degradado") historialUbicacionDegradado = v; } };');
  class FakeDate extends Date {} FakeDate.now = () => Date.now();
  const api = f(app, fsUsado, path, crypto, {}, (s) => t.logs.push(String(s)), dialog,
    { pid: process.pid, platform: 'win32', resourcesPath: SB, env: process.env },
    (c) => `\n\n(código ${c})`, defecto, () => !!guardActiva, () => true,
    (r) => t.guard.push('enable:' + r), (r) => t.guard.push('disable:' + r), () => {}, () => {}, FakeDate);
  return Object.assign(api, { t });
}

// --- escenarios de carpeta ------------------------------------------------------
let n = 0;
function escenario({ bdLocal, registro, historial, location }) {
  const raiz = path.join(SB, 'e' + (++n));
  const appData = path.join(raiz, 'Roaming');
  const defecto = path.join(appData, 'panorama-app');
  const compartida = path.join(raiz, 'G', 'BD');
  fs.mkdirSync(path.join(appData, 'panorama-app-config'), { recursive: true });
  fs.mkdirSync(defecto, { recursive: true });
  fs.mkdirSync(compartida, { recursive: true });
  const bd = path.join(defecto, 'panorama.sqlite3');
  if (bdLocal === 'sqlite') fs.writeFileSync(bd, Buffer.concat([Buffer.from('SQLite format 3\0', 'latin1'), Buffer.alloc(4096)]));
  if (bdLocal === 'sqlite+gen') { fs.writeFileSync(bd, Buffer.concat([Buffer.from('SQLite format 3\0', 'latin1'), Buffer.alloc(4096)])); fs.writeFileSync(bd + '.gen', '7'); }
  if (bdLocal === 'cero') fs.writeFileSync(bd, '');
  if (bdLocal === 'texto') fs.writeFileSync(bd, 'esto no es una base de datos, es un resto de algo');
  if (bdLocal === 'carpeta') fs.mkdirSync(bd);
  const clave = (d) => path.resolve(d).toLowerCase();
  if (registro) {
    const u = {};
    for (const [quien, estado] of Object.entries(registro)) u[clave(quien === 'defecto' ? defecto : compartida)] = { estado };
    fs.writeFileSync(path.join(appData, 'panorama-app-config', 'ubicaciones-inicializadas.json'), JSON.stringify({ v: 1, ubicaciones: u }));
  }
  if (historial === 'valido') {
    fs.writeFileSync(path.join(appData, 'panorama-app-config', 'historial-ubicacion.json'),
      JSON.stringify({ v: 1, personalizada: { clave_sha256: sha(Buffer.from(clave(compartida))), compartida: true, primera_vez: '2026-08-01T00:00:00.000Z', ultima_vez: '2026-09-01T00:00:00.000Z' }, decisiones: [] }));
  }
  if (historial === 'ilegible') fs.writeFileSync(path.join(appData, 'panorama-app-config', 'historial-ubicacion.json'), '{roto');
  if (location) fs.writeFileSync(path.join(appData, 'panorama-app-config', 'location.json'), JSON.stringify({ userDataDir: compartida, shared: true }));
  return { raiz, appData, defecto, compartida, bd };
}

for (const [caso, tipo, espera, extra] of [
  ['P22-A1', 'sqlite', 'existente', 'con la cabecera de SQLite'],
  ['P22-A1', 'sqlite+gen', 'existente', 'y con el testigo .gen de A3.3'],
  ['P22-13', 'cero', 'invalida', '0 bytes: NO es «no hay base de datos»'],
  ['P22-14', 'texto', 'invalida', 'contenido que no es SQLite'],
  ['P22-14', 'carpeta', 'invalida', 'en su sitio hay una carpeta'],
  ['P22-A2', null, 'ausente', 'ENOENT demostrado'],
]) {
  const e = escenario({ bdLocal: tipo });
  const m = construir({ appData: e.appData, userData: e.defecto, defecto: e.defecto });
  const bd = m.estadoBaseDeDatosLocal(e.defecto);
  ok(`${caso} ${extra} → «${espera}»`, bd.estado === espera, JSON.stringify(bd));
  if (tipo === 'sqlite+gen') ok('P22-A1b …y se anota que lleva el testigo (dato del diálogo, sin abrir la base)', bd.gen === true);
}
{
  const e = escenario({ bdLocal: 'sqlite' });
  for (const [codigo, cual] of [['EACCES', 'openSync'], ['EBUSY', 'openSync'], ['EIO', 'statSync']]) {
    const m = construir({ appData: e.appData, userData: e.defecto, defecto: e.defecto, fsImpl: fsEspia(fs, [], { [cual]: (p) => String(p).endsWith('panorama.sqlite3'), codigo }) });
    const bd = m.estadoBaseDeDatosLocal(e.defecto);
    ok(`P22-15 ${cual} falla con ${codigo} → «no-comprobable» (nunca «ausente»)`, bd.estado === 'no-comprobable' && bd.codigo === codigo, JSON.stringify(bd));
  }
}
{
  const e = escenario({ bdLocal: 'sqlite' });
  const m = construir({ appData: e.appData, userData: e.defecto, defecto: e.defecto });
  const antes = m.t.escrituras.length;
  m.estadoBaseDeDatosLocal(e.defecto);
  ok('P22-A3 mirar la base de datos local NO escribe nada y no la abre (solo stat + 16 bytes)',
    m.t.escrituras.length === antes && !/getDb|sql\.js|initSqlJs/.test(cuerpo('function estadoBaseDeDatosLocal(dir)')));
  const txt = m.descripcionBaseDeDatosLocal(m.estadoBaseDeDatosLocal(e.defecto));
  ok('P22-A4 la descripción para el usuario lleva fecha y tamaño, y NO la ruta',
    /última modificación/.test(txt) && /tamaño/.test(txt) && !txt.includes(e.defecto) && !/[A-Za-z]:\\/.test(txt), JSON.stringify(txt));
}

// =============================================================================
seccion('P22-B. LA MARCA DURABLE, Y QUÉ PASA SI NO SE PUEDE ESCRIBIR');
// =============================================================================
{
  const e = escenario({});
  const m = construir({ appData: e.appData, userData: e.compartida, defecto: e.defecto });
  const r = m.registrarUbicacionPersonalizada(e.compartida, true);
  const j = JSON.parse(fs.readFileSync(path.join(e.appData, 'panorama-app-config', 'historial-ubicacion.json'), 'utf8'));
  ok('P22-B1 se escribe la marca con el HASH de la ruta, si era compartida y las fechas — nunca la ruta',
    r.ok && j.v === 1 && /^[0-9a-f]{64}$/.test(j.personalizada.clave_sha256) && j.personalizada.compartida === true
    && j.personalizada.primera_vez && j.personalizada.ultima_vez
    && !JSON.stringify(j).includes(e.compartida) && !/[A-Za-z]:\\\\/.test(JSON.stringify(j)), JSON.stringify(j));
  ok('P22-B2 la escritura es atómica y verificada: no queda ningún .tmp y se relee antes de darla por buena',
    fs.readdirSync(path.join(e.appData, 'panorama-app-config')).every((f) => !f.includes('.tmp-'))
    && /fsyncSync/.test(cuerpo('function guardarHistorialUbicacion(j)')) && /renameSync/.test(cuerpo('function guardarHistorialUbicacion(j)'))
    && /tras escribir no se pudo releer/.test(cuerpo('function guardarHistorialUbicacion(j)')));
  const antes = JSON.stringify(j);
  m.registrarUbicacionPersonalizada(e.compartida, true);
  const j2 = JSON.parse(fs.readFileSync(path.join(e.appData, 'panorama-app-config', 'historial-ubicacion.json'), 'utf8'));
  ok('P22-B3 al repetir se conserva «primera_vez» y se actualiza «ultima_vez»',
    j2.personalizada.primera_vez === j.personalizada.primera_vez && j2.personalizada.ultima_vez >= j.personalizada.ultima_vez, antes + ' → ' + JSON.stringify(j2));
  m.registrarDecisionUbicacion('volver-a-por-defecto');
  const j3 = JSON.parse(fs.readFileSync(path.join(e.appData, 'panorama-app-config', 'historial-ubicacion.json'), 'utf8'));
  ok('P22-B4 «volver a la carpeta por defecto» AÑADE la decisión y NO borra la marca',
    j3.personalizada && j3.decisiones.length === 1 && j3.decisiones[0].que === 'volver-a-por-defecto' && j3.decisiones[0].at, JSON.stringify(j3));
}
{
  // P22-16: no se puede escribir la marca -> ni silencio ni falsa «primera instalación».
  const e = escenario({});
  const malo = fsEspia(fs, [], { renameSync: (p) => String(p).includes('historial-ubicacion'), codigo: 'EACCES' });
  const m = construir({ appData: e.appData, userData: e.compartida, defecto: e.defecto, fsImpl: malo });
  const r = m.registrarUbicacionPersonalizada(e.compartida, true);
  ok('P22-16 si no se puede persistir la marca, se dice: devuelve el fallo y lo deja en el registro con PS-1024',
    r.ok === false && !!r.motivo && m.t.logs.some((l) => /ERROR PS-1024/.test(l)), JSON.stringify({ r, logs: m.t.logs }));
  ok('P22-16b …y el estado queda marcado como DEGRADADO', !!m.estado().degradado);
  const h = m.huboUbicacionPersonalizada();
  ok('P22-16c …y a partir de ahí la ausencia de marca NO cuenta como «instalación nueva»', h.si === true && h.degradado === true, JSON.stringify(h));
  ok('P22-16d …no queda ningún .tmp suelto', fs.readdirSync(path.join(e.appData, 'panorama-app-config')).every((f) => !f.includes('.tmp-')));
  const d = m.decidirCrearSiAusente();
  ok('P22-16e …y la decisión de A3.3 NO autoriza crear una base local', d.crear === false && d.historicaConocida === true, JSON.stringify(d));
}
for (const [caso, esc, espera, fuente] of [
  ['P22-B5', { historial: 'valido' }, true, 'historial de ubicación'],
  ['P22-B5', { historial: 'ilegible' }, true, 'historial de ubicación ilegible'],
  ['P22-B6', { registro: { compartida: 'inicializada' } }, true, 'registro de ubicaciones de A3.3'],
  ['P22-B7', { registro: { defecto: 'inicializada' } }, false, null],
  ['P22-B8', {}, false, null],
]) {
  const e = escenario(esc);
  const m = construir({ appData: e.appData, userData: e.defecto, defecto: e.defecto });
  const h = m.huboUbicacionPersonalizada();
  ok(`${caso} ¿hubo ubicación propia? ${espera ? 'SÍ' : 'no'} ${fuente ? '(' + fuente + ')' : '(carpeta por defecto de toda la vida)'}`,
    h.si === espera && (!fuente || String(h.fuente).includes(fuente)), JSON.stringify(h));
}
{
  const e = escenario({ registro: { compartida: 'inicializada' } });
  const m = construir({ appData: e.appData, userData: e.defecto, defecto: e.defecto, guardActiva: true });
  ok('P22-B9 la marca de la protección de apagado también vale como señal',
    m.huboUbicacionPersonalizada().si === true);
}

// =============================================================================
seccion('P22-C. LA PUERTA: NADA LOCAL SIN DECIRLO');
// =============================================================================
function puerta(esc, respuesta, motivo = 'sin-configuracion') {
  const e = escenario(esc);
  const m = construir({ appData: e.appData, userData: e.defecto, defecto: e.defecto, guardActiva: !!esc.guard });
  m.t.respuesta = respuesta;
  const hAntes = shaF(e.bd);
  const genAntes = fs.existsSync(e.bd + '.gen');
  const regAntes = shaF(path.join(e.appData, 'panorama-app-config', 'ubicaciones-inicializadas.json'));
  const r = m.autorizarCarpetaLocal(motivo);
  return { e, m, r, hAntes, genAntes, regAntes, hDespues: shaF(e.bd), genDespues: fs.existsSync(e.bd + '.gen'), regDespues: shaF(path.join(e.appData, 'panorama-app-config', 'ubicaciones-inicializadas.json')) };
}
const btn = (o, texto) => ((o && o.buttons) || []).indexOf(texto);
// Con una reversión puede no haber diálogo: el escape debe FALLAR la aserción,
// nunca reventar la batería (si revienta no se sabe qué grupos caen).
const escape = (o) => ((o && o.buttons) || [])[o && o.cancelId];
{
  const p = puerta({ bdLocal: 'sqlite', historial: 'valido' }, (o) => o.cancelId);
  const o = p.m.t.dialogos[0] || {};
  ok('P22-6 sin location.json y con base de datos local: PREGUNTA antes de nada (PS-1021)',
    p.m.t.dialogos.length === 1 && /PS-1021/.test(String(o.detail)), JSON.stringify(o.buttons));
  ok('P22-1/P22-2 Esc y la X (cancelId) son «Cerrar»: la puerta responde «cerrar» y no se sigue',
    escape(o) === 'Cerrar' && p.r === 'cerrar', JSON.stringify({ buttons: o.buttons, cancelId: o.cancelId, r: p.r }));
  ok('P22-1b el botón de usar lo local es EXPLÍCITO y no es el de escape',
    btn(o, 'Usar estos datos locales') >= 0 && btn(o, 'Usar estos datos locales') !== o.cancelId);
  ok('P22-9 al cerrar, la base de datos local queda IDÉNTICA: sin .gen, sin registro nuevo, sin escrituras',
    p.hAntes === p.hDespues && p.hAntes !== 'NO-EXISTE' && !p.genDespues && p.regAntes === p.regDespues
    && p.m.t.escrituras.length === 0, JSON.stringify({ e: p.m.t.escrituras }));
  ok('P22-C1 el diálogo dice fecha y tamaño de esa base de datos, y avisa de que puede ser más antigua',
    /última modificación/.test(String(o.detail)) && /tamaño/.test(String(o.detail)) && /MUCHO más antiguos/.test(String(o.detail)));
  ok('P22-C2 …y no enseña ninguna ruta', !/[A-Za-z]:\\/.test(String(o.detail)) && !String(o.detail).includes(p.e.defecto), String(o.detail).slice(0, 120));
}
{
  const p = puerta({ bdLocal: 'sqlite', historial: 'valido' }, (o) => btn(o, 'Usar estos datos locales'));
  ok('P22-3 solo con la aceptación EXPLÍCITA se sigue, y la sesión queda marcada como local temporal',
    p.r === 'seguir' && p.m.estado().temporal === true && p.m.estado().crearLocal === false, JSON.stringify(p.m.estado()));
  ok('P22-3b …y ni siquiera entonces se ha tocado la base de datos: eso lo hace después A3.3',
    p.hAntes === p.hDespues && !p.genDespues && p.m.t.escrituras.length === 0);
}
{
  const p = puerta({ historial: 'valido' }, (o) => o.cancelId);
  const o = p.m.t.dialogos[0] || {};
  ok('P22-7 sin base de datos local pero con marca histórica: PREGUNTA, y el botón es «Crear una base de datos local vacía»',
    p.m.t.dialogos.length === 1 && btn(o, 'Crear una base de datos local vacía') >= 0 && escape(o) === 'Cerrar' && p.r === 'cerrar', JSON.stringify(o.buttons));
  ok('P22-7b …y al cerrar no se crea nada', !fs.existsSync(p.e.bd) && p.m.t.escrituras.length === 0);
  const p2 = puerta({ historial: 'valido' }, (o) => btn(o, 'Crear una base de datos local vacía'));
  ok('P22-7c con la autorización expresa, queda anotada para A3.3 (y la sesión es local temporal)',
    p2.r === 'seguir' && p2.m.estado().crearLocal === true && p2.m.estado().temporal === true, JSON.stringify(p2.m.estado()));
}
{
  const p = puerta({}, () => { throw new Error('no debería preguntar'); });
  ok('P22-8 primera instalación de verdad (sin base local, sin marca, sin señales): sigue sin preguntar nada',
    p.r === 'seguir' && p.m.t.dialogos.length === 0);
  const p2 = puerta({ bdLocal: 'sqlite', registro: { defecto: 'inicializada' } }, () => { throw new Error('no debería preguntar'); });
  ok('P22-8b equipo LOCAL de toda la vida (su carpeta ya consta en A3.3): tampoco se le pregunta en cada arranque',
    p2.r === 'seguir' && p2.m.t.dialogos.length === 0);
  const p3 = puerta({ bdLocal: 'sqlite' }, (o) => o.cancelId);
  ok('P22-8c …pero si su carpeta NO consta todavía (venía de una versión anterior), se pregunta una vez',
    p3.m.t.dialogos.length === 1 && p3.r === 'cerrar');
}
for (const [caso, tipo] of [['P22-13', 'cero'], ['P22-14', 'texto'], ['P22-14b', 'carpeta']]) {
  const p = puerta({ bdLocal: tipo, historial: 'valido' }, (o) => (o.buttons || []).length - 1);
  const o = p.m.t.dialogos[0] || {};
  ok(`${caso} base local presente pero inutilizable (${tipo}): PS-1023, un solo botón «Cerrar», y se cierra`,
    p.r === 'cerrar' && /PS-1023/.test(String(o.detail)) && JSON.stringify(o.buttons) === '["Cerrar"]', JSON.stringify({ b: o.buttons, r: p.r }));
  ok(`${caso}b …sin abrirla, sin sustituirla y sin crear otra encima (bytes idénticos)`,
    p.hAntes === p.hDespues && p.m.t.escrituras.length === 0 && /NO lo ha abierto, NO lo ha sustituido/.test(String(o.detail)));
}
{
  const e = escenario({ bdLocal: 'sqlite', historial: 'valido' });
  const malo = fsEspia(fs, [], { openSync: (p) => String(p).endsWith('panorama.sqlite3'), codigo: 'EBUSY' });
  const m = construir({ appData: e.appData, userData: e.defecto, defecto: e.defecto, fsImpl: malo });
  m.t.respuesta = (o) => (o.buttons || []).length - 1;
  const r = m.autorizarCarpetaLocal('sin-configuracion');
  ok('P22-15b si no se puede leer la cabecera: PS-1023 y cierre (nunca «no hay base de datos»)',
    r === 'cerrar' && /PS-1023/.test(String((m.t.dialogos[0] || {}).detail)), JSON.stringify(m.t.dialogos[0] && m.t.dialogos[0].buttons));
}
{
  // Los caminos de reserva (PS-1005, PS-1009, PS-1022) no pasan por la puerta
  // del arranque sin configuración: preguntan directamente, con el mismo
  // diálogo. Se comprueba aquí tal cual lo usa el producto.
  const pregunta = (esc, respuesta) => {
    const e = escenario(esc);
    const m = construir({ appData: e.appData, userData: e.defecto, defecto: e.defecto });
    m.set('target', e.compartida);
    m.t.respuesta = respuesta;
    const hAntes = shaF(e.bd);
    const accion = m.preguntarPorLaCarpetaLocal({ codigo: 'PS-1005', titulo: 'No se puede acceder a la carpeta de datos', mensaje: 'x', cuerpo: 'y', etiquetaReintento: 'Reintentar' });
    return { e, m, accion, hAntes, hDespues: shaF(e.bd), o: m.t.dialogos[0] || {} };
  };
  const p = pregunta({ bdLocal: 'sqlite' }, (o) => o.cancelId);
  ok('P22-12 con un camino de reserva SIEMPRE se pregunta, aunque el equipo no tenga marca ni registro',
    p.m.t.dialogos.length === 1 && p.accion === 'cerrar' && escape(p.o) === 'Cerrar', JSON.stringify(p.o.buttons));
  ok('P22-1c …y el escape (Esc/X) deja la base de datos local intacta', p.hAntes === p.hDespues && p.m.t.escrituras.length === 0);
  ok('P22-12a el botón de reintentar sigue estando y es el predeterminado',
    ((p.o && p.o.buttons) || [])[0] === 'Reintentar' && p.o.defaultId === 0, JSON.stringify({ b: p.o.buttons, d: p.o.defaultId }));
  const p2 = pregunta({}, (o) => btn(o, 'Crear una base de datos local vacía'));
  ok('P22-12b y si no hay base de datos local, nunca se inventa una confirmación «sobre» una base que no existe',
    /no hay ninguna base de datos local/i.test(String(p2.o.detail)) && /NO recupera nada/.test(String(p2.o.detail))
    && btn(p2.o, 'Usar estos datos locales') === -1, String(p2.o.detail).slice(0, 120));
  ok('P22-12c elegir esa opción marca la sesión como local temporal y autoriza la creación',
    p2.accion === 'crear' && p2.m.estado().temporal === true && p2.m.estado().crearLocal === true, JSON.stringify(p2.m.estado()));
}

// =============================================================================
seccion('P22-D. LO QUE VIENE DESPUÉS: A3.3 Y LA PROTECCIÓN DE APAGADO (P20)');
// =============================================================================
{
  const e = escenario({ historial: 'valido' });
  const m = construir({ appData: e.appData, userData: e.defecto, defecto: e.defecto });
  const d = m.decidirCrearSiAusente();
  ok('P22-7d A3.3 no autoriza crear una base local en un equipo con marca histórica',
    d.crear === false && d.historicaConocida === true, JSON.stringify(d));
  const m2 = construir({ appData: e.appData, userData: e.defecto, defecto: e.defecto });
  m2.t.respuesta = (o) => btn(o, 'Crear una base de datos local vacía');
  m2.autorizarCarpetaLocal('sin-configuracion');
  const d2 = m2.decidirCrearSiAusente();
  ok('P22-7e …y sí la autoriza cuando el usuario lo ha pedido expresamente',
    d2.crear === true && /autorizó expresamente/.test(d2.motivo), JSON.stringify(d2));
  const e3 = escenario({});
  const m3 = construir({ appData: e3.appData, userData: e3.defecto, defecto: e3.defecto });
  const d3 = m3.decidirCrearSiAusente();
  ok('P22-8d [REGISTRA] la primera ejecución legítima sigue autorizando crear, como siempre',
    d3.crear === true && /primera ejecución/.test(d3.motivo), JSON.stringify(d3));
}
{
  const e = escenario({ bdLocal: 'sqlite', historial: 'valido', guard: true });
  const m = construir({ appData: e.appData, userData: e.defecto, defecto: e.defecto, guardActiva: true });
  m.t.respuesta = (o) => btn(o, 'Usar estos datos locales');
  const hHistAntes = shaF(path.join(e.appData, 'panorama-app-config', 'historial-ubicacion.json'));
  m.autorizarCarpetaLocal('ps1005');
  m.syncDriveSyncGuardWithLocation();
  ok('P22-10 sesión local temporal: la protección de apagado NO se toca (ni activar ni desactivar)',
    m.estado().temporal === true && m.t.guard.length === 0, JSON.stringify(m.t.guard));
  ok('P22-11 …y la marca histórica sobrevive intacta a esa sesión',
    shaF(path.join(e.appData, 'panorama-app-config', 'historial-ubicacion.json')) === hHistAntes);
  const m2 = construir({ appData: e.appData, userData: e.defecto, defecto: e.defecto, guardActiva: true });
  m2.syncDriveSyncGuardWithLocation();
  ok('P22-10b [REGISTRA] fuera de una sesión temporal, la sincronización sigue funcionando como siempre',
    m2.t.guard.length === 1 && /^disable:/.test(m2.t.guard[0]), JSON.stringify(m2.t.guard));
}

// =============================================================================
seccion('P22-E. EL CABLEADO EN EL ARRANQUE Y EN LOS DIÁLOGOS DE RESERVA');
// =============================================================================
const ARR = MAIN.slice(MAIN.indexOf('\napp.whenReady().then('), MAIN.indexOf('\n});\n', MAIN.indexOf('\napp.whenReady().then(')));
ok('P22-E1 la puerta del arranque sin configuración va ANTES de la splash, la protección, el candado, A3.3 y getDb',
  ARR.indexOf("autorizarCarpetaLocal('sin-configuracion')") > 0
  && ARR.indexOf("autorizarCarpetaLocal('sin-configuracion')") < ARR.indexOf('showSplashWindow();')
  && ARR.indexOf('showSplashWindow();') < ARR.indexOf('syncDriveSyncGuardWithLocation();')
  && ARR.indexOf('syncDriveSyncGuardWithLocation();') < ARR.indexOf('const permiso = decidirCrearSiAusente();')
  && ARR.indexOf('const permiso = decidirCrearSiAusente();') < ARR.indexOf('await dbmod.getDb('));
ok('P22-E2 la marca se escribe en cuanto se ve una configuración válida, antes de todo eso',
  /if \(customUserDataDirTarget\) \{\s*registrarUbicacionPersonalizada\(customUserDataDirTarget, customUserDataDirShared\);/.test(ARR)
  && ARR.indexOf('registrarUbicacionPersonalizada(') < ARR.indexOf('showSplashWindow();'));
ok('P22-E3 si cualquiera de los dos caminos devuelve «cerrar», la app se cierra sin seguir',
  /if \(\(await resolveUserDataDirFailureInteractively\(\)\) === 'cerrar'\) \{\s*closeSplashWindow\(\(\) => app\.quit\(\)\);\s*return;/.test(ARR)
  && /if \(\(await checkCustomLocationDatabaseSanity\(\)\) === 'cerrar'\) \{\s*closeSplashWindow\(\(\) => app\.quit\(\)\);\s*return;/.test(ARR));
const PS1005 = cuerpo('async function resolveUserDataDirFailureInteractively()');
ok('P22-E4 PS-1005 ya no tiene el botón «Abrir con datos locales (temporal)» como escape: pasa por la puerta',
  /preguntarPorLaCarpetaLocal\(\{\s*codigo: 'PS-1005'/.test(PS1005) && !/cancelId: 1,/.test(PS1005)
  && !/buttons: \['Reintentar', 'Abrir con datos locales \(temporal\)'\]/.test(PS1005));
const PS1009 = cuerpo('async function checkCustomLocationDatabaseSanity()');
ok('P22-E5 PS-1009 gana «Cerrar» como escape, y «usar los datos locales» pasa por la confirmación',
  /buttons: \['Esperar más \(reintentar\)', 'Sí, empezar aquí desde cero', 'Usar los datos locales de este equipo', 'Cerrar'\],\s*defaultId: 0,\s*cancelId: 3,/.test(PS1009)
  && /preguntarPorLaCarpetaLocal\(\{\s*codigo: 'PS-1021'/.test(PS1009));
ok('P22-5 la base de datos configurada ilegible YA NO cae sola en la local: pregunta con PS-1022 y solo cambia si se elige',
  /ERROR PS-1022/.test(PS1009) && /codigo: 'PS-1022'/.test(PS1009)
  && !/if \(ultimo\.estado === 'no-accesible'\) \{\s*appLog\([^)]*\);\s*app\.setPath\('userData', defaultUserDataDir\);/.test(PS1009)
  && /if \(accion === 'local' \|\| accion === 'crear'\) \{\s*app\.setPath\('userData', defaultUserDataDir\);/.test(PS1009));
ok('P22-E6 «Volver a la carpeta por defecto» anota la decisión antes de borrar location.json',
  /registrarDecisionUbicacion\('volver-a-por-defecto'\);\s*try \{\s*fs\.unlinkSync\(configFile\);/.test(cuerpo('async function resetUserDataLocationToDefault(parentWin)')));
ok('P22-E7 «Cambiar ubicación» deja la marca en cuanto guarda la elección',
  /registrarUbicacionPersonalizada\(target, isShared\);/.test(cuerpo('async function changeUserDataLocation(parentWin)')));
ok('P22-E8 los cuatro códigos nuevos existen en ERROR_CODES con título y explicación',
  ['PS-1021', 'PS-1022', 'PS-1023', 'PS-1024'].every((c) => new RegExp(`  '${c}': \\{\\s*titulo: '[^']{10,}',\\s*explicacion:`).test(MAIN)));
ok('P22-E9 el fallo al persistir la marca no es silencioso: se avisa en el lanzador con PS-1024',
  /if \(historialUbicacionDegradado\) \{\s*modalAlert\(/.test(ARR) && /errorCodeSuffix\('PS-1024'\)/.test(ARR));

// =============================================================================
seccion('P22-Z. ALCANCE');
// =============================================================================
const HASH = (rel) => sha(fs.readFileSync(path.join(PROJ, rel))).toUpperCase();
ok('P22-Z1 solo main.js: db.js, security.js, preload.js, el instalador y el .bat siguen idénticos',
  HASH('db.js') === 'B03C81FF5FC300009DC315E4B20F9BF88DCC6902B18C2EF434B251A022EDD830'
  && HASH('security.js').startsWith('0BF1CAD061B2D9E7') && HASH('preload.js').startsWith('AA77316F3FDB384D')
  && HASH('build/installer.nsh').startsWith('C032D0D7D59208DC') && HASH('claude/Restaurar-backup.bat').startsWith('0E947548DF868DBB'));
// 18 sept 2026 — Z2 COMBINADA. En 9ada9a9 se reescribió para P18 y se perdió la
// comprobación NEGATIVA original (la función heredada no sabe nada de
// procedencia). Las dos propiedades son distintas y complementarias —la
// reversión M1 solo la ve Z2a y la M2 solo Z2b—, y cada una se exige por texto
// Y por conducta, con las funciones REALES (las que liga V8: la última
// declaración) en un sandbox con identidad y registro de procedencia presentes.
const DETECTOR = require('../p18/nombres-modulo.js');
function ambitoRescate() {
  const ultima = new Map();
  for (const d of DETECTOR.declaracionesDeModulo(MAIN)) if (d.tipo === 'function') ultima.set(d.nombre, d);
  const texto = (x) => DETECTOR.textoDeclaracion(MAIN, ultima.get(x).pos);
  const cierre = new Set(['handleFatalStartupError', 'findLatestAsarBackupForRecovery']);
  for (let c = true; c;) {
    c = false;
    for (const x of [...cierre]) for (const m of texto(x).matchAll(/([\p{L}_$][\p{L}\p{N}_$]*)\s*\(/gu)) if (ultima.has(m[1]) && !cierre.has(m[1])) { cierre.add(m[1]); c = true; }
  }
  return { fuente: [...cierre].map(texto).join('\n') + '\nlet startupRecoveryArmed = true;', nombres: [...cierre] };
}
function mundoZ2(conOperacion) {
  const raiz = path.join(SB, 'z2-' + (++n));
  const w = { appData: path.join(raiz, 'Roaming'), datos: path.join(raiz, 'Roaming', 'panorama-app'), local: path.join(raiz, 'Local'), res: path.join(raiz, 'resources') };
  w.cfg = path.join(w.appData, 'panorama-app-config');
  w.rec = path.join(w.local, 'panorama-app-recovery');
  [w.cfg, w.datos, w.res].forEach((d) => fs.mkdirSync(d, { recursive: true }));
  const INST = Buffer.from('ASAR INSTALADO 2.0.55');
  const PRED = Buffer.from('PREDECESORA VERIFICADA 2.0.54');
  fs.writeFileSync(path.join(w.res, 'app.asar'), INST);
  // Heredadas sin procedencia; la de nombre más alto es de OTRO equipo y más nueva.
  fs.writeFileSync(path.join(w.datos, 'app.asar.bak-2026-08-26T19-19-35-247Z'), 'HEREDADA 0.1.28');
  fs.writeFileSync(path.join(w.datos, 'app.asar.bak-2026-09-30T08-00-00-000Z'), 'HEREDADA 9.9.9 (otro equipo)');
  const IDZ = 'a1'.repeat(16);
  fs.writeFileSync(path.join(w.cfg, 'installation-id'), IDZ);
  const ops = [];
  if (conOperacion) {
    const op = 'c'.repeat(16);
    fs.mkdirSync(w.rec, { recursive: true });
    fs.writeFileSync(path.join(w.rec, 'app.asar.pred-' + op), PRED);
    ops.push({ operation_id: op, installation_id: IDZ, estado: 'verificada', sha256_anterior: sha(PRED), version_anterior: '2.0.54',
      nombre_copia: 'app.asar.pred-' + op, sha256_copia_local: sha(PRED), sha256_nuevo_esperado: sha(INST), version_nueva_esperada: '2.0.55',
      sha256_nuevo_real: sha(INST), creada_at: '2026-09-18T10:00:00.000Z', verificada_at: '2026-09-18T10:00:05.000Z', motivo_fallo: null });
  }
  fs.writeFileSync(path.join(w.cfg, 'asar-procedencia.json'), JSON.stringify({ v: 1, installation_id: IDZ, operaciones: ops }));
  return w;
}
function construirZ2(w) {
  const z = { lecturas: [], escrituras: [], cajas: [] };
  const sbL = path.resolve(SB).toLowerCase();
  const espia = new Proxy(fs, { get(t, k) {
    const v = t[k];
    if (typeof v !== 'function') return v;
    return (...a) => {
      if (['readFileSync', 'statSync', 'existsSync', 'readdirSync'].includes(k) || (k === 'openSync' && (a[1] === undefined || a[1] === 'r'))) {
        z.lecturas.push(`${k} ${path.basename(String(a[0]))}`);
      } else if (ESCRITURAS.includes(k)) {
        const d = k === 'copyFileSync' || k === 'renameSync' ? a[1] : a[0];
        if (!path.resolve(String(d)).toLowerCase().startsWith(sbL)) throw new Error('P22-Z2: escritura FUERA del sandbox: ' + d);
        z.escrituras.push(`${k} ${path.basename(String(d))}`);
      }
      return v.apply(t, a);
    };
  } });
  const A = ambitoRescate();
  z.m = new Function('app', 'fs', 'originalFs', 'path', 'crypto', 'dialog', 'process', A.fuente + '\nreturn { ' + A.nombres.join(', ') + ' };')(
    { getPath: (k) => (k === 'appData' ? w.appData : k === 'userData' ? w.datos : os.tmpdir()), exit() {} },
    espia, espia, path, crypto, { showErrorBox: (tt, c) => z.cajas.push(c), showMessageBoxSync: (o) => o.cancelId },
    { platform: 'win32', pid: process.pid, env: { LOCALAPPDATA: w.local }, resourcesPath: w.res });
  return z;
}
{
  const wH = mundoZ2(true);
  const z = construirZ2(wH);
  const cuerpoH = cuerpo('function findLatestAsarBackupForRecovery(dir)');
  z.lecturas.length = 0;
  let elegida;
  try { elegida = z.m.findLatestAsarBackupForRecovery(wH.datos); } catch (e) { elegida = 'LANZA: ' + e.message; }
  ok('P22-Z2a la función heredada sigue siendo SOLO «por nombre»: ni procedencia, ni registro, ni promoción (texto y conducta: con registro presente solo lista su carpeta)',
    /\.filter\(\(f\) => f\.startsWith\('app\.asar\.bak-'\)\)\s*\.sort\(\)\s*\.reverse\(\)/.test(cuerpoH) && !/manifiesto|procedencia|installation/i.test(cuerpoH)
    && elegida === 'app.asar.bak-2026-09-30T08-00-00-000Z' && z.lecturas.length === 1 && /^readdirSync /.test(z.lecturas[0]) && z.escrituras.length === 0,
    JSON.stringify({ elegida, lecturas: z.lecturas, escrituras: z.escrituras }));
}
{
  const cuerpoR = cuerpo('function handleFatalStartupError(err)');
  const wSin = mundoZ2(false);
  const zSin = construirZ2(wSin);
  try { zSin.m.handleFatalStartupError(new Error('P22-Z2 arranque roto (sandbox)')); } catch (e) { /* se mide abajo */ }
  const sinProcedencia = fs.readFileSync(path.join(wSin.res, 'app.asar'), 'utf8');
  const wCon = mundoZ2(true);
  const zCon = construirZ2(wCon);
  try { zCon.m.handleFatalStartupError(new Error('P22-Z2 arranque roto (sandbox)')); } catch (e) { /* se mide abajo */ }
  const conProcedencia = fs.readFileSync(path.join(wCon.res, 'app.asar'), 'utf8');
  ok('P22-Z2b el rescate automático NO decide con la función heredada: sin procedencia no restaura nada; con ella, la copia P18 y nunca la heredada (texto y conducta)',
    !/findLatestAsarBackupForRecovery\(/.test(cuerpoR) && /analizarRecuperacionAsar\(realAsar\)/.test(cuerpoR)
    && sinProcedencia === 'ASAR INSTALADO 2.0.55' && conProcedencia === 'PREDECESORA VERIFICADA 2.0.54',
    JSON.stringify({ sinProcedencia, conProcedencia }));
}
ok('P22-Z3 la batería no ha escrito fuera de su sandbox', guardia.REAL !== null && !guardia.dentroDe(SB, path.join(process.env.APPDATA || '', 'panorama-app')));
nota('P22-4 (PS-1009 con base local) y los Esc/X de verdad se miden en la app real: electron-p22.ps1.');

console.log('\n======================================================================');
console.log(`  P22: ${pass} OK / ${fail} FALLOS`);
console.log('======================================================================');
if (fail) { console.log('  Fallos:'); fallos.forEach((x) => console.log('   · ' + x)); process.exit(1); }
console.log('  Batería EXIGENTE: la carpeta local no se abre ni se crea sin decirlo.');
