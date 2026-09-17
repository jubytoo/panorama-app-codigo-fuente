'use strict';
// ---------------------------------------------------------------------------
// F1 — INTERPRETACIÓN DE DATOS COMO HTML. BATERÍA EXIGENTE.
//
// Nació DESCRIPTIVA (daba verde porque describía los sinks que HABÍA). Desde
// la implementación de F1 (16 sept 2026) **exige la corrección**: si alguien
// quita un escape, esta batería se pone roja.
//
// Tres capas:
//   1. EJECUTADA — los CONSTRUCTORES de HTML reales (extraídos por firma de
//      las plantillas y de main.js) se ejecutan con un marcador INOCUO en cada
//      campo, junto con los helpers REALES del propio archivo. Se exige que el
//      marcador salga como TEXTO y que no cree ni etiqueta ni handler.
//   2. ESTÁTICA — custodia de lo que no debe volver atrás (selectores con
//      CSS.escape, sin handlers inline construidos con datos, sinks que siguen
//      siendo seguros) e inventario por pantalla.
//   3. Lo que necesita un DOM y un Electron de verdad va en
//      `real-run/f1-inyeccion.js` (`f1/electron-f1.ps1`).
//
// El marcador no hace nada peligroso: una <b> con marca, un atributo `data-f1a`
// y una imagen con `src` a un archivo local inexistente cuyo `onerror` solo
// pondría un atributo en <html>. Nada de red, nada destructivo, ninguna API.
//
// Secciones, según lo pedido:
//   F1-A texto literal · F1-B cero elementos · F1-C cero handlers
//   F1-E ids especiales en selectores · F1-F </textarea> dentro del valor
//   F1-G logo con esquema no permitido · F1-H seed round-trip exacto
//   F1-K custodia de lo que NO se toca · F1-I inventario · F1-Z alcance
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const LEE = (rel, env) => fs.readFileSync(process.env[env] || path.join(PROJ, rel), 'utf8');
const MAIN = LEE('main.js', 'PANORAMA_MAIN');
const DASH = LEE('dashboard/plantilla_dashboard.html', 'PANORAMA_DASHBOARD');
const DIRE = LEE('directorio/plantilla_directorio.html', 'PANORAMA_DIRECTORIO');
const EVAL = LEE('evaluacion-candidatos/plantilla_evaluacion_candidatos.html', 'PANORAMA_EVAL');
const PREP = LEE('preparacion-reunion/plantilla_preparacion_reunion.html', 'PANORAMA_PREP');
const LREN = LEE('launcher/renderer.js');
const LIDX = LEE('launcher/index.html');
const BREN = LEE('backup-picker/renderer.js');
const MODAL = LEE('vendor/modal.js');
const DOC = (n) => fs.readFileSync(path.join(PROJ, 'claude', n), 'utf8');
for (const v of ['PANORAMA_MAIN', 'PANORAMA_DASHBOARD', 'PANORAMA_DIRECTORIO', 'PANORAMA_EVAL', 'PANORAMA_PREP']) {
  if (process.env[v]) console.log('  [' + v + '] ' + process.env[v]);
}

let pass = 0, fail = 0; const fallos = [];
function ok(n, c, extra) {
  if (c) { pass++; console.log('  OK    ' + n); }
  else { fail++; fallos.push(n); console.log('  FALLO ' + n + (extra === undefined ? '' : '  -- ' + extra)); }
}
function seccion(t) { console.log('\n=== ' + t + ' ==='); }
function nota(s) { console.log('        ' + s); }
const soloCodigo = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const cuenta = (s, re) => (s.match(re) || []).length;

function extraerDe(src, firma) {
  const i = src.indexOf(firma);
  if (i < 0) throw new Error('NO SE ENCONTRO: ' + firma);
  let j = src.indexOf('{', i), prof = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (prof === 0) return src.slice(i, k + 1); }
  }
  throw new Error('no delimitado: ' + firma);
}

// --- el marcador inocuo -------------------------------------------------------
// Rompe los contextos que aparecen en las plantillas: texto, atributo entre
// comillas dobles, <textarea>, <select> y <script type=application/json>.
const P = (c) => `F1" data-f1a="${c}" x="</textarea></script></select>` +
  `<b data-f1="${c}">B</b><img src="f1-no-existe.png" data-f1="${c}" ` +
  `onerror="document.documentElement.setAttribute('data-f1x-'+this.dataset.f1,'1')">`;

