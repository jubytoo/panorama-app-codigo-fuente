'use strict';
// ---------------------------------------------------------------------------
// Reversiones de B4, sobre el main.js PRODUCTIVO. Cada una quita UNA de las
// dos defensas y escribe una copia en `revertidos/`, para relanzar la batería
// con PANORAMA_MAIN apuntando a ella. Una prueba que también pasa contra el
// código anterior no demuestra nada.
//
//   R-reorder-en-bucle : vuelve el forEach con un dbmod.run() por fila.
//                        Debe reproducir EXACTAMENTE el defecto medido en el
//                        diagnóstico: orden PARCIAL tras un fallo intermedio.
//   S-reorder-mudo     : se quita el appLog() del fallo de reordenado.
//
// NO toca producción: solo lee el main.js real y escribe copias.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const ORIG = process.env.PANORAMA_MAIN_ORIG || path.join(PROJ, 'main.js');
const SRC = fs.readFileSync(ORIG, 'utf8');

// Sustitución por ANCLAS: main.js lleva acentos y comentarios largos, y una
// coincidencia literal se rompe por un espacio. Las dos anclas tienen que
// aparecer EXACTAMENTE una vez, o la reversión se declara imposible.
function reemplazarEntre(src, desde, hasta, nuevo) {
  if (src.split(desde).length - 1 !== 1) throw new Error('ancla inicial no única: ' + desde.slice(0, 70));
  if (src.split(hasta).length - 1 !== 1) throw new Error('ancla final no única: ' + hasta.slice(0, 70));
  const i = src.indexOf(desde);
  const j = src.indexOf(hasta, i);
  if (j < i) throw new Error('las anclas están en orden inverso');
  return src.slice(0, i) + nuevo + src.slice(j);
}

const REVERSIONES = [
  {
    id: 'R-reorder-en-bucle',
    desc: 'vuelve el forEach con un commit por fila: reaparece el orden PARCIAL tras un fallo',
    espera: 'B4-R0a/R0b (la forma), B4-R1c (5 commits), B4-R3f..R3i (el ORDEN PARCIAL, ' +
      'que es el defecto medido) y B4-R6a..R6d (se va la validación)',
    aplicar: (s) => reemplazarEntre(s,
      "ipcMain.handle('projects:reorder', (evt, orderedIds) => {",
      "// ---------- IPC: Directorio de Talento ----------",
      "ipcMain.handle('projects:reorder', (evt, orderedIds) => {\n" +
      "  if (procesoComprometido) return { ok: false, error: 'La aplicación está cerrándose por un fallo interno.' };\n" +
      "  if (!Array.isArray(orderedIds)) return { ok: false, error: 'Lista de orden inválida.' };\n" +
      '  orderedIds.forEach((id, idx) => {\n' +
      "    dbmod.run('UPDATE projects SET sort_order=? WHERE id=?', [idx, Number(id)]);\n" +
      '  });\n' +
      '  return { ok: true };\n' +
      '});\n\n'),
  },
  {
    id: 'S-reorder-mudo',
    desc: 'el fallo de reordenado vuelve a no dejar ninguna línea en app.log',
    espera: 'B4-R0d, B4-R2f, B4-R2g, B4-R2h, B4-R3e, B4-O6',
    aplicar: (s) => reemplazarEntre(s,
      '    appLog(`Reordenado de proyectos',
      '    // Se PROPAGA, no se devuelve `{ok:false}`',
      '    '),
  },
];

const dirOut = path.join(__dirname, 'revertidos');
fs.rmSync(dirOut, { recursive: true, force: true });
fs.mkdirSync(dirOut, { recursive: true });

console.log('REVERSIONES DE B4');
console.log('  origen: ' + ORIG);
let malos = 0;
for (const r of REVERSIONES) {
  let out;
  try { out = r.aplicar(SRC); } catch (e) {
    malos++; console.log(`  [NO SE PUDO] ${r.id}: ${e.message}`); continue;
  }
  if (out === SRC) { malos++; console.log(`  [NO SE PUDO] ${r.id}: la sustitución no cambió nada`); continue; }
  const destino = path.join(dirOut, r.id + '.js');
  fs.writeFileSync(destino, out, 'utf8');
  console.log(`  [LISTA] ${r.id}`);
  console.log(`          ${r.desc}`);
  console.log(`          debería romper: ${r.espera}`);
  console.log(`          lanzar con: $env:PANORAMA_MAIN="${destino}"`);
}
process.exit(malos === 0 ? 0 : 1);
