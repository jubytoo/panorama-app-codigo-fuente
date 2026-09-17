// ---------------------------------------------------------------------------
// F2 — LA CSP EN LA APP REAL: LAS 10 VENTANAS, SUS RECURSOS Y SUS FUNCIONES.
//
//   --modo=completo   abre las 10 ventanas por sus caminos reales y en cada
//                     una comprueba: política EFECTIVA (la que aplica
//                     Chromium, no la declarada), sin eval, recursos
//                     legítimos, funciones reales (exportaciones, lectura de
//                     actas con el Worker de pdf.js, recarga, F3) y, AL
//                     FINAL, que la red, los frames, los objects y los
//                     formularios quedan cortados.
//   --modo=viejo-a    arranca con el main.js ANTERIOR a F2 (instantánea real)
//                     y crea proyectos con datos: el «proyecto viejo».
//   --modo=viejo-b    arranca con el main.js actual sobre ese mismo sandbox.
//   --modo=rev-sin-csp / rev-eval / rev-worker-none
//                     reversiones: se arranca un main.js MUTADO (compilado
//                     como si fuera el del proyecto, sin tocar el producto) y
//                     se comprueba que la batería detecta el defecto.
//
// Red: SOLO un servidor en 127.0.0.1 que cuenta visitas. Sin Internet.
// Violaciones CSP: las que provocan las sondas se separan de las reales por
// FASE (se abre una fase de sondeo por ventana, al final). Una violación
// fuera de esa fase es un error real.
// ---------------------------------------------------------------------------
const electron = require('electron');
const { app, BrowserWindow, dialog } = electron;
const Module = require('module');
const path = require('path');
const fs = require('fs');
const http = require('http');
const zlib = require('zlib');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

// F3 — espía sobre shell.openExternal: nunca se abre nada de verdad.
const externas = [];
electron.shell.openExternal = function (url) { externas.push(String(url)); return Promise.resolve(); };

const arg = process.argv.find((a) => a.startsWith('--sandbox='));
if (!arg) { console.error('falta --sandbox='); process.exit(2); }
const SB = arg.slice('--sandbox='.length);
if (!/_a33-f2/i.test(SB)) { console.error('sandbox no marcado'); process.exit(2); }
const MODO = (process.argv.find((a) => a.startsWith('--modo=')) || '--modo=nada').slice(7);

app.setPath('appData', path.join(SB, 'Roaming'));
app.setPath('userData', path.join(SB, 'Roaming', 'panorama-app'));
const UD = path.join(SB, 'Roaming', 'panorama-app');
const PROJDIR = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const EXP = path.join(SB, 'exportaciones');
fs.mkdirSync(EXP, { recursive: true });

const ascii = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u00b7\u2014\u2013\u2192]/g, '-').replace(/\u2026/g, '...');
function tlog(s) { try { fs.appendFileSync(path.join(SB, 'test.log'), `[${new Date().toISOString()}] ${ascii(s)}\n`); } catch (e) {} }
function ok(n, c, extra) { tlog((c ? 'OK    ' : 'FALLO ') + n + (c ? '' : '  -- ' + (extra === undefined ? '' : extra))); }
function info(s) { tlog('      ' + s); }

dialog.showMessageBoxSync = function (a, b) { const o = (b || a) || {}; tlog('      DIALOGO: ' + o.title); return 0; };
dialog.showOpenDialogSync = function () { return null; };
// El «Guardar como» nativo de las exportaciones se sustituye por una ruta del
// sandbox: así la descarga se completa DE VERDAD y se puede mirar el archivo.
dialog.showSaveDialogSync = function (a, b) {
  const o = (b || a) || {};
  return path.join(EXP, path.basename(String(o.defaultPath || 'exportacion.bin')));
};

// --- servidor LOCAL que cuenta visitas --------------------------------------
const visitas = [];
const servidor = http.createServer((req, res) => {
  visitas.push(`${req.method} ${req.url}`);
  if (/\.png/.test(req.url)) { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(fs.readFileSync(path.join(PROJDIR, 'assets', 'icon-16.png'))); return; }
  res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
  res.end('x');
});
servidor.on('upgrade', (req, sock) => { visitas.push(`UPGRADE ${req.url}`); sock.destroy(); });
let H = ''; let WS = '';

// --- registro de TODAS las ventanas, desde antes de cargar main.js ----------
const registro = new Map(); // wc.id -> ficha
let faseActual = 'arranque';
app.on('browser-window-created', (e, w) => {
  const wc = w.webContents;
  const ficha = { id: wc.id, w, wc, fase: faseActual, consola: [], urls: [], sondeando: false, alCargar: null, creada: Date.now() };
  registro.set(wc.id, ficha);
  wc.on('console-message', (ev, level, message) => {
    const m = String(message);
    ficha.consola.push({ m, sonda: ficha.sondeando, t: Date.now() });
  });
  wc.on('did-finish-load', () => {
    let url = '';
    try { url = wc.getURL(); } catch (x) {}
    ficha.urls.push(url);
    // Comprobación SÍNCRONA al cargar: vale también para las ventanas ocultas
    // que main.js cierra en cuanto termina su script (restore-helper).
    wc.executeJavaScript("(function(){var r={metas:document.querySelectorAll('meta[http-equiv]').length};"
      + "try{new Function('return 1')();r.evalua='permitido'}catch(e){r.evalua='bloqueado:'+e.name}"
      + "try{localStorage.setItem('__f2','1');r.almacen=localStorage.getItem('__f2')==='1';localStorage.removeItem('__f2')}catch(e){r.almacen='error:'+e.name}"
      + "return JSON.stringify(r)})()")
      .then((s) => { ficha.alCargar = Object.assign(JSON.parse(s), { url }); })
      .catch((err) => { ficha.alCargar = { error: String(err.message).slice(0, 60), url }; });
  });
});

// Cabecera DECLARADA por main.js, por URL (instrumentación: se envuelve el
// oyente que main.js instala, sin cambiar lo que devuelve).
const declaradas = [];
app.on('session-created', (ses) => {
  const wr = ses.webRequest;
  const original = wr.onHeadersReceived.bind(wr);
  wr.onHeadersReceived = function (...args) {
    const oyente = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
    if (!oyente) return original(...args);
    const envuelto = (detalles, responder) => oyente(detalles, (r) => {
      try {
        if (/^file:/i.test(detalles.url) && r && r.responseHeaders) {
          declaradas.push({ url: decodeURIComponent(detalles.url), tipo: detalles.resourceType, csp: (r.responseHeaders['Content-Security-Policy'] || [])[0] || null });
        }
      } catch (x) {}
      responder(r);
    });
    return original(...args.slice(0, -1), envuelto);
  };
});

// --- carga de main.js: el real, o una fuente alternativa COMPILADA COMO SI
// FUERA el main.js del proyecto (sus require relativos resuelven igual) ------
function cargarMain() {
  const destino = path.join(PROJDIR, 'main.js');
  const fuente = process.env.F2_MAIN_FUENTE;
  if (!fuente) return require(destino);
  tlog('      main.js ALTERNATIVO: ' + path.basename(fuente));
  const m = new Module(destino, module);
  m.filename = destino;
  m.paths = Module._nodeModulePaths(PROJDIR);
  require.cache[destino] = m;
  m._compile(fs.readFileSync(fuente, 'utf8').replace(/^\uFEFF/, ''), destino);
  m.loaded = true;
  return m.exports;
}
cargarMain();
const dbmod = require(path.join(PROJDIR, 'db.js'));

// --- utilidades ---------------------------------------------------------------
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const vivas = () => BrowserWindow.getAllWindows().filter((x) => !x.isDestroyed());
const urlDe = (w) => { try { return decodeURIComponent(w.webContents.getURL()); } catch (e) { return ''; } };
async function esperarVentana(frag, tope = 30000, excluir) {
  const t0 = Date.now();
  for (;;) {
    const w = vivas().find((x) => urlDe(x).includes(frag) && (!excluir || !excluir.has(x.id)));
    if (w) return w;
    if (Date.now() - t0 > tope) return null;
    await esperar(250);
  }
}
const ids = () => new Set(vivas().map((x) => x.id));
// Ninguna espera del arnés puede colgarlo: primera pasada, la exportación a
// PowerPoint no resolvió nunca y el modo acabó en TIMEOUT sin diagnóstico.
const conTope = (p, ms, etiqueta) => Promise.race([p, esperar(ms).then(() => `TOPE ${etiqueta} (${ms} ms)`)]);
// Cerrar una ventana con SU PROPIO control: la promesa de executeJavaScript no
// se resuelve si la ventana muere mientras tanto (segunda pasada: colgado).
async function cerrarDesdeDentro(w, codigo) {
  await conTope(js(w, codigo).catch(() => {}), 3000, 'cierre');
  const t0 = Date.now();
  while (!w.isDestroyed() && Date.now() - t0 < 5000) await esperar(200);
  return w.isDestroyed();
}
const fichaDe = (w) => registro.get(w.webContents.id);
const js = (w, code) => w.webContents.executeJavaScript(code);

