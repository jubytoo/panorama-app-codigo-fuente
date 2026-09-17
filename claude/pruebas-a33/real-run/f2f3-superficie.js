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
const electron = require('electron');
const { app, BrowserWindow, dialog } = electron;
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

// F3 — ESPÍA sobre shell.openExternal, instalado ANTES de cargar main.js.
// Así se comprueba a qué URL se manda el navegador del sistema SIN abrir nada
// de verdad: no se llama al original, se anota y se devuelve una promesa.
const externas = [];
const abrirOriginal = electron.shell.openExternal;
electron.shell.openExternal = function (url) {
  externas.push(String(url));
  return Promise.resolve();
};
const restaurarShell = () => { electron.shell.openExternal = abrirOriginal; };

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

// F2F3_MAIN permite arrancar la app real contra un `main.js` REVERTIDO, para
// demostrar en Electron que sin la política vuelven a abrirse las ventanas.
require(process.env.F2F3_MAIN || (PROJDIR + '/main.js'));

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
      // F2 (17 sept 2026) — desde que main.js entrega la CSP por cabecera, esta
      // página de laboratorio es un documento file:// AJENO al producto y recibe
      // el perfil CERRADO: se deja constancia (es la propiedad que F2 exige)…
      {
        const wc = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
        await wc.loadURL(urlDe(pagina));
        await esperar(800);
        const cerrada = await wc.webContents.executeJavaScript(
          "JSON.stringify({inline: !!(window.__lab && window.__lab.inlineScript), theme: (function(){try{return typeof THEMES}catch(e){return 'undefined'}})()})")
          .then(JSON.parse).catch((e) => ({ error: e.message }));
        info('pagina de laboratorio SIN aislar: ' + JSON.stringify(cerrada));
        ok('F2-CSP0 [DESDE F2] un documento file:// ajeno al producto recibe la politica CERRADA (ni su script en linea ni el vendor)',
          cerrada.inline === false && cerrada.theme === 'undefined', JSON.stringify(cerrada));
        wc.destroy();
      }
      // …y la candidata se sigue midiendo AISLADA, como en el diagnóstico: una
      // partición propia a la que se le quita el oyente de main.js (solo aquí).
      const { session } = electron;
      session.fromPartition('f2f3-lab-aislado').webRequest.onHeadersReceived(null);
      const w = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, partition: 'f2f3-lab-aislado' } });
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
    // REVERSIÓN en Electron: en vez de arrancar contra un main.js revertido
    // (que no puede resolver sus require relativos fuera del proyecto), se
    // DESACTIVA la política en caliente sobre la ventana — exactamente el
    // estado de antes de F3— y se comprueba que el defecto reaparece.
    if (MODO === 'rev') {
      tlog('--- F3 REVERSION: SIN POLITICA, VUELVEN LAS VENTANAS ---');
      const row = await lanzador.webContents.executeJavaScript(
        "window.launcherAPI.createProject('Proyecto F3rev','','2026-01-01',null)");
      await lanzador.webContents.executeJavaScript(`window.launcherAPI.openProject(${row.id})`);
      const v = await esperarVentana(`projects/${row.id}/dashboard.html`);
      if (!v) { ok('F3-REV el dashboard abre', false); app.exit(3); return; }
      await esperar(3000);
      // Esto es la reversión: se quita la denegación.
      v.webContents.setWindowOpenHandler(() => ({ action: 'allow' }));
      const inerte = path.join(LAB, 'inerte.html');
      fs.writeFileSync(inerte, '<!DOCTYPE html><title>inerte</title><body>x</body>', 'utf8');

      const abrir = async (destino, comoEnlace) => {
        const antes = new Set(BrowserWindow.getAllWindows().map((x) => x.id));
        const js = comoEnlace
          ? `(function(){var a=document.createElement('a');a.href=${JSON.stringify(destino)};`
            + "a.target='_blank';a.rel='noopener';a.textContent='x';document.body.appendChild(a);a.click();return 'clic'})()"
          : `window.open(${JSON.stringify(destino)},'_blank')`;
        await v.webContents.executeJavaScript(js).catch(() => {});
        await esperar(1500);
        const nuevas = BrowserWindow.getAllWindows().filter((x) => !antes.has(x.id) && !x.isDestroyed());
        return nuevas;
      };

      const n1 = await abrir('about:blank', false);
      ok('F3-REV1 sin política, `about:blank` VUELVE a crear una BrowserWindow (la "ventana negra")',
        n1.length === 1 && /^electron$/i.test(n1[0].getTitle()),
        JSON.stringify(n1.map((x) => ({ t: x.getTitle(), u: x.webContents.getURL().slice(0, 30) }))));
      for (const x of n1) { try { x.destroy(); } catch (e) {} }

      const n2 = await abrir(urlDe(inerte), false);
      ok('F3-REV2 sin política, un `file://` VUELVE a crear una BrowserWindow',
        n2.length === 1, String(n2.length));
      for (const x of n2) { try { x.destroy(); } catch (e) {} }

      const nExt = externas.length;
      const n3 = await abrir('https://ejemplo.test/entregable.pdf', true);
      ok('F3-REV3 sin política, un `<a target="_blank">` VUELVE a abrir DENTRO de la app',
        n3.length === 1, String(n3.length));
      ok('F3-REV3b …y NO sale al navegador del sistema',
        externas.length === nExt, JSON.stringify(externas.slice(nExt)));
      for (const x of n3) { try { x.destroy(); } catch (e) {} }

      restaurarShell();
      tlog('__MODO_TERMINADO__ rev');
      await esperar(800);
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

      const inerte = path.join(LAB, 'inerte.html');
      fs.writeFileSync(inerte, '<!DOCTYPE html><title>inerte</title><body>pagina local inerte</body>', 'utf8');

      // Abre `destino` desde la ventana `w` y devuelve qué pasó: cuántas
      // ventanas nuevas y a qué URL se mandó el navegador del sistema.
      async function intentarAbrir(w, destino, comoEnlace) {
        const antes = new Set(BrowserWindow.getAllWindows().map((x) => x.id));
        const nExternas = externas.length;
        const js = comoEnlace
          ? `(function(){var a=document.createElement('a');a.href=${JSON.stringify(destino)};`
            + "a.target='_blank';a.rel='noopener';a.textContent='x';document.body.appendChild(a);a.click();return 'clic'})()"
          : `(function(){try{var r=window.open(${JSON.stringify(destino)},'_blank');return r?'con-referencia':'null'}catch(e){return 'error: '+e.message}})()`;
        const r = await w.webContents.executeJavaScript(js).catch((e) => 'ERR ' + e.message);
        await esperar(1400);
        const nuevas = BrowserWindow.getAllWindows().filter((x) => !antes.has(x.id) && !x.isDestroyed());
        return { r, nuevas, externas: externas.slice(nExternas) };
      }

      // --- F3-1..F3-5 y F3-8: todo lo que NO es http(s) se deniega ---------
      const DENEGAR = [
        ['F3-1', 'about:blank'],
        ['F3-2', urlDe(inerte)],
        ['F3-3', 'data:text/html,<b>x</b>'],
        ['F3-4', "javascript:void(document.title='tocado')"],
        ['F3-5', 'inventado://algo/x'],
        ['F3-8', 'http://'],
      ];
      for (const [id, destino] of DENEGAR) {
        const res = await intentarAbrir(v, destino, false);
        info(`${id} ${destino.slice(0, 46)} -> ventanas:${res.nuevas.length} externas:${JSON.stringify(res.externas)}`);
        ok(`${id} [EXIGE] ${destino.slice(0, 40)}: 0 ventanas nuevas`,
          res.nuevas.length === 0, `${res.nuevas.length} — ${res.r}`);
        ok(`${id} [EXIGE] …y no se manda al navegador del sistema`,
          res.externas.length === 0, JSON.stringify(res.externas));
        for (const x of res.nuevas) { try { x.destroy(); } catch (e) {} }
      }
      // El javascript: no debe haber tocado nada de la página.
      const titulo = await v.webContents.executeJavaScript('document.title').catch(() => '');
      ok('F3-4b el `javascript:` denegado no ha ejecutado nada en la página', !/tocado/.test(String(titulo)), String(titulo));

      // --- F3-6 y F3-7: http(s) válidos salen al navegador, sin ventana -----
      for (const [id, destino] of [['F3-6', 'http://ejemplo.test/ruta'], ['F3-7', 'https://ejemplo.test/ruta?q=1']]) {
        const res = await intentarAbrir(v, destino, false);
        info(`${id} ${destino} -> ventanas:${res.nuevas.length} externas:${JSON.stringify(res.externas)}`);
        ok(`${id} [EXIGE] ${destino}: BrowserWindow DENEGADA`, res.nuevas.length === 0, String(res.nuevas.length));
        ok(`${id} [EXIGE] …y shell.openExternal recibe esa URL exactamente UNA vez`,
          res.externas.length === 1 && res.externas[0] === destino, JSON.stringify(res.externas));
        for (const x of res.nuevas) { try { x.destroy(); } catch (e) {} }
      }

      // --- El enlace legítimo del producto: <a target="_blank"> https -------
      const enlace = await intentarAbrir(v, 'https://ejemplo.test/entregable.pdf', true);
      info('enlace entregable -> ventanas:' + enlace.nuevas.length + ' externas:' + JSON.stringify(enlace.externas));
      ok('F3-E1 [EXIGE] el enlace de un entregable NO abre ventana dentro de la app',
        enlace.nuevas.length === 0, String(enlace.nuevas.length));
      ok('F3-E2 [EXIGE] …sale al navegador del sistema con su URL',
        enlace.externas.length === 1 && enlace.externas[0] === 'https://ejemplo.test/entregable.pdf',
        JSON.stringify(enlace.externas));
      for (const x of enlace.nuevas) { try { x.destroy(); } catch (e) {} }

      // --- F3-9: navegación externa por will-navigate ----------------------
      const nExt = externas.length;
      const urlAntes = v.webContents.getURL();
      await v.webContents.executeJavaScript("location.href='https://ejemplo.test/navegar'").catch(() => {});
      await esperar(1800);
      const urlDespues = v.webContents.getURL();
      info(`F3-9 url antes/despues iguales: ${urlAntes === urlDespues} | externas: ${JSON.stringify(externas.slice(nExt))}`);
      ok('F3-9 [EXIGE] una navegación externa NO se realiza dentro de Electron',
        urlAntes === urlDespues, `${urlAntes.slice(-40)} -> ${urlDespues.slice(-40)}`);
      ok('F3-9b …y se manda al navegador del sistema',
        externas.slice(nExt).length === 1 && externas[nExt] === 'https://ejemplo.test/navegar',
        JSON.stringify(externas.slice(nExt)));

      // --- F3-10: la navegación interna LEGÍTIMA sigue funcionando ---------
      // Lo único que el producto usa: recarga y descargas por blob:.
      const marca = await v.webContents.executeJavaScript(
        "(function(){window.__antesDeRecargar = true; return 'marcado'})()").catch((e) => 'ERR ' + e.message);
      await v.webContents.executeJavaScript('location.reload()').catch(() => {});
      await esperar(3000);
      const trasRecarga = await v.webContents.executeJavaScript(
        "JSON.stringify({url: location.href.slice(-30), marca: !!window.__antesDeRecargar, "
        + "hitos: !!document.getElementById('milestone-list')})").then(JSON.parse).catch((e) => ({ error: e.message }));
      info('F3-10 tras recargar: ' + JSON.stringify(trasRecarga) + ' (marca previa: ' + marca + ')');
      ok('F3-10 [EXIGE] location.reload() sigue funcionando (la guardia no lo bloquea)',
        !trasRecarga.error && trasRecarga.marca === false && trasRecarga.hitos === true, JSON.stringify(trasRecarga));
      // --- Inventario final: ni una ventana genérica ------------------------
      const inv = BrowserWindow.getAllWindows().filter((x) => !x.isDestroyed()).map((x) => ({
        id: x.webContents.id, titulo: x.getTitle(), url: x.webContents.getURL().slice(0, 44),
      }));
      info('ventanas al final: ' + JSON.stringify(inv));
      ok('F3-P13 [EXIGE] no queda NINGUNA ventana titulada "Electron" ni sin contenido',
        !inv.some((x) => /^electron$/i.test(x.titulo) || !x.url), JSON.stringify(inv));
      ok('F3-P14 [EXIGE] solo siguen abiertas las ventanas productivas',
        inv.length === 2, JSON.stringify(inv.map((x) => x.titulo)));

      // --- F3-10b: la rama `blob:` de la guardia, ejercitada de verdad ------
      // Las exportaciones del producto usan `blob:` con <a download>. Aquí NO
      // se descarga (el diálogo nativo de "Guardar como" bloquearía el arnés):
      // se NAVEGA a un blob:, que recorre exactamente la misma rama permitida
      // de `navegacionInternaLegitima`. Va al final porque cambia la página.
      const urlPrevia = v.webContents.getURL();
      const navBlob = await v.webContents.executeJavaScript(
        "(function(){try{var u=URL.createObjectURL(new Blob(['a,b'],{type:'text/plain'}));"
        + "location.href = u; return 'navegando:'+u.slice(0,5);}catch(e){return 'error: '+e.message}})()")
        .catch((e) => 'ERR ' + e.message);
      await esperar(2000);
      const urlBlob = v.webContents.getURL();
      info('F3-10b ' + navBlob + ' | url ahora: ' + urlBlob.slice(0, 24));
      ok('F3-10b [EXIGE] la guardia PERMITE `blob:` (es como exportan las ventanas)',
        /^blob:/.test(urlBlob) && urlBlob !== urlPrevia, `${navBlob} -> ${urlBlob.slice(0, 40)}`);
      restaurarShell();
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
