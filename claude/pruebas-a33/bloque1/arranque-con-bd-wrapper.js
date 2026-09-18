'use strict';
// ---------------------------------------------------------------------------
// ARN-7 — envoltorio de arranque-con-bd.ps1. Mismo aislamiento que
// real-run/main.js (app.setPath ANTES de requerir el producto: appData/
// userData caen dentro del sandbox, demostrado con bloque1/sonda-aislamiento.js
// en el saneamiento de ARN-2), MÁS la respuesta explícita al diálogo nativo
// de PS-1021 (autorizarCarpetaLocal, camino SIN location.json), reutilizando
// el mismo mecanismo ya oficial de real-run/p22-reserva.js (envolver
// dialog.showMessageBoxSync y contestar por título).
//
// Por qué hace falta: desde P22, un main.js sin location.json que encuentra
// una BD local ya NO la adopta en silencio — exige la confirmación PS-1021.
// arranque-con-bd.ps1 usa --modo=nada de real-run/main.js, que no contesta
// ningún diálogo, así que la BD legada quedaba sin migrar y ver-conbd.js
// fallaba al leer una migración que nunca ocurrió. Esto NO es un defecto de
// producto: es el arnés que necesita ponerse al día con el contrato de P22.
//
// La autorización SOLO ocurre aquí, dentro de este proceso aislado, sobre la
// BD sembrada por semilla-legada.js en el sandbox — nunca contra datos reales.
// ---------------------------------------------------------------------------
const { app, dialog } = require('electron');
const path = require('path');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';

const arg = process.argv.find((a) => a.startsWith('--sandbox='));
if (!arg) { console.error('falta --sandbox='); process.exit(2); }
const SB = arg.slice('--sandbox='.length);
if (!/_a33-bloque1-conbd/i.test(SB)) { console.error('sandbox no marcado: ' + SB); process.exit(2); }

app.setPath('appData', path.join(SB, 'Roaming'));
app.setPath('userData', path.join(SB, 'Roaming', 'panorama-app'));

// PS-1021 (autorizarCarpetaLocal): los dos títulos posibles según
// estadoBaseDeDatosLocal (existente / ausente). Cualquier otro diálogo nativo
// se deja pasar tal cual (no se intercepta).
const DE_PS1021 = /Hay datos locales en este equipo|No hay ninguna carpeta de datos configurada/i;
const original = dialog.showMessageBoxSync;
dialog.showMessageBoxSync = function (a, b) {
  const o = (b || a) || {};
  if (DE_PS1021.test(String(o.title))) {
    const i = (o.buttons || []).findIndex((t) => /Usar estos datos locales|Usar los datos locales de este equipo/.test(t));
    if (i >= 0) return i;
  }
  return original.call(this, a, b);
};

require(path.join(PROJ, 'main.js'));
