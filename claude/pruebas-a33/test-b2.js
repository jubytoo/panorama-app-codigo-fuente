// Pruebas de B2. Extrae de main.js el bloque REAL de manejo de fallos
// (manejarFalloFatal, los cuatro manejadores globales y
// reportarErrorDeOperacion) y lo ejecuta con dobles de `app`, `dialog` y
// `BrowserWindow`. No toca datos del usuario.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const SRC = fs.readFileSync(path.join(PROJ, 'main.js'), 'utf8').split(/\r?\n/);

let pass = 0, fail = 0; const fallos = [];
function check(n, c, extra) {
  if (c) { pass++; console.log('    OK   ' + n); }
  else { fail++; fallos.push(n); console.log('    FALLO ' + n + (extra !== undefined ? '  -- ' + extra : '')); }
}

// Bloque real: desde la declaración de procesoComprometido hasta el final de
// reportarErrorDeOperacion.
const ini = SRC.findIndex((l) => l.startsWith('let procesoComprometido = false;'));
let fin = SRC.findIndex((l, i) => i > ini && l.startsWith('function reportarErrorDeOperacion'));
while (SRC[fin] !== '}') fin++;
const BLOQUE = SRC.slice(ini, fin + 1).join('\n');
console.log('Bloque B2 real extraído de main.js: líneas ' + (ini + 1) + '-' + (fin + 1) + '\n');

function entorno(opts) {
  opts = opts || {};
  const E = {
    logs: [], dialogos: [], exit: null, relaunch: 0, lockLiberado: 0,
    ventanas: [], modales: [], errorBoxes: [],
    respuestaDialogo: opts.respuestaDialogo != null ? opts.respuestaDialogo : 0,
    ready: opts.ready !== false,
  };
  const appEv = new EventEmitter();
  const ctx = {
    console, JSON, Date, Math, String, Number, Array, Object, Error, Set, Map, Boolean,
    app: {
      isReady: () => E.ready,
      relaunch: () => { E.relaunch++; },
      exit: (c) => { if (E.exit === null) E.exit = c; },
      on: (ev, cb) => appEv.on(ev, cb),
    },
    dialog: {
      showMessageBoxSync: (parent, o) => { E.dialogos.push(o); return E.respuestaDialogo; },
      showErrorBox: (t, c) => { E.errorBoxes.push({ t, c }); },
    },
    BrowserWindow: { fromWebContents: (wc) => (wc && wc.__win) || null },
    appLog: (l) => E.logs.push(l),
    errorCodeSuffix: (c) => ' [' + c + ']',
    modalAlert: (w, msg, o) => { E.modales.push({ w, msg, o }); return Promise.resolve(); },
    releaseMultiPcLockIfOwned: () => { E.lockLiberado++; },
    startupRecoveryArmed: opts.startupRecoveryArmed === true,
    restoreInProgress: new Set(opts.restaurando || []),
    rekeyInProgress: !!opts.recifrando,
    projectWindows: new Map(),
    process: { on: (ev, cb) => { E['on_' + ev] = cb; } },
  };
  vm.createContext(ctx);
  // El handler de 'before-quit' que pone cerrandoApp=true vive fuera del
  // bloque extraído (está junto a app.on('before-quit') en otra zona de
  // main.js), así que el arnés necesita poder marcarlo a mano.
  vm.runInContext(BLOQUE + '\nthis.__api = { manejarFalloFatal, reportarErrorDeOperacion, get procesoComprometido(){return procesoComprometido;}, get cerrandoApp(){return cerrandoApp;}, set cerrandoApp(v){ cerrandoApp = v; } };', ctx);
  E.ctx = ctx; E.appEv = appEv; E.api = ctx.__api;
  return E;
}

function ventanaFalsa(opts) {
  opts = opts || {};
  const w = {
    destruida: !!opts.destruida, recargas: 0, destroys: 0,
    __panoramaClosingForRestore: !!opts.cerrandoRestauracion,
    __panoramaFlushed: !!opts.flushed,
    isDestroyed() { return this.destruida; },
    reload() { this.recargas++; },
    destroy() { this.destroys++; this.destruida = true; },
  };
  w.webContents = { __win: w };
  return w;
}