// Las TRES propiedades que exige F1, sobre el HTML que devuelve un constructor:
//   · creaEtiqueta  -> el marcado saldría como elemento (<b>/<img> reales)
//   · creaHandler   -> quedaría un onerror= vivo salido del dato
//   · rompeAtributo -> una comilla del dato cierra el atributo e inyecta otro
const creaEtiqueta = (h, c) => h.includes(`<img src="f1-no-existe.png" data-f1="${c}"`) || h.includes(`<b data-f1="${c}">`);
// ¿La posición `i` cae DENTRO de una etiqueta? Se mira hacia atrás: si el
// primer `<` o `>` que aparece es un `<`, estamos dentro de un tag. Esto es lo
// que distingue una comilla que ROMPE un atributo de una comilla que es
// simple texto inocuo — en contexto de texto no hay nada que romper, y por eso
// escapeHtml (que no toca las comillas) es correcto ahí.
function dentroDeTag(h, i) {
  for (let k = i; k >= 0; k--) {
    if (h[k] === '>') return false;
    if (h[k] === '<') return true;
  }
  return false;
}
function rompeAtributo(h, c) {
  const aguja = `F1" data-f1a="${c}"`;
  let i = h.indexOf(aguja);
  while (i >= 0) {
    if (dentroDeTag(h, i)) return true;
    i = h.indexOf(aguja, i + 1);
  }
  return false;
}
// Un handler del dato solo puede existir si el marcado llegó a ser etiqueta, o
// si una comilla rompió un atributo y permitió colar otro (que en un ataque
// real sería un `onerror=`).
const creaHandler = (h, c) => creaEtiqueta(h, c) || rompeAtributo(h, c);
// Literal = el dato se ve, pero con `<` neutralizado (texto o RCDATA).
const literal = (h, c) => h.includes(`&lt;img src=&quot;f1-no-existe.png&quot; data-f1=&quot;${c}&quot;`)
  || h.includes(`&lt;img src="f1-no-existe.png" data-f1="${c}"`);
// Lo que se exige en TODO sink con dato: ni etiqueta, ni handler, ni atributo roto.
function inerte(h, c) { return !creaEtiqueta(h, c) && !creaHandler(h, c) && !rompeAtributo(h, c); }

// =============================================================================
seccion('F1-A/B/C. DASHBOARD — CONSTRUCTORES REALES CON EL MARCADOR');
// =============================================================================
const ESCRIPT_DASH = DASH.slice(DASH.indexOf('<script>', DASH.indexOf('id="factory-seed"')));
// Los helpers REALES entran en el ámbito: la batería prueba el escape de
// producción, no una copia suya.
const HELPERS_DASH = ['function escapeHtml(s)', 'function escapeAttr(s)', 'function logoSrcSeguro(v)'];
const FUNCS_DASH = ['function confirmDeleteBar(type, id, label)', 'function milestoneSnoozeBar(m)',
  'function milestoneDetailHtml(m)', 'function entregableRowHtml(idx, ent, showFecha)', 'function milestoneEditForm(m)',
  'function riskDetailHtml(r)', 'function riskFieldsTemplate(prefix, r)', 'function skillFieldsTemplate(prefix, s)',
  'function statusPillHTML(t)', 'function teamFieldsTemplate(prefix, t)', 'function coverageFieldsTemplate(prefix, c)'];
const CUERPO_DASH = HELPERS_DASH.concat(FUNCS_DASH).map((f) => extraerDe(ESCRIPT_DASH, f)).join('\n');
const D = new Function('state', 'ui', 'fmt', 'todayStr',
  'const F1_HTML = ' + extraerDe(ESCRIPT_DASH, 'const F1_HTML =').replace('const F1_HTML =', '') + ';\n' +
  'const F1_LOGO_MIME = ' + /const F1_LOGO_MIME = (\/.*\/i);/.exec(ESCRIPT_DASH)[1] + ';\n' +
  CUERPO_DASH + '\nreturn {' + HELPERS_DASH.concat(FUNCS_DASH).map((f) => f.match(/function (\w+)/)[1]).join(',') + '};')(
  { team: [{ role: P('cov-opcion-rol'), status: 'activo' }], skillMatrixRoles: [P('rol-columna')] },
  { coveragePrefillRole: '' }, () => '01/09/2026', () => '2026-09-16');

