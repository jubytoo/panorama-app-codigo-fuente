'use strict';
// Comprobacion de sintaxis de los archivos productivos tocados por el cableado.
const fs = require('fs');
const path = require('path');
const P = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const ARCHIVOS = ['main.js', 'preload.js', 'preload-launcher.js', 'preload-backup-picker.js',
  path.join('launcher', 'renderer.js'), path.join('backup-picker', 'renderer.js')];
let malos = 0;
for (const f of ARCHIVOS) {
  try {
    new Function(fs.readFileSync(path.join(P, f), 'utf8'));
    console.log('  OK      ' + f);
  } catch (e) { malos++; console.log('  SINTAXIS ' + f + ': ' + e.message); }
}
// Los arneses Electron reales, que no son parte de produccion pero tampoco
// pueden reventar por sintaxis en mitad de una bateria de 4 minutos.
for (const f of [path.join(__dirname, '..', 'real-run', 'b5.js'), path.join(__dirname, 'plantar-e7.js')]) {
  try {
    new Function(fs.readFileSync(f, 'utf8'));
    console.log('  OK      ' + path.basename(f) + '  (arnes)');
  } catch (e) { malos++; console.log('  SINTAXIS ' + path.basename(f) + ': ' + e.message); }
}
// Las plantillas HTML: se extrae cada <script> sin src y se compila.
for (const h of [path.join('evaluacion-candidatos', 'plantilla_evaluacion_candidatos.html'),
  path.join('preparacion-reunion', 'plantilla_preparacion_reunion.html')]) {
  const src = fs.readFileSync(path.join(P, h), 'utf8');
  const bloques = src.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi) || [];
  let n = 0;
  for (const b of bloques) {
    const cuerpo = b.replace(/^<script[^>]*>/i, '').replace(/<\/script>$/i, '');
    if (!cuerpo.trim()) continue;
    n++;
    try { new Function(cuerpo); } catch (e) { malos++; console.log('  SINTAXIS ' + h + ' bloque ' + n + ': ' + e.message); }
  }
  console.log('  OK      ' + h + '  (' + n + ' bloques <script>)');
}
console.log(malos === 0 ? '\n  SINTAXIS: todo OK' : '\n  SINTAXIS: ' + malos + ' FALLOS');
process.exit(malos === 0 ? 0 : 1);