const PERFIL = {};
function cargarPerfilesEsperados() {
  // Las políticas esperadas se leen del main.js QUE SE HA CARGADO, para no
  // copiar aquí los textos: la batería estática ya fija su contenido exacto.
  const fuente = fs.readFileSync(process.env.F2_MAIN_FUENTE || path.join(PROJDIR, 'main.js'), 'utf8');
  const ini = fuente.indexOf('const CSP_SIN_RED_NI_INCRUSTADOS');
  const fin = fuente.indexOf('function perfilCspDeDocumento');
  if (ini < 0 || fin < 0) return;
  const f = new Function(fuente.slice(ini, fin) + '\nreturn CSP_PERFILES;');
  Object.assign(PERFIL, f());
}

const SONDA_POLITICA = `new Promise(function(res){
  var hecho = false, evalua = null;
  var fuera = setTimeout(function(){ fin(null, null); }, 1500);
  function fin(p, d){ if (hecho) return; hecho = true; clearTimeout(fuera);
    document.removeEventListener('securitypolicyviolation', oy, true);
    res(JSON.stringify({politica: p, disposicion: d, evalua: evalua, metas: document.querySelectorAll('meta[http-equiv]').length})); }
  function oy(e){ if (e.blockedURI === 'eval') fin(e.originalPolicy, e.disposition); }
  document.addEventListener('securitypolicyviolation', oy, true);
  try { new Function('return 1')(); evalua = 'permitido'; } catch (e) { evalua = 'bloqueado:' + e.name; }
  if (evalua === 'permitido') fin(null, null);
})`;

async function politicaEfectiva(w) {
  const f = fichaDe(w);
  if (f) f.sondeando = true;
  const r = await js(w, SONDA_POLITICA).then(JSON.parse).catch((e) => ({ error: e.message }));
  if (f) f.sondeando = false;
  return r;
}

const SONDA_RECURSOS = `(async function(){
  var r = {};
  var imgs = Array.prototype.filter.call(document.images, function(i){ return i.getAttribute('src'); });
  r.imagenes = imgs.length;
  r.imagenesRotas = imgs.filter(function(i){ return i.complete && i.naturalWidth === 0; }).map(function(i){ return (i.getAttribute('src')||'').slice(0,50); });
  r.hojas = Array.prototype.map.call(document.querySelectorAll('link[rel=stylesheet]'), function(l){
    var n = -1; try { n = l.sheet ? l.sheet.cssRules.length : -1; } catch(e) { n = -2; }
    return (l.getAttribute('href')||'').split('/').pop() + ':' + n; });
  r.hojasVacias = r.hojas.filter(function(h){ return !(+h.split(':').pop() > 0); });
  r.globales = { THEMES: (function(){try{return typeof THEMES}catch(e){return 'undefined'}})(),
    psConfirm: typeof window.psConfirm, XLSX: typeof window.XLSX, PptxGenJS: typeof window.PptxGenJS,
    PanoramaServiceStatus: typeof window.PanoramaServiceStatus };
  var conFuentes = !!document.querySelector('link[href$="fonts.css"]');
  r.conFuentes = conFuentes;
  if (conFuentes) {
    try { await document.fonts.load('16px Inter'); await document.fonts.load('16px "JetBrains Mono"'); } catch(e) {}
    try { await document.fonts.ready; } catch(e) {}
    r.fuentesCargadas = Array.from(document.fonts).filter(function(f){ return f.status === 'loaded'; }).map(function(f){ return f.family.replace(/["']/g,'') + '-' + f.weight; });
    r.fuentesError = Array.from(document.fonts).filter(function(f){ return f.status === 'error'; }).length;
  }
  return JSON.stringify(r);
})()`;

// Sonda de red/incrustados. Todo apunta al servidor local con la marca sonda-f2.
const sondaCorte = () => `(async function(){
  var r = {};
  try { await fetch('${H}/sonda-f2/fetch'); r.fetch='permitido'; } catch(e) { r.fetch='bloqueado'; }
  try { await fetch('${H.replace('http:', 'https:')}/sonda-f2/fetch-https'); r.fetchHttps='permitido'; } catch(e) { r.fetchHttps='fallo'; }
  r.xhr = await new Promise(function(res){ try{ var x=new XMLHttpRequest(); x.open('GET','${H}/sonda-f2/xhr'); x.onload=function(){res('permitido')}; x.onerror=function(){res('bloqueado')}; x.send(); }catch(e){ res('bloqueado') } });
  r.ws = await new Promise(function(res){ try{ var s=new WebSocket('${WS}/sonda-f2/ws'); s.onopen=function(){res('abierto')}; s.onerror=function(){res('error')}; setTimeout(function(){res('timeout')},1500);}catch(e){ res('bloqueado') } });
  r.img = await new Promise(function(res){ var i=new Image(); i.onload=function(){res('cargada')}; i.onerror=function(){res('bloqueada')}; i.src='${H}/sonda-f2/img.png'; setTimeout(function(){res('timeout')},1500); });
  r.css = await new Promise(function(res){ var l=document.createElement('link'); l.rel='stylesheet'; l.href='${H}/sonda-f2/hoja.css'; l.onload=function(){res('cargada')}; l.onerror=function(){res('bloqueada')}; document.head.appendChild(l); setTimeout(function(){res('timeout')},1500); });
  r.script = await new Promise(function(res){ var s=document.createElement('script'); s.src='${H}/sonda-f2/remoto.js'; s.onload=function(){res('cargado')}; s.onerror=function(){res('bloqueado')}; document.head.appendChild(s); setTimeout(function(){res('timeout')},1500); });
  try { var ff = new FontFace('RemotaF2', 'url(${H}/sonda-f2/fuente.woff2)'); await ff.load(); r.fuente='cargada'; } catch(e){ r.fuente='fallo'; }
  var fr=document.createElement('iframe'); fr.src='${H}/sonda-f2/frame'; fr.style.display='none'; document.body.appendChild(fr);
  var ob=document.createElement('object'); ob.data='${H}/sonda-f2/objeto'; document.body.appendChild(ob);
  var b=document.createElement('base'); b.href='${H}/sonda-f2/'; document.head.appendChild(b);
  r.base = document.baseURI.indexOf('sonda-f2') < 0 ? 'ignorada' : 'aplicada';
  b.remove();
  var fm=document.createElement('form'); fm.method='post'; fm.action='${H}/sonda-f2/form'; fm.style.display='none'; document.body.appendChild(fm);
  try { fm.submit(); } catch(e) {}
  await new Promise(function(x){ setTimeout(x, 900); });
  fr.remove(); ob.remove(); fm.remove();
  return JSON.stringify(r);
})()`;

async function sondearCorte(w, nombre, { conSubrecursos = true } = {}) {
  const f = fichaDe(w);
  const v0 = visitas.length; const e0 = externas.length;
  const n0 = f.consola.length;
  f.sondeando = true;
  const r = await js(w, sondaCorte()).then(JSON.parse).catch((e) => ({ error: e.message }));
  await esperar(700);
  f.sondeando = false;
  const nuevas = visitas.slice(v0);
  const viol = f.consola.slice(n0).filter((x) => /Content Security Policy/i.test(x.m)).map((x) => x.m);
  const hay = (re) => viol.some((m) => re.test(m));
  info(`${nombre} corte: ${JSON.stringify(r)} | visitas=${JSON.stringify(nuevas)} | violaciones=${viol.length}`);
  ok(`F2-11 ${nombre}: fetch http/https, XHR y WebSocket NO llegan al servidor local`,
    !r.error && r.fetch === 'bloqueado' && r.xhr === 'bloqueado' && !nuevas.some((x) => /fetch|xhr|ws/.test(x)), JSON.stringify({ r, nuevas }));
  if (conSubrecursos) {
    ok(`F2-12 ${nombre}: imagen, hoja, script y fuente remotos BLOQUEADOS`,
      r.img === 'bloqueada' && r.css === 'bloqueada' && r.script === 'bloqueado' && r.fuente === 'fallo'
      && !nuevas.some((x) => /img|hoja|remoto|fuente/.test(x)), JSON.stringify({ r, nuevas }));
  }
  ok(`F2-13 ${nombre}: frame, object y formulario BLOQUEADOS; <base> ignorada`,
    hay(/frame/i) && hay(/plugin|object-src/i) && hay(/form data|form-action/i) && r.base === 'ignorada'
    && !nuevas.some((x) => /frame|objeto|form/.test(x)), JSON.stringify({ base: r.base, viol: viol.map((m) => m.slice(0, 50)) }));
  ok(`F2-11b ${nombre}: CERO visitas al servidor local en total, y el sondeo no manda nada al navegador`,
    nuevas.length === 0 && externas.length === e0, JSON.stringify({ nuevas, ext: externas.slice(e0) }));
  return { r, nuevas };
}

