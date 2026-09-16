'use strict';
// ---------------------------------------------------------------------------
// NÚCLEO AISLADO DE A3.3 — primera implementación autorizada.
//
// NO es db.js. NO se conecta con la aplicación. NO sustituye nada. Vive en el
// scratchpad y trabaja exclusivamente sobre carpetas temporales.
//
// Alcance autorizado:
//   1. Clasificación de estados            -> clasificar()
//   2. Escritura del temporal, sincronización y confirmación -> escribirAtomico()
//   3. Restauración de memoria ante fallo anterior al rename -> run() caso (a)
//   4. Bloqueo irreversible por fallo fatal -> bloquearEscrituras()/levantarLatch()
//
// Fuera de alcance (NO implementado a propósito): modos especiales de rekey,
// adopción de Seguridad, cambios en los borrados.
//
// Decisión para este primer núcleo (petición explícita): fsync en LOS DOS
// archivos. La optimización de quitarlo del .gen queda aplazada hasta que la
// recuperación esté demostrada.
// ---------------------------------------------------------------------------

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// --- errores tipados --------------------------------------------------------
class ErrorDb extends Error {
  constructor(kind, message, extra) {
    super(message);
    this.name = 'ErrorDb';
    this.kind = kind;              // 'io' | 'conflicto' | 'testigo' | 'bloqueado' | 'ilegible'
    this.aplicado = false;         // ¿la operación llegó a disco? (§2.d)
    this.accionAplicada = false;   // ¿alguna sentencia ANTERIOR de esta acción llegó? (§3 del usuario)
    Object.assign(this, extra || {});
  }
}

// --- utilidades -------------------------------------------------------------
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const nuevoCommit = () => crypto.randomBytes(16).toString('hex');
const HISTORIAL_MAX = 20;

// Códigos que SÍ significan "este sistema de archivos no implementa fsync".
// Lista cerrada. Todo lo demás es un fallo real (§4.b).
const FSYNC_NO_SOPORTADO = new Set(['EINVAL', 'ENOSYS', 'ENOTSUP', 'EOPNOTSUPP']);

// ---------------------------------------------------------------------------
// 2. ESCRITURA DEL TEMPORAL, SINCRONIZACIÓN Y CONFIRMACIÓN
// ---------------------------------------------------------------------------
// Devuelve { fsyncNoSoportado: bool }. Lanza ErrorDb('io') si algo falla, y en
// ese caso GARANTIZA que no se ha hecho el rename: el archivo final no cambia.
// Nombre temporal GLOBALMENTE ÚNICO.
//
// `process.pid` NO basta: A3.1 lo hacía suficiente para dos instancias del
// mismo equipo, pero A3.3 existe precisamente para equipos distintos, y dos PCs
// pueden tener el mismo PID trabajando sobre la misma carpeta sincronizada.
// Además al arrancar se tratan algunos `.tmp` supervivientes como posibles
// imágenes de recuperación: un equipo no debe poder abrir ni truncar el
// temporal de otro writer por coincidencia de nombre.
//
// Propiedad requerida: dos instalaciones distintas nunca generan
// deliberadamente la misma ruta temporal para escrituras diferentes.
function nombreTemporal(rutaFinal, opts) {
  const o = opts || {};
  const w = o.writer ? String(o.writer).replace(/[^0-9a-zA-Z_-]/g, '').slice(0, 16) : 'anon';
  // El nonce es lo que garantiza la unicidad incluso dentro del mismo writer
  // (dos escrituras seguidas, o un temporal superviviente de una anterior).
  const nonce = (o.commit ? String(o.commit).slice(0, 8) : '') + crypto.randomBytes(8).toString('hex');
  return `${rutaFinal}.tmp-${w}-${nonce}`;
}

function escribirAtomico(rutaFinal, buffer, opts) {
  const o = opts || {};
  const conFsync = o.conFsync !== false;
  const hooks = o.hooks || {};
  const tmp = nombreTemporal(rutaFinal, o);
  let completo = false;
  let fsyncNoSoportado = false;

  const fd = fs.openSync(tmp, 'w');
  try {
    // --- bucle de escritura con control de progreso ---
    let escritos = 0;
    let vueltas = 0;
    while (escritos < buffer.length) {
      if (++vueltas > buffer.length + 16) {
        throw new ErrorDb('io', `bucle de escritura sin fin en el byte ${escritos}`);
      }
      const n = (hooks.writeSync || fs.writeSync)(fd, buffer, escritos, buffer.length - escritos, escritos);
      if (!(n > 0)) {
        throw new ErrorDb('io', `writeSync sin progreso en el byte ${escritos} de ${buffer.length}`);
      }
      escritos += n;
    }
    if (escritos !== buffer.length) {
      throw new ErrorDb('io', `escritura incompleta: ${escritos}/${buffer.length}`);
    }

    // --- fsync, distinguiendo incompatibilidad de fallo real ---
    if (conFsync) {
      try {
        (hooks.fsyncSync || fs.fsyncSync)(fd);
      } catch (e) {
        if (FSYNC_NO_SOPORTADO.has(e && e.code)) {
          fsyncNoSoportado = true;      // el llamante lo registra UNA vez
        } else {
          throw new ErrorDb('io', `fsync falló (${(e && e.code) || '?'}): ${e && e.message}`);
        }
      }
    }
    completo = true;
  } finally {
    try { fs.closeSync(fd); } catch (e) { /* ya cerrado */ }
    if (!completo) {
      // El temporal NO sustituye nada. Se conserva para diagnóstico (§4.c),
      // con un nombre igual de único: es de ESTE writer y de nadie más.
      const fallido = tmp.replace('.tmp-', '.tmp-fallido-') + '-' + Date.now();
      try { fs.renameSync(tmp, fallido); } catch (e) { /* si ni eso, se queda como .tmp- */ }
    }
  }

  // Solo se llega aquí con completo === true.
  (hooks.renameSync || fs.renameSync)(tmp, rutaFinal);
  return { fsyncNoSoportado };
}

