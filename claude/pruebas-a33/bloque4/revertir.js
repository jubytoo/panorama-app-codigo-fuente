'use strict';
// Genera main.js.PRE-CORRECCIONES revirtiendo EXACTAMENTE las cinco
// correcciones de esta ronda. No toca el main.js real.
const fs = require('fs');
const SRC = fs.readFileSync('C:\\Codigo Fuente PS\\panorama-app-codigo-fuente_1\\main.js', 'utf8');
let t = SRC; const hechas = [];
function rev(etq, nuevo, viejo) {
  if (t.indexOf(nuevo) < 0) { console.log('NO SE ENCONTRO: ' + etq); process.exit(1); }
  t = t.replace(nuevo, viejo); hechas.push(etq);
}

// --- 1. F3 borraba tmp+journal a ciegas ------------------------------------
rev('1 F3 partial-rename',
`  } catch (e) {
    const vuelta = resolverAccionPendiente(journal);
    if (!vuelta.ok) {
      seguridadEnEstadoInconsistente = vuelta.motivo + (vuelta.detalle ? ': ' + vuelta.detalle : '');
      return noAplicado(
        'No se pudo guardar el archivo y la vuelta atrás no se pudo completar. No se ha destruido nada: ' +
        'cierra la aplicación y revisa el registro antes de seguir.\\n\\nDetalle: ' + String((e && e.message) || e),
        false, { bloqueo: 'accion-no-demostrable' });
    }
    return noAplicado('No se pudo guardar el archivo: ' + String((e && e.message) || e), true);
  }`,
`  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (e2) {}
    try { fs.unlinkSync(journalAccionPath(actionId)); } catch (e2) {}
    return noAplicado('No se pudo guardar el archivo: ' + String((e && e.message) || e), true);
  }`);

// --- 2. marca corrupta = lista vacia ---------------------------------------
rev('2 marca corrupta',
`  if (v === null || v === undefined || v === '') return { ok: true, lista: [] };
  let a = null;
  try { a = JSON.parse(v); } catch (e) {
    return { ok: false, noDemostrable: true, motivo: \`la marca no es JSON válido (\${String((e && e.message) || e)})\` };
  }
  if (!Array.isArray(a) || !a.every((x) => typeof x === 'string')) {
    return { ok: false, noDemostrable: true, motivo: 'la marca no es una lista de identificadores' };
  }
  return { ok: true, lista: a };`,
`  if (!v) return { ok: true, lista: [] };
  try {
    const a = JSON.parse(v);
    return { ok: true, lista: Array.isArray(a) ? a.filter((x) => typeof x === 'string') : [] };
  } catch (e) { return { ok: true, lista: [] }; }`);

// --- 3. readdir EIO = carpeta vacia ----------------------------------------
rev('3 readdir EIO',
`    const cod = (e && e.code) || '';
    if (cod === 'ENOENT') return { ok: true, entradas: [] };
    return { ok: false, noVerificable: true, codigo: cod, motivo: String((e && e.message) || e) };`,
`    return { ok: true, entradas: [] };`);

// --- 4. cleanup del caso B sin verificar residuos --------------------------
rev('4 cleanup caso B',
`    const rOld = retirarResiduo(old, j.original_sha256);
    const rTmp = retirarResiduo(tmp, j.new_sha256);
    if (rOld !== 'retirado' || rTmp !== 'retirado') {
      return cerrar(
        'una acción aplicada dejó material que no se puede identificar como suyo',
        \`.old: \${rOld}, .tmp: \${rTmp}\`,
        { aplicada: true, clasificacion: 'residuo-no-demostrable' });
    }
    try { fs.unlinkSync(journalAccionPath(j.action_id)); } catch (e) {
      return cerrar('una acción aplicada quedó con su registro sin poder retirar',
        String((e && e.message) || e), { aplicada: true, clasificacion: 'residuo-no-demostrable' });
    }`,
`    retirarResiduo(old, j.original_sha256);
    retirarResiduo(tmp, j.new_sha256);
    try { fs.unlinkSync(journalAccionPath(j.action_id)); } catch (e) {}`);

// --- 5. modo derivado del disco -------------------------------------------
rev('5 modo derivado',
`    const ho = sha256DeArchivo(destino);
    if (ho.ilegible) throw new Error(\`no se pudo leer el archivo actual (\${ho.codigo})\`);
    if (ho.existe) { origSha = ho.sha; origSize = ho.size; modoReal = 'overwrite'; }
    else modoReal = 'nuevo';`,
`    if (modo === 'overwrite') {
      const ho = sha256DeArchivo(destino);
      if (ho.ilegible) throw new Error(\`no se pudo leer el archivo actual (\${ho.codigo})\`);
      if (ho.existe) { origSha = ho.sha; origSize = ho.size; }
    }`);

// y la marca "no-demostrable" que bloquea el rollback (parte de 2)
rev('2b marca no demostrable en recovery',
`  if (enMarca.estado === 'no-demostrable') {
    return cerrar('no se puede saber si un guardado pendiente llegó a aplicarse',
      enMarca.motivo, { clasificacion: 'accion-no-demostrable' });
  }

`, '');

// --- 6. validacion cerrada del journal ------------------------------------
{
  const i = t.indexOf('function leerJournalAccion(ruta) {');
  if (i < 0) { console.log('NO SE ENCONTRO leerJournalAccion'); process.exit(1); }
  let k = t.indexOf('{', i), prof = 0, fin = -1;
  for (let p = k; p < t.length; p++) {
    if (t[p] === '{') prof++;
    else if (t[p] === '}') { prof--; if (prof === 0) { fin = p; break; } }
  }
  const viejo = `function leerJournalAccion(ruta) {
  let j = null;
  try {
    j = JSON.parse(fs.readFileSync(ruta, 'utf8'));
  } catch (e) {
    return { clase: 'ilegible', ruta, motivo: String((e && e.message) || e) };
  }
  if (!j || typeof j !== 'object' || j.v !== ACCIONES_JOURNAL_V) {
    return { clase: 'desconocido', ruta, motivo: 'version' };
  }
  if (typeof j.action_id !== 'string' || typeof j.writer !== 'string' ||
      typeof j.destino !== 'string' || !j.destino) {
    return { clase: 'incompleto', ruta, motivo: 'faltan action_id / writer / destino' };
  }
  return { clase: 'valido', ruta, j };
}`;
  t = t.slice(0, i) + viejo + t.slice(fin + 1);
  hechas.push('6 validacion cerrada del journal');
}
// y el bloqueo de F-1 por journal propio inservible
rev('6b bloqueo por journal propio incompleto',
`  if (propios.inservibles && propios.inservibles.length) {
    const e0 = propios.inservibles[0];
    appLog(\`ERROR PS-2006 — hay un guardado propio cuyo registro está incompleto: \${path.basename(e0.ruta)} (\${e0.motivo})\`);
    return noAplicado(
      'Hay un guardado anterior de este equipo cuyo registro está incompleto y no se puede saber qué ' +
      'pasó con él. No se inicia ninguno nuevo: cierra la aplicación y revisa el registro.',
      false, { bloqueo: 'accion-no-demostrable' });
  }
`, '');

const dest = 'C:\\Users\\ADMIN~1.JLO\\AppData\\Local\\Temp\\claude\\C--Codigo-Fuente-PS\\e55d4471-ea3f-4279-b758-0366ccb6384c\\scratchpad\\bloque4\\main.js.PRE-CORRECCIONES';
fs.writeFileSync(dest, t, 'utf8');
console.log('revertidas ' + hechas.length + ': ' + hechas.join(', '));
