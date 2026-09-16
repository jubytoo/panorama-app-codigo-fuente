'use strict';
// ---------------------------------------------------------------------------
// P12 — SIN RANGO TEMPORAL DEMOSTRABLE NO SE INFIERE PROGRESO.
//
// HISTORIA. Esta bateria nacio DESCRIBIENDO el defecto (43 OK/0 con el codigo
// roto): coordenadas SVG con NaN, "NaN%" en el KPI, "INVALID DATE" en la
// cabecera y propagacion hasta `executiveStatus()`, el resumen ejecutivo
// copiable y la exportacion a PowerPoint. Desde el 15 sept 2026 EXIGE el
// comportamiento correcto.
//
// La regla implementada, en una sola nocion (`rangoTemporalValido`):
//   start valida + end valida + end > start.
//   Si no se cumple -> progreso 0%, dias 0/0, y los elementos que AFIRMAN una
//   posicion en el tiempo NO se dibujan. Ni NaN, ni Infinity, ni un 100% falso,
//   ni un "hoy" colocado en el origen.
//   Si se cumple -> exactamente lo de siempre, sin cambiar un bit.
//
// Dos capas:
//   A) UNITARIA     — `rangoTemporalValido`/`clamp`/`pctOf` EXTRAIDAS del HTML.
//   B) INTEGRACION  — `renderRail()` EXTRAIDA y EJECUTADA contra un DOM doble.
//
// Solo lectura: no toca la BD viva, ni produccion, ni escribe nada.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const DASH = process.env.PANORAMA_DASHBOARD || path.join(PROJ, 'dashboard', 'plantilla_dashboard.html');
const SRC = fs.readFileSync(DASH, 'utf8');

let pass = 0, fail = 0; const fallos = [];
function ok(n, c, extra) {
  if (c) { pass++; console.log('  OK    ' + n); }
  else { fail++; fallos.push(n); console.log('  FALLO ' + n + (extra ? '  -- ' + extra : '')); }
}
function seccion(t) { console.log('\n=== ' + t + ' ==='); }

function extraer(firma) {
  const i = SRC.indexOf(firma);
  if (i < 0) throw new Error('NO SE ENCONTRO: ' + firma);
  let j = SRC.indexOf('{', i + firma.length), prof = 0;
  for (let k = j; k < SRC.length; k++) {
    if (SRC[k] === '{') prof++;
    else if (SRC[k] === '}') { prof--; if (prof === 0) return SRC.slice(i, k + 1); }
  }
  throw new Error('no delimitado: ' + firma);
}

console.log('P12 — sin rango temporal demostrable no se infiere progreso');
console.log('plantilla_dashboard.html: ' + SRC.split('\n').length + ' lineas' +
  (process.env.PANORAMA_DASHBOARD ? '  [REVERTIDO: ' + path.basename(DASH) + ']' : ''));

// =========================================================================
seccion('P12-A. UNITARIA — la nocion unica de rango, y pctOf saneado');
// =========================================================================
const UNIT = new Function(
  extraer('function clamp(v,min,max)') + '\n' +
  extraer('function rangoTemporalValido(start, end)') + '\n' +
  extraer('function pctOf(dateObj, start, end)') + '\n' +
  'const x = pct => 30 + (pct/100)*940;\n' +
  'return { clamp, rangoTemporalValido, pctOf, x };')();

ok('P12-A0 la escala del rail sigue siendo la que se replica aqui',
  SRC.indexOf('const x = pct => 30 + (pct/100)*940;') >= 0);
ok('P12-A1 un proyecto nuevo sigue naciendo con serviceStart/serviceEnd = null',
  /serviceStart:\s*null,\s*serviceEnd:\s*null/.test(SRC));
ok('P12-A2 y render() sigue construyendolas por concatenacion (el origen del caso)',
  /const start = new Date\(state\.serviceStart\+'T00:00:00'\);/.test(SRC));
