// ---------------------------------------------------------------------------
// P17 — LOS ASSETS DEL HORNEADO, EN LA APP REAL (sandbox artificial).
//
// Abre el dashboard horneado y el Directorio horneado y comprueba que NO queda
// ningún recurso roto: los DOS iconos (pantalla de carga y barra de título),
// las hojas de estilo y los scripts de vendor. Antes de P17, el icono de la
// barra de título salía roto en las dos ventanas.
//
// Sin red, sin datos productivos, sin acciones destructivas.
// ---------------------------------------------------------------------------
const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const arg = process.argv.find((a) => a.startsWith('--sandbox='));
if (!arg) { console.error('falta --sandbox='); process.exit(2); }
const SB = arg.slice('--sandbox='.length);
if (!/_a33-p17/i.test(SB)) { console.error('sandbox no marcado'); process.exit(2); }
const CAPTURAS = process.env.P17_CAPTURAS || path.join(SB, 'capturas');
fs.mkdirSync(CAPTURAS, { recursive: true });

app.setPath('appData', path.join(SB, 'Roaming'));
app.setPath('userData', path.join(SB, 'Roaming', 'panorama-app'));
const UD = path.join(SB, 'Roaming', 'panorama-app');
const PROJDIR = 'C:/Codigo Fuente PS/panorama-app-codigo-fuente_1';

const ascii = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u00b7\u2014\u2013]/g, '-').replace(/\u2026/g, '...');
function tlog(s) { try { fs.appendFileSync(path.join(SB, 'test.log'), `[${new Date().toISOString()}] ${ascii(s)}\n`); } catch (e) {} }
function ok(n, c, extra) { tlog((c ? 'OK    ' : 'FALLO ') + n + (c ? '' : '  -- ' + (extra === undefined ? '' : extra))); }
function info(s) { tlog('      ' + s); }

dialog.showMessageBoxSync = function (a, b) { const o = (b || a) || {}; tlog('      DIALOGO: ' + o.title); return 0; };
dialog.showOpenDialogSync = function () { return null; };

require(PROJDIR + '/main.js');
const dbmod = require(PROJDIR + '/db.js');

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
async function captura(w, nombre) {
  try { fs.writeFileSync(path.join(CAPTURAS, nombre + '.png'), (await w.webContents.capturePage()).toPNG()); info('captura: ' + nombre + '.png'); }
  catch (e) { info('captura ' + nombre + ': ' + e.message); }
}

// Estado de TODOS los recursos de la página: imágenes, hojas y scripts.
const RECURSOS = `(function(){
  // Solo cuentan las <img> que PIDEN un recurso. El Directorio tiene un
  // <img id="corp-logo-img"> declarado SIN src (placeholder oculto hasta que
  // hay logo): no es un recurso roto, es un hueco a propósito.
  var imgs = Array.prototype.filter.call(document.images, function(x){
    return (x.getAttribute('src')||'') !== '';
  }).map(function(x){
    return { src: (x.getAttribute('src')||'').slice(0,60), rota: !!(x.complete && x.naturalWidth === 0) };
  });
  var hojas = Array.prototype.map.call(document.querySelectorAll('link[rel=stylesheet]'), function(l){
    var cargada = false;
    try { cargada = !!(l.sheet && l.sheet.cssRules); } catch (e) { cargada = !!l.sheet; }
    return { href: (l.getAttribute('href')||'').slice(0,60), cargada: cargada };
  });
  return JSON.stringify({
    imgs: imgs,
    imgsRotas: imgs.filter(function(i){ return i.rota; }).length,
    hojas: hojas,
    hojasSinCargar: hojas.filter(function(h){ return !h.cargada; }).length,
    // Rutas relativas que hayan sobrevivido al horneado.
    relativos: (document.documentElement.innerHTML.match(/(?:src|href)="\\.\\.\\/(?:vendor|assets)\\//g) || []).length,
    // Los scripts de vendor tienen que haber definido lo suyo. OJO: theme.js
    // declara \`const THEMES\`, que es un global de script pero NO una propiedad
    // de window — hay que mirarlo como identificador, no como window.THEMES.
    theme: (function(){ try { return typeof THEMES; } catch (e) { return 'undefined'; } })(),
    modal: typeof window.psConfirm, xlsx: typeof window.XLSX
  });
})()`;

