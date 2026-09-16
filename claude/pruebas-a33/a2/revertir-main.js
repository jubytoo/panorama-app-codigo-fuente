'use strict';
// ---------------------------------------------------------------------------
// Reversiones sobre el main.js PRODUCTIVO (no sobre el helper aislado).
// Genera una copia con UNA correccion quitada, para relanzar la bateria con
// PANORAMA_MAIN apuntando a esa copia.
//
// Una prueba que tambien pasa contra el codigo anterior no demuestra nada.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const ORIG = process.env.PANORAMA_MAIN_ORIG || path.join(PROJ, 'main.js');
const SRC = fs.readFileSync(ORIG, 'utf8');

const REVERSIONES = [
  {
    id: 'F-sin-flush',
    espera: 'REST-FLUSH-1 y REST-FLUSH-2',
    desc: 'se quita la barrera durable: el restore confirma sin volcar el localStorage a disco',
    de: `      await session.fromPartition(row.partition_name).flushStorageData();`,
    a: `      // (barrera durable revertida a proposito)`,
  },
  {
    id: 'G-sin-flush-rollback',
    espera: 'REST-ROLLBACK-FLUSH-1, -2 y -5',
    desc: 'la reposicion desde previo deja de volcar a disco antes de que se limpie el material',
    de: `  try {
    await session.fromPartition(j.partition).flushStorageData();
  } catch (e) {`,
    a: `  try {
    // (barrera durable de la reposicion revertida a proposito)
  } catch (e) {`,
  },
  {
    id: 'I-p2-delete-ciego',
    espera: 'P2-MEETING y P2-CANDIDATE (modo ra8)',
    desc: 'los closed de reunion y candidatos vuelven al delete(id) ciego, sin comprobar identidad',
    de: `    if (meetingPrepWindows.get(row.id) === win) meetingPrepWindows.delete(row.id);`,
    a: `    meetingPrepWindows.delete(row.id);`,
    extra: [[`    if (candidateEvalWindows.get(row.id) === win) candidateEvalWindows.delete(row.id);`,
      `    candidateEvalWindows.delete(row.id);`]],
  },
  {
    // H-1, capa A. El `finally` vuelve a desarmar SIEMPRE, que es lo que hacia
    // antes: `mantenerBarrera` deja de tener efecto. La capa durable sigue
    // puesta, asi que H1-2 y H1-4 siguen verdes — es justo lo que demuestra que
    // son dos defensas distintas y que hacen falta las dos.
    id: 'J-barrera-se-suelta',
    espera: 'H1-1 (barrera en memoria y operaciones nuevas de la MISMA sesion)',
    desc: 'el finally suelta la barrera en memoria aunque el restore quede sin resolver',
    de: `  const desarmarSiProcede = () => {
    if (mantenerBarrera) { restauracionesSinResolver.add(pid); return; }
    if (barreraPuesta) { proyectosEnRestauracion.delete(pid); barreraPuesta = false; }
  };`,
    a: `  const desarmarSiProcede = () => {
    // (barrera persistente revertida a proposito)
    if (barreraPuesta) { proyectosEnRestauracion.delete(pid); barreraPuesta = false; }
  };`,
  },
  {
    // H-1, capa B. `proyectoBloqueadoParaMutar()` vuelve a mirar solo los dos
    // Set en memoria. H1-1 sigue verde (la sesion que sufrio el fallo conserva
    // su barrera); lo que se cae es todo lo que depende del journal durable.
    id: 'K-sin-f1-durable',
    espera: 'H1-2, H1-3 (bloqueo previo), H1-4 y H1-4b',
    desc: 'la barrera deja de preguntar por el journal: tras reiniciar, nada bloquea',
    de: `  const rp = restauracionPendienteDeProyecto(projectId);
  if (rp) return rp;
  return null;
}`,
    a: `  // (F-1 durable de restauraciones revertida a proposito)
  return null;
}`,
  },
  {
    // RA-9 comprobaba que el dialogo de fail-closed lleva el codigo de error,
    // pero nunca se habia visto fallar. Se arranca con A2_MAIN apuntando aqui.
    id: 'L-sin-codigo-ps2006',
    espera: 'RA-9 el DETALLE lleva el codigo PS-2006 (modo ra9)',
    desc: 'el dialogo de restauracion sin resolver deja de llevar el codigo de error',
    de: `        'seguir escribiendo encima.' +
        errorCodeSuffix('PS-2006'),`,
    a: `        'seguir escribiendo encima.',   // (codigo de error revertido a proposito)`,
  },
  {
    id: 'H-sin-relectura',
    espera: 'REST-ROLLBACK relectura',
    desc: 'la reposicion deja de releer la particion y se fia de que setItem no lanzara',
    de: `  const hRel = hashDumpLocalStorage(releido);
  if (hRel !== j.previo_hash) {`,
    a: `  const hRel = j.previo_hash;   // (relectura revertida a proposito)
  if (hRel !== j.previo_hash) {`,
  },
];

const dirOut = path.join(__dirname, 'revertidos-main');
fs.rmSync(dirOut, { recursive: true, force: true });
fs.mkdirSync(dirOut, { recursive: true });

console.log('REVERSIONES SOBRE EL main.js PRODUCTIVO');
console.log('  origen: ' + ORIG);
let malos = 0;
for (const r of REVERSIONES) {
  const veces = SRC.split(r.de).length - 1;
  if (veces !== 1) { malos++; console.log(`  [NO SE PUDO] ${r.id}: el fragmento aparece ${veces} veces`); continue; }
  // Algunas correcciones viven en dos sitios simetricos (reunion y
  // candidatos): revertir solo uno dejaria la prueba pasando por el otro.
  let t = SRC.replace(r.de, r.a);
  let bien = true;
  for (const [de, a] of (r.extra || [])) {
    if (t.split(de).length - 1 !== 1) { bien = false; break; }
    t = t.replace(de, a);
  }
  if (!bien) { malos++; console.log(`  [NO SE PUDO] ${r.id}: un fragmento extra no aparece una sola vez`); continue; }
  const destino = path.join(dirOut, r.id + '.js');
  fs.writeFileSync(destino, t, 'utf8');
  console.log(`  [LISTA] ${r.id}`);
  console.log(`          ${r.desc}`);
  console.log(`          deberia romper: ${r.espera}`);
  console.log(`          copia: ${destino}`);
}
process.exit(malos === 0 ? 0 : 1);
