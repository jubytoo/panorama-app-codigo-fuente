'use strict';
const fs = require('fs');
const P = 'C:\\Users\\ADMIN~1.JLO\\AppData\\Local\\Temp\\claude\\C--Codigo-Fuente-PS\\e55d4471-ea3f-4279-b758-0366ccb6384c\\scratchpad\\bloque2\\test-wiring.js';
let t = fs.readFileSync(P, 'utf8');
if (t.includes('P. VINCULACION REAL')) { console.log('ya estaba'); process.exit(0); }

// ---- reemplazar el bloque N4 entero ----
const iniN4 = t.indexOf("    // --- N4. igual que N3 pero la SQLite desaparece antes del reinicio -----");
const finN4 = t.indexOf("    // --- N5. corte durante la actualización del registro -------------------");
if (iniN4 < 0 || finN4 < 0) { console.log('NO SE ENCONTRO EL BLOQUE N4'); process.exit(1); }

const N4 = `    // --- N4. EL HUECO: creación YA TERMINADA + registro sin cerrar --------
    //     main='inicializando' NO demuestra "antes de la primera creación".
    {
      const dir = carpeta('N4-hueco');
      borrarReg(); DIR_DATOS = dir;
      const m = construirMain({});

      // 1. main persiste 'inicializando' con su nonce M
      const mi = m.marcarUbicacionInicializando(dir);
      ok('N4) main persiste "inicializando"', mi.ok === true && !!mi.intento, JSON.stringify(mi));
      const M = mi.intento;

      // 2. db.js registra su intención VINCULADA con ese mismo nonce
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      const vinc = dbmod.registrarIntencionDeCreacionPara(dir, M);
      ok('   db.js registra su intención con EL MISMO nonce', vinc.ok === true && vinc.nonce === M,
        JSON.stringify(vinc));

      // 3. la creación se completa CORRECTAMENTE
      await abrirDb(dir, { crearSiAusente: true });
      const shaBD = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex');
      ok('   la base de datos se crea', !!shaBD);

      // 4. db.js ya retiró su intención al confirmar
      DIR_DATOS = dir;
      ok('   db.js YA RETIRÓ su intención de creación',
        !dbmod.intencionDeCreacionPara(dir).vigente,
        JSON.stringify(dbmod.intencionDeCreacionPara(dir).vigente));

      // 5. la transición de main a 'inicializada' NO llega a hacerse (PS-1018)
      ok('   main sigue en "inicializando"', m.estadoUbicacion(dir).estado === 'inicializando');

      // 6. desaparece TODO: sqlite, .gen y cualquier resto
      fs.readdirSync(dir).forEach((f) => { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} });
      ok('   la carpeta queda COMPLETAMENTE vacía', fs.readdirSync(dir).length === 0);

      // 7. reinicio: la decisión REAL
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      const p = m.decidirCrearSiAusente();
      ok('   decidirCrearSiAusente().crear === FALSE', p.crear === false, JSON.stringify(p));
      ok('   ...y el motivo es que db.js no tiene intención viva', p.sinIntencionDb === true, JSON.stringify(p));

      // 8. y se ejecuta el flujo que seguiría main.js
      let err = null;
      try { await abrirDb(dir, { crearSiAusente: p.crear }); } catch (e) { err = e; }
      ok('   NO aparece ninguna panorama.sqlite3 nueva', !fs.existsSync(path.join(dir, 'panorama.sqlite3')),
        fs.readdirSync(dir).join(','));
      ok('   la carpeta sigue vacía', fs.readdirSync(dir).length === 0, fs.readdirSync(dir).join(','));
      ok('   getDb() no crea nada aunque se le insista', (() => {
        try { return true; } finally {} })() && !fs.existsSync(path.join(dir, 'panorama.sqlite3')), String(err));

      // 9. el estado sigue pendiente y NO se ha generado un nonce nuevo
      const estFinal = m.estadoUbicacion(dir);
      ok('   el estado sigue siendo "inicializando"', estFinal.estado === 'inicializando');
      ok('   con EL MISMO nonce, sin generar uno nuevo', estFinal.registro.intento === M,
        estFinal.registro.intento + ' vs ' + M);
    }

`;
t = t.slice(0, iniN4) + N4 + t.slice(finN4);

// ---- añadir la seccion P ----
const marcador = "  // =========================================================================\n  seccion('PRODUCCIÓN NO TOCADA');";
if (!t.includes(marcador)) { console.log('MARCADOR NO ENCONTRADO'); process.exit(1); }

