'use strict';
const fs = require('fs');
const P = 'C:\\Users\\ADMIN~1.JLO\\AppData\\Local\\Temp\\claude\\C--Codigo-Fuente-PS\\e55d4471-ea3f-4279-b758-0366ccb6384c\\scratchpad\\bloque2\\test-wiring.js';
let t = fs.readFileSync(P, 'utf8');
if (t.includes('R. DETECTADA-EXISTENTE')) { console.log('ya estaba'); process.exit(0); }

// nuevo bloque a extraer
t = t.replace(
  "  'function marcarUbicacionInicializada(dir, commitId)',",
  "  'function marcarUbicacionDetectadaExistente(dir)',\n  'function marcarUbicacionInicializada(dir, commitId)',");
t = t.replace(
  "    '         estadoUbicacion, marcarUbicacionInicializando, restosEnCarpetaDeDatos,\\n' +",
  "    '         estadoUbicacion, marcarUbicacionInicializando, restosEnCarpetaDeDatos,\\n' +\n" +
  "    '         marcarUbicacionDetectadaExistente,\\n' +");

// ---- Q4 corregida: ya NO se acepta crear:true ----
const iniQ4 = t.indexOf("    // --- Q4. EXISTENTE + caída ANTES de getDb -> sin evidencia falsa -------");
const finQ4 = t.indexOf("    // --- Q5. DEFAULT genuinamente nueva: sigue autorizando -----------------");
if (iniQ4 < 0 || finQ4 < 0) { console.log('NO SE ENCONTRO Q4'); process.exit(1); }

const Q4 = `    // --- Q4. EXISTENTE + caída ANTES de getDb -----------------------------
    //     La ruta NO puede volver a parecer "nunca vista".
    {
      const dir = carpeta('Q4-crash-antes');
      borrarEvidencia(); DIR_DATOS = dir;
      const shaBD = sembrarBdLegada(dir, 2);
      const m = construirMain({});
      const p = m.decidirCrearSiAusente();
      ok('Q4) no hubo permiso de crear', p.crear === false && p.bdVisible === true, JSON.stringify(p));
      ok('   ...y pide registrar que la ubicación ya tiene base de datos',
        p.necesitaRegistrarExistente === true, JSON.stringify(p));

      // el wiring persiste la constancia ANTES de getDb
      const marca = m.marcarUbicacionDetectadaExistente(dir);
      ok('   se persiste "detectada-existente"', marca.ok === true, JSON.stringify(marca));
      ok('   ...y se relee como tal', m.estadoUbicacion(dir).estado === 'detectada-existente');
      ok('   SIN nonce de creación', !m.estadoUbicacion(dir).registro.intento);
      ok('   y SIN intención de creación en db.js',
        !(() => { try { return dbmod.intencionDeCreacionPara(dir).vigente; } catch (e) { return null; } })());

      // "el proceso muere aquí": no se llega a getDb ni a marcar inicializada
      ok('   la BD sigue intacta',
        crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex') === shaBD);

      // ...y ahora la SQLite desaparece
      fs.readdirSync(dir).forEach((f) => { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} });
      ok('   la carpeta queda vacía', fs.readdirSync(dir).length === 0);

      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      const p2 = m.decidirCrearSiAusente();
      ok('   decidirCrearSiAusente().crear === FALSE', p2.crear === false, JSON.stringify(p2));
      ok('   ...identificado como desaparición de una BD ya observada',
        p2.existenteDesaparecida === true, JSON.stringify(p2));
      let err = null;
      try { await abrirDb(dir, { crearSiAusente: p2.crear }); } catch (e) { err = e; }
      ok('   NO aparece ninguna panorama.sqlite3 nueva', !fs.existsSync(path.join(dir, 'panorama.sqlite3')),
        fs.readdirSync(dir).join(','));
      ok('   el estado sigue recordando que esa ruta tuvo una BD',
        m.estadoUbicacion(dir).estado === 'detectada-existente', String(m.estadoUbicacion(dir).estado));
      void err;
    }

`;
t = t.slice(0, iniQ4) + Q4 + t.slice(finQ4);

// ---- seccion R ----
const marcador = "  // =========================================================================\n  seccion('PRODUCCIÓN NO TOCADA');";
if (!t.includes(marcador)) { console.log('MARCADOR NO ENCONTRADO'); process.exit(1); }

