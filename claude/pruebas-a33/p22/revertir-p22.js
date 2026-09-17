'use strict';
// ---------------------------------------------------------------------------
// P22 — REVERSIONES. Cada familia deshace UNA garantía y anuncia qué
// aserciones de `test-p22-reserva.js` tiene que tumbar (y solo esas).
//
//   A  Esc/la X vuelven a elegir «datos locales»
//   B  la base de datos configurada ilegible vuelve al fallback SILENCIOSO
//   C  una base de datos local existente vuelve a abrirse sin confirmar
//   D  la marca histórica deja de impedir que se cree una base local
//   E  la sesión local temporal vuelve a desactivar la protección de apagado
//   F  un archivo local inválido (0 bytes, no-SQLite) vuelve a contar como ausente
//   G  el fallo al persistir la marca vuelve a ser silencioso
//
// Escribe las copias en `p22/revertidos/<familia>/main.js`. NO toca producción.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const SALIDA = path.join(__dirname, 'revertidos');
const MAIN = fs.readFileSync(path.join(PROJ, 'main.js'), 'utf8');

function cambiar(src, busca, pone, veces) {
  const n = src.split(busca).length - 1;
  if (n === 0) throw new Error('NO SE ENCONTRO: ' + busca.slice(0, 80));
  if (veces !== undefined && n !== veces) throw new Error(`se esperaban ${veces} apariciones y hay ${n}: ${busca.slice(0, 60)}`);
  return src.split(busca).join(pone);
}

