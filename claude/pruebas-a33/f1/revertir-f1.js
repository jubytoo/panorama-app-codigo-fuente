'use strict';
// ---------------------------------------------------------------------------
// F1 — REVERSIONES POR FAMILIAS.
//
// No una reversión gigante: seis, una por familia de reparación. Cada una
// deshace SOLO lo suyo y tiene que hacer que la batería rompa POR LO QUE
// ANUNCIA (lo comprueba `comprobar-reversiones-f1.js`).
//
//   A  texto del dashboard      -> vuelve a interpretarse al menos un campo
//   B  seed horneado            -> `</script>` o `$'` vuelven a romper el archivo
//   C  onclick de Preparación   -> un id especial vuelve a romper el contexto
//   D  selector de Evaluación   -> un id especial vuelve a romper el render
//   E  data-dedic del Directorio-> el atributo vuelve a romperse
//   F  logo crudo               -> vuelve a admitirse un esquema indebido
//
// Escribe copias en `f1/revertidos/`. NO toca producción.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const SALIDA = path.join(__dirname, 'revertidos');
fs.mkdirSync(SALIDA, { recursive: true });

const ORIG = {
  main: path.join(PROJ, 'main.js'),
  dash: path.join(PROJ, 'dashboard', 'plantilla_dashboard.html'),
  prep: path.join(PROJ, 'preparacion-reunion', 'plantilla_preparacion_reunion.html'),
  eval: path.join(PROJ, 'evaluacion-candidatos', 'plantilla_evaluacion_candidatos.html'),
  dire: path.join(PROJ, 'directorio', 'plantilla_directorio.html'),
};
const lee = (k) => fs.readFileSync(ORIG[k], 'utf8');

// Sustituye EXACTAMENTE n veces o aborta: una reversión que no revierte nada
// daría un falso verde en la comprobación.
function cambia(src, de, a, n) {
  const veces = src.split(de).length - 1;
  if (veces !== n) throw new Error(`esperaba ${n} ocurrencia(s) de ${JSON.stringify(de.slice(0, 70))}, hay ${veces}`);
  return src.split(de).join(a);
}

const reversiones = {
  // A — el texto del dashboard vuelve a ir crudo (los sinks que se ejecutaban
  // al abrir, sin tocar nada: título de hito, de riesgo, rol de columna).
  // Se eligen sinks que la batería EJECUTA (constructores extraídos por firma),
  // no los de render*, que solo los ve el arnés de Electron: una reversión que
  // la batería no puede notar no demuestra nada.
  'A-texto-dashboard': () => {
    let s = lee('dash');
    s = cambia(s, 'Eliminar "${escapeHtml(label)}" — no se puede deshacer.', 'Eliminar "${label}" — no se puede deshacer.', 1);
    s = cambia(s, 'Posponer el aviso de "${escapeHtml(m.label)}":', 'Posponer el aviso de "${m.label}":', 1);
    return { archivo: 'plantilla_dashboard.html', texto: s };
  },
  // B — el seed vuelve a serializarse sin escapar `<` y a insertarse como
  // cadena de reemplazo (con lo que `$&`/`$'` recuperan su semántica).
  'B-seed-inseguro': () => {
    let s = lee('main');
    s = cambia(s, "return JSON.stringify(seed).replace(/</g, '\\\\u003c');", 'return JSON.stringify(seed);', 1);
    s = cambia(s, '    () => seedTag\n', '    seedTag\n', 1);
    return { archivo: 'main.js', texto: s };
  },
  // C — Preparación vuelve a construir el onclick con el id dentro.
  'C-onclick-preparacion': () => {
    let s = lee('prep');
    s = cambia(s, 'data-seg-id="${esc(id)}" data-v="${v}">', 'data-v="${v}" onclick="setDecision(\'${id}\',\'${v}\')">', 1);
    return { archivo: 'plantilla_preparacion_reunion.html', texto: s };
  },
  // D — Evaluación vuelve a construir sus selectores con el id crudo.
  'D-selector-evaluacion': () => {
    let s = lee('eval');
    s = cambia(s, 'input[data-action="task-name"][data-task="${CSS.escape(String(t.id))}"]',
      'input[data-action="task-name"][data-task="${t.id}"]', 1);
    s = cambia(s, 'textarea[data-action="task-guide"][data-task="${CSS.escape(String(t.id))}"]',
      'textarea[data-action="task-guide"][data-task="${t.id}"]', 1);
    return { archivo: 'plantilla_evaluacion_candidatos.html', texto: s };
  },
  // E — el Directorio vuelve a meter el nombre de proyecto crudo en data-dedic.
  'E-dedic-directorio': () => {
    let s = lee('dire');
    s = cambia(s, 'data-dedic="${escapeHtml(a.proyecto)}"', 'data-dedic="${a.proyecto}"', 1);
    return { archivo: 'plantilla_directorio.html', texto: s };
  },
  // F — el logo vuelve a pintarse sin validar el esquema.
  'F-logo-crudo': () => {
    let s = lee('dash');
    s = cambia(s, 'return (typeof v === \'string\' && F1_LOGO_MIME.test(v)) ? v : null;', 'return v || null;', 1);
    return { archivo: 'plantilla_dashboard.html', texto: s };
  },
};

const cual = process.argv[2];
const lista = cual ? [cual] : Object.keys(reversiones);
for (const nombre of lista) {
  if (!reversiones[nombre]) { console.error('  reversión desconocida: ' + nombre); process.exit(2); }
  const { archivo, texto } = reversiones[nombre]();
  const dir = path.join(SALIDA, nombre);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, archivo), texto, 'utf8');
  console.log('  ' + nombre + ' -> ' + path.join('revertidos', nombre, archivo));
}
console.log('\n  ' + lista.length + ' reversión(es) generada(s). Producción NO se ha tocado.');
