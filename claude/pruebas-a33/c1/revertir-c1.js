'use strict';
// ---------------------------------------------------------------------------
// Reversiones de C1-A. Cada una deshace UNA pieza y escribe una copia en
// `revertidos/`; producción no se toca.
//
//   U-sin-llamada      main.js   el arranque ya no llama al inventario
//   U2-sin-log         main.js   el inventario corre pero no deja la línea
//   X-sello-estricto   main.js   el sello no reconoce el nombre ANTIGUO de backup (defecto hallado en vivo)
//   V1-cv-del-eval     html      "Eliminar evaluación" retira el CV ANTES de saber si se guardó
//   V2-cv-importar     html      "Importar" retira los CV ANTES de saber si se guardó
//   W1-mensaje-rekey   main.js   vuelve "al arrancar se resuelve sola" (carpeta del rekey)
//   W2-mensaje-restaur main.js   vuelve "para que se resuelva sola" (material de restauración)
//
// No hay reversión de limpieza histórica: C1-B no se implementa.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const MAIN = fs.readFileSync(process.env.PANORAMA_MAIN_ORIG || path.join(PROJ, 'main.js'), 'utf8');
const EVAL = fs.readFileSync(process.env.PANORAMA_EVAL_ORIG ||
  path.join(PROJ, 'evaluacion-candidatos', 'plantilla_evaluacion_candidatos.html'), 'utf8');

function unica(src, trozo) {
  const n = src.split(trozo).length - 1;
  if (n !== 1) throw new Error(`ancla con ${n} apariciones: ${trozo.slice(0, 70)}`);
}
function sustituir(src, viejo, nuevo) { unica(src, viejo); return src.replace(viejo, () => nuevo); }
function reemplazarEntre(src, desde, hasta, nuevo) {
  unica(src, desde); unica(src, hasta);
  const i = src.indexOf(desde);
  const j = src.indexOf(hasta, i);
  if (j < i) throw new Error('anclas en orden inverso');
  return src.slice(0, i) + nuevo + src.slice(j);
}

const REVERSIONES = [
  {
    id: 'U-sin-llamada', ext: '.js', base: MAIN, env: 'PANORAMA_MAIN',
    desc: 'el arranque deja de llamar al inventario de residuos',
    aplicar: (s) => sustituir(s, '  registrarInventarioDeResiduos();\n  createLauncherWindow();', '  createLauncherWindow();'),
  },
  {
    id: 'U2-sin-log', ext: '.js', base: MAIN, env: 'PANORAMA_MAIN',
    desc: 'el inventario se ejecuta pero no deja su línea en app.log',
    aplicar: (s) => sustituir(s, "  appLog(\n    'Residuos — inventario del arranque", "  void (\n    'Residuos — inventario del arranque"),
  },
  {
    // Defecto hallado al medir en producción (solo lectura): con el sello
    // estricto, los 117 huérfanos reales —nombre antiguo, sin sufijo— caían
    // todos en `sinPosicion`.
    id: 'X-sello-estricto', ext: '.js', base: MAIN, env: 'PANORAMA_MAIN',
    desc: 'el sello solo reconoce el nombre actual (con sufijo): los huérfanos antiguos quedan sin posición',
    aplicar: (s) => sustituir(s, '(\\d{3})Z[._]/i.exec(n);', '(\\d{3})Z_/i.exec(n);'),
  },
  {
    id: 'V1-cv-del-eval', ext: '.html', base: EVAL, env: 'PANORAMA_EVAL',
    desc: '"Eliminar evaluación" retira el CV antes de conocer el resultado del guardado',
    aplicar: (s) => sustituir(s,
      '      renderEvaluaciones(); renderResultados();\n      const g = await saveState(true);',
      '      renderEvaluaciones(); renderResultados();\n' +
      '      if (cv) window.panoramaBridge.removeCandidateCv(cv).catch(() => {});\n' +
      '      const g = await saveState(true);'),
  },
  {
    id: 'V2-cv-importar', ext: '.html', base: EVAL, env: 'PANORAMA_EVAL',
    desc: '"Importar" retira los CV antes de conocer el resultado del guardado',
    aplicar: (s) => sustituir(s,
      '        renderAll();\n        const g = await saveState(true);',
      '        renderAll();\n' +
      '        for (const cv of cvPrevios) { if (!cvReferenciado(cv)) window.panoramaBridge.removeCandidateCv(cv).catch(() => {}); }\n' +
      '        const g = await saveState(true);'),
  },
  {
    id: 'W1-mensaje-rekey', ext: '.js', base: MAIN, env: 'PANORAMA_MAIN',
    desc: 'vuelve la promesa falsa "al arrancar se resuelve sola" (carpeta de trabajo del rekey)',
    aplicar: (s) => reemplazarEntre(s,
      "          'de datos, ciérralo antes de reintentarlo.' +\n          (conJournal",
      '          `Carpeta de trabajo:\\n${staging}` +',
      "          'de datos, ciérralo antes de reintentarlo. Si no es el caso, cierra esta app y vuelve a abrirla: al ' +\n" +
      "          'arrancar se resuelve sola.\\n\\n' +\n"),
  },
  {
    id: 'W2-mensaje-restaur', ext: '.js', base: MAIN, env: 'PANORAMA_MAIN',
    desc: 'vuelve la promesa falsa "para que se resuelva sola" (material de restauración)',
    aplicar: (s) => reemplazarEntre(s,
      '          : sinRegistro\n',
      '      };\n    }\n  }\n\n  // EXCLUSIVA DE OPERACIÓN',
      "          : 'Hay una restauración de backup sin terminar de limpiar. Cierra y vuelve a abrir Panorama del ' +\n" +
      "            'Servicio para que se resuelva sola, y cambia la contraseña después. No se ha tocado nada.' +\n" +
      "            errorCodeSuffix('PS-2006'),\n"),
  },
];

const dirOut = path.join(__dirname, 'revertidos');
fs.rmSync(dirOut, { recursive: true, force: true });
fs.mkdirSync(dirOut, { recursive: true });

console.log('REVERSIONES DE C1-A');
let malos = 0;
for (const r of REVERSIONES) {
  let out;
  try { out = r.aplicar(r.base); } catch (e) { malos++; console.log(`  [NO SE PUDO] ${r.id}: ${e.message}`); continue; }
  if (out === r.base) { malos++; console.log(`  [NO SE PUDO] ${r.id}: la sustitución no cambió nada`); continue; }
  const destino = path.join(dirOut, r.id + r.ext);
  fs.writeFileSync(destino, out, 'utf8');
  console.log(`  [LISTA] ${r.id}  (${r.env})`);
  console.log(`          ${r.desc}`);
}
process.exit(malos === 0 ? 0 : 1);