ok('P12-A3 `new Date("nullT00:00:00")` sigue siendo Invalid Date: no se ha tapado el sintoma',
  Number.isNaN(new Date(null + 'T00:00:00').getTime()));
ok('P12-A4 clamp SIGUE sin sanear NaN — la guarda no esta ahi, esta antes de dividir',
  Number.isNaN(UNIT.clamp(NaN, 0, 1)));

const D = (s) => new Date(s + 'T00:00:00');
const INV = new Date(null + 'T00:00:00');
const hoy = D('2026-09-15');

// rangoTemporalValido, caso por caso.
const RANGOS = [
  ['ausentes (proyecto nuevo)', INV, INV, false],
  ['solo inicio', D('2026-01-01'), INV, false],
  ['solo fin', INV, D('2026-12-31'), false],
  ['inicio == fin', D('2026-09-15'), D('2026-09-15'), false],
  ['fin ANTERIOR al inicio', D('2026-12-31'), D('2026-01-01'), false],
  ['rango normal', D('2026-01-01'), D('2026-12-31'), true],
  ['rango de un solo dia', D('2026-01-01'), D('2026-01-02'), true],
];
for (const [que, s, e, esperado] of RANGOS) {
  ok('P12-A5 rangoTemporalValido — ' + que + ' -> ' + esperado,
    UNIT.rangoTemporalValido(s, e) === esperado,
    String(UNIT.rangoTemporalValido(s, e)));
}
ok('P12-A6 y rechaza lo que no es una fecha',
  UNIT.rangoTemporalValido(null, null) === false &&
  UNIT.rangoTemporalValido('2026-01-01', '2026-12-31') === false &&
  UNIT.rangoTemporalValido(undefined, D('2026-12-31')) === false);

// --- LA MATRIZ, ahora exigiendo el comportamiento correcto --------------
const casos = [
  { id: 'P12-1', que: 'proyecto NUEVO / sin fechas', start: INV, end: INV, pct: 0 },
  { id: 'P12-2', que: 'rango normal (control)', start: D('2026-01-01'), end: D('2026-12-31'), pct: null },
  { id: 'P12-3', que: 'inicio == fin', start: D('2026-09-15'), end: D('2026-09-15'), pct: 0 },
  { id: 'P12-3b', que: 'solo inicio', start: D('2026-01-01'), end: INV, pct: 0 },
  { id: 'P12-3c', que: 'solo fin', start: INV, end: D('2026-12-31'), pct: 0 },
  { id: 'P12-3d', que: 'fin ANTERIOR al inicio', start: D('2026-12-31'), end: D('2026-01-01'), pct: 0 },
  { id: 'P12-5', que: 'proyecto normal, hoy dentro (control)', start: D('2026-06-01'), end: D('2027-06-01'), pct: null },
  { id: 'P12-5b', que: 'hoy FUERA del rango (control de clamp)', start: D('2020-01-01'), end: D('2021-01-01'), pct: 100 },
];
console.log('\n  id       pctOf              x(pctOf)        finito  caso');
console.log('  ' + '-'.repeat(94));
for (const c of casos) {
  const p = UNIT.pctOf(hoy, c.start, c.end);
  const xx = UNIT.x(p);
  console.log('  ' + c.id.padEnd(9) + String(p).padEnd(19) + String(xx).padEnd(16) +
    (Number.isFinite(xx) ? 'si ' : 'NO ').padEnd(8) + c.que);
  ok(c.id + ' ' + c.que + ' -> coordenada FINITA, nunca NaN ni Infinity',
    Number.isFinite(p) && Number.isFinite(xx), 'pctOf=' + p + ' x=' + xx);
  if (c.pct !== null) {
    ok(c.id + ' ' + c.que + ' -> pctOf = ' + c.pct, p === c.pct, 'pctOf=' + p);
  }
}
// El 100% accidental, muerto y enterrado: se comprueba en los DOS sub-casos
// que antes daban cosas distintas segun la hora del reloj.
{
  const medianoche = UNIT.pctOf(D('2026-09-15'), D('2026-09-15'), D('2026-09-15'));
  const conHora = UNIT.pctOf(new Date('2026-09-15T10:30:00'), D('2026-09-15'), D('2026-09-15'));
  ok('P12-3 NUNCA mas un 100% por Infinity clampeado: ni a medianoche ni con hora',
    medianoche === 0 && conHora === 0,
    JSON.stringify({ medianoche, conHora }));
}
ok('P12-4 el rail sigue sin dividir por (n-1): la cardinalidad no entra en la escala',
  !/\/\s*\(\s*\w+\.length\s*-\s*1\s*\)/.test(extraer('function renderRail(today, start, end, isWindowed, tentativeEnd)')));

