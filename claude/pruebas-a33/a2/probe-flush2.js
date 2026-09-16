'use strict';
// SONDA v2 — la pregunta que de verdad importa:
//
//   flushStorageData() devuelve undefined (v1 lo demostro). Entonces:
//   (a) esta el dato en disco EN EL INSTANTE en que la llamada retorna?
//   (b) o llega despues, y el flush solo ADELANTA una escritura perezosa?
//   (c) y sin flush, llegaria igualmente si esperamos lo mismo? (CONTROL)
//
// Sin el brazo de CONTROL no se puede afirmar que el flush cambie nada: el
// LevelDB de Chromium confirma solo por lotes, y el dato podria aparecer por
// su cuenta pasado un rato.
//
// SEGURIDAD: userData redirigido a sandbox en %TEMP%. Cero acceso a G:.
const path = require('path');
const fs = require('fs');
const os = require('os');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const MARCA = '_a33-flush-probe2';
const SB = path.join(os.tmpdir(), MARCA);

const GUARDIA = require(path.join(__dirname, '..', 'comun', 'guardia-rutas.js'));
GUARDIA.crearGuardia({ marca: MARCA }).segura(SB);
fs.rmSync(SB, { recursive: true, force: true });
fs.mkdirSync(SB, { recursive: true });

const { app, BrowserWindow, session } = require('electron');
app.setPath('userData', SB);
app.setPath('sessionData', SB);
// Sin esto, en cuanto se cierra la ventana oculta Electron dispara su
// `window-all-closed` por defecto y MATA el proceso a mitad de la sonda (con
// exit 0, que ademas enganya). La v1 solo sobrevivio por durar menos.
app.on('window-all-closed', () => {});

const salida = [];
const di = (s) => { salida.push(s); console.log(s); };

function buscar(part, sentinela) {
  const raiz = path.join(SB, 'Partitions', part);
  const hits = [];
  if (!fs.existsSync(raiz)) return hits;
  (function rec(d) {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of ents) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) { rec(f); continue; }
      let b = null;
      try { b = fs.readFileSync(f); } catch (e2) { continue; }
      if (b.includes(Buffer.from(sentinela, 'utf8')) || b.includes(Buffer.from(sentinela, 'utf16le'))) {
        hits.push(path.relative(SB, f));
      }
    }
  })(raiz);
  return hits;
}

