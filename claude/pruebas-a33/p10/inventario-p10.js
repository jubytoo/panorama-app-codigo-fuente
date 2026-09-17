'use strict';
// ---------------------------------------------------------------------------
// P10 — INVENTARIO DE %APPDATA%\panorama-app. DIAGNÓSTICO, ESTRICTAMENTE DE
// SOLO LECTURA (17 sept 2026).
//
// Qué hace: stat de todo; lectura de la BD residual y de la BD viva a un
// Buffer, abiertas EN MEMORIA con sql.js (jamás se exportan); cabeceras de los
// backups (¿cifrados?); hash de contenido solo donde hace falta comparar; la
// cabecera de cada .asar para leer su versión; y el texto de los logs para
// contar, nunca para imprimir.
//
// Qué NO hace: escribir, crear, renombrar, borrar ni mover NADA (todas las
// funciones de escritura de `fs` quedan trucadas y LANZAN); abrir una BD sobre
// disco; descifrar; imprimir nombres de proyecto, contenido, sales,
// verificadores ni la contraseña recordada. Los proyectos salen por id; las
// carpetas de backups como `<id>-…`; las particiones como P1..Pn.
//
// Cierre: huella del árbol entero de P10 (rutas, tamaños y fechas), hash de la
// BD residual, de la BD viva y de location.json, ANTES y DESPUÉS. Si algo
// cambia: exit 98.
//
// Uso: node p10/inventario-p10.js     (Node del sistema, no ELECTRON_RUN_AS_NODE)
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const initSqlJs = require(path.join(PROJ, 'node_modules', 'sql.js'));
const GUARDIA = require(path.join(__dirname, '..', 'comun', 'guardia-rutas.js'));

// --- trampa de escritura: cualquier intento, aborta --------------------------
// (writeSync/write NO se trucan: con la salida redirigida, console.log los usa.
// Sin un descriptor abierto en escritura —ver openSync abajo— no pueden tocar nada.)
const ESCRIBEN = ['writeFileSync', 'appendFileSync', 'mkdirSync', 'renameSync', 'unlinkSync', 'rmSync', 'rmdirSync',
  'copyFileSync', 'cpSync', 'truncateSync', 'utimesSync', 'chmodSync', 'symlinkSync', 'linkSync',
  'writeFile', 'appendFile', 'mkdir', 'rename', 'unlink', 'rm', 'rmdir', 'copyFile', 'cp', 'truncate', 'utimes', 'open'];
for (const k of ESCRIBEN) {
  if (typeof fs[k] === 'function') fs[k] = () => { throw new Error('P10: escritura PROHIBIDA (' + k + ')'); };
  if (fs.promises && typeof fs.promises[k] === 'function') fs.promises[k] = async () => { throw new Error('P10: escritura PROHIBIDA (promises.' + k + ')'); };
}
const openOrig = fs.openSync.bind(fs);
fs.openSync = (p, flags, ...r) => {
  if (flags !== undefined && flags !== 'r' && flags !== fs.constants.O_RDONLY) throw new Error('P10: apertura NO de lectura prohibida (' + flags + ')');
  return openOrig(p, 'r', ...r);
};

const LECT = GUARDIA.leerUbicacionReal({});
if (LECT.estado !== 'ok') { console.error('location.json ' + LECT.estado + ': ' + LECT.detalle); process.exit(99); }
const UD = LECT.ruta;                                   // carpeta de datos VIVA (G:)
const APPDATA = process.env.APPDATA;
const P10 = path.join(APPDATA, 'panorama-app');
const BD_P10 = path.join(P10, 'panorama.sqlite3');
const BD_VIVA = path.join(UD, 'panorama.sqlite3');
const LOC = path.join(APPDATA, 'panorama-app-config', 'location.json');
const INSTALADO = path.join(process.env.LOCALAPPDATA, 'Programs', 'Panorama del Servicio', 'resources', 'app.asar');

