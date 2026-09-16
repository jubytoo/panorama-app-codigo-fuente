const { contextBridge, ipcRenderer } = require('electron');

// A3.3/BLOQUE 5 — CONTRATO DE ACCIÓN, igual que en preload.js.
//
// Un canal de acción SIEMPRE tiene que resolver a un objeto con `aplicado`
// booleano. Si el main devuelve otra cosa, o la llamada revienta, el renderer
// tiene que poder distinguir "no se hizo" de "no se sabe" sin mirar la
// truthiness del objeto — un objeto de error también es truthy.
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

contextBridge.exposeInMainWorld('launcherAPI', {
  listProjects: () => ipcRenderer.invoke('projects:list'),
  reorderProjects: (orderedIds) => ipcRenderer.invoke('projects:reorder', orderedIds),
  createProject: (name, client, startDate, importJson) =>
    ipcRenderer.invoke('projects:create', { name, client, startDate, importJson }),
  openProject: (id) => ipcRenderer.invoke('projects:open', id),
  openDirectorio: () => ipcRenderer.invoke('directorio:open'),
  openBackupsFolder: (id) => ipcRenderer.invoke('projects:openBackupsFolder', id),
  listBackups: (id) => ipcRenderer.invoke('backup:list', id),
  // A2 bajo A3.3: restaurar es una acción archivo+partición+BD con las mismas
  // tres formas. Sin `invokeAccion` el renderer decidiría por truthiness, que
  // es lo que hacía: ponía «Backup restaurado» pasara lo que pasara.
  restoreBackup: (id, backupId) => invokeAccion('backup:restore', { projectId: id, backupId }),
  dbInfo: () => ipcRenderer.invoke('db:info'),
  deleteProject: (id) => invokeAccion('projects:delete', id),
  onNewProjectRequested: (cb) => ipcRenderer.on('menu:new-project', cb),
  onProjectsChanged: (cb) => ipcRenderer.on('projects:changed', cb),
  quitApp: () => ipcRenderer.invoke('app:quit'),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  // v0.1.77: atajo "N entrevista(s) pendiente(s)" de la tarjeta — abre
  // directamente Evaluación de Candidatos de ese proyecto en la pestaña
  // Evaluaciones. Ver candidateEval:openWindow en main.js.
  openCandidateEval: (id) => ipcRenderer.invoke('candidateEval:openWindow', { projectId: id }),
  // v2.0.14 — controles de ventana y menú propios (prueba piloto de barra de
  // título sin marco nativo, ver createLauncherWindow() en main.js).
  isSecurityEnabled: () => ipcRenderer.invoke('security:isEnabled'),
  launcherMenuAction: (action) => ipcRenderer.invoke('launcherMenu:action', action),
  // v2.0.56: agregados de cartera para la vista "Resumen de Salud de
  // Cartera" del lanzador — ver portfolio:summary en main.js.
  portfolioSummary: () => ipcRenderer.invoke('portfolio:summary'),
});

contextBridge.exposeInMainWorld('winControls', {
  minimize: () => ipcRenderer.invoke('win:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('win:toggleMaximize'),
  close: () => ipcRenderer.invoke('win:close'),
  isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
  onMaximizedChanged: (cb) => ipcRenderer.on('win:maximizedChanged', (evt, isMax) => cb(isMax)),
});

// v2.0.27 — tema visual GLOBAL de toda la app. El launcher es la única
// ventana con selector propio (panel "Tema visual" del menú Configuración,
// ver launcher/renderer.js) -- las demás solo leen y aplican. Ver
// vendor/theme.js.
contextBridge.exposeInMainWorld('themeAPI', {
  get: () => ipcRenderer.invoke('theme:get'),
  set: (themeKey) => ipcRenderer.invoke('theme:set', themeKey),
  onChanged: (cb) => ipcRenderer.on('theme:changed', (evt, themeKey) => cb(themeKey)),
});
