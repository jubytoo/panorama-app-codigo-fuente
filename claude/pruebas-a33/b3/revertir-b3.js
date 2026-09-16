'use strict';
// ---------------------------------------------------------------------------
// Reversiones de B3, sobre los archivos PRODUCTIVOS. Cada una quita UNA de las
// defensas y escribe una copia en `revertidos/`, para relanzar la bateria
// apuntando a ella. Una prueba que tambien pasa contra el codigo anterior no
// demuestra nada.
//
//   V-cifrado-en-claro  : vuelve el fallback silencioso a texto plano.
//   W-directorio-mudo   : el guardado fallido vuelve a ser solo console.warn.
//   X-historial-mudo    : el historial deja de pintar el aviso + Reintentar.
//   W2-ignora-el-valor  : saveState vuelve a ignorar el `false` de storageSet.
//   Y-limpieza-muda     : los dos catch de limpieza vuelven a estar vacios.
//   Y2-rutas-en-el-log  : el motivo del error vuelve a ir en crudo, con la ruta.
//   Z-openpath-consola  : openPathLogged vuelve a depender solo de console.
//
// Y y Z van separadas a proposito: son dos defensas independientes dentro de
// main.js, y una reversion conjunta no diria CUAL de las dos detecta cada
// prueba.
//
// NO toca produccion: solo lee los archivos reales y escribe copias.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const F = {
  main: path.join(PROJ, 'main.js'),
  dashboard: path.join(PROJ, 'dashboard', 'plantilla_dashboard.html'),
  directorio: path.join(PROJ, 'directorio', 'plantilla_directorio.html'),
  prep: path.join(PROJ, 'preparacion-reunion', 'plantilla_preparacion_reunion.html'),
};
// Variable de entorno por la que la bateria leera la copia revertida.
const ENV = {
  main: 'PANORAMA_MAIN', dashboard: 'PANORAMA_DASHBOARD',
  directorio: 'PANORAMA_DIRECTORIO', prep: 'PANORAMA_PREP',
};
const EXT = { main: '.js', dashboard: '.html', directorio: '.html', prep: '.html' };

// Sustitucion por ANCLAS, no por bloque literal: los archivos llevan acentos
// y comentarios largos, y una coincidencia literal se rompe por un espacio.
// Ambas anclas deben aparecer EXACTAMENTE una vez, o la reversion se declara
// imposible en vez de producir un archivo silenciosamente mal cortado.
function reemplazarEntre(src, desde, hasta, nuevo) {
  if (src.split(desde).length - 1 !== 1) throw new Error('ancla inicial no unica: ' + desde.slice(0, 60));
  if (src.split(hasta).length - 1 !== 1) throw new Error('ancla final no unica: ' + hasta.slice(0, 60));
  const i = src.indexOf(desde);
  const j = src.indexOf(hasta, i);
  if (j < i) throw new Error('las anclas estan en orden inverso');
  return src.slice(0, i) + nuevo + src.slice(j);
}

