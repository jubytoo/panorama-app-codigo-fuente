// ---------------------------------------------------------------------------
// F1 — VALIDACIÓN LIMPIA: datos ORDINARIOS, sin ningún marcador de seguridad.
//
// Comprueba que el escape por contexto de F1 no ha roto ninguna pantalla y que
// un texto normal se ve EXACTAMENTE como se escribió. Incluye a propósito
// caracteres perfectamente legítimos que un usuario teclea todos los días:
//   &   "   <   >   y acentos
//
// Lo que se exige, por ventana:
//   · cada texto introducido aparece VERBATIM (en el texto visible o en el
//     valor de su campo). Si hubiera doble escape, `I+D & Calidad` se vería
//     como `I+D &amp; Calidad` y la comparación fallaría;
//   · NO aparece ninguna entidad literal (`&lt;` `&gt;` `&amp;` `&quot;`
//     `&#39;`) en el texto visible — ese es el detector de doble escape;
//   · el markup LEGÍTIMO sigue ahí (badges, banderas, semáforos, rail);
//   · no hay bloques vacíos donde debería haber filas.
//
//   --modo=v  proyecto nuevo con datos ordinarios: lanzador, dashboard,
//             Directorio, Evaluación, Preparación (+ capturas de pantalla)
//   --modo=w  proyecto horneado ANTES de F1, con datos ordinarios: ¿doble escape?
//   --modo=x  logo: válido / ninguno / inválido
//   --modo=n  la "ventana negra": qué es, y que en uso normal NO aparece
// ---------------------------------------------------------------------------
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const arg = process.argv.find((a) => a.startsWith('--sandbox='));
if (!arg) { console.error('falta --sandbox='); process.exit(2); }
const SB = arg.slice('--sandbox='.length);
if (!/_a33-f1-limpio/i.test(SB)) { console.error('sandbox no marcado'); process.exit(2); }
const MODO = (process.argv.find((a) => a.startsWith('--modo=')) || '--modo=nada').slice(7);
const CAPTURAS = process.env.F1_CAPTURAS || path.join(SB, 'capturas');
fs.mkdirSync(CAPTURAS, { recursive: true });

app.setPath('appData', path.join(SB, 'Roaming'));
app.setPath('userData', path.join(SB, 'Roaming', 'panorama-app'));
const UD = path.join(SB, 'Roaming', 'panorama-app');
const PROJDIR = 'C:/Codigo Fuente PS/panorama-app-codigo-fuente_1';

const ascii = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u00b7\u2014\u2013]/g, '-').replace(/\u2026/g, '...');
function tlog(s) { try { fs.appendFileSync(path.join(SB, 'test.log'), `[${new Date().toISOString()}] ${ascii(s)}\n`); } catch (e) {} }
function ok(n, c, extra) { tlog((c ? 'OK    ' : 'FALLO ') + n + (c ? '' : '  -- ' + (extra === undefined ? '' : extra))); }
function info(s) { tlog('      ' + s); }

dialog.showMessageBoxSync = function (a, b) { const o = (b || a) || {}; tlog('      DIALOGO: ' + o.title); return 0; };
dialog.showOpenDialogSync = function () { return null; };

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
async function captura(w, nombre) {
  try {
    const img = await w.webContents.capturePage();
    const destino = path.join(CAPTURAS, nombre + '.png');
    fs.writeFileSync(destino, img.toPNG());
    info('captura: ' + nombre + '.png');
    return destino;
  } catch (e) { info('captura ' + nombre + ' fallo: ' + e.message); return null; }
}

// --- DATOS ORDINARIOS ------------------------------------------------------
// Ni una etiqueta, ni un marcador. Solo texto que un usuario teclea.
const TXT = {
  proyecto: 'Soporte I+D & Calidad',
  hito1: 'Nivel < 3 alcanzado',
  hito2: 'Migración A > B',
  hitoDesc: 'Incluye "pruebas" & validación',
  entNombre: 'Acta de cierre v2',
  entTipo: 'Acta',
  riesgoTitulo: 'Retraso en "Norte" & proveedor',
  riesgoMit: 'Revisar en < 5 días',
  riesgoCont: 'Escalar a Dirección & Operaciones',
  riesgoObs: 'Se materializó el "lunes"',
  skillNombre: 'Diseño & Operaciones',
  skillGrupo: 'Nivel < 3',
  rolColumna: 'Analista I+D & Calidad',
  equipoAlias: 'José Álvarez',
  equipoRol: 'Analista I+D & Calidad',
  covMotivo: 'Vacaciones & permiso',
  covCubierto: 'María Núñez',
  covNotas: 'Cobertura < 2 semanas',
  fase: 'Fase I+D & Calidad',
};
const EVALTXT = {
  candidato: 'José Álvarez',
  puesto: 'Analista I+D & Calidad',
  tarea: 'Diagnóstico < 30 min',
  guia: 'Preguntar por "logs" & journalctl',
  formacion: 'FP Superior & certificación',
  tap: 'TAP "Norte"',
};

