// Pruebas de A2 (restauración todo-o-nada).
// Extrae de main.js el código REAL (attachFlushOnClose,
// writeLocalStorageDumpToPartition, runInPartition,
// readLocalStorageDumpFromPartition, saveRescueDump y restoreProjectBackup) y
// lo ejecuta contra dobles: la partición es un Map en memoria sobre el que se
// evalúan DE VERDAD los scripts de localStorage, y las ventanas emulan el
// close/preventDefault/closed de Electron. No toca datos del usuario.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const vm = require('vm');
const { EventEmitter } = require('events');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const SRC = fs.readFileSync(path.join(PROJ, 'main.js'), 'utf8').split(/\r?\n/);

let pass = 0, fail = 0; const fallos = [];
function check(name, cond, extra) {
  if (cond) { pass++; console.log('    OK   ' + name); }
  else { fail++; fallos.push(name); console.log('    FALLO ' + name + (extra ? ' -- ' + extra : '')); }
}

function extraer(firma) {
  const i = SRC.findIndex((l) => l.startsWith(firma));
  if (i < 0) throw new Error('no encontrada: ' + firma);
  let j = i + 1;
  while (j < SRC.length && SRC[j] !== '}') j++;
  return SRC.slice(i, j + 1).join('\n');
}
const BLOQUE = [
  extraer('function attachFlushOnClose(win, projectId) {'),
  extraer('function writeLocalStorageDumpToPartition(partitionName, dump, { clearFirst } = {}) {'),
  extraer('function runInPartition(partitionName, script) {'),
  extraer('function readLocalStorageDumpFromPartition(partitionName) {'),
  extraer('function saveRescueDump(row, previo) {'),
  SRC.find((l) => l.startsWith('const RESTORE_CLOSE_TIMEOUT_MS')),
  SRC.find((l) => l.startsWith('const restoreInProgress')),
  extraer('async function restoreProjectBackup(projectId, backupId) {'),
].join('\n\n');
console.log('Código real extraído de main.js: ' + BLOQUE.split('\n').length + ' líneas\n');

