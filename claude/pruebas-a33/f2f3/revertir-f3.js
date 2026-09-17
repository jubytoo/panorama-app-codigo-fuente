'use strict';
// ---------------------------------------------------------------------------
// F3 — REVERSIÓN: quitar las guardas.
//
// Deja `aplicarPoliticaDeNavegacion` como una función VACÍA. Con eso vuelve el
// comportamiento de antes de F3, y la batería tiene que volver a demostrar:
//   · `about:blank` crea una BrowserWindow (la «ventana negra»);
//   · `file://` crea una BrowserWindow;
//   · un `<a target="_blank">` abre DENTRO de Electron en vez de en el
//     navegador del sistema.
//
// Escribe la copia en `f2f3/revertidos/`. NO toca producción.
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

const CUERPO = extraerDe(MAIN, 'function aplicarPoliticaDeNavegacion(wc, etiqueta)');
// Se conserva la firma y las llamadas (siguen ahí, en las 10 ventanas): lo que
// desaparece es la política. Así la reversión aísla EXACTAMENTE el defecto.
const VACIO = `function aplicarPoliticaDeNavegacion(wc, etiqueta) {
  // REVERSIÓN F3: sin política. Las ventanas vuelven a abrirse solas.
  return;
}`;
const revertido = MAIN.replace(CUERPO, () => VACIO);
if (revertido === MAIN) throw new Error('la reversión no ha cambiado nada');

const destino = path.join(SALIDA, 'A-sin-politica');
fs.mkdirSync(destino, { recursive: true });
fs.writeFileSync(path.join(destino, 'main.js'), revertido, 'utf8');
console.log('  A-sin-politica -> ' + path.join('revertidos', 'A-sin-politica', 'main.js'));
console.log('\n  1 reversión generada. Producción NO se ha tocado.');
