'use strict';
// ---------------------------------------------------------------------------
// P26 — REVERSIONES. Cada familia deshace UNA decisión de la purga P24
// desligada y anuncia qué grupos de comprobar-p26.js tiene que tumbar (y solo
// esos). Escribe las copias como `.p26-revertido-<id>.js` en la RAÍZ del
// proyecto —solo ahí resuelven `require('./db')` y las rutas de `__dirname`— y
// comprobar-reversiones-p26.js las borra siempre al terminar. NO toca
// producción.
//
// Las sustituciones se anclan a HUELLAS del main.js real (línea única o bloque
// entre dos huellas): si el código cambia y una huella deja de ser única, la
// reversión revienta en vez de cambiar otra cosa.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const MAIN = fs.readFileSync(path.join(PROJ, 'main.js'), 'utf8');
function rutaRevertida(id) { return path.join(PROJ, `.p26-revertido-${id}.js`); }

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

const FAMILIAS = [
  {
    id: 'R1-recuperacion-por-marca',
    que: 'F-1 sigue ignorando el P24 purgando, pero la recuperación vuelve a decidir por acciones_<writer> — con 8+ operaciones posteriores reaparece el huérfano silencioso',
    // La vía especial desaparece: no se retira la carpeta (M8d/M8e/M8f/M8i) —el huérfano silencioso—,
    // no consta la prueba (M8b, D2, D7b) y las unidades de recuperación (RC1*, RC2*, ST3) lo ven.
    tumba: [/^P26-ST3 /, /^P26-RC1[abcd] /, /^P26-RC2[ab] /, /^P26-M8[bdefi] /, /^P26-D2 /, /^P26-D7b /],
    hacer: () => reemplazarBloque(MAIN,
      '  const desligada = purgaP24Desligada(j);',
      "    return { ok: true, actionId: j.action_id, caso: 'B', clase: 'purgado', prueba: 'particion-desligada' };\n  }\n",
      '  // REVERSIÓN R1: la recuperación decide solo por la marca (F-1 sigue relajado)\n'),
  },
  {
    id: 'R2-sin-comprobar-fase',
    que: 'el predicado no comprueba la fase — un P24 en `retirando` (commit aún no demostrado) dejaría de bloquear',
    // U14/U14b cuentan consultas a la BD: sin la fase, un `retirando` ya no se descarta antes de consultarla.
    tumba: [/^P26-U5[ab] /, /^P26-U14b? /, /^P26-F1c /, /^P26-RC4 /, /^P26-N-N1 /],
    hacer: () => reemplazarLinea(MAIN, "if (j.fase !== 'purgando') return no(", '    // REVERSIÓN R2: no se comprueba la fase'),
  },
  {
    id: 'R3-sin-comprobar-fila',
    que: 'el predicado no compara con las filas de projects — una partición de nuevo referenciada seguiría contando como desligada (F-1 no bloquea y la vía especial la purgaría)',
    // FR6/FR7 son la consecuencia grave: con la marca agotada, la vía especial purga la carpeta de una fila viva.
    // (FR10, desde P27: con la marca INTACTA y una fila viva, la vía especial —que ya no sabe de filas— purga la carpeta
    // porque la guarda de `vaciarParticionDe` comparte el mismo helper y quedó desactivada con él.)
    tumba: [/^P26-U9[abcd] /, /^P26-U15 /, /^P26-F1b /, /^P26-RC3[ab] /, /^P26-FR(10|[23678]) /, /^P26-N-N2 /],
    // Desde P27 la comparación vive en `particionUsadaPorFila`, compartida con la
    // guarda de `vaciarParticionDe`: quitarla aquí desactiva las DOS defensas.
    hacer: () => reemplazarLinea(MAIN, "if (carpetaDeParticion(f.partition_name) === carpeta) return {", '      // REVERSIÓN R3: no se comprueba si alguna fila usa esa partición'),
  },
  {
    id: 'R4-excepcion-generica',
    que: 'la excepción deja de ser exclusiva de rollback-creacion-proyecto sin recursos: vale para CUALQUIER journal propio en `purgando` cuya partición no tenga fila (incluido borrar-proyecto) — la relajación genérica de F-1 que P26 prohíbe',
    // B3/B4 son la consecuencia grave: un borrar-proyecto cuyo id no está en la marca se PURGA en vez de reponerse.
    // RC5b/RC7 también cambian porque la vía especial se salta la marca para un tipo que no le corresponde.
    tumba: [/^P26-U4[abcd] /, /^P26-U6 /, /^P26-U7[ab] /, /^P26-U14b? /, /^P26-F1[defi] /, /^P26-RC(5[ab]|6[ab]|7|8) /, /^P26-N-N(3|7|7b|7c) /, /^P26-B[134] /],
    hacer: () => {
      let s = reemplazarLinea(MAIN, "if (j.tipo !== 'rollback-creacion-proyecto') return no(", '    // REVERSIÓN R4: sin restricción de tipo');
      s = reemplazarLinea(s, "if (j.sinRecursos !== true) return no(", '    // REVERSIÓN R4: sin exigir sinRecursos');
      s = reemplazarLinea(s, 'if (!Array.isArray(j.recursos) || j.recursos.length !== 0) return no(', '    // REVERSIÓN R4: sin exigir que no haya recursos');
      return s;
    },
  },
  {
    id: 'R5-consulta-fallida-es-sin-fila',
    que: 'si la consulta a projects lanza, se interpreta como «ninguna fila» — la BD que no responde dejaría de bloquear',
    // N5b (la consulta devuelve algo que no es una lista) NO cae: esa rama sigue siendo ambigua ⇒ bloquea.
    tumba: [/^P26-U11 /, /^P26-F1j /, /^P26-RC9 /, /^P26-N-N5 /],
    hacer: () => reemplazarLinea(MAIN, "const filas = dbmod.all('SELECT partition_name FROM projects');",
      "    let filas = [];\n    try { filas = dbmod.all('SELECT partition_name FROM projects'); } catch (e5) { filas = []; } // REVERSIÓN R5"),
  },
  {
    id: 'R6-journal-antes-de-verificar',
    que: 'la vía especial retira el journal ANTES de retirar/verificar la carpeta — si la carpeta no se puede retirar, se pierde la única evidencia durable',
    // D3/D4 son la propiedad de durabilidad: con la carpeta bloqueada el journal ya no sobrevive. D7a-D7f caen en cascada
    // (el segundo arranque ya no encuentra el journal). M8f/RC2b/RC1* ven el orden y la vía distinta.
    tumba: [/^P26-RC1[acd] /, /^P26-RC2b /, /^P26-M8f /, /^P26-D[345] /, /^P26-D7[abdef] /],
    hacer: () => reemplazarBloque(MAIN,
      '    const p = await finalizarPurga(j);\n    if (!p.ok) return { ok: false, actionId: j.action_id, clase: \'purga-incompleta\', motivo: p.motivo, particionPendiente: !!p.particionPendiente, prueba: \'particion-desligada\' };',
      "prueba: 'particion-desligada' };",
      "    borrarJournalResuelto(journalBorradoPath(j.action_id), 'un borrado'); // REVERSIÓN R6: el journal cae antes de verificar la carpeta\n" +
      "    const p = await vaciarParticionDe(j);\n" +
      "    if (!p.ok) return { ok: false, actionId: j.action_id, clase: 'purga-incompleta', motivo: p.motivo, particionPendiente: !!p.particionPendiente, prueba: 'particion-desligada' };"),
  },
  {
    id: 'R7-tipo-ampliado',
    que: 'la excepción se amplía a todos los tipos que permiten cero recursos (purgar-backups, borrar-prep) — precedente automático que P26 prohíbe',
    // borrar-proyecto (U4a) NO cae: no está en BORRADOS_TIPOS_SIN_RECURSOS. Caen purgar-backups y borrar-prep.
    tumba: [/^P26-U4[bc] /, /^P26-F1f /, /^P26-RC6[ab] /, /^P26-N-N7[bc] /],
    hacer: () => reemplazarLinea(MAIN, "if (j.tipo !== 'rollback-creacion-proyecto') return no(",
      '    if (!BORRADOS_TIPOS_SIN_RECURSOS.has(j.tipo)) return no(`tipo ${JSON.stringify(j.tipo)}`); // REVERSIÓN R7: tipo ampliado'),
  },
  {
    id: 'R8-sin-forma-de-particion',
    que: 'el predicado no comprueba la forma de la partición — `persist:directorio-talento` o una ruta con travesía contarían como partición de proyecto desligada',
    tumba: [/^P26-U8[abc] /, /^P26-N-N9b? /],
    hacer: () => reemplazarLinea(MAIN, 'PARTICION_PROYECTO_PERSISTENTE_RE.test(j.particion)) return no(',
      "    if (typeof j.particion !== 'string') return no('particion no es una cadena'); // REVERSIÓN R8: sin comprobar la forma"),
  },
  {
    id: 'R9-criterio-duplicado-en-f1',
    que: 'f1Borrados repite un criterio propio, algo distinto (sin fila, sin forma, sin recursos) en vez de llamar al predicado único',
    // ST2/ST4 son la guarda estática de «predicado único»; el resto son las tres condiciones que la copia se dejó (fila, forma, recursos, consulta).
    tumba: [/^P26-ST[24] /, /^P26-F1[bj] /, /^P26-FR[23] /, /^P26-N-N(2|3|5|5b|9|9b) /],
    hacer: () => reemplazarLinea(MAIN, '!purgaP24Desligada(e.j).cumple',
      "      if (e.j.writer === yo && !(e.j.tipo === 'rollback-creacion-proyecto' && e.j.fase === 'purgando' && e.j.sinRecursos === true)) pendientes.push({ tipo: 'borrado', ruta: e.ruta, actionId: e.j.action_id }); // REVERSIÓN R9"),
  },
];

if (require.main === module) {
  console.log('REVERSIONES P26');
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