const T = {};
T.confirmDelete = D.confirmDeleteBar('milestone', 'm1', P('confirmar-borrado'));
T.snooze = D.milestoneSnoozeBar({ id: 'm1', label: P('posponer-hito') });
T.detalle = D.milestoneDetailHtml({ id: 'm1', recurrente: false, descripcion: P('hito-descripcion'),
  entregables: [{ id: 'e1', tipo: P('ent-tipo'), nombre: P('ent-nombre'), ruta: P('ent-ruta'), entregado: true }] });
T.entregable = D.entregableRowHtml(0, { id: P('ent-id'), tipo: 'Otro', tipoCustom: P('ent-tipocustom'), nombre: P('ent-nombre-form'),
  ruta: P('ent-ruta-form'), entregado: true, fecha: P('ent-fecha') }, true);
T.editHito = D.milestoneEditForm({ id: 'm1', label: P('hito-label-form'), date: P('hito-fecha'), actualDate: '', recurrente: false,
  descripcion: P('hito-desc-form') });
T.riesgoDet = D.riskDetailHtml({ mitigacion: P('riesgo-mit'), contingencia: P('riesgo-cont'), respMitigacion: P('riesgo-respmit'),
  respContingencia: P('riesgo-respcont'), fechaMaterializacion: '2026-09-01', obsMaterializacion: P('riesgo-obsmat'),
  respMaterializacion: P('riesgo-respmat'), fechaCierre: null });
T.riesgoForm = D.riskFieldsTemplate('rk-edit', { title: P('riesgo-title-form'), category: 'Contractual', p: 1, i: 1,
  mitigacion: P('riesgo-mit-form'), contingencia: P('riesgo-cont-form'), respMitigacion: P('riesgo-respmit-form'),
  respContingencia: P('riesgo-respcont-form'), fechaDeteccion: '2026-09-01', fechaMaterializacion: '2026-09-02',
  fechaCierre: '2026-09-03', obsMaterializacion: P('riesgo-obsmat-form'), obsCierre: P('riesgo-obscierre-form'),
  respMaterializacion: '', respCierre: '' });
T.skillForm = D.skillFieldsTemplate('sk-edit', { name: P('skill-name-form'), group: P('skill-group-form'), levels: [1], pending: false });
T.pill = D.statusPillHTML({ id: P('equipo-id'), status: 'activo', scheduledExit: null });
T.teamForm = D.teamFieldsTemplate('tm-edit', { alias: P('equipo-alias-form'), role: P('equipo-rol-form'), date: '', status: 'activo',
  dni: P('equipo-dni-form'), email: '', telefono: '' });
T.covForm = D.coverageFieldsTemplate('cov-edit', { roleSnapshot: P('cov-rol-form'), motivo: 'Ausencia', fechaInicio: '',
  fechaFin: '', cubiertoPor: '', dni: '', email: '', telefono: '', notas: P('cov-notas-form') });

