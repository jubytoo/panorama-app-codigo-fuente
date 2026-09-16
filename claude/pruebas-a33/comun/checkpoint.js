'use strict';
// Checkpoint verificable de los archivos productivos del Bloque 5.
// Escribe claude/checkpoint-bloque5-2026-09-15.md y deja una copia ACTUAL de
// cada archivo. No deshace nada: solo deja el estado anterior y el actual
// localizables por hash.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const COPIA = 'C:\\Codigo Fuente PS - copia\\panorama-app-codigo-fuente_1';
const CL = path.join(PROJ, 'claude');
const SUF_PRE = '.ANTES-BLOQUE5-CABLEADO-2026-09-15';
const SUF_ACT = '.ACTUAL-BLOQUE5-CABLEADO-2026-09-15';

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').toUpperCase();

// Marcas inequivocas del Bloque 5 en cada archivo, para comprobar que el PRE
// NO las tiene y el ACTUAL SI.
const ARCHIVOS = [
  { ruta: 'main.js', pre: 'main.js' + SUF_PRE, origen: 'snapshot previo (creado antes de editar)', marca: 'BORRADOS_DIR_NAME' },
  { ruta: 'preload.js', pre: 'preload.js' + SUF_PRE, origen: 'snapshot previo (creado antes de editar)', marca: "invokeAccion('meeting:deletePrep'" },
  { ruta: 'preload-launcher.js', pre: 'preload-launcher.js' + SUF_PRE, origen: 'PRE reconstruido desde C:\\Codigo Fuente PS - copia', copia: 'preload-launcher.js', marca: "invokeAccion('projects:delete'" },
  { ruta: 'launcher\\renderer.js', pre: 'renderer.js' + SUF_PRE, origen: 'PRE reconstruido desde C:\\Codigo Fuente PS - copia', copia: 'launcher\\renderer.js', marca: 'res.aplicado !== true' },
  { ruta: 'preparacion-reunion\\plantilla_preparacion_reunion.html', pre: 'plantilla_preparacion_reunion.html' + SUF_PRE, origen: 'snapshot previo (creado antes de editar)', marca: 'result.aplicado !== true' },
  { ruta: 'evaluacion-candidatos\\plantilla_evaluacion_candidatos.html', pre: 'plantilla_evaluacion_candidatos.html' + SUF_PRE, origen: 'snapshot previo (creado antes de editar)', marca: 'CONTRATO_SESION_DETENIDA' },
];

let malos = 0;
const filas = [];
for (const a of ARCHIVOS) {
  const act = path.join(PROJ, a.ruta);
  const pre = path.join(CL, a.pre);
  if (!fs.existsSync(pre)) { malos++; console.log('  FALTA EL PRE: ' + a.pre); continue; }

  const txtPre = fs.readFileSync(pre, 'utf8');
  const txtAct = fs.readFileSync(act, 'utf8');
  const preLimpio = !txtPre.includes(a.marca);
  const actTiene = txtAct.includes(a.marca);
  if (!preLimpio || !actTiene) { malos++; }

  // Copia ACTUAL
  const dst = path.join(CL, path.basename(a.ruta) + SUF_ACT);
  if (!fs.existsSync(dst)) fs.copyFileSync(act, dst);

  // Si el PRE viene de la copia, comprobar que la copia sigue sin el cambio.
  let notaCopia = '';
  if (a.copia) {
    const o = path.join(COPIA, a.copia);
    const existe = fs.existsSync(o);
    const igual = existe && sha(o) === sha(pre);
    const limpia = existe && !fs.readFileSync(o, 'utf8').includes(a.marca);
    notaCopia = ` · copia origen: ${existe ? 'presente' : 'AUSENTE'}, hash ${igual ? 'coincide' : 'NO COINCIDE'}, sin cambios del Bloque 5: ${limpia}`;
    if (!existe || !igual || !limpia) malos++;
  }

  filas.push({
    ruta: a.ruta, shaPre: sha(pre), shaAct: sha(act), origen: a.origen,
    snapshotPre: a.pre, snapshotAct: path.basename(dst),
    marca: a.marca, preLimpio, actTiene, notaCopia,
  });
  console.log(`  ${a.ruta}`);
  console.log(`      PRE  ${sha(pre).slice(0, 16)}  ${a.pre}`);
  console.log(`      ACT  ${sha(act).slice(0, 16)}  (marca "${a.marca}": PRE=${preLimpio ? 'ausente' : 'PRESENTE!'} ACTUAL=${actTiene ? 'presente' : 'AUSENTE!'})${notaCopia}`);
}

