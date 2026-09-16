'use strict';
// ---------------------------------------------------------------------------
// GUARDIA DE RUTAS — un unico lector de location.json para TODOS los arneses.
//
// Motivo: cada arnes tenia su copia y todas leian `j.dir || j.path`. La clave
// real es `userDataDir`, asi que el guardian "no ejecutes dentro de la
// ubicacion real del usuario" estuvo INERTE: devolvia null y no comparaba
// nada. La proteccion aguanto por redundancia (cadena literal
// "bd-panoramaservicio" + marca obligatoria de pruebas), no porque este
// guardian funcionara.
//
// POLITICA (decidida tras ese fallo): FAIL-CLOSED.
// Si location.json EXISTE y no se puede interpretar con certeza -> exit 99.
// Nunca se degrada en silencio a null. Para un arnes que acepta --base
// arbitrario, y sobre todo para uno capaz de tocar G:, no saber donde vive
// produccion es motivo suficiente para NO ejecutar.
//
// Unica excepcion: un arnes encerrado en un tmp que el mismo genera puede
// admitir que location.json NO EXISTA (instalacion limpia), y solo si declara
// `raizPermitida` — allowlist positiva: toda ruta comprobada debe caer dentro.
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Orden de preferencia. `userDataDir` es la que escribe main.js
// (`JSON.stringify({ userDataDir: target, shared: isShared })`); las otras dos
// se conservan por compatibilidad con formatos antiguos.
const CLAVES_RUTA = ['userDataDir', 'dir', 'path'];

const PROHIBIDO_POR_DEFECTO = [
  'bd-panoramaservicio', 'mi unidad', 'my drive', 'google drive', 'onedrive', 'dropbox',
];

function rutaLocationJson(appdata) {
  return path.join(appdata || process.env.APPDATA || '', 'panorama-app-config', 'location.json');
}

// Resultado CERRADO. Distingue "no existe" de "no se puede interpretar";
// esa diferencia es justo la que el lector anterior borraba.
//   { estado: 'ok', ruta, clave, archivo }
//   { estado: 'ausente' | 'ilegible' | 'sin-clave' | 'ruta-invalida', archivo, detalle }
function leerUbicacionReal(opts) {
  const archivo = (opts && opts.archivo) || rutaLocationJson(opts && opts.appdata);
  let crudo;
  try {
    crudo = fs.readFileSync(archivo);
  } catch (e) {
    if (e && e.code === 'ENOENT') return { estado: 'ausente', archivo, detalle: 'no existe' };
    return { estado: 'ilegible', archivo, detalle: 'no se puede leer: ' + ((e && e.code) || String(e)) };
  }
  // El BOM NO se retira a proposito. main.js hace readFileSync(...,'utf8') +
  // JSON.parse, que revienta con BOM: si la app no sabria interpretarlo, el
  // guardian tampoco debe fingir que lo sabe. Se clasifica como ilegible.
  let j;
  try {
    j = JSON.parse(crudo.toString('utf8'));
  } catch (e) {
    const conBom = crudo.length >= 3 && crudo[0] === 0xEF && crudo[1] === 0xBB && crudo[2] === 0xBF;
    return {
      estado: 'ilegible', archivo,
      detalle: (conBom ? 'empieza por BOM UTF-8 y ' : '') + 'no es JSON valido: ' + ((e && e.message) || String(e)),
    };
  }
  if (!j || typeof j !== 'object' || Array.isArray(j)) {
    return { estado: 'ilegible', archivo, detalle: 'el JSON no es un objeto' };
  }
  let clave = null;
  let valor = null;
  for (const k of CLAVES_RUTA) {
    if (Object.prototype.hasOwnProperty.call(j, k)) { clave = k; valor = j[k]; break; }
  }
  if (clave === null) {
    return {
      estado: 'sin-clave', archivo,
      detalle: 'ninguna clave de ruta reconocida (' + CLAVES_RUTA.join('/') + '); tiene: ' +
        (Object.keys(j).join(', ') || '(ninguna)'),
    };
  }
  if (typeof valor !== 'string' || !valor.trim()) {
    return { estado: 'ruta-invalida', archivo, detalle: `"${clave}" no es una cadena no vacia` };
  }
  let abs;
  try { abs = path.resolve(valor.trim()); } catch (e) {
    return { estado: 'ruta-invalida', archivo, detalle: `"${clave}" no se puede resolver: ${String(e)}` };
  }
  if (!path.isAbsolute(abs)) {
    return { estado: 'ruta-invalida', archivo, detalle: `"${clave}" no es una ruta absoluta` };
  }
  return { estado: 'ok', archivo, clave, ruta: abs };
}

// path.relative() en vez de startsWith(): respeta separadores, '..' y
// mayusculas de Windows. Misma regla que `estaDentroDe()` del diseño §4.7.1.
function dentroDe(hijo, padre) {
  const rel = path.relative(path.resolve(padre), path.resolve(hijo));
  if (rel === '') return true;                              // es el propio padre
  if (path.isAbsolute(rel)) return false;                   // otra unidad
  if (rel === '..' || rel.startsWith('..' + path.sep)) return false;
  return true;
}

function sha256Archivo(f) {
  return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
}

