'use strict';
// ---------------------------------------------------------------------------
// P28 — REVERSIONES. Cada familia deshace UNA decisión del confinamiento de rutas
// de particiones y anuncia qué grupos de comprobar-p28.js tiene que tumbar (y solo
// esos). Escribe las copias como `.p28-revertido-<id>.js` en la RAÍZ del proyecto
// (solo ahí resuelven `require('./db')`) y comprobar-reversiones-p28.js las borra
// siempre al terminar. NO toca producción.
//
// Hay CAPAS a propósito (lector de journals, escritor, helper de ruta, rama genérica
// de vaciarParticionDe): quitar una sola deja la otra protegiendo el E2E, así que las
// reversiones «de capa» las ve la unidad y la que las quita TODAS (R1) devuelve el
// defecto medido (carpeta hermana destruida).
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const MAIN = fs.readFileSync(path.join(PROJ, 'main.js'), 'utf8');
function rutaRevertida(id) { return path.join(PROJ, `.p28-revertido-${id}.js`); }

function reemplazarLinea(src, huella, nueva) {
  const lineas = src.split('\n');
  const idx = lineas.map((l, i) => (l.includes(huella) ? i : -1)).filter((i) => i >= 0);
  if (idx.length !== 1) throw new Error(`se esperaba UNA línea con «${huella.slice(0, 70)}» y hay ${idx.length}`);
  lineas[idx[0]] = nueva;
  return lineas.join('\n');
}
function reemplazarBloque(src, desde, hasta, nuevo) {
  const a = src.indexOf(desde);
  if (a < 0 || src.indexOf(desde, a + 1) >= 0) throw new Error(`la huella de inicio no es única: ${desde.slice(0, 70)}`);
  const b = src.indexOf(hasta, a);
  if (b < 0) throw new Error(`no se encuentra el final del bloque: ${hasta.slice(0, 70)}`);
  return src.slice(0, a) + nuevo + src.slice(b + hasta.length);
}

// El helper sin nombre ni confinamiento: vuelve a ser `path.join(sessionData, 'Partitions', nombre)`.
const sinValidarHelper = (src, marca) => {
  let s = reemplazarLinea(src, 'if (!PARTICION_PROYECTO_PERSISTENTE_RE.test(particion)) return no(', `    // ${marca}: sin contrato de nombre`);
  s = reemplazarLinea(s, "if (nombre === '' || nombre === '.'", `    // ${marca}: sin comprobar puntos ni separadores`);
  s = reemplazarLinea(s, 'if (!esHijoDirectoDe(base, ruta)) return no(', `    // ${marca}: sin comprobar el confinamiento`);
  return s;
};

