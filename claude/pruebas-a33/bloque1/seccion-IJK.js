'use strict';
const fs = require('fs');
const P = 'C:\\Users\\ADMIN~1.JLO\\AppData\\Local\\Temp\\claude\\C--Codigo-Fuente-PS\\e55d4471-ea3f-4279-b758-0366ccb6384c\\scratchpad\\bloque1\\test-db-integrado.js';
let t = fs.readFileSync(P, 'utf8');
if (t.includes('I. PRIMERA CREACIÓN INTERRUMPIDA')) { console.log('ya estaba'); process.exit(0); }

// --- H.5: sustituir la aserción que no probaba lo que decía ---
const vieja = "    ok('   ...y su .gen NO lleva marca de bootstrap persistente engañosa',\n      JSON.parse(genR).fase === undefined || JSON.parse(genR).fase === 'bootstrap');";
const nueva = "    ok('   ...y su .gen ESTABLE no conserva NINGUNA marca transitoria',\n      JSON.parse(genR).fase === undefined && JSON.parse(genR).base_sha256 === undefined,\n      JSON.stringify({ fase: JSON.parse(genR).fase, base: JSON.parse(genR).base_sha256 }));";
if (t.includes(vieja)) { t = t.replace(vieja, nueva); console.log('H.5 corregida'); }
else console.log('AVISO: no se encontró la aserción de H.5');

// --- H.6: el testigo final YA NO debe llevar la marca ---
const vieja6 = "    ok('   y ahora el testigo lleva la marca de bootstrap con el hash base',\n      (() => { const g = JSON.parse(fs.readFileSync(path.join(dir, 'panorama.sqlite3.gen'), 'utf8'));\n        return g.fase === 'bootstrap' && g.base_sha256 === sha; })());";
const nueva6 = "    ok('   y el testigo final queda NORMAL, sin la marca transitoria',\n      (() => { const g = JSON.parse(fs.readFileSync(path.join(dir, 'panorama.sqlite3.gen'), 'utf8'));\n        return g.fase === undefined && g.base_sha256 === undefined && g.parent_commit_id === null; })(),\n      fs.readFileSync(path.join(dir, 'panorama.sqlite3.gen'), 'utf8'));";
if (t.includes(vieja6)) { t = t.replace(vieja6, nueva6); console.log('H.6 corregida'); }
else console.log('AVISO: no se encontró la aserción de H.6');

const marcador = "  // =========================================================================\n  seccion('D. PRODUCCIÓN NO TOCADA');";
if (!t.includes(marcador)) { console.log('MARCADOR NO ENCONTRADO'); process.exit(1); }

