'use strict';
// ---------------------------------------------------------------------------
// Block 8A / P23 — IDENTIDAD Y AUTORREPARACIÓN DEL GUARDIÁN.
//
// Extrae por firma, de main.js real, todas las piezas del guardián de
// apagado relevantes (nunca se copian a mano): lectura/normalización de
// Run y tarea, la combinación en estados, repararPersistencia/lanzarActual/
// enable/disable, y syncDriveSyncGuardWithLocation() completa, con sus
// guardas de P9/P22.
//
// TODO en sandbox: `enabled.flag`/`heartbeat.txt` son archivos REALES pero
// dentro de una carpeta temporal; `reg.exe`/`schtasks.exe` están
// completamente sustituidos por un "Windows falso" en memoria — nunca se
// invoca el binario real. PANORAMA_MAIN permite apuntar a una copia
// revertida (ver revertir-8a.js).
// ---------------------------------------------------------------------------
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const MAIN = fs.readFileSync(process.env.PANORAMA_MAIN || path.join(PROJ, 'main.js'), 'utf8');

let pass = 0, fail = 0;
function ok(n, c, extra) {
  if (c) { pass++; console.log('  OK    ' + n); }
  else { fail++; console.log('  FALLO ' + n + (extra === undefined ? '' : '  -- ' + extra)); }
}
function seccion(t) { console.log('\n=== ' + t + ' ==='); }

function extraerDe(src, firma) {
  const i = src.indexOf(firma);
  if (i < 0) throw new Error('NO SE ENCONTRO: ' + firma);
  let j = src.indexOf('{', i + firma.length - 1), prof = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') prof++;
    else if (src[k] === '}') { prof--; if (prof === 0) return src.slice(i, k + 1); }
  }
  throw new Error('no delimitado: ' + firma);
}
const lineaConst = (nombre) => {
  const m = MAIN.match(new RegExp('^const ' + nombre + ' = [^\\n]*$', 'm'));
  if (!m) throw new Error('NO SE ENCONTRO const ' + nombre);
  return m[0];
};
const lineaLet = (nombre) => {
  const m = MAIN.match(new RegExp('^let ' + nombre + ' = [^\\n]*$', 'm'));
  if (!m) throw new Error('NO SE ENCONTRO let ' + nombre);
  return m[0];
};

const FUENTE = [
  lineaConst('DRIVE_SYNC_GUARD_HEARTBEAT_STALE_MS'),
  lineaConst('DRIVE_SYNC_GUARD_TASK_NAME'),
  // Block 8A/P23 (18 sept 2026, ajuste final): cadencia y timeout de la
  // inspección de Run/tarea — reales, no dobles, para que la batería
  // verifique los valores DE VERDAD elegidos en el producto.
  lineaConst('DRIVE_SYNC_GUARD_INSPECCION_TIMEOUT_MS'),
  lineaConst('DRIVE_SYNC_GUARD_PERSISTENCE_RECHECK_MS'),
  lineaLet('ultimaInspeccionPersistenciaMs'),
  lineaLet('configUbicacionNoResuelta'),
  lineaLet('sesionLocalTemporal'),
  extraerDe(MAIN, 'function driveSyncGuardDataDir()'),
  extraerDe(MAIN, 'function driveSyncGuardEnabledFlagPath()'),
  extraerDe(MAIN, 'function driveSyncGuardLogPath()'),
  extraerDe(MAIN, 'function driveSyncGuardHeartbeatPath()'),
  extraerDe(MAIN, 'function driveSyncGuardSpawnDiagPath()'),
  extraerDe(MAIN, 'function driveSyncGuardScriptPath()'),
  extraerDe(MAIN, 'function driveSyncGuardVbsLauncherPath()'),
  extraerDe(MAIN, 'function isDriveSyncGuardEnabled()'),
  extraerDe(MAIN, 'function escapeXmlText(value)'),
  extraerDe(MAIN, 'function isDriveSyncGuardActuallyAlive()'),
  extraerDe(MAIN, 'function normalizaRutaDriveSyncGuard(p)'),
  extraerDe(MAIN, 'function desescaparXmlDriveSyncGuard(s)'),
  extraerDe(MAIN, 'function leerRunDriveSyncGuard()'),
  extraerDe(MAIN, 'function leerTareaDriveSyncGuard()'),
  extraerDe(MAIN, 'function estadoPersistenciaDriveSyncGuard()'),
  extraerDe(MAIN, 'function repararPersistenciaDriveSyncGuard(reason, alTerminar)'),
  extraerDe(MAIN, 'function lanzarDriveSyncGuardActual(reason)'),
  extraerDe(MAIN, 'function enableDriveSyncGuardSilently(reason)'),
  extraerDe(MAIN, 'function disableDriveSyncGuardSilently(reason)'),
  extraerDe(MAIN, 'function syncDriveSyncGuardWithLocation()'),
].join('\n\n');

