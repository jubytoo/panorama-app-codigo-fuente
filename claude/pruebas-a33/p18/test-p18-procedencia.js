'use strict';
// ---------------------------------------------------------------------------
// P18 — BATERÍA EXIGENTE (Fase 1): solo se restaura una copia de `app.asar`
// cuya PROCEDENCIA se demuestra en el momento.
//
// Nació DESCRIPTIVA el 18 sept 2026 (63 OK describiendo el defecto: el rescate
// elegía «el app.asar.bak-* de nombre más alto» de la carpeta de datos). Esta
// versión EXIGE el contrato de la Fase 1: copia LOCAL + registro local +
// operation_id + installation_id + PREPARADA→VERIFICADA + hashes antes/después,
// cero confianza en las copias heredadas, y fail-closed ante la ambigüedad.
//
// CÓMO SE PRUEBA, y por qué así (ARN-3): NO se arranca ningún app.asar
// empaquetado. Se ejecutan las funciones REALES de main.js extraídas por su
// firma, dentro de un sandbox con rutas EXPLÍCITAS (app, process y dialog son
// dobles que apuntan al sandbox), con asar SINTÉTICOS de versiones conocidas.
// El ayudante de parcheo se genera con la plantilla REAL de main.js y se
// ejecuta con el node del sistema: solo usa las rutas que recibe por
// argumento (se comprueba que no llama a getPath ni lee APPDATA), así que su
// aislamiento es por construcción, no por variables de entorno. Toda escritura
// fuera del sandbox LANZA.
//
// LÍMITE que la batería no oculta: la Fase 1 vive en main.js, dentro del
// app.asar. Con el asar truncado, sin cabecera, sin main.js o sin archivo, no
// se ejecuta ni una línea de Panorama (medido el 18 sept 2026). Eso es Fase 2.
//
// FALSO VERDE DEL 18 SEPT 2026, y por qué existen P18-S1/S2: extraer por firma
// prueba la PRIMERA declaración de un nombre, pero V8 liga la ÚLTIMA. main.js
// declaraba dos veces `sha256DeArchivo`; esta batería dio 102/0 mientras el
// módulo real nunca restauraba y «Aplicar parche» lanzaba siempre. S1 busca
// nombres duplicados a nivel de módulo; S2 pide a V8 (sin ejecutar el módulo)
// qué funciones quedan ligadas de verdad y prueba el contrato con ESAS.
// La sección P18-O es consistencia DOCUMENTAL: no es evidencia técnica.
//
// Uso: node claude/pruebas-a33/p18/test-p18-procedencia.js
//      (PANORAMA_MAIN=<otra copia de main.js> para las reversiones)
// ---------------------------------------------------------------------------
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { execFileSync, spawnSync } = require('child_process');
const DETECTOR = require('./nombres-modulo.js');

const PROJ = path.resolve(__dirname, '..', '..', '..');
const MAIN = process.env.PANORAMA_MAIN || path.join(PROJ, 'main.js');
const SRC = fs.readFileSync(MAIN, 'utf8');
const DBJS = fs.readFileSync(path.join(PROJ, 'db.js'), 'utf8');
const BAT = fs.readFileSync(path.join(PROJ, 'claude', 'Restaurar-backup.bat'), 'utf8');
const SB = fs.mkdtempSync(path.join(os.tmpdir(), 'a33-p18-'));
const SBn = path.resolve(SB).toLowerCase();

let pass = 0, fail = 0, passDoc = 0, failDoc = 0;
const fallos = [];
function ok(n, c, extra) {
  const doc = n.startsWith('P18-O');
  if (c) { pass++; if (doc) passDoc++; console.log('  OK    ' + n); }
  else { fail++; if (doc) failDoc++; fallos.push(n); console.log('  FALLO ' + n + (extra === undefined ? '' : '  -- ' + extra)); }
}
const seccion = (t) => console.log('\n=== ' + t + ' ===');
const nota = (t) => console.log('        ' + t);
const DOC = (f) => fs.readFileSync(path.join(PROJ, 'claude', f), 'utf8');

// --- guardia: ninguna escritura fuera del sandbox ---------------------------
const OPS_ESCRITURA = ['mkdirSync', 'writeFileSync', 'appendFileSync', 'renameSync', 'copyFileSync',
  'unlinkSync', 'rmSync', 'rmdirSync', 'openSync', 'writeSync', 'utimesSync'];
const escriturasFuera = [];
function dentro(p) { return path.resolve(String(p)).toLowerCase().startsWith(SBn); }
function fsGuardado(base, traza) {
  return new Proxy(base, {
    get(t, k) {
      const v = t[k];
      if (typeof v !== 'function') return v;
      if (!OPS_ESCRITURA.includes(k) || k === 'writeSync') return v.bind(t);
      return (...a) => {
        const esLectura = k === 'openSync' && (a[1] === undefined || a[1] === 'r');
        if (!esLectura) {
          const destino = k === 'copyFileSync' || k === 'renameSync' ? a[1] : a[0];
          if (!dentro(destino)) { escriturasFuera.push(`${k} ${destino}`); throw new Error('P18: escritura FUERA del sandbox: ' + destino); }
          if (traza) traza.push(`${k} ${path.relative(SB, String(destino))}`);
        }
        return v.apply(t, a);
      };
    },
  });
}

// --- extracción de funciones REALES de main.js ------------------------------
function extraerDe(src, firma) {
  const i = src.indexOf(firma);
  if (i < 0) throw new Error('no está en main.js: ' + firma);
  let j = src.indexOf('{', i + firma.length - 1), prof = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (prof === 0) return src.slice(i, k + 1); }
  }
  throw new Error('no delimitado: ' + firma);
}
const FIRMAS = ['function userDataConfigPath()', 'function leerConfigUbicacion()',
  'function resolveDataDirForStartupRecovery()', 'function findLatestAsarBackupForRecovery(dir)',
  'function rutaInstallationIdParaRescate()', 'function leerInstallationIdParaRescate()',
  'function carpetaRecuperacionAsar()', 'function rutaManifiestoProcedencia()',
  'function leerManifiestoProcedencia()', 'function sha256HexArchivoP18(ruta)', 'function versionDeAsar(ruta)',
  'function analizarRecuperacionAsar(asarInstalado)', 'function restaurarPredecesoraVerificada(a, asarInstalado)',
  'function describirCopiasHeredadasParaSoporte()', 'function handleFatalStartupError(err)',
  'function guardarManifiestoProcedencia(j)', 'function prepararOperacionAsar({ realAsar, stagedAsar, shaParcheElegido })',
  'function purgeOldAsarBackups(dir)', 'function asarPatchHelperSource()'];
const FUENTE = FIRMAS.map((f) => extraerDe(SRC, f)).join('\n') + '\nlet startupRecoveryArmed = true;';

// Un «mundo»: appData, carpeta por defecto, compartida, LOCALAPPDATA e
// instalación, todo dentro del sandbox.
let nMundo = 0;
function mundo() {
  const raiz = path.join(SB, 'm' + ++nMundo);
  const w = {
    raiz,
    appData: path.join(raiz, 'Roaming'),
    local: path.join(raiz, 'Local'),
    res: path.join(raiz, 'Programs', 'Panorama del Servicio', 'resources'),
    comp: path.join(raiz, 'G', 'BD'),
  };
  w.cfg = path.join(w.appData, 'panorama-app-config');
  w.def = path.join(w.appData, 'panorama-app');
  w.rec = path.join(w.local, 'panorama-app-recovery');
  w.asar = path.join(w.res, 'app.asar');
  w.man = path.join(w.cfg, 'asar-procedencia.json');
  for (const d of [w.cfg, w.def, w.local, w.res, w.comp]) fs.mkdirSync(d, { recursive: true });
  return w;
}
const DEVOLVER = ['leerInstallationIdParaRescate', 'rutaInstallationIdParaRescate', 'carpetaRecuperacionAsar',
  'rutaManifiestoProcedencia', 'leerManifiestoProcedencia', 'versionDeAsar', 'analizarRecuperacionAsar',
  'handleFatalStartupError', 'prepararOperacionAsar', 'guardarManifiestoProcedencia', 'asarPatchHelperSource',
  'describirCopiasHeredadasParaSoporte'];
// `fuente`/`devolver`: P18-S2 monta el mismo mundo con los cuerpos que V8 liga de verdad.
function construir(w, { respuestaDialogo, dialogoLanza, localAppData, fuente, devolver } = {}) {
  const traza = { escrituras: [], errorBox: [], mensajes: [], exit: [], logs: [] };
  const app = {
    getPath: (k) => (k === 'appData' ? w.appData : k === 'userData' ? w.def : os.tmpdir()),
    exit: (c) => traza.exit.push(c),
  };
  const dialog = {
    showErrorBox: (t, c) => traza.errorBox.push({ t, c }),
    showMessageBoxSync: (o) => {
      traza.mensajes.push(o);
      if (dialogoLanza) throw new Error('diálogo no disponible');
      return typeof respuestaDialogo === 'function' ? respuestaDialogo(o) : (respuestaDialogo === undefined ? o.cancelId : respuestaDialogo);
    },
  };
  const proc = {
    platform: 'win32', pid: process.pid, resourcesPath: w.res,
    env: { LOCALAPPDATA: localAppData === undefined ? w.local : localAppData },
  };
  const g = fsGuardado(fs, traza.escrituras);
  const f = new Function('app', 'fs', 'originalFs', 'path', 'crypto', 'dialog', 'process',
    (fuente || FUENTE) + '\nreturn { ' + (devolver || DEVOLVER).join(', ') + ' };');
  return Object.assign(f(app, g, g, path, crypto, dialog, proc), { traza });
}