// ---------------------------------------------------------------- entorno
function nuevoEntorno() {
  const E = {
    particiones: new Map(),      // nombre -> Map(k,v)
    // fallarEnCicloClear: nº de ciclo clear()+escrituras en el que deben
    // fallar los setItem (1 = la escritura del estado nuevo, 2 = el rollback).
    // setItemSiempre: fallan todos, para el caso catastrófico.
    fallos: { fallarEnCicloClear: null, setItemSiempre: false, clearFalla: false, loadFileFalla: false },
    clearCount: 0,
    backupsEscritos: [],         // proyectos para los que se escribió un backup
    eventos: [],                 // traza ordenada
    projectWindows: new Map(),
    ventanas: [],
    logs: [],
    rekeyInProgress: false,
  };
  const store = (p) => { if (!E.particiones.has(p)) E.particiones.set(p, new Map()); return E.particiones.get(p); };
  E.store = store;

  const ipcMain = new EventEmitter();
  ipcMain.removeAllListeners = EventEmitter.prototype.removeAllListeners.bind(ipcMain);

  // --- ventana auxiliar (la que crea `new BrowserWindow` del código real) --
  class FakeHelperWindow {
    constructor(opts) {
      this.opts = opts; this.destroyed = false;
      this.particion = opts.webPreferences.partition;
      this.webContents = { executeJavaScript: (s) => this._exec(s) };
      E.eventos.push('helper:creada(' + this.particion + ')');
    }
    isDestroyed() { return this.destroyed; }
    close() { this.destroyed = true; E.eventos.push('helper:cerrada'); }
    loadFile() { return E.fallos.loadFileFalla ? Promise.reject(new Error('FALLO INYECTADO en loadFile')) : Promise.resolve(); }
    _exec(script) {
      const s = store(this.particion);
      const localStorage = {
        get length() { return s.size; },
        key(i) { return Array.from(s.keys())[i]; },
        getItem(k) { return s.has(k) ? s.get(k) : null; },
        setItem(k, v) {
          if (E.fallos.setItemSiempre) throw new Error('FALLO INYECTADO en setItem');
          if (E.fallos.fallarEnCicloClear === E.clearCount) throw new Error('FALLO INYECTADO en setItem');
          s.set(k, String(v));
        },
        clear() {
          if (E.fallos.clearFalla) throw new Error('FALLO INYECTADO en clear');
          E.clearCount++;
          E.eventos.push('particion:clear');
          s.clear();
        },
      };
      try {
        const ctx = vm.createContext({ localStorage, Object, JSON, String, Error });
        return Promise.resolve(vm.runInContext(script, ctx));
      } catch (e) { return Promise.reject(e); }
    }
  }

  // --- ventana de proyecto: emula close/preventDefault/closed de Electron --
  class FakeProjectWindow extends EventEmitter {
    constructor(id, projectId) {
      super(); this.id = id; this.projectId = projectId; this.destroyed = false;
      this.webContents = { send: (canal, arg) => this._recibe(canal, arg) };
    }
    isDestroyed() { return this.destroyed; }
    close() {
      if (this.destroyed) return;
      let prevented = false;
      this.emit('close', { preventDefault() { prevented = true; } });
      if (prevented) { E.eventos.push('ventana' + this.id + ':cierre-retenido'); return; }
      this.destroyed = true;
      E.eventos.push('ventana' + this.id + ':closed');
      this.emit('closed');
    }
    // el dashboard responde al guardado final
    _recibe(canal, ackChannel) {
      if (canal !== 'app:flushBeforeClose') return;
      E.eventos.push('ventana' + this.id + ':recibe-flushBeforeClose');
      setTimeout(() => {
        E.backupSave(this.projectId, 'closing');
        ipcMain.emit(ackChannel);
      }, 5);
    }
  }

  // réplica de la guarda REAL de backup:save (ver assert estático más abajo)
  E.backupSave = (projectId) => {
    if (E.rekeyInProgress) return false;
    if (ctx.restoreInProgress.has(projectId)) { E.eventos.push('backup:save RECHAZADO (restauracion en curso)'); return false; }
    E.backupsEscritos.push(projectId);
    E.eventos.push('backup:save ESCRITO para ' + projectId);
    return true;
  };

  let nextId = 1;
  function openProjectWindow(row) {
    if (E.projectWindows.has(row.id)) {
      const w = E.projectWindows.get(row.id);
      if (!w.isDestroyed()) return w;
    }
    const win = new FakeProjectWindow(nextId++, row.id);
    // MISMO manejador con comprobación de identidad que main.js
    win.on('closed', () => { if (E.projectWindows.get(row.id) === win) E.projectWindows.delete(row.id); });
    ctx.attachFlushOnClose(win, row.id);
    E.projectWindows.set(row.id, win);
    E.ventanas.push(win);
    E.eventos.push('ventana' + win.id + ':abierta');
    return win;
  }

  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'a2-'));
  const ctx = {
    require, console, Buffer, process, JSON, Date, Math, String, Number, Array, Object, Error, Set, Map, Promise, setTimeout, clearTimeout,
    fs, path,
    BrowserWindow: FakeHelperWindow,
    ipcMain,
    projectWindows: E.projectWindows,
    openProjectWindow,
    appLog: (l) => E.logs.push(l),
    errorCodeSuffix: (c) => ' [' + c + ']',
    FLUSH_BEFORE_CLOSE_TIMEOUT_MS: 4000,
    dbmod: {
      get(sql, p) {
        if (/FROM projects/.test(sql)) return E.proyecto && E.proyecto.id === p[0] ? E.proyecto : null;
        if (/FROM backups WHERE id=/.test(sql)) return E.backups.find((b) => b.id === p[0]) || null;
        if (/FROM backups WHERE project_id=/.test(sql)) return E.backups.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0] || null;
        return null;
      },
      all: () => [],
      run: () => null,
    },
    readBackupPayload: (row, bkRow) => { if (bkRow.corrupto) return '{esto no es json'; return bkRow.payload; },
    backupsDirForProject: () => { const d = path.join(TMP, 'backups'); fs.mkdirSync(d, { recursive: true }); return d; },
    encryptIfNeeded: (p) => p,
    securityKey: null,
    __dirname: path.join(PROJ),
  };
  ctx.global = ctx;
  vm.createContext(ctx);
  vm.runInContext(BLOQUE + '\nthis.__api = { restoreProjectBackup, readLocalStorageDumpFromPartition, writeLocalStorageDumpToPartition, attachFlushOnClose, restoreInProgress };', ctx);
  ctx.attachFlushOnClose = ctx.__api.attachFlushOnClose;
  ctx.restoreInProgress = ctx.__api.restoreInProgress;
  E.api = ctx.__api;
  E.abrir = openProjectWindow;
  E.TMP = TMP;
  E.FakeProjectWindow = FakeProjectWindow;
  return E;
}