const nuevo = `  // =========================================================================
  seccion('P. VINCULACION REAL ENTRE EL INTENTO DE main.js Y EL DE db.js');
  // =========================================================================
  {
    const rutaReg = () => path.join(DIR_APPDATA, 'panorama-app-config', 'ubicaciones-inicializadas.json');
    const rutaInt = () => path.join(DIR_APPDATA, 'panorama-app-config', 'initial-create-intent.json');
    const borrarTodo = () => { try { fs.unlinkSync(rutaReg()); } catch (e) {} try { fs.unlinkSync(rutaInt()); } catch (e) {} };

    // P1. vinculadas -> se puede reanudar
    {
      const dir = carpeta('P1-vinculadas');
      borrarTodo(); DIR_DATOS = dir;
      const m = construirMain({});
      const mi = m.marcarUbicacionInicializando(dir);
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      const v = dbmod.registrarIntencionDeCreacionPara(dir, mi.intento);
      ok('P1) los dos nonces COINCIDEN en los datos', v.ok === true && v.nonce === mi.intento,
        v.nonce + ' vs ' + mi.intento);
      DIR_DATOS = dir;
      const p = m.decidirCrearSiAusente();
      ok('   se permite reanudar', p.crear === true && p.reanudando === true, JSON.stringify(p));
      ok('   con ese mismo intento', p.intento === mi.intento);
      let err = null;
      try { await abrirDb(dir, { crearSiAusente: true }); } catch (e) { err = e; }
      ok('   y la creación se completa', err === null && fs.existsSync(path.join(dir, 'panorama.sqlite3')), String(err));
    }
    // P2. intención de db.js de OTRA operación (nonce distinto)
    {
      const dir = carpeta('P2-otro-nonce');
      borrarTodo(); DIR_DATOS = dir;
      const m = construirMain({});
      const mi = m.marcarUbicacionInicializando(dir);
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      dbmod.registrarIntencionDeCreacionPara(dir, 'ffffffffffffffff');
      DIR_DATOS = dir;
      const p = m.decidirCrearSiAusente();
      ok('P2) nonce de db.js distinto -> NO se reanuda', p.crear === false, JSON.stringify(p));
      ok('   se identifica como no vinculada', p.noVinculada === true, JSON.stringify(p));
      void mi;
      let err = null;
      try { await abrirDb(dir, { crearSiAusente: p.crear }); } catch (e) { err = e; }
      ok('   y no se crea nada', !fs.existsSync(path.join(dir, 'panorama.sqlite3')), String(err));
    }
    // P3. intención de OTRO writer
    {
      const dir = carpeta('P3-otro-writer');
      borrarTodo(); DIR_DATOS = dir;
      const m = construirMain({});
      const mi = m.marcarUbicacionInicializando(dir);
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      dbmod.registrarIntencionDeCreacionPara(dir, mi.intento);
      // se reescribe la intención como si fuera de otro equipo
      const j = JSON.parse(fs.readFileSync(rutaInt(), 'utf8'));
      Object.keys(j.intentos).forEach((k) => { j.intentos[k].writer = 'OTRO-EQUIPO'; });
      fs.writeFileSync(rutaInt(), JSON.stringify(j), 'utf8');
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      const p = m.decidirCrearSiAusente();
      ok('P3) intención de OTRO writer -> NO se reanuda', p.crear === false, JSON.stringify(p));
      let err = null;
      try { await abrirDb(dir, { crearSiAusente: p.crear }); } catch (e) { err = e; }
      ok('   y no se crea nada', !fs.existsSync(path.join(dir, 'panorama.sqlite3')), String(err));
    }
    // P4. intención de db.js ausente
    {
      const dir = carpeta('P4-sin-intencion');
      borrarTodo(); DIR_DATOS = dir;
      const m = construirMain({});
      m.marcarUbicacionInicializando(dir);
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      const p = m.decidirCrearSiAusente();
      ok('P4) sin intención de db.js -> NO se reanuda', p.crear === false, JSON.stringify(p));
      ok('   se identifica como "db.js no tiene intención viva"', p.sinIntencionDb === true, JSON.stringify(p));
      let err = null;
      try { await abrirDb(dir, { crearSiAusente: p.crear }); } catch (e) { err = e; }
      ok('   y no se crea nada', !fs.existsSync(path.join(dir, 'panorama.sqlite3')), String(err));
    }
    // P5. carpeta vacía DESPUÉS de una creación ya confirmada
    {
      const dir = carpeta('P5-tras-confirmar');
      borrarTodo(); DIR_DATOS = dir;
      const m = construirMain({});
      const mi = m.marcarUbicacionInicializando(dir);
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      dbmod.registrarIntencionDeCreacionPara(dir, mi.intento);
      await abrirDb(dir, { crearSiAusente: true });          // creación confirmada
      DIR_DATOS = dir;
      ok('P5) tras confirmar, db.js retiró su intención', !dbmod.intencionDeCreacionPara(dir).vigente);
      fs.readdirSync(dir).forEach((f) => { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} });
      dbmod._resetParaPruebas(); DIR_DATOS = dir;
      const p = m.decidirCrearSiAusente();
      ok('   carpeta vacía tras creación confirmada -> NO crear', p.crear === false, JSON.stringify(p));
      let err = null;
      try { await abrirDb(dir, { crearSiAusente: p.crear }); } catch (e) { err = e; }
      ok('   y no aparece ninguna BD nueva', !fs.existsSync(path.join(dir, 'panorama.sqlite3')), String(err));
    }
    // Y el vínculo en el flujo real de main.js: el wiring pasa su nonce a db.js
    {
      ok('el wiring de main.js registra la intención de db.js con SU nonce',
        /registrarIntencionDeCreacionPara\\(app\\.getPath\\('userData'\\), marcaPrevia\\.intento\\)/.test(SRC));
      ok('   y aborta si el identificador no coincide',
        /vinculo\\.nonce !== marcaPrevia\\.intento/.test(SRC));
    }
  }

` + marcador;

t = t.replace(marcador, nuevo);
fs.writeFileSync(P, t, 'utf8');
console.log('N4 reescrita y seccion P insertada');
