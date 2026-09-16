'use strict';
// SONDA REAL (Electron de verdad, NO run-as-node): que hace exactamente
// session.flushStorageData() en Electron 30.5.1 sobre una particion persist:.
//
// Responde a tres preguntas, con evidencia de disco, no de lectura de codigo:
//   1. Existe el metodo? Que devuelve: Promise o undefined?
//   2. Tras clear()+setItem() y cerrar la ventana oculta, esta el dato en el
//      LevelDB de la particion? (o sea: hace falta el flush?)
//   3. Tras flushStorageData(), esta?
//
// SEGURIDAD: userData se redirige a un sandbox en %TEMP% ANTES de whenReady.
// Cero acceso a G:. Cero acceso a la BD viva.
const path = require('path');
const fs = require('fs');
const os = require('os');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const MARCA = '_a33-flush-probe';
const SB = path.join(os.tmpdir(), MARCA);

// ---- guardas duras antes de nada ------------------------------------------
const GUARDIA = require(path.join(__dirname, '..', 'comun', 'guardia-rutas.js'));
const guardia = GUARDIA.crearGuardia({ marca: MARCA });
guardia.segura(SB);

fs.rmSync(SB, { recursive: true, force: true });
fs.mkdirSync(SB, { recursive: true });

const { app, BrowserWindow, session } = require('electron');
app.setPath('userData', SB);
app.setPath('sessionData', SB);

const PART = 'persist:' + MARCA;
const SENTINELA = 'SENTINELA-FLUSH-' + Date.now().toString(36).toUpperCase();

const salida = [];
const di = (s) => { salida.push(s); console.log(s); };

// Busca el sentinela en los bytes crudos de todo el arbol de la particion.
function sentinelaEnDisco() {
  const raiz = path.join(SB, 'Partitions', MARCA.replace(/^persist:/, ''));
  const hits = [];
  if (!fs.existsSync(raiz)) return { existeDir: false, hits, raiz };
  (function rec(d) {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) { rec(f); continue; }
      let b = null;
      try { b = fs.readFileSync(f); } catch (e2) { continue; }
      // localStorage de Chromium guarda las claves/valores en UTF-16LE dentro
      // del LevelDB, asi que hay que buscar en las dos codificaciones.
      const utf8 = b.includes(Buffer.from(SENTINELA, 'utf8'));
      const utf16 = b.includes(Buffer.from(SENTINELA, 'utf16le'));
      if (utf8 || utf16) hits.push({ f: path.relative(SB, f), utf8, utf16, size: b.length });
    }
  })(raiz);
  return { existeDir: true, hits, raiz };
}

function escribirEnParticion(dump, clearFirst) {
  return new Promise((resolve, reject) => {
    const w = new BrowserWindow({ show: false, webPreferences: { partition: PART } });
    w.loadFile(path.join(PROJ, 'dashboard', 'restore-helper.html')).then(async () => {
      const script = `
        (function(){
          try{
            ${clearFirst ? 'localStorage.clear();' : ''}
            const dump = ${JSON.stringify(dump)};
            Object.keys(dump).forEach(function(k){ localStorage.setItem(k, dump[k]); });
            return { ok:true, count: Object.keys(dump).length };
          }catch(e){ return { ok:false, message: String((e && e.message) || e) }; }
        })();
      `;
      try { const r = await w.webContents.executeJavaScript(script); w.close(); resolve(r); }
      catch (e) { w.close(); reject(e); }
    }).catch(reject);
  });
}

function leerDeParticion() {
  return new Promise((resolve, reject) => {
    const w = new BrowserWindow({ show: false, webPreferences: { partition: PART } });
    w.loadFile(path.join(PROJ, 'dashboard', 'restore-helper.html')).then(async () => {
      try {
        const r = await w.webContents.executeJavaScript(
          '(function(){var o={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);o[k]=localStorage.getItem(k);}return o;})();');
        w.close(); resolve(r);
      } catch (e) { w.close(); reject(e); }
    }).catch(reject);
  });
}

