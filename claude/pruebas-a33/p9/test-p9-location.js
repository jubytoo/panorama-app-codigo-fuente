'use strict';
// ---------------------------------------------------------------------------
// P9 — `location.json` presente pero ilegible/inválido NUNCA equivale a
// «no hay configuración». Batería EXIGENTE (17 sept 2026, tras implementar).
//
// Nació DESCRIPTIVA (137 OK / 0, mismo día): demostraba que cualquier archivo
// que no se pudiera interpretar mandaba a la carpeta por defecto en silencio.
// Las aserciones que fijaban ese defecto como «lo que hace hoy» quedan
// INVERTIDAS; lo que sigue igual a propósito (JSON válido + ruta inaccesible,
// el .bat, el instalador) se REGISTRA con la etiqueta [REGISTRA].
//
// Aquí se ejecutan las funciones REALES de main.js (extraídas por firma)
// contra archivos REALES en un sandbox: el lector, el arranque a nivel de
// módulo, la decisión de A3.3, el rescate PS-1007, la sincronización de la
// protección de apagado y la parada de whenReady. La app entera, en
// `real-run/p9-ubicacion.js` + `electron-p9.ps1`.
//
// Mapa con la petición: P9-1..P9-14 son los casos mínimos pedidos; cada
// aserción lleva delante el número del caso que cubre.
//
// Nada fuera del sandbox se escribe. La carpeta de configuración real y la
// BD viva solo se leen/hashean (guardián común, exit 98 si la BD cambia).
// Variables: PANORAMA_MAIN (main.js alternativo: reversiones).
// ---------------------------------------------------------------------------
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { crearGuardia } = require('../comun/guardia-rutas');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const MAIN = fs.readFileSync(process.env.PANORAMA_MAIN || path.join(PROJ, 'main.js'), 'utf8');
const DOC = (n) => fs.readFileSync(path.join(PROJ, 'claude', n), 'utf8');

// Con ELECTRON_RUN_AS_NODE, `fs` trata cualquier «app.asar» como un archivo
// EMPAQUETADO (y revienta con uno de mentira). El producto usa 'original-fs'
// para eso; la batería también (primera pasada: la sección F se caía ahí).
const ofs = (() => { try { return require('original-fs'); } catch (e) { return fs; } })();

const guardia = crearGuardia({ marca: '_a33-p9' });
const SB = guardia.segura(path.join(os.tmpdir(), '_a33-p9-node'));
ofs.rmSync(SB, { recursive: true, force: true });
fs.mkdirSync(SB, { recursive: true });
process.on('exit', () => { try { ofs.rmSync(SB, { recursive: true, force: true }); } catch (e) {} });

let pass = 0, fail = 0; const fallos = [];
function ok(n, c, extra) {
  if (c) { pass++; console.log('  OK    ' + n); }
  else { fail++; fallos.push(n); console.log('  FALLO ' + n + (extra === undefined ? '' : '  -- ' + extra)); }
}
function seccion(t) { console.log('\n=== ' + t + ' ==='); }
function nota(s) { console.log('        ' + s); }
const soloCodigo = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

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
const lineaConst = (nombre) => {
  const m = MAIN.match(new RegExp('^const ' + nombre + ' = [^\\n]*$', 'm'));
  if (!m) throw new Error('NO SE ENCONTRO const ' + nombre);
  return m[0];
};
const bloqueConst = (nombre) => {
  const i = MAIN.indexOf('const ' + nombre + ' = [');
  if (i < 0) throw new Error('NO SE ENCONTRO const ' + nombre);
  return MAIN.slice(i, MAIN.indexOf('];', i) + 2);
};
const cuerpoDe = (firma) => { try { return extraerDe(MAIN, firma); } catch (e) { return ''; } };

// =============================================================================
seccion('P9-O. EL HALLAZGO ORIGINAL Y SU ESTADO');
// =============================================================================
const PEND = DOC('pendientes-abiertos.md');
const HAND = DOC('handoff-opus-estado-actual.md');
ok('P9-O1 texto original conservado en pendientes: «location.json con BOM se ignora en silencio» y su mecanismo',
  /\| P9 \| \*\*`location\.json` con BOM se ignora en silencio\*\* \| Descubierto probando A3\.1: si el archivo se guarda con BOM \(p\. ej\. desde el Bloc de notas\), `JSON\.parse` falla, se traga la excepción y la app cae a la carpeta de datos local sin avisar/.test(PEND));
ok('P9-O2 el estado original se conserva como historia (PENDIENTE en producción, corregido solo en los arneses)',
  /\*\*PENDIENTE en producción\.\*\* Corregido solo en los arneses: `comun\/guardia-rutas\.js` es fail-closed y `GUARD-LOC-2` lo cubre\./.test(PEND));
ok('P9-O3 resumen y handoff: CERRADO, reclasificado ALTO / INTEGRIDAD',
  /\| P9 \| \*\*CERRADO\*\* \*\(17 sept 2026\)\* · \*\*ALTO \/ INTEGRIDAD\*\*/.test(PEND)
  && /\| \*\*P9\*\* — `location\.json` ilegible \(BOM y otros\) \| \*\*CERRADO\*\* \(17 sept 2026\) · \*\*ALTO \/ INTEGRIDAD\*\*/.test(HAND));