// --- "Windows falso": reg.exe/schtasks.exe nunca se invocan de verdad ------
// Fabrica el error que lanzaría execFileSync de verdad: con `status` (código
// de salida normal), con `signal` en vez de status (así es como Node reporta
// un timeout: sin `.status`, con `.signal` puesto — ver docs de child_process)
// o sin ninguno de los dos (error de spawn/inclasificable, p.ej. ENOENT si el
// propio binario no existiera).
function forzarError(spec) {
  const e = new Error(spec.message || 'error simulado');
  if (spec.status !== undefined) e.status = spec.status;
  if (spec.signal !== undefined) e.signal = spec.signal;
  return e;
}

function fakeWindows(inicial) {
  const estado = Object.assign({ run: null, tareaXml: null, forzarErrorRun: null, forzarErrorTarea: null }, inicial);
  const llamadas = [];

  const execFileSyncStub = (cmd, args, opts) => {
    llamadas.push({ sync: true, cmd, args: args.slice(), opts });
    if (cmd === 'reg.exe' && args[0] === 'query') {
      if (estado.forzarErrorRun) throw forzarError(estado.forzarErrorRun);
      if (estado.run === null) throw Object.assign(new Error('no encontrado'), { status: 1 });
      return `HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Run\r\n    PanoramaDriveSyncGuard    REG_SZ    ${estado.run}\r\n\r\n`;
    }
    if (cmd === 'schtasks.exe' && args[0] === '/query') {
      if (estado.forzarErrorTarea) throw forzarError(estado.forzarErrorTarea);
      if (estado.tareaXml === null) throw Object.assign(new Error('no encontrado'), { status: 1 });
      return estado.tareaXml;
    }
    throw new Error('comando SYNC no previsto en la sonda: ' + cmd + ' ' + args.join(' '));
  };

  const execFileStub = (cmd, args, opts, cb) => {
    llamadas.push({ sync: false, cmd, args: args.slice() });
    setImmediate(() => {
      if (cmd === 'reg.exe' && args[0] === 'add') {
        estado.run = args[args.indexOf('/d') + 1];
        cb(null);
      } else if (cmd === 'reg.exe' && args[0] === 'delete') {
        estado.run = null;
        cb(null);
      } else if (cmd === 'schtasks.exe' && args[0] === '/create') {
        const rutaXml = args[args.indexOf('/xml') + 1];
        try {
          estado.tareaXml = fs.readFileSync(rutaXml, 'utf16le').replace(/^\uFEFF/, '');
          cb(null);
        } catch (e) { cb(e); }
      } else if (cmd === 'schtasks.exe' && args[0] === '/run') {
        if (estado.tareaXml) cb(null); else cb(Object.assign(new Error('no existe'), { status: 1 }));
      } else if (cmd === 'schtasks.exe' && args[0] === '/delete') {
        estado.tareaXml = null;
        cb(null);
      } else {
        cb(new Error('comando ASYNC no previsto en la sonda: ' + cmd + ' ' + args.join(' ')));
      }
    });
  };

  return { estado, llamadas, execFileSyncStub, execFileStub };
}

const RAIZ = path.join(os.tmpdir(), '_a33-8a-node');
fs.rmSync(RAIZ, { recursive: true, force: true });
fs.mkdirSync(RAIZ, { recursive: true });
process.on('exit', () => { try { fs.rmSync(RAIZ, { recursive: true, force: true }); } catch (e) {} });
let n = 0;
function carpeta() { const d = path.join(RAIZ, 'c' + (++n)); fs.mkdirSync(d, { recursive: true }); return d; }
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// comando "correcto" tal y como lo escribiría repararPersistenciaDriveSyncGuard
// para una instalación cuyo resourcesPath es `resourcesPath`.
function comandoRunCorrecto(resourcesPath) {
  const scriptPath = path.join(resourcesPath, 'drive-sync-guard', 'DriveSyncGuard.ps1');
  return `powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "${scriptPath}"`;
}
function xmlTareaCorrecta(resourcesPath) {
  const scriptPath = path.join(resourcesPath, 'drive-sync-guard', 'DriveSyncGuard.ps1');
  const vbsPath = path.join(resourcesPath, 'drive-sync-guard', 'LaunchHidden.vbs');
  const args = `//B "${vbsPath}" "${scriptPath}"`;
  return `<?xml version="1.0" encoding="UTF-16"?>\r\n<Task version="1.2"><Actions Context="Author"><Exec><Command>wscript.exe</Command><Arguments>${args.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}</Arguments></Exec></Actions></Task>\r\n`;
}

