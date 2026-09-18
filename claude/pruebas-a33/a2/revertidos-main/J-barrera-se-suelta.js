const { app, BrowserWindow, ipcMain, shell, Menu, dialog, nativeTheme, session, safeStorage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL, fileURLToPath } = require('url');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const os = require('os');
// 'original-fs': Electron parchea el módulo 'fs' normal para que cualquier
// ruta cuyo tramo final termine en ".asar" se interprete como "un archivo
// DENTRO de ese asar" en vez de el propio archivo .asar como tal — probado
// en real (v0.1.22, función "Aplicar parche"): `fs.readFileSync()` sobre un
// .asar suelto falla con "ENOENT, not found in <ruta>" aunque el archivo
// exista de sobra en disco. 'original-fs' es el módulo que ya trae Electron
// para saltarse ese parcheado cuando de verdad se necesita tratar un .asar
// como archivo normal (leerlo, copiarlo, sustituirlo) — se usa en
// applyAsarPatch() y en el script del ayudante más abajo.
const originalFs = require('original-fs');

// ------------------------------------------------------------------
// A3.1 (auditoría 2026-09-13) — UNA SOLA INSTANCIA POR PC.
//
// Hasta ahora nada impedía abrir Panorama dos veces en el mismo equipo. Con
// sql.js la base de datos entera vive en memoria y se reescribe COMPLETA en
// cada operación (ver persist() en db.js), así que dos instancias sobre el
// mismo panorama.sqlite3 no se mezclan: la última en escribir borra todo lo
// que hizo la otra (proyectos creados, filas de backups, orden de tarjetas,
// tema, y la sal/verificador de la Seguridad). Sobre esto último se demostró
// en pruebas que puede llegar a ser pérdida permanente de datos: si la
// segunda instancia revierte la sal recién consolidada por un cambio de
// contraseña, los archivos quedan cifrados con una clave que ya no se puede
// derivar.
//
// POR QUÉ AQUÍ ARRIBA DEL TODO, y no más abajo:
//   1. Antes de `require('./db')` (más abajo en este mismo archivo): la
//      segunda instancia sale sin llegar a cargar sql.js ni a abrir nada.
//   2. Antes de applyCustomUserDataDirIfConfigured(): la segunda instancia no
//      llega a escribir ni el archivo de prueba de escritura en la carpeta de
//      datos del usuario. NO TOCA NINGÚN DATO.
//   3. Y sobre todo: el cerrojo de instancia única de Electron se ancla en la
//      ruta de `userData`. Si se pidiera DESPUÉS de app.setPath('userData',
//      <carpeta de Google Drive>), el propio cerrojo viviría dentro de la
//      carpeta sincronizada y viajaría a los demás PCs — con riesgo de que
//      otro equipo se negara a arrancar creyendo que este lo tiene tomado.
//      Pidiéndolo aquí, `userData` sigue siendo la carpeta LOCAL por defecto
//      de Windows, así que el cerrojo es siempre local a esta máquina, que es
//      exactamente lo que se quiere: "una instancia por PC", sin decir nada
//      sobre los demás equipos (eso es otro problema distinto, ver la
//      advertencia de carpeta compartida en openSecurityWindow).
//
// Se usa app.exit(0) y no app.quit(): quit() no interrumpe la ejecución de
// este módulo y quedarían por debajo miles de líneas de inicialización.
// exit() termina en el acto, y a estas alturas no hay nada que cerrar bien.
//
// Ojo con los relanzamientos: la app se relanza a sí misma en tres sitios
// (changeUserDataLocation, resetUserDataLocationToDefault y el ayudante de
// "Aplicar parche"). Los tres arrancan el proceso nuevo cuando el anterior ya
// ha terminado, así que el cerrojo debería estar libre — comprobado en las
// pruebas de esta versión.
// ------------------------------------------------------------------
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
}
app.on('second-instance', () => {
  // Otro doble clic en el icono con la app ya abierta: en vez de una segunda
  // copia, se trae al frente la ventana que ya hay (el lanzador si existe, y
  // si no la primera ventana viva) — mismo gesto que espera cualquier
  // aplicación de escritorio de Windows.
  const win =
    launcherWin && !launcherWin.isDestroyed()
      ? launcherWin
      : BrowserWindow.getAllWindows().find((w) => w && !w.isDestroyed());
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
});

// ------------------------------------------------------------------
// v0.1.47: recuperación automática si un parche futuro rompe el arranque —
// nace directamente del incidente real de la 0.1.44 (parche entregado sin
// `node_modules/sql.js`: `require('./db')` moría aquí mismo, y lo único que
// veía el usuario era el diálogo genérico de Electron "A JavaScript error
// occurred in the main process", con la app sin abrir y sin ninguna pista
// de qué hacer salvo restaurar el backup a mano — ver
// claude/Restaurar-backup.bat, creado precisamente para ese rescate).
//
// Se registra un manejador de 'uncaughtException' ANTES de los dos
// requires más frágiles del arranque (los que dependen de que el propio
// código del parche esté completo: './db' y './security'). Si cualquiera
// de los dos revienta, el manejador intenta volver a la versión anterior
// de app.asar — pero, desde P18 (18 sept 2026), SOLO a una cuya procedencia
// se pueda demostrar (ver el bloque P18 más abajo): ya no elige «el
// `app.asar.bak-*` más reciente» de la carpeta de datos. Deja un mensaje
// claro y pide reabrir, sin reabrirse sola (mismo criterio que "Aplicar
// parche": nunca reabrir automáticamente, para no arriesgar un bucle).
//
// Deliberadamente limitado a la ventana de arranque: en cuanto
// app.whenReady() resuelve (ver más abajo), este manejador se desactiva
// solo. Pasado ese punto un error no capturado NO debe disparar un
// rollback silencioso — podría haber una ventana de proyecto abierta con
// cambios sin guardar, y sustituirle el app.asar por debajo no soluciona
// nada ahí; a partir de ese momento se vuelve al comportamiento normal de
// Electron (el diálogo de siempre).
//
// No se reutiliza ERROR_CODES/errorCodeSuffix() aquí a propósito: esa
// tabla es un `const` definido más abajo en este mismo archivo, y este
// bloque se ejecuta ANTES de que esa línea llegue a evaluarse — usarla
// aquí lanzaría "Cannot access before initialization". Los códigos
// PS-1007/PS-1008 sí están dados de alta en esa tabla para que aparezcan
// en "Ver códigos de error...", solo que el texto de este diálogo
// concreto va literal, no a través de esa función.
function findLatestAsarBackupForRecovery(dir) {
  try {
    const files = originalFs
      .readdirSync(dir)
      .filter((f) => f.startsWith('app.asar.bak-'))
      .sort()
      .reverse(); // el timestamp ISO-8601 del nombre ordena igual que la fecha real
    return files.length ? files[0] : null;
  } catch (e) {
    return null;
  }
}

// P9 (17 sept 2026): lee location.json con el MISMO lector que el arranque
// (leerConfigUbicacion, más abajo; es una declaración de función, así que ya
// existe aunque este manejador salte antes de que se evalúe el resto del
// archivo). Si el archivo existe pero no se puede usar, devuelve null: no hay
// carpeta de datos resuelta, y por tanto tampoco de dónde restaurar. Antes se
// buscaba en la carpeta por defecto, donde puede haber copias de app.asar mucho
// más antiguas que las de la carpeta de datos de verdad.
// Con JSON válido, lo de siempre: la configurada si existe, y si no, la de por
// defecto.
function resolveDataDirForStartupRecovery() {
  try {
    const cfg = leerConfigUbicacion();
    if (cfg.estado === 'ausente') return app.getPath('userData');
    if (cfg.estado !== 'valido') return null;
    if (fs.existsSync(cfg.userDataDir)) return cfg.userDataDir;
    return app.getPath('userData');
  } catch (e) {
    return null;
  }
}

// ------------------------------------------------------------------
// P18 (18 sept 2026) — PROCEDENCIA DE LA COPIA DE app.asar QUE SE RESTAURA.
//
// Antes, el rescate restauraba «el app.asar.bak-* de nombre más alto» de la
// carpeta de DATOS, sin saber de qué equipo, de qué instalación ni de qué
// parche venía: en esta máquina, SEIS instalaciones distintas habían dejado
// copias en la carpeta compartida, y con Drive sin montar habría puesto la
// v0.1.28 sobre la 2.0.55. Ahora solo se restaura AUTOMÁTICAMENTE una copia
// cuya procedencia se demuestra en el momento:
//   · vive en la carpeta de recuperación LOCAL (%LOCALAPPDATA%, que ni Drive
//     ni un perfil móvil sincronizan), con nombre `app.asar.pred-<op>` — que
//     la retención heredada (`app.asar.bak-*`, 2 por mtime) no ve nunca;
//   · la nombra una operación VERIFICADA del manifiesto local
//     (asar-procedencia.json), escrita por ESTE equipo (installation-id de
//     A3.3, que aquí solo se LEE);
//   · su hash sigue siendo el que se guardó, y el app.asar instalado es
//     EXACTAMENTE el que dejó esa operación;
//   · y es la ÚNICA que cumple todo eso.
// Si el app.asar instalado no se puede leer o no coincide, NO se restaura
// sola: se pregunta (Cerrar por defecto; Esc/X = Cerrar). Las copias
// `app.asar.bak-*` heredadas no son candidatas NUNCA: no hay forma de
// demostrar de dónde salen. Se siguen creando (camino manual transitorio,
// hasta D4) y el registro dice cuántas hay, pero ya no deciden nada.
//
// LÍMITE, dicho sin adornos: todo esto vive en main.js, DENTRO de app.asar.
// Solo existe si Electron consigue montar el asar y cargar main.js. Con el
// asar truncado, con la cabecera rota, sin main.js dentro o sin archivo, no
// se ejecuta NI UNA línea de Panorama (medido el 18 sept 2026 con el build
// empaquetado). Ese rescate es de la Fase 2 / D4 (mecanismo externo).
//
// Autocontenidas A PROPÓSITO, como leerConfigUbicacion(): el rescate las
// llama antes de que existan las constantes de módulo, y justo cuando
// require('./db') puede ser lo que ha fallado.
// ------------------------------------------------------------------
function rutaInstallationIdParaRescate() {
  // La MISMA ubicación que cargarInstallationId() de db.js. Aquí solo se lee:
  // crear el id es, y sigue siendo, cosa de db.js.
  return path.join(app.getPath('appData'), 'panorama-app-config', 'installation-id');
}

function leerInstallationIdParaRescate() {
  let v;
  try {
    v = fs.readFileSync(rutaInstallationIdParaRescate(), 'utf8');
  } catch (e) {
    if (e && e.code === 'ENOENT') return { estado: 'ausente' };
    return { estado: 'ilegible', motivo: String((e && e.code) || 'error de lectura') };
  }
  v = String(v).trim();
  // Un id de sesión es el que db.js improvisa cuando NO pudo persistir el
  // suyo: allí ya no vale como prueba de identidad, y aquí tampoco.
  if (/^sesion-/.test(v)) return { estado: 'de-sesion' };
  if (!/^[0-9a-f]{32}$/.test(v)) return { estado: 'ilegible', motivo: 'formato inesperado' };
  return { estado: 'valido', id: v };
}

function carpetaRecuperacionAsar() {
  // LOCAL de verdad: %LOCALAPPDATA% no lo sincroniza Drive ni viaja en un
  // perfil móvil (%APPDATA% sí puede). Sin él no hay dónde guardar una copia
  // fiable: null, y entonces no hay recuperación automática.
  const base = process.platform === 'win32' ? process.env.LOCALAPPDATA : null;
  return base ? path.join(base, 'panorama-app-recovery') : null;
}

function rutaManifiestoProcedencia() {
  return path.join(app.getPath('appData'), 'panorama-app-config', 'asar-procedencia.json');
}

function leerManifiestoProcedencia() {
  let txt;
  try {
    txt = fs.readFileSync(rutaManifiestoProcedencia(), 'utf8');
  } catch (e) {
    if (e && e.code === 'ENOENT') return { estado: 'ausente' };
    return { estado: 'ilegible', motivo: String((e && e.code) || 'error de lectura') };
  }
  let j;
  try {
    j = JSON.parse(txt);
  } catch (e) {
    return { estado: 'ilegible', motivo: 'JSON roto o truncado' };
  }
  if (!j || typeof j !== 'object' || j.v !== 1 || !Array.isArray(j.operaciones)) {
    return { estado: 'ilegible', motivo: 'estructura inesperada' };
  }
  return { estado: 'valido', manifiesto: j };
}

// originalFs: la ruta puede terminar en «.asar», y el fs parcheado de Electron
// la trataría como un archivo DE DENTRO de ese asar.
// Nombre propio a propósito: el hash del rekey (sha256DeArchivo, más abajo)
// devuelve un objeto, y otra declaración de módulo con este nombre la sustituiría.
function sha256HexArchivoP18(ruta) {
  return crypto.createHash('sha256').update(originalFs.readFileSync(ruta)).digest('hex');
}

// Versión leída de la CABECERA del asar (su package.json), sin ejecutar ni
// extraer nada. null si no es un asar legible.
function versionDeAsar(ruta) {
  let fd;
  try {
    fd = originalFs.openSync(ruta, 'r');
    const h = Buffer.alloc(16);
    if (originalFs.readSync(fd, h, 0, 16, 0) !== 16) return null;
    const S = h.readUInt32LE(4);
    const L = h.readUInt32LE(12);
    if (!S || !L || L > 64 * 1024 * 1024) return null;
    const hb = Buffer.alloc(L);
    if (originalFs.readSync(fd, hb, 0, L, 16) !== L) return null;
    const pj = JSON.parse(hb.toString('utf8')).files['package.json'];
    if (!pj || !(pj.size > 0) || pj.size > 1024 * 1024) return null;
    const pb = Buffer.alloc(pj.size);
    if (originalFs.readSync(fd, pb, 0, pj.size, 8 + S + Number(pj.offset)) !== pj.size) return null;
    const v = JSON.parse(pb.toString('utf8')).version;
    return typeof v === 'string' && /^\d+\.\d+\.\d+/.test(v) ? v : null;
  } catch (e) {
    return null;
  } finally {
    if (fd !== undefined) {
      try {
        originalFs.closeSync(fd);
      } catch (e) {
        /* da igual */
      }
    }
  }
}

// Qué se puede hacer para recuperar. NO escribe nada.
//   'auto'      → exactamente UNA predecesora demostrada, y el app.asar
//                  instalado es EXACTAMENTE el que dejó su operación.
//   'confirmar' → exactamente UNA predecesora demostrada, pero el app.asar
//                  instalado no se puede leer o no coincide con lo verificado:
//                  puede ser corrupción, un instalador, otro proceso o un
//                  estado que el manifiesto ya no representa. No se distingue
//                  sola: decide una persona.
//   'no'        → no hay recuperación verificable (sin identidad, sin
//                  manifiesto, manifiesto ilegible, sin copia, hash de la copia
//                  que no cuadra, o AMBIGÜEDAD: más de una candidata).
function analizarRecuperacionAsar(asarInstalado) {
  const r = { decision: 'no', motivo: '', manifiesto: null, operacion: null, rutaCopia: null };
  const ident = leerInstallationIdParaRescate();
  if (ident.estado !== 'valido') {
    r.motivo = `la identidad de este equipo (installation-id) está ${ident.estado}`;
    return r;
  }
  const dir = carpetaRecuperacionAsar();
  if (!dir) {
    r.motivo = 'no hay carpeta de recuperación local';
    return r;
  }
  const man = leerManifiestoProcedencia();
  r.manifiesto = man.estado;
  if (man.estado === 'ausente') {
    r.motivo = 'no hay ninguna operación de parcheo registrada en este equipo';
    return r;
  }
  if (man.estado !== 'valido') {
    r.motivo = `el registro de procedencia no se puede leer (${man.motivo})`;
    return r;
  }
  const HEX64 = /^[0-9a-f]{64}$/;
  const candidatas = [];
  for (const op of man.manifiesto.operaciones) {
    if (!op || typeof op !== 'object') continue;
    if (op.estado !== 'verificada') continue; // ni 'preparada' ni 'fallida'
    if (op.installation_id !== ident.id) continue; // de otro equipo
    if (!HEX64.test(op.sha256_anterior) || !HEX64.test(op.sha256_nuevo_real) || !HEX64.test(op.sha256_copia_local)) continue;
    if (op.sha256_anterior === op.sha256_nuevo_real) continue; // reaplicar lo mismo: no aporta rescate
    if (op.sha256_copia_local !== op.sha256_anterior) continue;
    if (typeof op.nombre_copia !== 'string' || !/^app\.asar\.pred-[0-9a-f]{16}$/.test(op.nombre_copia)) continue;
    const rutaCopia = path.join(dir, op.nombre_copia);
    let shaCopia;
    try {
      shaCopia = sha256HexArchivoP18(rutaCopia);
    } catch (e) {
      continue; // copia local ausente o ilegible
    }
    if (shaCopia !== op.sha256_anterior) continue; // truncada o alterada
    candidatas.push({ op, rutaCopia });
  }
  if (!candidatas.length) {
    r.motivo = 'ninguna operación verificada de este equipo tiene su copia local intacta';
    return r;
  }
  let shaInstalado = null;
  try {
    shaInstalado = sha256HexArchivoP18(asarInstalado);
  } catch (e) {
    shaInstalado = null;
  }
  const exactas = shaInstalado ? candidatas.filter((c) => c.op.sha256_nuevo_real === shaInstalado) : [];
  if (exactas.length > 1) {
    r.motivo = `hay ${exactas.length} operaciones que corresponden al app.asar instalado: ambigüedad`;
    return r;
  }
  if (exactas.length === 1) {
    Object.assign(r, { decision: 'auto', operacion: exactas[0].op, rutaCopia: exactas[0].rutaCopia });
    r.motivo = 'predecesora verificada del app.asar instalado';
    return r;
  }
  if (candidatas.length > 1) {
    r.motivo = `hay ${candidatas.length} predecesoras verificadas y ninguna corresponde al app.asar instalado: ambigüedad`;
    return r;
  }
  Object.assign(r, { decision: 'confirmar', operacion: candidatas[0].op, rutaCopia: candidatas[0].rutaCopia });
  r.motivo = shaInstalado
    ? 'el app.asar instalado no coincide con la instalación verificada'
    : 'el app.asar instalado no se puede leer';
  return r;
}

// Guarda el asar actual (como antes) y pone encima la predecesora, y RELEE el
// resultado: si lo restaurado no tiene el hash de la copia, se dice, no se da
// por bueno. Se usa copyFileSync sobre el archivo real a propósito: es lo que
// ya estaba probado con la app en marcha (renombrar encima de un asar montado
// puede no estar permitido en Windows).
function restaurarPredecesoraVerificada(a, asarInstalado) {
  if (originalFs.existsSync(asarInstalado)) {
    originalFs.copyFileSync(
      asarInstalado,
      path.join(process.resourcesPath, 'app.asar.broken-' + new Date().toISOString().replace(/[:.]/g, '-'))
    );
  }
  originalFs.copyFileSync(a.rutaCopia, asarInstalado);
  if (sha256HexArchivoP18(asarInstalado) !== a.operacion.sha256_anterior) {
    throw new Error('el app.asar restaurado no tiene el hash de la copia verificada');
  }
}

// Solo para SOPORTE: qué copias heredadas hay. No decide nada.
function describirCopiasHeredadasParaSoporte() {
  try {
    const dir = resolveDataDirForStartupRecovery();
    if (!dir) return 'copias heredadas: carpeta de datos no resuelta';
    const n = originalFs.readdirSync(dir).filter((f) => f.startsWith('app.asar.bak-')).length;
    const mayor = findLatestAsarBackupForRecovery(dir);
    return `copias heredadas app.asar.bak-*: ${n}${mayor ? ` (la de nombre más alto es ${mayor})` : ''} — NO se usan: no tienen procedencia verificable`;
  } catch (e) {
    return 'copias heredadas: no se pudieron contar';
  }
}

let startupRecoveryArmed = true;
function handleFatalStartupError(err) {
  if (!startupRecoveryArmed) return; // ya pasado el arranque: comportamiento normal de Electron
  startupRecoveryArmed = false; // una sola vez, no reintentar en bucle
  const detail = (err && err.stack) || (err && err.message) || String(err);
  try {
    fs.appendFileSync(
      path.join(app.getPath('userData'), 'app.log'),
      `[${new Date().toISOString()}] ERROR PS-1007 — fallo no capturado durante el arranque: ${detail}\n`,
      'utf8'
    );
  } catch (e) {
    /* si ni el log se puede escribir, se sigue igualmente con la recuperación */
  }
  // P18: qué se puede hacer, y por qué. Nada de esto escribe.
  const realAsar = path.join(process.resourcesPath, 'app.asar');
  const logRescate = (linea) => {
    try {
      fs.appendFileSync(path.join(app.getPath('userData'), 'app.log'), `[${new Date().toISOString()}] ${linea}\n`, 'utf8');
    } catch (e) {
      /* no crítico */
    }
  };
  let analisis;
  try {
    analisis = analizarRecuperacionAsar(realAsar);
  } catch (e) {
    analisis = { decision: 'no', motivo: `no se pudo analizar la recuperación: ${String((e && e.message) || e)}`, manifiesto: null };
  }
  logRescate(`PS-1007 — recuperación: ${analisis.decision} (${analisis.motivo}). ${describirCopiasHeredadasParaSoporte()}.`);
  const queSeRestaura = (op) =>
    `la versión ${op.version_anterior || 'anterior'} que había en este equipo antes del parche del ` +
    `${String(op.verificada_at || op.creada_at || '').slice(0, 10) || '(fecha desconocida)'}`;
  // Sin procedencia verificable: se informa y se cierra. NO se ofrece
  // Restaurar-backup.bat: P18 demostró que tampoco sabe de dónde sale la copia.
  const sinRecuperacion = (codigo) => {
    dialog.showErrorBox(
      'Panorama del Servicio no pudo iniciar',
      'Ha ocurrido un error al arrancar.\n\nDetalle técnico:\n' +
        detail +
        '\n\nNo hay ninguna copia de app.asar cuya procedencia se pueda verificar en este equipo, así que NO ' +
        'se ha restaurado nada automáticamente (motivo: ' +
        analisis.motivo +
        ').\n\nReinstala Panorama del Servicio con su instalador, o aplica un parche soportado. Tus datos no ' +
        'se han tocado.\n\n(código ' +
        codigo +
        ')'
    );
  };
  try {
    if (analisis.decision === 'auto') {
      restaurarPredecesoraVerificada(analisis, realAsar);
      logRescate(`PS-1007 — restaurada automáticamente la predecesora verificada de la operación ${analisis.operacion.operation_id}.`);
      dialog.showErrorBox(
        'Panorama del Servicio no pudo iniciar — restaurado automáticamente',
        'Ha ocurrido un error al arrancar.\n\nDetalle técnico:\n' +
          detail +
          '\n\nSe ha restaurado automáticamente ' +
          queSeRestaura(analisis.operacion) +
          '. Es la copia verificada que guardó este mismo equipo al aplicar ese parche.\n\nCierra este ' +
          'mensaje y vuelve a abrir "Panorama del Servicio" tú mismo — no se reabre sola.\n\n(código PS-1007)'
      );
    } else if (analisis.decision === 'confirmar') {
      let eleccion = 0;
      try {
        eleccion = dialog.showMessageBoxSync({
          type: 'warning',
          title: 'Panorama del Servicio no pudo iniciar',
          message: 'El archivo actual no coincide con la instalación verificada.',
          detail:
            'Ha ocurrido un error al arrancar, y el app.asar instalado ' +
            (analisis.motivo === 'el app.asar instalado no se puede leer' ? 'no se puede leer' : 'no es el que dejó el último parche verificado') +
            '. Puede ser una corrupción, un instalador, otro programa, o un estado que este equipo ya no tiene ' +
            'registrado — no se puede distinguir solo, así que no se restaura nada sin preguntar.\n\n' +
            'Sí hay una copia verificada: ' +
            queSeRestaura(analisis.operacion) +
            '.\n\nDetalle técnico:\n' +
            detail +
            '\n\n(código PS-1027)',
          buttons: ['Cerrar', 'Restaurar la versión anterior verificada'],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        });
      } catch (e) {
        // Si no se puede preguntar, no se restaura: preguntar es la condición.
        eleccion = 0;
        logRescate(`PS-1027 — no se pudo mostrar la confirmación (${String((e && e.message) || e)}); no se restaura nada.`);
      }
      if (eleccion === 1) {
        restaurarPredecesoraVerificada(analisis, realAsar);
        logRescate(`PS-1027 — restaurada POR CONFIRMACIÓN EXPLÍCITA la predecesora de la operación ${analisis.operacion.operation_id}.`);
        dialog.showErrorBox(
          'Panorama del Servicio — versión anterior restaurada',
          'Se ha restaurado ' +
            queSeRestaura(analisis.operacion) +
            '.\n\nVuelve a abrir "Panorama del Servicio" tú mismo — no se reabre sola.\n\n(código PS-1027)'
        );
      } else {
        logRescate('PS-1027 — cerrado sin restaurar (elegido «Cerrar», o Esc/X).');
      }
    } else {
      sinRecuperacion(analisis.manifiesto === 'ilegible' ? 'PS-1026' : 'PS-1025');
    }
  } catch (recoveryError) {
    const recoveryDetail = String((recoveryError && recoveryError.message) || recoveryError);
    try {
      fs.appendFileSync(
        path.join(app.getPath('userData'), 'app.log'),
        `[${new Date().toISOString()}] ERROR PS-1008 — la recuperación automática también falló: ${recoveryDetail}\n`,
        'utf8'
      );
    } catch (e) {
      /* no crítico */
    }
    // P18: no se recomienda Restaurar-backup.bat — tampoco verifica la
    // procedencia de la copia que restaura. Hasta D4, la salida soportada es
    // reinstalar o aplicar un parche.
    dialog.showErrorBox(
      'Panorama del Servicio no pudo iniciar, y la recuperación automática también falló',
      'Error original:\n' +
        detail +
        '\n\nError al intentar recuperar:\n' +
        recoveryDetail +
        '\n\nReinstala Panorama del Servicio con su instalador, o aplica un parche soportado. Tus datos no se ' +
        'han tocado.\n\n(código PS-1008)'
    );
  }
  app.exit(1);
}

process.on('uncaughtException', handleFatalStartupError);

const dbmod = require('./db');
const securitymod = require('./security');
// E2 (15 sept 2026) — fuente ÚNICA del estado temporal del servicio, compartida
// con el dashboard de cada proyecto (que la carga con <script>, ver
// `fixVendorScriptPaths`). Vive en `vendor/` porque es JS puro: ni DOM, ni
// Electron. Antes esta lógica estaba duplicada aquí y en la plantilla del
// dashboard, y las dos copias ya habían divergido.
const serviceStatusMod = require('./vendor/service-status.js');

// v2.0.40: "cifrar si toca" -- las 4 rutas de guardado que persisten contenido
// del usuario en disco (backup:save, meeting:savePrep, meeting:updatePrep,
// candidateEval:save) repetían literalmente esta misma línea (auditoría
// 2026-09-12, sección 3, prioridad baja). `securityKey` es la clave de
// seguridad global de la app (null si la Seguridad está desactivada).
//
// Bloque 3 — BARRERA DE SEGURIDAD DE LA SESIÓN.
//
// Devuelve un motivo cuando NO se puede seguir escribiendo contenido del
// usuario, o null cuando todo está en orden. Dos situaciones:
//
//   'revalidacion'       — la base de datos que tenemos delante ya no es la
//                          que correspondía a la clave en memoria (adopción
//                          de otro equipo), o tiene la Seguridad activa y
//                          esta sesión todavía no ha validado ninguna clave.
//   'rollback-incompleto'— un cambio de Seguridad se deshizo a medias y hay
//                          archivos cuyo estado no se pudo demostrar.
//
// La comprobación NO puede depender de que exista una clave. Ese fue un
// defecto real: `revalidarSeguridadTrasAdopcion()` pone `securityKey = null`,
// los cuatro puntos de guardado calculan `isEncrypted = !!securityKey`, y con
// la guarda atada a `isEncrypted` el resultado era que el contenido se
// escribía EN CLARO, sin lanzar, justo después de invalidar la clave.
let seguridadEnEstadoInconsistente = null;   // null | string con el detalle

function bloqueoDeSeguridad() {
  if (seguridadEnEstadoInconsistente) {
    return {
      motivo: 'rollback-incompleto',
      mensaje:
        'Un cambio de Seguridad se deshizo a medias y hay archivos cuyo estado no se ha podido comprobar. ' +
        'Panorama del Servicio no va a escribir nada más en esta sesión para no empeorarlo.\n\n' +
        seguridadEnEstadoInconsistente +
        '\n\nCierra la aplicación y revisa el registro (app.log) antes de seguir trabajando.',
    };
  }
  if (seguridadRequiereRevalidacion) {
    return {
      motivo: 'revalidacion',
      mensaje:
        'La base de datos ha cambiado desde otro equipo y la contraseña de esta sesión todavía no se ha ' +
        'validado contra ella. Cierra Panorama del Servicio y vuelve a abrirlo para introducir la ' +
        'contraseña correcta; no se ha guardado nada.',
    };
  }
  return null;
}

function encryptIfNeeded(payload, isEncrypted) {
  // Se comprueba SIEMPRE, cifre o no: mientras la Seguridad de esta sesión no
  // esté validada, escribir en claro es tan malo como cifrar con la clave
  // equivocada — más, porque deja contenido del usuario legible en una
  // carpeta compartida.
  const b = bloqueoDeSeguridad();
  if (b) { const e = new Error(b.mensaje); e.bloqueoSeguridad = b.motivo; throw e; }
  return isEncrypted ? securitymod.encryptString(securityKey, payload) : payload;
}

// v2.0.40: shell.openPath() nunca rechaza como promesa -- resuelve con un
// string vacío si fue bien, o con el mensaje de error si no pudo abrir la
// ruta (carpeta borrada a mano, sin aplicación asociada, etc). 9 de las 10
// llamadas de este archivo ignoraban ese string en silencio (auditoría
// 2026-09-12, sección 4) -- son todas de "abrir esta carpeta en el
// explorador" disparadas desde un menú/botón sin ningún resultado que
// mostrar en la UI, así que el registro mínimo honesto es un console.warn en
// vez de tragarlo del todo. (La única llamada que ya sí lo comprobaba,
// candidateEval:openCv, sigue igual -- ahí el error SÍ se muestra en la UI.)
function openPathLogged(targetPath) {
  return shell.openPath(targetPath).then((err) => {
    // B3: además del warn (útil en desarrollo), rastro persistente. Sin la
    // ruta completa: basta el nombre del último tramo para situarlo.
    if (err) {
      appLog(`No se pudo abrir en el explorador "${path.basename(String(targetPath))}": ${motivoSinRutas(err)}`);
      console.warn(`No se pudo abrir "${targetPath}" con shell.openPath:`, err);
    }
    return err;
  });
}

// En Windows, Electron recomienda fijar explícitamente el "AppUserModelID"
// nada más arrancar — es lo que usa Windows para saber que ESTE proceso en
// ejecución es la misma app que apunta un acceso directo/anclado en la
// barra de tareas (agrupación correcta, notificaciones, y también el icono
// que se muestra mientras la app está abierta). Debe coincidir exactamente
// con el mismo id que usa electron-builder para los accesos directos (ver
// build.appId en package.json, y WinShell::SetLnkAUMI en
// build/installer.nsh) — si no se fija aquí, Windows a veces no logra
// asociar bien el icono de la ventana en ejecución con el de su acceso
// directo, y puede acabar mostrando uno genérico/en blanco.
//
// v0.1.31 lo desactivó de forma experimental porque el usuario estaba
// usando una copia PORTABLE (extraída a mano de un .zip, sin pasar por el
// instalador) — sin un acceso directo instalado con ese mismo identificador
// registrado, fijarlo aquí causaba justo el icono en blanco que se quería
// evitar (confirmado por el usuario: desactivarlo lo arregló). v0.1.32
// vuelve a activarlo porque a partir de aquí se pasa a distribuir el
// instalador NSIS de verdad — que SÍ registra ese mismo identificador en
// los accesos directos que crea (Menú Inicio vía electron-builder, y
// escritorio vía build/installer.nsh) — así que aquí vuelve a ser correcto
// tenerlo activo, tal y como estaba pensado originalmente.
//
// Si en el futuro se vuelve a distribuir una copia portable (sin
// instalador), desactivarlo otra vez como hizo 0.1.31 — los dos escenarios
// necesitan lo contrario el uno del otro.
if (process.platform === 'win32') {
  app.setAppUserModelId('com.panorama.servicio.desktop');
}

// ------------------------------------------------------------------
// Códigos de error (v0.1.41) — pedido explícito del usuario tras señalar que
// pedir "haz una captura de este mensaje" (texto que tenía el aviso de datos
// no encontrados de la 0.1.40) es poco profesional. En vez de eso, cada
// fallo real que ya mostraba un diálogo de error lleva ahora un código corto
// y estable (PS-xxxx) al final del mensaje — mucho más útil para comunicar
// "qué pasó" (a soporte, o pegado tal cual en un mensaje) que una captura de
// pantalla, y no depende de que el usuario sepa hacer una captura o de que
// el diálogo siga en pantalla cuando lo cuenta.
//
// Agrupados por área (primer dígito): 1xxx instalación/parcheo (app.asar),
// 2xxx datos de proyecto y backups, 3xxx ubicación de la carpeta de datos,
// 4xxx exportación/descargas. Cada entrada tiene un título corto (para el
// listado de "Ver códigos de error") y una explicación en primera persona
// hacia el usuario (causa probable + qué hacer) — el propio diálogo de
// error sigue llevando su detalle específico (rutas, mensaje de excepción
// real, etc.), el código es un identificador adicional, no un sustituto.
//
// ÚNICA fuente de verdad para los códigos que se muestran desde el propio
// proceso principal (diálogos nativos). El dashboard (proceso renderer,
// otro archivo, sin acceso directo a este módulo) mantiene su propia
// entrada para PS-2001 en dashboard/plantilla_dashboard.html — debe
// mantenerse en sync con la de aquí si el texto cambia (mismo patrón ya
// usado para computeProjectKeys()/applyProjectKeys()).
const ERROR_CODES = {
  'PS-1001': {
    titulo: 'Sin permisos para escribir en la carpeta de instalación',
    explicacion:
      'La app no pudo escribir en la carpeta donde está instalada — típico de una instalación ' +
      '"para todos los usuarios" (dentro de Archivos de programa, que solo un administrador puede ' +
      'modificar). El diálogo de "Aplicar parche" ya indica las dos formas de solucionarlo.',
  },
  'PS-1002': {
    titulo: 'No se pudo leer el archivo de parche elegido',
    explicacion:
      'El archivo .asar seleccionado no se pudo abrir para calcular su SHA-256 — puede estar dañado, ' +
      'movido/borrado justo después de elegirlo, o bloqueado por otro programa (antivirus).',
  },
  'PS-1003': {
    titulo: 'No se pudo preparar el parche',
    explicacion:
      'Falló la copia de seguridad del app.asar actual o la copia del parche elegido a la carpeta de ' +
      'datos, antes de tocar nada real — la app NO se cerró ni se modificó. Normalmente por falta de ' +
      'espacio en disco o permisos.',
  },
  'PS-1004': {
    titulo: 'No se pudo iniciar la aplicación del parche',
    explicacion:
      'No se pudo lanzar el proceso que aplica el parche tras cerrar la app — el app.asar real NO se ' +
      'tocó. Puede ser un antivirus bloqueando la creación del proceso ayudante.',
  },
  'PS-1005': {
    titulo: 'Carpeta de datos personalizada no disponible al arrancar',
    explicacion:
      'La app no pudo acceder a la carpeta de datos configurada (por ejemplo, una unidad de Google ' +
      'Drive/OneDrive que todavía no había terminado de montarse) tras esperar un buen rato y reintentar. ' +
      'Se está usando (o se usó esa vez) la carpeta de datos local de Windows en su lugar — no se pierde ' +
      'nada, pero no se ven los proyectos más recientes hasta que esa carpeta vuelva a estar disponible y ' +
      'se reabra la app.',
  },
  'PS-1006': {
    titulo: 'Se perdió el acceso a la carpeta de datos durante la sesión',
    explicacion:
      'La app ya había arrancado bien contra la carpeta de datos configurada, pero dejó de poder ' +
      'escribir en ella a media sesión (por ejemplo, un corte de red con la app ya abierta). Mientras ' +
      'dura, la app avisa en cada ventana de proyecto abierta y guarda además una copia de seguridad ' +
      'extra en la carpeta local de Windows por si acaso. En cuanto se recupera el acceso, queda ' +
      'registrado también aquí.',
  },
  'PS-1007': {
    titulo: 'Fallo no capturado durante el arranque — recuperado automáticamente',
    explicacion:
      'Algo rompió el arranque muy pronto (por ejemplo, un parche mal empaquetado) y la app lo ' +
      'detectó antes de mostrar el diálogo genérico de Electron. Se restauró sola la versión anterior ' +
      'VERIFICADA: la copia que guardó este mismo equipo al aplicar el último parche, y solo porque el ' +
      'app.asar instalado era exactamente el que dejó ese parche. Hay que volver a abrir la app a mano, no ' +
      'se reabre sola. OJO: esto solo puede ocurrir si Electron consigue cargar el app.asar; si el archivo ' +
      'está truncado, sin cabecera o no existe, la app no llega a ejecutarse y no hay recuperación posible ' +
      'desde dentro.',
  },
  'PS-1008': {
    titulo: 'Fallo no capturado durante el arranque — la recuperación automática también falló',
    explicacion:
      'Había una copia verificada que restaurar, pero la restauración falló (por ejemplo, sin permisos ' +
      'para escribir en la carpeta de instalación, o el resultado no tenía el hash esperado). Reinstala la ' +
      'app con su instalador, o aplica un parche soportado. Tus datos no se tocan.',
  },
  'PS-1009': {
    titulo: 'No se encontró la base de datos en la carpeta de datos personalizada',
    explicacion:
      'La carpeta de datos personalizada configurada (por ejemplo, compartida por Google Drive/OneDrive) ' +
      'está accesible, pero no tiene ningún "panorama.sqlite3" dentro todavía — a diferencia de PS-1005 ' +
      '(la carpeta en sí no se podía montar), aquí la carpeta SÍ está disponible, pero ese archivo ' +
      'concreto no ha terminado de sincronizarse (o de verdad es la primera vez que se usa esa carpeta). ' +
      'Sin esta comprobación, la app crearía en silencio una base de datos vacía justo ahí, con riesgo de ' +
      'pisar la real en cuanto termine de sincronizar — por eso se para y pregunta antes de seguir.',
  },
  'PS-1010': {
    titulo: 'No se pudo activar la protección de apagado',
    explicacion:
      'Al activar "Protección de apagado (Drive/OneDrive)" no se pudo escribir el archivo que marca la ' +
      'protección como activa, o no se pudo registrar el arranque automático en Windows (reg.exe). Suele ' +
      'ser un problema de permisos sobre la carpeta de datos local del usuario — revisa el registro de la ' +
      'protección para más detalle.',
  },
  'PS-1011': {
    titulo: 'No se pudo desactivar la protección de apagado',
    explicacion:
      'Al desactivar "Protección de apagado (Drive/OneDrive)" no se pudo borrar el archivo que la marca ' +
      'como activa. La copia en segundo plano seguirá corriendo hasta que se elimine ese archivo — ' +
      'reintenta desde el menú, o bórralo a mano (ruta en "Diagnóstico...").',
  },
  'PS-1012': {
    titulo: 'No se pudo gestionar el archivo de bloqueo multi-PC',
    explicacion:
      'Con una carpeta de datos compartida, la app escribe un pequeño archivo (".panorama-lock.json") ' +
      'para avisar a otros PCs de que está abierta, y lo va refrescando mientras dura la sesión. Si no ' +
      'se pudo leer o escribir (permisos, o la carpeta compartida sin conexión un instante), la app NO ' +
      'bloquea el arranque por esto — simplemente ese PC concreto no queda protegido por este aviso en ' +
      'esa sesión. No afecta a los datos en sí, solo al aviso de "abierto en otro equipo".',
  },
  'PS-1013': {
    titulo: 'Fallo interno grave — hay que reiniciar',
    explicacion:
      'Se produjo un error no capturado en el proceso principal de la aplicación. A partir de ese punto no ' +
      'se puede garantizar que lo que la app tiene en memoria sea coherente, así que deja de escribir y ' +
      'pide reiniciar en vez de seguir. No se intenta ningún guardado final a propósito: el contenido de ' +
      'cada proyecto ya está guardado desde que se editó, y guardar desde un proceso en ese estado es ' +
      'justo lo que podría estropear algo. Como mucho se pierde la última copia de seguridad automática.',
  },
  'PS-1014': {
    titulo: 'Fallo interno grave (operación asíncrona) — hay que reiniciar',
    explicacion:
      'Igual que PS-1013, pero el fallo venía de una operación en segundo plano que nadie llegó a atender. ' +
      'Que haya llegado hasta el manejador general significa que se escapó del control normal, así que se ' +
      'trata con la misma prudencia: reiniciar en vez de seguir.',
  },
  'PS-1015': {
    titulo: 'Una ventana se cerró sola',
    explicacion:
      'La ventana de un proyecto dejó de responder (o se quedó sin memoria) y Windows la cerró. Es un fallo ' +
      'LOCAL: el resto de la aplicación sigue bien, y lo que había en esa ventana está guardado, así que ' +
      'recargarla la deja como estaba. Si la misma ventana se cae varias veces seguidas, la app deja de ' +
      'ofrecer recargarla y conviene cerrar y volver a abrir.',
  },
  'PS-1016': {
    titulo: 'No se pudo abrir la base de datos (y no se creó ninguna nueva)',
    explicacion:
      'Al arrancar, la base de datos no estaba donde debería, no se pudo leer, o no se pudo comprobar ' +
      'que el archivo del disco sea realmente el tuyo — y esta instalación NO tenía autorización para ' +
      'crear una nueva en esa carpeta. La app se cierra a propósito en vez de empezar desde cero: así ' +
      'nunca aparece una base de datos vacía encima de la real. Si la carpeta de datos está en Google ' +
      'Drive/OneDrive, lo más habitual es que todavía no haya terminado de sincronizar — espera y vuelve ' +
      'a abrir. No se ha modificado ni borrado nada.',
  },
  'PS-1017': {
    titulo: 'No se pudo dejar constancia del intento de crear la base de datos',
    explicacion:
      'La app iba a crear su base de datos por primera vez en esa carpeta, pero antes de escribir el ' +
      'primer byte no pudo guardar (y releer) en la configuración local de Windows la constancia de ese ' +
      'intento — o no pudo guardar la identidad de este equipo, que es lo que permite reconocer luego una ' +
      'creación interrumpida como propia. Sin esa constancia, un corte de luz a mitad dejaría el permiso ' +
      'de "primera creación" vivo para siempre, y la app podría acabar creando una base de datos vacía ' +
      'más adelante. Por eso NO se ha creado ni escrito nada: revisa los permisos de la carpeta de ' +
      'configuración que indica el propio aviso.',
  },
  'PS-1018': {
    titulo: 'La base de datos está bien, pero no se pudo cerrar el registro local',
    explicacion:
      'La base de datos se abrió (o se creó) correctamente y está INTACTA — no se ha perdido nada — pero ' +
      'no se pudo anotar en la configuración local de Windows que esa carpeta ya tiene datos. La app se ' +
      'cierra a propósito en vez de seguir: si continuara con la ruta "sin constar", el permiso de ' +
      'primera creación seguiría siendo renovable y un arranque posterior podría crear una base de datos ' +
      'vacía. Comprueba los permisos de la carpeta de configuración y vuelve a abrir; se reintenta solo.',
  },
  'PS-1019': {
    titulo: 'Se encontró tu base de datos pero no se pudo registrar esa carpeta',
    explicacion:
      'Es el caso de actualizar desde una versión anterior, o de apuntar un PC nuevo a una carpeta ' +
      'compartida que ya tiene datos: la app SÍ ve tu base de datos, pero no pudo dejar constancia de ' +
      'ello en la configuración local antes de abrirla. NO se ha abierto ni modificado la base de datos. ' +
      'Se para aquí a propósito: sin esa marca previa, si más adelante el archivo no apareciera (unidad ' +
      'de red caída, sincronización a medias), la app podría interpretar esa carpeta como "nunca usada" ' +
      'y crear una vacía. Revisa los permisos de la carpeta de configuración y vuelve a abrir.',
  },
  'PS-1020': {
    titulo: 'No se puede leer la configuración de ubicación de datos',
    explicacion:
      'El archivo location.json (en %APPDATA%\\panorama-app-config) existe, pero no se puede usar: no se ' +
      'puede leer, no está en UTF-8 (ni en UTF-16 con BOM), no es JSON válido, o no indica una ruta absoluta. ' +
      'Antes la app lo trataba igual que si no existiera y abría sin avisar la carpeta de datos por defecto, ' +
      'con otra base de datos o creando una vacía. Ahora se cierra sin abrir, crear ni modificar ninguna base ' +
      'de datos y sin tocar la protección de apagado. Hay que corregir ese archivo. No lo borres: sin él, la ' +
      'app usaría la carpeta de datos por defecto.',
  },
  'PS-1021': {
    titulo: 'Se iba a usar la carpeta de datos LOCAL de este equipo',
    explicacion:
      'La app llegó a la carpeta de datos por defecto por un camino de reserva: la carpeta configurada no ' +
      'estaba disponible (PS-1005), no tenía base de datos (PS-1009), no se pudo comprobar (PS-1022), o ya ' +
      'no hay ninguna configurada. Antes de abrir —o de crear— nada ahí, la app pregunta y enseña qué ' +
      'encontró: fecha y tamaño de esa base de datos local, que puede ser mucho más antigua que la de ' +
      'verdad. Cerrar es lo que se hace por defecto; usarla o crear una vacía exige elegirlo expresamente. ' +
      'Mientras no se elige, no se abre, no se crea y no se toca nada.',
  },
  'PS-1022': {
    titulo: 'La base de datos de la carpeta configurada no se puede comprobar',
    explicacion:
      'El archivo está donde debe, pero no se pudo leer ni verificar en el tiempo de espera (bloqueado por ' +
      'otro programa, permisos, disco o red con problemas, sincronización a medias). Antes, la app se ' +
      'pasaba a la carpeta de datos local en silencio; ahora se para y pregunta: reintentar, usar los datos ' +
      'locales de este equipo a sabiendas, o cerrar. No se abre ninguna base de datos hasta que se elija.',
  },
  'PS-1023': {
    titulo: 'La base de datos local no es utilizable',
    explicacion:
      'En la carpeta de datos por defecto hay un "panorama.sqlite3" que existe pero no es una base de datos ' +
      'reconocible: está vacío (0 bytes), no empieza por la cabecera de SQLite, o no se puede comprobar. La ' +
      'app se cierra sin tocarlo: NO lo abre, NO lo sustituye, NO lo vacía y NO crea otra base encima. Un ' +
      'archivo así puede ser una copia a medias o un resto de un fallo anterior, y borrarlo o pisarlo sería ' +
      'destruir la única pista de lo que pasó.',
  },
  'PS-1024': {
    titulo: 'No se pudo dejar constancia de la ubicación de datos de este equipo',
    explicacion:
      'La app usa una carpeta de datos configurada, pero no pudo guardar (y releer) la constancia de ello en ' +
      'la configuración local de Windows. Esa constancia es la que impide que, más adelante y sin ' +
      'location.json, un arranque confunda este equipo con una instalación nueva. La app sigue funcionando ' +
      'con normalidad, pero esa defensa queda degradada hasta que se pueda escribir: revisa los permisos de ' +
      'la carpeta de configuración. El registro local de ubicaciones de A3.3 sigue guardando la misma ' +
      'información por su cuenta.',
  },
  'PS-1025': {
    titulo: 'Fallo al arrancar sin ninguna copia de app.asar verificable',
    explicacion:
      'El arranque falló y no hay ninguna copia de app.asar cuya procedencia se pueda demostrar en este ' +
      'equipo, así que no se restaura nada. Solo cuenta una copia que este equipo guardó en su carpeta ' +
      'LOCAL de recuperación al aplicar un parche y que quedó verificada. Las copias antiguas ' +
      '(app.asar.bak-…) de la carpeta de datos no cuentan: pueden venir de otro equipo, de otra instalación ' +
      'o de otra época. Es lo normal hasta que se aplique el primer parche con esta versión. Reinstala la ' +
      'app con su instalador, o aplica un parche soportado.',
  },
  'PS-1026': {
    titulo: 'El registro de procedencia de app.asar no se puede leer',
    explicacion:
      'El arranque falló, y el archivo local que registra de dónde sale cada copia de app.asar ' +
      '(asar-procedencia.json) existe pero está dañado o incompleto. Sin él no se puede demostrar nada, así ' +
      'que no se restaura ninguna copia. No lo borres: es la pista de lo que pasó. Reinstala la app con su ' +
      'instalador, o aplica un parche soportado.',
  },
  'PS-1027': {
    titulo: 'El app.asar instalado no coincide con la instalación verificada',
    explicacion:
      'El arranque falló y el app.asar instalado no es el que dejó el último parche verificado (o no se ' +
      'puede leer). Puede ser una corrupción, un instalador, otro programa o un estado que este equipo ya no ' +
      'tiene registrado, y eso no se puede distinguir solo. Por eso no se restaura nada sin preguntar: la app ' +
      'ofrece volver a la versión anterior verificada, y "Cerrar" (o Esc) no toca nada.',
  },
  'PS-2001': {
    titulo: 'Datos del proyecto no encontrados al abrirlo',
    explicacion:
      'El proyecto tiene copias de seguridad guardadas, pero al abrirlo no se encontró el estado ' +
      'guardado en su sitio habitual. Los datos casi seguro siguen intactos en algún backup — usa ' +
      '"Proyecto → Restaurar último backup..." en vez de seguir editando.',
  },
  'PS-2002': {
    titulo: 'No se pudo restaurar el backup',
    explicacion:
      'Se pidió restaurar el último backup del proyecto y falló a media operación — revisa el detalle ' +
      'del propio diálogo (mensaje de la excepción) para la causa exacta. Los datos actuales del ' +
      'proyecto no se tocan si la restauración falla antes de completarse.',
  },
  'PS-2003': {
    titulo: 'Cambio de contraseña / cifrado cancelado — no se cambió nada',
    explicacion:
      'Al activar, cambiar o desactivar la Seguridad hay que volver a cifrar TODOS los archivos del ' +
      'usuario (backups, preparaciones de reunión y evaluaciones de candidatos). Algo falló durante esa ' +
      'migración — un archivo ilegible, disco lleno, o la carpeta compartida sin conexión — y la ' +
      'operación se deshizo entera: tus archivos, tu contraseña y la base de datos quedaron exactamente ' +
      'como estaban antes de empezar. Se puede reintentar sin riesgo.',
  },
  'PS-2004': {
    titulo: 'Re-cifrado interrumpido — revisar',
    explicacion:
      'Un cambio de contraseña (o de estado del cifrado) se interrumpió a mitad y la vuelta atrás no se ' +
      'pudo completar del todo, o se terminó de aplicar automáticamente al volver a abrir la app. Los ' +
      'archivos originales NUNCA se borran hasta que la operación termina bien: si quedó algo a medias, ' +
      'están en la carpeta ".panorama-rekey" dentro de la carpeta de datos. Revisa el registro de la ' +
      'aplicación (app.log) antes de volver a cambiar la contraseña.',
  },
  'PS-2005': {
    titulo: 'Restauración fallida Y la vuelta atrás tampoco se pudo completar',
    explicacion:
      'Al restaurar un backup falló la escritura de los datos y, al intentar devolver el proyecto a como ' +
      'estaba antes, también falló. El estado guardado de ese proyecto puede haber quedado a medias. Todos ' +
      'los backups siguen intactos en disco: restaurar otra vez es seguro. Además se ha dejado una copia de ' +
      'rescate del estado anterior en la carpeta de backups del proyecto (archivo "rescate-restauracion-*"). ' +
      'Revisa el registro de la aplicación (app.log) antes de seguir trabajando en ese proyecto.',
  },
  'PS-2006': {
    titulo: 'Un guardado quedó a medias entre el archivo y la base de datos',
    explicacion:
      'Guardar un backup, una preparación de reunión o una evaluación de candidatos son DOS cosas: el ' +
      'archivo en disco y su registro en la base de datos. No existe forma de hacer las dos a la vez de ' +
      'manera perfectamente atómica, así que la app deja constancia de cada guardado antes de empezarlo ' +
      '(carpeta ".panorama-acciones") y, si algo se interrumpe, al volver a abrir decide con pruebas: o ' +
      'deshace lo que no llegó a registrarse, o reconoce lo que sí se registró y lo da por bueno. Este ' +
      'aviso significa que uno de esos guardados NO se pudo decidir con certeza — normalmente porque el ' +
      'archivo cambió desde otro equipo mientras tanto. No se ha borrado ni sobrescrito nada: se conserva ' +
      'todo el material para poder revisarlo.',
  },
  'PS-3001': {
    titulo: 'No se pudieron copiar los datos a la nueva ubicación',
    explicacion:
      'Al cambiar la carpeta de datos, la copia de proyectos/backups/Directorio de Talento a la ' +
      'carpeta nueva falló — no se cambió nada, se sigue usando la carpeta de antes tal cual.',
  },
  'PS-3002': {
    titulo: 'No se pudo guardar la nueva ubicación de datos',
    explicacion:
      'Los datos se llegaron a copiar (si se eligió copiar) pero no se pudo guardar la preferencia de ' +
      'carpeta — probablemente permisos sobre la carpeta de configuración de Windows. Reintentar desde ' +
      '"Cambiar ubicación de los datos..." suele bastar.',
  },
  'PS-3003': {
    titulo: 'No se pudo volver a la ubicación de datos por defecto',
    explicacion:
      'No se pudo borrar el archivo de preferencia de carpeta personalizada — la app sigue usando la ' +
      'carpeta personalizada configurada, sin perder ningún dato.',
  },
  'PS-4001': {
    titulo: 'La exportación no se pudo guardar',
    explicacion:
      'Se eligió dónde guardar un CSV/Excel/PowerPoint exportado pero el archivo no llegó a escribirse ' +
      'completo en esa ubicación — habitual si la carpeta está bloqueada por el antivirus o por ' +
      'permisos de Windows. Reintenta la exportación, o prueba a guardar en otra carpeta.',
  },
};

function errorCodeSuffix(code) {
  if (!ERROR_CODES[code]) return '';
  // Todo error con código queda registrado también en app.log — así el
  // registro general sirve de rastro de "qué códigos ha visto realmente
  // esta instalación", no solo de lo que el usuario recuerde contar.
  appLog(`ERROR ${code} — ${ERROR_CODES[code].titulo}`);
  return `\n\n(código ${code})`;
}

// ------------------------------------------------------------------
// v2.0.31 — FASE 5b: versión "modal propio" de dialog.showMessageBox(Sync)/
// showErrorBox, para los diálogos aislados de main.js que van dirigidos a
// una ventana concreta que ya carga vendor/modal.js (psConfirm/psAlert).
//
// En vez de montar un canal IPC nuevo de ida y vuelta, se usa
// `webContents.executeJavaScript()`: Electron espera automáticamente a que
// la Promise devuelta por el código ejecutado se resuelva antes de resolver
// la Promise de `executeJavaScript()` — así que desde el proceso principal
// basta con `await modalAlert(...)`/`await modalConfirm(...)`, igual que
// antes con la versión Sync, sin tocar nada del lado de la ventana más allá
// de tener cargado vendor/modal.js. El código se ejecuta en el "mundo
// principal" de la página (no en el aislado de contextBridge), así que sí
// ve `window.psAlert`/`window.psConfirm` (son globales normales, definidos
// por un <script> corriente, no expuestos vía contextBridge).
//
// Si la ventana ya no existe (se cerró justo antes, o nunca llegó a
// abrirse) no hay dónde pintar nada — se resuelve en silencio (alert) o con
// `false` (confirm, la opción segura) en vez de lanzar, igual que hacían
// los `if (win) ...`/`parentWin || undefined` ya existentes en el código.
function modalAlert(win, message, opts) {
  if (!win || win.isDestroyed()) return Promise.resolve();
  const code = `window.psAlert(${JSON.stringify(String(message))}, ${JSON.stringify(opts || {})})`;
  return win.webContents.executeJavaScript(code).catch((e) => {
    console.warn('[modalAlert] no se pudo mostrar el modal:', e);
  });
}
function modalConfirm(win, message, opts) {
  if (!win || win.isDestroyed()) return Promise.resolve(false);
  const code = `window.psConfirm(${JSON.stringify(String(message))}, ${JSON.stringify(opts || {})})`;
  return win.webContents.executeJavaScript(code).catch((e) => {
    console.warn('[modalConfirm] no se pudo mostrar el modal:', e);
    return false;
  });
}

function showErrorCodesDialog(parentWin) {
  const lines = Object.keys(ERROR_CODES)
    .sort()
    .map((code) => `${code} — ${ERROR_CODES[code].titulo}\n${ERROR_CODES[code].explicacion}`)
    .join('\n\n');
  return modalAlert(
    parentWin,
    'Qué significa cada código que puede aparecer en un aviso de la app\n\n' + lines,
    { title: 'Códigos de error de Panorama del Servicio' }
  );
}

// ------------------------------------------------------------------
// Ubicación de datos personalizada (v0.1.30) — permite mover TODA la
// carpeta de datos de la app (base de datos, backups, dashboards
// horneados por proyecto, localStorage de cada proyecto) a una ruta
// elegida por el usuario, típicamente una carpeta sincronizada (Google
// Drive "Mi unidad", OneDrive...) para poder abrir el mismo Panorama del
// Servicio desde varios PCs sin más que apuntar aquí una vez en cada uno.
//
// Por qué esto y no seguir con --user-data-dir en un acceso directo de
// Windows: un usuario editando a mano el campo "Destino" de un acceso
// directo es un sitio muy fácil de estropear sin darse cuenta (una
// comilla de más, un espacio de menos, un carácter raro pegado desde
// otro sitio) — y cuando pasa, el síntoma es "abre pero está vacía" o
// "no abre nada", sin ningún mensaje claro de qué falló exactamente.
// Aquí lo hace la propia app, con un diálogo, sin tocar ningún acceso
// directo — visto en carne propia el 26/08/2026 con varias rondas de
// accesos directos rotos antes de llegar a esto.
//
// Cómo funciona (tiene que decidirse ANTES de que nada mire
// app.getPath('userData') — de ahí que se llame aquí mismo, a nivel de
// módulo, muchísimo antes de app.whenReady):
//   1. La ruta elegida se guarda en un archivo de config MINÚSCULO fuera
//      de la carpeta de datos real: app.getPath('appData') +
//      '/panorama-app-config/location.json'. Esa carpeta de config nunca
//      se mueve decida el usuario lo que decida sobre sus datos — así
//      siempre hay un sitio fijo donde mirar al arrancar.
//   2. Si ese archivo existe y apunta a una carpeta accesible (se
//      comprueba escribiendo y borrando un archivo de prueba, no solo
//      mirando si existe), se llama a app.setPath('userData', esaCarpeta)
//      antes de que nada más toque userData — todo lo demás del código
//      ya usa app.getPath('userData') en todas partes (db.js, backups,
//      dashboards horneados, Partitions de cada proyecto), así que no
//      hace falta tocar nada más para que todo "apunte bien" solo.
//   3. Si la carpeta configurada NO está accesible en este arranque en
//      concreto (por ejemplo, Google Drive todavía no ha montado la
//      unidad G:\), NO se sigue en silencio con la carpeta por defecto
//      sin avisar — eso es exactamente la confusión de "se ve vacío" que
//      costó horas de diagnosticar a mano con accesos directos. Se avisa
//      con un diálogo en cuanto la ventana esté lista (ver
//      customUserDataDirFailure más abajo), y se sigue con la carpeta
//      por defecto sin tocar ni borrar el archivo de config — al
//      siguiente arranque se vuelve a intentar la personalizada.
// ------------------------------------------------------------------
function userDataConfigPath() {
  return path.join(app.getPath('appData'), 'panorama-app-config', 'location.json');
}

// v0.1.42: bug real reportado por el usuario — un día que abrió la app justo
// tras encender el PC, Google Drive todavía no había terminado de montar la
// unidad G:\ (donde tiene configurada su carpeta de datos). La app, con un
// solo intento y sin esperar nada, cayó en silencio a la carpeta de datos
// LOCAL por defecto — el usuario trabajó ahí toda la sesión sin saberlo, y al
// reabrir más tarde (con Drive ya montado) volvió a ver la carpeta de
// verdad, sin nada de lo hecho en medio. Los datos no se perdieron (seguían
// en la carpeta local, se recuperaron a mano comparando ambas copias), pero
// el mecanismo de aviso de entonces (un dialog.showErrorBox tras abrir el
// lanzador) no bastó: fácil de cerrar sin leerlo del todo, y para entonces
// ya se podía estar trabajando sobre la copia equivocada.
//
// Se sustituye por reintentos con espera ANTES de rendirse, en dos tramos:
//   1) Aquí mismo, a nivel de módulo, ANTES de app.whenReady() — tiene que
//      ser así porque Electron solo garantiza que app.setPath('userData',...)
//      surta efecto en todos los módulos si se llama antes de 'ready'. Este
//      tramo es forzosamente BLOQUEANTE (con Atomics.wait — no hay forma de
//      mostrar nada en pantalla todavía, ni la propia splash, porque
//      necesita que la app esté "ready"), así que se mantiene corto
//      (USERDATA_PRE_READY_RETRY_MS) para no dar sensación de app colgada.
//   2) Si tras eso sigue sin poder acceder, se continúa con el arranque
//      normal (con la splash ya visible) y se reintenta un rato más, esta
//      vez sin bloquear nada (ver resolveUserDataDirFailureInteractively en
//      app.whenReady) — y si aun así sigue sin funcionar, se para ahí, con
//      un diálogo que HAY que atender antes de seguir (reintentar o
//      continuar con datos locales), en vez de decidirlo la app sola y
//      avisar después. Queda registrado en app.log con código PS-1005 en
//      cualquiera de los dos casos donde se acaba usando la carpeta local.
// ------------------------------------------------------------------
const USERDATA_PRE_READY_RETRY_MS = 5000;
const USERDATA_PRE_READY_RETRY_INTERVAL_MS = 1000;
const USERDATA_POST_READY_RETRY_MS = 20000;
const USERDATA_POST_READY_RETRY_INTERVAL_MS = 1500;

let customUserDataDirFailure = null; // { attempted, error } mientras siga sin resolverse
let customUserDataDirTarget = null; // ruta configurada (si hay alguna), para el reintento tras whenReady y la vigilancia en marcha
// v0.1.57: ¿esa carpeta personalizada es compartida entre varios PCs
// (Google Drive, OneDrive...) o es solo un cambio de carpeta LOCAL (por
// ejemplo, a otro disco de este mismo PC, sin compartir con nadie)? Antes
// de esta versión, la app asumía que CUALQUIER carpeta personalizada era
// compartida — bug real señalado por el usuario ("¿cómo sabe, al cambiar
// ubicación de datos, si es nube o local?"): no había forma de saberlo,
// simplemente se suponía. Ahora se pregunta explícitamente (ver
// changeUserDataLocation) y se guarda la respuesta en location.json; el
// instalador (build/installer.nsh) ya guarda "shared": true de fábrica
// cuando se elige la página de carpeta compartida. Por defecto true si el
// campo no existe (location.json de una versión anterior a la 0.1.57) —
// para no desactivar en silencio, para quien ya lo tenía configurado, las
// protecciones que estaban usando de verdad.
let customUserDataDirShared = true;
// P9: { estado, motivo } cuando location.json EXISTE pero no se puede usar.
// Mientras tenga valor, esta sesión no tiene ubicación de datos resuelta: el
// arranque se detiene en app.whenReady (detenerArranquePorConfigUbicacion).
let configUbicacionNoResuelta = null;

// ------------------------------------------------------------------
// P9 (17 sept 2026) — UN SOLO LECTOR DE location.json, CON ESTADOS EXPLÍCITOS.
//
// Antes había tres lecturas (la ruta, "shared" y la del rescate PS-1007), y
// las tres devolvían lo mismo para "no hay archivo" que para "hay un archivo
// que no se entiende". Medido en la app real: con un location.json guardado
// con BOM (Bloc de notas, PowerShell 5.1...), la app abría SIN AVISAR la base
// de datos de la carpeta por defecto —en el PC del usuario, un residuo antiguo
// que además se modificaba al abrirlo—, o creaba una vacía, y de paso
// desactivaba la protección de apagado.
//
//   'ausente'   el archivo no existe (ENOENT). Es el ÚNICO estado que
//               significa "no hay configuración de ubicación".
//   'valido'    se entiende y cumple el contrato.
//   'ilegible'  existe, pero no se puede leer o no está en una codificación
//               admitida.
//   'invalido'  se lee, pero no es JSON o no cumple el contrato.
//
// Codificaciones admitidas, y solo estas (nada se adivina por el contenido):
// UTF-8 sin BOM, UTF-8 con UN BOM, y UTF-16 LE/BE con su BOM. Se quita
// ÚNICAMENTE ese BOM inicial; cualquier otro U+FEFF (BOM duplicado o fuera de
// sitio) deja el archivo 'invalido'. Un archivo ANSI con letras acentuadas no
// es UTF-8 válido: 'ilegible'.
//
// Contrato: un objeto JSON con `userDataDir` de tipo cadena, sin espacios
// alrededor, sin caracteres de control, U+FEFF ni U+FFFD, sin < > " | ? * ni
// ":" fuera de la letra de unidad, y ABSOLUTA: con letra de unidad (X:\ o X:/)
// o UNC (\\servidor\recurso, o con "/"). `shared`, si está, tiene que ser
// booleano; si falta, vale true (location.json anterior a la 0.1.57).
//
// Autocontenida A PROPÓSITO (sin constantes de módulo): el rescate PS-1007 la
// llama desde un manejador que puede dispararse antes de que se evalúe el
// resto de este archivo. `motivo` nunca lleva la ruta: se puede registrar.
// ------------------------------------------------------------------
function leerConfigUbicacion() {
  let bytes;
  try {
    bytes = fs.readFileSync(userDataConfigPath());
  } catch (e) {
    if (e && e.code === 'ENOENT') return { estado: 'ausente' };
    return { estado: 'ilegible', motivo: `el archivo no se puede leer (${(e && e.code) || 'error desconocido'})` };
  }
  let texto;
  try {
    let codificacion = 'utf-8';
    let desde = 0;
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      desde = 3;
    } else if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      codificacion = 'utf-16le';
      desde = 2;
    } else if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
      codificacion = 'utf-16be';
      desde = 2;
    }
    // ignoreBOM: el decodificador no quita nada por su cuenta. El único BOM
    // retirado es el que se acaba de reconocer por sus bytes.
    texto = new TextDecoder(codificacion, { fatal: true, ignoreBOM: true }).decode(bytes.subarray(desde));
  } catch (e) {
    return { estado: 'ilegible', motivo: 'el archivo no está en una codificación admitida (UTF-8, o UTF-16 con BOM)' };
  }
  if (texto.includes('\uFEFF')) {
    return { estado: 'invalido', motivo: 'el archivo tiene una marca BOM duplicada o fuera de sitio' };
  }
  let cfg;
  try {
    cfg = JSON.parse(texto);
  } catch (e) {
    return { estado: 'invalido', motivo: 'el archivo no es JSON válido' };
  }
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    return { estado: 'invalido', motivo: 'el contenido no es un objeto JSON' };
  }
  if (!Object.prototype.hasOwnProperty.call(cfg, 'userDataDir')) {
    return { estado: 'invalido', motivo: 'falta el campo "userDataDir"' };
  }
  const ruta = cfg.userDataDir;
  if (typeof ruta !== 'string') return { estado: 'invalido', motivo: '"userDataDir" no es una cadena' };
  if (ruta.trim() === '') return { estado: 'invalido', motivo: '"userDataDir" está vacío' };
  if (ruta !== ruta.trim()) {
    return { estado: 'invalido', motivo: '"userDataDir" tiene espacios al principio o al final' };
  }
  const conUnidad = /^[A-Za-z]:[\\/]/.test(ruta);
  const unc = /^[\\/]{2}(?![.?][\\/])[^\\/]+[\\/]+[^\\/]/.test(ruta);
  if (!conUnidad && !unc) {
    return { estado: 'invalido', motivo: '"userDataDir" no es una ruta absoluta con letra de unidad o de red' };
  }
  if (/[\u0000-\u001f\u007f\uFEFF\uFFFD<>"|?*]/.test(ruta) || /:/.test(conUnidad ? ruta.slice(2) : ruta)) {
    return { estado: 'invalido', motivo: '"userDataDir" contiene caracteres que no son válidos en una ruta' };
  }
  if (Object.prototype.hasOwnProperty.call(cfg, 'shared') && typeof cfg.shared !== 'boolean') {
    return { estado: 'invalido', motivo: '"shared" no es true ni false' };
  }
  return { estado: 'valido', userDataDir: ruta, shared: typeof cfg.shared === 'boolean' ? cfg.shared : true };
}

// Prueba de escritura real, no solo de existencia: mkdirSync con
// {recursive:true} no falla si la ruta YA existe aunque no se pueda escribir
// de verdad en ella (por ejemplo, unidad todavía no montada del todo).
// SÍNCRONA a propósito: se usa solo en las dos fases de arranque donde
// bloquear brevemente es una decisión consciente y ya documentada (antes
// de app.whenReady(), y en los reintentos con la splash visible, donde no
// hay nada más que el usuario pueda estar haciendo). Para cualquier
// comprobación DURANTE una sesión ya en marcha (ventanas de proyecto
// abiertas), usar la variante asíncrona de abajo — ver el comentario junto
// a ella.
function probeWritableDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.panorama-write-check-${process.pid}`);
    fs.writeFileSync(probe, String(Date.now()));
    fs.unlinkSync(probe);
    return null;
  } catch (e) {
    return String((e && e.message) || e);
  }
}

// v0.1.60 — misma prueba, pero sin bloquear el proceso principal: usada por
// startUserDataWatchdog(), que se ejecuta repetidamente DURANTE toda la
// sesión (ventanas de proyecto ya abiertas). La versión síncrona de arriba,
// llamada ahí, podía congelar la app entera (todas las ventanas) si Drive/
// OneDrive se quedaba colgado en esa escritura — auditoría pedida por el
// usuario ("profesional y segura en todos sus aspectos").
async function probeWritableDirAsync(dir) {
  try {
    await fs.promises.mkdir(dir, { recursive: true });
    const probe = path.join(dir, `.panorama-write-check-${process.pid}`);
    await fs.promises.writeFile(probe, String(Date.now()));
    await fs.promises.unlink(probe);
    return null;
  } catch (e) {
    return String((e && e.message) || e);
  }
}

// Espera SÍNCRONA (bloquea el proceso entero) — solo se usa antes de
// app.whenReady(), donde no hay ninguna ventana que pintar de todas formas.
function sleepSyncMs(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch (e) {
    /* entorno sin SharedArrayBuffer/Atomics: no se espera, simplemente se sigue */
  }
}

function applyCustomUserDataDirIfConfigured() {
  const cfg = leerConfigUbicacion();
  if (cfg.estado === 'ausente') return;
  if (cfg.estado !== 'valido') {
    // P9: presente pero inutilizable NO es "sin configuración". No se prueba
    // ni se crea ninguna carpeta, no se llama a setPath y no se sigue con la
    // de por defecto como si nada: el arranque se detiene en whenReady.
    configUbicacionNoResuelta = { estado: cfg.estado, motivo: cfg.motivo };
    return;
  }
  const target = cfg.userDataDir;
  customUserDataDirTarget = target;
  customUserDataDirShared = cfg.shared;

  const deadline = Date.now() + USERDATA_PRE_READY_RETRY_MS;
  let lastError = null;
  for (;;) {
    lastError = probeWritableDir(target);
    if (!lastError) {
      app.setPath('userData', target);
      return;
    }
    if (Date.now() >= deadline) break;
    sleepSyncMs(USERDATA_PRE_READY_RETRY_INTERVAL_MS);
  }
  customUserDataDirFailure = { attempted: target, error: lastError };
}
// v0.1.56: ¿se está usando de verdad, AHORA MISMO, una carpeta de datos
// personalizada? (no solo "hay una configurada" — customUserDataDirTarget
// sigue con valor aunque haya fallado el acceso y se haya hecho fallback a
// la de por defecto). Usada para decidir en cada arranque si la protección
// de apagado y el bloqueo multi-PC deben estar activos — ninguno de los dos
// pinta nada con la carpeta de datos LOCAL, donde por definición no hay
// ningún otro PC compartiendo los mismos archivos.
function isUsingCustomDataLocationNow() {
  return !!customUserDataDirTarget && !customUserDataDirFailure;
}

// v0.1.57: la versión "solo si además está marcada como compartida" de la
// función de arriba — la que de verdad deben usar la protección de
// apagado, la espera al arrancar, y el bloqueo multi-PC (ver más abajo).
// isUsingCustomDataLocationNow() sigue usándose tal cual para lo que ya
// tenía sentido para CUALQUIER carpeta personalizada, compartida o no (el
// aviso de base de datos no encontrada, la vigilancia de acceso en
// marcha...) — un disco externo local también puede desmontarse a media
// sesión, por ejemplo, sin que eso tenga nada que ver con Drive/OneDrive.
function isUsingSharedDataLocationNow() {
  return isUsingCustomDataLocationNow() && customUserDataDirShared;
}

// v0.1.53: capturado ANTES de aplicar la carpeta personalizada (si hay una configurada) — es el
// único momento en que app.getPath('userData') todavía da la ruta por defecto de Electron/Windows.
// Hace falta más abajo (ver checkCustomLocationDatabaseSanity) para poder volver a ella a propósito
// sin relanzar la app, si el usuario elige "usar datos por defecto por ahora" ante una base de datos
// que no aparece en la carpeta personalizada.
const defaultUserDataDir = app.getPath('userData');
applyCustomUserDataDirIfConfigured();

// ------------------------------------------------------------------
// A3.3 BLOQUE 2 — REGISTRO LOCAL DE UBICACIONES YA INICIALIZADAS
//
// Sin esto, "carpeta por defecto vacía" volvería a significar "PC nuevo" en
// cada arranque, y la desaparición de una base de datos que SÍ existió se
// convertiría automáticamente en permiso para crear una vacía encima.
//
// El registro vive en la carpeta de configuración LOCAL —nunca en la carpeta
// de datos, que puede estar en Drive— porque su función es precisamente
// recordar algo que la carpeta de datos ya no puede demostrar por sí sola.
//
// Formato (%APPDATA%\panorama-app-config\ubicaciones-inicializadas.json):
//   { "v":1, "ubicaciones": {
//       "<ruta en minúsculas>": {
//         "inicializada": true,
//         "primer_commit_id": "<commit visto la primera vez>",
//         "installation_id": "<quién la vio>",
//         "at": "<ISO>" } } }
//
// La propiedad que garantiza: una ubicación puede autorizar UNA creación
// mientras nunca se haya registrado; en cuanto se registra, su desaparición
// futura ya NO vuelve a ser "primera vez".
// ------------------------------------------------------------------
function rutaRegistroUbicaciones() {
  return path.join(app.getPath('appData'), 'panorama-app-config', 'ubicaciones-inicializadas.json');
}
function claveUbicacion(dir) {
  try { return path.resolve(String(dir)).toLowerCase(); } catch (e) { return String(dir).toLowerCase(); }
}

// Estados explícitos: un archivo ilegible NO es "no hay nada registrado".
function leerRegistroUbicaciones() {
  let txt;
  try {
    txt = fs.readFileSync(rutaRegistroUbicaciones(), 'utf8');
  } catch (e) {
    if (e && e.code === 'ENOENT') return { ok: true, ubicaciones: {} };
    return { ok: false, motivo: `no se pudo leer el registro de ubicaciones (${(e && e.code) || e})` };
  }
  try {
    const j = JSON.parse(txt);
    if (!j || j.v !== 1 || !j.ubicaciones || typeof j.ubicaciones !== 'object') {
      return { ok: false, motivo: 'el registro de ubicaciones tiene un formato no reconocido' };
    }
    return { ok: true, ubicaciones: j.ubicaciones };
  } catch (e) {
    return { ok: false, motivo: 'el registro de ubicaciones no es JSON válido' };
  }
}

// Misma disciplina que db.js: lista CERRADA de códigos que significan de
// verdad "este sistema de archivos no implementa fsync". Un EIO no es eso.
const FSYNC_NO_SOPORTADO_REG = new Set(['EINVAL', 'ENOSYS', 'ENOTSUP', 'EOPNOTSUPP']);

// Escritura atómica (tmp + fsync + rename) y verificada releyendo: esto es
// evidencia de seguridad, no una preferencia.
function guardarRegistroUbicaciones(ubicaciones) {
  const ruta = rutaRegistroUbicaciones();
  const tmp = `${ruta}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.mkdirSync(path.dirname(ruta), { recursive: true });
    const fd = fs.openSync(tmp, 'w');
    try {
      const buf = Buffer.from(JSON.stringify({ v: 1, ubicaciones }), 'utf8');
      let escritos = 0;
      while (escritos < buf.length) {
        const n = fs.writeSync(fd, buf, escritos, buf.length - escritos, escritos);
        if (!(n > 0)) throw new Error('writeSync sin progreso');
        escritos += n;
      }
      try {
        fs.fsyncSync(fd);
      } catch (e) {
        if (!FSYNC_NO_SOPORTADO_REG.has(e && e.code)) {
          throw new Error(`fsync falló (${(e && e.code) || '?'}): ${e && e.message}`);
        }
        // solo aquí se acepta: el sistema de archivos no lo implementa
      }
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, ruta);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (e2) {}
    return { ok: false, motivo: String((e && e.message) || e) };
  }
  const r = leerRegistroUbicaciones();
  if (!r.ok) return { ok: false, motivo: `tras escribir no se pudo releer: ${r.motivo}` };
  return { ok: true, ubicaciones: r.ubicaciones };
}

// ------------------------------------------------------------------
// MÁQUINA DE ESTADOS DE LA UBICACIÓN
//
//   (sin registro)  --autorizar creación-->  'inicializando'  --getDb ok-->  'inicializada'
//
// El paso a 'inicializando' ocurre ANTES de escribir el primer byte en la
// carpeta de datos y se verifica releyendo. Esa es la propiedad que cierra el
// hueco: en cuanto se emite una autorización de primera creación, la ruta deja
// de parecer "nunca usada", pase lo que pase después.
//
// Se acepta el formato antiguo `{inicializada:true}` como 'inicializada'.
// ------------------------------------------------------------------
function estadoUbicacion(dir) {
  const r = leerRegistroUbicaciones();
  if (!r.ok) return { estado: null, corrupto: true, motivo: r.motivo };
  const u = r.ubicaciones[claveUbicacion(dir)];
  if (!u) return { estado: null, corrupto: false, registro: null };
  if (u.estado === 'inicializando') return { estado: 'inicializando', corrupto: false, registro: u };
  // 'detectada-existente' es el camino OPUESTO a 'inicializando': significa
  // "ya demostré que esta ruta tenía una base de datos, pero todavía no
  // terminé de abrirla/adoptarla". Nunca autoriza a crear nada.
  if (u.estado === 'detectada-existente') return { estado: 'detectada-existente', corrupto: false, registro: u };
  if (u.estado === 'inicializada' || u.inicializada === true) {
    return { estado: 'inicializada', corrupto: false, registro: u };
  }
  // Entrada presente pero con un estado que no se reconoce: no se interpreta.
  return { estado: null, corrupto: true, motivo: 'entrada de ubicación con estado no reconocido', registro: u };
}

// Compatibilidad con el nombre anterior (lo usa la suite del bloque 2).
function ubicacionYaInicializada(dir) {
  const e = estadoUbicacion(dir);
  return { inicializada: e.estado === 'inicializada', corrupto: e.corrupto, motivo: e.motivo, registro: e.registro };
}

function escribirEntradaUbicacion(dir, entrada) {
  const r = leerRegistroUbicaciones();
  if (!r.ok) return { ok: false, motivo: r.motivo };
  const ubicaciones = Object.assign({}, r.ubicaciones);
  ubicaciones[claveUbicacion(dir)] = entrada;
  const g = guardarRegistroUbicaciones(ubicaciones);
  if (!g.ok) return g;
  // VERIFICACIÓN: releer y comprobar que la entrada quedó como se pretendía.
  const v = estadoUbicacion(dir);
  if (v.corrupto || !v.registro || v.registro.estado !== entrada.estado) {
    return { ok: false, motivo: 'la entrada no se pudo verificar tras escribirla' };
  }
  return { ok: true, entrada: v.registro };
}

// Paso 1: ANTES de conceder la creación. Reutiliza el intento si ya existía,
// para no emitir nunca una "primera creación" nueva sobre una ruta pendiente.
function marcarUbicacionInicializando(dir) {
  const e = estadoUbicacion(dir);
  if (e.corrupto) return { ok: false, motivo: e.motivo };
  if (e.estado === 'inicializando' && e.registro && e.registro.intento) {
    return { ok: true, intento: e.registro.intento, reutilizado: true };
  }
  const intento = crypto.randomBytes(8).toString('hex');
  const res = escribirEntradaUbicacion(dir, {
    estado: 'inicializando',
    intento,
    installation_id: (() => { try { return dbmod.getInstallationId(); } catch (e2) { return null; } })(),
    at: new Date().toISOString(),
  });
  if (!res.ok) {
    appLog(`A3.3 — NO se pudo dejar constancia de "inicializando" en ${dir}: ${res.motivo}`);
    return res;
  }
  appLog(`A3.3 — ubicación marcada como INICIALIZANDO (intento ${intento}): ${dir}`);
  return { ok: true, intento };
}

// Paso 1 del camino de ACTUALIZACIÓN: se ha comprobado que la ruta YA tiene
// una base de datos, y todavía no se ha abierto. Se persiste antes de entrar
// en la ventana peligrosa, por el mismo motivo que 'inicializando': si el
// proceso cae aquí y la base de datos desaparece después, esta ruta no puede
// volver a parecer "nunca vista".
//
// NO genera nonce, NO registra intención de creación, NO autoriza crear.
function marcarUbicacionDetectadaExistente(dir) {
  const e = estadoUbicacion(dir);
  if (e.corrupto) return { ok: false, motivo: e.motivo };
  if (e.estado === 'detectada-existente' || e.estado === 'inicializada') {
    return { ok: true, yaEstaba: true };
  }
  const res = escribirEntradaUbicacion(dir, {
    estado: 'detectada-existente',
    installation_id: (() => { try { return dbmod.getInstallationId(); } catch (e2) { return null; } })(),
    at: new Date().toISOString(),
  });
  if (!res.ok) {
    appLog(`A3.3 — NO se pudo dejar constancia de "detectada-existente" en ${dir}: ${res.motivo}`);
    return res;
  }
  appLog(`A3.3 — ubicación marcada como DETECTADA-EXISTENTE (hay base de datos, aún sin abrir): ${dir}`);
  return { ok: true };
}

// Paso 2: tras confirmar la base de datos. Transición atómica y verificada.
function marcarUbicacionInicializada(dir, commitId) {
  const e = estadoUbicacion(dir);
  if (e.corrupto) {
    appLog(`A3.3 — no se pudo leer el registro para marcar ${dir}: ${e.motivo}`);
    return { ok: false, motivo: e.motivo };
  }
  if (e.estado === 'inicializada') return { ok: true, yaEstaba: true };
  const res = escribirEntradaUbicacion(dir, {
    estado: 'inicializada',
    primer_commit_id: commitId || (e.registro && e.registro.primer_commit_id) || null,
    installation_id: (() => { try { return dbmod.getInstallationId(); } catch (e2) { return null; } })(),
    at: new Date().toISOString(),
  });
  if (!res.ok) {
    appLog(`A3.3 — no se pudo registrar la ubicación como inicializada (${dir}): ${res.motivo}`);
    return res;
  }
  appLog(`A3.3 — ubicación registrada como inicializada: ${dir}`);
  return { ok: true };
}

// ------------------------------------------------------------------
// P22 (17 sept 2026) — «ESTE EQUIPO YA USÓ UNA UBICACIÓN DE DATOS PROPIA»
//
// Sin esta constancia, un arranque sin `location.json` no puede distinguir una
// instalación nueva de verdad de un equipo que se quedó sin su configuración:
// los dos ven la carpeta por defecto vacía o con restos, y hoy los dos
// terminaban creando o abriendo una base de datos local sin preguntar.
//
// Vive en la carpeta de configuración LOCAL (la misma que location.json, el
// registro de A3.3 y el installation-id) porque su función es recordar algo que
// la carpeta de datos ya no puede demostrar por sí sola.
//
//   { "v":1,
//     "personalizada": { "clave_sha256": "<sha256 de la ruta normalizada>",
//                        "compartida": true|false,
//                        "primera_vez": "<ISO>", "ultima_vez": "<ISO>" },
//     "decisiones": [ { "que": "volver-a-por-defecto", "at": "<ISO>" } ] }
//
// La RUTA NO se guarda: solo su hash. Con eso basta para responder «¿hubo
// alguna vez una ubicación propia?» y para saber si la de ahora es la misma,
// sin dejar escrita una ruta que puede identificar a una persona o un cliente.
//
// NADIE la borra: ni PS-1005, ni PS-1009, ni un fallo de Drive, ni una sesión
// local temporal. «Volver a la carpeta por defecto» AÑADE su decisión, con
// fecha, en vez de borrar la historia.
// ------------------------------------------------------------------
function rutaHistorialUbicacion() {
  return path.join(app.getPath('appData'), 'panorama-app-config', 'historial-ubicacion.json');
}
function claveHashUbicacion(dir) {
  return crypto.createHash('sha256').update(claveUbicacion(dir), 'utf8').digest('hex');
}

// Estados explícitos, igual que el registro de ubicaciones: un archivo que
// existe y no se entiende NO es «no hay historial».
function leerHistorialUbicacion() {
  let txt;
  try {
    txt = fs.readFileSync(rutaHistorialUbicacion(), 'utf8');
  } catch (e) {
    if (e && e.code === 'ENOENT') return { ok: true, historial: null };
    return { ok: false, motivo: `no se pudo leer el historial de ubicación (${(e && e.code) || e})` };
  }
  try {
    const j = JSON.parse(txt.replace(/^﻿/, ''));
    if (!j || j.v !== 1 || typeof j !== 'object') return { ok: false, motivo: 'el historial de ubicación tiene un formato no reconocido' };
    return { ok: true, historial: j };
  } catch (e) {
    return { ok: false, motivo: 'el historial de ubicación no es JSON válido' };
  }
}

// Escritura atómica (tmp + fsync + rename) y VERIFICADA releyendo, igual que el
// registro de ubicaciones: esto es evidencia de integridad, no una preferencia.
// Devuelve { ok } o { ok:false, motivo } — nunca falla en silencio.
function guardarHistorialUbicacion(j) {
  const ruta = rutaHistorialUbicacion();
  const tmp = `${ruta}.tmp-${process.pid}-${Date.now()}`;
  const FSYNC_NO_SOPORTADO = new Set(['EINVAL', 'ENOSYS', 'ENOTSUP', 'EOPNOTSUPP']);
  try {
    fs.mkdirSync(path.dirname(ruta), { recursive: true });
    const fd = fs.openSync(tmp, 'w');
    try {
      const buf = Buffer.from(JSON.stringify(j), 'utf8');
      let escritos = 0;
      while (escritos < buf.length) {
        const n = fs.writeSync(fd, buf, escritos, buf.length - escritos, escritos);
        if (!(n > 0)) throw new Error('writeSync sin progreso');
        escritos += n;
      }
      try {
        fs.fsyncSync(fd);
      } catch (e) {
        if (!FSYNC_NO_SOPORTADO.has(e && e.code)) throw new Error(`fsync falló (${(e && e.code) || '?'}): ${e && e.message}`);
      }
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, ruta);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (e2) {}
    return { ok: false, motivo: String((e && e.message) || e) };
  }
  const r = leerHistorialUbicacion();
  if (!r.ok || !r.historial) return { ok: false, motivo: `tras escribir no se pudo releer: ${r.motivo || 'quedó vacío'}` };
  return { ok: true, historial: r.historial };
}

// P22: mientras esta sesión no haya podido dejar la constancia, la ausencia de
// historial NO puede leerse como «instalación nueva» (ver huboUbicacionPersonalizada).
let historialUbicacionDegradado = null;   // { motivo } si no se pudo persistir

function registrarUbicacionPersonalizada(dir, compartida) {
  const ahora = new Date().toISOString();
  const r = leerHistorialUbicacion();
  if (!r.ok) {
    historialUbicacionDegradado = { motivo: r.motivo };
    appLog(`ERROR PS-1024 — ${r.motivo}; la constancia de ubicación propia queda degradada esta sesión.`);
    return { ok: false, motivo: r.motivo };
  }
  const j = r.historial && typeof r.historial === 'object' ? r.historial : { v: 1 };
  j.v = 1;
  const clave = claveHashUbicacion(dir);
  const antes = j.personalizada && j.personalizada.clave_sha256 === clave ? j.personalizada : null;
  j.personalizada = {
    clave_sha256: clave,
    compartida: !!compartida,
    primera_vez: (antes && antes.primera_vez) || (j.personalizada && j.personalizada.primera_vez) || ahora,
    ultima_vez: ahora,
  };
  if (!Array.isArray(j.decisiones)) j.decisiones = [];
  const g = guardarHistorialUbicacion(j);
  if (!g.ok) {
    historialUbicacionDegradado = { motivo: g.motivo };
    appLog(`ERROR PS-1024 — no se pudo dejar constancia de la ubicación de datos propia: ${g.motivo}`);
    return g;
  }
  historialUbicacionDegradado = null;
  return g;
}

function registrarDecisionUbicacion(que) {
  const r = leerHistorialUbicacion();
  if (!r.ok) { appLog(`ERROR PS-1024 — no se pudo anotar la decisión «${que}»: ${r.motivo}`); return { ok: false, motivo: r.motivo }; }
  const j = r.historial && typeof r.historial === 'object' ? r.historial : { v: 1 };
  j.v = 1;
  if (!Array.isArray(j.decisiones)) j.decisiones = [];
  j.decisiones.push({ que, at: new Date().toISOString() });
  const g = guardarHistorialUbicacion(j);
  if (!g.ok) appLog(`ERROR PS-1024 — no se pudo anotar la decisión «${que}»: ${g.motivo}`);
  return g;
}

// ¿Este equipo ha usado alguna vez una carpeta de datos propia?
//
// El historial es la señal principal, pero NO la única: un equipo que venga de
// una versión anterior puede no tenerlo todavía. Se aceptan como equivalentes
// dos señales que ya existían —el registro de ubicaciones de A3.3 con una clave
// que NO es la carpeta por defecto, y la marca de la protección de apagado— y la
// propia configuración válida de esta sesión. Y ante cualquier duda (historial
// ilegible, o esta sesión no pudo escribirlo) se responde que SÍ: no poder
// demostrar que hubo ubicación propia nunca puede valer como prueba de que no
// la hubo.
function huboUbicacionPersonalizada() {
  if (customUserDataDirTarget) return { si: true, fuente: 'location.json de esta sesión' };
  const r = leerHistorialUbicacion();
  if (!r.ok) return { si: true, fuente: 'historial de ubicación ilegible (se supone que sí)', degradado: true };
  if (r.historial && r.historial.personalizada && r.historial.personalizada.clave_sha256) {
    return { si: true, fuente: 'historial de ubicación', desde: r.historial.personalizada.primera_vez, compartida: !!r.historial.personalizada.compartida };
  }
  if (historialUbicacionDegradado) return { si: true, fuente: 'no se pudo dejar constancia en esta sesión (se supone que sí)', degradado: true };
  const reg = leerRegistroUbicaciones();
  if (!reg.ok) return { si: true, fuente: 'registro de ubicaciones ilegible (se supone que sí)', degradado: true };
  const claveDefecto = claveUbicacion(defaultUserDataDir);
  const otras = Object.keys(reg.ubicaciones).filter((k) => k !== claveDefecto);
  if (otras.length) return { si: true, fuente: 'registro de ubicaciones de A3.3' };
  try {
    if (isDriveSyncGuardEnabled()) return { si: true, fuente: 'protección de apagado activa' };
  } catch (e) { /* si no se puede mirar, no aporta */ }
  return { si: false };
}

// ------------------------------------------------------------------
// P22 — ¿QUÉ HAY EN LA CARPETA DE DATOS LOCAL? CUATRO ESTADOS, NO DOS.
//
//   'ausente'         ENOENT DEMOSTRADO: de verdad no hay base de datos.
//   'existente'       hay un archivo con la cabecera de SQLite.
//   'invalida'        el archivo ESTÁ, pero no es utilizable: 0 bytes, o no
//                     empieza por "SQLite format 3\0", o no es un archivo.
//   'no-comprobable'  existe o no, pero no se puede determinar (EACCES, EBUSY,
//                     EIO, unidad a medio montar...).
//
// 'invalida' NO es «no hay base de datos»: un archivo así puede ser una copia a
// medias o el resto de un fallo, y tratarlo como ausencia llevaría a crear una
// base nueva ENCIMA. Los dos últimos estados se cierran en falso (PS-1023).
//
// Solo se leen 16 bytes y el `stat`: NUNCA se abre la base de datos.
// ------------------------------------------------------------------
const CABECERA_SQLITE = Buffer.from('SQLite format 3\0', 'latin1');

function estadoBaseDeDatosLocal(dir) {
  const ruta = path.join(dir, 'panorama.sqlite3');
  const visible = estadoDeArchivoEnRuta(ruta);
  if (visible.estado === 'no-visible') return { estado: 'ausente' };
  if (visible.estado === 'no-accesible') return { estado: 'no-comprobable', codigo: visible.codigo, motivo: 'no se puede comprobar si hay una base de datos' };
  let st;
  try {
    st = fs.statSync(ruta);
  } catch (e) {
    return { estado: 'no-comprobable', codigo: (e && e.code) || '?', motivo: 'no se pudo consultar el archivo' };
  }
  if (!st.isFile()) return { estado: 'invalida', motivo: 'en su sitio hay algo que no es un archivo', size: st.size, mtime: st.mtimeMs };
  if (st.size === 0) return { estado: 'invalida', motivo: 'el archivo está vacío (0 bytes)', size: 0, mtime: st.mtimeMs };
  let cabecera = null;
  let fd = null;
  try {
    fd = fs.openSync(ruta, 'r');
    const buf = Buffer.alloc(CABECERA_SQLITE.length);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    cabecera = buf.slice(0, n);
  } catch (e) {
    return { estado: 'no-comprobable', codigo: (e && e.code) || '?', motivo: 'no se pudo leer la cabecera del archivo', size: st.size, mtime: st.mtimeMs };
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch (e) {} }
  }
  if (!cabecera.equals(CABECERA_SQLITE)) {
    return { estado: 'invalida', motivo: 'el archivo no empieza por la cabecera de una base de datos SQLite', size: st.size, mtime: st.mtimeMs };
  }
  let gen = false;
  try { gen = fs.existsSync(ruta + '.gen'); } catch (e) { /* no crítico */ }
  return { estado: 'existente', size: st.size, mtime: st.mtimeMs, gen };
}

// Texto para los diálogos: fecha, tamaño y si lleva el testigo de A3.3. Nunca
// la ruta, y nunca nada que obligue a abrir la base de datos.
function descripcionBaseDeDatosLocal(bd) {
  if (bd.estado === 'ausente') return 'En este equipo no hay ninguna base de datos local.';
  if (bd.estado === 'no-comprobable') return `Hay algo en su sitio, pero no se puede comprobar (${bd.codigo}).`;
  if (bd.estado === 'invalida') return `Hay un archivo de base de datos local, pero no es utilizable: ${bd.motivo}.`;
  const fecha = new Date(bd.mtime);
  const dias = Math.floor((Date.now() - bd.mtime) / 86400000);
  return 'En este equipo HAY datos locales:\n' +
    `  · última modificación: ${fecha.toLocaleString()}${Number.isFinite(dias) && dias >= 1 ? ` (hace ${dias} día${dias === 1 ? '' : 's'})` : ''}\n` +
    `  · tamaño: ${(bd.size / 1024).toFixed(0)} KB\n` +
    `  · ${bd.gen ? 'con el testigo de integridad de A3.3' : 'sin el testigo de integridad de A3.3 (la escribió una versión anterior)'}`;
}

// ------------------------------------------------------------------
// A3.3 BLOQUE 2 — POLÍTICA DE UBICACIÓN
//
// Regla de fondo: una carpeta PERSONALIZADA nunca se clasifica como 'local'.
// Que `fs.stat` funcione o que tenga letra de unidad no demuestra que no esté
// sincronizada con otro equipo. Ante duda, 'desconocida', que recibe la misma
// política conservadora que 'compartida'.
//
//   carpeta por defecto de %APPDATA% ........................... local
//   personalizada con indicios de nube/red, o marcada shared ... compartida
//   personalizada sin poder demostrar su naturaleza ............ desconocida
// ------------------------------------------------------------------
const INDICIOS_DE_NUBE = [
  'google drive', 'googledrive', 'mi unidad', 'my drive',
  'onedrive', 'dropbox', 'iclouddrive', 'nextcloud', 'pcloud',
];
function rutaConIndiciosDeNube(ruta) {
  const r = String(ruta || '').toLowerCase().replace(/\\/g, '/');
  if (r.startsWith('//')) return { si: true, motivo: 'ruta UNC (recurso de red)' };
  for (const ind of INDICIOS_DE_NUBE) {
    if (r.includes('/' + ind + '/') || r.includes('/' + ind)) {
      return { si: true, motivo: `la ruta contiene "${ind}"` };
    }
  }
  return { si: false };
}

function clasificarPoliticaUbicacion() {
  // Si no hay personalizada configurada, o la hubo pero no se pudo usar y se
  // hizo fallback, la carpeta real de esta sesión es la de %APPDATA%: es la
  // carpeta por usuario de Windows, estructuralmente privada de este equipo.
  if (!isUsingCustomDataLocationNow()) {
    return { politica: 'local', motivo: 'carpeta de datos por defecto de %APPDATA% (por usuario de Windows)' };
  }
  const ruta = app.getPath('userData');
  const ind = rutaConIndiciosDeNube(ruta);
  if (ind.si) return { politica: 'compartida', motivo: ind.motivo };
  if (customUserDataDirShared === true) {
    return { politica: 'compartida', motivo: 'location.json la marca como compartida' };
  }
  // Personalizada sin indicios y sin marca fiable: NO se da por local.
  return {
    politica: 'desconocida',
    motivo: 'carpeta personalizada cuya naturaleza no se puede demostrar (sin indicios de nube y sin shared:true)',
  };
}

// ------------------------------------------------------------------
// A3.3 BLOQUE 2 — DECISIÓN DE `crearSiAusente`
//
// main.js AUTORIZA; db.js VERIFICA. Las dos capas son necesarias y ninguna
// basta por sí sola.
//
// Solo hay DOS caminos que autorizan, y ambos exigen que la ubicación NO
// conste como ya inicializada:
//
//   1. carpeta por defecto que nunca se registró  -> primera ejecución genuina
//   2. carpeta personalizada donde el usuario eligió EXPRESAMENTE
//      "empezar aquí desde cero" en el diálogo PS-1009
//
// Todo lo demás —incluida una carpeta por defecto que ya tuvo base de datos y
// hoy no la tiene— NO autoriza. Una desaparición no es una primera vez.
// ------------------------------------------------------------------
let usuarioAutorizaEmpezarDesdeCero = false;   // lo pone el diálogo PS-1009

// ¿Hay restos de base de datos en la carpeta de datos? (solo nombres, sin
// interpretarlos: db.js es quien decide si son explicables.)
function restosEnCarpetaDeDatos(dir) {
  try {
    return fs.readdirSync(dir).filter((f) => f === 'panorama.sqlite3' || f.startsWith('panorama.sqlite3.'));
  } catch (e) { return null; }   // null = no se pudo listar
}

function decidirCrearSiAusente() {
  // P9: location.json existe pero no se puede usar, así que esta sesión no
  // tiene ubicación de datos resuelta. La parada de app.whenReady ya impide
  // llegar aquí; esta es la segunda capa, para que ningún camino futuro
  // convierta un archivo ilegible en permiso para crear.
  if (configUbicacionNoResuelta) {
    return {
      crear: false,
      configNoResuelta: true,
      motivo: 'location.json existe pero no se puede usar: sin ubicación resuelta no se autoriza crear nada',
    };
  }
  const dir = app.getPath('userData');
  const est = estadoUbicacion(dir);

  if (est.corrupto) {
    return { crear: false, motivo: `el registro local de ubicaciones no se puede leer (${est.motivo}); no se autoriza crear nada` };
  }

  // (D) Ya tuvo base de datos: su ausencia es una desaparición, no una
  // primera vez. Nunca se autoriza.
  if (est.estado === 'inicializada') {
    return {
      crear: false,
      motivo: 'esta ubicación YA tuvo una base de datos según el registro local: si ahora no aparece, ' +
        'es una desaparición, no una primera vez',
      yaInicializada: true,
    };
  }

  // ------------------------------------------------------------------
  // EL ESTADO DEL ARCHIVO MANDA SOBRE CUALQUIER RAZONAMIENTO DEL REGISTRO.
  //
  //     "sin registro local"  NO significa  "sin datos previos".
  //
  // Al actualizar desde una versión anterior de Panorama, el registro local no
  // existe —esa versión no lo escribía— pero la base de datos sí, con datos
  // reales. Tratar eso como "primera ejecución" no sería solo un error de
  // etiqueta: el wiring escribiría `inicializando` y una intención de primera
  // creación en db.js, fabricando evidencia falsa de una creación pendiente
  // que nunca existió. Si después esa base de datos desapareciera, esas dos
  // marcas parecerían autorizar crear una vacía.
  //
  // Solo `sin registro + base de datos DEMOSTRABLEMENTE ausente` puede iniciar
  // una primera creación.
  // ------------------------------------------------------------------
  const archivo = estadoDeArchivoEnRuta(path.join(dir, 'panorama.sqlite3'));
  if (archivo.estado === 'visible') {
    return {
      crear: false,
      bdVisible: true,
      // Si la ruta todavía no consta de ninguna forma, hay que dejar
      // constancia de que AQUÍ HAY UNA BASE DE DATOS **antes** de abrirla.
      // Es lo que impide que una caída entre detectarla y registrarla deje la
      // ruta pareciendo "nunca vista".
      necesitaRegistrarExistente: !est.estado,
      motivo: 'ya hay una base de datos en esta ubicación: no es una primera creación, se abre la existente',
    };
  }
  if (archivo.estado === 'no-accesible') {
    return {
      crear: false,
      noAccesible: true,
      motivo: `no se puede comprobar si hay una base de datos aquí (${archivo.codigo}): no se crea nada`,
    };
  }
  // A partir de aquí, la ausencia del archivo está DEMOSTRADA (ENOENT).

  // Este equipo YA vio una base de datos en esta ruta y no llegó a terminar de
  // abrirla. Que ahora no esté es una DESAPARICIÓN, nunca una primera vez.
  if (est.estado === 'detectada-existente') {
    return {
      crear: false,
      existenteDesaparecida: true,
      motivo: 'este equipo ya comprobó que esta ubicación tenía una base de datos: su ausencia ahora ' +
        'es una desaparición, no una primera ejecución',
    };
  }

  // Hay una inicialización PENDIENTE de este equipo.
  //
  // OJO: una entrada 'inicializando' por sí sola NO demuestra que estemos
  // todavía ANTES de la primera creación. También puede significar:
  //   "la base de datos se creó correctamente, pero no conseguí actualizar el
  //    registro después" — y en ese caso la creación YA TERMINÓ.
  //
  // Lo que distingue los dos casos es la intención de db.js: db.js la registra
  // antes de escribir el primer byte y LA RETIRA al confirmar la creación. Si
  // ya no está, la creación terminó y no hay nada que reanudar.
  //
  // Y tiene que estar VINCULADA: mismo nonce que el que main.js persistió. Con
  // nonces independientes, "el mismo intento" no sería comprobable.
  if (est.estado === 'inicializando') {
    const intentoMain = est.registro && est.registro.intento;
    let intencionDb = null;
    try { intencionDb = dbmod.intencionDeCreacionPara(dir); } catch (e) { intencionDb = null; }

    if (!intencionDb || intencionDb.corrupto) {
      return { crear: false, motivo: 'hay una inicialización pendiente y la evidencia de db.js no se puede leer' };
    }
    if (!intencionDb.vigente) {
      // (D) El caso peligroso: db.js ya no tiene nada pendiente. O la creación
      // terminó, o nunca llegó a empezar de forma demostrable. En ninguno de
      // los dos se puede crear una base de datos nueva.
      return {
        crear: false,
        sinIntencionDb: true,
        motivo: 'hay una inicialización pendiente en el registro local, pero db.js NO tiene ninguna ' +
          'intención de creación viva: la creación anterior pudo haber terminado. No se crea nada.',
      };
    }
    if (!intentoMain || intencionDb.vigente.nonce !== intentoMain) {
      return {
        crear: false,
        noVinculada: true,
        motivo: `la intención de db.js (${intencionDb.vigente.nonce}) no corresponde al intento ` +
          `registrado por la aplicación (${intentoMain || 'ninguno'}): no se reanuda algo que no se puede vincular`,
      };
    }
    // (B/C) Las dos evidencias existen y están vinculadas: se reanuda EXACTAMENTE
    // ese intento, nunca uno nuevo.
    return {
      crear: true,
      reanudando: true,
      intento: intentoMain,
      motivo: `se reanuda la inicialización pendiente ${intentoMain}, vinculada con la intención de db.js`,
    };
  }

  // (sin registro) Primera vez de verdad: no consta la ubicación Y se ha
  // comprobado que la base de datos no está.
  if (!isUsingCustomDataLocationNow()) {
    // P22: «carpeta por defecto vacía» solo es una primera ejecución si este
    // equipo NO ha usado nunca una ubicación de datos propia. Si la ha usado
    // —o si no se puede demostrar que no—, crear aquí una base vacía es
    // justamente el error: hace falta que el usuario lo pida expresamente.
    if (usuarioAutorizaCrearLocal) {
      return { crear: true, motivo: 'el usuario autorizó expresamente crear una base de datos local vacía (PS-1021)' };
    }
    const hist = huboUbicacionPersonalizada();
    if (hist.si) {
      return {
        crear: false,
        historicaConocida: true,
        motivo: `este equipo ya ha usado una carpeta de datos propia (${hist.fuente}): no se crea una base de ` +
          'datos local vacía sin autorización expresa',
      };
    }
    return {
      crear: true,
      motivo: 'carpeta por defecto sin registro local y con la base de datos demostrablemente ausente ' +
        '(primera ejecución)',
    };
  }
  if (usuarioAutorizaEmpezarDesdeCero) {
    return { crear: true, motivo: 'el usuario eligió expresamente "empezar aquí desde cero" (PS-1009)' };
  }
  return {
    crear: false,
    motivo: 'carpeta personalizada sin base de datos y sin que el usuario haya elegido empezar desde cero',
  };
}

const BACKUP_KEEP = 15;
let launcherWin = null;
// A3.3/BLOQUE 5 — bloqueo LOCAL de escritura durante un borrado de proyecto.
// No es un latch ni vive en disco: solo impide que ESTE proceso reabra la
// ventana del proyecto o empiece escrituras suyas mientras se está retirando.
// La protección entre equipos es otra cosa (la reserva de subárbol del journal).
const proyectosEnBorrado = new Set(); // ids de proyecto
function proyectoBloqueadoPorBorrado(projectId) {
  return proyectosEnBorrado.has(Number(projectId)) || proyectosEnBorrado.has(projectId);
}

// A2 bajo A3.3 — BARRERA DE RESTAURACIÓN.
//
// Sustituye al `restoreInProgress` histórico, que solo miraban dos sitios
// (`backup:save` y el recuperador de renderers caídos). Mientras un proyecto se
// restaura, TODO lo suyo queda bloqueado: guardados, borrados, CV, purga, los
// flush de cierre de las tres familias de ventanas y su reapertura.
//
// Se arma ANTES de cerrar ninguna ventana, para que los close hooks sepan que
// cierran POR RESTAURACIÓN y no escriban el estado que se va a descartar.
const proyectosEnRestauracion = new Set(); // ids de proyecto
function proyectoEnRestauracion(projectId) {
  return proyectosEnRestauracion.has(Number(projectId)) || proyectosEnRestauracion.has(projectId);
}

// H-1 — SUBCONJUNTO del anterior: proyectos cuya restauración terminó SIN
// RESOLVER. No es lo mismo que "se está restaurando ahora mismo", y la
// diferencia importa en dos sitios:
//
//   - el mensaje: "ahora mismo" es falso cuando la operación ya terminó;
//   - `reintentable`: los canales lo deducen de `motivo ===
//     'proyecto-en-restauracion'`. Un restore en curso SÍ se puede reintentar
//     en cuanto acabe; uno sin resolver NO — reintentar no lo arregla, hace
//     falta la recuperación del arranque siguiente.
//
// Se puebla en el `finally` de `restoreProjectBackup()` cuando
// `mantenerBarrera` es true, y al rearmar las barreras desde disco. Se vacía
// cuando la recuperación resuelve el journal.
const restauracionesSinResolver = new Set(); // ids de proyecto
// En UNA línea a propósito: las baterías la extraen con `lineaConst()`.
const RESTAURACION_SIN_RESOLVER_MSG = 'Hay una restauracion anterior de este proyecto sin resolver. No se ha guardado nada: cierra Panorama del Servicio y vuelve a abrirlo para que termine de resolverse.';

// UNA sola función para "este proyecto no acepta mutaciones ahora mismo".
// Devuelve null si puede mutar, o el motivo si no. Las dos primeras barreras se
// excluyen entre sí: un proyecto no puede estar a la vez en borrado y en
// restauración.
//
// H-1 (15 sept 2026) — LA TERCERA PUERTA ES DURABLE. Los dos Set de arriba
// viven en memoria: tras un reinicio están vacíos, así que una restauración que
// terminó SIN RESOLVER (vuelta atrás no demostrable, volcado de la reposición
// fallido) dejaría de bloquear nada en cuanto se reabre la aplicación, y se
// aceptarían mutaciones nuevas del proyecto encima de un estado que todavía no
// se sabe cuál es. La fuente durable es el journal, y por eso se pregunta
// también por él. Ver `restauracionPendienteDeProyecto()`.
function proyectoBloqueadoParaMutar(projectId) {
  if (proyectoBloqueadoPorBorrado(projectId)) {
    return { motivo: 'proyecto-en-borrado', mensaje: 'Este proyecto se está eliminando; no se ha guardado nada.' };
  }
  // Antes que "en curso": un proyecto sin resolver está también en el Set de
  // arriba, y contestar "se está restaurando ahora mismo, reinténtalo" sería
  // mentira en los dos extremos.
  if (restauracionesSinResolver.has(Number(projectId)) || restauracionesSinResolver.has(projectId)) {
    return { motivo: 'restauracion-sin-resolver', clase: 'memoria', mensaje: RESTAURACION_SIN_RESOLVER_MSG };
  }
  if (proyectoEnRestauracion(projectId)) {
    return { motivo: 'proyecto-en-restauracion', mensaje: 'Se está restaurando un backup de este proyecto ahora mismo; no se ha guardado nada.' };
  }
  const rp = restauracionPendienteDeProyecto(projectId);
  if (rp) return rp;
  return null;
}

const projectWindows = new Map(); // id -> BrowserWindow
const meetingPrepWindows = new Map(); // project id -> BrowserWindow ("Preparación de Reunión")
const candidateEvalWindows = new Map(); // project id -> BrowserWindow ("Evaluación de Candidatos")

// ------------------------------------------------------------------
// Seguridad (cifrado de backups + login opcional al arrancar). Ver
// security.js para el cifrado en sí; aquí solo se guarda el estado en
// memoria de la sesión actual:
// - securityKey: la clave AES ya derivada de la contraseña (null si la
//   seguridad está desactivada, o si está activada pero aún no se ha
//   introducido la contraseña en esta sesión).
// - securityWin / pendingSecurityResolve: la ventana modal de
//   login/activar/cambiar/desactivar y la promesa pendiente de su resultado
//   (ver openSecurityWindow más abajo).
// El estado PERSISTENTE (si está activada, la sal, el verificador, y la
// contraseña recordada si se pidió) vive en la tabla app_meta de la propia
// base de datos — ver getMeta/setMeta/deleteMeta.
// ------------------------------------------------------------------
let securityKey = null;
let securityWin = null;
let pendingSecurityResolve = null;

function getMeta(key) {
  const row = dbmod.get('SELECT value FROM app_meta WHERE key=?', [key]);
  return row ? row.value : null;
}
// A3.3 paso 0 (auditoría 2026-09-13) — UNA SOLA sentencia, no DELETE+INSERT.
//
// Hasta ahora esto eran dos dbmod.run() seguidos, y cada dbmod.run() hace su
// propio persist() (exporta la base de datos ENTERA y la reescribe en disco,
// ver db.js). O sea: entre el DELETE y el INSERT había un instante en el que
// el archivo de disco NO CONTENÍA LA CLAVE. Si en ese hueco fallaba la segunda
// escritura (corte de la carpeta de Drive, disco lleno) o se cortaba la
// corriente, la clave desaparecía del disco para siempre — la memoria de la
// sesión sí la tenía, así que ni siquiera se notaba hasta el siguiente
// arranque.
//
// Para la mayoría de las claves eso sería una molestia (tema, tamaño de
// ventana). Para `security_salt` es pérdida IRREVERSIBLE: sin la sal no se
// puede volver a derivar la clave, y todos los backups, preparaciones de
// reunión y evaluaciones cifradas quedan ilegibles. Es la misma familia de
// fallo que arregló A1, por la otra punta.
//
// Se usa UPSERT y no `INSERT OR REPLACE` a propósito: REPLACE se implementa en
// SQLite como un borrado seguido de una inserción (cambia el rowid de la fila
// y, en un esquema con disparadores o claves foráneas en cascada, dispararía
// los de borrado). UPSERT hace un UPDATE de verdad sobre la fila existente, sin
// borrar nada. Comprobado sobre la base de datos real: app_meta es
// `(key TEXT PRIMARY KEY, value TEXT)`, no hay ningún disparador en toda la
// base de datos, no hay claves foráneas, y SQLite es 3.49.1 (UPSERT existe
// desde 3.24).
function setMeta(key, value) {
  // B2: proceso comprometido tras un fallo fatal -- no se inician escrituras nuevas.
  if (procesoComprometido) return;
  dbmod.run('INSERT INTO app_meta(key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, value]);
}
function deleteMeta(key) {
  // B2: proceso comprometido tras un fallo fatal -- no se inician escrituras nuevas.
  if (procesoComprometido) return;
  dbmod.run('DELETE FROM app_meta WHERE key=?', [key]);
}
function isSecurityEnabled() {
  return getMeta('security_enabled') === '1';
}

// v2.0.42: VACUUM periódico -- hasta ahora dbmod.vacuum() solo se ejecutaba
// una vez, ligado a la migración histórica que sacó el contenido de los
// backups fuera de la tabla `backups` (ver migrateLegacyInlineBackupsToFiles
// más abajo). Desde entonces, aunque las filas de backups/meeting_preps/
// candidate_evals se siguen podando con el tiempo (BACKUP_KEEP, etc.), el
// espacio que dejan libre no se recupera solo del archivo panorama.sqlite3
// en disco -- SQLite deja huecos hasta que alguien pide VACUUM de verdad.
// Con esta base de datos guardando solo metadatos ligeros (nunca el
// contenido pesado, que vive en archivos aparte) el efecto práctico es
// mínimo, pero es barato mantenerlo a raya: como mucho una vez al mes, en
// el arranque, sin bloquear nada más si fallara.
const VACUUM_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;
function maybeRunPeriodicVacuum() {
  try {
    const last = parseInt(getMeta('last_vacuum_at') || '0', 10) || 0;
    if (Date.now() - last < VACUUM_INTERVAL_MS) return;
    dbmod.vacuum();
    setMeta('last_vacuum_at', String(Date.now()));
    appLog('Mantenimiento — VACUUM periódico de panorama.sqlite3 ejecutado.');
  } catch (e) {
    appLog('Mantenimiento — no se pudo ejecutar el VACUUM periódico: ' + (e && e.message ? e.message : String(e)));
  }
}

// ------------------------------------------------------------------
// v2.0.27: tema visual GLOBAL de toda la aplicación (antes cada proyecto
// tenía su propio state.theme, ver vendor/theme.js para el detalle
// completo del porqué del cambio). Se guarda en app_meta bajo 'app_theme',
// igual que el resto de preferencias persistentes. Las claves válidas
// tienen que coincidir EXACTAMENTE con las de THEMES en vendor/theme.js —
// se listan aquí también porque el proceso principal no puede cargar ese
// archivo (es código de ventana, usa `document`).
// ------------------------------------------------------------------
const THEME_KEYS = ['medianoche', 'nube', 'cielo', 'niebla', 'marfil'];
const THEME_LABELS = { medianoche: 'Medianoche', nube: 'Nube', cielo: 'Cielo', niebla: 'Niebla', marfil: 'Marfil' };
function getGlobalTheme() {
  const t = getMeta('app_theme');
  return THEME_KEYS.includes(t) ? t : 'medianoche';
}
function setGlobalTheme(themeKey) {
  // B2: proceso comprometido tras un fallo fatal -- no se inician escrituras nuevas.
  if (procesoComprometido) return { ok: false, error: 'La aplicación está cerrándose por un fallo interno.' };
  if (!THEME_KEYS.includes(themeKey)) return { ok: false, error: 'Tema desconocido: ' + themeKey };
  setMeta('app_theme', themeKey);
  // Avisa en caliente a TODAS las ventanas abiertas en este momento (no solo
  // a la que pidió el cambio) -- si tienes el launcher y un proyecto abiertos
  // a la vez y cambias el tema desde el launcher, el proyecto abierto se
  // actualiza solo, sin tener que cerrarlo y volver a abrirlo.
  BrowserWindow.getAllWindows().forEach((w) => {
    if (w && !w.isDestroyed()) w.webContents.send('theme:changed', themeKey);
  });
  return { ok: true };
}
ipcMain.handle('theme:get', () => getGlobalTheme());
ipcMain.handle('theme:set', (evt, themeKey) => setGlobalTheme(themeKey));

// ------------------------------------------------------------------
// v2.0.26: recordar tamaño/posición de ventana entre sesiones -- antes
// cada ventana abría siempre con el width/height fijo del código, sin
// importar cómo la hubiera dejado el usuario la última vez ni en qué
// monitor. Se guarda en app_meta (misma tabla que el resto de
// preferencias persistentes, ver getMeta/setMeta arriba) bajo la clave
// 'bounds_<id>' -- un id por "rol" de ventana (launcher, project,
// meeting-prep, candidate-eval), no por proyecto concreto: lo normal es
// que el usuario quiera el mismo tamaño de ventana siempre que abre un
// dashboard de proyecto, no uno distinto por proyecto.
// restoreWindowBounds() solo devuelve el rectángulo guardado si sigue
// cayendo (al menos parcialmente) dentro de algún display CONECTADO
// ahora mismo -- si el usuario desconectó un segundo monitor donde
// tenía la ventana, abrir con el tamaño por defecto es mejor que abrir
// una ventana inaccesible fuera de pantalla.
function restoreWindowBounds(id, fallback) {
  try {
    const raw = getMeta('bounds_' + id);
    if (!raw) return fallback;
    const b = JSON.parse(raw);
    if (
      !b ||
      typeof b.width !== 'number' || typeof b.height !== 'number' ||
      typeof b.x !== 'number' || typeof b.y !== 'number' ||
      b.width < 100 || b.height < 100
    ) {
      return fallback;
    }
    const visible = screen.getAllDisplays().some((d) => {
      const wa = d.workArea;
      return b.x < wa.x + wa.width && b.x + b.width > wa.x && b.y < wa.y + wa.height && b.y + b.height > wa.y;
    });
    return visible ? { width: b.width, height: b.height, x: b.x, y: b.y } : fallback;
  } catch (e) {
    return fallback;
  }
}
// v2.0.38: área de trabajo del monitor donde debería abrir una ventana que
// va a arrancar MAXIMIZADA (lanzador y ventanas de proyecto/Directorio).
// Antes esas ventanas se creaban con el tamaño pequeño recordado
// (bounds.width/height) y se llamaba a win.maximize() justo después, ANTES
// de loadFile() -- confiando en que la transición de maximizado (un mensaje
// asíncrono a nivel de SO/Chromium) terminara de propagarse al proceso de
// renderizado antes de que ese proceso calculara su primer layout. En la
// práctica no siempre llega a tiempo: el primer layout se calculaba con el
// tamaño PEQUEÑO original, y solo unos milisegundos después (ya con la
// ventana visible) llegaba el resize real al tamaño maximizado -- de ahí el
// parpadeo de contenido "reducido" que se reajustaba de golpe, reportado
// por el usuario tanto al abrir un proyecto como el Directorio de Talento.
// Arreglo: en vez de crear la ventana pequeña y confiar en que maximize()
// la agrande a tiempo, se calculan aquí los píxeles reales del área de
// trabajo del monitor de destino y se usan DIRECTAMENTE como bounds
// iniciales de la ventana (ver createLauncherWindow/openProjectWindow) --
// el primer layout que hace el renderer ya coincide con el tamaño que se
// va a mostrar, así que no hay resize tardío que ver. maximize() se sigue
// llamando aparte, solo para que Electron/Windows registren el estado
// "maximizada" de verdad (doble clic en la barra para restaurar, icono de
// restaurar en vez de maximizar, etc.) -- como los píxeles ya coinciden,
// no provoca ningún cambio de tamaño visible.
function workAreaForMaximizedWindow(rememberedBounds) {
  try {
    if (rememberedBounds && typeof rememberedBounds.x === 'number' && typeof rememberedBounds.y === 'number') {
      return screen.getDisplayMatching({
        x: rememberedBounds.x,
        y: rememberedBounds.y,
        width: rememberedBounds.width || 1,
        height: rememberedBounds.height || 1,
      }).workArea;
    }
  } catch (e) { /* cae al monitor primario */ }
  return screen.getPrimaryDisplay().workArea;
}
// v2.0.38: rectángulo "normal" (no maximizado) al que debe volver una
// ventana que se CONSTRUYÓ ya a tamaño de área de trabajo (ver
// workAreaForMaximizedWindow) cuando el usuario la restaura a mano -- ver
// el comentario largo junto a `win.maximize()` en openProjectWindow/
// createLauncherWindow. Si hay tamaño/posición recordados válidos
// (rememberedBounds trae x/y), se usan tal cual; si no (primera vez, sin
// nada guardado todavía), se centra un tamaño por defecto dentro del área
// de trabajo en vez de dejarlo en 0,0.
function normalRectFor(rememberedBounds, workArea) {
  if (rememberedBounds && typeof rememberedBounds.x === 'number' && typeof rememberedBounds.y === 'number') {
    return rememberedBounds;
  }
  const width = (rememberedBounds && rememberedBounds.width) || 1400;
  const height = (rememberedBounds && rememberedBounds.height) || 880;
  return {
    width,
    height,
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
  };
}
// No se guarda si la ventana está maximizada/minimizada/en pantalla
// completa al cerrarse -- getBounds() en esos estados no es la geometría
// "normal" que el usuario querría recuperar la próxima vez.
function persistWindowBoundsOnClose(win, id) {
  win.on('close', () => {
    if (win.isDestroyed()) return;
    if (procesoComprometido) return; // B2: no escribir desde un proceso comprometido
    try {
      if (win.isMaximized() || win.isMinimized() || win.isFullScreen()) return;
      setMeta('bounds_' + id, JSON.stringify(win.getBounds()));
    } catch (e) {
      console.warn('No se pudo guardar el tamaño/posición de la ventana', id, e);
    }
  });
}

// El dashboard es un tema oscuro de punta a punta; forzamos también el tema
// oscuro de Electron (que es lo que usa para pintar la barra de menú nativa
// Archivo/Editar/Proyecto) en vez de dejarlo en 'system'. Si no, en un Windows
// configurado en modo claro esa barra sale clara-sobre-oscuro con muy poco
// contraste contra el resto de la ventana (que sí es oscura) — se ve como si
// no perteneciera a la misma app.
nativeTheme.themeSource = 'dark';

// (Se probó primero a topar el ancho de la ventana para que no sobrara hueco
// a los lados del contenido de 1280px de la plantilla, pero seguía notándose
// en pantallas grandes. El ajuste real está en plantilla_dashboard.html: un
// <style> propio, añadido al final, sube ese tope a 2400px — así el
// contenido usa el ancho real de la ventana, sea cual sea, en vez de
// dejarlo fijo en 1280px. La ventana de un proyecto ya no necesita ningún
// tope ni trato especial de maximizado.)

// ------------------------------------------------------------------
// Icono de la app. En Windows empaquetado, el .exe ya lleva el icono que
// electron-builder toma de build.win.icon (assets/icon.ico) — eso cubre el
// icono del propio ejecutable y de la barra de tareas al abrirlo desde ahí.
// Pero eso NO cubre el icono de cada BrowserWindow individual (la esquina de
// la ventana, y la barra de tareas cuando se arranca en modo desarrollo con
// `npm start`, donde no hay .exe con icono incrustado) — para eso hay que
// pasar `icon` explícitamente al crear cada ventana. Se usa el PNG de mayor
// resolución disponible; Electron lo reescala él solo para la esquina/barra
// de tareas.
// ------------------------------------------------------------------
const APP_ICON_PATH = path.join(__dirname, 'assets', 'icon-256.png');

// v2.0.18/v2.0.21: hubo aquí iconos propios (check verde / triángulo ámbar,
// con varias resoluciones LANCZOS para que Windows no tuviera que reescalar
// nada dentro del diálogo nativo) para el diálogo de "Aplicar parche".
// Retirados en la v2.0.32 (FASE 5c): ese diálogo pasó a usar el modal propio
// (vendor/modal.js), que no tiene hueco para un icono de imagen — ver
// applyAsarPatch más abajo. La señal ✓/✗ sigue en el propio texto del
// detalle. Los PNG de assets/patch-icons/ y assets/patch-valid-check.png/
// patch-invalid-warning.png se quedan sin usar en disco (no se han borrado
// por si se retoma un diálogo nativo en el futuro), pero ya no los carga
// nada del código.

// ------------------------------------------------------------------
// NOTA (v2.0.13): en v2.0.12 hubo aquí un LIGHT_TITLEBAR_OPTS
// (titleBarStyle:'hidden' + titleBarOverlay) para aclarar el color de la
// barra de título nativa de Windows a petición del usuario. Revertido por
// completo: confirmado por el usuario en Windows 11 real que
// titleBarStyle:'hidden' se lleva por delante el menú nativo de la
// aplicación (Archivo/Configuración, etc.) en las 7 ventanas donde se
// aplicó — no es solo un problema de color, rompe la navegación real de
// la app. Ver la entrada "2.0.13" en
// claude/panorama-app-project-context.md para el detalle completo y las
// opciones evaluadas antes de decidir revertir en vez de seguir
// parcheando esto.
// ------------------------------------------------------------------

function slugify(s) {
  return (
    String(s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'proyecto'
  );
}

// Mismo prefijo de localStorage que usa plantilla_dashboard.html (const
// LS_PREFIX ahí) — hace falta duplicarlo aquí para poder escribir
// directamente en la partición de un proyecto nuevo (ver
// seedNewProjectStorage más abajo) sin tener que cargar/ejecutar la
// plantilla real.
const LS_PREFIX = 'panorama_servicio_ib__';

// Réplica de applyProjectKeys(title, start) de plantilla_dashboard.html: a
// partir del id del proyecto calcula las mismas claves de localStorage que
// usará el propio dashboard al arrancar (ver resolveProjectIdentity ahí).
// Debe mantenerse en sync con esa función si algún día cambia.
//
// v0.1.40 — CAMBIO DE FONDO en el esquema de claves, no solo un parche más:
// hasta la 0.1.39, la clave se calculaba a partir del TÍTULO y la FECHA DE
// INICIO del proyecto (`slug(título)-fecha`), datos mutables que además
// main.js nunca ha podido conocer con certeza para un proyecto ya existente
// (no se guardan en la base de datos). Esa dependencia de datos mutables es
// la causa raíz de DOS bugs reales de esta misma sesión: el refresco de
// plantilla de la 0.1.35 machacando la fecha (0.1.37, "se quedaron los
// proyectos pero al entrar no hay datos"), y el riesgo latente de que
// renombrar un proyecto cambiara su clave y "perdiera de vista" sus datos.
// La solución de fondo (pedida explícitamente por el usuario: "que se te
// ocurre aplicar más... deja de ser un prototipo") es dejar de derivar la
// clave de nada que pueda cambiar, y usar el id numérico del proyecto —
// estable de por vida, ya usado tal cual por la tabla `backups` (project_id)
// y ya disponible en el propio dashboard vía window.panoramaBridge.projectId
// (preload.js, sin cambios: ya exponía projectId desde antes). Con esto,
// renombrar un proyecto o cualquier fallo al hornear la fecha en el
// factory-seed deja de poder afectar a si sus datos se encuentran o no.
function computeProjectKeys(projectId) {
  const slug = `proj-${projectId}`;
  return {
    storageKey: `panorama-servicio-full__${slug}`,
    historyKey: `panorama-servicio-historial__${slug}`,
  };
}

// Descifra el sobre "portable" que produce el propio dashboard cuando el
// cifrado de backups del dashboard (fuera de esta app) está activo — ver
// encryptBackupPayload/decryptBackupPayload en plantilla_dashboard.html:
// AES-256-GCM con clave derivada por PBKDF2 (150000 iteraciones, SHA-256) de
// la contraseña. SubtleCrypto (Web Crypto, usado ahí) pega el tag de
// autenticación (16 bytes) al final del ciphertext; Node's crypto lo pide
// aparte, así que hay que separarlo aquí a mano.
function decryptPortableEnvelope(envelope, password) {
  const salt = Buffer.from(envelope.salt, 'base64');
  const iv = Buffer.from(envelope.iv, 'base64');
  const raw = Buffer.from(envelope.ciphertext, 'base64');
  if (raw.length < 16) throw new Error('Envoltorio cifrado con un formato inesperado.');
  const authTag = raw.subarray(raw.length - 16);
  const ciphertext = raw.subarray(0, raw.length - 16);
  const key = crypto.pbkdf2Sync(password, salt, 150000, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString('utf8');
}

// Interpreta (y descifra si hace falta) el .json que el usuario elige al
// crear un proyecto nuevo desde "Nuevo proyecto" (opción "cargar copia de
// seguridad"). Acepta tres formas:
// - La "copia portable" que exporta el propio dashboard: {state, history, exportedAt},
//   cifrada o no (envoltorio {encrypted:true, salt, iv, ciphertext} — se pide
//   su contraseña con una ventanita, ver promptForPassword).
// - Un backup propio de esta app (de la carpeta "Ver carpeta de backups"),
//   cifrado con la Seguridad de la aplicación si estaba activada al
//   guardarlo — envoltorio {panoramaEncrypted:1, iv, tag, data} (ver
//   security.js) — se descifra con la Seguridad ya desbloqueada, o pidiendo
//   desbloquearla si hace falta.
// - Un volcado plano de localStorage (el formato del backup automático de
//   esta app sin cifrar): {"panorama_servicio_ib__panorama-servicio-full__...": "...json...", ...}.
async function parseAndDecryptImportedProjectJson(text, parentWin) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error('El archivo no es un JSON válido.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('El archivo no contiene datos reconocibles.');
  }

  if (parsed.panoramaEncrypted === 1) {
    if (!securityKey) {
      if (!isSecurityEnabled()) {
        throw new Error(
          'Este archivo es un backup cifrado con la Seguridad de la aplicación, pero la Seguridad no está activada ahora mismo — no se puede descifrar.'
        );
      }
      await openSecurityWindow('login', parentWin);
    }
    if (!securityKey) {
      throw new Error('Hace falta desbloquear la Seguridad de la aplicación (menú Seguridad) para importar este archivo.');
    }
    let plain;
    try {
      plain = securitymod.decryptString(securityKey, text);
    } catch (e) {
      throw new Error('No se pudo descifrar el archivo con la contraseña de Seguridad desbloqueada actualmente.');
    }
    parsed = JSON.parse(plain);
  } else if (parsed.encrypted === true) {
    let decrypted = false;
    let message = 'Este archivo está cifrado. Introduce la contraseña para descifrarlo:';
    for (let attempt = 0; attempt < 5 && !decrypted; attempt++) {
      const pwd = await promptForPassword(parentWin, message);
      if (!pwd) throw new Error('Importación cancelada: hace falta la contraseña del archivo cifrado.');
      try {
        const plain = decryptPortableEnvelope(parsed, pwd);
        parsed = JSON.parse(plain);
        decrypted = true;
      } catch (e) {
        message = 'Contraseña incorrecta. Inténtalo de nuevo:';
      }
    }
    if (!decrypted) throw new Error('No se pudo descifrar el archivo (demasiados intentos fallidos).');
  }

  if (!parsed.state && !parsed.projectTitle) {
    const fullKey = Object.keys(parsed).find((k) => k.includes('panorama-servicio-full__'));
    if (fullKey) {
      const histKey = Object.keys(parsed).find((k) => k.includes('panorama-servicio-historial__'));
      try {
        const state = JSON.parse(parsed[fullKey]);
        const history = histKey ? JSON.parse(parsed[histKey]) : [];
        parsed = { state, history };
      } catch (e) {
        throw new Error('El archivo no contiene un backup reconocible de este dashboard.');
      }
    }
  }
  const candidate = parsed.state && typeof parsed.state === 'object' ? parsed.state : parsed;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('Archivo no reconocido como copia de este dashboard.');
  }
  ['milestones', 'risks', 'skills', 'team', 'coverage', 'phases'].forEach((k) => {
    if (!Array.isArray(candidate[k])) candidate[k] = [];
  });
  const history = Array.isArray(parsed.history) ? parsed.history : [];
  return { state: candidate, history };
}

// ------------------------------------------------------------------
// F3 (17 sept 2026) — POLÍTICA DE APERTURA Y NAVEGACIÓN DE VENTANAS.
//
// Hasta aquí ninguna ventana interceptaba `window.open` ni las navegaciones.
// Medido en Electron real antes de tocar nada: `window.open('about:blank')`
// creaba una BrowserWindow de verdad —la «ventana negra» titulada «Electron»
// que se veía en los arneses—, un `file://` local también abría ventana, y un
// `<a target="_blank">` abría el destino DENTRO de la aplicación en vez de en
// el navegador del usuario.
//
// No era escalada de privilegios (la hija hereda contextIsolation+sandbox y no
// recibe ni `panoramaBridge` ni Node), pero sí una superficie de navegación
// innecesaria: contenido remoto dentro del marco de la app, sin barra de
// direcciones. Y el enlace legítimo de un entregable se abría donde no debía.
//
// La política: el producto NO necesita ventanas emergentes propias —no llama a
// `window.open` en ningún sitio—, así que se DENIEGA siempre la ventana hija.
// Lo único que se hace aparte es mandar http/https al navegador del sistema.
// ------------------------------------------------------------------

// Solo http/https, y solo si la URL parsea de verdad. Nada de `startsWith` ni
// de regex laxas: si `new URL` falla, se deniega y no se intenta "arreglarla".
function urlExternaPermitida(url) {
  try {
    const u = new URL(String(url));
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u : null;
  } catch (e) {
    return null;
  }
}

// Para el rastro: ni la URL entera (puede llevar identificadores o datos en la
// query) ni nada que el usuario no deba ver en un log. Esquema y host bastan.
function urlParaRastro(u) {
  try {
    return u.protocol + '//' + (u.host || '(sin host)');
  } catch (e) {
    return '(url no representable)';
  }
}

// Abre en el navegador del sistema. `shell.openExternal` devuelve una promesa
// que PUEDE rechazar (protocolo sin aplicación asociada, política del sistema):
// se captura siempre, porque un rechazo sin manejar tumbaría el proceso con
// B2. Si falla, queda rastro y NO se abre nada dentro de Electron.
function abrirEnNavegador(u, origen) {
  try {
    Promise.resolve(shell.openExternal(u.href)).catch((e) => {
      appLog(`No se pudo abrir un enlace externo (${origen}) en el navegador del sistema: `
        + `${urlParaRastro(u)} — ${motivoSinRutas(e)}`);
    });
  } catch (e) {
    appLog(`No se pudo abrir un enlace externo (${origen}) en el navegador del sistema: `
      + `${urlParaRastro(u)} — ${motivoSinRutas(e)}`);
  }
}

// ¿Es una navegación que el producto SÍ usa hoy? Se comprobó antes de poner la
// guardia: lo único que navega de verdad es `location.reload()` del dashboard,
// y las descargas, que van por `blob:` con <a download>. Todo lo demás (el
// resto de ventanas se cargan con `loadFile` desde el proceso principal, que
// no dispara `will-navigate`) es inesperado.
function navegacionInternaLegitima(destino, actual) {
  if (destino === actual) return true;              // recarga de la misma página
  try {
    const d = new URL(destino);
    if (d.protocol === 'blob:') return true;        // descargas (exportar CSV/Excel/…)
    const a = new URL(actual);
    // Cambio de ancla dentro del MISMO documento.
    return d.protocol === a.protocol && d.host === a.host && d.pathname === a.pathname;
  } catch (e) {
    return false;
  }
}

function aplicarPoliticaDeNavegacion(wc, etiqueta) {
  // Un `webContents` que no traiga estas APIs no puede llevar política. En
  // producción SIEMPRE las trae; esto solo evita reventar con un doble de
  // pruebas mínimo (los arneses de A2/Bloque 5 usan uno para las ventanas
  // ocultas de partición).
  if (!wc || typeof wc.setWindowOpenHandler !== 'function' || typeof wc.on !== 'function') return;
  if (typeof wc.isDestroyed === 'function' && wc.isDestroyed()) return;
  // 1) Ventanas nuevas: SIEMPRE denegadas. Si el destino es http/https, se
  //    manda al navegador del sistema; el resto (about:, file:, data:,
  //    javascript:, esquemas inventados, URLs rotas) se deniega sin más.
  wc.setWindowOpenHandler(({ url }) => {
    const u = urlExternaPermitida(url);
    if (u) abrirEnNavegador(u, etiqueta);
    else appLogUnaVezPorSesion(`f3-open-${etiqueta}`,
      `Se ha bloqueado la apertura de una ventana no prevista desde ${etiqueta}.`);
    return { action: 'deny' };
  });
  // 2) Navegaciones dentro de la propia ventana.
  wc.on('will-navigate', (evt, url) => {
    const actual = (() => { try { return wc.getURL(); } catch (e) { return ''; } })();
    if (navegacionInternaLegitima(url, actual)) return;
    evt.preventDefault();
    const u = urlExternaPermitida(url);
    if (u) abrirEnNavegador(u, etiqueta + ' (enlace)');
    else appLogUnaVezPorSesion(`f3-nav-${etiqueta}`,
      `Se ha bloqueado una navegación no prevista en ${etiqueta}.`);
  });
}

// ------------------------------------------------------------------
// F2 (17 sept 2026) — CONTENT-SECURITY-POLICY DE TODAS LAS VENTANAS.
//
// Hasta aquí ninguna ventana tenía CSP. Se entrega por CABECERA desde este
// único punto, no con un <meta> en cada plantilla. Medido en el Chromium de
// Electron 30.5.1 (batería claude/pruebas-a33/f2/) antes de decidir:
//   - `webRequest.onHeadersReceived` SÍ ve los documentos file://, también
//     dentro de un asar, y la cabecera SE APLICA;
//   - `session-created` se emite para la sesión por defecto y para cada
//     partición, así que un solo enganche cubre las 10 ventanas;
//   - no depende de que la copia horneada de cada proyecto se haya
//     regenerado: un proyecto viejo recibe la misma política;
//   - un documento que no esté en la tabla recibe la política CERRADA.
//
// Lo que esta CSP NO hace, dicho claro: las ventanas con `'unsafe-inline'`
// en script-src (todas menos lanzador y splash) siguen ejecutando un
// <script> en línea inyectado. Su valor es otro: corta la salida a la red
// (connect/img/font/media/estilos/scripts remotos), impide frames, objects y
// envíos de formulario, fija la base de las URL, deja sin `eval` y limita los
// Workers. Quitar `'unsafe-inline'` exigiría rehacer las plantillas.
//
// Sobre las fuentes (medido): en un documento file://, `'self'` equivale
// EXACTAMENTE a `file:` —cualquier archivo local, sin poder acotar por
// ruta—, así que no se repite `file:`. `data:` solo en img-src (logos y el
// fantasma de arrastre del lanzador). `blob:` no hace falta para exportar:
// una descarga no es una carga gobernada por la CSP. `'unsafe-eval'` NO:
// mammoth y pdf.js funcionan sin él.
//
// Workers (medido): uno creado desde un file: NO recibe CSP ni por <meta> ni
// por cabecera, y podría salir a la red; uno creado desde un blob: SÍ hereda
// la de la ventana. Por eso `worker-src 'none'` en todas las ventanas y
// `worker-src blob:` solo en Preparación, que arranca el Worker de pdf.js
// envuelto en un blob: (ver extractPdf en su plantilla). Sin `worker-src`
// explícito, los Workers caerían en script-src y se permitirían.
// ------------------------------------------------------------------
const CSP_SIN_RED_NI_INCRUSTADOS = [
  "connect-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
];
const CSP_PERFILES = Object.freeze({
  // restore-helper.html (ventanas ocultas de volcado/lectura de particiones) y
  // cualquier documento file:// que no esté en la tabla. main.js les habla
  // con executeJavaScript, que la CSP no bloquea (medido).
  cerrado: ["default-src 'none'", "form-action 'none'", "base-uri 'none'"].join('; '),
  // Lanzador y splash: no tienen NINGÚN <script> en línea ni manejadores en
  // línea, así que tampoco reciben `'unsafe-inline'` para scripts.
  sinScriptEnLinea: [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "worker-src 'none'",
    ...CSP_SIN_RED_NI_INCRUSTADOS,
  ].join('; '),
  // Dashboard y Directorio (copias horneadas), Evaluación de Candidatos,
  // selector de backups, Seguridad y la ventanita de contraseña.
  interfaz: [
    "default-src 'none'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "worker-src 'none'",
    ...CSP_SIN_RED_NI_INCRUSTADOS,
  ].join('; '),
  // Preparación de Reunión: lo mismo, más el Worker de pdf.js (por blob:).
  lectorDeActas: [
    "default-src 'none'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    'worker-src blob:',
    ...CSP_SIN_RED_NI_INCRUSTADOS,
  ].join('; '),
});

function perfilCspDeDocumento(url) {
  let ruta;
  try {
    ruta = path.resolve(fileURLToPath(url)).toLowerCase();
  } catch (e) {
    return 'cerrado';
  }
  const deLaApp = (...partes) => path.resolve(__dirname, ...partes).toLowerCase();
  switch (ruta) {
    case deLaApp('launcher', 'index.html'):
    case deLaApp('launcher', 'splash.html'):
      return 'sinScriptEnLinea';
    case deLaApp('preparacion-reunion', 'plantilla_preparacion_reunion.html'):
      return 'lectorDeActas';
    case deLaApp('dashboard', 'plantilla_dashboard.html'):
    case deLaApp('evaluacion-candidatos', 'plantilla_evaluacion_candidatos.html'):
    case deLaApp('backup-picker', 'index.html'):
    case deLaApp('security-window', 'index.html'):
    case deLaApp('launcher', 'password-prompt.html'):
      return 'interfaz';
    case deLaApp('dashboard', 'restore-helper.html'):
      return 'cerrado';
    default:
      break;
  }
  // Copia horneada de un proyecto o del Directorio (projectDashboardFile).
  const proyectos = path.resolve(app.getPath('userData'), 'projects').toLowerCase();
  if (/^\d+[\\/]dashboard\.html$/.test(path.relative(proyectos, ruta))) return 'interfaz';
  return 'cerrado';
}

function instalarCspEnSesion(ses) {
  if (!ses || !ses.webRequest || typeof ses.webRequest.onHeadersReceived !== 'function') return;
  ses.webRequest.onHeadersReceived((detalles, responder) => {
    const url = String((detalles && detalles.url) || '');
    // Solo archivos locales: el producto no carga nada más en sus ventanas, y
    // una respuesta de red no se toca.
    if (!/^file:/i.test(url)) {
      responder({});
      return;
    }
    let politica = CSP_PERFILES.cerrado;
    try {
      politica = CSP_PERFILES[perfilCspDeDocumento(url)] || CSP_PERFILES.cerrado;
    } catch (e) {
      /* ante la duda, cerrada */
    }
    // A un subrecurso (script, hoja, imagen, fuente) la cabecera no le hace
    // nada; se pone en todas las respuestas file: para no depender de cómo
    // clasifique Electron cada carga.
    const cabeceras = Object.assign({}, detalles.responseHeaders);
    cabeceras['Content-Security-Policy'] = [politica];
    responder({ responseHeaders: cabeceras });
  });
}
app.on('session-created', instalarCspEnSesion);

function createLauncherWindow() {
  if (launcherWin && !launcherWin.isDestroyed()) {
    launcherWin.focus();
    return launcherWin;
  }
  // v2.0.26: recordar tamaño/posición entre sesiones (ver
  // restoreWindowBounds más arriba) -- si nunca se guardó nada, o el
  // rectángulo guardado ya no cae en ningún monitor conectado, se usa el
  // tamaño de siempre. Con 2.0.38 (ver más abajo) este tamaño ya solo se
  // usa como el rectángulo "normal" al que volver si el usuario restaura a
  // mano -- la ventana en sí abre siempre maximizada.
  const launcherBounds = restoreWindowBounds('launcher', { width: 960, height: 680 });
  // v2.0.38: pedido explícito del usuario -- el lanzador (listado de
  // proyectos) abre siempre maximizado, igual que ya hacían las ventanas
  // de proyecto/Directorio desde 2.0.32. Mismo tratamiento que ahí para
  // evitar el parpadeo de contenido "reducido que se reajusta": la ventana
  // se CONSTRUYE directamente al tamaño del área de trabajo del monitor de
  // destino (workAreaForMaximizedWindow) en vez de al tamaño pequeño
  // recordado + maximize() después -- ver el comentario largo junto a
  // workAreaForMaximizedWindow() para el porqué.
  const launcherWorkArea = workAreaForMaximizedWindow(launcherBounds);
  launcherWin = new BrowserWindow({
    x: launcherWorkArea.x,
    y: launcherWorkArea.y,
    width: launcherWorkArea.width,
    height: launcherWorkArea.height,
    // v2.0.26: mínimo para que la barra de título propia (botones min/
    // max/cerrar) y el menú Archivo/Editar/Seguridad/Configuración no se
    // solapen ni partan mal si se arrastra el borde hasta casi nada.
    minWidth: 640,
    minHeight: 480,
    title: 'Panorama del Servicio — Proyectos',
    icon: APP_ICON_PATH,
    // v2.0.14 — PRUEBA PILOTO, SOLO en esta ventana (ver nota larga junto a
    // LAUNCHER_FRAMELESS_PILOT más abajo): frame:false en vez de
    // titleBarStyle:'hidden' (que en 2.0.12 se llevó el menú nativo por
    // delante). Con frame:false Windows no dibuja NADA propio arriba — ni
    // barra, ni botones, ni menú — así que launcher/index.html reconstruye
    // todo eso a mano (barra de título clara, botones de minimizar/
    // maximizar/cerrar, y el menú Archivo/Editar/Seguridad/Configuración
    // como desplegables propios conectados a los mismos manejadores de
    // main.js que usaba el menú nativo). El resto de ventanas de la app
    // siguen con marco nativo normal, sin tocar.
    frame: false,
    // show:false + 'ready-to-show' evita el parpadeo en blanco de una ventana
    // recién creada mientras todavía está cargando su HTML/CSS — se enseña
    // ya pintada. backgroundColor de reserva por si aun así hay un instante
    // sin contenido (misma base del tema oscuro que usa el propio HTML).
    show: false,
    backgroundColor: '#0a0e13',
    webPreferences: {
      preload: path.join(__dirname, 'preload-launcher.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // v2.0.38: igual que en openProjectWindow -- al construirse ya al tamaño
  // del área de trabajo, Windows no tiene un tamaño "normal" previo que
  // recordar por su cuenta para cuando el usuario restaure a mano (doble
  // clic en la barra); se restaura al tamaño recordado entre sesiones.
  const launcherNormalRect = normalRectFor(launcherBounds, launcherWorkArea);
  launcherWin.maximize();
  launcherWin.on('unmaximize', () => {
    if (launcherWin && !launcherWin.isDestroyed()) launcherWin.setBounds(launcherNormalRect);
  });
  aplicarPoliticaDeNavegacion(launcherWin.webContents, 'lanzador'); // F3
  launcherWin.loadFile(path.join(__dirname, 'launcher', 'index.html'));
  launcherWin.once('ready-to-show', () => {
    closeSplashWindow(() => {
      if (!launcherWin || launcherWin.isDestroyed()) return;
      launcherWin.show();
      // v2.0.42: ver el comentario largo junto a este mismo envío en
      // openProjectWindow() -- reenvía el estado real de maximizado justo
      // al mostrar la ventana, para el icono de la barra de título propia.
      launcherWin.webContents.send('win:maximizedChanged', launcherWin.isMaximized());
    });
  });
  launcherWin.on('maximize', () => {
    if (launcherWin && !launcherWin.isDestroyed()) launcherWin.webContents.send('win:maximizedChanged', true);
  });
  launcherWin.on('unmaximize', () => {
    if (launcherWin && !launcherWin.isDestroyed()) launcherWin.webContents.send('win:maximizedChanged', false);
  });
  launcherWin.on('closed', () => {
    launcherWin = null;
  });
  persistWindowBoundsOnClose(launcherWin, 'launcher');
  return launcherWin;
}

// ------------------------------------------------------------------
// Ventanita de "Cargando…" que se enseña ENSEGUIDA al arrancar la app (antes
// incluso de abrir la base de datos) — sin esto, entre hacer doble clic en
// el icono y ver la primera ventana real (login o launcher) pueden pasar
// varios segundos (arranque de Electron + inicialización de sql.js/WASM +
// lectura de la BD) sin ninguna señal en pantalla, lo cual se percibe como
// que la app "no ha arrancado" o se ha quedado colgada. Se cierra en cuanto
// la primera ventana real (login o launcher) está lista para mostrarse.
// ------------------------------------------------------------------
let splashWin = null;
let splashShownAt = 0;
let splashCloseTimer = null;
// Tiempo mínimo que "Iniciando…" se queda en pantalla, aunque la siguiente
// ventana real (login o launcher) esté lista para mostrarse antes de eso. En
// una máquina rápida ese hueco puede durar solo un par de cientos de
// milisegundos — demasiado poco para leerse, se percibe como un parpadeo en
// vez de una pantalla de carga ("apenas se ve", como reportó el usuario tras
// probarlo en su equipo real). Con este mínimo, aunque todo cargue al
// instante, la ventana se ve un rato antes de cerrarse.
const SPLASH_MIN_VISIBLE_MS = 4000;
function showSplashWindow() {
  splashShownAt = Date.now();
  splashWin = new BrowserWindow({
    width: 360,
    height: 200,
    frame: false,
    resizable: false,
    movable: true,
    show: true,
    backgroundColor: '#0a0e13',
    icon: APP_ICON_PATH,
    skipTaskbar: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  aplicarPoliticaDeNavegacion(splashWin.webContents, 'splash'); // F3
  splashWin.loadFile(path.join(__dirname, 'launcher', 'splash.html'));
  splashWin.on('closed', () => {
    splashWin = null;
  });
}

// v0.1.55: se usaba para avisar en la propia pantalla de "Iniciando…" si
// waitForCloudSyncIdleAtStartup() se alargaba. v0.1.57 quitó ese texto con
// la cuenta de segundos a petición explícita del usuario (la barra de
// progreso indeterminada ya deja claro que algo está en marcha), y con eso
// la función setSplashStatus() que lo escribía se quedó sin ninguna
// llamada — se retiró del todo en la 0.1.60 (auditoría de "no dejar
// restos" pedida por el usuario) en vez de dejarla muerta "por si acaso".
// Si algún día hace falta volver a avisar algo en la splash, se puede
// recuperar de una versión anterior en el historial de git/el snapshot de
// código guardado en el Project.
// Llamada por cada sitio que quiere pasar de "Iniciando…" a lo siguiente
// (mostrar el login, mostrar el launcher, o cerrar la app si se canceló el
// login). Respeta el mínimo SPLASH_MIN_VISIBLE_MS: si todavía no ha pasado,
// programa el cierre real (y el `afterClose` que trae, p.ej. mostrar la
// siguiente ventana) para cuando se cumpla, en vez de hacerlo de golpe.
// IMPORTANTE: `afterClose` es lo que antes se ejecutaba justo DESPUÉS de
// llamar a closeSplashWindow() en cada sitio (mostrar el launcher/login) —
// si eso se sigue disparando al instante mientras el cierre real del splash
// se retrasa, la ventana nueva tapa al splash de todas formas y el retraso
// no se nota. Por eso ese paso se pasa aquí como callback, para que ocurra
// EN EL MISMO momento que el cierre real, no antes.
// Idempotente — llamarla varias veces no falla ni duplica el cierre.
function closeSplashWindow(afterClose) {
  if (splashCloseTimer) {
    clearTimeout(splashCloseTimer);
    splashCloseTimer = null;
  }
  const doClose = () => {
    if (splashWin && !splashWin.isDestroyed()) splashWin.close();
    splashWin = null;
    if (typeof afterClose === 'function') afterClose();
  };
  if (!splashWin) {
    if (typeof afterClose === 'function') afterClose();
    return;
  }
  const elapsed = Date.now() - splashShownAt;
  const remaining = SPLASH_MIN_VISIBLE_MS - elapsed;
  if (remaining > 0) {
    splashCloseTimer = setTimeout(() => {
      splashCloseTimer = null;
      doClose();
    }, remaining);
  } else {
    doClose();
  }
}

function focusOrCreateLauncher() {
  const win = createLauncherWindow();
  win.focus();
  return win;
}

// La carpeta de backups de un proyecto se fija UNA vez (columna
// projects.backup_dir) y no se vuelve a recalcular a partir del nombre —
// así un proyecto renombrado más adelante no "pierde" sus backups antiguos
// en una carpeta con el nombre viejo. Los proyectos creados antes de que
// existiera esta columna (backup_dir todavía NULL) la reciben aquí mismo,
// la primera vez que hace falta, a partir de su nombre actual.
// v2.0.40: slug fijo de carpeta de backup del proyecto -- si `row.backup_dir`
// ya existe se reutiliza tal cual (nunca se recalcula al renombrar el
// proyecto); si no, se genera uno nuevo y se persiste en la fila. Antes esta
// misma lógica estaba copiada palabra por palabra en backupsDirForProject,
// meetingPrepsDirForProject y candidateEvalFileForProject (auditoría
// 2026-09-12, sección 3) -- unificada aquí, las 3 funciones ahora solo
// difieren en la subcarpeta que añaden debajo de este slug.
function ensureProjectBackupDirSlug(row) {
  let slug = row.backup_dir;
  if (!slug) {
    slug = `${row.id}-${slugify(row.name)}`;
    dbmod.run('UPDATE projects SET backup_dir=? WHERE id=?', [slug, row.id]);
  }
  return slug;
}

function backupsDirForProject(row) {
  const slug = ensureProjectBackupDirSlug(row);
  const dir = path.join(app.getPath('userData'), 'backups', slug);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// v0.1.42: carpeta de backups de EMERGENCIA, solo usada mientras
// driveOutageActive está activo (ver startUserDataWatchdog). A propósito
// ancla en app.getPath('appData') — SIEMPRE la ruta local real de Windows,
// nunca la carpeta personalizada — para que siga funcionando aunque sea
// justo esa carpeta personalizada la que ha dejado de responder. Mismo slug
// que backupsDirForProject, así que es fácil identificar a qué proyecto
// pertenece cada copia si hace falta rescatarla a mano.
const LOCAL_SAFETY_BACKUP_KEEP = 40;
function localSafetyBackupsDirForProject(row) {
  const slug = row.backup_dir || `${row.id}-${slugify(row.name)}`;
  const dir = path.join(app.getPath('appData'), 'panorama-app-safety-backups', slug);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
function purgeOldLocalSafetyBackups(dir) {
  let files;
  try {
    files = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith('backup_'))
      .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
  } catch (e) {
    return;
  }
  files.slice(LOCAL_SAFETY_BACKUP_KEEP).forEach(({ f }) => {
    try {
      fs.unlinkSync(path.join(dir, f));
    } catch (e) {
      /* no crítico */
    }
  });
}

// Carpeta de historial de "Preparación de Reunión" de un proyecto — reutiliza
// el mismo `backup_dir` (slug fijo del proyecto, no se recalcula si se
// renombra) que ya usan los backups automáticos, en una subcarpeta propia
// para no mezclar ambas cosas. Igual que los backups, el contenido de cada
// preparación vive en un archivo .json en disco (cifrado si la seguridad
// está activada) — la fila de `meeting_preps` solo guarda metadatos ligeros
// para poder listar el historial sin tener que leer/descifrar cada archivo.
function meetingPrepsDirForProject(row) {
  const slug = ensureProjectBackupDirSlug(row);
  const dir = path.join(app.getPath('userData'), 'backups', slug, 'reuniones');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ------------------------------------------------------------------
// "Evaluación de Candidatos" (v0.1.73): mismo principio que
// meetingPrepsDirForProject de arriba — subcarpeta propia dentro del
// backup_dir fijo del proyecto (no se mueve si el proyecto se renombra).
// Un único archivo por proyecto (no un historial), porque es un documento
// vivo que se va editando (puestos + entrevistas), no una serie de
// preparaciones independientes.
// ------------------------------------------------------------------
function candidateEvalFileForProject(row) {
  const slug = ensureProjectBackupDirSlug(row);
  const dir = path.join(app.getPath('userData'), 'backups', slug, 'evaluacion-candidatos');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'estado.json');
}

// v0.1.75: carpeta donde se guardan los CV adjuntados a cada evaluación —
// hermana de estado.json (misma carpeta base que candidateEvalFileForProject
// de arriba). A diferencia del JSON de puestos/evaluaciones, el CV en sí
// NUNCA se cifra aunque la Seguridad de la app esté activa: cifrar un
// binario arbitrario (PDF/Word) con el mismo mecanismo de encryptString
// (pensado para texto) no es trivial y no se ha construido — queda anotado
// como limitación conocida, no silenciada.
function candidateEvalCvDirForProject(row) {
  const jsonFile = candidateEvalFileForProject(row);
  const dir = path.join(path.dirname(jsonFile), 'cv');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Nombres de archivo de CV guardados por esta función siempre llevan el
// formato "<evalId>__<timestamp><ext>" (ver candidateEval:pickCv) — nunca
// contienen "/" ni "\" ni "..". Cualquier storedName que no cumpla esa forma
// se rechaza aquí antes de tocar el disco: llega desde el archivo
// estado.json guardado por la propia app, pero un archivo corrupto o
// editado a mano no debe poder salirse de la carpeta cv/.
function isSafeCvStoredName(storedName) {
  return (
    typeof storedName === 'string' &&
    storedName.length > 0 &&
    !storedName.includes('/') &&
    !storedName.includes('\\') &&
    !storedName.includes('..')
  );
}

// ------------------------------------------------------------------
// Por qué existe esto: la plantilla del dashboard decide si es "la plantilla
// en blanco sin configurar" comparando su factory-seed (projectTitle) con el
// valor de fábrica. Como todos los proyectos arrancan cargando el MISMO
// plantilla_dashboard.html compartido, cada VENTANA NUEVA vuelve a ver el
// factory-seed de fábrica y dispara otra vez el asistente obligatorio — aunque
// ese proyecto ya tenga datos guardados en su partición. La solución (la misma
// que usa la skill de Claude al generar un archivo por cliente) es hornear el
// factory-seed real dentro de una copia propia del archivo por proyecto, una
// vez que sabemos su título y fecha de inicio reales; a partir de ahí, abrir
// ese proyecto carga directamente sus datos, sin pasar por el asistente.
// No se toca ninguna función del archivo, solo el bloque JSON de factory-seed.
// ------------------------------------------------------------------
let stockTemplateCache = null;
function readStockTemplate() {
  if (!stockTemplateCache) {
    stockTemplateCache = fs.readFileSync(
      path.join(__dirname, 'dashboard', 'plantilla_dashboard.html'),
      'utf8'
    );
  }
  return stockTemplateCache;
}

// ------------------------------------------------------------------
// "Directorio de Talento": ventana singleton que consolida los perfiles de
// Equipo de TODOS los proyectos. Se implementa como una fila más de
// `projects` (kind='directorio_talento') para reutilizar sin duplicar toda
// la infraestructura ya existente y probada — partición propia, backups
// automáticos propios, menú "Proyecto" (Guardar backup ahora / Ver carpeta
// de backups / Restaurar último backup / Eliminar) — pero se excluye del
// listado normal de proyectos del launcher (ver ipcMain 'projects:list') y
// usa su propia plantilla (directorio/plantilla_directorio.html) en vez de
// la del dashboard.
// ------------------------------------------------------------------
const DIRECTORIO_KIND = 'directorio_talento';
let directorioTemplateCache = null;
function readDirectorioStockTemplate() {
  if (!directorioTemplateCache) {
    directorioTemplateCache = fs.readFileSync(
      path.join(__dirname, 'directorio', 'plantilla_directorio.html'),
      'utf8'
    );
  }
  return directorioTemplateCache;
}

function ensureDirectorioTalentoProject() {
  let row = dbmod.get('SELECT * FROM projects WHERE kind=?', [DIRECTORIO_KIND]);
  if (!row) {
    const now = new Date().toISOString();
    const partition = 'persist:directorio-talento';
    const id = dbmod.run(
      'INSERT INTO projects(name, client, partition_name, created_at, updated_at, kind) VALUES (?,?,?,?,?,?)',
      ['Directorio de Talento', '', partition, now, now, DIRECTORIO_KIND]
    );
    dbmod.run('UPDATE projects SET backup_dir=? WHERE id=?', [`${id}-directorio-talento`, id]);
    row = dbmod.get('SELECT * FROM projects WHERE id=?', [id]);
  }
  // A diferencia de los proyectos normales (cuya copia horneada lleva un
  // "factory-seed" propio de ese proyecto y por eso solo se genera una vez),
  // el Directorio de Talento es un singleton sin datos propios en el HTML:
  // todo lo que el usuario ve (personas, campos manuales, sincronizaciones)
  // vive en localStorage/backups de su partición, no en este archivo. El
  // archivo es solo "código" — así que se puede y se debe rehornear siempre
  // con la plantilla actual, para que las correcciones de código de nuevas
  // versiones lleguen también a un Directorio creado con una versión
  // anterior (si no, quedaría congelado para siempre en la versión en la
  // que se abrió por primera vez, igual que le pasó al feedback del botón
  // "Sincronizar ahora" antes de este cambio).
  const file = projectDashboardFile(row.id);
  fs.writeFileSync(file, fixVendorScriptPaths(readDirectorioStockTemplate()), 'utf8');
  return row;
}

// ------------------------------------------------------------------
// Recorre el último backup guardado de cada proyecto NORMAL (excluye el
// propio Directorio de Talento) y devuelve su Equipo aplanado en filas con
// la misma forma que produce la importación manual de CSV/Excel del
// Directorio — así el renderer puede pasarlas directamente por su
// mergeImportedRow() de siempre, sin duplicar lógica de fusión/dedupe aquí.
// Un proyecto sin backups todavía, o cuyo backup no se puede leer/descifrar,
// no aborta la sincronización entera: se recoge en `errors` y se sigue con
// el resto.
// ------------------------------------------------------------------
function collectTeamProfilesFromProjects() {
  const rows = dbmod.all("SELECT * FROM projects WHERE kind='project' ORDER BY name");
  const profiles = [];
  const errors = [];
  for (const row of rows) {
    const bkRow = dbmod.get(
      'SELECT * FROM backups WHERE project_id=? ORDER BY created_at DESC LIMIT 1',
      [row.id]
    );
    if (!bkRow) continue; // proyecto todavía sin ningún backup: nada que sincronizar de él
    let dump;
    try {
      dump = JSON.parse(readBackupPayload(row, bkRow));
    } catch (e) {
      errors.push({ project: row.name, message: (e && e.message) || String(e) });
      continue;
    }
    const fullKey = Object.keys(dump).find((k) => k.includes('panorama-servicio-full__'));
    if (!fullKey) continue;
    let projectState;
    try {
      projectState = JSON.parse(dump[fullKey]);
    } catch (e) {
      errors.push({ project: row.name, message: 'Backup con formato inesperado.' });
      continue;
    }
    const team = Array.isArray(projectState.team) ? projectState.team : [];
    team.forEach((t) => {
      // Una plaza "en búsqueda de candidato" (rotación aún sin cubrir) es una
      // entrada de equipo SIN persona real todavía: la plantilla del dashboard
      // la crea con alias:'—' (guion, placeholder visual) y pendingCandidate:true,
      // y solo deja de estarlo cuando de verdad se asigna a alguien (ver
      // dashboard/plantilla_dashboard.html, el botón "candidato encontrado").
      // Sincronizarla como si fuera una persona metía en el Directorio una fila
      // sin nombre real — se excluye aquí, igual que hace el propio dashboard
      // al no contarla como asignación cubierta.
      if (t.pendingCandidate) return;
      const aliasTrim = (t.alias || '').trim();
      if (!aliasTrim || aliasTrim === '—' || aliasTrim === '-') return;
      profiles.push({
        proyecto: row.name,
        nombre: t.alias || '',
        rol: t.role || '',
        fechaIncorporacion: t.date || '',
        estado: t.status || 'activo',
        dni: t.dni || '',
        email: t.email || '',
        telefono: t.telefono || '',
        fechaSalida: t.rotationDate || '',
        fechaSalidaPrevista: t.scheduledExit || '',
        // v0.1.94: fechas de inicio/fin del PROYECTO de origen (no de la
        // persona) — "Inicio servicio"/"Fin estimado" que el usuario
        // mantiene en la cabecera del dashboard. A diferencia de la
        // "Fecha" de cada fila de equipo (que en la práctica puede
        // quedar clavada a un valor heredado sin relación con el inicio
        // real de ESE contrato — visto con datos reales de un caso
        // reportado), esta fecha de proyecto sí es la que el usuario
        // actualiza a propósito para reflejar cuándo arranca/termina
        // cada contrato. Ver directorio/plantilla_directorio.html,
        // estadoEfectivoAsignacion().
        proyectoInicio: projectState.serviceStart || '',
        proyectoFin: projectState.serviceEnd || '',
      });
    });
  }
  return { profiles, errors };
}

// ------------------------------------------------------------------
// Lee el backup más reciente de UN proyecto concreto y lo devuelve en la
// misma forma {state, exportedAt} que "Preparación de Reunión" ya espera
// como `jsonRaw` — es literalmente lo mismo que antes había que exportar a
// mano y subir con contraseña, solo que leído directamente aquí. Reutiliza
// el mismo `readBackupPayload` que ya usa el Directorio de Talento, así que
// hereda gratis el descifrado con la seguridad de la app si el backup está
// cifrado (y el mismo error explicativo si la seguridad está bloqueada).
// ------------------------------------------------------------------
// ------------------------------------------------------------------
// B1 (15 sept 2026) — CONTEXTO DE UNA PASADA DE `listProjectRows()`.
//
// El problema que resuelve: `computeProjectRowExtras()` llamaba a cuatro
// funciones que, cada una por su cuenta, volvían a leer y parsear el ÚLTIMO
// BACKUP del mismo proyecto — cuatro `readFileSync` + ocho `JSON.parse` + ocho
// consultas SQL por proyecto y por refresco, síncronos, en el proceso
// principal, y con la carpeta de datos en `G:` (Google Drive). Más dos lecturas
// del `estado.json` de Evaluación de Candidatos. Medido, no estimado.
//
// LA CACHÉ VIVE Y MUERE DENTRO DE UNA LLAMADA. No es una caché general ni un
// estado global: se crea aquí, se pasa hacia abajo y se tira al terminar. Eso
// es deliberado y es lo que impide que esta optimización empeore **P13** (la
// frescura: el lanzador sirve del último backup persistido). Una pasada ve un
// snapshot coherente; la siguiente vuelve a leer disco.
//
// `avisados` cumple el otro objetivo: que un backup roto deje rastro SIN
// repetirlo una vez por cada métrica que dependía de él.
function nuevoContextoListado() {
  return {
    filas: new Map(),          // projectId -> fila de `projects`
    estados: new Map(),        // projectId -> resultado de getProjectStateForMeetingPrep
    evaluaciones: new Map(),   // projectId -> resultado de readCandidateEvalPayloadForProject
    avisados: new Set(),       // `${projectId}|${recurso}` ya registrado en app.log
  };
}

// Un solo aviso por proyecto + recurso + pasada. Sin payload, sin rutas
// completas, sin nada del contenido: id, recurso, clase y un motivo recortado.
//
// Esto NO cierra B3 (las 29 rutas que solo hacen console.warn): es el mínimo
// para que B1 deje de degradarse EN SILENCIO ABSOLUTO. Hasta ahora, un backup
// corrupto dejaba la tarjeta del proyecto sin semáforo y sin aviso, y no
// quedaba ni una línea en ningún sitio — ni siquiera un console.warn, porque
// las funciones no lanzan: devuelven null y el try/catch nunca se ejecuta.
function avisarExtraDegradado(ctx, projectId, recurso, clase, motivo) {
  if (!ctx) return;
  const k = String(projectId) + '|' + recurso;
  if (ctx.avisados.has(k)) return;
  ctx.avisados.add(k);
  const detalle = String(motivo || '').replace(/[\r\n]+/g, ' ').slice(0, 120);
  appLog(`Listado de proyectos — proyecto ${projectId}: no se pudo leer ${recurso} (${clase}). ` +
    `Sus indicadores salen vacíos en el lanzador.${detalle ? ' Detalle: ' + detalle : ''}`);
}

// La fila del proyecto también se memoiza: `computeCandidatePendingInterviews` y
// `computeCandidateTeamCoverage` la volvían a pedir por su cuenta.
function filaDeProyecto(projectId, ctx) {
  if (ctx && ctx.filas.has(projectId)) return ctx.filas.get(projectId);
  const row = dbmod.get('SELECT * FROM projects WHERE id=?', [projectId]);
  if (ctx) ctx.filas.set(projectId, row);
  return row;
}

// `ctx` es OPCIONAL a propósito: sin él, esta función se comporta exactamente
// como siempre (lee de disco, usa la ruta que materializa). Así los otros
// llamadores — `meeting:getProjectData`, el helper de Preparación de Reunión —
// no cambian de comportamiento. Solo el flujo de `projects:list` pasa contexto.
function getProjectStateForMeetingPrep(projectId, ctx) {
  if (ctx && ctx.estados.has(projectId)) return ctx.estados.get(projectId);
  const r = leerProjectStateForMeetingPrep(projectId, ctx);
  if (ctx) ctx.estados.set(projectId, r);
  return r;
}
function leerProjectStateForMeetingPrep(projectId, ctx) {
  const row = filaDeProyecto(projectId, ctx);
  if (!row) return { ok: false, error: 'Proyecto no encontrado.' };
  const bkRow = dbmod.get(
    'SELECT * FROM backups WHERE project_id=? ORDER BY created_at DESC LIMIT 1',
    [projectId]
  );
  if (!bkRow) {
    avisarExtraDegradado(ctx, projectId, 'el último backup', 'sin-backup', '');
    return {
      ok: false,
      error:
        'Este proyecto todavía no tiene ningún backup guardado — guarda algún ' +
        'cambio en su dashboard primero (se guarda solo cada pocos segundos, o ' +
        'con "Proyecto > Guardar backup ahora").',
    };
  }
  let dump;
  try {
    // B1: con contexto (o sea, desde `projects:list`) se usa la ruta PURA. Sin
    // `{puro:true}`, `readBackupPayload` llama a `backupsDirForProject()`, que
    // llama a `ensureProjectBackupDirSlug()` y hace `UPDATE projects SET
    // backup_dir` + `mkdirSync` — una ESCRITURA lateral en un canal de solo
    // lectura, justo el patrón que A2 sacó de los caminos del restore (R1).
    // `rutaBackupsPura()` deriva el mismo slug sin materializar nada.
    dump = JSON.parse(readBackupPayload(row, bkRow, ctx ? { puro: true } : undefined));
  } catch (e) {
    const msg = (e && e.message) || String(e);
    avisarExtraDegradado(ctx, projectId, 'el último backup',
      /cifrado|descifrar|seguridad/i.test(msg) ? 'cifrado-no-legible' : 'ilegible', msg);
    return { ok: false, error: msg };
  }
  const fullKey = Object.keys(dump).find((k) => k.includes('panorama-servicio-full__'));
  if (!fullKey) {
    avisarExtraDegradado(ctx, projectId, 'el último backup', 'formato-inesperado', 'sin clave panorama-servicio-full');
    return { ok: false, error: 'El backup de este proyecto no tiene el formato esperado.' };
  }
  let projectState;
  try {
    projectState = JSON.parse(dump[fullKey]);
  } catch (e) {
    avisarExtraDegradado(ctx, projectId, 'el último backup', 'formato-inesperado', (e && e.message) || '');
    return { ok: false, error: 'Backup con formato inesperado.' };
  }
  return { ok: true, state: projectState, exportedAt: bkRow.created_at || null };
}

// ------------------------------------------------------------------
// Semáforo de urgencia por proyecto para las tarjetas del launcher
// (v0.1.26). Reutiliza getProjectStateForMeetingPrep de arriba (mismo
// mecanismo ya probado que usa "Preparación de Reunión" para leer el
// último backup de un proyecto) — nada nuevo en cómo se lee el dato, solo
// en qué se hace con él. La Seguridad, si está activada, ya está
// desbloqueada a estas alturas siempre (runLoginFlow() se resuelve antes
// de crear el launcher — ver app.whenReady más abajo), así que no hace
// falta contemplar aquí el caso de backup cifrado sin clave.
//
// Reglas acordadas con el usuario (ajustadas en v0.1.28 — ver más abajo,
// eran más anchas hasta 0.1.27):
// - rojo: algún hito pendiente retrasado (fecha estimada ya pasada, sin
//   fecha real registrada), o un riesgo abierto de criticidad alta YA
//   materializado.
// - naranja: hito pendiente cuya fecha estimada cae hoy o mañana (0-1
//   días vista). Antes eran 0-3 días; se estrechó a propósito para que
//   naranja sea "de verdad inminente" y deje sitio a un escalón intermedio.
// - amarillo (tono actual, ni el más claro ni el más oscuro): hito
//   pendiente a 2-3 días vista.
// - amarillo-claro (tono nuevo, mucho más pálido que el anterior): hito
//   pendiente a 4-7 días vista — "a vigilar, todavía no urge".
// - Los riesgos abiertos de criticidad alta sin materializar siguen
//   usando el amarillo intermedio (no hay una "fecha" de riesgo con la
//   que graduar entre los dos amarillos, así que se deja en el nivel de
//   siempre).
// - null (sin color): nada de lo anterior, o el proyecto no tiene ningún
//   backup guardado todavía (nada que evaluar). El usuario confirmó que
//   no hace falta un "verde" explícito de buen estado.
//
// Los hitos RECURRENTES se excluyen a propósito de este cálculo (no
// aportan al semáforo de la tarjeta del launcher) — queda pendiente si
// hace falta en el futuro. Sí se avisan dentro del propio dashboard del
// proyecto (ver 0.1.95: la fila del hito, la "Vía de despliegue" y el
// Estado Ejecutivo ya usan el mismo semáforo rojo/ámbar/gris que un hito
// normal, con el texto "N día(s) sin actualizar"). El usuario pidió
// explícitamente en la 0.1.96 que este color NO salga también aquí fuera,
// en la tarjeta: "prefiero que me avise solo dentro en rojo los días que
// lleva sin actualizarse" — así que la tarjeta del launcher se queda como
// estaba, sin tener en cuenta los hitos recurrentes.
function riskCriticidadAlta(r) {
  // Misma fórmula que riskLevel() en dashboard/plantilla_dashboard.html
  // (probabilidad × impacto): >6 es criticidad alta. Duplicada aquí a
  // propósito — esa función vive en el HTML del dashboard, que corre en un
  // renderer, no en este proceso principal.
  return (Number(r.p) || 0) * (Number(r.i) || 0) > 6;
}
function computeProjectSemaforo(projectId, ctx) {
  const result = getProjectStateForMeetingPrep(projectId, ctx);
  if (!result.ok) return null; // sin backup todavía, o error al leerlo: nada que mostrar
  const st = result.state || {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const RANK = { 'amarillo-claro': 1, amarillo: 2, naranja: 3, rojo: 4 };
  let worst = null;
  function bump(level) {
    if (!worst || RANK[level] > RANK[worst]) worst = level;
  }
  (Array.isArray(st.milestones) ? st.milestones : []).forEach((m) => {
    if (m.recurrente) return; // excluido a propósito, ver comentario arriba
    if (m.actualDate) return; // ya completado, no aporta urgencia
    if (!m.date) return;
    const diffDays = Math.round((new Date(m.date + 'T00:00:00') - today) / 86400000);
    if (diffDays < 0) bump('rojo');
    else if (diffDays <= 1) bump('naranja');
    else if (diffDays <= 3) bump('amarillo');
    else if (diffDays <= 7) bump('amarillo-claro');
  });
  (Array.isArray(st.risks) ? st.risks : []).forEach((r) => {
    if (r.status === 'cerrado') return;
    if (!riskCriticidadAlta(r)) return;
    if (r.status === 'materializado') bump('rojo');
    else bump('amarillo');
  });
  return worst;
}

// ------------------------------------------------------------------
// Aviso de "servicio finalizando/finalizado" para las tarjetas del launcher
// (v2.0.11). Mismo mecanismo que computeProjectSemaforo (lee el último
// backup vía getProjectStateForMeetingPrep) pero como badge INDEPENDIENTE
// del semáforo de hitos/riesgos -- mezclar los dos conceptos en el mismo
// color de borde habría hecho ambiguo un borde rojo (¿hito vencido? ¿riesgo
// materializado? ¿servicio terminado?), así que este es su propio texto,
// igual que "N entrevista(s) pendiente(s)" (ver computeCandidatePendingInterviews).
// Umbral de aviso: 30 días de antelación -- no configurable por ahora, es un
// valor razonable por defecto, documentado como tal en la entrega.
// También cubre la prórroga ESTIMADA (tentativa, sin confirmar, v2.0.11):
// si su fecha se acerca o pasa sin haberse confirmado, avisa igual que el
// fin de servicio real -- se queda con el aviso más grave de los dos.
// ------------------------------------------------------------------
// E2 (15 sept 2026) — ESTA FUNCIÓN YA NO CALCULA NADA. Toda la lógica vive en
// `vendor/service-status.js`, que comparten este proceso y el dashboard de cada
// proyecto. Aquí solo queda lo que es propio de main: de dónde sale el estado.
//
// Antes había DOS copias de la misma lógica y habían divergido — el fix de
// v2.0.52 (`serviceStart` futuro tiene prioridad) entró aquí y nunca en el
// dashboard, así que el mismo proyecto podía decir «Arranca en 3 días» en el
// lanzador y «Servicio finaliza en 20 días» en su propio panel. Ver E2 en
// `claude/pendientes-abiertos.md`.
//
// Devuelve el objeto COMPLETO del helper (`kind`/`level`/`days`/`message`), no
// solo `{level, message}`: `computeProjectRowExtras` proyecta los campos
// estructurados en la fila, y así `portfolio:summary` dejó de tener que sacar
// los días con una regex sobre el texto.
function computeServiceEndWarning(projectId, ctx) {
  const result = getProjectStateForMeetingPrep(projectId, ctx);
  if (!result.ok) return null;
  return serviceStatusMod.serviceStatus(result.state || {}, new Date());
}

function projectDashboardDir(projectId) {
  const dir = path.join(app.getPath('userData'), 'projects', String(projectId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function projectDashboardFile(projectId) {
  return path.join(projectDashboardDir(projectId), 'dashboard.html');
}

// ------------------------------------------------------------------
// La plantilla original (dashboard/plantilla_dashboard.html) carga las
// librerías de Excel/PowerPoint con rutas relativas ("../vendor/...") que
// solo son correctas cuando el archivo vive un nivel por debajo de la
// carpeta de la app (que es donde está "vendor/"). La copia horneada de
// cada proyecto vive en otro sitio totalmente distinto (la carpeta de
// datos de usuario de Windows, dentro de "projects/<id>/"), así que esa
// misma ruta relativa apunta a una carpeta que no existe y las dos
// librerías no llegan a cargarse — sin dar ningún error visible, los
// botones de exportar Excel y el informe ejecutivo (PowerPoint) simplemente
// no hacen nada. Se corrige sustituyendo esas dos etiquetas <script> por
// la ruta absoluta real de la carpeta "vendor/" de la app instalada.
// ------------------------------------------------------------------
function fixVendorScriptPaths(html) {
  const vendorXlsx = pathToFileURL(path.join(__dirname, 'vendor', 'xlsx.full.min.js')).href;
  const vendorPptx = pathToFileURL(path.join(__dirname, 'vendor', 'pptxgen.bundle.js')).href;
  // v2.0.16: mismo problema, mismo arreglo, para el icono de la barra de
  // título propia (ver createLauncherWindow) — "../assets/icon-256.png" es
  // correcto en la plantilla ORIGINAL (un nivel bajo la carpeta de la app,
  // igual que vendor/), pero se rompe igual que los <script> de arriba en
  // la copia horneada de cada proyecto, que vive en userData/projects/<id>/.
  const iconPath = pathToFileURL(APP_ICON_PATH).href;
  // v2.0.26: mismo problema, mismo arreglo, para la hoja de fuentes locales
  // (ver vendor/fonts/fonts.css) — sin esto, tras vendorizar Inter/JetBrains
  // Mono, la copia horneada de cada proyecto dejaba de encontrar la hoja
  // (ruta relativa rota igual que los <script> de arriba) y las fuentes no
  // llegaban a cargar -- caían en silencio al fallback system-ui, ni un
  // error visible, exactamente el mismo fallo que ya tenían xlsx/pptx antes
  // de este mismo arreglo.
  const vendorFonts = pathToFileURL(path.join(__dirname, 'vendor', 'fonts', 'fonts.css')).href;
  // v2.0.27: mismo problema, mismo arreglo, para vendor/theme.js (el tema
  // visual global — ver ese archivo) -- sin esto, la copia horneada de cada
  // proyecto no encontraría THEMES/applyTheme y se quedaría siempre con los
  // colores de :root tal cual estén en el HTML, ignorando el tema elegido.
  const vendorTheme = pathToFileURL(path.join(__dirname, 'vendor', 'theme.js')).href;
  // v2.0.29: mismo problema, mismo arreglo, para vendor/motion.css (Fase 3:
  // transiciones y movimiento) -- sin esto, la copia horneada de cada
  // proyecto no encontraría la hoja y se quedaría sin animaciones,
  // simplemente porque la ruta relativa no resuelve, no por ningún error.
  const vendorMotion = pathToFileURL(path.join(__dirname, 'vendor', 'motion.css')).href;
  // v2.0.31: mismo problema, mismo arreglo, para vendor/modal.js (Fase 5a/5b:
  // modal de confirmación/aviso propio) -- sin esto, la copia horneada de
  // cada proyecto no encontraría psConfirm()/psAlert() y cualquier llamada
  // lanzaría un ReferenceError silencioso hasta que el usuario intentara
  // usar esa acción en concreto.
  const vendorModal = pathToFileURL(path.join(__dirname, 'vendor', 'modal.js')).href;
  // v2.0.41: mismo problema, mismo arreglo, para vendor/window-chrome.css
  // (2.0.40: barra de título/controles y scrollbar unificados) -- se me
  // olvidó añadirlo aquí al crear el archivo, así que en la copia horneada
  // de cada proyecto (dashboard Y directorio, los dos pasan por esta
  // función) la ruta relativa no resolvía y la hoja no llegaba a cargar:
  // la barra de título se quedaba sin ningún estilo -- fondo oscuro por
  // defecto del body en vez del gris claro con los controles, tal como lo
  // reportó el usuario en la v2.0.40 recién instalada. preparacion-reunion
  // no se vio afectada porque esa ventana NO se hornea (se carga siempre
  // directamente desde la carpeta de la app).
  const vendorWindowChrome = pathToFileURL(path.join(__dirname, 'vendor', 'window-chrome.css')).href;
  // E2 (15 sept 2026): mismo problema, mismo arreglo, para
  // vendor/service-status.js -- la fuente única del estado temporal del
  // servicio. Sin esto, la copia horneada de cada proyecto no encontraría
  // `PanoramaServiceStatus` y `computeServiceEndWarningLocal()` devolvería
  // siempre `null`: el aviso de fin de servicio desaparecería del dashboard
  // sin ningún error visible, que es exactamente el modo de fallo que ya
  // tuvieron xlsx/pptx, theme.js y modal.js antes de entrar en esta lista.
  const vendorServiceStatus = pathToFileURL(path.join(__dirname, 'vendor', 'service-status.js')).href;
  // P17 (17 sept 2026) — los nueve reemplazos se hacían con
  // `String.replace(cadena, cadena)`, que arrastraba DOS defectos de la misma
  // familia:
  //   1. con patrón de CADENA solo se sustituye la PRIMERA coincidencia. Ocho
  //      de los nueve assets aparecen una sola vez y por eso nunca se notó,
  //      pero `src="../assets/icon-256.png"` aparece DOS veces —pantalla de
  //      carga y barra de título— en el dashboard Y en el Directorio: la
  //      segunda se quedaba con la ruta relativa, que desde
  //      userData/projects/<id>/ no resuelve, y el icono salía roto.
  //   2. la URL se pasaba como CADENA DE REEMPLAZO, donde `$&`, '$`' y `$'`
  //      tienen significado. Una carpeta de instalación que los contuviera
  //      corrompía el horneado: medido, con `$'` el archivo pasaba de 373 KB a
  //      189 MB y quedaban 2210 rutas sin resolver.
  // Se sustituye por UN SOLO patrón para los nueve: expresión regular GLOBAL
  // (resuelve todas las ocurrencias) y FUNCIÓN de reemplazo (la ruta se
  // inserta literal, sin semántica de `$`).
  const sustituirTodo = (texto, busca, pone) =>
    texto.replace(new RegExp(busca.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), () => pone);
  const ASSETS = [
    ['<script src="../vendor/service-status.js"></script>', `<script src="${vendorServiceStatus}"></script>`],
    ['<script src="../vendor/xlsx.full.min.js"></script>', `<script src="${vendorXlsx}"></script>`],
    ['<script src="../vendor/pptxgen.bundle.js"></script>', `<script src="${vendorPptx}"></script>`],
    ['src="../assets/icon-256.png"', `src="${iconPath}"`],
    ['<link rel="stylesheet" href="../vendor/fonts/fonts.css">', `<link rel="stylesheet" href="${vendorFonts}">`],
    ['<script src="../vendor/theme.js"></script>', `<script src="${vendorTheme}"></script>`],
    ['<link rel="stylesheet" href="../vendor/motion.css">', `<link rel="stylesheet" href="${vendorMotion}">`],
    ['<script src="../vendor/modal.js"></script>', `<script src="${vendorModal}"></script>`],
    ['<link rel="stylesheet" href="../vendor/window-chrome.css">', `<link rel="stylesheet" href="${vendorWindowChrome}">`],
  ];
  let salida = html;
  for (const [busca, pone] of ASSETS) salida = sustituirTodo(salida, busca, pone);
  return salida;
}

// Lee el factory-seed que YA hay horneado en el archivo actual de un proyecto
// (si existe y se puede parsear). Se usa para no perder valores reales (sobre
// todo serviceStart, ver el comentario grande junto a ensureProjectDashboardFileFresh)
// al refrescar el código de un proyecto ya existente.
function readCurrentFactorySeed(projectId) {
  try {
    const html = fs.readFileSync(projectDashboardFile(projectId), 'utf8');
    const m = html.match(/<script type="application\/json" id="factory-seed">([\s\S]*?)<\/script>/);
    if (m) return JSON.parse(m[1]);
  } catch (e) {
    /* archivo inexistente, ilegible o seed corrupto: se usa el seed de fábrica en su lugar */
  }
  return null;
}

// F1 — el seed va DENTRO de un <script>, y ahí el parser de HTML no entiende
// de comillas JSON: la secuencia `</script` cierra el bloque aunque esté en
// mitad de un string. Un nombre de proyecto importado que la contenga (viene
// de projects:create, que valida la FORMA del .json pero no el contenido de
// los textos) partía el archivo horneado en dos y todo lo que seguía pasaba a
// ser markup del documento, ejecutándose en el ARRANQUE, antes de cualquier
// render. Se escapa `<` como `<`: es un escape JSON válido, así que
// `JSON.parse` devuelve el `<` original —el valor se recupera EXACTO— pero la
// secuencia `</script` no llega a existir literalmente en el archivo.
function serializarSeedParaScript(seed) {
  return JSON.stringify(seed).replace(/</g, '\\u003c');
}

function writeFactorySeedIntoTemplate(projectId, seed) {
  const seedTag = `<script type="application/json" id="factory-seed">${serializarSeedParaScript(seed)}</script>`;
  const html = fixVendorScriptPaths(readStockTemplate()).replace(
    /<script type="application\/json" id="factory-seed">[\s\S]*?<\/script>/,
    // F1 — replacement FUNCTION, no string: como cadena, `$&`, `$'`, '$`' y
    // `$1` son patrones de String.replace, así que un título con `$'` copiaba
    // el resto de la plantilla dentro del seed y `$&` reinyectaba la etiqueta.
    // Eso no lo arregla ningún escape de HTML: hay que quitarle la semántica.
    () => seedTag
  );
  fs.writeFileSync(projectDashboardFile(projectId), html, 'utf8');
}

function regenerateProjectDashboardFile(projectId, projectTitle, serviceStart) {
  const seed = {
    projectTitle,
    serviceStart: serviceStart || null,
    serviceEnd: null,
    skillMatrixRoles: ['Rol 1', 'Rol 2', 'Rol 3'],
    phases: [],
  };
  writeFactorySeedIntoTemplate(projectId, seed);
}

// v0.1.35: reemplaza los dos parches puntuales que había aquí antes
// (ensureDashboardFileVendorPathsFixed para 0.1.x viejas, y
// ensureDashboardReauthBannerHidden específico de 0.1.19) por una
// regeneración COMPLETA, mismo patrón que ya usaba
// ensureDirectorioTalentoProject() para el Directorio de Talento (ver su
// comentario, más arriba en este archivo) — y por el mismo motivo: la
// copia HTML horneada de un proyecto YA EXISTENTE no se regeneraba sola
// con cada nueva versión de la app; solo se actualizaba cuando ese
// proyecto disparaba un backup automático, y aun así la ventana que ya
// estaba abierta en ese momento seguía con el HTML/JS viejo en memoria
// hasta cerrarla y volver a abrirla. Cada parche puntual (vendor paths,
// el aviso de "vincular carpeta") solo tapaba UN síntoma concreto ya
// visto — pero cualquier otra corrección de código de
// dashboard/plantilla_dashboard.html (por ejemplo, 0.1.34: "próximo
// hito" mostrando hitos recurrentes) se quedaba igual de congelada en
// proyectos ya existentes del usuario, aunque funcionara perfectamente
// en un proyecto de prueba recién creado — que es justo lo que reportó
// el usuario ("el hito recurrente sigue apareciendo, no se si sera
// porque es un proyecto ya echo").
//
// Es seguro regenerar sin más: los DATOS reales (hitos, riesgos, equipo,
// etc.) viven en el localStorage de la partición propia de ese
// proyecto, no en este archivo — este archivo es solo código, igual que
// ya se documentó para el Directorio de Talento.
//
// v0.1.37 — BUG REAL ENCONTRADO Y CORREGIDO ("se quedaron los proyectos
// pero al entrar no hay datos", reportado por el usuario): esta función
// reconstruía el "factory-seed" DESDE CERO en cada apertura, pasando
// siempre `serviceStart: null` — porque main.js no tiene forma de saber
// la fecha real de inicio de un proyecto ya creado (esa fecha NUNCA se
// guarda en la base de datos; solo vive dentro del propio state
// guardado en localStorage, que este proceso no puede leer). La clave de
// almacenamiento (STORAGE_KEY, ver plantilla_dashboard.html) se calcula
// con `slug(título)-fecha`, así que machacar la fecha con null en cada
// apertura cambiaba la clave que el dashboard busca al arrancar — y como
// ya no coincidía con la clave real bajo la que se guardó todo la
// primera vez, el proyecto se veía completamente vacío en el panel,
// AUNQUE los datos seguían intactos en el almacenamiento, solo que bajo
// otra clave (confirmado en pruebas: los datos nunca se borraron).
//
// Arreglo: en vez de reconstruir el seed desde cero, se conserva el que
// YA hay horneado en el archivo actual (que si no se ha corrompido antes
// trae la fecha real correcta) y solo se sincroniza `projectTitle` con el
// nombre actual de la base de datos, por si el proyecto se renombró desde
// el lanzador. Como complemento, plantilla_dashboard.html (v0.1.37)
// incluye además un fallback que busca y recupera datos ya huérfanos por
// este mismo bug en proyectos que ya lo sufrieron antes de este arreglo.
function ensureProjectDashboardFileFresh(row) {
  // El Directorio de Talento usa su PROPIA plantilla y su propio mecanismo
  // de rehorneado (ensureDirectorioTalentoProject(), llamado siempre antes
  // de abrir su ventana) — si esta función también lo tocara, lo
  // sobrescribiría con la plantilla del dashboard normal, que no es la
  // suya. Se excluye explícitamente aquí.
  if (row.kind === DIRECTORIO_KIND) return;
  const file = projectDashboardFile(row.id);
  if (!fs.existsSync(file)) return; // proyecto recién creado: 'projects:create' ya lo hornea
  try {
    const currentSeed = readCurrentFactorySeed(row.id);
    const seed = currentSeed
      ? { ...currentSeed, projectTitle: row.name }
      : {
          projectTitle: row.name,
          serviceStart: null,
          serviceEnd: null,
          skillMatrixRoles: ['Rol 1', 'Rol 2', 'Rol 3'],
          phases: [],
        };
    writeFactorySeedIntoTemplate(row.id, seed);
  } catch (e) {
    // B3: pasa una vez por apertura de proyecto, no en bucle -> appLog directo.
    appLog(`Proyecto ${row.id} — no se pudo refrescar su copia HTML al abrirlo: ${motivoSinRutas(e)}`);
    console.warn('No se pudo refrescar la copia HTML del proyecto al abrirlo:', e);
  }
}

function resolveDashboardFileForProject(row) {
  const custom = projectDashboardFile(row.id);
  if (fs.existsSync(custom)) {
    ensureProjectDashboardFileFresh(row);
    return custom;
  }
  return path.join(__dirname, 'dashboard', 'plantilla_dashboard.html');
}

// ------------------------------------------------------------------
// v0.1.43: bug real reportado por el usuario — completó un hito de hoy
// (quedó bien guardado y correcto dentro del propio dashboard), pero la
// tarjeta del lanzador se quedó en naranja incluso después de reiniciar
// la app entera. Investigado y confirmado con datos reales del usuario
// (su dashboard mostraba 0 hitos retrasados y el próximo hito a semanas
// vista — nada que justificara el naranja).
//
// Causa: el guardado que alimenta el semáforo de la tarjeta (la tabla
// `backups`, ver computeProjectSemaforo más abajo) NO es el mismo guardado
// inmediato que hace saveState() al completar un hito (ese solo toca
// localStorage). El backup real lo dispara maybeBackup() en el HTML del
// proyecto — cada 15s, o al recibir 'beforeunload' — llamando a
// window.panoramaBridge.saveBackup(), que es una promesa de IPC que NUNCA
// se esperaba: si el usuario cerraba el proyecto o toda la app justo
// después de un cambio (antes de los 15s), ese guardado final podía
// quedar en el aire sin que nada garantizara que terminara antes de que
// el proceso se cerrara de verdad — más probable aún con la carpeta de
// datos en una unidad de Drive (más lenta que un disco local) o con
// proyectos grandes (payload más pesado de escribir), como es el caso real
// que lo disparó.
//
// Arreglo: intercepta el cierre de CADA ventana de proyecto (incluye
// Directorio de Talento, que reutiliza esta misma función) y lo retiene
// con preventDefault() hasta que el propio HTML confirma por IPC que ya
// terminó de intentar su guardado final — con un tope de tiempo para no
// dejar la ventana bloqueada si algo va mal. Sustituye la antigua
// confianza ciega en que 'beforeunload' + una promesa sin esperar bastaba.
const FLUSH_BEFORE_CLOSE_TIMEOUT_MS = 4000;

function attachFlushOnClose(win, projectId) {
  win.on('close', (e) => {
    if (win.__panoramaFlushed) return; // ya se esperó el guardado — dejar cerrar de verdad
    // A2 (auditoría 2026-09-13): esta ventana no se está cerrando porque el
    // usuario haya terminado, sino porque se va a RESTAURAR un backup encima
    // — su estado actual es justo lo que se ha pedido descartar. Guardarlo
    // aquí lo convertiría en el backup más reciente del proyecto (ver
    // restoreProjectBackup). Se deja cerrar en el acto, sin pedir el guardado
    // final ni esperar los 4 s de su tope.
    //
    // OJO: esto por sí solo NO basta para impedir el backup del estado
    // descartado — el propio dashboard tiene su 'beforeunload' que llama a
    // maybeBackup() cuando la ventana se descarga de verdad. Lo que lo impide
    // de raíz es la guarda de `restoreInProgress` en backup:save. Esto es
    // solo para no esperar por un guardado que se va a rechazar igualmente.
    //
    // Cualquier OTRO cierre (el normal, el de "Salir", el de eliminar un
    // proyecto) sigue exactamente igual que antes: la marca solo la pone
    // restoreProjectBackup.
    if (win.__panoramaClosingForRestore) return;
    e.preventDefault();
    let settled = false;
    const ackChannel = `app:flushed:${win.id}:${Date.now()}`;
    const finish = () => {
      if (settled) return;
      settled = true;
      ipcMain.removeAllListeners(ackChannel);
      win.__panoramaFlushed = true;
      if (!win.isDestroyed()) win.close();
    };
    const timer = setTimeout(() => {
      appLog(
        `Aviso: la ventana del proyecto ${projectId} no confirmó su guardado final a tiempo ` +
          `(>${FLUSH_BEFORE_CLOSE_TIMEOUT_MS}ms) al cerrarse — se cierra igualmente para no bloquear al usuario.`
      );
      finish();
    }, FLUSH_BEFORE_CLOSE_TIMEOUT_MS);
    ipcMain.once(ackChannel, () => {
      clearTimeout(timer);
      finish();
    });
    try {
      win.webContents.send('app:flushBeforeClose', ackChannel);
    } catch (e2) {
      clearTimeout(timer);
      finish();
    }
  });
}

function openProjectWindow(row) {
  // A3.3/BLOQUE 5 — punto 3 de D1: mientras se está retirando el proyecto, su
  // ventana no puede reabrirse. Si pudiera, escribiría dentro de la carpeta que
  // acabamos de mover a cuarentena y recrearía el destino, que es justo lo que
  // luego hace imposible el rollback.
  // A2: durante una RESTAURACIÓN tampoco puede reabrirse: escribiría en la
  // partición que se está reemplazando. La reapertura legítima la hace la
  // propia restauración al terminar, cuando ya ha desarmado la barrera.
  {
    const b = proyectoBloqueadoParaMutar(row.id);
    if (b) {
      appLog(`Se ha intentado abrir el proyecto ${row.id} mientras está ${b.motivo}; no se abre.`);
      return null;
    }
  }
  if (projectWindows.has(row.id)) {
    const w = projectWindows.get(row.id);
    if (!w.isDestroyed()) {
      // v0.1.29: si la ventana ya existe pero está MINIMIZADA, w.focus()
      // solo no basta — en la práctica no la restaura a la vista (motivo
      // exacto del reporte del usuario: "si esta minimizado ... al dar a
      // abrir no hace nada"). Hay que sacarla del estado minimizado
      // primero con restore() y DESPUÉS pedirle el foco. Si no está
      // minimizada, restore() no hace nada raro (es un no-op seguro).
      if (w.isMinimized()) w.restore();
      w.focus();
      return w;
    }
  }
  // v2.0.26: recordar tamaño/posición entre sesiones -- un solo rol
  // 'project' compartido por todas las ventanas de proyecto Y el
  // Directorio de Talento (misma plantilla dashboard/directorio, ver
  // comentario de más arriba) en vez de una entrada por proyecto: lo
  // normal es querer el mismo tamaño de ventana siempre, no uno distinto
  // por proyecto.
  const projectBounds = restoreWindowBounds('project', { width: 1400, height: 880 });
  // v2.0.38: bounds iniciales = área de trabajo real del monitor de destino,
  // no projectBounds.width/height -- ver workAreaForMaximizedWindow() más
  // arriba (por qué: elimina el parpadeo de contenido "reducido que se
  // reajusta" al abrir un proyecto o el Directorio de Talento).
  // projectBounds se sigue calculando (arriba) porque workArea lo usa para
  // decidir EN QUÉ MONITOR maximizar cuando hay más de uno conectado.
  const projectWorkArea = workAreaForMaximizedWindow(projectBounds);
  const win = new BrowserWindow({
    x: projectWorkArea.x,
    y: projectWorkArea.y,
    width: projectWorkArea.width,
    height: projectWorkArea.height,
    // v2.0.26: mínimo para que la barra de título propia y el menú
    // Archivo/Editar/Proyecto/Seguridad no se rompan, y para que las
    // tablas (Partes mensuales, Equipo...) sigan teniendo sitio real.
    minWidth: 900,
    minHeight: 600,
    title: `Panorama del Servicio — ${row.name}`,
    icon: APP_ICON_PATH,
    // v2.0.16 — mismo tratamiento que el lanzador desde 2.0.14/15 (ver la
    // nota larga junto a `frame: false` en createLauncherWindow): sin marco
    // nativo, barra y menú Archivo/Editar/Proyecto/[Partes mensuales]/
    // Seguridad reconstruidos dentro de dashboard/plantilla_dashboard.html y
    // directorio/plantilla_directorio.html (esta ventana sirve a las dos).
    frame: false,
    // v2.0.17 — reportado por el usuario: al perder el marco nativo en
    // 2.0.16, la ventana entera (ya no solo el contenido) se ve en blanco
    // unas décimas de segundo antes de pintar el dashboard. `show:false` +
    // mostrarla en 'ready-to-show' evita que llegue a pintarse en blanco;
    // `backgroundColor` es la red de seguridad para el instante entre la
    // creación de la ventana y ese evento (ver misma nota en las otras 5
    // ventanas convertidas a frame:false en 2.0.16).
    show: false,
    backgroundColor: '#0a0e13',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      partition: row.partition_name,
      additionalArguments: [
        `--panorama-project-id=${row.id}`,
        `--panorama-project-name=${encodeURIComponent(row.name)}`,
      ],
    },
  });
  // v2.0.32: pedido explícito del usuario — las ventanas de proyecto se
  // abren siempre maximizadas.
  // v2.0.38: como ahora la ventana se CONSTRUYE ya al tamaño del área de
  // trabajo (arriba) en vez de al tamaño pequeño recordado, Windows ya no
  // tiene un tamaño/posición "normal" previo que recordar por su cuenta
  // para cuando el usuario restaure a mano (doble clic en la barra) -- sin
  // esto, restaurar dejaría la ventana exactamente igual de grande (no se
  // notaría). Se restaura a mano al tamaño recordado entre sesiones
  // (projectBounds/normalRect), el mismo que se seguirá guardando al
  // cerrar (persistWindowBoundsOnClose, más abajo).
  const projectNormalRect = normalRectFor(projectBounds, projectWorkArea);
  win.maximize();
  win.on('unmaximize', () => { if (!win.isDestroyed()) win.setBounds(projectNormalRect); });
  aplicarPoliticaDeNavegacion(win.webContents, 'proyecto'); // F3
  win.loadFile(resolveDashboardFileForProject(row));
  // v2.0.42: bug real encontrado probando en Windows real -- el icono de
  // maximizar/restaurar de la barra de título propia salía mostrando
  // "Maximizar" justo al abrir un proyecto, pese a que la ventana YA estaba
  // maximizada (se autocorregía en cuanto se tocaba el botón una vez). La
  // ventana se construye oculta (show:false) y win.maximize() se llama
  // ANTES de mostrarla (más arriba) -- el estado de maximizado de Windows
  // no queda garantizado como asentado hasta que la ventana se muestra de
  // verdad, así que la consulta inicial que hace el renderer nada más
  // cargar (winControls.isMaximized(), en dashboard/directorio/etc.) puede
  // leer un valor todavía no asentado. Al reenviar el estado real justo
  // después de show() -- momento en el que Windows ya ha terminado de
  // aplicarlo -- el listener onMaximizedChanged() que cada plantilla ya
  // tiene registrado corrige el icono con el valor bueno, sin depender de
  // en qué momento exacto se resolvió esa consulta inicial.
  win.once('ready-to-show', () => {
    if (win.isDestroyed()) return;
    win.show();
    win.webContents.send('win:maximizedChanged', win.isMaximized());
  });
  win.on('maximize', () => { if (!win.isDestroyed()) win.webContents.send('win:maximizedChanged', true); });
  win.on('unmaximize', () => { if (!win.isDestroyed()) win.webContents.send('win:maximizedChanged', false); });
  // A2: se comprueba la IDENTIDAD, no solo el id. Durante una restauración
  // llegó a haber una ventana vieja todavía cerrándose (hasta 4 s con el
  // guardado final) mientras openProjectWindow ya había registrado la nueva
  // bajo el mismo id -- al terminar de cerrarse, la vieja borraba del mapa la
  // entrada de la NUEVA. Efecto: "Abrir" en el lanzador creaba una segunda
  // ventana del mismo proyecto, y deleteProjectById ya no la encontraba para
  // cerrarla antes de borrar sus archivos.
  win.on('closed', () => {
    if (projectWindows.get(row.id) === win) projectWindows.delete(row.id);
  });
  attachFlushOnClose(win, row.id);
  persistWindowBoundsOnClose(win, 'project');
  projectWindows.set(row.id, win);
  dbmod.run('UPDATE projects SET updated_at=? WHERE id=?', [new Date().toISOString(), row.id]);
  return win;
}

// ------------------------------------------------------------------
// "Preparación de Reunión": ventana propia por proyecto, NO es un "proyecto
// especial" como el Directorio de Talento (no reutiliza partición/backups
// propios — no necesita persistencia propia en absoluto, igual que la
// herramienta standalone original no la tenía). Se carga directamente desde
// la carpeta de la app (no se hornea copia por proyecto en userData), así
// que las rutas relativas a ../vendor/ funcionan solas sin reescritura.
// El proyecto sobre el que trabaja se le pasa igual que a las ventanas de
// proyecto normales (--panorama-project-id), y la propia plantilla pide sus
// datos vía IPC (window.panoramaBridge.getMeetingPrepData()) en vez de
// pedir al usuario que suba un JSON a mano.
// ------------------------------------------------------------------
function openMeetingPrepWindow(row) {
  if (meetingPrepWindows.has(row.id)) {
    const w = meetingPrepWindows.get(row.id);
    if (!w.isDestroyed()) {
      w.focus();
      return w;
    }
  }
  // v2.0.26: recordar tamaño/posición entre sesiones (ver
  // restoreWindowBounds arriba).
  const meetingPrepBounds = restoreWindowBounds('meeting-prep', { width: 860, height: 900 });
  const win = new BrowserWindow({
    ...meetingPrepBounds,
    minWidth: 640,
    minHeight: 500,
    title: `Preparación de Reunión — ${row.name}`,
    icon: APP_ICON_PATH,
    // v2.0.16 — mismo tratamiento que el lanzador (ver createLauncherWindow):
    // sin marco nativo, barra propia SIN fila de menú (esta ventana nunca
    // tuvo menú — setMenu(null) de siempre).
    frame: false,
    // v2.0.17 — ver la nota junto a este mismo bloque en openProjectWindow:
    // evita el parpadeo en blanco al abrir, mostrando la ventana solo
    // cuando ya tiene algo pintado.
    show: false,
    backgroundColor: '#0a0e13',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [
        `--panorama-project-id=${row.id}`,
        `--panorama-project-name=${encodeURIComponent(row.name)}`,
      ],
    },
  });
  aplicarPoliticaDeNavegacion(win.webContents, 'preparacion'); // F3
  win.loadFile(path.join(__dirname, 'preparacion-reunion', 'plantilla_preparacion_reunion.html'));
  win.once('ready-to-show', () => { if (!win.isDestroyed()) win.show(); });
  win.on('maximize', () => { if (!win.isDestroyed()) win.webContents.send('win:maximizedChanged', true); });
  win.on('unmaximize', () => { if (!win.isDestroyed()) win.webContents.send('win:maximizedChanged', false); });
  // P2 (pendientes-abiertos): se comprueba la IDENTIDAD, no solo el id. Un
  // `delete(id)` ciego deja que una ventana vieja, todavía cerrándose, borre
  // del mapa la entrada de la NUEVA — y entonces el quiesce de un restore o de
  // un borrado ya no la encuentra para cerrarla. Mismo criterio que
  // `projectWindows` desde A2.
  win.on('closed', () => {
    if (meetingPrepWindows.get(row.id) === win) meetingPrepWindows.delete(row.id);
  });
  persistWindowBoundsOnClose(win, 'meeting-prep');
  meetingPrepWindows.set(row.id, win);
  return win;
}

// ------------------------------------------------------------------
// "Evaluación de Candidatos" (v0.1.73): mismo patrón exacto que
// openMeetingPrepWindow de arriba — ventana suelta (sin partición propia,
// sin menú), reutiliza preload.js con --panorama-project-id/-name, y la
// propia plantilla pide sus datos vía IPC (candidateEval:get) en vez de
// que el usuario suba nada a mano.
// ------------------------------------------------------------------
// v0.1.77: `opts.focusEvaluaciones` — usado por el atajo "N entrevista(s)
// pendiente(s)" de la tarjeta del launcher (ver candidateEval:openWindow
// más abajo) para llevar directamente a la pestaña "Evaluaciones" en vez de
// la de "Puestos" por defecto. Si la ventana ya estaba abierta, se le manda
// un IPC para cambiar de pestaña en caliente (mismo patrón que
// onShowPartesMensuales en Directorio de Talento); si se crea nueva, la
// pestaña inicial se le pasa por argv y la lee la propia plantilla al
// arrancar. El acceso normal por menú ("Proyecto > Evaluación de
// Candidatos...") sigue sin pasar esto, así que no cambia su comportamiento.
function openCandidateEvalWindow(row, opts) {
  const focusEvaluaciones = !!(opts && opts.focusEvaluaciones);
  if (candidateEvalWindows.has(row.id)) {
    const w = candidateEvalWindows.get(row.id);
    if (!w.isDestroyed()) {
      w.focus();
      if (focusEvaluaciones) w.webContents.send('candidateEval:focusEvaluaciones');
      return w;
    }
  }
  // v2.0.26: recordar tamaño/posición entre sesiones (ver
  // restoreWindowBounds arriba).
  const candidateEvalBounds = restoreWindowBounds('candidate-eval', { width: 1100, height: 850 });
  const win = new BrowserWindow({
    ...candidateEvalBounds,
    minWidth: 760,
    minHeight: 560,
    title: `Evaluación de Candidatos — ${row.name}`,
    icon: APP_ICON_PATH,
    // v2.0.16 — mismo tratamiento que el lanzador: sin marco nativo, barra
    // propia sin fila de menú (esta ventana nunca tuvo menú).
    frame: false,
    // v2.0.17 — ver la nota junto a este mismo bloque en openProjectWindow.
    // v2.0.44: esta ventana vuelve a seguir el tema visual global (antes
    // tenía paleta clara fija propia, de ahí el #F1F5F9 de siempre aquí) --
    // se iguala al mismo fondo oscuro de reserva que ya usan
    // dashboard/directorio, para no arrancar con un parpadeo claro seguido
    // de un salto al tema oscuro si Medianoche es el tema activo guardado.
    show: false,
    backgroundColor: '#0a0e13',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [
        `--panorama-project-id=${row.id}`,
        `--panorama-project-name=${encodeURIComponent(row.name)}`,
        ...(focusEvaluaciones ? ['--panorama-initial-tab=evaluaciones'] : []),
      ],
    },
  });
  aplicarPoliticaDeNavegacion(win.webContents, 'evaluacion'); // F3
  win.loadFile(path.join(__dirname, 'evaluacion-candidatos', 'plantilla_evaluacion_candidatos.html'));
  win.once('ready-to-show', () => { if (!win.isDestroyed()) win.show(); });
  win.on('maximize', () => { if (!win.isDestroyed()) win.webContents.send('win:maximizedChanged', true); });
  win.on('unmaximize', () => { if (!win.isDestroyed()) win.webContents.send('win:maximizedChanged', false); });
  // P2: identidad, igual que en projectWindows y meetingPrepWindows.
  win.on('closed', () => {
    if (candidateEvalWindows.get(row.id) === win) candidateEvalWindows.delete(row.id);
  });
  persistWindowBoundsOnClose(win, 'candidate-eval');
  candidateEvalWindows.set(row.id, win);
  return win;
}

// ------------------------------------------------------------------
// Restaura el último backup (o uno concreto) de un proyecto: cierra su
// ventana si está abierta, rellena localStorage de su partición a través de
// restore-helper.html (ver comentario junto a ese archivo) y la reabre.
// Compartido entre el IPC del launcher y el menú "Proyecto > Restaurar...".
// ------------------------------------------------------------------
// Lee el contenido de un backup, sea cual sea su forma de almacenamiento:
// - Filas nuevas (file_path relleno): el JSON (o el sobre cifrado) vive en
//   un archivo en la carpeta de backups del proyecto; se descifra aquí si
//   hace falta.
// - Filas antiguas, de antes de este cambio (file_path vacío): el JSON
//   sigue guardado tal cual en la propia columna `payload`.
// A2 bajo A3.3: `puro:true` resuelve la carpeta SIN `ensureProjectBackupDirSlug`
// (que con `backup_dir = NULL` hace un UPDATE y por tanto un commit) y SIN el
// `mkdirSync` incidental. Durante la preparación de una restauración no puede
// haber ningún efecto colateral: la base se captura después del quiesce y no
// puede moverse por leer un backup.
function readBackupPayload(row, bkRow, opciones) {
  const puro = !!(opciones && opciones.puro);
  if (bkRow.file_path) {
    const dir = puro ? rutaBackupsPura(row) : backupsDirForProject(row);
    const raw = fs.readFileSync(path.join(dir, bkRow.file_path), 'utf8');
    if (bkRow.encrypted) {
      if (!securityKey) {
        throw new Error(
          'Este backup está cifrado y la seguridad está bloqueada. Desbloquéala (se pide la contraseña al abrir la app, o usa el menú Seguridad) antes de restaurar.'
        );
      }
      return securitymod.decryptString(securityKey, raw);
    }
    return raw;
  }
  return bkRow.payload;
}

// v2.0.40: ventana oculta + restore-helper.html + volcado de localStorage --
// antes esta secuencia estaba casi entera duplicada entre restoreProjectBackup
// y seedNewProjectStorage (auditoría 2026-09-12, sección 3). Unificada aquí:
// ambas funciones solo difieren en qué `dump` escriben y en si hace falta
// vaciar localStorage antes (restaurar un backup SÍ, sembrar un proyecto
// recién creado NO -- su partición todavía no tiene nada).
function writeLocalStorageDumpToPartition(partitionName, dump, { clearFirst } = {}) {
  return new Promise((resolve, reject) => {
    const helperWin = new BrowserWindow({
      show: false,
      webPreferences: { partition: partitionName },
    });
    aplicarPoliticaDeNavegacion(helperWin.webContents, 'volcado-localstorage'); // F3
    helperWin
      .loadFile(path.join(__dirname, 'dashboard', 'restore-helper.html'))
      .then(async () => {
        const script = `
          (function(){
            try{
              ${clearFirst ? 'localStorage.clear();' : ''}
              const dump = ${JSON.stringify(dump)};
              Object.keys(dump).forEach(function(k){ localStorage.setItem(k, dump[k]); });
              return { ok:true, count: Object.keys(dump).length };
            }catch(e){
              return { ok:false, message: String((e && e.message) || e) };
            }
          })();
        `;
        try {
          const result = await helperWin.webContents.executeJavaScript(script);
          helperWin.close();
          if (!result || !result.ok) {
            reject(new Error('No se pudo escribir en localStorage: ' + (result && result.message)));
            return;
          }
          resolve(result);
        } catch (e) {
          helperWin.close();
          reject(e);
        }
      })
      .catch(reject);
  });
}

// A2: abre una ventana oculta sobre una partición, ejecuta un script en ella
// y devuelve su resultado. Es el mismo ciclo de vida que ya usaba
// writeLocalStorageDumpToPartition (que se deja intacta a propósito, para no
// tocar el camino de "Nuevo proyecto" que la comparte vía
// seedNewProjectStorage), extraído aparte para poder LEER el almacenamiento
// además de escribirlo.
function runInPartition(partitionName, script) {
  return new Promise((resolve, reject) => {
    const helperWin = new BrowserWindow({
      show: false,
      webPreferences: { partition: partitionName },
    });
    const cerrar = () => {
      try {
        if (!helperWin.isDestroyed()) helperWin.close();
      } catch (e) {
        /* no crítico */
      }
    };
    aplicarPoliticaDeNavegacion(helperWin.webContents, 'particion-auxiliar'); // F3
    helperWin
      .loadFile(path.join(__dirname, 'dashboard', 'restore-helper.html'))
      .then(async () => {
        try {
          const result = await helperWin.webContents.executeJavaScript(script);
          cerrar();
          resolve(result);
        } catch (e) {
          cerrar();
          reject(e);
        }
      })
      .catch((e) => {
        cerrar();
        reject(e);
      });
  });
}

// A2: foto COMPLETA del localStorage de una partición, tal y como está ahora.
// Es la red de seguridad de la restauración: se toma ANTES del clear() para
// poder devolver la partición exactamente a su estado anterior si la escritura
// del backup falla a media faena.
function readLocalStorageDumpFromPartition(partitionName) {
  return runInPartition(
    partitionName,
    `
      (function(){
        try{
          var previo = {};
          for (var i = 0; i < localStorage.length; i++) {
            var k = localStorage.key(i);
            previo[k] = localStorage.getItem(k);
          }
          return { ok:true, dump: previo, count: Object.keys(previo).length };
        }catch(e){
          return { ok:false, message: String((e && e.message) || e) };
        }
      })();
    `
  ).then((r) => {
    if (!r || !r.ok) {
      throw new Error('No se pudo leer el estado actual del proyecto: ' + ((r && r.message) || 'motivo desconocido'));
    }
    return r.dump;
  });
}

// A2: deja en disco, junto a los backups del proyecto, la foto del estado
// anterior que no se ha podido reponer. Se cifra si la Seguridad está activa —
// es contenido real del usuario, no puede quedar en claro solo por ser una
// copia de rescate. Devuelve la ruta escrita, o null si ni eso se pudo.
function saveRescueDump(row, previo) {
  try {
    // A2 bajo A3.3: ruta PURA. Este camino se toma cuando ya todo ha ido mal;
    // lo último que puede hacer es disparar un commit por su cuenta.
    const dir = rutaBackupsPura(row);
    fs.mkdirSync(dir, { recursive: true });
    const nombre = `rescate-restauracion-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const contenido = encryptIfNeeded(JSON.stringify(previo), !!securityKey);
    fs.writeFileSync(path.join(dir, nombre), contenido, 'utf8');
    return path.join(dir, nombre);
  } catch (e) {
    appLog('Restauración — no se pudo ni escribir la copia de rescate: ' + String((e && e.message) || e));
    return null;
  }
}

// ------------------------------------------------------------------
// A2 (auditoría 2026-09-13) — restauración TODO O NADA.
//
// Qué hacía mal la versión anterior:
//  1. `w.close()` disparaba attachFlushOnClose, que pedía al dashboard su
//     guardado final con force:true — o sea, escribía como backup nuevo (y por
//     tanto el MÁS RECIENTE) justo el estado que se estaba descartando.
//     Restaurar dos veces seguidas devolvía lo que querías tirar.
//  2. No esperaba a que la ventana se cerrara: hasta 3 renderers podían
//     coexistir sobre la misma partición (la moribunda, la auxiliar y la
//     nueva), con un resultado que dependía del reparto de tiempos.
//  3. Si la escritura fallaba, la ventana ya estaba cerrada y nada la reabría,
//     con el localStorage posiblemente a medias.
//
// Ahora: se bloquea cualquier guardado del proyecto mientras dura, se espera
// de verdad al cierre, se toma una foto del estado anterior antes de tocar
// nada, y si la escritura falla se repone esa foto. Si la reposición TAMBIÉN
// falla no se reintenta nada: se guarda la foto en disco, se registra y se
// avisa con el código PS-2005.
// ------------------------------------------------------------------
const RESTORE_CLOSE_TIMEOUT_MS = 8000;
// A2 bajo A3.3: `restoreInProgress` se conserva como ALIAS del conjunto real
// (`proyectosEnRestauracion`) para no romper los sitios que ya lo consultaban.
// La barrera de verdad es `proyectoBloqueadoParaMutar()`.
const restoreInProgress = proyectosEnRestauracion;

// ===========================================================================
// A2 bajo A3.3 — RESTAURACIÓN CON JOURNAL, FOTO PREVIA DURABLE Y RECUPERACIÓN
//
//   R-2 armar barrera  -> R-1 F-1 GLOBAL + guardas -> R0 quiesce ->
//   R1 capturar (base DESPUÉS del quiesce, rutas puras) ->
//   R2 previo.enc durable -> R3 journal durable -> R4 aplicar ->
//   R5 commit marca + exigirCommitBase -> R6 cleanup -> R7 liberar barrera
//
// La barrera puede vivir en RAM antes de R3 porque hasta ahí no se ha aplicado
// nada destructivo. A partir de que existen previo.enc o journal, la
// recuperación decide SOLO con disco + journal + BD.
// ===========================================================================
const RESTAURACIONES_DIR_NAME = '.panorama-restauraciones';
const RESTAURACIONES_JOURNAL_V = 1;
const PREVIO_V = 1;
const RESTAURACION_FASES = new Set(['aplicando', 'limpiando']);

function restauracionesDir() { return path.join(app.getPath('userData'), RESTAURACIONES_DIR_NAME); }
function dirDeRestauracion(actionId) { return path.join(restauracionesDir(), actionId); }
function journalRestauracionPath(actionId) { return path.join(dirDeRestauracion(actionId), 'journal.json'); }
function previoPath(actionId) { return path.join(dirDeRestauracion(actionId), 'previo.enc'); }

// Canónico: claves ordenadas. Dos volcados con las mismas parejas dan el mismo
// hash aunque el orden de inserción difiera — y el de `localStorage` no está
// garantizado.
function hashDumpLocalStorage(dump) {
  const claves = Object.keys(dump || {}).sort();
  const h = crypto.createHash('sha256');
  for (const k of claves) { h.update(k); h.update(' '); h.update(String(dump[k])); h.update(''); }
  return h.digest('hex');
}

// --- journal de restauración: VALIDACIÓN CERRADA ---------------------------
function leerJournalRestauracion(ruta) {
  let j = null;
  try {
    j = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch (e) {
    return { clase: 'ilegible', ruta, motivo: String((e && e.message) || e) };
  }
  if (!j || typeof j !== 'object' || Array.isArray(j)) {
    return { clase: 'desconocido', ruta, motivo: 'el journal no es un objeto' };
  }
  if (j.v !== RESTAURACIONES_JOURNAL_V) {
    return { clase: 'desconocido', ruta, motivo: `versión ${JSON.stringify(j.v)}` };
  }
  const falta = [];
  const textoNoVacio = (s) => typeof s === 'string' && s.length > 0;
  if (!esHex(j.action_id, 32)) falta.push('action_id no son 32 hex');
  if (!esHex(j.writer, 32)) falta.push('writer no tiene formato de installation-id');
  if (!(typeof j.project_id === 'number' && Number.isInteger(j.project_id) && j.project_id > 0)) falta.push('project_id no es un entero > 0');
  if (!textoNoVacio(j.partition)) falta.push('partition vacía');
  if (!esHex(j.base_commit_id, 32)) falta.push('base_commit_id no es un commit válido');
  if (!RESTAURACION_FASES.has(j.fase)) falta.push(`fase inesperada (${JSON.stringify(j.fase)})`);
  if (j.cifrado !== 0 && j.cifrado !== 1) falta.push('cifrado no es 0 ni 1');
  if (!textoNoVacio(j.startedAt)) falta.push('startedAt vacío');
  if (j.backup_id !== null && !(typeof j.backup_id === 'number' && Number.isInteger(j.backup_id))) falta.push('backup_id no es entero ni null');
  if (j.backup_sha256 !== null && !esHex(j.backup_sha256, 64)) falta.push('backup_sha256 inválido');
  if (!esHex(j.esperado_hash, 64)) falta.push('esperado_hash no es un SHA-256');
  if (!esHex(j.previo_hash, 64)) falta.push('previo_hash no es un SHA-256');
  if (!esHex(j.previo_sha256, 64)) falta.push('previo_sha256 no es un SHA-256');
  if (!esEnteroNoNegativo(j.previo_size)) falta.push('previo_size no es un entero >= 0');
  if (!esEnteroNoNegativo(j.previo_n_claves)) falta.push('previo_n_claves no es un entero >= 0');
  if (falta.length) {
    return {
      clase: 'incompleto', ruta, motivo: falta.join('; '),
      writerDeclarado: esHex(j.writer, 32) ? j.writer : null,
    };
  }
  return { clase: 'valido', ruta, j };
}

// ENOENT es lo único que demuestra "no hay restauraciones pendientes".
function journalsDeRestauraciones() {
  let nombres = [];
  try {
    nombres = fs.readdirSync(restauracionesDir(), { withFileTypes: true })
      .filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (e) {
    const cod = (e && e.code) || '';
    if (cod === 'ENOENT') return { ok: true, entradas: [] };
    return { ok: false, noVerificable: true, codigo: cod, motivo: String((e && e.message) || e) };
  }
  const entradas = [];
  for (const n of nombres) {
    if (!existeRuta(journalRestauracionPath(n))) {
      // Carpeta con material pero SIN journal: es el residuo de un cleanup a
      // medias. No es "nada", y no se borra a ciegas.
      entradas.push({ clase: 'sin-journal', ruta: dirDeRestauracion(n), actionId: n, motivo: 'carpeta de restauración sin journal.json' });
      continue;
    }
    entradas.push(leerJournalRestauracion(journalRestauracionPath(n)));
  }
  return { ok: true, entradas };
}

// --- material residual: precondición del rekey (A2 §4.7) -------------------
// "Restauración pendiente" no es solo "hay un journal": también cuenta una
// carpeta con previo.enc que sobrevivió a un cleanup fallido. Ese archivo está
// cifrado con la clave ACTUAL y NO está en `collectRekeyInventory` (no tiene
// fila), así que un rekey posterior lo dejaría ilegible para siempre.
function materialDeRestauracionPendiente() {
  let nombres = [];
  try {
    nombres = fs.readdirSync(restauracionesDir(), { withFileTypes: true })
      .filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (e) {
    const cod = (e && e.code) || '';
    if (cod === 'ENOENT') return { ok: true, pendientes: [] };
    return { ok: false, noVerificable: true, motivo: String((e && e.message) || e) };
  }
  const pendientes = [];
  for (const n of nombres) {
    let contenido = [];
    try { contenido = fs.readdirSync(dirDeRestauracion(n)); } catch (e) {
      pendientes.push({ actionId: n, motivo: 'carpeta ilegible: ' + ((e && e.code) || String(e)) });
      continue;
    }
    if (contenido.length > 0) pendientes.push({ actionId: n, archivos: contenido });
  }
  return { ok: true, pendientes };
}

// La precondición que se le pone al rekey. NO amplía collectRekeyInventory:
// es una exclusión, igual que F-1 GLOBAL.
function rekeyPuedeEmpezar() {
  const m = materialDeRestauracionPendiente();
  if (!m.ok) {
    return { puede: false, clase: 'no-verificable', motivo: `no se puede comprobar ${RESTAURACIONES_DIR_NAME}: ${m.motivo}` };
  }
  if (m.pendientes.length) {
    return {
      puede: false, clase: 'material-pendiente', pendientes: m.pendientes,
      motivo: `hay ${m.pendientes.length} restauración(es) con material sin limpiar`,
    };
  }
  return { puede: true };
}

// --- restauraciones dentro del dominio de ocupación común ------------------
function recursosReservadosPorRestauraciones() {
  const r = journalsDeRestauraciones();
  if (!r.ok) return { ok: false, indeterminado: true, motivo: r.motivo };
  const recursos = [];
  for (const e of r.entradas) {
    if (e.clase !== 'valido') return { ok: false, indeterminado: true, motivo: e.motivo, ruta: e.ruta };
    recursos.push({
      fuente: 'restauracion', writer: e.j.writer, actionId: e.j.action_id,
      scope: 'subtree', origen: e.j.backups_dir,
    });
  }
  return { ok: true, recursos };
}

// F-1 GLOBAL de las restauraciones. Se suma a `f1Global()` del Bloque 5.
function f1Restauraciones() {
  const r = journalsDeRestauraciones();
  if (!r.ok) {
    return { libre: false, clase: 'no-verificable', motivo: `no se puede comprobar ${RESTAURACIONES_DIR_NAME}: ${r.motivo}` };
  }
  const yo = dbmod.getInstallationId();
  const pendientes = [];
  for (const e of r.entradas) {
    if (e.clase === 'valido') {
      if (e.j.writer === yo) pendientes.push({ tipo: 'restauracion', actionId: e.j.action_id, projectId: e.j.project_id });
      continue;
    }
    return {
      libre: false, clase: 'no-demostrable', ruta: e.ruta,
      motivo: `material de restauración ${e.clase}` +
        (e.writerDeclarado === yo ? ' (propio)' : ' (writer no identificable)') +
        (e.motivo ? ': ' + e.motivo : ''),
    };
  }
  if (pendientes.length) {
    return { libre: false, clase: 'pendiente', pendientes, motivo: `hay ${pendientes.length} restauración(es) propia(s) sin resolver` };
  }
  return { libre: true };
}

// --- H-1: la mitad DURABLE de la barrera de restauración, por proyecto ------
//
// `proyectosEnRestauracion` vive en memoria y solo sabe de esta sesión. Este es
// el otro lado: el journal de `.panorama-restauraciones`, que sobrevive al
// reinicio. `proyectoBloqueadoParaMutar()` pregunta por los dos.
//
// CRITERIO, con el journal como única evidencia:
//
//   fase 'aplicando' -> NO RESUELTO. Ni se confirmó ni se repuso de forma
//                       demostrable. Bloquea ese proyecto.
//   fase 'limpiando' -> YA RESUELTO. `limpiarMaterialRestauracion()` escribe
//                       esa marca únicamente DESPUÉS de confirmar (R6) o
//                       DESPUÉS de una reposición demostrada (relectura +
//                       volcado). Lo que queda es material por borrar, que le
//                       importa al rekey (`rekeyPuedeEmpezar`), no a las
//                       mutaciones. No bloquea.
//
// Lo que NO se puede interpretar bloquea SIEMPRE, sea cual sea el proyecto por
// el que se pregunte: si el journal no se puede leer, no se sabe de quién es, y
// evidencia incompleta no es estado ausente. Esa es la única parte que alcanza
// a proyectos ajenos; un journal válido y atribuible bloquea SOLO a su
// proyecto, porque una restauración pendiente del proyecto 7 no es motivo para
// impedir que se guarde en el 3.
//
// NO se auto-bloquea la recuperación: `recuperarRestauracionesPendientes()` y
// todo lo que cuelga de ella —reponer la partición, limpiar el material—
// trabajan directamente y no pasan por esta puerta. Lo que se bloquea son
// operaciones NUEVAS.
//
// Cualquier excepción se trata como "no verificable", no como "libre": esta
// función se llama desde sitios que hoy no esperan que lance.
function restauracionPendienteDeProyecto(projectId) {
  const noVerificable = (detalle) => ({
    motivo: 'restauracion-no-verificable', clase: 'no-verificable', detalle,
    mensaje: 'No se ha podido comprobar si hay una restauracion de este equipo sin terminar. ' +
      'No se ha guardado nada.',
  });
  try {
    const r = journalsDeRestauraciones();
    if (!r.ok) return noVerificable(r.motivo);
    const pid = Number(projectId);
    const yo = dbmod.getInstallationId();
    for (const e of r.entradas) {
      if (e.clase !== 'valido') {
        return Object.assign(noVerificable(`material de restauración ${e.clase}: ${e.motivo}`), { ruta: e.ruta });
      }
      if (e.j.writer !== yo) continue;
      if (Number(e.j.project_id) !== pid) continue;
      if (e.j.fase === 'limpiando') continue;
      return {
        motivo: 'restauracion-sin-resolver', clase: 'pendiente', actionId: e.j.action_id,
        mensaje: RESTAURACION_SIN_RESOLVER_MSG,
      };
    }
    return null;
  } catch (e) {
    return noVerificable(String((e && e.message) || e));
  }
}

// --- foto previa -----------------------------------------------------------
function escribirPrevioDurable(actionId, j, dump) {
  const plano = JSON.stringify({
    v: PREVIO_V,
    project_id: j.project_id, partition: j.partition,
    action_id: j.action_id, writer: j.writer,
    base_commit_id: j.base_commit_id,
    tomadaEn: new Date().toISOString(),
    claves: dump,
    n_claves: Object.keys(dump || {}).length,
    bytes: Buffer.byteLength(JSON.stringify(dump || {}), 'utf8'),
  });
  // Se cifra UNA vez, con la clave vigente, y no se deja ninguna copia en
  // claro: `escribirBufferDurable` escribe el tmp ya cifrado.
  const cifrado = securityKey ? 1 : 0;
  const contenido = cifrado ? securitymod.encryptString(securityKey, plano) : plano;
  fs.mkdirSync(dirDeRestauracion(actionId), { recursive: true });
  const g = escribirBufferDurable(previoPath(actionId), Buffer.from(contenido, 'utf8'));
  if (!g.ok) throw new Error('no se pudo escribir la copia del estado actual: ' + g.motivo);
  const h = sha256DeArchivo(previoPath(actionId));
  if (!h.existe || h.ilegible) throw new Error('la copia del estado actual no se pudo releer');
  return { cifrado, sha256: h.sha, size: h.size, n_claves: Object.keys(dump || {}).length };
}

// Devuelve { ok, dump } o { ok:false, motivo }. NUNCA devuelve un dump que no
// se pueda demostrar: reponer desde una foto no demostrable es peor que no
// reponer.
function leerPrevioDemostrable(j) {
  const p = previoPath(j.action_id);
  const h = sha256DeArchivo(p);
  if (!h.existe) return { ok: false, motivo: 'la copia del estado anterior no está' };
  if (h.ilegible) return { ok: false, motivo: 'la copia del estado anterior no se puede leer' };
  if (h.sha !== j.previo_sha256 || h.size !== j.previo_size) {
    return { ok: false, motivo: 'la copia del estado anterior no casa con su registro' };
  }
  let texto;
  try { texto = fs.readFileSync(p, 'utf8'); } catch (e) { return { ok: false, motivo: String((e && e.message) || e) }; }
  if (j.cifrado === 1) {
    if (!securityKey) return { ok: false, motivo: 'la copia está cifrada y la seguridad está bloqueada' };
    try { texto = securitymod.decryptString(securityKey, texto); } catch (e) {
      return { ok: false, motivo: 'no se pudo descifrar la copia: ' + String((e && e.message) || e) };
    }
  }
  let sobre;
  try { sobre = JSON.parse(texto); } catch (e) { return { ok: false, motivo: 'la copia no es JSON válido' }; }
  if (!sobre || sobre.v !== PREVIO_V) return { ok: false, motivo: 'versión de copia desconocida' };
  if (sobre.action_id !== j.action_id || Number(sobre.project_id) !== Number(j.project_id) || sobre.partition !== j.partition) {
    return { ok: false, motivo: 'la copia pertenece a otra operación o a otro proyecto' };
  }
  if (!sobre.claves || typeof sobre.claves !== 'object') return { ok: false, motivo: 'la copia no trae contenido' };
  if (hashDumpLocalStorage(sobre.claves) !== j.previo_hash) return { ok: false, motivo: 'el contenido de la copia no casa con su hash' };
  return { ok: true, dump: sobre.claves };
}

// --- NO-CLOBBER: clasificar el estado ACTUAL de la partición ---------------
//
//   'previo'   no se aplicó nada
//   'aplicado' es exactamente lo que se iba a aplicar
//   'parcial'  subconjunto EXACTO de lo aplicado (clear() + parte de los
//              setItem): solo puede haberlo hecho esta operación
//   'ajeno'    hay contenido que este journal no explica -> NO se pisa
function clasificarParticionRestauracion(actual, j) {
  const hA = hashDumpLocalStorage(actual);
  if (hA === j.previo_hash) return 'previo';
  if (hA === j.esperado_hash) return 'aplicado';
  const permitidas = new Set(Array.isArray(j.esperado_claves) ? j.esperado_claves : []);
  for (const k of Object.keys(actual || {})) {
    if (!permitidas.has(k)) return 'ajeno';
  }
  return 'parcial';
}

// La comprobación va INMEDIATAMENTE antes de escribir, nunca varios pasos antes.
async function reponerParticionDesdePrevio(j) {
  const prev = leerPrevioDemostrable(j);
  if (!prev.ok) {
    appLog(`Restauración — NO se repone: ${prev.motivo}`);
    return { estado: 'previo-no-demostrable', motivo: prev.motivo };
  }
  let actual;
  try { actual = await readLocalStorageDumpFromPartition(j.partition); } catch (e) {
    return { estado: 'particion-ilegible', motivo: String((e && e.message) || e) };
  }
  const clase = clasificarParticionRestauracion(actual, j);
  if (clase === 'previo') {
    // NO se vuelca aquí a propósito: 'previo' significa que NADIE escribió en
    // la partición, así que su contenido es el que ya había y ya era durable.
    // No hay nada nuevo que pudiera perderse en un corte.
    return { estado: 'ya-estaba', clase };
  }
  if (clase === 'ajeno') {
    appLog(`Restauración — NO-CLOBBER: la partición ${j.partition} tiene contenido que este registro no explica; no se repone.`);
    return { estado: 'destino-ocupado', clase };
  }
  try {
    await writeLocalStorageDumpToPartition(j.partition, prev.dump, { clearFirst: true });
  } catch (e) {
    return { estado: 'fallo', motivo: String((e && e.message) || e) };
  }

  // ---- RELECTURA ---------------------------------------------------------
  // Que `setItem` no lanzara no demuestra que la partición haya quedado con el
  // estado PRE. Se relee y se compara contra el hash del journal ANTES de
  // declarar nada: quien llama usa 'repuesto' para decidir si puede borrar el
  // journal y `previo.enc`, que son la única copia durable que queda.
  let releido;
  try {
    releido = await readLocalStorageDumpFromPartition(j.partition);
  } catch (e) {
    appLog(`ERROR PS-2005 — reposición NO demostrable: no se pudo releer la partición ${j.partition}: ${String((e && e.message) || e)}`);
    return { estado: 'fallo-relectura', clase, motivo: 'no se pudo releer la partición: ' + String((e && e.message) || e) };
  }
  const hRel = hashDumpLocalStorage(releido);
  if (hRel !== j.previo_hash) {
    appLog(`ERROR PS-2005 — reposición NO demostrable: la partición ${j.partition} no quedó con el estado anterior (${hRel.slice(0, 12)} vs ${String(j.previo_hash).slice(0, 12)}).`);
    return { estado: 'fallo-relectura', clase, motivo: 'la partición no quedó con el estado anterior' };
  }

  // ---- BARRERA DURABLE DEL PRE -------------------------------------------
  // Mismo motivo que en R4, y aquí es MÁS grave: tras esto, quien llama borra
  // el journal y `previo.enc`. Si la reposición se quedara en la capa de
  // Chromium y el proceso muriera, al arrancar no habría material de
  // recuperación, no habría marca de confirmación, y la partición podría
  // conservar bytes del restore o un estado intermedio: se habría perdido
  // justo el estado que se prometía devolver.
  //
  // Si el volcado falla NO se declara repuesto: quien llama trata cualquier
  // estado distinto de 'repuesto'/'ya-estaba' como fail-closed y conserva el
  // journal y la foto. Nunca se borra la única copia durable.
  try {
    await session.fromPartition(j.partition).flushStorageData();
  } catch (e) {
    appLog(`ERROR PS-2005 — reposición NO demostrable: no se pudo volcar a disco la partición ${j.partition}: ${String((e && e.message) || e)}`);
    return { estado: 'fallo-flush', clase, motivo: 'no se pudo volcar a disco el estado anterior: ' + String((e && e.message) || e) };
  }

  return { estado: 'repuesto', clase };
}

// Idempotente. Marca 'limpiando' antes de borrar, para distinguir un corte en
// mitad de la limpieza de un "nunca se aplicó".
function limpiarMaterialRestauracion(actionId, journal) {
  try {
    if (journal) {
      const m = Object.assign({}, journal, { fase: 'limpiando' });
      escribirBufferDurable(journalRestauracionPath(actionId), Buffer.from(JSON.stringify(m, null, 2), 'utf8'));
    }
    fs.rmSync(dirDeRestauracion(actionId), { recursive: true, force: true });
    if (existeRuta(dirDeRestauracion(actionId))) return { ok: false, motivo: 'la carpeta de material sigue ahí' };
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: String((e && e.message) || e) };
  }
}

// --- recuperación al arrancar ---------------------------------------------
async function resolverRestauracionPendiente(j) {
  const enMarca = estadoAccionEnMarca(j.action_id);
  if (enMarca.estado === 'no-demostrable') {
    appLog(`ERROR PS-2006 — no se puede saber si la restauración ${j.action_id} llegó a aplicarse: ${enMarca.motivo}`);
    return { ok: false, actionId: j.action_id, clase: 'accion-no-demostrable', motivo: enMarca.motivo };
  }
  // CONFIRMADA: no se vuelve atrás nunca. Se termina la limpieza.
  if (enMarca.estado === 'aplicada') {
    const l = limpiarMaterialRestauracion(j.action_id, j);
    if (!l.ok) return { ok: false, actionId: j.action_id, clase: 'cleanup-incompleto', motivo: l.motivo };
    proyectosEnRestauracion.delete(Number(j.project_id));
    restauracionesSinResolver.delete(Number(j.project_id));
    return { ok: true, actionId: j.action_id, caso: 'confirmada', clase: 'limpiada' };
  }
  // NO CONFIRMADA: se repone, y SOLO si todo se demuestra.
  const v = await reponerParticionDesdePrevio(j);
  if (v.estado !== 'repuesto' && v.estado !== 'ya-estaba') {
    appLog(`ERROR PS-2006 — la restauración ${j.action_id} no se pudo deshacer; no se destruye nada.`);
    return { ok: false, actionId: j.action_id, caso: 'no-confirmada', clase: 'rollback-bloqueado', vuelta: v };
  }
  const l = limpiarMaterialRestauracion(j.action_id, j);
  if (!l.ok) return { ok: false, actionId: j.action_id, clase: 'cleanup-incompleto', motivo: l.motivo };
  proyectosEnRestauracion.delete(Number(j.project_id));
  restauracionesSinResolver.delete(Number(j.project_id));
  appLog(`Restauración ${j.action_id} no llegó a confirmarse: deshecha, el proyecto queda como estaba.`);
  return { ok: true, actionId: j.action_id, caso: 'no-confirmada', clase: 'repuesta', estadoPrevio: v.estado };
}

// Lo PRIMERO que hace es rearmar la barrera desde disco: mientras haya una
// restauración pendiente de un proyecto, nada suyo puede escribir.
function rearmarBarrerasDeRestauracion() {
  const r = journalsDeRestauraciones();
  if (!r.ok) return { ok: false, motivo: r.motivo };
  const armados = [];
  for (const e of r.entradas) {
    if (e.clase === 'valido') {
      proyectosEnRestauracion.add(Number(e.j.project_id));
      // H-1: al arrancar, un journal que no está ya en fase de limpieza es una
      // restauración SIN RESOLVER, no una en curso. El mensaje y el
      // `reintentable` tienen que decir eso.
      if (e.j.fase !== 'limpiando') restauracionesSinResolver.add(Number(e.j.project_id));
      armados.push(e.j.project_id);
    }
  }
  return { ok: true, armados };
}

async function recuperarRestauracionesPendientes() {
  const re = rearmarBarrerasDeRestauracion();
  const r = journalsDeRestauraciones();
  if (!r.ok) {
    return { ok: false, clase: 'no-verificable', motivo: r.motivo, resultados: [], malos: [{ clase: 'no-verificable', motivo: r.motivo }], barrera: re };
  }
  const yo = dbmod.getInstallationId();
  const resultados = [];
  for (const e of r.entradas) {
    if (e.clase === 'sin-journal') {
      appLog(`ERROR PS-2006 — material de restauración sin registro: ${e.ruta}`);
      resultados.push({ ruta: e.ruta, ok: false, clase: 'material-sin-journal', motivo: e.motivo });
      continue;
    }
    if (e.clase !== 'valido') {
      appLog(`ERROR PS-2006 — registro de restauración no demostrable (${e.ruta}): ${e.motivo}`);
      resultados.push({ ruta: e.ruta, ok: false, clase: 'journal-no-demostrable', motivo: e.motivo });
      continue;
    }
    if (e.j.writer !== yo) { resultados.push({ ruta: e.ruta, ok: true, clase: 'ajena' }); continue; }
    resultados.push(await resolverRestauracionPendiente(e.j));
  }
  const malos = resultados.filter((x) => !x.ok);
  return { ok: malos.length === 0, resultados, malos, barrera: re };
}

async function restoreProjectBackup(projectId, backupId) {
  const pid = Number(projectId);
  const noAplicado = (error, reintentable, extra) =>
    Object.assign({ ok: false, aplicado: false, reintentable: !!reintentable, error }, extra || {});

  // ---- R-2: ARMAR LA BARRERA, antes de tocar ninguna ventana -------------
  //
  // Va PRIMERO a proposito: los close hooks de las tres familias tienen que
  // saber que cierran POR RESTAURACION antes de que empiece el quiesce, o
  // escribirian como backup nuevo justo el estado que se ha pedido descartar.
  const bloq0 = proyectoBloqueadoParaMutar(pid);
  if (bloq0) return noAplicado(bloq0.mensaje, bloq0.motivo === 'proyecto-en-restauracion', { bloqueo: bloq0.motivo });
  proyectosEnRestauracion.add(pid);
  // H-1 (15 sept 2026) — DOS variables, no una.
  //
  // Antes había una sola, `armado`, y el `finally` la interpretaba como "la
  // barrera sigue puesta, hay que quitarla". Los caminos fail-closed hacían
  // `armado = true` justo antes de devolver, con la intención evidente de
  // CONSERVARLA — pero eso era exactamente lo que garantizaba que el `finally`
  // la borrara. El nombre estaba invertido respecto al uso, y la barrera se
  // soltaba en los únicos casos en los que tenía que quedarse.
  //
  //   barreraPuesta     -> ¿la he puesto yo y sigue puesta?  (para no borrar
  //                        dos veces ni borrar la de otro)
  //   mantenerBarrera   -> ¿tiene que SOBREVIVIR a esta llamada?
  //
  // `mantenerBarrera = true` significa: la restauración termina SIN RESOLVER
  // —vuelta atrás no demostrable, volcado de la reposición fallido, o material
  // conservado a la espera de recuperación— y el proyecto no vuelve a aceptar
  // mutaciones hasta que la recuperación lo resuelva o se reinicie. El journal
  // durable dice lo mismo desde disco (`restauracionPendienteDeProyecto`); esta
  // es la mitad en memoria, que además cubre el hueco de esta misma sesión.
  let barreraPuesta = true;
  let mantenerBarrera = false;
  let actionId = null;
  let journalEscrito = null;
  let ventanasCerradas = false;
  const desarmarSiProcede = () => {
    // (barrera persistente revertida a proposito)
    if (barreraPuesta) { proyectosEnRestauracion.delete(pid); barreraPuesta = false; }
  };

  try {
    // ---- R-1: guardas del canal + F-1 GLOBAL ----------------------------
    if (procesoComprometido) {
      return noAplicado('La aplicacion esta cerrandose por un fallo interno; no se ha restaurado nada.', false, { bloqueo: 'proceso-comprometido' });
    }
    {
      const b = bloqueoDeSeguridad();
      if (b) return noAplicado(b.mensaje, false, { bloqueo: b.motivo });
    }
    if (rekeyInProgress) return noAplicado(REKEY_BUSY_MESSAGE, true, { bloqueo: 'rekey' });
    {
      const g = f1Global();
      if (!g.libre) {
        if (g.clase === 'no-verificable') {
          return noAplicado('No se ha podido comprobar si hay una operacion anterior sin terminar. No se restaura nada.\n\nDetalle: ' + g.motivo, true, { bloqueo: 'accion-no-verificable' });
        }
        appLog('ERROR PS-2006 — restauracion no iniciada: ' + g.motivo);
        return noAplicado('Hay una operacion anterior de este equipo sin resolver. No se restaura nada hasta aclararlo.\n\nDetalle: ' + g.motivo, false, { bloqueo: 'accion-no-demostrable' });
      }
    }
    {
      const g = f1Restauraciones();
      if (!g.libre) {
        appLog('ERROR PS-2006 — restauracion no iniciada: ' + g.motivo);
        return noAplicado('Hay una restauracion anterior de este equipo sin resolver. No se empieza otra hasta aclararlo.\n\nDetalle: ' + g.motivo,
          g.clase === 'no-verificable', { bloqueo: g.clase === 'no-verificable' ? 'accion-no-verificable' : 'accion-no-demostrable' });
      }
    }

    const row = dbmod.get('SELECT * FROM projects WHERE id=?', [pid]);
    if (!row) return noAplicado('Proyecto no encontrado.', false);
    const bkRow = backupId
      ? dbmod.get('SELECT * FROM backups WHERE id=?', [backupId])
      : dbmod.get('SELECT * FROM backups WHERE project_id=? ORDER BY created_at DESC LIMIT 1', [pid]);
    if (!bkRow) return noAplicado('No hay backups guardados para este proyecto todavia.', false);

    // ---- R0: QUIESCE completo, las TRES familias ------------------------
    let quiesce = null;
    try {
      quiesce = await cerrarVentanasDeProyecto(pid, { porRestauracion: true });
      ventanasCerradas = true;
    } catch (e) {
      return noAplicado('No se pudieron cerrar las ventanas del proyecto: ' + String((e && e.message) || e), true);
    }
    // El tope de 8 s NO es una confirmación. Si alguna ventana no confirmó su
    // cierre, NO se toca la partición: seguiría viva encima de ella.
    if (quiesce.noConfirmadas > 0 || projectWindows.has(pid) || meetingPrepWindows.has(pid) || candidateEvalWindows.has(pid)) {
      return noAplicado(
        'Alguna ventana de este proyecto no terminó de cerrarse. No se ha tocado nada: ciérrala a mano y ' +
        'vuelve a intentarlo.' + errorCodeSuffix('PS-2002'), true, { bloqueo: 'quiesce-incompleto' });
    }

    // ---- R1: CAPTURAR — la base DESPUES del quiesce, rutas puras --------
    //
    // Antes del quiesce no vale: cerrar ventanas mueve el commit (bounds,
    // guardados finales), y esa base llegaria invalida a exigirCommitBase.
    const base = dbmod.getCommitActual();
    if (!base) return noAplicado('La base de datos todavia no tiene identidad.', false);
    const dirBackups = rutaBackupsPura(row);

    {
      const oc = ocupacionComun(dirBackups, { scope: 'subtree' });
      if (oc.ocupado) {
        return noAplicado(
          oc.indeterminado
            ? 'Otro equipo dejo una operacion sin terminar que no se puede interpretar. No se ha tocado nada.'
            : 'Otro equipo esta trabajando ahora mismo sobre este proyecto. No se ha tocado nada.',
          true, { bloqueo: 'ocupado-otro-writer', detalleOcupacion: oc });
      }
    }

    // Lectura y validacion del backup con rutas PURAS: cero UPDATE, cero mkdir.
    let esperado;
    let backupSha = null;
    try {
      esperado = JSON.parse(readBackupPayload(row, bkRow, { puro: true }));
      if (bkRow.file_path) {
        const h = sha256DeArchivo(path.join(dirBackups, bkRow.file_path));
        backupSha = h.existe && !h.ilegible ? h.sha : null;
      }
    } catch (e) {
      return noAplicado('No se pudo leer el backup: ' + String((e && e.message) || e), false);
    }
    if (!esperado || typeof esperado !== 'object' || Array.isArray(esperado)) {
      return noAplicado('El backup no contiene un estado restaurable.', false);
    }

    let previoDump;
    try { previoDump = await readLocalStorageDumpFromPartition(row.partition_name); } catch (e) {
      return noAplicado('No se pudo leer el estado actual del proyecto: ' + String((e && e.message) || e), true);
    }

    actionId = nuevoActionId();
    const journal = {
      v: RESTAURACIONES_JOURNAL_V, action_id: actionId, writer: dbmod.getInstallationId(),
      project_id: pid, partition: String(row.partition_name),
      backups_dir: dirBackups,
      backup_id: bkRow.id === undefined ? null : bkRow.id,
      backup_sha256: backupSha,
      base_commit_id: base,
      esperado_hash: hashDumpLocalStorage(esperado),
      esperado_claves: Object.keys(esperado).sort(),
      previo_hash: hashDumpLocalStorage(previoDump),
      fase: 'aplicando', cifrado: 0,
      previo_sha256: null, previo_size: 0, previo_n_claves: 0,
      startedAt: new Date().toISOString(),
    };

    // ---- R2: FOTO PREVIA DURABLE ----------------------------------------
    try {
      const p = escribirPrevioDurable(actionId, journal, previoDump);
      journal.cifrado = p.cifrado;
      journal.previo_sha256 = p.sha256;
      journal.previo_size = p.size;
      journal.previo_n_claves = p.n_claves;
    } catch (e) {
      try { fs.rmSync(dirDeRestauracion(actionId), { recursive: true, force: true }); } catch (e2) {}
      return noAplicado('No se pudo guardar la copia del estado actual: ' + String((e && e.message) || e), true);
    }

    // ---- R3: JOURNAL DURABLE, antes de tocar la particion ---------------
    try {
      const g = escribirBufferDurable(journalRestauracionPath(actionId), Buffer.from(JSON.stringify(journal, null, 2), 'utf8'));
      if (!g.ok) throw new Error(g.motivo);
      journalEscrito = journal;
    } catch (e) {
      try { fs.rmSync(dirDeRestauracion(actionId), { recursive: true, force: true }); } catch (e2) {}
      return noAplicado('No se pudo registrar la operacion antes de restaurar: ' + String((e && e.message) || e), true);
    }

    // ---- R4: APLICAR -----------------------------------------------------
    try {
      await writeLocalStorageDumpToPartition(row.partition_name, esperado, { clearFirst: true });
      // BARRERA DURABLE DEL localStorage, antes del commit de confirmación de R5.
      //
      // `clear()` + `setItem()` dejan el dato en la capa de Chromium; el
      // LevelDB de la partición no lo recibe hasta que su escritura perezosa
      // toca. Sin esta llamada hay una ventana real en la que la marca de R5
      // ya dice «aplicado» y el fichero de la partición todavía está vacío.
      //
      // Medido en esta máquina con Electron 30.5.1 (sonda `probe-flush3.js`,
      // 5 de 5 repeticiones, ventana de observación < 1,1 ms):
      //   - sin flush, el valor tarda ~103 ms en aparecer en
      //     `Local Storage\leveldb\000003.log`;
      //   - con flush, antes de la llamada NO está y dentro del milisegundo
      //     posterior al retorno SÍ (78 -> 175 bytes), costando ~0,04 ms.
      //
      // La llamada devuelve `undefined`, no una promesa; el `await` no espera
      // a nada hoy y está puesto para que siga siendo correcto si una versión
      // futura de Electron la convierte en asíncrona.
      //
      // LÍMITE HONESTO: esto demuestra que el dato llega al FICHERO del
      // LevelDB, no que el sistema operativo lo haya bajado al medio físico.
      // No es un fsync y no se comporta como tal ante un corte de corriente.
      //
      // Va dentro del try de R4 a propósito: si fallara, el tratamiento
      // correcto es exactamente el de un fallo al aplicar — reponer desde la
      // foto previa y devolver `aplicado:false` —, que ya está probado.
      await session.fromPartition(row.partition_name).flushStorageData();
    } catch (e) {
      const v = await reponerParticionDesdePrevio(journal);
      if (v.estado !== 'repuesto' && v.estado !== 'ya-estaba') {
        const rescate = saveRescueDump(row, previoDump);
        appLog('ERROR PS-2005 — la restauracion ' + actionId + ' fallo y la vuelta atras no se pudo completar. Copia de rescate: ' + (rescate || 'NO SE PUDO ESCRIBIR'));
        mantenerBarrera = true;
        return noAplicado(
          'La restauracion fallo y tampoco se pudo dejar el proyecto como estaba. NO sigas trabajando en este ' +
          'proyecto sin revisarlo. Todos tus backups siguen intactos en disco.\n\nDetalle: ' + String((e && e.message) || e) +
          (rescate ? '\n\nCopia de rescate del estado anterior:\n' + rescate : '') + errorCodeSuffix('PS-2005'),
          false, { bloqueo: 'accion-no-demostrable', actionId, vuelta: v });
      }
      try { fs.rmSync(dirDeRestauracion(actionId), { recursive: true, force: true }); } catch (e2) {}
      if (ventanasCerradas) { desarmarSiProcede(); openProjectWindow(row); }
      return noAplicado('No se ha restaurado nada: el proyecto queda exactamente como estaba.\n\nDetalle: ' +
        String((e && e.message) || e) + errorCodeSuffix('PS-2002'), true, { actionId });
    }

    // ---- R5: CONFIRMAR — marca + exigirCommitBase ------------------------
    //
    // El restore no cambia filas, pero necesita un punto de confirmacion A3.3
    // demostrable. La marca ES ese punto: antes de ella la recuperacion repone;
    // despues, no se vuelve atras nunca.
    try {
      dbmod.escribirMultiple([sentenciaMarcaAccion(actionId)], { exigirCommitBase: base });
    } catch (e) {
      if (e && e.aplicado === true) {
        appLog('ERROR PS-2006 — la restauracion ' + actionId + ' SI se aplico pero no se pudo verificar: ' + e.message);
        // H-1: forma 3. El material NO se limpia (a propósito: la recuperación
        // del siguiente arranque es quien decide), la sesión pide reinicio y no
        // debe seguir mutando este proyecto. La barrera se queda puesta.
        mantenerBarrera = true;
        return {
          ok: true, aplicado: true, verificado: false, requiereReinicio: true, actionId,
          aviso: 'La restauracion SI se ha aplicado, pero no se ha podido verificar y esta sesion no puede ' +
            'continuar de forma segura. Cierra Panorama del Servicio y vuelve a abrirlo. NO repitas la ' +
            'operacion.\n\nDetalle: ' + String(e.message),
        };
      }
      const v = await reponerParticionDesdePrevio(journal);
      const reintentable = !!(e && (e.kind === 'base-cambiada' || e.kind === 'conflicto' || e.kind === 'ocupado' || e.kind === 'io'));
      if (v.estado !== 'repuesto' && v.estado !== 'ya-estaba') {
        const rescate = saveRescueDump(row, previoDump);
        appLog('ERROR PS-2005 — la restauracion ' + actionId + ' no se confirmo y la vuelta atras quedo bloqueada. Copia de rescate: ' + (rescate || 'NO SE PUDO ESCRIBIR'));
        mantenerBarrera = true;
        return noAplicado(
          'No se restauro nada, y ademas la vuelta atras no se pudo completar. No se ha destruido nada: ' +
          'cierra la aplicacion y revisa el registro.\n\nDetalle: ' + String((e && e.message) || e) + errorCodeSuffix('PS-2005'),
          false, { bloqueo: 'accion-no-demostrable', actionId, vuelta: v });
      }
      try { fs.rmSync(dirDeRestauracion(actionId), { recursive: true, force: true }); } catch (e2) {}
      if (ventanasCerradas) { desarmarSiProcede(); openProjectWindow(row); }
      return noAplicado(
        e && e.kind === 'base-cambiada'
          ? 'Otro equipo guardo cambios mientras se restauraba. No se ha modificado nada; vuelve a intentarlo.'
          : 'No se pudo restaurar: ' + String((e && e.message) || e),
        reintentable, { actionId });
    }

    // ---- R6: CLEANUP -----------------------------------------------------
    const limpieza = limpiarMaterialRestauracion(actionId, journal);
    appLog('Restauracion ' + actionId + ' aplicada' + (limpieza.ok ? '' : ' — limpieza pendiente: ' + limpieza.motivo) + '.');

    // ---- R7: liberar la barrera y reabrir --------------------------------
    desarmarSiProcede();
    openProjectWindow(row);
    return { ok: true, aplicado: true, verificado: true, actionId, limpieza };
  } catch (e) {
    // NINGUNA excepcion sale de aqui: el contrato son SIEMPRE tres formas. Una
    // que escapara dejaria al consumidor sin `aplicado`, que es justo la
    // truthiness que el Bloque 4 cerro.
    appLog('ERROR — excepcion inesperada durante la restauracion: ' + String((e && e.stack) || e));
    if (!journalEscrito) {
      if (actionId) { try { fs.rmSync(dirDeRestauracion(actionId), { recursive: true, force: true }); } catch (e2) {} }
      return noAplicado('No se ha restaurado nada: ' + String((e && e.message) || e), true, { actionId });
    }
    const v = await reponerParticionDesdePrevio(journalEscrito);
    if (v.estado !== 'repuesto' && v.estado !== 'ya-estaba') {
      appLog('ERROR PS-2005 — la restauracion ' + actionId + ' fallo y la vuelta atras no se pudo completar.');
      armado = true;
      return noAplicado(
        'La restauracion fallo y tampoco se pudo dejar el proyecto como estaba. No se ha destruido nada: ' +
        'cierra la aplicacion y revisa el registro.\n\nDetalle: ' + String((e && e.message) || e) + errorCodeSuffix('PS-2005'),
        false, { bloqueo: 'accion-no-demostrable', actionId, vuelta: v });
    }
    try { fs.rmSync(dirDeRestauracion(actionId), { recursive: true, force: true }); } catch (e2) {}
    return noAplicado('No se ha restaurado nada: el proyecto queda exactamente como estaba.\n\nDetalle: ' +
      String((e && e.message) || e), true, { actionId });
  } finally {
    desarmarSiProcede();
  }
}

// ------------------------------------------------------------------
// v0.1.50: ventanita para elegir A MANO cuál de los backups guardados de un
// proyecto restaurar (por fecha), en vez de solo poder restaurar "el
// último". Reutiliza tal cual los IPC 'backup:list'/'backup:restore' que ya
// existían (usados hasta ahora solo desde el lanzador, con backupId fijo a
// null — "el último" también ahí) y la misma restoreProjectBackup() de
// arriba, así que no hay ningún camino de restauración nuevo: mismo cifrado,
// mismo cierre/reapertura de la ventana del proyecto, mismos errores.
// Ventana no-modal a propósito (mismo patrón que promptForPassword): se deja
// sin bloquear el resto de la app por si el usuario quiere comprobar algo en
// otro sitio (p.ej. "Ver carpeta de backups") antes de decidir cuál elegir.
// ------------------------------------------------------------------
function openBackupPickerWindow(row, parentWin) {
  const win = new BrowserWindow({
    width: 560,
    height: 640,
    minWidth: 440,
    minHeight: 420,
    parent: parentWin || undefined,
    title: `Panorama del Servicio — Restaurar backup (${row.name})`,
    icon: APP_ICON_PATH,
    // v2.0.16 — mismo tratamiento que el lanzador: sin marco nativo, barra
    // propia sin fila de menú (esta ventana nunca tuvo menú).
    frame: false,
    // v2.0.17 — ver la nota junto a este mismo bloque en openProjectWindow.
    show: false,
    backgroundColor: '#0a0e13',
    webPreferences: {
      preload: path.join(__dirname, 'preload-backup-picker.js'),
      contextIsolation: true,
      nodeIntegration: false,
      additionalArguments: [
        `--panorama-project-id=${row.id}`,
        `--panorama-project-name=${encodeURIComponent(row.name)}`,
      ],
    },
  });
  aplicarPoliticaDeNavegacion(win.webContents, 'selector-backups'); // F3
  win.loadFile(path.join(__dirname, 'backup-picker', 'index.html'));
  win.once('ready-to-show', () => { if (!win.isDestroyed()) win.show(); });
  win.on('maximize', () => { if (!win.isDestroyed()) win.webContents.send('win:maximizedChanged', true); });
  win.on('unmaximize', () => { if (!win.isDestroyed()) win.webContents.send('win:maximizedChanged', false); });
}

// ------------------------------------------------------------------
// Igual que restoreProjectBackup, pero para sembrar la partición de un
// proyecto RECIÉN CREADO con un backup importado desde "Nuevo proyecto" (en
// vez de restaurar uno ya existente en la BD): abre una ventana oculta bajo
// la partición del proyecto, carga restore-helper.html, y escribe ahí las
// claves de localStorage ya calculadas por computeProjectKeys/LS_PREFIX. El
// proyecto todavía no tiene ventana abierta, así que no hace falta cerrar
// nada antes.
// ------------------------------------------------------------------
function seedNewProjectStorage(row, storageKey, historyKey, stateObj, historyArr) {
  const dump = {
    [LS_PREFIX + storageKey]: JSON.stringify(stateObj),
    [LS_PREFIX + historyKey]: JSON.stringify(historyArr),
  };
  return writeLocalStorageDumpToPartition(row.partition_name, dump, { clearFirst: false })
    .then(() => true)
    .catch((e) => {
      throw new Error('No se pudieron guardar los datos importados: ' + ((e && e.message) || e));
    });
}

// ------------------------------------------------------------------
// A1 (auditoría 2026-09-13) — RE-CIFRADO ATÓMICO de todos los archivos del
// usuario gobernados por la clave de Seguridad.
//
// Sustituye a la antigua reencryptAllBackups(), que solo recorría la tabla
// `backups`. Los archivos de `meeting_preps` (preparaciones de reunión) y de
// `candidate_evals` (evaluación de candidatos) se cifran con ESA MISMA clave
// (ver encryptIfNeeded) y nunca se re-cifraban: cambiar la contraseña o
// desactivar la Seguridad los dejaba ilegibles PARA SIEMPRE, porque la sal
// vieja se sobrescribía y ni con la contraseña anterior se podía reconstruir
// la clave. Las 3 familias se tratan ahora exactamente igual.
//
// Además, la operación entera es todo-o-nada. Diseño (registro de intención
// en <userData>/.panorama-rekey/):
//
//   0. LOCK    — rekeyInProgress bloquea los 4 puntos de guardado mientras
//                dura. Un archivo escrito a media migración llevaría la clave
//                VIEJA, no estaría en el inventario, y quedaría ilegible en
//                cuanto se consolidara la sal nueva.
//   1. PREPARE — descifra con oldKey y re-cifra con newKey hacia
//                <staging>/<i>.new. NINGÚN original se toca. Cada .new se
//                RELEE de disco y se descifra para comprobar el viaje de ida
//                y vuelta: una escritura truncada se detecta aquí, que es el
//                último momento en que abortar todavía no cuesta nada.
//                Cualquier fallo en esta fase = abortar con CERO cambios.
//   2. SWAP    — original -> <staging>/<i>.old, y <i>.new -> original. Son
//                renames dentro del MISMO volumen (staging vive bajo
//                userData, igual que las 3 familias): atómicos y sin coste
//                de espacio. El original NUNCA se borra, solo se aparta.
//   3. COLUMNS — solo si el flag `encrypted` cambia de verdad (activar o
//                desactivar; un cambio de contraseña lo deja en 1). Tres
//                UPDATE con EL MISMO filtro que el inventario.
//   4. META    — sal, verificador y `security_enabled` SOLO aquí, cuando
//                todas las migraciones ya han terminado bien.
//   5. CLEANUP — borra el staging, que es lo que retira los .old.
//
// Por qué el journal guarda newSalt/newVerifier desde el principio: sin ellos
// en disco, un corte de luz entre la fase 2 y la 4 en un cambio de contraseña
// dejaría todos los archivos bajo una clave derivada de una sal que solo
// existió en memoria — pérdida permanente, justo lo que esto viene a evitar.
// El journal es un registro de intención, no la consolidación: `app_meta` (lo
// que la app lee de verdad) se sigue escribiendo solo en la fase 4. No
// contiene ni la contraseña ni la clave, solo la misma sal y el mismo
// verificador que ya viven en app_meta de forma permanente, y se borra al
// terminar. Ver recoverInterruptedRekeyIfAny() más abajo.
// ------------------------------------------------------------------
const REKEY_DIR_NAME = '.panorama-rekey';
let rekeyInProgress = false;
// Mensaje único para los 3 puntos de guardado que devuelven {ok,error} (el
// cuarto, backup:save, devuelve un booleano y no lleva texto).
const REKEY_BUSY_MESSAGE =
  'La Seguridad se está actualizando ahora mismo (re-cifrando los archivos guardados). ' +
  'Espera unos segundos y vuelve a guardar — no se ha perdido nada de lo que tienes en pantalla.';

function rekeyStagingDir() {
  return path.join(app.getPath('userData'), REKEY_DIR_NAME);
}
function rekeyJournalPath() {
  return path.join(rekeyStagingDir(), 'journal.json');
}
function rekeyItemPath(i, suffix) {
  return path.join(rekeyStagingDir(), `${i}.${suffix}`);
}
function removeRekeyStaging() {
  try {
    fs.rmSync(rekeyStagingDir(), { recursive: true, force: true });
  } catch (e) {
    appLog('Seguridad — no se pudo retirar la carpeta de trabajo del re-cifrado: ' + String((e && e.message) || e));
  }
}

// ------------------------------------------------------------------
// BLOQUE 3 — JOURNAL v2
//
// Qué añade respecto a v1, y por qué cada cosa:
//
// · `base_commit_id` — el commit de la base de datos sobre el que se calculó
//   el inventario, capturado ANTES de preparar nada y persistido antes de que
//   cambie ni un archivo. Es lo que impide que una recuperación de un journal
//   viejo consolide su sal sobre la base de datos que otro equipo dejó
//   después. La base NUNCA se recalcula: recalcularla convertiría la
//   comprobación en una tautología (declararía aceptable justo lo que hay).
//
// · `original_sha256` / `new_sha256` por item — "el archivo existe" no
//   demuestra nada en una carpeta compartida: el otro equipo pudo
//   reescribirlo mientras durábamos. Cada rename se decide comparando los
//   bytes reales contra lo que el journal espera; un tercer hash significa
//   "esto no es ni lo que había ni lo que preparé" y se para en seco.
//
// · `writer` — el staging vive DENTRO de la carpeta de datos, así que en una
//   ubicación compartida es el MISMO para los dos equipos. No se recupera
//   automáticamente el trabajo de otro: podría estar ejecutándose ahora mismo.
//
// · `phase: 'cleanup'` + `consolidated_commit_id` — se escriben tras
//   confirmar la mutación única y antes de retirar el staging. Con eso, un
//   staging SIN journal deja de poder deducirse como "residuo de limpieza":
//   el journal vive hasta el final.
//
// · `remembered_final` — si el estado final lleva o no contraseña recordada.
//   NUNCA el valor: en el staging no entra ningún secreto.
// ------------------------------------------------------------------
const REKEY_JOURNAL_V = 2;

// Escritura durable de JSON, con la misma disciplina que
// guardarRegistroUbicaciones(): tmp + writeSync con progreso + fsync + rename.
// Un journal a medias es peor que no tenerlo, porque describe mal lo que hay.
// La misma disciplina, para bytes cualesquiera: la usa el Bloque 4 para
// preparar el archivo del usuario antes de publicarlo.
function escribirBufferDurable(ruta, buf) {
  const tmp = `${ruta}.escribiendo-${process.pid}-${Date.now()}`;
  try {
    fs.mkdirSync(path.dirname(ruta), { recursive: true });
    const fd = fs.openSync(tmp, 'w');
    try {
      let escritos = 0;
      while (escritos < buf.length) {
        const n = fs.writeSync(fd, buf, escritos, buf.length - escritos, escritos);
        if (!(n > 0)) throw new Error('writeSync sin progreso');
        escritos += n;
      }
      try {
        fs.fsyncSync(fd);
      } catch (e) {
        if (!FSYNC_NO_SOPORTADO_REG.has(e && e.code)) {
          throw new Error(`fsync falló (${(e && e.code) || '?'}): ${e && e.message}`);
        }
      }
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, ruta);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (e2) {}
    return { ok: false, motivo: String((e && e.message) || e) };
  }
  return { ok: true };
}

function escribirJsonDurable(ruta, obj) {
  const tmp = `${ruta}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.mkdirSync(path.dirname(ruta), { recursive: true });
    const fd = fs.openSync(tmp, 'w');
    try {
      const buf = Buffer.from(JSON.stringify(obj, null, 2), 'utf8');
      let escritos = 0;
      while (escritos < buf.length) {
        const n = fs.writeSync(fd, buf, escritos, buf.length - escritos, escritos);
        if (!(n > 0)) throw new Error('writeSync sin progreso');
        escritos += n;
      }
      try {
        fs.fsyncSync(fd);
      } catch (e) {
        if (!FSYNC_NO_SOPORTADO_REG.has(e && e.code)) {
          throw new Error(`fsync falló (${(e && e.code) || '?'}): ${e && e.message}`);
        }
      }
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, ruta);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (e2) {}
    return { ok: false, motivo: String((e && e.message) || e) };
  }
  // Releer: escribir sin comprobar no demuestra que quedó guardado.
  try {
    const v = JSON.parse(fs.readFileSync(ruta, 'utf8'));
    if (!v) throw new Error('la relectura no devolvió nada');
  } catch (e) {
    return { ok: false, motivo: `tras escribir no se pudo releer: ${String((e && e.message) || e)}` };
  }
  return { ok: true };
}

function guardarJournalRekey(journal) {
  return escribirJsonDurable(rekeyJournalPath(), journal);
}

// sha256 de un archivo. Distingue "no existe" de "no se pudo leer": lo segundo
// NO autoriza a tratarlo como ausente.
function sha256DeArchivo(p) {
  try {
    const b = fs.readFileSync(p);
    return { existe: true, sha: crypto.createHash('sha256').update(b).digest('hex'), size: b.length };
  } catch (e) {
    const cod = (e && e.code) || '';
    if (cod === 'ENOENT') return { existe: false, codigo: cod };
    return { existe: false, ilegible: true, codigo: cod, motivo: String((e && e.message) || e) };
  }
}

// Clasifica lo que hay en la carpeta de trabajo, SIN deducir nada por fechas.
function leerJournalRekey() {
  const staging = rekeyStagingDir();
  const jp = rekeyJournalPath();
  if (!fs.existsSync(staging)) return { clase: 'ausente' };
  if (!fs.existsSync(jp)) return { clase: 'sin-journal' };
  let j = null;
  try {
    j = JSON.parse(fs.readFileSync(jp, 'utf8'));
  } catch (e) {
    return { clase: 'ilegible', motivo: String((e && e.message) || e) };
  }
  if (!j || typeof j !== 'object') return { clase: 'ilegible', motivo: 'el journal no es un objeto' };
  if (j.v === 1) return { clase: 'v1', journal: j };
  if (j.v !== REKEY_JOURNAL_V || !Array.isArray(j.items)) {
    return { clase: 'desconocido', motivo: `versión ${JSON.stringify(j.v)}` };
  }
  return { clase: 'v2', journal: j };
}

// ¿Hay algún `.old` en TODA la carpeta de trabajo? Es la pregunta que decide
// si una operación llegó a sustituir algún original. Se recorre la carpeta de
// verdad, no la lista de items del journal.
function hayAlgunOldEnStaging() {
  try {
    return fs.readdirSync(rekeyStagingDir()).some((f) => /\.old$/i.test(f));
  } catch (e) {
    return true;   // si no se puede mirar, se asume lo peor
  }
}

// Las 3 familias de archivos gobernadas por la clave de Seguridad, con el
// MISMO criterio para las tres.
// - Los backups "legacy" (file_path vacío, contenido todavía dentro de
//   backups.payload) se excluyen a propósito: su contenido no vive en ningún
//   archivo, readBackupPayload() los devuelve tal cual sin mirar `encrypted`,
//   y migrateLegacyInlineBackupsToFiles() ya los convierte al arrancar.
// - El JOIN contra `projects` no es decorativo: deleteProjectById() borra las
//   filas de `backups` y la de `projects`, pero NO las de `meeting_preps` ni
//   `candidate_evals`, así que hay filas huérfanas cuyo archivo ya no existe
//   (se fue con la carpeta del proyecto). Quedan fuera del inventario, y el
//   UPDATE de la fase 3 lleva este mismo filtro para no tocarlas.
function collectRekeyInventory() {
  const items = [];
  dbmod
    .all(
      `SELECT b.id AS rowKey, b.file_path, b.encrypted, p.id AS project_id, p.name, p.backup_dir
         FROM backups b JOIN projects p ON p.id = b.project_id
        WHERE b.file_path IS NOT NULL AND b.file_path != ''
        ORDER BY b.id`
    )
    .forEach((r) => {
      const dir = backupsDirForProject({ id: r.project_id, name: r.name, backup_dir: r.backup_dir });
      items.push({ table: 'backups', rowKey: r.rowKey, absPath: path.join(dir, r.file_path), hadFlag: r.encrypted ? 1 : 0 });
    });
  dbmod
    .all(
      `SELECT m.id AS rowKey, m.file_path, m.encrypted, p.id AS project_id, p.name, p.backup_dir
         FROM meeting_preps m JOIN projects p ON p.id = m.project_id
        WHERE m.file_path IS NOT NULL AND m.file_path != ''
        ORDER BY m.id`
    )
    .forEach((r) => {
      const dir = meetingPrepsDirForProject({ id: r.project_id, name: r.name, backup_dir: r.backup_dir });
      items.push({ table: 'meeting_preps', rowKey: r.rowKey, absPath: path.join(dir, r.file_path), hadFlag: r.encrypted ? 1 : 0 });
    });
  dbmod
    .all(
      `SELECT c.project_id AS rowKey, c.encrypted, p.id AS project_id, p.name, p.backup_dir
         FROM candidate_evals c JOIN projects p ON p.id = c.project_id
        ORDER BY c.project_id`
    )
    .forEach((r) => {
      // candidate_evals no tiene columna file_path: la ruta se deriva igual
      // que en candidateEval:get/save (un único estado.json por proyecto).
      const file = candidateEvalFileForProject({ id: r.project_id, name: r.name, backup_dir: r.backup_dir });
      items.push({ table: 'candidate_evals', rowKey: r.rowKey, absPath: file, hadFlag: r.encrypted ? 1 : 0 });
    });
  items.forEach((it, i) => {
    it.i = i;
  });
  return items;
}

// ------------------------------------------------------------------
// BLOQUE 3 — UN CAMBIO DE SEGURIDAD = UNA SOLA MUTACIÓN DE LA BASE DE DATOS
//
// Antes esto eran dos funciones con SEIS `dbmod.run()` entre las dos, y cada
// `dbmod.run()` es un commit A3.3 completo: exporta la base de datos entera y
// la reescribe en disco. Es decir, había instantes reales y observables en el
// archivo con la sal NUEVA y el verificador VIEJO. Si el segundo commit
// fallaba —cosa normal con A3.3: entre uno y otro se vuelve a comprobar el
// disco, y una carpeta compartida puede devolver conflicto— la vuelta atrás
// deshacía los archivos pero NO la sal, y entonces no había contraseña capaz
// de validar: ni la nueva (verificador viejo) ni la vieja (sal perdida). Los
// backups, preparaciones y evaluaciones quedaban ilegibles para siempre.
//
// Ahora las marcas `encrypted`, la sal, el verificador, `security_enabled` y
// la contraseña recordada salen en la MISMA imagen y el MISMO rename: o está
// todo el estado nuevo, o está todo el anterior. El orden entre ellas deja de
// importar porque ya no hay "entre ellas".
//
// El WHERE de los tres UPDATE es idéntico al de collectRekeyInventory().
// ------------------------------------------------------------------
function metaUpsert(key, value) {
  return {
    sql: 'INSERT INTO app_meta(key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    params: [key, value],
  };
}
function metaDelete(key) {
  return { sql: 'DELETE FROM app_meta WHERE key=?', params: [key] };
}

function sentenciasDeSeguridad(mode, items, newFlag, newSalt, newVerifier, remembered) {
  const s = [];
  if (items.some((it) => it.hadFlag !== newFlag)) {
    s.push({
      sql: "UPDATE backups SET encrypted=? WHERE file_path IS NOT NULL AND file_path != '' AND project_id IN (SELECT id FROM projects)",
      params: [newFlag],
    });
    s.push({
      sql: "UPDATE meeting_preps SET encrypted=? WHERE file_path IS NOT NULL AND file_path != '' AND project_id IN (SELECT id FROM projects)",
      params: [newFlag],
    });
    s.push({
      sql: 'UPDATE candidate_evals SET encrypted=? WHERE project_id IN (SELECT id FROM projects)',
      params: [newFlag],
    });
  }
  if (mode === 'disable') {
    s.push(metaDelete('security_enabled'));
    s.push(metaDelete('security_salt'));
    s.push(metaDelete('security_verifier'));
    s.push(metaDelete('security_remembered'));
  } else {
    s.push(metaUpsert('security_salt', newSalt));
    s.push(metaUpsert('security_verifier', newVerifier));
    s.push(metaUpsert('security_enabled', '1'));
    // La contraseña recordada forma parte del MISMO cambio lógico: si se
    // consolidara aparte podría quedar apuntando a una contraseña que ya no
    // vale (o sobrevivir a un cambio que sí se aplicó).
    s.push(remembered && remembered.guardar && remembered.valor
      ? metaUpsert('security_remembered', remembered.valor)
      : metaDelete('security_remembered'));
  }
  return s;
}

// ¿El estado final que describe el journal ESTÁ ya en la base de datos y en
// los archivos? Es la prueba del caso B: un corte posterior a la confirmación.
// Se demuestra por CONTENIDO, nunca por linaje — que la base de datos actual
// descienda de `base_commit_id` no prueba absolutamente nada.
function estadoFinalDelJournalYaAplicado(j) {
  const faltan = [];
  const enabled = getMeta('security_enabled');
  const salt = getMeta('security_salt');
  const verifier = getMeta('security_verifier');
  const remembered = getMeta('security_remembered');

  if (j.mode === 'disable') {
    if (enabled !== null) faltan.push('security_enabled sigue presente');
    if (salt !== null) faltan.push('security_salt sigue presente');
    if (verifier !== null) faltan.push('security_verifier sigue presente');
    if (remembered !== null) faltan.push('security_remembered sigue presente');
  } else {
    if (enabled !== '1') faltan.push('security_enabled no es "1"');
    if (salt !== j.newSalt) faltan.push('security_salt no es el del journal');
    if (verifier !== j.newVerifier) faltan.push('security_verifier no es el del journal');
    const deberiaEstar = j.remembered_final === 'presente';
    if (deberiaEstar !== (remembered !== null)) faltan.push('security_remembered no coincide con el estado final previsto');
  }

  // Las marcas `encrypted` de TODAS las filas afectadas.
  for (const it of j.items) {
    let fila = null;
    if (it.table === 'backups') fila = dbmod.get('SELECT encrypted FROM backups WHERE id=?', [it.rowKey]);
    else if (it.table === 'meeting_preps') fila = dbmod.get('SELECT encrypted FROM meeting_preps WHERE id=?', [it.rowKey]);
    else if (it.table === 'candidate_evals') fila = dbmod.get('SELECT encrypted FROM candidate_evals WHERE project_id=?', [it.rowKey]);
    if (!fila) continue;                       // la fila ya no existe: no prueba nada en contra
    if ((fila.encrypted ? 1 : 0) !== j.newFlag) {
      faltan.push(`${it.table}#${it.rowKey}.encrypted no es ${j.newFlag}`);
      break;
    }
  }

  // Y los archivos: cada item no ausente tiene que ser EXACTAMENTE el nuevo.
  for (const it of j.items) {
    if (it.missing) continue;
    const h = sha256DeArchivo(it.absPath);
    if (!h.existe || h.sha !== it.new_sha256) {
      faltan.push(`"${path.basename(it.absPath)}" no es el archivo re-cifrado esperado`);
      break;
    }
  }
  return { aplicado: faltan.length === 0, faltan };
}

// Estado de UN item deducido de los BYTES, no de la existencia de archivos.
//   'preparado'     -> absPath es el original, .new listo
//   'swap-a-medias' -> absPath no está, .old es el original, .new listo
//   'intercambiado' -> absPath ya es el nuevo
//   'ausente'       -> registrado como missing y sigue sin estar
//   'ajeno'         -> un TERCER hash: alguien lo reescribió por fuera
//   'staging-roto'  -> el .old o el .new no son los bytes que el journal dice
function estadoItemPorHash(it) {
  const a = sha256DeArchivo(it.absPath);
  const o = sha256DeArchivo(rekeyItemPath(it.i, 'old'));
  const nu = sha256DeArchivo(rekeyItemPath(it.i, 'new'));

  if (a.ilegible) return { clase: 'ajeno', detalle: `no se pudo leer "${it.absPath}" (${a.codigo})` };
  if (o.existe && o.sha !== it.original_sha256) return { clase: 'staging-roto', detalle: `el .old de ${it.i} no son los bytes originales` };
  if (nu.existe && nu.sha !== it.new_sha256) return { clase: 'staging-roto', detalle: `el .new de ${it.i} no son los bytes preparados` };

  if (it.missing) {
    if (!a.existe) return { clase: 'ausente' };
    return { clase: 'ajeno', detalle: `"${it.absPath}" estaba registrado como ausente y ahora existe` };
  }

  if (a.existe && a.sha === it.new_sha256) return { clase: 'intercambiado', old: o, nuevo: nu };
  if (a.existe && a.sha === it.original_sha256) {
    if (!nu.existe) return { clase: 'staging-roto', detalle: `falta el .new de ${it.i}` };
    return { clase: 'preparado' };
  }
  if (!a.existe) {
    if (o.existe && nu.existe) return { clase: 'swap-a-medias' };
    return { clase: 'ajeno', detalle: `"${it.absPath}" no está y el staging no puede reponerlo` };
  }
  return { clase: 'ajeno', detalle: `"${it.absPath}" no es ni el original ni el re-cifrado` };
}

// Devuelve { ok:true, migrated, missing, total } o { ok:false, error } con un
// mensaje ya listo para enseñar en la ventana de Seguridad. NUNCA lanza: el
// llamante (security-win:submit) solo tiene que mirar `ok`.
function rekeyAllUserFiles(oldKey, newKey, opts) {
  const mode = (opts && opts.mode) || 'change';
  const newSalt = (opts && opts.newSalt) || null;
  const newVerifier = (opts && opts.newVerifier) || null;
  const remembered = (opts && opts.remembered) || { guardar: false, valor: null };
  const newFlag = newKey ? 1 : 0;

  if (rekeyInProgress) {
    return { ok: false, error: 'Ya hay una operación de Seguridad en curso. Espera a que termine.' };
  }
  // Una sesión con la Seguridad en estado no demostrado no empieza otra
  // operación encima: ni con la clave sin validar, ni tras una vuelta atrás
  // incompleta.
  {
    const b = bloqueoDeSeguridad();
    if (b) return { ok: false, error: b.mensaje + errorCodeSuffix('PS-2004') };
  }

  // A2 bajo A3.3 — PRECONDICIÓN, NO INVENTARIO.
  //
  // El material de una restauración (`previo.enc`, y el rescate si lo hubo) se
  // cifra con la clave VIGENTE, pero NO tiene fila en ninguna tabla, así que
  // `collectRekeyInventory()` no lo ve ni lo re-cifra. Si un rekey corriera con
  // material pendiente, ese archivo quedaría cifrado con una clave que ya no se
  // puede derivar: ilegible para siempre. Es el fallo A1 por un lateral.
  //
  // La salida NO es ampliar el inventario, es excluirse: mientras quede
  // CUALQUIER cosa bajo `.panorama-restauraciones/<action_id>/` —con journal o
  // sin él, que el cleanup a medias también cuenta— el rekey no empieza.
  {
    const rp = rekeyPuedeEmpezar();
    if (!rp.puede) {
      appLog(`Seguridad — no se inicia el re-cifrado: ${rp.motivo}`);
      // C1-A (16 sept 2026): el texto anterior prometía "se resuelva sola" para
      // CUALQUIER material pendiente. Solo es posible cuando la carpeta tiene su
      // journal; sin él, el arranque siguiente se detiene con PS-2006 y la
      // salida es manual. Se dice lo que de verdad va a pasar.
      const sinRegistro = (rp.pendientes || []).some((x) => !Array.isArray(x.archivos) || !x.archivos.includes('journal.json'));
      return {
        ok: false,
        error: rp.clase === 'no-verificable'
          ? 'No se ha podido comprobar si hay una restauración sin terminar. No se ha tocado nada; ' +
            'vuelve a intentarlo.\n\nDetalle: ' + rp.motivo
          : sinRegistro
            ? 'Hay material de una restauración de backup anterior SIN su registro. No se ha tocado nada.\n\n' +
              'Ese material no se puede resolver solo: al volver a abrir, Panorama del Servicio se detendrá con ' +
              'el aviso PS-2006 hasta que alguien revise esa carpeta. No la borres sin revisarla: puede ' +
              'contener la copia del estado anterior del proyecto.' +
              errorCodeSuffix('PS-2006')
            : 'Hay una restauración de backup sin terminar de limpiar. No se ha tocado nada.\n\n' +
              'Cierra y vuelve a abrir Panorama del Servicio: al arrancar se intentará terminar con su ' +
              'registro. Si no se puede demostrar cómo quedó, la aplicación se detendrá con el aviso PS-2006 ' +
              'en vez de seguir. Cambia la contraseña después.' +
              errorCodeSuffix('PS-2006'),
      };
    }
  }

  // EXCLUSIVA DE OPERACIÓN (Bloque 3). No es un latch: es un cerrojo en
  // memoria de db.js para que, mientras esto dura, NINGUNA otra escritura de
  // este proceso (tema, geometría de ventanas, vacuum, guardados, borrados)
  // se cuele entre la preparación, los intercambios y la consolidación.
  // No protege los archivos frente a OTRO equipo: de eso se encargan los
  // hashes por item del journal v2.
  let ex = null;
  try {
    ex = dbmod.tomarExclusiva('seguridad');
  } catch (e) {
    return {
      ok: false,
      error: 'Hay otra operación en curso sobre la base de datos. No se ha tocado nada; espera unos ' +
        'segundos y vuelve a intentarlo.' + errorCodeSuffix('PS-2003'),
    };
  }
  rekeyInProgress = true;

  const staging = rekeyStagingDir();
  let items = [];
  const swapped = [];
  let journal = null;

  try {
    // ---- FASE 1: PREPARE (ningún original se toca) ----------------------
    // NUNCA se borra una carpeta de trabajo preexistente. Si hay una, o bien
    // otra instancia de la app está migrando ahora mismo contra estos mismos
    // datos (rekeyInProgress es una variable de ESTE proceso: la otra
    // instancia no la ve), o bien quedó una migración que la recuperación del
    // arranque no pudo cerrar. Arrasarla se llevaría por delante sus `.old`
    // —los ÚNICOS originales que le quedan a esa operación— y su journal,
    // dejándola a la vez sin vuelta atrás y sin recuperación posible.
    // Demostrado con dos instancias en pruebas: la segunda destruía el
    // trabajo de la primera. Se aborta en vez de borrar.
    //
    // Se aborta también si la carpeta existe SIN journal (resto de una
    // limpieza que no terminó). Aunque ese estado no contiene ninguna
    // migración recuperable, seguir adelante sobre él sí sería peligroso: sus
    // `.old` sobrantes harían que una recuperación posterior creyera que ya
    // se intercambiaron archivos que en realidad no se tocaron.
    //
    // C1-A (16 sept 2026): este comentario y el mensaje decían que "la
    // recuperación del arranque retira sola esos restos". NO es así: con el
    // journal v2, una carpeta de trabajo SIN journal hace que el arranque se
    // detenga con PS-2004 (`recoverInterruptedRekeyIfAny`, rama 'sin-journal'),
    // y así debe seguir — puede contener `.old` que son la única copia de los
    // bytes anteriores. Lo que cambia es que el mensaje ya no lo promete.
    if (fs.existsSync(staging)) {
      const conJournal = fs.existsSync(rekeyJournalPath());
      return {
        ok: false,
        error:
          (conJournal
            ? 'Hay otro cambio de Seguridad en curso o sin resolver sobre estos mismos datos.'
            : 'Ha quedado material de un cambio de Seguridad anterior sin recoger.') +
          ' No se ha tocado nada.\n\n' +
          'Si tienes Panorama del Servicio abierto en otra ventana o en otro equipo contra la misma carpeta ' +
          'de datos, ciérralo antes de reintentarlo.' +
          (conJournal
            ? ' Si no es el caso, cierra esta app y vuelve a abrirla: al arrancar se intentará terminar o ' +
              'deshacer ese cambio con su registro, y si no se puede demostrar cómo quedó, la aplicación se ' +
              'detendrá con el aviso PS-2004 en vez de seguir.\n\n'
            : ' Si no es el caso, esa carpeta NO tiene registro y no se puede resolver sola: al volver a abrir, ' +
              'Panorama del Servicio se detendrá con el aviso PS-2004 hasta que alguien la revise. No la borres ' +
              'sin revisarla: puede contener la única copia de archivos anteriores.\n\n') +
          `Carpeta de trabajo:\n${staging}` +
          errorCodeSuffix('PS-2004'),
      };
    }
    fs.mkdirSync(staging, { recursive: true });
    items = collectRekeyInventory();

    // ---- LA BASE DE LA OPERACIÓN ----------------------------------------
    // Se captura AQUÍ: justo después del inventario y antes de preparar ni un
    // byte. Pertenece al journal y NUNCA se recalcula — recalcularla en una
    // recuperación declararía aceptable precisamente la versión que otro
    // equipo dejó después, que es lo contrario de comprobar algo.
    const baseCommit = dbmod.getCommitActual();
    if (!baseCommit) {
      throw new Error('la base de datos todavía no tiene identidad; no se puede anclar la operación a una versión concreta.');
    }

    journal = {
      v: REKEY_JOURNAL_V,
      startedAt: new Date().toISOString(),
      writer: dbmod.getInstallationId(),
      mode,
      newFlag,
      newSalt,
      newVerifier,
      // El HECHO, nunca el valor: en el staging no entra ningún secreto.
      remembered_final: (mode !== 'disable' && remembered.guardar && remembered.valor) ? 'presente' : 'ausente',
      base_commit_id: baseCommit,
      phase: 'prepare',
      consolidated_commit_id: null,
      items: items.map((it) => ({ i: it.i, table: it.table, rowKey: it.rowKey, absPath: it.absPath, hadFlag: it.hadFlag })),
    };
    const g0 = guardarJournalRekey(journal);
    if (!g0.ok) {
      // Todavía no se ha tocado ningún original: se puede abortar limpio.
      throw new Error('no se pudo dejar constancia durable de la operación: ' + g0.motivo);
    }

    let prepared = 0;
    let missing = 0;
    for (const it of items) {
      let buf = null;
      try {
        buf = fs.readFileSync(it.absPath);
      } catch (eLeer) {
        if ((eLeer && eLeer.code) === 'ENOENT') {
          // Fila con archivo ausente (borrado a mano, carpeta movida...). No es
          // un fallo: mismo criterio tolerante que ya tenía reencryptAllBackups.
          it.missing = true;
          missing++;
          continue;
        }
        // "No se pudo leer" NO es "no está": abortar es lo correcto.
        throw new Error(`no se pudo leer "${it.absPath}" (${(eLeer && eLeer.code) || ''}): ${(eLeer && eLeer.message) || eLeer}`);
      }
      // El hash sale del MISMO buffer que se descifra: dos lecturas separadas
      // podrían ver dos contenidos distintos en una carpeta compartida.
      it.original_sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      it.original_size = buf.length;
      const raw = buf.toString('utf8');

      // Manda el ARCHIVO, no la columna: si no coinciden (fila que dice
      // cifrada sobre un archivo en claro, o al revés), lo que hay en disco
      // es la verdad. Evita abortar por una incoherencia heredada.
      let plain;
      if (securitymod.looksEncrypted(raw)) {
        if (!oldKey) {
          throw new Error(`"${it.absPath}" está cifrado pero no hay clave anterior con la que descifrarlo.`);
        }
        plain = securitymod.decryptString(oldKey, raw);
      } else {
        plain = raw;
      }
      const outPath = rekeyItemPath(it.i, 'new');
      fs.writeFileSync(outPath, newKey ? securitymod.encryptString(newKey, plain) : plain, 'utf8');
      // Ida y vuelta contra lo que de verdad quedó EN DISCO (no contra el
      // buffer en memoria): detecta una escritura truncada o a medias ANTES
      // de tocar el original. Y el hash del `.new` sale de ESOS bytes, no de
      // lo que creíamos haber escrito.
      const bufNew = fs.readFileSync(outPath);
      const readBack = bufNew.toString('utf8');
      const check = newKey ? securitymod.decryptString(newKey, readBack) : readBack;
      if (check !== plain) {
        throw new Error(`la copia re-cifrada de "${it.absPath}" no coincide con el original al releerla.`);
      }
      it.new_sha256 = crypto.createHash('sha256').update(bufNew).digest('hex');
      it.new_size = bufNew.length;
      prepared++;
    }

    // ---- FASE 2: SWAP ---------------------------------------------------
    // El journal pasa a 'swap' CON LOS HASHES y de forma durable ANTES del
    // primer intercambio: a partir de aquí, cualquier recuperación posterior
    // puede demostrar qué bytes esperaba encontrar en cada sitio.
    journal.phase = 'swap';
    journal.items = items.map((it) => ({
      i: it.i, table: it.table, rowKey: it.rowKey, absPath: it.absPath, hadFlag: it.hadFlag,
      missing: !!it.missing,
      original_sha256: it.original_sha256 || null, original_size: it.original_size || 0,
      new_sha256: it.new_sha256 || null, new_size: it.new_size || 0,
    }));
    const g1 = guardarJournalRekey(journal);
    if (!g1.ok) throw new Error('no se pudo actualizar el registro de la operación: ' + g1.motivo);

    for (const it of items) {
      if (it.missing) continue;
      // "El archivo existe" no demuestra que sea EL archivo. En una carpeta
      // compartida, el otro equipo ha podido reescribirlo mientras durábamos.
      const h = sha256DeArchivo(it.absPath);
      if (!h.existe) {
        throw new Error(`"${it.absPath}" desapareció entre la preparación y el intercambio.`);
      }
      if (h.sha === it.new_sha256) continue;                 // ya intercambiado
      if (h.sha !== it.original_sha256) {
        throw new Error(
          `"${it.absPath}" ha cambiado desde que se preparó — probablemente lo ha guardado otro equipo. ` +
          'No se toca.');
      }
      // Se apunta ANTES de mover: si falla el SEGUNDO rename, el original ya
      // está en `.old` y el archivo no está en su sitio. Si no constara aquí,
      // la vuelta atrás lo saltaría y el original se quedaría en la carpeta de
      // trabajo — con el archivo del usuario simplemente ausente.
      swapped.push(it);
      fs.renameSync(it.absPath, rekeyItemPath(it.i, 'old'));
      fs.renameSync(rekeyItemPath(it.i, 'new'), it.absPath);
    }

    // ---- FASE 3+4: UNA SOLA MUTACIÓN DE LA BASE DE DATOS -----------------
    // Marcas `encrypted`, sal, verificador, `security_enabled` y contraseña
    // recordada, en la misma imagen y el mismo rename. Y anclada a la versión
    // sobre la que empezó la operación: si otro equipo publicó algo entretanto,
    // se rechaza en vez de consolidar encima.
    const sentencias = sentenciasDeSeguridad(mode, items, newFlag, newSalt, newVerifier, remembered);
    try {
      dbmod.escribirMultiple(sentencias, { token: ex.token, exigirCommitBase: baseCommit });
    } catch (eMut) {
      if (eMut && eMut.aplicado === true) {
        // POST-CONFIRMACIÓN: el cambio SÍ está en disco. Deshacer los archivos
        // aquí es exactamente lo que dejaría "archivos viejos con sal nueva".
        // No se deshace NADA y esta sesión no continúa.
        securityKey = newKey;
        journal.phase = 'cleanup';
        journal.consolidated_commit_id = eMut.commit || null;
        const gc = guardarJournalRekey(journal);
        appLog(`ERROR PS-2004 — el cambio de Seguridad (${mode}) SÍ se guardó pero no se pudo verificar: ${eMut.message}`);
        return {
          ok: true,
          aplicado: true,
          limpiezaPendiente: true,
          cleanupAnotado: gc.ok,
          migrated: prepared,
          missing,
          total: items.length,
          aviso:
            'El cambio de Seguridad SÍ se ha aplicado: tus archivos y la base de datos ya están con la ' +
            'contraseña nueva. Pero no se ha podido verificar el resultado, así que esta sesión no puede ' +
            'continuar de forma segura.\n\nCierra Panorama del Servicio y vuelve a abrirlo. NO repitas la ' +
            `operación.\n\nTus archivos originales siguen en:\n${staging}\n\nDetalle: ${eMut.message}`,
        };
      }
      throw eMut;
    }
    securityKey = newKey;
    // La operación cerró bien: la clave en memoria y la base de datos vuelven
    // a corresponderse, así que la barrera se levanta.
    seguridadRequiereRevalidacion = false;

    // ---- FASE 5: CLEANUP --------------------------------------------------
    // La marca de cleanup va ANTES de retirar el staging: con ella, un staging
    // sin journal deja de poder confundirse con "residuo de una limpieza".
    journal.phase = 'cleanup';
    journal.consolidated_commit_id = dbmod.getCommitActual();
    guardarJournalRekey(journal);
    removeRekeyStaging();
    appLog(
      `Seguridad — re-cifrado completo (${mode}): ${prepared} archivo(s) migrado(s), ` +
        `${missing} fila(s) sin archivo en disco, ${items.length} en total.`
    );
    return { ok: true, migrated: prepared, missing, total: items.length };
  } catch (e) {
    const detail = String((e && e.message) || e);
    appLog(`Seguridad — re-cifrado (${mode}) abortado: ${detail}`);

    // La base de datos NO se ha tocado: la consolidación es una sola mutación
    // y, si no llegó a confirmar, A3.3 ya restauró la memoria. Por eso aquí no
    // hay nada que deshacer en la base de datos — solo archivos.
    // La decisión de cada archivo sale de sus BYTES, tanto los del destino como
    // los de la copia apartada. Nunca de "existe o no":
    //
    //   destino ILEGIBLE          -> no se puede demostrar qué hay: NO se toca
    //   destino ausente + .old OK -> se repone el original
    //   destino = original        -> no hay nada que deshacer
    //   destino = re-cifrado      -> se deshace el intercambio, PERO solo si el
    //                                `.old` son de verdad los bytes originales
    //   destino = OTRA cosa       -> lo reescribió alguien más: NO se pisa, y su
    //                                original se queda a salvo en `.old`
    //
    // Comprobar el `.old` por hash y no por existencia es lo que impide
    // restaurar encima del archivo del usuario una copia que ya no es la suya.
    let rollbackError = null;
    const anota = (s) => { rollbackError = (rollbackError ? rollbackError + '; ' : '') + s; };
    for (let k = swapped.length - 1; k >= 0; k--) {
      const it = swapped[k];
      try {
        const h = sha256DeArchivo(it.absPath);
        const hOld = sha256DeArchivo(rekeyItemPath(it.i, 'old'));
        const oldValido = hOld.existe && hOld.sha === it.original_sha256;

        if (h.ilegible) {
          anota(`no se pudo leer "${it.absPath}" (${h.codigo}): no se toca, y su original se conserva en la carpeta de trabajo`);
          continue;
        }
        if (!h.existe) {
          if (oldValido) fs.renameSync(rekeyItemPath(it.i, 'old'), it.absPath);
          else if (hOld.existe) anota(`"${it.absPath}" no está y la copia apartada NO son sus bytes originales: se conserva sin restaurar`);
          else anota(`"${it.absPath}" no está y no hay copia del original que reponer`);
          continue;
        }
        if (h.sha === it.original_sha256) continue;            // nunca llegó a cambiarse
        if (h.sha !== it.new_sha256) {
          anota(`"${it.absPath}" fue reescrito desde fuera después del intercambio: se deja tal cual y su ` +
            'original se conserva en la carpeta de trabajo');
          continue;
        }
        if (!oldValido) {
          anota(hOld.existe
            ? `la copia apartada de "${it.absPath}" no son sus bytes originales: no se restaura nada y se conserva todo`
            : `falta el original de "${it.absPath}" en la carpeta de trabajo`);
          continue;
        }
        fs.renameSync(it.absPath, rekeyItemPath(it.i, 'new'));
        fs.renameSync(rekeyItemPath(it.i, 'old'), it.absPath);
      } catch (e3) {
        anota(`no se pudo devolver a su sitio "${it.absPath}" (${String((e3 && e3.message) || e3)})`);
      }
    }
    if (rollbackError) {
      // PROTECCIÓN EFECTIVA TRAS UN ROLLBACK INCOMPLETO.
      //
      // En cuanto el `finally` suelte `rekeyInProgress` y la exclusiva, la app
      // seguiría viva y aceptando guardados — con archivos cuyo estado no se
      // ha podido demostrar y con los únicos originales dentro de la carpeta
      // de trabajo. Hasta ahora no lo impedía nada. Ahora la sesión queda
      // marcada y la barrera de `encryptIfNeeded()` corta los cuatro puntos de
      // guardado, la migración de backups antiguos y cualquier nuevo cambio de
      // Seguridad. No se toca la base de datos: no hace falta, no llegó a
      // mutarse.
      seguridadEnEstadoInconsistente = rollbackError;
      appLog('ERROR PS-2004 — la sesión queda bloqueada para escritura tras una vuelta atrás incompleta: ' + rollbackError);
      // NO se borra el staging: los originales apartados como .old son la
      // única copia que queda de lo que no se pudo devolver a su sitio.
      return {
        ok: false,
        error:
          'La operación falló y la vuelta atrás no se pudo completar del todo. NO vuelvas a cambiar la ' +
          'contraseña ni cierres la app sin revisar esto primero.\n\n' +
          `Fallo original: ${detail}\n\nProblema al deshacer: ${rollbackError}\n\n` +
          `Tus archivos originales siguen a salvo en:\n${staging}` +
          errorCodeSuffix('PS-2004'),
      };
    }
    removeRekeyStaging();
    if (e && e.kind === 'base-cambiada') {
      return {
        ok: false,
        error:
          'Otro equipo guardó cambios mientras se re-cifraban tus archivos, así que la operación se ha ' +
          'deshecho entera: tus archivos, tu contraseña y la base de datos siguen exactamente como ' +
          'estaban.\n\nVuelve a intentarlo — esta vez partirá de la versión actualizada.' +
          errorCodeSuffix('PS-2003'),
      };
    }
    return {
      ok: false,
      error:
        'No se ha cambiado nada: la operación se deshizo por completo y tus archivos, tu contraseña y la ' +
        'base de datos siguen exactamente como estaban. Puedes reintentarlo sin riesgo.\n\n' +
        `Detalle: ${detail}` +
        errorCodeSuffix('PS-2003'),
    };
  } finally {
    rekeyInProgress = false;
    soltarExclusivaConRastro(ex.token, 'la operación de seguridad');
  }
}

// ------------------------------------------------------------------
// A1 — recuperación de un re-cifrado interrumpido de verdad (corte de luz,
// cierre forzado del proceso a mitad). Se llama en app.whenReady() DESPUÉS de
// abrir la base de datos y ANTES del login: la sal y el verificador contra
// los que se validará la contraseña tecleada pueden depender justo de esto.
//
// El estado de cada archivo se deduce del propio sistema de archivos (cuál de
// original/.old/.new existe), no de lo que dijera el journal antes de morir.
// ------------------------------------------------------------------
function recoverInterruptedRekeyIfAny() {
  const staging = rekeyStagingDir();
  const lec = leerJournalRekey();
  if (lec.clase === 'ausente') return null;

  // Fail-closed: ni renames, ni borrados, ni consolidación. Se conserva TODO
  // tal cual y la aplicación no continúa (ver el arranque). La salida de un
  // caso excepcional es manual y conservadora, nunca una deducción.
  const cerrar = (motivo, detalle, extra) => {
    appLog(`ERROR PS-2004 — ${motivo}${detalle ? ': ' + detalle : ''}`);
    return Object.assign({ fallaCerrado: true, mode: (lec.journal && lec.journal.mode) || null, motivo, detalle: detalle || null, staging }, extra || {});
  };

  if (lec.clase === 'sin-journal') {
    // Con el formato v2 el registro vive hasta el final (la marca de limpieza
    // se escribe ANTES de retirar la carpeta), así que su ausencia ya no
    // demuestra "residuo de una limpieza". Y dentro puede haber `.old`, que
    // son la única copia de los bytes anteriores.
    // C1-A: `sinRegistro` solo cambia el TEXTO del aviso de arranque (volver a
    // abrir no lo arregla); el fail-closed es exactamente el mismo.
    return cerrar('hay una carpeta de trabajo de un cambio de Seguridad sin su registro', null, { sinRegistro: true });
  }
  if (lec.clase === 'ilegible') {
    return cerrar('el registro del cambio de Seguridad no se puede leer', lec.motivo);
  }
  if (lec.clase === 'desconocido') {
    return cerrar('el registro del cambio de Seguridad es de una versión que esta app no entiende', lec.motivo);
  }

  if (lec.clase === 'v1') {
    // Formato anterior: sin base_commit_id y sin hashes. Nada de lo que hace
    // falta para demostrar un estado se puede reconstruir a posteriori, así
    // que NUNCA se usa para recuperar. Lo único admisible es retirar una
    // carpeta de trabajo que demostrablemente no llegó a sustituir ningún
    // original: en el algoritmo anterior los `.old` solo los creaba el bucle
    // de intercambio, así que "ningún .old en toda la carpeta" prueba que
    // ningún original se movió. No se deduce nada por fechas.
    const jv1 = lec.journal;
    const sinNingunOld = !hayAlgunOldEnStaging();
    if (sinNingunOld && (jv1.phase === 'prepare' || jv1.phase === 'swap')) {
      appLog(`Seguridad — registro de formato anterior (fase ${jv1.phase}) sin ningún original sustituido: se retira solo la carpeta de trabajo.`);
      removeRekeyStaging();
      return { recovered: false, mode: jv1.mode, formatoAnterior: true };
    }
    return cerrar(
      'un cambio de Seguridad de una versión anterior quedó a medias y ya había apartado archivos originales',
      `fase "${jv1.phase}"; el formato anterior no guarda ni la versión de la base de datos ni las huellas de cada archivo, así que no se puede demostrar el estado`,
      { formatoAnterior: true });
  }

  const j = lec.journal;

  // PROPIEDAD DEL TRABAJO. La carpeta de trabajo vive DENTRO de la carpeta de
  // datos: en una ubicación compartida es la MISMA para los dos equipos. No se
  // termina ni se limpia el trabajo de otro — podría estar ejecutándose ahora
  // mismo, o reanudarse en cuanto ese equipo se encienda.
  const yo = dbmod.getInstallationId();
  if (j.writer && yo && j.writer !== yo) {
    return cerrar('el cambio de Seguridad pendiente lo inició OTRO equipo', `registro de "${j.writer}", este equipo es "${yo}"`, { ajeno: true });
  }

  let ex = null;
  try {
    ex = dbmod.tomarExclusiva('seguridad-recuperacion');
  } catch (e) {
    return cerrar('no se pudo tomar el control exclusivo de la base de datos para recuperar', String((e && e.message) || e));
  }

  try {
    // --- ¿la mutación ya estaba confirmada? -------------------------------
    // 'cleanup' significa que la consolidación confirmó. Y un corte POSTERIOR
    // a la confirmación puede haber impedido escribir esa marca, así que la
    // otra forma de llegar aquí es que la base de datos ya NO esté en la base
    // de la operación. En los dos casos se decide por CONTENIDO: que la base
    // de datos descienda de `base_commit_id` no prueba nada.
    const actual = dbmod.getCommitActual();
    const yaConfirmada = j.phase === 'cleanup' || actual !== j.base_commit_id;

    if (yaConfirmada) {
      const prueba = estadoFinalDelJournalYaAplicado(j);
      if (!prueba.aplicado) {
        return cerrar(
          j.phase === 'cleanup'
            ? 'el cambio de Seguridad decía estar terminado pero la base de datos no lo confirma'
            : 'la base de datos ha cambiado desde que empezó el cambio de Seguridad y no se puede demostrar que ya terminara',
          prueba.faltan.join('; '),
          { casoC: true });
      }
      appLog(`Seguridad — el cambio (${j.mode}) ya estaba aplicado por completo: se retira la carpeta de trabajo sin tocar ningún metadato.`);
      removeRekeyStaging();
      return { recovered: true, mode: j.mode, finished: 0, yaEstaba: true };
    }

    // --- CASO A: la base sigue siendo la de la operación --------------------
    // Estado de cada archivo deducido de sus BYTES, nunca de "existe o no".
    const estados = j.items.map((it) => ({ it, e: estadoItemPorHash(it) }));
    const roto = estados.find((x) => x.e.clase === 'ajeno' || x.e.clase === 'staging-roto');
    if (roto) {
      return cerrar('un archivo del cambio de Seguridad no se corresponde con lo que el registro esperaba', roto.e.detalle, { terceroHash: true });
    }

    // ¿Se llegó a mover ALGÚN original? Solo entonces se puede retirar el
    // trabajo preparado sin perder nada.
    //
    // `swap-a-medias` NO cuenta como "preparado": significa que el original ya
    // está en `<i>.old` y su sitio está vacío. Contarlo entre los pendientes
    // era un error real — con el primer archivo cortado justo entre sus dos
    // renames, la limpieza se llevaba por delante el `.old` (única copia del
    // original) y el `.new`, dejando el archivo del usuario simplemente
    // ausente.
    const noAusentes = estados.filter((x) => x.e.clase !== 'ausente');
    const ningunOriginalMovido = noAusentes.every((x) => x.e.clase === 'preparado');

    if (ningunOriginalMovido) {
      // Murió durante la fase 1: no se había sustituido ni un original. Nada
      // que deshacer, solo retirar el trabajo preparado.
      appLog(`Seguridad — se encontró un re-cifrado (${j.mode}) interrumpido antes de tocar ningún archivo; no había nada que deshacer.`);
      removeRekeyStaging();
      return { recovered: false, mode: j.mode };
    }

    // Ya hay archivos con la clave nueva. Volver atrás exigiría la contraseña
    // ANTERIOR, que aquí no tiene nadie; terminar de aplicar, en cambio, no
    // necesita ninguna clave: solo renombrar lo que quedara a medias y
    // consolidar la sal y el verificador que el journal guardó antes de empezar.
    let finished = 0;
    for (const { it, e } of estados) {
      if (e.clase === 'preparado') {
        fs.renameSync(it.absPath, rekeyItemPath(it.i, 'old'));
        fs.renameSync(rekeyItemPath(it.i, 'new'), it.absPath);
        finished++;
      } else if (e.clase === 'swap-a-medias') {
        fs.renameSync(rekeyItemPath(it.i, 'new'), it.absPath);
        finished++;
      }
    }

    // La recuperación NO tiene la contraseña, así que no puede reponer la
    // contraseña recordada: se borra. Y se deja constancia durable de ello
    // ANTES de consolidar, para que la prueba del "ya estaba aplicado" siga
    // siendo válida si hubiera un segundo corte.
    if (j.remembered_final !== 'ausente') {
      j.remembered_final = 'ausente';
      const gr = guardarJournalRekey(j);
      if (!gr.ok) {
        return cerrar('no se pudo actualizar el registro antes de consolidar', gr.motivo);
      }
    }

    const sentencias = sentenciasDeSeguridad(j.mode, j.items, j.newFlag, j.newSalt, j.newVerifier, { guardar: false, valor: null });
    try {
      dbmod.escribirMultiple(sentencias, { token: ex.token, exigirCommitBase: j.base_commit_id });
    } catch (eMut) {
      if (eMut && eMut.aplicado === true) {
        // Confirmó y falló al verificar: la base de datos YA tiene el estado
        // final. No se deshace nada y la sesión no continúa.
        j.phase = 'cleanup';
        j.consolidated_commit_id = eMut.commit || null;
        guardarJournalRekey(j);
        return cerrar('el cambio de Seguridad se terminó de aplicar pero no se pudo verificar', String(eMut.message), { aplicado: true });
      }
      // A propósito NO se borra el staging: al siguiente arranque se reintenta.
      return cerrar('el re-cifrado interrumpido se terminó en disco pero no se pudo consolidar en la base de datos', String((eMut && eMut.message) || eMut), { finished });
    }

    j.phase = 'cleanup';
    j.consolidated_commit_id = dbmod.getCommitActual();
    guardarJournalRekey(j);
    removeRekeyStaging();
    appLog(`Seguridad — se completó un re-cifrado (${j.mode}) que había quedado interrumpido: ${finished} archivo(s) pendientes terminados.`);
    return { recovered: true, mode: j.mode, finished };
  } catch (e) {
    return cerrar('fallo inesperado al recuperar un cambio de Seguridad interrumpido', String((e && e.message) || e));
  } finally {
    soltarExclusivaConRastro(ex.token, 'la operación de seguridad');
  }
}


// ==================================================================
// BLOQUE 4 — MINI-TRANSACCIÓN ARCHIVO + BASE DE DATOS
//
// El problema: las acciones que guardan contenido del usuario hacen
//   isEncrypted = !!securityKey  ->  writeFileSync(archivo)  ->  dbmod.run(fila)
// y entre la primera línea y la última no hay nada que ate las dos mitades.
// `escribirMultiple()` puede ADOPTAR en silencio la base de datos de otro
// equipo (descendencia lineal, db.js:854), así que la fila puede acabar en una
// base de datos cuya sal ya no corresponde al archivo que acabamos de cifrar —
// y ese archivo no lo abre nadie nunca más.
//
// No existe una transacción atómica real entre SQLite y el sistema de
// archivos. Lo que sí se puede construir es que CADA ventana de corte deje un
// estado DEMOSTRABLE y decidible al arrancar:
//
//   F-1 INVARIANTE  no se inicia nada si hay un journal PROPIO pendiente
//   F0  CAPTURAR    base_commit_id + cifrado + writer + action_id, JUNTOS
//   F1  PREPARAR    tmp durable; new_sha256 de los bytes RELEÍDOS
//   F2  JOURNAL     durable  ---- a partir de aquí se toca el destino ----
//   F3  PUBLICAR    renames con comprobación por hash
//   F4  CONFIRMAR   UNA mutación con exigirCommitBase + la marca de la acción
//   F5  LIMPIAR     borrar .old y journal
//
// La pieza de la que depende todo es la MARCA: `app_meta['acciones_<writer>']`
// se escribe DENTRO de la misma mutación, así que si el proceso muere entre F4
// y F5 la base de datos misma demuestra que la acción se aplicó y la
// recuperación sabe que NO debe deshacer el archivo.
//
// Por qué por writer y no una lista global: una lista global la desalojan las
// acciones de CUALQUIER equipo, y entonces la prueba caduca. Por writer, solo
// nos desalojan nuestras propias acciones posteriores — y el invariante F-1
// garantiza que no hay ninguna mientras quede un journal propio pendiente.
// ==================================================================
// Forma 1 del contrato de acción, para que TODAS las salidas tempranas de las
// cuatro acciones interactivas la usen. `reintentable` distingue "vuelve a
// intentarlo dentro de un momento" de "no insistas".
function accionNoAplicada(error, reintentable) {
  return { ok: false, aplicado: false, reintentable: !!reintentable, error };
}

const ACCIONES_DIR_NAME = '.panorama-acciones';
const ACCIONES_JOURNAL_V = 1;
const ACCIONES_MARCA_MAX = 8;

function accionesDir() {
  return path.join(app.getPath('userData'), ACCIONES_DIR_NAME);
}
function nuevoActionId() {
  // 16 bytes, igual que los commit-id de A3.3. No se inventa otra identidad
  // más débil sin ganar nada.
  return crypto.randomBytes(16).toString('hex');
}
function journalAccionPath(actionId) {
  return path.join(accionesDir(), `${actionId}.json`);
}
function claveMarcaAcciones(writer) {
  return `acciones_${writer}`;
}

// --- la marca dentro de la MISMA mutación ---------------------------------
//
// TRES estados, no dos. "La clave no existe" y "la clave existe pero no se
// puede interpretar" son cosas distintas: confundirlas convertía una marca
// corrupta en "ninguna acción aplicada", y con eso la recuperación deshacía el
// archivo de una acción que SÍ estaba confirmada — justo lo que la marca
// existe para impedir.
function leerMarcaAcciones() {
  const w = dbmod.getInstallationId();
  let v = null;
  try {
    v = getMeta(claveMarcaAcciones(w));
  } catch (e) {
    return { ok: false, noDemostrable: true, motivo: `no se pudo leer la marca (${String((e && e.message) || e)})` };
  }
  if (v === null || v === undefined || v === '') return { ok: true, lista: [] };
  let a = null;
  try { a = JSON.parse(v); } catch (e) {
    return { ok: false, noDemostrable: true, motivo: `la marca no es JSON válido (${String((e && e.message) || e)})` };
  }
  if (!Array.isArray(a) || !a.every((x) => typeof x === 'string')) {
    return { ok: false, noDemostrable: true, motivo: 'la marca no es una lista de identificadores' };
  }
  return { ok: true, lista: a };
}

// 'aplicada' | 'no-aplicada' | 'no-demostrable'
function estadoAccionEnMarca(actionId) {
  const m = leerMarcaAcciones();
  if (!m.ok) return { estado: 'no-demostrable', motivo: m.motivo };
  return { estado: m.lista.indexOf(actionId) >= 0 ? 'aplicada' : 'no-aplicada' };
}
function accionYaAplicada(actionId) {
  return estadoAccionEnMarca(actionId).estado === 'aplicada';
}

// Se construye JUSTO antes de confirmar, sobre la lista vigente.
//
// Si la marca no se puede interpretar se empieza una lista nueva: llegar aquí
// implica que F-1 ya comprobó que NO hay ningún journal propio pendiente, así
// que no hay ninguna prueba que preservar. Queda registrado igualmente.
function sentenciaMarcaAccion(actionId) {
  const w = dbmod.getInstallationId();
  const m = leerMarcaAcciones();
  if (!m.ok) appLog(`Acción — la marca de este equipo no se pudo interpretar (${m.motivo}); se reinicia la lista.`);
  const previas = m.ok ? m.lista : [];
  const lista = [actionId].concat(previas.filter((x) => x !== actionId)).slice(0, ACCIONES_MARCA_MAX);
  return {
    sql: 'INSERT INTO app_meta(key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    params: [claveMarcaAcciones(w), JSON.stringify(lista)],
  };
}

// --- lectura y validación de journals -------------------------------------
// No basta con mirar el nombre del archivo: hay que leerlo y comprobar que
// declara lo mínimo para poder decidir sobre él.
const ACCIONES_TIPOS = new Set(['backup', 'meeting-nuevo', 'meeting-editar', 'candidate-eval', 'migracion-legado']);
const esHex = (s, n) => typeof s === 'string' && s.length === n && /^[0-9a-f]+$/i.test(s);
const esEnteroNoNegativo = (n) => typeof n === 'number' && Number.isInteger(n) && n >= 0;

// VALIDACIÓN CERRADA. Un journal solo sirve como evidencia si está COMPLETO:
// `resolverAccionPendiente()` razona con `modo`, `new_sha256` y
// `original_sha256`, y si llegan como `undefined` las comparaciones por hash
// dejan de significar nada — el peor caso era un journal propio, JSON válido
// pero truncado, con el destino ausente: entraba por la rama de resolución y
// podía acabar borrándose a sí mismo con la evidencia a medias.
//
// EVIDENCIA INCOMPLETA NO ES ESTADO AUSENTE. Nada se reconstruye ni se adivina.
function leerJournalAccion(ruta) {
  let j = null;
  try {
    j = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch (e) {
    return { clase: 'ilegible', ruta, motivo: String((e && e.message) || e) };
  }
  if (!j || typeof j !== 'object' || Array.isArray(j)) {
    return { clase: 'desconocido', ruta, motivo: 'el journal no es un objeto' };
  }
  if (j.v !== ACCIONES_JOURNAL_V) {
    return { clase: 'desconocido', ruta, motivo: `versión ${JSON.stringify(j.v)}` };
  }
  const falta = [];
  if (!esHex(j.action_id, 32)) falta.push('action_id no son 32 hex');
  if (!esHex(j.writer, 32)) falta.push('writer no tiene el formato de un installation-id');
  if (!ACCIONES_TIPOS.has(j.tipo)) falta.push(`tipo desconocido (${JSON.stringify(j.tipo)})`);
  if (!esHex(j.base_commit_id, 32)) falta.push('base_commit_id no es un commit válido');
  if (j.cifrado !== 0 && j.cifrado !== 1) falta.push('cifrado no es 0 ni 1');
  if (typeof j.destino !== 'string' || !j.destino || !path.isAbsolute(j.destino)) falta.push('destino no es una ruta absoluta');
  if (j.modo !== 'nuevo' && j.modo !== 'overwrite') falta.push(`modo no es "nuevo" ni "overwrite" (${JSON.stringify(j.modo)})`);
  if (!esHex(j.new_sha256, 64)) falta.push('new_sha256 no es un SHA-256');
  if (!esEnteroNoNegativo(j.new_size)) falta.push('new_size no es un entero >= 0');
  if (j.fase !== 'publicando') falta.push(`fase inesperada (${JSON.stringify(j.fase)})`);
  if (typeof j.startedAt !== 'string' || !j.startedAt) falta.push('startedAt vacío');
  // Invariantes entre el modo y los datos del original.
  if (j.modo === 'nuevo') {
    if (j.original_sha256 !== null) falta.push('modo "nuevo" con original_sha256');
    if (j.original_size !== 0) falta.push('modo "nuevo" con original_size distinto de 0');
  } else if (j.modo === 'overwrite') {
    if (!esHex(j.original_sha256, 64)) falta.push('modo "overwrite" sin original_sha256 válido');
    if (!esEnteroNoNegativo(j.original_size)) falta.push('modo "overwrite" sin original_size válido');
  }
  if (falta.length) {
    // `writer` se devuelve aparte SOLO si es identificable, para poder decir
    // "es nuestro y está incompleto" sin tratarlo como evidencia.
    return {
      clase: 'incompleto', ruta, motivo: falta.join('; '),
      writerDeclarado: esHex(j.writer, 32) ? j.writer : null,
      destinoDeclarado: (typeof j.destino === 'string' && j.destino) ? j.destino : null,
    };
  }
  return { clase: 'valido', ruta, j };
}

// ENOENT es lo único que demuestra "no hay ningún journal". Cualquier otro
// error (EIO, EACCES, la unidad de red caída un instante) significa "NO SE
// PUEDE SABER", y tratarlo como lista vacía rompía el invariante F-1: se
// permitiría empezar una acción nueva con otra propia pendiente sin resolver.
function journalsDeAcciones() {
  let nombres = [];
  try {
    nombres = fs.readdirSync(accionesDir()).filter((f) => /\.json$/i.test(f));
  } catch (e) {
    const cod = (e && e.code) || '';
    if (cod === 'ENOENT') return { ok: true, entradas: [] };
    return { ok: false, noVerificable: true, codigo: cod, motivo: String((e && e.message) || e) };
  }
  return { ok: true, entradas: nombres.map((f) => leerJournalAccion(path.join(accionesDir(), f))) };
}

// Devuelve los journals propios COMPLETOS y, por separado, los propios que se
// pueden identificar como nuestros pero NO sirven como evidencia. Los segundos
// no se resuelven: bloquean.
function journalsPropiosPendientes() {
  const r = journalsDeAcciones();
  if (!r.ok) return r;
  const yo = dbmod.getInstallationId();
  return {
    ok: true,
    entradas: r.entradas.filter((e) => e.clase === 'valido' && e.j.writer === yo),
    inservibles: r.entradas.filter((e) => e.clase === 'incompleto' && e.writerDeclarado === yo),
  };
}

// ¿Hay un journal de OTRO equipo gobernando ESTE destino?
//
// Diferencia deliberada con el Bloque 3: aquí un journal ajeno NO cierra la
// app. Con la carpeta compartida y un autoguardado cada 15 s, el otro equipo
// tendrá casi siempre uno en vuelo, y cerrar Panorama por eso la haría
// inservible. Pero "ignorar siempre" es demasiado permisivo para las acciones
// que SOBRESCRIBEN: si el otro equipo publicó su versión y cayó antes de
// confirmar, escribir encima destruye su posibilidad de recuperarse. Se
// rechaza SOLO esa acción.
// A3.3/BLOQUE 5 — CABLEADO DEL DOMINIO COMÚN.
//
// Esta función ya no tiene lógica propia: el dominio de ocupación es COMÚN a
// `.panorama-acciones` y `.panorama-borrados`, y vive en `ocupacionComun()`
// (una sola implementación, más abajo). Mantener aquí una copia que solo
// mirase los journals de acción significaba que un backup podía publicarse
// dentro de una carpeta que otro equipo estaba retirando para borrarla.
//
// El comportamiento para las ACCIONES es el mismo de antes: destino puntual,
// se saltan los journals propios (los cubre F-1), y un journal ajeno que no se
// puede interpretar deja el destino indeterminado.
function destinoOcupadoPorOtroEquipo(destino) {
  return ocupacionComun(destino);
}

// --- estado del destino, por BYTES ----------------------------------------
function estadoDestinoAccion(j) {
  const h = sha256DeArchivo(j.destino);
  if (h.ilegible) return { clase: 'ilegible', detalle: `no se pudo leer "${j.destino}" (${h.codigo})` };
  if (!h.existe) return { clase: 'ausente' };
  if (h.sha === j.new_sha256) return { clase: 'publicado' };
  if (j.modo === 'overwrite' && h.sha === j.original_sha256) return { clase: 'original' };
  return { clase: 'ajeno', detalle: `"${j.destino}" no es ni lo que había ni lo que se preparó` };
}

// --- resolución de UN journal propio: CASO A / B / C ----------------------
//
// Se usa en dos sitios con la MISMA lógica: al arrancar, y en F-1 antes de
// iniciar cualquier acción nueva.
function resolverAccionPendiente(j) {
  const tmp = `${j.destino}.tmp-${j.writer}-${j.action_id}`;
  const old = `${j.destino}.old-${j.action_id}`;
  const est = estadoDestinoAccion(j);
  const enMarca = estadoAccionEnMarca(j.action_id);

  const cerrar = (motivo, detalle, extra) => {
    appLog(`ERROR PS-2006 — ${motivo}${detalle ? ': ' + detalle : ''}`);
    return Object.assign({ caso: 'C', ok: false, actionId: j.action_id, motivo, detalle: detalle || null }, extra || {});
  };
  // Un residuo solo se retira si se puede demostrar que es EL NUESTRO.
  //   'retirado'  — no estaba, o era el nuestro y se borró
  //   'ajeno'     — existe pero no son los bytes que esperábamos
  //   'no-se-pudo'— es el nuestro pero el borrado falló
  const retirarResiduo = (ruta, shaEsperado) => {
    const h = sha256DeArchivo(ruta);
    if (h.ilegible) return 'ajeno';
    if (!h.existe) return 'retirado';
    if (shaEsperado === null || shaEsperado === undefined || h.sha !== shaEsperado) return 'ajeno';
    try { fs.unlinkSync(ruta); } catch (e) { return 'no-se-pudo'; }
    return 'retirado';
  };

  // ---------- La marca no se puede interpretar ----------------------------
  // No es "no aplicada": es que no lo sabemos. Deshacer aquí podría tirar una
  // acción confirmada.
  if (enMarca.estado === 'no-demostrable') {
    return cerrar('no se puede saber si un guardado pendiente llegó a aplicarse',
      enMarca.motivo, { clasificacion: 'accion-no-demostrable' });
  }

  // ---------- CASO B: la mutación SÍ se aplicó ----------------------------
  if (enMarca.estado === 'aplicada') {
    // La marca sola NO autoriza a borrar el .old a ciegas: si el destino ya no
    // es el nuestro y nadie puede demostrar que lo sustituyó una acción
    // posterior CONFIRMADA, se conserva todo.
    if (est.clase !== 'publicado') {
      return cerrar(
        'una acción ya aplicada tiene el archivo cambiado desde fuera',
        `${j.destino} (${est.clase}${est.detalle ? ': ' + est.detalle : ''})`,
        { aplicada: true, clasificacion: 'accion-aplicada-destino-cambiado' });
    }
    // Y tampoco se borra el journal si los residuos no son demostrablemente
    // nuestros: perder la relación entre ese `.old` y su acción es perder la
    // única explicación de por qué ese archivo está ahí.
    const rOld = retirarResiduo(old, j.original_sha256);
    const rTmp = retirarResiduo(tmp, j.new_sha256);
    if (rOld !== 'retirado' || rTmp !== 'retirado') {
      return cerrar(
        'una acción aplicada dejó material que no se puede identificar como suyo',
        `.old: ${rOld}, .tmp: ${rTmp}`,
        { aplicada: true, clasificacion: 'residuo-no-demostrable' });
    }
    try { fs.unlinkSync(journalAccionPath(j.action_id)); } catch (e) {
      return cerrar('una acción aplicada quedó con su registro sin poder retirar',
        String((e && e.message) || e), { aplicada: true, clasificacion: 'residuo-no-demostrable' });
    }
    appLog(`Acción ${j.action_id} (${j.tipo}) ya estaba aplicada y su archivo es coherente: limpieza completada.`);
    return { caso: 'B', ok: true, actionId: j.action_id, limpiado: true };
  }

  // ---------- CASO C: el destino no es demostrable -----------------------
  if (est.clase === 'ilegible' || est.clase === 'ajeno') {
    return cerrar('el destino de una acción pendiente no se corresponde con lo que el registro esperaba',
      est.detalle, { clasificacion: 'accion-no-demostrable' });
  }

  // ---------- CASO A: no se aplicó -> vuelta atrás por hash ---------------
  const borrarSiEsNuestro = (ruta, shaEsperado) => {
    const h = sha256DeArchivo(ruta);
    if (h.ilegible) return false;
    if (!h.existe) return true;
    if (h.sha !== shaEsperado) return false;
    try { fs.unlinkSync(ruta); return true; } catch (e) { return false; }
  };
  try {
    if (j.modo === 'nuevo') {
      if (est.clase === 'publicado') {
        if (!borrarSiEsNuestro(j.destino, j.new_sha256)) {
          return cerrar('no se pudo retirar el archivo de una acción que no llegó a confirmarse', j.destino);
        }
      }
      // 'ausente' -> nada que deshacer
    } else {
      const hOld = sha256DeArchivo(old);
      const oldValido = hOld.existe && !hOld.ilegible && hOld.sha === j.original_sha256;
      // Si el journal dice que NO había archivo previo, deshacer es
      // simplemente retirar lo que publicamos: no hay original que reponer y
      // exigir un `.old` sería tratar un primer guardado como si fuera un
      // reemplazo (el caso real del primer candidateEval de un proyecto).
      const noHabiaOriginal = j.original_sha256 === null || j.original_sha256 === undefined;
      if (est.clase === 'publicado') {
        if (noHabiaOriginal) {
          if (!borrarSiEsNuestro(j.destino, j.new_sha256)) {
            return cerrar('no se pudo retirar el archivo de una acción que no llegó a confirmarse', j.destino);
          }
        } else {
          if (!oldValido) {
            return cerrar(hOld.existe
              ? 'la copia apartada de una acción pendiente no son los bytes originales'
              : 'falta la copia del original de una acción pendiente', j.destino);
          }
          fs.renameSync(j.destino, tmp);
          fs.renameSync(old, j.destino);
        }
      } else if (est.clase === 'ausente') {
        // El destino no está: o nunca llegó a publicarse (y no había original),
        // o se quedó entre los dos renames y su original espera en `.old`.
        if (noHabiaOriginal) { /* nada que reponer */ }
        else if (!oldValido) {
          return cerrar('el destino de una acción pendiente no está y no hay original que reponer', j.destino);
        } else {
          fs.renameSync(old, j.destino);
        }
      }
      // 'original' -> nunca se llegó a publicar
    }
  } catch (e) {
    return cerrar('fallo al deshacer una acción pendiente', String((e && e.message) || e));
  }

  if (!borrarSiEsNuestro(tmp, j.new_sha256)) {
    return cerrar('la vuelta atrás dejó un archivo preparado que no se puede identificar', tmp,
      { clasificacion: 'residuo-no-demostrable' });
  }
  try { fs.unlinkSync(journalAccionPath(j.action_id)); } catch (e) {
    return cerrar('la vuelta atrás se completó pero su registro no se pudo retirar',
      String((e && e.message) || e), { clasificacion: 'residuo-no-demostrable' });
  }
  appLog(`Acción ${j.action_id} (${j.tipo}) no llegó a confirmarse: deshecha, el destino queda como estaba.`);
  return { caso: 'A', ok: true, actionId: j.action_id, deshecha: true };
}

// ===========================================================================
// A3.3 / BLOQUE 5 — BORRADOS DESTRUCTIVOS
//
// Protocolo: RETIRAR (cuarentena por rename) → CONFIRMAR (un commit) → PURGAR.
//
// Esta es la ÚNICA implementación: `destinoOcupadoPorOtroEquipo()` del Bloque 4
// delega aquí, y la batería aislada extrae estas mismas funciones. No hay copia
// en el arnés.
// ===========================================================================
const BORRADOS_DIR_NAME = '.panorama-borrados';
const BORRADOS_JOURNAL_V = 1;
const BORRADOS_TIPOS = new Set(['borrar-proyecto', 'borrar-prep', 'purgar-backups']);

function borradosDir() {
  return path.join(app.getPath('userData'), BORRADOS_DIR_NAME);
}
function journalBorradoPath(actionId) {
  return path.join(borradosDir(), `${actionId}.json`);
}
function cuarentenaDe(actionId, i) {
  return path.join(borradosDir(), actionId, 'r' + i);
}

// --- contención, con semántica real de Windows -----------------------------
// Un startsWith() artesanal se equivoca de cuatro formas a la vez: separadores
// distintos, mayúsculas, carpetas hermanas con prefijo común ("…\b" vs "…\bb")
// y travesías con "..".
function estaDentroDe(hijo, padre) {
  const rel = path.relative(path.resolve(padre), path.resolve(hijo));
  if (rel === '') return true;
  if (path.isAbsolute(rel)) return false;
  if (rel === '..' || rel.startsWith('..' + path.sep)) return false;
  return true;
}
function mismaRuta(a, b) {
  return path.resolve(String(a)).toLowerCase() === path.resolve(String(b)).toLowerCase();
}

// --- rutas PURAS: ni mkdir, ni UPDATE implícito ----------------------------
//
// `backupsDirForProject()` NO sirve para preparar un borrado: llama a
// `ensureProjectBackupDirSlug()`, que hace un UPDATE —y por tanto un commit
// A3.3— cuando `backup_dir` es NULL, y además `mkdirSync` el destino. Capturar
// el inventario con eso cambiaría la base sobre la que se ancla el propio
// borrado y recrearía justo lo que se va a retirar.
function slugDeProyectoPuro(row) {
  if (row && row.backup_dir) return String(row.backup_dir);
  return `${row.id}-${slugify(row.name)}`;
}
function rutaBackupsPura(row) {
  return path.join(app.getPath('userData'), 'backups', slugDeProyectoPuro(row));
}
// B1: la hermana pura de `candidateEvalFileForProject()`. Esa materializa
// (ensureProjectBackupDirSlug + mkdirSync); esta solo deriva la ruta, para
// poder LEER desde `projects:list` sin escribir nada.
function rutaEvaluacionPura(row) {
  return path.join(rutaBackupsPura(row), 'evaluacion-candidatos', 'estado.json');
}
function rutaDashboardPura(projectId) {
  return path.join(app.getPath('userData'), 'projects', String(projectId));
}

// --- journal de borrado: VALIDACIÓN CERRADA --------------------------------
// Mismo criterio que el Bloque 4: un JSON parseable pero incompleto NO es
// evidencia. Aquí importa más todavía, porque un journal a medias no puede
// convertirse en permiso para borrar una carpeta de cuarentena.
function leerJournalBorrado(ruta) {
  let j = null;
  try {
    j = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch (e) {
    return { clase: 'ilegible', ruta, motivo: String((e && e.message) || e) };
  }
  if (!j || typeof j !== 'object' || Array.isArray(j)) {
    return { clase: 'desconocido', ruta, motivo: 'el journal no es un objeto' };
  }
  if (j.v !== BORRADOS_JOURNAL_V) {
    return { clase: 'desconocido', ruta, motivo: `versión ${JSON.stringify(j.v)}` };
  }
  const falta = [];
  if (!esHex(j.action_id, 32)) falta.push('action_id no son 32 hex');
  if (!esHex(j.writer, 32)) falta.push('writer no tiene formato de installation-id');
  if (!BORRADOS_TIPOS.has(j.tipo)) falta.push(`tipo desconocido (${JSON.stringify(j.tipo)})`);
  if (!esHex(j.base_commit_id, 32)) falta.push('base_commit_id no es un commit válido');
  if (j.fase !== 'retirando' && j.fase !== 'purgando') falta.push(`fase inesperada (${JSON.stringify(j.fase)})`);
  if (typeof j.startedAt !== 'string' || !j.startedAt) falta.push('startedAt vacío');
  if (!Array.isArray(j.recursos) || j.recursos.length === 0) {
    falta.push('recursos no es un array no vacío');
  } else {
    j.recursos.forEach((r, i) => {
      const p = (m) => falta.push(`recurso[${i}]: ${m}`);
      if (!r || typeof r !== 'object' || Array.isArray(r)) { p('no es un objeto'); return; }
      if (r.tipo !== 'archivo' && r.tipo !== 'directorio') p(`tipo inválido (${JSON.stringify(r.tipo)})`);
      if (r.scope !== 'archivo' && r.scope !== 'subtree') p(`scope inválido (${JSON.stringify(r.scope)})`);
      if (typeof r.origen !== 'string' || !r.origen || !path.isAbsolute(r.origen)) p('origen no es una ruta absoluta');
      if (typeof r.cuarentena !== 'string' || !r.cuarentena || !path.isAbsolute(r.cuarentena)) {
        p('cuarentena no es una ruta absoluta');
      } else if (esHex(j.action_id, 32)) {
        // La cuarentena TIENE que caer bajo .panorama-borrados/<action_id>: si
        // no, un journal manipulado haría que la purga borrase cualquier
        // carpeta del usuario.
        if (!estaDentroDe(r.cuarentena, path.join(borradosDir(), j.action_id))) {
          p('cuarentena fuera de .panorama-borrados/<action_id>');
        }
      }
      if (typeof r.origen === 'string' && typeof r.cuarentena === 'string' && mismaRuta(r.origen, r.cuarentena)) {
        p('origen y cuarentena son la misma ruta');
      }
      if (r.tipo === 'archivo') {
        if (!esHex(r.sha256, 64)) p('archivo sin sha256 válido');
        if (!esEnteroNoNegativo(r.size)) p('archivo sin size válido');
      } else if (r.tipo === 'directorio') {
        if (!esEnteroNoNegativo(r.n_archivos)) p('directorio sin n_archivos válido');
        if (!esEnteroNoNegativo(r.bytes_totales)) p('directorio sin bytes_totales válido');
      }
    });
  }
  // La partición NO es un recurso reversible: si el tipo la declara, tiene que
  // ser un identificador explícito. Nunca se inventa durante la recuperación.
  if (j.particion !== undefined && j.particion !== null) {
    if (typeof j.particion !== 'string' || !j.particion) falta.push('particion declarada pero vacía');
  }
  if (falta.length) {
    return {
      clase: 'incompleto', ruta, motivo: falta.join('; '),
      writerDeclarado: esHex(j.writer, 32) ? j.writer : null,
    };
  }
  return { clase: 'valido', ruta, j };
}

// ENOENT es lo único que demuestra "no hay journals". Cualquier otro error
// significa NO SE PUEDE SABER.
function journalsDeBorrados() {
  let nombres = [];
  try {
    nombres = fs.readdirSync(borradosDir()).filter((f) => /\.json$/i.test(f));
  } catch (e) {
    const cod = (e && e.code) || '';
    if (cod === 'ENOENT') return { ok: true, entradas: [] };
    return { ok: false, noVerificable: true, codigo: cod, motivo: String((e && e.message) || e) };
  }
  return { ok: true, entradas: nombres.map((f) => leerJournalBorrado(path.join(borradosDir(), f))) };
}

// --- DOMINIO DE OCUPACIÓN COMÚN -------------------------------------------
// `.panorama-acciones` y `.panorama-borrados` NO son dos mundos. Cualquier
// pregunta de ocupación mira LOS DOS conjuntos.
function recursosReservados() {
  const acc = journalsDeAcciones();
  if (!acc.ok) return { ok: false, indeterminado: true, motivo: acc.motivo, fuente: 'acciones' };
  const bor = journalsDeBorrados();
  if (!bor.ok) return { ok: false, indeterminado: true, motivo: bor.motivo, fuente: 'borrados' };

  const recursos = [];
  for (const e of acc.entradas) {
    if (e.clase !== 'valido') {
      // No se sabe qué gobierna: indetermina TODO el dominio.
      return { ok: false, indeterminado: true, motivo: e.motivo, ruta: e.ruta, fuente: 'accion' };
    }
    recursos.push({
      fuente: 'accion', writer: e.j.writer, actionId: e.j.action_id,
      scope: 'archivo', origen: e.j.destino, ruta: e.ruta,
    });
  }
  for (const e of bor.entradas) {
    if (e.clase !== 'valido') {
      return { ok: false, indeterminado: true, motivo: e.motivo, ruta: e.ruta, fuente: 'borrado' };
    }
    for (const r of e.j.recursos) {
      recursos.push({
        fuente: 'borrado', writer: e.j.writer, actionId: e.j.action_id,
        scope: r.scope, origen: r.origen, ruta: e.ruta,
      });
    }
  }
  return { ok: true, recursos };
}

function cubreRecurso(r, ruta) {
  if (r.scope === 'archivo') return mismaRuta(ruta, r.origen);
  return estaDentroDe(ruta, r.origen);
}

// La relación es SIMÉTRICA. `cubreRecurso()` responde "¿el recurso reservado
// contiene al que pregunta?", que es lo que necesita una ACCIÓN (destino
// puntual). Pero un BORRADO pregunta por un SUBÁRBOL entero, y ahí el conflicto
// va también al revés: un journal ajeno que gobierna
// `backups/<slug>/evaluacion-candidatos/estado.json` tiene que impedir borrar
// `backups/<slug>`.
function conflictoRecurso(r, ambito) {
  if (cubreRecurso(r, ambito.ruta)) return true;
  if (ambito.scope === 'subtree' && estaDentroDe(r.origen, ambito.ruta)) return true;
  return false;
}

// Misma forma de retorno que el `destinoOcupadoPorOtroEquipo()` original del
// Bloque 4. Sin `scope` se comporta exactamente igual que aquél.
function ocupacionComun(destino, opts) {
  const ambito = { ruta: destino, scope: (opts && opts.scope) === 'subtree' ? 'subtree' : 'archivo' };
  const res = recursosReservados();
  if (!res.ok) return { ocupado: true, indeterminado: true, motivo: res.motivo, ruta: res.ruta };
  const yo = dbmod.getInstallationId();
  for (const r of res.recursos) {
    if (r.writer === yo) continue;          // lo propio lo cubre F-1
    if (conflictoRecurso(r, ambito)) {
      return { ocupado: true, porWriter: r.writer, actionId: r.actionId, fuente: r.fuente, scope: r.scope, origen: r.origen };
    }
  }
  return { ocupado: false };
}

// --- F-1, en sus dos alcances ---------------------------------------------
//
// `f1Borrados()` es la puerta que se pone delante de las ACCIONES: un journal
// de borrado propio pendiente impide empezar un guardado nuevo. No mira los
// journals de acción, porque `ejecutarAccionDeArchivo()` ya los RESUELVE (no
// solo los bloquea) y quitarle eso rompería su recuperación.
//
// CUALQUIER journal de borrado que no se pueda interpretar bloquea, no solo los
// que se identifican como nuestros: si está truncado no se puede leer el
// `writer`, así que no se puede descartar que sea nuestro — y un borrado
// pendiente sin resolver es peor que un guardado. Evidencia incompleta no es
// estado ausente.
function f1Borrados() {
  const bor = journalsDeBorrados();
  if (!bor.ok) {
    return { libre: false, clase: 'no-verificable', motivo: `no se puede comprobar ${BORRADOS_DIR_NAME}: ${bor.motivo}` };
  }
  const yo = dbmod.getInstallationId();
  const pendientes = [];
  for (const e of bor.entradas) {
    if (e.clase === 'valido') {
      if (e.j.writer === yo) pendientes.push({ tipo: 'borrado', ruta: e.ruta, actionId: e.j.action_id });
      continue;
    }
    return {
      libre: false, clase: 'no-demostrable', ruta: e.ruta,
      motivo: `journal de borrado ${e.clase}` +
        (e.writerDeclarado === yo ? ' (propio)' : ' (writer no identificable)') + `: ${e.motivo}`,
    };
  }
  if (pendientes.length) {
    return { libre: false, clase: 'pendiente', pendientes, motivo: `hay ${pendientes.length} borrado(s) propio(s) sin resolver` };
  }
  return { libre: true };
}

// `f1Global()` es la puerta de los BORRADOS: mira los dos conjuntos. Aquí un
// journal de acción propio pendiente BLOQUEA (no se resuelve): empezar a
// destruir con un guardado a medias sin aclarar es exactamente lo que el
// invariante existe para impedir.
function f1Global() {
  const b = f1Borrados();
  if (!b.libre) return b;
  const acc = journalsDeAcciones();
  if (!acc.ok) {
    return { libre: false, clase: 'no-verificable', motivo: `no se puede comprobar ${ACCIONES_DIR_NAME}: ${acc.motivo}` };
  }
  const yo = dbmod.getInstallationId();
  const pendientes = [];
  for (const e of acc.entradas) {
    if (e.clase === 'valido' && e.j.writer === yo) pendientes.push({ tipo: 'accion', ruta: e.ruta, actionId: e.j.action_id });
    else if (e.clase !== 'valido' && (e.writerDeclarado === yo || e.clase === 'ilegible' || e.clase === 'desconocido')) {
      return { libre: false, clase: 'no-demostrable', ruta: e.ruta, motivo: `journal de acción ${e.clase}: ${e.motivo}` };
    }
  }
  if (pendientes.length) {
    return { libre: false, clase: 'pendiente', pendientes, motivo: `hay ${pendientes.length} guardado(s) propio(s) sin resolver` };
  }
  // H-1 — el tercer conjunto. `.panorama-restauraciones` entra en el dominio
  // global igual que los otros dos, pero SOLO por su parte no discriminable:
  // material que no se puede interpretar, que podría ser de cualquier proyecto.
  // Una restauración propia VÁLIDA no se bloquea aquí, sino en su proyecto
  // (`restauracionPendienteDeProyecto`), porque esta puerta no recibe el id y
  // cerrarla entera convertiría un restore pendiente del proyecto 7 en un
  // bloqueo de toda la aplicación. Esa distinción es la que exige H1-4.
  const res = f1Restauraciones();
  if (!res.libre && res.clase !== 'pendiente') return res;
  return { libre: true };
}

// --- inventario, sin efectos colaterales -----------------------------------
function resumirDirectorio(dir) {
  let n = 0; let bytes = 0;
  const rec = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) rec(f);
      else { n++; bytes += fs.statSync(f).size; }
    }
  };
  rec(dir);
  return { n_archivos: n, bytes_totales: bytes };
}
function existeRuta(p) {
  try { fs.statSync(p); return true; } catch (e) { return false; }
}

// --- NO-CLOBBER: la reposición, punto único --------------------------------
//
// MEDIDO en `G:` (el sistema de archivos que la app usa de verdad):
// `rename(cuarentena → destino)` con el destino RECREADO **no falla**, lo
// REEMPLAZA, y el contenido recreado por otro equipo desaparece sin rastro. En
// NTFS local el mismo rename da EPERM. Por tanto la defensa NO PUEDE ser el
// comportamiento del sistema de archivos.
//
// Antes de cualquier rename(cuarentena → origen): si `origen` existe, NO se
// ejecuta el rename. Da igual por qué exista. Se conservan origen, cuarentena y
// journal, y el recurso queda fail-closed. La comprobación va INMEDIATAMENTE
// antes del rename, por recurso — no en una precomprobación al principio de la
// operación, que dejaría TOCTOU.
function reponerRecurso(r) {
  if (!existeRuta(r.cuarentena)) return { estado: 'sin-cuarentena', origen: r.origen };
  if (existeRuta(r.origen)) {
    appLog(`Borrado — NO-CLOBBER: "${r.origen}" ha reaparecido; no se repone y no se destruye nada.`);
    return { estado: 'destino-ocupado', origen: r.origen, cuarentena: r.cuarentena };
  }
  try {
    fs.mkdirSync(path.dirname(r.origen), { recursive: true });
    fs.renameSync(r.cuarentena, r.origen);
  } catch (e) {
    return { estado: 'fallo', origen: r.origen, codigo: (e && e.code) || null, motivo: String((e && e.message) || e) };
  }
  return { estado: 'repuesto', origen: r.origen };
}
function reponerTodo(j) {
  const detalle = j.recursos.map((r) => Object.assign({ recurso: r }, reponerRecurso(r)));
  const malos = detalle.filter((d) => d.estado === 'destino-ocupado' || d.estado === 'fallo');
  return { ok: malos.length === 0, detalle, malos };
}
function purgarTodo(j) {
  // Solo se borra dentro de .panorama-borrados/<action_id>. La validación
  // cerrada ya lo garantiza; se vuelve a comprobar antes de cada rm.
  const raiz = path.join(borradosDir(), j.action_id);
  for (const r of j.recursos) {
    if (!estaDentroDe(r.cuarentena, raiz)) {
      return { ok: false, motivo: `cuarentena fuera de su raíz: ${r.cuarentena}` };
    }
  }
  try { fs.rmSync(raiz, { recursive: true, force: true }); } catch (e) {
    return { ok: false, motivo: String((e && e.message) || e) };
  }
  return { ok: true };
}

// La partición NO es reversible y por eso NO es un recurso del journal: se
// vacía aquí, después del commit, y se reintenta al arrancar si falla.
async function vaciarParticionDe(j) {
  if (!j.particion) return { ok: true };
  try {
    await session.fromPartition(j.particion).clearStorageData();
    return { ok: true };
  } catch (e) {
    appLog(`Borrado — no se pudo vaciar la partición ${j.particion}: ${String((e && e.message) || e)}`);
    return { ok: false, particionPendiente: true, motivo: String((e && e.message) || e) };
  }
}

// Idempotente: se repite al arrancar si quedó a medias.
async function finalizarPurga(j) {
  try {
    const marcado = Object.assign({}, j, { fase: 'purgando' });
    escribirJsonDurable(journalBorradoPath(j.action_id), marcado);
    const p = purgarTodo(marcado);
    if (!p.ok) return { ok: false, motivo: p.motivo };
    const v = await vaciarParticionDe(j);
    if (!v.ok) return v;
    borrarJournalResuelto(journalBorradoPath(j.action_id), 'un borrado');
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: String((e && e.message) || e) };
  }
}

// --- EJECUTAR UN BORRADO ---------------------------------------------------
// Contrato IPC idéntico al del Bloque 4, tres formas:
//   {ok:false, aplicado:false, reintentable, error}
//   {ok:true,  aplicado:true,  verificado:true}
//   {ok:true,  aplicado:true,  verificado:false, requiereReinicio:true, aviso}
async function ejecutarBorrado(opts) {
  const o = opts || {};
  const writer = dbmod.getInstallationId();
  const noAplicado = (error, reintentable, extra) =>
    Object.assign({ ok: false, aplicado: false, reintentable: !!reintentable, error }, extra || {});

  // ---- F-1 GLOBAL ---------------------------------------------------------
  const g = f1Global();
  if (!g.libre) {
    if (g.clase === 'no-verificable') {
      return noAplicado(
        'No se ha podido comprobar si hay una operación anterior sin terminar. No se inicia ninguna ' +
        'nueva hasta poder comprobarlo.\n\nDetalle: ' + g.motivo, true, { bloqueo: 'accion-no-verificable' });
    }
    appLog(`ERROR PS-2006 — borrado no iniciado: ${g.motivo}`);
    return noAplicado(
      'Hay una operación anterior de este equipo sin resolver. No se inicia ninguna nueva hasta ' +
      'aclararlo: cierra la aplicación y revisa el registro.\n\nDetalle: ' + g.motivo,
      false, { bloqueo: 'accion-no-demostrable' });
  }

  // ---- F0: capturar TODO junto, sin efectos colaterales -------------------
  const entrada = Array.isArray(o.recursos) ? o.recursos : [];
  // `permitirSinArchivos` es para el caso legítimo de "la fila existe pero su
  // archivo ya no": el borrado sigue necesitando su commit. No se admite por
  // defecto, para que un caller no acabe borrando filas por descuido sin
  // declarar nada.
  if (!entrada.length && !o.permitirSinArchivos) {
    return noAplicado('Un borrado tiene que declarar al menos un recurso.', false);
  }
  if (!BORRADOS_TIPOS.has(o.tipo)) return noAplicado(`Tipo de borrado desconocido: ${JSON.stringify(o.tipo)}`, false);

  for (const r of entrada) {
    // Un borrado pregunta por su ÁMBITO, no por un punto: si alguien tiene
    // reservado algo DENTRO del subárbol, también hay conflicto.
    const oc = ocupacionComun(r.origen, { scope: r.scope || (r.tipo === 'directorio' ? 'subtree' : 'archivo') });
    if (oc.ocupado) {
      return noAplicado(
        oc.indeterminado
          ? 'Otro equipo dejó una operación sin terminar que no se puede interpretar. No se ha tocado nada; ' +
            'inténtalo de nuevo más tarde.'
          : 'Otro equipo está trabajando ahora mismo sobre estos archivos. No se ha tocado nada; ' +
            'inténtalo de nuevo en unos segundos.',
        true, { bloqueo: 'ocupado-otro-writer', detalleOcupacion: oc });
    }
  }

  const base = dbmod.getCommitActual();
  if (!base) return noAplicado('La base de datos todavía no tiene identidad.', false);
  const actionId = nuevoActionId();

  // Los recursos que no existen se descartan aquí: no tiene sentido reservar ni
  // reponer algo que no está. Un borrado sin nada que retirar sigue necesitando
  // su commit — las filas existen aunque los archivos ya no.
  const recursos = [];
  try {
    entrada.forEach((r, i) => {
      if (!existeRuta(r.origen)) return;
      const d = {
        tipo: r.tipo, scope: r.scope || (r.tipo === 'directorio' ? 'subtree' : 'archivo'),
        origen: path.resolve(r.origen), cuarentena: cuarentenaDe(actionId, i),
      };
      if (r.tipo === 'directorio') Object.assign(d, resumirDirectorio(d.origen));
      else {
        const h = sha256DeArchivo(d.origen);
        if (!h.existe || h.ilegible) throw new Error(`no se pudo leer "${d.origen}"`);
        d.sha256 = h.sha; d.size = h.size;
      }
      recursos.push(d);
    });
  } catch (e) {
    return noAplicado('No se pudo inventariar lo que se va a borrar: ' + String((e && e.message) || e), true);
  }

  const journal = {
    v: BORRADOS_JOURNAL_V, action_id: actionId, writer, tipo: o.tipo,
    base_commit_id: base, fase: 'retirando', startedAt: new Date().toISOString(),
    recursos,
  };
  if (o.particion) journal.particion = String(o.particion);

  // ---- F1: journal durable ANTES de mover nada ----------------------------
  try {
    fs.mkdirSync(borradosDir(), { recursive: true });
    const gj = escribirJsonDurable(journalBorradoPath(actionId), journal);
    if (!gj.ok) throw new Error(gj.motivo);
  } catch (e) {
    borrarJournalResuelto(journalBorradoPath(actionId), 'un borrado');
    return noAplicado('No se pudo registrar la operación antes de borrar: ' + String((e && e.message) || e), true);
  }

  // ---- F2: RETIRAR a cuarentena -------------------------------------------
  try {
    fs.mkdirSync(path.join(borradosDir(), actionId), { recursive: true });
    for (const r of recursos) fs.renameSync(r.origen, r.cuarentena);
  } catch (e) {
    const v = reponerTodo(journal);
    if (!v.ok) {
      appLog(`ERROR PS-2006 — el borrado ${actionId} no se pudo retirar ni deshacer.`);
      return noAplicado(
        'No se pudo retirar lo que se iba a borrar y la vuelta atrás no se pudo completar. No se ha ' +
        'destruido nada: cierra la aplicación y revisa el registro.\n\nDetalle: ' + String((e && e.message) || e),
        false, { bloqueo: 'accion-no-demostrable', actionId, vuelta: v });
    }
    try { fs.rmSync(path.join(borradosDir(), actionId), { recursive: true, force: true }); } catch (e2) {}
    borrarJournalResuelto(journalBorradoPath(actionId), 'un borrado');
    return noAplicado('No se pudo retirar lo que se iba a borrar: ' + String((e && e.message) || e), true);
  }

  // ---- F3: CONFIRMAR — UNA mutación, anclada a la base, con la marca ------
  const sentencias = (o.sentencias ? o.sentencias({ actionId }) : []).slice();
  sentencias.push(sentenciaMarcaAccion(actionId));
  try {
    dbmod.escribirMultiple(sentencias, { exigirCommitBase: base });
  } catch (e) {
    if (e && e.aplicado === true) {
      // POST-confirmación: las filas SÍ se borraron. NO se reponen los
      // archivos: dejaría "fila borrada + archivos presentes" con el usuario
      // creyendo que puede seguir.
      appLog(`ERROR PS-2006 — el borrado ${actionId} (${o.tipo}) SÍ se aplicó pero no se pudo verificar: ${e.message}`);
      return {
        ok: true, aplicado: true, verificado: false, requiereReinicio: true, actionId,
        aviso: 'El borrado SÍ se ha aplicado, pero no se ha podido verificar y esta sesión no puede ' +
          'continuar de forma segura. Cierra Panorama del Servicio y vuelve a abrirlo. NO repitas la ' +
          'operación.\n\nDetalle: ' + String(e.message),
      };
    }
    // PRE-confirmación: la base de datos no se tocó. Se repone todo.
    const v = reponerTodo(journal);
    const reintentable = !!(e && (e.kind === 'base-cambiada' || e.kind === 'conflicto' ||
      e.kind === 'ocupado' || e.kind === 'io'));
    if (!v.ok) {
      appLog(`ERROR PS-2006 — el borrado ${actionId} no se confirmó y la vuelta atrás quedó bloqueada.`);
      return noAplicado(
        'No se borró nada, y además la vuelta atrás no se pudo completar. No se ha destruido nada: ' +
        'cierra la aplicación y revisa el registro.\n\nDetalle: ' + String((e && e.message) || e),
        false, { bloqueo: 'accion-no-demostrable', actionId, vuelta: v });
    }
    try { fs.rmSync(path.join(borradosDir(), actionId), { recursive: true, force: true }); } catch (e2) {}
    borrarJournalResuelto(journalBorradoPath(actionId), 'un borrado');
    return noAplicado(
      e && e.kind === 'base-cambiada'
        ? 'Otro equipo guardó cambios mientras se borraba esto. No se ha modificado nada; vuelve a intentarlo.'
        : 'No se pudo borrar: ' + String((e && e.message) || e),
      reintentable, { actionId });
  }

  // ---- F4: PURGAR (y vaciar la partición, que NO es reversible) -----------
  const purga = await finalizarPurga(journal);
  appLog(`Borrado ${actionId} (${o.tipo}) aplicado${purga.ok ? '' : ' — limpieza pendiente: ' + purga.motivo}.`);
  return { ok: true, aplicado: true, verificado: true, actionId, purga };
}

// --- recuperación al arrancar ---------------------------------------------
async function resolverBorradoPendiente(j) {
  const enMarca = estadoAccionEnMarca(j.action_id);

  // La marca no se puede interpretar: no es "no aplicado", es que no se sabe.
  if (enMarca.estado === 'no-demostrable') {
    appLog(`ERROR PS-2006 — no se puede saber si el borrado ${j.action_id} llegó a aplicarse: ${enMarca.motivo}`);
    return { ok: false, actionId: j.action_id, clase: 'accion-no-demostrable', motivo: enMarca.motivo };
  }
  // CASO B: el commit SÍ se aplicó → no se repone; se purga.
  if (enMarca.estado === 'aplicada') {
    const p = await finalizarPurga(j);
    if (!p.ok) return { ok: false, actionId: j.action_id, clase: 'purga-incompleta', motivo: p.motivo, particionPendiente: !!p.particionPendiente };
    return { ok: true, actionId: j.action_id, caso: 'B', clase: 'purgado' };
  }
  // CASO A: no se aplicó → se repone TODO, con NO-CLOBBER.
  const v = reponerTodo(j);
  if (!v.ok) {
    appLog(`ERROR PS-2006 — el borrado ${j.action_id} no se pudo deshacer por completo; no se destruye nada.`);
    return { ok: false, actionId: j.action_id, caso: 'A', clase: 'rollback-bloqueado', vuelta: v };
  }
  try { fs.rmSync(path.join(borradosDir(), j.action_id), { recursive: true, force: true }); } catch (e) {}
  borrarJournalResuelto(journalBorradoPath(j.action_id), 'un borrado');
  appLog(`Borrado ${j.action_id} (${j.tipo}) no llegó a confirmarse: deshecho, todo queda como estaba.`);
  return { ok: true, actionId: j.action_id, caso: 'A', clase: 'repuesto' };
}

async function recuperarBorradosPendientes() {
  const r = journalsDeBorrados();
  if (!r.ok) return { ok: false, clase: 'no-verificable', motivo: r.motivo, resultados: [], malos: [{ clase: 'no-verificable', motivo: r.motivo }] };
  const yo = dbmod.getInstallationId();
  const resultados = [];
  for (const e of r.entradas) {
    if (e.clase !== 'valido') {
      // Propio e incompleto → fail-closed. Ajeno ilegible → tampoco se toca: no
      // se sabe qué gobierna, y desde luego no se borra.
      appLog(`ERROR PS-2006 — journal de borrado no demostrable (${path.basename(e.ruta)}): ${e.motivo}`);
      resultados.push({ ruta: e.ruta, ok: false, clase: 'journal-no-demostrable', motivo: e.motivo });
      continue;
    }
    if (e.j.writer !== yo) { resultados.push({ ruta: e.ruta, ok: true, clase: 'ajeno' }); continue; }
    resultados.push(await resolverBorradoPendiente(e.j));
  }
  const malos = resultados.filter((x) => !x.ok);
  return { ok: malos.length === 0, resultados, malos };
}

// Recorre TODOS los journals. Se llama al arrancar (junto a la recuperación
// del rekey) y desde F-1.
function recuperarAccionesPendientes() {
  const r = { resueltas: [], fallosCerrados: [], ajenos: 0, ilegiblesAjenos: 0 };
  const lista = journalsDeAcciones();
  if (!lista.ok) {
    // No se puede leer la carpeta: NO se concluye que no haya nada pendiente.
    appLog(`ERROR PS-2006 — no se pudo comprobar si hay guardados pendientes: ${lista.motivo}`);
    r.noVerificable = true;
    r.motivo = lista.motivo;
    r.fallosCerrados.push({ caso: 'C', ok: false, motivo: 'no se pudo leer la carpeta de guardados pendientes', detalle: lista.motivo, clasificacion: 'accion-no-demostrable' });
    return r;
  }
  const yo = dbmod.getInstallationId();
  for (const e of lista.entradas) {
    if (e.clase !== 'valido') {
      // Evidencia incompleta: NO se resuelve, NO se borra nada — ni el journal,
      // ni el tmp, ni el .old, ni el archivo. Si además es demostrablemente
      // nuestro, se registra como fallo cerrado para que el arranque lo trate
      // como tal; si ni eso se puede saber, solo se conserva.
      r.ilegiblesAjenos++;
      appLog(`Acción — journal no interpretable, se conserva sin tocar: ${path.basename(e.ruta)} (${e.motivo})`);
      if (e.writerDeclarado && e.writerDeclarado === yo) {
        r.fallosCerrados.push({
          caso: 'C', ok: false, motivo: 'el registro de un guardado propio está incompleto',
          detalle: e.motivo, clasificacion: 'accion-no-demostrable', ruta: e.ruta,
        });
      }
      continue;
    }
    if (e.j.writer !== yo) { r.ajenos++; continue; }
    const res = resolverAccionPendiente(e.j);
    if (res.ok) r.resueltas.push(res);
    else r.fallosCerrados.push(res);
  }
  if (r.ajenos) appLog(`Acción — ${r.ajenos} journal(es) de otro equipo: se ignoran (no gobiernan nada nuestro).`);
  return r;
}

// ==================================================================
// El helper. `sentencias(ctx)` devuelve las sentencias de BD de ESA acción,
// ya con el flag de cifrado correcto; el helper le añade la marca.
// ==================================================================
function ejecutarAccionDeArchivo(opts) {
  const o = opts || {};
  const destino = o.destino;
  const modo = o.modo === 'overwrite' ? 'overwrite' : 'nuevo';
  const writer = dbmod.getInstallationId();

  const noAplicado = (error, reintentable, extra) =>
    Object.assign({ ok: false, aplicado: false, reintentable: !!reintentable, error }, extra || {});

  // ---- F-1 GLOBAL (Bloque 5): también los BORRADOS propios ---------------
  // La marca `acciones_<writer>` es la misma para guardados y borrados, así que
  // el invariante tiene que mirar los dos conjuntos: un borrado propio
  // pendiente desalojado por los 8 guardados siguientes dejaría la
  // recuperación sin poder decidir si aquel borrado se aplicó.
  //
  // Solo BLOQUEA (no resuelve): resolver un borrado desde aquí significaría
  // mover carpetas en mitad de un guardado.
  {
    const gb = f1Borrados();
    if (!gb.libre) {
      if (gb.clase === 'no-verificable') {
        return noAplicado(
          'No se ha podido comprobar si hay un borrado anterior sin terminar. No se inicia ningún ' +
          'guardado nuevo hasta poder comprobarlo.\n\nDetalle: ' + gb.motivo,
          true, { bloqueo: 'accion-no-verificable' });
      }
      appLog(`ERROR PS-2006 — guardado no iniciado por un borrado pendiente: ${gb.motivo}`);
      return noAplicado(
        'Hay un borrado anterior de este equipo sin resolver. No se inicia ningún guardado nuevo hasta ' +
        'aclararlo: cierra la aplicación y revisa el registro.\n\nDetalle: ' + gb.motivo,
        false, { bloqueo: 'accion-no-demostrable' });
    }
  }

  // ---- F-1: INVARIANTE "journal propio pendiente = ninguna acción nueva" --
  // Sin esto, una acción confirmada cuyo journal no se pudo borrar podría ser
  // desalojada de la marca por nuestras 8 acciones siguientes, y la
  // recuperación deshría un archivo que SÍ estaba confirmado.
  const propios = journalsPropiosPendientes();
  if (!propios.ok) {
    // No se puede ni mirar la carpeta: no se sabe si hay uno pendiente. Empezar
    // aquí rompería el invariante del que depende la prueba de la marca.
    return noAplicado(
      'No se ha podido comprobar si hay un guardado anterior sin terminar. No se inicia ninguno ' +
      'nuevo hasta poder comprobarlo.\n\nDetalle: ' + propios.motivo,
      true, { bloqueo: 'accion-no-verificable' });
  }
  // Un journal PROPIO estructuralmente inválido no se resuelve ni se borra: no
  // se sabe qué pasó, así que tampoco se empieza nada nuevo encima.
  if (propios.inservibles && propios.inservibles.length) {
    const e0 = propios.inservibles[0];
    appLog(`ERROR PS-2006 — hay un guardado propio cuyo registro está incompleto: ${path.basename(e0.ruta)} (${e0.motivo})`);
    return noAplicado(
      'Hay un guardado anterior de este equipo cuyo registro está incompleto y no se puede saber qué ' +
      'pasó con él. No se inicia ninguno nuevo: cierra la aplicación y revisa el registro.',
      false, { bloqueo: 'accion-no-demostrable' });
  }
  for (const e of propios.entradas) {
    const res = resolverAccionPendiente(e.j);
    if (!res.ok) {
      return noAplicado(
        'Hay un guardado anterior de este equipo que no se ha podido resolver con certeza. ' +
        'No se inicia ninguno nuevo hasta aclararlo: cierra la aplicación y revisa el registro.',
        false, { bloqueo: 'accion-no-demostrable', actionIdPendiente: res.actionId });
    }
  }

  // ---- F0: capturar TODO junto ------------------------------------------
  const bloq = bloqueoDeSeguridad();
  if (bloq) return noAplicado(bloq.mensaje, false, { bloqueo: bloq.motivo });

  const ocupado = destinoOcupadoPorOtroEquipo(destino);
  if (ocupado.ocupado) {
    return noAplicado(
      ocupado.indeterminado
        ? 'Otro equipo dejó un guardado sin terminar que no se puede interpretar. No se toca nada; ' +
          'inténtalo de nuevo más tarde.'
        : 'Otro equipo está guardando ahora mismo sobre este mismo archivo. No se ha tocado nada; ' +
          'inténtalo de nuevo en unos segundos.',
      true, { bloqueo: 'ocupado-otro-writer' });
  }

  const base = dbmod.getCommitActual();
  if (!base) return noAplicado('La base de datos todavía no tiene identidad.', false);
  const cifrado = !!securityKey;
  const actionId = nuevoActionId();
  const tmp = `${destino}.tmp-${writer}-${actionId}`;
  const old = `${destino}.old-${actionId}`;

  // ---- F1: preparar el tmp, durable -------------------------------------
  let contenido;
  try {
    contenido = encryptIfNeeded(o.contenidoPlano, cifrado);
  } catch (e) {
    return noAplicado(String((e && e.message) || e), false, { bloqueo: e && e.bloqueoSeguridad });
  }
  let newSha = null, newSize = 0, origSha = null, origSize = 0;
  // El MODO REAL lo decide el helper mirando el disco, no el caller. Un
  // `overwrite` sobre un destino que todavía no existe (el primer guardado de
  // una evaluación de candidatos, por ejemplo) es una creación, y tratarlo
  // como reemplazo haría que la vuelta atrás buscara un `.old` que nunca
  // existió.
  let modoReal = modo;
  try {
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    const g = escribirBufferDurable(tmp, Buffer.from(contenido, 'utf8'));
    if (!g.ok) throw new Error(g.motivo);
    // El hash sale de los bytes RELEÍDOS del disco, no del buffer: así detecta
    // una escritura truncada antes de tocar nada.
    const h = sha256DeArchivo(tmp);
    if (!h.existe) throw new Error('el archivo preparado no se pudo releer');
    newSha = h.sha; newSize = h.size;
    const ho = sha256DeArchivo(destino);
    if (ho.ilegible) throw new Error(`no se pudo leer el archivo actual (${ho.codigo})`);
    if (ho.existe) { origSha = ho.sha; origSize = ho.size; modoReal = 'overwrite'; }
    else modoReal = 'nuevo';
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (e2) {}
    return noAplicado('No se pudo preparar el archivo: ' + String((e && e.message) || e), true);
  }

  // ---- F2: journal durable ANTES de tocar el destino ---------------------
  const journal = {
    v: ACCIONES_JOURNAL_V, action_id: actionId, writer,
    tipo: o.tipo || 'desconocido', base_commit_id: base, cifrado: cifrado ? 1 : 0,
    destino, modo: modoReal, original_sha256: origSha, original_size: origSize,
    new_sha256: newSha, new_size: newSize,
    fase: 'publicando', startedAt: new Date().toISOString(),
  };
  {
    const g = escribirJsonDurable(journalAccionPath(actionId), journal);
    if (!g.ok) {
      try { fs.unlinkSync(tmp); } catch (e) {}
      return noAplicado('No se pudo registrar la operación antes de guardar: ' + g.motivo, true);
    }
  }

  // ---- F3: publicar, con comprobación por hash ---------------------------
  //
  // OJO con el `catch`: entre los dos renames del overwrite el destino puede
  // haber quedado APARTADO. Borrar tmp+journal a ciegas aquí dejaba el archivo
  // del usuario ausente y sin ningún registro con el que reponerlo desde su
  // `.old`. A partir de F2, cualquier fallo se resuelve por la MISMA lógica que
  // al arrancar — o se conserva todo.
  try {
    const est = estadoDestinoAccion(journal);
    if (modoReal === 'nuevo') {
      if (est.clase !== 'ausente') throw new Error('el destino ya existe y debería ser único');
      fs.renameSync(tmp, destino);
    } else if (est.clase === 'publicado') {
      /* ya estaba: idempotencia */
    } else if (est.clase === 'original') {
      fs.renameSync(destino, old);
      fs.renameSync(tmp, destino);
    } else if (est.clase === 'ausente') {
      fs.renameSync(tmp, destino);
    } else {
      throw new Error(est.detalle || 'el archivo actual no es el que se esperaba');
    }
  } catch (e) {
    const vuelta = resolverAccionPendiente(journal);
    if (!vuelta.ok) {
      seguridadEnEstadoInconsistente = vuelta.motivo + (vuelta.detalle ? ': ' + vuelta.detalle : '');
      return noAplicado(
        'No se pudo guardar el archivo y la vuelta atrás no se pudo completar. No se ha destruido nada: ' +
        'cierra la aplicación y revisa el registro antes de seguir.\n\nDetalle: ' + String((e && e.message) || e),
        false, { bloqueo: 'accion-no-demostrable' });
    }
    return noAplicado('No se pudo guardar el archivo: ' + String((e && e.message) || e), true);
  }

  // ---- F4: UNA mutación, anclada a la base, con la marca dentro ----------
  const sentencias = (o.sentencias ? o.sentencias({ cifrado, actionId, destino }) : []).slice();
  sentencias.push(sentenciaMarcaAccion(actionId));
  try {
    dbmod.escribirMultiple(sentencias, { exigirCommitBase: base });
  } catch (e) {
    if (e && e.aplicado === true) {
      // POST-confirmación: la fila SÍ está. NO se deshace el archivo — eso
      // dejaría "fila nueva + archivo viejo", que es el estado prohibido nº 3.
      try { fs.unlinkSync(old); } catch (e2) {}
      borrarJournalResuelto(journalAccionPath(actionId), 'una acción de archivo');
      appLog(`ERROR PS-2006 — la acción ${actionId} (${journal.tipo}) SÍ se guardó pero no se pudo verificar: ${e.message}`);
      return {
        ok: true, aplicado: true, verificado: false, requiereReinicio: true, actionId,
        aviso: 'El cambio SÍ se ha guardado, pero no se ha podido verificar y esta sesión no puede ' +
          'continuar de forma segura. Cierra Panorama del Servicio y vuelve a abrirlo. NO repitas la ' +
          'operación.\n\nDetalle: ' + String(e.message),
      };
    }
    // PRE-confirmación: la base de datos no se tocó. Vuelta atrás por hash.
    const vuelta = resolverAccionPendiente(journal);
    const reintentable = !!(e && (e.kind === 'base-cambiada' || e.kind === 'conflicto' ||
      e.kind === 'ocupado' || e.kind === 'io'));
    if (!vuelta.ok) {
      seguridadEnEstadoInconsistente = vuelta.motivo + (vuelta.detalle ? ': ' + vuelta.detalle : '');
      return noAplicado(
        'No se guardó, y además la vuelta atrás no se pudo completar. No se ha destruido nada: ' +
        'cierra la aplicación y revisa el registro antes de seguir.\n\nDetalle: ' + String((e && e.message) || e),
        false, { bloqueo: 'accion-no-demostrable' });
    }
    return noAplicado(
      e && e.kind === 'base-cambiada'
        ? 'Otro equipo guardó cambios mientras se guardaba esto. No se ha modificado nada; vuelve a intentarlo.'
        : 'No se pudo guardar: ' + String((e && e.message) || e),
      reintentable);
  }

  // ---- F5: limpiar --------------------------------------------------------
  try { fs.unlinkSync(old); } catch (e) {}
  borrarJournalResuelto(journalAccionPath(actionId), 'una acción de archivo');
  return { ok: true, aplicado: true, verificado: true, actionId };
}

// ------------------------------------------------------------------
// Migración única de backups "viejos": versiones anteriores de esta app
// guardaban el JSON completo de cada backup dentro de la propia base de
// datos (columna backups.payload) — el riesgo real de "se satura / va más
// lento con el tiempo" que se pidió evitar. Las filas creadas desde el
// cambio a almacenamiento en archivo (ver migrateSchema() en db.js) ya no
// tienen ese problema, pero una base de datos de una instalación anterior,
// actualizada a esta versión, puede seguir arrastrando filas antiguas con
// el JSON completo metido en `payload`. Esta función las detecta (file_path
// vacío pero payload con contenido) y las vuelca a archivo igual que un
// backup nuevo — si la seguridad ya está desbloqueada en esta sesión, de
// paso quedan cifradas como cualquier otro backup. Se llama una única vez
// al arrancar, después de desbloquear la seguridad (si aplica).
// ------------------------------------------------------------------
function migrateLegacyInlineBackupsToFiles() {
  // Bloque 3: esta migración cifra con `securityKey` por su cuenta, sin pasar
  // por encryptIfNeeded(). Si la Seguridad de la sesión no está validada, no
  // se migra nada: volcar a archivo en claro el contenido de filas antiguas
  // sería exactamente el agujero que cierra la barrera.
  const bloq = bloqueoDeSeguridad();
  if (bloq) {
    appLog('Seguridad — migración de backups antiguos aplazada: ' + bloq.motivo);
    return;
  }
  const rows = dbmod.all(
    `SELECT b.id as backup_id, p.id as pid, p.name, p.backup_dir, b.payload
       FROM backups b JOIN projects p ON p.id = b.project_id
      WHERE (b.file_path IS NULL OR b.file_path='') AND b.payload IS NOT NULL AND b.payload != ''`
  );
  if (rows.length === 0) return;
  let moved = 0;
  // Bloque 4: UNA mini-transacción por fila. Y si una queda en estado no
  // demostrable, la migración se DETIENE — seguir con las siguientes sería
  // escribir más encima de algo que no se sabe cómo quedó.
  for (const r of rows) {
    let dir;
    try {
      dir = backupsDirForProject({ id: r.pid, name: r.name, backup_dir: r.backup_dir });
    } catch (e) {
      appLog('Migración de backups antiguos — no se pudo preparar la carpeta: ' + String((e && e.message) || e));
      break;
    }
    const fileName = `backup_legacy_${r.backup_id}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.json`;
    const res = ejecutarAccionDeArchivo({
      tipo: 'migracion-legado', destino: path.join(dir, fileName),
      contenidoPlano: r.payload, modo: 'nuevo',
      sentencias: ({ cifrado }) => ([{
        sql: 'UPDATE backups SET payload=?, file_path=?, encrypted=? WHERE id=?',
        params: ['', fileName, cifrado ? 1 : 0, r.backup_id],
      }]),
    });
    if (res.ok) { moved++; continue; }
    if (res.bloqueo === 'accion-no-demostrable' || res.reintentable === false) {
      appLog(`ERROR PS-2006 — migración de backups antiguos DETENIDA en la fila ${r.backup_id}: ${res.error}`);
      break;
    }
    appLog(`Migración de backups antiguos — la fila ${r.backup_id} no se pudo migrar (se reintentará): ${res.error}`);
  }
  console.log(`Migración de backups antiguos: ${moved}/${rows.length} movidos a archivo.`);
  // Con las filas ya vacías de contenido, compacta el archivo .sqlite3 en
  // disco para recuperar de verdad el espacio, en vez de dejarlo con huecos.
  try {
    dbmod.vacuum();
  } catch (e) {
    // B3: la migración ocurre una sola vez -> appLog directo, sin dedupe.
    appLog('Migración de backups antiguos — no se pudo compactar la base de datos después: ' + motivoSinRutas(e));
    console.warn('No se pudo compactar la base de datos tras la migración:', e);
  }
}

// ------------------------------------------------------------------
// Elimina un proyecto por completo: cierra su ventana si está abierta, borra
// sus filas de la base de datos, la copia horneada del dashboard, la
// carpeta de backups en disco, y el almacenamiento de su partición de
// Electron (localStorage/IndexedDB/etc — vía session.clearStorageData(), la
// forma correcta de vaciar una partición en vez de andar adivinando rutas
// a mano). Nada de esto se puede deshacer, por eso quien llama a esto ya
// tiene que haber confirmado con el usuario antes.
// ------------------------------------------------------------------
// A3.3/BLOQUE 5 — D1. Antes esto eran DOS commits (`DELETE FROM backups` y
// `DELETE FROM projects`, cada uno su propia reescritura completa del
// `.sqlite3`) con los archivos ya destruidos antes del primero, y encima no
// borraba `meeting_preps` ni `candidate_evals` (P6). Ahora:
//
//   quiesce de ventanas → bloqueo local → captura → journal multi-recurso →
//   retirar a cuarentena → UN commit con los 4 DELETE + la marca → purga y
//   partición SOLO después de confirmar.
//
// Devuelve el contrato de tres formas del Bloque 4, no un booleano.
async function deleteProjectById(id) {
  const row = dbmod.get('SELECT * FROM projects WHERE id=?', [id]);
  if (!row) return { ok: false, aplicado: false, reintentable: false, error: 'El proyecto ya no existe.' };
  // A2: la simetría. Un proyecto no puede estar a la vez en borrado y en
  // restauración: el que llegue segundo no empieza.
  {
    const b = proyectoBloqueadoParaMutar(id);
    if (b) return { ok: false, aplicado: false, reintentable: true, error: b.motivo === 'proyecto-en-borrado' ? 'Ese proyecto ya se está eliminando.' : b.mensaje, bloqueo: b.motivo };
  }

  // ---- 1-3: quiesce de TODAS sus ventanas y bloqueo de reapertura ---------
  // El bloqueo se pone ANTES de cerrar: si se pusiera después, una ventana
  // podría reabrirse en el hueco y escribir sobre lo que estamos a punto de
  // retirar.
  proyectosEnBorrado.add(id);
  try {
    await cerrarVentanasDeProyecto(id);

    // ---- 4-5: captura DESPUÉS del quiesce, con rutas PURAS ---------------
    // Nada de `backupsDirForProject()`: haría un UPDATE (y un commit) si
    // `backup_dir` es NULL, y recrearía la carpeta con mkdir.
    const r = await ejecutarBorrado({
      tipo: 'borrar-proyecto',
      particion: row.partition_name || null,
      recursos: [
        { tipo: 'directorio', scope: 'subtree', origen: rutaBackupsPura(row) },
        { tipo: 'directorio', scope: 'subtree', origen: rutaDashboardPura(id) },
      ],
      // ---- 9: UN SOLO escribirMultiple, con las cuatro tablas ------------
      // `ejecutarBorrado` añade la marca de acción y aplica `exigirCommitBase`.
      sentencias: () => [
        { sql: 'DELETE FROM backups WHERE project_id=?', params: [id] },
        { sql: 'DELETE FROM meeting_preps WHERE project_id=?', params: [id] },
        { sql: 'DELETE FROM candidate_evals WHERE project_id=?', params: [id] },
        { sql: 'DELETE FROM projects WHERE id=?', params: [id] },
      ],
    });
    if (r.aplicado) {
      appLog(`Proyecto ${id} eliminado (acción ${r.actionId}${r.verificado === false ? ', SIN VERIFICAR' : ''}).`);
    }
    return r;
  } finally {
    // ---- 12: el bloqueo local se libera siempre ---------------------------
    // Incluso con `aplicado:true/verificado:false`: la sesión se va a cerrar de
    // todas formas, y dejar el id bloqueado no protege nada más.
    proyectosEnBorrado.delete(id);
  }
}

// A3.3/BLOQUE 5 — D3. Purga de backups antiguos, como operación destructiva
// completa y ACOTADA AL CONJUNTO CAPTURADO.
//
// El conjunto se fija una sola vez, al principio: los `id` concretos que
// sobran. Todo lo que se retira y todo lo que se borra sale de ESA lista, nunca
// de un recuento posterior — si entre medias entra un backup nuevo, no puede
// caer dentro de la purga.
//
// Su fallo NO convierte en fallido el backup que la disparó: devuelve su propio
// resultado y quien la llama lo adjunta aparte.
async function purgarBackupsAntiguos(projectId, dirBackups) {
  try {
    const rows = dbmod.all(
      'SELECT id, file_path FROM backups WHERE project_id=? ORDER BY created_at DESC',
      [projectId]
    );
    if (rows.length <= BACKUP_KEEP) return { ok: true, purgados: 0, motivo: 'nada que purgar' };

    // CONJUNTO CAPTURADO. A partir de aquí no se vuelve a consultar la tabla.
    const sobran = rows.slice(BACKUP_KEEP);
    const ids = sobran.map((b) => b.id);
    const recursos = sobran
      .filter((b) => b.file_path)
      .map((b) => ({ tipo: 'archivo', scope: 'archivo', origen: path.join(dirBackups, b.file_path) }));

    const r = await ejecutarBorrado({
      tipo: 'purgar-backups',
      recursos,
      permitirSinArchivos: true,
      // Un único commit para TODOS los DELETE del conjunto + la marca.
      // Los ids van uno a uno y no por rango ni por `ORDER BY ... LIMIT`:
      // así es imposible que la sentencia alcance una fila que no se capturó.
      sentencias: () => ids.map((bid) => ({ sql: 'DELETE FROM backups WHERE id=?', params: [bid] })),
    });
    if (!r.aplicado) {
      appLog(`Purga de backups NO aplicada (el backup SÍ se guardó): ${r.error}`);
      return { ok: false, aplicado: false, purgados: 0, error: r.error, reintentable: r.reintentable };
    }
    if (r.verificado === false) {
      // Aplicado pero no verificable: NO se deshace nada.
      appLog(`ERROR PS-2006 — la purga de backups ${r.actionId} se aplicó sin poder verificarse.`);
      return { ok: true, aplicado: true, verificado: false, purgados: ids.length, requiereReinicio: true, aviso: r.aviso };
    }
    appLog(`Purga de backups: ${ids.length} retirados (acción ${r.actionId}).`);
    return { ok: true, aplicado: true, verificado: true, purgados: ids.length, actionId: r.actionId };
  } catch (e) {
    appLog('ERROR — mantenimiento de backups falló (el backup SÍ se guardó): ' + String((e && e.message) || e));
    return { ok: false, aplicado: false, purgados: 0, error: String((e && e.message) || e) };
  }
}

// ===========================================================================
// C1-A (16 sept 2026) — INVENTARIO DE RESIDUOS AL ARRANCAR.
//                       LEER → CLASIFICAR → REGISTRAR. Nada más.
//
// Es el "contar y registrar" que aprobaron los Bloques 4 (§9) y 5 (d) y que no
// llegó a implementarse. NO limpia: ni borra, ni mueve, ni aparta a
// cuarentena, ni crea carpetas, ni escribe en la base de datos (usa rutas
// PURAS, nunca `backupsDirForProject`). Deja UNA línea agregada en app.log,
// sin rutas ni nombres de proyecto.
//
// Por qué no borra (diagnóstico C1): "archivo sin fila" NO demuestra "basura".
// Cinco backups reales sin fila nacieron de una sobrescritura entre equipos;
// en una carpeta compartida la fila del otro equipo puede llegar DESPUÉS que
// su archivo; y un `.tmp-fallido-` puede ser la única copia íntegra de un
// cambio. La retirada de lo histórico (C1-B) queda diferida hasta tener
// garantías multi-PC/Drive.
//
// Coste: nombres, listados de directorio y consultas a la BD. No hace `stat`
// por archivo, no calcula hashes, no descifra backups y no entra en las cachés
// de Chromium (de `Partitions` solo mira el primer nivel). El ÚNICO contenido
// que abre es `estado.json`, y solo en los proyectos que tienen algún CV en
// disco: sin él no se puede saber si un CV está referenciado.
// ===========================================================================
const RESIDUO_TMP_BD = /^panorama\.sqlite3(\.gen)?\.tmp-|^panorama\.sqlite3\.gen\.(interrumpido|creacion-fallida|bootstrap-fallido)-/;
const RESIDUO_TMP_ACCION = /\.tmp-[0-9a-f]{32}-[0-9a-f]{32}$/i;
const RESIDUO_OLD_ACCION = /\.old-[0-9a-f]{32}$/i;
const RESIDUO_ESCRIBIENDO = /\.escribiendo-\d+-\d+$/;

// Referencias a CV de un `estado.json`, o null si NO se puede demostrar cuáles
// son (ausente, ilegible, cifrado sin clave validada, formato desconocido).
function referenciasDeCv(ruta, existe, r) {
  if (!existe) return null;   // "no lo veo" no es "no referencia nada"
  let texto;
  try { texto = fs.readFileSync(ruta, 'utf8'); } catch (e) { return null; }
  r.estadosLeidos++;
  if (securitymod.looksEncrypted(texto)) {
    if (!securityKey || bloqueoDeSeguridad()) return null;
    try { texto = securitymod.decryptString(securityKey, texto); } catch (e) { return null; }
    r.estadosDescifrados++;
  }
  let estado = null;
  try { estado = JSON.parse(texto); } catch (e) { return null; }
  if (!estado || !Array.isArray(estado.evaluaciones)) return null;
  return new Set(estado.evaluaciones.map((x) => x && x.cvStoredName).filter(Boolean)
    .map((s) => String(s).toLowerCase()));
}

function inventarioDeResiduos() {
  const r = {
    backupsSinFila: 0, anteriores: 0, intercalados: 0, posteriores: 0, sinPosicion: 0,
    filasSinArchivo: 0, reunionesSinFila: 0, estadosSinFila: 0,
    cvSinReferencia: 0, cvNoDecidibles: 0,
    carpetasSinProyecto: 0, particionesSinProyecto: 0, copiasEmergenciaSinProyecto: 0, filasSinProyecto: 0,
    temporalesBd: 0, temporalesAccion: 0, rescates: 0,
    journalsAjenos: 0, materialPendiente: 0, sondas: 0, parchesPendientes: 0,
    noListables: 0, estadosLeidos: 0, estadosDescifrados: 0,
  };
  // Solo NOMBRES. ENOENT = no hay nada ([]); cualquier otro error = no se
  // puede saber (null), y se cuenta aparte en vez de tratarlo como vacío.
  // `desktop.ini` no es de la app: no se cuenta como nada.
  const listar = (dir) => {
    try {
      return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.name.toLowerCase() !== 'desktop.ini');
    } catch (e) {
      if (e && e.code === 'ENOENT') return [];
      r.noListables++;
      return null;
    }
  };
  const minus = (s) => String(s).toLowerCase();
  const archivos = (ents) => (ents || []).filter((e) => e.isFile());
  const carpetas = (ents) => (ents || []).filter((e) => e.isDirectory());
  const esJson = (e) => e.isFile() && /\.json$/i.test(e.name);
  const deAccion = (n) => RESIDUO_TMP_ACCION.test(n) || RESIDUO_OLD_ACCION.test(n) || RESIDUO_ESCRIBIENDO.test(n);
  // El sello vale para los DOS formatos de nombre: el actual
  // (`backup_<sello>_<hex>.json`) y el de las versiones anteriores, que no
  // llevaba sufijo (`backup_<sello>.json`) — que es el de los huérfanos reales.
  const sello = (n) => {
    const m = /^backup_(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z[._]/i.exec(n);
    return m ? Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`) : NaN;
  };
  const ud = app.getPath('userData');

  // --- raíz de la carpeta de datos ------------------------------------------
  for (const e of archivos(listar(ud))) {
    if (RESIDUO_TMP_BD.test(e.name)) r.temporalesBd++;
    else if (e.name.startsWith('.panorama-write-check-')) r.sondas++;
    else if (/^patch-pending-.*\.asar$/i.test(e.name)) r.parchesPendientes++;
    else if (RESIDUO_ESCRIBIENDO.test(e.name)) r.temporalesAccion++;
  }

  // --- lo que las cuatro recuperaciones NO han resuelto ----------------------
  // Si el arranque ha llegado hasta aquí, lo PROPIO ya está resuelto: lo que
  // queda es de otro equipo o material que no gobierna nadie. Por nombre; no
  // se abre ningún journal.
  for (const dir of [accionesDir(), borradosDir()]) {
    const ents = listar(dir) || [];
    r.journalsAjenos += ents.filter(esJson).length;
    r.materialPendiente += ents.filter((e) => !esJson(e)).length;
  }
  r.materialPendiente += (listar(restauracionesDir()) || []).length;
  if (fs.existsSync(rekeyStagingDir())) r.materialPendiente++;

  // --- base de datos (solo lectura) ------------------------------------------
  const proyectos = dbmod.all('SELECT id, name, backup_dir, partition_name FROM projects');
  for (const t of ['backups', 'meeting_preps', 'candidate_evals']) {
    r.filasSinProyecto += dbmod.get(`SELECT COUNT(*) AS c FROM ${t} WHERE project_id NOT IN (SELECT id FROM projects)`).c;
  }
  const slugs = new Set(proyectos.map((p) => minus(slugDeProyectoPuro(p))));
  const ids = new Set(proyectos.map((p) => String(p.id)));
  const particiones = new Set(proyectos.map((p) => minus(String(p.partition_name || '').replace(/^persist:/, ''))));

  r.carpetasSinProyecto += carpetas(listar(path.join(ud, 'backups'))).filter((e) => !slugs.has(minus(e.name))).length;
  r.carpetasSinProyecto += carpetas(listar(path.join(ud, 'projects'))).filter((e) => !ids.has(e.name)).length;
  // De `Partitions` SOLO el primer nivel: las cachés de Chromium no se recorren.
  r.particionesSinProyecto = carpetas(listar(path.join(ud, 'Partitions'))).filter((e) => !particiones.has(minus(e.name))).length;
  r.copiasEmergenciaSinProyecto = carpetas(listar(path.join(app.getPath('appData'), 'panorama-app-safety-backups')))
    .filter((e) => !slugs.has(minus(e.name))).length;

  // --- por proyecto: archivo <-> fila, por NOMBRE ----------------------------
  for (const p of proyectos) {
    const base = path.join(ud, 'backups', slugDeProyectoPuro(p));

    const filas = dbmod.all("SELECT created_at, file_path FROM backups WHERE project_id=? AND file_path IS NOT NULL AND file_path != ''", [p.id]);
    const conFila = new Set(filas.map((f) => minus(f.file_path)));
    const tiempos = filas.map((f) => Date.parse(f.created_at)).filter(Number.isFinite);
    const tMin = tiempos.length ? Math.min(...tiempos) : NaN;
    const tMax = tiempos.length ? Math.max(...tiempos) : NaN;
    const ents = listar(base);
    for (const e of archivos(ents)) {
      if (deAccion(e.name)) { r.temporalesAccion++; continue; }
      if (/^rescate-restauracion-/i.test(e.name)) { r.rescates++; continue; }
      if (!/^backup_.*\.json$/i.test(e.name) || conFila.has(minus(e.name))) continue;
      // Posición respecto a las filas de su proyecto: un huérfano ANTERIOR a
      // todas es un resto de purga; uno INTERCALADO perdió su fila por otra vía.
      r.backupsSinFila++;
      const t = sello(e.name);
      if (!Number.isFinite(t) || !Number.isFinite(tMin)) r.sinPosicion++;
      else if (t < tMin) r.anteriores++;
      else if (t > tMax) r.posteriores++;
      else r.intercalados++;
    }
    if (ents !== null) {
      const enDisco = new Set(archivos(ents).map((e) => minus(e.name)));
      r.filasSinArchivo += [...conFila].filter((n) => !enDisco.has(n)).length;
    }

    const reu = listar(path.join(base, 'reuniones'));
    const conFilaR = new Set(dbmod.all('SELECT file_path FROM meeting_preps WHERE project_id=?', [p.id]).map((f) => minus(f.file_path)));
    for (const e of archivos(reu)) {
      if (deAccion(e.name)) r.temporalesAccion++;
      else if (/^reunion_.*\.json$/i.test(e.name) && !conFilaR.has(minus(e.name))) r.reunionesSinFila++;
    }
    if (reu !== null) {
      const enDiscoR = new Set(archivos(reu).map((e) => minus(e.name)));
      r.filasSinArchivo += [...conFilaR].filter((n) => !enDiscoR.has(n)).length;
    }

    const dirEval = path.join(base, 'evaluacion-candidatos');
    const ev = listar(dirEval);
    const filaEval = dbmod.get('SELECT project_id FROM candidate_evals WHERE project_id=?', [p.id]);
    const hayEstado = archivos(ev).some((e) => e.name === 'estado.json');
    for (const e of archivos(ev)) if (deAccion(e.name)) r.temporalesAccion++;
    if (hayEstado && !filaEval) r.estadosSinFila++;
    if (ev !== null && filaEval && !hayEstado) r.filasSinArchivo++;

    const cvs = archivos(listar(path.join(dirEval, 'cv')));
    if (!cvs.length) continue;
    const refs = referenciasDeCv(path.join(dirEval, 'estado.json'), hayEstado, r);
    if (!refs) { r.cvNoDecidibles += cvs.length; continue; }
    r.cvSinReferencia += cvs.filter((e) => !refs.has(minus(e.name))).length;
  }
  return r;
}

// Nunca lanza: un inventario que falla no puede impedir abrir la aplicación.
function registrarInventarioDeResiduos() {
  const t0 = Date.now();
  let r = null;
  try {
    r = inventarioDeResiduos();
  } catch (e) {
    appLog('Residuos — el inventario del arranque no se pudo completar; no se ha tocado nada: ' + motivoSinRutas(e));
    return null;
  }
  r.ms = Date.now() - t0;
  appLog(
    'Residuos — inventario del arranque (solo lectura; no se ha borrado ni movido nada): ' +
    `backupsSinFila=${r.backupsSinFila} [anteriores=${r.anteriores} intercalados=${r.intercalados} ` +
    `posteriores=${r.posteriores} sinPosicion=${r.sinPosicion}], filasSinArchivo=${r.filasSinArchivo}, ` +
    `reunionesSinFila=${r.reunionesSinFila}, estadosSinFila=${r.estadosSinFila}, ` +
    `cvSinReferencia=${r.cvSinReferencia}, cvNoDecidibles=${r.cvNoDecidibles}, ` +
    `carpetasSinProyecto=${r.carpetasSinProyecto}, particionesSinProyecto=${r.particionesSinProyecto}, ` +
    `copiasEmergenciaSinProyecto=${r.copiasEmergenciaSinProyecto}, filasSinProyecto=${r.filasSinProyecto}, ` +
    `temporalesBd=${r.temporalesBd}, temporalesAccion=${r.temporalesAccion}, rescates=${r.rescates}, ` +
    `journalsAjenos=${r.journalsAjenos}, materialPendiente=${r.materialPendiente}, sondas=${r.sondas}, ` +
    `parchesPendientes=${r.parchesPendientes}, noListables=${r.noListables} (${r.ms} ms)`);
  return r;
}

// Los dos menús nativos que llaman a `deleteProjectById` decidían por nada:
// ignoraban el retorno. Con el contrato de tres formas hay que distinguirlas, y
// sobre todo NO invitar a repetir una operación que SÍ se aplicó.
async function avisarResultadoBorradoProyecto(winOriginal, r, nombre) {
  // La ventana desde la que se pidió el borrado es normalmente la del propio
  // proyecto, y a estas alturas ya está cerrada. Si es así, el aviso va al
  // lanzador: un fallo de borrado no puede quedarse sin destinatario.
  let win = winOriginal;
  if (!win || win.isDestroyed()) win = (launcherWin && !launcherWin.isDestroyed()) ? launcherWin : null;
  if (!r || r.aplicado !== true) {
    await modalAlert(win, (r && r.error) || 'No se ha podido eliminar el proyecto.',
      { title: `No se ha eliminado "${nombre || 'el proyecto'}"`, danger: true });
    return;
  }
  if (r.verificado === false) {
    await modalAlert(win, r.aviso || 'El proyecto SÍ se ha eliminado, pero no se ha podido verificar. ' +
      'Cierra Panorama del Servicio y vuelve a abrirlo. NO repitas la operación.',
      { title: 'Hay que reiniciar la aplicación', danger: true });
  }
}

// Cierra las tres ventanas posibles de un proyecto y espera a que terminen.
//
// El cierre se difiere un tick con setImmediate porque esta función se llama
// normalmente desde el click de "Eliminar este proyecto..." — el menú nativo de
// ESA MISMA ventana —, y destruirla de forma síncrona en mitad del evento de
// menú termina el proceso en seco (SIGSEGV, visto en pruebas).
async function cerrarVentanasDeProyecto(id, opciones) {
  const o = opciones || {};
  const cerradas = [];
  const noConfirmadas = [];
  const mapas = [projectWindows, meetingPrepWindows, candidateEvalWindows];
  for (const mapa of mapas) {
    if (!mapa.has(id)) continue;
    const w = mapa.get(id);
    mapa.delete(id);
    if (!w || w.isDestroyed()) continue;
    // A2: cerrar POR RESTAURACIÓN no es un cierre normal. La marca hace que
    // `attachFlushOnClose` no pida el guardado final y que el recuperador de
    // renderers caídos no ofrezca recargar. Lo que impide de raíz la escritura
    // es la barrera en los IPC; esto evita además esperar 4 s por un guardado
    // que se va a rechazar igualmente.
    if (o.porRestauracion) w.__panoramaClosingForRestore = true;
    const confirmada = await new Promise((resolve) => {
      let hecho = false;
      const fin = (v) => { if (!hecho) { hecho = true; resolve(v); } };
      w.once('closed', () => fin(true));
      setImmediate(() => {
        if (!w.isDestroyed()) w.close();
        else fin(true);
      });
      // Red de seguridad: una ventana que se niega a cerrarse no puede dejar la
      // operación colgada para siempre. Pero el tope NO es una confirmación:
      // se resuelve a `false` y quien llama decide.
      setTimeout(() => fin(false), 8000);
    });
    if (confirmada) cerradas.push(w);
    else {
      // A2: aquí está la diferencia con el borrado. `deleteProjectById` puede
      // seguir (sus archivos se retiran con rename y el commit va anclado),
      // pero una RESTAURACIÓN no: reescribiría el localStorage por debajo de
      // una ventana que sigue viva. Se informa y que decida el llamador.
      appLog(`Aviso: la ventana del proyecto ${id} no confirmó su cierre en 8 s.`);
      noConfirmadas.push(w);
      // Se devuelve al mapa: sigue viva, y borrarla del registro dejaría a la
      // app sin poder encontrarla (que es justo el patrón de P2).
      mapa.set(id, w);
    }
  }
  return { cerradas: cerradas.length, noConfirmadas: noConfirmadas.length };
}

// ------------------------------------------------------------------
// Ventana modal de seguridad (login al arrancar / activar / cambiar
// contraseña / desactivar) — una sola ventana pequeña reutilizada para los
// cuatro casos (ver security-window/), distinguidos por `mode`. Toda la
// lógica (comprobar la contraseña actual, derivar claves, volver a cifrar
// los backups) vive en el handler IPC 'security-win:submit' de más abajo,
// no aquí: openSecurityWindow solo abre la ventana y espera su resultado.
// Devuelve una promesa que resuelve a `true` si se completó la operación, o
// `false` si el usuario canceló/cerró la ventana.
// ------------------------------------------------------------------
async function openSecurityWindow(mode, parentWin) {
  // ------------------------------------------------------------------
  // A3 — GUARDA MÍNIMA MULTI-PC (auditoría 2026-09-13).
  //
  // El cerrojo de instancia única de arriba solo cubre ESTE equipo. Con la
  // carpeta de datos compartida por Drive/OneDrive, otro PC puede tenerla
  // abierta a la vez, y su base de datos en memoria (imagen completa, ver
  // persist() en db.js) reescribiría la sal y el verificador recién
  // consolidados aquí: los archivos quedarían cifrados con una clave que ya
  // no se puede derivar. Es pérdida permanente y silenciosa.
  //
  // No hay forma fiable de detectarlo desde aquí: Drive sincroniza bytes con
  // latencia y no arbitra bloqueos entre máquinas, así que cualquier cerrojo
  // basado en archivos es "mejor esfuerzo" (el .panorama-lock.json que ya
  // existe es solo un aviso descartable, y se deja como está a propósito).
  // Mientras no haya algo mejor, lo honesto es no fingir una comprobación que
  // no se puede hacer: se avisa con claridad y se exige una confirmación
  // explícita antes de tocar nada. Solo para las 3 operaciones que re-cifran
  // archivos — el login normal no se toca.
  // ------------------------------------------------------------------
  if (mode !== 'login' && isUsingSharedDataLocationNow()) {
    const ok = await modalConfirm(
      parentWin || launcherWin,
      'Tu carpeta de datos está marcada como COMPARTIDA entre varios equipos (Google Drive, OneDrive...).\n\n' +
        'Esta operación vuelve a cifrar todos los backups, preparaciones de reunión y evaluaciones de ' +
        'candidatos. Si Panorama del Servicio está abierto en otro equipo mientras se hace, ese equipo puede ' +
        'deshacer el cambio por debajo y dejar los archivos cifrados con una contraseña que ya no existe. ' +
        'Eso NO se puede recuperar.\n\n' +
        'La app no tiene forma de comprobar por sí sola si está abierta en otro sitio: tienes que ' +
        'asegurarte tú.\n\n' +
        '¿Confirmas que Panorama del Servicio está CERRADO en todos los demás equipos?',
      {
        title: 'Ciérralo primero en los demás equipos',
        confirmLabel: 'Sí, está cerrado en los demás',
        cancelLabel: 'Cancelar',
        danger: true,
        icon: '⚠️',
      }
    );
    if (!ok) return false;
  }
  return new Promise((resolve) => {
    pendingSecurityResolve = resolve;
    securityWin = new BrowserWindow({
      width: 420,
      height: mode === 'login' || mode === 'disable' ? 300 : 400,
      resizable: false,
      minimizable: false,
      maximizable: false,
      modal: !!parentWin,
      parent: parentWin || undefined,
      title: 'Panorama del Servicio — Seguridad',
      icon: APP_ICON_PATH,
      // v2.0.16 — mismo tratamiento que el lanzador, pero sin botones de
      // minimizar/maximizar (esta ventana ya no se podía minimizar/maximizar
      // con marco nativo tampoco — minimizable/maximizable:false arriba — la
      // barra propia solo lleva título + cerrar).
      frame: false,
      // show:false + 'ready-to-show', igual que el listado de proyectos (ver
      // createLauncherWindow): esta ventana se crea con show:true por
      // defecto, así que aparecía en pantalla YA, en blanco, antes incluso de
      // tener contenido — y al ser la primera ventana real cuando la
      // Seguridad está activada, tapaba la de "Iniciando…" nada más crearse
      // (mucho antes de que esta terminase de cargar), dejándola sin
      // oportunidad de mostrarse ni un instante. Con esto, la de "Iniciando…"
      // se cierra justo en el momento en que esta ya tiene algo pintado que
      // enseñar, no antes.
      show: false,
      backgroundColor: '#0a0e13',
      webPreferences: {
        preload: path.join(__dirname, 'preload-security.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    aplicarPoliticaDeNavegacion(securityWin.webContents, 'seguridad'); // F3
  securityWin.loadFile(path.join(__dirname, 'security-window', 'index.html'));
    securityWin.webContents.once('did-finish-load', () => {
      if (securityWin && !securityWin.isDestroyed()) {
        securityWin.webContents.send('security-win:init', {
          mode,
          canRemember: safeStorage.isEncryptionAvailable(),
        });
      }
    });
    securityWin.once('ready-to-show', () => {
      // No-op si ya estaba cerrada (siempre lo estará salvo la primera vez
      // que esta ventana se abre justo al arrancar la app, para pedir el
      // login) — ver showSplashWindow.
      closeSplashWindow(() => {
        if (securityWin && !securityWin.isDestroyed()) securityWin.show();
      });
    });
    securityWin.on('closed', () => {
      securityWin = null;
      if (pendingSecurityResolve) {
        const r = pendingSecurityResolve;
        pendingSecurityResolve = null;
        r(false);
      }
    });
  });
}

// ------------------------------------------------------------------
// Ventanita genérica para pedir UNA contraseña suelta (no la de la
// Seguridad de la app, que ya tiene su propia ventana arriba) — se usa para
// descifrar un .json "portable" cifrado con el cifrado de backups del
// propio dashboard al importarlo desde "Nuevo proyecto" (ver
// parseAndDecryptImportedProjectJson). Devuelve la contraseña tecleada, o
// null si el usuario cancela o cierra la ventana.
// ------------------------------------------------------------------
let passwordPromptWin = null;
let pendingPasswordPromptResolve = null;

function promptForPassword(parentWin, message) {
  return new Promise((resolve) => {
    pendingPasswordPromptResolve = resolve;
    passwordPromptWin = new BrowserWindow({
      width: 420,
      height: 230,
      resizable: false,
      minimizable: false,
      maximizable: false,
      modal: !!parentWin,
      parent: parentWin || undefined,
      title: 'Panorama del Servicio — Contraseña',
      icon: APP_ICON_PATH,
      // v2.0.16 — mismo tratamiento que Seguridad: sin marco nativo, barra
      // propia solo con título + cerrar (tampoco se podía minimizar/
      // maximizar con marco nativo).
      frame: false,
      // v2.0.17 — ver la nota junto a este mismo bloque en openSecurityWindow
      // (misma idea, sin el cierre del splash: esta ventana nunca es la
      // primera en abrirse al arrancar la app).
      show: false,
      backgroundColor: '#0a0e13',
      webPreferences: {
        preload: path.join(__dirname, 'preload-password-prompt.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    aplicarPoliticaDeNavegacion(passwordPromptWin.webContents, 'contrasena'); // F3
  passwordPromptWin.loadFile(path.join(__dirname, 'launcher', 'password-prompt.html'));
    passwordPromptWin.once('ready-to-show', () => {
      if (passwordPromptWin && !passwordPromptWin.isDestroyed()) passwordPromptWin.show();
    });
    passwordPromptWin.webContents.once('did-finish-load', () => {
      if (passwordPromptWin && !passwordPromptWin.isDestroyed()) {
        passwordPromptWin.webContents.send('password-prompt:init', { message });
      }
    });
    passwordPromptWin.on('closed', () => {
      passwordPromptWin = null;
      if (pendingPasswordPromptResolve) {
        const r = pendingPasswordPromptResolve;
        pendingPasswordPromptResolve = null;
        r(null);
      }
    });
  });
}

function refreshAllMenus() {
  if (launcherWin && !launcherWin.isDestroyed()) launcherWin.setMenu(buildLauncherMenu());
  for (const w of projectWindows.values()) {
    if (!w.isDestroyed()) {
      const id = [...projectWindows.entries()].find(([, win]) => win === w)?.[0];
      if (id !== undefined) w.setMenu(buildProjectMenu(id));
    }
  }
}

// Cierra la ventana de seguridad y resuelve su promesa a `true` (operación
// completada). Se pone `pendingSecurityResolve` a null ANTES de cerrar la
// ventana a propósito: el listener 'closed' de openSecurityWindow también
// resuelve la promesa (a `false`, por si el usuario cierra con la X), y así
// se evita que dispare una segunda vez sobre una promesa ya resuelta.
function finishSecurityWindow() {
  const resolveFn = pendingSecurityResolve;
  pendingSecurityResolve = null;
  if (securityWin && !securityWin.isDestroyed()) securityWin.close();
  if (resolveFn) resolveFn(true);
}

// "Recordar en este equipo": la contraseña en claro se cifra con
// `safeStorage` (respaldado por el almacén de credenciales del sistema
// operativo — DPAPI en Windows) y SOLO entonces se guarda en app_meta. Sin
// safeStorage disponible (equipos sin ese soporte) simplemente no se ofrece
// la opción — ver `canRemember` en openSecurityWindow.
function rememberPassword(password) {
  try {
    if (!safeStorage.isEncryptionAvailable()) return;
    const enc = safeStorage.encryptString(password);
    setMeta('security_remembered', enc.toString('base64'));
  } catch (e) {
    // B3: solo al activar "recordar contraseña". Nunca se registra la
    // contraseña ni el blob cifrado: solo que safeStorage falló y por qué.
    appLog('Seguridad — no se pudo recordar la contraseña en este equipo (safeStorage): ' + motivoSinRutas(e));
    console.warn('No se pudo recordar la contraseña en este equipo:', e);
  }
}
function forgetRememberedPassword() {
  // Solo escribe si de verdad hay algo que borrar: un login correcto no tiene
  // por qué producir una escritura en la base de datos.
  if (getMeta('security_remembered') === null) return;
  deleteMeta('security_remembered');
}

// Bloque 3 — el blob que se guardaría en `security_remembered`, calculado
// ANTES de la operación para poder meterlo en su MISMA mutación. Devuelve null
// si no se puede (equipo sin safeStorage), que es exactamente "no recordar".
function blobDeContrasena(password) {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.encryptString(password).toString('base64');
  } catch (e) {
    // B3: ídem. Sin contraseña ni blob en el mensaje.
    appLog('Seguridad — no se pudo preparar la contraseña recordada: ' + motivoSinRutas(e));
    console.warn('No se pudo preparar la contraseña recordada:', e);
    return null;
  }
}

// ------------------------------------------------------------------
// BLOQUE 3 — COHERENCIA ENTRE LA CLAVE EN MEMORIA Y LA BASE DE DATOS
//
// Con una carpeta compartida, A3.3 puede ADOPTAR en silencio una versión de la
// base de datos publicada por otro equipo (descendencia lineal estricta, ver
// recargarDesdeDisco en db.js). Si ese otro equipo cambió la contraseña, la
// sal y el verificador de la base de datos adoptada son otros — y seguir
// cifrando con la clave anterior dejaría ILEGIBLE cada archivo nuevo.
//
// `verifierFor(clave)` es un HMAC de la CLAVE, no depende de la sal: eso
// permite validar la clave que ya está en memoria contra el verificador de la
// base de datos que acabamos de adoptar, sin pedir nada al usuario.
//
// Esta capa NO cierra el problema completo de las acciones archivo+BD (un
// handler puede cifrar un archivo y descubrir DESPUÉS, al confirmar, que el
// disco avanzó). Eso pertenece al bloque de contratos de acción/IPC. Lo que sí
// garantiza: tras cualquier adopción efectiva, la clave queda invalidada ANTES
// de la siguiente operación, y ningún código sigue usando a sabiendas una
// clave cuyo verificador ya no coincide.
// ------------------------------------------------------------------
let seguridadRequiereRevalidacion = false;

function revalidarSeguridadTrasAdopcion(motivo) {
  let habilitada = false;
  let verifier = null;
  try {
    habilitada = getMeta('security_enabled') === '1';
    verifier = getMeta('security_verifier');
  } catch (e) {
    // Si ni siquiera se puede leer, lo prudente es dejar de usar la clave.
    securityKey = null;
    seguridadRequiereRevalidacion = true;
    return;
  }
  if (!habilitada) {
    // La base de datos adoptada tiene la Seguridad desactivada: la clave que
    // tuviéramos ya no manda nada. No se escribe nada en ningún sitio.
    if (securityKey) appLog(`Seguridad — la base de datos adoptada (${motivo}) no tiene cifrado activo: se descarta la clave en memoria.`);
    securityKey = null;
    seguridadRequiereRevalidacion = false;
    return;
  }
  // TRANSICIÓN EXPLÍCITA "sesión sin Seguridad -> base de datos CON Seguridad".
  // Antes esto era `if (!securityKey) return;`, que dejaba la sesión escribiendo
  // en claro sobre una base de datos que exige cifrado. Ahora se bloquea hasta
  // que alguien valide una clave contra ESA base de datos.
  if (!securityKey) {
    if (motivo !== 'apertura') {
      appLog(`Seguridad — la base de datos adoptada (${motivo}) tiene el cifrado ACTIVO y esta sesión no tiene clave validada: no se escribirá nada hasta validarla.`);
    }
    seguridadRequiereRevalidacion = true;
    return;
  }
  if (securitymod.verifierFor(securityKey) !== verifier) {
    appLog(`ERROR PS-2004 — la base de datos adoptada (${motivo}) pertenece a otra contraseña: se invalida la clave en memoria y se pedirá de nuevo.`);
    securityKey = null;
    seguridadRequiereRevalidacion = true;
    return;
  }
  seguridadRequiereRevalidacion = false;
}

// COMPROBACIÓN REAL, no `looksEncrypted`: se descifra de verdad un archivo que
// la base de datos dice cifrado. AES-GCM está autenticado, así que una clave
// equivocada FALLA en vez de devolver basura. Devuelve true también cuando no
// hay ningún archivo cifrado contra el que comprobar (no hay nada que probar).
function claveDescifraDeVerdad(key) {
  if (!key) return false;
  const candidatos = [];
  try {
    dbmod.all(
      `SELECT b.file_path, p.id AS project_id, p.name, p.backup_dir
         FROM backups b JOIN projects p ON p.id = b.project_id
        WHERE b.encrypted=1 AND b.file_path IS NOT NULL AND b.file_path != ''
        ORDER BY b.id DESC LIMIT 5`
    ).forEach((r) => {
      candidatos.push(path.join(backupsDirForProject({ id: r.project_id, name: r.name, backup_dir: r.backup_dir }), r.file_path));
    });
  } catch (e) { /* se prueba con lo que haya */ }
  for (const f of candidatos) {
    let raw = null;
    try { raw = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }   // ausente: no prueba nada
    if (!securitymod.looksEncrypted(raw)) continue;                     // fila y archivo no coinciden
    try {
      securitymod.decryptString(key, raw);
      return true;                                                      // descifrado REAL correcto
    } catch (e) {
      appLog('Seguridad — la contraseña valida contra el verificador pero NO descifra un backup real: se rechaza.');
      return false;
    }
  }
  return true;   // no había ningún archivo cifrado legible con el que probar
}

// Al arrancar: si la seguridad está activada y hay una contraseña recordada
// en este equipo (y sigue siendo válida), desbloquea sin pedir nada. Si no,
// hace falta pasar por la ventana de login.
//
// Nunca escribe: una contraseña recordada que ya no vale se ignora sin tocar
// la base de datos. Quien la borre será una operación explícita del usuario.
function tryAutoUnlock() {
  if (!isSecurityEnabled()) return true;
  if (!safeStorage.isEncryptionAvailable()) return false;
  const remembered = getMeta('security_remembered');
  if (!remembered) return false;
  try {
    const password = safeStorage.decryptString(Buffer.from(remembered, 'base64'));
    const salt = getMeta('security_salt');
    const verifier = getMeta('security_verifier');
    const key = securitymod.deriveKey(password, salt);
    if (securitymod.verifierFor(key) !== verifier) return false;
    if (!claveDescifraDeVerdad(key)) return false;
    securityKey = key;
    seguridadRequiereRevalidacion = false;
    return true;
  } catch (e) {
    return false;
  }
}

// Se llama una vez, antes de crear cualquier ventana. Devuelve `false` solo
// si la seguridad está activada, no se pudo desbloquear sola, Y el usuario
// canceló/cerró la ventana de login — en ese caso quien llama debe cerrar la
// aplicación entera en vez de dejar el launcher accesible sin contraseña.
async function runLoginFlow() {
  if (!isSecurityEnabled()) return true;
  if (tryAutoUnlock()) return true;
  return openSecurityWindow('login', null);
}

// Construye las opciones del menú "Seguridad", según si ya está activada o
// no — se reconstruye cada vez que se abre el menú (vía buildLauncherMenu /
// buildProjectMenu), así nunca queda desfasado tras activar/cambiar/
// desactivar desde otra ventana.
function securityMenuItems() {
  if (!isSecurityEnabled()) {
    return [
      {
        label: 'Activar cifrado de backups...',
        click: (menuItem, browserWindow) => openSecurityWindow('setup', browserWindow || launcherWin),
      },
    ];
  }
  return [
    {
      label: 'Cambiar contraseña...',
      click: (menuItem, browserWindow) => openSecurityWindow('change', browserWindow || launcherWin),
    },
    {
      label: 'Desactivar cifrado de backups...',
      click: (menuItem, browserWindow) => openSecurityWindow('disable', browserWindow || launcherWin),
    },
  ];
}

// ------------------------------------------------------------------
// Menús propios (Archivo / Editar / Configuración o Proyecto) — sustituyen
// al menú genérico de Electron. Se construyen por ventana: el launcher tiene
// un menú simple, y cada ventana de proyecto añade su propio menú "Proyecto"
// con acciones referidas a ESE proyecto en concreto (se relee de la base de
// datos en el momento del clic, nunca queda "congelado" con datos viejos).
// ------------------------------------------------------------------
function buildLauncherMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'Archivo',
      submenu: [
        {
          label: 'Nuevo proyecto...',
          accelerator: 'CmdOrCtrl+N',
          click: () => launcherWin && launcherWin.webContents.send('menu:new-project'),
        },
        {
          label: 'Directorio de Talento',
          click: () => {
            const row = ensureDirectorioTalentoProject();
            openProjectWindow(row);
          },
        },
        { type: 'separator' },
        { role: 'quit', label: 'Salir' },
      ],
    },
    editMenu(),
    {
      label: 'Seguridad',
      submenu: securityMenuItems(),
    },
    {
      label: 'Configuración',
      submenu: [
        {
          label: 'Abrir carpeta de datos de la aplicación',
          click: () => openPathLogged(app.getPath('userData')),
        },
        {
          label: 'Cambiar ubicación de los datos...',
          click: () => changeUserDataLocation(launcherWin),
        },
        {
          label: 'Volver a la ubicación de datos por defecto',
          click: () => resetUserDataLocationToDefault(launcherWin),
        },
        { type: 'separator' },
        // v0.1.54: pedido explícito del usuario tras el descubrimiento de la
        // 0.1.53 — "¿no se puede añadir más seguridad?" (si no ha terminado de
        // sincronizar Drive/OneDrive antes del apagado, ni los backups salvan).
        // Corre en un proceso de fondo aparte (no dentro de esta app, que ya
        // estaría cerrada durante el apagado) usando la API real de Windows
        // para retrasar el apagado — ver drive-sync-guard/DriveSyncGuard.ps1.
        //
        // v0.1.56: ya NO se activa/desactiva a mano desde aquí — pedido
        // explícito del usuario ("se podría quitar [el interruptor] y que se
        // active si se selecciona que los datos van a estar... en la nube,
        // porque lo lógico es que funcione en esos casos"). Ver
        // syncDriveSyncGuardWithLocation(), llamada en cada arranque: se
        // activa sola con carpeta de datos personalizada, se desactiva sola
        // con la de por defecto. Se deja el visor de registro para poder
        // comprobar qué ha hecho, ya que no hay ningún interruptor que avise.
        { label: 'Ver registro de la protección de apagado', click: () => openDriveSyncGuardLog(launcherWin) },
        { type: 'separator' },
        {
          label: 'Aplicar parche (app.asar)...',
          click: () => applyAsarPatch(launcherWin),
        },
        { type: 'separator' },
        // v0.1.40: pedido explícito del usuario tras la investigación de la 0.1.36 (que costó una
        // ronda entera de capturas y pegar patch-log.txt a mano) — reunir en un solo sitio, dentro
        // de la propia app, lo que antes había que ir a buscar por varios lados cada vez que algo
        // fallaba: versión, carpeta de instalación, carpeta de datos, y acceso directo al registro
        // de parches. Así la próxima vez no hace falta pedir capturas ni pegar logs a mano.
        { label: 'Diagnóstico...', click: () => showDiagnosticsDialog(launcherWin) },
        { label: 'Abrir carpeta de instalación', click: () => openInstallFolder() },
        { label: 'Ver registro de parches (patch-log.txt)', click: () => openPatchLog(launcherWin) },
        { label: 'Ver registro de la aplicación (app.log)', click: () => openAppLog(launcherWin) },
        { label: 'Ver códigos de error...', click: () => showErrorCodesDialog(launcherWin) },
        { type: 'separator' },
        // v2.0.27: tema visual global -- aquí solo para paridad con el
        // desplegable propio del launcher (launcher/index.html), que es el
        // que se usa de verdad (ver comentario grande sobre frame:false más
        // arriba); esta entrada nativa normalmente no se ve porque la
        // ventana no tiene marco, pero se mantiene sincronizada por si se
        // llega a ella con Alt. checked se recalcula cada vez que se abre el
        // menú (ver comentario "se reconstruye cada vez").
        {
          label: 'Tema visual',
          submenu: THEME_KEYS.map((key) => ({
            label: THEME_LABELS[key],
            type: 'radio',
            checked: getGlobalTheme() === key,
            click: () => setGlobalTheme(key),
          })),
        },
        { type: 'separator' },
        { label: 'Acerca de Panorama del Servicio', click: () => showAboutDialog(launcherWin) },
      ],
    },
  ]);
}

function buildProjectMenu(projectId) {
  // "Preparación de Reunión" solo tiene sentido para un proyecto normal (lee
  // Equipo/Hitos/Riesgos de su backup) — el propio Directorio de Talento
  // también es una fila de `projects` por dentro (kind='directorio_talento')
  // pero no tiene ese tipo de datos, así que no se le ofrece la entrada.
  const projRow = dbmod.get('SELECT * FROM projects WHERE id=?', [projectId]);
  const isNormalProject = !!projRow && projRow.kind !== 'directorio_talento';
  return Menu.buildFromTemplate([
    {
      label: 'Archivo',
      submenu: [
        {
          label: 'Nuevo proyecto...',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            const win = focusOrCreateLauncher();
            win.webContents.send('menu:new-project');
          },
        },
        {
          label: 'Elegir proyecto...',
          accelerator: 'CmdOrCtrl+O',
          click: () => focusOrCreateLauncher(),
        },
        {
          label: 'Directorio de Talento',
          click: () => {
            const row = ensureDirectorioTalentoProject();
            openProjectWindow(row);
          },
        },
        { type: 'separator' },
        { role: 'close', label: 'Cerrar ventana' },
        { role: 'quit', label: 'Salir de la aplicación' },
      ],
    },
    editMenu(),
    {
      label: 'Proyecto',
      submenu: [
        {
          label: 'Guardar backup ahora',
          click: (menuItem, browserWindow) => {
            if (browserWindow) browserWindow.webContents.send('panorama:request-backup-now');
          },
        },
        ...(isNormalProject
          ? [
              {
                label: 'Preparación de Reunión...',
                click: () => {
                  const row = dbmod.get('SELECT * FROM projects WHERE id=?', [projectId]);
                  if (row) openMeetingPrepWindow(row);
                },
              },
              {
                label: 'Evaluación de Candidatos...',
                click: () => {
                  const row = dbmod.get('SELECT * FROM projects WHERE id=?', [projectId]);
                  if (row) openCandidateEvalWindow(row);
                },
              },
            ]
          : []),
        {
          label: 'Ver carpeta de backups',
          click: () => {
            const row = dbmod.get('SELECT * FROM projects WHERE id=?', [projectId]);
            if (row) openPathLogged(backupsDirForProject(row));
          },
        },
        {
          label: 'Restaurar último backup...',
          click: async (menuItem, browserWindow) => {
            const row = dbmod.get('SELECT * FROM projects WHERE id=?', [projectId]);
            if (!row) return;
            const ok = await modalConfirm(
              browserWindow,
              `Esto reemplaza los datos actuales de "${row.name}" por los del último backup guardado. Esta acción no se puede deshacer desde la propia app.`,
              { title: 'Restaurar último backup', confirmLabel: 'Restaurar' }
            );
            if (!ok) return;
            try {
              await restoreProjectBackup(projectId, null);
            } catch (e) {
              await modalAlert(browserWindow, String((e && e.message) || e) + errorCodeSuffix('PS-2002'), { title: 'No se pudo restaurar', danger: true });
            }
          },
        },
        // v0.1.50: "Restaurar último backup..." de arriba SIEMPRE coge el más
        // reciente por fecha — pedido explícito de un usuario con la carpeta
        // de datos en Google Drive compartida entre dos PCs: si el PC que
        // restaura llevaba un rato abierto desde antes de que el otro PC
        // guardara y sincronizara sus propios cambios, "el último" seguía sin
        // encontrarlos hasta reabrir la app entera. Esta opción deja elegir a
        // mano CUÁL de los backups guardados restaurar, con su fecha real, en
        // vez de fiarlo todo a la detección automática.
        {
          label: 'Restaurar un backup concreto...',
          click: (menuItem, browserWindow) => {
            const row = dbmod.get('SELECT * FROM projects WHERE id=?', [projectId]);
            if (row) openBackupPickerWindow(row, browserWindow);
          },
        },
        { type: 'separator' },
        {
          label: 'Eliminar este proyecto...',
          click: async (menuItem, browserWindow) => {
            const row = dbmod.get('SELECT * FROM projects WHERE id=?', [projectId]);
            if (!row) return;
            const ok = await modalConfirm(
              browserWindow,
              'Se borran todos sus datos, backups y copias guardadas en disco. Esta acción no se puede deshacer.',
              { title: `¿Eliminar "${row.name}" definitivamente?`, confirmLabel: 'Eliminar definitivamente', danger: true }
            );
            if (!ok) return;
            const rDel = await deleteProjectById(projectId);
            await avisarResultadoBorradoProyecto(browserWindow, rDel, row.name);
            if (launcherWin && !launcherWin.isDestroyed()) {
              launcherWin.webContents.send('projects:changed');
            }
          },
        },
      ],
    },
    // "Partes mensuales" (v0.1.25): solo tiene sentido para la ventana del
    // Directorio de Talento (checklist de aprobación de partes/imputación
    // de horas, a nivel de persona — no de proyecto). Igual que
    // "Preparación de Reunión" arriba, se decide con isNormalProject, pero
    // al revés: aquí SOLO se ofrece si NO es un proyecto normal. Cambia de
    // vista dentro de la MISMA ventana (IPC 'panorama:show-partes-mensuales',
    // ver preload.js/plantilla_directorio.html) — no abre nada nuevo.
    ...(!isNormalProject
      ? [
          {
            label: 'Partes mensuales',
            click: (menuItem, browserWindow) => {
              if (browserWindow) browserWindow.webContents.send('panorama:show-partes-mensuales');
            },
          },
        ]
      : []),
    {
      label: 'Seguridad',
      submenu: securityMenuItems(),
    },
  ]);
}

function editMenu() {
  return {
    label: 'Editar',
    submenu: [
      { role: 'undo', label: 'Deshacer' },
      { role: 'redo', label: 'Rehacer' },
      { type: 'separator' },
      { role: 'cut', label: 'Cortar' },
      { role: 'copy', label: 'Copiar' },
      { role: 'paste', label: 'Pegar' },
      { role: 'selectAll', label: 'Seleccionar todo' },
    ],
  };
}

function showAboutDialog(parentWin) {
  return modalAlert(
    parentWin,
    'App de escritorio (Electron + SQLite) de gestión de proyectos, diseñada por Juan López. ' +
      'Cada proyecto vive aislado con su propio backup automático.\n\nBase de datos: ' +
      dbmod.getDbPath(),
    { title: `Panorama del Servicio — v${app.getVersion()}` }
  );
}

// v0.1.40: misma ruta que usa canWriteToAsarFolder() más abajo (la carpeta
// donde vive app.asar de verdad) — se centraliza aquí para no duplicar el
// cálculo entre el diagnóstico, "Abrir carpeta de instalación" y el propio
// check de permisos.
function installDirPath() {
  return path.dirname(path.join(process.resourcesPath, 'app.asar'));
}

function patchLogFilePath() {
  return path.join(app.getPath('userData'), 'patch-log.txt');
}

// ------------------------------------------------------------------
// Registro general de la aplicación (v0.1.41) — pedido explícito del
// usuario: hasta ahora solo quedaba constancia en disco de los parches
// aplicados (patch-log.txt, escrito por el proceso ayudante). No había
// ningún registro de arranques, avisos de datos no encontrados, errores de
// base de datos, excepciones no capturadas, etc. — cuando algo raro pasaba
// y no dejaba un diálogo visible en pantalla, no quedaba ningún rastro que
// consultar después.
//
// Se mantiene SEPARADO de patch-log.txt a propósito: ese ya tiene su propio
// mecanismo probado (lo escribe un proceso detached aparte, con su propio
// menú) y no hace falta tocarlo. Este es un log general, de un solo
// archivo, escrito siempre desde el proceso principal.
//
// Auto-rotación por tamaño (no por fecha, para no complicarlo con zonas
// horarias ni con que la app a veces no se abra en días): cuando app.log
// supera APP_LOG_MAX_BYTES, se renombra a app.log.1 (pisando el .1
// anterior si lo había) y se empieza uno nuevo — un solo nivel de
// histórico, tamaño máximo en disco acotado (~2x el límite) sin necesidad
// de ninguna dependencia externa ni de borrar líneas a mano dentro del
// archivo (que podría cortar una línea a medias).
const APP_LOG_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

function appLogFilePath() {
  return path.join(app.getPath('userData'), 'app.log');
}

function appLogRotatedPath() {
  return path.join(app.getPath('userData'), 'app.log.1');
}

function appLog(line) {
  try {
    const logPath = appLogFilePath();
    try {
      const stat = fs.statSync(logPath);
      if (stat.size > APP_LOG_MAX_BYTES) {
        fs.renameSync(logPath, appLogRotatedPath());
      }
    } catch (e) {
      /* no existe todavía — normal, se crea con el append de abajo */
    }
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${line}\n`, 'utf8');
  } catch (e) {
    /* si ni el log se puede escribir, no hay nada más que hacer — nunca debe
       impedir que la propia acción que se estaba registrando siga su curso */
  }
}

// B3 (15 sept 2026) — `appLog` para fallos que pueden REPETIRSE.
//
// Algunos de los caminos que B3 saca de `console.warn` viven en bucles o
// temporizadores: el refresco de la copia HTML corre en cada `backup:save`, y
// eso pasa cada ~15 s por proyecto abierto. Registrar cada intento llenaría
// `app.log` —que rota a 2 MB— de la misma línea y enterraría lo demás.
//
// Mismo criterio que B1: una línea por causa y sesión. Si el problema se
// arregla y vuelve a aparecer en otra sesión, se registra otra vez. Para lo que
// ocurre una sola vez (una migración, un cambio de contraseña) se usa `appLog`
// a secas, sin pasar por aquí.
const avisosYaRegistrados = new Set();
function appLogUnaVezPorSesion(clave, linea) {
  if (avisosYaRegistrados.has(clave)) return;
  avisosYaRegistrados.add(clave);
  appLog(linea);
}

// B3 — EL MENSAJE DEL ERROR TRAE LA RUTA COMPLETA, Y ESO NO PUEDE IR AL LOG.
//
// Lo encontró el arnés de Electron real, no el repaso del código: las
// excepciones de `fs` incluyen la ruta entera dentro del propio mensaje
// ("EPERM: operation not permitted, open 'C:\\Users\\<usuario>\\AppData\\...'").
// O sea que poner `path.basename()` en la parte que escribimos nosotros no
// sirve de nada si justo después se concatena `e.message` tal cual — que es
// lo que hacían todas las líneas nuevas de esta ronda.
//
// `app.log` es un archivo que el usuario puede acabar enviando a soporte, así
// que no debe llevar el nombre de usuario de Windows ni la estructura de
// carpetas. Se conserva el código del error (EPERM, ENOENT, EBUSY...) y el
// nombre del archivo: con eso se diagnostica exactamente igual.
//
// ALCANCE: solo las líneas que añade B3. Las anteriores —las de los códigos
// PS-xxxx sobre todo— llevan el mensaje literal a propósito y cambiarlas
// ahora sería otra decisión, no esta. Queda anotado como pendiente.
function motivoSinRutas(e) {
  const msg = String((e && e.message) || e || '');
  return msg
    .replace(/'([^']*[\\/][^']*)'/g, (m, p) => `'${path.basename(p)}'`)
    .replace(/"([^"]*[\\/][^"]*)"/g, (m, p) => `"${path.basename(p)}"`)
    .replace(/[A-Za-z]:[\\/][^\s,;)'"]+/g, (m) => path.basename(m));
}

// B3 — LIMPIEZA BEST-EFFORT, PERO NO MUDA.
//
// Estos dos casos eran `catch {}` vacíos, y con razón: el protocolo ya ha
// decidido, es idempotente y fail-closed, y convertir la limpieza en error
// fatal sería peor. NO se cambia ese comportamiento — solo se les añade
// observabilidad, porque su fallo **explica un bloqueo posterior**:
//
//   - un journal ya resuelto que no se puede borrar hace que F-1 vea una
//     operación pendiente en el siguiente arranque, y el usuario recibe un
//     "hay algo sin resolver" sin ninguna pista de por qué;
//   - una exclusiva que no se suelta bloquea la siguiente operación.
//
// Siguen sin lanzar. Siguen sin molestar al usuario. Solo dejan una línea.
function borrarJournalResuelto(ruta, que) {
  try {
    fs.unlinkSync(ruta);
  } catch (e) {
    appLogUnaVezPorSesion('journal-huerfano-' + ruta,
      `Limpieza — no se pudo borrar el registro de ${que} ya resuelto (${path.basename(String(ruta))}). ` +
      'No se ha perdido nada; puede hacer que una operación nueva quede bloqueada hasta resolverlo: ' +
      motivoSinRutas(e));
  }
}
function soltarExclusivaConRastro(token, que) {
  try {
    dbmod.soltarExclusiva(token);
  } catch (e) {
    appLogUnaVezPorSesion('exclusiva-' + que,
      `Limpieza — no se pudo soltar la exclusiva de ${que}. ` +
      'Puede bloquear la siguiente operación hasta reiniciar: ' + motivoSinRutas(e));
  }
}

async function openAppLog(parentWin) {
  const logPath = appLogFilePath();
  if (!fs.existsSync(logPath)) {
    await modalAlert(parentWin, 'Todavía no hay ningún evento registrado en app.log en esta copia.', { title: 'Sin registro de la aplicación' });
    return;
  }
  openPathLogged(logPath);
}

// v0.1.40: pedido explícito del usuario — reúne en un solo diálogo, dentro
// de la propia app, la versión y las rutas que antes había que ir a buscar
// a mano cada vez que algo fallaba (instalación duplicada en varios sitios,
// permisos del parche...). Ver comentario junto al menú "Configuración".
function showDiagnosticsDialog(parentWin) {
  const hasPatchLog = fs.existsSync(patchLogFilePath());
  const hasAppLog = fs.existsSync(appLogFilePath());
  const detail =
    `Carpeta de instalación:\n${installDirPath()}\n\n` +
    `Carpeta de datos:\n${app.getPath('userData')}\n\n` +
    `Base de datos:\n${dbmod.getDbPath()}\n\n` +
    `Ubicación de datos: ${
      !isUsingCustomDataLocationNow() ? 'por defecto (local)' : isUsingSharedDataLocationNow() ? 'personalizada (compartida)' : 'personalizada (local, no compartida)'
    }\n` +
    `Protección de apagado (Drive/OneDrive): ${isDriveSyncGuardEnabled() ? 'activa' : 'no aplica'}\n` +
    `Bloqueo multi-PC: ${
      isUsingSharedDataLocationNow() ? (multiPcLockOwnedByUs ? 'activo, esta copia lo tiene tomado' : 'no aplica ahora mismo') : 'no aplica (ubicación no marcada como compartida)'
    }\n\n` +
    (hasPatchLog
      ? 'Hay un registro de parches guardado — usa "Ver registro de parches (patch-log.txt)" para abrirlo.\n'
      : 'Todavía no hay ningún registro de parches guardado en esta copia.\n') +
    (hasAppLog
      ? 'Hay un registro general de la aplicación — usa "Ver registro de la aplicación (app.log)" para abrirlo.'
      : 'Todavía no hay ningún registro general de la aplicación en esta copia.');
  return modalAlert(parentWin, detail, { title: `Diagnóstico — Panorama del Servicio v${app.getVersion()}` });
}

function openInstallFolder() {
  openPathLogged(installDirPath());
}

async function openPatchLog(parentWin) {
  const logPath = patchLogFilePath();
  if (!fs.existsSync(logPath)) {
    await modalAlert(
      parentWin,
      'Todavía no se ha aplicado ningún parche a esta copia (o no ha dejado registro) — no hay patch-log.txt que mostrar.',
      { title: 'Sin registro de parches' }
    );
    return;
  }
  openPathLogged(logPath);
}

// ------------------------------------------------------------------
// "Aplicar parche (app.asar)..." — v0.1.22. Alternativa al instalador NSIS
// completo (80 MB, 4 partes, reinstalación) para cambios que solo tocan
// código propio: el `app.asar` empaquetado (27 MB) contiene TODO ese código
// (main.js, dashboard/, directorio/, preparación de reunión, vendor/) — lo
// único que deja fuera es el runtime de Electron/Chromium, los iconos y
// `elevate.exe`, que no cambian entre versiones de esta app.
//
// Diseño deliberadamente SIN reapertura automática, a petición explícita
// del usuario tras pedirle una fiabilidad muy alta: la pieza más frágil de
// un auto-actualizador de verdad es la sincronización de "cerrar → esperar
// → sustituir → reabrir sola" — al quitar el último paso, lo que queda es
// solo "esperar a que cierres → copiar un archivo", con una única
// comprobación de vida de proceso (`process.kill(pid, 0)`, que no envía
// nada, solo consulta si el PID sigue vivo — funciona igual en Windows que
// en Linux, así se pudo probar el flujo completo en este sandbox).
//
// Capas de seguridad, en orden:
//   1. El propio archivo elegido nunca se toca "en caliente": se copia a un
//      almacén temporal (userData) antes de nada, así da igual si estaba en
//      Descargas y el usuario lo mueve o lo borra mientras tanto.
//   2. Se calcula su SHA-256 y se le pide al usuario que lo compare con el
//      publicado en el chat ANTES de aplicar — si no coincide, cancela sin
//      tocar nada.
//   3. Se hace copia de seguridad del `app.asar` real ANTES de sustituirlo
//      (nunca después) — si algo falla a mitad, el peor caso es "no se
//      aplicó el parche", nunca "se perdió el original".
//   4. El proceso ayudante que hace la sustitución de verdad corre
//      DESPUÉS de que esta app haya cerrado (así el archivo ya no está
//      bloqueado), tiene un tope de espera de 2 minutos (si nunca cierras
//      la app, se cancela solo y no se queda nada corriendo de fondo ni se
//      toca el archivo real), y dejar un `patch-log.txt` en la carpeta de
//      datos de la app con lo que hizo exactamente — para poder diagnosticar
//      sin adivinar si algo no sale como se espera.
//   5. Solo se conservan las últimas 2 copias de seguridad de `app.asar`
//      (se purgan las más viejas solas) para no acumular basura.
//
// El ayudante se ejecuta relanzando el propio binario de Electron pero con
// la variable ELECTRON_RUN_AS_NODE=1, que hace que se comporte como un
// intérprete de Node normal en vez de arrancar la app — patrón estándar de
// Electron para lanzar un proceso auxiliar sin depender de tener Node
// instalado aparte ni de un .bat/.ps1 externo.
const ASAR_PATCH_BACKUP_KEEP = 2;

function asarPatchHelperSource() {
  return `
'use strict';
// original-fs: ver el comentario junto al require() de arriba en main.js —
// sin esto, cualquier operación sobre una ruta terminada en ".asar" (que es
// justo lo único que hace este ayudante) falla con ENOENT aunque el
// archivo exista. Confirmado con pruebas reales que este módulo funciona
// igual bajo ELECTRON_RUN_AS_NODE que en el proceso principal normal.
const fs = require('original-fs');
const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');

// P18: los tres últimos argumentos atan este parche a su operación de
// procedencia (registro local + copia local de la versión que se sustituye).
const [, , pidStr, backupAsar, realAsar, stagedAsar, logPath, exePath, manifiestoPath, operationId, copiaLocal] = process.argv;
const pid = parseInt(pidStr, 10);
const MAX_WAIT_MS = 2 * 60 * 1000;
const started = Date.now();
// v2.0.42: mismo límite y mismo patrón de rotación por tamaño que ya usa
// app.log (ver APP_LOG_MAX_BYTES en el proceso principal) -- este archivo
// crece muy poco a poco (una entrada por parche aplicado, no por uso
// normal), pero no tenía ningún tope hasta ahora.
const PATCH_LOG_MAX_BYTES = 2 * 1024 * 1024;

function log(msg) {
  try {
    try {
      const stat = fs.statSync(logPath);
      if (stat.size > PATCH_LOG_MAX_BYTES) fs.renameSync(logPath, logPath + '.1');
    } catch (e) { /* no existe todavía -- normal */ }
    fs.appendFileSync(logPath, '[' + new Date().toISOString() + '] ' + msg + '\\n', 'utf8');
  } catch (e) { /* si ni el log se puede escribir, no hay nada más que hacer */ }
}

function isAlive(p) {
  try {
    process.kill(p, 0);
    return true;
  } catch (e) {
    return false;
  }
}

function cleanupStaged() {
  try { fs.unlinkSync(stagedAsar); } catch (e) { /* ya no estaba */ }
}

// ---- P18: registro de procedencia ----------------------------------------
const NOMBRE_COPIA = /^app\\.asar\\.pred-[0-9a-f]{16}$/;

function sha256(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function leerManifiesto() {
  try {
    const j = JSON.parse(fs.readFileSync(manifiestoPath, 'utf8'));
    if (j && j.v === 1 && Array.isArray(j.operaciones)) return j;
  } catch (e) { /* ausente o roto */ }
  return null;
}

// Temporal + escritura completa + fsync + rename + RELECTURA.
function guardarManifiesto(j) {
  const txt = JSON.stringify(j, null, 2);
  const tmp = manifiestoPath + '.tmp-' + process.pid + '-' + Date.now();
  const buf = Buffer.from(txt, 'utf8');
  try {
    const fd = fs.openSync(tmp, 'w');
    try {
      let escritos = 0;
      while (escritos < buf.length) {
        const n = fs.writeSync(fd, buf, escritos, buf.length - escritos, escritos);
        if (!(n > 0)) throw new Error('writeSync sin progreso');
        escritos += n;
      }
      try { fs.fsyncSync(fd); } catch (e) {
        if (['EINVAL', 'ENOSYS', 'ENOTSUP', 'EOPNOTSUPP'].indexOf(e && e.code) < 0) throw e;
      }
    } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, manifiestoPath);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (e2) { /* ya no estaba */ }
    throw e;
  }
  if (fs.readFileSync(manifiestoPath, 'utf8') !== txt) throw new Error('la relectura del registro de procedencia no coincide');
}

function operacionDe(j) {
  return j ? j.operaciones.find(function (o) { return o && o.operation_id === operationId; }) : null;
}

// Relee el app.asar REAL y la copia local. VERIFICADA solo si el instalado es
// EXACTAMENTE el parche esperado y la copia conserva EXACTAMENTE la versión
// anterior. OJO: eso prueba que el archivo instalado es el esperado, NO que la
// app vaya a arrancar bien después — son cosas distintas.
// Devuelve true si el app.asar instalado es el esperado.
function verificarOperacion() {
  let shaReal = null;
  let shaCopia = null;
  let motivo = null;
  try { shaReal = sha256(realAsar); } catch (e) { motivo = 'no se pudo releer el app.asar instalado'; }
  try { shaCopia = sha256(copiaLocal); } catch (e) { motivo = motivo || 'no se pudo releer la copia local de recuperación'; }
  const j = leerManifiesto();
  const op = operacionDe(j);
  if (!op) {
    log('ERROR P18: la operación ' + operationId + ' ya no está en el registro de procedencia; no se marca nada.');
    return false; // sin la operación no se sabe qué hash esperar: no se reabre
  }
  if (!motivo && shaReal !== op.sha256_nuevo_esperado) motivo = 'el app.asar instalado no tiene el hash esperado';
  if (!motivo && shaCopia !== op.sha256_anterior) motivo = 'la copia local ya no tiene el hash del app.asar anterior';
  op.sha256_nuevo_real = shaReal;
  const instaladoCorrecto = shaReal !== null && shaReal === op.sha256_nuevo_esperado;
  if (motivo) {
    op.estado = 'fallida';
    op.motivo_fallo = motivo;
    guardarManifiesto(j);
    log('P18: operación ' + operationId + ' FALLIDA (' + motivo + '). La copia local se conserva, pero NO es candidata a restauración automática.');
    return instaladoCorrecto;
  }
  op.estado = 'verificada';
  op.verificada_at = new Date().toISOString();
  op.motivo_fallo = null;
  guardarManifiesto(j); // PRIMERO se confirma la nueva...
  log('P18: operación ' + operationId + ' VERIFICADA: el app.asar instalado es exactamente el esperado y la copia local conserva la versión anterior. (Eso no prueba que la app vaya a arrancar bien.)');
  retirarAnteriores(); // ...y SOLO DESPUÉS se retiran las viejas.
  return instaladoCorrecto;
}

// Tras CONFIRMAR la nueva operación, queda solo ella: la predecesora del
// app.asar instalado. Nunca al revés (borrar lo viejo y luego intentar lo nuevo).
function retirarAnteriores() {
  const dir = path.dirname(copiaLocal);
  const j = leerManifiesto();
  const nueva = operacionDe(j);
  if (!nueva || nueva.estado !== 'verificada') {
    log('P18: la nueva operación no aparece confirmada al releer; no se retira nada.');
    return;
  }
  const viejas = j.operaciones.filter(function (o) { return o !== nueva; });
  for (const o of viejas) {
    if (o && typeof o.nombre_copia === 'string' && NOMBRE_COPIA.test(o.nombre_copia)) {
      try { fs.unlinkSync(path.join(dir, o.nombre_copia)); } catch (e) { /* queda huérfana: sin entrada nunca es candidata */ }
    }
  }
  j.operaciones = [nueva];
  guardarManifiesto(j);
  // Copias sin entrada (por ejemplo, de una preparación interrumpida).
  let huerfanas = 0;
  try {
    for (const f of fs.readdirSync(dir)) {
      if (NOMBRE_COPIA.test(f) && f !== nueva.nombre_copia) {
        try { fs.unlinkSync(path.join(dir, f)); huerfanas++; } catch (e) { /* se intentará la próxima vez */ }
      }
    }
  } catch (e) { /* no crítico */ }
  log('P18: retiradas ' + viejas.length + ' operación(es) anterior(es) y ' + huerfanas + ' copia(s) huérfana(s); queda solo la predecesora del app.asar instalado.');
}

function applyPatch() {
  // P18: sin su operación PREPARADA en el registro, no se toca nada.
  if (!manifiestoPath || !operationId || !copiaLocal) {
    log('ERROR P18: faltan los datos de la operación de procedencia. Parche NO aplicado, no se tocó nada.');
    cleanupStaged();
    return;
  }
  const previa = operacionDe(leerManifiesto());
  if (!previa || previa.estado !== 'preparada') {
    log('ERROR P18: la operación ' + operationId + ' no está PREPARADA en el registro de procedencia. Parche NO aplicado, no se tocó nada.');
    cleanupStaged();
    return;
  }
  let aplicado = false;
  try {
    if (!fs.existsSync(backupAsar)) {
      // Red de seguridad extra: si por lo que sea la copia previa no se
      // hizo (no debería pasar, se hace antes de spawnear este ayudante),
      // se hace aquí también antes de tocar el archivo real.
      fs.copyFileSync(realAsar, backupAsar);
      log('Aviso: la copia de seguridad no existía, se hizo aquí antes de aplicar.');
    }
    fs.copyFileSync(stagedAsar, realAsar);
    aplicado = true;
    log('Parche aplicado correctamente sobre: ' + realAsar);
  } catch (e) {
    log('ERROR aplicando el parche: ' + (e && e.message ? e.message : String(e)));
    try {
      const j = leerManifiesto();
      const op = operacionDe(j);
      if (op) {
        op.estado = 'fallida';
        op.motivo_fallo = 'no se pudo aplicar el parche';
        guardarManifiesto(j);
      }
    } catch (e2) {
      log('ERROR P18: no se pudo marcar la operación como FALLIDA: ' + (e2 && e2.message ? e2.message : String(e2)));
    }
  } finally {
    cleanupStaged();
  }
  if (!aplicado) return;
  let instaladoCorrecto = false;
  try {
    instaladoCorrecto = verificarOperacion();
  } catch (e) {
    log('ERROR P18: no se pudo cerrar la operación de procedencia (' + (e && e.message ? e.message : String(e)) + '); queda PREPARADA y NO es candidata a restauración automática.');
    try { instaladoCorrecto = sha256(realAsar) === previa.sha256_nuevo_esperado; } catch (e2) { instaladoCorrecto = false; }
  }
  // Igual que antes: nunca reabrir un app.asar que pueda haber quedado a medias.
  if (instaladoCorrecto) relaunchApp();
  else log('No se reabre la app: el app.asar instalado no es exactamente el parche esperado.');
}

// v2.0.42: reabrir sola tras aplicar el parche -- pedido explícito del
// usuario, antes había que volver a abrirla a mano cada vez. SOLO se llama
// tras un fs.copyFileSync(stagedAsar, realAsar) que terminó sin lanzar (si
// falló, ni se intenta relanzar -- mejor dejar la app cerrada con el error
// en el log que reabrir una copia que pudiera haber quedado a medias).
// Ojo con el entorno: este ayudante se lanzó con ELECTRON_RUN_AS_NODE=1
// (para poder ejecutar código Node plano reutilizando el propio binario de
// Electron de la app, sin depender de un node.exe del sistema) -- si el
// proceso hijo HEREDA esa variable (comportamiento por defecto de spawn),
// Electron lo arrancaría en modo "Node puro" en vez de abrir la ventana de
// verdad. Se construye un entorno propio sin esa variable antes de
// relanzar.
function relaunchApp() {
  if (!exePath) {
    log('Aviso: no se recibió la ruta del ejecutable, no se puede reabrir sola -- ábrela tú mismo.');
    return;
  }
  try {
    const relaunchEnv = Object.assign({}, process.env);
    delete relaunchEnv.ELECTRON_RUN_AS_NODE;
    const child = spawn(exePath, [], { detached: true, stdio: 'ignore', env: relaunchEnv });
    child.unref();
    log('Aplicación relanzada tras el parche: ' + exePath);
  } catch (e) {
    log('Aviso: el parche se aplicó bien pero no se pudo reabrir la app sola (' + (e && e.message ? e.message : String(e)) + ') -- ábrela tú mismo.');
  }
}

function tick() {
  if (!isAlive(pid)) {
    log('Proceso principal (pid ' + pid + ') ya cerrado, aplicando parche.');
    applyPatch();
    return;
  }
  if (Date.now() - started > MAX_WAIT_MS) {
    log('Tiempo de espera agotado (2 min) esperando a que se cerrara la app. Parche NO aplicado, no se tocó nada.');
    cleanupStaged();
    return;
  }
  setTimeout(tick, 500);
}

log('Ayudante de parche iniciado, esperando a que cierre el pid ' + pid + '...');
tick();
`;
}

// P18: escritura del registro de procedencia — temporal, escritura completa,
// fsync, rename y RELECTURA. El mismo patrón que guardarHistorialUbicacion()
// (P22) y escribirAtomico() (db.js). Lanza si no queda demostrado escrito.
function guardarManifiestoProcedencia(j) {
  const ruta = rutaManifiestoProcedencia();
  const tmp = `${ruta}.tmp-${process.pid}-${Date.now()}`;
  const FSYNC_NO_SOPORTADO = new Set(['EINVAL', 'ENOSYS', 'ENOTSUP', 'EOPNOTSUPP']);
  const txt = JSON.stringify(j, null, 2);
  try {
    fs.mkdirSync(path.dirname(ruta), { recursive: true });
    const fd = fs.openSync(tmp, 'w');
    try {
      const buf = Buffer.from(txt, 'utf8');
      let escritos = 0;
      while (escritos < buf.length) {
        const n = fs.writeSync(fd, buf, escritos, buf.length - escritos, escritos);
        if (!(n > 0)) throw new Error('writeSync sin progreso');
        escritos += n;
      }
      try {
        fs.fsyncSync(fd);
      } catch (e) {
        if (!FSYNC_NO_SOPORTADO.has(e && e.code)) throw new Error(`fsync falló (${(e && e.code) || '?'})`);
      }
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, ruta);
  } catch (e) {
    try {
      fs.unlinkSync(tmp);
    } catch (e2) {
      /* ya no estaba */
    }
    throw new Error(`no se pudo guardar el registro de procedencia: ${String((e && e.message) || e)}`);
  }
  if (fs.readFileSync(ruta, 'utf8') !== txt) {
    throw new Error('la relectura del registro de procedencia no coincide con lo escrito');
  }
}

// P18: prepara la operación ANTES de tocar el app.asar real. Si cualquier paso
// falla, lanza: quien llama NO debe aplicar el parche. Y no deja nada que
// pueda usarse para un rescate automático (la copia a medias se quita; una
// entrada 'preparada' tampoco vale nunca como predecesora).
function prepararOperacionAsar({ realAsar, stagedAsar, shaParcheElegido }) {
  const ident = leerInstallationIdParaRescate();
  if (ident.estado !== 'valido') throw new Error(`la identidad de este equipo (installation-id) está ${ident.estado}`);
  const dir = carpetaRecuperacionAsar();
  if (!dir) throw new Error('no hay carpeta de recuperación local (%LOCALAPPDATA%)');
  const man = leerManifiestoProcedencia();
  // Un registro que existe pero no se lee NO se pisa: es la pista de lo que pasó.
  if (man.estado === 'ilegible') throw new Error(`el registro de procedencia existe pero no se puede leer (${man.motivo})`);
  const j = man.estado === 'valido' ? man.manifiesto : { v: 1, installation_id: ident.id, operaciones: [] };

  const operationId = crypto.randomBytes(8).toString('hex'); // 1
  const nombreCopia = `app.asar.pred-${operationId}`;
  const copia = path.join(dir, nombreCopia);
  const shaAnterior = sha256HexArchivoP18(realAsar); // 2
  // 7: lo que el ayudante va a instalar es EXACTAMENTE lo que se verificó al elegirlo.
  const shaNuevoEsperado = sha256HexArchivoP18(stagedAsar);
  if (shaNuevoEsperado !== shaParcheElegido) throw new Error('la copia preparada del parche no coincide con el archivo elegido');
  // Reaplicar exactamente lo instalado no crea ninguna relación útil de rescate.
  if (shaNuevoEsperado === shaAnterior) {
    const e = new Error('el parche elegido es exactamente el app.asar que ya está instalado');
    e.p18Identico = true;
    throw e;
  }
  originalFs.mkdirSync(dir, { recursive: true });
  try {
    originalFs.copyFileSync(realAsar, copia); // 3
    const shaCopia = sha256HexArchivoP18(copia); // 4: RELEÍDA, no el hash de origen
    if (shaCopia !== shaAnterior) throw new Error('la copia local de recuperación no coincide con el app.asar instalado'); // 5
    j.operaciones.push({
      operation_id: operationId,
      installation_id: ident.id,
      estado: 'preparada',
      sha256_anterior: shaAnterior,
      version_anterior: versionDeAsar(copia), // 6: sin ejecutar nada
      nombre_copia: nombreCopia,
      sha256_copia_local: shaCopia,
      sha256_nuevo_esperado: shaNuevoEsperado,
      version_nueva_esperada: versionDeAsar(stagedAsar),
      sha256_nuevo_real: null,
      creada_at: new Date().toISOString(),
      verificada_at: null,
      motivo_fallo: null,
    });
    guardarManifiestoProcedencia(j); // 8
    return { operationId, copia };
  } catch (e) {
    try {
      originalFs.unlinkSync(copia);
    } catch (e2) {
      /* no llegó a crearse */
    }
    throw e;
  }
}

function purgeOldAsarBackups(dir) {
  // Los nombres de estas copias (app.asar.bak-<fecha>) no terminan en
  // ".asar" literal, pero se usa originalFs de todas formas — sin coste, y
  // sin tener que fiarse de dónde exactamente traza Electron la línea del
  // parcheado de fs (ver el comentario junto al require() de original-fs).
  let files;
  try {
    files = originalFs
      .readdirSync(dir)
      .filter((f) => f.startsWith('app.asar.bak-'))
      .map((f) => ({ f, t: originalFs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
  } catch (e) {
    return;
  }
  files.slice(ASAR_PATCH_BACKUP_KEEP).forEach(({ f }) => {
    try {
      originalFs.unlinkSync(path.join(dir, f));
    } catch (e) {
      /* no crítico */
    }
  });
}

// ------------------------------------------------------------------
// "Cambiar ubicación de los datos..." / "Volver a la de por defecto" —
// v0.1.30. Ver la nota grande junto a applyCustomUserDataDirIfConfigured()
// al principio del archivo para el porqué de todo esto.
// ------------------------------------------------------------------
async function changeUserDataLocation(parentWin) {
  const currentDir = app.getPath('userData');
  const picked = dialog.showOpenDialogSync(parentWin || undefined, {
    title: 'Elegir carpeta donde guardar los datos de Panorama del Servicio',
    defaultPath: currentDir,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (!picked || !picked[0]) return;
  const target = picked[0];

  if (path.resolve(target) === path.resolve(currentDir)) {
    await modalAlert(parentWin, 'Ya estás usando esa carpeta.', { title: 'Sin cambios' });
    return;
  }

  // Si la carpeta elegida ya tiene datos de Panorama del Servicio dentro
  // (por ejemplo, porque ya es la carpeta compartida donde otro PC ya
  // guardó, vía Google Drive/OneDrive), no se sobrescribe sin preguntar.
  const targetHasData = fs.existsSync(path.join(target, 'panorama.sqlite3'));

  let copyExisting = false;
  if (targetHasData) {
    const useAsIs = await modalConfirm(
      parentWin,
      'Esa carpeta ya contiene una base de datos de Panorama del Servicio.\n\n' +
        'Lo normal si es la carpeta compartida de otro PC ya sincronizada — en ese caso hay que ' +
        'usar esos datos tal cual y NO copiar nada encima, o se pisarían.\n\n' +
        '¿Usar esa carpeta TAL CUAL está (recomendado si viene de otro PC)?',
      { title: 'La carpeta elegida ya tiene datos', confirmLabel: 'Usar tal cual (no copiar nada)' }
    );
    if (!useAsIs) return;
  } else {
    // v2.0.32 — FASE 5c: el diálogo nativo original tenía 3 botones
    // (Cancelar / No copiar / Copiar todo) en un solo showMessageBoxSync.
    // psConfirm (vendor/modal.js) solo da a elegir entre 2 (confirmar/
    // cancelar) — se descompone en dos preguntas encadenadas que cubren las
    // mismas 3 salidas: (1) seguir adelante o cancelar todo el cambio de
    // carpeta, (2) si se sigue, copiar los datos actuales o empezar vacío.
    const proceed = await modalConfirm(
      parentWin,
      'La carpeta elegida está vacía (o no tiene datos de Panorama del Servicio todavía).\n\n' +
        `Origen: ${currentDir}\nDestino: ${target}\n\n` +
        '¿Seguir adelante con el cambio a esta carpeta?',
      { title: 'Carpeta vacía elegida', confirmLabel: 'Seguir adelante', cancelLabel: 'Cancelar todo el cambio' }
    );
    if (!proceed) return;
    copyExisting = await modalConfirm(
      parentWin,
      '¿Copiar ahora todos tus proyectos, backups y el Directorio de Talento actuales a la carpeta nueva?\n\n' +
        `Origen: ${currentDir}\nDestino: ${target}\n\n` +
        'Recomendado — si eliges no copiar, la carpeta nueva empezará vacía.',
      { title: 'Copiar los datos actuales', confirmLabel: 'Copiar todo', cancelLabel: 'No copiar (empezar vacío)' }
    );
  }

  // v0.1.57: pregunta explícita, pedida a raíz de que el usuario señaló que
  // no había forma de saber si una carpeta elegida aquí es compartida (Drive/
  // OneDrive, entre varios PCs) o solo un cambio LOCAL (por ejemplo, a otro
  // disco de este mismo PC). Antes se asumía SIEMPRE que era compartida —
  // ahora se pregunta y se guarda la respuesta, para no activar de más (ni
  // de menos) la protección de apagado, la espera al arrancar, y el bloqueo
  // multi-PC, que solo pintan algo con una carpeta de verdad compartida.
  // v2.0.32 — FASE 5c: en el diálogo nativo, `cancelId:1` hacía que Escape
  // equivaliera a "Sí, es compartida" (opción seguridad-primero, deja las
  // protecciones activadas si el usuario no decide). psConfirm siempre trata
  // Escape/clic-fuera como cancelar (=false aquí="no es compartida"), así
  // que ese caso límite concreto (Escape en este paso exacto) cambia de
  // comportamiento: antes asumía compartida, ahora asume local. Documentado,
  // no es un fix a medias — es una consecuencia conocida de usar el modal
  // propio compartido, que no permite elegir qué botón es el "seguro" por
  // defecto en Escape.
  const isShared = await modalConfirm(
    parentWin,
    '¿Esa carpeta la vas a compartir entre varios PCs (por ejemplo, dentro de Google Drive u OneDrive)?\n\n' +
      'Si es compartida, se activan solas la protección de apagado, la espera al arrancar por si Drive/' +
      'OneDrive sigue sincronizando, y el aviso si otro PC la tiene abierta a la vez.\n\n' +
      'Si es solo un cambio de carpeta LOCAL (por ejemplo, a otro disco de este mismo PC, sin compartir ' +
      'con nadie), esas protecciones no hacen falta y se quedan desactivadas.',
    {
      title: '¿Es una carpeta compartida?',
      confirmLabel: 'Sí, es compartida (Drive/OneDrive...)',
      cancelLabel: 'No es compartida (solo local)',
    }
  );

  if (copyExisting) {
    try {
      fs.cpSync(currentDir, target, { recursive: true, force: true });
    } catch (e) {
      await modalAlert(
        parentWin,
        'No se ha cambiado nada — sigues usando la carpeta de antes. Detalle: ' +
          String((e && e.message) || e) +
          errorCodeSuffix('PS-3001'),
        { title: 'No se pudo copiar los datos', danger: true }
      );
      return;
    }
  }

  try {
    fs.mkdirSync(path.dirname(userDataConfigPath()), { recursive: true });
    fs.writeFileSync(userDataConfigPath(), JSON.stringify({ userDataDir: target, shared: isShared }, null, 2), 'utf8');
  } catch (e) {
    await modalAlert(
      parentWin,
      'Los datos se copiaron (si elegiste copiar), pero no se pudo guardar la preferencia — inténtalo otra vez. Detalle: ' +
        String((e && e.message) || e) +
        errorCodeSuffix('PS-3002'),
      { title: 'No se pudo guardar la nueva ubicación', danger: true }
    );
    return;
  }

  // P22: constancia durable de que este equipo usa una carpeta de datos propia,
  // en cuanto se guarda la elección (no al siguiente arranque).
  registrarUbicacionPersonalizada(target, isShared);

  await modalAlert(
    parentWin,
    'La aplicación se va a reiniciar para usar la nueva carpeta de datos.\n\n' +
      `Nueva carpeta:\n${target}\n\nMarcada como: ${isShared ? 'compartida (Drive/OneDrive...)' : 'local, no compartida'}`,
    { title: 'Ubicación cambiada' }
  );
  app.relaunch();
  app.exit(0);
}

async function resetUserDataLocationToDefault(parentWin) {
  const configFile = userDataConfigPath();
  if (!fs.existsSync(configFile)) {
    await modalAlert(parentWin, 'No hay ninguna carpeta personalizada configurada.', { title: 'Ya es la de por defecto' });
    return;
  }
  const confirmed = await modalConfirm(
    parentWin,
    'Esto NO borra ningún dato, solo deja de usar la carpeta personalizada.\n\n' +
      'La aplicación se reiniciará usando la carpeta de datos por defecto de Windows.',
    { title: 'Volver a la carpeta de datos por defecto', confirmLabel: 'Volver a la de por defecto' }
  );
  if (!confirmed) return;
  // P22: la historia NO se borra. Se anota la decisión (con su fecha) y se
  // quita solo location.json: así, si mañana aparece una base de datos local
  // rara, la app sigue sabiendo que este equipo tuvo una ubicación propia.
  registrarDecisionUbicacion('volver-a-por-defecto');
  try {
    fs.unlinkSync(configFile);
  } catch (e) {
    await modalAlert(parentWin, String((e && e.message) || e) + errorCodeSuffix('PS-3003'), {
      title: 'No se pudo quitar la configuración',
      danger: true,
    });
    return;
  }
  app.relaunch();
  app.exit(0);
}

// ------------------------------------------------------------------
// Protección de apagado (Drive/OneDrive) — v0.1.54. Nace directamente de la
// pregunta del usuario tras el arreglo de la 0.1.53: "si no sincronizo todo
// del drive ni siquiera los backups me dará como nuevo, ¿no?" — cierto, y
// esta es la otra mitad del problema: si Windows se apaga con Drive/OneDrive
// a medio subir/bajar, la carpeta compartida puede quedar en un estado
// incompleto para el SIGUIENTE PC que la abra, por buena que sea la
// protección ya añadida dentro de la propia app.
//
// El usuario propuso un script de PowerShell propio (adjuntado como
// DeployDriveSyncShutdown.ps1) enganchado como script de "Apagado" de
// Directiva de Grupo. Se evaluó y se descartó ESE enganche concreto: los
// scripts de apagado de Windows corren DESPUÉS de cerrar la sesión de
// usuario, momento en el que procesos por-usuario como Drive/OneDrive ya
// están cerrados — no llegaría a medir nada útil. En su lugar, esto usa la
// vía correcta y documentada por Microsoft para este caso: un proceso de
// fondo POR USUARIO (arrancado al iniciar sesión, sin permisos de
// administrador) que intercepta WM_QUERYENDSESSION y usa
// ShutdownBlockReasonCreate/Destroy — ver drive-sync-guard/DriveSyncGuard.ps1
// para la implementación completa y sus propios comentarios.
//
// IMPORTANTE (honestidad): el mecanismo de bloqueo de apagado en sí NO se
// puede verificar de extremo a extremo desde este entorno de desarrollo
// (Linux, sin Windows real) — Wine solo sirve para confirmar que el .exe
// arranca, no reproduce un apagado real de Windows. Lo que sí se comprueba
// aquí es que activar/desactivar hace lo que dice (escribe/borra el archivo
// de estado, registra/quita la entrada de arranque automático, arranca el
// proceso de fondo) — el comportamiento real durante un apagado hay que
// confirmarlo en un Windows de verdad.
//
// v0.1.56 — YA NO es un interruptor manual. Pedido explícito del usuario:
// "la protección de apagado... se podría quitar [el interruptor] y que se
// active si se selecciona que los datos van a estar... en la nube, porque
// lo lógico es que funcione en esos casos". Ahora se activa/desactiva sola
// en cada arranque según isUsingSharedDataLocationNow() (v0.1.57: exige
// además que la carpeta esté marcada como compartida, no solo que sea
// personalizada — ver el comentario junto a esa función) — ver
// syncDriveSyncGuardWithLocation() más abajo y su llamada en
// app.whenReady(). enableDriveSyncGuardSilently/disableDriveSyncGuardSilently
// son la misma mecánica de antes (mismo archivo de estado, misma entrada de
// registro, mismo proceso de fondo) sin los diálogos de confirmación, que ya
// no tienen sentido para algo que decide la propia app sola.
function driveSyncGuardDataDir() {
  // A propósito NUNCA dentro de app.getPath('userData') (que puede ser una
  // carpeta personalizada sincronizada por Drive/OneDrive) — el estado de
  // esta protección tiene que vivir en un sitio puramente local que Drive/
  // OneDrive nunca toquen, o el problema que intenta vigilar podría
  // afectar también a sus propios archivos de estado.
  const base = process.platform === 'win32' && process.env.LOCALAPPDATA ? process.env.LOCALAPPDATA : app.getPath('temp');
  return path.join(base, 'PanoramaDriveSyncGuard');
}

function driveSyncGuardEnabledFlagPath() {
  return path.join(driveSyncGuardDataDir(), 'enabled.flag');
}

function driveSyncGuardLogPath() {
  return path.join(driveSyncGuardDataDir(), 'guard.log');
}

// v0.1.60: DriveSyncGuard.ps1 toca este archivo en CADA sondeo (cada 5s),
// pase lo que pase — es la señal de vida que permite distinguir "el
// proceso está corriendo de verdad" de "enabled.flag existe" (que solo
// significa "debería estarlo"). Ver isDriveSyncGuardActuallyAlive().
function driveSyncGuardHeartbeatPath() {
  return path.join(driveSyncGuardDataDir(), 'heartbeat.txt');
}

// v0.1.61: hallazgo real en dos PCs distintos (uno corporativo con Sophos,
// otro personal con solo el Defender de serie) — el guard lanzado A MANO
// por el usuario funciona perfecto, pero el mismo lanzamiento hecho por la
// app (oculto, `-WindowStyle Hidden`, separado de la consola) no deja
// ningún rastro: ni guard.log ni heartbeat.txt llegan a crearse, sin
// ningún error visible tampoco por el lado de Node (spawn() no lanza
// excepción, no hay evento 'error'). Como el proceso se lanza con
// `stdio: 'ignore'`, cualquier mensaje real que soltara PowerShell (un
// error de verdad, no necesariamente un antivirus matándolo) se pierde sin
// que nadie lo vea. Este archivo captura esa salida — sin cambiar nada más
// del comportamiento (sigue oculto, sigue igual de discreto) — para poder
// ver la próxima vez qué pasa de verdad en vez de tener que deducirlo
// indirectamente desde fuera.
function driveSyncGuardSpawnDiagPath() {
  return path.join(driveSyncGuardDataDir(), 'spawn-diagnostico.log');
}

function driveSyncGuardScriptPath() {
  return path.join(process.resourcesPath, 'drive-sync-guard', 'DriveSyncGuard.ps1');
}

// v0.1.68 -- ver el comentario largo junto a la construcción del XML de
// la tarea programada, en enableDriveSyncGuardSilently.
function driveSyncGuardVbsLauncherPath() {
  return path.join(process.resourcesPath, 'drive-sync-guard', 'LaunchHidden.vbs');
}

function isDriveSyncGuardEnabled() {
  try {
    return fs.existsSync(driveSyncGuardEnabledFlagPath());
  } catch (e) {
    return false;
  }
}

// v0.1.60 — auditoría pedida por el usuario ("que sea profesional y segura
// en todos sus aspectos"): hasta ahora la app solo comprobaba que
// `enabled.flag` existiera para decir "protección activa" — eso es lo que
// permitió que el bug de codificación de la 0.1.58 pasara inadvertido
// durante tres versiones enteras, porque el flag decía "activa" aunque el
// proceso real nunca llegara a correr. Esta función comprueba de verdad si
// el proceso sigue vivo, mirando cuándo tocó `heartbeat.txt` por última
// vez (DriveSyncGuard.ps1 lo actualiza en cada sondeo, cada 5s, pase lo
// que pase). Un margen de HEARTBEAT_STALE_MS bastante mayor que el
// intervalo de sondeo real (5s) para no dar falsos positivos por un
// sondeo puntual que tarde un poco más de la cuenta.
const DRIVE_SYNC_GUARD_HEARTBEAT_STALE_MS = 25000;

// v0.1.66 -- nombre de la tarea del Programador de tareas de Windows que
// lanza DriveSyncGuard.ps1. Ver el comentario largo junto a
// enableDriveSyncGuardSilently() para el porqué de este cambio (spawn()
// directo desde Electron falla siempre en Windows ARM64, confirmado en
// vivo por el usuario -- ver 0.1.66 en panorama-app-project-context.md).
const DRIVE_SYNC_GUARD_TASK_NAME = 'PanoramaDriveSyncGuardLaunch';

// v0.1.67 -- escapado mínimo para insertar texto (la ruta del script)
// dentro de un valor de elemento en la definición XML de la tarea
// programada. La ruta viene de process.resourcesPath, así que en la
// práctica nunca lleva estos caracteres, pero conviene no dar por hecho
// que un nombre de carpeta/usuario nunca los tendrá.
function escapeXmlText(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isDriveSyncGuardActuallyAlive() {
  try {
    const stat = fs.statSync(driveSyncGuardHeartbeatPath());
    return Date.now() - stat.mtimeMs < DRIVE_SYNC_GUARD_HEARTBEAT_STALE_MS;
  } catch (e) {
    return false; // no existe (nunca llegó a arrancar) o no se pudo consultar: se trata como "no vivo"
  }
}

function enableDriveSyncGuardSilently(reason) {
  if (process.platform !== 'win32') return;

  const scriptPath = driveSyncGuardScriptPath();
  if (!fs.existsSync(scriptPath)) {
    appLog(`Aviso — no se pudo activar sola la protección de apagado: falta ${scriptPath} (copia anterior a la 0.1.54).`);
    return;
  }

  try {
    fs.mkdirSync(driveSyncGuardDataDir(), { recursive: true });
    fs.writeFileSync(driveSyncGuardEnabledFlagPath(), new Date().toISOString(), 'utf8');
  } catch (e) {
    appLog(`ERROR PS-1010 — no se pudo activar sola la protección de apagado (${reason}): ${String((e && e.message) || e)}`);
    return;
  }

  // Arranque automático al iniciar sesión — vía HKCU (no hace falta admin).
  // v0.1.67: `windowsHide: true` en TODOS los execFile de esta función —
  // sin esto, cada vez que Node lanza un proceso de consola (reg.exe,
  // schtasks.exe) desde una app sin consola propia, Windows hace parpadear
  // brevemente una ventana negra. Antes de la 0.1.66 esto solo pasaba una
  // vez por activación (poco visible); desde la 0.1.66 el ciclo de
  // relanzamiento llama a schtasks varias veces por minuto, y el usuario
  // lo confirmó en vivo: "cada ciertos segundos se me abre una ventana cmd
  // incomoda en negro".
  execFile(
    'reg.exe',
    [
      'add',
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
      '/v',
      'PanoramaDriveSyncGuard',
      '/t',
      'REG_SZ',
      '/d',
      `powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "${scriptPath}"`,
      '/f',
    ],
    { windowsHide: true },
    (err) => {
      if (err) {
        appLog(`Aviso — reg.exe no pudo registrar el arranque automático de la protección de apagado: ${String((err && err.message) || err)}`);
      }
    }
  );

  // Arranca ya mismo también, para no obligar a cerrar sesión y volver a
  // entrar antes de que la protección esté activa de verdad.
  //
  // v0.1.66 -- CAUSA REAL ENCONTRADA Y CONFIRMADA EN VIVO (no es una
  // hipótesis más): esta máquina es un Windows en ARM64 (Surface Pro con
  // chip Snapdragon/ARM). electron-builder no fija arquitectura, así que
  // la app compila x64 por defecto y corre bajo el emulador de Windows.
  // Un proceso x64 emulado que lanza `powershell.exe` directamente vía
  // `spawn()` falla SIEMPRE en esta máquina, de forma limpia y casi
  // instantánea (código 0, sin ejecutar ni la primera línea del script) —
  // confirmado reproduciendo ese mismo spawn() exacto fuera de la app
  // (`ELECTRON_RUN_AS_NODE=1` sobre el propio .exe instalado), con
  // resultado idéntico. El mismo lanzamiento hecho por un proceso ARM64
  // nativo SIEMPRE funciona — confirmado con consola interactiva,
  // Start-Process, ProcessStartInfo, y de forma decisiva con una tarea
  // del Programador de tareas de Windows (ejecuta desde su propio
  // servicio del sistema, nativo ARM64, fuera del árbol de procesos de
  // Electron) — las cuatro pruebas, hechas en vivo por el usuario, llegan
  // limpias hasta Application.Run. Por eso el lanzamiento pasa de
  // spawn() directo a una tarea programada efímera: rodea el problema
  // por completo sin necesitar saber la causa interna exacta del fallo
  // bajo emulación, y en Windows x64 normal (sin emulación) debería
  // funcionar igual de bien. El registro de arranque automático al
  // iniciar sesión (reg.exe, más arriba) no cambia — lo ejecuta
  // explorer.exe, que en ARM64 es nativo, así que nunca sufrió esto.
  const diagPath = driveSyncGuardSpawnDiagPath();
  try {
    fs.appendFileSync(diagPath, `\n===== ${new Date().toISOString()} -- intento de lanzar guard (${reason}) -- v0.1.69: via Programador de tareas + wscript/vbs (arg unico: solo ruta del script) =====\n`, 'utf8');
  } catch (e) {
    // No crítico: si no se puede escribir el diagnóstico, se lanza igual.
  }

  // v0.1.67 -- segundo hallazgo del usuario probando la 0.1.66 en vivo:
  // el guard SÍ arrancaba (trace-arranque.log completo, heartbeat.txt
  // avanzando) pero se paraba solo a los ~50s. Causa confirmada con
  // `Get-ScheduledTask ... .Settings`: `schtasks /create` básico (sin
  // /xml) crea la tarea con `DisallowStartIfOnBatteries=True` y
  // `StopIfGoingOnBatteries=True` por defecto -- el propio Programador de
  // tareas mata el proceso si el equipo pasa a batería, justo el
  // escenario (portátil, cerrando sesión con la sincronización a medias)
  // en el que más falta hace que el guard siga vivo. `schtasks.exe` no
  // tiene ningún parámetro de línea de comandos para tocar esto — hace
  // falta crear la tarea a partir de una definición XML para desactivar
  // esas dos condiciones explícitamente (confirmado: no existe atajo más
  // simple, solo /create /xml da acceso a esta configuración).
  //
  // v0.1.68 -- tercer hallazgo del usuario probando la 0.1.67 en vivo: la
  // tarea ya no se moría, pero seguía saltando una ventana de consola
  // negra visible — y esta vez confirmado que aparece justo al ABRIR la
  // app (momento en que se dispara la tarea si el guard no estaba vivo),
  // no de forma aleatoria. `windowsHide: true` en los `execFile` de la
  // 0.1.67 tapa el parpadeo de los propios `schtasks.exe` (crear/lanzar/
  // borrar la tarea, procesos cortos que solo consultan/registran), pero
  // NO puede tapar lo que pasa DENTRO de la propia tarea: el Programador
  // de tareas, al crear el proceso de la ACCIÓN de la tarea
  // (`powershell.exe -WindowStyle Hidden ...`) desde su propio servicio,
  // puede hacer parpadear brevemente una ventana de consola antes de que
  // `-WindowStyle Hidden` surta efecto — es un comportamiento conocido de
  // Windows específico de este contexto (proceso creado por el servicio
  // del Programador de tareas), distinto de crearlo desde una consola
  // interactiva. La solución estándar: que la ACCIÓN de la tarea no sea
  // `powershell.exe` directamente, sino `wscript.exe` ejecutando un
  // lanzador auxiliar (`LaunchHidden.vbs`, nuevo en esta versión, en
  // `extraResources` junto a `DriveSyncGuard.ps1`) que a su vez lanza
  // PowerShell vía `WScript.Shell.Run(..., 0, False)` — el `0` como
  // segundo parámetro es una ventana genuinamente oculta desde el primer
  // instante, sin la ventana intermedia que crea Task Scheduler al
  // ejecutar directamente un binario de consola.
  //
  // /sd en el pasado (fecha inequívoca sea cual sea el formato regional:
  // día y mes ambos "01") para que el disparador ONCE nunca se dispare
  // solo — esta tarea solo se ejecuta cuando la propia app llama
  // `schtasks /run` explícitamente, justo después de crearla/actualizarla.
  // v0.1.69 -- el diseño original de la 0.1.68 pasaba el COMANDO
  // powershell.exe entero (con sus propias comillas internas escapadas
  // como \") como UN solo argumento hacia LaunchHidden.vbs. En el papel el
  // parseo de argv (XML -> argv de wscript.exe -> WScript.Arguments) debía
  // reconstruir la cadena tal cual, pero la prueba en vivo del usuario lo
  // desmintió: tras un `schtasks /run` manual no aparecía NINGÚN
  // powershell.exe con los argumentos esperados (solo procesos ajenos, sin
  // argumentos), y trace-arranque.log no ganaba ninguna línea nueva -- es
  // decir, LaunchHidden.vbs no estaba llegando a lanzar nada, probablemente
  // porque WScript.Arguments(0) no contenía lo que se esperaba tras esa
  // doble capa de comillas anidadas.
  //
  // Arreglo: reducir la superficie de escapado al mínimo. La tarea ya no
  // le pasa a LaunchHidden.vbs el comando completo de powershell (con
  // comillas anidadas) -- le pasa solo la RUTA del script (una única cadena
  // entre comillas simples, sin comillas internas), y es el propio
  // LaunchHidden.vbs quien construye la línea de comandos de powershell.exe
  // por su cuenta con concatenación de VBScript (ver ese archivo). Con esto
  // solo hay UNA capa de comillas en todo el camino XML -> argv de
  // wscript.exe, sin comillas anidadas de por medio.
  const vbsLauncherPath = driveSyncGuardVbsLauncherPath();
  const taskArguments = `//B "${vbsLauncherPath}" "${scriptPath}"`;
  const taskXmlPath = path.join(driveSyncGuardDataDir(), 'task-definition.xml');
  const taskXml =
    '<?xml version="1.0" encoding="UTF-16"?>\r\n' +
    '<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">\r\n' +
    '  <Triggers>\r\n' +
    '    <TimeTrigger>\r\n' +
    '      <StartBoundary>2020-01-01T00:00:00</StartBoundary>\r\n' +
    '      <Enabled>true</Enabled>\r\n' +
    '    </TimeTrigger>\r\n' +
    '  </Triggers>\r\n' +
    '  <Principals>\r\n' +
    '    <Principal id="Author">\r\n' +
    '      <LogonType>InteractiveToken</LogonType>\r\n' +
    '      <RunLevel>LeastPrivilege</RunLevel>\r\n' +
    '    </Principal>\r\n' +
    '  </Principals>\r\n' +
    '  <Settings>\r\n' +
    '    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>\r\n' +
    '    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>\r\n' +
    '    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>\r\n' +
    '    <AllowHardTerminate>true</AllowHardTerminate>\r\n' +
    '    <StartWhenAvailable>false</StartWhenAvailable>\r\n' +
    '    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>\r\n' +
    '    <IdleSettings>\r\n' +
    '      <StopOnIdleEnd>false</StopOnIdleEnd>\r\n' +
    '      <RestartOnIdle>false</RestartOnIdle>\r\n' +
    '    </IdleSettings>\r\n' +
    '    <AllowStartOnDemand>true</AllowStartOnDemand>\r\n' +
    '    <Enabled>true</Enabled>\r\n' +
    '    <Hidden>false</Hidden>\r\n' +
    '    <RunOnlyIfIdle>false</RunOnlyIfIdle>\r\n' +
    '    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>\r\n' +
    '    <Priority>7</Priority>\r\n' +
    '  </Settings>\r\n' +
    '  <Actions Context="Author">\r\n' +
    '    <Exec>\r\n' +
    '      <Command>wscript.exe</Command>\r\n' +
    `      <Arguments>${escapeXmlText(taskArguments)}</Arguments>\r\n` +
    '    </Exec>\r\n' +
    '  </Actions>\r\n' +
    '</Task>\r\n';

  try {
    fs.writeFileSync(taskXmlPath, '\uFEFF' + taskXml, 'utf16le');
  } catch (e) {
    appLog(`Aviso — no se pudo escribir la definición de la tarea de lanzamiento: ${String((e && e.message) || e)}`);
    try {
      fs.appendFileSync(diagPath, `[${new Date().toISOString()}] Error al escribir task-definition.xml: ${String((e && e.message) || e)}\n`, 'utf8');
    } catch (e2) { /* no crítico */ }
    return;
  }

  execFile(
    'schtasks.exe',
    ['/create', '/tn', DRIVE_SYNC_GUARD_TASK_NAME, '/xml', taskXmlPath, '/f'],
    { windowsHide: true },
    (createErr) => {
      if (createErr) {
        appLog(`Aviso — no se pudo registrar la tarea de lanzamiento de la protección de apagado: ${String((createErr && createErr.message) || createErr)}`);
        try {
          fs.appendFileSync(diagPath, `[${new Date().toISOString()}] Error al crear la tarea programada: ${String((createErr && createErr.message) || createErr)}\n`, 'utf8');
        } catch (e2) { /* no crítico */ }
        return;
      }
      execFile('schtasks.exe', ['/run', '/tn', DRIVE_SYNC_GUARD_TASK_NAME], { windowsHide: true }, (runErr) => {
        if (runErr) {
          appLog(`Aviso — la protección de apagado no pudo arrancar ahora mismo: ${String((runErr && runErr.message) || runErr)}`);
          try {
            fs.appendFileSync(diagPath, `[${new Date().toISOString()}] Error al disparar la tarea programada: ${String((runErr && runErr.message) || runErr)}\n`, 'utf8');
          } catch (e2) { /* no crítico */ }
        } else {
          try {
            fs.appendFileSync(diagPath, `[${new Date().toISOString()}] Tarea programada disparada correctamente (esto NO confirma que el script en sí haya arrancado -- eso lo dicen trace-arranque.log y heartbeat.txt).\n`, 'utf8');
          } catch (e2) { /* no crítico */ }
        }
      });
    }
  );

  appLog(`Protección de apagado (Drive/OneDrive) activada sola (${reason}).`);
  refreshAllMenus();
}

function disableDriveSyncGuardSilently(reason) {
  if (!isDriveSyncGuardEnabled()) return;

  try {
    fs.unlinkSync(driveSyncGuardEnabledFlagPath());
  } catch (e) {
    appLog(`ERROR PS-1011 — no se pudo desactivar sola la protección de apagado (${reason}): ${String((e && e.message) || e)}`);
    return;
  }

  if (process.platform === 'win32') {
    execFile(
      'reg.exe',
      ['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'PanoramaDriveSyncGuard', '/f'],
      { windowsHide: true },
      (err) => {
        if (err) {
          appLog(`Aviso — no se pudo quitar la entrada de arranque automático de la protección de apagado: ${String((err && err.message) || err)}`);
        }
      }
    );
    // v0.1.66: la tarea del Programador de tareas que lanza el guard (ver
    // enableDriveSyncGuardSilently) tampoco debe quedar como resto suelto
    // al desactivar la protección.
    execFile('schtasks.exe', ['/delete', '/tn', DRIVE_SYNC_GUARD_TASK_NAME, '/f'], { windowsHide: true }, (err) => {
      if (err) {
        // No crítico: lo normal si nunca llegó a crearse (p.ej. la
        // protección se desactivó antes de necesitar el primer relanzamiento).
      }
    });
  }

  appLog(`Protección de apagado (Drive/OneDrive) desactivada sola (${reason}).`);
  refreshAllMenus();
}

// Se llama en cada arranque (ver app.whenReady), una vez ya se sabe con
// certeza qué carpeta de datos se está usando de verdad esta sesión (tras
// checkCustomLocationDatabaseSanity, que puede haber hecho fallback a la
// carpeta por defecto). Sincroniza el estado activo/inactivo con
// isUsingSharedDataLocationNow() — nada que hacer si ya coincide. v0.1.57:
// antes usaba isUsingCustomDataLocationNow() (cualquier carpeta
// personalizada, sin distinguir compartida de local) — ahora exige además
// que esté marcada como compartida.
function syncDriveSyncGuardWithLocation() {
  if (process.platform !== 'win32') return;
  // P9: con location.json inutilizable no está demostrado que la ubicación
  // "no sea compartida", así que la protección se deja exactamente como está.
  if (configUbicacionNoResuelta) return;
  // P22: una sesión LOCAL TEMPORAL (el usuario aceptó usar la carpeta local
  // porque la suya no estaba disponible, o porque falta la configuración) no es
  // un cambio de ubicación: no se desactiva la protección, no se borra su marca
  // y no se pierde la señal de que este equipo usa una carpeta compartida.
  // Volver a la carpeta por defecto A PROPÓSITO sí sigue sincronizándola: eso
  // es una decisión permanente, no un camino de reserva.
  if (sesionLocalTemporal) return;
  const shouldBeOn = isUsingSharedDataLocationNow();
  const isOn = isDriveSyncGuardEnabled();
  if (shouldBeOn && !isOn) {
    enableDriveSyncGuardSilently('ubicación de datos compartida en uso');
  } else if (!shouldBeOn && isOn) {
    disableDriveSyncGuardSilently('se está usando la ubicación de datos por defecto');
  } else if (shouldBeOn && isOn && !isDriveSyncGuardActuallyAlive()) {
    // v0.1.60: el flag dice "activa", pero el proceso de fondo no ha dado
    // señales de vida recientes (ver isDriveSyncGuardActuallyAlive) — pudo
    // morir por cualquier motivo (antivirus, una actualización de
    // Windows, que lo mataran a mano en el Administrador de tareas...).
    // Se relanza en vez de confiar ciegamente en el flag, que es
    // exactamente lo que dejó pasar sin detectar el bug de la 0.1.58
    // durante tres versiones seguidas. Esta misma función se llama tanto
    // en cada arranque como periódicamente mientras la app está en
    // marcha (ver startUserDataWatchdog), así que una muerte a media
    // sesión también se cura sola, no solo al reabrir la app.
    appLog('Aviso — la protección de apagado estaba marcada como activa pero el proceso no daba señales de vida recientes; relanzando.');
    enableDriveSyncGuardSilently('proceso sin señales de vida recientes, relanzando');
  }
}

async function openDriveSyncGuardLog(parentWin) {
  const logPath = driveSyncGuardLogPath();
  if (!fs.existsSync(logPath)) {
    const detail = isDriveSyncGuardEnabled()
      ? 'Está activa, pero el proceso de fondo aún no ha escrito nada — puede tardar unos segundos.'
      : 'No está activa ahora mismo: se activa sola solo cuando la carpeta de datos es una ubicación ' +
        'personalizada (compartida por Drive/OneDrive) — ahora mismo se está usando la carpeta de datos ' +
        'por defecto, donde no hace falta.';
    await modalAlert(
      parentWin,
      'Todavía no hay ningún evento registrado por la protección de apagado en esta copia.\n\n' + detail,
      { title: 'Sin registro todavía' }
    );
    return;
  }
  openPathLogged(logPath);
}

// v0.1.36: comprobación previa de permisos de escritura sobre la carpeta
// donde vive app.asar — bug real encontrado a partir de un patch-log.txt
// que el usuario nos pasó: llevaba VARIOS parches (0.1.33, 0.1.34, 0.1.35)
// fallando en silencio con "EPERM: operation not permitted" porque había
// instalado la versión 0.1.32 eligiendo "Anyone who uses this computer"
// (instalación para todos los usuarios), que NSIS pone en
// `C:\Program Files\...` — una carpeta que solo un administrador puede
// escribir. El ayudante que aplica el parche corre en un proceso separado
// y DETACHED que arranca después de que la app ya se ha cerrado (ver
// asarPatchHelperSource) — si falla ahí, no hay ninguna ventana ni diálogo
// visible para avisar, solo queda constancia en patch-log.txt, que nadie
// mira a menos que se le pida expresamente. El usuario aplicó el parche
// tres veces seguidas sin ningún error visible, y el hito recurrente
// "seguía apareciendo" simplemente porque ninguno de los tres parches
// había llegado a aplicarse nunca de verdad sobre la copia que estaba
// abriendo. Se corrige comprobando ANTES de pedir el archivo y ANTES de
// cerrar la app si se puede escribir de verdad en esa carpeta — si no se
// puede, se avisa con un diálogo claro y no se continúa (nada que
// silenciosamente falle más tarde, sin ventana para avisar).
function canWriteToAsarFolder() {
  const dir = installDirPath(); // v0.1.40: centralizado, ver comentario junto a installDirPath()
  const probe = path.join(dir, `.panorama-write-check-${Date.now()}`);
  try {
    originalFs.writeFileSync(probe, 'ok');
    originalFs.unlinkSync(probe);
    return true;
  } catch (e) {
    return false;
  }
}

async function applyAsarPatch(parentWin) {
  if (!app.isPackaged) {
    await modalAlert(
      parentWin,
      'Aplicar parche solo tiene sentido sobre la versión instalada (empaquetada), no en el entorno de desarrollo.',
      { title: 'No disponible en desarrollo', danger: true }
    );
    return;
  }

  if (!canWriteToAsarFolder()) {
    const installDir = installDirPath();
    await modalAlert(
      parentWin,
      'No se puede escribir en la carpeta de instalación — el parche NO se ha tocado ni aplicado.\n\n' +
        `Carpeta: ${installDir}\n\n` +
        'Esto pasa cuando la app se instaló para "todos los usuarios" (queda dentro de ' +
        'Archivos de programa, que solo un administrador puede modificar). Dos formas de arreglarlo:\n\n' +
        '1) Rápida, solo para esta vez: cierra la app, ábrela con clic derecho → ' +
        '"Ejecutar como administrador", y vuelve a "Aplicar parche".\n\n' +
        '2) Recomendada, para no tener que hacerlo cada vez: desinstala esta copia y vuelve a ' +
        'instalarla eligiendo "Solo para mí" en vez de "Cualquiera que use este equipo" — así queda ' +
        'en tu carpeta de usuario, sin necesitar permisos de administrador nunca más.' +
        errorCodeSuffix('PS-1001'),
      { title: 'Sin permisos para aplicar el parche aquí', okLabel: 'Entendido', danger: true }
    );
    return;
  }

  const picked = dialog.showOpenDialogSync(parentWin || undefined, {
    title: 'Seleccionar el archivo de parche (app.asar)',
    filters: [{ name: 'Parche de Panorama del Servicio', extensions: ['asar'] }],
    properties: ['openFile'],
  });
  if (!picked || !picked[0]) return;
  const chosenPath = picked[0];

  let hash;
  try {
    hash = crypto.createHash('sha256').update(originalFs.readFileSync(chosenPath)).digest('hex');
  } catch (e) {
    await modalAlert(parentWin, String((e && e.message) || e) + errorCodeSuffix('PS-1002'), {
      title: 'No se pudo leer el archivo elegido',
      danger: true,
    });
    return;
  }

  // v0.1.55: pedido explícito del usuario — hasta ahora había que comparar el
  // SHA-256 mostrado en este diálogo A MANO contra el que se le decía por
  // fuera (chat, correo...), algo tedioso y con margen de error humano. A
  // partir de esta versión, los parches que se entreguen llevan el propio
  // hash (o un prefijo suyo) EN EL NOMBRE del archivo — convención:
  // "<prefijo-sha256>-App<versión sin puntos>.asar", por ejemplo para la
  // 0.1.55: "a1b2c3d4e5f6a1b2-App0155.asar". Si el archivo elegido sigue esa
  // convención, la app puede verificar SOLA que el contenido de verdad
  // coincide con lo que el nombre dice ser, sin que el usuario tenga que
  // comparar nada a mano. Se usa SHA-256 (no MD5, que pidió el usuario
  // literalmente) porque es el mismo hash que ya se venía mostrando aquí
  // desde la 0.1.22 — más fuerte que MD5 y sin ningún coste añadido por
  // reutilizarlo tal cual.
  //
  // Si el archivo NO sigue esta convención (parches antiguos, o un nombre
  // elegido a mano), se cae al comportamiento de siempre: mostrar el hash y
  // pedir que se compare a mano — nunca se bloquea un parche válido solo por
  // no llevar el nombre en este formato nuevo.
  const patchNameMatch = path.basename(chosenPath).match(/^([0-9a-fA-F]{8,64})-App(\d+)\.asar$/i);
  const hashPrefixInName = patchNameMatch ? patchNameMatch[1].toLowerCase() : null;
  const nameMatchesHash = patchNameMatch ? hash.startsWith(hashPrefixInName) : null; // null = no aplica (nombre antiguo)
  let headline;
  let detailText;
  let canApply; // false = el hash del nombre no coincide -- solo hay que avisar, no una elección real

  if (patchNameMatch) {
    const versionInName = patchNameMatch[2];
    if (nameMatchesHash) {
      headline = 'Verificación automática del archivo: VÁLIDO';
      detailText =
        `Archivo: ${path.basename(chosenPath)}\n\n` +
        `✓ VÁLIDO — el contenido real del archivo coincide con el hash que lleva en el nombre ` +
        `(comprobado automáticamente, prefijo de ${hashPrefixInName.length} caracteres).\n` +
        `Etiqueta de versión en el nombre: App${versionInName} ` +
        `(esta app no puede comprobar por sí sola que ese número sea el correcto — solo que el ` +
        `archivo no se ha corrompido ni cambiado desde que se generó — compara ese número con el ` +
        `que se te indicó para este parche).\n\n` +
        `SHA-256 completo:\n${hash}\n\n` +
        'Al aplicar, la aplicación se cerrará. El cambio se hace mientras está cerrada; ' +
        'se reabrirá sola en cuanto termine (si por lo que sea no lo hiciera, ábrela tú mismo).';
      canApply = true;
    } else {
      headline = 'Verificación automática del archivo: NO VÁLIDO';
      detailText =
        `Archivo: ${path.basename(chosenPath)}\n\n` +
        `✗ NO VÁLIDO — el nombre del archivo dice empezar por "${hashPrefixInName}", pero el contenido ` +
        `real tiene un SHA-256 distinto:\n${hash}\n\n` +
        'Esto significa que el archivo se ha modificado, se ha corrompido, o no es el que dice ser. ' +
        'NO se puede aplicar — avisa de dónde ha salido este archivo antes de volver a intentarlo.';
      canApply = false;
    }
  } else {
    headline = 'Comprueba el SHA-256 antes de continuar';
    detailText =
      `Archivo: ${path.basename(chosenPath)}\n\nSHA-256:\n${hash}\n\n` +
      'Este archivo no sigue el formato de nombre con verificación automática ' +
      '("<hash>-AppXXXX.asar") — compara este hash con el que se te indicó para este parche a mano. ' +
      'Si no coincide EXACTAMENTE, cancela y avisa — no seguir.\n\n' +
      'Al aplicar, la aplicación se cerrará. El cambio se hace mientras está cerrada; ' +
      'se reabrirá sola en cuanto termine (si por lo que sea no lo hiciera, ábrela tú mismo).';
    canApply = true;
  }

  // v2.0.32 — FASE 5c: al pasar del diálogo nativo (con su propio `icon` de
  // imagen, check verde/triángulo ámbar generado a mano) al modal propio, se
  // perdió ese icono de un vistazo -- el usuario lo echó en falta y lo pidió
  // de vuelta. v2.0.34: vendor/modal.js gana soporte de icono-emoji
  // (opts.icon, ver ese archivo) precisamente para este caso, sin volver a
  // generar imágenes PNG a mano.
  // v2.0.49: el usuario seguía viendo el icono (✅/⚠️) "descolocado" del
  // texto "Verificación automática...: VÁLIDO/NO VÁLIDO" pese al fix de
  // v2.0.47 -- ese fix alineó el icono con el TÍTULO del diálogo ("Aplicar
  // parche"), pero el texto de verificación en sí iba metido como primera
  // línea del cuerpo del mensaje, una fila más abajo y sin relación visual
  // con el icono. La corrección real es que el headline de verificación
  // SEA el título (headline en vez de 'Aplicar parche'), para que quede en
  // la misma fila que el icono -- ver .ps-modal-head en vendor/modal.js.
  let confirmed;
  if (canApply) {
    confirmed = await modalConfirm(parentWin, detailText, {
      title: headline,
      confirmLabel: 'Aplicar y cerrar',
      icon: '✅',
    });
  } else {
    await modalAlert(parentWin, detailText, {
      title: headline,
      danger: true,
      icon: '⚠️',
    });
    return;
  }
  if (!confirmed) return;

  const stageDir = app.getPath('userData');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const realAsar = path.join(process.resourcesPath, 'app.asar');
  const stagedAsar = path.join(stageDir, `patch-pending-${stamp}.asar`);
  const backupAsar = path.join(stageDir, `app.asar.bak-${stamp}`);
  const logPath = path.join(stageDir, 'patch-log.txt');
  const helperPath = path.join(stageDir, 'apply-patch-helper.js');

  try {
    originalFs.copyFileSync(chosenPath, stagedAsar);
  } catch (e) {
    try {
      originalFs.unlinkSync(stagedAsar);
    } catch (e2) {
      /* no llegó a crearse */
    }
    await modalAlert(
      parentWin,
      'No se tocó el archivo real de la aplicación. Detalle: ' + String((e && e.message) || e) + errorCodeSuffix('PS-1003'),
      { title: 'No se pudo preparar el parche', danger: true }
    );
    return;
  }

  // P18: la operación de procedencia se prepara ANTES de tocar el app.asar
  // real — copia LOCAL de la versión actual, releída y verificada, y entrada
  // 'preparada' en el registro. Si cualquier paso falla, el parche NO se
  // aplica: no se lanza el ayudante y no queda nada utilizable para un rescate.
  // Va ANTES de la copia heredada y de su purga: un intento que falla aquí no
  // deja un .bak nuevo ni rota los de la carpeta de datos (compartida).
  let operacion;
  try {
    operacion = prepararOperacionAsar({ realAsar, stagedAsar, shaParcheElegido: hash });
  } catch (e) {
    try {
      originalFs.unlinkSync(stagedAsar);
    } catch (e2) {
      /* ya no estaba */
    }
    if (e && e.p18Identico) {
      await modalAlert(parentWin, 'Ese archivo es exactamente la versión que ya está instalada: no hay nada que aplicar.', {
        title: 'El parche ya está instalado',
      });
      return;
    }
    await modalAlert(
      parentWin,
      'No se ha aplicado el parche y no se tocó el archivo real de la aplicación: antes de sustituirlo, la app ' +
        'tiene que guardar y verificar una copia local de la versión actual para poder volver a ella, y no lo ' +
        'ha conseguido. Detalle: ' +
        String((e && e.message) || e) +
        errorCodeSuffix('PS-1003'),
      { title: 'No se pudo preparar el parche', danger: true }
    );
    return;
  }

  // Copia heredada (camino manual transitorio, hasta D4) y ayudante. Si algo
  // falla antes de que el ayudante quede lanzado, se retira lo que creó ESTE
  // intento: un .bak de más desplazaría a los históricos en la próxima purga.
  const bakYaExistia = originalFs.existsSync(backupAsar);
  const deshacerIntento = () => {
    try {
      originalFs.unlinkSync(stagedAsar);
    } catch (e) {
      /* ya no estaba */
    }
    if (!bakYaExistia) {
      try {
        originalFs.unlinkSync(backupAsar);
      } catch (e) {
        /* no llegó a crearse */
      }
    }
  };
  try {
    originalFs.copyFileSync(realAsar, backupAsar);
    fs.writeFileSync(helperPath, asarPatchHelperSource(), 'utf8');
  } catch (e) {
    deshacerIntento();
    await modalAlert(
      parentWin,
      'No se tocó el archivo real de la aplicación. Detalle: ' + String((e && e.message) || e) + errorCodeSuffix('PS-1003'),
      { title: 'No se pudo preparar el parche', danger: true }
    );
    return;
  }

  try {
    const child = spawn(
      process.execPath,
      [
        helperPath,
        String(process.pid),
        backupAsar,
        realAsar,
        stagedAsar,
        logPath,
        process.execPath,
        rutaManifiestoProcedencia(),
        operacion.operationId,
        operacion.copia,
      ],
      {
        detached: true,
        stdio: 'ignore',
        env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' }),
      }
    );
    child.unref();
  } catch (e) {
    deshacerIntento();
    await modalAlert(
      parentWin,
      'No se tocó el archivo real de la aplicación. Detalle: ' + String((e && e.message) || e) + errorCodeSuffix('PS-1004'),
      { title: 'No se pudo iniciar la aplicación del parche', danger: true }
    );
    return;
  }

  // La retención heredada (2 copias por mtime) solo se aplica con el ayudante
  // ya lanzado: un intento que no llegó hasta aquí no rota los .bak compartidos.
  purgeOldAsarBackups(stageDir);

  await modalAlert(
    parentWin,
    'La aplicación se va a cerrar ahora para aplicar el parche.\n\n' +
      'Se reabrirá sola en unos segundos en cuanto termine. ' +
      'Si por lo que sea no se reabriera, ábrela tú mismo. ' +
      `Si algo fallara, hay copia de seguridad en:\n${backupAsar}\n\nRegistro de la operación:\n${logPath}`,
    { title: 'Aplicando parche' }
  );

  setTimeout(() => app.quit(), 200);
}

// ------------------------------------------------------------------
// Descargas (Exportar CSV/Excel/PowerPoint de Riesgos, Skills, Hitos,
// Equipo, Cobertura, informe ejecutivo...): la plantilla del dashboard
// genera el archivo en memoria (Blob) y lo "descarga" con un <a download>
// normal, como haría en un navegador — nunca se tocó esa parte, sigue
// igual desde el principio. Pero Electron nunca tuvo un manejador de
// 'will-download' en esta app: sin uno, cada ventana usaba el
// comportamiento por defecto de Electron para decidir dónde guardar, sin
// preguntar nada — y la plantilla decía "exportado como X" en cuanto
// DISPARA la descarga, sin saber si de verdad se guardó ni dónde.
//
// v0.1.20 fijó ese destino a la carpeta de Descargas del sistema (creándola
// si hiciera falta) para que al menos apareciera en algún sitio fiable. El
// usuario probó esa versión y confirmó que el archivo YA aparece, pero pidió
// poder elegir dónde guardarlo cada vez — igual que "Guardar como" en
// cualquier programa de escritorio — en vez de que caiga siempre en
// Descargas sin preguntar.
//
// Primer intento de esto (con `dialog.showSaveDialog()` async + `.then()` +
// `item.setSavePath()` dentro del `.then`) parecía funcionar — el diálogo salía,
// dejaba elegir carpeta y nombre, y hasta quedaba registrado en "recientes" del
// selector de archivos — pero el archivo NUNCA llegaba a escribirse en el
// disco. Comprobado a fondo (Xvfb + xdotool, clicando "Save" de verdad en el
// diálogo nativo, no solo simulando el evento): la ruta se registraba, pero no
// aparecía ni un byte en ningún sitio. La razón, confirmada contra la propia
// documentación de Electron: `item.setSavePath()` solo es válido si se llama
// DENTRO de la propia función manejadora de `will-download`, de forma
// síncrona — la versión async de `showSaveDialog()` resuelve su promesa
// DESPUÉS de que la función manejadora ya ha terminado de ejecutarse, momento
// en el que la descarga ya ha seguido su curso (con su ruta por defecto, que
// luego se descarta) y el `setSavePath()` tardío ya no tiene ningún efecto.
// Arreglado usando la versión SÍNCRONA del diálogo, `dialog.showSaveDialogSync()`
// — bloquea el proceso principal hasta que el usuario responde, pero eso es
// justo lo que hace falta aquí: mantiene todo dentro de la misma llamada
// síncrona al manejador de `will-download`, como exige la propia API.
// Si cancela el diálogo, se cancela la descarga sin más (`item.cancel()`) —
// no se guarda nada ni se avisa de error, cancelar no es un fallo. Si elige
// guardar y aun así falla (permisos, antivirus...), sigue avisando con un
// diálogo de error visible. `app.on('session-created')` cubre TODAS las
// particiones (cada ventana de proyecto tiene la suya propia), no solo la de
// por defecto.
// ------------------------------------------------------------------
function exportSaveDialogFilters(filename) {
  const ext = path.extname(filename).replace('.', '').toLowerCase();
  const byExt = {
    csv: [{ name: 'CSV', extensions: ['csv'] }],
    xlsx: [{ name: 'Excel', extensions: ['xlsx'] }],
    pptx: [{ name: 'PowerPoint', extensions: ['pptx'] }],
    json: [{ name: 'JSON', extensions: ['json'] }],
    html: [{ name: 'Página web', extensions: ['html'] }],
  };
  return (byExt[ext] || []).concat([{ name: 'Todos los archivos', extensions: ['*'] }]);
}

app.on('session-created', (ses) => {
  // v0.1.72 -- corrector ortográfico. Chromium ya subraya en rojo las
  // palabras mal escritas de fábrica en cualquier campo de texto (eso ya
  // pasaba antes de este cambio), pero sin fijar el idioma revisa en
  // inglés por defecto -- de ahí que los acentos/erratas en español no se
  // marcaran bien. Cada ventana de proyecto usa su propia sesión con
  // partición (ver `session.fromPartition(row.partition_name)` más abajo
  // en el código), así que hay que fijar el idioma en CADA sesión nueva
  // que se crea -- de ahí este listener aquí, no una sola llamada suelta
  // en app.whenReady() (que solo tocaría la sesión por defecto).
  try {
    ses.setSpellCheckerLanguages(['es-ES']);
  } catch (e) {
    // No crítico -- si el idioma no está disponible en este Windows en
    // concreto, Chromium simplemente sigue con su idioma por defecto.
  }

  ses.on('will-download', (event, item, webContents) => {
    const suggested = item.getFilename();
    const win = BrowserWindow.fromWebContents(webContents);
    let downloadsDir;
    try {
      downloadsDir = app.getPath('downloads');
    } catch (e) {
      downloadsDir = null;
    }
    let chosenPath;
    try {
      chosenPath = dialog.showSaveDialogSync(win || undefined, {
        title: 'Guardar exportación',
        defaultPath: downloadsDir ? path.join(downloadsDir, suggested) : suggested,
        filters: exportSaveDialogFilters(suggested),
      });
    } catch (e) {
      // B3: el usuario pidió exportar y la descarga se cancela sin explicación.
      // Queda rastro para poder explicarlo después. NO se convierte en diálogo:
      // sería abrir un diálogo justo cuando el sistema de diálogos ha fallado.
      appLog('Exportación — no se pudo mostrar el diálogo de guardado; la descarga se cancela: ' + motivoSinRutas(e));
      console.warn('No se pudo mostrar el diálogo de guardado:', e);
      chosenPath = undefined;
    }
    if (!chosenPath) {
      item.cancel();
      return;
    }
    item.setSavePath(chosenPath);
    item.once('done', (evt, state) => {
      if (state !== 'completed') {
        modalAlert(
          win,
          `La exportación "${suggested}" no se pudo guardar en "${chosenPath}" (motivo: ${state}). Prueba a exportar de nuevo, o revisa que esa carpeta no esté bloqueada por el antivirus o por permisos de Windows.` +
            errorCodeSuffix('PS-4001'),
          { title: 'No se pudo guardar el archivo', danger: true }
        );
      }
    });
  });
});

// v0.1.72 -- menú del botón derecho con sugerencias del corrector
// ortográfico (hitos, descripciones, y cualquier otro campo de texto).
// Chromium ya avisa subrayando en rojo -- lo que faltaba era ALGO que
// mostrara ese menú al hacer clic derecho: Electron, a diferencia de un
// navegador normal, no trae ningún menú contextual por defecto (ni
// siquiera el básico de copiar/pegar), hay que montarlo a mano. Se
// engancha con `web-contents-created` (a nivel de app, no por ventana)
// para cubrir automáticamente TODAS las ventanas -- launcher, proyectos,
// Directorio de Talento, preparación de reunión, etc. -- incluidas las
// que se abran más adelante, sin tener que tocar cada función de
// creación de ventana por separado.
//
// Solo se muestra el menú si el clic fue sobre un campo editable o sobre
// texto seleccionado (`params.isEditable || params.selectionText`) --
// antes de este cambio no había NINGÚN menú contextual en ningún sitio
// de la app, así que se mantiene así de acotado a propósito: no añade
// menús nuevos en zonas que nunca los tuvieron (botones, tarjetas,
// gráficos...), solo donde de verdad hace falta para escribir texto.
app.on('web-contents-created', (event, contents) => {
  contents.on('context-menu', (event, params) => {
    if (!params.isEditable && !params.selectionText) return;

    const menuTemplate = [];

    if (params.misspelledWord) {
      if (params.dictionarySuggestions.length > 0) {
        for (const suggestion of params.dictionarySuggestions) {
          menuTemplate.push({
            label: suggestion,
            click: () => contents.replaceMisspelling(suggestion),
          });
        }
      } else {
        menuTemplate.push({ label: 'Sin sugerencias', enabled: false });
      }
      menuTemplate.push({ type: 'separator' });
      menuTemplate.push({
        label: 'Agregar al diccionario',
        click: () => contents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      });
      menuTemplate.push({ type: 'separator' });
    }

    if (params.isEditable) {
      menuTemplate.push(
        { label: 'Cortar', role: 'cut', enabled: params.editFlags.canCut },
        { label: 'Copiar', role: 'copy', enabled: params.editFlags.canCopy },
        { label: 'Pegar', role: 'paste', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { label: 'Seleccionar todo', role: 'selectAll', enabled: params.editFlags.canSelectAll }
      );
    } else if (params.selectionText) {
      menuTemplate.push({ label: 'Copiar', role: 'copy', enabled: params.editFlags.canCopy });
    }

    Menu.buildFromTemplate(menuTemplate).popup();
  });
});

// ------------------------------------------------------------------
// B2 (auditoría 2026-09-13) — que los fallos lleguen al usuario, POR CLASES.
//
// Antes, estos cuatro manejadores solo escribían una línea en app.log. Y como
// registrar un manejador de 'uncaughtException' DESACTIVA el cierre por
// defecto de Node, la app seguía viva en un estado indefinido y el único
// rastro era un log que nadie mira. En 9.378 líneas del app.log real no había
// disparado ninguno todavía — es una red de seguridad, no un camino frecuente.
//
// Se tratan en cuatro clases con comportamientos distintos a propósito:
//   1. uncaughtException del proceso principal -> FAIL-STOP. Ver
//      manejarFalloFatal(): no se puede seguir escribiendo desde un proceso
//      cuyas invariantes pueden estar rotas (db.js mantiene la base de datos
//      ENTERA en memoria y la reescribe completa en cada operación).
//   2. unhandledRejection que llega hasta aquí -> también fail-stop: si ha
//      llegado al manejador global es que escapó del control normal. Los
//      rechazos CONOCIDOS se capturan en su origen (arranque y vigilante, más
//      abajo) y se tratan con contexto propio.
//   3. render-process-gone / child-process-gone -> fallo LOCALIZADO. El
//      proceso principal está intacto; se recupera esa ventana sin cerrar la
//      app, distinguiendo cierres esperados de fallos reales.
//   4. Errores de las acciones de menú -> error de OPERACIÓN, ver
//      reportarErrorDeOperacion(). Nunca se convierten en fallo global.
// ------------------------------------------------------------------

// Marca de "este proceso ya no es de fiar": congela las escrituras nuevas.
// La guarda COMPLETA sería una línea en db.js run(); ese archivo está
// reservado para A3.3, así que aquí se guardan los puntos de escritura de
// main.js (ver las guardas `if (procesoComprometido)` repartidas por el
// archivo). Cobertura ~95%: puede quedar algún dbmod.run interno alcanzado
// desde una lectura.
let procesoComprometido = false;
let yaEnFalloFatal = false;
// La app se está cerrando/reiniciando a propósito: a partir de aquí, una
// ventana que muere NO es un fallo.
let cerrandoApp = false;

// Clases 1 y 2. No se deduplica ni se limita NUNCA: un fallo fatal no puede
// quedar oculto detrás de un contador.
function manejarFalloFatal(codigo, origen, err) {
  const detalle = (err && err.stack) || (err && err.message) || String(err);
  if (yaEnFalloFatal) {
    // Reentrada mientras se atiende el primero: solo queda constancia.
    appLog(`(durante el cierre por fallo fatal) ${origen}: ${detalle}`);
    return;
  }
  yaEnFalloFatal = true;
  procesoComprometido = true;
  cerrandoApp = true;

  // A3.3 BLOQUE 2 — el fail-stop llega hasta db.js.
  //
  // Va LO PRIMERO, antes de cualquier otra cosa que pudiera escribir: con el
  // latch puesto no pasa ninguna escritura, ni las internas alcanzadas desde
  // una lectura, ni vacuum(), que era el hueco conocido (main.js llama a
  // dbmod.vacuum() sin comprobar procesoComprometido). El motivo
  // 'comprometido' es irreversible: no se puede levantar ni sustituir.
  try {
    dbmod.bloquearEscrituras('comprometido');
  } catch (e) {
    /* si ni eso se puede, quedan las guardas de procesoComprometido de main.js */
  }

  appLog(`ERROR ${codigo} — FALLO FATAL (${origen}): ${detalle}`);

  // Única escritura que se permite: soltar el bloqueo multi-PC. app.exit() NO
  // emite 'before-quit', así que releaseMultiPcLockIfOwned() no correría — y
  // sin eso el propio reinicio se encontraría un ".panorama-lock.json" con
  // latido reciente y avisaría de "parece abierta en otro equipo". Es una
  // escritura pequeña que no depende de ninguna invariante en memoria.
  try {
    releaseMultiPcLockIfOwned();
  } catch (e) {
    /* si ni eso se puede, se sigue: el lock caduca solo en 2 minutos */
  }

  const restaurando = restoreInProgress.size > 0;
  const recifrando = rekeyInProgress;
  const cuerpo =
    'Panorama del Servicio ha sufrido un fallo interno y no puede seguir funcionando con garantías.\n\n' +
    'TUS DATOS ESTÁN A SALVO: el contenido de cada proyecto se guarda en cuanto lo editas, y las ' +
    'preparaciones de reunión y evaluaciones de candidatos se escriben al guardarlas. Como mucho se ' +
    'pierde la última copia de seguridad automática (hasta 15 segundos), que es una COPIA, no el ' +
    'original.\n\n' +
    'A propósito no se intenta guardar nada más antes de salir: hacerlo desde un proceso en este ' +
    'estado es justo lo que podría estropear algo.\n\n' +
    (restaurando
      ? 'AVISO: había una restauración de backup en curso. Puede haber quedado a medias — todos tus ' +
        'backups siguen intactos, así que volver a restaurar es seguro.\n\n'
      : '') +
    (recifrando
      ? 'AVISO: había un cambio de contraseña/cifrado en curso. Al volver a abrir la app se resolverá ' +
        'solo; no cambies la contraseña otra vez antes de eso.\n\n'
      : '') +
    `Detalle técnico:\n${detalle}\n\n(código ${codigo})`;

  let eleccion = 0;
  try {
    if (app.isReady()) {
      eleccion = dialog.showMessageBoxSync(undefined, {
        type: 'error',
        title: 'Panorama del Servicio — fallo grave',
        message: 'Hay que reiniciar la aplicación',
        detail: cuerpo,
        buttons: ['Reiniciar Panorama', 'Cerrar'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
    } else {
      dialog.showErrorBox('Panorama del Servicio — fallo grave', cuerpo);
      eleccion = 1;
    }
  } catch (e) {
    appLog(`No se pudo mostrar el diálogo de fallo fatal: ${String((e && e.message) || e)}`);
    eleccion = 0;
  }

  try {
    if (eleccion === 0) app.relaunch();
  } catch (e) {
    /* si no se puede programar el relanzamiento, al menos se sale */
  }
  app.exit(1);
}

process.on('uncaughtException', (err) => {
  // Durante la ventana de arranque manda handleFatalStartupError (registrado
  // antes que este, y que ya hace app.exit): no duplicar tratamiento.
  if (startupRecoveryArmed) return;
  manejarFalloFatal('PS-1013', 'excepción no capturada en el proceso principal', err);
});
process.on('unhandledRejection', (reason) => {
  if (startupRecoveryArmed) return;
  manejarFalloFatal('PS-1014', 'promesa rechazada sin manejar en el proceso principal', reason);
});

// ---- Clase 3: fallos localizados de un proceso hijo -----------------------
// Motivos que Electron da para una salida NORMAL o intencionada: no son
// fallos y no deben provocar ni aviso ni recarga.
const MOTIVOS_NORMALES = ['clean-exit', 'killed'];
const caidasPorProyecto = new Map(); // projectId -> nº de caídas en esta sesión
const caidasPorTipoHijo = new Map(); // tipo de proceso -> nº de caídas
const MAX_CAIDAS = 3;

app.on('render-process-gone', (event, webContents, details) => {
  const motivo = (details && details.reason) || 'desconocido';
  if (MOTIVOS_NORMALES.includes(motivo)) return; // salida esperada
  appLog(`ERROR PS-1015 — una ventana se cerró de forma anómala: motivo=${motivo} código=${details && details.exitCode}`);

  // No molestar si nos estamos yendo de todas formas.
  if (cerrandoApp || procesoComprometido) return;

  const win = BrowserWindow.fromWebContents(webContents);
  // Ventana ya destruida (cerrada a propósito, o eliminada con el proyecto).
  if (!win || win.isDestroyed()) return;
  // ¿Se estaba cerrando a propósito? attachFlushOnClose/A2 dejan estas marcas.
  if (win.__panoramaClosingForRestore || win.__panoramaFlushed) return;

  // Solo se recupera si sigue siendo la ventana REGISTRADA de un proyecto —
  // si el mapa ya apunta a otra, esta es un resto y recargarla sería peor.
  const entrada = [...projectWindows.entries()].find(([, w]) => w === win);
  if (!entrada) return;
  const [projectId] = entrada;
  // Y no en mitad de una restauración de ese mismo proyecto.
  if (restoreInProgress.has(projectId)) return;

  const caidas = (caidasPorProyecto.get(projectId) || 0) + 1;
  caidasPorProyecto.set(projectId, caidas);

  if (caidas > MAX_CAIDAS) {
    appLog(`La ventana del proyecto ${projectId} ha caído ${caidas} veces; se deja de ofrecer recargarla.`);
    dialog.showMessageBoxSync(undefined, {
      type: 'warning',
      title: 'Panorama del Servicio',
      message: 'Esta ventana sigue fallando',
      detail:
        `La ventana de este proyecto se ha cerrado sola ${caidas} veces en esta sesión, así que ya no se ` +
        'ofrece recargarla (volver a intentarlo una y otra vez sería peor).\n\nCierra Panorama del Servicio ' +
        'y vuelve a abrirlo. Tus datos están guardados.' + errorCodeSuffix('PS-1015'),
      buttons: ['Entendido'],
      noLink: true,
    });
    return;
  }

  const esOom = motivo === 'oom';
  const eleccion = dialog.showMessageBoxSync(undefined, {
    type: 'warning',
    title: 'Panorama del Servicio',
    message: 'Una ventana se ha cerrado sola',
    detail:
      (esOom
        ? 'La ventana de este proyecto se ha quedado sin memoria y se ha cerrado sola. Si tienes varios ' +
          'proyectos abiertos a la vez, cerrar alguno ayuda.\n\n'
        : 'La ventana de este proyecto ha dejado de responder y se ha cerrado sola.\n\n') +
      'El resto de la aplicación sigue funcionando con normalidad, y lo que tenías en ese proyecto está ' +
      'guardado: al recargarla vuelve tal y como estaba.' +
      errorCodeSuffix('PS-1015'),
    buttons: ['Recargar la ventana', 'Cerrar la ventana'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
  });

  // Entre el diálogo y aquí puede haber pasado de todo: se vuelve a comprobar.
  if (win.isDestroyed() || cerrandoApp || procesoComprometido) return;
  if (projectWindows.get(projectId) !== win) return;
  if (eleccion === 0) {
    try {
      win.reload();
      appLog(`Ventana del proyecto ${projectId} recargada tras una caída (${motivo}).`);
    } catch (e) {
      appLog(`No se pudo recargar la ventana del proyecto ${projectId}: ${String((e && e.message) || e)}`);
    }
  } else {
    try { win.destroy(); } catch (e) { /* ya no estaba */ }
  }
});

app.on('child-process-gone', (event, details) => {
  const motivo = (details && details.reason) || 'desconocido';
  if (MOTIVOS_NORMALES.includes(motivo)) return;
  const tipo = (details && details.type) || 'desconocido';
  appLog(`PROCESO HIJO (${tipo}) CERRADO DE FORMA ANÓMALA: motivo=${motivo}`);
  if (cerrandoApp || procesoComprometido) return;
  // Chromium relanza solo la GPU y los procesos de utilidad. Solo se avisa si
  // se vuelve costumbre.
  const n = (caidasPorTipoHijo.get(tipo) || 0) + 1;
  caidasPorTipoHijo.set(tipo, n);
  if (n !== MAX_CAIDAS) return;
  dialog.showMessageBoxSync(undefined, {
    type: 'warning',
    title: 'Panorama del Servicio',
    message: 'Un componente interno está fallando repetidamente',
    detail:
      `Un proceso auxiliar de la aplicación (${tipo}) se ha caído ${n} veces en esta sesión. La app sigue ` +
      'funcionando, pero conviene cerrarla y volver a abrirla cuando puedas.\n\nQueda registrado en el ' +
      'registro de la aplicación (Configuración → "Ver registro de la aplicación").',
    buttons: ['Entendido'],
    noLink: true,
  });
});

// ---- Clase 4: errores de una acción concreta del usuario ------------------
// No son fallos globales: la app sigue perfectamente. Se muestran como lo que
// son (esta operación no se pudo hacer) sobre la ventana que la pidió.
// Deduplicado por acción para que un fallo repetitivo no se vuelva una
// cadena de diálogos.
const erroresDeOperacionAvisados = new Set();
function reportarErrorDeOperacion(win, accion, err) {
  const detalle = String((err && err.message) || err);
  appLog(`Error de operación en "${accion}": ${(err && err.stack) || detalle}`);
  const huella = accion + '|' + detalle;
  if (erroresDeOperacionAvisados.has(huella)) return;
  erroresDeOperacionAvisados.add(huella);
  const texto =
    `No se ha podido completar esta operación.\n\nDetalle: ${detalle}\n\n` +
    'El resto de la aplicación sigue funcionando con normalidad.';
  try {
    if (win && !win.isDestroyed()) {
      modalAlert(win, texto, { title: 'No se pudo completar la operación', danger: true });
      return;
    }
  } catch (e) {
    /* cae al diálogo nativo */
  }
  try {
    dialog.showErrorBox('No se pudo completar la operación', texto);
  } catch (e) {
    /* nada más que hacer */
  }
}

function delayMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Segundo tramo de espera (ver comentario grande junto a
// applyCustomUserDataDirIfConfigured): ya con la splash visible, así que
// aquí SÍ se puede esperar sin bloquear el proceso. Si tras esto sigue sin
// poder acceder, para el arranque con un diálogo que hay que atender.
// P22: devuelve 'seguir' o 'cerrar' — «Cerrar» (y Esc/la X) cierran la app en
// vez de caer en la carpeta local.
async function resolveUserDataDirFailureInteractively() {
  if (!customUserDataDirFailure) return 'seguir';
  const target = customUserDataDirFailure.attempted;

  const deadline = Date.now() + USERDATA_POST_READY_RETRY_MS;
  while (Date.now() < deadline) {
    await delayMs(USERDATA_POST_READY_RETRY_INTERVAL_MS);
    // v0.1.60: versión asíncrona — la splash ya está visible aquí, y una
    // espera síncrona podía congelar su animación durante cada reintento.
    const err = await probeWritableDirAsync(target);
    if (!err) {
      app.setPath('userData', target);
      customUserDataDirFailure = null;
      appLog(`Carpeta de datos personalizada disponible tras esperar: ${target}`);
      return 'seguir';
    }
    customUserDataDirFailure = { attempted: target, error: err };
  }

  // Sigue sin poder acceder tras ~25s de espera en total (5s bloqueantes +
  // 20s aquí): no se sigue decidiendo en silencio. Se para hasta que el
  // usuario elija — reintentar (otra ronda igual de larga) o seguir con
  // datos locales por ahora, con conocimiento de causa.
  //
  // P22: la elección «datos locales» ya no es implícita ni a ciegas. El
  // diálogo dice QUÉ hay en la carpeta local (fecha, tamaño), ofrece «Usar
  // estos datos locales» o «Crear una base de datos local vacía» como botón
  // EXPLÍCITO, y Esc/la X cierran la aplicación en vez de elegir lo local.
  for (;;) {
    const accion = preguntarPorLaCarpetaLocal({
      codigo: 'PS-1005',
      titulo: 'No se puede acceder a la carpeta de datos',
      mensaje: 'No se puede acceder a tu carpeta de datos configurada.',
      cuerpo:
        `Carpeta: ${customUserDataDirFailure.attempted}\n\n` +
        `Motivo: ${customUserDataDirFailure.error}\n\n` +
        'Esto suele pasar cuando Google Drive (u OneDrive) todavía no ha terminado de montar la unidad ' +
        '— por ejemplo, justo tras encender el ordenador. Puedes esperar un poco más y reintentar.',
      etiquetaReintento: 'Reintentar',
    });
    if (accion === 'cerrar') return 'cerrar';
    if (accion === 'local' || accion === 'crear') {
      appLog(`Continuando con datos locales temporales (elección explícita) — no se pudo acceder a: ${customUserDataDirFailure.attempted}`);
      return 'seguir';
    }
    const immediateErr = await probeWritableDirAsync(target);
    if (!immediateErr) {
      app.setPath('userData', target);
      customUserDataDirFailure = null;
      appLog(`Carpeta de datos personalizada disponible tras reintento manual: ${target}`);
      return 'seguir';
    }
    customUserDataDirFailure = { attempted: target, error: immediateErr };

    const deadline2 = Date.now() + USERDATA_POST_READY_RETRY_MS;
    let recovered = false;
    while (Date.now() < deadline2) {
      await delayMs(USERDATA_POST_READY_RETRY_INTERVAL_MS);
      const err2 = await probeWritableDirAsync(target);
      if (!err2) {
        app.setPath('userData', target);
        customUserDataDirFailure = null;
        appLog(`Carpeta de datos personalizada disponible tras esperar (tras reintento manual): ${target}`);
        recovered = true;
        break;
      }
      customUserDataDirFailure = { attempted: target, error: err2 };
    }
    if (recovered) return 'seguir';
    // sigue sin funcionar: vuelve a preguntar
  }
}

// ------------------------------------------------------------------
// Espera de sincronización al ARRANQUE — v0.1.55. Pedido explícito del
// usuario justo después de recibir la protección de apagado (0.1.54):
// "se podría añadir esto también para el arranque no? así nos aseguramos
// que si sincronizo todo al arrancar esta la bd perfecta". Complementa a
// checkCustomLocationDatabaseSanity() (justo debajo): esa función
// reacciona cuando panorama.sqlite3 NO EXISTE todavía; esta reacciona
// ANTES, mientras Drive/OneDrive puedan estar todavía escribiendo sobre
// un panorama.sqlite3 que sí existe pero no ha terminado de ponerse al
// día — sin esto, la app podría abrir una copia a medio sincronizar
// (existente pero desactualizada o, en el peor caso, escrita a medias)
// sin ningún aviso.
//
// Mismo heurístico de "delta de CPU" que la protección de apagado
// (ver drive-sync-guard/DriveSyncGuard.ps1) para no duplicar dos ideas
// distintas — aquí implementado en Node en vez de PowerShell porque solo
// hace falta UNA vez al arrancar, no un proceso de fondo permanente. Se
// integra con SPLASH_MIN_VISIBLE_MS (la pantalla de "Iniciando…" ya se
// queda un mínimo de 4s en pantalla): en el caso normal (Drive/OneDrive
// ya sincronizados, que es la mayoría de arranques) esta espera añade
// como mucho 1-2 muestras (~2-4s) que quedan escondidas dentro de ese
// mínimo ya existente — no se nota. Solo si de verdad detecta actividad
// reciente se alarga de verdad, actualizando el texto de la propia
// splash para que no parezca que la app se ha quedado colgada.
//
// Tope de seguridad fijo (mismo espíritu que MaxBlockSeconds del guard de
// apagado): nunca espera más de CLOUD_SYNC_STARTUP_MAX_WAIT_MS — pasado
// ese tiempo, se continúa igualmente. Es un heurístico de mejor esfuerzo,
// NO una garantía: no hay forma de saber con certeza desde aquí cuándo
// Drive/OneDrive han terminado de verdad (mismo límite ya reconocido en
// la 0.1.54 para la protección de apagado).
//
// v0.1.60 — auditoría pedida por el usuario ("súper eficaz"): antes, cada
// muestra de CPU lanzaba su PROPIO proceso powershell.exe nuevo (hasta
// ~10 veces en 20s) — cada arranque de PowerShell tiene un coste real
// (100-300ms o más si hay antivirus de por medio), contraproducente para
// algo que intenta que el arranque sea rápido. Ahora se lanza UN SOLO
// proceso de PowerShell que hace todo el sondeo internamente (el mismo
// bucle, con el mismo intervalo y umbral) y va imprimiendo una línea por
// muestra a su salida estándar — Node la lee en tiempo real (streaming,
// no espera a que el proceso termine) para poder seguir registrando en
// app.log cada "esperando (Xs)..." exactamente igual que antes. El
// comportamiento observable es idéntico; lo único que cambia es que ahora
// es 1 proceso en vez de hasta 10.
const CLOUD_SYNC_STARTUP_SAMPLE_INTERVAL_MS = 2000;
const CLOUD_SYNC_STARTUP_MAX_WAIT_MS = 20000;
const CLOUD_SYNC_STARTUP_BUSY_THRESHOLD_MS = 100; // mismo umbral que el guard de apagado

// Ejecuta el sondeo completo en un único proceso de PowerShell. Resuelve
// con { type: 'none' | 'idle' | 'timeout' | 'error', elapsedS? } — NUNCA
// rechaza, para no poder bloquear el arranque por un fallo aquí. Las
// líneas intermedias ("BUSY:Xs") se van registrando en app.log según
// llegan, antes de que el proceso termine.
function runCloudSyncIdlePoll() {
  return new Promise((resolve) => {
    let settled = false;
    let killTimer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      resolve(result);
      try {
        if (child && !child.killed) child.kill();
      } catch (e) {
        /* no crítico: como mucho queda un proceso powershell.exe de sobra unos instantes */
      }
    };

    const psCmd =
      `$names=@('GoogleDriveFS','OneDrive'); ` +
      `$maxWaitMs=${CLOUD_SYNC_STARTUP_MAX_WAIT_MS}; ` +
      `$intervalMs=${CLOUD_SYNC_STARTUP_SAMPLE_INTERVAL_MS}; ` +
      `$busyThresholdMs=${CLOUD_SYNC_STARTUP_BUSY_THRESHOLD_MS}; ` +
      `function Get-CpuMs { $procs=Get-Process -Name $names -ErrorAction SilentlyContinue; if(-not $procs){return $null}; $total=0; foreach($p in $procs){$total+=$p.TotalProcessorTime.TotalMilliseconds}; return $total }; ` +
      `$startedAt=Get-Date; ` +
      `$prev=Get-CpuMs; ` +
      `if($null -eq $prev){Write-Output 'NONE'; exit}; ` +
      `while(((Get-Date)-$startedAt).TotalMilliseconds -lt $maxWaitMs){Start-Sleep -Milliseconds $intervalMs; $cur=Get-CpuMs; if($null -eq $cur){Write-Output 'NONE'; exit}; $delta=$cur-$prev; $prev=$cur; $elapsedS=[Math]::Round(((Get-Date)-$startedAt).TotalSeconds); if($delta -le $busyThresholdMs){Write-Output "IDLE:$elapsedS"; exit}; Write-Output "BUSY:$elapsedS"}; ` +
      `Write-Output 'TIMEOUT'`;

    let child;
    try {
      child = spawn('powershell.exe', ['-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', psCmd], {
        windowsHide: true,
      });
    } catch (e) {
      finish({ type: 'error' });
      return;
    }

    let buffer = '';
    const handleLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (trimmed === 'NONE') {
        finish({ type: 'none' });
        return;
      }
      if (trimmed === 'TIMEOUT') {
        finish({ type: 'timeout' });
        return;
      }
      if (trimmed.indexOf('BUSY:') === 0) {
        const elapsedS = parseInt(trimmed.slice(5), 10);
        appLog(`Arranque — Drive/OneDrive parecen ocupados sincronizando, esperando (${Number.isFinite(elapsedS) ? elapsedS : '?'}s)...`);
        return;
      }
      if (trimmed.indexOf('IDLE:') === 0) {
        const elapsedS = parseInt(trimmed.slice(5), 10);
        finish({ type: 'idle', elapsedS: Number.isFinite(elapsedS) ? elapsedS : null });
        return;
      }
      // línea inesperada (no debería pasar): se ignora, nunca debe romper el arranque.
    };

    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let idx;
      while ((idx = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        handleLine(line);
      }
    });
    child.on('error', () => finish({ type: 'error' }));
    child.on('close', () => {
      if (buffer.trim()) handleLine(buffer);
      finish({ type: 'error' }); // si llegó aquí sin haber resuelto ya con NONE/IDLE/TIMEOUT, no se pudo determinar nada
    });

    // Red de seguridad: si el proceso no termina solo por lo que sea
    // (Start-Sleep colgado, una política bloqueando algo a medias...), se
    // mata pasado su propio tope interno más un margen — nunca debe dejar
    // el arranque esperando indefinidamente por esto.
    killTimer = setTimeout(() => finish({ type: 'timeout' }), CLOUD_SYNC_STARTUP_MAX_WAIT_MS + 8000);
  });
}

async function waitForCloudSyncIdleAtStartup() {
  if (process.platform !== 'win32') return;
  // v0.1.57: antes bastaba con "hay carpeta personalizada" — ahora exige
  // además que esté marcada como compartida (ver isUsingSharedDataLocationNow).
  // Una carpeta LOCAL personalizada (otro disco de este mismo PC) no tiene
  // nada que ver con Drive/OneDrive, esperar aquí no pintaba nada.
  if (!isUsingSharedDataLocationNow()) return;
  const result = await runCloudSyncIdlePoll();
  if (result.type === 'none') {
    appLog('Arranque — ni GoogleDriveFS ni OneDrive están en ejecución, no hay nada que esperar antes de abrir la base de datos.');
    return;
  }
  if (result.type === 'idle') {
    appLog(`Arranque — Drive/OneDrive sin actividad de CPU reciente tras ${result.elapsedS != null ? result.elapsedS : '?'}s, se continúa.`);
    return;
  }
  if (result.type === 'timeout') {
    appLog(
      `Arranque — protección de sincronización: límite de ${CLOUD_SYNC_STARTUP_MAX_WAIT_MS / 1000}s alcanzado con Drive/OneDrive ` +
        'todavía ocupados — se continúa de todas formas, para no dejar el arranque colgado esperando.'
    );
    return;
  }
  // 'error': no se pudo consultar (p.ej. powershell.exe no disponible o bloqueado) — no bloquear el arranque por esto.
}

// v0.1.53: bug real encontrado siguiendo la investigación de la 0.1.51/0.1.52 — el propio usuario
// preguntó "si no sincronizo todo del drive ni siquiera los backups me dará como nuevo, ¿no?", y
// tenía razón. getDb() (ver db.js) crea una base de datos VACÍA en el sitio si no encuentra
// panorama.sqlite3 ahí — y la escribe a disco DE INMEDIATO (persist() al final de getDb()), sin
// avisar a nadie. Eso es correcto y esperado la primera vez que se usa la carpeta de datos POR
// DEFECTO (un PC nuevo, sin nada configurado, debe empezar vacío sin preguntar nada). Pero si se
// está usando una carpeta PERSONALIZADA (normalmente compartida por Drive/OneDrive entre varios
// PCs), que esté vacía es sospechoso: lo normal es que quien vincula una carpeta así espera
// encontrar datos ya existentes, no empezar de cero. La carpeta en sí puede estar ya montada y ser
// perfectamente escribible (eso ya lo cubre resolveUserDataDirFailureInteractively, justo antes de
// esta función) sin que eso garantice que CADA archivo de dentro ya haya terminado de bajar — Drive
// sincroniza archivo a archivo, no la carpeta entera de golpe.
//
// Esto protege un escalón más grave que el de la 0.1.52 (que solo protegía al Directorio de Talento
// una vez que la propia base de datos ya estaba bien): aquí se protege el .sqlite3 en sí, para
// TODOS los proyectos, ANTES de que getDb() llegue a tocarlo.
// A3.3 BLOQUE 2 — estados explícitos en vez de un booleano.
//
// `fs.existsSync()` devuelve `false` ante CUALQUIER error, así que confunde
// "aquí no hay base de datos" con "ahora mismo no puedo mirar". Esa confusión
// es exactamente la que no puede terminar en un `crearSiAusente:true`.
//
//   'visible'       -> el archivo está y se puede abrir
//   'no-visible'    -> ENOENT comprobado: de verdad no está
//   'no-accesible'  -> existe o no, pero no se puede determinar (EIO, EACCES,
//                      EBUSY, EPERM, unidad a medio montar...)
function estadoDeArchivoEnRuta(p) {
  let fd = null;
  try {
    fd = fs.openSync(p, 'r');
    return { estado: 'visible' };
  } catch (e) {
    const cod = (e && e.code) || '';
    if (cod === 'ENOENT') return { estado: 'no-visible', codigo: cod };
    return { estado: 'no-accesible', codigo: cod, motivo: String((e && e.message) || e) };
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); } catch (e) {} }
  }
}

async function checkCustomLocationDatabaseSanity() {
  if (!customUserDataDirTarget || customUserDataDirFailure) return 'seguir'; // solo aplica con carpeta personalizada ya accesible
  const dbPath = path.join(app.getPath('userData'), 'panorama.sqlite3');
  const inicial = estadoDeArchivoEnRuta(dbPath);
  if (inicial.estado === 'visible') return 'seguir'; // lo normal — ya está ahí

  // Espera silenciosa primero (mismo margen que ya se usa para el montaje de la carpeta): un
  // archivo de este tamaño suele terminar de bajar en segundos una vez la carpeta ya está montada,
  // así que no hace falta molestar al usuario si solo falta un poco.
  const deadline = Date.now() + USERDATA_POST_READY_RETRY_MS;
  let ultimo = inicial;
  while (Date.now() < deadline) {
    await delayMs(USERDATA_POST_READY_RETRY_INTERVAL_MS);
    ultimo = estadoDeArchivoEnRuta(dbPath);
    if (ultimo.estado === 'visible') {
      appLog(`Base de datos de la carpeta personalizada apareció tras esperar: ${dbPath}`);
      return 'seguir';
    }
  }

  // A3.3: si lo que ocurre es que NO SE PUEDE MIRAR (Drive caído, permisos,
  // unidad a medio montar), no se ofrece "empezar desde cero": eso convertiría
  // una indisponibilidad en una creación. Se cae a la carpeta por defecto por
  // esta sesión, que es lo que ya hace la app cuando la carpeta no responde, y
  // NO se autoriza ninguna creación en la personalizada.
  // P22 — ESTE ERA EL CAMINO PEOR: la base de datos configurada EXISTE pero no
  // se puede comprobar, y hasta ahora la app se pasaba a la carpeta local EN
  // SILENCIO; lo siguiente que veía el usuario era la contraseña de siempre,
  // con otra base de datos debajo. Ahora se para y se pregunta (PS-1022), y no
  // se abre NADA local hasta que se elija.
  if (ultimo.estado === 'no-accesible') {
    appLog(`ERROR PS-1022 — la base de datos de la carpeta configurada no se puede comprobar (${ultimo.codigo}): ` +
      'no se ofrece empezar desde cero y NO se cambia de carpeta sin preguntar.');
    for (;;) {
      const accion = preguntarPorLaCarpetaLocal({
        codigo: 'PS-1022',
        titulo: 'No se puede comprobar la base de datos configurada',
        mensaje: 'La base de datos de tu carpeta de datos configurada está ahí, pero no se puede leer ni comprobar.',
        cuerpo:
          `Carpeta: ${customUserDataDirTarget}\n\n` +
          `Motivo: ${ultimo.codigo} (${ultimo.motivo})\n\n` +
          'Suele ser un archivo bloqueado por otro programa, una sincronización a medias o un problema de ' +
          'permisos. Puedes reintentar.',
        etiquetaReintento: 'Reintentar',
      });
      if (accion === 'cerrar') return 'cerrar';
      if (accion === 'local' || accion === 'crear') {
        app.setPath('userData', defaultUserDataDir);
        customUserDataDirFailure = {
          attempted: customUserDataDirTarget,
          error: `No se pudo comprobar panorama.sqlite3 ahí (${ultimo.codigo}: ${ultimo.motivo})`,
        };
        appLog('PS-1022 — el usuario eligió expresamente usar la carpeta de datos local en esta sesión.');
        return 'seguir';
      }
      const otra = estadoDeArchivoEnRuta(dbPath);
      if (otra.estado === 'visible') {
        appLog('La base de datos de la carpeta configurada ya se puede comprobar tras el reintento manual.');
        return 'seguir';
      }
      ultimo = otra;
      if (otra.estado === 'no-visible') break;   // ya no es «no comprobable»: sigue el camino de PS-1009
    }
  }

  // Sigue sin aparecer tras ~20s: puede ser Drive yendo lento, o de verdad la primera vez que se
  // usa esta carpeta a propósito. No se decide sola — se para aquí hasta que el usuario elija.
  for (;;) {
    const choice = dialog.showMessageBoxSync(undefined, {
      type: 'warning',
      title: 'No se encuentra la base de datos en esta carpeta',
      message: 'La carpeta de datos configurada no tiene ninguna base de datos de Panorama del Servicio todavía.',
      detail:
        `Carpeta: ${customUserDataDirTarget}\n\n` +
        'Si esta carpeta viene de otro PC (por ejemplo, la compartes por Google Drive/OneDrive), esto ' +
        'normalmente significa que la sincronización todavía no ha terminado de bajar el archivo — seguir ' +
        'ahora crearía una base de datos VACÍA en su sitio, con riesgo real de pisar la de verdad en cuanto ' +
        'termine de sincronizar.\n\nSi es la primera vez que usas esta carpeta a propósito (todavía no hay ' +
        'nada guardado en ningún otro PC), es normal que esté vacía y puedes continuar sin problema.' +
        errorCodeSuffix('PS-1009'),
      // P22: «usar la carpeta por defecto» ya no significa «abrir lo que haya
      // sin mirar»: lleva a una confirmación informada (PS-1021). Y aparece
      // «Cerrar», que es además lo que hacen Esc y la X.
      buttons: ['Esperar más (reintentar)', 'Sí, empezar aquí desde cero', 'Usar los datos locales de este equipo', 'Cerrar'],
      defaultId: 0,
      cancelId: 3,
      noLink: true,
    });
    if (choice === 3) {
      appLog('PS-1009 — el usuario eligió cerrar en vez de usar la carpeta de datos local.');
      return 'cerrar';
    }
    if (choice === 1) {
      // A3.3 BLOQUE 2: esta elección es la ÚNICA que autoriza crear en una
      // carpeta personalizada. main.js autoriza; db.js sigue verificando
      // aparte que la ubicación sea segura (carpeta sin restos ajenos,
      // identidad estable, intención local registrada...). Las dos capas
      // tienen que decir que sí.
      usuarioAutorizaEmpezarDesdeCero = true;
      appLog(`El usuario confirmó empezar desde cero en la carpeta personalizada (no se encontró panorama.sqlite3): ${dbPath}`);
      return 'seguir';
    }
    if (choice === 2) {
      // Mismo espíritu que el fallback ya existente de "carpeta no disponible": se usa la carpeta
      // local por esta vez, sin tocar ni borrar la configuración guardada — al siguiente arranque
      // se vuelve a intentar la personalizada igual que siempre.
      // P22: antes de usarla, confirmación informada de QUÉ hay en ella. Si se
      // cancela, se vuelve a este mismo diálogo.
      const accion = preguntarPorLaCarpetaLocal({
        codigo: 'PS-1021',
        titulo: 'Usar los datos locales de este equipo',
        mensaje: 'Vas a usar la base de datos LOCAL de este equipo, no la de tu carpeta configurada.',
        cuerpo: `Carpeta configurada: ${customUserDataDirTarget}\n\n` +
          'En esa carpeta no aparece ninguna base de datos todavía.',
        etiquetaReintento: null,
      });
      if (accion === 'cerrar') continue;    // vuelve a preguntar lo de arriba
      app.setPath('userData', defaultUserDataDir);
      customUserDataDirFailure = {
        attempted: customUserDataDirTarget,
        error: 'No se encontró panorama.sqlite3 ahí (el usuario eligió no continuar en esa carpeta)',
      };
      appLog(`Continuando con datos locales temporales (elección explícita) — no se encontró panorama.sqlite3 en: ${dbPath}`);
      return 'seguir';
    }
    // choice === 0 (o se cerró el diálogo): reintentar — otra ronda de espera igual de larga
    const deadline2 = Date.now() + USERDATA_POST_READY_RETRY_MS;
    let appeared = false;
    while (Date.now() < deadline2) {
      await delayMs(USERDATA_POST_READY_RETRY_INTERVAL_MS);
      if (estadoDeArchivoEnRuta(dbPath).estado === 'visible') { appeared = true; break; }
    }
    if (appeared) {
      appLog(`Base de datos de la carpeta personalizada apareció tras reintento manual: ${dbPath}`);
      return 'seguir';
    }
    // sigue sin aparecer: vuelve a preguntar
  }
}

// ------------------------------------------------------------------
// Bloqueo multi-PC (v0.1.56). Pedido a raíz de un script de otra IA que el
// usuario pasó como idea ("bloquea también la ejecución si ya está abierta
// la app por otro PC con acceso al drive") — con una carpeta de datos
// compartida (Google Drive/OneDrive), nada impedía hasta ahora que dos PCs
// tuvieran la app abierta A LA VEZ sobre el mismo panorama.sqlite3: Drive/
// OneDrive sincronizan bytes, no arbitran bloqueos entre máquinas, así que
// dos escrituras casi simultáneas desde dos PCs distintos son un riesgo
// real de corrupción o de que una se pise a la otra.
//
// Diseño elegido tras comentarlo con el usuario (avisar y dejar elegir, NO
// bloquear en seco como hacía el script original que pasó): un archivo
// ".panorama-lock.json" dentro de la propia carpeta de datos (así viaja
// con la sincronización, igual que el .sqlite3), con quién lo tiene abierto
// (equipo + usuario) y la hora de la última señal de vida, refrescada cada
// MULTI_PC_LOCK_HEARTBEAT_MS mientras la app sigue abierta. Al arrancar, si
// el lock existe y su última señal de vida es más reciente que
// MULTI_PC_LOCK_STALE_MINUTES, se avisa con el equipo/usuario que lo tiene
// y hace cuánto, y se deja elegir: cancelar, o abrir de todas formas — un
// bloqueo duro sin forma de saltarlo dejaría a alguien fuera para siempre
// si el otro PC se durmió, se colgó, o perdió corriente sin cerrar bien
// (el propio script original que sirvió de idea reconocía este problema:
// usaba un timeout de solo 2 minutos para no dejar a nadie bloqueado
// demasiado tiempo, mismo valor que se usa aquí). Si el lock ya está
// caducado (o no existe), se toma sin preguntar nada.
//
// Solo se activa con una carpeta de datos marcada como COMPARTIDA
// (isUsingSharedDataLocationNow() — v0.1.57: no basta con "personalizada",
// tiene que estar marcada de verdad como compartida, ver el comentario
// junto a esa función) — con la carpeta local (por defecto, o personalizada
// pero no compartida) no hay ningún otro PC que pueda estar compartiendo
// esos mismos archivos, así que este mecanismo no pinta nada ahí.
const MULTI_PC_LOCK_STALE_MINUTES = 2;
const MULTI_PC_LOCK_HEARTBEAT_MS = 30000;

let multiPcLockOwnedByUs = false;
let multiPcLockHeartbeatTimer = null;

function multiPcLockPath() {
  return path.join(app.getPath('userData'), '.panorama-lock.json');
}

function readMultiPcLock() {
  try {
    const raw = fs.readFileSync(multiPcLockPath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.lastUpdate !== 'string') return null;
    return parsed;
  } catch (e) {
    return null; // no existe, o está corrupto/ilegible — se trata igual que "sin bloqueo"
  }
}

// v0.1.60: asíncrona a propósito (antes usaba fs.writeFileSync) — esta
// función se llama cada MULTI_PC_LOCK_HEARTBEAT_MS mientras la app está en
// marcha, con ventanas de proyecto ya abiertas. Una escritura SÍNCRONA
// aquí, sobre una carpeta potencialmente en Drive/OneDrive, podía congelar
// el proceso principal de Electron entero (todas las ventanas, no solo
// esta protección) si la nube se quedaba colgada en esa escritura —
// auditoría pedida por el usuario ("profesional y segura en todos sus
// aspectos"). El error, si lo hay, se registra igual que antes.
async function writeMultiPcLockNow() {
  try {
    const info = {
      machine: os.hostname() || 'equipo desconocido',
      user: (os.userInfo && os.userInfo().username) || process.env.USERNAME || process.env.USER || 'usuario desconocido',
      lastUpdate: new Date().toISOString(),
    };
    await fs.promises.writeFile(multiPcLockPath(), JSON.stringify(info, null, 2), 'utf8');
  } catch (e) {
    appLog(`ERROR PS-1012 — no se pudo escribir el archivo de bloqueo multi-PC: ${String((e && e.message) || e)}`);
  }
}

// Devuelve false si hay que abortar el arranque (el usuario eligió no
// continuar porque otro PC parece tenerlo abierto) — true en cualquier otro
// caso (sin carpeta personalizada, sin lock previo, lock caducado, o el
// usuario decidió abrir igualmente).
async function checkMultiPcLock() {
  // v0.1.57: exige carpeta compartida, no solo "personalizada" — una
  // carpeta LOCAL personalizada no la comparte ningún otro PC.
  if (!isUsingSharedDataLocationNow()) return true;

  const existing = readMultiPcLock();
  if (existing) {
    const ageMs = Date.now() - new Date(existing.lastUpdate).getTime();
    if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < MULTI_PC_LOCK_STALE_MINUTES * 60000) {
      const ageSeconds = Math.round(ageMs / 1000);
      const choice = dialog.showMessageBoxSync(undefined, {
        type: 'warning',
        title: 'Parece abierta en otro equipo',
        message: 'Panorama del Servicio parece estar abierto ahora mismo en otro equipo, usando esta misma carpeta de datos compartida.',
        detail:
          `Equipo: ${existing.machine}\nUsuario: ${existing.user}\n` +
          `Última señal de actividad: hace ${ageSeconds}s.\n\n` +
          'Abrir aquí también, a la vez, puede provocar que se pisen cambios o se dañe la base de datos ' +
          'si los dos guardáis al mismo tiempo.\n\nSi ese equipo se quedó colgado, se durmió, o se cerró ' +
          'mal sin avisar, puedes abrir igualmente con confianza.' +
          errorCodeSuffix('PS-1012'),
        buttons: ['Cancelar y salir', 'Abrir igualmente'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      });
      if (choice !== 1) {
        appLog(
          `Arranque cancelado por bloqueo multi-PC: ${existing.machine}/${existing.user} parecía activo hace ${ageSeconds}s.`
        );
        return false;
      }
      appLog(`El usuario decidió abrir igualmente pese al bloqueo activo de ${existing.machine}/${existing.user} (hace ${ageSeconds}s).`);
    }
  }

  await writeMultiPcLockNow();
  multiPcLockOwnedByUs = true;
  multiPcLockHeartbeatTimer = setInterval(() => {
    if (isUsingSharedDataLocationNow()) writeMultiPcLockNow();
  }, MULTI_PC_LOCK_HEARTBEAT_MS);
  return true;
}

// Llamado al cerrar la app del todo (ver app.on('before-quit')) — libera el
// lock para que el siguiente PC (o esta misma copia, la próxima vez) no se
// encuentre un aviso de "abierto en otro equipo" que ya no es cierto.
// Deliberadamente NO se libera si nunca llegamos a tomarlo (multiPcLockOwnedByUs
// sigue false si el usuario canceló el arranque, o si otro PC lo tiene de verdad).
function releaseMultiPcLockIfOwned() {
  if (!multiPcLockOwnedByUs) return;
  if (multiPcLockHeartbeatTimer) {
    clearInterval(multiPcLockHeartbeatTimer);
    multiPcLockHeartbeatTimer = null;
  }
  try {
    fs.unlinkSync(multiPcLockPath());
  } catch (e) {
    /* no crítico: el lock quedará con la última hora de heartbeat y caducará solo en unos minutos */
  }
  multiPcLockOwnedByUs = false;
}

// Vigilancia en marcha (v0.1.42): mientras la app está abierta con la
// carpeta personalizada en uso, comprueba cada USERDATA_WATCHDOG_INTERVAL_MS
// que se sigue pudiendo escribir en ella. Cubre el caso de que la conexión
// se caiga a MEDIA sesión (proyecto ya abierto, no solo al arrancar) — algo
// que los dos tramos de arriba no cubren, porque solo se ejecutan una vez al
// inicio. Si detecta que deja de poder escribir, avisa a todas las ventanas
// abiertas (banner en el dashboard) y activa el guardado de seguridad local
// adicional en backup:save (ver más abajo) mientras dure. No sustituye a los
// avisos de arranque: es una red de seguridad para cuando el corte pasa con
// la app ya en marcha.
const USERDATA_WATCHDOG_INTERVAL_MS = 45000;
let driveOutageActive = false;

function broadcastToAllWindows(channel, payload) {
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) {
      try {
        w.webContents.send(channel, payload);
      } catch (e) {
        /* ventana en proceso de cerrarse: no es crítico */
      }
    }
  });
}

function startUserDataWatchdog() {
  if (!customUserDataDirTarget) return; // sin carpeta personalizada configurada, no hay nada que vigilar
  setInterval(() => {
    // v0.1.60: aprovecha este mismo intervalo (ya corre mientras haya una
    // carpeta personalizada en uso) para relanzar sola la protección de
    // apagado si dejó de dar señales de vida — antes solo se comprobaba
    // una vez, al arrancar; una muerte a media sesión se quedaba sin
    // detectar hasta el siguiente reinicio de la app. No hace nada si la
    // ubicación no es compartida, o si ya está sana (ver
    // syncDriveSyncGuardWithLocation).
    syncDriveSyncGuardWithLocation();

    if (customUserDataDirFailure) return; // ya se sabe que no se pudo usar desde el arranque; nada nuevo que avisar aquí
    // v0.1.60: versión asíncrona a propósito — ver el comentario junto a
    // probeWritableDirAsync (esto corre con ventanas de proyecto ya
    // abiertas, una escritura síncrona colgada podía congelar toda la app).
    probeWritableDirAsync(app.getPath('userData')).then((err) => {
      if (err && !driveOutageActive) {
        driveOutageActive = true;
        appLog(`ERROR PS-1006 — Se perdió el acceso a la carpeta de datos durante la sesión: ${err}`);
        broadcastToAllWindows('diag:driveOutage', { active: true });
      } else if (!err && driveOutageActive) {
        driveOutageActive = false;
        appLog('Acceso a la carpeta de datos recuperado durante la sesión (tras un corte a media sesión).');
        broadcastToAllWindows('diag:driveOutage', { active: false });
      }
    });
  }, USERDATA_WATCHDOG_INTERVAL_MS);
}

// ------------------------------------------------------------------
// P9 — location.json EXISTE pero no se puede usar (ver leerConfigUbicacion).
//
// Se para aquí, lo primero de app.whenReady: antes de la splash, de cualquier
// espera de Drive, de la protección de apagado, del bloqueo multi-PC y de
// abrir, crear o registrar ninguna base de datos. Al siguiente arranque se
// vuelve a leer el archivo, y en cuanto esté bien la app arranca como siempre.
//
// Solo hay "Cerrar". NO se ofrece "abrir con datos locales": la carpeta local
// suele ser un residuo de antes de configurar la compartida (así en el PC del
// usuario), y abrirla —o crear una base de datos en ella— es justo el defecto
// que se corrige aquí. Sin la ubicación configurada no hay forma de demostrar
// que la base de datos local sea la buena.
//
// El mensaje no muestra la ruta real: solo la forma %APPDATA%\... del archivo.
// ------------------------------------------------------------------
// ------------------------------------------------------------------
// P22 (17 sept 2026) — UNA SOLA PUERTA ANTES DE TOCAR LA CARPETA DE DATOS LOCAL.
//
// Hasta ahora, cuatro caminos legítimos terminaban en la carpeta por defecto y
// abrían (y modificaban) lo que hubiera, o creaban una base de datos nueva, sin
// decir de qué base se trataba: PS-1005 «datos locales», PS-1009 «usar la
// carpeta por defecto», el arranque sin `location.json`, y —el peor— una base
// de datos configurada que existe pero no se puede comprobar, que cambiaba de
// carpeta EN SILENCIO.
//
// Todos pasan ahora por aquí, y aquí no se abre ni se crea nada: solo se mira
// (stat + 16 bytes) y se pregunta. Hasta que el usuario elige expresamente, la
// base de datos local no se toca: ni `.gen`, ni registro de A3.3, ni
// migraciones, ni backups, ni Seguridad, ni `getDb`.
//
// Lo que NO se puede evitar, y queda dicho: Chromium ya ha creado sus propios
// archivos de perfil en esa carpeta antes de que este archivo pueda decidir
// nada. Lo que esta puerta garantiza es la BASE DE DATOS, no la carpeta entera.
// ------------------------------------------------------------------
let sesionLocalTemporal = false;      // el usuario aceptó usar la carpeta local EN ESTE ARRANQUE
let usuarioAutorizaCrearLocal = false; // …y eligió crear una base de datos local vacía

// ¿Hay que preguntar antes de usar la carpeta por defecto? Sí siempre que
// venga de un camino de reserva; y también sin configuración, salvo en el caso
// del equipo PURAMENTE LOCAL de toda la vida: ese ya tiene su propia carpeta
// registrada en A3.3 y no se le va a preguntar en cada arranque. Un equipo que
// viene de una versión anterior a A3.3 (registro vacío) recibe la pregunta UNA
// vez, y a partir de ahí queda registrado.
function carpetaLocalNecesitaConfirmacion(motivo, hist) {
  if (motivo !== 'sin-configuracion') return true;
  if (hist.si) return true;
  const est = estadoUbicacion(defaultUserDataDir);
  if (est.corrupto) return true;                  // registro ilegible: ante la duda, se pregunta
  return est.estado !== 'inicializada';
}

function avisoBaseLocalInutilizable(bd) {
  appLog(`ERROR PS-1023 — la base de datos local no es utilizable (${bd.estado}: ${bd.motivo || bd.codigo}). No se abre, no se sustituye y no se crea otra.`);
  try {
    dialog.showMessageBoxSync(undefined, {
      type: 'error',
      title: 'La base de datos local no es utilizable',
      message: 'En la carpeta de datos de este equipo hay un archivo de base de datos que no se puede usar.',
      detail:
        `${descripcionBaseDeDatosLocal(bd)}\n\n` +
        'Panorama del Servicio NO lo ha abierto, NO lo ha sustituido, NO lo ha vaciado y NO ha creado otra ' +
        'base de datos encima: un archivo así puede ser una copia a medias o el resto de un fallo anterior, y ' +
        'pisarlo destruiría la única pista de lo que pasó.\n\n' +
        'La aplicación se va a cerrar. Si tu carpeta de datos de verdad está en Google Drive/OneDrive, ' +
        'comprueba que esté disponible y vuelve a abrir.' +
        errorCodeSuffix('PS-1023'),
      buttons: ['Cerrar'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
  } catch (e) {
    appLog(`No se pudo mostrar el aviso PS-1023: ${String((e && e.message) || e)}`);
  }
}

// Diálogo común de los caminos de reserva. Devuelve:
//   'reintentar' | 'local' (usar los datos locales) | 'crear' (base vacía) | 'cerrar'
// CERRAR es siempre la opción de escape (Esc y la X): nunca «usar local».
function preguntarPorLaCarpetaLocal({ codigo, titulo, mensaje, cuerpo, etiquetaReintento }) {
  const bd = estadoBaseDeDatosLocal(defaultUserDataDir);
  if (bd.estado === 'invalida' || bd.estado === 'no-comprobable') {
    avisoBaseLocalInutilizable(bd);
    return 'cerrar';
  }
  const hist = huboUbicacionPersonalizada();
  const botones = [];
  const acciones = [];
  if (etiquetaReintento) { botones.push(etiquetaReintento); acciones.push('reintentar'); }
  if (bd.estado === 'existente') { botones.push('Usar estos datos locales'); acciones.push('local'); }
  else { botones.push('Crear una base de datos local vacía'); acciones.push('crear'); }
  botones.push('Cerrar');
  acciones.push('cerrar');
  const idCerrar = acciones.indexOf('cerrar');
  let elegido;
  try {
    elegido = dialog.showMessageBoxSync(undefined, {
      type: 'warning',
      title: titulo,
      message: mensaje,
      detail:
        `${cuerpo}\n\n${descripcionBaseDeDatosLocal(bd)}\n\n` +
        (bd.estado === 'existente'
          ? 'Esos datos locales pueden ser MUCHO más antiguos que los de tu carpeta de siempre, y lo que ' +
            'cambies aquí no estará en ella.'
          : 'Crear una base de datos local vacía NO recupera nada: empezarías de cero en este equipo.') +
        (hist.si ? `\n\nEste equipo ya ha usado una carpeta de datos propia (${hist.fuente}).` : '') +
        errorCodeSuffix(codigo),
      buttons: botones,
      defaultId: etiquetaReintento ? 0 : idCerrar,
      cancelId: idCerrar,
      noLink: true,
    });
  } catch (e) {
    appLog(`No se pudo mostrar el aviso ${codigo}: ${String((e && e.message) || e)}`);
    return 'cerrar';
  }
  const accion = acciones[elegido] || 'cerrar';
  appLog(`${codigo} — carpeta de datos local: el usuario eligió «${botones[elegido] || 'Cerrar'}» (base local: ${bd.estado}).`);
  if (accion === 'local' || accion === 'crear') {
    // Sesión LOCAL TEMPORAL: solo si hay otra ubicación de por medio (configurada
    // o histórica). En un equipo puramente local esto es su modo normal.
    if (customUserDataDirTarget || hist.si) sesionLocalTemporal = true;
    if (accion === 'crear') usuarioAutorizaCrearLocal = true;
  }
  return accion;
}

// Puerta del arranque SIN `location.json` (camino C).
// Devuelve 'seguir' | 'cerrar'.
function autorizarCarpetaLocal(motivo) {
  const bd = estadoBaseDeDatosLocal(defaultUserDataDir);
  if (bd.estado === 'invalida' || bd.estado === 'no-comprobable') {
    avisoBaseLocalInutilizable(bd);
    return 'cerrar';
  }
  const hist = huboUbicacionPersonalizada();
  if (!carpetaLocalNecesitaConfirmacion(motivo, hist)) return 'seguir';
  if (bd.estado === 'ausente' && !hist.si) return 'seguir';   // primera ejecución legítima
  const accion = preguntarPorLaCarpetaLocal({
    codigo: 'PS-1021',
    titulo: bd.estado === 'existente' ? 'Hay datos locales en este equipo' : 'No hay ninguna carpeta de datos configurada',
    mensaje: bd.estado === 'existente'
      ? 'Panorama del Servicio va a usar la base de datos LOCAL de este equipo.'
      : 'Panorama del Servicio no tiene ninguna carpeta de datos configurada.',
    cuerpo: bd.estado === 'existente'
      ? 'No hay ninguna carpeta de datos configurada (el archivo de configuración no está), así que la única ' +
        'base de datos disponible es la local de este equipo.'
      : 'No hay configuración de ubicación ni base de datos local.',
    etiquetaReintento: null,
  });
  return accion === 'cerrar' ? 'cerrar' : 'seguir';
}

function detenerArranquePorConfigUbicacion() {
  const { estado, motivo } = configUbicacionNoResuelta;
  appLog(`ERROR PS-1020 — location.json ${estado}: ${motivo}. No se abre, crea ni modifica ninguna base de datos.`);
  try {
    dialog.showMessageBoxSync(undefined, {
      type: 'error',
      title: 'No se puede leer la configuración de ubicación de datos',
      message:
        'La configuración de ubicación de datos no puede leerse. Panorama no cambiará automáticamente a otra base de datos.',
      detail:
        `Motivo: ${motivo}.\n\n` +
        'Archivo: %APPDATA%\\panorama-app-config\\location.json\n\n' +
        'No se ha abierto, creado ni modificado ninguna base de datos, y la protección de apagado sigue como ' +
        'estaba. Panorama del Servicio se va a cerrar.\n\n' +
        'Para volver a usarla hay que corregir ese archivo (guardado en UTF-8) o volver a elegir la carpeta de ' +
        'datos con el instalador. No lo borres: sin él, la app usaría la carpeta de datos por defecto.' +
        errorCodeSuffix('PS-1020'),
      buttons: ['Cerrar'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
  } catch (e) {
    appLog(`No se pudo mostrar el aviso PS-1020: ${String((e && e.message) || e)}`);
  }
  app.quit();
}

app.whenReady().then(async () => {
  // El módulo entero (incluidos los requires frágiles de './db' y
  // './security') ya cargó sin lanzar nada — pasado este punto, un error no
  // capturado ya no dispara el rollback automático de handleFatalStartupError
  // (ver el comentario junto a su definición, arriba del todo): podría haber
  // una ventana de proyecto abierta con cambios sin guardar, y sustituir
  // app.asar por debajo no soluciona nada a esas alturas.
  startupRecoveryArmed = false;
  appLog(`Arranque — v${app.getVersion()} (${process.platform} ${process.arch})`);
  // P9: sin ubicación de datos resuelta no se da ni un paso más.
  if (configUbicacionNoResuelta) {
    detenerArranquePorConfigUbicacion();
    return;
  }
  // P22 — dos cosas, y las dos ANTES de la splash y de tocar ninguna base de datos:
  //   1. si hay una ubicación propia configurada, dejar constancia durable de
  //      ello (lo que impide que un arranque futuro sin location.json confunda
  //      este equipo con una instalación nueva);
  //   2. si NO hay configuración, pasar por la puerta antes de usar la carpeta
  //      de datos local.
  if (customUserDataDirTarget) {
    registrarUbicacionPersonalizada(customUserDataDirTarget, customUserDataDirShared);
  } else if (autorizarCarpetaLocal('sin-configuracion') === 'cerrar') {
    app.quit();
    return;
  }
  showSplashWindow();
  if (customUserDataDirFailure) {
    if ((await resolveUserDataDirFailureInteractively()) === 'cerrar') {
      closeSplashWindow(() => app.quit());
      return;
    }
  }
  startUserDataWatchdog();
  // v0.1.39: adelanta la primera lectura (y cacheado en memoria) de la
  // plantilla del dashboard al arranque, mientras se ve la splash —
  // en vez de esperar a que el usuario abra su primer proyecto o el
  // Directorio de Talento. readStockTemplate() ya cachea el resultado en
  // stockTemplateCache (module-level) tras la primera lectura de disco;
  // sin este adelanto, esa primera lectura ocurría en el momento en que
  // el usuario abría su primer proyecto de la sesión, y se notaba como
  // un retraso perceptible solo la primera vez (reportado por el
  // usuario: "la primera vez que abro un proyecto tarda, luego va
  // fluido" — comportamiento esperado, pero mejor escondido detrás del
  // arranque, que ya se espera que tarde un poco, que detrás de la
  // primera apertura de un proyecto). Se protege con try/catch porque no
  // es crítico: si fallara aquí, stockTemplateCache se queda sin rellenar
  // y readStockTemplate() simplemente reintentará la lectura la primera
  // vez que de verdad haga falta (mismo comportamiento que sin este
  // adelanto).
  try {
    readStockTemplate();
  } catch (e) {
    /* no crítico: se reintentará solo en el primer uso real */
  }
  await waitForCloudSyncIdleAtStartup();
  if ((await checkCustomLocationDatabaseSanity()) === 'cerrar') {
    closeSplashWindow(() => app.quit());
    return;
  }
  // v0.1.56: a estas alturas ya se sabe con certeza qué carpeta de datos se
  // usa de verdad esta sesión (checkCustomLocationDatabaseSanity ya pudo
  // haber hecho fallback a la de por defecto) — momento correcto para
  // sincronizar la protección de apagado y comprobar el bloqueo multi-PC,
  // ambos ligados a isUsingSharedDataLocationNow() (v0.1.57).
  syncDriveSyncGuardWithLocation();
  const canProceedPastLock = await checkMultiPcLock();
  if (!canProceedPastLock) {
    // El usuario decidió no abrir porque otro equipo parece tenerlo abierto
    // — no se toca la base de datos ni se abre ninguna ventana.
    closeSplashWindow(() => app.quit());
    return;
  }
  // ------------------------------------------------------------------
  // A3.3 BLOQUE 2 — cableado de política y autorización de creación.
  //
  // Las dos cosas van ANTES de getDb(): la política decide cómo detecta
  // A3.3 en cada escritura, y la autorización decide si getDb() puede crear
  // una base de datos cuando no hay ninguna.
  // ------------------------------------------------------------------
  const clasif = clasificarPoliticaUbicacion();
  dbmod.setPoliticaUbicacion(clasif.politica);
  appLog(`A3.3 — política de ubicación: ${clasif.politica} (${clasif.motivo})`);

  const permiso = decidirCrearSiAusente();
  appLog(`A3.3 — autorización de creación: ${permiso.crear ? 'SÍ' : 'NO'} (${permiso.motivo})`);

  // Si se va a conceder una primera creación, la ruta tiene que dejar de
  // parecer "nunca usada" ANTES de que se escriba el primer byte. Si esa
  // constancia no se puede dejar y releer, NO se concede: se prefiere no
  // arrancar a crear una base de datos cuyo permiso siguiera siendo renovable.
  if (permiso.crear) {
    // La identidad tiene que ser estable ANTES de escribir ninguna marca: con
    // un installation-id de sesión, las marcas que dejemos ahora dejarían de
    // ser nuestras al siguiente arranque y no servirían para recuperar.
    let identidadOk = false;
    try { identidadOk = dbmod.identidadPersistida() === true; } catch (e) { identidadOk = false; }
    if (!identidadOk) {
      appLog('ERROR PS-1017 — no se pudo guardar la identidad de este equipo; no se inicializa nada.');
      dialog.showMessageBoxSync(undefined, {
        type: 'error',
        title: 'No se puede inicializar la base de datos',
        message: 'Panorama del Servicio no ha podido guardar la identidad de este equipo, y sin ella una ' +
          'inicialización interrumpida no se podría recuperar.',
        detail: `Configuración local: ${path.dirname(rutaRegistroUbicaciones())}\n\n` +
          'NO se ha creado ni escrito nada.' + errorCodeSuffix('PS-1017'),
        buttons: ['Cerrar'],
        noLink: true,
      });
      closeSplashWindow(() => app.quit());
      return;
    }

    const marcaPrevia = marcarUbicacionInicializando(app.getPath('userData'));
    if (marcaPrevia.ok) {
      // VÍNCULO ENTRE LAS DOS CAPAS: db.js registra su intención con EL MISMO
      // identificador que acaba de persistir main.js. Así "el mismo intento"
      // es comprobable en los datos, no una afirmación del comentario. Si no
      // se puede dejar, no se crea nada.
      let vinculo = null;
      try {
        vinculo = dbmod.registrarIntencionDeCreacionPara(app.getPath('userData'), marcaPrevia.intento);
      } catch (e) {
        vinculo = { ok: false, motivo: String((e && e.message) || e) };
      }
      if (!vinculo.ok || vinculo.nonce !== marcaPrevia.intento) {
        marcaPrevia.ok = false;
        marcaPrevia.motivo = vinculo && vinculo.ok
          ? `la intención de db.js quedó con otro identificador (${vinculo.nonce}) distinto del registrado (${marcaPrevia.intento})`
          : `no se pudo vincular la intención de db.js: ${vinculo && vinculo.motivo}`;
      } else {
        appLog(`A3.3 — intento de creación ${marcaPrevia.intento} vinculado entre el registro local y db.js`);
      }
    }
    if (!marcaPrevia.ok) {
      appLog(`ERROR PS-1017 — no se pudo dejar constancia local del intento de creación: ${marcaPrevia.motivo}`);
      dialog.showMessageBoxSync(undefined, {
        type: 'error',
        title: 'No se puede inicializar la base de datos',
        message: 'Panorama del Servicio iba a crear su base de datos por primera vez, pero no ha podido ' +
          'dejar constancia de ello en la configuración local.',
        detail:
          `Carpeta de datos: ${app.getPath('userData')}\n` +
          `Configuración local: ${path.dirname(rutaRegistroUbicaciones())}\n\n${marcaPrevia.motivo}\n\n` +
          'NO se ha creado ni escrito nada. Sin esa constancia, un corte a mitad podría hacer que la ' +
          'aplicación volviera a crear una base de datos vacía más adelante.' +
          errorCodeSuffix('PS-1017'),
        buttons: ['Cerrar'],
        noLink: true,
      });
      closeSplashWindow(() => app.quit());
      return;
    }
  }

  // Camino de ACTUALIZACIÓN: hay una base de datos y esta ruta todavía no
  // consta. Se deja constancia ANTES de abrirla, por la misma razón que en la
  // primera creación: si el proceso cae entre detectarla y registrarla, y la
  // base de datos desaparece después, la ruta no puede volver a parecer
  // "nunca vista". No genera nonce ni intención de creación.
  if (!permiso.crear && permiso.necesitaRegistrarExistente) {
    const marcaExistente = marcarUbicacionDetectadaExistente(app.getPath('userData'));
    if (!marcaExistente.ok) {
      appLog(`ERROR PS-1019 — no se pudo registrar que esta ubicación ya tiene base de datos: ${marcaExistente.motivo}`);
      dialog.showMessageBoxSync(undefined, {
        type: 'error',
        title: 'No se puede abrir de forma segura',
        message: 'Panorama del Servicio ha encontrado tu base de datos, pero no ha podido dejar constancia ' +
          'de ello en la configuración local.',
        detail:
          `Carpeta de datos: ${app.getPath('userData')}\n` +
          `Configuración local: ${path.dirname(rutaRegistroUbicaciones())}\n\n${marcaExistente.motivo}\n\n` +
          'NO se ha abierto ni modificado la base de datos. Se cierra a propósito: sin esa constancia, si ' +
          'más adelante la base de datos no apareciera, la aplicación podría llegar a crear una vacía.' +
          errorCodeSuffix('PS-1019'),
        buttons: ['Cerrar'],
        noLink: true,
      });
      closeSplashWindow(() => app.quit());
      return;
    }
  }

  // Bloque 3 — A3.3 puede ADOPTAR en silencio una versión publicada por otro
  // equipo. Cuando eso pasa, la sal y el verificador pueden ser otros: hay que
  // revalidar la clave de Seguridad que tengamos en memoria ANTES de la
  // siguiente operación. Se registra antes de abrir para no perder ni el
  // primer aviso.
  dbmod.alCambiarImagenEnMemoria((ev) => {
    if (!ev || ev.motivo === 'commit-propio') return;   // lo escribimos nosotros
    revalidarSeguridadTrasAdopcion(ev.motivo);
  });

  try {
    await dbmod.getDb({ crearSiAusente: permiso.crear });
  } catch (e) {
    // A3.3 puede negarse a abrir por motivos que NO son un fallo de la app:
    // la base de datos no está donde debería, no se puede verificar, o no hay
    // autorización para crear una nueva. Se explica y se sale sin tocar nada.
    const detalle = (e && e.message) ? e.message : String(e);
    appLog(`ERROR PS-1016 — no se pudo abrir la base de datos: ${detalle}`);
    dialog.showMessageBoxSync(undefined, {
      type: 'error',
      title: 'No se puede abrir la base de datos',
      message: 'Panorama del Servicio no ha podido abrir su base de datos y NO ha creado ninguna nueva.',
      detail:
        `Carpeta: ${app.getPath('userData')}\n\n${detalle}\n\n` +
        'No se ha modificado ni borrado nada. Si la carpeta de datos está en Google Drive/OneDrive, ' +
        'espera a que termine de sincronizar y vuelve a abrir la aplicación.' +
        errorCodeSuffix('PS-1016'),
      buttons: ['Cerrar'],
      noLink: true,
    });
    closeSplashWindow(() => app.quit());
    return;
  }

  // La base de datos está abierta y confirmada: se cierra la transición a
  // 'inicializada'. A partir de ahí, que desaparezca ya no volverá a
  // interpretarse como "primera vez".
  //
  // Si esta transición NO se puede dejar durable, la base de datos ya está
  // creada y confirmada —no se deshace nada— pero la sesión NO continúa: de
  // lo contrario la aplicación trabajaría con una ruta que localmente sigue
  // sin constar, y el permiso de primera creación seguiría siendo renovable.
  let marcaFinal;
  try {
    marcaFinal = marcarUbicacionInicializada(app.getPath('userData'), dbmod.getCommitActual());
  } catch (e) {
    marcaFinal = { ok: false, motivo: String((e && e.message) || e) };
  }
  if (!marcaFinal.ok) {
    appLog(`ERROR PS-1018 — la base de datos está bien, pero no se pudo completar el registro local: ${marcaFinal.motivo}`);
    dialog.showMessageBoxSync(undefined, {
      type: 'error',
      title: 'No se puede continuar de forma segura',
      message: 'Tu base de datos está intacta y NO se ha perdido nada, pero Panorama del Servicio no ha ' +
        'podido dejar constancia en la configuración local de que esta carpeta ya tiene datos.',
      detail:
        `Carpeta de datos: ${app.getPath('userData')}\n` +
        `Configuración local: ${path.dirname(rutaRegistroUbicaciones())}\n\n${marcaFinal.motivo}\n\n` +
        'La aplicación se cierra a propósito: seguir sin esa constancia podría hacer que, más adelante, ' +
        'creara una base de datos vacía encima de la tuya. Comprueba los permisos de esa carpeta de ' +
        'configuración y vuelve a abrir.' +
        errorCodeSuffix('PS-1018'),
      buttons: ['Cerrar'],
      noLink: true,
    });
    closeSplashWindow(() => app.quit());
    return;
  }

  // A1: si un re-cifrado de la Seguridad quedó interrumpido de verdad (corte
  // de luz, cierre forzado del proceso a mitad), se resuelve AQUÍ — después
  // de abrir la base de datos y ANTES del login, porque la sal y el
  // verificador contra los que se validará la contraseña tecleada pueden
  // depender justo de esta consolidación pendiente.
  //
  // Bloque 3: va LO PRIMERO, antes de cualquier otra escritura. Hasta ahora
  // maybeRunPeriodicVacuum() —que escribe (VACUUM + last_vacuum_at)— corría
  // por delante, es decir, se tocaba la base de datos antes de saber si había
  // un cambio de Seguridad a medias sobre ella.
  let rekeyRecovery = null;
  try {
    rekeyRecovery = recoverInterruptedRekeyIfAny();
  } catch (e) {
    rekeyRecovery = { fallaCerrado: true, motivo: 'fallo inesperado al recuperar un cambio de Seguridad interrumpido', detalle: String((e && e.message) || e), staging: rekeyStagingDir() };
    appLog('ERROR PS-2004 — ' + rekeyRecovery.motivo + ': ' + rekeyRecovery.detalle);
  }


  // FAIL-CLOSED. Si la recuperación tocó o terminó archivos pero no puede
  // demostrar y confirmar la base de datos que les corresponde, esta sesión no
  // continúa: ni login, ni launcher, ni migraciones, ni vacuum, ni ninguna
  // escritura auxiliar. El journal y la carpeta de trabajo quedan INTACTOS y
  // se reintenta en el siguiente arranque.
  if (rekeyRecovery && rekeyRecovery.fallaCerrado) {
    const queHacer = rekeyRecovery.ajeno
      ? 'Este cambio de Seguridad fue iniciado por otro equipo. Cierra Panorama del Servicio en todos los ' +
        'equipos y vuelve a abrirlo primero en el equipo que inició el cambio. Si ese equipo ya no existe, ' +
        'conserva la carpeta ".panorama-rekey" para recuperación manual.'
      // C1-A: sin registro, volver a abrir NO lo resuelve. No se promete.
      : rekeyRecovery.sinRegistro
      ? 'No se ha modificado ni borrado nada. Esa carpeta de trabajo no tiene registro, así que la ' +
        'aplicación no puede saber qué contiene ni resolverla sola: volver a abrirla dará este mismo aviso ' +
        'hasta que alguien revise la carpeta a mano. No la borres sin revisarla: puede contener la única ' +
        'copia de archivos anteriores.'
      : 'No se ha modificado ni borrado nada: tus archivos originales y el registro del cambio siguen ' +
        'intactos en la carpeta de trabajo. La aplicación se cierra a propósito en vez de seguir con la ' +
        'Seguridad a medias. Vuelve a abrirla: si el problema era temporal (otro equipo escribiendo, la ' +
        'carpeta compartida sin conexión), se resuelve solo.';
    dialog.showMessageBoxSync(undefined, {
      type: 'error',
      title: 'Cambio de Seguridad sin terminar',
      message: 'Panorama del Servicio ha encontrado un cambio de Seguridad que no puede completar con garantías.',
      detail:
        `${rekeyRecovery.motivo}.\n\n` +
        (rekeyRecovery.detalle ? `Detalle: ${rekeyRecovery.detalle}\n\n` : '') +
        `Carpeta de trabajo:\n${rekeyRecovery.staging}\n\n${queHacer}` +
        errorCodeSuffix('PS-2004'),
      buttons: ['Cerrar'],
      noLink: true,
    });
    closeSplashWindow(() => app.quit());
    return;
  }


  // Bloque 4: los guardados archivo+BD interrumpidos se resuelven en el MISMO
  // punto y con el mismo criterio. Si alguno queda sin demostrar, tampoco se
  // ejecuta después una migración que escribiría más encima.
  let accionesRecovery = null;
  try {
    accionesRecovery = recuperarAccionesPendientes();
  } catch (e) {
    accionesRecovery = { resueltas: [], fallosCerrados: [{ motivo: 'fallo inesperado al recuperar guardados pendientes', detalle: String((e && e.message) || e) }] };
    appLog('ERROR PS-2006 — ' + accionesRecovery.fallosCerrados[0].motivo + ': ' + accionesRecovery.fallosCerrados[0].detalle);
  }
  if (accionesRecovery && accionesRecovery.fallosCerrados.length) {
    const f = accionesRecovery.fallosCerrados[0];
    dialog.showMessageBoxSync(undefined, {
      type: 'error',
      title: 'Un guardado anterior quedó sin resolver',
      message: 'Panorama del Servicio ha encontrado un guardado que no puede decidir con certeza.',
      detail:
        `${f.motivo}.\n\n` + (f.detalle ? `Detalle: ${f.detalle}\n\n` : '') +
        `Carpeta de trabajo:\n${accionesDir()}\n\n` +
        'NO se ha borrado ni sobrescrito nada: se conserva todo el material. La aplicación se cierra a ' +
        'propósito en vez de seguir escribiendo encima. Vuelve a abrirla: si el problema era temporal ' +
        '(otro equipo guardando, la carpeta compartida sin conexión), se resuelve solo.' +
        errorCodeSuffix('PS-2006'),
      buttons: ['Cerrar'],
      noLink: true,
    });
    closeSplashWindow(() => app.quit());
    return;
  }

  // A3.3/BLOQUE 5: los BORRADOS interrumpidos se resuelven en el mismo punto y
  // con el mismo criterio, y DESPUÉS de los guardados — un borrado que hay que
  // deshacer necesita que el estado de los archivos ya esté decidido.
  //
  // Va antes del vacuum y del login por lo mismo que los otros dos: si queda
  // algo sin demostrar, nada más debe escribir encima.
  let borradosRecovery = null;
  try {
    borradosRecovery = await recuperarBorradosPendientes();
  } catch (e) {
    borradosRecovery = { ok: false, malos: [{ clase: 'fallo-inesperado', motivo: String((e && e.message) || e) }] };
    appLog('ERROR PS-2006 — fallo inesperado al recuperar borrados pendientes: ' + String((e && e.message) || e));
  }
  if (borradosRecovery && !borradosRecovery.ok) {
    const f = borradosRecovery.malos[0];
    dialog.showMessageBoxSync(undefined, {
      type: 'error',
      title: 'Un borrado anterior quedó sin resolver',
      message: 'Panorama del Servicio ha encontrado un borrado que no puede decidir con certeza.',
      detail:
        `${f.clase}${f.motivo ? ': ' + f.motivo : ''}.\n\n` +
        `Carpeta de trabajo:\n${borradosDir()}\n\n` +
        'NO se ha borrado ni repuesto nada: se conserva todo el material, tanto lo apartado como lo que ' +
        'haya reaparecido en su sitio. La aplicación se cierra a propósito en vez de seguir escribiendo ' +
        'encima. Vuelve a abrirla: si el problema era temporal (otro equipo trabajando, la carpeta ' +
        'compartida sin conexión), se resuelve solo.' +
        errorCodeSuffix('PS-2006'),
      buttons: ['Cerrar'],
      noLink: true,
    });
    closeSplashWindow(() => app.quit());
    return;
  }

  // A2 bajo A3.3: las RESTAURACIONES interrumpidas van las ÚLTIMAS de las
  // cuatro recuperaciones. Reponer una partición necesita que el estado de los
  // archivos ya esté decidido por rekey, acciones y borrados.
  //
  // Lo primero que hace es REARMAR la barrera de cada proyecto con material
  // pendiente, antes de resolver nada: si algo falla a media recuperación, ese
  // proyecto sigue sin aceptar escrituras.
  let restauracionesRecovery = null;
  try {
    restauracionesRecovery = await recuperarRestauracionesPendientes();
  } catch (e) {
    restauracionesRecovery = { ok: false, malos: [{ clase: 'fallo-inesperado', motivo: String((e && e.message) || e) }] };
    appLog('ERROR PS-2006 — fallo inesperado al recuperar restauraciones pendientes: ' + String((e && e.message) || e));
  }
  if (restauracionesRecovery && !restauracionesRecovery.ok) {
    const f = restauracionesRecovery.malos[0];
    dialog.showMessageBoxSync(undefined, {
      type: 'error',
      title: 'Una restauración anterior quedó sin resolver',
      message: 'Panorama del Servicio ha encontrado una restauración que no puede decidir con certeza.',
      detail:
        `${f.clase}${f.motivo ? ': ' + f.motivo : ''}.\n\n` +
        `Carpeta de trabajo:\n${restauracionesDir()}\n\n` +
        'NO se ha restaurado ni deshecho nada: se conserva todo el material, incluida la copia del estado ' +
        'anterior. Tus backups siguen intactos en disco. La aplicación se cierra a propósito en vez de ' +
        'seguir escribiendo encima.' +
        errorCodeSuffix('PS-2006'),
      buttons: ['Cerrar'],
      noLink: true,
    });
    closeSplashWindow(() => app.quit());
    return;
  }

  maybeRunPeriodicVacuum();
  const loggedIn = await runLoginFlow();
  if (!loggedIn) {
    // El usuario canceló/cerró la ventana de login con la seguridad
    // activada: no se abre el launcher sin desbloquear antes.
    closeSplashWindow(() => app.quit());
    return;
  }
  migrateLegacyInlineBackupsToFiles();
  // C1-A: inventario de residuos — solo lectura, una línea en app.log. Va aquí,
  // con las cuatro recuperaciones ya resueltas y la migración hecha, para
  // contar el estado con el que empieza de verdad la sesión.
  registrarInventarioDeResiduos();
  createLauncherWindow();
  // A1: si al arrancar se terminó de aplicar un re-cifrado que había quedado
  // a medias, hay que decirlo — sobre todo porque puede significar que la
  // contraseña válida a partir de ahora es la NUEVA, no la que el usuario
  // recuerda haber estado usando.
  //
  // Bloque 3: los caminos "quedó algo pendiente" ya no llegan hasta aquí — se
  // cierran antes (fail-closed). Lo que puede llegar es una recuperación
  // completada, o la comprobación de que el cambio ya estaba aplicado del todo
  // y solo faltaba retirar la carpeta de trabajo.
  if (rekeyRecovery && rekeyRecovery.recovered) {
    const queDecir = rekeyRecovery.yaEstaba
      ? 'Ya se había aplicado por completo; al abrir solo quedaba retirar la carpeta de trabajo. No se ha ' +
        'cambiado ningún dato.'
      : 'Se ha terminado de aplicar automáticamente al abrir la app, sin perder nada.';
    const cual = rekeyRecovery.mode === 'disable'
      ? '\n\nEl cifrado de backups queda DESACTIVADO.'
      : '\n\nA partir de ahora la contraseña válida es la NUEVA que estabas poniendo cuando se interrumpió.' +
        (rekeyRecovery.yaEstaba ? '' : '\n\nSi tenías marcado "recordar en este equipo", habrá que volver a ' +
          'introducirla una vez: la recuperación no puede reponer una contraseña que nadie le dio.');
    modalAlert(
      launcherWin,
      'La última vez, un cambio en la Seguridad (' + rekeyRecovery.mode + ') se quedó a medias.\n\n' +
        queDecir + cual + errorCodeSuffix('PS-2004'),
      { title: 'Cambio de Seguridad interrumpido' }
    );
  }
  if (customUserDataDirFailure) {
    // A estas alturas ya se esperó, se reintentó y el usuario eligió explícitamente
    // seguir con datos locales en el diálogo bloqueante de resolveUserDataDirFailureInteractively
    // — este es solo un recordatorio, ya con el lanzador visible, de qué carpeta se está usando.
    modalAlert(
      launcherWin,
      `Se configuró usar:\n${customUserDataDirFailure.attempted}\n\n` +
        `pero sigue sin poder accederse a ella (motivo: ${customUserDataDirFailure.error}).\n\n` +
        'Se está usando la carpeta de datos local por ahora — no se ha perdido nada, pero NO estás viendo tus ' +
        'proyectos más recientes. En cuanto esa carpeta vuelva a estar disponible, cierra la app y vuelve a abrirla.' +
        errorCodeSuffix('PS-1005'),
      { title: 'Usando datos locales temporalmente', danger: true }
    );
  }
  // P22: si no se pudo dejar constancia de que este equipo usa una carpeta de
  // datos propia, NO se sigue como si todo estuviera protegido: se dice. La
  // barrera no desaparece —el registro de ubicaciones de A3.3 guarda la misma
  // información por su cuenta, y mientras tanto la ausencia de constancia nunca
  // cuenta como prueba de «instalación nueva»— pero queda degradada.
  if (historialUbicacionDegradado) {
    modalAlert(
      launcherWin,
      'Panorama del Servicio no ha podido guardar en la configuración local la constancia de que este equipo ' +
        'usa una carpeta de datos propia.\n\n' +
        `Detalle: ${historialUbicacionDegradado.motivo}\n\n` +
        'Todo sigue funcionando con normalidad y tus datos no están en riesgo por esto. Lo que queda debilitado ' +
        'es una defensa: esa constancia es la que impide que, más adelante y sin el archivo de configuración, un ' +
        'arranque confunda este equipo con una instalación nueva. Revisa los permisos de la carpeta de ' +
        'configuración de Windows.' +
        errorCodeSuffix('PS-1024'),
      { title: 'No se pudo dejar constancia de la ubicación de datos', danger: true }
    );
  }
});

// v0.1.56: libera el lock multi-PC (si lo tomamos nosotros) al cerrar la
// app del todo — así el siguiente PC (o esta misma copia la próxima vez) no
// se encuentra un aviso de "abierto en otro equipo" que ya dejó de ser
// cierto. 'before-quit' cubre tanto "Salir" del menú como cerrar la última
// ventana (que dispara app.quit() más abajo).
app.on('before-quit', () => {
  // B2 clase 3: a partir de aquí, una ventana que muere es una salida
  // esperada, no un fallo que haya que avisar ni recuperar.
  cerrandoApp = true;
  releaseMultiPcLockIfOwned();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createLauncherWindow();
});

// ---------- IPC: launcher ----------
ipcMain.handle('app:quit', () => {
  app.quit();
});

// v0.1.38: versión visible en el propio lanzador (no solo en "Acerca de"),
// para que se note a simple vista si un parche se ha aplicado de verdad o
// no — pedido explícito del usuario. app.getVersion() lee siempre el
// package.json del app.asar realmente presente en ese arranque (sin caché,
// sin fallback al .exe — confirmado en la investigación de la 0.1.36), así
// que este valor SIEMPRE refleja la versión realmente instalada, se
// actualiza solo con cada parche aplicado.
ipcMain.handle('app:getVersion', () => app.getVersion());

// ------------------------------------------------------------------
// v2.0.14 — controles de ventana y menú propios PARA EL LAUNCHER, prueba
// piloto de quitar el marco nativo de Windows (ver la nota larga junto a
// `frame: false` en createLauncherWindow()). BrowserWindow.fromWebContents
// identifica la ventana que llama sin necesidad de pasar un id — solo el
// launcher usa esto por ahora, pero queda genérico por si el piloto se
// extiende a más ventanas.
// ------------------------------------------------------------------
ipcMain.handle('win:minimize', (evt) => {
  const w = BrowserWindow.fromWebContents(evt.sender);
  if (w) w.minimize();
});
ipcMain.handle('win:toggleMaximize', (evt) => {
  const w = BrowserWindow.fromWebContents(evt.sender);
  if (!w) return;
  if (w.isMaximized()) w.unmaximize();
  else w.maximize();
});
ipcMain.handle('win:close', (evt) => {
  const w = BrowserWindow.fromWebContents(evt.sender);
  if (w) w.close();
});
ipcMain.handle('win:isMaximized', (evt) => {
  const w = BrowserWindow.fromWebContents(evt.sender);
  return w ? w.isMaximized() : false;
});

// Estado de Seguridad para decidir qué opciones mostrar en el desplegable
// "Seguridad" propio del launcher (mismo criterio que securityMenuItems()).
ipcMain.handle('security:isEnabled', () => isSecurityEnabled());

// Despacha las acciones del menú "Configuración" propio del launcher a las
// MISMAS funciones que usaba el menú nativo (buildLauncherMenu) — ningún
// comportamiento nuevo, solo un disparador distinto.
// B2 clase 4: un fallo de UNA acción de menú es un error de operación, no un
// fallo global. Se captura aquí porque los renderers llaman a este canal sin
// await ni .catch() (lanzador, dashboard y directorio): sin esto, cualquier
// excepción acababa en un rechazo no manejado del renderer, invisible.
// El camino de ÉXITO devuelve exactamente lo mismo que antes; lo único que
// cambia es que un error ya no se propaga como rechazo, sino que se enseña.
ipcMain.handle('launcherMenu:action', async (evt, action) => {
  const win = BrowserWindow.fromWebContents(evt.sender) || launcherWin;
  try {
    return await despacharAccionLanzador(win, action);
  } catch (e) {
    reportarErrorDeOperacion(win, 'menú del lanzador: ' + action, e);
    return undefined;
  }
});

function despacharAccionLanzador(win, action) {
  switch (action) {
    case 'security-setup':
      return openSecurityWindow('setup', win);
    case 'security-change':
      return openSecurityWindow('change', win);
    case 'security-disable':
      return openSecurityWindow('disable', win);
    case 'config-open-data-folder':
      return openPathLogged(app.getPath('userData'));
    case 'config-change-data-location':
      return changeUserDataLocation(win);
    case 'config-reset-data-location':
      return resetUserDataLocationToDefault(win);
    case 'config-drive-sync-log':
      return openDriveSyncGuardLog(win);
    case 'config-apply-patch':
      return applyAsarPatch(win);
    case 'config-diagnostics':
      return showDiagnosticsDialog(win);
    case 'config-open-install-folder':
      return openInstallFolder();
    case 'config-patch-log':
      return openPatchLog(win);
    case 'config-app-log':
      return openAppLog(win);
    case 'config-error-codes':
      return showErrorCodesDialog(win);
    case 'config-about':
      return showAboutDialog(win);
    default:
      console.warn('launcherMenu:action — acción desconocida:', action);
  }
}

// v2.0.27: el panel de "Tema visual" del launcher es HTML propio (swatches,
// no un simple diálogo), así que no pasa por launcherMenu:action de arriba
// -- llama directamente a theme:get/theme:set (ver más arriba, junto a
// getGlobalTheme/setGlobalTheme).

// ------------------------------------------------------------------
// v2.0.16 — despacha las acciones del menú Archivo/Proyecto/Seguridad
// propio de la ventana de proyecto (y del Directorio de Talento, que
// reutiliza la misma ventana) a las MISMAS funciones que usaba
// buildProjectMenu — mismo comportamiento (incluidos los diálogos de
// confirmación), solo cambia el disparador. `projectId` viene del propio
// preload.js (ya lo tenía en su clausura, vía --panorama-project-id), no
// hace falta volver a mirar en qué ventana física está.
// ------------------------------------------------------------------
// B2 clase 4: ver el comentario de launcherMenu:action, más arriba.
ipcMain.handle('projectMenu:action', async (evt, { projectId, action }) => {
  const win = BrowserWindow.fromWebContents(evt.sender);
  try {
    return await despacharAccionProyecto(win, projectId, action);
  } catch (e) {
    reportarErrorDeOperacion(win, 'menú del proyecto: ' + action, e);
    return undefined;
  }
});

async function despacharAccionProyecto(win, projectId, action) {
  switch (action) {
    case 'archivo-nuevo': {
      const lw = focusOrCreateLauncher();
      lw.webContents.send('menu:new-project');
      return;
    }
    case 'archivo-elegir':
      focusOrCreateLauncher();
      return;
    case 'archivo-directorio': {
      const row = ensureDirectorioTalentoProject();
      openProjectWindow(row);
      return;
    }
    case 'archivo-cerrar':
      if (win) win.close();
      return;
    case 'archivo-salir':
      app.quit();
      return;
    case 'proyecto-backup-ahora':
      if (win) win.webContents.send('panorama:request-backup-now');
      return;
    case 'proyecto-prep-reunion': {
      const row = dbmod.get('SELECT * FROM projects WHERE id=?', [projectId]);
      if (row) openMeetingPrepWindow(row);
      return;
    }
    case 'proyecto-eval-candidatos': {
      const row = dbmod.get('SELECT * FROM projects WHERE id=?', [projectId]);
      if (row) openCandidateEvalWindow(row);
      return;
    }
    case 'proyecto-ver-backups': {
      const row = dbmod.get('SELECT * FROM projects WHERE id=?', [projectId]);
      if (row) openPathLogged(backupsDirForProject(row));
      return;
    }
    case 'proyecto-restaurar-ultimo': {
      const row = dbmod.get('SELECT * FROM projects WHERE id=?', [projectId]);
      if (!row) return;
      const ok = await modalConfirm(
        win,
        `Esto reemplaza los datos actuales de "${row.name}" por los del último backup guardado. Esta acción no se puede deshacer desde la propia app.`,
        { title: 'Restaurar último backup', confirmLabel: 'Restaurar' }
      );
      if (!ok) return;
      try {
        await restoreProjectBackup(projectId, null);
      } catch (e) {
        await modalAlert(win, String((e && e.message) || e) + errorCodeSuffix('PS-2002'), { title: 'No se pudo restaurar', danger: true });
      }
      return;
    }
    case 'proyecto-restaurar-concreto': {
      const row = dbmod.get('SELECT * FROM projects WHERE id=?', [projectId]);
      if (row) openBackupPickerWindow(row, win);
      return;
    }
    case 'proyecto-eliminar': {
      const row = dbmod.get('SELECT * FROM projects WHERE id=?', [projectId]);
      if (!row) return;
      const ok = await modalConfirm(
        win,
        'Se borran todos sus datos, backups y copias guardadas en disco. Esta acción no se puede deshacer.',
        { title: `¿Eliminar "${row.name}" definitivamente?`, confirmLabel: 'Eliminar definitivamente', danger: true }
      );
      if (!ok) return;
      const rDel = await deleteProjectById(projectId);
      await avisarResultadoBorradoProyecto(win, rDel, row.name);
      if (launcherWin && !launcherWin.isDestroyed()) {
        launcherWin.webContents.send('projects:changed');
      }
      return;
    }
    case 'partes-mensuales':
      if (win) win.webContents.send('panorama:show-partes-mensuales');
      return;
    case 'security-setup':
      return openSecurityWindow('setup', win);
    case 'security-change':
      return openSecurityWindow('change', win);
    case 'security-disable':
      return openSecurityWindow('disable', win);
    default:
      console.warn('projectMenu:action — acción desconocida:', action);
  }
}

// Cierra SOLO la ventana de proyecto que hizo la llamada (botón "Salir" del
// propio dashboard) — a diferencia de app:quit, que cierra la aplicación
// entera. BrowserWindow.fromWebContents(evt.sender) siempre resuelve a la
// ventana concreta que invocó este IPC, así que no hace falta buscarla en
// projectWindows ni pasar ningún id explícito.
ipcMain.handle('project-window:close', (evt) => {
  const win = BrowserWindow.fromWebContents(evt.sender);
  if (win && !win.isDestroyed()) win.close();
});

// v2.0.56: staffing activo/total del propio equipo del dashboard (mismo
// criterio que "Perfiles del equipo activos" en el panel KPI del dashboard:
// techRoles excluye rotados, techActive cuenta solo status==='activo') --
// hace falta como campo aparte de computeCandidateTeamCoverage porque ese
// solo cuenta VACANTES (puestos sin cubrir), no el total de plazas del
// equipo. Usado por la vista de lista ("Personal V/O") y el resumen de
// cartera. Null si no se pudo leer el estado del dashboard (mismo criterio
// conservador que el resto de estas funciones).
function computeStaffingRatio(projectId) {
  const dashResult = getProjectStateForMeetingPrep(projectId);
  if (!dashResult.ok || !dashResult.state) return null;
  const team = Array.isArray(dashResult.state.team) ? dashResult.state.team : [];
  const roles = team.filter((t) => t.status !== 'rotado');
  const active = roles.filter((t) => t.status === 'activo').length;
  return { active, total: roles.length };
}

// v2.0.56: se extrae de dentro de 'projects:list' para poder reutilizar
// exactamente el mismo cálculo (semáforo, entrevistas, vacantes, fin de
// servicio, staffing) desde 'portfolio:summary' sin duplicar los 5 bloques
// try/catch -- las dos vistas nuevas del lanzador (lista y resumen de
// cartera) parten de los mismos números que ya mostraba cada tarjeta.
// B1: `ctx` es el contexto de la pasada (ver `nuevoContextoListado`). Opcional:
// sin él cada helper lee de disco por su cuenta, como siempre.
function computeProjectRowExtras(r, ctx) {
  // La fila ya la tenemos: se siembra en el contexto para que los helpers de
  // candidatos no repitan su propio SELECT.
  if (ctx && !ctx.filas.has(r.id)) ctx.filas.set(r.id, r);
  try {
    r.semaforo = computeProjectSemaforo(r.id, ctx);
  } catch (e) {
    // B3: estos cuatro catch NO deberían ejecutarse nunca — las compute* no
    // lanzan, devuelven null, y esa degradación ya la cubrió B1 con
    // `avisarExtraDegradado`. Si alguno salta es una excepción inesperada: un
    // bug, y entonces es justo cuando más falta hace el rastro.
    appLogUnaVezPorSesion('extras-sem-' + r.id,
      `Listado de proyectos — excepción inesperada calculando el semáforo del proyecto ${r.id}: ` + motivoSinRutas(e));
    console.warn('No se pudo calcular el semáforo de urgencia para el proyecto', r.id, e);
    r.semaforo = null;
  }
  // v0.1.76: "N entrevista(s) pendiente(s)" como texto en la tarjeta —
  // ver computeCandidatePendingInterviews más arriba. Null si no hay
  // ninguna, o si no se pudo leer (p.ej. cifrado y seguridad bloqueada).
  try {
    const pending = computeCandidatePendingInterviews(r.id, ctx);
    r.pendingInterviewsCount = pending ? pending.count : 0;
    r.pendingInterviewsLevel = pending ? pending.level : null;
  } catch (e) {
    appLogUnaVezPorSesion('extras-ent-' + r.id,
      `Listado de proyectos — excepción inesperada calculando las entrevistas del proyecto ${r.id}: ` + motivoSinRutas(e));
    console.warn('No se pudo calcular las entrevistas pendientes para el proyecto', r.id, e);
    r.pendingInterviewsCount = 0;
    r.pendingInterviewsLevel = null;
  }
  // v2.0.49: puestos abiertos sin ningún candidato apto todavía -- ver
  // computeCandidateTeamCoverage. Null (no undefined) si el proyecto no
  // usa Evaluación de Candidatos en absoluto -- caso neutro, no aviso.
  try {
    const coverage = computeCandidateTeamCoverage(r.id, ctx);
    r.unfilledPositionsCount = coverage ? coverage.uncoveredCount : 0;
  } catch (e) {
    appLogUnaVezPorSesion('extras-cob-' + r.id,
      `Listado de proyectos — excepción inesperada calculando la cobertura de puestos del proyecto ${r.id}: ` + motivoSinRutas(e));
    console.warn('No se pudo calcular la cobertura de puestos para el proyecto', r.id, e);
    r.unfilledPositionsCount = 0;
  }
  // v2.0.11: aviso de servicio finalizando/finalizado (o prórroga estimada sin confirmar) —
  // ver computeServiceEndWarning más arriba.
  try {
    const warn = computeServiceEndWarning(r.id, ctx);
    r.serviceEndLevel = warn ? warn.level : null;
    r.serviceEndMessage = warn ? warn.message : null;
    // E2 (15 sept 2026): los campos ESTRUCTURADOS del status, para que nadie
    // tenga que volver a derivar lógica del texto. `serviceStatusDays` y NO
    // `serviceEndDays`: con `kind === 'proximo-inicio'` el número son días
    // hasta el INICIO, no hasta el fin, y ese nombre sería falso justo ahí.
    // Semántica completa (signo incluido) en `vendor/service-status.js`.
    r.serviceStatusKind = warn ? warn.kind : null;
    r.serviceStatusDays = warn ? warn.days : null;
  } catch (e) {
    appLogUnaVezPorSesion('extras-fin-' + r.id,
      `Listado de proyectos — excepción inesperada calculando el fin de servicio del proyecto ${r.id}: ` + motivoSinRutas(e));
    console.warn('No se pudo calcular el aviso de fin de servicio para el proyecto', r.id, e);
    r.serviceEndLevel = null;
    r.serviceEndMessage = null;
    r.serviceStatusKind = null;
    r.serviceStatusDays = null;
  }
  // B1 (15 sept 2026) — AQUÍ SE LLAMABA A `computeStaffingRatio()`, y se
  // devolvían `staffingActive` / `staffingTotal`. RETIRADO del listado.
  //
  // Los creó la v2.0.56 para la vista de Lista del lanzador, y **E1 retiró esa
  // vista**: desde entonces no los consumía nadie — ni el lanzador, ni
  // `portfolio:summary`, ni ninguna otra ventana. Comprobado sobre el árbol,
  // no supuesto. Y costaban UNA LECTURA COMPLETA del último backup por
  // proyecto y por refresco, sobre `G:`.
  //
  // `computeStaffingRatio()` NO se ha borrado: sigue ahí, intacta y sin
  // llamadores, para el día en que se termine la opción B de E1 (conectar
  // Lista / Resumen de Cartera). Reincorporarla será entonces una decisión
  // consciente — añadir la llamada aquí, con `ctx`, y los dos campos — y no un
  // coste que se paga en cada refresco por si acaso.
}

function listProjectRows() {
  // Excluye el Directorio de Talento (kind='directorio_talento'): es una fila
  // de `projects` por dentro, pero no es "un proyecto" de cara al listado del
  // launcher — tiene su propio botón/acceso (ver 'directorio:open').
  // Orden (v0.1.26): primero por sort_order (el orden manual que deja el
  // arrastrar-y-soltar del launcher), y DENTRO de eso — o para cualquier
  // proyecto que todavía no tenga sort_order asignado (NULL) — por
  // actividad reciente, como siempre. Mientras nadie haya arrastrado nunca
  // una tarjeta, sort_order es NULL en todas las filas y el orden es
  // exactamente el de antes.
  const rows = dbmod.all(
    `SELECT p.*,
        (SELECT COUNT(*) FROM backups b WHERE b.project_id=p.id) as backup_count,
        (SELECT MAX(created_at) FROM backups b WHERE b.project_id=p.id) as last_backup
       FROM projects p WHERE p.kind='project'
       ORDER BY (p.sort_order IS NULL), p.sort_order ASC, p.updated_at DESC`
  );
  // B1: UN contexto por pasada. Nace aquí, se pasa hacia abajo y muere al
  // volver — no hay ninguna referencia a él fuera de esta función. Esa es la
  // propiedad que hace que la optimización NO toque P13: dos llamadas seguidas
  // vuelven a leer el disco, así que el lanzador sigue viendo el último backup
  // persistido, ni más viejo ni más nuevo que antes.
  const ctx = nuevoContextoListado();
  rows.forEach((r) => computeProjectRowExtras(r, ctx));
  return rows;
}

ipcMain.handle('projects:list', () => listProjectRows());

// v2.0.56: agregados de cartera para la pantalla "Resumen de Salud de
// Cartera" del lanzador (rediseño pedido explícito del usuario, con
// referencias visuales). Reutiliza listProjectRows() -- ningún cálculo
// nuevo por proyecto, solo se agregan los mismos campos que ya alimentan
// las tarjetas y la vista de lista.
//
// Definiciones elegidas (no venían especificadas en las referencias, así
// que se documentan aquí para poder ajustarlas si no son las que el
// usuario tenía en mente):
// - "Backup saludable" = tiene al menos un backup Y el último backup es de
//   los últimos 14 días. 14 días es un margen holgado (los backups se
//   generan solos cada vez que se abre el proyecto) -- un proyecto sin
//   tocar más de dos semanas probablemente sigue bien, pero es la cifra
//   más fácil de ajustar si el criterio real es otro.
// - "Staffing cubierto" = % de proyectos con 0 puestos/plazas sin cubrir
//   (unfilledPositionsCount===0) sobre el total. "Vacantes rojas" = la
//   SUMA de unfilledPositionsCount de todos los proyectos (no el número de
//   proyectos afectados), para que coincida con lo que ya se ve sumando
//   las tarjetas individuales.
// - "Servicios próximos a vencer" = proyectos con serviceEndLevel
//   'amarillo' (finaliza en <=30 días) -- no cuenta los ya finalizados
//   ('rojo'), que son un problema distinto (ya resuelto o abandonado, no
//   "próximo a vencer").
// - Timeline de 30 días: 6 bandas de 5 días: para cada proyecto con
//   'amarillo'/'proximo-inicio' en ese rango de días vista, se cuenta como
//   "arranque/cierre" en la banda que le corresponda; los "vacantes rojas"
//   se reparten en la banda 0-5 (son un problema YA, no programado para
//   una fecha concreta) -- es una simplificación deliberada: no hay hoy
//   ninguna fecha asociada a "cuándo" se abrió una vacante, así que no hay
//   forma de repartirlas en el tiempo con los datos que existen ahora.
ipcMain.handle('portfolio:summary', () => {
  const rows = listProjectRows();
  const total = rows.length;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let backupsHealthy = 0;
  let staffingFull = 0;
  let redVacancies = 0;
  let expiringSoon = 0;
  const BANDS = [0, 5, 10, 15, 20, 25, 30];
  const timeline = BANDS.slice(0, -1).map((lo, i) => ({ from: lo, to: BANDS[i + 1], events: 0, vacancies: 0 }));

  rows.forEach((r) => {
    if (r.last_backup) {
      const diffDays = Math.round((today - new Date(r.last_backup)) / 86400000);
      if (diffDays <= 14) backupsHealthy++;
    }
    const unfilled = r.unfilledPositionsCount || 0;
    if (unfilled === 0) staffingFull++;
    redVacancies += unfilled;
    if (r.serviceEndLevel === 'amarillo') expiringSoon++;

    if (unfilled > 0) timeline[0].vacancies += unfilled;
    // E2 (15 sept 2026) — AQUÍ VIVÍA UN PARSER DE TEXTO. Esto era:
    //
    //     const daysMatch = /(\d+)/.exec(r.serviceEndMessage || '');
    //
    // es decir, se sacaban los días leyendo el MENSAJE de la interfaz. Funcionaba
    // por coincidencia, no por contrato: lo único que lo salvaba era que el
    // nivel 'rojo' no entraba en el `if`. Con «Finalizó el 09/12/2026» la regex
    // devuelve «09», y eso se habría contado como 9 días. Cualquier reescritura
    // del wording que metiera un número antes lo rompía EN SILENCIO.
    //
    // Ahora se usa el dato estructurado. `serviceStatusDays` son días CON SIGNO
    // hasta la fecha que da nombre a `serviceStatusKind` (ver
    // `vendor/service-status.js`): para estos dos estados es siempre >= 0, que
    // es justo lo que las bandas de 0-30 días necesitan. El mensaje queda para
    // presentación y nada más.
    // El CRITERIO de qué entra se deja EXACTAMENTE como estaba —por nivel, no
    // por `kind`— a propósito: 'amarillo' incluye también la prórroga estimada
    // próxima, y filtrar por `kind === 'finaliza-pronto'` la habría dejado
    // fuera sin que nadie lo pidiera. Lo único que cambia es DE DÓNDE sale el
    // número. Los niveles 'rojo' siguen sin entrar, igual que antes.
    if (r.serviceEndLevel === 'amarillo' || r.serviceEndLevel === 'proximo-inicio') {
      const days = r.serviceStatusDays;
      if (typeof days === 'number' && Number.isFinite(days) && days >= 0) {
        const band = timeline.find((b) => days >= b.from && days < b.to) || timeline[timeline.length - 1];
        band.events++;
      }
    }
  });

  return {
    total,
    backupsHealthyPct: total ? Math.round((backupsHealthy / total) * 100) : 0,
    backupsHealthyCount: backupsHealthy,
    staffingFullPct: total ? Math.round((staffingFull / total) * 100) : 0,
    redVacancies,
    expiringSoon,
    timeline,
    projects: rows,
  };
});

// Persiste el orden manual de las tarjetas del launcher tras arrastrar y
// soltar (v0.1.26) — `orderedIds` es el array COMPLETO de ids en el orden
// final que se ve en pantalla. Se asigna sort_order = índice a cada uno de
// una vez, así el orden queda totalmente determinado a partir de aquí
// (deja de depender de updated_at). Los proyectos que no estén en
// `orderedIds` (no debería pasar, pero por robustez) no se tocan.
// B4 (16 sept 2026) — REORDENAR ES **UNA** OPERACIÓN LÓGICA.
//
// Aquí había un `forEach` con un `dbmod.run()` por fila, y cada `dbmod.run()`
// es un commit A3.3 completo: exporta la base de datos entera, escribe el .gen
// y publica el .sqlite3. Con N proyectos eran N commits independientes.
//
// El diagnóstico de B4 lo reprodujo midiendo: cortando la publicación en la
// segunda vuelta, el archivo quedaba con `sort_order` = [0, null, null]. La
// primera vuelta YA estaba confirmada en disco, el commit había avanzado, y
// nadie reponía nada. No se pierden datos —`sort_order` es el orden de las
// tarjetas— pero es una operación aplicada A MEDIAS, que es justo lo que el
// Bloque 5 ya eliminó para los borrados (ver D3: "antes eran N commits
// sueltos... ahora UN ÚNICO commit para todos los DELETE").
//
// Ahora: las N sentencias van en UNA sola mutación, anclada al commit sobre el
// que se calculó el orden. O se aplica todo, o no se aplica nada. No lleva
// journal a propósito: un journal existe para emparejar ARCHIVOS con filas, y
// aquí no hay ningún archivo — sería inventar un mecanismo nuevo para nada.
ipcMain.handle('projects:reorder', (evt, orderedIds) => {
  if (procesoComprometido) return { ok: false, error: 'La aplicación está cerrándose por un fallo interno.' }; // B2
  if (!Array.isArray(orderedIds)) return { ok: false, error: 'Lista de orden inválida.' };
  // Lista vacía: no hay nada que ordenar. Se sale ANTES de escribir, porque
  // `escribirMultiple([])` sí produciría un commit — una escritura completa de
  // la base de datos para no cambiar nada.
  if (orderedIds.length === 0) return { ok: true };

  // Validación de la ENTRADA, antes de construir nada. No son reglas de
  // negocio nuevas: es que un id que no sea un entero se convertía en `NaN` y
  // el `WHERE id=NaN` no casaba con ninguna fila, así que ese proyecto se
  // quedaba sin orden mientras los demás sí se movían — un fallo silencioso.
  // Los `sort_order` no se validan porque no vienen de fuera: son el índice.
  const ids = orderedIds.map((x) => Number(x));
  if (!ids.every((n) => Number.isInteger(n) && n > 0)) {
    return { ok: false, error: 'La lista de orden contiene identificadores que no son válidos.' };
  }
  if (new Set(ids).size !== ids.length) {
    return { ok: false, error: 'La lista de orden repite algún proyecto.' };
  }

  // El orden se calculó sobre ESTA versión de la base de datos. Si otro equipo
  // publica mientras tanto, se rechaza en vez de consolidar sobre algo que ya
  // no es lo que el usuario vio. Mismo criterio que el resto de A3.3.
  const base = dbmod.getCommitActual();
  if (!base) return { ok: false, error: 'La base de datos todavía no tiene identidad.' };

  const sentencias = ids.map((id, idx) => ({
    sql: 'UPDATE projects SET sort_order=? WHERE id=?', params: [idx, id],
  }));
  try {
    dbmod.escribirMultiple(sentencias, { exigirCommitBase: base });
  } catch (e) {
    // B3: un fallo de persistencia que no sea de backup no dejaba NINGUNA
    // línea en app.log — el registro de db.js no sale de la memoria. Este sí,
    // porque B4 ha demostrado que este camino falla de forma observable.
    //
    // Sin dedupe a propósito: reordenar es un gesto manual del usuario, no un
    // bucle ni un temporizador. No puede hacer spam.
    //
    // No lleva la lista de proyectos (no hace falta para diagnosticar), ni
    // rutas: `motivoSinRutas` ya las quita del mensaje del sistema.
    appLog(`Reordenado de proyectos — NO aplicado (${ids.length} proyectos, ` +
      `clase ${(e && e.kind) || 'desconocida'}): ${motivoSinRutas(e)}`);
    // Se PROPAGA, no se devuelve `{ok:false}`: el renderer engancha su aviso al
    // `catch` de la promesa (ver el 'dragend' de launcher/renderer.js) y no
    // mira el valor devuelto. Devolver aquí un objeto haría que el fallo
    // pasara desapercibido, que es lo contrario de lo que se busca.
    throw e;
  }
  return { ok: true };
});

// ---------- IPC: Directorio de Talento ----------
ipcMain.handle('directorio:open', () => {
  const row = ensureDirectorioTalentoProject();
  openProjectWindow(row);
  return true;
});

ipcMain.handle('directorio:syncProfiles', () => {
  return collectTeamProfilesFromProjects();
});

// Usado por la ventana de "Preparación de Reunión" de un proyecto concreto
// (ver preparacion-reunion/plantilla_preparacion_reunion.html) para leer el
// backup de ESE proyecto sin que el usuario tenga que exportar/subir nada a
// mano. projectId llega ya resuelto desde el preload de esa ventana (mismo
// mecanismo de --panorama-project-id que usan las ventanas de proyecto).
ipcMain.handle('meeting:getProjectData', (evt, { projectId } = {}) => {
  return getProjectStateForMeetingPrep(projectId);
});

// ------------------------------------------------------------------
// Historial de "Preparación de Reunión": guardar una preparación completa
// (todas las respuestas + el guion generado) como un archivo .json en la
// carpeta de reuniones de ese proyecto, con una fila ligera en
// `meeting_preps` para poder listarlas sin leer cada archivo. Mismo patrón
// que los backups del dashboard (ver comentario junto a backup:save):
// cifrado con la clave de seguridad de la app si está activada, nada de
// contraseña aparte.
// ------------------------------------------------------------------
ipcMain.handle('meeting:savePrep', (evt, { projectId, meetingDate, finalidad, payload } = {}) => {
  // Bloque 4: las guardas tempranas devuelven ya el CONTRATO DE ACCIÓN, no un
  // `{ok,error}` a medias. Así main dice la verdad por sí mismo y no depende de
  // que preload complete la forma.
  if (procesoComprometido) return accionNoAplicada('La aplicación está cerrándose por un fallo interno; no se ha guardado nada.', false); // B2
  // A3.3/BLOQUE 5 + A2: UNA sola barrera por proyecto — borrado o restauración.
  { const b = proyectoBloqueadoParaMutar(projectId); if (b) return accionNoAplicada(b.mensaje, b.motivo === 'proyecto-en-restauracion'); }
  if (rekeyInProgress) return accionNoAplicada(REKEY_BUSY_MESSAGE, true); // A1, ver backup:save
  const row = dbmod.get('SELECT * FROM projects WHERE id=?', [projectId]);
  if (!row) return accionNoAplicada('Proyecto no encontrado.', false);
  const now = new Date().toISOString();
  const dir = meetingPrepsDirForProject(row);
  const stamp = now.replace(/[:.]/g, '-');
  // Bloque 4: el nombre lleva un nonce además de la marca de tiempo, para que
  // el destino sea único de verdad y la fila que lo referencia sirva como
  // prueba permanente de que esta acción se aplicó.
  const fileName = `reunion_${stamp}_${crypto.randomBytes(4).toString('hex')}.json`;
  const destino = path.join(dir, fileName);
  const r = ejecutarAccionDeArchivo({
    tipo: 'meeting-nuevo', destino, contenidoPlano: payload, modo: 'nuevo',
    sentencias: ({ cifrado }) => ([{
      sql: 'INSERT INTO meeting_preps(project_id, created_at, meeting_date, finalidad, file_path, encrypted) VALUES (?,?,?,?,?,?)',
      params: [projectId, now, meetingDate || null, (finalidad || '').slice(0, 300), fileName, cifrado ? 1 : 0],
    }]),
  });
  if (!r.ok) return r;
  // El id de la fila no lo devuelve el helper (la mutación lleva más de una
  // sentencia): se relee por su `file_path`, que es único.
  const fila = dbmod.get('SELECT id FROM meeting_preps WHERE project_id=? AND file_path=?', [projectId, fileName]);
  return Object.assign({}, r, { id: fila ? fila.id : null, createdAt: now });
});

// Actualiza EN SITIO una preparación ya guardada (mismo archivo, misma fila
// de meeting_preps) en vez de crear una nueva — usado por "✏️ Editar" en el
// historial: reabrir una preparación para completar el checklist de Cierre
// (u otros datos) tras la reunión real, sin duplicar el registro. Mantiene
// `created_at` original (es la fecha en que se guardó por primera vez);
// solo se actualizan meeting_date/finalidad y el contenido del archivo.
ipcMain.handle('meeting:updatePrep', (evt, { projectId, id, meetingDate, finalidad, payload } = {}) => {
  if (procesoComprometido) return accionNoAplicada('La aplicación está cerrándose por un fallo interno; no se ha guardado nada.', false); // B2
  // A3.3/BLOQUE 5 + A2: UNA sola barrera por proyecto — borrado o restauración.
  { const b = proyectoBloqueadoParaMutar(projectId); if (b) return accionNoAplicada(b.mensaje, b.motivo === 'proyecto-en-restauracion'); }
  if (rekeyInProgress) return accionNoAplicada(REKEY_BUSY_MESSAGE, true); // A1, ver backup:save
  const row = dbmod.get('SELECT * FROM projects WHERE id=?', [projectId]);
  if (!row) return accionNoAplicada('Proyecto no encontrado.', false);
  const prepRow = dbmod.get('SELECT * FROM meeting_preps WHERE id=? AND project_id=?', [id, projectId]);
  if (!prepRow) return accionNoAplicada('Preparación no encontrada (puede que se haya borrado).', false);
  const dir = meetingPrepsDirForProject(row);
  const destino = path.join(dir, prepRow.file_path);
  // Sobrescribe en sitio: el helper aparta el original y solo lo retira cuando
  // la fila ha confirmado. Si algo falla, el archivo vuelve a ser el de antes.
  const r = ejecutarAccionDeArchivo({
    tipo: 'meeting-editar', destino, contenidoPlano: payload, modo: 'overwrite',
    sentencias: ({ cifrado }) => ([{
      sql: 'UPDATE meeting_preps SET meeting_date=?, finalidad=?, encrypted=? WHERE id=?',
      params: [meetingDate || null, (finalidad || '').slice(0, 300), cifrado ? 1 : 0, id],
    }]),
  });
  if (!r.ok) return r;
  return Object.assign({}, r, { id });
});

ipcMain.handle('meeting:listPreps', (evt, { projectId } = {}) => {
  const rows = dbmod.all(
    'SELECT id, created_at, meeting_date, finalidad FROM meeting_preps WHERE project_id=? ORDER BY created_at DESC',
    [projectId]
  );
  return { ok: true, preps: rows };
});

ipcMain.handle('meeting:getPrep', (evt, { projectId, id } = {}) => {
  const row = dbmod.get('SELECT * FROM projects WHERE id=?', [projectId]);
  if (!row) return { ok: false, error: 'Proyecto no encontrado.' };
  const prepRow = dbmod.get('SELECT * FROM meeting_preps WHERE id=? AND project_id=?', [id, projectId]);
  if (!prepRow) return { ok: false, error: 'Preparación no encontrada.' };
  const dir = meetingPrepsDirForProject(row);
  let raw;
  try {
    raw = fs.readFileSync(path.join(dir, prepRow.file_path), 'utf8');
  } catch (e) {
    return { ok: false, error: 'No se pudo leer el archivo guardado: ' + ((e && e.message) || String(e)) };
  }
  if (prepRow.encrypted) {
    if (!securityKey) {
      return {
        ok: false,
        error:
          'Esta preparación está cifrada y la seguridad está bloqueada. Desbloquéala (contraseña al abrir la app, o menú Seguridad) antes de abrirla.',
      };
    }
    try {
      raw = securitymod.decryptString(securityKey, raw);
    } catch (e) {
      return { ok: false, error: 'No se pudo descifrar el archivo: ' + ((e && e.message) || String(e)) };
    }
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: 'El archivo guardado tiene un formato inesperado.' };
  }
  return { ok: true, id: prepRow.id, createdAt: prepRow.created_at, meetingDate: prepRow.meeting_date, finalidad: prepRow.finalidad, payload };
});

// Borra una preparación guardada (archivo + fila) — irreversible, la
// confirmación de "¿seguro?" la pide la propia ventana antes de llamar a
// esto (ver plantilla_preparacion_reunion.html).
// A3.3/BLOQUE 5 — D2. Antes borraba el archivo y DESPUÉS la fila, en dos pasos
// sin relación: un corte entre medias dejaba la fila apuntando a un archivo que
// ya no existía. Ahora pasa por el helper: archivo → cuarentena → DELETE + marca
// en UN commit → purgar. Contrato de tres formas.
ipcMain.handle('meeting:deletePrep', async (evt, { projectId, id } = {}) => {
  if (procesoComprometido) {
    return { ok: false, aplicado: false, reintentable: false, error: 'La aplicación está cerrándose por un fallo interno; no se ha borrado nada.' };
  }
  // A3.3/BLOQUE 5 + A2: UNA sola barrera por proyecto — borrado o restauración.
  {
    const b = proyectoBloqueadoParaMutar(projectId);
    if (b) return { ok: false, aplicado: false, reintentable: b.motivo === 'proyecto-en-restauracion', error: b.mensaje };
  }
  const row = dbmod.get('SELECT * FROM projects WHERE id=?', [projectId]);
  if (!row) return { ok: false, aplicado: false, reintentable: false, error: 'Proyecto no encontrado.' };
  const prepRow = dbmod.get('SELECT * FROM meeting_preps WHERE id=? AND project_id=?', [id, projectId]);
  if (!prepRow) return { ok: false, aplicado: false, reintentable: false, error: 'Preparación no encontrada (puede que ya se haya borrado).' };

  // Ruta pura: `meetingPrepsDirForProject()` haría mkdir y, con `backup_dir`
  // NULL, un UPDATE con su commit.
  const recursos = [];
  if (prepRow.file_path) {
    recursos.push({
      tipo: 'archivo', scope: 'archivo',
      origen: path.join(rutaBackupsPura(row), 'reuniones', prepRow.file_path),
    });
  }
  // Si el archivo ya no está, el helper lo descarta del inventario y el borrado
  // sigue siendo válido: la fila existe aunque el archivo no.
  const r = await ejecutarBorrado({
    tipo: 'borrar-prep',
    recursos,
    permitirSinArchivos: true,
    sentencias: () => [{ sql: 'DELETE FROM meeting_preps WHERE id=?', params: [id] }],
  });
  if (r.aplicado) {
    appLog(`Preparación ${id} eliminada (acción ${r.actionId}${r.verificado === false ? ', SIN VERIFICAR' : ''}).`);
  }
  return r;
});

// ------------------------------------------------------------------
// "Evaluación de Candidatos": lee/guarda el documento único de este
// proyecto (puestos + entrevistas). Mismo cifrado que meeting_preps/
// backups (clave de seguridad de la app si está activa, nada de
// contraseña aparte) — ver comentario junto a candidateEvalFileForProject().
// payload==null significa "todavía no se ha guardado nada" (proyecto
// nuevo): la propia plantilla arranca con puestos/evaluaciones vacíos.
// ------------------------------------------------------------------
// v0.1.76: lectura del documento de "Evaluación de Candidatos" de un
// proyecto, extraída de candidateEval:get para poder reutilizarla también
// desde computeCandidatePendingInterviews() (semáforo de entrevistas
// pendientes del launcher) sin duplicar la lógica de descifrado. `row` es
// la fila de `projects` ya cargada por quien llama — evita repetir el
// SELECT cuando ya se tiene a mano.
// B1: `ctx` opcional, igual que en getProjectStateForMeetingPrep. Con contexto
// se memoiza por proyecto durante la pasada y se usa la ruta PURA; sin él, el
// comportamiento de siempre para el resto de llamadores.
function readCandidateEvalPayloadForProject(row, ctx) {
  if (ctx && ctx.evaluaciones.has(row.id)) return ctx.evaluaciones.get(row.id);
  const r = leerCandidateEvalPayload(row, ctx);
  if (ctx) ctx.evaluaciones.set(row.id, r);
  return r;
}
function leerCandidateEvalPayload(row, ctx) {
  const metaRow = dbmod.get('SELECT * FROM candidate_evals WHERE project_id=?', [row.id]);
  const file = ctx ? rutaEvaluacionPura(row) : candidateEvalFileForProject(row);
  // Sin fila o sin archivo NO es un fallo: es un proyecto que no usa esta
  // herramienta. No se avisa de nada, y la respuesta memoizada evita que el
  // segundo consumidor de la pasada vuelva a comprobar si el archivo existe.
  if (!metaRow || !fs.existsSync(file)) return { ok: true, payload: null };
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (e) {
    const msg = (e && e.message) || String(e);
    avisarExtraDegradado(ctx, row.id, 'la evaluación de candidatos', 'ilegible', msg);
    return { ok: false, error: 'No se pudo leer el archivo guardado: ' + msg };
  }
  if (metaRow.encrypted) {
    if (!securityKey) {
      avisarExtraDegradado(ctx, row.id, 'la evaluación de candidatos', 'cifrado-no-legible', 'seguridad bloqueada');
      return {
        ok: false,
        error:
          'Esta evaluación está cifrada y la seguridad está bloqueada. Desbloquéala (contraseña al abrir la app, o menú Seguridad) antes de abrirla.',
      };
    }
    try {
      raw = securitymod.decryptString(securityKey, raw);
    } catch (e) {
      const msg = (e && e.message) || String(e);
      avisarExtraDegradado(ctx, row.id, 'la evaluación de candidatos', 'cifrado-no-legible', msg);
      return { ok: false, error: 'No se pudo descifrar el archivo: ' + msg };
    }
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    avisarExtraDegradado(ctx, row.id, 'la evaluación de candidatos', 'formato-inesperado', (e && e.message) || '');
    return { ok: false, error: 'El archivo guardado tiene un formato inesperado.' };
  }
  return { ok: true, payload };
}

// v0.1.76: semáforo de "entrevistas pendientes" para las tarjetas del
// launcher — mismo espíritu que computeProjectSemaforo (hitos/riesgos),
// pero sin depender de que ninguna ventana esté abierta: el archivo de
// Evaluación de Candidatos se guarda solo con cada cambio (no como los
// hitos, que viven en el localStorage de la ventana del dashboard — ver
// la conversación con el usuario que descartó enlazar entrevistas con
// hitos por ese motivo). "Pendiente" = no están puntuadas todas sus
// tareas todavía (si no tiene puesto/tareas asignadas, se cuenta
// igualmente como pendiente: no hay nada que dé por completada esa
// entrevista). Mismos umbrales de urgencia que los hitos, por
// coherencia visual con el resto de la app.
// v2.0.1: ANTES se exigía además tener fecha de entrevista para contar
// como pendiente — un candidato metido sin fecha (entrevista aún sin
// concretar) no sumaba al contador "N entrevista(s) pendiente(s)" de la
// tarjeta del launcher, aunque en la propia pantalla de Evaluación de
// Candidatos sí apareciera como "Pendiente" (esa vista nunca dependió de
// la fecha, ver evalStatus() en plantilla_evaluacion_candidatos.html —
// el contador del launcher era el único sitio con este requisito extra,
// bug real reportado por el usuario). Ahora sí cuenta: solo la fecha
// (cuando existe) decide el COLOR de urgencia, nunca si cuenta o no.
function computeCandidatePendingInterviews(projectId, ctx) {
  const row = filaDeProyecto(projectId, ctx);
  if (!row) return null;
  const result = readCandidateEvalPayloadForProject(row, ctx);
  if (!result.ok || !result.payload) return null;
  const state = result.payload;
  const puestos = Array.isArray(state.puestos) ? state.puestos : [];
  const evaluaciones = Array.isArray(state.evaluaciones) ? state.evaluaciones : [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const RANK = { 'amarillo-claro': 1, amarillo: 2, naranja: 3, rojo: 4 };
  let worst = null;
  function bump(level) {
    if (!worst || RANK[level] > RANK[worst]) worst = level;
  }
  let count = 0;
  evaluaciones.forEach((ev) => {
    const puesto = puestos.find((p) => p.id === ev.puestoId);
    const tasks = puesto && Array.isArray(puesto.tasks) ? puesto.tasks : [];
    const isComplete =
      tasks.length > 0 && tasks.every((t) => ev.notas && ev.notas[t.id] && ev.notas[t.id].nota != null);
    if (isComplete) return; // ya evaluada del todo: no aporta como pendiente
    count += 1;
    if (!ev.fecha) return; // sin fecha todavía: cuenta como pendiente, pero sin fecha no hay urgencia que calcular
    const diffDays = Math.round((new Date(ev.fecha + 'T00:00:00') - today) / 86400000);
    if (diffDays < 0) bump('rojo');
    else if (diffDays <= 1) bump('naranja');
    else if (diffDays <= 3) bump('amarillo');
    else if (diffDays <= 7) bump('amarillo-claro');
    else bump('naranja'); // v2.0.51: fecha a más de 7 días -- ver nota debajo, mismo caso que "sin fecha"
  });
  if (count === 0) return null;
  // v2.0.51: bug real reportado -- "cuando pone entrevista pendiente en la
  // tarjeta que lo ponga en naranja". Pasaba que CUALQUIER pendiente sin
  // `ev.fecha` (o con fecha a más de 7 días vista, el umbral más laxo de
  // arriba) nunca llamaba a bump() -- `worst` se quedaba en null, y sin
  // nivel el lanzador no aplica NINGUNA clase de color (ver
  // INTERVIEW_TEXT_CLASS/.txt-* en launcher/renderer.js e index.html), así
  // que el texto salía sin remarcar en vez de avisar. "Hay una entrevista
  // pendiente" ya es en sí mismo digno de aviso aunque no se sepa (o falte)
  // la fecha exacta -- naranja como suelo mínimo, nunca "sin color".
  return { count, level: worst || 'naranja' };
}

// v2.0.49: "N entrevistas pendientes" (arriba) solo cuenta evaluaciones que
// YA EXISTEN y están a medias -- un puesto abierto SIN NINGUNA evaluación
// todavía (nadie en proceso, ni una entrevista concertada) da 0 pendientes
// igual que un puesto ya cubierto, y la tarjeta del launcher no distinguía
// los dos casos: "sin avisos" se leía como "equipo completo" cuando en
// realidad podía haber una vacante completamente parada. Pedido explícito
// del usuario: verificar de verdad si el equipo está completo, no solo si
// hay entrevistas en curso.
//
// Replica aquí el mismo cálculo de "APTO" que ya usa evalStatus() en
// plantilla_evaluacion_candidatos.html (media ponderada de notas por tarea
// contra el umbral guardado) -- un puesto se considera CUBIERTO si tiene
// al menos una evaluación completa con veredicto APTO. Sin puestos
// definidos en absoluto (proyecto que no usa esta herramienta) no cuenta
// como "vacante" por SÍ SOLO -- ver segunda señal más abajo.
//
// v2.0.50: bug real reportado con MEFPD como ejemplo -- ese proyecto no usa
// "puestos" en Evaluación de Candidatos en absoluto (la señal de arriba daba
// 0 siempre), pero SÍ tenía 3 plazas marcadas "en búsqueda de candidato" en
// el equipo del propio dashboard (`state.team[].pendingCandidate`, el mismo
// dato que ya muestra el panel "ESTADO EJECUTIVO" del dashboard como
// "N perfil(es) del equipo en búsqueda de candidato") y el servicio llevaba
// ya 447 días en marcha -- el lanzador decía "Equipo completo" mirando SOLO
// la primera señal, ignorando una vacante real y activa que el propio
// dashboard del mismo proyecto ya sabía que existía. Segunda señal añadida:
// cuenta las plazas `pendingCandidate` del equipo, pero SOLO si el servicio
// ya ha empezado por fecha (`state.serviceStart`) -- antes de esa fecha,
// tener plazas todavía sin cubrir es lo esperable (el equipo se está
// formando de cara al arranque), no una vacante parada que avisar.
function computeCandidateTeamCoverage(projectId, ctx) {
  const row = filaDeProyecto(projectId, ctx);
  if (!row) return null;

  let uncoveredFromEval = 0;
  const evalResult = readCandidateEvalPayloadForProject(row, ctx);
  if (evalResult.ok && evalResult.payload) {
    const state = evalResult.payload;
    const puestos = Array.isArray(state.puestos) ? state.puestos : [];
    const evaluaciones = Array.isArray(state.evaluaciones) ? state.evaluaciones : [];
    const threshold = Number(state.threshold) || 3.5;
    uncoveredFromEval = puestos.filter((puesto) => {
      const tasks = Array.isArray(puesto.tasks) ? puesto.tasks : [];
      const sumW = tasks.reduce((s, t) => s + (Number(t.weight) || 0), 0);
      if (sumW === 0) return true; // puesto sin pesos asignados: no se puede evaluar, se trata como sin cubrir
      const isApto = (ev) => {
        if (ev.puestoId !== puesto.id) return false;
        let sumWN = 0, rated = 0;
        tasks.forEach((t) => {
          const w = Number(t.weight) || 0;
          const n = ev.notas && ev.notas[t.id] && ev.notas[t.id].nota;
          if (n) { sumWN += w * n; rated++; }
        });
        if (rated < tasks.length) return false; // evaluación a medias: no cuenta como apto todavía
        return sumWN / sumW >= threshold;
      };
      return !evaluaciones.some(isApto);
    }).length;
  }

  let uncoveredFromTeam = 0;
  const dashResult = getProjectStateForMeetingPrep(projectId, ctx);
  if (dashResult.ok && dashResult.state) {
    const dashState = dashResult.state;
    const started = !!dashState.serviceStart && new Date(dashState.serviceStart + 'T00:00:00') <= new Date();
    if (started) {
      const team = Array.isArray(dashState.team) ? dashState.team : [];
      uncoveredFromTeam = team.filter((t) => t.pendingCandidate).length;
    }
  }

  const uncoveredCount = uncoveredFromEval + uncoveredFromTeam;
  if (uncoveredCount === 0) return null;
  return { uncoveredCount };
}

ipcMain.handle('candidateEval:get', (evt, { projectId } = {}) => {
  const row = dbmod.get('SELECT * FROM projects WHERE id=?', [projectId]);
  if (!row) return { ok: false, error: 'Proyecto no encontrado.' };
  return readCandidateEvalPayloadForProject(row);
});

// v0.1.77: atajo desde la tarjeta del launcher ("N entrevista(s)
// pendiente(s)", ver computeCandidatePendingInterviews) — abre directamente
// la ventana de Evaluación de Candidatos de ese proyecto en la pestaña
// "Evaluaciones", sin pasar por el menú "Proyecto" ni por abrir antes el
// dashboard del proyecto (openCandidateEvalWindow no depende de que la
// ventana del proyecto esté abierta, solo necesita la fila de `projects`).
ipcMain.handle('candidateEval:openWindow', (evt, { projectId } = {}) => {
  const row = dbmod.get('SELECT * FROM projects WHERE id=?', [projectId]);
  if (!row) return { ok: false, error: 'Proyecto no encontrado.' };
  openCandidateEvalWindow(row, { focusEvaluaciones: true });
  return { ok: true };
});

ipcMain.handle('candidateEval:save', (evt, { projectId, payload } = {}) => {
  if (procesoComprometido) return accionNoAplicada('La aplicación está cerrándose por un fallo interno; no se ha guardado nada.', false); // B2
  // A3.3/BLOQUE 5 + A2: UNA sola barrera por proyecto — borrado o restauración.
  { const b = proyectoBloqueadoParaMutar(projectId); if (b) return accionNoAplicada(b.mensaje, b.motivo === 'proyecto-en-restauracion'); }
  if (rekeyInProgress) return accionNoAplicada(REKEY_BUSY_MESSAGE, true); // A1, ver backup:save
  const row = dbmod.get('SELECT * FROM projects WHERE id=?', [projectId]);
  if (!row) return accionNoAplicada('Proyecto no encontrado.', false);
  const file = candidateEvalFileForProject(row);
  const now = new Date().toISOString();
  // Un único `estado.json` por proyecto: el PRIMER guardado es una creación y
  // los siguientes son reemplazos. El modo real lo deriva el helper mirando el
  // disco — el caller no tiene que acertar.
  const r = ejecutarAccionDeArchivo({
    tipo: 'candidate-eval', destino: file, contenidoPlano: payload, modo: 'overwrite',
    sentencias: ({ cifrado }) => ([{
      sql: 'INSERT INTO candidate_evals(project_id, updated_at, encrypted) VALUES (?,?,?) ' +
        'ON CONFLICT(project_id) DO UPDATE SET updated_at=excluded.updated_at, encrypted=excluded.encrypted',
      params: [projectId, now, cifrado ? 1 : 0],
    }]),
  });
  if (!r.ok) return r;
  // v2.0.25: el badge "N entrevista(s) pendiente(s)" de la tarjeta del
  // launcher (ver computeCandidatePendingInterviews) se queda ANTIGUO
  // mientras la app sigue abierta -- projects:list SÍ recalcula en fresco
  // cada vez que se llama (no hay caché), pero nada disparaba esa llamada
  // de nuevo al completar una evaluación aquí, a diferencia de backup:save
  // (autoguardado del dashboard) o de borrar un proyecto, que sí avisan al
  // launcher con 'projects:changed'. Reportado por el usuario: tenía que
  // cerrar la app entera para que la tarjeta dejara de mostrar entrevistas
  // ya realizadas -- reproducido en real (Xvfb): tras guardar aquí, la
  // propia IPC projects:list ya devolvía pendingInterviewsCount:0, pero el
  // <span> de la tarjeta seguía en pantalla con el conteo viejo hasta
  // cerrar/reabrir. Mismo aviso que ya usan los otros puntos de guardado.
  if (launcherWin && !launcherWin.isDestroyed()) {
    launcherWin.webContents.send('projects:changed');
  }
  return Object.assign({}, r, { updatedAt: now });
});

// v0.1.75: adjuntar/ver/quitar el CV de una evaluación concreta. El archivo
// en sí vive en disco (carpeta cv/, ver candidateEvalCvDirForProject) — el
// JSON de estado.json solo guarda su nombre original (para mostrarlo) y el
// nombre con el que se guardó en esa carpeta (para poder abrirlo). Tamaño
// máximo razonable para un CV, no configurable de momento.
const CANDIDATE_CV_MAX_BYTES = 15 * 1024 * 1024; // 15 MB

ipcMain.handle('candidateEval:pickCv', (evt, { projectId, evalId } = {}) => {
  // A3.3/BLOQUE 5 + A2: UNA sola barrera por proyecto — borrado o restauración.
  { const b = proyectoBloqueadoParaMutar(projectId); if (b) return { ok: false, error: b.mensaje }; }
  const row = dbmod.get('SELECT * FROM projects WHERE id=?', [projectId]);
  if (!row) return { ok: false, error: 'Proyecto no encontrado.' };
  if (!evalId) return { ok: false, error: 'Evaluación no válida.' };
  const parentWin = BrowserWindow.fromWebContents(evt.sender);
  const picked = dialog.showOpenDialogSync(parentWin || undefined, {
    title: 'Seleccionar CV del candidato',
    filters: [
      { name: 'Documentos (PDF, Word, etc.)', extensions: ['pdf', 'doc', 'docx', 'odt', 'rtf'] },
      { name: 'Todos los archivos', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (!picked || !picked[0]) return { ok: false, canceled: true };
  const srcPath = picked[0];

  let stat;
  try {
    stat = fs.statSync(srcPath);
  } catch (e) {
    return { ok: false, error: 'No se pudo leer el archivo elegido: ' + ((e && e.message) || String(e)) };
  }
  if (stat.size > CANDIDATE_CV_MAX_BYTES) {
    return { ok: false, error: `El archivo pesa más de ${CANDIDATE_CV_MAX_BYTES / (1024 * 1024)} MB — elige un CV más ligero.` };
  }

  const cvDir = candidateEvalCvDirForProject(row);

  // A3.3/BLOQUE 5 — D4b. ANTES esto borraba el CV anterior y DESPUÉS copiaba el
  // nuevo. Si el guardado del estado fallaba a continuación, el viejo ya no
  // existía y el estado seguía apuntando a él: pérdida real.
  //
  // Ahora el nuevo se copia PRIMERO, con nombre único, y el viejo NO se toca.
  // Quien decide retirarlo es el renderer, y solo cuando el contrato dice
  // `aplicado:true / verificado:true` (ver §4.9).
  const ext = path.extname(srcPath);
  const originalName = path.basename(srcPath);
  // Nonce de 8 bytes además del reloj: dos elecciones dentro del mismo
  // milisegundo generaban el MISMO nombre y la segunda pisaba a la primera.
  const storedName = `${evalId}__${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`;
  try {
    fs.copyFileSync(srcPath, path.join(cvDir, storedName));
  } catch (e) {
    return { ok: false, error: 'No se pudo copiar el archivo: ' + ((e && e.message) || String(e)) };
  }
  return { ok: true, fileName: originalName, storedName };
});

ipcMain.handle('candidateEval:openCv', (evt, { projectId, storedName } = {}) => {
  const row = dbmod.get('SELECT * FROM projects WHERE id=?', [projectId]);
  if (!row) return { ok: false, error: 'Proyecto no encontrado.' };
  if (!isSafeCvStoredName(storedName)) return { ok: false, error: 'Nombre de archivo no válido.' };
  const cvDir = candidateEvalCvDirForProject(row);
  const fullPath = path.join(cvDir, storedName);
  if (!fs.existsSync(fullPath)) {
    return { ok: false, error: 'El archivo del CV ya no está en disco (¿se movió o se borró la carpeta de backups?).' };
  }
  return shell.openPath(fullPath).then((err) => {
    if (err) return { ok: false, error: 'No se pudo abrir el archivo: ' + err };
    return { ok: true };
  });
});

ipcMain.handle('candidateEval:removeCv', (evt, { projectId, storedName } = {}) => {
  // A3.3/BLOQUE 5 + A2: UNA sola barrera por proyecto — borrado o restauración.
  { const b = proyectoBloqueadoParaMutar(projectId); if (b) return { ok: false, error: b.mensaje }; }
  const row = dbmod.get('SELECT * FROM projects WHERE id=?', [projectId]);
  if (!row) return { ok: false, error: 'Proyecto no encontrado.' };
  if (!isSafeCvStoredName(storedName)) return { ok: false, error: 'Nombre de archivo no válido.' };
  const cvDir = candidateEvalCvDirForProject(row);
  try {
    fs.unlinkSync(path.join(cvDir, storedName));
  } catch (e) {
    // v2.0.40: si ya no estaba (borrado a mano, etc.) no es un error para el
    // usuario -- pero antes se tragaba también cualquier OTRO fallo (permisos,
    // disco, etc.) sin dejar rastro. Mismo criterio que meeting:deletePrep
    // (arriba): se registra con console.warn, se sigue igual.
    // B3: el archivo queda huérfano en disco. No rompe nada ahora, pero es la
    // familia de C1 (basura acumulada) y hasta hoy no dejaba ni una línea.
    appLog(`Proyecto ${projectId} — no se pudo borrar el archivo del CV; queda huérfano en disco: ` + motivoSinRutas(e));
    console.warn('No se pudo borrar el archivo del CV (se continúa igualmente):', e);
  }
  return { ok: true };
});

ipcMain.handle('projects:create', async (evt, { name, client, startDate, importJson } = {}) => {
  if (procesoComprometido) throw new Error('La aplicación está cerrándose por un fallo interno; no se ha creado nada.'); // B2
  const parentWin = BrowserWindow.fromWebContents(evt.sender);

  // Si se importa un .json, MANDA sobre nombre y fecha de inicio — el modal
  // ya deja los campos deshabilitados en ese caso (ver launcher/renderer.js):
  // el nombre y la fecha se leen del propio archivo, no de lo que hubiera
  // tecleado antes el usuario (aunque siguiera tecleado, aquí se ignora).
  let finalName = (name || '').trim();
  let effectiveStart = (startDate || '').trim() || null;
  let imported = null;

  if (importJson) {
    // Se descifra/valida ANTES de tocar la base de datos: si el usuario
    // cancela un password o el archivo no es válido, no se llega a crear
    // ningún proyecto a medias.
    imported = await parseAndDecryptImportedProjectJson(importJson, parentWin);
    const importedTitle = (imported.state.projectTitle || '').trim();
    if (!importedTitle || importedTitle === 'Nombre del Servicio') {
      throw new Error('El archivo importado no indica un nombre de proyecto válido.');
    }
    finalName = importedTitle;
    effectiveStart = imported.state.serviceStart || effectiveStart;
  }

  if (!finalName) {
    throw new Error('Falta el nombre del proyecto.');
  }

  const now = new Date().toISOString();
  const partition = `persist:proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const id = dbmod.run(
    'INSERT INTO projects(name, client, partition_name, created_at, updated_at) VALUES (?,?,?,?,?)',
    [finalName, client || '', partition, now, now]
  );
  // Se fija ya aquí (ver comentario junto a backupsDirForProject): así la
  // carpeta de backups de este proyecto queda ligada a este nombre inicial
  // para siempre, aunque el proyecto se renombre más adelante.
  dbmod.run('UPDATE projects SET backup_dir=? WHERE id=?', [`${id}-${slugify(finalName)}`, id]);
  const row = dbmod.get('SELECT * FROM projects WHERE id=?', [id]);

  if (imported) {
    imported.state.projectTitle = finalName;
    imported.state.serviceStart = effectiveStart;
    const { storageKey, historyKey } = computeProjectKeys(id);
    try {
      await seedNewProjectStorage(row, storageKey, historyKey, imported.state, imported.history);
    } catch (e) {
      // El proyecto ya se insertó en la BD para tener su partición reservada;
      // si sembrar sus datos falla no se deja un proyecto fantasma a medias.
      dbmod.run('DELETE FROM projects WHERE id=?', [id]);
      throw e;
    }
  }

  // Hornea ya la copia HTML de este proyecto con el nombre (y, si se indicó,
  // la fecha de inicio) que se acaba de pedir en "Nuevo proyecto". Si no se
  // hace aquí, la primera vez que se abre la ventana carga la plantilla en
  // blanco de fábrica (factory-seed con projectTitle="Nombre del Servicio"),
  // y el propio dashboard dispara SU asistente obligatorio ("Configura este
  // dashboard") volviendo a pedir el mismo nombre que el usuario ya escribió
  // segundos antes — dos pasos para dar un solo dato. Al hornear ya aquí, el
  // dashboard ve un projectTitle distinto del de fábrica y arranca directo,
  // sin el asistente (y, si se importó un backup, con sus datos ya cargados
  // — mismas claves de localStorage, ver computeProjectKeys arriba).
  regenerateProjectDashboardFile(id, finalName, effectiveStart);
  return dbmod.get('SELECT * FROM projects WHERE id=?', [id]);
});

ipcMain.handle('projects:open', (evt, id) => {
  const row = dbmod.get('SELECT * FROM projects WHERE id=?', [id]);
  if (!row) throw new Error('Proyecto no encontrado');
  openProjectWindow(row);
  return true;
});

ipcMain.handle('projects:openBackupsFolder', (evt, id) => {
  const row = dbmod.get('SELECT * FROM projects WHERE id=?', [id]);
  if (!row) throw new Error('Proyecto no encontrado');
  const dir = backupsDirForProject(row);
  openPathLogged(dir);
  return dir;
});

ipcMain.handle('db:info', () => ({ path: dbmod.getDbPath() }));

// ---------- IPC: dashboard window backup bridge ----------
// El contenido del backup vive SOLO en el archivo .json en disco (cifrado
// si la seguridad está activada) — la fila en `backups` guarda solo
// metadatos ligeros y el nombre de ese archivo (`file_path`). Ver el
// comentario junto a migrateSchema() en db.js sobre por qué: así la base de
// datos nunca crece con el contenido real de los backups, sin importar
// cuántos proyectos o cuánto tiempo lleve usándose la app.
//
// Bloque 4: devuelve el MISMO contrato de tres formas que las otras tres
// acciones, en vez del booleano histórico. El cambio obliga a tocar a la vez
// preload.js y las dos plantillas que lo consumen: con un objeto, el viejo
// `if (!wroteOk)` sería SIEMPRE falso y cualquier fallo pasaría por éxito —
// exactamente el bug de `lastSerialized` de la v0.1.62, otra vez.
// A3.3/BLOQUE 5: `async` porque la purga (D3) ahora es una operación completa
// con su commit y su partición. El contrato devuelto no cambia.
ipcMain.handle('backup:save', async (evt, { projectId, payload, reason }) => {
  const noAplicado = accionNoAplicada;
  // B2: fallo fatal en curso — el proceso ya no es de fiar, no se inician
  // escrituras nuevas. Va la primera de las tres guardas por severidad.
  if (procesoComprometido) return noAplicado('La aplicación está cerrándose por un fallo interno; no se ha guardado nada.', false);
  // A3.3/BLOQUE 5 + A2: UNA sola barrera por proyecto — borrado o restauración.
  { const b = proyectoBloqueadoParaMutar(projectId); if (b) return noAplicado(b.mensaje, b.motivo === 'proyecto-en-restauracion'); }
  // A1: mientras se re-cifra todo (activar/cambiar/desactivar la Seguridad)
  // no se acepta ningún guardado nuevo — un archivo escrito aquí llevaría la
  // clave VIEJA, no estaría en el inventario de esa migración, y quedaría
  // ilegible en cuanto se consolidara la sal nueva. Devolver `false` es
  // justo lo que maybeBackup() ya sabe tratar desde v0.1.62: lo registra como
  // "write-failed", NO da por guardado el estado (no toca lastSerialized) y
  // reintenta solo en el siguiente ciclo de 15 s.
  if (rekeyInProgress) return noAplicado(REKEY_BUSY_MESSAGE, true);
  // A2: mismo criterio, por proyecto — mientras se restaura un backup encima
  // de este proyecto, su estado actual es justo lo que se ha pedido descartar.
  // Guardarlo aquí lo convertiría en el backup MÁS RECIENTE (y restaurar dos
  // veces seguidas devolvería lo que querías tirar). Cubre de una vez los tres
  // caminos que llegan aquí: el guardado final del cierre, el 'beforeunload'
  // del propio dashboard y el intervalo de 15 s.
  // (la barrera de arriba ya cubre la restauración; esta línea se conserva
  //  solo como red por si alguien añade un camino nuevo por encima)
  if (proyectoEnRestauracion(projectId)) return noAplicado('Se está restaurando un backup de este proyecto ahora mismo.', true);
  const row = dbmod.get('SELECT * FROM projects WHERE id=?', [projectId]);
  if (!row) return noAplicado('Proyecto no encontrado.', false);
  const now = new Date().toISOString();
  const stamp = now.replace(/[:.]/g, '-');
  const fileName = `backup_${stamp}_${crypto.randomBytes(4).toString('hex')}.json`;

  // v0.1.42: mientras dure un corte detectado a media sesión (ver
  // startUserDataWatchdog), cada guardado normal deja además una copia extra
  // en la carpeta local de emergencia — ANTES de tocar la carpeta principal
  // (que es justo la que se sabe que está fallando ahora mismo): así, si el
  // corte se alarga y se acaba cerrando la app sin que vuelva la conexión,
  // no hace falta encontrar los datos a mano comparando carpetas (como en el
  // caso real que motivó esto) — ya está guardada, identificada y lista para
  // importar. Importante: esto va ANTES de backupsDirForProject() y en su
  // propio try/catch, porque backupsDirForProject() (más abajo) puede lanzar
  // una excepción sin capturar si la carpeta principal ni siquiera se puede
  // crear — si eso pasara antes de intentar la copia de emergencia, esta
  // nunca llegaría a escribirse (bug real, encontrado probando esto mismo).
  // No afecta al flujo normal si driveOutageActive está a false (caso de
  // siempre, sin coste añadido).
  // Bloque 4: es una COPIA DE RESCATE independiente, no parte de la
  // mini-transacción. Ni su éxito convierte en éxito un fallo del guardado
  // principal, ni su fallo falsea el estado de este. Por eso se escribe con el
  // contenido cifrado igual que el principal, pero fuera del helper.
  if (driveOutageActive) {
    try {
      const safetyDir = localSafetyBackupsDirForProject(row);
      fs.writeFileSync(path.join(safetyDir, fileName), encryptIfNeeded(payload, !!securityKey), 'utf8');
      purgeOldLocalSafetyBackups(safetyDir);
      appLog(`Backup — copia de rescate local escrita (${fileName}).`);
    } catch (e) {
      appLog('Backup — la copia de rescate local NO se pudo escribir: ' + String((e && e.message) || e));
      console.warn('No se pudo escribir la copia de seguridad local de emergencia:', e);
    }
  }

  let dir;
  try {
    dir = backupsDirForProject(row);
  } catch (e) {
    return noAplicado('No se pudo preparar la carpeta de backups: ' + String((e && e.message) || e), true);
  }

  // El título del proyecto puede venir dentro del propio volcado. Se calcula
  // ANTES para que su `UPDATE` entre en la MISMA mutación que el INSERT.
  let tituloNuevo = null;
  let projectState = null;
  try {
    const dump = JSON.parse(payload);
    const fullKey = Object.keys(dump).find((k) => k.includes('panorama-servicio-full__'));
    if (fullKey) {
      projectState = JSON.parse(dump[fullKey]);
      if (projectState && projectState.projectTitle && projectState.projectTitle !== 'Nombre del Servicio'
        && projectState.projectTitle !== row.name) {
        tituloNuevo = projectState.projectTitle;
      }
    }
  } catch (e) {
    // B3: corre en cada `backup:save` -> una línea por sesión y proyecto.
    appLogUnaVezPorSesion('titulo-volcado-' + projectId,
      `Proyecto ${projectId} — no se pudo leer su título desde el volcado del backup: ` + motivoSinRutas(e));
    console.warn('No se pudo leer el título del proyecto desde el volcado:', e);
  }

  // ---- LA ACCIÓN: archivo + INSERT + updated_at + (nombre) + marca -------
  const r = ejecutarAccionDeArchivo({
    tipo: 'backup', destino: path.join(dir, fileName), contenidoPlano: payload, modo: 'nuevo',
    sentencias: ({ cifrado }) => {
      const s = [{
        sql: 'INSERT INTO backups(project_id, created_at, reason, payload, size, file_path, encrypted) VALUES (?,?,?,?,?,?,?)',
        params: [projectId, now, reason || 'auto', '', Buffer.byteLength(payload, 'utf8'), fileName, cifrado ? 1 : 0],
      }, {
        sql: 'UPDATE projects SET updated_at=? WHERE id=?', params: [now, projectId],
      }];
      if (tituloNuevo) s.push({ sql: 'UPDATE projects SET name=? WHERE id=?', params: [tituloNuevo, projectId] });
      return s;
    },
  });
  if (!r.ok) {
    appLog(`Backup — NO guardado (${r.reintentable ? 'reintentable' : 'no reintentable'}): ${r.error}`);
    return r;
  }
  appLog(`Backup guardado OK (acción ${r.actionId}${r.verificado === false ? ', SIN VERIFICAR' : ''}).`);

  // Si este volcado ya trae un proyecto configurado (título distinto del de
  // fábrica), hornea/actualiza la copia HTML propia de este proyecto para que
  // la próxima vez que se abra no vuelva a pedir el asistente.
  if (projectState && projectState.projectTitle && projectState.projectTitle !== 'Nombre del Servicio') {
    try {
      regenerateProjectDashboardFile(projectId, projectState.projectTitle, projectState.serviceStart);
    } catch (e) {
      // B3: este corre en CADA `backup:save` — cada ~15 s por proyecto abierto.
      // Una línea por sesión, o llenaría app.log con la misma.
      appLogUnaVezPorSesion('html-proyecto-' + projectId,
        `Proyecto ${projectId} — no se pudo actualizar su copia HTML tras guardar: ${motivoSinRutas(e)}`);
      console.warn('No se pudo actualizar la copia HTML del proyecto:', e);
    }
  }

  // ---- MANTENIMIENTO: la purga va APARTE ---------------------------------
  // Sigue siendo mantenimiento INDEPENDIENTE: pase lo que pase aquí, el backup
  // que acabamos de confirmar NUNCA se convierte en "fallido". Su resultado se
  // adjunta aparte (`purga`) y se registra por separado.
  //
  // A3.3/BLOQUE 5 — D3. Antes eran N commits sueltos (un `DELETE FROM backups`
  // por fila) con los archivos borrados en medio. Ahora: se captura el conjunto,
  // se retiran TODOS sus archivos a cuarentena, un ÚNICO commit para todos los
  // DELETE + la marca, y solo entonces se purga.
  r.purga = await purgarBackupsAntiguos(projectId, dir);

  // ---- El resto ya no puede alterar el veredicto del backup ---------------

  // v0.1.27: cada vez que se guarda un backup (automático cada ~15s si hay
  // cambios, o al cerrar, o "Guardar backup ahora") es una oportunidad de
  // que el semáforo de urgencia de ESTE proyecto haya cambiado (se acaba
  // de tocar un hito o un riesgo). Avisamos al launcher, si está abierto,
  // para que se refresque solo — antes había que cerrar y reabrir la
  // pantalla de proyectos para ver el color actualizado tras editar algo
  // en el dashboard. `refresh()` en el launcher ya sabe reaccionar a este
  // mismo evento (lo usa también cuando se borra un proyecto).
  if (launcherWin && !launcherWin.isDestroyed()) {
    launcherWin.webContents.send('projects:changed');
  }

  return r;
});

ipcMain.handle('backup:list', (evt, projectId) => {
  // v0.1.50: se añade `encrypted` al SELECT (antes no se pedía) para que la
  // nueva ventana "Restaurar un backup concreto..." pueda avisar con un
  // candado qué backups están cifrados — cambio aditivo, no afecta a quien
  // ya llamaba a este mismo IPC ignorando ese campo.
  return dbmod.all(
    'SELECT id, created_at, reason, size, encrypted FROM backups WHERE project_id=? ORDER BY created_at DESC',
    [projectId]
  );
});

// v0.1.40: el dashboard lo usa para distinguir "proyecto genuinamente nuevo,
// vacío de verdad" de "aquí debería haber datos y no se han podido cargar"
// (ver resolveProjectIdentity() en plantilla_dashboard.html) — si este
// proyecto tiene backups guardados en la base de datos (project_id es
// estable, no depende de título/fecha) pero al arrancar no se encuentra
// nada bajo su clave de almacenamiento ni por ningún camino de migración,
// es una señal fuerte de que algo va mal y hay que avisar de forma
// visible, en vez de mostrar un panel vacío en silencio como si fuera un
// proyecto nuevo (esto es justo lo que pasó con el bug de la 0.1.37).
ipcMain.handle('backup:hasAny', (evt, projectId) => {
  const row = dbmod.get('SELECT COUNT(*) as c FROM backups WHERE project_id=?', [projectId]);
  return !!(row && row.c > 0);
});

// v0.1.41: el aviso de "datos no encontrados" (PS-2001) se dispara y se
// pinta dentro del propio dashboard (proceso renderer) — no pasa por
// ningún diálogo nativo del proceso principal, así que no queda cubierto
// por errorCodeSuffix()/appLog() como el resto de códigos. Este IPC deja
// que el dashboard registre el evento en app.log igualmente, con qué
// proyecto lo disparó, para que quede el mismo rastro que cualquier otro
// código de error.
ipcMain.handle('diag:logDataWarning', (evt, projectId) => {
  appLog(`ERROR PS-2001 — Datos del proyecto no encontrados al abrirlo (project_id=${projectId})`);
});

// v0.1.62: diagnóstico del mecanismo de backups — ver el comentario junto a
// logBackupDiag en preload.js. Nunca recibe contenido real del proyecto,
// solo metadatos ligeros (recuentos, motivo, si se guardó o se saltó) —
// pensado para poder comparar, entre dos intentos consecutivos, si el
// recuento de hitos/riesgos que maybeBackup() vio de verdad cambió cuando
// debería haber cambiado.
ipcMain.handle('diag:logBackupAttempt', (evt, info) => {
  const { projectId, reason, force, outcome, why, count1, count1Label, count2, count2Label, serializedLength } = info || {};
  const c1 = count1Label ? `${count1Label}=${count1 != null ? count1 : '?'}` : null;
  const c2 = count2Label ? `${count2Label}=${count2 != null ? count2 : '?'}` : null;
  appLog(
    `Backup (project_id=${projectId}) — motivo=${reason || '?'} force=${!!force} resultado=${outcome || '?'}` +
      (why ? ` (${why})` : '') +
      ` -- ${[c1, c2].filter(Boolean).join(' ')} tamano=${serializedLength != null ? serializedLength : '?'}`
  );
});

ipcMain.handle('backup:restore', (evt, { projectId, backupId }) => {
  return restoreProjectBackup(projectId, backupId);
});

ipcMain.handle('projects:delete', async (evt, id) => {
  if (procesoComprometido) throw new Error('La aplicación está cerrándose por un fallo interno; no se ha borrado nada.'); // B2
  return deleteProjectById(id);
});

// ---------- IPC: ventanita de contraseña suelta (ver promptForPassword) ----------
ipcMain.handle('password-prompt:submit', (evt, password) => {
  const resolveFn = pendingPasswordPromptResolve;
  pendingPasswordPromptResolve = null;
  if (passwordPromptWin && !passwordPromptWin.isDestroyed()) passwordPromptWin.close();
  if (resolveFn) resolveFn(password || null);
});
ipcMain.handle('password-prompt:cancel', () => {
  const resolveFn = pendingPasswordPromptResolve;
  pendingPasswordPromptResolve = null;
  if (passwordPromptWin && !passwordPromptWin.isDestroyed()) passwordPromptWin.close();
  if (resolveFn) resolveFn(null);
});

// ---------- IPC: ventana de Seguridad ----------
// Toda la lógica real de login/activar/cambiar/desactivar vive aquí. La
// ventana modal (security-window/) solo recoge los datos tecleados y los
// manda; si esta función devuelve {error: '...'} la ventana se queda
// abierta mostrando ese mensaje, y si no devuelve error la ventana se cierra
// desde aquí mismo (ver finishSecurityWindow).
ipcMain.handle('security-win:submit', async (evt, data) => {
  const { mode, current, password, confirm, remember } = data || {};
  try {
    if (mode === 'login') {
      const salt = getMeta('security_salt');
      const verifier = getMeta('security_verifier');
      const key = securitymod.deriveKey(password, salt);
      if (securitymod.verifierFor(key) !== verifier) {
        return { error: 'Contraseña incorrecta.' };
      }
      // Bloque 3 — el verificador dice que la contraseña es la de ESTA base de
      // datos; esto comprueba además que de verdad abre los archivos, con un
      // descifrado AES-GCM real (autenticado: una clave equivocada falla, no
      // devuelve basura).
      if (!claveDescifraDeVerdad(key)) {
        return {
          error: 'La contraseña coincide con la de esta base de datos, pero no consigue abrir tus archivos ' +
            'cifrados. Puede que la base de datos y los archivos vengan de equipos distintos. No se ha ' +
            'modificado nada: cierra la app y revisa el registro antes de seguir.',
        };
      }
      securityKey = key;
      seguridadRequiereRevalidacion = false;
      if (remember) rememberPassword(password);
      else forgetRememberedPassword();
      finishSecurityWindow();
      return {};
    }

    // A1: los 3 modos que tocan archivos delegan en rekeyAllUserFiles(), que
    // migra las 3 familias (backups, meeting_preps y candidate_evals) de forma
    // todo-o-nada y consolida sal/verificador/`security_enabled` y securityKey
    // por dentro, SOLO si todo fue bien. Si devuelve ok:false no se ha tocado
    // nada: se devuelve el error y la ventana se queda abierta mostrándolo,
    // exactamente igual que con una contraseña incorrecta.
    // Bloque 3 — si la mutación única de Seguridad SÍ confirmó pero no se pudo
    // verificar, db.js queda en `desincronizada`: esta sesión ya no puede
    // escribir nada más. NO se deshace nada (los archivos y la base de datos
    // están los dos en el estado nuevo) y la aplicación se cierra.
    const cerrarPorAplicadoSinVerificar = (res) => {
      appLog('Seguridad — la sesión termina aquí: el cambio se aplicó pero no se pudo verificar.');
      try {
        dialog.showMessageBoxSync(undefined, {
          type: 'warning',
          title: 'El cambio se aplicó, pero hay que reiniciar',
          message: 'El cambio de Seguridad SÍ se ha guardado.',
          detail: res.aviso + errorCodeSuffix('PS-2004'),
          buttons: ['Cerrar'],
          noLink: true,
        });
      } catch (e) { /* si ni el diálogo se puede pintar, se cierra igual */ }
      cerrandoApp = true;
      app.quit();
      return { error: res.aviso, fatal: true };
    };

    if (mode === 'setup') {
      const salt = securitymod.newSaltHex();
      const key = securitymod.deriveKey(password, salt);
      const verifier = securitymod.verifierFor(key);
      // Todo lo que ya hubiera guardado en claro antes de activar la
      // seguridad se cifra ahora con la clave nueva. La contraseña recordada
      // entra en la MISMA mutación, no en un commit posterior.
      const res = rekeyAllUserFiles(null, key, {
        mode: 'setup', newSalt: salt, newVerifier: verifier,
        remembered: { guardar: !!remember, valor: remember ? blobDeContrasena(password) : null },
      });
      if (!res.ok) return { error: res.error };
      if (res.aplicado === true) return cerrarPorAplicadoSinVerificar(res);
      finishSecurityWindow();
      refreshAllMenus();
      return {};
    }

    if (mode === 'change') {
      const salt = getMeta('security_salt');
      const verifier = getMeta('security_verifier');
      const oldKey = securitymod.deriveKey(current, salt);
      if (securitymod.verifierFor(oldKey) !== verifier) {
        return { error: 'La contraseña actual no es correcta.' };
      }
      const newSalt = securitymod.newSaltHex();
      const newKey = securitymod.deriveKey(password, newSalt);
      const newVerifier = securitymod.verifierFor(newKey);
      const res = rekeyAllUserFiles(oldKey, newKey, {
        mode: 'change', newSalt, newVerifier,
        remembered: { guardar: !!remember, valor: remember ? blobDeContrasena(password) : null },
      });
      if (!res.ok) return { error: res.error };
      if (res.aplicado === true) return cerrarPorAplicadoSinVerificar(res);
      finishSecurityWindow();
      return {};
    }

    if (mode === 'disable') {
      const salt = getMeta('security_salt');
      const verifier = getMeta('security_verifier');
      const oldKey = securitymod.deriveKey(current, salt);
      if (securitymod.verifierFor(oldKey) !== verifier) {
        return { error: 'La contraseña actual no es correcta.' };
      }
      // Al desactivar, `security_remembered` se borra dentro de la misma
      // mutación (ver sentenciasDeSeguridad).
      const res = rekeyAllUserFiles(oldKey, null, {
        mode: 'disable', newSalt: null, newVerifier: null,
        remembered: { guardar: false, valor: null },
      });
      if (!res.ok) return { error: res.error };
      if (res.aplicado === true) return cerrarPorAplicadoSinVerificar(res);
      finishSecurityWindow();
      refreshAllMenus();
      return {};
    }

    return { error: 'Modo de seguridad no reconocido.' };
  } catch (e) {
    return { error: 'Error inesperado: ' + ((e && e.message) || e) };
  }
});

ipcMain.handle('security-win:cancel', () => {
  if (securityWin && !securityWin.isDestroyed()) securityWin.close();
});