// ---------------------------------------------------------------------------
// 1. CLASIFICACIÓN DE ESTADOS  (§6.1.a / §6.1.b)
// ---------------------------------------------------------------------------
// Función PURA: recibe una fotografía del estado y devuelve la decisión.
// No lee disco, no escribe, no tiene efectos.
//
// e = {
//   politica: 'local' | 'compartida' | 'desconocida',
//   dirty: bool,
//   mem:   { C, P, H, F },            // F = F_mio
//   stat:  { mtimeMs, size } | null,  // del .sqlite3 AHORA
//   sMio:  { mtimeMs, size } | null,  // el que dejamos en la última escritura
//   gen:   { C, P, W } | null,        // del .gen; null = ausente/ilegible
//   disk:  { C, P, H, F } | null,     // de la imagen en disco; null = no leída
//   wYo:   'installation-id'
// }
function clasificar(e) {
  const R = (tipo, caso, motivo, extra) =>
    Object.assign({ tipo, caso, motivo }, extra || {});

  // --- atajo del camino rápido (§6.1.a) -------------------------------------
  // Solo en carpeta LOCAL. En compartida/desconocida SIEMPRE se leen los bytes.
  if (e.politica === 'local' && e.gen && e.sMio && e.stat) {
    if (e.gen.C === e.mem.C &&
        e.stat.mtimeMs === e.sMio.mtimeMs &&
        e.stat.size === e.sMio.size) {
      return R('seguir', null, 'atajo local: .gen y stat sin cambios');
    }
  }

  // A partir de aquí hace falta la imagen del disco.
  if (!e.disk) {
    return R('leer-disco', null, 'hay que leer el .sqlite3 para clasificar');
  }

  // --- .gen ausente o ilegible (caso 7) -------------------------------------
  if (!e.gen) {
    return R(e.politica === 'local' ? 'reparar-gen' : 'degradado', 7,
      'el .gen no existe o no se puede interpretar');
  }

  // ======================= RAMA A: .gen y BD coherentes =====================
  if (e.gen.C === e.disk.C) {

    // --- A1: mismo commit -> decide por BYTES, no por parentesco ------------
    if (e.disk.C === e.mem.C) {
      if (e.disk.F === e.mem.F) {
        // A1a. Mismos bytes. Un mtime distinto NO es conflicto.
        return R('seguir', null, 'mismo commit y mismos bytes; se refresca S_mio',
          { refrescarStat: true });
      }
      // A1b. Mismo commit, BYTES DISTINTOS. Nunca descendencia.
      return R('conflicto', 8,
        'el .sqlite3 cambió sin que cambiaran los identificadores (versión antigua o escritura externa)');
    }

    // -- de aquí en adelante, C_disk !== C_mem garantizado --

    // A2: descendencia ESTRICTA
    if (e.disk.H.includes(e.mem.C)) {
      if (e.dirty) {
        return R('conflicto', 1,
          'el disco desciende de lo nuestro, pero hay cambios en memoria sin confirmar');
      }
      return R('recarga', 1, 'descendencia lineal estricta: el disco ya contiene lo nuestro');
    }

    // A3: vamos por delante del disco
    if (e.mem.H.includes(e.disk.C)) {
      return R('aviso-atrasado', 4, 'la imagen del disco es un ancestro nuestro');
    }

    // A4: bifurcación concurrente
    if (e.gen.P && e.mem.P && e.gen.P === e.mem.P) {
      return R('conflicto', 3, 'bifurcación concurrente: otro equipo partió del mismo commit');
    }

    // A5: resto. ÚNICA regla "resto", y la última.
    return R('conflicto', 5, 'divergencia no demostrable');
  }

  // ============ RAMA B: .gen y BD de commits distintos ======================
  // B0. ¿Sigue el disco donde lo dejamos? DOS preguntas.
  const discoIntacto = (e.disk.C === e.mem.C) && (e.disk.F === e.mem.F);
  if (!discoIntacto) {
    // El disco ha divergido: NO se autorrepara, diga lo que diga W_file.
    // Se reclasifica el DISCO contra nosotros con las reglas de la rama A.
    const comoSiA = clasificar(Object.assign({}, e, {
      gen: { C: e.disk.C, P: e.disk.P, W: e.gen.W },   // se ignora el .gen adelantado
    }));
    return Object.assign({}, comoSiA, {
      genAdelantado: true,
      motivo: comoSiA.motivo + ' (además hay un .gen adelantado sin resolver)',
    });
  }

  // B1. Mi propia escritura interrumpida: CUATRO condiciones.
  if (e.gen.W === e.wYo && e.gen.P === e.disk.C && e.disk.C === e.mem.C && e.disk.F === e.mem.F) {
    return R('reparar-gen', 2, 'mi propia escritura interrumpida: se reescribe el .gen desde la BD');
  }

  // B2. Intención de otro equipo en vuelo.
  if (e.gen.W !== e.wYo && e.gen.P === e.disk.C) {
    return R('espera', 0, 'otro equipo empezó a escribir y su .sqlite3 no ha llegado');
  }

  // B3. El .gen no encadena ni con el disco ni con nosotros.
  return R('espera', 0, 'incoherencia: el .gen no encadena con la base de datos', { conservador: true });
}