const REVERSIONES = [
  {
    id: 'V-cifrado-en-claro', archivo: 'dashboard',
    desc: 'si el cifrado falla se vuelve a escribir el backup EN CLARO, con un console.warn',
    espera: 'B3-C1b, B3-C1c, B3-C1d, B3-C1e, B3-C1f y B3-D [C] cifrado-backup-carpeta',
    aplicar: (s) => reemplazarEntre(s,
      'try{ payload = await encryptBackupPayload(rawPayload, backupEncryptionPassword, nowDate.toISOString()); }',
      'const fileHandle = await backupDirHandle.getFileHandle(backupFileName(nowDate), { create:true });',
      'try{ payload = await encryptBackupPayload(rawPayload, backupEncryptionPassword, nowDate.toISOString()); }\n' +
      "      catch(e){ console.warn('Fallo al cifrar el backup, se guarda sin cifrar esta vez:', e); }\n" +
      '    }\n    '),
  },
  {
    id: 'W-directorio-mudo', archivo: 'directorio',
    desc: 'el guardado fallido del Directorio vuelve a ser un console.warn invisible',
    espera: 'B3-C2b, B3-C2c, B3-C2d, B3-C2h y B3-D [C] guardado-directorio',
    aplicar: (s) => reemplazarEntre(s,
      'function marcarGuardadoFallido(e){',
      'function marcarGuardadoOk(){',
      'function marcarGuardadoFallido(e){\n' +
      "  console.warn('Error al guardar', e);\n" +
      '}\n'),
  },
  {
    id: 'W2-ignora-el-valor', archivo: 'directorio',
    desc: 'saveState vuelve a ignorar el false de storageSet: dira "Guardado" sin haber guardado',
    espera: 'B3-C2j',
    aplicar: (s) => reemplazarEntre(s,
      'const guardado = await storageSet(STORAGE_KEY, raw);',
      '}catch(e){\n      marcarGuardadoFallido(e);',
      'await storageSet(STORAGE_KEY, raw);\n      marcarGuardadoOk();\n    '),
  },
  {
    id: 'X-historial-mudo', archivo: 'prep',
    desc: 'el historial deja de pintar el aviso de fallo y el boton Reintentar',
    espera: 'B3-C3a, B3-C3b, B3-C3d y B3-D [D] historial-reunion',
    aplicar: (s) => reemplazarEntre(s,
      'function saveStatusHtml(){',
      '// Guarda (o actualiza)',
      'function saveStatusHtml(){\n' +
      "  if(state.saveHistoryStatus === 'saving') return '<span class=\"save-status saving\">Guardando...</span>';\n" +
      "  if(state.saveHistoryStatus === 'ok') return '<span class=\"save-status ok\">Guardado en el historial</span>';\n" +
      "  return '';\n" +
      '}\n\n'),
  },
  {
    id: 'Y-limpieza-muda', archivo: 'main',
    desc: 'borrar un journal resuelto y soltar la exclusiva vuelven a tragarse el fallo',
    espera: 'B3-E2, B3-E5, B3-S4 y B3-D [B] cleanup-journal',
    aplicar: (s) => reemplazarEntre(s,
      'function borrarJournalResuelto(ruta, que) {',
      'async function openAppLog(parentWin) {',
      'function borrarJournalResuelto(ruta, que) {\n' +
      '  try { fs.unlinkSync(ruta); } catch (e) {}\n' +
      '}\n' +
      'function soltarExclusivaConRastro(token, que) {\n' +
      '  try { dbmod.soltarExclusiva(token); } catch (e) {}\n' +
      '}\n\n'),
  },
  {
    id: 'Y2-rutas-en-el-log', archivo: 'main',
    desc: 'el motivo del error vuelve a ir en crudo: la ruta completa acaba otra vez en app.log',
    espera: 'B3-S8a (la prueba funcional del saneador, con el mensaje real de Windows)',
    aplicar: (s) => reemplazarEntre(s,
      'function motivoSinRutas(e) {',
      'function borrarJournalResuelto(ruta, que) {',
      'function motivoSinRutas(e) {\n' +
      "  return String((e && e.message) || e || '');\n" +
      '}\n\n'),
  },
  {
    id: 'Z-openpath-consola', archivo: 'main',
    desc: 'openPathLogged pierde su linea en app.log y vuelve a depender solo de console',
    espera: 'B3-S3 y B3-D [B] abrir-en-explorador',
    aplicar: (s) => reemplazarEntre(s,
      'return shell.openPath(targetPath).then((err) => {',
      'console.warn(`No se pudo abrir "${targetPath}" con shell.openPath:`, err);',
      'return shell.openPath(targetPath).then((err) => {\n    if (err) {\n      '),
  },
];

const dirOut = path.join(__dirname, 'revertidos');
fs.rmSync(dirOut, { recursive: true, force: true });
fs.mkdirSync(dirOut, { recursive: true });

console.log('REVERSIONES DE B3');
let malos = 0;
for (const r of REVERSIONES) {
  const src = fs.readFileSync(F[r.archivo], 'utf8');
  let out;
  try { out = r.aplicar(src); } catch (e) {
    malos++; console.log(`  [NO SE PUDO] ${r.id}: ${e.message}`); continue;
  }
  if (out === src) { malos++; console.log(`  [NO SE PUDO] ${r.id}: la sustitucion no cambio nada`); continue; }
  const destino = path.join(dirOut, r.id + EXT[r.archivo]);
  fs.writeFileSync(destino, out, 'utf8');
  console.log(`  [LISTA] ${r.id}   (${r.archivo})`);
  console.log(`          ${r.desc}`);
  console.log(`          deberia romper: ${r.espera}`);
  console.log(`          lanzar con: $env:${ENV[r.archivo]}="${destino}"`);
}
process.exit(malos === 0 ? 0 : 1);
