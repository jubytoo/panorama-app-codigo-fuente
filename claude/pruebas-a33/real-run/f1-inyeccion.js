// ---------------------------------------------------------------------------
// F1 — INTERPRETACIÓN DE DATOS COMO HTML EN LA APP REAL (sandbox artificial).
//
// Auditoría defensiva. Marcador INOCUO en cada campo: una <b> con marca, un
// atributo `data-f1a` y una <img> con `src` a un archivo LOCAL inexistente cuyo
// `onerror` solo pone un atributo en <html>. Así se distingue, campo a campo:
//   · ejec   → el manejador llegó a ejecutarse en la página;
//   · tags   → la etiqueta se creó (alteración de presentación);
//   · attrs  → se rompió un atributo;
//   · lit    → el marcador se ve como TEXTO literal (escapado, sin efecto).
//
// Sin red, sin navegación, sin leer archivos, sin comandos. La batería NO
// invoca ninguna API sensible desde el contenido inyectado: la exposición del
// puente solo se DOCUMENTA (qué hay en el mundo principal), no se usa.
//
//   --modo=a  proyecto creado desde un JSON importado (vía real de
//             "cargar copia"); dashboard con varias pasadas de UI; historial;
//             window.open('about:blank'); barreras; Preparación de Reunión;
//             Evaluación en dos fases (ids limpios / id de tarea con comillas).
//   --modo=b  reinicio: ¿vuelve a interpretarse lo guardado? (persistencia)
//   --modo=c  título importado horneado en projects/<id>/dashboard.html;
//             lanzador; Directorio (sincronización + ficha de persona).
// ---------------------------------------------------------------------------
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const arg = process.argv.find((a) => a.startsWith('--sandbox='));
if (!arg) { console.error('falta --sandbox='); process.exit(2); }
const SB = arg.slice('--sandbox='.length);
if (!/_a33-f1-real/i.test(SB)) { console.error('sandbox no marcado'); process.exit(2); }
const MODO = (process.argv.find((a) => a.startsWith('--modo=')) || '--modo=nada').slice(7);

app.setPath('appData', path.join(SB, 'Roaming'));
app.setPath('userData', path.join(SB, 'Roaming', 'panorama-app'));
const UD = path.join(SB, 'Roaming', 'panorama-app');
const PROJDIR = 'C:/Codigo Fuente PS/panorama-app-codigo-fuente_1';

const ascii = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u00b7\u2014\u2013]/g, '-').replace(/\u2026/g, '...');
function tlog(s) { try { fs.appendFileSync(path.join(SB, 'test.log'), `[${new Date().toISOString()}] ${ascii(s)}\n`); } catch (e) {} }
function ok(n, c, extra) { tlog((c ? 'OK    ' : 'FALLO ') + n + (c ? '' : '  -- ' + (extra === undefined ? '' : extra))); }
function info(s) { tlog('      ' + s); }
const guardar = (k, v) => fs.writeFileSync(path.join(SB, k + '.json'), JSON.stringify(v, null, 1), 'utf8');
const leer = (k) => JSON.parse(fs.readFileSync(path.join(SB, k + '.json'), 'utf8'));

// Diálogos nativos: se registran y se contestan solos (NO = 0).
dialog.showMessageBoxSync = function (a, b) { const o = (b || a) || {}; tlog('      DIALOGO: ' + o.title); return 0; };
dialog.showOpenDialogSync = function () { return null; };

// Espía de IPC, antes de cargar main.js: solo CUENTA. Sirve para demostrar que
// ninguna acción de menú sale de la página salvo las que abre la batería.
const llamadasIPC = {};
const ACCIONES_DE_LA_BATERIA = new Set(['proyecto-prep-reunion', 'proyecto-eval-candidatos', 'archivo-directorio']);
const handleOrig = ipcMain.handle.bind(ipcMain);
ipcMain.handle = function (canal, fn) {
  return handleOrig(canal, function () {
    llamadasIPC[canal] = (llamadasIPC[canal] || 0) + 1;
    if (canal === 'projectMenu:action') { const a = arguments[1] || {}; (llamadasIPC.acciones = llamadasIPC.acciones || []).push(a.action); }
    return fn.apply(this, arguments);
  });
};
const accionesAjenas = () => (llamadasIPC.acciones || []).filter((a) => !ACCIONES_DE_LA_BATERIA.has(a));

require(PROJDIR + '/main.js');
const dbmod = require(PROJDIR + '/db.js');

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const ventanasCon = (frag) => BrowserWindow.getAllWindows().filter((x) => {
  if (x.isDestroyed()) return false;
  try { return decodeURIComponent(x.webContents.getURL()).includes(frag); } catch (e) { return false; }
});
async function esperarVentana(frag, tope = 40000, excluir) {
  const t0 = Date.now();
  for (;;) {
    const w = ventanasCon(frag).find((x) => !excluir || !excluir.has(x.id));
    if (w) return w;
    if (Date.now() - t0 > tope) return null;
    await esperar(300);
  }
}
async function abrirPorMenu(v, accion, frag) {
  const prev = new Set(BrowserWindow.getAllWindows().map((x) => x.id));
  await v.webContents.executeJavaScript(`window.panoramaBridge.projectMenuAction('${accion}')`).catch(() => {});
  return esperarVentana(frag, 20000, prev);
}

// --- marcadores inocuos ---------------------------------------------------
const P = (c) => `F1" data-f1a="${c}" x="</textarea></script></select>` +
  `<b data-f1="${c}">B</b><img src="f1-no-existe.png" data-f1="${c}" ` +
  `onerror="document.documentElement.setAttribute('data-f1x-'+this.dataset.f1,'1')">`;
