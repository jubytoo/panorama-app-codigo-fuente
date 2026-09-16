// Cuerpo NUEVO de restoreProjectBackup, para sustituir las lineas 3502..3604
// de main.js. Se escribe aparte porque el bloque es largo y asi el reemplazo se
// hace por lineas exactas, verificando antes y despues.
module.exports = `async function restoreProjectBackup(projectId, backupId) {
  const pid = Number(projectId);
  const noAplicado = (error, reintentable, extra) =>
    Object.assign({ ok: false, aplicado: false, reintentable: !!reintentable, error }, extra || {});

  // ---- R-2: ARMAR LA BARRERA, antes de tocar ninguna ventana -------------
  //
  // Va PRIMERO a proposito: los close hooks de las tres familias tienen que
  // saber que cierran POR RESTAURACION antes de que empiece el quiesce, o
  // escribirian como backup nuevo justo el estado que se ha pedido descartar.
  const bloq0 = proyectoBloqueadoParaMutar(pid);
  if (bloq0) return noAplicado(bloq0.mensaje, bloq0.motivo === 'proyecto-en-restauracion', { bloqueo: bloq0.motivo });
  proyectosEnRestauracion.add(pid);
  let armado = true;
  let actionId = null;
  let journalEscrito = null;
  let ventanasCerradas = false;
  const desarmarSiProcede = () => { if (armado) { proyectosEnRestauracion.delete(pid); armado = false; } };

  try {
    // ---- R-1: guardas del canal + F-1 GLOBAL ----------------------------
    if (procesoComprometido) {
      return noAplicado('La aplicacion esta cerrandose por un fallo interno; no se ha restaurado nada.', false, { bloqueo: 'proceso-comprometido' });
    }
    {
      const b = bloqueoDeSeguridad();
      if (b) return noAplicado(b.mensaje, false, { bloqueo: b.motivo });
    }
    if (rekeyInProgress) return noAplicado(REKEY_BUSY_MESSAGE, true, { bloqueo: 'rekey' });
    {
      const g = f1Global();
      if (!g.libre) {
        if (g.clase === 'no-verificable') {
          return noAplicado('No se ha podido comprobar si hay una operacion anterior sin terminar. No se restaura nada.\\n\\nDetalle: ' + g.motivo, true, { bloqueo: 'accion-no-verificable' });
        }
        appLog('ERROR PS-2006 — restauracion no iniciada: ' + g.motivo);
        return noAplicado('Hay una operacion anterior de este equipo sin resolver. No se restaura nada hasta aclararlo.\\n\\nDetalle: ' + g.motivo, false, { bloqueo: 'accion-no-demostrable' });
      }
    }
    {
      const g = f1Restauraciones();
      if (!g.libre) {
        appLog('ERROR PS-2006 — restauracion no iniciada: ' + g.motivo);
        return noAplicado('Hay una restauracion anterior de este equipo sin resolver. No se empieza otra hasta aclararlo.\\n\\nDetalle: ' + g.motivo,
          g.clase === 'no-verificable', { bloqueo: g.clase === 'no-verificable' ? 'accion-no-verificable' : 'accion-no-demostrable' });
      }
    }

    const row = dbmod.get('SELECT * FROM projects WHERE id=?', [pid]);
    if (!row) return noAplicado('Proyecto no encontrado.', false);
    const bkRow = backupId
      ? dbmod.get('SELECT * FROM backups WHERE id=?', [backupId])
      : dbmod.get('SELECT * FROM backups WHERE project_id=? ORDER BY created_at DESC LIMIT 1', [pid]);
    if (!bkRow) return noAplicado('No hay backups guardados para este proyecto todavia.', false);

    // ---- R0: QUIESCE completo, las TRES familias ------------------------
    try {
      await cerrarVentanasDeProyecto(pid, { porRestauracion: true });
      ventanasCerradas = true;
    } catch (e) {
      return noAplicado('No se pudieron cerrar las ventanas del proyecto: ' + String((e && e.message) || e), true);
    }
    if (projectWindows.has(pid) || meetingPrepWindows.has(pid) || candidateEvalWindows.has(pid)) {
      return noAplicado('Sigue habiendo una ventana de este proyecto abierta. No se ha tocado nada; cierrala a mano y vuelve a intentarlo.', true);
    }

    // ---- R1: CAPTURAR — la base DESPUES del quiesce, rutas puras --------
    //
    // Antes del quiesce no vale: cerrar ventanas mueve el commit (bounds,
    // guardados finales), y esa base llegaria invalida a exigirCommitBase.
    const base = dbmod.getCommitActual();
    if (!base) return noAplicado('La base de datos todavia no tiene identidad.', false);
    const dirBackups = rutaBackupsPura(row);

    {
      const oc = ocupacionComun(dirBackups, { scope: 'subtree' });
      if (oc.ocupado) {
        return noAplicado(
          oc.indeterminado
            ? 'Otro equipo dejo una operacion sin terminar que no se puede interpretar. No se ha tocado nada.'
            : 'Otro equipo esta trabajando ahora mismo sobre este proyecto. No se ha tocado nada.',
          true, { bloqueo: 'ocupado-otro-writer', detalleOcupacion: oc });
      }
    }

    // Lectura y validacion del backup con rutas PURAS: cero UPDATE, cero mkdir.
    let esperado;
    let backupSha = null;
    try {
      esperado = JSON.parse(readBackupPayload(row, bkRow, { puro: true }));
      if (bkRow.file_path) {
        const h = sha256DeArchivo(path.join(dirBackups, bkRow.file_path));
        backupSha = h.existe && !h.ilegible ? h.sha : null;
      }
    } catch (e) {
      return noAplicado('No se pudo leer el backup: ' + String((e && e.message) || e), false);
    }
    if (!esperado || typeof esperado !== 'object' || Array.isArray(esperado)) {
      return noAplicado('El backup no contiene un estado restaurable.', false);
    }

    let previoDump;
    try { previoDump = await readLocalStorageDumpFromPartition(row.partition_name); } catch (e) {
      return noAplicado('No se pudo leer el estado actual del proyecto: ' + String((e && e.message) || e), true);
    }

    actionId = nuevoActionId();
    const journal = {
      v: RESTAURACIONES_JOURNAL_V, action_id: actionId, writer: dbmod.getInstallationId(),
      project_id: pid, partition: String(row.partition_name),
      backups_dir: dirBackups,
      backup_id: bkRow.id === undefined ? null : bkRow.id,
      backup_sha256: backupSha,
      base_commit_id: base,
      esperado_hash: hashDumpLocalStorage(esperado),
      esperado_claves: Object.keys(esperado).sort(),
      previo_hash: hashDumpLocalStorage(previoDump),
      fase: 'aplicando', cifrado: 0,
      previo_sha256: null, previo_size: 0, previo_n_claves: 0,
      startedAt: new Date().toISOString(),
    };

    // ---- R2: FOTO PREVIA DURABLE ----------------------------------------
    try {
      const p = escribirPrevioDurable(actionId, journal, previoDump);
      journal.cifrado = p.cifrado;
      journal.previo_sha256 = p.sha256;
      journal.previo_size = p.size;
      journal.previo_n_claves = p.n_claves;
    } catch (e) {
      try { fs.rmSync(dirDeRestauracion(actionId), { recursive: true, force: true }); } catch (e2) {}
      return noAplicado('No se pudo guardar la copia del estado actual: ' + String((e && e.message) || e), true);
    }

    // ---- R3: JOURNAL DURABLE, antes de tocar la particion ---------------
    try {
      const g = escribirBufferDurable(journalRestauracionPath(actionId), Buffer.from(JSON.stringify(journal, null, 2), 'utf8'));
      if (!g.ok) throw new Error(g.motivo);
      journalEscrito = journal;
    } catch (e) {
      try { fs.rmSync(dirDeRestauracion(actionId), { recursive: true, force: true }); } catch (e2) {}
      return noAplicado('No se pudo registrar la operacion antes de restaurar: ' + String((e && e.message) || e), true);
    }

    // ---- R4: APLICAR -----------------------------------------------------
    try {
      await writeLocalStorageDumpToPartition(row.partition_name, esperado, { clearFirst: true });
    } catch (e) {
      const v = await reponerParticionDesdePrevio(journal);
      if (v.estado !== 'repuesto' && v.estado !== 'ya-estaba') {
        const rescate = saveRescueDump(row, previoDump);
        appLog('ERROR PS-2005 — la restauracion ' + actionId + ' fallo y la vuelta atras no se pudo completar. Copia de rescate: ' + (rescate || 'NO SE PUDO ESCRIBIR'));
        armado = true;
        return noAplicado(
          'La restauracion fallo y tampoco se pudo dejar el proyecto como estaba. NO sigas trabajando en este ' +
          'proyecto sin revisarlo. Todos tus backups siguen intactos en disco.\\n\\nDetalle: ' + String((e && e.message) || e) +
          (rescate ? '\\n\\nCopia de rescate del estado anterior:\\n' + rescate : '') + errorCodeSuffix('PS-2005'),
          false, { bloqueo: 'accion-no-demostrable', actionId, vuelta: v });
      }
      try { fs.rmSync(dirDeRestauracion(actionId), { recursive: true, force: true }); } catch (e2) {}
      if (ventanasCerradas) { desarmarSiProcede(); openProjectWindow(row); }
      return noAplicado('No se ha restaurado nada: el proyecto queda exactamente como estaba.\\n\\nDetalle: ' +
        String((e && e.message) || e) + errorCodeSuffix('PS-2002'), true, { actionId });
    }

    // ---- R5: CONFIRMAR — marca + exigirCommitBase ------------------------
    //
    // El restore no cambia filas, pero necesita un punto de confirmacion A3.3
    // demostrable. La marca ES ese punto: antes de ella la recuperacion repone;
    // despues, no se vuelve atras nunca.
    try {
      dbmod.escribirMultiple([sentenciaMarcaAccion(actionId)], { exigirCommitBase: base });
    } catch (e) {
      if (e && e.aplicado === true) {
        appLog('ERROR PS-2006 — la restauracion ' + actionId + ' SI se aplico pero no se pudo verificar: ' + e.message);
        return {
          ok: true, aplicado: true, verificado: false, requiereReinicio: true, actionId,
          aviso: 'La restauracion SI se ha aplicado, pero no se ha podido verificar y esta sesion no puede ' +
            'continuar de forma segura. Cierra Panorama del Servicio y vuelve a abrirlo. NO repitas la ' +
            'operacion.\\n\\nDetalle: ' + String(e.message),
        };
      }
      const v = await reponerParticionDesdePrevio(journal);
      const reintentable = !!(e && (e.kind === 'base-cambiada' || e.kind === 'conflicto' || e.kind === 'ocupado' || e.kind === 'io'));
      if (v.estado !== 'repuesto' && v.estado !== 'ya-estaba') {
        const rescate = saveRescueDump(row, previoDump);
        appLog('ERROR PS-2005 — la restauracion ' + actionId + ' no se confirmo y la vuelta atras quedo bloqueada. Copia de rescate: ' + (rescate || 'NO SE PUDO ESCRIBIR'));
        armado = true;
        return noAplicado(
          'No se restauro nada, y ademas la vuelta atras no se pudo completar. No se ha destruido nada: ' +
          'cierra la aplicacion y revisa el registro.\\n\\nDetalle: ' + String((e && e.message) || e) + errorCodeSuffix('PS-2005'),
          false, { bloqueo: 'accion-no-demostrable', actionId, vuelta: v });
      }
      try { fs.rmSync(dirDeRestauracion(actionId), { recursive: true, force: true }); } catch (e2) {}
      if (ventanasCerradas) { desarmarSiProcede(); openProjectWindow(row); }
      return noAplicado(
        e && e.kind === 'base-cambiada'
          ? 'Otro equipo guardo cambios mientras se restauraba. No se ha modificado nada; vuelve a intentarlo.'
          : 'No se pudo restaurar: ' + String((e && e.message) || e),
        reintentable, { actionId });
    }

    // ---- R6: CLEANUP -----------------------------------------------------
    const limpieza = limpiarMaterialRestauracion(actionId, journal);
    appLog('Restauracion ' + actionId + ' aplicada' + (limpieza.ok ? '' : ' — limpieza pendiente: ' + limpieza.motivo) + '.');

    // ---- R7: liberar la barrera y reabrir --------------------------------
    desarmarSiProcede();
    openProjectWindow(row);
    return { ok: true, aplicado: true, verificado: true, actionId, limpieza };
  } catch (e) {
    // NINGUNA excepcion sale de aqui: el contrato son SIEMPRE tres formas. Una
    // que escapara dejaria al consumidor sin \`aplicado\`, que es justo la
    // truthiness que el Bloque 4 cerro.
    appLog('ERROR — excepcion inesperada durante la restauracion: ' + String((e && e.stack) || e));
    if (!journalEscrito) {
      if (actionId) { try { fs.rmSync(dirDeRestauracion(actionId), { recursive: true, force: true }); } catch (e2) {} }
      return noAplicado('No se ha restaurado nada: ' + String((e && e.message) || e), true, { actionId });
    }
    const v = await reponerParticionDesdePrevio(journalEscrito);
    if (v.estado !== 'repuesto' && v.estado !== 'ya-estaba') {
      appLog('ERROR PS-2005 — la restauracion ' + actionId + ' fallo y la vuelta atras no se pudo completar.');
      armado = true;
      return noAplicado(
        'La restauracion fallo y tampoco se pudo dejar el proyecto como estaba. No se ha destruido nada: ' +
        'cierra la aplicacion y revisa el registro.\\n\\nDetalle: ' + String((e && e.message) || e) + errorCodeSuffix('PS-2005'),
        false, { bloqueo: 'accion-no-demostrable', actionId, vuelta: v });
    }
    try { fs.rmSync(dirDeRestauracion(actionId), { recursive: true, force: true }); } catch (e2) {}
    return noAplicado('No se ha restaurado nada: el proyecto queda exactamente como estaba.\\n\\nDetalle: ' +
      String((e && e.message) || e), true, { actionId });
  } finally {
    desarmarSiProcede();
  }
}`;
