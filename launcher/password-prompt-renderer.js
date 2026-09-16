const msgEl = document.getElementById('pp-message');
const inputEl = document.getElementById('pp-input');
const errEl = document.getElementById('pp-error');

window.passwordPromptAPI.onInit((data) => {
  msgEl.textContent = (data && data.message) || 'Introduce la contraseña:';
  inputEl.value = '';
  inputEl.focus();
});

let submitted = false;
function submit() {
  if (submitted) return; // evita doble envío si Enter y el click del botón llegan casi a la vez
  submitted = true;
  window.passwordPromptAPI.submit(inputEl.value);
}

document.getElementById('pp-ok').addEventListener('click', submit);
document.getElementById('pp-cancel').addEventListener('click', () => window.passwordPromptAPI.cancel());
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submit();
});