// =========================================================================
seccion('P12-B. INTEGRACION — renderRail() ejecutada de verdad');
// =========================================================================
function domDoble() {
  const svg = { _attrs: {}, _html: '', setAttribute(k, v) { this._attrs[k] = v; }, set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; } };
  return { svg, document: { getElementById: (id) => (id === 'rail-svg' ? svg : null) } };
}
function construirRail(d, state, ui) {
  const cuerpo =
    extraer('function clamp(v,min,max)') + '\n' +
    extraer('function rangoTemporalValido(start, end)') + '\n' +
    extraer('function pctOf(dateObj, start, end)') + '\n' +
    extraer('function fmt(d)') + '\n' +
    extraer('function shortDate(d)') + '\n' +
    extraer('function milestoneStatus(m, today)') + '\n' +
    extraer('function renderRail(today, start, end, isWindowed, tentativeEnd)') + '\n' +
    'return renderRail;';
  return new Function('document', 'state', 'ui', cuerpo)(d.document, state, ui);
}
const estadoBase = (over) => Object.assign({
  serviceStart: null, serviceEnd: null, milestones: [], phases: [],
  enProrroga: false, prorrogaEstimada: null,
}, over || {});

function coordenadasMalas(svgTexto) {
  const m = svgTexto.match(/(?:x1|x2|y1|y2|cx|cy|r|x|y)="(?:NaN|Infinity|-Infinity|undefined)"/g) || [];
  const porAtributo = {};
  for (const a of m) { const k = a.split('=')[0]; porAtributo[k] = (porAtributo[k] || 0) + 1; }
  return { total: m.length, porAtributo };
}
// El marcador de HOY: su linea discontinua ambar de altura completa (y1="-14")
// es inconfundible, no aparece en ningun otro elemento del rail.
const hayMarcadorHoy = (svg) => /y1="-14"/.test(svg) && /stroke:var\(--amber\)/.test(svg);

function correrRail(over, opts) {
  const o = opts || {};
  const d = domDoble();
  const state = estadoBase(over);
  const rail = construirRail(d, state, { selectedMilestoneId: null });
  const start = new Date(state.serviceStart + 'T00:00:00');
  const end = new Date(state.serviceEnd + 'T00:00:00');
  rail(o.hoy || hoy, start, end, false, o.tentativeEnd || null);
  return { svg: d.svg._html, malas: coordenadasMalas(d.svg._html), hoy: hayMarcadorHoy(d.svg._html) };
}

