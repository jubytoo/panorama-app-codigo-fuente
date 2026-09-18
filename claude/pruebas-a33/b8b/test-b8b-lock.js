'use strict';
// ---------------------------------------------------------------------------
// Block 8B — LOCK RESIDUAL LOCAL (misma máquina + mismo usuario).
//
// Extrae por firma, de main.js real, exactamente las piezas del lock
// multi-PC (nunca se copian a mano): las dos constantes, los dos `let` de
// estado, y las funciones currentMultiPcIdentity/esIdentidadMultiPcFiable/
// esResiduoLocalPropio/readMultiPcLock/writeMultiPcLockNow/checkMultiPcLock/
// releaseMultiPcLockIfOwned. Todo corre en una carpeta de sandbox
// (os.tmpdir()); nunca se toca la BD real ni Drive ni Run/tarea.
//
// PANORAMA_MAIN permite apuntar a una copia revertida (ver revertir-b8b.js).
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
  lineaConst('MULTI_PC_LOCK_STALE_MINUTES'),
  lineaConst('MULTI_PC_LOCK_HEARTBEAT_MS'),
  lineaLet('multiPcLockOwnedByUs'),
  lineaLet('multiPcLockHeartbeatTimer'),
  extraerDe(MAIN, 'function multiPcLockPath()'),
  extraerDe(MAIN, 'function currentMultiPcIdentity()'),
  extraerDe(MAIN, 'function esIdentidadMultiPcFiable(id)'),
  extraerDe(MAIN, 'function esResiduoLocalPropio(existing)'),
  extraerDe(MAIN, 'function readMultiPcLock()'),
  extraerDe(MAIN, 'async function writeMultiPcLockNow()'),
  extraerDe(MAIN, 'async function checkMultiPcLock()'),
  extraerDe(MAIN, 'function releaseMultiPcLockIfOwned()'),
].join('\n\n');

function construir({ userData, dialogChoice, osImpl } = {}) {
  const traza = { dialogos: [], logs: [], intervalos: [], clearedIntervals: 0 };
  const appStub = { getPath: (k) => { if (k === 'userData') return userData; throw new Error('getPath(' + k + ') no previsto'); } };
  const osStub = osImpl || { hostname: () => 'MAQUINA-TEST', userInfo: () => ({ username: 'usuario-test' }) };
  const dialogStub = {
    showMessageBoxSync(a, b) {
      const o = b || a;
      traza.dialogos.push(o);
      return typeof dialogChoice === 'number' ? dialogChoice : 0; // por defecto: "Cancelar y salir"
    },
  };
  const appLogStub = (s) => traza.logs.push(String(s));
  const errorCodeSuffixStub = (c) => { traza.logs.push('ERROR ' + c + ' — (suffix)'); return '\n\n(código ' + c + ')'; };
  const isUsingSharedDataLocationNowStub = () => true;
  const setIntervalStub = (fn, ms) => { traza.intervalos.push(ms); return { __fakeInterval: true }; };
  const clearIntervalStub = () => { traza.clearedIntervals++; };

  const f = new Function(
    'app', 'fs', 'path', 'os', 'process', 'dialog', 'appLog', 'errorCodeSuffix',
    'isUsingSharedDataLocationNow', 'setInterval', 'clearInterval',
    FUENTE + '\nreturn { checkMultiPcLock, readMultiPcLock, writeMultiPcLockNow, releaseMultiPcLockIfOwned,'
    + ' currentMultiPcIdentity, esIdentidadMultiPcFiable, esResiduoLocalPropio,'
    + ' MULTI_PC_LOCK_STALE_MINUTES, MULTI_PC_LOCK_HEARTBEAT_MS,'
    + ' estado: () => ({ multiPcLockOwnedByUs, multiPcLockHeartbeatTimer }) };'
  );
  const api = f(appStub, fs, path, osStub, process, dialogStub, appLogStub, errorCodeSuffixStub,
    isUsingSharedDataLocationNowStub, setIntervalStub, clearIntervalStub);
  return Object.assign(api, { traza });
}

const RAIZ = path.join(os.tmpdir(), '_a33-b8b-node');
fs.rmSync(RAIZ, { recursive: true, force: true });
fs.mkdirSync(RAIZ, { recursive: true });
process.on('exit', () => { try { fs.rmSync(RAIZ, { recursive: true, force: true }); } catch (e) {} });
let n = 0;
function carpeta() { const d = path.join(RAIZ, 'c' + (++n)); fs.mkdirSync(d, { recursive: true }); return d; }
const lockPathDe = (ud) => path.join(ud, '.panorama-lock.json');
const haceMs = (ms) => new Date(Date.now() - ms).toISOString();