// Variante sin comillas dobles en la etiqueta (sobrevive a JSON.stringify),
// con una comilla inicial que rompe atributos.
const N = (c) => `F1" data-f1a="${c}" x="</script><img src=f1-no-existe.png data-f1=${c} ` +
  `onerror=document.documentElement.setAttribute('data-f1x-'+this.dataset.f1,'1')>`;

const RECOGER = `(function(){
  var h=document.documentElement;
  var ejec=h.getAttributeNames().filter(function(n){return n.indexOf('data-f1x-')===0}).map(function(n){return n.slice(9)});
  var t={};Array.prototype.forEach.call(document.querySelectorAll('b[data-f1],img[data-f1]'),function(e){t[e.getAttribute('data-f1')]=1});
  var a={};Array.prototype.forEach.call(document.querySelectorAll('[data-f1a]'),function(e){a[e.getAttribute('data-f1a')]=1});
  var txt=(document.body?document.body.textContent:'');
  Array.prototype.forEach.call(document.querySelectorAll('input,textarea'),function(e){txt+='\\n'+e.value});
  var l={},re=/data-f1="?([a-z0-9-]+)/g,m;while((m=re.exec(txt)))l[m[1]]=1;
  return JSON.stringify({ejec:ejec.sort(),tags:Object.keys(t).sort(),attrs:Object.keys(a).sort(),lit:Object.keys(l).sort(),
    modales:document.querySelectorAll('.ps-modal-backdrop').length});
})()`;
async function recoger(w) { try { return JSON.parse(await w.webContents.executeJavaScript(RECOGER)); } catch (e) { return { error: String(e.message || e), ejec: [], tags: [], attrs: [], lit: [] }; } }
const CLAVES = ['ejec', 'tags', 'attrs', 'lit'];
const unir = (acc, r) => { for (const k of CLAVES) for (const x of (r[k] || [])) acc[k].add(x); return acc; };
const nuevoAcc = () => ({ ejec: new Set(), tags: new Set(), attrs: new Set(), lit: new Set() });
const plano = (acc) => Object.fromEntries(CLAVES.map((k) => [k, [...acc[k]].sort()]));
const soloLiteral = (acc, c) => acc.lit.includes(c) && !acc.ejec.includes(c) && !acc.tags.includes(c) && !acc.attrs.includes(c);

// Barreras: solo LECTURA de preferencias y de qué hay en el mundo principal.
const GLOBALES = ['panoramaBridge', 'launcherAPI', 'winControls', 'themeAPI', 'securityWinAPI', 'backupPickerAPI', 'passwordPromptAPI'];
async function barreras(w, nombre) {
  const wp = (() => { try { return w.webContents.getLastWebPreferences() || {}; } catch (e) { return {}; } })();
  let mundo = null;
  try {
    mundo = JSON.parse(await w.webContents.executeJavaScript(
      "(function(){var g={};" + JSON.stringify(GLOBALES) + ".forEach(function(n){var o=window[n];if(o)g[n]={metodos:Object.keys(o).filter(function(k){return typeof o[k]==='function'}).length,congelado:Object.isFrozen(o)}});" +
      "var d=Object.getOwnPropertyDescriptor(window,'psConfirm');" +
      "return JSON.stringify({require:typeof require,process:typeof process,module:typeof module,globales:g," +
      "psConfirm:d?{sobrescribible:!!d.writable,configurable:!!d.configurable}:null," +
      "csp:!!document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]'),origen:location.protocol})})()"));
  } catch (e) { mundo = { error: String(e.message || e) }; }
  const b = { ventana: nombre, contextIsolation: wp.contextIsolation, nodeIntegration: wp.nodeIntegration, sandbox: wp.sandbox,
    webSecurity: wp.webSecurity, mundo };
  info('barreras ' + JSON.stringify(b));
  return b;
}

function estadoA() {
  return {
    projectTitle: 'Servicio F1', serviceStart: '2026-01-01', serviceEnd: '2026-12-31',
    skillMatrixRoles: [P('rol-columna'), 'Rol 2'],
    phases: [{ id: 'f1', name: P('fase-nombre'), endDate: '2026-06-30' }, { id: 'f2', name: 'Fase 2', endDate: null }],
    milestones: [
      { id: 'm1', label: P('hito-label'), date: '2026-09-20', actualDate: null, recurrente: false, descripcion: P('hito-desc'),
        entregables: [{ id: 'e1', tipo: P('ent-tipo'), nombre: P('ent-nombre'), ruta: P('ent-ruta'), entregado: true, fecha: null }] },
      { id: 'm2', label: P('hito-completado'), date: '2026-09-05', actualDate: '2026-09-10', recurrente: false, descripcion: '', entregables: [] },
      { id: P('hito-id'), label: 'Hito con id', date: '2026-11-01', actualDate: null, recurrente: false, descripcion: '', entregables: [] },
    ],
    risks: [
      { id: 'R-01', title: P('riesgo-title'), category: 'Contractual', p: 4, i: 4, mitigacion: P('riesgo-mit'), contingencia: P('riesgo-cont'),
        respMitigacion: P('riesgo-respmit'), respContingencia: '', status: 'materializado', fechaDeteccion: '2026-09-05',
        fechaMaterializacion: '2026-09-10', fechaCierre: null, obsMaterializacion: P('riesgo-obsmat'), respMaterializacion: '', obsCierre: '', respCierre: '' },
      { id: P('riesgo-id'), title: 'Riesgo con id', category: 'Contractual', p: 1, i: 1, mitigacion: 'm', contingencia: 'c',
        respMitigacion: '', respContingencia: '', status: 'seguimiento', fechaDeteccion: '2026-09-05', fechaMaterializacion: null,
        fechaCierre: null, obsMaterializacion: '', respMaterializacion: '', obsCierre: '', respCierre: '' },
    ],
    skills: [{ id: 's1', group: P('skill-grupo'), name: P('skill-nombre'), levels: [1, 2], pending: false }],
    team: [
      { id: 't1', alias: P('equipo-alias'), role: P('equipo-rol'), date: '2026-09-10', dateDisplay: P('equipo-fechatxt'), status: 'activo', dni: '', email: '', telefono: '' },
      { id: P('equipo-id'), alias: 'Persona id', role: 'Rol id', date: '2026-01-01', dateDisplay: '01/01/2026', status: 'activo', dni: '', email: '', telefono: '' },
    ],
    coverage: [
      { id: 'c1', tipo: 'cobertura', roleSnapshot: P('cob-rol'), motivo: P('cob-motivo'), fechaInicio: '2026-09-01', fechaFin: null,
        cubiertoPor: P('cob-cubierto'), dni: '', email: '', telefono: '', notas: P('cob-notas'), loggedAt: '2026-09-01T10:00:00Z' },
      { id: 'c2', tipo: 'salida', roleSnapshot: 'Rol salida', motivo: 'Fin', fecha: '2026-09-02', sustituidoPor: P('cob-sustituido'), notas: '', loggedAt: '2026-09-02T10:00:00Z' },
      { id: 'c3', tipo: 'entrada', roleSnapshot: 'Rol entrada', predecesor: P('cob-predecesor'), fecha: '2026-09-03', notas: '', loggedAt: '2026-09-03T10:00:00Z' },
    ],
    corporateLogo: `x" data-f1a="logo" onerror="document.documentElement.setAttribute('data-f1x-logo','1')`,
    railWindow: null, enProrroga: false, prorrogaDesde: null, prorrogaEstimada: null,
  };
}
const HIST_A = [{ id: 'h1', date: '2026-09-01', time: '10:00', label: P('historial-label'), state: {} }];

