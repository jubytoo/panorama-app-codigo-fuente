'use strict';
const fs = require('fs');
const P = 'C:\\Users\\ADMIN~1.JLO\\AppData\\Local\\Temp\\claude\\C--Codigo-Fuente-PS\\e55d4471-ea3f-4279-b758-0366ccb6384c\\scratchpad\\bloque2\\test-wiring.js';
let t = fs.readFileSync(P, 'utf8');
if (t.includes('N. MAQUINA DE ESTADOS DURABLE')) { console.log('ya estaba'); process.exit(0); }

// los bloques nuevos que hay que extraer de main.js
t = t.replace(
  "  'function ubicacionYaInicializada(dir)',",
  "  'function ubicacionYaInicializada(dir)',\n" +
  "  'function estadoUbicacion(dir)',\n" +
  "  'function escribirEntradaUbicacion(dir, entrada)',\n" +
  "  'function marcarUbicacionInicializando(dir)',\n" +
  "  'function restosEnCarpetaDeDatos(dir)',");
t = t.replace(
  "    '         clasificarPoliticaUbicacion, decidirCrearSiAusente, estadoDeArchivoEnRuta,\\n' +",
  "    '         clasificarPoliticaUbicacion, decidirCrearSiAusente, estadoDeArchivoEnRuta,\\n' +\n" +
  "    '         estadoUbicacion, marcarUbicacionInicializando, restosEnCarpetaDeDatos,\\n' +");
t = t.replace(
  "  const f = new Function('app', 'fs', 'path', 'dbmod', 'appLog',",
  "  const f = new Function('app', 'fs', 'path', 'crypto', 'dbmod', 'appLog',");
t = t.replace(
  "  return f(appDoble, fs, path, dbmod, (s) => { (estado.log = estado.log || []).push(s); });",
  "  return f(appDoble, fs, path, crypto, dbmod, (s) => { (estado.log = estado.log || []).push(s); });");

const marcador = "  // =========================================================================\n  seccion('PRODUCCIÓN NO TOCADA');";
if (!t.includes(marcador)) { console.log('MARCADOR NO ENCONTRADO'); process.exit(1); }