app.whenReady().then(async () => {
  try {
    di('SONDA flushStorageData — Electron ' + process.versions.electron + ' / Chromium ' + process.versions.chrome);
    di('  sandbox userData: ' + SB);
    di('  particion:        ' + PART);
    di('  sentinela:        ' + SENTINELA);

    const ses = session.fromPartition(PART);

    // ---- P1: forma de la API --------------------------------------------
    di('\n--- P1: forma de la API ---');
    di('  typeof ses.flushStorageData = ' + typeof ses.flushStorageData);
    const arity = typeof ses.flushStorageData === 'function' ? ses.flushStorageData.length : null;
    di('  aridad declarada            = ' + arity);

    // ---- P2: escribir y mirar el disco SIN flush -------------------------
    di('\n--- P2: tras clear()+setItem()+close(), SIN flush ---');
    const dump = { 'probe': SENTINELA, 'otra': 'valor-cualquiera' };
    const w1 = await escribirEnParticion(dump, true);
    di('  escritura: ' + JSON.stringify(w1));
    const antes = sentinelaEnDisco();
    di('  carpeta de particion existe: ' + antes.existeDir + '  (' + antes.raiz + ')');
    di('  ficheros con el sentinela:   ' + antes.hits.length + (antes.hits.length ? '  ' + JSON.stringify(antes.hits) : ''));

    // ---- P3: flush y volver a mirar --------------------------------------
    di('\n--- P3: tras flushStorageData() ---');
    const t0 = Date.now();
    const devuelto = ses.flushStorageData();
    const esPromesa = devuelto && typeof devuelto.then === 'function';
    di('  devuelve: ' + (devuelto === undefined ? 'undefined' : Object.prototype.toString.call(devuelto)) +
       '   esPromesa=' + !!esPromesa);
    if (esPromesa) await devuelto;
    const msFlush = Date.now() - t0;
    di('  await sobre el valor devuelto: seguro (undefined tambien se puede await)');
    di('  coste: ' + msFlush + ' ms');

    // Damos un respiro minimo por si el commit es asincrono dentro de Chromium.
    const mirar = () => sentinelaEnDisco();
    let desp = mirar();
    for (let i = 0; i < 20 && desp.hits.length === 0; i++) {
      await new Promise((r) => setTimeout(r, 100));
      desp = mirar();
    }
    di('  ficheros con el sentinela:   ' + desp.hits.length + (desp.hits.length ? '  ' + JSON.stringify(desp.hits) : ''));

    // ---- P4: el dato sigue siendo legible por la app ----------------------
    di('\n--- P4: relectura desde la particion ---');
    const leido = await leerDeParticion();
    di('  leido: ' + JSON.stringify(leido));
    di('  sentinela intacto: ' + (leido && leido.probe === SENTINELA));

    // ---- P5: flush sobre particion inexistente / doble flush -------------
    di('\n--- P5: robustez ---');
    let err1 = null;
    try { await session.fromPartition('persist:' + MARCA + '-vacia').flushStorageData(); } catch (e) { err1 = String(e && e.message || e); }
    di('  flush sobre particion sin datos: ' + (err1 ? 'LANZA: ' + err1 : 'no lanza'));
    let err2 = null;
    try { await ses.flushStorageData(); await ses.flushStorageData(); } catch (e) { err2 = String(e && e.message || e); }
    di('  flush repetido:                  ' + (err2 ? 'LANZA: ' + err2 : 'no lanza'));

    di('\n=== VEREDICTO ===');
    di('  existe:            ' + (typeof ses.flushStorageData === 'function'));
    di('  devuelve promesa:  ' + !!esPromesa);
    di('  en disco SIN flush: ' + antes.hits.length + ' fichero(s)');
    di('  en disco CON flush: ' + desp.hits.length + ' fichero(s)');
    di('  el flush CAMBIA el estado observable en disco: ' + (antes.hits.length === 0 && desp.hits.length > 0));

    fs.writeFileSync(path.join(os.tmpdir(), MARCA + '-salida.txt'), salida.join('\n'), 'utf8');
  } catch (e) {
    console.error('EXCEPCION EN LA SONDA:', e && e.stack || e);
    app.exit(2); return;
  }
  // limpieza del sandbox
  try { session.defaultSession; } catch (e) {}
  setTimeout(() => {
    try { fs.rmSync(SB, { recursive: true, force: true }); } catch (e) {}
    console.log('\n  sandbox borrado: ' + !fs.existsSync(SB));
    app.exit(0);
  }, 300);
});
