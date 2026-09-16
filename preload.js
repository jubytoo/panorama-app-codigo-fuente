const { contextBridge, ipcRenderer } = require('electron');

function getArgValue(flag) {
  const arg = process.argv.find((a) => a.startsWith(flag + '='));
  return arg ? arg.slice(flag.length + 1) : null;
}

const projectId = Number(getArgValue('--panorama-project-id'));
const rawName = getArgValue('--panorama-project-name') || '';
// v0.1.77: solo la usa evaluacion-candidatos/plantilla_evaluacion_candidatos.html
// — qué pestaña abrir al arrancar ('evaluaciones' cuando se llega desde el
// atajo de "N entrevista(s) pendiente(s)" del launcher; null/ausente en el
// acceso normal por menú, que sigue arrancando en "Puestos" como siempre).
const initialTab = getArgValue('--panorama-initial-tab');

let backupNowCallback = null;
let showPartesMensualesCallback = null;
let driveOutageCallback = null;
let flushBeforeCloseCallback = null;
let focusEvaluacionesCallback = null;

// ------------------------------------------------------------------
// A3.3/Bloque 4 — CONTRATO DE ACCIÓN (archivo + base de datos).
//
// Las CUATRO acciones que guardan contenido del usuario (backup, preparación
// de reunión — guardar y editar — y evaluación de candidatos) devuelven
// siempre un objeto con una de estas tres formas:
//
//   NO aplicado        { ok:false, aplicado:false, reintentable, error }
//   aplicado y ok      { ok:true,  aplicado:true,  verificado:true, … }
//   aplicado pero sin  { ok:true,  aplicado:true,  verificado:false,
//   poder verificar      requiereReinicio:true, aviso }
//
// La normalización se hace AQUÍ, en el borde, para que quien llama nunca tenga
// que distinguir entre "devolvió algo raro" y "la promesa se rechazó": las dos
// cosas llegan como un "no aplicado" explícito. Sin esto, una promesa
// rechazada podía acabar interpretándose como éxito — que es el bug de
// `lastSerialized` de la v0.1.62 entrando por otra puerta.
//
// SOLO para esas cuatro. El resto de IPC (listar, leer, borrar) tiene otro
// contrato y no pasa por aquí.
function normalizarContratoAccion(r) {
  if (r && typeof r === 'object' && typeof r.aplicado === 'boolean') return r;
  return {
    ok: false, aplicado: false, reintentable: true,
    error: 'respuesta inesperada del proceso principal: ' + JSON.stringify(r),
  };
}
function errorComoNoAplicado(e) {
  return { ok: false, aplicado: false, reintentable: true, error: String((e && e.message) || e) };
}
function invokeAccion(canal, payload) {
  return ipcRenderer.invoke(canal, payload).then(normalizarContratoAccion, errorComoNoAplicado);
}