async function revisar(w, nombre) {
  const r = await w.webContents.executeJavaScript(RECURSOS).then(JSON.parse).catch((e) => ({ error: e.message }));
  if (r.error) { ok(`P17-R ${nombre}: se puede leer la ventana`, false, r.error); return; }
  info(nombre + ': ' + JSON.stringify({ imgs: r.imgs, hojasSinCargar: r.hojasSinCargar, relativos: r.relativos, theme: r.theme, modal: r.modal, xlsx: r.xlsx }));
  // En marcha queda 1 <img> con src: la de la barra de título. La de
  // #boot-loading se retira al terminar de arrancar. Que las DOS del archivo
  // quedan resueltas lo comprueba P17-R2 sobre el HTML horneado.
  ok(`P17-R ${nombre}: cero imágenes rotas (antes de P17, la de la barra de título lo estaba)`,
    r.imgsRotas === 0 && r.imgs.length >= 1, JSON.stringify(r.imgs));
  ok(`P17-R ${nombre}: los iconos apuntan a una ruta ABSOLUTA, no a "../assets/"`,
    r.imgs.every((i) => !i.src.startsWith('../')), JSON.stringify(r.imgs.map((i) => i.src)));
  ok(`P17-R ${nombre}: ninguna hoja de estilo se queda sin cargar`, r.hojasSinCargar === 0, JSON.stringify(r.hojas));
  ok(`P17-R ${nombre}: no sobrevive ninguna ruta relativa de vendor/assets`, r.relativos === 0, String(r.relativos));
  ok(`P17-R ${nombre}: los scripts de vendor han cargado (theme y modal definidos)`,
    r.theme === 'object' && r.modal === 'function', JSON.stringify({ theme: r.theme, modal: r.modal }));
}

app.whenReady().then(async () => {
  try {
    const lanzador = await esperarVentana('launcher/index.html');
    if (!lanzador) { tlog('ERROR: no aparecio el lanzador'); app.exit(3); return; }
    await esperar(1500);
    tlog('--- P17: ASSETS EN EL HORNEADO REAL ---');

    // 1) DASHBOARD horneado
    const row = await lanzador.webContents.executeJavaScript(
      "window.launcherAPI.createProject('Proyecto P17','','2026-01-01',null)");
    const archivo = path.join(UD, 'projects', String(row.id), 'dashboard.html');
    const html = fs.readFileSync(archivo, 'utf8');
    const relativosArchivo = (html.match(/(?:src|href)="\.\.\/(?:vendor|assets)\//g) || []).length;
    const iconosAbsolutos = (html.match(/src="file:[^"]*icon-256\.png"/g) || []).length;
    info(`archivo horneado: relativos=${relativosArchivo} iconosAbsolutos=${iconosAbsolutos}`);
    ok('P17-R1 el archivo horneado no conserva ninguna ruta relativa de vendor/assets', relativosArchivo === 0, String(relativosArchivo));
    ok('P17-R2 los DOS iconos quedan con ruta absoluta en el archivo', iconosAbsolutos === 2, String(iconosAbsolutos));

    await lanzador.webContents.executeJavaScript(`window.launcherAPI.openProject(${row.id})`);
    const v = await esperarVentana(`projects/${row.id}/dashboard.html`);
    ok('P17-R3 el dashboard horneado abre', !!v);
    await esperar(3500);
    await revisar(v, 'dashboard');
    await captura(v, 'p17-1-dashboard');

    // 2) DIRECTORIO horneado (misma función, mismo problema antes de P17)
    const prevIds = new Set(BrowserWindow.getAllWindows().map((x) => x.id));
    await v.webContents.executeJavaScript("window.panoramaBridge.projectMenuAction('archivo-directorio')").catch(() => {});
    const dirRow = dbmod.get("SELECT id FROM projects WHERE kind='directorio_talento'");
    const vd = dirRow ? await esperarVentana(`projects/${dirRow.id}/dashboard.html`, 20000, prevIds) : null;
    ok('P17-R4 el Directorio horneado abre', !!vd);
    if (vd) {
      await esperar(3000);
      const htmlDir = fs.readFileSync(path.join(UD, 'projects', String(dirRow.id), 'dashboard.html'), 'utf8');
      ok('P17-R5 el Directorio horneado tampoco conserva rutas relativas',
        (htmlDir.match(/(?:src|href)="\.\.\/(?:vendor|assets)\//g) || []).length === 0);
      await revisar(vd, 'directorio');
      await captura(vd, 'p17-2-directorio');
    }

    // 3) Ninguna ventana nueva rara
    const inventario = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()).map((w) => ({
      titulo: w.getTitle(), url: decodeURIComponent(w.webContents.getURL()).replace(/^.*\/(?=[^/]+$)/, ''),
    }));
    info('ventanas: ' + JSON.stringify(inventario));
    ok('P17-R6 no aparece ninguna ventana vacía ni titulada "Electron"',
      !inventario.some((w) => /^electron$/i.test(w.titulo) || !w.url), JSON.stringify(inventario));

    tlog('__MODO_TERMINADO__');
    await esperar(1000);
    app.exit(0);
  } catch (e) {
    tlog('EXCEPCION EN EL ARNES: ' + ((e && e.stack) || String(e)));
    app.exit(4);
  }
});