// ==========================================================================
console.log('=== 1. CLASE 1: uncaughtException -> fail-stop ===');
{
  const E = entorno({ respuestaDialogo: 0 });
  E.on_uncaughtException(new Error('boom sincrono'));
  check('marca el proceso como comprometido', E.api.procesoComprometido === true);
  check('marca que la app se está cerrando', E.api.cerrandoApp === true);
  check('registra PS-1013 con el detalle', E.logs.some((l) => /ERROR PS-1013 .*FALLO FATAL.*boom sincrono/s.test(l)), E.logs.join(' | '));
  check('libera el lock multi-PC (y solo una vez)', E.lockLiberado === 1, String(E.lockLiberado));
  check('muestra UN diálogo', E.dialogos.length === 1, String(E.dialogos.length));
  const d = E.dialogos[0] || {};
  check('con exactamente dos botones', d.buttons && d.buttons.length === 2, JSON.stringify(d.buttons));
  check('Reiniciar / Cerrar', d.buttons && d.buttons[0] === 'Reiniciar Panorama' && d.buttons[1] === 'Cerrar');
  check('Reiniciar es el predeterminado', d.defaultId === 0);
  check('SIN opción de continuar', !JSON.stringify(d.buttons).match(/eguir|ontinuar/));
  check('el texto dice que los datos están a salvo', /DATOS ESTÁN A SALVO/.test(d.detail || ''));
  check('el texto dice que no se intenta guardar nada', /no se intenta guardar nada más/.test(d.detail || ''));
  check('el texto lleva el código PS-1013', /PS-1013/.test(d.detail || ''));
  check('relanza', E.relaunch === 1);
  check('sale con código 1', E.exit === 1, String(E.exit));
}

console.log('\n=== 2. CLASE 1: elegir "Cerrar" no relanza ===');
{
  const E = entorno({ respuestaDialogo: 1 });
  E.on_uncaughtException(new Error('boom'));
  check('no relanza', E.relaunch === 0);
  check('sale con código 1', E.exit === 1);
}

console.log('\n=== 3. CLASE 1: reentrada — un segundo fallo no abre otro diálogo ===');
{
  const E = entorno();
  E.on_uncaughtException(new Error('primero'));
  E.on_uncaughtException(new Error('segundo'));
  check('solo un diálogo', E.dialogos.length === 1, String(E.dialogos.length));
  check('el segundo queda registrado igualmente', E.logs.some((l) => /durante el cierre por fallo fatal.*segundo/s.test(l)), E.logs.join(' | '));
  check('el lock se libera una sola vez', E.lockLiberado === 1);
}

console.log('\n=== 4. CLASE 1: no se pisa con el manejador de arranque ===');
{
  const E = entorno({ startupRecoveryArmed: true });
  E.on_uncaughtException(new Error('durante el arranque'));
  check('no hace nada (manda handleFatalStartupError)', E.dialogos.length === 0 && E.exit === null && E.api.procesoComprometido === false);
}

console.log('\n=== 5. CLASE 1: menciona A1/A2 en curso ===');
{
  const E1 = entorno({ restaurando: [7] });
  E1.on_uncaughtException(new Error('x'));
  check('avisa de la restauración en curso', /restauración de backup en curso/.test(E1.dialogos[0].detail));
  check('y de que los backups siguen intactos', /backups siguen intactos/.test(E1.dialogos[0].detail));
  const E2 = entorno({ recifrando: true });
  E2.on_uncaughtException(new Error('x'));
  check('avisa del re-cifrado en curso', /cambio de contraseña\/cifrado en curso/.test(E2.dialogos[0].detail));
  const E3 = entorno();
  E3.on_uncaughtException(new Error('x'));
  check('sin nada en curso, no menciona ninguno de los dos', !/en curso/.test(E3.dialogos[0].detail));
}

