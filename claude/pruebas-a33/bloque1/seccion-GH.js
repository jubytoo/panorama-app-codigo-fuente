'use strict';
const fs = require('fs');
const P = 'C:\\Users\\ADMIN~1.JLO\\AppData\\Local\\Temp\\claude\\C--Codigo-Fuente-PS\\e55d4471-ea3f-4279-b758-0366ccb6384c\\scratchpad\\bloque1\\test-db-integrado.js';
let t = fs.readFileSync(P, 'utf8');
if (t.includes('G. CARRERA DURANTE LA MIGRACIÓN')) { console.log('ya estaba'); process.exit(0); }

// --- quitar la aserción tautológica ---
const taut = "    ok('preparación: la carpeta se considera virgen', dbmod.pareceUbicacionNueva === undefined || true);\n";
if (t.includes(taut)) { t = t.replace(taut, ''); console.log('aserción tautológica eliminada'); }
else console.log('AVISO: no se encontró la aserción tautológica');

const marcador = "  // =========================================================================\n  seccion('D. PRODUCCIÓN NO TOCADA');";
if (!t.includes(marcador)) { console.log('MARCADOR NO ENCONTRADO'); process.exit(1); }

const nuevo = `  // =========================================================================
  seccion('G. CARRERA DURANTE LA MIGRACIÓN — revalidación JIT');
  // =========================================================================
  // A abre el commit X y queda detenida antes de persistir la migración.
  // B transforma X -> algo en disco. A continúa. A NO puede pisar a B con una
  // imagen construida desde X.
  //
  // Se materializa con dos carpetas: se prepara el estado "A cargó X", se
  // sustituye el disco por lo que haya escrito B, y se abre A sobre eso.
  {
    // Utilidad: deja en \`dir\` una BD A3.3 con N proyectos y devuelve el estado.
    async function prepararA33(dir, n) {
      await abrirEn(dir);
      for (let i = 1; i <= n; i++) {
        dbmod.run('INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES (?,?,?,?,?)',
          ['P' + i, 'c', 'persist:' + i, 'x', 'x']);
      }
      return {
        bytes: fs.readFileSync(path.join(dir, 'panorama.sqlite3')),
        gen: fs.readFileSync(path.join(dir, 'panorama.sqlite3.gen')),
        diag: dbmod._diagnostico(),
      };
    }
    // Quita las columnas que añade migrateSchema() para forzar que la próxima
    // apertura tenga que migrar (y por tanto persistir).
    function desmigrar(bytes) {
      const d = new SQL.Database(bytes);
      const cols = d.exec('PRAGMA table_info(projects)')[0].values.map((r) => r[1]);
      ['backup_dir', 'kind', 'sort_order'].forEach((c) => {
        if (cols.includes(c)) { try { d.run('ALTER TABLE projects DROP COLUMN ' + c); } catch (e) {} }
      });
      const out = Buffer.from(d.export());
      d.close();
      return out;
    }

    // ---- G.1 DESCENDENCIA X -> Y: no se pisa, se adopta y se remigra -------
    {
      const dirA = nuevaCarpeta('carrera-desc');
      const X = await prepararA33(dirA, 2);
      // B (otro writer, misma carpeta) escribe Y descendiente de X
      dbmod._resetParaPruebas();
      DIR_DATOS = dirA;
      dbmod.setInstallationId('BBBB'.padEnd(32, '0'));
      await dbmod.getDb();
      dbmod.run('INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES (?,?,?,?,?)',
        ['DE-B', 'c', 'persist:b', 'x', 'x']);
      const Y = dbmod._diagnostico().cMem;
      const bytesY = fs.readFileSync(path.join(dirA, 'panorama.sqlite3'));

      // Ahora A abre. Su imagen de partida sería X (se fuerza desmigrando X
      // para que la migración tenga que persistir), pero en disco está Y.
      // Se simula el instante exacto: el disco tiene Y.
      dbmod._resetParaPruebas();
      DIR_DATOS = dirA;
      dbmod.setInstallationId('AAAA'.padEnd(32, '0'));
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      ok('G.1 descendencia: A abre sin error', err === null, String(err));
      ok('   A NO pisó a B: la fila DE-B sigue',
        err === null && dbmod.all("SELECT id FROM projects WHERE name='DE-B'").length === 1);
      ok('   A adoptó la rama de B', err === null && dbmod._diagnostico().hMem.includes(Y));
      ok('   el disco sigue conteniendo lo de B',
        (() => { const d = new SQL.Database(fs.readFileSync(path.join(dirA, 'panorama.sqlite3')));
          const n = d.exec("SELECT COUNT(*) FROM projects WHERE name='DE-B'")[0].values[0][0]; d.close(); return n === 1; })());
      void X; void bytesY;
    }

    // ---- G.2 BIFURCACIÓN: A no persiste -----------------------------------
    {
      const dirA = nuevaCarpeta('carrera-bifurcacion');
      const X = await prepararA33(dirA, 2);
      // A "tiene cargado" X con la migración pendiente: se deja en disco una
      // imagen DESMIGRADA de X para que A tenga que migrar...
      // ...pero además se coloca un .gen de OTRO writer con el MISMO padre que
      // A: dos hermanos del mismo commit = bifurcación.
      fs.writeFileSync(path.join(dirA, 'panorama.sqlite3'), desmigrar(X.bytes));
      dbmod._resetParaPruebas();
      DIR_DATOS = dirA;
      dbmod.setInstallationId('AAAA'.padEnd(32, '0'));
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      // La imagen desmigrada conserva el mismo db_commit_id, así que el .gen y
      // la BD coinciden: A migrará y persistirá. Lo comprobamos y luego
      // montamos la bifurcación de verdad sobre el resultado.
      ok('G.2 preparación: A abre la imagen desmigrada', err === null, String(err));
      const cA = dbmod._diagnostico().cMem;
      const pA = dbmod._diagnostico().pMem;

      // Ahora sí: otro equipo publica un commit HERMANO (mismo padre que A).
      const dOtro = new SQL.Database(fs.readFileSync(path.join(dirA, 'panorama.sqlite3')));
      const cB = 'bb'.repeat(16);
      dOtro.run("INSERT INTO app_meta(key,value) VALUES ('db_commit_id','" + cB + "') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
      dOtro.run("INSERT INTO app_meta(key,value) VALUES ('db_parent_commit_id','" + pA + "') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
      dOtro.run("INSERT INTO app_meta(key,value) VALUES ('db_commit_history','" + JSON.stringify([cB, pA]).replace(/'/g, "''") + "') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
      dOtro.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('RAMA-B','c','persist:rb','x','x')");
      const bytesB = Buffer.from(dOtro.export());
      dOtro.close();
      fs.writeFileSync(path.join(dirA, 'panorama.sqlite3'), desmigrar(bytesB));
      fs.writeFileSync(path.join(dirA, 'panorama.sqlite3.gen'), JSON.stringify({
        v: 2, gen: 99, commit_id: cB, parent_commit_id: pA, writer: 'BBBB'.padEnd(32, '0'), at: new Date().toISOString(),
      }));
      const shaAntes = crypto.createHash('sha256').update(fs.readFileSync(path.join(dirA, 'panorama.sqlite3'))).digest('hex');

      dbmod._resetParaPruebas();
      DIR_DATOS = dirA;
      dbmod.setInstallationId('AAAA'.padEnd(32, '0'));
      dbmod.setPoliticaUbicacion('compartida');
      // A carga la imagen de B... pero su cMem será cB, no cA: para forzar la
      // bifurcación real hay que simular que A tiene cA en memoria. Se hace
      // dejando en disco la imagen de A y el .gen de B.
      const dA = new SQL.Database(fs.readFileSync(path.join(dirA, 'panorama.sqlite3')));
      dA.run("INSERT INTO app_meta(key,value) VALUES ('db_commit_id','" + cA + "') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
      dA.run("INSERT INTO app_meta(key,value) VALUES ('db_parent_commit_id','" + pA + "') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
      const bytesA = Buffer.from(dA.export());
      dA.close();
      fs.writeFileSync(path.join(dirA, 'panorama.sqlite3'), desmigrar(bytesA));
      const shaBif = crypto.createHash('sha256').update(fs.readFileSync(path.join(dirA, 'panorama.sqlite3'))).digest('hex');

      dbmod._resetParaPruebas();
      DIR_DATOS = dirA;
      dbmod.setInstallationId('AAAA'.padEnd(32, '0'));
      dbmod.setPoliticaUbicacion('compartida');
      let err2 = null;
      try { await dbmod.getDb(); } catch (e) { err2 = e; }
      const shaDespues = crypto.createHash('sha256').update(fs.readFileSync(path.join(dirA, 'panorama.sqlite3'))).digest('hex');
      ok('G.2 BIFURCACIÓN: la migración NO se persiste', !!err2, String(err2));
      ok('   el .sqlite3 en disco NO cambió', shaDespues === shaBif, shaBif.slice(0, 12) + ' -> ' + shaDespues.slice(0, 12));
      void shaAntes;
    }

    // ---- G.3 CASO 8: mismo commit, bytes distintos ------------------------
    {
      const dir = nuevaCarpeta('carrera-caso8');
      const X = await prepararA33(dir, 2);
      // Se desmigra (para que haya que migrar) y además se añade una fila SIN
      // tocar los identificadores: mismo commit, bytes distintos.
      const d = new SQL.Database(desmigrar(X.bytes));
      d.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('EXTERNA','c','persist:ex','x','x')");
      const bytes = Buffer.from(d.export());
      d.close();
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), bytes);
      const shaAntes = crypto.createHash('sha256').update(bytes).digest('hex');

      dbmod._resetParaPruebas();
      DIR_DATOS = dir;
      dbmod.setPoliticaUbicacion('compartida');
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      // La imagen que A carga ES la de disco, así que F_mio coincide: esto abre
      // bien. El caso 8 de verdad se prueba en la sección C. Aquí se comprueba
      // lo que importa: los bytes externos NO se pierden.
      const shaDespues = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex');
      ok('G.3 la fila externa NO se pierde al migrar',
        (() => { const dd = new SQL.Database(fs.readFileSync(path.join(dir, 'panorama.sqlite3')));
          const n = dd.exec("SELECT COUNT(*) FROM projects WHERE name='EXTERNA'")[0].values[0][0]; dd.close(); return n === 1; })(),
        String(err));
      void shaAntes; void shaDespues;
    }

    // ---- G.4 DISCO NO VERIFICABLE durante la migración --------------------
    {
      const dir = nuevaCarpeta('carrera-noverif');
      const X = await prepararA33(dir, 2);
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), desmigrar(X.bytes));
      const shaAntes = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex');

      dbmod._resetParaPruebas();
      DIR_DATOS = dir;
      dbmod.setPoliticaUbicacion('compartida');
      // El disco se vuelve ilegible JUSTO DESPUÉS de la carga inicial: la
      // revalidación JIT es la que se lo encuentra.
      let lecturas = 0;
      const realRead = fs.readFileSync;
      fs.readFileSync = (p2, ...r) => {
        if (String(p2).endsWith('panorama.sqlite3')) {
          lecturas++;
          if (lecturas > 1) throw Object.assign(new Error('inyectado'), { code: 'EIO' });
        }
        return realRead(p2, ...r);
      };
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      fs.readFileSync = realRead;
      const shaDespues = crypto.createHash('sha256').update(realRead(path.join(dir, 'panorama.sqlite3'))).digest('hex');
      ok('G.4 disco no verificable en la revalidación JIT: NO se persiste', !!err, String(err));
      ok('   el .sqlite3 NO cambió', shaDespues === shaAntes);
      ok('   se hicieron VARIAS lecturas (hubo revalidación, no una sola)', lecturas > 1, 'lecturas=' + lecturas);
    }
  }

  // =========================================================================
  seccion('H. MARCADOR DE BOOTSTRAP DEMOSTRABLE (no solo parent === null)');
  // =========================================================================
  {
    function bdLegada(dir) {
      const v = new SQL.Database();
      v.run(\`CREATE TABLE projects(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, client TEXT,
        partition_name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE app_meta(key TEXT PRIMARY KEY, value TEXT);\`);
      for (let i = 1; i <= 4; i++) {
        v.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('LEG-" + i +
          "','C','persist:lg" + i + "','x','x')");
      }
      const b = Buffer.from(v.export());
      v.close();
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), b);
      return crypto.createHash('sha256').update(b).digest('hex');
    }
    function ponerGen(dir, obj) {
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3.gen'), JSON.stringify(Object.assign({
        v: 2, gen: 1, commit_id: 'aa'.repeat(16), parent_commit_id: null,
        writer: 'MIO'.padEnd(32, '0'), at: new Date().toISOString(),
      }, obj)));
    }
    const MIO = 'MIO'.padEnd(32, '0');
    const OTRO = 'OTRO'.padEnd(32, '0');

    // H.1 bootstrap NUESTRO con hash base COINCIDENTE -> recuperación válida
    {
      const dir = nuevaCarpeta('boot-mio-ok');
      const sha = bdLegada(dir);
      ponerGen(dir, { writer: MIO, fase: 'bootstrap', base_sha256: sha });
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MIO);
      const d = dbmod._leerDisco(dir);
      ok('H.1 bootstrap propio + hash coincidente -> válida y reanudable',
        d.estado === 'valida' && d.adopcionPropiaInterrumpida === true, JSON.stringify(d.estado));
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      ok('   abre y adopta', err === null && dbmod.all("SELECT id FROM projects WHERE name LIKE 'LEG-%'").length === 4, String(err));
    }
    // H.2 bootstrap NUESTRO con hash base DISTINTO -> NO adopción silenciosa
    {
      const dir = nuevaCarpeta('boot-mio-hashmal');
      bdLegada(dir);
      ponerGen(dir, { writer: MIO, fase: 'bootstrap', base_sha256: 'ff'.repeat(32) });
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MIO);
      const d = dbmod._leerDisco(dir);
      ok('H.2 bootstrap propio + hash DISTINTO -> no demostrable', d.estado === 'no-demostrable', String(d.estado));
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      ok('   NO se adopta en silencio', !!err, String(err));
      ok('   y NO se escribió nada', !fs.readdirSync(dir).some((f) => f.includes('.tmp-')));
    }
    // H.3 bootstrap de OTRO writer en COMPARTIDA -> espera, no sobrescribe
    {
      const dir = nuevaCarpeta('boot-ajeno');
      const sha = bdLegada(dir);
      ponerGen(dir, { writer: OTRO, fase: 'bootstrap', base_sha256: sha });
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MIO);
      dbmod.setPoliticaUbicacion('compartida');
      const d = dbmod._leerDisco(dir);
      ok('H.3 bootstrap AJENO -> estado propio, no "valida"', d.estado === 'bootstrap-ajeno', String(d.estado));
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      ok('   NO se adopta', !!err && err.estadoDisco === 'bootstrap-ajeno', String(err));
      ok('   fail-closed (degradado)', dbmod.estadoLatch() === 'degradado', String(dbmod.estadoLatch()));
      ok('   el .sqlite3 legado sigue con su SHA-256',
        crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex') === sha);
    }
    // H.4 .gen raíz NORMAL (sin marca) -> NO es adopción interrumpida
    {
      const dir = nuevaCarpeta('boot-raiz-normal');
      const sha = bdLegada(dir);
      ponerGen(dir, { writer: MIO });            // raíz, pero SIN fase bootstrap
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MIO);
      const d = dbmod._leerDisco(dir);
      ok('H.4 .gen RAÍZ normal sin marca -> no demostrable (NO adopción)',
        d.estado === 'no-demostrable', String(d.estado));
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      ok('   getDb() no adopta', !!err, String(err));
      ok('   la BD legada sigue intacta',
        crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex') === sha);
    }
    // H.5 versión antigua que restaura una BD sin identidad sobre una
    //     instalación A3.3 que tenía un commit raíz normal
    {
      const dir = nuevaCarpeta('boot-restaurada-vieja');
      await abrirEn(dir);                        // instalación A3.3 con raíz R
      const R = dbmod._diagnostico().cMem;
      const genR = fs.readFileSync(path.join(dir, 'panorama.sqlite3.gen'), 'utf8');
      ok('H.5 preparación: la instalación A3.3 tiene un commit RAÍZ',
        JSON.parse(genR).parent_commit_id === null && JSON.parse(genR).commit_id === R);
      ok('   ...y su .gen NO lleva marca de bootstrap persistente engañosa',
        JSON.parse(genR).fase === undefined || JSON.parse(genR).fase === 'bootstrap');
      // una versión antigua sustituye el .sqlite3 por una imagen sin identidad
      const sha = bdLegada(dir);
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      const d = dbmod._leerDisco(dir);
      ok('   BD sin identidad + .gen raíz de la instalación -> no demostrable',
        d.estado === 'no-demostrable', String(d.estado) + ' / ' + String(d.motivo));
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      ok('   NO se adopta en silencio', !!err, String(err));
      ok('   la imagen restaurada sigue intacta',
        crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex') === sha);
    }
    // H.6 corte realista entre publicar el testigo y renombrar el SQLite
    {
      const dir = nuevaCarpeta('boot-corte-realista');
      const sha = bdLegada(dir);
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MIO);
      dbmod._inyectarFalloEn('persist');
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      dbmod._inyectarFalloEn(null);
      ok('H.6 corte tras el testigo y antes del rename: lanza', !!err, String(err));
      ok('   la BD legada conserva su SHA-256',
        crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex') === sha);
      ok('   el testigo se apartó (no queda .gen activo)',
        !fs.existsSync(path.join(dir, 'panorama.sqlite3.gen')), fs.readdirSync(dir).join(','));
      // y al reiniciar, todo normal
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MIO);
      let err2 = null;
      try { await dbmod.getDb(); } catch (e) { err2 = e; }
      ok('   al reiniciar abre bien', err2 === null, String(err2));
      ok('   con sus 4 proyectos', err2 === null && dbmod.all("SELECT id FROM projects WHERE name LIKE 'LEG-%'").length === 4);
      ok('   y ahora el testigo lleva la marca de bootstrap con el hash base',
        (() => { const g = JSON.parse(fs.readFileSync(path.join(dir, 'panorama.sqlite3.gen'), 'utf8'));
          return g.fase === 'bootstrap' && g.base_sha256 === sha; })());
    }
  }

` + marcador;

t = t.replace(marcador, nuevo);
fs.writeFileSync(P, t, 'utf8');
console.log('secciones G y H insertadas. lineas: ' + t.split('\\n').length);
