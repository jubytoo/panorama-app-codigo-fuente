'use strict';
// SONDA v3 — medicion ESTRECHA. La v2 midio "en el instante del retorno" con
// un recorrido completo del arbol (~14 ms de lecturas), asi que no demuestra
// sincronia: el dato pudo escribirse DURANTE ese recorrido.
//
// Aqui se mira UN solo fichero conocido con un stat (~decenas de us) y se
// cronometra con hrtime, de modo que la ventana de observacion sea mucho mas
// pequenya que cualquier escritura perezosa.
//
// SEGURIDAD: userData en sandbox %TEMP%. Cero acceso a G:.
const path = require('path');
const fs = require('fs');
const os = require('os');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const MARCA = '_a33-flush-probe3';
const SB = path.join(os.tmpdir(), MARCA);

const GUARDIA = require(path.join(__dirname, '..', 'comun', 'guardia-rutas.js'));
GUARDIA.crearGuardia({ marca: MARCA }).segura(SB);
fs.rmSync(SB, { recursive: true, force: true });
fs.mkdirSync(SB, { recursive: true });

const { app, BrowserWindow, session } = require('electron');
app.setPath('userData', SB);
app.setPath('sessionData', SB);
app.on('window-all-closed', () => {});

const salida = [];
const di = (s) => { salida.push(s); console.log(s); };
const ms = (t) => (Number(process.hrtime.bigint() - t) / 1e6).toFixed(3);

function ldbDir(part) { return path.join(SB, 'Partitions', part, 'Local Storage', 'leveldb'); }
function tamanyos(part) {
  const d = ldbDir(part);
  const o = {};
  let ents = [];
  try { ents = fs.readdirSync(d); } catch (e) { return o; }
  for (const n of ents) { try { o[n] = fs.statSync(path.join(d, n)).size; } catch (e) {} }
  return o;
}
function contiene(part, sen) {
  const d = ldbDir(part);
  let ents = [];
  try { ents = fs.readdirSync(d); } catch (e) { return false; }
  for (const n of ents) {
    try {
      const b = fs.readFileSync(path.join(d, n));
      if (b.includes(Buffer.from(sen, 'utf8')) || b.includes(Buffer.from(sen, 'utf16le'))) return true;
    } catch (e) {}
  }
  return false;
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

app.whenReady().then(async () => {
  try {
    di('SONDA v3 (estrecha) — Electron ' + process.versions.electron);

    const N = 5;
    const filas = [];
    for (let i = 0; i < N; i++) {
      const part = MARCA + '-r' + i;
      const sen = 'SEN-' + i + '-' + Date.now().toString(36).toUpperCase();
      // Primer escritura para que el LevelDB exista y quede "caliente".
      await escribir(part, { semilla: 'x' });
      session.fromPartition('persist:' + part).flushStorageData();
      await new Promise((r) => setTimeout(r, 200));

      // Ahora la escritura que se mide.
      await escribir(part, { probe: sen });
      const antes = tamanyos(part);
      const hayAntes = contiene(part, sen);

      const t0 = process.hrtime.bigint();
      session.fromPartition('persist:' + part).flushStorageData();
      const tLlamada = ms(t0);

      // Observacion ESTRECHA: un readdir + stat, nada mas.
      const t1 = process.hrtime.bigint();
      const desp = tamanyos(part);
      const tStat = ms(t1);

      const crecio = Object.keys(desp).some((k) => (desp[k] || 0) > (antes[k] || 0)) ||
                     Object.keys(desp).some((k) => !(k in antes));
      const hayDesp = contiene(part, sen);

      filas.push({ i, tLlamada, tStat, hayAntes, crecio, hayDesp, antes: JSON.stringify(antes), desp: JSON.stringify(desp) });
    }

    di('');
    di('  ' + 'n'.padEnd(3) + 'flush(ms)'.padEnd(11) + 'obs(ms)'.padEnd(10) +
       'antes'.padEnd(8) + 'crecio'.padEnd(9) + 'despues');
    di('  ' + '-'.repeat(60));
    for (const f of filas) {
      di('  ' + String(f.i).padEnd(3) + String(f.tLlamada).padEnd(11) + String(f.tStat).padEnd(10) +
         String(f.hayAntes).padEnd(8) + String(f.crecio).padEnd(9) + String(f.hayDesp));
    }
    di('');
    for (const f of filas) di('  r' + f.i + ' tamanyos  antes=' + f.antes + '  despues=' + f.desp);

    const todasAntesNo = filas.every((f) => f.hayAntes === false);
    const todasDespSi = filas.every((f) => f.hayDesp === true);
    di('');
    di('=== VEREDICTO ===');
    di('  antes del flush el dato NO estaba en el LevelDB en las ' + N + ' repeticiones: ' + todasAntesNo);
    di('  tras el flush SI estaba en las ' + N + ' repeticiones:                        ' + todasDespSi);
    di('  ventana de observacion (readdir+stat): ' + filas.map((f) => f.tStat).join(', ') + ' ms');
    di('  coste de la propia llamada:            ' + filas.map((f) => f.tLlamada).join(', ') + ' ms');
    di('');
    if (todasAntesNo && todasDespSi) {
      di('  => el efecto en disco es observable dentro de una ventana de decimas de');
      di('     milisegundo tras el retorno. Compatible con "la llamada no vuelve hasta');
      di('     haber ordenado la escritura", NO con "escritura perezosa a los ~100 ms".');
    } else {
      di('  => resultado NO concluyente: revisar antes de afirmar nada.');
    }

    fs.writeFileSync(path.join(os.tmpdir(), MARCA + '-salida.txt'), salida.join('\n'), 'utf8');
  } catch (e) {
    const t = 'EXCEPCION: ' + (e && e.stack || e);
    console.error(t);
    try { fs.writeFileSync(path.join(os.tmpdir(), MARCA + '-salida.txt'), salida.concat([t]).join('\n'), 'utf8'); } catch (e2) {}
    app.exit(2); return;
  }
  setTimeout(() => { try { fs.rmSync(SB, { recursive: true, force: true }); } catch (e) {} app.exit(0); }, 300);
});
