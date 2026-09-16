const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('passwordPromptAPI', {
  onInit: (cb) => ipcRenderer.on('password-prompt:init', (evt, data) => cb(data)),
  submit: (password) => ipcRenderer.invoke('password-prompt:submit', password),
  cancel: () => ipcRenderer.invoke('password-prompt:cancel'),
});

// v2.0.16 — controles de ventana propios (solo cerrar, igual que Seguridad
// — esta ventana tampoco se podía minimizar/maximizar con marco nativo).
contextBridge.exposeInMainWorld('winControls', {
  close: () => ipcRenderer.invoke('win:close'),
});
