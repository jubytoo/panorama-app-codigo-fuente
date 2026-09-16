// v2.0.31 — FASE 5a/5b: modal de confirmación/aviso propio, para sustituir
// confirm()/alert() nativos de Chromium (que se ven como el cuadro genérico
// del navegador, no como parte de la app — justo lo que motivó toda esta
// serie de fases: "se siente app profesional de Windows, no web").
//
// Mismo patrón que vendor/theme.js/vendor/motion.css: un solo archivo
// compartido, cargado por <link>/<script> en cada ventana que lo necesite
// (no las 7 — Evaluación de Candidatos y Seguridad ya tienen su propio
// modal/pantalla propia desde antes, sin ningún confirm()/alert() nativo
// que sustituir, así que no cargan esto).
//
// A diferencia de los modales que ya existían sueltos en algunas ventanas
// (promptModal en directorio, askConfirm en evaluación de candidatos), este
// NO depende de marcado HTML previo en la plantilla: construye su propio DOM
// al vuelo y lo retira al cerrar, así que integrarlo en una ventana nueva es
// solo cargar el script y llamar a la función — cero HTML que añadir a mano.
//
// Usa las variables de tema que ya define vendor/theme.js sobre :root
// (--bg/--surface/--ink/--border/--cyan/--red-tx/...) con un valor de
// reserva por si alguna ventana lo cargara sin theme.js -- así se adapta
// solo al tema activo en cada ventana, sin configuración aparte.
//
// API (Promise-based, igual que promptModal -- que el propio informe de
// auditoría de la Fase 5 señaló como el patrón más reutilizable de los dos
// que ya había en el código):
//
//   await psConfirm(mensaje, opts?)  -> boolean
//     opts: { title, confirmLabel='Confirmar', cancelLabel='Cancelar',
//             danger=false (botón de confirmar en rojo, para acciones
//             destructivas: eliminar, resetear...),
//             icon (v2.0.34: glifo/emoji opcional mostrado grande encima
//             del título, p.ej. '✅'/'⚠️' -- para diálogos donde conviene
//             distinguir el caso de un vistazo, sin tener que leer texto) }
//     true si se confirma; false si se cancela (botón, clic fuera del
//     cuadro, o Escape).
//
//   await psAlert(mensaje, opts?)  -> undefined
//     opts: { title, okLabel='Aceptar', danger=false (para avisos de
//             error), icon (igual que en psConfirm) }
//     Resuelve al cerrarse (botón, clic fuera, Escape o Enter) -- un aviso
//     no tiene nada que "cancelar".
//
// Nota de foco: en psConfirm, el foco por defecto va al botón Cancelar, no
// al de confirmar -- pulsar Enter por costumbre (el gesto más común tras
// leer un diálogo) no debe disparar una acción destructiva por accidente.
// psAlert solo tiene un botón, así que Enter/Escape/clic fuera hacen todos
// lo mismo: cerrarlo.
(function () {
  let stylesInjected = false;
  function ensureStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.id = 'ps-modal-styles';
    style.textContent = `
      .ps-modal-backdrop{
        position:fixed; inset:0; background:rgba(0,0,0,.6); display:flex;
        align-items:center; justify-content:center; padding:24px; z-index:10000;
        animation: ps-modal-fade .15s ease-out both;
      }
      @keyframes ps-modal-fade{ from{ opacity:0; } to{ opacity:1; } }
      .ps-modal-box{
        background:var(--surface,#121821); border:1px solid var(--border,#232e3a);
        border-radius:14px; box-shadow:var(--shadow,0 8px 24px rgba(0,0,0,.3));
        max-width:440px; width:100%; padding:22px 24px 20px;
        font-family:var(--sans,'Segoe UI',system-ui,sans-serif);
        color:var(--ink,#eef2f6);
        animation: ps-modal-in .18s ease-out both;
      }
      @keyframes ps-modal-in{
        from{ opacity:0; transform:translateY(6px) scale(.98); }
        to{ opacity:1; transform:translateY(0) scale(1); }
      }
      /* v2.0.47: bug real reportado -- icono y título se apilaban en
         líneas separadas (icono de 30px solo arriba, título pequeño
         debajo, sin nada que los relacione visualmente -- "da toc" es
         justo esto: un emoji grande flotando encima de un texto que no
         comparte ni tamaño ni línea con él). Ahora van en la misma fila,
         centrados verticalmente entre sí, patrón normal de icono+título
         en una alerta. */
      .ps-modal-head{ display:flex; align-items:center; gap:10px; margin:0 0 8px; }
      .ps-modal-icon{ font-size:26px; line-height:1; flex-shrink:0; }
      /* v2.0.49: min-width:0 -- un <div> flex hijo, sin esto, no encoge por debajo de su
         ancho de contenido (min-width:auto por defecto), así que un título largo (p.ej.
         "Verificación automática del archivo: VÁLIDO", usado desde v2.0.49 en el diálogo
         de aplicar parche para que el icono quede en la misma fila que ese texto) se salía
         de .ps-modal-box en vez de envolver -- mismo tipo de bug que el del SHA-256 en
         .ps-modal-msg (v2.0.45). */
      .ps-modal-title{ font-size:14.5px; font-weight:700; margin:0; min-width:0; overflow-wrap:anywhere; }
      .ps-modal-msg{
        font-size:12.5px; line-height:1.55; color:var(--ink-soft,#93a3b5);
        white-space:pre-line;
        /* v2.0.45: bug real reportado por el usuario -- un SHA-256 (64
           caracteres seguidos, sin espacios ni guiones) se salía del
           cuadro del diálogo ("Aplicar parche" lo muestra dos veces: el
           prefijo del nombre y el hash completo). white-space:pre-line
           respeta saltos de línea pero NO parte una palabra sin espacios
           -- el navegador solo envuelve en espacios/guiones por defecto,
           así que una cadena así de larga desbordaba el ancho fijo de
           .ps-modal-box (max-width:440px) en vez de ajustarse dentro. */
        overflow-wrap: anywhere;
      }
      .ps-modal-btns{ display:flex; justify-content:flex-end; gap:8px; margin-top:18px; }
      .ps-modal-btn{
        font-family:var(--mono,'Consolas',monospace); font-size:11px; font-weight:600;
        border-radius:6px; padding:7px 14px; cursor:pointer;
        border:1px solid var(--border,#232e3a); background:var(--surface-2,#171f2a);
        color:var(--ink-soft,#93a3b5);
        transition:background-color .15s ease, border-color .15s ease, color .15s ease;
      }
      .ps-modal-btn:hover{ color:var(--ink,#eef2f6); border-color:var(--ink-faint,#546578); }
      .ps-modal-btn.ps-primary{
        background:var(--cyan-bg,#0f242b); border-color:var(--cyan-dim,#1e3540); color:var(--cyan,#4fc3d9);
      }
      .ps-modal-btn.ps-danger{
        background:var(--red-bg,#2b1418); border-color:#4a2229; color:var(--red-tx,#f08a97);
      }
      .ps-modal-btn:focus-visible{ outline:2px solid var(--cyan,#4fc3d9); outline-offset:1px; }
    `;
    document.head.appendChild(style);
  }

  function buildBase(message, title, icon) {
    ensureStyles();
    const backdrop = document.createElement('div');
    backdrop.className = 'ps-modal-backdrop';
    const box = document.createElement('div');
    box.className = 'ps-modal-box';
    backdrop.appendChild(box);
    // v2.0.34: icono opcional (emoji), a petición del usuario -- el diálogo
    // nativo de "Aplicar parche" llevaba un icono de check/aviso para
    // distinguir "válido"/"no válido" de un vistazo; se perdió al pasar a
    // este modal propio (Fase 5c, v2.0.32) porque este componente no tenía
    // hueco para uno. En vez de volver a un icono de imagen (PNG generado a
    // mano, como antes), un glifo de texto grande arriba del todo cubre el
    // mismo caso de uso sin reintroducir esa complejidad, y queda disponible
    // para cualquier otro diálogo que lo quiera (opts.icon).
    // v2.0.47: icono + título en una sola fila (ver .ps-modal-head arriba)
    // en vez de dos bloques apilados sin relación visual entre sí.
    if (icon || title) {
      const head = document.createElement('div');
      head.className = 'ps-modal-head';
      if (icon) {
        const ic = document.createElement('div');
        ic.className = 'ps-modal-icon';
        ic.textContent = icon;
        head.appendChild(ic);
      }
      if (title) {
        const h = document.createElement('div');
        h.className = 'ps-modal-title';
        h.textContent = title;
        head.appendChild(h);
      }
      box.appendChild(head);
    }
    const msg = document.createElement('div');
    msg.className = 'ps-modal-msg';
    msg.textContent = message;
    box.appendChild(msg);
    const row = document.createElement('div');
    row.className = 'ps-modal-btns';
    box.appendChild(row);
    document.body.appendChild(backdrop);
    return { backdrop, box, row };
  }

  function psConfirm(message, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const { backdrop, row } = buildBase(message, opts.title, opts.icon);
      let done = false;
      function finish(result) {
        if (done) return;
        done = true;
        document.removeEventListener('keydown', onKey);
        backdrop.remove();
        resolve(result);
      }
      function onKey(e) {
        if (e.key === 'Escape') finish(false);
      }
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'ps-modal-btn';
      cancelBtn.textContent = opts.cancelLabel || 'Cancelar';
      cancelBtn.addEventListener('click', () => finish(false));
      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.className = 'ps-modal-btn ' + (opts.danger ? 'ps-danger' : 'ps-primary');
      okBtn.textContent = opts.confirmLabel || 'Confirmar';
      okBtn.addEventListener('click', () => finish(true));
      row.appendChild(cancelBtn);
      row.appendChild(okBtn);
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) finish(false); });
      document.addEventListener('keydown', onKey);
      cancelBtn.focus();
    });
  }

  function psAlert(message, opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      const { backdrop, row } = buildBase(message, opts.title, opts.icon);
      let done = false;
      function finish() {
        if (done) return;
        done = true;
        document.removeEventListener('keydown', onKey);
        backdrop.remove();
        resolve();
      }
      function onKey(e) {
        if (e.key === 'Escape' || e.key === 'Enter') finish();
      }
      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.className = 'ps-modal-btn ' + (opts.danger ? 'ps-danger' : 'ps-primary');
      okBtn.textContent = opts.okLabel || 'Aceptar';
      okBtn.addEventListener('click', finish);
      row.appendChild(okBtn);
      backdrop.addEventListener('click', (e) => { if (e.target === backdrop) finish(); });
      document.addEventListener('keydown', onKey);
      okBtn.focus();
    });
  }

  window.psConfirm = psConfirm;
  window.psAlert = psAlert;
})();