// --- asar sintético mínimo (mismo formato que lee la app) -------------------
function asar(version, relleno) {
  const pkg = Buffer.from(JSON.stringify({ name: 'panorama-del-servicio', version }), 'utf8');
  const extra = Buffer.alloc(relleno || 64, 0x41 + (version.length % 20));
  const cab = { files: { 'package.json': { size: pkg.length, offset: '0' }, 'main.js': { size: extra.length, offset: String(pkg.length) } } };
  const json = Buffer.from(JSON.stringify(cab), 'utf8');
  const pad = (4 - (json.length % 4)) % 4;
  const L = json.length, S = 8 + L + pad;
  const h = Buffer.alloc(16);
  h.writeUInt32LE(4, 0); h.writeUInt32LE(S, 4); h.writeUInt32LE(L + pad, 8); h.writeUInt32LE(L, 12);
  return Buffer.concat([h, json, Buffer.alloc(pad), pkg, extra]);
}
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const shaF = (p) => (fs.existsSync(p) ? sha(fs.readFileSync(p)) : null);
const ID = 'a1'.repeat(16), ID_OTRO = 'b2'.repeat(16);

// Escenario: identidad, instalado, copia local y manifiesto.
function escenario(o = {}) {
  const w = mundo();
  if (o.id !== null) fs.writeFileSync(path.join(w.cfg, 'installation-id'), o.id === undefined ? ID : o.id, 'utf8');
  const vieja = asar(o.vVieja || '2.0.54');
  const nueva = asar(o.vNueva || '2.0.55');
  fs.writeFileSync(w.asar, o.instalado || nueva);
  const ops = [];
  for (const d of (o.ops || [{}])) {
    const opId = d.opId || crypto.randomBytes(8).toString('hex');
    const nombre = `app.asar.pred-${opId}`;
    const contCopia = d.copia === undefined ? vieja : d.copia;
    if (contCopia !== null) {
      fs.mkdirSync(w.rec, { recursive: true });
      fs.writeFileSync(path.join(w.rec, nombre), contCopia);
    }
    ops.push(Object.assign({
      operation_id: opId, installation_id: ID, estado: 'verificada',
      sha256_anterior: sha(vieja), version_anterior: o.vVieja || '2.0.54', nombre_copia: nombre,
      sha256_copia_local: sha(vieja), sha256_nuevo_esperado: sha(nueva), version_nueva_esperada: o.vNueva || '2.0.55',
      sha256_nuevo_real: sha(nueva), creada_at: '2026-09-18T10:00:00.000Z', verificada_at: '2026-09-18T10:00:05.000Z', motivo_fallo: null,
    }, d.campos || {}));
  }
  if (o.manifiestoCrudo !== undefined) fs.writeFileSync(w.man, o.manifiestoCrudo, 'utf8');
  else if (o.sinManifiesto !== true) fs.writeFileSync(w.man, JSON.stringify({ v: 1, installation_id: ID, operaciones: ops }, null, 2), 'utf8');
  for (const [dir, nombre, v] of (o.heredadas || [])) {
    const d = dir === 'def' ? w.def : w.comp;
    fs.writeFileSync(path.join(d, nombre), asar(v));
  }
  if (o.location) fs.writeFileSync(path.join(w.cfg, 'location.json'), JSON.stringify({ userDataDir: o.location === 'ausente' ? path.join(w.raiz, 'no-montada') : w.comp, shared: true }, null, 2), 'utf8');
  return { w, vieja, nueva, ops };
}
const decidir = (e, opts) => construir(e.w, opts).analizarRecuperacionAsar(e.w.asar);
function rescatar(e, opts) {
  const m = construir(e.w, opts);
  const antes = shaF(e.w.asar);
  m.handleFatalStartupError(new Error('P18 sandbox: arranque roto a propósito'));
  const broken = fs.readdirSync(e.w.res).filter((f) => f.startsWith('app.asar.broken-'));
  return { m, antes, despues: shaF(e.w.asar), broken, t: m.traza };
}

console.log('======================================================================');
console.log('  P18 — FASE 1 EXIGENTE: solo se restaura lo que tiene procedencia demostrada');
console.log('======================================================================');

