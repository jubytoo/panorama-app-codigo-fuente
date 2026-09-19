'use strict';
// ---------------------------------------------------------------------------
// P24 — REVERSIONES. Cada familia deshace UNA decisión del rollback de
// creación fallida y anuncia qué grupos de comprobar-p24.js tiene que tumbar
// (y solo esos). Escribe las copias en `p24/revertidos/<familia>/main.js`.
// NO toca producción.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const MAIN = fs.readFileSync(path.join(PROJ, 'main.js'), 'utf8');
// P24 usa Electron REAL, no extracción por firma: `require()` de una copia
// revertida solo puede resolver `require('./db')` y las rutas de
// `__dirname` (dashboard/, vendor/, preload.js...) si esa copia vive en la
// RAÍZ del proyecto, junto al `db.js`/`dashboard/` reales -- nunca en una
// subcarpeta de `claude/`. Por eso, a diferencia de 8A/P9/P22, la copia
// revertida se escribe TEMPORALMENTE en la raíz del proyecto (nombre con
// prefijo `.p24-revertido-`, nunca `main.js`) y se borra siempre al terminar
// (ver comprobar-reversiones-p24.js, con try/finally). No es una copia
// permanente ni forma parte del código fuente.
const SALIDA = PROJ;
function rutaRevertida(id) { return path.join(PROJ, `.p24-revertido-${id}.js`); }

function cambiar(src, busca, pone, veces) {
  const n = src.split(busca).length - 1;
  if (n === 0) throw new Error('NO SE ENCONTRO: ' + busca.slice(0, 80));
  if (veces !== undefined && n !== veces) throw new Error(`se esperaban ${veces} apariciones y hay ${n}: ${busca.slice(0, 60)}`);
  return src.split(busca).join(pone);
}

const BLOQUE_CATCH_ACTUAL = `      const f1 = await f1GlobalConReintento();
      if (!f1.libre) {
        appLog(\`Aviso — P24: no se pudo iniciar la limpieza de la partición del proyecto \${id} (F-1 ocupado tras reintento); la fila queda tal cual, incompleta pero visible y borrable a mano. Motivo: \${f1.motivo}\`);
      } else {
        const r = await ejecutarBorrado({
          tipo: 'rollback-creacion-proyecto',
          particion: partition,
          recursos: [],
          permitirSinArchivos: true,
          sentencias: () => [{ sql: 'DELETE FROM projects WHERE id=?', params: [id] }],
        });
        if (!r.aplicado) {
          appLog(\`Aviso — P24: no se pudo escribir el journal de rollback para el proyecto \${id}; la fila queda tal cual, incompleta pero visible y borrable a mano. Motivo: \${r.error}\`);
        } else if (r.purga && r.purga.ok === false) {
          appLog(\`Aviso — P24: proyecto \${id} borrado, pero la partición \${partition} no se pudo limpiar del todo (queda pendiente para el próximo arranque). Motivo: \${r.purga.motivo}\`);
        }
      }`;

