'use strict';
// Planta los TRES estados de E7 en el sandbox, como los habria dejado un corte,
// y deja en e7-esperado.json las huellas que el arranque real debe respetar.
//
//   A  delete NO confirmado, todo retirado        -> debe RESTAURAR
//   B  delete confirmado, sin cleanup             -> NO restaurar, purgar
//   C  destino reaparecido + cuarentena presente  -> NO-CLOBBER, fail-closed
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const arg = process.argv.find((a) => a.startsWith('--sandbox='));
if (!arg) { console.error('falta --sandbox='); process.exit(2); }
const SB = arg.slice('--sandbox='.length);
if (SB.toLowerCase().indexOf('bloque5\\sandbox-real') < 0) { console.error('sandbox inesperado: ' + SB); process.exit(99); }
const UD = path.join(SB, 'Roaming', 'panorama-app');
const BOR = path.join(UD, '.panorama-borrados');

const PROJ = 'C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1';
const initSqlJs = require(path.join(PROJ, 'node_modules', 'sql.js'));

function huella(dir) {
  if (!fs.existsSync(dir)) return 'NO-EXISTE';
  const out = [];
  const rec = (d, pre) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) rec(f, pre + e.name + '/');
      else out.push(pre + e.name + ':' + crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 10));
    }
  };
  rec(dir, '');
  return out.join('|');
}
function arbol(dir, n, etq) {
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < n; i++) fs.writeFileSync(path.join(dir, `f${i}.json`), `${etq}-${i}`, 'utf8');
  return dir;
}

(async () => {
  const SQL = await initSqlJs({ locateFile: (f) => path.join(PROJ, 'node_modules', 'sql.js', 'dist', f) });
  const bd = path.join(UD, 'panorama.sqlite3');
  const d = new SQL.Database(fs.readFileSync(bd));
  const commit = d.exec("SELECT value FROM app_meta WHERE key='db_commit_id'")[0].values[0][0];
  // El writer de ESTE equipo, tal como lo guarda la app.
  const cfg = path.join(SB, 'Roaming', 'panorama-app-config', 'installation-id');
  let writer = null;
  for (const c of [cfg, cfg + '.json', path.join(SB, 'Roaming', 'panorama-app-config', 'installation-id.json')]) {
    try { const t = fs.readFileSync(c, 'utf8').trim(); const m = t.match(/[0-9a-f]{32}/i); if (m) { writer = m[0]; break; } } catch (e) {}
  }
  if (!writer) {
    const r = d.exec("SELECT key FROM app_meta WHERE key LIKE 'acciones_%'");
    if (r.length) writer = String(r[0].values[0][0]).replace('acciones_', '');
  }
  if (!writer) { console.error('no se pudo determinar el writer de este equipo'); process.exit(3); }

  fs.mkdirSync(BOR, { recursive: true });
  const nuevoId = () => crypto.randomBytes(16).toString('hex');
  const journal = (aid, recursos, fase) => ({
    v: 1, action_id: aid, writer, tipo: 'borrar-proyecto', base_commit_id: commit,
    fase: fase || 'retirando', startedAt: '2026-09-15T00:00:00Z', recursos,
  });
  const esperado = {};

  // ---- A: no confirmado, todo retirado ------------------------------------
  {
    const aid = nuevoId();
    const origen = path.join(UD, 'backups', 'e7-A');
    const cuar = path.join(BOR, aid, 'r0');
    arbol(cuar, 3, 'A');
    const h = huella(cuar);
    fs.writeFileSync(path.join(BOR, aid + '.json'), JSON.stringify(
      journal(aid, [{ tipo: 'directorio', scope: 'subtree', origen, cuarentena: cuar, n_archivos: 3, bytes_totales: 12 }]), null, 2), 'utf8');
    esperado.A = { aid, origen, huella: h };
  }

  // ---- B: confirmado (marca presente), sin cleanup -----------------------
  {
    const aid = nuevoId();
    const origen = path.join(UD, 'backups', 'e7-B');
    const cuar = path.join(BOR, aid, 'r0');
    arbol(cuar, 2, 'B');
    fs.writeFileSync(path.join(BOR, aid + '.json'), JSON.stringify(
      journal(aid, [{ tipo: 'directorio', scope: 'subtree', origen, cuarentena: cuar, n_archivos: 2, bytes_totales: 8 }]), null, 2), 'utf8');
    // la marca de accion de ESTE writer declara el borrado como aplicado
    d.run('INSERT INTO app_meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      ['acciones_' + writer, JSON.stringify([aid])]);
    esperado.B = { aid, origen };
  }

  // ---- C: destino reaparecido + cuarentena presente ----------------------
  {
    const aid = nuevoId();
    const origen = path.join(UD, 'backups', 'e7-C');
    const cuar = path.join(BOR, aid, 'r0');
    arbol(cuar, 2, 'C-CUARENTENA');
    arbol(origen, 1, 'C-REAPARECIDO');
    fs.writeFileSync(path.join(BOR, aid + '.json'), JSON.stringify(
      journal(aid, [{ tipo: 'directorio', scope: 'subtree', origen, cuarentena: cuar, n_archivos: 2, bytes_totales: 8 }]), null, 2), 'utf8');
    esperado.C = { aid, origen, cuarentena: cuar, huellaReaparecido: huella(origen), huellaCuarentena: huella(cuar) };
  }

  const buf = Buffer.from(d.export()); d.close();
  fs.writeFileSync(bd, buf);
  // el .gen tiene que seguir cuadrando: se reescribe con el mismo commit.
  try {
    const g = JSON.parse(fs.readFileSync(bd + '.gen', 'utf8'));
    fs.writeFileSync(bd + '.gen', JSON.stringify(g), 'utf8');
  } catch (e) {}

  fs.writeFileSync(path.join(SB, 'e7-esperado.json'), JSON.stringify(esperado, null, 2), 'utf8');
  console.log('E7 plantado: writer=' + writer.slice(0, 8) + '… A=' + esperado.A.aid.slice(0, 8) +
    ' B=' + esperado.B.aid.slice(0, 8) + ' C=' + esperado.C.aid.slice(0, 8));
})();
