'use strict';
const fs = require('fs');
const P = 'C:\\Users\\ADMIN~1.JLO\\AppData\\Local\\Temp\\claude\\C--Codigo-Fuente-PS\\e55d4471-ea3f-4279-b758-0366ccb6384c\\scratchpad\\bloque1\\test-db-integrado.js';
let t = fs.readFileSync(P, 'utf8');
if (t.includes('M. FIABILIDAD DE LA EVIDENCIA LOCAL')) { console.log('ya estaba'); process.exit(0); }

const marcador = "  // =========================================================================\n  seccion('D. PRODUCCIÓN NO TOCADA');";
if (!t.includes(marcador)) { console.log('MARCADOR NO ENCONTRADO'); process.exit(1); }

const nuevo = `  // =========================================================================
  seccion('M. FIABILIDAD DE LA EVIDENCIA LOCAL');
  // =========================================================================
  {
    const MI = 'EQUIPO-M'.padEnd(32, '0');
    const rutaInt = () => path.join(DIR_APPDATA, 'panorama-app-config', 'initial-create-intent.json');
    const limpiarInt = () => { try { fs.unlinkSync(rutaInt()); } catch (e) {} };

    // --- A) fallo al ESCRIBIR el archivo de intenciones ---------------------
    {
      const dir = nuevaCarpeta('M-A-intencion-no-escribe');
      limpiarInt();
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      const realOpen = fs.openSync;
      fs.openSync = function (p2, ...r) {
        if (String(p2).includes('initial-create-intent')) {
          throw Object.assign(new Error('inyectado'), { code: 'EACCES' });
        }
        return realOpen.call(fs, p2, ...r);
      };
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      fs.openSync = realOpen;
      ok('M.A fallo al escribir la intención: la creación ABORTA', !!err, String(err));
      ok('   el error lo dice explícitamente', err && err.intencionNoRegistrada === true, JSON.stringify(err && err.intencionNoRegistrada));
      ok('   CERO bytes escritos en la carpeta de datos', fs.readdirSync(dir).length === 0,
        fs.readdirSync(dir).join(','));
    }

    // --- B) se escribe pero la relectura NO coincide ------------------------
    {
      const dir = nuevaCarpeta('M-B-relectura-no-coincide');
      limpiarInt();
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      // el archivo se escribe bien, pero al releerlo devuelve otra cosa
      const realRead = fs.readFileSync;
      fs.readFileSync = function (p2, ...r) {
        if (String(p2).includes('initial-create-intent')) {
          return JSON.stringify({ v: 1, intentos: {} });   // "no hay nada registrado"
        }
        return realRead.call(fs, p2, ...r);
      };
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      fs.readFileSync = realRead;
      ok('M.B la relectura no coincide: la creación ABORTA', !!err, String(err));
      ok('   CERO bytes en la carpeta de datos', fs.readdirSync(dir).length === 0,
        fs.readdirSync(dir).join(','));
    }

    // --- C) corte durante la escritura del archivo de intenciones -----------
    {
      const dir = nuevaCarpeta('M-C-corte-intenciones');
      limpiarInt();
      // se deja una intención PREVIA de otra carpeta, que no debe perderse
      const otraCarpeta = nuevaCarpeta('M-C-otra-ubicacion');
      fs.mkdirSync(path.dirname(rutaInt()), { recursive: true });
      const previa = { v: 1, intentos: {} };
      previa.intentos[path.resolve(otraCarpeta).toLowerCase()] = { writer: MI, nonce: 'aaaabbbbccccdddd', at: 'x' };
      fs.writeFileSync(rutaInt(), JSON.stringify(previa), 'utf8');
      const shaPrevio = crypto.createHash('sha256').update(fs.readFileSync(rutaInt())).digest('hex');

      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      const realRename = fs.renameSync;
      fs.renameSync = function (a, b) {
        if (String(b).includes('initial-create-intent')) {
          throw Object.assign(new Error('inyectado'), { code: 'EPERM' });   // corte justo en el rename
        }
        return realRename.call(fs, a, b);
      };
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      fs.renameSync = realRename;
      ok('M.C corte en el rename del archivo de intenciones: la creación ABORTA', !!err, String(err));
      ok('   el JSON anterior sigue VÁLIDO', dbmod._leerIntenciones().ok === true,
        JSON.stringify(dbmod._leerIntenciones().motivo));
      ok('   ...y con el mismo SHA-256 que antes',
        crypto.createHash('sha256').update(fs.readFileSync(rutaInt())).digest('hex') === shaPrevio);
      ok('   la intención de la OTRA carpeta no se perdió',
        !!dbmod._leerIntenciones().intentos[path.resolve(otraCarpeta).toLowerCase()]);
      ok('   CERO bytes en la carpeta de datos', fs.readdirSync(dir).length === 0, fs.readdirSync(dir).join(','));
    }

    // --- D) dos intenciones: actualizar una no destruye la otra -------------
    {
      const dirA = nuevaCarpeta('M-D-uno');
      const dirB = nuevaCarpeta('M-D-dos');
      limpiarInt();
      // intento fallido en A -> queda su intención
      dbmod._resetParaPruebas(); DIR_DATOS = dirA; dbmod.setInstallationId(MI);
      dbmod._inyectarFalloEn('persist');
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) {}
      dbmod._inyectarFalloEn(null);
      const intA = dbmod._intencionVigente(dirA).vigente;
      ok('M.D hay intención para la carpeta A', !!intA, JSON.stringify(intA));
      // ahora se crea en B (con éxito)
      dbmod._resetParaPruebas(); DIR_DATOS = dirB; dbmod.setInstallationId(MI);
      await dbmod.getDb({ crearSiAusente: true });
      const r = dbmod._leerIntenciones();
      ok('   el archivo sigue legible tras escribir la segunda', r.ok === true);
      ok('   la intención de A SIGUE ahí tras operar sobre B',
        !!r.intentos[path.resolve(dirA).toLowerCase()] &&
        r.intentos[path.resolve(dirA).toLowerCase()].nonce === intA.nonce);
      ok('   y la de B se retiró al completarse', !r.intentos[path.resolve(dirB).toLowerCase()]);
      // y A sigue pudiendo reanudar
      dbmod._resetParaPruebas(); DIR_DATOS = dirA; dbmod.setInstallationId(MI);
      let errA = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { errA = e; }
      ok('   A puede reanudar su creación', errA === null && fs.existsSync(path.join(dirA, 'panorama.sqlite3')), String(errA));
    }

    // --- E) fallo al LIMPIAR la intención tras confirmar el SQLite ----------
    {
      const dir = nuevaCarpeta('M-E-limpieza-falla');
      limpiarInt();
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      // la creación va bien, pero retirar la intención falla
      const realOpen = fs.openSync;
      let creado = false;
      fs.openSync = function (p2, ...r) {
        if (String(p2).includes('initial-create-intent') && creado) {
          throw Object.assign(new Error('inyectado'), { code: 'EACCES' });
        }
        return realOpen.call(fs, p2, ...r);
      };
      // marcar "creado" en cuanto el .sqlite3 exista
      const realRename2 = fs.renameSync;
      fs.renameSync = function (a, b) {
        const res = realRename2.call(fs, a, b);
        if (String(b).endsWith('panorama.sqlite3')) creado = true;
        return res;
      };
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      fs.openSync = realOpen; fs.renameSync = realRename2;

      ok('M.E la base de datos SÍ se creó (no hay rollback)', err === null && fs.existsSync(path.join(dir, 'panorama.sqlite3')), String(err));
      ok('   la intención quedó PENDIENTE de retirar', !!dbmod._intencionVigente(dir).vigente);
      ok('   y queda constancia en el registro',
        dbmod._registro().some((l) => l.includes('limpieza de la intención local quedó PENDIENTE')),
        dbmod._registro().slice(-3).join(' | '));

      // reapertura: debe invalidar la intención obsoleta
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      await dbmod.getDb();
      ok('   al reabrir, la intención obsoleta se RETIRA', !dbmod._intencionVigente(dir).vigente,
        JSON.stringify(dbmod._intencionVigente(dir).vigente));

      // y ya no puede autorizar una recreación futura
      const bytes = fs.readFileSync(path.join(dir, 'panorama.sqlite3'));
      fs.renameSync(path.join(dir, 'panorama.sqlite3'), path.join(dir, 'guardada.bin'));
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      let err2 = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err2 = e; }
      ok('   esa intención ya NO autoriza una recreación posterior', !!err2, String(err2));
      ok('   y no se creó nada', !fs.existsSync(path.join(dir, 'panorama.sqlite3')));
      void bytes;
    }

    // --- F) installation-id NO persistible durante la primera creación ------
    {
      const dir = nuevaCarpeta('M-F-id-no-persistible');
      limpiarInt();
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      // se fuerza una identidad SOLO de sesión
      dbmod.setInstallationId('sesion-' + 'f'.repeat(24), false);
      ok('M.F preparación: la identidad NO está persistida', dbmod._identidadPersistida() === false);
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      ok('   la creación ABORTA', !!err, String(err));
      ok('   el error lo dice explícitamente', err && err.identidadNoPersistida === true);
      ok('   CERO bytes en la carpeta de datos', fs.readdirSync(dir).length === 0, fs.readdirSync(dir).join(','));
    }
    {
      // y el mismo caso llegando por el camino real: no se puede guardar el id
      const dir = nuevaCarpeta('M-F2-id-real-no-persistible');
      const cfgId = path.join(DIR_APPDATA, 'panorama-app-config', 'installation-id');
      try { fs.unlinkSync(cfgId); } catch (e) {}
      limpiarInt();
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      const realOpen = fs.openSync;
      fs.openSync = function (p2, ...r) {
        if (String(p2).includes('installation-id')) throw Object.assign(new Error('inyectado'), { code: 'EACCES' });
        return realOpen.call(fs, p2, ...r);
      };
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      fs.openSync = realOpen;
      ok('M.F2 con el installation-id no persistible de verdad: ABORTA', !!err, String(err));
      ok('   usó una identidad de sesión', String(dbmod._diagnostico().wYo).startsWith('sesion-'),
        String(dbmod._diagnostico().wYo).slice(0, 20));
      ok('   CERO bytes en la carpeta de datos', fs.readdirSync(dir).length === 0, fs.readdirSync(dir).join(','));
    }

    // --- G) installation-id persistido: identidad estable entre arranques ---
    {
      const dir = nuevaCarpeta('M-G-id-estable');
      limpiarInt();
      try { fs.unlinkSync(path.join(DIR_APPDATA, 'panorama-app-config', 'installation-id')); } catch (e) {}
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      dbmod._inyectarFalloEn('persist');
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      dbmod._inyectarFalloEn(null);
      const id1 = dbmod._diagnostico().wYo;
      ok('M.G la identidad se generó y persistió', dbmod._identidadPersistida() === true && !String(id1).startsWith('sesion-'),
        String(id1).slice(0, 20));
      ok('   la creación falló (inyectado) pero dejó intención', !!err && !!dbmod._intencionVigente(dir).vigente, String(err));

      dbmod._resetParaPruebas(); DIR_DATOS = dir;    // sin setInstallationId: se relee
      let err2 = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err2 = e; }
      ok('   el reinicio conserva el MISMO writer', dbmod._diagnostico().wYo === id1,
        id1 + ' vs ' + dbmod._diagnostico().wYo);
      ok('   y la recuperación de la primera creación FUNCIONA',
        err2 === null && fs.existsSync(path.join(dir, 'panorama.sqlite3')), String(err2));
    }

    // --- evidencia corrupta: fail-closed ------------------------------------
    {
      const dir = nuevaCarpeta('M-H-json-corrupto');
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      dbmod._inyectarFalloEn('persist');
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) {}
      dbmod._inyectarFalloEn(null);
      const restos = fs.readdirSync(dir).sort().join('|');
      fs.writeFileSync(rutaInt(), '{esto no es json', 'utf8');
      ok('M.H el archivo de intenciones se lee como CORRUPTO, no como vacío',
        dbmod._leerIntenciones().ok === false, JSON.stringify(dbmod._leerIntenciones()));
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      ok('   con restos + evidencia ilegible: NO crea (fail-closed)', !!err, String(err));
      ok('   y nada cambió en la carpeta', fs.readdirSync(dir).sort().join('|') === restos);
      limpiarInt();
    }
  }

` + marcador;

t = t.replace(marcador, nuevo);
fs.writeFileSync(P, t, 'utf8');
console.log('seccion M insertada');