console.log('\n=== 6. CLASE 2: unhandledRejection -> mismo fail-stop, SIN "seguir" ===');
{
  const E = entorno();
  E.on_unhandledRejection(new Error('rechazo huerfano'));
  check('registra PS-1014', E.logs.some((l) => /ERROR PS-1014/.test(l)), E.logs.join(' | '));
  check('muestra diálogo', E.dialogos.length === 1);
  const d = E.dialogos[0];
  check('dos botones exactos', d.buttons.length === 2 && d.buttons[0] === 'Reiniciar Panorama' && d.buttons[1] === 'Cerrar', JSON.stringify(d.buttons));
  check('SIN "Seguir por ahora"', !JSON.stringify(d.buttons).includes('Seguir'));
  check('Reiniciar por defecto', d.defaultId === 0);
  check('congela escrituras y sale', E.api.procesoComprometido === true && E.exit === 1);
}

console.log('\n=== 7. CLASE 2: antes de ready usa showErrorBox y no bloquea ===');
{
  const E = entorno({ ready: false });
  E.on_unhandledRejection(new Error('temprano'));
  check('no intenta showMessageBoxSync', E.dialogos.length === 0);
  check('usa showErrorBox', E.errorBoxes.length === 1);
  check('sale igualmente', E.exit === 1);
}

console.log('\n=== 8. CLASE 3: motivos NORMALES no molestan ===');
{
  for (const motivo of ['clean-exit', 'killed']) {
    const E = entorno();
    const w = ventanaFalsa();
    E.ctx.projectWindows.set(7, w);
    E.appEv.emit('render-process-gone', {}, w.webContents, { reason: motivo, exitCode: 0 });
    check(`motivo "${motivo}": sin diálogo, sin log, sin recarga`,
      E.dialogos.length === 0 && E.logs.length === 0 && w.recargas === 0);
  }
}

console.log('\n=== 9. CLASE 3: motivo anómalo -> se ofrece recargar ===');
{
  const E = entorno({ respuestaDialogo: 0 });
  const w = ventanaFalsa();
  E.ctx.projectWindows.set(7, w);
  E.appEv.emit('render-process-gone', {}, w.webContents, { reason: 'crashed', exitCode: 133 });
  check('registra PS-1015', E.logs.some((l) => /PS-1015/.test(l)), E.logs.join(' | '));
  check('ofrece diálogo', E.dialogos.length === 1);
  check('con Recargar / Cerrar la ventana', E.dialogos[0].buttons.join('|') === 'Recargar la ventana|Cerrar la ventana');
  check('recarga la ventana', w.recargas === 1);
  check('NO cierra la app', E.exit === null);
  check('NO marca el proceso como comprometido', E.api.procesoComprometido === false);
}

console.log('\n=== 10. CLASE 3: oom tiene texto propio ===');
{
  const E = entorno({ respuestaDialogo: 0 });
  const w = ventanaFalsa();
  E.ctx.projectWindows.set(7, w);
  E.appEv.emit('render-process-gone', {}, w.webContents, { reason: 'oom', exitCode: 0 });
  check('menciona la memoria', /sin memoria/.test(E.dialogos[0].detail));
}