ok('P9-O4 el diagnóstico se conserva y hay sección de implementación',
  /## P9 — DIAGNÓSTICO \(17 sept 2026\)/.test(PEND) && /## P9 — IMPLEMENTACIÓN Y CIERRE \(17 sept 2026\)/.test(PEND));

// =============================================================================
seccion('P9-A. UN SOLO LECTOR; QUIÉN ESCRIBE Y QUIÉN BORRA location.json');
// =============================================================================
const C = soloCodigo(MAIN);
const LECTOR = cuerpoDe('function leerConfigUbicacion()');
ok('P9-A1 main.js tiene UN solo lector (leerConfigUbicacion) y los tres antiguos ya no existen',
  !!LECTOR && !/function readConfiguredUserDataTarget\(/.test(MAIN) && !/function readConfiguredUserDataShared\(/.test(MAIN));
ok('P9-A1b ninguna otra lectura de location.json: ni JSON.parse(readFileSync(configFile)) ni otro readFileSync(userDataConfigPath())',
  !/JSON\.parse\(fs\.readFileSync\(configFile/.test(C) && (C.match(/readFileSync\(userDataConfigPath\(\)/g) || []).length === 1
  && /readFileSync\(userDataConfigPath\(\)\)/.test(LECTOR));
ok('P9-A2 el arranque y el rescate PS-1007 usan ese mismo lector',
  /const cfg = leerConfigUbicacion\(\);/.test(cuerpoDe('function applyCustomUserDataDirIfConfigured()'))
  && /const cfg = leerConfigUbicacion\(\);/.test(cuerpoDe('function resolveDataDirForStartupRecovery()')));
ok('P9-A3 el lector lee BYTES (sin \'utf8\') y decodifica con TextDecoder fatal y SIN quitar BOM por su cuenta (ignoreBOM)',
  /bytes = fs\.readFileSync\(userDataConfigPath\(\)\);/.test(LECTOR)
  && /new TextDecoder\(codificacion, \{ fatal: true, ignoreBOM: true \}\)/.test(LECTOR));
ok('P9-A4 estados explícitos: ausente / valido / ilegible / invalido, y SOLO ENOENT es «ausente»',
  (LECTOR.match(/estado: 'ausente'/g) || []).length === 1 && /if \(e && e\.code === 'ENOENT'\) return \{ estado: 'ausente' \};/.test(LECTOR)
  && /estado: 'valido'/.test(LECTOR) && /estado: 'ilegible'/.test(LECTOR) && /estado: 'invalido'/.test(LECTOR));
ok('P9-A5 el lector es AUTOCONTENIDO: no usa constantes de módulo (el rescate lo llama antes de que existan)',
  !/\b(?!JSON\b)[A-Z][A-Z0-9_]{3,}\b/.test(soloCodigo(LECTOR).replace(/'[^']*'/g, "''")) && /^function leerConfigUbicacion\(\)/m.test(MAIN));
ok('P9-A6 la app ESCRIBE location.json en un solo sitio (changeUserDataLocation), UTF-8 sin BOM, con JSON.stringify [sin cambios]',
  (C.match(/writeFileSync\(userDataConfigPath\(\)/g) || []).length === 1
  && /fs\.writeFileSync\(userDataConfigPath\(\), JSON\.stringify\(\{ userDataDir: target, shared: isShared \}, null, 2\), 'utf8'\);/.test(MAIN));
ok('P9-A7 y lo BORRA en uno (resetUserDataLocationToDefault) [sin cambios]', /fs\.unlinkSync\(configFile\);/.test(cuerpoDe('async function resetUserDataLocationToDefault(parentWin)')));
const NSH = fs.readFileSync(path.join(PROJ, 'build', 'installer.nsh'), 'utf8');
ok('P9-A8 [REGISTRA] el INSTALADOR lo escribe igual que antes (NSIS FileWrite, CRLF, barras «/», "shared": true): fuera de P9',
  /FileOpen \$9 "\$APPDATA\\panorama-app-config\\location\.json" w/.test(NSH)
  && /FileWrite \$9 '\{\$\\r\$\\n  "userDataDir": "\$StorageCloudPathValue",\$\\r\$\\n  "shared": true\$\\r\$\\n\}\$\\r\$\\n'/.test(NSH)
  && /\$\{StrRep\} \$StorageCloudPathValue \$StorageCloudPathValue "\\" "\/"/.test(NSH));
nota('RAZONADO (documentación de NSIS, no medido): FileWrite escribe ANSI. Una ruta con ñ/tildes escrita así');
nota('YA NO abre otra BD: el lector la declara «ilegible» y el arranque se detiene (PS-1020). Pendiente separado.');
const BAT = fs.readFileSync(path.join(PROJ, 'claude', 'Restaurar-backup.bat'), 'utf8');
ok('P9-A10 [REGISTRA] Restaurar-backup.bat sigue con su lector propio (findstr): fuera de P9, pendiente separado',
  /findstr "userDataDir" "%CONFIG_FILE%"/.test(BAT) && /set "DATA_DIR=%DEFAULT_DIR%"/.test(BAT));
ok('P9-A11 el registro de ubicaciones de A3.3 vive en la MISMA carpeta de config [sin cambios]',
  /path\.join\(app\.getPath\('appData'\), 'panorama-app-config', 'ubicaciones-inicializadas\.json'\)/.test(MAIN));

// =============================================================================
seccion('P9-B. LO QUE HACEN Node / JSON.parse / TextDecoder CON LOS BYTES (medido)');
// =============================================================================
nota('Node ' + process.version + ' (Electron 30.5.1 trae 20.16.0 con ICU completo: utf-16be disponible)');
const BOM = Buffer.from([0xEF, 0xBB, 0xBF]);
const lanza = (t) => { try { JSON.parse(t); return 'ok'; } catch (e) { return e.name; } };
ok("P9-B1 readFileSync(...,'utf8') CONSERVA el BOM como U+FEFF (por eso el lector lee bytes)",
  Buffer.concat([BOM, Buffer.from('{}')]).toString('utf8').charCodeAt(0) === 0xFEFF);
ok('P9-B2 JSON.parse con U+FEFF delante LANZA SyntaxError', lanza('\uFEFF{}') === 'SyntaxError');
ok('P9-B3 JSON.parse admite espacios ASCII delante y detrás, pero no U+00A0 ni U+FEFF',
  lanza(' \t\r\n{"a":1}\r\n ') === 'ok' && lanza('\u00A0{}') === 'SyntaxError' && lanza(' \uFEFF{}') === 'SyntaxError');
ok('P9-B4 TextDecoder con ignoreBOM NO quita el BOM (el lector decide cuál se quita)',
  new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(Buffer.concat([BOM, Buffer.from('{}')])) === '\uFEFF{}');
ok('P9-B5 TextDecoder fatal LANZA con bytes que no son UTF-8 (cp1252 «ñ») y con UTF-16 impar o con suplente suelto',
  ['utf-8:e9', 'utf-16le:410042', 'utf-16le:00dc4100'].every((x) => {
    const [cod, hex] = x.split(':');
    try { new TextDecoder(cod, { fatal: true, ignoreBOM: true }).decode(Buffer.from(hex, 'hex')); return false; } catch (e) { return true; }
  }));
const cp1252 = Buffer.from('{"userDataDir":"C:/Datos/A\xf1o P\xfablico"}', 'latin1').toString('utf8');
ok('P9-B6 una ruta ANSI leída con readFileSync(utf8) PARSEA con U+FFFD (el defecto que el lector ya no admite)',
  lanza(cp1252) === 'ok' && /\uFFFD/.test(JSON.parse(cp1252).userDataDir));

// =============================================================================
// Ámbito REAL de main.js con dobles.
// =============================================================================
const FUENTE_BASE = [
  lineaConst('USERDATA_PRE_READY_RETRY_MS'),
  lineaConst('USERDATA_PRE_READY_RETRY_INTERVAL_MS'),
  bloqueConst('INDICIOS_DE_NUBE'),
  'let customUserDataDirFailure = null;',
  'let customUserDataDirTarget = null;',
  'let customUserDataDirShared = true;',
  'let configUbicacionNoResuelta = null;',
  'let usuarioAutorizaEmpezarDesdeCero = false;',
  'let startupRecoveryArmed = true;',
  // P22: decidirCrearSiAusente consulta estas dos cosas. Se traen las funciones
  // REALES (no dobles) para que la decisión siga siendo la del producto.
  'let usuarioAutorizaCrearLocal = false;',
  'let historialUbicacionDegradado = null;',
  // P22: la protección de apagado consulta esto. Aquí siempre false = sesión
  // normal, que es justo lo que medía P9; el caso temporal lo cubre `p22/`.
  'let sesionLocalTemporal = false;',
  ...['function rutaHistorialUbicacion()', 'function claveHashUbicacion(dir)', 'function leerHistorialUbicacion()',
    'function huboUbicacionPersonalizada()'].map((f) => extraerDe(MAIN, f)),
  ...['function userDataConfigPath()', 'function leerConfigUbicacion()',
    'function probeWritableDir(dir)', 'function applyCustomUserDataDirIfConfigured()', 'function isUsingCustomDataLocationNow()',
    'function isUsingSharedDataLocationNow()', 'function rutaRegistroUbicaciones()', 'function claveUbicacion(dir)',
    'function leerRegistroUbicaciones()', 'function estadoUbicacion(dir)', 'function rutaConIndiciosDeNube(ruta)',
    'function clasificarPoliticaUbicacion()', 'function decidirCrearSiAusente()', 'function estadoDeArchivoEnRuta(p)',
    'function resolveDataDirForStartupRecovery()', 'function findLatestAsarBackupForRecovery(dir)',
    'function handleFatalStartupError(err)', 'function syncDriveSyncGuardWithLocation()',
    'function detenerArranquePorConfigUbicacion()'].map((f) => extraerDe(MAIN, f)),
].join('\n');

// Espía de fs: cuenta toda operación que ESCRIBE (y deja que ocurra: todo es sandbox).
const OPS_ESCRITURA = ['mkdirSync', 'writeFileSync', 'appendFileSync', 'renameSync', 'copyFileSync', 'unlinkSync', 'rmSync', 'rmdirSync', 'openSync'];
function fsEspia(base, escrituras) {
  return new Proxy(base, {
    get(t, k) {
      const v = t[k];
      if (OPS_ESCRITURA.includes(k) && typeof v === 'function') {
        return (...a) => {
          if (!(k === 'openSync' && (a[1] === undefined || a[1] === 'r'))) escrituras.push(`${k} ${a[0]}`);
          return v.apply(t, a);
        };
      }
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
}

// Electron: app.setPath LANZA con ruta relativa o vacía (medido en 30.5.1:
// «Path must be absolute») y NO con una absoluta aunque no exista.
function construir({ appData, userData, fsImpl, recursos, guard }) {
  const traza = { setPath: [], logs: [], sleeps: 0, userData, escrituras: [], dialogos: [], errorBox: [], exit: [], quit: 0, guard: [] };
  const reloj = { t: 1e12 };
  const app = {
    getPath(k) {
      if (k === 'appData') return appData;
      if (k === 'userData') return traza.userData;
      if (k === 'temp') return os.tmpdir();
      throw new Error('getPath(' + k + ') no previsto');
    },
    setPath(k, v) {
      traza.setPath.push([k, v]);
      if (!path.isAbsolute(String(v))) throw new Error('Path must be absolute');
      traza.userData = v;
    },
    exit(c) { traza.exit.push(c); },
    quit() { traza.quit++; },
  };
  class FakeDate extends Date {}
  FakeDate.now = () => reloj.t;
  const sleepSyncMs = (ms) => { reloj.t += ms; traza.sleeps++; };
  const dbmod = { intencionDeCreacionPara: () => ({ vigente: null }), getInstallationId: () => 'p9' };
  const dialog = {
    showMessageBoxSync(a, b) { traza.dialogos.push(b || a); return 0; },
    showErrorBox(t, c) { traza.errorBox.push({ t, c }); },
  };
  const fakeProcess = { pid: process.pid, platform: 'win32', resourcesPath: recursos || path.join(SB, 'sin-recursos'), env: process.env };
  const g = Object.assign({ activa: false, viva: true }, guard || {});
  const fsUsado = fsEspia(fsImpl || fs, traza.escrituras);
  const ofsUsado = fsEspia(ofs, traza.escrituras);
  const f = new Function('app', 'fs', 'path', 'originalFs', 'dbmod', 'appLog', 'sleepSyncMs', 'Date', 'crypto',
    'dialog', 'process', 'errorCodeSuffix', 'isDriveSyncGuardEnabled', 'isDriveSyncGuardActuallyAlive', // ← también lo usa huboUbicacionPersonalizada (P22)
    'enableDriveSyncGuardSilently', 'disableDriveSyncGuardSilently',
    // En main.js es `const defaultUserDataDir = app.getPath('userData')` ANTES de
    // cualquier setPath: aquí, el userData inicial del caso (P22).
    'defaultUserDataDir',
    FUENTE_BASE + '\nreturn { leerConfigUbicacion, applyCustomUserDataDirIfConfigured,'
    + ' resolveDataDirForStartupRecovery, clasificarPoliticaUbicacion, decidirCrearSiAusente, probeWritableDir,'
    + ' handleFatalStartupError, syncDriveSyncGuardWithLocation, detenerArranquePorConfigUbicacion,'
    + ' estado: () => ({ fallo: customUserDataDirFailure, destino: customUserDataDirTarget, compartida: customUserDataDirShared, noResuelta: configUbicacionNoResuelta }) };');
  const api = f(app, fsUsado, path, ofsUsado, dbmod, (s) => traza.logs.push(String(s)), sleepSyncMs, FakeDate, crypto,
    dialog, fakeProcess, (c) => { traza.logs.push(`ERROR ${c} — (doble)`); return `\n\n(código ${c})`; },
    () => g.activa, () => g.viva,
    (r) => traza.guard.push('enable: ' + r), (r) => traza.guard.push('disable: ' + r),
    userData);
  return Object.assign(api, { traza });
}

const RAIZ_C = path.join(SB, 'c');
const APPDATA_C = path.join(RAIZ_C, 'Roaming');
const DEFECTO_C = path.join(APPDATA_C, 'panorama-app');
const CUSTOM_C = path.join(RAIZ_C, 'G', 'Datos', 'BD-P9');
fs.mkdirSync(path.join(APPDATA_C, 'panorama-app-config'), { recursive: true });
fs.mkdirSync(DEFECTO_C, { recursive: true });
fs.mkdirSync(CUSTOM_C, { recursive: true });
const LOC = path.join(APPDATA_C, 'panorama-app-config', 'location.json');
const G = CUSTOM_C.replace(/\\/g, '/');
const u8 = (s) => Buffer.from(s, 'utf8');
const u16le = (s) => Buffer.concat([Buffer.from([0xFF, 0xFE]), Buffer.from(s, 'utf16le')]);
const u16be = (s) => Buffer.concat([Buffer.from([0xFE, 0xFF]), Buffer.from(s, 'utf16le').swap16()]);
const instalador = (ruta) => `{\r\n  "userDataDir": "${ruta}",\r\n  "shared": true\r\n}\r\n`;
const conApp = (ruta, shared) => JSON.stringify({ userDataDir: ruta, shared }, null, 2);
const escribirLoc = (bytes) => { try { fs.rmSync(LOC, { force: true, recursive: true }); } catch (e) {} if (bytes) fs.writeFileSync(LOC, bytes); };
const leer = (bytes, extra) => { escribirLoc(bytes); return construir(Object.assign({ appData: APPDATA_C, userData: DEFECTO_C }, extra || {})).leerConfigUbicacion(); };

// =============================================================================
seccion('P9-C. EL LECTOR, CONTRA CADA VARIANTE DEL ARCHIVO');
// =============================================================================
const RUTA_NA = `${G}/A\u00f1o P\u00fablico`;
const VALIDOS = [
  // [caso, id, bytes, ruta esperada, shared esperado]
  ['P9-1', 'instalador (formato real de esta máquina)', u8(instalador(G)), G, true],
  ['P9-1', 'app (JSON.stringify, contrabarras)', u8(conApp(CUSTOM_C, true)), CUSTOM_C, true],
  ['P9-1', 'app con shared:false', u8(conApp(CUSTOM_C, false)), CUSTOM_C, false],
  ['P9-1', 'compacto sin shared (anterior a la 0.1.57 → compartida)', u8(`{"userDataDir":"${G}"}`), G, true],
  ['P9-1', 'espacios ASCII alrededor del JSON', u8(`\r\n  \t{"userDataDir":"${G}"}  \r\n`), G, true],
  ['P9-1', 'claves de más (se ignoran)', u8(`{"userDataDir":"${G}","shared":true,"otra":1}`), G, true],
  ['P9-1', 'ruta con ñ y tildes en UTF-8', u8(instalador(RUTA_NA)), RUTA_NA, true],
  ['P9-1', 'UNC con contrabarras', u8(JSON.stringify({ userDataDir: '\\\\servidor\\recurso\\BD' })), '\\\\servidor\\recurso\\BD', true],
  ['P9-1', 'UNC con barras', u8('{"userDataDir":"//servidor/recurso/BD"}'), '//servidor/recurso/BD', true],
  ['P9-1', 'unidad no montada (Q:) — válida para el lector', u8('{"userDataDir":"Q:/no-montada/BD"}'), 'Q:/no-montada/BD', true],
  ['P9-2', 'UTF-8 + BOM, formato del instalador', Buffer.concat([BOM, u8(instalador(G))]), G, true],
  ['P9-2', 'UTF-8 + BOM, formato de la app', Buffer.concat([BOM, u8(conApp(CUSTOM_C, false))]), CUSTOM_C, false],
  ['P9-2', 'UTF-8 + BOM, compacto', Buffer.concat([BOM, u8(`{"userDataDir":"${G}","shared":true}`)]), G, true],
  ['P9-2', 'UTF-8 + BOM + espacios + JSON (el BOM está en su sitio)', Buffer.concat([BOM, u8('  \r\n'), u8(instalador(G))]), G, true],
  ['P9-2', 'UTF-8 + BOM, ruta con ñ y tildes', Buffer.concat([BOM, u8(instalador(RUTA_NA))]), RUTA_NA, true],
  ['P9-3', 'UTF-16 LE + BOM (Bloc de notas «Unicode»)', u16le(instalador(G)), G, true],
  ['P9-3', 'UTF-16 BE + BOM', u16be(instalador(G)), G, true],
  ['P9-3', 'UTF-16 LE + BOM, ruta con ñ y tildes', u16le(instalador(RUTA_NA)), RUTA_NA, true],
  ['P9-3', 'UTF-16 BE + BOM, formato de la app con shared:false', u16be(conApp(CUSTOM_C, false)), CUSTOM_C, false],
];
const resultados = {};
for (const [caso, id, bytes, ruta, shared] of VALIDOS) {
  let r; try { r = leer(bytes); } catch (e) { r = { lanza: e.message }; }
  resultados[id] = r;
  ok(`${caso} ${id}: VÁLIDO con la ruta EXACTA y shared=${shared}`,
    r.estado === 'valido' && r.userDataDir === ruta && r.shared === shared, JSON.stringify(r));
}
ok('P9-2 con y sin BOM el resultado es IDÉNTICO (instalador)',
  JSON.stringify(resultados['UTF-8 + BOM, formato del instalador']) === JSON.stringify(resultados['instalador (formato real de esta máquina)']));
ok('P9-3 UTF-16 LE y BE dan EXACTAMENTE lo mismo que UTF-8',
  JSON.stringify(resultados['UTF-16 LE + BOM (Bloc de notas «Unicode»)']) === JSON.stringify(resultados['instalador (formato real de esta máquina)'])
  && JSON.stringify(resultados['UTF-16 BE + BOM']) === JSON.stringify(resultados['instalador (formato real de esta máquina)']));

const INVALIDOS = [
  // [caso, id, bytes, estado esperado]
  ['P9-4', 'BOM duplicado', Buffer.concat([BOM, BOM, u8(instalador(G))]), 'invalido'],
  ['P9-4', 'BOM + espacios + BOM', Buffer.concat([BOM, u8('  '), BOM, u8(instalador(G))]), 'invalido'],
  ['P9-4', 'BOM fuera de sitio (espacios + BOM + JSON)', Buffer.concat([u8('  '), BOM, u8(instalador(G))]), 'invalido'],
  ['P9-4', 'BOM al final', Buffer.concat([u8(instalador(G)), BOM]), 'invalido'],
  ['P9-4', 'BOM dentro de la ruta', u8(`{"userDataDir":"\uFEFF${G}"}`), 'invalido'],
  ['P9-4', 'BOM UTF-16 + otro BOM codificado', u16le('\uFEFF' + instalador(G)), 'invalido'],
  ['P9-4', 'BOM UTF-8 delante de un texto UTF-16 con su BOM', Buffer.concat([BOM, u16le(instalador(G))]), 'ilegible'],
  ['P9-5', 'vacío (0 bytes)', Buffer.alloc(0), 'invalido'],
  ['P9-5', 'solo el BOM', BOM, 'invalido'],
  ['P9-5', '«{» suelto', u8('{'), 'invalido'],
  ['P9-5', 'JSON truncado', u8(`{"userDataDir":"${G.slice(0, 12)}`), 'invalido'],
  ['P9-5', 'JSON truncado con BOM', Buffer.concat([BOM, u8(`{"userDataDir":"${G}"`)]), 'invalido'],
  ['P9-5', 'basura detrás de un JSON válido', u8(`{"userDataDir":"${G}"} x`), 'invalido'],
  ['P9-5', 'JSON con comentario', u8(`// datos\n{"userDataDir":"${G}"}`), 'invalido'],
  ['P9-5', 'escape JSON inválido (contrabarra sin doblar)', u8('{"userDataDir":"C:\\Datos\\BD"}'), 'invalido'],
  ['P9-6', 'null', u8('null'), 'invalido'],
  ['P9-6', '{}', u8('{}'), 'invalido'],
  ['P9-6', '[]', u8('[]'), 'invalido'],
  ['P9-6', 'array con la configuración dentro', u8(`[{"userDataDir":"${G}"}]`), 'invalido'],
  ['P9-6', 'una cadena JSON', u8(JSON.stringify(G)), 'invalido'],
  ['P9-6', 'un número', u8('42'), 'invalido'],
  ['P9-6', 'true', u8('true'), 'invalido'],
  ['P9-6', 'userDataDir numérico', u8('{"userDataDir":42}'), 'invalido'],
  ['P9-6', 'userDataDir null', u8('{"userDataDir":null}'), 'invalido'],
  ['P9-6', 'userDataDir booleano', u8('{"userDataDir":true}'), 'invalido'],
  ['P9-6', 'userDataDir array', u8(`{"userDataDir":["${G}"]}`), 'invalido'],
  ['P9-6', 'userDataDir objeto', u8(`{"userDataDir":{"ruta":"${G}"}}`), 'invalido'],
  ['P9-6', 'clave equivocada (dir)', u8(`{"dir":"${G}"}`), 'invalido'],
  ['P9-6', 'clave con otra capitalización (UserDataDir)', u8(`{"UserDataDir":"${G}"}`), 'invalido'],
  ['P9-6', 'userDataDir solo heredado del prototipo', u8(`{"__proto__":{"userDataDir":"${G}"}}`), 'invalido'],
  ['P9-6', 'shared como cadena "false"', u8(`{"userDataDir":"${G}","shared":"false"}`), 'invalido'],
  ['P9-6', 'shared null', u8(`{"userDataDir":"${G}","shared":null}`), 'invalido'],
  ['P9-6', 'shared numérico', u8(`{"userDataDir":"${G}","shared":1}`), 'invalido'],
  ['P9-7', 'userDataDir vacío', u8('{"userDataDir":""}'), 'invalido'],
  ['P9-7', 'userDataDir solo espacios', u8('{"userDataDir":"   "}'), 'invalido'],
  ['P9-7', 'userDataDir con tabulador y saltos', u8('{"userDataDir":"\\t\\r\\n"}'), 'invalido'],
  ['P9-7', 'userDataDir con espacios alrededor (ya no se recorta)', u8(`{"userDataDir":"   ${G}   "}`), 'invalido'],
  ['P9-8', 'ruta relativa «datos/relativa»', u8('{"userDataDir":"datos/relativa"}'), 'invalido'],
  ['P9-8', 'ruta relativa «./datos»', u8('{"userDataDir":"./datos"}'), 'invalido'],
  ['P9-8', 'ruta relativa «..\\datos»', u8('{"userDataDir":"..\\\\datos"}'), 'invalido'],
  ['P9-8', 'ruta relativa a la raíz de la unidad actual «\\datos»', u8('{"userDataDir":"\\\\datos"}'), 'invalido'],
  ['P9-8', 'ruta relativa a la unidad «G:»', u8('{"userDataDir":"G:"}'), 'invalido'],
  ['P9-8', 'ruta relativa a la unidad «G:datos»', u8('{"userDataDir":"G:datos"}'), 'invalido'],
  ['P9-8', 'ruta relativa «~/datos»', u8('{"userDataDir":"~/datos"}'), 'invalido'],
  ['P9-8', 'ruta relativa «file:///C:/datos» (URL, no ruta)', u8('{"userDataDir":"file:///C:/datos"}'), 'invalido'],
  ['P9-8', 'ruta relativa «\\\\» (UNC sin servidor)', u8('{"userDataDir":"\\\\\\\\"}'), 'invalido'],
  ['P9-8', 'ruta relativa «\\\\servidor» (UNC sin recurso)', u8('{"userDataDir":"\\\\\\\\servidor"}'), 'invalido'],
  ['P9-8', 'ruta relativa «\\\\.\\pipe\\x» (espacio de dispositivos)', u8('{"userDataDir":"\\\\\\\\.\\\\pipe\\\\x"}'), 'invalido'],
  ['P9-8m', 'ruta mal formada «\\\\?\\C:\\datos»', u8('{"userDataDir":"\\\\\\\\?\\\\C:\\\\datos"}'), 'invalido'],
  ['P9-8m', 'ruta mal formada con «<»', u8('{"userDataDir":"C:/da<tos"}'), 'invalido'],
  ['P9-8m', 'ruta mal formada con «>»', u8('{"userDataDir":"C:/da>tos"}'), 'invalido'],
  ['P9-8m', 'ruta mal formada con «|»', u8('{"userDataDir":"C:/da|tos"}'), 'invalido'],
  ['P9-8m', 'ruta mal formada con «?»', u8('{"userDataDir":"C:/da?tos"}'), 'invalido'],
  ['P9-8m', 'ruta mal formada con «*»', u8('{"userDataDir":"C:/da*tos"}'), 'invalido'],
  ['P9-8m', 'ruta mal formada con comillas', u8('{"userDataDir":"C:/da\\"tos"}'), 'invalido'],
  ['P9-8m', 'ruta mal formada con «:» de más (flujo alternativo)', u8('{"userDataDir":"C:/datos:flujo"}'), 'invalido'],
  ['P9-8m', 'ruta mal formada con NUL', u8('{"userDataDir":"C:/datos\\u0000x"}'), 'invalido'],
  ['P9-8m', 'ruta mal formada con U+FFFD (ya llegó corrompida)', u8(`{"userDataDir":"${G}/A\uFFFDo"}`), 'invalido'],
  ['P9-9', 'ANSI cp1252 con ñ/ú (no es UTF-8)', Buffer.from(`{"userDataDir":"${G}/A\xf1o P\xfablico"}`, 'latin1'), 'ilegible'],
  ['P9-9', 'UTF-8 roto (C3 28)', Buffer.concat([u8('{"userDataDir":"C:/a'), Buffer.from([0xC3, 0x28]), u8('"}')]), 'ilegible'],
  ['P9-9', 'UTF-16 LE + BOM con un byte suelto al final', Buffer.concat([u16le(instalador(G)), Buffer.from([0x20])]), 'ilegible'],
  ['P9-9', 'UTF-16 LE + BOM con un suplente suelto', Buffer.concat([u16le('{"userDataDir":"C:/a'), Buffer.from([0x00, 0xDC]), Buffer.from('"}', 'utf16le')]), 'ilegible'],
  ['P9-9', 'UTF-16 LE SIN BOM (no se adivina)', Buffer.from(instalador(G), 'utf16le'), 'invalido'],
  ['P9-9', 'UTF-16 BE SIN BOM (no se adivina)', Buffer.from(instalador(G), 'utf16le').swap16(), 'invalido'],
  ['P9-9', 'UTF-32 LE con BOM (no admitido)', Buffer.concat([Buffer.from([0xFF, 0xFE, 0, 0]), ...[...instalador(G)].map((ch) => { const b = Buffer.alloc(4); b.writeUInt32LE(ch.codePointAt(0)); return b; })]), 'invalido'],
];
const noLlevaRuta = (m) => typeof m === 'string' && m.length > 5 && !m.includes(SB) && !m.includes(G) && !/BD-P9|servidor|datos/i.test(m);
for (const [caso, id, bytes, estado] of INVALIDOS) {
  let r; try { r = leer(bytes); } catch (e) { r = { lanza: e.message }; }
  ok(`${caso} ${id}: ${estado.toUpperCase()} (nunca «ausente» ni «valido»)`, r.estado === estado && !('userDataDir' in r), JSON.stringify(r));
  ok(`${caso} ${id}: el motivo no lleva la ruta`, noLlevaRuta(r.motivo), JSON.stringify(r.motivo));
}

// Errores de lectura que no son de contenido (dobles de fs acotados al archivo).
function fsQueFalla(objetivo, metodo, codigo) {
  return new Proxy(fs, {
    get(t, k) {
      if (k === metodo) {
        return (p, ...r) => {
          if (path.resolve(String(p)).toLowerCase() === path.resolve(objetivo).toLowerCase()) {
            const e = new Error(`${codigo}: simulado, ${metodo} '${p}'`); e.code = codigo; throw e;
          }
          return t[k](p, ...r);
        };
      }
      return typeof t[k] === 'function' ? t[k].bind(t) : t[k];
    },
  });
}
for (const codigo of ['EACCES', 'EPERM', 'EBUSY', 'EIO']) {
  const r = leer(u8(instalador(G)), { fsImpl: fsQueFalla(LOC, 'readFileSync', codigo) });
  ok(`P9-9 lectura denegada/bloqueada (${codigo}) de un archivo VÁLIDO: ILEGIBLE, con el código y sin la ruta`,
    r.estado === 'ilegible' && r.motivo.includes(codigo) && noLlevaRuta(r.motivo), JSON.stringify(r));
}
{
  escribirLoc(null);
  fs.mkdirSync(LOC);
  const r = construir({ appData: APPDATA_C, userData: DEFECTO_C }).leerConfigUbicacion();
  ok('P9-9 location.json es una CARPETA (EISDIR): ILEGIBLE', r.estado === 'ilegible' && /EISDIR/.test(r.motivo), JSON.stringify(r));
  fs.rmdirSync(LOC);
}
{
  const r = leer(null);
  ok('P9-10 sin archivo: AUSENTE (el único estado que significa «no hay configuración»)', r.estado === 'ausente' && Object.keys(r).length === 1, JSON.stringify(r));
  const r2 = leer(null, { fsImpl: fsQueFalla(LOC, 'readFileSync', 'ENOENT') });
  ok('P9-10 ENOENT (y solo ENOENT) es AUSENTE', r2.estado === 'ausente', JSON.stringify(r2));
}
{
  const appDataRaro = path.join(RAIZ_C, 'RoamingRaro');
  fs.mkdirSync(appDataRaro, { recursive: true });
  fs.writeFileSync(path.join(appDataRaro, 'panorama-app-config'), 'soy un archivo');
  const r = construir({ appData: appDataRaro, userData: DEFECTO_C }).leerConfigUbicacion();
  ok('P9-10 [REGISTRA] si «panorama-app-config» es un ARCHIVO, Windows responde ENOENT: no hay location.json → AUSENTE',
    r.estado === 'ausente', JSON.stringify(r));
}
{
  let lanzo = 0;
  for (const [, , bytes] of [...VALIDOS, ...INVALIDOS]) { try { leer(bytes); } catch (e) { lanzo++; } }
  ok('P9-C90 el lector NUNCA lanza (todas las variantes)', lanzo === 0, String(lanzo));
  escribirLoc(Buffer.concat([BOM, BOM, u8(instalador(G))]));
  const m = construir({ appData: APPDATA_C, userData: DEFECTO_C });
  m.leerConfigUbicacion();
  ok('P9-C91 el lector no escribe nada ni deja rastro (es puro)', m.traza.escrituras.length === 0 && m.traza.logs.length === 0, JSON.stringify(m.traza));
}

// =============================================================================
seccion('P9-D. EL ARRANQUE A NIVEL DE MÓDULO (applyCustomUserDataDirIfConfigured)');
// =============================================================================
function listarTodo(dir) {
  const out = [];
  (function rec(d) { for (const e of ofs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); out.push(p); if (e.isDirectory()) rec(p); } })(dir);
  return out.sort();
}
function arrancar(bytes, { fsImpl, cwd, guard, recursos } = {}) {
  escribirLoc(bytes);
  const locAntes = bytes ? sha(fs.readFileSync(LOC)) : null;
  const antes = listarTodo(RAIZ_C);
  const m = construir({ appData: APPDATA_C, userData: DEFECTO_C, fsImpl, guard, recursos });
  const antesCwd = process.cwd();
  if (cwd) process.chdir(cwd);
  let lanzo = null;
  try { m.applyCustomUserDataDirIfConfigured(); } catch (e) { lanzo = e.message; }
  if (cwd) process.chdir(antesCwd);
  const nuevos = listarTodo(RAIZ_C).filter((p) => !antes.includes(p)).map((p) => path.relative(RAIZ_C, p));
  const locIgual = bytes ? fs.existsSync(LOC) && sha(fs.readFileSync(LOC)) === locAntes : !fs.existsSync(LOC);
  return { m, lanzo, st: m.estado(), userData: m.traza.userData, setPath: m.traza.setPath, sleeps: m.traza.sleeps, nuevos, locIgual };
}
{
  const r = arrancar(u8(instalador(G)));
  ok('P9-1 válido y accesible: setPath(userData, destino), sin fallo y sin estado «no resuelta»',
    r.userData === G && !r.st.fallo && r.st.destino === G && r.st.noResuelta === null && !r.lanzo, JSON.stringify(r.st));
  ok('P9-1 …y la política de A3.3 es «compartida»', r.m.clasificarPoliticaUbicacion().politica === 'compartida');
}
for (const [caso, id, bytes] of [
  ['P9-2', 'UTF-8 + BOM', Buffer.concat([BOM, u8(instalador(G))])],
  ['P9-3', 'UTF-16 LE + BOM', u16le(instalador(G))],
  ['P9-3', 'UTF-16 BE + BOM', u16be(instalador(G))],
]) {
  const r = arrancar(bytes);
  ok(`${caso} ${id}: el arranque usa EXACTAMENTE la misma carpeta que el archivo sin BOM, y la política es «compartida»`,
    r.setPath.length === 1 && r.setPath[0][1] === G && r.userData === G && r.st.destino === G && r.st.compartida === true
    && r.st.noResuelta === null && r.m.clasificarPoliticaUbicacion().politica === 'compartida', JSON.stringify({ st: r.st, setPath: r.setPath }));
}
const INVALIDOS_ARRANQUE = [
  ['P9-4', 'BOM duplicado', Buffer.concat([BOM, BOM, u8(instalador(G))])],
  ['P9-4', 'BOM fuera de sitio', Buffer.concat([u8('  '), BOM, u8(instalador(G))])],
  ['P9-5', 'JSON truncado', u8(`{"userDataDir":"${G.slice(0, 12)}`)],
  ['P9-5', 'vacío', Buffer.alloc(0)],
  ['P9-6', 'null', u8('null')],
  ['P9-6', '{}', u8('{}')],
  ['P9-6', '[]', u8('[]')],
  ['P9-6', 'userDataDir numérico', u8('{"userDataDir":42,"shared":true}')],
  ['P9-7', 'ruta vacía', u8('{"userDataDir":"","shared":true}')],
  ['P9-7', 'ruta solo espacios', u8('{"userDataDir":"   "}')],
  ['P9-8', 'ruta relativa', u8('{"userDataDir":"datos/relativa","shared":true}')],
  ['P9-8', 'ruta relativa a la unidad «G:»', u8('{"userDataDir":"G:"}')],
  ['P9-9', 'ANSI cp1252', Buffer.from(`{"userDataDir":"${G}/A\xf1o P\xfablico"}`, 'latin1')],
  ['P9-9', 'UTF-16 LE sin BOM', Buffer.from(instalador(G), 'utf16le')],
];
for (const [caso, id, bytes] of INVALIDOS_ARRANQUE) {
  const r = arrancar(bytes);
  ok(`${caso} ${id}: queda «NO RESUELTA» (${r.st.noResuelta && r.st.noResuelta.estado}), sin setPath, sin destino, sin fallo PS-1005 y sin esperar`,
    !!r.st.noResuelta && /^(ilegible|invalido)$/.test(r.st.noResuelta.estado) && r.setPath.length === 0
    && r.st.destino === null && r.st.fallo === null && r.sleeps === 0 && r.userData === DEFECTO_C, JSON.stringify(r.st));
  ok(`${caso} ${id}: NO escribe nada (ni carpetas ni sondas) y location.json queda byte a byte igual`,
    r.m.traza.escrituras.length === 0 && r.nuevos.length === 0 && r.locIgual, JSON.stringify({ e: r.m.traza.escrituras, n: r.nuevos }));
}
{
  const r = arrancar(null, { fsImpl: fsQueFalla(LOC, 'readFileSync', 'EACCES') });
  ok('P9-9 archivo presente pero ilegible (EACCES): «NO RESUELTA», sin setPath y sin escribir nada',
    r.st.noResuelta && r.st.noResuelta.estado === 'ilegible' && r.setPath.length === 0 && r.m.traza.escrituras.length === 0, JSON.stringify(r.st));
}
{
  const cwd = path.join(RAIZ_C, 'cwd-simulado');
  fs.mkdirSync(cwd, { recursive: true });
  const r = arrancar(u8('{"userDataDir":"datos/relativa"}'), { cwd });
  ok('P9-8 ruta RELATIVA: NO se crea NINGUNA carpeta bajo el directorio de trabajo (antes: «datos\\relativa»)',
    !fs.existsSync(path.join(cwd, 'datos')) && r.nuevos.length === 0, JSON.stringify(r.nuevos));
  ok('P9-8 ruta RELATIVA: setPath NO se llama y NO hay excepción a nivel de módulo (antes: «Path must be absolute» → PS-1007)',
    r.lanzo === null && r.setPath.length === 0, JSON.stringify({ lanzo: r.lanzo, setPath: r.setPath }));
}
{
  const r = arrancar(Buffer.from(`{"userDataDir":"${G}/A\xf1o P\xfablico"}`, 'latin1'));
  ok('P9-9 ruta ANSI: NO se crea la carpeta con el nombre mal decodificado (antes sí, con U+FFFD)',
    !fs.existsSync(`${G}/A\uFFFDo P\uFFFDblico`) && r.nuevos.length === 0, JSON.stringify(r.nuevos));
}
{
  const r = arrancar(null);
  ok('P9-10 sin archivo: ni destino ni «no resuelta»; se sigue con la carpeta por defecto (primera ejecución legítima)',
    r.st.destino === null && r.st.noResuelta === null && r.setPath.length === 0 && r.userData === DEFECTO_C
    && r.m.clasificarPoliticaUbicacion().politica === 'local', JSON.stringify(r.st));
}
// JSON válido + ruta inaccesible: flujo PS-1005/PS-1009 de siempre (NO es P9).
{
  const destino = `${G}/no-existe-aun-D`;
  const r = arrancar(u8(`{"userDataDir":"${destino}"}`));
  ok('P9-V1 [REGISTRA] válido + ruta absoluta INEXISTENTE: se crea la carpeta y se usa (después PS-1009) — sin cambios',
    fs.existsSync(destino) && r.userData === destino && !r.st.fallo && r.st.noResuelta === null, JSON.stringify(r.st));
}
{
  const r = arrancar(u8('{"userDataDir":"Q:/no-montada/BD"}'));
  ok('P9-V2 [REGISTRA] válido + unidad NO montada (Q:): fallo PS-1005 tras el primer tramo de reintentos — sin cambios',
    !!r.st.fallo && /ENOENT|no such file/i.test(r.st.fallo.error) && r.setPath.length === 0 && r.sleeps >= 4 && r.st.noResuelta === null, JSON.stringify(r.st));
}
{
  const archivo = path.join(RAIZ_C, 'soy-un-archivo.txt');
  fs.writeFileSync(archivo, 'x');
  const r = arrancar(u8(`{"userDataDir":"${archivo.replace(/\\/g, '/')}/BD"}`));
  ok('P9-V3 [REGISTRA] válido + ruta INACCESIBLE (cuelga de un archivo): fallo PS-1005 — sin cambios',
    !!r.st.fallo && r.setPath.length === 0 && r.st.noResuelta === null, JSON.stringify(r.st.fallo));
}
for (const codigo of ['EACCES', 'EPERM']) {
  const r = arrancar(u8(instalador(G)), { fsImpl: fsQueFalla(CUSTOM_C, 'mkdirSync', codigo) });
  ok(`P9-V4 [REGISTRA] válido + acceso DENEGADO a la carpeta (${codigo}): fallo PS-1005 — sin cambios`,
    !!r.st.fallo && new RegExp(codigo).test(r.st.fallo.error) && r.setPath.length === 0 && r.st.noResuelta === null, JSON.stringify(r.st.fallo));
}

// =============================================================================
seccion('P9-E. LA DECISIÓN DE A3.3 DESPUÉS (segunda capa)');
// =============================================================================
const REG = path.join(APPDATA_C, 'panorama-app-config', 'ubicaciones-inicializadas.json');
function decidir(bytes, { bdEnDefecto, registro }) {
  fs.rmSync(path.join(DEFECTO_C, 'panorama.sqlite3'), { force: true });
  fs.rmSync(REG, { force: true });
  if (bdEnDefecto) fs.writeFileSync(path.join(DEFECTO_C, 'panorama.sqlite3'), 'residuo');
  if (registro !== undefined) fs.writeFileSync(REG, typeof registro === 'string' ? registro : JSON.stringify(registro));
  const r = arrancar(bytes);
  const d = r.m.decidirCrearSiAusente();
  return { d, escrituras: r.m.traza.escrituras.length };
}
const ROTO = Buffer.concat([BOM, BOM, u8(instalador(G))]);
const clave = path.resolve(DEFECTO_C).toLowerCase();
{
  const { d, escrituras } = decidir(ROTO, { bdEnDefecto: true });
  ok('P9-11 inválido + BD residual en la carpeta por defecto + sin registro (= esta máquina): NO autoriza y NO pide registrar la residual',
    d.crear === false && d.configNoResuelta === true && !d.bdVisible && !d.necesitaRegistrarExistente && escrituras === 0, JSON.stringify(d));
}
{
  const { d } = decidir(ROTO, { bdEnDefecto: false });
  ok('P9-12 inválido + carpeta por defecto VACÍA + sin registro: NO autoriza crear (antes: «primera ejecución»)',
    d.crear === false && d.configNoResuelta === true, JSON.stringify(d));
}
{
  const { d } = decidir(u8('{"userDataDir":"datos/relativa"}'), { bdEnDefecto: false });
  ok('P9-12 relativa + carpeta por defecto VACÍA: NO autoriza crear', d.crear === false && d.configNoResuelta === true, JSON.stringify(d));
}
{
  const { d } = decidir(ROTO, { bdEnDefecto: false, registro: { v: 1, ubicaciones: { [clave]: { estado: 'inicializada' } } } });
  ok('P9-12 inválido + carpeta por defecto registrada: NO autoriza (la segunda capa responde antes que el registro)',
    d.crear === false && d.configNoResuelta === true, JSON.stringify(d));
}
{
  const { d } = decidir(null, { bdEnDefecto: false });
  ok('P9-10 SIN archivo + carpeta por defecto vacía + sin registro: SÍ autoriza (primera ejecución legítima, sin cambios)',
    d.crear === true && /primera ejecución/.test(d.motivo), JSON.stringify(d));
}
{
  const { d } = decidir(null, { bdEnDefecto: true });
  ok('P9-10 SIN archivo + BD en la carpeta por defecto: la abre y la registra (sin cambios)',
    d.crear === false && d.bdVisible === true && d.necesitaRegistrarExistente === true, JSON.stringify(d));
}
{
  const { d } = decidir(Buffer.concat([BOM, u8(instalador(G))]), { bdEnDefecto: true });
  ok('P9-2 con BOM (válido) la decisión mira la carpeta CONFIGURADA, no la residual',
    d.crear === false && !d.bdVisible && !d.configNoResuelta && /carpeta personalizada sin base de datos/.test(d.motivo), JSON.stringify(d));
}
fs.rmSync(REG, { force: true });
fs.rmSync(path.join(DEFECTO_C, 'panorama.sqlite3'), { force: true });

// =============================================================================
seccion('P9-F. EL RESCATE AUTOMÁTICO DE app.asar (PS-1007) ANTE UNA CONFIG INVÁLIDA');
// =============================================================================
// Se ejecuta handleFatalStartupError REAL. Recursos de mentira en el sandbox,
// copias de app.asar: una ANTIGUA en la carpeta por defecto y una RECIENTE en
// la configurada (como en esta máquina: 26/08 frente a 12/09).
const RECURSOS = path.join(RAIZ_C, 'resources');
fs.mkdirSync(RECURSOS, { recursive: true });
const BAK_DEF = 'app.asar.bak-2026-08-26T10-00-00-000Z';
const BAK_G = 'app.asar.bak-2026-09-12T10-00-00-000Z';
fs.writeFileSync(path.join(DEFECTO_C, BAK_DEF), 'ASAR ANTIGUO (carpeta por defecto)');
fs.writeFileSync(path.join(CUSTOM_C, BAK_G), 'ASAR RECIENTE (carpeta configurada)');
function rescatar(bytes, extra) {
  for (const f of ofs.readdirSync(RECURSOS)) ofs.rmSync(path.join(RECURSOS, f), { force: true });
  ofs.writeFileSync(path.join(RECURSOS, 'app.asar'), 'ASAR ROTO');
  escribirLoc(bytes);
  const m = construir(Object.assign({ appData: APPDATA_C, userData: DEFECTO_C, recursos: RECURSOS }, extra || {}));
  const copias = () => m.traza.escrituras.filter((e) => /^copyFileSync /.test(e));
  m.handleFatalStartupError(new Error('fallo simulado al cargar ./db'));
  return { m, copias: copias(), asar: ofs.readFileSync(path.join(RECURSOS, 'app.asar'), 'utf8'), recursos: ofs.readdirSync(RECURSOS) };
}
for (const [id, bytes, extra] of [
  ['BOM duplicado', ROTO],
  ['JSON truncado', u8(`{"userDataDir":"${G}"`)],
  ['ruta relativa', u8('{"userDataDir":"datos/relativa"}')],
  ['ANSI cp1252', Buffer.from(`{"userDataDir":"${G}/A\xf1o"}`, 'latin1')],
  ['archivo ilegible (EACCES)', u8(instalador(G)), { fsImpl: fsQueFalla(LOC, 'readFileSync', 'EACCES') }],
]) {
  const r = rescatar(bytes, extra);
  ok(`P9-14 ${id}: el rescate NO copia NADA (ni la copia antigua de la carpeta por defecto ni ninguna otra)`,
    r.copias.length === 0 && r.asar === 'ASAR ROTO' && r.recursos.join() === 'app.asar', JSON.stringify({ c: r.copias, rec: r.recursos }));
  const eb = r.m.traza.errorBox[0] || {};
  ok(`P9-14 ${id}: avisa (PS-1007) de que la configuración no puede leerse y de que NO se restauró nada, y sale con 1`,
    r.m.traza.errorBox.length === 1 && /PS-1007/.test(eb.c) && /configuración de ubicación de datos no puede leerse/.test(eb.c)
    && /NO se ha restaurado/.test(eb.c) && r.m.traza.exit.join() === '1' && !eb.c.includes(SB), JSON.stringify(r.m.traza.errorBox));
}
{
  const r = rescatar(Buffer.concat([BOM, u8(instalador(G))]));
  ok('P9-14 con BOM (válido) el rescate usa la copia RECIENTE de la carpeta configurada, no la antigua de la por defecto',
    r.copias.length === 2 && r.asar === 'ASAR RECIENTE (carpeta configurada)', JSON.stringify(r.copias));
}
{
  const r = rescatar(null);
  ok('P9-14 [REGISTRA] sin archivo: el rescate usa la carpeta por defecto (lo de siempre)',
    r.asar === 'ASAR ANTIGUO (carpeta por defecto)', r.asar);
}
{
  const r = rescatar(u8(`{"userDataDir":"${G}/no-existe-rescate"}`));
  ok('P9-14 [REGISTRA] válido pero la carpeta configurada no existe: la carpeta por defecto (lo de siempre; no es P9)',
    r.asar === 'ASAR ANTIGUO (carpeta por defecto)', r.asar);
}
for (const f of [path.join(DEFECTO_C, BAK_DEF), path.join(CUSTOM_C, BAK_G)]) fs.rmSync(f, { force: true });
fs.rmSync(path.join(DEFECTO_C, 'app.log'), { force: true });

// =============================================================================
seccion('P9-G. LA PROTECCIÓN DE APAGADO NO SE TOCA POR UN FALLO DE LECTURA');
// =============================================================================
function sincronizar(bytes, guard) {
  const r = arrancar(bytes, { guard });
  r.m.syncDriveSyncGuardWithLocation();
  return r.m.traza.guard;
}
for (const [id, bytes] of [['BOM duplicado', ROTO], ['JSON truncado', u8('{')], ['ruta relativa', u8('{"userDataDir":"datos/relativa"}')], ['vacío', Buffer.alloc(0)]]) {
  ok(`P9-13 ${id} + protección ACTIVA: no se desactiva`, sincronizar(bytes, { activa: true }).length === 0);
  ok(`P9-13 ${id} + protección INACTIVA: no se activa`, sincronizar(bytes, { activa: false }).length === 0);
  ok(`P9-13 ${id} + protección activa SIN señales de vida: no se relanza`, sincronizar(bytes, { activa: true, viva: false }).length === 0);
}
ok('P9-13 con BOM (válido, compartida) y protección activa: se queda como está (antes se DESACTIVABA)',
  sincronizar(Buffer.concat([BOM, u8(instalador(G))]), { activa: true }).length === 0);
ok('P9-13 con BOM (válido, compartida) y protección inactiva: se ACTIVA, como con el archivo sin BOM',
  /^enable: /.test(sincronizar(Buffer.concat([BOM, u8(instalador(G))]), { activa: false }).join()));
ok('P9-13 [REGISTRA] SIN archivo y protección activa: se desactiva (carpeta por defecto legítima; sin cambios)',
  /^disable: /.test(sincronizar(null, { activa: true }).join()));
const SYNC = cuerpoDe('function syncDriveSyncGuardWithLocation()');
ok('P9-13 la guarda va ANTES de decidir nada en la sincronización',
  SYNC.indexOf('if (configUbicacionNoResuelta) return;') > 0 && SYNC.indexOf('if (configUbicacionNoResuelta) return;') < SYNC.indexOf('const shouldBeOn'));
nota('Con la unidad no montada (JSON válido) y «datos locales» en PS-1005 la protección se sigue desactivando:');
nota('comportamiento anterior a P9, fuera de su alcance (lo mide electron-p9.ps1, caso guard/no-montada).');

// =============================================================================
seccion('P9-S. LA PARADA DEL ARRANQUE (whenReady) Y SU AVISO');
// =============================================================================
const IW = MAIN.indexOf('\napp.whenReady().then(');
const ARRANQUE = MAIN.slice(IW, MAIN.indexOf('\n});\n', IW));
const PARADA = "  if (configUbicacionNoResuelta) {\n    detenerArranquePorConfigUbicacion();\n    return;\n  }\n";
const iParada = ARRANQUE.indexOf(PARADA);
ok('P9-S1 la parada es INCONDICIONAL: basta con que location.json no se pueda usar',
  iParada > 0 && (ARRANQUE.match(/detenerArranquePorConfigUbicacion\(\)/g) || []).length === 1);
ok('P9-S2 es lo PRIMERO del arranque: antes solo se desarma el rescate y se anota «Arranque»',
  iParada > 0 && ARRANQUE.slice(0, iParada).replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ').trim()
    === "app.whenReady().then(async () => { startupRecoveryArmed = false; appLog(`Arranque — v${app.getVersion()} (${process.platform} ${process.arch})`);",
  JSON.stringify(ARRANQUE.slice(0, iParada)));
const DESPUES = ['showSplashWindow()', 'resolveUserDataDirFailureInteractively()', 'startUserDataWatchdog()', 'waitForCloudSyncIdleAtStartup()',
  'checkCustomLocationDatabaseSanity()', 'syncDriveSyncGuardWithLocation()', 'checkMultiPcLock()', 'decidirCrearSiAusente()',
  'marcarUbicacionInicializando(', 'marcarUbicacionDetectadaExistente(', 'dbmod.getDb(', 'marcarUbicacionInicializada(', 'createLauncherWindow()'];
ok('P9-S3 …y va antes de la splash, las esperas, la protección, el candado, la decisión, el registro, getDb y el lanzador',
  DESPUES.every((x) => ARRANQUE.indexOf(x) > iParada && iParada > 0), DESPUES.filter((x) => !(ARRANQUE.indexOf(x) > iParada)).join(', '));
ok('P9-S4 el estado «no resuelta» solo se ASIGNA en el arranque a nivel de módulo, y nada lo borra (el siguiente arranque vuelve a leer)',
  (C.match(/configUbicacionNoResuelta = /g) || []).length === 2 && /let configUbicacionNoResuelta = null;/.test(C)
  && /configUbicacionNoResuelta = \{ estado: cfg\.estado, motivo: cfg\.motivo \};/.test(cuerpoDe('function applyCustomUserDataDirIfConfigured()')));
{
  const r = arrancar(ROTO);
  const escriturasAntes = r.m.traza.escrituras.length;
  // Con una reversión que no deja el estado «no resuelta», el aviso lanza: se
  // anota y la batería sigue (da FALLOS legibles, no revienta).
  let errAviso = null;
  try { r.m.detenerArranquePorConfigUbicacion(); } catch (e) { errAviso = e.message; }
  if (errAviso) nota('el aviso LANZÓ: ' + errAviso);
  const d = r.m.traza.dialogos;
  const o = Object.assign({ message: '', detail: '' }, d[0] || {});
  ok('P9-S5 aviso ÚNICO, de error, con UN solo botón: «Cerrar» (no se ofrece «datos locales»)',
    d.length === 1 && o.type === 'error' && JSON.stringify(o.buttons) === '["Cerrar"]' && o.defaultId === 0 && o.cancelId === 0, JSON.stringify(o));
  ok('P9-S6 el mensaje dice exactamente que la configuración no puede leerse y que no se cambia de base de datos',
    o.message === 'La configuración de ubicación de datos no puede leerse. Panorama no cambiará automáticamente a otra base de datos.', o.message);
  ok('P9-S7 el detalle trae el motivo y el código PS-1020, y NO la ruta real (solo %APPDATA%\\...)',
    /Motivo: el archivo tiene una marca BOM duplicada o fuera de sitio\./.test(o.detail) && /\(código PS-1020\)$/.test(o.detail)
    && /%APPDATA%\\panorama-app-config\\location\.json/.test(o.detail) && !o.detail.includes(SB) && !o.detail.includes(G)
    && !/Users\\|AppData\\/i.test(o.detail), o.detail);
  ok('P9-S8 el detalle no sugiere borrar el archivo (sin él se usaría la carpeta por defecto)',
    /No lo borres/.test(o.detail) && !/datos locales \(temporal\)/i.test(o.detail));
  ok('P9-S9 la app se cierra (app.quit) y no escribe NADA más que la línea de registro',
    r.m.traza.quit === 1 && r.m.traza.escrituras.length === escriturasAntes && escriturasAntes === 0, JSON.stringify(r.m.traza.escrituras));
  ok('P9-S10 registro: «ERROR PS-1020 — location.json invalido: <motivo>», sin rutas',
    r.m.traza.logs.some((l) => /^ERROR PS-1020 — location\.json invalido: el archivo tiene una marca BOM duplicada o fuera de sitio\. No se abre, crea ni modifica ninguna base de datos\.$/.test(l))
    && !r.m.traza.logs.some((l) => l.includes(SB) || l.includes(G)), JSON.stringify(r.m.traza.logs));
  ok('P9-S11 location.json sigue byte a byte igual tras el aviso', r.locIgual && sha(fs.readFileSync(LOC)) === sha(ROTO));
}
{
  const EC = MAIN.slice(MAIN.indexOf("  'PS-1020': {"), MAIN.indexOf("  'PS-2001': {"));
  ok('P9-S12 PS-1020 existe en ERROR_CODES con título y explicación, y va entre PS-1019 y PS-2001',
    /titulo: 'No se puede leer la configuración de ubicación de datos'/.test(EC) && /explicacion:/.test(EC)
    && MAIN.indexOf("  'PS-1019': {") < MAIN.indexOf("  'PS-1020': {") && EC.length > 200);
  ok('P9-S13 se usa de verdad: errorCodeSuffix(\'PS-1020\') y «ERROR PS-1020» en el registro',
    /errorCodeSuffix\('PS-1020'\)/.test(C) && /ERROR PS-1020 — location\.json/.test(MAIN));
}
const TODO_P9 = cuerpoDe('function detenerArranquePorConfigUbicacion()');
ok('P9-S14 el aviso no abre, crea ni registra nada: no llama a getDb, setPath, marcar*, probeWritableDir ni a la protección',
  !!TODO_P9 && !/getDb|setPath|marcarUbicacion|probeWritableDir|DriveSyncGuard|createLauncherWindow|showSplashWindow/.test(TODO_P9));

// =============================================================================
seccion('P9-R. [REGISTRA] EL RESCATE MANUAL (Restaurar-backup.bat) — pendiente separado, sin tocar');
// =============================================================================
const RAIZ_R = path.join(SB, 'r');
const APPDATA_R = path.join(RAIZ_R, 'Roaming');
const CUSTOM_R = path.join(RAIZ_R, 'Compartida', 'BD-P9');
fs.mkdirSync(path.join(APPDATA_R, 'panorama-app-config'), { recursive: true });
fs.mkdirSync(path.join(APPDATA_R, 'panorama-app'), { recursive: true });
fs.mkdirSync(CUSTOM_R, { recursive: true });
const batCopia = path.join(RAIZ_R, 'rescate', 'Restaurar-backup.bat');
fs.mkdirSync(path.dirname(batCopia), { recursive: true });
fs.copyFileSync(path.join(PROJ, 'claude', 'Restaurar-backup.bat'), batCopia);
const LOC_R = path.join(APPDATA_R, 'panorama-app-config', 'location.json');
function carpetaDelBat(bytes) {
  fs.rmSync(LOC_R, { force: true });
  if (bytes) fs.writeFileSync(LOC_R, bytes);
  const r = spawnSync('cmd.exe', ['/d', '/c', batCopia], {
    input: '\r\n', encoding: 'latin1', timeout: 20000, windowsHide: true,
    env: Object.assign({}, process.env, { APPDATA: APPDATA_R }),
  });
  const m = /Carpeta de datos: (.*)\r?\n/.exec(r.stdout || '');
  return { carpeta: m ? m[1].trim() : null, copio: /HECHO/.test(r.stdout || ''), sinCopia: /No se ha encontrado/.test(r.stdout || '') };
}
const GR = CUSTOM_R.replace(/\\/g, '/');
const DEF_R = path.join(APPDATA_R, 'panorama-app');
for (const [id, bytes, esperado] of [
  ['formato del instalador', u8(instalador(GR)), GR],
  ['formato del instalador con BOM', Buffer.concat([BOM, u8(instalador(GR))]), GR],
  ['JSON compacto en una línea', u8(`{"userDataDir":"${GR}","shared":true}`), DEF_R],
  ['UTF-16 LE con BOM', u16le(instalador(GR)), DEF_R],
]) {
  const r = carpetaDelBat(bytes);
  ok(`P9-R ${id}: el .bat elige ${esperado === DEF_R ? 'la carpeta POR DEFECTO' : 'la compartida'} y no copia nada`,
    r.carpeta && path.resolve(r.carpeta).toLowerCase() === path.resolve(esperado).toLowerCase() && r.sinCopia && !r.copio, JSON.stringify(r));
}
nota('Pendiente SEPARADO (no se toca en P9): con JSON compacto o UTF-16, el .bat elige la carpeta por defecto');
nota('mientras que la app ahora usa la configurada (UTF-16) o se detiene. Solo afecta al rescate MANUAL.');

// =============================================================================
seccion('P9-Z. ALCANCE');
// =============================================================================
const HASH = (rel) => sha(fs.readFileSync(path.join(PROJ, rel))).toUpperCase();
{
  // SOLO LECTURA: el lector nuevo, con appData real, sobre el archivo real.
  // Se imprime el estado y si coincide con lo que ve el guardián; nunca se escribe.
  const appDataReal = process.env.APPDATA || '';
  const locReal = path.join(appDataReal, 'panorama-app-config', 'location.json');
  if (appDataReal && fs.existsSync(locReal)) {
    const antes = sha(fs.readFileSync(locReal));
    const real = construir({ appData: appDataReal, userData: DEFECTO_C });
    const r = real.leerConfigUbicacion();
    nota(`location.json REAL de esta máquina: ${r.estado}${r.motivo ? ' (' + r.motivo + ')' : ''}`);
    ok('P9-Z3 [esta máquina, solo lectura] el location.json REAL sigue siendo VÁLIDO con el lector nuevo, apunta a la misma carpeta que ve el guardián, y no se ha escrito nada',
      r.estado === 'valido' && guardia.REAL && path.resolve(r.userDataDir).toLowerCase() === path.resolve(guardia.REAL).toLowerCase()
      && real.traza.escrituras.length === 0 && sha(fs.readFileSync(locReal)) === antes, JSON.stringify({ estado: r.estado, motivo: r.motivo }));
  } else {
    ok('P9-Z3 [esta máquina] no hay location.json real que comprobar (se esperaba uno)', false);
  }
}
ok('P9-Z1 solo main.js: db.js, security.js, preload.js, el instalador y el .bat siguen idénticos',
  HASH('db.js') === 'B03C81FF5FC300009DC315E4B20F9BF88DCC6902B18C2EF434B251A022EDD830'
  && HASH('security.js').startsWith('0BF1CAD061B2D9E7') && HASH('preload.js').startsWith('AA77316F3FDB384D')
  && HASH('build/installer.nsh').startsWith('C032D0D7D59208DC') && HASH('claude/Restaurar-backup.bat').startsWith('0E947548DF868DBB'),
  ['db.js', 'security.js', 'preload.js', 'build/installer.nsh', 'claude/Restaurar-backup.bat'].map((f) => f + '=' + HASH(f).slice(0, 16)).join(' '));
ok('P9-Z2 la batería no ha escrito fuera de su sandbox (la carpeta de config real no se toca)',
  guardia.REAL !== null && !guardia.dentroDe(SB, path.join(process.env.APPDATA || '', 'panorama-app-config')));

console.log('\n======================================================================');
console.log(`  P9: ${pass} OK / ${fail} FALLOS`);
console.log('======================================================================');
if (fail) { console.log('  Fallos:'); fallos.forEach((x) => console.log('   · ' + x)); process.exit(1); }
console.log('  Batería EXIGENTE: location.json presente pero inutilizable NUNCA equivale a «sin configuración».');
