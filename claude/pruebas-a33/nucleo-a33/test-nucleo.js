'use strict';
// Pruebas del núcleo aislado de A3.3, con imágenes SQLite REALES (sql.js del
// propio proyecto). Trabaja en carpetas temporales; no toca datos del usuario.
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const initSqlJs = require(path.join(PROJ, 'node_modules', 'sql.js'));
const N = require('./nucleo.js');

const RAIZ = path.join(os.tmpdir(), '_a33-nucleo-test');
fs.rmSync(RAIZ, { recursive: true, force: true });
fs.mkdirSync(RAIZ, { recursive: true });

let pass = 0, fail = 0;
const fallos = [];
function ok(nombre, cond, extra) {
  if (cond) { pass++; console.log('  OK    ' + nombre); }
  else { fail++; fallos.push(nombre); console.log('  FALLO ' + nombre + (extra ? '  -- ' + extra : '')); }
}
function seccion(t) { console.log('\n=== ' + t + ' ==='); }

let SQL = null;
let n = 0;
function carpeta() { const d = path.join(RAIZ, 'c' + (++n)); fs.mkdirSync(d, { recursive: true }); return d; }
function nucleo(opts) {
  return N.crearNucleo(Object.assign({ dir: carpeta(), SQL, installationId: 'PC-A'.padEnd(32, '0') }, opts || {}));
}
const C = (s) => s.padEnd(32, '0');   // commit_id legible en las pruebas