const FAMILIAS = [
  {
    id: 'A-esc-elige-local',
    que: 'Esc y la X vuelven a significar «usar los datos locales» (cancelId deja de ser «Cerrar»)',
    // No tumba P22-13/14/14b: PS-1023 tiene un unico boton («Cerrar»), asi que
    // el escape sigue cayendo en él aunque cancelId deje de elegirse a mano.
    tumba: [/^P22-1\/P22-2 /, /^P22-1b /, /^P22-7 /, /^P22-8c /, /^P22-12 /],
    electron: ['A-esc'],
    hacer: () => cambiar(MAIN,
      '  const idCerrar = acciones.indexOf(\'cerrar\');',
      "  const idCerrar = acciones.indexOf('cerrar');\n  const idEscape = acciones.findIndex((a) => a === 'local' || a === 'crear'); // REVERSIÓN P22-A", 1)
      .split('      cancelId: idCerrar,').join('      cancelId: idEscape >= 0 ? idEscape : idCerrar, // REVERSIÓN P22-A'),
  },
  {
    id: 'B-ilegible-en-silencio',
    que: 'la base de datos configurada que no se puede comprobar vuelve a caer en la local SIN preguntar',
    tumba: [/^P22-5 /],
    electron: ['B2-esc'],
    hacer: () => {
      const i = MAIN.indexOf("  if (ultimo.estado === 'no-accesible') {");
      const fin = MAIN.indexOf('\n  }\n', MAIN.indexOf('if (otra.estado === \'no-visible\') break;', i)) + 5;
      return MAIN.slice(0, i) + "  if (ultimo.estado === 'no-accesible') {\n" +
        "    // REVERSIÓN P22-B: fallback local silencioso, como antes.\n" +
        "    appLog('A3.3 — la base de datos de la carpeta personalizada no se puede comprobar: se usa la carpeta por defecto por esta sesión.');\n" +
        "    app.setPath('userData', defaultUserDataDir);\n" +
        '    customUserDataDirFailure = { attempted: customUserDataDirTarget, error: `No se pudo comprobar panorama.sqlite3 ahí (${ultimo.codigo})` };\n' +
        "    return 'seguir';\n  }\n" + MAIN.slice(fin);
    },
  },
  {
    id: 'C-abre-sin-confirmar',
    que: 'una base de datos local existente vuelve a abrirse sin confirmación en el arranque sin location.json',
    // Arrastra P22-10 en cascada: sin puerta la sesion nunca se marca como local
    // temporal, asi que vuelve a desactivarse la proteccion de apagado (P20).
    // No tumba P22-9/C2/3b: esos exigen «no escribe / no enseña rutas», y eso
    // sigue siendo cierto cuando directamente no hay dialogo.
    tumba: [/^P22-6 /, /^P22-1\/P22-2 /, /^P22-1b /, /^P22-C1 /, /^P22-3 /, /^P22-8c /, /^P22-10 /],
    electron: ['C-esc'],
    hacer: () => cambiar(MAIN,
      "  if (!carpetaLocalNecesitaConfirmacion(motivo, hist)) return 'seguir';",
      "  if (bd.estado === 'existente') return 'seguir'; // REVERSIÓN P22-C: se abre lo que haya\n  if (!carpetaLocalNecesitaConfirmacion(motivo, hist)) return 'seguir';", 1),
  },
  {
    id: 'D-marca-no-frena',
    que: 'la marca histórica deja de impedir que se cree una base de datos local vacía',
    tumba: [/^P22-7d /, /^P22-16e /],
    electron: ['C-vacia-esc'],
    hacer: () => cambiar(MAIN,
      '    const hist = huboUbicacionPersonalizada();\n    if (hist.si) {\n      return {\n        crear: false,\n        historicaConocida: true,',
      '    const hist = { si: false }; // REVERSIÓN P22-D: la marca deja de contar\n    if (hist.si) {\n      return {\n        crear: false,\n        historicaConocida: true,', 1),
  },
  {
    id: 'E-temporal-apaga-proteccion',
    que: 'la sesión local temporal vuelve a desactivar la protección de apagado',
    tumba: [/^P22-10 /],
    electron: ['A-local'],
    hacer: () => cambiar(MAIN,
      '  if (sesionLocalTemporal) return;',
      '  // REVERSIÓN P22-E: la sesión temporal vuelve a sincronizar la protección\n', 1),
  },
  {
    id: 'F-invalida-como-ausente',
    que: 'un archivo local inválido (0 bytes o que no es SQLite) vuelve a contar como «no hay base de datos»',
    tumba: [/^P22-13 /, /^P22-14 /, /^P22-14b /, /^P22-13b /, /^P22-14b? …/],
    electron: ['cero-bytes'],
    hacer: () => cambiar(MAIN,
      "  if (st.size === 0) return { estado: 'invalida', motivo: 'el archivo está vacío (0 bytes)', size: 0, mtime: st.mtimeMs };",
      "  if (st.size === 0) return { estado: 'ausente' }; // REVERSIÓN P22-F", 1)
      .split("    return { estado: 'invalida', motivo: 'el archivo no empieza por la cabecera de una base de datos SQLite', size: st.size, mtime: st.mtimeMs };")
      .join("    return { estado: 'ausente' }; // REVERSIÓN P22-F"),
  },
  {
    id: 'G-marca-falla-en-silencio',
    que: 'el fallo al persistir la marca vuelve a ser silencioso (y su ausencia vuelve a parecer una instalación nueva)',
    tumba: [/^P22-16 /, /^P22-16b /, /^P22-16c /, /^P22-16e /],
    electron: [],
    hacer: () => cambiar(MAIN,
      '  const g = guardarHistorialUbicacion(j);\n  if (!g.ok) {\n    historialUbicacionDegradado = { motivo: g.motivo };\n    appLog(`ERROR PS-1024 — no se pudo dejar constancia de la ubicación de datos propia: ${g.motivo}`);\n    return g;\n  }',
      '  const g = guardarHistorialUbicacion(j); // REVERSIÓN P22-G: si falla, no se dice nada', 1),
  },
];

if (require.main === module) {
  fs.rmSync(SALIDA, { recursive: true, force: true });
  for (const fam of FAMILIAS) {
    const src = fam.hacer();
    if (src === MAIN) throw new Error('la reversión no cambia nada: ' + fam.id);
    const dir = path.join(SALIDA, fam.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'main.js'), src, 'utf8');
    console.log(`  ${fam.id.padEnd(30)} ${fam.que}`);
  }
}
module.exports = { FAMILIAS, SALIDA };
