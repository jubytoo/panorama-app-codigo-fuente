'use strict';
// ---------------------------------------------------------------------------
// P27 — REVERSIONES. Cada familia deshace UNA decisión de la guarda de
// `vaciarParticionDe` y anuncia qué grupos de comprobar-p27.js tiene que tumbar
// (y solo esos). Escribe las copias como `.p27-revertido-<id>.js` en la RAÍZ del
// proyecto (solo ahí resuelven `require('./db')`) y comprobar-reversiones-p27.js
// las borra siempre al terminar. NO toca producción.
//
// Las sustituciones se anclan a HUELLAS del main.js real (línea única o bloque
// entre dos huellas): si una huella deja de ser única, la reversión revienta en
// vez de cambiar otra cosa.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const MAIN = fs.readFileSync(path.join(PROJ, 'main.js'), 'utf8');
function rutaRevertida(id) { return path.join(PROJ, `.p27-revertido-${id}.js`); }

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

// La guarda tal como está en main.js (para quitarla en R1, R3 y R4).
const GUARDA_DESDE = "    const uso = particionUsadaPorFila(j.particion);\n    if (uso.estado === 'referenciada') {";
const GUARDA_HASTA = "      return { ok: false, particionPendiente: true, motivo: uso.motivo };\n    }\n";
const sinGuarda = (src, marca) => reemplazarBloque(src, GUARDA_DESDE, GUARDA_HASTA, `    // ${marca}: sin guarda de fila\n`);