// Todos los campos que pasaron por un constructor: NINGUNO puede crear
// etiqueta, handler ni romper atributo. Esto es F1-A + F1-B + F1-C a la vez.
const CAMPOS = [
  ['confirmDelete', 'confirmar-borrado'], ['snooze', 'posponer-hito'],
  ['detalle', 'hito-descripcion'], ['detalle', 'ent-tipo'], ['detalle', 'ent-nombre'], ['detalle', 'ent-ruta'],
  ['entregable', 'ent-id'], ['entregable', 'ent-fecha'], ['entregable', 'ent-nombre-form'],
  ['entregable', 'ent-tipocustom'], ['entregable', 'ent-ruta-form'],
  ['editHito', 'hito-fecha'], ['editHito', 'hito-label-form'], ['editHito', 'hito-desc-form'],
  ['riesgoDet', 'riesgo-mit'], ['riesgoDet', 'riesgo-cont'], ['riesgoDet', 'riesgo-obsmat'],
  ['riesgoDet', 'riesgo-respmit'], ['riesgoDet', 'riesgo-respcont'], ['riesgoDet', 'riesgo-respmat'],
  ['riesgoForm', 'riesgo-title-form'], ['riesgoForm', 'riesgo-mit-form'], ['riesgoForm', 'riesgo-cont-form'],
  ['riesgoForm', 'riesgo-obsmat-form'], ['riesgoForm', 'riesgo-obscierre-form'],
  ['riesgoForm', 'riesgo-respmit-form'], ['riesgoForm', 'riesgo-respcont-form'],
  ['skillForm', 'skill-name-form'], ['skillForm', 'skill-group-form'], ['skillForm', 'rol-columna'],
  ['pill', 'equipo-id'],
  ['teamForm', 'equipo-alias-form'], ['teamForm', 'equipo-rol-form'], ['teamForm', 'equipo-dni-form'],
  ['covForm', 'cov-rol-form'], ['covForm', 'cov-notas-form'], ['covForm', 'cov-opcion-rol'],
];
let inertes = 0;
for (const [trozo, campo] of CAMPOS) {
  const h = T[trozo];
  const bien = inerte(h, campo);
  if (bien) inertes++;
  ok(`F1-A ${trozo}.${campo}: inerte (ni etiqueta, ni handler, ni atributo roto)`, bien,
    JSON.stringify({ etiqueta: creaEtiqueta(h, campo), handler: creaHandler(h, campo), atributo: rompeAtributo(h, campo) }));
}
ok(`F1-B los ${CAMPOS.length} campos del dashboard son inertes`, inertes === CAMPOS.length, `${inertes}/${CAMPOS.length}`);
// F1-C: ningún campo deja un handler vivo. Se usa el mismo criterio de
// contexto que arriba — un `onerror=` que aparece como TEXTO escapado (dentro
// de `&lt;img …&gt;`) no es un handler, es la prueba de que el escape funcionó.
ok('F1-C ningún constructor deja un handler salido del dato',
  !CAMPOS.some(([trozo, campo]) => creaHandler(T[trozo], campo)),
  JSON.stringify(CAMPOS.filter(([tr, ca]) => creaHandler(T[tr], ca))));
// Y el dato SIGUE VIÉNDOSE (escapar no es borrar).
ok('F1-A-bis el texto del dato sigue presente, escapado (no se ha perdido contenido)',
  literal(T.confirmDelete, 'confirmar-borrado') || T.confirmDelete.includes('&lt;b data-f1='),
  T.confirmDelete.slice(0, 160));

// =============================================================================
seccion('F1-F. <textarea> — el cierre se queda DENTRO del valor');
// =============================================================================
// Un `</textarea>` en el dato tiene que llegar escapado: si llegara crudo,
// cerraría el campo y lo de después sería markup.
const TEXTAREAS = [['editHito', 'hito-desc-form'], ['riesgoForm', 'riesgo-mit-form'], ['riesgoForm', 'riesgo-cont-form'],
  ['riesgoForm', 'riesgo-obsmat-form'], ['riesgoForm', 'riesgo-obscierre-form'], ['covForm', 'cov-notas-form']];
