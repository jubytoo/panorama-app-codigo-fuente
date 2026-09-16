'use strict';
// Sustituye las guardas por-canal por la UNICA funcion proyectoBloqueadoParaMutar().
// Cada sustitucion se verifica: si un ancla no aparece exactamente una vez, se
// aborta sin escribir nada.
const fs = require('fs');
const MAIN = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1\\main.js';
let t = fs.readFileSync(MAIN, 'utf8');
const antes = t.length;

const GUARDA_ACCION =
  '  // A3.3/BLOQUE 5 + A2: una sola barrera por proyecto (borrado o restauracion).\n' +
  '  { const b = proyectoBloqueadoParaMutar(projectId); if (b) return accionNoAplicada(b.mensaje, false, ); }';
// `accionNoAplicada` solo acepta (error, reintentable): se ajusta abajo.

const SUSTITUCIONES = [
  // backup:save -- tenia DOS guardas separadas (borrado y restauracion)
  [
    "  // A3.3/BLOQUE 5: mientras se retira el proyecto, ninguna escritura suya empieza.\n" +
    "  if (proyectoBloqueadoPorBorrado(projectId)) return noAplicado('Este proyecto se está eliminando; no se ha guardado nada.', false);",
    "  // A3.3/BLOQUE 5 + A2: UNA sola barrera por proyecto — borrado o restauración.\n" +
    "  { const b = proyectoBloqueadoParaMutar(projectId); if (b) return noAplicado(b.mensaje, b.motivo === 'proyecto-en-restauracion'); }",
  ],
  [
    "  if (restoreInProgress.has(projectId)) return noAplicado('Se está restaurando un backup de este proyecto ahora mismo.', true);",
    "  // (la barrera de arriba ya cubre la restauración; esta línea se conserva\n" +
    "  //  solo como red por si alguien añade un camino nuevo por encima)\n" +
    "  if (proyectoEnRestauracion(projectId)) return noAplicado('Se está restaurando un backup de este proyecto ahora mismo.', true);",
  ],
  // meeting:savePrep / meeting:updatePrep / candidateEval:save
  [
    "  // A3.3/BLOQUE 5: mientras se retira el proyecto, ninguna escritura suya empieza.\n" +
    "  if (proyectoBloqueadoPorBorrado(projectId)) return accionNoAplicada('Este proyecto se está eliminando; no se ha guardado nada.', false);",
    "  // A3.3/BLOQUE 5 + A2: UNA sola barrera por proyecto — borrado o restauración.\n" +
    "  { const b = proyectoBloqueadoParaMutar(projectId); if (b) return accionNoAplicada(b.mensaje, b.motivo === 'proyecto-en-restauracion'); }",
    3,
  ],
  // candidateEval:pickCv / removeCv
  [
    "  // A3.3/BLOQUE 5: mientras se retira el proyecto, no se copian archivos suyos.\n" +
    "  if (proyectoBloqueadoPorBorrado(projectId)) return { ok: false, error: 'Este proyecto se está eliminando; no se ha tocado nada.' };",
    "  // A3.3/BLOQUE 5 + A2: UNA sola barrera por proyecto — borrado o restauración.\n" +
    "  { const b = proyectoBloqueadoParaMutar(projectId); if (b) return { ok: false, error: b.mensaje }; }",
  ],
  [
    "  // A3.3/BLOQUE 5: mientras se retira el proyecto, no se borran archivos suyos.\n" +
    "  if (proyectoBloqueadoPorBorrado(projectId)) return { ok: false, error: 'Este proyecto se está eliminando; no se ha tocado nada.' };",
    "  // A3.3/BLOQUE 5 + A2: UNA sola barrera por proyecto — borrado o restauración.\n" +
    "  { const b = proyectoBloqueadoParaMutar(projectId); if (b) return { ok: false, error: b.mensaje }; }",
  ],
  // meeting:deletePrep
  [
    "  if (proyectoBloqueadoPorBorrado(projectId)) {\n" +
    "    return { ok: false, aplicado: false, reintentable: false, error: 'Este proyecto se está eliminando; no se ha borrado nada.' };\n" +
    "  }",
    "  // A3.3/BLOQUE 5 + A2: UNA sola barrera por proyecto — borrado o restauración.\n" +
    "  {\n" +
    "    const b = proyectoBloqueadoParaMutar(projectId);\n" +
    "    if (b) return { ok: false, aplicado: false, reintentable: b.motivo === 'proyecto-en-restauracion', error: b.mensaje };\n" +
    "  }",
  ],
  // deleteProjectById: simetria restore -> delete no empieza
  [
    "  if (proyectosEnBorrado.has(id)) {\n" +
    "    return { ok: false, aplicado: false, reintentable: true, error: 'Ese proyecto ya se está eliminando.' };\n" +
    "  }",
    "  // A2: la simetría. Un proyecto no puede estar a la vez en borrado y en\n" +
    "  // restauración: el que llegue segundo no empieza.\n" +
    "  {\n" +
    "    const b = proyectoBloqueadoParaMutar(id);\n" +
    "    if (b) return { ok: false, aplicado: false, reintentable: true, error: b.motivo === 'proyecto-en-borrado' ? 'Ese proyecto ya se está eliminando.' : b.mensaje, bloqueo: b.motivo };\n" +
    "  }",
  ],
  // openProjectWindow: la reapertura tambien queda bloqueada durante el restore
  [
    "  if (proyectoBloqueadoPorBorrado(row.id)) {\n" +
    "    appLog(`Se ha intentado abrir el proyecto ${row.id} mientras se elimina; no se abre.`);\n" +
    "    return null;\n" +
    "  }",
    "  // A2: durante una RESTAURACIÓN tampoco puede reabrirse: escribiría en la\n" +
    "  // partición que se está reemplazando. La reapertura legítima la hace la\n" +
    "  // propia restauración al terminar, cuando ya ha desarmado la barrera.\n" +
    "  {\n" +
    "    const b = proyectoBloqueadoParaMutar(row.id);\n" +
    "    if (b) {\n" +
    "      appLog(`Se ha intentado abrir el proyecto ${row.id} mientras está ${b.motivo}; no se abre.`);\n" +
    "      return null;\n" +
    "    }\n" +
    "  }",
  ],
];

void GUARDA_ACCION;
for (const [viejo, nuevo, nEsperado] of SUSTITUCIONES) {
  const n = t.split(viejo).length - 1;
  const esperado = nEsperado || 1;
  if (n !== esperado) {
    console.error(`ABORTADO: el ancla aparece ${n} veces (esperadas ${esperado}):\n${viejo.slice(0, 90)}`);
    process.exit(2);
  }
  t = t.split(viejo).join(nuevo);
  console.log(`  sustituido x${n}: ${viejo.trim().slice(0, 70).replace(/\n/g, ' ')}…`);
}

fs.writeFileSync(MAIN, t, 'utf8');
console.log(`\n  main.js: ${antes} -> ${t.length} bytes`);
const quedan = (t.match(/proyectoBloqueadoPorBorrado\(/g) || []).length;
console.log(`  llamadas a proyectoBloqueadoPorBorrado que quedan: ${quedan} (solo la definición y su uso dentro de proyectoBloqueadoParaMutar)`);