// Reloj fijo y arbitrario (no Date.now() real): la batería de cadencia
// avanza el tiempo a voluntad con avanzarReloj(ms), sin esperas reales.
const RELOJ_BASE_MS = 1732000000000;

function construir({ resourcesPath, shared, win, appLogSink, relojInicial }) {
  const traza = { logs: [], menusRefrescados: 0 };
  const appLog = (s) => { traza.logs.push(String(s)); if (appLogSink) appLogSink(String(s)); };
  const refreshAllMenus = () => { traza.menusRefrescados++; };
  const isUsingSharedDataLocationNow = () => (shared === undefined ? true : shared);
  const appStub = { getPath: () => path.join(RAIZ, 'temp-fallback') };
  const processStub = { platform: 'win32', env: { LOCALAPPDATA: path.join(resourcesPath, '..', 'AppData-Local') }, resourcesPath };

  let relojMs = relojInicial === undefined ? RELOJ_BASE_MS : relojInicial;
  class FakeDate extends Date {
    static now() { return relojMs; }
  }

  const f = new Function(
    'app', 'fs', 'path', 'process', 'execFile', 'execFileSync', 'appLog', 'refreshAllMenus', 'isUsingSharedDataLocationNow', 'Date',
    FUENTE + '\nreturn { isDriveSyncGuardEnabled, isDriveSyncGuardActuallyAlive, leerRunDriveSyncGuard, leerTareaDriveSyncGuard,'
    + ' estadoPersistenciaDriveSyncGuard, repararPersistenciaDriveSyncGuard, lanzarDriveSyncGuardActual,'
    + ' enableDriveSyncGuardSilently, disableDriveSyncGuardSilently, syncDriveSyncGuardWithLocation,'
    + ' driveSyncGuardDataDir, driveSyncGuardEnabledFlagPath, driveSyncGuardHeartbeatPath, driveSyncGuardScriptPath, driveSyncGuardVbsLauncherPath,'
    + ' RECHECK_MS: DRIVE_SYNC_GUARD_PERSISTENCE_RECHECK_MS, TIMEOUT_MS: DRIVE_SYNC_GUARD_INSPECCION_TIMEOUT_MS,'
    + ' setConfigNoResuelta: (v) => { configUbicacionNoResuelta = v; }, setSesionLocalTemporal: (v) => { sesionLocalTemporal = v; } };'
  );
  const api = f(appStub, fs, path, processStub, win.execFileStub, win.execFileSyncStub, appLog, refreshAllMenus, isUsingSharedDataLocationNow, FakeDate);
  fs.mkdirSync(api.driveSyncGuardDataDir(), { recursive: true });
  // driveSyncGuardScriptPath() debe EXISTIR (repararPersistenciaDriveSyncGuard
  // se niega a hacer nada si falta -- "copia anterior a la 0.1.54") — se
  // fabrica un stub del recurso empaquetado de ESTA instalación de sandbox.
  fs.mkdirSync(path.dirname(api.driveSyncGuardScriptPath()), { recursive: true });
  fs.writeFileSync(api.driveSyncGuardScriptPath(), '# stub de sandbox, nunca se ejecuta', 'utf8');
  return Object.assign(api, { traza, ahora: () => relojMs, avanzarReloj: (ms) => { relojMs += ms; } });
}

function marcarFresco(api) {
  const t = new Date(api.ahora());
  fs.writeFileSync(api.driveSyncGuardHeartbeatPath(), t.toISOString(), 'utf8');
  fs.utimesSync(api.driveSyncGuardHeartbeatPath(), t, t);
}
function marcarMuerto(api) {
  fs.writeFileSync(api.driveSyncGuardHeartbeatPath(), 'x', 'utf8');
  const viejo = new Date(api.ahora() - 60000);
  fs.utimesSync(api.driveSyncGuardHeartbeatPath(), viejo, viejo);
}
function activarFlag(api) { fs.writeFileSync(api.driveSyncGuardEnabledFlagPath(), new Date().toISOString(), 'utf8'); }