// =============================================================================
seccion('P18-O. CONSISTENCIA DOCUMENTAL (no es evidencia técnica de P18)');
// =============================================================================
// 18 sept 2026 — P18-O2 exigía «FASE 1 CERRADA» en el resumen: la batería se
// ponía verde PORQUE el documento declaraba el cierre (dependencia circular), y
// eso ocurrió con la evidencia sin rellenar. Ahora solo se exige que ningún
// documento de estado finja evidencia con marcadores sin rellenar. Ni esto ni
// nada de esta sección demuestra una propiedad de P18.
{
  const p = DOC('pendientes-abiertos.md');
  nota('Solo consistencia de documentos: no prueba ninguna propiedad de P18.');
  ok('P18-O1 el diagnóstico se conserva como historia (seis instalaciones en la carpeta compartida)',
    /106 parches de SEIS instalaciones distintas/.test(p));
  const conMarcas = ['pendientes-abiertos.md', 'handoff-opus-estado-actual.md', path.join('pruebas-a33', 'MANIFIESTO.md')]
    .map((f) => [f, (DOC(f).match(/@@[A-Z0-9_]+@@/g) || [])]).filter(([, m]) => m.length);
  ok('P18-O2 ningún documento de estado contiene marcadores de evidencia sin rellenar (@@…@@)',
    conMarcas.length === 0, JSON.stringify(conMarcas));
  ok('P18-O3 el límite está dicho: la Fase 1 NO cubre un asar que Electron no puede cargar',
    /no se ejecuta ni una línea de Panorama|no se ejecuta NI UNA línea de Panorama/i.test(p) && /P18 — FASE 1 IMPLEMENTADA/.test(p));
  ok('P18-O4 ARN-3 y P23 siguen registrados', /## ARN-3 —/.test(p) && /\| P23 \| \*\*ABIERTO — MEDIO\*\*/.test(p));
}

// =============================================================================
seccion('P18-S. ¿LO QUE PRUEBA ESTA BATERÍA ES LO QUE EJECUTA main.js?');
// =============================================================================
// Sonda de vínculos: compila main.js dentro del envoltorio CommonJS, en un
// contexto vm VACÍO (sin process, require ni fs), con `return` como PRIMERA
// sentencia. Las declaraciones de función ya están instanciadas (hoisting) y no
// se ejecuta ni un require ni una línea del módulo: no inicializa el producto ni
// toca ningún archivo. Devuelve lo que V8 liga de verdad a cada nombre.
function sondaVinculos(src, nombres) {
  const cuerpo = 'return {' + nombres.map((x) => `${JSON.stringify(x)}: (function () { try { return typeof ${x} === 'function' ? ${x} : typeof ${x}; } catch (e) { return 'tdz'; } })()`).join(',\n') + '};\n';
  const envuelto = '(function (exports, require, module, __filename, __dirname) {' + cuerpo + src + '\n})';
  return new vm.Script(envuelto, { filename: 'p18-sonda-vinculos.js' }).runInContext(vm.createContext({}))(
    {}, () => { throw new Error('P18: require NO permitido en la sonda'); }, {}, MAIN, path.dirname(MAIN));
}
let DECL = null;
let errLex = null;
try { DECL = DETECTOR.declaracionesDeModulo(SRC); } catch (e) { errLex = 'el detector no pudo analizar main.js: ' + e.message; }
const cuentaEn = (decl, x) => decl.filter((d) => d.nombre === x).length;
{
  const dups = DECL ? DETECTOR.duplicados(DECL) : null;
  ok('P18-S1a main.js no declara dos veces ningún nombre a nivel de módulo (function/var): la segunda sustituiría a la primera',
    dups !== null && dups.length === 0, errLex || JSON.stringify(dups));
  ok('P18-S1b exactamente UNA declaración de módulo de sha256DeArchivo (rekey, objeto) y UNA de sha256HexArchivoP18 (P18, hex)',
    DECL !== null && cuentaEn(DECL, 'sha256DeArchivo') === 1 && cuentaEn(DECL, 'sha256HexArchivoP18') === 1,
    errLex || JSON.stringify({ rekey: cuentaEn(DECL, 'sha256DeArchivo'), p18: cuentaEn(DECL, 'sha256HexArchivoP18') }));
  // Controles del propio detector, independientes del estado de main.js.
  const base = DECL ? cuentaEn(DECL, 'sha256DeArchivo') : -1;
  const conDup = DETECTOR.declaracionesDeModulo(SRC + '\nfunction sha256DeArchivo(ruta) {\n  return 1;\n}\n');
  ok('P18-S1c control: el detector VE una `sha256DeArchivo` más añadida a nivel de módulo (la colisión del 18 sept)',
    cuentaEn(conDup, 'sha256DeArchivo') === base + 1 && DETECTOR.duplicados(conDup).some((d) => d.nombre === 'sha256DeArchivo'));
  const sinMod = DETECTOR.declaracionesDeModulo(SRC + '\nfunction __p18EnvoltorioS1__() {\n  function sha256DeArchivo(ruta) { return 1; }\n  return sha256DeArchivo;\n}\n'
    + 'const __p18PlantillaS1__ = `\nfunction sha256DeArchivo(ruta) {\n  return 1;\n}\n`;\n');
  ok('P18-S1d control: NO cuenta como de módulo ni una declaración anidada ni el texto de una plantilla (como el del ayudante)',
    cuentaEn(sinMod, 'sha256DeArchivo') === base);
  if (DECL) {
    const fnsMod = DECL.filter((d) => d.tipo === 'function');
    const nombresMod = [...new Set(fnsMod.map((d) => d.nombre))];
    const textuales = [...new Set([...SRC.matchAll(/\bfunction\s*\*?\s*([\p{L}_$][\p{L}\p{N}_$]*)\s*\(/gu)].map((m) => m[1]))];
    const soloAnidados = textuales.filter((x) => !nombresMod.includes(x));
    const v = sondaVinculos(SRC, [...nombresMod, ...soloAnidados]);
    const malMod = nombresMod.filter((x) => typeof v[x] !== 'function'
      || v[x].toString() !== DETECTOR.textoDeclaracion(SRC, fnsMod.filter((d) => d.nombre === x).pop().pos));
    const malAnid = soloAnidados.filter((x) => v[x] !== 'undefined');
    ok(`P18-S1e el detector coincide con V8: ${nombresMod.length} nombres de módulo ligados a su ÚLTIMA declaración, `
      + `${soloAnidados.length} solo anidados/en plantilla sin vínculo de módulo`,
      malMod.length === 0 && malAnid.length === 0 && soloAnidados.includes('applyPatch') && nombresMod.length > 200,
      JSON.stringify({ malMod: malMod.slice(0, 5), malAnid: malAnid.slice(0, 5) }));
  } else ok('P18-S1e el detector coincide con V8', false, errLex);
}
{
  // Todo lo que P18 usa, siguiendo las llamadas dentro de los cuerpos EFECTIVOS.
  const ENTRADAS = [...DEVOLVER, 'restaurarPredecesoraVerificada'];
  const modFns = new Set(DECL ? DECL.filter((d) => d.tipo === 'function').map((d) => d.nombre) : []);
  const V = sondaVinculos(SRC, [...modFns]);
  const cierre = new Set(ENTRADAS.filter((x) => modFns.has(x)));
  for (let cambio = true; cambio;) {
    cambio = false;
    for (const x of [...cierre]) {
      for (const m of String(V[x]).matchAll(/([\p{L}_$][\p{L}\p{N}_$]*)\s*\(/gu)) {
        if (modFns.has(m[1]) && !cierre.has(m[1])) { cierre.add(m[1]); cambio = true; }
      }
    }
  }
  // Lo que prueba el resto de la batería: la declaración que se extrae por firma (la PRIMERA).
  const probada = (x) => {
    const f = FIRMAS.find((s) => s.startsWith(`function ${x}(`));
    return f ? extraerDe(SRC, f) : DETECTOR.textoDeclaracion(SRC, DECL.find((d) => d.nombre === x && d.tipo === 'function').pos);
  };
  const sustituidas = [...cierre].filter((x) => typeof V[x] !== 'function' || V[x].toString() !== probada(x));
  ok(`P18-S2a las ${cierre.size} funciones que P18 usa son, en el módulo real, las MISMAS que prueba esta batería (ninguna sustituida por otra declaración)`,
    ENTRADAS.every((x) => cierre.has(x)) && sustituidas.length === 0, errLex || 'sustituidas: ' + sustituidas.join(', '));
  const hashes = [...cierre].filter((x) => /^sha256/i.test(x));
  nota('Hash(es) que P18 usa, según V8: ' + (hashes.join(', ') || '(ninguno)'));
  const real = { fuente: [...cierre].map((x) => String(V[x])).join('\n') + '\nlet startupRecoveryArmed = true;', devolver: [...cierre] };
  const intenta = (f) => { try { return { r: f() }; } catch (e) { return { e }; } };
  {
    const w = mundo();
    const muestra = path.join(w.raiz, 'muestra.bin');
    fs.writeFileSync(muestra, asar('9.9.9'));
    const m = intenta(() => construir(w, real));
    const res = hashes.map((h) => [h, intenta(() => m.r[h](muestra)), intenta(() => m.r[h](path.join(w.raiz, 'no-existe.bin')))]);
    ok('P18-S2b1 el hash que P18 usa, TAL COMO QUEDA LIGADO en main.js, devuelve el SHA-256 en hex y lanza si no puede leer',
      hashes.length >= 1 && res.every(([, a, b]) => a.r === sha(asar('9.9.9')) && b.e !== undefined),
      m.e ? m.e.message : JSON.stringify(res.map(([h, a, b]) => [h, a.e ? a.e.message : a.r, b.e ? 'lanza' : b.r])).slice(0, 300));
  }
  {
    const e = escenario();
    const d = intenta(() => construir(e.w, real).analizarRecuperacionAsar(e.w.asar));
    ok('P18-S2b2 en el módulo real: operación VERIFICADA y asar exacto → auto (P18-1)',
      d.r && d.r.decision === 'auto', d.e ? d.e.message : JSON.stringify(d.r && { d: d.r.decision, m: d.r.motivo }));
  }
  {
    const e = escenario({ instalado: asar('2.0.99') });
    const d = intenta(() => construir(e.w, real).analizarRecuperacionAsar(e.w.asar));
    ok('P18-S2b3 en el módulo real: asar instalado distinto → confirmar (P18-17)',
      d.r && d.r.decision === 'confirmar', d.e ? d.e.message : JSON.stringify(d.r && { d: d.r.decision, m: d.r.motivo }));
  }
  {
    const p = prepMundo();
    const r = intenta(() => construir(p.w, real).prepararOperacionAsar({ realAsar: p.w.asar, stagedAsar: p.staged, shaParcheElegido: sha(p.nueva) }));
    const op = !r.e && fs.existsSync(p.w.man) ? JSON.parse(fs.readFileSync(p.w.man, 'utf8')).operaciones[0] : null;
    ok('P18-S2b4 en el módulo real: «Aplicar parche» puede PREPARAR la operación (hashes en hex, copia local exacta)',
      !r.e && !!op && op.estado === 'preparada' && op.sha256_anterior === sha(p.vieja) && op.sha256_copia_local === sha(p.vieja)
      && op.sha256_nuevo_esperado === sha(p.nueva), r.e ? r.e.message : JSON.stringify(op).slice(0, 200));
  }
  {
    const e = escenario();
    const r = intenta(() => rescatar(e, real));
    ok('P18-S2b5 en el módulo real: el rescate restaura sola la predecesora verificada, sin PS-1008',
      !!r.r && r.r.despues === sha(e.vieja) && !r.r.t.errorBox.some((b) => /PS-1008/.test(b.c)),
      r.e ? r.e.message : JSON.stringify({ restaurada: r.r.despues === sha(e.vieja), avisos: r.r.t.errorBox.map((b) => b.t) }));
  }
}

// =============================================================================
seccion('P18-A. EL CONTRATO, LEÍDO DEL CÓDIGO');
// =============================================================================
{
  const rescate = extraerDe(SRC, 'function handleFatalStartupError(err)');
  ok('P18-A1 el camino AUTOMÁTICO ya no busca `app.asar.bak-*`: el rescate decide con analizarRecuperacionAsar()',
    /analizarRecuperacionAsar\(realAsar\)/.test(rescate) && !/findLatestAsarBackupForRecovery\(/.test(rescate));
  ok('P18-A2 las funciones heredadas quedan SOLO para soporte (describirCopiasHeredadasParaSoporte)',
    /findLatestAsarBackupForRecovery\(dir\)/.test(extraerDe(SRC, 'function describirCopiasHeredadasParaSoporte()'))
    && (SRC.match(/findLatestAsarBackupForRecovery\(/g) || []).length === 2);
  ok('P18-A3 la copia de recuperación va a %LOCALAPPDATA%\\panorama-app-recovery, no a la carpeta de datos',
    /path\.join\(base, 'panorama-app-recovery'\)/.test(SRC) && /process\.env\.LOCALAPPDATA/.test(extraerDe(SRC, 'function carpetaRecuperacionAsar()')));
  ok('P18-A4 el registro vive en %APPDATA%\\panorama-app-config\\asar-procedencia.json',
    /path\.join\(app\.getPath\('appData'\), 'panorama-app-config', 'asar-procedencia\.json'\)/.test(SRC));
  ok('P18-A5 la copia se llama `app.asar.pred-<operation_id>`: la retención heredada (`app.asar.bak-`) no la ve',
    /const nombreCopia = `app\.asar\.pred-\$\{operationId\}`;/.test(SRC) && /\.filter\(\(f\) => f\.startsWith\('app\.asar\.bak-'\)\)/.test(extraerDe(SRC, 'function purgeOldAsarBackups(dir)')));
  ok('P18-A6 ningún texto visible recomienda Restaurar-backup.bat (solo quedan comentarios)',
    !/'[^'\n]*Restaurar-backup\.bat[^'\n]*'/.test(SRC));
  ok('P18-A7 PS-1025, PS-1026 y PS-1027 están dados de alta',
    /'PS-1025': \{/.test(SRC) && /'PS-1026': \{/.test(SRC) && /'PS-1027': \{/.test(SRC));
  ok('P18-A8 PS-1007 ya no dice «la última copia que sí funcionaba»: dice VERIFICADA y dice su límite',
    /versión anterior ' \+\s*'VERIFICADA/.test(SRC) && /si el archivo ' \+\s*'está truncado, sin cabecera o no existe/.test(SRC));
  ok('P18-A9 la copia heredada se sigue creando igual (camino manual transitorio) y su retención no cambia',
    /const backupAsar = path\.join\(stageDir, `app\.asar\.bak-\$\{stamp\}`\);/.test(SRC) && /const ASAR_PATCH_BACKUP_KEEP = 2;/.test(SRC)
    && /purgeOldAsarBackups\(stageDir\);/.test(SRC));
  ok('P18-A10 el parche solo se lanza si la operación quedó PREPARADA (prepararOperacionAsar antes del spawn)',
    SRC.indexOf('operacion = prepararOperacionAsar(') > 0 && SRC.indexOf('operacion = prepararOperacionAsar(') < SRC.indexOf('operacion.operationId,'));
}

// =============================================================================
seccion('P18-B. IDENTIDAD: el installation-id de A3.3, SOLO LEÍDO');
// =============================================================================
{
  ok('P18-B1 misma ubicación que db.js: appData\\panorama-app-config\\installation-id',
    /const dirCfg = path\.join\(app\.getPath\('appData'\), 'panorama-app-config'\);/.test(DBJS) && /path\.join\(dirCfg, 'installation-id'\)/.test(DBJS)
    && /path\.join\(app\.getPath\('appData'\), 'panorama-app-config', 'installation-id'\)/.test(extraerDe(SRC, 'function rutaInstallationIdParaRescate()')));
  const e = escenario();
  const m = construir(e.w);
  ok('P18-B1b …y funcionalmente la ruta coincide con la fórmula de db.js',
    path.resolve(m.rutaInstallationIdParaRescate()) === path.resolve(path.join(path.join(e.w.appData, 'panorama-app-config'), 'installation-id')));
  ok('P18-B2 válido', m.leerInstallationIdParaRescate().estado === 'valido');
  const e2 = escenario({ id: null });
  ok('P18-B3 ausente', construir(e2.w).leerInstallationIdParaRescate().estado === 'ausente');
  const e3 = escenario({ id: 'sesion-' + 'c'.repeat(24) });
  ok('P18-B4 un id de SESIÓN se rechaza', construir(e3.w).leerInstallationIdParaRescate().estado === 'de-sesion');
  const e4 = escenario({ id: 'esto-no-es-un-id' });
  ok('P18-B5 formato inesperado → ilegible', construir(e4.w).leerInstallationIdParaRescate().estado === 'ilegible');
  const m5 = construir(e2.w);
  m5.leerInstallationIdParaRescate();
  ok('P18-B6 el lector NUNCA crea el id (ni escribe nada)', m5.traza.escrituras.length === 0 && !fs.existsSync(path.join(e2.w.cfg, 'installation-id')));
  for (const [n, esc] of [['ausente', e2], ['de sesión', e3], ['ilegible', e4]]) {
    ok(`P18-B7 identidad ${n} → NO hay recuperación automática`, decidir(esc).decision === 'no');
  }
}

// =============================================================================
seccion('P18-C. LA DECISIÓN: los casos del encargo');
// =============================================================================
{
  const e1 = escenario();
  const d1 = decidir(e1);
  ok('P18-1 copia LOCAL + registro correcto → candidata válida (auto)', d1.decision === 'auto', JSON.stringify(d1));
  ok('P18-7 VERIFICADA → sí candidata', d1.operacion && d1.operacion.estado === 'verificada');

  const e2 = escenario({ sinManifiesto: true, location: true, heredadas: [['comp', 'app.asar.bak-2026-09-12T21-29-05-730Z', '2.0.54']] });
  ok('P18-2 copia en la carpeta COMPARTIDA, aunque tenga la versión correcta → NO candidata', decidir(e2).decision === 'no');

  const e3 = escenario({ ops: [{ campos: { installation_id: ID_OTRO } }] });
  ok('P18-3 / G operación de OTRO installation_id → NO candidata', decidir(e3).decision === 'no');

  const e4 = escenario({ ops: [{ campos: { sha256_anterior: 'f'.repeat(64), sha256_copia_local: 'f'.repeat(64) } }] });
  ok('P18-4 sha256_anterior incorrecto → NO candidata', decidir(e4).decision === 'no');

  const e5 = escenario({ instalado: asar('2.0.99') });
  ok('P18-5 el asar instalado no es el sha256_nuevo_real → NO es candidata AUTOMÁTICA', decidir(e5).decision !== 'auto');

  const e6 = escenario({ ops: [{ campos: { estado: 'preparada', sha256_nuevo_real: null, verificada_at: null } }] });
  ok('P18-6 / B PREPARADA → NO candidata', decidir(e6).decision === 'no');

  const e8a = escenario({ ops: [{}, {}] });
  const d8a = decidir(e8a);
  ok('P18-8 / F dos candidatas que corresponden al instalado → fail-closed (no gana «la más reciente»)',
    d8a.decision === 'no' && /ambig/.test(d8a.motivo), d8a.motivo);
  const e8b = escenario({ instalado: asar('2.0.99'), ops: [{}, {}] });
  ok('P18-8b dos candidatas y ninguna corresponde al instalado → tampoco se pregunta: fail-closed',
    decidir(e8b).decision === 'no');

  const e9 = escenario({ ops: [{ copia: asar('2.0.54').slice(0, 40) }] });
  ok('P18-9 / D copia TRUNCADA → el hash falla → fail-closed', decidir(e9).decision === 'no');

  const e10 = escenario({ manifiestoCrudo: '{"v":1,"installation_id":"' + ID + '","operaciones":[{"operation_id":"ab' });
  const d10 = decidir(e10);
  ok('P18-10 / E registro TRUNCADO → fail-closed, y distinguible (ilegible)', d10.decision === 'no' && d10.manifiesto === 'ilegible');

  const e11 = escenario({ sinManifiesto: true, location: true, heredadas: [['comp', 'app.asar.bak-2026-09-12T21-29-05-730Z', '2.0.54'], ['def', 'app.asar.bak-2026-08-26T19-19-35-247Z', '0.1.28']] });
  ok('P18-11 sin registro → los `.bak` históricos NO se usan', decidir(e11).decision === 'no');

  const e12 = escenario({ location: 'ausente' });
  ok('P18-12 Drive AUSENTE → la predecesora LOCAL sigue disponible (auto)', decidir(e12).decision === 'auto');

  const e13 = escenario({ sinManifiesto: true, heredadas: [['def', 'app.asar.bak-2026-08-26T19-19-35-247Z', '0.1.28']] });
  ok('P18-13 P10 con la v0.1.28 → nunca candidata automática', decidir(e13).decision === 'no');

  const e14 = escenario({ ops: [{ campos: { estado: 'fallida', motivo_fallo: 'x' } }], location: true, heredadas: [['comp', 'app.asar.bak-2026-09-30T08-00-00-000Z', '2.0.99']] });
  ok('P18-14 compartida con una copia MÁS NUEVA → nunca candidata automática', decidir(e14).decision === 'no');

  const eA = escenario({ sinManifiesto: true });
  ok('A copia local SIN entrada en el registro → no candidata', fs.readdirSync(eA.w.rec).length === 1 && decidir(eA).decision === 'no');

  const eH = escenario({ ops: [{ copia: null }] });
  ok('H registro con la operación, pero SIN la copia local → fail-closed', decidir(eH).decision === 'no');

  const eI = escenario({ ops: [{ campos: { sha256_nuevo_real: null } }] });
  eI.ops[0].sha256_nuevo_real = eI.ops[0].sha256_anterior;
  fs.writeFileSync(eI.w.man, JSON.stringify({ v: 1, installation_id: ID, operaciones: eI.ops }), 'utf8');
  fs.writeFileSync(eI.w.asar, eI.vieja);
  ok('I anterior == nuevo (reaplicar lo mismo) → no es una relación útil de rescate', decidir(eI).decision === 'no');

  const eL = escenario();
  ok('P18-C1 sin LOCALAPPDATA no hay dónde buscar la copia → fail-closed', decidir(eL, { localAppData: '' }).decision === 'no');

  const eX = escenario({ ops: [{ campos: { nombre_copia: '..\\..\\resources\\app.asar' } }] });
  ok('P18-C2 un nombre de copia con ruta (fuera de la carpeta de recuperación) se rechaza', decidir(eX).decision === 'no');

  const mD = construir(e1.w);
  mD.analizarRecuperacionAsar(e1.w.asar);
  ok('P18-C3 decidir NO escribe nada', mD.traza.escrituras.length === 0, JSON.stringify(mD.traza.escrituras));
}

// =============================================================================
seccion('P18-D. EL RESCATE COMPLETO (handleFatalStartupError), en sandbox');
// =============================================================================
{
  const e = escenario();
  const r = rescatar(e);
  ok('P18-D1 auto: el asar instalado pasa a ser EXACTAMENTE la predecesora verificada',
    r.despues === sha(e.vieja) && r.antes === sha(e.nueva));
  ok('P18-D2 auto: guarda el roto como `app.asar.broken-<fecha>` (igual que antes)', r.broken.length === 1);
  ok('P18-D3 auto: el aviso nombra la versión restaurada y dice que la guardó este equipo',
    /versión 2\.0\.54/.test(r.t.errorBox[0].c) && /este mismo equipo/.test(r.t.errorBox[0].c) && /PS-1007/.test(r.t.errorBox[0].c));
  ok('P18-D4 auto: no pregunta nada, y sale con app.exit(1)', r.t.mensajes.length === 0 && r.t.exit[0] === 1);

  const e15 = escenario({ ops: [{ campos: { estado: 'preparada', sha256_nuevo_real: null } }] });
  const r15 = rescatar(e15);
  ok('P18-15 PREPARADA → el rescate NO restaura (asar intacto, sin roto guardado)', r15.despues === r15.antes && r15.broken.length === 0);

  const e16 = escenario({ ops: [{ campos: { estado: 'fallida', motivo_fallo: 'el app.asar instalado no tiene el hash esperado' } }] });
  const r16 = rescatar(e16);
  ok('P18-16 FALLIDA → el rescate NO restaura', r16.despues === r16.antes && r16.broken.length === 0);

  const e17 = escenario({ instalado: asar('2.0.99') });
  const r17 = rescatar(e17, { respuestaDialogo: 1 });
  const o17 = r17.t.mensajes[0] || {};
  ok('P18-17 hash actual distinto → NO se restaura sola: se PREGUNTA', r17.t.mensajes.length === 1);
  ok('P18-17b …con el texto pedido, Cerrar primero y predeterminado, y Esc/X = Cerrar',
    o17.message === 'El archivo actual no coincide con la instalación verificada.'
    && JSON.stringify(o17.buttons) === '["Cerrar","Restaurar la versión anterior verificada"]'
    && o17.defaultId === 0 && o17.cancelId === 0 && /PS-1027/.test(o17.detail), JSON.stringify({ b: o17.buttons, d: o17.defaultId, c: o17.cancelId }));
  ok('P18-17c …y solo con la elección EXPLÍCITA se restaura la predecesora verificada', r17.despues === sha(e17.vieja));

  const e18 = escenario({ instalado: asar('2.0.99') });
  const r18 = rescatar(e18, { respuestaDialogo: (o) => o.cancelId });
  ok('P18-18 Esc/X en la confirmación → NO se restaura nada', r18.despues === r18.antes && r18.broken.length === 0);

  const e18b = escenario({ instalado: asar('2.0.99') });
  const r18b = rescatar(e18b, { dialogoLanza: true });
  ok('P18-18b si la confirmación no se puede mostrar → NO se restaura (preguntar es la condición)',
    r18b.despues === r18b.antes && r18b.broken.length === 0);

  const eIl = escenario();
  fs.unlinkSync(eIl.w.asar);
  const rIl = rescatar(eIl, { respuestaDialogo: (o) => o.cancelId });
  ok('P18-17d asar instalado ILEGIBLE (no está) + una predecesora → misma política: solo con confirmación',
    rIl.t.mensajes.length === 1 && !fs.existsSync(eIl.w.asar));

  const e19 = escenario({ sinManifiesto: true, location: true, heredadas: [['comp', 'app.asar.bak-2026-09-12T21-29-05-730Z', '2.0.54'], ['def', 'app.asar.bak-2026-08-26T19-19-35-247Z', '0.1.28']] });
  const r19 = rescatar(e19);
  ok('P18-19 sin copia verificable → los `.bak` heredados NUNCA se seleccionan (asar intacto)',
    r19.despues === r19.antes && r19.broken.length === 0);
  const txt19 = (r19.t.errorBox[0] || {}).c || '';
  ok('P18-19b …se informa y se cierra (PS-1025), remitiendo a reinstalación/parche soportado',
    /PS-1025/.test(txt19) && /Reinstala Panorama del Servicio/.test(txt19) && r19.t.exit[0] === 1);
  ok('P18-19c …y SIN recomendar Restaurar-backup.bat', !/Restaurar-backup/i.test(txt19));
  const log19 = fs.existsSync(path.join(e19.w.def, 'app.log')) ? fs.readFileSync(path.join(e19.w.def, 'app.log'), 'utf8') : '';
  ok('P18-19d el registro SÍ cuenta las copias heredadas, para soporte, diciendo que no se usan',
    /copias heredadas app\.asar\.bak-\*: 1/.test(log19) && /NO se usan/.test(log19), log19.slice(-300));

  const eMr = escenario({ manifiestoCrudo: '{"v":1,"operaciones":[{"est' });
  const rMr = rescatar(eMr);
  ok('P18-D5 registro roto → PS-1026 (distinguible de «no hay nada»), asar intacto',
    /PS-1026/.test((rMr.t.errorBox[0] || {}).c || '') && rMr.despues === rMr.antes);
  ok('P18-D6 …y el registro roto NO se toca', fs.readFileSync(eMr.w.man, 'utf8') === '{"v":1,"operaciones":[{"est');

  const eN = escenario({ sinManifiesto: true });
  const rN = rescatar(eN);
  ok('P18-D7 ninguna escritura del rescate cae fuera del sandbox, y sin restauración no toca la instalación',
    rN.t.escrituras.every((x) => !/resources/.test(x)), JSON.stringify(rN.t.escrituras));
}

// =============================================================================
seccion('P18-E. PREPARAR LA OPERACIÓN (antes de tocar el asar real)');
// =============================================================================
function prepMundo(o = {}) {
  const w = mundo();
  if (o.id !== null) fs.writeFileSync(path.join(w.cfg, 'installation-id'), o.id || ID, 'utf8');
  const vieja = asar('2.0.54'), nueva = asar(o.vNueva || '2.0.55');
  fs.writeFileSync(w.asar, vieja);
  const staged = path.join(w.def, 'patch-pending-x.asar');
  fs.writeFileSync(staged, o.stagedContenido || nueva);
  return { w, vieja, nueva, staged };
}
{
  const p = prepMundo();
  const m = construir(p.w);
  const r = m.prepararOperacionAsar({ realAsar: p.w.asar, stagedAsar: p.staged, shaParcheElegido: sha(p.nueva) });
  const j = JSON.parse(fs.readFileSync(p.w.man, 'utf8'));
  const op = j.operaciones[0] || {};
  ok('P18-E1 crea la copia LOCAL con el nombre ligado al operation_id', /^[0-9a-f]{16}$/.test(r.operationId)
    && fs.existsSync(path.join(p.w.rec, `app.asar.pred-${r.operationId}`)));
  ok('P18-E2 la copia es EXACTAMENTE el asar instalado', shaF(path.join(p.w.rec, `app.asar.pred-${r.operationId}`)) === sha(p.vieja));
  const CAMPOS = ['operation_id', 'installation_id', 'estado', 'sha256_anterior', 'version_anterior', 'nombre_copia',
    'sha256_copia_local', 'sha256_nuevo_esperado', 'version_nueva_esperada', 'sha256_nuevo_real', 'creada_at',
    'verificada_at', 'motivo_fallo'];
  ok('P18-E3 la entrada tiene TODOS los campos pedidos', CAMPOS.every((c) => c in op), JSON.stringify(Object.keys(op)));
  ok('P18-E4 …en estado PREPARADA, con este installation_id y sin nuevo_real todavía',
    op.estado === 'preparada' && op.installation_id === ID && op.sha256_nuevo_real === null && op.verificada_at === null);
  ok('P18-E5 hashes y versiones correctos (versión leída de la cabecera, sin ejecutar)',
    op.sha256_anterior === sha(p.vieja) && op.sha256_copia_local === sha(p.vieja) && op.sha256_nuevo_esperado === sha(p.nueva)
    && op.version_anterior === '2.0.54' && op.version_nueva_esperada === '2.0.55');
  const crudo = fs.readFileSync(p.w.man, 'utf8');
  ok('P18-E6 el registro NO guarda rutas absolutas', !/[A-Za-z]:\\\\|[A-Za-z]:\\|\/Users\//.test(crudo) && !crudo.includes(SB));
  ok('P18-E7 el asar instalado NO se ha tocado al preparar', shaF(p.w.asar) === sha(p.vieja));
  ok('P18-E8 escritura atómica: no quedan temporales', !fs.readdirSync(p.w.cfg).some((f) => /\.tmp-/.test(f)));

  // Fallos: nada utilizable queda, y quien llama NO debe aplicar el parche.
  const casosFallo = [
    ['identidad ausente', prepMundo({ id: null }), {}],
    ['identidad de sesión', prepMundo({ id: 'sesion-' + 'd'.repeat(24) }), {}],
    ['la copia preparada del parche no es el archivo elegido', prepMundo({ stagedContenido: asar('2.0.77') }), {}],
  ];
  for (const [n, pm] of casosFallo) {
    let lanzo = false;
    try { construir(pm.w).prepararOperacionAsar({ realAsar: pm.w.asar, stagedAsar: pm.staged, shaParcheElegido: sha(pm.nueva) }); } catch (e) { lanzo = true; }
    const copias = fs.existsSync(pm.w.rec) ? fs.readdirSync(pm.w.rec).length : 0;
    ok(`P18-E9 ${n} → LANZA (no se aplica el parche), sin copia ni entrada`, lanzo && copias === 0 && !fs.existsSync(pm.w.man));
  }
  const pRoto = prepMundo();
  fs.writeFileSync(pRoto.w.man, '{"v":1,"operac', 'utf8');
  let lanzoRoto = false;
  try { construir(pRoto.w).prepararOperacionAsar({ realAsar: pRoto.w.asar, stagedAsar: pRoto.staged, shaParcheElegido: sha(pRoto.nueva) }); } catch (e) { lanzoRoto = true; }
  ok('P18-E10 registro ilegible → LANZA y NO lo pisa', lanzoRoto && fs.readFileSync(pRoto.w.man, 'utf8') === '{"v":1,"operac');

  const pIgual = prepMundo({ stagedContenido: asar('2.0.54') });
  let errIgual = null;
  try { construir(pIgual.w).prepararOperacionAsar({ realAsar: pIgual.w.asar, stagedAsar: pIgual.staged, shaParcheElegido: sha(asar('2.0.54')) }); } catch (e) { errIgual = e; }
  ok('P18-E11 / I parche idéntico al instalado → no crea relación de rescate (y lo dice como tal)',
    errIgual && errIgual.p18Identico === true && !fs.existsSync(pIgual.w.man));

  const pCopia = prepMundo();
  fs.writeFileSync(path.join(pCopia.w.local, 'panorama-app-recovery'), 'soy un archivo, no una carpeta');
  let lanzoCopia = false;
  try { construir(pCopia.w).prepararOperacionAsar({ realAsar: pCopia.w.asar, stagedAsar: pCopia.staged, shaParcheElegido: sha(pCopia.nueva) }); } catch (e) { lanzoCopia = true; }
  ok('P18-E12 no se puede crear la copia local → LANZA, sin entrada', lanzoCopia && !fs.existsSync(pCopia.w.man));

  const pMan = prepMundo();
  fs.mkdirSync(pMan.w.man, { recursive: true }); // el registro es una CARPETA: no se puede escribir
  let lanzoMan = false;
  try { construir(pMan.w).prepararOperacionAsar({ realAsar: pMan.w.asar, stagedAsar: pMan.staged, shaParcheElegido: sha(pMan.nueva) }); } catch (e) { lanzoMan = true; }
  ok('P18-E13 no se puede escribir el registro → LANZA y la copia a medias se QUITA',
    lanzoMan && (!fs.existsSync(pMan.w.rec) || fs.readdirSync(pMan.w.rec).length === 0));

  const pPrev = prepMundo();
  const mPrev = construir(pPrev.w);
  mPrev.prepararOperacionAsar({ realAsar: pPrev.w.asar, stagedAsar: pPrev.staged, shaParcheElegido: sha(pPrev.nueva) });
  const primera = JSON.parse(fs.readFileSync(pPrev.w.man, 'utf8')).operaciones[0];
  fs.writeFileSync(pPrev.staged, asar('2.0.56'));
  mPrev.prepararOperacionAsar({ realAsar: pPrev.w.asar, stagedAsar: pPrev.staged, shaParcheElegido: sha(asar('2.0.56')) });
  const j2 = JSON.parse(fs.readFileSync(pPrev.w.man, 'utf8'));
  ok('P18-E14 preparar una operación nueva NO borra las anteriores (nunca borrar primero)',
    j2.operaciones.length === 2 && j2.operaciones[0].operation_id === primera.operation_id
    && fs.existsSync(path.join(pPrev.w.rec, primera.nombre_copia)));
}

// =============================================================================
seccion('P18-F. EL AYUDANTE REAL (plantilla de main.js), ejecutado en sandbox');
// =============================================================================
const HELPER_SRC = construir(mundo()).asarPatchHelperSource();
ok('P18-F0 aislamiento del ayudante POR CONSTRUCCIÓN: no llama a getPath ni lee APPDATA/LOCALAPPDATA',
  !/getPath|APPDATA|LOCALAPPDATA|require\('electron'\)/.test(HELPER_SRC));
nota('Solo toca las rutas que recibe por argumento: aquí, todas dentro del sandbox.');
// Bajo node del sistema no existe `original-fs`: se le da uno que es `fs`
// (sin el parcheo de asar de Electron, `fs` ya se comporta como original-fs).
const NM = path.join(SB, 'node_modules', 'original-fs');
fs.mkdirSync(NM, { recursive: true });
fs.writeFileSync(path.join(NM, 'index.js'), "module.exports = require('fs');\n");
function pidMuerto() { const r = spawnSync(process.execPath, ['-e', '0']); return r.pid; }

// Deja un mundo en estado «app cerrada, operación PREPARADA» y ejecuta el ayudante.
function ayudante({ previa, estropearCopia, esperadoFalso, estadoOp, sinArgs } = {}) {
  const p = prepMundo();
  const m = construir(p.w);
  let anterior = null;
  if (previa) {
    // Una operación VERIFICADA anterior (predecesora de lo instalado AHORA).
    const vAntes = asar('2.0.53');
    const opIdPrev = 'c'.repeat(16);
    fs.mkdirSync(p.w.rec, { recursive: true });
    fs.writeFileSync(path.join(p.w.rec, `app.asar.pred-${opIdPrev}`), vAntes);
    anterior = { operation_id: opIdPrev, installation_id: ID, estado: 'verificada', sha256_anterior: sha(vAntes), version_anterior: '2.0.53',
      nombre_copia: `app.asar.pred-${opIdPrev}`, sha256_copia_local: sha(vAntes), sha256_nuevo_esperado: sha(p.vieja),
      version_nueva_esperada: '2.0.54', sha256_nuevo_real: sha(p.vieja), creada_at: 'x', verificada_at: 'x', motivo_fallo: null };
    fs.writeFileSync(p.w.man, JSON.stringify({ v: 1, installation_id: ID, operaciones: [anterior] }), 'utf8');
    fs.writeFileSync(path.join(p.w.rec, 'app.asar.pred-' + 'e'.repeat(16)), 'huérfana'); // copia sin entrada
  }
  const r = m.prepararOperacionAsar({ realAsar: p.w.asar, stagedAsar: p.staged, shaParcheElegido: sha(p.nueva) });
  if (esperadoFalso || estadoOp) {
    const j = JSON.parse(fs.readFileSync(p.w.man, 'utf8'));
    const op = j.operaciones.find((o) => o.operation_id === r.operationId);
    if (esperadoFalso) op.sha256_nuevo_esperado = 'f'.repeat(64);
    if (estadoOp) op.estado = estadoOp;
    fs.writeFileSync(p.w.man, JSON.stringify(j), 'utf8');
  }
  if (estropearCopia) fs.writeFileSync(r.copia, 'estropeada');
  const dirH = path.join(p.w.raiz, 'helper');
  fs.mkdirSync(dirH, { recursive: true });
  const helper = path.join(dirH, 'apply-patch-helper.js');
  fs.writeFileSync(helper, HELPER_SRC, 'utf8');
  const legacy = path.join(p.w.def, 'app.asar.bak-2026-09-18T00-00-00-000Z');
  fs.writeFileSync(legacy, p.vieja);
  const logPath = path.join(p.w.def, 'patch-log.txt');
  const args = [helper, String(pidMuerto()), legacy, p.w.asar, p.staged, logPath, ''];
  if (!sinArgs) args.push(p.w.man, r.operationId, r.copia);
  // NODE_PATH vacío y cwd en el sandbox: `original-fs` se resuelve por el node_modules del sandbox.
  const res = spawnSync(process.execPath, args, { cwd: SB, encoding: 'utf8', timeout: 30000, env: Object.assign({}, process.env, { NODE_PATH: path.join(SB, 'node_modules') }) });
  const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '';
  const j = fs.existsSync(p.w.man) ? JSON.parse(fs.readFileSync(p.w.man, 'utf8')) : null;
  const op = j && j.operaciones.find((o) => o.operation_id === r.operationId);
  return { p, r, res, log, j, op, anterior, instalado: shaF(p.w.asar) };
}
{
  const h = ayudante();
  ok('P18-F1 el ayudante aplica el parche y lo VERIFICA releyendo el asar real y la copia',
    h.op && h.op.estado === 'verificada' && h.op.sha256_nuevo_real === sha(h.p.nueva) && h.instalado === sha(h.p.nueva), h.log.slice(-400) + (h.res.stderr || ''));
  ok('P18-F2 …y deja dicho que el hash correcto NO prueba que la app vaya a arrancar',
    /Eso no prueba que la app vaya a arrancar bien/.test(h.log));
  ok('P18-F3 …tras verificar, la operación ya es candidata automática para el rescate',
    construir(h.p.w).analizarRecuperacionAsar(h.p.w.asar).decision === 'auto');

  const h20 = ayudante({ previa: true });
  ok('P18-20 actualización nueva VERIFICADA → la anterior se retira, y queda SOLO la predecesora del instalado',
    h20.op && h20.op.estado === 'verificada' && h20.j.operaciones.length === 1
    && !fs.existsSync(path.join(h20.p.w.rec, h20.anterior.nombre_copia)) && fs.existsSync(h20.r.copia), h20.log.slice(-300));
  ok('P18-20b …y también se recogen las copias huérfanas (sin entrada)',
    !fs.existsSync(path.join(h20.p.w.rec, 'app.asar.pred-' + 'e'.repeat(16))));

  const hF = ayudante({ previa: true, esperadoFalso: true });
  ok('P18-20c / C si la nueva NO se verifica → FALLIDA, y la anterior NO se retira (nunca borrar primero)',
    hF.op && hF.op.estado === 'fallida' && hF.j.operaciones.length === 2 && fs.existsSync(path.join(hF.p.w.rec, hF.anterior.nombre_copia)));
  ok('P18-F4 FALLIDA conserva su copia local y deja el motivo saneado (sin rutas)',
    fs.existsSync(hF.r.copia) && typeof hF.op.motivo_fallo === 'string' && !/[A-Za-z]:\\/.test(hF.op.motivo_fallo));
  ok('P18-F5 FALLIDA → no se reabre la app (el asar puede no ser el esperado)', /No se reabre la app/.test(hF.log));
  const dF = construir(hF.p.w).analizarRecuperacionAsar(hF.p.w.asar);
  ok('P18-F6 …y la operación FALLIDA nunca es la elegida (ni en automático ni para preguntar)',
    !dF.operacion || dF.operacion.operation_id !== hF.r.operationId, JSON.stringify({ d: dF.decision, op: dF.operacion && dF.operacion.operation_id }));
  ok('P18-F6b …lo que queda es la anterior VERIFICADA, y solo con confirmación: el instalado ya no es el suyo',
    dF.decision === 'confirmar' && dF.operacion && dF.operacion.operation_id === hF.anterior.operation_id);

  const hC = ayudante({ estropearCopia: true });
  ok('P18-F7 la copia local se estropea antes de verificar → FALLIDA con su motivo',
    hC.op && hC.op.estado === 'fallida' && /copia local/.test(hC.op.motivo_fallo));

  const hV = ayudante({ estadoOp: 'verificada' });
  ok('P18-F8 si la operación no está PREPARADA, el ayudante NO aplica el parche',
    hV.instalado === sha(hV.p.vieja) && /no está PREPARADA/.test(hV.log));
  const hS = ayudante({ sinArgs: true });
  ok('P18-F9 sin los datos de la operación, el ayudante NO aplica el parche',
    hS.instalado === sha(hS.p.vieja) && /faltan los datos de la operación/.test(hS.log));
}

// =============================================================================
seccion('P18-G. LO QUE NO CAMBIA (y por qué el .bat no se recomienda)');
// =============================================================================
{
  ok('P18-G1 la retención heredada sigue igual: 2 copias, por mtime', /files\.slice\(ASAR_PATCH_BACKUP_KEEP\)/.test(SRC)
    && /statSync\(path\.join\(dir, f\)\)\.mtimeMs/.test(extraerDe(SRC, 'function purgeOldAsarBackups(dir)')));
  ok('P18-G2 el .bat sigue eligiendo por NOMBRE, sin versión ni equipo: por eso NO se recomienda',
    /dir \/b \/o-n "%DATA_DIR%\\app\.asar\.bak-\*"/.test(BAT) && !/version|installation/i.test(BAT));
  // Evidencia del diagnóstico, que sigue valiendo (el .bat no ha cambiado).
  const raiz = path.join(SB, 'bat');
  const res = path.join(raiz, 'resources'), roam = path.join(raiz, 'Roaming');
  const def = path.join(roam, 'panorama-app'), cfg = path.join(roam, 'panorama-app-config'), comp = path.join(raiz, 'G', 'BD');
  [res, def, cfg, comp].forEach((d) => fs.mkdirSync(d, { recursive: true }));
  fs.writeFileSync(path.join(comp, 'app.asar.bak-2026-09-12T21-29-05-730Z'), asar('2.0.54'));
  fs.writeFileSync(path.join(def, 'app.asar.bak-2026-08-26T19-19-35-247Z'), asar('0.1.28'));
  fs.writeFileSync(path.join(res, 'Restaurar-backup.bat'), BAT, 'latin1');
  const correr = (loc) => {
    fs.writeFileSync(path.join(res, 'app.asar'), asar('2.0.55'));
    fs.writeFileSync(path.join(cfg, 'location.json'), loc, 'utf8');
    // cmd.exe SÍ lee %APPDATA% de la variable (no es Electron): aquí el aislamiento por variable es efectivo.
    try { execFileSync('cmd.exe', ['/c', path.join(res, 'Restaurar-backup.bat'), '<', 'NUL'], { env: Object.assign({}, process.env, { APPDATA: roam }), encoding: 'latin1', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'], shell: true }); } catch (e) { /* pause */ }
    const b = fs.readFileSync(path.join(res, 'app.asar'));
    try { return JSON.parse(b.slice(8 + b.readUInt32LE(4), 8 + b.readUInt32LE(4) + 200).toString('utf8').split('}')[0] + '}').version; } catch (e) { return null; }
  };
  ok('P18-G3 [EJECUTADO] el mismo location.json en UNA línea lleva al .bat a restaurar la v0.1.28 de la carpeta por defecto',
    correr(JSON.stringify({ userDataDir: comp, shared: true })) === '0.1.28');
}

// =============================================================================
// P18-P. «APLICAR PARCHE»: UN INTENTO QUE NO SE APLICA NO TOCA LA RETENCIÓN HEREDADA
// =============================================================================
// Se ejecuta el applyAsarPatch REAL (async), con sus funciones reales de P18 y
// de retención, en un sandbox explícito y con fallos inyectados en fs/spawn.
// Hasta el 18 sept 2026 la copia heredada y su purga iban ANTES de preparar
// P18: un intento que fallaba en P18 creaba un .bak y retiraba el más antiguo
// de la carpeta de datos (compartida), y dos intentos seguidos borraban la
// predecesora manual. Reversión K = ese orden antiguo.
const HEREDADAS_P = [['app.asar.bak-2026-09-12T20-11-51-730Z', '2.0.53', 2], ['app.asar.bak-2026-09-12T21-29-05-730Z', '2.0.54', 1]];
const KEEP_P = (SRC.match(/^const ASAR_PATCH_BACKUP_KEEP = \d+;$/m) || ['const ASAR_PATCH_BACKUP_KEEP = 2;'])[0];
let FUENTE_PARCHE = '';
try { FUENTE_PARCHE = extraerDe(SRC, 'async function applyAsarPatch(parentWin)'); } catch (e) { /* P18-P0 lo dirá */ }
function mundoParche(o = {}) {
  const w = mundo();
  if (o.id !== null) fs.writeFileSync(path.join(w.cfg, 'installation-id'), o.id === undefined ? ID : o.id, 'utf8');
  fs.writeFileSync(w.asar, asar('2.0.55'));
  const ahora = Date.now();
  for (const [nombre, v, dias] of HEREDADAS_P) {
    const p = path.join(w.def, nombre);
    fs.writeFileSync(p, asar(v));
    const t = new Date(ahora - dias * 86400000);
    fs.utimesSync(p, t, t);
  }
  const parche = asar('2.0.56');
  fs.mkdirSync(path.join(w.raiz, 'Descargas'), { recursive: true });
  w.parche = path.join(w.raiz, 'Descargas', `${sha(parche).slice(0, 16)}-App0256.asar`);
  fs.writeFileSync(w.parche, parche);
  return w;
}
function construirParche(w, fallos) {
  const traza = { spawn: [], avisos: [], escrituras: [] };
  const base = fsGuardado(fs, traza.escrituras);
  const err = (code, m) => Object.assign(new Error(`${code}: ${m} (simulado)`), { code });
  const bn = (p) => path.basename(String(p));
  const bajo = (p, dir) => path.resolve(String(p)).toLowerCase().startsWith(path.resolve(dir).toLowerCase() + path.sep);
  const aMedias = (origen, destino, n) => {
    if (!dentro(destino)) throw new Error('P18: escritura FUERA del sandbox: ' + destino);
    fs.writeFileSync(destino, fs.readFileSync(origen).slice(0, n));
  };
  let registroEscrito = false;
  const f = new Proxy(base, {
    get(t, k) {
      const v = t[k];
      if (typeof v !== 'function') return v;
      return (...a) => {
        if (k === 'copyFileSync') {
          if (fallos.stagedParcial && bn(a[1]).startsWith('patch-pending-')) { aMedias(a[0], a[1], 30); throw err('EIO', 'copia del patch-pending'); }
          if (fallos.copiaLocal && bajo(a[1], w.rec)) throw err('EACCES', 'copia local de P18');
          if (fallos.hashCopia && bajo(a[1], w.rec)) { aMedias(a[0], a[1], 40); return undefined; }
          if (fallos.bakParcial && bn(a[1]).startsWith('app.asar.bak-')) { aMedias(a[0], a[1], 30); throw err('EIO', 'copia heredada'); }
        }
        if (k === 'renameSync' && fallos.registro && path.resolve(String(a[1])) === path.resolve(w.man)) throw err('EPERM', 'registro de procedencia');
        if (k === 'writeFileSync' && fallos.ayudante && bn(a[0]) === 'apply-patch-helper.js') throw err('ENOSPC', 'ayudante');
        const r = v.apply(t, a);
        if (k === 'renameSync' && path.resolve(String(a[1])) === path.resolve(w.man)) registroEscrito = true;
        if (k === 'readFileSync' && fallos.relectura && registroEscrito && path.resolve(String(a[0])) === path.resolve(w.man)) return String(r) + ' ';
        return r;
      };
    },
  });
  const app = { isPackaged: true, quit() {}, getPath: (k) => (k === 'appData' ? w.appData : k === 'userData' ? w.def : os.tmpdir()) };
  const proc = { platform: 'win32', pid: process.pid, execPath: path.join(w.raiz, 'no-existe', 'electron.exe'), env: { LOCALAPPDATA: w.local }, resourcesPath: w.res };
  const spawn = (exe, args) => { traza.spawn.push(args); if (fallos.spawn) throw new Error('spawn falla (simulado)'); return { unref() {} }; };
  const modalAlert = async (win, texto, o) => { traza.avisos.push((((String(texto).match(/PS-\d{4}/) || [''])[0]) + ' ' + ((o && o.title) || '')).trim()); };
  const cuerpoParche = FUENTE_PARCHE || 'async function applyAsarPatch() { throw new Error("applyAsarPatch no encontrada en main.js"); }';
  const m = new Function('app', 'fs', 'originalFs', 'path', 'crypto', 'dialog', 'process', 'spawn', 'modalAlert', 'modalConfirm',
    'canWriteToAsarFolder', 'installDirPath', 'errorCodeSuffix', 'setTimeout',
    FUENTE + '\n' + KEEP_P + '\n' + cuerpoParche + '\nreturn { applyAsarPatch };')(
    app, f, f, path, crypto, { showOpenDialogSync: () => [w.parche] }, proc, spawn, modalAlert, async () => true,
    () => true, () => w.res, (c) => ` (código ${c})`, () => {});
  return { m, traza };
}
async function intentoParche(w, fallos = {}) {
  const { m, traza } = construirParche(w, fallos);
  let error = null;
  try { await m.applyAsarPatch(null); } catch (e) { error = e.message; }
  const enDatos = fs.readdirSync(w.def);
  const baks = enDatos.filter((x) => x.startsWith('app.asar.bak-'));
  const iniciales = HEREDADAS_P.map(([nombre]) => nombre);
  let ops = [];
  try { ops = JSON.parse(fs.readFileSync(w.man, 'utf8').trim()).operaciones || []; } catch (e) { ops = []; }
  let decision;
  try { decision = construir(w).analizarRecuperacionAsar(w.asar).decision; } catch (e) { decision = 'error: ' + e.message; }
  return {
    quedanIniciales: iniciales.filter((b) => baks.includes(b)).length, v2054: baks.includes(HEREDADAS_P[1][0]),
    nuevos: baks.filter((b) => !iniciales.includes(b)), staged: enDatos.filter((x) => x.startsWith('patch-pending-')).length,
    ops, spawn: traza.spawn, avisos: traza.avisos.join(' | '), instalado: shaF(w.asar), decision, error,
  };
}
const espera = (ms) => new Promise((res) => setTimeout(res, ms));
async function seccionParche() {
  seccion('P18-P. «APLICAR PARCHE»: UN INTENTO QUE NO SE APLICA NO TOCA LA RETENCIÓN HEREDADA');
  let efectiva = null;
  try { efectiva = sondaVinculos(SRC, ['applyAsarPatch']).applyAsarPatch; } catch (e) { /* abajo */ }
  ok('P18-P0 la applyAsarPatch que se ejecuta aquí es la que liga main.js (V8)',
    !!FUENTE_PARCHE && typeof efectiva === 'function' && efectiva.toString() === FUENTE_PARCHE);
  const inicial = sha(asar('2.0.55'));
  const resumen = (r) => JSON.stringify({ quedan: r.quedanIniciales, nuevos: r.nuevos.length, staged: r.staged, spawn: r.spawn.length,
    ops: r.ops.map((o) => o.estado), decision: r.decision, avisos: r.avisos, error: r.error });
  for (const [cod, que, fallos, om] of [
    ['PA', 'falla la copia local de P18', { copiaLocal: true }, {}],
    ['PB', 'falla el hash de la copia local (queda truncada)', { hashCopia: true }, {}],
    ['PC1', 'falla escribir el registro de procedencia', { registro: true }, {}],
    ['PC2', 'falla la relectura del registro de procedencia', { relectura: true }, {}],
    ['PD1', 'installation-id ausente', {}, { id: null }],
    ['PD2', 'installation-id de sesión', {}, { id: 'sesion-' + 'd'.repeat(24) }],
    ['PD3', 'installation-id con formato inválido', {}, { id: 'esto-no-es-un-id' }],
  ]) {
    const r = await intentoParche(mundoParche(om), fallos);
    ok(`P18-${cod}.1 ${que} → ni .bak nuevo ni purga: v2.0.53 y v2.0.54 siguen`, r.quedanIniciales === 2 && r.nuevos.length === 0, resumen(r));
    ok(`P18-${cod}.2 ${que} → patch-pending retirado, ayudante sin lanzar, instalado intacto, nada candidato, PS-1003`,
      r.staged === 0 && r.spawn.length === 0 && r.instalado === inicial && r.decision === 'no' && /PS-1003/.test(r.avisos), resumen(r));
  }
  {
    const r = await intentoParche(mundoParche(), { bakParcial: true });
    ok('P18-PE1 falla la copia heredada (queda A MEDIAS) tras PREPARADA → no queda ningún .bak de este intento, ni el parcial, y no hay purga',
      r.quedanIniciales === 2 && r.nuevos.length === 0, resumen(r));
    ok('P18-PE2 …el parche NO se aplica: ayudante sin lanzar, instalado intacto, patch-pending retirado; lo PREPARADO no es candidato',
      r.spawn.length === 0 && r.instalado === inicial && r.staged === 0 && r.decision === 'no'
      && r.ops.every((o) => o.estado !== 'verificada') && /PS-1003/.test(r.avisos), resumen(r));
  }
  {
    const r = await intentoParche(mundoParche(), { ayudante: true });
    ok('P18-PF1 falla escribir el ayudante → no hay purga y el .bak de ESTE intento se retira', r.quedanIniciales === 2 && r.nuevos.length === 0, resumen(r));
    ok('P18-PF2 …ayudante sin lanzar, patch-pending retirado, instalado intacto, nada candidato, PS-1003',
      r.spawn.length === 0 && r.staged === 0 && r.instalado === inicial && r.decision === 'no' && /PS-1003/.test(r.avisos), resumen(r));
  }
  {
    const r = await intentoParche(mundoParche(), { spawn: true });
    ok('P18-PG1 falla lanzar el ayudante → no hay purga y el .bak de ESTE intento se retira', r.quedanIniciales === 2 && r.nuevos.length === 0, resumen(r));
    ok('P18-PG2 …patch-pending retirado, instalado intacto, nada candidato, PS-1004',
      r.spawn.length === 1 && r.staged === 0 && r.instalado === inicial && r.decision === 'no' && /PS-1004/.test(r.avisos), resumen(r));
  }
  {
    const w = mundoParche();
    const r = await intentoParche(w, {});
    const bak = r.nuevos[0];
    ok('P18-PH1 caso correcto → la copia heredada se crea y es EXACTAMENTE el app.asar instalado',
      r.nuevos.length === 1 && shaF(path.join(w.def, bak)) === inicial, resumen(r));
    const args = r.spawn[0] || [];
    const op = r.ops.find((o) => o.operation_id === args[8]);
    ok('P18-PH2 …el ayudante se lanza UNA vez, atado a una operación PREPARADA, a su copia local y a esa copia heredada',
      r.spawn.length === 1 && !!op && op.estado === 'preparada' && args[9] === path.join(w.rec, op.nombre_copia)
      && args[2] === path.join(w.def, bak || '?'), resumen(r));
    ok('P18-PH3 …y la retención heredada se aplica como siempre (2 por mtime): quedan v2.0.54 y la nueva, se retira v2.0.53',
      r.quedanIniciales === 1 && r.v2054 && r.nuevos.length === 1 && r.staged === 1 && /Aplicando parche/.test(r.avisos), resumen(r));
  }
  {
    const w = mundoParche({ id: null });
    await intentoParche(w, {});
    await espera(3);
    const r = await intentoParche(w, {});
    ok('P18-PI dos intentos seguidos que fallan en P18 → las DOS copias históricas (v2.0.53 y v2.0.54) siguen y no aparece ningún .bak',
      r.quedanIniciales === 2 && r.nuevos.length === 0, resumen(r));
  }
  {
    const w = mundoParche();
    await intentoParche(w, { ayudante: true });
    await espera(3);
    const r = await intentoParche(w, {});
    ok('P18-PI2 un intento fallido (ayudante) y después uno correcto → queda como si el fallido no hubiera existido: v2.0.54 + la nueva',
      r.quedanIniciales === 1 && r.v2054 && r.nuevos.length === 1 && r.spawn.length === 1, resumen(r));
  }
  {
    const r = await intentoParche(mundoParche(), { stagedParcial: true });
    ok('P18-PZ falla copiar el patch-pending (queda A MEDIAS) → se retira; ni .bak, ni purga, ni operación P18, ni ayudante; PS-1003',
      r.staged === 0 && r.quedanIniciales === 2 && r.nuevos.length === 0 && r.ops.length === 0 && r.spawn.length === 0 && /PS-1003/.test(r.avisos), resumen(r));
  }
}

// P18-P es asíncrona: la sección Z y el resumen van DESPUÉS, para que P18-Z4
// también vea las escrituras de P18-P.
async function seccionFinal() {
  try { await seccionParche(); } catch (e) { ok('P18-P la sección «Aplicar parche» termina sin reventar', false, e && e.stack); }
// =============================================================================
seccion('P18-Z. ALCANCE');
// =============================================================================
{
  const prod = { 'db.js': null, 'security.js': null, 'preload.js': null, 'claude/Restaurar-backup.bat': null, 'build/installer.nsh': null };
  const antes = path.join(PROJ, 'claude', 'main.js.ANTES-P18-2026-09-18');
  ok('P18-Z1 existe la instantánea de main.js anterior a P18', fs.existsSync(antes));
  const SHA_ESPERADO = {
    'db.js': 'B03C81FF5FC300009DC315E4B20F9BF88DCC6902B18C2EF434B251A022EDD830',
  };
  ok('P18-Z2 db.js sigue idéntico (el installation-id se LEE, no se toca su dueño)',
    (shaF(path.join(PROJ, 'db.js')) || '').toUpperCase() === SHA_ESPERADO['db.js']);
  ok('P18-Z3 el .bat NO se ha tocado (va con D4)', !/pred-|procedencia/.test(BAT));
  ok('P18-Z4 la batería no ha escrito NADA fuera de su sandbox', escriturasFuera.length === 0, JSON.stringify(escriturasFuera));
  void prod;
  try {
    const j = JSON.parse(fs.readFileSync(path.join(PROJ, 'claude', 'pruebas-a33', 'comun', 'baseline-bd-viva.json'), 'utf8'));
    const h = (shaF(j.archivo) || '').toUpperCase();
    ok('P18-Z5 la BD viva sigue idéntica a su línea base', h === String(j.sha256).toUpperCase(), h.slice(0, 16));
  } catch (e) { nota('No se pudo leer la línea base de la BD viva: ' + e.message); }
}

try { fs.rmSync(SB, { recursive: true, force: true }); } catch (e) { /* */ }

console.log('\n======================================================================');
console.log(`  P18: ${pass} OK / ${fail} FALLOS`);
console.log(`  de ellas, consistencia DOCUMENTAL (P18-O, no es evidencia técnica): ${passDoc} OK / ${failDoc} FALLOS`);
console.log(`  técnicas: ${pass - passDoc} OK / ${fail - failDoc} FALLOS`);
console.log('======================================================================');
if (fallos.length) fallos.forEach((f) => console.log('  fallo: ' + f));
console.log('  Batería EXIGENTE (Fase 1). No cubre un app.asar que Electron no puede cargar: eso es Fase 2 / D4.');
if (fail) process.exit(1);
}
seccionFinal();
