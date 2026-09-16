'use strict';
// ---------------------------------------------------------------------------
// A3.3 — BLOQUE 5: HELPER DE BORRADOS DESTRUCTIVOS. AISLADO.
//
// Este archivo es el codigo destinado a main.js, pero TODAVIA NO ESTA CABLEADO
// a ningun handler productivo (D1 deleteProjectById, D2 meeting, D3 purga,
// D4 CV). Vive fuera del arbol de produccion a proposito: esta fase no
// modifica ningun archivo de la app.
//
// Todo lo que necesita del entorno entra por `deps` para que las pruebas usen
// las funciones REALES de main.js (marca de accion, escritura durable, commit
// A3.3) y puedan instrumentar `fs` sin reimplementar nada.
//
// PROTOCOLO:  RETIRAR (cuarentena por rename) -> CONFIRMAR (un commit) -> PURGAR
// ---------------------------------------------------------------------------

const BORRADOS_DIR_NAME = '.panorama-borrados';
const BORRADOS_JOURNAL_V = 1;
const BORRADOS_TIPOS = new Set(['borrar-proyecto', 'borrar-prep', 'purgar-backups']);

function crearHelperBorrados(deps) {
  const fs = deps.fs;
  const path = deps.path;
  const crypto = deps.crypto;
  const userDataDir = deps.userDataDir;              // () => ruta
  const getInstallationId = deps.getInstallationId;
  const getCommitActual = deps.getCommitActual;
  const escribirMultiple = deps.escribirMultiple;
  const escribirJsonDurable = deps.escribirJsonDurable;
  const sha256DeArchivo = deps.sha256DeArchivo;
  const sentenciaMarcaAccion = deps.sentenciaMarcaAccion;   // la REAL de main.js
  const estadoAccionEnMarca = deps.estadoAccionEnMarca;     // la REAL de main.js
  const leerJournalAccion = deps.leerJournalAccion;         // la REAL de main.js
  const accionesDirName = deps.accionesDirName || '.panorama-acciones';
  const appLog = deps.appLog || (() => {});
  const vaciarParticion = deps.vaciarParticion || null;     // async (nombre) => void

  // -- inyeccion de fallos, SOLO para pruebas. Inerte si nadie la llama. -----
  let falloEn = null;
  function fallarSiToca(punto) {
    if (falloEn && falloEn.punto === punto) {
      const e = new Error(falloEn.mensaje || ('fallo inyectado en ' + punto));
      e.inyectado = punto;
      if (falloEn.unaVez) falloEn = null;
      throw e;
    }
  }

  // =========================================================================
  // RUTAS — puras. NADA de mkdir, NADA de UPDATE implicito.
  // =========================================================================
  //
  // `backupsDirForProject()` de main.js NO sirve para preparar un borrado:
  // llama a `ensureProjectBackupDirSlug()`, que hace un UPDATE (y por tanto un
  // commit A3.3) cuando `backup_dir` es NULL, y ademas `mkdirSync` el destino.
  // Capturar el inventario del borrado con eso cambiaria la base sobre la que
  // se ancla el propio borrado y recrearia justo lo que se va a retirar.
  function slugDeProyectoPuro(row) {
    if (row && row.backup_dir) return String(row.backup_dir);
    if (!deps.slugify) throw new Error('falta deps.slugify para derivar el slug legado');
    return `${row.id}-${deps.slugify(row.name)}`;
  }
  function rutaBackupsPura(row) {
    return path.join(userDataDir(), 'backups', slugDeProyectoPuro(row));
  }
  function borradosDir() {
    return path.join(userDataDir(), BORRADOS_DIR_NAME);
  }
  function journalBorradoPath(actionId) {
    return path.join(borradosDir(), `${actionId}.json`);
  }
  function cuarentenaDe(actionId, i) {
    return path.join(borradosDir(), actionId, 'r' + i);
  }
  function nuevoActionId() {
    return crypto.randomBytes(16).toString('hex');
  }

  // =========================================================================
  // CONTENCION — semantica real de Windows, con path.relative()
  // =========================================================================
  // Un startsWith() artesanal falla de cuatro formas: separadores distintos,
  // mayusculas, carpetas hermanas con prefijo comun ("...\b" vs "...\bb") y
  // travesias con "..".
  function estaDentroDe(hijo, padre) {
    const rel = path.relative(path.resolve(padre), path.resolve(hijo));
    if (rel === '') return true;
    if (path.isAbsolute(rel)) return false;
    if (rel === '..' || rel.startsWith('..' + path.sep)) return false;
    return true;
  }
  function mismaRuta(a, b) {
    return path.resolve(String(a)).toLowerCase() === path.resolve(String(b)).toLowerCase();
  }

  // =========================================================================
  // JOURNAL DE BORRADO — VALIDACION CERRADA (diseño §4.7.2)
  // =========================================================================
  // Mismo criterio que el Bloque 4: un JSON parseable pero incompleto NO es
  // evidencia. Aqui importa mas todavia, porque un journal a medias no puede
  // convertirse en permiso para borrar una carpeta de cuarentena.
  const esHex = (s, n) => typeof s === 'string' && s.length === n && /^[0-9a-f]+$/i.test(s);
  const esEnteroNoNeg = (n) => typeof n === 'number' && Number.isInteger(n) && n >= 0;

  function leerJournalBorrado(ruta) {
    let j = null;
    try {
      j = JSON.parse(fs.readFileSync(ruta, 'utf8'));
    } catch (e) {
      return { clase: 'ilegible', ruta, motivo: String((e && e.message) || e) };
    }
    if (!j || typeof j !== 'object' || Array.isArray(j)) {
      return { clase: 'desconocido', ruta, motivo: 'el journal no es un objeto' };
    }
    if (j.v !== BORRADOS_JOURNAL_V) {
      return { clase: 'desconocido', ruta, motivo: `version ${JSON.stringify(j.v)}` };
    }
    const falta = [];
    if (!esHex(j.action_id, 32)) falta.push('action_id no son 32 hex');
    if (!esHex(j.writer, 32)) falta.push('writer no tiene formato de installation-id');
    if (!BORRADOS_TIPOS.has(j.tipo)) falta.push(`tipo desconocido (${JSON.stringify(j.tipo)})`);
    if (!esHex(j.base_commit_id, 32)) falta.push('base_commit_id no es un commit valido');
    if (j.fase !== 'retirando' && j.fase !== 'purgando') falta.push(`fase inesperada (${JSON.stringify(j.fase)})`);
    if (typeof j.startedAt !== 'string' || !j.startedAt) falta.push('startedAt vacio');
    if (!Array.isArray(j.recursos) || j.recursos.length === 0) {
      falta.push('recursos no es un array no vacio');
    } else {
      j.recursos.forEach((r, i) => {
        const p = (m) => falta.push(`recurso[${i}]: ${m}`);
        if (!r || typeof r !== 'object' || Array.isArray(r)) { p('no es un objeto'); return; }
        if (r.tipo !== 'archivo' && r.tipo !== 'directorio') p(`tipo invalido (${JSON.stringify(r.tipo)})`);
        if (r.scope !== 'archivo' && r.scope !== 'subtree') p(`scope invalido (${JSON.stringify(r.scope)})`);
        if (typeof r.origen !== 'string' || !r.origen || !path.isAbsolute(r.origen)) p('origen no es una ruta absoluta');
        if (typeof r.cuarentena !== 'string' || !r.cuarentena || !path.isAbsolute(r.cuarentena)) {
          p('cuarentena no es una ruta absoluta');
        } else if (esHex(j.action_id, 32)) {
          // La cuarentena TIENE que caer bajo .panorama-borrados/<action_id>.
          // Si no, un journal manipulado podria hacer que la purga borrara
          // cualquier carpeta del usuario.
          const raiz = path.join(borradosDir(), j.action_id);
          if (!estaDentroDe(r.cuarentena, raiz)) p('cuarentena fuera de .panorama-borrados/<action_id>');
        }
        if (typeof r.origen === 'string' && typeof r.cuarentena === 'string' && mismaRuta(r.origen, r.cuarentena)) {
          p('origen y cuarentena son la misma ruta');
        }
        if (r.tipo === 'archivo') {
          if (!esHex(r.sha256, 64)) p('archivo sin sha256 valido');
          if (!esEnteroNoNeg(r.size)) p('archivo sin size valido');
        } else if (r.tipo === 'directorio') {
          if (!esEnteroNoNeg(r.n_archivos)) p('directorio sin n_archivos valido');
          if (!esEnteroNoNeg(r.bytes_totales)) p('directorio sin bytes_totales valido');
        }
      });
    }
    // La particion NO es un recurso reversible: si el tipo la declara, tiene
    // que ser un identificador explicito. Nunca se inventa en la recuperacion.
    if (j.particion !== undefined && j.particion !== null) {
      if (typeof j.particion !== 'string' || !j.particion) falta.push('particion declarada pero vacia');
    }
    if (falta.length) {
      return {
        clase: 'incompleto', ruta, motivo: falta.join('; '),
        writerDeclarado: esHex(j.writer, 32) ? j.writer : null,
      };
    }
    return { clase: 'valido', ruta, j };
  }

  // ENOENT es lo unico que demuestra "no hay journals". Cualquier otro error
  // significa NO SE PUEDE SABER.
  function journalsDeBorrados() {
    let nombres = [];
    try {
      nombres = fs.readdirSync(borradosDir()).filter((f) => /\.json$/i.test(f));
    } catch (e) {
      const cod = (e && e.code) || '';
      if (cod === 'ENOENT') return { ok: true, entradas: [] };
      return { ok: false, noVerificable: true, codigo: cod, motivo: String((e && e.message) || e) };
    }
    return { ok: true, entradas: nombres.map((f) => leerJournalBorrado(path.join(borradosDir(), f))) };
  }
  function journalsDeAccionesCrudos() {
    const dir = path.join(userDataDir(), accionesDirName);
    let nombres = [];
    try {
      nombres = fs.readdirSync(dir).filter((f) => /\.json$/i.test(f));
    } catch (e) {
      const cod = (e && e.code) || '';
      if (cod === 'ENOENT') return { ok: true, entradas: [] };
      return { ok: false, noVerificable: true, codigo: cod, motivo: String((e && e.message) || e) };
    }
    return { ok: true, entradas: nombres.map((f) => leerJournalAccion(path.join(dir, f))) };
  }

  // =========================================================================
  // DOMINIO DE OCUPACION COMUN (diseño §4.8)
  // =========================================================================
  // `.panorama-acciones` y `.panorama-borrados` NO son dos mundos. Cualquier
  // pregunta de ocupacion mira LOS DOS conjuntos.
  //
  //   ocupado(destino) = algun recurso r de algun journal cumple
  //        r.scope === 'archivo'  &&  mismaRuta(destino, r.origen)
  //     || r.scope === 'subtree'  &&  estaDentroDe(destino, r.origen)
  function recursosReservados() {
    const acc = journalsDeAccionesCrudos();
    if (!acc.ok) return { ok: false, indeterminado: true, motivo: acc.motivo, fuente: 'acciones' };
    const bor = journalsDeBorrados();
    if (!bor.ok) return { ok: false, indeterminado: true, motivo: bor.motivo, fuente: 'borrados' };

    const recursos = [];
    for (const e of acc.entradas) {
      if (e.clase === 'valido') {
        recursos.push({
          fuente: 'accion', writer: e.j.writer, actionId: e.j.action_id,
          scope: 'archivo', origen: e.j.destino, ruta: e.ruta,
        });
      } else {
        // No se sabe que gobierna: indetermina TODO el dominio.
        return { ok: false, indeterminado: true, motivo: e.motivo, ruta: e.ruta, fuente: 'accion' };
      }
    }
    for (const e of bor.entradas) {
      if (e.clase === 'valido') {
        for (const r of e.j.recursos) {
          recursos.push({
            fuente: 'borrado', writer: e.j.writer, actionId: e.j.action_id,
            scope: r.scope, origen: r.origen, ruta: e.ruta,
          });
        }
      } else {
        return { ok: false, indeterminado: true, motivo: e.motivo, ruta: e.ruta, fuente: 'borrado' };
      }
    }
    return { ok: true, recursos };
  }

  function cubre(r, destino) {
    if (r.scope === 'archivo') return mismaRuta(destino, r.origen);
    return estaDentroDe(destino, r.origen);
  }

  // La relacion es SIMETRICA, y esto no estaba en la primera version.
  //
  // `cubre()` responde "¿el recurso reservado contiene al que pregunta?", que
  // es lo que necesita una ACCION (destino puntual). Pero un BORRADO pregunta
  // por un SUBARBOL entero, y entonces tambien hay conflicto al reves: un
  // journal ajeno que gobierna `backups/<slug>/evaluacion-candidatos/estado.json`
  // tiene que impedir que borremos `backups/<slug>`. Sin esta segunda
  // direccion, DEL-X1 pasaba de largo y el borrado se llevaba por delante el
  // archivo que otro equipo estaba publicando.
  function conflicto(r, ambito) {
    if (cubre(r, ambito.ruta)) return true;
    if (ambito.scope === 'subtree' && estaDentroDe(r.origen, ambito.ruta)) return true;
    return false;
  }

  // Misma forma de retorno que `destinoOcupadoPorOtroEquipo()` del Bloque 4,
  // para poder sustituirla sin tocar el cuerpo de `ejecutarAccionDeArchivo`.
  // Sin `scope` se comporta exactamente como aquella: destino puntual.
  function ocupacionComun(destino, opts) {
    const ambito = { ruta: destino, scope: (opts && opts.scope) === 'subtree' ? 'subtree' : 'archivo' };
    const res = recursosReservados();
    if (!res.ok) return { ocupado: true, indeterminado: true, motivo: res.motivo, ruta: res.ruta };
    const yo = getInstallationId();
    for (const r of res.recursos) {
      if (r.writer === yo) continue;          // F-1 cubre lo propio
      if (conflicto(r, ambito)) {
        return { ocupado: true, porWriter: r.writer, actionId: r.actionId, fuente: r.fuente, scope: r.scope, origen: r.origen };
      }
    }
    return { ocupado: false };
  }

  // =========================================================================
  // F-1 GLOBAL (diseño §4.8)
  // =========================================================================
  // "Un journal propio pendiente => ninguna accion propia nueva", mirando LOS
  // DOS conjuntos. Sin esto, un borrado pendiente podria ser desalojado de la
  // marca por los 8 guardados siguientes, y al reves.
  function f1Global() {
    const acc = journalsDeAccionesCrudos();
    if (!acc.ok) {
      return { libre: false, motivo: 'no se puede comprobar .' + accionesDirName + ': ' + acc.motivo, clase: 'no-verificable' };
    }
    const bor = journalsDeBorrados();
    if (!bor.ok) {
      return { libre: false, motivo: 'no se puede comprobar ' + BORRADOS_DIR_NAME + ': ' + bor.motivo, clase: 'no-verificable' };
    }
    const yo = getInstallationId();
    const pendientes = [];
    for (const e of acc.entradas) {
      if (e.clase === 'valido' && e.j.writer === yo) pendientes.push({ tipo: 'accion', ruta: e.ruta, actionId: e.j.action_id });
      else if (e.clase === 'incompleto' && e.writerDeclarado === yo) {
        return { libre: false, clase: 'no-demostrable', motivo: `journal de accion propio incompleto (${e.motivo})`, ruta: e.ruta };
      }
    }
    for (const e of bor.entradas) {
      if (e.clase === 'valido') {
        if (e.j.writer === yo) pendientes.push({ tipo: 'borrado', ruta: e.ruta, actionId: e.j.action_id });
        continue;
      }
      if (e.clase === 'incompleto' && e.writerDeclarado === yo) {
        return { libre: false, clase: 'no-demostrable', motivo: 'journal de borrado propio incompleto', ruta: e.ruta };
      }
      continue;
    }
    if (pendientes.length) {
      return { libre: false, clase: 'pendiente', pendientes, motivo: `hay ${pendientes.length} journal(es) propio(s) sin resolver` };
    }
    return { libre: true };
  }

  // =========================================================================
  // INVENTARIO de un recurso — sin efectos colaterales
  // =========================================================================
  function resumirDirectorio(dir) {
    let n = 0; let bytes = 0;
    const rec = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory()) rec(f);
        else { n++; bytes += fs.statSync(f).size; }
      }
    };
    rec(dir);
    return { n_archivos: n, bytes_totales: bytes };
  }
  function existeRuta(p) {
    try { fs.statSync(p); return true; } catch (e) { return false; }
  }

  // =========================================================================
  // NO-CLOBBER — la reposicion, punto unico (diseño §4.7.3)
  // =========================================================================
  // Medido en G:: `rename(cuarentena -> destino)` con el destino RECREADO no
  // falla, lo REEMPLAZA, y el contenido recreado por otro equipo desaparece.
  // En NTFS local el mismo rename da EPERM. Por tanto la defensa NO PUEDE ser
  // el comportamiento del sistema de archivos.
  //
  // Antes de cualquier rename(cuarentena -> origen): si `origen` existe, NO se
  // ejecuta el rename. Da igual por que exista. Se conservan origen,
  // cuarentena y journal, y el recurso queda fail-closed.
  //
  // La comprobacion va INMEDIATAMENTE antes del rename, por recurso, no en una
  // precomprobacion al principio de la operacion (eso dejaria TOCTOU).
  function reponerRecurso(r) {
    if (!existeRuta(r.cuarentena)) {
      // Nada que reponer: o no se llego a mover, o ya se repuso.
      return { estado: 'sin-cuarentena', origen: r.origen };
    }
    if (existeRuta(r.origen)) {
      appLog(`Borrado — NO-CLOBBER: "${r.origen}" ha reaparecido; no se repone y no se destruye nada.`);
      return { estado: 'destino-ocupado', origen: r.origen, cuarentena: r.cuarentena };
    }
    try {
      fs.mkdirSync(path.dirname(r.origen), { recursive: true });
      fs.renameSync(r.cuarentena, r.origen);
    } catch (e) {
      return { estado: 'fallo', origen: r.origen, codigo: (e && e.code) || null, motivo: String((e && e.message) || e) };
    }
    return { estado: 'repuesto', origen: r.origen };
  }

  // Reposicion de TODOS los recursos de un journal. No se detiene en el primer
  // problema: repone lo que pueda y declara el conjunto fail-closed si alguno
  // no se pudo devolver.
  function reponerTodo(j) {
    const detalle = j.recursos.map((r) => Object.assign({ recurso: r }, reponerRecurso(r)));
    const malos = detalle.filter((d) => d.estado === 'destino-ocupado' || d.estado === 'fallo');
    return { ok: malos.length === 0, detalle, malos };
  }

  function purgarTodo(j) {
    // Solo se borra dentro de .panorama-borrados/<action_id>. La validacion
    // cerrada ya lo garantiza; se vuelve a comprobar antes de cada rm.
    const raiz = path.join(borradosDir(), j.action_id);
    for (const r of j.recursos) {
      if (!estaDentroDe(r.cuarentena, raiz)) {
        return { ok: false, motivo: `cuarentena fuera de su raiz: ${r.cuarentena}` };
      }
    }
    try {
      fs.rmSync(raiz, { recursive: true, force: true });
    } catch (e) {
      return { ok: false, motivo: String((e && e.message) || e) };
    }
    return { ok: true };
  }

  // =========================================================================
  // EJECUTAR UN BORRADO
  // =========================================================================
  // Contrato IPC identico al del Bloque 4, tres formas:
  //   {ok:false, aplicado:false, reintentable, error}
  //   {ok:true,  aplicado:true,  verificado:true}
  //   {ok:true,  aplicado:true,  verificado:false, requiereReinicio:true, aviso}
  function noAplicado(error, reintentable, extra) {
    return Object.assign({ ok: false, aplicado: false, reintentable: !!reintentable, error }, extra || {});
  }

  function ejecutarBorrado(opts) {
    const o = opts || {};
    const writer = getInstallationId();

    // ---- F-1 GLOBAL: ningun journal propio pendiente, en NINGUNO de los dos
    const g = f1Global();
    if (!g.libre) {
      if (g.clase === 'no-verificable') {
        return noAplicado(
          'No se ha podido comprobar si hay una operacion anterior sin terminar. No se inicia ninguna ' +
          'nueva hasta poder comprobarlo.\n\nDetalle: ' + g.motivo, true, { bloqueo: 'accion-no-verificable' });
      }
      return noAplicado(
        'Hay una operacion anterior de este equipo sin resolver. No se inicia ninguna nueva hasta ' +
        'aclararlo: cierra la aplicacion y revisa el registro.\n\nDetalle: ' + g.motivo,
        false, { bloqueo: 'accion-no-demostrable' });
    }

    // ---- F0: capturar TODO junto, sin efectos colaterales ------------------
    const entrada = Array.isArray(o.recursos) ? o.recursos : [];
    if (!entrada.length) return noAplicado('Un borrado tiene que declarar al menos un recurso.', false);
    if (!BORRADOS_TIPOS.has(o.tipo)) return noAplicado(`Tipo de borrado desconocido: ${JSON.stringify(o.tipo)}`, false);

    for (const r of entrada) {
      // Un borrado pregunta por su AMBITO, no por un punto: si alguien tiene
      // reservado algo DENTRO del subarbol, tambien hay conflicto.
      const oc = ocupacionComun(r.origen, { scope: r.scope || (r.tipo === 'directorio' ? 'subtree' : 'archivo') });
      if (oc.ocupado) {
        return noAplicado(
          oc.indeterminado
            ? 'Otro equipo dejo una operacion sin terminar que no se puede interpretar. No se toca nada.'
            : 'Otro equipo esta trabajando ahora mismo sobre estos archivos. No se ha tocado nada.',
          true, { bloqueo: 'ocupado-otro-writer', detalleOcupacion: oc });
      }
    }

    const base = getCommitActual();
    if (!base) return noAplicado('La base de datos todavia no tiene identidad.', false);
    const actionId = nuevoActionId();

    // Inventario. Los recursos que no existen se descartan aqui: no tiene
    // sentido reservar ni reponer algo que no esta.
    const recursos = [];
    try {
      entrada.forEach((r, i) => {
        if (!existeRuta(r.origen)) return;
        const base0 = {
          tipo: r.tipo, scope: r.scope || (r.tipo === 'directorio' ? 'subtree' : 'archivo'),
          origen: path.resolve(r.origen), cuarentena: cuarentenaDe(actionId, i),
        };
        if (r.tipo === 'directorio') {
          Object.assign(base0, resumirDirectorio(base0.origen));
        } else {
          const h = sha256DeArchivo(base0.origen);
          if (!h.existe || h.ilegible) throw new Error(`no se pudo leer "${base0.origen}"`);
          base0.sha256 = h.sha; base0.size = h.size;
        }
        recursos.push(base0);
      });
    } catch (e) {
      return noAplicado('No se pudo inventariar lo que se va a borrar: ' + String((e && e.message) || e), true);
    }

    const journal = {
      v: BORRADOS_JOURNAL_V, action_id: actionId, writer, tipo: o.tipo,
      base_commit_id: base, fase: 'retirando', startedAt: new Date().toISOString(),
      recursos,
    };
    if (o.particion) journal.particion = String(o.particion);

    // Un borrado que no tiene NADA que retirar sigue necesitando su commit:
    // las filas de la BD existen aunque los archivos ya no.
    // ---- F1: journal durable ANTES de mover nada ---------------------------
    try {
      fs.mkdirSync(borradosDir(), { recursive: true });
      const gj = escribirJsonDurable(journalBorradoPath(actionId), journal);
      if (!gj.ok) throw new Error(gj.motivo);
      fallarSiToca('tras-journal');
    } catch (e) {
      try { fs.unlinkSync(journalBorradoPath(actionId)); } catch (e2) {}
      return noAplicado('No se pudo registrar la operacion antes de borrar: ' + String((e && e.message) || e), true);
    }

    // ---- F2: RETIRAR a cuarentena -----------------------------------------
    let movidos = 0;
    try {
      fs.mkdirSync(path.join(borradosDir(), actionId), { recursive: true });
      for (const r of recursos) {
        fallarSiToca(movidos === 0 ? 'primer-rename' : 'entre-recursos');
        fs.renameSync(r.origen, r.cuarentena);
        movidos++;
      }
      fallarSiToca('tras-retirar');
    } catch (e) {
      const v = reponerTodo(journal);
      if (!v.ok) {
        // No se pudo devolver todo: NO se borra el journal ni la cuarentena.
        return noAplicado(
          'No se pudo retirar lo que se iba a borrar y la vuelta atras no se pudo completar. No se ha ' +
          'destruido nada: cierra la aplicacion y revisa el registro.\n\nDetalle: ' + String((e && e.message) || e),
          false, { bloqueo: 'accion-no-demostrable', actionId, vuelta: v });
      }
      try { fs.rmSync(path.join(borradosDir(), actionId), { recursive: true, force: true }); } catch (e2) {}
      try { fs.unlinkSync(journalBorradoPath(actionId)); } catch (e2) {}
      return noAplicado('No se pudo retirar lo que se iba a borrar: ' + String((e && e.message) || e), true);
    }

    // ---- F3: CONFIRMAR — UNA mutacion, anclada a la base, con la marca -----
    const sentencias = (o.sentencias ? o.sentencias({ actionId }) : []).slice();
    sentencias.push(sentenciaMarcaAccion(actionId));
    try {
      fallarSiToca('en-commit');
      escribirMultiple(sentencias, { exigirCommitBase: base });
    } catch (e) {
      if (e && e.aplicado === true) {
        // POST-confirmacion: las filas SI se borraron. NO se reponen los
        // archivos: eso dejaria "fila borrada + archivos presentes" con el
        // usuario creyendo que puede seguir.
        appLog(`ERROR PS-2006 — el borrado ${actionId} (${o.tipo}) SI se aplico pero no se pudo verificar: ${e.message}`);
        return {
          ok: true, aplicado: true, verificado: false, requiereReinicio: true, actionId,
          aviso: 'El borrado SI se ha aplicado, pero no se ha podido verificar y esta sesion no puede ' +
            'continuar de forma segura. Cierra Panorama del Servicio y vuelve a abrirlo. NO repitas la ' +
            'operacion.\n\nDetalle: ' + String(e.message),
        };
      }
      // PRE-confirmacion: la base de datos no se toco. Se repone todo.
      const v = reponerTodo(journal);
      const reintentable = !!(e && (e.kind === 'base-cambiada' || e.kind === 'conflicto' ||
        e.kind === 'ocupado' || e.kind === 'io'));
      if (!v.ok) {
        return noAplicado(
          'No se borro nada, y ademas la vuelta atras no se pudo completar. No se ha destruido nada: ' +
          'cierra la aplicacion y revisa el registro.\n\nDetalle: ' + String((e && e.message) || e),
          false, { bloqueo: 'accion-no-demostrable', actionId, vuelta: v });
      }
      try { fs.rmSync(path.join(borradosDir(), actionId), { recursive: true, force: true }); } catch (e2) {}
      try { fs.unlinkSync(journalBorradoPath(actionId)); } catch (e2) {}
      return noAplicado(
        e && e.kind === 'base-cambiada'
          ? 'Otro equipo guardo cambios mientras se borraba esto. No se ha modificado nada; vuelve a intentarlo.'
          : 'No se pudo borrar: ' + String((e && e.message) || e),
        reintentable, { actionId });
    }

    // ---- F4: PURGAR (y vaciar la particion, que NO es reversible) ----------
    const purga = finalizarPurga(journal);
    return { ok: true, aplicado: true, verificado: true, actionId, purga };
  }

  // La purga es idempotente y se repite al arrancar si quedo a medias.
  function finalizarPurga(j) {
    try {
      const marcado = Object.assign({}, j, { fase: 'purgando' });
      escribirJsonDurable(journalBorradoPath(j.action_id), marcado);
      fallarSiToca('en-purga');
      const p = purgarTodo(marcado);
      if (!p.ok) return { ok: false, motivo: p.motivo };
      if (j.particion && vaciarParticion) {
        try { vaciarParticion(j.particion); } catch (e) {
          appLog(`Borrado — no se pudo vaciar la particion ${j.particion}: ${String((e && e.message) || e)}`);
          return { ok: false, particionPendiente: true, motivo: String((e && e.message) || e) };
        }
      }
      try { fs.unlinkSync(journalBorradoPath(j.action_id)); } catch (e) {}
      return { ok: true };
    } catch (e) {
      return { ok: false, motivo: String((e && e.message) || e) };
    }
  }

  // =========================================================================
  // RECUPERACION AL ARRANCAR
  // =========================================================================
  function recuperarBorradosPendientes() {
    const r = journalsDeBorrados();
    if (!r.ok) {
      return { ok: false, clase: 'no-verificable', motivo: r.motivo };
    }
    const yo = getInstallationId();
    const resultados = [];
    for (const e of r.entradas) {
      if (e.clase !== 'valido') {
        if (e.writerDeclarado === yo || e.clase === 'ilegible' || e.clase === 'desconocido') {
          // Propio e incompleto -> fail-closed. Ajeno ilegible -> tampoco se
          // toca: no se sabe que gobierna, y desde luego no se borra.
          resultados.push({ ruta: e.ruta, ok: false, clase: 'journal-no-demostrable', motivo: e.motivo });
          continue;
        }
        resultados.push({ ruta: e.ruta, ok: true, clase: 'ajeno-ignorado' });
        continue;
      }
      if (e.j.writer !== yo) { resultados.push({ ruta: e.ruta, ok: true, clase: 'ajeno' }); continue; }
      resultados.push(resolverBorradoPendiente(e.j));
    }
    const malos = resultados.filter((x) => !x.ok);
    return { ok: malos.length === 0, resultados, malos };
  }

  function resolverBorradoPendiente(j) {
    const enMarca = estadoAccionEnMarca(j.action_id);

    // La marca no se puede interpretar: no es "no aplicado", es que no se sabe.
    if (enMarca.estado === 'no-demostrable') {
      appLog(`ERROR PS-2006 — no se puede saber si el borrado ${j.action_id} llego a aplicarse: ${enMarca.motivo}`);
      return { ok: false, actionId: j.action_id, clase: 'accion-no-demostrable', motivo: enMarca.motivo };
    }

    // CASO B: el commit SI se aplico -> no se repone; se purga.
    if (enMarca.estado === 'aplicada') {
      const p = finalizarPurga(j);
      if (!p.ok) return { ok: false, actionId: j.action_id, clase: 'purga-incompleta', motivo: p.motivo, particionPendiente: !!p.particionPendiente };
      return { ok: true, actionId: j.action_id, caso: 'B', clase: 'purgado' };
    }

    // CASO A: no se aplico -> se repone TODO, con NO-CLOBBER.
    const v = reponerTodo(j);
    if (!v.ok) {
      appLog(`ERROR PS-2006 — el borrado ${j.action_id} no se pudo deshacer por completo; no se destruye nada.`);
      return { ok: false, actionId: j.action_id, caso: 'A', clase: 'rollback-bloqueado', vuelta: v };
    }
    try { fs.rmSync(path.join(borradosDir(), j.action_id), { recursive: true, force: true }); } catch (e) {}
    try { fs.unlinkSync(journalBorradoPath(j.action_id)); } catch (e) {}
    return { ok: true, actionId: j.action_id, caso: 'A', clase: 'repuesto' };
  }

  // =========================================================================
  return {
    BORRADOS_DIR_NAME, BORRADOS_JOURNAL_V, BORRADOS_TIPOS,
    // rutas puras
    slugDeProyectoPuro, rutaBackupsPura, borradosDir, journalBorradoPath, cuarentenaDe, nuevoActionId,
    // contencion
    estaDentroDe, mismaRuta,
    // journals
    leerJournalBorrado, journalsDeBorrados,
    // dominio comun
    recursosReservados, ocupacionComun, f1Global,
    // operacion
    ejecutarBorrado, recuperarBorradosPendientes, resolverBorradoPendiente,
    // rollback / purga (la FUNCION REAL que ejercitan las pruebas)
    reponerRecurso, reponerTodo, purgarTodo, finalizarPurga,
    // inventario
    resumirDirectorio, existeRuta,
    // solo pruebas
    _inyectarFalloEn(punto, mensaje, unaVez) { falloEn = punto ? { punto, mensaje, unaVez: unaVez !== false } : null; },
  };
}

module.exports = { crearHelperBorrados, BORRADOS_DIR_NAME, BORRADOS_JOURNAL_V, BORRADOS_TIPOS };