const FAMILIAS = [
  {
    id: 'R1-delete-directo',
    que: 'vuelve al DELETE directo de siempre, sin journal ni comprobación de F-1 — reaparece el huérfano silencioso que motivó P24',
    // También cae la precondición de P24-16: sin journal no hay arranque real que probar.
    tumba: [/^P24-3 hay EXACTAMENTE/, /^P24-14 /, /^P24-7 la fila SIGUE/, /^P24-8 la fila SIGUE/, /^P24-12 la carpeta/, /^P24-16 precondición: el proceso anterior/],
    hacer: () => cambiar(MAIN, BLOQUE_CATCH_ACTUAL, `      dbmod.run('DELETE FROM projects WHERE id=?', [id]);`, 1),
  },
  {
    id: 'R2-borra-con-f1-ocupado',
    que: 'añade un DELETE de "reserva" cuando F-1 sigue ocupado — rompe la propiedad fail-closed central de P24',
    // También tumba P24-8: bloquear `.panorama-borrados` con un archivo (para
    // simular "journal no escribible") hace que la propia lectura de F-1
    // falle (`readdirSync` sobre un archivo, no un directorio) y
    // f1GlobalConReintento() lo reporte como "no libre" -- pasa por la MISMA
    // rama que R2 muta, no es un arrastre ajeno.
    tumba: [/^P24-7 la fila SIGUE/, /^P24-8 la fila SIGUE/],
    hacer: () => cambiar(MAIN,
      `      if (!f1.libre) {
        appLog(\`Aviso — P24: no se pudo iniciar la limpieza de la partición del proyecto \${id} (F-1 ocupado tras reintento); la fila queda tal cual, incompleta pero visible y borrable a mano. Motivo: \${f1.motivo}\`);
      } else {`,
      `      if (!f1.libre) {
        appLog(\`Aviso — P24: no se pudo iniciar la limpieza de la partición del proyecto \${id} (F-1 ocupado tras reintento); la fila queda tal cual, incompleta pero visible y borrable a mano. Motivo: \${f1.motivo}\`);
        dbmod.run('DELETE FROM projects WHERE id=?', [id]); // REVERSIÓN R2: borra igual, a propósito
      } else {`, 1),
  },
  {
    id: 'R3-sin-verificar-rmsync',
    que: 'quita la verificación fs.existsSync tras fs.rmSync — da por hecha la limpieza física sin comprobarla',
    tumba: [/^P24-13 vaciarParticionDe verifica fs\.existsSync/],
    hacer: () => cambiar(MAIN,
      `    if (fs.existsSync(ruta)) {
      appLog(\`Borrado — la carpeta de la partición \${j.particion} sigue existiendo tras intentar eliminarla.\`);
      return { ok: false, particionPendiente: true, motivo: 'la carpeta sigue existiendo tras fs.rmSync' };
    }
    return { ok: true };`,
      `    // REVERSIÓN R3: no se comprueba si de verdad desapareció
    return { ok: true };`, 1),
  },
  {
    id: 'R4-ruta-por-getStoragePath',
    que: 'construye la ruta con session.fromPartition(...).getStoragePath() en vez de app.getPath(\'sessionData\') a mano — medido que eso mismo bloquea el rmSync también en un arranque nuevo',
    // Referenciar la sesión dentro de la propia recuperación rompe el mismo grupo
    // que R7 (ver allí): partición tocada (2), rmSync (3), carpeta (4), journal (5)(6a),
    // cierre por PS-2006 (6b)(6c) y orden de ventanas.
    tumba: [/^P24-12 la carpeta de la partición huérfana/, /^P24-12 el journal quedó resuelto/, /^P24-16 \(2\)/, /^P24-16 \(3\)/, /^P24-16 \(4\)/,
      /^P24-16 \(5\)/, /^P24-16 \(6a\)/, /^P24-16 \(6b\)/, /^P24-16 \(6c\)/, /^P24-16 orden real/],
    // (P27: la guarda de fila se inserta entre `existsSync` y el `try` del rmSync, así que la
    // huella se acota a las tres líneas que construyen la ruta; la guarda queda intacta.)
    // (P28: la ruta ya no se construye a mano, la da `rutaParticionSeguraParaBorrado`; la huella
    // pasa a ser esa obtención y la reversión sigue siendo «ruta vía session.fromPartition».)
    hacer: () => cambiar(MAIN,
      `    const ruta = seg.ruta;
    if (!fs.existsSync(ruta)) return { ok: true };`,
      `    // REVERSIÓN R4: ruta obtenida vía session.fromPartition (medido que esto
    // deja una referencia viva que bloquea el propio rmSync siguiente, incluso
    // en un proceso que nunca antes había tocado la partición)
    let ruta;
    try { ruta = session.fromPartition(j.particion).getStoragePath(); } catch (e) { return { ok: false, particionPendiente: true, motivo: String((e && e.message) || e) }; }
    if (!ruta) return { ok: true };`, 1),
  },
  {
    id: 'R5-borra-journal-siempre',
    que: 'borra el journal de purga aunque vaciarParticionDe haya fallado — pierde la única evidencia durable de que queda limpieza pendiente',
    // También cae la precondición de P24-16: el journal ya no sobrevive a la sesión que falló.
    tumba: [/^P24-3 hay EXACTAMENTE/, /^P24-14 /, /^P24-12 la carpeta/, /^P24-16 precondición: el proceso anterior/],
    // (P27: el `return` final de `finalizarPurga` ahora distingue `particionOmitida`; la huella
    // se acota a las tres líneas de arriba y el resultado de la reversión sigue siendo {ok:true}.)
    hacer: () => cambiar(MAIN,
      `    const v = await vaciarParticionDe(j);
    if (!v.ok) return v;
    borrarJournalResuelto(journalBorradoPath(j.action_id), 'un borrado');`,
      `    const v = await vaciarParticionDe(j);
    borrarJournalResuelto(journalBorradoPath(j.action_id), 'un borrado'); // REVERSIÓN R5: se borra pase lo que pase
    return { ok: true };`, 1),
  },
  {
    id: 'R6-sinrecursos-indiscriminado',
    que: 'la marca sinRecursos:true vale para CUALQUIER tipo — quita la restricción por contrato y abre `borrar-proyecto` con recursos:[]',
    tumba: [/^P24-15 borrar-proyecto \+ recursos:\[\] \+ sinRecursos:true NO es válido/],
    hacer: () => cambiar(MAIN,
      `if (j.sinRecursos !== true || !BORRADOS_TIPOS_SIN_RECURSOS.has(j.tipo)) falta.push(`,
      `if (j.sinRecursos !== true) falta.push(`, 1),
  },
  {
    id: 'R7-referencia-antes-de-recuperar',
    que: 'algo referencia session.fromPartition(<partición del journal>) ANTES de recuperarBorradosPendientes — el rmSync del arranque vuelve a dar EBUSY y la convergencia deja de funcionar',
    // Todo el grupo del arranque real cae junto: la partición se toca antes (2),
    // el rmSync falla (3), la carpeta sigue (4), el journal no cae (5)(6a), y el
    // arranque se cierra solo por PS-2006 (6b)(6c) sin llegar al lanzador (orden).
    tumba: [/^P24-12 la carpeta/, /^P24-12 el journal quedó/, /^P24-16 \(2\)/, /^P24-16 \(3\)/, /^P24-16 \(4\)/, /^P24-16 \(5\)/,
      /^P24-16 \(6a\)/, /^P24-16 \(6b\)/, /^P24-16 \(6c\)/, /^P24-16 orden real/],
    hacer: () => cambiar(MAIN,
      `  let borradosRecovery = null;
  try {
    borradosRecovery = await recuperarBorradosPendientes();`,
      `  let borradosRecovery = null;
  try {
    // REVERSIÓN R7 (artificial): algo toca la partición ANTES de la recuperación
    for (const f7 of fs.readdirSync(borradosDir())) {
      if (!/\\.json$/i.test(f7)) continue;
      try { const j7 = JSON.parse(fs.readFileSync(path.join(borradosDir(), f7), 'utf8')); if (j7.particion) session.fromPartition(j7.particion); } catch (e7) {}
    }
  } catch (e7b) {}
  try {
    borradosRecovery = await recuperarBorradosPendientes();`, 1),
  },
];

if (require.main === module) {
  console.log('REVERSIONES P24');
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

module.exports = { FAMILIAS, SALIDA, rutaRevertida };