const shaBuf = (b) => crypto.createHash('sha256').update(b).digest('hex').toUpperCase();
const shaF = (f) => { try { return shaBuf(fs.readFileSync(f)); } catch (e) { return 'NO-EXISTE'; } };
const mb = (b) => (b / 1048576).toFixed(2).replace('.', ',') + ' MB';
const dia = (ms) => (Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString().slice(0, 10) : '-');
const hora = (ms) => (Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') : '-');
const ls = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return []; } };
function arbol(d) {
  const archivos = []; let carpetas = 0;
  const rec = (x) => {
    for (const e of ls(x)) {
      const p = path.join(x, e.name);
      if (e.isDirectory()) { carpetas++; rec(p); continue; }
      try { const s = fs.statSync(p); archivos.push({ p, rel: path.relative(d, p), size: s.size, mtime: s.mtimeMs, birth: s.birthtimeMs }); } catch (er) {}
    }
  };
  rec(d);
  return { archivos, carpetas };
}
const suma = (xs) => xs.reduce((a, x) => a + x.size, 0);
const rango = (xs) => (xs.length ? `${hora(Math.min(...xs.map((x) => x.mtime)))} .. ${hora(Math.max(...xs.map((x) => x.mtime)))}` : '-');
const huella = (t) => shaBuf(Buffer.from(t.archivos.map((x) => `${x.rel}|${x.size}|${x.mtime}`).sort().join('\n')));
const ENV = /^\s*\{\s*"panoramaEncrypted"\s*:\s*1/;
function cabecera(p, n = 64) { const fd = fs.openSync(p, 'r'); try { const b = Buffer.alloc(n); const k = fs.readSync(fd, b, 0, n, 0); return b.slice(0, k).toString('utf8'); } finally { fs.closeSync(fd); } }
const agrupa = (arr) => arr.reduce((m, x) => ((m[x] = (m[x] || 0) + 1), m), {});

async function abrirEnMemoria(ruta) {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(PROJ, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')) });
  const buf = fs.readFileSync(ruta);
  const db = new SQL.Database(new Uint8Array(buf));
  const all = (q, p) => { const st = db.prepare(q); st.bind(p || []); const r = []; while (st.step()) r.push(st.getAsObject()); st.free(); return r; };
  return { db, all, size: buf.length, sha: shaBuf(buf) };
}
function versionAsar(ruta) {
  try {
    const fd = fs.openSync(ruta, 'r');
    try {
      const h = Buffer.alloc(16); fs.readSync(fd, h, 0, 16, 0);
      const S = h.readUInt32LE(4); const L = h.readUInt32LE(12);
      const hb = Buffer.alloc(L); fs.readSync(fd, hb, 0, L, 16);
      const hdr = JSON.parse(hb.toString('utf8'));
      const pj = hdr.files['package.json'];
      const pb = Buffer.alloc(pj.size); fs.readSync(fd, pb, 0, pj.size, 8 + S + Number(pj.offset));
      const pkg = JSON.parse(pb.toString('utf8'));
      return { version: pkg.version, raiz: Object.keys(hdr.files).sort() };
    } finally { fs.closeSync(fd); }
  } catch (e) { return { version: '¿? (' + e.message + ')', raiz: [] }; }
}

// --- familias ------------------------------------------------------------------
const CACHES = ['Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'Shared Dictionary', 'blob_storage'];
const FAMILIAS = [
  ['BD local residual', /^panorama\.sqlite3(\..*)?$/],
  ['backups de proyecto (backup_*.json)', /^backups[\\/][^\\/]+[\\/]backup_[^\\/]*\.json$/i],
  ['preparaciones de reunión', /^backups[\\/][^\\/]+[\\/]reuniones[\\/]/i],
  ['evaluaciones / CV', /^backups[\\/][^\\/]+[\\/]evaluacion-candidatos[\\/]/i],
  ['otros bajo backups/', /^backups[\\/]/i],
  ['dashboards horneados (projects/<id>)', /^projects[\\/]/i],
  ['particiones de proyecto (Partitions)', /^Partitions[\\/]/i],
  ['Chromium raíz — cachés', new RegExp('^(' + CACHES.map((c) => c.replace(/ /g, ' ')).join('|') + ')[\\\\/]')],
  ['Chromium raíz — Local Storage', /^Local Storage[\\/]/],
  ['Chromium raíz — Session Storage', /^Session Storage[\\/]/],
  ['Chromium raíz — Network (cookies…)', /^Network[\\/]/],
  ['Chromium raíz — perfil (Local State, Preferences…)', /^(Local State|Preferences|SharedStorage.*|Trust Tokens.*|Network Persistent State|Custom Dictionary\.txt.*)$/],
  ['instalación / parches (.asar, ayudante)', /^(app\d*\.asar|app\.asar\.bak-.*|apply-patch-helper\.js|patch-log\.txt)$/i],
  ['registro (app.log)', /^app\.log(\..*)?$/i],
  ['sondas de escritura', /^\.panorama-write-check-/],
];
const familiaDe = (rel) => { for (const [n, re] of FAMILIAS) if (re.test(rel)) return n; return 'OTROS (sin familia)'; };
function catParticion(relDentro) {
  const top = relDentro.split(/[\\/]/)[0];
  if (CACHES.includes(top)) return 'caché';
  if (top === 'Local Storage') return 'Local Storage';
  if (top === 'Session Storage') return 'Session Storage';
  if (top === 'IndexedDB') return 'IndexedDB';
  if (top === 'Service Worker') return 'Service Worker';
  if (top === 'Network') return 'Network (cookies…)';
  if (['WebStorage', 'databases', 'File System'].includes(top)) return 'otros datos web (' + top + ')';
  return 'perfil (' + top + ')';
}

(async () => {
  const T0 = arbol(P10);
  const H0 = { arbol: huella(T0), p10: shaF(BD_P10), viva: shaF(BD_VIVA), loc: shaF(LOC) };
  console.log('P10 — INVENTARIO DE %APPDATA%\\panorama-app (solo lectura)');
  console.log(`  huella del árbol ANTES: ${H0.arbol.slice(0, 16)} · BD residual ${H0.p10.slice(0, 16)} · BD viva ${H0.viva.slice(0, 16)} · location.json ${H0.loc.slice(0, 16)}`);

  // ============================================================== 1. TOTALES
  const A = T0.archivos;
  console.log('\n=== 1. TOTALES ===');
  console.log(`  ${A.length} archivos · ${T0.carpetas} carpetas · ${mb(suma(A))} (${suma(A)} B) · fechas ${rango(A)}`);

  // ============================================================== 2. RESIDUAL (BD) Y VIVA
  const R = await abrirEnMemoria(BD_P10);
  const V = await abrirEnMemoria(BD_VIVA);
  const pR = R.all('SELECT id, name, client, partition_name, created_at, updated_at, backup_dir, kind, sort_order FROM projects ORDER BY id');
  const pV = V.all('SELECT id, name, partition_name, created_at, updated_at, backup_dir, kind FROM projects ORDER BY id');
  const partMap = new Map();        // partition_name (sin persist:) -> P<n>
  const nombreParticion = (pn) => { const k = String(pn || '').replace(/^persist:/, '').toLowerCase(); if (!partMap.has(k)) partMap.set(k, 'P' + (partMap.size + 1)); return partMap.get(k); };
  pR.forEach((p) => nombreParticion(p.partition_name));
  const anon = (rel) => rel
    .replace(/^(backups[\\/])(\d+)-[^\\/]+/i, '$1$2-…')
    .replace(/^(Partitions[\\/])([^\\/]+)/i, (m, a, b) => a + nombreParticion(b));

  // ============================================================== 3. FAMILIAS
  console.log('\n=== 2. FAMILIAS (por tamaño) ===');
  const porFam = new Map();
  for (const x of A) { const f = familiaDe(x.rel); if (!porFam.has(f)) porFam.set(f, []); porFam.get(f).push(x); }
  const fams = [...porFam.entries()].sort((a, b) => suma(b[1]) - suma(a[1]));
  for (const [f, xs] of fams) console.log(`  ${f.padEnd(52)} ${String(xs.length).padStart(4)} arch ${mb(suma(xs)).padStart(11)}  ${rango(xs)}`);

  console.log('\n=== 3. LOS 20 ARCHIVOS MÁS GRANDES ===');
  for (const x of A.slice().sort((a, b) => b.size - a.size).slice(0, 20)) {
    console.log(`  ${mb(x.size).padStart(10)}  ${hora(x.mtime)}  ${anon(x.rel)}`);
  }

  // ============================================================== 4. BD RESIDUAL
  console.log('\n=== 4. LA BD RESIDUAL ===');
  const stR = fs.statSync(BD_P10);
  console.log(`  panorama.sqlite3 · ${R.size} B · modificada ${hora(stR.mtimeMs)} · creada ${hora(stR.birthtimeMs)} · SHA-256 ${R.sha}`);
  console.log(`  integridad (en memoria): ${R.all('PRAGMA integrity_check')[0].integrity_check} · user_version ${R.all('PRAGMA user_version')[0].user_version}`);
  const tablas = R.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").map((t) => t.name);
  for (const t of tablas) {
    const cols = R.all(`PRAGMA table_info(${t})`).map((c) => c.name);
    console.log(`  tabla ${t.padEnd(14)} ${String(R.all(`SELECT COUNT(*) c FROM ${t}`)[0].c).padStart(4)} filas · columnas: ${cols.join(', ')}`);
  }
  console.log(`  sqlite_sequence: ${JSON.stringify(R.all('SELECT name, seq FROM sqlite_sequence'))}`);
  const metaR = new Map(R.all('SELECT key, value FROM app_meta').map((m) => [m.key, m.value]));
  const metaV = new Map(V.all('SELECT key, value FROM app_meta').map((m) => [m.key, m.value]));
  console.log(`  app_meta (solo claves): ${JSON.stringify([...metaR.keys()])}`);
  const A33 = ['db_commit_id', 'db_generation', 'installation_id', 'db_schema', 'commit_padre'];
  console.log(`  claves de A3.3 en la residual: ${A33.filter((k) => metaR.has(k)).join(', ') || 'NINGUNA (anterior a A3.3)'}` +
    ` · en la viva: ${[...metaV.keys()].filter((k) => /^db_|installation|commit/i.test(k)).map((k) => k.replace(/[0-9a-f]{32}/, '<id>')).join(', ') || 'ninguna'}`);
  const seg = (k) => (metaR.has(k) ? (metaV.has(k) ? (metaR.get(k) === metaV.get(k) ? 'IGUAL que la viva' : 'DISTINTO de la viva') : 'solo en la residual') : 'ausente');
  console.log(`  Seguridad: security_enabled residual=${metaR.get('security_enabled')} viva=${metaV.get('security_enabled')} · sal: ${seg('security_salt')} · verificador: ${seg('security_verifier')}` +
    ` · contraseña recordada: ${metaR.has('security_remembered') ? 'PRESENTE en la residual (' + String(metaR.get('security_remembered')).length + ' car., NO se imprime)' : 'ausente'}` +
    ` / viva: ${metaV.has('security_remembered') ? 'presente' : 'ausente'} · ${metaR.has('security_remembered') && metaV.has('security_remembered') ? (metaR.get('security_remembered') === metaV.get('security_remembered') ? 'IGUALES' : 'DISTINTAS') : ''}`);

  // proyectos: emparejar con la viva
  const shaN = (s) => shaBuf(Buffer.from(String(s || ''), 'utf8')).slice(0, 12);
  console.log(`\n  proyectos: residual ${pR.length} (ids ${pR.map((p) => p.id).join(',')}) · viva ${pV.length} (ids ${pV.map((p) => p.id).join(',')})`);
  const secV = V.all('SELECT name, seq FROM sqlite_sequence');
  console.log(`  sqlite_sequence de la viva: ${JSON.stringify(secV)}`);
  const pareja = new Map();
  for (const r of pR) {
    const porPart = pV.find((v) => String(v.partition_name).toLowerCase() === String(r.partition_name).toLowerCase());
    const porNombreFecha = pV.find((v) => v.name === r.name && v.created_at === r.created_at);
    const porNombre = pV.filter((v) => v.name === r.name);
    const v = porPart || porNombreFecha || null;
    pareja.set(r.id, v);
    const crit = [porPart ? 'partición' : null, porNombreFecha ? 'nombre+creación' : null, !porPart && !porNombreFecha && porNombre.length ? `solo nombre (ids viva ${porNombre.map((x) => x.id).join(',')})` : null].filter(Boolean).join(' + ') || 'NINGUNO';
    const brR = R.all('SELECT COUNT(*) c, MIN(created_at) a, MAX(created_at) b, SUM(encrypted) e, SUM(LENGTH(payload)) pl FROM backups WHERE project_id=?', [r.id])[0];
    const brV = v ? V.all('SELECT COUNT(*) c, MIN(created_at) a, MAX(created_at) b FROM backups WHERE project_id=?', [v.id])[0] : null;
    console.log(`  residual id ${String(r.id).padStart(2)} ${nombreParticion(r.partition_name).padEnd(4)} kind=${r.kind || '-'} creado ${String(r.created_at).slice(0, 16)} actualizado ${String(r.updated_at).slice(0, 16)}` +
      ` · backups ${brR.c} (${String(brR.a || '-').slice(0, 16)} .. ${String(brR.b || '-').slice(0, 16)}; cifrados ${brR.e || 0}; payload en línea ${brR.pl || 0} car.)` +
      `\n      ↔ viva: ${v ? `id ${v.id} [${crit}] actualizado ${String(v.updated_at).slice(0, 16)} · backups ${brV.c} (${String(brV.a || '-').slice(0, 16)} .. ${String(brV.b || '-').slice(0, 16)})` +
        ` · mismo nombre ${v.name === r.name} · mismo backup_dir ${v.backup_dir === r.backup_dir}` : `SIN PAREJA [${crit}]`}`);
  }
  const vSinR = pV.filter((v) => ![...pareja.values()].some((x) => x && x.id === v.id));
  console.log(`  proyectos de la viva SIN equivalente en la residual: ${vSinR.map((v) => `id ${v.id} (creado ${String(v.created_at).slice(0, 16)}${v.kind ? ', ' + v.kind : ''})`).join(' · ') || 'ninguno'}`);
  const mR = R.all('SELECT id, project_id, created_at, file_path, encrypted FROM meeting_preps');
  console.log(`  meeting_preps residual: ${mR.length} ${mR.map((m) => `(proyecto ${m.project_id}, ${String(m.created_at).slice(0, 16)}, cifrada ${m.encrypted})`).join(' ')}`);
  const tieneCE = tablas.includes('candidate_evals');
  console.log(`  candidate_evals residual: ${tieneCE ? R.all('SELECT COUNT(*) c FROM candidate_evals')[0].c : 'la tabla NO existe'}`);

  // ============================================================== 5. BACKUPS vs G:
  console.log('\n=== 5. BACKUPS Y PREPARACIONES DEL RESIDUO FRENTE A G: ===');
  const gArch = arbol(path.join(UD, 'backups')).archivos;
  const gPorTam = new Map();
  for (const g of gArch) { if (!gPorTam.has(g.size)) gPorTam.set(g.size, []); gPorTam.get(g.size).push(g); }
  const gPorNombre = new Map(gArch.map((g) => [path.basename(g.p).toLowerCase(), g]));
  const shaCache = new Map();
  const shaDe = (p) => { if (!shaCache.has(p)) shaCache.set(p, shaF(p)); return shaCache.get(p); };
  const bR = A.filter((x) => /^backups[\\/]/i.test(x.rel));
  const filasR = new Map(R.all("SELECT project_id, file_path, created_at, reason, encrypted, size FROM backups WHERE file_path IS NOT NULL AND file_path!=''").map((f) => [String(f.file_path).toLowerCase(), f]));
  const tot = { n: 0, cif: 0, conFila: 0, igualEnG: 0, mismoNombreDistinto: 0, soloP10: 0 };
  const porProy = new Map();
  for (const x of bR) {
    const id = Number(x.rel.split(/[\\/]/)[1].split('-')[0]);
    const base = path.basename(x.p);
    const esBackup = /^backup_.*\.json$/i.test(base);
    tot.n++;
    const cif = ENV.test(cabecera(x.p));
    if (cif) tot.cif++;
    if (filasR.has(base.toLowerCase())) tot.conFila++;
    const h = shaDe(x.p);
    const igual = (gPorTam.get(x.size) || []).some((g) => shaDe(g.p) === h);
    const mismoNombre = gPorNombre.get(base.toLowerCase());
    let clase;
    if (igual) { clase = 'igual en G:'; tot.igualEnG++; }
    else if (mismoNombre) { clase = 'mismo nombre, OTRO contenido'; tot.mismoNombreDistinto++; }
    else { clase = 'SOLO en P10'; tot.soloP10++; }
    const k = id;
    if (!porProy.has(k)) porProy.set(k, { backups: [], otros: [] });
    (esBackup ? porProy.get(k).backups : porProy.get(k).otros).push({ x, clase, cif, base });
  }
  console.log(`  ${tot.n} archivos bajo backups/ · cifrados ${tot.cif} · con fila en la BD residual ${tot.conFila} · IDÉNTICOS en G: ${tot.igualEnG} · mismo nombre con otro contenido ${tot.mismoNombreDistinto} · SOLO en P10 ${tot.soloP10}`);
  for (const [id, o] of [...porProy.entries()].sort((a, b) => a[0] - b[0])) {
    const v = pareja.get(id);
    const gB = v ? V.all('SELECT MIN(created_at) a, MAX(created_at) b, COUNT(*) c FROM backups WHERE project_id=?', [v.id])[0] : null;
    const gDir = v ? gArch.filter((g) => g.rel.split(/[\\/]/)[0].split('-')[0] === String(v.id) && /^backup_/i.test(path.basename(g.p))) : [];
    const cl = agrupa(o.backups.map((b) => b.clase));
    const ts = o.backups.map((b) => b.base.slice(7, 26));
    console.log(`  proyecto residual ${id}: ${o.backups.length} backups ${JSON.stringify(cl)} · ${ts.length ? ts.sort()[0] + ' .. ' + ts.sort()[ts.length - 1] : '-'}` +
      ` · en G: ${v ? `proyecto ${v.id}, ${gDir.length} archivos, filas ${gB.c} (${String(gB.a || '-').slice(0, 19)} .. ${String(gB.b || '-').slice(0, 19)})` : 'SIN proyecto equivalente'}` +
      (o.otros.length ? ` · otros: ${o.otros.map((b) => anon(b.x.rel).replace(/[^\\/]+$/, (n) => n.replace(/^(.{0,12}).*(\.\w+)$/, '$1…$2')) + ' [' + b.clase + (b.cif ? ', cifrado' : '') + ']').join(', ')}` : ''));
  }

  // ============================================================== 6. PARTICIONES
  console.log('\n=== 6. PARTICIONES (Chromium, una por proyecto) ===');
  const partG = new Set(ls(path.join(UD, 'Partitions')).filter((e) => e.isDirectory()).map((e) => e.name.toLowerCase()));
  const dirsP = ls(path.join(P10, 'Partitions')).filter((e) => e.isDirectory()).map((e) => e.name);
  const aggCat = {};
  for (const d of dirsP) {
    const raiz = path.join(P10, 'Partitions', d);
    const xs = arbol(raiz).archivos;
    const porCat = {};
    for (const x of xs) { const c = catParticion(x.rel); (porCat[c] = porCat[c] || []).push(x); (aggCat[c] = aggCat[c] || []).push(x); }
    const r = pR.find((p) => String(p.partition_name).replace(/^persist:/, '').toLowerCase() === d.toLowerCase());
    const v = pV.find((p) => String(p.partition_name).replace(/^persist:/, '').toLowerCase() === d.toLowerCase());
    let gLs = '';
    if (partG.has(d.toLowerCase())) {
      const gx = arbol(path.join(UD, 'Partitions', d, 'Local Storage')).archivos;
      gLs = ` · en G: EXISTE (su Local Storage ${gx.length} arch, ${mb(suma(gx))}, última ${hora(Math.max(0, ...gx.map((q) => q.mtime)))})`;
    } else gLs = ' · en G: NO existe';
    console.log(`  ${nombreParticion(d).padEnd(4)} residual id ${r ? r.id : '—'} · viva id ${v ? v.id : '—'} · ${xs.length} arch ${mb(suma(xs))} · última ${hora(Math.max(0, ...xs.map((q) => q.mtime)))}${gLs}`);
    console.log('       ' + Object.entries(porCat).sort((a, b) => suma(b[1]) - suma(a[1])).map(([c, ys]) => `${c} ${mb(suma(ys))}`).join(' · '));
  }
  console.log('  total por categoría: ' + Object.entries(aggCat).sort((a, b) => suma(b[1]) - suma(a[1])).map(([c, ys]) => `${c} ${ys.length} arch ${mb(suma(ys))}`).join(' · '));
  const sinDir = pR.filter((p) => !dirsP.some((d) => d.toLowerCase() === String(p.partition_name).replace(/^persist:/, '').toLowerCase()));
  console.log(`  proyectos de la residual SIN carpeta de partición: ${sinDir.map((p) => p.id).join(',') || 'ninguno'}`);

  // ============================================================== 7. CHROMIUM RAÍZ
  console.log('\n=== 7. PERFIL DE CHROMIUM DE LA RAÍZ (sesión por defecto: lanzador, splash, Seguridad, Preparación, Evaluación, Directorio…) ===');
  for (const top of ['Local Storage', 'Session Storage', 'Network', ...CACHES]) {
    const xs = arbol(path.join(P10, top)).archivos;
    if (!fs.existsSync(path.join(P10, top))) continue;
    console.log(`  ${top.padEnd(18)} ${String(xs.length).padStart(3)} arch ${mb(suma(xs)).padStart(10)}  ${rango(xs)}  [${[...new Set(xs.map((x) => path.basename(x.p).replace(/^\d{6}\.(log|ldb)$/, 'NNNNNN.$1').replace(/^MANIFEST-\d+$/, 'MANIFEST-N').replace(/^f_[0-9a-f]+$/, 'f_*').replace(/^[0-9a-f]{16}_\d$/, '<hash>_N')))].slice(0, 8).join(', ')}]`);
  }
  for (const f of ['Local State', 'Preferences', 'SharedStorage']) {
    if (fs.existsSync(path.join(P10, f))) { const s = fs.statSync(path.join(P10, f)); console.log(`  ${f.padEnd(18)} ${s.size} B · ${hora(s.mtimeMs)}`); }
  }

  // ============================================================== 8. INSTALACIÓN / PARCHES
  console.log('\n=== 8. INSTALACIÓN Y PARCHES ===');
  const asarsG = ls(UD).filter((e) => e.isFile() && /^app\d*\.asar(\.bak-.*)?$/i.test(e.name)).map((e) => path.join(UD, e.name));
  const refAsar = [...asarsG.map((p) => ({ p, donde: 'G:' })), { p: INSTALADO, donde: 'instalado' }].filter((o) => fs.existsSync(o.p))
    .map((o) => ({ ...o, size: fs.statSync(o.p).size, v: versionAsar(o.p).version }));
  for (const r of refAsar) console.log(`  referencia ${r.donde.padEnd(9)} ${path.basename(r.p).padEnd(40)} v${r.v} · ${r.size} B · ${hora(fs.statSync(r.p).mtimeMs)}`);
  for (const x of A.filter((y) => /^(app\d*\.asar|app\.asar\.bak-.*)$/i.test(y.rel))) {
    const v = versionAsar(x.p);
    const h = shaDe(x.p);
    const iguales = refAsar.filter((r) => r.size === x.size && shaDe(r.p) === h).map((r) => r.donde + ' ' + path.basename(r.p));
    console.log(`  P10 ${x.rel.padEnd(40)} v${v.version} · ${x.size} B · ${hora(x.mtime)} · SHA ${h.slice(0, 16)} · idéntico a: ${iguales.join(', ') || 'NINGUNO'}`);
  }
  for (const f of ['apply-patch-helper.js', 'patch-log.txt']) {
    const p = path.join(P10, f);
    if (!fs.existsSync(p)) continue;
    const t = fs.readFileSync(p, 'utf8');
    const lineas = t.split(/\r?\n/).filter(Boolean);
    const extra = f === 'patch-log.txt'
      ? ` · ${lineas.length} líneas · fechas ${[...new Set(lineas.map((l) => (/\d{4}-\d{2}-\d{2}/.exec(l) || [''])[0]).filter(Boolean))].join(',')} · con ruta absoluta ${lineas.filter((l) => /[A-Z]:\\/.test(l)).length} · «error/fail» ${lineas.filter((l) => /error|fail|EPERM|EACCES/i.test(l)).length}`
      : ` · ${lineas.length} líneas · igual al de G: ${fs.existsSync(path.join(UD, f)) ? shaF(path.join(UD, f)) === shaBuf(Buffer.from(t, 'utf8')) : 'no hay en G:'}`;
    console.log(`  P10 ${f.padEnd(40)} ${Buffer.byteLength(t)} B · ${hora(fs.statSync(p).mtimeMs)}${extra}`);
  }
  if (fs.existsSync(path.join(P10, 'patch-log.txt'))) {
    const pl = fs.readFileSync(path.join(P10, 'patch-log.txt'), 'utf8').split(/\r?\n/).filter(Boolean);
    console.log('  patch-log.txt (líneas, rutas ocultas):');
    // La ruta va al final de la línea y puede llevar espacios (primera pasada:
    // cortar en el primer espacio dejaba ver el resto): se oculta hasta el final.
    for (const l of pl.slice(0, 40)) console.log('     ' + l.replace(/[A-Za-z]:\\.*$/g, '<ruta>').slice(0, 150));
  }

  // ============================================================== 9. REGISTRO
  console.log('\n=== 9. REGISTRO (app.log) ===');
  for (const x of A.filter((y) => /^app\.log/i.test(y.rel))) {
    const lin = fs.readFileSync(x.p, 'utf8').split(/\r?\n/).filter(Boolean);
    const fechas = lin.map((l) => (/^\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\]/.exec(l) || [])[1]).filter(Boolean);
    const vers = {};
    for (const l of lin) { const m = /Arranque — v([\d.]+)/.exec(l); if (m) { const d = l.slice(1, 11); (vers[m[1]] = vers[m[1]] || []).push(d); } }
    console.log(`  ${x.rel}: ${x.size} B · ${lin.length} líneas · ${fechas[0] || '-'} .. ${fechas[fechas.length - 1] || '-'} · con ruta absoluta ${lin.filter((l) => /[A-Za-z]:\\/.test(l)).length} (P15)`);
    console.log(`     arranques por versión: ${Object.entries(vers).map(([v, ds]) => `v${v}×${ds.length} (${[...new Set(ds)].join(',')})`).join(' · ') || 'ninguno'}`);
    console.log(`     códigos: ${JSON.stringify(agrupa(lin.map((l) => (/PS-\d{4}/.exec(l) || [''])[0]).filter(Boolean)))}`);
    console.log('     por día: ' + Object.entries(agrupa(fechas.map((f) => f.slice(0, 10)))).map(([d, n]) => `${d}:${n}`).join(' '));
    console.log('     líneas (rutas ocultas):');
    for (const l of lin.slice(0, 60)) console.log('       ' + l.replace(/[A-Za-z]:\\.*$/g, '<ruta>').slice(0, 170));
    if (lin.length > 60) console.log(`       … y ${lin.length - 60} más`);
  }

  // ============================================================== 10. VECINOS
  console.log('\n=== 10. CARPETAS VECINAS (solo nombres/tamaños) ===');
  for (const d of ['panorama-app-safety-backups', 'panorama-app-config']) {
    const p = path.join(APPDATA, d);
    if (!fs.existsSync(p)) { console.log(`  %APPDATA%\\${d}: no existe`); continue; }
    const t = arbol(p);
    console.log(`  %APPDATA%\\${d}: ${t.archivos.length} archivos (${t.archivos.map((x) => x.rel + ' ' + x.size + ' B').join(', ')})`);
  }

  // ============================================================== CIERRE
  R.db.close(); V.db.close();
  const T1 = arbol(P10);
  const H1 = { arbol: huella(T1), p10: shaF(BD_P10), viva: shaF(BD_VIVA), loc: shaF(LOC) };
  const igual = H1.arbol === H0.arbol && H1.p10 === H0.p10 && H1.viva === H0.viva && H1.loc === H0.loc;
  console.log('\n=== CIERRE ===');
  console.log(`  árbol P10: ${H1.arbol === H0.arbol ? 'IDÉNTICO' : '*** CAMBIÓ ***'} (${T1.archivos.length} arch) · BD residual ${H1.p10 === H0.p10 ? 'IDÉNTICA' : '*** CAMBIÓ ***'}` +
    ` · BD viva ${H1.viva === H0.viva ? 'IDÉNTICA' : '*** CAMBIÓ ***'} (${H1.viva.slice(0, 16)}) · location.json ${H1.loc === H0.loc ? 'IDÉNTICO' : '*** CAMBIÓ ***'}`);
  if (!igual) process.exitCode = 98;
})().catch((e) => { console.error('FALLO:', e); process.exitCode = 1; });