function violacionesReales(w) {
  const f = fichaDe(w);
  return f ? f.consola.filter((x) => !x.sonda && /Content Security Policy/i.test(x.m)).map((x) => x.m.slice(0, 140)) : ['(sin ficha)'];
}
function avisosElectronCsp(w) {
  const f = fichaDe(w);
  return f ? f.consola.filter((x) => /Insecure Content-Security-Policy/i.test(x.m)).length : -1;
}

async function comprobarPolitica(w, nombre, perfil) {
  const r = await politicaEfectiva(w);
  const esperada = PERFIL[perfil];
  info(`${nombre} politica efectiva: ${JSON.stringify(r)}`);
  ok(`F2-1 ${nombre}: CSP EFECTIVA = perfil «${perfil}» (leida de la violacion que aplica Chromium, disposicion enforce)`,
    !!esperada && r.politica === esperada && r.disposicion === 'enforce', `${r.politica} | ${r.disposicion}`);
  ok(`F2-2 ${nombre}: sin unsafe-eval — new Function BLOQUEADO`, /^bloqueado:EvalError/.test(String(r.evalua)) && !/unsafe-eval/.test(String(r.politica)), String(r.evalua));
  ok(`F2-1b ${nombre}: la politica llega por CABECERA (ningun <meta http-equiv> en el documento)`, r.metas === 0, String(r.metas));
  return r;
}

async function comprobarRecursos(w, nombre, esperado) {
  const r = await js(w, SONDA_RECURSOS).then(JSON.parse).catch((e) => ({ error: e.message }));
  info(`${nombre} recursos: ${JSON.stringify(r)}`);
  const g = r.globales || {};
  const faltanGlobales = Object.keys(esperado.globales || {}).filter((k) => g[k] !== esperado.globales[k]);
  ok(`F2-3 ${nombre}: los scripts legitimos cargan (${Object.keys(esperado.globales || {}).join(', ') || 'propios'})`,
    !r.error && faltanGlobales.length === 0 && (!esperado.dom || true), JSON.stringify({ faltanGlobales, g }));
  ok(`F2-4 ${nombre}: las hojas de estilo legitimas cargan con reglas (${(r.hojas || []).length})`,
    !r.error && (r.hojas || []).length >= (esperado.hojas || 0) && (r.hojasVacias || []).length === 0, JSON.stringify(r.hojas));
  ok(`F2-5 ${nombre}: las imagenes legitimas cargan (${r.imagenes || 0}, ninguna rota)`,
    !r.error && (r.imagenes || 0) >= (esperado.imagenes || 0) && (r.imagenesRotas || []).length === 0, JSON.stringify(r.imagenesRotas));
  if (esperado.fuentes) {
    ok(`F2-6 ${nombre}: las fuentes locales cargan (Inter y JetBrains Mono) y ninguna falla`,
      r.conFuentes && (r.fuentesCargadas || []).some((x) => /^Inter/.test(x)) && (r.fuentesCargadas || []).some((x) => /JetBrains/.test(x)) && r.fuentesError === 0,
      JSON.stringify({ c: r.fuentesCargadas, e: r.fuentesError }));
  }
  return r;
}

function sinViolaciones(w, nombre, momento) {
  const v = violacionesReales(w);
  ok(`F2-0 ${nombre}: CERO violaciones CSP fuera del sondeo (${momento})`, v.length === 0, JSON.stringify(v.slice(0, 4)));
  ok(`F2-2b ${nombre}: Electron no avisa de CSP insegura`, avisosElectronCsp(w) === 0, String(avisosElectronCsp(w)));
}

async function esperarArchivo(prefijoRe, tope = 20000) {
  const t0 = Date.now();
  let previo = -1;
  for (;;) {
    const f = fs.readdirSync(EXP).find((n) => prefijoRe.test(n));
    if (f) {
      const t = fs.statSync(path.join(EXP, f)).size;
      if (t > 0 && t === previo) return { nombre: f, bytes: fs.readFileSync(path.join(EXP, f)) };
      previo = t;
    }
    if (Date.now() - t0 > tope) return null;
    await esperar(400);
  }
}