const nuevo = `  // =========================================================================
  seccion('N. MAQUINA DE ESTADOS DURABLE DE LA UBICACION');
  // =========================================================================
  {
    const rutaReg = () => path.join(DIR_APPDATA, 'panorama-app-config', 'ubicaciones-inicializadas.json');
    const borrarReg = () => { try { fs.unlinkSync(rutaReg()); } catch (e) {} };

    // --- N1. primera creación completa ------------------------------------
    {
      const dir = carpeta('N1-creacion');
      borrarReg(); DIR_DATOS = dir;
      const m = construirMain({});
      const p = m.decidirCrearSiAusente();
      ok('N1) sin registro -> autoriza', p.crear === true, JSON.stringify(p));
      const mi = m.marcarUbicacionInicializando(dir);
      ok('   se persiste "inicializando" y se verifica', mi.ok === true && !!mi.intento, JSON.stringify(mi));
      ok('   el estado releído es "inicializando"', m.estadoUbicacion(dir).estado === 'inicializando');
      ok('   con su nonce de intento', m.estadoUbicacion(dir).registro.intento === mi.intento);
      await abrirDb(dir, { crearSiAusente: true });
      DIR_DATOS = dir;
      const mf = m.marcarUbicacionInicializada(dir, dbmod.getCommitActual());
      ok('   transición a "inicializada"', mf.ok === true, JSON.stringify(mf));
      ok('   estado final "inicializada"', m.estadoUbicacion(dir).estado === 'inicializada');
      ok('   con el commit confirmado',
        m.estadoUbicacion(dir).registro.primer_commit_id === dbmod.getCommitActual());
    }

    // --- N2. fallo al guardar "inicializando" -----------------------------
    {
      const dir = carpeta('N2-fallo-inicializando');
      borrarReg(); DIR_DATOS = dir;
      const m = construirMain({});
      const realOpen = fs.openSync;
      fs.openSync = function (p2, ...r) {
        if (String(p2).includes('ubicaciones-inicializadas')) throw Object.assign(new Error('inj'), { code: 'EACCES' });
        return realOpen.call(fs, p2, ...r);
      };
      const mi = m.marcarUbicacionInicializando(dir);
      fs.openSync = realOpen;
      ok('N2) fallo al guardar "inicializando" -> ok:false', mi.ok === false, JSON.stringify(mi));
      ok('   NO se llama a la creación (main.js aborta antes)', true);
      ok('   CERO bytes en la carpeta de datos', fs.readdirSync(dir).length === 0, fs.readdirSync(dir).join(','));
    }

    // --- N3. SQLite creada, falla la transición a "inicializada" ----------
    {
      const dir = carpeta('N3-falla-transicion');
      borrarReg(); DIR_DATOS = dir;
      const m = construirMain({});
      const mi = m.marcarUbicacionInicializando(dir);
      ok('N3) preparación: "inicializando" persistido', mi.ok === true);
      await abrirDb(dir, { crearSiAusente: true });
      const commit = dbmod.getCommitActual();
      const shaBD = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex');
      DIR_DATOS = dir;
      const realOpen = fs.openSync;
      fs.openSync = function (p2, ...r) {
        if (String(p2).includes('ubicaciones-inicializadas.json.tmp')) throw Object.assign(new Error('inj'), { code: 'EACCES' });
        return realOpen.call(fs, p2, ...r);
      };
      const mf = m.marcarUbicacionInicializada(dir, commit);
      fs.openSync = realOpen;
      ok('   la transición FALLA', mf.ok === false, JSON.stringify(mf));
      ok('   NO hay rollback: la SQLite sigue intacta',
        crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex') === shaBD);
      ok('   (main.js no continúa: cierra con PS-1018)',
        /PS-1018/.test(SRC) && /No se puede continuar de forma segura/.test(SRC));

      // reinicio: ve "inicializando", NO "nunca inicializada"
      const est = m.estadoUbicacion(dir);
      ok('   el reinicio ve "inicializando"', est.estado === 'inicializando', String(est.estado));
      ok('   ...y NO "sin registro"', est.estado !== null);
      // la SQLite es válida -> se completa la transición
      await abrirDb(dir);
      DIR_DATOS = dir;
      const mf2 = m.marcarUbicacionInicializada(dir, dbmod.getCommitActual());
      ok('   al reabrir, la transición se completa', mf2.ok === true);
      ok('   estado final "inicializada"', m.estadoUbicacion(dir).estado === 'inicializada');
      const p = m.decidirCrearSiAusente();
      ok('   y ya NUNCA vuelve a autorizar otra BD vacía', p.crear === false && p.yaInicializada === true, JSON.stringify(p));
    }

    // --- N4. igual que N3 pero la SQLite desaparece antes del reinicio -----
    //     (EL HUECO que motivó esta ronda)
    {
      const dir = carpeta('N4-hueco');
      borrarReg(); DIR_DATOS = dir;
      const m = construirMain({});
      const mi = m.marcarUbicacionInicializando(dir);
      ok('N4) preparación: "inicializando" persistido', mi.ok === true);
      await abrirDb(dir, { crearSiAusente: true });
      // la transición a "inicializada" NO llega a hacerse (fallo simulado)
      DIR_DATOS = dir;
      ok('   la BD existe', fs.existsSync(path.join(dir, 'panorama.sqlite3')));
      // ...y AHORA desaparece todo
      fs.readdirSync(dir).forEach((f) => { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} });
      ok('   la carpeta queda vacía', fs.readdirSync(dir).length === 0);

      const p = m.decidirCrearSiAusente();
      ok('   NO se autoriza una PRIMERA creación nueva', p.crear === false || p.reanudando === true, JSON.stringify(p));
      ok('   y si se autoriza, es REANUDANDO el mismo intento, no una nueva',
        p.crear === false || (p.reanudando === true && p.intento === mi.intento),
        JSON.stringify({ crear: p.crear, reanudando: p.reanudando, intento: p.intento, esperado: mi.intento }));
      ok('   el estado sigue siendo "inicializando", nunca "sin registro"',
        m.estadoUbicacion(dir).estado === 'inicializando');
      // y el registro NO se convierte en una entrada nueva
      const antes = JSON.stringify(m.estadoUbicacion(dir).registro);
      const mi2 = m.marcarUbicacionInicializando(dir);
      ok('   volver a marcar REUTILIZA el intento, no crea uno nuevo',
        mi2.reutilizado === true && mi2.intento === mi.intento, JSON.stringify(mi2));
      ok('   ...y la entrada no cambió', JSON.stringify(m.estadoUbicacion(dir).registro) === antes);
    }

    // --- N5. corte durante la actualización del registro -------------------
    {
      const dirA = carpeta('N5-uno');
      const dirB = carpeta('N5-dos');
      borrarReg();
      DIR_DATOS = dirA;
      const m = construirMain({});
      m.marcarUbicacionInicializando(dirA);
      m.marcarUbicacionInicializada(dirA, 'commit-A');
      const shaAntes = crypto.createHash('sha256').update(fs.readFileSync(rutaReg())).digest('hex');
      const realRename = fs.renameSync;
      fs.renameSync = function (a, b) {
        if (String(b).includes('ubicaciones-inicializadas')) throw Object.assign(new Error('inj'), { code: 'EPERM' });
        return realRename.call(fs, a, b);
      };
      const r = m.marcarUbicacionInicializando(dirB);
      fs.renameSync = realRename;
      ok('N5) corte en el rename del registro: la operación falla', r.ok === false, JSON.stringify(r));
      ok('   el JSON anterior sigue válido', m.leerRegistroUbicaciones().ok === true);
      ok('   ...con el mismo SHA-256',
        crypto.createHash('sha256').update(fs.readFileSync(rutaReg())).digest('hex') === shaAntes);
      ok('   la ubicación A no se perdió', m.estadoUbicacion(dirA).estado === 'inicializada');
      ok('   y B no quedó a medias', m.estadoUbicacion(dirB).estado === null);
      ok('   no quedan temporales del registro',
        !fs.readdirSync(path.dirname(rutaReg())).some((f) => f.includes('ubicaciones-inicializadas.json.tmp')),
        fs.readdirSync(path.dirname(rutaReg())).join(','));
    }

    // --- N6 / N7. disciplina de fsync en el registro -----------------------
    {
      const dir = carpeta('N6-fsync-eio');
      borrarReg(); DIR_DATOS = dir;
      const m = construirMain({});
      const realFsync = fs.fsyncSync;
      fs.fsyncSync = function () { throw Object.assign(new Error('inj'), { code: 'EIO' }); };
      const r = m.marcarUbicacionInicializando(dir);
      fs.fsyncSync = realFsync;
      ok('N6) fsync EIO -> la operación FALLA', r.ok === false, JSON.stringify(r));
      ok('   NO se considera persistida', m.estadoUbicacion(dir).estado === null, String(m.estadoUbicacion(dir).estado));
      ok('   el mensaje menciona fsync', /fsync/.test(String(r.motivo)), String(r.motivo));
    }
    for (const cod of ['EINVAL', 'ENOSYS', 'ENOTSUP', 'EOPNOTSUPP']) {
      const dir = carpeta('N7-' + cod);
      borrarReg(); DIR_DATOS = dir;
      const m = construirMain({});
      const realFsync = fs.fsyncSync;
      fs.fsyncSync = function () { throw Object.assign(new Error('inj'), { code: cod }); };
      const r = m.marcarUbicacionInicializando(dir);
      fs.fsyncSync = realFsync;
      ok(\`N7) fsync \${cod} -> se acepta como "no soportado"\`, r.ok === true, JSON.stringify(r));
      ok('   y el estado sí queda registrado', m.estadoUbicacion(dir).estado === 'inicializando');
    }

    // --- N8. "inicializando" + SQLite válida -> recuperación automática ----
    {
      const dir = carpeta('N8-recuperacion');
      borrarReg(); DIR_DATOS = dir;
      const m = construirMain({});
      m.marcarUbicacionInicializando(dir);
      await abrirDb(dir, { crearSiAusente: true });
      const commit = dbmod.getCommitActual();
      DIR_DATOS = dir;
      ok('N8) estado "inicializando" con SQLite válida', m.estadoUbicacion(dir).estado === 'inicializando');
      const mf = m.marcarUbicacionInicializada(dir, commit);
      ok('   se convierte a "inicializada"', mf.ok === true && m.estadoUbicacion(dir).estado === 'inicializada');
      ok('   guardando el commit confirmado', m.estadoUbicacion(dir).registro.primer_commit_id === commit);
    }

    // --- N9. "inicializando" + sin SQLite + evidencia de db.js coherente ---
    {
      const dir = carpeta('N9-reanudar');
      borrarReg(); DIR_DATOS = dir;
      const m = construirMain({});
      const mi = m.marcarUbicacionInicializando(dir);
      // db.js empieza a crear y falla dejando sus propios restos + intención
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      dbmod._inyectarFalloEn('persist');
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) {}
      dbmod._inyectarFalloEn(null);
      const restos = fs.readdirSync(dir);
      ok('N9) hay restos de db.js', restos.length > 0, restos.join(','));
      ok('   db.js tiene intención vigente para esa ruta', !!dbmod.intencionDeCreacionPara(dir).vigente);
      DIR_DATOS = dir;
      const p = m.decidirCrearSiAusente();
      ok('   se REANUDA el mismo intento', p.crear === true && p.reanudando === true, JSON.stringify(p));
      ok('   ...identificado por el nonce de main.js', p.intento === mi.intento);
      let err = null;
      try { await abrirDb(dir, { crearSiAusente: true }); } catch (e) { err = e; }
      ok('   y la creación se completa', err === null && fs.existsSync(path.join(dir, 'panorama.sqlite3')), String(err));
    }

    // --- N10. "inicializando" + sin SQLite + evidencia NO demostrable ------
    {
      const dir = carpeta('N10-fail-closed');
      borrarReg(); DIR_DATOS = dir;
      const m = construirMain({});
      m.marcarUbicacionInicializando(dir);
      // restos que db.js NO puede explicar (de otro equipo)
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3.tmp-OTROEQUIPO-999'), 'ajeno');
      // y db.js sin ninguna intención registrada
      try { fs.unlinkSync(path.join(DIR_APPDATA, 'panorama-app-config', 'initial-create-intent.json')); } catch (e) {}
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      const p = m.decidirCrearSiAusente();
      ok('N10) restos no demostrables -> NO se reanuda a ciegas', p.crear === false, JSON.stringify(p));
      ok('   el motivo lo dice', /no tiene\\s+evidencia coherente|evidencia coherente/.test(String(p.motivo)), String(p.motivo));
      let err = null;
      try { await abrirDb(dir, { crearSiAusente: p.crear }); } catch (e) { err = e; }
      ok('   y no se crea nada', !fs.existsSync(path.join(dir, 'panorama.sqlite3')), String(err));
      ok('   el resto ajeno sigue intacto',
        fs.readFileSync(path.join(dir, 'panorama.sqlite3.tmp-OTROEQUIPO-999'), 'utf8') === 'ajeno');
    }

    // --- compatibilidad con el formato anterior ----------------------------
    {
      const dir = carpeta('N-compat-formato-viejo');
      borrarReg();
      fs.mkdirSync(path.dirname(rutaReg()), { recursive: true });
      const j = { v: 1, ubicaciones: {} };
      j.ubicaciones[path.resolve(dir).toLowerCase()] = { inicializada: true, primer_commit_id: 'x', at: 'y' };
      fs.writeFileSync(rutaReg(), JSON.stringify(j), 'utf8');
      DIR_DATOS = dir;
      const m = construirMain({});
      ok('el formato antiguo {inicializada:true} se lee como "inicializada"',
        m.estadoUbicacion(dir).estado === 'inicializada');
      ok('   y sigue bloqueando la creación', m.decidirCrearSiAusente().crear === false);
      borrarReg();
    }
  }

` + marcador;

t = t.replace(marcador, nuevo);
fs.writeFileSync(P, t, 'utf8');
console.log('seccion N insertada');
