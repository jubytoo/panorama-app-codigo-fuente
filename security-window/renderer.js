// v2.0.27: tema visual GLOBAL, ver vendor/theme.js.
initGlobalTheme();

const els = {
  title: document.getElementById('title'),
  subtitle: document.getElementById('subtitle'),
  rowCurrent: document.getElementById('row-current'),
  inputCurrent: document.getElementById('input-current'),
  rowPassword: document.getElementById('row-password'),
  labelPassword: document.getElementById('label-password'),
  inputPassword: document.getElementById('input-password'),
  rowConfirm: document.getElementById('row-confirm'),
  inputConfirm: document.getElementById('input-confirm'),
  hint: document.getElementById('hint'),
  rowRemember: document.getElementById('row-remember'),
  inputRemember: document.getElementById('input-remember'),
  error: document.getElementById('error'),
  btnCancel: document.getElementById('btn-cancel'),
  btnSubmit: document.getElementById('btn-submit'),
};

let mode = 'login';

function setError(msg) {
  els.error.textContent = msg || '';
}

function focusFirstField() {
  if (els.rowCurrent.style.display !== 'none') {
    els.inputCurrent.focus();
  } else if (els.rowPassword.style.display !== 'none') {
    els.inputPassword.focus();
  }
}

window.securityWinAPI.onInit((data) => {
  mode = data.mode;
  const canRemember = !!data.canRemember;

  els.rowCurrent.style.display = 'none';
  els.rowPassword.style.display = 'block';
  els.rowConfirm.style.display = 'none';
  els.rowRemember.style.display = 'none';
  els.hint.style.display = 'none';

  if (mode === 'login') {
    els.title.textContent = 'Panorama del Servicio está protegido';
    els.subtitle.textContent = 'Introduce la contraseña de seguridad para continuar.';
    els.labelPassword.textContent = 'Contraseña';
    if (canRemember) els.rowRemember.style.display = 'flex';
    els.btnSubmit.textContent = 'Entrar';
    els.btnSubmit.className = 'btn';
    els.btnCancel.textContent = 'Salir de la app';
  } else if (mode === 'setup') {
    els.title.textContent = 'Activar seguridad';
    els.subtitle.textContent = 'A partir de ahora, los backups de todos los proyectos se guardan cifrados en disco.';
    els.labelPassword.textContent = 'Contraseña nueva';
    els.rowConfirm.style.display = 'block';
    els.hint.style.display = 'block';
    els.hint.textContent = 'Si la olvidas y no la tienes recordada en este equipo, los backups cifrados no se podrán recuperar. Guárdala en un lugar seguro aparte.';
    if (canRemember) els.rowRemember.style.display = 'flex';
    els.btnSubmit.textContent = 'Activar';
    els.btnSubmit.className = 'btn';
    els.btnCancel.textContent = 'Cancelar';
  } else if (mode === 'change') {
    els.title.textContent = 'Cambiar contraseña';
    els.subtitle.textContent = 'Todos los backups existentes se vuelven a cifrar con la contraseña nueva.';
    els.rowCurrent.style.display = 'block';
    els.labelPassword.textContent = 'Contraseña nueva';
    els.rowConfirm.style.display = 'block';
    if (canRemember) els.rowRemember.style.display = 'flex';
    els.btnSubmit.textContent = 'Cambiar';
    els.btnSubmit.className = 'btn';
    els.btnCancel.textContent = 'Cancelar';
  } else if (mode === 'disable') {
    els.title.textContent = 'Desactivar seguridad';
    els.subtitle.textContent = 'Los backups existentes se descifran y se guardan en claro de nuevo.';
    els.rowCurrent.style.display = 'block';
    els.rowPassword.style.display = 'none';
    els.btnSubmit.textContent = 'Desactivar';
    els.btnSubmit.className = 'btn danger';
    els.btnCancel.textContent = 'Cancelar';
  }
  setError('');
  setTimeout(focusFirstField, 30);
});

function collect() {
  return {
    mode,
    current: els.inputCurrent.value,
    password: els.inputPassword.value,
    confirm: els.inputConfirm.value,
    remember: els.inputRemember.checked,
  };
}

function validateLocally(data) {
  if (mode === 'login') {
    if (!data.password) return 'Escribe la contraseña.';
  } else if (mode === 'setup') {
    if (!data.password || data.password.length < 4) return 'Usa al menos 4 caracteres.';
    if (data.password !== data.confirm) return 'Las dos contraseñas no coinciden.';
  } else if (mode === 'change') {
    if (!data.current) return 'Escribe la contraseña actual.';
    if (!data.password || data.password.length < 4) return 'La contraseña nueva debe tener al menos 4 caracteres.';
    if (data.password !== data.confirm) return 'Las dos contraseñas nuevas no coinciden.';
  } else if (mode === 'disable') {
    if (!data.current) return 'Escribe la contraseña actual.';
  }
  return null;
}

async function doSubmit() {
  // B5 (16 sept 2026) — UN ENVÍO YA EN CURSO NO SE REPITE.
  //
  // `els.btnSubmit.disabled` ya marcaba "hay un envío en vuelo", pero solo lo
  // respetaba el botón: un botón deshabilitado no dispara `click`. El listener
  // global de `keydown` llama aquí directamente, sin pasar por el botón, así
  // que cada Enter emitía otro `security-win:submit`. Medido: dos Enter = dos
  // IPC, cinco Enter = cinco IPC, click + Enter = dos IPC.
  //
  // No causaba corrupción —el proceso principal es síncrono y los serializa, y
  // por debajo están `rekeyInProgress`, la exclusiva de db.js y el journal del
  // rekey—, pero sí trabajo inútil (una derivación `scrypt` por cada pulsación)
  // y errores que se generan y se tiran. Se corta en el origen.
  if (els.btnSubmit.disabled) return;
  const data = collect();
  const localError = validateLocally(data);
  if (localError) {
    setError(localError);
    return;
  }
  setError('');
  els.btnSubmit.disabled = true;
  try {
    const result = await window.securityWinAPI.submit(data);
    if (result && result.error) {
      setError(result.error);
      els.btnSubmit.disabled = false;
    }
    // si no hay error, la ventana la cierra el proceso principal.
  } catch (e) {
    setError('Error inesperado: ' + (e && e.message ? e.message : e));
    els.btnSubmit.disabled = false;
  }
}

els.btnSubmit.addEventListener('click', doSubmit);
els.btnCancel.addEventListener('click', () => window.securityWinAPI.cancel());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doSubmit();
  if (e.key === 'Escape') window.securityWinAPI.cancel();
});
