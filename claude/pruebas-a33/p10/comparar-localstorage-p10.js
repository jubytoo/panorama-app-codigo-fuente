'use strict';
// ---------------------------------------------------------------------------
// P10 — compara el localStorage de las particiones del RESIDUO con el de las
// particiones VIVAS de G:, a partir de los resultados de
// `real-run/p10-localstorage.js` (hashes y estructura, nunca valores).
//
// Mide, sin ver ningún dato:
//   - si el estado de cada proyecto del residuo es IDÉNTICO a alguno de G:;
//   - qué campos coinciden con su pareja probable (misma partición, mismo
//     nombre de proyecto, o el más parecido de todos);
//   - cuántos ELEMENTOS (entradas de listas y pares de objetos) del residuo no
//     aparecen idénticos en NINGUNA partición viva, por campo;
//   - lo mismo para el historial de cambios.
// Las BD se leen a un Buffer y se abren EN MEMORIA solo para saber qué
// partición es de qué proyecto. Escrituras trucadas: lanzan.
// Uso: node p10/comparar-localstorage-p10.js <sandbox>
// ---------------------------------------------------------------------------
const fs = require('fs');
const path = require('path');
for (const k of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'renameSync', 'unlinkSync', 'rmSync', 'rmdirSync', 'copyFileSync', 'cpSync', 'truncateSync', 'utimesSync']) {
  fs[k] = () => { throw new Error('P10: escritura PROHIBIDA (' + k + ')'); };
}
const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const initSqlJs = require(path.join(PROJ, 'node_modules', 'sql.js'));
const GUARDIA = require(path.join(__dirname, '..', 'comun', 'guardia-rutas.js'));
const SB = process.argv[2];
if (!SB || !/_a33-p10/i.test(SB)) { console.error('sandbox no marcado'); process.exit(2); }
const LECT = GUARDIA.leerUbicacionReal({});
if (LECT.estado !== 'ok') process.exit(99);
const leer = (n) => JSON.parse(fs.readFileSync(path.join(SB, `resultado-${n}.json`), 'utf8'));

const tipoClave = (patron) => (/dt-directorio-talento-state/.test(patron) ? 'directorio'
  : /panorama-servicio-full__proj-/.test(patron) ? 'estado'
    : /panorama-servicio-full__/.test(patron) ? 'estado-antiguo'
      : /panorama-servicio-historial__/.test(patron) ? 'historial' : null);