console.log('\n=== 11. CLASE 3: NO recupera si el contexto no es válido ===');
{
  // a) la app se está cerrando
  const A = entorno();
  A.api.cerrandoApp = true; // equivale a que haya saltado 'before-quit'
  const wa = ventanaFalsa(); A.ctx.projectWindows.set(7, wa);
  A.appEv.emit('render-process-gone', {}, wa.webContents, { reason: 'crashed' });
  check('a) app cerrándose: registra pero no ofrece nada', A.logs.some((l) => /PS-1015/.test(l)) && A.dialogos.length === 0 && wa.recargas === 0);

  // b) ventana ya destruida a propósito
  const B = entorno();
  const wb = ventanaFalsa({ destruida: true }); B.ctx.projectWindows.set(7, wb);
  B.appEv.emit('render-process-gone', {}, wb.webContents, { reason: 'crashed' });
  check('b) ventana destruida: no ofrece recargar', B.dialogos.length === 0 && wb.recargas === 0);

  // c) se estaba cerrando para restaurar
  const C = entorno();
  const wc = ventanaFalsa({ cerrandoRestauracion: true }); C.ctx.projectWindows.set(7, wc);
  C.appEv.emit('render-process-gone', {}, wc.webContents, { reason: 'crashed' });
  check('c) cierre por restauración: no ofrece recargar', C.dialogos.length === 0 && wc.recargas === 0);

  // d) ya había pasado por el guardado final
  const D = entorno();
  const wd = ventanaFalsa({ flushed: true }); D.ctx.projectWindows.set(7, wd);
  D.appEv.emit('render-process-gone', {}, wd.webContents, { reason: 'crashed' });
  check('d) ventana ya "flushed": no ofrece recargar', D.dialogos.length === 0 && wd.recargas === 0);

  // e) NO es la ventana registrada (resto de una vieja)
  const F = entorno();
  const vieja = ventanaFalsa(); const nueva = ventanaFalsa();
  F.ctx.projectWindows.set(7, nueva);
  F.appEv.emit('render-process-gone', {}, vieja.webContents, { reason: 'crashed' });
  check('e) ventana no registrada: no se recarga', F.dialogos.length === 0 && vieja.recargas === 0 && nueva.recargas === 0);

  // f) restauración en curso de ese proyecto
  const G = entorno({ restaurando: [7] });
  const wg = ventanaFalsa(); G.ctx.projectWindows.set(7, wg);
  G.appEv.emit('render-process-gone', {}, wg.webContents, { reason: 'crashed' });
  check('f) restauración en curso: no se recarga', G.dialogos.length === 0 && wg.recargas === 0);
}

console.log('\n=== 12. CLASE 3: tope de 3 caídas por ventana ===');
{
  const E = entorno({ respuestaDialogo: 0 });
  const w = ventanaFalsa();
  E.ctx.projectWindows.set(7, w);
  for (let i = 0; i < 4; i++) E.appEv.emit('render-process-gone', {}, w.webContents, { reason: 'crashed' });
  check('recarga como mucho 3 veces', w.recargas === 3, String(w.recargas));
  check('el 4o avisa de que deja de ofrecerlo', /sigue fallando/.test(E.dialogos[3].message || ''), JSON.stringify(E.dialogos[3] && E.dialogos[3].message));
  check('nunca cierra la app', E.exit === null);
}

console.log('\n=== 13. CLASE 3: elegir "Cerrar la ventana" ===');
{
  const E = entorno({ respuestaDialogo: 1 });
  const w = ventanaFalsa();
  E.ctx.projectWindows.set(7, w);
  E.appEv.emit('render-process-gone', {}, w.webContents, { reason: 'crashed' });
  check('no recarga', w.recargas === 0);
  check('destruye la ventana', w.destroys === 1);
  check('la app sigue viva', E.exit === null);
}

console.log('\n=== 14. CLASE 3: child-process-gone solo avisa a la 3a ===');
{
  const E = entorno();
  for (let i = 0; i < 2; i++) E.appEv.emit('child-process-gone', {}, { type: 'GPU', reason: 'crashed' });
  check('las dos primeras solo se registran', E.dialogos.length === 0 && E.logs.filter((l) => /PROCESO HIJO/.test(l)).length === 2);
  E.appEv.emit('child-process-gone', {}, { type: 'GPU', reason: 'crashed' });
  check('la tercera avisa una vez', E.dialogos.length === 1);
  E.appEv.emit('child-process-gone', {}, { type: 'GPU', reason: 'crashed' });
  check('la cuarta ya no vuelve a avisar', E.dialogos.length === 1);
  check('clean-exit se ignora', (() => { const n = E.logs.length; E.appEv.emit('child-process-gone', {}, { type: 'GPU', reason: 'clean-exit' }); return E.logs.length === n; })());
  check('nunca cierra la app', E.exit === null);
}

