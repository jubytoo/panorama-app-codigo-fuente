'use strict';
const fs = require('fs');
const P = 'C:\\Users\\ADMIN~1.JLO\\AppData\\Local\\Temp\\claude\\C--Codigo-Fuente-PS\\e55d4471-ea3f-4279-b758-0366ccb6384c\\scratchpad\\bloque1\\test-db-integrado.js';
let t = fs.readFileSync(P, 'utf8');
if (t.includes('L. TEMPORAL PROPIO')) { console.log('ya estaba'); process.exit(0); }

const marcador = "  // =========================================================================\n  seccion('D. PRODUCCIÓN NO TOCADA');";
if (!t.includes(marcador)) { console.log('MARCADOR NO ENCONTRADO'); process.exit(1); }

const nuevo = `  // =========================================================================
  seccion('L. TEMPORAL PROPIO != PRUEBA DE PRIMERA CREACIÓN');
  // =========================================================================
  // "Lo escribió esta instalación" NO demuestra "viene de una primera
  // creación". La prueba es la intención LOCAL, fuera de la carpeta de datos.
  {
    const MI = 'EQUIPO-L'.padEnd(32, '0');

    // Deja en \`dir\` una BD A3.3 con datos y devuelve sus bytes y su .gen.
    async function bdConDatos(dir) {
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      await dbmod.getDb({ crearSiAusente: true });
      dbmod.run('INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES (?,?,?,?,?)',
        ['VALIOSO', 'c', 'persist:lv', 'x', 'x']);
      return {
        bytes: fs.readFileSync(path.join(dir, 'panorama.sqlite3')),
        gen: fs.readFileSync(path.join(dir, 'panorama.sqlite3.gen')),
      };
    }

    // --- 1. PRIMERA CREACIÓN real con fallo ANTES de publicar el .gen -------
    {
      const dir = nuevaCarpeta('L1-creacion-real');
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      // 'gen' corta DENTRO de escribirGen: el temporal del testigo se queda,
      // pero el testigo nunca llega a publicarse.
      dbmod._inyectarFalloEn('gen');
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      dbmod._inyectarFalloEn(null);
      ok('L.1 primera creación: falla antes de publicar el .gen', !!err, String(err));
      ok('   no hay base de datos', !fs.existsSync(path.join(dir, 'panorama.sqlite3')));
      const restos = fs.readdirSync(dir);
      ok('   queda algún resto del intento', restos.length > 0, restos.join(','));
      ok('   NO hay testigo .gen.creacion-fallida (no llegó a publicarse)',
        !restos.some((f) => f.includes('.gen.creacion-fallida-')), restos.join(','));
      // la intención local SÍ existe y es lo que explica el resto
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      let err2 = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err2 = e; }
      ok('   al reiniciar autorizado, SÍ crea (la intención local lo explica)',
        err2 === null && fs.existsSync(path.join(dir, 'panorama.sqlite3')), String(err2));
      ok('   ...y la intención se retira al completarse',
        (() => { try { const j = JSON.parse(fs.readFileSync(path.join(DIR_APPDATA, 'panorama-app-config', 'initial-create-intent.json'), 'utf8'));
          return !j.intentos[path.resolve(dir).toLowerCase()]; } catch (e) { return true; } })());
    }

    // --- 2. BD existente + temporal propio de una escritura NORMAL ----------
    // La BD "desaparece" y se autoriza crear: NO debe crear.
    for (const [etiqueta, clase] of [
      ['.tmp-', '.tmp-'], ['.tmp-fallido-', '.tmp-fallido-'], ['.tmp-huerfano-', '.tmp-huerfano-'],
    ]) {
      const dir = nuevaCarpeta('L2-' + clase.replace(/\\./g, '').replace(/-/g, ''));
      const bd = await bdConDatos(dir);
      const shaBD = crypto.createHash('sha256').update(bd.bytes).digest('hex');
      // temporal de una escritura NORMAL: lleva nuestro writer y NINGÚN nonce
      // de intento de creación.
      const w = MI.replace(/[^0-9a-zA-Z_-]/g, '').slice(0, 16);
      const tmpNormal = path.join(dir, 'panorama.sqlite3' + clase + w + '-' + 'a1b2c3d4e5f60718');
      fs.writeFileSync(tmpNormal, bd.bytes);
      // ...y la base de datos deja de verse
      fs.renameSync(path.join(dir, 'panorama.sqlite3'), path.join(dir, 'guardada.bin'));
      fs.unlinkSync(path.join(dir, 'panorama.sqlite3.gen'));

      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      ok(\`L.2 [\${etiqueta}] temporal propio de escritura NORMAL: NO autoriza crear\`, !!err, String(err));
      ok('   no se creó ninguna base de datos', !fs.existsSync(path.join(dir, 'panorama.sqlite3')));
      ok('   el temporal sigue conservado', fs.existsSync(tmpNormal));
      ok('   y su contenido intacto',
        crypto.createHash('sha256').update(fs.readFileSync(tmpNormal)).digest('hex') === shaBD);
    }

    // --- 3. mismo caso en COMPARTIDA: fail-closed y CERO escrituras ---------
    for (const politica of ['compartida', 'desconocida']) {
      const dir = nuevaCarpeta('L3-' + politica);
      const bd = await bdConDatos(dir);
      const w = MI.replace(/[^0-9a-zA-Z_-]/g, '').slice(0, 16);
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3.tmp-' + w + '-deadbeefdeadbeef'), bd.bytes);
      fs.renameSync(path.join(dir, 'panorama.sqlite3'), path.join(dir, 'guardada.bin'));
      fs.unlinkSync(path.join(dir, 'panorama.sqlite3.gen'));
      const antes = fs.readdirSync(dir).sort().join('|');

      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      dbmod.setPoliticaUbicacion(politica);
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      ok(\`L.3 [\${politica}] SQLite no visible + temporal propio: NO crea\`, !!err, String(err));
      ok('   fail-closed', dbmod.estadoLatch() === 'degradado', String(dbmod.estadoLatch()));
      ok('   CERO escrituras nuevas en la carpeta',
        fs.readdirSync(dir).sort().join('|') === antes, fs.readdirSync(dir).join(','));
    }

    // --- 4. temporal del .gen propio de escritura NORMAL --------------------
    {
      const dir = nuevaCarpeta('L4-gen-tmp-normal');
      const bd = await bdConDatos(dir);
      const w = MI.replace(/[^0-9a-zA-Z_-]/g, '').slice(0, 16);
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3.gen.tmp-' + w + '-0011223344556677'), bd.gen);
      fs.renameSync(path.join(dir, 'panorama.sqlite3'), path.join(dir, 'guardada.bin'));
      fs.unlinkSync(path.join(dir, 'panorama.sqlite3.gen'));
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      ok('L.4 temporal del .gen de escritura NORMAL: tampoco autoriza', !!err, String(err));
      ok('   no se creó nada', !fs.existsSync(path.join(dir, 'panorama.sqlite3')));
    }

    // --- 5. restos CON el nonce del intento registrado: sí reanudan ---------
    {
      const dir = nuevaCarpeta('L5-restos-con-intento');
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      dbmod._inyectarFalloEn('persist');
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) {}
      dbmod._inyectarFalloEn(null);
      const restos = fs.readdirSync(dir);
      ok('L.5 hay restos del intento', restos.length > 0, restos.join(','));
      ok('   el testigo apartado lleva el campo intento',
        restos.some((f) => {
          if (!f.includes('.gen.creacion-fallida-')) return false;
          try { return !!JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).intento; } catch (e) { return false; }
        }), restos.join(','));
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      ok('   SÍ reanuda la creación', err === null && fs.existsSync(path.join(dir, 'panorama.sqlite3')), String(err));
    }

    // --- 6. intención local BORRADA: los mismos restos dejan de explicar ----
    {
      const dir = nuevaCarpeta('L6-sin-intencion');
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      dbmod._inyectarFalloEn('persist');
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) {}
      dbmod._inyectarFalloEn(null);
      const restos = fs.readdirSync(dir).sort().join('|');
      // se borra la evidencia LOCAL, dejando los mismos restos en la carpeta
      try { fs.unlinkSync(path.join(DIR_APPDATA, 'panorama-app-config', 'initial-create-intent.json')); } catch (e) {}
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      ok('L.6 sin intención local, los MISMOS restos ya NO autorizan crear', !!err, String(err));
      ok('   y nada cambió en la carpeta', fs.readdirSync(dir).sort().join('|') === restos);
    }

    // --- 7. intención de OTRO writer: no vale -------------------------------
    {
      const dir = nuevaCarpeta('L7-intencion-ajena');
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      dbmod._inyectarFalloEn('persist');
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) {}
      dbmod._inyectarFalloEn(null);
      // se reescribe la intención como si fuera de otro equipo
      const rutaInt = path.join(DIR_APPDATA, 'panorama-app-config', 'initial-create-intent.json');
      const j = JSON.parse(fs.readFileSync(rutaInt, 'utf8'));
      Object.keys(j.intentos).forEach((k) => { j.intentos[k].writer = 'OTRO-EQUIPO'; });
      fs.writeFileSync(rutaInt, JSON.stringify(j), 'utf8');
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      ok('L.7 intención registrada por OTRO writer: no autoriza', !!err, String(err));
      ok('   no se creó nada', !fs.existsSync(path.join(dir, 'panorama.sqlite3')));
    }

    // --- 8. MEZCLA: testigo válido + resto no demostrable -------------------
    {
      const dir = nuevaCarpeta('L8-mezcla');
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      dbmod._inyectarFalloEn('persist');
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) {}
      dbmod._inyectarFalloEn(null);
      ok('L.8 preparación: hay testigo válido del intento',
        fs.readdirSync(dir).some((f) => f.includes('.gen.creacion-fallida-')));
      // ...y además aparece un resto ajeno
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3.tmp-OTROEQUIPO-999'), 'datos ajenos');
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      ok('   testigo válido + resto ajeno: NO crea', !!err, String(err));
      ok('   no se creó ninguna base de datos', !fs.existsSync(path.join(dir, 'panorama.sqlite3')));
      ok('   el resto ajeno sigue intacto',
        fs.readFileSync(path.join(dir, 'panorama.sqlite3.tmp-OTROEQUIPO-999'), 'utf8') === 'datos ajenos');
    }
  }

` + marcador;

t = t.replace(marcador, nuevo);
fs.writeFileSync(P, t, 'utf8');
console.log('seccion L insertada');
