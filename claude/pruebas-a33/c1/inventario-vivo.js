'use strict';
// ---------------------------------------------------------------------------
// C1 — INVENTARIO DE LOS DATOS REALES, ESTRICTAMENTE DE SOLO LECTURA.
//
// Qué hace: stat de todo, lectura de la BD viva a un Buffer (se abre EN MEMORIA
// con sql.js y jamás se exporta), lectura de cabeceras para saber si un archivo
// va cifrado, y hash de contenido solo entre archivos del mismo tamaño.
//
// Qué NO hace: escribir, renombrar, borrar, abrir una BD sobre disco, descifrar,
// ni imprimir nombres de proyecto, rutas de proyecto o contenido. Los proyectos
// salen por id numérico. Los CV y estado.json no se leen si van cifrados.
//
// Comprobaciones de cierre: hash de la BD viva y de la BD de P10, y número de
// entradas de primer nivel de la carpeta de datos, ANTES y DESPUÉS.
// Uso: node inventario-vivo.js
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const initSqlJs = require(path.join(PROJ, 'node_modules', 'sql.js'));
const GUARDIA = require(path.join(__dirname, '..', 'comun', 'guardia-rutas.js'));

const LECT = GUARDIA.leerUbicacionReal({});
if (LECT.estado !== 'ok') { console.error('location.json ' + LECT.estado + ': ' + LECT.detalle); process.exit(99); }
const UD = LECT.ruta;
const APPDATA = process.env.APPDATA;
const P10 = path.join(APPDATA, 'panorama-app');
const SEG = path.join(APPDATA, 'panorama-app-safety-backups');
const BD = path.join(UD, 'panorama.sqlite3');
const BD_P10 = path.join(P10, 'panorama.sqlite3');

