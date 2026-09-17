'use strict';
// ---------------------------------------------------------------------------
// P17 — REVERSIÓN.
//
// Devuelve `fixVendorScriptPaths()` a la forma anterior: nueve
// `String.replace(cadena, cadena)` encadenados. Eso reproduce LOS DOS defectos
// de la misma familia:
//   · solo se sustituye la PRIMERA coincidencia -> el segundo icon-256.png se
//     queda con la ruta relativa;
//   · el reemplazo va como CADENA -> `$&`, "$`" y la secuencia dólar-comilla
//     recuperan su semántica y corrompen el horneado.
//
// Escribe la copia en `p17/revertidos/`. NO toca producción.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const SALIDA = path.join(__dirname, 'revertidos');
fs.mkdirSync(SALIDA, { recursive: true });

const MAIN = fs.readFileSync(path.join(PROJ, 'main.js'), 'utf8');

function extraerDe(src, firma) {
  const i = src.indexOf(firma);
  if (i < 0) throw new Error('NO SE ENCONTRO: ' + firma);
  let j = src.indexOf('{', i), prof = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (prof === 0) return src.slice(i, k + 1); }
  }
  throw new Error('no delimitado: ' + firma);
}

const CUERPO = extraerDe(MAIN, 'function fixVendorScriptPaths(html)');
const desde = CUERPO.indexOf('  // P17 (17 sept 2026)');
if (desde < 0) throw new Error('no se encuentra el bloque de P17 en fixVendorScriptPaths');

// El cuerpo de ANTES de P17, tal cual estaba.
const ANTES = `  return html
    .replace('<script src="../vendor/service-status.js"></script>', \`<script src="\${vendorServiceStatus}"></script>\`)
    .replace('<script src="../vendor/xlsx.full.min.js"></script>', \`<script src="\${vendorXlsx}"></script>\`)
    .replace('<script src="../vendor/pptxgen.bundle.js"></script>', \`<script src="\${vendorPptx}"></script>\`)
    .replace('src="../assets/icon-256.png"', \`src="\${iconPath}"\`)
    .replace('<link rel="stylesheet" href="../vendor/fonts/fonts.css">', \`<link rel="stylesheet" href="\${vendorFonts}">\`)
    .replace('<script src="../vendor/theme.js"></script>', \`<script src="\${vendorTheme}"></script>\`)
    .replace('<link rel="stylesheet" href="../vendor/motion.css">', \`<link rel="stylesheet" href="\${vendorMotion}">\`)
    .replace('<script src="../vendor/modal.js"></script>', \`<script src="\${vendorModal}"></script>\`)
    .replace('<link rel="stylesheet" href="../vendor/window-chrome.css">', \`<link rel="stylesheet" href="\${vendorWindowChrome}">\`);
}`;

const CUERPO_VIEJO = CUERPO.slice(0, desde) + ANTES;
const revertido = MAIN.replace(CUERPO, () => CUERPO_VIEJO);
if (revertido === MAIN) throw new Error('la reversión no ha cambiado nada');

const destino = path.join(SALIDA, 'A-replace-cadena');
fs.mkdirSync(destino, { recursive: true });
fs.writeFileSync(path.join(destino, 'main.js'), revertido, 'utf8');
console.log('  A-replace-cadena -> ' + path.join('revertidos', 'A-replace-cadena', 'main.js'));
console.log('\n  1 reversión generada. Producción NO se ha tocado.');
