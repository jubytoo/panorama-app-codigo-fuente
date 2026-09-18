'use strict';
// Sonda de solo lectura: NO llama a app.setPath() en absoluto. Solo imprime
// que resuelve Electron por defecto para appData/userData con las variables
// de entorno que tenga el proceso -- para saber si el override de APPDATA/
// LOCALAPPDATA via variable de entorno (la misma tecnica usada en el resto
// de arneses de esta auditoria) cambia de verdad la ruta por DEFECTO que usa
// app.requestSingleInstanceLock(), o si Electron la resuelve por otro medio
// (API de Windows) que ignora la variable de entorno.
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const arg = process.argv.find((a) => a.startsWith('--out='));
const out = arg ? arg.slice('--out='.length) : path.join(require('os').tmpdir(), 'sonda-userdata-defecto.json');
app.whenReady().then(() => {
  const resultado = {
    appData: app.getPath('appData'),
    userData: app.getPath('userData'),
    envAPPDATA: process.env.APPDATA,
    envLOCALAPPDATA: process.env.LOCALAPPDATA,
    nombreApp: app.getName(),
  };
  try { fs.writeFileSync(out, JSON.stringify(resultado, null, 2)); } catch (e) {}
  app.exit(0);
});