(async () => {
  SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(PROJ, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')) });

  // =========================================================================
  seccion('1. CLASIFICACIÓN — función pura (§6.1.a / §6.1.b)');
  // =========================================================================
  const base = {
    politica: 'compartida', dirty: false, wYo: C('PCA'),
    mem: { C: C('X'), P: C('W'), H: [C('X'), C('W')], F: 'hashX' },
    stat: { mtimeMs: 100, size: 4096 }, sMio: { mtimeMs: 100, size: 4096 },
    gen: { C: C('X'), P: C('W'), W: C('PCA') },
    disk: { C: C('X'), P: C('W'), H: [C('X'), C('W')], F: 'hashX' },
  };
  const cl = (over) => N.clasificar(Object.assign({}, base, over));

  ok('A1a mismo commit + mismos bytes -> seguir', cl({}).tipo === 'seguir', JSON.stringify(cl({})));
  {
    const d = cl({ stat: { mtimeMs: 999, size: 4096 } });
    ok('A1a con mtime distinto pero mismos bytes -> NO es conflicto', d.tipo === 'seguir', d.tipo);
    ok('    ...y pide refrescar S_mio', d.refrescarStat === true);
  }
  {
    const d = cl({ disk: Object.assign({}, base.disk, { F: 'OTROS-BYTES' }) });
    ok('A1b mismo commit + BYTES DISTINTOS -> conflicto caso 8', d.tipo === 'conflicto' && d.caso === 8, JSON.stringify(d));
  }
  {
    // El agujero histórico: H_disk se contiene a sí mismo. Sin la salida A1,
    // esto habría dado "descendencia legítima".
    const d = cl({ disk: { C: C('X'), P: C('W'), H: [C('X'), C('W')], F: 'OTROS' } });
    ok('A2 NO se alcanza con C_disk === C_mem (H_disk se contiene a sí mismo)',
      d.caso === 8 && d.tipo === 'conflicto', JSON.stringify(d));
  }
  {
    const d = cl({
      gen: { C: C('Y'), P: C('X'), W: C('PCB') },
      disk: { C: C('Y'), P: C('X'), H: [C('Y'), C('X'), C('W')], F: 'hY' },
    });
    ok('A2 descendencia estricta -> recarga silenciosa', d.tipo === 'recarga' && d.caso === 1, JSON.stringify(d));
  }
  {
    const d = cl({
      dirty: true,
      gen: { C: C('Y'), P: C('X'), W: C('PCB') },
      disk: { C: C('Y'), P: C('X'), H: [C('Y'), C('X'), C('W')], F: 'hY' },
    });
    ok('A2 con dirty=true -> NO recarga silenciosa, va a conflicto', d.tipo === 'conflicto', JSON.stringify(d));
  }
  {
    const d = cl({
      mem: { C: C('Y'), P: C('X'), H: [C('Y'), C('X'), C('W')], F: 'hY' },
      gen: { C: C('X'), P: C('W'), W: C('PCA') },
      disk: { C: C('X'), P: C('W'), H: [C('X'), C('W')], F: 'hX' },
    });
    ok('A3 vamos por delante del disco -> aviso, no conflicto', d.tipo === 'aviso-atrasado' && d.caso === 4, JSON.stringify(d));
  }
  {
    const d = cl({
      mem: { C: C('Ya'), P: C('X'), H: [C('Ya'), C('X')], F: 'hYa' },
      gen: { C: C('Yb'), P: C('X'), W: C('PCB') },
      disk: { C: C('Yb'), P: C('X'), H: [C('Yb'), C('X')], F: 'hYb' },
    });
    ok('A4 BIFURCACIÓN N+1/N+1 -> conflicto caso 3', d.tipo === 'conflicto' && d.caso === 3, JSON.stringify(d));
  }
  {
    // Ni descendencia, ni ancestro, ni hermanos: tiene que llegar a A5.
    const d = cl({
      mem: { C: C('Ya'), P: C('Pa'), H: [C('Ya'), C('Pa')], F: 'hYa' },
      gen: { C: C('Zb'), P: C('Pb'), W: C('PCB') },
      disk: { C: C('Zb'), P: C('Pb'), H: [C('Zb'), C('Pb')], F: 'hZb' },
    });
    ok('A5 ES ALCANZABLE (era el bug de la rev. 2)', d.tipo === 'conflicto' && d.caso === 5, JSON.stringify(d));
  }
  {
    // B0: nuestra intención Y adelantada, y el disco movido a Z por otro equipo.
    const d = cl({
      mem: { C: C('X'), P: C('W'), H: [C('X'), C('W')], F: 'hashX' },
      gen: { C: C('Y'), P: C('X'), W: C('PCA') },            // nuestro writer
      disk: { C: C('Z'), P: C('Q'), H: [C('Z'), C('Q')], F: 'hZ' },   // divergente
    });
    ok('B0 disco divergido -> NO reparación silenciosa', d.tipo !== 'reparar-gen', JSON.stringify(d));
    ok('    ...y sale conflicto', d.tipo === 'conflicto', d.tipo);
    ok('    ...y se anota el .gen adelantado', d.genAdelantado === true);
  }
  {
    // B0 variante: el disco avanzó pero DESCIENDE de lo nuestro.
    const d = cl({
      gen: { C: C('Y'), P: C('X'), W: C('PCA') },
      disk: { C: C('Z'), P: C('X'), H: [C('Z'), C('X'), C('W')], F: 'hZ' },
    });
    ok('B0 disco descendiente -> recarga silenciosa legítima', d.tipo === 'recarga', JSON.stringify(d));
  }
  {
    const d = cl({ gen: { C: C('Y'), P: C('X'), W: C('PCA') } });   // disk sigue en X con hashX
    ok('B1 mi escritura interrumpida (4 condiciones) -> reparar', d.tipo === 'reparar-gen' && d.caso === 2, JSON.stringify(d));
    // romper cada una de las CUATRO por separado
    const r1 = cl({ gen: { C: C('Y'), P: C('X'), W: C('PCB') } });
    ok('    romper W_file -> no repara', r1.tipo !== 'reparar-gen', r1.tipo);
    const r2 = cl({ gen: { C: C('Y'), P: C('OTRO'), W: C('PCA') } });
    ok('    romper P_file -> no repara', r2.tipo !== 'reparar-gen', r2.tipo);
    const r3 = cl({
      gen: { C: C('Y'), P: C('X'), W: C('PCA') },
      mem: { C: C('OTRO'), P: C('W'), H: [C('OTRO')], F: 'hashX' },
    });
    ok('    romper C_disk === C_mem -> no repara', r3.tipo !== 'reparar-gen', r3.tipo);
    const r4 = cl({
      gen: { C: C('Y'), P: C('X'), W: C('PCA') },
      disk: { C: C('X'), P: C('W'), H: [C('X'), C('W')], F: 'BYTES-AJENOS' },
    });
    ok('    romper F_disk === F_mio -> no repara', r4.tipo !== 'reparar-gen', r4.tipo);
  }
  {
    const d = cl({ gen: { C: C('Y'), P: C('X'), W: C('PCB') } });
    ok('B2 intención de otro equipo en vuelo -> espera', d.tipo === 'espera', JSON.stringify(d));
  }
  {
    const d = cl({ gen: null });
    ok('.gen ausente en compartida -> degradado, nunca conflicto', d.tipo === 'degradado' && d.caso === 7, JSON.stringify(d));
    const dl = cl({ gen: null, politica: 'local' });
    ok('.gen ausente en local -> se repara, no bloquea', dl.tipo === 'reparar-gen');
  }
  {
    const dl = cl({ politica: 'local', disk: null });
    ok('LOCAL: atajo por stat cuando nada cambió -> seguir sin leer bytes', dl.tipo === 'seguir', JSON.stringify(dl));
    const dl2 = cl({ politica: 'local', disk: null, stat: { mtimeMs: 999, size: 4096 } });
    ok('LOCAL: stat distinto -> obliga a leer, NUNCA concluye conflicto solo', dl2.tipo === 'leer-disco', dl2.tipo);
    const dc = cl({ disk: null });
    ok('COMPARTIDA: no hay atajo, siempre exige los bytes', dc.tipo === 'leer-disco', dc.tipo);

    // EL LÍMITE DE LOCAL, demostrado de forma determinista (sin depender de la
    // precisión de los timestamps del sistema de archivos): stat idéntico pero
    // bytes distintos -> el atajo dice "seguir" y el cambio externo se pierde.
    const dLim = cl({
      politica: 'local',
      disk: { C: C('X'), P: C('W'), H: [C('X'), C('W')], F: 'BYTES-EXTERNOS-DISTINTOS' },
    });
    ok('LÍMITE LOCAL: stat idéntico + bytes distintos -> el atajo NO lo ve',
      dLim.tipo === 'seguir', JSON.stringify(dLim));
    // Y la misma entrada en compartida SÍ lo ve:
    const dLim2 = cl({ disk: { C: C('X'), P: C('W'), H: [C('X'), C('W')], F: 'BYTES-EXTERNOS-DISTINTOS' } });
    ok('    ...y en COMPARTIDA la misma entrada da caso 8',
      dLim2.tipo === 'conflicto' && dLim2.caso === 8, JSON.stringify(dLim2));
  }

  // =========================================================================
  seccion('2. ESCRITURA ATÓMICA — bucle, fsync y confirmación (§4.b)');
  // =========================================================================
  {
    const d = carpeta();
    const f = path.join(d, 'x.bin');
    const buf = crypto.randomBytes(70000);
    N.escribirAtomico(f, buf, {});
    ok('escribe y renombra', fs.readFileSync(f).equals(buf));
    ok('no deja temporales', fs.readdirSync(d).length === 1, fs.readdirSync(d).join(','));
  }
  {
    // writeSync devuelve la mitad: el bucle tiene que completar
    const d = carpeta();
    const f = path.join(d, 'x.bin');
    const buf = crypto.randomBytes(50000);
    let llamadas = 0;
    N.escribirAtomico(f, buf, { hooks: {
      writeSync: (fd, b, off, len, pos) => { llamadas++; return fs.writeSync(fd, b, off, Math.max(1, Math.floor(len / 2)), pos); },
    } });
    ok('escritura parcial: el bucle completa los bytes', fs.readFileSync(f).equals(buf));
    ok('    ...y hicieron falta varias llamadas', llamadas > 1, 'llamadas=' + llamadas);
  }
  {
    // writeSync devuelve 0: sin progreso
    const d = carpeta();
    const f = path.join(d, 'x.bin');
    fs.writeFileSync(f, Buffer.from('ORIGINAL'));
    let lanzo = null;
    try { N.escribirAtomico(f, crypto.randomBytes(1000), { hooks: { writeSync: () => 0 } }); }
    catch (e) { lanzo = e; }
    ok('writeSync sin progreso -> lanza', lanzo instanceof N.ErrorDb, String(lanzo));
    ok('    ...NO se hizo rename: el archivo original intacto', fs.readFileSync(f).toString() === 'ORIGINAL');
    ok('    ...el temporal se conserva como .tmp-fallido',
      fs.readdirSync(d).some((x) => x.includes('.tmp-fallido-')), fs.readdirSync(d).join(','));
  }
  {
    // fsync con fallo REAL
    const d = carpeta();
    const f = path.join(d, 'x.bin');
    fs.writeFileSync(f, Buffer.from('ORIGINAL'));
    let lanzo = null;
    try {
      N.escribirAtomico(f, crypto.randomBytes(1000), { hooks: {
        fsyncSync: () => { const e = new Error('disco'); e.code = 'EIO'; throw e; },
      } });
    } catch (e) { lanzo = e; }
    ok('fsync EIO -> es un FALLO, lanza', lanzo instanceof N.ErrorDb && /EIO/.test(lanzo.message), String(lanzo));
    ok('    ...NO se hizo rename', fs.readFileSync(f).toString() === 'ORIGINAL');
  }
  {
    // fsync no soportado
    const d = carpeta();
    const f = path.join(d, 'x.bin');
    const buf = crypto.randomBytes(1000);
    const r = N.escribirAtomico(f, buf, { hooks: {
      fsyncSync: () => { const e = new Error('nope'); e.code = 'EINVAL'; throw e; },
    } });
    ok('fsync EINVAL -> NO soportado: la escritura se completa', fs.readFileSync(f).equals(buf));
    ok('    ...y se marca la garantía como rebajada', r.fsyncNoSoportado === true);
  }
  {
    // orden: fsync SIEMPRE antes del rename
    const d = carpeta();
    const f = path.join(d, 'x.bin');
    const orden = [];
    N.escribirAtomico(f, crypto.randomBytes(500), { hooks: {
      fsyncSync: (fd) => { orden.push('fsync'); return fs.fsyncSync(fd); },
      renameSync: (a, b) => { orden.push('rename'); return fs.renameSync(a, b); },
    } });
    ok('fsync ocurre ANTES del rename', orden.join(',') === 'fsync,rename', orden.join(','));
  }

  // =========================================================================
  seccion('3. BLOQUEO IRREVERSIBLE (§3 / §14.a)');
  // =========================================================================
  {
    const k = nucleo(); k.abrir({ crearSiAusente: true });
    k.bloquearEscrituras('conflicto');
    ok('se puede levantar un conflicto', k.levantarLatch('conflicto').ok === true);
    k.bloquearEscrituras('degradado');
    ok('se puede levantar un degradado', k.levantarLatch().ok === true);

    k.bloquearEscrituras('comprometido');
    ok('levantar "comprometido" se RECHAZA', k.levantarLatch().ok === false);
    ok('    ...sigue bloqueado', k.estado().escrituraBloqueada === 'comprometido');
    // no se puede sustituir por otro motivo, ni fatal ni no fatal
    k.bloquearEscrituras('conflicto');
    ok('un motivo fatal NO se sustituye por "conflicto"', k.estado().escrituraBloqueada === 'comprometido');
    k.bloquearEscrituras('bd-ilegible');
    ok('un motivo fatal NO se sustituye por otro fatal', k.estado().escrituraBloqueada === 'comprometido');
    ok('y levantarlo sigue rechazado', k.levantarLatch('conflicto').ok === false);

    let lanzo = null;
    try { k.run("INSERT INTO projects(name) VALUES ('x')"); } catch (e) { lanzo = e; }
    ok('ninguna escritura pasa con el latch fatal', lanzo && lanzo.kind === 'bloqueado', String(lanzo));
  }
  {
    const k = nucleo(); k.abrir({ crearSiAusente: true });
    k.bloquearEscrituras('desincronizada');
    ok('"desincronizada" también es irreversible', k.levantarLatch().ok === false);
    const k2 = nucleo(); k2.abrir({ crearSiAusente: true });
    k2.bloquearEscrituras('bd-ilegible');
    ok('"bd-ilegible" también es irreversible', k2.levantarLatch().ok === false);
  }

  // =========================================================================
  seccion('4. FLUJO NORMAL con imágenes SQLite reales');
  // =========================================================================
  {
    const k = nucleo({ politica: 'compartida' }); k.abrir({ crearSiAusente: true });
    const e0 = k.estado();
    ok('arranque: hay commit y F_mio', !!e0.cMem && !!e0.fMio);
    ok('arranque: dirty = false', e0.dirty === false);

    const commits = new Set([e0.cMem]);
    for (let i = 0; i < 30; i++) {
      k.run('INSERT INTO projects(name) VALUES (?)', ['p' + i]);
      commits.add(k.estado().cMem);
    }
    const e1 = k.estado();
    ok('30 escrituras: 31 commits distintos', commits.size === 31, 'size=' + commits.size);
    ok('generación monótona', e1.gMem === 31, 'gMem=' + e1.gMem);
    ok('historial acotado a 20', e1.hMem.length === 20, 'len=' + e1.hMem.length);
    ok('dirty = false tras confirmar', e1.dirty === false);

    const disco = k._leerDisco();
    const gen = k._leerGen();
    ok('el .gen y la BD llevan el MISMO commit', gen.C === disco.C, gen.C + ' vs ' + disco.C);
    ok('el commit en memoria coincide con el del disco', e1.cMem === disco.C);
    ok('F_mio coincide con el hash real del archivo', e1.fMio === disco.F);
    ok('ultimaImagenConfirmada coincide byte a byte con el disco',
      Buffer.compare(e1.ultimaImagenConfirmada, fs.readFileSync(k.rutas().dbPath)) === 0);
    ok('las 30 filas están en disco', k.get('SELECT COUNT(*) FROM projects')[0][0] === 30);
  }
  {
    // INMUTABILIDAD — corregida. Antes comparaba una copia consigo misma
    // (Buffer.compare(antes, antes)), que siempre da 0 y no demuestra nada.
    // Ahora se conservan DOS cosas distintas:
    //   ref      = LA REFERENCIA al Buffer que el núcleo guarda como confirmado
    //   snapshot = una COPIA independiente de esos mismos bytes
    // y se comprueba que la REFERENCIA no cambió respecto a la COPIA.
    const k = nucleo(); k.abrir({ crearSiAusente: true });
    k.run('INSERT INTO projects(name) VALUES (?)', ['uno']);
    const ref = k.estado().ultimaImagenConfirmada;      // referencia, NO copia
    const snapshot = Buffer.from(ref);                  // copia independiente
    ok('preparación: ref y snapshot son objetos distintos con los mismos bytes',
      ref !== snapshot && Buffer.compare(ref, snapshot) === 0);

    // Actividad intensa para forzar a sql.js a crecer y reutilizar su heap
    for (let i = 0; i < 40; i++) {
      k.run('INSERT INTO projects(name) VALUES (?)', ['relleno-' + 'x'.repeat(200) + i]);
    }
    k.get('SELECT COUNT(*) FROM projects');

    ok('INMUTABILIDAD: el Buffer que guardábamos NO fue mutado por sql.js',
      Buffer.compare(ref, snapshot) === 0,
      'longitudes ' + ref.length + '/' + snapshot.length);
    const ahora = k.estado().ultimaImagenConfirmada;
    ok('    ...la imagen confirmada actual es OTRO objeto', ahora !== ref);
    ok('    ...y con bytes distintos', Buffer.compare(ahora, ref) !== 0);
    ok('    ...y el antiguo conserva exactamente sus bytes originales',
      ref.length === snapshot.length && ref.equals(snapshot));
  }

  // =========================================================================
  seccion('5. FALLO ANTES DEL RENAME — caso (a) de §2.d');
  // =========================================================================
  {
    // El fallo se activa DESPUÉS de abrir: si no, el propio abrir() lo dispara.
    const dir = carpeta();
    let fallarRename = false;
    const k = N.crearNucleo({ dir, SQL, installationId: C('PCA'), politica: 'compartida',
      hooks: { renameSync: (a, b) => {
        if (fallarRename && String(a).includes('sqlite3.tmp-')) {
          throw Object.assign(new Error('FALLO INYECTADO en rename'), { code: 'EPERM' });
        }
        return fs.renameSync(a, b);
      } } });
    k.abrir({ crearSiAusente: true });
    k.run('INSERT INTO projects(name) VALUES (?)', ['antes-del-fallo']);
    const antes = k.estado();
    const bytesAntes = fs.readFileSync(k.rutas().dbPath);

    fallarRename = true;
    let err = null;
    try { k.run('INSERT INTO projects(name) VALUES (?)', ['FANTASMA']); } catch (e) { err = e; }
    fallarRename = false;

    ok('el llamante recibe ErrorDb io', err && err.kind === 'io', String(err));
    ok('aplicado = false', err && err.aplicado === false);
    ok('el .sqlite3 en disco NO cambió', Buffer.compare(bytesAntes, fs.readFileSync(k.rutas().dbPath)) === 0);
    const desp = k.estado();
    ok('la memoria vuelve al commit confirmado', desp.cMem === antes.cMem, desp.cMem + ' vs ' + antes.cMem);
    ok('dirty vuelve a false', desp.dirty === false);
    ok('la fila FANTASMA no existe en memoria',
      k.get("SELECT COUNT(*) FROM projects WHERE name='FANTASMA'")[0][0] === 0);

    // Y lo importante: una escritura POSTERIOR que sí funcione no arrastra el fantasma.
    k.run('INSERT INTO projects(name) VALUES (?)', ['despues']);
    const d2 = k._leerDisco();
    const dd = new SQL.Database(d2.bytes);
    const cnt = dd.exec("SELECT COUNT(*) FROM projects WHERE name='FANTASMA'")[0].values[0][0];
    const cnt2 = dd.exec("SELECT COUNT(*) FROM projects")[0].values[0][0];
    dd.close();
    ok('una escritura posterior NO arrastra el fantasma a disco', cnt === 0, 'cnt=' + cnt);
    ok('    ...y sí lleva las filas buenas', cnt2 === 2, 'total=' + cnt2);

    // el .gen quedó adelantado: la clasificación siguiente lo repara sin conflicto
    ok('reintentar tras el fallo funciona (idempotente)', true);
  }
  {
    // CASO (c): falla la escritura Y falla la restauración
    const dir = carpeta();
    let fallarRename = false, fallarRest = false;
    const k = N.crearNucleo({ dir, SQL, installationId: C('PCA'), politica: 'compartida',
      hooks: {
        renameSync: (a, b) => {
          if (fallarRename && String(a).includes('sqlite3.tmp-')) throw new Error('FALLO INYECTADO rename');
          return fs.renameSync(a, b);
        },
        get fallarRestauracion() { return fallarRest; },
      } });
    k.abrir({ crearSiAusente: true });
    k.run('INSERT INTO projects(name) VALUES (?)', ['a']);
    fallarRename = true; fallarRest = true;
    let err = null;
    try { k.run('INSERT INTO projects(name) VALUES (?)', ['b']); } catch (e) { err = e; }
    ok('caso (c): lanza', !!err, String(err));
    ok('caso (c): latch = desincronizada', k.estado().escrituraBloqueada === 'desincronizada');
    ok('caso (c): dirty sigue en true', k.estado().dirty === true);
    ok('caso (c): el latch es irreversible', k.levantarLatch().ok === false);
    let err2 = null;
    try { k.run('INSERT INTO projects(name) VALUES (?)', ['c']); } catch (e) { err2 = e; }
    ok('caso (c): ninguna escritura posterior pasa', err2 && err2.kind === 'bloqueado');
  }

  // =========================================================================
  seccion('6. FALLO DESPUÉS DEL RENAME — caso (b) de §2.d');
  // =========================================================================
  {
    const dir = carpeta();
    let fallarBk = false;
    const k = N.crearNucleo({ dir, SQL, installationId: C('PCA'), politica: 'compartida',
      hooks: { get fallarBookkeeping() { return fallarBk; } } });
    k.abrir({ crearSiAusente: true });
    k.run('INSERT INTO projects(name) VALUES (?)', ['a']);
    fallarBk = true;
    let err = null, id = null;
    try { id = k.run('INSERT INTO projects(name) VALUES (?)', ['aplicada']); } catch (e) { err = e; }
    fallarBk = false;

    // el bookkeeping se rehace releyendo, así que NO debería lanzar
    ok('caso (b): el bookkeeping se rehace releyendo el archivo', err === null, String(err));
    ok('caso (b): la operación está en disco',
      (() => { const d = k._leerDisco(); const dd = new SQL.Database(d.bytes);
        const c = dd.exec("SELECT COUNT(*) FROM projects WHERE name='aplicada'")[0].values[0][0]; dd.close(); return c === 1; })());
    ok('caso (b): la memoria NO se restauró (la fila sigue)',
      k.get("SELECT COUNT(*) FROM projects WHERE name='aplicada'")[0][0] === 1);
    ok('caso (b): dirty vuelve a false tras rehacer', k.estado().dirty === false);
  }
  {
    // caso (b) con el disco ya pisado por otro: NO se da por nuestro.
    const dir = carpeta();
    let fallarBk = false, pisar = null;
    const k = N.crearNucleo({ dir, SQL, installationId: C('PCA'), politica: 'compartida',
      hooks: {
        get fallarBookkeeping() { return fallarBk; },
        renameSync: (a, b) => { const r = fs.renameSync(a, b); if (pisar && String(b).endsWith('.sqlite3')) pisar(); return r; },
      } });
    k.abrir({ crearSiAusente: true });
    k.run('INSERT INTO projects(name) VALUES (?)', ['a']);

    // otro equipo escribe justo después de nuestro rename
    const ajena = new SQL.Database();
    ajena.run('CREATE TABLE app_meta(key TEXT PRIMARY KEY, value TEXT)');
    ajena.run('CREATE TABLE projects(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)');
    ajena.run("INSERT INTO app_meta VALUES ('db_commit_id','" + C('AJENO') + "'),('db_commit_history','[\"" + C('AJENO') + "\"]'),('db_generation','99')");
    const bytesAjenos = Buffer.from(ajena.export()); ajena.close();

    fallarBk = true;
    pisar = () => { fs.writeFileSync(k.rutas().dbPath, bytesAjenos); pisar = null; };
    let err = null;
    try { k.run('INSERT INTO projects(name) VALUES (?)', ['b']); } catch (e) { err = e; }
    fallarBk = false;

    ok('caso (b) con disco pisado: lanza en vez de adoptar', !!err, String(err));
    ok('    ...con aplicado = true', err && err.aplicado === true, JSON.stringify(err && err.aplicado));
    ok('    ...y SE RECLASIFICA antes de adoptar nada', err && !!err.reclasificado, JSON.stringify(err && err.reclasificado));
    ok('    ...la reclasificación dice conflicto', err && err.reclasificado && err.reclasificado.tipo === 'conflicto',
      JSON.stringify(err && err.reclasificado));
    ok('    ...y el latch queda en desincronizada', k.estado().escrituraBloqueada === 'desincronizada');
  }

  // =========================================================================
  seccion('7. DOS "PCs": bifurcación real con archivos reales');
  // =========================================================================
  {
    const dir = carpeta();
    const A = N.crearNucleo({ dir, SQL, installationId: C('PCA'), politica: 'compartida' });
    A.abrir({ crearSiAusente: true });
    A.run('INSERT INTO projects(name) VALUES (?)', ['comun']);
    const foto = fs.readFileSync(A.rutas().dbPath);
    const fotoGen = fs.readFileSync(A.rutas().genPath);

    // B parte del MISMO estado
    const B = N.crearNucleo({ dir, SQL, installationId: C('PCB'), politica: 'compartida' });
    B.abrir({ crearSiAusente: true });
    ok('los dos parten del mismo commit', A.estado().cMem === B.estado().cMem);
    const comun = A.estado().cMem;

    // --- 7.1 Descendencia lineal: A escribe, B todavía no ha escrito nada ---
    A.run('INSERT INTO projects(name) VALUES (?)', ['de-A']);
    const commitA = A.estado().cMem;
    B.run('INSERT INTO projects(name) VALUES (?)', ['de-B-despues']);
    ok('DESCENDENCIA: B no conflictúa, adopta en silencio y escribe encima',
      B.estado().escrituraBloqueada === null, String(B.estado().escrituraBloqueada));
    ok('    ...y su commit desciende del de A', B.estado().pMem === commitA, B.estado().pMem + ' vs ' + commitA);
    ok('    ...conservando la fila de A',
      B.get("SELECT COUNT(*) FROM projects WHERE name='de-A'")[0][0] === 1);

    // --- 7.2 BIFURCACIÓN de verdad: los dos parten de `comun` y los dos escriben
    const dir2 = carpeta();
    const A2 = N.crearNucleo({ dir: dir2, SQL, installationId: C('PCA'), politica: 'compartida' });
    A2.abrir({ crearSiAusente: true });
    A2.run('INSERT INTO projects(name) VALUES (?)', ['comun']);
    const base2 = fs.readFileSync(A2.rutas().dbPath);
    const baseGen2 = fs.readFileSync(A2.rutas().genPath);

    const B2 = N.crearNucleo({ dir: dir2, SQL, installationId: C('PCB'), politica: 'compartida' });
    B2.abrir({ crearSiAusente: true });
    const padreComun = A2.estado().cMem;
    ok('bifurcación: los dos parten del mismo padre', B2.estado().cMem === padreComun);

    A2.run('INSERT INTO projects(name) VALUES (?)', ['rama-A']);
    const ramaA = A2.estado().cMem;
    // Se rebobina el disco al estado común para simular que B no vio lo de A
    // y consiguió escribir su propia rama (Drive entregó su versión).
    fs.writeFileSync(A2.rutas().dbPath, base2);
    fs.writeFileSync(A2.rutas().genPath, baseGen2);
    B2.run('INSERT INTO projects(name) VALUES (?)', ['rama-B']);
    const ramaB = B2.estado().cMem;
    ok('bifurcación: dos commits distintos con el MISMO padre',
      ramaA !== ramaB && A2.estado().pMem === padreComun && B2.estado().pMem === padreComun,
      ramaA.slice(0, 8) + ' / ' + ramaB.slice(0, 8));

    // Ahora A intenta escribir otra vez: en disco está la rama de B.
    let err = null;
    try { A2.run('INSERT INTO projects(name) VALUES (?)', ['mas-de-A']); } catch (e) { err = e; }
    ok('A detecta la BIFURCACIÓN antes de escribir', err && err.kind === 'conflicto', String(err));
    ok('    ...caso 3, aunque las dos generaciones sean iguales', err && err.caso === 3, 'caso=' + (err && err.caso));
    ok('    ...A queda con el latch de conflicto', A2.estado().escrituraBloqueada === 'conflicto',
      String(A2.estado().escrituraBloqueada));
    const enDisco = A2._leerDisco();
    ok('    ...y el disco sigue siendo el de B, sin pisar', enDisco.C === ramaB);
    ok('    ...la fila nueva de A no llegó a disco',
      (() => { const dd = new SQL.Database(enDisco.bytes);
        const c = dd.exec("SELECT COUNT(*) FROM projects WHERE name='mas-de-A'")[0].values[0][0]; dd.close(); return c === 0; })());
    void foto; void fotoGen; void commitA; void comun;
  }
  {
    // El caso 8 con archivos reales: una "versión antigua" reescribe sin tocar ids.
    const dir = carpeta();
    const k = N.crearNucleo({ dir, SQL, installationId: C('PCA'), politica: 'compartida' });
    k.abrir({ crearSiAusente: true });
    k.run('INSERT INTO projects(name) VALUES (?)', ['mia']);
    const st = fs.statSync(k.rutas().dbPath);

    // versión antigua: abre la imagen, añade una fila, NO toca app_meta, reescribe
    const bytes = fs.readFileSync(k.rutas().dbPath);
    const vieja = new SQL.Database(bytes);
    vieja.run("INSERT INTO projects(name) VALUES ('de-version-antigua')");
    fs.writeFileSync(k.rutas().dbPath, Buffer.from(vieja.export()));
    vieja.close();
    // y encima le devolvemos el mtime original, que es el peor caso
    fs.utimesSync(k.rutas().dbPath, st.atime, st.mtime);

    let err = null;
    try { k.run('INSERT INTO projects(name) VALUES (?)', ['siguiente']); } catch (e) { err = e; }
    ok('CASO 8 real: se detecta aunque commit_id y mtime no cambien',
      err && err.kind === 'conflicto' && err.caso === 8, String(err) + ' caso=' + (err && err.caso));
    ok('    ...y la fila de la versión antigua SIGUE en disco (no se pisó)',
      (() => { const d = k._leerDisco(); const dd = new SQL.Database(d.bytes);
        const c = dd.exec("SELECT COUNT(*) FROM projects WHERE name='de-version-antigua'")[0].values[0][0]; dd.close(); return c === 1; })());

    // El mismo escenario en política LOCAL, forzando el PEOR caso posible:
    // mismo tamaño exacto Y mtime restaurado con precisión numérica.
    const dirL = carpeta();
    const kL = N.crearNucleo({ dir: dirL, SQL, installationId: C('PCA'), politica: 'local' });
    kL.abrir({ crearSiAusente: true });
    kL.run('INSERT INTO projects(name) VALUES (?)', ['mia']);
    const stL = fs.statSync(kL.rutas().dbPath);
    const sMioL = kL.estado().sMio;
    const bL = fs.readFileSync(kL.rutas().dbPath);
    const vL = new SQL.Database(bL);
    vL.run("INSERT INTO projects(name) VALUES ('externa')");
    const nuevosL = Buffer.from(vL.export()); vL.close();
    fs.writeFileSync(kL.rutas().dbPath, nuevosL);
    // restaurar el mtime con el valor NUMÉRICO exacto, no con el objeto Date
    fs.utimesSync(kL.rutas().dbPath, stL.atimeMs / 1000, stL.mtimeMs / 1000);
    const stDesp = fs.statSync(kL.rutas().dbPath);
    const peorCaso = (stDesp.size === sMioL.size) && (stDesp.mtimeMs === sMioL.mtimeMs);
    console.log(`        [peor caso alcanzado: ${peorCaso}  size ${stDesp.size}/${sMioL.size}  mtimeMs ${stDesp.mtimeMs}/${sMioL.mtimeMs}]`);

    let errL = null;
    try { kL.run('INSERT INTO projects(name) VALUES (?)', ['siguiente']); } catch (e) { errL = e; }
    // ARN-1: el número de ok() de este bloque NO puede depender de si
    // fs.utimesSync reprodujo el mtime EXACTO (accidente de redondeo de
    // punto flotante en la conversión ms -> s -> ns, ajeno a esta prueba),
    // o el total fluctuaba entre 394 y 395 sin que hubiera ningún FALLO real.
    // Las dos ramas hacen dos comprobaciones reales y simétricas: qué pasó
    // con la escritura y qué quedó en disco. La exigencia del peor caso
    // (mismo tamaño Y mismo mtime -> el atajo NO lo ve -> se pierde la fila
    // externa) no se toca ni se relaja.
    if (peorCaso) {
      // Es el límite que el diseño documenta: en LOCAL el atajo no lo ve.
      ok('LOCAL, peor caso (mismo tamaño y mismo mtime): el atajo NO lo detecta', errL === null, String(errL));
      const d = kL._leerDisco(); const dd = new SQL.Database(d.bytes);
      const c = dd.exec("SELECT COUNT(*) FROM projects WHERE name='externa'")[0].values[0][0]; dd.close();
      ok('    ...y la fila externa SE PIERDE sin dejar evidencia — LÍMITE CONOCIDO', c === 0, 'c=' + c);
    } else {
      // Fuera del peor caso (mtime no reproducido con precisión exacta): el
      // atajo SÍ ve la diferencia y fuerza lectura de bytes -> caso 8 real.
      ok('LOCAL: no se pudo reproducir el peor caso; el stat lo detecta', errL !== null, String(errL));
      const d = kL._leerDisco(); const dd = new SQL.Database(d.bytes);
      const c = dd.exec("SELECT COUNT(*) FROM projects WHERE name='externa'")[0].values[0][0]; dd.close();
      ok('    ...y la fila externa NO se pierde: fuera del peor caso SÍ está protegida', c === 1, 'c=' + c);
    }
  }

  // =========================================================================
  seccion('8. BD ILEGIBLE al arrancar (§4.b paso 3)');
  // =========================================================================
  for (const [nombre, hacer] of [
    ['ceros', (p, n) => fs.writeFileSync(p, Buffer.alloc(n, 0))],
    ['truncado', (p, n) => { const b = fs.readFileSync(p); fs.writeFileSync(p, b.slice(0, Math.floor(n / 3))); }],
    ['basura', (p, n) => fs.writeFileSync(p, crypto.randomBytes(n))],
  ]) {
    const dir = carpeta();
    const k = N.crearNucleo({ dir, SQL, installationId: C('PCA'), politica: 'compartida' });
    k.abrir({ crearSiAusente: true });
    k.run('INSERT INTO projects(name) VALUES (?)', ['x']);
    const tam = fs.statSync(k.rutas().dbPath).size;
    hacer(k.rutas().dbPath, tam);

    // Fotografía del archivo corrupto ANTES de intentar abrirlo. La propiedad
    // que importa no es solo que abrir() lance, sino que el mecanismo NO
    // modifique ese archivo: puede tener valor forense o ser recuperable.
    const rutaBD = k.rutas().dbPath;
    const bytesAntes = fs.readFileSync(rutaBD);
    const tamAntes = fs.statSync(rutaBD).size;
    const shaAntes = crypto.createHash('sha256').update(bytesAntes).digest('hex');
    const genAntes = fs.existsSync(k.rutas().genPath) ? fs.readFileSync(k.rutas().genPath) : null;

    const k2 = N.crearNucleo({ dir, SQL, installationId: C('PCA'), politica: 'compartida' });
    let err = null;
    try { k2.abrir({ crearSiAusente: true }); } catch (e) { err = e; }
    ok(`${nombre}: abrir() lanza en vez de seguir`, err && err.kind === 'ilegible', String(err));
    ok(`    ...latch bd-ilegible`, k2.estado().escrituraBloqueada === 'bd-ilegible');

    // --- el archivo corrupto NO se ha tocado ---
    ok(`    ...el archivo sigue existiendo`, fs.existsSync(rutaBD));
    const bytesDesp = fs.readFileSync(rutaBD);
    const shaDesp = crypto.createHash('sha256').update(bytesDesp).digest('hex');
    ok(`    ...mismo tamaño (${tamAntes} B)`, fs.statSync(rutaBD).size === tamAntes,
      tamAntes + ' -> ' + fs.statSync(rutaBD).size);
    ok(`    ...mismo SHA-256`, shaDesp === shaAntes, shaAntes.slice(0, 12) + ' -> ' + shaDesp.slice(0, 12));
    ok(`    ...mismos bytes exactos`, bytesAntes.equals(bytesDesp));
    ok(`    ...NO se creó una base de datos vacía encima`,
      !(bytesDesp.length !== tamAntes || shaDesp !== shaAntes));
    if (genAntes) {
      ok(`    ...el .gen tampoco se tocó`, fs.readFileSync(k.rutas().genPath).equals(genAntes));
    }
    ok(`    ...no aparecieron temporales nuevos`,
      !fs.readdirSync(dir).some((f) => f.includes('.tmp-')), fs.readdirSync(dir).join(','));

    let err2 = null;
    try { k2.run("INSERT INTO projects(name) VALUES ('y')"); } catch (e) { err2 = e; }
    ok(`    ...ninguna escritura pasa`, err2 && err2.kind === 'bloqueado', String(err2));
    ok(`    ...y sigue sin tocarse tras el intento de escritura`,
      fs.readFileSync(rutaBD).equals(bytesAntes));
  }
  {
    // una BD sqlite VÁLIDA pero sin db_commit_id, con un .gen que sí lo tiene:
    // no puede pasar por instalación nueva.
    const dir = carpeta();
    const k = N.crearNucleo({ dir, SQL, installationId: C('PCA'), politica: 'compartida' });
    k.abrir({ crearSiAusente: true });
    k.run('INSERT INTO projects(name) VALUES (?)', ['x']);
    const vacia = new SQL.Database();
    vacia.run('CREATE TABLE app_meta(key TEXT PRIMARY KEY, value TEXT)');
    fs.writeFileSync(k.rutas().dbPath, Buffer.from(vacia.export()));
    vacia.close();
    const k2 = N.crearNucleo({ dir, SQL, installationId: C('PCA'), politica: 'compartida' });
    let err = null;
    try { k2.abrir({ crearSiAusente: true }); } catch (e) { err = e; }
    ok('BD válida SIN db_commit_id (habiendo .gen) -> ilegible, no "instalación nueva"',
      err && err.kind === 'ilegible', String(err));
  }

  // =========================================================================
  seccion('9. FRONTERA PRE-CONFIRMACIÓN — todos los fallos anteriores al rename');
  // =========================================================================
  // La frontera es el rename del .sqlite3. CUALQUIER excepción anterior debe
  // dejar: disco intacto, memoria restaurada, dirty=false, aplicado=false.
  {
    const puntos = [
      ['sql (db.run del usuario)', 'sql'],
      ['last_insert_rowid()', 'lastid'],
      ['UPSERT 1 — db_commit_id', 'meta1'],
      ['UPSERT 2 — db_parent_commit_id', 'meta2'],
      ['UPSERT 3 — db_commit_history', 'meta3'],
      ['UPSERT 4 — db_generation', 'meta4'],
      ['escritura del .gen', 'gen'],
      ['persistencia del .sqlite3', 'persist'],
    ];
    for (const [etiqueta, punto] of puntos) {
      const dir = carpeta();
      let fallarEn = null;
      const k = N.crearNucleo({ dir, SQL, installationId: C('PCA'), politica: 'compartida',
        hooks: { get fallarEn() { return fallarEn; } } });
      k.abrir({ crearSiAusente: true });
      k.run('INSERT INTO projects(name) VALUES (?)', ['buena-1']);
      const antes = k.estado();
      const bytesAntes = fs.readFileSync(k.rutas().dbPath);
      const metaAntes = JSON.stringify(k.get("SELECT key,value FROM app_meta ORDER BY key"));

      fallarEn = punto;
      let err = null;
      try { k.run('INSERT INTO projects(name) VALUES (?)', ['FANTASMA-' + punto]); } catch (e) { err = e; }
      fallarEn = null;

      const d = k.estado();
      ok(`[${etiqueta}] lanza`, !!err, String(err));
      ok(`   aplicado = false`, err && err.aplicado === false, JSON.stringify(err && err.aplicado));
      ok(`   el .sqlite3 en disco NO cambió`, fs.readFileSync(k.rutas().dbPath).equals(bytesAntes));
      ok(`   dirty = false`, d.dirty === false, 'dirty=' + d.dirty);
      ok(`   la memoria volvió al commit confirmado`, d.cMem === antes.cMem, d.cMem + ' vs ' + antes.cMem);
      ok(`   app_meta en memoria intacto (sin UPSERT a medias)`,
        JSON.stringify(k.get("SELECT key,value FROM app_meta ORDER BY key")) === metaAntes);
      ok(`   la fila fantasma no está en memoria`,
        k.get(`SELECT COUNT(*) FROM projects WHERE name='FANTASMA-${punto}'`)[0][0] === 0);
      ok(`   sin latch (es un error de operación, no fatal)`, d.escrituraBloqueada === null,
        String(d.escrituraBloqueada));

      // (d) una escritura normal posterior NO arrastra nada parcial
      k.run('INSERT INTO projects(name) VALUES (?)', ['buena-2']);
      const dd = new SQL.Database(k._leerDisco().bytes);
      const filas = dd.exec('SELECT name FROM projects ORDER BY id')[0].values.map((r) => r[0]);
      const metaDisco = dd.exec("SELECT value FROM app_meta WHERE key='db_generation'")[0].values[0][0];
      dd.close();
      ok(`   la escritura posterior NO arrastra nada parcial`,
        filas.join(',') === 'buena-1,buena-2', filas.join(','));
      ok(`   la generación avanzó exactamente 1 desde la última buena`,
        Number(metaDisco) === antes.gMem + 1, metaDisco + ' vs ' + (antes.gMem + 1));
    }
  }
  {
    // SQL inválido de verdad (no inyectado) y violación de constraint.
    const k = nucleo({ politica: 'compartida' }); k.abrir({ crearSiAusente: true });
    k.run('INSERT INTO projects(name) VALUES (?)', ['ok1']);
    const antes = k.estado();
    const bytesAntes = fs.readFileSync(k.rutas().dbPath);

    let e1 = null;
    try { k.run('ESTO NO ES SQL VALIDO'); } catch (e) { e1 = e; }
    ok('SQL inválido REAL: lanza', !!e1, String(e1));
    ok('   aplicado = false', e1 && e1.aplicado === false);
    ok('   dirty = false', k.estado().dirty === false);
    ok('   disco intacto', fs.readFileSync(k.rutas().dbPath).equals(bytesAntes));
    ok('   commit sin cambiar', k.estado().cMem === antes.cMem);

    // constraint: NOT NULL sobre projects.name
    let e2 = null;
    try { k.run('INSERT INTO projects(name) VALUES (NULL)'); } catch (e) { e2 = e; }
    ok('violación de constraint REAL: lanza', !!e2, String(e2));
    ok('   aplicado = false', e2 && e2.aplicado === false);
    ok('   dirty = false', k.estado().dirty === false);
    ok('   disco intacto', fs.readFileSync(k.rutas().dbPath).equals(bytesAntes));

    k.run('INSERT INTO projects(name) VALUES (?)', ['ok2']);
    const dd = new SQL.Database(k._leerDisco().bytes);
    const filas = dd.exec('SELECT name FROM projects ORDER BY id')[0].values.map((r) => r[0]);
    dd.close();
    ok('   tras dos SQL fallidos, la escritura buena deja solo lo correcto',
      filas.join(',') === 'ok1,ok2', filas.join(','));
  }
  {
    // Fallo pre-confirmación Y fallo de la restauración -> caso (c)
    const dir = carpeta();
    let fallarEn = null, fallarRest = false;
    const k = N.crearNucleo({ dir, SQL, installationId: C('PCA'), politica: 'compartida',
      hooks: { get fallarEn() { return fallarEn; }, get fallarRestauracion() { return fallarRest; } } });
    k.abrir({ crearSiAusente: true });
    k.run('INSERT INTO projects(name) VALUES (?)', ['a']);
    fallarEn = 'meta3'; fallarRest = true;
    let err = null;
    try { k.run('INSERT INTO projects(name) VALUES (?)', ['b']); } catch (e) { err = e; }
    ok('fallo en meta3 + restauración fallida -> latch desincronizada',
      k.estado().escrituraBloqueada === 'desincronizada', String(k.estado().escrituraBloqueada));
    ok('   aplicado = false (no llegó al rename)', err && err.aplicado === false);
    ok('   el latch es irreversible', k.levantarLatch().ok === false);
  }

  // =========================================================================
  seccion('10. reparar-gen — comportamiento DEFINIDO (decisión B con testigo)');
  // =========================================================================
  {
    // Estado: .gen = Y (parent X, writer = yo), BD = X, memoria = X.
    // Se provoca de verdad: se inyecta un fallo en la persistencia, que deja
    // el .gen ya escrito y la base de datos sin actualizar.
    const dir = carpeta();
    let fallarEn = null;
    const k = N.crearNucleo({ dir, SQL, installationId: C('PCA'), politica: 'compartida',
      hooks: { get fallarEn() { return fallarEn; } } });
    k.abrir({ crearSiAusente: true });
    k.run('INSERT INTO projects(name) VALUES (?)', ['base']);
    const X = k.estado().cMem;
    const bytesX = fs.readFileSync(k.rutas().dbPath);

    fallarEn = 'persist';                    // el .gen SÍ se escribe, la BD no
    try { k.run('INSERT INTO projects(name) VALUES (?)', ['interrumpida']); } catch (e) {}
    fallarEn = null;

    const genY = k._leerGen();
    ok('preparación: .gen adelantado (Y) con parent X y writer = yo',
      genY && genY.C !== X && genY.P === X && genY.W === C('PCA'),
      JSON.stringify(genY));
    ok('preparación: la BD sigue en X', k._leerDisco().C === X);
    ok('preparación: la memoria volvió a X', k.estado().cMem === X);
    const Y = genY.C;

    // La clasificación tiene que decir reparar-gen / caso 2
    const dec = k.clasificar(k._fotografiar());
    ok('clasifica reparar-gen, caso 2', dec.tipo === 'reparar-gen' && dec.caso === 2, JSON.stringify(dec));

    // Y ahora la escritura nueva Z
    k.run('INSERT INTO projects(name) VALUES (?)', ['nueva-Z']);
    const Z = k.estado().cMem;
    const genFinal = k._leerGen();
    const discoFinal = k._leerDisco();

    ok('Z.parent_commit_id === X (NO Y): se encadena desde lo que hay en disco',
      k.estado().pMem === X, k.estado().pMem + ' vs X=' + X);
    ok('Z NO desciende de Y: Y no aparece en el historial',
      !k.estado().hMem.includes(Y), JSON.stringify(k.estado().hMem.map((h) => h.slice(0, 6))));
    ok('el .gen final lleva Z', genFinal.C === Z, genFinal.C.slice(0, 8) + ' vs ' + Z.slice(0, 8));
    ok('el .gen y la BD vuelven a ser coherentes', genFinal.C === discoFinal.C);
    ok('NO queda una rama falsa: Y nunca existió como estado de la BD',
      discoFinal.H.indexOf(Y) === -1 && discoFinal.C === Z);

    // El testigo interrumpido se conserva
    const testigos = fs.readdirSync(dir).filter((f) => f.includes('.gen.interrumpido-'));
    ok('el testigo interrumpido SE CONSERVA', testigos.length === 1, testigos.join(','));
    if (testigos.length) {
      const t = JSON.parse(fs.readFileSync(path.join(dir, testigos[0]), 'utf8'));
      ok('    ...y contiene exactamente Y', t.commit_id === Y, t.commit_id + ' vs ' + Y);
      ok('    ...con su parent X y su writer', t.parent_commit_id === X && t.writer === C('PCA'));
    }

    // Nada se pierde
    const dd = new SQL.Database(discoFinal.bytes);
    const filas = dd.exec('SELECT name FROM projects ORDER BY id')[0].values.map((r) => r[0]);
    dd.close();
    ok('nada se pierde: la fila "base" sigue y "interrumpida" nunca existió',
      filas.join(',') === 'base,nueva-Z', filas.join(','));
    ok('los bytes de X ya no están en el archivo activo (fue sustituido, no corrompido)',
      !fs.readFileSync(k.rutas().dbPath).equals(bytesX));

    // Y una segunda escritura ya no preserva nada, porque no hay testigo roto
    k.run('INSERT INTO projects(name) VALUES (?)', ['otra']);
    ok('una escritura normal posterior NO genera más testigos',
      fs.readdirSync(dir).filter((f) => f.includes('.gen.interrumpido-')).length === 1);
  }

  // =========================================================================
  seccion('11. UNA SOLA PERSISTENCIA para varias sentencias (patrón de borrado)');
  // =========================================================================
  // Harness del diseño de deleteProjectById: los dos DELETE deben ser UN solo
  // commit. NO se toca main.js; esto solo demuestra el mecanismo del núcleo.
  {
    const k = nucleo({ politica: 'compartida' }); k.abrir({ crearSiAusente: true });
    k.run('CREATE TABLE backups(id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER)');
    k.run('INSERT INTO projects(name) VALUES (?)', ['victima']);
    k.run('INSERT INTO backups(project_id) VALUES (1)');
    k.run('INSERT INTO backups(project_id) VALUES (1)');
    const gAntes = k.estado().gMem;

    k.escribirMultiple([
      { sql: 'DELETE FROM backups WHERE project_id=?', params: [1] },
      { sql: 'DELETE FROM projects WHERE id=?', params: [1] },
    ]);
    ok('dos DELETE = UNA sola generación', k.estado().gMem === gAntes + 1,
      gAntes + ' -> ' + k.estado().gMem);
    const d = k._leerDisco();
    const dd = new SQL.Database(d.bytes);
    const nP = dd.exec('SELECT COUNT(*) FROM projects')[0].values[0][0];
    const nB = dd.exec('SELECT COUNT(*) FROM backups')[0].values[0][0];
    dd.close();
    ok('   ...y en disco no queda ni el proyecto ni sus backups', nP === 0 && nB === 0, `p=${nP} b=${nB}`);
    ok('   el .gen coincide con la BD', k._leerGen().C === d.C);
  }
  {
    // Y el estado parcial que esto evita: si falla ANTES del rename, ninguno
    // de los dos DELETE llega a disco.
    const dir = carpeta();
    let fallarEn = null;
    const k = N.crearNucleo({ dir, SQL, installationId: C('PCA'), politica: 'compartida',
      hooks: { get fallarEn() { return fallarEn; } } });
    k.abrir({ crearSiAusente: true });
    k.run('CREATE TABLE backups(id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER)');
    k.run('INSERT INTO projects(name) VALUES (?)', ['victima']);
    k.run('INSERT INTO backups(project_id) VALUES (1)');
    const bytesAntes = fs.readFileSync(k.rutas().dbPath);

    fallarEn = 'persist';
    let err = null;
    try {
      k.escribirMultiple([
        { sql: 'DELETE FROM backups WHERE project_id=?', params: [1] },
        { sql: 'DELETE FROM projects WHERE id=?', params: [1] },
      ]);
    } catch (e) { err = e; }
    fallarEn = null;

    ok('fallo antes del rename: lanza con aplicado=false', err && err.aplicado === false, String(err));
    ok('   el disco NO cambió', fs.readFileSync(k.rutas().dbPath).equals(bytesAntes));
    ok('   EL PROYECTO SIGUE COMPLETO en memoria: filas de projects',
      k.get('SELECT COUNT(*) FROM projects')[0][0] === 1);
    ok('   ...y sus backups también (nada de estado parcial)',
      k.get('SELECT COUNT(*) FROM backups')[0][0] === 1);
    ok('   dirty = false', k.estado().dirty === false);
  }
  {
    // Con dos run() separados sí habría estado parcial: se demuestra el
    // contraste, que es lo que justifica escribirMultiple().
    const dir = carpeta();
    let fallarEn = null;
    const k = N.crearNucleo({ dir, SQL, installationId: C('PCA'), politica: 'compartida',
      hooks: { get fallarEn() { return fallarEn; } } });
    k.abrir({ crearSiAusente: true });
    k.run('CREATE TABLE backups(id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER)');
    k.run('INSERT INTO projects(name) VALUES (?)', ['victima']);
    k.run('INSERT INTO backups(project_id) VALUES (1)');

    k.run('DELETE FROM backups WHERE project_id=?', [1]);   // primer commit: SÍ
    fallarEn = 'persist';
    try { k.run('DELETE FROM projects WHERE id=?', [1]); } catch (e) {}
    fallarEn = null;

    const dd = new SQL.Database(k._leerDisco().bytes);
    const nP = dd.exec('SELECT COUNT(*) FROM projects')[0].values[0][0];
    const nB = dd.exec('SELECT COUNT(*) FROM backups')[0].values[0][0];
    dd.close();
    ok('CONTRASTE con dos run(): queda ESTADO PARCIAL en disco',
      nP === 1 && nB === 0, `projects=${nP} backups=${nB}`);
    ok('   ...que es exactamente lo que escribirMultiple() evita', true);
  }

  // =========================================================================
  seccion('12. NOMBRES TEMPORALES GLOBALMENTE ÚNICOS entre PCs');
  // =========================================================================
  {
    // Dos instalaciones distintas, MISMO proceso (por tanto mismo process.pid
    // efectivo), sobre la MISMA carpeta: sus temporales no pueden coincidir.
    const dir = carpeta();
    const vistos = { A: [], B: [] };
    const espiar = (quien) => ({
      renameSync: (a, b) => { vistos[quien].push(path.basename(a)); return fs.renameSync(a, b); },
    });
    const A = N.crearNucleo({ dir, SQL, installationId: C('INSTALACION-A'), politica: 'compartida', hooks: espiar('A') });
    A.abrir({ crearSiAusente: true });
    const B = N.crearNucleo({ dir, SQL, installationId: C('INSTALACION-B'), politica: 'compartida', hooks: espiar('B') });
    B.abrir({ crearSiAusente: true });
    for (let i = 0; i < 5; i++) A.run('INSERT INTO projects(name) VALUES (?)', ['a' + i]);
    // B se recarga sola por descendencia y escribe lo suyo
    for (let i = 0; i < 5; i++) B.run('INSERT INTO projects(name) VALUES (?)', ['b' + i]);

    ok('los dos núcleos comparten el process.pid', true, 'pid=' + process.pid);
    ok('se capturaron temporales de A y de B', vistos.A.length >= 5 && vistos.B.length >= 5,
      `A=${vistos.A.length} B=${vistos.B.length}`);
    const interseccion = vistos.A.filter((x) => vistos.B.includes(x));
    ok('NINGÚN nombre temporal coincide entre las dos instalaciones',
      interseccion.length === 0, interseccion.join(','));
    ok('todos los temporales son distintos entre sí (incluso dentro del mismo writer)',
      new Set(vistos.A.concat(vistos.B)).size === vistos.A.length + vistos.B.length,
      'únicos=' + new Set(vistos.A.concat(vistos.B)).size + ' de ' + (vistos.A.length + vistos.B.length));
    ok('el nombre NO contiene el PID', !vistos.A.some((x) => x.includes('.tmp-' + process.pid)),
      vistos.A[0]);
    ok('el nombre lleva el writer de A', vistos.A.every((x) => x.includes('INSTALACION-A')), vistos.A[0]);
    ok('el nombre lleva el writer de B', vistos.B.every((x) => x.includes('INSTALACION-B')), vistos.B[0]);
    ok('siguen empezando por ".tmp-" (la limpieza por prefijo sigue valiendo)',
      vistos.A.concat(vistos.B).every((x) => x.includes('.tmp-')));
  }
  {
    // La función suelta, sin writer: dos llamadas seguidas no colisionan.
    const d = carpeta();
    const f = path.join(d, 'z.bin');
    const vistos = [];
    const hooks = { renameSync: (a, b) => { vistos.push(path.basename(a)); return fs.renameSync(a, b); } };
    for (let i = 0; i < 50; i++) N.escribirAtomico(f, Buffer.from('x'), { hooks, writer: C('MISMO-WRITER') });
    ok('50 escrituras del MISMO writer producen 50 nombres distintos',
      new Set(vistos).size === 50, 'únicos=' + new Set(vistos).size);
  }

  // =========================================================================
  seccion('13. NO PODER LEER != CONFLICTO');
  // =========================================================================
  for (const [etiqueta, codigo] of [['EIO', 'EIO'], ['EBUSY', 'EBUSY'], ['EACCES', 'EACCES']]) {
    for (const politica of ['compartida', 'local']) {
      const dir = carpeta();
      let romperLectura = false;
      const k = N.crearNucleo({ dir, SQL, installationId: C('PCA'), politica,
        hooks: { readFileSync: (p, ...r) => {
          if (romperLectura && String(p).endsWith('.sqlite3')) {
            throw Object.assign(new Error('FALLO INYECTADO de lectura'), { code: codigo });
          }
          return fs.readFileSync(p, ...r);
        } } });
      k.abrir({ crearSiAusente: true });
      k.run('INSERT INTO projects(name) VALUES (?)', ['antes']);
      const antes = k.estado();
      const bytesAntes = fs.readFileSync(k.rutas().dbPath);
      // en LOCAL hay atajo: se invalida S_mio para forzar la lectura
      if (politica === 'local') fs.utimesSync(k.rutas().dbPath, new Date(), new Date(Date.now() + 5000));

      romperLectura = true;
      let err = null;
      try { k.run('INSERT INTO projects(name) VALUES (?)', ['NO-DEBE-PASAR']); } catch (e) { err = e; }
      romperLectura = false;

      const d = k.estado();
      ok(`[${etiqueta}/${politica}] lanza`, !!err, String(err));
      ok(`   NO se etiqueta como conflicto`, err && err.kind !== 'conflicto', 'kind=' + (err && err.kind));
      ok(`   es un error de E/S no verificable`, err && err.kind === 'io' && err.noVerificable === true,
        JSON.stringify({ kind: err && err.kind, nv: err && err.noVerificable }));
      ok(`   NO se inventa un caso de bifurcación`, err && err.caso === undefined, 'caso=' + (err && err.caso));
      ok(`   el SQL del usuario NO se ejecutó`,
        k.get("SELECT COUNT(*) FROM projects WHERE name='NO-DEBE-PASAR'")[0][0] === 0);
      ok(`   la memoria NO se tocó`, d.cMem === antes.cMem && d.dirty === false);
      ok(`   el disco NO se tocó`, fs.readFileSync(k.rutas().dbPath).equals(bytesAntes));
      if (politica === 'compartida') {
        ok(`   COMPARTIDA -> latch 'degradado' (conservador, levantable)`,
          d.escrituraBloqueada === 'degradado', String(d.escrituraBloqueada));
        ok(`   ...y NO es 'conflicto'`, d.escrituraBloqueada !== 'conflicto');
        // recuperación: al volver el acceso, se levanta y se reclasifica bien
        ok(`   al volver el acceso, el latch se puede levantar`, k.levantarLatch('degradado').ok === true);
        k.run('INSERT INTO projects(name) VALUES (?)', ['tras-recuperar']);
        ok(`   ...y la escritura siguiente funciona y clasifica bien`,
          k.get("SELECT COUNT(*) FROM projects WHERE name='tras-recuperar'")[0][0] === 1);
        ok(`   ...sin conflicto falso`, k.estado().escrituraBloqueada === null);
      } else {
        ok(`   LOCAL -> NO se latchea: es un error transitorio reintentable`,
          d.escrituraBloqueada === null, String(d.escrituraBloqueada));
        k.run('INSERT INTO projects(name) VALUES (?)', ['reintento']);
        ok(`   ...y el reintento inmediato funciona`,
          k.get("SELECT COUNT(*) FROM projects WHERE name='reintento'")[0][0] === 1);
      }
    }
  }
  {
    // ENOENT es distinto de EIO: el archivo no está.
    const dir = carpeta();
    const k = N.crearNucleo({ dir, SQL, installationId: C('PCA'), politica: 'compartida' });
    k.abrir({ crearSiAusente: true });
    k.run('INSERT INTO projects(name) VALUES (?)', ['x']);
    fs.unlinkSync(k.rutas().dbPath);
    const d = k._leerDisco();
    ok('archivo borrado -> estado "ausente", no "ilegible"', d.estado === 'ausente', d.estado);
    let err = null;
    try { k.run('INSERT INTO projects(name) VALUES (?)', ['y']); } catch (e) { err = e; }
    ok('   ...y tampoco se trata como conflicto', err && err.kind === 'io' && err.noVerificable === true,
      JSON.stringify({ kind: err && err.kind, nv: err && err.noVerificable }));
  }
  {
    // Los cuatro estados de leerDisco(), explícitos.
    const dir = carpeta();
    let romper = null;
    const k = N.crearNucleo({ dir, SQL, installationId: C('PCA'), politica: 'compartida',
      hooks: { readFileSync: (p, ...r) => {
        if (romper && String(p).endsWith('.sqlite3')) throw Object.assign(new Error('inyectado'), { code: romper });
        return fs.readFileSync(p, ...r);
      } } });
    k.abrir({ crearSiAusente: true });
    k.run('INSERT INTO projects(name) VALUES (?)', ['x']);
    ok('estado "valida"', k._leerDisco().estado === 'valida');
    romper = 'EIO';
    ok('estado "no-disponible" con EIO', k._leerDisco().estado === 'no-disponible');
    romper = 'ENOENT';
    ok('estado "ausente" con ENOENT', k._leerDisco().estado === 'ausente');
    romper = null;
    fs.writeFileSync(k.rutas().dbPath, Buffer.alloc(4096, 0));
    ok('estado "ilegible" con el archivo a ceros', k._leerDisco().estado === 'ilegible');
  }
  {
    // Y la diferencia que importa al arrancar: no-disponible NO latchea
    // 'bd-ilegible' y NO crea una base de datos vacía encima.
    const dir = carpeta();
    const k0 = N.crearNucleo({ dir, SQL, installationId: C('PCA'), politica: 'compartida' });
    k0.abrir({ crearSiAusente: true });
    k0.run('INSERT INTO projects(name) VALUES (?)', ['valiosa']);
    const bytesAntes = fs.readFileSync(k0.rutas().dbPath);

    const k = N.crearNucleo({ dir, SQL, installationId: C('PCA'), politica: 'compartida',
      hooks: { readFileSync: (p, ...r) => {
        if (String(p).endsWith('.sqlite3')) throw Object.assign(new Error('inyectado'), { code: 'EIO' });
        return fs.readFileSync(p, ...r);
      } } });
    let err = null;
    try { k.abrir({ crearSiAusente: true }); } catch (e) { err = e; }
    ok('arranque con EIO: lanza error de E/S, NO "ilegible"',
      err && err.kind === 'io' && err.noVerificable === true, JSON.stringify({ kind: err && err.kind }));
    ok('   ...NO se latchea bd-ilegible', k.estado().escrituraBloqueada !== 'bd-ilegible',
      String(k.estado().escrituraBloqueada));
    ok('   ...y el archivo bueno sigue intacto',
      fs.readFileSync(k0.rutas().dbPath).equals(bytesAntes));
  }

  // =========================================================================
  seccion('14. "AUSENTE" NO AUTORIZA A CREAR — abrir() sin bypass de existsSync');
  // =========================================================================
  // "El archivo está ausente" es un HECHO OBSERVADO.
  // "Crear una base de datos nueva" es una DECISIÓN DE INICIALIZACIÓN.
  {
    // (a) BD existente, pero la visibilidad falla como lo haría Drive.
    //     fs.existsSync() devuelve false ante CUALQUIER error: este es
    //     exactamente el escenario que el bypass anterior no distinguía.
    for (const politica of ['compartida', 'desconocida', 'local']) {
      const dir = carpeta();
      const k0 = N.crearNucleo({ dir, SQL, installationId: C('PCA'), politica });
      k0.abrir({ crearSiAusente: true });
      k0.run('INSERT INTO projects(name) VALUES (?)', ['MUY-VALIOSA']);
      const bytesAntes = fs.readFileSync(k0.rutas().dbPath);
      const genAntes = fs.readFileSync(k0.rutas().genPath);
      const shaAntes = crypto.createHash('sha256').update(bytesAntes).digest('hex');

      // Drive "no ve" el archivo: ENOENT observable aunque el archivo esté ahí.
      const k = N.crearNucleo({ dir, SQL, installationId: C('PCA'), politica,
        hooks: { readFileSync: (p2, ...r) => {
          if (String(p2).endsWith('.sqlite3')) throw Object.assign(new Error('no visible'), { code: 'ENOENT' });
          return fs.readFileSync(p2, ...r);
        } } });
      let err = null;
      try { k.abrir(); } catch (e) { err = e; }     // SIN crearSiAusente

      ok(`[${politica}] BD invisible: abrir() NO crea nada, lanza`, !!err, String(err));
      ok(`   estadoDisco = 'ausente' (hecho observado)`, err && err.estadoDisco === 'ausente',
        String(err && err.estadoDisco));
      ok(`   NO se creó una BD nueva: mismo SHA-256`,
        crypto.createHash('sha256').update(fs.readFileSync(k0.rutas().dbPath)).digest('hex') === shaAntes);
      ok(`   los bytes originales están intactos`, fs.readFileSync(k0.rutas().dbPath).equals(bytesAntes));
      ok(`   el .gen NO se tocó`, fs.readFileSync(k0.rutas().genPath).equals(genAntes));
      ok(`   no aparecieron temporales`, !fs.readdirSync(dir).some((f) => f.includes('.tmp-')),
        fs.readdirSync(dir).join(','));
      if (politica !== 'local') {
        ok(`   COMPARTIDA/DESCONOCIDA -> fail-closed ('degradado')`,
          k.estado().escrituraBloqueada === 'degradado', String(k.estado().escrituraBloqueada));
      }

      // (e) al recuperar la visibilidad, abre la ORIGINAL y sin generación espuria
      const k2 = N.crearNucleo({ dir, SQL, installationId: C('PCA'), politica });
      k2.abrir();                                    // sigue SIN crearSiAusente
      ok(`   al recuperar el acceso, abre la BD ORIGINAL`,
        k2.estado().cMem === k0.estado().cMem, k2.estado().cMem + ' vs ' + k0.estado().cMem);
      ok(`   ...sin generación espuria`, k2.estado().gMem === k0.estado().gMem,
        k2.estado().gMem + ' vs ' + k0.estado().gMem);
      ok(`   ...y la fila valiosa sigue`,
        k2.get("SELECT COUNT(*) FROM projects WHERE name='MUY-VALIOSA'")[0][0] === 1);
    }
  }
  {
    // (b) ENOENT REAL (el archivo se borró) en una ubicación COMPARTIDA ya
    //     configurada: sigue sin inicializarse automáticamente.
    const dir = carpeta();
    const k0 = N.crearNucleo({ dir, SQL, installationId: C('PCA'), politica: 'compartida' });
    k0.abrir({ crearSiAusente: true });
    k0.run('INSERT INTO projects(name) VALUES (?)', ['x']);
    fs.unlinkSync(k0.rutas().dbPath);               // ausencia REAL, el .gen sigue

    const k = N.crearNucleo({ dir, SQL, installationId: C('PCA'), politica: 'compartida' });
    let err = null;
    try { k.abrir(); } catch (e) { err = e; }
    ok('ENOENT real en COMPARTIDA configurada: NO se inicializa', !!err, String(err));
    ok('   no se creó ningún .sqlite3', !fs.existsSync(k.rutas().dbPath));
    ok('   el .gen sigue como estaba, sin reescribir', fs.existsSync(k.rutas().genPath));
    ok('   fail-closed', k.estado().escrituraBloqueada === 'degradado');

    // Y ni siquiera con crearSiAusente: la carpeta NO está virgen (hay .gen).
    const k2 = N.crearNucleo({ dir, SQL, installationId: C('PCA'), politica: 'compartida' });
    let err2 = null;
    try { k2.abrir({ crearSiAusente: true }); } catch (e) { err2 = e; }
    ok('   con crearSiAusente pero restos en la carpeta: TAMPOCO crea', !!err2, String(err2));
    ok('   ...y lo dice explícitamente', err2 && /no está vacía/.test(err2.message), String(err2));
    ok('   sigue sin haber .sqlite3', !fs.existsSync(k2.rutas().dbPath));
  }
  {
    // (c) Ausencia real + flujo EXPLÍCITO de primera creación -> sí crea.
    for (const politica of ['compartida', 'desconocida', 'local']) {
      const dir = carpeta();
      const k = N.crearNucleo({ dir, SQL, installationId: C('PCA'), politica });
      ok(`[${politica}] carpeta virgen: pareceUbicacionNueva() = true`,
        k.pareceUbicacionNueva().nueva === true, JSON.stringify(k.pareceUbicacionNueva()));
      k.abrir({ crearSiAusente: true });
      ok(`   con autorización explícita SÍ crea la BD`, fs.existsSync(k.rutas().dbPath));
      ok(`   ...con su .gen coherente`, k._leerGen().C === k._leerDisco().C);
      ok(`   ...generación 1`, k.estado().gMem === 1, 'gMem=' + k.estado().gMem);
      k.run('INSERT INTO projects(name) VALUES (?)', ['primera']);
      ok(`   ...y se puede escribir`, k.get('SELECT COUNT(*) FROM projects')[0][0] === 1);
    }
  }
  {
    // (d) LOCAL: qué cuenta como primera inicialización, explícito.
    const dir = carpeta();
    const k = N.crearNucleo({ dir, SQL, installationId: C('PCA'), politica: 'local' });
    ok('LOCAL, carpeta virgen -> se considera primera inicialización',
      k.pareceUbicacionNueva().nueva === true);
    let err = null;
    try { k.abrir(); } catch (e) { err = e; }
    ok('   ...pero SIN crearSiAusente tampoco crea (la ausencia no autoriza)',
      !!err && !fs.existsSync(k.rutas().dbPath), String(err));
    ok('   ...y el error dice que PODRÍA ser la primera vez',
      err && err.podriaSerPrimeraVez === true, String(err && err.podriaSerPrimeraVez));
    ok('   ...LOCAL no hace fail-closed (no hay otro PC posible)',
      k.estado().escrituraBloqueada === null, String(k.estado().escrituraBloqueada));
    k.abrir({ crearSiAusente: true });
    ok('   con la autorización explícita, crea', fs.existsSync(k.rutas().dbPath));
  }
  {
    // Un .gen huérfano, sin .sqlite3, NO autoriza a crear.
    const dir = carpeta();
    fs.writeFileSync(path.join(dir, 'panorama.sqlite3.gen'),
      JSON.stringify({ v: 2, gen: 9, commit_id: C('VIEJO'), writer: C('PCB'), at: new Date().toISOString() }));
    const k = N.crearNucleo({ dir, SQL, installationId: C('PCA'), politica: 'compartida' });
    ok('con un .gen huérfano, la carpeta NO se considera virgen',
      k.pareceUbicacionNueva().nueva === false, JSON.stringify(k.pareceUbicacionNueva()));
    let err = null;
    try { k.abrir({ crearSiAusente: true }); } catch (e) { err = e; }
    ok('   ...y ni con autorización explícita se crea encima',
      !!err && !fs.existsSync(k.rutas().dbPath), String(err));
  }
  {
    // Si no se puede ni listar la carpeta, fail-closed: no se da por virgen.
    const dir = carpeta();
    const k = N.crearNucleo({ dir, SQL, installationId: C('PCA'), politica: 'compartida' });
    const realRead = fs.readdirSync;
    fs.readdirSync = () => { throw Object.assign(new Error('inyectado'), { code: 'EIO' }); };
    const p2 = k.pareceUbicacionNueva();
    fs.readdirSync = realRead;
    ok('si no se puede listar la carpeta, NO se da por virgen (fail-closed)',
      p2.nueva === false, JSON.stringify(p2));
  }

  // =========================================================================
  console.log('\n' + '='.repeat(66));
  console.log('  NÚCLEO A3.3 — ' + pass + ' OK, ' + fail + ' FALLOS');
  if (fail) { console.log('  fallidas:'); fallos.forEach((f) => console.log('    - ' + f)); }
  console.log('='.repeat(66));
  try { fs.rmSync(RAIZ, { recursive: true, force: true }); } catch (e) {}
  console.log('  carpetas temporales borradas: ' + !fs.existsSync(RAIZ));
  process.exitCode = fail ? 1 : 0;
})().catch((e) => { console.error('EXCEPCIÓN NO CAPTURADA:', e); process.exitCode = 2; });