function estadoLimpio() {
  return {
    projectTitle: TXT.proyecto, serviceStart: '2026-01-01', serviceEnd: '2026-12-31',
    skillMatrixRoles: [TXT.rolColumna, 'Rol 2'],
    phases: [{ id: 'f1', name: TXT.fase, endDate: '2026-06-30' }],
    milestones: [
      { id: 'm1', label: TXT.hito1, date: '2026-09-20', actualDate: null, recurrente: false, descripcion: TXT.hitoDesc,
        entregables: [{ id: 'e1', tipo: TXT.entTipo, nombre: TXT.entNombre, ruta: '', entregado: true, fecha: null }] },
      { id: 'm2', label: TXT.hito2, date: '2026-09-05', actualDate: '2026-09-10', recurrente: false, descripcion: '', entregables: [] },
    ],
    risks: [
      { id: 'R-01', title: TXT.riesgoTitulo, category: 'Contractual', p: 4, i: 4, mitigacion: TXT.riesgoMit,
        contingencia: TXT.riesgoCont, respMitigacion: 'José Álvarez', respContingencia: '', status: 'materializado',
        fechaDeteccion: '2026-09-05', fechaMaterializacion: '2026-09-10', fechaCierre: null,
        obsMaterializacion: TXT.riesgoObs, respMaterializacion: '', obsCierre: '', respCierre: '' },
    ],
    skills: [{ id: 's1', group: TXT.skillGrupo, name: TXT.skillNombre, levels: [2, 3], pending: false }],
    team: [{ id: 't1', alias: TXT.equipoAlias, role: TXT.equipoRol, date: '2026-09-10', dateDisplay: '10/09/2026',
      status: 'activo', dni: '', email: '', telefono: '' }],
    coverage: [{ id: 'c1', tipo: 'cobertura', roleSnapshot: TXT.equipoRol, motivo: TXT.covMotivo, fechaInicio: '2026-09-01',
      fechaFin: null, cubiertoPor: TXT.covCubierto, dni: '', email: '', telefono: '', notas: TXT.covNotas,
      loggedAt: '2026-09-01T10:00:00Z' }],
    corporateLogo: null, railWindow: null, enProrroga: false, prorrogaDesde: null, prorrogaEstimada: null,
  };
}

// Texto visible + valores de los campos: así se ve tanto lo pintado como lo
// que hay dentro de inputs y textareas.
const LEER_TEXTO = `(function(){
  var t = document.body ? document.body.innerText : '';
  var v = [];
  Array.prototype.forEach.call(document.querySelectorAll('input,textarea'), function(e){ if(e.value) v.push(e.value); });
  Array.prototype.forEach.call(document.querySelectorAll('select'), function(e){
    Array.prototype.forEach.call(e.options, function(o){ v.push(o.textContent); v.push(o.value); }); });
  return JSON.stringify({ texto: t, valores: v.join('\\n') });
})()`;
const ENTIDADES = ['&lt;', '&gt;', '&amp;', '&quot;', '&#39;'];