const md = [
  '# Checkpoint — cableado productivo del Bloque 5 (A3.3)',
  '',
  '**Fecha:** 2026-09-15. Generado por `scratchpad/comun/checkpoint.js`.',
  '',
  'Cierre documental de un fallo de proceso: `preload-launcher.js` y',
  '`launcher/renderer.js` se modificaron **sin haber creado antes** su punto de',
  'restauración. Los otros cuatro sí lo tenían. Aquí quedan los seis, con el',
  'estado previo y el actual localizables por hash, para poder volver exactamente',
  'al estado anterior si un arranque revela una regresión. **No se ha deshecho',
  'nada.**',
  '',
  'Los snapshots viven en `claude/`, con sufijo `.ANTES-BLOQUE5-CABLEADO-2026-09-15`',
  'y `.ACTUAL-BLOQUE5-CABLEADO-2026-09-15`.',
  '',
  '| Archivo | SHA-256 PRE-BLOQUE5 | SHA-256 ACTUAL | Origen del PRE |',
  '|---|---|---|---|',
].concat(filas.map((f) =>
  `| \`${f.ruta}\` | \`${f.shaPre}\` | \`${f.shaAct}\` | ${f.origen} — \`${f.snapshotPre}\` |`
)).concat([
  '',
  '## Comprobación de que cada PRE es realmente anterior al Bloque 5',
  '',
  'Por cada archivo se verifica una marca textual inequívoca del cableado: tiene',
  'que estar **ausente** en el PRE y **presente** en el actual.',
  '',
  '| Archivo | Marca comprobada | En el PRE | En el actual |',
  '|---|---|---|---|',
]).concat(filas.map((f) =>
  `| \`${path.basename(f.ruta)}\` | \`${f.marca}\` | ${f.preLimpio ? 'ausente ✔' : '**PRESENTE ✘**'} | ${f.actTiene ? 'presente ✔' : '**AUSENTE ✘**'} |`
)).concat([
  '',
  '## Los dos PRE reconstruidos',
  '',
  '`preload-launcher.js` y `launcher/renderer.js` **no tenían snapshot previo**.',
  'Su PRE se reconstruyó desde `C:\\Codigo Fuente PS - copia\\`, que la auditoría',
  'C4 documenta como byte-idéntica al original y que no ha recibido ninguno de',
  'los cambios de A3.3. Se ha verificado en el momento de generar este',
  'checkpoint que esa copia sigue presente, que su hash coincide con el snapshot',
  'guardado y que no contiene ninguna modificación del Bloque 5.',
  '',
  filas.filter((f) => f.notaCopia).map((f) => `- \`${f.ruta}\`:${f.notaCopia}`).join('\n'),
  '',
  '## Regla a partir de aquí',
  '',
  '**Ningún archivo productivo nuevo se modifica sin entrar antes en este',
  'checkpoint.**',
  '',
]).join('\n');

fs.writeFileSync(path.join(CL, 'checkpoint-bloque5-2026-09-15.md'), md, 'utf8');
console.log('\n  checkpoint-bloque5-2026-09-15.md escrito');
console.log(malos === 0 ? '  CHECKPOINT COHERENTE' : '  ' + malos + ' PROBLEMAS');
process.exit(malos === 0 ? 0 : 1);
