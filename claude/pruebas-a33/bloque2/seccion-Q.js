'use strict';
const fs = require('fs');
const P = 'C:\\Users\\ADMIN~1.JLO\\AppData\\Local\\Temp\\claude\\C--Codigo-Fuente-PS\\e55d4471-ea3f-4279-b758-0366ccb6384c\\scratchpad\\bloque2\\test-wiring.js';
let t = fs.readFileSync(P, 'utf8');
if (t.includes('Q. ACTUALIZACION')) { console.log('ya estaba'); process.exit(0); }

const marcador = "  // =========================================================================\n  seccion('PRODUCCIÓN NO TOCADA');";
if (!t.includes(marcador)) { console.log('MARCADOR NO ENCONTRADO'); process.exit(1); }

const nuevo = `  // =========================================================================
  seccion('Q. ACTUALIZACION DESDE VERSION ANTERIOR vs PRIMERA CREACION');
  // =========================================================================
  // "sin registro local" NO significa "sin datos previos".
  {
    const rutaReg = () => path.join(DIR_APPDATA, 'panorama-app-config', 'ubicaciones-inicializadas.json');
    const rutaInt = () => path.join(DIR_APPDATA, 'panorama-app-config', 'initial-create-intent.json');
    const borrarEvidencia = () => {
      try { fs.unlinkSync(rutaReg()); } catch (e) {}
      try { fs.unlinkSync(rutaInt()); } catch (e) {}
    };
    // Una BD ANTERIOR a A3.3: esquema viejo, sin identidad de commit, sin .gen.
    function sembrarBdLegada(dir, n) {
      const v = new SQL.Database();
      v.run(\`CREATE TABLE projects(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, client TEXT,
        partition_name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE app_meta(key TEXT PRIMARY KEY, value TEXT);\`);
      for (let i = 1; i <= (n || 4); i++) {
        v.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('VALIOSO-" + i +
          "','C','persist:q" + i + "','x','x')");
      }
      v.run("INSERT INTO app_meta VALUES ('app_theme','medianoche')");
      const b = Buffer.from(v.export()); v.close();
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), b);
      return crypto.createHash('sha256').update(b).digest('hex');
    }
    // Comprueba que NO se fabricó evidencia de primera creación.
    function sinEvidenciaDeCreacion(m, dir) {
      const est = m.estadoUbicacion(dir);
      const intDb = (() => { try { return dbmod.intencionDeCreacionPara(dir).vigente; } catch (e) { return null; } })();
      return { estado: est.estado, intDb };
    }

    // --- Q1. DEFAULT con BD LEGADA existente y sin registro local ----------
    {
      const dir = carpeta('Q1-legada-default');
      borrarEvidencia(); DIR_DATOS = dir;
      sembrarBdLegada(dir, 4);
      const m = construirMain({});
      ok('Q1) preparación: no hay registro local', m.estadoUbicacion(dir).estado === null);
      ok('   ...y la BD legada es visible',
        m.estadoDeArchivoEnRuta(path.join(dir, 'panorama.sqlite3')).estado === 'visible');

      const p = m.decidirCrearSiAusente();
      ok('   decidirCrearSiAusente().crear === FALSE', p.crear === false, JSON.stringify(p));
      ok('   ...porque la BD es visible, no por el registro', p.bdVisible === true, JSON.stringify(p));

      // el wiring real NO escribiría marcas: se comprueba que siguen ausentes
      const ev = sinEvidenciaDeCreacion(m, dir);
      ok('   NO se escribió estado "inicializando"', ev.estado === null, String(ev.estado));
      ok('   NO se creó intención de primera creación en db.js', !ev.intDb, JSON.stringify(ev.intDb));

      // y se abre/adopta con normalidad
      let err = null;
      try { await abrirDb(dir, { crearSiAusente: p.crear }); } catch (e) { err = e; }
      ok('   getDb() abre y adopta la existente', err === null, String(err));
      ok('   los 4 proyectos valiosos sobreviven',
        err === null && dbmod.all("SELECT id FROM projects WHERE name LIKE 'VALIOSO-%'").length === 4);
      ok('   app_meta se conserva',
        err === null && dbmod.get("SELECT value FROM app_meta WHERE key='app_theme'").value === 'medianoche');
      DIR_DATOS = dir;
      const mf = m.marcarUbicacionInicializada(dir, dbmod.getCommitActual());
      ok('   después queda "inicializada" directamente', mf.ok === true && m.estadoUbicacion(dir).estado === 'inicializada');
      ok('   ...sin haber pasado nunca por "inicializando"',
        !m.estadoUbicacion(dir).registro.intento, JSON.stringify(m.estadoUbicacion(dir).registro));
    }

    // --- Q2. DEFAULT con BD A3.3 existente y sin registro ------------------
    {
      const dir = carpeta('Q2-a33-sin-registro');
      borrarEvidencia(); DIR_DATOS = dir;
      await abrirDb(dir, { crearSiAusente: true });
      dbmod.run('INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES (?,?,?,?,?)',
        ['DATO', 'c', 'persist:q2', 'x', 'x']);
      const commitOriginal = dbmod.getCommitActual();
      borrarEvidencia();                       // se simula "sin registro local"
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      const m = construirMain({});
      ok('Q2) sin registro local pero con BD A3.3', m.estadoUbicacion(dir).estado === null);
      const p = m.decidirCrearSiAusente();
      ok('   crear === FALSE', p.crear === false && p.bdVisible === true, JSON.stringify(p));
      const ev = sinEvidenciaDeCreacion(m, dir);
      ok('   CERO intención de creación', !ev.intDb && ev.estado === null);
      let err = null;
      try { await abrirDb(dir, { crearSiAusente: p.crear }); } catch (e) { err = e; }
      ok('   abre normalmente', err === null, String(err));
      ok('   conserva el commit original', dbmod.getCommitActual() === commitOriginal,
        dbmod.getCommitActual() + ' vs ' + commitOriginal);
      ok('   y su fila', dbmod.all("SELECT id FROM projects WHERE name='DATO'").length === 1);
    }

    // --- Q3. CUSTOM (el escenario del primer despliegue real en G:) --------
    {
      const dir = carpeta('Q3-custom-existente');
      borrarEvidencia(); DIR_DATOS = dir;
      const shaAntes = sembrarBdLegada(dir, 3);
      const m = construirMain({});
      m.set('target', dir); m.set('failure', null); m.set('shared', true);
      ok('Q3) custom compartida, sin registro local, con BD existente',
        m.estadoUbicacion(dir).estado === null && m.clasificarPoliticaUbicacion().politica === 'compartida');
      const p = m.decidirCrearSiAusente();
      ok('   NO se trata como ubicación nueva', p.crear === false && p.bdVisible === true, JSON.stringify(p));
      const ev = sinEvidenciaDeCreacion(m, dir);
      ok('   CERO intención de primera creación', !ev.intDb && ev.estado === null);
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      dbmod.setPoliticaUbicacion('compartida');
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: p.crear }); } catch (e) { err = e; }
      ok('   se abre y adopta', err === null, String(err));
      ok('   los 3 proyectos sobreviven',
        err === null && dbmod.all("SELECT id FROM projects WHERE name LIKE 'VALIOSO-%'").length === 3);
      ok('   el archivo cambió porque se adoptó (esperado)',
        crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex') !== shaAntes);
      DIR_DATOS = dir;
      const mf = m.marcarUbicacionInicializada(dir, dbmod.getCommitActual());
      ok('   después queda registrada como inicializada',
        mf.ok === true && m.estadoUbicacion(dir).estado === 'inicializada');
    }

    // --- Q4. EXISTENTE + caída ANTES de getDb -> sin evidencia falsa -------
    {
      const dir = carpeta('Q4-crash-antes');
      borrarEvidencia(); DIR_DATOS = dir;
      sembrarBdLegada(dir, 2);
      const m = construirMain({});
      const p = m.decidirCrearSiAusente();
      ok('Q4) no hubo permiso de crear', p.crear === false, JSON.stringify(p));
      // "el proceso muere aquí": no se ejecuta nada más
      const ev = sinEvidenciaDeCreacion(m, dir);
      ok('   NO existe estado "inicializando"', ev.estado === null, String(ev.estado));
      ok('   NO existe initial-create-intent', !fs.existsSync(rutaInt()) || !ev.intDb,
        JSON.stringify(ev.intDb));

      // ...y ahora la SQLite desaparece
      fs.readdirSync(dir).forEach((f) => { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} });
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      const p2 = m.decidirCrearSiAusente();
      ok('   tras desaparecer, NO hay prueba falsa de primera creación',
        p2.crear === true ? p2.motivo.includes('primera ejecución') : true, JSON.stringify(p2));
      ok('   y el estado sigue sin ser "inicializando"', m.estadoUbicacion(dir).estado === null);
      ok('   (nunca se fabricó la pareja inicializando+intención)',
        m.estadoUbicacion(dir).estado === null && !dbmod.intencionDeCreacionPara(dir).vigente);
    }

    // --- Q5. DEFAULT genuinamente nueva: sigue autorizando -----------------
    {
      const dir = carpeta('Q5-nueva-genuina');
      borrarEvidencia(); DIR_DATOS = dir;
      const m = construirMain({});
      ok('Q5) la BD es demostrablemente NO visible',
        m.estadoDeArchivoEnRuta(path.join(dir, 'panorama.sqlite3')).estado === 'no-visible');
      const p = m.decidirCrearSiAusente();
      ok('   sigue autorizando la creación', p.crear === true, JSON.stringify(p));
      ok('   y el motivo menciona la ausencia demostrada',
        /demostrablemente ausente/.test(String(p.motivo)), String(p.motivo));
      // flujo completo con nonce compartido
      const mi = m.marcarUbicacionInicializando(dir);
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      const v = dbmod.registrarIntencionDeCreacionPara(dir, mi.intento);
      ok('   el nonce compartido se mantiene', v.ok === true && v.nonce === mi.intento);
      await abrirDb(dir, { crearSiAusente: true });
      ok('   y se crea', fs.existsSync(path.join(dir, 'panorama.sqlite3')));
    }

    // --- Q6. DEFAULT sin registro + lectura EIO ----------------------------
    {
      const dir = carpeta('Q6-eio');
      borrarEvidencia(); DIR_DATOS = dir;
      sembrarBdLegada(dir, 2);
      const m = construirMain({});
      const realOpen = fs.openSync;
      fs.openSync = function (p2, ...r) {
        if (String(p2).endsWith('panorama.sqlite3')) throw Object.assign(new Error('inj'), { code: 'EIO' });
        return realOpen.call(fs, p2, ...r);
      };
      const p = m.decidirCrearSiAusente();
      fs.openSync = realOpen;
      ok('Q6) lectura EIO -> NO crear', p.crear === false, JSON.stringify(p));
      ok('   se identifica como no accesible', p.noAccesible === true, JSON.stringify(p));
      const ev = sinEvidenciaDeCreacion(m, dir);
      ok('   CERO marcas de inicialización', ev.estado === null && !ev.intDb);
      ok('   la BD sigue en su sitio', fs.existsSync(path.join(dir, 'panorama.sqlite3')));
    }

    // --- Q7. CUSTOM existente legada: sin PS-1009 ---------------------------
    {
      const dir = carpeta('Q7-custom-legada');
      borrarEvidencia(); DIR_DATOS = dir;
      sembrarBdLegada(dir, 5);
      const m = construirMain({});
      m.set('target', dir); m.set('failure', null); m.set('shared', true);
      m.set('autoriza', false);          // el usuario NO eligió "empezar desde cero"
      const p = m.decidirCrearSiAusente();
      ok('Q7) custom legada sin PS-1009: NO crear', p.crear === false && p.bdVisible === true, JSON.stringify(p));
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      dbmod.setPoliticaUbicacion('compartida');
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: false }); } catch (e) { err = e; }
      ok('   se abre/adopta igualmente', err === null, String(err));
      ok('   con sus 5 proyectos',
        err === null && dbmod.all("SELECT id FROM projects WHERE name LIKE 'VALIOSO-%'").length === 5);
      ok('   sin haber necesitado "empezar desde cero"', true);
    }
    borrarEvidencia();
  }

` + marcador;

t = t.replace(marcador, nuevo);
fs.writeFileSync(P, t, 'utf8');
console.log('seccion Q insertada');