const FAMILIAS = [
  {
    id: 'R1-sin-comprobar-fila-antes-de-rmsync',
    que: 'se quita la comprobación de fila inmediatamente antes del rmSync — reaparece el borrado de la partición viva (el hallazgo de P27)',
    // C1d/C1e son el hallazgo: la carpeta y el centinela de una partición viva desaparecen (y C3c-f: sin guarda tampoco hay fail-closed).
    tumba: [/^P27-ST[1-4] /, /^P27-G1b /, /^P27-G2 /, /^P27-G3[abcd] /, /^P27-C1[degi] /, /^P27-C2f /, /^P27-C3[cdef] /, /^P27-C5[cd] /],
    hacer: () => sinGuarda(MAIN, 'REVERSIÓN R1'),
  },
  {
    id: 'R2-no-demostrable-como-libre',
    que: 'una consulta que falla (o ambigua) se interpreta como «sin fila» y se destruye — la BD que no responde deja de proteger',
    // Sin poder demostrar que está desligada se destruye igual: C3c (carpeta y centinela), C3d (journal), C3f (convergencia).
    tumba: [/^P27-G3[abcd] /, /^P27-C3[cdef] /],
    hacer: () => reemplazarLinea(MAIN, "    if (uso.estado !== 'libre') {", '    if (false) { // REVERSIÓN R2: no-demostrable pasa por libre'),
  },
  {
    id: 'R3-guarda-solo-en-via-especial',
    que: 'la guarda solo protege la vía especial de P26 (que ya sabía que no había fila) y no el CASO B histórico con el id en la marca',
    // Mismo resultado que R1: la vía especial ya sabía que no había fila, así que su guarda es vacía y el CASO B histórico
    // (con el id todavía en la marca) queda sin proteger. C2 (marca agotada) NO cae: ahí no se purga.
    tumba: [/^P27-ST[1-4] /, /^P27-G1b /, /^P27-G2 /, /^P27-G3[abcd] /, /^P27-C1[degi] /, /^P27-C2f /, /^P27-C3[cdef] /, /^P27-C5[cd] /],
    hacer: () => {
      let s = sinGuarda(MAIN, 'REVERSIÓN R3');
      s = reemplazarBloque(s, '  if (desligada.cumple) {\n', '  if (desligada.cumple) {\n',
        "  if (desligada.cumple) {\n    { const g3 = particionUsadaPorFila(j.particion); if (g3.estado !== 'libre') return { ok: true, actionId: j.action_id, caso: 'B', clase: 'sin-efecto' }; } // REVERSIÓN R3: la guarda vive solo aquí\n");
      return s;
    },
  },
  {
    id: 'R4-guarda-alcanza-a-borrar-proyecto',
    que: 'la guarda se extiende también al camino genérico (borrar-proyecto, purgar-backups, borrar-prep) antes de clearStorageData — cambia el comportamiento histórico de esos tipos',
    // No cae ningún E2E: en un borrar-proyecto real la fila ya se borró en el commit, así que la guarda ve
    // «libre». Lo demuestran las unidades G7/G8 (con una fila presente en el doble) y las guardas estáticas
    // ST1-ST4, que exigen UNA sola llamada, dentro de la rama rollback (con dos, dejan de poder ubicarla).
    tumba: [/^P27-ST[1-4] /, /^P27-G7[ab] /, /^P27-G8b /],
    hacer: () => reemplazarBloque(MAIN,
      "  try {\n    await session.fromPartition(j.particion).clearStorageData();",
      "  try {\n    await session.fromPartition(j.particion).clearStorageData();",
      "  { const g4 = particionUsadaPorFila(j.particion); if (g4.estado === 'referenciada') return { ok: true, particionOmitida: 'referenciada' }; if (g4.estado !== 'libre') return { ok: false, particionPendiente: true, motivo: g4.motivo }; } // REVERSIÓN R4: guarda para TODOS los tipos\n" +
      "  try {\n    await session.fromPartition(j.particion).clearStorageData();"),
  },
  {
    id: 'R5-await-entre-consulta-y-rmsync',
    que: 'entre la consulta y el rmSync hay un `await` — la comprobación deja de ser inmediata (la BD podría cambiar en el hueco)',
    // Solo la guarda estática lo ve: un `await` no cambia el resultado de una unidad síncrona, y por eso ST4 existe.
    tumba: [/^P27-ST4 /],
    hacer: () => reemplazarBloque(MAIN, GUARDA_HASTA + '    try {\n', GUARDA_HASTA + '    try {\n',
      GUARDA_HASTA + '    await new Promise((r5) => setImmediate(r5)); // REVERSIÓN R5: un turno del bucle de eventos entre la consulta y el rmSync\n    try {\n'),
  },
  {
    id: 'R6-journal-retirado-si-consulta-falla',
    que: 'si la consulta falla se retira el journal como si nada (sin destruir la carpeta) — se pierde la deuda: silencioso huérfano si la fila no existía',
    // La carpeta NO se destruye (C3c pasa), pero el journal desaparece: C3d y, en cascada, C3f (el siguiente arranque ya no lo purga: huérfano).
    tumba: [/^P27-G3[abc] /, /^P27-C3[df] /],
    hacer: () => reemplazarLinea(MAIN, "      return { ok: false, particionPendiente: true, motivo: uso.motivo };",
      "      return { ok: true, particionOmitida: 'no-demostrable', motivo: uso.motivo }; // REVERSIÓN R6: la deuda se da por saldada"),
  },
  {
    id: 'R7-conservar-journal-si-referenciada',
    que: 'política A: con la partición referenciada el journal se CONSERVA como purga pendiente (y el arranque se cierra con PS-2006) en vez de darse por sin efecto',
    // Política A: el journal se conserva, el arranque se cierra con PS-2006 (C1f) y el siguiente arranque vuelve a chocar (C1i).
    tumba: [/^P27-G2 /, /^P27-C1[fi] /, /^P27-C2f /, /^P27-C5d /],
    hacer: () => reemplazarLinea(MAIN, "      return { ok: true, particionOmitida: 'referenciada', motivo: uso.motivo };",
      "      return { ok: false, particionPendiente: true, motivo: uso.motivo }; // REVERSIÓN R7: política A (conservar y bloquear)"),
  },
  {
    id: 'R8-comparacion-exacta',
    que: 'el helper compara la cadena exacta de partition_name en vez de la carpeta normalizada — una fila con otro caso o sin `persist:` deja de contar',
    // Solo caen los casos de caso distinto y sin `persist:`: la comparación por carpeta normalizada es lo que los cubre.
    tumba: [/^P27-H2[bc] /, /^P27-G2 /],
    hacer: () => reemplazarLinea(MAIN, "if (carpetaDeParticion(f.partition_name) === carpeta) return { estado: 'referenciada'",
      "      if (f.partition_name === particion) return { estado: 'referenciada', motivo: 'una fila de projects usa esa partición' }; // REVERSIÓN R8: comparación exacta"),
  },
];

if (require.main === module) {
  console.log('REVERSIONES P27');
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