// Campos del dashboard cuyo marcador se pinta al ABRIR, sin ninguna interacción.
const DASH_AL_ABRIR = ['hito-label', 'hito-completado', 'riesgo-title', 'riesgo-mit', 'riesgo-cont', 'skill-nombre', 'skill-grupo',
  'rol-columna', 'equipo-alias', 'equipo-rol', 'equipo-fechatxt', 'cob-rol', 'cob-motivo', 'cob-notas', 'cob-cubierto',
  'cob-sustituido', 'cob-predecesor', 'fase-nombre', 'logo'];

const PASADAS = [
  ['base', ''],
  ['detalles', "ui.expandedMilestones={m1:true};ui.expandedRisks={'R-01':true};render();"],
  ['editar-riesgo', "ui.editingRisk='R-01';render();"],
  ['editar-hito', "ui.editingRisk=null;ui.editingMilestone='m1';render();"],
  ['confirmar-hito', "ui.editingMilestone=null;ui.confirmDelete={type:'milestone',id:'m1'};render();"],
  ['confirmar-riesgo', "ui.confirmDelete={type:'risk',id:'R-01'};render();"],
  ['confirmar-equipo', "ui.confirmDelete={type:'team',id:'t1'};render();"],
  ['confirmar-fase', "ui.confirmDelete={type:'phase',id:'f1'};render();"],
  ['posponer-hito', "ui.confirmDelete=null;ui.snoozingMilestone='m1';render();"],
  ['editar-equipo', "ui.snoozingMilestone=null;ui.editingTeam='t1';render();"],
  ['editar-skill', "ui.editingTeam=null;ui.editingSkill='s1';render();"],
  ['editar-cobertura', "ui.editingSkill=null;ui.editingCoverage='c1';render();"],
  ['editar-roles', "ui.editingCoverage=null;ui.editingRoles=true;render();"],
  ['vuelta', "ui.editingRoles=false;render();"],
];

async function pasadasDashboard(w) {
  const acc = nuevoAcc();
  const porPasada = {};
  for (const [nombre, js] of PASADAS) {
    let err = null;
    // Solo estado de interfaz (qué panel está abierto) + render(); nada se guarda.
    if (js) { try { const r = await w.webContents.executeJavaScript(`(function(){try{${js}return 'ok'}catch(e){return 'ERR '+e.message}})()`); if (r !== 'ok') err = r; } catch (e) { err = String(e.message); } }
    await esperar(900);
    const r = await recoger(w);
    const nuevos = Object.fromEntries(CLAVES.map((k) => [k, (r[k] || []).filter((x) => !acc[k].has(x))]));
    unir(acc, r);
    porPasada[nombre] = nuevos;
    info(`pasada ${nombre}${err ? ' (' + err + ')' : ''}: nuevos ${JSON.stringify(nuevos)}`);
  }
  return { acc: plano(acc), porPasada };
}

// Guardado normal del dashboard (el mismo IPC que su autoguardado), en el sandbox.
async function volcadoYBackup(w) {
  return w.webContents.executeJavaScript(
    "(function(){var d={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);d[k]=localStorage.getItem(k);}" +
    "return window.panoramaBridge.saveBackup(JSON.stringify(d),'manual');})()");
}

async function prepPasadas(w) {
  const acc = nuevoAcc();
  for (let i = 0; i < 30; i++) {
    const st = await w.webContents.executeJavaScript('state.jsonStatus').catch(() => null);
    if (st === 'ok' || st === 'error') break;
    await esperar(400);
  }
  const estado = await w.webContents.executeJavaScript('state.jsonStatus').catch(() => null);
  info('preparacion: carga del backup = ' + estado);
  for (const paso of ['equipo', 'hitos', 'riesgos', 'guion']) {
    // Solo navegación entre pasos (render); no se pulsa "Siguiente", que
    // guardaría el guion al llegar al final.
    await w.webContents.executeJavaScript(
      `(function(){state.meetingDate='2026-09-01';state.todayDate='2026-09-16';` +
      `state.step=STEP_KEYS.indexOf('${paso}');render();return 1})()`).catch((e) => info('prep ' + paso + ' ERR ' + e.message));
    await esperar(900);
    const r = await recoger(w);
    unir(acc, r);
    info(`preparacion paso ${paso}: ${JSON.stringify({ ejec: r.ejec, tags: r.tags, attrs: r.attrs, lit: r.lit })}`);
  }
  return { estado, acc: plano(acc) };
}

