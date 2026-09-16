'use strict';
// ---------------------------------------------------------------------------
// Comprueba que cada proteccion del helper de restauracion es la que hace pasar
// su prueba. Revierte UNA cada vez sobre una COPIA, para ejecutarla con
// PANORAMA_RESTAURACIONES apuntando a esa copia.
//
// Una prueba que tambien pasa contra el codigo anterior no demuestra nada.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const ORIG = path.join(__dirname, 'restauraciones.js');
const SRC = fs.readFileSync(ORIG, 'utf8');

const REVERSIONES = [
  {
    id: 'A-sin-no-clobber',
    espera: 'REST-NO-CLOBBER',
    desc: 'clasificarParticionPorHash deja de detectar el tercer estado',
    de: `    const permitidas = new Set(Array.isArray(j.esperado_claves) ? j.esperado_claves : []);
    for (const k of Object.keys(actual || {})) {
      if (!permitidas.has(k)) return 'ajeno';
    }`,
    a: `    // (deteccion del tercer estado revertida a proposito)`,
  },
  {
    id: 'B-previo-sin-hash',
    espera: 'A10 (foto previa con hash incorrecto)',
    desc: 'leerPrevio deja de validar el hash del archivo contra el journal',
    de: `    if (h.sha !== j.previo_sha256 || h.size !== j.previo_size) {
      return { ok: false, motivo: \`la foto previa no casa con el journal (sha \${h.sha.slice(0, 12)} vs \${j.previo_sha256.slice(0, 12)})\` };
    }`,
    a: `    // (validacion por hash revertida a proposito)`,
  },
  {
    id: 'C-rekey-solo-journal',
    espera: 'REST-REKEY-2',
    desc: 'materialPendiente vuelve a contar solo las carpetas CON journal',
    de: `      if (contenido.length > 0) pendientes.push({ actionId: n, archivos: contenido });`,
    a: `      if (contenido.indexOf('journal.json') >= 0) pendientes.push({ actionId: n, archivos: contenido });`,
  },
  {
    id: 'D-base-antes-del-quiesce',
    espera: 'REST-QUIESCE-BASE',
    desc: 'la base se captura ANTES de cerrar las ventanas',
    de: `      // ---- R0: QUIESCE completo ------------------------------------------
      try {
        await cerrarVentanasDeProyecto(projectId);`,
    a: `      // ---- R0: QUIESCE (con la base capturada ANTES, a proposito) --------
      const baseTemprana = getCommitActual();
      try {
        await cerrarVentanasDeProyecto(projectId);`,
    extra: [[`      const base = getCommitActual();
      if (!base) return noAplicado('La base de datos todavia no tiene identidad.', false);`,
      `      const base = baseTemprana;
      if (!base) return noAplicado('La base de datos todavia no tiene identidad.', false);`]],
  },
  {
    id: 'E-excepcion-escapa',
    espera: 'A1 (corte antes de capturar)',
    desc: 'ejecutarRestauracion vuelve a dejar escapar una excepcion inesperada',
    de: `      appLog(\`ERROR — excepcion inesperada durante la restauracion: \${String((e && e.stack) || e)}\`);`,
    a: `      appLog('ERROR — excepcion inesperada durante la restauracion'); throw e;`,
  },
];

const dirOut = path.join(__dirname, 'revertidos');
fs.rmSync(dirOut, { recursive: true, force: true });
fs.mkdirSync(dirOut, { recursive: true });

console.log('REVERSIONES DEL HELPER DE RESTAURACION');
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