const shaBuf = (b) => crypto.createHash('sha256').update(b).digest('hex');
const shaF = (f) => { try { return shaBuf(fs.readFileSync(f)).toUpperCase(); } catch (e) { return 'NO-EXISTE'; } };
const mb = (b) => (b / 1048576).toFixed(2) + ' MB';
const dia = (ms) => (Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString().slice(0, 10) : '-');
const hora = (ms) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ');
const ls = (d) => { try { return fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return []; } };
function archivos(d) {
  const out = [];
  const rec = (x) => { for (const e of ls(x)) { const p = path.join(x, e.name); if (e.isDirectory()) rec(p); else { try { const s = fs.statSync(p); out.push({ p, rel: path.relative(d, p), size: s.size, mtime: s.mtimeMs, birth: s.birthtimeMs }); } catch (er) {} } } };
  rec(d); return out;
}
const suma = (xs) => xs.reduce((a, x) => a + x.size, 0);
const ENV = /^\s*\{\s*"panoramaEncrypted"\s*:\s*1/;
function cabecera(p) { const fd = fs.openSync(p, 'r'); try { const b = Buffer.alloc(64); const n = fs.readSync(fd, b, 0, 64, 0); return b.slice(0, n).toString('utf8'); } finally { fs.closeSync(fd); } }
const esDesktopIni = (p) => /(^|[\\/])desktop\.ini$/i.test(p);
function slugify(s) {
  return (String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'proyecto');
}
const tsNombre = (n) => { const m = /^backup_(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/.exec(n); return m ? Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`) : null; };

async function abrirEnMemoria(ruta) {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(PROJ, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')) });
  const buf = fs.readFileSync(ruta);
  const db = new SQL.Database(new Uint8Array(buf));
  const all = (q, p) => { const st = db.prepare(q); st.bind(p || []); const r = []; while (st.step()) r.push(st.getAsObject()); st.free(); return r; };
  return { db, all, size: buf.length };
}

(async () => {
  const H0 = { bd: shaF(BD), p10: shaF(BD_P10), nTop: ls(UD).length };
  console.log('C1 — INVENTARIO VIVO (solo lectura)');
  console.log('  carpeta de datos: ' + UD + '   [clave ' + LECT.clave + ']');
  console.log('  BD viva ANTES:    ' + H0.bd + '  · entradas de primer nivel: ' + H0.nTop);
  const V = await abrirEnMemoria(BD);
  const proyectos = V.all('SELECT id, name, partition_name, backup_dir, kind FROM projects ORDER BY id');
  const seg = V.all("SELECT value FROM app_meta WHERE key='security_enabled'");
  console.log(`  proyectos: ${proyectos.length} · security_enabled=${seg.length ? seg[0].value : '(sin clave)'}`);

  const todo = archivos(UD);
  const ajenos = todo.filter((x) => esDesktopIni(x.rel));
  console.log(`  archivos: ${todo.length} (${mb(suma(todo))}) · de ellos desktop.ini (ajenos a la app): ${ajenos.length}` +
    (ajenos.length ? ` creados ${hora(Math.min(...ajenos.map((x) => x.birth)))} .. ${hora(Math.max(...ajenos.map((x) => x.birth)))}` : ''));

  // --- 1. clases por patrón ------------------------------------------------
  const CLASES = [
    ['BD viva', (r) => r === 'panorama.sqlite3'],
    ['testigo .gen', (r) => r === 'panorama.sqlite3.gen'],
    ['.sqlite3 .tmp-fallido-', (r) => /^panorama\.sqlite3(\.gen)?\.tmp-fallido-/.test(r)],
    ['.sqlite3 .tmp-huerfano-', (r) => /^panorama\.sqlite3(\.gen)?\.tmp-huerfano-/.test(r)],
    ['.sqlite3 .tmp- suelto', (r) => /^panorama\.sqlite3(\.gen)?\.tmp-/.test(r)],
    ['.gen apartado', (r) => /^panorama\.sqlite3\.gen\.(interrumpido|creacion-fallida|bootstrap-fallido)-/.test(r)],
    ['otro panorama.sqlite3.*', (r) => /^panorama\.sqlite3\./.test(r)],
    ['.panorama-acciones', (r) => r.startsWith('.panorama-acciones' + path.sep)],
    ['.panorama-borrados', (r) => r.startsWith('.panorama-borrados' + path.sep)],
    ['.panorama-restauraciones', (r) => r.startsWith('.panorama-restauraciones' + path.sep)],
    ['.panorama-rekey', (r) => r.startsWith('.panorama-rekey' + path.sep)],
    ['.panorama-lock.json', (r) => r === '.panorama-lock.json'],
    ['sonda .panorama-write-check-', (r) => /^\.panorama-write-check-/.test(r)],
    ['tmp de acción (.tmp-<w>-<id>)', (r) => /\.tmp-[0-9a-f]{32}-[0-9a-f]{32}$/.test(r)],
    ['.old-<id> de acción', (r) => /\.old-[0-9a-f]{32}$/.test(r)],
    ['.escribiendo-', (r) => /\.escribiendo-\d+-\d+$/.test(r)],
    ['rescate-restauracion-*', (r) => /(^|[\\/])rescate-restauracion-/.test(r)],
    ['backups/<slug>/backup_*.json', (r) => /^backups[\\/][^\\/]+[\\/]backup_.*\.json$/i.test(r)],
    ['backups/.../reuniones/*', (r) => /^backups[\\/][^\\/]+[\\/]reuniones[\\/]/.test(r)],
    ['backups/.../estado.json', (r) => /^backups[\\/][^\\/]+[\\/]evaluacion-candidatos[\\/]estado\.json$/.test(r)],
    ['backups/.../cv/*', (r) => /^backups[\\/][^\\/]+[\\/]evaluacion-candidatos[\\/]cv[\\/]/.test(r)],
    ['projects/<id>/*', (r) => /^projects[\\/]/.test(r)],
    ['Partitions/*', (r) => /^Partitions[\\/]/.test(r)],
    ['app.asar.bak-* (C2)', (r) => /^app\.asar\.bak-/.test(r)],
    ['patch-pending-*.asar', (r) => /^patch-pending-.*\.asar$/.test(r)],
    ['.asar suelto (C2)', (r) => /^[^\\/]+\.asar$/.test(r)],
    ['app.log / patch-log', (r) => /^(app\.log(\.1)?|patch-log\.txt(\.1)?)$/.test(r)],
    ['apply-patch-helper.js', (r) => r === 'apply-patch-helper.js'],
    ['perfil Chromium (raíz)', () => true],
  ];
  const porClase = new Map();
  for (const x of todo) {
    if (esDesktopIni(x.rel)) continue;
    const c = CLASES.find(([, f]) => f(x.rel))[0];
    const t = porClase.get(c) || { n: 0, b: 0, min: Infinity, max: 0 };
    t.n++; t.b += x.size; t.min = Math.min(t.min, x.mtime); t.max = Math.max(t.max, x.mtime);
    porClase.set(c, t);
  }
  console.log('\n=== 1. carpeta de datos por clase (sin desktop.ini) ===');
  for (const [c] of CLASES) {
    const t = porClase.get(c);
    console.log(`  ${c.padEnd(34)} ${String(t ? t.n : 0).padStart(5)} arch ${mb(t ? t.b : 0).padStart(11)}  ${t ? dia(t.min) + ' .. ' + dia(t.max) : ''}`);
  }
  const dirsPanorama = ls(UD).filter((e) => e.isDirectory() && e.name.startsWith('.panorama-')).map((e) => e.name);
  console.log('  carpetas .panorama-* presentes: ' + JSON.stringify(dirsPanorama));

  // --- 2. backups: archivo <-> fila ----------------------------------------
  console.log('\n=== 2. backups: archivo <-> fila ===');
  const T = { filas: 0, arch: 0, sin: 0, bSin: 0, cif: 0, pla: 0, ant: 0, inter: 0, post: 0, filaSin: 0, tam: 0 };
  const todosBk = [];
  const huerf = new Set();
  for (const p of proyectos) {
    const slug = p.backup_dir || `${p.id}-${slugify(p.name)}`;
    const dir = path.join(UD, 'backups', slug);
    const filas = V.all('SELECT created_at, size, file_path, encrypted FROM backups WHERE project_id=? ORDER BY created_at', [p.id]);
    const porN = new Map(filas.filter((f) => f.file_path).map((f) => [String(f.file_path).toLowerCase(), f]));
    const tF = filas.map((f) => Date.parse(f.created_at));
    const arch = ls(dir).filter((e) => e.isFile() && /^backup_.*\.json$/i.test(e.name));
    let sin = 0, bSin = 0, cif = 0, pla = 0, ant = 0, inter = 0, post = 0, tam = 0;
    const vistos = new Set();
    for (const e of arch) {
      const abs = path.join(dir, e.name); const st = fs.statSync(abs);
      todosBk.push({ abs, size: st.size });
      const f = porN.get(e.name.toLowerCase());
      if (f) { vistos.add(e.name.toLowerCase()); if (!f.encrypted && f.size !== st.size) tam++; continue; }
      sin++; bSin += st.size; huerf.add(abs);
      if (ENV.test(cabecera(abs))) cif++; else pla++;
      const t = tsNombre(e.name);
      if (t !== null && tF.length) { if (t < Math.min(...tF)) ant++; else if (t > Math.max(...tF)) post++; else inter++; }
    }
    const filaSin = filas.filter((f) => f.file_path && !vistos.has(String(f.file_path).toLowerCase())).length;
    Object.assign(T, { filas: T.filas + filas.length, arch: T.arch + arch.length, sin: T.sin + sin, bSin: T.bSin + bSin, cif: T.cif + cif, pla: T.pla + pla,
      ant: T.ant + ant, inter: T.inter + inter, post: T.post + post, filaSin: T.filaSin + filaSin, tam: T.tam + tam });
    if (arch.length || filas.length) {
      console.log(`  id ${String(p.id).padStart(3)}: filas ${String(filas.length).padStart(2)} · archivos ${String(arch.length).padStart(3)} · SIN fila ${String(sin).padStart(3)} ${mb(bSin).padStart(9)}` +
        (sin ? ` (cifrados ${cif}, en claro ${pla}; anteriores ${ant}, intercalados ${inter}, posteriores ${post})` : '') +
        (filaSin ? ` · filas SIN archivo ${filaSin}` : ''));
    }
  }
  console.log(`  TOTAL: filas ${T.filas} · archivos ${T.arch} · SIN fila ${T.sin} (${mb(T.bSin)}) · cifrados ${T.cif} · en claro ${T.pla}` +
    ` · anteriores ${T.ant} · intercalados ${T.inter} · posteriores ${T.post} · filas SIN archivo ${T.filaSin} · tamaño distinto ${T.tam}`);
  console.log('  proyectos por encima de 15 filas: ' + proyectos.filter((p) => V.all('SELECT COUNT(*) c FROM backups WHERE project_id=?', [p.id])[0].c > 15).length);
  const porTam = new Map();
  for (const a of todosBk) { if (!porTam.has(a.size)) porTam.set(a.size, []); porTam.get(a.size).push(a); }
  let dup = 0;
  for (const [, g] of porTam) { if (g.length < 2) continue; const hs = new Map(); for (const a of g) { const h = shaF(a.abs); hs.set(h, (hs.get(h) || 0) + 1); } for (const [, n] of hs) if (n > 1) dup += n - 1; }
  console.log('  copias idénticas sobrantes (por contenido): ' + dup);
  const legado = V.all("SELECT COUNT(*) c FROM backups WHERE (file_path IS NULL OR file_path='') AND payload IS NOT NULL AND payload!=''")[0].c;
  console.log('  filas de backup con contenido en línea (legado sin migrar): ' + legado);

  // --- 3. filas y carpetas de proyectos que ya no existen ------------------
  console.log('\n=== 3. restos de proyectos borrados ===');
  const ids = new Set(proyectos.map((p) => String(p.id)));
  for (const t of ['backups', 'meeting_preps', 'candidate_evals']) {
    const n = V.all(`SELECT COUNT(*) c FROM ${t} WHERE project_id NOT IN (SELECT id FROM projects)`)[0].c;
    console.log(`  filas de ${t.padEnd(16)} sin proyecto: ${n}`);
  }
  const slugs = new Set(proyectos.map((p) => String(p.backup_dir || `${p.id}-${slugify(p.name)}`).toLowerCase()));
  const bkSin = ls(path.join(UD, 'backups')).filter((e) => e.isDirectory() && !slugs.has(e.name.toLowerCase()));
  const pjSin = ls(path.join(UD, 'projects')).filter((e) => e.isDirectory() && !ids.has(e.name));
  const desc = (d) => { const a = archivos(d); return `${a.length} arch (${a.filter((x) => esDesktopIni(x.rel)).length} desktop.ini), ${mb(suma(a))}`; };
  console.log(`  backups/<slug> sin proyecto: ${bkSin.length}` + (bkSin.length ? ' → ' + bkSin.map((e) => `id ${e.name.split('-')[0]}: ${desc(path.join(UD, 'backups', e.name))}`).join('; ') : ''));
  console.log(`  projects/<id> sin proyecto:  ${pjSin.length}` + (pjSin.length ? ' → ' + pjSin.map((e) => `id ${e.name}: ${desc(path.join(UD, 'projects', e.name))}`).join('; ') : ''));
  const partViva = new Set(proyectos.map((p) => String(p.partition_name || '').replace(/^persist:/, '').toLowerCase()));
  const parts = ls(path.join(UD, 'Partitions')).filter((e) => e.isDirectory());
  let pv = { n: 0, b: 0, c: 0 }, ps = { n: 0, b: 0, c: 0, max: 0 };
  const cache = (rel) => /^(Cache|Code Cache|GPUCache|DawnCache|DawnGraphiteCache|DawnWebGPUCache|Shared Dictionary|Service Worker)([\\/]|$)/.test(rel);
  for (const e of parts) {
    const a = archivos(path.join(UD, 'Partitions', e.name)).filter((x) => !esDesktopIni(x.rel));
    const t = partViva.has(e.name.toLowerCase()) ? pv : ps;
    t.n++; t.b += suma(a); t.c += suma(a.filter((x) => cache(x.rel)));
    if (t === ps) t.max = Math.max(t.max, ...a.map((x) => x.mtime));
  }
  console.log(`  Partitions: ${parts.length} carpetas · VIVAS ${pv.n} (${mb(pv.b)}, de ello caché ${mb(pv.c)}) · SIN proyecto ${ps.n} (${mb(ps.b)}, de ello caché ${mb(ps.c)}, último cambio ${dia(ps.max)})`);
  console.log(`  proyectos vivos sin carpeta de partición: ${proyectos.filter((p) => !parts.some((e) => e.name.toLowerCase() === String(p.partition_name || '').replace(/^persist:/, '').toLowerCase())).length}`);

  // --- 4. reuniones / evaluación / CV -------------------------------------
  console.log('\n=== 4. reuniones, evaluación y CV ===');
  let rA = 0, rS = 0, eA = 0, eSin = 0, eFS = 0, eCif = 0, cv = 0, cvB = 0, cvRef = 0, cvNo = 0, cvND = 0;
  for (const p of proyectos) {
    const base = path.join(UD, 'backups', p.backup_dir || `${p.id}-${slugify(p.name)}`);
    const setR = new Set(V.all('SELECT file_path FROM meeting_preps WHERE project_id=?', [p.id]).map((f) => String(f.file_path).toLowerCase()));
    const ar = ls(path.join(base, 'reuniones')).filter((e) => e.isFile() && /^reunion_.*\.json$/i.test(e.name));
    rA += ar.length; rS += ar.filter((e) => !setR.has(e.name.toLowerCase())).length;
    const fe = V.all('SELECT encrypted FROM candidate_evals WHERE project_id=?', [p.id])[0];
    const est = path.join(base, 'evaluacion-candidatos', 'estado.json');
    const hay = fs.existsSync(est);
    if (hay) eA++; if (hay && !fe) eSin++; if (fe && !hay) eFS++;
    const cvs = ls(path.join(base, 'evaluacion-candidatos', 'cv')).filter((e) => e.isFile() && !esDesktopIni(e.name));
    cv += cvs.length; cvB += cvs.reduce((a, e) => a + fs.statSync(path.join(base, 'evaluacion-candidatos', 'cv', e.name)).size, 0);
    let refs = null;
    if (hay) {
      const cab = cabecera(est);
      if (ENV.test(cab)) eCif++;
      else { try { const s = JSON.parse(fs.readFileSync(est, 'utf8')); refs = new Set((s.evaluaciones || []).map((x) => x && x.cvStoredName).filter(Boolean).map((x) => String(x).toLowerCase())); } catch (er) { refs = null; } }
    }
    if (!cvs.length) continue;
    if (refs === null) { cvND += cvs.length; continue; }
    for (const e of cvs) if (refs.has(e.name.toLowerCase())) cvRef++; else cvNo++;
  }
  console.log(`  reuniones: ${rA} archivos · sin fila ${rS}`);
  console.log(`  estado.json: ${eA} · sin fila ${eSin} · filas sin archivo ${eFS} · cifrados ${eCif}`);
  console.log(`  CV: ${cv} archivos (${mb(cvB)}) · referenciados ${cvRef} · NO referenciados ${cvNo} · NO DECIDIBLES sin clave ${cvND}`);

  // --- 5. fuera de la carpeta de datos ------------------------------------
  console.log('\n=== 5. fuera de la carpeta de datos ===');
  const aSeg = archivos(SEG);
  console.log(`  copias de emergencia locales: ${fs.existsSync(SEG) ? aSeg.length + ' archivos, ' + mb(suma(aSeg)) : '(la carpeta no existe)'}`);
  if (fs.existsSync(P10)) {
    const a = archivos(P10);
    const g = (re) => a.filter((x) => re.test(x.rel));
    const L = await abrirEnMemoria(BD_P10);
    const bl = g(/^backups[\\/][^\\/]+[\\/]backup_.*\.json$/i);
    const setL = new Set(L.all("SELECT file_path FROM backups WHERE file_path!=''").map((r) => String(r.file_path).toLowerCase()));
    const nombresG = new Set(archivos(path.join(UD, 'backups')).map((x) => path.basename(x.p).toLowerCase()));
    console.log(`  P10 (%APPDATA%\\panorama-app): ${a.length} archivos, ${mb(suma(a))}`);
    console.log(`    .asar: ${mb(suma(g(/^[^\\/]*\.asar/)))} · Partitions: ${mb(suma(g(/^Partitions[\\/]/)))} · backups: ${bl.length} (${mb(suma(bl))}) · caché Chromium raíz: ${mb(suma(g(/^(Cache|Code Cache|GPUCache|Dawn\w*Cache)[\\/]/)))}`);
    console.log(`    su BD: ${shaF(BD_P10).slice(0, 16)} ${L.size} B · proyectos ${L.all('SELECT COUNT(*) c FROM projects')[0].c} · A3.3: ${L.all("SELECT COUNT(*) c FROM app_meta WHERE key='db_commit_id'")[0].c ? 'sí' : 'no'}`);
    console.log(`    sus backups con fila en SU BD: ${bl.filter((x) => setL.has(path.basename(x.p).toLowerCase())).length}/${bl.length} · con el mismo nombre en G: ${bl.filter((x) => nombresG.has(path.basename(x.p).toLowerCase())).length} · cifrados ${bl.filter((x) => ENV.test(cabecera(x.p))).length}`);
    const la = (() => { try { return fs.readFileSync(path.join(P10, 'app.log'), 'utf8').split(/\r?\n/).filter(Boolean); } catch (e) { return []; } })();
    console.log(`    su app.log: ${la.length} líneas · ${la.length ? la[0].slice(1, 11) + ' .. ' + la[la.length - 1].slice(1, 11) : '-'} · códigos ${JSON.stringify([...new Set(la.map((l) => (/PS-\d{4}/.exec(l) || [''])[0]).filter(Boolean))])}`);
    L.db.close();
  }

  V.db.close();
  const H1 = { bd: shaF(BD), p10: shaF(BD_P10), nTop: ls(UD).length };
  console.log('\n  BD viva DESPUÉS: ' + H1.bd + (H1.bd === H0.bd ? '  IDÉNTICA' : '  *** CAMBIÓ ***'));
  console.log('  BD de P10:       ' + (H1.p10 === H0.p10 ? 'IDÉNTICA' : '*** CAMBIÓ ***') + ' · entradas de primer nivel: ' + H1.nTop + (H1.nTop === H0.nTop ? ' (sin cambios)' : ' *** CAMBIÓ ***'));
  if (H1.bd !== H0.bd || H1.p10 !== H0.p10 || H1.nTop !== H0.nTop) process.exitCode = 98;
})().catch((e) => { console.error('FALLO:', e); process.exitCode = 1; });