// --- material real: .pdf y .docx mínimos --------------------------------------
function pdfMinimo(texto) {
  const obj = [];
  obj[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  obj[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  obj[3] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>';
  const flujo = `BT /F1 12 Tf 20 100 Td (${texto}) Tj ET`;
  obj[4] = `<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`;
  obj[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  let pdf = '%PDF-1.4\n'; const pos = [];
  for (let i = 1; i <= 5; i++) { pos[i] = pdf.length; pdf += `${i} 0 obj\n${obj[i]}\nendobj\n`; }
  const x = pdf.length;
  pdf += 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) pdf += String(pos[i]).padStart(10, '0') + ' 00000 n \n';
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}
function zip(entradas) {
  const locales = []; const centrales = []; let desp = 0;
  for (const [nombre, contenido] of entradas) {
    const datos = Buffer.from(contenido, 'utf8'); const nom = Buffer.from(nombre, 'utf8');
    const crc = zlib.crc32(datos);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(datos.length, 18); lh.writeUInt32LE(datos.length, 22); lh.writeUInt16LE(nom.length, 26);
    locales.push(lh, nom, datos);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(datos.length, 20); ch.writeUInt32LE(datos.length, 24);
    ch.writeUInt16LE(nom.length, 28); ch.writeUInt32LE(desp, 42);
    centrales.push(ch, nom);
    desp += lh.length + nom.length + datos.length;
  }
  const cuerpo = Buffer.concat(locales); const central = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(entradas.length, 8); fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(central.length, 12); fin.writeUInt32LE(cuerpo.length, 16);
  return Buffer.concat([cuerpo, central, fin]);
}
function docxMinimo(texto) {
  return zip([
    ['[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${texto}</w:t></w:r></w:p></w:body></w:document>`],
  ]);
}
const archivoEnPagina = (buf, nombre) => `(function(){var s=atob(${JSON.stringify(buf.toString('base64'))});var u=new Uint8Array(s.length);`
  + `for(var i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return new File([u], ${JSON.stringify(nombre)});})()`;

// Instrumentación del Worker ANTES de la primera lectura de un PDF.
const INSTRUMENTAR_WORKER = `(function(){ if (window.__f2w) return 'ya';
  window.__f2w = []; var W = window.Worker;
  window.Worker = function(url, o){ var reg = {esquema: String(url).split(':')[0], lanzo: null, error: false};
    window.__f2w.push(reg);
    try { var w = new W(url, o); w.addEventListener('error', function(){ reg.error = true; }); return w; }
    catch (e) { reg.lanzo = e.name; throw e; } };
  window.Worker.prototype = W.prototype; return 'ok'; })()`;

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
function estadoConDatos(titulo, marca) {
  return {
    projectTitle: titulo, serviceStart: '2026-01-01', serviceEnd: '2026-12-31',
    skillMatrixRoles: ['Rol 1', 'Rol 2'], phases: [],
    milestones: [{ id: 'm1', label: marca, date: '2026-09-20', actualDate: null, recurrente: false, descripcion: 'Hito de prueba F2', entregables: [] }],
    risks: [{ id: 'R-01', title: 'Riesgo F2', category: 'Contractual', p: 3, i: 3, mitigacion: 'm', contingencia: 'c',
      respMitigacion: '', respContingencia: '', status: 'abierto', fechaDeteccion: '2026-09-05', fechaMaterializacion: null,
      fechaCierre: null, obsMaterializacion: '', respMaterializacion: '', obsCierre: '', respCierre: '' }],
    skills: [{ id: 's1', group: 'Grupo F2', name: 'Skill F2', levels: [2, 3], pending: false }],
    team: [{ id: 't1', alias: 'Persona F2', role: 'Analista', date: '2026-09-10', dateDisplay: '10/09/2026', status: 'activo', dni: '', email: '', telefono: '' }],
    coverage: [], corporateLogo: PNG, railWindow: null, enProrroga: false, prorrogaDesde: null, prorrogaEstimada: null,
  };
}

// ===========================================================================
app.whenReady().then(async () => {
  if (MODO === 'nada') return;
  try {
    await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
    H = `http://127.0.0.1:${servidor.address().port}`;
    WS = `ws://127.0.0.1:${servidor.address().port}`;
    cargarPerfilesEsperados();
    info('perfiles cargados: ' + Object.keys(PERFIL).join(', '));
    const lanzador = await esperarVentana('launcher/index.html');
    if (!lanzador) { tlog('ERROR: no aparecio el lanzador'); app.exit(3); return; }
    await esperar(1800);

    // =======================================================================
    if (MODO === 'completo') {
      tlog('--- F2: LAS 10 VENTANAS, UNA POR UNA ---');

      // (2) SPLASH — ya ha pasado; se mira lo que se midió al cargarse.
      const fSplash = [...registro.values()].find((f) => f.urls.some((u) => /launcher\/splash\.html$/.test(u)));
      ok('F2-V splash: se creo y cargo', !!fSplash, '');
      if (fSplash) {
        info('splash al cargar: ' + JSON.stringify(fSplash.alCargar));
        ok('F2-1 splash: CSP efectiva (eval bloqueado al cargar)', fSplash.alCargar && /^bloqueado:EvalError/.test(fSplash.alCargar.evalua), JSON.stringify(fSplash.alCargar));
        const dS = declaradas.filter((d) => /launcher\/splash\.html$/.test(d.url.replace(/\\/g, '/')));
        ok('F2-1 splash: la cabecera declarada es el perfil «sinScriptEnLinea»', dS.length >= 1 && dS.every((d) => d.csp === PERFIL.sinScriptEnLinea), JSON.stringify(dS.map((d) => d.csp)));
        const vS = fSplash.consola.filter((x) => /Content Security Policy/i.test(x.m));
        ok('F2-0 splash: CERO violaciones CSP (su icono y su estilo en linea cargan)', vS.length === 0, JSON.stringify(vS.map((x) => x.m.slice(0, 100))));
        ok('F2-2b splash: Electron no avisa de CSP insegura', fSplash.consola.filter((x) => /Insecure Content-Security-Policy/i.test(x.m)).length === 0, '');
      }

      // (1) LANZADOR
      faseActual = 'lanzador';
      await comprobarPolitica(lanzador, 'lanzador', 'sinScriptEnLinea');
      await comprobarRecursos(lanzador, 'lanzador', { globales: { THEMES: 'object', psConfirm: 'function' }, hojas: 1, imagenes: 1 });
      const ctrl = await js(lanzador, "(async function(){await refresh(); setView('timeline'); setView('cards'); await openThemeModal();"
        + "var n=document.querySelectorAll('#theme-swatch-grid button').length; closeThemeModal(); openNewProjectModal();"
        + "var m=document.getElementById('modal-backdrop'); var abierto=!!m && m.classList.contains('open');"
        + "var g=new Image(); g.src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7';"
        + "await new Promise(function(r){g.onload=r;g.onerror=r;setTimeout(r,800)});"
        + "return JSON.stringify({muestrasTema:n, modal:abierto, fantasmaData:g.naturalWidth})})()").then(JSON.parse).catch((e) => ({ error: e.message }));
      info('lanzador controles: ' + JSON.stringify(ctrl));
      ok('F2-3 lanzador: sus controles funcionan SIN unsafe-inline (vistas, panel de tema con estilos en linea, modal)', !ctrl.error && ctrl.muestrasTema >= 5 && ctrl.modal === true, JSON.stringify(ctrl));
      ok('F2-5 lanzador: la imagen data: (fantasma de arrastre) carga', ctrl.fantasmaData === 1, JSON.stringify(ctrl));
      await js(lanzador, "(function(){document.getElementById('modal-backdrop').classList.remove('open');return 1})()").catch(() => {});
      sinViolaciones(lanzador, 'lanzador', 'carga y controles');

      // (3)+(6) PROYECTO NUEVO con importación: siembra por la ventana oculta
      faseActual = 'crear-con-importacion';
      const MARCA = 'HITO-F2-' + crypto.randomBytes(3).toString('hex').toUpperCase();
      const row = await js(lanzador, `window.launcherAPI.createProject('ignorado','','',${JSON.stringify(JSON.stringify({ state: estadoConDatos('Servicio F2', MARCA), history: [] }))})`);
      const PID = row.id;
      ok('F2-15 un proyecto NUEVO se crea (con importacion)', !!PID && row.name === 'Servicio F2', JSON.stringify(row));
      await esperar(800);
      const volcado = [...registro.values()].filter((f) => f.fase === 'crear-con-importacion' && f.urls.some((u) => /restore-helper\.html$/.test(u)));
      info('volcado-localstorage: ' + JSON.stringify(volcado.map((f) => f.alCargar)));
      ok('F2-V volcado-localstorage: la ventana oculta se creo y cargo restore-helper', volcado.length === 1, String(volcado.length));
      ok('F2-1 volcado-localstorage: CSP efectiva (eval bloqueado) y localStorage accesible',
        volcado.length === 1 && /^bloqueado:EvalError/.test(volcado[0].alCargar && volcado[0].alCargar.evalua) && volcado[0].alCargar.almacen === true, JSON.stringify(volcado.map((f) => f.alCargar)));
      const dH = declaradas.filter((d) => /restore-helper\.html$/.test(d.url));
      ok('F2-1 volcado-localstorage: cabecera declarada = perfil «cerrado»', dH.length >= 1 && dH.every((d) => d.csp === PERFIL.cerrado), JSON.stringify(dH.map((d) => d.csp)));
      ok('F2-0 volcado-localstorage: CERO violaciones CSP', volcado.every((f) => !f.consola.some((x) => /Content Security Policy/i.test(x.m))), '');

      // (3) DASHBOARD
      faseActual = 'dashboard';
      await js(lanzador, 'refresh()').catch(() => {});
      await js(lanzador, `window.launcherAPI.openProject(${PID})`);
      let v = await esperarVentana(`projects/${PID}/dashboard.html`);
      ok('F2-V dashboard: abre', !!v);
      await esperar(3500);
      await comprobarPolitica(v, 'dashboard', 'interfaz');
      await comprobarRecursos(v, 'dashboard', { globales: { THEMES: 'object', psConfirm: 'function', XLSX: 'object', PptxGenJS: 'function', PanoramaServiceStatus: 'object' }, hojas: 3, imagenes: 2, fuentes: true });
      const dash = await js(v, `(function(){var s=document.getElementById('header-logo-banner');var im=s?s.querySelector('img'):null;
        var b=document.querySelector('[data-toggle-ms-detail]'); if(b) b.click(); render();
        return JSON.stringify({logo: im ? im.naturalWidth : null, logoData: im ? im.src.slice(0,10) : null,
          hito: document.body.innerText.indexOf(${JSON.stringify(MARCA)}) >= 0, hitos: !!document.getElementById('milestone-list')})})()`).then(JSON.parse).catch((e) => ({ error: e.message }));
      info('dashboard: ' + JSON.stringify(dash));
      ok('F2-5 dashboard: el LOGO corporativo (data:) se pinta', dash.logo === 1 && dash.logoData === 'data:image', JSON.stringify(dash));
      ok('F2-15 dashboard: los datos importados se ven y los controles responden', dash.hito === true && dash.hitos === true, JSON.stringify(dash));

      // Exportaciones reales: CSV, Excel y PowerPoint (con el logo data:).
      await js(v, "exportBlockCSV('milestones'); 1");
      const csv = await esperarArchivo(/_milestones_.*\.csv$/);
      ok('F2-10 dashboard: exportar CSV (blob:) escribe el archivo', !!csv && csv.bytes.toString('utf8').includes(MARCA), csv ? csv.nombre : 'sin archivo');
      await js(v, "exportBlockXLSX('milestones'); 1");
      const xlsx = await esperarArchivo(/_milestones_.*\.xlsx$/);
      ok('F2-10 dashboard: exportar Excel (SheetJS + blob:) escribe un .xlsx real', !!xlsx && xlsx.bytes.slice(0, 2).toString() === 'PK' && xlsx.bytes.length > 1000, xlsx ? `${xlsx.nombre} ${xlsx.bytes.length}` : 'sin archivo');
      // pptxgen no termina con la ventana oculta (modo `pptx`, igual sin F2):
      // se muestra la ventana antes, como la tendría el usuario.
      try { v.restore(); v.show(); v.focus(); } catch (e) {}
      await esperar(1000);
      const rp = await conTope(js(v, 'exportExecutivePPTX(null).then(function(){return 1})'), 40000, 'pptx');
      info('exportExecutivePPTX: ' + rp);
      const pptx = await esperarArchivo(/informe_ejecutivo.*\.pptx$/, 10000);
      ok('F2-10 dashboard: el informe PowerPoint (pptxgen + logo data: + blob:) escribe un .pptx real', !!pptx && pptx.bytes.slice(0, 2).toString() === 'PK' && pptx.bytes.length > 5000, pptx ? `${pptx.nombre} ${pptx.bytes.length}` : 'sin archivo');
      const fb = await js(v, "(function(){var e=document.getElementById('io-feedback');return e?e.innerText.slice(0,120):''})()").catch(() => '');
      info('feedback tras exportar: ' + fb);
      sinViolaciones(v, 'dashboard', 'carga, controles y 3 exportaciones');

      // Backup real (para el selector y la restauración de después).
      const g = await js(v, "(function(){var d={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);d[k]=localStorage.getItem(k);}"
        + "return window.panoramaBridge.saveBackup(JSON.stringify(d),'manual');})()").catch((e) => ({ error: e.message }));
      ok('F2-V dashboard: guardar un backup funciona', g && g.aplicado === true, JSON.stringify(g));

      // Recarga (F3 la permite) — la política sigue ahí después.
      await js(v, 'location.reload()').catch(() => {});
      await esperar(3500);
      const trasRecarga = await js(v, "JSON.stringify({hitos: !!document.getElementById('milestone-list')})").then(JSON.parse).catch((e) => ({ error: e.message }));
      ok('F2-V dashboard: location.reload() sigue funcionando', trasRecarga.hitos === true, JSON.stringify(trasRecarga));
      await comprobarPolitica(v, 'dashboard (tras recargar)', 'interfaz');
      sinViolaciones(v, 'dashboard', 'tras recargar');

      // F3 sigue funcionando.
      const antesV = ids(); const e0 = externas.length;
      await js(v, "window.open('https://ejemplo.test/f2','_blank'); window.open('about:blank'); 1").catch(() => {});
      await esperar(1500);
      const nuevasV = vivas().filter((x) => !antesV.has(x.id));
      ok('F2-F3 F3 intacto: window.open no crea ventanas y http(s) sale UNA vez al navegador del sistema',
        nuevasV.length === 0 && externas.length === e0 + 1 && externas[e0] === 'https://ejemplo.test/f2', JSON.stringify({ n: nuevasV.length, ext: externas.slice(e0) }));

      // (4) PREPARACIÓN — lector de actas
      faseActual = 'preparacion';
      let prev = ids();
      await js(v, "window.panoramaBridge.projectMenuAction('proyecto-prep-reunion')").catch(() => {});
      const vp = await esperarVentana('preparacion_reunion', 20000, prev);
      ok('F2-V preparacion: abre', !!vp);
      if (vp) {
        await esperar(2500);
        await comprobarPolitica(vp, 'preparacion', 'lectorDeActas');
        await comprobarRecursos(vp, 'preparacion', { globales: { THEMES: 'object', psConfirm: 'function' }, hojas: 3, imagenes: 1, fuentes: true });
        await js(vp, INSTRUMENTAR_WORKER);
        const MD = 'ACTA DOCX F2 acuerdo pendiente de revisar con el cliente.';
        const MP = 'ACTA PDF F2 acuerdo pendiente';
        const rDocx = await js(vp, `(async function(){await handleActaFile(${archivoEnPagina(docxMinimo(MD), 'acta.docx')});`
          + 'return JSON.stringify({estado: state.actaStatus, error: state.actaError, texto: state.actaText.slice(0,80), mammoth: typeof window.mammoth})})()').then(JSON.parse).catch((e) => ({ error: e.message }));
        info('preparacion docx: ' + JSON.stringify(rDocx));
        ok('F2-8 preparacion: mammoth lee un .docx REAL por el camino del producto (handleActaFile)', rDocx.estado === 'ok' && rDocx.texto.includes('ACTA DOCX F2'), JSON.stringify(rDocx));
        const rPdf = await js(vp, `(async function(){await handleActaFile(${archivoEnPagina(pdfMinimo(MP), 'acta.pdf')});`
          + 'var wp = window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions.workerPort;'
          + 'return JSON.stringify({estado: state.actaStatus, error: state.actaError, texto: state.actaText.slice(0,80),'
          + ' puerto: !!wp && (wp instanceof Worker), intentos: window.__f2w})})()').then(JSON.parse).catch((e) => ({ error: e.message }));
        const fp = fichaDe(vp);
        const fake = fp.consola.filter((x) => /fake worker/i.test(x.m)).length;
        info('preparacion pdf: ' + JSON.stringify(rPdf) + ' avisosFake=' + fake);
        ok('F2-7 preparacion: pdf.js lee un .pdf REAL por el camino del producto', rPdf.estado === 'ok' && rPdf.texto.includes('ACTA PDF F2'), JSON.stringify(rPdf));
        ok('F2-9 preparacion: el Worker de pdf.js es REAL, arrancado desde blob:, sin errores y SIN caer al fake worker',
          rPdf.puerto === true && Array.isArray(rPdf.intentos) && rPdf.intentos.length === 1 && rPdf.intentos[0].esquema === 'blob'
          && !rPdf.intentos[0].lanzo && !rPdf.intentos[0].error && fake === 0, JSON.stringify({ rPdf, fake }));
        // Segunda lectura: reutiliza el mismo Worker.
        const rPdf2 = await js(vp, `(async function(){await handleActaFile(${archivoEnPagina(pdfMinimo('SEGUNDA ACTA F2 acuerdo'), 'acta2.pdf')});`
          + 'return JSON.stringify({estado: state.actaStatus, texto: state.actaText.slice(0,40), intentos: window.__f2w.length})})()').then(JSON.parse).catch((e) => ({ error: e.message }));
        ok('F2-9b preparacion: una segunda acta se lee con el MISMO Worker (no se crea otro)', rPdf2.estado === 'ok' && /SEGUNDA/.test(rPdf2.texto) && rPdf2.intentos === 1, JSON.stringify(rPdf2));
        // Descarga del guion.
        await js(vp, "(function(){state.step = STEP_KEYS.length - 1; render(); var b=document.getElementById('btn-download'); if(b) b.click(); return !!b})()");
        const guion = await esperarArchivo(/^guion-reunion-.*\.txt$/);
        ok('F2-10 preparacion: descargar el guion (blob:) escribe el archivo', !!guion && guion.bytes.length > 0, guion ? guion.nombre : 'sin archivo');
        sinViolaciones(vp, 'preparacion', 'carga, 2 PDF, 1 DOCX y descarga');
        // El Worker de la ventana HEREDA la CSP; un Worker desde file: se deniega.
        fp.sondeando = true;
        const v0 = visitas.length;
        const wk = await js(vp, `(async function(){
          var r = {};
          r.blob = await new Promise(function(res){ var w = new Worker(URL.createObjectURL(new Blob(["var r={};try{new Function('1')();r.fn='permitido'}catch(e){r.fn='bloqueado'}fetch('${H}/sonda-f2/desde-worker').then(function(){r.red='permitida';postMessage(r)},function(){r.red='bloqueada';postMessage(r)})"])));
            w.onmessage = function(e){ res(e.data) }; setTimeout(function(){ res('timeout') }, 3000); });
          try { new Worker(new URL('../vendor/pdf.worker.min.js', location.href).href); r.file = 'creado'; } catch(e) { r.file = 'denegado:' + e.name; }
          return JSON.stringify(r); })()`).then(JSON.parse).catch((e) => ({ error: e.message }));
        await esperar(500);
        fp.sondeando = false;
        info('preparacion workers: ' + JSON.stringify(wk) + ' visitas=' + JSON.stringify(visitas.slice(v0)));
        ok('F2-9c preparacion: un Worker blob: hereda la CSP (sin eval y SIN red)', wk.blob && wk.blob.fn === 'bloqueado' && wk.blob.red === 'bloqueada' && visitas.length === v0, JSON.stringify(wk));
        ok('F2-9d preparacion: un Worker desde file: (que no heredaria la CSP) queda DENEGADO', /^denegado:SecurityError/.test(String(wk.file)), String(wk.file));
        await sondearCorte(vp, 'preparacion');
      }

      // (5) EVALUACIÓN
      faseActual = 'evaluacion';
      prev = ids();
      await js(v, "window.panoramaBridge.projectMenuAction('proyecto-eval-candidatos')").catch(() => {});
      const ve = await esperarVentana('evaluacion_candidatos', 20000, prev);
      ok('F2-V evaluacion: abre', !!ve);
      if (ve) {
        await esperar(2500);
        await comprobarPolitica(ve, 'evaluacion', 'interfaz');
        await comprobarRecursos(ve, 'evaluacion', { globales: { THEMES: 'object' }, hojas: 3, imagenes: 1, fuentes: true });
        const pant = await js(ve, "JSON.stringify({carga: !document.getElementById('loadingScreen'), boton: !!document.getElementById('btnExportJson')})").then(JSON.parse).catch((e) => ({ error: e.message }));
        ok('F2-V evaluacion: termina de cargar', pant.boton === true, JSON.stringify(pant));
        await js(ve, "document.getElementById('btnExportJson').click(); 1").catch(() => {});
        const ej = await esperarArchivo(/^evaluacion_candidatos_.*\.json$/);
        let ejOk = false; try { ejOk = !!ej && typeof JSON.parse(ej.bytes.toString('utf8')) === 'object'; } catch (e) {}
        ok('F2-10 evaluacion: exportar JSON (blob:) escribe un JSON valido', ejOk, ej ? ej.nombre : 'sin archivo');
        sinViolaciones(ve, 'evaluacion', 'carga y exportacion');
        await sondearCorte(ve, 'evaluacion');
      }

      // (8) SELECTOR DE BACKUPS
      faseActual = 'selector';
      prev = ids();
      await js(v, "window.panoramaBridge.projectMenuAction('proyecto-restaurar-concreto')").catch(() => {});
      const vb = await esperarVentana('backup-picker/index.html', 20000, prev);
      ok('F2-V selector-backups: abre', !!vb);
      if (vb) {
        await esperar(1800);
        await comprobarPolitica(vb, 'selector-backups', 'interfaz');
        await comprobarRecursos(vb, 'selector-backups', { globales: { THEMES: 'object', psConfirm: 'function' }, hojas: 1, imagenes: 1 });
        const lista = await js(vb, "document.getElementById('list').children.length").catch(() => -1);
        ok('F2-V selector-backups: lista los backups (su renderer.js corre)', lista >= 1, String(lista));
        sinViolaciones(vb, 'selector-backups', 'carga y lista');
        await sondearCorte(vb, 'selector-backups');
        ok('F2-V selector-backups: se cierra con su propio boton', await cerrarDesdeDentro(vb, 'window.winControls.close()'), '');
      }

      // (7) DIRECTORIO
      faseActual = 'directorio';
      prev = ids();
      await js(v, "window.panoramaBridge.projectMenuAction('archivo-directorio')").catch(() => {});
      const dirRow = dbmod.get("SELECT id FROM projects WHERE kind='directorio_talento'");
      const vd = dirRow ? await esperarVentana(`projects/${dirRow.id}/dashboard.html`, 20000, prev) : null;
      ok('F2-V directorio: abre (copia horneada)', !!vd);
      if (vd) {
        await esperar(2500);
        await comprobarPolitica(vd, 'directorio', 'interfaz');
        const dsync = await js(vd, `(async function(){await syncFromProjects(true); state.corporateLogo=${JSON.stringify(PNG)}; renderHeaderLogo();
          await new Promise(function(r){setTimeout(r,500)});
          var im=document.getElementById('corp-logo-img'); return JSON.stringify({personas: state.people.length, logo: im ? im.naturalWidth : null})})()`).then(JSON.parse).catch((e) => ({ error: e.message }));
        info('directorio: ' + JSON.stringify(dsync));
        ok('F2-5 directorio: sincroniza y pinta el logo data:', dsync.personas >= 1 && dsync.logo === 1, JSON.stringify(dsync));
        await comprobarRecursos(vd, 'directorio', { globales: { THEMES: 'object', psConfirm: 'function', XLSX: 'object' }, hojas: 3, imagenes: 2, fuentes: true });
        await js(vd, 'exportPeopleXLSX(); 1').catch(() => {});
        const dx = await esperarArchivo(/^DirectorioTalento_equipo_.*\.xlsx$/);
        ok('F2-10 directorio: exportar Excel escribe un .xlsx real', !!dx && dx.bytes.slice(0, 2).toString() === 'PK', dx ? dx.nombre : 'sin archivo');
        await js(vd, 'exportJsonCopy(); 1').catch(() => {});
        const dj = await esperarArchivo(/^DirectorioTalento-backup-.*\.json$/);
        ok('F2-10 directorio: exportar la copia JSON escribe el archivo', !!dj && dj.bytes.length > 10, dj ? dj.nombre : 'sin archivo');
        sinViolaciones(vd, 'directorio', 'carga, sincronizacion, logo y 2 exportaciones');
        await sondearCorte(vd, 'directorio');
      }

      // (9) SEGURIDAD — se abre y se cancela; no se activa nada.
      faseActual = 'seguridad';
      prev = ids();
      js(lanzador, "window.launcherAPI.launcherMenuAction('security-setup')").catch(() => {});
      const vs = await esperarVentana('security-window/index.html', 20000, prev);
      ok('F2-V seguridad: abre', !!vs);
      if (vs) {
        await esperar(1500);
        await comprobarPolitica(vs, 'seguridad', 'interfaz');
        await comprobarRecursos(vs, 'seguridad', { globales: { THEMES: 'object' }, hojas: 1, imagenes: 0 });
        const t = await js(vs, "document.getElementById('title').textContent").catch(() => '');
        ok('F2-V seguridad: su renderer.js pinta el modo pedido', /Activar seguridad/.test(String(t)), String(t));
        sinViolaciones(vs, 'seguridad', 'carga');
        await sondearCorte(vs, 'seguridad');
        ok('F2-V seguridad: se cierra con Cancelar', await cerrarDesdeDentro(vs, 'window.securityWinAPI.cancel()'), '');
      }
      const segActiva = await js(lanzador, 'window.launcherAPI.isSecurityEnabled()').catch(() => null);
      ok('F2-V seguridad: cancelar no ha activado nada', segActiva === false, String(segActiva));

      // (10) CONTRASEÑA — importación cifrada; se cancela, no se crea nada.
      faseActual = 'contrasena';
      const nProy = dbmod.all('SELECT id FROM projects').length;
      prev = ids();
      const creando = js(lanzador, `window.launcherAPI.createProject('x','','',${JSON.stringify(JSON.stringify({ encrypted: true, salt: 'AA', iv: 'AA', ciphertext: 'AA' }))}).then(function(){return 'creado'}, function(e){return 'rechazado: ' + e.message})`);
      const vc = await esperarVentana('launcher/password-prompt.html', 20000, prev);
      ok('F2-V contrasena: abre', !!vc);
      if (vc) {
        await esperar(1200);
        await comprobarPolitica(vc, 'contrasena', 'interfaz');
        await comprobarRecursos(vc, 'contrasena', { globales: {}, hojas: 0, imagenes: 0 });
        const msg = await js(vc, "document.getElementById('pp-message').textContent").catch(() => '');
        ok('F2-V contrasena: su renderer pinta el mensaje recibido', /cifrado/i.test(String(msg)), String(msg));
        sinViolaciones(vc, 'contrasena', 'carga');
        await sondearCorte(vc, 'contrasena');
        ok('F2-V contrasena: se cierra con Cancelar', await cerrarDesdeDentro(vc, 'window.passwordPromptAPI.cancel()'), '');
      }
      const resCrear = await Promise.race([creando, esperar(8000).then(() => 'sin respuesta')]);
      ok('F2-V contrasena: cancelar aborta la importacion y no crea ningun proyecto',
        /cancelada/i.test(String(resCrear)) && dbmod.all('SELECT id FROM projects').length === nProy, `${resCrear} | ${nProy}`);

      // Sondeo de corte en lanzador y dashboard (al final, para no mezclar).
      await sondearCorte(lanzador, 'lanzador');
      // En el lanzador, además: un <script> en línea inyectado NO se ejecuta.
      const fl = fichaDe(lanzador); fl.sondeando = true;
      const iny = await js(lanzador, "(function(){var s=document.createElement('script');s.textContent='window.__f2iny=1';document.head.appendChild(s);"
        + "var d=document.createElement('div');d.setAttribute('onclick','window.__f2h=1');document.body.appendChild(d);d.click();d.remove();"
        + "return JSON.stringify({script: window.__f2iny===1, manejador: window.__f2h===1})})()").then(JSON.parse).catch((e) => ({ error: e.message }));
      await esperar(300); fl.sondeando = false;
      ok('F2-3c lanzador: un <script> en linea y un manejador en linea inyectados NO se ejecutan (sin unsafe-inline)',
        iny.script === false && iny.manejador === false, JSON.stringify(iny));
      const fv = fichaDe(v); fv.sondeando = true;
      const inyD = await js(v, "(function(){var s=document.createElement('script');s.textContent='window.__f2iny=1';document.head.appendChild(s);return window.__f2iny===1})()").catch(() => null);
      await esperar(300); fv.sondeando = false;
      ok('F2-3d dashboard: con unsafe-inline, un <script> en linea inyectado SI se ejecuta (limite documentado de F2, no se sobrevende)', inyD === true, String(inyD));
      await sondearCorte(v, 'dashboard');

      // (7b) RESTAURACIÓN: lectura (particion-auxiliar) + escritura (volcado)
      faseActual = 'restauracion';
      const rres = await conTope(js(lanzador, `window.launcherAPI.restoreBackup(${PID}, null).then(function(r){return JSON.stringify(r)}, function(e){return 'ERR ' + e.message})`), 60000, 'restauracion');
      info('restauracion: ' + rres);
      await esperar(2500);
      const helpers = [...registro.values()].filter((f) => f.fase === 'restauracion' && f.urls.some((u) => /restore-helper\.html$/.test(u)));
      info('ventanas auxiliares de la restauracion: ' + JSON.stringify(helpers.map((f) => f.alCargar)));
      ok('F2-V particion-auxiliar + volcado: la restauracion abre las DOS ventanas ocultas (leer, escribir)', helpers.length >= 2, String(helpers.length));
      ok('F2-1 particion-auxiliar + volcado: CSP efectiva en ambas (eval bloqueado) y localStorage accesible',
        helpers.length >= 2 && helpers.every((f) => f.alCargar && /^bloqueado:EvalError/.test(f.alCargar.evalua) && f.alCargar.almacen === true), JSON.stringify(helpers.map((f) => f.alCargar)));
      ok('F2-0 particion-auxiliar + volcado: CERO violaciones CSP', helpers.every((f) => !f.consola.some((x) => /Content Security Policy/i.test(x.m))), '');
      v = await esperarVentana(`projects/${PID}/dashboard.html`, 20000);
      ok('F2-V restauracion: termina y el dashboard vuelve a abrir', !!v && !/^ERR/.test(rres), rres);
      if (v) {
        await esperar(3000);
        await comprobarPolitica(v, 'dashboard (tras restaurar)', 'interfaz');
        const tras = await js(v, `document.body.innerText.indexOf(${JSON.stringify(MARCA)}) >= 0`).catch(() => null);
        ok('F2-V restauracion: los datos siguen ahi', tras === true, String(tras));
        sinViolaciones(v, 'dashboard (tras restaurar)', 'carga');
      }

      // Cobertura: las 10 ventanas han pasado por aquí.
      const etiquetas = new Set();
      for (const f of registro.values()) {
        const u = f.urls.join(' ');
        if (/launcher\/index\.html/.test(u)) etiquetas.add('lanzador');
        if (/launcher\/splash\.html/.test(u)) etiquetas.add('splash');
        if (/projects\/\d+\/dashboard\.html/.test(u)) etiquetas.add('proyecto');
        if (/preparacion_reunion/.test(u)) etiquetas.add('preparacion');
        if (/evaluacion_candidatos/.test(u)) etiquetas.add('evaluacion');
        if (/restore-helper/.test(u) && f.fase === 'crear-con-importacion') etiquetas.add('volcado-localstorage');
        if (/restore-helper/.test(u) && f.fase === 'restauracion') { etiquetas.add('particion-auxiliar'); etiquetas.add('volcado-localstorage'); }
        if (/backup-picker/.test(u)) etiquetas.add('selector-backups');
        if (/security-window/.test(u)) etiquetas.add('seguridad');
        if (/password-prompt/.test(u)) etiquetas.add('contrasena');
      }
      ok('F2-1c las 10 ventanas de F3 se han abierto y medido en esta pasada', etiquetas.size === 10, JSON.stringify([...etiquetas]));
      // Todos los documentos file:// que se han servido llevaban cabecera.
      const docs = declaradas.filter((d) => d.tipo === 'mainFrame');
      ok('F2-1d TODOS los documentos servidos llevaban su CSP por cabecera', docs.length >= 10 && docs.every((d) => !!d.csp), JSON.stringify(docs.filter((d) => !d.csp).map((d) => d.url.slice(-40))));

      // Un documento blob: navegado desde una ventana HEREDA la CSP (va al final: cambia la página).
      if (v) {
        await js(v, "(function(){location.href=URL.createObjectURL(new Blob(['<!DOCTYPE html><p>blob</p>'],{type:'text/html'}));return 1})()").catch(() => {});
        await esperar(1500);
        const pb = await politicaEfectiva(v);
        ok('F2-10b un documento blob: (rama que F3 permite) HEREDA la CSP de la ventana', /^blob:/.test(v.webContents.getURL()) && pb.politica === PERFIL.interfaz, JSON.stringify(pb));
      }
      tlog('__MODO_TERMINADO__ completo');
      await esperar(600);
      app.exit(0);
      return;
    }

    // =======================================================================
    // DIAGNÓSTICO (primera pasada): la exportación a PowerPoint no terminaba.
    // Medido: con la ventana OCULTA (el arnés arranca Electron minimizado)
    // pptxgen no termina ni una presentación mínima, CON y SIN F2 (se corre
    // también con el main.js pre-F2). Con la ventana visible, sí. Es un
    // artefacto del arnés; la pasada completa muestra la ventana antes.
    if (MODO === 'pptx') {
      tlog('--- F2 DIAGNOSTICO: exportacion a PowerPoint con la ventana oculta / visible ---');
      const row = await js(lanzador, `window.launcherAPI.createProject('x','','',${JSON.stringify(JSON.stringify({ state: estadoConDatos('Pptx F2', 'HITO-PPTX'), history: [] }))})`);
      await js(lanzador, `window.launcherAPI.openProject(${row.id})`);
      const v = await esperarVentana(`projects/${row.id}/dashboard.html`);
      await esperar(3500);
      const minimo = `(async function(){
        var p = new PptxGenJS(); p.addSlide().addText('x', {x:1, y:1});
        var b = await Promise.race([p.write({outputType:'base64'}).then(function(){return 'ok'}, function(e){return 'ERR '+e.message}),
          new Promise(function(x){setTimeout(function(){x('sin terminar')}, 6000)})]);
        return JSON.stringify({resultado: b, visibilidad: document.visibilityState}); })()`;
      try { v.minimize(); } catch (e) {}
      await esperar(1000);
      const oculta = await conTope(js(v, minimo).then(JSON.parse), 15000, 'oculta');
      info('ventana oculta: ' + JSON.stringify(oculta));
      ok('F2-D1 [MEDIDO] con la ventana OCULTA, pptxgen no termina ni una presentacion minima', oculta.visibilidad === 'hidden' && oculta.resultado === 'sin terminar', JSON.stringify(oculta));
      try { v.restore(); v.show(); v.focus(); } catch (e) {}
      await esperar(1200);
      const visible = await conTope(js(v, minimo).then(JSON.parse), 15000, 'visible');
      info('ventana visible: ' + JSON.stringify(visible));
      ok('F2-D2 [MEDIDO] con la ventana VISIBLE, termina', visible.visibilidad === 'visible' && visible.resultado === 'ok', JSON.stringify(visible));
      const f = fichaDe(v); const n0 = f.consola.length;
      const r = await conTope(js(v, "exportExecutivePPTX(null).then(function(){var e=document.getElementById('io-feedback');return e?e.innerText.slice(0,100):''})"), 30000, 'informe');
      const px = await esperarArchivo(/informe_ejecutivo.*\.pptx$/, 10000);
      info(`informe: ${r} | ${px ? px.nombre + ' ' + px.bytes.length : 'sin archivo'} | consola: ${JSON.stringify(f.consola.slice(n0).map((x) => x.m.slice(0, 100)))}`);
      ok('F2-D3 [MEDIDO] con la ventana visible, el informe real (con logo) se genera y se descarga', /generado/i.test(String(r)) && !!px && px.bytes.slice(0, 2).toString() === 'PK', String(r));
      tlog('__MODO_TERMINADO__ pptx');
      await esperar(600);
      app.exit(0);
      return;
    }

    // =======================================================================
    if (MODO === 'viejo-a') {
      tlog('--- F2-14 (fase A): PROYECTOS CREADOS POR LA VERSION ANTERIOR A F2 ---');
      for (const [nombre, marca] of [['Viejo F2 uno', 'HITO-VIEJO-UNO'], ['Viejo F2 dos', 'HITO-VIEJO-DOS']]) {
        const row = await js(lanzador, `window.launcherAPI.createProject('x','','',${JSON.stringify(JSON.stringify({ state: estadoConDatos(nombre, marca), history: [] }))})`);
        await js(lanzador, `window.launcherAPI.openProject(${row.id})`);
        const v = await esperarVentana(`projects/${row.id}/dashboard.html`);
        await esperar(3000);
        const r = await politicaEfectiva(v);
        const ve = await js(v, `document.body.innerText.indexOf(${JSON.stringify(marca)}) >= 0`).catch(() => null);
        info(`${nombre}: politica=${JSON.stringify(r)} marca=${ve}`);
        ok(`F2-14A ${nombre}: con el main.js PRE-F2 NO hay CSP (estado de partida) y los datos se ven`, r.politica === null && r.evalua === 'permitido' && ve === true, JSON.stringify(r));
        const g = await js(v, "(function(){var d={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);d[k]=localStorage.getItem(k);}"
          + "return window.panoramaBridge.saveBackup(JSON.stringify(d),'manual');})()").catch((e) => ({ error: e.message }));
        ok(`F2-14A ${nombre}: backup guardado`, g && g.aplicado === true, JSON.stringify(g));
      }
      tlog('__MODO_TERMINADO__ viejo-a');
      await esperar(800);
      app.exit(0);
      return;
    }

    if (MODO === 'viejo-b') {
      tlog('--- F2-14 (fase B): LA VERSION CON F2 ABRE LOS PROYECTOS VIEJOS ---');
      const uno = dbmod.get("SELECT * FROM projects WHERE name='Viejo F2 uno'");
      const dos = dbmod.get("SELECT * FROM projects WHERE name='Viejo F2 dos'");
      ok('F2-14 los dos proyectos de la fase A siguen en la BD del sandbox', !!uno && !!dos, '');
      await comprobarPolitica(lanzador, 'lanzador (fase B)', 'sinScriptEnLinea');
      // El segundo se deja de SOLO LECTURA: su copia horneada NO se podrá
      // regenerar al abrirlo. La CSP no debe depender de eso.
      const archivoDos = path.join(UD, 'projects', String(dos.id), 'dashboard.html');
      const hashAntes = crypto.createHash('sha256').update(fs.readFileSync(archivoDos)).digest('hex');
      fs.chmodSync(archivoDos, 0o444);
      for (const [row, marca, nombre] of [[uno, 'HITO-VIEJO-UNO', 'proyecto viejo'], [dos, 'HITO-VIEJO-DOS', 'proyecto viejo SIN rehornear']]) {
        await js(lanzador, `window.launcherAPI.openProject(${row.id})`);
        const v = await esperarVentana(`projects/${row.id}/dashboard.html`);
        ok(`F2-14 ${nombre}: abre`, !!v);
        if (!v) continue;
        await esperar(3500);
        await comprobarPolitica(v, nombre, 'interfaz');
        await comprobarRecursos(v, nombre, { globales: { THEMES: 'object', psConfirm: 'function', XLSX: 'object', PptxGenJS: 'function', PanoramaServiceStatus: 'object' }, hojas: 3, imagenes: 2, fuentes: true });
        const ve = await js(v, `document.body.innerText.indexOf(${JSON.stringify(marca)}) >= 0`).catch(() => null);
        ok(`F2-14 ${nombre}: sus datos se ven igual`, ve === true, String(ve));
        sinViolaciones(v, nombre, 'carga');
      }
      const hashDespues = crypto.createHash('sha256').update(fs.readFileSync(archivoDos)).digest('hex');
      fs.chmodSync(archivoDos, 0o666);
      ok('F2-14b el proyecto de solo lectura NO se rehorneo (su archivo sigue identico) y aun asi tiene CSP', hashAntes === hashDespues, `${hashAntes.slice(0, 12)} / ${hashDespues.slice(0, 12)}`);
      const log = fs.existsSync(path.join(UD, 'app.log')) ? fs.readFileSync(path.join(UD, 'app.log'), 'utf8') : '';
      ok('F2-14c …y el fallo del rehorneado quedo registrado (no es silencioso)', /no se pudo refrescar su copia HTML/.test(log), '');
      // F2-15 en esta misma version: proyecto nuevo sin importar.
      const nuevo = await js(lanzador, "window.launcherAPI.createProject('Nuevo F2','','2026-02-01',null)");
      await js(lanzador, `window.launcherAPI.openProject(${nuevo.id})`);
      const vn = await esperarVentana(`projects/${nuevo.id}/dashboard.html`);
      ok('F2-15 proyecto NUEVO (sin importar): abre', !!vn);
      if (vn) {
        await esperar(3500);
        await comprobarPolitica(vn, 'proyecto nuevo', 'interfaz');
        const hitos = await js(vn, "!!document.getElementById('milestone-list')").catch(() => null);
        ok('F2-15 proyecto nuevo: el dashboard esta operativo', hitos === true, String(hitos));
        sinViolaciones(vn, 'proyecto nuevo', 'carga');
      }
      tlog('__MODO_TERMINADO__ viejo-b');
      await esperar(800);
      app.exit(0);
      return;
    }

    // =======================================================================
    // REVERSIONES: el main.js cargado es una mutación; lo que se exige aquí es
    // que la batería VEA el defecto.
    if (MODO === 'rev-sin-csp' || MODO === 'rev-eval' || MODO === 'rev-worker-none') {
      tlog(`--- F2 REVERSION: ${MODO} ---`);
      const row = await js(lanzador, `window.launcherAPI.createProject('x','','',${JSON.stringify(JSON.stringify({ state: estadoConDatos('Rev F2', 'HITO-REV'), history: [] }))})`);
      await js(lanzador, `window.launcherAPI.openProject(${row.id})`);
      const v = await esperarVentana(`projects/${row.id}/dashboard.html`);
      await esperar(3500);
      const r = await politicaEfectiva(v);
      info('politica efectiva del dashboard: ' + JSON.stringify(r));
      if (MODO === 'rev-sin-csp') {
        ok('F2-REV1 sin la CSP, la bateria DETECTA que no hay politica (F2-1 fallaria)', r.politica === null && r.evalua === 'permitido', JSON.stringify(r));
        const v0 = visitas.length;
        const red = await js(v, `(async function(){var r={};try{await fetch('${H}/sonda-f2/rev-fetch');r.fetch='permitido'}catch(e){r.fetch='bloqueado'}
          r.img = await new Promise(function(res){var i=new Image();i.onload=function(){res('cargada')};i.onerror=function(){res('bloqueada')};i.src='${H}/sonda-f2/rev-img.png';setTimeout(function(){res('timeout')},2000)});
          return JSON.stringify(r)})()`).then(JSON.parse).catch((e) => ({ error: e.message }));
        await esperar(400);
        info('red sin CSP: ' + JSON.stringify(red) + ' visitas=' + JSON.stringify(visitas.slice(v0)));
        ok('F2-REV2 sin la CSP, un fetch remoto VUELVE a salir (el servidor local lo recibe)', red.fetch === 'permitido' && visitas.slice(v0).some((x) => /rev-fetch/.test(x)), JSON.stringify(red));
        ok('F2-REV3 sin la CSP, una imagen remota VUELVE a cargar', red.img === 'cargada' && visitas.slice(v0).some((x) => /rev-img/.test(x)), JSON.stringify(red));
        ok('F2-REV4 …y Electron vuelve a avisar de CSP insegura', avisosElectronCsp(v) > 0 || avisosElectronCsp(lanzador) > 0, `${avisosElectronCsp(v)}/${avisosElectronCsp(lanzador)}`);
      }
      if (MODO === 'rev-eval') {
        ok("F2-REV5 con 'unsafe-eval' añadido, la bateria lo DETECTA: new Function vuelve a ejecutarse (F2-2 fallaria)", r.evalua === 'permitido', JSON.stringify(r));
      }
      if (MODO === 'rev-worker-none') {
        const prev = ids();
        await js(v, "window.panoramaBridge.projectMenuAction('proyecto-prep-reunion')").catch(() => {});
        const vp = await esperarVentana('preparacion_reunion', 20000, prev);
        await esperar(2500);
        await js(vp, INSTRUMENTAR_WORKER);
        const rPdf = await js(vp, `(async function(){await handleActaFile(${archivoEnPagina(pdfMinimo('ACTA REV F2 acuerdo pendiente'), 'acta.pdf')});`
          + 'var wp = window.pdfjsLib && window.pdfjsLib.GlobalWorkerOptions.workerPort;'
          + 'return JSON.stringify({estado: state.actaStatus, texto: state.actaText.slice(0,40), puerto: !!wp, intentos: window.__f2w})})()').then(JSON.parse).catch((e) => ({ error: e.message }));
        const fake = fichaDe(vp).consola.filter((x) => /fake worker/i.test(x.m)).length;
        const viol = fichaDe(vp).consola.filter((x) => /Content Security Policy/i.test(x.m)).length;
        info('pdf con worker-src none: ' + JSON.stringify(rPdf) + ` fake=${fake} violaciones=${viol}`);
        ok("F2-REV6 [CONTROL DE COMPATIBILIDAD] con worker-src 'none' el acta se sigue leyendo…", rPdf.estado === 'ok' && /ACTA REV/.test(rPdf.texto), JSON.stringify(rPdf));
        ok('F2-REV7 …pero la bateria DETECTA la degradacion: sin Worker real, pdf.js cae al fake worker y hay violaciones (F2-9 y F2-0 fallarian)',
          rPdf.puerto === false && fake >= 1 && viol >= 1, JSON.stringify({ rPdf, fake, viol }));
      }
      tlog(`__MODO_TERMINADO__ ${MODO}`);
      await esperar(600);
      app.exit(0);
      return;
    }
  } catch (e) {
    tlog('EXCEPCION EN EL ARNES: ' + ((e && e.stack) || String(e)));
    app.exit(4);
  }
});
