// ---------------------------------------------------------------------------
// F2 — LABORATORIO DE CSP EN EL CHROMIUM REAL DE LA APP (Electron 30.5.1).
//
// NO carga main.js ni ninguna plantilla: mide el MOTOR, con páginas mínimas
// generadas en el sandbox y los vendor/asset REALES del producto (solo
// lectura). Responde a las preguntas que deciden la CSP final:
//
//   L1  ¿la vía por CABECERA (session.webRequest.onHeadersReceived) llega a
//       los documentos file://?  → decide meta vs cabecera.
//   L2  ¿qué es 'self' en un documento file://? ¿hace falta además `file:`?
//       Matriz directiva × fuente con recursos reales en OTRA carpeta.
//   L3  pdf.js 3.11.174: ¿en qué modo arranca su Worker HOY (sin CSP) y bajo
//       cada worker-src? (real / fake en el hilo principal)
//   L4  descargas por blob: sin `blob:` en ninguna directiva.
//   L5  frame / object / form / base.
//   L6  red: fetch http/https, XHR, WebSocket, EventSource, sendBeacon,
//       imagen, CSS, script, fuente, media — contra un servidor LOCAL que
//       cuenta visitas (127.0.0.1). Sin Internet. Con control SIN CSP.
//   L7  executeJavaScript (lo que usa main.js) bajo la CSP más estricta.
//   L8  control de 'unsafe-eval' (la prueba lo detecta si alguien lo añade).
//
// Sin red externa. Sin tocar la BD viva. Sin cargar el producto.
// ---------------------------------------------------------------------------
const { app, BrowserWindow, session } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { pathToFileURL } = require('url');

const arg = process.argv.find((a) => a.startsWith('--sandbox='));
if (!arg) { console.error('falta --sandbox='); process.exit(2); }
const SB = arg.slice('--sandbox='.length);
if (!/_a33-f2/i.test(SB)) { console.error('sandbox no marcado'); process.exit(2); }

app.setPath('appData', path.join(SB, 'Roaming'));
app.setPath('userData', path.join(SB, 'Roaming', 'f2-lab'));
// Cada sonda abre y DESTRUYE su ventana. Sin este oyente, Electron cierra la
// app al quedarse sin ventanas y la carga siguiente se aborta con ERR_FAILED
// (defecto de arnés medido en la primera pasada, no del motor).
app.on('window-all-closed', () => {});
const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const LAB = path.join(SB, 'lab');
fs.mkdirSync(path.join(LAB, 'otra'), { recursive: true });
fs.mkdirSync(path.join(LAB, 'descargas'), { recursive: true });

const ascii = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u00b7\u2014\u2013\u2192]/g, '-').replace(/\u2026/g, '...');
function tlog(s) { try { fs.appendFileSync(path.join(SB, 'test.log'), `[${new Date().toISOString()}] ${ascii(s)}\n`); } catch (e) {} }
function ok(n, c, extra) { tlog((c ? 'OK    ' : 'FALLO ') + n + (c ? '' : '  -- ' + (extra === undefined ? '' : extra))); }
function info(s) { tlog('      ' + s); }
function medida(s) { tlog('MEDIDA ' + s); }

const u = (p) => pathToFileURL(p).href;
const V = (f) => u(path.join(PROJ, 'vendor', f));
const A = (f) => u(path.join(PROJ, 'assets', f));
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// --- servidor LOCAL que cuenta visitas (sustituye a Internet) ---------------
const visitas = [];
let conexiones = 0;
const servidor = http.createServer((req, res) => {
  visitas.push(`${req.method} ${req.url}`);
  if (/\.png/.test(req.url)) { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(fs.readFileSync(path.join(PROJ, 'assets', 'icon-16.png'))); return; }
  if (/eventos/.test(req.url)) { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end('data: x\n\n'); return; }
  res.writeHead(200, { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' });
  res.end('x');
});
servidor.on('connection', () => { conexiones++; });
servidor.on('upgrade', (req, sock) => { visitas.push(`UPGRADE ${req.url}`); sock.destroy(); });
servidor.on('clientError', (e, sock) => { visitas.push('CLIENTERROR'); try { sock.destroy(); } catch (x) {} });

function escribir(nombre, { csp, head = '', body = '' }) {
  const meta = csp == null ? '' : `<meta http-equiv="Content-Security-Policy" content="${csp}">`;
  const f = path.join(LAB, nombre);
  fs.writeFileSync(f, `<!DOCTYPE html><html><head><meta charset="utf-8">${meta}${head}</head><body>${body}</body></html>`, 'utf8');
  return f;
}

async function abrir(fichero, { partition } = {}) {
  const w = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true, partition } });
  const consola = [];
  const traza = [];
  w.webContents.on('console-message', (e, level, message) => consola.push(String(message)));
  w.webContents.on('did-fail-load', (e, code, desc, url, main) => traza.push(`fail ${code} ${desc} main=${main} ${String(url).slice(-40)}`));
  w.webContents.on('did-start-navigation', (d) => traza.push(`nav ${String((d && d.url) || d).slice(-40)}`));
  try { await w.loadURL(u(fichero)); } catch (e) {
    info(`abrir(${path.basename(fichero)}) -> ${e.message} | traza ${JSON.stringify(traza)} | consola ${JSON.stringify(consola.slice(0, 4))}`);
    throw e;
  }
  await esperar(400);
  const js = (code) => w.webContents.executeJavaScript(code);
  const csp = () => consola.filter((m) => /Content Security Policy/i.test(m));
  const cerrar = () => { try { w.destroy(); } catch (e) {} };
  return { w, consola, js, csp, cerrar };
}

