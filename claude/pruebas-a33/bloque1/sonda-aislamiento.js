'use strict';
// ---------------------------------------------------------------------------
// ARN-2 / barrera ARN-3 — sonda de aislamiento previa a cualquier arranque
// real en bloque1. A propósito NO carga main.js ni db.js del producto: solo
// hace exactamente el mismo app.setPath() que real-run/main.js hace ANTES de
// requerir el producto, y comprueba desde dentro del propio proceso que
// app.getPath('appData') y app.getPath('userData') caen DENTRO del sandbox
// recibido por --sandbox=. Si no puede demostrarlo, sale con código != 0 y
// NADA que dependa de este resultado debe arrancar Electron con el producto.
// ---------------------------------------------------------------------------
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const arg = process.argv.find((a) => a.startsWith('--sandbox='));
if (!arg) { console.error('falta --sandbox='); process.exit(2); }
const SB = arg.slice('--sandbox='.length);

app.setPath('appData', path.join(SB, 'Roaming'));
app.setPath('userData', path.join(SB, 'Roaming', 'panorama-app'));

app.whenReady().then(() => {
  const norm = (p) => path.resolve(p).toLowerCase();
  const sbN = norm(SB) + path.sep;
  const dentro = (p) => norm(p).startsWith(sbN);
  const apD = app.getPath('appData');
  const usD = app.getPath('userData');
  const resultado = {
    sandbox: SB,
    appData: apD, appDataDentro: dentro(apD),
    userData: usD, userDataDentro: dentro(usD),
  };
  console.log('SONDA-AISLAMIENTO ' + JSON.stringify(resultado));
  try { fs.writeFileSync(path.join(SB, 'sonda-aislamiento.json'), JSON.stringify(resultado, null, 2)); } catch (e) {}
  app.exit(resultado.appDataDentro && resultado.userDataDentro ? 0 : 1);
});
