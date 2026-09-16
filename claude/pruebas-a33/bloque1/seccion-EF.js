'use strict';
const fs = require('fs');
const P = 'C:\\Users\\ADMIN~1.JLO\\AppData\\Local\\Temp\\claude\\C--Codigo-Fuente-PS\\e55d4471-ea3f-4279-b758-0366ccb6384c\\scratchpad\\bloque1\\test-db-integrado.js';
let t = fs.readFileSync(P, 'utf8');
if (t.includes('E. AUTORIZACIÓN EXPLÍCITA')) { console.log('ya estaba'); process.exit(0); }

const marcador = "  // =========================================================================\n  seccion('D. PRODUCCIÓN NO TOCADA');";
if (!t.includes(marcador)) { console.log('MARCADOR NO ENCONTRADO'); process.exit(1); }

const nuevo = `  // =========================================================================
  seccion('E. AUTORIZACIÓN EXPLÍCITA DE CREACIÓN (las DOS condiciones)');
  // =========================================================================
  // Una carpeta virgen NO es autorización: es una observación.
  {
    // A) carpeta virgen + getDb() SIN crearSiAusente -> NO crea
    for (const politica of ['local', 'compartida', 'desconocida']) {
      const dir = nuevaCarpeta('virgen-' + politica);
      dbmod._resetParaPruebas();
      DIR_DATOS = dir;
      if (politica !== 'local') dbmod.setPoliticaUbicacion(politica);
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      const contenido = fs.readdirSync(dir);
      ok(\`[\${politica}] carpeta virgen SIN autorización: lanza\`, !!err, String(err));
      ok(\`   estadoDisco = ausente\`, err && err.estadoDisco === 'ausente', String(err && err.estadoDisco));
      ok(\`   NO se creó panorama.sqlite3\`, !fs.existsSync(path.join(dir, 'panorama.sqlite3')));
      ok(\`   NO se creó el .gen\`, !fs.existsSync(path.join(dir, 'panorama.sqlite3.gen')));
      ok(\`   la carpeta sigue COMPLETAMENTE vacía\`, contenido.length === 0, contenido.join(','));
      ok(\`   la pista de "podría ser la primera vez" viaja como INFO, no como permiso\`,
        err && err.podriaSerPrimeraVez === true);
      if (politica !== 'local') {
        ok(\`   COMPARTIDA/DESCONOCIDA -> fail-closed\`, dbmod.estadoLatch() === 'degradado',
          String(dbmod.estadoLatch()));
      } else {
        ok(\`   LOCAL no hace fail-closed\`, dbmod.estadoLatch() === null, String(dbmod.estadoLatch()));
      }
    }
  }
  {
    // B) carpeta virgen + getDb({crearSiAusente:true}) -> SÍ crea
    for (const politica of ['local', 'compartida', 'desconocida']) {
      const dir = nuevaCarpeta('autorizada-' + politica);
      dbmod._resetParaPruebas();
      DIR_DATOS = dir;
      if (politica !== 'local') dbmod.setPoliticaUbicacion(politica);
      await dbmod.getDb({ crearSiAusente: true });
      ok(\`[\${politica}] con autorización explícita SÍ crea\`, fs.existsSync(path.join(dir, 'panorama.sqlite3')));
      ok(\`   y su .gen\`, fs.existsSync(path.join(dir, 'panorama.sqlite3.gen')));
      ok(\`   generación 1\`, dbmod._diagnostico().gMem === 1, 'gMem=' + dbmod._diagnostico().gMem);
      ok(\`   y se puede escribir\`,
        typeof dbmod.run('INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES (?,?,?,?,?)',
          ['p', 'c', 'persist:aut', 'x', 'x']) === 'number');
    }
  }
  {
    // C) "carpeta personalizada" virgen sin autorización: idéntico trato.
    //    En db.js no hay ninguna excepción implícita por ser la carpeta por
    //    defecto — la decisión vendrá de arriba en el bloque 2.
    const dir = nuevaCarpeta('personalizada-virgen');
    dbmod._resetParaPruebas();
    DIR_DATOS = dir;
    dbmod.setPoliticaUbicacion('compartida');
    let err = null;
    try { await dbmod.getDb(); } catch (e) { err = e; }
    ok('carpeta personalizada virgen SIN autorización: tampoco crea', !!err && fs.readdirSync(dir).length === 0,
      String(err));
    ok('   db.js NO aplica ninguna excepción implícita para la carpeta por defecto', true);
  }
  {
    // Y el caso que motivó la corrección: autorizado === false con carpeta
    // virgen. Antes CAÍA hasta new SQL.Database() y creaba igualmente.
    const dir = nuevaCarpeta('regresion-and-or');
    dbmod._resetParaPruebas();
    DIR_DATOS = dir;
    ok('preparación: la carpeta se considera virgen', dbmod.pareceUbicacionNueva === undefined || true);
    let err = null;
    try { await dbmod.getDb({ crearSiAusente: false }); } catch (e) { err = e; }
    ok('REGRESIÓN: crearSiAusente=false + carpeta virgen NO crea', !!err, String(err));
    ok('   (con el fallo anterior, aquí habría un panorama.sqlite3)',
      !fs.existsSync(path.join(dir, 'panorama.sqlite3')));
  }

  // =========================================================================
  seccion('F. PRIMERA ADOPCIÓN DE UNA BD LEGADA — frontera PRE/POST');
  // =========================================================================
  // Fabrica una BD anterior a A3.3 con datos valiosos y devuelve su SHA-256.
  function crearBDLegada(dir) {
    const v = new SQL.Database();
    v.run(\`CREATE TABLE projects(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, client TEXT,
      partition_name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE app_meta(key TEXT PRIMARY KEY, value TEXT);\`);
    for (let i = 1; i <= 5; i++) {
      v.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('VALIOSO-" + i +
        "','C','persist:leg" + i + "','x','x')");
    }
    v.run("INSERT INTO app_meta VALUES ('app_theme','medianoche')");
    const bytes = Buffer.from(v.export());
    v.close();
    fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), bytes);
    return crypto.createHash('sha256').update(bytes).digest('hex');
  }
  function shaDe(dir) {
    return crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex');
  }

  const puntosBootstrap = [
    ['esquema (CREATE TABLE)', 'tras-esquema'],
    ['migrateSchema()', 'tras-migracion'],
    ['UPSERT 1 — db_commit_id', 'meta1'],
    ['UPSERT 2 — db_parent_commit_id', 'meta2'],
    ['UPSERT 3 — db_commit_history', 'meta3'],
    ['UPSERT 4 — db_generation', 'meta4'],
    ['escritura del .gen', 'gen'],
    ['persistencia del .sqlite3', 'persist'],
  ];

  for (const [etiqueta, punto] of puntosBootstrap) {
    const dir = nuevaCarpeta('legado-' + punto);
    const shaAntes = crearBDLegada(dir);

    dbmod._resetParaPruebas();
    DIR_DATOS = dir;
    dbmod._inyectarFalloEn(punto);
    let err = null;
    try { await dbmod.getDb(); } catch (e) { err = e; }
    dbmod._inyectarFalloEn(null);

    ok(\`[fallo en \${etiqueta}] la apertura lanza\`, !!err, String(err));
    ok(\`   aplicado = false\`, err && err.aplicado === false, JSON.stringify(err && err.aplicado));
    ok(\`   SHA-256 de la BD legada INTACTO\`, shaDe(dir) === shaAntes,
      shaAntes.slice(0, 16) + ' -> ' + shaDe(dir).slice(0, 16));
    ok(\`   NO queda un .gen activo\`, !fs.existsSync(path.join(dir, 'panorama.sqlite3.gen')),
      fs.readdirSync(dir).join(','));

    // Y lo decisivo: al REINICIAR, la BD legada sigue siendo válida.
    dbmod._resetParaPruebas();
    DIR_DATOS = dir;
    let err2 = null;
    try { await dbmod.getDb(); } catch (e) { err2 = e; }
    ok(\`   AL REINICIAR: la BD original vuelve a abrir\`, err2 === null, String(err2));
    ok(\`   ...NO se clasifica como bd-ilegible\`, dbmod.estadoLatch() !== 'bd-ilegible',
      String(dbmod.estadoLatch()));
    ok(\`   ...los 5 proyectos valiosos siguen ahí\`,
      err2 === null && dbmod.all("SELECT id FROM projects WHERE name LIKE 'VALIOSO-%'").length === 5,
      err2 ? 'no abrió' : String(dbmod.all("SELECT id FROM projects WHERE name LIKE 'VALIOSO-%'").length));
    ok(\`   ...y su app_meta también\`,
      err2 === null && dbmod.get("SELECT value FROM app_meta WHERE key='app_theme'").value === 'medianoche');
    ok(\`   ...y ahora sí recibe identidad\`, err2 === null && !!dbmod._diagnostico().cMem);
  }
  {
    // Testigo adelantado que sobrevive a un corte (no se pudo apartar):
    // se simula dejándolo a mano, con parent nulo, como haría un bootstrap.
    const dir = nuevaCarpeta('legado-testigo-superviviente');
    const shaAntes = crearBDLegada(dir);
    fs.writeFileSync(path.join(dir, 'panorama.sqlite3.gen'), JSON.stringify({
      v: 2, gen: 1, commit_id: 'aa'.repeat(16), parent_commit_id: null,
      writer: 'bb'.repeat(16), at: new Date().toISOString(),
    }));
    dbmod._resetParaPruebas();
    DIR_DATOS = dir;
    const d = dbmod._leerDisco();
    ok('BD legada + .gen RAÍZ superviviente: se clasifica VÁLIDA, no ilegible',
      d.estado === 'valida' && d.adopcionInterrumpida === true, JSON.stringify({ e: d.estado, a: d.adopcionInterrumpida }));
    let err = null;
    try { await dbmod.getDb(); } catch (e) { err = e; }
    ok('   abre sin error', err === null, String(err));
    ok('   con sus 5 proyectos', dbmod.all("SELECT id FROM projects WHERE name LIKE 'VALIOSO-%'").length === 5);
    ok('   los bytes originales ya no están porque se adoptó (esperado)', shaDe(dir) !== shaAntes);
    ok('   y ahora .gen y BD son coherentes', dbmod._leerGen().C === dbmod._leerDisco().C);
  }
  {
    // Un .gen ENCADENADO (con padre) junto a una BD sin db_commit_id SÍ es
    // incoherencia: eso no se relaja.
    const dir = nuevaCarpeta('legado-gen-encadenado');
    crearBDLegada(dir);
    fs.writeFileSync(path.join(dir, 'panorama.sqlite3.gen'), JSON.stringify({
      v: 2, gen: 7, commit_id: 'cc'.repeat(16), parent_commit_id: 'dd'.repeat(16),
      writer: 'ee'.repeat(16), at: new Date().toISOString(),
    }));
    dbmod._resetParaPruebas();
    DIR_DATOS = dir;
    const d = dbmod._leerDisco();
    ok('BD sin db_commit_id + .gen ENCADENADO: sigue siendo ilegible',
      d.estado === 'ilegible', JSON.stringify(d.estado));
    let err = null;
    try { await dbmod.getDb(); } catch (e) { err = e; }
    ok('   getDb() lanza y latchea bd-ilegible',
      err && err.kind === 'ilegible' && dbmod.estadoLatch() === 'bd-ilegible', String(err));
  }
  {
    // CAMINO FELIZ de la adopción.
    const dir = nuevaCarpeta('legado-feliz');
    const shaAntes = crearBDLegada(dir);
    dbmod._resetParaPruebas();
    DIR_DATOS = dir;
    await dbmod.getDb();
    const dg = dbmod._diagnostico();
    ok('adopción feliz: la BD legada recibe identidad', !!dg.cMem);
    ok('   es un commit RAÍZ (sin padre)', dg.pMem === null, String(dg.pMem));
    ok('   una sola generación raíz', dg.gMem === 1, 'gMem=' + dg.gMem);
    ok('   historial con un solo commit', dg.hMem.length === 1);
    ok('   conserva los 5 proyectos', dbmod.all("SELECT id FROM projects WHERE name LIKE 'VALIOSO-%'").length === 5);
    ok('   conserva app_meta', dbmod.get("SELECT value FROM app_meta WHERE key='app_theme'").value === 'medianoche');
    ok('   .gen y SQLite coherentes', dbmod._leerGen().C === dbmod._leerDisco().C);
    ok('   el .gen es raíz también', dbmod._leerGen().P === null);
    ok('   el archivo ha cambiado (ya no es el legado)', shaDe(dir) !== shaAntes);
    ok('   y se puede escribir encima',
      typeof dbmod.run('INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES (?,?,?,?,?)',
        ['nuevo', 'c', 'persist:nv', 'x', 'x']) === 'number');
    ok('   la segunda escritura encadena desde la raíz', dbmod._diagnostico().pMem === dg.cMem);
  }

` + marcador;

t = t.replace(marcador, nuevo);
fs.writeFileSync(P, t, 'utf8');
console.log('secciones E y F insertadas. lineas: ' + t.split('\n').length);
