'use strict';
const fs = require('fs');
const P = 'C:\\Users\\ADMIN~1.JLO\\AppData\\Local\\Temp\\claude\\C--Codigo-Fuente-PS\\e55d4471-ea3f-4279-b758-0366ccb6384c\\scratchpad\\nucleo-a33\\test-nucleo.js';
let t = fs.readFileSync(P, 'utf8');

if (t.includes('14. "AUSENTE" NO AUTORIZA A CREAR')) { console.log('ya estaba'); process.exit(0); }

const marcador = "  // =========================================================================\n  console.log('\\n' + '='.repeat(66));";
if (!t.includes(marcador)) { console.log('MARCADOR NO ENCONTRADO'); process.exit(1); }

const nuevo = `  // =========================================================================
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

      ok(\`[\${politica}] BD invisible: abrir() NO crea nada, lanza\`, !!err, String(err));
      ok(\`   estadoDisco = 'ausente' (hecho observado)\`, err && err.estadoDisco === 'ausente',
        String(err && err.estadoDisco));
      ok(\`   NO se creó una BD nueva: mismo SHA-256\`,
        crypto.createHash('sha256').update(fs.readFileSync(k0.rutas().dbPath)).digest('hex') === shaAntes);
      ok(\`   los bytes originales están intactos\`, fs.readFileSync(k0.rutas().dbPath).equals(bytesAntes));
      ok(\`   el .gen NO se tocó\`, fs.readFileSync(k0.rutas().genPath).equals(genAntes));
      ok(\`   no aparecieron temporales\`, !fs.readdirSync(dir).some((f) => f.includes('.tmp-')),
        fs.readdirSync(dir).join(','));
      if (politica !== 'local') {
        ok(\`   COMPARTIDA/DESCONOCIDA -> fail-closed ('degradado')\`,
          k.estado().escrituraBloqueada === 'degradado', String(k.estado().escrituraBloqueada));
      }

      // (e) al recuperar la visibilidad, abre la ORIGINAL y sin generación espuria
      const k2 = N.crearNucleo({ dir, SQL, installationId: C('PCA'), politica });
      k2.abrir();                                    // sigue SIN crearSiAusente
      ok(\`   al recuperar el acceso, abre la BD ORIGINAL\`,
        k2.estado().cMem === k0.estado().cMem, k2.estado().cMem + ' vs ' + k0.estado().cMem);
      ok(\`   ...sin generación espuria\`, k2.estado().gMem === k0.estado().gMem,
        k2.estado().gMem + ' vs ' + k0.estado().gMem);
      ok(\`   ...y la fila valiosa sigue\`,
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
      ok(\`[\${politica}] carpeta virgen: pareceUbicacionNueva() = true\`,
        k.pareceUbicacionNueva().nueva === true, JSON.stringify(k.pareceUbicacionNueva()));
      k.abrir({ crearSiAusente: true });
      ok(\`   con autorización explícita SÍ crea la BD\`, fs.existsSync(k.rutas().dbPath));
      ok(\`   ...con su .gen coherente\`, k._leerGen().C === k._leerDisco().C);
      ok(\`   ...generación 1\`, k.estado().gMem === 1, 'gMem=' + k.estado().gMem);
      k.run('INSERT INTO projects(name) VALUES (?)', ['primera']);
      ok(\`   ...y se puede escribir\`, k.get('SELECT COUNT(*) FROM projects')[0][0] === 1);
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

` + marcador;

t = t.replace(marcador, nuevo);
fs.writeFileSync(P, t, 'utf8');
console.log('seccion 14 insertada. lineas: ' + t.split('\n').length);
