// ---------------------------------------------------------------------------
// P22 — CAMINOS DE RESERVA A LA CARPETA LOCAL (DIAGNÓSTICO).
//
// Envoltorio fino sobre `p9-ubicacion.js`, que se reutiliza TAL CUAL (mismo
// sandbox marcado, mismos bloqueos de procesos y de copias fuera del sandbox,
// mismas respuestas: PS-1005 -> «Abrir con datos locales», PS-1009 -> «Usar la
// carpeta de datos por defecto»).
//
// Lo único que añade: anota los avisos que main.js pinta DENTRO de una ventana
// (`modalAlert`/`modalConfirm` -> `webContents.executeJavaScript('window.psAlert(…)')`),
// que un diálogo nativo no captura. Solo guarda el tipo, el título y el código
// PS, nunca el texto. Salida: <sandbox>\avisos.json (una línea JSON por aviso).
// ---------------------------------------------------------------------------
const { app, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const tlog = (s) => { try { fs.appendFileSync(path.join(process.argv.find((x) => x.startsWith('--sandbox=')).slice(10), 'test.log'), `[${new Date().toISOString()}] ${s}\n`); } catch (e) {} };

const arg = (n) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : null; };
const SB = arg('sandbox');
if (!SB || !/_a33-p9-p22/i.test(SB)) { console.error('sandbox no marcado'); process.exit(2); }
const SALIDA = path.join(SB, 'avisos.json');

app.on('browser-window-created', (e, w) => {
  const wc = w.webContents;
  const original = wc.executeJavaScript.bind(wc);
  wc.executeJavaScript = (codigo, ...resto) => {
    const m = /^window\.ps(Alert|Confirm)\(/.exec(String(codigo));
    if (m) {
      const titulo = (/"title":"((?:[^"\\]|\\.)*)"/.exec(String(codigo)) || [])[1] || '';
      const ps = (/PS-\d{4}/.exec(String(codigo)) || [''])[0];
      let url = '';
      try { url = decodeURIComponent(wc.getURL()).replace(/^.*[\\/]([^\\/]+[\\/][^\\/]+)$/, '$1'); } catch (er) {}
      try { fs.appendFileSync(SALIDA, JSON.stringify({ t: new Date().toISOString(), tipo: m[1], titulo: JSON.parse('"' + titulo + '"'), ps, ventana: url }) + '\n', 'utf8'); } catch (er) {}
    }
    return original(codigo, ...resto);
  };
});

require('./p9-ubicacion.js');

// --- respuestas a los diálogos de P22 -------------------------------------------
// El arnés de P9 responde por título con una tabla fija. Aquí hace falta poder
// contestar también «Esc/la X» (= cancelId) y «Cerrar», así que se envuelve su
// stub: se le deja anotar el diálogo y después se devuelve LA ELECCIÓN pedida
// por P22_ELECCION. Los diálogos que no son de esta familia (por ejemplo el
// candado multi-PC) siguen contestándose como antes.
const ELECCION = (process.env.P22_ELECCION || 'local').toLowerCase();
const DE_P22 = /No se puede acceder a la carpeta de datos|No se encuentra la base de datos en esta carpeta|No se puede comprobar la base de datos configurada|Hay datos locales en este equipo|No hay ninguna carpeta de datos configurada|Usar los datos locales de este equipo|La base de datos local no es utilizable/i;
const indiceDe = (o, ...textos) => {
  for (const t of textos) { const i = (o.buttons || []).indexOf(t); if (i >= 0) return i; }
  return -1;
};
// En el modo «preparar» (el que crea la base de la tirada) manda el arnés de P9:
// si aquí se contestara «usar datos locales» al PS-1009, la base nunca se
// crearía. Primera pasada: pasó exactamente eso y la tirada abortó sin base.
const MODO = (process.argv.find((x) => x.startsWith('--modo=')) || '').slice(7);
const delP9 = dialog.showMessageBoxSync;
dialog.showMessageBoxSync = function (a, b) {
  const o = (b || a) || {};
  const suyo = delP9.call(this, a, b);
  if (MODO !== 'caso' || !DE_P22.test(String(o.title))) return suyo;
  let i;
  if (ELECCION === 'esc' || ELECCION === 'x') i = typeof o.cancelId === 'number' ? o.cancelId : 0;
  else if (ELECCION === 'cerrar') i = indiceDe(o, 'Cerrar');
  else if (ELECCION === 'crear') i = indiceDe(o, 'Crear una base de datos local vacía', 'Usar estos datos locales', 'Usar los datos locales de este equipo');
  else i = indiceDe(o, 'Usar estos datos locales', 'Usar los datos locales de este equipo', 'Crear una base de datos local vacía');
  if (i < 0) i = typeof o.cancelId === 'number' ? o.cancelId : 0;
  tlog(`P22 ${ELECCION} -> boton ${i} «${(o.buttons || [])[i]}» en «${o.title}»`);
  try { fs.appendFileSync(SALIDA, JSON.stringify({ t: new Date().toISOString(), tipo: 'nativo', titulo: o.title, ps: (/PS-\d{4}/.exec(String(o.detail || '')) || [''])[0], botones: o.buttons || [], cancelId: o.cancelId, defaultId: o.defaultId, elegido: (o.buttons || [])[i] }) + '\n', 'utf8'); } catch (e) {}
  return i;
};