(async () => {
  // ===========================================================================
  seccion('B8B-0. CONTRATO SIN CAMBIOS (TTL / frecuencia de heartbeat)');
  // ===========================================================================
  {
    const api = construir({ userData: carpeta() });
    ok('B8B-0 TTL sigue en 2 minutos', api.MULTI_PC_LOCK_STALE_MINUTES === 2, String(api.MULTI_PC_LOCK_STALE_MINUTES));
    ok('B8B-0 heartbeat sigue en 30000 ms', api.MULTI_PC_LOCK_HEARTBEAT_MS === 30000, String(api.MULTI_PC_LOCK_HEARTBEAT_MS));
  }

  // ===========================================================================
  seccion('B8B-1. LOCK AUSENTE');
  // ===========================================================================
  {
    const UD = carpeta();
    const api = construir({ userData: UD });
    const r = await api.checkMultiPcLock();
    ok('B8B-1 continúa sin preguntar', r === true && api.traza.dialogos.length === 0);
    const existe = fs.existsSync(lockPathDe(UD));
    ok('B8B-1 escribe el lock', existe);
    if (existe) {
      const escrito = JSON.parse(fs.readFileSync(lockPathDe(UD), 'utf8'));
      ok('B8B-1 con la identidad actual (machine/user)', escrito.machine === 'MAQUINA-TEST' && escrito.user === 'usuario-test', JSON.stringify(escrito));
    }
    ok('B8B-1 multiPcLockOwnedByUs=true y arranca el heartbeat cada 30000 ms', api.estado().multiPcLockOwnedByUs === true && api.traza.intervalos.length === 1 && api.traza.intervalos[0] === 30000);
  }

  // ===========================================================================
  seccion('B8B-2. FRESCO, MISMO EQUIPO + MISMO USUARIO -> AUTO-TOMA');
  // ===========================================================================
  {
    const UD = carpeta();
    fs.writeFileSync(lockPathDe(UD), JSON.stringify({ machine: 'MAQUINA-TEST', user: 'usuario-test', lastUpdate: haceMs(5000) }));
    const api = construir({ userData: UD });
    const r = await api.checkMultiPcLock();
    ok('B8B-2 continúa SIN mostrar el diálogo "otro equipo"', r === true && api.traza.dialogos.length === 0);
    ok('B8B-2 deja constancia de "residuo local" en el log', api.traza.logs.some((l) => /residuo local/.test(l)), JSON.stringify(api.traza.logs));
    ok('B8B-2 NO se registra PS-1012 (no se llegó a construir el diálogo)', !api.traza.logs.some((l) => /PS-1012/.test(l)));
  }

  // ===========================================================================
  seccion('B8B-3. FRESCO, MISMO EQUIPO + OTRO USUARIO -> SIGUE PREGUNTANDO');
  // ===========================================================================
  {
    const UD = carpeta();
    fs.writeFileSync(lockPathDe(UD), JSON.stringify({ machine: 'MAQUINA-TEST', user: 'OTRO-USUARIO', lastUpdate: haceMs(5000) }));
    const api = construir({ userData: UD, dialogChoice: 0 });
    const r = await api.checkMultiPcLock();
    ok('B8B-3 muestra el diálogo (no se descarta el usuario)', api.traza.dialogos.length === 1);
    ok('B8B-3 con "Cancelar y salir" no continúa', r === false);
  }
  {
    const UD = carpeta();
    fs.writeFileSync(lockPathDe(UD), JSON.stringify({ machine: 'MAQUINA-TEST', user: 'OTRO-USUARIO', lastUpdate: haceMs(5000) }));
    const api = construir({ userData: UD, dialogChoice: 1 });
    const r = await api.checkMultiPcLock();
    ok('B8B-3 con "Abrir igualmente" sí continúa (comportamiento previo intacto)', r === true);
  }

  // ===========================================================================
  seccion('B8B-4. FRESCO, OTRO EQUIPO -> SIGUE PREGUNTANDO');
  // ===========================================================================
  {
    const UD = carpeta();
    fs.writeFileSync(lockPathDe(UD), JSON.stringify({ machine: 'OTRA-MAQUINA', user: 'usuario-test', lastUpdate: haceMs(5000) }));
    const api = construir({ userData: UD, dialogChoice: 0 });
    const r = await api.checkMultiPcLock();
    ok('B8B-4 muestra el diálogo aunque el usuario coincida', api.traza.dialogos.length === 1 && r === false);
  }

  // ===========================================================================
  seccion('B8B-5. CADUCADO -> TOMA SIN PREGUNTAR');
  // ===========================================================================
  {
    const UD = carpeta();
    fs.writeFileSync(lockPathDe(UD), JSON.stringify({ machine: 'OTRA-MAQUINA', user: 'OTRO-USUARIO', lastUpdate: haceMs(3 * 60000) }));
    const api = construir({ userData: UD });
    const r = await api.checkMultiPcLock();
    ok('B8B-5 caducado (>2 min), aunque sea de otro equipo/usuario: toma sin preguntar', r === true && api.traza.dialogos.length === 0);
  }

  // ===========================================================================
  seccion('B8B-6. JSON INVÁLIDO -> CONTRATO SIN CAMBIOS (tratado como ausente)');
  // ===========================================================================
  {
    const UD = carpeta();
    fs.writeFileSync(lockPathDe(UD), '{ esto no es JSON valido');
    const api = construir({ userData: UD });
    const r = await api.checkMultiPcLock();
    ok('B8B-6 JSON inválido: sin preguntar (colapsa a "ausente")', r === true && api.traza.dialogos.length === 0);
  }

  // ===========================================================================
  seccion('B8B-7. FECHA FUTURA -> CONTRATO SIN CAMBIOS (no se trata como fresco)');
  // ===========================================================================
  {
    const UD = carpeta();
    fs.writeFileSync(lockPathDe(UD), JSON.stringify({ machine: 'MAQUINA-TEST', user: 'usuario-test', lastUpdate: new Date(Date.now() + 60000).toISOString() }));
    const api = construir({ userData: UD });
    const r = await api.checkMultiPcLock();
    ok('B8B-7 fecha futura (reloj desincronizado): toma sin preguntar', r === true && api.traza.dialogos.length === 0);
  }

  // ===========================================================================
  seccion('B8B-EXTRA. IDENTIDAD NO FIABLE -> NUNCA AUTO-TOMA ("ante duda, no")');
  // ===========================================================================
  {
    const UD = carpeta();
    fs.writeFileSync(lockPathDe(UD), JSON.stringify({ machine: 'equipo desconocido', user: 'usuario desconocido', lastUpdate: haceMs(5000) }));
    const api = construir({ userData: UD, dialogChoice: 0, osImpl: { hostname: () => '', userInfo: () => ({ username: '' }) } });
    const r = await api.checkMultiPcLock();
    ok('B8B-extra1 ambos lados "desconocido": NO se auto-toma, sigue preguntando', api.traza.dialogos.length === 1 && r === false);
  }
  {
    const UD = carpeta();
    fs.writeFileSync(lockPathDe(UD), JSON.stringify({ lastUpdate: haceMs(5000) })); // sin machine/user (formato incompleto/antiguo)
    const api = construir({ userData: UD, dialogChoice: 0 });
    const r = await api.checkMultiPcLock();
    ok('B8B-extra2 formato incompleto (sin machine/user, pero legible por el contrato actual): sigue preguntando', api.traza.dialogos.length === 1 && r === false);
  }

  // ===========================================================================
  seccion('B8B-9. CIERRE FATAL — releaseMultiPcLockIfOwned() sigue llamándose explícitamente');
  // ===========================================================================
  {
    // manejarFalloFatal() es demasiado grande para extraerla entera aquí (dialogo,
    // relanzamiento, dbmod...); se verifica a nivel de código fuente que sigue
    // llamando a la MISMA función que B8B-8 prueba en ejecución.
    const cuerpo = extraerDe(MAIN, 'function manejarFalloFatal(codigo, origen, err)');
    ok('B8B-9 manejarFalloFatal() sigue liberando el lock explícitamente (app.exit() se salta before-quit)',
      /releaseMultiPcLockIfOwned\(\);/.test(cuerpo));
  }

  // ===========================================================================
  seccion('B8B-8. CIERRE NORMAL — libera');
  // ===========================================================================
  {
    const UD = carpeta();
    const api = construir({ userData: UD });
    await api.checkMultiPcLock();
    ok('B8B-8 pre: el lock existe tras tomarlo', fs.existsSync(lockPathDe(UD)));
    api.releaseMultiPcLockIfOwned();
    ok('B8B-8 cierre normal: libera el lock (se borra)', !fs.existsSync(lockPathDe(UD)));
    ok('B8B-8 limpia el temporizador de heartbeat', api.traza.clearedIntervals === 1);
  }

  // ===========================================================================
  seccion('B8B-10. LOCK RESIDUAL TRAS CIERRE NO LIMPIO -> AUTO-RECUPERA EN EL SIGUIENTE ARRANQUE');
  // ===========================================================================
  {
    const UD = carpeta();
    const api1 = construir({ userData: UD });
    const r1 = await api1.checkMultiPcLock();
    ok('B8B-10 arranque 1: toma el lock con normalidad', r1 === true);
    // "cierre matado en seco": NO se llama a releaseMultiPcLockIfOwned — el
    // archivo sigue en disco, fresco.
    const api2 = construir({ userData: UD });
    const r2 = await api2.checkMultiPcLock();
    ok('B8B-10 arranque 2 (mismo equipo/usuario, tras matar el 1º sin liberar): auto-recupera SIN preguntar',
      r2 === true && api2.traza.dialogos.length === 0);
    ok('B8B-10 y lo reconoce explícitamente como residuo local en el log', api2.traza.logs.some((l) => /residuo local/.test(l)));
  }

  console.log('\n======================================================================');
  console.log(`  B8B: ${pass} OK / ${fail} FALLOS`);
  console.log('======================================================================');
  if (fail) process.exitCode = 1;
})();