const SONDA_EVAL = "(function(){var r='ok';try{renderAll()}catch(e){r=e.name+': '+String(e.message).slice(0,90)}" +
  "return JSON.stringify({pantallaDeCarga:!!document.getElementById('loadingScreen'),tarjetasEval:document.querySelectorAll('.card[data-eval-card]').length," +
  "tarjetasPuesto:document.querySelectorAll('.card[data-puesto-card]').length,renderAll:r})})()";
async function sembrarEval(ve, estado) {
  const g = await ve.webContents.executeJavaScript('window.panoramaBridge.saveCandidateEvalData(' + JSON.stringify(JSON.stringify(estado)) + ')');
  ve.webContents.reload();
  await esperar(3500);
  return g;
}
async function recogerEval(ve) {
  // Primero lo que dejó el arranque normal de la ventana (antes de la sonda).
  const acc = nuevoAcc();
  unir(acc, await recoger(ve));
  const antes = await ve.webContents.executeJavaScript(
    "JSON.stringify({pantallaDeCarga:!!document.getElementById('loadingScreen'),tarjetasEval:document.querySelectorAll('.card[data-eval-card]').length})").then(JSON.parse).catch(() => null);
  // Despliega las tareas (estado de interfaz) para que sus filas se pinten.
  await ve.webContents.executeJavaScript("(function(){try{state.evaluaciones.forEach(function(e){expandedEvalIds.add(e.id)});state.puestos.forEach(function(p){expandedPuestoIds.add(p.id)});return 1}catch(e){return e.message}})()").catch(() => {});
  const sonda = await ve.webContents.executeJavaScript(SONDA_EVAL).then(JSON.parse).catch((e) => ({ error: e.message }));
  await esperar(800);
  unir(acc, await recoger(ve));
  return { antes, sonda, acc: plano(acc) };
}
function estadoEval(idTarea) {
  return {
    threshold: 3.5,
    puestos: [{ id: 'p1', name: P('eval-puesto-nombre'), formacionMinima: P('eval-formacion'), aniosMinimos: '', sbaReferencia: '',
      tasks: [{ id: idTarea, name: P('eval-tarea-nombre'), weight: P('eval-peso'), guide: P('eval-guia') }] }],
    evaluaciones: [{ id: 'ev1', candidato: P('eval-candidato'), puestoId: 'p1', tap: P('eval-tap'), manager: '', entrevistador: '',
      telefono: '', fecha: P('eval-fecha'), formacion: '', aniosExperiencia: '', sba: '', cvFileName: P('eval-cvnombre'),
      cvStoredName: null, notas: {}, feedbackEdited: null }],
  };
}
const EVAL_TEXTO = ['eval-candidato', 'eval-puesto-nombre', 'eval-tarea-nombre', 'eval-guia', 'eval-cvnombre', 'eval-formacion', 'eval-tap'];

