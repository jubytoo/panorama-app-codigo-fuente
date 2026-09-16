'use strict';
// ---------------------------------------------------------------------------
// E2 — UNA SOLA FUENTE DE VERDAD: misma entrada, mismo resultado.
//
// HISTORIA. Esta bateria nacio DEMOSTRANDO LA DIVERGENCIA (24 OK/0 con las dos
// copias): `computeServiceEndWarning()` de main.js y
// `computeServiceEndWarningLocal()` del dashboard daban resultados distintos
// para la misma entrada en 4 de 20 casos, porque el fix de v2.0.52
// (`serviceStart` futuro tiene prioridad) entro solo en main.js. El mismo
// proyecto decia "Arranca en 3 dias" en el lanzador y "Servicio finaliza en 20
// dias" en su propio panel. Desde el 15 sept 2026 esta bateria EXIGE identidad.
//
// Tres caminos, la MISMA tabla de casos:
//   A) `vendor/service-status.js`            -- el helper, directamente
//   B) `computeServiceEndWarning()`          -- el envoltorio de main.js
//   C) `computeServiceEndWarningLocal()`     -- el envoltorio del dashboard
//
// Para cada caso se exige A === B === C en kind, level, days y message.
//
// Y ademas: que el texto y la logica hayan quedado DESACOPLADOS de verdad.
//
// Solo lectura: no toca la BD viva, ni produccion, ni escribe nada.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const MAIN = process.env.PANORAMA_MAIN || path.join(PROJ, 'main.js');
const DASH = process.env.PANORAMA_DASHBOARD || path.join(PROJ, 'dashboard', 'plantilla_dashboard.html');
const HELPER = process.env.PANORAMA_SERVICE_STATUS || path.join(PROJ, 'vendor', 'service-status.js');
const SRC_M = fs.readFileSync(MAIN, 'utf8');
const SRC_D = fs.readFileSync(DASH, 'utf8');
const SRC_H = fs.readFileSync(HELPER, 'utf8');

let pass = 0, fail = 0; const fallos = [];
function ok(n, c, extra) {
  if (c) { pass++; console.log('  OK    ' + n); }
  else { fail++; fallos.push(n); console.log('  FALLO ' + n + (extra ? '  -- ' + extra : '')); }
}
function seccion(t) { console.log('\n=== ' + t + ' ==='); }

function extraerDe(src, firma) {
  const i = src.indexOf(firma);
  if (i < 0) throw new Error('NO SE ENCONTRO: ' + firma);
  let j = src.indexOf('{', i + firma.length), prof = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (prof === 0) return src.slice(i, k + 1); }
  }
  throw new Error('no delimitado: ' + firma);
}
// "¿Queda esto en el codigo?" tiene que preguntarse SOBRE EL CODIGO. Los
// comentarios de esta ronda citan literalmente lo que se ha quitado —el parser
// viejo, el texto que ya no se genera aqui— y una busqueda ingenua los cuenta
// como si siguieran vivos. Se descartan las lineas de comentario y los bloques
// /* */ antes de comprobar nada de eso.
function soloCodigo(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')   // el dashboard es HTML: tambien sus comentarios
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => { const t = l.trim(); return t.length > 0 && !t.startsWith('//') && !t.startsWith('*'); })
    .join('\n');
}
const COD_M = soloCodigo(SRC_M);
const COD_D = soloCodigo(SRC_D);
const COD_H = soloCodigo(SRC_H);

// Carga el helper desde su TEXTO, para poder cargar tambien una variante con el
// wording cambiado sin tocar el archivo de produccion.
function cargarHelper(texto) {
  const mod = { exports: {} };
  new Function('module', 'exports', 'self', texto)(mod, mod.exports, {});
  return mod.exports;
}

console.log('E2 — una sola fuente de verdad del estado temporal del servicio');

// =========================================================================
seccion('E2-A. LA FUENTE UNICA EXISTE, y las dos copias han desaparecido');
// =========================================================================
ok('E2-A1 vendor/service-status.js existe y exporta serviceStatus',
  typeof cargarHelper(SRC_H).serviceStatus === 'function');