const nuevo = `  // =========================================================================
  seccion('I. PRIMERA CREACIÓN INTERRUMPIDA — no puede dejar la instalación muerta');
  // =========================================================================
  {
    const MI = 'EQUIPO-I'.padEnd(32, '0');
    const puntos = ['persist', 'meta2', 'tras-migracion'];
    for (const punto of puntos) {
      // A) carpeta completamente virgen
      const dir = nuevaCarpeta('creacion-' + punto);
      ok(\`[corte en \${punto}] A) la carpeta está completamente vacía\`, fs.readdirSync(dir).length === 0);

      // B) creación AUTORIZADA   C) fallo antes de confirmar
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      dbmod._inyectarFalloEn(punto);
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      dbmod._inyectarFalloEn(null);
      ok(\`   B/C) la creación autorizada falla en \${punto}\`, !!err, String(err));

      // D) no hay SQLite activo
      ok('   D) NO existe panorama.sqlite3', !fs.existsSync(path.join(dir, 'panorama.sqlite3')));
      ok('   D) NO queda un .gen activo', !fs.existsSync(path.join(dir, 'panorama.sqlite3.gen')));

      // E/F) reiniciar con creación autorizada -> DEBE completar sin ayuda
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      const pista = dbmod.pareceUbicacionNueva
        ? null : null;                          // (se consulta tras fijar rutas)
      let err2 = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err2 = e; }
      ok('   E/F) al reiniciar, la creación se completa SIN intervención', err2 === null, String(err2));
      ok('   ...y existe la base de datos', fs.existsSync(path.join(dir, 'panorama.sqlite3')));
      ok('   ...con su testigo NORMAL (sin marca transitoria)',
        (() => { const g = JSON.parse(fs.readFileSync(path.join(dir, 'panorama.sqlite3.gen'), 'utf8'));
          return g.fase === undefined && g.base === undefined; })(),
        fs.readFileSync(path.join(dir, 'panorama.sqlite3.gen'), 'utf8'));
      ok('   ...y se puede escribir',
        err2 === null && typeof dbmod.run(
          'INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES (?,?,?,?,?)',
          ['p', 'c', 'persist:ci' + punto, 'x', 'x']) === 'number');
      ok('   ...el resto de la creación fallida SIGUE conservado como evidencia',
        fs.readdirSync(dir).some((f) => f.includes('.gen.creacion-fallida-')),
        fs.readdirSync(dir).join(','));
      void pista;
    }
  }
  {
    // G) fallos durante escritura / fsync / rename del SQLite inicial
    const MI = 'EQUIPO-G'.padEnd(32, '0');
    const inyecciones = [
      ['writeSync sin progreso', () => { const r = fs.writeSync; fs.writeSync = () => 0; return () => { fs.writeSync = r; }; }],
      ['fsync EIO', () => { const r = fs.fsyncSync; fs.fsyncSync = () => { throw Object.assign(new Error('inj'), { code: 'EIO' }); }; return () => { fs.fsyncSync = r; }; }],
      ['rename EPERM', () => { const r = fs.renameSync; fs.renameSync = (a, b) => {
          if (String(a).includes('sqlite3.tmp-')) throw Object.assign(new Error('inj'), { code: 'EPERM' });
          return r(a, b); }; return () => { fs.renameSync = r; }; }],
    ];
    for (const [etiqueta, instalar] of inyecciones) {
      const dir = nuevaCarpeta('creacion-io-' + etiqueta.split(' ')[0]);
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      const quitar = instalar();
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      quitar();
      ok(\`G) [\${etiqueta}] la creación inicial falla\`, !!err, String(err));
      ok('   no queda una base de datos activa', !fs.existsSync(path.join(dir, 'panorama.sqlite3')));
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      let err2 = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err2 = e; }
      ok('   al reiniciar, la creación se completa', err2 === null && fs.existsSync(path.join(dir, 'panorama.sqlite3')),
        String(err2) + ' | ' + fs.readdirSync(dir).join(','));
    }
  }
  {
    // H) mismo escenario en COMPARTIDA y DESCONOCIDA
    for (const politica of ['compartida', 'desconocida']) {
      const MI = 'EQUIPO-H'.padEnd(32, '0');
      const dir = nuevaCarpeta('creacion-' + politica);
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      dbmod.setPoliticaUbicacion(politica);
      dbmod._inyectarFalloEn('persist');
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      dbmod._inyectarFalloEn(null);
      ok(\`H) [\${politica}] la creación inicial falla\`, !!err, String(err));
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      dbmod.setPoliticaUbicacion(politica);
      let err2 = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err2 = e; }
      ok('   al reiniciar se completa igualmente', err2 === null, String(err2));
      ok('   sin latch pendiente', dbmod.estadoLatch() === null, String(dbmod.estadoLatch()));
    }
  }
  {
    // I) restos NO demostrables siguen bloqueando una creación nueva
    const casos = [
      ['.gen vivo de otro equipo', (dir) => fs.writeFileSync(path.join(dir, 'panorama.sqlite3.gen'),
        JSON.stringify({ v: 2, gen: 3, commit_id: 'aa'.repeat(16), parent_commit_id: 'bb'.repeat(16), writer: 'AJENO', at: 'x' }))],
      ['testigo de creación de OTRO writer', (dir) => fs.writeFileSync(path.join(dir, 'panorama.sqlite3.gen.creacion-fallida-1'),
        JSON.stringify({ v: 2, gen: 1, commit_id: 'cc'.repeat(16), parent_commit_id: null, writer: 'OTRO-EQUIPO', fase: 'creacion-inicial', base: 'ninguna', at: 'x' }))],
      ['testigo de creación ilegible', (dir) => fs.writeFileSync(path.join(dir, 'panorama.sqlite3.gen.creacion-fallida-2'), 'esto no es json')],
      ['archivo de conflicto', (dir) => fs.writeFileSync(path.join(dir, 'panorama.sqlite3.conflicto-x-2026'), 'datos')],
      ['temporal de otro writer', (dir) => fs.writeFileSync(path.join(dir, 'panorama.sqlite3.tmp-OTROEQUIPO-abc'), 'datos')],
      ['testigo de BOOTSTRAP fallido (había BD antes)', (dir) => fs.writeFileSync(path.join(dir, 'panorama.sqlite3.gen.bootstrap-fallido-1'),
        JSON.stringify({ v: 2, gen: 1, commit_id: 'dd'.repeat(16), parent_commit_id: null, writer: 'EQUIPO-I'.padEnd(32, '0'), fase: 'bootstrap', base_sha256: 'ee'.repeat(32), at: 'x' }))],
    ];
    for (const [etiqueta, sembrar] of casos) {
      const dir = nuevaCarpeta('bloqueo-' + etiqueta.split(' ')[0].replace(/[^a-z]/gi, ''));
      sembrar(dir);
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId('EQUIPO-I'.padEnd(32, '0'));
      let err = null;
      try { await dbmod.getDb({ crearSiAusente: true }); } catch (e) { err = e; }
      ok(\`I) [\${etiqueta}] SIGUE bloqueando la creación\`, !!err, String(err));
      ok('   no se creó ninguna base de datos', !fs.existsSync(path.join(dir, 'panorama.sqlite3')));
    }
  }

  // =========================================================================
  seccion('J. EL MARCADOR DE FASE ES TRANSITORIO');
  // =========================================================================
  {
    function bdLegadaJ(dir) {
      const v = new SQL.Database();
      v.run(\`CREATE TABLE projects(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, client TEXT,
        partition_name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        CREATE TABLE app_meta(key TEXT PRIMARY KEY, value TEXT);\`);
      v.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('J1','C','persist:j1','x','x')");
      const b = Buffer.from(v.export()); v.close();
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), b);
      return { sha: crypto.createHash('sha256').update(b).digest('hex'), bytes: b };
    }
    const MI = 'EQUIPO-J'.padEnd(32, '0');

    // A) adopción feliz -> .gen final SIN marca
    {
      const dir = nuevaCarpeta('fase-feliz');
      bdLegadaJ(dir);
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      await dbmod.getDb();
      const g = JSON.parse(fs.readFileSync(path.join(dir, 'panorama.sqlite3.gen'), 'utf8'));
      ok('J.A adopción feliz: el .gen final NO lleva fase', g.fase === undefined, JSON.stringify(g.fase));
      ok('   ...ni base_sha256', g.base_sha256 === undefined);
      ok('   ...pero conserva el commit y el padre nulo',
        g.commit_id === dbmod._diagnostico().cMem && g.parent_commit_id === null);
      ok('   ...y la BD tiene ese commit', dbmod._leerDisco().C === g.commit_id);
    }
    // B) corte ANTES del SQLite: el marcador sigue permitiendo recuperar
    {
      const dir = nuevaCarpeta('fase-corte-antes');
      const L = bdLegadaJ(dir);
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      dbmod._inyectarFalloEn('persist');
      try { await dbmod.getDb(); } catch (e) {}
      dbmod._inyectarFalloEn(null);
      ok('J.B corte antes del SQLite: la BD legada intacta',
        crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex') === L.sha);
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      ok('   al reiniciar se recupera y adopta', err === null && dbmod.all("SELECT id FROM projects WHERE name='J1'").length === 1, String(err));
    }
    // C) corte DESPUÉS del rename del SQLite y ANTES de normalizar el .gen
    {
      const dir = nuevaCarpeta('fase-corte-despues');
      bdLegadaJ(dir);
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      // se deja que adopte, y después se REPONE a mano el .gen con la marca:
      // es exactamente el estado "SQLite confirmado, .gen sin normalizar".
      await dbmod.getDb();
      const C = dbmod._diagnostico().cMem;
      const shaTrasAdoptar = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex');
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3.gen'), JSON.stringify({
        v: 2, gen: 1, commit_id: C, parent_commit_id: null, writer: MI,
        fase: 'bootstrap', base_sha256: 'ff'.repeat(32), at: new Date().toISOString(),
      }));
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      const g = JSON.parse(fs.readFileSync(path.join(dir, 'panorama.sqlite3.gen'), 'utf8'));
      ok('J.C marcador superviviente sobre un commit YA confirmado: abre', err === null, String(err));
      ok('   el .gen se NORMALIZA (se retira la marca)', g.fase === undefined && g.base_sha256 === undefined,
        JSON.stringify({ f: g.fase, b: g.base_sha256 }));
      ok('   conserva el MISMO commit', g.commit_id === C);
      ok('   NUNCA se restaura hacia atrás: la BD sigue siendo la adoptada',
        crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex') === shaTrasAdoptar);
      ok('   y sus datos siguen', dbmod.all("SELECT id FROM projects WHERE name='J1'").length === 1);
    }
    // D) tras una adopción exitosa, restaurar EXACTAMENTE los bytes legados
    {
      const dir = nuevaCarpeta('fase-restauracion-antigua');
      const L = bdLegadaJ(dir);
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      await dbmod.getDb();                       // adopción exitosa
      ok('J.D preparación: adoptada y el .gen ya está normalizado',
        JSON.parse(fs.readFileSync(path.join(dir, 'panorama.sqlite3.gen'), 'utf8')).fase === undefined);
      // una versión antigua restaura EXACTAMENTE la imagen legada original
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), L.bytes);
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId(MI);
      const d = dbmod._leerDisco(dir);
      ok('J.D restauración antigua: NO se clasifica como bootstrap-propio',
        d.estado !== 'valida' || d.adopcionPropiaInterrumpida !== true, JSON.stringify(d.estado));
      ok('   se clasifica como no demostrable', d.estado === 'no-demostrable', String(d.estado));
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      ok('   y NO se vuelve a adoptar en silencio', !!err, String(err));
      ok('   la imagen restaurada sigue intacta',
        crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex') === L.sha);
    }
  }

  // =========================================================================
  seccion('K. INTERLEAVING REAL A -> B -> A (con gancho en el flujo)');
  // =========================================================================
  {
    // Prepara una BD A3.3 y la deja DESMIGRADA, para que la apertura de A tenga
    // que migrar y por tanto persistir.
    function desmigrar(bytes) {
      const d = new SQL.Database(bytes);
      ['backup_dir', 'kind', 'sort_order'].forEach((c) => {
        try { d.run('ALTER TABLE projects DROP COLUMN ' + c); } catch (e) {}
      });
      const out = Buffer.from(d.export()); d.close(); return out;
    }
    async function prepararX(dir) {
      await abrirEn(dir);
      dbmod.run('INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES (?,?,?,?,?)',
        ['DE-A', 'c', 'persist:a', 'x', 'x']);
      const est = dbmod._diagnostico();
      const bytesX = fs.readFileSync(path.join(dir, 'panorama.sqlite3'));
      const genX = fs.readFileSync(path.join(dir, 'panorama.sqlite3.gen'));
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), desmigrar(bytesX));
      return { X: est.cMem, hX: est.hMem.slice(), bytesX, genX };
    }
    // B escribe Y DESCENDIENTE de X, usando el propio db.js con otro writer.
    async function bEscribeDescendiente(dir, bytesX, genX) {
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), bytesX);
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3.gen'), genX);
      const guardaDatos = DIR_DATOS;
      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId('BBBB'.padEnd(32, '0'));
      await dbmod.getDb();
      dbmod.run('INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES (?,?,?,?,?)',
        ['DE-B', 'c', 'persist:b', 'x', 'x']);
      const Y = dbmod._diagnostico().cMem;
      const bytesY = fs.readFileSync(path.join(dir, 'panorama.sqlite3'));
      const genY = fs.readFileSync(path.join(dir, 'panorama.sqlite3.gen'));
      DIR_DATOS = guardaDatos;
      return { Y, bytesY: desmigrar(bytesY), bytesYintacto: bytesY, genY };
    }

    // ---- K.1 DESCENDENCIA: A carga X, B publica Y, A revalida -------------
    {
      const dir = nuevaCarpeta('inter-desc');
      const p = await prepararX(dir);
      const b = await bEscribeDescendiente(dir, p.bytesX, p.genX);
      // dejar el disco en el estado "A va a cargar X"
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), desmigrar(p.bytesX));
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3.gen'), p.genX);

      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId('AAAA'.padEnd(32, '0'));
      let disparos = 0;
      dbmod._inyectarGancho((n) => {
        if (n === 'memoria-cargada' && disparos === 0) {
          disparos++;
          // B publica Y JUSTO AHORA, con A ya con X en memoria
          fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), b.bytesYintacto);
          fs.writeFileSync(path.join(dir, 'panorama.sqlite3.gen'), b.genY);
        }
      });
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      dbmod._inyectarGancho(null);

      ok('K.1 el gancho disparó: A tenía X en memoria cuando B publicó Y', disparos === 1, 'disparos=' + disparos);
      ok('   A abre sin error', err === null, String(err));
      ok('   A detectó Y y lo adoptó', err === null && dbmod._diagnostico().hMem.includes(b.Y),
        err === null ? JSON.stringify(dbmod._diagnostico().hMem.map((h) => h.slice(0, 6))) : 'no abrió');
      ok('   LA FILA DE B SOBREVIVE', err === null && dbmod.all("SELECT id FROM projects WHERE name='DE-B'").length === 1);
      ok('   y la de A también', err === null && dbmod.all("SELECT id FROM projects WHERE name='DE-A'").length === 1);
      ok('   el disco contiene lo de B',
        (() => { const d = new SQL.Database(fs.readFileSync(path.join(dir, 'panorama.sqlite3')));
          const n = d.exec("SELECT COUNT(*) FROM projects WHERE name='DE-B'")[0].values[0][0]; d.close(); return n === 1; })());
    }

    // ---- K.2 BIFURCACIÓN durante la carrera --------------------------------
    {
      const dir = nuevaCarpeta('inter-bifurcacion');
      const p = await prepararX(dir);
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), desmigrar(p.bytesX));
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3.gen'), p.genX);

      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId('AAAA'.padEnd(32, '0'));
      dbmod.setPoliticaUbicacion('compartida');
      let sha = null;
      dbmod._inyectarGancho((n) => {
        if (n !== 'memoria-cargada' || sha) return;
        // otro equipo publica un HERMANO de X (mismo padre que X)
        const gX = JSON.parse(p.genX.toString('utf8'));
        const d = new SQL.Database(p.bytesX);
        const cB = 'bb'.repeat(16);
        d.run("INSERT INTO app_meta(key,value) VALUES ('db_commit_id','" + cB + "') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
        d.run("INSERT INTO app_meta(key,value) VALUES ('db_parent_commit_id','" + (gX.parent_commit_id || '') + "') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
        d.run("INSERT INTO app_meta(key,value) VALUES ('db_commit_history','" + JSON.stringify([cB, gX.parent_commit_id]) + "') ON CONFLICT(key) DO UPDATE SET value=excluded.value");
        d.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('RAMA-B','c','persist:rb','x','x')");
        const bytes = Buffer.from(d.export()); d.close();
        fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), bytes);
        fs.writeFileSync(path.join(dir, 'panorama.sqlite3.gen'), JSON.stringify({
          v: 2, gen: 99, commit_id: cB, parent_commit_id: gX.parent_commit_id,
          writer: 'BBBB'.padEnd(32, '0'), at: new Date().toISOString(),
        }));
        sha = crypto.createHash('sha256').update(bytes).digest('hex');
      });
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      dbmod._inyectarGancho(null);
      const shaFinal = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex');
      ok('K.2 el gancho publicó la rama hermana', !!sha);
      ok('   A NO pisa el disco', shaFinal === sha, String(err));
    }

    // ---- K.3 MISMO COMMIT, BYTES DISTINTOS (caso 8) ------------------------
    {
      const dir = nuevaCarpeta('inter-caso8');
      const p = await prepararX(dir);
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), desmigrar(p.bytesX));
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3.gen'), p.genX);

      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId('AAAA'.padEnd(32, '0'));
      dbmod.setPoliticaUbicacion('compartida');
      let sha = null;
      dbmod._inyectarGancho((n) => {
        if (n !== 'memoria-cargada' || sha) return;
        // una "versión antigua" añade una fila SIN tocar los identificadores
        const d = new SQL.Database(desmigrar(p.bytesX));
        d.run("INSERT INTO projects(name,client,partition_name,created_at,updated_at) VALUES ('EXTERNA','c','persist:ex','x','x')");
        const bytes = Buffer.from(d.export()); d.close();
        fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), bytes);
        sha = crypto.createHash('sha256').update(bytes).digest('hex');
      });
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      dbmod._inyectarGancho(null);
      const shaFinal = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex');
      ok('K.3 el gancho introdujo el cambio externo', !!sha);
      ok('   A NO pisa la escritura externa', shaFinal === sha, String(err));
      ok('   la fila externa sobrevive',
        (() => { const d = new SQL.Database(fs.readFileSync(path.join(dir, 'panorama.sqlite3')));
          const nn = d.exec("SELECT COUNT(*) FROM projects WHERE name='EXTERNA'")[0].values[0][0]; d.close(); return nn === 1; })());
    }

    // ---- K.4 EIO en la revalidación JIT ------------------------------------
    {
      const dir = nuevaCarpeta('inter-eio');
      const p = await prepararX(dir);
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3'), desmigrar(p.bytesX));
      fs.writeFileSync(path.join(dir, 'panorama.sqlite3.gen'), p.genX);
      const shaAntes = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, 'panorama.sqlite3'))).digest('hex');

      dbmod._resetParaPruebas(); DIR_DATOS = dir; dbmod.setInstallationId('AAAA'.padEnd(32, '0'));
      dbmod.setPoliticaUbicacion('compartida');
      const realRead = fs.readFileSync;
      let armado = false;
      dbmod._inyectarGancho((n) => {
        if (n !== 'memoria-cargada' || armado) return;
        armado = true;
        fs.readFileSync = (p2, ...r) => {
          if (String(p2).endsWith('panorama.sqlite3')) throw Object.assign(new Error('inj'), { code: 'EIO' });
          return realRead(p2, ...r);
        };
      });
      let err = null;
      try { await dbmod.getDb(); } catch (e) { err = e; }
      fs.readFileSync = realRead;
      dbmod._inyectarGancho(null);
      ok('K.4 EIO justo en la revalidación JIT: NO se persiste', !!err, String(err));
      ok('   el .sqlite3 NO cambió',
        crypto.createHash('sha256').update(realRead(path.join(dir, 'panorama.sqlite3'))).digest('hex') === shaAntes);
    }
  }

` + marcador;

t = t.replace(marcador, nuevo);
fs.writeFileSync(P, t, 'utf8');
console.log('secciones I, J y K insertadas');
