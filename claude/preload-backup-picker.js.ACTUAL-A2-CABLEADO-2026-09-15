// Preload de la ventana "Restaurar un backup concreto..." (v0.1.50).
// Superficie mínima: reutiliza tal cual los IPC 'backup:list'/'backup:restore'
// que ya existía usaba el lanzador (con backupId fijo a null, "el último") —
// aquí simplemente se deja elegir cuál. No hay ningún IPC nuevo por detrás.
const { contextBridge, ipcRenderer } = require('electron');

function getArgValue(flag) {
  const arg = process.argv.find((a) => a.startsWith(flag + '='));
  return arg ? arg.slice(flag.length + 1) : null;
}

const projectId = Number(getArgValue('--panorama-project-id'));
const rawName = getArgValue('--panorama-project-name') || '';

// A2 bajo A3.3 — CONTRATO DE ACCIÓN, igual que en preload.js y
// preload-launcher.js. Un canal de acción SIEMPRE resuelve a un objeto con
// `aplicado` booleano; si el main devuelve otra cosa, o la llamada revienta, el
// renderer tiene que poder distinguir "no se hizo" de "no se sabe" sin mirar la
// truthiness — un objeto de error también es truthy.
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

contextBridge.exposeInMainWorld('backupPickerAPI', {
  projectId,
  projectName: decodeURIComponent(rawName),
  listBackups: () => ipcRenderer.invoke('backup:list', projectId),
  restoreBackup: (backupId) => invokeAccion('backup:restore', { projectId, backupId }),
});

// v2.0.16 — controles de ventana propios, ver createLauncherWindow() en main.js.
contextBridge.exposeInMainWorld('winControls', {
  minimize: () => ipcRenderer.invoke('win:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('win:toggleMaximize'),
  close: () => ipcRenderer.invoke('win:close'),
  isMaximized: () => ipcRenderer.invoke('win:isMaximized'),
  onMaximizedChanged: (cb) => ipcRenderer.on('win:maximizedChanged', (evt, isMax) => cb(isMax)),
});

// v2.0.27 — tema visual GLOBAL de toda la app, ver vendor/theme.js.
contextBridge.exposeInMainWorld('themeAPI', {
  get: () => ipcRenderer.invoke('theme:get'),
  set: (themeKey) => ipcRenderer.invoke('theme:set', themeKey),
  onChanged: (cb) => ipcRenderer.on('theme:changed', (evt, themeKey) => cb(themeKey)),
});