async function revisar(w, nombre, esperados, marcaje) {
  const r = await w.webContents.executeJavaScript(LEER_TEXTO).then(JSON.parse).catch((e) => ({ error: e.message }));
  if (r.error) { ok(`F1-L ${nombre}: se puede leer la pantalla`, false, r.error); return null; }
  // Se compara sin distinguir mayúsculas: varias cabeceras llevan
  // `text-transform:uppercase` en su CSS, y `innerText` devuelve el texto tal
  // como se RENDERIZA. Lo que se está comprobando es que no haya doble escape
  // ni markup, no el estilo tipográfico.
  const todo = (r.texto + '\n' + r.valores).toLowerCase();
  const faltan = esperados.filter((s) => !todo.includes(s.toLowerCase()));
  ok(`F1-L ${nombre}: los textos se ven EXACTAMENTE como se escribieron`, faltan.length === 0,
    'no aparecen: ' + JSON.stringify(faltan));
  // Detector de doble escape: una entidad literal en el texto VISIBLE.
  const conEntidad = ENTIDADES.filter((e) => r.texto.includes(e));
  ok(`F1-L ${nombre}: sin entidades HTML a la vista (no hay doble escape)`, conEntidad.length === 0,
    'aparecen: ' + JSON.stringify(conEntidad) + ' | ' + r.texto.replace(/\s+/g, ' ').slice(0, 220));
  // Y tampoco se ve markup suelto.
  const conMarkup = /<\/?(b|i|img|div|span|script|textarea|option)\b/i.test(r.texto);
  ok(`F1-L ${nombre}: no se ve código HTML en pantalla`, !conMarkup,
    r.texto.replace(/\s+/g, ' ').slice(0, 220));
  if (marcaje) {
    const m = await w.webContents.executeJavaScript(marcaje).then(JSON.parse).catch(() => ({}));
    info(nombre + ' estructura: ' + JSON.stringify(m));
    const vacios = Object.entries(m).filter(([, v]) => v === 0 || v === false).map(([k]) => k);
    ok(`F1-L ${nombre}: el markup legítimo y las filas siguen ahí`, vacios.length === 0, 'a cero: ' + JSON.stringify(vacios));
  }
  return r;
}

