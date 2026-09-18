'use strict';
// Sonda de mecanismo puro: NO carga main.js del producto, NO toca Drive ni
// la BD real. Demuestra a que identidad se ancla app.requestSingleInstanceLock()
// en este Electron (30.5.1), variando explicitamente userData ANTES de pedir
// el cerrojo -- para separar "el mecanismo en general" (dominio = userData)
// de "el orden real de main.js" (pide el cerrojo con el userData POR DEFECTO,
// sin haber llamado a setPath todavia -- ver main.js:36-48).
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const arg = (n) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : null; };
const datadir = arg('datadir');   // si se da, se llama a app.setPath ANTES del cerrojo
const out = arg('out');
const holdMs = parseInt(arg('hold') || '0', 10);

if (datadir) {
  fs.mkdirSync(datadir, { recursive: true });
  app.setPath('userData', datadir);
}

const gotLock = app.requestSingleInstanceLock();
const resultado = { pid: process.pid, datadir: datadir || '(por defecto, sin setPath)', userData: app.getPath('userData'), gotLock };
try { fs.writeFileSync(out, JSON.stringify(resultado, null, 2)); } catch (e) {}

if (!gotLock) {
  // Mismo patron que main.js:60-61: sale en el acto.
  app.exit(0);
} else {
  app.on('second-instance', () => {
    try {
      const marcaSegunda = out.replace('.json', '.second-instance-recibido.txt');
      fs.writeFileSync(marcaSegunda, new Date().toISOString());
    } catch (e) {}
  });
  app.whenReady().then(() => {
    setTimeout(() => app.exit(0), holdMs);
  });
}