contextBridge.exposeInMainWorld('panoramaBridge', {
  projectId,
  projectName: decodeURIComponent(rawName),
  initialTab,
  saveBackup: (payloadJsonString, reason) =>
    invokeAccion('backup:save', { projectId, payload: payloadJsonString, reason }),
  // v0.1.40: true si este proyecto tiene al menos un backup guardado en la
  // base de datos (clave estable por project_id, ajena a cualquier fallo de
  // regeneración de plantilla). Lo usa resolveProjectIdentity() para avisar
  // de forma visible si no se encuentran datos donde debería haberlos, en
  // vez de mostrar un panel vacío en silencio.
  hasAnyBackup: () => ipcRenderer.invoke('backup:hasAny', projectId),
  // v0.1.41: deja constancia en el registro general (app.log, ver
  // Configuración → "Ver registro de la aplicación") de que este proyecto
  // disparó el aviso de datos no encontrados (código PS-2001) — el propio
  // aviso ya se ve en pantalla, esto es solo para que quede rastro si el
  // usuario cierra la app sin haberlo contado.
  logDataWarning: () => ipcRenderer.invoke('diag:logDataWarning', projectId),
  // v0.1.62: hallazgo real reportado por el usuario — un backup "creado" en
  // apariencia (nueva marca de tiempo) que en realidad no llevaba el último
  // cambio hecho justo antes de guardar. Sin poder abrir el backup cifrado
  // para comparar a mano, se deja constancia en app.log de CADA intento de
  // backup (se guardara de verdad o se salte) con un resumen ligero del
  // contenido (cuantos hitos/riesgos tiene EN ESE MOMENTO, nunca el
  // contenido real) — para poder ver la secuencia exacta la próxima vez que
  // se reproduzca, en vez de tener que deducirla.
  logBackupDiag: (info) => ipcRenderer.invoke('diag:logBackupAttempt', { projectId, ...info }),
  onRequestBackupNow: (cb) => {
    backupNowCallback = cb;
  },
  // Solo lo usa la ventana del Directorio de Talento (ver
  // directorio/plantilla_directorio.html) — el menú nativo "Partes
  // mensuales" (entre "Proyecto" y "Seguridad", ver buildProjectMenu en
  // main.js, solo aparece para esta ventana) manda este IPC para cambiar
  // de vista DENTRO de la misma ventana. Inofensivo para el resto de
  // ventanas de proyecto: nunca reciben ese IPC porque su menú no tiene
  // esa entrada.
  onShowPartesMensuales: (cb) => {
    showPartesMensualesCallback = cb;
  },
  quitApp: () => ipcRenderer.invoke('app:quit'),
  closeWindow: () => ipcRenderer.invoke('project-window:close'),
  // Solo lo usa la ventana del Directorio de Talento (ver
  // directorio/plantilla_directorio.html) — inofensivo para el resto de
  // ventanas de proyecto, que nunca lo llaman.
  syncTeamProfiles: () => ipcRenderer.invoke('directorio:syncProfiles'),
  // Solo lo usa la ventana de "Preparación de Reunión" (ver
  // preparacion-reunion/plantilla_preparacion_reunion.html) — lee el backup
  // más reciente de ESTE proyecto (el mismo projectId de arriba) sin que el
  // usuario tenga que exportar/subir un JSON a mano.
  getMeetingPrepData: () => ipcRenderer.invoke('meeting:getProjectData', { projectId }),
  // Historial de "Preparación de Reunión": guardar una preparación completa,
  // listar las guardadas de este proyecto, y leer una en concreto. Ver
  // main.js (meeting:savePrep / meeting:listPreps / meeting:getPrep).
  saveMeetingPrep: (meetingDate, finalidad, payloadJsonString) =>
    invokeAccion('meeting:savePrep', { projectId, meetingDate, finalidad, payload: payloadJsonString }),
  listMeetingPreps: () => ipcRenderer.invoke('meeting:listPreps', { projectId }),
  getMeetingPrep: (id) => ipcRenderer.invoke('meeting:getPrep', { projectId, id }),
  // A3.3/BLOQUE 5 (D2): también es una acción archivo+BD, con las mismas tres
  // formas. Sin `invokeAccion` el renderer decidiría por `result.ok`, y la
  // forma 3 (`ok:true` + `verificado:false`) pasaría por éxito normal.
  deleteMeetingPrep: (id) => invokeAccion('meeting:deletePrep', { projectId, id }),
  // Actualiza en sitio una preparación ya guardada (ver meeting:updatePrep en
  // main.js) — usado por "✏️ Editar" en el historial para completar el
  // checklist de Cierre tras la reunión real sin duplicar el registro.
  updateMeetingPrep: (id, meetingDate, finalidad, payloadJsonString) =>
    invokeAccion('meeting:updatePrep', { projectId, id, meetingDate, finalidad, payload: payloadJsonString }),
  // v0.1.73: "Evaluación de Candidatos" — un documento único por proyecto
  // (puestos + entrevistas), leído/guardado vía IPC igual que Preparación
  // de Reunión. Ver candidateEval:get/save en main.js.
  getCandidateEvalData: () => ipcRenderer.invoke('candidateEval:get', { projectId }),
  saveCandidateEvalData: (payloadJsonString) => invokeAccion('candidateEval:save', { projectId, payload: payloadJsonString }),
  // v0.1.75: adjuntar/ver/quitar el CV de una evaluación. El archivo vive en
  // disco (carpeta cv/ junto al estado.json de este proyecto), NUNCA
  // cifrado aunque la Seguridad de la app esté activa — ver el comentario
  // junto a candidateEvalCvDirForProject() en main.js.
  pickCandidateCv: (evalId) => ipcRenderer.invoke('candidateEval:pickCv', { projectId, evalId }),
  openCandidateCv: (storedName) => ipcRenderer.invoke('candidateEval:openCv', { projectId, storedName }),
  removeCandidateCv: (storedName) => ipcRenderer.invoke('candidateEval:removeCv', { projectId, storedName }),
  // v0.1.42: aviso de main.js si se pierde el acceso a la carpeta de datos
  // personalizada A MEDIA SESIÓN (no solo al arrancar — ver
  // startUserDataWatchdog en main.js). payload.active indica si el corte
  // sigue activo o si ya se recuperó.
  onDriveOutage: (cb) => {
    driveOutageCallback = cb;
  },
  // v0.1.43: main.js retiene el cierre de esta ventana (preventDefault en su
  // 'close') hasta que se ejecute este callback y se confirme por IPC — así
  // el guardado final de verdad termina (o se agota su margen de tiempo)
  // ANTES de que la ventana llegue a cerrarse, en vez de fiarlo todo a un
  // 'beforeunload' que dispara una promesa sin que nadie la espere. Ver
  // attachFlushOnClose() en main.js para el detalle completo del bug que
  // motivó esto.
  onFlushBeforeClose: (cb) => {
    flushBeforeCloseCallback = cb;
  },
  // v0.1.77: solo la usa evaluacion-candidatos/plantilla_evaluacion_candidatos.html
  // — la ventana ya estaba abierta cuando se pidió el atajo de "N
  // entrevista(s) pendiente(s)" del launcher, así que main.js le manda esto
  // para cambiar a la pestaña Evaluaciones en caliente (ver
  // openCandidateEvalWindow en main.js).
  onFocusEvaluaciones: (cb) => {
    focusEvaluacionesCallback = cb;
  },
  // v2.0.16 — solo la usan dashboard/plantilla_dashboard.html y
  // directorio/plantilla_directorio.html (las únicas de las 3 ventanas que
  // comparten este preload con menú propio) — despacha Archivo/Proyecto/
  // Seguridad a projectMenu:action en main.js, con el projectId ya
  // resuelto aquí. Inofensivo para preparación de reunión/evaluación de
  // candidatos: esas plantillas no tienen fila de menú, así que nunca la
  // llaman.
  projectMenuAction: (action) => ipcRenderer.invoke('projectMenu:action', { projectId, action }),
  isSecurityEnabled: () => ipcRenderer.invoke('security:isEnabled'),
});

