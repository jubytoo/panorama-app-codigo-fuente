'use strict';
// ---------------------------------------------------------------------------
// Comprueba que cada correccion del helper es la que hace pasar su prueba.
// Revierte UNA correccion cada vez sobre una COPIA y deja la bateria a mano
// para ejecutarla con PANORAMA_BORRADOS apuntando a esa copia.
//
// Una prueba que tambien pasa contra el codigo anterior no demuestra nada.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');

const ORIG = path.join(__dirname, 'borrados.js');
const SRC = fs.readFileSync(ORIG, 'utf8');

const REVERSIONES = [
  {
    id: 'A-ocupacion-asimetrica',
    espera: 'DEL-X1',
    desc: 'ocupacionComun vuelve a mirar solo "el recurso contiene al que pregunta"',
    de: `  function conflicto(r, ambito) {
    if (cubre(r, ambito.ruta)) return true;
    if (ambito.scope === 'subtree' && estaDentroDe(r.origen, ambito.ruta)) return true;
    return false;
  }`,
    a: `  function conflicto(r, ambito) {
    return cubre(r, ambito.ruta);
  }`,
  },
  {
    id: 'B-f1-ignora-journal-ilegible',
    espera: 'DEL-JOURNAL-SCHEMA truncado',
    desc: 'f1Global vuelve a bloquear solo con journals "incompleto" de writer identificable',
    de: `      // CUALQUIER journal de borrado que no se pueda interpretar bloquea, no
      // solo los que se identifican como nuestros. Si esta truncado o ilegible
      // NO se puede leer el \`writer\`, asi que no se puede descartar que sea
      // nuestro — y un borrado pendiente sin resolver es peor que un guardado.
      // Evidencia incompleta no es estado ausente.
      return {
        libre: false, clase: 'no-demostrable', ruta: e.ruta,
        motivo: \`journal de borrado \${e.clase}\` +
          (e.writerDeclarado === yo ? ' (propio)' : ' (writer no identificable)') + \`: \${e.motivo}\`,
      };`,
    a: `      if (e.clase === 'incompleto' && e.writerDeclarado === yo) {
        return { libre: false, clase: 'no-demostrable', motivo: 'journal de borrado propio incompleto', ruta: e.ruta };
      }
      continue;`,
  },
  {
    id: 'C-no-clobber-fuera',
    espera: 'DEL-ROLLBACK-NO-CLOBBER / B7 / B9',
    desc: 'reponerRecurso vuelve a confiar en que el rename falle si el destino existe',
    de: `    if (existeRuta(r.origen)) {
      appLog(\`Borrado — NO-CLOBBER: "\${r.origen}" ha reaparecido; no se repone y no se destruye nada.\`);
      return { estado: 'destino-ocupado', origen: r.origen, cuarentena: r.cuarentena };
    }`,
    a: `    // (NO-CLOBBER revertido a proposito)`,
  },
];

const dirOut = path.join(__dirname, 'revertidos');
fs.rmSync(dirOut, { recursive: true, force: true });
fs.mkdirSync(dirOut, { recursive: true });

console.log('REVERSIONES DEL HELPER DE BORRADOS');
let malos = 0;
for (const r of REVERSIONES) {
  const veces = SRC.split(r.de).length - 1;
  if (veces !== 1) {
    malos++;
    console.log(`  [NO SE PUDO] ${r.id}: el fragmento aparece ${veces} veces`);
    continue;
  }
  const destino = path.join(dirOut, r.id + '.js');
  fs.writeFileSync(destino, SRC.replace(r.de, r.a), 'utf8');
  console.log(`  [LISTA] ${r.id}`);
  console.log(`          ${r.desc}`);
  console.log(`          deberia romper: ${r.espera}`);
  console.log(`          ${destino}`);
}
process.exit(malos === 0 ? 0 : 1);
