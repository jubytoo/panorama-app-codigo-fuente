// ---------------------------------------------------------------------------
// F2 / F3 — LA SUPERFICIE DEL RENDERER, MEDIDA EN LA APP REAL.
//
// Auditoría defensiva. NO se corrige nada: se mide.
//
//   --modo=csp  ¿qué CSP aguanta el producto ACTUAL sin romperse? Se prueba una
//               CSP candidata en una página de laboratorio (en el sandbox) y se
//               mira qué pasa con: scripts en línea, estilos en línea, los
//               vendor reales, el Worker de pdf.js y las descargas por blob:.
//               La pregunta decisiva: ¿hace falta 'unsafe-eval' DE VERDAD?
//   --modo=pop  F3: qué es exactamente la ventana que abre `window.open`, qué
//               hereda y qué puede hacer. Solo destinos LOCALES e inertes.
//
// Sin red: todos los destinos son `about:blank` o archivos del sandbox.
// No se invoca ninguna API privilegiada; del puente solo se mira si ESTÁ.
// ---------------------------------------------------------------------------
const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

const arg = process.argv.find((a) => a.startsWith('--sandbox='));
if (!arg) { console.error('falta --sandbox='); process.exit(2); }
const SB = arg.slice('--sandbox='.length);
if (!/_a33-f2f3/i.test(SB)) { console.error('sandbox no marcado'); process.exit(2); }
const MODO = (process.argv.find((a) => a.startsWith('--modo=')) || '--modo=nada').slice(7);

app.setPath('appData', path.join(SB, 'Roaming'));
app.setPath('userData', path.join(SB, 'Roaming', 'panorama-app'));
const PROJDIR = 'C:/Codigo Fuente PS/panorama-app-codigo-fuente_1';
const LAB = path.join(SB, 'lab');
fs.mkdirSync(LAB, { recursive: true });

const ascii = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u00b7\u2014\u2013]/g, '-').replace(/\u2026/g, '...');
function tlog(s) { try { fs.appendFileSync(path.join(SB, 'test.log'), `[${new Date().toISOString()}] ${ascii(s)}\n`); } catch (e) {} }
function ok(n, c, extra) { tlog((c ? 'OK    ' : 'FALLO ') + n + (c ? '' : '  -- ' + (extra === undefined ? '' : extra))); }
function info(s) { tlog('      ' + s); }

dialog.showMessageBoxSync = function (a, b) { const o = (b || a) || {}; tlog('      DIALOGO: ' + o.title); return 0; };
dialog.showOpenDialogSync = function () { return null; };

require(PROJDIR + '/main.js');

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const ventanasCon = (frag) => BrowserWindow.getAllWindows().filter((x) => {
  if (x.isDestroyed()) return false;
  try { return decodeURIComponent(x.webContents.getURL()).includes(frag); } catch (e) { return false; }
});
async function esperarVentana(frag, tope = 40000, excluir) {
  const t0 = Date.now();
  for (;;) {
    const w = ventanasCon(frag).find((x) => !excluir || !excluir.has(x.id));
    if (w) return w;
    if (Date.now() - t0 > tope) return null;
    await esperar(300);
  }
}
const urlDe = (p) => 'file:///' + p.replace(/\\/g, '/');