app.whenReady().then(async () => {
  if (MODO === 'nada') return;
  try {
    const lanzador = await esperarVentana('launcher/index.html');
    if (!lanzador) { tlog('ERROR: no aparecio el lanzador'); app.exit(3); return; }
    await esperar(1500);

    // =====================================================================
    if (MODO === 'a') {
      tlog('--- F1-A: PROYECTO IMPORTADO DE UN JSON CON MARCADORES ---');
      const importJson = JSON.stringify({ state: estadoA(), history: HIST_A });
      const row = await lanzador.webContents.executeJavaScript(
        `window.launcherAPI.createProject('ignorado','','',${JSON.stringify(importJson)})`);
      const PID = row.id;
      ok('F1-RA0 el JSON importado se acepta sin validar el contenido de los textos', !!PID && row.name === 'Servicio F1', JSON.stringify(row));
      await lanzador.webContents.executeJavaScript(`window.launcherAPI.openProject(${PID})`);
      const v = await esperarVentana(`projects/${PID}/dashboard.html`);
      ok('F1-RA0b la ventana del dashboard se abre', !!v);
      await esperar(3500);
      const bDash = await barreras(v, 'dashboard');

      const dash = await pasadasDashboard(v);
      info('DASHBOARD union: ' + JSON.stringify(dash.acc));
      const base = dash.porPasada.base;
      const ejecutados = DASH_AL_ABRIR.filter((c) => base.ejec.includes(c));
      ok('F1-RA1 [EXIGE] al ABRIR no se ejecuta NINGUNO de los 19 campos que antes se interpretaban',
        ejecutados.length === 0, 'se ejecutaron ' + JSON.stringify(ejecutados));
      const vistos = DASH_AL_ABRIR.filter((c) => base.lit.includes(c));
      ok('F1-RA1b …y el dato SIGUE VIÉNDOSE como texto literal (escapar no es borrar)',
        vistos.length >= 10, 'literales ' + vistos.length + '/' + DASH_AL_ABRIR.length + ' ' + JSON.stringify(vistos));
      ok('F1-RA2 [EXIGE] los id importados ya no rompen atributos ni se interpretan',
        !['hito-id', 'riesgo-id', 'equipo-id'].some((c) => dash.acc.attrs.includes(c) || dash.acc.ejec.includes(c)),
        JSON.stringify({ attrs: dash.acc.attrs, ejec: dash.acc.ejec }));
      ok('F1-RA3 [EXIGE] un logo que no es imagen dataURL no se pinta ni ejecuta',
        !base.attrs.includes('logo') && !base.ejec.includes('logo'), JSON.stringify({ attrs: base.attrs, ejec: base.ejec }));
      ok('F1-RA4 [EXIGE] la observación de materialización se queda DENTRO de su <textarea>',
        !dash.acc.ejec.includes('riesgo-obsmat') && !dash.acc.attrs.includes('riesgo-obsmat'), JSON.stringify(dash.porPasada['editar-riesgo']));
      ok('F1-RA5 descripción, entregables y responsable se siguen viendo como TEXTO',
        ['hito-desc', 'ent-tipo', 'ent-nombre', 'ent-ruta', 'riesgo-respmit'].every((c) => soloLiteral(dash.acc, c)), JSON.stringify(dash.acc));
      const hist = await v.webContents.executeJavaScript(
        "(function(){var s=document.getElementById('history-select');var o=Array.prototype.find.call(s.options,function(x){return x.value==='h1'});" +
        "return JSON.stringify({opcion:!!o,textoLiteral:!!o&&o.textContent.indexOf('data-f1a=\"historial-label\"')>=0," +
        "etiquetasDentro:s.querySelectorAll('*:not(option)').length})})()").then(JSON.parse).catch((e) => ({ error: e.message }));
      info('historial: ' + JSON.stringify(hist));
      ok('F1-RA6 [EXIGE] la etiqueta del historial se pinta por DOM: es TEXTO del <option>, ya no depende del parser',
        hist.opcion === true && hist.textoLiteral === true && hist.etiquetasDentro === 0 && !dash.acc.ejec.includes('historial-label'), JSON.stringify(hist));
      guardar('f1-dashboard', { base, union: dash.acc, porPasada: dash.porPasada, historial: hist });

      // --- exposición del puente: SOLO se documenta, no se invoca ---------
      const m = bDash.mundo || {};
      ok('F1-RA7 [EXPOSICIÓN] el mundo principal del dashboard tiene panoramaBridge con métodos (sin Node)',
        m.require === 'undefined' && m.process === 'undefined' && m.globales && m.globales.panoramaBridge && m.globales.panoramaBridge.metodos > 20, JSON.stringify(m));
      ok('F1-RA8 [EXPOSICIÓN] window.psConfirm es sobrescribible desde la página (main.js confía en su respuesta para eliminar/restaurar)',
        m.psConfirm && m.psConfirm.sobrescribible === true, JSON.stringify(m.psConfirm));
      ok('F1-RA9 el contenido interpretado NO ha disparado ninguna acción de menú ni borrado (la batería no las provoca)',
        accionesAjenas().length === 0 && !llamadasIPC['projects:delete'] && !!dbmod.get('SELECT id FROM projects WHERE id=?', [PID]),
        JSON.stringify({ acciones: llamadasIPC.acciones, borrados: llamadasIPC['projects:delete'] || 0 }));

      // --- window.open('about:blank'): ¿recibe el puente la ventana hija? ---
      const antes = new Set(BrowserWindow.getAllWindows().map((x) => x.id));
      const ro = await v.webContents.executeJavaScript("window.open('about:blank','_blank') ? 'abierta' : 'bloqueada'").catch((e) => 'ERR ' + e.message);
      await esperar(1500);
      const hija = BrowserWindow.getAllWindows().find((x) => !antes.has(x.id) && !x.isDestroyed());
      let bHija = null;
      if (hija) { bHija = await barreras(hija, 'window.open(about:blank)'); try { hija.destroy(); } catch (e) {} }
      info('window.open: ' + ro);
      ok('F1-RA10 [F3] window.open desde la página crea una BrowserWindow nueva (no hay setWindowOpenHandler)', !!hija);
      ok('F1-RA11 [F3] la ventana hija NO recibe panoramaBridge y hereda contextIsolation+sandbox',
        !!bHija && bHija.contextIsolation === true && bHija.sandbox === true && bHija.mundo && !(bHija.mundo.globales || {}).panoramaBridge, JSON.stringify(bHija));

      // --- persistencia: guardado normal ---------------------------------
      const g = await volcadoYBackup(v);
      ok('F1-RA12 el estado con marcadores se guarda como backup (flujo normal de guardado)', !!g && g.aplicado === true, JSON.stringify(g));

      // --- Preparación de Reunión ----------------------------------------
      const vp = await abrirPorMenu(v, 'proyecto-prep-reunion', 'preparacion_reunion');
      ok('F1-RA13 la ventana de Preparación de Reunión se abre', !!vp);
      let prep = null, bPrep = null;
      if (vp) {
        await esperar(2000);
        bPrep = await barreras(vp, 'preparacion');
        prep = await prepPasadas(vp);
        ok('F1-RA14 [EXIGE] Preparación ya no interpreta los textos del BACKUP: los pinta como texto',
          !['hito-completado', 'hito-label', 'riesgo-title', 'equipo-rol'].some((c) => prep.acc.ejec.includes(c) || prep.acc.attrs.includes(c)),
          JSON.stringify(prep.acc));
        ok('F1-RA14b …y siguen viéndose (el guion no se ha quedado vacío)',
          ['hito-completado', 'riesgo-title', 'equipo-rol'].some((c) => prep.acc.lit.includes(c)), JSON.stringify(prep.acc.lit));
        ok('F1-RA15 [EXIGE] un id con comillas ya no rompe nada: "Mencionar/Ya lo saben/Omitir" usa data-seg-id + listener',
          !['hito-id', 'riesgo-id'].some((c) => prep.acc.attrs.includes(c) || prep.acc.ejec.includes(c)), JSON.stringify(prep.acc));
        guardar('f1-prep-a', prep);
      }

      // --- Evaluación de Candidatos --------------------------------------
      const ve = await abrirPorMenu(v, 'proyecto-eval-candidatos', 'evaluacion_candidatos');
      let evalR1 = null, evalR2 = null, bEval = null;
      if (ve) {
        await esperar(2000);
        bEval = await barreras(ve, 'evaluacion');
        // Fase 1: ids normales; marcadores en textos, peso y fecha.
        const g1 = await sembrarEval(ve, estadoEval('t1'));
        evalR1 = await recogerEval(ve);
        info('EVALUACION fase 1 (ids limpios): ' + JSON.stringify(evalR1));
        ok('F1-RA16 un estado de Evaluación con marcadores se guarda por el IPC real (el mismo que usa "Importar")', !!g1 && g1.aplicado === true, JSON.stringify({ aplicado: g1 && g1.aplicado, verificado: g1 && g1.verificado }));
        ok('F1-RA17 Evaluación: el TEXTO libre importado se ve como TEXTO (candidato, puesto, tarea, guía, CV, formación, TAP) — escapeHtml/escapeAttr',
          EVAL_TEXTO.every((c) => soloLiteral(evalR1.acc, c)), JSON.stringify(evalR1.acc));
        ok('F1-RA18 [EXIGE] Evaluación: peso y fecha importados ya NO se interpretan',
          !['eval-peso', 'eval-fecha'].some((c) => evalR1.acc.ejec.includes(c) || evalR1.acc.attrs.includes(c)), JSON.stringify(evalR1.acc));
        // Fase 2: un id de tarea con comillas — antes rompía data-task e, ya de
        // paso, hacía estallar el querySelector de applyEvalFilter, dejando la
        // ventana en la pantalla de carga. Ahora debe renderizar entera.
        const g2 = await sembrarEval(ve, estadoEval(P('eval-tarea-id')));
        evalR2 = await recogerEval(ve);
        info('EVALUACION fase 2 (id de tarea con comillas): ' + JSON.stringify(evalR2));
        ok('F1-RA19 [EXIGE] un id de tarea con comillas no rompe atributo ni se interpreta', !!g2 && g2.aplicado === true &&
          !evalR2.acc.attrs.includes('eval-tarea-id') && !evalR2.acc.ejec.includes('eval-tarea-id'), JSON.stringify(evalR2.acc));
        ok('F1-RA19b [EXIGE/F1-E] …y la pantalla termina de pintar: sin pantalla de carga, con su tarjeta y sin querySelector roto',
          evalR2.sonda && evalR2.sonda.pantallaDeCarga === false && evalR2.sonda.tarjetasEval === 1
          && evalR2.sonda.tarjetasPuesto === 1 && evalR2.sonda.renderAll === 'ok', JSON.stringify(evalR2.sonda));
        guardar('f1-eval-a', { fase1: evalR1, fase2: evalR2 });
      }

      // --- lanzador y resumen de barreras --------------------------------
      const bLan = await barreras(lanzador, 'lanzador');
      const lan = await recoger(lanzador);
      ok('F1-RA20 el lanzador no interpreta nada (pinta los nombres escapados)', (lan.ejec || []).length === 0, JSON.stringify(lan));
      const todas = [bDash, bPrep, bEval, bLan].filter(Boolean);
      ok('F1-RA21 [BARRERA] contextIsolation:true, sandbox:true y SIN Node en el mundo principal de todas las ventanas medidas',
        todas.every((b) => b.contextIsolation === true && b.nodeIntegration !== true && b.sandbox === true &&
          b.mundo && b.mundo.require === 'undefined' && b.mundo.process === 'undefined'), JSON.stringify(todas.map((b) => b.ventana)));
      ok('F1-RA22 [BARRERA] ninguna página declara Content-Security-Policy (F2)', todas.every((b) => b.mundo && b.mundo.csp === false));
      guardar('f1-a', { pid: PID, barreras: todas, evalFase1: evalR1 && evalR1.acc, evalFase2: evalR2 && evalR2.acc,
        acciones: llamadasIPC.acciones || [], hija: bHija });
      tlog('__MODO_TERMINADO__ a');
      await esperar(1000);
      app.exit(0);
      return;
    }

    // =====================================================================
    if (MODO === 'b') {
      tlog('--- F1-B: TRAS CERRAR Y VOLVER A ABRIR (persistencia) ---');
      const a = leer('f1-a');
      const guardados = leer('f1-dashboard').base.lit;
      await lanzador.webContents.executeJavaScript(`window.launcherAPI.openProject(${a.pid})`);
      const v = await esperarVentana(`projects/${a.pid}/dashboard.html`);
      ok('F1-RB0 [F1-J] el proyecto guardado antes vuelve a abrirse', !!v);
      await esperar(3500);
      const r = await recoger(v);
      info('reapertura dashboard: ' + JSON.stringify(r));
      ok('F1-RB1 [EXIGE/F1-D] tras cerrar y reabrir, lo guardado SIGUE siendo texto: cero ejecuciones',
        (r.ejec || []).length === 0 && (r.attrs || []).length === 0, JSON.stringify({ ejec: r.ejec, attrs: r.attrs }));
      ok('F1-RB1b …y el contenido guardado se recupera entero (se sigue viendo)',
        guardados.length > 0 && guardados.filter((c) => r.lit.includes(c)).length >= Math.min(10, guardados.length),
        JSON.stringify({ esperado: guardados, real: r.lit }));
      const vp = await abrirPorMenu(v, 'proyecto-prep-reunion', 'preparacion_reunion');
      if (vp) {
        await esperar(2000);
        const prep = await prepPasadas(vp);
        ok('F1-RB2 [EXIGE] Preparación tampoco interpreta nada de lo que lee del backup guardado',
          (prep.acc.ejec || []).length === 0 && (prep.acc.attrs || []).length === 0, JSON.stringify(prep.acc));
      } else ok('F1-RB2 [EXIGE] Preparación tampoco interpreta nada de lo que lee del backup guardado', false, 'sin ventana');
      ok('F1-RB3 el proyecto sigue existiendo y la batería no disparó ninguna acción de menú ajena',
        !!dbmod.get('SELECT id FROM projects WHERE id=?', [a.pid]) && accionesAjenas().length === 0, JSON.stringify(llamadasIPC.acciones));
      tlog('__MODO_TERMINADO__ b');
      await esperar(1000);
      app.exit(0);
      return;
    }

    // =====================================================================
    if (MODO === 'c') {
      tlog('--- F1-C: TÍTULO IMPORTADO HORNEADO EN dashboard.html ---');
      const titulo = N('titulo-horneado');
      const importJson = JSON.stringify({ state: { projectTitle: titulo, serviceStart: '2026-01-01', serviceEnd: '2026-12-31',
        milestones: [], risks: [], skills: [], coverage: [], phases: [],
        team: [{ id: 'tc1', alias: 'Persona C', role: 'Rol C', date: '2026-09-01', dateDisplay: '01/09/2026', status: 'activo', dni: '', email: '', telefono: '' }] } });
      const row = await lanzador.webContents.executeJavaScript(`window.launcherAPI.createProject('ignorado','','',${JSON.stringify(importJson)})`);
      const PID = row.id;
      const archivo = path.join(UD, 'projects', String(PID), 'dashboard.html');
      const html = fs.readFileSync(archivo, 'utf8');
      const ini = html.indexOf('id="factory-seed">');
      const cierre = html.indexOf('</script>', ini);
      const fuera = html.slice(cierre, cierre + 200);
      const dentro = html.slice(ini, cierre);
      info('horneado (tras el primer </script>): ' + fuera.replace(/\s+/g, ' ').slice(0, 150));
      ok('F1-RC1 [EXIGE/F1-H] el archivo horneado NO tiene markup del título fuera del seed',
        !fuera.includes('<img src=f1-no-existe.png data-f1=titulo-horneado'), fuera.slice(0, 120));
      ok('F1-RC1b [EXIGE/F1-H] el `<` del título va como \\u003c dentro del seed, así que no puede cerrar el <script>',
        dentro.includes('\\u003c') && !/<\/script/i.test(dentro) && !dentro.includes('<img'), dentro.slice(-160));
      await esperar(800);
      const lan = await recoger(lanzador);
      ok('F1-RC2 el lanzador pinta ese nombre escapado: no interpreta', (lan.ejec || []).length === 0, JSON.stringify(lan));
      await lanzador.webContents.executeJavaScript(`window.launcherAPI.openProject(${PID})`);
      const v = await esperarVentana(`projects/${PID}/dashboard.html`);
      await esperar(3500);
      const r = await recoger(v);
      const origen = await v.webContents.executeJavaScript(
        "(function(){var s=document.getElementById('factory-seed');var n=s&&s.nextElementSibling;" +
        "var pint=Array.prototype.filter.call(document.querySelectorAll('img[data-f1=titulo-horneado]'),function(e){return e!==n}).length;" +
        "return JSON.stringify({hermanoDelSeed:!!(n&&n.tagName==='IMG'&&n.getAttribute('data-f1')==='titulo-horneado'),pintadosPorRender:pint," +
        "seedLegible:(function(){try{JSON.parse(s.textContent);return true}catch(e){return false}})()})})()").then(JSON.parse).catch((e) => ({ error: e.message }));
      const gate = await v.webContents.executeJavaScript("(function(){var g=document.getElementById('onboarding-gate');return g?getComputedStyle(g).display:'sin-gate'})()").catch((e) => 'ERR ' + e.message);
      info('dashboard horneado: ' + JSON.stringify(r) + ' - asistente: ' + gate + ' - origen: ' + JSON.stringify(origen));
      ok('F1-RC3 [EXIGE] al abrir el proyecto no se ejecuta nada: el título horneado ya no crea markup',
        !r.ejec.includes('titulo-horneado') && origen.hermanoDelSeed === false && origen.pintadosPorRender === 0,
        JSON.stringify({ r, origen }));
      ok('F1-RC3b [EXIGE/§6] el seed horneado se vuelve a leer entero (no se pierde ningún campo)',
        origen.seedLegible === true, JSON.stringify(origen));
      const seedOk = await v.webContents.executeJavaScript(
        "(function(){var s=JSON.parse(document.getElementById('factory-seed').textContent);" +
        "return JSON.stringify({titulo:s.projectTitle,inicio:s.serviceStart,fin:s.serviceEnd,roles:(s.skillMatrixRoles||[]).length})})()")
        .then(JSON.parse).catch((e) => ({ error: e.message }));
      info('seed releido: ' + JSON.stringify(seedOk));
      ok('F1-RC3c [EXIGE/§6] el título se recupera EXACTO, con su `</script>` incluido',
        seedOk.titulo === titulo && seedOk.inicio === '2026-01-01', JSON.stringify(seedOk));
      const g = await volcadoYBackup(v);
      info('backup del proyecto C: ' + JSON.stringify(g && { aplicado: g.aplicado }));
      const prevIds = new Set(BrowserWindow.getAllWindows().map((x) => x.id));
      await v.webContents.executeJavaScript("window.panoramaBridge.projectMenuAction('archivo-directorio')").catch(() => {});
      const dirRow = dbmod.get("SELECT id FROM projects WHERE kind='directorio_talento'");
      const vd = dirRow ? await esperarVentana(`projects/${dirRow.id}/dashboard.html`, 20000, prevIds) : null;
      if (vd) {
        await esperar(2500);
        const res = await vd.webContents.executeJavaScript(
          "(async function(){await syncFromProjects(true);var p=state.people.find(function(x){return x.nombre==='Persona C'});" +
          "if(!p)return 'sin-persona';ui.openPersonId=p.id;renderPersonModal();return 'ok'})()").catch((e) => 'ERR ' + e.message);
        await esperar(900);
        const rd = await recoger(vd);
        info('directorio: ' + res + ' ' + JSON.stringify(rd));
        ok('F1-RC4 [EXIGE] Directorio: el nombre del proyecto ya no rompe el data-dedic de la ficha',
          !rd.attrs.includes('titulo-horneado') && res === 'ok', JSON.stringify({ res, rd }));
        ok('F1-RC5 …y el Directorio sigue sin interpretar nada', (rd.ejec || []).length === 0, JSON.stringify(rd));
        // El lector de ese atributo tiene que seguir recuperando el nombre EXACTO.
        const dedic = await vd.webContents.executeJavaScript(
          "(function(){var i=document.querySelector('[data-dedic]');return i?JSON.stringify({leido:i.dataset.dedic}):'sin-campo'})()")
          .then((x) => (x === 'sin-campo' ? x : JSON.parse(x))).catch((e) => ({ error: e.message }));
        info('data-dedic leido: ' + JSON.stringify(dedic));
        ok('F1-RC4b [EXIGE] …y su lector recupera el nombre del proyecto EXACTO por dataset',
          dedic && dedic.leido === titulo, JSON.stringify(dedic));
        guardar('f1-c', { pid: PID, dashboard: r, origen, gate, directorio: rd, dedic });
      } else ok('F1-RC4 [EXIGE] Directorio: el nombre del proyecto ya no rompe el data-dedic de la ficha', false, 'sin ventana del Directorio');
      tlog('__MODO_TERMINADO__ c');
      await esperar(1000);
      app.exit(0);
      return;
    }

    // =====================================================================
    // F1-I — un proyecto horneado ANTES de F1 (con el seed roto por su propio
    // título) tiene que seguir abriendo. Se fabrica el archivo a mano, con la
    // forma vieja, y se abre.
    if (MODO === 'd') {
      tlog('--- F1-D: PROYECTO YA HORNEADO ANTES DE F1 ---');
      const titulo = N('titulo-antiguo');
      const row = await lanzador.webContents.executeJavaScript(
        `window.launcherAPI.createProject(${JSON.stringify('Proyecto antiguo')},'','2026-01-01',null)`);
      const PID = row.id;
      const archivo = path.join(UD, 'projects', String(PID), 'dashboard.html');
      // Horneado A LA MANERA VIEJA: JSON.stringify sin escapar `<`.
      const stock = fs.readFileSync(archivo, 'utf8');
      const seedViejo = `<script type="application/json" id="factory-seed">${JSON.stringify({
        projectTitle: titulo, serviceStart: '2026-01-01', serviceEnd: null,
        skillMatrixRoles: ['Rol 1', 'Rol 2', 'Rol 3'], phases: [] })}</script>`;
      fs.writeFileSync(archivo, stock.replace(
        /<script type="application\/json" id="factory-seed">[\s\S]*?<\/script>/, () => seedViejo), 'utf8');
      const roto = fs.readFileSync(archivo, 'utf8');
      ok('F1-RD0 el archivo de partida está horneado con la forma VIEJA (su seed lleva el markup crudo)',
        roto.includes('<img src=f1-no-existe.png data-f1=titulo-antiguo'));
      await lanzador.webContents.executeJavaScript(`window.launcherAPI.openProject(${PID})`);
      const v = await esperarVentana(`projects/${PID}/dashboard.html`);
      ok('F1-RD1 [F1-I] un proyecto horneado ANTES de F1 sigue abriendo', !!v);
      await esperar(3500);
      const vivo = await v.webContents.executeJavaScript(
        "JSON.stringify({titulo:(document.getElementById('page-title')||{}).textContent||'',hitos:!!document.getElementById('milestone-list')})")
        .then(JSON.parse).catch((e) => ({ error: e.message }));
      info('proyecto antiguo: ' + JSON.stringify(vivo));
      ok('F1-RD2 [F1-I] …y la página termina de pintar (no se queda a medias)',
        !vivo.error && vivo.hitos === true, JSON.stringify(vivo));
      // Al abrirlo, ensureProjectDashboardFileFresh lo REHORNEA con el código
      // nuevo: a partir de ahí el archivo ya no lleva markup suelto.
      const tras = fs.readFileSync(archivo, 'utf8');
      const seedTras = tras.slice(tras.indexOf('id="factory-seed">'), tras.indexOf('</script>', tras.indexOf('id="factory-seed">')));
      ok('F1-RD3 [F1-I] al abrirlo se rehornea y el markup suelto del seed viejo desaparece',
        !tras.includes('<img src=f1-no-existe.png data-f1=titulo-antiguo') && !/<\/script/i.test(seedTras),
        seedTras.slice(0, 180));
      // Honestidad: un archivo que YA estaba roto antes de F1 tiene el seed
      // ilegible, así que al rehornear se reponen los valores de fábrica. No lo
      // causa F1 (lo causaba el horneado viejo); y no se pierde nada del usuario,
      // porque sus datos reales viven en localStorage/backups, no en el seed.
      let seedViejoLegible = true;
      try { JSON.parse(/id="factory-seed">([\s\S]*?)<\/script>/.exec(roto)[1]); } catch (e) { seedViejoLegible = false; }
      info('seed del archivo viejo legible: ' + seedViejoLegible + ' | seed tras rehornear: ' + seedTras.slice(18, 120));
      ok('F1-RD3b [F1-I] el seed viejo era ilegible (por el bug viejo), y el nuevo sí se lee',
        seedViejoLegible === false && (() => { try { JSON.parse(seedTras.slice(18)); return true; } catch (e) { return false; } })(),
        seedTras.slice(0, 120));
      const g = await volcadoYBackup(v);
      ok('F1-RD4 [F1-J] guarda con normalidad tras el rehorneado', !!g && g.aplicado === true, JSON.stringify(g && { aplicado: g.aplicado }));
      tlog('__MODO_TERMINADO__ d');
      await esperar(1000);
      app.exit(0);
      return;
    }
  } catch (e) {
    tlog('EXCEPCION EN EL ARNES: ' + ((e && e.stack) || String(e)));
    app.exit(4);
  }
});