// ---------------------------------------------------------------------------
// 4. BLOQUEO IRREVERSIBLE  (§3 / §14.a)
// ---------------------------------------------------------------------------
const MOTIVOS_IRREVERSIBLES = new Set(['comprometido', 'desincronizada', 'bd-ilegible']);
const MOTIVOS_LEVANTABLES = new Set(['conflicto', 'degradado']);

// ---------------------------------------------------------------------------
// EL NÚCLEO
// ---------------------------------------------------------------------------
function crearNucleo(cfg) {
  const dir = cfg.dir;
  const SQL = cfg.SQL;
  const wYo = cfg.installationId || crypto.randomBytes(16).toString('hex');
  let politica = cfg.politica || 'local';
  const conFsync = cfg.conFsync !== false;      // por defecto SÍ, en ambos archivos
  const hooks = cfg.hooks || {};                // inyección de fallos para las pruebas
  const registro = [];
  const log = (s) => { registro.push(s); if (cfg.verbose) console.log('    [nucleo] ' + s); };

  const dbPath = path.join(dir, 'panorama.sqlite3');
  const genPath = dbPath + '.gen';

  let db = null;
  let escrituraBloqueada = null;
  let dirty = false;                 // §2.d: la BANDERA, no una igualdad
  let ultimaImagenConfirmada = null; // Buffer inmutable
  let cMem = null, pMem = null, hMem = [], gMem = 0, fMio = null, sMio = null;
  let fsyncAvisado = false;

  // ---- latch ---------------------------------------------------------------
  function bloquearEscrituras(motivo) {
    if (escrituraBloqueada && MOTIVOS_IRREVERSIBLES.has(escrituraBloqueada)) {
      // Un motivo fatal NUNCA se sustituye por otro, ni por otro fatal:
      // el primero es el que explica la causa raíz.
      log(`bloqueo: se ignora '${motivo}', ya está bloqueado por '${escrituraBloqueada}'`);
      return escrituraBloqueada;
    }
    escrituraBloqueada = motivo;
    log(`bloqueo: escrituras bloqueadas por '${motivo}'`);
    return escrituraBloqueada;
  }

  function levantarLatch(motivoEsperado) {
    if (!escrituraBloqueada) return { ok: true };
    if (MOTIVOS_IRREVERSIBLES.has(escrituraBloqueada)) {
      return { ok: false, error: `el bloqueo '${escrituraBloqueada}' es irreversible en esta sesión` };
    }
    if (motivoEsperado && escrituraBloqueada !== motivoEsperado) {
      return { ok: false, error: `el bloqueo actual es '${escrituraBloqueada}', no '${motivoEsperado}'` };
    }
    if (!MOTIVOS_LEVANTABLES.has(escrituraBloqueada)) {
      return { ok: false, error: `'${escrituraBloqueada}' no está en la lista de motivos levantables` };
    }
    log(`bloqueo: levantado '${escrituraBloqueada}'`);
    escrituraBloqueada = null;
    return { ok: true };
  }

  // ---- lectura del .gen ----------------------------------------------------
  function leerGen() {
    try {
      const txt = fs.readFileSync(genPath, 'utf8');
      const j = JSON.parse(txt);
      if (!j || j.v !== 2 || !j.commit_id || !j.writer) return null;
      return { C: j.commit_id, P: j.parent_commit_id || null, W: j.writer, gen: j.gen };
    } catch (e) { return null; }
  }

  function escribirGen(commit, parent, gen) {
    const buf = Buffer.from(JSON.stringify({
      v: 2, gen, commit_id: commit, parent_commit_id: parent, writer: wYo,
      at: new Date().toISOString(),
    }), 'utf8');
    const r = escribirAtomico(genPath, buf, { conFsync, hooks, writer: wYo, commit });
    if (r.fsyncNoSoportado && !fsyncAvisado) {
      fsyncAvisado = true;
      log('fsync no soportado en esta ubicación: garantía de durabilidad REBAJADA');
    }
  }

  // ---- lectura de la imagen del disco --------------------------------------
  // ESTADOS EXPLÍCITOS. "No puedo comprobar" NO es "he demostrado conflicto".
  //
  //   'valida'        -> se leyó y es una imagen coherente
  //   'ausente'       -> el archivo no existe (ENOENT)
  //   'no-disponible' -> existe pero no se pudo LEER (EIO, EBUSY, EACCES,
  //                      EPERM, corte de Drive...). NO dice nada del contenido.
  //   'ilegible'      -> se leyó, pero el contenido no es una base de datos
  //                      utilizable (no abre, integrity_check, sin commit_id)
  //
  // La diferencia entre 'no-disponible' e 'ilegible' es la clave: la primera es
  // transitoria y no permite concluir NADA; la segunda es un daño demostrado.
  function leerDisco() {
    let bytes;
    try {
      bytes = (hooks.readFileSync || fs.readFileSync)(dbPath);
    } catch (e) {
      const cod = (e && e.code) || '';
      if (cod === 'ENOENT') return { estado: 'ausente', motivo: 'el archivo no existe' };
      return { estado: 'no-disponible', motivo: `no se pudo leer (${cod || e.message})`, codigo: cod };
    }
    let d = null;
    try { d = new SQL.Database(bytes); } catch (e) { return { estado: 'ilegible', motivo: 'no abre' }; }
    try {
      const ic = d.exec('PRAGMA integrity_check');
      const okIc = ic.length && ic[0].values.length && String(ic[0].values[0][0]) === 'ok';
      if (!okIc) { d.close(); return { estado: 'ilegible', motivo: 'integrity_check' }; }
      const r = d.exec("SELECT key,value FROM app_meta WHERE key IN ('db_commit_id','db_parent_commit_id','db_commit_history','db_generation')");
      const m = {};
      if (r.length) r[0].values.forEach(([k, v]) => { m[k] = v; });
      d.close();
      if (!m.db_commit_id) return { estado: 'ilegible', motivo: 'sin db_commit_id' };
      return {
        estado: 'valida',
        C: m.db_commit_id,
        P: m.db_parent_commit_id || null,
        H: JSON.parse(m.db_commit_history || '[]'),
        gen: parseInt(m.db_generation || '0', 10),
        F: sha256(bytes),
        bytes,
      };
    } catch (e) { try { d.close(); } catch (e2) {} return { estado: 'ilegible', motivo: String(e && e.message) }; }
  }

  // ---- estado para clasificar ---------------------------------------------
  function fotografiar({ forzarLeerDisco } = {}) {
    let st = null;
    try { const s = fs.statSync(dbPath); st = { mtimeMs: s.mtimeMs, size: s.size }; } catch (e) {}
    const gen = leerGen();
    const necesitaBytes = forzarLeerDisco || politica !== 'local';
    const disk = necesitaBytes ? leerDisco() : null;
    return {
      politica, dirty, wYo,
      mem: { C: cMem, P: pMem, H: hMem, F: fMio },
      stat: st, sMio, gen,
      // `disk` solo lleva imagen cuando es VÁLIDA. Los demás estados viajan
      // aparte para que clasificar() nunca los confunda con una divergencia.
      disk: disk && disk.estado === 'valida' ? disk : null,
      diskEstado: disk ? disk.estado : null,
      diskMotivo: disk ? disk.motivo : null,
    };
  }

  // Mapea el estado de lectura del .sqlite3 a la política. La regla que manda:
  // NO HABER PODIDO LEER **NO** DEMUESTRA UN CONFLICTO.
  function salidaPorEstadoDeDisco(e) {
    if (e.diskEstado === 'ilegible') {
      return { ok: false, motivo: 'bd-ilegible', detalle: e.diskMotivo };
    }
    if (e.diskEstado === 'no-disponible' || e.diskEstado === 'ausente') {
      return { ok: false, motivo: 'no-verificable', detalle: e.diskMotivo, estadoDisco: e.diskEstado };
    }
    return null;
  }

  function comprobarEscrituraPosible() {
    if (escrituraBloqueada) {
      return { ok: false, motivo: 'bloqueado', detalle: escrituraBloqueada };
    }
    let e = fotografiar();
    let s = salidaPorEstadoDeDisco(e);
    if (s) return s;
    let d = clasificar(e);
    if (d.tipo === 'leer-disco') {
      e = fotografiar({ forzarLeerDisco: true });
      s = salidaPorEstadoDeDisco(e);
      if (s) return s;
      d = clasificar(e);
      if (d.tipo === 'leer-disco') {
        // Se pidió leer y la lectura no dio una imagen válida. No se insiste y,
        // sobre todo, NO se inventa una clasificación.
        return { ok: false, motivo: 'no-verificable', detalle: 'no se obtuvo una imagen válida del disco',
          estadoDisco: e.diskEstado || 'desconocido' };
      }
    }
    return { ok: d.tipo === 'seguir' || d.tipo === 'reparar-gen', decision: d, estado: e };
  }

  // ---- persistencia con generación ----------------------------------------
  // Devuelve el buffer confirmado. Lanza ErrorDb con `aplicado` bien puesto.
  function persistirConGeneracion(commitNuevo, padre, historia, generacion) {
    // 1. el .gen primero: si otro equipo lo lee, nunca ve una BD más nueva que el testigo
    escribirGen(commitNuevo, padre, generacion);

    // 2. la base de datos. EL RENAME DE AQUÍ ES EL PUNTO DE CONFIRMACIÓN.
    const data = db.export();
    const buf = Buffer.from(data);       // Buffer.from(Uint8Array) COPIA
    escribirAtomico(dbPath, buf, { conFsync, hooks, writer: wYo, commit: commitNuevo });
    return buf;
  }

  // ---- restauración de memoria (caso a de §2.d) ----------------------------
  function restaurarUltimaImagenConfirmada() {
    if (!ultimaImagenConfirmada) throw new Error('no hay imagen confirmada que restaurar');
    if (hooks.fallarRestauracion) throw new Error('FALLO INYECTADO al restaurar la imagen');
    try { db.close(); } catch (e) {}
    db = new SQL.Database(Buffer.from(ultimaImagenConfirmada));  // copia fresca
    const m = leerMetaMemoria();
    cMem = m.C; pMem = m.P; hMem = m.H; gMem = m.gen;
    fMio = sha256(ultimaImagenConfirmada);
    dirty = false;
  }

  function leerMetaMemoria() {
    const r = db.exec("SELECT key,value FROM app_meta WHERE key IN ('db_commit_id','db_parent_commit_id','db_commit_history','db_generation')");
    const m = {};
    if (r.length) r[0].values.forEach(([k, v]) => { m[k] = v; });
    return {
      C: m.db_commit_id || null,
      P: m.db_parent_commit_id || null,
      H: JSON.parse(m.db_commit_history || '[]'),
      gen: parseInt(m.db_generation || '0', 10),
    };
  }

  function ejecutarInterno(sql, params) { db.run(sql, params); }

  // ---- adoptar la imagen del disco (solo descendencia estricta) ------------
  // NO es la resolución de conflicto de §7 (eso no está en este núcleo): aquí
  // solo se adopta una imagen que YA contiene la nuestra, comprobado por
  // historial, y únicamente con dirty === false.
  function recargarDesdeDisco() {
    if (dirty) throw new ErrorDb('io', 'no se recarga con cambios en memoria sin confirmar');
    const d = leerDisco();
    if (d.estado === 'ilegible') throw new ErrorDb('ilegible', `la base de datos no es utilizable (${d.motivo})`);
    if (d.estado !== 'valida') throw new ErrorDb('io', `no se pudo releer la base de datos (${d.motivo})`,
      { noVerificable: true, estadoDisco: d.estado });
    try { db.close(); } catch (e) {}
    db = new SQL.Database(d.bytes);
    ultimaImagenConfirmada = Buffer.from(d.bytes);
    cMem = d.C; pMem = d.P; hMem = d.H; gMem = d.gen; fMio = d.F;
    try { const s = fs.statSync(dbPath); sMio = { mtimeMs: s.mtimeMs, size: s.size }; } catch (e) {}
    dirty = false;
    return true;
  }

  // ---- ¿la carpeta está realmente virgen? ----------------------------------
  // Se usa SOLO como comprobación adicional antes de crear, nunca como
  // autorización por sí sola. Ante cualquier duda devuelve `false`
  // (fail-closed): si no se puede listar la carpeta, no se da por virgen.
  function pareceUbicacionNueva() {
    let entradas;
    try { entradas = fs.readdirSync(dir); } catch (e) { return { nueva: false, motivo: 'no se pudo listar la carpeta' }; }
    const base = path.basename(dbPath);
    const restos = entradas.filter((f) =>
      f === base || f.startsWith(base + '.'));       // .gen, .tmp-, .conflicto-, .abandonado-…
    if (restos.length) {
      return { nueva: false, motivo: `hay restos de una base de datos anterior: ${restos.join(', ')}` };
    }
    return { nueva: true, motivo: 'no hay ningún rastro de una base de datos previa' };
  }

  // ---- arranque ------------------------------------------------------------
  //
  // `crearSiAusente` es la ÚNICA autorización para crear una base de datos
  // nueva. Deliberadamente NO se usa como autorización:
  //   · fs.existsSync() === false   (devuelve false ante CUALQUIER error, así
  //                                  que un fallo transitorio de Drive pasaría
  //                                  por "aquí no hay nada")
  //   · un ENOENT aislado           (en Drive puede ser transitorio: montaje,
  //                                  sincronización, ruta aún no disponible)
  //   · la ausencia del .gen        (por sí sola no dice nada)
  //
  // "El archivo está ausente" es un HECHO OBSERVADO.
  // "Crear una base de datos nueva" es una DECISIÓN DE INICIALIZACIÓN.
  // No son lo mismo, y solo el segundo autoriza a escribir.
  function abrir(opts) {
    const o = opts || {};
    const crearSiAusente = o.crearSiAusente === true;
    fs.mkdirSync(dir, { recursive: true });

    // SIEMPRE se lee. Nunca hay un booleano de existencia por delante.
    const d = leerDisco();

    if (d.estado === 'valida') {
      db = new SQL.Database(d.bytes);
      ultimaImagenConfirmada = Buffer.from(d.bytes);
      cMem = d.C; pMem = d.P; hMem = d.H; gMem = d.gen; fMio = d.F;
      try { const s = fs.statSync(dbPath); sMio = { mtimeMs: s.mtimeMs, size: s.size }; } catch (e) {}
      dirty = false;
      return db;
    }

    if (d.estado === 'ilegible') {
      // §4.b paso 3: NO se crea una base de datos vacía, NO se escribe nada.
      bloquearEscrituras('bd-ilegible');
      throw new ErrorDb('ilegible', `la base de datos no es utilizable (${d.motivo})`);
    }

    if (d.estado === 'no-disponible') {
      // El archivo existe y puede estar perfectamente bien: lo que ha fallado
      // es leerlo. No se latchea 'bd-ilegible' y NO se crea nada encima.
      if (politica !== 'local') bloquearEscrituras('degradado');
      throw new ErrorDb('io', `no se pudo leer la base de datos (${d.motivo})`,
        { noVerificable: true, estadoDisco: 'no-disponible' });
    }

    // ---- d.estado === 'ausente' ---------------------------------------------
    if (!crearSiAusente) {
      // Hecho observado, sin decisión de inicialización. NO se escribe NADA:
      // ni la base de datos, ni el .gen.
      if (politica !== 'local') bloquearEscrituras('degradado');   // fail-closed
      const pista = pareceUbicacionNueva();
      throw new ErrorDb('io',
        `la base de datos no está donde se esperaba (${d.motivo}). No se crea ninguna ` +
        'base de datos nueva: hacerlo podría sustituir una que solo está temporalmente ' +
        'no disponible.',
        { noVerificable: true, estadoDisco: 'ausente',
          podriaSerPrimeraVez: pista.nueva, pistaUbicacion: pista.motivo });
    }

    // Flujo EXPLÍCITO de inicialización. Aun así, no se crea encima de restos.
    const pista = pareceUbicacionNueva();
    if (!pista.nueva) {
      if (politica !== 'local') bloquearEscrituras('degradado');
      throw new ErrorDb('io',
        `se pidió inicializar, pero la carpeta no está vacía: ${pista.motivo}. No se crea nada.`,
        { noVerificable: true, estadoDisco: 'ausente', pistaUbicacion: pista.motivo });
    }

    log(`inicialización explícita de una ubicación nueva (${politica}): ${pista.motivo}`);
    db = new SQL.Database();
    db.run('CREATE TABLE IF NOT EXISTS app_meta(key TEXT PRIMARY KEY, value TEXT)');
    db.run('CREATE TABLE IF NOT EXISTS projects(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)');
    const c = nuevoCommit();
    ejecutarInterno(
      "INSERT INTO app_meta(key,value) VALUES ('db_commit_id',?),('db_parent_commit_id',NULL)," +
      "('db_commit_history',?),('db_generation','1')", [c, JSON.stringify([c])]
    );
    cMem = c; pMem = null; hMem = [c]; gMem = 1;
    const buf = persistirConGeneracion(c, null, [c], 1);
    ultimaImagenConfirmada = buf;
    fMio = sha256(buf);
    try { const s = fs.statSync(dbPath); sMio = { mtimeMs: s.mtimeMs, size: s.size }; } catch (e) {}
    dirty = false;
    return db;
  }

  // ---- punto de inyección de fallos, solo para las pruebas ------------------
  function punto(nombre) {
    if (hooks.fallarEn === nombre) {
      const e = new Error('FALLO INYECTADO en ' + nombre);
      e.puntoInyectado = nombre;
      throw e;
    }
  }

  // ---- preservar el testigo interrumpido antes de sustituirlo --------------
  function preservarGenComoTestigo() {
    try {
      if (!fs.existsSync(genPath)) return null;
      const destino = `${genPath}.interrumpido-${Date.now()}`;
      fs.copyFileSync(genPath, destino);
      log(`testigo interrumpido preservado en ${path.basename(destino)}`);
      return destino;
    } catch (e) {
      log(`no se pudo preservar el testigo interrumpido: ${e.message}`);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // LA MÁQUINA DE ESTADOS DE LA ESCRITURA
  //
  // La frontera es EL RENAME DEL .sqlite3, y está marcada por `confirmado`.
  //
  //   PRE-CONFIRMACIÓN  -> SIEMPRE restaurar. aplicado = false.
  //   POST-CONFIRMACIÓN -> JAMÁS restaurar. aplicado = true.
  //
  // Son dos `try` distintos a propósito: el primero cubre desde la PRIMERA
  // mutación de memoria (no desde la persistencia) hasta el rename; el segundo
  // cubre solo el bookkeeping y nunca toca la imagen.
  // ---------------------------------------------------------------------------
  function aplicarYConfirmar(sentencias, opts) {
    const o = opts || {};
    const snap = { sMio };
    let confirmado = false;
    let buf = null;
    let lastId = null;
    let testigoPreservado = null;

    try {
      // ---- desde AQUÍ ya hay riesgo de dejar la memoria a medias ----
      dirty = true;

      for (const s of sentencias) {
        punto('sql');
        db.run(s.sql, s.params || []);
        punto('lastid');
        const r = db.exec('SELECT last_insert_rowid()');
        lastId = r.length ? r[0].values[0][0] : null;
      }

      const cNuevo = nuevoCommit();
      const hNueva = [cNuevo].concat(hMem).slice(0, HISTORIAL_MAX);
      const gNueva = gMem + 1;

      punto('meta1');
      ejecutarInterno("INSERT INTO app_meta(key,value) VALUES ('db_commit_id',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [cNuevo]);
      punto('meta2');
      ejecutarInterno("INSERT INTO app_meta(key,value) VALUES ('db_parent_commit_id',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [cMem]);
      punto('meta3');
      ejecutarInterno("INSERT INTO app_meta(key,value) VALUES ('db_commit_history',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [JSON.stringify(hNueva)]);
      punto('meta4');
      ejecutarInterno("INSERT INTO app_meta(key,value) VALUES ('db_generation',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [String(gNueva)]);

      // Si veníamos de un testigo interrumpido nuestro, se conserva ANTES de
      // sustituirlo. Ver la decisión B del §4 de la revisión.
      if (o.preservarTestigo) testigoPreservado = preservarGenComoTestigo();

      punto('gen');
      escribirGen(cNuevo, cMem, gNueva);

      punto('persist');
      buf = Buffer.from(db.export());              // Buffer.from(Uint8Array) COPIA
      escribirAtomico(dbPath, buf, { conFsync, hooks, writer: wYo, commit: cNuevo });

      confirmado = true;                            // <<<< PUNTO DE CONFIRMACIÓN
      o._cNuevo = cNuevo; o._hNueva = hNueva; o._gNueva = gNueva;
    } catch (e) {
      /* istanbul ignore next -- por construcción no se llega aquí confirmado */
      if (confirmado) throw e;

      // ================= PRE-CONFIRMACIÓN: SIEMPRE RESTAURAR =================
      // El disco activo NO se ha tocado (escribirAtomico garantiza que sin
      // rename el archivo final no cambia). Solo hay que deshacer la memoria.
      try {
        restaurarUltimaImagenConfirmada();
        sMio = snap.sMio;
      } catch (e2) {
        bloquearEscrituras('desincronizada');       // irreversible
        throw new ErrorDb('io',
          `fallo antes de confirmar (${e.message}) y además al restaurar la memoria (${e2.message})`,
          { aplicado: false, restauracionFallida: true, punto: e.puntoInyectado || null });
      }
      throw new ErrorDb('io', e.message, { aplicado: false, punto: e.puntoInyectado || null });
    }

    // ============= POST-CONFIRMACIÓN: JAMÁS RESTAURAR =====================
    try {
      punto('bookkeeping');
      if (hooks.fallarBookkeeping) throw new Error('FALLO INYECTADO en el bookkeeping');
      const s = fs.statSync(dbPath);
      ultimaImagenConfirmada = buf;
      pMem = cMem;
      cMem = o._cNuevo;
      hMem = o._hNueva;
      gMem = o._gNueva;
      fMio = sha256(buf);
      sMio = { mtimeMs: s.mtimeMs, size: s.size };
      dirty = false;
    } catch (e) {
      const rehecho = rehacerBookkeepingDesdeDisco(o._cNuevo, buf);
      if (rehecho.ok) {
        log(`bookkeeping rehecho tras un fallo posterior a la confirmación: ${e.message}`);
        return { lastId, testigoPreservado };
      }
      bloquearEscrituras('desincronizada');
      throw new ErrorDb('io-tras-confirmar',
        `el cambio SÍ se guardó, pero no se ha podido verificar: ${e.message}. NO repitas la operación.`,
        { aplicado: true, reclasificado: rehecho.reclasificado || null });
    }
    return { lastId, testigoPreservado };
  }

  // ---- la escritura pública ------------------------------------------------
  function run(sql, params) {
    return escribirMultiple([{ sql, params }]);
  }

  // Varias sentencias, UNA sola imagen, UN solo commit, UNA sola persistencia.
  // Es lo que necesitan deleteProjectById (los dos DELETE) y la consolidación
  // de meta del rekey. En el núcleo solo se ofrece el mecanismo: la
  // integración con main.js NO está autorizada.
  function escribirMultiple(sentencias) {
    // 1. GUARDAS
    if (escrituraBloqueada) {
      throw new ErrorDb('bloqueado', `escrituras bloqueadas: ${escrituraBloqueada}`, { latch: escrituraBloqueada });
    }
    const sql = null, params = null; void sql; void params;

    // 2. DETECCIÓN, antes de tocar la memoria
    let posible = comprobarEscrituraPosible();

    // 2b. Descendencia lineal estricta (caso 1): NO es conflicto. Se adopta la
    //     imagen del disco en silencio y se vuelve a comprobar UNA vez.
    //     (El paso 0 —dirty— ya lo ha impedido antes si había trabajo local.)
    if (!posible.ok && posible.decision && posible.decision.tipo === 'recarga') {
      log(`recarga silenciosa por descendencia lineal: ${posible.decision.motivo}`);
      recargarDesdeDisco();
      posible = comprobarEscrituraPosible();
      if (!posible.ok && posible.decision && posible.decision.tipo === 'recarga') {
        // Si tras recargar sigue pidiendo recargar, algo se mueve más rápido
        // de lo que podemos seguir: no se insiste, se para.
        bloquearEscrituras('degradado');
        throw new ErrorDb('conflicto', 'el disco cambia más rápido de lo que se puede seguir',
          { caso: 1, decision: 'recarga' });
      }
    }

    if (!posible.ok) {
      if (posible.motivo === 'bd-ilegible') {
        bloquearEscrituras('bd-ilegible');
        throw new ErrorDb('ilegible', `la base de datos en disco no es utilizable (${posible.detalle})`);
      }

      // NO VERIFICABLE: no se ha podido LEER el .sqlite3. Esto NO demuestra
      // ningún conflicto y no se etiqueta como tal. El SQL del usuario no se
      // ha ejecutado y la memoria no se ha tocado.
      if (posible.motivo === 'no-verificable') {
        if (politica === 'local') {
          // Sin otro PC posible (A3.1), es simplemente un error de E/S
          // transitorio. No se inventa parentesco y NO se latchea: reintentar
          // cuando el disco responda es lo correcto.
          throw new ErrorDb('io', `no se pudo comprobar el estado del disco (${posible.detalle})`,
            { aplicado: false, noVerificable: true, estadoDisco: posible.estadoDisco });
        }
        // Compartida o desconocida: no se puede descartar que otro equipo esté
        // escribiendo, así que se para en modo degradado — que es levantable
        // solo, en cuanto el disco vuelva a leerse (§5.b).
        bloquearEscrituras('degradado');
        throw new ErrorDb('io',
          `no se puede verificar que otro equipo no esté escribiendo (${posible.detalle})`,
          { aplicado: false, noVerificable: true, estadoDisco: posible.estadoDisco, latch: 'degradado' });
      }

      const d = posible.decision;
      // Solo 'espera' y 'degradado' son estados recuperables solos; el resto
      // necesita al usuario y se marca como conflicto.
      const motivo = (d.tipo === 'espera' || d.tipo === 'degradado') ? 'degradado' : 'conflicto';
      bloquearEscrituras(motivo);
      throw new ErrorDb('conflicto', d.motivo, { caso: d.caso, decision: d.tipo, latch: motivo });
    }
    if (posible.decision && posible.decision.refrescarStat) {
      try { const s = fs.statSync(dbPath); sMio = { mtimeMs: s.mtimeMs, size: s.size }; } catch (e) {}
    }

    // 2d. `reparar-gen` — DECISIÓN B, explícita.
    //
    // La escritura nueva SUSTITUYE al testigo interrumpido, porque su commit se
    // encadena desde C_disk (=== C_mem, comprobado por las cuatro condiciones
    // de B1). No hace falta un paso de reparación aparte: reescribir el .gen
    // con el commit viejo y volver a reescribirlo con el nuevo sería escribir
    // dos veces para el mismo resultado.
    //
    // PERO el testigo adelantado SE CONSERVA antes de sustituirlo, porque
    // documenta una escritura que se intentó y no llegó.
    const preservarTestigo = !!(posible.decision && posible.decision.tipo === 'reparar-gen'
                                && posible.decision.caso === 2);

    // 3-8. Máquina de estados: pre-confirmación restaura, post-confirmación no.
    const r = aplicarYConfirmar(sentencias, { preservarTestigo });
    return r.lastId;
  }

  // §3 del usuario: al releer para reconstruir, NO se da por nuestro sin comprobar.
  function rehacerBookkeepingDesdeDisco(commitEsperado, bufEscrito) {
    const d = leerDisco();
    if (d.estado !== 'valida') return { ok: false, estadoDisco: d.estado };
    if (d.C !== commitEsperado) {
      // Lo que hay en disco NO es lo que acabamos de escribir: alguien pasó por
      // encima entre nuestro rename y esta relectura. Se RECLASIFICA.
      const decision = clasificar({
        politica, dirty: true, wYo,
        mem: { C: commitEsperado, P: cMem, H: [commitEsperado].concat(hMem), F: sha256(bufEscrito) },
        stat: null, sMio: null, gen: leerGen(), disk: d,
      });
      return { ok: false, reclasificado: decision };
    }
    if (d.F !== sha256(bufEscrito)) return { ok: false, reclasificado: { tipo: 'conflicto', caso: 8 } };
    ultimaImagenConfirmada = bufEscrito;
    cMem = d.C; pMem = d.P; hMem = d.H; gMem = d.gen; fMio = d.F;
    try { const s = fs.statSync(dbPath); sMio = { mtimeMs: s.mtimeMs, size: s.size }; } catch (e) {}
    dirty = false;
    return { ok: true };
  }

  function get(sql) { const r = db.exec(sql); return r.length ? r[0].values : []; }

  return {
    abrir, run, escribirMultiple, get, clasificar, comprobarEscrituraPosible,
    bloquearEscrituras, levantarLatch, recargarDesdeDisco, pareceUbicacionNueva,
    escribirAtomico,
    // introspección para las pruebas
    estado: () => ({
      cMem, pMem, hMem: hMem.slice(), gMem, fMio, sMio, dirty,
      escrituraBloqueada, wYo,
      ultimaImagenConfirmada,
      politica,
    }),
    setPolitica: (p) => { politica = p; },
    rutas: () => ({ dbPath, genPath }),
    registro: () => registro.slice(),
    _leerDisco: leerDisco,
    _leerGen: leerGen,
    _fotografiar: fotografiar,
  };
}

module.exports = {
  crearNucleo, clasificar, escribirAtomico, ErrorDb,
  MOTIVOS_IRREVERSIBLES, MOTIVOS_LEVANTABLES, FSYNC_NO_SOPORTADO, sha256,
};