const nuevo = `  // =========================================================================
  seccion('R. DETECTADA-EXISTENTE: la ventana entre ver la BD y registrarla');
  // =========================================================================
  {
    const rutaReg = () => path.join(DIR_APPDATA, 'panorama-app-config', 'ubicaciones-inicializadas.json');
    const rutaInt = () => path.join(DIR_APPDATA, 'panorama-app-config', 'initial-create-intent.json');
    const limpiar = () => {
      try { fs.unlinkSync(rutaReg()); } catch (e) {}
      try { fs.unlinkSync(rutaInt()); } catch (e) {}
    };
    function sembrar(dir, n) {
      const v = new SQL.Database();
      v.run(\`CREATE TABLE projects(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, client TEXT,
        partition_name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE app_meta(key TEXT PRIMARY KEY, value TEXT);\`);
      for (let i = 1; i <= (n || 3); i++) {
        v.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('R-" + i +
          "','C','persist:r" + i + "','x','x')");
      }
      const b = Buffer.from(v.export()); v.close();
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), b);
      return crypto.createHash('sha256').update(b).digest('hex');
    }
    const shaDe = (dir) => crypto.createHash('sha256')
      .update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex');

    // R1. se persiste la marca antes de getDb
    {
      const dir = carpeta('R1-marca-previa');
      limpiar(); DIR_DATOS = dir; sembrar(dir, 3);
      const m = construirMain({});
      const p = m.decidirCrearSiAusente();
      ok('R1) la decisión pide registrar la existente', p.necesitaRegistrarExistente === true, JSON.stringify(p));
      ok('   decidirCrearSiAusente() NO escribió nada por sí sola',
        m.estadoUbicacion(dir).estado === null, String(m.estadoUbicacion(dir).estado));
      const marca = m.marcarUbicacionDetectadaExistente(dir);
      ok('   la marca se persiste y se verifica', marca.ok === true && m.estadoUbicacion(dir).estado === 'detectada-existente');
      ok('   NO se creó ninguna intención de creación',
        !(() => { try { return dbmod.intencionDeCreacionPara(dir).vigente; } catch (e) { return null; } })());
    }
    // R2. fallo al persistir la marca -> no se abre la BD
    {
      const dir = carpeta('R2-fallo-marca');
      limpiar(); DIR_DATOS = dir;
      const sha = sembrar(dir, 3);
      const m = construirMain({});
      const realOpen = fs.openSync;
      fs.openSync = function (p2, ...r) {
        if (String(p2).includes('ubicaciones-inicializadas')) throw Object.assign(new Error('inj'), { code: 'EACCES' });
        return realOpen.call(fs, p2, ...r);
      };
      const marca = m.marcarUbicacionDetectadaExistente(dir);
      fs.openSync = realOpen;
      ok('R2) la marca falla', marca.ok === false, JSON.stringify(marca));
      ok('   el wiring cierra con PS-1019 sin abrir la BD', /PS-1019/.test(SRC) && /No se puede abrir de forma segura/.test(SRC));
      ok('   el SHA de la BD sigue intacto', shaDe(dir) === sha);
      ok('   no hay .gen (no se abrió)', !fs.existsSync(path.join(dir, 'panorama.sqlite3.gen')));
    }
    // R3. crash tras la marca; al reiniciar la BD sigue visible
    {
      const dir = carpeta('R3-reinicio-visible');
      limpiar(); DIR_DATOS = dir; sembrar(dir, 3);
      const m = construirMain({});
      m.marcarUbicacionDetectadaExistente(dir);
      // reinicio
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      const p = m.decidirCrearSiAusente();
      ok('R3) con la BD visible, sigue sin autorizar crear', p.crear === false && p.bdVisible === true, JSON.stringify(p));
      ok('   y ya no pide re-registrar (la marca existe)', p.necesitaRegistrarExistente === false, JSON.stringify(p));
      let err = null;
      try { await abrirDb(dir, { crearSiAusente: false }); } catch (e) { err = e; }
      ok('   se abre y adopta', err === null, String(err));
      ok('   con sus 3 proyectos', err === null && dbmod.all("SELECT id FROM projects WHERE name LIKE 'R-%'").length === 3);
      DIR_DATOS = dir;
      const mf = m.marcarUbicacionInicializada(dir, dbmod.getCommitActual());
      ok('   transición a "inicializada"', mf.ok === true && m.estadoUbicacion(dir).estado === 'inicializada');
      ok('   con el commit confirmado', m.estadoUbicacion(dir).registro.primer_commit_id === dbmod.getCommitActual());
    }
    // R4. crash tras la marca + la BD desaparece
    {
      const dir = carpeta('R4-desaparece');
      limpiar(); DIR_DATOS = dir; sembrar(dir, 3);
      const m = construirMain({});
      m.marcarUbicacionDetectadaExistente(dir);
      fs.readdirSync(dir).forEach((f) => { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} });
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      const p = m.decidirCrearSiAusente();
      ok('R4) BD desaparecida tras haberla visto -> NO crear', p.crear === false, JSON.stringify(p));
      ok('   identificado como desaparición', p.existenteDesaparecida === true, JSON.stringify(p));
      let err = null;
      try { await abrirDb(dir, { crearSiAusente: p.crear }); } catch (e) { err = e; }
      ok('   no se crea nada', !fs.existsSync(path.join(dir, 'panorama.sqlite3')), String(err));
      ok('   el estado se conserva', m.estadoUbicacion(dir).estado === 'detectada-existente');
    }
    // R5. crash tras la marca + EIO
    {
      const dir = carpeta('R5-eio');
      limpiar(); DIR_DATOS = dir; sembrar(dir, 3);
      const m = construirMain({});
      m.marcarUbicacionDetectadaExistente(dir);
      const realOpen = fs.openSync;
      fs.openSync = function (p2, ...r) {
        if (String(p2).endsWith('panorama.sqlite3')) throw Object.assign(new Error('inj'), { code: 'EIO' });
        return realOpen.call(fs, p2, ...r);
      };
      const p = m.decidirCrearSiAusente();
      fs.openSync = realOpen;
      ok('R5) EIO tras la marca -> NO crear', p.crear === false && p.noAccesible === true, JSON.stringify(p));
      ok('   la BD sigue en su sitio', fs.existsSync(path.join(dir, 'panorama.sqlite3')));
      ok('   el estado se conserva', m.estadoUbicacion(dir).estado === 'detectada-existente');
    }
    // R6. la apertura/adopción falla -> el estado NO vuelve a "sin registro"
    {
      const dir = carpeta('R6-adopcion-falla');
      limpiar(); DIR_DATOS = dir;
      const sha = sembrar(dir, 3);
      const m = construirMain({});
      m.marcarUbicacionDetectadaExistente(dir);
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      dbmod._inyectarFalloEn('persist');
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: false }); } catch (e) { err = e; }
      dbmod._inyectarFalloEn(null);
      ok('R6) la adopción falla', !!err, String(err));
      ok('   la BD legada sigue intacta', shaDe(dir) === sha);
      ok('   el estado NO vuelve a "sin registro"', m.estadoUbicacion(dir).estado === 'detectada-existente');
      const p = m.decidirCrearSiAusente();
      ok('   y sigue sin autorizar crear', p.crear === false, JSON.stringify(p));
    }
    // R7. apertura correcta -> inicializada con commit
    {
      const dir = carpeta('R7-feliz');
      limpiar(); DIR_DATOS = dir; sembrar(dir, 4);
      const m = construirMain({});
      m.marcarUbicacionDetectadaExistente(dir);
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      await dbmod.getDb({ crearSiAusente: false });
      DIR_DATOS = dir;
      const mf = m.marcarUbicacionInicializada(dir, dbmod.getCommitActual());
      ok('R7) transición a inicializada', mf.ok === true);
      ok('   con el commit confirmado',
        m.estadoUbicacion(dir).registro.primer_commit_id === dbmod.getCommitActual());
      ok('   los 4 proyectos sobreviven', dbmod.all("SELECT id FROM projects WHERE name LIKE 'R-%'").length === 4);
      ok('   y nunca hubo intención de creación',
        !(() => { try { return dbmod.intencionDeCreacionPara(dir).vigente; } catch (e) { return null; } })());
    }
    // R8. custom/G: primer despliegue — mismo mecanismo
    {
      const dir = carpeta('R8-custom-primer-despliegue');
      limpiar(); DIR_DATOS = dir;
      const sha = sembrar(dir, 5);
      const m = construirMain({});
      m.set('target', dir); m.set('failure', null); m.set('shared', true);
      ok('R8) política compartida', m.clasificarPoliticaUbicacion().politica === 'compartida');
      const p = m.decidirCrearSiAusente();
      ok('   NO crear, y pide registrar la existente',
        p.crear === false && p.necesitaRegistrarExistente === true, JSON.stringify(p));
      const marca = m.marcarUbicacionDetectadaExistente(dir);
      ok('   marca persistida', marca.ok === true && m.estadoUbicacion(dir).estado === 'detectada-existente');
      // caída aquí + desaparición
      fs.readdirSync(dir).forEach((f) => { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} });
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      dbmod.setPoliticaUbicacion('compartida');
      const p2 = m.decidirCrearSiAusente();
      ok('   tras desaparecer en G:, NO se crea nada', p2.crear === false && p2.existenteDesaparecida === true,
        JSON.stringify(p2));
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: p2.crear }); } catch (e) { err = e; }
      ok('   y no aparece ninguna BD', !fs.existsSync(path.join(dir, 'panorama.sqlite3')), String(err));
      void sha;
    }
    // el wiring real hace esto en el orden correcto
    {
      ok('el wiring persiste "detectada-existente" ANTES de getDb',
        SRC.indexOf('marcarUbicacionDetectadaExistente(app.getPath') <
        SRC.indexOf('await dbmod.getDb({ crearSiAusente: permiso.crear })'));
      ok('   y NO registra intención de creación en ese camino',
        !/necesitaRegistrarExistente[\\s\\S]{0,800}registrarIntencionDeCreacionPara/.test(SRC));
    }
    limpiar();
  }

` + marcador;

t = t.replace(marcador, nuevo);
fs.writeFileSync(P, t, 'utf8');
console.log('Q4 corregida y seccion R insertada');