const FAMILIAS = [
  {
    id: 'R1-sin-validacion-de-traversal',
    que: 'se quitan TODAS las capas (contrato en lector y escritor, helper sin nombre ni confinamiento, y la rama genérica) — vuelve el defecto medido: el CASO B borra carpetas hermanas y particiones vivas',
    // EH3/EH4 son el defecto medido: las carpetas víctima (hermanas, prefijo, particiones vivas) cambian y se hace rmSync sobre ellas.
    // EB2/EB3: `projects:delete` con una fila hostil escribe journal y le pide a Electron una sesión fuera de contrato.
    // EH6: sin contrato TODOS los journals «se resuelven» (nada queda pendiente) y el arranque ya no se cierra.
    // EU3-EU6: `persist:..` hace `rmSync` de `userData` entera — se lleva `backups/` y `.panorama-borrados` antes de chocar con un archivo bloqueado.
    tumba: [/^P28-ST10 /, /^P28-C(1c|2|3|4|5b|6|7|8) /, /^P28-H(2|3|4|5|6|7|11) /, /^P28-J(2|4|6|7) /, /^P28-V(3|4|9) /, /^P28-EH(3|4|5|6|7|9) /, /^P28-EU[3-6] /, /^P28-EB(2|3|6) /],
    hacer: () => {
      let s = reemplazarLinea(MAIN, "if (typeof particion !== 'string' || !particion) return 'la partición no es una cadena no vacía';", '  return null; // REVERSIÓN R1: sin contrato de nombre');
      s = sinValidarHelper(s, 'REVERSIÓN R1');
      s = reemplazarLinea(s, 'if (!PARTICION_NOMBRE_SEGURO_RE.test(String(j.particion))) {', '  if (false) { // REVERSIÓN R1: sin nombre seguro');
      return s;
    },
  },
  {
    id: 'R2-startsWith-ingenuo',
    que: 'el confinamiento pasa a `hijo.startsWith(padre)` — acepta el prefijo hermano (`Partitions-evil`), el mismo directorio y no entiende mayúsculas ni separadores',
    // Solo la unidad de confinamiento (K) y la guarda estática: los nombres válidos nunca llegan a producir un prefijo hermano,
    // por eso este defecto se prueba sobre esHijoDirectoDe directamente.
    tumba: [/^P28-ST5 /, /^P28-K[2-6] /],
    hacer: () => reemplazarBloque(MAIN, 'function esHijoDirectoDe(padre, hijo) {', '    return false;\n  }\n}\n',
      'function esHijoDirectoDe(padre, hijo) {\n  return String(hijo).startsWith(String(padre)); // REVERSIÓN R2: comparación ingenua\n}\n'),
  },
  {
    id: 'R3-userData-en-vez-de-sessionData',
    que: 'la base de la ruta física sale de userData en lugar de sessionData — con sessionData separado retira/destruye en la carpeta equivocada',
    // ES1: con sessionData aparte el rollback EN SESIÓN busca la carpeta bajo userData, no la encuentra y da el journal por resuelto:
    // la partición queda huérfana en sessionData y el resto del escenario (ES3-ES5) ya no llega a ejecutarse.
    tumba: [/^P28-ST4 /, /^P28-H8 /, /^P28-V[12] /, /^P28-ES1 /],
    hacer: () => reemplazarLinea(MAIN, "const sesion = app.getPath('sessionData');", "    const sesion = app.getPath('userData'); // REVERSIÓN R3: userData en vez de sessionData"),
  },
  {
    id: 'R4-cualquier-persist',
    que: 'los dos contratos aceptan cualquier `persist:*` — `persist:directorio-talento` gana permiso de borrado físico y los nombres de borrar-proyecto ya no se filtran',
    // El Directorio de Talento gana permiso de borrado físico (H7, J4, EH3/EH4: su carpeta desaparece) y los nombres hostiles de
    // borrar-proyecto ya no se filtran (EB2/EB3). El refuerzo del propio helper (`[\\/:%\0]`) sigue frenando la travesía en rollback.
    // EU6: `persist:..` sigue frenado (por el refuerzo del helper) pero ya no es «no demostrable» en el lector: cambia el log.
    tumba: [/^P28-C(1c|2|3|5b|8) /, /^P28-H(7|11) /, /^P28-J(2|4|6|10) /, /^P28-V(3|4|9) /, /^P28-EH(3|4|5|7|8) /, /^P28-EU6 /, /^P28-EB[23] /],
    hacer: () => {
      let s = reemplazarLinea(MAIN, 'const PARTICION_PROYECTO_PERSISTENTE_RE =', 'const PARTICION_PROYECTO_PERSISTENTE_RE = /^persist:.+$/; // REVERSIÓN R4: cualquier persist:*');
      s = reemplazarLinea(s, 'const PARTICION_NOMBRE_SEGURO_RE =', 'const PARTICION_NOMBRE_SEGURO_RE = /^persist:.+$/; // REVERSIÓN R4: cualquier persist:*');
      return s;
    },
  },
  {
    id: 'R5-continuar-tras-error-de-validacion',
    que: 'si el helper dice que la ruta no vale, `vaciarParticionDe` lo registra y SIGUE con rmSync sobre una ruta hecha a mano — se pierde la propiedad fail-closed',
    // Solo unidad y guarda estática: en el E2E el lector de journals sigue deteniendo los journals manipulados antes de llegar aquí.
    tumba: [/^P28-ST[23] /, /^P28-V3 /],
    hacer: () => {
      let s = reemplazarLinea(MAIN, '      return { ok: false, particionInvalida: true, motivo: seg.motivo };', '      // REVERSIÓN R5: el error se registra pero se sigue');
      s = reemplazarLinea(s, '    const ruta = seg.ruta;', "    const ruta = seg.ruta || path.join(app.getPath('sessionData'), 'Partitions', String(j.particion).replace(/^persist:/, ''));");
      return s;
    },
  },
  {
    id: 'R6-lector-sin-contrato',
    que: 'leerJournalBorrado deja de aplicar el contrato de la partición — un journal manipulado ya no es «no demostrable» (solo lo detiene la capa del helper)',
    // El helper sigue frenando los journals de rollback (fail-closed), pero el purgar-backups con partición ya no es «no demostrable»:
    // llega a la rama genérica, Electron abre una sesión sobre una partición viva (EH3, EH9) y el journal se da por resuelto (EH5).
    // EU6: `persist:..` sigue frenado por el helper, pero ya no como «no demostrable» del lector: cambian el log y la clase.
    tumba: [/^P28-ST6 /, /^P28-J(2|4|6|7) /, /^P28-EH(3|5|7|9) /, /^P28-EU6 /],
    hacer: () => reemplazarLinea(MAIN, '      const m = motivoParticionNoValida(j.tipo, j.particion);', '      const m = null; // REVERSIÓN R6: el lector no aplica el contrato'),
  },
  {
    id: 'R7-helper-sin-confinamiento',
    que: 'el helper de ruta deja de validar (nombre y confinamiento) pero lector y escritor siguen — la capa de defensa en profundidad de vaciarParticionDe desaparece',
    // Solo unidad: el lector de journals sigue deteniendo en el E2E. Es la defensa en PROFUNDIDAD de vaciarParticionDe la que desaparece.
    tumba: [/^P28-H(2|3|4|5|6|7|11) /, /^P28-V[34] /],
    hacer: () => sinValidarHelper(MAIN, 'REVERSIÓN R7'),
  },
  {
    id: 'R8-prep-y-purgar-con-particion',
    que: 'borrar-prep y purgar-backups pueden declarar partición — un journal manipulado de esos tipos alcanza la lógica de particiones',
    // El único journal E2E afectado es el purgar-backups con partición legítima (H12): pasa el lector y llega a clearStorageData.
    tumba: [/^P28-C6 /, /^P28-J7 /, /^P28-EH(3|5|7|9) /],
    hacer: () => reemplazarLinea(MAIN, "if (tipo === 'borrar-prep' || tipo === 'purgar-backups') return", "  if (tipo === 'borrar-prep' || tipo === 'purgar-backups') return null; // REVERSIÓN R8: sin restricción por tipo"),
  },
  {
    id: 'R9-escritor-sin-preflight',
    que: 'ejecutarBorrado no valida la partición antes de empezar — una fila con nombre hostil escribe journal y llega a commit',
    // El primer borrado hostil escribe su journal y la rama genérica lo frena, pero el journal queda PENDIENTE y F-1 bloquea todo lo
    // que venga después: por eso caen también el Directorio (EB4) y el control (EB5). El pre-flight evita ese bloqueo global.
    tumba: [/^P28-ST[67] /, /^P28-EB(2|4|5|6) /],
    hacer: () => reemplazarLinea(MAIN, '    const m = motivoParticionNoValida(o.tipo, String(o.particion));', '    const m = null; // REVERSIÓN R9: el escritor no valida'),
  },
  {
    id: 'R10-restauracion-sin-contrato',
    que: 'el journal de restauración deja de exigir el nombre seguro — la reposición (localStorage.clear()) puede apuntar a un contexto que Electron resuelva fuera de Partitions/',
    tumba: [/^P28-ST9 /, /^P28-J10 /],
    hacer: () => reemplazarLinea(MAIN, 'else if (!PARTICION_NOMBRE_SEGURO_RE.test(j.partition))', '  else { /* REVERSIÓN R10: sin contrato de nombre */ }'),
  },
  {
    id: 'R11-generica-sin-nombre-seguro',
    que: 'la rama genérica de vaciarParticionDe (borrar-proyecto) le pide a Electron cualquier nombre — solo la capa de lector/escritor la protege',
    // Solo unidad y guarda estática: lector y escritor siguen deteniendo los nombres antes de la rama genérica.
    tumba: [/^P28-ST10 /, /^P28-V9 /],
    hacer: () => reemplazarLinea(MAIN, 'if (!PARTICION_NOMBRE_SEGURO_RE.test(String(j.particion))) {', '  if (false) { // REVERSIÓN R11: sin nombre seguro en la rama genérica'),
  },
];

if (require.main === module) {
  console.log('REVERSIONES P28');
  console.log('  origen: ' + path.join(PROJ, 'main.js'));
  for (const fam of FAMILIAS) {
    const src = fam.hacer();
    if (src === MAIN) throw new Error('la reversión no cambia nada: ' + fam.id);
    const destino = rutaRevertida(fam.id);
    fs.writeFileSync(destino, src, 'utf8');
    console.log(`  [LISTA] ${fam.id}`);
    console.log(`          ${fam.que}`);
    console.log(`          debería romper: ${fam.tumba.map(String).join(' ')}`);
    console.log(`          copia temporal: ${destino}`);
  }
}

module.exports = { FAMILIAS, rutaRevertida };