(async () => {
  // ===========================================================================
  seccion('8A-1. TODO CORRECTO -> NADA');
  // ===========================================================================
  {
    const RES = carpeta();
    const win = fakeWindows({ run: comandoRunCorrecto(RES), tareaXml: xmlTareaCorrecta(RES) });
    const api = construir({ resourcesPath: RES, win });
    activarFlag(api); marcarFresco(api);
    win.llamadas.length = 0;
    api.syncDriveSyncGuardWithLocation();
    await esperar(30);
    // Las DOS lecturas de verificación (reg query / schtasks query) SÍ se
    // esperan siempre que isOn&&vivo -- lo que no debe pasar es ESCRIBIR nada.
    ok('8A-1 solo lee, nunca escribe (sin reg add / schtasks create / schtasks run)',
      !win.llamadas.some((l) => l.cmd === 'reg.exe' && l.args[0] === 'add')
      && !win.llamadas.some((l) => l.cmd === 'schtasks.exe' && (l.args[0] === '/create' || l.args[0] === '/run')),
      JSON.stringify(win.llamadas));
    ok('8A-1 no se registra ningún aviso', api.traza.logs.length === 0, JSON.stringify(api.traza.logs));
    ok('8A-1 las dos consultas llevan timeout+killSignal configurados (ajuste final)',
      win.llamadas.filter((l) => l.sync).every((l) => l.opts && l.opts.timeout === api.TIMEOUT_MS && l.opts.killSignal === 'SIGKILL'),
      JSON.stringify(win.llamadas.map((l) => l.opts)));
    // Cierre final (19 sept 2026): el valor concreto queda fijado aquí -- si
    // alguien lo cambia sin querer, esto debe romperse y obligar a
    // recalcular el peor bloqueo acumulado (2x este valor, dos consultas
    // SECUENCIALES) en la documentación.
    ok('8A-1 el timeout final acordado es 1500ms (peor bloqueo acumulado: 2x1500ms = 3000ms)', api.TIMEOUT_MS === 1500);
  }

  // ===========================================================================
  seccion('8A-2. HEARTBEAT MUERTO -> REPARAR+LANZAR (comportamiento ya existente)');
  // ===========================================================================
  {
    const RES = carpeta();
    const win = fakeWindows({ run: null, tareaXml: null });
    const api = construir({ resourcesPath: RES, win });
    activarFlag(api); marcarMuerto(api);
    api.syncDriveSyncGuardWithLocation();
    await esperar(30);
    ok('8A-2 escribe Run', win.estado.run === comandoRunCorrecto(RES), win.estado.run);
    ok('8A-2 crea la tarea', !!win.estado.tareaXml);
    ok('8A-2 dispara schtasks /run', win.llamadas.some((l) => l.cmd === 'schtasks.exe' && l.args[0] === '/run'));
  }

  // ===========================================================================
  seccion('8A-3. RUN VIEJO (tarea correcta, vivo) -> REPARAR+LANZAR');
  // ===========================================================================
  {
    const RES = carpeta();
    const OTRA = carpeta();
    const win = fakeWindows({ run: comandoRunCorrecto(OTRA), tareaXml: xmlTareaCorrecta(RES) });
    const api = construir({ resourcesPath: RES, win });
    activarFlag(api); marcarFresco(api);
    ok('8A-3 pre: leerRun da incorrecta', api.leerRunDriveSyncGuard().estado === 'incorrecta');
    api.syncDriveSyncGuardWithLocation();
    await esperar(30);
    ok('8A-3 repara Run', win.estado.run === comandoRunCorrecto(RES));
    ok('8A-3 lanza (schtasks /run)', win.llamadas.some((l) => l.cmd === 'schtasks.exe' && l.args[0] === '/run'));
  }

  // ===========================================================================
  seccion('8A-4. TAREA VIEJA (Run correcto, vivo) -> REPARAR+LANZAR');
  // ===========================================================================
  {
    const RES = carpeta();
    const OTRA = carpeta();
    const win = fakeWindows({ run: comandoRunCorrecto(RES), tareaXml: xmlTareaCorrecta(OTRA) });
    const api = construir({ resourcesPath: RES, win });
    activarFlag(api); marcarFresco(api);
    ok('8A-4 pre: leerTarea da incorrecta', api.leerTareaDriveSyncGuard().estado === 'incorrecta');
    api.syncDriveSyncGuardWithLocation();
    await esperar(30);
    ok('8A-4 repara la tarea', win.estado.tareaXml.includes(RES.replace(/\\/g, '\\\\')) || win.estado.tareaXml.includes(RES));
    ok('8A-4 lanza (schtasks /run)', win.llamadas.some((l) => l.cmd === 'schtasks.exe' && l.args[0] === '/run'));
  }

  // ===========================================================================
  seccion('8A-5. AMBOS VIEJOS -> REPARAR+LANZAR');
  // ===========================================================================
  {
    const RES = carpeta();
    const OTRA = carpeta();
    const win = fakeWindows({ run: comandoRunCorrecto(OTRA), tareaXml: xmlTareaCorrecta(OTRA) });
    const api = construir({ resourcesPath: RES, win });
    activarFlag(api); marcarFresco(api);
    api.syncDriveSyncGuardWithLocation();
    await esperar(30);
    ok('8A-5 repara Run y tarea', win.estado.run === comandoRunCorrecto(RES) && win.estado.tareaXml.includes(RES));
    ok('8A-5 lanza (schtasks /run)', win.llamadas.some((l) => l.cmd === 'schtasks.exe' && l.args[0] === '/run'));
  }

  // ===========================================================================
  seccion('8A-6. RUN AUSENTE (status 1) -> AJUSTE FINAL: ya NO es "ausente", es no-verificable -> REPARA, NO LANZA');
  // ===========================================================================
  {
    // Punto I del ajuste final: confirmado en vivo (investigación previa) que
    // reg.exe/schtasks.exe devuelven el MISMO código de salida (1) tanto para
    // "no existe" como para un error de sintaxis -- ya no se puede tratar
    // status===1 como sinónimo de "ausente". Este caso (reg.exe query de un
    // valor inexistente, exit 1) ahora cae en 'no-verificable', igual que
    // cualquier otro fallo de lectura -- y por política eso repara pero NO
    // lanza una copia adicional (ver 8A-8/8A-9).
    const RES = carpeta();
    const win = fakeWindows({ run: null, tareaXml: xmlTareaCorrecta(RES) });
    const api = construir({ resourcesPath: RES, win });
    activarFlag(api); marcarFresco(api);
    ok('8A-6 pre: leerRun YA NO da "ausente"', api.leerRunDriveSyncGuard().estado !== 'ausente');
    ok('8A-6 pre: leerRun da no-verificable', api.leerRunDriveSyncGuard().estado === 'no-verificable');
    win.llamadas.length = 0;
    api.syncDriveSyncGuardWithLocation();
    await esperar(30);
    ok('8A-6 repara (reg add + schtasks create)', win.llamadas.some((l) => l.cmd === 'reg.exe' && l.args[0] === 'add') && win.llamadas.some((l) => l.cmd === 'schtasks.exe' && l.args[0] === '/create'));
    ok('8A-6 NO lanza (sin schtasks /run)', !win.llamadas.some((l) => l.cmd === 'schtasks.exe' && l.args[0] === '/run'));
  }

  // ===========================================================================
  seccion('8A-7. TAREA AUSENTE (status 1) -> AJUSTE FINAL: ya NO es "ausente", es no-verificable -> REPARA, NO LANZA');
  // ===========================================================================
  {
    const RES = carpeta();
    const win = fakeWindows({ run: comandoRunCorrecto(RES), tareaXml: null });
    const api = construir({ resourcesPath: RES, win });
    activarFlag(api); marcarFresco(api);
    ok('8A-7 pre: leerTarea YA NO da "ausente"', api.leerTareaDriveSyncGuard().estado !== 'ausente');
    ok('8A-7 pre: leerTarea da no-verificable', api.leerTareaDriveSyncGuard().estado === 'no-verificable');
    win.llamadas.length = 0;
    api.syncDriveSyncGuardWithLocation();
    await esperar(30);
    ok('8A-7 repara (reg add + schtasks create)', win.llamadas.some((l) => l.cmd === 'reg.exe' && l.args[0] === 'add') && win.llamadas.some((l) => l.cmd === 'schtasks.exe' && l.args[0] === '/create'));
    ok('8A-7 NO lanza (sin schtasks /run)', !win.llamadas.some((l) => l.cmd === 'schtasks.exe' && l.args[0] === '/run'));
  }

  // ===========================================================================
  seccion('8A-8. LECTURA RUN NO-VERIFICABLE -> REPARA, NO LANZA');
  // ===========================================================================
  {
    const RES = carpeta();
    const win = fakeWindows({ run: comandoRunCorrecto(RES), tareaXml: xmlTareaCorrecta(RES), forzarErrorRun: { status: 5, message: 'Acceso denegado' } });
    const api = construir({ resourcesPath: RES, win });
    activarFlag(api); marcarFresco(api);
    ok('8A-8 pre: leerRun da no-verificable', api.leerRunDriveSyncGuard().estado === 'no-verificable');
    ok('8A-8 pre: estadoPersistencia global da no-verificable', api.estadoPersistenciaDriveSyncGuard() === 'no-verificable');
    win.llamadas.length = 0;
    win.estado.forzarErrorRun = { status: 5, message: 'Acceso denegado' }; // sigue no-verificable tras el intento de reparar
    api.syncDriveSyncGuardWithLocation();
    await esperar(30);
    ok('8A-8 repara (reg add + schtasks create)', win.llamadas.some((l) => l.cmd === 'reg.exe' && l.args[0] === 'add') && win.llamadas.some((l) => l.cmd === 'schtasks.exe' && l.args[0] === '/create'));
    ok('8A-8 NO lanza (sin schtasks /run)', !win.llamadas.some((l) => l.cmd === 'schtasks.exe' && l.args[0] === '/run'));
  }

  // ===========================================================================
  seccion('8A-9. LECTURA TAREA NO-VERIFICABLE -> REPARA, NO LANZA');
  // ===========================================================================
  {
    const RES = carpeta();
    const win = fakeWindows({ run: comandoRunCorrecto(RES), tareaXml: xmlTareaCorrecta(RES), forzarErrorTarea: { status: 5, message: 'Acceso denegado' } });
    const api = construir({ resourcesPath: RES, win });
    activarFlag(api); marcarFresco(api);
    ok('8A-9 pre: leerTarea da no-verificable', api.leerTareaDriveSyncGuard().estado === 'no-verificable');
    win.llamadas.length = 0;
    api.syncDriveSyncGuardWithLocation();
    await esperar(30);
    ok('8A-9 repara (reg add + schtasks create)', win.llamadas.some((l) => l.cmd === 'reg.exe' && l.args[0] === 'add') && win.llamadas.some((l) => l.cmd === 'schtasks.exe' && l.args[0] === '/create'));
    ok('8A-9 NO lanza (sin schtasks /run)', !win.llamadas.some((l) => l.cmd === 'schtasks.exe' && l.args[0] === '/run'));
  }

  // ===========================================================================
  seccion('8A-10. GUARDIÁN VIVO + PERSISTENCIA VIEJA -> REPARA+LANZA SIN MATAR PROCESOS');
  // ===========================================================================
  {
    const RES = carpeta();
    const OTRA = carpeta();
    const win = fakeWindows({ run: comandoRunCorrecto(OTRA), tareaXml: xmlTareaCorrecta(OTRA) });
    const api = construir({ resourcesPath: RES, win });
    activarFlag(api); marcarFresco(api);
    let lanzo = null;
    try {
      api.syncDriveSyncGuardWithLocation();
      await esperar(30);
    } catch (e) { lanzo = e; }
    ok('8A-10 no lanza ninguna excepción (ningún comando "no previsto", como taskkill)', lanzo === null, String(lanzo));
    ok('8A-10 solo se usaron reg.exe/schtasks.exe', win.llamadas.every((l) => l.cmd === 'reg.exe' || l.cmd === 'schtasks.exe'), JSON.stringify(win.llamadas.map((l) => l.cmd)));
    ok('8A-10 repara y lanza', win.estado.run === comandoRunCorrecto(RES) && win.llamadas.some((l) => l.cmd === 'schtasks.exe' && l.args[0] === '/run'));
  }

  // ===========================================================================
  seccion('8A-11. SESIÓN LOCAL TEMPORAL -> NADA (P22 intacto)');
  // ===========================================================================
  {
    const RES = carpeta();
    const OTRA = carpeta();
    const win = fakeWindows({ run: comandoRunCorrecto(OTRA), tareaXml: xmlTareaCorrecta(OTRA) });
    const api = construir({ resourcesPath: RES, win });
    activarFlag(api); marcarFresco(api);
    api.setSesionLocalTemporal(true);
    api.syncDriveSyncGuardWithLocation();
    await esperar(30);
    ok('8A-11 no toca nada (persistencia vieja incluida)', win.llamadas.length === 0, JSON.stringify(win.llamadas));
  }

  // ===========================================================================
  seccion('8A-12. CONFIG NO RESUELTA -> NADA (P9 intacto)');
  // ===========================================================================
  {
    const RES = carpeta();
    const OTRA = carpeta();
    const win = fakeWindows({ run: comandoRunCorrecto(OTRA), tareaXml: xmlTareaCorrecta(OTRA) });
    const api = construir({ resourcesPath: RES, win });
    activarFlag(api); marcarFresco(api);
    api.setConfigNoResuelta({ estado: 'ilegible' });
    api.syncDriveSyncGuardWithLocation();
    await esperar(30);
    ok('8A-12 no toca nada (persistencia vieja incluida)', win.llamadas.length === 0, JSON.stringify(win.llamadas));
  }

  // ===========================================================================
  seccion('8A-13. enabled.flag NUNCA se borra durante una reparación');
  // ===========================================================================
  {
    const RES = carpeta();
    const OTRA = carpeta();
    const win = fakeWindows({ run: comandoRunCorrecto(OTRA), tareaXml: xmlTareaCorrecta(OTRA) });
    const api = construir({ resourcesPath: RES, win });
    activarFlag(api); marcarFresco(api);
    api.syncDriveSyncGuardWithLocation();
    await esperar(30);
    ok('8A-13 enabled.flag sigue existiendo tras reparar', fs.existsSync(api.driveSyncGuardEnabledFlagPath()));
  }

  // ===========================================================================
  seccion('8A-14. enable() NORMAL EQUIVALENTE TRAS EL REFACTOR');
  // ===========================================================================
  {
    const RES = carpeta();
    const win = fakeWindows({ run: null, tareaXml: null });
    const api = construir({ resourcesPath: RES, win });
    api.enableDriveSyncGuardSilently('prueba directa');
    ok('8A-14 el aviso "activada sola" se registra de inmediato (síncrono, como antes)', api.traza.logs.some((l) => /activada sola/.test(l)));
    ok('8A-14 refreshAllMenus se llama de inmediato', api.traza.menusRefrescados === 1);
    await esperar(30);
    ok('8A-14 tras completarse: enabled.flag existe', fs.existsSync(api.driveSyncGuardEnabledFlagPath()));
    ok('8A-14 tras completarse: Run correcto', win.estado.run === comandoRunCorrecto(RES));
    ok('8A-14 tras completarse: tarea creada y lanzada', !!win.estado.tareaXml && win.llamadas.some((l) => l.cmd === 'schtasks.exe' && l.args[0] === '/run'));
  }

  // ===========================================================================
  seccion('8A-15. TIMEOUT DE reg.exe (sin status, con signal) -> no-verificable -> REPARA, NO LANZA (punto G)');
  // ===========================================================================
  {
    const RES = carpeta();
    const win = fakeWindows({ run: comandoRunCorrecto(RES), tareaXml: xmlTareaCorrecta(RES), forzarErrorRun: { signal: 'SIGTERM', message: 'ETIMEDOUT simulado' } });
    const api = construir({ resourcesPath: RES, win });
    activarFlag(api); marcarFresco(api);
    const r = api.leerRunDriveSyncGuard();
    ok('8A-15 pre: un error de timeout (sin status, con signal) da no-verificable, no una excepción sin capturar', r.estado === 'no-verificable');
    win.llamadas.length = 0;
    api.syncDriveSyncGuardWithLocation();
    await esperar(30);
    ok('8A-15 repara (reg add + schtasks create)', win.llamadas.some((l) => l.cmd === 'reg.exe' && l.args[0] === 'add') && win.llamadas.some((l) => l.cmd === 'schtasks.exe' && l.args[0] === '/create'));
    ok('8A-15 NO lanza (sin schtasks /run)', !win.llamadas.some((l) => l.cmd === 'schtasks.exe' && l.args[0] === '/run'));
  }

  // ===========================================================================
  seccion('8A-16. TIMEOUT DE schtasks.exe (sin status, con signal) -> no-verificable -> REPARA, NO LANZA (punto H)');
  // ===========================================================================
  {
    const RES = carpeta();
    const win = fakeWindows({ run: comandoRunCorrecto(RES), tareaXml: xmlTareaCorrecta(RES), forzarErrorTarea: { signal: 'SIGTERM', message: 'ETIMEDOUT simulado' } });
    const api = construir({ resourcesPath: RES, win });
    activarFlag(api); marcarFresco(api);
    const r = api.leerTareaDriveSyncGuard();
    ok('8A-16 pre: un error de timeout (sin status, con signal) da no-verificable, no una excepción sin capturar', r.estado === 'no-verificable');
    win.llamadas.length = 0;
    api.syncDriveSyncGuardWithLocation();
    await esperar(30);
    ok('8A-16 repara (reg add + schtasks create)', win.llamadas.some((l) => l.cmd === 'reg.exe' && l.args[0] === 'add') && win.llamadas.some((l) => l.cmd === 'schtasks.exe' && l.args[0] === '/create'));
    ok('8A-16 NO lanza (sin schtasks /run)', !win.llamadas.some((l) => l.cmd === 'schtasks.exe' && l.args[0] === '/run'));
  }

  // ===========================================================================
  seccion('8A-17. ERROR GENÉRICO/INCLASIFICABLE (sin status NI signal) -> no-verificable (punto J)');
  // ===========================================================================
  {
    const RES = carpeta();
    // Ni .status ni .signal: un error de spawn (p.ej. ENOENT si el binario no
    // existiera) tiene exactamente esta forma -- no debe colarse como excepción
    // sin capturar ni interpretarse por accidente como ninguno de los otros casos.
    const win = fakeWindows({ run: comandoRunCorrecto(RES), tareaXml: xmlTareaCorrecta(RES), forzarErrorRun: { message: 'spawn reg.exe ENOENT' } });
    const api = construir({ resourcesPath: RES, win });
    activarFlag(api); marcarFresco(api);
    const r = api.leerRunDriveSyncGuard();
    ok('8A-17 un error sin status ni signal da no-verificable, no una excepción sin capturar', r.estado === 'no-verificable');
    win.llamadas.length = 0;
    api.syncDriveSyncGuardWithLocation();
    await esperar(30);
    ok('8A-17 repara, no lanza', win.llamadas.some((l) => l.cmd === 'reg.exe' && l.args[0] === 'add')
      && !win.llamadas.some((l) => l.cmd === 'schtasks.exe' && l.args[0] === '/run'));
  }

  // ===========================================================================
  seccion('8A-18/19/20. CADENCIA DE LA INSPECCIÓN DE Run/tarea (puntos A, B, C)');
  // ===========================================================================
  {
    const RES = carpeta();
    const win = fakeWindows({ run: comandoRunCorrecto(RES), tareaXml: xmlTareaCorrecta(RES) });
    const api = construir({ resourcesPath: RES, win });
    activarFlag(api); marcarFresco(api);

    win.llamadas.length = 0;
    api.syncDriveSyncGuardWithLocation();
    await esperar(10);
    ok('8A-18 (punto A) la primera inspección es inmediata: consulta reg.exe y schtasks.exe en la primera llamada',
      win.llamadas.some((l) => l.cmd === 'reg.exe' && l.args[0] === 'query') && win.llamadas.some((l) => l.cmd === 'schtasks.exe' && l.args[0] === '/query'));

    for (let i = 0; i < 3; i++) {
      api.avanzarReloj(45000); // un tick de watchdog (45s), reloj simulado, sin esperas reales
      marcarFresco(api); // el heartbeat lo mantendría fresco un guardián vivo de verdad
      win.llamadas.length = 0;
      api.syncDriveSyncGuardWithLocation();
      await esperar(10);
      ok(`8A-19 (punto B) tick ${i + 1} dentro de la ventana de cadencia (45s tras la anterior) NO vuelve a consultar reg.exe/schtasks.exe`,
        win.llamadas.length === 0, JSON.stringify(win.llamadas));
    }

    api.avanzarReloj(api.RECHECK_MS + 1000); // ya pasó el intervalo de recomprobación
    marcarFresco(api);
    win.llamadas.length = 0;
    api.syncDriveSyncGuardWithLocation();
    await esperar(10);
    ok('8A-20 (punto C) tras pasar el intervalo de cadencia, SÍ vuelve a inspeccionar',
      win.llamadas.some((l) => l.cmd === 'reg.exe' && l.args[0] === 'query') && win.llamadas.some((l) => l.cmd === 'schtasks.exe' && l.args[0] === '/query'));
  }

  // ===========================================================================
  seccion('8A-21. HEARTBEAT MUERTO IGNORA LA CADENCIA DE PERSISTENCIA (punto D)');
  // ===========================================================================
  {
    const RES = carpeta();
    const win = fakeWindows({ run: comandoRunCorrecto(RES), tareaXml: xmlTareaCorrecta(RES) });
    const api = construir({ resourcesPath: RES, win });
    activarFlag(api); marcarFresco(api);

    // Primer tick: inspección inmediata de persistencia -- queda "recién
    // comprobada", la cadencia de DRIVE_SYNC_GUARD_PERSISTENCE_RECHECK_MS NO
    // ha vencido todavía en el siguiente tick.
    api.syncDriveSyncGuardWithLocation();
    await esperar(10);

    // El heartbeat muere (el proceso cayó) mucho antes de que venza esa cadencia.
    marcarMuerto(api);
    win.llamadas.length = 0;
    api.syncDriveSyncGuardWithLocation();
    await esperar(30);
    ok('8A-21 heartbeat muerto repara+lanza en el siguiente tick normal, SIN esperar a la cadencia lenta de Run/tarea',
      win.llamadas.some((l) => l.cmd === 'schtasks.exe' && l.args[0] === '/run'));
  }

  console.log('\n======================================================================');
  console.log(`  8A: ${pass} OK / ${fail} FALLOS`);
  console.log('======================================================================');
  if (fail) process.exitCode = 1;
})();
