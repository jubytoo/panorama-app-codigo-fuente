'use strict';
// ---------------------------------------------------------------------------
// P18 — REVERSIONES. Cada familia deshace UNA garantía de la Fase 1 y anuncia
// qué aserciones de `test-p18-procedencia.js` tiene que tumbar (y solo esas).
//
//   A  el rescate vuelve a elegir la copia heredada `app.asar.bak-*` por nombre
//   B  una operación PREPARADA vuelve a valer como predecesora
//   C  se deja de comprobar que la operación sea de ESTE equipo
//   D  se deja de recalcular el hash de la copia local
//   E  si el app.asar instalado no coincide, se restaura SIN preguntar
//   F  ante dos candidatas, se coge la primera
//   G  el ayudante marca VERIFICADA sin comprobar los hashes
//   H  preparar una operación nueva borra antes las anteriores
//   I  el aviso vuelve a recomendar Restaurar-backup.bat
//
// Escribe las copias en `p18/revertidos/<familia>/main.js`. NO toca producción.
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
    id: 'A-elige-por-nombre',
    que: 'sin predecesora verificable, el rescate vuelve a coger el app.asar.bak-* de nombre más alto de la carpeta de datos',
    // Es el comportamiento de ANTES: si hay una heredada, gana, sin mirar nada
    // más. (La primera versión de esta reversión la ponía detrás del retorno
    // por «registro ausente» y nunca llegaba a ejecutarse: medido y corregido.)
    // Arrastra P18-F6b: el mundo del ayudante tiene una copia heredada y la
    // conducta antigua la prefiere aunque exista una predecesora verificada.
    // No tumba P18-19c: el aviso de «restaurado» nunca nombró el .bat.
    tumba: [/^P18-A2 /, /^P18-2 /, /^P18-11 /, /^P18-13 /, /^P18-14 /, /^P18-19 /, /^P18-19b /, /^P18-F6b /],
    hacer: () => cambiar(MAIN,
      "function analizarRecuperacionAsar(asarInstalado) {\n",
      "function analizarRecuperacionAsar(asarInstalado) {\n  { // REVERSIÓN P18-A: vuelve la copia heredada, por nombre\n    const dH = resolveDataDirForStartupRecovery();\n    const nH = dH ? findLatestAsarBackupForRecovery(dH) : null;\n    if (nH) {\n      const rH = path.join(dH, nH);\n      return { decision: 'auto', motivo: 'heredada', manifiesto: null, rutaCopia: rH, operacion: { operation_id: 'heredada', sha256_anterior: sha256DeArchivo(rH), version_anterior: null } };\n    }\n  }\n", 1),
  },
  {
    id: 'B-acepta-preparada',
    que: 'una operación PREPARADA (nunca confirmada) vuelve a valer como predecesora',
    tumba: [/^P18-6 /, /^P18-15 /],
    hacer: () => cambiar(MAIN,
      "    if (op.estado !== 'verificada') continue; // ni 'preparada' ni 'fallida'",
      "    if (op.estado !== 'verificada' && op.estado !== 'preparada') continue; // REVERSIÓN P18-B\n    if (op.estado === 'preparada' && !op.sha256_nuevo_real) op.sha256_nuevo_real = op.sha256_nuevo_esperado;", 1),
  },
  {
    id: 'C-sin-identidad',
    que: 'se deja de comprobar que la operación la escribiera ESTE equipo',
    tumba: [/^P18-3 /],
    hacer: () => cambiar(MAIN,
      '    if (op.installation_id !== ident.id) continue; // de otro equipo\n',
      '    // REVERSIÓN P18-C: ya no se mira de qué equipo es\n', 1),
  },
  {
    id: 'D-sin-hash-copia',
    que: 'se deja de recalcular el hash de la copia local: una truncada o alterada vuelve a valer',
    tumba: [/^P18-4 /, /^P18-9 /],
    hacer: () => cambiar(MAIN,
      '    if (shaCopia !== op.sha256_anterior) continue; // truncada o alterada',
      '    void shaCopia; // REVERSIÓN P18-D: no se compara', 1)
      .split('    if (op.sha256_copia_local !== op.sha256_anterior) continue;\n').join('    // REVERSIÓN P18-D\n'),
  },
  {
    id: 'E-restaura-sin-preguntar',
    que: 'si el app.asar instalado no coincide (o no se lee), se restaura la predecesora SIN preguntar',
    tumba: [/^P18-5 /, /^P18-17 /, /^P18-17b /, /^P18-17d /, /^P18-18 /, /^P18-18b /, /^P18-F6b /],
    hacer: () => cambiar(MAIN,
      "  Object.assign(r, { decision: 'confirmar', operacion: candidatas[0].op, rutaCopia: candidatas[0].rutaCopia });",
      "  Object.assign(r, { decision: 'auto', operacion: candidatas[0].op, rutaCopia: candidatas[0].rutaCopia }); // REVERSIÓN P18-E", 1),
  },
  {
    id: 'F-ambiguo-coge-el-primero',
    que: 'ante dos candidatas que corresponden al instalado, se coge la primera',
    // Coge de verdad la primera. (La primera versión solo desactivaba esta
    // guarda y la siguiente —«más de una candidata»— seguía fallando cerrado:
    // no reintroducía nada. Medido y corregido.)
    tumba: [/^P18-8 /],
    hacer: () => cambiar(MAIN, '  if (exactas.length > 1) {', '  if (exactas.length > 1) exactas.splice(1); // REVERSIÓN P18-F\n  if (false) {', 1),
  },
  {
    id: 'G-ayudante-no-verifica',
    que: 'el ayudante marca VERIFICADA sin comprobar los hashes del asar instalado ni de la copia',
    // No tumba P18-F5: la decisión de REABRIR se toma aparte, por el hash del instalado.
    tumba: [/^P18-20c /, /^P18-F4 /, /^P18-F6 /, /^P18-F6b /, /^P18-F7 /],
    hacer: () => cambiar(MAIN,
      "  if (!motivo && shaReal !== op.sha256_nuevo_esperado) motivo = 'el app.asar instalado no tiene el hash esperado';\n  if (!motivo && shaCopia !== op.sha256_anterior) motivo = 'la copia local ya no tiene el hash del app.asar anterior';",
      '  motivo = null; // REVERSIÓN P18-G: no se comprueba nada', 1),
  },
  {
    id: 'H-borra-antes',
    que: 'preparar una operación nueva borra ANTES las anteriores y sus copias',
    // Arrastra P18-F6b en cascada: al borrar antes, la predecesora VERIFICADA anterior desaparece.
    tumba: [/^P18-E14 /, /^P18-20c /, /^P18-F6b /],
    hacer: () => cambiar(MAIN,
      '  originalFs.mkdirSync(dir, { recursive: true });\n  try {\n    originalFs.copyFileSync(realAsar, copia); // 3',
      "  originalFs.mkdirSync(dir, { recursive: true });\n  for (const o of j.operaciones) { try { originalFs.unlinkSync(path.join(dir, o.nombre_copia)); } catch (e) {} } // REVERSIÓN P18-H\n  j.operaciones = [];\n  try {\n    originalFs.copyFileSync(realAsar, copia); // 3", 1),
  },
  {
    id: 'I-recomienda-bat',
    que: 'el aviso sin recuperación vuelve a recomendar Restaurar-backup.bat',
    // Arrastra P18-19b: el texto de reinstalación desaparece con el cambio.
    tumba: [/^P18-A6 /, /^P18-19b /, /^P18-19c /],
    hacer: () => cambiar(MAIN,
      "        ').\\n\\nReinstala Panorama del Servicio con su instalador, o aplica un parche soportado. Tus datos no ' +\n        'se han tocado.\\n\\n(código ' +",
      "        ').\\n\\nEjecuta Restaurar-backup.bat (junto a app.asar). Tus datos no ' + // REVERSIÓN P18-I\n        'se han tocado.\\n\\n(código ' +", 1),
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
    console.log(`  ${fam.id.padEnd(28)} ${fam.que}`);
  }
}
module.exports = { FAMILIAS, SALIDA };