for (const [trozo, campo] of TEXTAREAS) {
  const h = T[trozo];
  // Dos condiciones: el cierre del dato aparece ESCAPADO, y no hay más
  // `</textarea>` reales que `<textarea` — es decir, el dato no ha añadido un
  // cierre propio que sacara el resto del campo.
  const aperturas = cuenta(h, /<textarea\b/g);
  const cierres = cuenta(h, /<\/textarea>/g);
  ok(`F1-F ${trozo}.${campo}: el </textarea> del dato va escapado y no cierra el campo`,
    h.includes('&lt;/textarea&gt;') && aperturas === cierres,
    JSON.stringify({ aperturas, cierres, escapado: h.includes('&lt;/textarea&gt;') }));
}
ok('F1-F7 ningún <textarea> del dashboard interpola ya sin escapar',
  cuenta(DASH, /<textarea[^>]*>\$\{(?!escapeHtml)/g) === 0,
  String(cuenta(DASH, /<textarea[^>]*>\$\{(?!escapeHtml)/g)));

// =============================================================================
seccion('F1-G. LOGO — solo imagen dataURL base64');
// =============================================================================
const LOGOS_MALOS = ['javascript:alert(1)', 'http://ejemplo/x.png', 'https://ejemplo/x.png', 'file:///C:/x.png',
  'C:/Users/x/foto.png', '/etc/passwd', 'data:text/html;base64,PHNjcmlwdD4=', 'data:image/png,noEsBase64',
  'x" data-f1a="logo" onerror="1', ''];
for (const malo of LOGOS_MALOS) {
  ok(`F1-G rechaza ${JSON.stringify(malo).slice(0, 44)}`, D.logoSrcSeguro(malo) === null);
}
const LOGOS_BUENOS = ['data:image/png;base64,iVBORw0KGgo=', 'data:image/jpeg;base64,/9j/4AAQ',
  'data:image/gif;base64,R0lGODlh', 'data:image/webp;base64,UklGRg==', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='];
for (const bueno of LOGOS_BUENOS) {
  ok(`F1-G acepta el formato legítimo ${bueno.slice(0, 26)}…`, D.logoSrcSeguro(bueno) === bueno);
}
ok('F1-G11 el dashboard ya no interpola el logo dentro del HTML de la cabecera',
  !/<img src="\$\{state\.corporateLogo\}"/.test(DASH) && /img\.src = logoOk;/.test(DASH));
ok('F1-G12 el Directorio valida el logo igual (cabecera y panel)',
  /function logoSrcSeguro\(v\)/.test(DIRE) && /const logoOk = logoSrcSeguro\(state\.corporateLogo\);/.test(DIRE)
  && !/<img src="\$\{state\.corporateLogo\}"/.test(DIRE));

// =============================================================================
seccion('F1-H. FACTORY SEED — round-trip EXACTO y sin poder cerrar el <script>');
// =============================================================================
const CUERPO_SEED = ['function serializarSeedParaScript(seed)', 'function writeFactorySeedIntoTemplate(projectId, seed)',
  'function regenerateProjectDashboardFile(projectId, projectTitle, serviceStart)'].map((f) => extraerDe(MAIN, f)).join('\n');
let escrito = null;
const S = new Function('fs', 'fixVendorScriptPaths', 'readStockTemplate', 'projectDashboardFile',
  CUERPO_SEED + '\nreturn { serializarSeedParaScript, writeFactorySeedIntoTemplate, regenerateProjectDashboardFile };')(
  { writeFileSync: (f, c) => { escrito = c; } },
  (h) => h, () => DASH, () => 'X:/sandbox/dashboard.html');

const TITULOS = ['</script><img src=x onerror=alert(1)>', 'con $& dentro', "con $' dentro", 'con $` dentro',
  'con $1 dentro', 'signos < > & " \' juntos', 'acentos áéíóú ñ y emoji 🚩', '</SCRIPT >', P('titulo-seed')];
for (const titulo of TITULOS) {
  escrito = null;
  S.regenerateProjectDashboardFile(1, titulo, '2026-01-01');
  const m = /<script type="application\/json" id="factory-seed">([\s\S]*?)<\/script>/.exec(escrito);
  let leido = null;
  try { leido = JSON.parse(m[1]); } catch (e) { leido = { error: String(e.message) }; }
  const entre = escrito.slice(escrito.indexOf('id="factory-seed">'), escrito.indexOf('</script>', escrito.indexOf('id="factory-seed">')));
  ok(`F1-H round-trip exacto de ${JSON.stringify(titulo).slice(0, 40)}`,
    !!m && leido && leido.projectTitle === titulo,
    JSON.stringify({ leido: leido && leido.projectTitle }));
  ok(`F1-H el dato no cierra el <script> ni deja markup: ${JSON.stringify(titulo).slice(0, 30)}`,
    !/<\/script/i.test(entre) && !entre.includes('<img'),
    entre.slice(0, 120));
}
// Los campos del seed no se pierden (§6).
escrito = null;
S.writeFactorySeedIntoTemplate(1, { projectTitle: 'T</script>', serviceStart: '2026-01-01', serviceEnd: '2026-12-31',
  skillMatrixRoles: ['A"B', 'C<D'], phases: [{ id: 'f1', name: 'Fase <b>' }] });
// Con el seed roto (p. ej. tras la reversión B) esto no debe reventar la
// batería entera: tiene que dar un FALLO limpio y dejar correr el resto.
let seedLeido = null, seedError = null;
try {
  seedLeido = JSON.parse(/<script type="application\/json" id="factory-seed">([\s\S]*?)<\/script>/.exec(escrito)[1]);
} catch (e) { seedError = String(e.message); }
ok('F1-H-campos el seed conserva título, serviceStart, serviceEnd, roles y fases',
  !!seedLeido && seedLeido.projectTitle === 'T</script>' && seedLeido.serviceStart === '2026-01-01' && seedLeido.serviceEnd === '2026-12-31'
  && seedLeido.skillMatrixRoles[0] === 'A"B' && seedLeido.skillMatrixRoles[1] === 'C<D' && seedLeido.phases[0].name === 'Fase <b>',
  seedError ? 'el seed no se puede releer: ' + seedError : JSON.stringify(seedLeido));
ok('F1-H-replace el reemplazo usa una FUNCIÓN (si no, `$&`/`$\'` tendrían semántica)',
  /\.replace\(\s*\/<script type="application\\\/json" id="factory-seed">\[\\s\\S\]\*\?<\\\/script>\/,\s*(\/\/[^\n]*\n\s*)*\(\)\s*=>\s*seedTag/.test(MAIN)
  || /\(\)\s*=>\s*seedTag/.test(MAIN));
ok('F1-H-escape serializarSeedParaScript escapa `<` como \\u003c',
  S.serializarSeedParaScript({ a: '<' }) === '{"a":"\\u003c"}', S.serializarSeedParaScript({ a: '<' }));

// =============================================================================
seccion('F1-E. SELECTORES — un id con caracteres especiales no rompe el render');
// =============================================================================
// No hay DOM aquí: se exige que el selector se construya con CSS.escape (lo que
// hace válido cualquier id) y se comprueba que el propio CSS.escape neutraliza
// los caracteres que antes lanzaban SyntaxError. El render real va en Electron.
const SELECTORES_EVAL = [
  ['input[data-action="task-name"]', /input\[data-action="task-name"\]\[data-task="\$\{CSS\.escape\(String\(t\.id\)\)\}"\]/],
  ['textarea[data-action="task-guide"]', /textarea\[data-action="task-guide"\]\[data-task="\$\{CSS\.escape\(String\(t\.id\)\)\}"\]/],
  ['span[data-task-name]', /span\[data-task-name="\$\{CSS\.escape\(String\(t\.id\)\)\}"\]/],
  ['input[data-action="ev-comentario"]', /input\[data-action="ev-comentario"\]\[data-task="\$\{CSS\.escape\(String\(t\.id\)\)\}"\]/],
  ['.card[data-puesto-card]', /\.card\[data-puesto-card="\$\{CSS\.escape\(String\(puesto\.id\)\)\}"\]/],
  ['.puesto-tasks-wrap', /\.puesto-tasks-wrap\[data-id="\$\{CSS\.escape\(String\(id\)\)\}"\]/],
  ['.eval-tasks-wrap', /\.eval-tasks-wrap\[data-id="\$\{CSS\.escape\(String\(id\)\)\}"\]/],
  ['textarea[data-action="ev-feedback"]', /textarea\[data-action="ev-feedback"\]\[data-id="\$\{CSS\.escape\(String\(t\.dataset\.id\)\)\}"\]/],
];
for (const [que, re] of SELECTORES_EVAL) ok(`F1-E ${que} se construye con CSS.escape`, re.test(EVAL));
ok('F1-E9 no queda ningún selector de Evaluación con el id crudo',
  cuenta(EVAL, /querySelector(All)?\(`[^`]*\$\{(?!CSS\.escape)[^}]*\.id/g) === 0);
// CSS.escape de Node 24 (misma semántica que el navegador) sobre los casos pedidos.
const CSSesc = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape : (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c);
for (const id of ['con"comilla', 'con espacio', 'con#almohadilla', 'con[corchete', 'con]cierre', 'con.punto', 'con:dospuntos']) {
  const sel = `[data-task="${CSSesc(id)}"]`;
  ok(`F1-E id ${JSON.stringify(id)} produce un selector sin romper`, !/[^\\]"/.test(sel.slice(12, -2)) || sel.includes('\\'));
}

// =============================================================================
seccion('F1-P. PREPARACIÓN — sin handler inline y con el dato escapado dentro del markup propio');
// =============================================================================
ok('F1-P1 renderSeg ya no construye onclick con el id', !/onclick="setDecision\('\$\{id\}'/.test(PREP));
ok('F1-P2 el id viaja por data-seg-id escapado y lo recoge un listener delegado',
  /data-seg-id="\$\{esc\(id\)\}"/.test(PREP) && /closest\('button\[data-seg-id\]'\)/.test(PREP));
ok('F1-P3 ninguna plantilla construye ya un handler inline desde datos',
  ![DASH, DIRE, EVAL, PREP, LREN].some((s) => /\son(click|error|load|change|mouseover)="[^"]*\$\{/.test(soloCodigo(s))));
const CAND = ['t.role', 'm.label', 'e.nombre', 'e.tipo', 'r.id', 'r.title'];
for (const campo of CAND) {
  const re = new RegExp('\\$\\{esc\\(' + campo.replace('.', '\\.') + '\\)\\}');
  ok(`F1-P4 el candidato escapa ${campo} dentro de su markup`, re.test(PREP));
}
ok('F1-P5 el markup PROPIO del guion se conserva (no se ha convertido todo a texto)',
  /<span class="flag">/.test(PREP) && /<li>\$\{t\}<\/li>/.test(PREP));
ok('F1-P6 el .txt del guion deshace el escapado (no salen entidades al exportar)',
  /desescapar\(t\.replace\(\/<\[\^>\]\+>\/g,''\)\)/.test(PREP) && /function desescapar\(s\)/.test(PREP));
// desescapar(esc(x)) === x, ejecutado de verdad
const PF = new Function(extraerDe(PREP, 'function esc(s)') + '\n' + extraerDe(PREP, 'function desescapar(s)')
  + '\nreturn { esc, desescapar };')();
for (const x of ['a<b>c', 'comillas " y \'', 'amper & solo', '&lt;ya escapado&gt;', P('ida-vuelta')]) {
  ok(`F1-P7 desescapar(esc(x)) === x para ${JSON.stringify(x).slice(0, 34)}`, PF.desescapar(PF.esc(x)) === x);
}

// =============================================================================
seccion('F1-V. EVALUACIÓN Y DIRECTORIO — los residuos crudos, cerrados');
// =============================================================================
ok('F1-V1 Evaluación: el peso ya no va crudo ni en atributo ni en texto',
  /value="\$\{escapeAttr\(t\.weight\)\}"/.test(EVAL) && /<td>\$\{escapeHtml\(t\.weight\)\}<\/td>/.test(EVAL));
ok('F1-V2 Evaluación: la fecha de entrevista va escapada', /value="\$\{escapeAttr\(ev\.fecha\)\}"/.test(EVAL));
ok('F1-V3 Evaluación: no quedan data-* con el id crudo',
  cuenta(EVAL, /\sdata-(id|task|puesto|task-name)="\$\{(?!escapeAttr)[^}]*\}"/g) === 0,
  String(cuenta(EVAL, /\sdata-(id|task|puesto|task-name)="\$\{(?!escapeAttr)[^}]*\}"/g)));
ok('F1-V4 Directorio: data-dedic escapado y su lector sigue leyendo por dataset',
  /data-dedic="\$\{escapeHtml\(a\.proyecto\)\}"/.test(DIRE) && /const proj = inp\.dataset\.dedic;/.test(DIRE));
ok('F1-V5 Directorio: lo que ya escapaba sigue escapando (no se ha tocado)',
  /\$\{escapeHtml\(p\.nombre\)\}/.test(DIRE) && /\$\{escapeHtml\(a\.rol\|\|'sin rol'\)\}/.test(DIRE));
ok('F1-V6 Evaluación: lo que ya escapaba sigue igual (candidato, puesto, tarea, guía)',
  /value="\$\{escapeAttr\(ev\.candidato\)\}"/.test(EVAL) && /\$\{escapeHtml\(t\.name\)\}/.test(EVAL)
  && /renderGuideRich\(t\.guide\)/.test(EVAL));

// =============================================================================
seccion('F1-S. <select> DEL HISTORIAL — ya no depende del parser');
// =============================================================================
ok('F1-S1 las opciones del historial se crean por DOM (textContent/value)',
  /function opcionHistorial\(valor, texto\)/.test(DASH) && /o\.textContent = texto;/.test(DASH));
ok('F1-S2 ya no se asigna innerHTML al <select> del historial',
  !/sel\.innerHTML/.test(DASH) && /pintarOpciones\(sel,/.test(DASH));

// =============================================================================
seccion('F1-K. CUSTODIA — lo que NO debe tocarse');
// =============================================================================
ok('F1-K1 vendor/modal.js sigue pintando por textContent, sin innerHTML',
  /h\.textContent = title;/.test(MODAL) && /msg\.textContent = message;/.test(MODAL) && !/innerHTML/.test(MODAL));
ok('F1-K2 main.js sigue sin innerHTML ni document.write', !/\.innerHTML|document\.write/.test(soloCodigo(MAIN)));
ok('F1-K3 ninguna plantilla usa srcdoc ni document.write',
  ![DASH, DIRE, EVAL, PREP, LIDX].some((s) => /srcdoc|document\.write\s*\(/.test(soloCodigo(s))));
ok('F1-K4 el selector de backups sigue construyendo sus filas por createElement', !/innerHTML\s*=\s*`?\$\{/.test(BREN));
ok('F1-K5 el lanzador sigue escapando nombre y cliente del proyecto',
  /escapeHtml\(p\.name\)/.test(LREN) && /escapeHtml\(p\.client \|\| 'Sin cliente asociado'\)/.test(LREN));
ok('F1-K6 se conserva el markup legítimo del dashboard (badges, banderas, semáforos)',
  /<span class="ent-tipo-badge"/.test(DASH) && /<span class="sm-pending">/.test(DASH) && /<span class="ms-semaforo/.test(DASH));
ok('F1-K7 los desplegables de constantes internas siguen sin escape (números y enums)',
  /\[1,2,3,4\]\.map\(v=>`<option value="\$\{v\}"/.test(DASH) && /\['Acta','Informe','Otro'\]/.test(DASH));
ok('F1-K8 `ruta` sigue exigiendo http(s) para hacerse enlace (no se admite javascript:)',
  /\/\^https\?:\\\/\\\/\/i\.test\(e\.ruta\)/.test(DASH) && /target="_blank" rel="noopener"/.test(DASH));
ok('F1-K9 el dashboard sigue teniendo sus 76 innerHTML: se ha escapado el DATO, no reescrito la vista',
  cuenta(DASH, /\.innerHTML\s*\+?=(?!=)/g) >= 70, String(cuenta(DASH, /\.innerHTML\s*\+?=(?!=)/g)));

// =============================================================================
seccion('F1-I. INVENTARIO — el dashboard ya tiene escape propio');
// =============================================================================
ok('F1-I1 el dashboard ya define escapeHtml y escapeAttr (era la única plantilla sin escape)',
  /function escapeHtml\(s\)/.test(DASH) && /function escapeAttr\(s\)/.test(DASH));
ok('F1-I2 son DOS funciones distintas: el atributo escapa comillas y el texto no hace falta',
  D.escapeAttr('a"b\'c') === 'a&quot;b&#39;c' && D.escapeHtml('a"b') === 'a"b' && D.escapeHtml('a<b&c') === 'a&lt;b&amp;c');
ok('F1-I3 ya no queda escapado ad hoc (`&quot;`/`&lt;` sueltos) en los constructores',
  cuenta(DASH, /\.replace\(\/"\/g,'&quot;'\)/g) === 0 && cuenta(DASH, /\.replace\(\/<\/g,'&lt;'\)/g) <= 1,
  JSON.stringify({ comillas: cuenta(DASH, /\.replace\(\/"\/g,'&quot;'\)/g), menor: cuenta(DASH, /\.replace\(\/<\/g,'&lt;'\)/g) }));
nota('El único `&lt;` que queda es el del cartel de error fatal, que no puede depender de los helpers.');

// =============================================================================
seccion('F1-Z. ALCANCE');
// =============================================================================
const AUD = DOC('auditoria-2026-09-13.md');
// F3 se cerró en su propia ronda (17 sept 2026) y F2 sigue abierto. Lo que
// custodia esta aserción no cambia: que ninguno de los dos se tocara DENTRO
// de F1.
ok('F1-Z1 F2 sigue ABIERTO y F3 se cerró en su propia ronda, fuera de F1',
  /\*\*F2\*\* \| \*\*ABIERTO — DIAGNOSTICADO\*\*/.test(AUD) && /\*\*F3\*\* \| \*\*CERRADO\*\*/.test(AUD));
// F1 NO toca psConfirm/bridge (eso es defensa en profundidad, otro hallazgo):
// se custodia que sigan EXACTAMENTE como estaban.
ok('F1-Z2 psConfirm y el puente siguen intactos (F1 no los toca)',
  /const code = `window\.psConfirm\(\$\{JSON\.stringify\(String\(message\)\)\}/.test(MAIN)
  && /projectMenuAction: \(action\) => ipcRenderer\.invoke\('projectMenu:action'/.test(LEE('preload.js')));

console.log('\n======================================================================');
console.log(`  F1: ${pass} OK / ${fail} FALLOS`);
console.log('======================================================================');
if (fail) { console.log('  Fallos:'); fallos.forEach((f) => console.log('   · ' + f)); process.exit(1); }
console.log('  Batería EXIGENTE: si alguien quita un escape, esto se pone rojo.');
