'use strict';
// Genera main.js.PRE-CORRECCIONES revirtiendo EXACTAMENTE las tres
// correcciones de esta ronda, para demostrar que las pruebas nuevas fallan
// contra el codigo anterior. No toca el main.js real.
const fs = require('fs');
const path = require('path');
const SRC = fs.readFileSync('C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1\\main.js', 'utf8');
let t = SRC;
const sust = [];
function rev(etq, nuevo, viejo) {
  if (t.indexOf(nuevo) < 0) { console.log('NO SE ENCONTRO: ' + etq); process.exit(1); }
  t = t.replace(nuevo, viejo);
  sust.push(etq);
}

// --- 1. barrera atada a isEncrypted ---------------------------------------
rev('1a barrera de encryptIfNeeded',
`  const b = bloqueoDeSeguridad();
  if (b) { const e = new Error(b.mensaje); e.bloqueoSeguridad = b.motivo; throw e; }
  return isEncrypted ? securitymod.encryptString(securityKey, payload) : payload;`,
`  if (isEncrypted && seguridadRequiereRevalidacion) {
    throw new Error('barrera antigua');
  }
  return isEncrypted ? securitymod.encryptString(securityKey, payload) : payload;`);

// --- 1b. transicion "sesion sin clave -> BD con Seguridad" -----------------
rev('1b transicion sin clave',
`  if (!securityKey) {
    if (motivo !== 'apertura') {
      appLog(\`Seguridad — la base de datos adoptada (\${motivo}) tiene el cifrado ACTIVO y esta sesión no tiene clave validada: no se escribirá nada hasta validarla.\`);
    }
    seguridadRequiereRevalidacion = true;
    return;
  }`,
`  if (!securityKey) return;`);

// --- 2. swap-a-medias contaba como "no se toco nada" -----------------------
rev('2 clasificacion de la recuperacion',
`    const noAusentes = estados.filter((x) => x.e.clase !== 'ausente');
    const ningunOriginalMovido = noAusentes.every((x) => x.e.clase === 'preparado');

    if (ningunOriginalMovido) {`,
`    const pendientes = estados.filter((x) => x.e.clase === 'preparado' || x.e.clase === 'swap-a-medias');
    const alguienIntercambiado = estados.some((x) => x.e.clase === 'intercambiado');

    if (!alguienIntercambiado && pendientes.length === estados.filter((x) => x.e.clase !== 'ausente').length) {`);

// --- 3. rollback por existencia, y "ilegible" tratado como ausente --------
rev('3 rollback por hash',
`        const h = sha256DeArchivo(it.absPath);
        const hOld = sha256DeArchivo(rekeyItemPath(it.i, 'old'));
        const oldValido = hOld.existe && hOld.sha === it.original_sha256;

        if (h.ilegible) {
          anota(\`no se pudo leer "\${it.absPath}" (\${h.codigo}): no se toca, y su original se conserva en la carpeta de trabajo\`);
          continue;
        }
        if (!h.existe) {
          if (oldValido) fs.renameSync(rekeyItemPath(it.i, 'old'), it.absPath);
          else if (hOld.existe) anota(\`"\${it.absPath}" no está y la copia apartada NO son sus bytes originales: se conserva sin restaurar\`);
          else anota(\`"\${it.absPath}" no está y no hay copia del original que reponer\`);
          continue;
        }`,
`        const h = sha256DeArchivo(it.absPath);
        const hayOld = fs.existsSync(rekeyItemPath(it.i, 'old'));
        const oldValido = hayOld;
        if (!h.existe) {
          if (hayOld) fs.renameSync(rekeyItemPath(it.i, 'old'), it.absPath);
          else anota(\`"\${it.absPath}" no está y no hay copia del original que reponer\`);
          continue;
        }`);

// --- 3b. bloqueo de la sesion tras un rollback incompleto ------------------
rev('3b bloqueo tras rollback incompleto',
`      seguridadEnEstadoInconsistente = rollbackError;
      appLog('ERROR PS-2004 — la sesión queda bloqueada para escritura tras una vuelta atrás incompleta: ' + rollbackError);`,
`      appLog('vuelta atras incompleta (sin bloquear la sesion)');`);

const dest = 'C:\\Users\\ADMIN~1.JLO\\AppData\\Local\\Temp\\claude\\C--Codigo-Fuente-PS\\e55d4471-ea3f-4279-b758-0366ccb6384c\\scratchpad\\bloque3\\main.js.PRE-CORRECCIONES';
fs.writeFileSync(dest, t, 'utf8');
console.log('revertidas ' + sust.length + ' correcciones: ' + sust.join(', '));
console.log('escrito: ' + dest);
void path;