ok('E2-A2 es PURO: ni DOM, ni Electron, ni require de nada',
  !/\bdocument\b|\bwindow\.|require\(/.test(SRC_H.replace(/^[\s\S]*?\(function \(root, factory\)/, '')));
ok('E2-A3 main.js lo carga con require y YA NO calcula por su cuenta',
  /const serviceStatusMod = require\('\.\/vendor\/service-status\.js'\);/.test(SRC_M) &&
  /return serviceStatusMod\.serviceStatus\(result\.state \|\| \{\}, new Date\(\)\);/.test(SRC_M));
ok('E2-A4 el dashboard lo carga con <script> y YA NO calcula por su cuenta',
  /<script src="\.\.\/vendor\/service-status\.js"><\/script>/.test(SRC_D) &&
  /return PanoramaServiceStatus\.serviceStatus\(state, today\);/.test(SRC_D));
ok('E2-A5 fixVendorScriptPaths reescribe tambien esa ruta al hornear el dashboard',
  /const vendorServiceStatus = pathToFileURL\(path\.join\(__dirname, 'vendor', 'service-status\.js'\)\)\.href;/.test(SRC_M) &&
  /\.replace\('<script src="\.\.\/vendor\/service-status\.js"><\/script>'/.test(SRC_M));
// Ya no queda logica de fin de servicio fuera del helper.
ok('E2-A6 el texto "Servicio finaliza en" solo se GENERA en el helper',
  (COD_H.match(/Servicio finaliza en/g) || []).length === 1 &&
  COD_M.indexOf('Servicio finaliza en') < 0 && COD_D.indexOf('Servicio finaliza en') < 0,
  JSON.stringify({ helper: (COD_H.match(/Servicio finaliza en/g) || []).length,
    main: COD_M.indexOf('Servicio finaliza en'), dash: COD_D.indexOf('Servicio finaliza en') }));
ok('E2-A7 ni main.js ni el dashboard calculan ya (end - today)',
  !/Math\.round\(\(end - today\) \/ 86400000\)/.test(COD_M) &&
  !/Math\.round\(\(end-today\)\/86400000\)/.test(COD_D));

// =========================================================================
seccion('E2-B. A === B === C  para la misma entrada');
// =========================================================================
const A = cargarHelper(SRC_H).serviceStatus;

function construirB(estado) {
  const cuerpo =
    'function getProjectStateForMeetingPrep(){ return { ok:true, state: __ST }; }\n' +
    // La firma lleva `ctx` desde B1 (contexto de una pasada de listProjectRows).
    // Aquí se invoca sin él: el envoltorio debe dar lo mismo con y sin contexto.
    extraerDe(SRC_M, 'function computeServiceEndWarning(projectId, ctx)') + '\n' +
    'return computeServiceEndWarning;';
  return new Function('__ST', 'serviceStatusMod', cuerpo)(estado, { serviceStatus: A });
}
function construirC(estado) {
  const cuerpo =
    extraerDe(SRC_D, 'function computeServiceEndWarningLocal(today)') + '\n' +
    'return computeServiceEndWarningLocal;';
  return new Function('state', 'PanoramaServiceStatus', cuerpo)(estado, { serviceStatus: A });
}

// `computeServiceEndWarning()` usa `new Date()` por dentro: no se le puede
// inyectar el dia. Asi que la tabla se construye RELATIVA AL HOY REAL, y los
// tres caminos miran el mismo reloj. (Si la prueba cruzara la medianoche justo
// en mitad, un caso podria desplazarse un dia; es despreciable y se dice.)
const HOY = new Date();
const dPlus = (n) => {
  const d = new Date(HOY.getFullYear(), HOY.getMonth(), HOY.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

const CASOS = [
  { id: 'C01', que: 'sin fechas', st: {} },
  { id: 'C02', que: 'serviceEnd invalido ("no-es-fecha")', st: { serviceEnd: 'no-es-fecha' } },
  { id: 'C03', que: 'serviceEnd vacio', st: { serviceEnd: '' } },
  { id: 'C04', que: 'fin HOY', st: { serviceEnd: dPlus(0) } },
  { id: 'C05', que: 'fin MAÑANA (+1)', st: { serviceEnd: dPlus(1) } },
  { id: 'C06', que: 'fin en 7 dias', st: { serviceEnd: dPlus(7) } },
  { id: 'C07', que: 'fin en 30 dias (borde dentro)', st: { serviceEnd: dPlus(30) } },
  { id: 'C08', que: 'fin en 31 dias (borde fuera)', st: { serviceEnd: dPlus(31) } },
  { id: 'C09', que: 'fin PASADO (hace 9 dias)', st: { serviceEnd: dPlus(-9) } },
  { id: 'C10', que: 'inicio FUTURO + fin lejano', st: { serviceStart: dPlus(3), serviceEnd: dPlus(400) } },
  { id: 'C11', que: 'inicio FUTURO + fin cercano  <-- divergia', st: { serviceStart: dPlus(3), serviceEnd: dPlus(20) } },
  { id: 'C12', que: 'inicio HOY', st: { serviceStart: dPlus(0), serviceEnd: dPlus(200) } },
  { id: 'C13', que: 'inicio PASADO (en marcha)', st: { serviceStart: dPlus(-100), serviceEnd: dPlus(200) } },
  { id: 'C14', que: 'degenerado: inicio == fin == hoy', st: { serviceStart: dPlus(0), serviceEnd: dPlus(0) } },
  { id: 'C15', que: 'inicio FUTURO + fin PASADO  <-- divergia', st: { serviceStart: dPlus(10), serviceEnd: dPlus(-10) } },
  { id: 'C16', que: 'prorroga estimada en 7 dias', st: { serviceEnd: dPlus(400), prorrogaEstimada: { fecha: dPlus(7) }, enProrroga: false } },
  { id: 'C17', que: 'prorroga estimada VENCIDA hace 5', st: { serviceEnd: dPlus(400), prorrogaEstimada: { fecha: dPlus(-5) }, enProrroga: false } },
  { id: 'C18', que: 'inicio FUTURO + prorroga  <-- divergia', st: { serviceStart: dPlus(3), serviceEnd: dPlus(400), prorrogaEstimada: { fecha: dPlus(7) }, enProrroga: false } },
  { id: 'C19', que: 'fin en 1 dia (singular)', st: { serviceEnd: dPlus(1) } },
  { id: 'C20', que: 'ya en prorroga confirmada', st: { serviceEnd: dPlus(10), prorrogaEstimada: { fecha: dPlus(7) }, enProrroga: true } },
  { id: 'C21', que: 'solo inicio (futuro), sin fin', st: { serviceStart: dPlus(5) } },
  { id: 'C22', que: 'solo inicio (pasado), sin fin', st: { serviceStart: dPlus(-5) } },
  { id: 'C23', que: 'solo fin', st: { serviceEnd: dPlus(12) } },
  { id: 'C24', que: 'inicio invalido + fin valido cercano', st: { serviceStart: 'xx', serviceEnd: dPlus(10) } },
  { id: 'C25', que: 'prorroga con fecha invalida', st: { serviceEnd: dPlus(400), prorrogaEstimada: { fecha: 'nope' }, enProrroga: false } },
  { id: 'C26', que: 'fin pasado + prorroga vencida (gana el mas grave)', st: { serviceEnd: dPlus(-40), prorrogaEstimada: { fecha: dPlus(-2) }, enProrroga: false } },
];

const firma = (r) => (r === null ? 'null' : [r.kind, r.level, r.days, r.message].join(' § '));
const corto = (r) => (r === null ? 'null' : r.kind + '/' + r.days);
const filas = [];
console.log('\n  id    kind/days        A===B===C   message');
console.log('  ' + '-'.repeat(104));
for (const c of CASOS) {
  const st = Object.assign({ serviceStart: null, serviceEnd: null, prorrogaEstimada: null, enProrroga: false }, c.st);
  let ra, rb, rc;
  try { ra = A(st, new Date()); } catch (e) { ra = { kind: 'EXCEPCION', level: '', days: null, message: e.message }; }
  try { rb = construirB(st)(1); } catch (e) { rb = { kind: 'EXCEPCION', level: '', days: null, message: e.message }; }
  try { rc = construirC(st)(new Date()); } catch (e) { rc = { kind: 'EXCEPCION', level: '', days: null, message: e.message }; }
  const identicos = firma(ra) === firma(rb) && firma(rb) === firma(rc);
  filas.push({ c, ra, rb, rc, identicos });
  console.log('  ' + c.id.padEnd(6) + corto(ra).padEnd(17) + (identicos ? 'si' : 'NO').padEnd(12) +
    (ra ? ra.message : '—').slice(0, 52));
  ok('E2-B ' + c.id + ' ' + c.que + ': A === B === C',
    identicos, JSON.stringify({ A: firma(ra), B: firma(rb), C: firma(rc) }));
}
ok('E2-B0 los ' + CASOS.length + ' casos dan identidad en los tres caminos',
  filas.every((f) => f.identicos), JSON.stringify(filas.filter((f) => !f.identicos).map((f) => f.c.id)));

// Los cuatro que ANTES divergian, nombrados uno a uno.
for (const id of ['C10', 'C11', 'C15', 'C18']) {
  const f = filas.find((x) => x.c.id === id);
  ok('E2-B* ' + id + ' (antes divergia) ahora los tres dicen lo mismo: ' + (f.ra ? f.ra.message : 'null'),
    f.identicos, JSON.stringify({ A: firma(f.ra), C: firma(f.rc) }));
}
// Y el dashboard ha adoptado el nivel que no tenia. Cambio VISIBLE e intencional.
{
  const c11 = filas.find((x) => x.c.id === 'C11');
  ok('E2-B30 el dashboard adopta "proximo-inicio": cambio visible y deliberado',
    c11.rc && c11.rc.level === 'proximo-inicio' && /^Arranca en /.test(c11.rc.message),
    JSON.stringify(firma(c11.rc)));
}

// =========================================================================
seccion('E2-C. WORDING CONSERVADO carácter a carácter');
// =========================================================================
// Los textos son los de main.js, la implementacion canonica. Se comprueban
// literales, no por patron: un espacio de mas seria una regresion visible.
const porId = (id) => filas.find((f) => f.c.id === id).ra;
const dd = (iso) => { const p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; };
ok('E2-C1 "Servicio finaliza en 7 días"', porId('C06').message === 'Servicio finaliza en 7 días', porId('C06').message);
ok('E2-C2 "Servicio finaliza en 1 día" (singular)', porId('C19').message === 'Servicio finaliza en 1 día', porId('C19').message);
ok('E2-C3 "Servicio finaliza en 0 días" con fin hoy', porId('C04').message === 'Servicio finaliza en 0 días', porId('C04').message);
ok('E2-C4 "Servicio finaliza en 30 días" en el borde', porId('C07').message === 'Servicio finaliza en 30 días', porId('C07').message);
ok('E2-C5 en 31 dias NO hay aviso', porId('C08') === null, JSON.stringify(porId('C08')));
ok('E2-C6 "Finalizó el dd/mm/aaaa" con la fecha reordenada a mano',
  porId('C09').message === 'Finalizó el ' + dd(CASOS.find((c) => c.id === 'C09').st.serviceEnd), porId('C09').message);
ok('E2-C7 "Arranca en 3 días"', porId('C10').message === 'Arranca en 3 días', porId('C10').message);
ok('E2-C8 "Prórroga estimada sin confirmar — quedan 7 días"',
  porId('C16').message === 'Prórroga estimada sin confirmar — quedan 7 días', porId('C16').message);
ok('E2-C9 "Prórroga estimada sin confirmar (venció hace 5 días)"',
  porId('C17').message === 'Prórroga estimada sin confirmar (venció hace 5 días)', porId('C17').message);
ok('E2-C10 una prorroga ya confirmada no genera aviso de prorroga',
  porId('C20').kind === 'finaliza-pronto', JSON.stringify(firma(porId('C20'))));

// =========================================================================
seccion('E2-D. SEMANTICA DE `days` — documentada Y comprobada');
// =========================================================================
const espera = [
  ['C10', 'proximo-inicio', 3, 'dias hasta el INICIO, positivo'],
  ['C21', 'proximo-inicio', 5, 'dias hasta el INICIO aunque no haya fin'],
  ['C06', 'finaliza-pronto', 7, 'dias hasta serviceEnd, positivo'],
  ['C04', 'finaliza-pronto', 0, 'cero el mismo dia del fin'],
  ['C09', 'finalizado', -9, 'NEGATIVO: ya paso'],
  ['C16', 'prorroga-pronto', 7, 'dias hasta la fecha de la prorroga'],
  ['C17', 'prorroga-vencida', -5, 'NEGATIVO, aunque el texto diga "hace 5 dias"'],
];
for (const [id, kind, days, nota] of espera) {
  const r = porId(id);
  ok('E2-D ' + id + ' kind=' + kind + ' days=' + days + '  (' + nota + ')',
    r && r.kind === kind && r.days === days, JSON.stringify(firma(r)));
}
ok('E2-D8 los estados vencidos llevan signo negativo, no su magnitud',
  porId('C09').days < 0 && porId('C17').days < 0);
ok('E2-D9 y el texto de prorroga vencida saca la magnitud con Math.abs',
  /Math\.abs\(diffEst\)/.test(SRC_H) || /venc = Math\.abs/.test(SRC_H));
ok('E2-D10 la semantica de `days` esta ESCRITA en el helper, no implicita',
  /SEMÁNTICA DE `days`/.test(SRC_H) && /proximo-inicio.*serviceStart/.test(SRC_H));
ok('E2-D11 y se proyecta como serviceStatusDays, NO serviceEndDays',
  /r\.serviceStatusDays = warn \? warn\.days : null;/.test(COD_M) &&
  COD_M.indexOf('serviceEndDays') < 0,
  'serviceEndDays en codigo: ' + COD_M.indexOf('serviceEndDays'));

// =========================================================================
seccion('E2-E. DESACOPLE: el texto ya no es fuente de datos');
// =========================================================================
ok('E2-E1 NO queda ninguna regex de numeros sobre serviceEndMessage',
  !/exec\([^)]*serviceEndMessage/.test(COD_M) && COD_M.indexOf('daysMatch') < 0,
  'daysMatch en codigo: ' + COD_M.indexOf('daysMatch'));
ok('E2-E2 el timeline usa serviceStatusDays',
  /const days = r\.serviceStatusDays;/.test(COD_M));
ok('E2-E3 "Finalizó el 09/12/2026" ya no puede convertirse en 9 dias: el handler no parsea nada',
  !/exec\(/.test(soloCodigo(extraerDe(SRC_M, "ipcMain.handle('portfolio:summary'"))),
  'queda algun exec() de codigo dentro del handler');
// El nivel 'rojo' sigue sin entrar en el timeline, igual que antes.
ok('E2-E4 y el criterio de que entra sigue siendo el MISMO (por nivel)',
  /if \(r\.serviceEndLevel === 'amarillo' \|\| r\.serviceEndLevel === 'proximo-inicio'\) \{/.test(COD_M));

// LA PRUEBA QUE IMPORTA: se carga una variante del helper con el wording
// CAMBIADO y se comprueba que el numero que usa el timeline NO se mueve.
{
  const SRC_MOD = SRC_H
    .replace("'Servicio finaliza en ' + diffFin + ' día' + plural(diffFin)",
      "'QUEDAN POCOS DIAS (ref 99/88) para cerrar el servicio'")
    .replace("'Arranca en ' + diffInicio + ' día' + plural(diffInicio)",
      "'EL SERVICIO EMPIEZA PRONTO (ref 77)'");
  ok('E2-E5 la variante de prueba tiene otro wording, sin el numero de dias',
    SRC_MOD !== SRC_H && /QUEDAN POCOS DIAS/.test(SRC_MOD) && /EL SERVICIO EMPIEZA PRONTO/.test(SRC_MOD));
  const AMOD = cargarHelper(SRC_MOD).serviceStatus;

  // La logica del timeline, extraida del handler real y ejecutada con filas
  // construidas por cada helper.
  const BANDS = [0, 5, 10, 15, 20, 25, 30];
  function timelineDe(helper) {
    const timeline = BANDS.slice(0, -1).map((lo, i) => ({ from: lo, to: BANDS[i + 1], events: 0 }));
    for (const c of [{ serviceEnd: dPlus(7) }, { serviceEnd: dPlus(22) }, { serviceStart: dPlus(3), serviceEnd: dPlus(400) }]) {
      const st = Object.assign({ serviceStart: null, serviceEnd: null, prorrogaEstimada: null, enProrroga: false }, c);
      const w = helper(st, new Date());
      const r = { serviceEndLevel: w ? w.level : null, serviceStatusDays: w ? w.days : null, serviceEndMessage: w ? w.message : null };
      if (r.serviceEndLevel === 'amarillo' || r.serviceEndLevel === 'proximo-inicio') {
        const days = r.serviceStatusDays;
        if (typeof days === 'number' && Number.isFinite(days) && days >= 0) {
          const band = timeline.find((b) => days >= b.from && days < b.to) || timeline[timeline.length - 1];
          band.events++;
        }
      }
    }
    return timeline.map((b) => b.events).join(',');
  }
  const conOriginal = timelineDe(A);
  const conWordingRoto = timelineDe(AMOD);
  console.log('        timeline con el wording real:      ' + conOriginal);
  console.log('        timeline con el wording cambiado:  ' + conWordingRoto);
  ok('E2-E6 CAMBIAR EL WORDING NO MUEVE EL TIMELINE: texto y logica desacoplados',
    conOriginal === conWordingRoto && conOriginal !== '0,0,0,0,0,0',
    JSON.stringify({ original: conOriginal, modificado: conWordingRoto }));
  // Y la contraprueba: el parser ANTIGUO si se habria roto con ese wording.
  {
    const w = AMOD({ serviceStart: null, serviceEnd: dPlus(7), prorrogaEstimada: null, enProrroga: false }, new Date());
    const viejo = /(\d+)/.exec(w.message || '');
    ok('E2-E7 contraprueba: el parser ANTIGUO habria sacado "' + (viejo ? viejo[1] : 'nada') + '" en vez de 7',
      !viejo || Number(viejo[1]) !== 7, 'mensaje: ' + w.message);
  }
}

console.log('\n' + '='.repeat(70));
console.log(`  E2 — una sola fuente de verdad: ${pass} OK, ${fail} FALLOS`);
if (fallos.length) fallos.forEach((f) => console.log('    - ' + f));
console.log('='.repeat(70));
process.exitCode = fail === 0 ? 0 : 1;
