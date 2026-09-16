// Preload de la ventana modal de Seguridad (login / activar / cambiar /
// desactivar). Superficie mínima a propósito: la ventana solo necesita
// recibir en qué modo abrir y poder enviar los datos tecleados de vuelta al
// proceso principal — toda la lógica de verdad (comprobar contraseña,
// derivar claves, volver a cifrar backups) vive en main.js.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('securityWinAPI', {
  onInit: (cb) => ipcRenderer.on('security-win:init', (e, data) => cb(data)),
  submit: (data) => ipcRenderer.invoke('security-win:submit', data),
  cancel: () => ipcRenderer.invoke('security-win:cancel'),
});

// v2.0.16 — controles de ventana propios, ver createLauncherWindow() en
// main.js. Esta ventana no se puede minimizar/maximizar (tampoco podía con
// marco nativo), así que la barra propia solo usa `close` (equivalente a
// `cancel()` de arriba — mismo resultado, cierra y resuelve la promesa
// pendiente a `false`).
contextBridge.exposeInMainWorld('winControls', {
  close: () => ipcRenderer.invoke('win:close'),
});

// v2.0.27 — tema visual GLOBAL de toda la app, ver vendor/theme.js.
contextBridge.exposeInMainWorld('themeAPI', {
  get: () => ipcRenderer.invoke('theme:get'),
  set: (themeKey) => ipcRenderer.invoke('theme:set', themeKey),
  onChanged: (cb) => ipcRenderer.on('theme:changed', (evt, themeKey) => cb(themeKey)),
});