const SIN_ESCALA = [
  ['P12-1/B', 'proyecto NUEVO / sin fechas', {}],
  ['P12-3/B', 'inicio == fin', { serviceStart: '2026-09-15', serviceEnd: '2026-09-15' }],
  ['P12-3b/B', 'solo inicio', { serviceStart: '2026-01-01' }],
  ['P12-3c/B', 'solo fin', { serviceEnd: '2026-12-31' }],
  ['P12-3d/B', 'fin ANTERIOR al inicio', { serviceStart: '2026-12-31', serviceEnd: '2026-01-01' }],
];
for (const [id, que, over] of SIN_ESCALA) {
  const r = correrRail(over);
  ok(id + ' ' + que + ': CERO coordenadas invalidas en el SVG',
    r.malas.total === 0, JSON.stringify(r.malas));
  ok(id + ' ' + que + ': el marcador HOY NO se dibuja',
    r.hoy === false, 'marcador presente');
  ok(id + ' ' + que + ': tampoco "FIN ESTIMADO" ni el tramo de prorroga',
    r.svg.indexOf('FIN ESTIMADO') < 0 && r.svg.indexOf('PRORROGA') < 0);
  ok(id + ' ' + que + ': pero el carril base SI se dibuja (grafico vacio, no pantalla en blanco)',
    /<line x1="30"[^>]*x2="970"/.test(r.svg), r.svg.slice(0, 120));
}
// Y el mismo caso a una hora cualquiera: antes cambiaba el resultado.
{
  const r = correrRail({ serviceStart: '2026-09-15', serviceEnd: '2026-09-15' }, { hoy: new Date('2026-09-15T10:30:00') });
  ok('P12-3/B el resultado ya NO depende de la hora del reloj',
    r.malas.total === 0 && r.hoy === false, JSON.stringify(r.malas));
}
{
  // --- P12-2: control. Con rango valido, TODO como siempre --------------
  const r2 = correrRail({ serviceStart: '2026-01-01', serviceEnd: '2026-12-31' });
  ok('P12-2/B rango normal: cero coordenadas invalidas', r2.malas.total === 0, JSON.stringify(r2.malas));
  ok('P12-2/B y el marcador HOY SI se dibuja', r2.hoy === true);
  ok('P12-2/B y "FIN ESTIMADO" tambien', r2.svg.indexOf('FIN ESTIMADO') >= 0);
  ok('P12-2/B la linea cyan de progreso sigue ahi', /stroke:var\(--cyan\)/.test(r2.svg));
}
{
  // --- P12-4: un solo elemento y valores cero ---------------------------
  const r4 = correrRail({
    serviceStart: '2026-01-01', serviceEnd: '2026-12-31',
    milestones: [{ id: 1, date: '2026-06-15', name: 'Unico hito', estado: '' }],
  });
  ok('P12-4/B un solo hito con rango valido: cero coordenadas invalidas y el hito se dibuja',
    r4.malas.total === 0 && /<circle cx="\d/.test(r4.svg), JSON.stringify(r4.malas));
  const r4b = correrRail({
    milestones: [{ id: 1, date: '2026-06-15', name: 'Unico hito', estado: '' }],
  });
  ok('P12-4/B un solo hito SIN rango: ya no produce NaN (antes si)',
    r4b.malas.total === 0, JSON.stringify(r4b.malas));
}
{
  // --- P12-5: control fuerte -------------------------------------------
  const r5 = correrRail({
    serviceStart: '2026-06-01', serviceEnd: '2027-06-01',
    milestones: [
      { id: 1, date: '2026-07-01', name: 'Kick-off', estado: '' },
      { id: 2, date: '2026-10-01', name: 'Hito 2', estado: '' },
      { id: 3, date: '2027-02-01', name: 'Hito 3', estado: '' },
    ],
    phases: [{ name: 'Arranque', endDate: '2026-09-01' }, { name: 'Operacion', endDate: null }],
    prorrogaEstimada: { fecha: '2027-09-01' },
  }, { tentativeEnd: new Date('2027-09-01T00:00:00') });
  ok('P12-5/B proyecto complejo: cero coordenadas invalidas', r5.malas.total === 0, JSON.stringify(r5.malas));
  ok('P12-5/B el marcador HOY se dibuja', r5.hoy === true);
  ok('P12-5/B los tres hitos se dibujan',
    (r5.svg.match(/<circle cx="\d/g) || []).length >= 3,
    'circulos: ' + (r5.svg.match(/<circle cx="\d/g) || []).length);
  // La etiqueta de un LIMITE de fase lleva el nombre de la fase SIGUIENTE
  // ("→ OPERACION"), no el de la que termina: es un limite, no un titulo.
  ok('P12-5/B el limite de fase se dibuja, etiquetado con la fase siguiente',
    r5.svg.indexOf('OPERACION') >= 0, 'no se encontro la etiqueta del limite');
  ok('P12-5/B y "FIN ESTIMADO" tambien', r5.svg.indexOf('FIN ESTIMADO') >= 0);
  ok('P12-5/B y el tramo de prorroga estimada tambien se dibuja',
    r5.svg.indexOf('PRORROGA') >= 0 || /stroke-dasharray="1,5"/.test(r5.svg), 'sin tramo de prorroga');
}

// =========================================================================
seccion('P12-C. LO QUE SALE DE LA APLICACION — KPI, resumen y PowerPoint');
// =========================================================================
// El mismo pctOf alimenta `executiveStatus()`, y de ahi el panel, el texto
// copiable y la exportacion a .pptx. Se comprueba el DATO antes de generarla:
// si el porcentaje es 0 y finito, nada de lo que cuelga puede llevar "NaN".
{
  const p = UNIT.pctOf(hoy, INV, INV);
  ok('P12-C1 sin rango, pctOf da 0 EXACTO (no NaN, no Infinity, no -0)',
    p === 0 && Number.isFinite(p) && !Object.is(p, -0), String(p));
  ok('P12-C2 y Math.round() de ese 0 sigue siendo 0: el de executiveStatus()',
    Math.round(p) === 0 && /const progressPct = Math\.round\(pctOf\(today, start, end\)\);/.test(SRC));
  ok('P12-C3 el texto del KPI no puede contener "NaN"',
    !String(p.toFixed(0) + '%').includes('NaN'), p.toFixed(0) + '%');
  ok('P12-C4 ni el del panel "Estado Ejecutivo"',
    !`${Math.round(p)}% del servicio transcurrido`.includes('NaN'));
  ok('P12-C5 ni el resumen ejecutivo COPIABLE',
    !`Progreso del servicio: ${Math.round(p)}%`.includes('NaN') &&
    /lines\.push\(`Progreso del servicio: \$\{ex\.progressPct\}%`\);/.test(SRC));
  ok('P12-C6 ni el KPI que entra en la EXPORTACION A POWERPOINT',
    !`${Math.round(p)}%`.includes('NaN') &&
    SRC.indexOf("['Progreso del servicio', `${ex.progressPct}%`],") >= 0);
}
// dias: atados a la MISMA condicion, no saneados por separado.
ok('P12-C7 daysElapsed y totalDays dependen del MISMO rangoOk, no de un isFinite suelto',
  /const daysElapsed = rangoOk \? Math\.round\(\(today-start\)\/86400000\) : 0;/.test(SRC) &&
  /const totalDays = rangoOk \? Math\.round\(\(end-start\)\/86400000\) : 0;/.test(SRC));
ok('P12-C8 asi nunca puede salir un "dia 258 de ~0": o hay rango, o los tres son 0',
  /const rangoOk = rangoTemporalValido\(start, end\);/.test(SRC));
ok('P12-C9 la cabecera del rail se deja VACIA sin rango, sin inventar texto nuevo',
  /rangoOk \? `\$\{fmt\(start\)\} → \$\{fmt\(end\)\}` : ''/.test(SRC) &&
  !/Fechas pendientes|Sin fechas|Pendiente de configurar/.test(SRC));
ok('P12-C10 `fmt()` NO se ha tocado: sigue siendo la de siempre',
  /function fmt\(d\)\{ return d\.toLocaleDateString\('es-ES'/.test(SRC));
ok('P12-C11 NO hay excepcion: render() sigue con fases, hitos y riesgos despues del rail',
  /renderRail\(today, railStart, railEnd[^)]*\);\s*\n\s*renderPhases\(\);\s*\n\s*renderMilestones\(today\);\s*\n\s*renderRisks\(\);/.test(SRC));

console.log('\n' + '='.repeat(70));
console.log(`  P12 — sin rango no se infiere progreso: ${pass} OK, ${fail} FALLOS`);
if (fallos.length) fallos.forEach((f) => console.log('    - ' + f));
console.log('='.repeat(70));
process.exitCode = fail === 0 ? 0 : 1;
