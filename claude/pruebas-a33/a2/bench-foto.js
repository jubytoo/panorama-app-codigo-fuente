'use strict';
// ---------------------------------------------------------------------------
// A2 / F2 — coste de la FOTO PREVIA DURABLE.
//
// Lo que F2 anade al camino critico de una restauracion es, exactamente:
//   serializar -> cifrar -> escribir durable (tmp+fsync+rename) -> releer+hash
// y, en la recuperacion, -> descifrar.
//
// La escritura en localStorage en si NO es coste nuevo: ya se hace hoy.
//
// Tamanos: medidos sobre los datos REALES del usuario (solo lectura de
// tamanos). 262 backups: mediana 291 KB, media 388 KB, maximo 1,53 MB. Un
// backup es literalmente JSON.stringify(localStorage entero), asi que es la
// misma cosa que la foto previa. Se anade un caso de 16 MB como sonda de
// margen, no porque el formato real llegue ahi.
// ---------------------------------------------------------------------------
const fsReal = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const MARCA = '_a33-a2-BENCH';
const argBase = (process.argv.find((a) => a.startsWith('--base=')) || '').slice(7);
const RAIZ = argBase ? path.join(argBase, MARCA) : path.join(os.tmpdir(), MARCA);

const GUARDIA = require(path.join(__dirname, '..', 'comun', 'guardia-rutas.js'));
const guardia = GUARDIA.crearGuardia({
  marca: MARCA,
  prohibido: ['bd-panoramaservicio', 'panorama-app\\', 'panorama-app/'],
});
guardia.segura(RAIZ);
fsReal.rmSync(RAIZ, { recursive: true, force: true });
fsReal.mkdirSync(RAIZ, { recursive: true });

const securitymod = require(path.join(PROJ, 'security.js'));

// La escritura durable REAL de main.js, extraida: no se reimplementa.
const SRC = fsReal.readFileSync(path.join(PROJ, 'main.js'), 'utf8');
function extraer(firma) {
  const i = SRC.indexOf(firma);
  if (i < 0) throw new Error('NO SE ENCONTRO: ' + firma);
  let j = SRC.indexOf('{', i), prof = 0;
  for (let k = j; k < SRC.length; k++) {
    if (SRC[k] === '{') prof++;
    else if (SRC[k] === '}') { prof--; if (prof === 0) return SRC.slice(i, k + 1); }
  }
  throw new Error('no delimitado: ' + firma);
}
function lineaConst(n) { const i = SRC.indexOf(n); if (i < 0) throw new Error('falta ' + n); return SRC.slice(i, SRC.indexOf('\n', i) + 1); }
const M = new Function('fs', 'path', 'crypto', 'app', 'appLog',
  lineaConst('const FSYNC_NO_SOPORTADO_REG') + '\n' +
  extraer('function escribirBufferDurable(ruta, buf)') + '\n' +
  extraer('function sha256DeArchivo(p)') + '\n' +
  'return { escribirBufferDurable, sha256DeArchivo };'
)(fsReal, path, crypto, { getPath: () => RAIZ }, () => {});

// Un volcado de localStorage con la pinta real: claves largas y JSON anidado.
function dumpDe(bytesObjetivo) {
  const d = {};
  let n = 0;
  const base = 'panorama_servicio_ib__panorama-servicio-full__proj-';
  while (JSON.stringify(d).length < bytesObjetivo) {
    d[base + (1787659547258 + n)] = JSON.stringify({
      projectTitle: 'Servicio ' + n,
      hitos: Array.from({ length: 40 }, (_, i) => ({ id: 'h' + i, nombre: 'Hito ' + i, fecha: '2026-0' + ((i % 9) + 1) + '-01', estado: 'en curso', notas: 'x'.repeat(60) })),
      riesgos: Array.from({ length: 20 }, (_, i) => ({ id: 'r' + i, texto: 'Riesgo ' + i + ' ' + 'y'.repeat(80) })),
    });
    n++;
  }
  return d;
}

const ms = (t0) => Number(process.hrtime.bigint() - t0) / 1e6;
const CLAVE = securitymod.deriveKey('contrasena-de-prueba', securitymod.newSaltHex());

const REDUCIDO = process.argv.includes('--reducido');
const CASOS = REDUCIDO
  ? [['~300 KB (mediana real)', 300 * 1024], ['~1,5 MB (maximo real)', 1536 * 1024]]
  : [['~300 KB (mediana real)', 300 * 1024], ['~1,5 MB (maximo real)', 1536 * 1024],
    ['~5 MB (margen)', 5 * 1024 * 1024], ['~16 MB (sonda de margen)', 16 * 1024 * 1024]];

console.log('BENCHMARK A2 / F2 — foto previa durable');
console.log('  base:           ' + RAIZ);
console.log('  node:           ' + process.versions.node);
console.log('');
console.log('  CASO                          BYTES   serializar    cifrar   escribir   releer+hash   descifrar   TOTAL');
console.log('  ' + '-'.repeat(108));

const filas = [];
for (const [etq, objetivo] of CASOS) {
  const d = dumpDe(objetivo);
  const destino = path.join(RAIZ, 'previo-' + objetivo + '.enc');

  let t0 = process.hrtime.bigint();
  const plano = JSON.stringify(d);
  const msSer = ms(t0);

  t0 = process.hrtime.bigint();
  const sobre = securitymod.encryptString(CLAVE, plano);
  const msCif = ms(t0);

  t0 = process.hrtime.bigint();
  const g = M.escribirBufferDurable(destino, Buffer.from(sobre, 'utf8'));
  const msEsc = ms(t0);
  if (!g.ok) { console.log('  ' + etq + ': NO SE PUDO ESCRIBIR: ' + g.motivo); continue; }

  t0 = process.hrtime.bigint();
  const h = M.sha256DeArchivo(destino);
  const msHash = ms(t0);

  t0 = process.hrtime.bigint();
  const vuelta = securitymod.decryptString(CLAVE, fsReal.readFileSync(destino, 'utf8'));
  const msDes = ms(t0);

  const bien = vuelta === plano && h.existe;
  const total = msSer + msCif + msEsc + msHash;
  filas.push({ etq, bytes: sobre.length, msSer, msCif, msEsc, msHash, msDes, total, bien });
  console.log('  ' + etq.padEnd(28) +
    (Math.round(sobre.length / 1024) + ' KB').padStart(9) +
    (msSer.toFixed(1) + ' ms').padStart(12) +
    (msCif.toFixed(1) + ' ms').padStart(10) +
    (msEsc.toFixed(1) + ' ms').padStart(11) +
    (msHash.toFixed(1) + ' ms').padStart(14) +
    (msDes.toFixed(1) + ' ms').padStart(12) +
    (total.toFixed(1) + ' ms').padStart(9) +
    (bien ? '' : '   <-- REVISAR'));
  fsReal.rmSync(destino, { force: true });
}

console.log('');
console.log('  TOTAL = lo que F2 anade al camino critico (serializar+cifrar+escribir+hash).');
console.log('  "descifrar" solo se paga en la RECUPERACION, no en el camino feliz.');
console.log('  El fsync se cuenta dentro de "escribir": es escribirBufferDurable de main.js.');
console.log('');
console.log('  LIMITE: mide el sistema de archivos de ESTE PC. No demuestra nada');
console.log('  sobre la sincronizacion de Drive entre equipos.');
fsReal.rmSync(RAIZ, { recursive: true, force: true });
console.log('  carpeta de prueba borrada: ' + !fsReal.existsSync(RAIZ));
