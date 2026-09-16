'use strict';
// ---------------------------------------------------------------------------
// B5 — REENTRANCIA DEL FORMULARIO DE SEGURIDAD: inventario y diagnóstico.
//
// NO ARREGLA NADA. Describe el comportamiento ACTUAL, bueno o malo.
//
// El hallazgo original (auditoria-2026-09-13, B5, "impacto bajo") decía:
//   · `security-window/renderer.js`: `doSubmit()` pone `btnSubmit.disabled=true`
//   · pero el listener global `keydown → Enter` llama a `doSubmit()` sin
//     comprobar ese flag
//   · con scrypt + reencryptAllBackups sobre 46 MB, la operación tarda, y
//     pulsar Enter varias veces encola varias invocaciones de
//     `security-win:submit`
//   · en `setup` la segunda pasada no rompía nada; en `change` comparaba
//     contra la sal YA sustituida y devolvía "La contraseña actual no es
//     correcta" sobre una operación que en realidad fue bien — confuso
//   · arreglo propuesto: `if (els.btnSubmit.disabled) return;`
//
// Desde entonces han pasado A1 (journal v2 del rekey), el Bloque 3 (exclusiva
// de operación) y A3.3 entero. `reencryptAllBackups()` ya no existe: la
// sustituyó `rekeyAllUserFiles()`. NO se asume que B5 siga vigente: se mide.
//
// MÉTODO. Se separan las cuatro capas que el diagnóstico tiene que distinguir:
//   A. prevención en la UI (atributo disabled, <form>, foco)
//   B. prevención en el renderer (guardas en doSubmit / en los listeners)
//   C. exclusión en main / A3.3 (rekeyInProgress, exclusiva, latch, base)
//   D. protección transaccional del rekey (journal v2, todo-o-nada)
//
// La capa B se MIDE ejecutando el renderer.js REAL sobre un DOM doble y
// contando los IPC que llegan a salir. La reentrancia depende del event loop,
// así que no se razona: se cuenta.
//
// Solo lectura: no toca la BD viva, ni produccion, ni hace ningún rekey.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const A = (f) => fs.readFileSync(path.join(PROJ, f), 'utf8');
const REN = fs.readFileSync(process.env.PANORAMA_SECWIN || path.join(PROJ, 'security-window', 'renderer.js'), 'utf8');
const HTML = A('security-window/index.html');
const MAIN = fs.readFileSync(process.env.PANORAMA_MAIN || path.join(PROJ, 'main.js'), 'utf8');
const SEC = A('security.js');
const PRELOAD = A('preload-security.js');
if (process.env.PANORAMA_SECWIN) console.log('  [PANORAMA_SECWIN] ' + process.env.PANORAMA_SECWIN);
if (process.env.PANORAMA_MAIN) console.log('  [PANORAMA_MAIN] ' + process.env.PANORAMA_MAIN);

let pass = 0, fail = 0; const fallos = [];
function ok(n, c, extra) {
  if (c) { pass++; console.log('  OK    ' + n); }
  else { fail++; fallos.push(n); console.log('  FALLO ' + n + (extra === undefined ? '' : '  -- ' + extra)); }
}
function seccion(t) { console.log('\n=== ' + t + ' ==='); }
function nota(s) { console.log('        ' + s); }
const cuenta = (s, r) => (s.match(r) || []).length;
// main.js no es UTF-8 puro. Se preservan los saltos de línea (ver B4).
const sinTildes = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\x20-\x7E\n\r]/g, '?');
function soloCodigo(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}
function cuerpoDe(src, firma) {
  const i = src.indexOf(firma);
  if (i < 0) return null;
  let p = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') p++;
    else if (src[k] === '}') { p--; if (p === 0) return src.slice(i, k + 1); }
  }
  return null;
}

console.log('B5 — reentrancia del formulario de Seguridad: inventario y diagnóstico');

