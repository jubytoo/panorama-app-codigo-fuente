(function () {
  // v2.0.27: tema visual GLOBAL, ver vendor/theme.js.
  initGlobalTheme();

  const listEl = document.getElementById('list');
  const statusEl = document.getElementById('status');
  const errorEl = document.getElementById('error');
  const titleEl = document.getElementById('title');
  const closeBtn = document.getElementById('btn-close');

  titleEl.textContent = `Restaurar un backup — ${window.backupPickerAPI.projectName || 'proyecto'}`;
  closeBtn.addEventListener('click', () => window.close());

  const REASON_LABELS = {
    interval: 'Guardado automático (periódico)',
    beforeunload: 'Guardado automático (cierre de ventana)',
    startup: 'Guardado automático (al abrir)',
    closing: 'Guardado automático (al cerrar)',
    manual: 'Guardado manual',
    'manual-button': 'Guardado manual (botón Guardar)',
    'restaurar-backup': 'Restauración previa',
  };

  function reasonLabel(reason) {
    return REASON_LABELS[reason] || (reason ? `Guardado (${reason})` : 'Guardado');
  }

  function formatDate(iso) {
    try {
      const d = new Date(iso);
      return d.toLocaleString('es-ES', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    } catch (e) {
      return iso;
    }
  }

  function formatSize(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }
  function clearError() {
    errorEl.style.display = 'none';
    errorEl.textContent = '';
  }

  const MAX_SHOWN = 60;

  async function load() {
    let backups;
    try {
      backups = await window.backupPickerAPI.listBackups();
    } catch (e) {
      listEl.innerHTML = '';
      showError('No se pudo leer la lista de backups: ' + ((e && e.message) || e));
      return;
    }
    if (!backups || !backups.length) {
      listEl.innerHTML = '<div id="empty">Todavía no hay ningún backup guardado para este proyecto.</div>';
      return;
    }
    const shown = backups.slice(0, MAX_SHOWN);
    if (backups.length > MAX_SHOWN) {
      statusEl.textContent = `Mostrando los ${MAX_SHOWN} más recientes de ${backups.length} guardados en total.`;
    }
    listEl.innerHTML = '';
    shown.forEach((bk) => {
      const row = document.createElement('div');
      row.className = 'row';
      const info = document.createElement('div');
      info.className = 'row-info';
      const dateEl = document.createElement('div');
      dateEl.className = 'row-date';
      dateEl.textContent = formatDate(bk.created_at) + (bk.encrypted ? ' 🔒' : '');
      const metaEl = document.createElement('div');
      metaEl.className = 'row-meta';
      metaEl.textContent = `${reasonLabel(bk.reason)} · ${formatSize(bk.size)}`;
      info.appendChild(dateEl);
      info.appendChild(metaEl);
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = 'Restaurar';
      btn.addEventListener('click', () => restore(bk, btn));
      row.appendChild(info);
      row.appendChild(btn);
      listEl.appendChild(row);
    });
  }

  async function restore(bk, btn) {
    clearError();
    const ok = await psConfirm(
      'Esto reemplaza los datos actuales por los de ese backup. ' +
      'Esta acción no se puede deshacer desde la propia app.',
      { title: `¿Restaurar el backup del ${formatDate(bk.created_at)}?`, confirmLabel: 'Restaurar' }
    );
    if (!ok) return;
    const allButtons = listEl.querySelectorAll('button');
    allButtons.forEach((b) => { b.disabled = true; });
    const originalText = btn.textContent;
    btn.textContent = 'Restaurando…';
    // A2 bajo A3.3 — contrato de tres formas. Se decide por `aplicado`, nunca
    // por que la promesa no reviente: `restoreBackup` ya no lanza.
    const volverAHabilitar = () => {
      allButtons.forEach((b) => { b.disabled = false; });
      btn.textContent = originalText;
    };
    try {
      const res = await window.backupPickerAPI.restoreBackup(bk.id);
      if (!res || res.aplicado !== true) {
        // (A) no aplicado: se puede reintentar si el contrato lo dice.
        showError(((res && res.error) || 'No se ha podido restaurar el backup.') +
          (res && res.reintentable ? ' Puedes volver a intentarlo.' : ''));
        volverAHabilitar();
        return;
      }
      if (res.verificado === false) {
        // (C) aplicado pero sin verificar: SÍ ocurrió. NO se reintenta, y la
        // ventana deja de aceptar mutaciones.
        statusEl.textContent = 'Restaurado, pero hay que reiniciar Panorama del Servicio.';
        allButtons.forEach((b) => { b.disabled = true; });
        btn.textContent = originalText;
        if (typeof psAlert === 'function') {
          try {
            await psAlert(res.aviso || 'El backup SÍ se ha restaurado, pero no se ha podido verificar. Cierra Panorama del Servicio y vuelve a abrirlo. NO repitas la operación.',
              { title: 'Hay que reiniciar la aplicación', danger: true });
          } catch (e) { /* el aviso ya está en el estado */ }
        }
        return;
      }
      // (B) aplicado y verificado.
      statusEl.textContent = 'Backup restaurado — la ventana del proyecto se ha reabierto.';
      setTimeout(() => window.close(), 900);
    } catch (e) {
      showError((e && e.message) || String(e));
      volverAHabilitar();
    }
  }

  load();
})();
