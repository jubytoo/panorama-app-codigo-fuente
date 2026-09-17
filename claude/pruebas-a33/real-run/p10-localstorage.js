// ---------------------------------------------------------------------------
// P10 — ¿QUÉ GUARDA EL localStorage DE CADA PARTICIÓN? (DIAGNÓSTICO)
//
// Trabaja SOLO sobre una COPIA de las carpetas «Local Storage» que el .ps1 deja
// en un sandbox marcado (_a33-p10). No carga main.js ni ningún código del
// producto: abre una página en blanco (file://, el mismo origen que usan los
// dashboards) en cada partición de la copia y lee su localStorage.
//
// Nunca guarda ni imprime VALORES: por cada clave anota su patrón, su longitud
// y su SHA-256; del estado del proyecto (`panorama-servicio-full__…`), solo los
// NOMBRES de sus campos, su tipo, su tamaño y el SHA-256 de cada campo.
//
//   --sandbox=<dir>   raíz del sandbox (debe contener _a33-p10)
//   --copia=<sub>     subcarpeta del sandbox que hace de userData (res | viva)
// Salida: <sandbox>\resultado-<copia>.json
// ---------------------------------------------------------------------------
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const arg = (n) => { const a = process.argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : null; };
const SB = arg('sandbox');
const COPIA = arg('copia');
if (!SB || !/_a33-p10/i.test(SB) || !/^(res|viva)$/.test(String(COPIA))) { console.error('argumentos no válidos'); process.exit(2); }
const UD = path.join(SB, COPIA);
if (!fs.existsSync(UD)) { console.error('no existe la copia'); process.exit(2); }

app.setPath('appData', UD);
app.setPath('userData', UD);
app.on('window-all-closed', () => {});
const sha = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex');

// Patrón de la clave, sin el título del proyecto (las versiones antiguas lo
// usaban). El dashboard guarda con el prefijo `panorama_servicio_ib__` delante
// (primera pasada: el arnés solo reconocía el estado si la clave EMPEZABA por
// `panorama-servicio-full__`, y no encontró ninguno).
const PREFIJO = 'panorama_servicio_ib__';
function patron(k) {
  const pre = k.startsWith(PREFIJO) ? PREFIJO : '';
  const i = k.slice(pre.length);
  // Cualquier `panorama-servicio-<tipo>__<resto>` (full, historial…): el resto
  // es `proj-<id>` o, en versiones antiguas, el TÍTULO del proyecto. Segunda
  // pasada: solo se tapaba `full__` y las claves `historial__` enseñaron títulos.
  const m = /^(panorama-servicio-[a-z-]+__)(.*)$/.exec(i);
  if (m) return pre + m[1] + (/^proj-\d+$/.test(m[2]) ? m[2] : '<título-fecha>');
  if (i === 'panorama-servicio-admin-backup-password') return pre + i + ' [SENSIBLE: solo se anota que existe]';
  return pre + i.replace(/[0-9a-f]{8,}/gi, '<hex>');
}
const esEstado = (k) => k.includes('panorama-servicio-full__') || k.includes('panorama-servicio-historial__') || /^dt-directorio-talento-state/.test(k);
// Además del hash de cada campo, el hash de CADA ELEMENTO de las listas (y de
// cada par clave:valor de los objetos): permite contar cuántos elementos del
// residuo no aparecen idénticos en ninguna otra parte, sin ver ninguno.
// El Directorio guarda `{ state: {...}, savedAt }`: se aplana `state`.
function huellaEstado(txt) {
  let st;
  try { st = JSON.parse(txt); } catch (e) { return { json: false }; }
  if (!st || typeof st !== 'object') return { json: true, tipo: typeof st };
  let pares = Array.isArray(st) ? [['(lista)', st]] : Object.entries(st);
  if (!Array.isArray(st) && st.state && typeof st.state === 'object' && !Array.isArray(st.state)) {
    pares = [...Object.entries(st.state).map(([k, v]) => ['state.' + k, v]), ...pares.filter(([k]) => k !== 'state')];
  }
  const campos = {};
  for (const [k, v] of pares) {
    const tipo = Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
    const tam = Array.isArray(v) ? v.length : tipo === 'object' ? Object.keys(v).length : tipo === 'string' ? v.length : null;
    const c = { tipo, tam, sha: sha(JSON.stringify(v)) };
    if (tipo === 'array') {
      c.elems = v.map((e) => sha(JSON.stringify(e)));
      // Por elemento, el hash de CADA propiedad: distingue «la misma entrada con
      // algún cambio» de «una entrada que no existe en otro sitio».
      c.props = v.map((e) => (e && typeof e === 'object' && !Array.isArray(e)
        ? Object.entries(e).map(([a, b]) => sha(a + ':' + JSON.stringify(b)))
        : [sha(JSON.stringify(e))]));
    } else if (tipo === 'object') {
      c.elems = Object.entries(v).map(([a, b]) => sha(a + ':' + JSON.stringify(b)));
      c.props = c.elems.map((h) => [h]);
    }
    campos[k] = c;
  }
  return { json: true, campos };
}

app.whenReady().then(async () => {
  const pagina = path.join(SB, 'vacia.html');
  if (!fs.existsSync(pagina)) fs.writeFileSync(pagina, '<!doctype html><title>p10</title>', 'utf8');
  const objetivos = [{ nombre: '(raíz)', particion: null }];
  const dirP = path.join(UD, 'Partitions');
  if (fs.existsSync(dirP)) for (const d of fs.readdirSync(dirP)) objetivos.push({ nombre: d, particion: 'persist:' + d });
  const salida = { copia: COPIA, electron: process.versions.electron, particiones: [] };
  for (const o of objetivos) {
    const w = new BrowserWindow({ show: false, webPreferences: { partition: o.particion || undefined, contextIsolation: true, nodeIntegration: false, sandbox: true } });
    const r = { nombre: o.nombre, claves: [] };
    try {
      await w.loadFile(pagina);
      const par = await w.webContents.executeJavaScript('(() => { const o = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o.push([k, localStorage.getItem(k)]); } return o; })()');
      for (const [k, v] of par) {
        const c = { patron: patron(k), shaClave: sha(k), len: String(v).length, sha: sha(v) };
        if (esEstado(k)) c.estado = huellaEstado(v);
        r.claves.push(c);
      }
    } catch (e) {
      r.error = String((e && e.message) || e);
    }
    try { w.destroy(); } catch (e) {}
    salida.particiones.push(r);
  }
  fs.writeFileSync(path.join(SB, `resultado-${COPIA}.json`), JSON.stringify(salida, null, 1), 'utf8');
  app.exit(0);
});