// ---------------------------------------------------------------------------
// Material de laboratorio: un PDF mínimo REAL y un .docx mínimo REAL, para
// ejercitar de verdad pdf.js y mammoth bajo una CSP. Sin ellos, "¿hace falta
// unsafe-eval?" se quedaría en suposición.
// ---------------------------------------------------------------------------
function pdfMinimo() {
  const obj = [];
  obj[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  obj[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  obj[3] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>';
  const flujo = 'BT /F1 12 Tf 20 100 Td (F2F3) Tj ET';
  obj[4] = `<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`;
  obj[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  let pdf = '%PDF-1.4\n';
  const pos = [];
  for (let i = 1; i <= 5; i++) { pos[i] = pdf.length; pdf += `${i} 0 obj\n${obj[i]}\nendobj\n`; }
  const inicioXref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i++) pdf += String(pos[i]).padStart(10, '0') + ' 00000 n \n';
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

// ZIP con entradas ALMACENADAS (sin comprimir): lo más simple que mammoth acepta.
function zip(entradas) {
  const locales = [];
  const centrales = [];
  let desp = 0;
  for (const [nombre, contenido] of entradas) {
    const datos = Buffer.from(contenido, 'utf8');
    const nom = Buffer.from(nombre, 'utf8');
    const crc = zlib.crc32 ? zlib.crc32(datos) : 0;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(0, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(datos.length, 18); lh.writeUInt32LE(datos.length, 22);
    lh.writeUInt16LE(nom.length, 26); lh.writeUInt16LE(0, 28);
    locales.push(lh, nom, datos);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8); ch.writeUInt16LE(0, 10); ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(datos.length, 20); ch.writeUInt32LE(datos.length, 24);
    ch.writeUInt16LE(nom.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(desp, 42);
    centrales.push(ch, nom);
    desp += lh.length + nom.length + datos.length;
  }
  const cuerpo = Buffer.concat(locales);
  const central = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(entradas.length, 8);
  fin.writeUInt16LE(entradas.length, 10); fin.writeUInt32LE(central.length, 12);
  fin.writeUInt32LE(cuerpo.length, 16);
  return Buffer.concat([cuerpo, central, fin]);
}
function docxMinimo() {
  return zip([
    ['[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>ACTA DE PRUEBA F2F3</w:t></w:r></w:p></w:body></w:document>'],
  ]);
}

// Página de laboratorio con la CSP candidata: mismas dependencias que el
// producto (script en línea, estilo en línea, vendor por file://).
function paginaLab(csp, nombre) {
  const v = (f) => urlDe(path.join(PROJDIR.replace(/\//g, '\\'), 'vendor', f));
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>body{background:#111;color:#eee}</style>
</head><body>
<div id="x" style="padding:4px">lab</div>
<script src="${v('theme.js')}"></script>
<script src="${v('xlsx.full.min.js')}"></script>
<script>
  window.__lab = { inlineScript: true, resultados: {} };
  window.__violaciones = [];
  document.addEventListener('securitypolicyviolation', function (e) {
    window.__violaciones.push({ directiva: e.violatedDirective, recurso: String(e.blockedURI).slice(0, 60) });
  });
</script>
</body></html>`;
  const destino = path.join(LAB, nombre);
  fs.writeFileSync(destino, html, 'utf8');
  return destino;
}

app.whenReady().then(async () => {
  if (MODO === 'nada') return;
  try {
    const lanzador = await esperarVentana('launcher/index.html');
    if (!lanzador) { tlog('ERROR: no aparecio el lanzador'); app.exit(3); return; }
    await esperar(1500);

    // =====================================================================
    if (MODO === 'csp') {
      tlog('--- F2: QUE CSP AGUANTA EL PRODUCTO ACTUAL ---');
      // Candidata: la que propone la auditoría, con 'unsafe-inline' porque las
      // plantillas dependen de ello, y SIN 'unsafe-eval' a propósito.
      const CSP = "default-src 'none'; script-src 'self' 'unsafe-inline' file:; "
        + "style-src 'self' 'unsafe-inline' file:; img-src 'self' data: file:; "
        + "font-src 'self' file:; connect-src 'none'; form-action 'none'; "
        + "frame-src 'none'; object-src 'none'; worker-src 'self' file:; base-uri 'none'";
      info('CSP candidata: ' + CSP);
      const pagina = paginaLab(CSP, 'lab-csp.html');
      const w = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
      await w.loadURL(urlDe(pagina));
      await esperar(1200);

      // 1) Lo básico del producto: script en línea, estilo en línea, vendor.
      const base = await w.webContents.executeJavaScript(
        "JSON.stringify({inline: !!(window.__lab && window.__lab.inlineScript), "
        + "estilo: getComputedStyle(document.body).backgroundColor, "
        + "theme: (function(){try{return typeof THEMES}catch(e){return 'undefined'}})(), "
        + "xlsx: typeof window.XLSX})").then(JSON.parse).catch((e) => ({ error: e.message }));
      info('base: ' + JSON.stringify(base));
      ok('F2-CSP1 con unsafe-inline, los <script> EN LÍNEA del producto siguen ejecutando', base.inline === true, JSON.stringify(base));
      ok('F2-CSP2 …y los estilos en línea siguen aplicando', /rgb\(17, 17, 17\)/.test(String(base.estilo)), String(base.estilo));
      ok('F2-CSP3 …y los vendor por file:// cargan (theme.js, xlsx)', base.theme === 'object' && base.xlsx === 'object', JSON.stringify(base));

      // 2) LA PREGUNTA DECISIVA: ¿hace falta 'unsafe-eval'?
      const evalBloqueado = await w.webContents.executeJavaScript(
        "(function(){try{ new Function('return 1')(); return 'permitido'; }catch(e){ return 'bloqueado: '+e.name; }})()")
        .catch((e) => 'ERR ' + e.message);
      info('new Function bajo la CSP: ' + evalBloqueado);
      ok('F2-CSP4 sin unsafe-eval, `new Function` queda BLOQUEADO (control de que la CSP actúa)',
        /^bloqueado/.test(String(evalBloqueado)), String(evalBloqueado));

      // 3) ¿Lo necesitan de verdad mammoth y pdf.js? Se ejercitan con material
      //    REAL (un .docx y un .pdf mínimos construidos aquí).
      const bytesPdf = pdfMinimo();
      const bytesDocx = docxMinimo();
      fs.writeFileSync(path.join(LAB, 'acta.pdf'), bytesPdf);
      fs.writeFileSync(path.join(LAB, 'acta.docx'), bytesDocx);
      const cargar = (f) => `new Promise(function(res){var s=document.createElement('script');s.src=${JSON.stringify(urlDe(path.join(PROJDIR.replace(/\//g, '\\'), 'vendor', f)))};s.onload=function(){res('ok')};s.onerror=function(){res('error')};document.head.appendChild(s);})`;
      // Los bytes se entregan YA en memoria, igual que hace el producto:
      // Preparación lee el acta con `file.arrayBuffer()` desde un <input
      // type=file>, NO con fetch. Cargarlos aquí con fetch habría medido mi
      // propia `connect-src 'none'`, no la librería.
      const aBuffer = (b64) => `(function(){var s=atob(${JSON.stringify(b64)});var u=new Uint8Array(s.length);`
        + `for(var i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u.buffer;})()`;

      const mam = await w.webContents.executeJavaScript(`(async function(){
        var carga = await ${cargar('mammoth.browser.min.js')};
        if (carga !== 'ok') return JSON.stringify({carga: carga});
        try {
          var buf = ${aBuffer(bytesDocx.toString('base64'))};
          var out = await window.mammoth.extractRawText({ arrayBuffer: buf });
          return JSON.stringify({carga: 'ok', texto: (out.value||'').trim().slice(0,40), error: null});
        } catch (e) { return JSON.stringify({carga: 'ok', texto: null, error: e.name + ': ' + String(e.message).slice(0,90)}); }
      })()`).then(JSON.parse).catch((e) => ({ error: 'ERR ' + e.message }));
      info('mammoth bajo CSP: ' + JSON.stringify(mam));
      ok('F2-CSP5 [DECISIVO] mammoth lee un .docx real SIN unsafe-eval',
        mam.texto && mam.texto.includes('ACTA DE PRUEBA'), JSON.stringify(mam));

      const pdf = await w.webContents.executeJavaScript(`(async function(){
        var carga = await ${cargar('pdf.min.js')};
        if (carga !== 'ok') return JSON.stringify({carga: carga});
        try {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = ${JSON.stringify(urlDe(path.join(PROJDIR.replace(/\//g, '\\'), 'vendor', 'pdf.worker.min.js')))};
          var buf = ${aBuffer(bytesPdf.toString('base64'))};
          var doc = await window.pdfjsLib.getDocument({ data: buf }).promise;
          var pag = await doc.getPage(1);
          var tc = await pag.getTextContent();
          return JSON.stringify({carga:'ok', paginas: doc.numPages, texto: tc.items.map(function(i){return i.str}).join('').slice(0,40), error: null});
        } catch (e) { return JSON.stringify({carga:'ok', paginas: null, error: e.name + ': ' + String(e.message).slice(0,90)}); }
      })()`).then(JSON.parse).catch((e) => ({ error: 'ERR ' + e.message }));
      info('pdf.js bajo CSP: ' + JSON.stringify(pdf));
      ok('F2-CSP6 [DECISIVO] pdf.js abre un .pdf real (y su Worker arranca) SIN unsafe-eval',
        pdf.paginas === 1, JSON.stringify(pdf));

      // 4) Descarga por blob: (lo usan 4 ventanas para exportar).
      const blob = await w.webContents.executeJavaScript(
        "(function(){try{var u=URL.createObjectURL(new Blob(['x'],{type:'text/plain'}));"
        + "var a=document.createElement('a');a.href=u;a.download='x.txt';document.body.appendChild(a);"
        + "return 'creado:'+u.slice(0,5);}catch(e){return 'error: '+e.message}})()").catch((e) => 'ERR ' + e.message);
      info('blob: ' + blob);
      ok('F2-CSP7 crear un blob: para descargar sigue funcionando bajo la CSP', /^creado:blob/.test(String(blob)), String(blob));

      // 5) Lo que la CSP SÍ corta: la salida a la red.
      const red = await w.webContents.executeJavaScript(
        "(async function(){try{ await fetch('https://example.invalid/x'); return 'permitido'; }"
        + "catch(e){ return 'bloqueado: ' + e.name; }})()").catch((e) => 'ERR ' + e.message);
      info('fetch externo: ' + red);
      ok('F2-CSP8 [LO QUE APORTA] con connect-src none, la salida a la red queda cortada',
        /^bloqueado/.test(String(red)), String(red));
      const img = await w.webContents.executeJavaScript(
        "(function(){return new Promise(function(res){var i=new Image();"
        + "i.onload=function(){res('cargada')};i.onerror=function(){res('bloqueada')};"
        + "i.src='https://example.invalid/x.png';setTimeout(function(){res('timeout')},2500);})})()").catch((e) => 'ERR ' + e.message);
      info('img externa: ' + img);
      ok('F2-CSP9 …y una imagen externa tampoco carga (img-src acotado)', String(img) !== 'cargada', String(img));

      const violaciones = await w.webContents.executeJavaScript('JSON.stringify(window.__violaciones||[])').then(JSON.parse).catch(() => []);
      info('violaciones registradas: ' + JSON.stringify(violaciones.slice(0, 8)));
      tlog('__MODO_TERMINADO__ csp');
      await esperar(600);
      app.exit(0);
      return;
    }

    // =====================================================================
    if (MODO === 'pop') {
      tlog('--- F3: LA SUPERFICIE DE APERTURA DE VENTANAS ---');
      const row = await lanzador.webContents.executeJavaScript(
        "window.launcherAPI.createProject('Proyecto F2F3','','2026-01-01',null)");
      await lanzador.webContents.executeJavaScript(`window.launcherAPI.openProject(${row.id})`);
      const v = await esperarVentana(`projects/${row.id}/dashboard.html`);
      ok('F3-P0 el dashboard abre', !!v);
      await esperar(3000);

      const ficha = async (w, nombre) => {
        const wp = (() => { try { return w.webContents.getLastWebPreferences() || {}; } catch (e) { return {}; } })();
        let mundo = {};
        try {
          mundo = JSON.parse(await w.webContents.executeJavaScript(
            "JSON.stringify({bridge: typeof window.panoramaBridge, "
            + "metodos: window.panoramaBridge ? Object.keys(window.panoramaBridge).length : 0, "
            + "require: typeof require, process: typeof process, "
            + "opener: (function(){try{return window.opener ? 'presente' : 'null'}catch(e){return 'inaccesible'}})(), "
            + "csp: !!document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]')})"));
        } catch (e) { mundo = { error: String(e.message).slice(0, 60) }; }
        const f = { ventana: nombre, id: w.webContents.id,
          padre: (() => { try { const p = w.getParentWindow(); return p ? p.webContents.id : null; } catch (e) { return null; } })(),
          url: w.webContents.getURL(), titulo: w.getTitle(),
          contextIsolation: wp.contextIsolation, nodeIntegration: wp.nodeIntegration, sandbox: wp.sandbox,
          mundo };
        info('ficha ' + JSON.stringify(Object.assign({}, f, { url: String(f.url).slice(0, 70) })));
        return f;
      };

      // 1) about:blank — la "ventana negra" de los arneses.
      const antes = new Set(BrowserWindow.getAllWindows().map((x) => x.id));
      await v.webContents.executeJavaScript("window.open('about:blank','_blank')").catch(() => {});
      await esperar(1500);
      const hija = BrowserWindow.getAllWindows().find((x) => !antes.has(x.id) && !x.isDestroyed());
      ok('F3-P1 [REPRODUCIDO] window.open SÍ crea una BrowserWindow nueva: no hay setWindowOpenHandler', !!hija);
      let fBlank = null;
      if (hija) {
        fBlank = await ficha(hija, 'about:blank');
        ok('F3-P2 esa ventana es la "ventana negra": título "Electron" y url about:blank',
          /^electron$/i.test(fBlank.titulo) && /^about:blank/.test(fBlank.url), JSON.stringify({ t: fBlank.titulo, u: fBlank.url }));
        ok('F3-P3 [BARRERA] NO hereda el puente: panoramaBridge ausente',
          fBlank.mundo.bridge === 'undefined' && fBlank.mundo.metodos === 0, JSON.stringify(fBlank.mundo));
        ok('F3-P4 [BARRERA] tampoco hay Node: require y process ausentes',
          fBlank.mundo.require === 'undefined' && fBlank.mundo.process === 'undefined', JSON.stringify(fBlank.mundo));
        ok('F3-P5 [BARRERA] hereda contextIsolation y sandbox del padre',
          fBlank.contextIsolation === true && fBlank.sandbox === true && fBlank.nodeIntegration !== true,
          JSON.stringify({ ci: fBlank.contextIsolation, sb: fBlank.sandbox, ni: fBlank.nodeIntegration }));
        ok('F3-P6 y tampoco tiene CSP (F2 alcanza también a las ventanas hijas)', fBlank.mundo.csp === false);
      }

      // 2) ¿Mantiene el opener y puede hablar con la principal?
      if (hija) {
        const enlace = await v.webContents.executeJavaScript(
          "(function(){try{var w=window.open('about:blank','_blank');"
          + "if(!w) return 'sin-referencia';"
          + "w.__marcaDelPadre = 'F2F3';"
          + "return 'escribe-en-la-hija:' + (w.__marcaDelPadre === 'F2F3');}catch(e){return 'error: '+e.message}})()")
          .catch((e) => 'ERR ' + e.message);
        info('opener/acceso: ' + enlace);
        ok('F3-P7 el padre conserva la referencia a la hija y puede escribir en ella (mismo origen)',
          /escribe-en-la-hija:true/.test(String(enlace)), String(enlace));
      }

      // 3) Navegación de la hija a un archivo LOCAL inerte: ¿la deja Electron?
      //    (Sin red: un .html del sandbox.)
      const inerte = path.join(LAB, 'inerte.html');
      fs.writeFileSync(inerte, '<!DOCTYPE html><title>inerte</title><body>pagina local inerte</body>', 'utf8');
      const antes2 = new Set(BrowserWindow.getAllWindows().map((x) => x.id));
      await v.webContents.executeJavaScript(`window.open(${JSON.stringify(urlDe(inerte))},'_blank')`).catch(() => {});
      await esperar(2000);
      const hija2 = BrowserWindow.getAllWindows().find((x) => !antes2.has(x.id) && !x.isDestroyed());
      ok('F3-P8 [REPRODUCIDO] window.open a un file:// LOCAL también abre ventana, sin ninguna guardia', !!hija2);
      if (hija2) {
        const f2 = await ficha(hija2, 'file:// local');
        ok('F3-P9 esa ventana carga el contenido local y tampoco recibe el puente',
          /inerte\.html/.test(f2.url) && f2.mundo.bridge === 'undefined', JSON.stringify({ u: f2.url, b: f2.mundo.bridge }));
        ok('F3-P10 …y toma el título de la PÁGINA, no el genérico de Electron',
          f2.titulo === 'inerte', f2.titulo);
      }

      // 4) El único target="_blank" del producto: el enlace de un entregable.
      //    Se comprueba que el clic REAL abre ventana (con un destino local).
      const antes3 = new Set(BrowserWindow.getAllWindows().map((x) => x.id));
      const clic = await v.webContents.executeJavaScript(
        `(function(){var a=document.createElement('a');a.href=${JSON.stringify(urlDe(inerte))};`
        + "a.target='_blank';a.rel='noopener';a.textContent='x';document.body.appendChild(a);a.click();return 'clic'})()")
        .catch((e) => 'ERR ' + e.message);
      await esperar(2000);
      const hija3 = BrowserWindow.getAllWindows().find((x) => !antes3.has(x.id) && !x.isDestroyed());
      info('clic en <a target=_blank>: ' + clic);
      ok('F3-P11 [REPRODUCIDO] un <a target="_blank"> abre la ventana DENTRO de la app, no en el navegador',
        !!hija3, String(clic));
      if (hija3) {
        const f3 = await ficha(hija3, 'a target=_blank');
        ok('F3-P12 con rel="noopener", la hija no conserva opener',
          f3.mundo.opener === 'null' || f3.mundo.opener === 'inaccesible', String(f3.mundo.opener));
      }

      // 5) Inventario final de ventanas.
      const inv = BrowserWindow.getAllWindows().filter((x) => !x.isDestroyed()).map((x) => ({
        id: x.webContents.id, titulo: x.getTitle(), url: x.webContents.getURL().slice(0, 50),
      }));
      info('ventanas abiertas al final: ' + JSON.stringify(inv));
      ok('F3-P13 se han quedado abiertas varias ventanas sin guardián (3 hijas + las productivas)',
        inv.length >= 5, String(inv.length));
      tlog('__MODO_TERMINADO__ pop');
      await esperar(800);
      app.exit(0);
      return;
    }
  } catch (e) {
    tlog('EXCEPCION EN EL ARNES: ' + ((e && e.stack) || String(e)));
    app.exit(4);
  }
});