// v2.0.16 — controles de ventana propios, compartidos por las 3 ventanas
// que usan este preload (proyecto/Directorio, Preparación de Reunión,
// Evaluación de Candidatos) — ver la nota junto a `frame: false` en
// createLauncherWindow(). Mismos IPC genéricos que ya usa el lanzador
// (BrowserWindow.fromWebContents identifica la ventana que llama sola).
contextBridge.exposeInMainWorld('winControls', {
  minimize: () => ipcRenderer.invoke('win:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('win:toggleMaximize'),
  close: () => ipcRenderer.invoke('win:close'),
  isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
  onMaximizedChanged: (cb) => ipcRenderer.on('win:maximizedChanged', (evt, isMax) => cb(isMax)),
});

// v2.0.27 — tema visual GLOBAL de toda la app (antes cada proyecto tenía su
// propio state.theme). Compartido tal cual por las 4 ventanas que usan este
// preload (Dashboard, Directorio de Talento, Preparación de Reunión,
// Evaluación de Candidatos). Ver vendor/theme.js para THEMES/applyTheme y
// getGlobalTheme/setGlobalTheme en main.js para el guardado real.
contextBridge.exposeInMainWorld('themeAPI', {
  get: () => ipcRenderer.invoke('theme:get'),
  set: (themeKey) => ipcRenderer.invoke('theme:set', themeKey),
  onChanged: (cb) => ipcRenderer.on('theme:changed', (evt, themeKey) => cb(themeKey)),
});

ipcRenderer.on('panorama:request-backup-now', () => {
  if (backupNowCallback) backupNowCallback();
});

ipcRenderer.on('panorama:show-partes-mensuales', () => {
  if (showPartesMensualesCallback) showPartesMensualesCallback();
});

ipcRenderer.on('candidateEval:focusEvaluaciones', () => {
  if (focusEvaluacionesCallback) focusEvaluacionesCallback();
});

ipcRenderer.on('diag:driveOutage', (evt, payload) => {
  if (driveOutageCallback) driveOutageCallback(payload || {});
});

ipcRenderer.on('app:flushBeforeClose', async (evt, ackChannel) => {
  try {
    if (flushBeforeCloseCallback) await flushBeforeCloseCallback();
  } catch (e) {
    /* no bloquear el cierre por un fallo aquí — mejor cerrar igual que dejar la ventana colgada */
  }
  ipcRenderer.send(ackChannel);
});