console.log('\n=== 15. CLASE 4: error de operación ===');
{
  const E = entorno();
  const w = ventanaFalsa();
  E.api.reportarErrorDeOperacion(w, 'menú del proyecto: proyecto-eliminar', new Error('disco lleno'));
  check('registra la acción y el detalle', E.logs.some((l) => /Error de operación en "menú del proyecto: proyecto-eliminar".*disco lleno/s.test(l)), E.logs.join(' | '));
  check('muestra un modal en esa ventana', E.modales.length === 1 && E.modales[0].w === w);
  check('el texto dice que el resto sigue funcionando', /resto de la aplicación sigue funcionando/.test(E.modales[0].msg));
  check('NO marca el proceso como comprometido', E.api.procesoComprometido === false);
  check('NO cierra la app', E.exit === null);
  // dedupe
  E.api.reportarErrorDeOperacion(w, 'menú del proyecto: proyecto-eliminar', new Error('disco lleno'));
  check('el mismo error no vuelve a mostrarse', E.modales.length === 1, String(E.modales.length));
  check('pero sí se sigue registrando', E.logs.filter((l) => /Error de operación/.test(l)).length === 2);
  E.api.reportarErrorDeOperacion(w, 'menú del proyecto: proyecto-eliminar', new Error('otro motivo'));
  check('un error distinto sí se muestra', E.modales.length === 2);
}

console.log('\n=== 16. CLASE 4: sin ventana válida cae al diálogo nativo ===');
{
  const E = entorno();
  E.api.reportarErrorDeOperacion(ventanaFalsa({ destruida: true }), 'algo', new Error('x'));
  check('usa showErrorBox', E.errorBoxes.length === 1);
  check('no cierra la app', E.exit === null);
}

console.log('\n=== 17. Comprobaciones estáticas sobre main.js ===');
{
  const txt = SRC.join('\n');
  const guardas = [
    ["backup:save", /ipcMain\.handle\('backup:save'[\s\S]{0,300}?if \(procesoComprometido\) return false;/],
    ["meeting:savePrep", /ipcMain\.handle\('meeting:savePrep'[\s\S]{0,300}?if \(procesoComprometido\)/],
    ["meeting:updatePrep", /ipcMain\.handle\('meeting:updatePrep'[\s\S]{0,300}?if \(procesoComprometido\)/],
    ["candidateEval:save", /ipcMain\.handle\('candidateEval:save'[\s\S]{0,300}?if \(procesoComprometido\)/],
    ["projects:create", /ipcMain\.handle\('projects:create'[\s\S]{0,300}?if \(procesoComprometido\)/],
    ["projects:delete", /ipcMain\.handle\('projects:delete'[\s\S]{0,300}?if \(procesoComprometido\)/],
    ["projects:reorder", /ipcMain\.handle\('projects:reorder'[\s\S]{0,300}?if \(procesoComprometido\)/],
  ];
  guardas.forEach(([n, re]) => check('guarda de escritura en ' + n, re.test(txt)));
  check('setMeta guardado', /function setMeta\(key, value\) \{[\s\S]{0,200}?if \(procesoComprometido\) return;/.test(txt));
  check('deleteMeta guardado', /function deleteMeta\(key\) \{[\s\S]{0,200}?if \(procesoComprometido\) return;/.test(txt));
  check('setGlobalTheme guardado', /function setGlobalTheme\(themeKey\) \{[\s\S]{0,250}?if \(procesoComprometido\)/.test(txt));
  check('persistWindowBoundsOnClose guardado', /persistWindowBoundsOnClose[\s\S]{0,300}?if \(procesoComprometido\) return;/.test(txt));
  check("before-quit marca cerrandoApp", /app\.on\('before-quit', \(\) => \{[\s\S]{0,300}?cerrandoApp = true;/.test(txt));
  check('los handlers de menú delegan en un despachador', /return await despacharAccionLanzador\(win, action\);/.test(txt) && /return await despacharAccionProyecto\(win, projectId, action\);/.test(txt));
  check('y capturan con reportarErrorDeOperacion', (txt.match(/reportarErrorDeOperacion\(win, 'menú del/g) || []).length === 2);
  check('PS-1013/1014/1015 dados de alta en ERROR_CODES', /'PS-1013': \{/.test(txt) && /'PS-1014': \{/.test(txt) && /'PS-1015': \{/.test(txt));
}

console.log('\n==================================================');
console.log('  PRUEBAS B2: ' + pass + ' OK, ' + fail + ' FALLOS');
if (fallos.length) fallos.forEach((f) => console.log('    - ' + f.trim()));
console.log('==================================================');
process.exit(fail ? 1 : 0);