app.whenReady().then(async () => {
  try {
    await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
    const PUERTO = servidor.address().port;
    const H = `http://127.0.0.1:${PUERTO}`;
    const HS = `https://127.0.0.1:${PUERTO}`;
    const WS = `ws://127.0.0.1:${PUERTO}`;
    info('servidor local en ' + H);
    fs.writeFileSync(path.join(LAB, 'otra', 'x.js'), 'window.__otra = 1;', 'utf8');
    fs.writeFileSync(path.join(LAB, 'otra', 'w.js'), 'postMessage("worker-vivo");', 'utf8');
    fs.writeFileSync(path.join(LAB, 'inerte.html'), '<!DOCTYPE html><title>inerte</title>x', 'utf8');
    fs.writeFileSync(path.join(LAB, 'otra', 'h.css'), '.marca-otra{display:block;width:123px}', 'utf8');
    // Worker que intenta salir a la red: sirve para saber si la CSP del
    // documento ALCANZA a un Worker creado desde un file:.
    fs.writeFileSync(path.join(LAB, 'otra', 'sale.js'),
      `fetch(${JSON.stringify(H + '/desde-worker')}).then(function(){postMessage('permitido')},function(){postMessage('bloqueado')});`, 'utf8');

    // =======================================================================
    tlog('--- L1: LA VIA POR CABECERA, CON file:// ---');
    {
      const ses = session.fromPartition('lab-cabecera');
      let antes = 0; let cabeceras = 0;
      ses.webRequest.onBeforeRequest((d, cb) => { if (/^file:/i.test(d.url)) antes++; cb({}); });
      ses.webRequest.onHeadersReceived((d, cb) => {
        if (/^file:/i.test(d.url)) cabeceras++;
        const h = Object.assign({}, d.responseHeaders || {});
        h['Content-Security-Policy'] = ["default-src 'none'; script-src 'unsafe-inline'"];
        cb({ responseHeaders: h });
      });
      const f = escribir('l1.html', { csp: null, head: `<script src="${V('theme.js')}"></script><script>window.__inline = 1;</script>` });
      const p = await abrir(f, { partition: 'lab-cabecera' });
      const r = JSON.parse(await p.js("JSON.stringify({inline: window.__inline === 1, externo: typeof THEMES, "
        + "evalua: (function(){try{new Function('return 1')();return 'permitido'}catch(e){return 'bloqueado'}})()})"));
      medida(`L1 cabecera: onBeforeRequest(file)=${antes} onHeadersReceived(file)=${cabeceras} ${JSON.stringify(r)}`);
      const cabeceraEfectiva = r.externo === 'undefined' || r.evalua === 'bloqueado';
      medida(`L1 => la CSP por cabecera ${cabeceraEfectiva ? 'SI' : 'NO'} llega a un documento file:// (Electron 30.5.1)`);
      // Hipótesis previa (equivocada, se deja constancia): «webRequest no ve
      // file://». Medido: SÍ lo ve, en una partición, y la cabecera se aplica.
      ok('L1a [MEDIDO] webRequest SI ve el documento file:// (onBeforeRequest y onHeadersReceived)', antes >= 1 && cabeceras >= 1, `${antes}/${cabeceras}`);
      ok('L1b [MEDIDO] …y una CSP por cabecera SI se aplica: bloquea el script externo y new Function, deja el inline',
        r.inline === true && r.externo === 'undefined' && r.evalua === 'bloqueado', JSON.stringify(r));
      p.cerrar();
    }

    // =======================================================================
    tlog('--- L2: QUE ES \'self\' EN UN DOCUMENTO file:// ---');
    info(`pagina en: ${LAB}`);
    info(`recursos en: ${PROJ} (otra carpeta, otra unidad logica de rutas)`);
    const FUENTES = ["'self'", 'file:', "'none'"];
    const matriz = {};
    for (const fuente of FUENTES) {
      // script
      {
        const f = escribir(`l2-script-${FUENTES.indexOf(fuente)}.html`, {
          csp: `default-src 'none'; script-src ${fuente}`,
          head: `<script src="${V('theme.js')}"></script><script src="${u(path.join(LAB, 'otra', 'x.js'))}"></script>`,
        });
        const p = await abrir(f);
        const r = JSON.parse(await p.js("JSON.stringify({vendor: typeof THEMES === 'object', otra: window.__otra === 1})"));
        matriz[`script-src ${fuente}`] = r; p.cerrar();
      }
      // style — se mide el EFECTO de la hoja, no `link.sheet` (primera pasada:
      // Chromium deja un `sheet` aunque la carga se bloquee; defecto de sonda).
      {
        const f = escribir(`l2-style-${FUENTES.indexOf(fuente)}.html`, {
          csp: `default-src 'none'; style-src ${fuente}`,
          head: `<link rel="stylesheet" href="${V('window-chrome.css')}"><link rel="stylesheet" href="${u(path.join(LAB, 'otra', 'h.css'))}">`,
          body: '<div class="titlebar" id="tb">t</div><div class="marca-otra" id="mo">o</div>',
        });
        const p = await abrir(f);
        // Con tolerancia: la pantalla escala (segunda pasada: 31.9957px y
        // 122.997px; la comparación exacta de cadenas era otro defecto de sonda).
        const r = JSON.parse(await p.js("JSON.stringify({vendor: Math.abs(parseFloat(getComputedStyle(document.getElementById('tb')).height) - 32) < 0.5, "
          + "otra: Math.abs(parseFloat(getComputedStyle(document.getElementById('mo')).width) - 123) < 0.5})"));
        matriz[`style-src ${fuente}`] = r; p.cerrar();
      }
      // img (archivo) + data:
      {
        const f = escribir(`l2-img-${FUENTES.indexOf(fuente)}.html`, {
          csp: `default-src 'none'; img-src ${fuente}`,
          body: `<img id="a" src="${A('icon-256.png')}"><img id="d" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7">`,
        });
        const p = await abrir(f);
        await esperar(300);
        const r = JSON.parse(await p.js("JSON.stringify({archivo: document.getElementById('a').naturalWidth > 0, data: document.getElementById('d').naturalWidth > 0})"));
        matriz[`img-src ${fuente}`] = r; p.cerrar();
      }
      // font (la hoja se permite con style-src 'self'; se varía font-src)
      {
        const f = escribir(`l2-font-${FUENTES.indexOf(fuente)}.html`, {
          csp: `default-src 'none'; style-src 'self'; font-src ${fuente}`,
          head: `<link rel="stylesheet" href="${V('fonts/fonts.css')}">`,
        });
        const p = await abrir(f);
        const r = JSON.parse(await p.js("(async function(){try{var l = await document.fonts.load('16px Inter');"
          + "return JSON.stringify({vendor: l.length > 0 && l.every(function(x){return x.status==='loaded'})})}"
          + "catch(e){return JSON.stringify({vendor:false, error:e.name})}})()"));
        matriz[`font-src ${fuente}`] = r; p.cerrar();
      }
      // worker desde archivo
      {
        const f = escribir(`l2-worker-${FUENTES.indexOf(fuente)}.html`, { csp: `default-src 'none'; worker-src ${fuente}` });
        const p = await abrir(f);
        const r = JSON.parse(await p.js(`new Promise(function(res){try{var w=new Worker(${JSON.stringify(u(path.join(LAB, 'otra', 'w.js')))});`
          + "w.onmessage=function(e){res(JSON.stringify({archivo:e.data==='worker-vivo'}))};"
          + "w.onerror=function(){res(JSON.stringify({archivo:false, error:'onerror'}))};"
          + "setTimeout(function(){res(JSON.stringify({archivo:false, error:'timeout'}))},2500);}"
          + "catch(e){res(JSON.stringify({archivo:false, error:e.name}))}})"));
        matriz[`worker-src ${fuente}`] = r; p.cerrar();
      }
    }
    for (const k of Object.keys(matriz)) medida(`L2 ${k.padEnd(20)} ${JSON.stringify(matriz[k])}`);
    const S = (d) => matriz[`${d} 'self'`]; const F = (d) => matriz[`${d} file:`]; const N = (d) => matriz[`${d} 'none'`];
    ok("L2a [MEDIDO] script-src 'self' en file:// carga scripts de OTRA carpeta (el vendor real y otra ruta)", S('script-src').vendor && S('script-src').otra, JSON.stringify(S('script-src')));
    ok("L2b [MEDIDO] style-src 'self' carga la hoja del vendor y la de otra carpeta", S('style-src').vendor && S('style-src').otra, JSON.stringify(S('style-src')));
    ok("L2c [MEDIDO] img-src 'self' carga el icono de assets/", S('img-src').archivo, JSON.stringify(S('img-src')));
    ok("L2d [MEDIDO] font-src 'self' carga las woff2 de vendor/fonts", S('font-src').vendor, JSON.stringify(S('font-src')));
    ok("L2e [MEDIDO] file: da EXACTAMENTE lo mismo que 'self' en las cinco (script, style, img, font, worker)",
      JSON.stringify([S('script-src'), S('style-src'), S('img-src'), S('font-src'), S('worker-src')])
        === JSON.stringify([F('script-src'), F('style-src'), F('img-src'), F('font-src'), F('worker-src')]),
      JSON.stringify([F('script-src'), F('style-src'), F('img-src'), F('font-src'), F('worker-src')]));
    ok("L2f [CONTROL] con 'none' las cinco cosas quedan BLOQUEADAS (la matriz discrimina)",
      !N('script-src').vendor && !N('script-src').otra && !N('style-src').vendor && !N('style-src').otra && !N('img-src').archivo && !N('font-src').vendor && !N('worker-src').archivo,
      JSON.stringify([N('script-src'), N('style-src'), N('img-src'), N('font-src'), N('worker-src')]));
    ok("L2g [MEDIDO] data: NO entra por 'self' ni por file: (hay que nombrarlo donde sea contrato)",
      !S('img-src').data && !F('img-src').data, JSON.stringify([S('img-src'), F('img-src')]));
    medida(`L2 worker desde archivo: 'self'=${JSON.stringify(S('worker-src'))} file:=${JSON.stringify(F('worker-src'))}`);

    // =======================================================================
    tlog('--- L3: EL WORKER DE pdf.js 3.11.174, DE VERDAD ---');
    const pdfBytes = (() => {
      const obj = [];
      obj[1] = '<< /Type /Catalog /Pages 2 0 R >>';
      obj[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
      obj[3] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>';
      const flujo = 'BT /F1 12 Tf 20 100 Td (F2LAB) Tj ET';
      obj[4] = `<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`;
      obj[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
      let pdf = '%PDF-1.4\n'; const pos = [];
      for (let i = 1; i <= 5; i++) { pos[i] = pdf.length; pdf += `${i} 0 obj\n${obj[i]}\nendobj\n`; }
      const x = pdf.length;
      pdf += 'xref\n0 6\n0000000000 65535 f \n';
      for (let i = 1; i <= 5; i++) pdf += String(pos[i]).padStart(10, '0') + ' 00000 n \n';
      pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`;
      return Buffer.from(pdf, 'latin1').toString('base64');
    })();
    // Instrumentación: se envuelve window.Worker ANTES de cargar pdf.js para
    // saber con qué URL se intenta crear, si el constructor lanza y si el
    // worker llega a hablar. Y se mira `_webWorker` (null = fake worker).
    const sondaPdf = `(async function(){
      var intentos = [];
      var W = window.Worker;
      window.Worker = function(url, o){
        var reg = {esquema: String(url).split(':')[0], lanzo: null, error: false};
        intentos.push(reg);
        try { var w = new W(url, o); w.addEventListener('error', function(){ reg.error = true; }); return w; }
        catch (e) { reg.lanzo = e.name; throw e; }
      };
      await new Promise(function(res){var s=document.createElement('script');s.src=${JSON.stringify(V('pdf.min.js'))};s.onload=res;s.onerror=res;document.head.appendChild(s);});
      if (!window.pdfjsLib) return JSON.stringify({cargado:false});
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = ${JSON.stringify(V('pdf.worker.min.js'))};
      var s = atob(${JSON.stringify(pdfBytes)}); var b = new Uint8Array(s.length);
      for (var i=0;i<s.length;i++) b[i]=s.charCodeAt(i);
      try {
        var tarea = window.pdfjsLib.getDocument({data: b});
        var doc = await tarea.promise;
        var pag = await doc.getPage(1);
        var tc = await pag.getTextContent();
        return JSON.stringify({cargado:true, paginas: doc.numPages, texto: tc.items.map(function(x){return x.str}).join(''),
          modo: (tarea._worker && tarea._worker._webWorker) ? 'REAL' : 'FAKE', intentos: intentos});
      } catch (e) { return JSON.stringify({cargado:true, error: e.name + ': ' + String(e.message).slice(0,80), intentos: intentos}); }
    })()`;
    const variantesPdf = [
      ['sin CSP (PRODUCCION HOY)', null],
      ["worker-src 'self' file: (candidata del diagnostico)", "default-src 'none'; script-src 'self' 'unsafe-inline'; worker-src 'self' file:"],
      ['worker-src blob:', "default-src 'none'; script-src 'self' 'unsafe-inline'; worker-src blob:"],
      ["worker-src 'none'", "default-src 'none'; script-src 'self' 'unsafe-inline'; worker-src 'none'"],
      ['sin worker-src (cae a script-src)', "default-src 'none'; script-src 'self' 'unsafe-inline'"],
    ];
    const pdfRes = {};
    for (const [nombre, csp] of variantesPdf) {
      const f = escribir(`l3-${variantesPdf.findIndex((x) => x[0] === nombre)}.html`, { csp });
      const p = await abrir(f);
      const r = JSON.parse(await p.js(sondaPdf).catch((e) => JSON.stringify({ error: 'ERR ' + e.message })));
      await esperar(300);
      r.violaciones = p.csp().map((m) => m.slice(0, 110));
      r.avisoFake = p.consola.some((m) => /fake worker/i.test(m));
      pdfRes[nombre] = r;
      medida(`L3 ${nombre.padEnd(48)} ${JSON.stringify(r)}`);
      p.cerrar();
    }
    const hoy = pdfRes['sin CSP (PRODUCCION HOY)'];
    const cand = pdfRes["worker-src 'self' file: (candidata del diagnostico)"];
    const conBlob = pdfRes['worker-src blob:'];
    const sinW = pdfRes["worker-src 'none'"];
    // Hipótesis previa (equivocada, se deja constancia): «pdf.js envuelve su
    // Worker en un blob: porque el origen de un file:// es "null"». Medido:
    // Chromium da a los file:// el origen "file://", `isSameOrigin` es cierto
    // y pdf.js crea el Worker DIRECTAMENTE desde el file:.
    ok('L3a [MEDIDO] HOY, sin CSP, pdf.js crea su Worker DIRECTAMENTE desde file: (no blob:) y en modo REAL',
      hoy.intentos && hoy.intentos.length === 1 && hoy.intentos[0].esquema === 'file' && hoy.modo === 'REAL', JSON.stringify(hoy));
    ok("L3b [MEDIDO] con worker-src 'self' file: pdf.js lee el PDF CON su Worker REAL (el diagnostico solo miro paginas===1)",
      cand.paginas === 1 && /F2LAB/.test(cand.texto || '') && cand.modo === 'REAL' && cand.violaciones.length === 0, JSON.stringify(cand));
    ok('L3c [MEDIDO] blob: NO hace falta: con worker-src blob: SOLO, el Worker se bloquea y pdf.js cae a FAKE',
      conBlob.paginas === 1 && conBlob.modo === 'FAKE' && conBlob.avisoFake === true, JSON.stringify(conBlob));
    ok("L3d [CONTROL] con worker-src 'none' el Worker se bloquea, queda registrado y pdf.js cae a FAKE (hilo principal)",
      sinW.violaciones.some((m) => /worker/i.test(m)) && sinW.modo === 'FAKE', JSON.stringify(sinW));
    ok('L3e [MEDIDO] sin worker-src, el Worker se permite por la cadena de reserva (script-src): hay que DENEGARLO explicitamente donde no se usa',
      pdfRes['sin worker-src (cae a script-src)'].modo === 'REAL', JSON.stringify(pdfRes['sin worker-src (cae a script-src)']));

    // =======================================================================
    tlog('--- L4: DESCARGAS POR blob: SIN blob: EN LA CSP ---');
    {
      const ses = session.fromPartition('lab-descargas');
      const hechas = [];
      ses.on('will-download', (e, item) => {
        const destino = path.join(LAB, 'descargas', `${hechas.length}-${item.getFilename()}`);
        item.setSavePath(destino);
        const reg = { nombre: item.getFilename(), url: item.getURL().slice(0, 5), estado: null, destino };
        hechas.push(reg);
        item.once('done', (ev, st) => { reg.estado = st; });
      });
      const CSP_MAS_ESTRICTA = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";
      const f = escribir('l4.html', { csp: CSP_MAS_ESTRICTA });
      const p = await abrir(f, { partition: 'lab-descargas' });
      await p.js("(function(){var u=URL.createObjectURL(new Blob(['a;b\\n1;2'],{type:'text/csv'}));"
        + "var a=document.createElement('a');a.href=u;a.download='export.csv';document.body.appendChild(a);a.click();return 1})()");
      await esperar(2000);
      const d = hechas[0] || {};
      const contenido = d.destino && fs.existsSync(d.destino) ? fs.readFileSync(d.destino, 'utf8') : null;
      medida(`L4 descarga: ${JSON.stringify(Object.assign({}, d, { destino: d.destino ? '(sandbox)' : null }))} contenido=${JSON.stringify(contenido)} violaciones=${JSON.stringify(p.csp())}`);
      ok('L4a [MEDIDO] con CSP sin blob:, un <a download> sobre blob: DESCARGA y el archivo se escribe completo',
        d.estado === 'completed' && contenido === 'a;b\n1;2', JSON.stringify(d));
      ok('L4b [MEDIDO] …sin ninguna violacion CSP (las descargas no son una carga gobernada por fetch-directives)',
        p.csp().length === 0, JSON.stringify(p.csp()));
      // Leer un blob: SÍ es una carga: fetch(blob:) cae en connect-src.
      const lee = await p.js("(async function(){try{var u=URL.createObjectURL(new Blob(['z']));await (await fetch(u)).text();return 'leido'}catch(e){return 'bloqueado'}})()");
      medida(`L4 fetch(blob:) bajo connect-src 'none': ${lee}`);
      ok("L4c [MEDIDO] fetch(blob:) SI queda bloqueado por connect-src 'none' (el producto no lo usa)", lee === 'bloqueado', lee);
      // Navegar a blob: (rama que F3 permite): no es carga de subrecurso.
      await p.js("(function(){location.href=URL.createObjectURL(new Blob(['n'],{type:'text/plain'}));return 1})()");
      await esperar(1200);
      medida(`L4 navegar a blob: bajo CSP -> url ${p.w.webContents.getURL().slice(0, 5)}`);
      ok('L4d [MEDIDO] navegar a un blob: no lo impide la CSP', /^blob:/.test(p.w.webContents.getURL()), p.w.webContents.getURL().slice(0, 30));
      p.cerrar();
    }

    // =======================================================================
    tlog('--- L5: frame / object / form / base ---');
    {
      const CSP = "default-src 'none'; script-src 'unsafe-inline'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";
      const f = escribir('l5.html', { csp: CSP, body: '<p>l5</p>' });
      const p = await abrir(f);
      const nVisitas = visitas.length;
      const inerte = u(path.join(LAB, 'inerte.html'));
      await p.js(`(function(){
        var i1=document.createElement('iframe');i1.src=${JSON.stringify(inerte)};document.body.appendChild(i1);
        var i2=document.createElement('iframe');i2.src=${JSON.stringify(H + '/frame')};document.body.appendChild(i2);
        var o=document.createElement('object');o.data=${JSON.stringify(inerte)};document.body.appendChild(o);
        var e=document.createElement('embed');e.src=${JSON.stringify(H + '/embed')};document.body.appendChild(e);
        var b=document.createElement('base');b.href=${JSON.stringify(H + '/')};document.head.appendChild(b);
        return 1})()`);
      await esperar(1200);
      const base = await p.js('document.baseURI');
      const urlAntes = p.w.webContents.getURL();
      await p.js(`(function(){var fm=document.createElement('form');fm.method='post';fm.action=${JSON.stringify(H + '/form')};document.body.appendChild(fm);fm.submit();return 1})()`);
      await esperar(1200);
      const v = p.csp();
      info('violaciones L5: ' + JSON.stringify(v.map((m) => m.slice(0, 90))));
      const hay = (re) => v.some((m) => re.test(m));
      ok("L5a [MEDIDO] frame-src 'none' bloquea iframes (file: y http)", hay(/frame-src/) && v.filter((m) => /frame-src/.test(m)).length >= 2, JSON.stringify(v));
      ok("L5b [MEDIDO] object-src 'none' bloquea <object> y <embed>", v.filter((m) => /object-src/.test(m)).length >= 2, JSON.stringify(v));
      ok("L5c [MEDIDO] base-uri 'none' ignora un <base> inyectado", hay(/base-uri/) && !String(base).startsWith(H), String(base));
      ok("L5d [MEDIDO] form-action 'none' bloquea el envio de un formulario", hay(/form-action/) && p.w.webContents.getURL() === urlAntes, p.w.webContents.getURL().slice(-30));
      ok('L5e [MEDIDO] …y el servidor local no recibio NADA de todo eso', visitas.length === nVisitas, JSON.stringify(visitas.slice(nVisitas)));
      p.cerrar();
    }

    // =======================================================================
    tlog('--- L6: LA RED, CONTRA UN SERVIDOR LOCAL QUE CUENTA ---');
    const sondaRed = `(async function(){
      var r = {};
      try { await fetch(${JSON.stringify(H + '/fetch-http')}); r.fetchHttp='permitido'; } catch(e){ r.fetchHttp='bloqueado'; }
      try { await fetch(${JSON.stringify(HS + '/fetch-https')}); r.fetchHttps='permitido'; } catch(e){ r.fetchHttps='fallo'; }
      r.xhr = await new Promise(function(res){ try{ var x=new XMLHttpRequest(); x.open('GET', ${JSON.stringify(H + '/xhr')}); x.onload=function(){res('permitido')}; x.onerror=function(){res('bloqueado')}; x.send(); }catch(e){ res('bloqueado') } });
      r.ws = await new Promise(function(res){ try{ var s=new WebSocket(${JSON.stringify(WS + '/ws')}); s.onopen=function(){res('abierto')}; s.onerror=function(){res('error')}; setTimeout(function(){res('timeout')},1500);}catch(e){ res('bloqueado') } });
      r.es = await new Promise(function(res){ try{ var s=new EventSource(${JSON.stringify(H + '/eventos')}); s.onmessage=function(){s.close();res('permitido')}; s.onerror=function(){s.close();res('error')}; setTimeout(function(){s.close();res('timeout')},1500);}catch(e){ res('bloqueado') } });
      try { r.beacon = navigator.sendBeacon(${JSON.stringify(H + '/beacon')}, 'x') ? 'encolado' : 'rechazado'; } catch(e){ r.beacon='bloqueado'; }
      r.img = await new Promise(function(res){ var i=new Image(); i.onload=function(){res('cargada')}; i.onerror=function(){res('bloqueada')}; i.src=${JSON.stringify(H + '/img.png')}; setTimeout(function(){res('timeout')},1500); });
      r.css = await new Promise(function(res){ var l=document.createElement('link'); l.rel='stylesheet'; l.href=${JSON.stringify(H + '/hoja.css')}; l.onload=function(){res('cargada')}; l.onerror=function(){res('bloqueada')}; document.head.appendChild(l); setTimeout(function(){res('timeout')},1500); });
      r.script = await new Promise(function(res){ var s=document.createElement('script'); s.src=${JSON.stringify(H + '/remoto.js')}; s.onload=function(){res('cargado')}; s.onerror=function(){res('bloqueado')}; document.head.appendChild(s); setTimeout(function(){res('timeout')},1500); });
      var d=document.createElement('div'); d.textContent='fondo'; d.style.backgroundImage='url(${H}/fondo.png)'; document.body.appendChild(d); getComputedStyle(d).backgroundImage;
      try { var ff = new FontFace('Remota', 'url(${H}/fuente.woff2)'); await ff.load(); r.fuente='cargada'; } catch(e){ r.fuente='fallo'; }
      r.media = await new Promise(function(res){ var a=document.createElement('audio'); a.src=${JSON.stringify(H + '/audio.mp3')}; a.onerror=function(){res('error')}; a.oncanplay=function(){res('cargado')}; a.load(); setTimeout(function(){res('timeout')},1500); });
      return JSON.stringify(r);
    })()`;
    const CSP_RED = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'";
    const redCon = {}; const redSin = {};
    for (const [etq, csp, dst] of [['CON CSP', CSP_RED, redCon], ['SIN CSP (control)', null, redSin]]) {
      const f = escribir(`l6-${csp ? 'con' : 'sin'}.html`, { csp });
      const p = await abrir(f);
      const v0 = visitas.length; const c0 = conexiones;
      const r = JSON.parse(await p.js(sondaRed));
      await esperar(1500);
      Object.assign(dst, r, { visitas: visitas.slice(v0), conexiones: conexiones - c0, violaciones: p.csp().length });
      medida(`L6 ${etq}: ${JSON.stringify(dst)}`);
      p.cerrar();
    }
    // Primera pasada: se exigían >= 5 CONEXIONES, pero keep-alive reutiliza
    // conexiones (13 visitas por 4 conexiones). Defecto de sonda: lo que
    // cuenta son las VISITAS; basta con que haya alguna conexión.
    ok('L6a [CONTROL] SIN CSP el servidor local SI recibe trafico (la prueba sabe detectarlo)',
      redSin.visitas.length >= 10 && redSin.conexiones >= 1, `${redSin.visitas.length} visitas / ${redSin.conexiones} conexiones`);
    ok("L6b [EXIGE] CON CSP: CERO conexiones al servidor local (fetch http/https, XHR, WS, EventSource, beacon, img, css, script, fondo, fuente, media)",
      redCon.conexiones === 0 && redCon.visitas.length === 0, JSON.stringify(redCon.visitas));
    ok('L6c [MEDIDO] CON CSP: fetch/XHR/img/css/script fallan del lado de la pagina',
      redCon.fetchHttp === 'bloqueado' && redCon.xhr === 'bloqueado' && redCon.img === 'bloqueada' && redCon.css === 'bloqueada' && redCon.script === 'bloqueado',
      JSON.stringify(redCon));
    ok('L6d [MEDIDO] …y cada bloqueo deja su violacion CSP', redCon.violaciones >= 8, String(redCon.violaciones));

    // =======================================================================
    tlog('--- L7: executeJavaScript (lo que usa main.js) BAJO LA CSP MAS ESTRICTA ---');
    {
      const f = escribir('l7.html', { csp: "default-src 'none'; base-uri 'none'; form-action 'none'" });
      const p = await abrir(f, { partition: 'lab-estricta' });
      const r = await p.js("(function(){try{localStorage.setItem('k','v');return {ok:true, leido: localStorage.getItem('k')}}catch(e){return {ok:false, e:e.name}}})()").catch((e) => ({ ok: false, e: 'ERR ' + e.message }));
      const ev = await p.js("(function(){try{new Function('return 1')();return 'permitido'}catch(e){return 'bloqueado'}})()").catch((e) => 'ERR ' + e.message);
      const inl = await p.js("(function(){var s=document.createElement('script');s.textContent='window.__iny=1';document.head.appendChild(s);return window.__iny===1?'ejecutado':'bloqueado'})()");
      medida(`L7 default-src 'none': executeJavaScript=${JSON.stringify(r)} new Function=${ev} script inline inyectado=${inl}`);
      ok("L7a [MEDIDO] con default-src 'none' (sin script-src), executeJavaScript SIGUE funcionando y ve localStorage", r.ok === true && r.leido === 'v', JSON.stringify(r));
      ok('L7b [MEDIDO] …pero lo que ese codigo intente evaluar sigue bloqueado', ev === 'bloqueado', ev);
      ok('L7c [MEDIDO] …y un <script> en linea inyectado NO se ejecuta (sin unsafe-inline, la CSP SI corta la inyeccion)', inl === 'bloqueado', inl);
      p.cerrar();
    }

    // =======================================================================
    tlog('--- L8: CONTROL DE unsafe-eval ---');
    {
      const f1 = escribir('l8-sin.html', { csp: "default-src 'none'; script-src 'self' 'unsafe-inline'" });
      const f2 = escribir('l8-con.html', { csp: "default-src 'none'; script-src 'self' 'unsafe-inline' 'unsafe-eval'" });
      const sonda = "(function(){var r={};try{new Function('return 1')();r.fn='permitido'}catch(e){r.fn='bloqueado'}"
        + "try{eval('1');r.eval='permitido'}catch(e){r.eval='bloqueado'}"
        + "try{setTimeout('void 0',0);r.timeoutTexto='sin excepcion'}catch(e){r.timeoutTexto='bloqueado'}return JSON.stringify(r)})()";
      const p1 = await abrir(f1); const r1 = JSON.parse(await p1.js(sonda)); p1.cerrar();
      const p2 = await abrir(f2); const r2 = JSON.parse(await p2.js(sonda)); p2.cerrar();
      medida(`L8 sin unsafe-eval ${JSON.stringify(r1)} | con unsafe-eval ${JSON.stringify(r2)}`);
      ok('L8a [MEDIDO] sin unsafe-eval: new Function y eval BLOQUEADOS', r1.fn === 'bloqueado' && r1.eval === 'bloqueado', JSON.stringify(r1));
      ok('L8b [CONTROL] con unsafe-eval: permitidos (la sonda distingue los dos estados)', r2.fn === 'permitido' && r2.eval === 'permitido', JSON.stringify(r2));
    }

    // =======================================================================
    tlog('--- L9: VIA CABECERA CON EL REPARTO DEL PRODUCTO; Y LOS WORKERS file: ---');
    {
      // LECTOR = la candidata del DIAGNÓSTICO (worker-src 'self'): con ella se
      // mide por qué un Worker file: es un hueco. PRODUCTO = el perfil que
      // quedó en main.js (worker-src blob:), para la salida (L9f).
      const LECTOR = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; worker-src 'self'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";
      const PRODUCTO = "default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; worker-src blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";
      const CERRADO = "default-src 'none'; form-action 'none'; base-uri 'none'";
      const ses = session.fromPartition('lab-l9');
      const vistos = [];
      // Réplica del reparto: el DOCUMENTO recibe su perfil; cualquier otra
      // respuesta file: (scripts, hojas, el script de un Worker) recibe el
      // perfil cerrado. En subrecursos normales la cabecera se ignora; en el
      // script de un Worker, ES la política del Worker.
      ses.webRequest.onHeadersReceived((d, cb) => {
        if (!/^file:/i.test(d.url)) { cb({}); return; }
        const esDoc = /l9-doc\.html$/i.test(d.url);
        const esProducto = /l9-producto\.html$/i.test(d.url);
        vistos.push(`${d.resourceType}:${path.basename(decodeURIComponent(d.url))}`);
        const h = Object.assign({}, d.responseHeaders || {});
        h['Content-Security-Policy'] = [esDoc ? LECTOR : esProducto ? PRODUCTO : CERRADO];
        cb({ responseHeaders: h });
      });
      const f = escribir('l9-doc.html', { csp: null });
      const p = await abrir(f, { partition: 'lab-l9' });
      const r = JSON.parse(await p.js(sondaPdf).catch((e) => JSON.stringify({ error: 'ERR ' + e.message })));
      await esperar(300);
      medida(`L9 pdf.js con CSP por cabecera (documento LECTOR, worker CERRADO): ${JSON.stringify(Object.assign({}, r, { violaciones: p.csp().map((m) => m.slice(0, 80)) }))}`);
      medida(`L9 respuestas file: vistas por onHeadersReceived: ${JSON.stringify(vistos)}`);
      ok('L9a [MEDIDO] por cabecera, pdf.js lee el PDF con Worker REAL aunque el script del Worker reciba el perfil CERRADO',
        r.paginas === 1 && r.modo === 'REAL' && /F2LAB/.test(r.texto || ''), JSON.stringify(r));
      ok('L9b [MEDIDO] el script del Worker PASA por onHeadersReceived (la cabecera le llega)',
        vistos.some((x) => /pdf\.worker\.min\.js/.test(x)), JSON.stringify(vistos));

      const vSale = visitas.length;
      const sale = await p.js(`new Promise(function(res){var w=new Worker(${JSON.stringify(u(path.join(LAB, 'otra', 'sale.js')))});`
        + "w.onmessage=function(e){res(e.data)};w.onerror=function(){res('error')};setTimeout(function(){res('timeout')},2500);})");
      await esperar(500);
      medida(`L9 Worker file: que intenta fetch, CSP POR CABECERA: ${sale} | visitas nuevas ${JSON.stringify(visitas.slice(vSale))}`);
      // Hipótesis previa (equivocada, se deja constancia): «por cabecera, el
      // script del Worker recibe connect-src 'none' y el Worker queda cortado».
      // Medido: la cabecera LE LLEGA (L9b) pero Chromium no la aplica a un
      // Worker file:. Por eso el producto no permite Workers file: en ninguna
      // ventana (worker-src 'none' / blob:).
      ok('L9c [MEDIDO] tampoco por cabecera: un Worker file: NO recibe la CSP y SI sale a la red',
        sale === 'permitido' && visitas.slice(vSale).some((x) => /desde-worker/.test(x)), `${sale} ${JSON.stringify(visitas.slice(vSale))}`);
      // …y la salida, con el perfil que quedó en el producto (worker-src blob:):
      // un Worker blob: SÍ hereda la CSP del documento, también cuando solo hace
      // importScripts de un file: (es el arranque de Preparación), y un Worker
      // file: directamente se deniega. Página aparte, en la misma partición.
      const pp = await abrir(escribir('l9-producto.html', { csp: null }), { partition: 'lab-l9' });
      const vBlob = visitas.length;
      const heredado = await pp.js(`(async function(){
        function probar(codigo){ return new Promise(function(res){ var w = new Worker(URL.createObjectURL(new Blob([codigo])));
          w.onmessage = function(e){ res(e.data) }; w.onerror = function(){ res('error') }; setTimeout(function(){ res('timeout') }, 2500); }); }
        var r = { propio: await probar("fetch('${H}/desde-blob').then(function(){postMessage('permitido')},function(){postMessage('bloqueado')})"),
          importado: await probar('importScripts(' + JSON.stringify(${JSON.stringify(u(path.join(LAB, 'otra', 'sale.js')))}) + ')') };
        try { new Worker(${JSON.stringify(u(path.join(LAB, 'otra', 'sale.js')))}); r.file = 'creado'; } catch (e) { r.file = 'denegado:' + e.name; }
        return JSON.stringify(r); })()`).then(JSON.parse).catch((e) => ({ error: String((e && e.message) || e) }));
      await esperar(500);
      medida(`L9 Workers con el perfil del producto (cabecera): ${JSON.stringify(heredado)} | visitas nuevas ${JSON.stringify(visitas.slice(vBlob))}`);
      ok('L9f [MEDIDO] con worker-src blob:, un Worker blob: HEREDA la CSP: sin red, con codigo propio y con importScripts(file:)',
        heredado.propio === 'bloqueado' && heredado.importado === 'bloqueado' && visitas.length === vBlob, JSON.stringify(heredado));
      ok('L9g [MEDIDO] …y un Worker file: (el que no heredaria) queda DENEGADO', /^denegado:SecurityError/.test(String(heredado.file)), String(heredado.file));
      pp.cerrar();

      // La misma prueba, con la CSP en <meta> y SIN cabecera.
      const fm = escribir('l9-meta.html', { csp: LECTOR });
      const pm = await abrir(fm);
      const vMeta = visitas.length;
      const saleMeta = await pm.js(`new Promise(function(res){var w=new Worker(${JSON.stringify(u(path.join(LAB, 'otra', 'sale.js')))});`
        + "w.onmessage=function(e){res(e.data)};w.onerror=function(){res('error')};setTimeout(function(){res('timeout')},2500);})");
      await esperar(500);
      medida(`L9 Worker file: que intenta fetch, CSP EN <meta>: ${saleMeta} | visitas nuevas ${JSON.stringify(visitas.slice(vMeta))}`);
      ok('L9d [MEDIDO] con <meta> SOLO, el Worker file: NO hereda la CSP del documento y SI sale a la red (hueco de la via meta)',
        saleMeta === 'permitido' && visitas.length > vMeta, `${saleMeta} ${JSON.stringify(visitas.slice(vMeta))}`);
      pm.cerrar();

      // Un documento blob: (la rama que F3 deja navegar) hereda la CSP.
      await p.js("(function(){location.href=URL.createObjectURL(new Blob(['<!DOCTYPE html><p>blob</p>'],{type:'text/html'}));return 1})()");
      await esperar(1200);
      const enBlob = await p.js("JSON.stringify({url: location.href.slice(0,5), fn: (function(){try{new Function('1')();return 'permitido'}catch(e){return 'bloqueado'}})()})").then(JSON.parse).catch((e) => ({ error: e.message }));
      medida(`L9 documento blob: tras navegar: ${JSON.stringify(enBlob)}`);
      ok('L9e [MEDIDO] un documento blob: navegado desde la ventana HEREDA la CSP (new Function sigue bloqueado)',
        enBlob.url === 'blob:' && enBlob.fn === 'bloqueado', JSON.stringify(enBlob));
      p.cerrar();
    }

    // =======================================================================
    tlog('--- L10: file:// DENTRO DE UN asar (la app empaquetada) ---');
    {
      const origen = path.join(SB, 'asar-origen');
      fs.mkdirSync(origen, { recursive: true });
      fs.writeFileSync(path.join(origen, 'pagina.html'), '<!DOCTYPE html><html><head><meta charset="utf-8"><script src="x.js"></script></head><body>asar</body></html>', 'utf8');
      fs.writeFileSync(path.join(origen, 'x.js'), 'window.__x = 1;', 'utf8');
      const archivo = path.join(LAB, 'app-prueba.asar');
      const asar = require(path.join(PROJ, 'node_modules', '@electron', 'asar'));
      await asar.createPackage(origen, archivo);
      const ses = session.fromPartition('lab-asar');
      const vistos = [];
      ses.webRequest.onHeadersReceived((d, cb) => {
        if (!/^file:/i.test(d.url)) { cb({}); return; }
        vistos.push(decodeURIComponent(d.url).replace(/^.*app-prueba\.asar/i, 'app.asar'));
        const h = Object.assign({}, d.responseHeaders || {});
        h['Content-Security-Policy'] = ["default-src 'none'; script-src 'self'"];
        cb({ responseHeaders: h });
      });
      const w = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true, partition: 'lab-asar' } });
      let carga = 'ok';
      try { await w.loadURL(u(archivo) + '/pagina.html'); } catch (e) { carga = e.message; }
      await esperar(400);
      const r = await w.webContents.executeJavaScript("JSON.stringify({x: window.__x === 1, cuerpo: document.body && document.body.textContent, "
        + "fn: (function(){try{new Function('1')();return 'permitido'}catch(e){return 'bloqueado'}})()})").then(JSON.parse).catch((e) => ({ error: e.message }));
      medida(`L10 asar: carga=${carga} ${JSON.stringify(r)} vistos=${JSON.stringify(vistos)}`);
      ok('L10a [MEDIDO] un documento DENTRO de un asar carga y su script relativo tambien (script-src self)',
        carga === 'ok' && r.x === true && r.cuerpo === 'asar', JSON.stringify(r));
      ok('L10b [MEDIDO] onHeadersReceived VE las respuestas del asar y la CSP por cabecera SE APLICA dentro del asar',
        vistos.some((x) => /pagina\.html$/.test(x)) && r.fn === 'bloqueado', JSON.stringify({ vistos, r }));
      w.destroy();
    }

    tlog('__LAB_TERMINADO__');
    servidor.close();
    await esperar(300);
    app.exit(0);
  } catch (e) {
    tlog('EXCEPCION EN EL LABORATORIO: ' + ((e && e.stack) || String(e)));
    app.exit(4);
  }
});
