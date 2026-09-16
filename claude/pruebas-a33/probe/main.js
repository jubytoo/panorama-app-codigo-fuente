// Sonda: ¿respeta Electron las variables de entorno APPDATA/LOCALAPPDATA
// para app.getPath('appData') y process.env.LOCALAPPDATA? De eso depende que
// se pueda ejecutar el Panorama REAL en un entorno completamente aislado.
const { app } = require('electron');
const fs = require('fs');
const out = process.argv.find((a) => a.startsWith('--out=')).slice(6);
const datos = {
  appData: app.getPath('appData'),
  userData: app.getPath('userData'),
  envAPPDATA: process.env.APPDATA,
  envLOCALAPPDATA: process.env.LOCALAPPDATA,
  appName: app.getName(),
};
fs.writeFileSync(out, JSON.stringify(datos, null, 2), 'utf8');
app.exit(0);
