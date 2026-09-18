'use strict';
// ---------------------------------------------------------------------------
// P9 — REVERSIONES. Cada familia deshace UNA decisión de P9 y anuncia qué
// aserciones de `test-p9-location.js` tiene que tumbar (y solo esas).
//
//   A..E son las cinco pedidas; F y G cubren las dos capas que las anteriores
//   no tocan (rescate PS-1007 y guarda de la protección de apagado).
//   A, B, C, D y E se arrancan además en Electron (`electron-p9-revertido.ps1`).
//
// Escribe las copias en `p9/revertidos/<familia>/main.js`. NO toca producción.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const SALIDA = path.join(__dirname, 'revertidos');
const MAIN = fs.readFileSync(path.join(PROJ, 'main.js'), 'utf8');

// Sustituye TODAS las apariciones de una cadena (y exige cuántas hay).
function cambiar(src, busca, pone, veces) {
  const n = src.split(busca).length - 1;
  if (n === 0) throw new Error('NO SE ENCONTRO: ' + busca.slice(0, 80));
  if (veces !== undefined && n !== veces) throw new Error(`se esperaban ${veces} apariciones y hay ${n}: ${busca.slice(0, 60)}`);
  return src.split(busca).join(pone);
}

const PARADA = '  if (configUbicacionNoResuelta) {\n    detenerArranquePorConfigUbicacion();';
const GUARDA_DECISION = '  if (configUbicacionNoResuelta) {\n    return {\n      crear: false,';

const FAMILIAS = [
  {
    id: 'A-bom-no-se-quita',
    que: 'el BOM UTF-8 deja de quitarse: un archivo con BOM vuelve a no leerse (ahora cae CERRADO)',
    tumba: [/^P9-2 /, /^P9-13 con BOM \(válido, compartida\) y protección inactiva/, /^P9-14 con BOM/],
    electron: ['residuo/bom'],
    hacer: () => cambiar(MAIN, '      desde = 3;\n', '      desde = 0; // REVERSIÓN P9-A: el BOM UTF-8 ya no se quita\n', 1),
  },
  {
    id: 'B-invalido-como-ausente',
    que: 'inválido/ilegible vuelve a tratarse como «sin archivo»: reaparece la vuelta silenciosa a la carpeta local',
    tumba: [/^P9-(4|5|6|7|8|9) .*queda «NO RESUELTA»/, /^P9-9 archivo presente pero ilegible/, /^P9-1[12] /,
      /^P9-13 .*(ACTIVA: no se desactiva|SIN señales de vida)/, /^P9-S(4|5|6|7|8|9|10) /],
    electron: ['residuoreal/bom-doble', 'limpia/bom-doble', 'guard/bom-doble'],
    hacer: () => cambiar(MAIN, '    configUbicacionNoResuelta = { estado: cfg.estado, motivo: cfg.motivo };\n',
      '    // REVERSIÓN P9-B: inválido se trata como ausente\n', 1),
  },
  {
    id: 'C-sin-ruta-absoluta',
    que: 'se quita la validación de ruta absoluta: vuelve el mkdir relativo (y la excepción de setPath)',
    tumba: [/^P9-8 /, /^P9-12 relativa/, /^P9-13 ruta relativa \+ protección (INACTIVA|activa SIN)/, /^P9-14 ruta relativa/],
    electron: ['residuo/relativa'],
    hacer: () => cambiar(MAIN,
      "  if (!conUnidad && !unc) {\n    return { estado: 'invalido', motivo: '\"userDataDir\" no es una ruta absoluta con letra de unidad o de red' };\n  }\n",
      '  // REVERSIÓN P9-C: sin validación de ruta absoluta\n', 1),
  },
  {
    id: 'D-crea-local',
    que: 'se permite crear una BD local ante una config inválida (si la carpeta local está vacía, no se para; y la decisión deja de negarse)',
    tumba: [/^P9-S[123] /, /^P9-1[12] /],
    electron: ['limpia/bom-doble', 'residuoreal/bom-doble'],
    hacer: () => cambiar(cambiar(MAIN, PARADA,
      "  if (configUbicacionNoResuelta && (restosEnCarpetaDeDatos(app.getPath('userData')) || []).length) { // REVERSIÓN P9-D\n    detenerArranquePorConfigUbicacion();", 1),
      GUARDA_DECISION, '  if (false && configUbicacionNoResuelta) { // REVERSIÓN P9-D\n    return {\n      crear: false,', 1),
  },
  {
    id: 'E-abre-residuo',
    que: 'se abre la BD local existente ante una config inválida (la parada solo actúa si la carpeta local está vacía)',
    tumba: [/^P9-S[123] /],
    electron: ['residuoreal/bom-doble', 'limpia/bom-doble'],
    hacer: () => cambiar(MAIN, PARADA,
      "  if (configUbicacionNoResuelta && !(restosEnCarpetaDeDatos(app.getPath('userData')) || []).length) { // REVERSIÓN P9-E\n    detenerArranquePorConfigUbicacion();", 1),
  },
  {
    id: 'F-rescate-por-defecto',
    que: 'el rescate PS-1007 vuelve a buscar copias de app.asar en la carpeta por defecto ante una config inválida',
    tumba: [/^P9-14 (BOM duplicado|JSON truncado|ruta relativa|ANSI cp1252|archivo ilegible)/],
    electron: [],
    hacer: () => cambiar(MAIN, "    if (cfg.estado !== 'valido') return null;\n",
      "    if (cfg.estado !== 'valido') return app.getPath('userData'); // REVERSIÓN P9-F\n", 1),
  },
  {
    id: 'G-proteccion-sin-guarda',
    que: 'la sincronización de la protección de apagado pierde su guarda (segunda capa)',
    tumba: [/^P9-13 (BOM duplicado|JSON truncado|ruta relativa|vacío) \+ protección (ACTIVA|activa SIN)/, /^P9-13 la guarda va ANTES/],
    electron: [],
    // 18 sept 2026: el ancla antigua («…return;\n  const shouldBeOn») dejó de
    // existir en P22 (2952711), que puso su propia guarda y comentarios entre
    // medias; desde entonces este script reventaba antes de generar G. Misma
    // intención: quitar SOLO la guarda de P9.
    hacer: () => cambiar(MAIN, '  if (configUbicacionNoResuelta) return;\n  // P22: una sesión LOCAL TEMPORAL',
      '  // REVERSIÓN P9-G: sin guarda\n  // P22: una sesión LOCAL TEMPORAL', 1),
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
    console.log(`  ${fam.id.padEnd(26)} ${fam.que}`);
  }
}
module.exports = { FAMILIAS, SALIDA };