// -- la guardia ------------------------------------------------------------
// cfg: { marca, prohibido?, permitirAusente?, raizPermitida?, silencioso?,
//        salida? (donde imprime), vigilarBdViva? (por defecto true) }
function crearGuardia(cfg) {
  const c = cfg || {};
  const log = c.salida || ((s) => console.log(s));
  const marca = String(c.marca || '');
  if (!marca) throw new Error('crearGuardia: falta `marca`');
  const prohibido = c.prohibido || PROHIBIDO_POR_DEFECTO;

  function abortar(motivo, ruta) {
    console.error('\n' + '!'.repeat(72) +
      `\n  ARNES ABORTADO: ${motivo}` + (ruta ? `\n  ruta: ${ruta}` : '') +
      '\n' + '!'.repeat(72));
    process.exit(99);
  }

  const lect = leerUbicacionReal(c);
  let REAL = null;
  if (lect.estado === 'ok') {
    REAL = lect.ruta;
  } else if (lect.estado === 'ausente') {
    // Unica degradacion tolerada, y solo con allowlist positiva.
    if (!c.permitirAusente || !c.raizPermitida) {
      abortar('location.json no existe y este arnes no declara `raizPermitida`', lect.archivo);
    }
  } else {
    // existe pero no se puede interpretar -> no se ejecuta nada.
    abortar(`location.json existe pero no se puede interpretar (${lect.estado}): ${lect.detalle}`, lect.archivo);
  }

  const DEFECTO = path.resolve(path.join(process.env.APPDATA || '', 'panorama-app'));
  const RAIZ_OK = c.raizPermitida ? path.resolve(c.raizPermitida) : null;

  function segura(p) {
    const abs = path.resolve(String(p));
    const bajo = abs.toLowerCase();
    for (const mal of prohibido) if (bajo.includes(mal)) abortar(`la ruta contiene "${mal}"`, abs);
    if (REAL && dentroDe(abs, REAL)) abortar('cae dentro de la ubicacion real configurada del usuario', abs);
    if (dentroDe(abs, DEFECTO)) abortar('apunta a la carpeta de datos por defecto', abs);
    if (!bajo.includes(marca.toLowerCase())) abortar(`la ruta no esta marcada para pruebas ("${marca}")`, abs);
    if (RAIZ_OK && !dentroDe(abs, RAIZ_OK)) abortar('la ruta cae fuera de la raiz permitida ' + RAIZ_OK, abs);
    return abs;
  }

  // -- BD VIVA: la unica prueba canonica de "produccion intacta" ------------
  // Es <ubicacion real>/panorama.sqlite3, NO %APPDATA%\panorama-app\...
  function rutaBdViva() {
    return REAL ? path.join(REAL, 'panorama.sqlite3') : null;
  }
  function huellaBdViva() {
    const f = rutaBdViva();
    if (!f) return { estado: 'sin-ubicacion' };
    try {
      return { estado: 'ok', ruta: f, sha: sha256Archivo(f), bytes: fs.statSync(f).size };
    } catch (e) {
      if (e && e.code === 'ENOENT') return { estado: 'no-existe', ruta: f };
      return { estado: 'ilegible', ruta: f, detalle: (e && e.code) || String(e) };
    }
  }
  const BD_ANTES = huellaBdViva();

  function compararBdViva() {
    const ahora = huellaBdViva();
    const igual = ahora.estado === BD_ANTES.estado && ahora.sha === BD_ANTES.sha && ahora.bytes === BD_ANTES.bytes;
    return { igual, antes: BD_ANTES, despues: ahora };
  }

  // Red de seguridad: ningun arnes puede "olvidarse" de comprobarlo al final.
  if (c.vigilarBdViva !== false) {
    process.on('exit', () => {
      const r = compararBdViva();
      if (r.igual) {
        log('  BD VIVA INTACTA: ' + (r.antes.sha ? r.antes.sha.slice(0, 16).toUpperCase() : r.antes.estado) +
          (r.antes.bytes != null ? '  ' + r.antes.bytes + ' B' : '') + '   (' + (r.antes.ruta || 'sin ubicacion') + ')');
        return;
      }
      console.error('\n' + '!'.repeat(72) +
        '\n  LA BD VIVA HA CAMBIADO DURANTE UNA PRUEBA QUE NO DEBIA TOCARLA' +
        '\n  ruta:    ' + (r.antes.ruta || r.despues.ruta) +
        '\n  antes:   ' + JSON.stringify(r.antes) +
        '\n  despues: ' + JSON.stringify(r.despues) +
        '\n  PARAR E INVESTIGAR ANTES DE SEGUIR.' +
        '\n' + '!'.repeat(72));
      process.exitCode = 98;
    });
  }

  if (!c.silencioso) {
    log('  ubicacion real:  ' + (REAL || '(location.json ausente; raiz permitida ' + RAIZ_OK + ')') +
      (lect.clave ? '   [clave: ' + lect.clave + ']' : ''));
    log('  BD viva:         ' +
      (BD_ANTES.estado === 'ok'
        ? BD_ANTES.sha.slice(0, 16).toUpperCase() + '  ' + BD_ANTES.bytes + ' B'
        : BD_ANTES.estado));
  }

  return { abortar, segura, REAL, lectura: lect, rutaBdViva, huellaBdViva, compararBdViva, BD_ANTES, dentroDe };
}

module.exports = { leerUbicacionReal, crearGuardia, dentroDe, rutaLocationJson, CLAVES_RUTA, PROHIBIDO_POR_DEFECTO, sha256Archivo };