function escribir(part, dump) {
  return new Promise((resolve, reject) => {
    const w = new BrowserWindow({ show: false, webPreferences: { partition: 'persist:' + part } });
    w.loadFile(path.join(PROJ, 'dashboard', 'restore-helper.html')).then(async () => {
      const script = `
        (function(){
          try{
            localStorage.clear();
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

// Espera hasta `topeMs` a que el sentinela aparezca en disco. Devuelve el
// tiempo transcurrido, o null si nunca aparecio.
async function esperarADisco(part, sentinela, topeMs) {
  const t0 = Date.now();
  for (;;) {
    if (buscar(part, sentinela).length > 0) return Date.now() - t0;
    if (Date.now() - t0 >= topeMs) return null;
    await new Promise((r) => setTimeout(r, 25));
  }
}

const TOPE = 15000;

app.whenReady().then(async () => {
  try {
    di('SONDA v2 flushStorageData — Electron ' + process.versions.electron + ' / Chromium ' + process.versions.chrome);
    di('  tope de espera por brazo: ' + TOPE + ' ms');

    // =====================================================================
    // BRAZO CONTROL — escribir, cerrar, y NO llamar a flush.
    // =====================================================================
    di('\n--- BRAZO CONTROL (sin flush) ---');
    const partC = MARCA + '-control';
    const senC = 'SENTINELA-CONTROL-' + Date.now().toString(36).toUpperCase();
    di('  escritura: ' + JSON.stringify(await escribir(partC, { probe: senC })));
    const yaC = buscar(partC, senC).length;
    di('  en disco inmediatamente tras cerrar la ventana: ' + yaC + ' fichero(s)');
    const tC = await esperarADisco(partC, senC, TOPE);
    di('  tiempo hasta aparecer en disco SIN flush: ' + (tC === null ? 'NUNCA (tope de ' + TOPE + ' ms)' : tC + ' ms'));

    // =====================================================================
    // BRAZO FLUSH — escribir, cerrar, llamar a flush, medir.
    // =====================================================================
    di('\n--- BRAZO FLUSH ---');
    const partF = MARCA + '-flush';
    const senF = 'SENTINELA-FLUSH-' + Date.now().toString(36).toUpperCase();
    di('  escritura: ' + JSON.stringify(await escribir(partF, { probe: senF })));
    const antesDelFlush = buscar(partF, senF).length;
    di('  en disco ANTES de llamar al flush: ' + antesDelFlush + ' fichero(s)');

    const t0 = Date.now();
    const dev = session.fromPartition('persist:' + partF).flushStorageData();
    const msLlamada = Date.now() - t0;
    di('  la llamada devuelve: ' + (dev === undefined ? 'undefined' : Object.prototype.toString.call(dev)) +
       '   y tarda ' + msLlamada + ' ms');

    // (a) EN EL INSTANTE del retorno, sin ceder el bucle de eventos:
    const enElRetorno = buscar(partF, senF).length;
    di('  en disco EN EL INSTANTE del retorno: ' + enElRetorno + ' fichero(s)   <-- la pregunta clave');

    const tF = await esperarADisco(partF, senF, TOPE);
    di('  tiempo hasta aparecer en disco CON flush: ' + (tF === null ? 'NUNCA (tope de ' + TOPE + ' ms)' : tF + ' ms'));

    // =====================================================================
    // BRAZO AWAIT — el mismo flush pero con `await` delante, que es lo que
    // se plantea escribir en produccion. `await undefined` cede UN turno de
    // microtareas: hay que medir si eso basta.
    // =====================================================================
    di('\n--- BRAZO AWAIT (await ses.flushStorageData()) ---');
    const partA = MARCA + '-await';
    const senA = 'SENTINELA-AWAIT-' + Date.now().toString(36).toUpperCase();
    await escribir(partA, { probe: senA });
    await session.fromPartition('persist:' + partA).flushStorageData();
    const trasAwait = buscar(partA, senA).length;
    di('  en disco justo tras el await: ' + trasAwait + ' fichero(s)');
    const tA = await esperarADisco(partA, senA, TOPE);
    di('  tiempo hasta aparecer en disco: ' + (tA === null ? 'NUNCA' : tA + ' ms'));

    di('\n=== VEREDICTO ===');
    di('  SIN flush, el dato llega solo:        ' + (tC === null ? 'NO, en ' + TOPE + ' ms' : 'SI, en ' + tC + ' ms'));
    di('  CON flush, el dato llega:             ' + (tF === null ? 'NO' : 'SI, en ' + tF + ' ms'));
    di('  el flush es SINCRONO respecto al disco: ' + (enElRetorno > 0));
    di('  `await` sobre el (undefined) basta:     ' + (trasAwait > 0));
    di('');
    if (tC === null && tF !== null) {
      di('  => el flush ES NECESARIO: sin el, el dato NO llega a disco en ' + TOPE + ' ms.');
    } else if (tC !== null && tF !== null && tF < tC) {
      di('  => el flush ADELANTA la escritura (' + tF + ' ms frente a ' + tC + ' ms), pero el dato');
      di('     acabaria llegando igual. No es un cambio de garantia, es un cambio de plazo.');
    } else if (tC !== null && tF === null) {
      di('  => RESULTADO CONTRAINTUITIVO: revisar la sonda antes de concluir nada.');
    }
    if (enElRetorno === 0) {
      di('  => y NO es una barrera: al retornar la llamada el dato AUN NO estaba en disco.');
      di('     Poner el flush antes del commit REDUCE la ventana, no la cierra.');
    }

    fs.writeFileSync(path.join(os.tmpdir(), MARCA + '-salida.txt'), salida.join('\n'), 'utf8');
  } catch (e) {
    const t = 'EXCEPCION EN LA SONDA: ' + (e && e.stack || e);
    console.error(t);
    try { fs.writeFileSync(path.join(os.tmpdir(), MARCA + '-salida.txt'), salida.concat([t]).join('\n'), 'utf8'); } catch (e2) {}
    app.exit(2); return;
  }
  setTimeout(() => {
    try { fs.rmSync(SB, { recursive: true, force: true }); } catch (e) {}
    app.exit(0);
  }, 300);
});