app.whenReady().then(async () => {
  if (MODO === 'nada') return;
  try {
    const lanzador = await esperarVentana('launcher/index.html');
    if (!lanzador) { tlog('ERROR: no aparecio el lanzador'); app.exit(3); return; }
    await esperar(1500);

    // =====================================================================
    if (MODO === 'v') {
      tlog('--- F1-LIMPIO: PROYECTO NUEVO CON DATOS ORDINARIOS ---');
      const importJson = JSON.stringify({ state: estadoLimpio(), history: [] });
      const row = await lanzador.webContents.executeJavaScript(
        `window.launcherAPI.createProject('ignorado','Cliente Norte','',${JSON.stringify(importJson)})`);
      const PID = row.id;
      ok('F1-L0 el proyecto se crea con nombre ordinario', row.name === TXT.proyecto, JSON.stringify(row));

      // 1) LANZADOR
      // El arnés crea el proyecto llamando al API directamente, así que la
      // lista no se repinta sola (en la app lo dispara el propio flujo de
      // "Nuevo proyecto"). Se fuerza el mismo repintado que hace el lanzador.
      await esperar(1200);
      await lanzador.webContents.executeJavaScript('refresh()').catch((e) => info('refresh ERR ' + e.message));
      await esperar(1500);
      await revisar(lanzador, 'lanzador', [TXT.proyecto], "JSON.stringify({tarjetas:document.querySelectorAll('.project-card,[data-project-id],.card').length})");
      await captura(lanzador, '1-lanzador');

      // 2) DASHBOARD
      await lanzador.webContents.executeJavaScript(`window.launcherAPI.openProject(${PID})`);
      const v = await esperarVentana(`projects/${PID}/dashboard.html`);
      ok('F1-L1 el dashboard abre', !!v);
      await esperar(3500);
      // Se despliegan los detalles para que se vea también lo de dentro.
      await v.webContents.executeJavaScript(
        "(function(){ui.expandedMilestones={m1:true};ui.expandedRisks={'R-01':true};render();return 1})()").catch(() => {});
      await esperar(900);
      await revisar(v, 'dashboard', [TXT.proyecto, TXT.hito1, TXT.hito2, TXT.hitoDesc, TXT.entNombre,
        TXT.riesgoTitulo, TXT.riesgoMit, TXT.riesgoCont, TXT.skillNombre, TXT.skillGrupo, TXT.rolColumna,
        TXT.equipoAlias, TXT.equipoRol, TXT.covMotivo, TXT.covCubierto, TXT.covNotas, TXT.fase],
        "JSON.stringify({filasHito:document.querySelectorAll('.ms-row').length," +
        "filasRiesgo:document.querySelectorAll('.risk-item').length," +
        "semaforos:document.querySelectorAll('.ms-semaforo').length," +
        "badgeEntregable:document.querySelectorAll('.ent-tipo-badge').length," +
        "railSvg:document.querySelectorAll('#rail svg, .rail svg, svg').length," +
        "kpis:document.querySelectorAll('.exec-kpi').length," +
        "botones:document.querySelectorAll('button').length})");
      await captura(v, '2-dashboard');
      // Un control real: desplegar/plegar el detalle de un hito.
      const clic = await v.webContents.executeJavaScript(
        "(function(){var b=document.querySelector('[data-toggle-ms-detail]');if(!b)return 'sin-boton';b.click();" +
        "return document.querySelectorAll('.ms-detail').length>=0?'ok':'raro'})()").catch((e) => 'ERR ' + e.message);
      ok('F1-L2 los controles del dashboard siguen respondiendo', clic === 'ok', String(clic));
      // Guardado normal (hace falta para Directorio y Preparación).
      const g = await v.webContents.executeJavaScript(
        "(function(){var d={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);d[k]=localStorage.getItem(k);}" +
        "return window.panoramaBridge.saveBackup(JSON.stringify(d),'manual');})()");
      ok('F1-L3 guarda con normalidad', !!g && g.aplicado === true, JSON.stringify(g && { aplicado: g.aplicado }));

      // 3) PREPARACIÓN DE REUNIÓN
      const vp = await abrirPorMenu(v, 'proyecto-prep-reunion', 'preparacion_reunion');
      ok('F1-L4 Preparación abre', !!vp);
      if (vp) {
        await esperar(2500);
        for (let i = 0; i < 25; i++) {
          const st = await vp.webContents.executeJavaScript('state.jsonStatus').catch(() => null);
          if (st === 'ok' || st === 'error') break;
          await esperar(400);
        }
        await vp.webContents.executeJavaScript(
          "(function(){state.meetingDate='2026-09-01';state.todayDate='2026-09-16';state.step=STEP_KEYS.indexOf('hitos');render();return 1})()").catch(() => {});
        await esperar(900);
        await revisar(vp, 'preparacion(hitos)', [TXT.hito2],
          "JSON.stringify({banderas:document.querySelectorAll('.flag').length+1,items:document.querySelectorAll('.item').length})");
        await captura(vp, '3-preparacion-hitos');
        await vp.webContents.executeJavaScript(
          "(function(){state.step=STEP_KEYS.indexOf('riesgos');render();return 1})()").catch(() => {});
        await esperar(900);
        await revisar(vp, 'preparacion(riesgos)', [TXT.riesgoTitulo], null);
        // El guion, y su exportación a texto plano (aquí se vería un doble escape).
        await vp.webContents.executeJavaScript(
          "(function(){state.step=STEP_KEYS.indexOf('guion');render();return 1})()").catch(() => {});
        await esperar(900);
        await revisar(vp, 'preparacion(guion)', [TXT.hito2, TXT.riesgoTitulo], null);
        await captura(vp, '4-preparacion-guion');
        const txt = await vp.webContents.executeJavaScript('guionAsText()').catch((e) => 'ERR ' + e.message);
        const faltanTxt = [TXT.hito2, TXT.riesgoTitulo].filter((s) => !String(txt).includes(s));
        ok('F1-L5 el guion exportado (.txt) sale con el texto EXACTO, sin entidades',
          faltanTxt.length === 0 && !ENTIDADES.some((e) => String(txt).includes(e)),
          'faltan ' + JSON.stringify(faltanTxt) + ' | ' + String(txt).replace(/\s+/g, ' ').slice(0, 200));
      }

      // 4) EVALUACIÓN DE CANDIDATOS
      const ve = await abrirPorMenu(v, 'proyecto-eval-candidatos', 'evaluacion_candidatos');
      ok('F1-L6 Evaluación abre', !!ve);
      if (ve) {
        await esperar(2000);
        const estadoEval = { threshold: 3.5,
          puestos: [{ id: 'p1', name: EVALTXT.puesto, formacionMinima: EVALTXT.formacion, aniosMinimos: '3', sbaReferencia: '',
            tasks: [{ id: 't1', name: EVALTXT.tarea, weight: 4, guide: EVALTXT.guia }] }],
          evaluaciones: [{ id: 'ev1', candidato: EVALTXT.candidato, puestoId: 'p1', tap: EVALTXT.tap, manager: '',
            entrevistador: '', telefono: '', fecha: '2026-09-15', formacion: EVALTXT.formacion, aniosExperiencia: '6',
            sba: '', cvFileName: '', cvStoredName: null, notas: { t1: { nota: 4, comentario: 'Sólido & claro' } }, feedbackEdited: null }] };
        const ge = await ve.webContents.executeJavaScript(
          'window.panoramaBridge.saveCandidateEvalData(' + JSON.stringify(JSON.stringify(estadoEval)) + ')');
        ok('F1-L7 Evaluación guarda el estado ordinario', !!ge && ge.aplicado === true, JSON.stringify(ge && { aplicado: ge.aplicado }));
        ve.webContents.reload();
        await esperar(3000);
        await ve.webContents.executeJavaScript(
          "(function(){state.evaluaciones.forEach(function(e){expandedEvalIds.add(e.id)});state.puestos.forEach(function(p){expandedPuestoIds.add(p.id)});renderAll();return 1})()").catch(() => {});
        await esperar(800);
        await revisar(ve, 'evaluacion', [EVALTXT.candidato, EVALTXT.puesto, EVALTXT.tarea, EVALTXT.guia, EVALTXT.formacion, EVALTXT.tap],
          "JSON.stringify({pantallaDeCarga:!document.getElementById('loadingScreen')," +
          "tarjetasEval:document.querySelectorAll('.card[data-eval-card]').length," +
          "tarjetasPuesto:document.querySelectorAll('.card[data-puesto-card]').length," +
          "filasTarea:document.querySelectorAll('table.tasks tbody tr').length})");
        await captura(ve, '5-evaluacion');
      }

      // 5) DIRECTORIO DE TALENTO
      const prevIds = new Set(BrowserWindow.getAllWindows().map((x) => x.id));
      await v.webContents.executeJavaScript("window.panoramaBridge.projectMenuAction('archivo-directorio')").catch(() => {});
      const dirRow = dbmod.get("SELECT id FROM projects WHERE kind='directorio_talento'");
      const vd = dirRow ? await esperarVentana(`projects/${dirRow.id}/dashboard.html`, 20000, prevIds) : null;
      ok('F1-L8 el Directorio abre', !!vd);
      if (vd) {
        await esperar(2500);
        const res = await vd.webContents.executeJavaScript(
          "(async function(){await syncFromProjects(true);var p=state.people.find(function(x){return x.nombre==='" + TXT.equipoAlias + "'});" +
          "if(!p)return 'sin-persona';ui.openPersonId=p.id;renderPersonModal();return 'ok'})()").catch((e) => 'ERR ' + e.message);
        ok('F1-L9 el Directorio sincroniza y abre la ficha de la persona', res === 'ok', String(res));
        await esperar(900);
        await revisar(vd, 'directorio(ficha)', [TXT.equipoAlias, TXT.equipoRol, TXT.proyecto], null);
        await captura(vd, '6-directorio-ficha');
        // El atributo que F1 tocó: su lector tiene que devolver el nombre EXACTO.
        const dedic = await vd.webContents.executeJavaScript(
          "(function(){var i=document.querySelector('[data-dedic]');return i?i.dataset.dedic:'sin-campo'})()").catch((e) => 'ERR ' + e.message);
        ok('F1-L10 data-dedic devuelve el nombre de proyecto EXACTO', dedic === TXT.proyecto, JSON.stringify(dedic));
      }
      tlog('__MODO_TERMINADO__ v');
      await esperar(1200);
      app.exit(0);
      return;
    }

    // =====================================================================
    if (MODO === 'w') {
      tlog('--- F1-LIMPIO: PROYECTO HORNEADO ANTES DE F1, DATOS ORDINARIOS ---');
      const row = await lanzador.webContents.executeJavaScript(
        `window.launcherAPI.createProject(${JSON.stringify(TXT.proyecto)},'','2026-01-01',null)`);
      const PID = row.id;
      const archivo = path.join(UD, 'projects', String(PID), 'dashboard.html');
      // Se rehornea A LA MANERA VIEJA (JSON.stringify sin escapar `<`).
      const stock = fs.readFileSync(archivo, 'utf8');
      const seedViejo = `<script type="application/json" id="factory-seed">${JSON.stringify({
        projectTitle: TXT.proyecto, serviceStart: '2026-01-01', serviceEnd: null,
        skillMatrixRoles: [TXT.rolColumna, 'Rol 2'], phases: [] })}</script>`;
      fs.writeFileSync(archivo, stock.replace(
        /<script type="application\/json" id="factory-seed">[\s\S]*?<\/script>/, () => seedViejo), 'utf8');
      await lanzador.webContents.executeJavaScript(`window.launcherAPI.openProject(${PID})`);
      const v = await esperarVentana(`projects/${PID}/dashboard.html`);
      ok('F1-W1 un proyecto horneado antes de F1 abre igual', !!v);
      await esperar(3500);
      await revisar(v, 'dashboard(pre-F1)', [TXT.proyecto, TXT.rolColumna], null);
      await captura(v, '7-dashboard-pre-f1');
      const seed = await v.webContents.executeJavaScript(
        "(function(){try{var s=JSON.parse(document.getElementById('factory-seed').textContent);" +
        "return JSON.stringify({titulo:s.projectTitle,inicio:s.serviceStart,roles:s.skillMatrixRoles})}catch(e){return JSON.stringify({error:e.message})}})()")
        .then(JSON.parse).catch((e) => ({ error: e.message }));
      info('seed tras reabrir: ' + JSON.stringify(seed));
      // ¿Llegan los roles del seed hasta el estado y hasta la pantalla?
      const roles = await v.webContents.executeJavaScript(
        "(function(){var cab=document.querySelector('.sm-head-row');" +
        "return JSON.stringify({estado:state.skillMatrixRoles,skills:state.skills.length," +
        "cabecera:cab?cab.innerText.replace(/\\s+/g,' ').trim():null," +
        "gate:(function(){var g=document.getElementById('onboarding-gate');return g?getComputedStyle(g).display:'sin-gate'})()})})()")
        .then(JSON.parse).catch((e) => ({ error: e.message }));
      info('roles pre-F1: ' + JSON.stringify(roles));
      ok('F1-W3 los roles del seed antiguo llegan al estado y a la cabecera de Skill Matrix',
        Array.isArray(roles.estado) && roles.estado[0] === TXT.rolColumna
        && String(roles.cabecera || '').toLowerCase().includes(TXT.rolColumna.toLowerCase()), JSON.stringify(roles));
      ok('F1-W4 el `&` del rol se conserva en pantalla (no se convierte en &amp;)',
        String(roles.cabecera || '').includes('I+D & CALIDAD') || String(roles.cabecera || '').includes('I+D & Calidad'),
        JSON.stringify(roles.cabecera));
      ok('F1-W2 con datos ORDINARIOS el seed antiguo se relee entero, sin perder nada',
        seed.titulo === TXT.proyecto && seed.inicio === '2026-01-01' && (seed.roles || [])[0] === TXT.rolColumna,
        JSON.stringify(seed));
      tlog('__MODO_TERMINADO__ w');
      await esperar(1000);
      app.exit(0);
      return;
    }

    // =====================================================================
    if (MODO === 'x') {
      tlog('--- F1-LIMPIO: LOGOS ---');
      // Un PNG de 1x1 real, como el que produce readAsDataURL.
      const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const casos = [['logo-valido', PNG, true], ['logo-ninguno', null, false], ['logo-invalido', 'javascript:alert(1)', false]];
      for (const [nombre, valor, debeVerse] of casos) {
        const st = estadoLimpio();
        st.corporateLogo = valor;
        const row = await lanzador.webContents.executeJavaScript(
          `window.launcherAPI.createProject('ignorado','','',${JSON.stringify(JSON.stringify({ state: st, history: [] }))})`);
        await lanzador.webContents.executeJavaScript(`window.launcherAPI.openProject(${row.id})`);
        const v = await esperarVentana(`projects/${row.id}/dashboard.html`);
        await esperar(3000);
        const r = await v.webContents.executeJavaScript(
          "(function(){var s=document.getElementById('header-logo-banner');var im=s?s.querySelector('img'):null;" +
          "return JSON.stringify({hayImg:!!im,src:im?im.src.slice(0,30):null,roto:im?(im.complete&&im.naturalWidth===0):false," +
          "imgsRotas:Array.prototype.filter.call(document.images,function(x){return x.complete&&x.naturalWidth===0&&x.getAttribute('src')}).length})})()")
          .then(JSON.parse).catch((e) => ({ error: e.message }));
        info(nombre + ': ' + JSON.stringify(r));
        ok(`F1-X ${nombre}: ${debeVerse ? 'se ve la imagen' : 'no se pinta ninguna imagen'}`,
          r.hayImg === debeVerse, JSON.stringify(r));
        // Hay UNA imagen rota en todo dashboard horneado, y es ANTERIOR a F1:
        // la plantilla tiene dos <img src="../assets/icon-256.png"> (pantalla
        // de carga y barra de título) y `fixVendorScriptPaths` (main.js) las
        // reemplaza con `String.replace` de patrón CADENA, que solo sustituye
        // la PRIMERA. La segunda queda con la ruta relativa y no resuelve.
        // Nada que ver con el logo de F1. Se cuenta, no se tapa.
        ok(`F1-X ${nombre}: no aparece ninguna imagen rota NUEVA (aparte del icono de la barra de título, anterior a F1)`,
          r.imgsRotas <= 1 && !r.roto, JSON.stringify(r));
        await captura(v, '8-' + nombre);
        v.destroy();
        await esperar(600);
      }
      tlog('__MODO_TERMINADO__ x');
      await esperar(1000);
      app.exit(0);
      return;
    }

    // =====================================================================
    // La "ventana negra": identificarla y demostrar que en uso normal NO sale.
    if (MODO === 'n') {
      tlog('--- F1-LIMPIO: LA VENTANA NEGRA ---');
      const importJson = JSON.stringify({ state: estadoLimpio(), history: [] });
      const row = await lanzador.webContents.executeJavaScript(
        `window.launcherAPI.createProject('ignorado','','',${JSON.stringify(importJson)})`);
      await lanzador.webContents.executeJavaScript(`window.launcherAPI.openProject(${row.id})`);
      const v = await esperarVentana(`projects/${row.id}/dashboard.html`);
      await esperar(3000);

      // 1) USO NORMAL: se recorren las cuatro ventanas y se mira si aparece
      //    alguna ventana sin contenido o con título genérico.
      const vp = await abrirPorMenu(v, 'proyecto-prep-reunion', 'preparacion_reunion');
      const ve = await abrirPorMenu(v, 'proyecto-eval-candidatos', 'evaluacion_candidatos');
      await esperar(2500);
      const inventario = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()).map((w) => ({
        titulo: w.getTitle(), url: decodeURIComponent(w.webContents.getURL()).replace(/^.*\/(?=[^/]+$)/, ''),
        visible: w.isVisible(),
      }));
      info('ventanas en uso normal: ' + JSON.stringify(inventario));
      const genericas = inventario.filter((w) => /^electron$/i.test(w.titulo) || !w.url);
      ok('F1-N1 en USO NORMAL no aparece ninguna ventana titulada "Electron" ni sin contenido',
        genericas.length === 0, JSON.stringify(genericas));
      ok('F1-N2 …y todas las ventanas abiertas son productivas y con su propio título',
        inventario.length >= 3 && inventario.every((w) => w.titulo && w.url), JSON.stringify(inventario));
      await captura(lanzador, '9-uso-normal-lanzador');

      // 2) Ahora se reproduce A PROPÓSITO lo que hacía el arnés F1, para
      //    identificar la ventana: window.open('about:blank').
      const antes = new Set(BrowserWindow.getAllWindows().map((x) => x.id));
      await v.webContents.executeJavaScript("window.open('about:blank','_blank')").catch(() => {});
      await esperar(1500);
      const hija = BrowserWindow.getAllWindows().find((x) => !antes.has(x.id) && !x.isDestroyed());
      // ANCLAJE ACTUALIZADO (ronda F2, 17 sept 2026). En la validación de F1,
      // F1-N3 IDENTIFICABA la ventana negra: la hija de este window.open, con
      // título «Electron». F3 (cerrado el 17 sept) la deniega siempre, así que
      // ya no aparece; la ronda F3 no reejecutó este arnés y no se vio. Se
      // conserva la reproducción y se exige lo que F3 garantiza.
      if (hija) {
        const ficha = { titulo: hija.getTitle(), url: hija.webContents.getURL(),
          fondo: (() => { try { return hija.getBackgroundColor(); } catch (e) { return null; } })() };
        info('VENTANA NEGRA (no deberia existir desde F3) = ' + JSON.stringify(ficha));
        await captura(hija, '10-ventana-negra');
        hija.destroy();
      }
      ok('F1-N3 [F3 CERRADO] el window.open(about:blank) que producia la «ventana negra» ya NO abre ninguna ventana',
        !hija, hija ? 'aparecio una ventana' : '');
      tlog('__MODO_TERMINADO__ n');
      await esperar(1000);
      app.exit(0);
      return;
    }
    // =====================================================================
    // Diagnóstico de los 3 fallos de la tirada limpia, para saber si alguno es
    // regresión de F1 o comportamiento normal ajeno a F1.
    if (MODO === 'q') {
      tlog('--- F1-LIMPIO: DIAGNOSTICO DE LOS FALLOS ---');
      const importJson = JSON.stringify({ state: estadoLimpio(), history: [] });
      const row = await lanzador.webContents.executeJavaScript(
        `window.launcherAPI.createProject('ignorado','','',${JSON.stringify(importJson)})`);

      // (1) LANZADOR: ¿la tarjeta tiene el nombre, y cuándo?
      await esperar(1200);
      const antesRefresco = await lanzador.webContents.executeJavaScript(
        "JSON.stringify({texto:document.body.innerText.slice(0,300),tarjetas:document.querySelectorAll('[data-project-id],.project-card,.proj-card').length})")
        .then(JSON.parse).catch((e) => ({ error: e.message }));
      info('lanzador ANTES de refrescar: ' + JSON.stringify(antesRefresco));
      // El lanzador repinta cuando main.js le manda 'projects:changed'; aquí se
      // fuerza el mismo repintado que hace esa notificación.
      await lanzador.webContents.executeJavaScript('refresh()').catch((e) => info('refresh ERR ' + e.message));
      await esperar(1800);
      const trasRefresco = await lanzador.webContents.executeJavaScript(
        "JSON.stringify({tiene:document.body.innerText.indexOf(" + JSON.stringify(TXT.proyecto) + ")>=0,texto:document.body.innerText.slice(0,300)})")
        .then(JSON.parse).catch((e) => ({ error: e.message }));
      info('lanzador TRAS refrescar: ' + JSON.stringify(trasRefresco));
      ok('F1-Q1 el lanzador SÍ muestra el nombre ordinario una vez repinta (no era un fallo de escape)',
        trasRefresco.tiene === true, JSON.stringify(trasRefresco));
      const entidadesLan = ENTIDADES.filter((e) => String(trasRefresco.texto || '').includes(e));
      ok('F1-Q1b …y lo pinta sin entidades ni markup', entidadesLan.length === 0 && !/<\/?[a-z]/i.test(String(trasRefresco.texto || '')),
        JSON.stringify(entidadesLan));
      await captura(lanzador, '11-lanzador-con-proyecto');

      // (2) SKILL MATRIX sin skills: ¿se pintan las cabeceras de rol?
      await lanzador.webContents.executeJavaScript(`window.launcherAPI.openProject(${row.id})`);
      const v = await esperarVentana(`projects/${row.id}/dashboard.html`);
      await esperar(3000);
      const sm = await v.webContents.executeJavaScript(
        "(function(){var n=state.skills.length;var cab=document.querySelectorAll('.sm-head-row').length;" +
        "var txt=document.body.innerText.indexOf(" + JSON.stringify(TXT.rolColumna) + ")>=0;" +
        "state.skills=[];render();var cab0=document.querySelectorAll('.sm-head-row').length;" +
        "var txt0=document.body.innerText.indexOf(" + JSON.stringify(TXT.rolColumna) + ")>=0;" +
        "return JSON.stringify({skills:n,cabeceraConSkills:cab,textoConSkills:txt,cabeceraSinSkills:cab0,textoSinSkills:txt0})})()")
        .then(JSON.parse).catch((e) => ({ error: e.message }));
      info('skill matrix: ' + JSON.stringify(sm));
      // La cabecera se pinta SIEMPRE (con o sin skills). Lo que despistaba es
      // que su CSS la pone en MAYÚSCULAS, y `innerText` devuelve lo renderizado.
      ok('F1-Q2 la cabecera de Skill Matrix se pinta siempre; lo que cambia es que el CSS la pasa a mayúsculas',
        sm.cabeceraConSkills === 1 && sm.cabeceraSinSkills === 1 && sm.textoSinSkills === true, JSON.stringify(sm));

      // (3) ¿QUÉ imagen está rota, y desde cuándo?
      const imgs = await v.webContents.executeJavaScript(
        "JSON.stringify(Array.prototype.map.call(document.images,function(x){return {src:(x.getAttribute('src')||'').slice(0,80),ok:!(x.complete&&x.naturalWidth===0),id:x.id||null,clase:x.className||null}}))")
        .then(JSON.parse).catch((e) => ({ error: e.message }));
      info('imagenes: ' + JSON.stringify(imgs));
      const rotas = (imgs || []).filter((x) => !x.ok);
      ok('F1-Q3 la imagen rota NO es el logo (el logo de F1 solo se pinta si es válido)',
        rotas.every((x) => !/^data:image\//.test(x.src)), JSON.stringify(rotas));
      info('ROTAS: ' + JSON.stringify(rotas));
      tlog('__MODO_TERMINADO__ q');
      await esperar(1000);
      app.exit(0);
      return;
    }
  } catch (e) {
    tlog('EXCEPCION EN EL ARNES: ' + ((e && e.stack) || String(e)));
    app.exit(4);
  }
});