function montar(E, contenidoActual, contenidoBackup) {
  E.proyecto = { id: 7, name: 'Proyecto 7', partition_name: 'persist:p7', backup_dir: '7-proyecto' };
  const s = E.store('persist:p7'); s.clear();
  Object.keys(contenidoActual).forEach((k) => s.set(k, contenidoActual[k]));
  E.backups = [{ id: 100, created_at: '2026-09-01T00:00:00Z', payload: JSON.stringify(contenidoBackup) }];
}
const ACTUAL = { 'panorama_servicio_ib__panorama-servicio-full__proj-7': '{"hitos":99,"marca":"ESTADO-ACTUAL"}', otra: 'x' };
const BACKUP = { 'panorama_servicio_ib__panorama-servicio-full__proj-7': '{"hitos":18,"marca":"DEL-BACKUP"}' };
const volcado = (E) => Object.fromEntries(E.store('persist:p7'));

(async () => {
  // ------------------------------------------------------------------
  console.log('=== 1. Restauración correcta ===');
  {
    const E = nuevoEntorno(); montar(E, ACTUAL, BACKUP);
    const w = E.abrir(E.proyecto);
    const r = await E.api.restoreProjectBackup(7, null);
    check('devuelve true', r === true);
    check('la partición tiene EXACTAMENTE el contenido del backup', JSON.stringify(volcado(E)) === JSON.stringify(BACKUP), JSON.stringify(volcado(E)));
    check('la ventana vieja está destruida', w.isDestroyed());
    check('hay una ventana nueva registrada', E.projectWindows.get(7) && E.projectWindows.get(7) !== w);
    check('NO se escribió ningún backup del estado descartado', E.backupsEscritos.length === 0, JSON.stringify(E.eventos));
    check('el guardado final ni se pidió', !E.eventos.some((x) => x.includes('recibe-flushBeforeClose')));
  }

  // ------------------------------------------------------------------
  console.log('\n=== 2. Restaurar dos veces seguidas ===');
  {
    const E = nuevoEntorno(); montar(E, ACTUAL, BACKUP);
    E.abrir(E.proyecto);
    await E.api.restoreProjectBackup(7, null);
    const tras1 = JSON.stringify(volcado(E));
    await E.api.restoreProjectBackup(7, null);
    const tras2 = JSON.stringify(volcado(E));
    check('la 1a restauración deja el contenido del backup', tras1 === JSON.stringify(BACKUP));
    check('la 2a restauración deja EL MISMO contenido (no el descartado)', tras2 === tras1, tras2);
    check('sigue sin escribirse ningún backup espurio', E.backupsEscritos.length === 0);
  }

  // ------------------------------------------------------------------
  console.log('\n=== 3. Fallo ANTES de tocar la partición (backup corrupto) ===');
  {
    const E = nuevoEntorno(); montar(E, ACTUAL, BACKUP);
    E.backups[0].corrupto = true;
    const w = E.abrir(E.proyecto);
    const antes = JSON.stringify(volcado(E));
    let err = null;
    try { await E.api.restoreProjectBackup(7, null); } catch (e) { err = e; }
    check('lanza', err !== null);
    check('la partición NO se ha tocado', JSON.stringify(volcado(E)) === antes);
    check('la ventana sigue abierta y registrada', !w.isDestroyed() && E.projectWindows.get(7) === w);
    check('no se creó ninguna ventana auxiliar', !E.eventos.some((x) => x.startsWith('helper:creada')));
    check('la marca de restauración quedó liberada', !E.api.restoreInProgress.has(7));
  }

  // ------------------------------------------------------------------
  console.log('\n=== 4. Fallo DESPUÉS del clear(), escribiendo el nuevo estado -> ROLLBACK ===');
  {
    const E = nuevoEntorno(); montar(E, ACTUAL, BACKUP);
    const w = E.abrir(E.proyecto);
    const antes = JSON.stringify(volcado(E));
    // Falla la escritura del estado NUEVO (ciclo 1, el clear ya se ha hecho),
    // pero el rollback (ciclo 2) sí puede escribir.
    E.fallos.fallarEnCicloClear = 1;
    let err = null;
    try { await E.api.restoreProjectBackup(7, null); } catch (e) { err = e; }
    E.fallos.fallarEnCicloClear = null;
    check('lanza', err !== null);
    check('el mensaje dice que se dejó como estaba', /exactamente como estaba/.test(err.message), err && err.message);
    check('ROLLBACK: la partición vuelve al estado ORIGINAL', JSON.stringify(volcado(E)) === antes, JSON.stringify(volcado(E)));
    check('se hizo el clear (o sea, se llegó a tocar) y se repuso', E.eventos.filter((x) => x === 'particion:clear').length === 2);
    check('la ventana se reabre', E.projectWindows.get(7) && !E.projectWindows.get(7).isDestroyed());
    check('la ventana reabierta NO es la vieja', E.projectWindows.get(7) !== w);
    check('queda constancia en app.log', E.logs.some((l) => /devuelto a su estado anterior/.test(l)), E.logs.join(' | '));
    check('la marca quedó liberada', !E.api.restoreInProgress.has(7));
  }

  // ------------------------------------------------------------------
  console.log('\n=== 5. Falla la escritura Y falla el rollback -> PS-2005, sin reintentos ===');
  {
    const E = nuevoEntorno(); montar(E, ACTUAL, BACKUP);
    E.abrir(E.proyecto);
    E.fallos.setItemSiempre = true; // falla la escritura Y también el rollback
    let err = null;
    try { await E.api.restoreProjectBackup(7, null); } catch (e) { err = e; }
    E.fallos.setItemSiempre = false;
    check('lanza', err !== null);
    if (!err) { console.log('    (sin excepción, se saltan las comprobaciones dependientes)'); }
    else {
    check('el mensaje avisa de que tampoco se pudo deshacer', /tampoco se pudo dejar el proyecto como estaba/.test(err.message));
    check('lleva el código PS-2005', /PS-2005/.test(err.message), err && err.message);
    check('dice que los backups siguen intactos', /backups siguen intactos/.test(err.message));
    check('registra PS-2005 en app.log', E.logs.some((l) => /PS-2005/.test(l)), E.logs.join(' | '));
    const rescates = fs.existsSync(path.join(E.TMP, 'backups')) ? fs.readdirSync(path.join(E.TMP, 'backups')).filter((f) => f.startsWith('rescate-restauracion-')) : [];
    check('se escribió la copia de rescate del estado anterior', rescates.length === 1, JSON.stringify(rescates));
    if (rescates.length === 1) {
      const cont = JSON.parse(fs.readFileSync(path.join(E.TMP, 'backups', rescates[0]), 'utf8'));
      check('la copia de rescate contiene el estado ORIGINAL completo', JSON.stringify(cont) === JSON.stringify(ACTUAL), JSON.stringify(cont));
    }
    check('NO se reabre la ventana (estado incierto)', !E.projectWindows.get(7));
    check('no se reintentó nada más', E.eventos.filter((x) => x === 'particion:clear').length === 2);
    }
  }

  // ------------------------------------------------------------------
  console.log('\n=== 6. Timeout de cierre de la ventana vieja ===');
  {
    const E = nuevoEntorno(); montar(E, ACTUAL, BACKUP);
    const w = E.abrir(E.proyecto);
    const antes = JSON.stringify(volcado(E));
    w.close = () => { E.eventos.push('ventana' + w.id + ':close IGNORADO (simula ventana colgada)'); }; // nunca emite 'closed'
    let err = null;
    const t0 = Date.now();
    try { await E.api.restoreProjectBackup(7, null); } catch (e) { err = e; }
    const ms = Date.now() - t0;
    check('lanza tras el tope', err !== null);
    check('el mensaje dice que no se tocó nada', /No se ha tocado nada/.test(err.message), err && err.message);
    check('tardó ~8 s (el tope)', ms >= 7500 && ms <= 10000, ms + ' ms');
    check('la partición está intacta', JSON.stringify(volcado(E)) === antes);
    check('no se creó ninguna ventana auxiliar', !E.eventos.some((x) => x.startsWith('helper:creada')));
    check('la ventana sigue registrada en el mapa', E.projectWindows.get(7) === w);
    check('se retiró la marca de cierre-por-restauración', w.__panoramaClosingForRestore === false);
    check('la marca de restauración quedó liberada', !E.api.restoreInProgress.has(7));
  }

  // ------------------------------------------------------------------
  console.log('\n=== 7. Nunca conviven operativamente ventana vieja y nueva ===');
  {
    const E = nuevoEntorno(); montar(E, ACTUAL, BACKUP);
    E.abrir(E.proyecto);
    await E.api.restoreProjectBackup(7, null);
    const iClosed = E.eventos.findIndex((x) => /^ventana1:closed$/.test(x));
    const iHelper = E.eventos.findIndex((x) => x.startsWith('helper:creada'));
    const iNueva = E.eventos.findIndex((x) => /^ventana2:abierta$/.test(x));
    check('la ventana vieja se cierra ANTES de tocar la partición', iClosed >= 0 && iHelper >= 0 && iClosed < iHelper, 'closed=' + iClosed + ' helper=' + iHelper);
    check('la ventana nueva se abre DESPUÉS de escribir la partición', iNueva > iHelper, 'nueva=' + iNueva);
    check('orden completo correcto', iClosed < iHelper && iHelper < iNueva, E.eventos.join(' > '));
  }

  // ------------------------------------------------------------------
  console.log('\n=== 8. Una ventana vieja no puede desregistrar a la nueva ===');
  {
    const E = nuevoEntorno(); montar(E, ACTUAL, BACKUP);
    const vieja = E.abrir(E.proyecto);
    // se fuerza el escenario: la nueva se registra mientras la vieja sigue viva
    E.projectWindows.delete(7);
    const nueva = E.abrir(E.proyecto);
    check('el mapa apunta a la nueva', E.projectWindows.get(7) === nueva);
    vieja.close(); // cierre normal: queda retenido por el guardado final
    await new Promise((r) => setTimeout(r, 120));
    check('la vieja ha terminado de cerrarse', vieja.isDestroyed());
    check('tras cerrarse la vieja, el mapa SIGUE apuntando a la nueva', E.projectWindows.get(7) === nueva);
    nueva.close();
    await new Promise((r) => setTimeout(r, 120));
    check('al cerrarse la nueva, sí se desregistra', !E.projectWindows.has(7));
  }

  // ------------------------------------------------------------------
  console.log('\n=== 9. REGRESIÓN: cierre normal sigue haciendo su guardado final ===');
  {
    const E = nuevoEntorno(); montar(E, ACTUAL, BACKUP);
    const w = E.abrir(E.proyecto);
    w.close(); // cierre normal, sin restauración
    check('el cierre se RETIENE (preventDefault)', E.eventos.some((x) => x.includes('cierre-retenido')));
    check('se pide el guardado final', E.eventos.some((x) => x.includes('recibe-flushBeforeClose')));
    await new Promise((r) => setTimeout(r, 60));
    check('el backup final SÍ se escribe', E.backupsEscritos.length === 1, JSON.stringify(E.eventos));
    check('la ventana acaba cerrada', w.isDestroyed());
    check('y se desregistra', !E.projectWindows.has(7));
  }

  // ------------------------------------------------------------------
  console.log('\n=== 10. Dos restauraciones concurrentes del mismo proyecto ===');
  {
    const E = nuevoEntorno(); montar(E, ACTUAL, BACKUP);
    E.abrir(E.proyecto);
    const p1 = E.api.restoreProjectBackup(7, null);
    let err2 = null;
    try { await E.api.restoreProjectBackup(7, null); } catch (e) { err2 = e; }
    await p1;
    check('la segunda se rechaza', err2 !== null);
    check('con un mensaje claro', /Ya hay una restauración en curso/.test(err2.message), err2 && err2.message);
    check('la primera termina bien', JSON.stringify(volcado(E)) === JSON.stringify(BACKUP));
  }

  // ------------------------------------------------------------------
  console.log('\n=== 11. Restaurar con la ventana CERRADA (desde la tarjeta del lanzador) ===');
  {
    const E = nuevoEntorno(); montar(E, ACTUAL, BACKUP);
    const r = await E.api.restoreProjectBackup(7, null); // sin abrir ventana antes
    check('devuelve true', r === true);
    check('la partición tiene el contenido del backup', JSON.stringify(volcado(E)) === JSON.stringify(BACKUP));
    check('abre la ventana del proyecto', !!E.projectWindows.get(7));
  }

  // ------------------------------------------------------------------
  console.log('\n=== 12. Comprobaciones estáticas sobre main.js ===');
  {
    const txt = SRC.join('\n');
    const iHandler = txt.indexOf("ipcMain.handle('backup:save'");
    const trozo = txt.slice(iHandler, iHandler + 4000);
    check('backup:save lleva la guarda de restoreInProgress', /if \(restoreInProgress\.has\(projectId\)\) return false;/.test(trozo));
    const iGuarda = trozo.indexOf('restoreInProgress.has(projectId)');
    const iEscritura = trozo.indexOf('fs.writeFileSync');
    check('...y ANTES de escribir cualquier archivo', iGuarda >= 0 && iEscritura > iGuarda, 'guarda=' + iGuarda + ' escritura=' + iEscritura);
    check('attachFlushOnClose respeta __panoramaClosingForRestore', /if \(win\.__panoramaClosingForRestore\) return;/.test(txt));
    check("el 'closed' de openProjectWindow compara identidad", /if \(projectWindows\.get\(row\.id\) === win\) projectWindows\.delete\(row\.id\);/.test(txt));
    check('writeLocalStorageDumpToPartition sigue existiendo sin cambios de firma', /function writeLocalStorageDumpToPartition\(partitionName, dump, \{ clearFirst \} = \{\}\)/.test(txt));
    check('seedNewProjectStorage la sigue usando', /seedNewProjectStorage[\s\S]{0,600}writeLocalStorageDumpToPartition/.test(txt));
    check('PS-2005 dado de alta en ERROR_CODES', /'PS-2005': \{/.test(txt));
  }

  console.log('\n==================================================');
  console.log('  PRUEBAS A2: ' + pass + ' OK, ' + fail + ' FALLOS');
  if (fallos.length) fallos.forEach((f) => console.log('    - ' + f.trim()));
  console.log('==================================================');
  process.exit(fail ? 1 : 0);
})();