// =========================================================================
seccion('B5-A. EL HALLAZGO ORIGINAL, CONTRA EL CÓDIGO DE HOY');
// =========================================================================
// Se extrae la función por llaves: el presupuesto de caracteres se quedó corto
// en cuanto la corrección añadió su comentario (trampa ya vista en B4 y B5-B3).
ok('B5-A1 `doSubmit()` sigue poniendo btnSubmit.disabled = true',
  /els\.btnSubmit\.disabled = true;/.test(cuerpoDe(REN, 'async function doSubmit() {') || ''));
ok('B5-A2 el listener global de Enter SIGUE llamando a doSubmit()',
  /document\.addEventListener\('keydown',[\s\S]{0,200}?if \(e\.key === 'Enter'\) doSubmit\(\);/.test(REN));
// --- LA CORRECCIÓN (16 sept 2026) ----------------------------------------
ok('B5-A3 `doSubmit()` empieza comprobando si ya hay un envío en curso',
  /async function doSubmit\(\) \{[\s\S]{0,1400}?\n  if \(els\.btnSubmit\.disabled\) return;/.test(REN),
  'la guarda no está al principio de doSubmit');
ok('B5-A4 es EXACTAMENTE el arreglo que proponía la auditoría',
  /if \(els\.btnSubmit\.disabled\) return;/.test(REN));
ok('B5-A4b y está ANTES de recoger los datos y de validar',
  REN.indexOf('if (els.btnSubmit.disabled) return;') < REN.indexOf('const data = collect();'),
  'la guarda va después de collect()');
ok('B5-A5 sin inventar ninguna otra bandera: se reutiliza el estado que ya existía',
  !/\b(enviando|inFlight|submitting|enCurso|enviandoYa)\b/i.test(soloCodigo(REN)),
  'se ha añadido una bandera nueva');
ok('B5-A5b el listener de Enter se deja tal cual: la guarda vive en doSubmit()',
  /if \(e\.key === 'Enter'\) doSubmit\(\);/.test(REN),
  'se ha tocado el listener en vez de doSubmit');
nota('-> Un solo punto de corte, el que ya sabía si había un envío en vuelo.');

// Lo que SÍ ha cambiado del enunciado: la función que hacía el trabajo.
ok('B5-A6 pero `reencryptAllBackups()` YA NO EXISTE: la sustituyó rekeyAllUserFiles()',
  !/function reencryptAllBackups/.test(MAIN) && /function rekeyAllUserFiles\(oldKey, newKey, opts\)/.test(MAIN));
ok('B5-A7 el canal sigue siendo `security-win:submit`',
  /ipcMain\.handle\('security-win:submit'/.test(MAIN) &&
  /submit: \(data\) => ipcRenderer\.invoke\('security-win:submit', data\)/.test(PRELOAD));

// =========================================================================
seccion('B5-B. INVENTARIO DE LOS CAMINOS DE ACCIÓN DE LA VENTANA');
// =========================================================================
const MODOS = ['login', 'setup', 'change', 'disable'];
console.log('\n  modo      qué hace                                   toca archivos');
console.log('  ' + '-'.repeat(72));
const TOCA = { login: 'NO', setup: 'SÍ (cifra)', change: 'SÍ (re-cifra)', disable: 'SÍ (descifra)' };
const QUE = {
  login: 'valida contraseña y abre la sesión',
  setup: 'activa el cifrado de todo el material',
  change: 'rekey completo: backups + reuniones + evaluaciones',
  disable: 'descifra todo y deja el material en claro',
};
for (const m of MODOS) console.log('  ' + m.padEnd(10) + QUE[m].padEnd(42) + TOCA[m]);
for (const m of MODOS) {
  ok('B5-B1 el modo `' + m + '` existe en el renderer y en el handler',
    new RegExp(`mode === '${m}'`).test(REN) && new RegExp(`mode === '${m}'`).test(MAIN));
}
ok('B5-B2 los TRES modos que tocan archivos delegan en el MISMO rekeyAllUserFiles()',
  cuenta(MAIN, /rekeyAllUserFiles\(/g) >= 4,   // definición + setup + change + disable
  'llamadas: ' + cuenta(MAIN, /rekeyAllUserFiles\(/g));
// La rama `login` se extrae por llaves, no con un presupuesto de caracteres:
// mide 1145 y cualquier tope elegido a ojo se queda corto en cuanto crezca.
{
  const ramaLogin = cuerpoDe(MAIN, "if (mode === 'login') {");
  ok('B5-B3 `login` NO toca archivos: solo deriva, verifica y fija securityKey',
    !!ramaLogin && /securityKey = key;/.test(ramaLogin) && !/rekeyAllUserFiles/.test(ramaLogin),
    ramaLogin ? 'la rama llama a rekeyAllUserFiles' : 'no se pudo extraer la rama login');
  ok('B5-B3b …aunque sí comprueba que la clave abre los archivos DE VERDAD (Bloque 3)',
    !!ramaLogin && /claveDescifraDeVerdad\(key\)/.test(ramaLogin));
}
ok('B5-B4 no hay <form>: no existe un submit nativo que pueda duplicarse',
  !/<form/i.test(HTML));
ok('B5-B5 el único otro camino es `security-win:cancel`, que solo cierra la ventana',
  /ipcMain\.handle\('security-win:cancel', \(\) => \{\s*if \(securityWin && !securityWin\.isDestroyed\(\)\) securityWin\.close\(\);/.test(MAIN));

// =========================================================================
seccion('B5-C. ¿PUEDE HABER TRABAJO CONCURRENTE DE VERDAD?');
// =========================================================================
// La pregunta se decide por el modelo de ejecución, no por las guardas: si
// todo el camino es SÍNCRONO, el proceso principal no puede atender un segundo
// mensaje hasta terminar el primero.
const CUERPO_REKEY = cuerpoDe(MAIN, 'function rekeyAllUserFiles(oldKey, newKey, opts) {');
const CUERPO_HANDLER = cuerpoDe(MAIN, "ipcMain.handle('security-win:submit', async (evt, data) => {");
ok('B5-C1 `rekeyAllUserFiles` se ha podido extraer para medirla', !!CUERPO_REKEY);
ok('B5-C2 NO es async', !!CUERPO_REKEY && !/^async function/.test(CUERPO_REKEY));
ok('B5-C3 y no contiene NI UN `await`: es síncrona de principio a fin',
  !!CUERPO_REKEY && cuenta(CUERPO_REKEY, /\bawait\b/g) === 0,
  'awaits: ' + (CUERPO_REKEY ? cuenta(CUERPO_REKEY, /\bawait\b/g) : '?'));
ok('B5-C4 tampoco cede con setTimeout ni con promesas',
  !!CUERPO_REKEY && cuenta(CUERPO_REKEY, /setTimeout\(|new Promise\(/g) === 0);
ok('B5-C5 el derivado de clave es `scryptSync`, no la versión asíncrona',
  /crypto\.scryptSync\(String\(password\), salt, KEY_LEN, SCRYPT_PARAMS\)/.test(SEC) &&
  !/crypto\.scrypt\(/.test(SEC));
ok('B5-C6 y el propio handler, aunque esté declarado async, tampoco tiene ningún `await`',
  !!CUERPO_HANDLER && cuenta(CUERPO_HANDLER, /\bawait\b/g) === 0,
  'awaits: ' + (CUERPO_HANDLER ? cuenta(CUERPO_HANDLER, /\bawait\b/g) : '?'));
nota('-> CONSECUENCIA: el proceso principal BLOQUEA su bucle de eventos durante');
nota('   toda la operación. Un segundo `security-win:submit` no se puede empezar');
nota('   a procesar hasta que el primero ha TERMINADO. No hay concurrencia real:');
nept();
function nept() {
  nota('   los dos mensajes se SERIALIZAN. Es una propiedad del modelo de');
  nota('   ejecución, no una guarda que alguien pueda quitar por despiste.');
}

// =========================================================================
seccion('B5-D. LAS GUARDAS DE main/A3.3, POR SI ALGÚN DÍA DEJA DE SER SÍNCRONO');
// =========================================================================
ok('B5-D1 [capa C] `rekeyInProgress` corta en la PRIMERA línea de rekeyAllUserFiles',
  /function rekeyAllUserFiles\(oldKey, newKey, opts\) \{[\s\S]{0,600}?if \(rekeyInProgress\) \{\s*return \{ ok: false, error: 'Ya hay una operación de Seguridad en curso/.test(MAIN));
ok('B5-D2 …y también bloquea los CUATRO puntos de guardado mientras dura',
  cuenta(MAIN, /if \(rekeyInProgress\) return (?:accionNoAplicada|noAplicado)\(REKEY_BUSY_MESSAGE/g) >= 4,
  'puntos: ' + cuenta(MAIN, /if \(rekeyInProgress\) return (?:accionNoAplicada|noAplicado)\(REKEY_BUSY_MESSAGE/g));
ok('B5-D3 [capa C] toma la EXCLUSIVA de operación de db.js',
  /ex = dbmod\.tomarExclusiva\('seguridad'\);/.test(MAIN));
ok('B5-D4 …y una exclusiva ya tomada hace que la segunda lance `ocupado`',
  /function tomarExclusiva\(etiqueta\) \{\s*if \(exclusiva\) \{\s*throw new ErrorDb\('ocupado'/.test(A('db.js')));
ok('B5-D5 [capa C] el estado de Seguridad no demostrado impide empezar otra',
  /const b = bloqueoDeSeguridad\(\);\s*if \(b\) return \{ ok: false, error: b\.mensaje/.test(MAIN));
ok('B5-D6 [capa C] una restauración sin terminar también lo impide',
  /const rp = rekeyPuedeEmpezar\(\);\s*if \(!rp\.puede\)/.test(MAIN));
ok('B5-D7 [capa D] la carpeta de trabajo preexistente ABORTA, nunca se borra',
  /if \(fs\.existsSync\(staging\)\) \{/.test(MAIN) &&
  /NUNCA se borra una carpeta de trabajo preexistente/.test(MAIN));
ok('B5-D8 [capa D] la consolidación es UNA mutación anclada al commit base',
  /dbmod\.escribirMultiple\(sentencias, \{ token: ex\.token, exigirCommitBase: baseCommit \}\)/.test(MAIN));
ok('B5-D9 [capa D] con journal v2 y hashes por item (A1, cerrado)',
  /rekeyJournalPath\(\)/.test(MAIN) && cuenta(MAIN, /sha256DeArchivo\(/g) >= 2);

// =========================================================================
seccion('B5-E. MEDIDO: EL renderer.js REAL SOBRE UN DOM DOBLE');
// =========================================================================
// Aquí no se razona: se ejecuta el renderer productivo y se CUENTAN los IPC.
function montarDOM() {
  const reg = { ipc: [], cancel: 0, errores: [], focos: 0 };
  const listeners = { keydown: [] };
  function nuevoEl(id) {
    return {
      id, value: '', checked: false, textContent: '', className: '', disabled: false,
      style: { display: 'block' },
      _click: [],
      addEventListener(ev, fn) { if (ev === 'click') this._click.push(fn); },
      focus() { reg.focos++; },
      click() { if (this.disabled) return false; for (const f of this._click) f(); return true; },
    };
  }
  const ids = ['title', 'subtitle', 'row-current', 'input-current', 'row-password', 'label-password',
    'input-password', 'row-confirm', 'input-confirm', 'hint', 'row-remember', 'input-remember',
    'error', 'btn-cancel', 'btn-submit'];
  const mapa = {};
  for (const i of ids) mapa[i] = nuevoEl(i);
  const document = {
    getElementById: (i) => mapa[i] || null,
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
  };
  // `submit` devuelve una promesa que NO se resuelve: reproduce la operación
  // larga (scrypt + rekey) durante la cual el usuario vuelve a pulsar.
  let resolverPrimero = null;
  const window = {
    securityWinAPI: {
      onInit: (cb) => { window._init = cb; },
      submit: (data) => {
        reg.ipc.push(JSON.parse(JSON.stringify(data)));
        return new Promise((res) => { if (!resolverPrimero) resolverPrimero = res; });
      },
      cancel: () => { reg.cancel++; },
    },
  };
  // Para B5-7: permite terminar el envío en vuelo y ver si la UI se rehabilita.
  reg._resolver = (v) => { if (resolverPrimero) { const f = resolverPrimero; resolverPrimero = null; f(v); } };
  const ctx = {
    document, window, setTimeout: (fn) => { /* el foco diferido no interesa aquí */ },
    initGlobalTheme: () => {},
    console,
  };
  // El renderer usa `window.securityWinAPI` y `document` como globales.
  const fn = new Function('document', 'window', 'setTimeout', 'initGlobalTheme', 'console',
    REN + '\n; return { doSubmit, els, teclear: (k) => (' +
    'arguments[0].__keydown || []).forEach((f) => f({ key: k })) };');
  // Se engancha la lista real de listeners de keydown.
  document.__keydown = [];
  const origAdd = document.addEventListener;
  document.addEventListener = (ev, f) => { if (ev === 'keydown') document.__keydown.push(f); origAdd(ev, f); };
  const api = fn(document, window, ctx.setTimeout, ctx.initGlobalTheme, console);
  return {
    reg, mapa, window, api,
    teclear: (k) => document.__keydown.forEach((f) => f({ key: k })),
    resolver: (v) => reg._resolver(v),
  };
}

// Prepara un formulario de `change` completo y válido. Todos los casos parten
// del mismo estado, así que la única variable es el GESTO.
function conFormularioValido(modo) {
  const d = montarDOM();
  d.window._init({ mode: modo || 'change', canRemember: true });
  d.mapa['input-current'].value = 'vieja';
  d.mapa['input-password'].value = 'nueva1234';
  d.mapa['input-confirm'].value = 'nueva1234';
  return d;
}

// --- B5-1: un solo envío -------------------------------------------------
{
  const d = conFormularioValido();
  d.teclear('Enter');
  ok('B5-1 un solo Enter -> exactamente 1 IPC', d.reg.ipc.length === 1, 'ipc: ' + d.reg.ipc.length);
  ok('B5-1b y el botón queda deshabilitado', d.mapa['btn-submit'].disabled === true);
}

// --- B5-2: DOBLE ENTER ---------------------------------------------------
{
  const d = conFormularioValido();
  d.teclear('Enter');
  d.teclear('Enter');
  nota('doble Enter -> IPC emitidos: ' + d.reg.ipc.length);
  ok('B5-2 dos Enter seguidos emiten EXACTAMENTE 1 IPC', d.reg.ipc.length === 1,
    'ipc: ' + d.reg.ipc.length + ' (2 = el defecto ha vuelto)');
}

// --- B5-3: CINCO Enter (el gesto real de impaciencia) --------------------
{
  const d = conFormularioValido();
  for (let i = 0; i < 5; i++) d.teclear('Enter');
  nota('cinco Enter -> IPC emitidos: ' + d.reg.ipc.length);
  ok('B5-3 cinco Enter emiten EXACTAMENTE 1 IPC', d.reg.ipc.length === 1,
    'ipc: ' + d.reg.ipc.length);
}

// --- B5-4: CLICK + ENTER -------------------------------------------------
{
  const d = conFormularioValido();
  d.mapa['btn-submit'].click();
  d.teclear('Enter');
  nota('click + Enter -> IPC emitidos: ' + d.reg.ipc.length);
  ok('B5-4 click y luego Enter emiten EXACTAMENTE 1 IPC en total',
    d.reg.ipc.length === 1, 'ipc: ' + d.reg.ipc.length);
}

// --- B5-5: DOBLE CLICK (la mitad que YA estaba protegida) ---------------
{
  const d = conFormularioValido();
  const p1 = d.mapa['btn-submit'].click();
  const p2 = d.mapa['btn-submit'].click();
  nota('doble click -> IPC emitidos: ' + d.reg.ipc.length + '   (2º click aceptado: ' + p2 + ')');
  ok('B5-5 el doble CLICK sigue emitiendo 1 IPC: el `disabled` del botón no se ha roto',
    d.reg.ipc.length === 1 && p1 === true && p2 === false,
    'ipc: ' + d.reg.ipc.length);
  nota('Esta mitad NUNCA estuvo rota: un botón deshabilitado no dispara `click`.');
  nota('La guarda nueva cubre la otra, la del teclado, que no pasa por el botón.');
}

// --- B5-7: NO se crea un bloqueo permanente ------------------------------
// Si el intento termina y la UI vuelve legítimamente a estar habilitada, un
// envío posterior tiene que poder ejecutarse. Ese camino existe: la rama de
// error de doSubmit() vuelve a poner `disabled = false`.
//
// Es el único caso que necesita esperar al bucle de microtareas (doSubmit hace
// `await` de la respuesta), así que se ejecuta al final, en una función
// asíncrona, y el resumen se imprime después de ella.
async function pruebaB5_7() {
  const d = conFormularioValido();
  d.teclear('Enter');
  ok('B5-7a tras el primer envío el botón está deshabilitado',
    d.mapa['btn-submit'].disabled === true);
  // El handler responde con error: es el camino por el que la UI se rehabilita.
  d.resolver({ error: 'La contraseña actual no es correcta.' });
  await new Promise((r) => setTimeout(r, 0));   // deja correr las microtareas
  ok('B5-7b cuando el intento termina con error, el botón se REHABILITA',
    d.mapa['btn-submit'].disabled === false,
    'sigue deshabilitado: sería un bloqueo permanente');
  ok('B5-7c y el error se muestra', /no es correcta/.test(d.mapa.error.textContent),
    JSON.stringify(d.mapa.error.textContent));
  d.teclear('Enter');
  ok('B5-7d un envío POSTERIOR sí se ejecuta: la guarda no es un cerrojo definitivo',
    d.reg.ipc.length === 2, 'ipc totales: ' + d.reg.ipc.length);
}

// --- E6: ESCAPE DURANTE LA OPERACIÓN -------------------------------------
{
  const d = montarDOM();
  d.window._init({ mode: 'change', canRemember: true });
  d.mapa['input-current'].value = 'vieja';
  d.mapa['input-password'].value = 'nueva1234';
  d.mapa['input-confirm'].value = 'nueva1234';
  d.teclear('Enter');
  d.teclear('Escape');
  const cancelable = d.mapa['btn-cancel'].disabled === false;
  nota('Escape durante la operación -> cancelaciones enviadas: ' + d.reg.cancel);
  ok('B5-E6 [OBSERVACIÓN] Escape SIGUE cerrando la ventana durante la operación',
    d.reg.cancel === 1, 'cancelaciones: ' + d.reg.cancel);
  ok('B5-E6b y el botón Cancelar tampoco se deshabilita', cancelable);
  nota('El rekey es síncrono en main, así que la ventana no llega a cerrarse a');
  nota('mitad: el `close()` se procesa cuando el bucle de eventos queda libre.');
}

// --- La guarda vale para los CUATRO modos, no solo para `change` ---------
{
  for (const modo of ['login', 'setup', 'change', 'disable']) {
    const d = montarDOM();
    d.window._init({ mode: modo, canRemember: true });
    d.mapa['input-current'].value = 'vieja';
    d.mapa['input-password'].value = 'nueva1234';
    d.mapa['input-confirm'].value = 'nueva1234';
    d.teclear('Enter'); d.teclear('Enter'); d.teclear('Enter');
    ok('B5-5b en modo `' + modo + '`, tres Enter emiten EXACTAMENTE 1 IPC',
      d.reg.ipc.length === 1 && (!d.reg.ipc[0] || d.reg.ipc[0].mode === modo),
      'ipc: ' + d.reg.ipc.length);
  }
}

// --- B5-6: formulario inválido ------------------------------------------
{
  const d = montarDOM();
  d.window._init({ mode: 'change', canRemember: true });
  d.mapa['input-current'].value = '';      // falta la actual
  d.teclear('Enter');
  d.teclear('Enter');
  ok('B5-6 con el formulario incompleto NO sale ningún IPC, por muchos Enter',
    d.reg.ipc.length === 0 && /contrase/i.test(d.mapa.error.textContent),
    'ipc: ' + d.reg.ipc.length + '  error: ' + JSON.stringify(d.mapa.error.textContent));
  ok('B5-6b y el botón NO se queda deshabilitado por una validación fallida',
    d.mapa['btn-submit'].disabled === false,
    'la validación dejaría la ventana bloqueada');
}

// =========================================================================
seccion('B5-F. QUÉ RECIBE EL SEGUNDO ENVÍO, POR MODO (leído del handler)');
// =========================================================================
// Como main serializa, el segundo se procesa CUANDO EL PRIMERO YA TERMINÓ.
// Lo que reciba depende de lo que el primero haya dejado hecho.
console.log('\n  modo      el 2º envío se encuentra con...                    respuesta');
console.log('  ' + '-'.repeat(96));
console.log('  login     securityKey ya fija; la contraseña sigue siendo válida  {} (éxito otra vez, inocuo)');
console.log('  setup     security_enabled=1 y una sal NUEVA                      rekey `setup` con oldKey=null');
console.log('  change    la sal YA sustituida                                    "La contraseña actual no es correcta."');
console.log('  disable   security_enabled=0 y sin sal                            deriveKey sobre sal nula');
ok('B5-F1 en `change`, el 2º deriva de `security_salt` releída, que ya es la NUEVA',
  /if \(mode === 'change'\) \{\s*const salt = getMeta\('security_salt'\);[\s\S]{0,300}?return \{ error: 'La contraseña actual no es correcta\.' \};/.test(MAIN),
  'el camino ha cambiado');
ok('B5-F2 …así que devuelve el mensaje CONFUSO que describía el hallazgo',
  /return \{ error: 'La contraseña actual no es correcta\.' \};/.test(MAIN));
ok('B5-F3 pero ANTES de eso ya ha cerrado la ventana el primer envío',
  /if \(!res\.ok\) return \{ error: res\.error \};\s*if \(res\.aplicado === true\) return cerrarPorAplicadoSinVerificar\(res\);\s*finishSecurityWindow\(\);/.test(MAIN));
ok('B5-F4 y `finishSecurityWindow()` cierra la ventana de verdad',
  /if \(securityWin && !securityWin\.isDestroyed\(\)\) securityWin\.close\(\);/.test(MAIN));
nota('-> El segundo `invoke` YA está en vuelo cuando la ventana se cierra, así que');
nota('   su respuesta llega a una ventana destruida: el usuario NO llega a ver el');
nota('   mensaje confuso. Eso hay que confirmarlo en Electron real, no aquí.');
ok('B5-F5 el 2º envío en `setup` llega con `oldKey = null` sobre archivos YA cifrados',
  /rekeyAllUserFiles\(null, key, \{\s*mode: 'setup'/.test(MAIN));
ok('B5-F5b …y el rekey lo DETECTA en vez de saltárselo, que es lo que suponía el hallazgo',
  /est. cifrado pero no hay clave anterior con la que descifrarlo/.test(sinTildes(MAIN)),
  'ya no existe esa comprobación');
ok('B5-F5c …abortando todo-o-nada con vuelta atrás declarada y código PS',
  /No se ha cambiado nada: la operaci.n se deshizo por completo/.test(sinTildes(MAIN)) &&
  /PS-2003/.test(MAIN));
nota('MEDIDO en Electron real (B5-RE1f/g/h): el 2º `setup` NO "se salta" los');
nota('archivos como decía el hallazgo — los detecta, aborta y lo deshace todo.');
nota('Esa mitad del enunciado original ha quedado SUPERADA por A1/Bloque 3.');
ok('B5-F6 y el modo `login` es idempotente: vuelve a fijar la MISMA securityKey',
  /securityKey = key;\s*seguridadRequiereRevalidacion = false;/.test(MAIN));

// =========================================================================
seccion('B5-G. LO QUE EL USUARIO VE MIENTRAS TANTO');
// =========================================================================
ok('B5-G1 el botón se deshabilita', /els\.btnSubmit\.disabled = true;/.test(REN));
// OJO con el patrón: `Espera` a secas casa dentro de "Error inesperado", que
// es otra cosa. Se exige palabra completa.
ok('B5-G2 [OBSERVACIÓN] pero NO cambia de texto ni aparece ningún indicador',
  !/\b(Procesando|Espere|spinner|cargando|progreso)\b/i.test(soloCodigo(REN)) &&
  !/btnSubmit\.textContent = /.test(cuerpoDe(REN, 'async function doSubmit() {') || ''),
  'ya hay algún indicador de progreso');
ok('B5-G3 [OBSERVACIÓN] los campos del formulario NO se bloquean',
  !/inputPassword\.disabled|inputCurrent\.disabled|inputConfirm\.disabled/.test(REN));
ok('B5-G4 [OBSERVACIÓN] Cancelar sigue activo durante la operación',
  !/btnCancel\.disabled/.test(REN));
ok('B5-G5 el mensaje de error anterior sí se limpia al empezar',
  /setError\(''\);\s*els\.btnSubmit\.disabled = true;/.test(REN));
nota('-> Un usuario que no ve NINGUNA señal de progreso durante una operación');
nota('   larga tiende a volver a pulsar. Es la condición que dispara el defecto.');

// =========================================================================
seccion('B5-H. LO QUE **NO** ES B5 — para no ensanchar el alcance');
// =========================================================================
ok('B5-H1 el `bloque5/` de las baterías es el BLOQUE 5 de A3.3 (borrados), no esto',
  fs.existsSync(path.join(PROJ, 'claude', 'pruebas-a33', 'bloque5', 'test-borrados.js')));
ok('B5-H2 A1 (rekey destructivo) está CERRADO y no se reabre aquí',
  /\*\*A1\*\*/.test(A('claude/handoff-opus-estado-actual.md')));
ok('B5-H3 el Enter de Evaluación de Candidatos es OTRO, y ya se corrigió',
  /No confundir con el Enter de Candidatos, que sí se corrigió/.test(A('claude/handoff-opus-estado-actual.md')));
ok('B5-H4 P14/P15 y C1 siguen abiertos y no se tocan aquí',
  /P14/.test(A('claude/pendientes-abiertos.md')) && /P15/.test(A('claude/pendientes-abiertos.md')));

// El único caso asíncrono va al final; el resumen se imprime tras él.
pruebaB5_7().then(() => {
  console.log('\n' + '='.repeat(70));
  console.log(`  B5 — reentrancia del formulario de Seguridad: ${pass} OK, ${fail} FALLOS`);
  if (fallos.length) fallos.forEach((f) => console.log('    - ' + f));
  console.log('='.repeat(70));
  console.log('  Secciones B/C/D/F/G/H: describen y CUSTODIAN las capas inferiores,');
  console.log('  que NO se han tocado. Secciones A y 1-7: EXIGEN la corrección de B5.');
  process.exitCode = fail === 0 ? 0 : 1;
}).catch((e) => {
  console.error('EXCEPCIÓN EN B5-7: ' + ((e && e.stack) || e));
  process.exitCode = 2;
});