(async () => {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(PROJ, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')) });
  const abrir = (p) => new SQL.Database(new Uint8Array(fs.readFileSync(p)));
  const filas = (db, q) => { const r = db.exec(q); return r.length ? r[0].values.map((v) => Object.fromEntries(r[0].columns.map((c, i) => [c, v[i]]))) : []; };
  const dR = abrir(path.join(process.env.APPDATA, 'panorama-app', 'panorama.sqlite3'));
  const dV = abrir(path.join(LECT.ruta, 'panorama.sqlite3'));
  const pR = filas(dR, 'SELECT id, name, partition_name FROM projects ORDER BY id');
  const pV = filas(dV, 'SELECT id, name, partition_name FROM projects ORDER BY id');
  dR.close(); dV.close();
  const norm = (s) => String(s || '').replace(/^persist:/, '').toLowerCase();
  const etiqueta = (nombre) => {
    const n = norm(nombre);
    const i = pR.findIndex((p) => norm(p.partition_name) === n);
    const v = pV.find((p) => norm(p.partition_name) === n);
    if (i >= 0) return `P${i + 1}`;
    if (v) return `V${v.id}`;
    return 'G-huérfana';
  };
  const R = leer('res');
  const V = leer('viva');
  console.log(`Electron ${R.electron} · residuo: ${R.particiones.length - 1} particiones + raíz · G:: ${V.particiones.length - 1} particiones`);
  const errores = [...R.particiones, ...V.particiones].filter((p) => p.error);
  if (errores.length) console.log('  ERRORES al leer: ' + errores.map((p) => etiqueta(p.nombre) + ': ' + p.error).join(' | '));

  const entradas = (p) => p.claves.filter((c) => c.estado && c.estado.campos).map((c) => ({ ...c, tipo: tipoClave(c.patron) }));
  const principal = (es) => es.find((e) => e.tipo === 'estado') || es.find((e) => e.tipo === 'directorio') || es.find((e) => e.tipo === 'estado-antiguo') || null;
  const vivas = V.particiones.filter((p) => p.nombre !== '(raíz)').map((p) => {
    const v = pV.find((x) => norm(x.partition_name) === norm(p.nombre));
    const es = entradas(p);
    return { p, et: etiqueta(p.nombre), vivaId: v ? v.id : null, nombre: v ? v.name : null, es, est: principal(es) };
  });
  // Universo de G:: todos los hashes de valor y de elemento, por tipo de clave y campo.
  const U = { sha: new Set(), elems: new Map(), campoSha: new Map(), items: new Map(), props: new Map() };
  const conj = (m, k) => { if (!m.has(k)) m.set(k, new Set()); return m.get(k); };
  for (const v of vivas) for (const e of v.es) {
    U.sha.add(e.sha);
    const grupo = e.tipo === 'historial' ? 'historial' : 'estado';
    for (const [k, c] of Object.entries(e.estado.campos)) {
      const kk = grupo + '|' + k;
      for (const h of c.elems || []) conj(U.elems, kk).add(h);
      conj(U.campoSha, kk).add(c.sha);
      if (!U.items.has(kk)) U.items.set(kk, []);
      for (const ps of c.props || []) { U.items.get(kk).push(new Set(ps)); for (const h of ps) conj(U.props, kk).add(h); }
    }
  }
  // Cada elemento del residuo SIN copia idéntica se empareja con la entrada viva
  // (mismo campo, cualquier partición) que comparte más propiedades:
  //   ≥ 50 % de sus propiedades iguales -> «misma entrada, modificada»
  //   algo en común                     -> «parecido débil»
  //   nada en común                     -> «SIN equivalente»
  const ausentes = (e) => {
    const grupo = e.tipo === 'historial' ? 'historial' : 'estado';
    const n = { tot: 0, ident: 0, modif: 0, debil: 0, sin: 0, props: 0, propsFuera: 0 };
    const porCampo = []; const escalaresFuera = [];
    for (const [k, c] of Object.entries(e.estado.campos)) {
      const kk = grupo + '|' + k;
      if (c.elems) {
        const u = U.elems.get(kk) || new Set();
        const vivos = U.items.get(kk) || [];
        const up = U.props.get(kk) || new Set();
        const f = { modif: 0, debil: 0, sin: 0 };
        c.elems.forEach((h, i) => {
          n.tot++;
          const ps = (c.props || [])[i] || [h];
          n.props += ps.length; n.propsFuera += ps.filter((x) => !up.has(x)).length;
          if (u.has(h)) { n.ident++; return; }
          let mejor = 0;
          for (const s of vivos) { let comun = 0; for (const x of ps) if (s.has(x)) comun++; mejor = Math.max(mejor, comun / ps.length); }
          if (mejor >= 0.5) { n.modif++; f.modif++; } else if (mejor > 0) { n.debil++; f.debil++; } else { n.sin++; f.sin++; }
        });
        if (f.modif + f.debil + f.sin) porCampo.push(`${k}: ${f.modif} modif. / ${f.debil} débil / ${f.sin} sin equiv. (de ${c.elems.length})`);
      } else if (!(U.campoSha.get(kk) || new Set()).has(c.sha) && !/lastSave|savedAt|lastSavedDate/i.test(k)) {
        escalaresFuera.push(k);
      }
    }
    return { n, porCampo, escalaresFuera };
  };
  const comparar = (a, b) => {
    const ka = Object.keys(a.estado.campos), kb = Object.keys(b.estado.campos);
    const todos = [...new Set([...ka, ...kb])];
    const iguales = todos.filter((k) => a.estado.campos[k] && b.estado.campos[k] && a.estado.campos[k].sha === b.estado.campos[k].sha);
    const distintos = todos.filter((k) => a.estado.campos[k] && b.estado.campos[k] && a.estado.campos[k].sha !== b.estado.campos[k].sha);
    const detalle = distintos.map((k) => {
      const x = a.estado.campos[k], y = b.estado.campos[k];
      if (x.elems && y.elems) { const sy = new Set(y.elems); return `${k}(${x.tam}→${y.tam}, ${x.elems.filter((h) => !sy.has(h)).length} del residuo no están)`; }
      return `${k}(${x.tam}→${y.tam})`;
    });
    return { iguales: iguales.length, total: todos.length, detalle, soloA: ka.filter((k) => !b.estado.campos[k]), soloB: kb.filter((k) => !a.estado.campos[k]) };
  };

  console.log('\n=== RAÍZ DEL RESIDUO (sesión por defecto) ===');
  const raiz = R.particiones.find((p) => p.nombre === '(raíz)');
  console.log(`  ${raiz.claves.length} claves${raiz.claves.length ? ': ' + raiz.claves.map((c) => `${c.patron} (${c.len} car.)`).join(' · ') : ''}`);

  console.log('\n=== PARTICIONES DEL RESIDUO ===');
  const resParts = R.particiones.filter((p) => p.nombre !== '(raíz)').sort((a, b) => etiqueta(a.nombre).localeCompare(etiqueta(b.nombre), 'es', { numeric: true }));
  for (const p of resParts) {
    const et = etiqueta(p.nombre);
    const r = pR[Number(et.slice(1)) - 1];
    const es = entradas(p);
    const est = principal(es);
    const admin = p.claves.some((c) => /admin-backup-password/.test(c.patron));
    console.log(`  ${et} (residual id ${r.id}): ${p.claves.length} claves · ${es.map((e) => `${e.tipo} ${e.len} car.`).join(' · ') || 'sin estado'}${admin ? ' · contraseña de administración de backups: PRESENTE (no se lee)' : ''}`);
    for (const e of es) {
      const a = ausentes(e);
      console.log(`     ${e.tipo.padEnd(15)} idéntico en G:: ${U.sha.has(e.sha) ? 'SÍ' : 'no'} · elementos ${a.n.tot}: idénticos en alguna partición viva ${a.n.ident}, misma entrada modificada ${a.n.modif}, parecido débil ${a.n.debil}, SIN equivalente ${a.n.sin}` +
        ` · valores de propiedad que no aparecen en G:: ${a.n.propsFuera}/${a.n.props}` +
        (a.escalaresFuera.length ? ` · campos simples con valor que no aparece en G:: ${a.escalaresFuera.join(', ')}` : ''));
      for (const l of a.porCampo) console.log(`        ${l}`);
    }
    if (!est) continue;
    const misma = vivas.find((v) => norm(v.p.nombre) === norm(p.nombre));
    const mismoNombre = vivas.filter((v) => v.nombre && v.nombre === r.name && norm(v.p.nombre) !== norm(p.nombre));
    const cands = [];
    if (misma) cands.push(['misma partición en G:', misma]);
    for (const v of mismoNombre) cands.push(['proyecto vivo con el MISMO nombre', v]);
    let mejor = null;
    for (const v of vivas) { if (!v.est) continue; const c = comparar(est, v.est); if (!mejor || c.iguales > mejor.c.iguales) mejor = { v, c }; }
    if (mejor && !cands.some(([, v]) => v === mejor.v)) cands.push(['máximo parecido entre TODAS las vivas', mejor.v]);
    for (const [por, v] of cands) {
      if (!v.est) { console.log(`     ↔ ${por}: ${v.et}${v.vivaId ? ' (viva id ' + v.vivaId + ')' : ''} → SIN estado (${v.p.claves.length} claves)`); continue; }
      const c = comparar(est, v.est);
      console.log(`     ↔ ${por}: ${v.et}${v.vivaId ? ' (viva id ' + v.vivaId + ')' : ''} → campos iguales ${c.iguales}/${c.total}` +
        (c.detalle.length ? ` · distintos: ${c.detalle.join(', ')}` : '') +
        (c.soloA.length ? ` · solo en el residuo: ${c.soloA.join(', ')}` : '') + (c.soloB.length ? ` · solo en G:: ${c.soloB.join(', ')}` : ''));
    }
  }

  console.log('\n=== PARTICIONES VIVAS (G:) ===');
  for (const v of vivas.sort((a, b) => a.et.localeCompare(b.et, 'es', { numeric: true }))) {
    console.log(`  ${v.et.padEnd(10)} ${v.vivaId ? 'viva id ' + String(v.vivaId).padEnd(3) : 'SIN proyecto vivo'} · ${v.p.claves.length} claves · ${v.es.map((e) => `${e.tipo} ${e.len} car.`).join(' · ') || 'sin estado'}`);
  }
})().catch((e) => { console.error('FALLO:', e); process.exitCode = 1; });
