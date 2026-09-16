'use strict';
// ---------------------------------------------------------------------------
// Reversiones de B1, sobre el main.js PRODUCTIVO. Cada una quita UNA de las
// cuatro correcciones, para relanzar la bateria con PANORAMA_MAIN apuntando a
// la copia. Una prueba que tambien pasa contra el codigo anterior no demuestra
// nada.
//
//   R-sin-memo     : el contexto deja de memoizar -> vuelven las 4 lecturas.
//   S-sin-ruta-pura: el listado vuelve a la ruta que materializa -> mkdir+UPDATE.
//   T-sin-log      : se silencian los avisos -> vuelve el silencio absoluto.
//   U-con-staffing  : se reincorpora computeStaffingRatio -> lectura extra.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const ORIG = process.env.PANORAMA_MAIN_ORIG || path.join(PROJ, 'main.js');
const SRC = fs.readFileSync(ORIG, 'utf8');

const REVERSIONES = [
  {
    id: 'R-sin-memo',
    espera: 'B1-A2, B1-A4, B1-A6, B1-A8 y B1-A4c (vuelven las lecturas repetidas)',
    desc: 'el contexto deja de memoizar: cada helper vuelve a leer el backup por su cuenta',
    de: `function getProjectStateForMeetingPrep(projectId, ctx) {
  if (ctx && ctx.estados.has(projectId)) return ctx.estados.get(projectId);
  const r = leerProjectStateForMeetingPrep(projectId, ctx);
  if (ctx) ctx.estados.set(projectId, r);
  return r;
}`,
    a: `function getProjectStateForMeetingPrep(projectId, ctx) {
  // (memoizacion revertida a proposito)
  return leerProjectStateForMeetingPrep(projectId, ctx);
}`,
    extra: [[`function readCandidateEvalPayloadForProject(row, ctx) {
  if (ctx && ctx.evaluaciones.has(row.id)) return ctx.evaluaciones.get(row.id);
  const r = leerCandidateEvalPayload(row, ctx);
  if (ctx) ctx.evaluaciones.set(row.id, r);
  return r;
}`, `function readCandidateEvalPayloadForProject(row, ctx) {
  // (memoizacion revertida a proposito)
  return leerCandidateEvalPayload(row, ctx);
}`]],
  },
  {
    id: 'S-sin-ruta-pura',
    espera: 'B1-A4b, B1-B3, B1-B4, B1-B5, B1-B7 (vuelven mkdir y UPDATE laterales)',
    desc: 'el listado vuelve a usar la ruta que materializa carpeta y slug',
    de: `    dump = JSON.parse(readBackupPayload(row, bkRow, ctx ? { puro: true } : undefined));`,
    a: `    dump = JSON.parse(readBackupPayload(row, bkRow));   // (ruta pura revertida a proposito)`,
    extra: [[`  const file = ctx ? rutaEvaluacionPura(row) : candidateEvalFileForProject(row);`,
      `  const file = candidateEvalFileForProject(row);   // (ruta pura revertida a proposito)`]],
  },
  {
    id: 'T-sin-log',
    espera: 'todas las B1-C de rastro (vuelve el silencio absoluto)',
    desc: 'los fallos de lectura dejan de registrarse: degradan en silencio, como antes',
    de: `function avisarExtraDegradado(ctx, projectId, recurso, clase, motivo) {
  if (!ctx) return;`,
    a: `function avisarExtraDegradado(ctx, projectId, recurso, clase, motivo) {
  if (true) return;   // (registro revertido a proposito)
  if (!ctx) return;`,
  },
  {
    id: 'U-con-staffing',
    espera: 'B1-A2, B1-D2 y B1-D3 (vuelve la lectura extra y los campos)',
    desc: 'se reincorpora computeStaffingRatio al listado, con su lectura extra del backup',
    de: `  // B1 (15 sept 2026) — AQUÍ SE LLAMABA A \`computeStaffingRatio()\`, y se`,
    a: `  try {
    const staffing = computeStaffingRatio(r.id);   // (retirada revertida a proposito)
    r.staffingActive = staffing ? staffing.active : null;
    r.staffingTotal = staffing ? staffing.total : null;
  } catch (e) {
    r.staffingActive = null;
    r.staffingTotal = null;
  }
  // B1 (15 sept 2026) — AQUÍ SE LLAMABA A \`computeStaffingRatio()\`, y se`,
  },
];

const dirOut = path.join(__dirname, 'revertidos');
fs.rmSync(dirOut, { recursive: true, force: true });
fs.mkdirSync(dirOut, { recursive: true });

console.log('REVERSIONES DE B1');
console.log('  origen: ' + ORIG);
let malos = 0;
for (const r of REVERSIONES) {
  const veces = SRC.split(r.de).length - 1;
  if (veces !== 1) { malos++; console.log(`  [NO SE PUDO] ${r.id}: el fragmento aparece ${veces} veces`); continue; }
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
}
process.exit(malos === 0 ? 0 : 1);
